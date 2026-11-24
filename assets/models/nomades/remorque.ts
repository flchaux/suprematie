// Remorque du convoi de l'Arche (unité « ark_car », voir sim/src/convoi.rs) : un châssis à chenilles et à timon, et
// par-dessus, ce que porte l'amélioration de pont ou de soutien (un pivot « si:… » par amélioration).
// Les pièces sans condition vont de z = -1,20 (crochet) à z = 1,66 (bout du timon), sur 2 de large : à cette taille, la
// remorque est à l'échelle de l'Arche. Plancher à y = 0,66, de z = -1,14 à z = 0,98.
import type { Part, Vec3 } from "../types.ts";
import { q, chenille, coffre, bache } from "./commun.ts";
import type { C } from "./commun.ts";
import { groupe } from "./arche-commun.ts";

/** Châssis : chenilles larges, caisse, plancher, flancs d'équipe, ridelles, timon et crochet. */
function chassis(): Part[] {
  return [
    ...chenille(0.765, 2.16, 0.52, 0.4, 0, -0.08, 0.3, true),
    { shape: "bevel", size: [1.1, 0.34, 2.1], pos: [0, 0.4, -0.08], bevel: 0.05, color: "dark" },
    { shape: "box", size: [1.96, 0.06, 2.12], pos: [0, 0.63, -0.08], color: "metal" },
    ...[-0.5, 0.5].map((x): Part => ({ shape: "box", size: [0.02, 0.012, 2.0], pos: [x, 0.664, -0.08], color: "dark", fine: true })),
    { shape: "box", size: [0.03, 0.2, 1.96], pos: [0.985, 0.5, -0.08], color: "faction", mirror: true },
    { shape: "box", size: [0.07, 0.12, 2.1], pos: [0.955, 0.7, -0.08], color: "rust", mirror: true },
    ...[0.94, -1.1].map((z): Part => ({ shape: "box", size: [0.1, 0.2, 0.1], pos: [0.94, 0.74, z], color: "dark", mirror: true, fine: true })),
    { shape: "box", size: [1.8, 0.1, 0.06], pos: [0, 0.7, 0.96], color: "hazard" },
    // timon en fourche et son anneau
    { shape: "tube", radius: 0.05, sides: 5, path: [[0.56, 0.42, 0.92], [0.06, 0.42, 1.42]], color: "rust", mirror: true },
    { shape: "box", size: [0.18, 0.14, 0.34], pos: [0, 0.42, 1.38], color: "steel" },
    { shape: "box", size: [0.24, 0.1, 0.16], pos: [0, 0.42, 1.58], color: "dark" },
    // crochet d'attelage, feux
    { shape: "box", size: [0.4, 0.16, 0.06], pos: [0, 0.42, -1.14], color: "rust" },
    { shape: "box", size: [0.14, 0.12, 0.1], pos: [0, 0.4, -1.15], color: "steel" },
    { shape: "box", size: [0.14, 0.07, 0.03], pos: [0.76, 0.56, -1.145], color: "red", mirror: true },
  ];
}

/** Berceau d'une tourelle : couronne, deux joues, tourelle repliée à fûts jumelés ; `k` : échelle. */
function berceau(x: number, z: number, k: number): Part[] {
  const v = (n: number) => q(n * k);
  return [
    { shape: "box", size: [v(0.92), 0.08, v(0.92)], pos: [x, 0.7, z], color: "hazard" },
    { shape: "cylinder", sides: 12, radius: v(0.42), height: 0.12, pos: [x, 0.78, z], color: "dark" },
    { shape: "extrude", profile: [[-0.42, 0], [0.42, 0], [0.3, 0.34], [0.12, 0.2], [-0.12, 0.2], [-0.3, 0.34]].map(([a, b]): [number, number] => [v(a), v(b)]), depth: v(0.1), pos: [q(x + v(0.42)), 0.74, z], rot: [0, -90, 0], color: "rust" },
    { shape: "extrude", profile: [[-0.42, 0], [0.42, 0], [0.3, 0.34], [0.12, 0.2], [-0.12, 0.2], [-0.3, 0.34]].map(([a, b]): [number, number] => [v(a), v(b)]), depth: v(0.1), pos: [q(x - v(0.42)), 0.74, z], rot: [0, -90, 0], color: "rust" },
    { shape: "bevel", size: [v(0.58), v(0.4), v(0.62)], pos: [x, q(0.82 + v(0.24)), z], bevel: 0.05, color: "metal" },
    { shape: "box", size: [v(0.42), 0.03, v(0.44)], pos: [x, q(0.84 + v(0.45)), q(z - v(0.04))], color: "faction" },
    { shape: "box", size: [v(0.66), v(0.34), v(0.06)], pos: [x, q(0.84 + v(0.26)), q(z + v(0.33))], rot: [-12, 0, 0], color: "dry" },
    ...[-0.12, 0.12].map((d): Part => ({ shape: "cylinder", sides: 6, radius: v(0.05), height: v(0.7), pos: [q(x + v(d)), q(0.84 + v(0.26)), q(z + v(0.62))], rot: [90, 0, 0], color: "steel" })),
  ];
}

