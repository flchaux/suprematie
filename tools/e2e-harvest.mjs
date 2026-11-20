// Récolte du commandant en jeu : partie contre une IA, clic droit du commandant sur le gisement de fer
// libre le plus proche ; vérifie le curseur, l'ordre, l'état dans la fiche, la hausse du stock de plaques
// de fer, l'effet visible, puis l'arrêt par un nouvel ordre. Captures dans tools/viewer/captures.
// Usage : node tools/e2e-harvest.mjs http://127.0.0.1:3061/?k=testkey [&webgl]
import { launchBrowser } from "./browser.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:3061/?k=testkey&webgl";
const out = new URL("./viewer/captures/", import.meta.url).pathname;
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
await page.waitForTimeout(1500);

// commandant sélectionné, caméra sur le gisement de fer libre le plus proche
const spot = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const me = client.frame.players[ui.me];
  client.selectIds([me.commander]);
  const f = client.frame;
  let cx = 0, cz = 0;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === me.commander >>> 0) { cx = f.buf[o + 2] / 256; cz = f.buf[o + 3] / 256; }
  const free = client.map.spots.filter((s) => s.kind === 1 && !client.buildingAtTile(s.x, s.y));
  free.sort((a, b) => Math.hypot(a.x - cx, a.y - cz) - Math.hypot(b.x - cx, b.y - cz));
  const s = free[0];
  const sc = client.scene;
  sc.target.set(s.x + 1, 0, s.y + 1);
  sc.distance = 26;
  sc.updateCamera();
  return { ...s, cx, cz };
});
console.log("gisement de fer :", JSON.stringify(spot));
await page.waitForTimeout(800);
// point du canevas (non recouvert par l'interface) dont le sol visé est le centre du gisement
const screen = await page.evaluate(([x, z]) => {
  const { client } = window.__game;
  const r = client.canvasEl.getBoundingClientRect();
  let best = { x: 0, y: 0, d: Infinity };
  for (let sy = 60; sy < r.height - 20; sy += 4) {
    for (let sx = 20; sx < r.width - 20; sx += 4) {
      const g = client.groundAt(sx, sy);
      if (!g) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d >= best.d || d > 0.4) continue;
      // project() et groundAt() en coordonnées du canevas ; la souris en coordonnées de la page
      const el = document.elementFromPoint(sx + r.left, sy + r.top);
      if (el !== client.canvasEl && !client.canvasEl.contains(el)) continue;
      best = { x: sx + r.left, y: sy + r.top, d };
    }
  }
  return best;
}, [spot.x + 1, spot.y + 1]);
console.log("visée :", JSON.stringify(screen));
await page.mouse.move(screen.x, screen.y);
await page.waitForTimeout(400);
await page.mouse.move(screen.x + 2, screen.y + 1);
await page.waitForTimeout(400);
const cursor = await page.evaluate(() => window.__game.client.cursorKind);
check(cursor === "harvest", "curseur de récolte sur le gisement", cursor);
const plates0 = await page.evaluate(() => window.__game.ui.stock[6]);
const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + "." + e.className : ""; }, [screen.x + 2, screen.y + 1]);
console.log("sous la souris :", under);
await page.screenshot({ path: out + "e2e-harvest-avant.png", timeout: 180000 });
await page.mouse.click(screen.x + 2, screen.y + 1, { button: "right" });
// la fiche suit le rendu (rafraîchie à chaque image, au plus 2 fois par seconde)
await page.waitForFunction(() => !!window.__game.ui.unitInfo?.harvest, null, { timeout: 60000 }).catch(() => {});
const msg = await page.evaluate(() => JSON.stringify(window.__game.ui.messages?.slice?.(-1) ?? null));
console.log("message :", msg);

// en route puis récolte
const state = async () => page.evaluate(() => window.__game.ui.unitInfo?.harvest ?? null);
let h = await state();
check(!!h && h.raw === 1 && h.out === 6, "ordre de récolte reçu (minerai de fer -> plaque de fer)", JSON.stringify(h));
await page.waitForFunction(() => window.__game.ui.unitInfo?.harvest?.state === 1, null, { timeout: 90000 }).catch(() => {});
h = await state();
check(h?.state === 1, "le commandant récolte au gisement", JSON.stringify(h));
const t0 = await page.evaluate(() => [window.__game.client.frame.tick, window.__game.ui.stock[6]]);
// caméra sur le commandant, de dos et de près, pour voir l'effet
await page.evaluate(() => window.__game.client.centerOnCommander());
await page.evaluate(() => { const sc = window.__game.client.scene; sc.distance = 14; sc.updateCamera(); });
await page.waitForTimeout(12000);
const panel = await page.evaluate(() => document.querySelector(".harvest")?.textContent?.replace(/\s+/g, " ").trim() ?? "");
check(panel.includes("Récolte et fonte en cours"), "fiche du commandant : récolte en cours", panel);
await page.screenshot({ path: out + "e2e-harvest.png", timeout: 180000 });
const working = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const me = f.players[ui.me];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (f.buf[o] >>> 0 === me.commander >>> 0) return { flags: (f.buf[o + 1] >> 16) & 0xff, order: f.buf[o + 8] >>> 24 };
  return null;
});
check(!!working && (working.flags & 2) !== 0 && working.order === 16, "commandant marqué au travail (rayon et fonderie affichés)", JSON.stringify(working));
const t1 = await page.evaluate(() => [window.__game.client.frame.tick, window.__game.ui.stock[6]]);
const ticks = t1[0] - t0[0];
check(t1[1] - t0[1] >= Math.floor(ticks / 80) - 1 && t1[1] > t0[1], "plaques de fer versées au stock", `${t0[1]} -> ${t1[1]} en ${ticks} ticks (avant l'ordre : ${plates0})`);

// nouvel ordre : la récolte s'arrête
await page.evaluate(() => window.__game.client.stopSelected());
await page.waitForFunction(() => window.__game.ui.unitInfo && !window.__game.ui.unitInfo.harvest, null, { timeout: 60000 }).catch(() => {});
h = await state();
check(h === null, "Arrêt : plus de récolte", JSON.stringify(h));
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 5).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
