// Raffinerie nomade (« t_refinery ») et chenillard raffinerie (« ch_refinery ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, chariotNomade } from "./commun.ts";

/** Charnière des colonnes (axe x) : arête avant du socle, sur lequel elles se dressent. */
export const CHARNIERE: Vec3 = [0.25, 0.75, -0.63];
/** Colonnes : (x, z du pied, rayon, hauteur). Leur bord avant touche la charnière. */
const COLONNES: [number, number, number, number][] = [
  [0.42, -0.82, 0.19, 1.7],
  [0.06, -0.78, 0.15, 1.3],
];
/** Cuve couchée (axe z, gauche) : x, y de l'axe, rayon, z de l'arrière et de l'avant. */
const CUVE = { x: -0.4, y: 0.885, r: 0.25, z0: -1.1, z1: 0.2 };
/** Piquage de la conduite pivotante sur la cuve, et torchère (avant gauche). */
const PIQUAGE: Vec3 = [-0.4, 1.2, -0.5];
const TORCHE: Vec3 = [-0.42, 0.575, 0.43];

/**
 * Raffinerie nomade : chariot à chenilles (cabine à l'avant gauche), deux colonnes de distillation cerclées
 * (bandes d'équipe, échelle, col de cygne de cuivre qui les relie) dressées sur un socle à l'arrière droit, cuve
 * couchée sable à bande d'équipe sur berceaux (gauche), conduite pivotante qui relie le dôme de la cuve à la petite
 * colonne, pompe et torchère télescopique à flamme ambre (avant gauche). Avec `chariot` (chenillard raffinerie),
 * les pièces mobiles portent leur animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,82 : les deux colonnes, couchées vers l'avant sur le chariot, se relèvent ensemble autour de la
 *   charnière (+90° autour de x) ;
 * - 0,6 → 0,85 : la torchère sort de son fourreau (flamme cachée dedans tant qu'elle est rentrée) ;
 * - 0,85 → 1 : la conduite, rabattue sur le dos de la cuve, pivote et se raccorde à la petite colonne.
 */
