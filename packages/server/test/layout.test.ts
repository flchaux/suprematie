// Tracé des bases des IA : une amenée ne démarre pas contre un dépôt (elle en deviendrait la sortie).
import { describe, it, expect } from "vitest";
import type { Sim } from "@supreme/shared";
import { Planner, P_DEPOT } from "../src/bots/layout.ts";
import type { Ids } from "../src/bots/util.ts";

const W = 32;
const NET = 2; // réseau « direct au dépôt » du module 0

/** Plan vide avec un dépôt de module en (10..11, 10..11). */
function planner(): Planner {
  const p = new Planner({} as Sim, 0, {} as Ids, W, W);
  for (let y = 10; y < 12; y++) {
    for (let x = 10; x < 12; x++) {
      p.plan[p.idx(x, y)] = P_DEPOT;
      p.bnet[p.idx(x, y)] = NET;
    }
  }
  return p;
}
const path = (...tiles: [number, number][]) => tiles.map(([x, y]) => y * W + x);

describe("départ d'une amenée près d'un dépôt", () => {
  it("refuse un premier tapis qui longe une face du dépôt", () => {
    const p = planner();
    // posé au-dessus de la face nord, il part vers l'ouest : le dépôt est sur son côté
    expect(p.startLeaks(path([11, 9], [10, 9], [9, 9]), NET)).toBe(true);
    // posé contre la face est, il part vers le sud ou vers le nord
    expect(p.startLeaks(path([12, 11], [12, 12]), NET)).toBe(true);
    expect(p.startLeaks(path([12, 11], [12, 10]), NET)).toBe(true);
  });

  it("refuse un premier tapis qui part d'une face du dépôt", () => {
    const p = planner();
    expect(p.startLeaks(path([12, 10], [13, 10]), NET)).toBe(true);
    expect(p.startLeaks(path([9, 11], [8, 11]), NET)).toBe(true);
  });

  it("accepte un tapis qui entre dans le dépôt, ou qui ne le touche pas", () => {
    const p = planner();
    // une seule case, tournée vers le dépôt (sa direction vient de endDir)
    expect(p.endDir(9, 10, NET)).toBe(0);
    expect(p.startLeaks(path([9, 10]), NET)).toBe(false);
    // départ à une case de la face, puis vers le dépôt
    expect(p.startLeaks(path([13, 10], [12, 10]), NET)).toBe(false);
    // départ en diagonale d'un coin : aucune face touchée
    expect(p.startLeaks(path([12, 12], [13, 12]), NET)).toBe(false);
    expect(p.startLeaks([], NET)).toBe(false);
  });
});
