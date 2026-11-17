// Descriptions des objets transportés sur les tapis. Clé = clé de l'objet dans les données du jeu.
// Les pièces « faction » prennent la couleur de l'objet (et non celle du joueur) : cuivre orange,
// circuit vert, etc. Très nombreux à l'écran (jusqu'à 20 000) : 60 triangles au plus chacun.
// Repère : base à y = 0, environ 1 de large (le jeu les réduit à un tiers de case).
import type { Model } from "./types.ts";

/** Petite caisse de données (lots de recherche) : coque sombre, cœur lumineux de la couleur du lot. */
const pack: Model = {
  parts: [
    { shape: "box", size: [0.8, 0.42, 0.6], pos: [0, 0.21, 0], color: "dark" },
    { shape: "box", size: [0.56, 0.2, 0.42], pos: [0, 0.5, 0], color: "faction" },
    { shape: "box", size: [0.82, 0.06, 0.62], pos: [0, 0.3, 0], color: "metal" },
  ],
};

/** Morceau de minerai : roche irrégulière de la couleur du minerai. */
const ore: Model = {
  parts: [
    { shape: "sphere", radius: 0.42, pos: [0, 0.3, 0], scale: [1.15, 0.75, 0.95], color: "faction" },
    { shape: "sphere", radius: 0.22, pos: [0.25, 0.2, 0.15], color: "faction" },
  ],
};

