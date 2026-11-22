// Test de jeu : barre des ressources par zone électrique (stock, production et consommation maximales,
// solde) de la zone au centre de l'écran. Partie contre une IA ; le commandant pose une fonderie dans la base
// (zone vivante) et un générateur loin de tout, sans combustible (zone éteinte). La caméra passe de la base
// au générateur, puis hors de toute zone ; une capture de la barre à chaque fois.
//   node tools/e2e-zone-bar.mjs [url]   (WEBGPU=1 sous xvfb-run : Chromium avec fenêtre, rendu WebGPU)
import { launchBrowser } from "./browser.mjs";
const gpu = !!process.env.WEBGPU;
const url = process.argv[2] ?? `http://127.0.0.1:3091/?k=testkey${gpu ? "" : "&webgl"}`;
const out = process.env.OUT ?? "tools/viewer/captures";
const browser = await launchBrowser([], gpu ? { headless: false } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
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
await page.evaluate(() => { const { client } = window.__game; client.centerOnCommander(); client.scene.distance = 45; });
await page.bringToFront();
await page.waitForFunction(() => window.__game.client.frame.nBuildings >= 1, null, { timeout: 120000 });

const buildings = () => page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const bs = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    const owner = (f.buf[o + 1] >> 8) & 0xff;
    if (owner === ui.me) bs.push({ ref: f.buf[o] >>> 0, key: ui.data.buildings[f.buf[o + 1] & 0xff].key, x: f.buf[o + 2] & 0xffff, y: f.buf[o + 2] >>> 16, build: f.buf[o + 4] });
  }
  let cmd = null;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === f.players[ui.me].commander) cmd = { id: f.buf[o] >>> 0, x: f.buf[o + 2] / 256, y: f.buf[o + 3] / 256 };
  return { bs, cmd };
});
/** Barre : zone suivie et quelques objets (stock, débits par minute). */
const bar = () => page.evaluate(() => {
  const { ui } = window.__game;
  const z = ui.zone;
  if (!z) return null;
  const it = (id) => z.zone ? { stock: z.stock[id], prod: z.prod[id] / 100, cons: z.cons[id] / 100 } : null;
  return { zone: z.zone, net: z.net, machines: z.machines, label: document.querySelector(".zbar .zn")?.textContent, ironPlate: it(6), ironOre: it(1), hydro: it(4), cols: document.querySelectorAll(".zbar .res").length, power: z.power ?? null, gauge: document.querySelector(".top .left .gauge .g")?.textContent?.replace(/\s+/g, " ").trim() ?? null, mid: !!document.querySelector(".top .mid .research") };
});
const look = async (x, y, name) => {
  await page.evaluate(([x, y]) => { const sc = window.__game.client.scene; window.__game.client.selectIds([]); sc.target.x = x; sc.target.z = y; sc.distance = 45; }, [x, y]);
  // la barre suit la caméra (requête 4 fois par seconde au plus) : attendre la réponse pour cette case
  await page.waitForFunction(([x, y]) => { const a = window.__game.ui.zone?.at; return a && a[0] === Math.floor(x) && a[1] === Math.floor(y); }, [x, y], { timeout: 60000 });
  await page.waitForTimeout(800);
  const b = await bar();
  console.log(name, JSON.stringify(b));
  await page.screenshot({ path: `${out}/e2e-zone-bar-${name}.png`, clip: { x: 0, y: 0, width: 1400, height: 160 } });
  return b;
};

let s = await buildings();
const mg = s.bs.find((b) => b.key === "main_generator");
console.log("générateur principal en", mg.x, mg.y, "commandant", JSON.stringify(s.cmd));
const base = await look(mg.x + 1, mg.y + 1, "base");

// fonderie dans la base, générateur à ~40 cases (hors de portée de liaison, sans combustible)
const kinds = await page.evaluate(() => Object.fromEntries(["furnace", "generator"].map((k) => [k, window.__game.ui.data.buildings.findIndex((b) => b.key === k)])));
const ring = (r) => Array.from({ length: 48 }, (_, k) => [Math.round(mg.x + r * Math.cos((k / 48) * 2 * Math.PI)), Math.round(mg.y + r * Math.sin((k / 48) * 2 * Math.PI))]);
const spotFor = async (kind, cands) => {
  const ok = await page.evaluate(async ([kind, cands]) => window.__game.client.query("canPlaceMany", [window.__game.ui.me, kind, ...cands.flatMap(([x, y]) => [x, y, 0])]), [kind, cands]);
  return cands[ok.findIndex((v) => v)];
};
const fs = await spotFor(kinds.furnace, ring(6).concat(ring(8)));
const gs = await spotFor(kinds.generator, ring(40).concat(ring(44)));
console.log("fonderie en", fs.join(","), "générateur en", gs.join(","));
await page.evaluate(([id, k, x, y, gk, gx, gy]) => {
  const { client } = window.__game;
  client.stepSpeed(1);
  client.stepSpeed(1);
  client.cmd([3, 0, k, x, y, 0, 1, id]);
  client.cmd([3, 1, gk, gx, gy, 0, 1, id]);
}, [s.cmd.id, kinds.furnace, fs[0], fs[1], kinds.generator, gs[0], gs[1]]);
// fonderie terminée : recette des plaques de fer
let furnace = null;
for (let k = 0; k < 120 && !furnace; k++) {
  await page.waitForTimeout(500);
  await page.evaluate(([x, y]) => { const sc = window.__game.client.scene; sc.target.x = x; sc.target.z = y; }, fs);
  s = await buildings();
  furnace = s.bs.find((b) => b.key === "furnace" && b.build >= 65536);
}
if (furnace) {
  const r = await page.evaluate(() => window.__game.ui.data.recipes.findIndex((r) => r.key === "iron_plate"));
  // ordre SET_RECIPE (9) : référence, recette
  await page.evaluate(([ref, r]) => window.__game.client.cmd([9, ref, r]), [furnace.ref, r]);
}
console.log("fonderie :", JSON.stringify(furnace));
// générateur lointain terminé
let gen = null;
for (let k = 0; k < 240 && !gen; k++) {
  await page.waitForTimeout(500);
  await page.evaluate(([x, y]) => { const sc = window.__game.client.scene; sc.target.x = x; sc.target.z = y; }, gs);
  s = await buildings();
  gen = s.bs.find((b) => b.key === "generator" && b.build >= 65536);
}
console.log("générateur :", JSON.stringify(gen));
const base2 = await look(mg.x + 1, mg.y + 1, "base-fonderie");
const dry = gen ? await look(gen.x + 1, gen.y + 1, "zone-eteinte") : null;
// hors zone : à 45 cases de la base, perpendiculairement au générateur lointain (vers l'intérieur de la carte)
const mh = await page.evaluate(() => window.__game.client.map.h);
const off = await look(mg.x, mg.y + (mg.y + 50 < mh ? 45 : -45), "hors-zone");
const back = await look(mg.x + 1, mg.y + 1, "retour-base");
console.log("erreurs :", errors.slice(0, 8));
await browser.close();
// énergie : celle de la zone (production du générateur principal à la base), pas de jauge hors zone ;
// recherche et limite d'unités dans leur propre panneau
const ok = base?.zone === 1 && back?.zone === 1 && off?.zone === 0 && (!gen || dry?.zone === 2) && errors.length === 0
  && base.power?.[0] > 0 && !!base.gauge && off.gauge === null && (!gen || dry.power?.[0] === 0) && base.mid && off.mid;
console.log(ok ? "OK" : "ÉCHEC");
process.exit(ok ? 0 : 1);