export function raffinerieNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const [hx, hy, hz] = CHARNIERE;
  const { x: kx, y: ky, r: kr, z0, z1 } = CUVE;
  const p: Part[] = [
    ...chariotNomade(chariot),
    // socle des colonnes (arrière droit), chape de la charnière
    { shape: "box", size: [0.76, q(hy - 0.575), 0.42], pos: [0.27, q((hy + 0.575) / 2), -0.82], color: "rust" },
    { shape: "box", size: [0.78, 0.03, 0.03], pos: [0.27, q(hy - 0.02), -0.61], color: "hazard", fine: true },
    // cuve couchée sur berceaux, bandes d'équipe, dôme et trou d'homme
    ...[q(z0 + 0.25), q(z1 - 0.25)].map((z): Part => ({ shape: "box", size: [0.42, 0.12, 0.08], pos: [kx, 0.63, z], color: "dark", fine: true })),
    { shape: "lathe", sides: 12, pos: [kx, ky, z0], rot: [90, 0, 0], color: "dry", profile: [[0, 0], [kr, 0.1], [kr, q(z1 - z0 - 0.1)], [0, q(z1 - z0)]] },
    { shape: "cylinder", sides: 12, radius: q(kr + 0.012), height: 0.09, pos: [kx, ky, q(z0 + 0.4)], rot: [90, 0, 0], color: "faction" },
    { shape: "cylinder", sides: 12, radius: q(kr + 0.012), height: 0.09, pos: [kx, ky, q(z1 - 0.32)], rot: [90, 0, 0], color: "faction", fine: true },
    { shape: "cylinder", sides: 8, radius: 0.06, height: 0.1, pos: [PIQUAGE[0], q(ky + kr + 0.03), PIQUAGE[2]], color: "steel", fine: true },
    { shape: "cylinder", sides: 8, radius: 0.09, height: 0.05, pos: [kx, q(ky + kr), -0.05], color: "metal", fine: true },
    // pompe et fourreau de la torchère (avant gauche, derrière la cabine), voyant
    { shape: "box", size: [0.42, 0.24, 0.3], pos: [TORCHE[0], 0.695, TORCHE[2]], color: "metal" },
    { shape: "box", size: [0.16, 0.06, 0.02], pos: [q(TORCHE[0] + 0.08), 0.72, q(TORCHE[2] + 0.155)], color: "glow", fine: true },
    { shape: "tube", radius: 0.03, sides: 6, path: [[TORCHE[0], 0.66, q(TORCHE[2] - 0.15)], [TORCHE[0], 0.66, q(z1 - 0.02)]], color: "copper", fine: true },
    { shape: "cylinder", sides: 6, radius: 0.05, height: 0.7, pos: [TORCHE[0], 1.16, TORCHE[2]], color: "dark" },
  ];

  // ——— colonnes de distillation : couchées vers l'avant sur le chariot, elles se relèvent autour de la charnière ———
  const co = dep("r:x,90:0.5:0.82", "colonnes");
  p.push({ shape: "box", size: [0.8, 0.05, 0.05], pos: CHARNIERE, color: "steel", ...co });
  for (const [i, [x, z, r, h]] of COLONNES.entries()) {
    p.push(
      { shape: "lathe", sides: 12, pos: [x, hy, z], color: "metal", profile: [[0, 0], [r, 0], [r, q(h - 0.12)], [0, h]], ...co },
      { shape: "cylinder", sides: 12, radius: q(r + 0.01), height: 0.14, pos: [x, q(hy + h * 0.62), z], color: "faction", ...co },
      { shape: "torus", radius: q(r + 0.006), tube: 0.016, sides: 10, pos: [x, q(hy + h * 0.3), z], color: "rust", fine: true, ...co },
      { shape: "cylinder", sides: 8, radius: q(r * 0.45), height: 0.06, pos: [x, q(hy + h - 0.02), z], color: "dark", fine: true, ...co },
    );
    if (i === 0) p.push({ use: "echelle", pos: [q(x + r + 0.02), hy, z], rot: [0, 90, 0], scale: [1, q(h - 0.15), 1], ...co });
  }
  // col de cygne de cuivre entre les têtes des colonnes, piquage de la petite colonne (côté cuve)
  const [[x1, zc1, , h1], [x2, zc2, r2, h2]] = COLONNES;
  p.push(
    { shape: "tube", radius: 0.035, sides: 6, path: [[x1, q(hy + h1 - 0.02), zc1], [x1, q(hy + h1 + 0.1), zc1], [x2, q(hy + h1 + 0.1), zc2], [x2, q(hy + h2 - 0.05), zc2]], bend: 0.1, color: "copper", fine: true, ...co },
    { shape: "cylinder", sides: 8, radius: 0.05, height: 0.08, pos: [q(x2 - r2 - 0.03), 1.28, zc2], rot: [0, 0, 90], color: "rust", fine: true, ...co },
  );

  // ——— torchère : mât télescopique rentré dans son fourreau, flamme ambre ———
  const to = dep("t:0,-1.15,0:0.6:0.85", "torchere");
  const [fx, , fz] = TORCHE;
  p.push(
    { shape: "cylinder", sides: 4, radius: 0.035, height: 0.85, pos: [fx, 1.825, fz], color: "rust", ...to },
    { shape: "cylinder", sides: 6, radius: 0.05, radiusTop: 0.06, height: 0.06, pos: [fx, 2.28, fz], color: "dark", fine: true, ...to },
    { shape: "cone", sides: 4, radius: 0.045, height: 0.16, pos: [fx, 2.36, fz], color: "amber", ...to },
  );

  // ——— conduite pivotante : du dôme de la cuve à la petite colonne ; rabattue vers l'avant sur la cuve ———
  const [px, py, pz] = PIQUAGE;
  const bout: Vec3 = [q(x2 - r2 - 0.07), 1.28, zc2];
  const ang = q((-Math.atan2(bout[0] - px, bout[2] - pz) * 180) / Math.PI);
  const ra = dep(`r:y,${ang}:0.85:1`, "raccord");
  p.push(
    { shape: "box", size: [0.09, 0.1, 0.09], pos: PIQUAGE, color: "rust", ...ra },
    { shape: "tube", radius: 0.035, sides: 6, path: [[px, py, pz], [px, 1.28, pz], [q(bout[0] - 0.04), 1.28, bout[2]], bout], bend: 0.08, color: "copper", fine: true, ...ra },
  );
  return p;
}
