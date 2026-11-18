// colossus : mécha géant élancé. Jambes longues articulées (pivots jambe_d / jambe_g à la hanche) avec
// genouillères, vérins de cuisse et de mollet, pieds à orteils ; taille de guêpe ; buste en V à plaques
// superposées, cœur lumineux, évents latéraux ; épaulières à trois lames ; bras-canons à chargeur ;
// tête à visière cyan et antennes ; sac dorsal à réacteur, cheminées et câbles. (3972 triangles)
import type { ColorName, Model, Part, Vec3 } from "../types.ts";

const r3 = (v: number): number => +v.toFixed(3);
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Pièce allongée de `a` à `b` : son axe local y suit le segment (boîte, chanfrein ou cylindre).
 * `w` et `d` : largeur (x local) et profondeur (z local) ; pour un cylindre, `w` est le rayon.
 */
function entre(a: Vec3, b: Vec3, w: number, d: number, p: Part): Part {
  const v: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(v[0], v[1], v[2]);
  const gz = Math.asin(-v[0] / len);
  const ax = Math.atan2(v[2], v[1]);
  const deg = 180 / Math.PI;
  const pos: Vec3 = [r3((a[0] + b[0]) / 2), r3((a[1] + b[1]) / 2), r3((a[2] + b[2]) / 2)];
  const rot: Vec3 = [r3(ax * deg), 0, r3(gz * deg)];
  if (p.shape === "cylinder" || p.shape === "cone") return { radius: w, height: r3(len), ...p, pos, rot };
  return { ...p, size: [w, r3(len), d], pos, rot };
}

/** Copie d'une pièce du côté `s` (1 : droite, -1 : gauche) : x et les rotations y, z changent de signe. */
function cote(s: number, p: Part): Part {
  const q: Part = { ...p };
  if (p.pos) q.pos = [r3(p.pos[0] * s), p.pos[1], p.pos[2]];
  if (p.rot) q.rot = [p.rot[0], r3(p.rot[1] * s), r3(p.rot[2] * s)];
  return q;
}

