// Capture du mode démo (8 armées, 8 000 unités) : vue rapprochée et vue stratégique.
import { launchBrowser } from "./browser.mjs";
const browser = await launchBrowser();
const p = await browser.newPage({ viewport: { width: 1000, height: 650 } });
p.on("pageerror", (e) => console.log("erreur", e.message));
await p.goto("http://127.0.0.1:3061/?k=testkey&webgl&demo");
await p.waitForFunction(() => window.__game?.client.frame && window.__game.client.scene, null, { timeout: 90000 });
const views = [
  ["proche", 40, 0.9, 120],
  ["moyen", 110, 0.95, 600],
  ["strategique", 900, 1.3, 1200],
];
for (const [name, dist, tilt, ticks] of views) {
  await p.evaluate(({ dist, tilt }) => {
    const { client } = window.__game;
    const f = client.frame;
    // viser le premier joueur
    const o = f.unitOff;
    client.scene.target.x = f.buf[o + 2] / 256 + 20;
    client.scene.target.z = f.buf[o + 3] / 256 - 10;
    client.scene.distance = dist;
    client.scene.tilt = tilt;
  }, { dist, tilt });
  await p.waitForFunction((t) => window.__game.client.frame.tick > t, ticks, { timeout: 120000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `tools/viewer/captures/demo-${name}.png` });
  console.log("capture", name, await p.evaluate(() => window.__game.client.frame.tick));
}
await browser.close();
