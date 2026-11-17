// Statistiques de partie : relevés toutes les 30 s, filtrés par équipe pendant la partie (joueur),
// complets pour un spectateur, repris après rechargement, rapport de fin avec tous les joueurs,
// historique dans le fichier de replay et rapport affiché à la fin de la lecture du replay.
// Serveur de test à lancer à part, par exemple :
//   PORT=3081 SUPREME_KEY=testkey SUPREME_DATA=/tmp/claude-1000/stats-testdata node packages/server/src/main.ts
// Usage : PORT=3081 node tools/e2e-stats.mjs [dossier des captures]
import { launchBrowser } from "./browser.mjs";

const port = process.env.PORT ?? "3081";
const shots = process.argv[2] ?? "/tmp/claude-1000";
const base = `http://127.0.0.1:${port}/?k=testkey&webgl`;
const fail = (m) => {
  console.log("ÉCHEC :", m);
  process.exitCode = 1;
};

const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("erreur", e.message));
await p.goto(base + "&norender");
await p.evaluate(() => localStorage.clear());
await p.goto(base + "&norender");
await p.fill("input", "Rita");
await p.click("button[type=submit]");
await p.waitForSelector("text=Ajouter une IA");
await p.click("button:has-text('Adaptative')");
await p.click("button:has-text('Lancer la partie')");
await p.waitForFunction(() => window.__game?.client.frame?.tick > 0, null, { timeout: 60000 });

// spectateur arrivé en cours de partie : voit tous les joueurs
const sctx = await browser.newContext();
const s = await sctx.newPage();
s.on("pageerror", (e) => console.log("erreur spectateur", e.message));
await s.goto(base + "&norender");
await s.fill("input", "Spectre");
await s.click("button[type=submit]");
await s.waitForFunction(() => window.__game?.client.frame?.tick > 0 && window.__game.ui.spectator, null, { timeout: 60000 });

// au moins deux relevés (tick 0 et tick 600), on en attend quatre pour des courbes parlantes
await p.waitForFunction((n) => window.__game.ui.stats.length >= n, Number(process.env.SAMPLES ?? 4), { timeout: 600000 });
const mine = await p.evaluate(() => ({ me: window.__game.ui.me, stats: window.__game.ui.stats, teams: window.__game.ui.players.map((x) => x.team) }));
console.log("relevés reçus par le joueur :", mine.stats.map((x) => x.tick).join(", "), "· équipes", mine.teams.join(", "));
const nPlayers = mine.teams.length;
const team = mine.teams.map((t, i) => i).filter((i) => mine.teams[i] === mine.teams[mine.me]);
if (team.length === nPlayers) fail("aucun adversaire : salon pas vide au départ ? (relancer le serveur de test)");
// relevé présent pour l'équipe du joueur, null pour les autres
const filtered = (stats) => stats.every((x) => x.players.every((pl, i) => (pl !== null) === team.includes(i)));
if (!filtered(mine.stats)) fail("le joueur voit les relevés d'un adversaire (ou pas ceux de son équipe)");
console.log("relevé du joueur :", JSON.stringify(mine.stats[mine.stats.length - 1].players[mine.me]));
const spec = await s.evaluate(() => window.__game.ui.stats);
if (spec.length < 4 || spec.some((x) => x.players.length !== nPlayers || x.players.some((pl) => !pl))) fail("le spectateur ne voit pas tous les joueurs");

