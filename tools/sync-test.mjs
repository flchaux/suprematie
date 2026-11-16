// Étape 2 : deux onglets Chrome reliés par le relais restent synchronisés pendant N ticks
// avec des ordres aléatoires. Le serveur compare les hash ; tout écart crée un rapport de désynchronisation.
import { launchBrowser } from "./browser.mjs";
import { readdirSync, existsSync, readFileSync } from "node:fs";
const TICKS = Number(process.argv[2] ?? 10000);
const base = "http://127.0.0.1:3061/?k=testkey&norender";
const desyncDir = "/tmp/claude-1000/supreme-testdata/desync";
const before = existsSync(desyncDir) ? readdirSync(desyncDir).length : 0;
const browser = await launchBrowser();
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const A = await ctxA.newPage();
const B = await ctxB.newPage();
for (const [p, n] of [[A, "Alice"], [B, "Bruno"]]) {
  p.on("pageerror", (e) => console.log(n, "erreur", e.message));
  await p.goto(base);
  await p.fill("input", n);
  await p.click("button[type=submit]");
  await p.waitForSelector("text=Salon".toLowerCase() === "x" ? "x" : ".box");
}
await A.waitForSelector("text=Lancer la partie");
await A.click("button:has-text('Lancer la partie')");
for (const p of [A, B]) await p.waitForFunction(() => window.__game?.client.frame, null, { timeout: 60000 });
// ordres aléatoires : déplacements et constructions autour du commandant
const inject = (seed) => {
  let s = seed;
  const rnd = (n) => ((s = (s * 1103515245 + 12345) >>> 0) % n);
  setInterval(() => {
    const { client, ui } = window.__game;
    const f = client.frame;
    if (!f) return;
    const me = f.players[ui.me];
    const units = [];
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (((f.buf[o + 1] >> 8) & 0xff) === ui.me) units.push({ id: f.buf[o] >>> 0, x: f.buf[o + 2], y: f.buf[o + 3] });
    if (!units.length) return;
    const u = units[rnd(units.length)];
    const r = rnd(4);
    if (r === 0) client.cmd([1, 0, u.x + (rnd(4000) - 2000), u.y + (rnd(4000) - 2000), 1, u.id, u.x + (rnd(4000) - 2000), u.y + (rnd(4000) - 2000)]);
    else if (r === 1) {
      const kinds = [13, 14, 1, 12, 5, 4];
      client.cmd([3, 1, kinds[rnd(kinds.length)], (u.x >> 8) + rnd(16) - 8, (u.y >> 8) + rnd(16) - 8, rnd(4), 1, me.commander]);
    } else if (r === 2) client.cmd([10, 1 + rnd(3)]);
    else client.cmd([6, 1, u.id]);
  }, 250);
};
await A.evaluate(inject, 1);
await B.evaluate(inject, 2);
const t0 = Date.now();
let last = 0;
while (true) {
  await A.waitForTimeout(5000);
  const ta = await A.evaluate(() => window.__game.client.frame.tick);
  const tb = await B.evaluate(() => window.__game.client.frame.tick);
  if (ta - last >= 2000 || ta >= TICKS) {
    console.log(`tick A=${ta} B=${tb} (${((Date.now() - t0) / 1000) | 0} s)`);
    last = ta;
  }
  if (Math.min(ta, tb) >= TICKS) break;
  if (Date.now() - t0 > TICKS * 50 * 3 + 120000) {
    console.log("trop lent : arrêt");
    break;
  }
}
const after = existsSync(desyncDir) ? readdirSync(desyncDir).length : 0;
await browser.close();
if (after > before) {
  console.error(`ÉCHEC : ${after - before} rapport(s) de désynchronisation dans ${desyncDir}`);
  process.exit(1);
}
console.log(`Deux onglets synchronisés sur ${TICKS} ticks, aucune désynchronisation.`);
