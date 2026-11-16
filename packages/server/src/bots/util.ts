// Outils communs de l'IA : identifiants des données, directions, tas binaire, index partagé de la vue.
import type { GameData, BotView, BotUnit, BotBuilding } from "@supreme/shared";
import { keyIndex } from "@supreme/shared";

export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const TILE = 256;

export function dirOf(dx: number, dy: number): number {
  if (dx === 1) return 0;
  if (dy === 1) return 1;
  if (dx === -1) return 2;
  return 3;
}

/** Identifiants numériques des objets, bâtiments, unités, recettes et recherches utilisés par l'IA. */
export class Ids {
  item: Record<string, number>;
  b: Record<string, number>;
  u: Record<string, number>;
  r: Record<string, number>;
  t: Record<string, number>;
  data: GameData;
  constructor(data: GameData) {
    this.data = data;
    this.item = keyIndex(data.items);
    this.b = keyIndex(data.buildings);
    this.u = keyIndex(data.units);
    this.r = keyIndex(data.recipes);
    this.t = keyIndex(data.techs);
  }
}

/** Tas binaire minimal sur des entiers (priorités entières). */
export class Heap {
  keys: number[] = [];
  vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  clear(): void {
    this.keys.length = 0;
    this.vals.length = 0;
  }
  push(k: number, v: number): void {
    const ks = this.keys;
    const vs = this.vals;
    let i = ks.length;
    ks.push(k);
    vs.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (ks[p] <= k) break;
      ks[i] = ks[p];
      vs[i] = vs[p];
      i = p;
    }
    ks[i] = k;
    vs[i] = v;
  }
  pop(): number {
    const ks = this.keys;
    const vs = this.vals;
    const top = vs[0];
    const lk = ks.pop() as number;
    const lv = vs.pop() as number;
    const n = ks.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && ks[c + 1] < ks[c]) c++;
        if (ks[c] >= lk) break;
        ks[i] = ks[c];
        vs[i] = vs[c];
        i = c;
      }
      ks[i] = lk;
      vs[i] = lv;
    }
    return top;
  }
}

/** Index de la vue, calculé une fois par décision et partagé par tous les bots. */
export interface ViewIndex {
  unitsBy: BotUnit[][];
  buildingsBy: BotBuilding[][];
  /** Unités par seau de 32 cases (clé = by * 64 + bx). */
  buckets: Map<number, BotUnit[]>;
  bref: Map<number, BotBuilding>;
}

const cache = new WeakMap<BotView, ViewIndex>();
export const BUCKET = 32 * TILE;

export function indexView(view: BotView): ViewIndex {
  let ix = cache.get(view);
  if (ix) return ix;
  const np = view.players.length;
  const unitsBy: BotUnit[][] = [];
  const buildingsBy: BotBuilding[][] = [];
  for (let i = 0; i < np; i++) {
    unitsBy.push([]);
    buildingsBy.push([]);
  }
  const buckets = new Map<number, BotUnit[]>();
  for (const u of view.units) {
    if (u.carried) continue;
    unitsBy[u.owner]?.push(u);
    const k = Math.floor(u.y / BUCKET) * 64 + Math.floor(u.x / BUCKET);
    let l = buckets.get(k);
    if (!l) buckets.set(k, (l = []));
    l.push(u);
  }
  const bref = new Map<number, BotBuilding>();
  for (const b of view.buildings) {
    buildingsBy[b.owner]?.push(b);
    bref.set(b.ref, b);
  }
  ix = { unitsBy, buildingsBy, buckets, bref };
  cache.set(view, ix);
  return ix;
}

/** Unités dans un rayon (sous-unités) autour d'un point, via les seaux. */
export function unitsNear(ix: ViewIndex, x: number, y: number, r: number, f: (u: BotUnit) => void): void {
  const bx0 = Math.floor((x - r) / BUCKET);
  const bx1 = Math.floor((x + r) / BUCKET);
  const by0 = Math.floor((y - r) / BUCKET);
  const by1 = Math.floor((y + r) / BUCKET);
  const r2 = r * r;
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const l = ix.buckets.get(by * 64 + bx);
      if (!l) continue;
      for (const u of l) {
        const dx = u.x - x;
        const dy = u.y - y;
        if (dx * dx + dy * dy <= r2) f(u);
      }
    }
  }
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
