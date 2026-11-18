// fortress : forteresse marchante quadrupède. Quatre pattes articulées en diagonale (pivots jambe_d1,
// jambe_g_1, jambe_d2_ar, jambe_g_2_ar à la hanche : marche au trot), avec vérins, genouillères,
// jambières superposées et pieds griffus ; coque à pans étagée, glacis avant, jupes de blindage,
// créneaux le long du pont ; château arrière à passerelle vitrée, radar tournant et cheminées ;
// tourelle principale à double canon (pivot tourelle) et deux tourelles secondaires (tourelle2,
// tourelle3). (3996 triangles)
import type { ColorName, Model, Part, Vec3 } from "../types.ts";

const r3 = (v: number): number => +v.toFixed(3);
const DEG = 180 / Math.PI;
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Cylindre de `a` à `b` (axe local y le long du segment). */
function tige(a: Vec3, b: Vec3, r: number, p: Part): Part {
  const v: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(v[0], v[1], v[2]);
  return {
    shape: "cylinder", radius: r, height: r3(len), ...p,
    pos: [r3((a[0] + b[0]) / 2), r3((a[1] + b[1]) / 2), r3((a[2] + b[2]) / 2)],
    rot: [r3(Math.atan2(v[2], v[1]) * DEG), 0, r3(Math.asin(-v[0] / len) * DEG)],
  };
}

/**
 * Segment de patte de `a` à `b` dans un plan vertical : boîte dont l'axe x suit le segment,
 * `ep` = épaisseur dans le plan (normale n), `la` = largeur horizontale. Décalage `dn` le long de n,
 * portion `t0`..`t1` du segment.
 */
function seg(a: Vec3, b: Vec3, ep: number, la: number, p: Part, dn = 0, t0 = 0, t1 = 1): Part {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const h = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const tilt = Math.atan2(dy, h);
  const n: Vec3 = [-Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw)];
  const len = Math.hypot(dx, dy, dz) * (t1 - t0);
  const c = add(lerp(a, b, (t0 + t1) / 2), n, dn);
  return { shape: "box", ...p, size: [r3(len), ep, la], pos: [r3(c[0]), r3(c[1]), r3(c[2])], rot: [0, r3(yaw * DEG), r3(tilt * DEG)] };
}

