// Barres de progression des chantiers : décodage de l'image (avancement, dégâts, amélioration), taille
// selon le zoom, zone vue. Image réelle : la démo des chantiers (`?demo=chantiers`).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, parseFrame, BClass, BUILDING_WORDS, BUILD_FULL } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { BAR_MIN_PX, barInView, broodOf, pipLayout, siteBarOf, siteBarSize, tameOf, worldPerPixel } from "../src/render/siteBars.ts";

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
    expect(siteBarSize(2, 2, false, px).width / px).toBeGreaterThanOrEqual(12);
    // sans déborder sur le voisin : au plus la largeur de 2 cases pour un bâtiment de 2 × 2 vu à 200 cases (6 pixels la case)
    expect(siteBarSize(2, 2, false, worldPerPixel(200, 40, H)).width).toBeLessThanOrEqual(2.1);
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

describe("pastilles d'une couveuse", () => {
  it("démo : les portées qui couvent, jamais plus que la limite du niveau", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    expect(data.broodLevels?.map((l) => l.litters)).toEqual([3, 6, 12]);
    sim.init([1, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    sim.ponteDemo();
    let most = 0;
    for (let t = 0; t < 800; t++) {
      sim.step([]);
      if (t % 40) continue;
      const f = parseFrame(sim.render(0, 0, 512, 512, 2, 0, false));
      for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
        if (data.buildings[f.buf[o + 1] & 0xff].key !== "brood") continue;
        const b = broodOf(f.buf, o, data.broodLevels!);
        expect(b.max).toBe(3);
        expect(b.n).toBeLessThanOrEqual(3);
        most = Math.max(most, b.n);
        // la fiche dit la même chose
        const info = sim.infoBuilding(f.buf[o] >>> 0) as { brood: { max: number; litters: unknown[] } };
        expect([info.brood.litters.length, info.brood.max]).toEqual([b.n, b.max]);
      }
    }
    expect(most).toBe(3);
  });

  it("six par rangée, lisibles de loin sans déborder de la couveuse", () => {
    for (const d of [20, 60, 120, 250]) {
      const px = worldPerPixel(d, 40, 800);
      for (const max of [3, 6, 12]) {
        const p = pipLayout(max, px);
        expect(p.rows).toBe(max > 6 ? 2 : 1);
        expect(6 * p.step).toBeLessThanOrEqual(3.6 + 1e-9);
        expect(p.size).toBeLessThan(p.step);
      }
    }
  });
});

describe("barre d'un nid qu'une Reine apprivoise", () => {
  it("démo : charmé d'abord, puis l'avancement monte jusqu'à la greffe", async () => {
    const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
    const data = JSON.parse(sim.dataJson()) as GameData;
    sim.init([1, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    sim.tamingDemo();
    const seen: number[] = [];
    let owner = -1;
    for (let t = 0; t < 1400; t++) {
      sim.step([]);
      if (t % 20) continue;
      const f = parseFrame(sim.render(0, 0, 512, 512, 2, 0, false));
      for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
        if (data.buildings[f.buf[o + 1] & 0xff].key !== "nest") continue;
        const tame = tameOf(f.buf, o, true);
        if (tame) {
          expect(tame.tamer).toBe(0);
          seen.push(tame.progress);
        } else if (seen.length) owner = (f.buf[o + 1] >> 8) & 0xff;
      }
    }
    expect(seen[0]).toBe(0);
    expect(Math.max(...seen)).toBeGreaterThan(0.9);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(owner).toBe(0);
    expect(tameOf(Int32Array.from([1, 0, 0, 1, 1, 3, 500, 0]), 0, false)).toBeNull();
  });
});
