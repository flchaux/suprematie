// dragon : « Gros Chinois », dragon robot volant à la chinoise.
// Tête pivotante (pivot « laser » : origine du souffle de feu) : crâne et museau en plaques, gueule
// ouverte sur une langue de feu ambre, crocs d'acier, naseaux, yeux lumineux sous des arcades dorées,
// joyau frontal, bois de cerf en tubes coudés, longues moustaches ondulantes, collerette de crinière en
// plaques effilées, barbiche, perle d'énergie dans son anneau doré.
// Corps en anneaux fins qui ondulent (pivots ondule2…ondule11, de la tête vers la queue) : fût tourné
// bombé, bagues d'acier aux jointures, deux rangées d'écailles en quinconce, plaques ventrales claires à
// joints, crête dorsale ambre, perles dorées. Quatre pattes griffues (anneaux 3 et 7) et queue en panache
// de plaques effilées. Pièces fines : bagues, joints, perles, naseaux, gaines des griffes, rivets.
import type { Model, Part, Vec3 } from "../types.ts";

const r3 = (v: number) => +v.toFixed(3);
const DEG = 180 / Math.PI;

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Pièce allongée de `a` à `b` : l'axe y de la forme suit a→b (longueur = distance), son axe z est
 * tourné au plus près de `nz` (épaisseur d'un coin, d'une plaque). Cylindre et cône : `height` ;
 * boîte, chanfrein, coin : `size[1]`. Un cône pointe vers `b` ; un coin est épais en `a` et finit
 * en lame en `b`.
 */
function seg(a: Vec3, b: Vec3, p: Part, nz: Vec3 = [0, 0, 1]): Part {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const Yv = norm(d);
  let h = nz;
  let k = h[0] * Yv[0] + h[1] * Yv[1] + h[2] * Yv[2];
  if (Math.abs(k) > 0.98) {
    h = [0, 1, 0];
    k = Yv[1];
  }
  const Zv = norm([h[0] - k * Yv[0], h[1] - k * Yv[1], h[2] - k * Yv[2]]);
  const Xv: Vec3 = [Yv[1] * Zv[2] - Yv[2] * Zv[1], Yv[2] * Zv[0] - Yv[0] * Zv[2], Yv[0] * Zv[1] - Yv[1] * Zv[0]];
  // angles d'Euler XYZ de la matrice [X Y Z] (colonnes)
  const m02 = Zv[0];
  const ry = Math.asin(Math.max(-1, Math.min(1, m02)));
  const rx = Math.abs(m02) < 0.9999999 ? Math.atan2(-Zv[1], Zv[2]) : Math.atan2(Yv[2], Yv[1]);
  const rz = Math.abs(m02) < 0.9999999 ? Math.atan2(-Yv[0], Xv[0]) : 0;
  const pos: Vec3 = [r3((a[0] + b[0]) / 2), r3((a[1] + b[1]) / 2), r3((a[2] + b[2]) / 2)];
  const out: Part = { ...p, pos, rot: [r3(rx * DEG), r3(ry * DEG), r3(rz * DEG)] };
  if (p.shape === "cylinder" || p.shape === "cone") out.height = r3(len);
  else if (p.size) out.size = [p.size[0], r3(len), p.size[2]];
  return out;
}

/** Hauteur de l'axe du corps. */
const Y = 0.35;

/**
 * Anneau du corps (pivot « ondule<k> ») centré en z, de largeur `w` : fût octogonal, écailles en
 * quinconce (coins relevés vers l'arrière), plaques ventrales, épine dorsale, feux de flanc.
 */
