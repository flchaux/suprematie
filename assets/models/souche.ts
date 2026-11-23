// La Souche (voir docs/spec/races.md) : organes et organismes vivants, essaim extraterrestre.
//
// Style : formes rondes (sphères lissées, profils tournés, tubes courbes) dans les verts et les bruns sombres
// (leaf_dark, wood, rust), durcies de chitine noire luisante (black : plaques facettées, carapaces, pattes),
// d'os (dry : crocs, mandibules en croissant, griffes en faux, épines, côtes) et de sève lumineuse (amber :
// yeux, sacs, veines, œufs). Silhouettes agressives : corps bas tendus vers l'avant, têtes allongées, pattes
// arquées. La couleur du joueur tient les grandes plaques dorsales, crêtes et collerettes (lisible de loin).
// Ni métal ni panneaux techniques : tous les modèles de la Souche sont marqués `skin: "souche"` (voir `vivants`),
// et le générateur leur donne des matières vivantes (chitine, écorce, chair, os) pour les mêmes couleurs.
//
// Bâtiments (unités de case, centrés, sol à y = 0, sortie vers +z) : graine-mère, racine (nœud au centre de
// la case ; le jeu ajoute un `root_seg` vers chaque voisin relié, comme les murs), frondaison, racine-puits,
// bulbe, couveuse, matrice, épine (tourelle « tourelle »), floraison (corolle « radar »).
// Hors tourelles, le jeu fait tourner lentement les pivots d'un bâtiment au travail (hélice de la matrice).
//
// Unités : bêtes à pattes sur pivots « jambe… » (trépied alterné, voir faune.ts), tête ou cou sur pivot
// « tourelle » quand l'arme vise (reine, cracheur, carapace, liane). Le planeur n'a pas de pivot : le jeu
// n'anime pas les ailes.
import type { ColorName, Model, Part, Vec3 } from "./types.ts";

export const D = Math.PI / 180;
export const r3 = (v: number): number => Math.round(v * 1000) / 1000;
export const V = (x: number, y: number, z: number): Vec3 => [r3(x), r3(y), r3(z)];

