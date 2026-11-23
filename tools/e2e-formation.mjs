// Formation orientée dans la démo « formation » : une armée mêlée (motos, chars, artilleries, marcheurs, robots,
// glisseurs) en bloc tourné vers l'est reçoit un clic droit glissé vers le sud, à la souris. Contrôles : aperçu
// pendant le glisser (places calculées par la simulation), ordre envoyé (drapeaux 4 et 8, angle), arrivée en
// rectangle face au sud, aux places de l'aperçu, les plus résistants devant et l'artillerie derrière.
// La démo est figée au chargement puis avancée par sauts (stopReplayAt) : le rendu logiciel est lent.
// Usage : node tools/e2e-formation.mjs http://127.0.0.1:3061 [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser();
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
const TILE = 256;

const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const url = `${base}/?k=testkey&demo=formation&webgl`;
await page.goto(url);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false })); });
await page.goto(url);
await page.waitForFunction(() => window.__game?.client.frame?.nUnits > 0, null, { timeout: 150000 });

// unités du joueur 0 (sauf le commandant) : identifiant, type, position (sous-unités), orientation (16 bits)
const army = () => page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if (((f.buf[o + 1] >> 8) & 0xff) !== 0) continue;
    // le commandant reste hors du groupe
    if (client.data.units[f.buf[o + 1] & 0xff].key === "commander") continue;
    out.push({ id: f.buf[o] >>> 0, key: client.data.units[f.buf[o + 1] & 0xff].key, x: f.buf[o + 2], y: f.buf[o + 3], facing: f.buf[o + 6] & 0xffff });
  }
  return { tick: f.tick, units: out };
});
// démo figée pendant qu'on vise ; l'ordre part au tick d'arrêt + 3
const T0 = await page.evaluate(() => { const c = window.__game.client; c.stopReplayAt(c.frame.tick + 2); return c.frame.tick + 2; });
await page.waitForFunction((t) => window.__game.client.frame.tick >= t, T0, { timeout: 60000 });
const start = await army();
const n = start.units.length;
check(n === 24, "armée de la démo", `${n} unités`);
const cx = start.units.reduce((a, u) => a + u.x, 0) / n / TILE;
const cz = start.units.reduce((a, u) => a + u.y, 0) / n / TILE;
// but : 30 cases à l'est, 12 au sud ; glisser de 5 cases vers le sud
const goal = { x: cx + 30, z: cz + 12 };
const dragTo = { x: goal.x, z: goal.z + 5 };
await page.evaluate(([x, z, ids]) => {
  const { client } = window.__game;
  const sc = client.scene;
  sc.target.set(x, 0, z);
  sc.distance = 75;
  sc.updateCamera();
  client.selectIds(ids);
  // ordres envoyés au worker (la démo applique les ordres en local)
  window.__cmds = [];
  const post = client.worker.postMessage.bind(client.worker);
  client.worker.postMessage = (m) => {
    if (m?.type === "demoCmd") window.__cmds.push(m.cmd);
    post(m);
  };
}, [cx + 15, cz + 8, start.units.map((u) => u.id)]);
await page.waitForTimeout(1000);

// point de la page dont le sol visé est (x, z), sur le canevas (pas sous l'interface)
const screenOf = (x, z) => page.evaluate(([x, z]) => {
  const { client } = window.__game;
  const r = client.canvasEl.getBoundingClientRect();
  let best = { x: 0, y: 0, d: Infinity };
  for (let sy = 60; sy < r.height - 20; sy += 3) {
    for (let sx = 20; sx < r.width - 20; sx += 3) {
      const g = client.groundAt(sx, sy);
      if (!g) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d >= best.d) continue;
      const el = document.elementFromPoint(sx + r.left, sy + r.top);
      if (el !== client.canvasEl && !client.canvasEl.contains(el)) continue;
      best = { x: sx + r.left, y: sy + r.top, d };
    }
  }
  return best;
}, [x, z]);
const a = await screenOf(goal.x, goal.z);
const b = await screenOf(dragTo.x, dragTo.z);
check(a.d < 0.5 && b.d < 0.5, "but et fin du glisser visibles", `${a.d.toFixed(2)} ${b.d.toFixed(2)}`);

