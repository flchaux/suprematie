// Gabarits d'équipement des Transhumants : emplacements par porteur, lecture de la fiche, coût, ce qui reste à installer.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, RELEVES } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { emptyKit, hasKits, kitChoices, kitCost, kitPending, kitsOf, slotsOf, unpackKit } from "../src/game/kits.ts";
import { buildingRanges } from "../src/render/ranges.ts";

let d: GameData;
const unit = (key: string): number => d.units.findIndex((u) => u.key === key);
const mod = (key: string): number => d.mods.findIndex((m) => m.key === key);

beforeAll(async () => {
  const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
  d = JSON.parse(sim.dataJson()) as GameData;
});

describe("gabarits d'équipement", () => {
  it("emplacements : cinq pour l'Arche, trois pour une unité de combat, deux pour un module (trois pour le générateur), un pour un chariot", () => {
    expect(["ark", "rider", "ch_drill", "ch_generator", "t_cart"].map((k) => slotsOf(d, unit(k)).length)).toEqual([5, 3, 2, 3, 1]);
    expect(["tracker", "rider", "harrow", "towed_gun", "ram"].every((k) => hasKits(d, unit(k)))).toBe(true);
    expect(["ark", "ch_drill", "t_cart", "ark_car", "turret_gun", "light_tank"].some((k) => hasKits(d, unit(k)))).toBe(false);
  });

  it("chaque emplacement propose deux ou trois choix, tous du bon type et du bon emplacement", () => {
    for (const k of ["tracker", "rider", "harrow", "towed_gun", "ram"])
      for (let sl = 0; sl < 3; sl++) {
        const list = kitChoices(d, unit(k), sl);
        expect(list.length === 2 || list.length === 3, `${k} ${sl}`).toBe(true);
        expect(list.every(({ m }) => m.slot === sl && d.units[m.host].key === k)).toBe(true);
      }
  });

  it("lecture de la fiche : gabarit de production et gabarits enregistrés", () => {
    const [a, b] = [mod("rider_long"), mod("rider_plate")];
    const r = unit("rider");
    const kits: [number, number, number, number, number][] = [[r, 2, 0, a | (b << 8), 0]];
    expect(kitsOf(kits, r)).toEqual({ active: 2, sets: [[0, 0, 0], [a, b, 0], [0, 0, 0]] });
    expect(kitsOf(kits, unit("ram"))).toEqual({ active: 0, sets: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] });
    expect([emptyKit(unpackKit(0)), emptyKit(unpackKit(b << 8))]).toEqual([true, false]);
  });

  it("coût additionné, relevés compris, et la moitié des temps d'installation", () => {
    const [a, b] = [mod("rider_long"), mod("rider_plate")];
    const { cost, time } = kitCost(d, [a, b, 0]);
    const sum = (it: number) => [a, b].reduce((n, m) => n + (d.mods[m].cost.find((c) => c[0] === it)?.[1] ?? 0), 0);
    for (const [it, n] of cost) expect(n).toBe(sum(it));
    expect(cost.some(([it]) => it === RELEVES)).toBe(true);
    expect(time).toBe((d.mods[a].time + d.mods[b].time) / 2);
    expect(kitCost(d, [0, 0, 0])).toEqual({ cost: [], time: 0 });
  });

  it("ce qui reste à installer d'un équipement voulu", () => {
    const [a, b] = [mod("rider_long"), mod("rider_plate")];
    expect(kitPending(a | (b << 8), [0, b, 0])).toEqual([a]);
    expect(kitPending(a | (b << 8), [a, b, 0])).toEqual([]);
    expect(kitPending(0, [a, 0, 0])).toEqual([]);
  });

  it("bastion à affût antiaérien : son arme, longue ou non, vise aussi en l'air", () => {
    const b = d.buildings.find((x) => x.key === "t_bastion")!;
    const of = (...keys: string[]) => buildingRanges(b, d.weapons, keys.map((k) => d.mods[mod(k)]));
    expect(of().air).toBeUndefined();
    // même portée au sol et en l'air : un seul contour (voir rangesOf)
    expect(of("bastion_flak").ground).toBe(30);
    expect(of("bastion_long", "bastion_flak").ground).toBe(44);
  });
});
