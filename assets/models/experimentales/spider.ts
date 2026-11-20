// spider : Araignée de siège (expérimentale). Céphalothorax bas sur couronne de hanches tournée, carapace en
// plaques à pans superposées aux couleurs du camp, tête à grappe d'yeux cyan, chélicères profilées et palpes
// capteurs ; abdomen effilé à plaques, évents lumineux à lames, filières tournées, feux ambre et mâts
// d'antenne. Huit pattes fines et hautes (genoux au-dessus du corps) : hanche à moyeu d'acier, coxa, fémur
// blindé à vérin à tige polie, genou à ergot et voyant, tibia à filet cyan et flexible de cuivre, tarse
// tourné effilé et griffe. Chaque patte est un pivot « jambe… » (tétrapode alterné). Émetteur laser central
// (pivot « laser », origine des rayons) sur dôme d'acier : tube de focalisation tourné à bagues, lentille,
// condensateurs, ailettes de refroidissement. Pièces fines : flexibles, boulons, lames, antennes, palpes.
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

/** Point d'un segment à la fraction `t`, décalé de `up` selon sa normale et de `lat` sur le côté. */
const point = (s: Seg, t: number, up: number, lat: number): Vec3 =>
  [0, 1, 2].map((i) => r3(s.a[i] + s.d[i] * t * s.len + s.n[i] * up + s.l[i] * lat)) as Vec3;

