// Variantes des Transhumants : deux unités du même type ne se ressemblent pas tout à fait. Chacune reçoit une variante
// d'après son identifiant (variantOf, packages/client/src/models/generator.ts) ; les pièces d'une variante forment un
// pivot « si:vN#… » (dessiné pour la variante N seulement), une pièce d'origine qui manque sur certaines un pivot
// « sauf:vN#… ». Pièces de récupération dépareillées : plaques rapportées ou arrachées, d'une autre teinte de métal,
// pare-buffle, phares, bidons, roue ou maillons de rechange, bâche, antenne fouet, tuyaux, caisses. La silhouette et
// la lecture du rôle restent celles du modèle d'origine (variante 0).
// Un pivot par variante (fixe, ou qui suit la tourelle), pour ne pas multiplier les appels de dessin.
// Repère : +x à droite, +y en haut, +z vers l'avant.
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, voute } from "./commun.ts";
import type { C } from "./commun.ts";

/** Pièces fixes de la variante `n` (elles ne tournent pas avec la tourelle). */
export function variante(n: number, parts: Part[]): Part[] {
  return parts.map((p) => ({ ...p, pivot: `si:v${n}#fixe_var${n}` }));
}

/** Pièces fixes d'origine, absentes des variantes `vs`. */
export function saufVariantes(vs: number[], nom: string, parts: Part[]): Part[] {
  return parts.map((p) => ({ ...p, pivot: `sauf:${vs.map((v) => "v" + v).join("+")}#fixe_${nom}` }));
}

/** Pièces de la variante `n` portées par la tourelle : un noyau sur son axe `axe` place l'origine du pivot. */
export function varianteTourelle(n: number, axe: Vec3, parts: Part[]): Part[] {
  const pivot = `si:v${n}#tourelle_var${n}`;
  return [{ shape: "box", size: [0.02, 0.02, 0.02], pos: axe, color: "dark", pivot }, ...parts.map((p) => ({ ...p, pivot }))];
}

// ——— Pièces de récupération ———

/** Bidon de carburant (jerrican) debout : corps à arêtes, bouchon ; `k` : taille. */
export function bidon(pos: Vec3, k = 1, color: C = "red", rot: Vec3 = [0, 0, 0]): Part[] {
  const [x, y, z] = pos;
  return [
    { shape: "bevel", size: [q(0.1 * k), q(0.18 * k), q(0.13 * k)], pos, rot, bevel: q(0.015 * k), color },
    { shape: "cylinder", sides: 6, radius: q(0.018 * k), height: q(0.04 * k), pos: [x, q(y + 0.1 * k), q(z + 0.035 * k)], rot, color: "dark", fine: true },
  ];
}

/** Pare-buffle tubulaire : cadre de demi-largeur `hw` de y0 à y1 en z, deux barres horizontales. */
export function pareBuffle(hw: number, y0: number, y1: number, z: number, r = 0.03): Part[] {
  const ym = q((y0 + y1) / 2);
  return [
    { shape: "tube", radius: r, sides: 5, path: [[-hw, y0, q(z - 0.03)], [-hw, y1, z], [hw, y1, z], [hw, y0, q(z - 0.03)]], bend: q(r * 2.5), color: "steel" },
    { shape: "tube", radius: q(r * 0.8), sides: 4, path: [[-hw, ym, z], [hw, ym, z]], color: "steel" },
    ...[-0.4, 0.4].map((t): Part => ({ shape: "box", size: [q(r * 1.6), q(y1 - y0), q(r * 1.6)], pos: [q(hw * t), ym, z], color: "dark", fine: true })),
  ];
}

/** Phare de travail tourné vers +z : boîtier sombre, glace ambre ; `k` : taille. */
export function phare(pos: Vec3, k = 1, rot: Vec3 = [0, 0, 0]): Part[] {
  const [x, y, z] = pos;
  return [
    { shape: "cylinder", sides: 8, radius: q(0.06 * k), height: q(0.08 * k), pos, rot: [rot[0] + 90, rot[1], rot[2]], color: "dark" },
    { shape: "cylinder", sides: 8, radius: q(0.048 * k), height: 0.01, pos: [x, y, q(z + 0.042 * k)], rot: [rot[0] + 90, rot[1], rot[2]], color: "amber" },
  ];
}

