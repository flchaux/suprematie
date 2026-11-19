// Décorations du sol (herbes, buissons, arbres, rochers, débris, cristaux…) : petits modèles low-poly.
// Des milliers à l'écran : quelques dizaines à 150 triangles chacun. Clé = sorte de décoration
// (KINDS de packages/client/src/render/decor.ts). Repère : base à y = 0 ; le jeu ramène la plus
// grande dimension du modèle à 1 puis applique la taille de la décoration, une rotation et une teinte.
import type { ColorName, Model, Part } from "./types.ts";

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Brin fin (cône à 3 faces) planté en (x, z), haut de `h`, penché de `lean` degrés vers la
 * direction `dir` (degrés autour de y, 0 = +z, 90 = +x).
 */
function blade(x: number, z: number, h: number, lean: number, dir: number, color: ColorName, radius = 0.045, sides = 3): Part {
  const l = (lean * Math.PI) / 180;
  const d = (dir * Math.PI) / 180;
  const dx = Math.sin(d);
  const dz = Math.cos(d);
  const off = (Math.sin(l) * h) / 2;
  return {
    shape: "cone",
    sides,
    radius,
    height: h,
    pos: [r3(x + dx * off), r3((Math.cos(l) * h) / 2), r3(z + dz * off)],
    rot: [r3(lean * dz), 0, r3(-lean * dx)],
    color,
  };
}

/** Bâton (cylindre fin) qui part de (x, y, z), long de `h`, penché comme `blade`. */
function stick(x: number, y: number, z: number, h: number, lean: number, dir: number, radius: number, color: ColorName, sides = 4): Part {
  const p = blade(x, z, h, lean, dir, color, radius, sides);
  return { ...p, shape: "cylinder", radiusTop: radius * 0.6, pos: [p.pos![0], r3(p.pos![1] + y), p.pos![2]] };
}

/** Étage de sapin (cône) et, pour le sapin enneigé, sa calotte de neige. */
function tier(y: number, radius: number, height: number, color: ColorName, snow: boolean): Part[] {
  const parts: Part[] = [{ shape: "cone", sides: 6, radius, height, pos: [0, r3(y + height / 2), 0], color }];
  if (snow) {
    // la calotte déborde sous l'étage du dessus : de la neige reste visible sur chaque étage
    const k = 0.76;
    const sh = height * k + 0.03;
    parts.push({ shape: "cone", sides: 6, radius: r3(radius * k + 0.03), height: r3(sh), pos: [0, r3(y + height + 0.03 - sh / 2), 0], color: "snow" });
  }
  return parts;
}

function pine(snow: boolean): Model {
  const green: ColorName = "leaf_dark";
  return {
    parts: [
      { shape: "cylinder", sides: 5, radius: 0.09, radiusTop: 0.06, height: 0.5, pos: [0, 0.25, 0], color: "wood" },
      ...tier(0.32, 0.62, 0.95, green, snow),
      ...tier(0.85, 0.48, 0.8, green, snow),
      ...tier(1.32, 0.33, 0.72, green, snow),
    ],
  };
}

