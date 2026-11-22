// Double clic sur un tapis, dans la démo « logistique » : la sélection devient tout le chemin de tapis,
// sans traverser le répartiteur où il aboutit (les tapis après lui restent hors de la sélection), et la
// fiche montre une sélection multiple de bâtiments.
// Usage : node tools/e2e-belt-path.mjs http://127.0.0.1:3061 [dossier des captures]
// Le rendu WebGPU demande un Chromium avec fenêtre : xvfb-run -a -s "-screen 0 1280x800x24" node …
// (ajouter &webgl à l'adresse avec WEBGL=1)
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser([], { headless: false });
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=logistique${process.env.WEBGL ? "&webgl" : ""}`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });

// la vitrine des répartiteurs est au sud-est de la gare du joueur (la trame ne porte que le champ de vue)
await page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if (client.data.buildings[f.buf[o + 1] & 0xff]?.key !== "station" || ((f.buf[o + 1] >> 8) & 0xff) !== 0) continue;
    const sc = client.scene;
    sc.target.set((f.buf[o + 2] & 0xffff) + 45, 0, ((f.buf[o + 2] >>> 16) & 0xffff) + 50);
    sc.distance = 70;
    sc.updateCamera();
  }
});
const t0 = await page.evaluate(() => window.__game.client.frame.tick);
await page.waitForFunction((t0) => window.__game.client.frame.tick > t0 + 30, t0);

/** Bâtiments de l'image : référence, type, propriétaire, case, direction. */
const frameBuildings = () => page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    const w1 = f.buf[o + 1];
    out.push({ ref: f.buf[o] >>> 0, key: client.data.buildings[w1 & 0xff]?.key, owner: (w1 >> 8) & 0xff, dir: (w1 >> 16) & 3, floor: (w1 >>> 28) & 3, x: f.buf[o + 2] & 0xffff, y: (f.buf[o + 2] >>> 16) & 0xffff });
  }
  return out;
});
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const isBelt = (b) => b && /^belt[123]$/.test(b.key);
let bs = await frameBuildings();
const at = (x, y) => bs.find((b) => b.x === x && b.y === y && b.floor === 0);
// un tapis du joueur qui débouche dans un répartiteur, dont une sortie part sur un tapis
let pick = null;
for (const b of bs) {
  if (!isBelt(b) || b.owner !== 0) continue;
  const [dx, dy] = DIRS[b.dir];
  const sp = at(b.x + dx, b.y + dy);
  if (sp?.key !== "splitter" || sp.dir !== b.dir) continue;
  const outs = [3, 0, 1].map((k) => DIRS[(sp.dir + k) % 4]).map(([ox, oy]) => at(sp.x + ox, sp.y + oy)).filter(isBelt);
  if (outs.length) {
    pick = { belt: b, sp, outs };
    break;
  }
}
check(!!pick, "un tapis qui débouche dans un répartiteur", pick ? JSON.stringify({ belt: [pick.belt.x, pick.belt.y], splitter: [pick.sp.x, pick.sp.y], outs: pick.outs.length }) : "");
if (pick) {
  const path = await page.evaluate((ref) => window.__game.client.query("beltPath", [ref]), pick.belt.ref);
  console.log("chemin (requête) :", path.length, "tapis");
  check(path.length >= 2, "le chemin compte plusieurs tapis", String(path.length));
  // caméra sur la case, puis un vrai double clic sur le pixel qui tombe dessus
  const px = await page.evaluate(([x, y]) => {
    const { client } = window.__game;
    const sc = client.scene;
    sc.target.set(x + 0.5, 0, y + 0.5);
    sc.distance = 22;
    sc.updateCamera();
    const el = client.canvasEl;
    const r = el.getBoundingClientRect();
    for (let d = 0; d < 200; d += 4) {
      for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
        const px = r.width / 2 + dx, py = r.height / 2 + dy;
        const g = client.groundAt(px, py);
        if (g && Math.floor(g.x) === x && Math.floor(g.z) === y && client.buildingAtTile(x, y)) return { px: r.left + px, py: r.top + py };
      }
    }
    return null;
  }, [pick.belt.x, pick.belt.y]);
  check(!!px, "la case est à l'écran");
  if (px) {
    await page.waitForTimeout(500);
    // un simple clic : la seule case
    await page.mouse.click(px.px, px.py);
    await page.waitForTimeout(400);
    const one = await page.evaluate(() => [...window.__game.client.selected]);
    check(one.length === 1 && one[0] === pick.belt.ref, "un clic sélectionne la case", JSON.stringify(one));
    await page.waitForTimeout(400);
    await page.mouse.click(px.px, px.py, { clickCount: 2, delay: 60 });
    await page.waitForFunction((n) => window.__game.client.selected.size === n, path.length, { timeout: 30000 }).catch(() => {});
    const sel = await page.evaluate(() => [...window.__game.client.selected].sort((a, b) => a - b));
    const want = [...path].sort((a, b) => a - b);
    check(JSON.stringify(sel) === JSON.stringify(want), "le double clic sélectionne tout le chemin", `${sel.length} sélectionnés, ${want.length} attendus`);
    check(!sel.includes(pick.sp.ref), "le répartiteur n'est pas sélectionné");
    check(pick.outs.every((o) => !sel.includes(o.ref)), "les tapis après le répartiteur ne sont pas sélectionnés");
    // chaque tapis sélectionné est un tapis du joueur, relié à un autre de la sélection (sauf s'il est seul)
    bs = await frameBuildings();
    const byRef = new Map(bs.map((b) => [b.ref, b]));
    check(sel.every((r) => isBelt(byRef.get(r)) && byRef.get(r).owner === 0), "la sélection n'a que nos tapis");
    await page.waitForFunction(() => !!document.querySelector(".panel.sel .title"), null, { timeout: 30000 });
    const panel = await page.evaluate(() => document.querySelector(".panel.sel")?.textContent.replace(/\s+/g, " ").trim());
    check(panel?.includes(`${want.length} bâtiments`) && /Démolir/.test(panel), "fiche de sélection multiple (démolition)", panel);
    await page.screenshot({ path: `${outDir}/tapis-chemin.png`, timeout: 180000 });
    // un double clic sur un tapis après le répartiteur ne reprend pas le chemin d'avant
    const path2 = await page.evaluate((ref) => window.__game.client.query("beltPath", [ref]), pick.outs[0].ref);
    check(path2.every((r) => !want.includes(r)), "le chemin après le répartiteur est distinct", `${path2.length} tapis`);
  }
}
check(errors.length === 0, "aucune erreur dans la console", errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
