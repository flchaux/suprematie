// Ramassage d'une sortie et livraison au dépôt, en jeu : partie contre une IA. Le commandant pose un
// extracteur sur le gisement de fer libre le plus proche, une fonderie collée et un dépôt à l'écart ; un clic
// droit du commandant sur la fonderie (curseur, message, fiche) l'envoie ramasser les plaques qui sortent,
// dans sa soute (un dépôt mobile). Ensuite, un clic sur la plaque de fer de l'inventaire de sa fiche l'envoie
// porter toutes ses plaques au dépôt. Captures dans OUT.
//   node tools/e2e-pickup.mjs [url]   (WEBGPU=1 sous xvfb-run : Chromium avec fenêtre, rendu WebGPU)
import { launchBrowser } from "./browser.mjs";
const gpu = !!process.env.WEBGPU;
const url = process.argv[2] ?? `http://127.0.0.1:3091/?k=testkey${gpu ? "" : "&webgl"}`;
const out = process.env.OUT ?? "tools/viewer/captures";
const browser = await launchBrowser([], gpu || process.env.HEADED ? { headless: false } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
await page.goto(url);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false })); });
await page.goto(url);
await page.fill("input", "Testeur");
await page.click("button[type=submit]");
await page.waitForSelector("text=Ajouter une IA");
await page.click("button:has-text('Tortue')");
await page.click("button:has-text('Lancer la partie')");
await page.waitForFunction(() => window.__game?.client.frame, null, { timeout: 60000 });
await page.evaluate(() => { const { client } = window.__game; client.centerOnCommander(); client.scene.distance = 40; });
await page.bringToFront();
await page.mouse.move(640, 250);
await page.waitForFunction(() => window.__game.client.frame.nBuildings >= 1, null, { timeout: 120000 });
await page.waitForTimeout(1000);

const state = () => page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const bs = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    const owner = (f.buf[o + 1] >> 8) & 0xff;
    if (owner === ui.me) bs.push({ ref: f.buf[o] >>> 0, key: ui.data.buildings[f.buf[o + 1] & 0xff].key, x: f.buf[o + 2] & 0xffff, y: f.buf[o + 2] >>> 16, build: f.buf[o + 4] });
  }
  let cmd = null;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === f.players[ui.me].commander) cmd = { id: f.buf[o] >>> 0, x: f.buf[o + 2] / 256, y: f.buf[o + 3] / 256, order: f.buf[o + 8] >>> 24 };
  return { tick: f.tick, bs, cmd, stock: Array.from(ui.stock) };
});

/** Point de la page (sur le canevas, pas sous l'interface) dont le sol visé est (x, z). */
const screenOf = (x, z) => page.evaluate(([x, z]) => {
  const { client } = window.__game;
  const r = client.canvasEl.getBoundingClientRect();
  let best = { x: 0, y: 0, d: Infinity };
  for (let sy = 60; sy < r.height - 20; sy += 4) {
    for (let sx = 20; sx < r.width - 20; sx += 4) {
      const g = client.groundAt(sx, sy);
      if (!g) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d >= best.d || d > 0.4) continue;
      const el = document.elementFromPoint(sx + r.left, sy + r.top);
      if (el !== client.canvasEl && !client.canvasEl.contains(el)) continue;
      best = { x: sx + r.left, y: sy + r.top, d };
    }
  }
  return best;
}, [x, z]);

