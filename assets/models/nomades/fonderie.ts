// Fonderie nomade (« t_furnace ») et chenillard fonderie (« ch_furnace ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, chariotNomade } from "./commun.ts";

/** Axe des tourillons du creuset (axe x) et centre du creuset. */
export const CREUSET: Vec3 = [0.1, 0.98, 0.0];
/** Pied de la cheminée télescopique (arrière gauche). */
const CHEMINEE: Vec3 = [-0.4, 0.575, -0.78];
/** Soufflerie (arrière droit) : centre du caisson au sol, et racine de sa conduite. */
const SOUFFLERIE: Vec3 = [0.42, 0.575, -0.8];
const RACINE: Vec3 = [0.42, 0.79, -0.6];

/**
 * Fonderie nomade : chariot à chenilles (cabine à l'avant gauche), creuset tournant sur tourillons entre deux
 * montants rouille (bande d'équipe, bain de fonte ambre, bec verseur), cheminée télescopique à trois tronçons
 * et chapeau, soufflerie à ventilateur horizontal dont la conduite de cuivre se raccorde au tourillon droit (l'air
 * entre par le tourillon), bac de charbon et coffre. Avec `chariot` (chenillard fonderie), les pièces mobiles
 * portent leur animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,75 : le creuset, couché bouche vers l'avant, se redresse sur ses tourillons (+90° autour de x) ;
 * - 0,72 → 0,8 : le bain de fonte, enfoncé sous la bouche, y monte (il s'allume) ;
 * - 0,6 → 0,8 puis 0,75 → 0,95 : les deux tronçons de la cheminée sortent l'un de l'autre ;
 * - 0,8 → 0,92 : la hotte du ventilateur sort du caisson de la soufflerie ;
 * - 0,85 → 1 : la conduite, rabattue le long du caisson, pivote et se raccorde au tourillon.
 * Sans `chariot`, le ventilateur est le pivot « rotor », qui tourne quand la fonderie travaille.
 */
