// Berger des Transhumants (shepherd) : géant bipède de ferraille, voûté. Buste de chaudière de locomotive à foyer ambre
// (pivot « tourelle », sur l'axe), épaules de cabines de camion, houppelande de bâche, tête basse à barbe de chaînes sous
// un grand chapeau de tôle (couvercle de cuve), jambes de poutrelles guêtrées de toile (pivots « jambe_d », « jambe_g »),
// bras gauche à pince ; bras droit et houlette (flèche de grue en crosse) en pivot de frappe « coup|… », à l'épaule.
// Équipements : voir sim/src/ameliorations/table.rs et docs/spec/races.md ; échasses modelées sous y = 0 (`lift`).
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
/** Axe de la houlette (x, z). */
const HX = 1.8;
const HZ = 1.0;
/** Frappe : le bras lève et abat la houlette devant lui (degrés). */
const FRAPPE = "coup|x,100";

/** Hauteur dont les échasses soulèvent le Berger (unités du modèle). */
export const ECHASSES = 1.7;

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

/** Buste : chaudière, foyer, houppelande, cabines d'épaule, tête, chapeau, bras gauche. */
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
    // cou, tête de tôle, yeux, barbe de chaînes
    { shape: "cylinder", sides: 6, radius: 0.36, height: 0.5, pos: [0, 3.86, 0.5], rot: [40, 0, 0], color: "rubber", fine: true },
    { shape: "bevel", size: [0.7, 0.6, 0.64], pos: [0, 4.02, 0.8], bevel: 0.1, color: "metal" },
    { shape: "box", size: [0.58, 0.16, 0.06], pos: [0, 4.08, 1.12], color: "black" },
    { shape: "cylinder", sides: 6, radius: 0.1, height: 0.06, pos: [0.17, 4.08, 1.15], rot: [90, 0, 0], color: "amber", mirror: true },
    { shape: "wedge", size: [0.16, 0.2, 0.22], pos: [0, 3.94, 1.18], color: "copper" },
    ...barbe,
    // chapeau : couvercle de cuve à large bord, ruban du joueur, pièces rapportées
    { shape: "lathe", sides: 14, profile: [[0, -0.06], [1.02, -0.14], [1.14, -0.08], [1.04, 0.02], [0.58, 0.1], [0, 0.1]], pos: [0, 4.36, 0.62], rot: [10, 0, 0], color: "metal" },
    { shape: "lathe", sides: 10, profile: [[0.58, 0.04], [0.52, 0.42], [0.36, 0.58], [0.12, 0.64], [0, 0.6]], pos: [0, 4.36, 0.62], rot: [10, 0, 0], color: "rust" },
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

/** Bras droit et houlette : bras, main, mât de grue rayé, pointe ; la crosse est à part (remplacée par l'électrique). */
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

/** Points d'une crosse de rayon `r` au sommet du mât, recourbée vers l'avant. */
function crosse(r: number, y: number, fin_: number, n = 6): Vec3[] {
  const out: Vec3[] = [[HX, q(y - 0.5), HZ]];
  for (let i = 0; i <= n; i++) {
    const a = ((180 - ((180 + fin_) * i) / n) * Math.PI) / 180;
    out.push([HX, q(y + Math.sin(a) * r), q(HZ + r + Math.cos(a) * r)]);
  }
  return out;
}

function crosseOrigine(): Part[] {
  const bout = crosse(0.55, 5.1, 60).at(-1)!;
  return porte(`sauf:shepherd_arc#${FRAPPE}#crosse`, EPAULE, [
    { shape: "tube", radius: 0.13, sides: 5, path: crosse(0.55, 5.1, 60), bend: 0.1, color: "steel" },
    { shape: "cylinder", sides: 6, radius: 0.18, height: 0.14, pos: bout, rot: [0, 0, 90], color: "dark", fine: true },
    // chaîne et crochet de levage
    { shape: "tube", radius: 0.04, sides: 4, path: [bout, [HX, q(bout[1] - 0.5), bout[2]]], color: "dark" },
    { shape: "torus", radius: 0.17, tube: 0.06, sides: 8, arc: 270, pos: [HX, q(bout[1] - 0.68), bout[2]], rot: [90, 0, 90], color: "hazard" },
  ]);
}