/** Antenne fouet : embase sombre, brin d'acier de hauteur `h`, pointe ; `k` : épaisseur (géants). */
export function fouet(pos: Vec3, h: number, k = 1): Part[] {
  const [x, y, z] = pos;
  return [
    { shape: "cylinder", sides: 6, radius: q(0.035 * k), height: q(0.06 * k), pos, color: "dark" },
    { shape: "cylinder", sides: 4, radius: q(0.012 * k), height: h, pos: [x, q(y + h / 2), z], color: "steel", fine: k < 2 },
    { shape: "sphere", radius: q(0.022 * k), pos: [x, q(y + h), z], color: "amber", fine: k < 2 },
  ];
}

/** Bande de maillons de chenille de rechange (caoutchouc à crampons) : largeur `w`, longueur `l`, posée en `pos`. */
export function maillons(pos: Vec3, w: number, l: number, rot: Vec3 = [0, 0, 0]): Part[] {
  const n = Math.max(2, Math.round(l / 0.09));
  return [
    { shape: "box", size: [w, 0.03, l], pos, rot, color: "rubber" },
    ...Array.from({ length: n }, (_, i): Part => {
      const t = (i + 0.5) / n - 0.5;
      const a = (rot[0] * Math.PI) / 180;
      return { shape: "box", size: [q(w + 0.01), 0.025, 0.03], pos: [pos[0], q(pos[1] + 0.02 * Math.cos(a) + t * l * Math.sin(a)), q(pos[2] + t * l * Math.cos(a) - 0.02 * Math.sin(a))], rot, color: "dark", fine: true };
    }),
  ];
}

/** Tôle rapportée : plaque `size` en `pos`, d'une autre teinte que la caisse. */
export function tole(pos: Vec3, size: Vec3, color: C, rot: Vec3 = [0, 0, 0]): Part[] {
  return [{ shape: "box", size, pos, rot, color }];
}

// ——— Pisteur ———

/** Pare-soleil d'origine (absent de la variante 2, qui porte une bâche roulée). */
export function toitPisteur(): Part[] {
  return saufVariantes([2], "toit", [
    { shape: "box", size: [0.76, 0.025, 0.6], pos: [0, 1.02, -0.02], color: "dry" },
    { shape: "box", size: [0.76, 0.028, 0.1], pos: [0, 1.025, -0.02], color: "faction" },
  ]);
}

export function variantesPisteur(): Part[] {
  return [
    // 1 : buggy de raid, pare-buffle, phares sur l'arceau, capot repeint d'une tôle claire
    ...variante(1, [
      ...pareBuffle(0.42, 0.28, 0.62, 1.13),
      ...phare([0.2, 1.07, 0.24], 0.9),
      ...phare([-0.2, 1.07, 0.24], 0.9),
      ...tole([0.1, 0.57, 0.8], [0.46, 0.03, 0.28], "light", [-6, 8, 0]),
    ]),
    // 2 : sans pare-soleil, bâche roulée sur l'arceau, flanc droit blindé d'une plaque rouillée, antenne fouet
    ...variante(2, [
      { shape: "cylinder", sides: 8, radius: 0.075, height: 0.7, pos: [0, 1.06, -0.36], rot: [0, 0, 90], color: "dry" },
      ...[0.2, -0.2].map((x): Part => ({ shape: "cylinder", sides: 8, radius: 0.082, height: 0.04, pos: [x, 1.06, -0.36], rot: [0, 0, 90], color: "black", fine: true })),
      ...tole([0.43, 0.46, -0.1], [0.03, 0.2, 0.62], "rust", [0, 0, -6]),
      ...fouet([-0.36, 0.62, -0.86], 1.1),
    ]),
    // 3 : ravitailleur, trois bidons sur le flanc gauche, touret de câble sur le plateau, portière d'acier clair
    ...variante(3, [
      ...[-0.22, 0, 0.22].flatMap((z, i) => bidon([-0.47, 0.5, q(z - 0.1)], 1, i === 1 ? "rust" : "red")),
      { shape: "torus", radius: 0.12, tube: 0.045, sides: 10, pos: [-0.18, 0.66, -0.42], color: "copper" },
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.1, pos: [-0.18, 0.66, -0.42], color: "dark" },
      ...tole([-0.43, 0.45, 0.3], [0.03, 0.22, 0.4], "steel", [0, 0, 5]),
    ]),
  ];
}

