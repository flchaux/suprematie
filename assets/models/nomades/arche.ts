// Améliorations visibles de l'Arche, ses tourelles déployables, son groupe électrogène, et les aménagements des
// modules (voir sim/src/ameliorations.rs et docs/spec/races.md).
// Un pivot « si:clé+clé#nom » n'est dessiné que si une de ces améliorations est installée ; « sauf:clé+clé#nom »
// que si aucune ne l'est. Nom « fixe… » : la pièce ne tourne pas ; « radar… » : elle tourne sans cesse ; sinon elle
// vise avec la tourelle. Les pièces « si: » ne comptent pas dans la taille du modèle (render/entities.ts, generator.ts).
// Repère : +x à droite, +y en haut, +z vers l'avant. Pont de l'Arche : y = 0,97.
import type { Part, Vec3 } from "../types.ts";
import { q, incl, fut, chenille, coffre } from "./commun.ts";

/** Pivots des armes d'origine de l'Arche : le canon de proue et la défense antiaérienne arrière. */
export const CANON = "sauf:ark_w_siege+ark_w_flame+ark_w_rockets+ark_w_rail#tourelle";
export const FLAK = "sauf:ark_w_flak#tourelle_aa";

/** Pièces d'un pivot : la première porte le pivot (son origine), les autres le suivent. */
function groupe(pivot: string, parts: Part[]): Part[] {
  return parts.map((p) => ({ ...p, pivot }));
}

/** Socle et caisse à pans d'une tourelle de proue. */
function affut(r: number, h: number): Part[] {
  return [
    { shape: "cylinder", sides: 12, radius: r, height: 0.16, pos: [0, 1.05, 1.7], color: "steel" },
    { shape: "extrude", profile: [[-r * 0.9, -r], [r * 0.9, -r], [r, 0.04], [r * 0.7, r * 0.9], [-r * 0.7, r * 0.9], [-r, 0.04]], depth: h, bevel: 0.04, pos: [0, q(1.12 + h / 2), 1.66], rot: [90, 0, 0], color: "metal" },
    { shape: "box", size: [q(r * 1.1), 0.03, q(r * 1.1)], pos: [0, q(1.135 + h), 1.6], color: "faction" },
  ];
}

