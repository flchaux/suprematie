// Icônes générées : chaque unité, bâtiment et objet de toutes les races a son image (src/assets/sprites/) et sa
// description dans le catalogue de génération (tools/sprites/manifest.mjs), pour pouvoir la refaire.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { Sim } from "../../shared/src/sim.ts";
import type { GameData } from "../../shared/src/data.ts";
import * as M from "../../../tools/sprites/manifest.mjs";

const loadData = async (): Promise<GameData> => {
  const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
  return JSON.parse(sim.dataJson()) as GameData;
};
const tables: Record<string, Record<string, string>[]> = {
  units: [M.UNITS, M.SOUCHE_UNITS, M.TRANSH_UNITS],
  buildings: [M.BUILDINGS, M.SOUCHE_BUILDINGS, M.TRANSH_BUILDINGS],
  items: [M.ITEMS, M.SOUCHE_ITEMS, M.TRANSH_ITEMS],
};

describe("icônes", () => {
  it("une image et une description par unité, bâtiment et objet de toutes les races", async () => {
    const data = await loadData();
    for (const [cat, list] of [["units", data.units], ["buildings", data.buildings], ["items", data.items]] as const) {
      // l'objet « none » (case vide) n'a pas d'icône
      const keys = list.map((d) => d.key).filter((k) => k !== "none");
      const noImage = keys.filter((k) => !existsSync(new URL(`../src/assets/sprites/${cat}/${k}.webp`, import.meta.url)));
      const described = new Set(tables[cat].flatMap((t) => Object.keys(t)));
      const noText = keys.filter((k) => !described.has(k));
      expect([cat, noImage, noText]).toEqual([cat, [], []]);
    }
  });
});
