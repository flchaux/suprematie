// Visuels de la Souche : une icône générée par bâtiment, unité et objet de la race, et des matières
// vivantes sur ses modèles seulement (tables des couches cohérentes avec l'atlas, autres modèles inchangés).
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { Sim } from "../../shared/src/sim.ts";
import { RACE_SOUCHE, type GameData } from "../../shared/src/data.ts";
import { buildModel, LAYER_COUNT, MATERIAL_LAYER, SKIN_LAYER, type BuiltModel } from "../src/models/generator.ts";
import { ATLAS_CELLS, LAYER_CELL, MATERIAL_KEYS, NO_TEXTURE } from "../src/render/textures.ts";
import { LAYER_METAL, LAYER_ROUGH } from "../src/render/materials.ts";
import { UNIT_MODELS } from "../../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../../assets/models/buildings.ts";
import { SOUCHE_BUILDING_MODELS, SOUCHE_UNIT_MODELS } from "../../../assets/models/souche.ts";
import { SOUCHE_ORGAN_MODELS } from "../../../assets/models/souche-organes.ts";
import { SOUCHE_SWARM_MODELS } from "../../../assets/models/souche-essaim.ts";
import { SOUCHE_EGG_MODELS } from "../../../assets/models/souche-oeufs.ts";
// manifestes des chaînes de génération (tools/) : descriptions des icônes et des textures
import { SOUCHE_BUILDINGS, SOUCHE_ITEMS, SOUCHE_UNITS, BUILDINGS, ITEMS, UNITS } from "../../../tools/sprites/manifest.mjs";
import { MATERIALS } from "../../../tools/textures/manifest.mjs";

const asset = (path: string) => new URL(`../src/assets/${path}`, import.meta.url);
const loadData = async (): Promise<GameData> => {
  const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
  return JSON.parse(sim.dataJson()) as GameData;
};
/** Objets propres à la Souche : sève, sels, ADN (réserves de ses réseaux et monnaie de sa recherche). */
const SOUCHE_ITEM_KEYS = ["seve", "sels", "adn", "eau"];
/** Couches de matière des machines (0 à 8), de la Souche (9 à 12) et des Transhumants (13 à 20). */
const MACHINE_LAYERS = 9;
const SALVAGE_LAYERS = 13;

/** Couches de matière présentes dans un modèle construit (corps et pièces mobiles). */
function layersOf(built: BuiltModel): Set<number> {
  const out = new Set<number>();
  for (const g of [built.body, ...built.pivots.map((p) => p.geometry)]) {
    const mat = g.getAttribute("mat");
    for (let i = 0; i < mat.count; i++) out.add(mat.getX(i));
  }
  return out;
}

describe("icônes de la Souche", () => {
  it("une icône et une description par bâtiment, unité et objet de la Souche", async () => {
    const data = await loadData();
    const buildings = data.buildings.filter((b) => b.race === RACE_SOUCHE).map((b) => b.key);
    const units = data.units.filter((u) => u.race === RACE_SOUCHE).map((u) => u.key);
    expect(buildings.length).toBeGreaterThan(10);
    expect(units.length).toBeGreaterThan(10);
    // le manifeste décrit exactement les bâtiments et les unités de la race (œufs compris), sans doublon
    // avec les icônes des autres races
    expect(Object.keys(SOUCHE_BUILDINGS).sort()).toEqual([...buildings].sort());
    expect(Object.keys(SOUCHE_UNITS).sort()).toEqual([...units].sort());
    expect(Object.keys(SOUCHE_ITEMS).sort()).toEqual([...SOUCHE_ITEM_KEYS].sort());
    for (const k of buildings) expect(k in BUILDINGS, k).toBe(false);
    for (const k of units) expect(k in UNITS, k).toBe(false);
    for (const k of SOUCHE_ITEM_KEYS) {
      expect(k in ITEMS, k).toBe(false);
      expect(data.items.some((it) => it.key === k), k).toBe(true);
    }
    // les fichiers que le client cherche par clé (ui/sprites.ts)
    const missing = [
      ...buildings.map((k) => `sprites/buildings/${k}.webp`),
      ...units.map((k) => `sprites/units/${k}.webp`),
      ...SOUCHE_ITEM_KEYS.map((k) => `sprites/items/${k}.webp`),
    ].filter((p) => !existsSync(asset(p)));
    expect(missing).toEqual([]);
  });
});

