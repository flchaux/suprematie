# Spécification technique du STR multijoueur

Nov 16, 2026 · @Florian

## Objet et périmètre

Le projet est un jeu de stratégie en temps réel multijoueur, jouable dans le navigateur, qui mélange la construction d'usines de Factorio et les batailles à grande échelle de Supreme Commander.

- Les joueurs extraient des ressources, construisent des chaînes de production reliées par des tapis roulants et produisent des armées qui s'affrontent sur la même carte.
- Une partie réunit jusqu'à 8 joueurs, humains ou bots. Les bots reprennent le fonctionnement de l'IA d'escarmouche de Supreme Commander.
- Le jeu a une seule faction.
- Le jeu se lance depuis un lien, sans installation et sans compte. Il est prévu pour Chrome uniquement. Il reste privé, hébergé sur le VPS, et le serveur n'héberge qu'une partie à la fois.
- Il n'y a pas de mods ni de version Steam.
- Le style visuel est en 3D avec peu de polygones, en vue de dessus inclinable, avec un zoom continu de l'unité à la carte entière.
- Claude écrit tout le code avec Claude Code. Le porteur du projet relit, teste et décide.

La partie de référence, qui sert d'objectif de performance, réunit 8 joueurs, 8 000 unités et 40 000 bâtiments et tapis sur un PC fixe de milieu de gamme (voir Objectifs de performance).

## Règles du jeu

Une partie se joue sur une carte de 10 ou 20 km et se termine quand il ne reste qu'une équipe avec un robot de commandement.

### Cartes

