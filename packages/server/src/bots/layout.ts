// Plan de base de l'IA : modules « sushi » (un tapis principal qui finit dans un dépôt, bâtiments
// alignés des deux côtés avec un bras d'entrée et un bras de sortie), extracteurs reliés au tapis
// principal par des tapis tracés en A*, et réseau électrique (relais, générateurs). Chaque générateur
// a un dépôt collé qui lui verse le combustible (hydrocarbure) de la réserve.
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
  busIn: boolean; // bras d'entrée depuis le tapis principal
  busOut?: boolean; // bras de sortie vers le tapis principal (case du + 1)
  recipe?: string;
  faceOut?: boolean;
  type: string;
}
export interface CellDef {
  name: string;
  /** bâtiments côte à côte le long du tapis principal, séparés d'une colonne (bras de liaison, pylône) */
  comps: CellComp[];
  /**
   * Bras de liaison entre deux bâtiments voisins (un par intervalle) : +1 du bâtiment k vers k + 1,
   * -1 de k + 1 vers k, 0 aucun. Les positions sont calculées d'après la taille des bâtiments.
   */
  chain: number[];
  /** Cellule productrice (pose sur le tapis) : placée depuis la tête, comme les producteurs. */
  producer?: boolean;
}

/** Géométrie d'une cellule, calculée d'après la taille réelle des bâtiments (voir Planner.cellGeom). */
export interface CellGeom {
  du: number[];
  links: { du: number; row: number; dir: number }[];
  pylons: number[];
  width: number;
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
    { key: "assembler1", busIn: true, recipe: "cable", type: "A:cable" },
    { key: "assembler1", busIn: true, recipe: "circuit", type: "A:circuit" },
    { key: "land_factory", busIn: true, faceOut: true, type: "factory:land_factory" },
    { key: "assembler1", busIn: true, recipe: "gear", type: "A:gear" },
  ],
  chain: [1, 1, -1],
};

/** Cellule « science » : engrenages -> lots 1 -> laboratoire (qui prend aussi les lots du tapis). */
export const CELL_SCIENCE: CellDef = {
  name: "science",
  comps: [
    { key: "assembler1", busIn: true, recipe: "gear", type: "A:gear" },
    { key: "assembler1", busIn: true, recipe: "pack1", type: "A:pack1" },
    { key: "lab", busIn: true, type: "lab" },
  ],
  chain: [1, 1],
};

/**
 * Cellule « science 2 » : engrenages -> lots 1 -> laboratoire <- lots 2 <- pièces de bras.
 * Les circuits et engrenages des lots 2 viennent du tapis principal.
 */
export const CELL_SCIENCE2: CellDef = {
  name: "science2",
  comps: [
    { key: "assembler1", busIn: true, recipe: "gear", type: "A:gear" },
    { key: "assembler1", busIn: true, recipe: "pack1", type: "A:pack1" },
    { key: "lab", busIn: true, type: "lab" },
    { key: "assembler1", busIn: true, recipe: "pack2", type: "A:pack2" },
    { key: "assembler1", busIn: true, recipe: "arm_part", type: "A:arm_part" },
  ],
  chain: [1, 1, -1, -1],
};

/** Cellule « science sur tapis » : lots 1 (engrenages et cuivre pris sur le tapis) -> laboratoire. */
export const CELL_SCIENCE_BUS: CellDef = {
  name: "sciencebus",
  comps: [
    { key: "assembler1", busIn: true, recipe: "pack1", type: "A:pack1" },
    { key: "lab", busIn: true, type: "lab" },
  ],
  chain: [1],
};

/** Cellule productrice de circuits : câbles -> circuits -> tapis. */
export const CELL_CIRCUITS: CellDef = {
  name: "circuits",
  comps: [
    { key: "assembler1", busIn: true, recipe: "cable", type: "A:cable" },
    { key: "assembler1", busIn: true, busOut: true, recipe: "circuit", type: "A:circuit" },
  ],
  chain: [1],
  producer: true,
};

/** Cellule productrice de lots 2 : pièces de bras (tapis) -> lots 2 -> tapis. */
export const CELL_PACK2: CellDef = {
  name: "pack2",
  comps: [
    { key: "assembler1", busIn: true, recipe: "arm_part", type: "A:arm_part" },
    { key: "assembler1", busIn: true, busOut: true, recipe: "pack2", type: "A:pack2" },
  ],
  chain: [1],
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
  /** arsenal : case visée par les tapis d'amenée (son dépôt), au lieu du bout du tapis principal */
  hub?: [number, number];
}

/** Identifiant du faux module d'un arsenal (réseaux de tapis à part, voir `bnet`). */
export const ARSENAL_ID = 100;

/** Emplacement d'un atelier de l'arsenal : le bâtiment (2 × 2) et ses bras. */
export interface ArsenalSlot {
  type: string; // "A:gear", "F:steel", "R:fuel", "C:composite", "lab"
  x: number;
  y: number;
  /** bras d'entrée (tapis -> atelier) et de sortie (atelier -> tapis) */
  ins: { x: number; y: number; dir: number };
  outs: { x: number; y: number; dir: number };
  /** fonderie d'acier sur la boucle (faute de place le long du tapis d'amenée) */
  loop?: boolean;
  tries: number;
  next: number;
}

/** Arsenal : dépôt, boucle de tapis qui en part et y revient, ateliers des deux côtés et au milieu. */
export interface ArsenalPlan {
  mod: Module;
  depot: [number, number];
  /** dépôt, tapis et bras de sortie, relais */
  base: Placement[];
  slots: ArsenalSlot[];
}

/** Cases libres d'une zone carrée (côté S, coin (bx, by)), en table de sommes de largeur W1. */
export interface FreeGrid {
  bx: number;
  by: number;
  S: number;
  W1: number;
  sum: Int32Array;
}

const BAND = 7; // demi-largeur de la bande réservée
const HEAD = 5;

