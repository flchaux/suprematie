// Berger des Transhumants (shepherd) : marcheur géant de commandement, bâti de ferraille, voûté. Buste de chaudière à
// foyer ambre (pivot « tourelle », sur l'axe), épaules de cabines de camion, houppelande de bâche, tête basse à câbles
// pendants sous un dôme de capteurs à collerette, jambes de poutrelles guêtrées de toile (pivots « jambe_d », « jambe_g »),
// bras gauche à pince ; bras droit et mât émetteur (flèche de grue à couronne d'électrodes), qui tire les décharges d'arc,
// en pivot « coup|… » à l'épaule : il le pointe vers sa cible à chaque tir.
// Équipements : voir sim/src/ameliorations/table.rs et docs/spec/races.md ; jambes télescopiques modelées sous y = 0
// (`lift`).
// Repère : +x à droite, +y en haut, +z vers l'avant. Les pièces « si: » ne comptent pas dans la taille du modèle.
import type { Part, Vec3 } from "../types.ts";
import { q, coffre } from "./commun.ts";
import type { C } from "./commun.ts";
import { cote, entre, porte } from "./matin.ts";

const fin = (p: Part): Part => ({ ...p, fine: true });

// ——— Articulations ———
const HANCHE: Vec3 = [0.6, 1.95, 0];
const AXE: Vec3 = [0, 2.4, 0];
const EPAULE: Vec3 = [1.42, 3.42, 0.05];
/** Axe du mât émetteur (x, z). */
const HX = 1.8;
const HZ = 1.0;
/** Tir : le bras pointe le mât vers l'avant (degrés). */
const FRAPPE = "coup|x,30";

/** Hauteur dont les jambes télescopiques soulèvent le Berger (unités du modèle). */
export const TELESCOPE = 1.7;

/** Segment tourné d'une nappe conique (toile, tôle) : de l'angle `phi` (0 : avant, 180 : dos), sur `arc` degrés. */
function pan(y: number, rh: number, rb: number, h: number, ep: number, phi: number, arc: number, color: C, sides = 1, z = 0): Part {
  return { shape: "lathe", sides, smooth: false, profile: [[rb, -h], [rh, 0], [q(rh - ep), 0], [q(rb - ep), -h], [rb, -h]], arc, pos: [0, y, z], rot: [0, phi, 0], color };
}

/** Point du buste : hauteur `h` le long de la chaudière (penchée de 14° vers l'avant), avance `d` devant son axe, écart `x`. */
function buste(x: number, h: number, d: number): Vec3 {
  const a = (14 * Math.PI) / 180;
  return [x, q(2.35 + Math.cos(a) * h - Math.sin(a) * d), q(-0.1 + Math.sin(a) * h + Math.cos(a) * d)];
}

// ——— Modèle d'origine ———

function jambe(): Part[] {
  const H = HANCHE;
  const K: Vec3 = [0.72, 1.12, 0.16];
  const A: Vec3 = [0.76, 0.34, -0.04];
  return [
    { shape: "cylinder", sides: 10, radius: 0.32, height: 0.44, pos: H, rot: [0, 0, 90], color: "steel" },
    entre(H, K, 0.44, 0.5, { shape: "box", color: "rust" }),
    { shape: "box", size: [0.46, 0.5, 0.07], pos: [0.68, 1.6, 0.34], rot: [-10, 0, 0], color: "faction" },
    { shape: "box", size: [0.07, 0.56, 0.36], pos: [0.93, 1.6, 0.06], color: "metal", fine: true },
    // genou : roue de tracteur
    { shape: "cylinder", sides: 10, radius: 0.32, height: 0.46, pos: K, rot: [0, 0, 90], color: "rubber" },
    { shape: "cylinder", sides: 6, radius: 0.16, height: 0.54, pos: K, rot: [0, 0, 90], color: "hazard", fine: true },
    // tibia et guêtres de toile sanglées
    entre(K, A, 0.4, 0.46, { shape: "box", color: "metal" }),
    entre([0.73, 0.92, 0.1], [0.755, 0.42, -0.02], 0.36, 0, { shape: "cylinder", sides: 7, radiusTop: 0.31, color: "dry" }),
    entre([0.73, 0.84, 0.08], [0.735, 0.74, 0.06], 0.39, 0, { shape: "cylinder", sides: 7, color: "faction" }),
    fin(entre([0.5, 1.7, -0.28], [0.56, 0.7, -0.26], 0.07, 0, { shape: "cylinder", sides: 6, color: "copper" })),
    fin(entre([0.5, 1.3, -0.28], [0.55, 0.5, -0.26], 0.045, 0, { shape: "cylinder", sides: 6, color: "light" })),
    // pied : patin de grue
    { shape: "box", size: [0.72, 0.26, 1.2], pos: [0.78, 0.15, 0.12], color: "dark" },
    { shape: "wedge", size: [0.7, 0.24, 0.34], pos: [0.78, 0.15, 0.88], color: "hazard" },
    { shape: "box", size: [0.4, 0.2, 0.5], pos: [0.78, 0.36, 0.1], color: "rust", fine: true },
    fin({ shape: "box", size: [0.78, 0.06, 1.26], pos: [0.78, 0.03, 0.12], color: "rubber" }),
  ];
}

