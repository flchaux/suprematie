// Unités et bâtiments inspirés des portes des étoiles et des droïdes : droïde roulant, réplicateur,
// disrupteur, ruche de réplicateurs, ruine des Anciens (EPPZ), socle à EPPZ.
//
// Droïde roulant : deux états dans un même modèle. Pivot « boule » : coque bronze à côtes, visible
// quand il roule (le jeu la fait tourner selon la distance parcourue). Pivots « deplie… » : trois pattes
// arquées, corps en éventail, tête et deux blasters (« deplie_tourelle » vise sa cible) ; ils sortent
// quand il se déploie, la boule rentre.
//
// Réplicateur : araignée faite de petits blocs argentés, cœur bleu lumineux, six pattes en blocs sur
// pivots « jambe… » (marche en trépied).
//
// Disrupteur : fantassin-robot trapu à long fusil à bobines bleues (pivot « tourelle » : buste et arme).
//
// Ruche : coque de vaisseau échouée faite de blocs, coutures lumineuses, blocs épars autour.
// Ruine des Anciens : dalle de pierre claire, colonnes brisées, arche, piédestal ; l'EPPZ (pivot
// « eppz_cristal ») flotte et tourne tant qu'il n'a pas été pris.
// Socle à EPPZ : berceau à trois griffes et anneaux, EPPZ ambré au centre (pivot « eppz_cristal »).
import type { Model, Part } from "./types.ts";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rad = (d: number) => (d * Math.PI) / 180;

// ---------- Droïde roulant ----------

/** Patte du droïde déployé : arc de trois segments vers le sol, à l'angle `a` (degrés autour de y). */
function patteDroide(a: number): Part[] {
  const s = Math.sin(rad(a));
  const c = Math.cos(rad(a));
  const at = (d: number, y: number): [number, number, number] => [r3(s * d), y, r3(c * d)];
  return [
    { shape: "box", size: [0.12, 0.5, 0.12], pos: at(0.3, 0.78), rot: [r3(-35 * c), 0, r3(35 * s)], color: "steel", parent: "deplie" },
    { shape: "box", size: [0.1, 0.6, 0.1], pos: at(0.62, 0.42), rot: [r3(-20 * c), 0, r3(20 * s)], color: "metal", parent: "deplie" },
    { shape: "cone", sides: 4, radius: 0.08, height: 0.22, pos: at(0.76, 0.1), rot: [180, 0, 0], color: "dark", parent: "deplie" },
  ];
}

const roll_droid: Model = {
  parts: [
    // boule : coque bronze, côtes sombres, œil rouge
    { shape: "sphere", radius: 0.55, detail: 1, pos: [0, 0.55, 0], color: "copper", pivot: "boule" },
    { shape: "torus", radius: 0.55, tube: 0.05, sides: 14, pos: [0, 0.55, 0], rot: [0, 0, 90], color: "dark", parent: "boule" },
    { shape: "torus", radius: 0.55, tube: 0.05, sides: 14, pos: [0, 0.55, 0], rot: [0, 90, 90], color: "dark", parent: "boule" },
    { shape: "torus", radius: 0.55, tube: 0.04, sides: 14, pos: [0, 0.55, 0], color: "faction", parent: "boule" },
    { shape: "box", size: [0.14, 0.08, 0.05], pos: [0, 0.75, 0.52], color: "red", parent: "boule" },
    // déployé : trois pattes, corps en éventail (aux couleurs de l'équipe), tête et blasters
    { shape: "cylinder", sides: 8, radius: 0.16, height: 0.3, pos: [0, 0.95, 0], color: "dark", pivot: "deplie" },
    ...patteDroide(0),
    ...patteDroide(120),
    ...patteDroide(240),
    { shape: "bevel", size: [0.5, 0.36, 0.3], pos: [0, 1.25, -0.05], bevel: 0.05, color: "copper", pivot: "deplie_tourelle" },
    { shape: "bevel", size: [0.62, 0.08, 0.36], pos: [0, 1.46, -0.08], bevel: 0.03, color: "faction", parent: "deplie_tourelle" },
    { shape: "sphere", radius: 0.14, detail: 1, pos: [0, 1.5, 0.16], scale: [1, 0.8, 1.1], color: "dark", parent: "deplie_tourelle" },
    { shape: "box", size: [0.08, 0.05, 0.04], pos: [0, 1.52, 0.29], color: "red", parent: "deplie_tourelle" },
    { shape: "cylinder", sides: 6, radius: 0.045, height: 0.5, pos: [0.22, 1.18, 0.32], rot: [90, 0, 0], color: "dark", mirror: true, parent: "deplie_tourelle" },
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.06, pos: [0.22, 1.18, 0.58], rot: [90, 0, 0], color: "glow", mirror: true, parent: "deplie_tourelle" },
  ],
};