function anneauDragon(k: number, z: number, w: number): Part[] {
  const n = `ondule${k}`;
  const R = r3(w * 0.4);
  const out: Part[] = [
    { shape: "lathe", sides: 10, pos: [0, Y, z], rot: [90, 0, 0], color: "faction", pivot: n,
      profile: [[r3(R * 0.84), -0.48], [r3(R * 0.98), -0.3], [r3(R * 1.02), 0.12], [r3(R * 0.9), 0.48]] },
    { shape: "torus", radius: r3(R * 0.88), tube: 0.035, sides: 12, pos: [0, Y, r3(z + 0.47)], rot: [90, 0, 0], color: "steel", parent: n, fine: true },
  ];
  const sw = r3(R * 0.78);
  const rows: [number, number[]][] = [
    [0.2, [0, 42, 84]],
    [-0.22, [21, 63]],
  ];
  for (const [dz, angles] of rows) {
    for (const phi of angles) {
      const a = phi / DEG;
      out.push({
        shape: "wedge", size: [sw, 0.13, 0.48],
        pos: [r3(Math.sin(a) * R * 1.02), r3(Y + Math.cos(a) * R * 1.02), r3(z + dz)],
        rot: [0, 0, -phi], color: "faction", mirror: phi !== 0, parent: n,
      });
    }
  }
  out.push(
    { shape: "box", size: [r3(R * 1.25), 0.1, 0.4], pos: [0, r3(Y - R * 0.98), r3(z + 0.21)], rot: [-6, 0, 0], color: "light", parent: n },
    { shape: "box", size: [r3(R * 1.25), 0.1, 0.4], pos: [0, r3(Y - R * 0.98), r3(z - 0.23)], rot: [-6, 0, 0], color: "light", parent: n },
    seg([0, r3(Y + R * 1.05), r3(z + 0.22)], [0, r3(Y + R * 1.05 + 0.2 + w * 0.22), r3(z - 0.32)], { shape: "wedge", size: [0.07, 1, 0.36], color: "amber", parent: n }),
    { shape: "box", size: [0.04, 0.05, 0.5], pos: [r3(R * 0.98), r3(Y - R * 0.3), z], rot: [0, 0, -20], color: "glow", mirror: true, parent: n },
    { shape: "box", size: [r3(R * 1.2), 0.02, 0.03], pos: [0, r3(Y - R * 0.99 - 0.05), r3(z - 0.01)], color: "dark", parent: n, fine: true },
    { shape: "sphere", radius: 0.045, pos: [r3(R * 0.5), r3(Y + R * 0.95), r3(z - 0.3)], color: "amber", mirror: true, parent: n, fine: true },
  );
  return out;
}

/** Patte griffue (droite et sa copie), portée par l'anneau k ; `dir` : +1 patte avant, -1 arrière. */
function griffeDragon(k: number, z: number, w: number, dir: 1 | -1): Part[] {
  const n = `ondule${k}`;
  const R = w * 0.4;
  const H: Vec3 = [r3(R * 0.75), r3(Y - 0.02), z];
  const K: Vec3 = [r3(R + 0.45), r3(Y - 0.1), r3(z - 0.26 * dir)];
  const F: Vec3 = [r3(R + 0.55), r3(Y - 0.8), r3(z + 0.1 * dir)];
  const out: Part[] = [
    seg(H, K, { shape: "cylinder", sides: 6, radius: 0.12, radiusTop: 0.17, color: "faction", mirror: true, parent: n }),
    // plaque d'épaule
    seg([r3(H[0] + 0.12), r3(H[1] + 0.16), r3(z + 0.12 * dir)], [r3(K[0] + 0.02), r3(K[1] + 0.12), r3(K[2] - 0.05 * dir)],
      { shape: "wedge", size: [0.26, 1, 0.08], color: "amber", mirror: true, parent: n }, [0, 1, 0]),
    { shape: "sphere", radius: 0.13, pos: K, color: "steel", mirror: true, parent: n },
    seg(K, F, { shape: "cylinder", sides: 6, radius: 0.085, radiusTop: 0.11, color: "light", mirror: true, parent: n }),
    // touffe de coude en flamme
    seg([K[0], r3(K[1] + 0.02), K[2]], [r3(K[0] + 0.14), r3(K[1] + 0.12), r3(K[2] - 0.42 * dir)], { shape: "wedge", size: [0.18, 1, 0.08], color: "amber", mirror: true, parent: n }, [1, 0, 0]),
    { shape: "bevel", size: [0.26, 0.11, 0.26], pos: [F[0], r3(F[1] - 0.02), r3(F[2] + 0.03)], color: "steel", mirror: true, parent: n },
    { shape: "torus", radius: 0.1, tube: 0.025, sides: 8, pos: [r3((K[0] + F[0]) / 2), r3((K[1] + F[1]) / 2), r3((K[2] + F[2]) / 2)], color: "amber", mirror: true, parent: n, fine: true },
  ];
  // quatre griffes : trois vers l'avant en éventail, un ergot vers l'arrière
  for (const dx of [-0.09, 0, 0.09]) {
    out.push(seg([r3(F[0] + dx), r3(F[1] - 0.04), r3(F[2] + 0.1)], [r3(F[0] + dx * 2.4), r3(F[1] - 0.2), r3(F[2] + 0.42)],
      { shape: "cone", sides: 4, radius: 0.05, color: "light", mirror: true, parent: n }));
  }
  out.push(seg([F[0], r3(F[1] - 0.03), r3(F[2] - 0.08)], [r3(F[0] - 0.02), r3(F[1] - 0.16), r3(F[2] - 0.32)],
    { shape: "cone", sides: 4, radius: 0.045, color: "light", mirror: true, parent: n }));
  return out;
}

