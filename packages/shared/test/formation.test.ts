// Formation orientée (clic droit glissé) : la disposition actuelle du groupe, tournée, et l'encodage de l'ordre.
import { describe, it, expect } from "vitest";
import { formationSlots, groupHeading, moveFormation, simAngle, O, TILE, type FormationUnit } from "../src/orders.ts";

const unit = (id: number, x: number, y: number, facing = 0): FormationUnit => ({ id, x: x * TILE, y: y * TILE, facing });

describe("formation orientée", () => {
  it("garde la disposition du groupe, centrée sur le point visé", () => {
    // L asymétrique, tourné vers l'est (+x) ; même direction demandée : simple translation
    const units = [unit(1, 10, 10), unit(2, 12, 10), unit(3, 14, 10), unit(4, 10, 12)];
    const slots = new Map(formationSlots(units, 100 * TILE, 50 * TILE, 0).map((s) => [s.id, s]));
    const dx = 100 * TILE - 11.5 * TILE;
    const dy = 50 * TILE - 10.5 * TILE;
    for (const u of units) {
      expect(Math.abs(slots.get(u.id)!.x - (u.x + dx))).toBeLessThanOrEqual(1);
      expect(Math.abs(slots.get(u.id)!.y - (u.y + dy))).toBeLessThanOrEqual(1);
    }
  });

  it("tourne la disposition pour que l'avant du groupe regarde dans la direction choisie", () => {
    // groupe tourné vers l'est ; le char 2 est devant (+x), le char 3 à droite (+y)
    const units = [unit(1, 10, 10), unit(2, 13, 10), unit(3, 10, 12)];
    // vers le sud (+y) : quart de tour horaire ; ce qui était devant (+x) passe au sud, la droite (+y) à l'ouest (-x)
    const slots = new Map(formationSlots(units, 50 * TILE, 50 * TILE, Math.PI / 2).map((s) => [s.id, s]));
    const a = slots.get(1)!;
    const b = slots.get(2)!;
    const c = slots.get(3)!;
    expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual(1);
    expect(b.y - a.y).toBeCloseTo(3 * TILE, -1);
    expect(c.x - a.x).toBeCloseTo(-2 * TILE, -1);
    expect(Math.abs(c.y - a.y)).toBeLessThanOrEqual(1);
  });

  it("prend la direction du but comme avant quand les unités regardent dans tous les sens", () => {
    const units = [unit(1, 0, 0, 0), unit(2, 2, 0, 16384), unit(3, 0, 2, 32768), unit(4, 2, 2, 49152)];
    expect(groupHeading(units, 100 * TILE, 1 * TILE)).toBeCloseTo(0, 1);
    expect(groupHeading([unit(1, 0, 0, 16384), unit(2, 2, 0, 16384)], 100 * TILE, 0)).toBeCloseTo(Math.PI / 2, 3);
  });

  it("resserre un groupe très étalé", () => {
    const units = [unit(1, 0, 0), unit(2, 200, 0)];
    const slots = formationSlots(units, 100 * TILE, 100 * TILE, 0);
    expect(Math.abs(slots[0].x - slots[1].x)).toBeLessThan(20 * TILE);
  });

  it("encode l'orientation dans l'ordre de déplacement (drapeau 4)", () => {
    const cmd = moveFormation([unit(7, 0, 0), unit(8, 1, 0)], 1000, 2000, Math.PI / 2, true);
    expect(cmd.slice(0, 6)).toEqual([O.MOVE, 1 | 4, 1000, 2000, 16384, 2]);
    expect(cmd.length).toBe(6 + 2 * 3);
    expect(simAngle(-Math.PI / 2)).toBe(49152);
  });
});
