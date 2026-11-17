// Banc de performance : une partie sans affichage entre bots, avec les mêmes mécanismes que le
// serveur (décision des bots tous les 10 ticks, ordres exécutés 3 ticks plus tard, paquets `pack`).
// Mesure le temps de simulation par tick (moyenne, 99e centile) et le temps des bots séparément.
//
//   node tools/bench/bench.ts [--minutes N] [--size 512|1024] [--players 8] [--seed S]
//                             [--water 0|1] [--personality a,b,...] [--aix 100] [--level normal]
//                             [--check] [--until-victory] [--quiet] [--wasm chemin]
//
// --check : une seconde simulation reçoit les mêmes ordres ; les hash doivent être égaux à chaque tick
//           (sortie 1 en cas de désynchronisation ou de blocage de la partie).
// --until-victory : joue jusqu'à la victoire d'une équipe (120 minutes au plus) ; sortie 0 seulement si victoire.
// Résultat écrit dans tools/bench/last.json ; une dégradation de plus de 10 % du temps moyen de
// simulation par rapport à la mesure précédente (même configuration) fait échouer le banc.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Sim, pack, parseBotDump, ORDER_DELAY, hasTech } from "../../packages/shared/src/index.ts";
import type { GameData, Cmd } from "../../packages/shared/src/index.ts";
import { createBot, PERSONALITIES, type Bot, type MapInfo } from "../../packages/server/src/bots/index.ts";

const BOT_EVERY = 10;
const TICKS_PER_MIN = 1200;

function arg(name: string, def: string): string {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? "1" : v;
}
const flag = (name: string) => process.argv.includes("--" + name);

const untilVictory = flag("until-victory");
const check = flag("check");
const quiet = flag("quiet");
const minutes = Number(arg("minutes", untilVictory ? "120" : "10"));
const size = Number(arg("size", "1024")) >= 1024 ? 1024 : 512;
const nPlayers = Math.max(2, Math.min(8, Number(arg("players", "8"))));
const seed = Number(arg("seed", "20261116"));
const water = arg("water", "1") !== "0";
const aix = Number(arg("aix", "100"));
const level = arg("level", "normal");
const personas = arg("personality", PERSONALITIES.join(",")).split(",");
const maxTicks = Math.round(minutes * TICKS_PER_MIN);

const root = new URL("../../", import.meta.url).pathname;
// --wasm : autre simulation compilée (comparaison de versions avec les mêmes IA)
const wasm = readFileSync(arg("wasm", root + "packages/client/public/sim.wasm"));

const params = [seed, size, water ? 1 : 0, nPlayers];
for (let i = 0; i < nPlayers; i++) params.push(i, 1, aix, aix);

const sim = await Sim.load(wasm);
sim.init(params);
const sim2 = check ? await Sim.load(wasm) : null;
sim2?.init(params);
const data: GameData = JSON.parse(sim.dataJson());
const info = sim.mapInfo();
const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights: sim.mapHeights() };
let o = 4;
for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
const ns = info[o++];
for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });

interface BotRun {
  slot: number;
  personality: string;
  bot: Bot;
  ms: number;
  calls: number;
  max: number;
}
const bots: BotRun[] = [];
for (let i = 0; i < nPlayers; i++) {
  const personality = personas[i % personas.length];
  bots.push({ slot: i, personality, bot: createBot({ slot: i, personality, aix, level, sim, data, map }), ms: 0, calls: 0, max: 0 });
}

const log = (...a: unknown[]) => {
  if (!quiet) console.log(...a);
};
log(`banc : carte ${size}, ${nPlayers} joueurs, graine ${seed}, eau ${water ? "oui" : "non"}, ${untilVictory ? "jusqu'à la victoire" : minutes + " min"}${check ? ", contrôle des hash" : ""}`);

const pending: { tick: number; player: number; cmd: Cmd }[] = [];
const simTimes = new Float64Array(maxTicks);
let botTotal = 0;
let botThinks = 0;
let botMaxTick = 0;
let tick = 0;
let winner = -1;
let desync = -1;
let lastSig = "";
let stallMin = 0;
let stalled = false;
const t0 = performance.now();

const unitKey = data.units.map((u) => u.key);
function progress(min: number): string {
  const v = parseBotDump(sim.botDump());
  const lines: string[] = [];
  const nb = new Array(nPlayers).fill(0);
  const nu = new Array(nPlayers).fill(0);
  const army = new Array(nPlayers).fill(0);
  for (const b of v.buildings) nb[b.owner]++;
  for (const u of v.units) {
    nu[u.owner]++;
    if (data.units[u.kind].weapons.length > 0 && unitKey[u.kind] !== "commander") army[u.owner]++;
  }
  for (let i = 0; i < nPlayers; i++) {
    const p = v.players[i];
    let techs = 0;
    for (let t = 1; t < data.techs.length; t++) if (hasTech(p, t)) techs++;
    const st = p.stock;
    lines.push(
      `  J${i} ${bots[i].personality.padEnd(8)} ${p.alive ? "   " : "†  "}unités ${String(nu[i]).padStart(4)} (armée ${String(army[i]).padStart(4)}) bâtiments ${String(nb[i]).padStart(4)} recherches ${String(techs).padStart(2)}${p.research ? "+" + data.techs[p.research].key : ""} fer ${st[6]} cuivre ${st[7]} acier ${st[8]} kills ${p.kills} pertes ${p.losses}`,
    );
  }
  const sig = nu.join(",") + "|" + nb.join(",") + "|" + v.players.map((p) => p.produced.reduce((a, b) => a + b, 0)).join(",");
  if (sig === lastSig) stallMin++;
  else stallMin = 0;
  lastSig = sig;
  return `-- minute ${min} (tick ${tick}) --\n` + lines.join("\n");
}

