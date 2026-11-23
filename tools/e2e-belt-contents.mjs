// Contenu d'un tapis dans la fiche de sélection, dans la démo « logistique » (rendu WebGPU).
// Un vrai clic sur une case de tapis chargée ouvre la fiche ; elle montre les objets de la case (dans le sens
// de la marche) et ceux de toute la file, avec leurs nombres, identiques à la requête de la simulation, et
// mis à jour pendant que la file avance.
// Usage : node tools/e2e-belt-contents.mjs http://127.0.0.1:3061 [dossier des captures]
// Le rendu WebGPU demande un Chromium avec fenêtre : xvfb-run -a -s "-screen 0 1280x800x24" node …
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
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=logistique`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });
check(await page.evaluate(() => !!window.__game.client.scene.renderer.backend.isWebGPUBackend), "rendu WebGPU");

// les tapis de la démo sont au sud de la gare du joueur (la trame ne porte que les bâtiments du champ de
// vue) ; un peu de jeu pour qu'ils se remplissent
await page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if (client.data.buildings[f.buf[o + 1] & 0xff]?.key !== "station" || ((f.buf[o + 1] >> 8) & 0xff) !== 0) continue;
    const sc = client.scene;
    sc.target.set((f.buf[o + 2] & 0xffff) + 30, 0, ((f.buf[o + 2] >>> 16) & 0xffff) + 42);
    sc.distance = 70;
    sc.updateCamera();
  }
});
const t0 = await page.evaluate(() => window.__game.client.frame.tick);
await page.waitForFunction((t0) => window.__game.client.frame.tick > t0 + 600, t0, { timeout: 180000 });

// une case de tapis du joueur qui porte au moins deux objets, sur une file qui en porte plusieurs sortes si possible
const pick = await page.evaluate(async () => {
  const { client } = window.__game;
  const f = client.frame;
  let best = null;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    const def = client.data.buildings[f.buf[o + 1] & 0xff];
    if (def?.key !== "belt1" && def?.key !== "belt2" && def?.key !== "belt3") continue;
    if (((f.buf[o + 1] >> 8) & 0xff) !== 0) continue;
    const ref = f.buf[o] >>> 0;
    const info = await client.query("building", [ref]);
    const b = info?.belt;
    if (!b || b.tile.length < 2) continue;
    const score = b.line.length * 10 + b.tile.length;
    if (!best || score > best.score) best = { ref, x: f.buf[o + 2] & 0xffff, y: (f.buf[o + 2] >>> 16) & 0xffff, score, belt: b };
  }
  return best;
});
check(!!pick, "une case de tapis chargée", pick ? JSON.stringify(pick.belt) : "");
if (pick) {
  // caméra sur la case, puis un vrai clic sur le pixel qui tombe dessus
  const at = await page.evaluate(([x, y]) => {
    const { client } = window.__game;
    const sc = client.scene;
    sc.target.set(x + 0.5, 0, y + 0.5);
    sc.distance = 16;
    sc.updateCamera();
    const el = client.canvasEl;
    const r = el.getBoundingClientRect();
    for (let d = 0; d < 200; d += 4) {
      for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
        const px = r.width / 2 + dx, py = r.height / 2 + dy;
        const g = client.groundAt(px, py);
        if (g && Math.floor(g.x) === x && Math.floor(g.z) === y) return { px: r.left + px, py: r.top + py };
      }
    }
    return null;
  }, [pick.x, pick.y]);
  check(!!at, "la case est à l'écran");
  if (at) {
    await page.waitForTimeout(500);
    await page.mouse.click(at.px, at.py);
    await page.waitForFunction(() => !!document.querySelector(".sel .belt"), null, { timeout: 30000 });
    const sel = await page.evaluate(() => [...window.__game.client.selected]);
    check(sel.length === 1 && sel[0] === pick.ref, "le clic sélectionne la case de tapis", JSON.stringify(sel));
    // fiche et requête de la simulation, relevées ensemble (la fiche suit la requête à chaque image)
    const read = () => page.evaluate(async (ref) => {
      const { client } = window.__game;
      const info = await client.query("building", [ref]);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const el = document.querySelector(".sel .belt");
      const lane = [...el.querySelectorAll(".lane .bslot.full img")].length;
      const line = [...el.querySelectorAll(".row.wrap .item")].map((it) => [it.getAttribute("aria-label"), Number(it.querySelector(".num")?.textContent ?? 0)]);
      const names = client.data.items.map((i) => i.name);
      return { text: el.textContent.replace(/\s+/g, " ").trim(), lane, line, want: info.belt, names, ui: window.__game.ui?.buildingInfo?.belt ?? null };
    }, pick.ref);
    const a = await read();
    check(/Sur cette case/.test(a.text) && /Sur la file/.test(a.text), "la fiche montre le contenu du tapis", a.text);
    const ui = a.ui ?? a.want;
    check(a.lane === ui.tile.length, "objets de la case", `${a.lane} icônes, ${ui.tile.length} objets`);
    const want = ui.line.map(([it, n]) => [a.names[it], n]);
    check(JSON.stringify(a.line) === JSON.stringify(want), "objets de la file, par sorte", `${JSON.stringify(a.line)} / ${JSON.stringify(want)}`);
    await page.screenshot({ path: `${outDir}/tapis-contenu.png`, timeout: 180000 });
    // mise à jour en direct : le contenu de la fiche change pendant que la file avance
    let changed = false;
    for (let k = 0; k < 40 && !changed; k++) {
      await page.waitForTimeout(250);
      const b = await read();
      changed = b.text !== a.text;
    }
    check(changed, "la fiche suit le contenu en direct");
    await page.screenshot({ path: `${outDir}/tapis-contenu-2.png`, timeout: 180000 });
  }
}
check(errors.length === 0, "aucune erreur dans la console", errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
