// Test de jeu : soute du commandant comptée comme un dépôt. Partie contre une IA : on commence sans dépôt,
// les ressources de départ dans la soute du commandant (barre du haut, fiche « Soute (dépôt) ») ; le
// commandant construit deux générateurs avec ce qu'il porte, sans appeler aucun drone ; un troisième ordre
// annulé ne coûte rien. Capture la fiche du commandant avant et après.
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
await page.waitForFunction(() => window.__game.client.frame.nBuildings >= 1, null, { timeout: 120000 });
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
const fail = [];
console.log("bâtiments visibles :", s.bs.map((b) => b.key).join(","), "stock fer/cuivre :", s.stock[6], s.stock[7]);
if (s.bs.some((b) => b.key === "depot")) fail.push("un dépôt au départ");
const cmdText = async (name) => {
  await page.evaluate((id) => { const { client } = window.__game; client.selectIds([id]); client.centerOnCommander(); client.scene.distance = 30; }, s.cmd.id);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/e2e-${name}.png` });
  const info = await page.evaluate(() => ({ hold: window.__game.ui.unitInfo?.hold ?? [], text: document.querySelector(".selection, .panel.sel, aside")?.textContent ?? "" }));
  console.log(name, ": soute fer", info.hold[6], "cuivre", info.hold[7], "|", info.text.replace(/\s+/g, " ").match(/Soute.{0,80}/)?.[0]);
  return info;
};
const before = await cmdText("commandant-depart");
if (!before.text.includes("Soute (dépôt)")) fail.push("fiche sans « Soute (dépôt) »");
const gen = await page.evaluate(() => window.__game.ui.data.buildings.findIndex((b) => b.key === "generator"));
const genIron = await page.evaluate((g) => window.__game.ui.data.buildings[g].cost.find((c) => c[0] === 6)?.[1] ?? 0, gen);
const cx = Math.floor(s.cmd.x), cy = Math.floor(s.cmd.y);
const cands = [];
for (let k = 0; k < 32; k++) {
  const a = (k / 32) * 2 * Math.PI;
  cands.push([Math.round(cx + 7 * Math.cos(a)), Math.round(cy + 7 * Math.sin(a))]);
}
const ok = await page.evaluate(async ([kind, cands]) => {
  const { client, ui } = window.__game;
  return await client.query("canPlaceMany", [ui.me, kind, ...cands.flatMap(([x, y]) => [x, y, 0])]);
}, [gen, cands]);
const free = cands.filter((_, i) => ok[i]);
const spots = [free[0], free.find((p) => Math.hypot(p[0] - free[0][0], p[1] - free[0][1]) > 4)];
console.log("chantiers en", spots.map((p) => p.join(",")).join(" ; "));
await page.evaluate(([id, gen, a, b]) => {
  const { client } = window.__game;
  client.cmd([3, 0, gen, a[0], a[1], 0, 1, id]);
  client.cmd([3, 1, gen, b[0], b[1], 0, 1, id]);
}, [s.cmd.id, gen, spots[0], spots[1]]);
let drones = 0, done = 0;
for (let k = 0; k < 80 && done < 2; k++) {
  await page.waitForTimeout(500);
  s = await state();
  drones = Math.max(drones, s.drones.length);
  done = s.bs.filter((b) => b.key === "generator" && b.build >= 65536).length;
}
console.log("générateurs terminés :", done, "drones en vol (au plus) :", drones);
if (done < 2) fail.push("générateurs pas terminés");
if (drones > 0) fail.push("des drones ont volé alors que le commandant avait tout");
// troisième ordre, aussitôt annulé : rien de perdu
const spot3 = free.find((p) => spots.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 4));
if (spot3) {
  await page.evaluate(([id, gen, c]) => { const { client } = window.__game; client.cmd([3, 0, gen, c[0], c[1], 0, 1, id]); client.cmd([6, 1, id]); }, [s.cmd.id, gen, spot3]);
  await page.waitForTimeout(2000);
}
const after = await cmdText("commandant-apres");
if (after.hold[6] !== before.hold[6] - 2 * genIron) fail.push(`soute fer ${after.hold[6]}, attendu ${before.hold[6] - 2 * genIron}`);
console.log("erreurs :", errors.slice(0, 8), "échecs :", fail);
await browser.close();
process.exit(fail.length ? 1 : 0);
