// Voisins « tapis » d'une case, côté client (fantôme de pose, orientation automatique, jonctions en T) :
// mêmes règles que la simulation (sim/src/belts.rs, belt_shape). Un répartiteur compte comme un tapis
// qui débouche sur chacune de ses sorties.

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Sorties d'un répartiteur tourné vers `dir` (masque : bit d pour la direction d), selon son mode :
 * 0 gauche, avant et droite ; 1 gauche et avant ; 2 avant et droite (buildings::splitter_outs).
 */
export function splitterOuts(dir: number, split: number): number {
  const left = 1 << ((dir + 3) & 3);
  const front = 1 << (dir & 3);
  const right = 1 << ((dir + 1) & 3);
  return split === 1 ? left | front : split === 2 ? front | right : left | front | right;
}

/** Ce qui entoure une case : tapis au sol terminés et répartiteurs terminés. */
export interface BeltNeighbours {
  /** direction du tapis en (x, y), sinon undefined */
  belt(x: number, y: number): number | undefined;
  /** sorties (masque de directions) du répartiteur en (x, y), sinon 0 */
  splitter(x: number, y: number): number;
}

/** Un tapis ou une sortie de répartiteur en (x, y) envoie-t-il ses objets dans la direction `d` ? */
export function feedsToward(n: BeltNeighbours, x: number, y: number, d: number): boolean {
  return n.belt(x, y) === d || (n.splitter(x, y) & (1 << d)) !== 0;
}

/**
 * Côtés par lesquels le tapis en (x, y) tourné vers `dir` est rejoint : 1 côté dir + 1, 2 côté dir + 3
 * (masque). Un côté le rejoint quand un tapis ou une sortie de répartiteur y pointe vers lui.
 */
export function sideFeeds(x: number, y: number, dir: number, n: BeltNeighbours): number {
  let m = 0;
  for (const [k, sd] of [[1, (dir + 1) & 3], [2, (dir + 3) & 3]]) {
    if (feedsToward(n, x + DX[sd], y + DY[sd], (sd + 2) & 3)) m |= k;
  }
  return m;
}

/**
 * Forme d'un tapis (belts::belt_shape) : 0 droit, 1 virage alimenté par le côté dir + 1, 2 par le côté
 * dir + 3. Droit s'il est alimenté par derrière ; virage s'il l'est par un seul côté.
 */
export function beltShape(x: number, y: number, dir: number, n: BeltNeighbours): number {
  const back = (dir + 2) & 3;
  if (feedsToward(n, x + DX[back], y + DY[back], dir)) return 0;
  const m = sideFeeds(x, y, dir, n);
  return m === 1 || m === 2 ? m : 0;
}

/**
 * Direction automatique d'un tapis posé seul en (x, y) : il prolonge le tapis ou la sortie de
 * répartiteur qui débouche sur sa case, sinon il alimente un tapis voisin (qui ne pointe pas vers lui)
 * ou l'arrière d'un répartiteur ; sinon `fallback`. `n` ne contient que nos tapis et répartiteurs ;
 * `splitterDir` : direction du répartiteur en (x, y), sinon undefined.
 */
export function autoBeltDir(x: number, y: number, n: BeltNeighbours, splitterDir: (x: number, y: number) => number | undefined, fallback: number): number {
  for (let d = 0; d < 4; d++) {
    if (feedsToward(n, x - DX[d], y - DY[d], d)) return d;
  }
  for (let d = 0; d < 4; d++) {
    const b = n.belt(x + DX[d], y + DY[d]);
    if (b !== undefined && b !== ((d + 2) & 3)) return d;
    if (splitterDir(x + DX[d], y + DY[d]) === d) return d;
  }
  return fallback;
}

// ---------- tracé d'une file (tapis, rails, murs) ----------

/** Case d'une file en cours de tracé. */
export interface LineCell {
  x: number;
  y: number;
  dir: number;
}

/**
 * Axe du premier tronçon d'une file en L, d'après le geste du joueur : celui le long duquel le curseur a
 * quitté la case de départ (`prev` : axe déjà choisi, gardé tant que le curseur ne revient pas sur la case
 * de départ). Un saut en diagonale (curseur rapide) prend l'axe du plus grand écart. null : sur le départ.
 */
export function lockAxis(start: { x: number; y: number }, cur: { x: number; y: number }, prev: "h" | "v" | null): "h" | "v" | null {
  const dx = cur.x - start.x;
  const dy = cur.y - start.y;
  if (!dx && !dy) return null;
  if (prev) return prev;
  if (!dy) return "h";
  if (!dx) return "v";
  return Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
}

/**
 * File faite d'une partie figée (tracée avant un changement de niveau) et du tronçon en cours, qui part de
 * la dernière case figée (`seg[0]`, la même case). Cette case prend la direction du départ du tronçon
 * (elle devient un virage s'il tourne) ; sans tronçon, elle garde la sienne.
 */
export function joinSegment(frozen: LineCell[], seg: LineCell[]): LineCell[] {
  if (!frozen.length) return seg.map((c) => ({ ...c }));
  const out = frozen.map((c) => ({ ...c }));
  if (seg.length > 1) {
    out[out.length - 1].dir = seg[0].dir;
    for (let i = 1; i < seg.length; i++) out.push({ ...seg[i] });
  }
  return out;
}

/**
 * Niveau de chaque case d'une file de tapis et pose possible.
 * - Les `nf` premières cases sont figées à `frozenFloors`.
 * - Les suivantes partent du niveau `base` (molette) et montent d'elles-mêmes au-dessus d'un obstacle
 *   (premier niveau libre au-dessus), puis redescendent.
 * - Un ascenseur relie deux cases alignées : à un changement de niveau dans un angle, la case basse du
 *   tronçon en cours monte ; si c'est une case figée, c'est la case du tronçon qui garde son niveau.
 * `at[f][i]` : case i posable au niveau f ; `crossing[i]` : case i en travers d'un de nos tapis au sol
 * (on passe au-dessus plutôt que de le tourner).
 */
export function lineFloors(cells: LineCell[], nf: number, frozenFloors: number[], base: number, at: boolean[][], crossing: boolean[]): { floors: number[]; ok: boolean[] } {
  const avail = (f: number, i: number) => f >= 0 && f <= 2 && !!at[f]?.[i] && !(f === 0 && crossing[i]);
  const climb = cells.length > 1;
  const floors = cells.map((_, i) => {
    if (i < nf) return frozenFloors[i];
    if (!climb) return base;
    for (let f = base; f <= 2; f++) if (avail(f, i)) return f;
    return base;
  });
  for (let pass = 0; pass < 3; pass++) {
    for (let i = Math.max(1, nf); i < cells.length; i++) {
      if (floors[i] === floors[i - 1] || cells[i].dir === cells[i - 1].dir) continue;
      const lo = floors[i] > floors[i - 1] ? i - 1 : i;
      const hi = lo === i ? i - 1 : i;
      if (lo >= nf) {
        if (avail(floors[hi], lo)) floors[lo] = floors[hi];
      } else if (hi >= nf && avail(floors[lo], hi)) floors[hi] = floors[lo];
    }
  }
  return { floors, ok: cells.map((_, i) => avail(floors[i], i)) };
}
