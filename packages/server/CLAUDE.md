# Serveur et bots (packages/server)

Spécification : docs/spec/bots.md (IA d'escarmouche), docs/spec/architecture.md (réseau, relais, salon).

## Contrôles
- Bots : `npm run test:ai` (parties entre IA, sortie 1 si un jalon est manqué ; `node tools/bench/ai-check.ts --games N --seed S` pour d'autres parties) et `node tools/bench/naval-check.ts --check` (marine, transports, débarquements).
- Les bots tirent leurs nombres d'un générateur à graine (`SkirmishAI.random`) : même graine, même partie. Pour un remaniement, les jalons doivent être identiques avant et après ; pour un changement de comportement, les comparer à ceux de master sur les mêmes graines.
- `npm run test:js` (tests dans `packages/server/test`) et `npx eslint packages`.
- `npx tsc --noEmit -p packages/server/tsconfig.json` : 4 erreurs connues (une comparaison dans `army.ts`, trois salons incomplets dans les tests) ; n'en ajouter aucune. Node exécute le TypeScript tel quel : sans ce contrôle, un appel à une fonction déplacée ou renommée ne casse qu'à l'exécution de la ligne en cause. À relancer après chaque fusion de master.
- `npm run bench` réécrit `tools/bench/last.json` : le restaurer avant le commit (`git checkout tools/bench/last.json`).

## À savoir
- `bots/ai.ts` garde l'état de l'IA et la boucle de décision ; le reste est en modules par thème, en fonctions qui reçoivent l'IA en premier paramètre (`engineers(ai, out)`, pas `ai.engineers(out)`). Liste des modules : docs/spec/bots.md.
- Les bots ne jouent que les Industriels.
- La vue d'un bot (`parseBotDump`, `packages/shared/src/render.ts`) ne liste pas les tapis.
- Une règle du jeu modifiée dans `sim/` peut changer ce que les bots construisent : un jalon manqué après un changement de simulation se corrige souvent ici, dans leur planification.
- Le serveur n'héberge qu'une partie à la fois. Serveur de test : skill `essai-navigateur`.
- Mise en production : `npm run deploy` depuis le dossier principal (voir le CLAUDE.md de la racine).
