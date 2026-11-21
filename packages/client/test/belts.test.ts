// Voisins « tapis » côté client : un répartiteur compte comme un tapis qui débouche sur ses sorties
// (même règle que sim/src/belts.rs, belt_shape ; test Rust splitter_outputs_shape_neighbour_belts).
import { describe, it, expect } from "vitest";
import { splitterOuts, beltShape, sideFeeds, autoBeltDir, lockAxis, joinSegment, lineFloors, type BeltNeighbours, type LineCell } from "../src/game/belts.ts";

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

describe("tracé d'une file", () => {
  const A = { x: 10, y: 10 };
  it("le sens de l'angle suit le geste, pas la diagonale", () => {
    // le curseur part vers l'est : premier tronçon horizontal, même quand il descend ensuite plus loin
    let axis = lockAxis(A, { x: 11, y: 10 }, null);
    expect(axis).toBe("h");
    axis = lockAxis(A, { x: 12, y: 20 }, axis);
    expect(axis).toBe("h");
    // retour sur le départ : le choix est remis à zéro, puis le curseur part vers le sud
    axis = lockAxis(A, A, axis);
    expect(axis).toBe(null);
    axis = lockAxis(A, { x: 10, y: 11 }, axis);
    expect(lockAxis(A, { x: 30, y: 12 }, axis)).toBe("v");
    // saut en diagonale (curseur rapide) : l'axe du plus grand écart
    expect(lockAxis(A, { x: 13, y: 11 }, null)).toBe("h");
    expect(lockAxis(A, { x: 11, y: 13 }, null)).toBe("v");
  });

  const row = (x0: number, x1: number, y: number, dir: number): LineCell[] => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, dir }));

  it("la suite d'une file part de sa dernière case figée, qui tourne avec elle", () => {
    const frozen = row(10, 13, 10, 0);
    // la suite descend vers le sud depuis (13, 10)
    const seg = [{ x: 13, y: 10, dir: 1 }, { x: 13, y: 11, dir: 1 }, { x: 13, y: 12, dir: 1 }];
    const cells = joinSegment(frozen, seg);
    expect(cells.map((c) => [c.x, c.y, c.dir])).toEqual([[10, 10, 0], [11, 10, 0], [12, 10, 0], [13, 10, 1], [13, 11, 1], [13, 12, 1]]);
    // sans suite : la dernière case figée garde sa direction
    expect(joinSegment(frozen, [{ x: 13, y: 10, dir: 1 }]).at(-1)!.dir).toBe(0);
    expect(frozen.at(-1)!.dir).toBe(0);
  });

  const all = (n: number) => [0, 1, 2].map(() => Array.from({ length: n }, () => true));
  const none = (n: number) => Array.from({ length: n }, () => false);

  it("la molette ne monte que la suite de la file", () => {
    // 4 cases figées au sol, puis 3 cases à l'étage 1, dans le même sens : ascenseur entre la 4e et la 5e
    const cells = row(10, 16, 10, 0);
    const r = lineFloors(cells, 4, [0, 0, 0, 0], 1, all(7), none(7));
    expect(r.floors).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(r.ok.every((x) => x)).toBe(true);
    // et redescendre : la partie à l'étage 1 reste en place
    const down = lineFloors(cells, 5, [0, 0, 0, 0, 1], 0, all(7), none(7));
    expect(down.floors).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it("changement de niveau dans un angle : la case figée garde le sien", () => {
    // figé : (10..13, 10) vers l'est au sol, la dernière tourne vers le sud ; la suite, à l'étage 1, tourne
    // aussitôt vers l'ouest : l'ascenseur ne peut pas être dans l'angle, la première case de la suite reste au sol
    const cells = [...row(10, 12, 10, 0), { x: 13, y: 10, dir: 1 }, { x: 13, y: 11, dir: 2 }, { x: 12, y: 11, dir: 2 }, { x: 11, y: 11, dir: 2 }];
    const r = lineFloors(cells, 4, [0, 0, 0, 0], 1, all(7), none(7));
    expect(r.floors).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });

  it("le tronçon en cours monte seul au-dessus d'un obstacle, pas la partie figée", () => {
    const cells = row(10, 16, 10, 0);
    const at = all(7);
    // obstacle au sol en case 1 (figée) et en case 5 (suite)
    at[0][1] = false;
    at[0][5] = false;
    const r = lineFloors(cells, 3, [0, 0, 0], 0, at, none(7));
    expect(r.floors).toEqual([0, 0, 0, 0, 0, 1, 0]);
    expect(r.ok).toEqual([true, false, true, true, true, true, true]);
    // un de nos tapis au sol croisé par la suite : on passe au-dessus
    const crossing = none(7);
    crossing[4] = true;
    expect(lineFloors(cells, 3, [0, 0, 0], 0, all(7), crossing).floors).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it("une case posée seule reste au niveau choisi", () => {
    const at = all(1);
    at[0][0] = false;
    const r = lineFloors([{ x: 1, y: 1, dir: 0 }], 0, [], 0, at, none(1));
    expect(r.floors).toEqual([0]);
    expect(r.ok).toEqual([false]);
  });
});
