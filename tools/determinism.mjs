// Test de déterminisme : deux simulations reçoivent la même graine et la même suite d'ordres
// aléatoires pendant N ticks ; leurs hash doivent être identiques à chaque tick.
// Vérifie aussi snapshot()/restore() : la suite après restauration donne les mêmes hash.
import { readFileSync } from "node:fs";
import { Sim } from "../packages/shared/src/sim.ts";
import { randomOrders } from "./scenario.mjs";

const TICKS = Number(process.argv[2] ?? 10000);
const bytes = readFileSync(new URL("../packages/client/public/sim.wasm", import.meta.url));
// quatre configurations : sans faune (comme les parties d'avant), avec une faune agressive,
// sans brouillard de guerre (paramètre après la faune : 0)
const base = [12345, 512, 1, 4, 0, 0, 100, 100, 1, 0, 100, 100, 2, 0, 100, 100, 3, 0, 100, 100];
// puis des races (une par joueur, après le brouillard) : Souche, Transhumants, Industriels, Souche
for (const [label, params] of [["sans faune", base], ["faune agressive", [...base, 3]], ["sans brouillard", [...base, 2, 0]], ["races", [...base, 2, 1, 1, 2, 0, 1]]]) {
  await check(label, params);
}

async function check(label, params) {
  const a = await Sim.load(bytes);
  const b = await Sim.load(bytes);
  a.init(params);
  b.init(params);
  const gen = randomOrders(777, a);
  const t0 = performance.now();
  let snapAt = Math.floor(TICKS / 2);
  let snap = null;
  const hashesAfter = [];
  const ordersAfter = [];
  for (let t = 0; t < TICKS; t++) {
    const orders = gen(t);
    const ha = a.step(orders);
    const hb = b.step(orders);
    if (ha !== hb) {
      console.error(`DÉSYNCHRONISATION (${label}) au tick ${t} : ${ha} != ${hb}`);
      process.exit(1);
    }
    if (t === snapAt) snap = a.snapshot();
    if (t > snapAt) {
      hashesAfter.push(ha);
      ordersAfter.push(orders);
    }
  }
  const dt = performance.now() - t0;
  // snapshot / restore
  const c = await Sim.load(bytes);
  c.restore(snap);
  for (let i = 0; i < ordersAfter.length; i++) {
    const h = c.step(ordersAfter[i]);
    if (h !== hashesAfter[i]) {
      console.error(`ÉCHEC snapshot/restore (${label}) : écart au tick ${snapAt + 1 + i}`);
      process.exit(1);
    }
  }
  console.log(`Déterminisme OK (${label}) : ${TICKS} ticks identiques (${(dt / TICKS / 2).toFixed(3)} ms/tick), snapshot ${snap.length} octets, restore OK.`);
}