// ---------- Réplicateur ----------

/** Patte en blocs du réplicateur, hanche en (±x, y, z), pivot `name`. */
function patteBloc(name: string, side: 1 | -1, z: number, yaw: number): Part[] {
  const s = side;
  const c = Math.cos(rad(yaw));
  const sn = Math.sin(rad(yaw));
  const p = (d: number, y: number): [number, number, number] => [r3(s * (0.3 + d * c)), y, r3(z + d * sn)];
  return [
    { shape: "box", size: [0.14, 0.14, 0.14], pos: p(0, 0.55), color: "steel", pivot: name },
    { shape: "box", size: [0.42, 0.1, 0.1], pos: p(0.24, 0.66), rot: [0, -s * yaw, s * -24], color: "metal", parent: name },
    { shape: "box", size: [0.12, 0.12, 0.12], pos: p(0.46, 0.74), color: "steel", parent: name },
    { shape: "box", size: [0.09, 0.62, 0.09], pos: p(0.58, 0.42), rot: [0, 0, s * 14], color: "metal", parent: name },
    { shape: "box", size: [0.11, 0.08, 0.11], pos: p(0.64, 0.08), color: "dark", parent: name },
  ];
}

const replicator: Model = {
  parts: [
    // corps en blocs, cœur bleu
    { shape: "box", size: [0.5, 0.3, 0.7], pos: [0, 0.62, 0], color: "steel" },
    { shape: "box", size: [0.3, 0.2, 0.3], pos: [0.12, 0.84, 0.12], color: "metal" },
    { shape: "box", size: [0.26, 0.18, 0.26], pos: [-0.12, 0.82, -0.16], color: "light" },
    { shape: "box", size: [0.22, 0.16, 0.22], pos: [0.02, 0.96, -0.02], color: "metal" },
    { shape: "box", size: [0.18, 0.12, 0.3], pos: [0, 0.6, 0.48], color: "metal" },
    { shape: "box", size: [0.2, 0.14, 0.06], pos: [0, 0.62, 0.36], color: "glow" },
    { shape: "box", size: [0.06, 0.06, 0.06], pos: [0.12, 0.68, 0.64], color: "glow", mirror: true },
    { shape: "box", size: [0.3, 0.06, 0.5], pos: [0, 0.46, 0], color: "dark" },
    // pinces avant
    { shape: "box", size: [0.06, 0.06, 0.32], pos: [0.12, 0.5, 0.74], rot: [0, -16, 0], color: "light", mirror: true },
    ...patteBloc("jambe_t_d", 1, 0.25, 25),
    ...patteBloc("jambe_t_g", -1, 0.25, 25),
    ...patteBloc("jambe_ar_m_d", 1, 0, 0),
    ...patteBloc("jambe_ar_m_g", -1, 0, 0),
    ...patteBloc("jambe_q_d", 1, -0.25, -25),
    ...patteBloc("jambe_q_g", -1, -0.25, -25),
  ],
};

// ---------- Disrupteur ----------