// ---------- orientations (matrices 3 x 3, lignes) ----------
export type M3 = number[];
export const mul = (a: M3, b: M3): M3 => {
  const o: M3 = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]);
  return o;
};
export const Rx = (a: number): M3 => [1, 0, 0, 0, Math.cos(a * D), -Math.sin(a * D), 0, Math.sin(a * D), Math.cos(a * D)];
export const Ry = (a: number): M3 => [Math.cos(a * D), 0, Math.sin(a * D), 0, 1, 0, -Math.sin(a * D), 0, Math.cos(a * D)];
export const Rz = (a: number): M3 => [Math.cos(a * D), -Math.sin(a * D), 0, Math.sin(a * D), Math.cos(a * D), 0, 0, 0, 1];
export const app = (m: M3, v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
/** Angles d'Euler (ordre XYZ, degrés) d'une matrice de rotation, comme les lit le générateur. */
export function eul(m: M3): Vec3 {
  const m13 = Math.max(-1, Math.min(1, m[2]));
  const y = Math.asin(m13);
  const [x, z] = Math.abs(m13) < 0.9999999 ? [Math.atan2(-m[5], m[8]), Math.atan2(-m[1], m[0])] : [Math.atan2(m[7], m[4]), 0];
  return [Math.round(x / D * 10) / 10, Math.round(y / D * 10) / 10, Math.round(z / D * 10) / 10];
}
/** Orientation : roulis autour de z, puis tangage autour de x, puis lacet autour de y. */
export const ypr = (yaw: number, pitch: number, roll = 0): M3 => mul(Ry(yaw), mul(Rx(pitch), Rz(roll)));
/** Rotation qui amène l'axe +y (cônes, cylindres) sur la direction `d`. */
export function along(d: Vec3): Vec3 {
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return eul(ypr(Math.atan2(d[0], d[2]) / D, Math.acos(d[1] / l) / D));
}
export const add = (a: Vec3, b: Vec3, k = 1): Vec3 => V(a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k);
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Point sur un cercle horizontal : angle `a` en degrés (0 : vers +z, 90 : vers +x). */
export const pol = (r: number, a: number, y: number): Vec3 => V(r * Math.sin(a * D), y, r * Math.cos(a * D));

/**
 * Marque des modèles comme vivants (`skin: "souche"`, types.ts) : le générateur remplace pour eux les matières
 * des machines (plaques boulonnées, grilles) par celles de la Souche. Tous les modèles de la Souche y passent.
 */
export const vivants = (models: Record<string, Model>): Record<string, Model> =>
  Object.fromEntries(Object.entries(models).map(([key, m]): [string, Model] => [key, { ...m, skin: "souche" }]));

// ---------- pièces organiques ----------
/** Boule lisse (sphère fine lissée), étirée par `sc`. */
export const blob = (r: number, pos: Vec3, sc: number | Vec3, color: ColorName, extra: Partial<Part> = {}): Part => ({ shape: "sphere", radius: r, detail: 1, smooth: true, pos, scale: sc, color, ...extra });
/** Petite bille à facettes (20 triangles) : yeux, œufs, spores, bossettes. */
export const bille = (r: number, pos: Vec3, sc: number | Vec3, color: ColorName, extra: Partial<Part> = {}): Part => ({ shape: "sphere", radius: r, detail: 0, pos, scale: sc, color, ...extra });

/** Contour de feuille (pointe en haut), longueur `L` sur y, largeur `W`. */
export function feuilleProfil(L: number, W: number, n = 6, arr = 0.15): [number, number][] {
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
export function feuille(base: Vec3, yaw: number, elev: number, L: number, W: number, color: ColorName, rib?: ColorName, extra: Partial<Part> = {}, tilt?: M3, org: Vec3 = [0, 0, 0]): Part[] {
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
export function meridien(profile: [number, number][], pos: Vec3, a: number, off: number, from: number, to: number, r: number, color: ColorName, extra: Partial<Part> = {}): Part {
  const path = profile.slice(from, to + 1).map(([rr, y]) => add(pos, pol(rr + off, a, y)));
  return { shape: "tube", radius: r, sides: 4, path, bend: 0, color, ...extra };
}

/** Racine qui part de `from` vers l'extérieur selon l'angle `a`, rampe au sol et s'y enfonce (pointe effilée). */
export function racine(from: Vec3, a: number, len: number, r: number, color: ColorName = "wood", sink = 0.12): Part[] {
  const d0 = Math.hypot(from[0], from[2]);
  const mid = pol(d0 + len * 0.55, a + 4, Math.max(r * 0.55, from[1] * 0.3));
  const tip = pol(d0 + len, a + 9, -r * 0.6 - sink * 0.2);
  return [{ shape: "tube", radius: r, sides: 5, path: [from, mid, tip], bend: len * 0.3, color }];
}

/** Tertre de terre ou d'écorce (profil tourné bas, bord adouci), rayon `R`, hauteur `h`. */
export const tertre = (R: number, h: number, color: ColorName, y = 0): Part => ({
  shape: "lathe", sides: 16, pos: [0, y, 0], color,
  profile: [[0, 0], [R, 0], [R * 0.92, h * 0.35], [R * 0.72, h * 0.75], [R * 0.4, h * 0.97], [0, h]].map(([a, b]): [number, number] => [r3(a), r3(b)]),
});

/** Grappe de petites boules lumineuses (sève, œufs, spores). */
export const grappe = (c: Vec3, s: number, color: ColorName, stretch = 1.2): Part[] => [
  bille(0.16 * s, c, [1, stretch, 1], color),
  bille(0.12 * s, add(c, [0.19 * s, -0.04 * s, 0.07 * s]), [1, stretch, 1], color),
  bille(0.11 * s, add(c, [-0.1 * s, -0.05 * s, 0.17 * s]), [1, stretch, 1], color),
];

// ---------- pattes (unités) ----------
/** Points d'une chaîne de segments depuis `from` : lacet `yaw` (négatif : vers l'avant), [pente, longueur]. */
export function chaine(from: Vec3, yaw: number, segs: [number, number][]): Vec3[] {
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
export function patte(name: string, side: 1 | -1, hip: Vec3, yaw: number, segs: [number, number][], r: number, color: ColorName, joint: ColorName, claw: ColorName = "dry", spur?: ColorName): Part[] {
  // dernier segment de longueur 0 : allongé pour que la griffe touche le sol (y = 0)
  const last0 = segs[segs.length - 1];
  if (last0[1] === 0) {
    const knee = chaine(hip, yaw, segs.slice(0, -1));
    const s = Math.sin(last0[0] * D);
    segs = [...segs.slice(0, -1), [last0[0], Math.max(0.05, -knee[knee.length - 1][1] / s - r * 2.6)]];
  }
  const pts = chaine(hip, yaw, segs).map((p): Vec3 => [p[0] * side, p[1], p[2]]);
  const last = pts[pts.length - 1];
  const dir = sub(last, pts[pts.length - 2]);
  const l = Math.hypot(...dir);
  const d0 = sub(pts[1], pts[0]);
  const l0 = Math.hypot(...d0);
  const out: Part[] = [
    { shape: "cylinder", sides: 5, radius: r * 1.6, radiusTop: r * 1.2, height: r * 3, pos: add(pts[0], d0, (r * 0.8) / l0), rot: along(d0), color: joint, pivot: name },
    { shape: "tube", radius: r, sides: 5, path: pts, bend: 0, color, parent: name },
    { shape: "cone", sides: 5, radius: r * 0.9, height: r * 3, pos: add(last, dir, (r * 1.2) / l), rot: along(dir), color: claw, parent: name },
  ];
  // ergot d'os au genou, dans le prolongement de la cuisse
  if (spur) out.push({ shape: "cone", sides: 4, radius: r * 0.8, height: r * 4, pos: add(pts[1], d0, (r * 2) / l0), rot: along(d0), color: spur, parent: name, fine: true });
  return out;
}

/** Six pattes en trépied alterné (avant droite, milieu gauche, arrière droite ensemble). */
export function sixPattes(hips: [Vec3, Vec3, Vec3], yaws: [number, number, number], segs: [number, number][], r: number, color: ColorName, joint: ColorName, claw?: ColorName, spur?: ColorName): Part[] {
  const names = [["jambe_t_d", "jambe_t_g"], ["jambe_ar_m_d", "jambe_ar_m_g"], ["jambe_q_d", "jambe_q_g"]];
  return names.flatMap(([d, g], i) => [...patte(d, 1, hips[i], yaws[i], segs, r, color, joint, claw, spur), ...patte(g, -1, hips[i], yaws[i], segs, r, color, joint, claw, spur)]);
}

/** Quatre pattes au trot (diagonales ensemble). */
export function quatrePattes(front: Vec3, back: Vec3, yf: number, yb: number, segs: [number, number][], r: number, color: ColorName, joint: ColorName, claw?: ColorName, spur?: ColorName): Part[] {
  return [
    ...patte("jambe_av_d", 1, front, yf, segs, r, color, joint, claw, spur),
    ...patte("jambe_av_g", -1, front, yf, segs, r, color, joint, claw, spur),
    ...patte("jambe_ar_d", 1, back, yb, segs, r, color, joint, claw, spur),
    ...patte("jambe_ar_g", -1, back, yb, segs, r, color, joint, claw, spur),
  ];
}

/** Yeux lumineux (paire, symétriques en x). */
export const yeux = (x: number, y: number, z: number, r: number, color: ColorName = "amber", extra: Partial<Part> = {}): Part => bille(r, V(x, y, z), 1, color, { mirror: true, ...extra });

// ---------- chitine, os, crocs ----------
export const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Repère d'une pièce : x local selon `f`, y local vers `c` (rendu perpendiculaire), z local normal aux deux. */
export function frame(f: Vec3, c: Vec3): M3 {
  const X = unit(f);
  const Z = unit(cross(X, c));
  const Y = cross(Z, X);
  return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
}

/**
 * Corne, griffe ou épine effilée : troncs de cône le long de `pts` (rayon r0 au départ, r1 au dernier coude),
 * nœuds aux coudes, pointe en cône (couleur `tip`, sinon `color`).
 */
export function effile(pts: Vec3[], r0: number, r1: number, color: ColorName, extra: Partial<Part> = {}, tip?: ColorName, sides = 6): Part[] {
  const n = pts.length - 1;
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const d = sub(pts[i + 1], a);
    const l = Math.hypot(...d);
    const ra = n > 1 ? r0 + ((r1 - r0) * i) / (n - 1) : r0;
    if (i === n - 1) out.push({ shape: "cone", sides, radius: ra, height: l + ra * 0.6, pos: add(a, d, 0.5 - (ra * 0.3) / l), rot: along(d), color: tip ?? color, ...extra });
    else {
      const rb = r0 + ((r1 - r0) * (i + 1)) / (n - 1);
      out.push({ shape: "cylinder", sides, radius: ra, radiusTop: rb, height: l + rb * 0.5, pos: add(a, d, 0.5), rot: along(d), color, ...extra });
      if (i > 0) out.push(bille(ra * 1.06, a, 1, color, extra));
    }
  }
  return out;
}

/** `n` points sur la courbe lisse (Catmull-Rom) qui passe par les points de contrôle `c`. */
export function courbe(c: Vec3[], n: number): Vec3[] {
  const out: Vec3[] = [];
  const m = c.length - 1;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * m;
    const i = Math.min(m - 1, Math.floor(t));
    const u = t - i;
    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(m, i + 2)];
    const f = (j: number): number => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * u * u * u);
    out.push(V(f(0), f(1), f(2)));
  }
  return out;
}

/**
 * Corne, côte ou racine courbe : la courbe lisse par `ctrl` en `k` tronçons de tuyau de plus en plus fins
 * (rayon r0 au départ, ressauts annelés entre tronçons), terminée en pointe (couleur `tip`, sinon `color`).
 */
export function corne(ctrl: Vec3[], r0: number, k: number, color: ColorName, extra: Partial<Part> = {}, tip?: ColorName, taper = 0.6): Part[] {
  const s = courbe(ctrl, 3 * k + 3);
  const out: Part[] = [];
  for (let i = 0; i < k; i++) out.push({ shape: "tube", radius: r3(r0 * (1 - (taper * i) / k)), sides: 6, path: s.slice(3 * i, 3 * i + 4), bend: 0, color, ...extra });
  const a = s[3 * k], d = sub(s[3 * k + 2], a);
  const rt = r0 * (1 - (taper * (k - 1)) / k) * 0.9;
  out.push({ shape: "cone", sides: 6, radius: r3(rt), height: r3(Math.hypot(...d) + rt), pos: add(a, d, 0.5), rot: along(d), color: tip ?? color, ...extra });
  return out;
}

/** Contour d'une lame en croissant (faux, mandibule, croc) : de la base (x = 0) à la pointe (x = L), courbée vers +y. */
export function croissant(L: number, W: number, curve: number, n = 4): [number, number][] {
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = curve * L * t * t;
    const w = (W / 2) * Math.pow(1 - t, 0.8) * (0.7 + 0.5 * Math.sin(Math.PI * t));
    top.push([r3(L * t), r3(y + w * 0.6)]);
    bot.push([r3(L * t), r3(y - w * 1.4)]);
  }
  return [...bot, ...top.slice(0, n).reverse()];
}

