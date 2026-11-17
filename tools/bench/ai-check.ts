// Contrôle des IA : parties sans affichage entre IA, mêmes mécanismes que le serveur (décision tous les
// 10 ticks, ordres exécutés 3 ticks plus tard). Pour chaque IA, relève des jalons et vérifie qu'ils
// arrivent à temps : l'économie ne doit pas rester bloquée et l'armée doit attaquer.
//
//   node tools/bench/ai-check.ts [--games 2] [--minutes 25] [--size 512] [--players 4] [--seed S]
//                                [--level normal] [--verbose]
//
// Jalons (minutes de jeu, niveau normal) :
//   ingénieur       premier drone ingénieur
//   usine           première usine terminée
//   armée           au moins 5 unités de combat en même temps
//   attaque         premier peloton lancé sur un adversaire (attaque ou raid)
//   pertes          premiers dégâts infligés : au moins une unité ou un bâtiment ennemi détruit
// et, à chaque tranche de 3 minutes après la 3e, la production totale de l'IA doit augmenter
// (économie bloquée sinon). Sortie 1 si un jalon manque. Une IA partie sur une île (aucun adversaire
// joignable à pied) n'est pas tenue aux jalons d'attaque et de pertes, et c'est affiché.
import { readFileSync } from "node:fs";
import { Sim, pack, parseBotDump, ORDER_DELAY, BUILD_FULL } from "../../packages/shared/src/index.ts";
import type { GameData, Cmd } from "../../packages/shared/src/index.ts";
import { createBot, PERSONALITIES, type MapInfo } from "../../packages/server/src/bots/index.ts";
import { landComponents, type SkirmishAI } from "../../packages/server/src/bots/ai.ts";

const BOT_EVERY = 10;
const MIN = 1200;

function arg(name: string, def: string): string {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? "1" : v;
}
const games = Number(arg("games", "2"));
const minutes = Number(arg("minutes", "25"));
const size = Number(arg("size", "512")) >= 1024 ? 1024 : 512;
const nPlayers = Math.max(2, Math.min(8, Number(arg("players", "4"))));
const seed0 = Number(arg("seed", "7001"));
const level = arg("level", "normal");
const verbose = process.argv.includes("--verbose");
// diagnostic : --dump 24000:2 affiche les unités du joueur 2 au tick 24000 (première partie)
const dump = arg("dump", "").split(":").map(Number);

/** Échéances (minutes) par jalon et par personnalité. */
// Calibrées sur des parties de contrôle : une IA saine les tient avec de la marge ; une IA bloquée
// (usine jamais placée, commandant inactif, armée coincée) les dépasse de plusieurs minutes.
const DEADLINES: Record<string, Record<string, number>> = {
  ingénieur: { rush: 11, adaptive: 11, turtle: 11, tech: 11 },
  usine: { rush: 11, adaptive: 11, turtle: 11, tech: 11 },
  armée: { rush: 13, adaptive: 14, turtle: 14, tech: 15 },
  attaque: { rush: 13, adaptive: 18, turtle: 21, tech: 19 },
  pertes: { rush: 22, adaptive: 21, turtle: 24, tech: 24 },
};
const MILESTONES = Object.keys(DEADLINES);

const root = new URL("../../", import.meta.url).pathname;
const wasm = readFileSync(root + "packages/client/public/sim.wasm");

interface Track {
  personality: string;
  at: Record<string, number>;
  produced: number[];
  stalls: number[];
  /** minute de l'élimination */
  dead?: number;
  /** départ sur une île : aucun adversaire joignable à pied (attaque et pertes non exigées) */
  island?: boolean;
}

