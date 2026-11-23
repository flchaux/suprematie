# Client (packages/client)

Spécification : docs/spec/rendu.md (rendu, interface, sons, modèles 3D).

## Contrôles
- `npx tsc --noEmit -p packages/client/tsconfig.json` : le projet a des erreurs connues (types TSL du rendu, `import.meta.glob`). Relever la liste avant de commencer et n'en ajouter aucune.
- Les fichiers `.svelte` ne sont vérifiés par aucun outil de types. Après avoir renommé ou retiré un champ ou une méthode, chercher ses usages dans `src/ui/*.svelte` et dans `tools/*.mjs` (les scénarios de navigateur lisent `window.__game.client`).
- `npm run test:js` et `npx eslint packages`.
- Navigateur : seulement pour l'affichage ou une interaction, une fois en fin de tâche (règle à la racine). Marche à suivre : skill `essai-navigateur`.

## Règles
- Le Worker (`src/game/worker.ts`) et `packages/shared` n'ont droit ni à l'horloge ni à l'aléatoire (ESLint le vérifie) : ils font tourner la simulation.
- Code exécuté à chaque image (`src/render/`) : pas d'allocation, de fermeture ni de copie de tableau dans les boucles par entité.
- Une animation liée au jeu suit le temps de la simulation (tick et fraction d'image), pas `performance.now()` : elle se fige en pause et se capture à un tick précis.
- Icônes : générées (skill `generer-images`), trouvées par clé (`src/ui/sprites.ts`). Une clé sans icône ou sans modèle garde un affichage de repli, sans erreur : rien ne signale l'oubli.
- Ce que le client lit de la simulation passe par `packages/shared/src/render.ts` (tampon de rendu) : un mot ajouté là a son double dans `sim/src/render.rs`.
