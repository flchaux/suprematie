# Architecture, simulation, réseau, performance

> Partie de la spécification. Index et liste des fichiers : [docs/SPEC.md](../SPEC.md).

## Pile technique

La simulation est écrite en Rust et compilée en WebAssembly. Tout le reste est en TypeScript.

| Couche | Technologie | Raison du choix |
| --- | --- | --- |
| Simulation | Rust compilé en WebAssembly (wasm-bindgen), dans un Web Worker | Même résultat au bit près dans tous les navigateurs et dans Node.js, vitesse proche d'un programme natif, pas de ramasse-miettes |
| Rendu 3D | Three.js, moteur WebGPU avec repli automatique sur WebGL2 | Bibliothèque 3D la plus utilisée sur le web, donc celle que Claude connaît le mieux |
| Interface | HTML et CSS avec Svelte, par-dessus le canvas | Menus, infobulles et statistiques plus simples à faire qu'avec un moteur de jeu |
| Réseau | WebSocket (bibliothèque ws) | Suffit pour le lockstep, fonctionne dans tous les navigateurs |
| Serveur | Node.js sur le VPS | Relais des ordres, lobby, bots, copie de référence de la partie avec le même fichier .wasm |
| Outils | Vite, Vitest, cargo test, Clippy, ESLint, Playwright | Compilation, tests, contrôle des règles, captures d'écran |

Options écartées :