function armement(): Part[] {
  const siege = groupe("si:ark_w_siege#tourelle", [
    ...affut(0.54, 0.4),
    { shape: "box", size: [0.5, 0.34, 0.2], pos: [0, 1.34, 2.16], color: "steel" },
    incl([0, 1.36, 2.1], 10, 0, 0, { shape: "lathe", sides: 10, rot: [90, 0, 0], color: "steel", profile: fut(0.12, 1.7) }),
    incl([0.2, 1.3, 2.1], 10, 0.3, 0, { shape: "cylinder", sides: 6, radius: 0.04, height: 0.7, rot: [90, 0, 0], color: "dark", mirror: true, fine: true }),
    { shape: "box", size: [0.4, 0.3, 0.3], pos: [0, 1.34, 1.08], color: "wood" },
    { shape: "box", size: [0.41, 0.31, 0.05], pos: [0, 1.34, 1.08], color: "black", fine: true },
  ]);
  const flamme = groupe("si:ark_w_flame#tourelle", [
    ...affut(0.46, 0.28),
    { shape: "cylinder", sides: 8, radius: 0.15, height: 0.62, pos: [0.3, 1.5, 1.45], rot: [90, 0, 0], color: "red", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.08, pos: [0.3, 1.5, 1.8], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "tube", radius: 0.03, sides: 5, path: [[0.3, 1.45, 1.82], [0.3, 1.2, 2.0], [0.14, 1.24, 2.1]], bend: 0.06, color: "copper", mirror: true, fine: true },
    { shape: "cylinder", sides: 8, radius: 0.085, height: 0.8, pos: [0.14, 1.26, 2.4], rot: [90, 0, 0], color: "steel", mirror: true },
    { shape: "cone", sides: 8, radius: 0.15, height: 0.22, pos: [0.14, 1.26, 2.84], rot: [-90, 0, 0], color: "dark", mirror: true },
    { shape: "sphere", radius: 0.045, pos: [0.14, 1.38, 2.86], color: "amber", mirror: true },
  ]);
  const roquettes: Part[] = [
    ...affut(0.44, 0.2),
    incl([0, 1.5, 1.6], 18, 0.1, 0.06, { shape: "bevel", size: [1.14, 0.52, 0.96], bevel: 0.04, color: "dark" }),
    incl([0, 1.5, 1.6], 18, 0.1, 0.34, { shape: "box", size: [0.9, 0.03, 0.8], color: "faction" }),
  ];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      roquettes.push(incl([q(-0.39 + i * 0.26), 1.5, 1.6], 18, 0.56, q(-0.1 + j * 0.16), { shape: "cylinder", sides: 6, radius: 0.07, height: 0.12, rot: [90, 0, 0], color: j === 1 ? "red" : "black", fine: j !== 1 }));
  const rail = groupe("si:ark_w_rail#tourelle", [
    ...affut(0.5, 0.36),
    { shape: "box", size: [0.07, 0.16, 2.2], pos: [0.12, 1.36, 2.2], color: "steel", mirror: true },
    { shape: "box", size: [0.07, 0.05, 2.1], pos: [0, 1.36, 2.2], color: "glow" },
    ...[1.5, 1.95, 2.4, 2.85].map((z): Part => ({ shape: "box", size: [0.4, 0.28, 0.12], pos: [0, 1.36, z], color: "copper" })),
    { shape: "box", size: [0.46, 0.3, 0.34], pos: [0, 1.4, 1.1], color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.5, pos: [0.36, 1.36, 1.3], rot: [90, 0, 0], color: "copper", mirror: true },
  ]);
  const flak: Part[] = [
    { shape: "cylinder", sides: 10, radius: 0.4, height: 0.2, pos: [0, 1.06, -2.02], color: "steel" },
    { shape: "bevel", size: [0.74, 0.4, 0.56], pos: [0, 1.34, -2.06], bevel: 0.05, color: "metal" },
    { shape: "box", size: [0.4, 0.03, 0.3], pos: [0, 1.555, -2.1], color: "faction" },
    { shape: "sphere", radius: 0.06, pos: [0, 1.6, -1.94], color: "amber" },
  ];
  for (const x of [0.14, 0.3]) {
    flak.push(incl([x, 1.42, -1.95], 52, 0.55, 0, { shape: "cylinder", sides: 6, radius: 0.05, height: 1.1, rot: [90, 0, 0], color: "steel", mirror: true }));
    flak.push(incl([x, 1.42, -1.95], 52, 1.12, 0, { shape: "cylinder", sides: 8, radius: 0.075, height: 0.14, rot: [90, 0, 0], color: "dark", mirror: true, fine: true }));
  }
  return [...siege, ...flamme, ...groupe("si:ark_w_rockets#tourelle", roquettes), ...rail, ...groupe("si:ark_w_flak#tourelle_aa", flak)];
}