const L = "laser";

/** Collerette de crinière : plaques effilées en éventail autour de la nuque, portées par la tête. */
function criniere(): Part[] {
  const out: Part[] = [];
  const C: Vec3 = [0, 0.45, 3.85];
  const grandes: [number, string][] = [[0, "amber"], [34, "faction"], [68, "amber"], [104, "faction"], [138, "light"]];
  const petites = [17, 51, 86, 121];
  for (const [phi, color] of grandes) {
    const a = phi / DEG;
    const s = Math.sin(a), c = Math.cos(a);
    out.push(seg([r3(s * 0.42), r3(C[1] + c * 0.42), C[2]], [r3(s * 1.08), r3(C[1] + c * 1.0), 3.0],
      { shape: "wedge", size: [0.36, 1, 0.1], color: color as Part["color"], mirror: phi !== 0, parent: L }, [0, 0, 1]));
  }
  for (const phi of petites) {
    const a = phi / DEG;
    const s = Math.sin(a), c = Math.cos(a);
    out.push(seg([r3(s * 0.45), r3(C[1] + c * 0.45), 3.92], [r3(s * 0.86), r3(C[1] + c * 0.8), 3.3],
      { shape: "wedge", size: [0.24, 1, 0.08], color: "light", mirror: true, parent: L }, [0, 0, 1]));
  }
  return out;
}

