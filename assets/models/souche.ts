// La Souche (voir docs/spec/races.md) : organes et organismes vivants.
//
// Style : formes rondes et lisses (sphères lissées, profils tournés, tubes courbes), chair et écorce dans
// les verts et les bruns (leaf, leaf_dark, wood, dry, rust, flower), sève et yeux lumineux (amber, glow).
// La couleur du joueur reste discrète mais visible : nervures, crêtes, collerettes, bagues. Ni métal ni
// panneaux techniques.
//
// Bâtiments (unités de case, centrés, sol à y = 0, sortie vers +z) : graine-mère, racine, frondaison,
// racine-puits, bulbe, couveuse, matrice, épine (tourelle « tourelle »), floraison (corolle « radar »).
// Hors tourelles, le jeu fait tourner lentement les pivots d'un bâtiment au travail (hélice de la matrice).
//
// Unités : bêtes à pattes sur pivots « jambe… » (trépied alterné, voir faune.ts), tête ou cou sur pivot
// « tourelle » quand l'arme vise (reine, cracheur, carapace, liane). Le planeur n'a pas de pivot : le jeu
// n'anime pas les ailes.
import type { ColorName, Model, Part, Vec3 } from "./types.ts";

const D = Math.PI / 180;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const V = (x: number, y: number, z: number): Vec3 => [r3(x), r3(y), r3(z)];

// ---------- orientations (matrices 3 x 3, lignes) ----------
type M3 = number[];
const mul = (a: M3, b: M3): M3 => {
  const o: M3 = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return o;
};
const Rx = (a: number): M3 => [1, 0, 0, 0, Math.cos(a * D), -Math.sin(a * D), 0, Math.sin(a * D), Math.cos(a * D)];
const Ry = (a: number): M3 => [Math.cos(a * D), 0, Math.sin(a * D), 0, 1, 0, -Math.sin(a * D), 0, Math.cos(a * D)];
const Rz = (a: number): M3 => [Math.cos(a * D), -Math.sin(a * D), 0, Math.sin(a * D), Math.cos(a * D), 0, 0, 0, 1];
const app = (m: M3, v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
/** Angles d'Euler (ordre XYZ, degrés) d'une matrice de rotation, comme les lit le générateur. */
function eul(m: M3): Vec3 {
  const m13 = Math.max(-1, Math.min(1, m[2]));
  const y = Math.asin(m13);
  const [x, z] = Math.abs(m13) < 0.9999999 ? [Math.atan2(-m[5], m[8]), Math.atan2(-m[1], m[0])] : [Math.atan2(m[7], m[4]), 0];
  return [Math.round(x / D * 10) / 10, Math.round(y / D * 10) / 10, Math.round(z / D * 10) / 10];
}
/** Orientation : roulis autour de z, puis tangage autour de x, puis lacet autour de y. */
const ypr = (yaw: number, pitch: number, roll = 0): M3 => mul(Ry(yaw), mul(Rx(pitch), Rz(roll)));
/** Rotation qui amène l'axe +y (cônes, cylindres) sur la direction `d`. */
function along(d: Vec3): Vec3 {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return eul(ypr(Math.atan2(d[0], d[2]) / D, Math.acos(d[1] / l) / D));
}
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => V(a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Point sur un cercle horizontal : angle `a` en degrés (0 : vers +z, 90 : vers +x). */
const pol = (r: number, a: number, y: number): Vec3 => V(r * Math.sin(a * D), y, r * Math.cos(a * D));

// ---------- pièces organiques ----------
/** Boule lisse (sphère fine lissée), étirée par `sc`. */
const blob = (r: number, pos: Vec3, sc: number | Vec3, color: ColorName, extra: Partial<Part> = {}): Part => ({ shape: "sphere", radius: r, detail: 1, smooth: true, pos, scale: sc, color, ...extra });
/** Petite bille à facettes (20 triangles) : yeux, œufs, spores, bossettes. */
const bille = (r: number, pos: Vec3, sc: number | Vec3, color: ColorName, extra: Partial<Part> = {}): Part => ({ shape: "sphere", radius: r, detail: 0, pos, scale: sc, color, ...extra });

/** Contour de feuille (pointe en haut), longueur `L` sur y, largeur `W`. */
function feuilleProfil(L: number, W: number, n = 6, arr = 0.15): [number, number][] {
  const right: [number, number][] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    right.push([r3((W / 2) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75)), r3(t * L)]);
  }
  return [[r3(arr * W * 0.3), 0], ...right, [0, L], ...right.slice().reverse().map(([x, y]): [number, number] => [-x, y]), [r3(-arr * W * 0.3), 0]];
}

/**
 * Feuille plate posée en `base`, dirigée selon le lacet `yaw` (0 : vers +z) et relevée de `elev` degrés
 * au-dessus de l'horizontale, avec sa nervure centrale (`rib`, facultative). `tilt` : matrice appliquée
 * ensuite (corolle inclinée), autour de `org`.
 */
function feuille(base: Vec3, yaw: number, elev: number, L: number, W: number, color: ColorName, rib?: ColorName, extra: Partial<Part> = {}, tilt?: M3, org: Vec3 = [0, 0, 0]): Part[] {
  let m = ypr(yaw, 90 - elev);
  let b = base;
  if (tilt) {
    m = mul(tilt, m);
    b = add(org, app(tilt, sub(base, org)));
  }
  const dir = app(m, [0, 1, 0]);
  const up = app(m, [0, 0, -1]);
  const out: Part[] = [{ shape: "extrude", profile: feuilleProfil(L, W), depth: 0.03, pos: V(...b), rot: eul(m), color, ...extra }];
  if (rib) {
    const a = add(b, up, 0.02);
    out.push({ shape: "tube", radius: Math.max(0.012, W * 0.04), sides: 4, path: [a, add(a, dir, L * 0.82)], color: rib, ...extra, fine: true });
  }
  return out;
}

/** Nervure qui suit un profil tourné (lathe posé en `pos`), sur le méridien d'angle `a`, décalée de `off`. */
function meridien(profile: [number, number][], pos: Vec3, a: number, off: number, from: number, to: number, r: number, color: ColorName, extra: Partial<Part> = {}): Part {
  const path = profile.slice(from, to + 1).map(([rr, y]) => add(pos, pol(rr + off, a, y)));
  return { shape: "tube", radius: r, sides: 4, path, bend: 0, color, ...extra };
}

