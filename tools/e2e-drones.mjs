// Test de jeu : dépôts à stock propre et drones de ravitaillement. Partie contre une IA ; le commandant
// reçoit deux chantiers (un près du dépôt de départ, un loin de tout dépôt). Vérifie que des drones volent
// (genre 3 dans le tampon de rendu), capture la scène, puis les fiches du dépôt de départ, d'un chantier
// et du commandant (soute, à portée, ce qui manque).
//   node tools/e2e-drones.mjs [url]   (WEBGPU=1 sous xvfb-run : Chromium avec fenêtre, rendu WebGPU)
import { launchBrowser } from "./browser.mjs";
const gpu = !!process.env.WEBGPU;
const url = process.argv[2] ?? `http://127.0.0.1:3091/?k=testkey${gpu ? "" : "&webgl"}`;
const out = process.env.OUT ?? "tools/viewer/captures";
const browser = await launchBrowser([], gpu ? { headless: false } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false })); });
await page.goto(url);
await page.fill("input", "Testeur");
await page.click("button[type=submit]");
await page.waitForSelector("text=Ajouter une IA");
await page.click("button:has-text('Tortue')");
await page.click("button:has-text('Lancer la partie')");
await page.waitForFunction(() => window.__game?.client.frame, null, { timeout: 60000 });
// caméra sur le commandant (le tampon de rendu ne contient que les bâtiments visibles) ; souris sur le terrain
await page.evaluate(() => { const { client } = window.__game; client.centerOnCommander(); client.scene.distance = 40; });
await page.bringToFront();
await page.mouse.move(640, 250);
// le Worker ne rend que la zone vue : attendre que les bâtiments de départ y soient
await page.waitForFunction(() => window.__game.client.frame.nBuildings >= 2, null, { timeout: 120000 });
await page.waitForTimeout(1000);

