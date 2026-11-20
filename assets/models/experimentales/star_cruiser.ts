// star_cruiser : cuirassé stellaire. Coque triangulaire en pointe faite de plaques superposées en gradins
// (coque haute claire, tranchée de ceinture lumineuse, coque basse sombre en pyramide inversée), éperon
// d'acier, arête dorsale à nervures et capteurs, tranchées de surface, plaques rapportées ; superstructure en
// gradins à fronts inclinés, rangées de hublots, grilles de radiateurs, conduites de cuivre, plateforme
// d'appontage ; tour de commandement profilée à verrière, deux radômes tournés cerclés et radar tournant ;
// dix batteries pivotantes à pans (fûts d'acier), tourelles de défense rapprochée à dôme, hangar ventral et
// bloc moteur à sept tuyères tournées (bagues, lèvres évasées, cônes centraux). Pièces fines : lames des
// grilles, rivets, freins de bouche, antennes, nervures.
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
function filet(avant: number, d: number, z0: number, z1: number, y: number, w: number, h: number, color: ColorName, fine = false): Part {
  const zc = (z0 + z1) / 2;
  const len = (z1 - z0) / Math.cos((BORD * Math.PI) / 180);
  const p: Part = { shape: "box", size: [w, h, r(len)], pos: [r(larg(avant, zc) - d), y, r(zc)], rot: [0, BORD, 0], color, mirror: true };
  return fine ? { ...p, fine } : p;
}

/** Contour (vue de dessus) de la casemate des batteries. */
const CASEMATE: [number, number][] = [[-0.17, -0.19], [0.17, -0.19], [0.19, 0.04], [0.11, 0.19], [-0.11, 0.19], [-0.19, 0.04]];

/** Batterie pivotante : affût d'acier, casemate à pans, toit d'équipe, deux fûts à frein de bouche. */
function batterie(name: string, x: number, y: number, z: number): Part[] {
  const p = (q: Part): Part => ({ ...q, parent: name });
  return [
    { shape: "cylinder", sides: 6, radius: 0.21, height: 0.08, pos: [x, r(y + 0.04), z], color: "steel", pivot: name },
    p({ shape: "extrude", profile: CASEMATE, depth: 0.15, pos: [x, r(y + 0.155), r(z - 0.02)], rot: [90, 0, 0], color: "light" }),
    p({ shape: "extrude", profile: CASEMATE, depth: 0.03, pos: [x, r(y + 0.24), r(z - 0.04)], rot: [90, 0, 0], scale: [0.7, 0.7, 1], color: "faction" }),
    p({ shape: "box", size: [0.2, 0.03, 0.04], pos: [x, r(y + 0.17), r(z + 0.18)], color: "glow", fine: true }),
    ...[0.075, -0.075].flatMap((dx) => [
      p({ shape: "box", size: [0.05, 0.05, 0.46], pos: [r(x + dx), r(y + 0.15), r(z + 0.37)], color: "steel" }),
      p({ shape: "cylinder", sides: 6, radius: 0.042, height: 0.07, pos: [r(x + dx), r(y + 0.15), r(z + 0.585)], rot: [90, 0, 0], color: "dark", fine: true }),
    ]),
  ];
}

/** Tourelle de défense rapprochée (fixe) : socle, dôme tourné, tube fin ; côté droit (copie miroir). */
function defense(x: number, y: number, z: number, fine = false): Part[] {
  return [
    { shape: "lathe", sides: 6, pos: [x, r(y - 0.05), z], color: "steel", mirror: true, fine, profile: [[0.11, 0], [0.08, 0.08], [0, 0.12]] },
    { shape: "cylinder", sides: 5, radius: 0.015, height: 0.22, pos: [x, r(y + 0.03), r(z + 0.12)], rot: [80, 0, 0], color: "dark", mirror: true, fine: true },
  ];
}

/**
 * Tuyère tournée pointant vers -z (base en z) : carénage à bague, lèvre évasée, disque lumineux, cône
 * central ; `s` côtés.
 */
