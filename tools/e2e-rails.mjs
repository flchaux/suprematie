// Capture des virages de rail dans la démo « logistique » (rail coudé parcouru par deux trains).
// Vérifie que les rails d'angle sont dessinés en virage (forme non nulle dans le mot auxiliaire) et
// photographie le premier coude, puis un train qui le prend.
// Usage : node tools/e2e-rails.mjs http://127.0.0.1:3061 [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=logistique&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });
// rails en virage : (x, z, forme) d'après le tampon de rendu (8 mots par bâtiment, forme dans le mot 5)
const corners = await page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    const def = client.data.buildings[f.buf[o + 1] & 0xff];
    if (def?.key !== "rail") continue;
    const shape = f.buf[o + 5] & 7;
    if (shape) out.push([f.buf[o + 2] & 0xffff, (f.buf[o + 2] >>> 16) & 0xffff, shape]);
  }
  return out;
});
console.log("rails en virage :", JSON.stringify(corners));
const aim = (x, z, distance) => page.evaluate(([x, z, distance]) => {
  const sc = window.__game.client.scene;
  sc.target.set(x, 0, z);
  sc.distance = distance;
  sc.updateCamera();
}, [x, z, distance]);
let n = 0;
for (const [x, z] of corners.slice(0, 2)) {
  await aim(x + 0.5, z + 0.5, 14);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/rails-virage-${n++}.png` });
}
// un train dans le premier coude : on attend qu'il passe à moins d'une case du coin
if (corners.length) {
  const [cx, cz] = corners[0];
  await aim(cx + 0.5, cz + 0.5, 14);
  const ok = await page.waitForFunction(([cx, cz]) => {
    const f = window.__game.client.frame;
    for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += 5) {
      if ((f.buf[o + 3] & 0xff) !== 0) continue;
      const x = f.buf[o + 1] / 256;
      const z = f.buf[o + 2] / 256;
      // dans la case d'angle, hors de ses bords (entrée et sortie)
      if (x > cx + 0.05 && x < cx + 0.95 && z > cz + 0.05 && z < cz + 0.95) {
        window.__railHit = [x, z];
        return true;
      }
    }
    return false;
  }, [cx, cz], { timeout: 120000, polling: 16 }).then(() => true, () => false);
  console.log(ok ? `train dans le virage en ${await page.evaluate(() => window.__railHit.map((v) => v.toFixed(2)).join(", "))}` : "aucun train vu dans le virage");
  await page.screenshot({ path: `${outDir}/rails-virage-train.png` });
}
console.log(errors.length ? "erreurs : " + errors.slice(0, 5).join(" | ") : "aucune erreur");
await browser.close();
