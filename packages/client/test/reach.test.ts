// Couleur des coûts : disponible à portée du lieu (réseau logistique), pas le stock de tout le joueur.
import { describe, it, expect } from "vitest";
import { canPay, costShort, shortCells } from "../src/game/reach.ts";

const IRON = 7;
const GEAR = 9;
const have = Array.from({ length: 12 }, () => 0);
have[IRON] = 25;
have[GEAR] = 4;

describe("couleur des coûts", () => {
  it("rouge seulement pour l'objet qui manque à portée", () => {
    expect(costShort(have, IRON, 20)).toBe(false);
    expect(costShort(have, GEAR, 5)).toBe(true);
    expect(costShort(have, 11, 1)).toBe(true);
  });
  it("disponible inconnu : rien n'est rouge", () => {
    expect(costShort(null, IRON, 1000)).toBe(false);
    expect(canPay(null, [[IRON, 1000]])).toBe(true);
  });
  it("coût entier, plusieurs fois", () => {
    expect(canPay(have, [[IRON, 10], [GEAR, 2]])).toBe(true);
    expect(canPay(have, [[IRON, 10], [GEAR, 2]], 2)).toBe(true);
    expect(canPay(have, [[IRON, 10], [GEAR, 2]], 3)).toBe(false);
  });
  it("file de pose : les emplacements au-delà du disponible cumulé sont marqués, les cases impossibles jamais", () => {
    const cost: [number, number][] = [[IRON, 10]];
    expect(shortCells(have, cost, [true, false, true, true])).toEqual([false, false, false, true]);
    expect(shortCells(null, cost, [true, true, true])).toEqual([false, false, false]);
  });
});