export function fonderieNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const [cx, cy, cz] = CREUSET;
  const p: Part[] = [
    ...chariotNomade(chariot),
    // montants rouille du creuset, paliers d'acier
    { shape: "box", size: [0.08, 0.5, 0.2], pos: [q(cx + 0.43), 0.825, cz], color: "rust" },
    { shape: "box", size: [0.08, 0.5, 0.2], pos: [q(cx - 0.43), 0.825, cz], color: "rust" },
    { shape: "box", size: [0.12, 0.12, 0.14], pos: [q(cx + 0.43), cy, cz], color: "steel", fine: true },
    { shape: "box", size: [0.12, 0.12, 0.14], pos: [q(cx - 0.43), cy, cz], color: "steel", fine: true },
    // bac de charbon (avant droit), coffre sanglé (gauche)
    ...coffre([0.4, 0.69, 0.86], [0.4, 0.22, 0.42], "rust"),
    { shape: "box", size: [0.34, 0.04, 0.36], pos: [0.4, 0.79, 0.86], color: "black", fine: true },
    ...coffre([-0.47, 0.68, 0.36], [0.3, 0.2, 0.34], "wood").map((c): Part => ({ ...c, fine: true })),
    // caisson de la soufflerie (bande d'équipe), grille
    { shape: "box", size: [0.36, 0.3, 0.34], pos: [SOUFFLERIE[0], 0.725, SOUFFLERIE[2]], color: "faction" },
    { shape: "box", size: [0.3, 0.2, 0.02], pos: [SOUFFLERIE[0], 0.72, q(SOUFFLERIE[2] - 0.175)], color: "dark", fine: true },
    // pied de la cheminée : semelle et premier tronçon (fixe), collier d'équipe
    { shape: "box", size: [0.4, 0.05, 0.4], pos: [CHEMINEE[0], 0.6, CHEMINEE[2]], color: "rust", fine: true },
    { shape: "cylinder", sides: 12, radius: 0.15, height: 0.7, pos: [CHEMINEE[0], 0.925, CHEMINEE[2]], color: "dark" },
    { shape: "cylinder", sides: 12, radius: 0.17, height: 0.06, pos: [CHEMINEE[0], 1.25, CHEMINEE[2]], color: "faction" },
  ];

  // ——— creuset sur tourillons (axe x en CREUSET) : couché bouche vers l'avant sur le chariot ———
  // la bande d'équipe, centrée sur l'axe des tourillons, est la première pièce (origine du pivot)
  const cr = dep("r:x,90:0.5:0.75", "creuset");
  const by = q(cy - 0.28); // fond du creuset
  p.push(
    { shape: "cylinder", sides: 12, radius: 0.322, height: 0.08, pos: [cx, cy, cz], color: "faction", ...cr },
    { shape: "cylinder", sides: 8, radius: 0.06, height: 0.88, pos: [cx, cy, cz], rot: [0, 0, 90], color: "steel", fine: true, ...cr },
    { shape: "lathe", sides: 12, pos: [cx, by, cz], color: "dark", profile: [[0, 0], [0.3, 0.1], [0.33, 0.6], [0.27, 0.6], [0.27, 0.55], [0, 0.55]], ...cr },
    // bain de fonte (origine sur l'axe des tourillons) : enfoncé sous la bouche sur le chariot, il monte à 0,72
    { shape: "lathe", sides: 12, pos: [cx, cy, cz], color: "amber", profile: [[0.27, 0.275], [0, 0.28]], ...dep("r:x,90:0.5:0.75|t:0,-0.04,0:0.72:0.8", "bain") },
    { shape: "torus", radius: 0.335, tube: 0.02, sides: 12, pos: [cx, q(by + 0.58), cz], color: "rust", fine: true, ...cr },
    { shape: "wedge", size: [0.12, 0.06, 0.14], pos: [cx, q(by + 0.6), q(cz + 0.38)], color: "dark", fine: true, ...cr },
    { shape: "box", size: [0.04, 0.04, 0.28], pos: [q(cx + 0.33), q(by + 0.3), cz], color: "steel", fine: true, ...cr },
    { shape: "box", size: [0.04, 0.04, 0.28], pos: [q(cx - 0.33), q(by + 0.3), cz], color: "steel", fine: true, ...cr },
  );

  // ——— cheminée télescopique : deux tronçons rentrés dans le pied, chapeau posé dessus ———
  const [hx, , hz] = CHEMINEE;
  const t1 = dep("t:0,-0.65,0:0.6:0.8", "cheminee1");
  const t2 = dep("t:0,-0.65,0:0.6:0.8|t:0,-0.6,0:0.75:0.95", "cheminee2");
  p.push(
    { shape: "cylinder", sides: 12, radius: 0.12, height: 0.7, pos: [hx, 1.57, hz], color: "dark", ...t1 },
    { shape: "cylinder", sides: 12, radius: 0.14, height: 0.05, pos: [hx, 1.9, hz], color: "rust", fine: true, ...t1 },
    { shape: "cylinder", sides: 12, radius: 0.09, height: 0.63, pos: [hx, 2.185, hz], color: "dark", ...t2 },
    { shape: "cylinder", sides: 6, radius: 0.02, height: 0.1, pos: [hx, 2.53, hz], color: "metal", fine: true, ...t2 },
    { shape: "cone", sides: 6, radius: 0.17, height: 0.1, pos: [hx, 2.6, hz], color: "rust", ...t2 },
  );
  // haubans de la cheminée dressée (fonderie déployée seulement)
  if (!chariot) {
    for (const [x, z] of [[-0.66, 0.5], [-0.66, -1.12], [0.2, -1.12]]) {
      p.push({ shape: "tube", radius: 0.008, sides: 3, path: [[hx, 2.2, hz], [x, 0.58, z]], color: "black", fine: true });
    }
  }

  // ——— hotte et ventilateur de la soufflerie : rentrés dans le caisson sur le chariot ———
  const [sx, , sz] = SOUFFLERIE;
  const ho = dep("t:0,-0.12,0:0.8:0.92", "hotte");
  const rotor = chariot ? ho : { pivot: "rotor" };
  p.push(
    { shape: "cylinder", sides: 12, radius: 0.15, height: 0.08, pos: [sx, 0.91, sz], color: "metal", ...ho },
    // pales (la première, gardée au loin, est l'origine du pivot « rotor ») et moyeu
    ...[0, 60, 120].map((a): Part => ({ shape: "box", size: [0.26, 0.012, 0.05], pos: [sx, 0.955, sz], rot: [0, a, 0], color: "black", ...(a ? { fine: true } : {}), ...rotor })),
    { shape: "cylinder", sides: 6, radius: 0.04, height: 0.05, pos: [sx, 0.96, sz], color: "steel", fine: true, ...rotor },
  );

  // ——— conduite d'air : rabattue le long du caisson (vers la gauche), elle pivote vers le tourillon droit ———
  const [rx, ry, rz] = RACINE;
  const tx = 0.63; // la conduite longe le montant droit par l'extérieur, puis entre dans le palier
  const ang = q((-Math.atan2(tx - rx, cz - rz) * 180) / Math.PI - 90);
  const co = dep(`r:y,${ang}:0.85:1`, "conduite");
  p.push(
    { shape: "box", size: [0.1, 0.1, 0.1], pos: [rx, ry, rz], color: "rust", ...co },
    { shape: "tube", radius: 0.045, sides: 6, path: [[rx, ry, rz], [tx, ry, -0.4], [tx, cy, cz], [0.58, cy, cz]], bend: 0.1, color: "copper", fine: true, ...co },
    { shape: "cylinder", sides: 8, radius: 0.07, height: 0.04, pos: [0.6, cy, cz], rot: [0, 0, 90], color: "rust", fine: true, ...co },
  );
  return p;
}