/** Lame en croissant posée en `base`, dirigée selon `f`, courbée vers `c`, d'épaisseur `thick`. */
export function lame(base: Vec3, f: Vec3, c: Vec3, L: number, W: number, curve: number, thick: number, color: ColorName, extra: Partial<Part> = {}): Part {
  return { shape: "extrude", profile: croissant(L, W, curve), depth: thick, pos: V(...base), rot: eul(frame(f, c)), color, ...extra };
}

/** Plaque de chitine facettée (bille aplatie) posée en `pos`, normale `nrm`, allongée selon `f` : `sc` = [largeur, épaisseur, longueur]. */
export function plaque(r: number, pos: Vec3, nrm: Vec3, f: Vec3, sc: Vec3, color: ColorName, extra: Partial<Part> = {}): Part {
  // repère : x local = largeur, y local = normale, z local = longueur (selon f)
  const Y = unit(nrm);
  const X = unit(cross(Y, f));
  const Z = cross(X, Y);
  return bille(r, V(...pos), sc, color, { rot: eul([X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]), ...extra });
}

// =====================================================================================================
// Bâtiments
// =====================================================================================================

// graine-mère : cœur monstrueux à demi enterré dans un monticule de chair, lobes charnus au sommet ; gaine
// de six plaques de chitine bombées qui épousent le cœur (une sur deux à la couleur d'équipe), griffes d'os
// recourbées qui l'enserrent ; veines de sève lumineuses entre les plaques ; trois artères béantes et
// lumineuses au sommet, couronne d'épines ; racines griffues de chitine qui plongent dans le sol
const COEUR: [number, number][] = [[0, 0], [0.55, 0.02], [0.82, 0.22], [0.93, 0.55], [0.92, 0.9], [0.8, 1.2], [0.6, 1.44], [0.36, 1.6], [0.15, 1.67], [0, 1.68]];
const CO0: Vec3 = [0, 0.22, 0];
const GAINE: [number, number][] = [[0.6, 0.0], [0.9, 0.22], [1.02, 0.55], [1.01, 0.9], [0.88, 1.2], [0.74, 1.36]];
const seedHeart: Model = {
  parts: [
    tertre(1.32, 0.2, "wood"),
    tertre(1.08, 0.42, "leaf_dark"),
    // racines griffues
    ...[12, 72, 132, 192, 252, 312].flatMap((a) => corne([pol(0.8, a, 0.42), pol(1.14, a + 5, 0.66), pol(1.42, a + 10, 0.34), pol(1.55, a + 14, -0.12)], 0.14, 2, "black", {}, "dry", 0.4)),
    // le cœur et ses lobes
    { shape: "lathe", sides: 18, profile: COEUR, pos: CO0, color: "rust" },
    blob(0.44, [0.38, 1.6, -0.22], [1, 0.85, 1], "rust"),
    blob(0.38, [-0.36, 1.56, 0.22], [1, 0.9, 1], "rust"),
    // gaine de plaques bombées et griffes d'os
    ...[0, 60, 120, 180, 240, 300].flatMap((a, i): Part[] => [
      { shape: "lathe", sides: 6, profile: GAINE, arc: 44, pos: CO0, rot: [0, a - 22, 0], color: i % 2 ? "black" : "faction" },
      ...corne([pol(0.86, a, 1.36), pol(0.9, a + 3, 1.8), pol(0.62, a + 6, 2.08), pol(0.32, a + 8, 1.94)], 0.09, 2, "dry", { fine: i % 2 === 1 }, undefined, 0.35),
    ]),
    // veines de sève entre les plaques
    ...[30, 90, 150, 210, 270, 330].map((a) => meridien(COEUR, CO0, a, 0.0, 1, 8, 0.05, "acid", { fine: true })),
    ...[30, 150, 270].map((a): Part => bille(0.13, add(CO0, pol(0.93, a, 0.6)), [0.5, 1.6, 0.5], "acid", { rot: [0, a, 0], fine: true })),
    // artères béantes au sommet
    ...[40, 160, 280].flatMap((a): Part[] => {
      const p0 = pol(0.16, a, 1.8), p1 = pol(0.3, a + 10, 2.16), p2 = pol(0.56, a + 18, 2.36);
      const d = sub(p2, p1);
      return [
        { shape: "tube", radius: 0.13, sides: 8, path: [p0, p1, p2], bend: 0.18, color: "rust" },
        { shape: "torus", radius: 0.13, tube: 0.05, sides: 10, pos: p2, rot: along(d), color: "black", fine: true },
        bille(0.11, add(p2, d, 0.04 / Math.hypot(...d)), [1, 0.6, 1], "acid", { rot: along(d) }),
      ];
    }),
    // couronne d'épines
    ...[100, 220, 340].map((a): Part => ({ shape: "cone", sides: 5, radius: 0.07, height: 0.42, pos: pol(0.5, a, 1.92), rot: along(add(pol(0.6, a, 0), [0, 1, 0])), color: "dry", fine: true })),
    // poches de sève à la base
    ...[45, 165, 285].flatMap((a) => grappe(pol(1.02, a, 0.3), 1.1, "acid").map((p): Part => ({ ...p, fine: true }))),
  ],
};

// racine : nœud racinaire bas au centre de la case (bulbe d'écorce noueux, bague d'équipe, plaques de chitine,
// œil de sève, épines d'os, radicelles griffues vers les coins) ; le jeu y raccorde un `root_seg` par voisin
const NOEUD: [number, number][] = [[0, 0], [0.2, 0], [0.215, 0.035], [0.18, 0.09], [0.11, 0.14], [0.05, 0.165], [0, 0.17]];
const root: Model = {
  parts: [
    { shape: "lathe", sides: 8, profile: NOEUD, color: "wood" },
    // bulbe du nœud, aussi épais que les tronçons qui s'y raccordent
    blob(0.24, [0, 0.08, 0], [1, 0.55, 1], "wood"),
    { shape: "torus", radius: 0.175, tube: 0.03, sides: 8, pos: [0, 0.07, 0], color: "faction" },
    ...[45, 165, 285].map((a): Part => plaque(0.09, pol(0.11, a, 0.13), add(pol(0.7, a, 0), [0, 1, 0]), [0, 0, 1], [1, 0.4, 1.2], "black")),
    bille(0.055, [0, 0.165, 0], [1, 0.55, 1], "acid"),
    ...[105, 225, 345].map((a): Part => ({ shape: "cone", sides: 4, radius: 0.025, height: 0.12, pos: pol(0.1, a, 0.18), rot: along(add(pol(0.5, a, 0), [0, 1, 0])), color: "dry", fine: true })),
    ...[45, 135, 225, 315].map((a): Part => {
      const p0 = pol(0.15, a, 0.05), p1 = pol(0.34, a + 10, -0.03);
      const d = sub(p1, p0);
      return { shape: "cone", sides: 5, radius: 0.035, height: r3(Math.hypot(...d)), pos: add(p0, d, 0.5), rot: along(d), color: "wood" };
    }),
  ],
};