function bassin(): Part[] {
  return [
    { shape: "bevel", size: [1.4, 0.5, 0.86], pos: [0, 2.02, 0], bevel: 0.1, color: "dark" },
    { shape: "box", size: [1.56, 0.2, 1.04], pos: [0, 2.24, 0], color: "faction" },
    // tabliers de bâche, outils à la ceinture
    { shape: "box", size: [0.72, 0.86, 0.06], pos: [0, 1.72, 0.56], rot: [-8, 0, 0], color: "dry" },
    { shape: "box", size: [0.72, 0.12, 0.07], pos: [0, 1.4, 0.605], rot: [-8, 0, 0], color: "faction", fine: true },
    { shape: "box", size: [0.86, 0.96, 0.06], pos: [0, 1.68, -0.56], rot: [8, 0, 0], color: "dry" },
    ...coffre([0.84, 1.98, -0.1], [0.28, 0.34, 0.5], "wood").map((p): Part => ({ ...p, mirror: true })),
  ];
}

/** Buste : chaudière, foyer, houppelande, cabines d'épaule, tête, dôme de capteurs, bras gauche. */
function torse(): Part[] {
  const barbe: Part[] = [-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((x, i): Part => ({
    shape: "tube", radius: 0.075, sides: 4, bend: 0.05, color: (["steel", "rust", "light", "steel", "copper", "steel"] as C[])[i], fine: i === 1 || i === 4,
    path: [[x, 3.78, 1.02], [q(x * 1.25), 3.2, 1.16], [q(x * 0.8), q(2.72 + (i % 3) * 0.14), 1.06]],
  }));
  return porte("tourelle", AXE, [
    // chaudière penchée, cerclée de cuivre
    { shape: "lathe", sides: 12, profile: [[0, -0.1], [0.62, -0.1], [0.8, 0.12], [0.94, 0.6], [0.94, 1.2], [0.78, 1.5], [0.4, 1.64], [0, 1.66]], pos: [0, 2.35, -0.1], rot: [14, 0, 0], color: "rust" },
    ...[0.42, 1.2].map((h): Part => ({ shape: "torus", radius: 0.94, tube: 0.06, sides: 12, pos: buste(0, h, 0), rot: [14, 0, 0], color: "copper" })),
    // foyer : cadre, grille ambre, porte
    { shape: "box", size: [0.82, 0.6, 0.14], pos: buste(0, 0.78, 0.9), rot: [14, 0, 0], color: "dark" },
    ...[-0.22, 0, 0.22].map((x): Part => ({ shape: "box", size: [0.13, 0.4, 0.06], pos: buste(x, 0.78, 0.97), rot: [14, 0, 0], color: "amber" })),
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.08, pos: buste(0.56, 1.1, 0.8), rot: [104, 0, 0], color: "light", fine: true },
    // plaques rapiécées
    { shape: "box", size: [0.08, 0.5, 0.56], pos: buste(0.9, 0.62, 0.1), rot: [14, 0, 5], color: "metal", mirror: true, fine: true },
    { shape: "box", size: [0.5, 0.36, 0.07], pos: buste(-0.46, 0.4, 0.76), rot: [14, -28, 4], color: "hazard", fine: true },
    // houppelande de bâche (dos et épaules), galon d'équipe
    pan(4.02, 0.62, 1.4, 0.84, 0.08, 62, 236, "dry", 8, -0.05),
    pan(3.34, 1.28, 1.47, 0.2, 0.1, 62, 236, "faction", 8, -0.05),
    // couverture roulée et sac au dos, cheminée
    { shape: "cylinder", sides: 8, radius: 0.27, height: 1.5, pos: [0, 2.74, -1.14], rot: [0, 0, 90], color: "dry" },
    { shape: "cylinder", sides: 8, radius: 0.29, height: 0.16, pos: [0.44, 2.74, -1.14], rot: [0, 0, 90], color: "faction", mirror: true, fine: true },
    { shape: "cylinder", sides: 8, radius: 0.17, height: 1.5, pos: [0.5, 4.0, -0.78], color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.26, radiusTop: 0.2, height: 0.2, pos: [0.5, 4.78, -0.78], color: "rust" },
    { shape: "cylinder", sides: 5, radius: 0.16, height: 0.05, pos: [0.5, 4.89, -0.78], color: "amber" },
    // cabines de camion aux épaules : toit du joueur, pare-brise, phares, pare-chocs
    { shape: "bevel", size: [0.86, 0.64, 1.0], pos: [1.34, 3.56, 0.02], rot: [0, 0, -8], bevel: 0.08, color: "metal", mirror: true },
    { shape: "box", size: [0.84, 0.1, 0.92], pos: [1.38, 3.91, 0.02], rot: [0, 0, -8], color: "faction", mirror: true },
    { shape: "box", size: [0.62, 0.26, 0.06], pos: [1.35, 3.64, 0.53], rot: [0, 0, -8], color: "glass", mirror: true },
    { shape: "box", size: [0.2, 0.14, 0.06], pos: [1.6, 3.38, 0.54], color: "amber", mirror: true },
    { shape: "box", size: [0.16, 0.13, 0.06], pos: [1.08, 3.42, 0.54], color: "amber", mirror: true, fine: true },
    { shape: "box", size: [0.86, 0.12, 0.1], pos: [1.33, 3.24, 0.54], rot: [0, 0, -8], color: "hazard", mirror: true },
    // cou, tête de tôle, yeux, câbles pendants
    { shape: "cylinder", sides: 6, radius: 0.36, height: 0.5, pos: [0, 3.86, 0.5], rot: [40, 0, 0], color: "rubber", fine: true },
    { shape: "bevel", size: [0.7, 0.6, 0.64], pos: [0, 4.02, 0.8], bevel: 0.1, color: "metal" },
    { shape: "box", size: [0.58, 0.16, 0.06], pos: [0, 4.08, 1.12], color: "black" },
    { shape: "cylinder", sides: 6, radius: 0.1, height: 0.06, pos: [0.17, 4.08, 1.15], rot: [90, 0, 0], color: "amber", mirror: true },
    { shape: "wedge", size: [0.16, 0.2, 0.22], pos: [0, 3.94, 1.18], color: "copper" },
    ...barbe,
    // dôme de capteurs : collerette de blindage, bandeau du joueur, plaques rapportées
    { shape: "lathe", sides: 14, profile: [[0, -0.06], [0.8, -0.1], [0.86, -0.04], [0.78, 0.04], [0.58, 0.1], [0, 0.1]], pos: [0, 4.36, 0.62], rot: [10, 0, 0], color: "dark" },
    { shape: "lathe", sides: 10, profile: [[0.58, 0.04], [0.52, 0.42], [0.36, 0.58], [0.12, 0.64], [0, 0.6]], pos: [0, 4.36, 0.62], rot: [10, 0, 0], color: "metal" },
    { shape: "box", size: [0.56, 0.09, 0.08], pos: [0, 4.72, 1.1], rot: [24, 0, 0], color: "glow" },
    { shape: "cylinder", sides: 10, radius: 0.61, radiusTop: 0.58, height: 0.16, pos: [0, 4.52, 0.65], rot: [10, 0, 0], color: "faction" },
    { shape: "box", size: [0.42, 0.04, 0.3], pos: [0.66, 4.36, 0.95], rot: [12, 24, 2], color: "hazard", fine: true },
    { shape: "box", size: [0.36, 0.04, 0.36], pos: [-0.72, 4.42, 0.42], rot: [8, -16, -2], color: "copper", fine: true },
    // bras gauche : membres de poutrelle, pince à trois doigts
    entre([-1.48, 3.36, 0.02], [-1.64, 2.56, -0.04], 0.36, 0.38, { shape: "box", color: "rust" }),
    { shape: "cylinder", sides: 6, radius: 0.25, height: 0.44, pos: [-1.64, 2.54, -0.04], rot: [0, 0, 90], color: "steel" },
    entre([-1.64, 2.54, -0.04], [-1.56, 1.78, 0.4], 0.32, 0.34, { shape: "box", color: "metal" }),
    entre([-1.62, 2.34, 0.06], [-1.6, 2.1, 0.2], 0.27, 0, { shape: "cylinder", sides: 6, color: "faction" }),
    { shape: "cylinder", sides: 6, radius: 0.22, height: 0.18, pos: [-1.55, 1.72, 0.44], rot: [40, 0, 0], color: "dark", fine: true },
    entre([-1.74, 1.68, 0.46], [-1.8, 1.3, 0.62], 0.11, 0.14, { shape: "box", color: "steel" }),
    entre([-1.38, 1.68, 0.46], [-1.3, 1.3, 0.62], 0.11, 0.14, { shape: "box", color: "steel" }),
    entre([-1.55, 1.64, 0.62], [-1.55, 1.3, 0.86], 0.11, 0.14, { shape: "box", color: "steel" }),
  ]);
}

