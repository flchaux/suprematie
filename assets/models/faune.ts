// Faune sauvage (voir sim/src/nature.rs) : le mordeur, bête à six pattes, et son nid.
//
// Mordeur : corps bas en trois parties (tête, thorax, abdomen annelé). Carapace en plaques chanfreinées
// à la couleur de la faune (brun), ventre sombre, épines d'os le long du dos, tête à crête avec quatre
// yeux ambrés lumineux, mandibules en crochets qui se referment devant une gueule rouge, palpes. Six
// pattes articulées (hanche, fémur, genou, tibia, griffe) sur pivots « jambe… » : le jeu les balance en
// trépied alterné (avant droite, milieu gauche et arrière droite ensemble ; le milieu porte « _ar » pour
// être en opposition de phase avec l'avant). Trois stades de la même bête : le grand mordeur gagne des
// cornes, des épines doubles et des plaques d'épaules.
//
// Nid : monticule de terre et de chitine percé de terriers, côtes d'os recourbées, grappes d'œufs ambrés
// lumineux, plaques de carapace à la couleur de la faune.
import type { Model, Part, Vec3 } from "./types.ts";

const r3 = (v: number): number => +v.toFixed(3);

/** Segment d'une patte (côté droit) : départ, direction, lacet et pente en degrés, longueur. */
interface Seg {
  a: Vec3;
  d: Vec3;
  n: Vec3;
  yaw: number;
  tilt: number;
  len: number;
  b: Vec3;
}

/**
 * Chaîne de segments depuis `from` : `yaw` autour de y (négatif : vers l'avant), puis pour chaque
 * segment [pente en degrés (positive : vers le haut), longueur].
 */
function chaine(from: Vec3, yaw: number, segs: [number, number][]): Seg[] {
  const out: Seg[] = [];
  let p = from;
  const ay = (yaw * Math.PI) / 180;
  for (const [tilt, len] of segs) {
    const t = (tilt * Math.PI) / 180;
    const d: Vec3 = [Math.cos(t) * Math.cos(ay), Math.sin(t), -Math.cos(t) * Math.sin(ay)];
    const n: Vec3 = [-Math.sin(t) * Math.cos(ay), Math.cos(t), Math.sin(t) * Math.sin(ay)];
    const b: Vec3 = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
    out.push({ a: p, d, n, yaw, tilt, len, b });
    p = b;
  }
  return out;
}

/**
 * Pose une pièce sur un segment, à la fraction `t` de sa longueur, décalée de `up` selon sa normale.
 * « long » : boîte dont la longueur (x) suit le segment ; « tube » : cylindre ou cône dans l'axe, pointe
 * vers le bout ; « moyeu » : cylindre en travers (articulation).
 */
function sur(s: Seg, t: number, up: number, p: Part, axe: "long" | "tube" | "moyeu" | "aucun"): Part {
  const k = t * s.len;
  const pos: Vec3 = [0, 1, 2].map((i) => r3(s.a[i] + s.d[i] * k + s.n[i] * up)) as Vec3;
  const rot: Vec3 | undefined = axe === "long" ? [0, s.yaw, s.tilt] : axe === "tube" ? [0, s.yaw, s.tilt - 90] : axe === "moyeu" ? [0, s.yaw + 90, 90] : p.rot;
  return { ...p, pos, rot };
}

/** Copie d'une pièce du côté droit vers le côté gauche (symétrie en x). */
function gauche(p: Part): Part {
  const pos = p.pos ?? [0, 0, 0];
  const rot = p.rot ?? [0, 0, 0];
  return { ...p, pos: [-pos[0], pos[1], pos[2]], rot: [rot[0], -rot[1], -rot[2]] };
}

/**
 * Patte de mordeur côté droit, hanche en (x, y, z), lacet `yaw` (négatif : vers l'avant). Pivot `name` à
 * la hanche ; les autres pièces sont portées par lui. `side` = -1 : copie pour la gauche.
 */
