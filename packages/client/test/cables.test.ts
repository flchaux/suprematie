// Câbles des Transhumants : qui est relié à quoi, et forme de la courbe posée au sol.
import { describe, it, expect } from "vitest";
import { CABLE_GEN, CABLE_MODULE, CABLE_POLE, PLUG_OUT, cableCurve, cablePairs, pairHash, type CableNode } from "../src/render/cables.ts";

let nextRef = 1;
const gen = (owner: number, x: number, z: number, supply = 9): CableNode => ({ ref: nextRef++, owner, role: CABLE_GEN, x, z, w: 2, h: 2, supply, connect: 22 });
const pole = (owner: number, x: number, z: number): CableNode => ({ ref: nextRef++, owner, role: CABLE_POLE, x, z, w: 1, h: 1, supply: 6, connect: 13 });
const mod = (owner: number, x: number, z: number, w = 2): CableNode => ({ ref: nextRef++, owner, role: CABLE_MODULE, x, z, w, h: w, supply: 0, connect: 0 });
const named = (nodes: CableNode[], pairs: [number, number][]) => pairs.map(([a, b]) => [nodes[a].ref, nodes[b].ref]);

describe("câbles : paires", () => {
  it("relie chaque module au générateur le plus proche du même joueur qui le couvre", () => {
    const g1 = gen(0, 100, 100);
    const g2 = gen(0, 112, 100);
    const enemyGen = gen(1, 104, 104);
    const m1 = mod(0, 104, 100); // plus près de g1
    const m2 = mod(0, 108, 101); // plus près de g2
    const far = mod(0, 140, 140); // hors de toute zone
    const nodes = [m2, g1, far, enemyGen, m1, g2];
    const pairs = named(nodes, cablePairs(nodes));
    expect(pairs).toContainEqual([m1.ref, g1.ref]);
    expect(pairs).toContainEqual([m2.ref, g2.ref]);
    expect(pairs.some(([a]) => a === far.ref)).toBe(false);
    // ni le générateur ni le générateur d'un autre joueur ne sont des consommateurs ou des sources pour joueur 0
    expect(pairs.some(([a, b]) => a === g1.ref || a === g2.ref || b === enemyGen.ref)).toBe(false);
  });

  it("un module hors de la zone du générateur va au poteau le plus proche qui le couvre ; les poteaux forment une file", () => {
    const g = gen(0, 100, 100);
    const p1 = pole(0, 112, 102);
    const p2 = pole(0, 123, 102);
    const p3 = pole(0, 134, 102);
    const lone = pole(0, 180, 180); // aucun générateur à portée de liaison
    const m = mod(0, 126, 96);
    const nodes = [p3, m, lone, p1, g, p2];
    const pairs = named(nodes, cablePairs(nodes));
    expect(pairs).toContainEqual([p1.ref, g.ref]);
    expect(pairs).toContainEqual([p2.ref, p1.ref]);
    expect(pairs).toContainEqual([p3.ref, p2.ref]);
    expect(pairs).toContainEqual([m.ref, p2.ref]);
    expect(pairs.some(([a]) => a === lone.ref)).toBe(false);
    expect(pairs).toHaveLength(4);
  });

  it("le générateur reste prioritaire sur un poteau plus proche, et le résultat ne dépend pas de l'ordre", () => {
    const g = gen(0, 100, 100);
    const p = pole(0, 110, 100);
    const m = mod(0, 108, 103);
    const a = cablePairs([g, p, m]);
    const b = cablePairs([m, p, g]);
    expect(named([g, p, m], a)).toEqual(named([m, p, g], b));
    expect(named([g, p, m], a)).toContainEqual([m.ref, g.ref]);
  });

  it("ignore les poteaux et modules d'un autre joueur", () => {
    const g = gen(0, 100, 100);
    const theirPole = pole(1, 110, 100);
    const theirMod = mod(1, 104, 100);
    const nodes = [g, theirPole, theirMod];
    expect(cablePairs(nodes)).toEqual([]);
  });
});

