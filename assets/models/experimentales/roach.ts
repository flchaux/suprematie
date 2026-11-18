// roach : Char Blatte (expérimentale). Caisse basse sur deux chenilles à galets, barbotin et poulie,
// garde-boue aux couleurs du camp et jupes à filet cyan. Élytres en trois plaques superposées de chaque
// côté (joint lumineux, taches ambre, évents), pronotum à crête, capteurs vitrés et feux ; abdomen à
// trois anneaux, tuyères cyan, feux arrière et cerques articulés ; antenne de liaison. Six pattes fines
// (pivots « jambe… », trépied alterné) : moyeu de hanche, fémur blindé à épines et vérin, genou à
// voyant, tibia épineux, tarse et griffe. Tête pivotante (pivot « tourelle ») : yeux composés cyan,
// canons-mandibules à bagues de refroidissement et frein de bouche, crochets, palpes et longues antennes
// articulées. 3808 triangles.
import type { Model, Part, Vec3 } from "../types.ts";

const r3 = (v: number): number => +v.toFixed(3);

/** Repère d'un segment (côté droit) : départ, direction, normale (haut du segment), latérale. */
interface Seg {
  a: Vec3;
  b: Vec3;
  d: Vec3;
  n: Vec3;
  l: Vec3;
  yaw: number;
  tilt: number;
  len: number;
}

/**
 * Chaîne de segments depuis `from` : `yaw` en degrés autour de y (négatif : vers l'avant), puis pour
 * chaque segment [pente en degrés (positive : vers le haut), longueur, lacet propre facultatif].
 */
function chaine(from: Vec3, yaw: number, segs: ([number, number] | [number, number, number])[]): Seg[] {
  const out: Seg[] = [];
  let p = from;
  for (const [tilt, len, y2] of segs) {
    const sy = y2 ?? yaw;
    const ay = (sy * Math.PI) / 180;
    const t = (tilt * Math.PI) / 180;
    const d: Vec3 = [Math.cos(t) * Math.cos(ay), Math.sin(t), -Math.cos(t) * Math.sin(ay)];
    const n: Vec3 = [-Math.sin(t) * Math.cos(ay), Math.cos(t), Math.sin(t) * Math.sin(ay)];
    const l: Vec3 = [Math.sin(ay), 0, Math.cos(ay)];
    const b: Vec3 = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
    out.push({ a: p, b, d, n, l, yaw: sy, tilt, len });
    p = b;
  }
  return out;
}

/**
 * Pose une pièce sur un segment : à la fraction `t` de sa longueur, décalée de `up` selon sa normale et
 * de `lat` sur le côté. Orientation : « long » (boîte, longueur en x ; un cône pointe alors selon la
 * normale), « tube » (cylindre ou cône dans l'axe, pointe vers le bout), « moyeu » (cylindre en travers).
 */
function sur(s: Seg, t: number, up: number, lat: number, p: Part, axe?: "long" | "tube" | "moyeu"): Part {
  const k = t * s.len;
  const pos: Vec3 = [0, 1, 2].map((i) => r3(s.a[i] + s.d[i] * k + s.n[i] * up + s.l[i] * lat)) as Vec3;
  const rot: Vec3 | undefined =
    axe === "long" ? [0, s.yaw, s.tilt] : axe === "tube" ? [0, s.yaw, s.tilt - 90] : axe === "moyeu" ? [0, s.yaw + 90, 90] : p.rot;
  return { ...p, pos, rot };
}

/** Copie d'une pièce du côté droit vers le côté `side` (symétrie en x). */
function cote(p: Part, side: 1 | -1): Part {
  if (side === 1) return p;
  const pos = p.pos ?? [0, 0, 0];
  const rot = p.rot ?? [0, 0, 0];
  return { ...p, pos: [-pos[0], pos[1], pos[2]], rot: [rot[0], -rot[1], -rot[2]] };
}