/** Copie d'une pièce du côté droit vers le côté `side` (symétrie en x). */
function cote(p: Part, side: 1 | -1): Part {
  if (side === 1) return p;
  const pos = p.pos ?? [0, 0, 0];
  const rot = p.rot ?? [0, 0, 0];
  const q: Part = { ...p, pos: [-pos[0], pos[1], pos[2]], rot: [rot[0], -rot[1], -rot[2]] };
  if (p.path) {
    q.path = p.path.map((v) => [-v[0], v[1], v[2]] as Vec3);
    delete q.pos;
  }
  return q;
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
    sur(coxa, 0, 0, 0, { shape: "cylinder", sides: 8, radius: 0.19, height: 0.34, color: "steel", pivot: name }, "moyeu"),
    sur(coxa, 0, 0, 0, { shape: "cylinder", sides: 6, radius: 0.1, height: 0.4, color: "dark", fine: true }, "moyeu"),
    sur(coxa, 0.55, 0, 0, { shape: "box", size: [0.42, 0.2, 0.22], color: "dark" }, "long"),
    // fémur : âme sombre, deux plaques de blindage superposées, filet cyan, vérin à tige polie
    sur(femur, 0.5, 0, 0, { shape: "box", size: [1.25, 0.12, 0.12], color: "dark" }, "long"),
    sur(femur, 0.36, 0.06, 0, { shape: "box", size: [0.78, 0.15, 0.22], color: "faction" }, "long"),
    sur(femur, 0.78, 0.08, 0, { shape: "box", size: [0.42, 0.11, 0.18], color: "faction" }, "long"),
    sur(femur, 0.36, 0.14, 0, { shape: "box", size: [0.56, 0.02, 0.05], color: "glow" }, "long"),
    sur(femur, 0.3, -0.13, 0, { shape: "cylinder", sides: 6, radius: 0.045, height: 0.4, color: "dark" }, "tube"),
    sur(femur, 0.6, -0.13, 0, { shape: "cylinder", sides: 6, radius: 0.025, height: 0.36, color: "steel", fine: true }, "tube"),
    ...[0.2, 0.52].map((t) => sur(femur, t, 0.14, 0.07, { shape: "cylinder", sides: 6, radius: 0.02, height: 0.02, color: "steel", fine: true }, "moyeu")),
    // genou : moyeu d'acier, ergot dressé, voyant ambre
    sur(tibia, 0, 0, 0, { shape: "cylinder", sides: 10, radius: 0.13, height: 0.3, color: "steel" }, "moyeu"),
    sur(femur, 1, 0.17, 0, { shape: "cone", sides: 5, radius: 0.06, height: 0.3, color: "dark" }, "tube"),
    sur(tibia, 0, 0, 0.16, { shape: "box", size: [0.07, 0.07, 0.03], color: "amber", fine: true }, "long"),
    // tibia : âme d'acier, plaque du camp, filet cyan, flexible de cuivre (fin)
    sur(tibia, 0.5, 0, 0, { shape: "box", size: [1.8, 0.1, 0.1], color: "metal" }, "long"),
    sur(tibia, 0.3, 0.04, 0, { shape: "box", size: [0.85, 0.13, 0.16], color: "faction" }, "long"),
    sur(tibia, 0.32, 0.115, 0, { shape: "box", size: [0.62, 0.02, 0.04], color: "glow" }, "long"),
    { shape: "tube", radius: 0.02, sides: 4, path: [point(femur, 0.9, -0.08, 0.06), point(tibia, 0.08, -0.08, 0.06), point(tibia, 0.85, -0.07, 0.04)], bend: 0.08, color: "copper", fine: true },
    // cheville, tarse tourné effilé, griffe
    sur(tarse, 0, 0, 0, { shape: "sphere", radius: 0.09, detail: 0, color: "steel", fine: true }),
    sur(tarse, 0, 0, 0, { shape: "lathe", sides: 6, color: "light", profile: [[0.075, -0.04], [0.06, 0.16], [0.03, 1.3]] }, "tube"),
    sur(tarse, 0.12, 0, 0, { shape: "torus", radius: 0.075, tube: 0.015, sides: 8, color: "dark", fine: true }, "tube"),
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
    // céphalothorax : ventre, couronne des hanches tournée, plaques de carapace superposées
    { shape: "bevel", size: [1.3, 0.5, 2.0], pos: [0, 1.82, 0.1], color: "dark" },
    { shape: "lathe", sides: 16, color: "steel", profile: [[0.86, 1.9], [0.93, 1.92], [0.93, 2.1], [0.86, 2.14], [0.6, 2.16]] },
    { shape: "torus", radius: 0.93, tube: 0.02, sides: 16, pos: [0, 2.01, 0], color: "dark", fine: true },
    { shape: "extrude", profile: [[-0.75, -0.09], [0.75, -0.09], [0.62, 0.09], [-0.62, 0.09]], depth: 0.75, bevel: 0.03, pos: [0, 2.24, 0.62], rot: [9, 0, 0], color: "faction" },
    { shape: "bevel", size: [0.62, 0.18, 1.3], pos: [0.58, 2.22, -0.05], rot: [0, 0, -12], color: "faction", mirror: true },
    { shape: "extrude", profile: [[-0.62, -0.08], [0.62, -0.08], [0.5, 0.08], [-0.5, 0.08]], depth: 0.6, bevel: 0.03, pos: [0, 2.3, -0.7], rot: [-8, 0, 0], color: "faction" },
    { shape: "box", size: [0.03, 0.04, 1.0], pos: [0.88, 2.17, -0.05], rot: [0, 0, -12], color: "glow", mirror: true },
    ...[-0.4, 0.3].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.02, pos: [0.6, 2.32, z], rot: [0, 0, -12], color: "steel", mirror: true, fine: true })),
    // tête : grappe d'yeux, chélicères profilées, palpes capteurs
    { shape: "bevel", size: [0.86, 0.48, 0.62], pos: [0, 1.98, 1.28], rot: [6, 0, 0], color: "light" },
    { shape: "bevel", size: [0.72, 0.12, 0.5], pos: [0, 2.24, 1.22], rot: [10, 0, 0], color: "faction" },
    { shape: "sphere", radius: 0.1, detail: 1, pos: [0.15, 2.07, 1.58], color: "glow", mirror: true },
    { shape: "box", size: [0.08, 0.08, 0.06], pos: [0.33, 2.13, 1.5], rot: [0, 30, 0], color: "glow", mirror: true },
    { shape: "box", size: [0.06, 0.05, 0.04], pos: [0.1, 2.22, 1.5], color: "glow", mirror: true },
    { shape: "box", size: [0.08, 0.04, 0.04], pos: [0.36, 1.92, 1.56], color: "amber", mirror: true },
    { shape: "extrude", profile: [[-0.1, 0.12], [0.12, 0.1], [0.08, -0.12], [0.02, -0.28], [-0.02, -0.1]], depth: 0.14, bevel: 0.02, pos: [0.15, 1.72, 1.62], rot: [0, -90, 0], color: "steel", mirror: true },
    { shape: "tube", radius: 0.022, sides: 4, path: [[0.3, 1.97, 1.6], [0.36, 2.06, 1.9], [0.4, 2.15, 2.12]], bend: 0.06, color: "light", mirror: true, fine: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.4, 2.17, 2.15], color: "amber", mirror: true, fine: true },
    // taille et abdomen : coque, trois plaques à pans, flancs, évents lumineux, feux, filières
    { shape: "lathe", sides: 10, pos: [0, 2.0, -0.8], rot: [-90, 0, 0], color: "steel", profile: [[0.28, 0], [0.3, 0.1], [0.24, 0.3], [0.28, 0.45], [0.3, 0.5]] },
    { shape: "bevel", size: [1.25, 0.8, 1.75], pos: [0, 2.08, -1.95], rot: [-6, 0, 0], color: "dark" },
    { shape: "extrude", profile: [[-0.68, -0.1], [0.68, -0.1], [0.55, 0.1], [-0.55, 0.1]], depth: 0.8, bevel: 0.03, pos: [0, 2.5, -1.32], rot: [-12, 0, 0], color: "faction" },
    { shape: "extrude", profile: [[-0.65, -0.1], [0.65, -0.1], [0.52, 0.1], [-0.52, 0.1]], depth: 0.8, bevel: 0.03, pos: [0, 2.47, -1.9], rot: [-6, 0, 0], color: "faction" },
    { shape: "extrude", profile: [[-0.55, -0.1], [0.55, -0.1], [0.42, 0.1], [-0.42, 0.1]], depth: 0.75, bevel: 0.03, pos: [0, 2.38, -2.45], rot: [8, 0, 0], color: "faction" },
    { shape: "box", size: [0.05, 0.03, 2.0], pos: [0, 2.61, -1.85], color: "glow" },
    ...[-1.55, -2.25].map((z): Part => ({ shape: "box", size: [0.5, 0.02, 0.08], pos: [0, 2.6, z], color: "dark", fine: true })),
    { shape: "bevel", size: [0.14, 0.55, 1.4], pos: [0.64, 2.05, -1.95], color: "light", mirror: true },
    ...[-1.55, -1.85, -2.15].map((z): Part => ({ shape: "box", size: [0.03, 0.3, 0.08], pos: [0.715, 2.06, z], color: "glow", mirror: true })),
    ...[-1.7, -2.0, -2.3].map((z): Part => ({ shape: "box", size: [0.03, 0.04, 0.2], pos: [0.72, 2.24, z], color: "steel", mirror: true, fine: true })),
    { shape: "box", size: [0.12, 0.08, 0.04], pos: [0.42, 2.05, -2.83], color: "amber", mirror: true },
    { shape: "lathe", sides: 12, pos: [0, 1.9, -2.76], rot: [-90, 0, 0], color: "steel", profile: [[0.26, 0], [0.26, 0.06], [0.22, 0.12], [0.2, 0.19], [0.12, 0.19]] },
    { shape: "cylinder", sides: 12, radius: 0.15, height: 0.03, pos: [0, 1.9, -2.9], rot: [90, 0, 0], color: "glow" },
    { shape: "lathe", sides: 8, pos: [0.3, 1.78, -2.7], rot: [-110, 0, 0], color: "steel", mirror: true, fine: true, profile: [[0.07, 0], [0.06, 0.12], [0.03, 0.18]] },
    // capteurs dorsaux et mâts d'antenne, câbles vers l'émetteur
    { shape: "lathe", sides: 10, pos: [0, 2.56, -2.25], color: "glass", profile: [[0.13, 0], [0.12, 0.06], [0.07, 0.12], [0, 0.13]] },
    { shape: "tube", radius: 0.02, sides: 4, path: [[0.39, 2.48, -2.3], [0.47, 3.22, -2.45]], color: "light", mirror: true, fine: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [0.48, 3.24, -2.45], color: "amber", mirror: true, fine: true },
    { shape: "tube", radius: 0.035, sides: 5, path: [[0.3, 2.62, -0.95], [0.3, 2.62, -0.62], [0.3, 2.42, -0.35]], bend: 0.1, color: "black", mirror: true, fine: true },
    // pattes
    ...HANCHES.flatMap(([hip, yaw], i) => [
      ...patte(`jambe_d${i + 1}${i % 2 ? "_ar" : ""}`, 1, hip, yaw),
      ...patte(`jambe_g_${i + 1}${i % 2 ? "_ar" : ""}`, -1, hip, yaw),
    ]),
    // émetteur laser central (pivot « laser » : le rayon part d'ici et suit sa cible) sur dôme d'acier
    { shape: "sphere", radius: 0.5, detail: 1, pos: [0, 2.95, 0], color: "steel", pivot: "laser" },
    { shape: "lathe", sides: 16, pos: [0, 2.4, 0], color: "steel", parent: "laser", profile: [[0.72, 0], [0.72, 0.08], [0.66, 0.16], [0.6, 0.2], [0.5, 0.2]] },
    { shape: "cylinder", sides: 16, radius: 0.6, height: 0.04, pos: [0, 2.94, 0], color: "glow", parent: "laser" },
    { shape: "extrude", profile: [[-0.45, -0.12], [0.45, -0.12], [0.4, 0.06], [0.3, 0.12], [-0.3, 0.12], [-0.4, 0.06]], depth: 0.75, bevel: 0.03, pos: [0, 3.33, -0.22], rot: [-8, 0, 0], color: "faction", parent: "laser" },
    { shape: "box", size: [0.62, 0.14, 0.5], pos: [0, 3.47, -0.32], rot: [-8, 0, 0], color: "faction", parent: "laser" },
    { shape: "box", size: [0.5, 0.02, 0.04], pos: [0, 3.545, -0.2], rot: [-8, 0, 0], color: "hazard", parent: "laser", fine: true },
    { shape: "bevel", size: [0.16, 0.5, 0.75], pos: [0.5, 3.05, 0.0], rot: [0, 0, -10], color: "light", parent: "laser", mirror: true },
    { shape: "box", size: [0.03, 0.04, 0.5], pos: [0.36, 3.42, -0.25], color: "glow", parent: "laser", mirror: true },
    // tube de focalisation tourné, bagues, lentille
    { shape: "lathe", sides: 12, pos: [0, 3.0, 0.24], rot: [90, 0, 0], color: "steel", parent: "laser",
      profile: [[0.26, 0], [0.29, 0.02], [0.29, 0.14], [0.24, 0.16], [0.22, 0.52], [0.26, 0.54], [0.26, 0.64], [0.2, 0.68], [0.16, 0.66]] },
    { shape: "cylinder", sides: 12, radius: 0.2, height: 0.04, pos: [0, 3.0, 0.86], rot: [90, 0, 0], color: "dark", parent: "laser", fine: true },
    { shape: "sphere", radius: 0.13, detail: 1, pos: [0, 3.0, 0.92], color: "glow", parent: "laser" },
    // condensateurs à coiffes, ailettes de refroidissement, voyants
    { shape: "cylinder", sides: 8, radius: 0.07, height: 0.55, pos: [0.3, 3.24, 0.32], rot: [90, 0, 0], color: "glow", parent: "laser", mirror: true },
    ...[0.06, 0.58].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.085, height: 0.05, pos: [0.3, 3.24, z], rot: [90, 0, 0], color: "steel", parent: "laser", mirror: true, fine: true })),
    ...[-0.5, -0.6, -0.7, -0.8, -0.9].map((z, i): Part => ({ shape: "box", size: [0.7, 0.3, 0.035], pos: [0, 3.05, z], color: "dark", parent: "laser", ...(i % 2 ? { fine: true } : {}) })),
    { shape: "box", size: [0.07, 0.05, 0.05], pos: [0.2, 3.33, 0.18], color: "amber", parent: "laser", mirror: true },
  ],
};