function patte(name: string, side: 1 | -1, hip: Vec3, yaw: number, big: boolean): Part[] {
  const [femur, tibia, tarse] = chaine(hip, yaw, [
    [38, 0.78],
    [-62, 0.92],
    [-84, 0.3],
  ]);
  const parts: Part[] = [
    // hanche (pivot) et fémur : âme sombre sous une plaque de carapace
    sur(femur, 0, 0, { shape: "box", size: [0.2, 0.2, 0.2], color: "dark", pivot: name }, "long"),
    sur(femur, 0.5, 0, { shape: "box", size: [0.8, 0.15, 0.14], color: "dark" }, "long"),
    sur(femur, 0.45, 0.08, { shape: "box", size: [0.6, 0.07, 0.19], color: "faction" }, "long"),
    // tibia effilé, de la couleur de la carapace au genou
    sur(tibia, 0.5, 0, { shape: "cylinder", sides: 4, radius: 0.08, radiusTop: 0.05, height: 0.94, color: "dark" }, "tube"),
    // griffe
    sur(tarse, 0.5, 0, { shape: "cone", sides: 4, radius: 0.06, height: 0.3, color: "light" }, "tube"),
  ];
  // grand mordeur : épine sur le fémur
  if (big) parts.push(sur(femur, 0.6, 0.12, { shape: "cone", sides: 4, radius: 0.05, height: 0.24, color: "light" }, "long"));
  return parts.map((p, i) => {
    const q: Part = i === 0 ? p : { ...p, parent: name };
    return side === 1 ? q : gauche(q);
  });
}

/** Mordeur au stade 1 (petit), 2 (adulte) ou 3 (grand). */
function mordeur(stade: 1 | 2 | 3): Model {
  const big = stade === 3;
  const parts: Part[] = [
    // ---- abdomen annelé ----
    { shape: "sphere", radius: 0.62, detail: 0, pos: [0, 0.78, -0.95], scale: [0.95, 0.72, 1.3], color: "dark" },
    { shape: "box", size: [1.0, 0.2, 0.46], pos: [0, 1.16, -0.55], rot: [-4, 0, 0], color: "faction" },
    { shape: "box", size: [0.9, 0.2, 0.44], pos: [0, 1.1, -0.98], rot: [-14, 0, 0], color: "faction" },
    { shape: "box", size: [0.7, 0.18, 0.4], pos: [0, 0.94, -1.38], rot: [-34, 0, 0], color: "faction" },
    // jointure claire entre les anneaux
    { shape: "box", size: [0.86, 0.06, 0.06], pos: [0, 1.2, -0.77], color: "rust" },
    // dard de queue
    { shape: "cone", sides: 4, radius: 0.12, height: 0.42, pos: [0, 0.66, -1.72], rot: [-110, 0, 0], color: "light" },
    // ---- thorax ----
    { shape: "sphere", radius: 0.5, detail: 0, pos: [0, 0.84, 0.1], scale: [1.0, 0.78, 0.95], color: "rust" },
    { shape: "bevel", size: [0.98, 0.22, 0.78], pos: [0, 1.18, 0.1], color: "faction", bevel: 0.08 },
    // ventre sombre
    { shape: "box", size: [0.6, 0.16, 1.5], pos: [0, 0.5, -0.35], color: "black" },
    // épines d'os le long du dos
    { shape: "cone", sides: 4, radius: 0.08, height: 0.34, pos: [0, 1.42, 0.12], rot: [-22, 0, 0], color: "light" },
    { shape: "cone", sides: 4, radius: 0.08, height: 0.3, pos: [0, 1.36, -0.55], rot: [-28, 0, 0], color: "light" },
    { shape: "cone", sides: 4, radius: 0.07, height: 0.26, pos: [0, 1.24, -1.0], rot: [-38, 0, 0], color: "light" },
    // ---- tête ----
    { shape: "bevel", size: [0.72, 0.46, 0.58], pos: [0, 0.82, 0.78], rot: [12, 0, 0], color: "dark", bevel: 0.1 },
    { shape: "wedge", size: [0.76, 0.2, 0.56], pos: [0, 1.08, 0.74], rot: [8, 0, 0], color: "faction" },
    // yeux ambrés lumineux
    { shape: "box", size: [0.13, 0.1, 0.06], pos: [0.2, 0.95, 1.06], rot: [0, 20, 0], color: "amber", mirror: true },
    // gueule et mandibules (crochets qui se referment vers l'avant)
    { shape: "box", size: [0.3, 0.16, 0.1], pos: [0, 0.64, 1.07], color: "red" },
    { shape: "cylinder", sides: 4, radius: 0.08, radiusTop: 0.06, height: 0.32, pos: [0.22, 0.62, 1.16], rot: [90, 0, 18], color: "dark", mirror: true },
    { shape: "cone", sides: 4, radius: 0.065, height: 0.36, pos: [0.15, 0.62, 1.46], rot: [90, 0, 48], color: "light", mirror: true },
    // ---- six pattes (trépied alterné) ----
    ...patte("jambe_t_d", 1, [0.42, 0.82, 0.42], -38, big),
    ...patte("jambe_t_g", -1, [0.42, 0.82, 0.42], -38, big),
    ...patte("jambe_ar_m_d", 1, [0.46, 0.82, 0.0], 4, big),
    ...patte("jambe_ar_m_g", -1, [0.46, 0.82, 0.0], 4, big),
    ...patte("jambe_q_d", 1, [0.42, 0.8, -0.42], 42, big),
    ...patte("jambe_q_g", -1, [0.42, 0.8, -0.42], 42, big),
  ];
  if (stade >= 2) {
    // adulte : épines latérales sur le thorax et l'abdomen, palpes
    parts.push(
      { shape: "cone", sides: 4, radius: 0.06, height: 0.26, pos: [0.36, 1.26, 0.1], rot: [0, 0, -40], color: "light", mirror: true },
      { shape: "cone", sides: 4, radius: 0.06, height: 0.24, pos: [0.38, 1.2, -0.55], rot: [-10, 0, -44], color: "light", mirror: true },
      { shape: "box", size: [0.05, 0.05, 0.34], pos: [0.3, 0.56, 1.0], rot: [24, -20, 0], color: "rust", mirror: true },
    );
  }
  if (big) {
    // grand mordeur : cornes, plaques d'épaules
    parts.push(
      { shape: "cone", sides: 4, radius: 0.1, height: 0.62, pos: [0.24, 1.22, 0.7], rot: [-35, 0, -24], color: "light", mirror: true },
      { shape: "box", size: [0.36, 0.14, 0.62], pos: [0.5, 1.12, 0.12], rot: [0, 0, -26], color: "faction", mirror: true },
    );
  }
  return { parts };
}