function coque(): Part[] {
  const plaques: Part[] = [
    { shape: "box", size: [0.06, 0.5, 1.5], pos: [1.34, 0.72, 1.1], rot: [0, 0, -7], color: "rust", mirror: true },
    { shape: "box", size: [0.06, 0.5, 1.5], pos: [1.34, 0.72, -0.55], rot: [0, 0, -7], color: "rust", mirror: true },
    { shape: "box", size: [0.06, 0.5, 0.8], pos: [1.34, 0.72, -1.82], rot: [0, 0, -7], color: "rust", mirror: true },
    { shape: "box", size: [0.07, 0.06, 4.1], pos: [1.32, 0.96, 0], color: "hazard", mirror: true, fine: true },
  ];
  const lourdes: Part[] = [
    { shape: "box", size: [1.7, 0.46, 0.08], pos: [0, 0.74, 2.48], rot: [-24, 0, 0], color: "metal" },
    { shape: "box", size: [1.2, 0.08, 0.09], pos: [0, 0.8, 2.52], rot: [-24, 0, 0], color: "faction" },
    { shape: "box", size: [0.09, 0.4, 3.9], pos: [1.4, 0.5, -0.05], color: "metal", mirror: true },
    { shape: "box", size: [1.9, 0.34, 0.1], pos: [0, 1.24, 1.2], color: "steel" },
    ...[-1.5, -0.5, 0.5, 1.5].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.06, height: 0.05, pos: [1.46, 0.5, z], rot: [0, 0, 90], color: "dark", mirror: true, fine: true })),
  ];
  const briques: Part[] = [];
  for (let k = 0; k < 8; k++) briques.push({ shape: "bevel", size: [0.12, 0.2, 0.4], pos: [1.37, q(k % 2 ? 0.86 : 0.58), q(-1.9 + k * 0.52)], bevel: 0.03, color: k % 2 ? "dark" : "dry", mirror: true });
  briques.push({ shape: "bevel", size: [0.5, 0.2, 0.14], pos: [0.36, 0.78, 2.46], bevel: 0.03, color: "dry", mirror: true });
  // émetteur du bouclier : pylône à anneaux ; un anneau de plus par palier, et quatre relais aux coins pour la grande bulle
  const emetteur: Part[] = [
    { shape: "cylinder", sides: 8, radius: 0.24, height: 0.16, pos: [-0.78, 1.05, 0.02], color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.09, height: 1.1, pos: [-0.78, 1.6, 0.02], color: "dark" },
    { shape: "torus", radius: 0.22, tube: 0.04, sides: 12, pos: [-0.78, 1.7, 0.02], color: "copper" },
    { shape: "sphere", radius: 0.15, detail: 1, pos: [-0.78, 2.25, 0.02], color: "glow" },
  ];
  const deux: Part[] = [
    { shape: "torus", radius: 0.28, tube: 0.045, sides: 12, pos: [-0.78, 1.95, 0.02], color: "copper" },
    { shape: "sphere", radius: 0.07, pos: [-0.78, 2.52, 0.02], color: "glow" },
  ];
  const trois: Part[] = [];
  for (const z of [1.5, -2.2]) {
    trois.push({ shape: "cylinder", sides: 6, radius: 0.07, height: 0.7, pos: [1.0, 1.3, z], color: "dark", mirror: true });
    trois.push({ shape: "torus", radius: 0.15, tube: 0.03, sides: 10, pos: [1.0, 1.5, z], color: "copper", mirror: true });
    trois.push({ shape: "sphere", radius: 0.1, pos: [1.0, 1.74, z], color: "glow", mirror: true });
  }
  return [
    ...groupe("si:ark_plate1+ark_plate2#fixe_plaques", plaques),
    ...groupe("si:ark_plate2#fixe_lourdes", lourdes),
    ...groupe("si:ark_reactive#fixe_briques", briques),
    ...groupe("si:ark_shield1+ark_shield2+ark_shield3#fixe_emetteur", emetteur),
    ...groupe("si:ark_shield2+ark_shield3#fixe_emetteur2", deux),
    ...groupe("si:ark_shield3#fixe_relais", trois),
  ];
}

/** Berceau de bord d'une tourelle repliée, en encorbellement sur le flanc. */
function berceau(x: number, z: number): Part[] {
  return [
    { shape: "box", size: [0.42, 0.06, 0.4], pos: [x, 1.0, z], color: "rust" },
    { shape: "bevel", size: [0.3, 0.2, 0.3], pos: [x, 1.13, z], bevel: 0.03, color: "metal" },
    { shape: "box", size: [0.2, 0.025, 0.2], pos: [x, 1.24, z], color: "faction" },
    { shape: "cylinder", sides: 6, radius: 0.035, height: 0.4, pos: [x, 1.17, q(z + 0.22)], rot: [90, 0, 0], color: "steel" },
  ];
}