const disruptor: Model = {
  parts: [
    // jambes courtes et bassin
    { shape: "box", size: [0.18, 0.55, 0.22], pos: [0.2, 0.3, 0], color: "dark", mirror: true },
    { shape: "box", size: [0.24, 0.08, 0.34], pos: [0.2, 0.04, 0.04], color: "metal", mirror: true },
    { shape: "bevel", size: [0.6, 0.2, 0.36], pos: [0, 0.66, 0], bevel: 0.04, color: "metal" },
    // buste, tête, fusil à bobines (tourelle)
    { shape: "bevel", size: [0.62, 0.5, 0.42], pos: [0, 1.0, 0], bevel: 0.06, color: "faction", pivot: "tourelle" },
    { shape: "bevel", size: [0.3, 0.24, 0.3], pos: [0, 1.38, 0.02], bevel: 0.05, color: "light", parent: "tourelle" },
    { shape: "box", size: [0.22, 0.06, 0.04], pos: [0, 1.4, 0.18], color: "glow", parent: "tourelle" },
    { shape: "box", size: [0.14, 0.4, 0.14], pos: [0.38, 0.98, 0.08], color: "dark", mirror: true, parent: "tourelle" },
    { shape: "cylinder", sides: 8, radius: 0.07, height: 1.1, pos: [0.24, 0.98, 0.5], rot: [90, 0, 0], color: "steel", parent: "tourelle" },
    ...[0.32, 0.5, 0.68].map((z): Part => ({ shape: "torus", radius: 0.11, tube: 0.03, sides: 10, pos: [0.24, 0.98, z], color: "glow", parent: "tourelle" })),
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.08, pos: [0.24, 0.98, 1.06], rot: [90, 0, 0], color: "glow", parent: "tourelle" },
    { shape: "box", size: [0.2, 0.26, 0.3], pos: [0, 1.05, -0.32], color: "dark", parent: "tourelle" },
  ],
};

// ---------- Ruche de réplicateurs ----------

const replicator_hive: Model = {
  parts: [
    { shape: "bevel", size: [3, 0.14, 3], pos: [0, 0.07, 0], bevel: 0.05, color: "dry" },
    // coque échouée, inclinée, faite de grands blocs
    { shape: "bevel", size: [2.2, 0.8, 1.2], pos: [0, 0.55, 0], rot: [0, 18, -8], bevel: 0.08, color: "steel" },
    { shape: "bevel", size: [1.4, 0.6, 0.9], pos: [-0.3, 1.1, 0.1], rot: [0, 18, -14], bevel: 0.06, color: "metal" },
    { shape: "wedge", size: [0.9, 0.5, 0.9], pos: [1.1, 0.5, 0.35], rot: [0, 108, 0], color: "steel" },
    { shape: "bevel", size: [0.8, 0.4, 0.6], pos: [-1.0, 0.36, -0.55], rot: [0, 30, 10], bevel: 0.04, color: "light" },
    // coutures lumineuses et ouverture
    { shape: "box", size: [2.0, 0.05, 0.05], pos: [0, 0.96, 0.56], rot: [0, 18, -8], color: "glow" },
    { shape: "box", size: [1.2, 0.05, 0.05], pos: [-0.3, 1.42, 0.5], rot: [0, 18, -14], color: "glow" },
    { shape: "box", size: [0.5, 0.36, 0.06], pos: [0.45, 0.6, 0.72], rot: [0, 18, 0], color: "black" },
    { shape: "box", size: [0.4, 0.04, 0.04], pos: [0.45, 0.8, 0.76], rot: [0, 18, 0], color: "glow" },
    // blocs épars (réplicateurs au repos)
    ...[[1.2, -1.0], [-1.25, 0.9], [0.4, 1.25], [-0.2, -1.25], [1.3, 0.95]].map(([x, z], i): Part => ({ shape: "box", size: [0.2, 0.2, 0.2], pos: [x, 0.24, z], rot: [0, i * 37, 0], color: i % 2 ? "metal" : "steel" })),
    { shape: "box", size: [0.12, 0.12, 0.12], pos: [1.2, 0.42, -1.0], rot: [0, 20, 0], color: "light" },
  ],
};

// ---------- Ruine des Anciens ----------

/** EPPZ : cristal ambré en double pointe, cerclé (pivot « eppz_cristal » : il tourne, et disparaît une fois pris). */
function eppz(y: number): Part[] {
  return [
    { shape: "cone", sides: 6, radius: 0.16, height: 0.34, pos: [0, y + 0.17, 0], color: "amber", pivot: "eppz_cristal" },
    { shape: "cone", sides: 6, radius: 0.16, height: 0.26, pos: [0, y - 0.13, 0], rot: [180, 0, 0], color: "amber", parent: "eppz_cristal" },
    { shape: "torus", radius: 0.21, tube: 0.025, sides: 12, pos: [0, y, 0], color: "steel", parent: "eppz_cristal" },
    { shape: "sphere", radius: 0.09, detail: 1, pos: [0, y, 0], color: "glow", parent: "eppz_cristal" },
  ];
}

