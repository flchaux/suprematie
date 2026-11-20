// roach : Char Blatte (expérimentale). Caisse basse sur deux chenilles de caoutchouc en stade à galets
// d'acier, barbotin et poulie, patins sur le brin supérieur, garde-boue profilés à nervures et bande de
// danger, jupes à filet cyan. Élytres bombées en trois plaques superposées de chaque côté (joint lumineux, taches
// ambre, évents à lames), pronotum bombé à crête, capteurs vitrés et feux ; abdomen à trois anneaux, tuyères
// tournées cyan, feux arrière et cerques articulés ; antenne de liaison. Six pattes fines (pivots
// « jambe… », trépied alterné) : moyeu de hanche d'acier, fémur blindé à épines et vérin à tige polie,
// genou à voyant, tibia épineux, tarse et griffe. Tête pivotante (pivot « tourelle ») : yeux composés
// cyan, canons-mandibules d'acier tournés à bagues de refroidissement et frein de bouche, crochets, palpes
// et longues antennes articulées. Pièces fines : patins, galets, lames, boulons, flexibles, bagues.
import { stade } from "../kit.ts";
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
    sur(coxa, 0, 0, 0, { shape: "cylinder", sides: 8, radius: 0.16, height: 0.3, color: "steel", pivot: name }, "moyeu"),
    sur(coxa, 0, 0, 0, { shape: "cylinder", sides: 6, radius: 0.08, height: 0.36, color: "dark", fine: true }, "moyeu"),
    sur(coxa, 0.55, 0, 0, { shape: "box", size: [0.36, 0.18, 0.2], color: "dark" }, "long"),
    // fémur blindé : filet cyan, deux épines, vérin à tige polie
    sur(femur, 0.5, 0, 0, { shape: "bevel", size: [0.92, 0.2, 0.18], color: "faction", bevel: 0.04 }, "long"),
    sur(femur, 0.5, 0.105, 0, { shape: "box", size: [0.6, 0.02, 0.05], color: "glow" }, "long"),
    sur(femur, 0.35, 0.1, 0, { shape: "cone", sides: 5, radius: 0.035, height: 0.16, color: "dark", fine: true }, "long"),
    sur(femur, 0.7, 0.1, 0, { shape: "cone", sides: 5, radius: 0.035, height: 0.16, color: "dark" }, "long"),
    sur(femur, 0.3, -0.13, 0, { shape: "cylinder", sides: 6, radius: 0.04, height: 0.34, color: "dark" }, "tube"),
    sur(femur, 0.62, -0.13, 0, { shape: "cylinder", sides: 6, radius: 0.022, height: 0.34, color: "steel", fine: true }, "tube"),
    // genou : moyeu d'acier et voyant ambre
    sur(tibia, 0, 0, 0, { shape: "cylinder", sides: 10, radius: 0.12, height: 0.26, color: "steel" }, "moyeu"),
    sur(tibia, 0, 0, 0.14, { shape: "box", size: [0.06, 0.06, 0.03], color: "amber", fine: true }, "long"),
    // tibia : âme d'acier, plaque du camp, épines
    sur(tibia, 0.5, 0, 0, { shape: "box", size: [1.2, 0.09, 0.09], color: "steel" }, "long"),
    sur(tibia, 0.3, 0.03, 0, { shape: "box", size: [0.55, 0.11, 0.14], color: "faction" }, "long"),
    sur(tibia, 0.62, 0.05, 0, { shape: "cone", sides: 5, radius: 0.03, height: 0.14, color: "dark", fine: true }, "long"),
    sur(tibia, 0.8, 0.05, 0, { shape: "cone", sides: 5, radius: 0.03, height: 0.14, color: "dark" }, "long"),
    // cheville, tarse, griffe
    sur(tarse, 0, 0, 0, { shape: "sphere", radius: 0.07, detail: 0, color: "dark", fine: true }),
    sur(tarse, 0.5, 0, 0, { shape: "cylinder", sides: 5, radius: 0.05, radiusTop: 0.03, height: 0.32, color: "light" }, "tube"),
    sur(griffe, 0.5, 0, 0, { shape: "cone", sides: 5, radius: 0.045, height: 0.2, color: "dark" }, "tube"),
  ];
  return parts.map((p, i) => cote(i === 0 ? p : { ...p, parent: name }, side));
}

