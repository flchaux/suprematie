// Chaque bâtiment de la simulation a sa description (barre de construction, fiche).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { BUILDING_DESCS } from "../src/game/buildingDescs.ts";

describe("descriptions des bâtiments", () => {
  it("une description non vide par bâtiment, et aucune en trop", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    const keys = data.buildings.map((b) => b.key);
    expect(keys.filter((k) => !BUILDING_DESCS[k]?.trim())).toEqual([]);
    expect(Object.keys(BUILDING_DESCS).filter((k) => !keys.includes(k))).toEqual([]);
  });
});