/** Racine qui part de `from` vers l'extérieur selon l'angle `a`, rampe au sol et s'y enfonce (pointe effilée). */
function racine(from: Vec3, a: number, len: number, r: number, color: ColorName = "wood", sink = 0.12): Part[] {
  const d0 = Math.hypot(from[0], from[2]);
  const mid = pol(d0 + len * 0.55, a + 4, Math.max(r * 0.55, from[1] * 0.3));
  const tip = pol(d0 + len, a + 9, -r * 0.6 - sink * 0.2);
  return [{ shape: "tube", radius: r, sides: 5, path: [from, mid, tip], bend: len * 0.3, color }];
}

/** Tertre de terre ou d'écorce (profil tourné bas, bord adouci), rayon `R`, hauteur `h`. */
const tertre = (R: number, h: number, color: ColorName, y = 0): Part => ({
  shape: "lathe", sides: 16, pos: [0, y, 0], color,
  profile: [[0, 0], [R, 0], [R * 0.92, h * 0.35], [R * 0.72, h * 0.75], [R * 0.4, h * 0.97], [0, h]].map(([a, b]): [number, number] => [r3(a), r3(b)]),
});

/** Grappe de petites boules lumineuses (sève, œufs, spores). */
const grappe = (c: Vec3, s: number, color: ColorName, stretch = 1.2): Part[] => [
  bille(0.16 * s, c, [1, stretch, 1], color),
  bille(0.12 * s, add(c, [0.19 * s, -0.04 * s, 0.07 * s]), [1, stretch, 1], color),
  bille(0.11 * s, add(c, [-0.1 * s, -0.05 * s, 0.17 * s]), [1, stretch, 1], color),
];

// ---------- pattes (unités) ----------
/** Points d'une chaîne de segments depuis `from` : lacet `yaw` (négatif : vers l'avant), [pente, longueur]. */
function chaine(from: Vec3, yaw: number, segs: [number, number][]): Vec3[] {
  const pts: Vec3[] = [from];
  let p = from;
  const ay = yaw * D;
  for (const [tilt, len] of segs) {
    const t = tilt * D;
    p = V(p[0] + Math.cos(t) * Math.cos(ay) * len, p[1] + Math.sin(t) * len, p[2] - Math.cos(t) * Math.sin(ay) * len);
    pts.push(p);
  }
  return pts;
}

/**
 * Patte (côté droit si `side` = 1, gauche si -1) : articulation ronde sur le pivot `name` à la hanche,
 * tube coudé, griffe au bout. Les pivots « jambe… » se balancent en marchant (voir faune.ts).
 */
function patte(name: string, side: 1 | -1, hip: Vec3, yaw: number, segs: [number, number][], r: number, color: ColorName, joint: ColorName, claw: ColorName = "dry"): Part[] {
  const pts = chaine(hip, yaw, segs).map((p): Vec3 => [p[0] * side, p[1], p[2]]);
  const last = pts[pts.length - 1];
  const dir = sub(last, pts[pts.length - 2]);
  const l = Math.hypot(...dir);
  const d0 = sub(pts[1], pts[0]);
  return [
    { shape: "cylinder", sides: 6, radius: r * 1.6, radiusTop: r * 1.2, height: r * 3, pos: add(pts[0], d0, (r * 0.8) / Math.hypot(...d0)), rot: along(d0), color: joint, pivot: name },
    { shape: "tube", radius: r, sides: 5, path: pts, bend: 0, color, parent: name },
    { shape: "cone", sides: 5, radius: r * 0.9, height: r * 3, pos: add(last, dir, (r * 1.2) / l), rot: along(dir), color: claw, parent: name },
  ];
}

/** Six pattes en trépied alterné (avant droite, milieu gauche, arrière droite ensemble). */
function sixPattes(hips: [Vec3, Vec3, Vec3], yaws: [number, number, number], segs: [number, number][], r: number, color: ColorName, joint: ColorName, claw?: ColorName): Part[] {
  const names = [["jambe_t_d", "jambe_t_g"], ["jambe_ar_m_d", "jambe_ar_m_g"], ["jambe_q_d", "jambe_q_g"]];
  return names.flatMap(([d, g], i) => [...patte(d, 1, hips[i], yaws[i], segs, r, color, joint, claw), ...patte(g, -1, hips[i], yaws[i], segs, r, color, joint, claw)]);
}

/** Quatre pattes au trot (diagonales ensemble). */
function quatrePattes(front: Vec3, back: Vec3, yf: number, yb: number, segs: [number, number][], r: number, color: ColorName, joint: ColorName, claw?: ColorName): Part[] {
  return [
    ...patte("jambe_av_d", 1, front, yf, segs, r, color, joint, claw),
    ...patte("jambe_av_g", -1, front, yf, segs, r, color, joint, claw),
    ...patte("jambe_ar_d", 1, back, yb, segs, r, color, joint, claw),
    ...patte("jambe_ar_g", -1, back, yb, segs, r, color, joint, claw),
  ];
}

/** Yeux lumineux (paire, symétriques en x). */
const yeux = (x: number, y: number, z: number, r: number, color: ColorName = "amber", extra: Partial<Part> = {}): Part => bille(r, V(x, y, z), 1, color, { mirror: true, ...extra });

// =====================================================================================================
// Bâtiments
// =====================================================================================================

