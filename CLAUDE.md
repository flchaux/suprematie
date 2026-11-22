# Règles du projet

Lire docs/SPEC.md (index), puis les fichiers de docs/spec/ utiles à la tâche, avant toute tâche qui touche à l'architecture, au réseau ou à la simulation. Une règle nouvelle va dans le fichier de son thème.
Rust est installé par apt : `/usr/lib/rust-1.97/bin` (les scripts tools/*.mjs l'ajoutent au PATH).

## Simulation (dossier sim/)
- Jamais de f32 ni de f64 dans l'état de la partie : entiers ou virgule fixe.
- Jamais de HashMap ni de HashSet parcourus, jamais d'horloge, jamais d'aléatoire hors du générateur à graine de la partie.
- Les entités sont traitées par identifiant croissant.
- Pas d'instructions relaxed SIMD.

## Avant de terminer une tâche
- Lancer npm run test:determinism et npm run bench.
- Ne jamais désactiver un test ou une règle de lint pour faire passer une modification.
- Tests dans Chrome (tools/e2e-*.mjs, captures) : seulement si la modification change l'affichage ou une interaction que les tests Node ne couvrent pas. Un seul scénario court, une seule fois en fin de tâche (pas de nouveau passage après une fusion sans conflit). Toujours par tools/browser.mjs.

## Modèles 3D
- Écrire des descriptions de pièces dans assets/models/, jamais de sommets ni de fichiers .glb ou .gltf.
- Vérifier le résultat avec npm run viewer:capture.

## Fichiers à ne pas lire
- target/, dist/, node_modules/, fichiers .wasm, .glb et .gltf.
