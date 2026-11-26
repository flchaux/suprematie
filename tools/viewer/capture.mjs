// Capture du visualiseur (~800 px de large) avec Playwright, pour vérifier les modèles.
// Usage : node tools/viewer/capture.mjs [units|buildings|items|decor] [clé1,clé2]
// Variables : MODS=ark_w_rail,ark_shield2 (améliorations des Transhumants installées), DEP=0.5 (avancement des animations de déploiement, 0 replié, 1 déployé), VAR=2 (variante 2 des modèles, pièces « si:vN » ; VAR=all : chaque modèle une fois par variante), ZOOM=2 (caméra plus proche), ROT=180 (modèles tournés de 180°, vus de dos), LO=1 (niveau de détail réduit), SUFFIX=avant (nom de la capture), WEBGPU=1, UNIES=1
import { launchBrowser } from "../browser.mjs";
import { createServer } from "vite";
import { sharedAlias } from "../shared-alias.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { Sim } from "../../packages/shared/src/sim.ts";

const root = new URL("../..", import.meta.url).pathname;
const set = process.argv[2] ?? "units";
const only = process.argv[3];
const sim = await Sim.load(readFileSync(root + "packages/client/public/sim.wasm"));
writeFileSync(root + "tools/viewer/data.json", sim.dataJson());
const server = await createServer({ root: root + "tools/viewer", configFile: false, resolve: { alias: sharedAlias }, server: { port: Number(process.env.VIEWER_PORT ?? 5199), fs: { allow: [root] } }, logLevel: "error" });
await server.listen();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[erreur]", e.message));
await page.goto(`http://localhost:${process.env.VIEWER_PORT ?? 5199}/?set=${set}${only ? "&only=" + only : ""}${process.env.WEBGPU ? "" : "&webgl"}${process.env.UNIES ? "&unies" : ""}${process.env.ZOOM ? "&zoom=" + process.env.ZOOM : ""}${process.env.LO ? "&lo" : ""}${process.env.ROT ? "&rot=" + process.env.ROT : ""}${process.env.DEP ? "&dep=" + process.env.DEP : ""}${process.env.MODS ? "&mods=" + process.env.MODS : ""}${process.env.VAR ? "&var=" + process.env.VAR : ""}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
await page.waitForTimeout(500);
mkdirSync(root + "tools/viewer/captures", { recursive: true });
const out = root + `tools/viewer/captures/${set}${only ? "-" + only.replace(/,/g, "_").slice(0, 40) : ""}${process.env.UNIES ? "-unies" : ""}${process.env.ZOOM ? "-z" + process.env.ZOOM : ""}${process.env.LO ? "-lo" : ""}${process.env.ROT ? "-r" + process.env.ROT : ""}${process.env.VAR ? "-v" + process.env.VAR : ""}${process.env.SUFFIX ? "-" + process.env.SUFFIX : ""}.png`;
await page.screenshot({ path: out });
console.log("capture :", out);
await browser.close();
await server.close();
