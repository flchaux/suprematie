// fortress : forteresse marchante quadrupède. Quatre pattes articulées en diagonale (pivots jambe_d1,
// jambe_g_1, jambe_d2_ar, jambe_g_2_ar à la hanche : marche au trot), avec axes d'acier, vérins à tige
// polie, genouillères, jambières superposées, flexibles hydrauliques et pieds tournés à griffes ; coque à
// pans étagée, glacis avant, jupes de blindage, créneaux, grilles de ventilation et conduites de cuivre
// sur le pont ; château arrière à passerelle vitrée, radar tournant, cheminées tournées et mâts ; tourelle
// principale à pans et double canon à frein de bouche (pivot tourelle), tourelleau et lance-fumigènes ;
// deux tourelles secondaires (tourelle2, tourelle3). Pièces fines : lames des grilles, boulons,
// flexibles, antennes, lance-fumigènes.
import type { ColorName, Model, Part, Vec3 } from "../types.ts";

const r3 = (v: number): number => +v.toFixed(3);
const DEG = 180 / Math.PI;
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const v3 = (p: Vec3): Vec3 => p.map(r3) as Vec3;

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

/** Vérin de `a` à `b` : corps sombre sur 55 % de la course, tige d'acier poli sur le reste. */
function verin(a: Vec3, b: Vec3, r: number, c: { parent: string; fine?: boolean }): Part[] {
  const m = lerp(a, b, 0.55);
  return [
    tige(a, m, r, { sides: 6, color: "dark", ...c }),
    tige(lerp(a, b, 0.5), b, r3(r * 0.55), { sides: 6, color: "steel", ...c }),
  ];
}

/** Profil d'une griffe de pied (x : vers la pointe, y : hauteur), extrudée sur sa largeur. */
const GRIFFE: [number, number][] = [[-0.2, -0.07], [0.2, -0.07], [0.04, 0.07], [-0.2, 0.07]];

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
  const axe = (p: Vec3, r: number, h: number, sides: number, color: ColorName, bevel = 0): Part =>
    ({ shape: "cylinder", sides, radius: r, height: h, pos: v3(p), rot: [0, r3(yaw + 90), 90], ...(bevel ? { bevel } : {}), ...c(color) });
  const pied = (dyaw: number): Part => {
    const a = ((yaw + dyaw) * Math.PI) / 180;
    return { shape: "extrude", profile: GRIFFE, depth: 0.2, pos: [r3(A[0] + Math.cos(a) * 0.44), 0.08, r3(A[2] - Math.sin(a) * 0.44)], rot: [0, r3(yaw + dyaw), 0], ...c("dark") };
  };
  const hanche: Part = { ...axe(H, 0.3, 0.56, 12, "steel", 0.04), pivot: name };
  delete hanche.parent;
  const perp: Vec3 = [-u[2], 0, u[0]];
  const parts: Part[] = [
    // hanche (pivot), moyeu sombre et carter
    hanche,
    { ...axe(H, 0.17, 0.62, 8, "dark"), fine: true },
    { shape: "bevel", size: [0.5, 0.5, 0.66], pos: v3(add(H, [0, 0.06, 0])), rot: [0, r3(yaw), 0], ...c("faction") },
    // cuisse : ossature, plaque supérieure, filet lumineux, vérin
    seg(H, K, 0.36, 0.42, c("dark")),
    seg(H, K, 0.08, 0.5, c("light"), 0.22, 0.25, 1),
    seg(H, K, 0.03, 0.08, c("glow"), 0.27, 0.35, 0.9),
    ...verin(add(add(H, u, 0.3), [0, -0.32, 0]), add(add(K, u, -0.15), [0, -0.3, 0]), 0.08, { parent: name }),
    // genou : axe d'acier, genouillère, voyant
    axe(K, 0.25, 0.54, 10, "steel"),
    { ...axe(K, 0.12, 0.6, 6, "dark"), fine: true },
    { shape: "bevel", size: [0.46, 0.3, 0.5], pos: v3(add(add(K, [0, 0.18, 0]), u, 0.08)), rot: [0, r3(yaw), -20 * sx], ...c("faction") },
    { shape: "box", size: [0.06, 0.06, 0.2], pos: v3(add(add(K, [0, 0.3, 0]), u, 0.3)), rot: [0, r3(yaw), 0], ...c("amber"), fine: true },
    // tibia : ossature, jambières superposées, bande de danger, filet, vérin
    seg(K, A, 0.38, 0.44, c("dark")),
    seg(K, A, 0.12, 0.52, c("light"), 0.23, 0.08, 0.62),
    seg(K, A, 0.1, 0.46, c("faction"), 0.25, 0.58, 0.86),
    seg(K, A, 0.03, 0.07, c("glow"), 0.295, 0.15, 0.5),
    seg(K, A, 0.4, 0.46, { ...c("hazard"), fine: true }, 0, 0.88, 0.95),
    ...verin(add(K, u, -0.3), add(lerp(K, A, 0.72), u, -0.28), 0.065, { parent: name, fine: true }),
    // flexibles hydrauliques et boulons (fins)
    { shape: "tube", radius: 0.025, sides: 5, path: [v3(add(add(H, perp, 0.3), [0, -0.1, 0])), v3(add(add(lerp(H, K, 0.5), perp, 0.28), [0, -0.12, 0])), v3(add(add(K, perp, 0.3), [0, -0.15, 0])), v3(add(lerp(K, A, 0.4), perp, 0.3))], bend: 0.12, color: "copper", parent: name, fine: true },
    ...[0.2, 0.4].map((t): Part => seg(K, A, 0.03, 0.06, { shape: "box", color: "steel", parent: name, fine: true }, 0.295, t, t + 0.04)),
    // cheville et pied tourné à griffes
    axe(A, 0.17, 0.44, 10, "steel"),
    { shape: "lathe", sides: 12, pos: [r3(A[0]), 0, r3(A[2])], ...c("dark"), profile: [[0.47, 0], [0.47, 0.08], [0.34, 0.22], [0, 0.25]] },
    { shape: "torus", radius: 0.44, tube: 0.025, sides: 12, pos: [r3(A[0]), 0.1, r3(A[2])], ...c("hazard"), fine: true },
    pied(-55),
    pied(0),
    pied(55),
  ];
  return parts;
}