export const ITEM_MODELS: Record<string, Model> = {
  iron_ore: ore,
  copper_ore: ore,
  silicon: {
    parts: [
      { shape: "cone", sides: 5, radius: 0.22, height: 0.8, pos: [0, 0.4, 0], color: "faction" },
      { shape: "cone", sides: 5, radius: 0.16, height: 0.55, pos: [0.25, 0.25, 0.05], rot: [0, 0, -25], color: "faction" },
      { shape: "cone", sides: 5, radius: 0.15, height: 0.5, pos: [-0.22, 0.23, -0.05], rot: [0, 0, 28], color: "faction" },
    ],
  },
  hydrocarbon: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 0.36, height: 0.75, pos: [0, 0.375, 0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.38, height: 0.06, pos: [0, 0.5, 0], color: "metal" },
    ],
  },
  crystal: {
    parts: [
      { shape: "cone", sides: 4, radius: 0.3, height: 0.9, pos: [0, 0.45, 0], color: "glow" },
      { shape: "cone", sides: 4, radius: 0.18, height: 0.5, pos: [0.24, 0.25, 0], rot: [0, 0, -30], color: "glow" },
    ],
  },
  iron_plate: {
    parts: [
      { shape: "box", size: [0.9, 0.1, 0.7], pos: [0, 0.05, 0], color: "faction" },
      { shape: "box", size: [0.9, 0.1, 0.7], pos: [0.04, 0.16, -0.03], color: "faction" },
      { shape: "box", size: [0.9, 0.1, 0.7], pos: [-0.02, 0.27, 0.02], color: "faction" },
    ],
  },
  copper_plate: {
    parts: [
      { shape: "box", size: [0.9, 0.1, 0.7], pos: [0, 0.05, 0], color: "faction" },
      { shape: "box", size: [0.9, 0.1, 0.7], pos: [0.04, 0.16, -0.03], color: "faction" },
      { shape: "box", size: [0.9, 0.1, 0.7], pos: [-0.02, 0.27, 0.02], color: "faction" },
    ],
  },
  steel: {
    parts: [{ shape: "bevel", size: [0.5, 0.28, 1.0], bevel: 0.08, pos: [0, 0.14, 0], color: "faction" }],
  },
  wafer: {
    parts: [{ shape: "cylinder", sides: 10, radius: 0.48, height: 0.06, pos: [0, 0.03, 0], color: "faction" }],
  },
  gear: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.42, height: 0.16, pos: [0, 0.08, 0], color: "faction" },
      { shape: "box", size: [1.0, 0.14, 0.16], pos: [0, 0.08, 0], color: "faction" },
      { shape: "box", size: [0.16, 0.14, 1.0], pos: [0, 0.08, 0], color: "faction" },
      { shape: "box", size: [0.22, 0.2, 0.22], pos: [0, 0.1, 0], color: "dark" },
    ],
  },
  cable: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.32, pos: [0, 0.16, 0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 0.36, pos: [0, 0.18, 0], color: "dark" },
    ],
  },
  circuit: {
    parts: [
      { shape: "box", size: [0.9, 0.08, 0.7], pos: [0, 0.04, 0], color: "faction" },
      { shape: "box", size: [0.3, 0.1, 0.3], pos: [-0.15, 0.13, 0.05], color: "black" },
      { shape: "box", size: [0.18, 0.08, 0.18], pos: [0.25, 0.12, -0.15], color: "light" },
    ],
  },
  engine: {
    parts: [
      { shape: "box", size: [0.7, 0.45, 0.6], pos: [0, 0.225, 0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.5, pos: [0, 0.3, 0.3], rot: [90, 0, 0], color: "metal" },
      { shape: "box", size: [0.5, 0.06, 0.06], pos: [0, 0.47, 0], color: "glow" },
    ],
  },
  ammo: {
    parts: [
      { shape: "box", size: [0.85, 0.4, 0.6], pos: [0, 0.2, 0], color: "dark" },
      { shape: "box", size: [0.7, 0.12, 0.45], pos: [0, 0.45, 0], color: "faction" },
      { shape: "box", size: [0.88, 0.06, 0.62], pos: [0, 0.3, 0], color: "hazard" },
    ],
  },
  processor: {
    parts: [
      { shape: "box", size: [0.8, 0.1, 0.8], pos: [0, 0.05, 0], color: "faction" },
      { shape: "box", size: [0.42, 0.08, 0.42], pos: [0, 0.14, 0], color: "black" },
      { shape: "box", size: [0.2, 0.04, 0.2], pos: [0, 0.2, 0], color: "glow" },
    ],
  },
  fuel: {
    parts: [
      { shape: "box", size: [0.6, 0.75, 0.4], pos: [0, 0.375, 0], color: "faction" },
      { shape: "box", size: [0.62, 0.1, 0.42], pos: [0, 0.45, 0], color: "black" },
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.14, pos: [0.15, 0.8, 0], color: "metal" },
    ],
  },
  composite: {
    parts: [
      { shape: "box", size: [0.9, 0.12, 0.7], pos: [0, 0.06, 0], color: "faction" },
      { shape: "box", size: [0.9, 0.12, 0.7], pos: [0.03, 0.19, 0.03], rot: [0, 8, 0], color: "faction" },
      { shape: "box", size: [0.92, 0.03, 0.2], pos: [0, 0.27, 0], color: "metal" },
    ],
  },
  refined_crystal: {
    parts: [
      { shape: "cone", sides: 6, radius: 0.32, height: 0.45, pos: [0, 0.6, 0], color: "glow" },
      { shape: "cone", sides: 6, radius: 0.32, height: 0.38, pos: [0, 0.19, 0], rot: [180, 0, 0], color: "glow" },
    ],
  },
  energy_cell: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.28, height: 0.8, pos: [0, 0.4, 0], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.29, height: 0.4, pos: [0, 0.4, 0], color: "faction" },
      { shape: "box", size: [0.18, 0.1, 0.18], pos: [0, 0.85, 0], color: "dark" },
    ],
  },
  arm_part: {
    parts: [
      { shape: "box", size: [0.25, 0.25, 0.9], pos: [0, 0.2, 0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.32, pos: [0, 0.2, -0.4], rot: [0, 0, 90], color: "metal" },
    ],
  },
  pack1: pack,
  pack2: pack,
  pack3: pack,
  pack4: pack,
  pack5: pack,
  pack6: pack,
};