/** Patte articulée : `sx` côté (1 droite), `sz` avant (1) ou arrière (-1), pivot à la hanche. */
function patte(name: string, sx: 1 | -1, sz: 1 | -1): Part[] {
  const phi = (35 * Math.PI) / 180;
  const u: Vec3 = [sx * Math.cos(phi), 0, sz * Math.sin(phi)];
  const yaw = Math.atan2(-u[2], u[0]) * DEG;
  const H: Vec3 = [sx * 1.7, 2.15, sz * 1.45];
  const K: Vec3 = add(add(H, u, 0.85), [0, 0.6, 0]);
  const A: Vec3 = add(add(H, u, 1.12), [0, -1.75, 0]);
  const c = (color: ColorName): { color: ColorName; parent: string } => ({ color, parent: name });
  // articulation : cylindre couché perpendiculaire au plan de la patte
  const axe = (p: Vec3, r: number, h: number, sides: number, color: ColorName): Part =>
    ({ shape: "cylinder", sides, radius: r, height: h, pos: p.map(r3) as Vec3, rot: [0, r3(yaw + 90), 90], ...c(color) });
  const pied = (dyaw: number, color: ColorName): Part => {
    const a = ((yaw + dyaw) * Math.PI) / 180;
    return { shape: "box", size: [0.4, 0.14, 0.2], pos: [r3(A[0] + Math.cos(a) * 0.44), 0.08, r3(A[2] - Math.sin(a) * 0.44)], rot: [0, r3(yaw + dyaw), 0], ...c(color) };
  };
  const hanche: Part = { ...axe(H, 0.3, 0.56, 8, "metal"), pivot: name };
  delete hanche.parent;
  const parts: Part[] = [
    // hanche (pivot) et carter
    hanche,
    { shape: "bevel", size: [0.5, 0.5, 0.66], pos: add(H, [0, 0.06, 0]).map(r3) as Vec3, rot: [0, r3(yaw), 0], ...c("faction") },
    // cuisse : ossature, plaque supérieure, filet lumineux, vérin
    seg(H, K, 0.36, 0.42, { shape: "bevel", ...c("dark") }),
    seg(H, K, 0.08, 0.5, c("light"), 0.22, 0.25, 1),
    seg(H, K, 0.03, 0.08, c("glow"), 0.27, 0.35, 0.9),
    tige(add(add(H, u, 0.3), [0, -0.32, 0]), add(add(K, u, -0.15), [0, -0.3, 0]), 0.075, { sides: 6, ...c("metal") }),
    // genou
    axe(K, 0.25, 0.54, 6, "metal"),
    { shape: "bevel", size: [0.46, 0.3, 0.5], pos: add(add(K, [0, 0.18, 0]), u, 0.08).map(r3) as Vec3, rot: [0, r3(yaw), -20 * sx], ...c("faction") },
    { shape: "box", size: [0.06, 0.06, 0.2], pos: add(add(K, [0, 0.3, 0]), u, 0.3).map(r3) as Vec3, rot: [0, r3(yaw), 0], ...c("amber") },
    // tibia : ossature, jambières superposées, bande de danger, filet, vérin
    seg(K, A, 0.38, 0.44, { shape: "bevel", ...c("dark") }),
    seg(K, A, 0.12, 0.52, { shape: "bevel", ...c("light") }, 0.23, 0.08, 0.62),
    seg(K, A, 0.1, 0.46, c("faction"), 0.25, 0.58, 0.86),
    seg(K, A, 0.03, 0.07, c("glow"), 0.295, 0.15, 0.5),
    seg(K, A, 0.4, 0.46, c("hazard"), 0, 0.88, 0.95),
    tige(add(K, u, -0.3), add(lerp(K, A, 0.72), u, -0.28), 0.06, { sides: 6, ...c("metal") }),
    // cheville et pied griffu
    axe(A, 0.17, 0.44, 6, "metal"),
    { shape: "cylinder", sides: 8, radius: 0.46, radiusTop: 0.36, height: 0.22, pos: [r3(A[0]), 0.11, r3(A[2])], ...c("dark") },
    pied(-55, "black"),
    pied(0, "black"),
    pied(55, "black"),
  ];
  return parts;
}

/** Tourelle secondaire : couronne (pivot), caisson, deux canons. */
function tourelleSec(name: string, x: number, z: number): Part[] {
  const p = (q: Part): Part => ({ ...q, parent: name });
  return [
    { shape: "cylinder", sides: 8, radius: 0.42, height: 0.16, pos: [x, 3.24, z], color: "metal", pivot: name },
    p({ shape: "bevel", size: [0.62, 0.34, 0.72], pos: [x, 3.48, z - 0.02], color: "light" }),
    p({ shape: "box", size: [0.46, 0.06, 0.5], pos: [x, 3.68, z - 0.08], color: "faction" }),
    p({ shape: "box", size: [0.4, 0.05, 0.03], pos: [x, 3.52, z + 0.345], color: "glow" }),
    p({ shape: "box", size: [0.3, 0.22, 0.2], pos: [x, 3.46, z + 0.42], color: "dark" }),
    p({ shape: "cylinder", sides: 6, radius: 0.05, height: 0.9, pos: [x + 0.09, 3.46, z + 0.9], rot: [90, 0, 0], color: "metal" }),
    p({ shape: "cylinder", sides: 6, radius: 0.05, height: 0.9, pos: [x - 0.09, 3.46, z + 0.9], rot: [90, 0, 0], color: "metal" }),
    p({ shape: "box", size: [0.3, 0.08, 0.1], pos: [x, 3.46, z + 1.3], color: "dark" }),
  ];
}

/** Créneaux le long d'un bord du pont (côté droit, mirror). */
function creneaux(x: number, zs: number[]): Part[] {
  return zs.map((z) => ({ shape: "box", size: [0.2, 0.2, 0.3], pos: [x, 3.25, z], color: "light", mirror: true }) as Part);
}

const TP = "tourelle";