/** Contour (vue de dessus) des casemates de tourelles secondaires. */
const CASEMATE: [number, number][] = [[-0.3, -0.37], [0.3, -0.37], [0.33, 0.12], [0.2, 0.35], [-0.2, 0.35], [-0.33, 0.12]];

/** Tourelle secondaire : couronne (pivot), casemate à pans, toit d'équipe, deux canons d'acier. */
function tourelleSec(name: string, x: number, z: number): Part[] {
  const p = (q: Part): Part => ({ ...q, parent: name });
  return [
    { shape: "cylinder", sides: 12, radius: 0.42, height: 0.16, pos: [x, 3.24, z], color: "steel", pivot: name },
    p({ shape: "extrude", profile: CASEMATE, depth: 0.34, bevel: 0.04, pos: [x, 3.48, r3(z - 0.02)], rot: [90, 0, 0], color: "light" }),
    p({ shape: "extrude", profile: CASEMATE, depth: 0.05, pos: [x, 3.67, r3(z - 0.05)], rot: [90, 0, 0], scale: [0.75, 0.75, 1], color: "faction" }),
    p({ shape: "box", size: [0.4, 0.05, 0.03], pos: [x, 3.52, r3(z + 0.345)], color: "glow" }),
    p({ shape: "box", size: [0.3, 0.22, 0.2], pos: [x, 3.46, r3(z + 0.42)], color: "dark" }),
    p({ shape: "lathe", sides: 8, pos: [r3(x + 0.09), 3.46, r3(z + 0.45)], rot: [90, 0, 0], color: "steel", profile: [[0.05, 0], [0.05, 0.75], [0.065, 0.78], [0.065, 0.9]] }),
    p({ shape: "lathe", sides: 8, pos: [r3(x - 0.09), 3.46, r3(z + 0.45)], rot: [90, 0, 0], color: "steel", profile: [[0.05, 0], [0.05, 0.75], [0.065, 0.78], [0.065, 0.9]] }),
    p({ shape: "box", size: [0.06, 0.05, 0.05], pos: [r3(x + 0.15), 3.72, r3(z - 0.2)], color: "amber", fine: true }),
  ];
}

/** Grille de ventilation à plat : cadre noir et lames d'acier (fines) dans l'axe x. */
function grille(x: number, y: number, z: number, w: number, l: number, n: number): Part[] {
  const out: Part[] = [{ shape: "box", size: [w, 0.04, l], pos: [x, y, z], color: "black", mirror: true }];
  for (let i = 0; i < n; i++) out.push({ shape: "box", size: [r3(w - 0.05), 0.03, 0.04], pos: [x, r3(y + 0.025), r3(z - l / 2 + ((i + 0.5) * l) / n)], color: "steel", mirror: true, fine: true });
  return out;
}

