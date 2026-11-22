// Races en jeu réel : un joueur choisit sa race dans le salon et joue contre une IA. Contrôles : race
// reçue par la simulation, barre du haut et menu de construction de la race ; Souche : une frondaison
// plantée par la Reine qui pousse sur le terreau ; Transhumants : un chenillard qui se déploie puis se
// replie, l'arbre de recherche de la race ; aucune erreur dans la page. Captures dans le dossier donné.
// Une partie par race (le serveur n'en héberge qu'une) : relancer le serveur entre les deux.
// Usage : node tools/e2e-races.mjs http://127.0.0.1:3083 souche|transhumants [dossier des captures]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "http://127.0.0.1:3083").replace(/\/$/, "");
const which = process.argv[3] ?? "souche";
const outDir = process.argv[4] ?? new URL("./viewer/captures", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const webgpu = !!process.env.WEBGPU;
const browser = await launchBrowser([], webgpu ? { headless: false } : {});
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
const url = `${base}/?k=testkey${webgpu ? "" : "&webgl"}`;

async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false })); });
  await page.goto(url);
  await page.fill("input", name);
  await page.click("button[type=submit]");
  await page.waitForSelector("text=Salon de préparation");
  return { page, errors };
}

const me = await open(which === "souche" ? "Racine" : "Nomade");
const raceName = which === "souche" ? "Souche" : "Transhumants";
await me.page.waitForSelector("select:has(option:has-text('Transhumants'))");
await me.page.locator(".player.me, .player", { hasText: which === "souche" ? "Racine" : "Nomade" }).first().locator("select:has(option:has-text('Souche'))").selectOption({ label: raceName });
await me.page.waitForTimeout(800);
const lobbyRaces = await me.page.evaluate(() => window.__game.ui.lobby.players.map((p) => p.race ?? 0));
check(lobbyRaces[0] === (which === "souche" ? 1 : 2), "race choisie dans le salon", JSON.stringify(lobbyRaces));
await me.page.screenshot({ path: `${outDir}/races-salon-${which}.png` });
await me.page.click("button:has-text('Tortue')");
await me.page.click("button:has-text('Lancer la partie')");
await me.page.waitForFunction(() => window.__game?.client.frame && window.__game.ui.data, null, { timeout: 120000 });
await me.page.waitForTimeout(2000);
const a = me;
const b = me;

