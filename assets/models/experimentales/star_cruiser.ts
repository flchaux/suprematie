// star_cruiser : cuirassé stellaire. Coque triangulaire en pointe faite de plaques superposées en gradins
// (coque haute claire, tranchée de ceinture lumineuse, coque basse sombre en pyramide inversée), arête
// dorsale à nervures, tranchées de surface, superstructure en gradins à pans inclinés et rangées de hublots,
// tour de commandement à passerelle, deux radômes cerclés et radar tournant, dix batteries pivotantes,
// tourelles de défense rapprochée, hangar ventral et bloc moteur à sept tuyères (anneaux, cônes centraux).
// 3976 triangles.
import type { ColorName, Model, Part } from "../types.ts";

const r = (v: number): number => +v.toFixed(3);

// Contour de la coque : pointe à l'avant (z = PROUE), arrière plat (z = POUPE), demi-largeur PENTE·(PROUE − z).
const PROUE = 5.2;
const POUPE = -5.0;
const PENTE = 2.7 / (PROUE - POUPE);
/** angle (degrés) des bords de la coque par rapport à l'axe z (lacet des pièces posées le long du bord droit) */
const BORD = -(Math.atan(PENTE) * 180) / Math.PI;

/**
 * Plaque triangulaire symétrique (deux demi-prismes) : pointe à `avant`, arrière plat à `arriere`, bords
 * parallèles à ceux de la coque. `y` = centre de l'épaisseur.
 */
function plaque(avant: number, arriere: number, y: number, ep: number, color: ColorName): Part {
  const L = avant - arriere;
  const hw = PENTE * L;
  return { shape: "wedge", size: [ep, r(hw), r(L)], pos: [r(hw / 2), y, r((avant + arriere) / 2)], rot: [0, 0, -90], color, mirror: true };
}

/** Demi-largeur, à la hauteur z, d'une plaque dont la pointe est à `avant`. */
const larg = (avant: number, z: number): number => PENTE * (avant - z);

/** Filet (ou tranchée) parallèle au bord droit, en retrait `d` du bord d'une plaque de pointe `avant`. */
function filet(avant: number, d: number, z0: number, z1: number, y: number, w: number, h: number, color: ColorName): Part {
  const zc = (z0 + z1) / 2;
  const len = (z1 - z0) / Math.cos((BORD * Math.PI) / 180);
  return { shape: "box", size: [w, h, r(len)], pos: [r(larg(avant, zc) - d), y, r(zc)], rot: [0, BORD, 0], color, mirror: true };
}

/** Batterie pivotante : affût rond, casemate chanfreinée, deux tubes, voyant (104 triangles). */
function batterie(name: string, x: number, y: number, z: number): Part[] {
  return [
    { shape: "cylinder", sides: 6, radius: 0.2, height: 0.08, pos: [x, r(y + 0.04), z], color: "metal", pivot: name },
    { shape: "bevel", size: [0.34, 0.15, 0.38], pos: [x, r(y + 0.15), r(z - 0.02)], color: "light", parent: name },
    { shape: "box", size: [0.2, 0.03, 0.04], pos: [x, r(y + 0.17), r(z + 0.18)], color: "glow", parent: name },
    { shape: "box", size: [0.05, 0.05, 0.48], pos: [r(x + 0.075), r(y + 0.15), r(z + 0.38)], color: "dark", parent: name },
    { shape: "box", size: [0.05, 0.05, 0.48], pos: [r(x - 0.075), r(y + 0.15), r(z + 0.38)], color: "dark", parent: name },
  ];
}

/** Tourelle de défense rapprochée (fixe) : dôme, côté droit (copie miroir). */
function defense(x: number, y: number, z: number): Part[] {
  return [
    { shape: "sphere", radius: 0.09, pos: [x, y, z], color: "metal", mirror: true },
  ];
}