// ——— Arme ———

/** Houlette électrique : grande crosse de cuivre, isolateurs, globe cyan ; bobines sur l'épaule droite. */
function electrique(): Part[] {
  const R = 0.72;
  const c: Vec3 = [HX, 5.15, q(HZ + R)];
  return [
    ...porte(`si:shepherd_arc#${FRAPPE}#arc`, EPAULE, [
      { shape: "tube", radius: 0.16, sides: 6, path: crosse(R, 5.15, 75), bend: 0.12, color: "copper" },
      ...[4.35, 4.6, 4.85].map((y, i): Part => ({ shape: "torus", radius: q(0.34 - i * 0.05), tube: 0.08, sides: 10, pos: [HX, y, HZ], color: i === 1 ? "light" : "copper" })),
      ...[0.9, 1.35, 3.0, 3.5].map((y, i): Part => ({ shape: "torus", radius: 0.22, tube: 0.07, sides: 8, pos: [HX, y, HZ], color: "copper", fine: i % 2 === 1 })),
      { shape: "sphere", radius: 0.36, detail: 1, pos: c, color: "glow" },
      { shape: "torus", radius: 0.5, tube: 0.06, sides: 12, pos: c, rot: [0, 0, 90], color: "steel" },
      // éclairs figés entre le globe et la crosse
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

/** Fronde : trébuchet à l'épaule gauche, contrepoids, carcasse de voiture au bout du bras (pivot de frappe). */
function fronde(): Part[] {
  const O: Vec3 = [-1.36, 4.72, -0.2];
  const V: Vec3 = [-1.36, 4.5, -2.45];
  return [
    ...porte("si:shepherd_sling#tourelle", AXE, [
      ...[-0.5, 0.5].flatMap((dx): Part[] => [
        entre([q(O[0] + dx), 3.9, 0.36], [q(O[0] + dx * 0.9), 4.8, -0.2], 0.14, 0.16, { shape: "box", color: "wood" }),
        entre([q(O[0] + dx), 3.9, -0.66], [q(O[0] + dx * 0.9), 4.8, -0.2], 0.14, 0.16, { shape: "box", color: "wood" }),
      ]),
      { shape: "box", size: [1.3, 0.16, 1.3], pos: [O[0], 3.98, -0.14], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 1.3, pos: O, rot: [0, 0, 90], color: "steel" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.12, pos: [q(O[0] - 0.66), O[1], O[2]], rot: [0, 0, 90], color: "faction" },
    ]),
    ...porte("si:shepherd_sling#coup|x,120#fronde", O, [
      entre([O[0], 5.02, 0.72], [O[0], 4.42, -2.3], 0.2, 0.22, { shape: "box", color: "wood" }),
      ...[0.2, -0.7, -1.5].map((z): Part => ({ shape: "box", size: [0.26, 0.28, 0.16], pos: [O[0], q(4.88 + (z - 0.2) * 0.2), z], color: "hazard" })),
      // contrepoids : bloc de moteur rouillé
      { shape: "bevel", size: [0.66, 0.6, 0.5], pos: [O[0], 4.78, 0.86], bevel: 0.06, color: "rust" },
      { shape: "box", size: [0.5, 0.1, 0.52], pos: [O[0], 5.1, 0.86], color: "faction" },
      // carcasse de voiture dans sa poche de bâche
      { shape: "box", size: [1.1, 0.1, 1.5], pos: [V[0], 4.36, -2.55], rot: [-6, 0, 0], color: "dry" },
      { shape: "bevel", size: [0.86, 0.34, 1.6], pos: [V[0], 4.62, -2.55], rot: [-6, 8, 0], bevel: 0.1, color: "red" },
      { shape: "bevel", size: [0.74, 0.3, 0.76], pos: [V[0], 4.9, -2.6], rot: [-6, 8, 0], bevel: 0.1, color: "black" },
      { shape: "box", size: [0.66, 0.05, 0.6], pos: [V[0], 5.06, -2.6], rot: [-6, 8, 0], color: "rust" },
      ...[[0.42, 0.5], [-0.42, 0.5], [0.42, -0.55], [-0.42, -0.55]].map(([dx, dz]): Part => ({ shape: "cylinder", sides: 8, radius: 0.2, height: 0.16, pos: [q(V[0] + dx), 4.5, q(-2.55 + dz)], rot: [0, 0, 90], color: "rubber" })),
      ...[-0.5, 0.5].map((dx): Part => ({ shape: "tube", radius: 0.05, sides: 4, path: [[O[0], 4.6, -1.7], [q(V[0] + dx), 4.44, -1.85], [q(V[0] + dx), 4.36, -3.2]], bend: 0.1, color: "dark" })),
    ]),
  ];
}

/** Lanterne ardente : potence à l'épaule gauche, grande lanterne de cuivre à foyer ambre pendue devant. */
function lanterne(): Part[] {
  const L: Vec3 = [-1.24, 4.4, 1.5];
  return [
    ...porte("si:shepherd_lantern#tourelle", AXE, [
      entre([-1.4, 3.8, -0.3], [-1.4, 5.5, -0.2], 0.2, 0.2, { shape: "box", color: "wood" }),
      entre([-1.4, 5.42, -0.4], [L[0], 5.6, 1.75], 0.18, 0.2, { shape: "box", color: "wood" }),
      entre([-1.4, 4.7, -0.24], [-1.32, 5.48, 0.7], 0.12, 0.12, { shape: "box", color: "rust" }),
      { shape: "box", size: [0.3, 0.3, 0.3], pos: [-1.4, 5.44, -0.24], color: "hazard" },
      { shape: "tube", radius: 0.05, sides: 4, path: [[L[0], 5.56, L[2]], [L[0], 5.2, L[2]]], color: "dark" },
      // lanterne : chapeau, cage, foyer, socle
      { shape: "lathe", sides: 10, profile: [[0.72, 0], [0.62, 0.12], [0.2, 0.42], [0.1, 0.56], [0, 0.56]], pos: [L[0], 4.82, L[2]], color: "copper" },
      { shape: "cylinder", sides: 10, radius: 0.42, height: 0.86, pos: [L[0], 4.4, L[2]], color: "amber" },
      ...[0, 60, 120, 180, 240, 300].map((d): Part => {
        const a = (d * Math.PI) / 180;
        return { shape: "box", size: [0.09, 0.9, 0.09], pos: [q(L[0] + Math.sin(a) * 0.46), 4.4, q(L[2] + Math.cos(a) * 0.46)], rot: [0, d, 0], color: "dark" };
      }),
      { shape: "cylinder", sides: 10, radius: 0.6, radiusTop: 0.5, height: 0.18, pos: [L[0], 3.9, L[2]], color: "copper" },
      { shape: "torus", radius: 0.5, tube: 0.06, sides: 10, pos: [L[0], 4.4, L[2]], color: "faction" },
    ]),
    { shape: "box", size: [0.02, 0.02, 0.02], pos: [0, 4.3, 1.5], color: "dark", pivot: "si:shepherd_lantern#laser" },
  ];
}

// ——— Châssis (pivots des jambes, origine à la hanche) ———

/** Échasses : quatre poutrelles évasées par pied, entretoises, patins ; sous y = 0 (le jeu soulève le Berger). */
function echasse(): Part[] {
  const p: Part[] = [];
  const bas = -ECHASSES;
  for (const dx of [-1, 1])
    for (const dz of [-1, 1]) {
      const T: Vec3 = [q(0.78 + dx * 0.24), 0.1, q(0.12 + dz * 0.42)];
      const B: Vec3 = [q(0.84 + dx * 0.42), q(bas + 0.08), q(0.12 + dz * 0.66)];
      p.push(entre(T, B, 0.15, 0.15, { shape: "box", color: dz > 0 ? "hazard" : "steel" }));
      p.push({ shape: "box", size: [0.36, 0.14, 0.36], pos: [B[0], q(bas + 0.07), B[2]], color: "dark" });
    }
  for (const [y, w, l, c] of [[-0.45, 0.72, 1.06, "rust"], [-1.05, 0.88, 1.28, "wood"]] as [number, number, number, C][]) {
    p.push({ shape: "box", size: [w, 0.12, 0.12], pos: [0.81, y, q(0.12 + l / 2 - 0.1)], color: c }, { shape: "box", size: [w, 0.12, 0.12], pos: [0.81, y, q(0.12 - l / 2 + 0.1)], color: c });
    p.push({ shape: "box", size: [0.12, 0.12, l], pos: [q(0.81 + w / 2 - 0.08), y, 0.12], color: c }, { shape: "box", size: [0.12, 0.12, l], pos: [q(0.81 - w / 2 + 0.08), y, 0.12], color: c });
  }
  // croisillons, cordages de la cheville, fanion
  p.push(entre([1.06, -0.45, 0.6], [1.16, -1.05, -0.4], 0.08, 0.08, { shape: "box", color: "steel", fine: true }), entre([1.06, -0.45, -0.4], [1.16, -1.05, 0.6], 0.08, 0.08, { shape: "box", color: "steel", fine: true }));
  p.push({ shape: "cylinder", sides: 8, radius: 0.46, height: 0.2, pos: [0.77, 0.42, 0.04], color: "dry" }, { shape: "box", size: [0.06, 0.44, 0.5], pos: [1.32, -0.75, 0.12], color: "faction" });
  return p;
}

/** Sabot de fonte : énorme galoche à bout relevé, bride du joueur, clous. */
function sabot(): Part[] {
  return [
    { shape: "extrude", profile: [[-0.86, 0], [0.96, 0], [1.4, 0.2], [1.56, 0.64], [1.3, 0.62], [0.9, 0.56], [0.5, 0.82], [0.3, 1.0], [-0.6, 1.04], [-0.9, 0.7]], depth: 1.14, bevel: 0.1, pos: [0.8, 0, 0.1], rot: [0, -90, 0], color: "dark" },
    { shape: "extrude", profile: [[-0.92, 0], [1.0, 0], [1.46, 0.2], [1.36, 0.28], [0.9, 0.16], [-0.94, 0.16]], depth: 1.26, pos: [0.8, 0, 0.1], rot: [0, -90, 0], color: "steel" },
    { shape: "box", size: [1.2, 0.16, 0.4], pos: [0.8, 0.94, 0.14], rot: [-8, 0, 0], color: "faction" },
    { shape: "torus", radius: 0.5, tube: 0.1, sides: 10, pos: [0.78, 1.02, -0.06], color: "dry" },
    ...[-0.4, 0, 0.4].map((dx): Part => ({ shape: "cone", sides: 5, radius: 0.12, height: 0.3, pos: [q(0.8 + dx), 0.42, 1.62], rot: [76, 0, 0], color: "light" })),
    ...[-0.4, 0.1, 0.6].map((dz): Part => ({ shape: "sphere", radius: 0.1, pos: [1.4, 0.36, dz], color: "copper" })),
  ];
}

/** Manteau de grandes tôles ondulées, des épaules aux genoux, ouvert devant ; galon du joueur au bas. */
function manteau(): Part[] {
  const p: Part[] = [];
  const teintes: C[] = ["rust", "metal", "light", "rust", "metal", "hazard", "metal", "rust", "light", "metal", "rust"];
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
  p.push({ shape: "box", size: [0.9, 0.08, 1.4], pos: [1.5, 4.02, -0.06], rot: [0, 0, -20], color: "rust", mirror: true });
  p.push({ shape: "box", size: [0.5, 0.06, 1.1], pos: [1.5, 4.08, -0.06], rot: [0, 0, -20], color: "faction", mirror: true });
  return porte("si:shepherd_cloak#tourelle", AXE, p);
}

// ——— Équipement ———

/** Cloche de cuivre, anse en (x, y, z), taille `k`. */
function cloche(x: number, y: number, z: number, k: number, color: C = "copper"): Part[] {
  return [
    { shape: "lathe", sides: 8, profile: [[0.4, -0.62], [0.36, -0.5], [0.26, -0.3], [0.22, -0.1], [0.12, 0], [0, 0]].map(([r, h]): [number, number] => [q(r * k), q(h * k)]), pos: [x, y, z], color },
    { shape: "cylinder", sides: 6, radius: q(0.36 * k), height: 0.03, pos: [x, q(y - 0.6 * k), z], color: "black", fine: true },
    { shape: "sphere", radius: q(0.13 * k), pos: [x, q(y - 0.68 * k), z], color: "steel", fine: true },
  ];
}

/** Sonnailles : joug de bois en travers des épaules, grosses cloches pendues, bandoulière et ceinture de cloches. */
function sonnailles(): Part[] {
  return [
    ...porte("si:shepherd_bells#tourelle", AXE, [
      { shape: "box", size: [5.0, 0.24, 0.28], pos: [0, 4.2, -0.5], color: "wood" },
      ...[2.0, 1.2].map((x): Part => ({ shape: "box", size: [0.16, 0.3, 0.34], pos: [x, 4.2, -0.5], color: "faction", mirror: true })),
      ...[-2.3, 2.3].flatMap((x) => cloche(x, 4.08, -0.5, 1.5, "hazard")),
      ...[-1.6, 1.6].flatMap((x) => cloche(x, 4.08, -0.62, 1.0)),
      // bandoulière de cuir et cloches sur la poitrine
      entre([-0.95, 3.9, 0.75], [0.85, 2.5, 1.14], 0.2, 0.08, { shape: "box", color: "red" }),
      ...cloche(-0.62, 3.5, 1.08, 0.7),
      ...cloche(0, 3.05, 1.24, 0.8),
      ...cloche(0.6, 2.62, 1.26, 0.9),
    ]),
    ...porte("si:shepherd_bells#fixe_ceinture", [0, 2.2, 0], [[0.95, 0.5], [1.0, -0.5], [-0.95, 0.5], [-1.0, -0.5]].flatMap(([x, z]) => cloche(x, 2.2, z, 0.8))),
  ];
}

/** Chenil : grande niche de planches à toit de tôle sur le dos, plancher, portillon et chien qui guette. */
function chenil(): Part[] {
  const Z = -1.75;
  return porte("si:shepherd_kennel#tourelle", AXE, [
    { shape: "box", size: [1.9, 0.14, 1.8], pos: [0, 2.6, q(Z - 0.1)], color: "rust" },
    { shape: "box", size: [1.56, 1.1, 1.24], pos: [0, 3.2, Z], color: "wood" },
    { shape: "extrude", profile: [[-0.78, 0], [0.78, 0], [0, 0.62]], depth: 1.24, pos: [0, 3.74, Z], color: "wood" },
    // toit à deux pans, faîtière du joueur
    { shape: "box", size: [1.24, 0.1, 1.6], pos: [0.5, 4.1, Z], rot: [0, 0, -38], color: "metal" },
    { shape: "box", size: [1.24, 0.1, 1.6], pos: [-0.5, 4.1, Z], rot: [0, 0, 38], color: "rust" },
    { shape: "box", size: [0.34, 0.14, 1.66], pos: [0, 4.46, Z], color: "faction" },
    // entrée au dos, portillon rayé, niche d'un second chien sur le flanc
    { shape: "box", size: [0.76, 0.76, 0.06], pos: [0, 3.06, q(Z - 0.62)], color: "black" },
    { shape: "box", size: [0.1, 0.8, 0.5], pos: [0.5, 3.06, q(Z - 0.84)], rot: [0, -20, 0], color: "hazard" },
    { shape: "bevel", size: [0.46, 0.4, 0.5], pos: [0, 3.12, q(Z - 0.84)], bevel: 0.08, color: "metal" },
    { shape: "box", size: [0.3, 0.2, 0.34], pos: [0, 3.04, q(Z - 1.18)], color: "rust" },
    { shape: "box", size: [0.1, 0.09, 0.05], pos: [0.13, 3.2, q(Z - 1.1)], color: "amber", mirror: true },
    { shape: "wedge", size: [0.16, 0.22, 0.2], pos: [0.2, 3.36, q(Z - 0.72)], rot: [0, 180, 24], color: "rust", mirror: true },
    { shape: "box", size: [0.06, 0.5, 0.5], pos: [0.8, 3.2, Z], color: "black", mirror: true },
    { shape: "box", size: [0.05, 0.08, 0.34], pos: [0.84, 3.28, Z], color: "amber", mirror: true },
    // attaches
    entre([0.6, 3.9, -0.6], [0.7, 3.7, -1.3], 0.12, 0.12, { shape: "box", color: "steel", mirror: true }),
    entre([0.7, 2.5, -0.5], [0.8, 2.6, -2.2], 0.14, 0.14, { shape: "box", color: "steel", mirror: true }),
  ]);
}

/** Parasol : mât au dos, grande toile rapiécée à huit pans, baleines, émetteur de bulle au sommet. */
function parasol(): Part[] {
  const Y = 6.2;
  const Z = -0.35;
  const toiles: C[] = ["faction", "dry", "red", "dry", "faction", "hazard", "dry", "wood"];
  const p: Part[] = [
    entre([0, 3.2, -0.95], [0, 6.2, Z], 0.12, 0, { shape: "cylinder", sides: 8, color: "wood" }),
    { shape: "box", size: [0.4, 0.5, 0.3], pos: [0, 3.5, -0.95], color: "hazard" },
  ];
  toiles.forEach((c, i) => p.push({ ...pan(q(Y + 0.2), 0.3, 1.9, 0.72, 0.07, i * 45, 45, c, 2, Z) }));
  toiles.forEach((c, i) => p.push({ ...pan(q(Y - 0.5), 1.9, 1.92, 0.22, 0.06, i * 45 + 4, 37, c === "faction" ? "dry" : "faction", 1, Z), fine: true }));
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 * Math.PI) / 180;
    p.push({ ...entre([0, q(Y - 0.6), Z], [q(Math.sin(a) * 1.8), q(Y - 0.52), q(Z + Math.cos(a) * 1.8)], 0.05, 0.05, { shape: "box", color: "steel" }), fine: i % 2 === 1 });
  }
  p.push(
    { shape: "cylinder", sides: 8, radius: 0.34, radiusTop: 0.2, height: 0.24, pos: [0, q(Y + 0.28), Z], color: "dark" },
    { shape: "torus", radius: 0.36, tube: 0.08, sides: 12, pos: [0, q(Y + 0.5), Z], color: "copper" },
    { shape: "sphere", radius: 0.28, detail: 1, pos: [0, q(Y + 0.64), Z], color: "glow" },
  );
  return porte("si:shepherd_parasol#tourelle", AXE, p);
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
    ...crosseOrigine(),
    ...electrique(),
    ...fronde(),
    ...lanterne(),
    ...jambes("si:shepherd_stilts#", echasse),
    ...jambes("si:shepherd_boots#", sabot),
    ...manteau(),
    ...sonnailles(),
    ...chenil(),
    ...parasol(),
  ];
}