/** Bras droit et mât émetteur : bras, main, mât de grue rayé, pointe ; la tête du mât est à part (remplacée par l'arc
 * paralysant). */
function brasDroit(): Part[] {
  const bandes = [0.75, 1.65, 3.15, 3.95];
  return porte(`${FRAPPE}#bras`, EPAULE, [
    entre([1.5, 3.36, 0.05], [1.72, 2.64, 0.02], 0.36, 0.38, { shape: "box", color: "rust" }),
    { shape: "cylinder", sides: 6, radius: 0.25, height: 0.44, pos: [1.72, 2.62, 0.02], rot: [0, 0, 90], color: "steel" },
    entre([1.72, 2.62, 0.02], [HX, 2.42, 0.82], 0.32, 0.32, { shape: "box", color: "metal" }),
    entre([1.74, 2.58, 0.24], [1.77, 2.52, 0.46], 0.27, 0, { shape: "cylinder", sides: 6, color: "faction" }),
    { shape: "box", size: [0.42, 0.38, 0.42], pos: [HX, 2.4, HZ], color: "dark" },
    // mât : flèche de grue jaune à bandes noires, treillis, pointe ferrée
    { shape: "box", size: [0.2, 4.3, 0.2], pos: [HX, 2.55, HZ], color: "hazard" },
    ...bandes.map((y): Part => ({ shape: "box", size: [0.23, 0.26, 0.23], pos: [HX, y, HZ], color: "black" })),
    ...[1.0, 1.3, 2.0, 2.9, 3.5, 4.3].map((y): Part => fin({ shape: "box", size: [0.42, 0.07, 0.07], pos: [HX, y, HZ], color: "steel" })),
    { shape: "cone", sides: 6, radius: 0.16, height: 0.4, pos: [HX, 0.22, HZ], rot: [180, 0, 0], color: "steel" },
    { shape: "cylinder", sides: 6, radius: 0.21, height: 0.2, pos: [HX, 4.72, HZ], color: "faction" },
  ]);
}