function pont(): Part[] {
  const atelier: Part[] = [
    ...[-0.3, -1.6].flatMap((z): Part[] => [
      { shape: "box", size: [0.1, 1.5, 0.1], pos: [1.0, 1.7, z], color: "hazard", mirror: true },
      { shape: "box", size: [2.1, 0.12, 0.12], pos: [0, 2.5, z], color: "rust" },
    ]),
    { shape: "box", size: [0.1, 0.1, 1.4], pos: [0.9, 2.5, -0.95], color: "rust", mirror: true },
    { shape: "box", size: [0.36, 0.16, 0.3], pos: [0.2, 2.42, -0.95], color: "dark" },
    { shape: "cylinder", sides: 5, radius: 0.02, height: 0.6, pos: [0.2, 2.05, -0.95], color: "steel" },
    { shape: "box", size: [0.2, 0.12, 0.2], pos: [0.2, 1.72, -0.95], color: "hazard" },
    { shape: "sphere", radius: 0.05, pos: [0.95, 2.6, -0.3], color: "amber", mirror: true },
  ];
  const soutes: Part[] = [];
  for (const z of [0.5, -0.1, -0.7, -1.3]) soutes.push(...coffre([1.08, 1.12, z], [0.34, 0.3, 0.46], z < -0.5 ? "rust" : "wood"), ...coffre([-1.08, 1.12, z], [0.34, 0.3, 0.46], z < -0.5 ? "wood" : "metal"));
  soutes.push(...coffre([-1.06, 1.4, 0.2], [0.3, 0.26, 0.4], "dry"));
  return [
    ...groupe("si:ark_turrets1+ark_turrets2+ark_turrets3#fixe_berceau1", berceau(-1.14, 1.3)),
    ...groupe("si:ark_turrets2+ark_turrets3#fixe_berceau2", [...berceau(1.14, 1.3), ...berceau(-1.14, 0.75)]),
    ...groupe("si:ark_turrets3#fixe_berceau3", [...berceau(1.14, 0.75), ...berceau(-1.14, 0.2), ...berceau(1.14, 0.2), ...berceau(-1.14, -0.35), ...berceau(-1.14, -0.9), ...berceau(-1.14, -1.45)]),
    ...groupe("si:ark_workshop#fixe_portique", atelier),
    ...groupe("si:ark_holds#fixe_soutes", soutes),
  ];
}

function mobilite(): Part[] {
  const moteur = (x: number, y: number): Part[] => [
    { shape: "cylinder", sides: 10, radius: 0.2, height: 0.7, pos: [x, y, -2.5], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "torus", radius: 0.2, tube: 0.035, sides: 10, pos: [x, y, -2.82], rot: [90, 0, 0], color: "copper", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.13, height: 0.06, pos: [x, y, -2.84], rot: [90, 0, 0], color: "amber", mirror: true },
    { shape: "tube", radius: 0.05, sides: 5, path: [[x, q(y + 0.15), -2.35], [x, q(y + 0.6), -2.4], [x, q(y + 0.7), -2.55]], bend: 0.08, color: "rust", mirror: true, fine: true },
  ];
  const eperon: Part[] = [
    { shape: "extrude", profile: [[-1.1, 0], [1.1, 0], [1.1, 0.16], [0.18, 0.86], [-0.18, 0.86], [-1.1, 0.16]], depth: 0.6, bevel: 0.04, pos: [0, 0.5, 2.3], rot: [90, 0, 0], color: "steel" },
    { shape: "box", size: [0.1, 0.1, 0.8], pos: [0, 0.82, 2.75], color: "hazard" },
    ...[[0, 3.2], [0.5, 2.85], [0.95, 2.55]].map(([x, z]): Part => ({ shape: "cone", sides: 5, radius: 0.13, height: 0.5, pos: [x, 0.5, z], rot: [90, 0, 0], color: "dark", mirror: x > 0 })),
    { shape: "box", size: [0.16, 0.2, 0.8], pos: [0.7, 0.66, 2.2], color: "rust", mirror: true },
  ];
  const surcharge: Part[] = [
    ...[-0.28, 0.28].flatMap((x): Part[] => [
      { shape: "cylinder", sides: 10, radius: 0.22, radiusTop: 0.3, height: 0.5, pos: [x, 1.0, -2.55], rot: [-90, 0, 0], color: "steel" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.05, pos: [x, 1.0, -2.8], rot: [90, 0, 0], color: "glow" },
    ]),
    { shape: "cylinder", sides: 8, radius: 0.14, height: 0.9, pos: [0.9, 1.16, -2.05], color: "copper", mirror: true },
    { shape: "sphere", radius: 0.09, pos: [0.9, 1.68, -2.05], color: "glow", mirror: true },
  ];
  return [
    ...groupe("si:ark_engine1+ark_engine2#fixe_moteurs", moteur(0.85, 0.78)),
    ...groupe("si:ark_engine2#fixe_moteurs2", moteur(0.36, 0.78)),
    ...groupe("si:ark_spur#fixe_eperon", eperon),
    ...groupe("si:ark_boost#fixe_surcharge", surcharge),
  ];
}