/** Pont : berceaux de tourelles. */
function tourelles(): Part[] {
  return [
    ...groupe("si:ark_turrets1#fixe_berceau", [
      ...berceau(0, 0.1, 1.3),
      ...coffre([0.62, 0.8, -0.84], [0.5, 0.28, 0.42], "wood"),
      ...coffre([-0.62, 0.8, -0.84], [0.5, 0.28, 0.42], "rust"),
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.6, pos: [0, 0.82, -0.86], rot: [90, 0, 0], color: "dry" },
    ]),
    ...groupe("si:ark_turrets2+ark_turrets3#fixe_berceaux", [
      ...berceau(0.5, 0.42, 0.86),
      ...berceau(-0.5, 0.04, 0.86),
      ...berceau(0.5, -0.68, 0.86),
      ...coffre([-0.5, 0.8, -0.78], [0.66, 0.28, 0.46], "wood"),
      ...coffre([-0.5, 0.77, 0.76], [0.6, 0.22, 0.3], "rust"),
    ]),
  ];
}

/** Pont : atelier embarqué. Portique à palan sur quatre jambes, caisse en chantier, établi sous auvent. */
function atelier(): Part[] {
  return groupe("si:ark_workshop#fixe_atelier", [
    ...[0.72, -0.5].flatMap((z): Part[] => [
      { shape: "box", size: [0.13, 1.3, 0.13], pos: [0.88, 1.3, z], color: "hazard", mirror: true },
      { shape: "box", size: [1.96, 0.16, 0.16], pos: [0, 1.98, z], color: "rust" },
    ]),
    { shape: "box", size: [0.14, 0.12, 1.5], pos: [0.72, 2.1, 0.11], color: "faction", mirror: true },
    // pont roulant, palan et crochet
    { shape: "box", size: [1.7, 0.12, 0.26], pos: [0, 2.2, 0.2], color: "hazard" },
    { shape: "bevel", size: [0.4, 0.26, 0.38], pos: [0.12, 2.3, 0.2], bevel: 0.05, color: "dark" },
    { shape: "cylinder", sides: 5, radius: 0.03, height: 0.76, pos: [0.12, 1.74, 0.2], color: "steel" },
    { shape: "box", size: [0.2, 0.16, 0.2], pos: [0.12, 1.36, 0.2], color: "hazard" },
    // caisse de char en chantier sur ses tins, train de chenille posé
    ...chenille(0.3, 1.0, 0.24, 0.18, 0.66, 0.18, 0, false),
    { shape: "bevel", size: [0.56, 0.26, 0.9], pos: [0, 0.98, 0.18], bevel: 0.05, color: "steel" },
    { shape: "cylinder", sides: 10, radius: 0.24, height: 0.14, pos: [0, 1.16, 0.18], color: "copper" },
    { shape: "box", size: [0.06, 0.05, 0.04], pos: [0.16, 1.06, 0.65], color: "glow" },
    // établi sous auvent, armoire à outils, bouteilles
    ...bache(0, 1.1, -0.84, 0.9, 0.36, 0.56, "dry", 1, false),
    { shape: "box", size: [1.7, 0.44, 0.46], pos: [0, 0.88, -0.84], color: "wood" },
    { shape: "box", size: [0.5, 0.4, 0.2], pos: [0.62, 0.86, 0.84], color: "red" },
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.6, pos: [-0.72, 0.96, 0.84], color: "copper" },
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.6, pos: [-0.48, 0.96, 0.84], color: "rust" },
    { shape: "box", size: [0.3, 0.08, 0.3], pos: [-0.72, 0.7, 0.3], color: "dark", fine: true },
  ]);
}

