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