/** Tête du mât émetteur : couronne d'électrodes autour d'une tige, isolateurs, cœur lumineux. */
function emetteur(): Part[] {
  const T: Vec3 = [HX, 5.1, HZ];
  return porte(`sauf:shepherd_arc#${FRAPPE}#emetteur`, EPAULE, [
    { shape: "cylinder", sides: 6, radius: 0.09, height: 0.8, pos: [HX, 4.95, HZ], color: "steel" },
    ...[4.86, 5.04].map((y): Part => ({ shape: "torus", radius: 0.2, tube: 0.06, sides: 8, pos: [HX, y, HZ], color: "light", fine: y > 5 })),
    { shape: "torus", radius: 0.46, tube: 0.07, sides: 12, pos: T, color: "copper" },
    ...[0, 120, 240].flatMap((d): Part[] => {
      const a = (d * Math.PI) / 180;
      const P: Vec3 = [q(HX + Math.sin(a) * 0.46), T[1], q(HZ + Math.cos(a) * 0.46)];
      return [
        entre([HX, 4.72, HZ], P, 0.05, 0, { shape: "cylinder", sides: 4, color: "dark" }),
        { shape: "cone", sides: 5, radius: 0.08, height: 0.36, pos: [P[0], q(P[1] + 0.18), P[2]], color: "steel" },
      ];
    }),
    { shape: "sphere", radius: 0.16, detail: 1, pos: [HX, 5.36, HZ], color: "glow" },
  ]);
}

// ——— Arme ———

/** Arc paralysant : colonne de bobines de cuivre, grand globe cyan cerclé d'acier, arcs figés ; bobines sur l'épaule. */
function electrique(): Part[] {
  const c: Vec3 = [HX, 5.42, HZ];
  return [
    ...porte(`si:shepherd_arc#${FRAPPE}#arc`, EPAULE, [
      { shape: "cylinder", sides: 6, radius: 0.12, height: 1.0, pos: [HX, 4.95, HZ], color: "copper" },
      ...[4.35, 4.6, 4.85].map((y, i): Part => ({ shape: "torus", radius: q(0.34 - i * 0.05), tube: 0.08, sides: 10, pos: [HX, y, HZ], color: i === 1 ? "light" : "copper" })),
      ...[0.9, 1.35, 3.0, 3.5].map((y, i): Part => ({ shape: "torus", radius: 0.22, tube: 0.07, sides: 8, pos: [HX, y, HZ], color: "copper", fine: i % 2 === 1 })),
      { shape: "sphere", radius: 0.36, detail: 1, pos: c, color: "glow" },
      { shape: "torus", radius: 0.5, tube: 0.06, sides: 12, pos: c, rot: [0, 0, 90], color: "steel" },
      { shape: "torus", radius: 0.5, tube: 0.06, sides: 12, pos: c, rot: [90, 0, 0], color: "steel", fine: true },
      // arcs figés autour du globe
      { shape: "tube", radius: 0.045, sides: 3, path: [c, [q(HX + 0.12), q(c[1] + 0.36), q(c[2] - 0.2)], [q(HX - 0.06), q(c[1] + 0.5), q(c[2] - 0.34)], [HX, q(c[1] + 0.68), q(c[2] - 0.3)]], bend: 0.01, color: "glow" },
      { shape: "tube", radius: 0.045, sides: 3, path: [c, [q(HX - 0.14), q(c[1] + 0.2), q(c[2] + 0.34)], [q(HX + 0.08), q(c[1] + 0.34), q(c[2] + 0.44)], [HX, q(c[1] + 0.3), q(c[2] + 0.66)]], bend: 0.01, color: "glow" },
      { shape: "tube", radius: 0.045, sides: 3, path: [[HX, 4.4, HZ], [q(HX + 0.3), 4.62, q(HZ + 0.24)], [q(HX + 0.1), 4.8, q(HZ + 0.4)], c], bend: 0.01, color: "glow" },
    ]),
    ...porte("si:shepherd_arc#tourelle", AXE, [
      ...[0.14, -0.34].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 10, radius: 0.28, height: 0.12, pos: [1.36, 3.99, z], color: "dark" },
        { shape: "cylinder", sides: 10, radius: 0.22, height: 0.6, pos: [1.36, 4.3, z], color: "copper" },
        { shape: "torus", radius: 0.22, tube: 0.06, sides: 10, pos: [1.36, 4.2, z], color: "light", fine: true },
        { shape: "torus", radius: 0.22, tube: 0.06, sides: 10, pos: [1.36, 4.44, z], color: "light" },
        { shape: "sphere", radius: 0.2, detail: 1, pos: [1.36, 4.74, z], color: "glow" },
      ]),
      { shape: "tube", radius: 0.06, sides: 5, path: [[1.36, 4.1, -0.5], [1.0, 3.9, -0.9], [0.5, 3.2, -0.95]], bend: 0.2, color: "glow" },
    ]),
  ];
}

