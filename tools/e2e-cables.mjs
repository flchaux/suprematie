// Câbles des Transhumants dans la démo « nomades » (WebGPU réel) : la soute branchée au générateur et la
// file des trois poteaux. Contrôles : WebGPU, câbles construits (nombre, triangles, durée de reconstruction),
// une capture de haut et une rapprochée inclinée, aucune erreur de page ni de console (pipeline).
// La règle des paires et la forme de la courbe sont testées dans packages/client/test/cables.test.ts.
// Usage : xvfb-run -a -s "-screen 0 1280x800x24" node tools/e2e-cables.mjs http://127.0.0.1:3083 [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3083").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser([], { headless: false });
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=nomades`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0 && window.__game.ui.me === 0, null, { timeout: 150000 });
// souris au centre : au bord de la page, elle ferait défiler la carte
await page.mouse.move(600, 380);
await page.evaluate(() => window.__game.client.stopReplayAt(300));
await page.waitForFunction(() => window.__game.client.frame.tick >= 300, null, { timeout: 240000 });
// (la démo place sa caméra au départ : attendre qu'elle l'ait fait)
await page.waitForTimeout(2000);
check(await page.evaluate(() => !!window.__game.client.scene.renderer.backend.isWebGPUBackend), "rendu WebGPU");

const frames = (n) => page.evaluate((n) => new Promise((r) => {
  const step = (k) => (k ? requestAnimationFrame(() => step(k - 1)) : r());
  step(n);
}), n);
// caméra sur le générateur, vue de haut
const gen = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.buildings.findIndex((d) => d.key === "t_generator");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) !== k) continue;
    const x = f.buf[o + 2] & 0xffff, y = f.buf[o + 2] >>> 16;
    const sc = client.scene;
    sc.target.set(x + 12, 0, y - 2);
    sc.distance = 46;
    sc.tilt = 1.5;
    sc.yaw = 0;
    sc.updateCamera();
    return { x, y, target: [sc.target.x, sc.target.z] };
  }
  return null;
});
check(!!gen, "générateur nomade déployé dans la démo", JSON.stringify(gen));
await page.waitForTimeout(1500);
await frames(4);
const stats = await page.evaluate(() => {
  const c = window.__game.client.scene.cables;
  return c ? { count: c.count, triangles: c.triangles, buildMs: +c.buildMs.toFixed(2), builds: c.builds, visible: c.mesh.visible } : null;
});
// soute -> générateur, poteau 1 -> générateur, poteau 2 -> poteau 1, poteau 3 -> poteau 2
check(stats?.count === 4 && stats.visible, "quatre câbles affichés", JSON.stringify(stats));
console.log("caméra", await page.evaluate(() => { const sc = window.__game.client.scene; return [sc.target.x, sc.target.z, sc.distance, sc.tilt]; }));
await page.screenshot({ path: `${outDir}/cables-haut.png`, timeout: 240000 });
console.log(`capture : ${outDir}/cables-haut.png`);
// rapprochée, inclinée : câble de la soute au générateur et départ du premier poteau
await page.evaluate((g) => {
  const sc = window.__game.client.scene;
  sc.target.set(g.x + 3, 0, g.y - 1);
  sc.distance = 13;
  sc.tilt = 0.62;
  sc.yaw = 0.5;
  sc.updateCamera();
}, gen ?? { x: 0, y: 0 });
await page.waitForTimeout(1000);
await frames(4);
await page.screenshot({ path: `${outDir}/cables-pres.png`, timeout: 240000 });
console.log(`capture : ${outDir}/cables-pres.png`);
const builds = await page.evaluate(() => window.__game.client.scene.cables?.builds ?? -1);
check(builds === stats?.builds, "pas de reconstruction quand rien ne change", `${stats?.builds} puis ${builds}`);
check(errors.length === 0, "aucune erreur de page ni de console", `${errors.length} : ${errors.slice(0, 3).join(" | ")}`);
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