describe("matières des modèles", () => {
  it("les tables par couche ont la même longueur et chaque case de l'atlas a sa texture", () => {
    expect(LAYER_CELL.length).toBe(LAYER_COUNT);
    expect(LAYER_METAL.length).toBe(LAYER_COUNT);
    expect(LAYER_ROUGH.length).toBe(LAYER_COUNT);
    expect(MATERIAL_KEYS.length).toBeLessThanOrEqual(ATLAS_CELLS);
    for (const cell of LAYER_CELL) expect(cell).toBeLessThan(MATERIAL_KEYS.length);
    // chaque texture de l'atlas sert à une couche au moins, et son fichier existe
    for (let i = 0; i < MATERIAL_KEYS.length; i++) {
      expect(LAYER_CELL.includes(i), MATERIAL_KEYS[i]).toBe(true);
      expect(existsSync(asset(`textures/${MATERIAL_KEYS[i]}.webp`)), MATERIAL_KEYS[i]).toBe(true);
    }
    // même ordre que le manifeste de la chaîne de génération
    expect((MATERIALS as { key: string }[]).map((m) => m.key)).toEqual([...MATERIAL_KEYS]);
    // toutes les couches citées par les tables de couleurs existent
    const used = [...Object.values(MATERIAL_LAYER), ...Object.values(SKIN_LAYER).flatMap((t) => Object.values(t))];
    for (const layer of used) expect(layer).toBeLessThan(LAYER_COUNT);
  });

  it("les couches des machines gardent leur case, leur aspect et leurs couleurs d'avant la Souche", () => {
    expect(LAYER_CELL.slice(0, MACHINE_LAYERS)).toEqual([0, 1, 2, 3, 4, 0, 2, 1, 5]);
    expect(LAYER_METAL.slice(0, MACHINE_LAYERS)).toEqual([0.3, 0.62, 0.45, 0.2, 0.1, 0, 0, 0.85, 0]);
    expect(LAYER_ROUGH.slice(0, MACHINE_LAYERS)).toEqual([0.5, 0.36, 0.5, 0.55, 0.1, 0.6, 0.85, 0.3, 0.88]);
    expect(MATERIAL_KEYS.slice(0, 6)).toEqual(["armor", "metal", "dark", "hazard", "glass", "concrete"]);
    // la table commune ne cite aucune couche de la Souche : elles ne viennent que du jeu de matières d'un modèle
    for (const [color, layer] of Object.entries(MATERIAL_LAYER)) expect(layer, color).toBeLessThan(MACHINE_LAYERS);
    expect(MATERIAL_LAYER.faction).toBe(0);
    expect(MATERIAL_LAYER.black).toBe(2);
    expect(MATERIAL_LAYER.wood).toBe(NO_TEXTURE);
    // le jeu de matières de la Souche ne cite que ses propres couches
    for (const [color, layer] of Object.entries(SKIN_LAYER.souche)) {
      expect(layer, color).toBeGreaterThanOrEqual(MACHINE_LAYERS);
      expect(layer, color).toBeLessThan(SALVAGE_LAYERS);
    }
  });

  it("seuls les modèles de la Souche portent ses matières, et ils n'ont plus de plaques ni de grilles", async () => {
    const data = await loadData();
    const souche = { ...SOUCHE_BUILDING_MODELS, ...SOUCHE_ORGAN_MODELS, ...SOUCHE_UNIT_MODELS, ...SOUCHE_SWARM_MODELS, ...SOUCHE_EGG_MODELS };
    // chaque bâtiment et chaque unité de la race a son modèle parmi eux
    for (const b of data.buildings) if (b.race === RACE_SOUCHE) expect(BUILDING_MODELS[b.key], b.key).toBe(souche[b.key]);
    for (const u of data.units) if (u.race === RACE_SOUCHE) expect(UNIT_MODELS[u.key], u.key).toBe(souche[u.key]);
    const soucheModels = new Set(Object.values(souche));
    const alive = new Set([NO_TEXTURE, ...Object.values(SKIN_LAYER.souche)]);
    for (const [key, model] of [...Object.entries(UNIT_MODELS), ...Object.entries(BUILDING_MODELS)]) {
      const layers = [...layersOf(buildModel(model))];
      if (soucheModels.has(model)) {
        expect(model.skin, key).toBe("souche");
        // lumineux, chitine, écorce, chair ou os : une couleur sans matière vivante se verrait ici
        expect(layers.filter((l) => !alive.has(l)), key).toEqual([]);
      } else {
        // (les matières de récupération des Transhumants : nomadesVisuels.test.ts)
        expect(model.skin, key).not.toBe("souche");
        expect(layers.filter((l) => l >= MACHINE_LAYERS && l < SALVAGE_LAYERS), key).toEqual([]);
      }
    }
  });
});