const ancient_ruin: Model = {
  parts: [
    // dalle de pierre claire et marches
    { shape: "bevel", size: [3, 0.2, 3], pos: [0, 0.1, 0], bevel: 0.06, color: "concrete" },
    { shape: "bevel", size: [2.2, 0.14, 2.2], pos: [0, 0.27, 0], bevel: 0.04, color: "light" },
    // colonnes brisées aux quatre coins
    ...[[1.15, 1.15, 1.2], [-1.15, 1.15, 0.7], [1.15, -1.15, 0.5], [-1.15, -1.15, 1.4]].flatMap(([x, z, h]): Part[] => [
      { shape: "cylinder", sides: 8, radius: 0.16, height: h, pos: [x, 0.2 + h / 2, z], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.21, height: 0.08, pos: [x, 0.24, z], color: "concrete" },
    ]),
    // arche à l'arrière, glyphes lumineux
    { shape: "box", size: [0.2, 1.5, 0.2], pos: [0.55, 0.95, -0.9], color: "light", mirror: true },
    { shape: "box", size: [1.3, 0.2, 0.24], pos: [0, 1.75, -0.9], color: "light" },
    ...[-0.36, -0.12, 0.12, 0.36].map((x): Part => ({ shape: "box", size: [0.12, 0.08, 0.02], pos: [x, 1.75, -0.77], color: "glow" })),
    // piédestal et l'EPPZ qui flotte au-dessus
    { shape: "lathe", sides: 10, pos: [0, 0.34, 0.15], color: "concrete", profile: [[0, 0], [0.36, 0], [0.3, 0.12], [0.2, 0.18], [0.2, 0.5], [0.3, 0.56], [0.3, 0.62], [0, 0.62]] },
    { shape: "torus", radius: 0.26, tube: 0.02, sides: 12, pos: [0, 0.97, 0.15], color: "amber" },
    ...eppz(1.35).map((p): Part => ({ ...p, pos: [p.pos![0], p.pos![1], r3(p.pos![2] + 0.15)] })),
  ],
};

// ---------- Socle à EPPZ ----------

const eppz_socket: Model = {
  parts: [
    { shape: "bevel", size: [2, 0.16, 2], pos: [0, 0.08, 0], bevel: 0.05, color: "dark" },
    { shape: "cylinder", sides: 12, radius: 0.72, height: 0.2, bevel: 0.04, pos: [0, 0.26, 0], color: "metal" },
    { shape: "box", size: [0.6, 0.04, 0.03], pos: [0.5, 0.09, 0.985], color: "glow", mirror: true },
    // trois griffes du berceau
    ...[0, 120, 240].flatMap((a): Part[] => {
      const s = Math.sin(rad(a));
      const c = Math.cos(rad(a));
      return [
        { shape: "box", size: [0.14, 0.7, 0.14], pos: [r3(s * 0.52), 0.66, r3(c * 0.52)], rot: [r3(-14 * c), 0, r3(14 * s)], color: "faction" },
        { shape: "box", size: [0.12, 0.3, 0.12], pos: [r3(s * 0.38), 1.08, r3(c * 0.38)], rot: [r3(28 * c), 0, r3(-28 * s)], color: "steel" },
      ];
    }),
    { shape: "torus", radius: 0.5, tube: 0.03, sides: 16, pos: [0, 0.5, 0], color: "glow" },
    { shape: "torus", radius: 0.4, tube: 0.025, sides: 16, pos: [0, 1.0, 0], color: "amber" },
    ...eppz(0.85),
  ],
};

export const ANCIENT_UNIT_MODELS: Record<string, Model> = { roll_droid, replicator, disruptor };
export const ANCIENT_BUILDING_MODELS: Record<string, Model> = { replicator_hive, ancient_ruin, eppz_socket };
