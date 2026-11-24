// Mobilité de l'Arche : bloc arrière, un tronçon sur son propre train de chenilles (pont de z = -2,52 à z = -3,5,
// y = 0,97) qui porte les moteurs, les réacteurs ou le lest de l'éperon.
import type { Part, Vec3 } from "../types.ts";
import { q } from "./commun.ts";
import { ARMES, MOBILITE, REMORQUES, caisse, groupe, train } from "./arche-commun.ts";

/** Axe du bloc arrière. */
const Z = -3.0;

/** Caisse commune du bloc arrière : tronçon, feux, pare-chocs. */
function bloc(): Part[] {
  return [
    ...train(MOBILITE, "bloc", 1.1, -2.98),
    ...groupe(`si:${MOBILITE}#fixe_bloc`, [
      ...caisse(-1, 2.3, 3.5),
      { shape: "box", size: [1.9, 0.07, 0.07], pos: [0, 0.99, -3.48], color: "hazard" },
      { shape: "box", size: [0.12, 0.1, 0.04], pos: [0.62, 0.78, -3.54], color: "red", mirror: true },
    ]),
  ];
}

/** Moteurs : bloc à ailettes et deux ventilateurs, silencieux et échappements, deux tuyères basses. */
function moteurs(): Part[] {
  const ventilo = (x: number): Part[] => [
    { shape: "cylinder", sides: 10, radius: 0.3, height: 0.06, pos: [x, 1.36, -2.94], color: "black", mirror: true },
    { shape: "torus", radius: 0.3, tube: 0.05, sides: 12, pos: [x, 1.38, -2.94], color: "copper", mirror: true },
    { shape: "box", size: [0.5, 0.02, 0.09], pos: [x, 1.395, -2.94], rot: [0, 30, 0], color: "steel", mirror: true, fine: true },
    { shape: "box", size: [0.5, 0.02, 0.09], pos: [x, 1.396, -2.94], rot: [0, -60, 0], color: "steel", mirror: true, fine: true },
  ];
  return [
    ...groupe("si:ark_engine1+ark_engine2#fixe_moteurs", [
      { shape: "bevel", size: [1.44, 0.36, 0.9], pos: [0, 1.14, q(Z + 0.02)], bevel: 0.06, color: "dark" },
      ...[-0.3, -0.12, 0.06, 0.24].map((d): Part => ({ shape: "box", size: [1.5, 0.24, 0.06], pos: [0, 1.14, q(Z + d)], color: "steel", fine: true })),
      { shape: "box", size: [1.46, 0.05, 0.14], pos: [0, 1.32, -3.36], color: "faction" },
      // silencieux, échappements coudés
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.84, pos: [0.9, 1.14, q(Z + 0.02)], rot: [90, 0, 0], color: "rust", mirror: true },
      { shape: "tube", radius: 0.1, sides: 6, path: [[0.9, 1.14, -3.3], [0.9, 1.7, -3.3], [0.96, 1.86, -3.52]], bend: 0, color: "rust", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.085, height: 0.03, pos: [0.96, 1.865, -3.525], rot: [52, 0, 0], color: "black", mirror: true, fine: true },
      // tuyères basses
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.16, pos: [0.46, 0.66, -3.58], rot: [90, 0, 0], color: "steel", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 0.04, pos: [0.46, 0.66, -3.66], rot: [90, 0, 0], color: "amber", mirror: true },
    ]),
    // ventilateurs du palier simple ; les moteurs jumelés les recouvrent d'un étage à quatre tuyères
    ...groupe("si:ark_engine1#fixe_ventilos", ventilo(0.36)),
    ...groupe("si:ark_engine2#fixe_moteurs2", [
      { shape: "bevel", size: [1.5, 0.46, 0.66], pos: [0, 1.56, -3.12], bevel: 0.07, color: "metal" },
      { shape: "box", size: [1.2, 0.03, 0.2], pos: [0, 1.8, -3.28], color: "faction" },
      { shape: "box", size: [1.1, 0.04, 0.26], pos: [0, 1.795, -2.98], color: "black" },
      ...[-0.36, -0.12, 0.12, 0.36].map((x): Part => ({ shape: "box", size: [0.08, 0.05, 0.24], pos: [x, 1.81, -2.98], color: "copper" })),
      // quatre tuyères
      ...[0.2, 0.58].flatMap((x): Part[] => [
        { shape: "lathe", sides: 8, profile: [[0.16, 0], [0.12, 0.12], [0.2, 0.5], [0.16, 0.5], [0.1, 0.3]], pos: [x, 1.56, -3.42], rot: [-90, 0, 0], color: "steel", mirror: true },
        { shape: "cylinder", sides: 6, radius: 0.15, height: 0.04, pos: [x, 1.56, -3.8], rot: [90, 0, 0], color: "amber", mirror: true },
      ]),
      // deux échappements de plus, plus hauts
      { shape: "lathe", sides: 8, profile: [[0.12, 0], [0.09, 0.1], [0.09, 1.1], [0.14, 1.2], [0, 1.2]], pos: [0.9, 1.1, -2.66], color: "rust", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.09, height: 0.02, pos: [0.9, 2.31, -2.66], color: "black", mirror: true },
    ]),
  ];
}

