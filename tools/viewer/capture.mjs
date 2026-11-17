// Capture du visualiseur (~800 px de large) avec Playwright, pour vérifier les modèles.
// Usage : node tools/viewer/capture.mjs [units|buildings] [clé1,clé2]
import { launchBrowser } from "../browser.mjs";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { Sim } from "../../packages/shared/src/sim.ts";

const root = new URL("../..", import.meta.url).pathname;
const set = process.argv[2] ?? "units";
const only = process.argv[3];
const sim = await Sim.load(readFileSync(root + "packages/client/public/sim.wasm"));
writeFileSync(root + "tools/viewer/data.json", sim.dataJson());
const server = await createServer({ root: root + "tools/viewer", configFile: false, server: { port: 5199, fs: { allow: [root] } }, logLevel: "error" });
await server.listen();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[erreur]", e.message));
await page.goto(`http://localhost:5199/?set=${set}${only ? "&only=" + only : ""}${process.env.WEBGPU ? "" : "&webgl"}${process.env.UNIES ? "&unies" : ""}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(500);
mkdirSync(root + "tools/viewer/captures", { recursive: true });
const out = root + `tools/viewer/captures/${set}${only ? "-" + only.replace(/,/g, "_").slice(0, 40) : ""}${process.env.UNIES ? "-unies" : ""}.png`;
await page.screenshot({ path: out });
console.log("capture :", out);
await browser.close();
await server.close();
