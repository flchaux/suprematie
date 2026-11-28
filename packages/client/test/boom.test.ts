// Volume des explosions : une base, plus la puissance fois un coefficient, plafonné.
import { describe, it, expect } from "vitest";
import { boomLoudness } from "../src/audio/sound.ts";

describe("volume d'une explosion", () => {
  it("croît avec la puissance, sans dépasser le plafond", () => {
    expect(boomLoudness(0)).toBeCloseTo(0.55);
    expect(boomLoudness(15)).toBeLessThan(0.6);
    expect(boomLoudness(400)).toBeCloseTo(0.99, 2);
    expect(boomLoudness(120)).toBeGreaterThan(boomLoudness(15));
    expect(boomLoudness(20000)).toBe(1.3);
    expect(boomLoudness(-5)).toBeCloseTo(0.55);
  });
});