/** Patte de blatte (pivot `name` au moyeu de hanche) : hanche côté droit, `side` = -1 pour la gauche. */
function patteBlatte(name: string, side: 1 | -1, z: number, yaw: number): Part[] {
  const [coxa, femur, tibia, tarse] = chaine([1.5, 1.0, z], yaw, [[20, 0.32], [32, 0.9], [-68, 1.2], [-84, 0.32]]);
  const griffe = chaine(tarse.b, yaw, [[-70, 0.2]])[0];
  const parts: Part[] = [
    // hanche (pivot) et coxa
    sur(coxa, 0, 0, 0, { shape: "cylinder", sides: 5, radius: 0.16, height: 0.3, color: "metal", pivot: name }, "moyeu"),
    sur(coxa, 0.55, 0, 0, { shape: "box", size: [0.36, 0.18, 0.2], color: "dark" }, "long"),
    // fémur blindé : filet cyan, deux épines, vérin
    sur(femur, 0.5, 0, 0, { shape: "bevel", size: [0.92, 0.2, 0.18], color: "faction", bevel: 0.04 }, "long"),
    sur(femur, 0.5, 0.105, 0, { shape: "box", size: [0.6, 0.02, 0.05], color: "glow" }, "long"),
    sur(femur, 0.35, 0.1, 0, { shape: "cone", sides: 5, radius: 0.035, height: 0.16, color: "dark" }, "long"),
    sur(femur, 0.7, 0.1, 0, { shape: "cone", sides: 5, radius: 0.035, height: 0.16, color: "dark" }, "long"),
    sur(femur, 0.45, -0.13, 0, { shape: "cylinder", sides: 5, radius: 0.03, height: 0.6, color: "metal" }, "tube"),
    // genou : moyeu et voyant ambre
    sur(tibia, 0, 0, 0, { shape: "cylinder", sides: 5, radius: 0.12, height: 0.26, color: "metal" }, "moyeu"),
    sur(tibia, 0, 0, 0.14, { shape: "box", size: [0.06, 0.06, 0.03], color: "amber" }, "long"),
    // tibia : âme métal, plaque du camp, épines
    sur(tibia, 0.5, 0, 0, { shape: "box", size: [1.2, 0.09, 0.09], color: "metal" }, "long"),
    sur(tibia, 0.3, 0.03, 0, { shape: "box", size: [0.55, 0.11, 0.14], color: "faction" }, "long"),
    sur(tibia, 0.62, 0.05, 0, { shape: "cone", sides: 5, radius: 0.03, height: 0.14, color: "dark" }, "long"),
    sur(tibia, 0.8, 0.05, 0, { shape: "cone", sides: 5, radius: 0.03, height: 0.14, color: "dark" }, "long"),
    // cheville, tarse, griffe
    sur(tarse, 0, 0, 0, { shape: "sphere", radius: 0.07, detail: 0, color: "dark" }),
    sur(tarse, 0.5, 0, 0, { shape: "cylinder", sides: 5, radius: 0.05, radiusTop: 0.03, height: 0.32, color: "light" }, "tube"),
    sur(griffe, 0.5, 0, 0, { shape: "cone", sides: 5, radius: 0.045, height: 0.2, color: "dark" }, "tube"),
  ];
  return parts.map((p, i) => cote(i === 0 ? p : { ...p, parent: name }, side));
}

/** Antenne articulée côté droit, portée par la tête (pivot « tourelle ») ; `side` = -1 pour la gauche. */
function antenne(side: 1 | -1): Part[] {
  const s = chaine([0.3, 1.26, 2.86], -66, [[46, 0.6], [20, 0.75, -70], [0, 0.75, -74]]);
  const parts: Part[] = [
    { shape: "sphere", radius: 0.07, detail: 0, pos: [0.3, 1.26, 2.86], color: "metal" },
    sur(s[0], 0.5, 0, 0, { shape: "box", size: [0.6, 0.05, 0.05], color: "metal" }, "long"),
    sur(s[1], 0, 0, 0, { shape: "box", size: [0.07, 0.07, 0.07], color: "amber" }, "long"),
    sur(s[1], 0.5, 0, 0, { shape: "box", size: [0.75, 0.04, 0.04], color: "light" }, "long"),
    sur(s[2], 0.5, 0, 0, { shape: "box", size: [0.75, 0.03, 0.03], color: "light" }, "long"),
    sur(s[2], 1, 0, 0, { shape: "box", size: [0.08, 0.05, 0.05], color: "glow" }, "long"),
  ];
  return parts.map((p) => cote({ ...p, parent: "tourelle" }, side));
}

