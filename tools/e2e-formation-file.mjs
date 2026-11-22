// Formation en file dans la démo « formation » : l'armée mêlée reçoit deux Maj + clic droit (vers l'est,
// puis vers le sud), à la souris. Contrôles : deux ordres de déplacement en file (drapeaux 1 et 8), groupe
// rangé en rangées droites au premier point (capture), disposition gardée en route vers le second
// (capture), arrivée en rangées face au sud (capture).
// Usage : node tools/e2e-formation-file.mjs http://127.0.0.1:3061 [dossier des captures]
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

// unités du joueur 0 (sauf le commandant) : identifiant, position (sous-unités), orientation (16 bits)
const army = () => page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if (((f.buf[o + 1] >> 8) & 0xff) !== 0) continue;
    if (client.data.units[f.buf[o + 1] & 0xff].key === "commander") continue;
    out.push({ id: f.buf[o] >>> 0, x: f.buf[o + 2], y: f.buf[o + 3], facing: f.buf[o + 6] & 0xffff });
  }
  return { tick: f.tick, units: out };
});
const start = await army();
const n = start.units.length;
const cx = start.units.reduce((a, u) => a + u.x, 0) / n / TILE;
const cz = start.units.reduce((a, u) => a + u.y, 0) / n / TILE;
const p1 = { x: cx + 22, z: cz };
const p2 = { x: cx + 22, z: cz + 22 };
const look = (x, z, d) => page.evaluate(([x, z, d]) => {
  const sc = window.__game.client.scene;
  sc.target.set(x, 0, z);
  sc.distance = d;
  sc.updateCamera();
}, [x, z, d]);
await page.evaluate((ids) => {
  const { client } = window.__game;
  client.selectIds(ids);
  window.__cmds = [];
  const post = client.worker.postMessage.bind(client.worker);
  client.worker.postMessage = (m) => {
    if (m?.type === "demoCmd") window.__cmds.push(m.cmd);
    post(m);
  };
}, start.units.map((u) => u.id));
await look(cx + 12, cz + 10, 80);
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
const a = await screenOf(p1.x, p1.z);
const b = await screenOf(p2.x, p2.z);
check(a.d < 0.6 && b.d < 0.6, "points visés visibles", `${a.d.toFixed(2)} ${b.d.toFixed(2)}`);
await page.keyboard.down("Shift");
await page.mouse.click(a.x, a.y, { button: "right" });
await page.mouse.click(b.x, b.y, { button: "right" });
await page.keyboard.up("Shift");
await page.waitForTimeout(300);
const cmds = await page.evaluate(() => window.__cmds);
check(cmds.length === 2 && cmds.every((c) => c[0] === 1 && (c[1] & 9) === 9), "deux déplacements en formation en file", JSON.stringify(cmds.map((c) => c.slice(0, 5))));
await page.evaluate(() => window.__game.client.setReplaySpeed(2));

// rangées : positions le long d'un axe regroupées à 0,4 case près
const rows = (vals) => {
  const s = [...vals].sort((p, q) => p - q);
  let k = s.length ? 1 : 0;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 0.4 * TILE) k++;
  return k;
};
const snap = async (name) => {
  await page.evaluate(() => window.__game.client.worker.postMessage({ type: "pause", paused: true }));
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 180000 });
  await page.evaluate(() => window.__game.client.worker.postMessage({ type: "pause", paused: false }));
};
let prev = start;
let atP1 = false;
let midway = false;
for (let round = 0; round < 200; round++) {
  const t0 = prev.tick;
  await page.waitForFunction((t0) => window.__game.client.frame.tick >= t0 + 10, t0, { timeout: 60000, polling: 50 });
  const cur = await army();
  const gx = cur.units.reduce((s, u) => s + u.x, 0) / n / TILE;
  const gz = cur.units.reduce((s, u) => s + u.y, 0) / n / TILE;
  if (!atP1 && Math.hypot(gx - p1.x, gz - p1.z) < 1) {
    atP1 = true;
    // au premier point : rangées perpendiculaires au trajet (vers l'est), donc peu de x distincts
    const r = rows(cur.units.map((u) => u.x));
    check(r <= 5, "au premier point : rangées droites face à l'est", `${r} rangées`);
    await look(gx, gz, 30);
    await snap("formation-file-point1");
  }
  if (atP1 && !midway && gz > p1.z + 9) {
    midway = true;
    const r = rows(cur.units.map((u) => u.y));
    check(r <= 6, "en route vers le second point : rangées gardées", `${r} rangées`);
    await look(gx, gz, 30);
    await snap("formation-file-trajet");
  }
  prev = cur;
  if (midway && cur.units.every((u) => u.facing === 16384) && Math.hypot(gx - p2.x, gz - p2.z) < 1) break;
}
const end = prev;
const r = rows(end.units.map((u) => u.y));
check(r <= 5, "arrivée : rangées droites face au sud", `${r} rangées`);
check(end.units.every((u) => u.facing === 16384), "chacun tourné vers le sud");
await look(p2.x, p2.z, 30);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/formation-file-arrivee.png`, timeout: 180000 });
check(errors.length === 0, "aucune erreur", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