// bâtiments du joueur (tampon de rendu) et drones en vol
const state = () => page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const bs = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    const owner = (f.buf[o + 1] >> 8) & 0xff;
    if (owner === ui.me) bs.push({ ref: f.buf[o] >>> 0, key: ui.data.buildings[f.buf[o + 1] & 0xff].key, x: f.buf[o + 2] & 0xffff, y: f.buf[o + 2] >>> 16, build: f.buf[o + 4] });
  }
  const drones = [];
  for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += 5) {
    const kind = f.buf[o + 3] & 0xff;
    if (kind === 3) drones.push({ x: f.buf[o + 1] / 256, y: f.buf[o + 2] / 256, loaded: (f.buf[o + 3] >> 17) & 1 });
  }
  let cmd = null;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === f.players[ui.me].commander) cmd = { id: f.buf[o] >>> 0, x: f.buf[o + 2] / 256, y: f.buf[o + 3] / 256 };
  return { tick: f.tick, me: ui.me, nb: f.nBuildings, bs, drones, cmd, stock: Array.from(ui.stock) };
});
let s = await state();
const depot = s.bs.find((b) => b.key === "depot");
console.log("bâtiments visibles :", s.bs.map((b) => b.key).join(","), "n", s.nb);
console.log("dépôt de départ :", JSON.stringify(depot), "stock total fer/cuivre :", s.stock[6], s.stock[7]);
// deux chantiers : un générateur près du commandant, un relais à ~40 cases (hors de portée de tout dépôt)
const gen = await page.evaluate(() => window.__game.ui.data.buildings.findIndex((b) => b.key === "generator"));
// second générateur principal : 40 acier, le dépôt de départ n'en a que 20 (chantier à l'arrêt à mi-course)
const portal = await page.evaluate(() => window.__game.ui.data.buildings.findIndex((b) => b.key === "main_generator"));
const cx = Math.floor(s.cmd.x), cy = Math.floor(s.cmd.y);
// chantier à ~22 cases du dépôt (dans son rayon de 30) : de longs vols de drones ; demi-vitesse
const cands = [];
for (let k = 0; k < 32; k++) {
  const a = (k / 32) * 2 * Math.PI;
  cands.push([Math.round(depot.x + 21 * Math.cos(a)), Math.round(depot.y + 21 * Math.sin(a))]);
}
const ok = await page.evaluate(async ([kind, cands]) => {
  const { client, ui } = window.__game;
  return await client.query("canPlaceMany", [ui.me, kind, ...cands.flatMap(([x, y]) => [x, y, 0])]);
}, [gen, cands]);
const i0 = Math.max(0, ok.findIndex((v) => v));
const spot = cands[i0];
const i1 = ok.findIndex((v, i) => v && i > i0 + 2);
const spot2 = cands[i1 < 0 ? i0 : i1];
console.log("chantier en", spot.join(","), "(posable :", ok.filter((v) => v).length, "sur", cands.length, ")");
await page.evaluate(([id, gen, portal, gx, gy, px, py]) => {
  const { client } = window.__game;
  client.stepSpeed(-1);
  client.cmd([3, 0, gen, gx, gy, 0, 1, id]);
  client.cmd([3, 1, portal, px, py, 0, 1, id]);
  client.selectIds([]);
  client.scene.target.x = gx;
  client.scene.target.z = gy;
  client.scene.distance = 30;
}, [s.cmd.id, gen, portal, spot[0], spot[1], spot2[0], spot2[1]]);
// drones en vol
let seen = 0, loadedSeen = 0, shot = false, siteShot = false;
for (let k = 0; k < 60; k++) {
  await page.waitForTimeout(500);
  s = await state();
  seen = Math.max(seen, s.drones.length);
  loadedSeen = Math.max(loadedSeen, s.drones.filter((d) => d.loaded).length);
  // chantier en cours : sa fiche (ce qui manque, ce qui est à portée)
  const site0 = s.bs.find((b) => b.key === "generator" && b.build < 65536);
  if (site0 && !siteShot) {
    await page.evaluate((b) => window.__game.client.selectIds([b.ref]), site0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/e2e-drones-chantier.png` });
    const info = await page.evaluate(() => JSON.stringify({ build: window.__game.ui.buildingInfo?.build, missing: window.__game.ui.buildingInfo?.missing }));
    console.log("chantier en cours :", info);
    await page.evaluate(() => window.__game.client.selectIds([]));
    siteShot = true;
  }
  // un drone loin de ses deux bouts : en plein vol
  if (!shot && s.drones.some((d) => Math.hypot(d.x - depot.x, d.y - depot.y) > 6 && Math.hypot(d.x - spot[0], d.y - spot[1]) > 6)) {
    await page.evaluate(([x, y]) => { const { client } = window.__game; client.selectIds([]); const sc = client.scene; sc.target.x = x; sc.target.z = y; sc.distance = 26; }, [(s.drones[0].x + spot[0]) / 2, (s.drones[0].y + spot[1]) / 2]);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/e2e-drones-vol.png` });
    shot = true;
  }
}
console.log("drones en vol (au plus) :", seen, "chargés :", loadedSeen);
// fiche du commandant (soute, à portée, chargement)
await page.evaluate((id) => { const { client } = window.__game; client.selectIds([id]); client.centerOnCommander(); client.scene.distance = 30; }, s.cmd.id);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/e2e-drones-commandant.png` });
const unitInfo = await page.evaluate(() => JSON.stringify({ hold: window.__game.ui.unitInfo?.hold, reach: window.__game.ui.unitInfo?.reach, loading: window.__game.ui.unitInfo?.loading, drones: window.__game.ui.unitInfo?.drones }));
console.log("fiche du commandant :", unitInfo);
// fiche du dépôt de départ
await page.evaluate((d) => { const { client } = window.__game; client.selectIds([d.ref]); client.scene.target.x = d.x + 1; client.scene.target.z = d.y + 1; client.scene.distance = 25; }, depot);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/e2e-drones-depot.png` });
const depotText = await page.evaluate(() => document.querySelector(".selection, .panel.sel, aside")?.textContent?.slice(0, 400) ?? "");
console.log("fiche du dépôt :", depotText.replace(/\s+/g, " "));
// un chantier en cours (le relais lointain, s'il est posé, sinon le générateur)
s = await state();
await page.evaluate(([x, y]) => { const sc = window.__game.client.scene; sc.target.x = x; sc.target.z = y; sc.distance = 30; }, spot2);
await page.waitForTimeout(2000);
s = await state();
const site = s.bs.find((b) => b.build < 65536) ?? s.bs.find((b) => b.key === "generator");
if (site) {
  await page.evaluate((b) => { const { client } = window.__game; client.selectIds([b.ref]); client.scene.target.x = b.x + 1; client.scene.target.z = b.y + 1; }, site);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/e2e-drones-chantier-fin.png` });
  const info = await page.evaluate(() => JSON.stringify({ build: window.__game.ui.buildingInfo?.build, missing: window.__game.ui.buildingInfo?.missing }));
  console.log("chantier :", site.key, info);
}
console.log("bâtiments :", s.bs.map((b) => `${b.key}${b.build < 65536 ? "(chantier)" : ""}`).join(", "));
console.log("erreurs :", errors.slice(0, 8));
await browser.close();
process.exit(seen > 0 ? 0 : 1);