/** Conteneur nervuré et sanglé, de longueur `l` (axe z). */
function conteneur(pos: Vec3, w: number, h: number, l: number, color: C): Part[] {
  const [x, y, z] = pos;
  const p: Part[] = [{ shape: "bevel", size: [w, h, l], pos, bevel: 0.03, color }];
  for (const d of [-0.36, -0.12, 0.12, 0.36]) p.push({ shape: "box", size: [q(w + 0.03), q(h - 0.08), 0.05], pos: [x, y, q(z + d * l)], color, fine: true });
  for (const d of [-0.24, 0.24]) p.push({ shape: "box", size: [q(w + 0.04), q(h + 0.04), 0.07], pos: [x, y, q(z + d * l)], color: "black" });
  return p;
}

/** Pont : soutes. Deux étages de conteneurs de couleur, cornières, ballots sous filet. */
function soutes(): Part[] {
  return groupe("si:ark_holds#fixe_soutes", [
    ...conteneur([0.5, 0.94, 0.43], 0.92, 0.56, 1.02, "rust"),
    ...conteneur([-0.5, 0.94, 0.43], 0.92, 0.56, 1.02, "dry"),
    ...conteneur([0.5, 0.94, -0.62], 0.92, 0.56, 1.02, "steel"),
    ...conteneur([-0.5, 0.94, -0.62], 0.92, 0.56, 1.02, "rust"),
    ...conteneur([-0.48, 1.48, 0.36], 0.88, 0.5, 1.0, "faction"),
    ...conteneur([0.46, 1.48, -0.5], 0.88, 0.5, 1.12, "hazard"),
    ...coffre([0.5, 1.36, 0.5], [0.66, 0.26, 0.6], "wood"),
    { shape: "cylinder", sides: 8, radius: 0.2, height: 0.84, pos: [-0.5, 1.4, -0.46], rot: [0, 0, 90], color: "dry" },
    { shape: "cylinder", sides: 8, radius: 0.2, height: 0.84, pos: [-0.5, 1.4, -0.88], rot: [0, 0, 90], color: "wood" },
    { shape: "box", size: [0.07, 0.6, 0.07], pos: [0.97, 0.96, 0.96], color: "dark", mirror: true },
    { shape: "box", size: [0.07, 0.6, 0.07], pos: [0.97, 0.96, -1.12], color: "dark", mirror: true },
  ]);
}

/** Soutien : bras réparateurs. Grande grue articulée sur plateau, second bras à souder, dévidoir et bouteilles. */
function reparation(): Part[] {
  return groupe("si:ark_repair#fixe_grue", [
    { shape: "cylinder", sides: 12, radius: 0.52, height: 0.16, pos: [0, 0.74, -0.3], color: "dark" },
    { shape: "cylinder", sides: 12, radius: 0.4, height: 0.2, pos: [0, 0.9, -0.3], color: "steel" },
    { shape: "bevel", size: [0.6, 0.5, 0.7], pos: [0, 1.2, -0.36], bevel: 0.07, color: "hazard" },
    { shape: "box", size: [0.62, 0.06, 0.2], pos: [0, 1.46, -0.5], color: "faction" },
    // flèche : montant, coude, avant-bras, tête à souder
    { shape: "box", size: [0.2, 1.1, 0.24], pos: [0, 1.78, -0.14], rot: [24, 0, 0], color: "hazard" },
    { shape: "cylinder", sides: 10, radius: 0.2, height: 0.34, pos: [0, 2.28, 0.1], rot: [0, 0, 90], color: "dark" },
    { shape: "box", size: [0.2, 0.2, 0.9], pos: [0, 2.12, 0.5], rot: [20, 0, 0], color: "faction" },
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.7, pos: [0, 1.94, 0.28], rot: [60, 0, 0], color: "steel" },
    { shape: "bevel", size: [0.36, 0.3, 0.28], pos: [0, 1.95, 0.92], bevel: 0.05, color: "dark" },
    { shape: "cone", sides: 6, radius: 0.11, height: 0.32, pos: [0, 1.68, 0.94], rot: [180, 0, 0], color: "copper" },
    { shape: "sphere", radius: 0.12, pos: [0, 1.52, 0.94], color: "glow" },
    // second bras, replié sur le côté
    { shape: "cylinder", sides: 8, radius: 0.18, height: 0.3, pos: [0.66, 0.8, 0.58], color: "dark" },
    { shape: "box", size: [0.13, 0.8, 0.13], pos: [0.78, 1.26, 0.5], rot: [-12, 0, -16], color: "steel" },
    { shape: "box", size: [0.5, 0.11, 0.11], pos: [1.08, 1.6, 0.42], rot: [0, 0, -14], color: "hazard" },
    { shape: "sphere", radius: 0.08, pos: [1.32, 1.46, 0.42], color: "glow" },
    // bouteilles, dévidoir, caisse de pièces
    ...[-0.8, -0.58].map((x, k): Part => ({ shape: "cylinder", sides: 8, radius: 0.1, height: 0.6, pos: [x, 0.96, 0.6], color: k ? "red" : "copper" })),
    { shape: "cylinder", sides: 10, radius: 0.28, height: 0.3, pos: [-0.66, 0.96, 0.1], rot: [0, 0, 90], color: "copper" },
    { shape: "torus", radius: 0.3, tube: 0.05, sides: 12, pos: [-0.5, 0.96, 0.1], rot: [0, 0, 90], color: "black", fine: true },
    { shape: "torus", radius: 0.3, tube: 0.05, sides: 12, pos: [-0.82, 0.96, 0.1], rot: [0, 0, 90], color: "black" },
    ...coffre([0.6, 0.8, -0.86], [0.56, 0.28, 0.46], "wood"),
    ...coffre([-0.6, 0.8, -0.86], [0.56, 0.28, 0.46], "red"),
  ]);
}