function soutien(): Part[] {
  const bras: Part[] = [
    { shape: "cylinder", sides: 8, radius: 0.16, height: 0.3, pos: [0.82, 1.12, 0.0], color: "dark" },
    { shape: "box", size: [0.12, 1.1, 0.12], pos: [0.96, 1.7, 0.0], rot: [0, 0, -16], color: "hazard" },
    { shape: "box", size: [0.1, 0.1, 0.9], pos: [1.12, 2.2, 0.3], rot: [14, 0, 0], color: "faction" },
    { shape: "box", size: [0.2, 0.16, 0.16], pos: [1.12, 2.06, 0.78], color: "steel" },
    { shape: "sphere", radius: 0.06, pos: [1.12, 1.96, 0.84], color: "glow" },
  ];
  const mat: Part[] = [
    { shape: "cylinder", sides: 6, radius: 0.06, height: 1.5, pos: [0.15, 2.2, 0.85], color: "steel" },
    { shape: "box", size: [0.3, 0.14, 0.3], pos: [0.15, 1.62, 0.85], color: "dark" },
  ];
  const parabole: Part[] = [
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.1, pos: [0.15, 2.95, 0.85], color: "dark" },
    { shape: "box", size: [1.2, 0.42, 0.06], pos: [0.15, 3.16, 0.85], rot: [-10, 0, 0], color: "light" },
    { shape: "box", size: [1.24, 0.05, 0.08], pos: [0.15, 3.39, 0.82], rot: [-10, 0, 0], color: "faction" },
    { shape: "box", size: [0.06, 0.06, 0.4], pos: [0.15, 3.1, 1.06], color: "steel", fine: true },
  ];
  const brouilleur: Part[] = [
    { shape: "box", size: [0.5, 0.3, 0.4], pos: [-0.75, 1.14, 0.62], color: "dark" },
    ...[-0.9, -0.75, -0.6].map((x, k): Part => ({ shape: "cylinder", sides: 5, radius: 0.025, height: q(1.1 + k * 0.25), pos: [x, q(1.8 + k * 0.12), 0.62], color: "steel" })),
    { shape: "torus", radius: 0.2, tube: 0.025, sides: 10, pos: [-0.75, 1.75, 0.62], color: "copper" },
    { shape: "torus", radius: 0.15, tube: 0.025, sides: 10, pos: [-0.75, 2.0, 0.62], color: "copper" },
    { shape: "sphere", radius: 0.06, pos: [-0.6, 2.75, 0.62], color: "red" },
  ];
  const groupeE: Part[] = [
    { shape: "bevel", size: [0.5, 0.42, 0.7], pos: [0.8, 1.2, -0.75], bevel: 0.05, color: "hazard" },
    { shape: "cylinder", sides: 10, radius: 0.22, height: 0.2, pos: [0.8, 1.24, -1.25], rot: [0, 0, 90], color: "copper" },
    { shape: "torus", radius: 0.24, tube: 0.03, sides: 12, pos: [0.92, 1.24, -1.25], rot: [0, 0, 90], color: "black" },
    { shape: "box", size: [0.1, 0.1, 0.03], pos: [0.8, 1.36, -0.39], color: "amber" },
    { shape: "tube", radius: 0.04, sides: 5, path: [[0.7, 1.4, -0.9], [0.7, 1.8, -0.9], [0.62, 1.9, -0.9]], bend: 0.08, color: "rust" },
  ];
  const grues: Part[] = [
    { shape: "cylinder", sides: 8, radius: 0.16, height: 0.3, pos: [-0.8, 1.12, -1.7], color: "dark" },
    { shape: "box", size: [0.12, 1.3, 0.12], pos: [-1.0, 1.7, -1.7], rot: [0, 0, 18], color: "rust" },
    { shape: "box", size: [0.8, 0.1, 0.1], pos: [-1.46, 2.34, -1.7], rot: [0, 0, -12], color: "faction" },
    { shape: "cylinder", sides: 5, radius: 0.02, height: 0.6, pos: [-1.78, 2.0, -1.7], color: "steel" },
    ...[0, 120, 240].map((a): Part => ({ shape: "box", size: [0.05, 0.26, 0.05], pos: [q(-1.78 + Math.cos((a * Math.PI) / 180) * 0.1), 1.6, q(-1.7 + Math.sin((a * Math.PI) / 180) * 0.1)], rot: [0, a, 14], color: "dark" })),
    { shape: "bevel", size: [0.5, 0.2, 0.5], pos: [0.5, 1.07, -2.0], bevel: 0.08, color: "ore" },
  ];
  return [
    ...groupe("si:ark_repair#fixe_bras", bras),
    ...groupe("si:ark_radar#fixe_mat", mat),
    ...groupe("si:ark_radar#radar_tete", parabole),
    ...groupe("si:ark_jammer#fixe_brouilleur", brouilleur),
    ...groupe("si:ark_dynamo#fixe_dynamo", groupeE),
    ...groupe("si:ark_loot#fixe_grues", grues),
  ];
}

