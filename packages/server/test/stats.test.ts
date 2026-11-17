// Statistiques de partie : valeur matière des objets et relevés sur une petite partie entre IA.
import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Sim, pack, parseBotDump, ORDER_DELAY, keyIndex } from "@supreme/shared";
import type { GameData, LobbyState, StatSample } from "@supreme/shared";
import { Game, type GameHooks, type Peer } from "../src/game.ts";
import { readSave } from "../src/saves.ts";
import { createBot, type MapInfo } from "../src/bots/index.ts";
import { itemValues, oreItems, isCombatUnit, StatsCalc, visibleSample, STATS_EVERY } from "../src/stats.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));

function mapOf(sim: Sim): MapInfo {
  const info = sim.mapInfo();
  const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights: sim.mapHeights() };
  let o = 4;
  for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
  const ns = info[o++];
  for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
  return map;
}

async function gameData(): Promise<{ sim: Sim; data: GameData }> {
  const sim = await Sim.load(wasm);
  sim.init([5, 512, 0, 2, 0, 1, 100, 100, 1, 1, 100, 100]);
  return { sim, data: JSON.parse(sim.dataJson()) };
}

describe("valeur matière des objets", () => {
  it("est cohérente avec les recettes du jeu", async () => {
    const { data } = await gameData();
    const v = itemValues(data);
    const k = keyIndex(data.items);
    expect(v).toHaveLength(data.items.length);
    expect(v[0]).toBe(0);
    for (const x of v.slice(1)) expect(Number.isFinite(x) && x > 0).toBe(true);
    // minerais : aucun ne sort d'une recette
    const ores = oreItems(data);
    expect(ores).toContain(k.iron_ore);
    expect(ores).toContain(k.copper_ore);
    expect(ores).not.toContain(k.iron_plate);
    for (const o of ores) expect(v[o]).toBe(1);
    // chaque recette : entrées >= sortie (la moins chère fixe la valeur)
    for (const r of data.recipes) {
      const inputs = r.inputs.reduce((s, [it, q]) => s + v[it] * q, 0);
      expect(v[r.output[0]] * r.output[1]).toBeLessThanOrEqual(inputs + 1e-9);
    }
    expect(v[k.iron_plate]).toBe(1);
    expect(v[k.steel]).toBe(5);
    expect(v[k.cable]).toBe(0.5);
    expect(v[k.circuit]).toBe(2.5);
  });

  it("ne boucle pas sur des recettes circulaires", () => {
    const item = (key: string) => ({ key, name: key, color: 0 });
    const recipe = (inputs: [number, number][], output: [number, number]) => ({ key: "r", crafter: 0, inputs, output, time: 1, tech: 0 });
    const data = {
      items: [item("none"), item("ore"), item("a"), item("b"), item("c")],
      // a <- ore ; b <- a + c ; c <- b (boucle b <-> c) ; c <- 3 ore (sortie de secours)
      recipes: [recipe([[1, 2]], [2, 1]), recipe([[2, 1], [4, 1]], [3, 2]), recipe([[3, 1]], [4, 1]), recipe([[1, 3]], [4, 1])],
    } as unknown as GameData;
    const v = itemValues(data);
    expect(v[2]).toBe(2);
    expect(v[4]).toBe(3);
    expect(v[3]).toBe(2.5);
    // boucle sans issue : traitée comme matière première
    const closed = { items: data.items, recipes: [recipe([[3, 1]], [2, 1]), recipe([[2, 1]], [3, 1])] } as unknown as GameData;
    const w = itemValues(closed);
    expect(w.every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe("relevés de partie", () => {
  it("calcule un relevé sur une petite partie entre IA", async () => {
    const { sim, data } = await gameData();
    const map = mapOf(sim);
    const bots = [0, 1].map((slot) => createBot({ slot, personality: "rush", aix: 100, level: "normal", sim, data, map }));
    const calc = new StatsCalc(data);
    const samples = [];
    let pending: { tick: number; player: number; cmd: number[] }[] = [];
    for (let k = 0; k < 6000; k++) {
      const t = sim.tick();
      if (t % 10 === 0) {
        const v = parseBotDump(sim.botDump());
        if (t % STATS_EVERY === 0) samples.push(calc.sample(v));
        bots.forEach((b, i) => {
          if (v.players[i].alive) for (const c of b.think(v)) pending.push({ tick: t + ORDER_DELAY, player: i, cmd: c });
        });
      }
      const orders: number[] = [];
      pending = pending.filter((p) => (p.tick <= t ? (pack(p.player, p.cmd, orders), false) : true));
      sim.step(orders);
    }
    expect(samples.map((s) => s.tick)).toEqual([0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400]);
    const first = samples[0].players[0]!;
    expect(first).toMatchObject({ alive: true, units: 1, army: 0, armyValue: 0, ore: 0, research: 0, kills: 0, losses: 0 });
    const last = samples[samples.length - 1];
    const view = parseBotDump(sim.botDump());
    for (let i = 0; i < 2; i++) {
      const p = last.players[i]!;
      // l'économie a démarré : minerai extrait, bâtiments, énergie
      expect(p.ore).toBeGreaterThan(0);
      expect(p.buildings).toBeGreaterThan(0);
      expect(p.powerProd).toBeGreaterThan(0);
      expect(p.units).toBeGreaterThanOrEqual(p.army);
      // valeur de l'armée = somme des coûts des unités de combat
      if (p.army === 0) expect(p.armyValue).toBe(0);
      expect(p.armyValue).toBeGreaterThanOrEqual(p.army);
      // le minerai extrait ne fait que croître
      for (let s = 1; s < samples.length; s++) expect(samples[s].players[i]!.ore).toBeGreaterThanOrEqual(samples[s - 1].players[i]!.ore);
    }
    // recalcul indépendant de l'armée sur l'état courant
    const now = calc.sample(view);
    for (let i = 0; i < 2; i++) {
      const mine = view.units.filter((u) => u.owner === i && isCombatUnit(data, u.kind));
      expect(now.players[i]!.army).toBe(mine.length);
      expect(now.players[i]!.armyValue).toBe(Math.round(mine.reduce((s, u) => s + calc.unitValue[u.kind], 0)));
    }
    // le commandant et les ingénieurs ne comptent pas dans l'armée
    const k = keyIndex(data.units);
    expect(isCombatUnit(data, k.commander)).toBe(false);
    expect(isCombatUnit(data, k.eng1)).toBe(false);
    expect(isCombatUnit(data, k.light_tank)).toBe(true);
  }, 120000);

  it("ne montre à un joueur que son équipe", () => {
    const p = { alive: true, units: 1, army: 0, armyValue: 0, ore: 0, powerProd: 0, powerUse: 0, research: 0, buildings: 0, kills: 0, losses: 0 };
    const s = { tick: 600, players: [p, { ...p, units: 2 }, { ...p, units: 3 }] };
    const teams = [0, 1, 0];
    expect(visibleSample(s, teams, 0).players.map((x) => x?.units ?? null)).toEqual([1, null, 3]);
    expect(visibleSample(s, teams, 1).players.map((x) => x?.units ?? null)).toEqual([null, 2, null]);
    expect(visibleSample(s, teams, -1)).toBe(s);
  });
});

describe("historique des relevés dans la partie", () => {
  it("filtre par équipe, rejoint l'état complet, la sauvegarde et le replay", async () => {
    const dir = mkdtempSync(join(tmpdir(), "stats-"));
    const sent: { slot: number; msg: { t: string; [k: string]: unknown } }[] = [];
    const peer = (slot: number): Peer => ({ slot, name: "p" + slot, connected: true, ackTick: 0, send: (msg) => sent.push({ slot, msg: msg as never }) });
    const peers = [peer(0), peer(-1)];
    const hooks: GameHooks = { broadcast: () => {}, peers: () => peers, onEnd: () => {}, log: () => {} };
    const lobby: LobbyState = {
      players: [
        { slot: 0, name: "A", bot: false, team: 0, connected: true, host: true },
        { slot: 1, name: "IA", bot: true, team: 1, connected: true, host: false, personality: "rush", level: "normal" },
      ],
      mapSize: 512, water: false, seed: 3, running: true, tick: 0, save: null,
    };
    const wasmPath = fileURLToPath(new URL("../../client/public/sim.wasm", import.meta.url));
    const games: Game[] = [];
    try {
      const g = new Game(lobby, hooks, wasmPath, dir);
      games.push(g);
      await g.start();
      clearInterval(g.timer!); // pas de boucle temps réel : relevés appelés à la main
      g.recordStats(parseBotDump(g.sim.botDump()), true);
      g.sim.step([]);
      g.recordStats(parseBotDump(g.sim.botDump()), true);
      g.recordStats(parseBotDump(g.sim.botDump()), true); // même tick : ignoré
      expect(g.history.map((s) => s.tick)).toEqual([0, 1]);
      const live = sent.filter((s) => s.msg.t === "stats");
      expect(live).toHaveLength(4);
      for (const { slot, msg } of live) {
        const players = (msg.sample as StatSample).players;
        expect(players[0]).not.toBeNull();
        if (slot === 0) expect(players[1]).toBeNull();
        else expect(players[1]).not.toBeNull();
      }
      // arrivée ou reconnexion : historique filtré joint à l'état complet
      sent.length = 0;
      g.sendSnapshot(peers[0]);
      const snap = sent[0].msg as { t: string; stats: StatSample[] };
      expect(snap.t).toBe("snapshot");
      expect(snap.stats.map((s) => s.players[1])).toEqual([null, null]);
      // sauvegarde puis reprise : l'historique continue
      const meta = g.save("test", false)!;
      const save = readSave(join(dir, "saves"), meta.id)!;
      expect(save.stats).toEqual(g.history);
      const g2 = new Game(lobby, hooks, wasmPath, dir);
      games.push(g2);
      await g2.start(save);
      clearInterval(g2.timer!);
      expect(g2.history).toEqual(g.history);
      // fin de partie : relevé final et historique complet dans le replay
      g2.sim.step([]);
      g2.finish(1);
      const rep = g2.replayData() as { stats: StatSample[] };
      expect(rep.stats.length).toBe(3);
      expect(rep.stats.every((s) => s.players.every((p) => p !== null))).toBe(true);
    } finally {
      for (const g of games) g.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
