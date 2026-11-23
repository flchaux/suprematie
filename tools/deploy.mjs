// Met master en production : vérifie qu'aucune partie n'est en cours, construit, redémarre le service, contrôle.
//   npm run deploy             déploie si aucune partie n'est en cours
//   npm run deploy -- --etat   dit seulement si on peut déployer, sans rien changer
//
// Codes de sortie : 0 déployé (ou déployable avec --etat), 2 partie en cours (rien n'a changé), 1 erreur.
//
// Le service (tools/supreme.service) lance le code du dossier principal. Le client est construit à côté
// (packages/client/dist.next) puis mis en place juste avant le redémarrage : pendant la construction,
// la production n'a pas changé, et une partie lancée entre-temps n'est pas coupée.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE = "supreme";
const PORT = process.env.SUPREME_PORT ?? "3060";
const SITE = process.env.SUPREME_URL ?? "https://supreme.chaux.me";
const LOCK = join(homedir(), ".cache", "supreme-deploy.lock");

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const only = process.argv.includes("--etat");

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
const git = (...args) => run("git", args).stdout.trim();
const fail = (msg) => {
  console.error("Déploiement impossible : " + msg);
  process.exit(1);
};

// 1. le dossier : le dossier principal, sur master, sans modification en attente
const main = realpathSync(dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir")));
if (main !== root) fail(`ce dossier est un worktree. Lancer « npm --prefix ${main} run deploy ».`);
const branch = git("branch", "--show-current");
if (branch !== "master") fail(`le dossier principal est sur « ${branch || "aucune branche"} », pas sur master.`);
const dirty = git("status", "--porcelain", "--untracked-files=no");
if (dirty) fail("des fichiers suivis sont modifiés et non validés :\n" + dirty);
const key = (process.env.SUPREME_KEY ?? readFileSync(join(root, "data/key.txt"), "utf8")).trim();

// 2. l'état du service : une partie en cours interdit le déploiement
const active = () => run("systemctl", ["is-active", SERVICE]).stdout.trim() === "active";
async function status() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/status?k=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { error: `le service répond ${r.status}` };
    return await r.json();
  } catch (e) {
    return { error: String(e.cause?.code ?? e.message) };
  }
}
/** Dit pourquoi on ne peut pas déployer ; null si on peut. */
async function busy() {
  const s = await status();
  if (s.error) {
    if (active()) fail(`le service est actif mais ne répond pas (${s.error}).`);
    console.log("Le service est arrêté : aucune partie en cours.");
    return null;
  }
  if (s.lobby?.running || s.game) {
    const humans = (s.lobby?.players ?? []).filter((p) => !p.bot).length;
    return `une partie est en cours (tick ${s.game?.tick ?? s.lobby?.tick ?? "?"}, ${humans} joueur(s) humain(s)).`;
  }
  const waiting = (s.lobby?.players ?? []).filter((p) => !p.bot && p.connected).length;
  if (waiting) console.log(`Aucune partie en cours ; ${waiting} joueur(s) dans le salon seront déconnectés un instant.`);
  return null;
}
const stop = (why) => {
  console.log("Pas de déploiement : " + why + " Rien n'a changé en production ; relancer plus tard.");
  process.exit(2);
};

let why = await busy();
if (why) stop(why);
if (only) {
  console.log("Aucune partie en cours : on peut déployer.");
  process.exit(0);
}

// 3. un seul déploiement à la fois sur la machine
mkdirSync(dirname(LOCK), { recursive: true });
try {
  closeSync(openSync(LOCK, "wx"));
} catch {
  const pid = Number(readFileSync(LOCK, "utf8"));
  let alive = false;
  try {
    alive = pid > 0 && (process.kill(pid, 0), true);
  } catch {}
  if (alive) fail(`un autre déploiement est en cours (processus ${pid}).`);
}
writeFileSync(LOCK, String(process.pid));
const unlock = () => {
  try {
    unlinkSync(LOCK);
  } catch {}
};
process.on("exit", unlock);

// 4. construction à côté : la simulation, puis le client dans dist.next
const next = join(root, "packages/client/dist.next");
const dist = join(root, "packages/client/dist");
const old = join(root, "packages/client/dist.old");
const step = (label, cmd, args) => {
  console.log("— " + label);
  const r = run(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) fail(`« ${label} » a échoué. La production n'a pas changé.`);
};
rmSync(next, { recursive: true, force: true });
step("simulation", process.execPath, ["tools/build-sim.mjs"]);
step("client", "npm", ["run", "build", "-w", "@supreme/client", "--", "--outDir", "dist.next", "--emptyOutDir"]);
if (!existsSync(join(next, "index.html")) || !existsSync(join(next, "sim.wasm"))) fail("la construction n'a pas produit index.html et sim.wasm.");

// 5. une partie a pu commencer pendant la construction
why = await busy();
if (why) {
  rmSync(next, { recursive: true, force: true });
  stop(why);
}

// 6. mise en place et redémarrage
rmSync(old, { recursive: true, force: true });
if (existsSync(dist)) renameSync(dist, old);
renameSync(next, dist);
const r = run("sudo", ["-n", "systemctl", "restart", SERVICE]);
if (r.status !== 0) {
  // on remet l'ancien client : le service, lui, tourne encore avec l'ancien code
  renameSync(dist, next);
  if (existsSync(old)) renameSync(old, dist);
  fail("le redémarrage a été refusé (" + (r.stderr.trim() || "code " + r.status) + "). L'ancien client a été remis en place.");
}
rmSync(old, { recursive: true, force: true });

// 7. contrôle : service actif, réponse locale, réponse publique
let ok = false;
for (let i = 0; i < 30 && !ok; i++) {
  await new Promise((res) => setTimeout(res, 500));
  ok = active() && !(await status()).error;
}
if (!ok) fail("le service n'a pas répondu dans les 15 s après le redémarrage. Voir « journalctl -u supreme -n 50 ».");
let web = "";
try {
  web = String((await fetch(`${SITE}/?k=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15000) })).status);
} catch (e) {
  web = String(e.cause?.code ?? e.message);
}
if (web !== "200") fail(`le service est actif, mais ${SITE} répond « ${web} ».`);
const ahead = git("rev-list", "--count", "refs/remotes/origin/master..master");
console.log(`Déployé : ${git("log", "-1", "--format=%h %s")}`);
console.log(`Service actif, ${SITE} répond 200.` + (ahead !== "0" ? ` Attention : ${ahead} commit(s) de master ne sont pas poussés.` : ""));