/** Jambe complète côté `s`, pivot à la hanche : cuisse, genou, tibia, cheville et pied. */
function jambe(s: 1 | -1): Part[] {
  const name = s > 0 ? "jambe_d" : "jambe_g";
  const H: Vec3 = [0.6, 2.5, 0];
  const K: Vec3 = [0.66, 1.4, 0.2];
  const A: Vec3 = [0.72, 0.38, -0.02];
  const c = (color: ColorName): { color: ColorName; parent: string } => ({ color, parent: name });
  const parts: Part[] = [
    // hanche (pivot) et plaques de hanche superposées
    { shape: "cylinder", sides: 8, radius: 0.2, height: 0.42, pos: H, rot: [0, 0, 90], color: "metal", pivot: name },
    { shape: "cylinder", sides: 6, radius: 0.12, height: 0.5, pos: H, rot: [0, 0, 90], ...c("dark") },
    { shape: "bevel", size: [0.12, 0.6, 0.62], pos: [0.88, 2.42, 0.02], rot: [0, 0, 8], ...c("faction") },
    { shape: "box", size: [0.08, 0.4, 0.5], pos: [0.95, 2.2, 0.04], rot: [0, 0, 12], ...c("light") },
    { shape: "box", size: [0.04, 0.05, 0.05], pos: [0.95, 2.58, 0.3], ...c("amber") },
    // cuisse : ossature, plaque avant, filet lumineux, vérin arrière
    entre(H, K, 0.32, 0.36, { shape: "bevel", ...c("dark") }),
    entre(add(H, [0, -0.2, 0.2]), add(K, [0, 0.22, 0.2]), 0.38, 0.13, { shape: "bevel", ...c("light") }),
    entre(add(H, [0, -0.45, 0.265]), add(K, [0, 0.45, 0.265]), 0.05, 0.03, { shape: "box", ...c("glow") }),
    entre(add(H, [0.02, -0.12, -0.24]), add(lerp(H, K, 0.5), [0.02, 0, -0.2]), 0.065, 0, { shape: "cylinder", sides: 6, ...c("dark") }),
    entre(add(lerp(H, K, 0.45), [0.02, 0, -0.2]), add(K, [0.02, 0.1, -0.1]), 0.035, 0, { shape: "cylinder", sides: 6, ...c("metal") }),
    // genou
    { shape: "cylinder", sides: 6, radius: 0.17, height: 0.4, pos: K, rot: [0, 0, 90], ...c("metal") },
    { shape: "bevel", size: [0.32, 0.36, 0.16], pos: add(K, [0, 0.04, 0.2]), rot: [-12, 0, 0], ...c("faction") },
    { shape: "box", size: [0.12, 0.035, 0.03], pos: add(K, [0, 0.13, 0.29]), rot: [-12, 0, 0], ...c("amber") },
    // tibia : ossature, jambière à deux plaques, fente lumineuse, vérin de mollet, évents
    entre(K, A, 0.28, 0.3, { shape: "bevel", ...c("dark") }),
    entre(add(K, [0, -0.14, 0.18]), add(A, [0, 0.3, 0.18]), 0.36, 0.13, { shape: "bevel", ...c("light") }),
    entre(add(lerp(K, A, 0.55), [0, 0, 0.25]), add(A, [0, 0.16, 0.24]), 0.3, 0.08, { shape: "box", ...c("faction") }),
    entre(add(lerp(K, A, 0.18), [0, 0, 0.255]), add(lerp(K, A, 0.45), [0, 0, 0.255]), 0.05, 0.03, { shape: "box", ...c("glow") }),
    entre(add(K, [0, -0.08, -0.2]), add(lerp(K, A, 0.55), [0, 0, -0.22]), 0.06, 0, { shape: "cylinder", sides: 6, ...c("dark") }),
    entre(add(lerp(K, A, 0.5), [0, 0, -0.22]), add(A, [0, 0.04, -0.2]), 0.032, 0, { shape: "cylinder", sides: 6, ...c("metal") }),
    { shape: "box", size: [0.04, 0.05, 0.18], pos: add(lerp(K, A, 0.32), [0.14, 0, 0]), ...c("black") },
    { shape: "box", size: [0.04, 0.05, 0.18], pos: add(lerp(K, A, 0.42), [0.14, 0, 0]), ...c("black") },
    // cheville et pied
    { shape: "cylinder", sides: 6, radius: 0.13, height: 0.34, pos: A, rot: [0, 0, 90], ...c("metal") },
    { shape: "bevel", size: [0.46, 0.18, 0.78], pos: [0.72, 0.09, 0.08], ...c("dark") },
    { shape: "bevel", size: [0.42, 0.14, 0.5], pos: [0.72, 0.23, 0.24], rot: [12, 0, 0], ...c("faction") },
    { shape: "wedge", size: [0.2, 0.15, 0.42], pos: [0.84, 0.075, 0.62], rot: [0, 10, 0], ...c("dark") },
    { shape: "wedge", size: [0.2, 0.15, 0.42], pos: [0.6, 0.075, 0.62], rot: [0, -10, 0], ...c("dark") },
    { shape: "box", size: [0.22, 0.12, 0.34], pos: [0.72, 0.07, -0.42], ...c("metal") },
    { shape: "box", size: [0.03, 0.04, 0.42], pos: [0.955, 0.12, 0.08], ...c("glow") },
  ];
  return parts.map((p) => cote(s, p));
}

/** Décale des pièces : `dy` en hauteur, `dx` vers l'extérieur (selon le signe de x). */
function decale(dx: number, dy: number, parts: Part[]): Part[] {
  return parts.map((p) => {
    const q = p.pos ?? [0, 0, 0];
    const sx = q[0] < 0 ? -1 : 1;
    return { ...p, pos: [r3(q[0] + (q[0] === 0 ? 0 : dx * sx)), r3(q[1] + dy), q[2]] };
  });
}

const T = "torse";