// ——— Cavalier ———

/** Jupes d'équipe d'origine (la variante 1 a perdu celle de droite). */
export function jupesCavalier(): Part[] {
  return saufVariantes([1], "jupes", [{ shape: "box", size: [0.03, 0.14, 1.6], pos: [0.83, 0.38, 0], color: "faction", mirror: true }]);
}

export function variantesCavalier(): Part[] {
  return [
    // 1 : jupe droite arrachée, remplacée par deux tôles dépareillées
    ...variante(1, [
      { shape: "box", size: [0.03, 0.14, 1.6], pos: [-0.83, 0.38, 0], color: "faction" },
      ...tole([0.84, 0.37, 0.42], [0.03, 0.16, 0.5], "rust", [0, 0, 4]),
      ...tole([0.84, 0.39, -0.52], [0.03, 0.13, 0.4], "steel", [0, 0, -3]),
    ]),
    // 2 : glacis rapporté d'une tôle claire, maillons de rechange sur le nez, tuyau de cuivre
    ...variante(2, [
      ...tole([-0.28, 0.615, 0.6], [0.5, 0.04, 0.42], "light", [0, -4, 0]),
      ...maillons([0.05, 0.475, 1.03], 0.66, 0.24, [38, 0, 0]),
      { shape: "tube", radius: 0.028, sides: 5, path: [[0.42, 0.6, 0.3], [0.45, 0.62, -0.3], [0.42, 0.56, -0.8]], bend: 0.1, color: "copper", fine: true },
    ]),
    // 3 : bidons sur les chenilles, à l'arrière ; caisse et antenne fouet sur la tourelle
    ...variante(3, [...bidon([0.6, 0.52, -0.92]), ...bidon([-0.6, 0.52, -0.92], 1, "rust")]),
    ...varianteTourelle(3, [0, 0.72, -0.05], [
      ...coffre([0, 0.8, -0.5], [0.46, 0.14, 0.18], "wood"),
      ...fouet([-0.26, 0.86, -0.34], 0.7),
    ]),
  ];
}

// ——— Herse ———

/** Jupes d'équipe d'origine (la variante 2 a perdu celle de droite). */
export function jupesHerse(): Part[] {
  return saufVariantes([2], "jupes", [{ shape: "box", size: [0.03, 0.14, 1.5], pos: [0.8, 0.38, 0], color: "faction", mirror: true }]);
}

export function variantesHerse(): Part[] {
  return [
    // 1 : pare-buffle, phares sur la cabine, tôle d'acier sous la fente vitrée
    ...variante(1, [
      ...pareBuffle(0.45, 0.22, 0.5, 1.1),
      ...phare([0.3, 0.84, 0.7], 0.9),
      ...phare([-0.3, 0.84, 0.7], 0.9),
      ...tole([0.22, 0.62, 0.83], [0.32, 0.14, 0.03], "steel", [0, 0, 3]),
    ]),
    // 2 : jupe droite remplacée par une tôle claire plus courte, tuyaux de cuivre le long du flanc
    ...variante(2, [
      { shape: "box", size: [0.03, 0.14, 1.5], pos: [-0.8, 0.38, 0], color: "faction" },
      ...tole([0.81, 0.37, 0.3], [0.03, 0.16, 0.7], "light", [0, 0, 3]),
      { shape: "tube", radius: 0.03, sides: 5, path: [[0.43, 0.52, 0.35], [0.46, 0.54, -0.2], [0.43, 0.5, -0.72]], bend: 0.1, color: "copper" },
    ]),
    // 3 : bidons sur les chenilles, à l'avant ; bâche roulée sur le garde-chenille gauche ; antenne fouet
    ...variante(3, [
      ...bidon([0.6, 0.52, 0.82]),
      ...bidon([-0.6, 0.52, 0.82], 1, "rust"),
      { shape: "cylinder", sides: 8, radius: 0.07, height: 0.7, pos: [-0.46, 0.54, -0.3], rot: [90, 0, 0], color: "dry" },
      ...fouet([-0.38, 0.62, -0.95], 1.0),
    ]),
  ];
}