// root_seg : grosse racine noueuse du centre de la case (x = 0) au bord +x (x = 0,5), à demi enterrée, tournée
// par le jeu vers chaque voisin relié : tronc d'écorce et brin torsadé, nœud, veine de sève lumineuse sur le
// dessus ; elle arrive au bord dans l'axe (z = 0, un peu au-delà du bord) pour se raccorder au segment du voisin
const SEG: Vec3[] = [[0, 0.07, 0], [0.17, 0.085, 0.04], [0.34, 0.075, -0.035], [0.515, 0.07, 0]];
const rootSeg: Model = {
  parts: [
    { shape: "tube", radius: 0.16, sides: 6, path: SEG, bend: 0, color: "wood" },
    { shape: "tube", radius: 0.055, sides: 4, path: [[0.04, 0.1, 0.08], [0.2, 0.19, 0.12], [0.36, 0.06, 0.13], [0.515, 0.1, 0.07]], bend: 0, color: "rust" },
    { shape: "tube", radius: 0.05, sides: 4, path: [[0.04, 0.1, -0.08], [0.18, 0.04, -0.13], [0.34, 0.17, -0.11], [0.515, 0.1, -0.07]], bend: 0, color: "black" },
    bille(0.15, [0.25, 0.09, 0.0], [1.15, 0.75, 1.05], "wood"),
    { shape: "tube", radius: 0.035, sides: 3, path: SEG.map((p): Vec3 => [p[0], r3(p[1] + 0.15), p[2]]), bend: 0, color: "acid" },
    { shape: "cone", sides: 4, radius: 0.04, height: 0.17, pos: [0.15, 0.2, 0.09], rot: along([0.2, 1, 0.6]), color: "dry", fine: true },
    { shape: "cone", sides: 4, radius: 0.04, height: 0.15, pos: [0.38, 0.2, -0.07], rot: along([-0.2, 1, -0.6]), color: "dry", fine: true },
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
    ...[45, 135, 225, 315].map((a) => meridien(TIGE, [0, 0, 0], a, 0.01, 1, 7, 0.022, "acid")),
    blob(0.2, [0, 1.72, 0], [1, 0.6, 1], "acid"),
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
    ...[22, 112, 202, 292].map((a) => meridien(SAC, [0, 0, 0], a, 0.005, 2, 6, 0.03, "acid")),
    { shape: "torus", radius: 0.21, tube: 0.06, sides: 14, pos: [0, 1.4, 0], color: "faction" },
    ...[0, 120, 240].flatMap((a) => feuille(pol(0.1, a, 1.45), a + 40, 50, 0.38, 0.2, "leaf", "leaf_dark")),
    ...[30, 90, 150, 210, 270, 330].flatMap((a) => feuille(pol(0.66, a, 0.14), a, 66, 0.55, 0.42, "leaf_dark", "leaf")),
    // bulbes satellites
    blob(0.24, pol(0.78, 125, 0.22), [1, 1.2, 1], "acid"),
    { shape: "torus", radius: 0.1, tube: 0.035, sides: 10, pos: pol(0.78, 125, 0.48), color: "faction" },
    blob(0.18, pol(0.8, 235, 0.17), [1, 1.2, 1], "acid"),
    { shape: "torus", radius: 0.07, tube: 0.03, sides: 10, pos: pol(0.8, 235, 0.36), color: "faction" },
  ],
};

// couveuse : nid d'œufs dans une cage de grandes côtes d'os recourbées vers l'intérieur, plantées dans des
// nœuds de chitine sur un bourrelet d'équipe ; deux mâchoires d'os encadrent l'entrée (+z) ; au fond, la
// chambre de ponte (sac de chair cuirassé de chitine, veines lumineuses) penche son oviducte au-dessus des
// œufs ; œufs cuirassés à ouverture en quatre lèvres et cœur lumineux, quelques œufs tout lumineux
const OEUF: [number, number][] = [[0, 0], [0.2, 0.04], [0.27, 0.24], [0.21, 0.46], [0.09, 0.56]];
export function oeuf(p: Vec3, s: number, color: ColorName): Part[] {
  const top = add(p, [0, 0.55 * s, 0]);
  return [
    { shape: "lathe", sides: 10, profile: OEUF.map(([r, y]): [number, number] => [r3(r * s), r3(y * s)]), pos: p, color },
    bille(0.1 * s, top, [1, 0.45, 1], "acid"),
    ...[0, 90, 180, 270].map((a): Part => bille(0.07 * s, add(top, pol(0.085 * s, a + 45, 0.01)), [0.8, 1.1, 0.8], "rust", { fine: true })),
    meridien(OEUF.map(([r, y]): [number, number] => [r * s, y * s]), p, 20, 0.004, 1, 4, 0.02 * s, "acid", { fine: true }),
  ];
}
const PONTE: [number, number][] = [[0, 0], [0.55, 0], [0.66, 0.25], [0.62, 0.55], [0.48, 0.82], [0.26, 0.98], [0, 1.02]];
const PO0: Vec3 = [0, 0.24, -0.55];
const brood: Model = {
  parts: [
    tertre(1.36, 0.2, "wood"),
    tertre(1.14, 0.3, "leaf_dark"),
    { shape: "torus", radius: 1.1, tube: 0.09, sides: 20, pos: [0, 0.24, 0], color: "faction" },
    // cage de côtes d'os (ouverte vers l'avant)
    ...[52, 104, 156, 204, 256, 308].flatMap((a): Part[] => [
      bille(0.18, pol(1.12, a, 0.3), [1, 0.85, 1], "black", { fine: true }),
      ...corne([pol(1.12, a, 0.24), pol(1.34, a, 0.85), pol(1.08, a, 1.45), pol(0.7, a, 1.66), pol(0.42, a, 1.5)], 0.12, 2, "dry", {}, undefined, 0.45),
    ]),
    // mâchoires d'entrée
    lame(pol(1.08, 26, 0.3), [0.12, 1, 0.3], [-1, 0, 0.25], 1.15, 0.34, 0.4, 0.09, "dry", { mirror: true }),
    bille(0.2, pol(1.1, 26, 0.32), [1, 0.85, 1], "black", { mirror: true }),
    // chambre de ponte
    { shape: "lathe", sides: 16, profile: PONTE, pos: PO0, color: "rust" },
    ...[150, 210, 180].map((a, i): Part => plaque(0.42, add(PO0, pol(0.62, a, 0.55)), pol(1, a, 0.25), [0, 1, 0], [0.75, 0.25, 1.0], i === 2 ? "faction" : "black")),
    ...[90, 270, 120, 240].map((a, i): Part => meridien(PONTE, PO0, a, 0.005, 1, 5, 0.04, "acid", { fine: i > 1 })),
    { shape: "tube", radius: 0.1, sides: 8, path: [add(PO0, [0, 0.95, 0]), add(PO0, [0, 1.25, 0.35]), add(PO0, [0, 1.12, 0.78]), add(PO0, [0, 0.85, 0.95])], bend: 0.22, color: "rust" },
    ...[0.3, 0.55].map((t): Part => ({ shape: "torus", radius: 0.11, tube: 0.035, sides: 8, pos: add(PO0, [0, 1.2 - t * 0.2, 0.25 + t * 0.6]), rot: [60 + t * 60, 0, 0], color: "black", fine: true })),
    bille(0.1, add(PO0, [0, 0.78, 0.98]), [1, 1.3, 1], "acid"),
    // œufs
    ...oeuf([0, 0.25, 0.25], 1.25, "leaf_dark"),
    ...oeuf(pol(0.62, 55, 0.24), 1.0, "wood"),
    ...oeuf(pol(0.62, -55, 0.24), 1.05, "leaf_dark"),
    ...oeuf(pol(0.86, 112, 0.22), 0.85, "leaf_dark"),
    ...oeuf(pol(0.86, -112, 0.22), 0.9, "wood"),
    bille(0.17, pol(0.66, 8, 0.4), [1, 1.35, 1], "acid"),
    bille(0.13, pol(0.45, -28, 0.36), [1, 1.35, 1], "acid"),
    bille(0.12, pol(0.78, 150, 0.36), [1, 1.35, 1], "acid"),
  ],
};