/** Bassin, jupe de plaques et taille de guêpe (fixes). */
const bassin: Part[] = [
  { shape: "bevel", size: [0.95, 0.42, 0.66], pos: [0, 2.58, 0], color: "dark" },
  { shape: "bevel", size: [0.36, 0.44, 0.16], pos: [0, 2.4, 0.36], rot: [10, 0, 0], color: "faction" },
  { shape: "box", size: [0.28, 0.36, 0.07], pos: [0.3, 2.4, 0.37], rot: [10, -10, 0], color: "light", mirror: true },
  { shape: "box", size: [0.7, 0.34, 0.09], pos: [0, 2.46, -0.36], rot: [-10, 0, 0], color: "faction" },
  { shape: "box", size: [0.2, 0.03, 0.03], pos: [0, 2.52, 0.455], rot: [10, 0, 0], color: "glow" },
  { shape: "cylinder", sides: 8, radius: 0.3, height: 0.06, pos: [0, 2.8, 0], color: "dark" },
  { shape: "cylinder", sides: 8, radius: 0.2, height: 0.36, pos: [0, 2.85, 0], color: "metal" },
];

/** Buste (pivot « torse », dessiné à sa hauteur d'origine puis abaissé de 0,2). */
const buste: Part[] = [
  // couronne de taille (pivot), abdomen à plaques
  { shape: "cylinder", sides: 8, radius: 0.28, height: 0.12, pos: [0, 3.2, 0], color: "dark", pivot: T },
  { shape: "bevel", size: [0.66, 0.38, 0.5], pos: [0, 3.42, 0.02], color: "dark", parent: T },
  { shape: "box", size: [0.24, 0.13, 0.07], pos: [0.14, 3.35, 0.29], color: "faction", mirror: true, parent: T },
  { shape: "box", size: [0.24, 0.13, 0.07], pos: [0.14, 3.51, 0.29], color: "faction", mirror: true, parent: T },
  // buste en V : deux blocs et plaques superposées
  { shape: "bevel", size: [1.2, 0.45, 0.8], pos: [0, 3.76, 0], color: "faction", parent: T },
  { shape: "bevel", size: [1.7, 0.58, 0.95], pos: [0, 4.18, -0.02], color: "faction", parent: T },
  { shape: "bevel", size: [0.42, 0.4, 0.66], pos: [0.92, 4.24, -0.04], rot: [0, 0, -10], color: "dark", mirror: true, parent: T },
  { shape: "bevel", size: [0.95, 0.5, 0.16], pos: [0, 4.12, 0.47], rot: [-6, 0, 0], color: "light", parent: T },
  { shape: "bevel", size: [0.75, 0.28, 0.14], pos: [0, 3.74, 0.42], rot: [8, 0, 0], color: "light", parent: T },
  { shape: "bevel", size: [0.44, 0.42, 0.14], pos: [0.66, 4.2, 0.42], rot: [0, 14, 0], color: "light", mirror: true, parent: T },
  { shape: "box", size: [0.3, 0.2, 0.08], pos: [0.62, 3.84, 0.38], rot: [10, 18, 0], color: "dark", mirror: true, parent: T },
  // cœur lumineux et filets
  { shape: "cylinder", sides: 8, radius: 0.19, height: 0.05, pos: [0, 4.1, 0.56], rot: [90, 0, 0], color: "dark", parent: T },
  { shape: "cylinder", sides: 8, radius: 0.12, height: 0.07, pos: [0, 4.1, 0.575], rot: [90, 0, 0], color: "glow", parent: T },
  { shape: "box", size: [0.03, 0.34, 0.03], pos: [0.5, 4.15, 0.56], rot: [-6, 0, 0], color: "glow", mirror: true, parent: T },
  { shape: "box", size: [0.44, 0.03, 0.03], pos: [0.66, 4.44, 0.5], rot: [0, 14, 0], color: "glow", mirror: true, parent: T },
  // évents latéraux et feux
  { shape: "box", size: [0.04, 0.04, 0.42], pos: [0.86, 4.0, -0.05], color: "black", mirror: true, parent: T },
  { shape: "box", size: [0.04, 0.04, 0.42], pos: [0.86, 4.1, -0.05], color: "black", mirror: true, parent: T },
  { shape: "box", size: [0.04, 0.04, 0.42], pos: [0.86, 4.2, -0.05], color: "black", mirror: true, parent: T },
  { shape: "box", size: [0.07, 0.06, 0.06], pos: [0.82, 4.42, 0.3], color: "amber", mirror: true, parent: T },
  // col et tête
  { shape: "box", size: [0.66, 0.14, 0.5], pos: [0, 4.5, -0.02], color: "dark", parent: T },
  { shape: "cylinder", sides: 6, radius: 0.12, height: 0.16, pos: [0, 4.6, 0.04], color: "metal", parent: T },
  { shape: "bevel", size: [0.42, 0.34, 0.46], pos: [0, 4.8, 0.1], color: "light", parent: T },
  { shape: "wedge", size: [0.32, 0.12, 0.14], pos: [0, 4.67, 0.36], color: "faction", parent: T },
  { shape: "box", size: [0.34, 0.06, 0.03], pos: [0, 4.83, 0.34], color: "glow", parent: T },
  { shape: "box", size: [0.06, 0.12, 0.4], pos: [0, 5.01, 0.06], color: "faction", parent: T },
  { shape: "cylinder", sides: 6, radius: 0.07, height: 0.08, pos: [0.24, 4.8, 0.06], rot: [0, 0, 90], color: "dark", mirror: true, parent: T },
  entre([0.26, 4.84, 0.02], [0.34, 5.42, -0.2], 0.016, 0, { shape: "cylinder", sides: 5, color: "metal", parent: T }),
  { shape: "sphere", radius: 0.035, pos: [0.34, 5.43, -0.2], color: "amber", parent: T },
  entre([-0.26, 4.84, 0.02], [-0.3, 5.16, -0.12], 0.016, 0, { shape: "cylinder", sides: 5, color: "metal", parent: T }),
  // sac dorsal : réacteur, ailettes, cheminées, câbles
  { shape: "bevel", size: [1.0, 0.8, 0.45], pos: [0, 4.0, -0.6], color: "dark", parent: T },
  { shape: "box", size: [0.8, 0.28, 0.16], pos: [0, 4.38, -0.74], rot: [-15, 0, 0], color: "faction", parent: T },
  { shape: "cylinder", sides: 8, radius: 0.2, height: 0.08, pos: [0, 3.92, -0.84], rot: [90, 0, 0], color: "glow", parent: T },
  { shape: "box", size: [0.04, 0.6, 0.22], pos: [0.3, 3.95, -0.88], color: "metal", mirror: true, parent: T },
  { shape: "box", size: [0.04, 0.5, 0.18], pos: [0.42, 3.95, -0.86], color: "metal", mirror: true, parent: T },
  { shape: "cylinder", sides: 6, radius: 0.08, height: 0.4, pos: [0.32, 4.46, -0.74], rot: [-15, 0, 0], color: "metal", mirror: true, parent: T },
  { shape: "cylinder", sides: 5, radius: 0.06, height: 0.03, pos: [0.32, 4.655, -0.79], rot: [-15, 0, 0], color: "glow", mirror: true, parent: T },
  entre([0.15, 3.6, -0.82], [0.2, 3.22, -0.25], 0.03, 0, { shape: "cylinder", sides: 5, color: "black", mirror: true, parent: T }),
];

