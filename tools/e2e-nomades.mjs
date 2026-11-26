// Transhumants dans la démo « nomades » : chariots de convoi en navette, générateur et poteaux. Contrôles :
// fiche de la soute (compte des chariots, bouton « Atteler un chariot »), un chariot de plus après le clic,
// une capture, aucune erreur dans la page. La logique (navettes, plafond, repli) est testée en Rust.
// Usage : node tools/e2e-nomades.mjs http://127.0.0.1:3083 [dossier des captures]
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

const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/?k=testkey&demo=nomades&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0 && window.__game.ui.me === 0, null, { timeout: 150000 });

// chargement dans la benne : au tick 200, deux chariots rentrent pleins de plaques de la fonderie (6 places)
// et le troisième en a encore 4 places à l'assembleur
const LOADED_AT = 200;
await page.evaluate((t) => window.__game.client.stopReplayAt(t), LOADED_AT);
await page.waitForFunction((t) => window.__game.client.frame.tick >= t, LOADED_AT, { timeout: 240000 });
const loads = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.units.findIndex((u) => u.key === "t_cart");
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if ((f.buf[o + 1] & 0xff) !== k) continue;
    const l = f.buf[o + 6] >>> 16;
    out.push({ x: f.buf[o + 2] / 256, z: f.buf[o + 3] / 256, item: ui.data.items[l & 0xff]?.key ?? "", n: l >> 8 });
  }
  // caméra rapprochée sur les deux chariots qui rentrent de la fonderie
  const back = out.filter((c) => c.n === 6).sort((a, b) => a.x - b.x);
  const sc = client.scene;
  if (back.length) {
    sc.target.set(back[0].x, 0, back[0].z);
    sc.distance = 9;
    sc.updateCamera();
  }
  return out;
});
check(loads.filter((c) => c.item === "iron_plate" && c.n === 6).length === 2, "deux chariots pleins de plaques", JSON.stringify(loads));
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
const drawn = await page.evaluate(() => window.__game.client.scene.entities.nCartLoads);
// (le troisième, à l'assembleur, est hors du champ de la caméra : son modèle n'est pas dessiné)
check(drawn === 2, "chargement des deux chariots à l'écran dessiné dans leur benne", String(drawn));
await page.screenshot({ path: `${outDir}/nomades-chargement.png`, timeout: 240000 });
console.log(`capture : ${outDir}/nomades-chargement.png`);
await page.evaluate(() => window.__game.client.stopReplayAt(1 << 30));

const carts = () => page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.units.findIndex((u) => u.key === "t_cart");
  const f = client.frame;
  let n = 0;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if ((f.buf[o + 1] & 0xff) === k) n++;
  return n;
});
// la soute : sélection et caméra
const hold = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.buildings.findIndex((d) => d.key === "t_hold");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) !== k) continue;
    const ref = f.buf[o] >>> 0;
    const x = f.buf[o + 2] & 0xffff, y = f.buf[o + 2] >>> 16;
    client.selectIds([ref]);
    const sc = client.scene;
    sc.target.set(x + 1, 0, y + 3);
    sc.distance = 34;
    sc.updateCamera();
    return { ref, x, y };
  }
  return null;
});
check(!!hold, "soute déployée dans la démo");
const n0 = await carts();
check(n0 === 3, "trois chariots de convoi attelés", String(n0));
await page.waitForTimeout(2500);
const row = await page.evaluate(() => JSON.stringify(window.__game.ui.buildingInfo?.transh ?? null));
const btn = page.locator("button:has-text('Atteler un chariot')");
check((await btn.count()) === 1, "bouton Atteler un chariot de la soute", row);
if (await btn.count()) {
  await btn.click({ force: true, noWaitAfter: true, timeout: 60000 });
  const t = await page.evaluate(() => window.__game.client.frame.tick);
  await page.waitForFunction((t) => window.__game.client.frame.tick > t + 10, t, { timeout: 60000 });
  check((await carts()) === n0 + 1, "un chariot de plus après le clic", String(await carts()));
}
// les chariots ont roulé vers leurs modules (navettes en cours)
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/nomades-convoi.png`, timeout: 120000 });
console.log(`capture : ${outDir}/nomades-convoi.png`);
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