// matrice : monticule d'écorce, double hélice organique (brins vert et brun, barreaux lumineux) qui tourne
// au travail, graine lumineuse au sommet tenue par trois feuilles, bagues d'équipe en pied et en tête
export function brin(phase: number, n: number, color: ColorName): Part {
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
    blob(0.17, [0.4, 0.82, -0.24], [0.8, 1, 1.2], "acid", { parent: "tourelle", mirror: true }),
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
    blob(0.14, add(CO, app(COROLLE, [0, 0.14, 0])), [1, 0.55, 1], "acid", { parent: "radar", rot: eul(COROLLE) }),
    ...[0, 72, 144, 216, 288].flatMap((a): Part[] => {
      const tip = add(CO, app(COROLLE, pol(0.1, a, 0.42)));
      return [
        { shape: "tube", radius: 0.012, sides: 4, path: [add(CO, app(COROLLE, [0, 0.12, 0])), tip], color: "dry", parent: "radar", fine: true },
        blob(0.035, tip, 1, "glow", { parent: "radar", fine: true }),
      ];
    }),
  ],
};

export const SOUCHE_BUILDING_MODELS: Record<string, Model> = vivants({
  seed_heart: seedHeart,
  root,
  root_seg: rootSeg,
  leaves,
  taproot,
  bulb,
  brood,
  matrix,
  thorn,
  bloom,
});

// =====================================================================================================
// Unités
// =====================================================================================================

// reine : reine-mère de l'essaim, six longues pattes arquées de chitine à ergots d'os ; thorax de chitine noire
// à tubes dorsaux ; énorme abdomen pondeur cerclé d'anneaux de chitine, plaques dorsales d'équipe et épines
// d'os, œufs lumineux sur les flancs, oviscapte ; deux bras en faux d'os levés devant ; tête allongée (pivot
// « tourelle ») coiffée d'une haute crête en éventail d'équipe nervurée et hérissée d'os, yeux ambrés,
// mandibules en croissant, gueule lumineuse
const AB: Vec3 = [0, 0.98, -1.5];
const AB_R: Vec3 = [0.78, 0.61, 0.94];
/** Demi-largeur relative de l'abdomen de la reine à l'abscisse z. */
const abK = (z: number): number => Math.sqrt(Math.max(0.04, 1 - ((z - AB[2]) / AB_R[2]) ** 2));
const CRETE: [number, number][] = [[0, 0.3], [0.18, 0.2], [0.34, -0.12], [0.6, -0.42], [0.74, -0.86], [0.5, -0.76], [0.4, -1.04], [0.2, -0.88], [0, -1.16]];
const CRETE_M = Rx(150);
const CRETE_P: Vec3 = [0, 1.4, 0.8];
const crete = (x: number, y: number): Vec3 => add(CRETE_P, app(CRETE_M, [x * 0.68, y * 0.82, 0]));
const queen: Model = {
  parts: [
    // abdomen pondeur
    blob(0.82, AB, [0.95, 0.74, 1.15], "leaf_dark"),
    ...[-1.08, -1.72].map((z, i): Part => ({ shape: "torus", radius: r3(AB_R[0] * abK(z) + 0.02), tube: 0.08, sides: 12, pos: [0, AB[1], z], rot: [90, 0, 0], scale: [1, 1, 0.78], color: "black", fine: i > 0 })),
    ...[-1.38, -1.98, -0.8].map((z, i): Part => bille(0.13, V(AB_R[0] * abK(z) * 0.93, AB[1] - 0.04, z), [0.55, 0.9, 1.35], "acid", { mirror: true, fine: i > 0 })),
    ...[-0.86, -1.4, -2.02].map((z, i): Part => {
      const k = abK(z);
      const slope = -((z - AB[2]) / AB_R[2] ** 2) * AB_R[1] / k;
      return plaque(0.42, V(0, AB[1] + AB_R[1] * k + 0.01, z), [0, 1, -slope], [0, slope, 1], [1.15 * Math.max(0.6, k), 0.24, 0.72], "faction", { fine: i > 1 });
    }),
    ...[-1.1, -1.7].map((z): Part => ({ shape: "cone", sides: 5, radius: 0.07, height: 0.34, pos: V(0, AB[1] + AB_R[1] * abK(z) + 0.14, z), rot: along([0, 1, -0.7]), color: "dry", fine: true })),
    ...effile([[0, 0.92, -2.3], [0, 0.72, -2.52], [0, 0.42, -2.5]], 0.17, 0.11, "black", {}, "dry", 5),
    // taille et thorax de chitine, tubes dorsaux
    bille(0.25, [0, 1.0, -0.52], [1, 0.9, 1.25], "black", { fine: true }),
    blob(0.5, [0, 1.05, 0.02], [1.0, 0.82, 1.15], "black"),
    ...effile([[0.2, 1.36, -0.1], [0.32, 1.72, -0.38], [0.4, 1.84, -0.66]], 0.08, 0.05, "black", { mirror: true, fine: true }, "dry"),
    ...effile([[0.1, 1.3, -0.32], [0.18, 1.55, -0.55], [0.22, 1.62, -0.82]], 0.06, 0.04, "black", { mirror: true, fine: true }, "dry"),
    // bras en faux
    { shape: "tube", radius: 0.065, sides: 6, path: [[0.3, 1.08, 0.32], [0.55, 1.5, 0.52], [0.5, 1.6, 0.72]], bend: 0, color: "black", mirror: true, fine: true },
    bille(0.09, [0.52, 1.56, 0.66], 1, "black", { mirror: true, fine: true }),
    lame([0.5, 1.58, 0.7], [0.08, -0.5, 1], [0, -1, -0.45], 0.9, 0.22, 0.42, 0.05, "dry", { mirror: true }),
    // tête et crête
    bille(0.28, [0, 1.15, 0.5], [1, 0.9, 1.1], "black", { pivot: "tourelle" }),
    blob(0.3, [0, 1.25, 0.95], [0.82, 0.68, 1.55], "black", { parent: "tourelle" }),
    { shape: "extrude", profile: [...CRETE, ...CRETE.slice(1, -1).reverse().map(([x, y]): [number, number] => [-x, y])].map(([x, y]): [number, number] => [r3(x * 0.68), r3(y * 0.82)]), depth: 0.06, pos: CRETE_P, rot: eul(CRETE_M), color: "faction", parent: "tourelle" },
    ...[[0, -1.12], [0.55, -0.7], [-0.55, -0.7]].map(([x, y]): Part => ({ shape: "tube", radius: 0.035, sides: 4, path: [crete(0, 0.15), crete(x, y)].map((p) => add(p, app(CRETE_M, [0, 0, -0.045]))), bend: 0, color: "black", parent: "tourelle", fine: true })),
    ...[[0.74, -0.86], [0.4, -1.04], [0, -1.16], [-0.4, -1.04], [-0.74, -0.86]].map(([x, y], i): Part => {
      const p = crete(x, y);
      const d = sub(p, crete(0, -0.3));
      return { shape: "cone", sides: 5, radius: 0.055, height: 0.32, pos: add(p, d, 0.13 / Math.hypot(...d)), rot: along(d), color: "dry", parent: "tourelle", fine: i !== 2 };
    }),
    yeux(0.13, 1.33, 1.24, 0.05, "amber", { parent: "tourelle" }),
    yeux(0.2, 1.27, 1.12, 0.04, "amber", { parent: "tourelle", fine: true }),
    bille(0.1, [0, 1.1, 1.4], [1.4, 0.7, 0.8], "acid", { parent: "tourelle", fine: true }),
    lame([0.14, 1.1, 1.2], [0.12, -0.12, 1], [-1, 0, 0], 0.5, 0.15, 0.4, 0.05, "dry", { parent: "tourelle", mirror: true }),
    // pattes
    ...sixPattes([[0.42, 1.0, 0.36], [0.5, 0.98, 0.0], [0.44, 0.98, -0.36]], [-42, 2, 42], [[48, 0.74], [-64, 1.0], [-88, 0]], 0.07, "black", "leaf_dark", "dry", "dry"),
  ],
};