/** Mortier lourd : affût sur l'épaule gauche, gros tube levé vers l'avant (pivot de recul), caisse d'obus au dos. */
function mortier(): Part[] {
  const O: Vec3 = [-1.36, 4.62, -0.3];
  // tube levé de 60° : son axe y basculé de 30° vers l'avant
  const le = (d: number): Vec3 => [O[0], q(O[1] + Math.cos(Math.PI / 6) * d), q(O[2] + Math.sin(Math.PI / 6) * d)];
  return [
    ...porte("si:shepherd_mortar#tourelle", AXE, [
      { shape: "box", size: [1.2, 0.18, 1.3], pos: [O[0], 3.98, -0.3], color: "dark" },
      ...[-0.44, 0.44].map((dx): Part => ({ shape: "extrude", profile: [[-0.5, 0], [0.5, 0], [0.24, 0.62], [-0.24, 0.62]], depth: 0.12, pos: [q(O[0] + dx), 4.06, O[2]], rot: [0, -90, 0], color: "rust" })),
      { shape: "cylinder", sides: 8, radius: 0.14, height: 1.1, pos: O, rot: [0, 0, 90], color: "steel" },
      { shape: "box", size: [0.06, 0.2, 1.2], pos: [q(O[0] - 0.62), 4.12, -0.3], color: "faction" },
      // caisse d'obus et ses ogives
      { shape: "box", size: [0.9, 0.5, 0.62], pos: [O[0], 4.32, -1.2], color: "metal" },
      { shape: "box", size: [0.92, 0.08, 0.64], pos: [O[0], 4.46, -1.2], color: "hazard" },
      ...[-0.24, 0, 0.24].map((dx): Part => ({ shape: "cone", sides: 6, radius: 0.1, height: 0.26, pos: [q(O[0] + dx), 4.7, -1.2], color: "copper", fine: dx !== 0 })),
    ]),
    ...porte("si:shepherd_mortar#coup|x,-8#mortier", O, [
      { shape: "cylinder", sides: 10, radius: 0.3, height: 2.0, pos: le(0.7), rot: [30, 0, 0], color: "metal" },
      { shape: "cylinder", sides: 10, radius: 0.36, height: 0.5, pos: le(-0.1), rot: [30, 0, 0], color: "dark" },
      { shape: "torus", radius: 0.31, tube: 0.07, sides: 10, pos: le(1.62), rot: [30, 0, 0], color: "steel" },
      { shape: "torus", radius: 0.31, tube: 0.05, sides: 10, pos: le(0.9), rot: [30, 0, 0], color: "faction", fine: true },
      // vérins de recul de part et d'autre
      ...[-0.36, 0.36].map((dx): Part => ({ shape: "cylinder", sides: 6, radius: 0.07, height: 1.0, pos: [q(O[0] + dx), le(0.3)[1], le(0.3)[2]], rot: [30, 0, 0], color: "light" })),
    ]),
  ];
}

/** Lance-plasma : console sur l'épaule gauche, long corps à anneaux de refroidissement pointé vers l'avant, bouche
 * ambre, réservoirs et durite ; le jet part de la bouche (pivot « laser »). */