// graine-mère : grosse graine charnue à demi enterrée dans un monticule, nervures d'équipe sur les côtes,
// sommet fendu d'où sort un cœur de sève lumineux et une pousse ; racines épaisses qui plongent dans le sol,
// poches de sève ambrées autour de la base
const GRAINE: [number, number][] = [[0, 0.05], [0.78, 0.1], [1.0, 0.35], [1.06, 0.68], [0.98, 1.0], [0.8, 1.3], [0.55, 1.55], [0.32, 1.7], [0.22, 1.74], [0, 1.72]];
const seedHeart: Model = {
  parts: [
    tertre(1.2, 0.26, "wood"),
    tertre(1.0, 0.36, "leaf_dark"),
    ...[20, 75, 130, 185, 240, 300].flatMap((a) => racine(pol(0.85, a, 0.38), a, 0.66, 0.12)),
    ...[50, 160, 270].flatMap((a) => racine(pol(0.9, a, 0.2), a, 0.55, 0.07, "rust").map((p): Part => ({ ...p, fine: true }))),
    { shape: "lathe", sides: 18, profile: GRAINE, pos: [0, 0.1, 0], color: "rust" },
    ...[0, 60, 120, 180, 240, 300].map((a) => meridien(GRAINE, [0, 0.1, 0], a, 0.015, 1, 7, 0.055, "faction")),
    // veines de sève lumineuses entre les côtes
    ...[30, 90, 150, 210, 270, 330].map((a) => meridien(GRAINE, [0, 0.1, 0], a, -0.005, 1, 5, 0.03, "amber", { fine: true })),
    // sommet fendu : lèvres, cœur de sève lumineux, pousse
    { shape: "torus", radius: 0.26, tube: 0.08, sides: 14, pos: [0, 1.8, 0], color: "wood" },
    blob(0.24, [0, 1.84, 0], [1, 0.9, 1], "amber"),
    { shape: "tube", radius: 0.045, sides: 6, path: [[0, 1.85, 0], [0.04, 2.15, 0.02], [0.02, 2.35, -0.05]], color: "leaf" },
    ...feuille([0.03, 2.2, 0], 70, 35, 0.5, 0.26, "leaf", "leaf_dark"),
    ...feuille([0.0, 2.3, -0.04], 230, 45, 0.42, 0.22, "leaf", "leaf_dark"),
    // poches de sève lumineuses à la base
    ...[45, 165, 285].flatMap((a) => grappe(pol(1.05, a, 0.2), 1.1, "amber")),
    // feuilles basses autour de la graine
    ...[100, 210, 330].flatMap((a) => feuille(pol(0.95, a, 0.22), a + 15, 12, 0.5, 0.28, "leaf", "leaf_dark")),
  ],
};

// racine : nœud de racines très bas, quatre racines qui filent jusqu'au milieu des bords de la case (les files
// se raccordent) et radicelles fines vers les coins ; bague d'équipe sur le nœud
const root: Model = {
  parts: [
    { shape: "lathe", sides: 8, profile: [[0, 0], [0.17, 0], [0.15, 0.05], [0.08, 0.1], [0, 0.11]], color: "wood" },
    { shape: "torus", radius: 0.12, tube: 0.025, sides: 8, pos: [0, 0.06, 0], color: "faction" },
    { shape: "cone", sides: 5, radius: 0.05, height: 0.08, pos: [0, 0.13, 0], color: "amber" },
    ...[0, 90, 180, 270].map((a): Part => ({ shape: "tube", radius: 0.045, sides: 4, path: [pol(0.08, a, 0.05), pol(0.27, a + 9, 0.04), pol(0.48, a, 0.03)], bend: 0, color: "wood" })),
    ...[45, 135, 225, 315].map((a): Part => ({ shape: "tube", radius: 0.02, sides: 3, path: [pol(0.1, a, 0.03), pol(0.28, a + 12, 0.02), pol(0.45, a - 4, 0.012)], bend: 0, color: "rust", fine: true })),
  ],
};

// frondaison : courte souche d'écorce, rosette de grandes feuilles en éventail à nervure d'équipe, frondes
// dressées au centre, spores lumineuses sur tiges
const leaves: Model = {
  parts: [
    tertre(0.5, 0.15, "wood"),
    { shape: "lathe", sides: 12, profile: [[0, 0], [0.3, 0], [0.24, 0.2], [0.16, 0.45], [0.15, 0.55], [0, 0.56]], color: "wood" },
    ...[0, 45, 90, 135, 180, 225, 270, 315].flatMap((a, i) => feuille(pol(0.12, a, 0.48), a + 10, 22 - (i % 2) * 10, 0.95, 0.52, i % 2 ? "leaf_dark" : "leaf", "faction")),
    ...[30, 150, 270].flatMap((a) => feuille(pol(0.06, a, 0.52), a, 58, 0.72, 0.32, "leaf", "leaf_dark")),
    ...[90, 210, 330].flatMap((a): Part[] => [
      { shape: "tube", radius: 0.02, sides: 4, path: [pol(0.04, a, 0.5), pol(0.12, a + 10, 0.85)], color: "leaf_dark", fine: true },
      blob(0.06, pol(0.12, a + 10, 0.88), 1, "glow"),
    ]),
  ],
};

// racine-puits : tige gonflée d'écorce plantée dans le gisement, bagues d'équipe, veines de sève ambrée qui
// montent, bouche aspirante lumineuse sous une couronne de feuilles ; racines qui plongent tout autour
const TIGE: [number, number][] = [[0, 0], [0.52, 0], [0.64, 0.18], [0.68, 0.45], [0.6, 0.78], [0.4, 1.08], [0.24, 1.35], [0.2, 1.52], [0.26, 1.64], [0.3, 1.72], [0, 1.7]];
const taproot: Model = {
  parts: [
    tertre(0.9, 0.22, "dry"),
    ...[0, 60, 120, 180, 240, 300].flatMap((a) => racine(pol(0.5, a, 0.3), a + 20, 0.55, 0.09, "wood", 0.3)),
    { shape: "lathe", sides: 16, profile: TIGE, color: "wood" },
    ...[0.32, 0.62].map((y): Part => ({ shape: "torus", radius: y < 0.5 ? 0.67 : 0.64, tube: 0.04, sides: 16, pos: [0, y, 0], color: "faction" })),
    { shape: "torus", radius: 0.22, tube: 0.035, sides: 12, pos: [0, 1.4, 0], color: "faction" },
    ...[45, 135, 225, 315].map((a) => meridien(TIGE, [0, 0, 0], a, 0.01, 1, 7, 0.022, "amber")),
    blob(0.2, [0, 1.72, 0], [1, 0.6, 1], "amber"),
    ...[0, 90, 180, 270].flatMap((a) => feuille(pol(0.22, a, 1.65), a + 30, 30, 0.55, 0.28, "leaf", "leaf_dark")),
  ],
};

