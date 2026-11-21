// Déplacement en formation orientée dans la démo « formation » : une armée mêlée (motos, chars, artilleries,
// marcheurs, robots, glisseurs) en bloc tourné vers l'est reçoit un clic droit glissé vers le sud, à la souris.
// Contrôles : aperçu pendant le glisser, ordre envoyé (drapeau 4, angle), disposition conservée et tournée d'un
// quart de tour, motos à l'allure des artilleries, arrivée ensemble, chacun à sa place et tourné vers le sud.
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
// démo en accéléré (×2) pour le trajet ; relevés à partir de l'ordre
await page.evaluate(() => window.__game.client.setReplaySpeed(2));
const atOrder = await army();

const cmds = await page.evaluate(() => window.__cmds);
check(cmds.length === 1 && cmds[0][0] === 1 && (cmds[0][1] & 4) !== 0, "un ordre de déplacement orienté", JSON.stringify(cmds.map((c) => c.slice(0, 6))));
const cmd = cmds[0] ?? [];
const angle = cmd[4];
check(Math.abs(((angle - 16384 + 32768) & 0xffff) - 32768) < 700, "angle : vers le sud", `${angle}`);
const slots = new Map();
for (let i = 6; i + 2 < cmd.length; i += 3) slots.set(cmd[i] >>> 0, { x: cmd[i + 1], y: cmd[i + 2] });
check(slots.size === n, "une place par unité", `${slots.size}`);
// disposition conservée, tournée d'un quart de tour : le groupe regardait l'est, il regarde le sud
// (écart au centre (dx, dy) → (-dy, dx))
const sx = [...slots.values()].reduce((s, p) => s + p.x, 0) / n;
const sy = [...slots.values()].reduce((s, p) => s + p.y, 0) / n;
let worst = 0;
for (const u of start.units) {
  const p = slots.get(u.id);
  if (!p) continue;
  const ex = -(u.y / TILE - cz), ey = u.x / TILE - cx;
  worst = Math.max(worst, Math.hypot((p.x - sx) / TILE - ex, (p.y - sy) / TILE - ey));
}
check(worst < 0.3, "places : disposition actuelle tournée d'un quart de tour", `écart max ${worst.toFixed(2)} case`);

// trajet : relevé toutes les 20 ticks ; vitesse des motos comparée à celle des artilleries
const speedOf = (k) => page.evaluate((k) => {
  const d = window.__game.client.data.units.find((u) => u.key === k);
  return (d.speed * 256) / 200;
}, k);
const vArt = await speedOf("artillery");
let prev = atOrder;
let motoMax = 0;
const arrived = new Map();
let mid = false;
for (let round = 0; round < 120; round++) {
  const t0 = prev.tick;
  await page.waitForFunction((t0) => window.__game.client.frame.tick >= t0 + 20, t0, { timeout: 60000, polling: 50 });
  const cur = await army();
  const dt = cur.tick - prev.tick;
  for (const u of cur.units) {
    const p = prev.units.find((v) => v.id === u.id);
    const s = slots.get(u.id);
    if (!p || !s) continue;
    const step = Math.hypot(u.x - p.x, u.y - p.y) / dt;
    if (u.key === "moto" && cur.tick > atOrder.tick + 40) motoMax = Math.max(motoMax, step);
    if (!arrived.has(u.id) && Math.hypot(u.x - s.x, u.y - s.y) <= TILE / 2) arrived.set(u.id, cur.tick);
  }
  if (!mid && cur.tick > atOrder.tick + 150) {
    mid = true;
    // la démo est mise en pause pendant la capture (lente en rendu logiciel) pour ne pas fausser les relevés
    await page.evaluate(() => window.__game.client.worker.postMessage({ type: "pause", paused: true }));
    await page.screenshot({ path: `${outDir}/formation-trajet.png`, timeout: 180000 });
    await page.evaluate(() => window.__game.client.worker.postMessage({ type: "pause", paused: false }));
  }
  prev = cur;
  const done = cur.units.every((u) => arrived.has(u.id) && u.facing === angle);
  if (done) break;
}
const end = prev;
console.log("vitesse max des motos :", motoMax.toFixed(1), "sous-unités/tick ; artillerie :", vArt.toFixed(1));
check(motoMax <= vArt * 1.15, "les motos avancent à l'allure des artilleries");
const times = [...arrived.values()];
check(arrived.size === n, "toutes arrivées à leur place", `${arrived.size}/${n}`);
const spread = Math.max(...times) - Math.min(...times);
check(spread <= 60, "arrivées ensemble", `écart ${spread} ticks, trajet de ${times.length ? Math.min(...times) - atOrder.tick : "?"} à ${times.length ? Math.max(...times) - atOrder.tick : "?"} ticks`);
// durée attendue : la plus longue distance à parcourir à la vitesse de l'artillerie (plus 1 s pour tourner)
const longest = Math.max(...atOrder.units.map((u) => { const p = slots.get(u.id); return p ? Math.hypot(u.x - p.x, u.y - p.y) : 0; }));
const expect = longest / vArt + 20;
check(Math.min(...times) - atOrder.tick >= expect * 0.85, "à l'allure de la plus lente", `attendu ≈ ${Math.round(expect)} ticks`);
let far = 0;
for (const u of end.units) {
  const s = slots.get(u.id);
  if (s) far = Math.max(far, Math.hypot(u.x - s.x, u.y - s.y) / TILE);
}
check(far <= 0.5, "chacun à sa place", `écart max ${far.toFixed(2)} case`);
const wrong = end.units.filter((u) => u.facing !== angle).map((u) => `${u.key}:${u.facing}`);
check(wrong.length === 0, "chacun tourné vers l'angle choisi", wrong.join(" "));
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
