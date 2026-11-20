// Descriptions des unités. Clé = clé de l'unité dans les données du jeu (sim/src/data.rs).
// Généré depuis des descriptions de pièces simples (voir types.ts et kit.ts) ; aucune géométrie brute.
import type { Model, Part, Vec3 } from "./types.ts";
import { colossus } from "./experimentales/colossus.ts";
import { dragon } from "./experimentales/dragon.ts";
import { fortress } from "./experimentales/fortress.ts";
import { hyper_cruiser } from "./experimentales/hyper_cruiser.ts";
import { mothership } from "./experimentales/mothership.ts";
import { roach } from "./experimentales/roach.ts";
import { spider } from "./experimentales/spider.ts";
import { star_cruiser } from "./experimentales/star_cruiser.ts";
import { BEAST_MODELS } from "./faune.ts";

/**
 * Place une pièce le long d'un axe incliné (canon, rampe) : `base` = origine de l'axe, `elev` = angle
 * de hausse en degrés (0 : vers l'avant, +z ; positif : vers le haut), `d` = distance le long de l'axe,
 * `h` = décalage perpendiculaire (vers le haut de l'axe). La rotation de la pièce s'ajoute à la hausse.
 * Pour un cylindre couché dans l'axe, donner rot: [90, 0, 0].
 */