// bulbe : gros sac de sève lumineux tenu par un filet de nervures sombres, collerette d'équipe au col, sépales
// en coupe à la base, petite couronne de feuilles ; deux petits bulbes satellites
const SAC: [number, number][] = [[0, 0.08], [0.45, 0.1], [0.7, 0.3], [0.8, 0.6], [0.74, 0.92], [0.55, 1.17], [0.32, 1.32], [0.2, 1.42], [0, 1.44]];
const bulb: Model = {
  parts: [
    tertre(0.9, 0.2, "wood"),
    { shape: "lathe", sides: 18, profile: SAC, color: "flower" },
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => meridien(SAC, [0, 0, 0], a, 0.015, 1, 7, 0.04, "leaf_dark")),
    ...[22, 112, 202, 292].map((a) => meridien(SAC, [0, 0, 0], a, 0.005, 2, 6, 0.03, "amber")),
    { shape: "torus", radius: 0.21, tube: 0.06, sides: 14, pos: [0, 1.4, 0], color: "faction" },
    ...[0, 120, 240].flatMap((a) => feuille(pol(0.1, a, 1.45), a + 40, 50, 0.38, 0.2, "leaf", "leaf_dark")),
    ...[30, 90, 150, 210, 270, 330].flatMap((a) => feuille(pol(0.66, a, 0.14), a, 66, 0.55, 0.42, "leaf_dark", "leaf")),
    // bulbes satellites
    blob(0.24, pol(0.78, 125, 0.22), [1, 1.2, 1], "amber"),
    { shape: "torus", radius: 0.1, tube: 0.035, sides: 10, pos: pol(0.78, 125, 0.48), color: "faction" },
    blob(0.18, pol(0.8, 235, 0.17), [1, 1.2, 1], "amber"),
    { shape: "torus", radius: 0.07, tube: 0.03, sides: 10, pos: pol(0.8, 235, 0.36), color: "faction" },
  ],
};

// couveuse : dôme de chair à nervures d'équipe, grande bouche à lèvres d'écorce tournée vers l'avant (+z),
// lueur au fond ; nid d'œufs lumineux sur le dos, pustules, racines qui ancrent le dôme
const DOME: [number, number][] = [[0, 0], [1.3, 0], [1.34, 0.22], [1.26, 0.58], [1.06, 0.95], [0.72, 1.24], [0.36, 1.38], [0, 1.42]];
const brood: Model = {
  parts: [
    tertre(1.3, 0.22, "wood"),
    ...[45, 135, 225, 315].flatMap((a) => racine(pol(1.05, a, 0.3), a, 0.5, 0.11)),
    { shape: "lathe", sides: 20, profile: DOME, color: "rust" },
    ...[50, 100, 150, 210, 260, 310].map((a) => meridien(DOME, [0, 0, 0], a, 0.02, 1, 6, 0.06, "faction")),
    // bouche vers l'avant
    blob(0.66, [0, 0.52, 1.0], [1.05, 0.78, 0.6], "dry"),
    { shape: "torus", radius: 0.52, tube: 0.13, sides: 16, pos: [0, 0.52, 1.3], rot: [90, 0, 0], scale: [1, 1, 0.78], color: "wood" },
    blob(0.47, [0, 0.52, 1.28], [1, 0.74, 0.35], "black"),
    blob(0.2, [0, 0.5, 1.35], [1.2, 0.8, 0.5], "amber"),
    ...[-1, 1].map((s): Part => ({ shape: "cone", sides: 6, radius: 0.08, height: 0.32, pos: [s * 0.62, 0.3, 1.46], rot: along([s * 0.3, 0.5, 1]), color: "dry" })),
    // nid d'œufs sur le dos
    { shape: "torus", radius: 0.5, tube: 0.12, sides: 16, pos: [0, 1.3, -0.15], color: "wood" },
    ...grappe([0.05, 1.45, -0.2], 1.5, "amber", 1.3),
    ...grappe([-0.2, 1.42, 0.05], 1.1, "amber", 1.3),
    // œufs et pustules sur les flancs
    ...grappe(pol(1.18, 70, 0.5), 1.0, "amber", 1.3),
    ...grappe(pol(1.18, 290, 0.5), 1.0, "amber", 1.3),
    blob(0.2, pol(1.05, 180, 0.85), [1, 0.7, 1], "leaf"),
    blob(0.16, pol(0.95, 230, 1.02), [1, 0.7, 1], "leaf"),
    blob(0.18, pol(0.98, 130, 0.95), [1, 0.7, 1], "leaf"),
  ],
};

// matrice : monticule d'écorce, double hélice organique (brins vert et brun, barreaux lumineux) qui tourne
// au travail, graine lumineuse au sommet tenue par trois feuilles, bagues d'équipe en pied et en tête
function brin(phase: number, n: number, color: ColorName): Part {
  const path: Vec3[] = [];
  for (let i = 0; i <= n; i++) path.push(pol(0.36, phase + i * 30, 0.32 + i * 0.07));
  return { shape: "tube", radius: 0.07, sides: 6, path, bend: 0, color, parent: "spirale" };
}
const matrix: Model = {
  parts: [
    tertre(0.75, 0.22, "wood"),
    ...[30, 150, 270].flatMap((a) => racine(pol(0.45, a, 0.18), a, 0.5, 0.08)),
    { shape: "lathe", sides: 16, profile: [[0, 0], [0.55, 0], [0.55, 0.14], [0.46, 0.26], [0, 0.28]], color: "leaf_dark" },
    { shape: "torus", radius: 0.5, tube: 0.05, sides: 16, pos: [0, 0.22, 0], color: "faction" },
    { shape: "cylinder", sides: 10, radius: 0.08, height: 1.6, pos: [0, 1.05, 0], color: "leaf_dark", pivot: "spirale" },
    brin(0, 20, "leaf"),
    brin(180, 20, "wood"),
    ...[2, 5, 8, 11, 14, 17].map((i): Part => ({ shape: "tube", radius: 0.025, sides: 4, path: [pol(0.33, i * 30, 0.32 + i * 0.07), pol(0.33, i * 30 + 180, 0.32 + i * 0.07)], color: "glow", parent: "spirale" })),
    ...[2, 8, 14].map((i): Part => bille(0.08, pol(0.36, i * 30, 0.32 + i * 0.07), 1, "glow", { parent: "spirale" })),
    ...[5, 11, 17].map((i): Part => bille(0.08, pol(0.36, i * 30 + 180, 0.32 + i * 0.07), 1, "glow", { parent: "spirale" })),
    // tête : bague, trois feuilles, graine lumineuse
    { shape: "torus", radius: 0.16, tube: 0.04, sides: 12, pos: [0, 1.82, 0], color: "faction" },
    ...[0, 120, 240].flatMap((a) => feuille(pol(0.08, a, 1.82), a, 40, 0.4, 0.22, "leaf", "leaf_dark")),
    blob(0.17, [0, 1.98, 0], [1, 1.2, 1], "glow"),
  ],
};