async function play(seed: number): Promise<Track[]> {
  const params = [seed, size, 1, nPlayers];
  for (let i = 0; i < nPlayers; i++) params.push(i, 1, 100, 100);
  const sim = await Sim.load(wasm);
  sim.init(params);
  const data: GameData = JSON.parse(sim.dataJson());
  const info = sim.mapInfo();
  const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights: sim.mapHeights() };
  let o = 4;
  for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
  const ns = info[o++];
  for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
  // personnalités décalées d'une partie à l'autre (chaque IA joue d'autres positions)
  const bots = Array.from({ length: nPlayers }, (_, i) => {
    const personality = PERSONALITIES[(i + seed) % PERSONALITIES.length];
    return { personality, bot: createBot({ slot: i, personality, aix: 100, level, sim, data, map }) as SkirmishAI };
  });
  const tracks: Track[] = bots.map((b) => ({ personality: b.personality, at: {}, produced: [], stalls: [] }));
  const comp = landComponents(map);
  const startComp = map.starts.map(([x, y]) => comp[y * map.w + x]);
  startComp.forEach((c, i) => {
    if (!startComp.some((o, j) => j !== i && o === c)) tracks[i].island = true;
  });
  const engKinds = new Set(data.units.map((u, i) => (u.buildPower > 0 && u.key !== "commander" ? i : -1)).filter((i) => i >= 0));
  const combat = new Set(data.units.map((u, i) => (u.weapons.length > 0 && u.buildPower === 0 && u.key !== "commander" ? i : -1)).filter((i) => i >= 0));
  const factory = new Set(data.buildings.map((b, i) => (b.factory > 0 ? i : -1)).filter((i) => i >= 0));
  const startLosses = new Array(nPlayers).fill(0);
  const pending: { tick: number; player: number; cmd: Cmd }[] = [];
  const mark = (p: number, key: string, tick: number) => {
    if (tracks[p].at[key] === undefined) tracks[p].at[key] = tick / MIN;
  };
  for (let tick = 0; tick < minutes * MIN; tick++) {
    if (tick % BOT_EVERY === 0) {
      const view = parseBotDump(sim.botDump());
      for (let i = 0; i < nPlayers; i++) {
        if (!view.players[i]?.alive) continue;
        for (const cmd of bots[i].bot.think(view)) pending.push({ tick: tick + ORDER_DELAY, player: i, cmd });
      }
      if (tick % 100 === 0) {
        const eng = new Array(nPlayers).fill(0);
        const army = new Array(nPlayers).fill(0);
        for (const u of view.units) {
          if (engKinds.has(u.kind)) eng[u.owner]++;
          if (combat.has(u.kind)) army[u.owner]++;
        }
        for (const b of view.buildings) if (factory.has(b.kind) && b.build >= BUILD_FULL) mark(b.owner, "usine", tick);
        for (let i = 0; i < nPlayers; i++) {
          if (eng[i] > 0) mark(i, "ingénieur", tick);
          if (army[i] >= 5) mark(i, "armée", tick);
          if (bots[i].bot.army.attacks > 0 || bots[i].bot.army.platoons.some((p) => p.mission === "raid")) mark(i, "attaque", tick);
          // pertes infligées : destructions comptées par la simulation pour ce joueur
          if (view.players[i].kills > startLosses[i]) mark(i, "pertes", tick);
        }
      }
      if (dump.length === 2 && tick === dump[0]) {
        const pl = dump[1];
        const comp = landComponents(map);
        for (const u of view.units) {
          if (u.owner !== pl || !combat.has(u.kind)) continue;
          const tx = Math.floor(u.x / 256), ty = Math.floor(u.y / 256);
          console.log(`  unité ${u.id} ${data.units[u.kind].key} (${tx},${ty}) terre ${comp[ty * map.w + tx]} ordre ${u.order} n ${u.nOrders} pv ${u.hp}`);
        }
      }
      if (tick % (3 * MIN) === 0) {
        // une IA éliminée ne produit plus : pas de relevé (pas de faux blocage)
        for (let i = 0; i < nPlayers; i++) {
          if (view.players[i].alive) tracks[i].produced.push(Array.from(view.players[i].produced).reduce((a, b) => a + b, 0));
          else if (tracks[i].dead === undefined) tracks[i].dead = tick / MIN;
        }
      }
    }
    const orders: number[] = [];
    let keep = 0;
    for (const p of pending) {
      if (p.tick <= tick) pack(p.player, p.cmd, orders);
      else pending[keep++] = p;
    }
    pending.length = keep;
    sim.step(orders);
    if (tick % 20 === 0 && sim.winner() !== -1) break;
  }
  for (const t of tracks) {
    // tranches de 3 minutes sans production supplémentaire (à partir de la 3e minute)
    for (let k = 2; k < t.produced.length; k++) if (t.produced[k] <= t.produced[k - 1]) t.stalls.push(k * 3);
  }
  return tracks;
}

let failures = 0;
const fmt = (v: number | undefined) => (v === undefined ? "  —  " : v.toFixed(1).padStart(5));
console.log(`contrôle des IA : ${games} partie(s), carte ${size}, ${nPlayers} IA, ${minutes} min, niveau ${level}`);
for (let g = 0; g < games; g++) {
  const seed = seed0 + g * 101;
  const t0 = performance.now();
  const tracks = await play(seed);
  console.log(`\npartie ${g + 1} (graine ${seed}, ${((performance.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(`  IA            ${MILESTONES.map((m) => m.padStart(10)).join("")}   blocages`);
  tracks.forEach((t, i) => {
    const cells = MILESTONES.map((m) => {
      const v = t.at[m];
      const dl = DEADLINES[m][t.personality] ?? 20;
      const exempt = t.island === true && (m === "attaque" || m === "pertes");
      const late = !exempt && dl <= minutes && (v === undefined || v > dl) && !(t.dead !== undefined && t.dead <= dl);
      if (late) failures++;
      return (late ? "✗" : " ") + fmt(v) + "/" + String(dl).padStart(2);
    });
    if (t.stalls.length) failures++;
    console.log(`  J${i} ${t.personality.padEnd(9)} ${cells.join("")}   ${t.stalls.length ? "✗ min " + t.stalls.join(",") : "aucun"}${t.dead !== undefined ? `   (éliminée vers ${t.dead.toFixed(0)} min)` : ""}${t.island ? "   (île : pas d'adversaire joignable à pied)" : ""}`);
    if (verbose) console.log(`      production cumulée par tranche de 3 min : ${t.produced.join(" ")}`);
  });
}
console.log(failures ? `\n${failures} jalon(s) manqué(s)` : "\ntous les jalons sont atteints");
process.exit(failures ? 1 : 0);