/** Côte d'os recourbée du nid (deux segments), pied en (x, z), penchée vers l'extérieur selon `a` (degrés). */
function cote(x: number, z: number, a: number, h: number): Part[] {
  const ar = (a * Math.PI) / 180;
  const ox = Math.cos(ar);
  const oz = Math.sin(ar);
  const yaw = -a;
  return [
    { shape: "cylinder", sides: 5, radius: 0.11, radiusTop: 0.08, height: h, pos: [r3(x + ox * 0.12), r3(0.55 + h / 2), r3(z + oz * 0.12)], rot: [0, yaw, -14], color: "light" },
    { shape: "cone", sides: 5, radius: 0.08, height: h * 0.6, pos: [r3(x + ox * 0.42), r3(0.55 + h + h * 0.22), r3(z + oz * 0.42)], rot: [0, yaw, -48], color: "light" },
  ];
}

/** Grappe d'œufs ambrés lumineux. */
function oeufs(x: number, y: number, z: number, s: number): Part[] {
  return [
    { shape: "sphere", radius: 0.17 * s, detail: 0, pos: [x, y, z], scale: [1, 1.25, 1], color: "amber" },
    { shape: "sphere", radius: 0.13 * s, detail: 0, pos: [r3(x + 0.2 * s), r3(y - 0.04), r3(z + 0.08 * s)], scale: [1, 1.25, 1], color: "amber" },
    { shape: "sphere", radius: 0.12 * s, detail: 0, pos: [r3(x - 0.12 * s), r3(y - 0.05), r3(z + 0.18 * s)], scale: [1, 1.25, 1], color: "amber" },
  ];
}