let s = await state();
const main = s.bs.find((b) => b.key === "main_generator");
console.log("générateur principal :", JSON.stringify(main));
// gisements de fer libres, du plus proche au plus loin du générateur principal
const spots = await page.evaluate(([mx, my]) => {
  const { client } = window.__game;
  const free = client.map.spots.filter((p) => p.kind === 1 && !client.buildingAtTile(p.x, p.y));
  free.sort((a, b) => Math.hypot(a.x - mx, a.y - my) - Math.hypot(b.x - mx, b.y - my));
  return free.map((p) => ({ x: p.x, y: p.y, d: Math.hypot(p.x - mx, p.y - my) }));
}, [main.x + 1.5, main.y + 1.5]);
const near = spots[0];
console.log("gisement proche :", JSON.stringify(near));
const kinds = await page.evaluate(() => {
  const b = window.__game.ui.data.buildings;
  return { ext: b.findIndex((d) => d.key === "extractor"), fur: b.findIndex((d) => d.key === "furnace"), pyl: b.findIndex((d) => d.key === "pylon"), dep: b.findIndex((d) => d.key === "depot") };
});
// fonderie collée à l'extracteur, du côté où elle se pose
const sides = [[near.x + 2, near.y], [near.x - 2, near.y], [near.x, near.y + 2], [near.x, near.y - 2]];
const ok = await page.evaluate(async ([kind, c]) => {
  const { client, ui } = window.__game;
  return await client.query("canPlaceMany", [ui.me, kind, ...c.flatMap(([x, y]) => [x, y, 0])]);
}, [kinds.fur, sides]);
const fpos = sides[Math.max(0, ok.findIndex((v) => v))];
console.log("fonderie en", fpos.join(","), "posables :", JSON.stringify(ok));
// dépôt à une dizaine de cases du générateur principal, à l'opposé du gisement
const cands = [];
for (let k = 0; k < 24; k++) {
  const a = Math.atan2(main.y - near.y, main.x - near.x) + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 12;
  cands.push([Math.round(main.x + 1 + 10 * Math.cos(a)), Math.round(main.y + 1 + 10 * Math.sin(a))]);
}
const okd = await page.evaluate(async ([kind, c]) => {
  const { client, ui } = window.__game;
  return await client.query("canPlaceMany", [ui.me, kind, ...c.flatMap(([x, y]) => [x, y, 0])]);
}, [kinds.dep, cands]);
const dpos = cands[Math.max(0, okd.findIndex((v) => v))];
console.log("dépôt en", dpos.join(","));
// relais à mi-chemin si le gisement sort de la zone du générateur principal (18 cases)
const relay = near.d > 15 ? [Math.round((main.x + near.x) / 2), Math.round((main.y + near.y) / 2) - 3] : null;
await page.evaluate(([id, k, sx, sy, fx, fy, relay]) => {
  const { client } = window.__game;
  if (relay) client.cmd([3, 0, k.pyl, relay[0], relay[1], 0, 1, id]);
  client.cmd([3, relay ? 1 : 0, k.ext, sx, sy, 0, 1, id]);
  client.cmd([3, 1, k.fur, fx, fy, 0, 1, id]);
}, [s.cmd.id, kinds, near.x, near.y, fpos[0], fpos[1], relay]);
await page.evaluate(([id, k, x, y]) => window.__game.client.cmd([3, 1, k.dep, x, y, 0, 1, id]), [s.cmd.id, kinds, dpos[0], dpos[1]]);
await page.evaluate(([x, y]) => { const sc = window.__game.client.scene; sc.target.x = x; sc.target.z = y; sc.distance = 26; }, [fpos[0] + 1, fpos[1] + 1]);

// la fonderie est terminée et sort des plaques (fiche du bâtiment : produits en attente)
let fur = null;
for (let k = 0; k < 240 && !fur; k++) {
  await page.waitForTimeout(1000);
  s = await state();
  const f = s.bs.find((b) => b.key === "furnace" && b.x === fpos[0] && b.y === fpos[1] && b.build >= 65536);
  if (!f) continue;
  await page.evaluate((r) => window.__game.client.selectIds([r]), f.ref);
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => window.__game.ui.buildingInfo);
  if (info && info.out > 0) fur = { ...f, out: info.out };
}
check(!!fur, "fonderie posée, alimentée par l'extracteur, plaques en sortie", JSON.stringify(fur));
for (let k = 0; k < 120 && !(s.bs.find((b) => b.key === "depot" && b.build >= 65536)); k++) {
  await page.waitForTimeout(1000);
  s = await state();
}
const depot = s.bs.find((b) => b.key === "depot" && b.build >= 65536);
check(!!depot, "dépôt bâti", JSON.stringify(depot));
if (!fur || !depot) {
  console.log("erreurs :", errors.slice(0, 8));
  await browser.close();
  process.exit(1);
}