// semeur : ouvrier bas et voûté, abdomen vert sombre sous une plaque de chitine et une plaque d'équipe ;
// sur le dos, une cosse de graines en cuir veinée de sève lumineuse, tenue par des crochets d'os ; tête
// allongée à mandibules et yeux ambrés, cornes d'os couchées ; six pattes fines et arquées de chitine
const COSSE: [number, number][] = [[0, 0], [0.17, 0.04], [0.25, 0.18], [0.24, 0.36], [0.15, 0.5], [0.05, 0.56]];
const CS0: Vec3 = [0, 0.74, -0.3];
const sower: Model = {
  parts: [
    blob(0.38, [0, 0.5, -0.25], [1, 0.72, 1.3], "leaf_dark"),
    plaque(0.38, [0, 0.72, -0.12], [0, 1, 0.15], [0, 0, 1], [1.05, 0.28, 1.05], "black"),
    plaque(0.26, [0, 0.74, -0.62], [0, 1, -0.6], [0, 0.6, 1], [1.05, 0.3, 0.9], "faction"),
    bille(0.25, [0, 0.55, 0.2], [1, 0.85, 1], "black"),
    blob(0.2, [0, 0.56, 0.5], [0.85, 0.72, 1.35], "leaf_dark"),
    yeux(0.1, 0.64, 0.66, 0.04),
    lame([0.08, 0.5, 0.7], [0.12, -0.1, 1], [-1, 0, 0], 0.26, 0.09, 0.45, 0.035, "dry", { mirror: true }),
    ...effile([[0.09, 0.68, 0.52], [0.17, 0.84, 0.38], [0.22, 0.9, 0.16]], 0.03, 0.022, "dry", { mirror: true, fine: true }),
    // cosse de graines et crochets
    { shape: "lathe", sides: 10, profile: COSSE, pos: CS0, color: "wood" },
    ...[0, 120, 240].map((a, i) => meridien(COSSE, CS0, a + 30, 0.005, 1, 5, 0.03, "acid", { fine: i > 0 })),
    bille(0.07, add(CS0, [0, 0.57, 0]), [1, 1.3, 1], "acid"),
    { shape: "torus", radius: 0.255, tube: 0.035, sides: 12, pos: add(CS0, [0, 0.27, 0]), color: "faction" },
    ...effile([[0.24, 0.66, -0.12], [0.3, 0.92, -0.2], [0.18, 1.14, -0.28]], 0.045, 0.035, "dry", { mirror: true }),
    ...sixPattes([[0.2, 0.5, 0.22], [0.25, 0.48, -0.05], [0.22, 0.48, -0.32]], [-42, 0, 42], [[42, 0.36], [-70, 0]], 0.04, "black", "leaf_dark", "dry"),
  ],
};

// rongeur : chasseur bas et tendu vers l'avant, corps de chair rouille sous des plaques dorsales d'équipe,
// rangée de grandes épines d'os couchées, queue à dard ; tête de chitine allongée, grandes mandibules en
// croissant, quatre yeux ambrés, gueule lumineuse ; six longues pattes arquées
const GN: Vec3 = [0, 0.5, -0.35];
const gnTop = (z: number): number => GN[1] + 0.2 * Math.sqrt(Math.max(0.05, 1 - ((z - GN[2]) / 0.5) ** 2));
const gnawer: Model = {
  parts: [
    blob(0.33, GN, [0.85, 0.62, 1.5], "rust"),
    bille(0.29, [0, 0.55, 0.15], [1, 0.8, 1], "black"),
    ...[0.12, -0.22, -0.55].map((z, i): Part => plaque(0.22 - i * 0.02, V(0, (z > 0 ? 0.74 : gnTop(z)) + 0.01, z), [0, 1, -0.25], [0, 0, 1], [1.1, 0.3, 0.9], "faction")),
    ...[-0.05, -0.38, -0.7].map((z, i): Part => ({ shape: "cone", sides: 5, radius: 0.055, height: 0.36 - i * 0.06, pos: V(0, (z > -0.1 ? 0.78 : gnTop(z)) + 0.1, z - 0.08), rot: along([0, 1, -0.9]), color: "dry" })),
    ...effile([[0, 0.48, -0.72], [0, 0.6, -0.9], [0, 0.66, -1.08]], 0.08, 0.05, "rust", {}, "dry"),
    // tête
    blob(0.24, [0, 0.52, 0.55], [0.8, 0.6, 1.5], "black"),
    yeux(0.11, 0.6, 0.74, 0.04),
    yeux(0.15, 0.56, 0.64, 0.032, "amber", { fine: true }),
    bille(0.08, [0, 0.45, 0.88], [1.4, 0.6, 0.8], "acid"),
    lame([0.12, 0.46, 0.74], [0.3, -0.05, 1], [-1, 0, 0], 0.44, 0.14, 0.5, 0.045, "dry", { mirror: true }),
    ...sixPattes([[0.2, 0.5, 0.2], [0.24, 0.48, -0.12], [0.22, 0.48, -0.45]], [-48, 5, 48], [[46, 0.44], [-68, 0]], 0.04, "black", "rust", "dry", "dry"),
  ],
};