- Deux tailles, reprises des cartes moyennes et grandes de Supreme Commander : 10 km (512 × 512 cases) et 20 km (1 024 × 1 024 cases) ([wiki FAF](https://wiki.faforever.com/en/Development/Mapping/GPG-Map-Editor)).
- Une case correspond à une unité de carte de Supreme Commander. Les bâtiments et les tapis se posent sur cette grille, comme dans Factorio.
- Chaque position de départ a des gisements de fer, de cuivre, de silicium et d'hydrocarbure à proximité. Les gisements de cristal sont rares et placés dans des zones disputées.
- Les cartes sont produites par un générateur à graine (relief, eau, gisements, positions de départ), avec ou sans eau.

### Victoire

- Chaque joueur commence avec son seul robot de commandement.
- Quand le robot de commandement est détruit, il explose et endommage tout autour de lui. Le joueur est éliminé, et toutes ses unités et tous ses bâtiments sont détruits.
- Les équipes sont fixées dans le lobby. La dernière équipe qui a encore au moins un robot de commandement gagne.
- En partie solo (un seul joueur humain, contre des IA), la vitesse de jeu se règle de ×0,5 à ×4 (pavé ×/÷, ou boutons à côté de l'horloge) : le serveur cadence les ticks plus ou moins vite, la simulation est inchangée.

### Économie

- Cinq ressources brutes sont extraites sur des gisements : minerai de fer, minerai de cuivre, silicium, hydrocarbure et cristal.
- Les ressources circulent physiquement, comme dans Factorio : extracteurs, tapis, bras, fonderies, assembleurs.
- Transfert direct : un extracteur ou un fabricant donne ses produits, sans bras ni tapis, à un bâtiment collé à une de ses faces qui les accepte (dépôt, laboratoire, usine, fabricant dont la recette en cours les utilise), à tour de rôle avec ses autres sorties. Le contact ne change jamais la recette d'un fabricant voisin, sauf pour un extracteur qui amorce une fonderie vide.
- L'énergie passe par un réseau électrique relié par des pylônes. Un bâtiment hors réseau ne fonctionne pas.
- Le générateur s'améliore sur place, comme l'extracteur : 400 kW, puis 650 kW (automatisation), puis 1 000 kW (électronique). Il ne produit rien pendant le chantier.
- Les usines d'unités reçoivent leurs composants par tapis, bras ou transfert direct. Un dépôt collé à une face d'une usine l'alimente lentement depuis la réserve du joueur (1 objet par seconde) ; un seul dépôt compte par usine. L'usine garde d'avance les composants de 2 unités pour chaque type de sa file ; ce qui dépasse quand la file change retourne à la réserve. Une usine à l'arrêt faute de composants depuis 10 s déclenche une alerte.
- Les drones ingénieurs construisent les bâtiments avec un stock commun au joueur, alimenté par les dépôts : ce qui entre dans un dépôt devient disponible pour les ingénieurs sur toute la carte.
- Cette réserve est plafonnée, objet par objet : 400 de base, plus 600 par dépôt terminé (2 000 pour un dépôt amélioré). Réserve pleine pour un objet : les dépôts le refusent (le tapis attend), le collecteur de surplus le laisse passer, les ingénieurs cessent de le ramasser ou de le recycler. Les remboursements ne sont pas plafonnés. Un dépôt amélioré (automatisation) gagne un étage et des sorties filtrées (jusqu'à 4 objets) : il pose ces objets, pris dans la réserve à tour de rôle, sur les tapis qui partent de ses faces, et les bras peuvent les y prendre.
- Les unités détruites laissent des épaves que les ingénieurs recyclent en plaques de fer et en acier, comme dans Supreme Commander.

## Technologie

La recherche fonctionne comme dans Factorio : des laboratoires consomment des lots de recherche fabriqués dans l'usine, et chaque recherche débloque des bâtiments, des unités, des recettes ou des améliorations. Chaque joueur fait ses propres recherches, avec le même arbre pour tous puisqu'il n'y a qu'une faction.

Produits intermédiaires :

| Produit | Fabriqué dans | Ingrédients |
| --- | --- | --- |
| Plaque de fer | Fonderie | minerai de fer |
| Plaque de cuivre | Fonderie | minerai de cuivre |
| Acier | Fonderie | plaques de fer |
| Plaquette de silicium | Fonderie | silicium |
| Engrenage | Assembleur | plaques de fer |
| Câble | Assembleur | plaques de cuivre |
| Circuit | Assembleur | plaques de fer, câbles |
| Moteur | Assembleur | acier, engrenages |
| Munitions | Assembleur | acier, plaques de cuivre |
| Processeur | Assembleur | circuits, plaquettes de silicium |
| Carburant | Raffinerie | hydrocarbure |
| Composite | Usine chimique | carburant, acier |
| Cristal raffiné | Raffinerie | cristal |
| Cellule d'énergie | Assembleur | cristal raffiné, processeurs |

Six paliers de recherche, chacun avec son lot. Une recherche d'un palier demande aussi les lots de tous les paliers inférieurs, comme dans Factorio.

| Palier | Lot de recherche | Ingrédients du lot | Débloque notamment |
| --- | --- | --- | --- |
| 1 | Données mécaniques | engrenages, plaques de cuivre | assembleurs, usine terrestre, robots de ligne, chars légers, tourelle légère |
| 2 | Données électroniques | circuits, bras | usine aérienne, centrale à hydrocarbure, artillerie mobile, appareils légers |
| 3 | Données militaires | munitions, acier | usine navale, marcheurs d'assaut, chars glisseurs, canonnières, bombardiers |
| 4 | Données avancées | processeurs, composites | boucliers, canons à ions, marcheurs de siège, plateforme de transfert, raffinage du cristal |
| 5 | Données cristallines | cristal raffiné, processeurs | robots de choc, porte de transit, bouclier de zone, missile stratégique, réacteur à cristal |
| 6 | Données orbitales | cellules d'énergie, composites, processeurs | portique expérimental et unités expérimentales, canon orbital |

Les quantités, les coûts et les durées de recherche sont fixés pendant l'équilibrage.

## Unités

La faction compte 37 unités, inspirées de Supreme Commander, Star Wars et Stargate. Les noms sont provisoires.

### Commandement

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Robot de commandement | Unité de départ, unique. Construit, répare et combat avec un canon lourd. Sa destruction élimine le joueur. La recherche lui ajoute un bouclier personnel, un canon renforcé et la téléportation par faisceau. | Départ | Supreme Commander (ACU), Stargate (téléportation par faisceau) |
| Drone ingénieur | Construit, répare et recycle les épaves. Trois modèles de plus en plus rapides. | 1, 3, 5 | Supreme Commander |

### Terre

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Robot de ligne | Robot d'infanterie bon marché, produit en grand nombre, arme légère | 1 | Star Wars (robots de combat) |
| Moto-glisseur | Éclaireur très rapide et peu blindé | 1 | Star Wars (motos à répulseurs) |
| Char léger | Char d'appui direct de base | 1 | Supreme Commander |
| Artillerie mobile | Tir indirect à moyenne portée | 2 | Supreme Commander |
| Défense antiaérienne mobile | Canon antiaérien sur chenilles | 2 | Supreme Commander |
| Sonde de détection | Se pose et reste sur place comme radar, détecte les unités invisibles | 2 | Star Wars (sondes de reconnaissance) |
| Marcheur d'assaut | Bipède rapide à deux canons légers | 3 | Star Wars (marcheurs bipèdes) |
| Char glisseur | Char lourd sur répulseurs, passe sur l'eau | 3 | Star Wars, Supreme Commander (aéroglisseurs) |
| Lance-missiles mobile | Missiles à longue portée contre les défenses fixes | 3 | Supreme Commander |
| Générateur de bouclier mobile | Bouclier d'énergie qui protège les unités proches | 4 | Supreme Commander |
| Canon à ions mobile | Paralyse quelques secondes les unités et bâtiments touchés, sans les endommager | 4 | Star Wars |
| Lanceur de drones guidés | Tire des essaims de petits drones explosifs à tête chercheuse | 4 | Stargate (drones des Anciens) |
| Marcheur de siège | Quadripède très blindé, canons lourds, transporte des robots de ligne | 4 | Star Wars (marcheurs quadripèdes) |
| Robot de choc | Robot d'assaut lourd, arme à plasma | 5 | Supreme Commander (robots d'assaut), Stargate (armes à plasma) |
| Artillerie lourde mobile | Très longue portée, se déploie avant de tirer | 5 | Supreme Commander |

### Air

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Avion éclaireur | Reconnaissance rapide | 2 | Supreme Commander |
| Intercepteur | Chasseur léger contre les avions | 2 | Supreme Commander, Star Wars (chasseurs) |
| Planeur d'attaque | Chasseur-bombardier rapide et fragile, tir plasma contre le sol | 2 | Stargate (planeurs) |
| Transport | Transporte des unités terrestres | 2 | Supreme Commander |
| Canonnière | Appareil lourd en vol stationnaire, tire sur les unités au sol | 3 | Supreme Commander, Star Wars (canonnières) |
| Bombardier | Bombes contre les unités et les bâtiments | 3 | Supreme Commander |
| Chasseur de supériorité | Chasseur lourd contre les avions | 4 | Supreme Commander |
| Bombardier stratégique | Bombes lourdes contre les bâtiments | 5 | Supreme Commander |

### Mer (cartes avec eau)

| Unité | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Frégate | Navire léger polyvalent | 3 | Supreme Commander |
| Sous-marin | Attaque les navires sans apparaître au radar | 3 | Supreme Commander |
| Destroyer | Navire de ligne, armes contre surface et sous-marins | 4 | Supreme Commander |
| Croiseur lance-missiles | Missiles à longue portée et défense antiaérienne | 5 | Supreme Commander |

### Expérimentales (palier 6, construites dans le portique expérimental)

| Unité | Rôle | Inspiration |
| --- | --- | --- |
| Araignée de siège | Marcheur à huit pattes, rayon laser prolongé (3 s) tiré depuis le centre de son corps | Supreme Commander (araignée expérimentale) |
| Colosse | Robot humanoïde géant, écrase les unités et tire au laser | Supreme Commander (colosse expérimental) |
| Forteresse marchante | Marcheur géant qui produit des unités terrestres en avançant, protégé par un bouclier | Supreme Commander (usine mobile), Star Wars (marcheurs géants) |
| Vaisseau-mère | Vaisseau volant géant qui lâche des escadrilles de planeurs d'attaque et bombarde le sol | Stargate (vaisseaux-mères), Supreme Commander (soucoupe expérimentale) |
| Croiseur hyperespace | Vaisseau de ligne volant qui saute vers une balise du joueur après un temps de charge | Star Wars (sauts en hyperespace) |
| Char Blatte | Char géant en forme de blatte, sur chenilles avec six pattes articulées ; canons-mandibules à balles et mitrailleuses antiaériennes | Création originale |
| Gros Chinois | Dragon robot volant au corps qui ondule ; souffle de feu prolongé qui brûle une zone, perle d'énergie contre le sol et les avions | Dragons chinois |
| Cuirassé stellaire | Vaisseau géant volant à coque en triangle, batteries de traits d'énergie et défense antiaérienne | Star Wars (vaisseaux de ligne en triangle) |

Les armes se rangent en trois familles, qui se distinguent à l'écran :

- **Cinétiques** (balles, obus) : projectiles métalliques avec un traceur discret (commandant, chars, défense antiaérienne, navires, tourelles légères, Char Blatte).
- **Énergie** : traits lumineux (plasma, ions, traits rouges des unités inspirées de Star Wars, batteries du cuirassé stellaire).
- **Rayons prolongés** : un rayon qui dure plusieurs secondes, suit sa cible et la touche à chaque tick (laser de l'araignée et du colosse, souffle de feu du Gros Chinois). Il s'éteint si la source est détruite ou paralysée, ou si la cible meurt ou sort de portée.

Règles de protection :

- **Boucliers** : une bulle absorbe les tirs ennemis qui retombent dedans quand ils viennent de l'extérieur ou du ciel (avions qui la survolent, bombes). Les tirs qui visent des avions passent. Un bouclier coupé ne consomme rien.
- **Murs** : un mur ennemi arrête les tirs directs (balles, plasma, ions, traits, rails, rayons instantanés) qui le traversent et prend le coup. Obus, missiles, bombes, torpilles, rayons prolongés et tirs vers ou depuis le ciel passent par-dessus.
- **Paralysie** (canon à ions, impulsion électromagnétique) : seulement les unités des couches que l'arme vise (sol et mer), et les bâtiments ; les avions ne sont pas touchés.

## Bâtiments

Les bâtiments de production viennent de Factorio, les bâtiments militaires de Supreme Commander, et les bâtiments spéciaux reprennent des mécaniques de Stargate et de Star Wars. Le palier 0 signifie disponible dès le départ.

### Production et énergie

| Bâtiment | Rôle | Palier |
| --- | --- | --- |
| Extracteur | Extrait une ressource brute sur un gisement | 0 |
| Tapis roulant | Transporte les objets, trois vitesses | 0, 3, 5 |
| Bras | Prend et dépose les objets entre tapis et bâtiments | 0 |
| Fonderie | Fond les minerais et le silicium | 0 |
| Assembleur | Fabrique les produits intermédiaires, trois modèles de plus en plus rapides | 1, 3, 5 |
| Raffinerie | Transforme l'hydrocarbure et le cristal | 2 |
| Usine chimique | Fabrique les composites | 3 |
| Laboratoire | Consomme les lots de recherche | 0 |
| Dépôt | Alimente le stock commun utilisé par les ingénieurs, dont il agrandit le plafond ; amélioré, rend des objets filtrés | 0 |
| Générateur | Petite production d'énergie sans combustible | 0 |
| Pylône | Relie le réseau électrique | 0 |
| Centrale à hydrocarbure | Grosse production d'énergie, posée sur un gisement d'hydrocarbure | 2 |

### Militaire

| Bâtiment | Rôle | Palier |
| --- | --- | --- |
| Usine terrestre | Produit les unités terrestres | 1 |
| Usine aérienne | Produit les appareils | 2 |
| Usine navale | Produit les navires | 3 |
| Portique expérimental | Construit les unités expérimentales | 6 |
| Radar | Détecte les unités dans un large rayon | 1 |
| Mur | Bloque le passage et les tirs directs | 1 |
| Tourelle légère | Défense contre les unités terrestres légères | 1 |
| Tourelle antiaérienne | Défense contre les appareils | 2 |
| Tourelle lourde | Défense contre les unités blindées | 3 |
| Artillerie fixe | Tir à longue portée sur les bases adverses | 4 |
| Générateur de bouclier fixe | Bouclier qui protège les bâtiments proches | 4 |

### Bâtiments spéciaux

| Bâtiment | Rôle | Palier | Inspiration |
| --- | --- | --- | --- |
| Plateforme de transfert | Téléporte un petit groupe d'unités vers une autre plateforme proche | 4 | Stargate (anneaux de transport) |
| Porte de transit | Paire de portes : les unités qui entrent dans l'une ressortent par l'autre, n'importe où sur la carte. Grosse consommation d'énergie à l'ouverture | 5 | Stargate (portes) |
| Bouclier de zone | Grand bouclier qui couvre une base entière | 5 | Stargate (boucliers de cité), Supreme Commander |
| Réacteur à cristal | Très grosse production d'énergie, explose quand il est détruit | 5 | Stargate (sources d'énergie) |
| Silo de missile stratégique | Missile à très longue portée qui détruit une zone entière | 5 | Supreme Commander |
| Défense antimissile | Abat les missiles stratégiques | 5 | Supreme Commander |
| Balise d'hyperespace | Point d'arrivée des sauts du croiseur hyperespace | 6 | Star Wars |
| Canon orbital | Superarme qui frappe n'importe quel point de la carte à intervalles longs | 6 | Star Wars, Supreme Commander (artillerie expérimentale) |

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
├── docs/SPEC.md      cette spécification
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

## Bots

Les bots tournent sur le serveur, en TypeScript, et envoient leurs ordres au relais comme des joueurs humains. Ils reprennent le fonctionnement de l'IA d'escarmouche de Supreme Commander: Forged Alliance.

- Le bot lit l'état de la partie dans la copie de référence du serveur. Ses ordres suivent le même chemin que ceux d'un humain : délai de 3 ticks, enregistrement dans le replay.
- Le code des bots n'est pas soumis aux règles de déterminisme, puisqu'il ne tourne qu'à un seul endroit. Seuls ses ordres entrent dans la simulation.
- Les bots ne consomment rien sur les PC des joueurs. Leur coût de calcul est sur le VPS.
- Un bot prend ses décisions tous les 10 ticks (une demi-seconde), pas à chaque tick.

Organisation reprise de Supreme Commander ([exemple de builder dans le code de FAF](https://github.com/FAForever/fa/pull/5508)) :

- Le bot dispose d'une liste de builders. Chaque builder décrit une tâche (construire tel bâtiment, produire tel type d'unité), avec une priorité et des conditions (ressources disponibles, nombre d'unités déjà présentes, menace détectée).
- Des gestionnaires (ingénieurs, usines, pelotons) choisissent à chaque décision le builder valide de plus haute priorité.
- Les unités produites sont regroupées en pelotons, chacun avec une mission : attaque, défense, expansion, harcèlement.
- Des personnalités changent les listes de builders et leurs priorités : Adaptive, Rush, Turtle, Tech.
- Une variante AIx triche avec un multiplicateur de ressources et de vitesse de construction réglable dans le lobby, comme dans Forged Alliance ([wiki FAF](https://wiki.faforever.com/Development/AI/Custom-AIs)).

## Rendu et interface

Le jeu cible Chrome uniquement. Le rendu utilise Three.js avec son moteur WebGPU, qui bascule automatiquement sur WebGL2 sur les machines où Chrome n'a pas WebGPU.

- Chaque type d'unité, de bâtiment et d'objet sur tapis est dessiné en un seul appel au GPU (InstancedMesh). Chaque pièce mobile (tourelle, canon) est un mesh instancié séparé, pour tourner indépendamment.
- La caméra est en vue de dessus inclinable, avec un zoom continu de l'unité à la carte entière. Au-delà d'une distance réglable, les modèles sont remplacés par des icônes stratégiques.
- L'affichage tourne à 60 images par seconde et interpole les positions entre les deux derniers ticks reçus du Worker.
- Le Worker envoie le tampon de rendu à chaque tick en transfert sans copie (ArrayBuffer transférable). Le thread principal ne fait aucun calcul de simulation.
- L'interface est en HTML et CSS avec Svelte, par-dessus le canvas : barre de construction, minicarte, infobulles, statistiques de production. Les valeurs affichées sont rafraîchies quelques fois par seconde, pas à chaque image.

## Modèles 3D

Les modèles sont décrits en données à partir d'un kit de formes simples, et un générateur TypeScript les construit au chargement. Claude n'écrit jamais de sommets ni de fichiers OBJ ou glTF.

- Le générateur prend une liste de pièces (bloc, cylindre à 5 ou 6 faces, cône, biseau), les place, les colore avec la palette commune et les fusionne en un seul mesh à facettes.
- Les éléments fréquents sont des sous-ensembles réutilisables : chenilles, tourelles, canons, réacteurs, socles de bâtiments.
- Les pièces mobiles sont marquées `pivot`, et les pièces qu'elles portent sont marquées `parent`. Le jeu les fait tourner lui-même, sans animation par squelette.
- La palette compte 6 à 8 couleurs communes plus une couleur par joueur, soit 8 couleurs de joueur. Avec une seule faction, toutes les unités partagent le même kit.
- Une unité compte 100 à 300 triangles.

Exemple de description d'une unité :

```ts
export const charLeger: UnitModel = {
  parts: [
    { use: "chenille", pos: [0.9, 0, 0], mirror: true },
    { shape: "box", size: [1.6, 0.4, 2.2], pos: [0, 0.35, 0], color: "faction" },
    { shape: "cylinder", sides: 6, radius: 0.55, height: 0.35, pos: [0, 0.75, -0.1], color: "faction", pivot: "tourelle" },
    { shape: "cylinder", sides: 5, radius: 0.08, height: 1.4, pos: [0, 0.8, 0.8], rot: [90, 0, 0], color: "metal", parent: "tourelle" },
  ],
};
```

Une page de visualisation (`tools/viewer`) affiche toutes les unités côte à côte, avec l'angle et la distance de la caméra du jeu. Playwright en fait une capture d'environ 800 pixels de large, que Claude regarde pour vérifier son travail.

Pour tester le gameplay avant d'avoir les vrais modèles, les packs gratuits sous licence CC0 de Kenney et Quaternius peuvent servir. Si le kit paraît trop simple plus tard, Blender piloté par des scripts Python écrits par Claude permettra des pièces plus travaillées, exportées en .glb.

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

## Tests et règles pour Claude Code

Le test de déterminisme et le banc de performance tournent à chaque modification. Le risque principal d'un code écrit par Claude est un appel à l'horloge ou à l'aléatoire ajouté dans la simulation sans que personne ne le voie : la partie marche en solo et se désynchronise à deux.

Tests automatiques :

- Déterminisme : deux simulations reçoivent la même graine et la même suite d'ordres pendant 10 000 ticks. Leurs hash doivent être identiques à chaque tick.
- Déterminisme entre Node.js et Chrome : le même scénario tourne dans Node.js et dans Chrome via Playwright. Les hash doivent être identiques.
- Sauvegarde : après `snapshot()` puis `restore()`, la suite de la partie donne les mêmes hash que sans interruption.
- Partie entre bots : 8 bots jouent 30 minutes de jeu entre eux, sans désynchronisation ni blocage.
- Tests unitaires Rust (`cargo test`) pour les tapis, les bâtiments, le déplacement et le combat.
- Banc de performance (voir Objectifs de performance).

Contrôles automatiques du code :

- Clippy dans `sim/` : `float_arithmetic` interdit, et `disallowed_types` pour HashMap, HashSet, Instant et SystemTime.
- ESLint dans `packages/shared` et dans le Worker : Math.random, Date.now et performance.now interdits.

Fichier `CLAUDE.md` à la racine du dépôt :

```markdown
# Règles du projet

Lire docs/SPEC.md avant toute tâche qui touche à l'architecture, au réseau ou à la simulation.

## Simulation (dossier sim/)
- Jamais de f32 ni de f64 dans l'état de la partie : entiers ou virgule fixe.
- Jamais de HashMap ni de HashSet parcourus, jamais d'horloge, jamais d'aléatoire hors du générateur à graine de la partie.
- Les entités sont traitées par identifiant croissant.
- Pas d'instructions relaxed SIMD.

## Avant de terminer une tâche
- Lancer npm run test:determinism et npm run bench.
- Ne jamais désactiver un test ou une règle de lint pour faire passer une modification.

## Modèles 3D
- Écrire des descriptions de pièces dans assets/models/, jamais de sommets ni de fichiers .glb ou .gltf.
- Vérifier le résultat avec npm run viewer:capture.

## Fichiers à ne pas lire
- target/, dist/, node_modules/, fichiers .wasm, .glb et .gltf.
```

Fichier `.claude/settings.json`, qui bloque la lecture des fichiers lourds ou générés :

```json
{
  "permissions": {
    "deny": [
      "Read(./target/**)",
      "Read(./**/dist/**)",
      "Read(./**/node_modules/**)",
      "Read(./**/*.wasm)",
      "Read(./**/*.glb)",
      "Read(./**/*.gltf)"
    ]
  }
}
```

## Maîtrise du coût d'utilisation de Claude

Le coût dépend surtout de la longueur des sessions, car chaque message renvoie toute la conversation au modèle.

- Une session par tâche, avec `/clear` entre deux tâches.
- Opus pour la conception (architecture, simulation, réseau, kit 3D). Sonnet pour les tâches courantes (descriptions d'unités, interface, corrections simples).
- Un `CLAUDE.md` court. Cette spécification reste dans `docs/SPEC.md` et n'est lue que quand la tâche le demande.
- Les fichiers lourds ou générés sont interdits en lecture (voir `.claude/settings.json`).
- Pour les modèles 3D : captures réduites à environ 800 pixels, plusieurs unités par image, deux ou trois tours de correction par lot au maximum.
- Claude écrit des générateurs (modèles, cartes, scénarios de test) plutôt que les données elles-mêmes.

## Étapes de réalisation

Le déterminisme et la mesure de performance passent avant les graphismes, car ils sont très difficiles à ajouter après coup. Chaque étape est terminée quand son critère est vérifié par un test.

1. Squelette du dépôt : structure des dossiers, `CLAUDE.md`, `.claude/settings.json`, Vite, Vitest, Clippy, ESLint, exécution automatique des tests.
   - Terminée quand une commande lance tous les tests sur un projet vide.
2. Simulation minimale et lockstep : le générateur de cartes, des unités qui se déplacent sur une carte générée, deux clients reliés par le relais, affichage par des boîtes simples, première version du banc de performance.
   - Terminée quand deux onglets Chrome restent synchronisés 10 000 ticks avec des ordres aléatoires.
3. Économie et recherche : extraction, tapis roulants en écarts, fonderies, assembleurs, réseau électrique, dépôts, laboratoires et lots de recherche, mise en sommeil.
   - Terminée quand une chaîne complète produit les lots du palier 3 et que les tests de déterminisme passent.
4. Combat : robot de commandement et condition de victoire, armes, points de vie, épaves, grille spatiale, champs de flux par secteur.
   - Terminée quand deux armées de 1 000 unités s'affrontent sans désynchronisation.
5. Kit 3D et visualiseur : générateur, palette, 8 couleurs de joueur, trois unités et deux bâtiments d'exemple.
   - Terminée quand la capture du visualiseur est validée par le porteur du projet.
6. Interface et caméra : barre de construction, minicarte, statistiques, zoom stratégique avec icônes.
7. Bots : builders, gestionnaires, pelotons, personnalités Adaptive, Rush, Turtle et Tech, variante AIx.
   - Terminée quand une partie à 8 bots se joue jusqu'à la victoire d'un camp sans intervention.
8. Optimisation sur la partie de référence complète.
   - Terminée quand le banc à 8 bots tient moins de 25 ms par tick.
9. Arrivée en cours de partie, reconnexion, replays et rapports de désynchronisation.
10. Lobby par lien d'invitation et mise en ligne sur le VPS.

## Questions ouvertes

- [ ] Construction des bâtiments : stock commun alimenté par les dépôts (proposé dans Règles du jeu), ou livraison par drones comme les robots de construction de Factorio.
- [ ] Recherche individuelle (proposée) ou partagée entre coéquipiers.

## Sources

- [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [WebGPU is now supported in major browsers (web.dev)](https://web.dev/blog/webgpu-supported-major-browsers)
- [GPG Map Editor, tailles de cartes de Supreme Commander (wiki FAF)](https://wiki.faforever.com/en/Development/Mapping/GPG-Map-Editor)
- [Exemple de builder de l'IA de Forged Alliance (dépôt FAForever/fa)](https://github.com/FAForever/fa/pull/5508)
- [Custom AIs, variantes et versions AIx (wiki FAF)](https://wiki.faforever.com/Development/AI/Custom-AIs)
