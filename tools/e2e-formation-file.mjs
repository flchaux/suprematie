// Formation en file dans la démo « formation » : l'armée mêlée reçoit deux Maj + clic droit (vers l'est,
// puis vers le sud), à la souris. Contrôles : deux ordres de déplacement en file (drapeaux 1 et 8), groupe
// rangé en rangées droites au premier point (capture), disposition gardée en route vers le second
// (capture), arrivée en rangées face au sud (capture). La démo est figée au chargement puis avancée par
// sauts (stopReplayAt) aux ticks relevés en Node : arrivée au premier point 289 ticks après l'ordre.
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
// démo figée pendant qu'on vise (le rendu logiciel est lent) ; les ordres partent au tick d'arrêt + 3
const T0 = await page.evaluate(() => { const c = window.__game.client; c.stopReplayAt(c.frame.tick + 2); return c.frame.tick + 2; });
await page.waitForFunction((t) => window.__game.client.frame.tick >= t, T0, { timeout: 60000 });

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
// ticks relevés en Node pour cette démo (voir le commentaire d'en-tête) : arrivée au premier point
// t+289, mi-chemin vers le second t+400, arrivée et orientation finales avant t+600
await page.evaluate(() => window.__game.client.setReplaySpeed(4));
const goTo = async (t) => {
  await page.evaluate((t) => window.__game.client.stopReplayAt(t), t);
  await page.waitForFunction((t) => window.__game.client.frame.tick >= t, t, { timeout: 300000, polling: 500 });
  return army();
};
const centre = (a) => ({ x: a.units.reduce((s, u) => s + u.x, 0) / n / TILE, z: a.units.reduce((s, u) => s + u.y, 0) / n / TILE });
// rangées : positions le long d'un axe regroupées à 0,4 case près
const rows = (vals) => {
  const s = [...vals].sort((p, q) => p - q);
  let k = s.length ? 1 : 0;
  for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > 0.4 * TILE) k++;
  return k;
};
const T = T0 + 3;
let a1 = await goTo(T + 289);
let c1 = centre(a1);
check(Math.hypot(c1.x - p1.x, c1.z - p1.z) < 1.5, "au premier point au tick prévu", `centre à ${Math.hypot(c1.x - p1.x, c1.z - p1.z).toFixed(2)} case`);
await look(c1.x, c1.z, 30);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/formation-file-point1.png`, timeout: 180000 });
a1 = await goTo(T + 400);
c1 = centre(a1);
await look(c1.x, c1.z, 30);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/formation-file-trajet.png`, timeout: 180000 });
const end = await goTo(T + 620);
const c2 = centre(end);
check(Math.hypot(c2.x - p2.x, c2.z - p2.z) < 1, "arrivé au second point", `centre à ${Math.hypot(c2.x - p2.x, c2.z - p2.z).toFixed(2)} case`);
check(rows(end.units.map((u) => u.y)) === 4, "arrivée : quatre rangées droites face au sud", `${rows(end.units.map((u) => u.y))} rangées`);
// angle du dernier segment (le clic n'est pas exactement au sud du premier point)
const [o1, o2] = cmds;
const face = Math.round((Math.atan2(o2[3] - o1[3], o2[2] - o1[2]) / (2 * Math.PI)) * 65536) & 0xffff;
const off = end.units.filter((u) => Math.abs(((u.facing - face + 32768) & 0xffff) - 32768) > 100).map((u) => u.facing);
check(off.length === 0, "chacun tourné vers le second segment (sud)", `attendu ${face}${off.length ? ", écarts : " + off.join(" ") : ""}`);
await look(p2.x, p2.z, 30);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/formation-file-arrivee.png`, timeout: 180000 });
check(errors.length === 0, "aucune erreur", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
