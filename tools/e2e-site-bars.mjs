// Barres de progression des chantiers, dans la démo « chantiers » (rendu WebGPU) : bâtiments, organes de la
// Souche, files de tapis, rails, répartiteurs, bras et murs en chantier ont chacun leur barre ; deux captures,
// de près et de loin.
// Usage : node tools/e2e-site-bars.mjs http://127.0.0.1:3061 [dossier des captures]
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
await page.goto(`${base}/?k=testkey&demo=chantiers`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });
check(await page.evaluate(() => !!window.__game.client.scene.renderer.backend.isWebGPUBackend), "rendu WebGPU");

// caméra sur le centre des chantiers du joueur 0 ; nombre de chantiers dans l'image
const look = async (distance) => {
  const n = await page.evaluate((distance) => {
    const { client } = window.__game;
    const f = client.frame;
    let sx = 0, sz = 0, n = 0;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
      if (((f.buf[o + 1] >> 8) & 0xff) !== 0 || f.buf[o + 4] >= 65536) continue;
      sx += f.buf[o + 2] & 0xffff;
      sz += (f.buf[o + 2] >>> 16) & 0xffff;
      n++;
    }
    const sc = client.scene;
    if (n) sc.target.set(sx / n + 0.5, 0, sz / n + 0.5);
    sc.distance = distance;
    sc.updateCamera();
    return n;
  }, distance);
  // quelques images pour que la zone vue et les barres suivent la caméra
  await page.waitForTimeout(4000);
  return n;
};

for (const [name, d] of [["pres", 45], ["loin", 200]]) {
  const sites = await look(d);
  const bars = await page.evaluate(() => window.__game.client.scene.entities.siteBars.count);
  check(sites > 80, `${name} : chantiers dans l'image`, String(sites));
  // fond + part faite au moins, pour chaque chantier vu
  check(bars >= 2 * 80, `${name} : barres de chantier dessinées`, `${bars} instances`);
  await page.screenshot({ path: `${outDir}/site-bars-${name}.png`, timeout: 120000 });
  console.log(`capture : ${outDir}/site-bars-${name}.png`);
}

check(errors.length === 0, "aucune erreur dans la console", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
