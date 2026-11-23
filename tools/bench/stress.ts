// Mesure en WebAssembly (Node.js) de la partie de référence synthétique : 8 joueurs, 8 000 unités,
// ~40 000 bâtiments et tapis. Objectif : moins de 25 ms par tick.
//
//   node tools/bench/stress.ts [ticks] [--wasm chemin]
//
// --wasm : autre simulation compilée, pour comparer deux versions (skill comparer-perf). N'écrit rien.
import { readFileSync } from "node:fs";
import { Sim } from "../../packages/shared/src/sim.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--wasm");
const wasm = at >= 0 ? args.splice(at, 2)[1] : new URL("../../packages/client/public/sim.wasm", import.meta.url);
const sim = await Sim.load(readFileSync(wasm));
sim.init([1, 512, 0, 1, 0, 0, 100, 100]);
sim.benchReference();
const N = Number(args[0] ?? 1400);
const times: number[] = [];
for (let t = 0; t < N; t++) {
  const t0 = performance.now();
  sim.step([]);
  times.push(performance.now() - t0);
}
const sorted = [...times].sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`WebAssembly : moyenne ${mean.toFixed(2)} ms/tick, p99 ${sorted[Math.floor(N * 0.99)].toFixed(2)} ms, max ${sorted[N - 1].toFixed(2)} ms (${N} ticks)`);
