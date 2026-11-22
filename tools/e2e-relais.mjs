// Test de jeu : relais logistiques (`?demo=relais`). Une chaîne de trois relais relie un dépôt garni à un
// chantier et une usine à 100 cases : des drones de relais volent, chargés, vers le bout de la chaîne. Puis,
// commandant choisi (soute vide), fantôme d'un générateur : vert dans la zone du dernier relais (le dépôt
// du réseau couvre le coût), ambre au-delà (rien à portée). Capture des deux.
//   node tools/e2e-relais.mjs [url]   (WEBGPU=1 sous xvfb-run : Chromium avec fenêtre, rendu WebGPU)
import { launchBrowser } from "./browser.mjs";
const gpu = !!process.env.WEBGPU;
const url = process.argv[2] ?? `http://127.0.0.1:3133/?k=testkey&demo=relais${gpu ? "" : "&webgl"}`;
const out = process.env.OUT ?? "tools/viewer/captures";
const browser = await launchBrowser([], gpu ? { headless: false } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
page.setDefaultTimeout(240000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => { localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false })); });
await page.goto(url);
await page.waitForFunction(() => window.__game?.client.frame, null, { timeout: 120000 });
const fail = [];

// bâtiments du joueur 0 et drones (tampon de rendu : zone vue seulement)
const state = () => page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const bs = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if (((f.buf[o + 1] >> 8) & 0xff) === 0) bs.push({ key: ui.data.buildings[f.buf[o + 1] & 0xff].key, x: f.buf[o + 2] & 0xffff, y: f.buf[o + 2] >>> 16 });
  }
  const drones = [];
  for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += 5) {
    if ((f.buf[o + 3] & 0xff) === 3) drones.push({ x: f.buf[o + 1] / 256, y: f.buf[o + 2] / 256, loaded: (f.buf[o + 3] >> 17) & 1 });
  }
  let cmd = null;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === f.players[0].commander) cmd = f.buf[o] >>> 0;
  return { tick: f.tick, bs, drones, cmd };
});
// caméra sur le milieu de la chaîne (le dépôt de la démo est 50 cases à gauche du départ du joueur 0)
await page.evaluate(() => { const { client } = window.__game; client.centerOnCommander(); client.scene.target.x += 55; client.scene.distance = 95; });
await page.waitForFunction(() => window.__game.client.frame.nBuildings >= 5, null, { timeout: 180000 });
let s = await state();
const relays = s.bs.filter((b) => b.key === "logistic_relay").sort((a, b) => a.x - b.x);
console.log("tick", s.tick, "relais :", relays.map((r) => `${r.x},${r.y}`).join(" ; "), "bâtiments :", s.bs.map((b) => b.key).join(","));
if (relays.length !== 3) fail.push(`3 relais attendus, ${relays.length} vus`);
// drones de relais chargés en vol
await page.waitForFunction(() => {
  const f = window.__game.client.frame;
  for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += 5) if ((f.buf[o + 3] & 0xff) === 3 && (f.buf[o + 3] >> 17) & 1) return true;
  return false;
}, null, { timeout: 240000 }).catch(() => fail.push("aucun drone chargé vu en vol"));
s = await state();
console.log("tick", s.tick, "drones :", s.drones.length, "chargés :", s.drones.filter((d) => d.loaded).length);
await page.screenshot({ path: `${out}/e2e-relais-drones.png`, timeout: 240000 });

// fantôme d'un générateur, commandant choisi (soute vide) : dans la zone du dernier relais, puis au-delà
const gen = await page.evaluate(() => window.__game.ui.data.buildings.findIndex((b) => b.key === "generator"));
await page.evaluate(([id, gen]) => { const { client } = window.__game; client.selectIds([id]); client.startBuild(gen); }, [s.cmd, gen]);
const last = relays[relays.length - 1] ?? { x: 0, y: 0 };
// caméra fixe sur la fin de la chaîne (le rendu logiciel est lent à suivre un déplacement de caméra)
await page.evaluate(([tx, ty]) => { const sc = window.__game.client.scene; sc.target.x = tx; sc.target.z = ty; sc.distance = 110; }, [last.x + 30, last.y - 8]);
await page.waitForTimeout(6000);
// vise la case (tx, ty) : projection au sol, puis correction d'après la case réellement visée par le fantôme
const ghostAt = async (tx, ty) => {
  let aim = [tx, ty];
  let cell = null;
  for (let k = 0; k < 4; k++) {
    const p = await page.evaluate(([x, y]) => {
      const v = { x: 0, y: 0 };
      window.__game.client.scene.project(x + 0.5, 0, y + 0.5, v);
      return v;
    }, aim);
    const before = JSON.stringify(cell);
    await page.mouse.move(p.x, p.y);
    await page.mouse.move(p.x + 1, p.y);
    await page.waitForFunction((b) => { const c = window.__game.client.ghostCells[0]; return c && JSON.stringify(c) !== b; }, before, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1200);
    cell = await page.evaluate(() => window.__game.client.ghostCells[0]);
    if (!cell) break;
    const [ex, ey] = [tx - cell.x, ty - cell.y];
    if (Math.abs(ex) <= 2 && Math.abs(ey) <= 2) break;
    aim = [aim[0] + ex, aim[1] + ey];
  }
  await page.waitForTimeout(1500);
  return page.evaluate(() => ({ cell: window.__game.client.ghostCells[0], reach: window.__game.ui.buildReach }));
};
const inside = await ghostAt(last.x - 4, last.y - 10);
console.log("fantôme dans la zone :", JSON.stringify(inside.cell), "fer à portée", inside.reach?.[6]);
if (!inside.cell?.ok || inside.cell.short) fail.push("fantôme dans la zone du relais : vert attendu");
await page.screenshot({ path: `${out}/e2e-relais-vert.png`, timeout: 240000 });
const outside = await ghostAt(last.x + 60, last.y - 8);
console.log("fantôme hors du réseau :", JSON.stringify(outside.cell), "fer à portée", outside.reach?.[6]);
if (!outside.cell?.ok || !outside.cell.short) fail.push("fantôme hors du réseau : ambre attendu");
await page.screenshot({ path: `${out}/e2e-relais-ambre.png`, timeout: 240000 });

if (errors.length) console.log("erreurs :", errors.slice(0, 5));
console.log(fail.length ? "ÉCHEC : " + fail.join(" ; ") : "OK");
await browser.close();
process.exit(fail.length ? 1 : 0);