- Unity et Unreal : leurs outils réseau sont faits pour la réplication client-serveur, et leur physique ne donne pas le même résultat sur deux machines.
- Bevy : le moteur est encore en version 0.x ([Bevy 0.20, octobre 2026](https://bevy.org/news/bevy-0-20/)), chaque version demande une migration et l'éditeur n'est pas encore livré.
- Simulation en TypeScript : le ramasse-miettes provoque des pauses et la vitesse est plus faible, ce qui pèse avec 8 joueurs et des bots.
- Version native : un peu plus rapide que WebAssembly, mais on perd la partie lancée depuis un lien.

## Architecture

Le dépôt contient trois parties qui partagent le même module de simulation : le client dans le navigateur, le serveur Node.js et la simulation compilée en WebAssembly.

&#91;embedded content: architecture · navigateur, serveur et flux réseau\]

Le navigateur et le serveur font tourner le même fichier sim.wasm. Seuls les ordres, les hash d'état et l'état complet envoyé à un joueur qui arrive passent par le réseau.

Déroulement d'un tick :

1. Le joueur donne un ordre, et l'interface l'envoie au relais.
2. Le relais regroupe les ordres de tous les joueurs pour le tick N+3 et les renvoie à tous.
3. Chaque Worker applique les ordres du tick, fait avancer la simulation et calcule le hash.
4. Le Worker transmet le tampon de rendu au thread principal, sans copie.
5. Le rendu interpole entre les deux derniers ticks pour afficher 60 images par seconde.

Organisation du dépôt :

```text
/
├── sim/              Rust : simulation déterministe, compilée en sim.wasm
├── packages/
│   ├── shared/       TypeScript : types des ordres, protocole réseau
│   ├── client/       TypeScript : rendu Three.js, interface Svelte, Worker
│   └── server/       TypeScript : relais, lobby, bots, copie de référence
├── assets/models/    descriptions des unités et bâtiments (kit de pièces)
├── tools/
│   ├── viewer/       visualiseur de modèles et captures
│   └── bench/        banc de performance
├── docs/SPEC.md      index de cette spécification (un fichier par thème dans docs/spec/)
└── CLAUDE.md         règles pour Claude Code
```

## Simulation déterministe

La simulation doit produire exactement le même état, au bit près, sur toutes les machines. Le moindre écart désynchronise la partie. Ces règles sont obligatoires dans tout le dossier `sim/` :

1. Pas de temps fixe : 20 ticks par seconde. L'heure réelle n'entre jamais dans la simulation.
2. Positions, vitesses, quantités et points de vie en entiers ou en virgule fixe. Aucun nombre à virgule flottante dans l'état de la partie.
3. Trigonométrie et racines carrées par tables précalculées ou par fonctions en entiers.
4. Un seul générateur aléatoire, initialisé avec une graine partagée en début de partie. Son état fait partie de l'état de la partie.
5. Pas de HashMap ni de HashSet parcourus : tableaux indexés, ou BTreeMap quand un ordre trié est nécessaire.
6. Les entités sont traitées dans un ordre fixe, par identifiant croissant.
7. Pas d'horloge, pas de réseau, pas de lecture ni d'écriture de fichiers dans la simulation. Elle reçoit des ordres et rien d'autre.
8. Pas d'instructions WebAssembly « relaxed SIMD », dont le résultat peut changer d'une machine à l'autre.
9. Calcul sur un seul thread au départ. Un découpage sur plusieurs threads n'est accepté que s'il donne le même hash que le calcul sur un thread.

Le module expose cinq fonctions :

| Fonction | Rôle |
| --- | --- |
| `init(graine, carte)` | Crée une partie |
| `step(ordres)` | Applique les ordres du tick, avance d'un tick, renvoie le hash d'état |
| `render_buffer()` | Donne le tampon de rendu : positions, orientations et états de ce qui est visible |
| `snapshot()` | Sérialise tout l'état en octets, de façon compacte |
| `restore(octets)` | Recharge un état sérialisé |

## Algorithmes de performance

Ces choix d'algorithmes pèsent plus sur la performance que le langage. Ils sont en place dès les premières versions, car les ajouter plus tard oblige à réécrire la simulation.

- Les tapis roulants sont stockés comme une suite d'écarts entre objets. Faire avancer une ligne revient en général à modifier un seul nombre. Un objet sur un tapis n'est jamais une entité.
- Un bâtiment qui attend un ingrédient ou de la place en sortie est mis en sommeil et ne fait aucun calcul. Il est réveillé par l'événement qu'il attend.
- Les unités se déplacent avec des champs de flux (flow fields), calculés par secteur de carte et partagés par toutes les unités qui vont au même endroit. Seuls les secteurs où un bâtiment a été posé ou détruit sont recalculés.
  - Dans un secteur, chaque case de sortie vers un secteur plus proche du but coûte sa distance octile au but : une unité quitte son secteur du côté de sa destination, pas par le bord le plus proche.
  - Le champ ne donne que 8 directions. Quand la ligne droite vers la destination passe entre deux directions qui sont toutes deux sur un plus court chemin, l'unité suit la ligne droite au lieu d'avancer en escalier.
- La recherche de cibles passe par une grille spatiale : une unité ne cherche ses cibles que dans les cases voisines.
- Les données sont rangées en tableaux contigus par type d'entité, une colonne par propriété, et pas en objets dispersés en mémoire.

## Réseau et multijoueur

Le jeu utilise le lockstep déterministe : seuls les ordres des joueurs circulent sur le réseau, et chaque machine calcule la partie complète.

- Un ordre donné au tick N s'exécute au tick N+3, soit 150 ms plus tard. L'interface affiche tout de suite une réaction locale (marqueur de destination, bâtiment en transparence) pour que le joueur ne sente pas ce délai.
- Chaque client se connecte en WebSocket au relais Node.js. Le relais regroupe les ordres reçus pour chaque tick et les renvoie à tous les joueurs. Il envoie aussi un message vide quand personne n'a joué, pour que toutes les simulations avancent ensemble.
- Si les ordres d'un tick ne sont pas arrivés, la simulation attend. Le serveur indique quel joueur ralentit la partie.
- Un joueur qui rejoint la partie ou se reconnecte reçoit l'état complet de la copie de référence du serveur, puis les ordres depuis cet état.
- Chaque client envoie son hash d'état tous les 20 ticks. Le serveur le compare au hash de sa copie. En cas d'écart, il enregistre le tick, les ordres et les états concernés dans un rapport de désynchronisation.
- Le serveur vérifie qu'un ordre ne porte que sur les unités et bâtiments du joueur qui l'envoie.
- Un replay se compose de la graine, de la carte et de la liste des ordres. Il se rejoue avec le même fichier .wasm.

Il n'y a pas de comptes, et le serveur n'héberge qu'une partie à la fois. Les joueurs ouvrent le lien du jeu dans Chrome, choisissent un pseudo et arrivent dans le lobby. Le premier joueur arrivé en est l'hôte : il ajoute les bots et lance la partie. Tant qu'une partie est en cours, aucune autre ne peut être lancée. Les ordres des bots passent par le relais comme ceux des humains (voir Bots).

Le rollback de type GGPO est écarté : resimuler plusieurs ticks d'un monde de cette taille à chaque ordre en retard coûte trop cher. WebTransport, disponible dans Chrome, pourra remplacer WebSocket plus tard, mais n'est pas nécessaire au départ.

## Objectifs de performance

La partie de référence doit tenir sous 25 ms de simulation par tick sur un PC fixe de milieu de gamme avec Chrome, avec un affichage à 60 images par seconde. Un tick dure 50 ms à 20 ticks par seconde, donc l'objectif garde la moitié de ce temps en réserve pour les pics de combat.

| Indicateur | Objectif |
| --- | --- |
| Machine de référence | PC fixe de milieu de gamme, Chrome |
| Carte | 20 km (1 024 × 1 024 cases) |
| Joueurs | 8, humains ou bots |
| Limite d'unités | 1 000 par joueur |
| Unités en combat | 8 000 |
| Bâtiments et tapis | 40 000 |
| Fréquence de simulation | 20 ticks par seconde |
| Temps de simulation par tick | moins de 25 ms |
| Affichage | 60 images par seconde |
| Délai d'exécution des ordres | 150 ms (3 ticks) |
| Bots sur le serveur | 7, dans la seule partie hébergée, sans la ralentir |

Un banc de performance (`tools/bench`) fait jouer 8 bots entre eux à partir d'une graine fixe, sans affichage. Il mesure séparément le temps de simulation par tick (moyenne et 99e centile) et le temps de calcul des bots. Il tourne à chaque modification, et une dégradation de plus de 10 % par rapport à la mesure précédente bloque la modification.

Si l'objectif n'est pas tenu, on mesure d'abord où part le temps et on corrige l'algorithme concerné. La répartition de la simulation sur plusieurs threads vient en dernier : WebAssembly le permet si le serveur envoie les en-têtes COOP et COEP, ce qui se règle sur le VPS.