// clic droit du commandant sur la fonderie
await page.evaluate((id) => window.__game.client.selectIds([id]), s.cmd.id);
await page.waitForTimeout(400);
const pt = await screenOf(fur.x + 1, fur.y + 1);
await page.mouse.move(pt.x, pt.y);
await page.waitForTimeout(300);
await page.mouse.move(pt.x + 1, pt.y + 1);
await page.waitForTimeout(400);
const cursor = await page.evaluate(() => window.__game.client.cursorKind);
check(cursor === "load", "curseur de ramassage sur la fonderie", cursor);
const stock0 = (await state()).stock[6];
await page.mouse.click(pt.x + 1, pt.y + 1, { button: "right" });
await page.waitForFunction(() => !!window.__game.ui.unitInfo?.pickup, null, { timeout: 30000 }).catch(() => {});
const msg = await page.evaluate(() => JSON.stringify(window.__game.ui.messages?.slice?.(-1) ?? null));
console.log("message :", msg);
let p = await page.evaluate(() => window.__game.ui.unitInfo?.pickup ?? null);
check(!!p && p.item === 6, "ordre de ramassage reçu (plaques de fer)", JSON.stringify(p));
await page.waitForFunction(() => window.__game.ui.unitInfo?.pickup?.state === 1, null, { timeout: 90000 }).catch(() => {});
p = await page.evaluate(() => window.__game.ui.unitInfo?.pickup ?? null);
check(p?.state === 1, "commandant posté à la fonderie", JSON.stringify(p));
await page.waitForTimeout(15000);
const panel = await page.evaluate(() => document.querySelector(".harvest")?.textContent?.replace(/\s+/g, " ").trim() ?? "");
check(panel.includes("Ramasse ce qui sort"), "fiche : ramassage en cours", panel);
await page.screenshot({ path: `${out}/e2e-pickup-ramassage.png` });
const stock1 = (await state()).stock[6];
check(stock1 > stock0, "plaques ramassées (soute et dépôts)", `${stock0} -> ${stock1}`);

// livraison : un clic sur la plaque de fer de sa soute l'envoie porter toutes ses plaques au dépôt
const hold0 = await page.evaluate(() => window.__game.ui.unitInfo?.hold?.[6] ?? 0);
check(hold0 > 0, "plaques de fer dans la soute du commandant", String(hold0));
await page.evaluate(() => { const { client } = window.__game; client.centerOnCommander(); client.scene.distance = 30; });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/e2e-pickup-soute.png` });
const btn = page.locator("button.hitem").filter({ has: page.locator(".item[title='Plaque de fer']") });
check((await btn.count()) === 1, "plaque de fer cliquable dans l'inventaire");
await btn.first().click();
await page.waitForTimeout(1500);
const dv = await page.evaluate(() => window.__game.ui.unitInfo?.deliver ?? null);
check(!!dv && dv.item === 6 && dv.x === depot.x + 1 && dv.y === depot.y + 1, "ordre de livraison (plaque de fer, au dépôt bâti)", JSON.stringify(dv));
const msg2 = await page.evaluate(() => JSON.stringify(window.__game.ui.messages?.slice?.(-1) ?? null));
console.log("message :", msg2);
await page.screenshot({ path: `${out}/e2e-pickup-livraison.png` });
await page.waitForFunction(() => { const u = window.__game.ui.unitInfo; return u && !u.deliver; }, null, { timeout: 240000 }).catch(() => {});
s = await state();
const left = await page.evaluate(() => window.__game.ui.unitInfo?.hold?.[6] ?? -1);
const dd = Math.hypot(s.cmd.x - depot.x - 1, s.cmd.y - depot.y - 1);
check(left === 0, "soute vidée de ses plaques", String(left));
check(dd < 6, "le commandant est allé au dépôt", `${dd.toFixed(1)} cases`);
await page.evaluate((r) => window.__game.client.selectIds([r]), depot.ref);
await page.waitForTimeout(1200);
const stash = await page.evaluate(() => window.__game.ui.buildingInfo?.stash?.[6] ?? -1);
check(stash >= hold0, "les plaques sont dans le dépôt", `${stash} (soute avant : ${hold0})`);
await page.screenshot({ path: `${out}/e2e-pickup-depot.png` });
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 5).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