// ——— Canon tracté ———

/** Bâche d'origine de la cabine du tracteur (la variante 2 a un toit de tôle). */
export function bacheCanon(parts: Part[]): Part[] {
  return saufVariantes([2], "bache", parts);
}

export function variantesCanon(): Part[] {
  return [
    // 1 : pare-buffle au tracteur, caisse de munitions sanglée sur le timon
    ...variante(1, [...pareBuffle(0.32, 0.2, 0.5, 1.3), ...coffre([0, 0.4, 0.05], [0.24, 0.14, 0.2], "rust")]),
    // 2 : toit de tôle rouillée et phare de toit à la place de la bâche, roue de rechange au flanc du tracteur
    ...variante(2, [
      ...tole([0, 0.81, 0.88], [0.64, 0.035, 0.4], "rust", [0, 0, -3]),
      ...phare([0.2, 0.89, 1.0], 0.8),
      { use: "roue_d", pos: [0.43, 0.48, 0.66], scale: [0.25, 0.4, 0.4] },
    ]),
    // 3 : enjoliveur d'acier clair sur la roue gauche de l'affût (dépareillée), bidons au flanc, antenne
    ...variante(3, [
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.04, pos: [-0.51, 0.3, -0.35], rot: [0, 0, 90], color: "light" },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.06, pos: [-0.53, 0.3, -0.35], rot: [0, 0, 90], color: "dark", fine: true },
      ...bidon([-0.14, 0.79, 0.42]),
      ...bidon([0.02, 0.79, 0.42], 1, "rust"),
      ...fouet([0.28, 0.8, 0.72], 0.9),
    ]),
  ];
}

// ——— Bélier ———

/** Garde-chenilles d'origine (la variante 2 a perdu celui de droite). */
export function gardesBelier(): Part[] {
  return saufVariantes([2], "gardes", [{ shape: "bevel", size: [0.48, 0.06, 1.5], pos: [0.7, 0.55, -0.25], bevel: 0.02, color: "rust", mirror: true }]);
}

export function variantesBelier(): Part[] {
  return [
    // 1 : plaques soudées sur le dos (acier, tôle claire), deux pneus pendus au flanc droit en blindage d'appoint
    ...variante(1, [
      ...tole([0.06, 1.07, -0.75], [0.5, 0.05, 0.45], "steel", [0, 8, 3]),
      ...tole([-0.12, 1.075, -0.06], [0.36, 0.05, 0.34], "light", [0, -12, 0]),
      ...[-0.25, -0.75].map((z): Part => ({ shape: "torus", radius: 0.19, tube: 0.07, sides: 10, pos: [0.62, 0.8, z], rot: [0, 0, 90], color: "rubber" })),
    ]),
    // 2 : garde-chenille droit arraché, maillons de rechange drapés à sa place, tuyaux de cuivre
    ...variante(2, [
      { shape: "bevel", size: [0.48, 0.06, 1.5], pos: [-0.7, 0.55, -0.25], bevel: 0.02, color: "rust" },
      ...maillons([0.7, 0.6, -0.4], 0.44, 0.9, [0, 0, -8]),
      { shape: "tube", radius: 0.045, sides: 5, path: [[0.52, 0.84, 0.3], [0.58, 0.8, -0.4], [0.52, 0.86, -1.0]], bend: 0.12, color: "copper" },
    ]),
    // 3 : cage de barres à l'arrière, phares sur la proue, bidons sur le dos
    ...variante(3, [
      ...[-0.42, -0.14, 0.14, 0.42].map((x): Part => ({ shape: "box", size: [0.04, 0.5, 0.04], pos: [x, 0.62, -1.3], color: "steel" })),
      { shape: "box", size: [0.96, 0.04, 0.04], pos: [0, 0.82, -1.3], color: "steel" },
      { shape: "box", size: [0.96, 0.04, 0.04], pos: [0, 0.46, -1.3], color: "dark", fine: true },
      ...phare([0.5, 0.74, 1.02], 1.1),
      ...phare([-0.5, 0.74, 1.02], 1.1),
      ...bidon([0.22, 1.16, -0.8]),
      ...bidon([0.36, 1.16, -0.8], 1, "rust"),
    ]),
  ];
}

