# Simulation (sim/)

Spécification : docs/spec/architecture.md (simulation déterministe, performance), puis le fichier du thème touché (economie.md, logistique.md, energie.md, races.md…). Les règles de déterminisme sont dans le CLAUDE.md de la racine.

## Contrôles
- Pendant le travail : `node tools/cargo.mjs test --release <filtre>` (un bout de nom de test ou de module).
- À la fin : `npm run test:rust`, `node tools/cargo.mjs clippy --release -- -D warnings`, puis `npm run build:sim` et `npm run test:determinism`.
- Remaniement qui ne doit rien changer au comportement : les quatre empreintes affichées par `npm run test:determinism` doivent être les mêmes qu'avant.
- Une règle d'économie, de bâtiment ou de tapis modifiée peut casser les bots sans faire échouer un seul test Rust : lancer aussi `npm run test:ai` (jalons des IA) et, si l'eau ou les transports sont concernés, `node tools/bench/naval-check.ts --check`.
- Performance : skill `comparer-perf`. `npm run bench` réécrit `tools/bench/last.json` : le restaurer avant le commit (`git checkout tools/bench/last.json`).

## Ce qui a un double ailleurs
- Codes d'ordres : `orders.rs` et `packages/shared/src/orders.ts` (`O`).
- Codes d'événements (`EV_…`) et mots du tampon de rendu (`render.rs`) : `packages/shared/src/render.ts` (`EV`, `parseFrame`, `PLAYER_WORDS`…).
- Champ sauvegardé ajouté : après « since N » dans `ser_struct!`, et `save::VERSION` passe à N (voir docs/spec/processus.md). Jamais de champ inséré au milieu d'une structure.
- Ces numéros sont attribués à la main. Deux sessions parallèles peuvent prendre le même : après une fusion de master, vérifier que les codes d'ordres, d'événements et la version de sauvegarde sont toujours uniques.
- Unité, bâtiment, recherche ou objet nouveau : skill `ajouter-contenu`.

## Tests
- Un fichier `*_tests.rs` par thème, déclaré dans `lib.rs` (`#[cfg(test)] mod …`).
- Un test nouveau doit échouer sur l'ancien comportement : le vérifier avant de corriger.
- Les règles du jeu se testent ici, jamais dans un navigateur. Scènes de démonstration (`?demo=…`) : `stress.rs`.