/** Toutes les améliorations visibles de l'Arche, à ajouter à son modèle. */
export function ameliorationsArche(): Part[] {
  return [...armement(), ...coque(), ...pont(), ...mobilite(), ...soutien()];
}

/**
 * Tourelle déployable de l'Arche (unité) : petit affût à chenilles, quatre béquilles qui s'ouvrent au déploiement
 * (pivots « dep|… »), pièce sur pivot « tourelle » qui vise ; `genre` : 0 mitrailleuse, 1 antiaérienne, 2 mortier.
 */
export function tourelleArche(genre: 0 | 1 | 2): Part[] {
  const p: Part[] = [
    ...chenille(0.36, 1.0, 0.26, 0.2, 0, 0, 0.2, true),
    { shape: "bevel", size: [0.6, 0.2, 0.96], pos: [0, 0.3, 0], bevel: 0.04, color: "dark" },
    { shape: "box", size: [0.02, 0.12, 0.7], pos: [0.48, 0.3, 0], color: "faction", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.3, height: 0.1, pos: [0, 0.44, 0], color: "steel" },
    { shape: "box", size: [0.08, 0.05, 0.03], pos: [0.2, 0.36, 0.49], color: "amber", mirror: true },
  ];
  // béquilles : repliées contre la caisse, elles pivotent vers l'extérieur puis posent leur patin
  for (const [sx, sz, nom] of [[1, 1, "ad"], [-1, 1, "ag"], [1, -1, "rd"], [-1, -1, "rg"]] as const) {
    const x = q(sx * 0.62);
    const z = q(sz * 0.52);
    const piv = `dep|t:${q(-sx * 0.3)},0,0:0:0.5|t:0,0.2,0:0.5:1#${nom}`;
    p.push(
      { shape: "box", size: [0.34, 0.07, 0.1], pos: [q(sx * 0.46), 0.3, z], rot: [0, q(-sx * sz * 18), 0], color: "rust", pivot: piv },
      { shape: "cylinder", sides: 6, radius: 0.035, height: 0.3, pos: [x, 0.17, z], color: "steel", pivot: piv },
      { shape: "cylinder", sides: 6, radius: 0.12, radiusTop: 0.08, height: 0.05, pos: [x, 0.025, z], color: "dark", pivot: piv },
    );
  }
  if (genre === 0) {
    p.push(
      ...groupe("tourelle", [
        { shape: "cylinder", sides: 10, radius: 0.26, height: 0.1, pos: [0, 0.53, 0], color: "dark" },
        { shape: "bevel", size: [0.44, 0.28, 0.46], pos: [0, 0.7, -0.02], bevel: 0.04, color: "metal" },
        { shape: "box", size: [0.62, 0.34, 0.04], pos: [0, 0.74, 0.22], rot: [-12, 0, 0], color: "dry" },
        { shape: "box", size: [0.62, 0.06, 0.045], pos: [0, 0.88, 0.19], rot: [-12, 0, 0], color: "faction" },
        ...[0.06, 0.14].map((x): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.62, pos: [x, 0.7, 0.5], rot: [90, 0, 0], color: "steel", mirror: true })),
        { shape: "cylinder", sides: 8, radius: 0.1, height: 0.1, pos: [0, 0.7, 0.66], rot: [90, 0, 0], color: "dark" },
        ...coffre([0.3, 0.66, -0.04], [0.14, 0.2, 0.3], "wood"),
      ]),
    );
  } else if (genre === 1) {
    p.push(
      ...groupe("tourelle", [
        { shape: "cylinder", sides: 10, radius: 0.26, height: 0.1, pos: [0, 0.53, 0], color: "dark" },
        { shape: "bevel", size: [0.4, 0.3, 0.4], pos: [0, 0.72, -0.06], bevel: 0.04, color: "metal" },
        { shape: "box", size: [0.3, 0.03, 0.24], pos: [0, 0.885, -0.1], color: "faction" },
        ...[0.2, 0.3].map((x): Part => incl([x, 0.76, 0], 55, 0.36, 0, { shape: "cylinder", sides: 6, radius: 0.035, height: 0.76, rot: [90, 0, 0], color: "steel", mirror: true })),
        ...[0.2, 0.3].map((x): Part => incl([x, 0.76, 0], 55, 0.74, 0, { shape: "cylinder", sides: 6, radius: 0.055, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, fine: true })),
        { shape: "cylinder", sides: 5, radius: 0.015, height: 0.3, pos: [0, 1.02, -0.18], color: "steel", fine: true },
        { shape: "box", size: [0.26, 0.12, 0.03], pos: [0, 1.16, -0.18], color: "light" },
      ]),
    );
  } else {
    p.push(
      ...groupe("tourelle", [
        { shape: "cylinder", sides: 10, radius: 0.28, height: 0.1, pos: [0, 0.53, 0], color: "dark" },
        { shape: "box", size: [0.08, 0.34, 0.4], pos: [0.22, 0.72, -0.02], color: "rust", mirror: true },
        incl([0, 0.7, -0.14], 58, 0.36, 0, { shape: "lathe", sides: 10, rot: [90, 0, 0], color: "steel", profile: [[0, -0.36], [0.16, -0.36], [0.16, -0.1], [0.13, -0.06], [0.13, 0.36], [0.17, 0.38], [0.17, 0.46], [0.11, 0.46], [0.11, 0.3], [0, 0.3]] }),
        { shape: "cylinder", sides: 6, radius: 0.04, height: 0.46, pos: [0, 0.74, 0.26], rot: [-35, 0, 0], color: "hazard" },
        { shape: "box", size: [0.52, 0.06, 0.06], pos: [0, 0.86, -0.12], color: "faction" },
        ...coffre([0, 0.58, -0.36], [0.4, 0.16, 0.16], "wood"),
      ]),
    );
  }
  return p;
}