for (tick = 0; tick < maxTicks; tick++) {
  if (tick % BOT_EVERY === 0) {
    const tb = performance.now();
    const view = parseBotDump(sim.botDump());
    for (const b of bots) {
      if (!view.players[b.slot]?.alive) continue;
      const b0 = performance.now();
      let cmds: Cmd[] = [];
      try {
        cmds = b.bot.think(view);
      } catch (e) {
        console.error("erreur bot", b.slot, e);
      }
      const dt = performance.now() - b0;
      b.ms += dt;
      b.calls++;
      b.max = Math.max(b.max, dt);
      for (const cmd of cmds) pending.push({ tick: tick + ORDER_DELAY, player: b.slot, cmd });
    }
    const dtb = performance.now() - tb;
    botTotal += dtb;
    botThinks++;
    botMaxTick = Math.max(botMaxTick, dtb);
  }
  // ordres dus, dans l'ordre d'émission (comme le relais du serveur)
  const orders: number[] = [];
  let keep = 0;
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    if (p.tick <= tick) pack(p.player, p.cmd, orders);
    else pending[keep++] = p;
  }
  pending.length = keep;
  const s0 = performance.now();
  const h = sim.step(orders);
  simTimes[tick] = performance.now() - s0;
  if (sim2) {
    const h2 = sim2.step(orders);
    if (h2 !== h) {
      desync = tick;
      console.error(`DÉSYNCHRONISATION au tick ${tick} : ${h} != ${h2}`);
      break;
    }
  }
  if ((tick + 1) % TICKS_PER_MIN === 0) {
    const min = (tick + 1) / TICKS_PER_MIN;
    const p = progress(min);
    if (!quiet || min % 10 === 0) console.log(p);
    if (stallMin >= 3 && !stalled) {
      stalled = true;
      console.error(`BLOCAGE : rien n'a changé depuis ${stallMin} minutes (tick ${tick})`);
      if (check) break;
    }
  }
  if (tick % 20 === 0) {
    winner = sim.winner();
    if (winner !== -1) {
      tick++;
      break;
    }
  }
}
const wall = (performance.now() - t0) / 1000;
const n = Math.max(1, Math.min(tick, maxTicks));
const times = Array.from(simTimes.subarray(0, n)).sort((a, b) => a - b);
const mean = times.reduce((a, b) => a + b, 0) / n;
const p99 = times[Math.min(n - 1, Math.floor(n * 0.99))];
const maxT = times[n - 1];
const botPerThink = botTotal / Math.max(1, botThinks);
const botPerBot = bots.map((b) => b.ms / Math.max(1, b.calls));

console.log(progress(Math.round((n / TICKS_PER_MIN) * 10) / 10));
console.log(`\n== Résultat ==`);
console.log(`ticks simulés : ${n} (${(n / TICKS_PER_MIN).toFixed(1)} min de jeu) en ${wall.toFixed(1)} s`);
console.log(`simulation : moyenne ${mean.toFixed(3)} ms/tick, 99e centile ${p99.toFixed(3)} ms, max ${maxT.toFixed(2)} ms`);
console.log(`bots : ${botPerThink.toFixed(3)} ms par décision (tous bots), ${(botTotal / n).toFixed(3)} ms/tick en moyenne, max ${botMaxTick.toFixed(1)} ms`);
console.log(`bots (par bot et par décision) : ${bots.map((b, i) => `J${i} ${botPerBot[i].toFixed(2)} (max ${b.max.toFixed(1)})`).join(", ")}`);
if (winner >= 0) console.log(`VICTOIRE de l'équipe ${winner} au tick ${tick} (${(tick / TICKS_PER_MIN).toFixed(1)} min)`);
else if (winner === -2) console.log(`fin sans vainqueur au tick ${tick}`);

// ---------- Comparaison avec la mesure précédente ----------
const key = `size=${size} players=${nPlayers} seed=${seed} water=${water ? 1 : 0} minutes=${untilVictory ? "victory" : minutes} aix=${aix} pers=${personas.join("+")}`;
const file = root + "tools/bench/last.json";
let db: Record<string, { simMean: number; simP99: number; botPerThink: number; ticks: number; date: string; winner: number }> = {};
if (existsSync(file)) {
  try {
    db = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    db = {};
  }
}
const prev = db[key];
let regress = false;
if (prev && prev.simMean > 0) {
  const ratio = mean / prev.simMean;
  console.log(`précédent (${prev.date}) : ${prev.simMean.toFixed(3)} ms/tick -> ${ratio >= 1 ? "+" : ""}${((ratio - 1) * 100).toFixed(1)} %`);
  if (ratio > 1.1) {
    regress = true;
    console.error(`DÉGRADATION de plus de 10 % du temps de simulation (${prev.simMean.toFixed(3)} -> ${mean.toFixed(3)} ms/tick)`);
  }
} else console.log("pas de mesure précédente pour cette configuration");
db[key] = { simMean: mean, simP99: p99, botPerThink, ticks: n, date: new Date().toISOString(), winner };
writeFileSync(file, JSON.stringify(db, null, 2) + "\n");

let code = 0;
if (desync >= 0) code = 1;
if (check && stalled) code = 1;
if (untilVictory && winner < 0) {
  console.error("pas de victoire");
  code = 1;
}
if (regress) code = Math.max(code, 2);
process.exit(code);
