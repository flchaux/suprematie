// Terres : composantes connexes des cases praticables à pied (ce qui est joignable sans bateau ni avion)
// et recherche d'un point d'une terre donnée près d'une position. Pendant terrestre de water.ts.
import type { BotContext } from "./types.ts";
import { TILE } from "./util.ts";
import type { SkirmishAI } from "./ai.ts";

const landCache = new WeakMap<object, Int32Array>();
/** Composantes connexes des cases praticables à pied (calculées une fois par carte, comme map.rs). */
export function landComponents(map: BotContext["map"]): Int32Array {
  let comp = landCache.get(map);
  if (comp) return comp;
  const { w, h, heights, waterLevel } = map;
  const pass = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = heights[i];
      if (c < waterLevel || x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
      let mx = 0;
      if (x > 0) mx = Math.max(mx, Math.abs(heights[i - 1] - c));
      if (x < w - 1) mx = Math.max(mx, Math.abs(heights[i + 1] - c));
      if (y > 0) mx = Math.max(mx, Math.abs(heights[i - w] - c));
      if (y < h - 1) mx = Math.max(mx, Math.abs(heights[i + w] - c));
      if (mx <= 7) pass[i] = 1;
    }
  }
  comp = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!pass[s] || comp[s] >= 0) continue;
    comp[s] = n;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % w;
      if (x > 0 && pass[i - 1] && comp[i - 1] < 0) {
        comp[i - 1] = n;
        stack.push(i - 1);
      }
      if (x < w - 1 && pass[i + 1] && comp[i + 1] < 0) {
        comp[i + 1] = n;
        stack.push(i + 1);
      }
      if (i >= w && pass[i - w] && comp[i - w] < 0) {
        comp[i - w] = n;
        stack.push(i - w);
      }
      if (i + w < w * h && pass[i + w] && comp[i + w] < 0) {
        comp[i + w] = n;
        stack.push(i + w);
      }
    }
    n++;
  }
  landCache.set(map, comp);
  return comp;
}

/**
 * Point (sous-unités) proche de (x, y) sur la même terre que (tx, ty) : recherche en spirale jusqu'à
 * 40 cases, sinon l'objectif lui-même.
 */
export function landNear(ai: SkirmishAI, x: number, y: number, tx: number, ty: number): [number, number] {
  const map = ai.ctx.map;
  const comp = landComponents(map);
  const cx = Math.max(0, Math.min(map.w - 1, Math.floor(x / TILE)));
  const cy = Math.max(0, Math.min(map.h - 1, Math.floor(y / TILE)));
  const want = comp[Math.max(0, Math.min(map.h - 1, Math.floor(ty / TILE))) * map.w + Math.max(0, Math.min(map.w - 1, Math.floor(tx / TILE)))];
  if (want < 0) return [x, y];
  if (comp[cy * map.w + cx] === want) return [x, y];
  for (let r = 1; r <= 40; r++) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = cx + dx;
        const py = cy + dy;
        if (px < 1 || py < 1 || px >= map.w - 1 || py >= map.h - 1 || comp[py * map.w + px] !== want) continue;
        // à distance égale, le point le plus proche de l'objectif
        const d = (px * TILE - tx) ** 2 + (py * TILE - ty) ** 2;
        if (d < bd) {
          bd = d;
          best = [px * TILE + TILE / 2, py * TILE + TILE / 2];
        }
      }
    }
    if (best) return best;
  }
  return [tx, ty];
}
