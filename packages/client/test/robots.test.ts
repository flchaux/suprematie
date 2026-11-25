// Robots des Transhumants : frappe et échasses des modèles, et équipements visibles (chaque choix d'une unité de combat a
// ses pièces sur le modèle).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { buildModel, parseCond, parseStrike, strikePhase } from "../src/models/generator.ts";
import { UNIT_MODELS } from "../../../assets/models/units.ts";

const data = async (): Promise<GameData> => JSON.parse((await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)))).dataJson()) as GameData;

describe("frappe", () => {
  it("lit l'axe et l'angle d'un pivot", () => {
    expect(parseStrike("coup|x,-60#bras")).toEqual({ axis: "x", rad: -Math.PI / 3 });
    expect(parseStrike("tourelle")).toBeNull();
  });
  it("part vite, revient plus lentement, et finit au repos", () => {
    const T = 1;
    expect([strikePhase(-0.1, T), strikePhase(T, T), strikePhase(3, T)]).toEqual([0, 0, 0]);
    expect(strikePhase(0.28, T)).toBeCloseTo(1);
    expect(strikePhase(0.1, T)).toBeGreaterThan(strikePhase(0.9, T));
  });
});

describe("équipements visibles", () => {
  it("chaque choix d'une unité de combat a ses pièces sur le modèle", async () => {
    const d = await data();
    const kinds = new Set(d.mods.filter((m, i) => i > 0 && m.host >= 0 && d.units[m.host].deploys < 0 && !["ark", "t_cart"].includes(d.units[m.host].key)).map((m) => m.host));
    expect([...kinds].map((k) => d.units[k].key)).toEqual(expect.arrayContaining(["mastiff", "shepherd"]));
    for (const k of kinds) {
      const u = d.units[k];
      const keys = buildModel(UNIT_MODELS[u.key]).pivots.flatMap((p) => parseCond(p.name)?.all.filter((t) => t.on).flatMap((t) => t.keys) ?? []);
      for (const m of d.mods.filter((m, i) => i > 0 && m.host === k)) expect(keys, `${u.key} ${m.key}`).toContain(m.key);
    }
  });
  it("le Berger est rehaussé par ses échasses, dont les pièces descendent d'autant", () => {
    const b = buildModel(UNIT_MODELS.shepherd);
    const [key, h] = b.lift![0];
    expect(key).toBe("shepherd_stilts");
    const low = Math.min(...b.pivots.filter((p) => parseCond(p.name)?.all.some((t) => t.keys.includes(key))).map((p) => {
      p.geometry.computeBoundingBox();
      return p.geometry.boundingBox!.min.y + p.origin.y;
    }));
    expect(low).toBeCloseTo(-h, 1);
  });
});
