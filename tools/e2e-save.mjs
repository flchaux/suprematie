// Sauvegarde et reprise d'une partie multijoueur : deux joueurs et une IA, sauvegarde en partie,
// redémarrage du serveur, chargement dans le salon (paramètres figés, lancement refusé tant qu'il manque
// un joueur), reprise au tick sauvegardé, synchronisation vérifiée.
// Serveur de test : tools/testserver.sh (port 3061, code testkey).
import { launchBrowser } from "./browser.mjs";
import { execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";

const base = "http://127.0.0.1:3061/?k=testkey&norender";
const desyncDir = "/tmp/claude-1000/supreme-testdata/desync";
const nDesync = () => (existsSync(desyncDir) ? readdirSync(desyncDir).length : 0);
const restartServer = () => execSync("bash tools/testserver.sh", { stdio: "inherit" });
const fail = (m) => {
  console.log("ÉCHEC :", m);
  process.exitCode = 1;
};

restartServer();
const d0 = nDesync();
const browser = await launchBrowser();
const pages = {};
const ctxs = {};
for (const name of ["Ana", "Bob"]) {
  const ctx = await browser.newContext();
  ctxs[name] = ctx;
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "erreur", e.message));
  await p.goto(base);
  await p.evaluate(() => localStorage.clear());
  await p.goto(base);
  await p.fill("input", name);
  await p.click("button[type=submit]");
  await p.waitForFunction(() => window.__game?.ui.lobby, null, { timeout: 20000 });
  pages[name] = p;
}
const A = pages.Ana;
let B = pages.Bob;
await A.waitForSelector("text=Ajouter une IA");
await A.click("button:has-text('Adaptative')");
await A.waitForTimeout(500);
await A.click("button:has-text('Lancer la partie')");
for (const p of [A, B]) await p.waitForFunction(() => window.__game?.client.frame?.tick > 600, null, { timeout: 90000 });
const slots = { Ana: await A.evaluate(() => window.__game.ui.me), Bob: await B.evaluate(() => window.__game.ui.me) };

// sauvegarde demandée par Bob (un joueur qui n'est pas l'hôte)
await B.evaluate(() => window.__game.client.saveGame());
await A.waitForFunction(() => window.__game.ui.messages.some((m) => m.text.includes("sauvegardée")), null, { timeout: 20000 });
const saves = await A.evaluate(async () => (await fetch("/api/saves")).json());
const manual = saves.find((s) => !s.auto);
if (!manual) fail("pas de sauvegarde manuelle");
console.log("sauvegarde :", manual.name, "tick", manual.tick, "joueurs", manual.players.map((p) => p.name).join(", "));

// Bob s'en va ; redémarrage du serveur : la partie en cours est aussi sauvegardée automatiquement
await B.close();
restartServer();
await A.waitForTimeout(1500);
const after = await A.evaluate(async () => (await fetch("/api/saves")).json());
if (!after.some((s) => s.auto && s.tick >= manual.tick)) fail("pas de sauvegarde automatique à l'arrêt du serveur");

// Ana revient seule et charge la sauvegarde
await A.reload();
await A.waitForFunction(() => window.__game?.ui.lobby && !window.__game.ui.lobby.running, null, { timeout: 20000 });
await A.evaluate((id) => window.__game.client.lobbyAction("loadSave", { id }), manual.id);
await A.waitForFunction(() => window.__game.ui.lobby.save, null, { timeout: 10000 });
const lob = await A.evaluate(() => window.__game.ui.lobby);
console.log("salon chargé :", lob.players.map((p) => `${p.slot}:${p.name}${p.bot ? "(IA)" : ""}${p.connected ? "" : "(libre)"}`).join(" "));
if (lob.players.length !== 3 || lob.players.filter((p) => !p.bot && !p.connected).length !== 1) fail("composition du salon chargé");
if (lob.players[slots.Ana]?.name !== "Ana" || !lob.players[slots.Ana].connected) fail("Ana n'a pas retrouvé sa place");
// paramètres figés : changer la carte ou ajouter une IA est refusé
await A.evaluate(() => {
  window.__game.client.lobbyAction("setMap", { mapSize: 1024 });
  window.__game.client.lobbyAction("addBot", { personality: "rush" });
});
await A.waitForTimeout(800);
const lob2 = await A.evaluate(() => window.__game.ui.lobby);
if (lob2.mapSize !== manual.mapSize || lob2.players.length !== 3) fail("les paramètres ont pu être modifiés");
if (!(await A.isDisabled("button:has-text('Reprendre la partie')"))) fail("le bouton de reprise devrait être désactivé");
await A.setViewportSize({ width: 1100, height: 760 });
await A.screenshot({ path: "tools/viewer/captures/e2e-save-salon.png" });
// lancement refusé : il manque Bob
await A.evaluate(() => window.__game.client.lobbyAction("start"));
await A.waitForTimeout(1500);
if (await A.evaluate(() => window.__game.ui.lobby.running)) fail("partie lancée alors qu'il manque un joueur");

