// Personnalisation des Transhumants dans la démo « arche » (affichage et interactions ; les règles sont testées en Rust,
// sim/src/equipement_tests.rs) : convoi de l'Arche, trois emplacements d'une unité, gabarits (enregistrer, produire,
// équiper), atelier, modules et unités équipés. Une capture de chaque.
// Usage : node tools/e2e-equipement.mjs http://127.0.0.1:3083 [dossier des captures]
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
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=arche&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.tick > 2 && window.__game.ui.me === 0, null, { timeout: 150000 });
await page.mouse.move(640, 300);

/** unités d'un type : [identifiant, x, y] */
const units = (key) => page.evaluate((key) => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if (ui.data.units[f.buf[o + 1] & 0xff].key === key) out.push([f.buf[o] >>> 0, f.buf[o + 2] / 256, f.buf[o + 3] / 256]);
  return out.sort((a, b) => a[0] - b[0]);
}, key);
const look = (ids, x, y, dist) => page.evaluate(([ids, x, y, dist]) => {
  const { client } = window.__game;
  client.selectIds(ids);
  const sc = client.scene;
  sc.target.set(x, 0, y);
  sc.distance = dist;
  sc.updateCamera();
}, [ids, x, y, dist]);
const ticks = async (n) => {
  const t = await page.evaluate(() => window.__game.client.frame.tick);
  await page.waitForFunction((t) => window.__game.client.frame.tick > t, t + n, { timeout: 180000 });
};
const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = n; const f = () => (--k <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const click = (sel, text = "") => page.evaluate(([sel, text]) => { const b = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(text)); b?.click(); return !!b; }, [sel, text]);
const shot = async (name) => { await frames(3); await page.screenshot({ path: `${outDir}/equipement-${name}.png`, timeout: 240000 }); };

// convoi : quatre remorques derrière l'Arche à couronne de tourelles, deux derrière celle en patrouille
const arks = await units("ark");
check(arks.length === 3, "trois Arches dans la démo", String(arks.length));
const cars = await units("ark_car");
check(cars.length === 6, "six remorques attelées", String(cars.length));
await look([arks[0][0]], arks[0][1] - 4, arks[0][2] + 1, 26);
await page.waitForFunction(() => (window.__game.ui.unitInfo?.mods?.ark?.cars?.length ?? 0) === 4, null, { timeout: 60000 }).catch(() => {});
check((await page.$$eval(".car", (els) => els.length)) === 4, "fiche de l'Arche : quatre vignettes de remorques", String(await page.$$eval(".car", (els) => els.length)));
await shot("1-arche-convoi");
// l'Arche en patrouille, dans un virage : ses remorques la suivent
await page.evaluate(() => window.__game.client.selectIds([]));
await ticks(120);
const run = (await units("ark"))[2];
await look([], run[1] - 2, run[2], 24);
await shot("2-convoi-en-route");