/** Antenne articulée côté droit, portée par la tête (pivot « tourelle ») ; `side` = -1 pour la gauche. */
function antenne(side: 1 | -1): Part[] {
  const s = chaine([0.3, 1.26, 2.86], -66, [[46, 0.6], [20, 0.75, -70], [0, 0.75, -74]]);
  const parts: Part[] = [
    { shape: "sphere", radius: 0.07, detail: 0, pos: [0.3, 1.26, 2.86], color: "steel" },
    sur(s[0], 0.5, 0, 0, { shape: "cylinder", sides: 5, radius: 0.028, height: 0.6, color: "steel" }, "tube"),
    sur(s[1], 0, 0, 0, { shape: "box", size: [0.07, 0.07, 0.07], color: "amber" }, "long"),
    sur(s[1], 0.5, 0, 0, { shape: "cylinder", sides: 5, radius: 0.022, height: 0.75, color: "light" }, "tube"),
    sur(s[2], 0.5, 0, 0, { shape: "cylinder", sides: 4, radius: 0.017, height: 0.75, color: "light" }, "tube"),
    sur(s[2], 1, 0, 0, { shape: "box", size: [0.08, 0.05, 0.05], color: "glow" }, "long"),
  ];
  return parts.map((p) => cote({ ...p, parent: "tourelle" }, side));
}

/** Cerque articulé à l'arrière (côté droit ; `side` = -1 pour la gauche). */
function cerque(side: 1 | -1): Part[] {
  const [a, b] = chaine([0.42, 1.0, -3.12], 70, [[12, 0.42], [-4, 0.36, 76]]);
  return [
    sur(a, 0.5, 0, 0, { shape: "cylinder", sides: 5, radius: 0.06, radiusTop: 0.045, height: 0.42, color: "steel" }, "tube"),
    sur(b, 0, 0, 0, { shape: "box", size: [0.08, 0.08, 0.08], color: "dark" }, "long"),
    sur(b, 0.5, 0, 0, { shape: "cone", sides: 5, radius: 0.045, height: 0.36, color: "light" }, "tube"),
  ].map((p) => cote(p, side));
}

/** Profil de face (x, y) d'une plaque d'élytre bombée, extrudée sur sa longueur. */
const ELYTRE: [number, number][] = [[-0.6, -0.13], [0.6, -0.13], [0.6, -0.03], [0.45, 0.08], [0.15, 0.13], [-0.6, 0.13]];

/** Profil de face du pronotum bombé. */
const PRONOTUM: [number, number][] = [[-1.2, -0.19], [1.2, -0.19], [1.2, -0.06], [0.95, 0.1], [0.4, 0.19], [-0.4, 0.19], [-0.95, 0.1], [-1.2, -0.06]];

/** Canon-mandibule (côté droit, mirror) : fût d'acier tourné le long de +z, base en z = 2.75. */
const FUT: [number, number][] = [[0.11, 0], [0.11, 0.12], [0.085, 0.16], [0.085, 1.0], [0.13, 1.03], [0.13, 1.33], [0.08, 1.36]];

