// Œufs de la Souche : modèle (lèvres articulées) et animation d'éclosion.
import { describe, it, expect } from "vitest";
import { buildModel, depMatrix, parseDep } from "../src/models/generator.ts";
import { UNIT_MODELS } from "../../../assets/models/units.ts";
import { birthScale, EGG_CLOSED, EGG_NEVER, EGG_OPEN, EGG_OPEN_TICKS, EGG_STIR_TICKS, eggPose, HUSK_LIFE, huskPose } from "../src/render/eggAnim.ts";
import * as THREE from "three";

const EGGS = ["egg_s", "egg_m", "egg_l"];

describe("modèle de l'œuf", () => {
  it("a quatre lèvres articulées sur la collerette et un cœur, sous le budget de triangles", () => {
    for (const key of EGGS) {
      const built = buildModel(UNIT_MODELS[key]);
      const lips = built.pivots.filter((p) => /#levre\d$/.test(p.name));
      expect(lips.length, key).toBe(4);
      for (const p of lips) {
        const steps = parseDep(p.name)!;
        // deux temps : l'ouverture (de 1 à 0,4), puis l'affaissement de la coque vide (de 0,4 à 0)
        expect(steps.map((s) => [s.t0, s.t1])).toEqual([[0.4, 1], [0, 0.4]]);
        // charnière sur la collerette, à l'écart de l'axe
        expect(Math.hypot(p.origin.x, p.origin.z)).toBeGreaterThan(0.3);
        expect(p.origin.y).toBeGreaterThan(0.3);
      }
      expect(built.pivots.some((p) => /#coeur$/.test(p.name)), key).toBe(true);
      expect(built.triangles, key).toBeLessThanOrEqual(1000);
      expect(built.trianglesLo, key).toBeLessThanOrEqual(600);
    }
  });

  it("fermé à l'avancement 1, ses lèvres s'écartent de l'axe en s'ouvrant, plus encore en se fanant", () => {
    const built = buildModel(UNIT_MODELS.egg_s);
    for (const p of built.pivots.filter((q) => /#levre\d$/.test(q.name))) {
      const steps = parseDep(p.name)!;
      p.geometry.computeBoundingBox();
      // pointe de la lèvre (son point le plus haut, fermée), dans le repère du pivot
      const pos = p.geometry.getAttribute("position");
      let top = new THREE.Vector3(0, -1e9, 0);
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) > top.y) top = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const reach = (dep: number): number => {
        const v = top.clone().applyMatrix4(depMatrix(steps, dep, 1)).add(p.origin);
        return Math.hypot(v.x, v.z);
      };
      expect(reach(EGG_CLOSED)).toBeLessThan(0.05);
      expect(reach(EGG_OPEN)).toBeGreaterThan(0.6);
      expect(reach(0)).toBeGreaterThan(reach(EGG_OPEN));
    }
  });
});

describe("animation de l'œuf", () => {
  it("reste fermé et immobile loin de l'éclosion, respire seulement", () => {
    for (const t of [0, 1.3, 7.7]) {
      const p = eggPose(200, t, 5);
      expect(p.dep).toBe(EGG_CLOSED);
      expect(Math.abs(p.tilt)).toBe(0);
      expect(p.lift).toBe(0);
      expect(Math.abs(p.scale - 1)).toBeLessThanOrEqual(0.021);
    }
  });

  it("s'agite de plus en plus pendant ses quatre dernières secondes", () => {
    const peak = (left: number): number => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(eggPose(left, i * 0.01, 3).tilt)));
    expect(peak(EGG_STIR_TICKS)).toBe(0);
    expect(peak(60)).toBeGreaterThan(0);
    expect(peak(30)).toBeGreaterThan(peak(60));
    expect(peak(EGG_OPEN_TICKS)).toBeGreaterThan(peak(30));
    expect(peak(EGG_OPEN_TICKS)).toBeLessThan(0.33);
  });

  it("s'ouvre pendant ses derniers ticks, sans plus trembler à la fin", () => {
    expect(eggPose(EGG_OPEN_TICKS, 0, 0).dep).toBe(EGG_CLOSED);
    const mid = eggPose(EGG_OPEN_TICKS / 2, 0, 0).dep;
    expect(mid).toBeLessThan(EGG_CLOSED);
    expect(mid).toBeGreaterThan(EGG_OPEN);
    const end = eggPose(0, 2.2, 0);
    expect(end.dep).toBeCloseTo(EGG_OPEN);
    expect(end.tilt).toBeCloseTo(0);
  });

  it("un œuf vide (vitrine) ne s'ouvre jamais", () => {
    const p = eggPose(EGG_NEVER, 3, 1);
    expect(p.dep).toBe(EGG_CLOSED);
    expect(p.tilt).toBe(0);
  });

  it("la coque vide part de la pose ouverte, se fane puis rentre dans le sol", () => {
    expect(huskPose(0)).toEqual({ dep: EGG_OPEN, sink: 0, scale: 1 });
    expect(huskPose(0.7).dep).toBe(0);
    expect(huskPose(0.5).sink).toBe(0);
    const end = huskPose(HUSK_LIFE);
    expect(end.sink).toBe(1);
    expect(end.scale).toBeLessThan(1);
  });

  it("l'organisme sort petit, dépasse un peu sa taille, puis s'y pose", () => {
    expect(birthScale(0)).toBeCloseTo(0.3);
    expect(birthScale(1)).toBeCloseTo(1);
    const over = Math.max(...Array.from({ length: 50 }, (_, i) => birthScale(i / 50)));
    expect(over).toBeGreaterThan(1);
    expect(over).toBeLessThan(1.12);
  });
});