function tuyere(x: number, y: number, z: number, rad: number, s: number, mirror = false): Part[] {
  const m = mirror ? { mirror: true } : {};
  const pr = (a: number, h: number): [number, number] => [r(rad * a), h];
  return [
    { shape: "lathe", sides: s, pos: [x, y, z], rot: [-90, 0, 0], color: "steel", ...m,
      profile: [pr(1.12, 0), pr(1.22, 0.08), pr(1.1, 0.18), pr(1.12, 0.42), pr(1.2, 0.5), pr(0.9, 0.52)] },
    { shape: "cylinder", sides: s, radius: r(rad * 0.92), height: 0.03, pos: [x, y, r(z - 0.32)], rot: [90, 0, 0], color: "glow", ...m },
    { shape: "lathe", sides: s, pos: [x, y, r(z - 0.3)], rot: [-90, 0, 0], color: "dark", ...m, profile: [pr(0.42, 0), pr(0.36, 0.2), [0, r(0.22 + rad * 0.6)]] },
    { shape: "torus", radius: r(rad * 1.2), tube: 0.02, sides: s, pos: [x, y, r(z - 0.3)], rot: [90, 0, 0], color: "dark", ...m, fine: true },
  ];
}

/** Grille de radiateur : cadre sombre de `w` × `l` à plat et lames d'acier fines (dans l'axe x). */
function grille(x: number, y: number, z: number, w: number, l: number, n: number, mirror = true): Part[] {
  const m = mirror ? { mirror: true } : {};
  const out: Part[] = [{ shape: "box", size: [w, 0.03, l], pos: [x, y, z], color: "black", ...m }];
  for (let i = 0; i < n; i++) {
    out.push({ shape: "box", size: [r(w - 0.04), 0.025, 0.035], pos: [x, r(y + 0.02), r(z - l / 2 + ((i + 0.5) * l) / n)], color: "steel", fine: true, ...m });
  }
  return out;
}

// gradins de la coque haute : [pointe, arrière, y, épaisseur, couleur]
const HAUT: [number, number, number, number, ColorName][] = [
  [PROUE, POUPE, 1.11, 0.22, "light"],
  [4.4, -4.95, 1.31, 0.18, "light"],
  [3.4, -4.9, 1.48, 0.16, "steel"],
  [2.2, -4.85, 1.63, 0.14, "light"],
  [0.8, -4.8, 1.76, 0.12, "light"],
];
const dessus = (i: number): number => r(HAUT[i][2] + HAUT[i][3] / 2);

