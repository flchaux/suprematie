// Souche, suite, dans la démo « essaim » (affichage et interactions seulement ; les règles sont testées en
// Rust, sim/src/essaim_tests.rs) : nouveaux organes et organismes dessinés, Reine enracinée, caractère acquis
// fixé depuis la fiche de la Matrice, fiche d'un terrier, cocon qui s'ouvre, aucune erreur dans la page.
// Usage : node tools/e2e-essaim.mjs http://127.0.0.1:3061 [dossier des captures]
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
await page.goto(`${base}/?k=testkey&demo=essaim${webgpu ? "" : "&webgl"}`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });
// souris au centre : au bord de la page, elle ferait défiler la carte
await page.mouse.move(640, 300);
// fige la démo à un tick précis : le rendu logiciel est lent, les captures se font au calme
const stopAt = async (tick) => {
  await page.evaluate((t) => window.__game.client.stopReplayAt(t), tick);
  await page.waitForFunction((t) => window.__game.client.frame.tick >= t, tick, { timeout: 240000 });
};
/** Avance de `n` ticks, puis fige de nouveau. */
const run = async (n) => stopAt(await page.evaluate((n) => window.__game.client.frame.tick + n, n));
await stopAt(100);
check(await page.evaluate(() => window.__game.ui.me === 0 && window.__game.ui.race === 1), "on joue la Souche");