// épine : tertre d'écorce, racines et collerette de feuilles ; tourelle (pivot « tourelle ») en cosse
// charnue : grande épine d'os sortant d'une bouche vers l'avant, couronne d'épines, crête d'équipe sur le
// dos, sacs d'acide lumineux sur les flancs
const thorn: Model = {
  parts: [
    tertre(0.75, 0.24, "wood"),
    ...[45, 135, 225, 315].flatMap((a) => racine(pol(0.5, a, 0.22), a, 0.42, 0.08)),
    ...[0, 60, 120, 180, 240, 300].flatMap((a) => feuille(pol(0.4, a, 0.2), a + 15, 14, 0.46, 0.28, "leaf_dark", "leaf")),
    { shape: "lathe", sides: 14, profile: [[0, 0], [0.5, 0], [0.44, 0.25], [0.32, 0.45], [0, 0.48]], color: "wood" },
    // tourelle
    bille(0.3, [0, 0.5, 0], [1, 0.6, 1], "leaf_dark", { pivot: "tourelle" }),
    blob(0.5, [0, 0.88, -0.12], [0.92, 0.78, 1.05], "leaf_dark", { parent: "tourelle" }),
    blob(0.34, [0, 0.9, 0.28], [1, 0.9, 0.75], "leaf", { parent: "tourelle" }),
    { shape: "torus", radius: 0.19, tube: 0.07, sides: 12, pos: [0, 0.92, 0.46], rot: [90, 0, 0], color: "rust", parent: "tourelle" },
    { shape: "cone", sides: 8, radius: 0.15, height: 0.62, pos: [0, 0.92, 0.66], rot: [90, 0, 0], color: "dry", parent: "tourelle" },
    ...[-1, 1].map((s): Part => ({ shape: "cone", sides: 6, radius: 0.07, height: 0.36, pos: [s * 0.3, 0.98, 0.42], rot: along([s * 0.45, 0.15, 1]), color: "dry", parent: "tourelle" })),
    ...[-1, 1].map((s): Part => ({ shape: "cone", sides: 6, radius: 0.06, height: 0.3, pos: [s * 0.42, 0.95, 0.0], rot: along([s, 0.35, 0.2]), color: "dry", parent: "tourelle", fine: true })),
    { shape: "cone", sides: 6, radius: 0.07, height: 0.36, pos: [0, 1.2, 0.36], rot: along([0, 0.6, 1]), color: "dry", parent: "tourelle" },
    ...[-1, 1].map((s): Part => ({ shape: "extrude", profile: [[-0.6, 0], [0.3, 0], [0.18, 0.2], [-0.05, 0.36], [-0.3, 0.34], [-0.5, 0.18]], depth: 0.06, pos: [s * 0.08, 1.17, -0.14], rot: eul(mul(Rz(-s * 32), Ry(-90))), color: "faction", parent: "tourelle" })),
    blob(0.17, [0.4, 0.82, -0.24], [0.8, 1, 1.2], "amber", { parent: "tourelle", mirror: true }),
    yeux(0.17, 1.04, 0.42, 0.045, "amber", { parent: "tourelle", fine: true }),
  ],
};

// floraison : tige courbe et feuilles de pied ; corolle inclinée qui tourne (pivot « radar ») : six grands
// pétales jaunes, six petits pétales rouille, cœur lumineux cerné d'une bague d'équipe, étamines
const COROLLE = ypr(0, 22);
const CO: Vec3 = [0, 1.25, 0];
const bloom: Model = {
  parts: [
    tertre(0.62, 0.16, "wood"),
    ...[20, 140, 260].flatMap((a) => feuille(pol(0.1, a, 0.1), a, 25, 0.75, 0.4, "leaf", "leaf_dark")),
    { shape: "tube", radius: 0.07, sides: 6, path: [[0, 0.05, 0], [0.06, 0.5, -0.04], [0, 1.0, 0.02], [0, 1.22, 0]], color: "leaf_dark" },
    ...feuille([0.04, 0.55, -0.03], 100, 30, 0.42, 0.2, "leaf", "leaf_dark"),
    blob(0.14, CO, [1, 0.7, 1], "leaf_dark", { pivot: "radar" }),
    ...[0, 60, 120, 180, 240, 300].flatMap((a) => feuille(add(CO, pol(0.12, a, 0.04)), a, 32, 0.78, 0.48, "flower", "faction", { parent: "radar" }, COROLLE, CO)),
    ...[30, 90, 150, 210, 270, 330].flatMap((a) => feuille(add(CO, pol(0.1, a, 0.08)), a, 55, 0.4, 0.26, "rust", undefined, { parent: "radar" }, COROLLE, CO)),
    { shape: "torus", radius: 0.2, tube: 0.06, sides: 12, pos: add(CO, app(COROLLE, [0, 0.14, 0])), rot: eul(COROLLE), color: "faction", parent: "radar" },
    blob(0.14, add(CO, app(COROLLE, [0, 0.14, 0])), [1, 0.55, 1], "amber", { parent: "radar", rot: eul(COROLLE) }),
    ...[0, 72, 144, 216, 288].flatMap((a): Part[] => {
      const tip = add(CO, app(COROLLE, pol(0.1, a, 0.42)));
      return [
        { shape: "tube", radius: 0.012, sides: 4, path: [add(CO, app(COROLLE, [0, 0.12, 0])), tip], color: "dry", parent: "radar", fine: true },
        blob(0.035, tip, 1, "glow", { parent: "radar", fine: true }),
      ];
    }),
  ],
};

