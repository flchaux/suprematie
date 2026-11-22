// Gisements : tache de minerai sans bord net, amas de roches stable, roches hautes cachées sous un bâtiment.
import { describe, expect, it } from "vitest";
import * as THREE from "three/webgpu";
import { Deposits, depositMask } from "../src/render/deposits.ts";
import type { MapData } from "../src/render/terrain.ts";

const W = 64;
const map: MapData = {
  w: W,
  h: W,
  waterLevel: 0,
  heights: new Uint8Array(W * W).fill(150),
  starts: [],
  spots: [
    { kind: 1, x: 10, y: 10, purity: 100 },
    { kind: 2, x: 30, y: 12, purity: 200 },
    { kind: 5, x: 40, y: 40, purity: 100 },
    { kind: 250, x: 20, y: 44, purity: 50 },
  ],
};

describe("gisements", () => {
  it("pose une tache de minerai qui s'efface peu à peu, sans marche d'une case à l'autre", () => {
    const d = depositMask(map).image.data as Uint8Array;
    const a = (x: number, z: number) => d[(z * W + x) * 4 + 3];
    // fort au cœur, nul à 6 cases
    expect(a(11, 11)).toBeGreaterThan(190);
    expect(a(17, 11)).toBe(0);
    expect(a(11, 17)).toBe(0);
    // décroissance douce : jamais plus des deux tiers du plein entre deux cases voisines
    for (let z = 4; z < 18; z++) for (let x = 4; x < 18; x++) expect(Math.abs(a(x, z) - a(x + 1, z))).toBeLessThan(165);
    // la tache n'est pas un carré : à distance égale du centre, le poids varie selon la direction
    const ring = [a(13, 11), a(11, 13), a(8, 10), a(10, 8), a(13, 13), a(8, 8)];
    expect(Math.max(...ring) - Math.min(...ring)).toBeGreaterThan(8);
    // teinte du minerai (fer : bleu-gris ; cuivre : orangé), écrite aussi autour de la tache
    const rgb = (x: number, z: number) => [...d.slice((z * W + x) * 4, (z * W + x) * 4 + 3)];
    const [r1, , b1] = rgb(11, 11);
    expect(b1).toBeGreaterThan(r1);
    const [r2, , b2] = rgb(31, 13);
    expect(r2).toBeGreaterThan(b2 + 40);
    expect(rgb(14, 11)).toEqual(rgb(11, 11));
  });

  it("donne à chaque gisement un amas qui ne change pas d'une construction à l'autre", () => {
    const count = (dep: Deposits) => dep.group.children.reduce((n, m) => n + (m as THREE.InstancedMesh).count, 0);
    const a = new Deposits(map);
    const b = new Deposits(map);
    expect(count(a)).toBe(count(b));
    // quatre gisements : au moins 15 pièces chacun (roches ou cristaux, éclats du pourtour)
    expect(count(a)).toBeGreaterThan(60);
    const ma = (a.group.children[0] as THREE.InstancedMesh).instanceMatrix.array;
    const mb = (b.group.children[0] as THREE.InstancedMesh).instanceMatrix.array;
    expect(Array.from(ma)).toEqual(Array.from(mb));
    expect(a.index.get(10 * W + 10)).toBe(0);
  });

  it("cache les roches hautes d'un gisement recouvert, puis les remet", () => {
    const dep = new Deposits(map);
    const visible = () => {
      let n = 0;
      const m = new THREE.Matrix4();
      for (const c of dep.group.children) {
        const mesh = c as THREE.InstancedMesh;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          if (Math.abs(m.determinant()) > 1e-12) n++;
        }
      }
      return n;
    };
    const all = visible();
    dep.setCovered(new Set([0]));
    const covered = visible();
    // les roches de l'emprise disparaissent, les éclats plats du pourtour restent
    expect(covered).toBeLessThan(all - 4);
    expect(covered).toBeGreaterThan(all - 20);
    dep.setCovered(new Set());
    expect(visible()).toBe(all);
  });
});