/** Tuyère pointant vers -z : carénage évasé, anneau, bague, flamme et cône central. */
function tuyere(x: number, y: number, z: number, rad: number, mirror = false): Part[] {
  const m = mirror ? { mirror: true } : {};
  const s = rad > 0.3 ? 8 : 6;
  return [
    { shape: "cylinder", sides: s, radius: r(rad * 1.12), radiusTop: rad, height: 0.5, pos: [x, y, r(z - 0.25)], rot: [90, 0, 0], color: "metal", ...m },
    { shape: "cylinder", sides: s, radius: r(rad * 1.22), height: 0.1, pos: [x, y, r(z - 0.1)], rot: [90, 0, 0], color: "dark", ...m },
    ...(rad > 0.3 ? [{ shape: "cylinder", sides: s, radius: r(rad * 1.18), height: 0.07, pos: [x, y, r(z - 0.48)], rot: [90, 0, 0], color: "dark", ...m } as Part] : []),
    { shape: "cylinder", sides: s, radius: r(rad * 0.92), height: 0.04, pos: [x, y, r(z - 0.5)], rot: [90, 0, 0], color: "glow", ...m },
    { shape: "cone", sides: s, radius: r(rad * 0.38), height: r(rad * 0.6), pos: [x, y, r(z - 0.52 - rad * 0.3)], rot: [-90, 0, 0], color: "dark", ...m },
  ];
}

// gradins de la coque haute : [pointe, arrière, y, épaisseur, couleur]
const HAUT: [number, number, number, number, ColorName][] = [
  [PROUE, POUPE, 1.11, 0.22, "light"],
  [4.4, -4.95, 1.31, 0.18, "light"],
  [3.4, -4.9, 1.48, 0.16, "metal"],
  [2.2, -4.85, 1.63, 0.14, "light"],
  [0.8, -4.8, 1.76, 0.12, "light"],
];
const dessus = (i: number): number => r(HAUT[i][2] + HAUT[i][3] / 2);