export const roach: Model = {
  parts: [
    // chenilles : bande de caoutchouc en stade, galets, barbotin avant, poulie arrière, patins
    { shape: "extrude", profile: stade(3.9, 0.66, 5), depth: 0.72, bevel: 0.05, pos: [1.15, 0.34, -0.2], rot: [0, -90, 0], color: "rubber", mirror: true },
    { shape: "extrude", profile: stade(3.6, 0.44, 4), depth: 0.76, pos: [1.15, 0.34, -0.2], rot: [0, -90, 0], color: "dark", mirror: true, fine: true },
    ...[0.75, -0.2, -1.15].map((z): Part => ({ shape: "cylinder", sides: 10, radius: 0.2, height: 0.78, pos: [1.15, 0.28, z], rot: [0, 0, 90], color: "steel", mirror: true, fine: true })),
    { shape: "cylinder", sides: 10, radius: 0.3, height: 0.8, bevel: 0.04, pos: [1.15, 0.36, 1.55], rot: [0, 0, 90], color: "steel", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.27, height: 0.8, bevel: 0.04, pos: [1.15, 0.34, -1.95], rot: [0, 0, 90], color: "steel", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.1, height: 0.84, pos: [1.15, 0.36, 1.55], rot: [0, 0, 90], color: "dark", mirror: true, fine: true },
    ...[-1.6, -1.2, -0.8, -0.4, 0.0, 0.4, 0.8, 1.2].map((z): Part => ({ shape: "box", size: [0.72, 0.03, 0.08], pos: [1.15, 0.68, z], color: "metal", mirror: true, fine: true })),
    // garde-boue profilé à nervures et bande de danger, jupe à filet cyan
    { shape: "extrude", profile: [[-1.8, 0.68], [1.6, 0.68], [1.95, 0.6], [1.85, 0.8], [-1.8, 0.8]], depth: 0.9, bevel: 0.03, pos: [1.15, 0, -0.2], rot: [0, -90, 0], color: "metal", mirror: true },
    { shape: "box", size: [0.7, 0.02, 0.12], pos: [1.15, 0.81, 1.45], color: "hazard", mirror: true, fine: true },
    ...[-1.4, -0.9, -0.4, 0.1, 0.6, 1.1].map((z): Part => ({ shape: "box", size: [0.8, 0.02, 0.04], pos: [1.15, 0.81, z], color: "dark", mirror: true, fine: true })),
    { shape: "box", size: [0.05, 0.24, 2.9], pos: [1.6, 0.6, -0.2], color: "dark", mirror: true },
    { shape: "box", size: [0.03, 0.04, 2.5], pos: [1.635, 0.62, -0.2], color: "glow", mirror: true },
    ...[-1.2, -0.2, 0.8].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.03, pos: [1.63, 0.7, z], rot: [0, 0, 90], color: "steel", mirror: true, fine: true })),
    // caisse
    { shape: "bevel", size: [2.0, 0.62, 4.0], pos: [0, 0.92, -0.1], color: "dark" },
    // élytres bombées : trois plaques superposées par côté (l'avant recouvre l'arrière), liseré, joint lumineux
    { shape: "extrude", profile: ELYTRE, depth: 1.5, bevel: 0.04, pos: [0.6, 1.48, 0.35], rot: [8, 0, -9], color: "faction", mirror: true },
    { shape: "extrude", profile: ELYTRE, depth: 1.45, bevel: 0.04, pos: [0.62, 1.42, -0.78], rot: [8, 0, -9], color: "faction", mirror: true },
    { shape: "extrude", profile: ELYTRE, depth: 1.35, bevel: 0.04, pos: [0.6, 1.35, -1.85], rot: [9, 0, -9], color: "faction", mirror: true },
    { shape: "box", size: [0.06, 0.07, 3.55], pos: [1.2, 1.33, -0.75], rot: [3, 0, -9], color: "light", mirror: true },
    { shape: "box", size: [0.05, 0.06, 3.4], pos: [0, 1.6, -0.75], rot: [3, 0, 0], color: "glow" },
    { shape: "box", size: [0.26, 0.04, 0.26], pos: [0.62, 1.6, -0.72], rot: [5, 45, -9], color: "amber", mirror: true },
    ...[0.25, 0.45].map((z): Part => ({ shape: "box", size: [0.3, 0.02, 0.04], pos: [0.85, 1.6, z], rot: [8, 0, -9], color: "dark", mirror: true, fine: true })),
    // évents à lames sur l'élytre arrière
    { shape: "box", size: [0.56, 0.03, 0.56], pos: [0.58, 1.49, -1.82], rot: [6, 0, -9], color: "black", mirror: true },
    ...[-1.62, -1.82, -2.02].map((z): Part => ({ shape: "box", size: [0.5, 0.03, 0.06], pos: [0.58, 1.51, z], rot: [6, 0, -9], color: "glow", mirror: true })),
    ...[-1.72, -1.92].map((z): Part => ({ shape: "box", size: [0.5, 0.03, 0.04], pos: [0.58, 1.515, z], rot: [6, 0, -9], color: "steel", mirror: true, fine: true })),
    // pronotum bombé : bouclier, crête, liseré lumineux, feux et capteurs vitrés
    { shape: "extrude", profile: PRONOTUM, depth: 1.35, bevel: 0.05, pos: [0, 1.36, 1.5], rot: [-12, 0, 0], color: "faction" },
    { shape: "extrude", profile: [[-0.3, -0.07], [0.3, -0.07], [0.18, 0.07], [-0.18, 0.07]], depth: 1.0, bevel: 0.02, pos: [0, 1.6, 1.42], rot: [-12, 0, 0], color: "dark" },
    { shape: "box", size: [0.08, 0.03, 0.8], pos: [0, 1.675, 1.44], rot: [-12, 0, 0], color: "glow" },
    { shape: "box", size: [2.0, 0.05, 0.05], pos: [0, 1.48, 2.17], rot: [-12, 0, 0], color: "glow" },
    { shape: "box", size: [0.16, 0.06, 0.1], pos: [0.95, 1.5, 1.95], rot: [-12, 0, 0], color: "amber", mirror: true },
    { shape: "sphere", radius: 0.11, detail: 1, pos: [0.7, 1.6, 1.25], color: "glass", mirror: true },
    { shape: "torus", radius: 0.11, tube: 0.02, sides: 10, pos: [0.7, 1.56, 1.25], color: "steel", mirror: true, fine: true },
    // abdomen : trois anneaux, tuyères tournées, feux arrière, cerques
    { shape: "bevel", size: [1.9, 0.34, 0.62], pos: [0, 1.15, -2.38], rot: [-8, 0, 0], color: "light" },
    { shape: "bevel", size: [1.6, 0.32, 0.6], pos: [0, 1.06, -2.8], rot: [-12, 0, 0], color: "light" },
    { shape: "bevel", size: [1.25, 0.3, 0.55], pos: [0, 0.97, -3.18], rot: [-16, 0, 0], color: "light" },
    ...[-2.38, -2.8].map((z, i): Part => ({ shape: "box", size: [r3(1.7 - i * 0.3), 0.02, 0.04], pos: [0, r3(1.33 - i * 0.08), r3(z - 0.2)], color: "dark", fine: true })),
    { shape: "lathe", sides: 10, pos: [0.42, 0.72, -2.96], rot: [-90, 0, 0], color: "steel", mirror: true, profile: [[0.14, 0], [0.15, 0.05], [0.13, 0.22], [0.16, 0.28], [0.1, 0.29]] },
    { shape: "cylinder", sides: 10, radius: 0.11, height: 0.03, pos: [0.42, 0.72, -3.22], rot: [90, 0, 0], color: "glow", mirror: true },
    { shape: "box", size: [0.16, 0.07, 0.05], pos: [0.78, 1.05, -2.66], color: "amber", mirror: true },
    ...cerque(1),
    ...cerque(-1),
    // antenne de liaison dorsale
    { shape: "tube", radius: 0.02, sides: 4, path: [[-0.4, 1.5, -1.2], [-0.4, 2.36, -1.38]], color: "light", fine: true },
    { shape: "cylinder", sides: 8, radius: 0.06, height: 0.06, pos: [-0.4, 1.55, -1.2], color: "steel" },
    { shape: "box", size: [0.06, 0.06, 0.06], pos: [-0.4, 2.39, -1.39], color: "amber", fine: true },
    // pattes (trépied alterné : avant droite, milieu gauche, arrière droite ensemble)
    ...patteBlatte("jambe_d1", 1, 1.2, -20),
    ...patteBlatte("jambe_d2_ar", 1, 0, 0),
    ...patteBlatte("jambe_d3", 1, -1.2, 20),
    ...patteBlatte("jambe_g_1", -1, 1.2, -20),
    ...patteBlatte("jambe_g_2_ar", -1, 0, 0),
    ...patteBlatte("jambe_g_3", -1, -1.2, 20),
    // tête pivotante : capsule, plaque, yeux composés, canons-mandibules, crochets, palpes, antennes
    { shape: "bevel", size: [1.2, 0.58, 0.85], pos: [0, 0.95, 2.55], color: "dark", pivot: "tourelle" },
    { shape: "extrude", profile: [[-0.52, -0.08], [0.52, -0.08], [0.42, 0.08], [-0.42, 0.08]], depth: 0.72, bevel: 0.03, pos: [0, 1.28, 2.5], rot: [-8, 0, 0], color: "faction", parent: "tourelle" },
    { shape: "sphere", radius: 0.17, detail: 1, pos: [0.5, 1.1, 2.78], color: "glow", mirror: true, parent: "tourelle" },
    { shape: "torus", radius: 0.16, tube: 0.025, sides: 10, pos: [0.5, 1.1, 2.76], rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", fine: true },
    { shape: "bevel", size: [0.3, 0.26, 0.85], pos: [0.5, 0.8, 3.0], rot: [0, -15, 0], color: "light", mirror: true, parent: "tourelle" },
    { shape: "lathe", sides: 10, pos: [0.36, 0.88, 2.75], rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle", profile: FUT },
    ...[3.25, 3.4, 3.55].map((z, i): Part => ({ shape: "cylinder", sides: 8, radius: 0.12, height: 0.05, pos: [0.36, 0.88, z], rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", ...(i === 1 ? { fine: true } : {}) })),
    { shape: "box", size: [0.12, 0.12, 0.03], pos: [0.36, 0.88, 4.11], color: "amber", mirror: true, parent: "tourelle" },
    { shape: "cone", sides: 5, radius: 0.07, height: 0.45, pos: [0.42, 0.62, 3.42], rot: [90, 0, 40], color: "steel", mirror: true, parent: "tourelle" },
    { shape: "tube", radius: 0.03, sides: 4, path: [[0.18, 0.72, 2.85], [0.18, 0.5, 3.15]], color: "light", mirror: true, parent: "tourelle", fine: true },
    ...antenne(1),
    ...antenne(-1),
  ],
};