/** Surcharge : deux réacteurs couchés à cœur lumineux, veine centrale, condensateurs. */
function surcharge(): Part[] {
  return groupe("si:ark_boost#fixe_surcharge", [
    { shape: "bevel", size: [1.7, 0.2, 0.9], pos: [0, 1.06, Z], bevel: 0.05, color: "dark" },
    { shape: "lathe", sides: 10, profile: [[0, -0.1], [0.28, -0.14], [0.36, 0], [0.38, 0.7], [0.28, 1.06], [0.36, 1.3], [0.32, 1.3], [0.22, 1.04]], pos: [0.48, 1.46, -2.5], rot: [-90, 0, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.39, height: 0.16, pos: [0.48, 1.46, -2.8], rot: [90, 0, 0], color: "faction", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.392, height: 0.08, pos: [0.48, 1.46, -3.12], rot: [90, 0, 0], color: "glow", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.3, height: 0.06, pos: [0.48, 1.46, -3.74], rot: [90, 0, 0], color: "glow", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.25, height: 0.06, pos: [0.48, 1.46, -2.37], rot: [90, 0, 0], color: "black", mirror: true },
    { shape: "cone", sides: 8, radius: 0.12, height: 0.2, pos: [0.48, 1.46, -2.3], rot: [90, 0, 0], color: "light", mirror: true, fine: true },
    { shape: "box", size: [0.12, 0.08, 1.0], pos: [0, 1.2, Z], color: "glow" },
    { shape: "box", size: [0.3, 0.16, 0.34], pos: [0.5, 1.1, -3.2], color: "rust", mirror: true, fine: true },
    { shape: "cylinder", sides: 6, radius: 0.13, height: 0.44, pos: [0.98, 1.18, -2.72], color: "copper", mirror: true },
    { shape: "sphere", radius: 0.12, pos: [0.98, 1.46, -2.72], color: "glow", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.13, height: 0.44, pos: [0.98, 1.18, -3.28], color: "copper", mirror: true },
    { shape: "sphere", radius: 0.12, pos: [0.98, 1.46, -3.28], color: "glow", mirror: true },
  ]);
}

/** Étrave d'éperonnage en chevron, posée sur la proue en `z` ; large comme les chenilles, à dents. */
function etrave(z: number): Part[] {
  return [
    { shape: "extrude", profile: [[-1.36, 0], [1.36, 0], [1.36, 0.18], [0.24, 0.98], [-0.24, 0.98], [-1.36, 0.18]], depth: 0.6, bevel: 0.05, pos: [0, 0.52, z], rot: [90, 0, 0], color: "steel" },
    { shape: "extrude", profile: [[-1.2, 0], [1.2, 0], [1.2, 0.06], [0.2, 0.76], [-0.2, 0.76], [-1.2, 0.06]], depth: 0.16, bevel: 0.03, pos: [0, 0.9, z], rot: [90, 0, 0], color: "rust" },
    { shape: "box", size: [0.14, 0.08, 0.92], pos: [0, 0.97, q(z + 0.42)], color: "hazard" },
    { shape: "box", size: [1.3, 0.03, 0.16], pos: [0.62, 0.99, q(z + 0.26)], rot: [0, 34, 0], color: "faction", mirror: true },
    ...[[0, 1.24], [0.52, 0.92], [1.06, 0.52]].map(([x, d]): Part => ({ shape: "cone", sides: 5, radius: 0.16, height: 0.62, pos: [x, 0.52, q(z + d)], rot: [90, 0, 0], color: "dark", mirror: x > 0 })),
    { shape: "box", size: [0.2, 0.24, 0.7], pos: [0.72, 0.72, q(z - 0.2)], color: "rust", mirror: true },
  ];
}

/** Éperon : étrave à l'avant (devant le gaillard s'il y en a un), lest de béton arrimé sur le bloc arrière. */
function eperon(): Part[] {
  const dalle = (pos: Vec3, size: Vec3): Part => ({ shape: "bevel", size, pos, bevel: 0.05, color: "concrete" });
  return [
    ...groupe(`si:ark_spur&!${ARMES}#fixe_eperon`, etrave(2.32)),
    ...groupe(`si:ark_spur&${ARMES}#fixe_eperon_av`, etrave(3.62)),
    ...groupe("si:ark_spur#fixe_lest", [
      { shape: "box", size: [1.96, 0.08, 1.0], pos: [0, 1.0, Z], color: "rust" },
      dalle([0.5, 1.22, -2.76], [0.92, 0.38, 0.44]),
      dalle([-0.5, 1.22, -2.76], [0.92, 0.38, 0.44]),
      dalle([0.5, 1.22, -3.24], [0.92, 0.38, 0.44]),
      dalle([-0.5, 1.22, -3.24], [0.92, 0.38, 0.44]),
      dalle([0, 1.56, -2.98], [1.1, 0.32, 0.7]),
      // sangles d'acier, cornières
      { shape: "box", size: [0.14, 0.04, 0.74], pos: [0.3, 1.735, -2.98], color: "hazard", mirror: true },
      { shape: "box", size: [0.14, 0.04, 0.96], pos: [0.78, 1.42, Z], color: "dark", mirror: true },
      { shape: "box", size: [0.08, 0.5, 0.08], pos: [0.98, 1.26, -2.54], color: "rust", mirror: true },
      { shape: "box", size: [0.08, 0.5, 0.08], pos: [0.98, 1.26, -3.46], color: "rust", mirror: true },
      { shape: "box", size: [0.5, 0.03, 0.3], pos: [0, 1.73, -2.98], color: "faction" },
      // bouclier de poupe
      { shape: "box", size: [1.9, 0.5, 0.08], pos: [0, 1.2, -3.52], rot: [14, 0, 0], color: "steel" },
      { shape: "box", size: [1.5, 0.1, 0.09], pos: [0, 1.26, -3.54], rot: [14, 0, 0], color: "hazard" },
    ]),
  ];
}

/** Crochet d'attelage du convoi, à la poupe de l'Arche ou de son bloc arrière. */
function attelage(): Part[] {
  const crochet = (z: number): Part[] => [
    { shape: "box", size: [0.44, 0.16, 0.2], pos: [0, 0.42, q(z + 0.08)], color: "rust" },
    { shape: "box", size: [0.14, 0.12, 0.26], pos: [0, 0.38, q(z - 0.04)], color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.07, height: 0.26, pos: [0, 0.42, q(z - 0.1)], color: "dark" },
  ];
  return [...groupe(`si:${REMORQUES}&!${MOBILITE}#fixe_crochet`, crochet(-2.4)), ...groupe(`si:${REMORQUES}&${MOBILITE}#fixe_crochet_ar`, crochet(-3.5))];
}

export function mobilite(): Part[] {
  return [...bloc(), ...moteurs(), ...surcharge(), ...eperon(), ...attelage()];
}