export const DECOR_MODELS: Record<string, Model> = {
  /** Touffe d'herbe : neuf brins écartés. */
  grass_tuft: {
    parts: [
      blade(0, 0, 0.75, 4, 0, "leaf", 0.075),
      blade(0.06, 0.04, 0.62, 22, 70, "leaf", 0.075),
      blade(-0.06, 0.03, 0.58, 24, -60, "leaf_dark", 0.075),
      blade(0.02, -0.06, 0.6, 20, 170, "leaf", 0.075),
      blade(-0.05, -0.05, 0.5, 30, -140, "leaf", 0.075),
      blade(0.08, -0.03, 0.48, 32, 120, "leaf_dark", 0.075),
      blade(-0.08, 0.06, 0.45, 34, -20, "leaf", 0.075),
      blade(0.04, 0.08, 0.52, 28, 20, "dry", 0.075),
      blade(-0.02, -0.1, 0.4, 38, -170, "leaf_dark", 0.075),
    ],
  },

  /** Buisson : quatre boules à facettes, la base plus sombre. */
  bush: {
    parts: [
      { shape: "sphere", radius: 0.42, pos: [0, 0.3, 0], scale: [1.15, 0.8, 1.05], color: "leaf_dark" },
      { shape: "sphere", radius: 0.3, pos: [0.26, 0.42, 0.12], color: "leaf" },
      { shape: "sphere", radius: 0.28, pos: [-0.22, 0.46, -0.08], color: "leaf" },
      { shape: "sphere", radius: 0.24, pos: [0.02, 0.62, -0.02], rot: [20, 30, 0], color: "leaf" },
    ],
  },

  /** Fleurs des champs : quelques feuilles et cinq corolles (pentagones) jaunes, blanches et rouge. */
  flowers: {
    parts: [
      blade(0, 0, 0.4, 30, 40, "leaf"),
      blade(-0.03, 0.02, 0.38, 32, -120, "leaf"),
      blade(0, 0.03, 0.34, 36, -20, "leaf_dark"),
      blade(0.12, 0.1, 0.62, 10, 40, "leaf", 0.025),
      blade(-0.14, 0.06, 0.55, 12, -60, "leaf", 0.025),
      blade(0.05, -0.15, 0.5, 14, 170, "leaf", 0.025),
      blade(-0.08, -0.1, 0.66, 8, -150, "leaf", 0.025),
      blade(0.2, -0.04, 0.45, 16, 100, "leaf", 0.025),
      { shape: "cylinder", sides: 5, radius: 0.11, height: 0.05, pos: [0.14, 0.62, 0.12], rot: [0, 45, 0], color: "flower" },
      { shape: "cylinder", sides: 5, radius: 0.1, height: 0.05, pos: [-0.16, 0.55, 0.07], rot: [0, 20, 0], color: "light" },
      { shape: "cylinder", sides: 5, radius: 0.1, height: 0.05, pos: [0.07, 0.5, -0.17], rot: [0, 60, 0], color: "flower" },
      { shape: "cylinder", sides: 5, radius: 0.11, height: 0.05, pos: [-0.09, 0.66, -0.11], rot: [0, 10, 0], color: "red" },
      { shape: "cylinder", sides: 5, radius: 0.1, height: 0.05, pos: [0.23, 0.45, -0.05], rot: [0, 35, 0], color: "light" },
    ],
  },

  /** Sapin : tronc et trois étages de cônes. */
  conifer: pine(false),

  /** Souche : tronc court au cœur clair, trois racines. */
  stump: {
    parts: [
      { shape: "cylinder", sides: 7, radius: 0.3, radiusTop: 0.25, height: 0.36, pos: [0, 0.18, 0], color: "wood" },
      { shape: "cylinder", sides: 7, radius: 0.22, height: 0.03, pos: [0, 0.36, 0], color: "dry" },
      { shape: "wedge", size: [0.14, 0.18, 0.3], pos: [0, 0.08, 0.36], color: "wood" },
      { shape: "wedge", size: [0.14, 0.16, 0.28], pos: [0.31, 0.07, -0.18], rot: [0, 120, 0], color: "wood" },
      { shape: "wedge", size: [0.13, 0.15, 0.26], pos: [-0.31, 0.07, -0.16], rot: [0, -120, 0], color: "wood" },
    ],
  },

  /** Arbre mort : tronc nu et quatre branches. */
  dead_tree: {
    parts: [
      { shape: "cylinder", sides: 5, radius: 0.12, radiusTop: 0.05, height: 1.6, pos: [0, 0.8, 0], color: "wood" },
      stick(0, 0.7, 0, 0.6, 50, 30, 0.045, "wood"),
      stick(0, 0.95, 0, 0.5, 55, -120, 0.04, "wood"),
      stick(0, 1.15, 0, 0.42, 45, 150, 0.035, "wood"),
      stick(0, 0.45, 0, 0.4, 62, -40, 0.04, "wood"),
    ],
  },

  /** Broussaille sèche : brindilles paille autour d'une petite boule. */
  dry_shrub: {
    parts: [
      { shape: "sphere", radius: 0.12, pos: [0, 0.05, 0], scale: [1.3, 0.6, 1.2], color: "wood" },
      blade(0, 0, 0.62, 14, 0, "dry", 0.05),
      blade(0.03, 0.02, 0.58, 38, 50, "dry", 0.05),
      blade(0.02, -0.03, 0.6, 36, 125, "wood", 0.045),
      blade(-0.02, -0.03, 0.55, 42, 185, "dry", 0.05),
      blade(-0.03, 0.01, 0.58, 34, 245, "dry", 0.05),
      blade(-0.01, 0.03, 0.52, 46, 305, "wood", 0.045),
      blade(0, 0, 0.5, 58, 90, "dry", 0.045),
      blade(0, 0, 0.5, 60, -85, "dry", 0.045),
      blade(0, 0, 0.46, 62, 160, "dry", 0.045),
      blade(0, 0, 0.46, 60, 20, "dry", 0.045),
    ],
  },

  /** Cailloux : trois pierres à facettes. */
  rocks: {
    parts: [
      { shape: "sphere", radius: 0.26, pos: [0, 0.1, 0], rot: [10, 20, 0], scale: [1.2, 0.7, 1], color: "rock" },
      { shape: "sphere", radius: 0.18, pos: [0.3, 0.06, 0.16], rot: [0, 40, 25], scale: [1.1, 0.7, 0.9], color: "rock" },
      { shape: "sphere", radius: 0.14, pos: [-0.24, 0.05, 0.2], rot: [30, 0, 10], scale: [1, 0.75, 1.2], color: "rock" },
    ],
  },

  /** Rocher : gros bloc et deux éclats, un peu de mousse. */
  boulder: {
    parts: [
      { shape: "sphere", radius: 0.55, pos: [0, 0.3, 0], rot: [12, 30, 8], scale: [1.15, 0.85, 1], color: "rock" },
      { shape: "sphere", radius: 0.3, pos: [0.52, 0.12, 0.2], rot: [0, 50, 20], scale: [1, 0.8, 1.1], color: "rock" },
      { shape: "sphere", radius: 0.2, pos: [-0.45, 0.08, 0.32], rot: [20, 10, 0], color: "rock" },
      { shape: "sphere", radius: 0.3, pos: [-0.1, 0.66, -0.12], scale: [1.3, 0.3, 1.1], color: "leaf_dark" },
    ],
  },

  /** Roseaux : tiges hautes et trois massettes brunes. */
  reeds: {
    parts: [
      blade(0, 0, 1.1, 4, 0, "leaf", 0.035),
      blade(0.1, 0.05, 1.0, 10, 60, "leaf", 0.035),
      blade(-0.1, 0.04, 0.95, 12, -70, "leaf_dark", 0.035),
      blade(0.04, -0.1, 0.9, 12, 160, "leaf", 0.035),
      blade(-0.06, -0.08, 0.8, 18, -150, "dry", 0.035),
      blade(0.14, -0.06, 0.7, 26, 110, "leaf_dark", 0.04),
      blade(-0.14, 0.1, 0.65, 28, -30, "leaf", 0.04),
      blade(0.02, 0.14, 0.6, 30, 10, "leaf_dark", 0.04),
      { shape: "cylinder", sides: 4, radius: 0.045, height: 0.2, pos: [0.02, 0.98, 0.0], color: "wood" },
      { shape: "cylinder", sides: 4, radius: 0.045, height: 0.18, pos: [0.17, 0.86, 0.1], rot: [6, 0, -10], color: "wood" },
      { shape: "cylinder", sides: 4, radius: 0.04, height: 0.16, pos: [-0.18, 0.8, 0.06], rot: [0, 0, 12], color: "wood" },
    ],
  },

  /** Tronc abattu : bûche couchée au cœur clair, mousse, branche cassée, champignons et herbes au pied. */
  fallen_log: {
    parts: [
      { shape: "cylinder", sides: 7, radius: 0.17, radiusTop: 0.14, height: 1.05, pos: [0, 0.15, 0], rot: [0, 0, 90], color: "wood" },
      { shape: "cylinder", sides: 7, radius: 0.14, height: 0.03, pos: [0.535, 0.15, 0], rot: [0, 0, 90], color: "dry" },
      { shape: "cylinder", sides: 7, radius: 0.11, height: 0.03, pos: [-0.535, 0.15, 0], rot: [0, 0, 90], color: "dry" },
      stick(0.12, 0.22, -0.08, 0.32, 55, 200, 0.045, "wood"),
      { shape: "sphere", detail: 0, radius: 0.13, pos: [-0.18, 0.29, 0.03], scale: [1.7, 0.42, 1.1], color: "leaf" },
      { shape: "sphere", detail: 0, radius: 0.1, pos: [0.26, 0.28, -0.02], scale: [1.4, 0.4, 1.1], color: "leaf_dark" },
      { shape: "cylinder", sides: 5, radius: 0.025, height: 0.1, pos: [0.06, 0.05, 0.2], color: "snow" },
      { shape: "cone", sides: 6, radius: 0.075, height: 0.06, pos: [0.06, 0.12, 0.2], color: "rust" },
      { shape: "cylinder", sides: 5, radius: 0.02, height: 0.07, pos: [0.14, 0.035, 0.22], color: "snow" },
      { shape: "cone", sides: 6, radius: 0.055, height: 0.045, pos: [0.14, 0.08, 0.22], color: "rust" },
      blade(-0.36, 0.17, 0.3, 26, 20, "leaf"),
      blade(-0.3, -0.18, 0.26, 30, 160, "leaf_dark"),
      blade(0.4, 0.16, 0.24, 30, 60, "leaf"),
    ],
  },

  /** Colonne en ruine : fût de pierre brisé en biseau sur un socle, tambour tombé, lierre et mousse. */
  ruined_pillar: {
    parts: [
      { shape: "bevel", size: [0.62, 0.12, 0.62], pos: [0, 0.06, 0], rot: [0, 12, 0], color: "rock" },
      { shape: "cylinder", sides: 8, radius: 0.2, radiusTop: 0.19, height: 0.72, pos: [0, 0.48, 0], color: "rock" },
      { shape: "wedge", size: [0.38, 0.2, 0.38], pos: [0, 0.94, 0], rot: [0, 25, 0], color: "rock" },
      { shape: "cylinder", sides: 8, radius: 0.18, height: 0.3, pos: [0.44, 0.17, 0.22], rot: [10, 35, 90], color: "rock" },
      { shape: "sphere", detail: 0, radius: 0.12, pos: [0.13, 0.4, 0.12], scale: [0.7, 1.9, 0.7], color: "leaf_dark" },
      { shape: "sphere", detail: 0, radius: 0.1, pos: [-0.15, 0.28, 0.1], scale: [0.8, 1.4, 0.8], color: "leaf" },
      { shape: "sphere", detail: 0, radius: 0.12, pos: [0, 0.86, 0], scale: [1.5, 0.35, 1.5], color: "leaf" },
      blade(-0.27, -0.22, 0.3, 24, -140, "leaf"),
      blade(0.3, -0.25, 0.26, 28, 150, "leaf_dark"),
    ],
  },

  /** Fougère : couronne de frondes arquées vers l'extérieur, cœur plus sombre. */
  fern: {
    parts: [
      ...[0, 45, 90, 135, 180, 225, 270, 315].map((d, i) => blade(0, 0, 0.62 + (i % 3) * 0.06, 62 - (i % 2) * 8, d + (i % 2) * 12, i % 3 ? "leaf" : "leaf_dark", 0.085)),
      ...[20, 140, 260].map((d) => blade(0, 0, 0.5, 32, d, "leaf_dark", 0.07)),
      blade(0, 0, 0.36, 6, 0, "leaf", 0.06),
    ],
  },

  /** Cristaux : aiguilles cyan lumineuses sur un socle de roche. */
  crystal: {
    parts: [
      { shape: "sphere", radius: 0.3, pos: [0, 0.06, 0], scale: [1.3, 0.5, 1.2], color: "rock" },
      { shape: "cone", sides: 5, radius: 0.13, height: 0.95, pos: [0, 0.5, 0], rot: [0, 0, -4], color: "crystal" },
      { shape: "cone", sides: 5, radius: 0.1, height: 0.65, pos: [0.15, 0.33, 0.06], rot: [10, 0, -26], color: "crystal" },
      { shape: "cone", sides: 5, radius: 0.09, height: 0.55, pos: [-0.14, 0.28, 0.08], rot: [14, 0, 28], color: "crystal" },
      { shape: "cone", sides: 5, radius: 0.08, height: 0.45, pos: [0.02, 0.23, -0.16], rot: [-30, 0, 4], color: "crystal" },
    ],
  },

  /** Sapin enneigé : étages verts coiffés de neige. */
  snow_pine: pine(true),

  /** Rocher de glace : blocs bleutés, deux éclats, poudre de neige. */
  ice_rock: {
    parts: [
      { shape: "sphere", radius: 0.42, pos: [0, 0.24, 0], rot: [8, 20, 12], scale: [1.1, 0.85, 1], color: "ice" },
      { shape: "sphere", radius: 0.26, pos: [0.4, 0.12, 0.12], rot: [0, 45, 0], color: "ice" },
      { shape: "cone", sides: 4, radius: 0.12, height: 0.6, pos: [-0.22, 0.3, 0.12], rot: [12, 0, 22], color: "ice" },
      { shape: "cone", sides: 4, radius: 0.1, height: 0.45, pos: [0.18, 0.3, -0.22], rot: [-20, 0, -18], color: "ice" },
      { shape: "sphere", radius: 0.3, pos: [-0.05, 0.5, -0.02], scale: [1.2, 0.3, 1.05], color: "snow" },
    ],
  },
};