// fenêtre des statistiques : tableau des joueurs et courbes limités à l'équipe du joueur
await p.evaluate(() => (window.__game.ui.showStats = true));
await p.waitForSelector(".modal >> text=Joueurs");
const tableRows = await p.locator(".modal section:nth-child(2) tbody tr").count();
if (tableRows !== team.length) fail(`tableau des joueurs : ${tableRows} lignes au lieu de ${team.length}`);
await p.click("button[role=tab]:has-text('Courbes')");
await p.waitForSelector(".modal figure.chart svg");
const curves = await p.evaluate(() => ({
  charts: document.querySelectorAll(".modal figure.chart").length,
  linesFirst: document.querySelectorAll(".modal figure.chart")[0].querySelectorAll("path.line").length,
  legend: [...document.querySelectorAll(".modal .legend .who")].map((e) => e.textContent.trim()),
}));
console.log("courbes en partie :", JSON.stringify(curves));
if (curves.charts !== 6 || curves.linesFirst !== team.length || curves.legend.length !== team.length) fail("les courbes montrent d'autres joueurs que l'équipe");
await p.screenshot({ path: `${shots}/stats-courbes.png` });
// survol : valeurs au relevé le plus proche
const svg = p.locator(".modal figure.chart svg").first();
const box = await svg.boundingBox();
await p.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
if (!(await p.locator(".modal .tip-box").first().isVisible())) fail("pas d'infobulle au survol");

// rechargement : l'historique (filtré) revient avec l'état complet
await p.reload();
await p.waitForFunction(() => window.__game?.client.frame?.tick > 0 && window.__game.ui.stats.length >= 4, null, { timeout: 60000 });
const again = await p.evaluate(() => window.__game.ui.stats);
if (!filtered(again)) fail("historique non filtré après rechargement");
console.log("après rechargement :", again.length, "relevés");

// abandon → rapport de fin avec tous les joueurs
await p.evaluate(() => window.__game.client.surrender());
await p.waitForFunction(() => window.__game.ui.gameOver, null, { timeout: 30000 });
await p.waitForSelector(".endwrap table");
const end = await p.evaluate(() => ({
  go: window.__game.ui.gameOver,
  stats: window.__game.ui.stats,
  rows: document.querySelectorAll(".endwrap tbody tr").length,
  legend: document.querySelectorAll(".endwrap .legend .who").length,
  lines: document.querySelectorAll(".endwrap figure.chart")[0]?.querySelectorAll("path.line").length ?? 0,
  duration: document.querySelector(".endwrap .dur .num")?.textContent,
}));
console.log("rapport de fin :", end.rows, "joueurs,", end.stats.length, "relevés, durée", end.duration);
if (end.rows !== nPlayers || end.legend !== nPlayers || end.lines !== nPlayers) fail("le rapport de fin ne montre pas tous les joueurs");
if (end.stats.some((x) => x.players.length !== nPlayers || x.players.some((pl) => !pl))) fail("historique de fin incomplet");
await p.screenshot({ path: `${shots}/stats-fin-norender.png` });

// fichier de replay : contient l'historique ; lecture rendue (sans norender) jusqu'au rapport de fin
const rep = await p.evaluate(async (u) => (await fetch(u)).json(), end.go.replay);
if (!Array.isArray(rep.stats) || rep.stats.length !== end.stats.length) fail("historique absent du fichier de replay");
for (const width of [1400, 900]) {
  const r = await ctx.newPage();
  await r.setViewportSize({ width, height: width === 900 ? 700 : 900 });
  r.on("pageerror", (e) => console.log("erreur replay", e.message));
  await r.goto(base);
  await r.waitForFunction(() => window.__game, null, { timeout: 20000 });
  await r.evaluate((u) => window.__game.client.loadReplay(u), end.go.replay);
  await r.waitForFunction(() => window.__game.client.frame?.tick > 0, null, { timeout: 60000 });
  await r.evaluate(() => window.__game.client.setReplaySpeed(16));
  await r.waitForFunction(() => window.__game.ui.gameOver, null, { timeout: 300000 });
  await r.waitForTimeout(800);
  const rows = await r.locator(".endwrap tbody tr").count();
  const charts = await r.locator(".endwrap figure.chart").count();
  console.log(`replay ${width} px : rapport ${rows} joueurs, ${charts} courbes`);
  if (rows !== nPlayers || charts !== 6) fail("rapport de fin du replay incomplet");
  await r.screenshot({ path: `${shots}/stats-fin-${width}.png` });
  await r.close();
}
await browser.close();
console.log(process.exitCode ? "ÉCHEC" : "OK");