/** Épaules et bras-canons (pivot « torse »), dessinés à x d'origine puis écartés de 0,15. */
const bras: Part[] = [
  // épaules : articulation et épaulières à trois lames
  { shape: "cylinder", sides: 6, radius: 0.2, height: 0.32, pos: [1.0, 4.22, 0], rot: [0, 0, 90], color: "metal", mirror: true, parent: T },
  { shape: "bevel", size: [0.82, 0.26, 0.98], pos: [1.3, 4.48, 0], rot: [0, 0, -18], color: "faction", mirror: true, parent: T },
  { shape: "bevel", size: [0.7, 0.22, 0.9], pos: [1.56, 4.28, 0], rot: [0, 0, -32], color: "light", mirror: true, parent: T },
  { shape: "box", size: [0.46, 0.14, 0.82], pos: [1.77, 4.05, 0], rot: [0, 0, -46], color: "dark", mirror: true, parent: T },
  { shape: "box", size: [0.6, 0.03, 0.04], pos: [1.3, 4.5, 0.5], rot: [0, 0, -18], color: "glow", mirror: true, parent: T },
  { shape: "box", size: [0.08, 0.05, 0.05], pos: [1.62, 4.28, 0.46], rot: [0, 0, -32], color: "amber", mirror: true, parent: T },
  { shape: "box", size: [0.5, 0.04, 0.04], pos: [1.56, 4.26, -0.46], rot: [0, 0, -32], color: "black", mirror: true, parent: T },
  // lance-missiles sur l'épaule droite
  { shape: "box", size: [0.4, 0.28, 0.55], pos: [1.18, 4.74, -0.12], rot: [0, 0, -18], color: "dark", parent: T },
  { shape: "box", size: [0.32, 0.2, 0.04], pos: [1.18, 4.74, 0.16], rot: [0, 0, -18], color: "black", parent: T },
  { shape: "box", size: [0.07, 0.07, 0.03], pos: [1.11, 4.77, 0.18], rot: [0, 0, -18], color: "red", parent: T },
  { shape: "box", size: [0.07, 0.07, 0.03], pos: [1.25, 4.72, 0.18], rot: [0, 0, -18], color: "red", parent: T },
  // antenne radio sur l'épaule gauche
  { shape: "cylinder", sides: 5, radius: 0.02, radiusTop: 0.012, height: 0.6, pos: [-1.3, 4.9, -0.3], color: "metal", parent: T },
  { shape: "box", size: [0.04, 0.04, 0.04], pos: [-1.3, 5.21, -0.3], color: "amber", parent: T },
  // bras : biceps, coude, vérin
  entre([1.1, 4.15, 0], [1.5, 3.32, 0.05], 0.26, 0.28, { shape: "bevel", color: "dark", mirror: true, parent: T }),
  entre([1.25, 4.02, 0], [1.64, 3.46, 0.05], 0.09, 0.3, { shape: "box", color: "light", mirror: true, parent: T }),
  { shape: "cylinder", sides: 6, radius: 0.15, height: 0.34, pos: [1.54, 3.3, 0.05], rot: [0, 0, 90], color: "metal", mirror: true, parent: T },
  entre([1.06, 4.05, -0.17], [1.56, 3.16, -0.2], 0.035, 0, { shape: "cylinder", sides: 6, color: "metal", mirror: true, parent: T }),
    // avant-bras canon : caisson, plaques, chargeur, canons
  { shape: "bevel", size: [0.44, 0.44, 1.1], pos: [1.72, 3.05, 0.35], color: "light", mirror: true, parent: T },
  { shape: "box", size: [0.34, 0.08, 0.86], pos: [1.72, 3.3, 0.32], color: "faction", mirror: true, parent: T },
  { shape: "bevel", size: [0.1, 0.34, 0.8], pos: [1.96, 3.05, 0.28], color: "faction", mirror: true, parent: T },
  { shape: "box", size: [0.03, 0.05, 0.6], pos: [2.02, 3.05, 0.28], color: "glow", mirror: true, parent: T },
  { shape: "cylinder", sides: 6, radius: 0.2, height: 0.14, pos: [2.0, 3.02, -0.12], rot: [0, 0, 90], color: "dark", mirror: true, parent: T },
  { shape: "box", size: [0.16, 0.1, 0.1], pos: [2.02, 3.02, -0.12], color: "amber", mirror: true, parent: T },
  { shape: "box", size: [0.3, 0.06, 0.4], pos: [1.72, 2.8, 0.45], color: "dark", mirror: true, parent: T },
  { shape: "cylinder", sides: 6, radius: 0.09, height: 1.0, pos: [1.72, 3.06, 1.35], rot: [90, 0, 0], color: "metal", mirror: true, parent: T },
  { shape: "cylinder", sides: 6, radius: 0.12, height: 0.12, pos: [1.72, 3.06, 1.1], rot: [90, 0, 0], color: "dark", mirror: true, parent: T },
  { shape: "cylinder", sides: 8, radius: 0.13, height: 0.2, pos: [1.72, 3.06, 1.88], rot: [90, 0, 0], color: "dark", mirror: true, parent: T },
  { shape: "cylinder", sides: 6, radius: 0.07, height: 0.04, pos: [1.72, 3.06, 1.98], rot: [90, 0, 0], color: "glow", mirror: true, parent: T },
  { shape: "cylinder", sides: 6, radius: 0.045, height: 0.7, pos: [1.72, 2.84, 1.2], rot: [90, 0, 0], color: "metal", mirror: true, parent: T },
];

export const colossus: Model = {
  parts: [...jambe(1), ...jambe(-1), ...bassin, ...decale(0, -0.2, buste), ...decale(0.15, -0.2, bras)],
};
