// Vitrine (?demo=vitrine) : les sept variantes des paliers supérieurs en jeu, leurs icônes et des icônes des
// Transhumants dans la fiche de sélection. Aucune erreur.
// Usage : node tools/e2e-paliers.mjs http://127.0.0.1:3083 [dossier des captures]
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
await page.mouse.move(600, 380);
await page.goto(`${base}/?k=testkey&demo=vitrine&webgl`);
await page.waitForFunction(() => window.__game?.client.frame, null, { timeout: 240000 });
await page.evaluate(() => window.__game.client.stopReplayAt(3));
await page.waitForFunction(() => window.__game.client.frame.tick >= 3, null, { timeout: 240000 });
const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
// la trame ne porte que le champ de vue : caméra sur la place d'un type dans la vitrine (stress::showcase_demo,
// carte de 512 : bâtiments par 8 colonnes de 7 cases, unités par 12 colonnes de 5 cases sur des rangées de 6)
const look = async (cat, key, dist) => {
  await page.evaluate(({ cat, key, dist }) => {
    const { client, ui } = window.__game;
    const x0 = 256 - 28, y0 = 256 - 40, rows = Math.floor(ui.data.buildings.length / 8) + 1;
    const k = ui.data[cat].findIndex((d) => d.key === key);
    const [x, z] = cat === "buildings" ? [x0 + (k % 8) * 7 + 1, y0 + Math.floor(k / 8) * 7 + 1] : [x0 + (k % 12) * 5 + 0.5, y0 + rows * 7 + 4 + Math.floor(k / 12) * 6 + 0.5];
    const sc = client.scene;
    sc.target.set(x, 0, z);
    sc.distance = dist;
    sc.updateCamera();
  }, { cat, key, dist });
  // quelques images : le worker renvoie une trame pour le nouveau champ de vue
  for (let i = 0; i < 4; i++) await frames();
  await page.waitForTimeout(1500);
};

const NEW = ["heavy_tank", "flak", "spy_plane", "heavy_gunship", "torpedo_bomber", "hunter_sub", "aa_cruiser"];
await look("units", "flak", 30);
await page.waitForFunction(() => window.__game.client.frame.nUnits > 0, null, { timeout: 240000 });
const found = await page.evaluate((keys) => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const out = {};
  for (const key of keys) {
    const k = ui.data.units.findIndex((u) => u.key === key);
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if ((f.buf[o + 1] & 0xff) === k) out[key] = { x: f.buf[o + 2] / 256, z: f.buf[o + 3] / 256 };
  }
  const xs = Object.values(out).map((p) => p.x);
  const sc = client.scene;
  if (xs.length) {
    sc.target.set((Math.min(...xs) + Math.max(...xs)) / 2, 0, Object.values(out)[0].z);
    sc.distance = 18;
    sc.updateCamera();
  }
  return out;
}, NEW);
check(Object.keys(found).length === NEW.length, "les sept variantes sont dans la vitrine", Object.keys(found).join(","));
await frames();
await page.screenshot({ path: `${outDir}/paliers-unites.png`, timeout: 240000 });
console.log(`capture : ${outDir}/paliers-unites.png`);

// panneaux des usines : un bouton à icône par variante
const selectBuilding = (key) =>
  page.evaluate((key) => {
    const { client, ui } = window.__game;
    const k = ui.data.buildings.findIndex((d) => d.key === key);
    const f = client.frame;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
      if ((f.buf[o + 1] & 0xff) !== k) continue;
      client.selectIds([f.buf[o] >>> 0]);
      return true;
    }
    return false;
  }, key);
const icons = (keys) => page.evaluate((keys) => keys.filter((k) => [...document.querySelectorAll("img")].some((im) => new RegExp(`/${k}[-.]`).test(im.getAttribute("src") ?? ""))), keys);
// Transhumants : fiche d'un chenillard et d'un module déployé avec leur icône
const selectUnit = (key) =>
  page.evaluate((key) => {
    const { client, ui } = window.__game;
    const k = ui.data.units.findIndex((u) => u.key === key);
    const f = client.frame;
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
      if ((f.buf[o + 1] & 0xff) !== k) continue;
      client.selectIds([f.buf[o] >>> 0]);
      return true;
    }
    return false;
  }, key);
// (en spectateur, la fiche d'une usine n'a pas de liste de production, et l'usine navale manque à la vitrine,
// sans eau : les icônes des variantes se vérifient dans la fiche de l'unité)
for (const key of [...NEW, "rider", "ch_drill", "shepherd"]) {
  await look("units", key, 20);
  check(await selectUnit(key), `${key} sélectionné`);
  await page.waitForTimeout(1500);
  const seen = await icons([key]);
  check(seen.length === 1, `icône de ${key} dans la fiche`);
  if (key === "heavy_gunship") {
    await page.screenshot({ path: `${outDir}/paliers-fiche.png`, timeout: 240000 });
    console.log(`capture : ${outDir}/paliers-fiche.png`);
  }
}
await look("buildings", "t_drill", 20);
check(await selectBuilding("t_drill"), "t_drill sélectionnée");
await page.waitForTimeout(1500);
check((await icons(["t_drill"])).length === 1, "icône de t_drill dans la fiche");
await page.screenshot({ path: `${outDir}/paliers-transhumants.png`, timeout: 240000 });
console.log(`capture : ${outDir}/paliers-transhumants.png`);

check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
