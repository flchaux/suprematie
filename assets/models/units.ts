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
import { ANCIENT_UNIT_MODELS } from "./anciens.ts";
import { SOUCHE_UNIT_MODELS } from "./souche.ts";
import { SOUCHE_EGG_MODELS } from "./souche-oeufs.ts";
import { SOUCHE_SWARM_MODELS } from "./souche-essaim.ts";
import { TRANSH_UNIT_MODELS } from "./transhumants.ts";

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

// ——— Lot C (unités terrestres) : aides propres au lot ———

/**
 * Lot C : profil (rayon, longueur) d'un fût de canon le long de l'axe du profil : culasse, fût, frein de bouche.
 * `simple` : moins d'arêtes (unités à plusieurs fûts).
 */
function lcFut(r: number, l: number, simple = false): [number, number][] {
  const q = (v: number) => +v.toFixed(3);
  if (simple) return [[0, 0], [q(r * 1.5), 0], [q(r), q(l * 0.12)], [q(r), q(l * 0.84)], [q(r * 1.4), q(l * 0.86)], [q(r * 1.4), q(l)], [0, q(l)]];
  return [[0, 0], [q(r * 1.5), 0], [q(r * 1.5), q(l * 0.08)], [q(r), q(l * 0.12)], [q(r), q(l * 0.84)], [q(r * 1.4), q(l * 0.86)], [q(r * 1.4), q(l * 0.98)], [q(r * 1.15), q(l)], [0, q(l)]];
}

/**
 * Lot C : paire de roues légères (axe x, symétriques) de rayon r et de largeur w : pneu tourné, jante d'acier,
 * moyeu fin. `simple` : pneu à profil réduit (porteurs à huit roues).
 */
function lcRoues(x: number, y: number, z: number, r: number, w: number, simple = false): Part[] {
  const q = (v: number) => +v.toFixed(3);
  const h = w / 2;
  const profile: [number, number][] = simple
    ? [[q(r * 0.7), q(-h)], [q(r), q(-h * 0.55)], [q(r), q(h * 0.55)], [q(r * 0.7), q(h)]]
    : [[q(r * 0.68), q(-h)], [q(r * 0.92), q(-h)], [q(r), q(-h * 0.5)], [q(r), q(h * 0.5)], [q(r * 0.92), q(h)], [q(r * 0.68), q(h)]];
  return [
    { shape: "lathe", sides: 8, pos: [x, y, z], rot: [0, 0, 90], color: "rubber", mirror: true, profile },
    { shape: "cylinder", sides: 8, radius: q(r * 0.7), height: q(w * 0.8), pos: [x, y, z], rot: [0, 0, 90], color: "steel", mirror: true, smooth: true },
    { shape: "cylinder", sides: 6, radius: q(r * 0.3), height: q(w * 1.02), pos: [x, y, z], rot: [0, 0, 90], color: "dark", mirror: true, fine: true },
  ];
}

/** Lot C : garde-boue en arc (paire symétrique) au-dessus d'une roue d'axe x, de rayon r, centrée en (y, z), de largeur w. */
function lcGardeBoue(x: number, y: number, z: number, r: number, w: number, color: Part["color"] = "dark"): Part {
  const q = (v: number) => +v.toFixed(3);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const a = Math.PI * (0.82 - i * 0.16);
    pts.push([q(z + Math.cos(a) * (r + 0.08)), q(y + Math.sin(a) * (r + 0.08))]);
  }
  for (let i = 4; i >= 0; i--) {
    const a = Math.PI * (0.82 - i * 0.16);
    pts.push([q(z + Math.cos(a) * (r + 0.025)), q(y + Math.sin(a) * (r + 0.025))]);
  }
  return { shape: "extrude", profile: pts, depth: w, pos: [x, 0, 0], rot: [0, -90, 0], color, mirror: true };
}

/** Lot C : jambe du robot de commandement (côté s = 1 droite, -1 gauche), portée par le pivot de hanche. */
function lcJambeCommandant(s: number): Part[] {
  const pv = s > 0 ? "jambe_d" : "jambe_g";
  const x = s * 0.55;
  return [
    // hanche : rotule d'acier (pivot, origine inchangée)
    { shape: "cylinder", sides: 10, radius: 0.2, height: 0.5, pos: [s * 0.5, 1.35, 0], rot: [0, 0, 90], color: "steel", pivot: pv },
    // cuisse profilée claire, bande d'équipe
    { shape: "extrude", profile: [[-0.22, 0.78], [0.2, 0.8], [0.27, 1.04], [0.2, 1.24], [-0.2, 1.24], [-0.27, 1.02]], depth: 0.44, bevel: 0.04, pos: [x, 0, 0.04], rot: [0, -90, 0], color: "light", parent: pv },
    { shape: "box", size: [0.03, 0.3, 0.2], pos: [s * 0.78, 1.0, 0.06], color: "faction", parent: pv },
    // genou : rotule et genouillère d'équipe
    { shape: "cylinder", sides: 6, radius: 0.15, height: 0.48, smooth: true, pos: [x, 0.68, 0], rot: [0, 0, 90], color: "steel", parent: pv },
    { shape: "extrude", profile: [[0.02, 0.52], [0.3, 0.56], [0.34, 0.74], [0.2, 0.84], [0.0, 0.8]], depth: 0.5, bevel: 0.03, pos: [x, 0, 0], rot: [0, -90, 0], color: "faction", parent: pv },
    // tibia en coin, filet cyan, vérin arrière
    { shape: "extrude", profile: [[-0.26, 0.14], [0.26, 0.14], [0.28, 0.5], [0.12, 0.62], [-0.2, 0.62], [-0.28, 0.42]], depth: 0.42, pos: [x, 0, 0], rot: [0, -90, 0], color: "metal", parent: pv },
    { shape: "box", size: [0.06, 0.28, 0.03], pos: [x, 0.33, 0.29], color: "glow", parent: pv },
    { shape: "tube", radius: 0.035, path: [[x, 1.0, -0.24], [x, 0.7, -0.33], [x, 0.3, -0.31]], bend: 0.12, color: "steel", parent: pv, fine: true },
    { shape: "box", size: [0.2, 0.03, 0.03], pos: [x, 0.5, -0.29], color: "hazard", parent: pv, fine: true },
    // pied : coque profilée, semelle de caoutchouc, cheville
    { shape: "extrude", profile: [[-0.4, 0.04], [0.6, 0.04], [0.62, 0.1], [0.44, 0.2], [-0.26, 0.21], [-0.4, 0.12]], depth: 0.6, pos: [x, 0, 0], rot: [0, -90, 0], color: "dark", parent: pv },
    { shape: "box", size: [0.62, 0.05, 0.98], pos: [x, 0.025, 0.1], color: "rubber", parent: pv, fine: true },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.5, smooth: true, pos: [x, 0.22, -0.04], rot: [0, 0, 90], color: "steel", parent: pv, fine: true },
    { shape: "box", size: [0.1, 0.03, 0.04], pos: [x, 0.18, 0.5], color: "amber", parent: pv, fine: true },
  ];
}