function plasma(): Part[] {
  const L: Vec3 = [-1.32, 4.6, 0.9];
  const ax = (z: number): Vec3 => [L[0], L[1], q(L[2] + z)];
  return [
    ...porte("si:shepherd_plasma#tourelle", AXE, [
      entre([-1.4, 3.86, -0.2], [L[0], q(L[1] - 0.2), 0.5], 0.24, 0.3, { shape: "box", color: "steel" }),
      { shape: "box", size: [0.5, 0.2, 0.7], pos: [L[0], q(L[1] - 0.3), 0.6], color: "dark" },
      { shape: "cylinder", sides: 10, radius: 0.32, height: 1.4, pos: ax(0), rot: [90, 0, 0], color: "dark" },
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.7, pos: ax(1.0), rot: [90, 0, 0], color: "steel" },
      ...[-0.4, 0, 0.4].map((z, i): Part => ({ shape: "torus", radius: 0.34, tube: 0.06, sides: 10, pos: ax(z), rot: [90, 0, 0], color: "copper", fine: i === 1 })),
      { shape: "torus", radius: 0.21, tube: 0.05, sides: 10, pos: ax(1.32), rot: [90, 0, 0], color: "faction" },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.06, pos: ax(1.36), rot: [90, 0, 0], color: "amber" },
      // réservoirs et durite
      ...[-1.62, -1.02].map((x): Part => ({ shape: "cylinder", sides: 8, radius: 0.17, height: 0.8, pos: [x, 4.32, -0.5], rot: [90, 0, 0], color: "hazard" })),
      { shape: "tube", radius: 0.05, sides: 4, path: [[-1.32, 4.32, -0.1], [-1.5, 4.5, 0.1], [L[0], q(L[1] - 0.1), 0.3]], bend: 0.2, color: "dark" },
    ]),
    { shape: "box", size: [0.02, 0.02, 0.02], pos: [0, 4.6, 2.3], color: "dark", pivot: "si:shepherd_plasma#laser" },
  ];
}

// ——— Châssis (pivots des jambes, origine à la hanche) ———

/** Jambes télescopiques : deux vérins d'acier par pied, guides et patin ; sous y = 0 (le jeu soulève le Berger). */
function telescope(): Part[] {
  const bas = -TELESCOPE;
  const p: Part[] = [{ shape: "box", size: [0.86, 0.16, 1.1], pos: [0.78, 0.0, 0.12], color: "dark" }];
  for (const dz of [-0.3, 0.42]) {
    const z = q(0.12 + dz);
    p.push(
      { shape: "cylinder", sides: 10, radius: 0.24, height: 0.8, pos: [0.78, -0.4, z], color: "metal" },
      { shape: "torus", radius: 0.24, tube: 0.05, sides: 10, pos: [0.78, -0.06, z], color: "hazard", fine: true },
      { shape: "cylinder", sides: 8, radius: 0.15, height: q(-bas - 0.7), pos: [0.78, q((-0.8 + bas + 0.12) / 2), z], color: "light" },
      { shape: "cylinder", sides: 10, radius: 0.27, height: 0.1, pos: [0.78, -0.8, z], color: "dark" },
    );
  }
  // patin, guide entre les deux vérins, bande du joueur
  p.push(
    { shape: "box", size: [0.76, 0.2, 1.36], pos: [0.78, q(bas + 0.1), 0.18], color: "dark" },
    { shape: "box", size: [0.8, 0.05, 1.4], pos: [0.78, q(bas + 0.02), 0.18], color: "rubber" },
    { shape: "box", size: [0.16, 0.14, 0.86], pos: [0.78, -0.62, 0.18], color: "steel" },
    { shape: "box", size: [0.06, 0.36, 0.5], pos: [1.2, -0.45, 0.18], color: "faction" },
  );
  return p;
}

/** Blindage réactif : briques explosives sur le devant de la cuisse et du tibia, et sur le flanc du tibia. */
function reactif(): Part[] {
  const p: Part[] = [];
  const brique = (x: number, y: number, z: number, rx: number, i: number): Part => ({ shape: "box", size: [0.24, 0.2, 0.1], pos: [x, y, z], rot: [rx, 0, 0], color: i % 3 === 1 ? "hazard" : "metal", fine: i % 2 === 1 });
  let i = 0;
  for (const y of [0.5, 0.72, 0.94]) for (const x of [0.62, 0.88]) p.push(brique(x, y, q(0.5 + (y - 0.5) * 0.1), -6, i++));
  for (const y of [1.34, 1.56, 1.78]) for (const x of [0.56, 0.82]) p.push(brique(x, y, q(0.5 - (y - 1.3) * 0.14), 12, i++));
  for (const y of [0.56, 0.8]) p.push({ shape: "box", size: [0.1, 0.22, 0.4], pos: [1.14, y, 0.1], color: "metal" });
  p.push({ shape: "box", size: [0.56, 0.06, 0.12], pos: [0.75, 1.15, 0.52], color: "faction" });
  return p;
}

