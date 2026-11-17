// Test de jeu : sélectionne le commandant, pose un générateur et un extracteur à la souris,
// déplace le commandant, vérifie que la simulation a bien construit.
import { launchBrowser } from "./browser.mjs";
const url = process.argv[2] ?? "http://127.0.0.1:3061/?k=testkey&webgl";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.fill("input", "Testeur");
await page.click("button[type=submit]");
await page.waitForSelector("text=Ajouter une IA");
await page.click("button:has-text('Tortue')");
await page.click("button:has-text('Lancer la partie')");
await page.waitForFunction(() => window.__game?.client.frame, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const g = () => page.evaluate.bind(page);
// sélectionner le commandant
await page.evaluate(() => {
  const { client, ui } = window.__game;
  const me = client.frame.players[ui.me];
  client.selectIds([me.commander]);
  client.centerOnCommander();
});
await page.waitForTimeout(800);
const canBuild = await page.evaluate(() => window.__game.ui.canBuild);
console.log("peut construire :", canBuild);
// poser un générateur à droite de l'écran
// rendu logiciel très lent (sans carte graphique) : pas d'attente de stabilité sur ces boutons
await page.click("button.tab[title='Énergie']", { force: true });
await page.click("button.card:has-text('Générateur')", { force: true });
await page.mouse.move(600, 300);
await page.waitForTimeout(1500);
await page.mouse.move(605, 302);
await page.waitForTimeout(1500);
const ghost = await page.evaluate(() => window.__game.client.ghostCells);
console.log("fantôme :", JSON.stringify(ghost));
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(12000);
const res = await page.evaluate(() => {
  const { client, ui } = window.__game;
  const f = client.frame;
  const out = [];
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += 8) {
    out.push({ kind: f.buf[o + 1] & 0xff, owner: (f.buf[o + 1] >> 8) & 0xff, build: f.buf[o + 4] });
  }
  return { me: ui.me, tick: f.tick, buildings: out.filter((b) => b.owner === ui.me), stock: ui.stock.slice(6, 9), fps: ui.fps };
});
console.log(JSON.stringify(res));
await page.screenshot({ path: "tools/viewer/captures/e2e-play.png" });
console.log("erreurs :", errors.slice(0, 8));
await browser.close();
