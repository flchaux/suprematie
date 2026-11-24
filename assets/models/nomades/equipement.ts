// Équipement visible des unités de combat des Transhumants (trois emplacements : arme, châssis, équipement ; voir
// sim/src/ameliorations/table.rs et docs/spec/races.md). Une fonction par unité donne les pièces à ajouter au modèle
// de transhumants.ts ; grammaire des pivots « si: » et « sauf: » : voir nomades/arche.ts et parseCond (generator.ts).
// Chaque choix change la silhouette : l'unité fait 25 à 60 pixels, vue de haut. Même langage d'une unité à l'autre :
// moteur à cylindres de cuivre et pots relevés, plaques de tôle et de rouille, filet vert tacheté, antenne blanche qui
// tourne, anneaux de cuivre et globe cyan, réservoirs rouges des lance-flammes.
// Repère : +x à droite, +y en haut, +z vers l'avant. Les pièces « si: » ne comptent pas dans la taille du modèle.
import type { Part, Vec3 } from "../types.ts";
import { q, incl, fut, chenille, coffre } from "./commun.ts";
import type { C } from "./commun.ts";

/** Pivots des pièces d'origine, cachées par un choix qui les remplace. */
export const ARME_PISTEUR = "sauf:tracker_gun+tracker_rocket#tourelle";
export const ARME_CAVALIER = "sauf:rider_twin+rider_long+rider_flame#tourelle";
export const PLAGE_CAVALIER = "sauf:rider_engine#fixe_plage";
export const ARME_HERSE = "sauf:harrow_long+harrow_mixed+harrow_missile#tourelle";
export const COFFRE_HERSE = "sauf:harrow_engine#fixe_coffre";
export const ARME_CANON = "sauf:gun_long+gun_cluster+gun_fast#tourelle";
export const BOUCLIER_CANON = "sauf:gun_plate+gun_cluster#tourelle";
export const DENTS_BELIER = "sauf:ram_saw#fixe_dents";
export const POUPE_BELIER = "sauf:ram_engine#fixe_poupe";

/** Pièces d'un pivot : la première porte le pivot (son origine), les autres le suivent. */
export function groupe(pivot: string, parts: Part[]): Part[] {
  return parts.map((p) => ({ ...p, pivot }));
}

/** Noyau caché dans la caisse : il place l'origine d'un pivot qui vise sur l'axe de la tourelle. */
export function noyau(pivot: string, pos: Vec3): Part {
  return { shape: "box", size: [0.02, 0.02, 0.02], pos, color: "dark", pivot };
}

/** Pièces qui visent : le noyau sur l'axe de la tourelle, puis les pièces. */
function vise(pivot: string, axe: Vec3, parts: Part[]): Part[] {
  return [noyau(pivot, axe), ...groupe(pivot, parts)];
}

// ——— Pièces communes à plusieurs unités ———

/**
 * Moteur gonflé, apparent à l'arrière : berceau, bloc sombre à bande d'équipe, deux rangées de cylindres de cuivre en V,
 * deux pots relevés à bouche ambre. `y` : pont, `z` : face avant du bloc, `l` : longueur, `w` : demi-largeur du bloc.
 */