// clic droit glissé vers le sud, en plusieurs pas ; capture de l'aperçu avant de relâcher
await page.mouse.move(a.x, a.y);
await page.mouse.down({ button: "right" });
for (let k = 1; k <= 10; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 10, a.y + ((b.y - a.y) * k) / 10);
await page.waitForTimeout(500);
const preview = await page.evaluate(() => window.__game.client.scene.formArrows.count);
check(preview >= n, "aperçu de la formation pendant le glisser", `${preview} flèches`);
await page.screenshot({ path: `${outDir}/formation-apercu.png`, timeout: 180000 });
await page.mouse.up({ button: "right" });
await page.waitForTimeout(300);
const cmds = await page.evaluate(() => window.__cmds);
check(cmds.length === 1 && cmds[0][0] === 1 && (cmds[0][1] & 12) === 12, "un ordre de formation orientée", JSON.stringify(cmds.map((c) => c.slice(0, 6))));
const cmd = cmds[0] ?? [];
const angle = cmd[4];
check(Math.abs(((angle - 16384 + 32768) & 0xffff) - 32768) < 700, "angle : vers le sud", `${angle}`);
// places de l'ordre, lues dans la simulation avant qu'il parte (la démo est figée)
const list = await page.evaluate(([x, y, a, ids]) => window.__game.client.query("formation", [0, x, y, a, 0, ...ids]), [cmd[2], cmd[3], angle, start.units.map((u) => u.id)]);
const slots = new Map();
for (let i = 0; i + 2 < list.length; i += 3) slots.set(list[i] >>> 0, { x: list[i + 1], y: list[i + 2] });
check(slots.size === n, "une place par unité", `${slots.size}`);

// arrivée : trajet d'environ 35 cases à l'allure de l'artillerie (500 ticks au plus), puis le demi-tour
await page.evaluate(() => window.__game.client.setReplaySpeed(4));
const T = T0 + 3 + 640;
await page.evaluate((t) => window.__game.client.stopReplayAt(t), T);
await page.waitForFunction((t) => window.__game.client.frame.tick >= t, T, { timeout: 300000, polling: 500 });
const end = await army();
let far = 0;
for (const u of end.units) {
  const s = slots.get(u.id);
  if (s) far = Math.max(far, Math.hypot(u.x - s.x, u.y - s.y) / TILE);
}
check(far <= 0.5, "chacun à sa place de l'aperçu", `écart max ${far.toFixed(2)} case`);
const wrong = end.units.filter((u) => u.facing !== angle).map((u) => `${u.key}:${u.facing}`);
check(wrong.length === 0, "chacun tourné vers l'angle choisi", wrong.join(" "));
// rangées : avance le long de l'angle choisi, regroupée à 0,4 case près ; l'avant en premier
const rad = (angle / 65536) * 2 * Math.PI;
const ahead = new Map(end.units.map((u) => [u.id, u.x * Math.cos(rad) + u.y * Math.sin(rad)]));
const rows = [];
for (const u of [...end.units].sort((p, q) => ahead.get(q.id) - ahead.get(p.id))) {
  const last = rows[rows.length - 1];
  if (last && ahead.get(last[last.length - 1].id) - ahead.get(u.id) < 0.4 * TILE) last.push(u);
  else rows.push([u]);
}
check(rows.length === 4, "rangées droites", rows.map((r) => r.map((u) => u.key).sort().join(",")).join(" | "));
const rowOf = (key) => rows.flatMap((r, i) => r.filter((u) => u.key === key).map(() => i));
check(Math.max(...rowOf("hover_tank")) === 0, "les plus résistants (glisseurs) devant", `${rowOf("hover_tank")}`);
check(Math.min(...rowOf("artillery")) === rows.length - 1, "l'artillerie derrière", `${rowOf("artillery")}`);
await page.evaluate(([x, z]) => {
  const sc = window.__game.client.scene;
  sc.target.set(x, 0, z);
  sc.distance = 30;
  sc.updateCamera();
}, [goal.x, goal.z]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/formation-arrivee.png`, timeout: 180000 });
check(errors.length === 0, "aucune erreur", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