export const star_cruiser: Model = {
  parts: [
    // ----- coque haute : gradins de plaques triangulaires -----
    ...HAUT.map(([a, b, y, e, c]) => plaque(a, b, y, e, c)),
    // ceinture : tranchée sombre en retrait entre les deux coques, filet lumineux
    plaque(4.95, -4.98, 0.94, 0.12, "dark"),
    filet(4.95, -0.01, -4.4, 3.6, 0.94, 0.03, 0.035, "glow"),
    // ----- coque basse : pyramide inversée sombre -----
    plaque(5.1, -4.95, 0.75, 0.26, "dark"),
    plaque(4.0, -4.7, 0.5, 0.24, "metal"),
    plaque(2.6, -4.4, 0.27, 0.22, "dark"),
    plaque(0.6, -4.0, 0.1, 0.14, "metal"),
    // hangar ventral : sas lumineux, encadrement et feux
    { shape: "box", size: [0.9, 0.05, 1.5], pos: [0, 0.02, -1.6], color: "glow" },
    { shape: "box", size: [0.12, 0.08, 1.7], pos: [0.52, 0.02, -1.6], color: "dark", mirror: true },
    // hublots des flancs (coque haute) et des flancs bas
    ...[[-4.2, -2.6], [-2.2, -0.6], [-0.2, 1.4], [1.8, 3.2]].map(([a, b]) => filet(PROUE, -0.012, a, b, 1.11, 0.03, 0.04, "glow")),
    ...[[-4.0, -2.0], [-1.4, 0.8]].map(([a, b]) => filet(5.1, -0.012, a, b, 0.72, 0.03, 0.035, "glow")),
    // feux de position (amber) : pointe, coins arrière, ceinture
    { shape: "box", size: [0.1, 0.07, 0.1], pos: [0, 1.15, 5.12], color: "amber" },
    { shape: "box", size: [0.1, 0.08, 0.1], pos: [2.62, 1.15, -4.92], color: "amber", mirror: true },
    { shape: "box", size: [0.07, 0.06, 0.07], pos: [r(larg(5.1, 0.0) + 0.0), 0.75, 0.0], color: "amber", mirror: true },
    { shape: "box", size: [0.07, 0.06, 0.07], pos: [r(larg(5.1, -2.5) + 0.0), 0.75, -2.5], color: "amber", mirror: true },

    // ----- tranchées de surface et plaques superposées -----
    filet(PROUE, 0.11, -4.6, 3.8, dessus(0), 0.05, 0.02, "dark"),
    filet(4.4, 0.1, -4.5, 2.9, dessus(1), 0.04, 0.02, "dark"),
    filet(3.4, 0.12, -4.4, 1.9, dessus(2), 0.12, 0.02, "faction"),
    filet(2.2, 0.1, -4.3, 0.8, dessus(3), 0.04, 0.02, "dark"),
    // tranchées transversales (rainures sombres) sur le gradin bas
    ...[-3.0, -0.6, 1.8].map((z): Part => {
      const a = larg(4.4, z), b = larg(PROUE, z);
      return { shape: "box", size: [r(b - a - 0.04), 0.02, 0.05], pos: [r((a + b) / 2), dessus(0), z], color: "dark", mirror: true };
    }),
    // plaques de blindage rapportées
    ...[[-3.7, 0.55], [-0.6, 0.5]].map(([z, l]): Part => ({
      shape: "box", size: [0.16, 0.035, l], pos: [r(larg(3.4, z) - 0.26), r(dessus(2) + 0.015), z], rot: [0, BORD, 0], color: "light", mirror: true,
    })),
    ...[[-2.8, 0.7], [-0.4, 0.6]].map(([z, l]): Part => ({
      shape: "box", size: [0.2, 0.035, l], pos: [r(larg(2.2, z) - 0.28), r(dessus(3) + 0.015), z], rot: [0, BORD, 0], color: "metal", mirror: true,
    })),

    // ----- arête dorsale à nervures (descend en marches vers la proue) -----
    { shape: "bevel", size: [0.5, 0.14, 1.0], pos: [0, r(dessus(1) + 0.07), 3.9], color: "light" },
    { shape: "bevel", size: [0.56, 0.14, 1.2], pos: [0, r(dessus(2) + 0.07), 2.8], color: "light" },
    { shape: "bevel", size: [0.62, 0.14, 1.4], pos: [0, r(dessus(3) + 0.07), 1.5], color: "light" },
    { shape: "bevel", size: [0.7, 0.16, 3.0], pos: [0, r(dessus(4) + 0.08), -0.7], color: "light" },
    ...[[1, 3.9, 0.8], [2, 2.8, 1.0], [3, 1.5, 1.2], [4, -0.7, 2.8]].map(([i, z, l]): Part => ({
      shape: "box", size: [0.1, 0.02, l], pos: [0, r(dessus(i) + 0.145), z], color: "dark",
    })),
    // nervures transversales de part et d'autre de l'arête
    ...[[4.1, 1], [3.1, 2], [1.9, 3], [0.6, 4], [-0.6, 4], [-1.8, 4]].map(([z, i]): Part => ({
      shape: "box", size: [0.14, 0.06, 0.05], pos: [0.38, r(dessus(i) + 0.03), z], color: "dark", mirror: true,
    })),

    // ----- superstructure en gradins (arrière) -----
    { shape: "bevel", size: [3.4, 0.4, 2.6], pos: [0, 1.95, -3.65], color: "light" },
    { shape: "box", size: [3.1, 0.05, 0.03], pos: [0, 2.0, -2.34], color: "glow" },
    { shape: "wedge", size: [2.4, 0.36, 0.4], pos: [1.9, 1.92, -3.75], rot: [0, 90, 0], color: "metal", mirror: true },
    { shape: "bevel", size: [2.6, 0.36, 2.1], pos: [0, 2.33, -3.85], color: "metal" },
    { shape: "box", size: [2.3, 0.04, 0.03], pos: [0, 2.37, -2.79], color: "glow" },
    { shape: "box", size: [0.03, 0.04, 1.6], pos: [1.31, 2.37, -3.85], color: "glow", mirror: true },
    { shape: "wedge", size: [1.9, 0.32, 0.3], pos: [1.45, 2.3, -3.9], rot: [0, 90, 0], color: "light", mirror: true },
    { shape: "bevel", size: [1.8, 0.34, 1.6], pos: [0, 2.68, -4.05], color: "faction" },
    { shape: "box", size: [1.5, 0.04, 0.03], pos: [0, 2.72, -3.24], color: "glow" },
    { shape: "bevel", size: [1.1, 0.26, 1.1], pos: [0, 2.98, -4.2], color: "light" },
    // blocs techniques et évents sur les gradins
    { shape: "box", size: [0.35, 0.16, 0.5], pos: [1.15, 2.22, -4.55], color: "dark", mirror: true },
    { shape: "box", size: [0.4, 0.1, 0.3], pos: [0.7, 2.55, -2.95], color: "dark", mirror: true },
    { shape: "box", size: [0.06, 0.06, 0.06], pos: [1.66, 2.18, -2.42], color: "amber", mirror: true },

    // ----- tour de commandement -----
    { shape: "bevel", size: [0.5, 0.85, 0.62], pos: [0, 3.5, -4.3], color: "dark" },
    { shape: "box", size: [0.03, 0.5, 0.04], pos: [0.26, 3.5, -4.0], color: "glow", mirror: true },
    { shape: "wedge", size: [0.9, 0.3, 0.5], pos: [0, 3.78, -4.0], rot: [180, 0, 0], color: "metal" },
    { shape: "bevel", size: [2.5, 0.34, 0.72], pos: [0, 4.05, -4.3], color: "light" },
    { shape: "box", size: [2.1, 0.06, 0.03], pos: [0, 4.07, -3.93], color: "glow" },
    { shape: "box", size: [0.03, 0.06, 0.4], pos: [1.25, 4.07, -4.3], color: "glow", mirror: true },
    { shape: "box", size: [1.7, 0.08, 0.5], pos: [0, 4.25, -4.33], color: "faction" },
    { shape: "box", size: [0.08, 0.06, 0.08], pos: [1.2, 4.24, -3.98], color: "amber", mirror: true },
    // radômes cerclés sur mâts
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.3, pos: [0.92, 4.35, -4.3], color: "metal", mirror: true },
    { shape: "sphere", radius: 0.27, detail: 1, pos: [0.92, 4.6, -4.3], color: "metal", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.28, height: 0.03, pos: [0.92, 4.6, -4.3], color: "glow", mirror: true },
    // antennes
    { shape: "cylinder", sides: 5, radius: 0.02, height: 0.6, pos: [0.35, 4.55, -4.45], color: "light", mirror: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.35, 4.86, -4.45], color: "amber", mirror: true },
    { shape: "box", size: [0.25, 0.015, 0.015], pos: [0.35, 4.72, -4.45], color: "light", mirror: true },
    // radar tournant
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.18, pos: [0, 4.38, -4.4], color: "metal", pivot: "radar" },
    { shape: "box", size: [0.5, 0.12, 0.04], pos: [0, 4.5, -4.4], color: "dark", parent: "radar" },
    { shape: "box", size: [0.42, 0.04, 0.05], pos: [0, 4.5, -4.37], color: "glow", parent: "radar" },

    // ----- bloc moteur et tuyères -----
    { shape: "bevel", size: [4.4, 1.1, 0.3], pos: [0, 0.95, -5.12], color: "dark" },
    { shape: "bevel", size: [2.2, 0.5, 0.25], pos: [0, 1.7, -5.08], color: "metal" },
    ...tuyere(0, 1.05, -5.05, 0.5),
    ...tuyere(1.1, 1.05, -5.05, 0.36, true),
    ...tuyere(1.85, 0.95, -5.05, 0.24, true),
    { shape: "box", size: [0.3, 0.12, 0.05], pos: [0.6, 0.42, -5.0], color: "glow", mirror: true },
    { shape: "box", size: [0.06, 0.06, 0.06], pos: [2.2, 1.45, -5.28], color: "amber", mirror: true },

    // ----- défense rapprochée le long des bords -----
    ...[-3.4, -0.6].flatMap((z) => defense(r(larg(PROUE, z) - 0.12), r(dessus(0) + 0.05), z)),

    // ----- batteries pivotantes -----
    ...batterie("tourelle_1d", 1.72, dessus(1), -2.9),
    ...batterie("tourelle_1g", -1.72, dessus(1), -2.9),
    ...batterie("tourelle_4d", 1.1, dessus(2), -1.6),
    ...batterie("tourelle_4g", -1.1, dessus(2), -1.6),
    ...batterie("tourelle_2d", 0.8, dessus(1), 0.5),
    ...batterie("tourelle_2g", -0.8, dessus(1), 0.5),
    ...batterie("tourelle_3d", 0.5, dessus(1), 2.2),
    ...batterie("tourelle_3g", -0.5, dessus(1), 2.2),
    ...batterie("tourelle_5d", 1.5, 2.15, -2.55),
    ...batterie("tourelle_5g", -1.5, 2.15, -2.55),
  ],
};
