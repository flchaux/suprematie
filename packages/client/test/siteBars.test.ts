// Barres de progression des chantiers : décodage de l'image (avancement, dégâts, amélioration), taille
// selon le zoom, zone vue. Image réelle : la démo des chantiers (`?demo=chantiers`).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, parseFrame, BClass, BUILDING_WORDS, BUILD_FULL } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { BAR_MIN_PX, barInView, siteBarOf, siteBarSize, worldPerPixel } from "../src/render/siteBars.ts";

/** Mots d'un bâtiment : points de vie, avancement du chantier, mot 7 (amélioration ou ligne d'un tapis). */
const words = (hp: number, build: number, w7 = 0) => Int32Array.from([1, 0, 0, hp, build, 0, 0, w7]);

describe("barre d'un bâtiment", () => {
  it("rien pour un bâtiment terminé, sans amélioration", () => {
    expect(siteBarOf(words(500, BUILD_FULL), 0, 500, false)).toBeNull();
    // un tapis terminé : le mot 7 est sa ligne, pas une amélioration
    expect(siteBarOf(words(50, BUILD_FULL, 37), 0, 50, true)).toBeNull();
  });

  it("chantier : avancement, points de vie montés avec lui", () => {
    const sb = siteBarOf(words(250, BUILD_FULL / 2), 0, 500, false)!;
    expect(sb.upgrade).toBe(false);
    expect(sb.progress).toBeCloseTo(0.5);
    expect(sb.done).toBeCloseTo(0.5);
    expect(sb.lost).toBeCloseTo(0);
  });

  it("chantier endommagé : la part perdue est l'avancement non couvert par les points de vie", () => {
    const sb = siteBarOf(words(100, (BUILD_FULL * 3) / 4), 0, 500, false)!;
    expect(sb.progress).toBeCloseTo(0.75);
    expect(sb.done).toBeCloseTo(0.2);
    expect(sb.lost).toBeCloseTo(0.55);
  });

  it("chantier de tapis : barre aussi", () => {
    const sb = siteBarOf(words(5, BUILD_FULL / 4, 12), 0, 50, true)!;
    expect(sb.progress).toBeCloseTo(0.25);
  });

  it("amélioration en cours d'un bâtiment terminé : barre ambrée, en millièmes", () => {
    const sb = siteBarOf(words(500, BUILD_FULL, 400), 0, 500, false)!;
    expect(sb.upgrade).toBe(true);
    expect(sb.progress).toBeCloseTo(0.4);
    expect(sb.lost).toBe(0);
  });
});

describe("taille des barres selon le zoom", () => {
  const H = 900;
  it("de près, la barre garde sa taille dans le monde", () => {
    const px = worldPerPixel(20, 40, H);
    const s = siteBarSize(3, 3, false, px);
    expect(s.width).toBeCloseTo(2.4);
    expect(s.thick).toBeCloseTo(0.3);
    expect(siteBarSize(1, 1, true, px).width).toBeCloseTo(0.86);
  });

  it("de loin, elle garde au moins quelques pixels d'épaisseur à l'écran", () => {
    const px = worldPerPixel(250, 40, H);
    for (const small of [false, true]) {
      const s = siteBarSize(small ? 1 : 2, small ? 1 : 2, small, px);
      // une petite pièce s'arrête à 70 % de sa case
      expect(s.thick).toBeGreaterThanOrEqual(Math.min(BAR_MIN_PX * px, small ? 0.7 : Infinity) - 1e-9);
    }
    // un bâtiment : la barre s'allonge pour rester lisible
    expect(siteBarSize(2, 2, false, px).width / px).toBeGreaterThanOrEqual(20);
  });

  it("une petite pièce garde sa barre dans sa case (barres d'une file séparées)", () => {
    for (const d of [10, 100, 250, 400]) {
      const s = siteBarSize(1, 1, true, worldPerPixel(d, 40, H));
      expect(s.width).toBeLessThan(1);
      expect(s.thick).toBeLessThanOrEqual(0.7);
    }
  });

  it("zone vue, avec une marge", () => {
    const v = [10, 10, 50, 40] as const;
    expect(barInView(30, 20, v)).toBe(true);
    expect(barInView(51, 41, v)).toBe(true);
    expect(barInView(60, 20, v)).toBe(false);
    expect(barInView(30, 5, v)).toBe(false);
  });
});

describe("démo des chantiers", () => {
  it("chaque chantier de l'image a sa barre, tapis compris ; l'avancement croît le long d'une file", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    sim.init([1, 1024, 0, 8, 0, 0, 100, 100, 1, 0, 100, 100, 2, 0, 100, 100, 3, 0, 100, 100, 4, 0, 100, 100, 5, 0, 100, 100, 6, 0, 100, 100, 7, 0, 100, 100]);
    sim.chantiersDemo();
    sim.step([]);
    const f = parseFrame(sim.render(0, 0, 512, 512, 2, 0, false));
    const byKey = new Map<string, number[]>();
    const belts: [number, number][] = [];
    let damaged = 0;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const def = data.buildings[f.buf[o + 1] & 0xff];
      const sb = siteBarOf(f.buf, o, def.hp, def.cls === BClass.Belt);
      if (!sb) continue;
      expect(sb.upgrade).toBe(false);
      expect(sb.progress).toBeGreaterThan(0);
      expect(sb.progress).toBeLessThan(1);
      if (sb.lost > 0.1) damaged++;
      byKey.set(def.key, [...(byKey.get(def.key) ?? []), sb.progress]);
      if (def.key === "belt1") belts.push([f.buf[o + 2] & 0xffff, sb.progress]);
    }
    for (const k of ["belt1", "belt2", "belt3", "rail", "splitter", "inserter", "wall", "assembler1", "root", "thorn"].filter((k) => data.buildings.some((b) => b.key === k))) {
      expect(byKey.get(k)?.length ?? 0, k).toBeGreaterThan(0);
    }
    expect(damaged).toBe(1);
    belts.sort((a, b) => a[0] - b[0]);
    expect(belts.length).toBe(30);
    for (let i = 1; i < belts.length; i++) expect(belts[i][1]).toBeGreaterThan(belts[i - 1][1]);
  });
});