function moteur(y: number, z: number, l: number, w: number): Part[] {
  const zc = q(z - l / 2);
  const zp = q(z - l * 0.72);
  return [
    { shape: "box", size: [q(w * 2 + 0.2), 0.1, q(l + 0.06)], pos: [0, q(y - 0.02), zc], color: "rust" },
    { shape: "bevel", size: [q(w * 2), 0.34, l], pos: [0, q(y + 0.19), zc], bevel: 0.05, color: "dark" },
    { shape: "box", size: [q(w * 0.5), 0.05, q(l + 0.02)], pos: [0, q(y + 0.37), zc], color: "faction" },
    ...[0.17, 0.5, 0.83].map((t): Part => ({ shape: "cylinder", sides: 6, radius: q(l * 0.145), height: 0.34, pos: [q(w * 0.66), q(y + 0.42), q(z - l * t)], rot: [0, 0, -38], color: "copper", mirror: true })),
    { shape: "cylinder", sides: 8, radius: 0.08, radiusTop: 0.13, height: 0.8, pos: [q(w + 0.15), q(y + 0.48), zp], rot: [-30, 0, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.03, pos: [q(w + 0.15), q(y + 0.835), q(zp - 0.205)], rot: [-30, 0, 0], color: "amber", mirror: true },
    { shape: "torus", radius: q(w * 0.5), tube: 0.05, sides: 10, pos: [0, q(y + 0.19), q(z - l - 0.02)], rot: [90, 0, 0], color: "copper", fine: true },
  ];
}

/** Antenne de veille, qui tourne (pivot « radar… ») : mât de longueur `h` sur l'axe, panneau blanc incurvé à bande d'équipe. */
function antenne(pivot: string, pied: Vec3, h: number, w: number): Part[] {
  const [x, y, z] = pied;
  const t = q(y + h);
  return groupe(pivot, [
    { shape: "cylinder", sides: 6, radius: 0.05, height: h, pos: [x, q(y + h / 2), z], color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.15, height: 0.1, pos: [x, t, z], color: "dark" },
    { shape: "box", size: [q(w * 0.56), 0.46, 0.06], pos: [x, q(t + 0.26), z], rot: [-14, 0, 0], color: "light" },
    ...[1, -1].map((sx): Part => ({ shape: "box", size: [q(w * 0.28), 0.4, 0.06], pos: [q(x + sx * w * 0.4), q(t + 0.25), q(z + w * 0.07)], rot: [-14, sx * -32, 0], color: "light" })),
    { shape: "box", size: [q(w * 0.58), 0.09, 0.09], pos: [x, q(t + 0.48), q(z - 0.055)], rot: [-14, 0, 0], color: "faction" },
    { shape: "box", size: [0.06, 0.06, 0.42], pos: [x, q(t + 0.12), q(z + 0.2)], rot: [-12, 0, 0], color: "steel" },
    { shape: "sphere", radius: 0.07, pos: [x, q(t + 0.18), q(z + 0.42)], color: "amber" },
  ]);
}

/** Émetteur de bulle : colonne, anneaux de cuivre et globe cyan ; `k` : taille. */
function emetteur(pied: Vec3, h: number, k: number): Part[] {
  const [x, y, z] = pied;
  return [
    { shape: "cylinder", sides: 8, radius: q(0.2 * k), radiusTop: q(0.12 * k), height: 0.12, pos: [x, q(y + 0.06), z], color: "steel" },
    { shape: "cylinder", sides: 8, radius: q(0.075 * k), height: h, pos: [x, q(y + h / 2), z], color: "dark" },
    { shape: "torus", radius: q(0.23 * k), tube: q(0.05 * k), sides: 12, pos: [x, q(y + h * 0.52), z], color: "copper" },
    { shape: "torus", radius: q(0.19 * k), tube: q(0.045 * k), sides: 12, pos: [x, q(y + h * 0.76), z], color: "copper" },
    { shape: "sphere", radius: q(0.22 * k), detail: 1, pos: [x, q(y + h + 0.12 * k), z], color: "glow" },
  ];
}

/**
 * Jupes d'appoint sur les flancs : plaques de tôle et de rouille alternées, évasées vers le bas, à bande d'équipe.
 * Centre en (x, y), hauteur `h`, une plaque de longueur `l` à chaque z.
 */
function jupes(x: number, y: number, h: number, zs: number[], l: number, pente = 10): Part[] {
  const s = Math.sin((pente * Math.PI) / 180);
  const c = Math.cos((pente * Math.PI) / 180);
  return zs.flatMap((z, i): Part[] => [
    { shape: "box", size: [0.08, h, q(l - 0.05)], pos: [x, y, z], rot: [0, 0, pente], color: i % 2 ? "rust" : "metal", mirror: true },
    { shape: "box", size: [0.1, 0.11, q(l - 0.2)], pos: [q(x - s * h * 0.28), q(y + c * h * 0.28), z], rot: [0, 0, pente], color: i % 2 ? "hazard" : "faction", mirror: true },
  ]);
}

type Pt = [number, number];

/** Contour (du faîte vers le bord) décalé de `d` le long de sa normale extérieure. */
function decale(c: Pt[], d: number): Pt[] {
  return c.map((p, i): Pt => {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(c.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    return [q(p[0] - (dy / l) * d), q(p[1] + (dx / l) * d)];
  });
}

/** Nappe mince (paire symétrique) qui suit le contour `c` de z0 à z1, entre `bas` et `haut` au-dessus de lui. */
function nappe(c: Pt[], z0: number, z1: number, haut: number, bas: number, color: C): Part {
  return { shape: "extrude", profile: [...decale(c, haut), ...decale(c, bas).reverse()], depth: q(z1 - z0), pos: [0, 0, q((z0 + z1) / 2)], color, mirror: true };
}

/** Tache de filet posée sur le segment `i` du contour, à la fraction `t`, du côté `sx`. */
function tache(c: Pt[], i: number, t: number, sx: number, z: number, lx: number, lz: number, color: C): Part {
  const [a, b] = [c[i], c[i + 1]];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  return {
    shape: "box", size: [lx, 0.02, lz], color,
    pos: [q(sx * (a[0] + dx * t - (dy / l) * 0.025)), q(a[1] + dy * t + (dx / l) * 0.025), z],
    rot: [0, 0, q((sx * Math.atan2(dy, dx) * 180) / Math.PI)],
  };
}

/**
 * Filet de camouflage tendu sur arceaux : trois lés verts de longueurs inégales le long du contour `c` (du faîte, ou d'un
 * bord intérieur, vers le bas), arceaux de bois aux bouts, bande d'équipe, taches claires (`taches`).
 */
function filet(c: Pt[], z0: number, z1: number, taches: Part[]): Part[] {
  const n = c.length;
  const t = (z1 - z0) / 3;
  // lé du milieu plus court : le bord du filet est déchiqueté
  const court: Pt[] = [...c.slice(0, n - 1), [q((c[n - 2][0] + c[n - 1][0] * 2) / 3), q((c[n - 2][1] + c[n - 1][1] * 2) / 3)]];
  return [
    nappe(c, z0, q(z0 + t), 0.012, -0.018, "leaf_dark"),
    nappe(court, q(z0 + t), q(z0 + 2 * t), 0.02, -0.018, "leaf"),
    nappe(c, q(z0 + 2 * t), z1, 0.012, -0.018, "leaf_dark"),
    { ...nappe(c, q(z0 - 0.02), q(z0 + 0.04), 0.03, -0.03, "wood"), fine: true },
    { ...nappe(c, q(z1 - 0.04), q(z1 + 0.02), 0.03, -0.03, "wood"), fine: true },
    nappe(c.slice(0, n - 1), q(z1 - 0.2), q(z1 - 0.08), 0.03, 0, "faction"),
    ...taches.map((p, i): Part => ({ ...p, fine: i > 2 })),
  ];
}

// ——— Pisteur (tracker) : tourelle en (0, -0,3), toile de toit à y = 1,035 ———

export function equipementPisteur(): Part[] {
  const axe: Vec3 = [0, 1.17, -0.3];
  const mitrailleuse = groupe("si:tracker_gun#tourelle", [
    { shape: "cylinder", sides: 10, radius: 0.26, height: 0.1, pos: axe, color: "steel" },
    { shape: "box", size: [0.5, 0.2, 0.5], pos: [0, 1.3, -0.14], color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.06, height: 1.1, pos: [0.15, 1.32, 0.6], rot: [90, 0, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.42, pos: [0.15, 1.32, 0.4], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.09, height: 0.14, pos: [0.15, 1.32, 1.16], rot: [90, 0, 0], color: "dark", mirror: true },
    // bouclier à trois pans
    { shape: "box", size: [0.8, 0.4, 0.06], pos: [0, 1.4, 0.16], rot: [-16, 0, 0], color: "metal" },
    { shape: "box", size: [0.36, 0.38, 0.06], pos: [0.54, 1.38, 0.06], rot: [-12, 38, 0], color: "metal", mirror: true },
    { shape: "box", size: [0.8, 0.09, 0.07], pos: [0, 1.56, 0.115], rot: [-16, 0, 0], color: "faction" },
    ...coffre([0.38, 1.28, -0.3], [0.2, 0.24, 0.4], "wood").map((p): Part => ({ ...p, mirror: true })),
  ]);
  const paniers: Part[] = [
    { shape: "cylinder", sides: 10, radius: 0.24, height: 0.1, pos: axe, color: "steel" },
    { shape: "box", size: [0.2, 0.26, 0.24], pos: [0, 1.32, -0.3], color: "dark" },
    { shape: "box", size: [1.0, 0.12, 0.2], pos: [0, 1.46, -0.3], color: "steel" },
    incl([0.5, 1.48, -0.3], 16, 0.1, 0, { shape: "bevel", size: [0.44, 0.44, 0.96], bevel: 0.05, color: "dark", mirror: true }),
    incl([0.5, 1.48, -0.3], 16, 0.06, 0.225, { shape: "box", size: [0.3, 0.03, 0.7], color: "faction", mirror: true }),
  ];
  for (const dx of [-0.1, 0.1])
    for (const h of [-0.1, 0.1]) paniers.push(incl([q(0.5 + dx), 1.48, -0.3], 16, 0.65, h, { shape: "cone", sides: 6, radius: 0.09, height: 0.2, rot: [90, 0, 0], color: "red", mirror: true }));
  const turbo: Part[] = [
    // prise d'air sur le capot
    { shape: "bevel", size: [0.46, 0.26, 0.42], pos: [0, 0.7, 0.84], bevel: 0.05, color: "steel" },
    { shape: "box", size: [0.36, 0.16, 0.04], pos: [0, 0.72, 1.05], color: "black" },
    // aileron
    { shape: "box", size: [1.6, 0.05, 0.38], pos: [0, 1.0, -1.22], rot: [10, 0, 0], color: "faction" },
    { shape: "box", size: [0.05, 0.34, 0.5], pos: [0.8, 1.0, -1.22], color: "dark", mirror: true },
    { shape: "box", size: [0.06, 0.48, 0.12], pos: [0.3, 0.78, -1.12], rot: [12, 0, 0], color: "steel", mirror: true },
    // deux gros échappements vers l'arrière
    { shape: "cylinder", sides: 8, radius: 0.08, radiusTop: 0.15, height: 0.6, pos: [0.36, 0.52, -1.24], rot: [-76, 0, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.03, pos: [0.36, 0.596, -1.535], rot: [-76, 0, 0], color: "amber", mirror: true },
    { shape: "tube", radius: 0.06, sides: 5, path: [[0.44, 0.64, -0.1], [0.46, 0.64, -0.7], [0.36, 0.5, -1.05]], bend: 0.1, color: "copper", mirror: true, fine: true },
  ];
  const plaques: Part[] = [
    { shape: "box", size: [0.96, 0.05, 0.98], pos: [0, 1.055, -0.03], color: "metal" },
    { shape: "box", size: [0.3, 0.02, 1.0], pos: [0, 1.083, -0.03], color: "faction" },
    // flancs en deux hauteurs : une fente de tir entre les deux
    { shape: "box", size: [0.06, 0.2, 1.06], pos: [0.46, 0.97, -0.03], color: "metal", mirror: true },
    { shape: "box", size: [0.07, 0.3, 1.0], pos: [0.465, 0.6, -0.04], color: "rust", mirror: true },
    { shape: "box", size: [0.94, 0.2, 0.06], pos: [0, 0.97, -0.55], color: "metal" },
    { shape: "box", size: [0.94, 0.28, 0.06], pos: [0, 0.62, -0.58], color: "rust" },
    // glacis à fente, museau
    { shape: "box", size: [0.96, 0.06, 0.66], pos: [0, 0.83, 0.66], rot: [47, 0, 0], color: "metal" },
    { shape: "box", size: [0.62, 0.07, 0.09], pos: [0, 0.94, 0.565], rot: [47, 0, 0], color: "black" },
    { shape: "box", size: [1.02, 0.08, 0.5], pos: [0, 0.56, 1.02], rot: [26, 0, 0], color: "rust" },
    { shape: "box", size: [0.3, 0.09, 0.5], pos: [0, 0.567, 1.02], rot: [26, 0, 0], color: "faction" },
    // garde-roues
    ...[0.7, -0.74].flatMap((z): Part[] => [
      { shape: "box", size: [0.36, 0.06, 0.74], pos: [0.66, 0.66, z], color: "metal", mirror: true },
      { shape: "box", size: [0.06, 0.28, 0.74], pos: [0.84, 0.53, z], rot: [0, 0, 8], color: "rust", mirror: true },
    ]),
  ];
  const c: Pt[] = [[0, 1.11], [0.45, 1.11], [0.8, 0.95], [1.04, 0.62], [1.1, 0.28]];
  return [
    ...mitrailleuse,
    ...groupe("si:tracker_rocket#tourelle", paniers),
    ...groupe("si:tracker_turbo#fixe_turbo", turbo),
    ...groupe("si:tracker_plate#fixe_plaques", plaques),
    ...antenne("si:tracker_radar#radar_tete", [0, 2.02, -0.3], 0.2, 1.3),
    ...groupe("si:tracker_net#fixe_filet", filet(c, -0.88, 0.42, [
      tache(c, 0, 0.75, 1, 0.14, 0.26, 0.22, "dry"),
      tache(c, 0, 0.7, -1, -0.68, 0.28, 0.2, "dry"),
      tache(c, 1, 0.5, 1, -0.35, 0.3, 0.34, "dry"),
      tache(c, 1, 0.5, -1, -0.1, 0.3, 0.3, "leaf_dark"),
      tache(c, 2, 0.4, 1, -0.7, 0.34, 0.24, "leaf"),
      tache(c, 2, 0.5, -1, 0.15, 0.34, 0.24, "leaf"),
      tache(c, 2, 0.5, -1, -0.62, 0.3, 0.2, "dry"),
    ])),
    // longue-vue : gros tube de cuivre sur la tête du mât, objectif cyan
    ...groupe("si:tracker_scope#tourelle_vue", [
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.16, pos: [0, 2.1, -0.3], color: "steel" },
      { shape: "box", size: [0.4, 0.1, 0.3], pos: [0, 2.2, -0.3], color: "dark" },
      { shape: "lathe", sides: 10, pos: [0, 2.36, -1.1], rot: [90, 0, 0], color: "copper", profile: [[0, 0], [0.12, 0], [0.12, 0.14], [0.1, 0.16], [0.1, 0.6], [0.15, 0.64], [0.15, 1.2], [0.24, 1.26], [0.24, 1.6], [0.2, 1.6], [0.2, 1.54], [0, 1.54]] },
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.03, pos: [0, 2.36, 0.46], rot: [90, 0, 0], color: "glow" },
      { shape: "box", size: [0.34, 0.34, 0.12], pos: [0, 2.36, -0.3], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.1, pos: [0, 2.36, -1.06], rot: [90, 0, 0], color: "dark", fine: true },
    ]),
  ];
}

// ——— Cavalier (rider) : tourelle en (0, -0,05), y de 0,6 à 0,87 ———

export function equipementCavalier(): Part[] {
  const axe: Vec3 = [0, 0.72, -0.05];
  const jumeles: Part[] = [
    { shape: "box", size: [0.64, 0.28, 0.24], pos: [0, 0.76, 0.42], color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.07, height: 1.2, pos: [0.2, 0.76, 1.1], rot: [90, 0, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.105, height: 0.4, pos: [0.2, 0.76, 0.7], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.115, height: 0.2, pos: [0.2, 0.76, 1.62], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "box", size: [0.64, 0.18, 0.32], pos: [0, 0.94, -0.48], color: "rust" },
    { shape: "box", size: [0.2, 0.19, 0.33], pos: [0, 0.94, -0.48], color: "faction" },
  ];
  const long: Part[] = [
    { shape: "box", size: [0.4, 0.3, 0.3], pos: [0, 0.76, 0.42], color: "steel" },
    { shape: "lathe", sides: 8, pos: [0, 0.76, 0.5], rot: [90, 0, 0], color: "steel", profile: fut(0.08, 2.1) },
    { shape: "box", size: [0.4, 0.18, 0.11], pos: [0, 0.76, 2.32], color: "dark" },
    { shape: "box", size: [0.4, 0.18, 0.11], pos: [0, 0.76, 2.54], color: "dark" },
    { shape: "box", size: [0.6, 0.22, 0.36], pos: [0, 0.94, -0.5], color: "metal" },
    { shape: "box", size: [0.2, 0.23, 0.37], pos: [0, 0.94, -0.5], color: "faction" },
  ];
  const flamme: Part[] = [
    { shape: "box", size: [0.46, 0.28, 0.26], pos: [0, 0.76, 0.42], color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.11, height: 0.5, pos: [0, 0.86, 0.72], rot: [90, 0, 0], color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.12, radiusTop: 0.22, height: 0.3, pos: [0, 0.87, 1.1], rot: [90, 0, 0], color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.17, height: 0.03, pos: [0, 0.87, 1.25], rot: [90, 0, 0], color: "amber" },
    { shape: "cylinder", sides: 8, radius: 0.18, height: 0.7, pos: [0.23, 1.04, -0.26], rot: [90, 0, 0], color: "red", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.84, pos: [0.23, 1.04, -0.26], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "box", size: [0.84, 0.06, 0.1], pos: [0, 1.22, -0.26], color: "faction" },
    { shape: "tube", radius: 0.035, sides: 4, path: [[0.23, 1.04, 0.14], [0.23, 1.0, 0.4], [0.1, 0.8, 0.55]], bend: 0.1, color: "copper", mirror: true, fine: true },
  ];
  const blindage: Part[] = [
    ...jupes(0.91, 0.39, 0.4, [-0.84, -0.28, 0.28, 0.84], 0.56),
    { shape: "box", size: [1.8, 0.09, 0.56], pos: [0, 0.41, 1.16], rot: [40, 0, 0], color: "rust" },
    { shape: "box", size: [0.36, 0.11, 0.56], pos: [0, 0.41, 1.16], rot: [40, 0, 0], color: "faction" },
    { shape: "box", size: [0.4, 0.13, 0.3], pos: [0.55, 0.43, 1.17], rot: [40, 0, 0], color: "dark", mirror: true },
  ];
  const joues: Part[] = [
    { shape: "box", size: [0.1, 0.26, 0.56], pos: [0.53, 0.77, -0.14], rot: [0, -5, 0], color: "rust", mirror: true },
    { shape: "box", size: [0.1, 0.26, 0.42], pos: [0.49, 0.77, 0.18], rot: [0, -27, 0], color: "metal", mirror: true },
  ];
  const atelier: Part[] = [
    ...coffre([-0.655, 0.66, -0.76], [0.33, 0.34, 0.5], "red"),
    { shape: "box", size: [0.12, 0.06, 0.4], pos: [-0.655, 0.85, -0.76], color: "light" },
    // bras articulé le long du flanc droit
    { shape: "cylinder", sides: 8, radius: 0.17, height: 0.22, pos: [0.64, 0.58, -0.84], color: "dark" },
    { shape: "box", size: [0.15, 0.9, 0.15], pos: [0.64, 1.06, -0.94], rot: [-14, 0, 0], color: "hazard" },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.24, pos: [0.64, 1.5, -1.04], rot: [0, 0, 90], color: "dark" },
    { shape: "box", size: [0.13, 0.13, 1.2], pos: [0.64, 1.48, -0.44], rot: [4, 0, 0], color: "faction" },
    { shape: "box", size: [0.2, 0.34, 0.2], pos: [0.64, 1.3, 0.14], color: "steel" },
    { shape: "sphere", radius: 0.1, pos: [0.64, 1.1, 0.16], color: "glow" },
  ];
  const butin: Part[] = [
    { shape: "bevel", size: [0.34, 0.42, 0.46], pos: [1.2, 0.42, -0.74], bevel: 0.09, color: "dry", mirror: true },
    { shape: "box", size: [0.32, 0.36, 0.42], pos: [1.19, 0.42, -0.26], color: "wood", mirror: true },
    { shape: "bevel", size: [0.36, 0.44, 0.4], pos: [1.21, 0.42, 0.18], bevel: 0.09, color: "copper", mirror: true },
    { shape: "box", size: [0.3, 0.34, 0.34], pos: [1.18, 0.42, 0.6], color: "rust", mirror: true },
    // filet : sangles noires, potences
    ...[-0.5, -0.02, 0.41].map((z): Part => ({ shape: "box", size: [0.4, 0.46, 0.04], pos: [1.2, 0.42, z], color: "black", mirror: true })),
    { shape: "box", size: [0.4, 0.04, 1.72], pos: [1.2, 0.5, -0.06], color: "black", mirror: true, fine: true },
    { shape: "box", size: [0.38, 0.05, 0.07], pos: [1.13, 0.6, 0.84], color: "steel", mirror: true, fine: true },
    { shape: "box", size: [0.38, 0.05, 0.07], pos: [1.13, 0.6, -1.02], color: "steel", mirror: true, fine: true },
  ];
  return [
    ...vise("si:rider_twin#tourelle", axe, jumeles),
    ...vise("si:rider_long#tourelle", axe, long),
    ...vise("si:rider_flame#tourelle", axe, flamme),
    ...groupe("si:rider_plate#fixe_plaques", blindage),
    ...vise("si:rider_plate#tourelle_joues", axe, joues),
    ...groupe("si:rider_engine#fixe_moteur", moteur(0.58, -0.86, 0.62, 0.36)),
    ...groupe("si:rider_repair#fixe_atelier", atelier),
    ...groupe("si:rider_loot#fixe_butin", butin),
  ];
}

// ——— Herse (harrow) : tourelle en (0, -0,15), caisse de y = 0,7 à 1,0 ———

export function equipementHerse(): Part[] {
  const axe: Vec3 = [0, 0.85, -0.15];
  const longue: Part[] = [
    incl([0.4, 0.92, -0.3], 32, 0.12, 0, { shape: "box", size: [0.28, 0.3, 0.74], color: "rust", mirror: true }),
    incl([0.4, 0.92, -0.3], 32, 0.12, 0.16, { shape: "box", size: [0.22, 0.03, 0.56], color: "faction", mirror: true }),
    incl([0.4, 0.92, -0.3], 32, 1.1, 0, { shape: "box", size: [0.3, 0.12, 0.14], color: "dark", mirror: true }),
    // grand viseur : caisson, pare-soleil d'équipe, objectif
    { shape: "box", size: [0.36, 0.3, 0.44], pos: [0, 1.2, 0.26], color: "dark" },
    { shape: "box", size: [0.46, 0.04, 0.56], pos: [0, 1.37, 0.32], color: "faction" },
    { shape: "cylinder", sides: 10, radius: 0.14, height: 0.05, pos: [0, 1.2, 0.5], rot: [90, 0, 0], color: "glow" },
  ];
  for (const x of [0.33, 0.47]) {
    longue.push(incl([x, 0.94, -0.3], 32, 1.3, 0, { shape: "cylinder", sides: 6, radius: 0.045, height: 2.1, rot: [90, 0, 0], color: "steel", mirror: true }));
    longue.push(incl([x, 0.94, -0.3], 32, 2.3, 0, { shape: "cylinder", sides: 6, radius: 0.075, height: 0.24, rot: [90, 0, 0], color: "dark", mirror: true }));
  }
  const mixte: Part[] = [
    incl([0.42, 0.92, -0.3], 60, 0.1, 0, { shape: "box", size: [0.26, 0.34, 0.56], color: "rust", mirror: true }),
    incl([0.42, 0.92, -0.3], 60, 0.1, 0.18, { shape: "box", size: [0.2, 0.03, 0.4], color: "faction", mirror: true }),
    incl([0.42, 0.94, -0.3], 60, 0.85, 0, { shape: "cylinder", sides: 8, radius: 0.065, height: 1.3, rot: [90, 0, 0], color: "steel", mirror: true }),
    incl([0.42, 0.94, -0.3], 60, 1.5, 0, { shape: "cylinder", sides: 8, radius: 0.1, height: 0.2, rot: [90, 0, 0], color: "dark", mirror: true }),
    // canon de face
    { shape: "box", size: [0.4, 0.28, 0.32], pos: [0, 0.96, 0.22], color: "steel" },
    { shape: "lathe", sides: 8, pos: [0, 0.96, 0.36], rot: [90, 0, 0], color: "steel", profile: fut(0.1, 1.4) },
    { shape: "box", size: [0.4, 0.16, 0.16], pos: [0, 0.96, 1.66], color: "dark" },
  ];
  const missiles: Part[] = [
    { shape: "box", size: [1.5, 0.12, 0.24], pos: [0, 1.06, -0.2], color: "steel" },
    { shape: "box", size: [0.5, 0.13, 0.25], pos: [0, 1.07, -0.2], color: "faction" },
    { shape: "box", size: [0.2, 0.3, 0.2], pos: [0.53, 1.22, -0.16], color: "steel", mirror: true },
  ];
  for (const x of [0.38, 0.68]) {
    missiles.push(
      incl([x, 1.36, -0.3], 38, 0.38, -0.14, { shape: "box", size: [0.12, 0.08, 1.0], color: "dark", mirror: true }),
      incl([x, 1.36, -0.3], 38, 0.44, 0, { shape: "cylinder", sides: 8, radius: 0.105, height: 1.1, rot: [90, 0, 0], color: "light", mirror: true }),
      incl([x, 1.36, -0.3], 38, 1.13, 0, { shape: "cone", sides: 8, radius: 0.105, height: 0.3, rot: [90, 0, 0], color: "red", mirror: true }),
      incl([x, 1.36, -0.3], 38, 0.06, 0, { shape: "box", size: [0.28, 0.03, 0.24], color: "red", mirror: true }),
      incl([x, 1.36, -0.3], 38, 0.06, 0.07, { shape: "box", size: [0.03, 0.16, 0.24], color: "red", mirror: true, fine: true }),
    );
  }
  const blindage: Part[] = [
    ...jupes(0.88, 0.39, 0.42, [-0.68, 0, 0.68], 0.68),
    { shape: "box", size: [1.74, 0.09, 0.56], pos: [0, 0.38, 1.1], rot: [40, 0, 0], color: "rust" },
    { shape: "box", size: [0.36, 0.11, 0.56], pos: [0, 0.38, 1.1], rot: [40, 0, 0], color: "faction" },
    { shape: "box", size: [0.4, 0.13, 0.3], pos: [0.55, 0.4, 1.11], rot: [40, 0, 0], color: "dark", mirror: true },
    // cabine caparaçonnée
    { shape: "box", size: [1.04, 0.32, 0.07], pos: [0, 0.63, 0.88], rot: [-10, 0, 0], color: "metal" },
    { shape: "box", size: [0.62, 0.06, 0.08], pos: [0, 0.7, 0.87], rot: [-10, 0, 0], color: "black" },
    { shape: "box", size: [0.08, 0.3, 0.5], pos: [0.52, 0.64, 0.6], rot: [0, 0, 8], color: "rust", mirror: true },
  ];
  return [
    ...vise("si:harrow_long#tourelle", axe, longue),
    ...vise("si:harrow_mixed#tourelle", axe, mixte),
    ...vise("si:harrow_missile#tourelle", axe, missiles),
    ...groupe("si:harrow_plate#fixe_plaques", blindage),
    ...groupe("si:harrow_engine#fixe_moteur", moteur(0.58, -0.87, 0.62, 0.36)),
    ...antenne("si:harrow_radar#radar_tete", [0, 1.0, -0.15], 0.8, 1.2),
    ...groupe("si:harrow_shield#fixe_bulle", emetteur([0, 1.0, -0.15], 1.0, 1.0)),
  ];
}

// ——— Canon tracté (towed_gun) : pièce en (0, -0,35), tracteur de z = 0,25 à 1,25 ———

export function equipementCanon(): Part[] {
  const axe: Vec3 = [0, 0.55, -0.35];
  const long: Part[] = [
    incl([0, 0.64, -0.5], 14, -0.12, 0, { shape: "box", size: [0.32, 0.32, 0.4], color: "steel" }),
    incl([0, 0.64, -0.5], 14, 0, 0, { shape: "lathe", sides: 8, rot: [90, 0, 0], color: "steel", profile: fut(0.085, 3.1) }),
    incl([0, 0.64, -0.5], 14, 0.6, 0.15, { shape: "cylinder", sides: 6, radius: 0.055, height: 1.0, rot: [90, 0, 0], color: "dark" }),
    incl([0, 0.64, -0.5], 14, 1.25, 0, { shape: "cylinder", sides: 8, radius: 0.125, height: 0.16, rot: [90, 0, 0], color: "faction" }),
    incl([0, 0.64, -0.5], 14, 2.84, 0, { shape: "box", size: [0.42, 0.18, 0.12], color: "dark" }),
    incl([0, 0.64, -0.5], 14, 3.06, 0, { shape: "box", size: [0.42, 0.18, 0.12], color: "dark" }),
  ];
  const mortier: Part[] = [
    { shape: "box", size: [0.92, 0.16, 0.34], pos: [0, 0.64, -0.5], color: "rust" },
    incl([0, 0.66, -0.55], 50, 0.64, 0.02, { shape: "box", size: [0.96, 0.34, 0.14], color: "faction" }),
  ];
  for (const x of [-0.32, 0, 0.32]) {
    mortier.push(
      incl([x, 0.66, -0.55], 50, 0.46, 0, { shape: "cylinder", sides: 8, radius: 0.145, height: 1.14, rot: [90, 0, 0], color: "steel" }),
      incl([x, 0.66, -0.55], 50, 1.04, 0, { shape: "cylinder", sides: 8, radius: 0.175, height: 0.14, rot: [90, 0, 0], color: "dark" }),
      incl([x, 0.66, -0.55], 50, 1.1, 0, { shape: "cylinder", sides: 8, radius: 0.11, height: 0.05, rot: [90, 0, 0], color: "black" }),
    );
  }
  // chargeur à barillet derrière la culasse, fût court à manchon
  const chargeur: Part[] = [
    incl([0, 0.7, -0.64], 14, 0, 0, { shape: "cylinder", sides: 12, radius: 0.31, height: 0.5, rot: [90, 0, 0], color: "metal" }),
    incl([0, 0.7, -0.64], 14, 0.08, 0, { shape: "cylinder", sides: 12, radius: 0.325, height: 0.1, rot: [90, 0, 0], color: "faction" }),
    incl([0, 0.68, -0.4], 14, 0.95, 0, { shape: "cylinder", sides: 8, radius: 0.08, height: 1.7, rot: [90, 0, 0], color: "steel" }),
    incl([0, 0.68, -0.4], 14, 1.76, 0, { shape: "cylinder", sides: 8, radius: 0.12, height: 0.2, rot: [90, 0, 0], color: "dark" }),
    incl([0, 0.68, -0.4], 14, 0.66, 0, { shape: "cylinder", sides: 8, radius: 0.12, height: 0.5, rot: [90, 0, 0], color: "dark" }),
  ];
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) * Math.PI) / 3;
    chargeur.push(incl([q(Math.cos(a) * 0.2), 0.7, -0.64], 14, -0.06, q(Math.sin(a) * 0.2), { shape: "cylinder", sides: 6, radius: 0.085, height: 0.54, rot: [90, 0, 0], color: "copper" }));
  }
  const caisses: Part[] = [
    { shape: "box", size: [0.3, 0.26, 0.6], pos: [0.72, 0.27, -0.34], color: "wood", mirror: true },
    { shape: "box", size: [0.31, 0.27, 0.06], pos: [0.72, 0.27, -0.34], color: "black", mirror: true, fine: true },
    ...[0.64, 0.8].map((x): Part => ({ shape: "cylinder", sides: 6, radius: 0.07, height: 0.46, pos: [x, 0.44, -0.4], rot: [90, 0, 0], color: "copper", mirror: true })),
    ...[0.64, 0.8].map((x): Part => ({ shape: "cone", sides: 6, radius: 0.07, height: 0.16, pos: [x, 0.44, -0.09], rot: [90, 0, 0], color: "red", mirror: true })),
  ];
  const bouclier: Part[] = [
    { shape: "box", size: [0.3, 0.46, 0.07], pos: [0.28, 0.74, 0.02], rot: [-6, 0, 0], color: "metal", mirror: true },
    { shape: "box", size: [0.27, 0.14, 0.07], pos: [0, 0.51, 0.03], color: "metal" },
    { shape: "box", size: [0.5, 0.46, 0.07], pos: [0.62, 0.75, -0.14], rot: [0, 37, 0], color: "rust", mirror: true },
    { shape: "box", size: [0.3, 0.12, 0.09], pos: [0.285, 0.9, 0.0], rot: [-6, 0, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.51, 0.12, 0.09], pos: [0.62, 0.9, -0.14], rot: [0, 37, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.3, 0.08, 0.09], pos: [0.285, 0.56, 0.035], rot: [-6, 0, 0], color: "hazard", mirror: true, fine: true },
  ];
  // tracteur lourd : larges chenilles extérieures (leurs crampons roulent), capot long, moteur en V, cheminées
  const roues = chenille(0.78, 1.7, 0.54, 0.34, 0, 0.82, 0.3, true)
    .filter((p) => p.shape !== "cylinder") // sans les galets ni les barbotins
    .map((p): Part => ({ ...p, bevel: undefined, pivot: p.pivot ? `si:gun_engine#${p.pivot}` : "si:gun_engine#fixe_tracteur" }));
  const tracteur: Part[] = [
    { shape: "box", size: [0.4, 0.06, 1.36], pos: [0.76, 0.6, 0.82], color: "rust", mirror: true },
    { shape: "box", size: [0.04, 0.2, 1.2], pos: [0.97, 0.46, 0.82], color: "faction", mirror: true },
    { shape: "box", size: [0.96, 0.52, 0.62], pos: [0, 0.56, 1.5], color: "dark" },
    { shape: "box", size: [0.7, 0.32, 0.04], pos: [0, 0.56, 1.81], color: "steel" },
    { shape: "box", size: [0.12, 0.08, 0.04], pos: [0.38, 0.7, 1.82], color: "amber", mirror: true },
    { shape: "box", size: [0.3, 0.04, 0.6], pos: [0, 0.83, 1.5], color: "faction" },
    ...[1.36, 1.64].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.11, height: 0.28, pos: [0.27, 0.86, z], rot: [0, 0, -38], color: "copper", mirror: true })),
    { shape: "cylinder", sides: 8, radius: 0.08, radiusTop: 0.12, height: 0.8, pos: [0.46, 1.1, 1.44], color: "steel", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.1, height: 0.03, pos: [0.46, 1.51, 1.44], color: "amber", mirror: true },
  ];
  const c: Pt[] = [[0.36, 0.84], [0.84, 0.76], [1.14, 0.54], [1.2, 0.2]];
  return [
    ...vise("si:gun_long#tourelle", axe, long),
    ...vise("si:gun_cluster#tourelle", axe, mortier),
    ...vise("si:gun_fast#tourelle", axe, chargeur),
    ...groupe("si:gun_fast#fixe_caisses", caisses),
    ...vise("si:gun_plate#tourelle_bouclier", axe, bouclier),
    ...groupe("si:gun_engine#fixe_tracteur", tracteur),
    ...roues,
    // filet : deux ailes de part et d'autre du tracteur, le fût passe entre elles
    ...groupe("si:gun_net#fixe_filet", [
      ...filet(c, 0.36, 1.16, [
        tache(c, 0, 0.5, 1, 0.5, 0.28, 0.24, "dry"),
        tache(c, 0, 0.6, -1, 0.62, 0.28, 0.2, "leaf"),
        tache(c, 1, 0.5, 1, 0.85, 0.3, 0.3, "dry"),
        tache(c, 1, 0.5, -1, 0.42, 0.3, 0.2, "dry"),
        tache(c, 2, 0.4, 1, 0.45, 0.28, 0.24, "leaf"),
        tache(c, 2, 0.4, -1, 0.95, 0.28, 0.24, "leaf"),
      ]),
      { shape: "box", size: [0.06, 0.06, 0.8], pos: [0.37, 0.84, 0.76], color: "wood", mirror: true },
    ]),
    // observateur : mât à nacelle sur le flanc droit du tracteur, antenne qui tourne au sommet, fouet à gauche
    ...groupe("si:gun_spotter#fixe_mat", [
      { shape: "box", size: [0.22, 0.3, 0.34], pos: [0.44, 0.5, 0.56], color: "rust" },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 1.3, pos: [0.44, 1.2, 0.56], color: "steel" },
      { shape: "box", size: [0.44, 0.3, 0.44], pos: [0.44, 1.8, 0.56], color: "dark" },
      { shape: "box", size: [0.46, 0.1, 0.46], pos: [0.44, 1.86, 0.56], color: "glass" },
      { shape: "box", size: [0.54, 0.05, 0.54], pos: [0.44, 1.98, 0.56], color: "faction" },
      { shape: "tube", radius: 0.02, sides: 4, path: [[-0.54, 0.36, 0.6], [-0.54, 1.5, 0.56], [-0.54, 2.1, 0.4]], bend: 0.2, color: "steel", fine: true },
      { shape: "box", size: [0.02, 0.2, 0.34], pos: [-0.54, 1.5, 0.4], color: "faction" },
    ]),
    ...antenne("si:gun_spotter#radar_tete", [0.44, 2.0, 0.56], 0.16, 1.1),
  ];
}