// cracheur : artillerie acide sur quatre pattes arquées ; corps vert sombre à épaulières de chitine, grand sac
// d'acide lumineux sur le dos, coiffé d'une calotte de chitine à bague d'équipe et épines, tenu par des côtes
// noires ; long cou (pivot « tourelle ») portant un col cracheur en éventail d'équipe hérissé d'os, tête de
// chitine, gueule lumineuse cerclée de chair
const ACIDE: [number, number][] = [[0, 0], [0.3, 0.03], [0.46, 0.2], [0.5, 0.42], [0.43, 0.64], [0.25, 0.78], [0, 0.8]];
const CALOTTE: [number, number][] = [[0.47, 0.5], [0.45, 0.62], [0.3, 0.78], [0.12, 0.86], [0, 0.87]];
const SAC0: Vec3 = [0, 0.95, -0.38];
const COL: Vec3 = [0, 1.64, 0.98];
const spitter: Model = {
  parts: [
    blob(0.48, [0, 0.72, -0.15], [0.95, 0.68, 1.2], "leaf_dark"),
    plaque(0.26, [0.27, 0.9, 0.2], [0.6, 1, 0.3], [0, 0, 1], [0.85, 0.35, 1.1], "black", { mirror: true }),
    { shape: "lathe", sides: 16, profile: ACIDE, pos: SAC0, color: "acid" },
    ...[0, 90, 180, 270].map((a, i) => meridien(ACIDE, SAC0, a + 45, 0.02, 1, 5, 0.055, "black", { fine: i % 2 === 1 })),
    { shape: "lathe", sides: 12, profile: CALOTTE, pos: SAC0, color: "black" },
    { shape: "torus", radius: 0.42, tube: 0.05, sides: 12, pos: add(SAC0, [0, 0.58, 0]), color: "faction" },
    ...[0, 90, 180, 270].map((a): Part => ({ shape: "cone", sides: 5, radius: 0.05, height: 0.26, pos: add(SAC0, pol(0.3, a + 45, 0.84)), rot: along(add(pol(0.8, a + 45, 0), [0, 1, 0])), color: "dry", fine: true })),
    // cou et tête
    bille(0.2, [0, 0.82, 0.38], 1, "leaf_dark", { pivot: "tourelle" }),
    { shape: "tube", radius: 0.11, sides: 8, path: [[0, 0.82, 0.38], [0, 1.35, 0.55], [0, 1.64, 0.8], [0, 1.66, 1.05]], bend: 0.3, color: "leaf_dark", parent: "tourelle" },
    ...[[0, 1.3, 0.5], [0, 1.56, 0.66]].map((p): Part => ({ shape: "cone", sides: 4, radius: 0.04, height: 0.18, pos: add(p as Vec3, [0, 0.1, -0.04]), rot: along([0, 1, -0.6]), color: "dry", parent: "tourelle", fine: true })),
    ...[-96, -64, -32, 0, 32, 64, 96].flatMap((a): Part[] => {
      const r = unit([Math.sin(a * D), Math.cos(a * D), -0.38]);
      const t: Vec3 = [Math.cos(a * D), -Math.sin(a * D), 0];
      const base = add(COL, r, 0.08);
      return [
        { shape: "extrude", profile: [[0, -0.07], [0.24, -0.11], [0.44, 0], [0.24, 0.11], [0, 0.07]], depth: 0.035, pos: base, rot: eul(frame(r, t)), color: "faction", parent: "tourelle" },
        { shape: "cone", sides: 4, radius: 0.03, height: 0.16, pos: add(base, r, 0.48), rot: along(r), color: "dry", parent: "tourelle", fine: true },
      ];
    }),
    blob(0.2, [0, 1.68, 1.22], [0.88, 0.75, 1.3], "black", { parent: "tourelle" }),
    yeux(0.1, 1.79, 1.34, 0.035, "amber", { parent: "tourelle" }),
    { shape: "torus", radius: 0.09, tube: 0.04, sides: 10, pos: [0, 1.62, 1.45], rot: [80, 0, 0], color: "rust", parent: "tourelle", fine: true },
    bille(0.08, [0, 1.62, 1.46], [1.1, 1, 0.6], "acid", { parent: "tourelle" }),
    ...quatrePattes([0.32, 0.7, 0.2], [0.32, 0.7, -0.5], -30, 30, [[44, 0.45], [-74, 0]], 0.055, "black", "leaf_dark", "dry", "dry"),
  ],
};

// carapace : char vivant ; dôme vert sombre barré de quatre larges bandes de chitine noire, rebord d'équipe,
// crête de grandes épines d'os, évents lumineux sous le rebord ; tête cuirassée (pivot « tourelle ») à
// frontal d'équipe, cornes de bélier d'os enroulées, éperon frontal ; six pattes courtes et massives
const CARAPACE: [number, number][] = [[0, 0], [1.0, 0], [1.06, 0.12], [1.0, 0.4], [0.82, 0.7], [0.5, 0.92], [0, 1.0]];
const CA0: Vec3 = [0, 0.5, -0.05];
/** Rayon de la section du dôme de la carapace à l'abscisse z. */
const domeR = (z: number): number => Math.sqrt(Math.max(0.05, 1 - ((z - CA0[2]) / 1.25) ** 2));
const shell: Model = {
  parts: [
    bille(0.8, [0, 0.55, -0.05], [1, 0.45, 1.25], "leaf_dark"),
    { shape: "lathe", sides: 18, profile: CARAPACE, pos: CA0, scale: [1, 1, 1.25], color: "wood" },
    { shape: "torus", radius: 1.03, tube: 0.085, sides: 16, pos: [0, 0.56, -0.05], scale: [1, 1, 1.25], color: "faction" },
    ...[0.68, 0.18, -0.32, -0.82].map((z): Part => ({ shape: "torus", radius: r3(domeR(z) + 0.03), tube: 0.09, sides: 12, arc: 180, pos: [0, CA0[1], z], rot: [-90, 0, 0], scale: [1.09, 2.7, 1.02], color: "black" })),
    ...[0.68, 0.18, -0.32, -0.82].map((z): Part => ({ shape: "cone", sides: 6, radius: 0.1, height: 0.46, pos: V(0, CA0[1] + domeR(z) + 0.26, z - 0.05), rot: along([0, 1, -0.5]), color: "dry" })),
    ...[0.42, -0.58].map((z): Part => ({ shape: "cone", sides: 5, radius: 0.08, height: 0.32, pos: V(domeR(z) * 0.62 + 0.06, CA0[1] + domeR(z) * 0.78 + 0.1, z), rot: along([0.7, 1, -0.3]), color: "dry", mirror: true, fine: true })),
    ...[0.42, -0.58].map((z): Part => bille(0.12, [0.99, 0.44, z], [0.4, 0.55, 1.6], "acid", { mirror: true, fine: true })),
    // tête
    bille(0.28, [0, 0.6, 1.08], 1, "black", { pivot: "tourelle" }),
    blob(0.36, [0, 0.64, 1.3], [1.1, 0.78, 0.92], "black", { parent: "tourelle" }),
    plaque(0.32, [0, 0.88, 1.26], [0, 1, 0.45], [0, -0.3, 1], [1.15, 0.32, 0.95], "faction", { parent: "tourelle" }),
    bille(0.12, [0.32, 0.86, 1.2], 1, "black", { parent: "tourelle", mirror: true }),
    { shape: "torus", radius: 0.25, tube: 0.1, sides: 12, arc: 270, pos: [0.48, 0.68, 1.16], rot: eul(mul(Ry(22), mul(Rx(180), Rz(-90)))), color: "dry", parent: "tourelle", mirror: true },
    { shape: "cone", sides: 6, radius: 0.1, height: 0.34, pos: add([0.48, 0.68, 1.16], app(Ry(22), [0, 0.13, 0.25])), rot: along(app(Ry(22), [0, 1, 0.45])), color: "dry", parent: "tourelle", mirror: true },
    { shape: "cone", sides: 6, radius: 0.12, height: 0.48, pos: [0, 0.74, 1.68], rot: along([0, 0.3, 1]), color: "dry", parent: "tourelle" },
    yeux(0.24, 0.7, 1.56, 0.045, "amber", { parent: "tourelle" }),
    bille(0.1, [0, 0.5, 1.6], [1.6, 0.5, 0.6], "acid", { parent: "tourelle", fine: true }),
    ...sixPattes([[0.75, 0.55, 0.55], [0.85, 0.55, -0.05], [0.75, 0.55, -0.65]], [-35, 0, 35], [[18, 0.36], [-80, 0]], 0.12, "black", "leaf_dark", "dry"),
  ],
};

