// Formations : encodage des ordres et aperçu (les places sont calculées par la simulation, sim/src/formation.rs).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { moveFormation, moveQueuedFormation, simAngle, pack, O, TILE } from "../src/orders.ts";
import { parseBotDump } from "../src/render.ts";
import { Sim } from "../src/sim.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));

describe("formation orientée (clic droit glissé)", () => {
  it("encode l'angle et les drapeaux 4 et 8 ; chaque unité porte le but du groupe", () => {
    const cmd = moveFormation([7, 8], 1000, 2000, Math.PI / 2, true);
    expect(cmd).toEqual([O.MOVE, 1 | 4 | 8, 1000, 2000, 16384, 2, 7, 1000, 2000, 8, 1000, 2000]);
    expect(simAngle(-Math.PI / 2)).toBe(49152);
  });

  it("encode la formation en file (drapeaux 1 et 8)", () => {
    expect(moveQueuedFormation([7], 10, 20)).toEqual([O.MOVE, 1 | 8, 10, 20, 1, 7, 10, 20]);
  });
});

describe("aperçu de formation", () => {
  it("donne une place par unité, celles que l'ordre donne ensuite", async () => {
    const sim = await Sim.load(wasm);
    sim.formationDemo();
    const ids = parseBotDump(sim.botDump()).units.filter((u) => u.owner === 0).map((u) => u.id);
    expect(ids.length).toBeGreaterThan(20);
    const gx = 200 * TILE;
    const gy = 200 * TILE;
    const shown = sim.formationPreview([0, gx, gy, 16384, 0, ...ids]);
    expect(shown.length).toBe(3 * ids.length);
    const out: number[] = [];
    pack(0, moveFormation(ids, gx, gy, Math.PI / 2), out);
    sim.step(out);
    // file d'ordres d'une unité : id, x, y, n, puis n fois (code, x, y) ; le premier est le déplacement
    const orders = sim.unitOrders(ids);
    const end = new Map<number, [number, number]>();
    for (let i = 0; i < orders.length; i += 4 + 3 * orders[i + 3]) end.set(orders[i] >>> 0, [orders[i + 5], orders[i + 6]]);
    for (let i = 0; i < shown.length; i += 3) expect(end.get(shown[i] >>> 0)).toEqual([shown[i + 1], shown[i + 2]]);
  });
});
