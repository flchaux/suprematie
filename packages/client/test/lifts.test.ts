// Ascenseurs de tapis : modèles (mât, quais, plateau) et trajet des objets.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, BClass } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { buildModel } from "../src/models/generator.ts";
import { ASCENSEUR_MAT, BUILDING_MODELS, NIVEAU_TAPIS } from "../../../assets/models/buildings.ts";
import { FLOOR_H, LIFT_QUAY, liftDash, liftOut, liftPad, liftUp } from "../src/render/liftAnim.ts";

describe("modèles de l'ascenseur de tapis", () => {
  it("un quai par type de tapis de la simulation", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    const belts = data.buildings.filter((b) => b.cls === BClass.Belt).map((b) => b.key);
    expect(belts.length).toBeGreaterThanOrEqual(4);
    expect(belts.filter((k) => !BUILDING_MODELS[k + "_quai"])).toEqual([]);
  });

  it("le mât est fin, sur le côté du tapis, et relie deux paliers distants d'un niveau", () => {
    expect(FLOOR_H).toBe(NIVEAU_TAPIS);
    const mast = buildModel(BUILDING_MODELS.ascenseur);
    const belt = buildModel(BUILDING_MODELS.belt1);
    expect(mast.box.min.y).toBeGreaterThanOrEqual(0);
    expect(mast.box.min.y).toBeLessThan(0.05);
    // il dépasse le palier haut, de peu
    expect(mast.box.max.y).toBeGreaterThan(FLOOR_H + 0.2);
    expect(mast.box.max.y).toBeLessThan(FLOOR_H + 0.5);
    // hors du tapis, dans la case, console comprise : à peine plus d'un dixième de case
    expect(mast.box.min.x).toBeGreaterThanOrEqual(belt.box.max.x);
    expect(mast.box.max.x).toBeLessThan(0.5);
    expect(mast.box.max.x - mast.box.min.x).toBeLessThanOrEqual(0.12);
    expect((mast.box.min.x + mast.box.max.x) / 2).toBeCloseTo(ASCENSEUR_MAT, 1);
    // symétrique d'avant en arrière : le jeu le retourne pour dresser le mât de l'autre côté
    expect(mast.box.min.z).toBeCloseTo(-mast.box.max.z, 5);
    expect(mast.box.max.z).toBeLessThanOrEqual(0.25);
    expect(mast.triangles).toBeLessThanOrEqual(80);
  });

  it("les quais couvrent la case hors du quart central, le plateau tient dans ce quart", () => {
    const belt = buildModel(BUILDING_MODELS.belt1);
    for (const key of ["belt1_quai", "belt2_quai", "belt3_quai", "collector_quai"]) {
      const quay = buildModel(BUILDING_MODELS[key]);
      expect(quay.box.min.z, key).toBeCloseTo(-0.5, 5);
      expect(quay.box.max.z, key).toBeCloseTo(-0.125, 5);
      // même largeur et même hauteur de rebord que le tapis qu'il prolonge
      expect(quay.box.max.x - quay.box.min.x, key).toBeCloseTo(belt.box.max.x - belt.box.min.x, 5);
      expect(quay.box.max.y, key).toBeLessThanOrEqual(belt.box.max.y + 1e-6);
      expect(quay.triangles, key).toBeLessThanOrEqual(90);
    }
    const tray = buildModel(BUILDING_MODELS.ascenseur_plateau);
    expect(tray.box.min.z).toBeCloseTo(-0.125, 5);
    expect(tray.box.max.z).toBeCloseTo(0.125, 5);
    // un quart de case de l'autre côté aussi : un quai venu du côté opposé au mât s'arrête au même endroit
    expect(tray.box.min.x).toBeCloseTo(-0.125, 5);
    // dessus du plateau à y = 0 (le jeu le pose à la hauteur de la bande du tapis), chariot sur le mât
    expect(tray.box.max.y).toBeLessThanOrEqual(0.03);
    expect(tray.box.max.x).toBeGreaterThan(ASCENSEUR_MAT);
    expect(tray.box.max.x).toBeLessThan(0.5);
  });
});

describe("trajet d'un objet dans l'ascenseur", () => {
  it("entre et sort au bord de la case, à son niveau de départ puis d'arrivée", () => {
    expect(liftOut(0)).toBe(1);
    expect(liftUp(0)).toBe(0);
    expect(liftOut(1)).toBe(1);
    expect(liftUp(1)).toBe(1);
    // à mi-course : au milieu de la case, à mi-hauteur
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

  it("monte dans le quart central de la traversée, à vitesse constante", () => {
    expect(LIFT_QUAY).toBe(0.375);
    expect(liftUp(0.375)).toBe(0);
    expect(liftUp(0.625)).toBe(1);
    expect(liftUp(0.4375)).toBeCloseTo(0.25, 9);
    expect(liftUp(0.5625)).toBeCloseTo(0.75, 9);
    // sur les quais : du bord au centre en 3/8 de la traversée, à vitesse constante
    expect(liftOut(0.1875)).toBeCloseTo(0.5, 9);
    expect(liftOut(0.375)).toBe(0);
    expect(liftOut(0.625)).toBe(0);
    expect(liftOut(0.8125)).toBeCloseTo(0.5, 9);
  });

  it("le plateau ne rentre qu'une fois l'objet sorti, et celui du palier d'entrée se déploie d'autant", () => {
    // l'objet (0,24 case) déborde encore sur le plateau (0,25 case) tant que son centre est à moins de 0,245 case du milieu
    for (let k = 0; k <= 100; k++) {
      const out = k / 100;
      const g = liftPad(out);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      if (out * 0.5 <= 0.245) expect(g, `distance ${out}`).toBe(1);
      if (k > 0) expect(g).toBeLessThanOrEqual(liftPad((k - 1) / 100));
    }
    // rentré avant que l'objet quitte la case
    expect(liftPad(0.75)).toBe(0);
    expect(liftPad(1)).toBe(0);
  });

  it("les anneaux du mât courent dans le sens de la marche et se figent à l'arrêt", () => {
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