// ——— Mâtin ———

/** Plaques claires d'origine des flancs (la variante 2 en a d'autres). */
export function flancsMatin(): Part[] {
  return saufVariantes([2], "flancs", [{ shape: "box", size: [0.06, 0.42, 0.5], pos: [0.64, 1.28, 0.42], rot: [0, 0, 6], color: "light", mirror: true }]);
}

export function variantesMatin(): Part[] {
  return [
    // 1 : épaulière d'acier boulonnée par-dessus, bidon sanglé sur la croupe, antenne fouet
    ...variante(1, [
      ...tole([0.7, 1.12, 0.5], [0.06, 0.44, 0.52], "steel", [0, 0, 4]),
      ...bidon([0.24, 1.66, -0.95], 1.3, "red", [-16, 0, 0]),
      ...fouet([-0.26, 1.58, -1.0], 0.8),
    ]),
    // 2 : flanc gauche à nu (câbles de cuivre apparents), flanc droit d'une tôle de cuivre, bâche roulée sur la croupe
    ...variante(2, [
      ...tole([0.65, 1.3, 0.4], [0.06, 0.36, 0.46], "copper", [0, 0, 8]),
      { shape: "tube", radius: 0.03, sides: 4, path: [[-0.6, 1.46, 0.66], [-0.66, 1.26, 0.42], [-0.6, 1.08, 0.2]], bend: 0.08, color: "copper" },
      { shape: "tube", radius: 0.025, sides: 4, path: [[-0.62, 1.4, 0.2], [-0.67, 1.2, 0.5], [-0.6, 1.02, 0.7]], bend: 0.08, color: "black", fine: true },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.6, pos: [0, 1.6, -0.74], rot: [0, 0, 90], color: "dry" },
    ]),
    // 3 : écailles de blindage sur la croupe, phare sur le poitrail, tuyau de cuivre
    ...variante(3, [
      ...tole([0, 1.56, -0.62], [0.5, 0.05, 0.32], "steel", [-13, 0, 0]),
      ...tole([0.02, 1.47, -0.95], [0.46, 0.05, 0.3], "rust", [-16, 0, 4]),
      ...phare([0.38, 1.6, 0.92], 1.2),
      { shape: "tube", radius: 0.03, sides: 4, path: [[0.3, 1.7, 0.3], [0.5, 1.5, -0.1], [0.42, 1.36, -0.6]], bend: 0.1, color: "copper", fine: true },
    ]),
  ];
}

// ——— Berger (pièces portées par le buste, qui tourne : pivot sur l'axe `axe`) ———

/** Couverture roulée d'origine, au dos (la variante 2 porte des bidons à la place). */
export function couvertureBerger(axe: Vec3): Part[] {
  const pivot = "sauf:v2#tourelle_couverture";
  return [
    { shape: "box", size: [0.02, 0.02, 0.02], pos: axe, color: "dark", pivot },
    { shape: "cylinder", sides: 8, radius: 0.27, height: 1.5, pos: [0, 2.74, -1.14], rot: [0, 0, 90], color: "dry", pivot },
    { shape: "cylinder", sides: 8, radius: 0.29, height: 0.16, pos: [0.44, 2.74, -1.14], rot: [0, 0, 90], color: "faction", mirror: true, fine: true, pivot },
  ];
}

