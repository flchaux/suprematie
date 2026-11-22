// Races : choix du salon transmis à la simulation (une race par joueur, après le brouillard), et
// départ de chaque race dans la simulation.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "../src/sim.ts";
import { parseFrame } from "../src/render.ts";
import { simParams, racesFromParams, type LobbyState } from "../src/protocol.ts";
import { RACE_INDUS, RACE_SOUCHE, RACE_TRANSH, type GameData } from "../src/data.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));

function lobby(races: (number | undefined)[], bots: boolean[] = []): LobbyState {
  return {
    players: races.map((race, i) => ({ slot: i, name: `J${i}`, bot: bots[i] ?? false, team: i, race, connected: true, host: i === 0 })),
    mapSize: 512, water: false, seed: 9, fauna: "none", fog: true, running: false, tick: 0, save: null,
  };
}

describe("races", () => {
  it("une race par joueur, après le brouillard ; les bots jouent les Industriels", () => {
    const p = simParams(lobby([RACE_SOUCHE, RACE_TRANSH, RACE_SOUCHE], [false, false, true]));
    expect(racesFromParams(p)).toEqual([RACE_SOUCHE, RACE_TRANSH, RACE_INDUS]);
    // anciennes parties : sans races, Industriels
    expect(racesFromParams(p.slice(0, -3))).toEqual([RACE_INDUS, RACE_INDUS, RACE_INDUS]);
    expect(racesFromParams(simParams(lobby([undefined, undefined])))).toEqual([RACE_INDUS, RACE_INDUS]);
  });

  it("chaque race démarre avec son commandant ; le bloc joueur donne la race et la réserve de la Souche", async () => {
    const s = await Sim.load(wasm);
    const data = JSON.parse(s.dataJson()) as GameData;
    s.init(simParams(lobby([RACE_INDUS, RACE_SOUCHE, RACE_TRANSH])));
    s.step([]);
    const f = parseFrame(s.render(0, 0, 512, 512, 2, -1, false));
    expect(f.players.map((p) => p.race)).toEqual([RACE_INDUS, RACE_SOUCHE, RACE_TRANSH]);
    // réserve de départ (400 sève, 150 sels), plus ce que la graine-mère vient de produire
    expect(f.players[1].seve).toBeGreaterThanOrEqual(400);
    expect(f.players[1].sels).toBe(150);
    expect(f.players[0].seve).toBe(0);
    // commandants : robot, Reine, Arche
    const kinds = f.players.map((p) => p.commander);
    expect(kinds.every((id) => id > 0)).toBe(true);
    const keys = new Set(data.units.filter((u) => u.commander).map((u) => u.key));
    expect(keys).toEqual(new Set(["commander", "queen", "ark"]));
  });
});
