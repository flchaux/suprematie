// Passerelles des Transhumants : paires de bâtiments qui se touchent par un côté, position et longueur de la jonction.
import { describe, expect, it } from "vitest";
import { junctions, Walkways, WALKWAYS_MAX, type WalkBuilding } from "../src/render/walkways.ts";

const b = (x: number, z: number, w: number, h: number, owner = 0): WalkBuilding => ({ x, z, w, h, owner });

describe("passerelles", () => {
  it("relie deux modules collés côte à côte, au milieu du côté commun", () => {
    const js = junctions([b(10, 10, 2, 2), b(12, 10, 2, 2)]);
    expect(js).toEqual([{ a: 0, b: 1, x: 12, z: 11, len: 2, axis: 0 }]);
  });

  it("relie un module posé dessous, le long de x", () => {
    const js = junctions([b(10, 10, 2, 2), b(10, 12, 2, 2)]);
    expect(js).toEqual([{ a: 0, b: 1, x: 11, z: 12, len: 2, axis: 1 }]);
  });

  it("centre la passerelle sur la partie commune d'un contact partiel", () => {
    // atelier 3 × 3 et soute 2 × 2 décalée d'une case : une case de côté en commun (z = 12)
    const js = junctions([b(10, 10, 3, 3), b(13, 12, 2, 2)]);
    expect(js).toEqual([{ a: 0, b: 1, x: 13, z: 12.5, len: 1, axis: 0 }]);
    // poteau 1 × 1 contre un module
    expect(junctions([b(10, 10, 2, 2), b(9, 11, 1, 1)])).toEqual([{ a: 1, b: 0, x: 10, z: 11.5, len: 1, axis: 0 }]);
  });

  it("ne relie pas deux modules qui ne se touchent que par un coin", () => {
    expect(junctions([b(10, 10, 2, 2), b(12, 12, 2, 2)])).toEqual([]);
    expect(junctions([b(10, 10, 2, 2), b(8, 12, 2, 2)])).toEqual([]);
  });

  it("ne relie pas les modules de deux joueurs, ni des modules écartés", () => {
    expect(junctions([b(10, 10, 2, 2, 0), b(12, 10, 2, 2, 1)])).toEqual([]);
    expect(junctions([b(10, 10, 2, 2), b(13, 10, 2, 2)])).toEqual([]);
  });

  it("donne chaque paire une fois, et une passerelle par voisin", () => {
    // soute au centre, quatre voisins
    const js = junctions([b(10, 10, 2, 2), b(12, 10, 2, 2), b(8, 10, 2, 2), b(10, 12, 2, 2), b(10, 8, 2, 2)]);
    expect(js.length).toBe(4);
    const pairs = js.map((j) => [Math.min(j.a, j.b), Math.max(j.a, j.b)].join("-")).sort();
    expect(pairs).toEqual(["0-1", "0-2", "0-3", "0-4"]);
  });

  it("prépare un maillage instancié vide, sans uv (peu de tampons de sommets)", () => {
    const w = new Walkways();
    expect(w.mesh.count).toBe(0);
    expect(w.mesh.instanceMatrix.count).toBe(WALKWAYS_MAX);
    expect(Object.keys(w.mesh.geometry.attributes).sort()).toEqual(["normal", "position"]);
  });
});
