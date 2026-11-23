// Prépare ce dossier (dossier principal ou worktree) pour lancer les tests et les outils.
//   npm run setup            liens du code partagé, puis compilation de la simulation
//   npm run setup -- --liens liens seulement
//
// Un worktree n'a ni node_modules ni sim.wasm. Les dépendances se trouvent toutes seules : Node, Vite
// et Vitest remontent jusqu'au node_modules du dossier principal. Mais « @supreme/shared » y mène au
// code partagé du dossier principal, pas à celui du worktree. Vite et Vitest sont réglés par un alias
// (tools/shared-alias.mjs) ; pour Node (serveur, bots, tools/bench), ce script crée dans le worktree
// un node_modules qui ne contient que des liens vers ses propres paquets.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" }).stdout.trim();
const main = realpathSync(dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir")));
const worktree = main !== root;

if (!existsSync(join(main, "node_modules"))) {
  console.error(`Pas de node_modules dans ${main} : y lancer « npm install » d'abord.`);
  process.exit(1);
}

if (worktree) {
  // un vrai « npm install » dans le worktree a déjà posé ces liens : on ne touche à rien
  const installed = existsSync(join(root, "node_modules", ".package-lock.json"));
  if (!installed) {
    for (const dir of readdirSync(join(root, "packages"))) {
      const manifest = join(root, "packages", dir, "package.json");
      if (!existsSync(manifest)) continue;
      const name = JSON.parse(readFileSync(manifest, "utf8")).name;
      const link = join(root, "node_modules", name);
      const target = relative(dirname(link), join(root, "packages", dir));
      mkdirSync(dirname(link), { recursive: true });
      const there = lstatSync(link, { throwIfNoEntry: false });
      if (there?.isSymbolicLink() && readlinkSync(link) === target) continue;
      if (there) unlinkSync(link);
      symlinkSync(target, link, "dir");
    }
  }
  // contrôle : depuis le serveur, le code partagé doit être celui de ce dossier
  const found = realpathSync(createRequire(join(root, "packages/server/src/main.ts")).resolve("@supreme/shared"));
  if (!found.startsWith(root + "/")) {
    console.error(`« @supreme/shared » mène à ${found}, hors de ce worktree : les outils Node liraient le code partagé du dossier principal.`);
    process.exit(1);
  }
  console.log(`Worktree de ${main} : « @supreme/shared » mène à ${relative(root, found)}.`);
}

if (!process.argv.includes("--liens")) {
  const r = spawnSync(process.execPath, [join(root, "tools/build-sim.mjs")], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log("Prêt : npm run test:js, npm run test:rust, npm run test:determinism, node tools/bench/…");
