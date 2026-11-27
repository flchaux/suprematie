// Passerelles des Transhumants dans la démo « nomades » (affichage seulement ; le réseau de transfert est testé en
// Rust, sim/src/transfert_tests.rs, et le calcul des jonctions dans packages/client/test/walkways.test.ts) :
// campement de modules collés, une passerelle par jonction, fiche « Réseau : n bâtiments », une vue de haut et une
// vue rapprochée ; aucune erreur dans la page (ni de pipeline en WebGPU).
// Usage : node tools/e2e-passerelles.mjs http://127.0.0.1:3061 [dossier des captures]
// Rendu WebGPU (WEBGPU=1) : sous xvfb-run -a -s "-screen 0 1280x800x24".
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const webgpu = !!process.env.WEBGPU;
const browser = await launchBrowser([], webgpu ? { headless: false } : {});
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=nomades${webgpu ? "" : "&webgl"}`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0 && window.__game.ui.me === 0, null, { timeout: 150000 });
await page.mouse.move(640, 300);
const STOP = 60;
await page.evaluate((t) => window.__game.client.stopReplayAt(t), STOP);
await page.waitForFunction((t) => window.__game.client.frame.tick >= t, STOP, { timeout: 240000 });
if (webgpu) check(await page.evaluate(() => !!window.__game.client.scene.renderer.backend.isWebGPUBackend), "rendu WebGPU");

// le campement : la fonderie automatique la plus au nord (l'autre fonderie de la démo est sur la ligne des chariots)
const camp = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const key = (o) => ui.data.buildings[f.buf[o + 1] & 0xff].key;
  const list = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) list.push({ ref: f.buf[o] >>> 0, key: key(o), x: f.buf[o + 2] & 0xffff, z: f.buf[o + 2] >>> 16 });
  const furnace = list.filter((b) => b.key === "t_furnace").sort((a, b) => a.z - b.z)[0];
  return { furnace, list };
});
const fu = camp.furnace;
await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 4 ? r() : requestAnimationFrame(f)); f(); }));
const drawn = await page.evaluate(() => window.__game.client.scene.entities.walkways.mesh.count);
// file soute - fonderie - bastion - assembleur (3), laboratoire contre la fonderie et le bastion (2)
check(drawn >= 5, "passerelles dessinées (au moins les cinq du campement)", String(drawn));

const look = async (x, z, distance, tilt) => {
  await page.evaluate(([x, z, distance, tilt]) => {
    const sc = window.__game.client.scene;
    sc.target.set(x, 0, z);
    sc.distance = distance;
    sc.tilt = tilt;
    sc.updateCamera();
  }, [x, z, distance, tilt]);
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 6 ? r() : requestAnimationFrame(f)); f(); }));
  await page.waitForTimeout(3000);
};
const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/passerelles-${name}.png`, timeout: 240000 });
  console.log(`capture : ${outDir}/passerelles-${name}.png`);
};

// fiche de la fonderie : taille du réseau (soute, fonderie, bastion, assembleur, laboratoire)
await page.evaluate((ref) => window.__game.client.selectIds([ref]), fu.ref);
await page.waitForFunction(() => /Réseau\s*5\s*bâtiments/.test(document.body.innerText), null, { timeout: 240000 }).catch(() => {});
const sheet = await page.evaluate(() => (document.body.innerText.match(/Réseau\s*\d+\s*bâtiments?/) ?? [""])[0]);
check(/Réseau\s*5\s*bâtiments/.test(sheet), "fiche : réseau de 5 bâtiments", sheet);
await page.evaluate(() => window.__game.client.selectIds([]));

await look(fu.x + 2, fu.z + 2, 16, 1.5);
await shot("dessus");
await look(fu.x + 2, fu.z + 2.5, 6, 0.75);
await shot("pres");
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
console.log(`erreurs de la page : ${errors.length}`);
await browser.close();
process.exit(failed ? 1 : 0);
