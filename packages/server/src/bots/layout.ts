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
export const P_KEEP = 6; // à garder libre de bâtiments (tête) ; tapis permis
export const P_LANE = 7; // couloir de circulation (bord de la bande, sorties d'usine) : rien
export const P_DEPOT = 8; // dépôt (reçoit les tapis d'amenée directs)

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
  cell?: boolean; // élément d'une cellule (alimenté directement par bras)
  busOut?: boolean; // élément de cellule qui pose son produit sur le tapis
}

export interface CellComp {
  key: string; // clé du bâtiment
  du: number;
  busIn: boolean; // bras d'entrée depuis le tapis principal
  busOut?: boolean; // bras de sortie vers le tapis principal (case du + 1)
  recipe?: string;
  faceOut?: boolean;
  type: string;
}
export interface CellDef {
  name: string;
  comps: CellComp[];
  links: { du: number; row: number; dir: number }[]; // bras entre bâtiments (sens ±u)
  pylons: number[]; // positions des pylônes sur la rangée des bras
  width: number;
  /** Cellule productrice (pose sur le tapis) : placée depuis la tête, comme les producteurs. */
  producer?: boolean;
}
export interface CellSlot {
  side: number;
  u0: number;
  places: Placement[];
  slots: Slot[];
  cell: CellDef;
}

/** Cellule « robots » : câbles -> circuits -> usine <- engrenages. */
export const CELL_ROBOT: CellDef = {
  name: "robot",
  comps: [
    { key: "assembler1", du: 0, busIn: true, recipe: "cable", type: "A:cable" },
    { key: "assembler1", du: 4, busIn: true, recipe: "circuit", type: "A:circuit" },
    { key: "land_factory", du: 8, busIn: true, faceOut: true, type: "factory:land_factory" },
    { key: "assembler1", du: 14, busIn: true, recipe: "gear", type: "A:gear" },
  ],
  links: [
    { du: 3, row: 3, dir: 1 },
    { du: 7, row: 3, dir: 1 },
    { du: 13, row: 3, dir: -1 },
  ],
  pylons: [3, 7, 13, 17],
  width: 18,
};

/** Cellule « science » : engrenages -> lots 1 -> laboratoire (qui prend aussi les lots du tapis). */
export const CELL_SCIENCE: CellDef = {
  name: "science",
  comps: [
    { key: "assembler1", du: 0, busIn: true, recipe: "gear", type: "A:gear" },
    { key: "assembler1", du: 4, busIn: true, recipe: "pack1", type: "A:pack1" },
    { key: "lab", du: 8, busIn: true, type: "lab" },
  ],
  links: [
    { du: 3, row: 3, dir: 1 },
    { du: 7, row: 3, dir: 1 },
  ],
  pylons: [3, 7, 11],
  width: 11,
};

/**
 * Cellule « science 2 » : engrenages -> lots 1 -> laboratoire <- lots 2 <- pièces de bras.
 * Les circuits et engrenages des lots 2 viennent du tapis principal.
 */
export const CELL_SCIENCE2: CellDef = {
  name: "science2",
  comps: [
    { key: "assembler1", du: 0, busIn: true, recipe: "gear", type: "A:gear" },
    { key: "assembler1", du: 4, busIn: true, recipe: "pack1", type: "A:pack1" },
    { key: "lab", du: 8, busIn: true, type: "lab" },
    { key: "assembler1", du: 12, busIn: true, recipe: "pack2", type: "A:pack2" },
    { key: "assembler1", du: 16, busIn: true, recipe: "arm_part", type: "A:arm_part" },
  ],
  links: [
    { du: 3, row: 3, dir: 1 },
    { du: 7, row: 3, dir: 1 },
    { du: 11, row: 3, dir: -1 },
    { du: 15, row: 3, dir: -1 },
  ],
  pylons: [3, 7, 11, 15, 19],
  width: 20,
};

/** Cellule « science sur tapis » : lots 1 (engrenages et cuivre pris sur le tapis) -> laboratoire. */
export const CELL_SCIENCE_BUS: CellDef = {
  name: "sciencebus",
  comps: [
    { key: "assembler1", du: 0, busIn: true, recipe: "pack1", type: "A:pack1" },
    { key: "lab", du: 4, busIn: true, type: "lab" },
  ],
  links: [{ du: 3, row: 3, dir: 1 }],
  pylons: [3, 7],
  width: 8,
};

