// Synthèse des sons de combat : chaque arme du jeu et chaque classe d'explosion donne un son fini,
// audible, borné, reproductible, et dont les variantes diffèrent.
import { describe, expect, it } from "vitest";
import { boomClass, BOOM_MIX, loudness, outdoorImpulse, renderExplosion, renderOrbital, renderShot, shotMix, shotSpec, specKey, type ShotSpec } from "../src/audio/synth.ts";
import data from "../../../tools/viewer/data.json";

const SR = 24000; // moitié de la cadence réelle : les tests restent rapides
const weapons = data.weapons as { proj: number; dmg: number; aoe: number; cooldown: number; sustain: number }[];
const specs = new Map<string, ShotSpec>();
for (const w of weapons) specs.set(specKey(shotSpec(w)), shotSpec(w));

function check(x: Float32Array, minDur: number, maxDur: number): void {
  expect(x.length).toBeGreaterThan(minDur * SR);
  expect(x.length).toBeLessThan(maxDur * SR);
  let peak = 0, bad = 0;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) bad++;
    peak = Math.max(peak, Math.abs(x[i]));
  }
  expect(bad).toBe(0);
  // crête ramenée à 0,97, fin fondue
  expect(peak).toBeGreaterThan(0.9);
  expect(peak).toBeLessThanOrEqual(1);
  expect(Math.abs(x[x.length - 1])).toBeLessThan(0.01);
  expect(loudness(x, SR)).toBeGreaterThan(0.03);
}

describe("synthèse des sons de combat", () => {
  it("donne un son à chaque arme du jeu", () => {
    expect(specs.size).toBeGreaterThan(25);
    for (const s of specs.values()) {
      const x = renderShot(s, 0, SR);
      // un rayon prolongé dure au moins le temps du rayon
      check(x, s.sustain > 0 ? s.sustain : 0.15, s.sustain + 4);
      const m = shotMix(s);
      expect(m.variants).toBeGreaterThan(0);
      expect(m.target).toBeLessThan(-15);
    }
  });

  it("est reproductible, et ses variantes diffèrent", () => {
    const s = shotSpec(weapons[2]);
    const a = renderShot(s, 0, SR);
    const b = renderShot(s, 0, SR);
    const c = renderShot(s, 1, SR);
    expect(Array.from(a)).toEqual(Array.from(b));
    let diff = 0;
    for (let i = 0; i < Math.min(a.length, c.length); i++) diff += Math.abs(a[i] - c[i]);
    expect(diff).toBeGreaterThan(1);
  });

  it("donne une explosion à chaque classe, de plus en plus longue", () => {
    let last = 0;
    for (let cls = 0; cls < BOOM_MIX.length; cls++) {
      const x = renderExplosion(cls, 0, SR);
      check(x, 0.1, 9);
      expect(x.length).toBeGreaterThan(last);
      last = x.length;
    }
    check(renderOrbital(0, SR), 1.5, 4);
  });

  it("classe les explosions par rayon et par type", () => {
    expect(boomClass(0.25, 0)).toBe(0);
    expect(boomClass(1, 0)).toBe(1);
    expect(boomClass(2, 0)).toBe(2);
    expect(boomClass(3.5, 1)).toBe(3);
    expect(boomClass(6, 1)).toBe(4);
    expect(boomClass(6, 2)).toBe(5);
    expect(boomClass(25, 3)).toBe(6);
  });

  it("donne une réponse de terrain stéréo d'énergie 1 par canal", () => {
    const [l, r] = outdoorImpulse(SR);
    let e = 0, same = 0;
    for (let i = 0; i < l.length; i++) {
      e += l[i] * l[i] + r[i] * r[i];
      if (l[i] === r[i]) same++;
    }
    expect(e / 2).toBeCloseTo(1, 2);
    // les deux canaux sont décorrélés (sauf le silence du début)
    expect(same).toBeLessThan(l.length * 0.1);
  });
});
