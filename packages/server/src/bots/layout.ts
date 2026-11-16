// Plan de base de l'IA : modules « sushi » (un tapis principal qui finit dans un dépôt, bâtiments
// alignés des deux côtés avec un bras d'entrée et un bras de sortie), extracteurs reliés au tapis
// principal par des tapis tracés en A*, et réseau électrique (pylônes, générateurs).
// Le plan est tenu dans une grille propre au bot ; la simulation (can_place) reste la référence.
import type { Sim } from "@supreme/shared";
import { DX, DY, dirOf, Heap, type Ids } from "./util.ts";

// Contenu de la grille de plan
export const P_FREE = 0;
export const P_RES = 1; // réservé (bande d'un module) : ni tapis d'amenée ni bâtiment libre
export const P_BLD = 2; // bâtiment prévu ou construit
export const P_BELT = 3; // tapis d'amenée (peut recevoir un autre tapis)
export const P_BUS = 4; // tapis principal (hors tête)
export const P_HEAD = 5; // tête du tapis principal (reçoit les tapis d'amenée)
export const P_KEEP = 6; // à garder libre de bâtiments (tête, sorties d'usine) ; tapis permis

export interface Placement {
  kind: number;
  x: number;
  y: number;
  dir: number;
  recipe?: number; // recette à fixer
  tag?: string;
}

export interface Pole {
  x: number;
  y: number;
  s: number; // taille
  supply: number;
  connect: number;
}

export interface Slot {
  side: number;
  u0: number;
  w: number;
  kind: number;
  x: number;
  y: number;
  dir: number;
  type: string; // ex. "F:iron_plate", "A:gear", "lab", "factory"
  places: Placement[];
  ref?: number;
}

export interface Module {
  id: number;
  ox: number;
  oy: number;
  d: number;
  L: number;
  H: number;
  cursor: number[]; // [côté -1, côté +1]
  slots: Slot[];
  bus: Placement[];
  cx: number; // centre (cases)
  cy: number;
  full: boolean;
  feeders: number;
  use: number; // consommation prévue (kW)
  prod: number; // production prévue (kW)
  role: string;
}

const BAND = 7; // demi-largeur de la bande réservée
const HEAD = 5;

export class Planner {
  sim: Sim;
  slot: number;
  ids: Ids;
  w: number;
  h: number;
  plan: Uint8Array;
  bdir: Uint8Array;
  poles: Pole[] = [];
  modules: Module[] = [];
  heap = new Heap();
  // tampons de l'A*
  gcost: Int32Array;
  from: Int32Array;
  stamp: Int32Array;
  stampN = 1;

  constructor(sim: Sim, slot: number, ids: Ids, w: number, h: number) {
    this.sim = sim;
    this.slot = slot;
    this.ids = ids;
    this.w = w;
    this.h = h;
    this.plan = new Uint8Array(w * h);
    this.bdir = new Uint8Array(w * h);
    this.gcost = new Int32Array(w * h);
    this.from = new Int32Array(w * h);
    this.stamp = new Int32Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 1 && y >= 1 && x < this.w - 1 && y < this.h - 1;
  }
  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  /** Case libre pour un tapis (simulation) et non planifiée. */
  beltFree(x: number, y: number): boolean {
    if (!this.inside(x, y)) return false;
    const p = this.plan[this.idx(x, y)];
    if (p !== P_FREE && p !== P_KEEP) return false;
    return this.sim.canPlace(this.slot, this.ids.b.belt1, x, y, 0);
  }
  /** Rectangle libre dans le plan (valeurs permises) et posable dans la simulation. */
  rectFree(kind: number, x: number, y: number, dir: number, s: number, allowRes: boolean): boolean {
    for (let ty = y; ty < y + s; ty++) {
      for (let tx = x; tx < x + s; tx++) {
        if (!this.inside(tx, ty)) return false;
        const p = this.plan[this.idx(tx, ty)];
        if (!(p === P_FREE || (allowRes && p === P_RES))) return false;
      }
    }
    return this.sim.canPlace(this.slot, kind, x, y, dir);
  }
  mark(x: number, y: number, s: number, v: number): void {
    for (let ty = y; ty < y + s; ty++) for (let tx = x; tx < x + s; tx++) if (this.inside(tx, ty)) this.plan[this.idx(tx, ty)] = v;
  }
  /** Libère un rectangle marqué (projet abandonné). */
  unmark(x: number, y: number, s: number, v: number): void {
    for (let ty = y; ty < y + s; ty++) for (let tx = x; tx < x + s; tx++) if (this.inside(tx, ty)) this.plan[this.idx(tx, ty)] = v;
  }

