// Ascenseurs de tapis : modèles (cage, quais, plateau) et trajet des objets dans la cage.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, BClass } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { buildModel } from "../src/models/generator.ts";
import { BUILDING_MODELS, NIVEAU_TAPIS } from "../../../assets/models/buildings.ts";
import { FLOOR_H, LIFT_QUAY, liftDash, liftOut, liftUp } from "../src/render/liftAnim.ts";

describe("modèles de l'ascenseur de tapis", () => {
  it("un quai par type de tapis de la simulation", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    const belts = data.buildings.filter((b) => b.cls === BClass.Belt).map((b) => b.key);
    expect(belts.length).toBeGreaterThanOrEqual(4);
    expect(belts.filter((k) => !BUILDING_MODELS[k + "_quai"])).toEqual([]);
  });

  it("la cage relie deux paliers distants d'un niveau, dans l'emprise d'une case", () => {
    expect(FLOOR_H).toBe(NIVEAU_TAPIS);
    const cage = buildModel(BUILDING_MODELS.ascenseur);
    expect(cage.box.min.y).toBeCloseTo(0, 5);
    // de la place au-dessus du palier haut pour un objet posé sur son plateau
    expect(cage.box.max.y).toBeGreaterThan(FLOOR_H + 0.5);
    expect(cage.box.max.y).toBeLessThan(FLOOR_H + 0.9);
    for (const v of [cage.box.min.x, cage.box.max.x, cage.box.min.z, cage.box.max.z]) expect(Math.abs(v)).toBeLessThanOrEqual(0.5);
    expect(cage.triangles).toBeLessThanOrEqual(400);
    expect(cage.trianglesLo).toBeLessThan(cage.triangles);
  });

  it("le quai va du bord arrière de la case à la cage, le plateau tient entre les deux quais", () => {
    const belt = buildModel(BUILDING_MODELS.belt1);
    for (const key of ["belt1_quai", "belt2_quai", "belt3_quai", "collector_quai"]) {
      const quay = buildModel(BUILDING_MODELS[key]);
      expect(quay.box.min.z, key).toBeCloseTo(-0.5, 5);
      expect(quay.box.max.z, key).toBeLessThanOrEqual(-0.18);
      // même largeur et même hauteur de rebord que le tapis qu'il prolonge
      expect(quay.box.max.x - quay.box.min.x, key).toBeCloseTo(belt.box.max.x - belt.box.min.x, 5);
      expect(quay.box.max.y, key).toBeLessThanOrEqual(belt.box.max.y + 1e-6);
      expect(quay.triangles, key).toBeLessThanOrEqual(120);
    }
    const tray = buildModel(BUILDING_MODELS.ascenseur_plateau);
    const quay = buildModel(BUILDING_MODELS.belt1_quai);
    expect(tray.box.max.z).toBeLessThanOrEqual(-quay.box.max.z);
    expect(tray.box.min.z).toBeGreaterThanOrEqual(quay.box.max.z);
    // dessus du plateau à y = 0 (le jeu le pose à la hauteur de la bande du tapis), entre les glissières
    expect(tray.box.max.y).toBeLessThanOrEqual(0.03);
    expect(tray.box.max.x).toBeLessThan(0.385);
  });
});

describe("trajet d'un objet dans l'ascenseur", () => {
  it("entre et sort au bord de la case, à son niveau de départ puis d'arrivée", () => {
    expect(liftOut(0)).toBe(1);
    expect(liftUp(0)).toBe(0);
    expect(liftOut(1)).toBe(1);
    expect(liftUp(1)).toBe(1);
    // à mi-course : au centre de la cage, à mi-hauteur
    expect(liftOut(0.5)).toBe(0);
    expect(liftUp(0.5)).toBeCloseTo(0.5, 9);
  });

  it("ne bouge jamais à la fois dans le plan et à la verticale", () => {
    for (let k = 0; k <= 256; k++) {
      const fr = k / 256;
      const out = liftOut(fr);
      const up = liftUp(fr);
      if (out > 0) expect(up === 0 || up === 1, `fraction ${fr}`).toBe(true);
      if (up > 0 && up < 1) expect(out, `fraction ${fr}`).toBe(0);
    }
  });

  it("est le même à la montée et à la descente (symétrique autour de la mi-course)", () => {
    for (let k = 0; k <= 256; k++) {
      const fr = k / 256;
      expect(liftOut(1 - fr)).toBeCloseTo(liftOut(fr), 9);
      expect(liftUp(1 - fr)).toBeCloseTo(1 - liftUp(fr), 9);
    }
  });

  it("garde la même vitesse sur le quai, dans la cage et sur l'autre quai", () => {
    // longueur parcourue par pas de fraction : une demi-case, un niveau, une demi-case
    const pos = (fr: number) => (fr < 0.5 ? 0.5 * (1 - liftOut(fr)) + FLOOR_H * liftUp(fr) : 0.5 + FLOOR_H * liftUp(fr) + 0.5 * liftOut(fr));
    const n = 1000;
    const step = (1 + FLOOR_H) / n;
    for (let k = 0; k < n; k++) expect(pos((k + 1) / n) - pos(k / n), `pas ${k}`).toBeCloseTo(step, 6);
    expect(LIFT_QUAY).toBeCloseTo(0.5 / (1 + FLOOR_H), 9);
  });

  it("les traits des glissières courent dans le sens de la marche et se figent à l'arrêt", () => {
    const n = 3;
    for (const up of [true, false]) {
      const a = liftDash(0, n, 0.2, up, true);
      const b = liftDash(0, n, 0.25, up, true);
      expect(up ? b > a : b < a, up ? "montée" : "descente").toBe(true);
      // régulièrement espacés, toujours dans la course
      const hs = [0, 1, 2].map((k) => liftDash(k, n, 0.2, up, true)).sort((x, y) => x - y);
      for (const h of hs) expect(h >= 0 && h < 1).toBe(true);
      expect(hs[1] - hs[0]).toBeCloseTo(1 / n, 9);
      expect(hs[2] - hs[1]).toBeCloseTo(1 / n, 9);
      expect(liftDash(1, n, 0.2, up, false)).toBe(liftDash(1, n, 7.3, up, false));
    }
  });
});
