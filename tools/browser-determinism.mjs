// Déterminisme entre Node.js et Chrome : le même scénario (graine + ordres) tourne dans Node.js
// et dans Chrome (Playwright). Les hash doivent être identiques à chaque tick.
import { readFileSync } from "node:fs";
import { Sim } from "../packages/shared/src/sim.ts";
import { randomOrders } from "./scenario.mjs";
import { launchBrowser } from "./browser.mjs";

const TICKS = Number(process.argv[2] ?? 3000);
const bytes = readFileSync(new URL("../packages/client/public/sim.wasm", import.meta.url));
const params = [4321, 512, 1, 4, 0, 0, 100, 100, 1, 0, 100, 100, 2, 0, 100, 100, 3, 0, 100, 100];
const node = await Sim.load(bytes);
node.init(params);
const gen = randomOrders(99, node);
const orders = [];
const hashes = [];
for (let t = 0; t < TICKS; t++) {
  const o = gen(t);
  orders.push(o);
  hashes.push(node.step(o));
}
const browser = await launchBrowser();
const page = await browser.newPage();
const chrome = await page.evaluate(
  async ({ b64, params, orders }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { instance } = await WebAssembly.instantiate(bin, {});
    const ex = instance.exports;
    const write = (arr) => {
      const p = ex.in_buf(arr.length * 4);
      const v = new Int32Array(ex.memory.buffer, p, arr.length);
      for (let i = 0; i < arr.length; i++) v[i] = arr[i] | 0;
      return arr.length;
    };
    ex.init(write(params));
    const out = [];
    for (const o of orders) out.push(ex.step(write(o)) >>> 0);
    return { hashes: out, ua: navigator.userAgent };
  },
  { b64: bytes.toString("base64"), params, orders },
);
await browser.close();
for (let t = 0; t < TICKS; t++) {
  if (chrome.hashes[t] !== hashes[t]) {
    console.error(`ÉCART Node/Chrome au tick ${t} : ${hashes[t]} != ${chrome.hashes[t]}`);
    process.exit(1);
  }
}
console.log(`Node.js et Chrome identiques sur ${TICKS} ticks (${chrome.ua.match(/Chrome\/[\d.]+/)?.[0]}).`);