/** Blindage lourd : jupe de grandes plaques ondulées, des épaules aux genoux, ouverte devant ; galon du joueur au bas. */
function blindage(): Part[] {
  const p: Part[] = [];
  const teintes: C[] = ["metal", "steel", "metal", "dark", "metal", "steel", "rust", "metal", "steel", "dark", "metal"];
  const n = 22;
  const arc = 250 / n;
  for (let i = 0; i < n; i++) {
    const phi = q(55 + i * arc);
    const creux = i % 2 ? 0.1 : 0;
    const long = 2.5 + (Math.floor(i / 2) % 3) * 0.16;
    p.push(pan(4.1, q(1.0 - creux), q(1.86 - creux), q(long), 0.07, phi, q(arc + 0.6), teintes[Math.floor(i / 2) % teintes.length], 1, -0.02));
  }
  p.push(pan(4.22, 0.6, 1.12, 0.22, 0.1, 50, 260, "steel", 8, -0.02));
  p.push(pan(1.96, 1.76, 1.86, 0.3, 0.08, 58, 244, "faction", 11, -0.02));
  // pans d'épaule, plus larges que le buste
  p.push({ shape: "box", size: [0.9, 0.08, 1.4], pos: [1.5, 4.02, -0.06], rot: [0, 0, -20], color: "metal", mirror: true });
  p.push({ shape: "box", size: [0.5, 0.06, 1.1], pos: [1.5, 4.08, -0.06], rot: [0, 0, -20], color: "faction", mirror: true });
  return porte("si:shepherd_plate#tourelle", AXE, p);
}

// ——— Équipement ———

/** Module d'antenne : boîtier, fouet, petite parabole et voyant, en (x, y, z), taille `k`. */
function antenne(x: number, y: number, z: number, k: number): Part[] {
  return [
    { shape: "bevel", size: [q(0.44 * k), q(0.5 * k), q(0.44 * k)], pos: [x, y, z], bevel: 0.04, color: "dark" },
    { shape: "box", size: [q(0.46 * k), 0.06, q(0.46 * k)], pos: [x, q(y + 0.12 * k), z], color: "faction", fine: true },
    { shape: "cylinder", sides: 4, radius: 0.03, height: q(1.4 * k), pos: [x, q(y + 0.95 * k), z], color: "steel" },
    { shape: "sphere", radius: q(0.07 * k), pos: [x, q(y + 1.65 * k), z], color: "glow", fine: true },
    { shape: "lathe", sides: 8, profile: [[0, 0], [0.16, 0.03], [0.26, 0.1], [0.28, 0.1], [0.16, 0], [0, -0.03]].map(([r, h]): [number, number] => [q(r * k), q(h * k)]), pos: [q(x + 0.2 * Math.sign(x) * k), q(y + 0.3 * k), z], rot: [0, 0, q(-60 * Math.sign(x))], color: "light" },
    { shape: "box", size: [0.08, 0.06, 0.03], pos: [x, q(y + 0.02), q(z + 0.23 * k)], color: "amber" },
  ];
}

/** Relais de commandement : poutre d'acier en travers des épaules, modules d'antenne aux bouts, émetteurs, ceinture de
 * boîtiers. */
function relais(): Part[] {
  return [
    ...porte("si:shepherd_relay#tourelle", AXE, [
      { shape: "box", size: [5.0, 0.22, 0.26], pos: [0, 4.2, -0.5], color: "steel" },
      { shape: "box", size: [4.6, 0.06, 0.28], pos: [0, 4.33, -0.5], color: "dark", fine: true },
      ...[2.0, 1.2].map((x): Part => ({ shape: "box", size: [0.16, 0.3, 0.34], pos: [x, 4.2, -0.5], color: "faction", mirror: true })),
      ...[-2.3, 2.3].flatMap((x) => antenne(x, 4.55, -0.5, 1.4)),
      ...[-1.6, 1.6].flatMap((x) => antenne(x, 4.5, -0.62, 0.9)),
    ]),
    ...porte("si:shepherd_relay#fixe_ceinture", [0, 2.2, 0], [[0.95, 0.5], [1.0, -0.5], [-0.95, 0.5], [-1.0, -0.5]].flatMap(([x, z]): Part[] => [
      { shape: "box", size: [0.3, 0.34, 0.3], pos: [x, 2.12, z], color: "dark" },
      { shape: "box", size: [0.08, 0.06, 0.03], pos: [x, 2.2, q(z + 0.16 * Math.sign(z))], color: "glow" },
    ])),
  ];
}

