// Transhumants dans la démo « gué » : l'Arche, son convoi et ses chenillards flottent sur le bras de mer ; fiche de
// l'Arche (milieu, atelier de secours), fiche de la soute (chariots). Deux captures, aucune erreur dans la page. La
// logique (traversée, navettes, atelier de secours) est testée en Rust (sim/src/transhumants_tests.rs).
// Usage : node tools/e2e-gue.mjs http://127.0.0.1:3083 [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3083").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser([]);
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.mouse.move(600, 400);
await page.goto(`${base}/?k=testkey&demo=gue&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.tick > 2 && window.__game.ui.me === 0, null, { timeout: 150000 });
// la scène est au centre de la carte ; au tick 220, tout le monde est au milieu du bras de mer
await page.evaluate(() => {
  const { client } = window.__game;
  client.stopReplayAt(220);
  const sc = client.scene;
  sc.target.set(client.map.w / 2, 0, client.map.h / 2);
  sc.distance = 60;
  sc.updateCamera();
});
await page.waitForFunction(() => window.__game.client.frame.tick >= 220 && window.__game.client.frame.nBuildings > 0, null, { timeout: 240000 });

/** unités d'un type : [identifiant, x, z, hauteur affichée] */
const units = (key) => page.evaluate((key) => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    const k = f.buf[o + 1] & 0xff;
    if (ui.data.units[k].key !== key) continue;
    const x = f.buf[o + 2] / 256, z = f.buf[o + 3] / 256;
    out.push([f.buf[o] >>> 0, x, z, client.scene.entities.unitHeight(k, x, z)]);
  }
  return out;
}, key);
const water = await page.evaluate(() => window.__game.client.map.waterLevel * 0.08);
for (const key of ["ark", "ch_drill", "ch_workshop", "ark_car"]) {
  const l = (await units(key)).filter((u) => u[3] < water);
  check(l.length > 0, `${key} flotte, la caisse immergée`, l.map((u) => (water - u[3]).toFixed(2)).join(" "));
}
const ark = (await units("ark"))[0];
await page.evaluate(([id, x, z]) => {
  const { client } = window.__game;
  client.selectIds([id]);
  const sc = client.scene;
  sc.target.set(x, 0, z + 2);
  sc.distance = 26;
  sc.updateCamera();
}, ark);
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.ark, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const panel = (await page.locator(".mods").innerText()).replace(/\n/g, " | ");
check(/atelier de secours/i.test(panel), "atelier de secours dans la fiche de l'Arche", panel.slice(-200));
check((await page.locator(".mods .wu").count()) === 1, "un seul choix : le chenillard atelier");
await page.screenshot({ path: `${outDir}/gue-arche.png`, timeout: 240000 });
await page.evaluate(() => {
  window.__game.client.stopReplayAt(1 << 30);
  document.querySelector(".mods .wu")?.click();
});
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.ark?.queue.length === 1, null, { timeout: 120000 });
check(true, "chenillard atelier commandé à l'Arche");
// la soute : chariots
await page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.buildings.findIndex((d) => d.key === "t_hold");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) !== k) continue;
    client.selectIds([f.buf[o] >>> 0]);
    const sc = client.scene;
    sc.target.set(f.buf[o + 2] & 0xffff, 0, (f.buf[o + 2] >>> 16) - 2);
    sc.distance = 30;
    sc.updateCamera();
    return;
  }
});
await page.waitForFunction(() => window.__game.ui.buildingInfo?.transh?.cartsMax, null, { timeout: 60000 });
await page.waitForTimeout(2500);
const btn = page.locator("button:has-text('Atteler un chariot')");
check((await btn.count()) === 1 && (await btn.isEnabled()), "bouton Atteler un chariot");
await page.screenshot({ path: `${outDir}/gue-soute.png`, timeout: 240000 });
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
console.log(`captures : ${outDir}/gue-arche.png, gue-soute.png`);
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