/** Cellule productrice de circuits : câbles -> circuits -> tapis. */
export const CELL_CIRCUITS: CellDef = {
  name: "circuits",
  comps: [
    { key: "assembler1", du: 0, busIn: true, recipe: "cable", type: "A:cable" },
    { key: "assembler1", du: 4, busIn: true, busOut: true, recipe: "circuit", type: "A:circuit" },
  ],
  links: [{ du: 3, row: 3, dir: 1 }],
  pylons: [3, 7],
  width: 8,
  producer: true,
};

/** Cellule productrice de lots 2 : pièces de bras (tapis) -> lots 2 -> tapis. */
export const CELL_PACK2: CellDef = {
  name: "pack2",
  comps: [
    { key: "assembler1", du: 0, busIn: true, recipe: "arm_part", type: "A:arm_part" },
    { key: "assembler1", du: 4, busIn: true, busOut: true, recipe: "pack2", type: "A:pack2" },
  ],
  links: [{ du: 3, row: 3, dir: 1 }],
  pylons: [3, 7],
  width: 8,
  producer: true,
};

export const CELLS: Record<string, CellDef> = {
  robot: CELL_ROBOT,
  science: CELL_SCIENCE,
  science2: CELL_SCIENCE2,
  sciencebus: CELL_SCIENCE_BUS,
  circuits: CELL_CIRCUITS,
  pack2: CELL_PACK2,
};

