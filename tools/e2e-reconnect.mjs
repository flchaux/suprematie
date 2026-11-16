// Reconnexion en cours de partie (état complet depuis la copie de référence), abandon, fin de partie et replay.
import { launchBrowser } from "./browser.mjs";
import { readdirSync, existsSync } from "node:fs";
const base = "http://127.0.0.1:3061/?k=testkey&norender";
const desyncDir = "/tmp/claude-1000/supreme-testdata/desync";
const nDesync = () => (existsSync(desyncDir) ? readdirSync(desyncDir).length : 0);
const d0 = nDesync();
const browser = await launchBrowser();
const ctx = await browser.newContext();
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("erreur", e.message));
await p.goto(base);
await p.fill("input", "Rita");
await p.click("button[type=submit]");
await p.waitForSelector("text=Ajouter une IA");
await p.click("button:has-text('Adaptative')");
await p.click("button:has-text('Lancer la partie')");
await p.waitForFunction(() => window.__game?.client.frame?.tick > 200, null, { timeout: 60000 });
const t1 = await p.evaluate(() => window.__game.client.frame.tick);
// rechargement : même jeton, même pseudo → reprise de la place avec l'état complet
await p.reload();
await p.waitForFunction(() => window.__game?.client.frame?.tick > 0, null, { timeout: 60000 });
const after = await p.evaluate(() => ({ tick: window.__game.client.frame.tick, me: window.__game.ui.me }));
console.log(`avant ${t1}, après rechargement : tick ${after.tick}, emplacement ${after.me}`);
await p.waitForTimeout(25000);
// abandon → fin de partie → replay
await p.evaluate(() => window.__game.client.surrender());
await p.waitForFunction(() => window.__game.ui.gameOver, null, { timeout: 30000 });
const go = await p.evaluate(() => window.__game.ui.gameOver);
console.log("fin :", JSON.stringify(go), "désynchronisations :", nDesync() - d0);
// lecture du replay dans une nouvelle page
const r = await ctx.newPage();
r.on("pageerror", (e) => console.log("erreur replay", e.message));
await r.goto(base);
await r.waitForFunction(() => window.__game, null, { timeout: 20000 });
await r.evaluate((u) => { window.__game.client.loadReplay(u); window.__game.client.setReplaySpeed(16); }, go.replay);
await r.waitForFunction(() => window.__game.client.frame?.winner !== undefined && window.__game.client.frame.winner !== -1, null, { timeout: 120000 });
console.log("replay rejoué jusqu'à la fin : tick", await r.evaluate(() => window.__game.client.frame.tick));
await browser.close();