export const SOUCHE_BUILDING_MODELS: Record<string, Model> = {
  seed_heart: seedHeart,
  root,
  leaves,
  taproot,
  bulb,
  brood,
  matrix,
  thorn,
  bloom,
};

// =====================================================================================================
// Unités
// =====================================================================================================

// reine : grande bête à six pattes d'écorce, thorax vert sombre, abdomen gonflé cerclé de bandes de sève
// lumineuses et coiffé d'une crête d'équipe ; tête (pivot « tourelle ») à quatre yeux ambrés, mandibules
// d'os, bouche d'acide lumineuse, couronne d'équipe à pointes jaunes et gemme ambrée
const queen: Model = {
  parts: [
    // abdomen
    blob(0.85, [0, 1.0, -1.25], [1, 0.82, 1.35], "leaf"),
    ...[-0.75, -1.25, -1.75].map((z): Part => {
      const k = Math.sqrt(Math.max(0.05, 1 - ((z + 1.25) / 1.15) ** 2));
      return { shape: "torus", radius: 0.85 * k, tube: 0.05, sides: 12, pos: [0, 1.0, z], rot: [90, 0, 0], scale: [1, 1, 0.82], color: "amber" };
    }),
    { shape: "tube", radius: 0.09, sides: 6, path: [[0, 1.62, -0.55], [0, 1.72, -1.1], [0, 1.65, -1.65], [0, 1.35, -2.15]], bend: 0.4, color: "faction" },
    ...[-0.7, -1.2, -1.7].map((z): Part => ({ shape: "cone", sides: 5, radius: 0.07, height: 0.3, pos: [0, 1.82 - Math.abs(z + 1.1) * 0.25, z], rot: along([0, 1, -0.3]), color: "dry", fine: true })),
    bille(0.14, [0, 0.75, -2.35], [1, 1, 1.2], "amber", { fine: true }),
    // thorax
    blob(0.56, [0, 1.05, 0.05], [1.1, 0.85, 1.05], "leaf_dark"),
    { shape: "extrude", profile: feuilleProfil(0.7, 0.45), depth: 0.04, pos: [0.3, 1.42, 0.25], rot: eul(ypr(140, 70)), color: "faction", mirror: true, fine: true },
    // tête
    bille(0.3, [0, 1.12, 0.62], [1, 0.9, 1], "leaf_dark", { pivot: "tourelle" }),
    blob(0.4, [0, 1.15, 0.9], [1, 0.82, 1.05], "rust", { parent: "tourelle" }),
    yeux(0.2, 1.3, 1.24, 0.07, "amber", { parent: "tourelle" }),
    yeux(0.32, 1.2, 1.16, 0.05, "amber", { parent: "tourelle", fine: true }),
    bille(0.13, [0, 1.0, 1.3], [1.3, 0.8, 0.6], "amber", { parent: "tourelle" }),
    ...[-1, 1].map((s): Part => ({ shape: "tube", radius: 0.05, sides: 5, path: [[s * 0.22, 0.98, 1.2], [s * 0.3, 0.95, 1.45], [s * 0.1, 0.92, 1.62]], bend: 0, color: "dry", parent: "tourelle", fine: true })),
    // couronne
    { shape: "torus", radius: 0.26, tube: 0.06, sides: 14, pos: [0, 1.5, 0.84], rot: [-12, 0, 0], color: "faction", parent: "tourelle" },
    ...[0, 72, 144, 216, 288].map((a): Part => ({ shape: "cone", sides: 6, radius: 0.06, height: 0.34, pos: add([0, 1.62, 0.84], pol(0.24, a, 0)), rot: along(add([0, 1, 0], pol(0.4, a, 0))), color: "flower", parent: "tourelle" })),
    bille(0.09, [0, 1.6, 0.84], 1, "amber", { parent: "tourelle" }),
    // pattes
    ...sixPattes([[0.45, 1.0, 0.42], [0.52, 0.98, 0.02], [0.45, 0.98, -0.38]], [-40, 2, 40], [[38, 0.8], [-58, 1.0], [-85, 0.22]], 0.075, "wood", "leaf_dark"),
  ],
};

// semeur : petit ouvrier vert à six pattes fines, tête à yeux ambrés et antennes lumineuses, gros sac de
// graines en toile sèche sur le dos, lié d'une sangle et d'un nœud d'équipe, graines qui dépassent
const sower: Model = {
  parts: [
    blob(0.42, [0, 0.55, -0.05], [1, 0.75, 1.2], "leaf"),
    blob(0.26, [0, 0.6, 0.5], [1, 0.9, 1], "leaf_dark"),
    yeux(0.12, 0.68, 0.72, 0.05),
    ...[-1, 1].map((s): Part => ({ shape: "tube", radius: 0.015, sides: 4, path: [[s * 0.08, 0.78, 0.62], [s * 0.2, 1.0, 0.78], [s * 0.28, 1.05, 0.92]], color: "leaf_dark", fine: true })),
    yeux(0.28, 1.05, 0.92, 0.035, "glow", { fine: true }),
    // sac de graines
    blob(0.42, [0, 1.0, -0.2], [1, 0.85, 1.05], "dry"),
    { shape: "torus", radius: 0.4, tube: 0.04, sides: 14, pos: [0, 0.85, -0.12], rot: [0, 0, 90], scale: [1, 1, 0.9], color: "faction" },
    { shape: "torus", radius: 0.14, tube: 0.05, sides: 12, pos: [0, 1.36, -0.25], color: "faction" },
    blob(0.1, [0.05, 1.46, -0.22], [1, 1.3, 1], "flower"),
    blob(0.08, [-0.08, 1.44, -0.3], [1, 1.3, 1], "wood"),
    blob(0.07, [0.02, 1.47, -0.33], [1, 1.3, 1], "flower"),
    ...sixPattes([[0.25, 0.5, 0.2], [0.3, 0.48, -0.05], [0.25, 0.48, -0.3]], [-40, 0, 40], [[30, 0.35], [-65, 0.5]], 0.04, "wood", "leaf_dark"),
  ],
};

