// Virages de rail dans la démo « logistique » (voie coudée parcourue par deux trains, jusqu'à ce que les
// gares soient vides, vers le tick 2000).
// 1) Les rails d'angle ont une forme de virage (mot auxiliaire du tampon de rendu).
// 2) Premier passage d'un train dans le premier coude : chaque position relevée dans la case d'angle doit être
//    sur le quart de cercle de rayon 1/2 case autour du coin intérieur.
// 3) Captures des deux coudes.
// Usage : node tools/e2e-rails.mjs http://127.0.0.1:3061 [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser();
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=logistique&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });
const aim = (x, z, distance) => page.evaluate(([x, z, distance]) => {
  const sc = window.__game.client.scene;
  sc.target.set(x, 0, z);
  sc.distance = distance;
  sc.updateCamera();
}, [x, z, distance]);

// ---------- 1) formes ----------
const corners = await page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if (client.data.buildings[f.buf[o + 1] & 0xff]?.key !== "rail") continue;
    const shape = f.buf[o + 5] & 7;
    if (shape) out.push([f.buf[o + 2] & 0xffff, (f.buf[o + 2] >>> 16) & 0xffff, shape]);
  }
  return out;
});
check(corners.length === 2, "deux rails d'angle en virage", JSON.stringify(corners));

// ---------- 2) un train dans le premier coude ----------
if (corners.length) {
  const [cx, cz, shape] = corners[0];
  const c = shape - 1;
  const kx = cx + 0.5 + (DIRS[c][0] + DIRS[(c + 1) % 4][0]) / 2;
  const kz = cz + 0.5 + (DIRS[c][1] + DIRS[(c + 1) % 4][1]) / 2;
  await aim(cx + 0.5, cz + 0.5, 30);
  // chaque image du worker est examinée (même si le rendu prend du retard) : positions des trains dans la case d'angle
  await page.evaluate(([cx, cz]) => {
    const { client } = window.__game;
    window.__railHits = [];
    const orig = client.onWorker.bind(client);
    client.onWorker = (d) => {
      orig(d);
      const f = client.frame;
      if (!f) return;
      for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += 5) {
        if ((f.buf[o + 3] & 0xff) !== 0) continue;
        const x = f.buf[o + 1] / 256;
        const z = f.buf[o + 2] / 256;
        if (x > cx && x < cx + 1 && z > cz && z < cz + 1) window.__railHits.push([f.tick, x, z]);
      }
    };
  }, [cx, cz]);
  await page.waitForFunction(() => window.__railHits.length >= 3, null, { timeout: 240000 }).catch(() => {});
  const hits = await page.evaluate(() => window.__railHits);
  const err = Math.max(...hits.map(([, x, z]) => Math.abs(Math.hypot(x - kx, z - kz) - 0.5)));
  check(hits.length >= 2, "positions de train relevées dans la case d'angle", hits.map(([t, x, z]) => `${t}:${x.toFixed(2)},${z.toFixed(2)}`).join(" "));
  check(hits.length > 0 && err < 0.02, "positions sur le quart de cercle", `écart max ${err.toFixed(3)} case`);
}

// ---------- 3) captures des coudes ----------
let n = 0;
for (const [x, z] of corners) {
  await aim(x + 0.5, z + 0.5, 12);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outDir}/rails-virage-${n++}.png` });
}
check(errors.length === 0, "aucune erreur", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