describe("câbles : courbe", () => {
  const a = mod(0, 100, 100);
  const b = gen(0, 110, 104);
  const maxLateral = (c: NonNullable<ReturnType<typeof cableCurve>>) => {
    const [x0, z0] = [c.xs[0], c.zs[0]];
    const [x1, z1] = [c.xs[c.xs.length - 1], c.zs[c.zs.length - 1]];
    const L = Math.hypot(x1 - x0, z1 - z0);
    let m = 0;
    for (let i = 0; i < c.xs.length; i++) m = Math.max(m, Math.abs(((c.xs[i] - x0) * (z1 - z0) - (c.zs[i] - z0) * (x1 - x0)) / L));
    return m / L;
  };
  /** distance d'un point au bord du rectangle d'un bâtiment (positive dehors) */
  const outside = (n: CableNode, x: number, z: number) => Math.max(n.x - x, x - (n.x + n.w), n.z - z, z - (n.z + n.h));

  it("part et arrive au bord des emprises, prises comprises, et remonte vers elles", () => {
    const c = cableCurve(a, b, pairHash(a.ref, b.ref))!;
    expect(c).not.toBeNull();
    const n = c.xs.length;
    expect(outside(a, c.xs[0], c.zs[0])).toBeGreaterThan(0);
    expect(outside(a, c.xs[0], c.zs[0])).toBeLessThan(0.5);
    expect(outside(b, c.xs[n - 1], c.zs[n - 1])).toBeGreaterThan(0);
    expect(outside(b, c.xs[n - 1], c.zs[n - 1])).toBeLessThan(0.5);
    // prises au bord, côté de l'autre bout
    for (const [n, p] of [[a, c.plugs[0]], [b, c.plugs[1]]] as const) {
      expect(outside(n, p[0], p[1])).toBeGreaterThan(0);
      expect(outside(n, p[0], p[1])).toBeLessThanOrEqual(PLUG_OUT + 1e-6);
    }
    // côté de l'autre bout : la prise de a est tournée vers b, et inversement
    expect(c.plugs[0][2] * (b.x - a.x) + c.plugs[0][3] * (b.z - a.z)).toBeGreaterThan(0);
    expect(c.plugs[1][2] * (a.x - b.x) + c.plugs[1][3] * (a.z - b.z)).toBeGreaterThan(0);
    // au milieu, posé au sol ; aux bouts, à hauteur de prise
    const mid = c.ys[n >> 1];
    expect(mid).toBeLessThan(0.12);
    expect(c.ys[0]).toBeGreaterThan(mid + 0.05);
    expect(c.ys[n - 1]).toBeGreaterThan(mid + 0.05);
  });

  it("flèche de 6 à 10 % de la longueur, pour toutes les paires", () => {
    for (let k = 0; k < 200; k++) {
      const p = mod(0, 100 + (k % 7), 100 + ((k * 3) % 11));
      const q = gen(0, 112 + (k % 5), 96 + ((k * 7) % 13));
      const c = cableCurve(p, q, pairHash(p.ref, q.ref))!;
      const f = maxLateral(c);
      expect(f).toBeGreaterThanOrEqual(0.06);
      expect(f).toBeLessThanOrEqual(0.1);
      expect(Math.abs(c.sag) / c.len).toBeCloseTo(f, 2);
    }
  });

  it("côté déterministe, tiré de la paire, et des deux côtés selon les paires", () => {
    const c1 = cableCurve(a, b, pairHash(a.ref, b.ref))!;
    const c2 = cableCurve(a, b, pairHash(a.ref, b.ref))!;
    expect(c1.xs).toEqual(c2.xs);
    expect(Math.sign(c1.sag)).toBe(Math.sign(c2.sag));
    const signs = new Set<number>();
    for (let r = 1; r < 40; r++) signs.add(Math.sign(cableCurve(a, b, pairHash(r, r + 1000))!.sag));
    expect(signs).toEqual(new Set([1, -1]));
  });

  it("pas de câble entre deux bâtiments collés", () => {
    expect(cableCurve(mod(0, 100, 100), gen(0, 102, 100), 7)).toBeNull();
  });
});