// fiche d'une unité nue : trois emplacements, gabarits
const riders = await units("rider");
check(riders.length >= 4, "cavaliers de la démo", String(riders.length));
const bare = riders[0];
await look([bare[0]], bare[1] + 4, bare[2], 14);
await page.waitForFunction(() => window.__game.ui.unitInfo?.mods?.mods?.length === 3, null, { timeout: 60000 }).catch(() => {});
const slots = await page.$$eval(".mods .slot .st b", (els) => els.map((e) => e.textContent));
check(slots.join(",") === "Arme,Châssis,Équipement", "trois emplacements dans la fiche", slots.join(","));
check(await click(".mods .kits", "Gabarits"), "bouton des gabarits");
await page.waitForSelector(".kit .kb", { timeout: 30000 });
const rows = await page.$$eval(".kit .kl", (els) => els.map((e) => e.textContent.trim()));
check(rows.join(",") === "Arme,Châssis,Équipement", "gabarit : un choix par emplacement", rows.join(","));
check((await page.$$eval(".kit .kb.on", (els) => els.map((e) => e.dataset.kit))).join(",") === "rider_long,rider_plate,rider_loot", "gabarit de production de la démo montré", (await page.$$eval(".kit .kb.on", (els) => els.map((e) => e.dataset.kit))).join(","));
// second gabarit : on choisit, la simulation l'enregistre
await click(".kit .kt", "II");
await frames(2);
for (const k of ["rider_flame", "rider_engine"]) await page.evaluate((k) => document.querySelector(`.kit .kb[data-kit="${k}"]`)?.click(), k);
await ticks(6);
await page.waitForFunction(() => { const { ui } = window.__game; const r = ui.data.units.findIndex((u) => u.key === "rider"); return (ui.unitInfo?.mods?.kits?.find((k) => k[0] === r)?.[3] ?? 0) > 0; }, null, { timeout: 60000 }).catch(() => {});
const saved = await page.evaluate(() => { const { ui } = window.__game; const r = ui.data.units.findIndex((u) => u.key === "rider"); const v = ui.unitInfo?.mods?.kits?.find((k) => k[0] === r)?.[3] ?? 0; return [v & 255, (v >> 8) & 255].map((m) => ui.data.mods[m]?.key).join(","); });
check(saved === "rider_flame,rider_engine", "gabarit II enregistré par la simulation", saved);
await shot("3-unite-gabarits");
check(await click(".kit .go", "Équiper"), "bouton Équiper");
await page.waitForFunction(() => { const m = window.__game.ui.unitInfo?.mods; return m && (m.job > 0 || m.want > 0 || m.mods.some((x) => x > 0)); }, null, { timeout: 60000 }).catch(() => {});
const st = await page.evaluate(() => { const m = window.__game.ui.unitInfo?.mods; return m ? { job: m.job, want: m.want, mods: m.mods } : null; });
check(!!st && (st.job > 0 || st.want > 0), "l'unité s'équipe selon le gabarit", JSON.stringify(st));

// atelier : gabarits par type d'unité, pastille de celui de la production
const shop = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) if (ui.data.buildings[f.buf[o + 1] & 0xff].key === "t_workshop") return [f.buf[o] | 0, f.buf[o + 2] & 0xffff, f.buf[o + 2] >>> 16];
  return null;
});
if (!shop) await page.evaluate(() => { const sc = window.__game.client.scene; const m = window.__game.client.map; sc.target.set(m.w / 2 - 9, 0, m.h / 2 - 17); sc.distance = 22; sc.updateCamera(); });
await frames(4);
const ref = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) if (ui.data.buildings[f.buf[o + 1] & 0xff].key === "t_workshop") { client.selectIds([f.buf[o] >>> 0]); return [f.buf[o] >>> 0, f.buf[o + 2] & 0xffff, f.buf[o + 2] >>> 16]; }
  return null;
});
check(!!ref, "atelier de la démo", JSON.stringify(ref));
if (ref) {
  await look([ref[0]], ref[1] + 1, ref[2] + 1, 20);
  await page.waitForFunction(() => [...document.querySelectorAll(".units .ub .lit")].some((e) => e.textContent === "I"), null, { timeout: 60000 }).catch(() => {});
  check((await page.$$eval(".units .ub .lit", (els) => els.map((e) => e.textContent))).includes("I"), "atelier : le cavalier sort équipé (pastille I)");
  await click("button.icon-btn", "Bélier");
  await page.waitForSelector(".kit .kb[data-kit='ram_saw']", { timeout: 30000 }).catch(() => {});
  check(!!(await page.$(".kit .kb[data-kit='ram_saw']")), "atelier : gabarits du bélier");
  await shot("4-atelier");
}
// vues d'ensemble : unités sous leurs équipements, modules
const all = [];
for (const k of ["tracker", "rider", "harrow", "towed_gun", "ram"]) all.push(...(await units(k)));
const cx = all.reduce((n, u) => n + u[1], 0) / all.length;
const cy = all.reduce((n, u) => n + u[2], 0) / all.length;
await look([], cx, cy, 20);
await shot("5-unites");
const mid = await page.evaluate(() => { const m = window.__game.client.map; return [m.w / 2, m.h / 2]; });
await look([], mid[0] - 20, mid[1] - 11, 24);
await shot("6-modules");
check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 4).join(" | "));
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
