// Chariots de convoi sélectionnés dans la démo « nomades » (affichage seulement ; les règles sont testées en Rust,
// sim/src/chariots_tests.rs) : sans Maj, un trait relie la soute de chaque chariot au module qu'il dessert, et la
// fiche propose « Collecte » ; une capture, aucune erreur dans la page (ni de pipeline en WebGPU).
// Usage : node tools/e2e-chariots.mjs http://127.0.0.1:3061 [dossier des captures]
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
await page.goto(`${base}/?k=testkey&demo=nomades${webgpu ? "" : "&webgl"}`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0 && window.__game.ui.me === 0, null, { timeout: 150000 });
await page.mouse.move(640, 300);
const STOP = 80;
await page.evaluate((t) => window.__game.client.stopReplayAt(t), STOP);
await page.waitForFunction((t) => window.__game.client.frame.tick >= t, STOP, { timeout: 240000 });
if (webgpu) check(await page.evaluate(() => !!window.__game.client.scene.renderer.backend.isWebGPUBackend), "rendu WebGPU");

// les trois chariots de la démo : sélection, caméra au-dessus de la soute
const carts = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const k = ui.data.units.findIndex((u) => u.key === "t_cart");
  const ids = [];
  let x = 0;
  let z = 0;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if ((f.buf[o + 1] & 0xff) !== k) continue;
    ids.push(f.buf[o] >>> 0);
    x += f.buf[o + 2] / 256;
    z += f.buf[o + 3] / 256;
  }
  client.selectIds(ids);
  const sc = client.scene;
  sc.target.set(x / Math.max(1, ids.length), 0, z / Math.max(1, ids.length));
  sc.distance = 46;
  sc.tilt = 1.35;
  sc.updateCamera();
  return ids;
});
check(carts.length === 3, "trois chariots sélectionnés", String(carts.length));
await page.waitForFunction(() => {
  const l = window.__game.client.scene.overlay?.lines;
  return !!l && l.visible && l.geometry.drawRange.count >= 6;
}, null, { timeout: 240000 }).catch(() => {});
const segs = await page.evaluate(() => {
  const l = window.__game.client.scene.overlay?.lines;
  return l && l.visible ? l.geometry.drawRange.count / 2 : 0;
});
// un trait par chariot : de la soute à la fonderie (deux) et à l'assembleur (un)
check(segs >= 3, "traits soute → module des chariots sélectionnés (sans Maj)", String(segs));
const gather = await page.evaluate(() => [...document.querySelectorAll("button.cmd")].some((b) => (b.getAttribute("title") ?? "").startsWith("Collecte")));
check(gather, "bouton « Collecte » dans la fiche des chariots");
await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 6 ? r() : requestAnimationFrame(f)); f(); }));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/chariots-navettes.png`, timeout: 240000 });
console.log(`capture : ${outDir}/chariots-navettes.png`);
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
console.log(`erreurs de la page : ${errors.length}`);
await browser.close();
process.exit(failed ? 1 : 0);
