// Machines jumelles dans la démo « logistique » : deux paires d'assembleurs d'engrenages collés, nourries
// chacune par un seul tapis qui entre dans la première machine.
// - Paire de gauche : chaque machine a son tapis de sortie. Chaque tapis ne porte que la production de sa
//   machine, et les deux produisent.
// - Paire de droite : seule la seconde a un tapis de sortie. La première produit quand même (ses
//   engrenages sortent par sa voisine), et le tapis de la voisine porte la production des deux.
// Contrôles : fiche (« Jumelée », ingrédients et produits), cadence de chaque machine, engrenages vus sur
// chaque tapis de sortie (relevés à chaque image du worker), capture de la scène.
// Usage : node tools/e2e-twins.mjs http://127.0.0.1:3061 [dossier des captures]
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

const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=logistique&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });

// vue d'ensemble (la trame ne porte que les bâtiments du champ de vue), puis les quatre assembleurs
// d'engrenages jumeaux : ceux qui ont une jumelle, triés par x
await page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  let sx = 0, sz = 0;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    sx += f.buf[o + 2] & 0xffff;
    sz += (f.buf[o + 2] >>> 16) & 0xffff;
  }
  const sc = client.scene;
  sc.target.set(sx / f.nBuildings, 0, sz / f.nBuildings);
  sc.distance = 250;
  sc.updateCamera();
});
const t1 = await page.evaluate(() => window.__game.client.frame.tick);
await page.waitForFunction((t1) => window.__game.client.frame.tick > t1 + 10, t1, { timeout: 60000 });
const asm = await page.evaluate(async () => {
  const { client } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if (client.data.buildings[f.buf[o + 1] & 0xff]?.key !== "assembler1") continue;
    const ref = f.buf[o] >>> 0;
    const info = await client.query("building", [ref]);
    if (info?.twins) out.push({ ref, x: f.buf[o + 2] & 0xffff, y: (f.buf[o + 2] >>> 16) & 0xffff });
  }
  return out.sort((a, b) => a.x - b.x);
});
check(asm.length === 4, "quatre assembleurs jumeaux", JSON.stringify(asm));
if (asm.length === 4) {
  const [a, b, c, d] = asm;
  const y = a.y;
  // colonnes des tapis de sortie (sous les machines) : A en a.x, B en b.x + 1, D en d.x + 1 ; C n'en a pas
  const cols = { A: a.x, B: b.x + 1, C: c.x, D: d.x + 1 };
  await page.evaluate(([cx, cz]) => {
    const sc = window.__game.client.scene;
    sc.target.set(cx, 0, cz);
    sc.distance = 22;
    sc.updateCamera();
  }, [(a.x + d.x) / 2 + 1, y + 3]);
  // engrenages vus sur chaque colonne de sortie (sous les machines), à chaque image du worker
  await page.evaluate(([cols, y]) => {
    const { client } = window.__game;
    const gear = client.data.items.findIndex((it) => it.key === "gear");
    window.__seen = { A: 0, B: 0, C: 0, D: 0, other: 0 };
    const orig = client.onWorker.bind(client);
    client.onWorker = (m) => {
      orig(m);
      const f = client.frame;
      if (!f || m.type !== "frame") return;
      for (let i = 0, o = f.itemOff; i < f.nItems; i++, o += 3) {
        const x = f.buf[o] / 256, z = f.buf[o + 1] / 256;
        if (z < y + 2 || z > y + 7) continue;
        const col = Object.keys(cols).find((k) => x >= cols[k] && x < cols[k] + 1);
        if (!col) continue;
        if ((f.buf[o + 2] & 0xff) === gear) window.__seen[col]++;
        else window.__seen.other++;
      }
    };
  }, [cols, y]);
  // une minute de jeu
  const t0 = await page.evaluate(() => window.__game.client.frame.tick);
  await page.waitForFunction((t0) => window.__game.client.frame.tick > t0 + 1200, t0, { timeout: 240000 });
  const infos = await page.evaluate(async (refs) => Promise.all(refs.map((r) => window.__game.client.query("building", [r]))), asm.map((m) => m.ref));
  const seen = await page.evaluate(() => window.__seen);
  const flows = infos.map((i) => i.flow);
  console.log("cadences (par minute) :", flows.join(" "), "— engrenages vus :", JSON.stringify(seen));
  check(infos.every((i) => i.twins === 1), "chaque machine a une jumelle");
  check(flows.every((v) => v > 0), "les quatre machines produisent, même celle sans sortie", flows.join(" "));
  const lo = Math.min(...flows), hi = Math.max(...flows);
  check(hi - lo <= hi / 5, "cadences voisines (la machine sans sortie n'est pas bridée)", flows.join(" "));
  check(seen.A > 0 && seen.B > 0, "paire de gauche : chaque tapis de sortie porte des engrenages", `A ${seen.A}, B ${seen.B}`);
  check(seen.C === 0, "paire de droite : pas de tapis sous la machine sans sortie", `C ${seen.C}`);
  check(seen.D > 0, "paire de droite : le tapis de la voisine porte des engrenages", `D ${seen.D}`);
  check(seen.other === 0, "rien d'autre que des engrenages sur les tapis de sortie", `${seen.other}`);
  // la scène (conduites vertes entre jumelles, engrenages sur les tapis), puis la fiche de la machine sans sortie
  await page.screenshot({ path: `${outDir}/jumelles-scene.png`, timeout: 180000 });
  await page.evaluate((r) => { window.__game.client.selected = new Set([r]); }, c.ref);
  await page.waitForTimeout(1500);
  const panel = await page.evaluate(() => document.querySelector(".twins")?.textContent ?? "");
  check(/ingrédients et produits partagés/.test(panel), "fiche « Jumelée » : ingrédients et produits", panel.trim());
  await page.screenshot({ path: `${outDir}/jumelles-fiche.png`, timeout: 180000 });
}
check(errors.length === 0, "aucune erreur", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
