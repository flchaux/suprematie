# Suprématie

STR multijoueur dans le navigateur : chaînes de production physiques façon Factorio, batailles façon Supreme Commander.
Spécification : [docs/SPEC.md](docs/SPEC.md). Règles pour Claude Code : [CLAUDE.md](CLAUDE.md).

## Jouer

Ouvrir le lien d'invitation `https://supreme.chaux.me/?k=<code>` dans Chrome (code dans `data/key.txt`).
Le premier arrivé est l'hôte du salon : il ajoute les IA (Adaptative, Rush, Tortue, Technologique, variante AIx),
règle les équipes et la carte, puis lance la partie. Aide en jeu : F1.

- `?demo` : partie de référence synthétique (8 armées, 8 000 unités) jouée localement, pour tester le rendu.
- `?webgl` : force le moteur WebGL2 au lieu de WebGPU.

## Développement

| Commande | Rôle |
| --- | --- |
| `npm run build` | Compile `sim.wasm` (Rust) puis le client (Vite) |
| `npm test` | Tests Rust, Clippy, ESLint, Vitest, déterminisme sur 10 000 ticks avec snapshot/restore |
| `npm run test:browser` | Déterminisme Node.js / Chrome |
| `npm run bench` | Banc de performance : 8 IA, temps de simulation (moyenne, p99) et temps des IA |
| `npm run test:bots` | Partie entre IA jusqu'à la victoire, sans désynchronisation |
| `node tools/bench/stress.ts` | Partie de référence synthétique en WebAssembly (objectif < 25 ms/tick) |
| `npm run viewer:capture` | Capture du visualiseur de modèles (`tools/viewer`) |
| `node tools/sync-test.mjs 10000` | Deux onglets Chrome reliés par le relais, ordres aléatoires (serveur de test : `tools/testserver.sh`) |
| `node tools/e2e-reconnect.mjs` | Reconnexion, abandon, fin de partie et replay |

Rust est installé par apt (`/usr/lib/rust-1.97/bin`). L'interface WebAssembly est faite d'exports bruts
(`init`, `step`, `render_buffer`, `snapshot`, `restore`…) enveloppés par `packages/shared/src/sim.ts`.

## Déploiement

Service systemd `supreme` (port local 3060, `tools/supreme.service`), derrière Caddy (`/etc/caddy/Caddyfile`, bloc
`supreme.chaux.me`, HTTPS automatique). Mise à jour : `npm run build && sudo systemctl restart supreme`.
Replays : `data/replays/`. Rapports de désynchronisation : `data/desync/`.
