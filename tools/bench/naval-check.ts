// Contrôle de la marine et des transports des IA : une partie sans affichage entre IA sur une carte avec eau,
// mêmes mécanismes que le serveur (décision tous les 10 ticks, ordres exécutés 3 ticks plus tard). Relève les
// usines navales, les navires et transports produits, les embarquements et les débarquements.
//
//   node tools/bench/naval-check.ts [--seed 1] [--size 1024] [--players 4] [--minutes 60] [--water 1]
//                                   [--personality adaptive,tech,turtle,rush] [--level normal] [--check] [--verbose]
//
// La partie s'arrête dès que tout est prouvé (une usine navale, un navire, des troupes débarquées sur la terre
// d'un ennemi) avec --check : sortie 1 si ce n'est pas le cas à la fin. Défaut : graine 1, carte de 20 km, quatre joueurs, chacun
// sur son île.
import { readFileSync } from "node:fs";
import { Sim, pack, parseBotDump, ORDER_DELAY, BUILD_FULL, Layer } from "../../packages/shared/src/index.ts";
import type { GameData, Cmd } from "../../packages/shared/src/index.ts";
import { createBot, type MapInfo } from "../../packages/server/src/bots/index.ts";
import { landComponents, type SkirmishAI } from "../../packages/server/src/bots/ai.ts";

function arg(name: string, def: string): string {
  const i = process.argv.indexOf("--" + name);
  return i < 0 ? def : (process.argv[i + 1] ?? def);
}
const seed = Number(arg("seed", "1"));
const size = Number(arg("size", "1024"));
const np = Number(arg("players", "4"));
const minutes = Number(arg("minutes", "60"));
const water = Number(arg("water", "1"));
const pers = arg("personality", "adaptive,tech,turtle,rush").split(",");
const level = arg("level", "normal");
const check = process.argv.includes("--check");
const verbose = process.argv.includes("--verbose");

const root = new URL("../../", import.meta.url).pathname;
const sim = await Sim.load(readFileSync(root + "packages/client/public/sim.wasm"));
const params = [seed, size, water, np];
for (let i = 0; i < np; i++) params.push(i, 1, 100, 100);
sim.init(params);
const data: GameData = JSON.parse(sim.dataJson());
const info = sim.mapInfo();
const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights: sim.mapHeights() };
let o = 4;
for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
const ns = info[o++];
for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
const bots = Array.from({ length: np }, (_, i) => createBot({ slot: i, personality: pers[i % pers.length], aix: 100, level, sim, data, map }) as SkirmishAI);
const comp = landComponents(map);

interface Track {
  yard: number;
  made: Record<string, number>;
  first: Record<string, number>;
  boarded: number;
  landed: number;
  abroad: number;
  groups: number;
}
const tr: Track[] = bots.map(() => ({ yard: -1, made: {}, first: {}, boarded: 0, landed: 0, abroad: 0, groups: 0 }));
const known = new Set<number>();
const carried = new Set<number>();
const lastLanding = new Array(np).fill(-1e9);
let pending: { tick: number; player: number; cmd: Cmd }[] = [];
let botMs = 0;
let decisions = 0;
let tick = 0;
let done = false;
for (; tick < minutes * 1200 && !done; tick++) {
  if (tick % 10 === 0) {
    const view = parseBotDump(sim.botDump());
    const t0 = performance.now();
    for (let i = 0; i < np; i++) {
      if (!view.players[i].alive) continue;
      for (const cmd of bots[i].think(view)) pending.push({ tick: tick + ORDER_DELAY, player: i, cmd });
    }
    botMs += performance.now() - t0;
    decisions++;
    for (const u of view.units) {
      if (u.owner >= np) continue;
      const d = data.units[u.kind];
      const t = tr[u.owner];
      if (!known.has(u.id) && (d.layer === Layer.Naval || d.layer === Layer.Sub || (d.carry > 0 && d.layer === Layer.Air))) {
        known.add(u.id);
        t.made[d.key] = (t.made[d.key] ?? 0) + 1;
        t.first[d.key] ??= tick;
      }
      if (u.carried && !carried.has(u.id)) {
        carried.add(u.id);
        t.boarded++;
      } else if (!u.carried && carried.delete(u.id)) {
        t.landed++;
        if (tick - lastLanding[u.owner] > 600) t.groups++;
        lastLanding[u.owner] = tick;
        const c = comp[Math.floor(u.y / 256) * map.w + Math.floor(u.x / 256)];
        const enemyLand = map.starts.some(([x, y], e) => e < np && view.players[e].team !== view.players[u.owner].team && comp[y * map.w + x] === c);
        if (enemyLand) t.abroad++;
      }
    }
    if (tick % 100 === 0) for (const b of view.buildings) if (b.owner < np && tr[b.owner].yard < 0 && b.build >= BUILD_FULL && data.buildings[b.kind].key === "naval_factory") tr[b.owner].yard = tick;
    if (verbose && tick % 12000 === 0) console.log(`minute ${tick / 1200}`, tr.map((t, i) => `J${i} ${JSON.stringify(t.made)} débarqués ${t.landed}`).join(" ; "));
    if (check && tr.some((t) => t.yard >= 0) && tr.some((t) => Object.keys(t.made).some((k) => !k.includes("transport"))) && tr.some((t) => t.abroad > 0)) done = true;
  }
  const orders: number[] = [];
  const rest: typeof pending = [];
  for (const p of pending) {
    if (p.tick <= tick) pack(p.player, p.cmd, orders);
    else rest.push(p);
  }
  pending = rest;
  sim.step(orders);
  if (tick % 20 === 0 && sim.winner() !== -1) break;
}
const v = parseBotDump(sim.botDump());
console.log(`graine ${seed}, carte ${size}, ${np} IA (${level}), ${tick} ticks (${(tick / 1200).toFixed(1)} min), vainqueur ${sim.winner()}, IA ${(botMs / decisions).toFixed(2)} ms par décision`);
tr.forEach((t, i) => {
  const b = bots[i];
  const made = Object.entries(t.made).map(([k, n]) => `${k} ${n} (dès t${t.first[k]})`).join(", ");
  console.log(`  J${i} ${pers[i % pers.length].padEnd(8)} ${v.players[i].alive ? "" : "éliminée "}usine navale ${t.yard < 0 ? "—" : "t" + t.yard} ; ${made || "aucun navire ni transport"} ; attaques navales ${b.navy.stats.attacks}, replis ${b.navy.stats.retreats} ; embarqués ${t.boarded}, débarqués ${t.landed} en ${t.groups} fois, dont ${t.abroad} sur la terre d'un ennemi ; kills ${v.players[i].kills}`);
});
if (check && !done) {
  console.error("marine ou débarquement non constatés");
  process.exit(1);
}
