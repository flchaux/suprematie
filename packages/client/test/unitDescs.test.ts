// Chaque unité de la simulation a sa description (fiche, infobulles de l'usine).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { UNIT_DESCS } from "../src/game/unitDescs.ts";

describe("descriptions des unités", () => {
  it("une description non vide par unité, et aucune en trop", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    const keys = data.units.map((u) => u.key);
    expect(keys.filter((k) => !UNIT_DESCS[k]?.trim())).toEqual([]);
    expect(Object.keys(UNIT_DESCS).filter((k) => !keys.includes(k))).toEqual([]);
  });
});