export interface Module {
  id: number;
  ox: number;
  oy: number;
  d: number;
  L: number;
  H: number;
  cursor: number[]; // producteurs : prochaine case libre depuis la tête [côté -1, côté +1]
  hi: number[]; // consommateurs (labos, usines) : dernière case libre depuis le dépôt
  frontier: number; // un producteur doit prendre ses entrées après la sortie des précédents
  slots: Slot[];
  bus: Placement[];
  cx: number; // centre (cases)
  cy: number;
  full: boolean;
  feeders: number;
  noLand?: boolean; // module converti : ses cellules de robots ne produisent plus
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
  /** Réseau d'un tapis : module * 2 + 1 (tapis principal) ou module * 2 + 2 (direct au dépôt). */
  bnet: Uint8Array;
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
    this.bnet = new Uint8Array(w * h);
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
    // tables de sommes (cases libres, cases de gisement) pour compter un rectangle en O(1)
    const freeS = new Int32Array((S + 1) * (S + 1));
    const spotS = new Int32Array((S + 1) * (S + 1));
    const spotG = new Uint8Array(S * S);
    for (const sp of spots) {
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const lx = sp.x + dx - x0;
          const ly = sp.y + dy - y0;
          if (lx >= 0 && ly >= 0 && lx < S && ly < S) spotG[ly * S + lx] = 1;
        }
    }
    const belt = this.ids.b.belt1;
    for (let ly = 0; ly < S; ly++) {
      let rf = 0;
      let rs = 0;
      for (let lx = 0; lx < S; lx++) {
        const x = x0 + lx;
        const y = y0 + ly;
        const f = this.inside(x, y) && this.plan[this.idx(x, y)] === P_FREE && this.sim.canPlace(this.slot, belt, x, y, 0) ? 1 : 0;
        rf += f;
        rs += spotG[ly * S + lx];
        freeS[(ly + 1) * (S + 1) + lx + 1] = freeS[ly * (S + 1) + lx + 1] + rf;
        spotS[(ly + 1) * (S + 1) + lx + 1] = spotS[ly * (S + 1) + lx + 1] + rs;
      }
    }
    const rect = (T: Int32Array, xa: number, ya: number, xb: number, yb: number): number => {
      // rectangle inclusif en coordonnées monde, borné à la boîte
      let ax = Math.min(xa, xb) - x0;
      let bx = Math.max(xa, xb) - x0;
      let ay = Math.min(ya, yb) - y0;
      let by = Math.max(ya, yb) - y0;
      if (ax < 0) ax = 0;
      if (ay < 0) ay = 0;
      if (bx > S - 1) bx = S - 1;
      if (by > S - 1) by = S - 1;
      if (ax > bx || ay > by) return 0;
      const W1 = S + 1;
      return T[(by + 1) * W1 + bx + 1] - T[ay * W1 + bx + 1] - T[(by + 1) * W1 + ax] + T[ay * W1 + ax];
    };
    const area = (xa: number, ya: number, xb: number, yb: number) => (Math.abs(xb - xa) + 1) * (Math.abs(yb - ya) + 1);
    let fallback: { m: Module; s: number } | null = null;
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
            const P = (u: number, v: number): [number, number] => [this.wx(m, u, v), this.wy(m, u, v)];
            // tapis principal + case arrière + dépôt : tout libre
            const [ba, bb] = P(-1, 0);
            const [bc, bd] = P(L + 1, 0);
            if (rect(freeS, ba, bb, bc, bd) !== area(ba, bb, bc, bd)) continue;
            const [da, db] = P(L, 1);
            const [dc, dd] = P(L + 1, 1);
            if (rect(freeS, da, db, dc, dd) !== 2) continue;
            // bande : cases libres (côtés), gisements fortement pénalisés
            let score = 0;
            for (const sgn of [-1, 1]) {
              const [xa, ya] = P(HEAD, sgn);
              const [xb, yb] = P(L - 1, sgn * (BAND - 1));
              const fr = rect(freeS, xa, ya, xb, yb);
              score += fr - (area(xa, ya, xb, yb) - fr) * 0.8;
              const [la, lb] = P(HEAD, sgn * BAND);
              const [lc, ld] = P(L - 1, sgn * BAND);
              score += rect(freeS, la, lb, lc, ld) * 0.3;
              const [na, nb] = P(HEAD, sgn);
              const [nc, ndd] = P(L - 1, sgn * 2);
              const fn = rect(freeS, na, nb, nc, ndd);
              score -= (area(na, nb, nc, ndd) - fn) * 0.7;
            }
            const [sa, sb] = P(HEAD, -BAND);
            const [sc, sd] = P(L - 1, BAND);
            score -= rect(spotS, sa, sb, sc, sd) * 60;
            // tête : place pour les tapis d'amenée
            const [ha, hb] = P(-6, -4);
            const [hc, hd] = P(HEAD - 1, 4);
            score += rect(freeS, ha, hb, hc, hd) * 0.3 - rect(spotS, ha, hb, hc, hd) * 10;
            score -= Math.abs(voff) * 1.5;
            if (score > bestScore) {
              bestScore = score;
              best = { id: this.modules.length, ox, oy, d, L, H: HEAD, cursor: [HEAD, HEAD], hi: [L - 1, L - 1], frontier: HEAD, slots: [], bus: [], cx: 0, cy: 0, full: false, feeders: 0, use: 0, prod: 0, role: "" };
            }
          }
        }
      }
      if (best && bestScore > L * 2 * BAND * 0.55) return this.commitModule(best);
      if (best && (!fallback || bestScore / L > fallback.s)) fallback = { m: best, s: bestScore / L };
    }
    // aucun emplacement idéal : prendre le meilleur s'il reste correct
    if (fallback && fallback.s > 2 * BAND * 0.25) return this.commitModule(fallback.m);
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
    // au-delà du dépôt : libre de bâtiments (tapis d'amenée directs)
    for (let u = L; u <= L + 6; u++) {
      for (let v = -BAND; v <= BAND; v++) {
        const x = this.wx(m, u, v);
        const y = this.wy(m, u, v);
        if (this.inside(x, y) && this.plan[this.idx(x, y)] === P_FREE) this.plan[this.idx(x, y)] = P_KEEP;
      }
    }
    // bande réservée, bordée d'un couloir de circulation
    for (let u = m.H; u <= L - 1; u++) {
      for (let v = -BAND; v <= BAND; v++) {
        const x = this.wx(m, u, v);
        const y = this.wy(m, u, v);
        if (this.inside(x, y) && this.plan[this.idx(x, y)] !== P_BLD) this.plan[this.idx(x, y)] = Math.abs(v) === BAND ? P_LANE : P_RES;
      }
    }
    for (let u = 0; u < L; u++) {
      const x = this.wx(m, u, 0);
      const y = this.wy(m, u, 0);
      const i = this.idx(x, y);
      this.plan[i] = u < m.H ? P_HEAD : P_BUS;
      this.bdir[i] = m.d;
      this.bnet[i] = m.id * 2 + 1;
      m.bus.push({ kind: belt, x, y, dir: m.d, tag: "bus" });
    }
    const [dx, dy] = this.sq(m, L, 0, 2);
    this.mark(dx, dy, 2, P_DEPOT);
    for (let ty = dy; ty < dy + 2; ty++) for (let tx = dx; tx < dx + 2; tx++) this.bnet[this.idx(tx, ty)] = m.id * 2 + 2;
    m.bus.push({ kind: this.ids.b.depot, x: dx, y: dy, dir: 0, tag: "depot" });
    this.modules.push(m);
    return m;
  }

  /**
   * Réserve l'emplacement suivant pour un bâtiment carré de côté w le long du module.
   * Les producteurs (bras d'entrée et de sortie) se suivent depuis la tête : chacun prend ses
   * entrées après la sortie du précédent. Les consommateurs (labos, usines) se placent depuis le
   * dépôt, donc en aval de tous les producteurs.
   */
  allocSlot(m: Module, kind: number, w: number, type: string, opts: { input: boolean; output: boolean; faceOut?: boolean; recipe?: number }): Slot | null {
    const consumer = !opts.output;
    const ins = this.ids.b.inserter;
    const tries: { side: number; u0: number }[] = [];
    for (const side of [-1, 1]) {
      const si = side < 0 ? 0 : 1;
      if (!consumer) {
        for (let u0 = Math.max(m.cursor[si], m.frontier); u0 + w <= m.hi[si]; u0++) tries.push({ side, u0 });
      } else {
        for (let u0 = m.hi[si] - w + 1; u0 - 1 >= m.cursor[si] && u0 >= m.frontier; u0--) tries.push({ side, u0 });
      }
    }
    // producteurs : le plus en amont possible ; consommateurs : le plus en aval possible
    tries.sort((a, b) => (consumer ? b.u0 - a.u0 : a.u0 - b.u0));
    for (const { side, u0 } of tries) {
      const si = side < 0 ? 0 : 1;
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
          if (this.inside(ex, ey) && (this.plan[this.idx(ex, ey)] === P_FREE || this.plan[this.idx(ex, ey)] === P_RES)) this.plan[this.idx(ex, ey)] = P_LANE;
        }
      }
      if (consumer) m.hi[si] = u0 - 2;
      else {
        m.cursor[si] = u0 + w + 1;
        m.frontier = Math.max(m.frontier, u0 + 2);
      }
      const slot: Slot = { side, u0, w, kind, x: bx, y: by, dir: bdir, type, places };
      m.slots.push(slot);
      return slot;
    }
    if (w <= 3) m.full = true;
    return null;
  }

  // ---------- Énergie ----------
  covered(x: number, y: number, w: number, h: number): boolean {
    for (const p of this.poles) {
      if (x + w - 1 >= p.x - p.supply && x <= p.x + p.s - 1 + p.supply && y + h - 1 >= p.y - p.supply && y <= p.y + p.s - 1 + p.supply) {
        return true;
      }
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
      const link = this.linkPylon(lonely[0], lonely[1]);
      if (link) return [...link, this.takePole(pyl, lonely[0], lonely[1])];
    }
    if (process.env.BOTDEBUG) console.log("pas d'énergie pour", x, y, w, h);
    return [];
  }

  /**
   * Relie au réseau un pylône prévu en (px, py) (pas encore dans la liste) : générateur proche, ou
   * pylône relais vers le réseau existant ou vers un générateur.
   */
  linkPylon(px: number, py: number): Placement[] | null {
    const pyl = this.ids.b.pylon;
    const gen = this.ids.b.generator;
    const pd = this.ids.data.buildings[pyl];
    const gd = this.ids.data.buildings[gen];
    const rg = Math.min(pd.connect, gd.connect) - 0.2;
    const g = this.findGenNear(px, py, rg);
    if (g) return [this.takePole(gen, g[0], g[1])];
    const relays: [number, number, number][] = [];
    const R = pd.connect - 0.3;
    for (let ry = py - 9; ry <= py + 9; ry++) {
      for (let rx = px - 9; rx <= px + 9; rx++) {
        const d2 = (rx - px) ** 2 + (ry - py) ** 2;
        if (d2 > R * R || d2 < 4) continue;
        if (!this.inside(rx, ry)) continue;
        const pp = this.plan[this.idx(rx, ry)];
        if (pp !== P_FREE && pp !== P_RES) continue;
        relays.push([rx, ry, d2]);
      }
    }
    relays.sort((a, b) => b[2] - a[2]);
    for (const [rx, ry] of relays) {
      if (!this.connected(rx, ry, 1, pd.connect)) continue;
      if (!this.sim.canPlace(this.slot, pyl, rx, ry, 0)) continue;
      return [this.takePole(pyl, rx, ry)];
    }
    let n = 0;
    for (const [rx, ry] of relays) {
      if (n++ > 40) break;
      if (!this.sim.canPlace(this.slot, pyl, rx, ry, 0)) continue;
      const g2 = this.findGenNear(rx, ry, rg);
      if (g2) return [this.takePole(gen, g2[0], g2[1]), this.takePole(pyl, rx, ry)];
    }
    return null;
  }

  /**
   * Réserve une cellule (bâtiments reliés par des bras, sans passer par le tapis principal) du côté
   * consommateurs du module (depuis le dépôt).
   */
  allocCell(m: Module, cell: CellDef): CellSlot | null {
    const ins = this.ids.b.inserter;
    const pyl = this.ids.b.pylon;
    const W = cell.width;
    const tries: { side: number; u0: number }[] = [];
    for (const side of [-1, 1]) {
      const si = side < 0 ? 0 : 1;
      if (cell.producer) {
        for (let u0 = Math.max(m.cursor[si], m.frontier); u0 + W <= m.hi[si]; u0++) tries.push({ side, u0 });
      } else {
        for (let u0 = m.hi[si] - W + 1; u0 - 1 >= m.cursor[si] && u0 >= m.frontier; u0--) tries.push({ side, u0 });
      }
    }
    tries.sort((a, b) => (cell.producer ? a.u0 - b.u0 : b.u0 - a.u0));
    for (const { side, u0 } of tries) {
      const si = side < 0 ? 0 : 1;
      const comps: { kind: number; x: number; y: number; dir: number; w: number; c: CellComp }[] = [];
      let ok = true;
      for (const c of cell.comps) {
        const kind = this.ids.b[c.key];
        const w = this.ids.data.buildings[kind].w;
        const v0 = side > 0 ? 2 : -(1 + w);
        const [bx, by] = this.sq(m, u0 + c.du, v0, w);
        const dir = c.faceOut ? this.ldir(m, 0, side) : 0;
        if (!this.rectFree(kind, bx, by, dir, w, true)) {
          ok = false;
          break;
        }
        comps.push({ kind, x: bx, y: by, dir, w, c });
      }
      if (!ok) continue;
      const inserters: Placement[] = [];
      let lastOut = -1;
      for (const c of comps) {
        if (c.c.busIn) {
          const x = this.wx(m, u0 + c.c.du, side);
          const y = this.wy(m, u0 + c.c.du, side);
          inserters.push({ kind: ins, x, y, dir: this.ldir(m, 0, side), tag: "in" });
        }
        if (c.c.busOut) {
          const x = this.wx(m, u0 + c.c.du + 1, side);
          const y = this.wy(m, u0 + c.c.du + 1, side);
          inserters.push({ kind: ins, x, y, dir: this.ldir(m, 0, -side), tag: "out" });
          lastOut = Math.max(lastOut, u0 + c.c.du + 1);
        }
      }
      for (const l of cell.links) {
        const x = this.wx(m, u0 + l.du, side * l.row);
        const y = this.wy(m, u0 + l.du, side * l.row);
        inserters.push({ kind: ins, x, y, dir: this.ldir(m, l.dir, 0), tag: "link" });
      }
      const pylons: [number, number][] = cell.pylons.map((du) => [this.wx(m, u0 + du, side), this.wy(m, u0 + du, side)]);
      for (const p of inserters) if (!this.rectFree(ins, p.x, p.y, 0, 1, true)) ok = false;
      for (const [x, y] of pylons) if (!this.rectFree(pyl, x, y, 0, 1, true)) ok = false;
      if (!ok) continue;
      const places: Placement[] = [];
      const slots: Slot[] = [];
      for (const c of comps) {
        const recipe = c.c.recipe !== undefined ? this.ids.r[c.c.recipe] : undefined;
        places.push({ kind: c.kind, x: c.x, y: c.y, dir: c.dir, recipe, tag: c.c.type });
        this.mark(c.x, c.y, c.w, P_BLD);
        slots.push({ side, u0: u0 + c.c.du, w: c.w, kind: c.kind, x: c.x, y: c.y, dir: c.dir, type: c.c.type, places: [places[places.length - 1]], cell: true, busOut: c.c.busOut === true });
      }
      for (const p of inserters) {
        places.push(p);
        this.mark(p.x, p.y, 1, P_BLD);
      }
      // énergie : pylônes de la cellule, reliés au réseau si besoin
      let linked = false;
      for (const [x, y] of pylons) if (this.connected(x, y, 1, this.ids.data.buildings[pyl].connect)) linked = true;
      const pps: Placement[] = [];
      for (const [x, y] of pylons) pps.push(this.takePole(pyl, x, y));
      if (!linked) {
        // retirer temporairement les pylônes de la cellule pour chercher un lien extérieur
        const mine = this.poles.splice(this.poles.length - pylons.length, pylons.length);
        let link: Placement[] | null = null;
        for (const [x, y] of pylons) {
          link = this.linkPylon(x, y);
          if (link) break;
        }
        this.poles.push(...mine);
        if (link) places.push(...link);
        else if (process.env.BOTDEBUG) console.log("cellule sans énergie", cell.name);
      }
      places.push(...pps);
      // sorties d'usine : couloir libre
      for (const c of comps) {
        if (!c.c.faceOut) continue;
        for (let k = 1; k <= 4; k++) {
          const ex = this.wx(m, u0 + c.c.du + (c.w >> 1), side * (1 + c.w + k));
          const ey = this.wy(m, u0 + c.c.du + (c.w >> 1), side * (1 + c.w + k));
          if (this.inside(ex, ey) && (this.plan[this.idx(ex, ey)] === P_FREE || this.plan[this.idx(ex, ey)] === P_RES)) this.plan[this.idx(ex, ey)] = P_LANE;
        }
      }
      if (cell.producer) {
        m.cursor[si] = u0 + W + 1;
        m.frontier = Math.max(m.frontier, lastOut + 1);
      } else m.hi[si] = u0 - 2;
      for (const sl of slots) m.slots.push(sl);
      return { side, u0, places, slots, cell };
    }
    return null;
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

  /** Une case de tapis du réseau `net` peut-elle se déverser dans (qx, qy) depuis (px, py) ? */
  joinable(px: number, py: number, qx: number, qy: number, net: number): boolean {
    if (!this.inside(qx, qy)) return false;
    const q = this.idx(qx, qy);
    const p = this.plan[q];
    if (this.bnet[q] !== net) return false;
    if (p === P_DEPOT) return true;
    if (p !== P_BELT && p !== P_HEAD) return false;
    const d = dirOf(qx - px, qy - py);
    return ((this.bdir[q] + 2) & 3) !== d;
  }

  /** Cible d'un réseau : tête du tapis principal ou dépôt. */
  netTarget(m: Module, net: number): [number, number] {
    return net % 2 === 1 ? [this.wx(m, 0, 0), this.wy(m, 0, 0)] : [this.wx(m, m.L, 0), this.wy(m, m.L, 0)];
  }

  /**
   * Planifie un extracteur qui verse directement dans une fonderie, dont un bras pose les plaques
   * sur un tapis d'amenée jusqu'au module.
   */
  planMine(m: Module, sx: number, sy: number, toDepot: boolean, maxNodes = 9000): Placement[] | null {
    const net = m.id * 2 + (toDepot ? 2 : 1);
    const ext = this.ids.b.extractor;
    const fur = this.ids.b.furnace;
    const ins = this.ids.b.inserter;
    if (!this.sim.canPlace(this.slot, ext, sx, sy, 0)) return null;
    for (let ty = sy; ty < sy + 2; ty++) for (let tx = sx; tx < sx + 2; tx++) if (this.plan[this.idx(tx, ty)] !== P_FREE && this.plan[this.idx(tx, ty)] !== P_KEEP) return null;
    const [hx, hy] = this.netTarget(m, net);
    const inE = (x: number, y: number) => x >= sx && x < sx + 2 && y >= sy && y < sy + 2;
    interface Cand {
      d: number;
      fx: number;
      fy: number;
      ix: number;
      iy: number;
      idir: number;
      bx: number;
      by: number;
      h: number;
    }
    const cands: Cand[] = [];
    const furnOpts: [number, number][][] = [
      [
        [sx + 2, sy - 1],
        [sx + 2, sy],
      ],
      [
        [sx - 1, sy + 2],
        [sx, sy + 2],
      ],
      [
        [sx - 2, sy - 1],
        [sx - 2, sy],
      ],
      [
        [sx - 1, sy - 2],
        [sx, sy - 2],
      ],
    ];
    for (let d = 0; d < 4; d++) {
      for (const [fx, fy] of furnOpts[d]) {
        if (!this.rectFree(fur, fx, fy, 0, 2, false)) continue;
        const inF = (x: number, y: number) => x >= fx && x < fx + 2 && y >= fy && y < fy + 2;
        // bras autour de la fonderie, tourné vers l'extérieur
        const opts: [number, number, number][] = [
          [fx, fy - 1, 3],
          [fx + 1, fy - 1, 3],
          [fx, fy + 2, 1],
          [fx + 1, fy + 2, 1],
          [fx - 1, fy, 2],
          [fx - 1, fy + 1, 2],
          [fx + 2, fy, 0],
          [fx + 2, fy + 1, 0],
        ];
        for (const [ix, iy, idir] of opts) {
          if (inE(ix, iy)) continue;
          const bx = ix + DX[idir];
          const by = iy + DY[idir];
          if (inE(bx, by) || inF(bx, by)) continue;
          if (!this.inside(ix, iy) || !this.inside(bx, by)) continue;
          const pi = this.plan[this.idx(ix, iy)];
          if (pi !== P_FREE && pi !== P_KEEP) continue;
          if (!this.sim.canPlace(this.slot, ins, ix, iy, 0)) continue;
          cands.push({ d, fx, fy, ix, iy, idir, bx, by, h: Math.abs(bx - hx) + Math.abs(by - hy) });
        }
      }
    }
    cands.sort((a, b) => a.h - b.h);
    let best: { c: Cand; path: number[] } | null = null;
    let tried = 0;
    for (const c of cands) {
      if (tried >= 5) break;
      const bp = this.inside(c.bx, c.by) ? this.plan[this.idx(c.bx, c.by)] : P_RES;
      if ((bp === P_BELT || bp === P_HEAD || bp === P_BUS) && this.bnet[this.idx(c.bx, c.by)] === net) {
        best = { c, path: [] };
        break;
      }
      if (!this.beltFree(c.bx, c.by)) continue;
      tried++;
      // bloquer temporairement extracteur, fonderie et bras
      const saved: [number, number][] = [];
      const block = (x: number, y: number) => {
        const i = this.idx(x, y);
        saved.push([i, this.plan[i]]);
        this.plan[i] = P_BLD;
      };
      for (let k = 0; k < 4; k++) {
        block(sx + (k & 1), sy + (k >> 1));
        block(c.fx + (k & 1), c.fy + (k >> 1));
      }
      block(c.ix, c.iy);
      const path = this.astar(c.bx, c.by, m, net, maxNodes, best ? best.path.length : 1e9);
      for (let k = saved.length - 1; k >= 0; k--) this.plan[saved[k][0]] = saved[k][1];
      if (path && (!best || path.length < best.path.length)) best = { c, path };
    }
    if (!best) return null;
    const c = best.c;
    const places: Placement[] = [];
    places.push({ kind: ext, x: sx, y: sy, dir: c.d, tag: "extractor" });
    this.mark(sx, sy, 2, P_BLD);
    places.push({ kind: fur, x: c.fx, y: c.fy, dir: 0, tag: "mine" });
    this.mark(c.fx, c.fy, 2, P_BLD);
    places.push({ kind: ins, x: c.ix, y: c.iy, dir: c.idir, tag: "out" });
    this.mark(c.ix, c.iy, 1, P_BLD);
    places.push(...this.pathPlaces(best.path, net));
    places.push(...this.ensurePower(sx, sy, 2, 2));
    places.push(...this.ensurePower(c.fx, c.fy, 2, 2));
    places.push(...this.ensurePower(c.ix, c.iy, 1, 1));
    m.feeders++;
    return places;
  }

  pathPlaces(path: number[], net: number): Placement[] {
    const belt = this.ids.b.belt1;
    const out: Placement[] = [];
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
        d = this.endDir(x, y, net);
      }
      this.plan[i] = P_BELT;
      this.bdir[i] = d;
      this.bnet[i] = net;
      out.push({ kind: belt, x, y, dir: d, tag: "feeder" });
    }
    return out;
  }

  /** Planifie un extracteur sur le gisement et son tapis jusqu'au module. */
  planExtractor(m: Module, sx: number, sy: number, maxNodes = 9000): Placement[] | null {
    const net = m.id * 2 + 1;
    const ext = this.ids.b.extractor;
    if (!this.sim.canPlace(this.slot, ext, sx, sy, 0)) return null;
    for (let ty = sy; ty < sy + 2; ty++) for (let tx = sx; tx < sx + 2; tx++) if (this.plan[this.idx(tx, ty)] === P_BLD) return null;
    let best: { dir: number; path: number[] } | null = null;
    for (let dir = 0; dir < 4; dir++) {
      const [fx, fy] = this.frontOf(sx, sy, dir);
      if (!this.inside(fx, fy)) continue;
      const fp = this.plan[this.idx(fx, fy)];
      if ((fp === P_BUS || fp === P_HEAD || fp === P_BELT) && this.bnet[this.idx(fx, fy)] === net) {
        // débouche directement sur un tapis existant
        best = { dir, path: [] };
        break;
      }
      if (!this.beltFree(fx, fy)) continue;
      const path = this.astar(fx, fy, m, net, maxNodes, best ? best.path.length : 1e9);
      if (path && (!best || path.length < best.path.length)) best = { dir, path };
    }
    if (!best) return null;
    const places: Placement[] = [];
    places.push({ kind: ext, x: sx, y: sy, dir: best.dir, tag: "extractor" });
    this.mark(sx, sy, 2, P_BLD);
    places.push(...this.pathPlaces(best.path, net));
    places.push(...this.ensurePower(sx, sy, 2, 2));
    m.feeders++;
    return places;
  }

  endDir(x: number, y: number, net: number): number {
    for (let d = 0; d < 4; d++) if (this.joinable(x, y, x + DX[d], y + DY[d], net)) return d;
    return 0;
  }

  /** A* d'une case libre jusqu'à une case qui peut se déverser dans un tapis d'amenée ou la tête du module. */
  astar(sx: number, sy: number, m: Module, net: number, maxNodes: number, maxLen: number): number[] | null {
    const W = this.w;
    const st = ++this.stampN;
    const heap = this.heap;
    heap.clear();
    const [tx, ty] = this.netTarget(m, net);
    const hfun = (x: number, y: number) => Math.abs(x - tx) + Math.abs(y - ty);
    const s = sy * W + sx;
    this.stamp[s] = st;
    this.gcost[s] = 0;
    this.from[s] = -1;
    heap.push(hfun(sx, sy) * 2, s);
    let n = 0;
    const box = m.L / 2 + 70;
    while (heap.size > 0 && n < maxNodes) {
      const i = heap.pop();
      n++;
      const x = i % W;
      const y = (i / W) | 0;
      const g = this.gcost[i];
      if (g >= maxLen) continue;
      // arrivée ?
      for (let d = 0; d < 4; d++) {
        if (this.joinable(x, y, x + DX[d], y + DY[d], net)) {
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