/** Premier bâtiment (ou unité) du joueur 0 d'une clé : référence et centre (cases). */
const find = (key, unit = false) => page.evaluate(([key, unit]) => {
  const { client, ui } = window.__game;
  const f = client.frame;
  if (unit) {
    const k = ui.data.units.findIndex((u) => u.key === key);
    const out = [];
    for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === 0) out.push({ ref: f.buf[o] >>> 0, x: f.buf[o + 2] / 256, z: f.buf[o + 3] / 256 });
    return out;
  }
  const k = ui.data.buildings.findIndex((b) => b.key === key);
  const d = ui.data.buildings[k];
  const out = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === 0) out.push({ ref: f.buf[o] >>> 0, x: (f.buf[o + 2] & 0xffff) + d.w / 2, z: (f.buf[o + 2] >>> 16) + d.h / 2 });
  return out;
}, [key, unit]);
const look = async (x, z, distance, yaw = 0) => {
  await page.evaluate(([x, z, distance, yaw]) => {
    const sc = window.__game.client.scene;
    sc.target.set(x, 0, z);
    sc.distance = distance;
    sc.yaw = yaw;
    sc.updateCamera();
  }, [x, z, distance, yaw]);
  // la trame suit la caméra avec du retard (rendu logiciel) : on laisse passer plusieurs images
  await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= 6 ? r() : requestAnimationFrame(f)); f(); }));
  await page.waitForTimeout(3000);
};
const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/essaim-${name}.png`, timeout: 240000 });
  console.log(`capture : ${outDir}/essaim-${name}.png`);
};

// tout est repéré d'abord, en vue large : la trame ne contient que la zone vue
const [heart] = await find("seed_heart");
await look(heart.x + 4, heart.z + 2, 90);
const at = {};
for (const key of ["bramble", "rhizome", "burrow", "maw", "sporangium", "cocoon", "spawnery", "matrix"]) {
  [at[key]] = await find(key);
  // la démo a pu dépasser l'ouverture du cocon avant d'être figée (chargement lent) : un second Béhémoth est là
  check(!!at[key] || (key === "cocoon" && (await find("behemoth", true)).length === 2), `organe : ${key}`);
}
at.cocoon ??= { x: heart.x + 8.5, z: heart.z - 4.5 };
for (const key of ["burster", "dart", "burrower", "nurse", "hornet", "moray", "leviathan", "behemoth", "queen"]) {
  [at[key]] = await find(key, true);
  check(!!at[key], `organisme : ${key}`);
}
await shot("base");
check(await page.evaluate(([x, z]) => {
  const t = window.__game.client.scene.terreau;
  return t.data[z * t.res * t.w + x * t.res] > 200;
}, [Math.floor(at.rhizome.x) + 4, Math.floor(at.rhizome.z)]), "terreau autour du rhizome");

// ---------- Reine enracinée ----------
const select = (id) => page.evaluate((id) => window.__game.client.selectIds(id === null ? [] : [id]), id);
await select(at.queen.ref);
await page.waitForFunction(() => window.__game.ui.unitInfo?.deployed === true, null, { timeout: 60000 });
check(await page.evaluate(() => [...document.querySelectorAll(".sel .status")].some((e) => e.textContent.includes("Enracinée"))), "fiche de la Reine : enracinée");
await select(null);
await look(at.queen.x, at.queen.z, 13);
await shot("reine");

// ---------- racine en cours de pose : son coût, plus cher loin de la graine-mère ----------
await look(heart.x + 1, heart.z - 6, 40);
await select(at.queen.ref);
await page.evaluate(() => window.__game.client.startBuild(window.__game.ui.data.buildings.findIndex((b) => b.key === "root")));
// le bord nord du câble ouest : une case libre, collée à la file, à une dizaine de cases de la graine-mère
const px = await page.evaluate(([x, z]) => {
  const p = { x: 0, y: 0 };
  const { client } = window.__game;
  let h = client.scene.target.y;
  for (let i = 0; i < 3; i++) {
    client.scene.project(x, h, z, p);
    h = client.groundAt(p.x, p.y)?.y ?? h;
  }
  return p;
}, [heart.x - 11, heart.z + 1]);
await page.mouse.move(px.x, px.y);
await page.mouse.move(px.x + 1, px.y + 1);
await page.waitForFunction(() => window.__game.ui.lineCost, null, { timeout: 60000 }).catch(() => {});
const cost = await page.evaluate(() => ({ line: window.__game.ui.lineCost, text: document.querySelector(".linecost")?.textContent ?? "" }));
check(!!cost.line && cost.line.pct >= 10 && cost.line.cost[0]?.[1] >= 5, "coût d'une racine éloignée dans le bandeau", JSON.stringify(cost));
check(/herbe :\s*\d+ cases?, \+\d+ sève.*bilan\s*[+-]?\d+/.test(cost.text), "ce qu'elle rapporte et le bilan", cost.text);
await shot("cout");
await page.evaluate(() => window.__game.client.cancelMode());
await page.mouse.move(640, 300);
await select(null);

// ---------- frondaison : herbe mangée, herbe à manger à la pose ----------
await look(heart.x - 8, heart.z - 4, 34);
check(await page.evaluate(([x, z]) => {
  const { client } = window.__game;
  return client.frame.soilN >= 45 && client.scene.terreau.at(Math.floor(x) - 9, Math.floor(z) - 5);
}, [heart.x, heart.z]), "herbe mangée : du terreau au nord de la frondaison");
await page.evaluate(() => window.__game.client.startBuild(window.__game.ui.data.buildings.findIndex((b) => b.key === "leaves")));
await page.mouse.move(700, 420);
await page.mouse.move(702, 421);
await page.waitForFunction(() => window.__game.ui.grass, null, { timeout: 60000 }).catch(() => {});
check(await page.evaluate(() => (window.__game.ui.grass?.near ?? -1) >= 0 && /herbe à \d+ cases · une case toutes les \d+ s, ≈ \d+ sève\/min/.test(document.querySelector(".mode")?.textContent ?? "")), "herbe à manger dans le bandeau de pose", JSON.stringify(await page.evaluate(() => window.__game.ui.grass)));
await shot("herbe");
await page.evaluate(() => window.__game.client.cancelMode());
await page.mouse.move(640, 300);
await select(null);

// ---------- œuf qui puise son prix, graine-mère nourrie de sacrifices ----------
await look(heart.x + 8, heart.z + 4, 40);
const [egg] = await find("egg_s", true);
check(!!egg, "œufs pondus par la couveuse");
await select(egg?.ref ?? null);
await page.waitForFunction(() => window.__game.ui.unitInfo?.egg?.paid?.length === 2, null, { timeout: 60000 }).catch(() => {});
check(await page.evaluate(() => [...document.querySelectorAll(".sel .kicker")].some((e) => e.textContent === "Puisé")), "fiche de l'œuf : prix puisé", JSON.stringify(await page.evaluate(() => window.__game.ui.unitInfo?.egg)));
await shot("oeuf");
const hearts = await find("seed_heart");
await select(hearts.find((h) => h.x > heart.x + 5)?.ref ?? null);
await page.waitForFunction(() => window.__game.ui.buildingInfo?.souche?.heart, null, { timeout: 60000 }).catch(() => {});
const fed = await page.evaluate(() => window.__game.ui.buildingInfo?.souche?.heart);
check(fed?.fed === 480 && [...(await page.evaluate(() => [...document.querySelectorAll(".sel .kicker")].map((e) => e.textContent)))].includes("Sacrifices"), "graine-mère : quatre carapaces sacrifiées", JSON.stringify(fed));
await shot("graine");
await select(null);

// ---------- couveuse : limite de portées, agrandissement ----------
const broods = await find("brood");
const small = broods.find((b) => b.x > heart.x);
const big = broods.find((b) => b.x < heart.x);
/** Fiche de la couveuse : compte, places, places libres. */
const places = () => page.evaluate(() => ({ text: document.querySelector(".sel .brood")?.textContent ?? "", all: document.querySelectorAll(".sel .place").length, free: document.querySelectorAll(".sel .place.empty").length }));
await look(heart.x + 2, heart.z + 4, 30);
await select(big?.ref ?? null);
await page.waitForFunction(() => document.querySelectorAll(".sel .place").length === 12, null, { timeout: 60000 }).catch(() => {});
let pl = await places();
check(pl.all === 12 && pl.free >= 6 && pl.free < 12 && /\d \/ 12/.test(pl.text) && !/limite/.test(pl.text), "couveuse agrandie : douze places", JSON.stringify(pl));
await shot("couveuse12");
await select(small?.ref ?? null);
await page.waitForFunction(() => document.querySelectorAll(".sel .place").length === 3, null, { timeout: 60000 }).catch(() => {});
pl = await places();
check(pl.all === 3 && pl.free === 0 && /3 \/ 3/.test(pl.text) && /limite atteinte/.test(pl.text), "couveuse : trois places, limite atteinte", JSON.stringify(pl));
await shot("couveuse");
await page.evaluate(() => [...document.querySelectorAll(".sel .upcard button")].find((b) => /6 portées/.test(b.textContent))?.click());
await run(20);
await page.waitForFunction(() => (window.__game.ui.buildingInfo?.upgrade ?? 0) > 0, null, { timeout: 60000 }).catch(() => {});
const growing = await page.evaluate(() => [...document.querySelectorAll(".sel .status")].map((e) => e.textContent).join(" | "));
check(/elle pond toujours/.test(growing), "agrandissement lancé, elle pond toujours", growing);
await select(null);

// ---------- Matrice : caractère acquis ----------
await look(heart.x + 4, heart.z + 2, 90);
await select(at.matrix.ref);
await page.waitForFunction(() => document.querySelectorAll(".adapt .fam").length === 5, null, { timeout: 60000 });
check((await page.evaluate(() => document.querySelectorAll(".adapt button").length)) === 2, "deux familles assez subies à fixer");
await page.evaluate(() => document.querySelector(".adapt button").click());
await run(40);
await page.waitForFunction(() => (window.__game.ui.buildingInfo?.adapt?.bits ?? 0) !== 0, null, { timeout: 60000 }).catch(() => {});
check((await page.evaluate(() => window.__game.ui.buildingInfo?.adapt?.bits)) === 1, "caractère acquis : armes cinétiques");
await shot("matrice");

// ---------- terrier ----------
await select(at.burrow.ref);
await page.waitForFunction(() => [...document.querySelectorAll(".sel .status")].some((e) => e.textContent.startsWith("Ouvert")), null, { timeout: 60000 }).catch(() => {});
check(await page.evaluate(() => [...document.querySelectorAll(".sel .status")].some((e) => e.textContent.startsWith("Ouvert"))), "fiche du terrier : ouvert");
await select(null);

// ---------- de près ----------
await look(at.nurse.x - 1, at.nurse.z, 20);
await shot("organismes");
await look(at.cocoon.x, at.cocoon.z + 2, 24);
await shot("cocon");
await look(at.spawnery.x + 2, at.spawnery.z + 3, 30);
await shot("frayere");
await look(at.rhizome.x + 3, at.rhizome.z, 30);
await shot("combat");
check(await page.evaluate(() => window.__game.client.scene.entities.effects.acidPool.mesh.count > 0), "flaques d'acide dessinées");

// ---------- le cocon s'ouvre (20 s après le début) ----------
await look(heart.x + 4, heart.z + 2, 90);
await stopAt(Math.max(470, await page.evaluate(() => window.__game.client.frame.tick + 5)));
await page.waitForTimeout(2000);
check((await find("behemoth", true)).length === 2 && (await find("cocoon")).length === 0, "le cocon s'est ouvert, un Béhémoth est né");
await look(at.cocoon.x, at.cocoon.z, 26);
await shot("behemoth");

check(errors.length === 0, "aucune erreur dans la console", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