// ——— Bélier (ram) : pas de tourelle ; proue de z = 0,9 à 1,62, dos à y = 1,06 ———

/** Lame de scie (contour denté) de rayon r. */
function lame(r: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const b = ((i + 0.72) / n) * 2 * Math.PI;
    out.push([q(Math.cos(a) * r), q(Math.sin(a) * r)], [q(Math.cos(b) * r * 0.82), q(Math.sin(b) * r * 0.82)]);
  }
  return out;
}

export function equipementBelier(): Part[] {
  const scie = (sx: number): Part[] => [
    { shape: "cylinder", sides: 10, radius: 0.16, height: 0.14, pos: [q(sx * 0.56), 0.81, 1.66], color: "dark" },
    { shape: "extrude", profile: lame(0.54, 10), depth: 0.05, pos: [q(sx * 0.56), 0.81, 1.66], rot: [90, 0, 0], color: "steel" },
    { shape: "box", size: [0.8, 0.06, 0.1], pos: [q(sx * 0.56), 0.815, 1.66], color: "hazard" },
    { shape: "box", size: [0.1, 0.062, 0.8], pos: [q(sx * 0.56), 0.815, 1.66], color: "red" },
  ];
  const bras: Part[] = [
    { shape: "box", size: [0.18, 0.12, 1.1], pos: [0.56, 0.95, 1.18], color: "rust", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.15, height: 0.24, pos: [0.56, 1.0, 1.66], color: "dark", mirror: true },
    { shape: "box", size: [0.19, 0.04, 0.5], pos: [0.56, 1.02, 1.1], color: "faction", mirror: true },
  ];
  const flammes: Part[] = [
    { shape: "cylinder", sides: 8, radius: 0.18, height: 0.96, pos: [0.75, 0.78, -0.35], rot: [90, 0, 0], color: "red", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 1.12, pos: [0.75, 0.78, -0.35], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.19, height: 0.09, pos: [0.75, 0.78, -0.35], rot: [90, 0, 0], color: "black", mirror: true, fine: true },
    { shape: "tube", radius: 0.045, sides: 4, path: [[0.75, 0.78, 0.2], [0.79, 0.82, 0.7], [0.79, 0.86, 0.95]], bend: 0.1, color: "copper", mirror: true, fine: true },
    { shape: "box", size: [0.24, 0.12, 0.26], pos: [0.79, 0.78, 1.04], color: "rust", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.11, height: 0.8, pos: [0.79, 0.87, 1.3], rot: [90, 0, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.12, radiusTop: 0.24, height: 0.3, pos: [0.79, 0.87, 1.84], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.18, height: 0.03, pos: [0.79, 0.87, 1.99], rot: [90, 0, 0], color: "amber", mirror: true },
  ];
  const blindage: Part[] = [
    // proue : deux épaisses plaques en chevron, éperon central, plaque sur la rampe
    { shape: "box", size: [1.06, 0.6, 0.16], pos: [0.66, 0.42, 1.42], rot: [0, 36, 0], color: "metal", mirror: true },
    { shape: "box", size: [1.0, 0.1, 0.18], pos: [0.66, 0.6, 1.42], rot: [0, 36, 0], color: "hazard", mirror: true },
    { shape: "bevel", size: [0.46, 0.62, 0.3], pos: [0, 0.42, 1.72], bevel: 0.06, color: "steel" },
    { shape: "box", size: [0.94, 0.1, 0.7], pos: [0, 0.93, 0.82], rot: [36, 0, 0], color: "rust" },
    { shape: "box", size: [0.3, 0.11, 0.7], pos: [0, 0.935, 0.82], rot: [36, 0, 0], color: "faction" },
    // flancs : hautes plaques évasées au-dessus des chenilles
    ...jupes(1.04, 0.52, 0.66, [-0.86, -0.24, 0.38], 0.62, 7),
  ];
  const crochet: Part[] = [
    { shape: "cylinder", sides: 10, radius: 0.28, height: 0.18, pos: [0, 1.14, -0.6], color: "dark" },
    { shape: "box", size: [0.22, 0.9, 0.22], pos: [0, 1.6, -0.6], color: "rust" },
    { shape: "box", size: [2.3, 0.16, 0.16], pos: [0.55, 2.1, -0.4], rot: [0, -18, 4], color: "hazard" },
    { shape: "box", size: [0.4, 0.3, 0.36], pos: [-0.5, 2.0, -0.74], color: "dark" },
    { shape: "box", size: [0.24, 0.17, 0.2], pos: [0, 2.09, -0.58], color: "faction" },
    { shape: "cylinder", sides: 5, radius: 0.035, height: 0.84, pos: [1.52, 1.74, -0.08], color: "black" },
    { shape: "cylinder", sides: 8, radius: 0.14, height: 0.14, pos: [1.52, 1.3, -0.08], color: "steel" },
    ...[0, 90, 180, 270].map((a): Part => {
      const r = (a * Math.PI) / 180;
      return { shape: "box", size: [0.36, 0.09, 0.12], pos: [q(1.52 + Math.cos(r) * 0.26), 1.2, q(-0.08 - Math.sin(r) * 0.26)], rot: [0, a, -38], color: "steel" };
    }),
    { shape: "cylinder", sides: 5, radius: 0.035, height: 0.5, pos: [0.9, 1.84, -0.28], color: "black" },
    { shape: "box", size: [0.16, 0.2, 0.16], pos: [0.9, 1.56, -0.28], color: "steel" },
  ];
  const reparation: Part[] = [
    { shape: "cylinder", sides: 10, radius: 0.26, height: 0.16, pos: [0, 1.13, -0.5], color: "dark" },
    ...coffre([0, 1.18, -0.92], [0.64, 0.24, 0.26], "red"),
    { shape: "box", size: [0.2, 0.94, 0.2], pos: [-0.2, 1.6, -0.5], rot: [0, 0, 25], color: "hazard" },
    { shape: "cylinder", sides: 8, radius: 0.17, height: 0.26, pos: [-0.4, 2.02, -0.5], rot: [90, 0, 0], color: "dark" },
    { shape: "box", size: [0.18, 0.18, 1.3], pos: [-0.4, 2.0, 0.1], rot: [10, 0, 0], color: "faction" },
    { shape: "cylinder", sides: 8, radius: 0.14, height: 0.24, pos: [-0.4, 1.88, 0.74], rot: [0, 0, 90], color: "dark" },
    { shape: "box", size: [0.14, 0.5, 0.14], pos: [-0.4, 1.66, 0.86], rot: [-24, 0, 0], color: "hazard" },
    { shape: "box", size: [0.36, 0.1, 0.16], pos: [-0.4, 1.44, 0.96], color: "steel" },
    { shape: "sphere", radius: 0.12, pos: [-0.4, 1.32, 0.98], color: "glow" },
  ];
  return [
    ...groupe("si:ram_saw#rotor_d", scie(1)),
    ...groupe("si:ram_saw#rotor_g", scie(-1)),
    ...groupe("si:ram_saw#fixe_bras", bras),
    ...groupe("si:ram_flame#fixe_flammes", flammes),
    ...groupe("si:ram_plate#fixe_plaques", blindage),
    ...groupe("si:ram_engine#fixe_moteurs", moteur(0.62, -1.16, 0.7, 0.5)),
    ...groupe("si:ram_hook#fixe_grue", crochet),
    ...groupe("si:ram_repair#fixe_reparation", reparation),
    ...groupe("si:ram_shield#fixe_bulle", emetteur([0, 1.06, -0.5], 1.0, 1.35)),
  ];
}
