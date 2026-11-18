// spider : Araignée de siège (expérimentale). Céphalothorax bas et abdomen effilé à plaques de carapace
// superposées aux couleurs du camp, tête à grappe d'yeux cyan, chélicères et palpes capteurs, abdomen à
// évents lumineux, feux ambre et mâts d'antenne. Huit pattes fines et hautes (genoux au-dessus du corps) :
// hanche à moyeu, coxa, fémur blindé à vérin, genou à ergot et voyant, tibia à filet cyan et câble, tarse
// effilé et griffe. Chaque patte est un pivot « jambe… » (tétrapode alterné). Émetteur laser
// central (pivot « laser », origine des rayons) : tube de focalisation à bagues, lentille, condensateurs,
// ailettes de refroidissement. 3876 triangles.
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
 * chaque segment [pente en degrés (positive : vers le haut), longueur].
 */
function chaine(from: Vec3, yaw: number, segs: [number, number][]): Seg[] {
  const ay = (yaw * Math.PI) / 180;
  const out: Seg[] = [];
  let p = from;
  for (const [tilt, len] of segs) {
    const t = (tilt * Math.PI) / 180;
    const d: Vec3 = [Math.cos(t) * Math.cos(ay), Math.sin(t), -Math.cos(t) * Math.sin(ay)];
    const n: Vec3 = [-Math.sin(t) * Math.cos(ay), Math.cos(t), Math.sin(t) * Math.sin(ay)];
    const l: Vec3 = [Math.sin(ay), 0, Math.cos(ay)];
    const b: Vec3 = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
    out.push({ a: p, b, d, n, l, yaw, tilt, len });
    p = b;
  }
  return out;
}

/**
 * Pose une pièce sur un segment : à la fraction `t` de sa longueur, décalée de `up` selon sa normale et
 * de `lat` sur le côté. Orientation : « long » (boîte, longueur en x), « tube » (cylindre ou cône dans
 * l'axe, pointe vers le bout), « moyeu » (cylindre en travers, axe latéral) ; sinon la rotation de la pièce.
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

/**
 * Patte fine de l'araignée (pivot `name` au moyeu de hanche ; le jeu la balance autour de l'axe x).
 * Hanche donnée côté droit, `side` = -1 pour la copie gauche.
 */
function patte(name: string, side: 1 | -1, hip: Vec3, yaw: number): Part[] {
  const [coxa, femur, tibia, tarse] = chaine(hip, yaw, [[25, 0.34], [60, 1.25], [-61, 1.8], [-84, 1.3]]);
  const pied = tarse.b;
  const griffe = chaine(pied, yaw, [[-88, 0.3]])[0];
  const parts: Part[] = [
    // hanche (pivot) et coxa
    sur(coxa, 0, 0, 0, { shape: "cylinder", sides: 5, radius: 0.19, height: 0.34, color: "metal", pivot: name }, "moyeu"),
    sur(coxa, 0.55, 0, 0, { shape: "box", size: [0.42, 0.2, 0.22], color: "dark" }, "long"),
    // fémur : âme sombre, deux plaques de blindage superposées, filet cyan, vérin en dessous
    sur(femur, 0.5, 0, 0, { shape: "box", size: [1.25, 0.12, 0.12], color: "dark" }, "long"),
    sur(femur, 0.36, 0.06, 0, { shape: "bevel", size: [0.78, 0.15, 0.22], color: "faction", bevel: 0.04 }, "long"),
    sur(femur, 0.78, 0.08, 0, { shape: "box", size: [0.42, 0.11, 0.18], color: "faction" }, "long"),
    sur(femur, 0.36, 0.14, 0, { shape: "box", size: [0.56, 0.02, 0.05], color: "glow" }, "long"),
    sur(femur, 0.4, -0.13, 0, { shape: "cylinder", sides: 5, radius: 0.04, height: 0.6, color: "metal" }, "tube"),
    // genou : moyeu, ergot dressé, voyant ambre
    sur(tibia, 0, 0, 0, { shape: "cylinder", sides: 6, radius: 0.13, height: 0.3, color: "metal" }, "moyeu"),
    sur(femur, 1, 0.17, 0, { shape: "cone", sides: 5, radius: 0.06, height: 0.3, color: "dark" }, "tube"),
    sur(tibia, 0, 0, 0.16, { shape: "box", size: [0.07, 0.07, 0.03], color: "amber" }, "long"),
    // tibia : âme sombre, plaque du camp, filet cyan, câble dorsal
    sur(tibia, 0.5, 0, 0, { shape: "box", size: [1.8, 0.1, 0.1], color: "metal" }, "long"),
    sur(tibia, 0.3, 0.04, 0, { shape: "box", size: [0.85, 0.13, 0.16], color: "faction" }, "long"),
    sur(tibia, 0.32, 0.115, 0, { shape: "box", size: [0.62, 0.02, 0.04], color: "glow" }, "long"),
    sur(tibia, 0.6, -0.075, 0, { shape: "box", size: [1.0, 0.03, 0.03], color: "black" }, "long"),
    // cheville, tarse effilé, griffe
    sur(tarse, 0, 0, 0, { shape: "sphere", radius: 0.09, detail: 0, color: "metal" }),
    sur(tarse, 0.5, 0, 0, { shape: "cylinder", sides: 5, radius: 0.065, radiusTop: 0.03, height: 1.3, color: "light" }, "tube"),
    sur(griffe, 0.5, 0, 0, { shape: "cone", sides: 5, radius: 0.06, height: 0.3, color: "dark" }, "tube"),
  ];
  return parts.map((p, i) => cote(i === 0 ? p : { ...p, parent: name }, side));
}