/** Groupe électrogène posé par l'Arche (« ark_dock », 1 × 1) : générateur sur patins, prise et mât à lanterne. */
export function groupeArche(): Part[] {
  return [
    { shape: "box", size: [0.8, 0.08, 0.14], pos: [0, 0.04, 0.28], color: "rust" },
    { shape: "box", size: [0.8, 0.08, 0.14], pos: [0, 0.04, -0.28], color: "rust" },
    { shape: "bevel", size: [0.62, 0.36, 0.62], pos: [-0.04, 0.27, 0], bevel: 0.05, color: "hazard" },
    { shape: "box", size: [0.5, 0.04, 0.5], pos: [-0.04, 0.46, 0], color: "dark" },
    { shape: "box", size: [0.64, 0.06, 0.3], pos: [-0.04, 0.36, 0], color: "faction" },
    { shape: "cylinder", sides: 10, radius: 0.16, height: 0.14, pos: [0.34, 0.28, 0], rot: [0, 0, 90], color: "copper" },
    { shape: "torus", radius: 0.17, tube: 0.03, sides: 12, pos: [0.42, 0.28, 0], rot: [0, 0, 90], color: "black" },
    { shape: "tube", radius: 0.035, sides: 5, path: [[-0.22, 0.48, 0.16], [-0.22, 0.76, 0.16], [-0.28, 0.82, 0.16]], bend: 0.06, color: "rust" },
    { shape: "cylinder", sides: 6, radius: 0.03, height: 1.1, pos: [0.2, 1.0, -0.2], color: "steel" },
    { shape: "box", size: [0.4, 0.04, 0.04], pos: [0.2, 1.46, -0.2], color: "wood" },
    { shape: "sphere", radius: 0.06, pos: [0.2, 1.6, -0.2], color: "amber" },
    { shape: "box", size: [0.1, 0.1, 0.02], pos: [-0.1, 0.3, 0.32], color: "glow" },
  ];
}

