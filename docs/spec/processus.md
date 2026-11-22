# Tests, règles pour Claude Code, étapes

> Partie de la spécification. Index et liste des fichiers : [docs/SPEC.md](../SPEC.md).

## Tests et règles pour Claude Code

Le test de déterminisme et le banc de performance tournent à chaque modification. Le risque principal d'un code écrit par Claude est un appel à l'horloge ou à l'aléatoire ajouté dans la simulation sans que personne ne le voie : la partie marche en solo et se désynchronise à deux.

Tests automatiques :

- Déterminisme : deux simulations reçoivent la même graine et la même suite d'ordres pendant 10 000 ticks. Leurs hash doivent être identiques à chaque tick.
- Déterminisme entre Node.js et Chrome : le même scénario tourne dans Node.js et dans Chrome via Playwright. Les hash doivent être identiques.
- Sauvegarde : après `snapshot()` puis `restore()`, la suite de la partie donne les mêmes hash que sans interruption.
- Format des sauvegardes versionné (`save.rs`) : en-tête « SUP2 » puis `VERSION`. Un champ sauvegardé ajouté à une structure se déclare après « since N » dans `ser_struct!` (et `VERSION` passe à N) : les sauvegardes plus anciennes se chargent, le champ y prend sa valeur par défaut. La version 3 (22 novembre 2026) remplace la réserve du joueur par le stock de chaque dépôt : à la lecture d'une sauvegarde plus ancienne, la réserve devient un dépôt rempli (voir [economie.md](economie.md)). Les sauvegardes sans numéro (« SUPR », jusqu'au 21 novembre 2026) sont lues comme la version 1. Ne jamais insérer un champ au milieu d'une structure ni en retirer un sans gérer les anciennes versions.
- Partie entre bots : 8 bots jouent 30 minutes de jeu entre eux, sans désynchronisation ni blocage.
- Tests unitaires Rust (`cargo test`) pour les tapis, les bâtiments, le déplacement et le combat.
- Banc de performance (voir Objectifs de performance).

Contrôles automatiques du code :

- Clippy dans `sim/` : `float_arithmetic` interdit, et `disallowed_types` pour HashMap, HashSet, Instant et SystemTime.
- ESLint dans `packages/shared` et dans le Worker : Math.random, Date.now et performance.now interdits.

Fichier `CLAUDE.md` à la racine du dépôt :

```markdown
# Règles du projet

Lire docs/SPEC.md (index), puis les fichiers de docs/spec/ utiles à la tâche, avant toute tâche qui touche à l'architecture, au réseau ou à la simulation. Une règle nouvelle va dans le fichier de son thème.

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
- Un `CLAUDE.md` court. Cette spécification reste dans `docs/` (index `docs/SPEC.md`, un fichier par thème dans `docs/spec/`) : seuls les fichiers utiles à la tâche sont lus.
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

- [x] Construction des bâtiments : livraison par drones depuis les dépôts proches, comme les robots de construction de Factorio (voir Dépôts et drones dans [economie.md](economie.md)).
- [ ] Recherche individuelle (proposée) ou partagée entre coéquipiers.

## Sources

- [Bevy 0.20](https://bevy.org/news/bevy-0-20/)
- [WebGPU is now supported in major browsers (web.dev)](https://web.dev/blog/webgpu-supported-major-browsers)
- [GPG Map Editor, tailles de cartes de Supreme Commander (wiki FAF)](https://wiki.faforever.com/en/Development/Mapping/GPG-Map-Editor)
- [Exemple de builder de l'IA de Forged Alliance (dépôt FAForever/fa)](https://github.com/FAForever/fa/pull/5508)
- [Custom AIs, variantes et versions AIx (wiki FAF)](https://wiki.faforever.com/Development/AI/Custom-AIs)