/** Tête : toutes les pièces sont portées par le pivot « laser » (crâne en 0, 0.4, 4.2). */
const tete: Part[] = [
  // crâne, front, pommettes, museau
  { shape: "bevel", size: [1.2, 0.96, 1.3], pos: [0, 0.4, 4.2], color: "faction", pivot: L },
  { shape: "wedge", size: [1.0, 0.3, 1.0], pos: [0, 1.02, 4.42], color: "faction", parent: L },
  seg([0.56, 0.42, 4.75], [0.86, 0.36, 3.95], { shape: "wedge", size: [0.42, 1, 0.1], color: "light", mirror: true, parent: L }, [1, 0.3, 0]),
  seg([0.52, 0.12, 4.7], [0.8, -0.05, 4.0], { shape: "wedge", size: [0.3, 1, 0.08], color: "amber", mirror: true, parent: L }, [1, 0, 0]),
  { shape: "bevel", size: [0.9, 0.48, 1.45], pos: [0, 0.5, 5.4], color: "faction", parent: L },
  { shape: "wedge", size: [0.7, 0.2, 1.15], pos: [0, 0.83, 5.32], color: "light", parent: L },
  { shape: "bevel", size: [0.74, 0.36, 0.34], pos: [0, 0.6, 6.18], color: "steel", parent: L },
  { shape: "cylinder", sides: 8, radius: 0.06, height: 0.05, pos: [0.2, 0.74, 6.33], rot: [90, 0, 0], color: "dark", mirror: true, parent: L, fine: true },
  { shape: "sphere", radius: 0.09, pos: [0, 1.1, 4.95], color: "glow", parent: L },
  { shape: "torus", radius: 0.1, tube: 0.025, sides: 10, pos: [0, 1.08, 4.95], color: "amber", parent: L, fine: true },
  ...[4.7, 5.1, 5.5].map((z): Part => ({ shape: "box", size: [0.5, 0.025, 0.04], pos: [0, r3(0.93 - (z - 4.7) * 0.06), z], color: "dark", parent: L, fine: true })),
  { shape: "sphere", radius: 0.075, pos: [0.2, 0.74, 6.3], color: "glow", mirror: true, parent: L },
  // gueule ouverte : babine dorée, langue de feu, mâchoire inférieure abaissée, menton
  { shape: "box", size: [0.92, 0.05, 1.35], pos: [0, 0.27, 5.45], color: "amber", parent: L },
  { shape: "box", size: [0.6, 0.16, 1.1], pos: [0, 0.1, 5.42], rot: [8, 0, 0], color: "amber", parent: L },
  { shape: "bevel", size: [0.8, 0.2, 1.45], pos: [0, -0.1, 5.3], rot: [14, 0, 0], color: "steel", parent: L },
  { shape: "bevel", size: [0.56, 0.18, 0.32], pos: [0, -0.28, 5.95], rot: [14, 0, 0], color: "dark", parent: L },
  // crocs : deux paires en haut, une paire en bas
  { shape: "cone", sides: 6, radius: 0.06, height: 0.3, pos: [0.35, 0.12, 6.02], rot: [180, 0, 0], color: "light", mirror: true, parent: L },
  { shape: "cone", sides: 6, radius: 0.045, height: 0.22, pos: [0.37, 0.15, 5.5], rot: [180, 0, 0], color: "light", mirror: true, parent: L, fine: true },
  { shape: "cone", sides: 6, radius: 0.05, height: 0.26, pos: [0.27, 0.02, 5.82], rot: [14, 0, 0], color: "light", mirror: true, parent: L },
  // yeux sous des arcades dorées
  { shape: "sphere", radius: 0.12, pos: [0.5, 0.78, 5.0], color: "glow", mirror: true, parent: L },
  { shape: "wedge", size: [0.32, 0.1, 0.44], pos: [0.4, 0.97, 4.88], rot: [0, -12, -14], color: "amber", mirror: true, parent: L },
  // cou sous la crinière
  { shape: "lathe", sides: 12, pos: [0, 0.38, 3.2], rot: [90, 0, 0], color: "faction", parent: L, profile: [[0.48, 0], [0.52, 0.2], [0.5, 0.5], [0.44, 0.7]] },
  { shape: "torus", radius: 0.5, tube: 0.035, sides: 12, pos: [0, 0.38, 3.42], rot: [90, 0, 0], color: "amber", parent: L, fine: true },
  // bois de cerf : merrain, pointe et deux andouillers
  { shape: "tube", radius: 0.07, sides: 6, path: [[0.32, 0.92, 3.98], [0.45, 1.3, 3.6], [0.62, 1.62, 3.12]], bend: 0.3, color: "light", mirror: true, parent: L },
  seg([0.62, 1.62, 3.12], [0.74, 1.8, 2.55], { shape: "cone", sides: 6, radius: 0.065, color: "light", mirror: true, parent: L }),
  { shape: "torus", radius: 0.085, tube: 0.025, sides: 8, pos: [0.33, 0.96, 3.94], rot: [30, 0, -20], color: "amber", mirror: true, parent: L, fine: true },
  seg([0.45, 1.24, 3.6], [0.68, 1.62, 3.8], { shape: "cone", sides: 4, radius: 0.045, color: "light", mirror: true, parent: L }),
  seg([0.58, 1.54, 3.22], [0.9, 1.74, 3.16], { shape: "cone", sides: 4, radius: 0.04, color: "light", mirror: true, parent: L }),
  // moustaches tombantes en trois brins
  { shape: "tube", radius: 0.03, sides: 5, path: [[0.38, 0.52, 6.15], [0.92, 0.48, 5.95], [1.36, 0.24, 5.35], [1.58, -0.14, 4.6]], bend: 0.25, color: "amber", mirror: true, parent: L },
  ...criniere(),
  // barbiche sous le menton
  seg([0, -0.3, 5.7], [0, -0.75, 5.3], { shape: "wedge", size: [0.26, 1, 0.08], color: "light", parent: L }, [0, 0, 1]),
  seg([0.16, -0.24, 5.45], [0.24, -0.62, 5.08], { shape: "wedge", size: [0.18, 1, 0.07], color: "light", mirror: true, parent: L }, [0, 0, 1]),
  // perle d'énergie dans son anneau, sous la gueule
  { shape: "sphere", radius: 0.3, detail: 1, pos: [0, -0.7, 6.35], color: "glow", parent: L },
  { shape: "torus", radius: 0.4, tube: 0.04, sides: 16, pos: [0, -0.7, 6.35], rot: [90, 0, 0], color: "amber", parent: L },
  ...[0, 90, 180].map((a): Part => ({ shape: "cone", sides: 6, radius: 0.04, height: 0.14, pos: [r3(0.47 * Math.cos((a * Math.PI) / 180)), r3(-0.7 + 0.47 * Math.sin((a * Math.PI) / 180)), 6.35], rot: [0, 0, a - 90], color: "amber", parent: L, fine: true })),
];