function incl(base: Vec3, elev: number, d: number, h: number, p: Part): Part {
  const a = (elev * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const r = p.rot ?? [0, 0, 0];
  const pos: Vec3 = [base[0], +(base[1] + s * d + c * h).toFixed(3), +(base[2] + c * d - s * h).toFixed(3)];
  return { ...p, pos, rot: [r[0] - elev, r[1], r[2]] };
}

/** Paire de roues (pneu noir couché selon x), symétrique gauche-droite : 64 triangles (48 en 6 côtés). */
function roues(x: number, y: number, z: number, r: number, w: number, sides = 8): Part {
  return { shape: "cylinder", sides, radius: r, height: w, pos: [x, y, z], rot: [0, 0, 90], color: "black", mirror: true };
}

/** Chenille à patins (côté droit, mirror pour l'autre) : bande noire, galets et garde-boue. */
function chenille(x: number, w: number, len: number, h: number): Part[] {
  return [
    { shape: "bevel", size: [w, h, len], pos: [x, h / 2, 0], color: "black", bevel: h * 0.3, mirror: true },
    { shape: "box", size: [w + 0.04, h * 0.35, len * 0.82], pos: [x, h * 0.42, 0], color: "dark", mirror: true },
  ];
}

export const UNIT_MODELS: Record<string, Model> = {
  // commander : grand mécha bipède, blindage clair, canon au bras droit, visière cyan
  commander: {
    parts: [
      // jambes articulées : pivots jambe_d / jambe_g à la hanche (balancement pendant la marche)
      { shape: "bevel", size: [0.5,0.4,0.55], pos: [0.5,1.35,0], color: "dark", pivot: "jambe_d" },
      { shape: "bevel", size: [0.44,0.7,0.5], pos: [0.55,1.0,0.05], color: "light", parent: "jambe_d" },
      { shape: "bevel", size: [0.5,0.3,0.55], pos: [0.55,0.64,0.14], color: "faction", parent: "jambe_d" },
      { shape: "bevel", size: [0.42,0.58,0.56], pos: [0.55,0.36,0], color: "metal", parent: "jambe_d" },
      { shape: "box", size: [0.06,0.34,0.04], pos: [0.55,0.38,0.29], color: "glow", parent: "jambe_d" },
      { shape: "bevel", size: [0.62,0.18,0.95], pos: [0.55,0.09,0.1], color: "dark", parent: "jambe_d" },
      { shape: "bevel", size: [0.5,0.4,0.55], pos: [-0.5,1.35,0], color: "dark", pivot: "jambe_g" },
      { shape: "bevel", size: [0.44,0.7,0.5], pos: [-0.55,1.0,0.05], color: "light", parent: "jambe_g" },
      { shape: "bevel", size: [0.5,0.3,0.55], pos: [-0.55,0.64,0.14], color: "faction", parent: "jambe_g" },
      { shape: "bevel", size: [0.42,0.58,0.56], pos: [-0.55,0.36,0], color: "metal", parent: "jambe_g" },
      { shape: "box", size: [0.06,0.34,0.04], pos: [-0.55,0.38,0.29], color: "glow", parent: "jambe_g" },
      { shape: "bevel", size: [0.62,0.18,0.95], pos: [-0.55,0.09,0.1], color: "dark", parent: "jambe_g" },
      { shape: "bevel", size: [1.0,0.4,0.72], pos: [0,1.35,0], color: "dark" },
      // torse (pivot)
      { shape: "bevel", size: [1.3,0.9,1.0], pos: [0,1.92,0], color: "faction", pivot: "torse" },
      { shape: "bevel", size: [1.0,0.55,0.26], pos: [0,1.95,0.5], color: "light", parent: "torse" },
      { shape: "box", size: [0.72,0.1,0.06], pos: [0,2.1,0.64], color: "glow", parent: "torse" },
      { shape: "box", size: [0.1,0.06,0.04], pos: [0.3,1.78,0.64], color: "amber", mirror: true, parent: "torse" },
      { shape: "bevel", size: [0.56,0.36,0.5], pos: [0,2.48,0.12], color: "light", parent: "torse" },
      { shape: "box", size: [0.42,0.08,0.05], pos: [0,2.5,0.38], color: "glow", parent: "torse" },
      // épaules
      { shape: "bevel", size: [0.66,0.5,0.82], pos: [0.95,2.24,0], color: "light", mirror: true, parent: "torse" },
      { shape: "bevel", size: [0.5,0.12,0.7], pos: [1.0,2.52,0], color: "faction", mirror: true, parent: "torse" },
      { shape: "box", size: [0.08,0.06,0.04], pos: [1.22,2.3,0.42], color: "amber", mirror: true, parent: "torse" },
      // bras droit : canon
      { shape: "bevel", size: [0.36,0.6,0.42], pos: [1.05,1.8,0.08], color: "metal", parent: "torse" },
      { shape: "bevel", size: [0.52,0.5,1.0], pos: [1.1,1.55,0.45], color: "dark", parent: "torse" },
      { shape: "box", size: [0.05,0.06,0.72], pos: [1.37,1.6,0.45], color: "glow", parent: "torse" },
      { shape: "cylinder", sides: 8, radius: 0.12, height: 1.0, pos: [1.1,1.55,1.2], rot: [90,0,0], color: "metal", parent: "torse" },
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.08, pos: [1.1,1.55,1.68], rot: [90,0,0], color: "glow", parent: "torse" },
      // bras gauche : outil de construction
      { shape: "bevel", size: [0.36,0.6,0.42], pos: [-1.05,1.8,0.08], color: "metal", parent: "torse" },
      { shape: "bevel", size: [0.44,0.55,0.52], pos: [-1.08,1.36,0.2], color: "light", parent: "torse" },
      { shape: "box", size: [0.2,0.22,0.3], pos: [-1.08,1.0,0.32], color: "dark", parent: "torse" },
      { shape: "box", size: [0.12,0.12,0.06], pos: [-1.08,1.0,0.5], color: "glow", parent: "torse" },
      // sac dorsal
      { shape: "bevel", size: [0.92,0.72,0.46], pos: [0,2.0,-0.66], color: "dark", parent: "torse" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 0.42, pos: [0.3,2.48,-0.7], color: "metal", mirror: true, parent: "torse" },
      { shape: "box", size: [0.6,0.08,0.04], pos: [0,1.9,-0.9], color: "glow", parent: "torse" },
      { use: "antenne", pos: [-0.42,2.62,-0.55], scale: 0.7, parent: "torse" },
    ],
  },
  // eng1 : drone ingénieur, coque blindée en galet, pince à gauche, outil laser à droite, deux rotors latéraux (344 triangles)
  eng1: {
    parts: [
      { shape: "bevel", size: [0.9,0.4,0.86], pos: [0,0.72,0], color: "dark" },
      { shape: "bevel", size: [0.74,0.14,0.68], pos: [0,0.96,-0.02], color: "faction" },
      { shape: "box", size: [0.56,0.22,0.16], pos: [0,0.76,0.46], color: "light" },
      { shape: "box", size: [0.32,0.05,0.03], pos: [0,0.8,0.565], color: "glow" },
      { shape: "box", size: [0.1,0.28,0.62], pos: [0.48,0.74,0], color: "light", mirror: true },
      { shape: "box", size: [0.06,0.04,0.04], pos: [0.24,1.04,0.28], color: "amber", mirror: true },
      // bras porte-rotor et carénage
      { shape: "box", size: [0.5,0.08,0.12], pos: [0.75,0.8,0], color: "metal", mirror: true },
      { shape: "cylinder", sides: 5, radius: 0.3, radiusTop: 0.26, height: 0.1, pos: [1.08,0.78,0], color: "dark", mirror: true },
      { use: "rotor", pos: [1.08,0.86,0], scale: 0.42, pivot: "rotor1" },
      { use: "rotor", pos: [-1.08,0.86,0], scale: 0.42, pivot: "rotor2" },
      // pince (gauche)
      { shape: "box", size: [0.12,0.3,0.12], pos: [-0.3,0.42,0.3], color: "metal" },
      { shape: "box", size: [0.05,0.16,0.06], pos: [-0.36,0.24,0.36], rot: [0,0,-15], color: "dark" },
      { shape: "box", size: [0.05,0.16,0.06], pos: [-0.24,0.24,0.36], rot: [0,0,15], color: "dark" },
      // outil laser (droite)
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.34, pos: [0.3,0.46,0.38], rot: [90,0,0], color: "metal" },
      { shape: "box", size: [0.04,0.04,0.3], pos: [0.3,0.46,0.68], color: "glow" },
    ],
  },
  // eng3 : drone ingénieur avancé, coque large, quatre rotors en croix, foreuse et pince (340 triangles)
  eng3: {
    parts: [
      { shape: "bevel", size: [1.0,0.44,1.0], pos: [0,0.8,0], color: "dark" },
      { shape: "bevel", size: [0.82,0.16,0.8], pos: [0,1.07,-0.03], color: "faction" },
      { shape: "box", size: [0.72,0.3,0.14], pos: [0,0.82,0.54], color: "light" },
      { shape: "box", size: [0.42,0.05,0.03], pos: [0,0.88,0.625], color: "glow" },
      { shape: "box", size: [1.9,0.08,0.14], pos: [0,0.86,0], color: "metal" },
      { shape: "box", size: [0.14,0.08,1.9], pos: [0,0.86,0], color: "metal" },
      { shape: "box", size: [0.2,0.16,0.2], pos: [0.8,0.88,0], color: "light", mirror: true },
      { shape: "box", size: [0.2,0.16,0.2], pos: [0,0.88,0.8], color: "light" },
      { shape: "box", size: [0.2,0.16,0.2], pos: [0,0.88,-0.8], color: "light" },
      { use: "rotor", pos: [0.8,0.98,0], scale: 0.48, pivot: "r1" },
      { use: "rotor", pos: [-0.8,0.98,0], scale: 0.48, pivot: "r2" },
      { use: "rotor", pos: [0,0.98,0.8], scale: 0.48, pivot: "r3" },
      { use: "rotor", pos: [0,0.98,-0.8], scale: 0.48, pivot: "r4" },
      // foreuse (droite) et pince (gauche)
      { shape: "box", size: [0.14,0.36,0.14], pos: [0.36,0.48,0.3], color: "metal" },
      { shape: "cone", sides: 6, radius: 0.09, height: 0.34, pos: [0.36,0.34,0.52], rot: [90,0,0], color: "amber" },
      { shape: "box", size: [0.14,0.36,0.14], pos: [-0.36,0.48,0.3], color: "metal" },
      { shape: "box", size: [0.06,0.18,0.06], pos: [-0.42,0.26,0.38], rot: [0,0,-15], color: "dark" },
      { shape: "box", size: [0.06,0.18,0.06], pos: [-0.3,0.26,0.38], rot: [0,0,15], color: "dark" },
    ],
  },
  // eng5 : drone ingénieur suprême, dôme blindé à œil cyan, anneau lumineux, quatre rotors carénés (340 triangles)
  eng5: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 0.62, radiusTop: 0.52, height: 0.34, pos: [0,0.82,0], color: "dark" },
      { shape: "sphere", radius: 0.52, pos: [0,1.0,0], scale: [1,0.62,1], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.42, height: 0.05, pos: [0,0.63,0], color: "glow" },
      { shape: "box", size: [0.36,0.28,0.14], pos: [0.38,0.92,0.36], rot: [0,45,0], color: "light", mirror: true },
      { shape: "box", size: [0.36,0.28,0.14], pos: [0.38,0.92,-0.36], rot: [0,-45,0], color: "light", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.15, height: 0.08, pos: [0,0.86,0.6], rot: [90,0,0], color: "glow" },
      { shape: "box", size: [2.1,0.08,0.16], pos: [0,0.88,0], color: "metal" },
      { shape: "box", size: [0.16,0.08,2.1], pos: [0,0.88,0], color: "metal" },
      { shape: "box", size: [0.24,0.18,0.24], pos: [1.05,0.88,0], color: "dark", mirror: true },
      { shape: "box", size: [0.24,0.18,0.24], pos: [0,0.88,1.05], color: "dark" },
      { shape: "box", size: [0.24,0.18,0.24], pos: [0,0.88,-1.05], color: "dark" },
      { use: "rotor", pos: [1.05,1.0,0], scale: 0.5, pivot: "r1" },
      { use: "rotor", pos: [-1.05,1.0,0], scale: 0.5, pivot: "r2" },
      { use: "rotor", pos: [0,1.0,1.05], scale: 0.5, pivot: "r3" },
      { use: "rotor", pos: [0,1.0,-1.05], scale: 0.5, pivot: "r4" },
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.3,1.18,0.12], color: "amber", mirror: true },
    ],
  },
  // line_robot : petit fantassin bipède, fusil au bras droit (unité la plus nombreuse : peu de triangles)
  line_robot: {
    parts: [
      // jambes articulées (pivots à la hanche) et bassin
      { shape: "box", size: [0.14,0.1,0.16], pos: [0.15,0.72,0], color: "dark", pivot: "jambe_d" },
      { shape: "box", size: [0.16,0.38,0.2], pos: [0.15,0.55,0], color: "metal", parent: "jambe_d" },
      { shape: "box", size: [0.19,0.34,0.25], pos: [0.15,0.22,0.02], color: "light", parent: "jambe_d" },
      { shape: "box", size: [0.24,0.08,0.34], pos: [0.15,0.04,0.06], color: "dark", parent: "jambe_d" },
      { shape: "box", size: [0.14,0.1,0.16], pos: [-0.15,0.72,0], color: "dark", pivot: "jambe_g" },
      { shape: "box", size: [0.16,0.38,0.2], pos: [-0.15,0.55,0], color: "metal", parent: "jambe_g" },
      { shape: "box", size: [0.19,0.34,0.25], pos: [-0.15,0.22,0.02], color: "light", parent: "jambe_g" },
      { shape: "box", size: [0.24,0.08,0.34], pos: [-0.15,0.04,0.06], color: "dark", parent: "jambe_g" },
      { shape: "box", size: [0.42,0.16,0.26], pos: [0,0.76,0], color: "dark" },
      // haut du corps orientable (pivot torse) : il vise la cible pendant la marche
      { shape: "bevel", size: [0.56,0.48,0.36], pos: [0,1.02,0], color: "faction", pivot: "torse" },
      { shape: "bevel", size: [0.42,0.26,0.1], pos: [0,1.08,0.19], color: "light", parent: "torse" },
      { shape: "bevel", size: [0.2,0.18,0.3], pos: [0.36,1.2,0], color: "light", mirror: true, parent: "torse" },
      { shape: "bevel", size: [0.24,0.2,0.26], pos: [0,1.38,0.03], color: "light", parent: "torse" },
      { shape: "box", size: [0.18,0.05,0.03], pos: [0,1.39,0.17], color: "glow", parent: "torse" },
      { shape: "box", size: [0.12,0.4,0.14], pos: [0.38,0.98,0.05], color: "metal", mirror: true, parent: "torse" },
      { shape: "box", size: [0.1,0.12,0.62], pos: [0.38,0.82,0.32], color: "dark", parent: "torse" },
      { shape: "box", size: [0.05,0.05,0.05], pos: [0.38,0.82,0.65], color: "glow", parent: "torse" },
      { shape: "box", size: [0.36,0.3,0.16], pos: [0,1.05,-0.25], color: "dark", parent: "torse" },
      { shape: "box", size: [0.06,0.04,0.03], pos: [0.12,1.15,-0.34], color: "amber", parent: "torse" },
    ],
  },
  // moto : glisseur effilé, nez clair, verrière sombre, nacelles latérales à liseré cyan, ailerons (332 triangles)
  moto: {
    parts: [
      { shape: "bevel", size: [0.66,0.28,1.8], pos: [0,0.46,-0.1], color: "dark" },
      { shape: "wedge", size: [0.62,0.24,0.7], pos: [0,0.48,1.1], color: "light" },
      { shape: "bevel", size: [0.54,0.16,1.0], pos: [0,0.66,-0.15], color: "faction" },
      { shape: "wedge", size: [0.34,0.18,0.5], pos: [0,0.8,0.25], color: "glass" },
      { shape: "box", size: [0.3,0.12,0.4], pos: [0,0.8,-0.2], color: "black" },
      // nacelles
      { shape: "bevel", size: [0.26,0.24,0.95], pos: [0.46,0.42,-0.3], color: "light", bevel: 0.06, mirror: true },
      { shape: "box", size: [0.03,0.04,0.6], pos: [0.595,0.44,-0.3], color: "glow", mirror: true },
      { shape: "box", size: [0.18,0.12,0.04], pos: [0.46,0.42,-0.79], color: "glow", mirror: true },
      { shape: "box", size: [0.58,0.04,0.05], pos: [0,0.36,1.05], color: "glow" },
      { shape: "box", size: [0.06,0.04,0.04], pos: [0.2,0.58,1.0], color: "amber", mirror: true },
      // ailerons et coussin
      { shape: "wedge", size: [0.04,0.28,0.4], pos: [0.18,0.86,-0.75], rot: [0,180,0], color: "faction", mirror: true },
      { shape: "box", size: [0.46,0.04,1.2], pos: [0,0.3,-0.1], color: "glow" },
    ],
  },
  // light_tank : char léger à chenilles, tourelle unique
  light_tank: {
    parts: [
      { use: "chenille_l", pos: [0.95,0,0], mirror: true },
      { shape: "bevel", size: [0.5,0.12,2.05], pos: [0.95,0.52,0], color: "light", mirror: true },
      { shape: "bevel", size: [1.5,0.4,2.1], pos: [0,0.6,0], color: "faction" },
      { shape: "wedge", size: [1.36,0.24,0.5], pos: [0,0.62,1.24], color: "light" },
      { shape: "bevel", size: [1.1,0.14,0.6], pos: [0,0.84,-0.72], color: "dark" },
      { shape: "box", size: [0.7,0.03,0.08], pos: [0,0.92,-0.82], color: "glow" },
      { shape: "box", size: [0.1,0.06,0.04], pos: [0.55,0.66,1.06], color: "amber", mirror: true },
      { shape: "bevel", size: [1.0,0.42,1.1], pos: [0,0.98,-0.1], color: "light", pivot: "tourelle" },
      { shape: "bevel", size: [0.8,0.12,0.78], pos: [0,1.22,-0.16], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.05,0.05,0.7], pos: [0.51,1.02,-0.1], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 1.3, pos: [0,1.0,0.95], rot: [90,0,0], color: "metal", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.2, pos: [0,1.0,1.6], rot: [90,0,0], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.02,0.4,0.02], pos: [-0.35,1.42,-0.45], color: "light", parent: "tourelle" },
    ],
  },
  // artillery : véhicule à quatre grosses roues, long canon relevé à filet cyan (436 triangles)
  artillery: {
    parts: [
      roues(0.78,0.38,0.8,0.38,0.32),
      roues(0.78,0.38,-0.8,0.38,0.32),
      { shape: "bevel", size: [1.3,0.4,2.4], pos: [0,0.62,0], color: "dark" },
      { shape: "bevel", size: [1.44,0.3,0.95], pos: [0,0.9,0.68], color: "light" },
      { shape: "box", size: [1.2,0.22,1.0], pos: [0,0.88,-0.65], color: "faction" },
      { shape: "box", size: [0.03,0.05,1.9], pos: [0.73,0.7,0], color: "glow", mirror: true },
      { shape: "box", size: [0.12,0.06,0.03], pos: [0.5,0.72,1.21], color: "amber", mirror: true },
      // tourelle et canon
      { shape: "bevel", size: [0.84,0.38,0.9], pos: [0,1.2,-0.25], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [0.1,0.3,0.7], pos: [0.45,1.2,-0.25], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.2,1.41,-0.05], color: "amber", parent: "tourelle" },
      incl([0,1.32,0.1], 24, 0.2, 0, { shape: "box", size: [0.34,0.32,0.6], color: "dark", parent: "tourelle" }),
      incl([0,1.32,0.1], 24, 1.2, 0, { shape: "cylinder", sides: 8, radius: 0.11, height: 2.0, rot: [90,0,0], color: "metal", parent: "tourelle" }),
      incl([0,1.32,0.1], 24, 1.0, 0.13, { shape: "box", size: [0.04,0.04,1.3], color: "glow", parent: "tourelle" }),
      incl([0,1.32,0.1], 24, 2.15, 0, { shape: "cylinder", sides: 6, radius: 0.15, height: 0.24, rot: [90,0,0], color: "dark", parent: "tourelle" }),
    ],
  },
  // mobile_aa : véhicule à quatre roues, tourelle à deux nacelles de canons jumelés relevés (448 triangles)
  mobile_aa: {
    parts: [
      roues(0.78,0.36,0.75,0.36,0.3),
      roues(0.78,0.36,-0.75,0.36,0.3),
      { shape: "bevel", size: [1.3,0.38,2.2], pos: [0,0.6,0], color: "dark" },
      { shape: "bevel", size: [1.44,0.28,0.85], pos: [0,0.86,0.66], color: "light" },
      { shape: "box", size: [1.24,0.2,0.95], pos: [0,0.84,-0.58], color: "faction" },
      { shape: "box", size: [0.03,0.05,1.8], pos: [0.73,0.68,0], color: "glow", mirror: true },
      // tourelle
      { shape: "cylinder", sides: 6, radius: 0.48, height: 0.16, pos: [0,1.02,-0.12], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [0.72,0.44,0.72], pos: [0,1.3,-0.12], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.3,0.06,0.03], pos: [0,1.36,0.25], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.05], pos: [-0.2,1.54,-0.2], color: "amber", parent: "tourelle" },
      incl([0.5,1.38,-0.12], 34, 0.05, 0, { shape: "box", size: [0.26,0.3,0.7], color: "light", mirror: true, parent: "tourelle" }),
      incl([0.44,1.42,-0.12], 34, 0.85, 0, { shape: "cylinder", sides: 5, radius: 0.055, height: 1.25, rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" }),
      incl([0.56,1.42,-0.12], 34, 0.85, 0, { shape: "cylinder", sides: 5, radius: 0.055, height: 1.25, rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" }),
    ],
  },
  // sonde : petit quadrupède blindé, parabole radar tournante, mât d'antenne (344 triangles)
  sonde: {
    parts: [
      { shape: "bevel", size: [0.9,0.34,1.0], pos: [0,0.74,0], color: "dark" },
      { shape: "bevel", size: [0.74,0.14,0.78], pos: [0,0.96,-0.02], color: "faction" },
      { shape: "box", size: [0.7,0.22,0.1], pos: [0,0.76,0.52], color: "light" },
      { shape: "box", size: [0.4,0.04,0.03], pos: [0,0.8,0.58], color: "glow" },
      { shape: "box", size: [0.08,0.22,0.62], pos: [0.48,0.76,0], color: "light", mirror: true },
      { shape: "box", size: [0.02,0.04,0.32], pos: [0.53,0.8,0], color: "glow", mirror: true },
      // pattes
      { shape: "box", size: [0.18,0.52,0.22], pos: [0.6,0.34,0.38], rot: [0,0,-14], color: "light", mirror: true },
      { shape: "box", size: [0.18,0.52,0.22], pos: [0.6,0.34,-0.38], rot: [0,0,-14], color: "light", mirror: true },
      { shape: "box", size: [0.24,0.08,0.3], pos: [0.66,0.04,0.42], color: "black", mirror: true },
      { shape: "box", size: [0.24,0.08,0.3], pos: [0.66,0.04,-0.38], color: "black", mirror: true },
      // parabole (pivot) et antenne
      { shape: "box", size: [0.08,0.24,0.08], pos: [0.18,1.12,-0.12], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.06, radiusTop: 0.3, height: 0.1, pos: [0.18,1.3,-0.12], rot: [35,0,0], color: "light", pivot: "radar" },
      { shape: "sphere", radius: 0.06, pos: [0.18,1.4,-0.05], color: "amber", parent: "radar" },
      { shape: "box", size: [0.04,0.62,0.04], pos: [-0.26,1.3,-0.32], color: "metal" },
      { shape: "box", size: [0.06,0.06,0.06], pos: [-0.26,1.62,-0.32], color: "amber" },
    ],
  },
  // assault_walker : quadrupède trapu, tourelle blindée portant deux canons longs sur les épaules (420 triangles)
  assault_walker: {
    parts: [
      // pattes : cuisse inclinée, tibia, pied
      { shape: "box", size: [0.22,0.5,0.28], pos: [0.62,0.8,0.42], rot: [0,0,-40], color: "light", mirror: true },
      { shape: "box", size: [0.22,0.5,0.28], pos: [0.62,0.8,-0.42], rot: [0,0,-40], color: "light", mirror: true },
      { shape: "box", size: [0.3,0.56,0.36], pos: [0.84,0.34,0.46], color: "dark", mirror: true },
      { shape: "box", size: [0.3,0.56,0.36], pos: [0.84,0.34,-0.46], color: "dark", mirror: true },
      { shape: "box", size: [0.4,0.1,0.52], pos: [0.86,0.05,0.5], color: "black", mirror: true },
      { shape: "box", size: [0.4,0.1,0.52], pos: [0.86,0.05,-0.46], color: "black", mirror: true },
      { shape: "bevel", size: [1.1,0.4,1.1], pos: [0,0.92,0], color: "dark" },
      // tourelle
      { shape: "bevel", size: [1.0,0.48,1.1], pos: [0,1.32,0], color: "faction", pivot: "tourelle" },
      { shape: "bevel", size: [0.66,0.3,0.22], pos: [0,1.28,0.56], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.42,0.05,0.03], pos: [0,1.34,0.675], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.56,0.28,0.26], pos: [0,1.36,-0.64], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.3,0.3,1.1], pos: [0.62,1.66,0.18], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03,0.05,0.8], pos: [0.78,1.66,0.2], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.08,0.05,0.04], pos: [0.55,1.76,0.74], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.8, pos: [0.62,1.66,1.12], rot: [90,0,0], color: "metal", mirror: true, parent: "tourelle" },
    ],
  },
  // hover_tank : large coque de glisseur à jupe lumineuse, bandes aux couleurs du camp, tourelle à canon (376 triangles)
  hover_tank: {
    parts: [
      { shape: "bevel", size: [2.2,0.36,3.3], pos: [0,0.46,0], color: "dark", bevel: 0.16 },
      { shape: "box", size: [2.16,0.06,2.9], pos: [0,0.4,0], color: "glow" },
      { shape: "box", size: [1.5,0.04,2.4], pos: [0,0.27,0], color: "glow" },
      { shape: "bevel", size: [1.9,0.34,2.8], pos: [0,0.76,-0.1], color: "light", bevel: 0.12 },
      { shape: "wedge", size: [1.7,0.26,0.6], pos: [0,0.74,1.55], color: "dark" },
      { shape: "box", size: [0.5,0.06,2.5], pos: [0.55,0.95,-0.12], color: "faction", mirror: true },
      { shape: "box", size: [0.14,0.06,0.04], pos: [0.55,0.68,1.86], color: "amber", mirror: true },
      { shape: "box", size: [0.9,0.1,0.04], pos: [0,0.82,-1.51], color: "glow" },
      // tourelle
      { shape: "bevel", size: [1.1,0.4,1.2], pos: [0,1.12,-0.3], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [0.12,0.3,0.9], pos: [0.58,1.1,-0.3], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.04,0.04,0.6], pos: [0.645,1.14,-0.3], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.36,0.3,0.4], pos: [0,1.12,0.4], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 1.3, pos: [0,1.14,1.2], rot: [90,0,0], color: "metal", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 0.2, pos: [0,1.14,1.85], rot: [90,0,0], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.05], pos: [0.3,1.34,0.1], color: "amber", parent: "tourelle" },
      { shape: "box", size: [0.03,0.4,0.03], pos: [-0.38,1.5,-0.7], color: "light", parent: "tourelle" },
    ],
  },
  // missile_launcher : camion à six roues, cabine claire, rampe de quatre gros missiles relevée (424 triangles)
  missile_launcher: {
    parts: [
      roues(0.7,0.32,0.95,0.32,0.28,6),
      roues(0.7,0.32,-0.25,0.32,0.28,6),
      roues(0.7,0.32,-0.95,0.32,0.28,6),
      { shape: "bevel", size: [1.3,0.3,2.8], pos: [0,0.55,0], color: "dark" },
      { shape: "bevel", size: [1.32,0.62,0.8], pos: [0,0.98,1.0], color: "light" },
      { shape: "box", size: [1.04,0.2,0.04], pos: [0,1.1,1.41], color: "glass" },
      { shape: "box", size: [0.06,0.1,0.03], pos: [0.52,0.8,1.41], color: "glow", mirror: true },
      { shape: "box", size: [1.2,0.2,1.7], pos: [0,0.8,-0.55], color: "faction" },
      // rampe (pivot)
      { shape: "box", size: [0.5,0.2,0.5], pos: [0,0.95,-0.7], color: "metal", pivot: "tourelle" },
      incl([0,1.12,-1.25], 30, 0.75, 0, { shape: "box", size: [1.2,0.16,1.5], color: "faction", parent: "tourelle" }),
      incl([0.2,1.12,-1.25], 30, 0.7, 0.26, { shape: "cylinder", sides: 5, radius: 0.15, height: 1.3, rot: [90,0,0], color: "light", mirror: true, parent: "tourelle" }),
      incl([0.48,1.12,-1.25], 30, 0.7, 0.26, { shape: "cylinder", sides: 5, radius: 0.15, height: 1.3, rot: [90,0,0], color: "light", mirror: true, parent: "tourelle" }),
      incl([0.2,1.12,-1.25], 30, 1.5, 0.26, { shape: "cone", sides: 5, radius: 0.15, height: 0.3, rot: [90,0,0], color: "black", mirror: true, parent: "tourelle" }),
      incl([0.48,1.12,-1.25], 30, 1.5, 0.26, { shape: "cone", sides: 5, radius: 0.15, height: 0.3, rot: [90,0,0], color: "black", mirror: true, parent: "tourelle" }),
    ],
  },
  // mobile_shield : véhicule blindé à quatre roues, émetteur de bouclier lumineux tournant sur le toit (612 triangles)
  mobile_shield: {
    parts: [
      roues(0.8,0.38,0.78,0.38,0.32),
      roues(0.8,0.38,-0.78,0.38,0.32),
      { shape: "bevel", size: [1.36,0.4,2.3], pos: [0,0.62,0], color: "dark" },
      { shape: "bevel", size: [1.5,0.3,0.8], pos: [0,0.88,0.72], color: "light" },
      { shape: "bevel", size: [1.2,0.3,1.4], pos: [0,0.92,-0.35], color: "faction" },
      { shape: "bevel", size: [0.2,0.3,1.0], pos: [0.72,0.86,-0.35], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.05,1.9], pos: [0.7,0.68,0], color: "glow", mirror: true },
      { shape: "box", size: [0.12,0.06,0.03], pos: [0.5,0.74,1.16], color: "glow", mirror: true },
      { shape: "box", size: [0.06,0.05,0.05], pos: [0.6,1.04,0.4], color: "amber", mirror: true },
      // émetteur
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.2, pos: [0,1.14,-0.3], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.36, height: 0.1, pos: [0,1.28,-0.3], color: "dark" },
      { shape: "sphere", radius: 0.28, detail: 1, pos: [0,1.42,-0.3], color: "glow", pivot: "emetteur" },
      { shape: "box", size: [0.08,0.36,0.08], pos: [0.36,1.4,-0.3], color: "light", mirror: true, parent: "emetteur" },
      { shape: "box", size: [0.08,0.36,0.08], pos: [0,1.4,0.06], color: "light", parent: "emetteur" },
      { shape: "box", size: [0.08,0.36,0.08], pos: [0,1.4,-0.66], color: "light", parent: "emetteur" },
    ],
  },
  // ion_cannon : char à chenilles, tourelle massive, gros canon à ions cerclé d'anneaux lumineux (720 triangles)
  ion_cannon: {
    parts: [
      ...chenille(0.95,0.46,2.5,0.5),
      { shape: "bevel", size: [0.54,0.12,2.3], pos: [0.95,0.55,0], color: "light", mirror: true },
      { shape: "bevel", size: [1.5,0.42,2.4], pos: [0,0.58,0], color: "dark" },
      { shape: "bevel", size: [1.3,0.2,0.7], pos: [0,0.78,0.85], color: "light" },
      { shape: "box", size: [1.3,0.12,1.0], pos: [0,0.82,-0.75], color: "faction" },
      { shape: "box", size: [0.03,0.05,1.6], pos: [1.23,0.4,0], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.5,0.66,1.21], color: "amber", mirror: true },
      // tourelle
      { shape: "bevel", size: [1.1,0.5,1.3], pos: [0,1.1,-0.3], color: "faction", pivot: "tourelle" },
      { shape: "bevel", size: [0.14,0.4,1.1], pos: [0.6,1.08,-0.3], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.4,0.06,0.4], pos: [-0.15,1.38,-0.55], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.08,0.05,0.04], pos: [0.3,1.3,0.36], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.5,0.46,0.8], pos: [0,1.14,0.6], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 1.4, pos: [0,1.14,1.4], rot: [90,0,0], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.25, height: 0.08, pos: [0,1.14,1.0], rot: [90,0,0], color: "glow", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.25, height: 0.08, pos: [0,1.14,1.25], rot: [90,0,0], color: "glow", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.25, height: 0.08, pos: [0,1.14,1.5], rot: [90,0,0], color: "glow", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.24, height: 0.2, pos: [0,1.14,2.1], rot: [90,0,0], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.18, height: 0.04, pos: [0,1.14,2.21], rot: [90,0,0], color: "glow", parent: "tourelle" },
    ],
  },
  // drone_launcher : porteur blindé à huit roues, plateforme de lancement à trappe centrale et volet arrière (656 triangles)
  drone_launcher: {
    parts: [
      roues(0.78,0.3,1.05,0.3,0.28),
      roues(0.78,0.3,0.35,0.3,0.28),
      roues(0.78,0.3,-0.35,0.3,0.28),
      roues(0.78,0.3,-1.05,0.3,0.28),
      { shape: "bevel", size: [1.5,0.4,2.8], pos: [0,0.56,0], color: "dark" },
      { shape: "bevel", size: [1.6,0.3,0.9], pos: [0,0.8,1.0], color: "light" },
      { shape: "bevel", size: [0.35,0.35,1.7], pos: [0.66,0.88,-0.35], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.05,2.4], pos: [0.76,0.6,0], color: "glow", mirror: true },
      { shape: "box", size: [0.12,0.06,0.03], pos: [0.55,0.74,1.46], color: "glow", mirror: true },
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.66,1.07,0.3], color: "amber", mirror: true },
      // plateforme de lancement (pivot)
      { shape: "bevel", size: [1.0,0.26,1.7], pos: [0,0.98,-0.35], color: "light", pivot: "tourelle" },
      { shape: "box", size: [0.5,0.04,0.9], pos: [0,1.12,-0.3], color: "black", parent: "tourelle" },
      { shape: "box", size: [0.03,0.03,0.9], pos: [0.26,1.14,-0.3], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.2,0.16,0.26], pos: [0.36,1.18,0.32], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.12,0.03,0.14], pos: [0.36,1.27,0.32], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [1.0,0.5,0.06], pos: [0,1.3,-1.22], rot: [-30,0,0], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.5,0.04,0.03], pos: [0,1.45,-1.28], rot: [-30,0,0], color: "glow", parent: "tourelle" },
    ],
  },
  // siege_walker : grand quadrupède de siège, tourelle portant deux affûts lourds à double canon (720 triangles)
  siege_walker: {
    parts: [
      // pattes
      { shape: "box", size: [0.4,0.8,0.5], pos: [0.95,1.3,0.8], rot: [0,0,-22], color: "light", mirror: true },
      { shape: "box", size: [0.4,0.8,0.5], pos: [0.95,1.3,-0.8], rot: [0,0,-22], color: "light", mirror: true },
      { shape: "box", size: [0.38,0.3,0.42], pos: [1.15,0.98,0.85], color: "faction", mirror: true },
      { shape: "box", size: [0.38,0.3,0.42], pos: [1.15,0.98,-0.85], color: "faction", mirror: true },
      { shape: "bevel", size: [0.5,0.9,0.62], pos: [1.2,0.5,0.85], color: "dark", mirror: true },
      { shape: "bevel", size: [0.5,0.9,0.62], pos: [1.2,0.5,-0.85], color: "dark", mirror: true },
      { shape: "box", size: [0.7,0.16,0.85], pos: [1.22,0.08,0.92], color: "black", mirror: true },
      { shape: "box", size: [0.7,0.16,0.85], pos: [1.22,0.08,-0.88], color: "black", mirror: true },
      { shape: "bevel", size: [1.8,0.5,2.0], pos: [0,1.6,0], color: "dark" },
      // tourelle
      { shape: "bevel", size: [1.6,0.7,1.8], pos: [0,2.15,0], color: "faction", pivot: "tourelle" },
      { shape: "bevel", size: [1.0,0.45,0.26], pos: [0,2.1,0.9], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.6,0.07,0.04], pos: [0,2.18,1.04], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.08,0.05,0.04], pos: [0.36,1.96,1.04], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.52,0.52,1.7], pos: [1.08,2.5,0.25], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03,0.06,1.2], pos: [1.35,2.5,0.3], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.42,0.42,0.5], pos: [1.08,2.5,-0.75], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.09, height: 1.5, pos: [0.96,2.52,1.75], rot: [90,0,0], color: "metal", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.09, height: 1.5, pos: [1.2,2.52,1.75], rot: [90,0,0], color: "metal", mirror: true, parent: "tourelle" },
    ],
  },
  // shock_robot : robot de choc trapu, casque clair à visière cyan, épaulières massives, poings électrifiés (700 triangles)
  shock_robot: {
    parts: [
      // jambes
      { shape: "box", size: [0.42,0.6,0.5], pos: [0.38,0.98,0], color: "dark", mirror: true },
      { shape: "bevel", size: [0.55,0.7,0.65], pos: [0.42,0.45,0.05], color: "light", mirror: true },
      { shape: "box", size: [0.6,0.14,0.85], pos: [0.42,0.07,0.12], color: "black", mirror: true },
      { shape: "box", size: [0.06,0.3,0.03], pos: [0.42,0.5,0.385], color: "glow", mirror: true },
      { shape: "bevel", size: [1.0,0.4,0.7], pos: [0,1.35,0], color: "dark" },
      // torse (pivot)
      { shape: "bevel", size: [1.5,1.0,1.0], pos: [0,2.05,0], color: "faction", pivot: "torse" },
      { shape: "bevel", size: [1.0,0.55,0.25], pos: [0,2.1,0.5], color: "light", parent: "torse" },
      { shape: "sphere", radius: 0.16, pos: [0,2.05,0.64], color: "glow", parent: "torse" },
      { shape: "box", size: [0.9,0.6,0.35], pos: [0,2.1,-0.6], color: "dark", parent: "torse" },
      { shape: "bevel", size: [0.55,0.42,0.55], pos: [0,2.75,0.12], color: "light", parent: "torse" },
      { shape: "box", size: [0.36,0.07,0.04], pos: [0,2.78,0.4], color: "glow", parent: "torse" },
      // épaules et bras
      { shape: "bevel", size: [0.65,0.55,0.75], pos: [1.05,2.4,0], color: "light", mirror: true, parent: "torse" },
      { shape: "box", size: [0.5,0.08,0.6], pos: [1.05,2.7,0], color: "faction", mirror: true, parent: "torse" },
      { shape: "box", size: [0.08,0.05,0.04], pos: [1.2,2.45,0.38], color: "amber", mirror: true, parent: "torse" },
      { shape: "box", size: [0.35,0.6,0.4], pos: [1.05,1.85,0.05], color: "dark", mirror: true, parent: "torse" },
      { shape: "bevel", size: [0.62,0.6,0.7], pos: [1.1,1.28,0.2], color: "dark", mirror: true, parent: "torse" },
      { shape: "box", size: [0.06,0.06,0.5], pos: [1.1,1.28,0.58], rot: [0,25,30], color: "glow", mirror: true, parent: "torse" },
      { shape: "box", size: [0.5,0.06,0.06], pos: [1.12,1.6,0.3], rot: [0,20,-35], color: "glow", mirror: true, parent: "torse" },
      { shape: "box", size: [0.06,0.45,0.06], pos: [1.44,1.2,0.3], rot: [30,0,20], color: "glow", mirror: true, parent: "torse" },
    ],
  },
  // heavy_artillery : plateforme à quatre pattes écartées, tourelle lourde, très long canon clair à filet cyan (632 triangles)
  heavy_artillery: {
    parts: [
      // pattes
      { shape: "box", size: [0.9,0.3,0.36], pos: [1.0,0.92,0.8], rot: [0,0,-25], color: "light", mirror: true },
      { shape: "box", size: [0.9,0.3,0.36], pos: [1.0,0.92,-0.8], rot: [0,0,-25], color: "light", mirror: true },
      { shape: "bevel", size: [0.42,0.8,0.5], pos: [1.42,0.42,0.85], color: "dark", mirror: true },
      { shape: "bevel", size: [0.42,0.8,0.5], pos: [1.42,0.42,-0.85], color: "dark", mirror: true },
      { shape: "box", size: [0.55,0.12,0.62], pos: [1.46,0.06,0.88], color: "black", mirror: true },
      { shape: "box", size: [0.55,0.12,0.62], pos: [1.46,0.06,-0.88], color: "black", mirror: true },
      { shape: "box", size: [0.03,0.4,0.04], pos: [1.42,0.45,1.11], color: "glow", mirror: true },
      { shape: "bevel", size: [1.7,0.6,2.0], pos: [0,1.0,0], color: "dark" },
      { shape: "box", size: [0.12,0.3,1.6], pos: [0.86,1.05,0], color: "faction", mirror: true },
      // tourelle
      { shape: "cylinder", sides: 8, radius: 0.75, height: 0.2, pos: [0,1.4,0], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [1.2,0.6,1.4], pos: [0,1.78,-0.15], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.1,0.45,1.1], pos: [0.62,1.75,-0.2], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.35,2.1,0.3], color: "amber", mirror: true, parent: "tourelle" },
      incl([0,1.85,0.4], 12, 0.15, 0, { shape: "box", size: [0.6,0.52,0.7], color: "dark", parent: "tourelle" }),
      incl([0,1.85,0.4], 12, 2.1, 0, { shape: "cylinder", sides: 8, radius: 0.2, height: 3.6, rot: [90,0,0], color: "light", parent: "tourelle" }),
      incl([0,1.85,0.4], 12, 2.0, 0.2, { shape: "box", size: [0.05,0.05,2.6], color: "glow", parent: "tourelle" }),
      incl([0,1.85,0.4], 12, 1.0, 0, { shape: "cylinder", sides: 8, radius: 0.24, height: 0.4, rot: [90,0,0], color: "dark", parent: "tourelle" }),
      incl([0,1.85,0.4], 12, 4.05, 0, { shape: "cylinder", sides: 8, radius: 0.27, height: 0.5, rot: [90,0,0], color: "dark", parent: "tourelle" }),
      incl([0,1.85,0.4], 12, 4.31, 0, { shape: "cylinder", sides: 6, radius: 0.16, height: 0.04, rot: [90,0,0], color: "black", parent: "tourelle" }),
    ],
  },
  // scout_plane : petit jet à nez rond (optique orange), ailes delta claires, deux réacteurs et deux dérives (316 triangles)
  scout_plane: {
    parts: [
      { shape: "bevel", size: [0.5,0.36,2.1], pos: [0,0.42,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.24, height: 0.36, pos: [0,0.42,1.2], rot: [90,0,0], color: "dark" },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.04, pos: [0,0.42,1.39], rot: [90,0,0], color: "amber" },
      { shape: "wedge", size: [0.34,0.2,0.7], pos: [0,0.66,0.52], color: "glass" },
      { shape: "box", size: [0.4,0.12,1.0], pos: [0,0.64,-0.35], color: "faction" },
      { shape: "wedge", size: [0.06,1.5,1.3], pos: [1.0,0.4,-0.35], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "wedge", size: [0.03,0.8,0.95], pos: [0.65,0.44,-0.45], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [1.2,0.03,0.04], pos: [0.85,0.42,-0.98], color: "glow", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.9, pos: [0.36,0.46,-0.55], rot: [90,0,0], color: "metal", mirror: true },
      { shape: "box", size: [0.2,0.2,0.04], pos: [0.36,0.46,-1.01], color: "glow", mirror: true },
      { shape: "wedge", size: [0.04,0.42,0.5], pos: [0.3,0.76,-0.85], color: "faction", mirror: true },
      { shape: "box", size: [0.06,0.04,0.06], pos: [1.2,0.44,-0.7], color: "amber", mirror: true },
    ],
  },
  // interceptor : chasseur en pointe de flèche, ailes delta, plans canard, deux réacteurs et dérives inclinées (308 triangles)
  interceptor: {
    parts: [
      { shape: "bevel", size: [0.5,0.34,2.4], pos: [0,0.42,-0.1], color: "dark" },
      { shape: "cone", sides: 6, radius: 0.24, height: 1.0, pos: [0,0.42,1.6], rot: [90,0,0], color: "light" },
      { shape: "wedge", size: [0.3,0.18,0.7], pos: [0,0.65,0.7], color: "glass" },
      { shape: "wedge", size: [0.06,1.4,1.7], pos: [0.95,0.4,-0.35], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "wedge", size: [0.03,0.9,1.2], pos: [0.7,0.44,-0.5], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [1.1,0.03,0.04], pos: [0.85,0.42,-1.18], color: "glow", mirror: true },
      { shape: "wedge", size: [0.04,0.5,0.4], pos: [0.5,0.42,0.75], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.17, height: 1.1, pos: [0.3,0.46,-0.6], rot: [90,0,0], color: "metal", mirror: true },
      { shape: "box", size: [0.2,0.2,0.04], pos: [0.3,0.46,-1.16], color: "glow", mirror: true },
      { shape: "box", size: [0.2,0.2,0.3], pos: [0.3,0.46,0.05], color: "black", mirror: true },
      { shape: "wedge", size: [0.04,0.5,0.6], pos: [0.36,0.8,-0.9], rot: [0,0,-15], color: "faction", mirror: true },
      { shape: "box", size: [0.06,0.04,0.06], pos: [0.18,0.62,0.2], color: "amber", mirror: true },
    ],
  },
  // glider : planeur d'attaque, fuselage sombre, ailes delta à bord d'attaque cyan, quatre paniers de roquettes (352 triangles)
  glider: {
    parts: [
      { shape: "bevel", size: [0.56,0.34,2.0], pos: [0,0.45,0], color: "dark" },
      { shape: "wedge", size: [0.5,0.3,0.6], pos: [0,0.44,1.29], color: "dark" },
      { shape: "box", size: [0.3,0.04,0.03], pos: [0,0.4,1.0], color: "glow" },
      { shape: "wedge", size: [0.36,0.16,0.6], pos: [0,0.69,0.5], color: "glass" },
      { shape: "box", size: [0.44,0.1,0.9], pos: [0,0.66,-0.4], color: "faction" },
      { shape: "wedge", size: [0.06,1.2,1.2], pos: [0.88,0.45,-0.2], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "wedge", size: [0.03,0.75,0.75], pos: [0.655,0.49,-0.425], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [1.6,0.03,0.05], pos: [0.88,0.48,-0.2], rot: [0,45,0], color: "glow", mirror: true },
      // paniers de roquettes
      { shape: "cylinder", sides: 5, radius: 0.08, height: 0.7, pos: [0.62,0.32,0.1], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 5, radius: 0.08, height: 0.6, pos: [0.92,0.32,-0.2], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "box", size: [0.1,0.1,0.04], pos: [0.62,0.32,0.46], color: "amber", mirror: true },
      { shape: "box", size: [0.1,0.1,0.04], pos: [0.92,0.32,0.11], color: "amber", mirror: true },
      // dérives et tuyère
      { shape: "wedge", size: [0.04,0.4,0.45], pos: [0.24,0.8,-0.75], color: "faction", mirror: true },
      { shape: "box", size: [0.3,0.16,0.04], pos: [0,0.45,-1.01], color: "glow" },
      { shape: "box", size: [0.06,0.04,0.06], pos: [0.22,0.62,0.0], color: "amber", mirror: true },
    ],
  },
  // transport : soute massive à rampe arrière, quatre nacelles carénées à rotor et anneau lumineux (428 triangles)
  transport: {
    parts: [
      { shape: "bevel", size: [1.5,0.8,3.2], pos: [0,0.85,-0.1], color: "dark" },
      { shape: "bevel", size: [1.2,0.2,2.6], pos: [0,1.3,-0.2], color: "faction" },
      { shape: "wedge", size: [1.3,0.5,0.8], pos: [0,0.85,1.9], color: "light" },
      { shape: "wedge", size: [0.9,0.2,0.5], pos: [0,1.18,1.42], color: "glass" },
      { shape: "box", size: [1.0,0.06,0.8], pos: [0,0.42,-1.95], rot: [-25,0,0], color: "metal" },
      { shape: "box", size: [3.0,0.14,0.3], pos: [0,1.0,0.95], color: "metal" },
      { shape: "box", size: [3.0,0.14,0.3], pos: [0,1.0,-0.95], color: "metal" },
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.5,1.42,0.6], color: "amber", mirror: true },
      // nacelles
      { shape: "cylinder", sides: 5, radius: 0.56, height: 0.42, pos: [1.45,1.0,0.95], color: "dark", mirror: true },
      { shape: "cylinder", sides: 5, radius: 0.56, height: 0.42, pos: [1.45,1.0,-0.95], color: "dark", mirror: true },
      { shape: "cylinder", sides: 5, radius: 0.6, height: 0.08, pos: [1.45,1.08,0.95], color: "glow", mirror: true },
      { shape: "cylinder", sides: 5, radius: 0.6, height: 0.08, pos: [1.45,1.08,-0.95], color: "glow", mirror: true },
      { use: "rotor", pos: [1.45,1.28,0.95], scale: 0.55, pivot: "rotor1" },
      { use: "rotor", pos: [-1.45,1.28,0.95], scale: 0.55, pivot: "rotor2" },
      { use: "rotor", pos: [1.45,1.28,-0.95], scale: 0.55, pivot: "rotor3" },
      { use: "rotor", pos: [-1.45,1.28,-0.95], scale: 0.55, pivot: "rotor4" },
    ],
  },
  // gunship : canonnière à deux grands rotors latéraux carénés, mitrailleuses sous les flancs, poutre de queue (444 triangles)
  gunship: {
    parts: [
      { shape: "bevel", size: [1.0,0.7,2.0], pos: [0,0.8,0.2], color: "dark" },
      { shape: "bevel", size: [0.86,0.24,1.5], pos: [0,1.22,0.0], color: "faction" },
      { shape: "wedge", size: [0.9,0.5,0.8], pos: [0,0.8,1.6], color: "light" },
      { shape: "wedge", size: [0.6,0.24,0.5], pos: [0,1.12,1.0], color: "glass" },
      { shape: "box", size: [0.3,0.3,1.8], pos: [0,1.0,-1.6], color: "metal" },
      { shape: "wedge", size: [0.06,0.6,0.5], pos: [0.2,1.36,-2.3], rot: [0,0,-15], color: "faction", mirror: true },
      { shape: "box", size: [1.0,0.05,0.35], pos: [0,1.05,-2.25], color: "light" },
      { shape: "box", size: [2.0,0.12,0.4], pos: [0,0.98,0.1], color: "metal" },
      { shape: "box", size: [0.08,0.06,0.04], pos: [0.3,0.9,1.21], color: "glow", mirror: true },
      // carénages des rotors
      { shape: "cylinder", sides: 8, radius: 0.7, height: 0.12, pos: [1.35,1.0,0.1], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.74, height: 0.04, pos: [1.35,1.0,0.1], color: "glow", mirror: true },
      { use: "rotor", pos: [1.35,1.1,0.1], scale: 0.85, pivot: "rotor" },
      { use: "rotor", pos: [-1.35,1.1,0.1], scale: 0.85, pivot: "rotor2" },
      // mitrailleuses
      { shape: "box", size: [0.2,0.2,0.5], pos: [0.62,0.6,0.6], color: "dark", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.6, pos: [0.62,0.6,1.1], rot: [90,0,0], color: "metal", mirror: true },
    ],
  },
  // bomber : aile volante sombre, panneaux aux couleurs du camp, bords cyan, deux entrées d'air dorsales (328 triangles)
  bomber: {
    parts: [
      { shape: "bevel", size: [1.2,0.4,3.0], pos: [0,0.55,0.2], color: "dark" },
      { shape: "wedge", size: [1.0,0.34,1.0], pos: [0,0.55,2.2], color: "dark" },
      { shape: "wedge", size: [0.5,0.18,0.6], pos: [0,0.82,1.2], color: "glass" },
      { shape: "bevel", size: [0.9,0.16,2.2], pos: [0,0.8,-0.1], color: "faction" },
      { shape: "wedge", size: [0.12,3.6,2.6], pos: [2.3,0.5,-0.3], rot: [0,0,-90], color: "dark", mirror: true },
      { shape: "wedge", size: [0.04,2.8,2.02], pos: [1.9,0.57,-0.59], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "wedge", size: [0.03,1.2,0.87], pos: [3.5,0.6,-1.165], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [0.6,0.03,0.4], pos: [1.0,0.6,-1.1], color: "light", mirror: true },
      { shape: "box", size: [3.4,0.03,0.05], pos: [2.3,0.55,-1.62], color: "glow", mirror: true },
      { shape: "box", size: [4.3,0.03,0.05], pos: [2.3,0.54,-0.28], rot: [0,35.8,0], color: "glow", mirror: true },
      { shape: "box", size: [0.4,0.24,0.8], pos: [0.8,0.7,0.1], color: "metal", mirror: true },
      { shape: "box", size: [0.3,0.1,0.04], pos: [0.8,0.68,-0.31], color: "glow", mirror: true },
      { shape: "box", size: [0.08,0.04,0.08], pos: [1.6,0.6,0.0], color: "amber", mirror: true },
    ],
  },
  // asf : chasseur de supériorité, nez effilé, grandes ailes delta à liserés cyan, dérives inclinées, deux réacteurs (528 triangles)
  asf: {
    parts: [
      { shape: "bevel", size: [0.6,0.36,2.8], pos: [0,0.45,-0.1], color: "dark" },
      { shape: "cone", sides: 8, radius: 0.28, height: 1.3, pos: [0,0.45,1.95], rot: [90,0,0], color: "light" },
      { shape: "bevel", size: [1.1,0.14,1.2], pos: [0,0.52,0.5], color: "light" },
      { shape: "wedge", size: [0.34,0.22,0.8], pos: [0,0.74,0.8], color: "glass" },
      { shape: "bevel", size: [0.7,0.14,1.6], pos: [0,0.66,-0.5], color: "faction" },
      { shape: "wedge", size: [0.08,2.0,2.0], pos: [1.3,0.45,-0.5], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "wedge", size: [0.04,1.1,1.1], pos: [0.85,0.5,-0.95], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [2.6,0.03,0.05], pos: [1.3,0.5,-0.48], rot: [0,45,0], color: "glow", mirror: true },
      { shape: "box", size: [1.8,0.03,0.05], pos: [1.3,0.48,-1.52], color: "glow", mirror: true },
      { shape: "wedge", size: [0.05,0.7,0.6], pos: [0.65,0.5,0.75], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 1.4, pos: [0.36,0.48,-0.75], rot: [90,0,0], color: "metal", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.17, height: 0.04, pos: [0.36,0.48,-1.47], rot: [90,0,0], color: "glow", mirror: true },
      { shape: "box", size: [0.26,0.26,0.4], pos: [0.42,0.46,0.25], color: "black", mirror: true },
      { shape: "wedge", size: [0.05,0.7,0.8], pos: [0.5,0.9,-1.0], rot: [0,0,-20], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.05,0.5], pos: [0.62,1.22,-1.15], rot: [0,0,-20], color: "glow", mirror: true },
      { shape: "wedge", size: [0.05,0.7,0.6], pos: [0.85,0.45,-1.55], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [0.06,0.04,0.06], pos: [0.2,0.64,0.2], color: "amber", mirror: true },
    ],
  },
  // strat_bomber : grand bombardier à ailes en flèche, quatre réacteurs en nacelle, double dérive, nez sombre (628 triangles)
  strat_bomber: {
    parts: [
      { shape: "bevel", size: [1.0,0.7,4.6], pos: [0,0.65,0.2], color: "dark" },
      { shape: "cone", sides: 8, radius: 0.45, height: 1.0, pos: [0,0.62,3.0], rot: [90,0,0], color: "dark" },
      { shape: "wedge", size: [0.6,0.24,0.8], pos: [0,1.04,1.8], color: "glass" },
      { shape: "bevel", size: [0.8,0.16,3.0], pos: [0,1.06,-0.1], color: "faction" },
      { shape: "box", size: [0.06,0.3,3.0], pos: [0.52,0.7,0.2], color: "light", mirror: true },
      { shape: "wedge", size: [0.12,2.9,2.4], pos: [1.95,0.6,-0.4], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "wedge", size: [0.04,1.6,1.32], pos: [1.3,0.67,-0.94], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [3.6,0.03,0.05], pos: [1.95,0.65,-0.38], rot: [0,39.6,0], color: "glow", mirror: true },
      // réacteurs
      { shape: "cylinder", sides: 8, radius: 0.3, height: 1.3, pos: [1.3,0.4,-0.4], rot: [90,0,0], color: "light", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 1.3, pos: [2.4,0.4,-0.95], rot: [90,0,0], color: "light", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.32, height: 0.22, pos: [1.3,0.4,-0.6], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.32, height: 0.22, pos: [2.4,0.4,-1.15], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.22, height: 0.04, pos: [1.3,0.4,-1.06], rot: [90,0,0], color: "glow", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.22, height: 0.04, pos: [2.4,0.4,-1.61], rot: [90,0,0], color: "glow", mirror: true },
      // queue
      { shape: "wedge", size: [0.06,0.9,0.9], pos: [0.42,1.4,-1.75], rot: [0,0,-12], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.05,0.6], pos: [0.5,1.78,-1.95], rot: [0,0,-12], color: "glow", mirror: true },
      { shape: "wedge", size: [0.06,1.0,0.8], pos: [1.0,0.72,-1.85], rot: [0,0,-90], color: "light", mirror: true },
      { shape: "box", size: [0.08,0.06,0.08], pos: [1.8,0.36,-0.2], color: "amber", mirror: true },
    ],
  },
  // frigate : coque effilée à liseré cyan, tourelle double à l'avant, passerelle aux couleurs du camp, petite tourelle arrière (444 triangles)
  frigate: {
    parts: [
      { shape: "bevel", size: [1.3,0.45,3.2], pos: [0,0.25,-0.45], color: "dark" },
      { shape: "wedge", size: [0.45,0.65,1.2], pos: [0.325,0.25,1.75], rot: [0,0,-90], color: "dark", mirror: true },
      { shape: "box", size: [1.16,0.1,2.9], pos: [0,0.5,-0.45], color: "metal" },
      { shape: "wedge", size: [0.1,0.58,1.1], pos: [0.29,0.5,1.55], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.04,0.16,2.4], pos: [0.66,0.36,-0.4], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.04,2.2], pos: [0.67,0.24,-0.4], color: "glow", mirror: true },
      // passerelle
      { shape: "bevel", size: [0.9,0.45,1.0], pos: [0,0.78,-0.5], color: "faction" },
      { shape: "bevel", size: [0.7,0.3,0.5], pos: [0,1.12,-0.4], color: "dark" },
      { shape: "box", size: [0.5,0.05,0.03], pos: [0,1.16,-0.14], color: "glow" },
      { shape: "box", size: [0.08,0.5,0.08], pos: [0,1.5,-0.55], color: "metal" },
      // tourelles
      { shape: "cylinder", sides: 8, radius: 0.36, height: 0.14, pos: [0,0.6,1.0], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [0.5,0.24,0.5], pos: [0,0.76,0.98], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.04, height: 0.6, pos: [0.1,0.77,1.5], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.3, height: 0.14, pos: [0,0.6,-1.6], color: "metal", pivot: "tourelle2" },
      { shape: "box", size: [0.44,0.22,0.44], pos: [0,0.76,-1.6], color: "light", parent: "tourelle2" },
      { shape: "cylinder", sides: 5, radius: 0.04, height: 0.5, pos: [0,0.78,-1.2], rot: [90,0,0], color: "dark", parent: "tourelle2" },
    ],
  },
  // submarine : coque fuselée aplatie, kiosque à périscopes, tubes lance-missiles, gouvernails arrière (344 triangles)
  submarine: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 0.5, height: 3.2, pos: [0,0.4,-0.1], rot: [90,0,0], scale: [1.2,1,0.7], color: "dark" },
      { shape: "cone", sides: 8, radius: 0.5, height: 0.9, pos: [0,0.4,1.95], rot: [90,0,0], scale: [1.2,1,0.7], color: "light" },
      { shape: "cone", sides: 8, radius: 0.5, height: 0.7, pos: [0,0.4,-2.05], rot: [-90,0,0], scale: [1.2,1,0.7], color: "dark" },
      { shape: "bevel", size: [0.7,0.16,2.6], pos: [0,0.7,-0.1], color: "faction" },
      { shape: "box", size: [0.06,0.2,2.2], pos: [0.56,0.45,0.1], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.04,2.4], pos: [0.59,0.34,0.0], color: "glow", mirror: true },
      // kiosque
      { shape: "bevel", size: [0.4,0.5,0.9], pos: [0,1.0,0.3], color: "dark" },
      { shape: "box", size: [0.36,0.05,0.6], pos: [0,1.27,0.32], color: "light" },
      { shape: "box", size: [0.3,0.05,0.03], pos: [0,1.12,0.76], color: "glow" },
      { shape: "box", size: [0.05,0.35,0.05], pos: [0.07,1.42,0.2], color: "metal", mirror: true },
      { shape: "box", size: [0.06,0.06,0.06], pos: [0,1.32,0.55], color: "amber" },
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.32, pos: [0.15,0.86,-0.55], color: "metal", mirror: true },
      // gouvernails
      { shape: "box", size: [1.4,0.05,0.35], pos: [0,0.4,-1.8], color: "dark" },
      { shape: "wedge", size: [0.05,0.5,0.5], pos: [0,0.75,-1.8], color: "faction" },
      { shape: "box", size: [1.0,0.04,0.2], pos: [0,0.55,0.9], color: "dark" },
    ],
  },
  // destroyer : grande coque à liseré cyan, deux tourelles doubles superposées à l'avant, château et mât, tourelle arrière (748 triangles)
  destroyer: {
    parts: [
      { shape: "bevel", size: [1.7,0.55,4.6], pos: [0,0.3,-0.9], color: "dark" },
      { shape: "wedge", size: [0.55,0.85,1.9], pos: [0.425,0.3,2.35], rot: [0,0,-90], color: "dark", mirror: true },
      { shape: "box", size: [1.6,0.1,4.4], pos: [0,0.6,-0.9], color: "metal" },
      { shape: "box", size: [0.3,0.03,3.0], pos: [0.55,0.665,-0.3], color: "faction", mirror: true },
      { shape: "wedge", size: [0.1,0.78,1.8], pos: [0.39,0.6,2.3], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.06,0.22,3.6], pos: [0.86,0.42,-0.8], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.05,3.8], pos: [0.87,0.27,-0.7], color: "glow", mirror: true },
      { shape: "box", size: [0.5,0.04,1.4], pos: [0.45,0.67,-2.1], color: "light", mirror: true },
      // château
      { shape: "bevel", size: [1.2,0.6,1.5], pos: [0,0.95,-0.7], color: "light" },
      { shape: "bevel", size: [0.9,0.4,1.0], pos: [0,1.42,-0.75], color: "dark" },
      { shape: "box", size: [0.7,0.06,0.03], pos: [0,1.5,-0.24], color: "glow" },
      { shape: "box", size: [0.1,0.8,0.1], pos: [0,2.0,-0.9], color: "metal" },
      { shape: "box", size: [0.6,0.05,0.08], pos: [0,2.2,-0.9], color: "metal" },
      { shape: "sphere", radius: 0.15, pos: [0,1.72,-1.1], color: "light" },
      { shape: "box", size: [0.08,0.06,0.04], pos: [0.45,1.1,0.06], color: "amber", mirror: true },
      { shape: "box", size: [0.22,0.18,0.5], pos: [0.7,0.75,-0.7], color: "dark", mirror: true },
      // tourelles avant
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.12, pos: [0,0.66,1.7], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [0.66,0.3,0.7], pos: [0,0.84,1.65], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.46,0.04,0.46], pos: [0,1.0,1.6], color: "faction", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.9, pos: [0.12,0.86,2.3], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.42, height: 0.14, pos: [0,0.76,0.6], color: "metal", pivot: "tourelle2" },
      { shape: "bevel", size: [0.6,0.28,0.66], pos: [0,0.96,0.55], color: "light", parent: "tourelle2" },
      { shape: "box", size: [0.42,0.04,0.42], pos: [0,1.11,0.5], color: "faction", parent: "tourelle2" },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.85, pos: [0.11,0.98,1.15], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle2" },
      // tourelle arrière (fixe)
      { shape: "cylinder", sides: 6, radius: 0.4, height: 0.12, pos: [0,0.66,-2.6], color: "metal" },
      { shape: "box", size: [0.55,0.26,0.6], pos: [0,0.84,-2.65], color: "light" },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.8, pos: [0.11,0.86,-3.2], rot: [90,0,0], color: "dark", mirror: true },
    ],
  },
  // missile_cruiser : grande coque, bloc de lancement vertical quadrillé, château à radar tournant, canon avant (784 triangles)
  missile_cruiser: {
    parts: [
      { shape: "bevel", size: [1.8,0.55,4.2], pos: [0,0.3,-0.8], color: "dark" },
      { shape: "wedge", size: [0.55,0.9,1.9], pos: [0.45,0.3,2.25], rot: [0,0,-90], color: "dark", mirror: true },
      { shape: "box", size: [1.7,0.1,4.0], pos: [0,0.6,-0.8], color: "metal" },
      { shape: "box", size: [0.22,0.03,3.6], pos: [0.7,0.665,-0.8], color: "faction", mirror: true },
      { shape: "wedge", size: [0.1,0.82,1.8], pos: [0.41,0.6,2.2], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.1,0.28,3.4], pos: [0.9,0.45,-0.7], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.05,3.6], pos: [0.96,0.3,-0.6], color: "glow", mirror: true },
      // bloc de lancement vertical
      { shape: "bevel", size: [1.2,0.3,1.4], pos: [0,0.75,0.7], color: "dark" },
      { shape: "box", size: [1.1,0.04,1.3], pos: [0,0.91,0.7], color: "light" },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.13,0.94,0.25], color: "black", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.39,0.94,0.25], color: "black", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.13,0.94,0.55], color: "black", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.39,0.94,0.55], color: "black", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.13,0.94,0.85], color: "black", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.39,0.94,0.85], color: "amber", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.13,0.94,1.15], color: "black", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.39,0.94,1.15], color: "black", mirror: true },
      { shape: "bevel", size: [1.0,0.26,0.9], pos: [0,0.72,-2.3], color: "dark" },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.2,0.86,-2.15], color: "red", mirror: true },
      { shape: "box", size: [0.2,0.03,0.24], pos: [0.2,0.86,-2.45], color: "red", mirror: true },
      // château et radar
      { shape: "bevel", size: [1.2,0.6,1.3], pos: [0,0.95,-1.1], color: "light" },
      { shape: "bevel", size: [0.8,0.4,0.8], pos: [0,1.45,-1.15], color: "dark" },
      { shape: "box", size: [0.6,0.06,0.03], pos: [0,1.52,-0.74], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.04], pos: [0.45,1.1,-0.44], color: "amber", mirror: true },
      { shape: "box", size: [0.1,0.5,0.1], pos: [0,1.9,-1.2], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.4, radiusTop: 0.1, height: 0.08, pos: [0,2.18,-1.2], color: "light", pivot: "radar" },
      // canon avant
      { shape: "cylinder", sides: 8, radius: 0.36, height: 0.12, pos: [0,0.66,1.85], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [0.5,0.26,0.55], pos: [0,0.84,1.82], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.8, pos: [0,0.86,2.4], rot: [90,0,0], color: "dark", parent: "tourelle" },
    ],
  },
  // guardian : char moyen de ligne, glacis avant très épais couvert de blindage réactif, tourelle trapue à canon moyen (592 triangles)
  guardian: {
    parts: [
      ...chenille(1.02,0.5,2.6,0.52),
      { shape: "box", size: [0.6,0.1,2.45], pos: [1.02,0.57,-0.05], color: "light", mirror: true },
      { shape: "bevel", size: [1.56,0.46,2.4], pos: [0,0.62,-0.2], color: "dark" },
      { shape: "box", size: [1.2,0.08,0.55], pos: [0,0.88,-1.1], color: "metal" },
      { shape: "box", size: [0.8,0.03,0.05], pos: [0,0.93,-1.15], color: "glow" },
      // glacis épais et blindage réactif (avant et avant des flancs)
      { shape: "wedge", size: [2.1,0.62,0.9], pos: [0,0.62,1.35], color: "dark" },
      incl([0.26,0.93,0.9], -34.6, 0.3, 0.045, { shape: "box", size: [0.4,0.09,0.32], color: "light", mirror: true }),
      incl([0.72,0.93,0.9], -34.6, 0.3, 0.045, { shape: "box", size: [0.4,0.09,0.32], color: "light", mirror: true }),
      incl([0.26,0.93,0.9], -34.6, 0.74, 0.045, { shape: "box", size: [0.4,0.09,0.32], color: "light", mirror: true }),
      incl([0.72,0.93,0.9], -34.6, 0.74, 0.045, { shape: "box", size: [0.4,0.09,0.32], color: "light", mirror: true }),
      { shape: "box", size: [0.06,0.3,1.15], pos: [1.33,0.42,0.68], color: "dark", mirror: true },
      { shape: "box", size: [0.07,0.2,0.3], pos: [1.395,0.44,0.45], color: "metal", mirror: true },
      { shape: "box", size: [0.07,0.2,0.3], pos: [1.395,0.44,0.95], color: "metal", mirror: true },
      { shape: "box", size: [0.12,0.06,0.04], pos: [0.85,0.42,1.68], color: "amber", mirror: true },
      // tourelle trapue
      { shape: "bevel", size: [1.3,0.44,1.3], pos: [0,1.08,-0.25], color: "faction", pivot: "tourelle" },
      { shape: "wedge", size: [1.1,0.3,0.38], pos: [0,1.02,0.58], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.12,0.34,1.0], pos: [0.68,1.06,-0.3], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.7], pos: [0.745,1.1,-0.3], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.3,0.3,0.34], pos: [0,1.08,0.72], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 1.3, pos: [0,1.08,1.5], rot: [90,0,0], color: "metal", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.15, height: 0.26, pos: [0,1.08,2.2], rot: [90,0,0], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.32,1.32,0.2], color: "amber", parent: "tourelle" },
    ],
  },
  // rocket_battery : porteur à six roues, cabine avant, caisson lance-roquettes incliné à 4 x 4 tubes sur affût tournant (592 triangles)
  rocket_battery: {
    parts: [
      roues(0.72,0.32,1.0,0.32,0.28,6),
      roues(0.72,0.32,0.05,0.32,0.28,6),
      roues(0.72,0.32,-0.9,0.32,0.28,6),
      { shape: "bevel", size: [1.34,0.32,3.0], pos: [0,0.56,0], color: "dark" },
      { shape: "bevel", size: [1.36,0.6,0.85], pos: [0,0.98,1.05], color: "light" },
      { shape: "box", size: [1.06,0.2,0.04], pos: [0,1.1,1.48], color: "glass" },
      { shape: "box", size: [0.06,0.1,0.03], pos: [0.54,0.8,1.48], color: "glow", mirror: true },
      { shape: "box", size: [1.24,0.2,1.9], pos: [0,0.82,-0.45], color: "faction" },
      { shape: "box", size: [0.03,0.05,2.6], pos: [0.68,0.6,0], color: "glow", mirror: true },
      // affût (pivot) et caisson à roquettes
      { shape: "box", size: [0.8,0.2,1.0], pos: [0,1.02,-0.65], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.1,0.36,0.1], pos: [0.4,1.28,-0.5], color: "light", mirror: true, parent: "tourelle" },
      incl([0,1.2,-1.05], 24, 0.625, 0.37, { shape: "box", size: [1.2,0.74,1.25], color: "faction", parent: "tourelle" }),
      incl([0.62,1.2,-1.05], 24, 0.625, 0.37, { shape: "box", size: [0.06,0.6,1.1], color: "light", mirror: true, parent: "tourelle" }),
      incl([0,1.2,-1.05], 24, 1.265, 0.37, { shape: "box", size: [1.14,0.7,0.03], color: "light", parent: "tourelle" }),
      ...[0.12, 0.29, 0.46, 0.63].flatMap((h) =>
        [0.15, 0.44].map((x) => incl([x,1.2,-1.05], 24, 1.29, h, { shape: "box", size: [0.2,0.13,0.05], color: "black", mirror: true, parent: "tourelle" })),
      ),
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.3,1.15,-0.2], color: "amber", parent: "tourelle" },
    ],
  },
  // commando : robot furtif élancé et anguleux, sombre à filets cyan, visière, charges explosives dans le dos, fusil fin (404 triangles)
  commando: {
    parts: [
      // jambes articulées (pivots à la hanche) et bassin
      { shape: "box", size: [0.1,0.08,0.12], pos: [0.11,0.74,0], color: "dark", pivot: "jambe_d" },
      { shape: "box", size: [0.1,0.36,0.13], pos: [0.11,0.55,-0.01], color: "black", parent: "jambe_d" },
      { shape: "box", size: [0.12,0.36,0.16], pos: [0.11,0.22,0.01], color: "dark", parent: "jambe_d" },
      { shape: "box", size: [0.025,0.2,0.02], pos: [0.11,0.25,0.095], color: "glow", parent: "jambe_d" },
      { shape: "wedge", size: [0.15,0.08,0.28], pos: [0.11,0.04,0.05], color: "black", parent: "jambe_d" },
      { shape: "box", size: [0.1,0.08,0.12], pos: [-0.11,0.74,0], color: "dark", pivot: "jambe_g" },
      { shape: "box", size: [0.1,0.36,0.13], pos: [-0.11,0.55,-0.01], color: "black", parent: "jambe_g" },
      { shape: "box", size: [0.12,0.36,0.16], pos: [-0.11,0.22,0.01], color: "dark", parent: "jambe_g" },
      { shape: "box", size: [0.025,0.2,0.02], pos: [-0.11,0.25,0.095], color: "glow", parent: "jambe_g" },
      { shape: "wedge", size: [0.15,0.08,0.28], pos: [-0.11,0.04,0.05], color: "black", parent: "jambe_g" },
      { shape: "box", size: [0.3,0.1,0.18], pos: [0,0.77,0], color: "dark" },
      // haut du corps (pivot torse)
      { shape: "bevel", size: [0.4,0.36,0.24], pos: [0,1.0,0], color: "dark", pivot: "torse" },
      { shape: "box", size: [0.025,0.18,0.02], pos: [0.1,1.0,0.125], color: "glow", mirror: true, parent: "torse" },
      { shape: "box", size: [0.14,0.08,0.22], pos: [0.26,1.16,0], rot: [0,0,-15], color: "faction", mirror: true, parent: "torse" },
      { shape: "box", size: [0.07,0.28,0.09], pos: [0.27,0.98,0], color: "black", mirror: true, parent: "torse" },
      { shape: "box", size: [0.14,0.15,0.17], pos: [0,1.27,0.01], color: "dark", parent: "torse" },
      { shape: "box", size: [0.12,0.035,0.02], pos: [0,1.29,0.1], color: "glow", parent: "torse" },
      { shape: "wedge", size: [0.05,0.07,0.2], pos: [0,1.38,-0.01], color: "black", parent: "torse" },
      // fusil fin tenu à deux mains
      { shape: "box", size: [0.07,0.07,0.24], pos: [0.25,0.86,0.12], color: "black", parent: "torse" },
      { shape: "box", size: [0.07,0.07,0.26], pos: [-0.16,0.9,0.18], rot: [0,35,0], color: "black", parent: "torse" },
      { shape: "box", size: [0.045,0.07,0.62], pos: [0.17,0.9,0.36], color: "dark", parent: "torse" },
      { shape: "box", size: [0.025,0.025,0.26], pos: [0.17,0.91,0.8], color: "metal", parent: "torse" },
      { shape: "box", size: [0.025,0.03,0.12], pos: [0.17,0.955,0.34], color: "glow", parent: "torse" },
      // sac de charges explosives
      { shape: "box", size: [0.28,0.26,0.1], pos: [0,1.02,-0.17], color: "dark", parent: "torse" },
      { shape: "box", size: [0.08,0.11,0.07], pos: [0.09,1.0,-0.255], color: "hazard", mirror: true, parent: "torse" },
      { shape: "box", size: [0.08,0.11,0.07], pos: [0,1.0,-0.255], color: "amber", parent: "torse" },
      { shape: "box", size: [0.015,0.25,0.015], pos: [-0.1,1.27,-0.2], color: "metal", parent: "torse" },
    ],
  },
  // jammer : véhicule à quatre roues, mât d'antennes, panneau de brouillage orientable à grille cyan (584 triangles)
  jammer: {
    parts: [
      roues(0.76,0.34,0.75,0.34,0.3),
      roues(0.76,0.34,-0.75,0.34,0.3),
      { shape: "bevel", size: [1.3,0.38,2.3], pos: [0,0.58,0], color: "dark" },
      { shape: "bevel", size: [1.42,0.3,0.8], pos: [0,0.84,0.72], color: "light" },
      { shape: "box", size: [1.0,0.12,0.04], pos: [0,0.88,1.12], color: "glass" },
      { shape: "box", size: [1.2,0.26,1.3], pos: [0,0.9,-0.45], color: "faction" },
      { shape: "box", size: [0.03,0.05,1.9], pos: [0.71,0.64,0], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.5,0.72,1.16], color: "amber", mirror: true },
      // mât d'antennes (arrière gauche)
      { shape: "box", size: [0.1,1.4,0.1], pos: [-0.45,1.73,-0.9], color: "metal" },
      { shape: "box", size: [0.7,0.04,0.04], pos: [-0.45,2.0,-0.9], color: "light" },
      { shape: "box", size: [0.46,0.04,0.04], pos: [-0.45,2.3,-0.9], color: "light" },
      { shape: "sphere", radius: 0.07, pos: [-0.45,2.48,-0.9], color: "glow" },
      { use: "antenne", pos: [-0.8,2.0,-0.9], scale: 0.4 },
      { use: "antenne", pos: [-0.1,2.0,-0.9], scale: 0.4 },
      { use: "antenne", pos: [0.45,1.03,-0.95], scale: 0.7 },
      // panneau de brouillage orientable (pivot)
      { shape: "cylinder", sides: 6, radius: 0.3, height: 0.14, pos: [0.15,1.1,-0.2], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.12,0.42,0.12], pos: [0.15,1.38,-0.2], color: "dark", parent: "tourelle" },
      incl([0.15,1.85,-0.15], 20, -0.05, 0, { shape: "box", size: [1.06,0.72,0.04], color: "faction", parent: "tourelle" }),
      incl([0.15,1.85,-0.15], 20, 0, 0, { shape: "box", size: [0.98,0.64,0.06], color: "dark", parent: "tourelle" }),
      incl([0.15,1.85,-0.15], 20, 0.035, -0.2, { shape: "box", size: [0.86,0.03,0.02], color: "glow", parent: "tourelle" }),
      incl([0.15,1.85,-0.15], 20, 0.035, 0, { shape: "box", size: [0.86,0.03,0.02], color: "glow", parent: "tourelle" }),
      incl([0.15,1.85,-0.15], 20, 0.035, 0.2, { shape: "box", size: [0.86,0.03,0.02], color: "glow", parent: "tourelle" }),
      incl([-0.15,1.85,-0.15], 20, 0.035, 0, { shape: "box", size: [0.03,0.56,0.02], color: "glow", parent: "tourelle" }),
      incl([0.45,1.85,-0.15], 20, 0.035, 0, { shape: "box", size: [0.03,0.56,0.02], color: "glow", parent: "tourelle" }),
    ],
  },
  // deploy_turret : forteresse chenillée, quatre bras stabilisateurs repliés à vérins, grosse tourelle à double canon plasma (620 triangles)
  deploy_turret: {
    parts: [
      ...chenille(1.1,0.56,2.8,0.56),
      { shape: "bevel", size: [1.8,0.52,2.7], pos: [0,0.66,0], color: "dark" },
      { shape: "box", size: [0.62,0.1,2.5], pos: [1.1,0.61,0], color: "light", mirror: true },
      { shape: "wedge", size: [1.7,0.3,0.5], pos: [0,0.68,1.55], color: "light" },
      // bras stabilisateurs repliés le long des flancs, vérins et patins relevés
      { shape: "box", size: [0.14,0.16,1.0], pos: [1.48,0.76,0.62], color: "metal", mirror: true },
      { shape: "box", size: [0.14,0.16,1.0], pos: [1.48,0.76,-0.62], color: "metal", mirror: true },
      { shape: "box", size: [0.07,0.07,0.8], pos: [1.48,0.88,0.55], color: "light", mirror: true },
      { shape: "box", size: [0.07,0.07,0.8], pos: [1.48,0.88,-0.55], color: "light", mirror: true },
      { shape: "box", size: [0.1,0.42,0.42], pos: [1.5,0.64,1.2], color: "hazard", mirror: true },
      { shape: "box", size: [0.1,0.42,0.42], pos: [1.5,0.64,-1.2], color: "hazard", mirror: true },
      // tourelle à double canon plasma
      { shape: "cylinder", sides: 6, radius: 0.85, height: 0.18, pos: [0,1.01,-0.1], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [1.56,0.62,1.7], pos: [0,1.4,-0.2], color: "faction", parent: "tourelle" },
      { shape: "wedge", size: [1.44,0.4,0.42], pos: [0,1.3,0.86], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.03,0.05,1.0], pos: [0.795,1.45,-0.25], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.32,0.32,0.6], pos: [0.4,1.5,0.9], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.1, height: 1.5, pos: [0.4,1.5,1.9], rot: [90,0,0], color: "light", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.15, height: 0.07, pos: [0.4,1.5,1.5], rot: [90,0,0], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.24, pos: [0.4,1.5,2.65], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.08,0.05,0.05], pos: [-0.4,1.74,0.2], color: "amber", parent: "tourelle" },
    ],
  },
  // stealth_bomber : aile volante triangulaire très plate à facettes, noire, fine bande aux couleurs du camp, tuyères encastrées (264 triangles)
  stealth_bomber: {
    parts: [
      // aile en delta : bord d'attaque net, panneau intérieur sombre, bande du camp
      { shape: "wedge", size: [0.12,3.3,3.4], pos: [1.65,0.5,-0.3], rot: [0,0,-90], color: "black", mirror: true },
      { shape: "wedge", size: [0.06,2.8,2.885], pos: [1.4,0.59,-0.558], rot: [0,0,-90], color: "dark", mirror: true },
      { shape: "box", size: [4.65,0.02,0.04], pos: [1.66,0.565,-0.32], rot: [0,45.85,0], color: "metal", mirror: true },
      { shape: "box", size: [3.4,0.02,0.05], pos: [1.343,0.625,-0.613], rot: [0,45.85,0], color: "faction", mirror: true },
      // dos à facettes, verrière
      { shape: "wedge", size: [0.8,0.22,1.4], pos: [0,0.67,0.0], color: "dark" },
      { shape: "wedge", size: [0.8,0.22,1.1], pos: [0,0.67,-1.25], rot: [0,180,0], color: "dark" },
      incl([0.1,0.78,-0.7], -8.93, 0.95, 0.012, { shape: "box", size: [0.14,0.02,0.14], color: "glass", mirror: true }),
      // entrées d'air et tuyères encastrées
      { shape: "box", size: [0.36,0.05,0.16], pos: [0.65,0.63,-0.2], color: "black", mirror: true },
      { shape: "box", size: [0.5,0.07,0.3], pos: [0.65,0.62,-1.82], color: "black", mirror: true },
      { shape: "box", size: [0.4,0.04,0.04], pos: [0.65,0.62,-1.96], color: "glow", mirror: true },
      { shape: "wedge", size: [0.7,0.06,0.4], pos: [1.6,0.62,-1.78], rot: [0,180,0], color: "dark", mirror: true },
      { shape: "box", size: [0.06,0.04,0.06], pos: [3.05,0.58,-1.9], color: "amber", mirror: true },
    ],
  },
  // ew_plane : avion de guerre électronique à ailes droites, grand radôme tournant sur le dos, antennes ventrales, deux turbopropulseurs (472 triangles)
  ew_plane: {
    parts: [
      { shape: "bevel", size: [0.6,0.52,3.4], pos: [0,0.5,-0.1], color: "dark" },
      { shape: "cone", sides: 8, radius: 0.28, height: 0.7, pos: [0,0.48,1.95], rot: [90,0,0], color: "light" },
      { shape: "wedge", size: [0.42,0.18,0.6], pos: [0,0.85,1.15], color: "glass" },
      { shape: "box", size: [0.44,0.1,2.0], pos: [0,0.79,-0.4], color: "faction" },
      // ailes droites et turbopropulseurs
      { shape: "box", size: [5.2,0.08,0.72], pos: [0,0.62,0.25], color: "faction" },
      { shape: "box", size: [0.5,0.1,0.74], pos: [2.4,0.62,0.25], color: "light", mirror: true },
      { shape: "box", size: [1.8,0.03,0.04], pos: [1.3,0.62,-0.12], color: "glow", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.17, height: 1.1, pos: [1.0,0.55,0.35], rot: [90,0,0], color: "light", mirror: true },
      { shape: "cone", sides: 6, radius: 0.12, height: 0.24, pos: [1.0,0.55,1.02], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "box", size: [0.2,0.2,0.04], pos: [1.0,0.55,-0.22], color: "glow", mirror: true },
      // radôme tournant sur pylônes
      { shape: "box", size: [0.08,0.4,0.12], pos: [0.12,0.96,-0.5], color: "metal", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.9, height: 0.16, pos: [0,1.2,-0.5], color: "light", pivot: "radar" },
      { shape: "cylinder", sides: 8, radius: 0.93, height: 0.04, pos: [0,1.2,-0.5], color: "glow", parent: "radar" },
      { shape: "box", size: [1.5,0.03,0.26], pos: [0,1.29,-0.5], color: "dark", parent: "radar" },
      // empennage
      { shape: "box", size: [1.8,0.06,0.45], pos: [0,0.72,-1.65], color: "light" },
      { shape: "wedge", size: [0.06,0.6,0.5], pos: [0.9,1.05,-1.65], color: "faction", mirror: true },
      // antennes ventrales et nacelle de brouillage
      { shape: "box", size: [0.34,0.12,0.9], pos: [0,0.2,0.1], color: "dark" },
      { shape: "box", size: [0.03,0.04,0.7], pos: [0.18,0.2,0.1], color: "glow", mirror: true },
      { shape: "box", size: [0.03,0.26,0.16], pos: [0,0.14,0.85], color: "metal" },
      { shape: "box", size: [0.03,0.26,0.14], pos: [0.2,0.14,-1.0], rot: [0,0,20], color: "metal", mirror: true },
      { shape: "box", size: [0.06,0.04,0.06], pos: [2.6,0.62,0.3], color: "amber", mirror: true },
    ],
  },
  // heavy_transport : grand transport volant blindé, soute carrée à rampe, quatre nacelles à rotors carénés, tourelle antiaérienne dorsale (596 triangles)
  heavy_transport: {
    parts: [
      { shape: "bevel", size: [2.0,1.1,3.6], pos: [0,1.0,-0.2], color: "dark" },
      { shape: "bevel", size: [1.6,0.2,3.0], pos: [0,1.6,-0.3], color: "faction" },
      { shape: "wedge", size: [1.8,0.7,0.9], pos: [0,0.9,2.05], color: "light" },
      { shape: "wedge", size: [1.2,0.3,0.5], pos: [0,1.3,1.75], color: "glass" },
      { shape: "box", size: [1.4,0.08,1.0], pos: [0,0.48,-2.35], rot: [-25,0,0], color: "metal" },
      { shape: "box", size: [0.12,0.7,2.8], pos: [1.04,1.0,-0.2], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.05,2.4], pos: [1.105,1.1,-0.2], color: "glow", mirror: true },
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.6,1.72,0.9], color: "amber", mirror: true },
      // poutres et nacelles carénées
      { shape: "box", size: [4.2,0.18,0.4], pos: [0,1.1,1.1], color: "metal" },
      { shape: "box", size: [4.2,0.18,0.4], pos: [0,1.1,-1.3], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.72, height: 0.5, pos: [2.0,1.1,1.1], color: "dark", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.72, height: 0.5, pos: [2.0,1.1,-1.3], color: "dark", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.76, height: 0.08, pos: [2.0,1.2,1.1], color: "glow", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.76, height: 0.08, pos: [2.0,1.2,-1.3], color: "glow", mirror: true },
      { use: "rotor", pos: [2.0,1.42,1.1], scale: 0.75, pivot: "rotor1" },
      { use: "rotor", pos: [-2.0,1.42,1.1], scale: 0.75, pivot: "rotor2" },
      { use: "rotor", pos: [2.0,1.42,-1.3], scale: 0.75, pivot: "rotor3" },
      { use: "rotor", pos: [-2.0,1.42,-1.3], scale: 0.75, pivot: "rotor4" },
      // tourelle antiaérienne dorsale
      { shape: "cylinder", sides: 6, radius: 0.32, height: 0.12, pos: [0,1.76,0.5], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.44,0.26,0.44], pos: [0,1.94,0.48], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.16,0.04,0.03], pos: [0,1.98,0.71], color: "glow", parent: "tourelle" },
      { shape: "cylinder", sides: 5, radius: 0.04, height: 0.6, pos: [0.1,1.96,0.95], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" },
    ],
  },
  // carrier : porte-avions, long pont d'envol balisé (ambre et cyan), îlot à tribord avec radar, avions garés, tourelle antiaérienne (672 triangles)
  carrier: {
    parts: [
      { shape: "bevel", size: [2.0,0.6,5.4], pos: [0,0.3,-0.9], color: "dark" },
      { shape: "wedge", size: [0.6,1.0,1.8], pos: [0.5,0.3,2.7], rot: [0,0,-90], color: "dark", mirror: true },
      { shape: "box", size: [0.06,0.22,5.0], pos: [1.0,0.4,-0.9], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.05,5.2], pos: [1.02,0.12,-0.8], color: "glow", mirror: true },
      // pont d'envol débordant et marquages de piste
      { shape: "box", size: [2.5,0.1,7.0], pos: [0,0.66,-0.25], color: "metal" },
      { shape: "box", size: [0.06,0.14,6.8], pos: [1.25,0.66,-0.25], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.02,6.2], pos: [0.45,0.72,-0.3], color: "glow", mirror: true },
      ...[2.7, 1.7, 0.7, -0.3, -1.3, -2.3].map((z): Part => ({ shape: "box", size: [0.06,0.02,0.45], pos: [0,0.72,z], color: "amber" })),
      { shape: "box", size: [0.8,0.02,0.06], pos: [0,0.72,-3.3], color: "amber" },
      { shape: "box", size: [0.8,0.02,0.06], pos: [0,0.72,-3.48], color: "amber" },
      // îlot à tribord, radar tournant
      { shape: "bevel", size: [0.55,0.75,1.6], pos: [1.0,1.08,-0.6], color: "light" },
      { shape: "bevel", size: [0.46,0.4,0.9], pos: [1.0,1.66,-0.5], color: "faction" },
      { shape: "box", size: [0.38,0.06,0.03], pos: [1.0,1.7,-0.04], color: "glow" },
      { shape: "box", size: [0.3,0.4,0.36], pos: [1.0,1.66,-1.2], color: "dark" },
      { shape: "box", size: [0.08,0.7,0.08], pos: [1.0,2.2,-0.65], color: "metal" },
      { shape: "box", size: [0.5,0.05,0.07], pos: [1.0,2.32,-0.65], color: "metal" },
      { shape: "box", size: [0.6,0.06,0.12], pos: [1.0,2.58,-0.65], color: "light", pivot: "radar" },
      { shape: "sphere", radius: 0.16, pos: [1.0,1.98,-0.85], color: "light" },
      { shape: "box", size: [0.08,0.06,0.04], pos: [1.0,1.25,0.21], color: "amber" },
      // avions garés à bâbord
      ...[2.5, 1.6, 0.7].flatMap((z): Part[] => [
        { shape: "box", size: [0.18,0.1,0.75], pos: [-0.85,0.77,z], color: "light" },
        { shape: "box", size: [0.74,0.04,0.22], pos: [-0.85,0.76,z - 0.05], color: "faction" },
        { shape: "box", size: [0.3,0.04,0.1], pos: [-0.85,0.79,z - 0.33], color: "light" },
      ]),
      // tourelle antiaérienne (tribord avant) et affût fixe arrière
      { shape: "cylinder", sides: 6, radius: 0.22, height: 0.1, pos: [0.9,0.76,2.4], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.3,0.18,0.3], pos: [0.9,0.9,2.38], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 5, radius: 0.03, height: 0.45, pos: [0.84,0.92,2.7], rot: [90,0,0], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 5, radius: 0.03, height: 0.45, pos: [0.96,0.92,2.7], rot: [90,0,0], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 0.1, pos: [-0.95,0.76,-3.3], color: "metal" },
      { shape: "box", size: [0.24,0.16,0.24], pos: [-0.95,0.88,-3.3], color: "light" },
    ],
  },
  // railgun_ship : cuirassé, deux tourelles avant à canons de rail jumeaux très longs cerclés de bobines cyan, château central massif (892 triangles)
  railgun_ship: {
    parts: [
      { shape: "bevel", size: [2.0,0.6,5.0], pos: [0,0.3,-1.0], color: "dark" },
      { shape: "wedge", size: [0.6,1.0,2.1], pos: [0.5,0.3,2.55], rot: [0,0,-90], color: "dark", mirror: true },
      { shape: "box", size: [1.9,0.1,4.8], pos: [0,0.65,-1.0], color: "metal" },
      { shape: "wedge", size: [0.1,0.92,2.0], pos: [0.46,0.65,2.5], rot: [0,0,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.08,0.26,4.2], pos: [1.0,0.42,-0.9], color: "light", mirror: true },
      { shape: "box", size: [0.03,0.05,4.6], pos: [1.02,0.25,-0.9], color: "glow", mirror: true },
      // château central massif
      { shape: "bevel", size: [1.5,0.7,2.0], pos: [0,1.05,-1.1], color: "light" },
      { shape: "bevel", size: [1.2,0.5,1.4], pos: [0,1.65,-1.15], color: "faction" },
      { shape: "box", size: [0.8,0.4,0.8], pos: [0,2.1,-1.0], color: "dark" },
      { shape: "box", size: [0.6,0.06,0.03], pos: [0,2.15,-0.59], color: "glow" },
      { shape: "box", size: [0.1,0.7,0.1], pos: [0,2.6,-1.2], color: "metal" },
      { shape: "box", size: [0.7,0.05,0.08], pos: [0,2.75,-1.2], color: "metal" },
      { shape: "sphere", radius: 0.16, pos: [0,2.05,-1.65], color: "light" },
      { shape: "box", size: [0.26,0.5,0.36], pos: [0.3,1.65,-2.0], color: "dark", mirror: true },
      { shape: "box", size: [0.08,0.06,0.04], pos: [0.5,1.2,-0.08], color: "amber", mirror: true },
      // tourelle avant basse : canons de rail jumeaux
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.12, pos: [0,0.76,1.75], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [0.86,0.36,0.9], pos: [0,0.98,1.7], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.6,0.04,0.5], pos: [0,1.18,1.65], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.24,0.2,0.3], pos: [0.22,1.0,2.2], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.035,0.12,2.6], pos: [0.155,1.0,3.45], color: "metal", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.035,0.12,2.6], pos: [0.285,1.0,3.45], color: "metal", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.22,0.18,0.06], pos: [0.22,1.0,2.75], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.22,0.18,0.06], pos: [0.22,1.0,3.45], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.22,0.18,0.06], pos: [0.22,1.0,4.15], color: "glow", mirror: true, parent: "tourelle" },
      // tourelle avant surélevée
      { shape: "box", size: [0.9,0.24,0.9], pos: [0,0.82,0.55], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.48, height: 0.12, pos: [0,1.0,0.55], color: "metal", pivot: "tourelle2" },
      { shape: "bevel", size: [0.84,0.4,0.88], pos: [0,1.25,0.5], color: "light", parent: "tourelle2" },
      { shape: "box", size: [0.58,0.04,0.48], pos: [0,1.47,0.45], color: "faction", parent: "tourelle2" },
      { shape: "box", size: [0.24,0.2,0.3], pos: [0.22,1.3,1.0], color: "dark", mirror: true, parent: "tourelle2" },
      { shape: "box", size: [0.035,0.12,2.6], pos: [0.155,1.3,2.25], color: "metal", mirror: true, parent: "tourelle2" },
      { shape: "box", size: [0.035,0.12,2.6], pos: [0.285,1.3,2.25], color: "metal", mirror: true, parent: "tourelle2" },
      { shape: "box", size: [0.22,0.18,0.06], pos: [0.22,1.3,1.55], color: "glow", mirror: true, parent: "tourelle2" },
      { shape: "box", size: [0.22,0.18,0.06], pos: [0.22,1.3,2.25], color: "glow", mirror: true, parent: "tourelle2" },
      { shape: "box", size: [0.22,0.18,0.06], pos: [0.22,1.3,2.95], color: "glow", mirror: true, parent: "tourelle2" },
      // tourelle arrière (fixe)
      { shape: "cylinder", sides: 6, radius: 0.4, height: 0.12, pos: [0,0.76,-2.8], color: "metal" },
      { shape: "box", size: [0.6,0.28,0.66], pos: [0,0.95,-2.85], color: "light" },
      { shape: "box", size: [0.035,0.1,1.0], pos: [0.12,0.98,-3.6], color: "metal", mirror: true },
    ],
  },
  spider,
  roach,
  dragon,
  star_cruiser,
  colossus,
  fortress,
  mothership,
  hyper_cruiser,
  // faune : le mordeur en trois stades (voir faune.ts)
  ...BEAST_MODELS,
};
