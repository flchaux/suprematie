// Matières de récupération des Transhumants (plaques rapiécées, acier usé, tôle, peinture écaillée, rouille, bâche,
// planches, cuivre) : portées par tous leurs modèles et par eux seuls, trappes comprises.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { Sim } from "../../shared/src/sim.ts";
import { RACE_TRANSH, type GameData } from "../../shared/src/data.ts";
import { buildModel, SKIN_LAYER, withHatches, type BuiltModel } from "../src/models/generator.ts";
import { LAYER_CELL, MATERIAL_KEYS } from "../src/render/textures.ts";
import { LAYER_METAL, LAYER_ROUGH, LAYER_SALVAGE } from "../src/render/materials.ts";
import { UNIT_MODELS } from "../../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../../assets/models/buildings.ts";
import { TRANSH_BUILDING_MODELS, TRANSH_UNIT_MODELS } from "../../../assets/models/transhumants.ts";
import { MATERIALS } from "../../../tools/textures/manifest.mjs";

const loadData = async (): Promise<GameData> => JSON.parse((await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)))).dataJson()) as GameData;
const layersOf = (built: BuiltModel): Set<number> => {
  const out = new Set<number>();
  for (const g of [built.body, ...built.pivots.map((p) => p.geometry)]) {
    const mat = g.getAttribute("mat");
    for (let i = 0; i < mat.count; i++) out.add(mat.getX(i));
  }
  return out;
};
/** couches de machine qu'un modèle de récupération garde : verre, lumineux ou sans texture, caoutchouc, béton */
const KEPT = [4, 5, 6, 8];

describe("matières de récupération des Transhumants", () => {
  it("huit matières, chacune avec sa case, sa texture et ses couleurs de pièce", () => {
    const nomade = SKIN_LAYER.nomade as Record<string, number>;
    expect([...new Set(Object.values(nomade))].sort((a, b) => a - b)).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
    expect(LAYER_SALVAGE).toBe(13);
    const entries = (MATERIALS as { key: string; skin?: string; colors: string[] }[]).filter((m) => m.skin === "nomade");
    expect(entries.length).toBe(8);
    for (const m of entries) {
      expect(existsSync(new URL(`../src/assets/textures/${m.key}.webp`, import.meta.url)), m.key).toBe(true);
      // le manifeste et la table du générateur citent les mêmes couleurs, et la couche mène à la bonne case
      for (const c of m.colors) expect(MATERIAL_KEYS[LAYER_CELL[nomade[c]]], `${m.key} ${c}`).toBe(m.key);
    }
    expect(Object.keys(nomade).sort()).toEqual(entries.flatMap((m) => m.colors).sort());
    for (const l of Object.values(nomade)) expect(LAYER_METAL[l] >= 0 && LAYER_METAL[l] <= 1 && LAYER_ROUGH[l] > 0.3 && LAYER_ROUGH[l] <= 1, String(l)).toBe(true);
  });

  it("tous les modèles de la race les portent, et aucun autre", async () => {
    const data = await loadData();
    for (const b of data.buildings) if (b.race === RACE_TRANSH) expect(BUILDING_MODELS[b.key], b.key).toBe(TRANSH_BUILDING_MODELS[b.key]);
    for (const u of data.units) if (u.race === RACE_TRANSH) expect(UNIT_MODELS[u.key], u.key).toBe(TRANSH_UNIT_MODELS[u.key]);
    const ours = new Set([...Object.values(TRANSH_BUILDING_MODELS), ...Object.values(TRANSH_UNIT_MODELS)]);
    for (const [key, model] of [...Object.entries(UNIT_MODELS), ...Object.entries(BUILDING_MODELS)]) {
      const layers = [...layersOf(buildModel(model))];
      if (ours.has(model)) {
        expect(model.skin, key).toBe("nomade");
        expect(layers.filter((l) => l < LAYER_SALVAGE && !KEPT.includes(l)), key).toEqual([]);
        expect(layers.some((l) => l >= LAYER_SALVAGE), key).toBe(true);
      } else {
        expect(model.skin, key).not.toBe("nomade");
        expect(layers.filter((l) => l >= LAYER_SALVAGE), key).toEqual([]);
      }
    }
  });

  it("les trappes d'un module prennent ses matières", () => {
    const m = withHatches(buildModel(TRANSH_BUILDING_MODELS.t_furnace), 2);
    expect([...layersOf(m)].filter((l) => l < LAYER_SALVAGE && !KEPT.includes(l))).toEqual([]);
  });
});