export const UNIT_MODELS: Record<string, Model> = {
  // commander : grand mécha bipède, blindage clair, canon au bras droit, visière cyan ; cuisses et tibias
  // profilés à rotules d'acier, torse à pans, casque à crête, sac dorsal à cheminées et grilles ;
  // pièces fines : vérins, câbles de cuivre, grilles, antenne
  commander: {
    parts: [
      // jambes articulées : pivots jambe_d / jambe_g à la hanche (balancement pendant la marche)
      ...lcJambeCommandant(1),
      ...lcJambeCommandant(-1),
      // bassin et taille
      { shape: "extrude", profile: [[-0.48, 1.16], [0.48, 1.16], [0.54, 1.38], [0.42, 1.56], [-0.42, 1.56], [-0.54, 1.38]], depth: 0.72, bevel: 0.04, color: "dark" },
      { shape: "lathe", sides: 10, profile: [[0, 1.48], [0.34, 1.48], [0.36, 1.56], [0.3, 1.64], [0, 1.64]], color: "steel" },
      // fonderie intégrée (récolte des gisements), au bas du dos sous le sac dorsal : caisson sombre
      // chanfreiné, bouche de four ambre à grille, trémie à minerai sur le flanc, conduits de cuivre vers
      // les cheminées du sac (la bouche est le point d'émission des flammèches en jeu : 0, 1,32, -0,78)
      { shape: "bevel", size: [0.62, 0.42, 0.36], pos: [0, 1.36, -0.56], color: "dark", bevel: 0.04 },
      { shape: "box", size: [0.66, 0.05, 0.4], pos: [0, 1.58, -0.56], color: "faction", fine: true },
      { shape: "box", size: [0.34, 0.14, 0.03], pos: [0, 1.32, -0.75], color: "amber" },
      ...[-0.06, 0.06].map((x): Part => ({ shape: "box", size: [0.025, 0.16, 0.03], pos: [x, 1.32, -0.765], color: "black", fine: true })),
      { shape: "cone", sides: 6, radius: 0.15, height: 0.2, pos: [0.4, 1.52, -0.56], rot: [180, 0, 0], color: "metal", fine: true },
      { shape: "tube", radius: 0.028, sides: 5, path: [[0.22, 1.6, -0.7], [0.3, 1.8, -0.82]], color: "copper", mirror: true, fine: true },
      // torse à pans (pivot)
      { shape: "extrude", profile: [[-0.6, -0.46], [0.6, -0.46], [0.66, 0.08], [0.52, 0.44], [-0.52, 0.44], [-0.66, 0.08]], depth: 1.0, bevel: 0.05, pos: [0, 1.92, 0], color: "faction", pivot: "torse" },
      { shape: "extrude", profile: [[0.4, 1.62], [0.6, 1.66], [0.62, 2.12], [0.42, 2.3]], depth: 0.96, bevel: 0.03, rot: [0, -90, 0], color: "light", parent: "torse" },
      { shape: "box", size: [0.72, 0.09, 0.05], pos: [0, 2.02, 0.625], color: "glow", parent: "torse" },
      { shape: "box", size: [0.1, 0.06, 0.04], pos: [0.3, 1.76, 0.625], color: "amber", mirror: true, parent: "torse", fine: true },
      ...[2.16, 2.21, 2.26].map((y): Part => ({ shape: "box", size: [0.6, 0.02, 0.04], pos: [0, y, 0.44 + (2.3 - y) * 1.1], color: "black", parent: "torse", fine: true })),
      // cou et casque à crête, visière cyan
      { shape: "cylinder", sides: 10, radius: 0.16, height: 0.16, pos: [0, 2.38, 0.08], color: "steel", parent: "torse" },
      { shape: "extrude", profile: [[-0.24, -0.14], [0.24, -0.14], [0.28, 0.04], [0.2, 0.17], [-0.2, 0.17], [-0.28, 0.04]], depth: 0.5, bevel: 0.03, pos: [0, 2.5, 0.1], color: "light", parent: "torse" },
      { shape: "box", size: [0.42, 0.07, 0.05], pos: [0, 2.52, 0.36], color: "glow", parent: "torse" },
      { shape: "box", size: [0.1, 0.06, 0.44], pos: [0, 2.68, 0.08], color: "faction", parent: "torse" },
      // épaules : carénage clair, dessus d'équipe à ouïes, voyants
      { shape: "extrude", profile: [[-0.3, -0.23], [0.24, -0.23], [0.3, -0.12], [0.3, 0.23], [-0.3, 0.23]], depth: 0.8, bevel: 0.04, pos: [0.95, 2.22, 0], color: "light", mirror: true, parent: "torse" },
      { shape: "extrude", profile: [[-0.28, -0.04], [0.28, -0.04], [0.3, 0.05], [0.18, 0.15], [-0.18, 0.15], [-0.3, 0.05]], depth: 0.84, bevel: 0.02, pos: [0.98, 2.45, 0], color: "faction", mirror: true, parent: "torse" },
      ...[-0.15, 0.15].map((z): Part => ({ shape: "box", size: [0.3, 0.02, 0.06], pos: [0.98, 2.615, z], color: "black", mirror: true, parent: "torse", fine: true })),
      { shape: "box", size: [0.08, 0.06, 0.04], pos: [1.2, 2.3, 0.41], color: "amber", mirror: true, parent: "torse", fine: true },
      // bras droit : canon (boîtier profilé, fût d'acier à frein de bouche, bouche cyan)
      { shape: "box", size: [0.32, 0.5, 0.38], pos: [1.05, 1.84, 0.06], color: "metal", parent: "torse" },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.46, pos: [1.08, 1.58, 0.05], rot: [0, 0, 90], color: "steel", parent: "torse" },
      { shape: "extrude", profile: [[-0.1, 1.32], [0.84, 1.36], [0.9, 1.56], [0.8, 1.76], [0.02, 1.78], [-0.12, 1.56]], depth: 0.48, bevel: 0.04, pos: [1.1, 0, 0], rot: [0, -90, 0], color: "dark", parent: "torse" },
      { shape: "box", size: [0.3, 0.04, 0.56], pos: [1.1, 1.785, 0.4], color: "faction", parent: "torse" },
      { shape: "box", size: [0.04, 0.06, 0.66], pos: [1.37, 1.58, 0.42], color: "glow", parent: "torse" },
      { shape: "lathe", sides: 10, pos: [1.1, 1.55, 0.86], rot: [90, 0, 0], color: "steel", parent: "torse", profile: [[0, 0], [0.16, 0], [0.11, 0.1], [0.11, 0.58], [0.15, 0.6], [0.15, 0.83], [0, 0.83]] },
      { shape: "cylinder", sides: 10, radius: 0.1, height: 0.04, pos: [1.1, 1.55, 1.7], rot: [90, 0, 0], color: "glow", parent: "torse" },
      ...[1.08, 1.22].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.13, height: 0.03, pos: [1.1, 1.55, z], rot: [90, 0, 0], color: "dark", parent: "torse", fine: true })),
      // bras gauche : outil de construction (avant-bras clair, buse d'acier, émetteur cyan, pinces)
      { shape: "box", size: [0.32, 0.5, 0.38], pos: [-1.05, 1.84, 0.06], color: "metal", parent: "torse" },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.46, pos: [-1.08, 1.58, 0.05], rot: [0, 0, 90], color: "steel", parent: "torse" },
      { shape: "extrude", profile: [[-0.2, 1.14], [0.3, 1.14], [0.34, 1.36], [0.24, 1.56], [-0.18, 1.56], [-0.24, 1.36]], depth: 0.4, bevel: 0.04, pos: [-1.08, 0, 0.02], rot: [0, -90, 0], color: "light", parent: "torse" },
      { shape: "box", size: [0.03, 0.2, 0.3], pos: [-1.3, 1.36, 0.06], color: "faction", parent: "torse" },
      { shape: "lathe", sides: 10, pos: [-1.08, 1.02, 0.34], rot: [90, 0, 0], color: "steel", parent: "torse", profile: [[0, 0], [0.14, 0], [0.14, 0.08], [0.09, 0.16], [0.07, 0.26], [0, 0.26]] },
      { shape: "cylinder", sides: 10, radius: 0.065, height: 0.04, pos: [-1.08, 1.02, 0.61], rot: [90, 0, 0], color: "glow", parent: "torse" },
      { shape: "box", size: [0.04, 0.05, 0.22], pos: [-0.96, 0.92, 0.5], rot: [20, 0, 0], color: "dark", mirror: false, parent: "torse", fine: true },
      { shape: "box", size: [0.04, 0.05, 0.22], pos: [-1.2, 0.92, 0.5], rot: [20, 0, 0], color: "dark", parent: "torse", fine: true },
      // sac dorsal : coque profilée, grilles, cheminées, filet cyan, câbles de cuivre, antenne
      { shape: "extrude", profile: [[-0.44, 1.64], [-0.84, 1.7], [-0.88, 2.2], [-0.78, 2.36], [-0.44, 2.36]], depth: 0.92, bevel: 0.04, rot: [0, -90, 0], color: "dark", parent: "torse" },
      { shape: "box", size: [0.5, 0.03, 0.34], pos: [0, 2.37, -0.6], color: "faction", parent: "torse" },
      ...[-0.5, -0.6, -0.7].map((z): Part => ({ shape: "box", size: [0.44, 0.025, 0.04], pos: [0, 2.39, z], color: "black", parent: "torse", fine: true })),
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.38, pos: [0.32, 2.49, -0.66], color: "steel", mirror: true, smooth: true, parent: "torse" },
      { shape: "cylinder", sides: 8, radius: 0.07, height: 0.02, pos: [0.32, 2.685, -0.66], color: "black", mirror: true, parent: "torse", fine: true },
      { shape: "box", size: [0.6, 0.08, 0.04], pos: [0, 1.9, -0.89], color: "glow", parent: "torse" },
      { shape: "tube", radius: 0.03, path: [[0.42, 2.1, -0.5], [0.66, 2.1, -0.42], [0.8, 1.98, -0.26]], bend: 0.1, color: "copper", mirror: true, parent: "torse", fine: true },
      { shape: "tube", radius: 0.014, sides: 4, path: [[-0.42, 2.36, -0.55], [-0.42, 3.28, -0.6]], color: "light", parent: "torse", fine: true },
      { shape: "sphere", radius: 0.055, pos: [-0.42, 3.315, -0.6], color: "glow", parent: "torse", fine: true },
    ],
  },
  // eng1 : drone ingénieur, coque blindée en galet, pince à gauche, outil laser à droite, deux rotors latéraux
  // carénés ; pièces fines : patins, voyants, anneaux lumineux des carènes, antenne
  eng1: {
    parts: [
      // coque en galet (tournée), calotte d'équipe, face avant à filet cyan
      { shape: "lathe", sides: 12, pos: [0, 0.52, 0], scale: [1, 1, 0.92], color: "light", profile: [[0, 0], [0.34, 0], [0.44, 0.08], [0.47, 0.2], [0.42, 0.32], [0.3, 0.39], [0, 0.41]] },
      { shape: "lathe", sides: 12, pos: [0, 0.885, 0], scale: [1, 1, 0.92], color: "faction", profile: [[0, 0], [0.33, 0], [0.33, 0.03], [0.22, 0.08], [0, 0.1]] },
      { shape: "torus", radius: 0.47, tube: 0.025, sides: 12, pos: [0, 0.72, 0], scale: [1, 1, 0.92], color: "dark" },
      { shape: "extrude", profile: [[0.3, 0.58], [0.46, 0.62], [0.46, 0.84], [0.32, 0.88]], depth: 0.46, bevel: 0.02, rot: [0, -90, 0], color: "dark" },
      { shape: "box", size: [0.3, 0.05, 0.03], pos: [0, 0.76, 0.47], color: "glow" },
      { shape: "box", size: [0.06, 0.04, 0.04], pos: [0.2, 0.97, 0.2], color: "amber", mirror: true, fine: true },
      // bras porte-rotor et carène d'équipe à anneau lumineux
      { shape: "extrude", profile: [[0.38, -0.06], [0.82, -0.035], [0.82, 0.035], [0.38, 0.07]], depth: 0.14, bevel: 0.015, pos: [0, 0.8, 0], color: "metal", mirror: true },
      { shape: "torus", radius: 0.3, tube: 0.04, sides: 16, pos: [1.08, 0.8, 0], scale: [1, 1.6, 1], color: "faction", mirror: true },
      { shape: "torus", radius: 0.255, tube: 0.012, sides: 12, pos: [1.08, 0.83, 0], color: "glow", mirror: true, fine: true },
      { shape: "box", size: [0.56, 0.025, 0.04], pos: [1.08, 0.77, 0], color: "dark", mirror: true },
      { shape: "box", size: [0.04, 0.025, 0.56], pos: [1.08, 0.77, 0], color: "dark", mirror: true, fine: true },
      { shape: "cylinder", sides: 10, radius: 0.06, height: 0.08, pos: [1.08, 0.8, 0], color: "steel", mirror: true },
      // moyeux (pivots) et pales
      { shape: "cone", sides: 10, radius: 0.06, height: 0.08, pos: [1.08, 0.86, 0], color: "steel", pivot: "rotor1" },
      { use: "rotor", pos: [1.08, 0.85, 0], scale: [0.31, 1, 0.31], parent: "rotor1" },
      { shape: "cone", sides: 10, radius: 0.06, height: 0.08, pos: [-1.08, 0.86, 0], color: "steel", pivot: "rotor2" },
      { use: "rotor", pos: [-1.08, 0.85, 0], scale: [0.31, 1, 0.31], parent: "rotor2" },
      // pince (gauche) : bras, poignet d'acier, mâchoires
      { shape: "tube", radius: 0.045, path: [[-0.3, 0.6, 0.18], [-0.3, 0.42, 0.26], [-0.3, 0.36, 0.32]], bend: 0.08, color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.07, height: 0.08, pos: [-0.3, 0.34, 0.34], color: "steel" },
      { shape: "box", size: [0.04, 0.16, 0.06], pos: [-0.36, 0.24, 0.36], rot: [0, 0, -15], color: "dark" },
      { shape: "box", size: [0.04, 0.16, 0.06], pos: [-0.24, 0.24, 0.36], rot: [0, 0, 15], color: "dark" },
      // outil laser (droite) : buse d'acier et faisceau
      { shape: "lathe", sides: 10, pos: [0.3, 0.46, 0.2], rot: [90, 0, 0], color: "steel", profile: [[0, 0], [0.08, 0], [0.08, 0.24], [0.05, 0.3], [0.035, 0.46], [0, 0.46]] },
      { shape: "torus", radius: 0.075, tube: 0.015, sides: 8, pos: [0.3, 0.46, 0.38], rot: [90, 0, 0], color: "copper", fine: true },
      { shape: "box", size: [0.03, 0.03, 0.17], pos: [0.3, 0.46, 0.745], color: "glow" },
      // patins et antenne
      { shape: "tube", radius: 0.02, sides: 5, path: [[0.26, 0.55, 0.22], [0.3, 0.34, 0.18], [0.3, 0.34, -0.26], [0.26, 0.55, -0.3]], bend: 0.06, color: "metal", mirror: true, fine: true },
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.12, 0.9, -0.18], [-0.14, 1.05, -0.3]], color: "light", fine: true },
    ],
  },
  // eng3 : drone ingénieur avancé, coque large à pans, quatre rotors en croix sur nacelles d'acier, foreuse et
  // pince ; pièces fines : grilles, voyants, câbles, rivets des bras
  eng3: {
    parts: [
      // coque octogonale à pans, dessus d'équipe, trappe centrale
      { shape: "extrude", profile: [[-0.3, -0.5], [0.3, -0.5], [0.5, -0.3], [0.5, 0.3], [0.3, 0.5], [-0.3, 0.5], [-0.5, 0.3], [-0.5, -0.3]], depth: 0.42, bevel: 0.05, pos: [0, 0.8, 0], rot: [90, 0, 0], color: "dark" },
      { shape: "extrude", profile: [[-0.24, -0.42], [0.24, -0.42], [0.42, -0.24], [0.42, 0.24], [0.24, 0.42], [-0.24, 0.42], [-0.42, 0.24], [-0.42, -0.24]], depth: 0.06, bevel: 0.02, pos: [0, 1.04, -0.02], rot: [90, 0, 0], color: "faction" },
      { shape: "cylinder", sides: 10, radius: 0.16, height: 0.05, bevel: 0.015, pos: [0, 1.09, -0.08], color: "light" },
      { shape: "box", size: [0.06, 0.04, 0.04], pos: [0.12, 1.1, 0.2], color: "amber", mirror: true },
      ...[-0.26, -0.33, -0.4].map((z): Part => ({ shape: "box", size: [0.3, 0.02, 0.035], pos: [0, 1.08, z], color: "black", fine: true })),
      // face avant inclinée claire à filet cyan
      { shape: "extrude", profile: [[0.4, 0.62], [0.6, 0.66], [0.6, 0.9], [0.44, 0.98]], depth: 0.6, bevel: 0.02, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [0.42, 0.05, 0.03], pos: [0, 0.82, 0.61], color: "glow" },
      // bras en croix et nacelles moteur
      { shape: "box", size: [1.6, 0.07, 0.14], pos: [0, 0.86, 0], color: "metal" },
      { shape: "box", size: [0.14, 0.07, 1.6], pos: [0, 0.86, 0], color: "metal" },
      ...[[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].map(([x, z]): Part => ({ shape: "lathe", sides: 10, pos: [x, 0.78, z], color: "steel", profile: [[0, 0], [0.1, 0], [0.12, 0.04], [0.12, 0.13], [0.08, 0.17], [0, 0.17]] })),
      ...[[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]].map(([x, z]): Part => ({ shape: "torus", radius: 0.12, tube: 0.015, sides: 10, pos: [x, 0.86, z], color: "faction" })),
      ...[0.45, -0.45].map((x): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.16, pos: [x, 0.86, 0], rot: [90, 0, 0], color: "steel", fine: true })),
      ...[0.45, -0.45].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.16, pos: [0, 0.86, z], rot: [0, 0, 90], color: "steel", fine: true })),
      // rotors (pivots)
      { shape: "cone", sides: 8, radius: 0.06, height: 0.08, pos: [0.8, 0.98, 0], color: "steel", pivot: "r1" },
      { use: "rotor", pos: [0.8, 0.96, 0], scale: 0.48, parent: "r1" },
      { shape: "cone", sides: 8, radius: 0.06, height: 0.08, pos: [-0.8, 0.98, 0], color: "steel", pivot: "r2" },
      { use: "rotor", pos: [-0.8, 0.96, 0], scale: 0.48, parent: "r2" },
      { shape: "cone", sides: 8, radius: 0.06, height: 0.08, pos: [0, 0.98, 0.8], color: "steel", pivot: "r3" },
      { use: "rotor", pos: [0, 0.96, 0.8], scale: 0.48, parent: "r3" },
      { shape: "cone", sides: 8, radius: 0.06, height: 0.08, pos: [0, 0.98, -0.8], color: "steel", pivot: "r4" },
      { use: "rotor", pos: [0, 0.96, -0.8], scale: 0.48, parent: "r4" },
      // foreuse (droite) : bras, moteur d'acier, collier de danger, mèche tournée
      { shape: "box", size: [0.13, 0.3, 0.13], pos: [0.36, 0.5, 0.3], color: "metal" },
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.16, pos: [0.36, 0.34, 0.36], rot: [90, 0, 0], color: "steel" },
      { shape: "cylinder", sides: 8, radius: 0.095, height: 0.04, pos: [0.36, 0.34, 0.46], rot: [90, 0, 0], color: "hazard" },
      { shape: "lathe", sides: 8, pos: [0.36, 0.34, 0.48], rot: [90, 0, 0], color: "amber", profile: [[0, 0], [0.08, 0], [0.07, 0.08], [0.05, 0.16], [0.03, 0.26], [0, 0.34]] },
      // pince (gauche)
      { shape: "box", size: [0.13, 0.3, 0.13], pos: [-0.36, 0.5, 0.3], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.08, height: 0.08, pos: [-0.36, 0.34, 0.33], color: "steel" },
      { shape: "box", size: [0.05, 0.18, 0.06], pos: [-0.42, 0.24, 0.38], rot: [0, 0, -15], color: "dark" },
      { shape: "box", size: [0.05, 0.18, 0.06], pos: [-0.3, 0.24, 0.38], rot: [0, 0, 15], color: "dark" },
      { shape: "tube", radius: 0.018, sides: 5, path: [[0.36, 0.66, 0.22], [0.36, 0.6, 0.44], [0.36, 0.42, 0.44]], bend: 0.06, color: "copper", fine: true },
    ],
  },
  // eng5 : drone ingénieur suprême, dôme blindé d'équipe à œil cyan, anneau lumineux, quatre rotors carénés ;
  // pièces fines : anneaux lumineux des carènes, haubans, voyants
  eng5: {
    parts: [
      // jupe d'acier, dôme d'équipe, anneau lumineux, plaques claires
      { shape: "lathe", sides: 12, color: "steel", profile: [[0, 0.62], [0.48, 0.62], [0.6, 0.7], [0.62, 0.86], [0.55, 0.95], [0, 0.95]] },
      { shape: "lathe", sides: 12, pos: [0, 0.94, 0], color: "faction", profile: [[0, 0], [0.54, 0], [0.5, 0.13], [0.38, 0.25], [0.2, 0.31], [0, 0.33]] },
      { shape: "torus", radius: 0.5, tube: 0.03, sides: 12, pos: [0, 0.655, 0], color: "glow" },
      { shape: "torus", radius: 0.56, tube: 0.02, sides: 12, pos: [0, 0.95, 0], color: "dark", fine: true },
      { shape: "cylinder", sides: 10, radius: 0.12, height: 0.04, bevel: 0.01, pos: [0, 1.27, 0], color: "light" },
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "box", size: [0.34, 0.24, 0.1], pos: [+(Math.sin((a * Math.PI) / 180) * 0.56).toFixed(3), 0.84, +(Math.cos((a * Math.PI) / 180) * 0.56).toFixed(3)], rot: [0, a, 0], color: "light" })),
      // œil cyan dans sa bague d'acier
      { shape: "cylinder", sides: 10, radius: 0.17, height: 0.06, pos: [0, 0.82, 0.6], rot: [90, 0, 0], color: "steel" },
      { shape: "sphere", radius: 0.12, pos: [0, 0.82, 0.62], scale: [1, 1, 0.6], color: "glow" },
      { shape: "box", size: [0.06, 0.04, 0.04], pos: [0.28, 1.17, 0.12], color: "amber", mirror: true },
      // bras en croix
      { shape: "extrude", profile: [[0.5, -0.05], [0.72, -0.04], [0.72, 0.04], [0.5, 0.06]], depth: 0.16, pos: [0, 0.88, 0], color: "metal", mirror: true },
      { shape: "extrude", profile: [[0.5, -0.05], [0.72, -0.04], [0.72, 0.04], [0.5, 0.06]], depth: 0.16, pos: [0, 0.88, 0], rot: [0, 90, 0], color: "metal" },
      { shape: "extrude", profile: [[0.5, -0.05], [0.72, -0.04], [0.72, 0.04], [0.5, 0.06]], depth: 0.16, pos: [0, 0.88, 0], rot: [0, -90, 0], color: "metal" },
      // carènes d'équipe, anneaux lumineux, croisillons, moteurs
      ...[[1.05, 0], [-1.05, 0], [0, 1.05], [0, -1.05]].flatMap(([x, z]): Part[] => [
        { shape: "torus", radius: 0.37, tube: 0.035, sides: 12, pos: [x, 0.92, z], scale: [1, 1.8, 1], color: "faction" },
        { shape: "torus", radius: 0.335, tube: 0.01, sides: 12, pos: [x, 0.96, z], color: "glow", fine: true },
        { shape: "box", size: [0.72, 0.025, 0.035], pos: [x, 0.88, z], rot: [0, 45, 0], color: "dark" },
        { shape: "box", size: [0.72, 0.025, 0.035], pos: [x, 0.88, z], rot: [0, -45, 0], color: "dark", fine: true },
        { shape: "cylinder", sides: 8, radius: 0.08, height: 0.1, pos: [x, 0.9, z], color: "steel" },
      ]),
      // rotors (pivots)
      { shape: "cone", sides: 8, radius: 0.07, height: 0.08, pos: [1.05, 1.0, 0], color: "steel", pivot: "r1" },
      { use: "rotor", pos: [1.05, 0.98, 0], scale: [0.41, 1, 0.41], parent: "r1" },
      { shape: "cone", sides: 8, radius: 0.07, height: 0.08, pos: [-1.05, 1.0, 0], color: "steel", pivot: "r2" },
      { use: "rotor", pos: [-1.05, 0.98, 0], scale: [0.41, 1, 0.41], parent: "r2" },
      { shape: "cone", sides: 8, radius: 0.07, height: 0.08, pos: [0, 1.0, 1.05], color: "steel", pivot: "r3" },
      { use: "rotor", pos: [0, 0.98, 1.05], scale: [0.41, 1, 0.41], parent: "r3" },
      { shape: "cone", sides: 8, radius: 0.07, height: 0.08, pos: [0, 1.0, -1.05], color: "steel", pivot: "r4" },
      { use: "rotor", pos: [0, 0.98, -1.05], scale: [0.41, 1, 0.41], parent: "r4" },
    ],
  },
  // line_robot : petit fantassin bipède, fusil au bras droit (unité la plus nombreuse : peu de triangles) ;
  // jambes et torse profilés, genouillères et torse d'équipe, casque à visière, sac à dos ; pièces fines :
  // filets des tibias, lunette, antenne
  line_robot: {
    parts: [
      // jambes articulées (pivots à la hanche) et bassin
      ...[1, -1].flatMap((s): Part[] => {
        const pv = s > 0 ? "jambe_d" : "jambe_g";
        const x = s * 0.15;
        return [
          { shape: "cylinder", sides: 8, radius: 0.07, height: 0.17, pos: [x, 0.72, 0], rot: [0, 0, 90], color: "steel", pivot: pv },
          { shape: "extrude", profile: [[-0.09, 0.44], [0.1, 0.44], [0.12, 0.58], [0.08, 0.7], [-0.08, 0.7], [-0.11, 0.58]], depth: 0.15, pos: [x, 0, 0], rot: [0, -90, 0], color: "metal", parent: pv },
          { shape: "extrude", profile: [[0.03, 0.32], [0.14, 0.35], [0.15, 0.45], [0.08, 0.5], [0.01, 0.46]], depth: 0.17, pos: [x, 0, 0], rot: [0, -90, 0], color: "faction", parent: pv },
          { shape: "extrude", profile: [[-0.11, 0.07], [0.13, 0.07], [0.13, 0.24], [0.06, 0.4], [-0.09, 0.4], [-0.13, 0.24]], depth: 0.18, bevel: 0.015, pos: [x, 0, 0.01], rot: [0, -90, 0], color: "light", parent: pv },
          { shape: "extrude", profile: [[-0.12, 0], [0.22, 0], [0.23, 0.04], [0.13, 0.085], [-0.09, 0.09], [-0.13, 0.04]], depth: 0.22, pos: [x, 0, 0.01], rot: [0, -90, 0], color: "dark", parent: pv },
          { shape: "box", size: [0.03, 0.12, 0.02], pos: [x, 0.2, 0.145], color: "glow", parent: pv, fine: true },
        ];
      }),
      { shape: "extrude", profile: [[-0.2, 0.68], [0.2, 0.68], [0.22, 0.78], [0.15, 0.85], [-0.15, 0.85], [-0.22, 0.78]], depth: 0.26, color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.1, pos: [0, 0.86, 0], color: "steel" },
      // haut du corps orientable (pivot torse) : il vise la cible pendant la marche
      { shape: "extrude", profile: [[-0.22, -0.2], [0.22, -0.2], [0.28, 0.07], [0.2, 0.22], [-0.2, 0.22], [-0.28, 0.07]], depth: 0.36, bevel: 0.03, pos: [0, 1.02, 0], color: "faction", pivot: "torse" },
      { shape: "extrude", profile: [[0.12, 0.88], [0.21, 0.9], [0.22, 1.12], [0.12, 1.2]], depth: 0.38, bevel: 0.015, rot: [0, -90, 0], color: "light", parent: "torse" },
      // casque à visière cyan
      { shape: "extrude", profile: [[-0.1, -0.09], [0.1, -0.09], [0.12, 0.03], [0.07, 0.1], [-0.07, 0.1], [-0.12, 0.03]], depth: 0.27, bevel: 0.015, pos: [0, 1.38, 0.03], color: "light", parent: "torse" },
      { shape: "box", size: [0.18, 0.045, 0.03], pos: [0, 1.39, 0.175], color: "glow", parent: "torse" },
      { shape: "box", size: [0.04, 0.03, 0.22], pos: [0, 1.485, 0.02], color: "faction", parent: "torse" },
      // épaulières, bras
      { shape: "extrude", profile: [[-0.085, -0.07], [0.085, -0.07], [0.09, 0.02], [0.05, 0.075], [-0.05, 0.075], [-0.09, 0.02]], depth: 0.28, bevel: 0.012, pos: [0.36, 1.2, 0], color: "light", mirror: true, parent: "torse" },
      { shape: "box", size: [0.05, 0.012, 0.26], pos: [0.36, 1.282, 0], color: "faction", mirror: true, parent: "torse" },
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.24, pos: [0.38, 1.03, 0.03], color: "steel", mirror: true, parent: "torse" },
      { shape: "box", size: [0.11, 0.18, 0.13], pos: [0.38, 0.86, 0.06], color: "metal", mirror: true, parent: "torse" },
      { shape: "box", size: [0.1, 0.08, 0.1], pos: [-0.38, 0.74, 0.1], color: "dark", parent: "torse", fine: true },
      ...[1.17, 1.2].map((y): Part => ({ shape: "box", size: [0.26, 0.012, 0.025], pos: [0, y, 0.14 + (1.2 - y) * 1.6], color: "black", parent: "torse", fine: true })),
      { shape: "box", size: [0.08, 0.08, 0.06], pos: [0.12, 0.74, 0.14], color: "dark", mirror: true, fine: true },
      { shape: "cylinder", sides: 6, radius: 0.025, height: 0.06, pos: [0.13, 1.38, 0.03], rot: [0, 0, 90], color: "steel", mirror: true, parent: "torse", fine: true },
      // fusil (droite) : carcasse profilée, canon d'acier, bouche cyan, lunette
      { shape: "extrude", profile: [[-0.02, 0.76], [0.42, 0.78], [0.44, 0.86], [0.12, 0.88], [-0.04, 0.84]], depth: 0.09, pos: [0.38, 0, 0.04], rot: [0, -90, 0], color: "dark", parent: "torse" },
      { shape: "cylinder", sides: 6, radius: 0.025, height: 0.22, pos: [0.38, 0.82, 0.55], rot: [90, 0, 0], color: "steel", parent: "torse" },
      { shape: "box", size: [0.05, 0.05, 0.03], pos: [0.38, 0.82, 0.665], color: "glow", parent: "torse" },
      { shape: "box", size: [0.05, 0.1, 0.06], pos: [0.38, 0.72, 0.22], rot: [-10, 0, 0], color: "black", parent: "torse" },
      { shape: "box", size: [0.04, 0.04, 0.14], pos: [0.38, 0.9, 0.3], color: "black", parent: "torse", fine: true },
      // sac à dos, voyant, antenne
      { shape: "extrude", profile: [[-0.16, 0.92], [-0.33, 0.94], [-0.34, 1.15], [-0.16, 1.2]], depth: 0.34, rot: [0, -90, 0], color: "dark", parent: "torse" },
      { shape: "box", size: [0.24, 0.02, 0.12], pos: [0, 1.175, -0.25], color: "faction", parent: "torse" },
      { shape: "box", size: [0.06, 0.04, 0.03], pos: [0.12, 1.08, -0.34], color: "amber", parent: "torse" },
      { shape: "cylinder", sides: 8, radius: 0.04, height: 0.2, pos: [0.19, 1.04, -0.25], color: "steel", mirror: true, parent: "torse", fine: true },
      { shape: "tube", radius: 0.01, sides: 4, path: [[-0.12, 1.17, -0.26], [-0.12, 1.42, -0.3]], color: "light", parent: "torse", fine: true },
    ],
  },
  // moto : glisseur effilé, nez clair, verrière, nacelles latérales à liseré cyan, ailerons ; coque profilée,
  // capot d'équipe, nacelles tournées à tuyère lumineuse ; pièces fines : guidon, ouïes, patins de sustentation
  moto: {
    parts: [
      // coque profilée sombre, nez clair, capot d'équipe
      { shape: "extrude", profile: [[-0.98, 0.36], [0.7, 0.34], [1.2, 0.4], [1.0, 0.56], [0.5, 0.64], [-0.6, 0.68], [-0.98, 0.58]], depth: 0.62, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.6, 0.36], [1.2, 0.4], [1.44, 0.45], [1.3, 0.54], [0.9, 0.62], [0.6, 0.64]], depth: 0.56, bevel: 0.03, rot: [0, -90, 0], color: "light" },
      { shape: "extrude", profile: [[-0.72, 0.62], [0.52, 0.6], [0.38, 0.72], [-0.5, 0.75]], depth: 0.5, bevel: 0.03, rot: [0, -90, 0], color: "faction" },
      { shape: "sphere", radius: 1, detail: 1, pos: [0, 0.74, 0.3], scale: [0.17, 0.12, 0.3], color: "glass" },
      { shape: "extrude", profile: [[-0.45, 0.72], [0.02, 0.73], [0.04, 0.8], [-0.4, 0.83]], depth: 0.26, bevel: 0.015, rot: [0, -90, 0], color: "black" },
      ...[-0.6, -0.66, -0.72].map((z): Part => ({ shape: "box", size: [0.36, 0.02, 0.03], pos: [0, 0.745 - (z + 0.6) * 0.1, z], color: "black", fine: true })),
      // nacelles tournées à liseré cyan et tuyère lumineuse
      { shape: "lathe", sides: 10, pos: [0.46, 0.42, -0.78], rot: [90, 0, 0], color: "light", mirror: true, profile: [[0, 0], [0.09, 0], [0.125, 0.07], [0.125, 0.78], [0.1, 0.92], [0, 0.95]] },
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.03, pos: [0.46, 0.42, -0.79], rot: [90, 0, 0], color: "glow", mirror: true },
      { shape: "torus", radius: 0.115, tube: 0.015, sides: 10, pos: [0.46, 0.42, -0.68], rot: [90, 0, 0], color: "steel", mirror: true, fine: true },
      { shape: "box", size: [0.03, 0.04, 0.6], pos: [0.595, 0.44, -0.3], color: "glow", mirror: true },
      { shape: "box", size: [0.1, 0.06, 0.3], pos: [0.36, 0.44, -0.3], color: "metal", mirror: true },
      // feux et liseré avant
      { shape: "box", size: [0.5, 0.04, 0.05], pos: [0, 0.37, 1.1], color: "glow" },
      { shape: "box", size: [0.07, 0.04, 0.04], pos: [0.18, 0.6, 1.0], color: "amber", mirror: true },
      // ailerons d'équipe
      { shape: "extrude", profile: [[-0.95, 0.66], [-0.6, 0.66], [-0.8, 0.98], [-0.98, 0.98]], depth: 0.04, bevel: 0.01, pos: [0.18, 0, 0], rot: [0, -90, 0], color: "faction", mirror: true },
      // guidon
      { shape: "tube", radius: 0.018, sides: 5, path: [[0.22, 0.76, 0.06], [0.12, 0.84, 0.12], [-0.12, 0.84, 0.12], [-0.22, 0.76, 0.06]], bend: 0.05, color: "steel", fine: true },
      // coussin lumineux et patins de sustentation
      { shape: "box", size: [0.46, 0.04, 1.2], pos: [0, 0.3, -0.1], color: "glow" },
      { shape: "cylinder", sides: 10, radius: 0.12, height: 0.06, pos: [0, 0.33, 0.62], color: "dark", fine: true },
      { shape: "cylinder", sides: 10, radius: 0.12, height: 0.06, pos: [0, 0.33, -0.8], color: "dark", fine: true },
    ],
  },
  // light_tank : char léger à chenilles détaillées (galets visibles sous les jupes), caisse profilée d'équipe,
  // plage moteur à grilles et échappements, tourelle à pans à tourelleau, canon à évacuateur et frein de bouche ;
  // pièces fines : lames des grilles, lance-fumigènes, crochets, antenne
  light_tank: {
    parts: [
      { use: "chenille_d", pos: [0.95,0,0], mirror: true },
      // patins sur le brin supérieur (vus de dessus), jupe haute d'équipe (laisse voir les galets)
      ...[-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75].map((z): Part => ({ shape: "box", size: [0.44,0.03,0.07], pos: [0.95,0.505,z], color: "metal", mirror: true, fine: true })),
      { shape: "bevel", size: [0.1,0.06,2.25], pos: [1.18,0.55,0], bevel: 0.02, color: "light", mirror: true },
      { shape: "extrude", profile: [[-1.0,0.36],[1.0,0.36],[1.12,0.52],[-1.1,0.52]], depth: 0.05, pos: [1.19,0,0], rot: [0,-90,0], color: "faction", mirror: true },
      // caisse profilée : glacis, flancs et arrière inclinés
      { shape: "extrude", profile: [[-1.05,0.3],[0.95,0.3],[1.25,0.55],[1.05,0.8],[-0.9,0.82],[-1.08,0.64]], depth: 1.46, bevel: 0.05, rot: [0,-90,0], color: "faction" },
      { shape: "bevel", size: [1.2,0.06,0.75], pos: [0,0.84,0.55], bevel: 0.02, color: "light" },
      { shape: "box", size: [0.1,0.06,0.04], pos: [0.55,0.62,1.19], color: "amber", mirror: true },
      { shape: "torus", radius: 0.05, tube: 0.015, sides: 8, pos: [0.4,0.36,1.08], rot: [0,0,90], color: "dark", mirror: true, fine: true },
      // plage moteur : capot sombre, grilles, filet, échappements
      { shape: "bevel", size: [1.15,0.1,0.7], pos: [0,0.86,-0.62], bevel: 0.03, color: "dark" },
      ...[-0.42, -0.56, -0.7, -0.84].map((z): Part => ({ shape: "box", size: [0.8,0.03,0.06], pos: [0,0.925,z], color: "black", fine: true })),
      { shape: "box", size: [0.9,0.03,0.04], pos: [0,0.92,-0.96], color: "glow" },
      { shape: "tube", radius: 0.045, path: [[0.45,0.75,-0.92],[0.45,0.75,-1.04],[0.45,0.9,-1.1]], bend: 0.08, color: "steel", mirror: true },
      // tourelle à pans (pivot), dessus d'équipe, flancs lumineux, nuque
      { shape: "extrude", profile: [[-0.5,-0.55],[0.5,-0.55],[0.56,0.05],[0.32,0.5],[-0.32,0.5],[-0.56,0.05]], depth: 0.36, bevel: 0.06, pos: [0,1.0,-0.1], rot: [90,0,0], color: "light", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.5,-0.55],[0.5,-0.55],[0.56,0.05],[0.32,0.5],[-0.32,0.5],[-0.56,0.05]], depth: 0.05, bevel: 0.015, pos: [0,1.19,-0.13], rot: [90,0,0], scale: [0.82,0.82,1], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.55], pos: [0.55,1.02,-0.2], rot: [0,-3,0], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.8,0.24,0.3], pos: [0,1.0,-0.75], bevel: 0.04, color: "dark", parent: "tourelle" },
      // tourelleau à épiscopes et trappe
      { shape: "cylinder", sides: 10, radius: 0.16, height: 0.1, bevel: 0.02, pos: [-0.2,1.27,-0.3], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.165, height: 0.04, pos: [-0.2,1.25,-0.3], color: "glass", parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.11, height: 0.04, pos: [0.22,1.23,-0.35], color: "dark", parent: "tourelle", fine: true },
      // masque et canon : évacuateur de fumées, frein de bouche
      { shape: "bevel", size: [0.42,0.26,0.22], pos: [0,1.0,0.48], bevel: 0.04, color: "dark", parent: "tourelle" },
      { shape: "lathe", sides: 10, pos: [0,1.0,0.55], rot: [90,0,0], color: "steel", parent: "tourelle", profile: [[0,0.0],[0.1,0.0],[0.1,0.089],[0.075,0.134],[0.075,0.46],[0.1,0.505],[0.1,0.653],[0.075,0.697],[0.068,1.002],[0.11,1.016],[0.11,1.113],[0.09,1.128],[0.09,1.15],[0,1.15]] },
      { shape: "box", size: [0.24,0.05,0.08], pos: [0,1.0,1.63], color: "dark", parent: "tourelle", fine: true },
      // lance-fumigènes, antenne
      ...[0, 1, 2].map((i): Part => ({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.14, pos: [0.42,1.12 + i * 0.0,0.2 - i * 0.09], rot: [-60,0,-25], color: "dark", mirror: true, parent: "tourelle", fine: true })),
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.38,1.18,-0.62],[-0.38,1.72,-0.66]], color: "light", parent: "tourelle", fine: true },
    ],
  },
  // artillery : véhicule à quatre grosses roues, long canon relevé à filet cyan ; roues à pneus et garde-boue,
  // caisse profilée, cabine à pare-brise, tourelle à pans, fût d'acier à évacuateur et frein de bouche ;
  // pièces fines : grilles moteur, freins de recul, antenne, crochets
  artillery: {
    parts: [
      { use: "roue_d", pos: [0.78, 0.38, 0.8], scale: [0.8, 0.76, 0.76], mirror: true },
      { use: "roue_d", pos: [0.78, 0.38, -0.8], scale: [0.8, 0.76, 0.76], mirror: true },
      lcGardeBoue(0.78, 0.38, 0.8, 0.38, 0.32),
      lcGardeBoue(0.78, 0.38, -0.8, 0.38, 0.32),
      // caisse, cabine claire à pare-brise, plage arrière d'équipe
      { shape: "extrude", profile: [[-1.18, 0.4], [1.1, 0.4], [1.2, 0.6], [1.12, 0.8], [-1.12, 0.82], [-1.2, 0.62]], depth: 1.3, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.22, 0.78], [1.16, 0.78], [1.2, 0.88], [1.04, 1.05], [0.24, 1.05]], depth: 1.4, bevel: 0.04, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [1.0, 0.18, 0.02], pos: [0, 0.975, 1.131], rot: [-43, 0, 0], color: "glass" },
      { shape: "box", size: [0.5, 0.03, 0.3], pos: [-0.3, 1.07, 0.6], color: "faction" },
      { shape: "box", size: [1.2, 0.1, 0.5], pos: [0, 0.87, -0.92], color: "faction" },
      ...[-0.8, -0.9, -1.0, -1.1].map((z): Part => ({ shape: "box", size: [0.8, 0.025, 0.04], pos: [0, 0.93, z], color: "black", fine: true })),
      { shape: "box", size: [0.03, 0.05, 0.62], pos: [0.665, 0.62, 0], color: "glow", mirror: true },
      { shape: "box", size: [0.12, 0.06, 0.03], pos: [0.48, 0.72, 1.17], color: "amber", mirror: true },
      { shape: "torus", radius: 0.05, tube: 0.015, sides: 8, pos: [0.36, 0.48, 1.18], rot: [0, 0, 90], color: "dark", mirror: true, fine: true },
      // bêches arrière relevées
      { shape: "box", size: [0.3, 0.26, 0.05], pos: [0.36, 0.5, -1.16], rot: [-15, 0, 0], color: "hazard", mirror: true },
      // tourelle à pans (pivot), flancs clairs, trappe
      { shape: "extrude", profile: [[-0.4, -0.45], [0.4, -0.45], [0.44, 0.05], [0.36, 0.4], [-0.36, 0.4], [-0.44, 0.05]], depth: 0.36, bevel: 0.04, pos: [0, 1.2, -0.25], rot: [90, 0, 0], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [0.08, 0.28, 0.66], pos: [0.47, 1.2, -0.3], color: "light", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.14, height: 0.05, bevel: 0.015, pos: [-0.2, 1.4, -0.45], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.08, 0.05, 0.05], pos: [0.2, 1.41, -0.05], color: "amber", parent: "tourelle" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.3, 1.38, -0.6], [0.3, 1.95, -0.66]], color: "light", parent: "tourelle", fine: true },
      // berceau, tourillons, fût d'acier (évacuateur, frein de bouche), filet cyan, freins de recul
      incl([0, 1.32, 0.1], 24, 0.2, 0, { shape: "box", size: [0.34, 0.32, 0.6], color: "dark", parent: "tourelle" }),
      { shape: "cylinder", sides: 10, radius: 0.1, height: 0.5, pos: [0, 1.32, 0.1], rot: [0, 0, 90], color: "steel", parent: "tourelle" },
      incl([0, 1.32, 0.1], 24, 0.2, 0, { shape: "lathe", sides: 10, rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: lcFut(0.11, 2.07) }),
      incl([0, 1.32, 0.1], 24, 1.25, 0, { shape: "cylinder", sides: 10, radius: 0.145, height: 0.24, rot: [90, 0, 0], color: "steel", parent: "tourelle" }),
      incl([0, 1.32, 0.1], 24, 0.95, 0.125, { shape: "box", size: [0.04, 0.03, 1.1], color: "glow", parent: "tourelle" }),
      incl([0.12, 1.32, 0.1], 24, 0.62, -0.1, { shape: "cylinder", sides: 6, radius: 0.035, height: 0.6, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", fine: true }),
    ],
  },
  // mobile_aa : véhicule à quatre roues, tourelle à deux nacelles de canons jumelés relevés ; roues à pneus et
  // garde-boue, couronne d'acier, tourelle à pans à viseur vitré ; pièces fines : cache-flammes, grilles, antenne
  mobile_aa: {
    parts: [
      { use: "roue_d", pos: [0.78, 0.36, 0.75], scale: [0.75, 0.72, 0.72], mirror: true },
      { use: "roue_d", pos: [0.78, 0.36, -0.75], scale: [0.75, 0.72, 0.72], mirror: true },
      lcGardeBoue(0.78, 0.36, 0.75, 0.36, 0.3),
      lcGardeBoue(0.78, 0.36, -0.75, 0.36, 0.3),
      // caisse, cabine claire à pare-brise, plage arrière d'équipe
      { shape: "extrude", profile: [[-1.08, 0.4], [1.0, 0.4], [1.1, 0.58], [1.04, 0.78], [-1.04, 0.8], [-1.1, 0.6]], depth: 1.3, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.28, 0.74], [1.06, 0.74], [1.1, 0.84], [0.94, 0.99], [0.3, 1.0]], depth: 1.4, bevel: 0.04, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [1.0, 0.17, 0.02], pos: [0, 0.926, 1.03], rot: [-47, 0, 0], color: "glass" },
      { shape: "box", size: [1.24, 0.1, 0.46], pos: [0, 0.84, -0.8], color: "faction" },
      ...[-0.68, -0.8, -0.92].map((z): Part => ({ shape: "box", size: [0.9, 0.025, 0.05], pos: [0, 0.9, z], color: "black", fine: true })),
      { shape: "box", size: [0.03, 0.05, 0.6], pos: [0.665, 0.6, 0], color: "glow", mirror: true },
      { shape: "box", size: [0.12, 0.06, 0.03], pos: [0.48, 0.68, 1.075], color: "amber", mirror: true },
      // couronne d'acier (pivot) et tourelle à pans
      { shape: "cylinder", sides: 12, radius: 0.46, height: 0.14, bevel: 0.02, pos: [0, 1.02, -0.12], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.3, -0.36], [0.3, -0.36], [0.36, -0.28], [0.36, 0.22], [0.24, 0.36], [-0.24, 0.36], [-0.36, 0.22], [-0.36, -0.28]], depth: 0.4, bevel: 0.04, pos: [0, 1.29, -0.12], rot: [90, 0, 0], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.3, 0.06, 0.03], pos: [0, 1.32, 0.255], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.2, 0.12, 0.2], pos: [-0.12, 1.55, -0.22], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.14, 0.07, 0.02], pos: [-0.12, 1.56, -0.115], color: "glass", parent: "tourelle" },
      { shape: "box", size: [0.06, 0.05, 0.05], pos: [0.16, 1.52, -0.3], color: "amber", parent: "tourelle" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.2, 1.5, -0.4], [0.2, 2.0, -0.44]], color: "light", parent: "tourelle", fine: true },
      // nacelles relevées, canons jumelés d'acier, cache-flammes
      incl([0.5, 1.38, -0.12], 34, 0.05, 0, { shape: "bevel", size: [0.24, 0.3, 0.7], bevel: 0.05, color: "light", mirror: true, parent: "tourelle" }),
      incl([0.5, 1.38, -0.12], 34, 0.05, 0.155, { shape: "box", size: [0.18, 0.02, 0.5], color: "faction", mirror: true, parent: "tourelle" }),
      incl([0.44, 1.42, -0.12], 34, 0.85, 0, { shape: "cylinder", sides: 8, radius: 0.04, height: 1.25, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" }),
      incl([0.56, 1.42, -0.12], 34, 0.85, 0, { shape: "cylinder", sides: 8, radius: 0.04, height: 1.25, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" }),
      incl([0.44, 1.42, -0.12], 34, 1.4, 0, { shape: "cylinder", sides: 8, radius: 0.058, height: 0.14, rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", fine: true }),
      incl([0.56, 1.42, -0.12], 34, 1.4, 0, { shape: "cylinder", sides: 8, radius: 0.058, height: 0.14, rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", fine: true }),
      incl([0.5, 1.42, -0.12], 34, 0.48, 0, { shape: "box", size: [0.2, 0.05, 0.05], color: "dark", mirror: true, parent: "tourelle", fine: true }),
    ],
  },
  // sonde : petit quadrupède blindé, parabole radar tournante, mât d'antenne ; coque profilée à dessus d'équipe,
  // pattes articulées à rotules d'acier, parabole tournée à cornet ; pièces fines : haubans, caméra, cornet
  sonde: {
    parts: [
      // coque profilée, dessus d'équipe, face avant à œil et filet cyan
      { shape: "extrude", profile: [[-0.5, 0.58], [0.45, 0.58], [0.52, 0.72], [0.42, 0.9], [-0.42, 0.92], [-0.52, 0.75]], depth: 0.9, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[-0.32, -0.38], [0.32, -0.38], [0.36, -0.3], [0.36, 0.3], [0.3, 0.36], [-0.3, 0.36], [-0.36, 0.3], [-0.36, -0.3]], depth: 0.05, bevel: 0.015, pos: [0, 0.935, -0.02], rot: [90, 0, 0], color: "faction" },
      { shape: "box", size: [0.66, 0.2, 0.08], pos: [0, 0.74, 0.5], color: "light" },
      { shape: "box", size: [0.36, 0.04, 0.03], pos: [0, 0.8, 0.555], color: "glow" },
      { shape: "cylinder", sides: 10, radius: 0.07, height: 0.05, pos: [-0.2, 0.7, 0.55], rot: [90, 0, 0], color: "glass" },
      { shape: "box", size: [0.06, 0.22, 0.62], pos: [0.47, 0.76, 0], color: "light", mirror: true },
      { shape: "box", size: [0.02, 0.04, 0.32], pos: [0.505, 0.8, 0], color: "glow", mirror: true },
      // pattes : rotule de hanche, cuisse claire, genou d'acier, tibia, pied
      ...[0.38, -0.38].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 8, radius: 0.08, height: 0.12, pos: [0.52, 0.66, z], rot: [0, 0, 90], color: "steel", mirror: true },
        { shape: "box", size: [0.28, 0.1, 0.14], pos: [0.62, 0.6, z], rot: [0, 0, -28], color: "light", mirror: true },
        { shape: "cylinder", sides: 8, radius: 0.065, height: 0.16, pos: [0.72, 0.52, z], rot: [0, 0, 90], color: "steel", mirror: true },
        { shape: "box", size: [0.09, 0.46, 0.1], pos: [0.7, 0.28, z], rot: [0, 0, -6], color: "metal", mirror: true },
        { shape: "box", size: [0.24, 0.07, 0.3], pos: [0.66, 0.035, z > 0 ? 0.42 : -0.38], color: "black", mirror: true },
      ]),
      // parabole radar (pivot) sur son mât, cornet et voyant
      { shape: "cylinder", sides: 8, radius: 0.045, height: 0.32, pos: [0.18, 1.1, -0.12], color: "steel" },
      { shape: "lathe", sides: 12, pos: [0.18, 1.3, -0.12], rot: [35, 0, 0], color: "light", pivot: "radar", profile: [[0, -0.03], [0.07, -0.05], [0.3, 0.03], [0.3, 0.06], [0.27, 0.05], [0.07, -0.01], [0, 0]] },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.18, 1.3, -0.12], [0.18, 1.38, -0.06]], color: "steel", parent: "radar", fine: true },
      { shape: "sphere", radius: 0.05, pos: [0.18, 1.4, -0.05], color: "amber", parent: "radar" },
      // mât d'antenne et haubans
      { shape: "cylinder", sides: 6, radius: 0.025, height: 0.66, pos: [-0.26, 1.27, -0.32], color: "steel" },
      { shape: "box", size: [0.06, 0.06, 0.06], pos: [-0.26, 1.62, -0.32], color: "amber" },
      { shape: "box", size: [0.2, 0.02, 0.02], pos: [-0.26, 1.45, -0.32], color: "light", fine: true },
      { shape: "tube", radius: 0.006, sides: 4, path: [[-0.26, 1.45, -0.32], [-0.38, 0.93, -0.12]], color: "metal", fine: true },
      { shape: "tube", radius: 0.006, sides: 4, path: [[-0.26, 1.45, -0.32], [-0.1, 0.93, -0.4]], color: "metal", fine: true },
    ],
  },
  // assault_walker : quadrupède trapu, tourelle blindée portant deux canons longs sur les épaules ; pattes à
  // cuisses claires profilées, genoux d'acier, tibias sombres, pieds à semelle ; tourelle à pans, nacelles à fûts
  // d'acier à frein de bouche ; pièces fines : vérins, grilles, antenne
  assault_walker: {
    parts: [
      ...[0.44, -0.44].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 10, radius: 0.14, height: 0.2, pos: [0.52, 0.92, z], rot: [0, 0, 90], color: "steel", mirror: true },
        { shape: "extrude", profile: [[0.45, 1.0], [0.6, 1.08], [0.9, 0.7], [0.74, 0.58]], depth: 0.28, bevel: 0.03, pos: [0, 0, z], color: "light", mirror: true },
        { shape: "cylinder", sides: 10, radius: 0.12, height: 0.34, pos: [0.82, 0.62, z], rot: [0, 0, 90], color: "steel", mirror: true },
        { shape: "box", size: [0.3, 0.1, 0.36], pos: [0.84, 0.74, z + 0.02], rot: [0, 0, -12], color: "faction", mirror: true },
        { shape: "extrude", profile: [[0.7, 0.62], [0.98, 0.62], [0.98, 0.14], [0.72, 0.12]], depth: 0.34, bevel: 0.03, pos: [0, 0, z + 0.02], color: "dark", mirror: true },
        { shape: "tube", radius: 0.03, path: [[0.56, 0.84, z - 0.15], [0.86, 0.3, z - 0.15]], color: "steel", mirror: true, fine: true },
        { shape: "box", size: [0.4, 0.06, 0.52], pos: [0.86, 0.03, z + 0.04], color: "rubber", mirror: true },
        { shape: "bevel", size: [0.36, 0.08, 0.44], pos: [0.86, 0.1, z + 0.06], bevel: 0.03, color: "dark", mirror: true },
      ]),
      // caisse
      { shape: "extrude", profile: [[-0.5, 0.72], [0.5, 0.72], [0.56, 0.9], [0.48, 1.12], [-0.48, 1.12], [-0.56, 0.9]], depth: 1.1, bevel: 0.04, color: "dark" },
      // tourelle à pans (pivot), avant clair à filet cyan, coffre arrière à grilles
      { shape: "extrude", profile: [[-0.42, -0.55], [0.42, -0.55], [0.5, -0.3], [0.5, 0.3], [0.36, 0.55], [-0.36, 0.55], [-0.5, 0.3], [-0.5, -0.3]], depth: 0.48, bevel: 0.05, pos: [0, 1.32, 0], rot: [90, 0, 0], color: "faction", pivot: "tourelle" },
      { shape: "extrude", profile: [[0.45, 1.12], [0.64, 1.16], [0.66, 1.4], [0.5, 1.46]], depth: 0.66, bevel: 0.02, rot: [0, -90, 0], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.42, 0.05, 0.03], pos: [0, 1.3, 0.665], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.56, 0.28, 0.26], pos: [0, 1.36, -0.64], color: "dark", parent: "tourelle" },
      ...[-0.56, -0.64, -0.72].map((z): Part => ({ shape: "box", size: [0.44, 0.02, 0.04], pos: [0, 1.505, z], color: "black", parent: "tourelle", fine: true })),
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.2, 1.5, -0.7], [-0.2, 1.8, -0.74]], color: "light", parent: "tourelle", fine: true },
      // nacelles d'épaule : rotule, carter clair profilé, bande d'équipe, filet cyan, fût d'acier
      { shape: "cylinder", sides: 10, radius: 0.1, height: 0.2, pos: [0.47, 1.6, 0.1], rot: [0, 0, 90], color: "steel", mirror: true, parent: "tourelle" },
      { shape: "extrude", profile: [[-0.37, 1.52], [0.62, 1.52], [0.73, 1.62], [0.7, 1.77], [-0.3, 1.79], [-0.37, 1.7]], depth: 0.3, bevel: 0.03, pos: [0.62, 0, 0], rot: [0, -90, 0], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.12, 0.02, 0.7], pos: [0.62, 1.8, 0.15], color: "faction", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03, 0.05, 0.8], pos: [0.785, 1.66, 0.2], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.08, 0.05, 0.04], pos: [0.55, 1.76, 0.71], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "lathe", sides: 10, pos: [0.62, 1.66, 0.72], rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", profile: lcFut(0.07, 0.8) },
    ],
  },
  // hover_tank : large coque de glisseur à jupe lumineuse, bandes aux couleurs du camp, tourelle à canon ;
  // jupe de caoutchouc, coque profilée à étrave, soufflantes de sustentation, tourelle à pans, fût d'acier à
  // évacuateur et frein de bouche ; pièces fines : grilles des soufflantes, antenne, crochets
  hover_tank: {
    parts: [
      // jupe souple, coussin lumineux
      { shape: "extrude", profile: [[-1.04, -1.62], [1.04, -1.62], [1.1, -1.5], [1.1, 1.2], [0.8, 1.62], [-0.8, 1.62], [-1.1, 1.2], [-1.1, -1.5]], depth: 0.16, bevel: 0.04, pos: [0, 0.4, 0], rot: [90, 0, 0], color: "rubber" },
      { shape: "extrude", profile: [[-1.0, -1.56], [1.0, -1.56], [1.05, -1.46], [1.05, 1.16], [0.76, 1.56], [-0.76, 1.56], [-1.05, 1.16], [-1.05, -1.46]], depth: 0.04, pos: [0, 0.31, 0], rot: [90, 0, 0], color: "glow" },
      { shape: "box", size: [1.5, 0.04, 2.4], pos: [0, 0.27, 0], color: "glow" },
      // coque basse sombre à étrave, coque haute claire
      { shape: "extrude", profile: [[-1.58, 0.44], [1.4, 0.44], [1.9, 0.55], [1.62, 0.68], [-1.58, 0.68]], depth: 2.0, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[-1.5, 0.6], [1.3, 0.6], [1.72, 0.68], [1.3, 0.92], [-1.3, 0.95], [-1.5, 0.85]], depth: 1.86, bevel: 0.05, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [0.42, 0.04, 2.5], pos: [0.55, 0.955, -0.1], color: "faction", mirror: true },
      { shape: "box", size: [0.14, 0.06, 0.04], pos: [0.55, 0.63, 1.78], color: "amber", mirror: true },
      { shape: "box", size: [0.9, 0.1, 0.04], pos: [0, 0.82, -1.515], color: "glow" },
      { shape: "box", size: [0.03, 0.05, 2.2], pos: [0.945, 0.76, -0.1], color: "glow", mirror: true },
      // soufflantes de sustentation à l'arrière : bague d'acier, grille fine
      { shape: "cylinder", sides: 12, radius: 0.24, height: 0.02, pos: [0.5, 0.96, -1.08], color: "black", mirror: true },
      { shape: "torus", radius: 0.25, tube: 0.03, sides: 12, pos: [0.5, 0.965, -1.08], color: "steel", mirror: true },
      { shape: "box", size: [0.46, 0.02, 0.04], pos: [0.5, 0.975, -1.08], rot: [0, 45, 0], color: "metal", mirror: true, fine: true },
      { shape: "box", size: [0.46, 0.02, 0.04], pos: [0.5, 0.975, -1.08], rot: [0, -45, 0], color: "metal", mirror: true, fine: true },
      { shape: "torus", radius: 0.05, tube: 0.015, sides: 8, pos: [0.45, 0.52, 1.72], rot: [0, 0, 90], color: "dark", mirror: true, fine: true },
      // tourelle à pans (pivot), flancs clairs à filet cyan, trappe
      { shape: "extrude", profile: [[-0.5, -0.6], [0.5, -0.6], [0.56, -0.2], [0.5, 0.45], [0.3, 0.62], [-0.3, 0.62], [-0.5, 0.45], [-0.56, -0.2]], depth: 0.4, bevel: 0.05, pos: [0, 1.12, -0.3], rot: [90, 0, 0], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [0.1, 0.3, 0.8], pos: [0.6, 1.1, -0.38], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.04, 0.04, 0.6], pos: [0.655, 1.14, -0.38], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.06, bevel: 0.015, pos: [0.2, 1.35, -0.55], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.06, 0.05, 0.05], pos: [0.3, 1.34, 0.1], color: "amber", parent: "tourelle" },
      ...[-0.7, -0.8].map((z): Part => ({ shape: "box", size: [0.5, 0.02, 0.04], pos: [-0.12, 1.34, z], color: "black", parent: "tourelle", fine: true })),
      { shape: "tube", radius: 0.014, sides: 4, path: [[-0.38, 1.3, -0.7], [-0.38, 1.7, -0.72]], color: "light", parent: "tourelle", fine: true },
      // masque et canon d'acier
      { shape: "bevel", size: [0.36, 0.3, 0.4], pos: [0, 1.12, 0.4], bevel: 0.05, color: "dark", parent: "tourelle" },
      { shape: "lathe", sides: 10, pos: [0, 1.14, 0.5], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: lcFut(0.1, 1.45) },
      { shape: "cylinder", sides: 10, radius: 0.13, height: 0.2, pos: [0, 1.14, 1.15], rot: [90, 0, 0], color: "steel", parent: "tourelle" },
    ],
  },
  // missile_launcher : camion à six roues, cabine claire, rampe de quatre gros missiles relevée ; roues à pneus,
  // cabine profilée à pare-brise, couronne d'acier, vérin de hausse, missiles tournés à ogive sombre ;
  // pièces fines : ailettes, rétroviseurs, gyrophare, grilles
  missile_launcher: {
    parts: [
      ...lcRoues(0.7, 0.32, 0.95, 0.32, 0.28),
      ...lcRoues(0.7, 0.32, -0.25, 0.32, 0.28),
      ...lcRoues(0.7, 0.32, -0.95, 0.32, 0.28),
      // châssis, cabine claire à pare-brise, plateau d'équipe
      { shape: "extrude", profile: [[-1.38, 0.38], [1.3, 0.38], [1.4, 0.55], [1.32, 0.7], [-1.32, 0.7], [-1.4, 0.54]], depth: 1.28, bevel: 0.03, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.6, 0.66], [1.4, 0.66], [1.42, 0.9], [1.3, 1.24], [0.62, 1.29]], depth: 1.32, bevel: 0.04, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [1.04, 0.26, 0.02], pos: [0, 1.075, 1.374], rot: [-19.5, 0, 0], color: "glass" },
      { shape: "box", size: [0.9, 0.03, 0.4], pos: [0, 1.3, 0.92], color: "faction" },
      { shape: "box", size: [0.06, 0.1, 0.03], pos: [0.52, 0.8, 1.415], color: "glow", mirror: true },
      { shape: "box", size: [0.1, 0.05, 0.08], pos: [0.3, 1.33, 0.72], color: "amber", fine: true },
      { shape: "box", size: [0.04, 0.12, 0.08], pos: [0.71, 1.06, 1.2], color: "dark", mirror: true, fine: true },
      { shape: "extrude", profile: [[-1.38, 0.68], [0.3, 0.68], [0.3, 0.9], [-1.38, 0.9]], depth: 1.2, rot: [0, -90, 0], color: "faction" },
      { shape: "box", size: [0.04, 0.06, 1.6], pos: [0.62, 0.92, -0.55], color: "light", mirror: true },
      { shape: "box", size: [0.03, 0.04, 1.4], pos: [0.645, 0.8, -0.55], color: "glow", mirror: true },
      // couronne d'acier (pivot), cadre de rampe, longerons, vérin
      { shape: "cylinder", sides: 12, radius: 0.3, height: 0.2, bevel: 0.03, pos: [0, 0.95, -0.7], color: "steel", pivot: "tourelle" },
      incl([0, 1.12, -1.25], 30, 0.75, 0, { shape: "box", size: [1.2, 0.16, 1.5], color: "faction", parent: "tourelle" }),
      incl([0.62, 1.12, -1.25], 30, 0.75, 0.04, { shape: "box", size: [0.06, 0.24, 1.5], color: "light", mirror: true, parent: "tourelle" }),
      { shape: "tube", radius: 0.055, sides: 6, path: [[0, 1.02, -0.6], [0, 1.4, -0.52]], color: "steel", parent: "tourelle" },
      { shape: "box", size: [0.08, 0.05, 0.05], pos: [0.2, 1.08, -0.45], color: "amber", parent: "tourelle" },
      // missiles : fût clair tourné, ogive sombre, ailettes
      ...[0.2, 0.48].flatMap((x): Part[] => [
        incl([x, 1.12, -1.25], 30, 0.05, 0.26, { shape: "lathe", sides: 8, rot: [90, 0, 0], color: "light", mirror: true, parent: "tourelle", profile: [[0, 0], [0.11, 0], [0.14, 0.06], [0.14, 1.3], [0, 1.3]] }),
        incl([x, 1.12, -1.25], 30, 1.5, 0.26, { shape: "cone", sides: 8, radius: 0.14, height: 0.3, rot: [90, 0, 0], color: "black", mirror: true, parent: "tourelle" }),
        incl([x, 1.12, -1.25], 30, 0.95, 0.26, { shape: "cylinder", sides: 8, radius: 0.145, height: 0.05, rot: [90, 0, 0], color: "hazard", mirror: true, parent: "tourelle", fine: true }),
        incl([x, 1.12, -1.25], 30, 0.16, 0.26, { shape: "box", size: [0.36, 0.02, 0.18], color: "dark", mirror: true, parent: "tourelle", fine: true }),
      ]),
    ],
  },
  // mobile_shield : véhicule blindé à quatre roues, émetteur de bouclier lumineux tournant sur le toit ; roues à
  // pneus et garde-boue, générateur d'équipe à radiateurs, socle d'acier à anneau lumineux, griffes de l'émetteur ;
  // pièces fines : ailettes des radiateurs, câbles de cuivre, voyants
  mobile_shield: {
    parts: [
      { use: "roue_d", pos: [0.8, 0.38, 0.78], scale: [0.8, 0.76, 0.76], mirror: true },
      { use: "roue_d", pos: [0.8, 0.38, -0.78], scale: [0.8, 0.76, 0.76], mirror: true },
      lcGardeBoue(0.8, 0.38, 0.78, 0.38, 0.32),
      lcGardeBoue(0.8, 0.38, -0.78, 0.38, 0.32),
      // caisse, cabine claire à pare-brise, générateur d'équipe
      { shape: "extrude", profile: [[-1.12, 0.42], [1.08, 0.42], [1.16, 0.6], [1.1, 0.82], [-1.1, 0.84], [-1.16, 0.62]], depth: 1.34, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.34, 0.78], [1.12, 0.78], [1.16, 0.88], [1.02, 1.02], [0.36, 1.03]], depth: 1.46, bevel: 0.04, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [1.04, 0.16, 0.02], pos: [0, 0.961, 1.101], rot: [-45, 0, 0], color: "glass" },
      { shape: "extrude", profile: [[-1.06, 0.8], [0.3, 0.8], [0.34, 1.02], [0.2, 1.08], [-0.96, 1.08], [-1.08, 0.98]], depth: 1.18, bevel: 0.04, rot: [0, -90, 0], color: "faction" },
      { shape: "box", size: [0.16, 0.28, 0.9], pos: [0.68, 0.92, -0.38], color: "light", mirror: true },
      ...[-0.1, -0.25, -0.4, -0.55, -0.7].map((z): Part => ({ shape: "box", size: [0.03, 0.24, 0.04], pos: [0.765, 0.92, z], color: "black", mirror: true, fine: true })),
      { shape: "box", size: [0.03, 0.05, 0.62], pos: [0.685, 0.64, 0], color: "glow", mirror: true },
      { shape: "box", size: [0.12, 0.06, 0.03], pos: [0.5, 0.74, 1.15], color: "glow", mirror: true },
      { shape: "box", size: [0.06, 0.05, 0.05], pos: [0.5, 1.1, 0.3], color: "amber", mirror: true },
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.5, 1.08, -0.85], [0.5, 1.14, -0.6], [0.3, 1.16, -0.45]], bend: 0.08, color: "copper", mirror: true, fine: true },
      // socle d'acier de l'émetteur, anneau lumineux
      { shape: "lathe", sides: 12, pos: [0, 1.06, -0.3], color: "steel", profile: [[0, 0], [0.46, 0], [0.46, 0.07], [0.36, 0.13], [0.3, 0.26], [0, 0.26]] },
      { shape: "torus", radius: 0.4, tube: 0.025, sides: 12, pos: [0, 1.16, -0.3], color: "glow" },
      // émetteur (pivot) et ses quatre griffes claires
      { shape: "lathe", sides: 10, pos: [0, 1.42, -0.3], color: "glow", pivot: "emetteur", profile: [[0, -0.28], [0.2, -0.2], [0.28, 0], [0.2, 0.2], [0, 0.28]] },
      { shape: "tube", radius: 0.04, sides: 5, path: [[0.34, 1.26, -0.3], [0.4, 1.46, -0.3], [0.3, 1.62, -0.3]], bend: 0.08, color: "light", mirror: true, parent: "emetteur" },
      { shape: "tube", radius: 0.04, sides: 5, path: [[0, 1.26, 0.04], [0, 1.46, 0.1], [0, 1.62, 0.0]], bend: 0.08, color: "light", parent: "emetteur" },
      { shape: "tube", radius: 0.04, sides: 5, path: [[0, 1.26, -0.64], [0, 1.46, -0.7], [0, 1.62, -0.6]], bend: 0.08, color: "light", parent: "emetteur" },
      { shape: "torus", radius: 0.36, tube: 0.03, sides: 12, pos: [0, 1.27, -0.3], color: "faction", parent: "emetteur" },
    ],
  },
  // ion_cannon : char à chenilles, tourelle massive, gros canon à ions cerclé d'anneaux lumineux ; chenilles
  // détaillées sous garde-chenilles, caisse profilée, plage moteur à grilles, tourelle à pans, bobines de cuivre,
  // émetteur à bouche cyan ; pièces fines : grilles, bobines, câbles
  ion_cannon: {
    parts: [
      { use: "chenille_d", pos: [0.95, 0, 0], scale: [1.1, 1, 1.087], mirror: true },
      { shape: "extrude", profile: [[-1.22, 0.51], [1.16, 0.51], [1.24, 0.56], [1.15, 0.6], [-1.15, 0.6], [-1.24, 0.56]], depth: 0.58, bevel: 0.02, pos: [0.95, 0, 0], rot: [0, -90, 0], color: "light", mirror: true },
      { shape: "box", size: [0.03, 0.04, 1.8], pos: [1.235, 0.555, 0], color: "glow", mirror: true },
      // caisse profilée, glacis clair, plage moteur d'équipe
      { shape: "extrude", profile: [[-1.2, 0.38], [1.0, 0.38], [1.22, 0.6], [1.0, 0.8], [-1.1, 0.8], [-1.22, 0.62]], depth: 1.3, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "box", size: [1.2, 0.05, 0.5], pos: [0, 0.82, 0.68], color: "light" },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [0.45, 0.66, 1.13], color: "amber", mirror: true },
      { shape: "box", size: [1.24, 0.06, 0.6], pos: [0, 0.83, -0.85], color: "faction" },
      ...[-0.68, -0.8, -0.92, -1.04].map((z): Part => ({ shape: "box", size: [0.8, 0.02, 0.05], pos: [0, 0.87, z], color: "black", fine: true })),
      { shape: "tube", radius: 0.045, path: [[0.5, 0.7, -1.05], [0.5, 0.7, -1.16], [0.5, 0.86, -1.2]], bend: 0.08, color: "steel", mirror: true },
      // tourelle à pans (pivot), flancs clairs, trappe
      { shape: "extrude", profile: [[-0.5, -0.7], [0.5, -0.7], [0.56, -0.4], [0.56, 0.35], [0.4, 0.62], [-0.4, 0.62], [-0.56, 0.35], [-0.56, -0.4]], depth: 0.48, bevel: 0.05, pos: [0, 1.1, -0.3], rot: [90, 0, 0], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [0.1, 0.38, 0.95], pos: [0.6, 1.08, -0.35], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03, 0.04, 0.7], pos: [0.655, 1.12, -0.35], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.16, height: 0.06, bevel: 0.015, pos: [-0.18, 1.36, -0.62], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.08, 0.05, 0.04], pos: [0.3, 1.3, 0.36], color: "amber", mirror: true, parent: "tourelle" },
      ...[-0.75, -0.85].map((z): Part => ({ shape: "box", size: [0.36, 0.02, 0.04], pos: [0.22, 1.36, z], color: "black", parent: "tourelle", fine: true })),
      // canon à ions : carter, fût clair, anneaux lumineux, bobines de cuivre, émetteur
      { shape: "extrude", profile: [[0.2, 0.92], [0.82, 0.96], [0.86, 1.14], [0.82, 1.32], [0.2, 1.36]], depth: 0.5, bevel: 0.03, rot: [0, -90, 0], color: "dark", parent: "tourelle" },
      { shape: "lathe", sides: 12, pos: [0, 1.14, 0.8], rot: [90, 0, 0], color: "light", parent: "tourelle", profile: [[0, 0], [0.2, 0], [0.2, 1.2], [0.17, 1.24], [0, 1.24]] },
      ...[1.0, 1.25, 1.5].map((z): Part => ({ shape: "cylinder", sides: 12, radius: 0.25, height: 0.07, pos: [0, 1.14, z], rot: [90, 0, 0], color: "glow", parent: "tourelle" })),
      ...[1.125, 1.375].map((z): Part => ({ shape: "torus", radius: 0.21, tube: 0.025, sides: 12, pos: [0, 1.14, z], rot: [90, 0, 0], color: "copper", parent: "tourelle", fine: true })),
      { shape: "lathe", sides: 12, pos: [0, 1.14, 1.98], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: [[0, 0], [0.2, 0], [0.25, 0.06], [0.25, 0.2], [0.21, 0.24], [0, 0.24]] },
      { shape: "cylinder", sides: 12, radius: 0.17, height: 0.02, pos: [0, 1.14, 2.22], rot: [90, 0, 0], color: "glow", parent: "tourelle" },
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.2, 1.3, 0.2], [0.2, 1.3, 0.75], [0.12, 1.28, 0.9]], bend: 0.08, color: "copper", mirror: true, parent: "tourelle", fine: true },
    ],
  },
  // drone_launcher : porteur blindé à huit roues, plateforme de lancement à trappe centrale et volet arrière ;
  // roues à pneus, coffres latéraux d'équipe, plateforme à pans, deux drones arrimés, volet à charnière ;
  // pièces fines : trappes des coffres, marquage de la piste, câbles
  drone_launcher: {
    parts: [
      ...lcRoues(0.78, 0.3, 1.05, 0.3, 0.28, true),
      ...lcRoues(0.78, 0.3, 0.35, 0.3, 0.28, true),
      ...lcRoues(0.78, 0.3, -0.35, 0.3, 0.28, true),
      ...lcRoues(0.78, 0.3, -1.05, 0.3, 0.28, true),
      // caisse, cabine claire à vitres, coffres latéraux d'équipe
      { shape: "extrude", profile: [[-1.38, 0.32], [1.3, 0.32], [1.44, 0.52], [1.36, 0.76], [-1.34, 0.76], [-1.4, 0.54]], depth: 1.5, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.56, 0.66], [1.38, 0.66], [1.46, 0.78], [1.3, 0.96], [0.58, 0.96]], depth: 1.56, bevel: 0.04, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [1.1, 0.18, 0.02], pos: [0, 0.88, 1.391], rot: [-41.6, 0, 0], color: "glass" },
      { shape: "box", size: [0.12, 0.06, 0.03], pos: [0.55, 0.72, 1.46], color: "glow", mirror: true },
      { shape: "extrude", profile: [[-1.2, 0.7], [0.5, 0.7], [0.5, 0.98], [0.4, 1.06], [-1.1, 1.06], [-1.2, 0.96]], depth: 0.32, bevel: 0.03, pos: [0.66, 0, 0], rot: [0, -90, 0], color: "faction", mirror: true },
      { shape: "box", size: [0.03, 0.04, 1.4], pos: [0.83, 0.98, -0.35], color: "glow", mirror: true },
      ...[0.1, -0.75].map((z): Part => ({ shape: "box", size: [0.02, 0.18, 0.5], pos: [0.83, 0.84, z], color: "light", mirror: true, fine: true })),
      { shape: "box", size: [0.08, 0.05, 0.05], pos: [0.66, 1.07, 0.3], color: "amber", mirror: true },
      // plateforme de lancement à pans (pivot), piste sombre à filets cyan
      { shape: "extrude", profile: [[-0.46, -0.85], [0.46, -0.85], [0.5, -0.75], [0.5, 0.75], [0.42, 0.85], [-0.42, 0.85], [-0.5, 0.75], [-0.5, -0.75]], depth: 0.24, bevel: 0.03, pos: [0, 0.98, -0.35], rot: [90, 0, 0], color: "light", pivot: "tourelle" },
      { shape: "box", size: [0.5, 0.04, 0.9], pos: [0, 1.12, -0.3], color: "black", parent: "tourelle" },
      { shape: "box", size: [0.03, 0.03, 0.9], pos: [0.26, 1.14, -0.3], color: "glow", mirror: true, parent: "tourelle" },
      ...[-0.6, -0.3, 0].map((z): Part => ({ shape: "box", size: [0.3, 0.012, 0.04], pos: [0, 1.143, z], color: "hazard", parent: "tourelle", fine: true })),
      // deux drones arrimés à l'avant de la plateforme
      ...[0.3, -0.3].flatMap((x): Part[] => [
        { shape: "box", size: [0.2, 0.06, 0.26], pos: [x, 1.13, 0.32], color: "dark", parent: "tourelle" },
        { shape: "cylinder", sides: 8, radius: 0.1, height: 0.08, pos: [x, 1.2, 0.32], color: "faction", parent: "tourelle" },
        { shape: "cylinder", sides: 8, radius: 0.05, height: 0.02, pos: [x, 1.25, 0.32], color: "glow", parent: "tourelle" },
        { shape: "box", size: [0.34, 0.015, 0.03], pos: [x, 1.18, 0.32], rot: [0, 45, 0], color: "light", parent: "tourelle", fine: true },
        { shape: "box", size: [0.34, 0.015, 0.03], pos: [x, 1.18, 0.32], rot: [0, -45, 0], color: "light", parent: "tourelle", fine: true },
      ]),
      // volet arrière à charnière d'acier
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.9, pos: [0, 1.12, -1.1], rot: [0, 0, 90], color: "steel", parent: "tourelle" },
      { shape: "box", size: [1.0, 0.5, 0.06], pos: [0, 1.3, -1.22], rot: [-30, 0, 0], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.5, 0.04, 0.03], pos: [0, 1.45, -1.28], rot: [-30, 0, 0], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.04, 0.4, 0.02], pos: [0.42, 1.3, -1.26], rot: [-30, 0, 0], color: "hazard", mirror: true, parent: "tourelle", fine: true },
    ],
  },
  // siege_walker : grand quadrupède de siège, tourelle portant deux affûts lourds à double canon ; pattes à cuisses
  // claires profilées, genoux d'acier à genouillère d'équipe, tibias sombres, pieds à semelle ; tourelle à pans,
  // affûts clairs, fûts d'acier à frein de bouche ; pièces fines : vérins, grilles
  siege_walker: {
    parts: [
      ...[0.85, -0.85].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 10, radius: 0.22, height: 0.3, pos: [0.86, 1.55, z], rot: [0, 0, 90], color: "steel", mirror: true },
        { shape: "extrude", profile: [[0.7, 1.72], [0.98, 1.8], [1.32, 1.1], [1.04, 0.98]], depth: 0.46, bevel: 0.04, pos: [0, 0, z], color: "light", mirror: true },
        { shape: "cylinder", sides: 10, radius: 0.18, height: 0.5, pos: [1.17, 1.0, z], rot: [0, 0, 90], color: "steel", mirror: true },
        { shape: "box", size: [0.42, 0.14, 0.5], pos: [1.18, 1.16, z], rot: [0, 0, -10], color: "faction", mirror: true },
        { shape: "extrude", profile: [[0.96, 0.98], [1.42, 0.98], [1.46, 0.22], [0.98, 0.18]], depth: 0.58, bevel: 0.04, pos: [0, 0, z], color: "dark", mirror: true },
        { shape: "box", size: [0.03, 0.5, 0.04], pos: [1.45, 0.58, z + 0.3], color: "glow", mirror: true },
        { shape: "tube", radius: 0.045, path: [[0.95, 1.5, z - 0.26], [1.2, 0.45, z - 0.3]], color: "steel", mirror: true, fine: true },
        { shape: "box", size: [0.7, 0.08, 0.85], pos: [1.22, 0.04, z > 0 ? 0.92 : -0.88], color: "rubber", mirror: true },
        { shape: "extrude", profile: [[-0.42, 0.08], [0.42, 0.08], [0.44, 0.14], [0.3, 0.22], [-0.3, 0.22], [-0.42, 0.14]], depth: 0.66, pos: [1.22, 0, z > 0 ? 0.92 : -0.88], rot: [0, -90, 0], color: "dark", mirror: true },
      ]),
      // caisse
      { shape: "extrude", profile: [[-0.82, 1.35], [0.82, 1.35], [0.9, 1.6], [0.8, 1.85], [-0.8, 1.85], [-0.9, 1.6]], depth: 2.0, bevel: 0.05, color: "dark" },
      // tourelle à pans (pivot), avant clair à filet cyan, trappe, grilles
      { shape: "extrude", profile: [[-0.7, -0.9], [0.7, -0.9], [0.8, -0.5], [0.8, 0.5], [0.6, 0.9], [-0.6, 0.9], [-0.8, 0.5], [-0.8, -0.5]], depth: 0.7, bevel: 0.06, pos: [0, 2.15, 0], rot: [90, 0, 0], color: "faction", pivot: "tourelle" },
      { shape: "extrude", profile: [[0.8, 1.86], [1.03, 1.92], [1.05, 2.3], [0.86, 2.36]], depth: 1.0, bevel: 0.03, rot: [0, -90, 0], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.6, 0.07, 0.04], pos: [0, 2.16, 1.055], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.08, 0.05, 0.04], pos: [0.36, 1.98, 1.05], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.06, bevel: 0.015, pos: [-0.3, 2.53, -0.3], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.5, 0.04, 0.5], pos: [0.25, 2.515, -0.45], color: "dark", parent: "tourelle" },
      ...[-0.3, -0.4, -0.5, -0.6].map((z): Part => ({ shape: "box", size: [0.44, 0.02, 0.04], pos: [0.25, 2.54, z], color: "black", parent: "tourelle", fine: true })),
      // affûts lourds : carter clair profilé, bande d'équipe, filet cyan, culasse sombre, deux fûts d'acier
      { shape: "extrude", profile: [[-0.6, 2.26], [0.95, 2.26], [1.1, 2.36], [1.1, 2.64], [0.95, 2.74], [-0.6, 2.74]], depth: 0.5, bevel: 0.03, pos: [1.08, 0, 0], rot: [0, -90, 0], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.3, 0.02, 1.2], pos: [1.08, 2.75, 0.2], color: "faction", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03, 0.06, 1.2], pos: [1.345, 2.5, 0.3], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.42, 0.42, 0.5], pos: [1.08, 2.5, -0.75], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "lathe", sides: 10, pos: [0.96, 2.52, 1.1], rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", profile: lcFut(0.085, 1.4, true) },
      { shape: "lathe", sides: 10, pos: [1.2, 2.52, 1.1], rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", profile: lcFut(0.085, 1.4, true) },
    ],
  },
  // shock_robot : robot de choc trapu, casque clair à visière cyan, épaulières massives, poings électrifiés ;
  // jambes profilées à genoux d'acier, torse à pans à cœur lumineux, sac dorsal à condensateurs, bobines de
  // cuivre aux poignets ; pièces fines : vérins, jointures, grilles, bobines du dos
  shock_robot: {
    parts: [
      // jambes : cuisse sombre, genou d'acier, tibia clair à filet cyan, pied
      { shape: "extrude", profile: [[-0.24, 0.7], [0.24, 0.7], [0.28, 1.0], [0.22, 1.28], [-0.22, 1.28], [-0.28, 1.0]], depth: 0.42, bevel: 0.04, pos: [0.38, 0, 0], rot: [0, -90, 0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.17, height: 0.5, pos: [0.42, 0.8, 0.02], rot: [0, 0, 90], color: "steel", mirror: true },
      { shape: "extrude", profile: [[-0.3, 0.12], [0.36, 0.12], [0.38, 0.6], [0.2, 0.8], [-0.26, 0.8], [-0.32, 0.5]], depth: 0.55, bevel: 0.04, pos: [0.42, 0, 0], rot: [0, -90, 0], color: "light", mirror: true },
      { shape: "box", size: [0.4, 0.14, 0.2], pos: [0.42, 0.86, 0.26], rot: [20, 0, 0], color: "faction", mirror: true },
      { shape: "box", size: [0.06, 0.3, 0.03], pos: [0.42, 0.4, 0.4], color: "glow", mirror: true },
      { shape: "tube", radius: 0.04, path: [[0.42, 1.2, -0.25], [0.42, 0.3, -0.32]], color: "steel", mirror: true, fine: true },
      { shape: "extrude", profile: [[-0.32, 0.02], [0.54, 0.02], [0.56, 0.08], [0.4, 0.15], [-0.26, 0.16], [-0.32, 0.08]], depth: 0.6, pos: [0.42, 0, 0], rot: [0, -90, 0], color: "dark", mirror: true },
      { shape: "box", size: [0.6, 0.04, 0.86], pos: [0.42, 0.02, 0.12], color: "rubber", mirror: true, fine: true },
      // bassin et taille
      { shape: "extrude", profile: [[-0.46, 1.16], [0.46, 1.16], [0.52, 1.36], [0.4, 1.54], [-0.4, 1.54], [-0.52, 1.36]], depth: 0.7, bevel: 0.04, color: "dark" },
      { shape: "cylinder", sides: 10, radius: 0.36, height: 0.12, pos: [0, 1.58, 0], color: "steel" },
      // torse à pans (pivot), plastron clair, cœur lumineux
      { shape: "extrude", profile: [[-0.66, -0.5], [0.66, -0.5], [0.75, 0.1], [0.6, 0.5], [-0.6, 0.5], [-0.75, 0.1]], depth: 1.0, bevel: 0.05, pos: [0, 2.05, 0], color: "faction", pivot: "torse" },
      { shape: "extrude", profile: [[0.4, 1.78], [0.6, 1.82], [0.62, 2.3], [0.42, 2.4]], depth: 1.0, bevel: 0.03, rot: [0, -90, 0], color: "light", parent: "torse" },
      { shape: "sphere", radius: 0.16, pos: [0, 2.05, 0.63], color: "glow", parent: "torse" },
      { shape: "torus", radius: 0.19, tube: 0.035, sides: 12, pos: [0, 2.05, 0.64], rot: [90, 0, 0], color: "steel", parent: "torse" },
      // sac dorsal : coque, condensateurs d'acier à bague lumineuse, bobines de cuivre
      { shape: "extrude", profile: [[-0.45, 1.8], [-0.75, 1.84], [-0.77, 2.36], [-0.45, 2.42]], depth: 0.9, bevel: 0.03, rot: [0, -90, 0], color: "dark", parent: "torse" },
      { shape: "cylinder", sides: 10, radius: 0.12, height: 0.36, pos: [0.25, 2.55, -0.6], color: "steel", mirror: true, parent: "torse" },
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.03, pos: [0.25, 2.74, -0.6], color: "glow", mirror: true, parent: "torse" },
      ...[2.47, 2.57].map((y): Part => ({ shape: "torus", radius: 0.125, tube: 0.02, sides: 10, pos: [0.25, y, -0.6], color: "copper", mirror: true, parent: "torse", fine: true })),
      ...[2.0, 2.1, 2.2].map((y): Part => ({ shape: "box", size: [0.6, 0.03, 0.03], pos: [0, y, -0.77], color: "black", parent: "torse", fine: true })),
      // casque clair à visière cyan
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.16, pos: [0, 2.56, 0.1], color: "steel", parent: "torse" },
      { shape: "extrude", profile: [[-0.26, -0.18], [0.26, -0.18], [0.3, 0.04], [0.2, 0.18], [-0.2, 0.18], [-0.3, 0.04]], depth: 0.55, bevel: 0.03, pos: [0, 2.75, 0.12], color: "light", parent: "torse" },
      { shape: "box", size: [0.36, 0.07, 0.04], pos: [0, 2.78, 0.415], color: "glow", parent: "torse" },
      { shape: "box", size: [0.08, 0.04, 0.4], pos: [0, 2.95, 0.1], color: "faction", parent: "torse" },
      // épaulières massives : carénage clair, dessus d'équipe à ouïes, voyant
      { shape: "extrude", profile: [[-0.32, -0.27], [0.26, -0.27], [0.33, -0.12], [0.33, 0.27], [-0.32, 0.27]], depth: 0.75, bevel: 0.05, pos: [1.05, 2.4, 0], color: "light", mirror: true, parent: "torse" },
      { shape: "extrude", profile: [[-0.27, -0.04], [0.27, -0.04], [0.28, 0.04], [0.16, 0.1], [-0.16, 0.1], [-0.28, 0.04]], depth: 0.62, bevel: 0.02, pos: [1.05, 2.7, 0], color: "faction", mirror: true, parent: "torse" },
      ...[-0.12, 0.12].map((z): Part => ({ shape: "box", size: [0.3, 0.02, 0.06], pos: [1.05, 2.815, z], color: "black", mirror: true, parent: "torse", fine: true })),
      { shape: "box", size: [0.08, 0.05, 0.04], pos: [1.2, 2.45, 0.39], color: "amber", mirror: true, parent: "torse" },
      // bras : biceps d'acier, coude, poing sombre, bobine de cuivre, arcs électriques
      { shape: "cylinder", sides: 10, radius: 0.16, height: 0.56, pos: [1.05, 1.88, 0.05], color: "steel", mirror: true, parent: "torse" },
      { shape: "cylinder", sides: 10, radius: 0.17, height: 0.46, pos: [1.07, 1.62, 0.1], rot: [0, 0, 90], color: "dark", mirror: true, parent: "torse" },
      { shape: "extrude", profile: [[-0.15, 0.98], [0.5, 1.0], [0.56, 1.28], [0.5, 1.56], [-0.12, 1.58], [-0.18, 1.28]], depth: 0.6, bevel: 0.04, pos: [1.1, 0, 0], rot: [0, -90, 0], color: "dark", mirror: true, parent: "torse" },
      { shape: "torus", radius: 0.3, tube: 0.04, sides: 12, pos: [1.1, 1.4, 0.18], rot: [90, 0, 0], color: "copper", mirror: true, parent: "torse" },
      ...[1.12, 1.28, 1.44].map((y): Part => ({ shape: "box", size: [0.5, 0.08, 0.05], pos: [1.1, y, 0.57], color: "steel", mirror: true, parent: "torse", fine: true })),
      { shape: "box", size: [0.06, 0.06, 0.5], pos: [1.1, 1.28, 0.58], rot: [0, 25, 30], color: "glow", mirror: true, parent: "torse" },
      { shape: "box", size: [0.5, 0.06, 0.06], pos: [1.12, 1.6, 0.3], rot: [0, 20, -35], color: "glow", mirror: true, parent: "torse" },
      { shape: "box", size: [0.06, 0.45, 0.06], pos: [1.44, 1.2, 0.3], rot: [30, 0, 20], color: "glow", mirror: true, parent: "torse" },
    ],
  },
  // heavy_artillery : plateforme à quatre pattes écartées, tourelle lourde, très long canon clair à filet cyan ;
  // pattes profilées à rotules d'acier et semelles, couronne d'acier, tourelle à pans, fût tourné à évacuateur et
  // frein de bouche ; pièces fines : vérins, freins de recul, ouïes du frein, grilles, antenne
  heavy_artillery: {
    parts: [
      ...[0.8, -0.8].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 10, radius: 0.17, height: 0.38, pos: [0.62, 1.05, z], rot: [90, 0, 0], color: "steel", mirror: true },
        { shape: "extrude", profile: [[0.56, 1.0], [0.64, 1.22], [1.46, 0.86], [1.38, 0.64]], depth: 0.36, bevel: 0.03, pos: [0, 0, z], color: "light", mirror: true },
        { shape: "cylinder", sides: 10, radius: 0.15, height: 0.44, pos: [1.42, 0.76, z], rot: [90, 0, 0], color: "steel", mirror: true },
        { shape: "extrude", profile: [[1.22, 0.8], [1.62, 0.8], [1.6, 0.14], [1.24, 0.14]], depth: 0.48, bevel: 0.04, pos: [0, 0, z], color: "dark", mirror: true },
        { shape: "tube", radius: 0.035, path: [[0.8, 0.86, z + 0.2], [1.36, 0.48, z + 0.25]], color: "steel", mirror: true, fine: true },
        { shape: "box", size: [0.55, 0.06, 0.62], pos: [1.46, 0.03, z > 0 ? 0.88 : -0.88], color: "rubber", mirror: true },
        { shape: "bevel", size: [0.5, 0.1, 0.56], pos: [1.44, 0.11, z > 0 ? 0.86 : -0.86], bevel: 0.03, color: "dark", mirror: true },
      ]),
      { shape: "box", size: [0.03, 0.4, 0.04], pos: [1.42, 0.45, 1.065], color: "glow", mirror: true },
      // caisse, flancs d'équipe, grilles
      { shape: "extrude", profile: [[-0.78, 0.7], [0.78, 0.7], [0.86, 0.95], [0.8, 1.3], [-0.8, 1.3], [-0.86, 0.95]], depth: 2.0, bevel: 0.05, color: "dark" },
      { shape: "box", size: [0.1, 0.3, 1.6], pos: [0.86, 1.05, 0], color: "faction", mirror: true },
      ...[-0.75, -0.85].map((z): Part => ({ shape: "box", size: [1.2, 0.02, 0.05], pos: [0, 1.31, z], color: "black", fine: true })),
      // couronne d'acier (pivot), tourelle à pans, flancs clairs
      { shape: "cylinder", sides: 12, radius: 0.75, height: 0.2, bevel: 0.03, pos: [0, 1.4, 0], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.5, -0.7], [0.5, -0.7], [0.6, -0.4], [0.6, 0.4], [0.45, 0.7], [-0.45, 0.7], [-0.6, 0.4], [-0.6, -0.4]], depth: 0.6, bevel: 0.05, pos: [0, 1.78, -0.15], rot: [90, 0, 0], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.1, 0.45, 1.0], pos: [0.62, 1.75, -0.22], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.08, 0.05, 0.05], pos: [0.35, 2.1, 0.3], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.18, height: 0.06, bevel: 0.015, pos: [-0.25, 2.1, -0.45], color: "light", parent: "tourelle" },
      ...[-0.5, -0.6, -0.7].map((z): Part => ({ shape: "box", size: [0.36, 0.02, 0.04], pos: [0.25, 2.09, z], color: "black", parent: "tourelle", fine: true })),
      { shape: "tube", radius: 0.016, sides: 4, path: [[0.45, 2.06, -0.65], [0.45, 2.6, -0.7]], color: "light", parent: "tourelle", fine: true },
      // berceau, très long fût clair tourné (évacuateur, frein de bouche), filet cyan, freins de recul
      incl([0, 1.85, 0.4], 12, 0.15, 0, { shape: "box", size: [0.6, 0.52, 0.7], color: "dark", parent: "tourelle" }),
      incl([0, 1.85, 0.4], 12, 0.3, 0, { shape: "lathe", sides: 12, rot: [90, 0, 0], color: "light", parent: "tourelle", profile: [[0, 0], [0.24, 0], [0.24, 0.5], [0.2, 0.56], [0.2, 3.32], [0.27, 3.38], [0.27, 3.96], [0.22, 4.02], [0, 4.02]] }),
      incl([0, 1.85, 0.4], 12, 2.3, 0, { shape: "cylinder", sides: 12, radius: 0.25, height: 0.4, rot: [90, 0, 0], color: "steel", parent: "tourelle" }),
      incl([0, 1.85, 0.4], 12, 1.5, 0.2, { shape: "box", size: [0.05, 0.05, 1.5], color: "glow", parent: "tourelle" }),
      incl([0, 1.85, 0.4], 12, 3.0, 0.2, { shape: "box", size: [0.05, 0.05, 0.9], color: "glow", parent: "tourelle" }),
      incl([0, 1.85, 0.4], 12, 4.315, 0, { shape: "cylinder", sides: 8, radius: 0.16, height: 0.02, rot: [90, 0, 0], color: "black", parent: "tourelle" }),
      ...[3.85, 4.05].map((d): Part => incl([0.27, 1.85, 0.4], 12, d, 0, { shape: "box", size: [0.02, 0.18, 0.1], color: "black", mirror: true, parent: "tourelle", fine: true })),
      incl([0.2, 1.85, 0.4], 12, 0.9, -0.15, { shape: "cylinder", sides: 6, radius: 0.05, height: 0.9, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", fine: true }),
    ],
  },
  // scout_plane : petit jet de reconnaissance, fuselage profilé sombre, optique ambre au nez, verrière, ailes
  // delta d'équipe à panneau clair et bord de fuite cyan, deux réacteurs à tuyère lumineuse, dérives inclinées
  scout_plane: {
    parts: [
      // fuselage profilé, dos d'équipe, optique de nez
      { shape: "lathe", sides: 12, pos: [0,0.42,0], rot: [90,0,0], scale: [1,1,0.78], color: "dark", profile: [[0,-0.95],[0.15,-0.95],[0.21,-0.75],[0.25,-0.3],[0.25,0.45],[0.22,0.85],[0.17,1.12],[0.13,1.27],[0,1.29]] },
      { shape: "sphere", radius: 0.13, detail: 1, pos: [0,0.42,1.29], scale: [1,1,0.9], color: "amber" },
      { shape: "torus", radius: 0.13, tube: 0.022, sides: 12, pos: [0,0.42,1.25], rot: [90,0,0], color: "steel", fine: true },
      { shape: "bevel", size: [0.3,0.08,1.15], pos: [0,0.6,-0.3], bevel: 0.03, color: "faction" },
      { shape: "box", size: [0.03,0.02,0.9], pos: [0,0.645,-0.3], color: "glow", fine: true },
      // verrière et arceau
      { shape: "sphere", radius: 1, detail: 1, pos: [0,0.58,0.62], scale: [0.16,0.12,0.38], color: "glass" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.15,0.6,0.5],[0,0.7,0.5],[0.15,0.6,0.5]], bend: 0.06, color: "dark", fine: true },
      // optique ventrale
      { shape: "sphere", radius: 0.09, pos: [0,0.27,0.75], color: "dark", fine: true },
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.02, pos: [0,0.25,0.82], rot: [70,0,0], color: "amber", fine: true },
      // ailes delta : plan d'équipe, panneau clair, bord de fuite cyan, feux, volets
      { shape: "extrude", profile: [[0.15,0.4],[1.62,-0.82],[1.75,-0.9],[1.75,-1.0],[0.15,-1.0]], depth: 0.06, bevel: 0.02, pos: [0,0.42,0], rot: [90,0,0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[0.42,0.02],[1.05,-0.52],[1.05,-0.9],[0.42,-0.9]], depth: 0.02, pos: [0,0.455,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "box", size: [1.3,0.025,0.04], pos: [0.95,0.43,-1.01], color: "glow", mirror: true },
      { shape: "box", size: [0.02,0.012,0.3], pos: [1.2,0.455,-0.84], color: "dark", mirror: true, fine: true },
      { shape: "sphere", radius: 0.035, pos: [1.7,0.45,-0.93], color: "amber", mirror: true },
      // réacteurs : entrée d'air dorsale, nacelle d'acier, tuyère lumineuse
      { shape: "lathe", sides: 10, pos: [0.36,0.44,0], rot: [90,0,0], color: "steel", mirror: true, profile: [[0,-0.96],[0.1,-0.96],[0.11,-1.02],[0.15,-1.02],[0.17,-0.88],[0.17,-0.1],[0.15,0.05],[0,0.05]] },
      { shape: "cylinder", sides: 10, radius: 0.1, height: 0.02, pos: [0.36,0.44,-0.97], rot: [90,0,0], color: "glow", mirror: true },
      { shape: "wedge", size: [0.16,0.1,0.32], pos: [0.27,0.6,0.12], color: "dark", mirror: true },
      { shape: "box", size: [0.12,0.06,0.02], pos: [0.27,0.6,0.28], color: "black", mirror: true },
      ...[-0.3, -0.45, -0.6].map((z): Part => ({ shape: "box", size: [0.2,0.012,0.03], pos: [0.36,0.61,z], color: "black", mirror: true, fine: true })),
      // dérives inclinées vers l'extérieur
      { shape: "extrude", profile: [[-1.1,0],[-0.72,0],[-0.95,0.4],[-1.08,0.4]], depth: 0.04, bevel: 0.012, pos: [0.36,0.58,0], rot: [-90,-75,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.02,0.02,0.14], pos: [0.48,0.97,-1.02], rot: [0,0,-15], color: "glow", mirror: true, fine: true },
    ],
  },
  // interceptor : chasseur en pointe de flèche, nez clair effilé, ailes delta d'équipe à bord de fuite cyan et
  // missiles en bout d'aile, plans canard, entrées d'air latérales, deux réacteurs, dérives inclinées
  interceptor: {
    parts: [
      // fuselage, nez clair et sonde
      { shape: "lathe", sides: 12, pos: [0,0.42,0], rot: [90,0,0], scale: [1,1,0.75], color: "dark", profile: [[0,-1.05],[0.18,-1.05],[0.24,-0.8],[0.27,-0.2],[0.26,0.5],[0.21,1.0],[0.17,1.3],[0,1.3]] },
      { shape: "lathe", sides: 12, pos: [0,0.42,0], rot: [90,0,0], scale: [1,1,0.75], color: "light", profile: [[0,1.28],[0.172,1.28],[0.14,1.55],[0.08,1.85],[0.025,2.04],[0,2.05]] },
      { shape: "cylinder", sides: 4, radius: 0.012, height: 0.12, pos: [0,0.42,2.05], rot: [90,0,0], color: "dark", fine: true },
      { shape: "bevel", size: [0.32,0.08,1.2], pos: [0,0.6,-0.35], bevel: 0.03, color: "faction" },
      { shape: "sphere", radius: 1, detail: 1, pos: [0,0.58,0.8], scale: [0.15,0.13,0.42], color: "glass" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.14,0.6,0.66],[0,0.71,0.66],[0.14,0.6,0.66]], bend: 0.06, color: "dark", fine: true },
      // ailes delta : plan d'équipe, panneau clair, bord de fuite cyan, missile en bout d'aile
      { shape: "extrude", profile: [[0.2,0.55],[1.52,-0.92],[1.6,-1.0],[1.6,-1.18],[0.2,-1.18]], depth: 0.06, bevel: 0.02, pos: [0,0.42,0], rot: [90,0,0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[0.45,0.12],[1.05,-0.56],[1.05,-1.1],[0.45,-1.1]], depth: 0.02, pos: [0,0.455,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "box", size: [1.25,0.025,0.04], pos: [0.88,0.43,-1.19], color: "glow", mirror: true },
      { shape: "lathe", sides: 6, pos: [1.615,0.44,0], rot: [90,0,0], color: "light", mirror: true, profile: [[0,-1.15],[0.035,-1.12],[0.035,-0.35],[0.02,-0.25],[0,-0.2]] },
      { shape: "cone", sides: 6, radius: 0.04, height: 0.06, pos: [1.615,0.44,-0.23], rot: [90,0,0], color: "red", mirror: true, fine: true },
      { shape: "sphere", radius: 0.03, pos: [1.55,0.46,-1.05], color: "amber", mirror: true },
      // plans canard
      { shape: "extrude", profile: [[0.2,0.98],[0.56,0.62],[0.56,0.52],[0.2,0.6]], depth: 0.035, bevel: 0.01, pos: [0,0.45,0], rot: [90,0,0], color: "light", mirror: true },
      // entrées d'air latérales
      { shape: "extrude", profile: [[-0.2,-0.11],[0.25,-0.11],[0.36,0.11],[-0.2,0.11]], depth: 0.2, bevel: 0.02, pos: [0.33,0.45,0], rot: [0,-90,0], color: "dark", mirror: true },
      { shape: "box", size: [0.16,0.17,0.02], pos: [0.34,0.45,0.31], rot: [-27,0,0], color: "black", mirror: true },
      // réacteurs et tuyères
      { shape: "lathe", sides: 10, pos: [0.3,0.45,0], rot: [90,0,0], color: "steel", mirror: true, profile: [[0,-1.18],[0.11,-1.18],[0.12,-1.25],[0.16,-1.25],[0.18,-1.1],[0.18,-0.3],[0.15,-0.2],[0,-0.2]] },
      { shape: "cylinder", sides: 10, radius: 0.11, height: 0.02, pos: [0.3,0.45,-1.19], rot: [90,0,0], color: "glow", mirror: true },
      ...[-0.5, -0.65, -0.8].map((z): Part => ({ shape: "box", size: [0.18,0.012,0.03], pos: [0.3,0.63,z], color: "black", mirror: true, fine: true })),
      // dérives inclinées
      { shape: "extrude", profile: [[-1.28,0],[-0.78,0],[-1.02,0.48],[-1.2,0.48]], depth: 0.04, bevel: 0.012, pos: [0.34,0.58,0], rot: [-90,-70,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.02,0.02,0.16], pos: [0.5,1.03,-1.11], rot: [0,0,-20], color: "glow", mirror: true, fine: true },
      { shape: "box", size: [0.05,0.03,0.05], pos: [0.18,0.62,0.2], color: "amber", mirror: true },
    ],
  },
  // glider : planeur d'attaque, fuselage sombre profilé, ailes delta d'équipe à bord d'attaque cyan,
  // quatre paniers de roquettes sous les ailes (bouches ambre), deux petites dérives, tuyère lumineuse
  glider: {
    parts: [
      { shape: "lathe", sides: 12, pos: [0,0.45,0], rot: [90,0,0], scale: [1,1,0.62], color: "dark", profile: [[0,-1.0],[0.2,-1.0],[0.26,-0.7],[0.28,0.0],[0.26,0.7],[0.2,1.1],[0.1,1.45],[0,1.59]] },
      { shape: "box", size: [0.04,0.02,0.42], pos: [0,0.59,1.0], color: "glow" },
      { shape: "sphere", radius: 1, detail: 1, pos: [0,0.6,0.48], scale: [0.17,0.12,0.4], color: "glass" },
      { shape: "bevel", size: [0.36,0.08,0.9], pos: [0,0.62,-0.42], bevel: 0.03, color: "faction" },
      { shape: "box", size: [0.2,0.012,0.03], pos: [0,0.665,-0.3], color: "black", fine: true },
      { shape: "box", size: [0.2,0.012,0.03], pos: [0,0.665,-0.42], color: "black", fine: true },
      { shape: "box", size: [0.2,0.012,0.03], pos: [0,0.665,-0.54], color: "black", fine: true },
      // ailes delta, panneau clair, bord d'attaque lumineux
      { shape: "extrude", profile: [[0.2,0.45],[1.4,-0.72],[1.48,-0.8],[1.48,-0.88],[0.2,-0.88]], depth: 0.06, bevel: 0.02, pos: [0,0.45,0], rot: [90,0,0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[0.35,0.12],[0.95,-0.47],[0.95,-0.82],[0.35,-0.82]], depth: 0.02, pos: [0,0.485,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "tube", radius: 0.02, sides: 4, path: [[0.22,0.45,0.47],[1.46,0.45,-0.74]], color: "glow", mirror: true },
      { shape: "box", size: [0.02,0.012,0.3], pos: [0.7,0.485,-0.72], color: "dark", mirror: true, fine: true },
      { shape: "sphere", radius: 0.035, pos: [1.44,0.46,-0.84], color: "amber", mirror: true, fine: true },
      // paniers de roquettes sur pylônes
      { shape: "lathe", sides: 8, pos: [0.62,0.32,0.1], rot: [90,0,0], color: "dark", mirror: true, profile: [[0,-0.35],[0.06,-0.35],[0.085,-0.28],[0.085,0.32],[0.07,0.35],[0,0.35]] },
      { shape: "lathe", sides: 8, pos: [0.92,0.32,-0.2], rot: [90,0,0], color: "dark", mirror: true, profile: [[0,-0.3],[0.06,-0.3],[0.085,-0.24],[0.085,0.27],[0.07,0.3],[0,0.3]] },
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.015, pos: [0.62,0.32,0.452], rot: [90,0,0], color: "amber", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.015, pos: [0.92,0.32,0.102], rot: [90,0,0], color: "amber", mirror: true },
      { shape: "torus", radius: 0.086, tube: 0.012, sides: 8, pos: [0.62,0.32,0.0], rot: [90,0,0], color: "steel", mirror: true, fine: true },
      { shape: "torus", radius: 0.086, tube: 0.012, sides: 8, pos: [0.92,0.32,-0.3], rot: [90,0,0], color: "steel", mirror: true, fine: true },
      { shape: "box", size: [0.03,0.07,0.3], pos: [0.62,0.41,0.05], color: "metal", mirror: true, fine: true },
      { shape: "box", size: [0.03,0.07,0.26], pos: [0.92,0.41,-0.22], color: "metal", mirror: true, fine: true },
      // dérives et tuyère
      { shape: "extrude", profile: [[-1.0,0],[-0.55,0],[-0.82,0.4],[-0.98,0.4]], depth: 0.04, bevel: 0.012, pos: [0.22,0.6,0], rot: [-90,-80,-90], color: "faction", mirror: true },
      { shape: "lathe", sides: 10, pos: [0,0.45,0], rot: [90,0,0], scale: [1,1,0.62], color: "steel", profile: [[0,-0.97],[0.15,-0.97],[0.17,-1.02],[0.22,-1.02],[0.24,-0.92],[0.2,-0.9],[0,-0.9]] },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.02, pos: [0,0.45,-0.985], rot: [90,0,0], scale: [1,1,0.62], color: "glow" },
      { shape: "box", size: [0.05,0.03,0.05], pos: [0.2,0.61,0.0], color: "amber", mirror: true },
    ],
  },
  // transport : soute massive profilée à rampe arrière, nez clair vitré, dos d'équipe, quatre nacelles carénées
  // à rotor, anneau lumineux et moyeu ; pièces fines : hublots, grilles, marchepieds, feux
  transport: {
    parts: [
      // soute : profil latéral à nez incliné, nez clair, verrière
      { shape: "extrude", profile: [[-1.75,0.42],[1.5,0.42],[1.5,1.28],[-1.75,1.28]], depth: 1.5, bevel: 0.06, rot: [0,-90,0], color: "dark" },
      { shape: "extrude", profile: [[1.45,0.46],[1.95,0.56],[2.28,0.8],[2.26,0.95],[1.9,1.15],[1.45,1.24]], depth: 1.32, bevel: 0.05, rot: [0,-90,0], color: "light" },
      { shape: "box", size: [0.9,0.03,0.4], pos: [0,1.08,2.08], rot: [29.7,0,0], color: "glass" },
      { shape: "box", size: [0.03,0.16,0.3], pos: [0.665,0.98,1.75], color: "glass", mirror: true },
      { shape: "box", size: [0.04,0.04,0.04], pos: [0.3,0.62,2.12], color: "amber", mirror: true },
      // dos d'équipe : panneau, carénage moteur, grilles, hublots
      { shape: "bevel", size: [1.2,0.12,2.7], pos: [0,1.32,-0.25], bevel: 0.04, color: "faction" },
      { shape: "lathe", sides: 10, pos: [0,1.32,0], rot: [90,0,0], scale: [1,1,0.4], color: "light", profile: [[0,-1.2],[0.22,-1.1],[0.32,-0.7],[0.32,0.2],[0.24,0.6],[0,0.75]] },
      ...[-0.25, -0.45, -0.65].map((z): Part => ({ shape: "box", size: [0.4,0.012,0.05], pos: [0,1.445,z], color: "black", fine: true })),
      { shape: "box", size: [0.5,0.03,0.04], pos: [0,1.4,-1.2], color: "glow" },
      { shape: "box", size: [0.08,0.04,0.05], pos: [0.5,1.4,0.6], color: "amber", mirror: true },
      ...[0.9, 0.4, -0.1, -0.6].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.055, height: 0.02, pos: [0.755,0.95,z], rot: [0,0,90], color: "glass", mirror: true, fine: true })),
      { shape: "box", size: [0.03,0.04,2.4], pos: [0.76,0.62,-0.2], color: "glow", mirror: true },
      // rampe arrière à nervures
      { shape: "box", size: [1.0,0.06,0.8], pos: [0,0.42,-1.95], rot: [-25,0,0], color: "steel" },
      ...[-0.3, 0, 0.3].map((x): Part => ({ shape: "box", size: [0.04,0.03,0.75], pos: [x,0.46,-1.95], rot: [-25,0,0], color: "dark", fine: true })),
      { shape: "cylinder", sides: 8, radius: 0.05, height: 1.1, pos: [0,0.6,-1.6], rot: [0,0,90], color: "dark", fine: true },
      // ailerons porteurs vers les nacelles
      { shape: "bevel", size: [2.4,0.12,0.32], pos: [0,1.0,0.95], bevel: 0.04, color: "metal" },
      { shape: "bevel", size: [2.4,0.12,0.32], pos: [0,1.0,-0.95], bevel: 0.04, color: "metal" },
      // nacelles carénées : carène d'équipe, anneau lumineux, fond sombre, croisillon, moyeu
      ...[0.95, -0.95].flatMap((z): Part[] => [
        { shape: "torus", radius: 0.5, tube: 0.08, sides: 16, pos: [1.45,1.06,z], scale: [1,1.5,1], color: "faction", mirror: true },
        { shape: "lathe", sides: 16, profile: [[0.45,0],[0.39,0]], pos: [1.45,1.12,z], color: "glow", mirror: true },
        { shape: "cylinder", sides: 12, radius: 0.44, height: 0.03, pos: [1.45,0.98,z], color: "dark", mirror: true },
        { shape: "box", size: [0.9,0.04,0.05], pos: [1.45,1.0,z], color: "metal", mirror: true, fine: true },
        { shape: "box", size: [0.05,0.04,0.9], pos: [1.45,1.0,z], color: "metal", mirror: true, fine: true },
        { shape: "cylinder", sides: 8, radius: 0.09, height: 0.24, pos: [1.45,1.12,z], color: "steel", mirror: true },
      ]),
      { use: "rotor", pos: [1.45,1.28,0.95], scale: 0.55, pivot: "rotor1" },
      { shape: "cone", sides: 8, radius: 0.07, height: 0.1, pos: [1.45,1.32,0.95], color: "steel", parent: "rotor1" },
      { use: "rotor", pos: [-1.45,1.28,0.95], scale: 0.55, pivot: "rotor2" },
      { shape: "cone", sides: 8, radius: 0.07, height: 0.1, pos: [-1.45,1.32,0.95], color: "steel", parent: "rotor2" },
      { use: "rotor", pos: [1.45,1.28,-0.95], scale: 0.55, pivot: "rotor3" },
      { shape: "cone", sides: 8, radius: 0.07, height: 0.1, pos: [1.45,1.32,-0.95], color: "steel", parent: "rotor3" },
      { use: "rotor", pos: [-1.45,1.28,-0.95], scale: 0.55, pivot: "rotor4" },
      { shape: "cone", sides: 8, radius: 0.07, height: 0.1, pos: [-1.45,1.32,-0.95], color: "steel", parent: "rotor4" },
      { shape: "sphere", radius: 0.035, pos: [2.0,1.1,0.95], color: "amber", mirror: true, fine: true },
    ],
  },
  // gunship : canonnière au fuselage profilé et verrière, poutre de queue à dérives d'équipe, deux grands
  // rotors carénés à anneau lumineux, nacelles moteur dorsales, tourelle de menton, paniers de roquettes ;
  // pièces fines : patins, tubes du canon, pointes des roquettes, feux de position
  gunship: {
    parts: [
      // fuselage, dos d'équipe, verrière
      { shape: "lathe", sides: 12, pos: [0,0.9,0], rot: [90,0,0], scale: [1,1,0.8], color: "dark", profile: [[0,-1.05],[0.3,-0.95],[0.47,-0.55],[0.52,0.1],[0.47,0.75],[0.33,1.2],[0.15,1.5],[0,1.58]] },
      { shape: "bevel", size: [0.62,0.18,1.5], pos: [0,1.24,-0.15], bevel: 0.06, color: "faction" },
      { shape: "sphere", radius: 1, detail: 1, pos: [0,1.08,0.78], scale: [0.3,0.24,0.55], color: "glass" },
      { shape: "box", size: [0.04,0.03,0.9], pos: [0.36,1.02,0.2], color: "glow", mirror: true },
      // poutre de queue, dérives d'équipe, empennage
      { shape: "lathe", sides: 10, pos: [0,1.02,0], rot: [90,0,0], color: "metal", profile: [[0,-2.5],[0.09,-2.45],[0.11,-2.2],[0.2,-1.1],[0.2,-0.9],[0,-0.9]] },
      { shape: "extrude", profile: [[-2.5,0.98],[-2.08,0.98],[-2.28,1.6],[-2.55,1.6]], depth: 0.05, bevel: 0.015, pos: [0.13,0,0], rot: [0,-90,-6], color: "faction", mirror: true },
      { shape: "extrude", profile: [[-0.62,-2.32],[0.62,-2.32],[0.5,-2.08],[-0.5,-2.08]], depth: 0.04, pos: [0,1.0,0], rot: [90,0,0], color: "light" },
      { shape: "cylinder", sides: 10, radius: 0.05, height: 0.04, pos: [0,1.02,-2.52], rot: [90,0,0], color: "glow" },
      // ailerons porteurs et paniers de roquettes
      { shape: "extrude", profile: [[0.35,-0.15],[0.98,-0.08],[0.98,0.3],[0.35,0.42]], depth: 0.07, bevel: 0.02, pos: [0,0.92,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "lathe", sides: 10, pos: [0.72,0.78,0.12], rot: [90,0,0], color: "dark", mirror: true, profile: [[0,-0.38],[0.1,-0.36],[0.12,-0.3],[0.12,0.3],[0.1,0.36],[0,0.36]] },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.03, pos: [0.72,0.78,0.49], rot: [90,0,0], color: "amber", mirror: true, fine: true },
      // rotors carénés : carène d'équipe, anneau lumineux, bras de liaison, moyeu et pales (pivots)
      { shape: "torus", radius: 0.72, tube: 0.1, sides: 24, pos: [1.38,1.0,0.1], scale: [1,1.3,1], color: "faction", mirror: true },
      { shape: "torus", radius: 0.6, tube: 0.025, sides: 24, pos: [1.38,1.0,0.1], color: "glow", mirror: true },
      { shape: "bevel", size: [0.5,0.1,0.22], pos: [0.85,1.0,0.1], bevel: 0.03, color: "dark", mirror: true },
      { shape: "box", size: [1.3,0.04,0.06], pos: [1.38,0.94,0.1], color: "dark", mirror: true },
      { shape: "cone", sides: 10, radius: 0.12, height: 0.18, pos: [1.38,1.1,0.1], color: "steel", pivot: "rotor" },
      { use: "rotor", pos: [1.38,1.06,0.1], scale: [0.72,1,0.72], parent: "rotor" },
      { shape: "cone", sides: 10, radius: 0.12, height: 0.18, pos: [-1.38,1.1,0.1], color: "steel", pivot: "rotor2" },
      { use: "rotor", pos: [-1.38,1.06,0.1], scale: [0.72,1,0.72], parent: "rotor2" },
      // nacelles moteur dorsales : entrée d'air sombre, tuyère lumineuse
      { shape: "lathe", sides: 10, pos: [0.3,1.3,-0.35], rot: [90,0,0], color: "steel", mirror: true, profile: [[0,-0.45],[0.1,-0.45],[0.15,-0.35],[0.15,0.25],[0.12,0.35],[0,0.35]] },
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.03, pos: [0.3,1.3,-0.81], rot: [90,0,0], color: "glow", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.1, height: 0.03, pos: [0.3,1.3,0.36], rot: [90,0,0], color: "black", mirror: true, fine: true },
      // tourelle de menton à deux tubes
      { shape: "sphere", radius: 0.17, detail: 1, pos: [0,0.6,1.1], color: "dark" },
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.05,0.58,1.2],[0.05,0.58,1.62]], color: "metal", mirror: true, fine: true },
      // patins et feux de position
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.38,0.6,0.7],[0.38,0.32,0.55],[0.38,0.32,-0.7],[0.38,0.6,-0.75]], bend: 0.1, color: "metal", mirror: true, fine: true },
      { shape: "sphere", radius: 0.04, pos: [0.98,0.93,0.1], color: "amber", mirror: true, fine: true },
    ],
  },
  // bomber : aile volante sombre à bord de fuite en dents de scie, fuselage fondu, panneaux aux couleurs du
  // camp, bords d'attaque et de fuite cyan, verrière, deux nacelles dorsales à entrée d'air et tuyère
  bomber: {
    parts: [
      // fuselage fondu dans l'aile
      { shape: "lathe", sides: 14, pos: [0,0.55,0], rot: [90,0,0], scale: [1,1,0.32], color: "dark", profile: [[0,-1.55],[0.45,-1.5],[0.6,-0.8],[0.62,0.3],[0.55,1.2],[0.35,2.1],[0.15,2.55],[0,2.7]] },
      { shape: "bevel", size: [0.56,0.1,1.9], pos: [0,0.72,-0.2], bevel: 0.04, color: "faction" },
      { shape: "sphere", radius: 1, detail: 1, pos: [0,0.73,1.35], scale: [0.3,0.13,0.45], color: "glass" },
      { shape: "box", size: [0.03,0.02,0.6], pos: [0,0.79,0.25], color: "glow", fine: true },
      // ailes : plan sombre, panneaux d'équipe et clairs, bords lumineux
      { shape: "extrude", profile: [[0.4,1.3],[3.95,-1.33],[4.1,-1.45],[4.1,-1.62],[2.6,-1.62],[2.2,-1.3],[1.6,-1.62],[0.4,-1.62]], depth: 0.12, bevel: 0.04, pos: [0,0.55,0], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "extrude", profile: [[0.62,0.85],[3.2,-1.05],[3.2,-1.32],[2.55,-1.32],[2.2,-1.08],[1.6,-1.38],[0.62,-1.38]], depth: 0.025, pos: [0,0.618,0], rot: [90,0,0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[3.35,-1.18],[3.9,-1.4],[3.9,-1.55],[3.35,-1.55]], depth: 0.025, pos: [0,0.618,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "tube", radius: 0.022, sides: 4, path: [[0.42,0.55,1.28],[4.06,0.55,-1.4]], color: "glow", mirror: true },
      { shape: "tube", radius: 0.018, sides: 4, path: [[0.45,0.56,-1.63],[1.6,0.56,-1.63],[2.2,0.56,-1.31],[2.6,0.56,-1.63],[4.08,0.56,-1.63]], bend: 0.04, color: "glow", mirror: true },
      ...[1.4, 2.0, 2.6].map((x): Part => ({ shape: "box", size: [0.02,0.012,0.5], pos: [x,0.632,-0.9 - (x - 1.4) * 0.3], rot: [0,36,0], color: "black", mirror: true, fine: true })),
      { shape: "sphere", radius: 0.04, pos: [3.98,0.58,-1.5], color: "amber", mirror: true },
      { shape: "box", size: [0.08,0.03,0.08], pos: [1.6,0.635,0.0], color: "amber", mirror: true },
      // nacelles dorsales : carénage d'acier, entrée d'air noire, tuyère lumineuse
      { shape: "lathe", sides: 10, pos: [0.85,0.6,0], rot: [90,0,0], scale: [1,1,0.55], color: "steel", mirror: true, profile: [[0,-0.55],[0.16,-0.55],[0.21,-0.3],[0.22,0.2],[0.2,0.45],[0.15,0.5],[0,0.5]] },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.03, pos: [0.85,0.62,0.49], rot: [90,0,0], scale: [1,1,0.55], color: "black", mirror: true },
      { shape: "box", size: [0.28,0.06,0.04], pos: [0.85,0.64,-0.56], color: "glow", mirror: true },
      { shape: "box", size: [0.02,0.012,0.5], pos: [0.85,0.725,-0.05], color: "dark", mirror: true, fine: true },
    ],
  },
  // asf : chasseur de supériorité, nez clair effilé, grandes ailes delta d'équipe à liserés cyan, extensions
  // d'emplanture claires, plans canard, entrées d'air, deux réacteurs, dérives inclinées, empennage clair
  asf: {
    parts: [
      { shape: "lathe", sides: 12, pos: [0,0.45,0], rot: [90,0,0], scale: [1,1,0.7], color: "dark", profile: [[0,-1.5],[0.25,-1.5],[0.32,-1.1],[0.34,-0.2],[0.32,0.6],[0.25,1.1],[0.19,1.42],[0,1.42]] },
      { shape: "lathe", sides: 12, pos: [0,0.45,0], rot: [90,0,0], scale: [1,1,0.7], color: "light", profile: [[0,1.4],[0.192,1.4],[0.15,1.8],[0.08,2.2],[0.025,2.48],[0,2.5]] },
      { shape: "cylinder", sides: 4, radius: 0.012, height: 0.12, pos: [0,0.45,2.53], rot: [90,0,0], color: "dark", fine: true },
      { shape: "extrude", profile: [[0.0,1.3],[0.3,1.0],[0.62,0.2],[0.62,-0.1],[0,-0.1]], depth: 0.06, bevel: 0.02, pos: [0,0.52,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "sphere", radius: 1, detail: 1, pos: [0,0.64,0.85], scale: [0.17,0.14,0.48], color: "glass" },
      { shape: "tube", radius: 0.013, sides: 4, path: [[-0.16,0.65,0.7],[0,0.77,0.7],[0.16,0.65,0.7]], bend: 0.06, color: "dark", fine: true },
      { shape: "bevel", size: [0.46,0.1,1.6], pos: [0,0.66,-0.5], bevel: 0.035, color: "faction" },
      { shape: "box", size: [0.03,0.02,1.2], pos: [0,0.715,-0.5], color: "glow", fine: true },
      // ailes delta : plan d'équipe, panneau clair, liserés cyan, missiles
      { shape: "extrude", profile: [[0.3,0.4],[2.15,-1.35],[2.3,-1.42],[2.3,-1.52],[0.3,-1.52]], depth: 0.07, bevel: 0.025, pos: [0,0.46,0], rot: [90,0,0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[0.62,-0.05],[1.3,-0.7],[1.3,-1.44],[0.62,-1.44]], depth: 0.02, pos: [0,0.5,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "tube", radius: 0.02, sides: 4, path: [[0.32,0.47,0.42],[2.27,0.47,-1.4]], color: "glow", mirror: true },
      { shape: "box", size: [1.9,0.025,0.04], pos: [1.3,0.47,-1.53], color: "glow", mirror: true },
      { shape: "box", size: [0.02,0.012,0.4], pos: [1.6,0.5,-1.3], color: "dark", mirror: true, fine: true },
      ...[1.0, 1.5].map((x): Part => ({ shape: "lathe", sides: 6, pos: [x,0.38,0], rot: [90,0,0], color: "light", mirror: true, fine: true, profile: [[0,-1.15 + x * 0.3],[0.035,-1.12 + x * 0.3],[0.035,-0.5 + x * 0.1],[0,-0.38 + x * 0.1]] })),
      { shape: "sphere", radius: 0.035, pos: [2.22,0.49,-1.46], color: "amber", mirror: true },
      // plans canard
      { shape: "extrude", profile: [[0.3,1.05],[0.85,0.55],[0.85,0.45],[0.3,0.62]], depth: 0.04, bevel: 0.012, pos: [0,0.5,0], rot: [90,0,0], color: "light", mirror: true },
      // entrées d'air : caisson sombre, bouche noire
      { shape: "bevel", size: [0.26,0.24,0.62], pos: [0.44,0.45,0.08], bevel: 0.04, color: "dark", mirror: true },
      { shape: "box", size: [0.2,0.18,0.02], pos: [0.44,0.45,0.4], color: "black", mirror: true },
      // réacteurs et tuyères
      { shape: "lathe", sides: 10, pos: [0.38,0.47,0], rot: [90,0,0], color: "steel", mirror: true, profile: [[0,-1.75],[0.15,-1.75],[0.16,-1.84],[0.21,-1.84],[0.23,-1.6],[0.23,-0.3],[0.2,-0.2],[0,-0.2]] },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.02, pos: [0.38,0.47,-1.76], rot: [90,0,0], color: "glow", mirror: true },
      ...[-0.7, -0.85, -1.0].map((z): Part => ({ shape: "box", size: [0.22,0.012,0.03], pos: [0.38,0.7,z], color: "black", mirror: true, fine: true })),
      // dérives inclinées à liseré cyan, empennage clair
      { shape: "extrude", profile: [[-1.45,0],[-0.75,0],[-1.15,0.66],[-1.38,0.66]], depth: 0.05, bevel: 0.015, pos: [0.42,0.62,0], rot: [-90,-70,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.025,0.03,0.24], pos: [0.645,1.24,-1.26], rot: [0,0,-20], color: "glow", mirror: true },
      { shape: "extrude", profile: [[0.5,-1.2],[1.15,-1.62],[1.15,-1.8],[0.5,-1.84]], depth: 0.04, bevel: 0.012, pos: [0,0.46,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "box", size: [0.05,0.03,0.05], pos: [0.2,0.68,0.2], color: "amber", mirror: true },
    ],
  },
  // strat_bomber : grand bombardier à ailes en flèche d'équipe, fuselage profilé sombre, verrière, quatre
  // réacteurs en nacelle sur pylônes (entrée noire, tuyère cyan), double dérive inclinée, empennage clair
  strat_bomber: {
    parts: [
      { shape: "lathe", sides: 14, pos: [0,0.65,0], rot: [90,0,0], scale: [1,1,0.75], color: "dark", profile: [[0,-2.2],[0.25,-2.15],[0.42,-1.6],[0.5,-0.8],[0.5,1.6],[0.45,2.3],[0.34,2.9],[0.18,3.3],[0.05,3.48],[0,3.5]] },
      { shape: "bevel", size: [0.5,0.1,3.4], pos: [0,1.02,-0.2], bevel: 0.035, color: "faction" },
      { shape: "box", size: [0.03,0.02,2.8], pos: [0,1.075,-0.2], color: "glow" },
      { shape: "sphere", radius: 1, detail: 1, pos: [0,0.97,2.3], scale: [0.3,0.14,0.42], color: "glass" },
      { shape: "tube", radius: 0.015, sides: 4, path: [[-0.29,0.98,2.2],[0,1.1,2.2],[0.29,0.98,2.2]], bend: 0.12, color: "dark", fine: true },
      { shape: "box", size: [0.03,0.08,2.6], pos: [0.5,0.66,0.6], color: "light", mirror: true },
      ...[1.6, 1.2, 0.8, 0.4].map((z): Part => ({ shape: "box", size: [0.3,0.012,0.05], pos: [0,1.072,z - 1.6], color: "black", fine: true })),
      // ailes en flèche : plan d'équipe, volets clairs, bord d'attaque cyan
      { shape: "extrude", profile: [[0.4,0.95],[3.25,-1.2],[3.4,-1.3],[3.4,-1.55],[2.6,-1.42],[0.4,-0.85]], depth: 0.1, bevel: 0.03, pos: [0,0.62,0], rot: [90,0,0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[0.5,-0.52],[2.6,-1.2],[2.6,-1.38],[0.5,-0.78]], depth: 0.02, pos: [0,0.672,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "tube", radius: 0.022, sides: 4, path: [[0.42,0.63,0.93],[3.37,0.63,-1.28]], color: "glow", mirror: true },
      { shape: "sphere", radius: 0.04, pos: [3.36,0.65,-1.42], color: "amber", mirror: true },
      // réacteurs en nacelle : pylône, carène claire, entrée noire, tuyère
      ...([[1.3, -0.4], [2.4, -0.95]] as const).flatMap(([x, z]): Part[] => [
        { shape: "lathe", sides: 10, pos: [x,0.33,z], rot: [90,0,0], color: "light", mirror: true, profile: [[0,-0.6],[0.21,-0.66],[0.26,-0.66],[0.3,-0.4],[0.3,0.35],[0.24,0.66],[0.2,0.58],[0,0.58]] },
        { shape: "cylinder", sides: 10, radius: 0.2, height: 0.02, pos: [x,0.33,z - 0.61], rot: [90,0,0], color: "glow", mirror: true },
        { shape: "cylinder", sides: 10, radius: 0.08, height: 0.12, pos: [x,0.33,z + 0.58], rot: [90,0,0], color: "steel", mirror: true, fine: true },
        { shape: "torus", radius: 0.3, tube: 0.02, sides: 10, pos: [x,0.33,z - 0.2], rot: [90,0,0], color: "dark", mirror: true, fine: true },
      ]),
      // queue : double dérive inclinée, empennage clair
      { shape: "extrude", profile: [[-2.2,0],[-1.35,0],[-1.8,0.85],[-2.15,0.85]], depth: 0.06, bevel: 0.018, pos: [0.4,1.0,0], rot: [-90,-78,-90], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.04,0.36], pos: [0.58,1.82,-1.98], rot: [0,0,-12], color: "glow", mirror: true },
      { shape: "extrude", profile: [[0.3,-1.5],[1.4,-2.05],[1.4,-2.25],[0.3,-2.2]], depth: 0.05, bevel: 0.015, pos: [0,0.74,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "box", size: [0.08,0.04,0.08], pos: [1.8,0.68,-0.2], color: "amber", mirror: true },
    ],
  },
  // frigate : coque effilée sombre à liseré cyan et listeau clair, pont, plage avant d'équipe, tourelle double à
  // frigate : coque effilée sombre à liseré cyan et listeau clair, pont, plage avant d'équipe, tourelle double à
  // frigate : coque effilée sombre à liseré cyan et listeau clair, pont, plage avant d'équipe, tourelle double à
  // frigate : coque effilée sombre à liseré cyan et listeau clair, pont, plage avant d'équipe, tourelle double à
  // l'avant, château d'équipe à passerelle vitrée, cheminée, mât, canots, petite tourelle arrière
  frigate: (() => {
    // contour de coque vu de dessus (x, z) : poupe arrondie, étrave effilée ; z0 ne garde que l'avant
    const coque = (w: number, zs: number, zb: number, lb: number, z0 = -99): [number, number][] => {
      const d: [number, number][] = [[0.78 * w, zs], [0.96 * w, zs + 0.18 * w], [w, zs + 0.5 * w], [w, zb - lb]];
      for (const t of [0.3, 0.55, 0.75, 0.9]) d.push([+(w * (1 - t * t)).toFixed(3), +(zb - lb + lb * t).toFixed(3)]);
      const c = d.filter(([, z]) => z >= z0);
      return [...c, [0, zb], ...c.slice().reverse().map(([x, z]): [number, number] => [-x, z])];
    };
    const caisse: [number, number][] = [[-0.22,-0.2],[0.22,-0.2],[0.24,0.06],[0.12,0.22],[-0.12,0.22],[-0.24,0.06]];
    return {
      parts: [
        // coque, listeau, filet de flottaison, pont, plage avant
        { shape: "extrude", profile: coque(0.64, -2.05, 2.35, 1.3), depth: 0.47, bevel: 0.05, pos: [0,0.265,0], rot: [90,0,0], color: "dark" },
        { shape: "extrude", profile: coque(0.68, -2.07, 2.37, 1.3), depth: 0.05, pos: [0,0.42,0], rot: [90,0,0], color: "light" },
        { shape: "extrude", profile: coque(0.655, -2.06, 2.36, 1.3), depth: 0.03, pos: [0,0.2,0], rot: [90,0,0], color: "glow" },
        { shape: "extrude", profile: coque(0.6, -2.0, 2.24, 1.22), depth: 0.04, pos: [0,0.5,0], rot: [90,0,0], color: "metal" },
        { shape: "extrude", profile: coque(0.6, -2.0, 2.24, 1.22, 1.02), depth: 0.012, pos: [0,0.524,0], rot: [90,0,0], color: "faction" },
        { shape: "box", size: [0.012,0.012,2.75], pos: [0.57,0.58,-0.33], color: "light", mirror: true, fine: true },
        { shape: "box", size: [0.08,0.04,0.12], pos: [0.12,0.54,1.95], color: "dark", mirror: true, fine: true },
        { shape: "box", size: [0.5,0.012,0.04], pos: [0,0.527,-1.95], color: "hazard", fine: true },
        // château d'équipe, passerelle sombre vitrée, toit clair
        { shape: "extrude", profile: [[-0.42,-1.05],[0.42,-1.05],[0.42,-0.22],[0.3,0.02],[-0.3,0.02],[-0.42,-0.22]], depth: 0.42, bevel: 0.03, pos: [0,0.73,0], rot: [90,0,0], color: "faction" },
        { shape: "bevel", size: [0.66,0.24,0.5], pos: [0,1.06,-0.38], bevel: 0.04, color: "dark" },
        { shape: "box", size: [0.52,0.05,0.03], pos: [0,1.1,-0.125], color: "glow" },
        { shape: "box", size: [0.02,0.05,0.36], pos: [0.33,1.1,-0.4], color: "glass", mirror: true, fine: true },
        { shape: "box", size: [0.6,0.03,0.44], pos: [0,1.195,-0.4], color: "light" },
        { shape: "box", size: [0.06,0.04,0.04], pos: [0.4,0.86,0.0], color: "amber", mirror: true },
        // cheminée, mât et radôme
        { shape: "bevel", size: [0.3,0.28,0.4], pos: [0,1.08,-0.82], bevel: 0.05, color: "dark" },
        { shape: "box", size: [0.22,0.02,0.3], pos: [0,1.225,-0.82], color: "black" },
        { shape: "tube", radius: 0.03, sides: 6, path: [[0,1.2,-0.5],[0,1.66,-0.5]], color: "steel" },
        { shape: "box", size: [0.5,0.03,0.04], pos: [0,1.52,-0.5], color: "steel", fine: true },
        { shape: "lathe", sides: 10, pos: [0,1.66,-0.5], color: "light", profile: [[0,-0.09],[0.07,-0.07],[0.09,0],[0.07,0.07],[0,0.09]] },
        { shape: "cylinder", sides: 4, radius: 0.012, height: 0.12, pos: [0,1.76,-0.5], color: "light", fine: true },
        // canots de sauvetage
        { shape: "lathe", sides: 8, pos: [0.5,0.62,-0.62], rot: [90,0,0], scale: [1,1,0.7], color: "light", mirror: true, fine: true, profile: [[0,-0.18],[0.05,-0.16],[0.065,0.0],[0.05,0.15],[0,0.19]] },
        // tourelle avant double (pivot) : couronne, caisse à pans, toit d'équipe, deux tubes
        { shape: "cylinder", sides: 12, radius: 0.3, height: 0.08, bevel: 0.015, pos: [0,0.6,1.0], color: "steel", pivot: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.18, bevel: 0.03, pos: [0,0.73,0.98], rot: [90,0,0], color: "light", parent: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,0.83,0.97], rot: [90,0,0], scale: [0.78,0.78,1], color: "faction", parent: "tourelle" },
        { shape: "box", size: [0.12,0.03,0.03], pos: [0,0.79,1.19], color: "glow", parent: "tourelle" },
        { shape: "lathe", sides: 6, pos: [0.08,0.74,1.16], rot: [90,0,0], color: "steel", mirror: true, parent: "tourelle", profile: [[0,0],[0.035,0],[0.035,0.08],[0.024,0.1],[0.024,0.5],[0,0.5]] },
        { shape: "cylinder", sides: 6, radius: 0.032, height: 0.05, pos: [0.08,0.74,1.64], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle", fine: true },
        // tourelle arrière (pivot) : un tube
        { shape: "cylinder", sides: 12, radius: 0.24, height: 0.08, bevel: 0.015, pos: [0,0.6,-1.6], color: "steel", pivot: "tourelle2" },
        { shape: "extrude", profile: caisse, depth: 0.16, bevel: 0.025, pos: [0,0.72,-1.62], rot: [90,0,0], scale: [0.8,0.8,1], color: "light", parent: "tourelle2" },
        { shape: "extrude", profile: caisse, depth: 0.025, pos: [0,0.81,-1.63], rot: [90,0,0], scale: [0.62,0.62,1], color: "faction", parent: "tourelle2" },
        { shape: "lathe", sides: 6, pos: [0,0.73,-1.45], rot: [90,0,0], color: "steel", parent: "tourelle2", profile: [[0,0],[0.032,0],[0.032,0.07],[0.022,0.09],[0.022,0.44],[0,0.44]] },
      ],
    };
  })(),
  // submarine : coque fuselée aplatie, dôme sonar clair, pont d'équipe à trappes de missiles (une ambre),
  // kiosque profilé à barres de plongée, périscopes et mâts, filet de flottaison cyan, croix de gouvernails,
  // submarine : coque fuselée aplatie, dôme sonar clair, pont d'équipe à trappes de missiles (une ambre),
  // kiosque profilé à barres de plongée, périscopes et mâts, filet de flottaison cyan, croix de gouvernails,
  // submarine : coque fuselée aplatie, dôme sonar clair, pont d'équipe à trappes de missiles (une ambre),
  // kiosque profilé à barres de plongée, périscopes et mâts, filet de flottaison cyan, croix de gouvernails,
  // submarine : coque fuselée aplatie, dôme sonar clair, pont d'équipe à trappes de missiles (une ambre),
  // kiosque profilé à barres de plongée, périscopes et mâts, filet de flottaison cyan, croix de gouvernails,
  // hélice carénée
  submarine: {
    parts: [
      { shape: "lathe", sides: 16, pos: [0,0.4,0], rot: [90,0,0], scale: [1.2,1,0.7], color: "dark", profile: [[0,-2.3],[0.08,-2.25],[0.25,-1.9],[0.42,-1.2],[0.5,-0.4],[0.5,1.2],[0.465,1.72],[0,1.72]] },
      { shape: "lathe", sides: 16, pos: [0,0.4,0], rot: [90,0,0], scale: [1.2,1,0.7], color: "light", profile: [[0,1.7],[0.467,1.7],[0.36,2.05],[0.2,2.3],[0,2.4]] },
      { shape: "tube", radius: 0.016, sides: 4, path: [[0.48,0.4,-1.4],[0.605,0.4,-0.4],[0.605,0.4,1.2],[0.475,0.4,1.95]], color: "glow", mirror: true },
      // pont d'équipe et trappes de lancement
      { shape: "extrude", profile: [[-0.25,-1.7],[0.25,-1.7],[0.34,-1.0],[0.34,1.2],[0.24,1.8],[-0.24,1.8],[-0.34,1.2],[-0.34,-1.0]], depth: 0.08, bevel: 0.025, pos: [0,0.72,0], rot: [90,0,0], color: "faction" },
      ...[-0.5, -0.85, -1.2].map((z, i): Part => ({ shape: "cylinder", sides: 10, radius: 0.08, height: 0.03, pos: [0.15,0.77,z], color: i === 1 ? "amber" : "steel", mirror: true })),
      ...[-0.5, -0.85, -1.2].map((z): Part => ({ shape: "torus", radius: 0.08, tube: 0.012, sides: 10, pos: [0.15,0.775,z], color: "dark", mirror: true, fine: true })),
      { shape: "box", size: [0.03,0.012,1.5], pos: [0,0.766,0.85], color: "dark", fine: true },
      // kiosque profilé : toit clair, vitre, barres de plongée, périscopes et mâts
      { shape: "extrude", profile: [[0,0.75],[0.12,0.6],[0.19,0.35],[0.2,0.0],[0.15,-0.12],[0,-0.16],[-0.15,-0.12],[-0.2,0.0],[-0.19,0.35],[-0.12,0.6]], depth: 0.55, bevel: 0.03, pos: [0,1.0,0], rot: [90,0,0], color: "dark" },
      { shape: "extrude", profile: [[0,0.72],[0.11,0.58],[0.18,0.35],[0.19,0.0],[0.14,-0.1],[-0.14,-0.1],[-0.19,0.0],[-0.18,0.35],[-0.11,0.58]], depth: 0.04, pos: [0,1.28,0], rot: [90,0,0], color: "light" },
      { shape: "box", size: [0.26,0.05,0.03], pos: [0,1.17,0.66], rot: [0,0,0], color: "glow" },
      { shape: "extrude", profile: [[0.18,0.55],[0.44,0.42],[0.44,0.34],[0.18,0.3]], depth: 0.03, pos: [0,1.1,0], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.03, height: 0.34, pos: [0.06,1.45,0.25], color: "steel", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.045, height: 0.05, pos: [0.06,1.6,0.25], color: "dark", mirror: true, fine: true },
      { shape: "box", size: [0.05,0.22,0.08], pos: [0,1.4,0.05], color: "metal" },
      { shape: "sphere", radius: 0.04, pos: [0,1.32,0.5], color: "amber" },
      // gouvernails en croix, hélice carénée
      { shape: "extrude", profile: [[0,-1.55],[0.7,-1.82],[0.7,-1.98],[0,-2.05]], depth: 0.04, bevel: 0.01, pos: [0,0.4,0], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "extrude", profile: [[-2.05,0],[-1.6,0],[-1.86,0.36],[-2.04,0.36]], depth: 0.04, bevel: 0.01, pos: [0,0.64,0], rot: [0,-90,0], color: "faction" },
      { shape: "torus", radius: 0.11, tube: 0.03, sides: 10, pos: [0,0.4,-2.28], rot: [90,0,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.03, pos: [0,0.4,-2.33], rot: [90,0,0], color: "glow" },
      // barres de plongée avant
      { shape: "extrude", profile: [[0.3,1.0],[0.5,0.92],[0.5,0.8],[0.3,0.78]], depth: 0.04, bevel: 0.01, pos: [0,0.55,0], rot: [90,0,0], color: "dark", mirror: true },
    ],
  },
  // destroyer : grande coque sombre à listeau clair et filet cyan, plage avant d'équipe, deux tourelles doubles
  // superposées à l'avant, château clair à passerelle vitrée, mât tripode et radôme, cheminée, canots,
  // tourelle double arrière (fixe)
  destroyer: (() => {
    // contour de coque vu de dessus (x, z) : poupe arrondie, étrave effilée ; z0 ne garde que l'avant
    const coque = (w: number, zs: number, zb: number, lb: number, z0 = -99): [number, number][] => {
      const d: [number, number][] = [[0.78 * w, zs], [0.96 * w, zs + 0.18 * w], [w, zs + 0.5 * w], [w, zb - lb]];
      for (const t of [0.3, 0.55, 0.75, 0.9]) d.push([+(w * (1 - t * t)).toFixed(3), +(zb - lb + lb * t).toFixed(3)]);
      const c = d.filter(([, z]) => z >= z0);
      return [...c, [0, zb], ...c.slice().reverse().map(([x, z]): [number, number] => [-x, z])];
    };
    const caisse: [number, number][] = [[-0.3,-0.3],[0.3,-0.3],[0.33,0.08],[0.17,0.3],[-0.17,0.3],[-0.33,0.08]];
    const tubes = (y: number, z: number, l: number, parent?: string): Part[] => [
      { shape: "cylinder", sides: 6, radius: 0.032, height: l, pos: [0.11,y,z + l / 2], rot: [90,0,0], color: "steel", mirror: true, parent },
      { shape: "cylinder", sides: 6, radius: 0.046, height: 0.14, pos: [0.11,y,z + 0.07], rot: [90,0,0], color: "steel", mirror: true, parent, fine: true },
      { shape: "cylinder", sides: 6, radius: 0.04, height: 0.05, pos: [0.11,y,z + l - 0.02], rot: [90,0,0], color: "dark", mirror: true, parent, fine: true },
    ];
    return {
      parts: [
        // coque, listeau, filet de flottaison, pont, plage avant
        { shape: "extrude", profile: coque(0.84, -3.25, 3.3, 1.9), depth: 0.58, bevel: 0.06, pos: [0,0.31,0], rot: [90,0,0], color: "dark" },
        { shape: "extrude", profile: coque(0.87, -3.27, 3.32, 1.9), depth: 0.05, pos: [0,0.5,0], rot: [90,0,0], color: "light" },
        { shape: "extrude", profile: coque(0.855, -3.26, 3.31, 1.9), depth: 0.03, pos: [0,0.24,0], rot: [90,0,0], color: "glow" },
        { shape: "extrude", profile: coque(0.79, -3.2, 3.18, 1.8), depth: 0.04, pos: [0,0.6,0], rot: [90,0,0], color: "metal" },
        { shape: "extrude", profile: coque(0.79, -3.2, 3.18, 1.8, 1.38), depth: 0.012, pos: [0,0.624,0], rot: [90,0,0], color: "faction" },
        { shape: "box", size: [0.3,0.012,2.0], pos: [0.55,0.626,-1.9], color: "faction", mirror: true },
        { shape: "box", size: [0.014,0.014,4.25], pos: [0.765,0.68,-0.725], color: "light", mirror: true, fine: true },
        { shape: "box", size: [0.1,0.05,0.14], pos: [0.16,0.64,2.75], color: "dark", mirror: true, fine: true },
        // château clair, passerelle sombre, vitrage cyan
        { shape: "extrude", profile: [[-0.62,-1.5],[0.62,-1.5],[0.62,-0.3],[0.45,0.06],[-0.45,0.06],[-0.62,-0.3]], depth: 0.6, bevel: 0.04, pos: [0,0.9,0], rot: [90,0,0], color: "light" },
        { shape: "extrude", profile: [[-0.45,-1.25],[0.45,-1.25],[0.45,-0.45],[0.3,-0.25],[-0.3,-0.25],[-0.45,-0.45]], depth: 0.4, bevel: 0.03, pos: [0,1.4,0], rot: [90,0,0], color: "dark" },
        { shape: "box", size: [0.58,0.06,0.03], pos: [0,1.48,-0.255], color: "glow" },
        { shape: "box", size: [0.03,0.06,0.18], rot: [0,-50,0], pos: [0.38,1.48,-0.34], color: "glow", mirror: true },
        { shape: "box", size: [0.7,0.03,0.8], pos: [0,1.615,-0.82], color: "light" },
        { shape: "box", size: [0.08,0.05,0.04], pos: [0.5,1.1,0.06], color: "amber", mirror: true },
        // mât tripode, vergue, radôme
        { shape: "tube", radius: 0.035, sides: 6, path: [[0,1.6,-0.9],[0,2.38,-0.9]], color: "steel" },
        { shape: "tube", radius: 0.022, sides: 4, path: [[0.25,1.6,-1.15],[0,2.1,-0.92]], color: "steel", mirror: true, fine: true },
        { shape: "box", size: [0.6,0.04,0.06], pos: [0,2.2,-0.9], color: "steel" },
        { shape: "lathe", sides: 10, pos: [0,1.78,-1.1], color: "light", profile: [[0,-0.15],[0.11,-0.11],[0.15,0],[0.11,0.11],[0,0.15]] },
        // cheminée, canots
        { shape: "extrude", profile: [[-0.18,-2.1],[0.18,-2.1],[0.25,-1.9],[0.2,-1.66],[-0.2,-1.66],[-0.25,-1.9]], depth: 0.5, bevel: 0.03, pos: [0,0.85,0], rot: [90,0,0], color: "dark" },
        { shape: "extrude", profile: [[-0.15,-2.06],[0.15,-2.06],[0.21,-1.9],[0.17,-1.7],[-0.17,-1.7],[-0.21,-1.9]], depth: 0.02, pos: [0,1.105,0], rot: [90,0,0], color: "black" },
        { shape: "box", size: [0.42,0.03,0.03], pos: [0,1.0,-1.65], color: "glow" },
        { shape: "lathe", sides: 8, pos: [0.71,0.74,-0.9], rot: [90,0,0], scale: [1,1,0.7], color: "light", mirror: true, fine: true, profile: [[0,-0.25],[0.06,-0.22],[0.075,0.0],[0.06,0.2],[0,0.25]] },
        // tourelle avant (pivot)
        { shape: "cylinder", sides: 12, radius: 0.4, height: 0.08, bevel: 0.015, pos: [0,0.66,1.7], color: "steel", pivot: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.26, bevel: 0.04, pos: [0,0.83,1.65], rot: [90,0,0], color: "light", parent: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,0.975,1.64], rot: [90,0,0], scale: [0.78,0.78,1], color: "faction", parent: "tourelle" },
        { shape: "box", size: [0.14,0.04,0.03], pos: [0,0.9,1.95], color: "glow", parent: "tourelle" },
        ...tubes(0.84, 1.9, 0.87, "tourelle"),
        // tourelle surélevée (pivot) sur barbette
        { shape: "cylinder", sides: 12, radius: 0.4, height: 0.16, pos: [0,0.68,0.6], color: "dark" },
        { shape: "cylinder", sides: 12, radius: 0.38, height: 0.08, bevel: 0.015, pos: [0,0.76,0.6], color: "steel", pivot: "tourelle2" },
        { shape: "extrude", profile: caisse, depth: 0.26, bevel: 0.04, pos: [0,0.93,0.55], rot: [90,0,0], scale: [0.95,0.95,1], color: "light", parent: "tourelle2" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,1.075,0.54], rot: [90,0,0], scale: [0.74,0.74,1], color: "faction", parent: "tourelle2" },
        { shape: "box", size: [0.14,0.04,0.03], pos: [0,1.0,0.84], color: "glow", parent: "tourelle2" },
        ...tubes(1.0, 0.8, 0.55, "tourelle2"),
        // tourelle arrière (fixe), tubes vers l'arrière
        { shape: "cylinder", sides: 12, radius: 0.36, height: 0.08, bevel: 0.015, pos: [0,0.66,-2.6], color: "steel" },
        { shape: "extrude", profile: caisse, depth: 0.24, bevel: 0.04, pos: [0,0.82,-2.62], rot: [-90,0,0], scale: [0.9,0.9,1], color: "light" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,0.955,-2.61], rot: [-90,0,0], scale: [0.7,0.7,1], color: "faction" },
        { shape: "cylinder", sides: 6, radius: 0.032, height: 0.76, pos: [0.1,0.83,-3.22], rot: [90,0,0], color: "steel", mirror: true },
        { shape: "cylinder", sides: 6, radius: 0.046, height: 0.14, pos: [0.1,0.83,-2.91], rot: [90,0,0], color: "steel", mirror: true, fine: true },
      ],
    };
  })(),
  // missile_cruiser : grande coque sombre à listeau clair et filet cyan, plage avant d'équipe, bloc de lancement
  // vertical à 16 trappes (une ambre), château clair à panneaux radar et passerelle vitrée, radar tournant en
  // missile_cruiser : grande coque sombre à listeau clair et filet cyan, plage avant d'équipe, bloc de lancement
  // vertical à 16 trappes (une ambre), château clair à panneaux radar et passerelle vitrée, radar tournant en
  // missile_cruiser : grande coque sombre à listeau clair et filet cyan, plage avant d'équipe, bloc de lancement
  // vertical à 16 trappes (une ambre), château clair à panneaux radar et passerelle vitrée, radar tournant en
  // missile_cruiser : grande coque sombre à listeau clair et filet cyan, plage avant d'équipe, bloc de lancement
  // vertical à 16 trappes (une ambre), château clair à panneaux radar et passerelle vitrée, radar tournant en
  // soucoupe à anneau cyan, canon avant, bloc arrière à trappes rouges
  missile_cruiser: (() => {
    // contour de coque vu de dessus (x, z) : poupe arrondie, étrave effilée ; z0 ne garde que l'avant
    const coque = (w: number, zs: number, zb: number, lb: number, z0 = -99): [number, number][] => {
      const d: [number, number][] = [[0.78 * w, zs], [0.96 * w, zs + 0.18 * w], [w, zs + 0.5 * w], [w, zb - lb]];
      for (const t of [0.3, 0.55, 0.75, 0.9]) d.push([+(w * (1 - t * t)).toFixed(3), +(zb - lb + lb * t).toFixed(3)]);
      const c = d.filter(([, z]) => z >= z0);
      return [...c, [0, zb], ...c.slice().reverse().map(([x, z]): [number, number] => [-x, z])];
    };
    const caisse: [number, number][] = [[-0.26,-0.26],[0.26,-0.26],[0.29,0.06],[0.14,0.27],[-0.14,0.27],[-0.29,0.06]];
    return {
      parts: [
        { shape: "extrude", profile: coque(0.92, -2.9, 3.2, 1.9), depth: 0.58, bevel: 0.06, pos: [0,0.31,0], rot: [90,0,0], color: "dark" },
        { shape: "extrude", profile: coque(0.955, -2.92, 3.22, 1.9), depth: 0.05, pos: [0,0.5,0], rot: [90,0,0], color: "light" },
        { shape: "extrude", profile: coque(0.935, -2.91, 3.21, 1.9), depth: 0.03, pos: [0,0.24,0], rot: [90,0,0], color: "glow" },
        { shape: "extrude", profile: coque(0.87, -2.85, 3.08, 1.8), depth: 0.04, pos: [0,0.6,0], rot: [90,0,0], color: "metal" },
        { shape: "extrude", profile: coque(0.87, -2.85, 3.08, 1.8, 1.28), depth: 0.012, pos: [0,0.624,0], rot: [90,0,0], color: "faction" },
        { shape: "box", size: [0.2,0.012,3.2], pos: [0.7,0.626,-0.9], color: "faction", mirror: true },
        { shape: "box", size: [0.014,0.014,3.75], pos: [0.845,0.68,-0.575], color: "light", mirror: true, fine: true },
        // bloc de lancement vertical avant : 4 x 4 trappes
        { shape: "box", size: [1.2,0.26,1.4], pos: [0,0.72,0.7], color: "dark" },
        { shape: "box", size: [1.1,0.02,1.3], pos: [0,0.855,0.7], color: "black" },
        ...[0.25, 0.55, 0.85, 1.15].flatMap((z): Part[] => [0.13, 0.39].map((x): Part => ({ shape: "box", size: [0.22,0.03,0.26], pos: [x,0.87,z], color: z === 0.85 && x === 0.39 ? "amber" : "steel", mirror: true }))),
        { shape: "box", size: [0.03,0.02,1.24], pos: [0,0.875,0.7], color: "glow" },
        // bloc arrière : trappes rouges
        { shape: "box", size: [1.0,0.24,0.9], pos: [0,0.72,-2.3], color: "dark" },
        ...[-2.15, -2.45].map((z): Part => ({ shape: "box", size: [0.22,0.03,0.24], pos: [0.2,0.855,z], color: "red", mirror: true })),
        // château, panneaux radar, passerelle, vitrage
        { shape: "extrude", profile: [[-0.62,-1.75],[0.62,-1.75],[0.62,-0.75],[0.45,-0.45],[-0.45,-0.45],[-0.62,-0.75]], depth: 0.6, bevel: 0.04, pos: [0,0.9,0], rot: [90,0,0], color: "light" },
        { shape: "extrude", profile: [[-0.42,-1.55],[0.42,-1.55],[0.42,-0.95],[0.3,-0.75],[-0.3,-0.75],[-0.42,-0.95]], depth: 0.4, bevel: 0.03, pos: [0,1.4,0], rot: [90,0,0], color: "dark" },
        { shape: "box", size: [0.52,0.06,0.03], pos: [0,1.48,-0.755], color: "glow" },
        { shape: "box", size: [0.3,0.3,0.03], pos: [0.44,1.0,-0.58], rot: [0,56,0], color: "dark", mirror: true },
        { shape: "box", size: [0.03,0.3,0.3], pos: [0.625,1.0,-1.3], color: "dark", mirror: true },
        { shape: "box", size: [0.08,0.06,0.04], pos: [0.45,1.1,-0.44], color: "amber", mirror: true },
        { shape: "box", size: [0.6,0.03,0.6], pos: [0,1.615,-1.15], color: "light" },
        // mât et radar tournant
        { shape: "cylinder", sides: 8, radius: 0.06, height: 0.56, pos: [0,1.88,-1.2], color: "steel" },
        { shape: "tube", radius: 0.02, sides: 4, path: [[0.22,1.6,-1.0],[0,1.98,-1.18]], color: "steel", mirror: true, fine: true },
        { shape: "box", size: [0.5,0.03,0.05], pos: [0,1.98,-1.2], color: "steel", fine: true },
        { shape: "lathe", sides: 16, pos: [0,2.18,-1.2], color: "light", pivot: "radar", profile: [[0,-0.04],[0.12,-0.04],[0.4,-0.005],[0.4,0.015],[0.12,0.045],[0,0.05]] },
        { shape: "lathe", sides: 16, profile: [[0.405,-0.008],[0.405,0.018]], pos: [0,2.18,-1.2], color: "glow", parent: "radar" },
        { shape: "box", size: [0.5,0.03,0.06], pos: [0,2.225,-1.2], color: "dark", parent: "radar" },
        // canon avant (pivot)
        { shape: "cylinder", sides: 12, radius: 0.34, height: 0.08, bevel: 0.015, pos: [0,0.66,1.85], color: "steel", pivot: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.24, bevel: 0.04, pos: [0,0.82,1.82], rot: [90,0,0], color: "light", parent: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,0.955,1.81], rot: [90,0,0], scale: [0.76,0.76,1], color: "faction", parent: "tourelle" },
        { shape: "lathe", sides: 8, pos: [0,0.84,2.05], rot: [90,0,0], color: "steel", parent: "tourelle", profile: [[0,0],[0.06,0],[0.06,0.12],[0.042,0.16],[0.042,0.75],[0,0.75]] },
        { shape: "cylinder", sides: 8, radius: 0.056, height: 0.08, pos: [0,0.84,2.75], rot: [90,0,0], color: "dark", parent: "tourelle", fine: true },
      ],
    };
  })(),
  // guardian : char moyen de ligne, glacis avant très épais couvert de blindage réactif, tourelle trapue à canon
  // moyen ; chenilles détaillées, garde-chenilles, tourelle à pans à tourelleau, fût d'acier à évacuateur et
  // frein de bouche ; pièces fines : boulons des briques réactives, grilles, lance-fumigènes
  guardian: {
    parts: [
      { use: "chenille_d", pos: [1.02, 0, 0], scale: [1.0, 1.04, 1.13], mirror: true },
      { shape: "extrude", profile: [[-1.3, 0.53], [1.2, 0.53], [1.3, 0.58], [1.2, 0.62], [-1.25, 0.62]], depth: 0.58, bevel: 0.02, pos: [1.02, 0, 0], rot: [0, -90, 0], color: "light", mirror: true },
      // caisse, plage moteur à grilles et filet cyan, échappements
      { shape: "extrude", profile: [[-1.4, 0.38], [0.9, 0.38], [1.0, 0.6], [0.9, 0.85], [-1.3, 0.85], [-1.4, 0.65]], depth: 1.56, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "box", size: [1.2, 0.06, 0.55], pos: [0, 0.88, -1.1], color: "metal" },
      ...[-0.92, -1.04, -1.16, -1.28].map((z): Part => ({ shape: "box", size: [0.9, 0.02, 0.05], pos: [0, 0.92, z], color: "black", fine: true })),
      { shape: "box", size: [0.8, 0.03, 0.05], pos: [0, 0.925, -0.8], color: "glow" },
      { shape: "cylinder", sides: 10, radius: 0.05, height: 0.14, pos: [0.55, 0.9, -1.24], color: "steel", mirror: true },
      // glacis épais et blindage réactif (avant et avant des flancs)
      { shape: "wedge", size: [2.1, 0.62, 0.9], pos: [0, 0.62, 1.35], color: "dark" },
      incl([0.26, 0.93, 0.9], -34.6, 0.3, 0.045, { shape: "box", size: [0.4, 0.09, 0.32], color: "light", mirror: true }),
      incl([0.72, 0.93, 0.9], -34.6, 0.3, 0.045, { shape: "box", size: [0.4, 0.09, 0.32], color: "light", mirror: true }),
      incl([0.26, 0.93, 0.9], -34.6, 0.74, 0.045, { shape: "box", size: [0.4, 0.09, 0.32], color: "light", mirror: true }),
      incl([0.72, 0.93, 0.9], -34.6, 0.74, 0.045, { shape: "box", size: [0.4, 0.09, 0.32], color: "light", mirror: true }),
      ...[0.3, 0.74].flatMap((d) => [0.26, 0.72].map((x): Part => incl([x, 0.93, 0.9], -34.6, d, 0.1, { shape: "cylinder", sides: 6, radius: 0.025, height: 0.02, color: "steel", mirror: true, fine: true }))),
      { shape: "box", size: [0.06, 0.3, 1.15], pos: [1.33, 0.42, 0.68], color: "dark", mirror: true },
      { shape: "box", size: [0.07, 0.2, 0.3], pos: [1.395, 0.44, 0.45], color: "light", mirror: true },
      { shape: "box", size: [0.07, 0.2, 0.3], pos: [1.395, 0.44, 0.95], color: "light", mirror: true },
      { shape: "box", size: [0.12, 0.06, 0.04], pos: [0.85, 0.42, 1.68], color: "amber", mirror: true },
      // tourelle trapue à pans (pivot), avant clair, flancs à filet cyan
      { shape: "extrude", profile: [[-0.6, -0.65], [0.6, -0.65], [0.66, -0.3], [0.62, 0.4], [0.4, 0.66], [-0.4, 0.66], [-0.62, 0.4], [-0.66, -0.3]], depth: 0.44, bevel: 0.05, pos: [0, 1.08, -0.25], rot: [90, 0, 0], color: "faction", pivot: "tourelle" },
      { shape: "wedge", size: [1.0, 0.3, 0.34], pos: [0, 1.02, 0.56], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.1, 0.34, 0.95], pos: [0.68, 1.06, -0.3], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03, 0.04, 0.7], pos: [0.735, 1.1, -0.3], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.42, 0.06, 0.36], pos: [0.15, 1.32, -0.62], color: "dark", parent: "tourelle" },
      ...[-0.54, -0.62, -0.7].map((z): Part => ({ shape: "box", size: [0.36, 0.015, 0.035], pos: [0.15, 1.355, z], color: "black", parent: "tourelle", fine: true })),
      // tourelleau à épiscopes et trappe
      { shape: "cylinder", sides: 10, radius: 0.16, height: 0.06, bevel: 0.015, pos: [-0.28, 1.32, -0.35], color: "light", parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.165, height: 0.025, pos: [-0.28, 1.3, -0.35], color: "glass", parent: "tourelle" },
      { shape: "box", size: [0.08, 0.05, 0.05], pos: [0.32, 1.32, 0.2], color: "amber", parent: "tourelle" },
      // masque et canon d'acier : évacuateur de fumées, frein de bouche
      { shape: "bevel", size: [0.34, 0.3, 0.34], pos: [0, 1.08, 0.72], bevel: 0.05, color: "dark", parent: "tourelle" },
      { shape: "lathe", sides: 10, pos: [0, 1.08, 0.85], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: lcFut(0.1, 1.48) },
      { shape: "cylinder", sides: 10, radius: 0.135, height: 0.2, pos: [0, 1.08, 1.45], rot: [90, 0, 0], color: "steel", parent: "tourelle" },
      // lance-fumigènes
      ...[0, 1].map((i): Part => ({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.14, pos: [0.6, 1.2, 0.1 - i * 0.1], rot: [-60, 0, -25], color: "dark", mirror: true, parent: "tourelle", fine: true })),
    ],
  },
  // rocket_battery : porteur à six roues, cabine avant, caisson lance-roquettes incliné à 4 x 4 tubes sur affût
  // tournant ; roues à pneus, cabine profilée à pare-brise, couronne d'acier, caisson d'équipe à grille claire ;
  // pièces fines : ogives des roquettes, rétroviseurs, gyrophare, vérins
  rocket_battery: {
    parts: [
      ...lcRoues(0.72, 0.32, 1.0, 0.32, 0.28),
      ...lcRoues(0.72, 0.32, 0.05, 0.32, 0.28),
      ...lcRoues(0.72, 0.32, -0.9, 0.32, 0.28),
      // châssis, cabine claire à pare-brise, plateau d'équipe
      { shape: "extrude", profile: [[-1.48, 0.38], [1.4, 0.38], [1.5, 0.56], [1.42, 0.72], [-1.42, 0.72], [-1.5, 0.54]], depth: 1.32, bevel: 0.03, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.62, 0.68], [1.46, 0.68], [1.5, 0.92], [1.38, 1.24], [0.64, 1.28]], depth: 1.34, bevel: 0.04, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [1.06, 0.26, 0.02], pos: [0, 1.085, 1.454], rot: [-20.6, 0, 0], color: "glass" },
      { shape: "box", size: [0.9, 0.03, 0.4], pos: [0, 1.29, 0.98], color: "faction" },
      { shape: "box", size: [0.06, 0.1, 0.03], pos: [0.54, 0.8, 1.48], color: "glow", mirror: true },
      { shape: "box", size: [0.1, 0.05, 0.08], pos: [-0.3, 1.32, 0.78], color: "amber", fine: true },
      { shape: "box", size: [0.04, 0.12, 0.08], pos: [0.72, 1.06, 1.26], color: "dark", mirror: true, fine: true },
      { shape: "extrude", profile: [[-1.48, 0.7], [0.6, 0.7], [0.6, 0.9], [-1.48, 0.9]], depth: 1.24, rot: [0, -90, 0], color: "faction" },
      { shape: "box", size: [0.03, 0.05, 2.0], pos: [0.675, 0.6, -0.1], color: "glow", mirror: true },
      // affût : couronne d'acier (pivot), bras de levage
      { shape: "cylinder", sides: 12, radius: 0.42, height: 0.2, bevel: 0.03, pos: [0, 1.02, -0.65], color: "steel", pivot: "tourelle" },
      { shape: "box", size: [0.1, 0.36, 0.14], pos: [0.4, 1.28, -0.5], color: "light", mirror: true, parent: "tourelle" },
      { shape: "tube", radius: 0.04, sides: 6, path: [[0.25, 1.1, -0.3], [0.25, 1.52, -0.45]], color: "steel", mirror: true, parent: "tourelle", fine: true },
      // caisson à roquettes : coffre d'équipe, flancs clairs, face avant à grille, ogives
      incl([0, 1.2, -1.05], 24, 0.625, 0.37, { shape: "box", size: [1.2, 0.74, 1.25], color: "faction", parent: "tourelle" }),
      incl([0.62, 1.2, -1.05], 24, 0.625, 0.37, { shape: "box", size: [0.06, 0.6, 1.1], color: "light", mirror: true, parent: "tourelle" }),
      incl([0, 1.2, -1.05], 24, 0.625, 0.745, { shape: "box", size: [0.8, 0.02, 0.9], color: "light", parent: "tourelle" }),
      incl([0, 1.2, -1.05], 24, 0.4, 0.765, { shape: "box", size: [0.08, 0.03, 0.08], color: "amber", parent: "tourelle" }),
      incl([0, 1.2, -1.05], 24, 1.265, 0.37, { shape: "box", size: [1.14, 0.7, 0.03], color: "light", parent: "tourelle" }),
      incl([0, 1.2, -1.05], 24, 1.285, 0.37, { shape: "box", size: [1.06, 0.62, 0.02], color: "black", parent: "tourelle" }),
      ...[0.205, 0.375, 0.545].map((h): Part => incl([0, 1.2, -1.05], 24, 1.29, h, { shape: "box", size: [1.06, 0.035, 0.02], color: "light", parent: "tourelle" })),
      ...[0, 0.3].map((x): Part => incl([x, 1.2, -1.05], 24, 1.29, 0.37, { shape: "box", size: [0.035, 0.62, 0.02], color: "light", mirror: x > 0, parent: "tourelle" })),
      ...[0.12, 0.29, 0.46, 0.63].flatMap((h) =>
        [0.15, 0.44].map((x) => incl([x, 1.2, -1.05], 24, 1.32, h, { shape: "cone", sides: 6, radius: 0.055, height: 0.09, rot: [90, 0, 0], color: "light", mirror: true, parent: "tourelle", fine: true })),
      ),
    ],
  },
  // commando : robot furtif élancé et anguleux, sombre à filets cyan, visière, charges explosives dans le dos,
  // fusil fin ; jambes et torse profilés à arêtes vives, épaulières d'équipe ; pièces fines : lunette, silencieux,
  // détonateurs, antenne
  commando: {
    parts: [
      // jambes articulées (pivots à la hanche) et bassin
      ...[1, -1].flatMap((s): Part[] => {
        const pv = s > 0 ? "jambe_d" : "jambe_g";
        const x = s * 0.11;
        return [
          { shape: "cylinder", sides: 8, radius: 0.05, height: 0.12, pos: [x, 0.74, 0], rot: [0, 0, 90], color: "steel", pivot: pv },
          { shape: "extrude", profile: [[-0.07, 0.46], [0.06, 0.46], [0.08, 0.62], [0.05, 0.74], [-0.06, 0.74], [-0.08, 0.6]], depth: 0.1, pos: [x, 0, -0.01], rot: [0, -90, 0], color: "black", parent: pv },
          { shape: "extrude", profile: [[0.0, 0.36], [0.1, 0.38], [0.13, 0.46], [0.03, 0.52]], depth: 0.11, pos: [x, 0, 0], rot: [0, -90, 0], color: "dark", parent: pv },
          { shape: "extrude", profile: [[-0.08, 0.06], [0.08, 0.06], [0.09, 0.22], [0.04, 0.4], [-0.06, 0.4], [-0.09, 0.22]], depth: 0.12, bevel: 0.01, pos: [x, 0, 0.01], rot: [0, -90, 0], color: "dark", parent: pv },
          { shape: "box", size: [0.025, 0.2, 0.02], pos: [x, 0.25, 0.1], color: "glow", parent: pv },
          { shape: "wedge", size: [0.15, 0.08, 0.28], pos: [x, 0.04, 0.05], color: "black", parent: pv },
        ];
      }),
      { shape: "extrude", profile: [[-0.14, 0.72], [0.14, 0.72], [0.16, 0.78], [0.1, 0.83], [-0.1, 0.83], [-0.16, 0.78]], depth: 0.18, color: "dark" },
      // haut du corps (pivot torse) : torse à pans, filets cyan, épaulières d'équipe
      { shape: "extrude", profile: [[-0.15, -0.18], [0.15, -0.18], [0.2, 0.08], [0.14, 0.18], [-0.14, 0.18], [-0.2, 0.08]], depth: 0.24, bevel: 0.02, pos: [0, 1.0, 0], color: "dark", pivot: "torse" },
      { shape: "box", size: [0.025, 0.18, 0.02], pos: [0.1, 1.0, 0.135], color: "glow", mirror: true, parent: "torse" },
      { shape: "box", size: [0.14, 0.08, 0.22], pos: [0.26, 1.16, 0], rot: [0, 0, -15], color: "faction", mirror: true, parent: "torse" },
      { shape: "box", size: [0.07, 0.28, 0.09], pos: [0.27, 0.98, 0], color: "black", mirror: true, parent: "torse" },
      // tête à visière et crête
      { shape: "extrude", profile: [[-0.06, -0.075], [0.06, -0.075], [0.075, 0.0], [0.05, 0.07], [-0.05, 0.07], [-0.075, 0.0]], depth: 0.17, bevel: 0.01, pos: [0, 1.27, 0.01], color: "dark", parent: "torse" },
      { shape: "box", size: [0.12, 0.035, 0.02], pos: [0, 1.29, 0.105], color: "glow", parent: "torse" },
      { shape: "wedge", size: [0.05, 0.07, 0.2], pos: [0, 1.38, -0.01], color: "black", parent: "torse" },
      // fusil fin tenu à deux mains : carcasse, canon d'acier, silencieux, lunette
      { shape: "box", size: [0.07, 0.07, 0.24], pos: [0.25, 0.86, 0.12], color: "black", parent: "torse" },
      { shape: "box", size: [0.07, 0.07, 0.26], pos: [-0.16, 0.9, 0.18], rot: [0, 35, 0], color: "black", parent: "torse" },
      { shape: "extrude", profile: [[0.04, 0.86], [0.6, 0.875], [0.62, 0.925], [0.22, 0.94], [0.04, 0.93]], depth: 0.045, pos: [0.17, 0, 0], rot: [0, -90, 0], color: "dark", parent: "torse" },
      { shape: "cylinder", sides: 6, radius: 0.014, height: 0.32, pos: [0.17, 0.905, 0.77], rot: [90, 0, 0], color: "steel", parent: "torse" },
      { shape: "cylinder", sides: 8, radius: 0.024, height: 0.12, pos: [0.17, 0.905, 0.86], rot: [90, 0, 0], color: "black", parent: "torse", fine: true },
      { shape: "box", size: [0.025, 0.03, 0.12], pos: [0.17, 0.955, 0.34], color: "glow", parent: "torse" },
      { shape: "cylinder", sides: 6, radius: 0.018, height: 0.14, pos: [0.17, 0.97, 0.2], rot: [90, 0, 0], color: "black", parent: "torse", fine: true },
      // sac de charges explosives, détonateurs, antenne
      { shape: "box", size: [0.28, 0.26, 0.1], pos: [0, 1.02, -0.17], color: "dark", parent: "torse" },
      { shape: "box", size: [0.08, 0.11, 0.07], pos: [0.09, 1.0, -0.255], color: "hazard", mirror: true, parent: "torse" },
      { shape: "box", size: [0.08, 0.11, 0.07], pos: [0, 1.0, -0.255], color: "amber", parent: "torse" },
      { shape: "box", size: [0.26, 0.015, 0.075], pos: [0, 1.0, -0.255], color: "black", parent: "torse", fine: true },
      { shape: "tube", radius: 0.008, sides: 4, path: [[-0.1, 1.15, -0.2], [-0.1, 1.4, -0.21]], color: "metal", parent: "torse", fine: true },
    ],
  },
  // jammer : véhicule à quatre roues, mât d'antennes, panneau de brouillage orientable à grille cyan ; roues à
  // pneus et garde-boue, coffre d'équipe, mât d'acier haubané, chape d'acier du panneau ;
  // pièces fines : fouets d'antenne, haubans, émetteurs du panneau, ouïes
  jammer: {
    parts: [
      { use: "roue_d", pos: [0.76, 0.34, 0.75], scale: [0.75, 0.68, 0.68], mirror: true },
      { use: "roue_d", pos: [0.76, 0.34, -0.75], scale: [0.75, 0.68, 0.68], mirror: true },
      lcGardeBoue(0.76, 0.34, 0.75, 0.34, 0.3),
      lcGardeBoue(0.76, 0.34, -0.75, 0.34, 0.3),
      // caisse, cabine claire à pare-brise, coffre d'équipe
      { shape: "extrude", profile: [[-1.12, 0.38], [1.04, 0.38], [1.14, 0.56], [1.08, 0.76], [-1.08, 0.78], [-1.15, 0.58]], depth: 1.3, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[0.34, 0.72], [1.1, 0.72], [1.15, 0.84], [1.0, 0.98], [0.36, 0.99]], depth: 1.42, bevel: 0.04, rot: [0, -90, 0], color: "light" },
      { shape: "box", size: [1.0, 0.16, 0.02], pos: [0, 0.92, 1.085], rot: [-47, 0, 0], color: "glass" },
      { shape: "extrude", profile: [[-1.1, 0.76], [0.2, 0.76], [0.22, 1.0], [0.12, 1.04], [-1.0, 1.04], [-1.1, 0.96]], depth: 1.2, bevel: 0.04, rot: [0, -90, 0], color: "faction" },
      ...[-0.15, -0.3, -0.45].map((z): Part => ({ shape: "box", size: [0.03, 0.16, 0.08], pos: [0.615, 0.9, z], color: "black", mirror: true, fine: true })),
      { shape: "box", size: [0.03, 0.05, 0.6], pos: [0.665, 0.6, 0], color: "glow", mirror: true },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [0.5, 0.72, 1.12], color: "amber", mirror: true },
      // mât d'acier haubané (arrière gauche) : traverses, balise cyan, fouets
      { shape: "box", size: [0.2, 0.08, 0.2], pos: [-0.45, 1.08, -0.9], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.05, height: 1.4, pos: [-0.45, 1.75, -0.9], color: "steel" },
      { shape: "box", size: [0.7, 0.04, 0.04], pos: [-0.45, 2.0, -0.9], color: "light" },
      { shape: "box", size: [0.46, 0.04, 0.04], pos: [-0.45, 2.3, -0.9], color: "light" },
      { shape: "sphere", radius: 0.07, pos: [-0.45, 2.48, -0.9], color: "glow" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.8, 2.0, -0.9], [-0.8, 2.38, -0.9]], color: "light", fine: true },
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.1, 2.0, -0.9], [-0.1, 2.38, -0.9]], color: "light", fine: true },
      { shape: "tube", radius: 0.008, sides: 4, path: [[-0.45, 2.2, -0.9], [-0.05, 1.04, -0.5]], color: "metal", fine: true },
      { shape: "tube", radius: 0.008, sides: 4, path: [[-0.45, 2.2, -0.9], [-0.85, 1.04, -0.5]], color: "metal", fine: true },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0.45, 1.04, -0.95], [0.45, 1.72, -0.95]], color: "light", fine: true },
      { shape: "sphere", radius: 0.04, pos: [0.45, 1.74, -0.95], color: "amber", fine: true },
      // panneau de brouillage orientable (pivot) : couronne, fût, chape d'acier, cadre d'équipe, grille cyan
      { shape: "cylinder", sides: 10, radius: 0.3, height: 0.14, bevel: 0.02, pos: [0.15, 1.1, -0.2], color: "steel", pivot: "tourelle" },
      { shape: "box", size: [0.12, 0.42, 0.12], pos: [0.15, 1.38, -0.2], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.5, 0.06, 0.08], pos: [0.15, 1.6, -0.2], color: "steel", parent: "tourelle" },
      incl([0.15, 1.85, -0.15], 20, -0.05, 0, { shape: "box", size: [1.06, 0.72, 0.04], color: "faction", parent: "tourelle" }),
      incl([0.15, 1.85, -0.15], 20, 0, 0, { shape: "box", size: [0.98, 0.64, 0.06], color: "dark", parent: "tourelle" }),
      ...[-0.2, 0, 0.2].map((h): Part => incl([0.15, 1.85, -0.15], 20, 0.035, h, { shape: "box", size: [0.86, 0.03, 0.02], color: "glow", parent: "tourelle" })),
      ...[-0.15, 0.45].map((x): Part => incl([x, 1.85, -0.15], 20, 0.035, 0, { shape: "box", size: [0.03, 0.56, 0.02], color: "glow", parent: "tourelle" })),
      ...[-0.25, 0.15, 0.55].flatMap((x) => [-0.1, 0.1].map((h): Part => incl([x, 1.85, -0.15], 20, 0.06, h, { shape: "cylinder", sides: 6, radius: 0.035, height: 0.05, rot: [90, 0, 0], color: "steel", parent: "tourelle", fine: true }))),
    ],
  },
  // deploy_turret : forteresse chenillée, quatre bras stabilisateurs repliés à vérins, grosse tourelle à double
  // canon plasma ; chenilles détaillées, couronne d'acier, tourelle à pans, fûts clairs à anneaux lumineux ;
  // pièces fines : vérins, grilles, câbles
  deploy_turret: {
    parts: [
      { use: "chenille_d", pos: [1.1, 0, 0], scale: [1.12, 1.12, 1.217], mirror: true },
      { shape: "extrude", profile: [[-1.38, 0.57], [1.34, 0.57], [1.42, 0.62], [1.34, 0.67], [-1.34, 0.67], [-1.42, 0.62]], depth: 0.62, bevel: 0.02, pos: [1.1, 0, 0], rot: [0, -90, 0], color: "light", mirror: true },
      // caisse, étrave claire, plage arrière
      { shape: "extrude", profile: [[-1.35, 0.4], [1.2, 0.4], [1.42, 0.62], [1.25, 0.92], [-1.25, 0.92], [-1.38, 0.7]], depth: 1.62, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "wedge", size: [1.7, 0.3, 0.5], pos: [0, 0.68, 1.55], color: "light" },
      ...[-1.0, -1.1, -1.2].map((z): Part => ({ shape: "box", size: [0.9, 0.02, 0.05], pos: [0, 0.93, z], color: "black", fine: true })),
      { shape: "box", size: [0.12, 0.06, 0.04], pos: [0.55, 0.66, 1.4], color: "amber", mirror: true },
      // bras stabilisateurs repliés le long des flancs : poutres, vérins d'acier, patins de danger
      ...[0.62, -0.62].flatMap((z): Part[] => [
        { shape: "box", size: [0.14, 0.16, 1.0], pos: [1.46, 0.76, z], color: "metal", mirror: true },
        { shape: "cylinder", sides: 6, radius: 0.045, height: 0.8, pos: [1.46, 0.88, z * 0.9], rot: [90, 0, 0], color: "steel", mirror: true },
        { shape: "cylinder", sides: 8, radius: 0.08, height: 0.18, pos: [1.46, 0.76, z * 0.3], rot: [0, 0, 90], color: "steel", mirror: true, fine: true },
      ]),
      { shape: "cylinder", sides: 6, radius: 0.21, height: 0.1, pos: [1.5, 0.64, 1.2], rot: [0, 0, 90], color: "hazard", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.21, height: 0.1, pos: [1.5, 0.64, -1.2], rot: [0, 0, 90], color: "hazard", mirror: true },
      // couronne d'acier (pivot) et tourelle à pans
      { shape: "cylinder", sides: 12, radius: 0.85, height: 0.18, bevel: 0.03, pos: [0, 1.01, -0.1], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.7, -0.85], [0.7, -0.85], [0.78, -0.5], [0.78, 0.5], [0.6, 0.85], [-0.6, 0.85], [-0.78, 0.5], [-0.78, -0.5]], depth: 0.62, bevel: 0.05, pos: [0, 1.4, -0.2], rot: [90, 0, 0], color: "faction", parent: "tourelle" },
      { shape: "wedge", size: [1.44, 0.4, 0.42], pos: [0, 1.3, 0.86], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.03, 0.05, 1.0], pos: [0.795, 1.45, -0.25], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.18, height: 0.06, bevel: 0.015, pos: [-0.35, 1.74, -0.55], color: "light", parent: "tourelle" },
      { shape: "box", size: [0.5, 0.04, 0.5], pos: [0.3, 1.725, -0.6], color: "dark", parent: "tourelle" },
      ...[-0.45, -0.55, -0.65, -0.75].map((z): Part => ({ shape: "box", size: [0.44, 0.02, 0.04], pos: [0.3, 1.75, z], color: "black", parent: "tourelle", fine: true })),
      { shape: "box", size: [0.08, 0.05, 0.05], pos: [-0.4, 1.74, 0.2], color: "amber", parent: "tourelle" },
      // double canon plasma : carters, fûts clairs, anneaux lumineux, bouches cyan, câbles de cuivre
      { shape: "box", size: [0.32, 0.32, 0.6], pos: [0.4, 1.5, 0.9], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "lathe", sides: 10, pos: [0.4, 1.5, 1.15], rot: [90, 0, 0], color: "light", mirror: true, parent: "tourelle", profile: [[0, 0], [0.11, 0], [0.1, 1.38], [0.16, 1.48], [0.16, 1.62], [0, 1.62]] },
      { shape: "cylinder", sides: 10, radius: 0.145, height: 0.07, pos: [0.4, 1.5, 1.5], rot: [90, 0, 0], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.145, height: 0.07, pos: [0.4, 1.5, 1.85], rot: [90, 0, 0], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 10, radius: 0.11, height: 0.02, pos: [0.4, 1.5, 2.765], rot: [90, 0, 0], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.2, 1.72, 0.3], [0.2, 1.7, 0.85], [0.3, 1.62, 1.2]], bend: 0.1, color: "copper", mirror: true, parent: "tourelle", fine: true },
    ],
  },
  // stealth_bomber : aile volante triangulaire très plate, noire, bord de fuite en W, dos à facettes et
  // petites vitres, fine bande aux couleurs du camp, panneau sombre, entrées d'air et tuyères encastrées
  stealth_bomber: {
    parts: [
      // aile : plan noir chanfreiné, bord d'attaque métal, panneau sombre, bande du camp
      { shape: "extrude", profile: [[0,1.4],[3.2,-1.82],[3.3,-1.92],[3.25,-2.0],[2.35,-1.55],[1.45,-2.0],[0.65,-1.6],[0,-1.75]], depth: 0.1, bevel: 0.03, pos: [0,0.5,0], rot: [90,0,0], color: "black", mirror: true },
      { shape: "tube", radius: 0.016, sides: 4, path: [[0.0,0.5,1.41],[3.21,0.5,-1.82]], color: "metal", mirror: true },
      { shape: "extrude", profile: [[0.25,0.75],[2.3,-1.3],[1.45,-1.85],[0.65,-1.45],[0.25,-1.55]], depth: 0.012, pos: [0,0.556,0], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "extrude", profile: [[0.2,1.05],[2.9,-1.667],[2.9,-1.737],[0.2,0.98]], depth: 0.012, pos: [0,0.557,0], rot: [90,0,0], color: "faction", mirror: true },
      ...[0.9, 1.5, 2.1].map((x): Part => ({ shape: "box", size: [0.015,0.01,0.5], pos: [x,0.564,-0.4 - x * 0.45], rot: [0,45,0], color: "black", mirror: true, fine: true })),
      // dos à facettes, vitres
      { shape: "extrude", profile: [[0,1.3],[0.36,0.5],[0.42,-0.6],[0.3,-1.55],[-0.3,-1.55],[-0.42,-0.6],[-0.36,0.5]], depth: 0.3, bevel: 0.1, pos: [0,0.6,0], rot: [90,0,0], color: "dark" },
      { shape: "extrude", profile: [[0,0.95],[0.16,0.5],[0.2,-0.3],[-0.2,-0.3],[-0.16,0.5]], depth: 0.04, pos: [0,0.75,0], rot: [90,0,0], color: "black" },
      { shape: "box", size: [0.1,0.02,0.16], pos: [0.08,0.776,0.62], rot: [8,0,0], color: "glass", mirror: true },
      { shape: "box", size: [0.3,0.012,0.03], pos: [0,0.776,-0.15], color: "faction" },
      // entrées d'air dorsales encastrées
      { shape: "wedge", size: [0.42,0.06,0.3], pos: [0.68,0.58,-0.32], color: "dark", mirror: true },
      { shape: "box", size: [0.34,0.04,0.02], pos: [0.68,0.575,-0.165], color: "black", mirror: true },
      // tuyères : goulottes noires, filet cyan
      { shape: "box", size: [0.5,0.02,0.4], pos: [0.62,0.558,-1.3], color: "black", mirror: true },
      { shape: "box", size: [0.42,0.03,0.04], pos: [0.62,0.565,-1.5], color: "glow", mirror: true },
      { shape: "box", size: [0.02,0.012,0.36], pos: [0.62,0.57,-1.3], color: "dark", mirror: true, fine: true },
      { shape: "sphere", radius: 0.035, pos: [3.18,0.56,-1.88], color: "amber", mirror: true },
    ],
  },
  // ew_plane : avion de guerre électronique à ailes droites d'équipe, fuselage profilé, grand radôme
  // lenticulaire tournant (anneau cyan) sur pylônes, deux turbopropulseurs, nacelle et antennes ventrales,
  // empennage en H
  ew_plane: {
    parts: [
      { shape: "lathe", sides: 12, pos: [0,0.5,0], rot: [90,0,0], scale: [1,1,0.85], color: "dark", profile: [[0,-1.85],[0.12,-1.8],[0.24,-1.2],[0.3,-0.4],[0.3,1.0],[0.27,1.4],[0.242,1.62],[0,1.62]] },
      { shape: "lathe", sides: 12, pos: [0,0.5,0], rot: [90,0,0], scale: [1,1,0.85], color: "light", profile: [[0,1.6],[0.244,1.6],[0.18,1.95],[0.08,2.22],[0,2.3]] },
      { shape: "sphere", radius: 1, detail: 1, pos: [0,0.72,1.3], scale: [0.2,0.11,0.36], color: "glass" },
      { shape: "bevel", size: [0.34,0.08,2.4], pos: [0,0.75,-0.4], bevel: 0.03, color: "faction" },
      // ailes droites : plan d'équipe, saumons clairs, bord de fuite cyan, feux
      { shape: "extrude", profile: [[0.2,0.62],[2.55,0.5],[2.62,0.42],[2.62,0.05],[2.55,-0.02],[0.2,-0.12]], depth: 0.08, bevel: 0.025, pos: [0,0.62,0], rot: [90,0,0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[2.15,0.52],[2.56,0.49],[2.56,-0.015],[2.15,-0.04]], depth: 0.02, pos: [0,0.665,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "tube", radius: 0.018, sides: 4, path: [[0.35,0.63,-0.125],[2.2,0.63,-0.05]], color: "glow", mirror: true },
      { shape: "box", size: [0.02,0.012,0.3], pos: [1.6,0.665,0.0], color: "dark", mirror: true, fine: true },
      { shape: "sphere", radius: 0.035, pos: [2.6,0.67,0.25], color: "amber", mirror: true },
      // turbopropulseurs : nacelle claire, cône d'hélice, pales, échappement
      { shape: "lathe", sides: 10, pos: [1.0,0.56,0], rot: [90,0,0], color: "light", mirror: true, profile: [[0,-0.45],[0.06,-0.42],[0.14,-0.2],[0.17,0.2],[0.17,0.8],[0.15,0.92],[0,0.92]] },
      { shape: "cone", sides: 10, radius: 0.12, height: 0.24, pos: [1.0,0.56,1.04], rot: [90,0,0], color: "steel", mirror: true },
      ...[0, 60, 120].map((a): Part => ({ shape: "box", size: [0.06,0.62,0.02], pos: [1.0,0.56,0.98], rot: [0,0,a], color: "dark", mirror: true, fine: true })),
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.02, pos: [1.0,0.56,-0.44], rot: [90,0,0], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.012,0.25], pos: [1.0,0.73,0.5], color: "black", mirror: true, fine: true },
      // radôme tournant sur pylônes
      { shape: "box", size: [0.06,0.36,0.3], pos: [0.12,0.94,-0.5], rot: [0,0,-10], color: "steel", mirror: true },
      { shape: "lathe", sides: 20, pos: [0,1.2,-0.5], color: "light", pivot: "radar", profile: [[0,-0.1],[0.55,-0.08],[0.86,-0.035],[0.9,0],[0.86,0.04],[0.55,0.09],[0,0.11]] },
      { shape: "lathe", sides: 24, profile: [[0.905,-0.02],[0.905,0.02]], pos: [0,1.2,-0.5], color: "glow", parent: "radar" },
      { shape: "bevel", size: [1.3,0.04,0.24], pos: [0,1.29,-0.5], bevel: 0.012, color: "dark", parent: "radar" },
      { shape: "cylinder", sides: 12, radius: 0.24, height: 0.02, pos: [0,1.31,-0.5], color: "faction", parent: "radar" },
      // empennage en H
      { shape: "extrude", profile: [[0.1,-1.4],[0.92,-1.5],[0.92,-1.85],[0.1,-1.85]], depth: 0.05, bevel: 0.015, pos: [0,0.64,0], rot: [90,0,0], color: "light", mirror: true },
      { shape: "extrude", profile: [[-1.88,0],[-1.42,0],[-1.6,0.6],[-1.85,0.6]], depth: 0.05, bevel: 0.015, pos: [0.92,0.66,0], rot: [0,-90,0], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.03,0.2], pos: [0.92,1.25,-1.72], color: "glow", mirror: true, fine: true },
      // nacelle de brouillage et antennes ventrales
      { shape: "lathe", sides: 10, pos: [0,0.2,0.1], rot: [90,0,0], scale: [1,1,0.7], color: "dark", profile: [[0,-0.45],[0.1,-0.42],[0.16,-0.2],[0.16,0.25],[0.11,0.45],[0,0.5]] },
      { shape: "box", size: [0.03,0.04,0.6], pos: [0.16,0.2,0.1], color: "glow", mirror: true },
      { shape: "box", size: [0.03,0.26,0.16], pos: [0,0.14,0.85], color: "metal" },
      { shape: "box", size: [0.03,0.26,0.14], pos: [0.2,0.14,-1.0], rot: [0,0,20], color: "metal", mirror: true },
    ],
  },
  // heavy_transport : grand transport volant blindé, soute profilée à rampe, nez clair vitré, flancs clairs à
  // filet cyan, quatre nacelles carénées à rotor, tourelle antiaérienne dorsale à deux tubes
  heavy_transport: {
    parts: [
      // soute, nez, verrière
      { shape: "extrude", profile: [[-2.05,0.45],[1.6,0.45],[1.6,1.55],[-2.05,1.55]], depth: 2.0, bevel: 0.08, rot: [0,-90,0], color: "dark" },
      { shape: "extrude", profile: [[1.55,0.49],[2.1,0.62],[2.48,0.95],[2.45,1.15],[2.05,1.4],[1.55,1.51]], depth: 1.8, bevel: 0.06, rot: [0,-90,0], color: "light" },
      { shape: "box", size: [1.3,0.03,0.44], pos: [0,1.29,2.26], rot: [32,0,0], color: "glass" },
      { shape: "box", size: [0.03,0.2,0.36], pos: [0.905,1.2,1.85], color: "glass", mirror: true },
      { shape: "box", size: [0.05,0.04,0.04], pos: [0.45,0.68,2.3], color: "amber", mirror: true },
      // flancs clairs et filet cyan
      { shape: "bevel", size: [0.1,0.62,2.8], pos: [1.03,1.0,-0.2], bevel: 0.03, color: "light", mirror: true },
      { shape: "box", size: [0.03,0.05,2.4], pos: [1.085,1.12,-0.2], color: "glow", mirror: true },
      ...[0.8, 0.0, -0.8].map((z): Part => ({ shape: "box", size: [0.02,0.4,0.02], pos: [1.085,0.95,z], color: "dark", mirror: true, fine: true })),
      // dos d'équipe : panneau, trappes, grilles
      { shape: "bevel", size: [1.6,0.14,3.2], pos: [0,1.6,-0.3], bevel: 0.05, color: "faction" },
      { shape: "box", size: [0.5,0.02,0.5], pos: [0,1.675,-1.1], color: "dark" },
      { shape: "box", size: [0.42,0.025,0.04], pos: [0,1.68,-1.4], color: "glow" },
      ...[-0.3, -0.45, -0.6].map((z): Part => ({ shape: "box", size: [0.9,0.012,0.05], pos: [0,1.675,z], color: "black", fine: true })),
      { shape: "box", size: [0.08,0.05,0.05], pos: [0.6,1.7,0.9], color: "amber", mirror: true },
      // rampe arrière
      { shape: "box", size: [1.4,0.08,1.0], pos: [0,0.48,-2.35], rot: [-25,0,0], color: "steel" },
      ...[-0.45, 0, 0.45].map((x): Part => ({ shape: "box", size: [0.05,0.03,0.95], pos: [x,0.52,-2.35], rot: [-25,0,0], color: "dark", fine: true })),
      // poutres et nacelles carénées
      { shape: "box", size: [3.0,0.16,0.36], pos: [0,1.1,1.1], color: "steel" },
      { shape: "box", size: [3.0,0.16,0.36], pos: [0,1.1,-1.3], color: "steel" },
      ...[1.1, -1.3].flatMap((z): Part[] => [
        { shape: "torus", radius: 0.58, tube: 0.08, sides: 12, pos: [2.0,1.15,z], scale: [1,1.5,1], color: "faction", mirror: true },
        { shape: "lathe", sides: 16, profile: [[0.53,0],[0.47,0]], pos: [2.0,1.22,z], color: "glow", mirror: true },
        { shape: "cylinder", sides: 12, radius: 0.52, height: 0.03, pos: [2.0,1.05,z], color: "dark", mirror: true },
        { shape: "box", size: [1.04,0.04,0.06], pos: [2.0,1.08,z], color: "metal", mirror: true, fine: true },
        { shape: "box", size: [0.06,0.04,1.04], pos: [2.0,1.08,z], color: "metal", mirror: true, fine: true },
        { shape: "cylinder", sides: 8, radius: 0.1, height: 0.3, pos: [2.0,1.2,z], color: "steel", mirror: true, fine: true },
      ]),
      { use: "rotor", pos: [2.0,1.42,1.1], scale: 0.75, pivot: "rotor1" },
      { shape: "cone", sides: 8, radius: 0.08, height: 0.12, pos: [2.0,1.47,1.1], color: "steel", parent: "rotor1" },
      { use: "rotor", pos: [-2.0,1.42,1.1], scale: 0.75, pivot: "rotor2" },
      { shape: "cone", sides: 8, radius: 0.08, height: 0.12, pos: [-2.0,1.47,1.1], color: "steel", parent: "rotor2" },
      { use: "rotor", pos: [2.0,1.42,-1.3], scale: 0.75, pivot: "rotor3" },
      { shape: "cone", sides: 8, radius: 0.08, height: 0.12, pos: [2.0,1.47,-1.3], color: "steel", parent: "rotor3" },
      { use: "rotor", pos: [-2.0,1.42,-1.3], scale: 0.75, pivot: "rotor4" },
      { shape: "cone", sides: 8, radius: 0.08, height: 0.12, pos: [-2.0,1.47,-1.3], color: "steel", parent: "rotor4" },
      // tourelle antiaérienne dorsale : couronne, caisse à pans, toit d'équipe, viseur, deux tubes
      { shape: "cylinder", sides: 12, radius: 0.36, height: 0.08, pos: [0,1.7,0.5], color: "dark" },
      { shape: "cylinder", sides: 10, radius: 0.32, height: 0.12, bevel: 0.02, pos: [0,1.76,0.5], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.24,-0.24],[0.24,-0.24],[0.26,0.08],[0.14,0.24],[-0.14,0.24],[-0.26,0.08]], depth: 0.22, bevel: 0.03, pos: [0,1.93,0.48], rot: [90,0,0], color: "light", parent: "tourelle" },
      { shape: "extrude", profile: [[-0.24,-0.24],[0.24,-0.24],[0.26,0.08],[0.14,0.24],[-0.14,0.24],[-0.26,0.08]], depth: 0.03, pos: [0,2.05,0.47], rot: [90,0,0], scale: [0.78,0.78,1], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.16,0.04,0.03], pos: [0,1.98,0.72], color: "glow", parent: "tourelle" },
      { shape: "lathe", sides: 8, pos: [0.1,1.93,0.7], rot: [90,0,0], color: "steel", mirror: true, parent: "tourelle", profile: [[0,0],[0.045,0],[0.045,0.12],[0.03,0.14],[0.03,0.55],[0,0.55]] },
      { shape: "cylinder", sides: 8, radius: 0.04, height: 0.06, pos: [0.1,1.93,1.22], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle", fine: true },
      { shape: "tube", radius: 0.01, sides: 4, path: [[-0.18,2.04,0.35],[-0.18,2.07,0.2]], color: "light", parent: "tourelle", fine: true },
    ],
  },
  // carrier : porte-avions, coque sombre à filet cyan, pont d'envol oblique débordant bordé d'équipe, balisage
  // ambre et cyan, catapultes, îlot clair à tribord (passerelle d'équipe vitrée, cheminée, mât, radar tournant,
  // carrier : porte-avions, coque sombre à filet cyan, pont d'envol oblique débordant bordé d'équipe, balisage
  // ambre et cyan, catapultes, îlot clair à tribord (passerelle d'équipe vitrée, cheminée, mât, radar tournant,
  // carrier : porte-avions, coque sombre à filet cyan, pont d'envol oblique débordant bordé d'équipe, balisage
  // ambre et cyan, catapultes, îlot clair à tribord (passerelle d'équipe vitrée, cheminée, mât, radar tournant,
  // carrier : porte-avions, coque sombre à filet cyan, pont d'envol oblique débordant bordé d'équipe, balisage
  // ambre et cyan, catapultes, îlot clair à tribord (passerelle d'équipe vitrée, cheminée, mât, radar tournant,
  // carrier : porte-avions, coque sombre à filet cyan, pont d'envol oblique débordant bordé d'équipe, balisage
  // ambre et cyan, catapultes, îlot clair à tribord (passerelle d'équipe vitrée, cheminée, mât, radar tournant,
  // carrier : porte-avions, coque sombre à filet cyan, pont d'envol oblique débordant bordé d'équipe, balisage
  // ambre et cyan, catapultes, îlot clair à tribord (passerelle d'équipe vitrée, cheminée, mât, radar tournant,
  // radôme), trois avions garés à bâbord, tourelle antiaérienne avant, affût arrière
  carrier: (() => {
    // contour de coque vu de dessus (x, z) : poupe arrondie, étrave effilée
    const coque = (w: number, zs: number, zb: number, lb: number): [number, number][] => {
      const d: [number, number][] = [[0.78 * w, zs], [0.96 * w, zs + 0.18 * w], [w, zs + 0.5 * w], [w, zb - lb]];
      for (const t of [0.3, 0.55, 0.75, 0.9]) d.push([+(w * (1 - t * t)).toFixed(3), +(zb - lb + lb * t).toFixed(3)]);
      return [...d, [0, zb], ...d.slice().reverse().map(([x, z]): [number, number] => [-x, z])];
    };
    const avion = (z: number): Part[] => [
      { shape: "lathe", sides: 6, pos: [-0.85,0.78,z], rot: [90,0,0], scale: [1,1,0.7], color: "light", profile: [[0,-0.36],[0.06,-0.3],[0.07,0.1],[0.04,0.3],[0,0.38]] },
      { shape: "extrude", profile: [[-0.34,-0.2],[0,0.12],[0.34,-0.2],[0.34,-0.27],[-0.34,-0.27]], depth: 0.025, pos: [-0.85,0.77,z], rot: [90,0,0], color: "faction" },
      { shape: "extrude", profile: [[-0.13,-0.3],[0,-0.2],[0.13,-0.3],[0.13,-0.36],[-0.13,-0.36]], depth: 0.02, pos: [-0.85,0.8,z], rot: [90,0,0], color: "light", fine: true },
      { shape: "box", size: [0.05,0.025,0.12], pos: [-0.85,0.82,z + 0.12], color: "glass", fine: true },
    ];
    return {
      parts: [
        // coque, listeau, filet de flottaison, appuis du pont débordant
        { shape: "extrude", profile: coque(0.98, -3.6, 3.6, 1.8), depth: 0.62, bevel: 0.06, pos: [0,0.31,0], rot: [90,0,0], color: "dark" },
        { shape: "extrude", profile: coque(1.01, -3.62, 3.62, 1.8), depth: 0.05, pos: [0,0.45,0], rot: [90,0,0], color: "light", fine: true },
        { shape: "extrude", profile: coque(0.995, -3.61, 3.61, 1.8), depth: 0.03, pos: [0,0.16,0], rot: [90,0,0], color: "glow" },
        ...[-2.6, -1.2, 0.2, 1.4].map((z): Part => ({ shape: "box", size: [0.3,0.14,0.08], pos: [1.1,0.55,z], color: "dark", mirror: true, fine: true })),
        // pont d'envol oblique, bords d'équipe
        { shape: "extrude", profile: [[-1.25,-3.75],[1.2,-3.75],[1.25,-3.6],[1.25,1.7],[1.05,2.9],[0.6,3.25],[-0.5,3.25],[-0.85,2.7],[-1.0,1.3],[-1.25,0.6],[-1.25,-3.6]], depth: 0.1, bevel: 0.02, pos: [0,0.66,0], rot: [90,0,0], color: "metal" },
        { shape: "box", size: [0.06,0.04,5.3], pos: [1.25,0.715,-0.95], color: "faction" },
        { shape: "box", size: [0.06,0.04,4.3], pos: [-1.25,0.715,-1.55], color: "faction" },
        { shape: "extrude", profile: [[-1.28,-3.78],[1.23,-3.78],[1.28,-3.62],[1.28,1.7],[1.08,2.92],[0.61,3.28],[-0.51,3.28],[-0.88,2.71],[-1.03,1.3],[-1.28,0.6],[-1.28,-3.62]], depth: 0.08, pos: [0,0.645,0], rot: [90,0,0], color: "faction" },
        // balisage : axe ambre, bords cyan, zone d'appontage, catapultes, ascenseurs
        { shape: "box", size: [0.03,0.02,6.2], pos: [0.45,0.72,-0.3], color: "glow", mirror: true },
        ...[2.7, 1.7, 0.7, -0.3, -1.3, -2.3].map((z): Part => ({ shape: "box", size: [0.06,0.02,0.45], pos: [0,0.72,z], color: "amber" })),
        { shape: "box", size: [0.8,0.02,0.06], pos: [0,0.72,-3.3], color: "amber" },
        { shape: "box", size: [0.8,0.02,0.06], pos: [0,0.72,-3.48], color: "amber" },
        ...[-0.32, -0.16, 0, 0.16, 0.32].map((x): Part => ({ shape: "box", size: [0.08,0.015,0.2], pos: [x,0.718,-3.62], color: "hazard", fine: true })),
        { shape: "box", size: [0.025,0.015,1.4], pos: [0.2,0.718,2.3], color: "black", fine: true },
        { shape: "box", size: [0.025,0.015,1.4], pos: [-0.2,0.718,2.3], color: "black", fine: true },
        { shape: "box", size: [0.5,0.012,0.5], pos: [0.85,0.716,-2.3], color: "dark", fine: true },
        { shape: "box", size: [0.5,0.012,0.5], pos: [-0.9,0.716,-0.6], color: "dark", fine: true },
        // îlot à tribord : bloc clair, passerelle d'équipe vitrée, cheminée, mât, radar tournant, radôme
        { shape: "extrude", profile: [[0.78,-1.4],[1.22,-1.4],[1.24,0.2],[0.95,0.2],[0.78,-0.05]], depth: 0.75, bevel: 0.03, pos: [0,1.08,0], rot: [90,0,0], color: "light" },
        { shape: "bevel", size: [0.44,0.4,0.9], pos: [1.0,1.66,-0.5], bevel: 0.05, color: "faction" },
        { shape: "box", size: [0.38,0.06,0.03], pos: [1.0,1.72,-0.045], color: "glow" },
        { shape: "box", size: [0.02,0.06,0.6], pos: [0.78,1.72,-0.5], color: "glass", fine: true },
        { shape: "box", size: [0.08,0.06,0.04], pos: [1.0,1.25,0.21], color: "amber" },
        { shape: "bevel", size: [0.3,0.42,0.36], pos: [1.0,1.66,-1.2], bevel: 0.05, color: "dark" },
        { shape: "box", size: [0.22,0.02,0.28], pos: [1.0,1.875,-1.2], color: "black" },
        { shape: "tube", radius: 0.035, sides: 6, path: [[1.0,1.86,-0.65],[1.0,2.55,-0.65]], color: "steel" },
        { shape: "box", size: [0.5,0.04,0.07], pos: [1.0,2.32,-0.65], color: "steel" },
        { shape: "bevel", size: [0.6,0.06,0.12], pos: [1.0,2.58,-0.65], bevel: 0.02, color: "light", pivot: "radar" },
        { shape: "box", size: [0.5,0.02,0.02], pos: [1.0,2.58,-0.585], color: "glow", parent: "radar" },
        { shape: "lathe", sides: 10, pos: [1.0,1.98,-0.85], color: "light", profile: [[0,-0.16],[0.12,-0.12],[0.16,0],[0.12,0.12],[0,0.16]] },
        // avions garés à bâbord
        ...[2.5, 1.6, 0.7].flatMap(avion),
        // tourelle antiaérienne (pivot) et affût arrière
        { shape: "cylinder", sides: 10, radius: 0.2, height: 0.08, bevel: 0.015, pos: [0.9,0.76,2.4], color: "steel", pivot: "tourelle" },
        { shape: "extrude", profile: [[-0.15,-0.14],[0.15,-0.14],[0.16,0.05],[0.08,0.15],[-0.08,0.15],[-0.16,0.05]], depth: 0.14, bevel: 0.02, pos: [0.9,0.87,2.38], rot: [90,0,0], color: "light", parent: "tourelle" },
        { shape: "box", size: [0.14,0.012,0.12], pos: [0.9,0.946,2.36], color: "faction", parent: "tourelle" },
        { shape: "cylinder", sides: 6, radius: 0.022, height: 0.43, pos: [0.84,0.89,2.715], rot: [90,0,0], color: "steel", parent: "tourelle" },
        { shape: "cylinder", sides: 6, radius: 0.022, height: 0.43, pos: [0.96,0.89,2.715], rot: [90,0,0], color: "steel", parent: "tourelle" },
        { shape: "cylinder", sides: 10, radius: 0.18, height: 0.08, pos: [-0.95,0.75,-3.3], color: "steel" },
        { shape: "lathe", sides: 10, pos: [-0.95,0.79,-3.3], color: "light", profile: [[0,0],[0.13,0],[0.13,0.1],[0.1,0.17],[0,0.2]] },
        { shape: "cylinder", sides: 6, radius: 0.025, height: 0.3, pos: [-0.95,0.86,-3.08], rot: [90,0,0], color: "dark" },
      ],
    };
  })(),
  // railgun_ship : cuirassé, coque sombre à listeau clair et filet cyan, plage avant d'équipe, deux tourelles
  // avant (une surélevée) à canons de rail jumeaux très longs cerclés de bobines cyan, château central massif en
  // railgun_ship : cuirassé, coque sombre à listeau clair et filet cyan, plage avant d'équipe, deux tourelles
  // avant (une surélevée) à canons de rail jumeaux très longs cerclés de bobines cyan, château central massif en
  // railgun_ship : cuirassé, coque sombre à listeau clair et filet cyan, plage avant d'équipe, deux tourelles
  // avant (une surélevée) à canons de rail jumeaux très longs cerclés de bobines cyan, château central massif en
  // railgun_ship : cuirassé, coque sombre à listeau clair et filet cyan, plage avant d'équipe, deux tourelles
  // avant (une surélevée) à canons de rail jumeaux très longs cerclés de bobines cyan, château central massif en
  // railgun_ship : cuirassé, coque sombre à listeau clair et filet cyan, plage avant d'équipe, deux tourelles
  // avant (une surélevée) à canons de rail jumeaux très longs cerclés de bobines cyan, château central massif en
  // railgun_ship : cuirassé, coque sombre à listeau clair et filet cyan, plage avant d'équipe, deux tourelles
  // avant (une surélevée) à canons de rail jumeaux très longs cerclés de bobines cyan, château central massif en
  // gradins, tours de condensateurs, mât, radôme, tourelle arrière fixe
  railgun_ship: (() => {
    // contour de coque vu de dessus (x, z) : poupe arrondie, étrave effilée ; z0 ne garde que l'avant
    const coque = (w: number, zs: number, zb: number, lb: number, z0 = -99): [number, number][] => {
      const d: [number, number][] = [[0.78 * w, zs], [0.96 * w, zs + 0.18 * w], [w, zs + 0.5 * w], [w, zb - lb]];
      for (const t of [0.3, 0.55, 0.75, 0.9]) d.push([+(w * (1 - t * t)).toFixed(3), +(zb - lb + lb * t).toFixed(3)]);
      const c = d.filter(([, z]) => z >= z0);
      return [...c, [0, zb], ...c.slice().reverse().map(([x, z]): [number, number] => [-x, z])];
    };
    const caisse: [number, number][] = [[-0.42,-0.42],[0.42,-0.42],[0.45,0.1],[0.3,0.42],[-0.3,0.42],[-0.45,0.1]];
    // canons de rail jumeaux (x = ±0.22) : culasse, deux rails, trois bobines cyan, bouche
    const rails = (y: number, z0: number, parent: string): Part[] => [
      { shape: "box", size: [0.24,0.2,0.3], pos: [0.22,y,z0 + 0.05], color: "dark", mirror: true, parent },
      { shape: "box", size: [0.035,0.12,2.6], pos: [0.155,y,z0 + 1.3], color: "steel", mirror: true, parent },
      { shape: "box", size: [0.035,0.12,2.6], pos: [0.285,y,z0 + 1.3], color: "steel", mirror: true, parent },
      { shape: "box", size: [0.1,0.03,2.4], pos: [0.22,y - 0.05,z0 + 1.2], color: "dark", mirror: true, parent, fine: true },
      ...[0.6, 1.3, 2.0].map((d): Part => ({ shape: "box", size: [0.22,0.2,0.07], pos: [0.22,y,z0 + d], color: "glow", mirror: true, parent, fine: d === 1.3 })),
      ...[0.8, 0.95, 1.1, 1.5, 1.65, 1.8].map((d): Part => ({ shape: "box", size: [0.19,0.17,0.03], pos: [0.22,y,z0 + d], color: "copper", mirror: true, parent, fine: true })),
      { shape: "box", size: [0.2,0.16,0.05], pos: [0.22,y,z0 + 2.55], color: "dark", mirror: true, parent, fine: true },
    ];
    return {
      parts: [
        // coque, listeau, filet de flottaison, pont, plage avant
        { shape: "extrude", profile: coque(0.98, -3.5, 3.6, 2.1), depth: 0.65, bevel: 0.06, pos: [0,0.325,0], rot: [90,0,0], color: "dark" },
        { shape: "extrude", profile: coque(1.02, -3.52, 3.62, 2.1), depth: 0.05, pos: [0,0.55,0], rot: [90,0,0], color: "light", fine: true },
        { shape: "extrude", profile: coque(0.995, -3.51, 3.61, 2.1), depth: 0.03, pos: [0,0.25,0], rot: [90,0,0], color: "glow" },
        { shape: "extrude", profile: coque(0.93, -3.45, 3.48, 2.0), depth: 0.04, pos: [0,0.67,0], rot: [90,0,0], color: "metal" },
        { shape: "extrude", profile: coque(0.93, -3.45, 3.48, 2.0, 1.48), depth: 0.012, pos: [0,0.694,0], rot: [90,0,0], color: "faction" },
        { shape: "box", size: [0.014,0.014,4.5], pos: [0.9,0.75,-0.75], color: "light", mirror: true, fine: true },
        { shape: "box", size: [0.12,0.05,0.16], pos: [0.18,0.71,3.0], color: "dark", mirror: true, fine: true },
        // château massif en gradins : clair, équipe, sombre vitré
        { shape: "extrude", profile: [[-0.75,-2.1],[0.75,-2.1],[0.75,-0.4],[0.55,-0.1],[-0.55,-0.1],[-0.75,-0.4]], depth: 0.7, bevel: 0.05, pos: [0,1.04,0], rot: [90,0,0], color: "light" },
        { shape: "extrude", profile: [[-0.6,-1.85],[0.6,-1.85],[0.6,-0.7],[0.42,-0.45],[-0.42,-0.45],[-0.6,-0.7]], depth: 0.5, bevel: 0.04, pos: [0,1.64,0], rot: [90,0,0], color: "faction" },
        { shape: "box", size: [0.8,0.36,0.8], pos: [0,2.07,-1.0], color: "dark" },
        { shape: "box", size: [0.6,0.06,0.03], pos: [0,2.12,-0.595], color: "glow" },
        { shape: "box", size: [0.02,0.06,0.6], pos: [0.405,2.12,-1.0], color: "glass", mirror: true, fine: true },
        { shape: "box", size: [0.7,0.03,0.7], pos: [0,2.265,-1.0], color: "light", fine: true },
        { shape: "box", size: [0.08,0.06,0.04], pos: [0.5,1.2,-0.08], color: "amber", mirror: true },
        { shape: "box", size: [0.06,0.05,0.04], pos: [0.45,1.75,-0.5], color: "amber", mirror: true, fine: true },
        // mât, vergue, radôme
        { shape: "tube", radius: 0.04, sides: 6, path: [[0,2.27,-1.2],[0,2.93,-1.2]], color: "steel" },
        { shape: "tube", radius: 0.022, sides: 4, path: [[0.28,2.27,-1.45],[0,2.6,-1.22]], color: "steel", mirror: true, fine: true },
        { shape: "box", size: [0.7,0.05,0.08], pos: [0,2.75,-1.2], color: "steel", fine: true },
        { shape: "lathe", sides: 10, pos: [0,2.05,-1.65], color: "light", profile: [[0,-0.16],[0.12,-0.12],[0.16,0],[0.12,0.12],[0,0.16]] },
        // tours de condensateurs à bandes cyan
        { shape: "cylinder", sides: 6, radius: 0.15, height: 0.52, pos: [0.3,1.65,-2.0], color: "dark", mirror: true },
        { shape: "cylinder", sides: 8, radius: 0.155, height: 0.04, pos: [0.3,1.6,-2.0], color: "glow", mirror: true, fine: true },
        { shape: "cylinder", sides: 10, radius: 0.155, height: 0.04, pos: [0.3,1.75,-2.0], color: "glow", mirror: true },
        { shape: "cylinder", sides: 8, radius: 0.1, height: 0.02, pos: [0.3,1.92,-2.0], color: "black", mirror: true, fine: true },
        // tourelle avant basse (pivot)
        { shape: "cylinder", sides: 14, radius: 0.48, height: 0.1, bevel: 0.02, pos: [0,0.76,1.75], color: "steel", pivot: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.34, bevel: 0.05, pos: [0,0.98,1.7], rot: [90,0,0], color: "light", parent: "tourelle" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,1.165,1.69], rot: [90,0,0], scale: [0.74,0.74,1], color: "faction", parent: "tourelle" },
        { shape: "box", size: [0.2,0.04,0.03], pos: [0,1.1,2.13], color: "glow", parent: "tourelle" },
        ...rails(1.0, 2.15, "tourelle"),
        // tourelle avant surélevée (pivot) sur barbette
        { shape: "cylinder", sides: 14, radius: 0.46, height: 0.32, pos: [0,0.84,0.55], color: "dark" },
        { shape: "cylinder", sides: 14, radius: 0.46, height: 0.1, bevel: 0.02, pos: [0,1.0,0.55], color: "steel", pivot: "tourelle2" },
        { shape: "extrude", profile: caisse, depth: 0.34, bevel: 0.05, pos: [0,1.22,0.5], rot: [90,0,0], color: "light", parent: "tourelle2" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,1.405,0.49], rot: [90,0,0], scale: [0.74,0.74,1], color: "faction", parent: "tourelle2" },
        { shape: "box", size: [0.2,0.04,0.03], pos: [0,1.34,0.93], color: "glow", parent: "tourelle2" },
        ...rails(1.26, 0.95, "tourelle2"),
        // tourelle arrière fixe, rails vers l'arrière
        { shape: "cylinder", sides: 12, radius: 0.4, height: 0.1, bevel: 0.02, pos: [0,0.74,-2.8], color: "steel" },
        { shape: "extrude", profile: caisse, depth: 0.28, bevel: 0.04, pos: [0,0.93,-2.85], rot: [-90,0,0], scale: [0.75,0.75,1], color: "light" },
        { shape: "extrude", profile: caisse, depth: 0.03, pos: [0,1.085,-2.84], rot: [-90,0,0], scale: [0.55,0.55,1], color: "faction" },
        { shape: "box", size: [0.035,0.1,1.0], pos: [0.12,0.96,-3.6], color: "steel", mirror: true },
        { shape: "box", size: [0.4,0.18,0.06], pos: [0,0.96,-3.45], color: "glow" },
        { shape: "box", size: [0.4,0.18,0.06], pos: [0,0.96,-3.85], color: "glow", fine: true },
      ],
    };
  })(),
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
  ...ANCIENT_UNIT_MODELS,
  ...SOUCHE_UNIT_MODELS,
  ...SOUCHE_EGG_MODELS,
  ...SOUCHE_SWARM_MODELS,
  ...TRANSH_UNIT_MODELS,
};