/** Baie d'assemblage : conteneur d'acier sur le dos, toit plat, sas arrière rayé où un Mâtin attend, voyants. */
function baie(): Part[] {
  const Z = -1.75;
  return porte("si:shepherd_bay#tourelle", AXE, [
    { shape: "box", size: [1.9, 0.14, 1.8], pos: [0, 2.6, q(Z - 0.1)], color: "rust" },
    { shape: "bevel", size: [1.6, 1.5, 1.3], pos: [0, 3.4, Z], bevel: 0.08, color: "metal" },
    { shape: "box", size: [1.7, 0.12, 1.4], pos: [0, 4.2, Z], color: "dark" },
    { shape: "box", size: [0.34, 0.06, 1.42], pos: [0, 4.28, Z], color: "faction" },
    ...[-0.4, 0, 0.4].map((z): Part => ({ shape: "box", size: [1.64, 0.06, 0.06], pos: [0, 3.9, q(Z + z)], color: "steel", fine: z !== 0 })),
    // sas au dos, encadré de bandes rayées ; le Mâtin en cours d'assemblage y guette
    { shape: "box", size: [0.9, 0.9, 0.06], pos: [0, 3.2, q(Z - 0.66)], color: "black" },
    ...[-0.5, 0.5].map((x): Part => ({ shape: "box", size: [0.1, 1.0, 0.08], pos: [x, 3.2, q(Z - 0.68)], color: "hazard" })),
    { shape: "box", size: [1.1, 0.1, 0.08], pos: [0, 3.72, q(Z - 0.68)], color: "hazard" },
    { shape: "bevel", size: [0.46, 0.4, 0.5], pos: [0, 3.12, q(Z - 0.84)], bevel: 0.08, color: "metal" },
    { shape: "box", size: [0.3, 0.2, 0.34], pos: [0, 3.04, q(Z - 1.18)], color: "rust" },
    { shape: "box", size: [0.1, 0.09, 0.05], pos: [0.13, 3.2, q(Z - 1.1)], color: "amber", mirror: true },
    { shape: "wedge", size: [0.16, 0.22, 0.2], pos: [0.2, 3.36, q(Z - 0.72)], rot: [0, 180, 24], color: "rust", mirror: true },
    // grilles et voyants des flancs
    { shape: "box", size: [0.06, 0.5, 0.7], pos: [0.81, 3.3, Z], color: "black", mirror: true },
    { shape: "box", size: [0.05, 0.08, 0.34], pos: [0.84, 3.66, Z], color: "amber", mirror: true },
    // attaches
    entre([0.6, 3.9, -0.6], [0.7, 3.7, -1.3], 0.12, 0.12, { shape: "box", color: "steel", mirror: true }),
    entre([0.7, 2.5, -0.5], [0.8, 2.6, -2.2], 0.14, 0.14, { shape: "box", color: "steel", mirror: true }),
  ]);
}

/** Projecteur de bouclier : mât d'acier au dos, anneau émetteur porté par quatre bras, nœuds lumineux, tête au sommet. */
function bouclier(): Part[] {
  const Y = 6.2;
  const Z = -0.35;
  const R = 1.5;
  const p: Part[] = [
    entre([0, 3.2, -0.95], [0, Y, Z], 0.12, 0, { shape: "cylinder", sides: 8, color: "steel" }),
    { shape: "box", size: [0.4, 0.5, 0.3], pos: [0, 3.5, -0.95], color: "hazard" },
    { shape: "cylinder", sides: 8, radius: 0.15, height: 0.3, pos: [0, 4.9, q(Z - 0.25)], color: "faction" },
    { shape: "cylinder", sides: 10, radius: 0.3, height: 0.24, pos: [0, q(Y - 0.3), Z], color: "dark" },
    { shape: "torus", radius: R, tube: 0.09, sides: 16, pos: [0, q(Y - 0.3), Z], color: "steel" },
    { shape: "torus", radius: q(R - 0.12), tube: 0.04, sides: 16, pos: [0, q(Y - 0.26), Z], color: "faction", fine: true },
  ];
  for (let i = 0; i < 4; i++) {
    const a = ((i * 90 + 45) * Math.PI) / 180;
    const P: Vec3 = [q(Math.sin(a) * R), q(Y - 0.3), q(Z + Math.cos(a) * R)];
    p.push(entre([0, q(Y - 0.3), Z], P, 0.07, 0.07, { shape: "box", color: "dark" }));
    p.push({ shape: "sphere", radius: 0.15, detail: 1, pos: P, color: "glow" });
  }
  p.push(
    { shape: "cylinder", sides: 8, radius: 0.34, radiusTop: 0.2, height: 0.24, pos: [0, q(Y + 0.28), Z], color: "dark" },
    { shape: "torus", radius: 0.36, tube: 0.08, sides: 12, pos: [0, q(Y + 0.5), Z], color: "copper" },
    { shape: "sphere", radius: 0.28, detail: 1, pos: [0, q(Y + 0.64), Z], color: "glow" },
  );
  return porte("si:shepherd_shield#tourelle", AXE, p);
}

/** Modèle complet du Berger. */
export function berger(): Part[] {
  const jambes = (pre: string, parts: () => Part[]): Part[] =>
    ([["jambe_d", 1], ["jambe_g", -1]] as [string, number][]).flatMap(([nom, s]) => porte(`${pre}${nom}`, [q(HANCHE[0] * s), HANCHE[1], HANCHE[2]], parts().map((p) => cote(s, p))));
  return [
    ...jambes("", jambe),
    ...bassin(),
    ...torse(),
    ...brasDroit(),
    ...emetteur(),
    ...electrique(),
    ...mortier(),
    ...plasma(),
    ...jambes("si:shepherd_legs#", telescope),
    ...jambes("si:shepherd_reactive#", reactif),
    ...blindage(),
    ...relais(),
    ...baie(),
    ...bouclier(),
  ];
}