/** Soutien : radar de crête. Cabine bâchée, mât haubané, grande antenne qui tourne. */
function radar(): Part[] {
  const antenne: [number, number][] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) antenne.push([q(-1.05 + (2.1 * i) / n), q(0.3 * Math.pow((2 * i) / n - 1, 2))]);
  for (let i = n; i >= 0; i--) antenne.push([q(-1.05 + (2.1 * i) / n), q(0.3 * Math.pow((2 * i) / n - 1, 2) - 0.08)]);
  return [
    ...groupe("si:ark_radar#fixe_mat", [
      { shape: "bevel", size: [1.3, 0.6, 0.74], pos: [0, 0.96, -0.66], bevel: 0.06, color: "metal" },
      ...bache(0, 1.24, -0.66, 0.68, 0.26, 0.78, "dry", 1, false),
      { shape: "box", size: [0.5, 0.14, 0.03], pos: [0.28, 1.02, -0.28], color: "glow" },
      { shape: "box", size: [0.24, 0.36, 0.03], pos: [-0.34, 0.9, -0.28], color: "dark" },
      // mât et haubans
      { shape: "cylinder", sides: 10, radius: 0.4, height: 0.16, pos: [0, 0.74, 0.34], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.2, radiusTop: 0.13, height: 1.3, pos: [0, 1.4, 0.34], color: "steel" },
      { shape: "cylinder", sides: 8, radius: 0.24, height: 0.12, pos: [0, 1.5, 0.34], color: "faction" },
      { shape: "tube", radius: 0.035, sides: 4, path: [[0.8, 0.68, 0.84], [0.1, 1.7, 0.4]], color: "rust", mirror: true },
      { shape: "tube", radius: 0.035, sides: 4, path: [[0.8, 0.68, -0.12], [0.1, 1.7, 0.28]], color: "rust", mirror: true },
      ...coffre([0.7, 0.8, 0.36], [0.36, 0.26, 0.4], "wood"),
      { shape: "cylinder", sides: 10, radius: 0.24, height: 0.26, pos: [-0.7, 0.92, 0.36], rot: [0, 0, 90], color: "copper" },
      { shape: "box", size: [0.5, 0.3, 0.06], pos: [0.7, 1.0, -0.66], rot: [0, 90, 0], color: "black", fine: true },
    ]),
    ...groupe("si:ark_radar#radar_tete", [
      { shape: "cylinder", sides: 10, radius: 0.22, height: 0.16, pos: [0, 2.12, 0.34], color: "dark" },
      { shape: "extrude", profile: antenne, depth: 0.62, bevel: 0, pos: [0, 2.52, 0.2], rot: [78, 0, 0], color: "light" },
      ...[-0.7, 0, 0.7].map((x): Part => ({ shape: "box", size: [0.06, 0.6, 0.1], pos: [x, 2.52, q(0.12 + (Math.abs(x) > 0.1 ? 0.13 : 0))], rot: [-12, 0, 0], color: "steel", fine: true })),
      { shape: "box", size: [1.7, 0.09, 0.2], pos: [0, 2.2, 0.28], color: "faction" },
      { shape: "box", size: [0.08, 0.08, 0.7], pos: [0, 2.3, 0.6], rot: [-16, 0, 0], color: "steel" },
      { shape: "box", size: [0.26, 0.18, 0.12], pos: [0, 2.42, 0.96], color: "copper" },
      { shape: "box", size: [0.4, 0.2, 0.3], pos: [0, 2.2, -0.06], color: "hazard" },
    ]),
  ];
}

