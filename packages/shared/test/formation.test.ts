// Formation orientée (clic droit glissé) : places, lignes, orientation et encodage de l'ordre.
import { describe, it, expect } from "vitest";
import { formationSlots, moveFormation, simAngle, O, TILE, type FormationUnit } from "../src/orders.ts";

const unit = (id: number, x: number, y: number, rank: number, radius = 128): FormationUnit => ({ id, x: x * TILE, y: y * TILE, radius, rank });

describe("formation orientée", () => {
  it("place chaque unité, centrée sur le point visé", () => {
    const units = Array.from({ length: 9 }, (_, i) => unit(i + 1, i, 0, 10));
    const slots = formationSlots(units, 100 * TILE, 100 * TILE, 0);
    expect(slots.map((s) => s.id).sort((a, b) => a - b)).toEqual(units.map((u) => u.id));
    const cx = slots.reduce((a, s) => a + s.x, 0) / slots.length;
    const cy = slots.reduce((a, s) => a + s.y, 0) / slots.length;
    expect(Math.abs(cx - 100 * TILE)).toBeLessThan(2 * TILE);
    expect(Math.abs(cy - 100 * TILE)).toBeLessThan(2 * TILE);
  });

  it("met les courtes portées devant, face à la direction choisie", () => {
    // vers +x : la première ligne a le plus grand x
    // 8 unités : deux lignes (5 + 3) ; les 5 de courte portée devant, les 3 artilleries derrière
    const units = Array.from({ length: 8 }, (_, i) => unit(i + 1, 0, i * 2, i < 3 ? 30 : 10));
    const slots = new Map(formationSlots(units, 50 * TILE, 50 * TILE, 0).map((s) => [s.id, s]));
    const xs = (ids: number[]) => ids.map((id) => slots.get(id)!.x);
    expect(Math.min(...xs([4, 5, 6, 7, 8]))).toBeGreaterThan(Math.max(...xs([1, 2, 3])));
  });

  it("garde l'ordre latéral des unités (pas de croisements dans une ligne)", () => {
    // face au nord (-y) : le côté droit est +x ; les unités de gauche restent à gauche
    const units = [unit(1, 10, 0, 10), unit(2, 0, 0, 10), unit(3, 5, 0, 10)];
    const slots = new Map(formationSlots(units, 50 * TILE, 50 * TILE, -Math.PI / 2).map((s) => [s.id, s]));
    expect(slots.get(2)!.x).toBeLessThan(slots.get(3)!.x);
    expect(slots.get(3)!.x).toBeLessThan(slots.get(1)!.x);
  });

  it("encode l'orientation dans l'ordre de déplacement (drapeau 4)", () => {
    const cmd = moveFormation([unit(7, 0, 0, 10), unit(8, 1, 0, 10)], 1000, 2000, Math.PI / 2, true);
    expect(cmd.slice(0, 6)).toEqual([O.MOVE, 1 | 4, 1000, 2000, 16384, 2]);
    expect(cmd.length).toBe(6 + 2 * 3);
    expect(simAngle(-Math.PI / 2)).toBe(49152);
  });
});