// liane : bulbe vert sombre à côtes d'équipe, couronné d'une gueule de crocs de chitine recourbés vers
// l'extérieur, anneau de dents d'os et fond lumineux ; faisceau de tentacules de chair (pivot « tourelle »)
// tendus vers l'avant, barbelés d'os et terminés en crochets ; six vrilles de chitine pour pattes
const LIANE: [number, number][] = [[0, 0], [0.4, 0.05], [0.52, 0.28], [0.46, 0.6], [0.28, 0.85], [0.14, 0.94], [0.1, 0.95]];
const LI0: Vec3 = [0, 0.45, 0];
export function tentacule(path: Vec3[], r: number, barbs: number[], extra: Partial<Part> = {}): Part[] {
  const n = path.length - 1;
  const d = sub(path[n], path[n - 1]);
  return [
    { shape: "tube", radius: r, sides: 5, path, bend: 0.12, color: "rust", parent: "tourelle", ...extra },
    { shape: "cone", sides: 5, radius: r * 1.1, height: r * 5, pos: add(path[n], d, (r * 2) / Math.hypot(...d)), rot: along(d), color: "dry", parent: "tourelle", ...extra },
    ...barbs.map((i): Part => ({ shape: "cone", sides: 4, radius: r * 0.7, height: r * 3.2, pos: add(path[i], [0, r * 1.8, 0]), rot: along([path[i][0] * 0.8, 1, -0.4]), color: "dry", parent: "tourelle", ...extra, fine: true })),
  ];
}
const vine: Model = {
  parts: [
    { shape: "lathe", sides: 16, profile: LIANE, pos: LI0, color: "leaf_dark" },
    ...[0, 60, 120, 180, 240, 300].map((a, i) => meridien(LIANE, LI0, a + 30, 0.012, 1, 5, 0.035, "faction", { fine: i % 2 === 1 })),
    // gueule
    ...[0, 72, 144, 216, 288].map((a, i): Part => lame(pol(0.13, a, 1.34), add(pol(0.3, a, 0), [0, 1, 0]), pol(1, a, -0.2), 0.44, 0.22, 0.55, 0.045, "black", { fine: i === 2 || i === 4 })),
    { shape: "torus", radius: 0.14, tube: 0.05, sides: 12, pos: [0, 1.4, 0], color: "rust" },
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a): Part => ({ shape: "cone", sides: 4, radius: 0.03, height: 0.15, pos: pol(0.12, a, 1.46), rot: along(add(pol(-0.7, a, 0), [0, 1, 0])), color: "dry", fine: true })),
    bille(0.11, [0, 1.38, 0], [1, 0.55, 1], "acid"),
    // tentacules
    bille(0.17, [0, 0.85, 0.42], [1.2, 0.8, 0.8], "leaf_dark", { pivot: "tourelle" }),
    ...tentacule([[0.12, 0.88, 0.5], [0.34, 1.08, 0.82], [0.26, 1.04, 1.16], [0.06, 0.8, 1.3], [0.14, 0.6, 1.24]], 0.05, [1, 2], { mirror: true }),
    ...tentacule([[0.05, 0.94, 0.5], [0.14, 1.32, 0.68], [0.28, 1.46, 0.95], [0.4, 1.34, 1.12]], 0.032, [1, 2], { mirror: true, fine: true }),
    // vrilles
    ...sixPattes([[0.3, 0.55, 0.22], [0.36, 0.52, -0.05], [0.3, 0.52, -0.3]], [-45, 0, 45], [[24, 0.3], [-35, 0.28], [-95, 0]], 0.04, "black", "leaf_dark", "dry"),
  ],
};

// planeur à membranes : corps de chitine noire à plaques dorsales d'équipe, sacs de spores lumineux aux
// épaules et sous le ventre ; grandes ailes de membrane rouille nervurées de sève, bras d'attaque d'équipe,
// doigts de chitine, griffe de pouce et crochets d'os aux pointes ; tête allongée à mandibules ; longue queue à dard
export function aile(): Part[] {
  // contour dans (x, z) : bord d'attaque vers l'avant, bord de fuite festonné entre les doigts
  const c: [number, number][] = [[0.2, 0.32], [0.75, 0.52], [1.35, 0.48], [1.75, 0.3], [2.25, 0.04], [1.95, -0.16], [1.7, -0.14], [1.45, -0.55], [1.2, -0.38], [0.95, -0.8], [0.7, -0.52], [0.42, -0.74], [0.2, -0.5]];
  const poignet: Vec3 = [1.35, 0.11, 0.46];
  const doigts: Vec3[] = [[1.45, 0.07, -0.55], [0.95, 0.07, -0.8], [0.42, 0.07, -0.74]];
  return [
    { shape: "extrude", profile: c, depth: 0.03, pos: [0, 0.05, 0], rot: [90, 0, 0], color: "rust", mirror: true },
    { shape: "tube", radius: 0.05, sides: 5, path: [[0.2, 0.1, 0.3], [0.75, 0.13, 0.52], poignet], bend: 0.25, color: "faction", mirror: true },
    ...doigts.map((t): Part => ({ shape: "tube", radius: 0.025, sides: 4, path: [poignet, t], color: "black", mirror: true })),
    { shape: "tube", radius: 0.035, sides: 4, path: [poignet, [1.75, 0.09, 0.3], [2.25, 0.07, 0.04]], bend: 0.1, color: "black", mirror: true },
    { shape: "cone", sides: 5, radius: 0.05, height: 0.28, pos: [1.42, 0.12, 0.62], rot: along([0.35, 0.1, 1]), color: "dry", mirror: true },
    { shape: "cone", sides: 4, radius: 0.035, height: 0.2, pos: [2.28, 0.07, -0.04], rot: along([0.2, 0, -1]), color: "dry", mirror: true, fine: true },
    ...[[0.55, -0.62], [1.15, -0.62], [1.7, -0.05]].map(([x, z]): Part => ({ shape: "tube", radius: 0.014, sides: 3, path: [[0.35, 0.075, 0.05], [x * 0.7 + 0.1, 0.075, z * 0.6], [x, 0.075, z]], color: "acid", mirror: true, fine: true })),
  ];
}
// NB : le contour de l'aile est donné en (x, z) et posé à plat par rot [90, 0, 0] (y du contour -> z).
const membrane: Model = {
  parts: [
    ...aile(),
    blob(0.28, [0, 0.05, -0.05], [0.85, 0.65, 2.0], "black"),
    plaque(0.2, [0, 0.21, 0.2], [0, 1, 0], [0, 0, 1], [1.1, 0.3, 1.1], "faction"),
    plaque(0.17, [0, 0.19, -0.2], [0, 1, -0.1], [0, 0, 1], [1.1, 0.3, 1.1], "faction"),
    bille(0.11, [0.25, 0.14, 0.02], [0.8, 0.7, 1.4], "acid", { mirror: true }),
    ...grappe([0, -0.16, 0.05], 0.9, "acid", 1).map((p): Part => ({ ...p, fine: true })),
    blob(0.18, [0, 0.08, 0.68], [0.82, 0.68, 1.5], "black"),
    yeux(0.08, 0.16, 0.8, 0.035),
    bille(0.05, [0, 0.03, 0.94], [1.3, 0.7, 1], "acid", { fine: true }),
    lame([0.07, 0.03, 0.84], [0.2, 0, 1], [-1, 0, 0], 0.2, 0.07, 0.45, 0.03, "dry", { mirror: true }),
    ...effile([[0, 0.05, -0.5], [0, 0.08, -0.95], [0, 0.11, -1.32], [0, 0.13, -1.55]], 0.08, 0.035, "black"),
    lame([0, 0.13, -1.52], [0, 0.15, -1], [0, 1, 0], 0.3, 0.1, 0.3, 0.03, "dry"),
    ...[-1.05, -1.35].map((z): Part => ({ shape: "cone", sides: 4, radius: 0.03, height: 0.14, pos: [0.05, 0.1, z], rot: along([1, 0.3, -0.5]), color: "dry", mirror: true, fine: true })),
  ],
};

export const SOUCHE_UNIT_MODELS: Record<string, Model> = vivants({
  queen,
  sower,
  gnawer,
  spitter,
  shell,
  vine,
  membrane,
});