/** Soutien : brouilleur. Trois mâts à anneaux de cuivre, armoires noires, pointes rouges. */
function brouilleur(): Part[] {
  const p: Part[] = [
    { shape: "bevel", size: [1.1, 0.5, 0.9], pos: [0, 0.9, -0.06], bevel: 0.06, color: "black" },
    { shape: "box", size: [1.12, 0.08, 0.5], pos: [0, 1.06, -0.06], color: "red" },
    { shape: "box", size: [0.8, 0.03, 0.36], pos: [0, 1.16, -0.06], color: "faction" },
  ];
  for (const [x, z, h] of [[0.56, 0.66, 1.5], [-0.56, 0.66, 1.5], [0, -0.84, 1.9]] as const) {
    p.push(
      { shape: "cylinder", sides: 8, radius: 0.26, height: 0.2, pos: [x, 0.76, z], color: "dark" },
      { shape: "cylinder", sides: 6, radius: 0.07, height: h, pos: [x, q(0.8 + h / 2), z], color: "steel" },
      { shape: "torus", radius: 0.42, tube: 0.06, sides: 14, pos: [x, q(0.8 + h * 0.42), z], color: "copper" },
      { shape: "torus", radius: 0.31, tube: 0.055, sides: 12, pos: [x, q(0.8 + h * 0.64), z], color: "copper" },
      { shape: "torus", radius: 0.2, tube: 0.05, sides: 10, pos: [x, q(0.8 + h * 0.84), z], color: "copper" },
      { shape: "box", size: [0.8, 0.04, 0.04], pos: [x, q(0.8 + h * 0.42), z], color: "dark", fine: true },
      { shape: "box", size: [0.04, 0.04, 0.8], pos: [x, q(0.8 + h * 0.42), z], color: "dark", fine: true },
      { shape: "sphere", radius: 0.12, pos: [x, q(0.86 + h), z], color: "red" },
    );
  }
  p.push(
    { shape: "tube", radius: 0.025, sides: 4, path: [[0.56, 2.1, 0.66], [0, 2.02, 0.66], [-0.56, 2.1, 0.66]], bend: 0.4, color: "black", fine: true },
    { shape: "tube", radius: 0.025, sides: 4, path: [[0.56, 2.1, 0.66], [0.2, 2.1, -0.2], [0, 2.4, -0.84]], bend: 0.4, color: "black", mirror: true, fine: true },
    ...coffre([0.66, 0.8, -0.82], [0.4, 0.26, 0.44], "metal"),
    ...coffre([-0.66, 0.8, -0.82], [0.4, 0.26, 0.44], "metal"),
  );
  return groupe("si:ark_jammer#fixe_brouilleur", p);
}

/** Soutien : groupe électrogène. Moteur capoté à grille, deux grosses bobines, échappement, touret de câble. */
function dynamo(): Part[] {
  return groupe("si:ark_dynamo#fixe_dynamo", [
    { shape: "bevel", size: [1.4, 0.74, 0.96], pos: [0, 1.04, 0.42], bevel: 0.08, color: "hazard" },
    { shape: "box", size: [0.9, 0.04, 0.6], pos: [0, 1.42, 0.42], color: "black" },
    ...[-0.18, 0, 0.18].map((d): Part => ({ shape: "box", size: [0.9, 0.05, 0.06], pos: [0, 1.43, q(0.42 + d)], color: "steel" })),
    { shape: "box", size: [1.44, 0.14, 0.16], pos: [0, 1.2, 0.78], color: "faction" },
    { shape: "tube", radius: 0.09, sides: 6, path: [[0.56, 1.3, 0.2], [0.56, 1.9, 0.2], [0.62, 2.04, 0.04]], bend: 0.1, color: "rust", mirror: true },
    // deux bobines d'axe x, flasques sombres, arbre, voyants
    ...[-0.3, -0.86].flatMap((z): Part[] => [
      { shape: "cylinder", sides: 12, radius: 0.4, height: 1.0, pos: [0, 1.06, z], rot: [0, 0, 90], color: "copper" },
      { shape: "cylinder", sides: 12, radius: 0.47, height: 0.1, pos: [0.54, 1.06, z], rot: [0, 0, 90], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 0.1, pos: [0.64, 1.06, z], rot: [0, 0, 90], color: "glow", mirror: true },
      { shape: "cylinder", sides: 12, radius: 0.425, height: 0.12, pos: [0, 1.06, z], rot: [0, 0, 90], color: "glow" },
    ]),
    { shape: "box", size: [1.3, 0.16, 1.1], pos: [0, 0.74, -0.58], color: "dark" },
    { shape: "cylinder", sides: 10, radius: 0.24, height: 0.2, pos: [0.82, 0.9, 0.3], rot: [0, 0, 90], color: "black", mirror: true },
    { shape: "torus", radius: 0.22, tube: 0.05, sides: 10, pos: [0.94, 0.9, 0.3], rot: [0, 0, 90], color: "rust", mirror: true },
    { shape: "box", size: [0.2, 0.12, 0.03], pos: [0.3, 1.02, 0.91], color: "amber", mirror: true, fine: true },
  ]);
}