// Bob revient (même navigateur : même pseudo) : il reprend automatiquement sa place
B = await ctxs.Bob.newPage();
B.on("pageerror", (e) => console.log("Bob erreur", e.message));
await B.goto(base);
await A.waitForFunction(() => window.__game.ui.lobby.players.every((p) => p.connected), null, { timeout: 20000 });
await A.click("button:has-text('Reprendre la partie')");
for (const p of [A, B]) await p.waitForFunction(() => window.__game?.client.frame?.tick > 0, null, { timeout: 60000 });
const t0 = { Ana: await A.evaluate(() => window.__game.client.frame.tick), Bob: await B.evaluate(() => window.__game.client.frame.tick) };
console.log("reprise au tick", JSON.stringify(t0), "(sauvegarde au tick", manual.tick + ")");
for (const n of ["Ana", "Bob"]) if (t0[n] < manual.tick - 1 || t0[n] > manual.tick + 60) fail(`${n} ne reprend pas au tick sauvegardé`);
const me = { Ana: await A.evaluate(() => window.__game.ui.me), Bob: await B.evaluate(() => window.__game.ui.me) };
if (me.Ana !== slots.Ana || me.Bob !== slots.Bob) fail(`places différentes : avant ${JSON.stringify(slots)}, après ${JSON.stringify(me)}`);
// la partie continue, synchronisée
for (const p of [A, B]) await p.waitForFunction((t) => window.__game.client.frame.tick > t + 600, manual.tick, { timeout: 90000 });
const dn = nDesync() - d0;
console.log("après 600 ticks : désynchronisations", dn);
if (dn > 0) fail("désynchronisation après la reprise");
// fin de partie : le replay doit couvrir toute la partie (avant et après la sauvegarde)
await A.evaluate(() => window.__game.client.surrender());
await B.evaluate(() => window.__game.client.surrender());
await A.waitForFunction(() => window.__game.ui.gameOver, null, { timeout: 30000 });
const go = await A.evaluate(() => window.__game.ui.gameOver);
const endTick = await A.evaluate(() => window.__game.client.frame.tick);
const r = await ctxs.Ana.newPage();
await r.goto(base);
await r.waitForFunction(() => window.__game, null, { timeout: 20000 });
await r.evaluate((u) => {
  window.__game.client.loadReplay(u);
  window.__game.client.setReplaySpeed(16);
}, go.replay);
await r.waitForFunction(() => window.__game.client.frame?.winner !== undefined && window.__game.client.frame.winner !== -1, null, { timeout: 180000 });
const rw = await r.evaluate(() => ({ tick: window.__game.client.frame.tick, winner: window.__game.client.frame.winner }));
console.log("replay rejoué depuis le début : vainqueur", rw.winner, "au tick", rw.tick, "(partie terminée vers le tick", endTick + ", équipe", go.winner + ")");
if (rw.winner !== go.winner) fail("le replay ne redonne pas le même vainqueur");
await browser.close();
console.log(process.exitCode ? "ÉCHEC" : "OK : sauvegarde et reprise");