/** Créneaux le long d'un bord du pont (côté droit, mirror). */
function creneaux(x: number, zs: number[]): Part[] {
  return zs.map((z) => ({ shape: "box", size: [0.2, 0.2, 0.3], pos: [x, 3.25, z], color: "light", mirror: true }) as Part);
}

/** Contour (vue de dessus) de la tourelle principale à pans, nez vers +z. */
const TOURELLE: [number, number][] = [[-0.72, -0.95], [0.72, -0.95], [0.86, -0.4], [0.86, 0.45], [0.55, 0.92], [-0.55, 0.92], [-0.86, 0.45], [-0.86, -0.4]];

/** Fût du canon principal (base en z = 0 vers +z) : manchon, tube, évacuateur, frein de bouche. */
const FUT: [number, number][] = [[0.17, 0.45], [0.12, 0.5], [0.12, 1.15], [0.155, 1.2], [0.155, 1.48], [0.105, 1.53], [0.105, 2.38], [0.18, 2.4], [0.18, 2.68], [0.08, 2.71]];

const TP = "tourelle";

export const fortress: Model = {
  parts: [
    ...patte("jambe_d1", 1, 1),
    ...patte("jambe_g_1", -1, 1),
    ...patte("jambe_d2_ar", 1, -1),
    ...patte("jambe_g_2_ar", -1, -1),
    // coque à pans étagée
    { shape: "box", size: [2.6, 0.5, 3.4], pos: [0, 1.75, -0.1], color: "dark" },
    { shape: "bevel", size: [3.6, 0.6, 4.2], pos: [0, 2.2, 0], color: "dark", bevel: 0.28 },
    { shape: "bevel", size: [3.2, 0.7, 3.9], pos: [0, 2.8, -0.05], color: "faction", bevel: 0.3 },
    // grilles de ventilation et trappes sur le pont
    ...grille(0.85, 3.16, 0.0, 0.5, 0.7, 6),
    { shape: "box", size: [0.04, 0.05, 0.6], pos: [0.85, 3.17, 0.0], color: "glow", mirror: true },
    { shape: "box", size: [0.4, 0.05, 0.4], pos: [0.55, 3.16, -0.9], color: "steel", mirror: true },
    { shape: "box", size: [0.42, 0.03, 0.05], pos: [0.55, 3.18, -0.68], color: "hazard", mirror: true, fine: true },
    ...[[1.2, 1.2], [1.2, -1.0], [0.3, 1.6], [0.3, -1.25]].map(([x, z]): Part => ({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.03, pos: [x, 3.16, z], color: "steel", mirror: true, fine: true })),
    // conduites de cuivre le long du pont
    { shape: "tube", radius: 0.045, sides: 6, path: [[1.32, 3.17, 1.0], [1.32, 3.17, -1.0], [0.85, 3.17, -1.2]], bend: 0.15, color: "copper", mirror: true },
    { shape: "torus", radius: 0.06, tube: 0.018, sides: 8, pos: [1.32, 3.17, 0.3], rot: [90, 0, 0], color: "steel", mirror: true, fine: true },
    // glacis avant, phares, filet
    { shape: "wedge", size: [2.8, 0.5, 0.6], pos: [0, 2.6, 2.2], color: "faction" },
    { shape: "bevel", size: [2.4, 0.3, 0.2], pos: [0, 2.2, 2.15], color: "light" },
    { shape: "box", size: [1.6, 0.05, 0.04], pos: [0, 2.2, 2.255], color: "glow" },
    { shape: "box", size: [0.2, 0.1, 0.04], pos: [1.0, 2.2, 2.255], color: "amber", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.07, height: 0.06, pos: [0.6, 2.2, 2.27], rot: [90, 0, 0], color: "glass", mirror: true, fine: true },
    // jupes de blindage superposées et filet latéral
    { shape: "box", size: [0.12, 0.62, 1.25], pos: [1.72, 2.55, 1.15], rot: [0, 0, 10], color: "light", mirror: true },
    { shape: "box", size: [0.12, 0.62, 1.25], pos: [1.76, 2.5, 0.0], rot: [0, 0, 10], color: "light", mirror: true },
    { shape: "box", size: [0.12, 0.62, 1.25], pos: [1.72, 2.55, -1.15], rot: [0, 0, 10], color: "light", mirror: true },
    { shape: "box", size: [0.03, 0.05, 3.2], pos: [1.83, 2.3, 0], rot: [0, 0, 10], color: "glow", mirror: true },
    ...[1.15, 0.0, -1.15].map((z): Part => ({ shape: "box", size: [0.03, 0.04, 0.04], pos: [1.83, 2.75, r3(z + 0.45)], color: "steel", mirror: true, fine: true })),
    { shape: "box", size: [0.05, 0.3, 0.18], pos: [1.65, 2.85, 0.6], color: "black", mirror: true },
    { shape: "box", size: [0.05, 0.3, 0.18], pos: [1.65, 2.85, -0.6], color: "black", mirror: true },
    // créneaux
    ...creneaux(1.48, [0.6, -1.15, -1.65]),
    { shape: "box", size: [0.3, 0.2, 0.2], pos: [1.15, 3.25, -1.92], color: "light", mirror: true },
    // nacelles fixes avant : caisson, canon d'acier tourné
    { shape: "box", size: [0.4, 0.3, 0.6], pos: [1.38, 3.3, 1.45], color: "dark", mirror: true },
    { shape: "box", size: [0.03, 0.05, 0.4], pos: [1.59, 3.3, 1.45], color: "glow", mirror: true },
    { shape: "lathe", sides: 8, pos: [1.38, 3.3, 1.7], rot: [90, 0, 0], color: "steel", mirror: true, profile: [[0.06, 0], [0.06, 0.66], [0.085, 0.68], [0.085, 0.87]] },
    // château arrière : blocs étagés, passerelle vitrée, mâts, radar
    { shape: "bevel", size: [1.6, 0.75, 1.3], pos: [0, 3.55, -1.35], color: "light" },
    { shape: "extrude", profile: [[-1.9, 3.9], [-1.0, 3.9], [-0.95, 4.12], [-1.1, 4.3], [-1.9, 4.3]], depth: 1.2, bevel: 0.04, rot: [0, -90, 0], color: "faction" },
    { shape: "box", size: [1.0, 0.1, 0.03], pos: [0, 4.17, -0.985], rot: [-40, 0, 0], color: "glass" },
    { shape: "box", size: [1.2, 0.06, 0.03], pos: [0, 3.7, -0.695], color: "glow" },
    { shape: "box", size: [0.1, 0.06, 0.04], pos: [0.7, 3.4, -0.7], color: "amber", mirror: true },
    { shape: "tube", radius: 0.025, sides: 4, path: [[0.45, 4.25, -1.7], [0.45, 4.98, -1.7]], color: "light", mirror: true, fine: true },
    { shape: "box", size: [0.25, 0.015, 0.015], pos: [0.45, 4.75, -1.7], color: "light", mirror: true, fine: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.45, 5.0, -1.7], color: "amber", mirror: true, fine: true },
    { shape: "cylinder", sides: 8, radius: 0.07, height: 0.3, pos: [0, 4.45, -1.35], color: "steel" },
    { shape: "box", size: [0.6, 0.22, 0.05], pos: [0, 4.65, -1.35], rot: [-15, 0, 0], color: "light", pivot: "radar" },
    { shape: "box", size: [0.06, 0.06, 0.2], pos: [0, 4.65, -1.25], color: "glow", parent: "radar" },
    { shape: "box", size: [0.5, 0.03, 0.04], pos: [0, 4.75, -1.33], rot: [-15, 0, 0], color: "dark", parent: "radar", fine: true },
    // cheminées tournées et bloc moteur arrière
    { shape: "extrude", profile: [[-1.1, -0.25], [1.1, -0.25], [1.1, 0.15], [0.95, 0.25], [-0.95, 0.25], [-1.1, 0.15]], depth: 0.35, bevel: 0.04, pos: [0, 2.55, -2.1], color: "dark" },
    { shape: "box", size: [0.5, 0.25, 0.04], pos: [0.6, 2.55, -2.28], color: "glow", mirror: true },
    ...[-0.5, -0.4, -0.3].map((y): Part => ({ shape: "box", size: [0.5, 0.03, 0.03], pos: [0.6, r3(2.55 + y + 0.4), -2.3], color: "dark", mirror: true, fine: true })),
    { shape: "lathe", sides: 12, pos: [0.6, 3.2, -2.05], color: "steel", mirror: true, profile: [[0.16, 0], [0.13, 0.16], [0.13, 0.72], [0.155, 0.82]] },
    { shape: "cylinder", sides: 12, radius: 0.1, height: 0.04, pos: [0.6, 3.9, -2.05], color: "glow", mirror: true },
    { shape: "box", size: [0.2, 0.3, 0.3], pos: [0.6, 3.25, -1.92], color: "dark", mirror: true },
    // tourelle principale (pivot) : couronne, caisse à pans, toit d'équipe, flancs, masque, double canon
    { shape: "cylinder", sides: 16, radius: 0.95, height: 0.2, pos: [0, 3.25, 0.85], color: "steel", pivot: TP },
    { shape: "extrude", profile: TOURELLE, depth: 0.58, bevel: 0.08, pos: [0, 3.63, 0.8], rot: [90, 0, 0], color: "light", parent: TP },
    { shape: "extrude", profile: TOURELLE, depth: 0.08, bevel: 0.02, pos: [0, 3.95, 0.75], rot: [90, 0, 0], scale: [0.78, 0.78, 1], color: "faction", parent: TP },
    { shape: "box", size: [0.1, 0.46, 1.4], pos: [0.87, 3.58, 0.8], rot: [0, 0, 12], color: "faction", mirror: true, parent: TP },
    { shape: "box", size: [0.03, 0.05, 1.1], pos: [0.93, 3.62, 0.8], rot: [0, 0, 12], color: "glow", mirror: true, parent: TP },
    { shape: "bevel", size: [1.1, 0.46, 0.3], pos: [0, 3.6, 1.72], color: "dark", parent: TP },
    { shape: "box", size: [0.08, 0.05, 0.04], pos: [0.5, 3.78, 1.88], color: "amber", mirror: true, parent: TP },
    { shape: "box", size: [1.3, 0.46, 0.4], pos: [0, 3.58, -0.18], color: "dark", parent: TP },
    ...grille(0.3, 3.82, -0.18, 0.4, 0.34, 3).map((q): Part => ({ ...q, parent: TP })),
    // tourelleau à épiscopes et trappe
    { shape: "cylinder", sides: 12, radius: 0.22, height: 0.14, bevel: 0.03, pos: [0.38, 4.06, 0.45], color: "light", parent: TP },
    { shape: "cylinder", sides: 12, radius: 0.225, height: 0.04, pos: [0.38, 4.03, 0.45], color: "glass", parent: TP },
    { shape: "cylinder", sides: 10, radius: 0.15, height: 0.04, pos: [0.38, 4.15, 0.45], color: "dark", parent: TP, fine: true },
    { shape: "cylinder", sides: 10, radius: 0.13, height: 0.04, pos: [-0.3, 4.0, 0.2], color: "dark", parent: TP, fine: true },
    { shape: "tube", radius: 0.02, sides: 4, path: [[-0.5, 3.95, 0.2], [-0.5, 4.65, 0.2]], color: "light", parent: TP, fine: true },
    // lance-fumigènes
    ...[0, 1, 2].map((i): Part => ({ shape: "cylinder", sides: 6, radius: 0.05, height: 0.2, pos: [0.82, 3.82, r3(1.3 - i * 0.13)], rot: [-60, 0, -25], color: "dark", mirror: true, parent: TP, fine: true })),
    // double canon : manchons, fûts d'acier, freins de bouche, filets lumineux
    { shape: "cylinder", sides: 10, radius: 0.2, height: 0.45, pos: [0.32, 3.62, 2.05], rot: [90, 0, 0], color: "dark", mirror: true, parent: TP },
    { shape: "lathe", sides: 12, pos: [0.32, 3.62, 1.8], rot: [90, 0, 0], color: "steel", mirror: true, parent: TP, profile: FUT },
    { shape: "box", size: [0.04, 0.05, 0.12], pos: [0.32, 3.62, 4.32], color: "black", mirror: true, parent: TP, fine: true },
    { shape: "cylinder", sides: 8, radius: 0.08, height: 0.02, pos: [0.32, 3.62, 4.5], rot: [90, 0, 0], color: "glow", mirror: true, parent: TP },
    // tourelles secondaires
    ...tourelleSec("tourelle2", 1.3, -0.35),
    ...tourelleSec("tourelle3", -1.3, -0.35),
  ],
};