/** Soutien : grues de pillage. Deux grues à grappin déportées, tas de butin de toutes couleurs sous sangles. */
function pillage(): Part[] {
  const grue = (s: 1 | -1, z: number): Part[] => [
    { shape: "cylinder", sides: 8, radius: 0.26, height: 0.24, pos: [q(s * 0.62), 0.78, z], color: "dark" },
    { shape: "box", size: [0.18, 1.2, 0.18], pos: [q(s * 0.72), 1.42, z], rot: [0, 0, q(-s * 10)], color: "hazard" },
    { shape: "box", size: [1.0, 0.15, 0.17], pos: [q(s * 1.16), 1.98, z], rot: [0, 0, q(-s * 10)], color: "faction" },
    { shape: "box", size: [0.3, 0.24, 0.26], pos: [q(s * 0.62), 2.02, z], color: "rust" },
    { shape: "cylinder", sides: 5, radius: 0.03, height: 0.5, pos: [q(s * 1.52), 1.64, z], color: "steel" },
    { shape: "cylinder", sides: 6, radius: 0.13, height: 0.14, pos: [q(s * 1.52), 1.4, z], color: "dark" },
    ...[0, 120, 240].map((a): Part => ({ shape: "box", size: [0.08, 0.32, 0.12], pos: [q(s * 1.52 + Math.cos((a * Math.PI) / 180) * 0.14), 1.22, q(z + Math.sin((a * Math.PI) / 180) * 0.14)], rot: [0, -a, 18], color: "steel" })),
  ];
  return groupe("si:ark_loot#fixe_grues", [
    ...grue(1, 0.62),
    ...grue(-1, -0.74),
    // tas de butin
    ...coffre([-0.4, 0.84, 0.5], [0.7, 0.36, 0.6], "wood"),
    ...coffre([0.36, 0.88, -0.1], [0.74, 0.44, 0.66], "rust"),
    ...coffre([-0.5, 0.82, -0.14], [0.5, 0.32, 0.5], "steel"),
    ...coffre([0.44, 0.82, -0.8], [0.66, 0.32, 0.5], "red"),
    { shape: "bevel", size: [0.6, 0.32, 0.5], pos: [-0.12, 1.2, 0.24], rot: [0, 24, 6], bevel: 0.04, color: "dry" },
    { shape: "bevel", size: [0.44, 0.24, 0.4], pos: [0.34, 1.22, -0.2], rot: [0, -18, 0], bevel: 0.04, color: "copper" },
    ...[[0.36, 0.5], [0.62, 0.2]].map(([x, z]): Part => ({ shape: "cylinder", sides: 8, radius: 0.15, height: 0.36, pos: [x, 0.86, q(z + 0.4)], color: "red" })),
    { shape: "cylinder", sides: 8, radius: 0.13, height: 0.6, pos: [-0.2, 0.8, -0.62], rot: [0, 30, 90], color: "copper" },
    { shape: "cylinder", sides: 8, radius: 0.13, height: 0.6, pos: [-0.16, 0.8, -0.92], rot: [0, 10, 90], color: "dry" },
    { shape: "sphere", radius: 0.1, pos: [-0.1, 1.42, 0.24], color: "crystal" },
  ]);
}

/** Modèle de la remorque : châssis, et une superstructure par amélioration de pont ou de soutien. */
export function remorqueArche(): Part[] {
  return [...chassis(), ...tourelles(), ...atelier(), ...soutes(), ...reparation(), ...radar(), ...brouilleur(), ...dynamo(), ...pillage()];
}