/** Profil latéral (z, y) d'un gradin de superstructure à front incliné : de `z0` (arrière) à `z1`, de `y0` à `y1`. */
const gradin = (z0: number, z1: number, y0: number, y1: number, f: number): [number, number][] =>
  [[z0, y0], [z1, y0], [r(z1 - f * 0.3), r(y0 + (y1 - y0) * 0.45)], [r(z1 - f), y1], [z0, y1]];

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
    // éperon d'acier sous la pointe
    { shape: "lathe", sides: 8, pos: [0, 0.82, 4.3], rot: [90, 0, 0], color: "steel", profile: [[0.12, 0], [0.1, 0.35], [0.05, 0.7], [0, 0.9]] },
    // hangar ventral : sas lumineux, encadrement, nervures et feux
    { shape: "box", size: [0.9, 0.05, 1.5], pos: [0, 0.02, -1.6], color: "glow" },
    { shape: "box", size: [0.12, 0.08, 1.7], pos: [0.52, 0.02, -1.6], color: "dark", mirror: true },
    ...[-2.15, -1.6, -1.05].map((z): Part => ({ shape: "box", size: [0.92, 0.06, 0.05], pos: [0, 0.015, z], color: "dark", fine: true })),
    // hublots des flancs (coque haute) et des flancs bas
    ...[[-4.2, -2.6], [-2.2, -0.6], [-0.2, 1.4], [1.8, 3.2]].map(([a, b]) => filet(PROUE, -0.012, a, b, 1.11, 0.03, 0.04, "glow")),
    ...[[-4.0, -2.0], [-1.4, 0.8]].map(([a, b]) => filet(5.1, -0.012, a, b, 0.72, 0.03, 0.035, "glow")),
    // feux de position (amber) : pointe, coins arrière, ceinture
    { shape: "box", size: [0.1, 0.07, 0.1], pos: [0, 1.15, 5.12], color: "amber" },
    { shape: "box", size: [0.1, 0.08, 0.1], pos: [2.62, 1.15, -4.92], color: "amber", mirror: true },
    { shape: "box", size: [0.07, 0.06, 0.07], pos: [r(larg(5.1, 0.0)), 0.75, 0.0], color: "amber", mirror: true, fine: true },
    { shape: "box", size: [0.07, 0.06, 0.07], pos: [r(larg(5.1, -2.5)), 0.75, -2.5], color: "amber", mirror: true, fine: true },

    // ----- tranchées de surface et plaques superposées -----
    filet(PROUE, 0.11, -4.6, 3.8, dessus(0), 0.05, 0.02, "dark"),
    filet(4.4, 0.1, -4.5, 2.9, dessus(1), 0.04, 0.02, "dark", true),
    filet(3.4, 0.12, -4.4, 1.9, dessus(2), 0.12, 0.02, "faction"),
    filet(2.2, 0.1, -4.3, 0.8, dessus(3), 0.04, 0.02, "dark", true),
    // tranchées transversales (rainures sombres) sur le gradin bas
    ...[-3.0, -0.6, 1.8].map((z): Part => {
      const a = larg(4.4, z), b = larg(PROUE, z);
      return { shape: "box", size: [r(b - a - 0.04), 0.02, 0.05], pos: [r((a + b) / 2), dessus(0), z], color: "dark", mirror: true, fine: true };
    }),
    // plaques de blindage rapportées et rivets
    ...[[-3.7, 0.55], [-0.6, 0.5]].map(([z, l]): Part => ({
      shape: "box", size: [0.16, 0.035, l], pos: [r(larg(3.4, z) - 0.26), r(dessus(2) + 0.015), z], rot: [0, BORD, 0], color: "light", mirror: true,
    })),
    ...[[-2.8, 0.7], [-0.4, 0.6]].map(([z, l]): Part => ({
      shape: "box", size: [0.2, 0.035, l], pos: [r(larg(2.2, z) - 0.28), r(dessus(3) + 0.015), z], rot: [0, BORD, 0], color: "steel", mirror: true,
    })),
    ...[-3.9, -3.5, -0.8, -0.4].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.022, height: 0.02, pos: [r(larg(3.4, z) - 0.26), r(dessus(2) + 0.04), z], color: "dark", mirror: true, fine: true })),
    // joints de tôles et trappes sur les gradins (fins)
    filet(4.4, 0.32, -4.2, 2.4, dessus(1), 0.025, 0.012, "dark", true),
    filet(3.4, 0.3, -4.1, 1.4, dessus(2), 0.025, 0.012, "dark", true),
    ...[-3.6, -2.2, -1.0, 1.3].map((z): Part => ({ shape: "box", size: [0.18, 0.02, 0.24], pos: [r(larg(4.4, z) - 0.25), r(dessus(1) + 0.01), z], rot: [0, BORD, 0], color: "dark", mirror: true, fine: true })),
    ...[-3.6, -2.2, -1.0, 1.3].map((z): Part => ({ shape: "box", size: [0.05, 0.03, 0.05], pos: [r(larg(4.4, z) - 0.25), r(dessus(1) + 0.02), r(z + 0.15)], color: "amber", mirror: true, fine: true })),
    // rivets le long de l'arête dorsale
    ...[-1.9, -1.3, -0.7, -0.1, 0.5].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.02, pos: [0.3, r(dessus(4) + 0.165), z], color: "steel", mirror: true, fine: true })),
    // grilles d'évents sur le gradin bas, de part et d'autre
    ...grille(r(larg(PROUE, -4.2) - 0.45), r(dessus(0) + 0.01), -4.2, 0.4, 0.5, 5),
    ...grille(r(larg(PROUE, 0.6) - 0.3), r(dessus(0) + 0.01), 0.6, 0.3, 0.45, 4),

    // ----- arête dorsale à nervures (descend en marches vers la proue), capteurs -----
    { shape: "bevel", size: [0.5, 0.14, 1.0], pos: [0, r(dessus(1) + 0.07), 3.9], color: "light" },
    { shape: "bevel", size: [0.56, 0.14, 1.2], pos: [0, r(dessus(2) + 0.07), 2.8], color: "light" },
    { shape: "bevel", size: [0.62, 0.14, 1.4], pos: [0, r(dessus(3) + 0.07), 1.5], color: "light" },
    { shape: "bevel", size: [0.7, 0.16, 3.0], pos: [0, r(dessus(4) + 0.08), -0.7], color: "light" },
    ...[[1, 3.9, 0.8], [2, 2.8, 1.0], [3, 1.5, 1.2], [4, -0.7, 2.8]].map(([i, z, l]): Part => ({
      shape: "box", size: [0.1, 0.02, l], pos: [0, r(dessus(i) + 0.145), z], color: "dark",
    })),
    { shape: "box", size: [0.04, 0.025, 2.4], pos: [0, r(dessus(4) + 0.17), -0.7], color: "glow" },
    // nervures transversales de part et d'autre de l'arête
    ...[[4.1, 1], [3.1, 2], [1.9, 3], [0.6, 4], [-0.6, 4], [-1.8, 4]].map(([z, i], k): Part => ({
      shape: "box", size: [0.14, 0.06, 0.05], pos: [0.38, r(dessus(i) + 0.03), z], color: "dark", mirror: true, ...(k % 2 ? { fine: true } : {}),
    })),
    // capteurs dorsaux : petits dômes tournés et conduite de cuivre
    { shape: "lathe", sides: 10, pos: [0, r(dessus(4) + 0.16), 0.55], color: "light", profile: [[0.14, 0], [0.13, 0.05], [0.08, 0.11], [0, 0.13]] },
    { shape: "lathe", sides: 10, pos: [0, r(dessus(3) + 0.14), 1.2], color: "light", profile: [[0.11, 0], [0.1, 0.04], [0.06, 0.09], [0, 0.1]] },
    { shape: "tube", radius: 0.03, sides: 6, path: [[0.28, r(dessus(4) + 0.03), -2.2], [0.28, r(dessus(4) + 0.03), 0.6]], color: "copper", mirror: true },
    { shape: "tube", radius: 0.025, sides: 6, path: [[0.24, r(dessus(3) + 0.03), 0.75], [0.24, r(dessus(3) + 0.03), 1.9]], color: "copper", mirror: true, fine: true },

    // ----- superstructure en gradins (arrière), fronts inclinés -----
    { shape: "extrude", profile: gradin(-4.95, -2.35, 1.75, 2.15, 0.2), depth: 3.4, bevel: 0.03, rot: [0, -90, 0], color: "light" },
    { shape: "box", size: [3.1, 0.05, 0.03], pos: [0, 2.03, -2.39], color: "glow" },
    { shape: "wedge", size: [2.4, 0.36, 0.4], pos: [1.9, 1.92, -3.75], rot: [0, 90, 0], color: "steel", mirror: true },
    { shape: "extrude", profile: gradin(-4.9, -2.8, 2.15, 2.51, 0.18), depth: 2.6, bevel: 0.03, rot: [0, -90, 0], color: "metal" },
    { shape: "box", size: [2.3, 0.04, 0.03], pos: [0, 2.4, -2.84], color: "glow" },
    { shape: "box", size: [0.03, 0.04, 1.6], pos: [1.31, 2.37, -3.85], color: "glow", mirror: true },
    { shape: "wedge", size: [1.9, 0.32, 0.3], pos: [1.45, 2.3, -3.9], rot: [0, 90, 0], color: "light", mirror: true },
    { shape: "extrude", profile: gradin(-4.85, -3.25, 2.51, 2.85, 0.16), depth: 1.8, bevel: 0.03, rot: [0, -90, 0], color: "faction" },
    { shape: "box", size: [1.5, 0.04, 0.03], pos: [0, 2.74, -3.29], color: "glow" },
    { shape: "extrude", profile: gradin(-4.75, -3.65, 2.85, 3.11, 0.12), depth: 1.1, bevel: 0.025, rot: [0, -90, 0], color: "light" },
    // hublots sur les fronts des gradins (fins)
    ...[-0.9, -0.45, 0.45, 0.9].map((x): Part => ({ shape: "box", size: [0.2, 0.05, 0.02], pos: [x, 2.33, -2.83], rot: [-30, 0, 0], color: "amber", fine: true })),
    ...[-0.5, 0, 0.5].map((x): Part => ({ shape: "box", size: [0.2, 0.05, 0.02], pos: [x, 2.98, -3.68], rot: [-30, 0, 0], color: "amber", fine: true })),
    // blocs techniques, grilles de radiateurs, évents, conduites de cuivre
    { shape: "box", size: [0.35, 0.16, 0.5], pos: [1.15, 2.22, -4.55], color: "dark", mirror: true },
    ...grille(1.15, 2.3, -4.55, 0.3, 0.42, 4),
    ...grille(0.7, 2.52, -2.95, 0.4, 0.3, 3),
    { shape: "box", size: [0.06, 0.06, 0.06], pos: [1.66, 2.18, -2.42], color: "amber", mirror: true },
    { shape: "tube", radius: 0.035, sides: 6, path: [[1.45, 2.17, -2.6], [1.45, 2.17, -3.3], [1.05, 2.17, -3.3]], bend: 0.1, color: "copper", mirror: true },
    { shape: "tube", radius: 0.025, sides: 6, path: [[0.88, 2.54, -3.4], [0.88, 2.54, -4.7]], color: "steel", mirror: true, fine: true },
    // dessus des gradins hauts : grilles, dôme capteur, hublots latéraux
    ...grille(0.5, 2.86, -4.3, 0.4, 0.5, 4),
    { shape: "lathe", sides: 10, pos: [0.3, 3.11, -4.0], color: "light", profile: [[0.13, 0], [0.12, 0.05], [0.07, 0.11], [0, 0.12]] },
    ...[-4.6, -4.25, -3.9, -3.55, -3.2, -2.85].map((z): Part => ({ shape: "box", size: [0.02, 0.05, 0.16], pos: [1.71, 1.98, z], color: "amber", mirror: true, fine: true })),
    ...[-4.6, -4.2, -3.8, -3.4, -3.0].map((z): Part => ({ shape: "box", size: [0.02, 0.04, 0.16], pos: [1.31, 2.3, z], color: "amber", mirror: true, fine: true })),
    // plateforme d'appontage sur le gradin bas (avant gauche) et radôme bas (avant droit)
    { shape: "cylinder", sides: 12, radius: 0.36, height: 0.03, pos: [-1.0, 2.16, -2.75], color: "hazard" },
    { shape: "cylinder", sides: 12, radius: 0.28, height: 0.04, pos: [-1.0, 2.17, -2.75], color: "dark" },
    { shape: "box", size: [0.22, 0.01, 0.04], pos: [-1.0, 2.195, -2.75], color: "light", fine: true },
    { shape: "box", size: [0.04, 0.01, 0.22], pos: [-1.0, 2.195, -2.75], color: "light", fine: true },

    // ----- tour de commandement : fût, passerelle profilée à verrière -----
    { shape: "bevel", size: [0.5, 0.85, 0.62], pos: [0, 3.5, -4.3], color: "dark" },
    { shape: "box", size: [0.03, 0.5, 0.04], pos: [0.26, 3.5, -4.0], color: "glow", mirror: true },
    { shape: "wedge", size: [0.9, 0.3, 0.5], pos: [0, 3.78, -4.0], rot: [180, 0, 0], color: "steel" },
    { shape: "extrude", profile: [[-4.66, 3.88], [-4.02, 3.88], [-3.93, 4.05], [-4.02, 4.22], [-4.66, 4.22]], depth: 2.5, bevel: 0.03, rot: [0, -90, 0], color: "light" },
    { shape: "box", size: [2.1, 0.06, 0.03], pos: [0, 4.11, -3.96], rot: [-28, 0, 0], color: "glass" },
    { shape: "box", size: [2.1, 0.03, 0.03], pos: [0, 3.97, -3.96], rot: [28, 0, 0], color: "glow" },
    { shape: "box", size: [0.03, 0.06, 0.4], pos: [1.25, 4.07, -4.3], color: "glow", mirror: true },
    { shape: "box", size: [1.7, 0.08, 0.5], pos: [0, 4.25, -4.33], color: "faction" },
    { shape: "box", size: [0.08, 0.06, 0.08], pos: [1.2, 4.24, -3.98], color: "amber", mirror: true },
    // radômes tournés cerclés sur mâts
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.3, pos: [0.92, 4.35, -4.3], color: "steel", mirror: true },
    { shape: "lathe", sides: 12, pos: [0.92, 4.6, -4.3], color: "light", mirror: true, profile: [[0, -0.27], [0.21, -0.17], [0.27, 0], [0.21, 0.17], [0, 0.27]] },
    { shape: "torus", radius: 0.275, tube: 0.02, sides: 12, pos: [0.92, 4.6, -4.3], color: "glow", mirror: true },
    // antennes
    { shape: "tube", radius: 0.02, sides: 4, path: [[0.35, 4.29, -4.45], [0.35, 4.84, -4.45]], color: "light", mirror: true, fine: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.35, 4.86, -4.45], color: "amber", mirror: true, fine: true },
    { shape: "box", size: [0.25, 0.015, 0.015], pos: [0.35, 4.72, -4.45], color: "light", mirror: true, fine: true },
    // radar tournant
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.18, pos: [0, 4.38, -4.4], color: "steel", pivot: "radar" },
    { shape: "extrude", profile: [[-0.25, -0.06], [0.25, -0.06], [0.22, 0.06], [-0.22, 0.06]], depth: 0.04, pos: [0, 4.5, -4.4], rot: [-12, 0, 0], color: "dark", parent: "radar" },
    { shape: "box", size: [0.42, 0.04, 0.05], pos: [0, 4.5, -4.37], color: "glow", parent: "radar" },

    // ----- bloc moteur et tuyères -----
    { shape: "extrude", profile: [[-2.2, 0.4], [2.2, 0.4], [2.2, 1.35], [2.0, 1.5], [-2.0, 1.5], [-2.2, 1.35]], depth: 0.3, bevel: 0.03, pos: [0, 0, -5.12], color: "dark" },
    { shape: "bevel", size: [2.2, 0.5, 0.25], pos: [0, 1.7, -5.08], color: "steel" },
    ...grille(0, 1.96, -5.08, 1.6, 0.2, 2, false),
    ...tuyere(0, 1.05, -5.05, 0.5, 16),
    ...tuyere(1.1, 1.05, -5.05, 0.36, 12, true),
    ...tuyere(1.85, 0.95, -5.05, 0.24, 10, true),
    { shape: "box", size: [0.3, 0.12, 0.05], pos: [0.6, 0.42, -5.0], color: "glow", mirror: true, fine: true },
    { shape: "box", size: [0.06, 0.06, 0.06], pos: [2.2, 1.45, -5.28], color: "amber", mirror: true },

    // ----- défense rapprochée le long des bords -----
    ...[-3.4, -2.0, -0.6, 0.8].flatMap((z, i) => defense(r(larg(PROUE, z) - 0.12), r(dessus(0) + 0.05), z, i % 2 === 1)),

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