if (which === "souche") {
// ---------- Souche ----------
const sa = await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const me = client.frame.players[ui.me];
  return { race: ui.race, seve: ui.seve, sels: ui.sels, cats: [...document.querySelectorAll(".build .tab .tn")].map((e) => e.textContent), commander: me.commander };
});
check(sa.race === 1, "joueur Souche : race 1 dans la simulation");
check(sa.seve >= 400 && sa.sels >= 150, "réserve de départ du réseau", `sève ${sa.seve}, sels ${sa.sels}`);
// Reine sélectionnée : menu de construction de la Souche
await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  client.selectIds([client.frame.players[ui.me].commander]);
  client.centerOnCommander();
});
await a.page.waitForTimeout(800);
const cats = await a.page.evaluate(() => [...document.querySelectorAll(".build .tabs > .tab")].map((e) => e.getAttribute("title")));
check(cats.join(",") === "Réseau,Organes,Défense", "menu de construction de la Souche", cats.join(","));
// planter une frondaison sur le terreau, à côté de la graine-mère (par l'ordre, comme le fait l'interface)
const planted = await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const d = ui.data;
  const leaves = d.buildings.findIndex((x) => x.key === "leaves");
  const heart = d.buildings.findIndex((x) => x.key === "seed_heart");
  const f = client.frame;
  let hb = null;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === heart && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) hb = { x: f.buf[o + 2] & 0xffff, y: f.buf[o + 2] >>> 16 };
  }
  if (!hb) return null;
  // à droite de la graine-mère (3 × 3), sur son terreau ; ordre BUILD : [type, file, genre, x, y, dir, n, unités…]
  const x = hb.x + 4, y = hb.y;
  client.cmd([3, 0, leaves, x, y, 0, 1, client.frame.players[ui.me].commander]);
  return { x, y };
});
check(!!planted, "ordre de plantation envoyé");
const t0 = await a.page.evaluate(() => window.__game.client.frame.tick);
// la Reine marche jusqu'au chantier, plante, puis la frondaison pousse (12 s) : on attend 25 s de jeu
await a.page.waitForFunction((t) => window.__game.client.frame.tick > t + 500, t0, { timeout: 600000 });
const grown = await a.page.evaluate(() => {
  const { client, ui } = window.__game;
  const leaves = ui.data.buildings.findIndex((x) => x.key === "leaves");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === leaves && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return { build: f.buf[o + 4] };
  }
  return null;
});
check(!!grown, "frondaison plantée", JSON.stringify(grown));
await a.page.screenshot({ path: `${outDir}/races-souche.png`, timeout: 120000 });

}
// ---------- Transhumants ----------
if (which === "transhumants") {
const tb = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  return { race: ui.race, releves: ui.stock[30] ?? 0, cats: document.querySelectorAll(".build .tab").length, nomad: !!document.querySelector(".build .nomad") };
});
check(tb.race === 2, "joueur Transhumant : race 2 dans la simulation");
check(tb.releves >= 20, "relevés de départ", String(tb.releves));
// chenillard générateur : déploiement
const gen = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.units.findIndex((u) => u.key === "ch_generator");
  const f = client.frame;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return { id: f.buf[o] >>> 0, x: f.buf[o + 2], y: f.buf[o + 3] };
  }
  return null;
});
check(!!gen, "chenillard générateur au départ");
await b.page.evaluate(([id, x, y]) => {
  const { client } = window.__game;
  client.selectIds([id]);
  const sc = client.scene;
  sc.target.set(x / 256, 0, y / 256);
  sc.distance = 40;
  sc.updateCamera();
}, [gen.id, gen.x, gen.y]);
await b.page.waitForTimeout(800);
const deployBtn = b.page.locator("button.cmd[title='Déployer']");
check((await deployBtn.count()) === 1, "bouton Déployer du chenillard");
await deployBtn.click({ force: true });
const t1 = await b.page.evaluate(() => window.__game.client.frame.tick);
// déploiement : 15 s de jeu
await b.page.waitForFunction((t) => window.__game.client.frame.tick > t + 340, t1, { timeout: 600000 });
const deployed = await b.page.evaluate(() => {
  const { client, ui } = window.__game;
  const k = ui.data.buildings.findIndex((x) => x.key === "t_generator");
  const f = client.frame;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return { ref: f.buf[o] >>> 0 };
  }
  return null;
});
check(!!deployed, "générateur nomade déployé");
await b.page.screenshot({ path: `${outDir}/races-transhumants.png`, timeout: 120000 });
if (deployed) {
  await b.page.evaluate((ref) => window.__game.client.selectIds([ref]), deployed.ref);
  await b.page.waitForTimeout(1500);
  const fold = b.page.locator("button:has-text('Replier')");
  check((await fold.count()) === 1, "bouton Replier du module");
  if (await fold.count()) {
    await fold.click({ force: true });
    const t2 = await b.page.evaluate(() => window.__game.client.frame.tick);
    await b.page.waitForFunction((t) => window.__game.client.frame.tick > t + 20, t2, { timeout: 60000 });
    const back = await b.page.evaluate(() => {
      const { client, ui } = window.__game;
      const k = ui.data.units.findIndex((u) => u.key === "ch_generator");
      const f = client.frame;
      for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) if ((f.buf[o + 1] & 0xff) === k && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) return true;
      return false;
    });
    check(back, "le module redevient un chenillard");
  }
}
// recherche : arbre de la race
await b.page.evaluate(() => (window.__game.ui.showResearch = true));
await b.page.waitForTimeout(800);
const techs = await b.page.evaluate(() => [...document.querySelectorAll(".modal .tech b")].map((e) => e.textContent));
check(techs.includes("Atelier lourd") && !techs.includes("Automatisation"), "panneau de recherche des Transhumants", techs.join(", "));
await b.page.screenshot({ path: `${outDir}/races-recherche.png`, timeout: 120000 });
}

check(me.errors.length === 0, `aucune erreur dans la page (${raceName})`, me.errors.slice(0, 4).join(" | "));
await browser.close();
console.log(failed ? `${failed} échec(s)` : "tout est bon");
process.exit(failed ? 1 : 0);
