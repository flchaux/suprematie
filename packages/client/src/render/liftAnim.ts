// Ascenseurs de tapis (voir assets/models/buildings.ts : ascenseur, ascenseur_plateau, <tapis>_quai).
//
// Purement visuel. Dans la case où un tapis change de niveau, la simulation fait avancer l'objet tout
// droit en interpolant son niveau, comme sur une rampe. Le rendu en fait un ascenseur, sans rien demander
// de plus à la simulation : l'objet roule du bord de la case jusqu'au milieu (quai d'entrée, 3/8 de
// case), monte ou descend à la verticale sur un plateau d'un quart de case pendant le quart central de
// la traversée, puis roule jusqu'au bord opposé (quai de sortie). Deux objets se suivent au plus près à
// un quart de case : il n'y en a jamais qu'un en course.
//
// Tout se déduit de la fraction de niveau de l'objet, qui croît de 0 à 1 dans une montée et décroît de
// 1 à 0 dans une descente : liftOut et liftUp sont symétriques autour de 1/2, la même formule sert donc
// dans les deux sens.
import { NIVEAU_TAPIS } from "../../../../assets/models/buildings.ts";

/** Hauteur d'un niveau de tapis (cases du monde) : niveau 1 au-dessus des bâtiments bas, niveau 2 encore au-dessus. */
export const FLOOR_H = NIVEAU_TAPIS;

/** Part de la traversée de la case passée sur chaque quai : la course occupe le quart central. */
export const LIFT_QUAY = 0.375;

/** Demi-largeur d'un objet et du plateau (cases) : un quart de case chacun, à peu de chose près. */
const HALF_ITEM = 0.12;
const HALF_PAD = 0.125;
/** Distance au centre (en liftOut) où l'objet a quitté le plateau, puis où le plateau a fini de rentrer. */
const PAD_FREE = (HALF_PAD + HALF_ITEM) / 0.5;
const PAD_GONE = PAD_FREE + 0.2;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Distance de l'objet au centre de la case, de 1 (au bord, il entre ou il sort) à 0 (sur le plateau).
 * `fr` : fraction de niveau de l'objet (0 à 1).
 */
export function liftOut(fr: number): number {
  return clamp01((Math.abs(fr - 0.5) - (0.5 - LIFT_QUAY)) / LIFT_QUAY);
}

/** Hauteur de l'objet au-dessus du palier bas, de 0 à 1 niveau : il ne bouge à la verticale qu'au milieu de la case. */
export function liftUp(fr: number): number {
  return clamp01((fr - LIFT_QUAY) / (1 - 2 * LIFT_QUAY));
}

/**
 * Sortie (1 : déployé, 0 : rentré dans le mât) du plateau qui vient de déposer un objet au palier de
 * sortie, selon la distance `out` de cet objet au centre (liftOut) : il rentre dès que l'objet l'a quitté.
 * Le plateau qui attend au palier d'entrée se déploie d'autant (1 - cette valeur) : on n'en voit jamais
 * apparaître ni disparaître d'un coup.
 */
export function liftPad(out: number): number {
  return clamp01((PAD_GONE - out) / (PAD_GONE - PAD_FREE));
}

/**
 * Hauteurs (0 à 1, du bas au haut de la course) des `n` traits lumineux qui courent sur le mât.
 * `t` : temps de la simulation (secondes) ; `up` : sens de la marche ; à l'arrêt (`run` faux) ils se figent.
 */
export function liftDash(k: number, n: number, t: number, up: boolean, run: boolean): number {
  const ph = run ? (t * 0.9) % 1 : 0.5;
  return ((k + (up ? ph : 1 - ph)) / n) % 1;
}
