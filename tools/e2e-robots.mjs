// Robots des Transhumants dans la démo « robots » : Bergers et Mâtins, nus puis équipés (une capture de chaque groupe),
// la charge (frappes, câble, fronde), fiche d'un Mâtin (trois emplacements, trois choix). Aucune erreur dans la page. La
// logique (meute, chasse, harpon, troupeau, chenil) est testée en Rust (sim/src/troupeau_tests.rs).
// Usage : node tools/e2e-robots.mjs http://127.0.0.1:3083 [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3083").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser([]);
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.mouse.move(700, 450);
await page.goto(`${base}/?k=testkey&demo=robots&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.tick >= 1 && window.__game.ui.me === 0, null, { timeout: 150000 });
const stop = (t) => page.evaluate((t) => window.__game.client.stopReplayAt(t), t);
const look = (dx, dz, dist) => page.evaluate(([dx, dz, dist]) => {
  const { client } = window.__game;
  const sc = client.scene;
  sc.target.set(client.map.w / 2 + dx, 0, client.map.h / 2 + dz);
  sc.distance = dist;
  sc.updateCamera();
}, [dx, dz, dist]);
const shot = async (name) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 240000 });
};
await stop(150);
await look(-2, 2, 34);
await page.waitForFunction(() => window.__game.client.frame.tick >= 150, null, { timeout: 240000 });
const units = (key) => page.evaluate((key) => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (ui.data.units[f.buf[o + 1] & 0xff].key === key) out.push([f.buf[o] >>> 0, f.buf[o + 2] / 256, f.buf[o + 3] / 256]);
  return out;
}, key);
const sh = await units("shepherd"), ma = await units("mastiff");
check(sh.length === 4 && ma.length >= 4, "quatre Bergers, quatre Mâtins au moins", `${sh.length} ${ma.length}`);
const mid = (l) => [l.reduce((s, u) => s + u[1], 0) / l.length, l.reduce((s, u) => s + u[2], 0) / l.length];
const center = (c, dist) => page.evaluate(([x, z, dist]) => {
  const sc = window.__game.client.scene;
  sc.target.set(x, 0, z);
  sc.distance = dist;
  sc.updateCamera();
}, [c[0], c[1], dist]);
await center(mid(sh), 46);
await page.waitForTimeout(3000);
await shot("robots-bergers");
await center(mid(ma), 20);
await page.waitForTimeout(2500);
await shot("robots-matins");
// fiche d'un Mâtin
await page.evaluate((id) => window.__game.client.selectIds([id]), ma[0][0]);
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods, null, { timeout: 60000 });
await page.waitForTimeout(2000);
check((await page.locator(".mods .slot").count()) === 3 && (await page.locator(".mods .slot .mb").count()) === 9, "trois emplacements, neuf choix pour le Mâtin");
check((await page.locator(".mods .slot .mb svg path, .mods .slot .mb svg circle, .mods .slot .mb svg rect").count()) >= 9, "une icône par choix");
await shot("robots-fiche");
// la charge
await page.evaluate(() => window.__game.client.selectIds([]));
await stop(420);
await page.waitForFunction(() => window.__game.client.frame.tick >= 300, null, { timeout: 240000 });
await look(22, 1, 44);
await page.waitForFunction(() => window.__game.client.frame.tick >= 420, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await shot("robots-charge");
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
console.log(`captures : ${outDir}/robots-{bergers,matins,fiche,charge}.png`);
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