  // ---------- Modules ----------
  wx(m: Module, u: number, v: number): number {
    return m.ox + u * DX[m.d] + v * DX[(m.d + 1) & 3];
  }
  wy(m: Module, u: number, v: number): number {
    return m.oy + u * DY[m.d] + v * DY[(m.d + 1) & 3];
  }
  /** Coin haut-gauche d'un carré local (u0..u0+s-1, v0..v0+s-1). */
  sq(m: Module, u0: number, v0: number, s: number): [number, number] {
    const xa = this.wx(m, u0, v0);
    const xb = this.wx(m, u0 + s - 1, v0 + s - 1);
    const ya = this.wy(m, u0, v0);
    const yb = this.wy(m, u0 + s - 1, v0 + s - 1);
    return [Math.min(xa, xb), Math.min(ya, yb)];
  }
  /** Direction monde d'un vecteur local (du, dv) unitaire. */
  ldir(m: Module, du: number, dv: number): number {
    if (du === 1) return m.d;
    if (du === -1) return (m.d + 2) & 3;
    if (dv === 1) return (m.d + 1) & 3;
    return (m.d + 3) & 3;
  }

  /** Cherche l'emplacement d'un module près de (cx, cy). */
  findModule(cx: number, cy: number, spots: { x: number; y: number }[], lengths: number[], maxShift: number): Module | null {
    const R = Math.max(...lengths) + 20;
    const x0 = cx - R;
    const y0 = cy - R;
    const S = 2 * R + 1;
    // cache des cases libres (simulation + plan)
    const free = new Int8Array(S * S);
    const ok = (x: number, y: number): boolean => {
      const lx = x - x0;
      const ly = y - y0;
      if (lx < 0 || ly < 0 || lx >= S || ly >= S) return false;
      const k = ly * S + lx;
      let f = free[k];
      if (f === 0) {
        f = this.inside(x, y) && this.plan[this.idx(x, y)] === P_FREE && this.sim.canPlace(this.slot, this.ids.b.belt1, x, y, 0) ? 1 : -1;
        free[k] = f;
      }
      return f === 1;
    };
    const spotIn = (x: number, y: number): boolean => {
      const lx = x - x0;
      const ly = y - y0;
      if (lx < 0 || ly < 0 || lx >= S || ly >= S) return false;
      return free[ly * S + lx] === 2;
    };
    for (const s of spots) {
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const lx = s.x + dx - x0;
          const ly = s.y + dy - y0;
          if (lx >= 0 && ly >= 0 && lx < S && ly < S) free[ly * S + lx] = 2;
        }
    }
    for (const L of lengths) {
      let best: Module | null = null;
      let bestScore = -1e9;
      for (let d = 0; d < 4; d++) {
        const nd = (d + 1) & 3;
        for (let voff = -maxShift; voff <= maxShift; voff += 1) {
          for (let uc = 8; uc <= L - 8; uc += 2) {
            const ox = cx - uc * DX[d] + voff * DX[nd];
            const oy = cy - uc * DY[d] + voff * DY[nd];
            const m = { ox, oy, d } as Module;
            // tapis principal + case arrière + dépôt
            let good = true;
            for (let u = -1; u <= L + 1 && good; u++) if (!ok(this.wx(m, u, 0), this.wy(m, u, 0))) good = false;
            for (let u = L; u <= L + 1 && good; u++) if (!ok(this.wx(m, u, 1), this.wy(m, u, 1))) good = false;
            if (!good) continue;
            let score = 0;
            for (let u = HEAD; u < L; u++) {
              for (let v = -BAND; v <= BAND; v++) {
                if (v === 0) continue;
                const x = this.wx(m, u, v);
                const y = this.wy(m, u, v);
                if (ok(x, y)) score += Math.abs(v) <= 6 ? 1 : 0.3;
                else if (spotIn(x, y)) score -= 8;
                else score -= Math.abs(v) <= 2 ? 1.5 : 0.5;
              }
            }
            // tête : place pour les tapis d'amenée
            for (let u = -6; u < HEAD; u++) {
              for (let v = -4; v <= 4; v++) {
                if (v === 0) continue;
                const x = this.wx(m, u, v);
                const y = this.wy(m, u, v);
                if (ok(x, y)) score += 0.3;
                else if (spotIn(x, y)) score -= 1;
              }
            }
            score -= Math.abs(voff) * 1.5;
            if (score > bestScore) {
              bestScore = score;
              best = { id: this.modules.length, ox, oy, d, L, H: HEAD, cursor: [HEAD, HEAD], slots: [], bus: [], cx: 0, cy: 0, full: false, feeders: 0, use: 0, prod: 0, role: "" };
            }
          }
        }
      }
      if (best && bestScore > L * 2 * BAND * 0.55) return this.commitModule(best);
    }
    return null;
  }

  commitModule(m: Module): Module {
    const L = m.L;
    m.cx = this.wx(m, L >> 1, 0);
    m.cy = this.wy(m, L >> 1, 0);
    const belt = this.ids.b.belt1;
    // zone de tête : gardée libre de bâtiments
    for (let u = -8; u < m.H; u++) {
      for (let v = -10; v <= 10; v++) {
        const x = this.wx(m, u, v);
        const y = this.wy(m, u, v);
        if (this.inside(x, y) && this.plan[this.idx(x, y)] === P_FREE) this.plan[this.idx(x, y)] = P_KEEP;
      }
    }
    // bande réservée
    for (let u = m.H; u <= L + 3; u++) {
      for (let v = -BAND; v <= BAND; v++) {
        const x = this.wx(m, u, v);
        const y = this.wy(m, u, v);
        if (this.inside(x, y) && this.plan[this.idx(x, y)] !== P_BLD) this.plan[this.idx(x, y)] = P_RES;
      }
    }
    for (let u = 0; u < L; u++) {
      const x = this.wx(m, u, 0);
      const y = this.wy(m, u, 0);
      const i = this.idx(x, y);
      this.plan[i] = u < m.H ? P_HEAD : P_BUS;
      this.bdir[i] = m.d;
      m.bus.push({ kind: belt, x, y, dir: m.d, tag: "bus" });
    }
    const [dx, dy] = this.sq(m, L, 0, 2);
    this.mark(dx, dy, 2, P_BLD);
    m.bus.push({ kind: this.ids.b.depot, x: dx, y: dy, dir: 0, tag: "depot" });
    this.modules.push(m);
    return m;
  }

  /** Réserve l'emplacement suivant pour un bâtiment carré de côté w le long du module. */
  allocSlot(m: Module, kind: number, w: number, type: string, opts: { input: boolean; output: boolean; faceOut?: boolean; recipe?: number }): Slot | null {
    const sides = m.cursor[0] <= m.cursor[1] ? [-1, 1] : [1, -1];
    const ins = this.ids.b.inserter;
    for (const side of sides) {
      const si = side < 0 ? 0 : 1;
      for (let u0 = m.cursor[si]; u0 + w <= m.L - 1; u0++) {
        const v0 = side > 0 ? 2 : -(1 + w);
        const [bx, by] = this.sq(m, u0, v0, w);
        const dirOut = this.ldir(m, 0, side); // vers l'extérieur
        const dirIn = this.ldir(m, 0, -side); // vers le tapis
        const bdir = opts.faceOut ? dirOut : 0;
        if (!this.rectFree(kind, bx, by, bdir, w, true)) continue;
        const ix = this.wx(m, u0, side);
        const iy = this.wy(m, u0, side);
        const ox = this.wx(m, u0 + 1, side);
        const oy = this.wy(m, u0 + 1, side);
        if (opts.input && !this.rectFree(ins, ix, iy, 0, 1, true)) continue;
        if (opts.output && !this.rectFree(ins, ox, oy, 0, 1, true)) continue;
        const places: Placement[] = [];
        places.push({ kind, x: bx, y: by, dir: bdir, recipe: opts.recipe, tag: type });
        this.mark(bx, by, w, P_BLD);
        if (opts.input) {
          places.push({ kind: ins, x: ix, y: iy, dir: dirOut, tag: "in" });
          this.mark(ix, iy, 1, P_BLD);
        }
        if (opts.output) {
          places.push({ kind: ins, x: ox, y: oy, dir: dirIn, tag: "out" });
          this.mark(ox, oy, 1, P_BLD);
        }
        // énergie : pylônes dans les colonnes d'espacement
        const spacers: [number, number][] = [
          [this.wx(m, u0 + w, side), this.wy(m, u0 + w, side)],
          [this.wx(m, u0 - 1, side), this.wy(m, u0 - 1, side)],
        ];
        for (const p of places.slice()) {
          const s = this.ids.data.buildings[p.kind].w;
          if (this.ids.data.buildings[p.kind].powerUse > 0) places.push(...this.ensurePower(p.x, p.y, s, s, spacers));
        }
        if (opts.faceOut) {
          // sortie de l'usine : couloir libre
          for (let k = 1; k <= 4; k++) {
            const ex = this.wx(m, u0 + (w >> 1), side * (1 + w + k));
            const ey = this.wy(m, u0 + (w >> 1), side * (1 + w + k));
            if (this.inside(ex, ey) && this.plan[this.idx(ex, ey)] === P_FREE) this.plan[this.idx(ex, ey)] = P_KEEP;
          }
        }
        m.cursor[si] = u0 + w + 1;
        const slot: Slot = { side, u0, w, kind, x: bx, y: by, dir: bdir, type, places };
        m.slots.push(slot);
        return slot;
      }
      m.cursor[si] = m.L; // côté plein
    }
    m.full = true;
    return null;
  }

  // ---------- Énergie ----------
  covered(x: number, y: number, w: number, h: number): boolean {
    for (const p of this.poles) {
      if (x + w - 1 >= p.x - p.supply && x <= p.x + p.s - 1 + p.supply && y + h - 1 >= p.y - p.supply && y <= p.y + p.s - 1 + p.supply) return true;
    }
    return false;
  }
  connected(x: number, y: number, s: number, connect: number): boolean {
    const cx = x + s / 2;
    const cy = y + s / 2;
    for (const p of this.poles) {
      const r = Math.min(connect, p.connect);
      const dx = p.x + p.s / 2 - cx;
      const dy = p.y + p.s / 2 - cy;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  }
  addPole(kind: number, x: number, y: number): void {
    const d = this.ids.data.buildings[kind];
    this.poles.push({ x, y, s: d.w, supply: d.supply, connect: d.connect });
  }
  removePole(x: number, y: number): void {
    const i = this.poles.findIndex((p) => p.x === x && p.y === y);
    if (i >= 0) this.poles.splice(i, 1);
  }
  supplies(px: number, py: number, ps: number, sup: number, x: number, y: number, w: number, h: number): boolean {
    return x + w - 1 >= px - sup && x <= px + ps - 1 + sup && y + h - 1 >= py - sup && y <= py + ps - 1 + sup;
  }

  /** Pylônes ou générateur nécessaires pour alimenter un rectangle. */
  ensurePower(x: number, y: number, w: number, h: number, prefer: [number, number][] = []): Placement[] {
    if (this.covered(x, y, w, h)) return [];
    const pyl = this.ids.b.pylon;
    const gen = this.ids.b.generator;
    const pd = this.ids.data.buildings[pyl];
    const gd = this.ids.data.buildings[gen];
    let lonely: [number, number] | null = null;
    for (const [px, py] of prefer) {
      if (!this.supplies(px, py, 1, pd.supply, x, y, w, h)) continue;
      if (!this.rectFree(pyl, px, py, 0, 1, true)) continue;
      if (this.connected(px, py, 1, pd.connect)) return [this.takePole(pyl, px, py)];
      if (!lonely) lonely = [px, py];
    }
    // pylône libre autour, relié au réseau
    let bestP: [number, number] | null = null;
    let bestD = 1e9;
    for (let py = y - pd.supply; py < y + h + pd.supply; py++) {
      for (let px = x - pd.supply; px < x + w + pd.supply; px++) {
        if (!this.inside(px, py) || this.plan[this.idx(px, py)] !== P_FREE) continue;
        if (!this.connected(px, py, 1, pd.connect)) continue;
        if (!this.sim.canPlace(this.slot, pyl, px, py, 0)) continue;
        const d = Math.abs(px - x) + Math.abs(py - y);
        if (d < bestD) {
          bestD = d;
          bestP = [px, py];
        }
      }
    }
    if (bestP) return [this.takePole(pyl, bestP[0], bestP[1])];
    // générateur qui couvre directement le rectangle
    const sup = gd.supply;
    let bestG: [number, number] | null = null;
    bestD = 1e9;
    for (let gy = y - sup - 1; gy < y + h + sup; gy++) {
      for (let gx = x - sup - 1; gx < x + w + sup; gx++) {
        if (!this.supplies(gx, gy, 2, sup, x, y, w, h)) continue;
        if (!this.rectFree(gen, gx, gy, 0, 2, false)) continue;
        const d = Math.abs(gx - x) + Math.abs(gy - y);
        if (d < bestD) {
          bestD = d;
          bestG = [gx, gy];
        }
      }
    }
    if (bestG) return [this.takePole(gen, bestG[0], bestG[1])];
    // pylône isolé + générateur hors de la bande
    if (lonely) {
      const [px, py] = lonely;
      const g = this.findGenNear(px, py, Math.min(pd.connect, gd.connect) - 0.2);
      if (g) return [this.takePole(gen, g[0], g[1]), this.takePole(pyl, px, py)];
    }
    return [];
  }

  takePole(kind: number, x: number, y: number): Placement {
    const s = this.ids.data.buildings[kind].w;
    this.mark(x, y, s, P_BLD);
    this.addPole(kind, x, y);
    return { kind, x, y, dir: 0, tag: "power" };
  }

  findGenNear(px: number, py: number, r: number): [number, number] | null {
    const gen = this.ids.b.generator;
    let best: [number, number] | null = null;
    let bestD = 1e9;
    const R = Math.ceil(r) + 1;
    for (let gy = py - R; gy <= py + R; gy++) {
      for (let gx = px - R; gx <= px + R; gx++) {
        const dx = gx + 1 - (px + 0.5);
        const dy = gy + 1 - (py + 0.5);
        const d = dx * dx + dy * dy;
        if (d > r * r || d >= bestD) continue;
        if (!this.rectFree(gen, gx, gy, 0, 2, false)) continue;
        bestD = d;
        best = [gx, gy];
      }
    }
    return best;
  }

  /** Générateur supplémentaire relié au réseau d'un module (production d'énergie). */
  planGenerator(m: Module): Placement | null {
    const gen = this.ids.b.generator;
    const gd = this.ids.data.buildings[gen];
    let best: [number, number] | null = null;
    let bestD = 1e9;
    const R = m.L / 2 + BAND + 8;
    for (let gy = m.cy - R; gy <= m.cy + R; gy++) {
      for (let gx = m.cx - R; gx <= m.cx + R; gx++) {
        const d = Math.abs(gx - m.cx) + Math.abs(gy - m.cy);
        if (d >= bestD) continue;
        if (!this.inside(gx, gy) || this.plan[this.idx(gx, gy)] !== P_FREE) continue;
        if (!this.connected(gx, gy, 2, gd.connect - 0.5)) continue;
        if (!this.rectFree(gen, gx, gy, 0, 2, false)) continue;
        // ne pas coller les générateurs aux tapis d'amenée
        bestD = d;
        best = [gx, gy];
      }
    }
    if (!best) return null;
    return this.takePole(gen, best[0], best[1]);
  }

  // ---------- Extracteurs et tapis d'amenée ----------
  frontOf(x: number, y: number, dir: number): [number, number] {
    switch (dir & 3) {
      case 0:
        return [x + 2, y];
      case 1:
        return [x, y + 2];
      case 2:
        return [x - 1, y];
      default:
        return [x, y - 1];
    }
  }

  /** Une case de tapis peut-elle se déverser dans (qx, qy) depuis (px, py) ? */
  joinable(px: number, py: number, qx: number, qy: number): boolean {
    if (!this.inside(qx, qy)) return false;
    const q = this.idx(qx, qy);
    const p = this.plan[q];
    if (p !== P_BELT && p !== P_HEAD) return false;
    const d = dirOf(qx - px, qy - py);
    return ((this.bdir[q] + 2) & 3) !== d;
  }

  /** Planifie un extracteur sur le gisement et son tapis jusqu'au module. */
  planExtractor(m: Module, sx: number, sy: number, maxNodes = 9000): Placement[] | null {
    const ext = this.ids.b.extractor;
    if (!this.sim.canPlace(this.slot, ext, sx, sy, 0)) return null;
    for (let ty = sy; ty < sy + 2; ty++) for (let tx = sx; tx < sx + 2; tx++) if (this.plan[this.idx(tx, ty)] === P_BLD) return null;
    let best: { dir: number; path: number[] } | null = null;
    for (let dir = 0; dir < 4; dir++) {
      const [fx, fy] = this.frontOf(sx, sy, dir);
      if (!this.inside(fx, fy)) continue;
      const fp = this.plan[this.idx(fx, fy)];
      if (fp === P_BUS || fp === P_HEAD || fp === P_BELT) {
        // débouche directement sur un tapis existant
        best = { dir, path: [] };
        break;
      }
      if (!this.beltFree(fx, fy)) continue;
      const path = this.astar(fx, fy, m, maxNodes, best ? best.path.length : 1e9);
      if (path && (!best || path.length < best.path.length)) best = { dir, path };
    }
    if (!best) return null;
    const places: Placement[] = [];
    places.push({ kind: ext, x: sx, y: sy, dir: best.dir, tag: "extractor" });
    this.mark(sx, sy, 2, P_BLD);
    const belt = this.ids.b.belt1;
    const path = best.path;
    const n = path.length;
    for (let k = 0; k < n; k++) {
      const i = path[k];
      const x = i % this.w;
      const y = (i / this.w) | 0;
      let d: number;
      if (k + 1 < n) {
        const j = path[k + 1];
        d = dirOf((j % this.w) - x, ((j / this.w) | 0) - y);
      } else {
        d = this.endDir(x, y);
      }
      this.plan[i] = P_BELT;
      this.bdir[i] = d;
      places.push({ kind: belt, x, y, dir: d, tag: "feeder" });
    }
    places.push(...this.ensurePower(sx, sy, 2, 2));
    m.feeders++;
    return places;
  }

  endDir(x: number, y: number): number {
    for (let d = 0; d < 4; d++) if (this.joinable(x, y, x + DX[d], y + DY[d])) return d;
    return 0;
  }

  /** A* d'une case libre jusqu'à une case qui peut se déverser dans un tapis d'amenée ou la tête du module. */
  astar(sx: number, sy: number, m: Module, maxNodes: number, maxLen: number): number[] | null {
    const W = this.w;
    const st = ++this.stampN;
    const heap = this.heap;
    heap.clear();
    const tx = this.wx(m, 0, 0);
    const ty = this.wy(m, 0, 0);
    const hfun = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);
    const s = sy * W + sx;
    this.stamp[s] = st;
    this.gcost[s] = 0;
    this.from[s] = -1;
    heap.push(hfun(sx, sy) * 2, s);
    let n = 0;
    const box = m.L + 60;
    while (heap.size > 0 && n < maxNodes) {
      const i = heap.pop();
      n++;
      const x = i % W;
      const y = (i / W) | 0;
      const g = this.gcost[i];
      if (g >= maxLen) continue;
      // arrivée ?
      for (let d = 0; d < 4; d++) {
        if (this.joinable(x, y, x + DX[d], y + DY[d])) {
          const out: number[] = [];
          let c = i;
          while (c !== -1) {
            out.push(c);
            c = this.from[c];
          }
          out.reverse();
          return out;
        }
      }
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (Math.abs(nx - m.cx) > box || Math.abs(ny - m.cy) > box) continue;
        const j = ny * W + nx;
        const ng = g + 1;
        if (this.stamp[j] === st && this.gcost[j] <= ng) continue;
        if (!this.beltFree(nx, ny)) continue;
        this.stamp[j] = st;
        this.gcost[j] = ng;
        this.from[j] = i;
        heap.push(ng + hfun(nx, ny), j);
      }
    }
    return null;
  }

  /** Libère les cases d'un placement abandonné. */
  release(p: Placement): void {
    const s = this.ids.data.buildings[p.kind].w;
    const v = p.tag === "feeder" ? P_FREE : P_FREE;
    this.unmark(p.x, p.y, s, v);
    if (p.tag === "power") this.removePole(p.x, p.y);
  }

  /** Emplacement libre pour un bâtiment carré près d'un point, hors des zones réservées. */
  findFree(kind: number, cx: number, cy: number, rmin: number, rmax: number, gap = 1): [number, number] | null {
    const s = this.ids.data.buildings[kind].w;
    for (let r = rmin; r <= rmax; r++) {
      for (let k = 0; k < 8 * r; k += 1) {
        // parcours du carré de rayon r
        let x: number;
        let y: number;
        const side = Math.floor(k / (2 * r));
        const t = k % (2 * r);
        if (side === 0) {
          x = cx - r + t;
          y = cy - r;
        } else if (side === 1) {
          x = cx + r;
          y = cy - r + t;
        } else if (side === 2) {
          x = cx + r - t;
          y = cy + r;
        } else {
          x = cx - r;
          y = cy + r - t;
        }
        if (!this.areaFree(x - gap, y - gap, s + 2 * gap)) continue;
        if (!this.sim.canPlace(this.slot, kind, x, y, 0)) continue;
        return [x, y];
      }
    }
    return null;
  }
  areaFree(x: number, y: number, s: number): boolean {
    for (let ty = y; ty < y + s; ty++) for (let tx = x; tx < x + s; tx++) if (!this.inside(tx, ty) || this.plan[this.idx(tx, ty)] !== P_FREE) return false;
    return true;
  }
}
