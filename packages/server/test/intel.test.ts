// Tests du renseignement de l'IA : puissance des unités et cartes de menace.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, keyIndex, BUILD_FULL } from "@supreme/shared";
import type { GameData, BotView, PlayerView } from "@supreme/shared";
import { kindPowers, Intel, T, CELL } from "../src/bots/intel.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));
let data: GameData;
let u: Record<string, number>;
let b: Record<string, number>;

beforeAll(async () => {
  const s = await Sim.load(wasm);
  data = JSON.parse(s.dataJson());
  u = keyIndex(data.units);
  b = keyIndex(data.buildings);
});

const TILE = 256;
function player(team: number): PlayerView {
  const z = new Int32Array(27);
  return { alive: true, team, researchedLo: 1, researchedHi: 0, research: 0, researchProgress: 0, powerProd: 0, powerUse: 0, unitCount: 0, commander: 0, kills: 0, losses: 0, bot: true, stock: z, produced: z, consumed: z, teamStock: z };
}
function unit(id: number, kind: number, owner: number, x: number, y: number) {
  return { id, kind, owner, x: x * TILE, y: y * TILE, hp: data.units[kind].hp, order: 0, nOrders: 0, carried: false, cargo: 0 };
}

describe("puissance des unités", () => {
  it("le commandant vaut une vingtaine de robots de ligne", () => {
    const k = kindPowers(data).units;
    const r = k[u.commander].ground / k[u.line_robot].ground;
    expect(r).toBeGreaterThan(12);
    expect(r).toBeLessThan(30);
  });
  it("distingue chasseurs, antiaérien et attaque au sol", () => {
    const k = kindPowers(data);
    expect(k.units[u.interceptor].ground).toBe(0);
    expect(k.units[u.interceptor].aa).toBeGreaterThan(0);
    expect(k.units[u.interceptor].air).toBe(true);
    expect(k.units[u.mobile_aa].aa).toBeGreaterThan(0);
    expect(k.units[u.glider].ground).toBeGreaterThan(0);
    expect(k.buildings[b.aa_turret].aa).toBeGreaterThan(0);
    expect(k.buildings[b.light_turret].ground).toBeGreaterThan(0);
    // les tapis ne comptent pas dans la valeur économique
    expect(k.value[b.belt1]).toBe(0);
    expect(k.value[b.land_factory]).toBeGreaterThan(0);
  });
});

describe("cartes de menace", () => {
  it("additionne les forces par joueur, catégorie et zone", () => {
    const view: BotView = {
      tick: 0,
      players: [player(0), player(1)],
      units: [
        unit(1, u.line_robot, 0, 100, 100),
        unit(2, u.line_robot, 0, 101, 100),
        unit(3, u.glider, 1, 300, 300),
        unit(4, u.mobile_aa, 1, 302, 300),
      ],
      buildings: [{ ref: 9, kind: b.land_factory, owner: 1, dir: 0, x: 310, y: 300, hp: 4000, build: BUILD_FULL, working: false, stalled: false, unpowered: false, ammo: 0, charged: false, queue: 0, recipe: 0 }],
      wrecks: [],
      winner: -1,
    };
    const I = new Intel(view, data, 512, 512);
    const k = kindPowers(data).units;
    expect(I.sum([0], T.Surface, 100 * TILE, 100 * TILE, 8)).toBeCloseTo(2 * k[u.line_robot].ground, 3);
    expect(I.sum([1], T.Surface, 100 * TILE, 100 * TILE, 8)).toBe(0);
    // aviation et antiaérien du joueur 1
    expect(I.sum([1], T.Air, 300 * TILE, 300 * TILE, 8)).toBeGreaterThan(0);
    expect(I.sum([1], T.AntiAir, 300 * TILE, 300 * TILE, 8)).toBeCloseTo(k[u.mobile_aa].aa, 3);
    expect(I.sum([1], T.Eco, 310 * TILE, 300 * TILE, CELL)).toBeGreaterThan(0);
    // loin de tout : rien
    expect(I.sum([0, 1], T.Surface, 450 * TILE, 50 * TILE, 16)).toBe(0);
    expect(I.land[0]).toBeGreaterThan(0);
    expect(I.air[1]).toBeGreaterThan(0);
    expect(I.aaUnits[1]).toBeGreaterThan(0);
  });
});
