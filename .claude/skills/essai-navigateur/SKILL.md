---
name: essai-navigateur
description: Vérifier un affichage ou une interaction du client dans un vrai navigateur sur ce serveur sans carte graphique (captures, scénarios tools/e2e-*.mjs, WebGPU réel, client d'un worktree). À utiliser une seule fois, en fin de tâche, quand la modification change l'affichage ou une interaction que les tests Node ne couvrent pas.
---

# Essai dans le navigateur

Le rendu est logiciel sur cette machine : un navigateur prend un à deux cœurs sur quatre et le jeu y avance à moins d'une image par seconde. D'où la règle : **un seul scénario, le plus court qui montre la modification, une seule fois en fin de tâche**. Les règles du jeu se testent en Rust ou dans Node, jamais ici.

## Lancer

- Toujours par `launchBrowser` de `tools/browser.mjs`, jamais `chromium.launch` : il prend un verrou pour toute la machine (un seul navigateur à la fois, les autres sessions attendent) et baisse la priorité.
- Partir d'un scénario existant (`tools/e2e-*.mjs`). `tools/e2e-essaim.mjs` est un bon modèle : il ouvre une démo, la fige à un tick, capture, et compte les erreurs de la page.
- Préférer une scène de démonstration (`?demo=…`, définies dans `sim/src/stress.rs`) à une partie lancée depuis le salon : elle démarre sur la situation voulue et tourne dans le Worker du navigateur.
- Seules certaines démos transmettent les ordres du joueur (voir `demoOrders` dans le code du client). Dans les autres, un bouton qui émet un ordre ne fait rien.

## Servir le client d'un worktree

1. `npm run setup` dans le worktree.
2. Construire le client hors du dépôt : depuis `packages/client`, `npx vite build --outDir <dossier temporaire>/dist --emptyOutDir`.
3. Choisir un port libre (`ss -ltn`), puis lancer le serveur en arrière-plan :
   `PORT=<port> SUPREME_KEY=testkey SUPREME_DATA=<dossier temporaire>/data SUPREME_DIST=<dossier temporaire>/dist node packages/server/src/main.ts`
4. Le scénario prend l'adresse en paramètre : `node tools/e2e-essaim.mjs http://127.0.0.1:<port> <dossier des captures>`.
5. Arrêter le serveur par son PID. Ne pas utiliser `tools/testserver.sh` quand d'autres sessions tournent : il partage un fichier de PID et arrêterait leur serveur.

Le serveur n'héberge qu'une partie à la fois et la garde après le passage du navigateur : le relancer entre deux scénarios qui passent par le salon.

## Capturer un moment précis

- `window.__game.client.stopReplayAt(tick)` arrête une démo ou un replay à ce tick (les images continuent, la caméra reste libre). Attendre `client.frame.tick >= tick`, puis quelques `requestAnimationFrame`, puis capturer. `stopReplayAt(1 << 30)` relance.
- L'appeler tout de suite après le chargement avec un petit tick, sinon la démo a déjà dépassé le moment voulu.
- Chercher le bon tick dans Node avant d'ouvrir le navigateur (chaque tick y coûte plusieurs secondes) : `Sim.load`, `sim.init([...])` avec les mêmes paramètres que `game/worker.ts`, la fonction de la démo, puis `sim.step([])` et `parseFrame(sim.render(…))`.
- Attendre `client.frame.nBuildings > 0` avant de lire la trame.
- Sous charge, `page.click`, `waitForSelector` et `screenshot` peuvent expirer alors que l'élément est là : cliquer par `page.evaluate(() => el.click())` et donner `timeout: 240000` aux captures.
- Mettre la souris au centre de la page au départ : au bord, elle fait défiler la carte.

## WebGPU réel

Par défaut les scénarios ajoutent `&webgl` (WebGL 2). Le vrai rendu WebGPU ne marche ici que :
- avec Chromium lancé avec une fenêtre (`launchBrowser([], { headless: false })`) sous `xvfb-run -a -s "-screen 0 1280x800x24"` ;
- sur une page `http://127.0.0.1` (pas d'`about:blank`), sans `&webgl`.

Vérifier que c'est bien WebGPU : `window.__game.client.scene.renderer.backend.isWebGPUBackend`. Les erreurs de pipeline (« Vertex buffer count (9) exceeds… », limite de 8 tampons de sommets) arrivent comme messages `error` de la console : les compter. À faire quand la modification touche les matériaux, les attributs de sommets ou les shaders.

## Rapport

Dire ce qui a été vu à l'écran et ce qui ne l'a pas été. Un contrôle du script qui échoue parce que le script attendait une mauvaise valeur se corrige et se relance ; il ne se laisse pas en échec dans le rapport.