export function variantesBerger(axe: Vec3): Part[] {
  return [
    // 1 : portière de cabine gauche d'une tôle claire, projecteur et roue de rechange sur la cabine droite
    ...varianteTourelle(1, axe, [
      ...tole([-1.8, 3.54, 0.05], [0.06, 0.42, 0.62], "light", [0, 0, 8]),
      ...phare([1.2, 4.08, 0.34], 2),
      { use: "roue_d", pos: [1.46, 4.08, -0.18], rot: [0, 0, 90], scale: [0.25, 0.5, 0.5] },
    ]),
    // 2 : bidons sanglés au dos à la place de la couverture, deux antennes fouet sur le dôme, demi-toit rouillé rapporté
    ...varianteTourelle(2, axe, [
      ...[-0.36, 0, 0.36].flatMap((x, i) => bidon([x, 2.76, -1.12], 2.2, i === 1 ? "rust" : "red")),
      { shape: "box", size: [1.0, 0.05, 0.05], pos: [0, 2.8, -1.27], color: "black", fine: true },
      ...fouet([-0.5, 4.5, 0.42], 1.4, 3),
      ...fouet([0.42, 4.5, 0.36], 1.0, 3),
      ...tole([-1.5, 3.97, 0.0], [0.42, 0.05, 0.9], "rust", [0, 0, 8]),
    ]),
    // 3 : grille devant le foyer, pare-buffles aux cabines, pièce rouillée sur la houppelande, caisse et bidon sur le toit
    ...varianteTourelle(3, axe, [
      ...[-0.3, -0.1, 0.1, 0.3].map((x): Part => ({ shape: "box", size: [0.05, 0.7, 0.05], pos: [x, 3.08, 1.03], rot: [14, 0, 0], color: "steel" })),
      { shape: "box", size: [0.8, 0.05, 0.05], pos: [0, 3.12, 1.04], rot: [14, 0, 0], color: "steel" },
      { shape: "tube", radius: 0.045, sides: 5, path: [[1.0, 3.14, 0.6], [1.0, 3.46, 0.64], [1.7, 3.46, 0.64], [1.7, 3.14, 0.6]], bend: 0.1, color: "steel", mirror: true },
      ...tole([0.32, 3.62, -1.08], [0.62, 0.5, 0.05], "rust", [43, 0, 0]),
      ...coffre([1.4, 4.1, -0.12], [0.5, 0.26, 0.44], "wood"),
      ...bidon([1.3, 4.18, 0.28], 2),
    ]),
  ];
}

// ——— Chariot de convoi ———

/** Chargement d'origine (les variantes 1 et 3 en ont un autre). */
export function chargeConvoi(parts: Part[]): Part[] {
  return saufVariantes([1, 3], "charge", parts);
}

/** Ridelles de bois d'origine (la variante 2 a une ridelle droite de tôle). */
export function ridellesConvoi(): Part[] {
  return saufVariantes([2], "ridelles", [{ shape: "box", size: [0.04, 0.22, 1.0], pos: [0.48, 0.58, -0.22], color: "wood", mirror: true }]);
}

