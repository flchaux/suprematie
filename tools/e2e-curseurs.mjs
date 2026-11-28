// Curseurs contextuels (packages/client/src/ui/cursors.ts) : le curseur posé sur la scène est bien celui de
// ui/cursors.ts (flèche avec symbole : image de 64 x 64 ; viseurs : 32 x 32), puis quelques curseurs sont dessinés en taille réelle sur la scène (le curseur système
// n'apparaît pas dans les captures), avec leur point actif en magenta. Avec un second module (ancienne version),
// ses curseurs sont posés à côté pour comparer.
// Usage : node tools/e2e-curseurs.mjs http://127.0.0.1:3061 [dossier des captures] [ancien cursors.ts]
import { launchBrowser } from "./browser.mjs";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cursorCss } from "../packages/client/src/ui/cursors.ts";

const base = (process.argv[2] ?? "http://127.0.0.1:3061").replace(/\/$/, "");
const outDir = process.argv[3] ?? new URL("./viewer/captures", import.meta.url).pathname;
const old = process.argv[4] ? (await import(pathToFileURL(process.argv[4]).href)).cursorCss : null;
mkdirSync(outDir, { recursive: true });
const browser = await launchBrowser([]);
let failed = 0;
const check = (ok, what, extra = "") => {
  console.log(`${ok ? "ok  " : "ÉCHEC"} ${what}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/?k=testkey&demo=nomades&webgl`);
await page.waitForFunction(() => window.__game?.client.frame?.nBuildings > 0, null, { timeout: 150000 });
await page.mouse.move(640, 400);
await page.evaluate(() => window.__game.client.stopReplayAt(60));
await page.waitForFunction(() => window.__game.client.frame.tick >= 60, null, { timeout: 240000 });

// curseur réellement posé sur le canevas
const live = await page.evaluate(() => {
  const c = window.__game.client;
  c.updateCursor(true);
  return { kind: c.cursorKind, css: c.canvasEl.style.cursor };
});
check(!!live.kind, "curseur contextuel calculé", live.kind);
const norm = (s) => s.replace(/\s+/g, " ");
check(norm(live.css) === norm(cursorCss(live.kind)) && /width%3D%2264%22/.test(live.css), "image 64 x 64 sur le canevas");

/** url de l'image et point actif d'une valeur CSS `cursor` */
const parse = (css) => {
  const m = /url\("(.*?)"\) (\d+) (\d+)/.exec(css);
  return { src: m[1], hx: +m[2], hy: +m[3] };
};
const kinds = ["move", "attack", "repair", "rally"];
const rows = [{ label: "après", fn: cursorCss }];
if (old) rows.push({ label: "avant", fn: old });
const items = rows.flatMap((r, j) => kinds.map((k, i) => ({ ...parse(r.fn(k)), x: 380 + i * 160, y: 300 + j * 140, label: `${r.label} : ${k}` })));
await page.evaluate((items) => {
  for (const it of items) {
    const img = document.createElement("img");
    img.src = it.src;
    // l'image se pose comme le ferait le navigateur : son point actif sur le point visé
    img.style.cssText = `position:fixed;left:${it.x - it.hx}px;top:${it.y - it.hy}px;z-index:99999;pointer-events:none`;
    const dot = document.createElement("div");
    dot.style.cssText = `position:fixed;left:${it.x - 2}px;top:${it.y - 2}px;width:4px;height:4px;background:#f0f;z-index:100000`;
    const t = document.createElement("div");
    t.textContent = it.label;
    t.style.cssText = `position:fixed;left:${it.x - 20}px;top:${it.y + 70}px;color:#fff;font:12px sans-serif;text-shadow:0 0 3px #000;z-index:100000`;
    document.body.append(img, dot, t);
  }
}, items);
const sizes = await page.evaluate(() => [...document.querySelectorAll("img[style*='z-index: 99999']")].map((i) => i.naturalWidth));
check(sizes.slice(0, kinds.length).join(" ") === "64 32 64 64", "flèches en 64 px, viseur en 32 px", sizes.join(" "));
await page.waitForTimeout(500);
const path = `${outDir}/curseurs.png`;
await page.screenshot({ path, clip: { x: 300, y: 220, width: 680, height: old ? 320 : 180 }, timeout: 240000 });
console.log(`capture : ${path}`);

check(errors.length === 0, "aucune erreur dans la page", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
