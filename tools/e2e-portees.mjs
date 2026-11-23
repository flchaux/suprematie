// Cercles de portée, ping et navette, dans la démo « formation » (ordres locaux).
// Contrôles : un contour par famille pour la sélection, coupé par le réglage ; ping à la touche, à Alt+clic et
// sur la minicarte ; navette en deux clics (un type d'unité est déclaré transport dans la page, la démo n'en a pas).
// Usage : node tools/e2e-portees.mjs http://127.0.0.1:3061 [dossier des captures]
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const url = `${base}/?k=testkey&demo=formation&webgl`;
await page.goto(url);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem("supreme.gfx", JSON.stringify({ ground: false, decor: false, shadows: false, bloom: false })); });
await page.goto(url);
await page.waitForFunction(() => window.__game?.client.frame?.nUnits > 0, null, { timeout: 150000 });
const c = await page.evaluate(() => {
  const { client } = window.__game;
  const f = client.frame;
  const ids = [];
  let x = 0, z = 0;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += 9) {
    if (((f.buf[o + 1] >> 8) & 0xff) !== 0 || client.data.units[f.buf[o + 1] & 0xff].key === "commander") continue;
    ids.push(f.buf[o] >>> 0);
    x += f.buf[o + 2] / 256;
    z += f.buf[o + 3] / 256;
  }
  client.scene.target.set(x / ids.length, 0, z / ids.length);
  client.scene.distance = 110;
  client.scene.updateCamera();
  client.selectIds(ids);
  return { x: x / ids.length, z: z / ids.length, n: ids.length };
});
const rings = () => page.evaluate(() => ({ visible: window.__game.client.scene.ranges.mesh.visible, quads: window.__game.client.scene.ranges.mesh.geometry.drawRange.count / 6, c: Object.fromEntries(Object.entries(window.__game.client.scene.rangeCircles ?? {}).map(([k, v]) => [k, v.length])) }));
await page.waitForFunction(() => window.__game.client.scene.ranges.mesh.visible, null, { timeout: 60000 });
const r = await rings();
check(r.quads > 100 && r.quads < 96 * c.n, "contours fondus", JSON.stringify(r));
await page.screenshot({ path: `${outDir}/portees.png`, timeout: 240000 });

// ping : touche ², Alt+clic, minicarte
const pings = () => page.evaluate(() => window.__game.client.scene.pings.list.map((p) => [Math.round(p.x), Math.round(p.z)]));
await page.evaluate(() => { const s = window.__game.client.scene; s.pingLog = []; const add = s.pings.add.bind(s.pings); s.pings.add = (x, z, k) => { s.pingLog.push([x, z]); add(x, z, k); }; });
await page.mouse.move(600, 350);
await page.keyboard.press("Backquote");
await page.keyboard.down("Alt");
await page.mouse.click(700, 300);
await page.keyboard.up("Alt");
await page.evaluate(() => window.__game.client.setMode("ping"));
const mini = await page.locator(".minimap canvas").boundingBox();
const cam = await page.evaluate(() => [window.__game.client.scene.target.x, window.__game.client.scene.target.z]);
await page.mouse.click(mini.x + mini.width * 0.25, mini.y + mini.height * 0.75);
const log = await page.evaluate(() => ({ log: window.__game.client.scene.pingLog, mode: window.__game.ui.mode, sel: window.__game.client.selected.size, cam: [window.__game.client.scene.target.x, window.__game.client.scene.target.z], w: window.__game.client.map.w }));
check(log.log.length === 3 && log.mode === "", "trois pings, mode refermé", JSON.stringify(log.log));
check(Math.abs(log.log[2]?.[0] - log.w * 0.25) < 6 && Math.abs(log.log[2]?.[1] - log.w * 0.75) < 6, "ping de la minicarte au bon endroit");
check(log.sel === c.n && log.cam[0] === cam[0], "sélection et caméra inchangées");
await page.keyboard.down("Alt");
await page.mouse.click(700, 300);
await page.keyboard.up("Alt");
await page.waitForTimeout(1500);
console.log("pings affichés", JSON.stringify(await pings()));
await page.screenshot({ path: `${outDir}/ping.png`, timeout: 240000 });

// navette : deux clics
const cmds = await page.evaluate(async ([x, z]) => {
  const { client, ui } = window.__game;
  const k = client.data.units[ui.selUnits[0].kind];
  k.carry = 10;
  k.layer = 4;
  const out = [];
  const post = client.worker.postMessage.bind(client.worker);
  client.worker.postMessage = (m) => { if (m?.type === "demoCmd") out.push(m.cmd); else post(m); };
  client.runAction("ferry");
  const m1 = ui.mode;
  client.ferryClick(x, z, false);
  const m2 = ui.mode;
  client.ferryClick(x + 10, z, false);
  const m3 = ui.mode;
  client.ferryClick(x + 50, z, false);
  return { m1, m2, m3, m4: ui.mode, out, n: ui.selUnits[0].count };
}, [c.x, c.z]);
check(cmds.m1 === "ferryFrom" && cmds.m2 === "ferryTo" && cmds.m3 === "ferryTo" && cmds.m4 === "", "modes de la navette (refus à 10 cases)");
check(cmds.out.length === 1 && cmds.out[0][0] === 58 && cmds.out[0][6] === cmds.n, "ordre envoyé aux seuls transports", JSON.stringify(cmds.out[0]?.slice(0, 7)));
await page.evaluate(() => window.__game.client.setGfx({ ranges: false }));
await page.waitForFunction(() => !window.__game.client.scene.ranges.mesh.visible, null, { timeout: 60000 }).catch(() => {});
check(!(await rings()).visible, "réglage coupé : plus de cercles");
check(errors.length === 0, "aucune erreur", errors.slice(0, 3).join(" | "));
await browser.close();
process.exit(failed ? 1 : 0);
