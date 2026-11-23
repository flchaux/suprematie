// Améliorations des Transhumants dans la démo « arche » : fiche de l'Arche (emplacements, installation, annulation),
// neuf tourelles déployées puis rappelées, fiche d'un module aménagé, une capture de chaque. La logique (coûts,
// exclusivité, paliers, bouclier, sauvegarde) est testée en Rust (sim/src/ameliorations_tests.rs).
// Usage : node tools/e2e-arche.mjs http://127.0.0.1:3083 [dossier des captures]
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/?k=testkey&demo=arche&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.tick > 2 && window.__game.ui.me === 0, null, { timeout: 150000 });

/** unités d'un type (ou tourelles) : [identifiant, x, y, déployée] */
const units = (key) => page.evaluate((key) => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    const u = ui.data.units[f.buf[o + 1] & 0xff];
    if (key === "turret" ? u.turret : u.key === key) out.push([f.buf[o] >>> 0, f.buf[o + 2] / 256, f.buf[o + 3] / 256, (f.buf[o + 1] >> 20) & 1]);
  }
  return out;
}, key);
const look = (id, x, y, dist) => page.evaluate(([id, x, y, dist]) => {
  const { client } = window.__game;
  client.selectIds([id]);
  const sc = client.scene;
  sc.target.set(x, 0, y);
  sc.distance = dist;
  sc.updateCamera();
}, [id, x, y, dist]);
const ticks = async (n) => {
  const t = await page.evaluate(() => window.__game.client.frame.tick);
  await page.waitForFunction((t) => window.__game.client.frame.tick > t, t + n, { timeout: 120000 });
};
// clic direct dans la page : le rendu logiciel est trop lent pour les clics de Playwright
const click = (sel) => page.evaluate((sel) => document.querySelector(sel)?.click(), sel);

// l'Arche équipée : ses neuf tourelles se déploient autour d'elle
const arks = (await units("ark")).sort((a, b) => a[0] - b[0]);
check(arks.length >= 2, "deux Arches dans la démo", String(arks.length));
const [full, bare] = arks;
await look(full[0], full[1], full[2] + 2, 34);
await page.waitForFunction(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  let n = 0;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (ui.data.units[f.buf[o + 1] & 0xff].turret && (f.buf[o + 1] >> 20) & 1) n++;
  return n === 9;
}, null, { timeout: 120000 });
check((await units("turret")).length === 9, "neuf tourelles déployées");
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.ark?.turrets.length === 9, null, { timeout: 30000 });
check((await page.locator(".mods .slot").count()) === 5, "cinq emplacements dans la fiche");
check((await page.locator(".mods .turs .tb").count()) === 9, "neuf tourelles dans la fiche");
check((await page.locator(".mb.on").count()) === 5, "cinq améliorations installées");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/arche-tourelles.png`, timeout: 120000 });

// l'Arche nue : choix, coût, installation, annulation
await look(bare[0], bare[1], bare[2] + 2, 26);
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.mods?.every((m) => m === 0), null, { timeout: 30000 });
await page.waitForTimeout(800);
const can = await page.locator(".mb.ok").count();
check(can >= 10, "des améliorations installables", String(can));
await page.locator('[data-mod="ark_shield1"]').hover({ force: true, timeout: 60000 });
await page.waitForTimeout(600);
const tip = await page.locator(".tt-float").innerText().catch(() => "");
check(/Bulle de 6 cases/.test(tip) && /Circuit/.test(tip) && /45 s/.test(tip), "infobulle chiffrée du bouclier", tip.replace(/\n/g, " | ").slice(0, 160));
await page.screenshot({ path: `${outDir}/arche-fiche.png`, timeout: 120000 });
await click('[data-mod="ark_w_flame"]');
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.job > 0, null, { timeout: 30000 });
await page.waitForFunction(() => document.querySelector(".mods .job button"), null, { timeout: 30000 });
check(true, "installation en cours dans la fiche");
await click(".mods .job button");
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.job === 0, null, { timeout: 30000 });
check(true, "installation annulée");

// rappel des tourelles de la première Arche
await look(full[0], full[1], full[2] + 2, 30);
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.ark?.out === true, null, { timeout: 30000 });
await click(".mods .sub .icon-btn");
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.ark?.out === false, null, { timeout: 30000 });
await ticks(260);
check((await units("turret")).length === 0, "tourelles rentrées à bord", String((await units("turret")).length));

// un module aménagé
const mod = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.buildings.findIndex((d) => d.key === "t_generator");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === k) return [f.buf[o] >>> 0, f.buf[o + 2] & 0xffff, f.buf[o + 2] >>> 16];
  }
  return null;
});
check(!!mod, "générateur aménagé");
if (mod) {
  await look(mod[0], mod[1], mod[2] + 2, 20);
  await page.waitForFunction(() => window.__game.ui.buildingInfo?.transh?.mods, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  check((await page.locator(".mods .slot .mb").count()) === 2, "deux aménagements au choix pour le module");
  await page.screenshot({ path: `${outDir}/arche-module.png`, timeout: 120000 });
}
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
console.log(`captures : ${outDir}/arche-tourelles.png, arche-fiche.png, arche-module.png`);
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