// rongeur : bête basse et allongée, corps rouille à bande dorsale d'équipe et épines d'os, grosse tête
// d'écorce à mâchoires en crochets, yeux ambrés ; six pattes longues pour la course
const gnawer: Model = {
  parts: [
    blob(0.38, [0, 0.5, -0.35], [0.95, 0.7, 1.6], "rust"),
    blob(0.3, [0, 0.52, 0.18], [1.05, 0.8, 1], "rust"),
    { shape: "tube", radius: 0.06, sides: 5, path: [[0, 0.78, 0.25], [0, 0.78, -0.3], [0, 0.66, -0.85], [0, 0.48, -1.05]], bend: 0.25, color: "faction" },
    ...[0.05, -0.3, -0.65].map((z): Part => ({ shape: "cone", sides: 5, radius: 0.05, height: 0.22, pos: [0, 0.88 - Math.abs(z) * 0.15, z], rot: along([0, 1, -0.5]), color: "dry" })),
    blob(0.3, [0, 0.52, 0.55], [1.05, 0.78, 1.05], "wood"),
    yeux(0.16, 0.65, 0.76, 0.05),
    blob(0.1, [0, 0.42, 0.82], [1.4, 0.7, 0.6], "red"),
    ...[-1, 1].map((s): Part => ({ shape: "tube", radius: 0.055, sides: 5, path: [[s * 0.2, 0.45, 0.72], [s * 0.3, 0.42, 0.95], [s * 0.08, 0.4, 1.12]], bend: 0.1, color: "dry" })),
    ...sixPattes([[0.22, 0.5, 0.25], [0.26, 0.48, -0.1], [0.24, 0.48, -0.45]], [-45, 5, 45], [[35, 0.45], [-62, 0.62]], 0.045, "wood", "rust"),
  ],
};

// cracheur : corps vert sombre sur quatre pattes, grand sac d'acide lumineux sur le dos tenu par des
// nervures ; long cou (pivot « tourelle ») courbé vers l'avant, collerette d'équipe, bouche d'acide
const ACIDE: [number, number][] = [[0, 0], [0.32, 0.03], [0.46, 0.2], [0.48, 0.42], [0.38, 0.62], [0.2, 0.74], [0, 0.76]];
const spitter: Model = {
  parts: [
    blob(0.5, [0, 0.72, -0.15], [0.95, 0.7, 1.2], "leaf_dark"),
    { shape: "lathe", sides: 16, profile: ACIDE, pos: [0, 0.95, -0.35], color: "amber" },
    ...[0, 90, 180, 270].map((a) => meridien(ACIDE, [0, 0.95, -0.35], a + 45, 0.015, 1, 5, 0.03, "leaf_dark")),
    { shape: "torus", radius: 0.2, tube: 0.05, sides: 12, pos: [0, 1.67, -0.35], color: "faction" },
    // cou et tête
    blob(0.2, [0, 0.82, 0.38], 1, "leaf_dark", { pivot: "tourelle" }),
    { shape: "tube", radius: 0.1, sides: 8, path: [[0, 0.82, 0.38], [0, 1.4, 0.55], [0, 1.7, 0.85], [0, 1.68, 1.12]], bend: 0.3, color: "leaf", parent: "tourelle" },
    { shape: "torus", radius: 0.17, tube: 0.05, sides: 12, pos: [0, 1.66, 1.0], rot: [80, 0, 0], color: "faction", parent: "tourelle" },
    blob(0.2, [0, 1.68, 1.2], [0.9, 0.8, 1.2], "leaf_dark", { parent: "tourelle" }),
    yeux(0.11, 1.8, 1.3, 0.04, "amber", { parent: "tourelle" }),
    blob(0.08, [0, 1.62, 1.44], [1.2, 0.9, 0.6], "amber", { parent: "tourelle" }),
    ...quatrePattes([0.35, 0.7, 0.2], [0.35, 0.7, -0.5], -30, 30, [[30, 0.45], [-70, 0.7]], 0.055, "wood", "leaf_dark"),
  ],
};

// carapace : char vivant, lourde carapace bombée vert sombre à crête d'équipe, plaques et bossettes d'os,
// rebord sec ; tête trapue (pivot « tourelle ») à corne d'os et yeux ambrés ; six pattes courtes et épaisses
const CARAPACE: [number, number][] = [[0, 0], [1.0, 0], [1.06, 0.12], [1.0, 0.4], [0.82, 0.7], [0.5, 0.92], [0, 1.0]];
const shell: Model = {
  parts: [
    blob(0.8, [0, 0.55, -0.05], [1, 0.45, 1.25], "wood"),
    { shape: "lathe", sides: 18, profile: CARAPACE, pos: [0, 0.5, -0.05], scale: [1, 1, 1.25], color: "leaf_dark" },
    { shape: "torus", radius: 1.02, tube: 0.07, sides: 14, pos: [0, 0.56, -0.05], scale: [1, 1, 1.25], color: "dry" },
    { shape: "tube", radius: 0.08, sides: 6, path: [[0, 1.3, 0.95], [0, 1.52, 0.3], [0, 1.52, -0.4], [0, 1.3, -1.05]], bend: 0.5, color: "faction" },
    ...[-1, 1].map((s): Part => ({ shape: "tube", radius: 0.05, sides: 5, path: [[s * 0.55, 1.2, 0.6], [s * 0.7, 1.32, -0.05], [s * 0.55, 1.2, -0.75]], bend: 0.4, color: "faction", fine: true })),
    ...[[0.45, 0.35], [-0.45, 0.35], [0.5, -0.45], [-0.5, -0.45], [0, -0.05]].map(([x, z]): Part => bille(0.14, [x * 1.0, 1.32 - Math.abs(x) * 0.2, z], [1, 0.6, 1], "dry")),
    ...[-0.6, -0.05, 0.5].map((z): Part => ({ shape: "cone", sides: 5, radius: 0.06, height: 0.22, pos: [0, 1.62, z], rot: along([0, 1, -0.4]), color: "dry", fine: true })),
    // tête
    blob(0.28, [0, 0.6, 1.08], 1, "wood", { pivot: "tourelle" }),
    blob(0.36, [0, 0.62, 1.32], [1.05, 0.8, 0.9], "wood", { parent: "tourelle" }),
    { shape: "cone", sides: 8, radius: 0.12, height: 0.55, pos: [0, 0.78, 1.72], rot: along([0, 0.35, 1]), color: "dry", parent: "tourelle" },
    { shape: "torus", radius: 0.28, tube: 0.05, sides: 12, pos: [0, 0.68, 1.2], rot: [75, 0, 0], color: "faction", parent: "tourelle" },
    yeux(0.2, 0.72, 1.6, 0.05, "amber", { parent: "tourelle" }),
    ...sixPattes([[0.75, 0.55, 0.55], [0.85, 0.55, -0.05], [0.75, 0.55, -0.65]], [-35, 0, 35], [[10, 0.35], [-80, 0.5]], 0.12, "wood", "leaf_dark"),
  ],
};