/** Plaque du panache de la queue, du point `a` au point `b`, à plat dans l'éventail. */
function plume(a: Vec3, b: Vec3, w: number, color: Part["color"]): Part {
  return seg(a, b, { shape: "wedge", size: [w, 1, 0.09], color, mirror: a[0] !== 0 || b[0] !== 0, parent: "ondule11" }, [b[0], b[1] - 0.4, 0]);
}

/** Queue : dernier anneau effilé et panache de plaques en flamme (pivot « ondule11 »). */
const queue: Part[] = [
  { shape: "cylinder", sides: 8, radius: 0.15, radiusTop: 0.27, height: 0.95, pos: [0, Y, -5.4], rot: [90, 0, 22.5], color: "faction", pivot: "ondule11" },
  { shape: "wedge", size: [0.22, 0.11, 0.44], pos: [0, 0.6, -5.2], color: "faction", parent: "ondule11" },
  { shape: "torus", radius: 0.26, tube: 0.03, sides: 12, pos: [0, Y, -4.95], rot: [90, 0, 0], color: "steel", parent: "ondule11", fine: true },
  { shape: "sphere", radius: 0.1, pos: [0, 0.4, -5.85], color: "glow", parent: "ondule11" },
  { shape: "wedge", size: [0.2, 0.1, 0.42], pos: [0.17, 0.52, -5.25], rot: [0, 0, -50], color: "faction", mirror: true, parent: "ondule11" },
  { shape: "box", size: [0.3, 0.08, 0.5], pos: [0, 0.14, -5.3], rot: [-8, 0, 0], color: "light", parent: "ondule11" },
  seg([0, 0.6, -5.15], [0, 0.92, -5.7], { shape: "wedge", size: [0.06, 1, 0.26], color: "amber", parent: "ondule11" }),
  // panache : grandes plaques en éventail, petites plaques claires intercalées, filets lumineux
  plume([0, 0.45, -5.75], [0, 1.18, -6.45], 0.32, "amber"),
  plume([0.08, 0.42, -5.8], [0.52, 0.98, -6.45], 0.3, "faction"),
  plume([0.1, 0.35, -5.8], [0.72, 0.42, -6.35], 0.28, "amber"),
  plume([0.08, 0.26, -5.8], [0.48, -0.15, -6.3], 0.26, "faction"),
  plume([0, 0.25, -5.8], [0, -0.28, -6.25], 0.26, "light"),
  plume([0.05, 0.42, -5.78], [0.3, 0.86, -6.2], 0.2, "light"),
  plume([0.06, 0.34, -5.78], [0.46, 0.18, -6.15], 0.2, "light"),
  seg([0, 0.38, -5.75], [0, 0.72, -6.2], { shape: "box", size: [0.03, 1, 0.03], color: "glow", parent: "ondule11" }),
  seg([0.04, 0.36, -5.75], [0.4, 0.36, -6.12], { shape: "box", size: [0.03, 1, 0.03], color: "glow", mirror: true, parent: "ondule11" }),
];

export const dragon: Model = {
  parts: [
    ...tete,
    // corps, de la tête vers la queue
    ...anneauDragon(2, 3.1, 1.36),
    ...anneauDragon(3, 2.15, 1.34),
    ...griffeDragon(3, 2.15, 1.34, 1),
    ...anneauDragon(4, 1.2, 1.3),
    ...anneauDragon(5, 0.25, 1.24),
    ...anneauDragon(6, -0.7, 1.17),
    ...anneauDragon(7, -1.65, 1.08),
    ...griffeDragon(7, -1.65, 1.08, -1),
    ...anneauDragon(8, -2.6, 0.98),
    ...anneauDragon(9, -3.55, 0.86),
    ...anneauDragon(10, -4.5, 0.74),
    ...queue,
  ],
};
