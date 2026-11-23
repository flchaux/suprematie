// Cercles de portée : familles d'armes et contour de la réunion des cercles.
import { describe, it, expect } from "vitest";
import type { WeaponDef } from "@supreme/shared";
import { rangesOf, thin, unionOutline } from "../src/render/ranges.ts";

const w = (range: number, mask: number, minRange = 0): WeaponDef => ({ dmg: 1, range, cooldown: 1, proj: 0, aoe: 0, mask, salvo: 1, sustain: 0, minRange });

describe("portées", () => {
  it("sépare sol, air, sous-marins, zone morte et radar", () => {
    expect(rangesOf([w(22, 3), w(28, 8), w(34, 3, 6)], 40)).toEqual({ ground: 34, air: 28, min: 6, radar: 40 });
    expect(rangesOf([w(20, 6)], 0)).toEqual({ sub: 20 });
    // arme mixte : un seul contour ; bombe ou morsure : aucun
    expect(rangesOf([w(30, 11)], 0)).toEqual({ ground: 30 });
    expect(rangesOf([w(3, 3)], 0)).toEqual({});
  });
  it("ne garde que le contour de la réunion", () => {
    const one = unionOutline([{ x: 0, z: 0, r: 10 }], 96);
    expect(one.length / 4).toBe(96);
    // deux cercles qui se coupent : moins de deux contours entiers, aucun milieu de segment dans l'autre
    const pair = [{ x: 0, z: 0, r: 10 }, { x: 8, z: 0, r: 10 }];
    const segs = unionOutline(pair, 96);
    expect(segs.length / 4).toBeLessThan(2 * 96);
    for (let i = 0; i < segs.length; i += 4) {
      const mx = (segs[i] + segs[i + 2]) / 2;
      const mz = (segs[i + 1] + segs[i + 3]) / 2;
      expect(pair.filter((c) => Math.hypot(mx - c.x, mz - c.z) < c.r - 0.05).length).toBe(0);
    }
    // confondus ou contenus : un seul contour
    expect(unionOutline([{ x: 1, z: 1, r: 5 }, { x: 1, z: 1, r: 5 }], 48).length / 4).toBe(48);
    expect(unionOutline([{ x: 0, z: 0, r: 20 }, { x: 3, z: 0, r: 5 }], 48).length / 4).toBe(48);
  });
  it("ne laisse pas de trou entre des cercles presque confondus", () => {
    // quatre artilleries en colonne : le contour est une boucle fermée (chaque point a deux segments)
    const segs = unionOutline([0, 2.5, 5, 7.5].map((z) => ({ x: 0, z, r: 34 })));
    const ends = new Map<string, number>();
    for (let i = 0; i < segs.length; i += 2) {
      const k = `${Math.round(segs[i] * 50)},${Math.round(segs[i + 1] * 50)}`;
      ends.set(k, (ends.get(k) ?? 0) + 1);
    }
    expect([...ends.values()].every((n) => n === 2)).toBe(true);
  });
  it("confond les cercles trop nombreux", () => {
    const many = Array.from({ length: 900 }, (_, i) => ({ x: (i % 30) * 2, z: Math.floor(i / 30) * 2, r: 20 }));
    expect(thin(many, 72).length).toBeLessThanOrEqual(72);
    expect(thin(many.slice(0, 50), 72).length).toBe(50);
  });
});