export class Planner {
  /** raison du dernier échec de planification (journal de débogage) */
  lastFail = "";
  fail(why: string): null {
    this.lastFail = why;
    return null;
  }
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
    // bâtiments déjà là (générateur principal de départ) : à laisser hors de la bande
    const bldS = new Int32Array((S + 1) * (S + 1));
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
      let rb = 0;
      for (let lx = 0; lx < S; lx++) {
        const x = x0 + lx;
        const y = y0 + ly;
        const f = this.inside(x, y) && this.plan[this.idx(x, y)] === P_FREE && this.sim.canPlace(this.slot, belt, x, y, 0) ? 1 : 0;
        rf += f;
        rs += spotG[ly * S + lx];
        rb += this.inside(x, y) && this.plan[this.idx(x, y)] === P_BLD ? 1 : 0;
        freeS[(ly + 1) * (S + 1) + lx + 1] = freeS[ly * (S + 1) + lx + 1] + rf;
        spotS[(ly + 1) * (S + 1) + lx + 1] = spotS[ly * (S + 1) + lx + 1] + rs;
        bldS[(ly + 1) * (S + 1) + lx + 1] = bldS[ly * (S + 1) + lx + 1] + rb;
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
      // score sans la pénalité des bâtiments déjà là : c'est lui qui juge si l'emplacement convient
      let bestRaw = -1e9;
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
            const bld = rect(bldS, sa, sb, sc, sd) * 25;
            // tête : place pour les tapis d'amenée
            const [ha, hb] = P(-6, -4);
            const [hc, hd] = P(HEAD - 1, 4);
            score += rect(freeS, ha, hb, hc, hd) * 0.3 - rect(spotS, ha, hb, hc, hd) * 10;
            score -= Math.abs(voff) * 1.5;
            const ranked = score - bld - rect(bldS, ha, hb, hc, hd) * 10;
            if (ranked > bestScore) {
              bestScore = ranked;
              bestRaw = score;
              best = { id: this.modules.length, ox, oy, d, L, H: HEAD, cursor: [HEAD, HEAD], hi: [L - 1, L - 1], frontier: HEAD, slots: [], bus: [], cx: 0, cy: 0, full: false, feeders: 0, use: 0, prod: 0, role: "" };
            }
          }
        }
      }
      if (best && bestRaw > L * 2 * BAND * 0.55) return this.commitModule(best);
      if (best && (!fallback || bestRaw / L > fallback.s)) fallback = { m: best, s: bestRaw / L };
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

  // ---------- Arsenal ----------
  /** Réserve les cases devant un extracteur : un tapis qui y passerait recevrait du minerai brut. */
  lockFront(x: number, y: number, dir: number): void {
    const f: [number, number][] = dir === 0 ? [[x + 2, y], [x + 2, y + 1]] : dir === 1 ? [[x, y + 2], [x + 1, y + 2]] : dir === 2 ? [[x - 1, y], [x - 1, y + 1]] : [[x, y - 1], [x + 1, y - 1]];
    for (const [fx, fy] of f) if (this.inside(fx, fy) && (this.plan[this.idx(fx, fy)] === P_FREE || this.plan[this.idx(fx, fy)] === P_KEEP)) this.plan[this.idx(fx, fy)] = P_LANE;
  }

  /** Table de sommes des cases libres autour de (cx, cy), pour juger un rectangle en O(1). */
  freeGrid(cx: number, cy: number, R: number): FreeGrid {
    const belt = this.ids.b.belt1;
    const S = 2 * R + 1;
    const bx = cx - R;
    const by = cy - R;
    const W1 = S + 1;
    const sum = new Int32Array(W1 * W1);
    for (let ly = 0; ly < S; ly++) {
      let row = 0;
      for (let lx = 0; lx < S; lx++) {
        const x = bx + lx;
        const y = by + ly;
        if (this.inside(x, y) && this.plan[this.idx(x, y)] === P_FREE && this.sim.canPlace(this.slot, belt, x, y, 0)) row++;
        sum[(ly + 1) * W1 + lx + 1] = sum[ly * W1 + lx + 1] + row;
      }
    }
    return { bx, by, S, W1, sum };
  }

  /**
   * Cherche la place d'un arsenal de `cols` colonnes d'ateliers près de (cx, cy), et le réserve. Repère local
   * (u le long, v en travers, quatre orientations) : le dépôt en (0..1, 2..3) ; deux bras en (0..1, 1), et un
   * troisième du côté u = -1, posent ses objets sur le tapis aller (v = 0, vers +u), qui tourne au bout et
   * revient par v = 5 jusqu'au dépôt (côté v = 4). Rangée centrale v = 2..3 : ateliers `inner`, du tapis aller au
   * tapis retour ; un atelier de câbles y est collé à l'atelier de circuits qui le suit et lui donne tout son
   * produit (les câbles ne passent pas par la boucle : un objet reçu à la fois du voisin et de la boucle
   * laisserait le bras bloqué, la main pleine d'un objet dont l'atelier ne veut plus). Rangées v = -3..-2 (bras vers le tapis aller) et
   * v = 7..8 (bras vers le tapis retour) : ateliers `outer`, un toutes les trois cases là où la place le
   * permet. Il faut la place de `min` ateliers en tout.
   * Côté u < 0, un tapis d'amenée (v = 3) entre dans le dépôt, entre quatre fonderies d'acier qui y prennent
   * leur fer et y reposent leur acier si la place le permet (sinon, elles sont sur la boucle). `weight` :
   * pénalité d'une position du dépôt et du bout du tapis d'amenée.
   */
  planArsenal(grid: FreeGrid, cx: number, cy: number, radius: number, cols: number, min: number, inner: string[], outer: string[], weight: (x: number, y: number, tx: number, ty: number) => number): ArsenalPlan | null {
    const belt = this.ids.b.belt1;
    const U = 4 + 3 * cols;
    const { bx, by, S, W1, sum } = grid;
    /** Le rectangle local (bornes comprises) est-il libre ? */
    const free = (ox: number, oy: number, d: number, u0: number, v0: number, u1: number, v1: number): boolean => {
      const nd = (d + 1) & 3;
      const xa = ox + u0 * DX[d] + v0 * DX[nd];
      const ya = oy + u0 * DY[d] + v0 * DY[nd];
      const xb = ox + u1 * DX[d] + v1 * DX[nd];
      const yb = oy + u1 * DY[d] + v1 * DY[nd];
      const ax = Math.min(xa, xb) - bx;
      const ex = Math.max(xa, xb) - bx;
      const ay = Math.min(ya, yb) - by;
      const ey = Math.max(ya, yb) - by;
      if (ax < 0 || ay < 0 || ex >= S || ey >= S) return false;
      return sum[(ey + 1) * W1 + ex + 1] - sum[ay * W1 + ex + 1] - sum[(ey + 1) * W1 + ax] + sum[ay * W1 + ax] === (ex - ax + 1) * (ey - ay + 1);
    };
    // rangée centrale : une case libre entre deux ateliers, sauf après un atelier de câbles
    const inPos: number[] = [];
    for (let k = 0, u = 4; k < inner.length; k++) {
      const glued = inner[k] === "A:cable";
      if (u + (glued ? 3 : 1) > U - 2) break;
      inPos.push(u);
      u += glued ? 2 : 3;
    }
    const ni = inPos.length;
    const row = (j: number, v: number): [number, number, number, number] => [4 + 3 * j, v, 5 + 3 * j, v + 1];
    let best: { ox: number; oy: number; d: number; long: boolean } | null = null;
    let bs = Infinity;
    for (let d = 0; d < 4; d++) {
      const nd = (d + 1) & 3;
      const X = (ox: number, u: number, v: number) => ox + u * DX[d] + v * DX[nd];
      const Y = (oy: number, u: number, v: number) => oy + u * DY[d] + v * DY[nd];
      for (let oy = cy - radius; oy <= cy + radius; oy += 2) {
        for (let ox = cx - radius; ox <= cx + radius; ox += 2) {
          const mid = Math.hypot(X(ox, U >> 1, 2) - cx, Y(oy, U >> 1, 2) - cy) * 0.3;
          if (mid >= bs || !free(ox, oy, d, -4, -1, U, 6)) continue;
          const long = free(ox, oy, d, -12, 0, -5, 6);
          const end = long ? -12 : -4;
          let w = weight(X(ox, 0, 2), Y(oy, 0, 2), X(ox, end, 3), Y(oy, end, 3)) + mid;
          if (w >= bs) continue;
          let n = ni + (long ? 4 : 0);
          for (let j = 0; j < cols; j++) {
            if (free(ox, oy, d, ...row(j, -3))) n++;
            if (free(ox, oy, d, ...row(j, 7))) n++;
          }
          if (n < min) continue;
          // chaque atelier en moins vaut huit cases de détour
          w += (ni + cols * 2 + 4 - n) * 8;
          if (w >= bs) continue;
          bs = w;
          best = { ox, oy, d, long };
        }
      }
    }
    if (!best) return this.fail("pas de place pour l'arsenal");
    const { ox, oy, d, long } = best;
    const m: Module = { id: ARSENAL_ID, ox, oy, d, L: 30, H: 0, cursor: [0, 0], hi: [0, 0], frontier: 0, slots: [], bus: [], cx: 0, cy: 0, full: true, feeders: 0, use: 0, prod: 0, role: "arsenal" };
    m.cx = this.wx(m, U >> 1, 2);
    m.cy = this.wy(m, U >> 1, 2);
    const spots: { u0: number; v: number }[] = [];
    for (let j = 0; j < cols; j++) for (const v of [-3, 7]) if (free(ox, oy, d, ...row(j, v))) spots.push({ u0: 4 + 3 * j, v });
    // emprise réservée (avec un couloir d'une case autour) ; le bout du tapis d'amenée reste ouvert
    const end = long ? -12 : -4;
    for (let u = end; u <= U + 1; u++) {
      for (let v = -4; v <= 9; v++) {
        const x = this.wx(m, u, v);
        const y = this.wy(m, u, v);
        if (!this.inside(x, y) || this.plan[this.idx(x, y)] !== P_FREE) continue;
        const open = u <= end + (long ? 0 : 1) && v >= 1 && v <= 5;
        // (des tapis peuvent longer l'arsenal, pas des bâtiments : un fabricant collé à un autre lui donne ses produits)
        const inside = u >= -4 ? v >= -3 && v <= 8 && u <= U : v >= 0 && v <= 6;
        this.plan[this.idx(x, y)] = !open && inside ? P_RES : P_KEEP;
      }
    }
    const plus = this.ldir(m, 0, 1);
    const minus = this.ldir(m, 0, -1);
    const base: Placement[] = [];
    const tiles: [number, number][] = [];
    const [dx, dy] = this.sq(m, 0, 2, 2);
    base.push({ kind: this.ids.b.depot, x: dx, y: dy, dir: 0, tag: "depot" });
    this.mark(dx, dy, 2, P_DEPOT);
    for (let t = 0; t < 4; t++) this.bnet[this.idx(dx + (t & 1), dy + (t >> 1))] = ARSENAL_ID * 2 + 2;
    m.hub = [this.wx(m, 0, 2), this.wy(m, 0, 2)];
    const put = (u: number, v: number, dir: number) => {
      const x = this.wx(m, u, v);
      const y = this.wy(m, u, v);
      base.push({ kind: belt, x, y, dir, tag: "bus" });
      this.mark(x, y, 1, P_BLD);
      tiles.push([x, y]);
    };
    // départ de la boucle, pour le troisième bras du dépôt
    put(-2, 2, minus);
    put(-2, 1, minus);
    put(-2, 0, d);
    put(-1, 0, d);
    for (let u = 0; u < U; u++) put(u, 0, d);
    for (let v = 0; v < 5; v++) put(U, v, plus);
    for (let u = U; u >= 2; u--) put(u, 5, (d + 2) & 3);
    put(1, 5, minus);
    put(1, 4, minus);
    const arm = (u: number, v: number, dir: number) => {
      const x = this.wx(m, u, v);
      const y = this.wy(m, u, v);
      this.mark(x, y, 1, P_BLD);
      return { x, y, dir };
    };
    for (const u of [0, 1]) base.push({ kind: this.ids.b.inserter, ...arm(u, 1, minus), tag: "out" });
    base.push({ kind: this.ids.b.inserter, ...arm(-1, 2, (d + 2) & 3), tag: "out" });
    // tapis d'amenée : les mines et la liaison le rejoignent par son bout
    for (let u = end + 1; u < 0; u++) {
      put(u, 3, d);
      const i = this.idx(this.wx(m, u, 3), this.wy(m, u, 3));
      if (u <= end + (long ? 3 : 1)) this.plan[i] = P_BELT;
      this.bdir[i] = d;
      this.bnet[i] = ARSENAL_ID * 2 + 2;
    }
    // fonderies d'acier sur le tapis d'amenée (pas sur le dépôt : un bras du dépôt qui ne trouve rien à
    // prendre garderait son tour et bloquerait les bras de la boucle)
    const steel: ArsenalSlot[] = [];
    const gaps: [number, number][] = [];
    if (long) {
      for (const u0 of [-8, -5]) {
        for (const v of [0, 5]) {
          const [x, y] = this.sq(m, u0, v, 2);
          this.mark(x, y, 2, P_BLD);
          steel.push({ type: "F:steel", x, y, ins: arm(u0, v === 0 ? 2 : 4, v === 0 ? minus : plus), outs: arm(u0 + 1, v === 0 ? 2 : 4, v === 0 ? plus : minus), tries: 0, next: 0 });
        }
      }
      gaps.push([this.wx(m, -9, 2), this.wy(m, -9, 2)], [this.wx(m, -3, 4), this.wy(m, -3, 4)], [this.wx(m, -6, 1), this.wy(m, -6, 1)]);
    }
    const slots: ArsenalSlot[] = [];
    const add = (type: string, u0: number, v: number) => {
      const [x, y] = this.sq(m, u0, v, 2);
      this.mark(x, y, 2, P_BLD);
      const ins = v === 2 ? arm(u0, 1, plus) : v === -3 ? arm(u0, -1, minus) : arm(u0, 6, plus);
      const outs = v === 2 ? arm(u0 + 1, 4, plus) : v === -3 ? arm(u0 + 1, -1, plus) : arm(u0 + 1, 6, minus);
      slots.push({ type, x, y, ins, outs, loop: true, tries: 0, next: 0 });
    };
    for (let k = 0; k < ni; k++) {
      add(inner[k], inPos[k], 2);
      gaps.push([this.wx(m, inPos[k] + 1, 1), this.wy(m, inPos[k] + 1, 1)], [this.wx(m, inPos[k], 4), this.wy(m, inPos[k], 4)]);
    }
    // ateliers extérieurs : d'abord ceux que la rangée centrale n'a pas pu prendre
    const list = [...outer.slice(0, 2), ...inner.slice(ni), ...outer.slice(2)];
    if (!long) list.splice(1, 0, "F:steel", "F:steel", "F:steel");
    spots.forEach(({ u0, v }, t) => {
      if (t < list.length) add(list[t], u0, v);
    });
    if (steel.length) {
      slots.splice(3, 0, steel[0]);
      slots.splice(8, 0, steel[1]);
      slots.push(steel[2], steel[3]);
    }
    // aucun relais devant le bout du tapis d'amenée, ni sur le chemin qui y mène
    const mouth: number[] = [];
    for (let k = 0; k < 4; k++) for (const v of [2, 3, 4]) {
      const x = this.wx(m, end - k, v);
      const y = this.wy(m, end - k, v);
      if (this.inside(x, y) && (this.plan[this.idx(x, y)] === P_KEEP || this.plan[this.idx(x, y)] === P_FREE)) mouth.push(this.idx(x, y));
    }
    const was = mouth.map((i) => this.plan[i]);
    for (const i of mouth) this.plan[i] = P_RES;
    if (long) for (const v of [2, 4]) for (const u of [-11, -10]) gaps.push([this.wx(m, u, v), this.wy(m, u, v)]);
    this.robust(() => {
      base.push(...this.powerBelts(tiles, gaps));
      return base;
    });
    mouth.forEach((i, k) => {
      if (this.plan[i] === P_RES) this.plan[i] = was[k];
    });
    return { mod: m, depot: [dx, dy], base, slots };
  }

  /** Longueur du tapis qui irait d'une face libre du dépôt (dx, dy) à chaque case (jusqu'à `r` cases de lui). */
  linkReach(dx: number, dy: number, r: number): Map<number, number> {
    const seen = new Map<number, number>();
    const queue: number[] = [];
    const add = (x: number, y: number, n: number) => {
      if (Math.abs(x - dx) > r || Math.abs(y - dy) > r || !this.inside(x, y)) return;
      const i = this.idx(x, y);
      if (seen.has(i) || !this.beltFree(x, y)) return;
      seen.set(i, n);
      queue.push(i);
    };
    for (let k = 0; k < 2; k++) {
      for (const [x, y, d] of [[dx + 2, dy + k, 0], [dx + k, dy + 2, 1], [dx - 1, dy + k, 2], [dx + k, dy - 1, 3]]) {
        if (!this.inside(x, y)) continue;
        const p = this.plan[this.idx(x, y)];
        if ((p === P_FREE || p === P_KEEP) && this.sim.canPlace(this.slot, this.ids.b.inserter, x, y, 0)) add(x + DX[d], y + DY[d], 1);
      }
    }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      const n = (seen.get(i) as number) + 1;
      for (let d = 0; d < 4; d++) add((i % this.w) + DX[d], ((i / this.w) | 0) + DY[d], n);
    }
    return seen;
  }

  /**
   * Liaison d'un dépôt (dx, dy) au réseau `net` d'un module : un bras sur une de ses faces libres, qui pose
   * sur un tapis jusqu'au réseau (ou directement sur un tapis de ce réseau : liaison doublée).
   */
  planLink(dx: number, dy: number, m: Module, net: number, maxNodes = 30000): Placement[] | null {
    const ins = this.ids.b.inserter;
    const faces: [number, number, number][] = [];
    for (let k = 0; k < 2; k++) faces.push([dx + 2, dy + k, 0], [dx + k, dy + 2, 1], [dx - 1, dy + k, 2], [dx + k, dy - 1, 3]);
    let best: number[] | null = null;
    let arm: [number, number, number] | null = null;
    let fails = 0;
    for (const [x, y, d] of faces) {
      const x1 = x + DX[d];
      const y1 = y + DY[d];
      if (!this.inside(x, y) || !this.inside(x1, y1)) continue;
      const i = this.idx(x, y);
      if ((this.plan[i] !== P_FREE && this.plan[i] !== P_KEEP) || !this.sim.canPlace(this.slot, ins, x, y, 0)) continue;
      const j = this.idx(x1, y1);
      if (this.plan[j] === P_BELT && this.bnet[j] === net) {
        best = [];
        arm = [x, y, d];
        break;
      }
      if (!this.beltFree(x1, y1)) continue;
      const saved = this.plan[i];
      this.plan[i] = P_BLD;
      const path = this.astar(x1, y1, m, net, maxNodes, best ? best.length : 1e9);
      this.plan[i] = saved;
      if (path && (!best || path.length < best.length)) {
        best = path;
        arm = [x, y, d];
      }
      // (recherche longue : deux échecs suffisent, les autres faces donnent sur la même zone)
      if (!path && !best && ++fails >= 2) break;
    }
    if (!best || !arm) return this.fail("pas de chemin depuis le dépôt");
    this.mark(arm[0], arm[1], 1, P_BLD);
    const places: Placement[] = [{ kind: ins, x: arm[0], y: arm[1], dir: arm[2], tag: "out" }];
    places.push(...this.pathPlaces(best, net));
    const tiles = this.pathTiles(best);
    const [ax, ay] = arm;
    this.robust(() => {
      places.push(...this.powerBelts(tiles), ...this.ensurePower(ax, ay, 1, 1));
      return places;
    });
    m.feeders++;
    return places;
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
  /** Zone d'un poteau existant agrandie (générateur principal amélioré). */
  setPoleRange(x: number, y: number, supply: number, connect: number): void {
    const p = this.poles.find((q) => q.x === x && q.y === y);
    if (p) {
      p.supply = supply;
      p.connect = connect;
    }
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
    if (this.noGen) {
      const pos = this.findFree(pyl, x + (w >> 1), y + (h >> 1), 1, pd.supply, 0);
      return pos && this.supplies(pos[0], pos[1], 1, pd.supply, x, y, w, h) ? [this.takePole(pyl, pos[0], pos[1])] : [];
    }
    // générateur qui couvre directement le rectangle
    const sup = gd.supply;
    let bestG: [number, number] | null = null;
    bestD = 1e9;
    for (let gy = y - sup - 1; gy < y + h + sup; gy++) {
      for (let gx = x - sup - 1; gx < x + w + sup; gx++) {
        if (!this.supplies(gx, gy, 2, sup, x, y, w, h)) continue;
        const d = Math.abs(gx - x) + Math.abs(gy - y);
        if (d >= bestD || !this.genFits(gx, gy)) continue;
        bestD = d;
        bestG = [gx, gy];
      }
    }
    if (bestG) return this.takeGen(bestG[0], bestG[1]);
    // pylône isolé + générateur hors de la bande
    if (lonely) {
      const link = this.linkPylon(lonely[0], lonely[1]);
      if (link) return [...link, this.takePole(pyl, lonely[0], lonely[1])];
    }
    if (process.env.BOTDEBUG) console.log("pas d'énergie pour", x, y, w, h);
    return [];
  }

  /** Réseau électrique de chaque poteau prévu (numéro de groupe), de proche en proche. */
  powerGroups(): number[] {
    const g = this.poles.map(() => -1);
    let n = 0;
    for (let a = 0; a < this.poles.length; a++) {
      if (g[a] >= 0) continue;
      g[a] = n;
      const stack = [a];
      while (stack.length) {
        const i = stack.pop() as number;
        const p = this.poles[i];
        for (let j = 0; j < this.poles.length; j++) {
          if (g[j] >= 0) continue;
          const q = this.poles[j];
          const r = Math.min(p.connect, q.connect);
          if ((p.x + p.s / 2 - q.x - q.s / 2) ** 2 + (p.y + p.s / 2 - q.y - q.s / 2) ** 2 > r * r) continue;
          g[j] = n;
          stack.push(j);
        }
      }
      n++;
    }
    return g;
  }

  /**
   * Relie le réseau électrique qui couvre (x, y) à celui de la base (le premier poteau : générateur
   * principal de départ), par une file de relais. Un réseau à part ne vivrait que de ses générateurs,
   * dont les drones ne trouvent pas forcément de combustible.
   */
  bridge(x: number, y: number): Placement[] {
    if (!this.poles.length) return [];
    const g = this.powerGroups();
    const pyl = this.ids.b.pylon;
    const step = this.ids.data.buildings[pyl].connect - 5;
    let mine = -1;
    // (une case couverte par deux réseaux peut dépendre de celui qui est éteint : tous sont reliés)
    for (let k = 0; k < this.poles.length && mine < 0; k++) {
      const p = this.poles[k];
      if (g[k] !== g[0] && this.supplies(p.x, p.y, p.s, p.supply, x, y, 1, 1)) mine = g[k];
    }
    if (mine < 0) return [];
    let best: [Pole, Pole] | null = null;
    let bd = Infinity;
    this.poles.forEach((p, a) => {
      if (g[a] !== mine) return;
      this.poles.forEach((q, b) => {
        if (g[b] !== g[0]) return;
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d < bd) {
          bd = d;
          best = [q, p];
        }
      });
    });
    if (!best) return [];
    const [q, p] = best as [Pole, Pole];
    const n = Math.ceil(Math.sqrt(bd) / step);
    const out: Placement[] = [];
    for (let k = 1; k < n; k++) {
      const px = Math.round(q.x + ((p.x - q.x) * k) / n);
      const py = Math.round(q.y + ((p.y - q.y) * k) / n);
      const pos = this.findFree(pyl, px, py, 0, 4, 0);
      if (pos) out.push(this.takePole(pyl, pos[0], pos[1]));
    }
    return out;
  }

  /** tracé sans générateur (voir `robust`) : les relais se posent sans lien, `bridgeAll` les relie ensuite */
  noGen = false;

  /**
   * Tracé d'un ouvrage dont l'alimentation ne doit dépendre d'aucun générateur : un générateur sans combustible
   * ne forme plus de zone et ne relie plus ses voisins. Seuls comptent les relais et le générateur principal,
   * et chaque zone est reliée à celle de la base par des relais.
   */
  robust(fn: () => Placement[] | null): Placement[] | null {
    const all = this.poles;
    const gen = this.ids.data.buildings[this.ids.b.generator].w;
    const kept = all.filter((p) => p.s !== gen);
    const n = kept.length;
    this.poles = kept;
    this.noGen = true;
    const places = fn();
    if (places) places.push(...this.bridgeAll(places));
    this.noGen = false;
    this.poles = [...all, ...kept.slice(n)];
    return places;
  }

  /** Relie à la base le réseau qui couvre chaque placement (une seule case hors tension arrête toute une file). */
  bridgeAll(places: Placement[]): Placement[] {
    const out: Placement[] = [];
    for (const p of places) if (this.ids.data.buildings[p.kind].powerUse > 0) out.push(...this.bridge(p.x, p.y));
    return out;
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
    if (g) return this.takeGen(g[0], g[1]);
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
      if (g2) return [...this.takeGen(g2[0], g2[1]), this.takePole(pyl, rx, ry)];
    }
    return null;
  }

  /**
   * Relais le long d'une file de tapis : une file entière s'arrête dès qu'une seule de ses cases est
   * hors zone électrique. Chaque relais couvre le plus de cases encore hors zone et se relie au réseau
   * (relais prévus compris), de proche en proche depuis le bout déjà alimenté ; un relais isolé est
   * relié par linkPylon (relais intermédiaire ou générateur). Relais sur des cases libres près des
   * tapis, ou sur les cases `extra` (bande d'un module, loin des ateliers) ; la zone de tête d'un
   * module (gardée pour les tapis d'amenée) seulement à défaut.
   */
  powerBelts(tiles: [number, number][], extra: [number, number][] = []): Placement[] {
    const pyl = this.ids.b.pylon;
    const pd = this.ids.data.buildings[pyl];
    const sup = pd.supply;
    const out: Placement[] = [];
    let unc = tiles.filter(([x, y]) => !this.covered(x, y, 1, 1));
    const extraSet = new Set<number>();
    for (const [x, y] of extra) if (this.inside(x, y)) extraSet.add(this.idx(x, y));
    for (let guard = 0; unc.length > 0 && guard < 40; guard++) {
      const seen = new Set<number>();
      const cands: number[] = [];
      const add = (x: number, y: number) => {
        if (!this.inside(x, y)) return;
        const i = this.idx(x, y);
        if (seen.has(i)) return;
        seen.add(i);
        const p = this.plan[i];
        if (p === P_FREE || p === P_KEEP || (p === P_RES && extraSet.has(i))) cands.push(i);
      };
      for (const [x, y] of unc) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) add(x + dx, y + dy);
      for (const i of extraSet) add(i % this.w, (i / this.w) | 0);
      let best = -1;
      let bestScore = -1e9;
      let bestLinked = false;
      for (const i of cands) {
        const x = i % this.w;
        const y = (i / this.w) | 0;
        let cover = 0;
        for (const [tx, ty] of unc) if (Math.abs(tx - x) <= sup && Math.abs(ty - y) <= sup) cover++;
        if (cover === 0) continue;
        const score = cover - (this.plan[i] === P_KEEP ? 4 : 0);
        const linked = this.connected(x, y, 1, pd.connect);
        if (bestLinked && !linked) continue;
        if (linked === bestLinked && score <= bestScore) continue;
        if (!this.sim.canPlace(this.slot, pyl, x, y, 0)) continue;
        best = i;
        bestScore = score;
        bestLinked = linked;
      }
      if (best < 0) break;
      const x = best % this.w;
      const y = (best / this.w) | 0;
      if (!bestLinked && !this.noGen) {
        const link = this.linkPylon(x, y);
        if (!link) break;
        out.push(...link);
      }
      out.push(this.takePole(pyl, x, y));
      unc = unc.filter(([tx, ty]) => !this.covered(tx, ty, 1, 1));
    }
    if (unc.length > 0 && process.env.BOTDEBUG) console.log("tapis hors zone :", unc.length, "cases");
    return out;
  }

  /** Tapis principal d'un module, avec les relais qui le gardent en zone (rangées extérieures de la bande). */
  busPlaces(m: Module): Placement[] {
    const tiles: [number, number][] = m.bus.filter((p) => p.kind !== this.ids.b.depot).map((p) => [p.x, p.y]);
    const extra: [number, number][] = [];
    for (let u = m.H; u < m.L; u++) for (const v of [-(BAND - 1), BAND - 1]) extra.push([this.wx(m, u, v), this.wy(m, u, v)]);
    return [...m.bus, ...this.powerBelts(tiles, extra)];
  }

  /**
   * Géométrie d'une cellule d'après la taille des bâtiments : bâtiments séparés d'une colonne libre
   * (bras de liaison sur la rangée médiane des deux bâtiments, pylône sur la rangée des bras du tapis),
   * un pylône après le dernier bâtiment.
   */
  cellGeom(cell: CellDef): CellGeom {
    const ws = cell.comps.map((c) => this.ids.data.buildings[this.ids.b[c.key]].w);
    const du: number[] = [];
    let u = 0;
    for (const w of ws) {
      du.push(u);
      u += w + 1;
    }
    const links: CellGeom["links"] = [];
    const pylons: number[] = [];
    for (let k = 0; k + 1 < ws.length; k++) {
      const gap = du[k] + ws[k];
      pylons.push(gap);
      const dir = cell.chain[k] ?? 0;
      // rangée commune aux deux bâtiments (ils commencent à la rangée 2)
      if (dir !== 0) links.push({ du: gap, row: 2 + ((Math.min(ws[k], ws[k + 1]) - 1) >> 1), dir });
    }
    const end = du[ws.length - 1] + ws[ws.length - 1];
    pylons.push(end);
    return { du, links, pylons, width: end + 1 };
  }

  /**
   * Réserve une cellule (bâtiments reliés par des bras, sans passer par le tapis principal) du côté
   * consommateurs du module (depuis le dépôt).
   */
  allocCell(m: Module, cell: CellDef): CellSlot | null {
    const ins = this.ids.b.inserter;
    const pyl = this.ids.b.pylon;
    const g = this.cellGeom(cell);
    const W = g.width;
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
      const comps: { kind: number; x: number; y: number; dir: number; w: number; c: CellComp; du: number }[] = [];
      let ok = true;
      for (const [ci, c] of cell.comps.entries()) {
        const kind = this.ids.b[c.key];
        const w = this.ids.data.buildings[kind].w;
        const v0 = side > 0 ? 2 : -(1 + w);
        const [bx, by] = this.sq(m, u0 + g.du[ci], v0, w);
        const dir = c.faceOut ? this.ldir(m, 0, side) : 0;
        if (!this.rectFree(kind, bx, by, dir, w, true)) {
          ok = false;
          break;
        }
        comps.push({ kind, x: bx, y: by, dir, w, c, du: g.du[ci] });
      }
      if (!ok) continue;
      const inserters: Placement[] = [];
      let lastOut = -1;
      for (const c of comps) {
        if (c.c.busIn) {
          const x = this.wx(m, u0 + c.du, side);
          const y = this.wy(m, u0 + c.du, side);
          inserters.push({ kind: ins, x, y, dir: this.ldir(m, 0, side), tag: "in" });
        }
        if (c.c.busOut) {
          const x = this.wx(m, u0 + c.du + 1, side);
          const y = this.wy(m, u0 + c.du + 1, side);
          inserters.push({ kind: ins, x, y, dir: this.ldir(m, 0, -side), tag: "out" });
          lastOut = Math.max(lastOut, u0 + c.du + 1);
        }
      }
      for (const l of g.links) {
        const x = this.wx(m, u0 + l.du, side * l.row);
        const y = this.wy(m, u0 + l.du, side * l.row);
        inserters.push({ kind: ins, x, y, dir: this.ldir(m, l.dir, 0), tag: "link" });
      }
      const pylons: [number, number][] = g.pylons.map((du) => [this.wx(m, u0 + du, side), this.wy(m, u0 + du, side)]);
      for (const p of inserters) if (!this.rectFree(ins, p.x, p.y, 0, 1, true)) ok = false;
      for (const [x, y] of pylons) if (!this.rectFree(pyl, x, y, 0, 1, true)) ok = false;
      if (!ok) continue;
      const places: Placement[] = [];
      const slots: Slot[] = [];
      for (const c of comps) {
        const recipe = c.c.recipe !== undefined ? this.ids.r[c.c.recipe] : undefined;
        places.push({ kind: c.kind, x: c.x, y: c.y, dir: c.dir, recipe, tag: c.c.type });
        this.mark(c.x, c.y, c.w, P_BLD);
        slots.push({ side, u0: u0 + c.du, w: c.w, kind: c.kind, x: c.x, y: c.y, dir: c.dir, type: c.c.type, places: [places[places.length - 1]], cell: true, busOut: c.c.busOut === true });
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
          const ex = this.wx(m, u0 + c.du + (c.w >> 1), side * (1 + c.w + k));
          const ey = this.wy(m, u0 + c.du + (c.w >> 1), side * (1 + c.w + k));
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

  // ---------- Combustible ----------
  // Un générateur ne produit rien sans combustible : chacun reçoit un dépôt collé, qui y verse
  // l'hydrocarbure de la réserve ; la réserve est remplie par des extracteurs d'hydrocarbure collés à un
  // dépôt (« mines de combustible », sans électricité).

  /** Cases du plan acceptées pour un dépôt de combustible ou une mine de combustible. */
  fuelCellOk(x: number, y: number, keep: boolean): boolean {
    if (!this.inside(x, y)) return false;
    const p = this.plan[this.idx(x, y)];
    return p === P_FREE || p === P_RES || (keep && p === P_KEEP);
  }

  /**
   * Cases collées aux faces d'un dépôt (x, y), hors du rectangle (ex, ey, es) du bâtiment qu'il sert.
   * Un fabricant ou un extracteur collé à un dépôt y verserait ses produits (transfert direct) : un
   * assembleur d'engrenages destiné à une usine viderait le tapis principal dans la réserve.
   */
  depotRing(x: number, y: number, ex: number, ey: number, es: number): [number, number][] {
    const out: [number, number][] = [];
    for (let k = 0; k < 2; k++) out.push([x - 1, y + k], [x + 2, y + k], [x + k, y - 1], [x + k, y + 2]);
    return out.filter(([tx, ty]) => !(tx >= ex && tx < ex + es && ty >= ey && ty < ey + es));
  }

  /** Aucun bâtiment (prévu ou construit) collé au dépôt, hors du bâtiment qu'il sert. */
  ringClear(x: number, y: number, ex: number, ey: number, es: number): boolean {
    for (const [tx, ty] of this.depotRing(x, y, ex, ey, es)) {
      if (!this.inside(tx, ty)) continue;
      const p = this.plan[this.idx(tx, ty)];
      if (p === P_BLD || p === P_DEPOT) return false;
      const ti = this.sim.tileInfo(tx, ty);
      // bâtiment construit hors du plan (tapis exceptés : ils ne versent que devant eux)
      if (ti > 0 && this.ids.data.buildings[(ti & 0xff) - 1]?.cls !== this.beltCls) return false;
    }
    return true;
  }
  get beltCls(): number {
    return this.ids.data.buildings[this.ids.b.belt1].cls;
  }

  /**
   * Emplacement d'un dépôt collé à une face du bâtiment carré (bx, by, s) : un dépôt collé à un
   * générateur l'alimente depuis la réserve. `keep` : la zone de tête d'un module est permise.
   */
  depotSpotNear(bx: number, by: number, s: number, keep: boolean): [number, number] | null {
    const dep = this.ids.b.depot;
    const cands: [number, number][] = [];
    for (let k = -1; k < s; k++) {
      cands.push([bx - 2, by + k], [bx + s, by + k], [bx + k, by - 2], [bx + k, by + s]);
    }
    // de préférence hors de la bande d'un module et de sa zone de tête (places des ateliers et tapis)
    let best: [number, number] | null = null;
    let bestCost = 1e9;
    for (const [x, y] of cands) {
      let ok = true;
      let cost = 0;
      for (let t = 0; t < 4 && ok; t++) {
        if (!this.fuelCellOk(x + (t & 1), y + (t >> 1), keep)) ok = false;
        else if (this.plan[this.idx(x + (t & 1), y + (t >> 1))] !== P_FREE) cost += 3;
      }
      if (!ok || cost >= bestCost) continue;
      for (const [tx, ty] of this.depotRing(x, y, bx, by, s)) if (this.inside(tx, ty) && this.plan[this.idx(tx, ty)] === P_RES) cost++;
      if (cost >= bestCost || !this.sim.canPlace(this.slot, dep, x, y, 0) || !this.ringClear(x, y, bx, by, s)) continue;
      bestCost = cost;
      best = [x, y];
    }
    return best;
  }

  /** Générateur (2 × 2) posable en (gx, gy), avec la place d'un dépôt collé pour son combustible. */
  genFits(gx: number, gy: number): boolean {
    return this.rectFree(this.ids.b.generator, gx, gy, 0, 2, false) && this.depotSpotNear(gx, gy, 2, false) !== null;
  }

  /** Générateur et son dépôt de combustible collé (voir genFits). */
  takeGen(gx: number, gy: number): Placement[] {
    const d = this.depotSpotNear(gx, gy, 2, false);
    const out = [this.takePole(this.ids.b.generator, gx, gy)];
    if (d) out.push(this.takeFuelDepot(d[0], d[1], gx, gy, 2));
    return out;
  }

  /** Dépôt de combustible collé au bâtiment (ex, ey, es) ; ses autres faces restent libres de bâtiments. */
  takeFuelDepot(x: number, y: number, ex: number, ey: number, es: number): Placement {
    this.mark(x, y, 2, P_BLD);
    for (const [tx, ty] of this.depotRing(x, y, ex, ey, es)) {
      if (!this.inside(tx, ty)) continue;
      const i = this.idx(tx, ty);
      if (this.plan[i] === P_FREE || this.plan[i] === P_RES) this.plan[i] = P_LANE;
    }
    return { kind: this.ids.b.depot, x, y, dir: 0, tag: "fuel" };
  }

  /** Bâtiment déjà sur la carte (générateur principal de départ) : case occupée, et pôle s'il alimente. */
  addExisting(kind: number, x: number, y: number): void {
    const d = this.ids.data.buildings[kind];
    this.mark(x, y, d.w, P_BLD);
    if (d.supply > 0 && !this.poles.some((p) => p.x === x && p.y === y)) this.addPole(kind, x, y);
  }

  /**
   * Mine de combustible : extracteur sur un gisement d'hydrocarbure (il tourne sans électricité) et
   * dépôt collé devant lui, qui met l'hydrocarbure en réserve.
   */
  planFuelMine(sx: number, sy: number): Placement[] | null {
    const ext = this.ids.b.extractor;
    const dep = this.ids.b.depot;
    if (!this.sim.canPlace(this.slot, ext, sx, sy, 0)) return this.fail("extracteur impossible à poser");
    for (let t = 0; t < 4; t++) if (!this.fuelCellOk(sx + (t & 1), sy + (t >> 1), true)) return this.fail("case du gisement réservée");
    let best: { dir: number; x: number; y: number; keep: number } | null = null;
    for (let dir = 0; dir < 4; dir++) {
      const x = dir === 0 ? sx + 2 : dir === 2 ? sx - 2 : sx;
      const y = dir === 1 ? sy + 2 : dir === 3 ? sy - 2 : sy;
      let ok = true;
      let keep = 0;
      for (let t = 0; t < 4 && ok; t++) {
        if (!this.fuelCellOk(x + (t & 1), y + (t >> 1), true)) ok = false;
        else if (this.plan[this.idx(x + (t & 1), y + (t >> 1))] === P_KEEP) keep++;
      }
      if (!ok || !this.sim.canPlace(this.slot, dep, x, y, 0) || !this.ringClear(x, y, sx, sy, 2)) continue;
      // de préférence hors de la zone de tête d'un module (gardée pour les tapis d'amenée)
      if (!best || keep < best.keep) best = { dir, x, y, keep };
    }
    if (!best) return this.fail("pas de place pour le dépôt");
    this.mark(sx, sy, 2, P_BLD);
    return [{ kind: ext, x: sx, y: sy, dir: best.dir, tag: "extractor" }, this.takeFuelDepot(best.x, best.y, sx, sy, 2)];
  }

  /**
   * Raffinerie sur le dépôt d'une mine de combustible (extracteur en (sx, sy)) : un bras l'alimente depuis ce
   * dépôt, un autre y remet le carburant, où les drones et les relais logistiques viennent le prendre.
   */
  planMineRefinery(sx: number, sy: number, dx: number, dy: number): Placement[] | null {
    const ins = this.ids.b.inserter;
    const ref = this.ids.b.refinery;
    const ok = (x: number, y: number) => this.inside(x, y) && (this.plan[this.idx(x, y)] === P_FREE || this.plan[this.idx(x, y)] === P_LANE || this.plan[this.idx(x, y)] === P_KEEP);
    const opts: { rx: number; ry: number; a: [number, number, number]; b: [number, number, number] }[] = [
      { rx: dx + 3, ry: dy, a: [dx + 2, dy, 0], b: [dx + 2, dy + 1, 2] },
      { rx: dx, ry: dy + 3, a: [dx, dy + 2, 1], b: [dx + 1, dy + 2, 3] },
      { rx: dx - 3, ry: dy, a: [dx - 1, dy, 2], b: [dx - 1, dy + 1, 0] },
      { rx: dx, ry: dy - 3, a: [dx, dy - 1, 3], b: [dx + 1, dy - 1, 1] },
    ];
    for (const o of opts) {
      let free = ok(o.a[0], o.a[1]) && ok(o.b[0], o.b[1]);
      for (let t = 0; t < 4 && free; t++) {
        const x = o.rx + (t & 1);
        const y = o.ry + (t >> 1);
        free = ok(x, y) && !(x >= sx - 1 && x < sx + 3 && y >= sy - 1 && y < sy + 3);
      }
      if (!free || !this.sim.canPlace(this.slot, ref, o.rx, o.ry, 0) || !this.sim.canPlace(this.slot, ins, o.a[0], o.a[1], 0) || !this.sim.canPlace(this.slot, ins, o.b[0], o.b[1], 0)) continue;
      const places: Placement[] = [
        { kind: ref, x: o.rx, y: o.ry, dir: 0, tag: "R:fuel" },
        { kind: ins, x: o.a[0], y: o.a[1], dir: o.a[2], tag: "in" },
        { kind: ins, x: o.b[0], y: o.b[1], dir: o.b[2], tag: "out" },
      ];
      this.mark(o.rx, o.ry, 2, P_BLD);
      this.mark(o.a[0], o.a[1], 1, P_BLD);
      this.mark(o.b[0], o.b[1], 1, P_BLD);
      return this.robust(() => {
        for (const p of places.slice()) {
          const s = this.ids.data.buildings[p.kind].w;
          places.push(...this.ensurePower(p.x, p.y, s, s));
        }
        return places;
      });
    }
    return this.fail("pas de place pour la raffinerie");
  }

  findGenNear(px: number, py: number, r: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = 1e9;
    const R = Math.ceil(r) + 1;
    for (let gy = py - R; gy <= py + R; gy++) {
      for (let gx = px - R; gx <= px + R; gx++) {
        const dx = gx + 1 - (px + 0.5);
        const dy = gy + 1 - (py + 0.5);
        const d = dx * dx + dy * dy;
        if (d > r * r || d >= bestD) continue;
        if (!this.genFits(gx, gy)) continue;
        bestD = d;
        best = [gx, gy];
      }
    }
    return best;
  }

  /** Générateur supplémentaire relié au réseau d'un module (production d'énergie), avec son dépôt de combustible. */
  planGenerator(m: Module): Placement[] | null {
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
        if (!this.genFits(gx, gy)) continue;
        // ne pas coller les générateurs aux tapis d'amenée
        bestD = d;
        best = [gx, gy];
      }
    }
    if (!best) return null;
    return this.takeGen(best[0], best[1]);
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
    if (m.hub) return m.hub;
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
    this.lastFail = "";
    if (!this.sim.canPlace(this.slot, ext, sx, sy, 0)) return this.fail("extracteur impossible à poser");
    // le gisement peut mordre sur le couloir qui borde un module (extracteur seul, la fonderie reste dehors)
    for (let ty = sy; ty < sy + 2; ty++) for (let tx = sx; tx < sx + 2; tx++) if (this.plan[this.idx(tx, ty)] !== P_FREE && this.plan[this.idx(tx, ty)] !== P_KEEP && this.plan[this.idx(tx, ty)] !== P_LANE) return this.fail("case du gisement réservée (" + this.plan[this.idx(tx, ty)] + ")");
    const [hx, hy] = this.netTarget(m, net);
    const inE = (x: number, y: number) => x >= sx && x < sx + 2 && y >= sy && y < sy + 2;
    // arsenal : pas de tapis devant l'extracteur, à côté de la fonderie (il y verserait du minerai brut)
    const front = (d: number): [number, number][] => {
      if (!m.hub) return [];
      return d === 0 ? [[sx + 2, sy], [sx + 2, sy + 1]] : d === 1 ? [[sx, sy + 2], [sx + 1, sy + 2]] : d === 2 ? [[sx - 1, sy], [sx - 1, sy + 1]] : [[sx, sy - 1], [sx + 1, sy - 1]];
    };
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
        // la fonderie d'un gisement pris dans la zone de tête d'un module peut s'y poser aussi (le
        // générateur principal posé au départ repousse souvent le module sur les gisements proches)
        let free = true;
        for (let t = 0; t < 4 && free; t++) {
          const tx = fx + (t & 1);
          const ty = fy + (t >> 1);
          free = this.inside(tx, ty) && (this.plan[this.idx(tx, ty)] === P_FREE || this.plan[this.idx(tx, ty)] === P_KEEP);
        }
        if (!free || !this.sim.canPlace(this.slot, fur, fx, fy, 0)) continue;
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
          if (inE(bx, by) || inF(bx, by) || front(d).some(([x, y]) => x === bx && y === by)) continue;
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
      for (const [x, y] of front(c.d)) if (this.plan[this.idx(x, y)] !== P_BLD) block(x, y);
      const path = this.astar(c.bx, c.by, m, net, maxNodes, best ? best.path.length : 1e9);
      for (let k = saved.length - 1; k >= 0; k--) this.plan[saved[k][0]] = saved[k][1];
      if (path && !this.startLeaks(path, net) && (!best || path.length < best.path.length)) best = { c, path };
    }
    if (!best) {
      // détail des positions de fonderie refusées (plan des cases, pose possible)
      const why = furnOpts.flat().map(([fx, fy]) => {
        const pl: number[] = [];
        for (let k = 0; k < 4; k++) pl.push(this.inside(fx + (k & 1), fy + (k >> 1)) ? this.plan[this.idx(fx + (k & 1), fy + (k >> 1))] : -1);
        return `${fx},${fy}:${pl.join("")}${this.sim.canPlace(this.slot, fur, fx, fy, 0) ? "" : "x"}`;
      });
      return this.fail(`pas de chemin (${cands.length} positions de fonderie, ${tried} essais) [${why.join(" ")}]`);
    }
    const c = best.c;
    const places: Placement[] = [];
    places.push({ kind: ext, x: sx, y: sy, dir: c.d, tag: "extractor" });
    this.mark(sx, sy, 2, P_BLD);
    places.push({ kind: fur, x: c.fx, y: c.fy, dir: 0, tag: "mine" });
    this.mark(c.fx, c.fy, 2, P_BLD);
    places.push({ kind: ins, x: c.ix, y: c.iy, dir: c.idir, tag: "out" });
    this.mark(c.ix, c.iy, 1, P_BLD);
    places.push(...this.pathPlaces(best.path, net));
    for (const [x, y] of front(c.d)) if (this.inside(x, y) && this.plan[this.idx(x, y)] === P_FREE) this.plan[this.idx(x, y)] = P_LANE;
    places.push(...this.powerBelts(this.pathTiles(best.path)));
    places.push(...this.ensurePower(sx, sy, 2, 2));
    places.push(...this.ensurePower(c.fx, c.fy, 2, 2));
    places.push(...this.ensurePower(c.ix, c.iy, 1, 1));
    m.feeders++;
    return places;
  }

  pathTiles(path: number[]): [number, number][] {
    return path.map((i) => [i % this.w, (i / this.w) | 0]);
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
    const net = m.id * 2 + (m.hub ? 2 : 1);
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
      if (path && !this.startLeaks(path, net) && (!best || path.length < best.path.length)) best = { dir, path };
    }
    if (!best) return null;
    const places: Placement[] = [];
    places.push({ kind: ext, x: sx, y: sy, dir: best.dir, tag: "extractor" });
    this.mark(sx, sy, 2, P_BLD);
    places.push(...this.pathPlaces(best.path, net));
    places.push(...this.powerBelts(this.pathTiles(best.path)));
    places.push(...this.ensurePower(sx, sy, 2, 2));
    m.feeders++;
    return places;
  }

  /**
   * Le premier tapis de ce chemin d'amenée (un début de file) serait-il une sortie d'un dépôt de module ou
   * d'arsenal ? Oui s'il part d'une face du dépôt (son arrière la touche) ou la longe (dépôt sur un côté) :
   * la simulation y pose alors le stock du dépôt, à la cadence du tapis (`takes_from_face`, `tick_depot`).
   * Ce stock repart en boucle sur le tapis principal et manque aux chantiers. Un tapis qui entre dans le
   * dépôt par son avant ne reçoit rien.
   */
  startLeaks(path: number[], net: number): boolean {
    if (!path.length) return false;
    const x = path[0] % this.w;
    const y = (path[0] / this.w) | 0;
    const d = path.length > 1 ? dirOf((path[1] % this.w) - x, ((path[1] / this.w) | 0) - y) : this.endDir(x, y, net);
    for (const side of [d + 1, d + 2, d + 3]) {
      const nx = x + DX[side & 3];
      const ny = y + DY[side & 3];
      if (this.inside(nx, ny) && this.plan[this.idx(nx, ny)] === P_DEPOT) return true;
    }
    return false;
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
