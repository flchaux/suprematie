// Ascenseurs de tapis (voir assets/models/buildings.ts : ascenseur, ascenseur_plateau, <tapis>_quai).
//
// Purement visuel. Dans la case où un tapis change de niveau, la simulation fait avancer l'objet tout
// droit en interpolant son niveau, comme sur une rampe. Le rendu en fait un ascenseur, sans rien demander
// de plus à la simulation : l'objet roule du bord de la case jusqu'à la cage (quai d'entrée), monte ou
// descend à la verticale sur un plateau, puis roule de la cage au bord opposé (quai de sortie).
//
// Tout se déduit de la fraction de niveau de l'objet, qui croît de 0 à 1 dans une montée et décroît de
// 1 à 0 dans une descente : les deux fonctions ci-dessous sont symétriques autour de 1/2, la même formule
// sert donc dans les deux sens, et le rendu n'a pas à savoir si l'objet monte ou descend.
import { NIVEAU_TAPIS } from "../../../../assets/models/buildings.ts";

/** Hauteur d'un niveau de tapis (cases du monde) : niveau 1 au-dessus des bâtiments bas, niveau 2 encore au-dessus. */
export const FLOOR_H = NIVEAU_TAPIS;

/**
 * Part de la traversée de la case passée sur chaque quai. L'objet parcourt une demi-case, un niveau,
 * puis une demi-case : cette part lui donne la même vitesse sur les trois tronçons.
 */
export const LIFT_QUAY = 0.5 / (1 + FLOOR_H);

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Distance de l'objet au centre de la case, de 1 (au bord, il entre ou il sort) à 0 (dans la cage).
 * `fr` : fraction de niveau de l'objet (0 à 1).
 */
export function liftOut(fr: number): number {
  return clamp01((Math.abs(fr - 0.5) - (0.5 - LIFT_QUAY)) / LIFT_QUAY);
}

/** Hauteur de l'objet au-dessus du palier bas, de 0 à 1 niveau : il ne bouge à la verticale que dans la cage. */
export function liftUp(fr: number): number {
  return clamp01((fr - LIFT_QUAY) / (1 - 2 * LIFT_QUAY));
}

/**
 * Hauteurs (0 à 1, du bas au haut de la course) des `n` traits lumineux qui courent sur une glissière.
 * `t` : temps de la simulation (secondes) ; `up` : sens de la marche ; à l'arrêt (`run` faux) ils se figent.
 */
export function liftDash(k: number, n: number, t: number, up: boolean, run: boolean): number {
  const ph = run ? (t * 0.9) % 1 : 0.5;
  return ((k + (up ? ph : 1 - ph)) / n) % 1;
}
