// Modèles générés : contraintes du moteur WebGPU et occlusion ambiante.
import { describe, it, expect } from "vitest";
import { buildModel } from "../src/models/generator.ts";
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
