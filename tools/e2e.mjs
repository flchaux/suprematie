// Test de bout en bout : ouvre le jeu dans Chrome, entre dans le salon, ajoute une IA, lance la partie, capture.
// Usage : node tools/e2e.mjs [url] [secondes]
import { launchBrowser } from "./browser.mjs";
const url = process.argv[2] ?? "http://127.0.0.1:3061/?k=testkey&webgl";
const secs = Number(process.argv[3] ?? 15);
const out = process.argv[4] ?? "tools/viewer/captures/e2e.png";
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.fill("input", "Testeur");
await page.click("button[type=submit]");
await page.waitForSelector("text=Ajouter une IA", { timeout: 10000 });
await page.click("button:has-text('Rush')");
await page.waitForTimeout(300);
await page.click("button:has-text('Lancer la partie')");
await page.waitForFunction(() => document.querySelector(".top"), null, { timeout: 60000 });
await page.waitForTimeout(secs * 1000);
await page.screenshot({ path: out });
const info = await page.evaluate(() => document.querySelector(".top")?.textContent);
console.log("barre :", info?.replace(/\s+/g, " ").slice(0, 300));
console.log("erreurs :", errors.slice(0, 10));
await browser.close();
