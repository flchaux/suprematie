# Suprématie

STR multijoueur dans le navigateur : chaînes de production physiques façon Factorio, batailles façon Supreme Commander.
Spécification : [docs/SPEC.md](docs/SPEC.md). Règles pour Claude Code : [CLAUDE.md](CLAUDE.md).

## Jouer

Ouvrir le lien d'invitation `https://supreme.chaux.me/?k=<code>` dans Chrome (code dans `data/key.txt`).
Le premier arrivé est l'hôte du salon : il ajoute les IA (Adaptative, Rush, Tortue, Technologique ; difficulté
Facile, Normal ou Difficile ; variante AIx), règle les équipes et la carte, puis lance la partie. Aide en jeu : F1.

L'IA (`packages/server/src/bots/`) s'inspire de celle du mod LOUD : cartes de menace par catégorie (`intel.ts`),
rapports de force qui orientent la production et la recherche, objectifs choisis selon leur valeur et leur défense,
pelotons qui se regroupent, jugent le combat et se replient (`army.ts`), chasseurs d'interception, frappes
aériennes sur l'économie, appels à l'aide et cible commune entre IA alliées.

- `?demo` : partie de référence synthétique (8 armées, 8 000 unités) jouée localement, pour tester le rendu.
- `?demo=eau` : carte avec de l'eau, sans les armées (aperçu du terrain).
- `?webgl` : force le moteur WebGL2 au lieu de WebGPU.

## Interface

Charte « holo-tactique » (`packages/client/src/ui/style.css`) : verre sombre bleu nuit, coins biseautés, traits
lumineux cyan (action, sélection) et ambre (recherche, attention), Chakra Petch pour les libellés et JetBrains Mono
pour les nombres (polices servies par le jeu, sans appel externe). Icônes de commandes : `ui/Icon.svelte` (vectorielles).

Les icônes d'objets, de bâtiments et d'unités et les illustrations sont générées avec l'API d'images d'OpenAI :
`tools/sprites/manifest.mjs` décrit chaque image (style commun + sujet), `node tools/sprites/generate.mjs [catégorie]
[clé…]` les génère (clé dans `OPENAI_API_KEY`, images brutes dans `tools/sprites/raw/`, non versionné), puis
`python3 tools/sprites/process.py` les réduit en WebP dans `packages/client/src/assets/sprites/`.

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
