// Modèles générés : contraintes du moteur WebGPU et occlusion ambiante.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "../../shared/src/sim.ts";
import type { GameData } from "../../shared/src/data.ts";
import { buildModel, condShown, parseCond } from "../src/models/generator.ts";
import { UNIT_MODELS } from "../../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../../assets/models/buildings.ts";

/** tampons ajoutés par le maillage instancié des unités et bâtiments (render/materials.ts) */
const INSTANCE_BUFFERS = 3; // matrice d'instance, couleur d'équipe, teinte de ressource
/** limite par défaut de WebGPU (maxVertexBuffers) ; WebGL2 n'en a pas, d'où une panne invisible en WebGL */
const WEBGPU_MAX_VERTEX_BUFFERS = 8;

describe("modèles", () => {
  it("restent sous la limite de tampons de sommets de WebGPU", () => {
    for (const [key, model] of [...Object.entries(UNIT_MODELS), ...Object.entries(BUILDING_MODELS)]) {
      const built = buildModel(model);
      for (const g of [built.body, ...built.pivots.map((p) => p.geometry)]) {
        const n = Object.keys(g.attributes).length + INSTANCE_BUFFERS;
        expect(n, `${key} : ${Object.keys(g.attributes).join(", ")}`).toBeLessThanOrEqual(WEBGPU_MAX_VERTEX_BUFFERS);
      }
    }
  });

  it("montrent les améliorations des Transhumants : chaque pivot « si: » cite des améliorations qui existent", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    const keys = new Set(data.mods.map((m) => m.key));
    const shown = new Set<string>();
    for (const [key, model] of [...Object.entries(UNIT_MODELS), ...Object.entries(BUILDING_MODELS)]) {
      for (const p of buildModel(model).pivots) {
        const c = parseCond(p.name);
        for (const t of c?.all ?? []) {
          for (const k of t.keys) {
            expect(keys.has(k), `${key} : ${k}`).toBe(true);
            if (c!.on && t.on) shown.add(k);
          }
        }
      }
    }
    // l'Arche (avec ses remorques), les modules et les unités de combat montrent chacune de leurs améliorations
    const hidden = data.mods.slice(1).filter((m) => data.units[m.host].key !== "t_cart" && !shown.has(m.key)).map((m) => m.key);
    expect(hidden).toEqual([]);
    const c = parseCond("sauf:a+b#tourelle");
    expect([condShown(c, () => false), condShown(c, (k) => k === "b"), condShown(null, () => false)]).toEqual([true, false, true]);
    expect(parseCond("si:a#fixe_x")).toEqual({ on: true, all: [{ on: true, keys: ["a"] }], base: "fixe_x" });
    // plusieurs conditions à la fois, et un déploiement derrière la condition
    const both = parseCond("si:a+b&c&!d+e#dep|t:0,1,0:0:1#x")!;
    const seen = (...keys: string[]) => condShown(both, (k) => keys.includes(k));
    expect([seen("a"), seen("a", "c"), seen("b", "c"), seen("c"), seen("a", "c", "e")]).toEqual([false, true, true, false, false]);
    expect([both.on, both.base]).toEqual([true, "dep|t:0,1,0:0:1#x"]);
  });

  it("portent une occlusion ambiante entre 0,3 et 1, plus sombre dans les creux", () => {
    const built = buildModel(UNIT_MODELS.colossus);
    const mat = built.body.getAttribute("mat");
    expect(mat.itemSize).toBe(2);
    let min = 1;
    let max = 0;
    for (let i = 0; i < mat.count; i++) {
      min = Math.min(min, mat.getY(i));
      max = Math.max(max, mat.getY(i));
    }
    expect(min).toBeGreaterThanOrEqual(0.3);
    expect(min).toBeLessThan(0.8);
    expect(max).toBe(1);
  });
});
