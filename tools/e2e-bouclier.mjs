// Chariots bouclier et variantes des Transhumants dans la démo « arche » (affichage seulement ; les règles sont
// testées en Rust, sim/src/bouclier_tests.rs) : quatre chariots bouclier, bulle levée sous le feu des chars, et
// quatre cavaliers nus côte à côte, chacun sa variante de pièces dépareillées ; aucune erreur dans la page.
// Usage : node tools/e2e-bouclier.mjs http://127.0.0.1:3061 [dossier des captures]
// Rendu WebGPU (WEBGPU=1) : sous xvfb-run -a -s "-screen 0 1280x800x24".
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const webgpu = !!process.env.WEBGPU;
const browser = await launchBrowser([], webgpu ? { headless: false } : {});
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=arche${webgpu ? "" : "&webgl"}`);
await page.waitForFunction(() => window.__game?.client.frame?.tick > 0, null, { timeout: 150000 });
await page.mouse.move(640, 300);
const stopAt = async (tick) => {
  await page.evaluate((t) => window.__game.client.stopReplayAt(t), tick);
  await page.waitForFunction((t) => window.__game.client.frame.tick >= t, tick, { timeout: 240000 });
};
await stopAt(160);
if (webgpu) check(await page.evaluate(() => !!window.__game.client.scene.renderer.backend.isWebGPUBackend), "rendu WebGPU");

/** Unités du joueur 0 d'une clé : référence et position (cases). */
const find = (key) => page.evaluate((key) => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const k = ui.data.units.findIndex((u) => u.key === key);
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === 0) out.push({ ref: f.buf[o] >>> 0, x: f.buf[o + 2] / 256, z: f.buf[o + 3] / 256 });
  return out;
}, key);
const look = async (x, z, distance) => {
  await page.evaluate(([x, z, distance]) => {
    const sc = window.__game.client.scene;
    sc.target.set(x, 0, z);
    sc.distance = distance;
    sc.updateCamera();
  }, [x, z, distance]);
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 6 ? r() : requestAnimationFrame(f)); f(); }));
  await page.waitForTimeout(3000);
};
const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/bouclier-${name}.png`, timeout: 240000 });
  console.log(`capture : ${outDir}/bouclier-${name}.png`);
};

const carts = (await find("t_shield_cart")).sort((a, b) => a.x - b.x);
check(carts.length === 4, "quatre chariots bouclier", String(carts.length));
// bulles : celles du joueur 0 dans la trame (boucliers actifs de ce tick)
const bubbles = await page.evaluate(() => window.__game.client.frame.nShields);
// la grande bulle de l'Arche et celles des quatre chariots (une bulle brisée sous le feu n'y est plus)
check(bubbles >= 4, "bulles levées dans la trame", String(bubbles));
const mid = carts.reduce((a, c) => a + c.x, 0) / Math.max(1, carts.length);
await look(mid, (carts[0]?.z ?? 0) + 2, 26);
await shot("chariots");
// quatre cavaliers nus côte à côte : variantes différentes
const riders = (await find("rider")).filter((r) => Math.abs(r.z - ((carts[0]?.z ?? 0) + 4)) < 1.5).sort((a, b) => a.x - b.x);
check(riders.length === 4, "quatre cavaliers nus côte à côte", String(riders.length));
if (riders.length) {
  await look((riders[0].x + riders[riders.length - 1].x) / 2, riders[0].z, 12);
  await shot("variantes");
}
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
