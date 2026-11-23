// Analyse de l'eau d'une carte pour l'IA : plans d'eau navigables, distance de chaque départ à chacun,
// et, pour un plan d'eau, la case navigable la plus proche de chaque case de la carte.
// Calculé une fois par carte (au premier besoin) et partagé par tous les bots.
import type { MapInfo } from "./types.ts";

export interface Waters {
  /** plan d'eau de chaque case (-1 : pas navigable) */
  comp: Int32Array;
  /** nombre de cases de chaque plan d'eau */
  size: number[];
  /** dist[départ][plan d'eau] : distance (cases) du départ à la case d'eau la plus proche */
  dist: Float64Array[];
}

const cache = new WeakMap<object, Waters>();

/** Navigable comme dans la simulation (Map::update_pass) : de l'eau, hors du bord de la carte et des falaises. */
export function navigable(map: MapInfo, x: number, y: number): boolean {
  const { w, h, heights, waterLevel } = map;
  if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return false;
  const i = y * w + x;
  const c = heights[i];
  if (c >= waterLevel) return false;
  if (c < waterLevel - 2) return true;
  return Math.max(Math.abs(heights[i - 1] - c), Math.abs(heights[i + 1] - c), Math.abs(heights[i - w] - c), Math.abs(heights[i + w] - c)) <= 7;
}

export function watersOf(map: MapInfo): Waters {
  let r = cache.get(map);
  if (r) return r;
  const { w, h } = map;
  const comp = new Int32Array(w * h).fill(-1);
  const size: number[] = [];
  if (map.waterLevel > 0) {
    const nav = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (navigable(map, x, y)) nav[y * w + x] = 1;
    const stack: number[] = [];
    for (let s = 0; s < w * h; s++) {
      if (!nav[s] || comp[s] >= 0) continue;
      const id = size.length;
      let n = 0;
      comp[s] = id;
      stack.push(s);
      while (stack.length) {
        const i = stack.pop() as number;
        n++;
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (nav[j] && comp[j] < 0) {
            comp[j] = id;
            stack.push(j);
          }
        }
      }
      size.push(n);
    }
  }
  const dist = map.starts.map(([sx, sy]) => {
    const d = new Float64Array(size.length).fill(Infinity);
    if (size.length) {
      for (let y = 1; y < h - 1; y++) {
        const dy2 = (y - sy) * (y - sy);
        for (let x = 1; x < w - 1; x++) {
          const c = comp[y * w + x];
          if (c < 0) continue;
          const q = (x - sx) * (x - sx) + dy2;
          if (q < d[c]) d[c] = q;
        }
      }
    }
    for (let k = 0; k < d.length; k++) d[k] = Math.sqrt(d[k]);
    return d;
  });
  r = { comp, size, dist };
  cache.set(map, r);
  return r;
}

/** Pour un plan d'eau : distance (pas de la grille, 255 au plus) et case du plan d'eau la plus proche de chaque case. */
export interface SeaField {
  dist: Uint8Array;
  near: Int32Array;
}
const fields = new WeakMap<object, Map<number, SeaField>>();
const REACH = 60;

/** Champ de proximité d'un plan d'eau (parcours en largeur depuis ses cases, jusqu'à 60 cases dans les terres). */
export function seaField(map: MapInfo, sea: number): SeaField {
  let m = fields.get(map);
  if (!m) fields.set(map, (m = new Map()));
  let f = m.get(sea);
  if (f) return f;
  const { w, h } = map;
  const { comp } = watersOf(map);
  const dist = new Uint8Array(w * h).fill(255);
  const near = new Int32Array(w * h).fill(-1);
  let front: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (comp[i] !== sea) continue;
    dist[i] = 0;
    near[i] = i;
    const x = i % w;
    const y = (i / w) | 0;
    if ((x > 0 && comp[i - 1] !== sea) || (x < w - 1 && comp[i + 1] !== sea) || (y > 0 && comp[i - w] !== sea) || (y < h - 1 && comp[i + w] !== sea)) front.push(i);
  }
  for (let d = 1; d <= REACH && front.length; d++) {
    const next: number[] = [];
    for (const i of front) {
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (dist[j] !== 255) continue;
          dist[j] = d;
          near[j] = near[i];
          next.push(j);
        }
      }
    }
    front = next;
  }
  f = { dist, near };
  m.set(sea, f);
  return f;
}

/** Plan d'eau trop petit pour une flotte (cases). */
export const MIN_SEA = 1500;
/** Distance (cases) d'un départ à la côte au-delà de laquelle le plan d'eau ne sert pas à sa base. */
export const MAX_COAST = 75;
/** Distance (cases) d'un départ adverse à la côte jusqu'à laquelle une flotte menace sa base. */
export const THREAT_COAST = 55;

/**
 * Plan d'eau utile pour le départ `slot` : assez grand, proche de sa base, et qui mène à portée de la base
 * d'un adversaire. -1 : aucun. Le plus utile : celui qui approche le plus d'adversaires, puis le plus proche.
 */
export function usefulSea(map: MapInfo, slot: number, enemies: number[]): number {
  const W = watersOf(map);
  const mine = W.dist[slot];
  let best = -1;
  let bs = -Infinity;
  for (let c = 0; c < W.size.length; c++) {
    if (W.size[c] < MIN_SEA || !mine || mine[c] > MAX_COAST) continue;
    let s = 0;
    for (const e of enemies) {
      const d = W.dist[e]?.[c] ?? Infinity;
      if (d <= THREAT_COAST) s += 2;
      else if (d <= MAX_COAST) s += 1;
    }
    if (s === 0) continue;
    const score = s * 100 - mine[c];
    if (score > bs) {
      bs = score;
      best = c;
    }
  }
  return best;
}