/** Cerque articulé à l'arrière (côté droit ; `side` = -1 pour la gauche). */
function cerque(side: 1 | -1): Part[] {
  const [a, b] = chaine([0.42, 1.0, -3.12], 70, [[12, 0.42], [-4, 0.36, 76]]);
  return [
    sur(a, 0.5, 0, 0, { shape: "cylinder", sides: 5, radius: 0.06, radiusTop: 0.045, height: 0.42, color: "metal" }, "tube"),
    sur(b, 0, 0, 0, { shape: "box", size: [0.08, 0.08, 0.08], color: "dark" }, "long"),
    sur(b, 0.5, 0, 0, { shape: "cone", sides: 5, radius: 0.045, height: 0.36, color: "light" }, "tube"),
  ].map((p) => cote(p, side));
}

export const roach: Model = {
  parts: [
    // chenilles : bande, galets, barbotin avant, poulie arrière, garde-boue, jupe à filet cyan
    { shape: "bevel", size: [0.72, 0.66, 3.9], pos: [1.15, 0.34, -0.2], color: "black", bevel: 0.22, mirror: true },
    ...[0.75, -0.2, -1.15].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.2, height: 0.76, pos: [1.15, 0.28, z], rot: [0, 0, 90], color: "dark", mirror: true })),
    { shape: "cylinder", sides: 8, radius: 0.3, height: 0.78, pos: [1.15, 0.36, 1.55], rot: [0, 0, 90], color: "metal", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.27, height: 0.78, pos: [1.15, 0.34, -1.95], rot: [0, 0, 90], color: "metal", mirror: true },
    { shape: "bevel", size: [0.9, 0.12, 3.6], pos: [1.15, 0.74, -0.2], color: "metal", bevel: 0.04, mirror: true },
    { shape: "box", size: [0.05, 0.24, 2.9], pos: [1.6, 0.6, -0.2], color: "dark", mirror: true },
    { shape: "box", size: [0.03, 0.04, 2.5], pos: [1.635, 0.62, -0.2], color: "glow", mirror: true },
    // caisse
    { shape: "bevel", size: [2.0, 0.62, 4.0], pos: [0, 0.92, -0.1], color: "dark" },
    // élytres : trois plaques superposées par côté (l'avant recouvre l'arrière), liseré, joint lumineux
    { shape: "bevel", size: [1.2, 0.26, 1.5], pos: [0.6, 1.48, 0.35], rot: [8, 0, -9], color: "faction", mirror: true },
    { shape: "bevel", size: [1.22, 0.26, 1.45], pos: [0.62, 1.42, -0.78], rot: [8, 0, -9], color: "faction", mirror: true },
    { shape: "bevel", size: [1.15, 0.26, 1.35], pos: [0.6, 1.35, -1.85], rot: [9, 0, -9], color: "faction", mirror: true },
    { shape: "box", size: [0.06, 0.07, 3.55], pos: [1.2, 1.33, -0.75], rot: [3, 0, -9], color: "light", mirror: true },
    { shape: "box", size: [0.05, 0.06, 3.4], pos: [0, 1.6, -0.75], rot: [3, 0, 0], color: "glow" },
    { shape: "box", size: [0.26, 0.04, 0.26], pos: [0.6, 1.585, -0.72], rot: [5, 45, -9], color: "amber", mirror: true },
    ...[-1.62, -1.82, -2.02].map((z): Part => ({ shape: "box", size: [0.5, 0.03, 0.06], pos: [0.58, 1.5, z], rot: [6, 0, -9], color: "glow", mirror: true })),
    // pronotum : bouclier, crête, liseré lumineux, feux et capteurs vitrés
    { shape: "bevel", size: [2.4, 0.38, 1.35], pos: [0, 1.36, 1.5], rot: [-12, 0, 0], color: "faction" },
    { shape: "bevel", size: [0.6, 0.14, 1.0], pos: [0, 1.57, 1.42], rot: [-12, 0, 0], color: "dark" },
    { shape: "box", size: [0.08, 0.03, 0.8], pos: [0, 1.645, 1.44], rot: [-12, 0, 0], color: "glow" },
    { shape: "box", size: [2.0, 0.05, 0.05], pos: [0, 1.48, 2.17], rot: [-12, 0, 0], color: "glow" },
    { shape: "box", size: [0.16, 0.06, 0.1], pos: [0.95, 1.5, 1.95], rot: [-12, 0, 0], color: "amber", mirror: true },
    { shape: "sphere", radius: 0.11, detail: 0, pos: [0.7, 1.6, 1.25], color: "glass", mirror: true },
    // abdomen : trois anneaux, tuyères, feux arrière, cerques
    { shape: "bevel", size: [1.9, 0.34, 0.62], pos: [0, 1.15, -2.38], rot: [-8, 0, 0], color: "light" },
    { shape: "bevel", size: [1.6, 0.32, 0.6], pos: [0, 1.06, -2.8], rot: [-12, 0, 0], color: "light" },
    { shape: "bevel", size: [1.25, 0.3, 0.55], pos: [0, 0.97, -3.18], rot: [-16, 0, 0], color: "light" },
    { shape: "cylinder", sides: 6, radius: 0.14, height: 0.28, pos: [0.42, 0.72, -3.1], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.1, height: 0.04, pos: [0.42, 0.72, -3.25], rot: [90, 0, 0], color: "glow", mirror: true },
    { shape: "box", size: [0.16, 0.07, 0.05], pos: [0.78, 1.05, -2.66], color: "amber", mirror: true },
    ...cerque(1),
    ...cerque(-1),
    // antenne de liaison dorsale
    { shape: "cylinder", sides: 5, radius: 0.02, height: 0.9, pos: [-0.4, 1.95, -1.3], rot: [-12, 0, 0], color: "light" },
    { shape: "box", size: [0.06, 0.06, 0.06], pos: [-0.4, 2.39, -1.39], color: "amber" },
    // pattes (trépied alterné : avant droite, milieu gauche, arrière droite ensemble)
    ...patteBlatte("jambe_d1", 1, 1.2, -20),
    ...patteBlatte("jambe_d2_ar", 1, 0, 0),
    ...patteBlatte("jambe_d3", 1, -1.2, 20),
    ...patteBlatte("jambe_g_1", -1, 1.2, -20),
    ...patteBlatte("jambe_g_2_ar", -1, 0, 0),
    ...patteBlatte("jambe_g_3", -1, -1.2, 20),
    // tête pivotante : capsule, plaque, yeux composés, canons-mandibules, crochets, palpes, antennes
    { shape: "bevel", size: [1.2, 0.58, 0.85], pos: [0, 0.95, 2.55], color: "dark", pivot: "tourelle" },
    { shape: "bevel", size: [1.05, 0.16, 0.72], pos: [0, 1.28, 2.5], rot: [-8, 0, 0], color: "faction", parent: "tourelle" },
    { shape: "sphere", radius: 0.17, detail: 1, pos: [0.5, 1.1, 2.78], color: "glow", mirror: true, parent: "tourelle" },
    { shape: "bevel", size: [0.3, 0.26, 0.85], pos: [0.5, 0.8, 3.0], rot: [0, -15, 0], color: "light", mirror: true, parent: "tourelle" },
    { shape: "cylinder", sides: 8, radius: 0.085, height: 1.3, pos: [0.36, 0.88, 3.4], rot: [90, 0, 0], color: "metal", mirror: true, parent: "tourelle" },
    ...[3.25, 3.5].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.125, height: 0.07, pos: [0.36, 0.88, z], rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle" })),
    { shape: "cylinder", sides: 8, radius: 0.13, height: 0.24, pos: [0.36, 0.88, 3.98], rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle" },
    { shape: "box", size: [0.12, 0.12, 0.03], pos: [0.36, 0.88, 4.11], color: "amber", mirror: true, parent: "tourelle" },
    { shape: "cone", sides: 5, radius: 0.07, height: 0.45, pos: [0.42, 0.62, 3.42], rot: [90, 0, 40], color: "metal", mirror: true, parent: "tourelle" },
    { shape: "cylinder", sides: 5, radius: 0.03, height: 0.4, pos: [0.18, 0.62, 3.0], rot: [130, 0, 0], color: "light", mirror: true, parent: "tourelle" },
    ...antenne(1),
    ...antenne(-1),
  ],
};