/**
 * Aménagement d'un module ou d'un chenillard (deux choix) : coffret sur le garde-boue arrière droit, à bobine de
 * cuivre et voyant ambre pour le premier (plus vite, plus fort), à caisson d'acier et lanterne verte pour le second.
 * `pos` : pied du coffret.
 */
export function amenagements(a: string, b: string, pos: Vec3 = [0.66, 0.48, -1.1]): Part[] {
  const [x, y, z] = pos;
  return [
    ...groupe(`si:${a}#fixe_a`, [
      { shape: "box", size: [0.28, 0.2, 0.24], pos: [x, q(y + 0.1), z], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.26, pos: [x, q(y + 0.32), z], color: "copper" },
      { shape: "torus", radius: 0.12, tube: 0.025, sides: 10, pos: [x, q(y + 0.28), z], color: "steel" },
      { shape: "torus", radius: 0.12, tube: 0.025, sides: 10, pos: [x, q(y + 0.38), z], color: "steel" },
      { shape: "sphere", radius: 0.07, pos: [x, q(y + 0.52), z], color: "amber" },
    ]),
    ...groupe(`si:${b}#fixe_b`, [
      { shape: "bevel", size: [0.3, 0.36, 0.26], pos: [x, q(y + 0.18), z], bevel: 0.04, color: "steel" },
      { shape: "box", size: [0.31, 0.06, 0.27], pos: [x, q(y + 0.24), z], color: "faction" },
      { shape: "cylinder", sides: 5, radius: 0.02, height: 0.4, pos: [x, q(y + 0.54), z], color: "dark" },
      { shape: "sphere", radius: 0.07, pos: [x, q(y + 0.76), z], color: "acid" },
    ]),
  ];
}