// Hanches (côté droit) et orientation des huit pattes, de l'avant vers l'arrière
const HANCHES: [Vec3, number][] = [
  [[0.5, 2.0, 0.78], -52],
  [[0.68, 2.0, 0.27], -17],
  [[0.68, 2.0, -0.27], 17],
  [[0.5, 2.0, -0.78], 50],
];

export const spider: Model = {
  parts: [
    // céphalothorax : ventre, couronne des hanches, plaques de carapace superposées
    { shape: "bevel", size: [1.3, 0.5, 2.0], pos: [0, 1.82, 0.1], color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.92, height: 0.24, pos: [0, 2.02, 0], rot: [0, 22.5, 0], color: "metal" },
    { shape: "bevel", size: [1.5, 0.18, 0.75], pos: [0, 2.24, 0.62], rot: [9, 0, 0], color: "faction" },
    { shape: "bevel", size: [0.62, 0.18, 1.3], pos: [0.58, 2.22, -0.05], rot: [0, 0, -12], color: "faction", mirror: true },
    { shape: "bevel", size: [1.25, 0.16, 0.6], pos: [0, 2.3, -0.7], rot: [-8, 0, 0], color: "faction" },
    { shape: "box", size: [0.03, 0.04, 1.0], pos: [0.88, 2.17, -0.05], rot: [0, 0, -12], color: "glow", mirror: true },
    // tête : grappe d'yeux, chélicères, palpes capteurs
    { shape: "bevel", size: [0.86, 0.48, 0.62], pos: [0, 1.98, 1.28], rot: [6, 0, 0], color: "light" },
    { shape: "bevel", size: [0.72, 0.12, 0.5], pos: [0, 2.24, 1.22], rot: [10, 0, 0], color: "faction" },
    { shape: "sphere", radius: 0.1, detail: 0, pos: [0.15, 2.07, 1.58], color: "glow", mirror: true },
    { shape: "box", size: [0.08, 0.08, 0.06], pos: [0.33, 2.13, 1.5], rot: [0, 30, 0], color: "glow", mirror: true },
    { shape: "box", size: [0.06, 0.05, 0.04], pos: [0.1, 2.22, 1.5], color: "glow", mirror: true },
    { shape: "box", size: [0.08, 0.04, 0.04], pos: [0.36, 1.92, 1.56], color: "amber", mirror: true },
    { shape: "cone", sides: 6, radius: 0.09, height: 0.42, pos: [0.15, 1.66, 1.6], rot: [150, 0, 0], color: "metal", mirror: true },
    { shape: "cylinder", sides: 5, radius: 0.025, height: 0.7, pos: [0.3, 2.05, 1.82], rot: [70, -20, 0], color: "light", mirror: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.4, 2.17, 2.15], color: "amber", mirror: true },
    // taille et abdomen : coque, trois plaques superposées, flancs, évents lumineux, feux, échappement
    { shape: "cylinder", sides: 6, radius: 0.3, height: 0.5, pos: [0, 2.0, -1.05], rot: [90, 0, 0], color: "dark" },
    { shape: "bevel", size: [1.25, 0.8, 1.75], pos: [0, 2.08, -1.95], rot: [-6, 0, 0], color: "dark" },
    { shape: "bevel", size: [1.35, 0.2, 0.8], pos: [0, 2.5, -1.32], rot: [-12, 0, 0], color: "faction" },
    { shape: "bevel", size: [1.3, 0.2, 0.8], pos: [0, 2.47, -1.9], rot: [-6, 0, 0], color: "faction" },
    { shape: "bevel", size: [1.1, 0.2, 0.75], pos: [0, 2.38, -2.45], rot: [8, 0, 0], color: "faction" },
    { shape: "box", size: [0.05, 0.03, 2.0], pos: [0, 2.61, -1.85], color: "glow" },
    { shape: "bevel", size: [0.14, 0.55, 1.4], pos: [0.64, 2.05, -1.95], color: "light", mirror: true },
    ...[-1.55, -1.85, -2.15].map((z): Part => ({ shape: "box", size: [0.03, 0.3, 0.08], pos: [0.715, 2.06, z], color: "glow", mirror: true })),
    { shape: "box", size: [0.12, 0.08, 0.04], pos: [0.42, 2.05, -2.83], color: "amber", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.24, height: 0.14, pos: [0, 1.9, -2.83], rot: [90, 0, 0], color: "metal" },
    { shape: "cylinder", sides: 8, radius: 0.15, height: 0.06, pos: [0, 1.9, -2.92], rot: [90, 0, 0], color: "glow" },
    // capteurs dorsaux et mâts d'antenne, câbles vers l'émetteur
    { shape: "sphere", radius: 0.13, detail: 0, pos: [0, 2.62, -2.25], color: "glass" },
    { shape: "cylinder", sides: 5, radius: 0.02, height: 0.8, pos: [0.42, 2.85, -2.35], rot: [-14, 0, -8], color: "light", mirror: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.48, 3.24, -2.45], color: "amber", mirror: true },
    { shape: "box", size: [0.06, 0.06, 0.62], pos: [0.3, 2.42, -0.62], rot: [-28, 0, 0], color: "black", mirror: true },
    // pattes
    ...HANCHES.flatMap(([hip, yaw], i) => [
      ...patte(`jambe_d${i + 1}${i % 2 ? "_ar" : ""}`, 1, hip, yaw),
      ...patte(`jambe_g_${i + 1}${i % 2 ? "_ar" : ""}`, -1, hip, yaw),
    ]),
    // émetteur laser central (pivot « laser » : le rayon part d'ici et suit sa cible)
    { shape: "sphere", radius: 0.55, detail: 1, pos: [0, 2.95, 0], color: "dark", pivot: "laser" },
    { shape: "cylinder", sides: 8, radius: 0.72, radiusTop: 0.62, height: 0.2, pos: [0, 2.5, 0], rot: [0, 22.5, 0], color: "metal", parent: "laser" },
    { shape: "cylinder", sides: 8, radius: 0.6, height: 0.06, pos: [0, 2.94, 0], rot: [0, 22.5, 0], color: "glow", parent: "laser" },
    { shape: "bevel", size: [0.9, 0.24, 0.75], pos: [0, 3.33, -0.22], rot: [-8, 0, 0], color: "faction", parent: "laser" },
    { shape: "box", size: [0.62, 0.14, 0.5], pos: [0, 3.47, -0.32], rot: [-8, 0, 0], color: "faction", parent: "laser" },
    { shape: "bevel", size: [0.16, 0.5, 0.75], pos: [0.5, 3.05, 0.0], rot: [0, 0, -10], color: "light", parent: "laser", mirror: true },
    { shape: "box", size: [0.03, 0.04, 0.5], pos: [0.36, 3.42, -0.25], color: "glow", parent: "laser", mirror: true },
    // tube de focalisation, bagues, lentille
    { shape: "cylinder", sides: 8, radius: 0.24, radiusTop: 0.2, height: 0.75, pos: [0, 3.0, 0.62], rot: [90, 0, 0], color: "metal", parent: "laser" },
    { shape: "cylinder", sides: 8, radius: 0.29, height: 0.08, pos: [0, 3.0, 0.5], rot: [90, 0, 0], color: "dark", parent: "laser" },
    { shape: "cylinder", sides: 8, radius: 0.26, height: 0.08, pos: [0, 3.0, 0.82], rot: [90, 0, 0], color: "dark", parent: "laser" },
    { shape: "sphere", radius: 0.13, detail: 0, pos: [0, 3.0, 0.98], color: "glow", parent: "laser" },
    // condensateurs, ailettes de refroidissement, voyants
    { shape: "cylinder", sides: 6, radius: 0.07, height: 0.55, pos: [0.3, 3.24, 0.32], rot: [90, 0, 0], color: "glow", parent: "laser", mirror: true },
    ...[-0.55, -0.7, -0.85].map((z): Part => ({ shape: "box", size: [0.7, 0.3, 0.04], pos: [0, 3.05, z], color: "dark", parent: "laser" })),
    { shape: "box", size: [0.07, 0.05, 0.05], pos: [0.2, 3.33, 0.18], color: "amber", parent: "laser", mirror: true },
  ],
};
