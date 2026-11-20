// Voisins « tapis » côté client : un répartiteur compte comme un tapis qui débouche sur ses sorties
// (même règle que sim/src/belts.rs, belt_shape ; test Rust splitter_outputs_shape_neighbour_belts).
import { describe, it, expect } from "vitest";
import { splitterOuts, beltShape, sideFeeds, autoBeltDir, type BeltNeighbours } from "../src/game/belts.ts";

const key = (x: number, y: number) => `${x},${y}`;
function around(belts: [number, number, number][], splitters: [number, number, number, number][]): BeltNeighbours {
  const b = new Map(belts.map(([x, y, d]) => [key(x, y), d]));
  const s = new Map(splitters.map(([x, y, d, split]) => [key(x, y), splitterOuts(d, split)]));
  return { belt: (x, y) => b.get(key(x, y)), splitter: (x, y) => s.get(key(x, y)) ?? 0 };
}

describe("répartiteur compté comme un tapis", () => {
  // répartiteur tourné vers l'est (direction 0) en (10, 10)
  it("sorties selon le mode", () => {
    expect(splitterOuts(0, 0)).toBe(0b1011); // nord, est, sud
    expect(splitterOuts(0, 1)).toBe(0b1001); // nord (gauche), est
    expect(splitterOuts(0, 2)).toBe(0b0011); // est, sud (droite)
    expect(splitterOuts(1, 0)).toBe(0b0111); // tourné vers le sud : est, sud, ouest
  });

  it("un tapis en travers d'une sortie devient un virage, celui de l'avant reste droit", () => {
    const n = around([], [[10, 10, 0, 0]]);
    expect(beltShape(10, 9, 0, n)).toBe(1); // au nord, vers l'est : alimenté par le sud (côté 0 + 1)
    expect(beltShape(10, 11, 0, n)).toBe(2); // au sud, vers l'est : alimenté par le nord (côté 0 + 3)
    expect(beltShape(11, 10, 0, n)).toBe(0); // devant, tout droit
    expect(beltShape(11, 10, 1, n)).toBe(1); // devant, vers le sud : alimenté par l'ouest (côté 1 + 1)
  });

  it("une sortie coupée par le mode ne compte plus", () => {
    expect(beltShape(10, 11, 0, around([], [[10, 10, 0, 1]]))).toBe(0);
    expect(beltShape(10, 9, 0, around([], [[10, 10, 0, 2]]))).toBe(0);
  });

  it("l'entrée ne change pas : le tapis qui débouche à l'arrière garde sa forme", () => {
    // tapis en (9, 10) vers l'est, alimenté par un tapis au nord qui descend
    expect(beltShape(9, 10, 0, around([[9, 9, 1]], [[10, 10, 0, 0]]))).toBe(2);
  });

  it("jonction en T : un tapis droit rejoint par une sortie de répartiteur", () => {
    // tapis vers l'est en (10, 11), alimenté par derrière, avec le répartiteur au nord
    const n = around([[9, 11, 0]], [[10, 10, 0, 0]]);
    expect(beltShape(10, 11, 0, n)).toBe(0);
    expect(sideFeeds(10, 11, 0, n)).toBe(2);
  });

  it("orientation automatique : prolonger une sortie, alimenter l'arrière", () => {
    const n = around([], [[10, 10, 0, 0]]);
    const dirAt = (x: number, y: number) => (x === 10 && y === 10 ? 0 : undefined);
    expect(autoBeltDir(10, 9, n, dirAt, 2)).toBe(3); // sortie gauche : vers le nord
    expect(autoBeltDir(11, 10, n, dirAt, 2)).toBe(0); // sortie avant : vers l'est
    expect(autoBeltDir(9, 10, n, dirAt, 3)).toBe(0); // derrière : vers le répartiteur
    expect(autoBeltDir(10, 11, around([], [[10, 10, 0, 1]]), dirAt, 2)).toBe(2); // sortie coupée : direction par défaut
  });
});