// liane : bulbe vert à nervures d'équipe porté par six vrilles enroulées (pattes), bouton de pétales rouille
// au sommet, deux longs fouets épineux (pivot « tourelle ») tendus vers l'avant
const LIANE: [number, number][] = [[0, 0], [0.4, 0.05], [0.52, 0.28], [0.46, 0.6], [0.28, 0.85], [0.12, 0.95], [0, 0.96]];
const vine: Model = {
  parts: [
    { shape: "lathe", sides: 16, profile: LIANE, pos: [0, 0.45, 0], color: "leaf" },
    ...[0, 60, 120, 180, 240, 300].map((a, i) => meridien(LIANE, [0, 0.45, 0], a + 30, 0.012, 1, 5, 0.03, "faction", { fine: i % 2 === 1 })),
    ...[0, 72, 144, 216, 288].flatMap((a, i) => feuille(add([0, 1.35, 0], pol(0.06, a, 0)), a, 62, 0.35, 0.22, "rust", undefined, { fine: i % 2 === 1 })),
    blob(0.1, [0, 1.42, 0], 1, "amber"),
    // fouets
    blob(0.18, [0, 0.85, 0.42], [1.2, 0.8, 0.8], "leaf_dark", { pivot: "tourelle" }),
    ...[-1, 1].flatMap((s): Part[] => {
      const path: Vec3[] = [[s * 0.12, 0.88, 0.5], [s * 0.3, 1.05, 0.85], [s * 0.2, 1.0, 1.2], [s * 0.02, 0.78, 1.35], [s * 0.12, 0.62, 1.22]];
      return [
        { shape: "tube", radius: 0.045, sides: 5, path, bend: 0, color: "leaf_dark", parent: "tourelle" },
        ...[1, 2].map((i): Part => ({ shape: "cone", sides: 4, radius: 0.03, height: 0.12, pos: add(path[i], [s * 0.04, 0.05, 0]), rot: along([s * 0.6, 1, 0]), color: "dry", parent: "tourelle", fine: true })),
      ];
    }),
    // vrilles
    ...sixPattes([[0.3, 0.55, 0.22], [0.36, 0.52, -0.05], [0.3, 0.52, -0.3]], [-45, 0, 45], [[20, 0.3], [-30, 0.25], [-80, 0.25], [-140, 0.1]], 0.04, "leaf_dark", "leaf", "leaf"),
  ],
};

// planeur à membranes : corps fuselé vert sombre, tête à yeux ambrés, grandes ailes de membrane verte
// tendues sur des baguettes d'équipe (bord d'attaque et doigts), sacs de spores lumineux sous le ventre,
// queue fine à palette
function aile(): Part[] {
  // contour dans (x, z) : bord d'attaque vers l'avant, bord de fuite festonné
  const c: [number, number][] = [[0.22, 0.35], [0.9, 0.5], [1.6, 0.35], [2.25, 0.0], [1.85, -0.2], [1.6, -0.05], [1.25, -0.42], [0.95, -0.25], [0.65, -0.6], [0.4, -0.45], [0.22, -0.55]];
  const doigts: Vec3[] = [[2.25, 0.08, 0.0], [1.6, 0.08, -0.05], [0.95, 0.08, -0.25], [0.65, 0.08, -0.55]];
  return [
    { shape: "extrude", profile: c.map(([x, z]): [number, number] => [x, z]), depth: 0.03, pos: [0, 0.05, 0], rot: [90, 0, 0], color: "leaf", mirror: true },
    { shape: "tube", radius: 0.045, sides: 5, path: [[0.2, 0.1, 0.32], [0.9, 0.12, 0.48], [1.6, 0.1, 0.35], [2.25, 0.08, 0.0]], bend: 0.3, color: "faction", mirror: true },
    ...doigts.map((t): Part => ({ shape: "tube", radius: 0.025, sides: 4, path: [[0.9, 0.11, 0.42], t], color: "faction", mirror: true })),
  ];
}
// NB : le contour de l'aile est donné en (x, z) et posé à plat par rot [90, 0, 0] (y du contour -> z).
const membrane: Model = {
  parts: [
    ...aile(),
    blob(0.3, [0, 0.05, 0], [0.85, 0.65, 2.0], "leaf_dark"),
    { shape: "tube", radius: 0.06, sides: 6, path: [[0, 0.18, 0.4], [0, 0.26, -0.2], [0, 0.2, -0.6]], color: "faction" },
    blob(0.2, [0, 0.1, 0.72], [0.9, 0.8, 1.1], "leaf_dark"),
    yeux(0.1, 0.2, 0.88, 0.05),
    blob(0.06, [0, 0.05, 0.94], [1.2, 0.8, 1], "amber"),
    ...grappe([0, -0.18, 0.05], 0.9, "amber", 1),
    { shape: "tube", radius: 0.04, sides: 5, path: [[0, 0.05, -0.55], [0, 0.08, -1.05], [0, 0.12, -1.45]], bend: 0.3, color: "leaf_dark" },
    { shape: "extrude", profile: feuilleProfil(0.4, 0.4), depth: 0.03, pos: [0, 0.12, -1.4], rot: [-90, 0, 0], color: "faction" },
  ],
};

export const SOUCHE_UNIT_MODELS: Record<string, Model> = {
  queen,
  sower,
  gnawer,
  spitter,
  shell,
  vine,
  membrane,
};