/** Terrier : bouche sombre sur le flanc du monticule, bordée d'un bourrelet. */
function terrier(x: number, z: number, a: number): Part[] {
  const yaw = 90 - a;
  return [
    { shape: "sphere", radius: 0.42, detail: 0, pos: [x, 0.42, z], rot: [0, yaw, 0], scale: [1.1, 0.8, 0.55], color: "rust" },
    { shape: "sphere", radius: 0.3, detail: 0, pos: [r3(x + Math.cos((a * Math.PI) / 180) * 0.14), 0.4, r3(z + Math.sin((a * Math.PI) / 180) * 0.14)], rot: [0, yaw, 0], scale: [1.05, 0.75, 0.45], color: "black" },
  ];
}

const nid: Model = {
  parts: [
    // monticule de terre et de chitine
    { shape: "sphere", radius: 1.5, detail: 1, pos: [0, 0.15, 0], scale: [1.0, 0.5, 1.0], color: "dry" },
    { shape: "sphere", radius: 1.05, detail: 1, pos: [0.1, 0.55, -0.05], scale: [1.0, 0.62, 0.95], color: "faction" },
    { shape: "sphere", radius: 0.7, detail: 1, pos: [-0.85, 0.3, 0.55], scale: [1.0, 0.6, 0.9], color: "rust" },
    { shape: "sphere", radius: 0.62, detail: 1, pos: [0.9, 0.28, 0.6], scale: [1.0, 0.55, 1.0], color: "faction" },
    { shape: "sphere", radius: 0.66, detail: 1, pos: [0.55, 0.3, -0.95], scale: [1.0, 0.55, 0.9], color: "rust" },
    { shape: "sphere", radius: 0.55, detail: 0, pos: [-0.8, 0.26, -0.8], scale: [1.0, 0.6, 1.0], color: "dark" },
    // cheminée centrale, gueule sombre
    { shape: "cylinder", sides: 6, radius: 0.48, radiusTop: 0.3, height: 0.55, pos: [0.05, 1.05, 0], color: "rust" },
    { shape: "cylinder", sides: 6, radius: 0.24, height: 0.08, pos: [0.05, 1.33, 0], color: "black" },
    // terriers
    ...terrier(1.2, -0.1, 0),
    ...terrier(-0.6, 1.1, 115),
    ...terrier(-0.75, -1.05, 235),
    // côtes d'os recourbées
    ...cote(0.5, 0.35, 35, 0.9),
    ...cote(-0.45, 0.4, 140, 0.8),
    ...cote(-0.3, -0.5, 230, 1.0),
    ...cote(0.4, -0.45, 315, 0.75),
    // plaques de carapace sur le dôme
    { shape: "bevel", size: [0.6, 0.12, 0.5], pos: [-0.35, 0.95, 0.05], rot: [0, 20, 22], color: "faction", bevel: 0.04 },
    { shape: "bevel", size: [0.5, 0.12, 0.45], pos: [0.45, 0.92, 0.2], rot: [0, -30, -24], color: "faction", bevel: 0.04 },
    // œufs lumineux
    ...oeufs(0.95, 0.62, 0.25, 1.2),
    ...oeufs(-0.95, 0.55, 0.15, 1.0),
    ...oeufs(0.1, 0.62, -1.0, 1.1),
    ...oeufs(-0.2, 0.55, 1.05, 0.9),
    // éclats d'os au sol
    { shape: "cone", sides: 4, radius: 0.08, height: 0.4, pos: [1.35, 0.12, 0.95], rot: [0, 0, -70], color: "light" },
    { shape: "cone", sides: 4, radius: 0.07, height: 0.35, pos: [-1.3, 0.1, -0.2], rot: [10, 0, 75], color: "light" },
  ],
};

export const BEAST_MODELS: Record<string, Model> = {
  beast_s: mordeur(1),
  beast_m: mordeur(2),
  beast_l: mordeur(3),
};

export const NEST_MODELS: Record<string, Model> = {
  nest: nid,
};
