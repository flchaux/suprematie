// Rangée de machines posée en glissant.
import { describe, it, expect } from "vitest";
import { BClass } from "@supreme/shared";
import { isMachine, machineRow } from "../src/game/machineRow.ts";

describe("rangée de machines", () => {
  it("concerne les machines qui se jumellent", () => {
    expect(isMachine(BClass.Crafter)).toBe(true);
    expect(isMachine(BClass.Lab)).toBe(true);
    expect(isMachine(BClass.Factory)).toBe(true);
    expect(isMachine(BClass.Belt)).toBe(false);
  });
  it("colle les emprises le long de l'axe dominant", () => {
    const sq = { w: 2, h: 2 };
    expect(machineRow({ x: 10, y: 10 }, { x: 10, y: 10 }, sq, 0)).toEqual([{ x: 10, y: 10, dir: 0 }]);
    expect(machineRow({ x: 10, y: 10 }, { x: 15, y: 11 }, sq, 1).map((c) => c.x)).toEqual([10, 12, 14, 16]);
    expect(machineRow({ x: 10, y: 10 }, { x: 9, y: 4 }, sq, 0).map((c) => [c.x, c.y])).toEqual([[10, 10], [10, 8], [10, 6], [10, 4]]);
  });
  it("suit l'emprise tournée d'une machine non carrée", () => {
    const r = { w: 3, h: 2 };
    expect(machineRow({ x: 0, y: 0 }, { x: 6, y: 0 }, r, 0).map((c) => c.x)).toEqual([0, 3, 6]);
    expect(machineRow({ x: 0, y: 0 }, { x: 6, y: 0 }, r, 1).map((c) => c.x)).toEqual([0, 2, 4, 6]);
  });
});
