---
name: comparer-perf
description: Comparer le temps par tick de la simulation entre une branche et master sur cette machine partagée. À utiliser avant de fusionner un changement de sim/ qui peut coûter du temps, ou quand npm run bench donne un chiffre douteux.
---

# Comparer la performance de deux versions de la simulation

Un seul chiffre ne prouve rien ici : la machine a 4 cœurs, partagés avec d'autres sessions et avec le serveur de jeu. Le même code a donné 0,526 puis 0,560 ms par tick à une heure d'écart. On compare donc les deux versions **en alternance, au même moment**.

## Marche à suivre

1. Compiler la version à tester : `npm run build:sim` dans le worktree de la branche.
2. Compiler la référence (master) à part, sans toucher au dossier principal :
   ```
   git worktree add --detach <dossier temporaire>/base master
   node <dossier temporaire>/base/tools/build-sim.mjs
   ```
   Le fichier produit est `<dossier temporaire>/base/packages/client/public/sim.wasm`.
3. Lancer en alternance, trois fois chacune :
   ```
   node tools/bench/stress.ts 1400 --wasm <dossier temporaire>/base/packages/client/public/sim.wasm
   node tools/bench/stress.ts 1400
   ```
   `stress.ts` joue la partie de référence (8 joueurs, 8 000 unités, environ 40 000 bâtiments et tapis, sans bots) et n'écrit rien.
4. Relever la charge avec `uptime`. Au-delà de 4, les chiffres bougent de plusieurs pour cent d'un passage à l'autre.
5. Retirer la référence : `git worktree remove <dossier temporaire>/base`.

## Lire le résultat

- Un écart plus petit que celui qui sépare deux passages de la même version n'est pas un résultat : le dire tel quel, sans conclure.
- L'objectif de la partie de référence est de moins de 25 ms par tick.
- `stress.ts` ne fait pas tourner les bots. `npm run bench` (8 bots, 0,5 ms par tick environ) joue une partie qui change dès que le comportement de la simulation ou des bots change : ses chiffres d'avant et d'après ne se comparent alors pas.
- `npm run bench` réécrit `tools/bench/last.json` : `git checkout tools/bench/last.json` avant le commit.
- Les deux simulations sont pilotées par le `packages/shared/src/sim.ts` de la branche : si la branche change les exports de la simulation, la référence peut ne plus se charger. Dans ce cas, lancer `stress.ts` dans chacun des deux dossiers.