export function variantesConvoi(): Part[] {
  return [
    // 1 : chargement sous bâche sanglée, bidons à l'avant droit
    ...variante(1, [
      { shape: "extrude", profile: voute(0.42, 0.34, 6), depth: 0.9, pos: [0, 0.47, -0.22], color: "dry" },
      ...[0.05, -0.5].map((z): Part => ({ shape: "extrude", profile: voute(0.435, 0.355, 6), depth: 0.05, pos: [0, 0.47, z], color: "faction" })),
      ...bidon([0.3, 0.57, 0.52], 1.1),
      ...bidon([0.17, 0.57, 0.52], 1.1, "rust"),
    ]),
    // 2 : ridelle droite de tôle rouillée, perche à phare de travail, roue de rechange à plat à l'avant
    ...variante(2, [
      { shape: "box", size: [0.04, 0.22, 1.0], pos: [-0.48, 0.58, -0.22], color: "wood" },
      ...tole([0.49, 0.59, -0.22], [0.045, 0.25, 1.0], "rust"),
      { shape: "cylinder", sides: 5, radius: 0.015, height: 0.6, pos: [-0.46, 0.98, -0.68], color: "steel" },
      ...phare([-0.46, 1.3, -0.64], 1),
      { use: "roue_d", pos: [0.24, 0.53, 0.52], rot: [0, 0, 90], scale: [0.12, 0.34, 0.34] },
    ]),
    // 3 : fûts et touret de câble à la place des caisses, antenne fouet
    ...variante(3, [
      ...([[0.22, -0.08, "rust"], [-0.2, -0.1, "metal"], [0.2, -0.46, "copper"]] as [number, number, C][]).map(([x, z, c]): Part => ({ shape: "cylinder", sides: 10, radius: 0.15, height: 0.36, pos: [x, 0.65, z], color: c })),
      ...[0.22, -0.2].map((x): Part => ({ shape: "torus", radius: 0.15, tube: 0.015, sides: 10, pos: [x, 0.74, x > 0 ? -0.08 : -0.1], color: "dark", fine: true })),
      { shape: "torus", radius: 0.13, tube: 0.05, sides: 10, pos: [-0.22, 0.54, -0.46], rot: [0, 0, 90], color: "copper" },
      { shape: "cylinder", sides: 8, radius: 0.16, height: 0.04, pos: [-0.22, 0.54, -0.46], rot: [0, 0, 90], color: "wood" },
      ...fouet([0.44, 0.7, -0.7], 0.8),
    ]),
  ];
}

// ——— Chenillards (châssis commun, unité repliée seulement) ———

/**
 * Variantes du châssis d'un chenillard (`chariotNomade`) : demi-longueur `hl`, demi-largeur `hw`, cabine en `cx`.
 * 1 : pare-buffle, bidons au cul, antenne fouet sur la cabine ; 2 : maillons de rechange à l'avant et sur le garde-boue,
 * portière et tôle de toit claires, projecteur de toit, galet de rechange à l'arrière.
 */
export function variantesChenillard(hl: number, hw: number, cx: number): Part[] {
  return [
    ...variante(1, [
      ...pareBuffle(q(hw + 0.22), 0.22, 0.62, q(hl + 0.1), 0.035),
      ...[-0.25, 0, 0.25].flatMap((x, i) => bidon([q(hw * 0.4 + x), 0.5, q(-hl - 0.08)], 1.2, i === 1 ? "rust" : "red")),
      ...fouet([q(cx - 0.2), 1.06, q(hl - 0.52)], 1.1),
    ]),
    ...variante(2, [
      ...maillons([q(hw * 0.5), 0.42, q(hl + 0.03)], 0.4, 0.22, [90, 0, 0]),
      ...maillons([q(hw + 0.16), 0.5, q(hl - 0.2)], 0.3, 0.36),
      ...tole([q(-(hw + 0.155)), 0.74, q(hl - 0.36)], [0.03, 0.26, 0.4], "light", [0, 0, 3]),
      ...tole([q(cx + 0.08), 1.1, q(hl - 0.46)], [0.4, 0.03, 0.24], "light", [0, 0, -4]),
      ...phare([cx, 1.12, q(hl - 0.24)], 1.3),
      { shape: "cylinder", sides: 10, radius: 0.17, height: 0.12, pos: [q(-hw * 0.4), 0.48, q(-hl - 0.08)], rot: [90, 0, 0], color: "steel" },
      { shape: "torus", radius: 0.17, tube: 0.04, sides: 10, pos: [q(-hw * 0.4), 0.48, q(-hl - 0.08)], rot: [90, 0, 0], color: "rubber" },
    ]),
  ];
}