export const fortress: Model = {
  parts: [
    ...patte("jambe_d1", 1, 1),
    ...patte("jambe_g_1", -1, 1),
    ...patte("jambe_d2_ar", 1, -1),
    ...patte("jambe_g_2_ar", -1, -1),
    // coque à pans étagée
    { shape: "bevel", size: [2.6, 0.5, 3.4], pos: [0, 1.75, -0.1], color: "dark", bevel: 0.2 },
    { shape: "bevel", size: [3.6, 0.6, 4.2], pos: [0, 2.2, 0], color: "dark", bevel: 0.28 },
    { shape: "bevel", size: [3.2, 0.7, 3.9], pos: [0, 2.8, -0.05], color: "faction", bevel: 0.3 },
    { shape: "box", size: [0.5, 0.05, 0.7], pos: [0.85, 3.16, 0.0], color: "black", mirror: true },
    { shape: "box", size: [0.04, 0.05, 0.6], pos: [0.85, 3.17, 0.0], color: "glow", mirror: true },
    // glacis avant, phares, filet
    { shape: "wedge", size: [2.8, 0.5, 0.6], pos: [0, 2.6, 2.2], color: "faction" },
    { shape: "bevel", size: [2.4, 0.3, 0.2], pos: [0, 2.2, 2.15], color: "light" },
    { shape: "box", size: [1.6, 0.05, 0.04], pos: [0, 2.2, 2.255], color: "glow" },
    { shape: "box", size: [0.2, 0.1, 0.04], pos: [1.0, 2.2, 2.255], color: "amber", mirror: true },
    // jupes de blindage superposées et filet latéral
    { shape: "box", size: [0.12, 0.62, 1.25], pos: [1.72, 2.55, 1.15], rot: [0, 0, 10], color: "light", mirror: true },
    { shape: "box", size: [0.12, 0.62, 1.25], pos: [1.76, 2.5, 0.0], rot: [0, 0, 10], color: "light", mirror: true },
    { shape: "box", size: [0.12, 0.62, 1.25], pos: [1.72, 2.55, -1.15], rot: [0, 0, 10], color: "light", mirror: true },
    { shape: "box", size: [0.03, 0.05, 3.2], pos: [1.83, 2.3, 0], rot: [0, 0, 10], color: "glow", mirror: true },
    { shape: "box", size: [0.05, 0.3, 0.18], pos: [1.65, 2.85, 0.6], color: "black", mirror: true },
    { shape: "box", size: [0.05, 0.3, 0.18], pos: [1.65, 2.85, -0.6], color: "black", mirror: true },
    // créneaux
    ...creneaux(1.48, [0.6, -1.15, -1.65]),
    { shape: "box", size: [0.3, 0.2, 0.2], pos: [1.15, 3.25, -1.92], color: "light", mirror: true },
    // nacelles fixes avant
    { shape: "box", size: [0.4, 0.3, 0.6], pos: [1.38, 3.3, 1.45], color: "dark", mirror: true },
    { shape: "box", size: [0.03, 0.05, 0.4], pos: [1.59, 3.3, 1.45], color: "glow", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.8, pos: [1.38, 3.3, 2.1], rot: [90, 0, 0], color: "metal", mirror: true },
    { shape: "box", size: [0.16, 0.16, 0.14], pos: [1.38, 3.3, 2.5], color: "dark", mirror: true },
    // château arrière : blocs étagés, passerelle vitrée, mâts, radar
    { shape: "bevel", size: [1.6, 0.75, 1.3], pos: [0, 3.55, -1.35], color: "light" },
    { shape: "bevel", size: [1.2, 0.4, 0.9], pos: [0, 4.1, -1.45], color: "faction" },
    { shape: "box", size: [1.0, 0.1, 0.03], pos: [0, 4.15, -0.995], color: "glass" },
    { shape: "box", size: [1.2, 0.06, 0.03], pos: [0, 3.7, -0.695], color: "glow" },
    { shape: "box", size: [0.1, 0.06, 0.04], pos: [0.7, 3.4, -0.7], color: "amber", mirror: true },
    { shape: "cylinder", sides: 5, radius: 0.03, radiusTop: 0.015, height: 0.8, pos: [0.45, 4.6, -1.7], color: "metal", mirror: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.45, 5.0, -1.7], color: "amber", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.3, pos: [0, 4.45, -1.35], color: "metal" },
    { shape: "box", size: [0.6, 0.22, 0.05], pos: [0, 4.65, -1.35], rot: [-15, 0, 0], color: "light", pivot: "radar" },
    { shape: "box", size: [0.06, 0.06, 0.2], pos: [0, 4.65, -1.25], color: "glow", parent: "radar" },
    // cheminées et bloc moteur arrière
    { shape: "bevel", size: [2.2, 0.5, 0.35], pos: [0, 2.55, -2.1], color: "dark" },
    { shape: "box", size: [0.5, 0.25, 0.04], pos: [0.6, 2.55, -2.28], color: "glow", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.13, height: 0.8, pos: [0.6, 3.6, -2.05], color: "metal", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.1, height: 0.04, pos: [0.6, 4.0, -2.05], color: "glow", mirror: true },
    { shape: "box", size: [0.2, 0.3, 0.3], pos: [0.6, 3.25, -1.92], color: "dark", mirror: true },
    // tourelle principale (pivot) : couronne, caisson à pans, masque, double canon
    { shape: "cylinder", sides: 8, radius: 0.95, height: 0.2, pos: [0, 3.25, 0.85], color: "metal", pivot: TP },
    { shape: "bevel", size: [1.7, 0.6, 1.7], pos: [0, 3.62, 0.8], color: "light", bevel: 0.24, parent: TP },
    { shape: "bevel", size: [1.25, 0.16, 1.2], pos: [0, 3.98, 0.7], color: "faction", parent: TP },
    { shape: "box", size: [0.1, 0.46, 1.4], pos: [0.87, 3.58, 0.8], rot: [0, 0, 12], color: "faction", mirror: true, parent: TP },
    { shape: "box", size: [0.03, 0.05, 1.1], pos: [0.93, 3.62, 0.8], rot: [0, 0, 12], color: "glow", mirror: true, parent: TP },
    { shape: "bevel", size: [1.1, 0.46, 0.3], pos: [0, 3.6, 1.72], color: "dark", parent: TP },
    { shape: "box", size: [0.08, 0.05, 0.04], pos: [0.5, 3.78, 1.88], color: "amber", mirror: true, parent: TP },
    { shape: "bevel", size: [1.3, 0.46, 0.4], pos: [0, 3.58, -0.18], color: "dark", parent: TP },
    { shape: "box", size: [0.04, 0.3, 0.3], pos: [0.3, 3.58, -0.4], color: "black", mirror: true, parent: TP },
    { shape: "cylinder", sides: 6, radius: 0.22, height: 0.18, pos: [0.38, 4.12, 0.45], color: "dark", parent: TP },
    { shape: "box", size: [0.3, 0.05, 0.03], pos: [0.38, 4.12, 0.67], color: "glass", parent: TP },
    { shape: "cylinder", sides: 5, radius: 0.02, height: 0.7, pos: [-0.5, 4.3, 0.2], color: "metal", parent: TP },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 2.4, pos: [0.32, 3.62, 3.0], rot: [90, 0, 0], color: "metal", mirror: true, parent: TP },
    { shape: "cylinder", sides: 6, radius: 0.17, height: 0.45, pos: [0.32, 3.62, 2.05], rot: [90, 0, 0], color: "dark", mirror: true, parent: TP },
    { shape: "cylinder", sides: 6, radius: 0.15, height: 0.1, pos: [0.32, 3.62, 3.2], rot: [90, 0, 0], color: "dark", mirror: true, parent: TP },
    { shape: "cylinder", sides: 8, radius: 0.18, height: 0.32, pos: [0.32, 3.62, 4.32], rot: [90, 0, 0], color: "dark", mirror: true, parent: TP },
    { shape: "cylinder", sides: 6, radius: 0.08, height: 0.04, pos: [0.32, 3.62, 4.49], rot: [90, 0, 0], color: "glow", mirror: true, parent: TP },
    // tourelles secondaires
    ...tourelleSec("tourelle2", 1.3, -0.35),
    ...tourelleSec("tourelle3", -1.3, -0.35),
  ],
};
