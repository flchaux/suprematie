// La Souche, suite : organes avancés (voir souche.ts pour le style et docs/spec/races.md).
//
// Mêmes matières : chitine noire luisante (black), os (dry), chair (rust), écorce (wood), sève lumineuse (acid),
// couleur d'équipe sur les grandes plaques et les crêtes. Unités de case, centrés, sol à y = 0, avant vers +z.
// - ronce : nœud (`bramble`) et demi-pan (`bramble_seg`, du centre x = 0 au bord x = 0,5 ; le jeu en pose un
//   vers chaque voisin, comme `wall_seg` et `root_seg`) ;
// - rhizome, terrier (gueule ouverte au sol : les unités marchent dessus), panse ;
// - sporange : tourelle (pivot « tourelle », comme l'épine) ;
// - frayère : posée sur l'eau, y = 0 est la surface (le récif descend dessous) ;
// - cocon : chrysalide géante du Béhémoth.
import type { ColorName, Model, Part, Vec3 } from "./types.ts";
import { D, V, add, along, app, bille, blob, corne, courbe, eul, feuille, grappe, lame, meridien, mul, plaque, pol, r3, Rx, Ry, sub, tertre, unit, vivants } from "./souche.ts";

const fin = (ps: Part[]): Part[] => ps.map((p): Part => ({ ...p, fine: true }));

/** Rayon d'un profil tourné (hauteurs croissantes) à la hauteur `y`. */
function rayon(profile: [number, number][], y: number): number {
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    if (y >= y0 && y <= y1 && y1 > y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1][0];
}
/** Point de la surface d'un profil tourné : angle `a`, hauteur `y`, écart `off`. */
const surf = (profile: [number, number][], org: Vec3, a: number, y: number, off = 0): Vec3 => add(org, pol(rayon(profile, y) + off, a, y));

/** Plaque courbe qui épouse un profil tourné entre les points `from` et `to`, écartée de `off`, sur `arc` degrés autour de `a`. */
const coque = (profile: [number, number][], org: Vec3, a: number, arc: number, from: number, to: number, off: number, color: ColorName, sides = 5, extra: Partial<Part> = {}): Part => {
  const pts = profile.slice(from, to + 1).map(([r, y]): [number, number] => [r3(r + off), r3(y)]);
  const n = pts.length - 1;
  // bords rentrés sous la surface : la plaque paraît épaisse
  const bords: [number, number][] = [[r3(pts[0][0] - off * 1.6), r3(pts[0][1] - off * 0.5)], ...pts, [r3(pts[n][0] - off * 1.6), r3(pts[n][1] + off * 0.5)]];
  return { shape: "lathe", sides, profile: bords, arc, pos: org, rot: [0, a - arc / 2, 0], color, ...extra };
};

/** Cône d'os posé en `p`, dirigé selon `d`, longueur `h`. */
const epine = (p: Vec3, d: Vec3, r: number, h: number, color: ColorName = "dry", extra: Partial<Part> = {}): Part => ({ shape: "cone", sides: 5, radius: r, height: h, pos: add(p, d, (h * 0.42) / Math.hypot(...d)), rot: along(d), color, ...extra });

/** Échantillons (point, tangente, normale vers le haut) d'une courbe aux abscisses `ts` (0 à 1). */
function dos(ctrl: Vec3[], ts: number[]): [Vec3, Vec3, Vec3][] {
  const s = courbe(ctrl, 33);
  return ts.map((t) => {
    const i = Math.min(31, Math.max(1, Math.round(t * 32)));
    const f = unit(sub(s[i + 1], s[i - 1]));
    return [s[i], f, unit([-f[0] * f[1], 1 - f[1] * f[1], -f[2] * f[1]])];
  });
}
/** Écailles de chitine (rayon `r`) couchées sur le dos d'une racine courbe, à `off` de son axe. */
const ecailles = (ctrl: Vec3[], ts: number[], r: number, off: number, sc: Vec3, color: ColorName, extra: Partial<Part> = {}): Part[] =>
  dos(ctrl, ts).map(([p, f, n]): Part => plaque(r, add(p, n, off), add(n, f, -0.18), f, sc, color, extra));
/** Rangée d'épines d'os sur le dos d'une racine courbe, penchées vers l'arrière. */
const epinesDos = (ctrl: Vec3[], ts: number[], off: number, r: number, h: number, extra: Partial<Part> = {}): Part[] =>
  dos(ctrl, ts).map(([p, f, n]): Part => epine(add(p, n, off), add(n, f, -0.5), r, h, "dry", { sides: 4, ...extra }));

// =====================================================================================================
// Ronce (mur vivant)
// =====================================================================================================

// bramble : pied d'écorce noueux, trois tiges torsadées (chitine et rouille) terminées en aiguillons d'os, cœur
// de sève visible entre elles, gros bourgeon d'équipe au sommet, épines d'os
const bramble: Model = {
  parts: [
    { shape: "lathe", sides: 7, profile: [[0.28, 0], [0.26, 0.08], [0.16, 0.2], [0, 0.22]], color: "wood" },
    ...[0, 120, 240].flatMap((a, i): Part[] => {
      const p: Vec3[] = [pol(0.21, a, 0.02), pol(0.16, a + 75, 0.36), pol(0.14, a + 150, 0.7), pol(0.25, a + 200, 0.96)];
      return [
        { shape: "tube", radius: 0.088, sides: 5, path: p, bend: 0, color: i === 1 ? "rust" : "black" },
        epine(p[3], sub(p[3], p[2]), 0.078, 0.26),
      ];
    }),
    bille(0.13, [0, 0.52, 0], [1, 1.5, 1], "acid"),
    bille(0.17, [0, 0.84, 0], [1, 0.75, 1], "faction"),
    ...[40, 160, 280].map((a, i): Part => epine(pol(0.19, a, 0.28 + i * 0.12), add(pol(1, a, 0), [0, 0.45, 0]), 0.05, 0.24, "dry", { sides: 4, fine: i === 2 })),
    ...[100, 220].map((a, i): Part => epine(pol(0.18, a, 0.58 + i * 0.06), add(pol(1, a, 0), [0, 0.5, 0]), 0.045, 0.2, "dry", { sides: 4, fine: true })),
  ],
};

// bramble_seg : du centre de la case (x = 0) au bord +x (x = 0,5, un peu au-delà) ; quatre tiges qui se croisent,
// chacune au plan z = 0 et à plat au bord (le pan du voisin, tourné d'un demi-tour, la prolonge) ; veine de
// sève, bractée d'équipe sur la tige du haut, aiguillons d'os de part et d'autre
const RONCE_HAUT: Vec3[] = [[0, 0.66, 0.04], [0.16, 0.86, 0.11], [0.34, 0.94, 0.06], [0.515, 0.92, 0]];
const RONCE_MI: Vec3[] = [[0, 0.82, -0.05], [0.17, 0.72, -0.12], [0.34, 0.5, -0.1], [0.515, 0.44, 0]];
const brambleSeg: Model = {
  parts: [
    { shape: "tube", radius: 0.1, sides: 5, path: [[0, 0.1, 0], [0.17, 0.08, -0.07], [0.34, 0.07, -0.04], [0.515, 0.08, 0]], bend: 0, color: "wood" },
    { shape: "tube", radius: 0.082, sides: 5, path: RONCE_HAUT, bend: 0, color: "black" },
    { shape: "tube", radius: 0.075, sides: 5, path: RONCE_MI, bend: 0, color: "rust" },
    { shape: "tube", radius: 0.07, sides: 5, path: [[0, 0.3, 0.1], [0.17, 0.32, 0.13], [0.34, 0.6, 0.08], [0.515, 0.68, 0]], bend: 0, color: "black" },
    { shape: "tube", radius: 0.05, sides: 4, path: [[0.02, 0.5, 0.02], [0.18, 0.24, -0.12], [0.34, 0.22, 0.04], [0.515, 0.25, 0]], bend: 0, color: "black" },
    { shape: "tube", radius: 0.022, sides: 3, path: RONCE_MI.map((p, i): Vec3 => [p[0], r3(p[1] + 0.055), r3(p[2] - (i < 3 ? 0.04 : 0))]), bend: 0, color: "acid", fine: true },
    plaque(0.13, [0.34, 1.0, 0.04], [0.1, 1, 0.25], [1, 0, 0], [0.75, 0.35, 1.25], "faction"),
    epine([0.2, 0.86, 0.13], [0.1, 0.7, 1], 0.045, 0.26, "dry", { sides: 4 }),
    epine([0.4, 0.62, 0.1], [0.2, 0.2, 1], 0.045, 0.24, "dry", { sides: 4 }),
    epine([0.16, 0.7, -0.14], [-0.1, 0.5, -1], 0.045, 0.26, "dry", { sides: 4 }),
    epine([0.4, 0.48, -0.1], [0.3, 0.3, -1], 0.045, 0.22, "dry", { sides: 4 }),
    epine([0.12, 0.96, -0.03], [-0.2, 1, -0.3], 0.04, 0.2, "dry", { sides: 4, fine: true }),
    epine([0.2, 0.3, 0.14], [0.2, -0.1, 1], 0.04, 0.18, "dry", { sides: 4, fine: true }),
  ],
};

// =====================================================================================================
// Rhizome
// =====================================================================================================

// gros nœud de racines : tubercule noueux à demi enterré, ceint d'une couronne de plaques de chitine (la plupart
// à la couleur d'équipe) ; quatre racines maîtresses sinueuses, grosses comme des troncs, rampent vers les coins
// et plongent (dos d'écailles noires et d'épines), racines minces entre elles ; évents de sève lumineux au sommet
const TUBER: [number, number][] = [[0.68, 0], [0.7, 0.1], [0.62, 0.3], [0.48, 0.46], [0.44, 0.56], [0.34, 0.66], [0, 0.7]];
const RHI = [36, 128, 218, 310];
function event(p: Vec3, d: Vec3, s: number): Part[] {
  const rot = along(d);
  const l = Math.hypot(...d);
  return [
    { shape: "lathe", sides: 8, pos: p, rot, color: "rust", profile: ([[0.24, -0.06], [0.16, 0.1], [0.13, 0.26], [0.18, 0.36], [0.11, 0.37], [0.08, 0.24]] as [number, number][]).map(([a, b]): [number, number] => [r3(a * s), r3(b * s)]) },
    { shape: "torus", radius: r3(0.15 * s), tube: r3(0.05 * s), sides: 8, pos: add(p, d, (0.35 * s) / l), rot, color: "black", fine: true },
    bille(r3(0.12 * s), add(p, d, (0.31 * s) / l), [1, 0.75, 1], "acid", { rot }),
  ];
}
const rhizome: Model = {
  parts: [
    { shape: "lathe", sides: 12, profile: TUBER, color: "wood" },
    ...[82, 172, 264, 354].map((a, i): Part => bille(0.3, pol(0.46, a, 0.26), [1, 0.85, 0.8], i % 2 ? "wood" : "rust", { rot: [0, a, 0], fine: i % 2 === 1 })),
    // racines maîtresses
    ...RHI.flatMap((a, i): Part[] => {
      const ctrl: Vec3[] = [pol(0.16, a - 34, 0.42), pol(0.5, a - 10, 0.44), pol(0.84, a + 8, 0.28), pol(1.12, a + 4, 0.06), pol(1.26, a + 12, -0.42)];
      return [
        ...corne(ctrl, 0.23, 3, i % 2 ? "rust" : "wood", {}, undefined, 0.5),
        ...ecailles(ctrl, [0.4, 0.53, 0.65], 0.14, 0.16, [1.1, 0.38, 1.2], "black", { fine: true }),
        ...epinesDos(ctrl, [0.35, 0.47, 0.59], 0.18, 0.045, 0.24, { fine: true }),
      ];
    }),
    // racines minces
    ...[0, 74, 96, 178, 262, 282].flatMap((a, i) => corne([pol(0.4, a - 8, 0.3), pol(0.7, a, 0.28), pol(0.9, a + (i % 2 ? 12 : -12), 0.1), pol(0.98, a + (i % 2 ? 20 : -20), -0.3)], 0.12, 1, i % 3 === 1 ? "black" : "wood", { fine: i % 2 === 1 }, undefined)),
    // couronne de plaques
    ...[10, 55, 100, 145, 190, 235, 280, 325].map((a, i): Part => plaque(0.25, pol(0.47, a, 0.52), add(pol(0.9, a, 0), [0, 1, 0]), pol(-1, a, 0.9), [0.85, 0.3, 1.15], i % 4 === 3 ? "black" : "faction")),
    // évents
    ...event([0, 0.6, 0], [0.1, 1, 0.08], 1.2),
    ...event(pol(0.24, 78, 0.6), add(pol(0.6, 78, 0), [0, 1, 0]), 0.75),
    ...event(pol(0.24, 196, 0.6), add(pol(0.6, 196, 0), [0, 1, 0]), 0.9),
    ...event(pol(0.24, 305, 0.6), add(pol(0.6, 305, 0), [0, 1, 0]), 0.65),
    // veines de sève, poches au pied
    ...[60, 110, 160, 200, 250, 340].map((a, i): Part => meridien(TUBER, [0, 0, 0], a, 0.012, 0, 4, 0.032, "acid", { fine: i % 2 === 1 })),
    ...fin([86, 268].flatMap((a) => grappe(pol(0.82, a, 0.12), 0.85, "acid", 1))),
  ],
};

// =====================================================================================================
// Terrier
// =====================================================================================================

// gueule béante à ras de terre : bourrelet de chair cuirassé de plaques de chitine (une sur deux à la couleur
// d'équipe), double couronne de crocs d'os recourbés vers l'intérieur, gosier noir annelé, sève au fond ;
// griffes d'ancrage aux quatre coins ; rien de haut au-dessus du centre (les unités passent dessus)
const GOSIER: [number, number][] = [[0.6, 0.26], [0.53, 0.18], [0.46, 0.09], [0.36, 0.04], [0.28, 0.03]];
const burrow: Model = {
  parts: [
    { shape: "lathe", sides: 18, color: "wood", profile: [[1.0, 0], [0.96, 0.08], [0.86, 0.16], [0.7, 0.24]] },
    // bourrelet et gosier
    { shape: "torus", radius: 0.7, tube: 0.16, sides: 20, pos: [0, 0.22, 0], color: "rust" },
    { shape: "lathe", sides: 20, color: "black", profile: GOSIER },
    { shape: "torus", radius: 0.5, tube: 0.045, sides: 20, pos: [0, 0.13, 0], color: "rust", fine: true },
    // fond : lueur qui s'éteint vers les bords
    { shape: "lathe", sides: 12, color: "leaf_dark", profile: [[0.36, 0.035], [0.24, 0.045]] },
    { shape: "lathe", sides: 12, color: "leaf", profile: [[0.24, 0.045], [0.16, 0.055]] },
    { shape: "lathe", sides: 12, color: "acid", profile: [[0.16, 0.055], [0, 0.065]] },
    ...[15, 135, 255].map((a, i): Part => ({ shape: "tube", radius: 0.022, sides: 3, path: [pol(0.14, a - 50, 0.06), pol(0.28, a - 24, 0.05), pol(0.42, a - 6, 0.085), pol(0.53, a + 8, 0.22)], bend: 0, color: "acid", fine: i === 1 })),
    // plaques de chitine en collier
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a, i): Part => plaque(0.3, pol(0.84, a, 0.24), add(pol(0.7, a, 0), [0, 1, 0]), pol(1, a + 90, 0.12), [0.8, 0.32, 1.08], i % 2 ? "black" : "faction")),
    ...[45, 135, 225, 315].map((a): Part => epine(pol(0.92, a + 22, 0.24), add(pol(1, a + 22, 0), [0, 0.7, 0]), 0.055, 0.28, "dry", { fine: true })),
    // crocs recourbés
    ...[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].flatMap((a, i) => corne([pol(0.76, a, 0.22), pol(0.74, a, 0.43), pol(0.6, a + 4, 0.49), pol(i % 2 ? 0.46 : 0.4, a + 8, 0.4)], 0.075, 1, "dry", {})),
    ...[18, 54, 90, 126, 162, 198, 234, 270, 306, 342].map((a): Part => epine(pol(0.59, a, 0.3), add(pol(-1, a, 0), [0, 0.5, 0]), 0.045, 0.2, "dry", { sides: 4, fine: true })),
    // griffes d'ancrage aux coins
    ...[45, 135, 225, 315].flatMap((a) => corne([pol(0.86, a, 0.14), pol(1.06, a + 2, 0.3), pol(1.22, a + 5, 0.14), pol(1.28, a + 7, -0.1)], 0.12, 1, "black", {}, "dry")),
    ...fin([0, 180].flatMap((a) => grappe(pol(0.97, a + 22, 0.1), 0.6, "acid", 1))),
  ],
};

// =====================================================================================================
// Panse
// =====================================================================================================

// estomac dressé et penché vers l'avant : sac de chair veiné serré de côtes d'os, seconde poche et boyau qui
// retombe au sol derrière, plaques d'équipe entre les côtes ; large bouche ouverte vers le ciel sur un bain
// d'acide, lèvres charnues à collerette d'équipe, quatre mandibules de chitine à pointe d'os, couronne de
// dents ; poches d'acide gonflées au pied, tentacules griffus
const PANSE: [number, number][] = [[0.5, -0.1], [0.7, 0.1], [0.8, 0.36], [0.78, 0.6], [0.63, 0.86], [0.46, 1.02], [0.42, 1.12], [0.5, 1.26], [0.56, 1.36]];
const PA_T = Rx(11);
const PA0: Vec3 = [0, 0.12, -0.08];
const pan = (r: number, a: number, y: number): Vec3 => add(PA0, app(PA_T, pol(r, a, y)));
const panse = (a: number, y: number, off = 0): Vec3 => pan(rayon(PANSE, y) + off, a, y);
const PA_R = eul(PA_T);
const maw: Model = {
  parts: [
    tertre(0.95, 0.14, "wood"),
    { shape: "lathe", sides: 16, profile: PANSE, pos: PA0, rot: PA_R, color: "rust" },
    // seconde poche et boyau
    blob(0.42, [-0.34, 0.5, -0.56], [1, 1.1, 0.9], "rust"),
    { shape: "tube", radius: 0.15, sides: 6, path: [[-0.5, 0.75, -0.66], [-0.78, 0.86, -0.62], [-0.94, 0.5, -0.5], [-0.82, 0.18, -0.3], [-0.98, -0.06, -0.12]], bend: 0.22, color: "rust" },
    plaque(0.3, [-0.42, 0.6, -0.86], [-0.35, 0.35, -1], [0.3, 1, 0.2], [1.1, 0.22, 0.9], "faction"),
    plaque(0.26, [-0.36, 0.86, -0.72], [-0.25, 1, -0.75], [0.3, 1, 0.8], [1.1, 0.26, 0.9], "faction"),
    // lèvres, gorge et bain d'acide
    { shape: "torus", radius: 0.55, tube: 0.085, sides: 16, pos: pan(0, 0, 1.36), rot: PA_R, color: "rust" },
    { shape: "lathe", sides: 16, pos: PA0, rot: PA_R, color: "black", profile: [[0.55, 1.37], [0.44, 1.24], [0.38, 1.1]] },
    { shape: "lathe", sides: 12, pos: PA0, rot: PA_R, color: "acid", profile: [[0.41, 1.13], [0.2, 1.15], [0, 1.14]] },
    // os à demi digérés
    ...([[0.12, 0.16, 0.5, 1, 0.35], [-0.16, 0.02, -0.6, 1, 0.5], [0.04, -0.2, 0.2, 1, -0.6]] as number[][]).map(([x, z, dx, dy, dz]): Part => ({ shape: "cylinder", sides: 5, radius: 0.045, radiusTop: 0.03, height: 0.3, pos: add(PA0, app(PA_T, [x, 1.2, z])), rot: along([dx, dy, dz]), color: "dry", fine: true })),
    ...[0, 90, 180, 270].map((a): Part => plaque(0.25, pan(0.66, a, 1.3), app(PA_T, add(pol(0.9, a, 0), [0, 1, 0])), app(PA_T, pol(1, a + 90, 0)), [0.85, 0.3, 1.2], "faction")),
    ...[22, 68, 112, 158, 202, 248, 292, 338].map((a, i): Part => epine(pan(0.53, a, 1.4), app(PA_T, add(pol(-0.55, a, 0), [0, 1, 0])), 0.05, 0.24, "dry", { sides: 4, fine: i % 2 === 1 })),
    // mandibules
    ...[45, 135, 225, 315].flatMap((a, i): Part[] => [
      ...corne([pan(0.5, a, 1.06), pan(0.86, a, 1.28), pan(0.82, a + 6, 1.7), pan(0.3, a + 12, 1.82)], 0.135, 2, "black", {}, "dry", 0.35),
      bille(0.19, pan(0.52, a, 1.12), [1, 0.9, 1], "black", { fine: i % 2 === 1 }),
    ]),
    // côtes
    ...[30, 75, 105, 255, 285, 330].flatMap((a) => corne([panse(a, 0.02, 0.2), panse(a, 0.36, 0.12), panse(a, 0.72, 0.08), panse(a + 4, 1.06, 0.02)], 0.085, 1, "dry", {})),
    // plaques d'équipe, poches d'acide et veines entre les côtes
    ...[52, 308].map((a): Part => coque(PANSE, PA0, a, 30, 1, 4, 0.05, "faction", 4, { rot: eul(mul(PA_T, Ry(a - 15))) })),
    blob(0.26, panse(0, 0.32, -0.04), [0.95, 1.2, 0.8], "acid"),
    blob(0.2, panse(130, 0.36, -0.02), [0.9, 1.2, 0.9], "acid"),
    ...[[12, 0.66, 0.11], [346, 0.74, 0.08], [142, 0.7, 0.1], [90, 0.3, 0.1], [270, 0.3, 0.11]].map(([a, y, r]): Part => bille(r, panse(a, y, -0.01), [1, 1.2, 0.8], "acid", { fine: true })),
    ...[15, 90, 160, 270, 345].map((a): Part => ({ ...meridien(PANSE, [0, 0, 0], a, 0.004, 2, 7, 0.026, "acid", { fine: true }), pos: PA0, rot: PA_R })),
    // tentacules au sol
    ...[[18, 1], [100, 1], [165, -1], [322, -1]].flatMap(([a, s], i) => corne([pol(0.72, a, 0.14), pol(0.95, a + s * 6, 0.22), pol(1.04, a + s * 24, 0.08), pol(1.18, a + s * 34, 0.2)], 0.085, 2, "rust", { fine: i % 2 === 1 }, "dry", 0.55)),
  ],
};

// =====================================================================================================
// Sporange
// =====================================================================================================

// mortier à spores : souche cuirassée de plaques, sacs de spores lumineux autour du pied ; tourelle (pivot
// « tourelle ») : bulbe de chair d'où sort un grand tube-calice annelé de chitine, incliné vers le haut et
// l'avant, gueule en corolle de six pétales (un sur deux à la couleur d'équipe), écailles d'équipe sur le dos
const SP_T = Rx(42); // penché de 42° vers l'avant
const SP0: Vec3 = [0, 0.8, -0.44];
const SPT: [number, number][] = [[0.36, -0.1], [0.42, 0.14], [0.38, 0.44], [0.3, 0.78], [0.27, 1.02], [0.3, 1.2], [0.42, 1.38]];
const tub = (r: number, a: number, y: number): Vec3 => add(SP0, app(SP_T, pol(r, a, y)));
const SP_R = eul(SP_T);
const TOUR: Partial<Part> = { parent: "tourelle" };
const sporangium: Model = {
  parts: [
    tertre(0.96, 0.16, "wood"),
    ...[0, 60, 120, 180, 240, 300].flatMap((a, i) => corne([pol(0.6, a, 0.24), pol(0.82, a, 0.32), pol(0.98, a + 8, 0.08), pol(1.04, a + 14, -0.14)], 0.11, 1, i % 2 ? "black" : "wood", { fine: i % 2 === 0 }, i % 2 ? "dry" : undefined)),
    { shape: "lathe", sides: 14, profile: [[0.74, 0.04], [0.72, 0.22], [0.6, 0.42], [0.48, 0.54], [0, 0.56]], color: "wood" },
    ...[30, 90, 150, 210, 270, 330].map((a, i): Part => plaque(0.31, pol(0.64, a, 0.36), add(pol(1, a, 0), [0, 0.75, 0]), pol(-0.5, a, 1), [0.95, 0.3, 1.05], i % 2 ? "black" : "faction")),
    // sacs de spores au pied
    ...[0, 60, 120, 180, 240, 300].flatMap((a, i): Part[] => [
      i % 2 ? bille(0.16, pol(0.78, a, 0.3), [0.9, 1.15, 0.9], "acid", { fine: true }) : blob(0.2, pol(0.76, a, 0.3), [0.95, 1.1, 0.95], "acid"),
      bille(0.09, pol(0.9, a + 18, 0.16), [1, 1.2, 1], "acid", { fine: true }),
    ]),
    // tourelle : bulbe, tube, gueule
    { shape: "lathe", sides: 12, pos: [0, 0.5, 0], profile: [[0.42, 0], [0.46, 0.08], [0.36, 0.18], [0, 0.2]], color: "black", pivot: "tourelle" },
    blob(0.47, [0, 0.82, -0.36], [1.02, 0.85, 1], "rust", TOUR),
    { shape: "lathe", sides: 14, profile: SPT, pos: SP0, rot: SP_R, color: "rust", ...TOUR },
    { shape: "lathe", sides: 14, pos: SP0, rot: SP_R, color: "black", profile: [[0.42, 1.38], [0.27, 1.18], [0.2, 0.94]], ...TOUR },
    blob(0.21, tub(0, 0, 1.06), [1, 0.7, 1], "acid", { rot: SP_R, ...TOUR }),
    ...[0.24, 0.56, 0.9].map((y, i): Part => ({ shape: "torus", radius: r3(rayon(SPT, y) + 0.01), tube: 0.055, sides: 12, pos: tub(0, 0, y), rot: SP_R, color: "black", ...TOUR, fine: i === 1 })),
    // corolle
    ...[0, 60, 120, 180, 240, 300].flatMap((a, i) => feuille(add(SP0, pol(0.33, a, 1.24)), a, 42, 0.6, 0.62, i % 2 ? "rust" : "faction", undefined, TOUR, SP_T, SP0)),
    ...[30, 90, 150, 210, 270, 330].map((a): Part => epine(tub(0.4, a, 1.34), app(SP_T, add(pol(0.6, a, 0), [0, 1, 0])), 0.05, 0.3, "dry", { sides: 4, ...TOUR, fine: a % 60 === 0 || a > 180 })),
    // écailles d'équipe et épines sur le dos du tube
    ...[0.16, 0.48, 0.8].map((y, i): Part => plaque(0.29 - i * 0.04, tub(rayon(SPT, y) + 0.02, 180, y), app(SP_T, [0, 0.25, -1]), app(SP_T, [0, 1, 0]), [1, 0.32, 1.0], "faction", TOUR)),
    ...[0.36, 0.68].map((y): Part => epine(tub(rayon(SPT, y) + 0.06, 180, y), app(SP_T, [0, -0.1, -1]), 0.055, 0.32, "dry", { ...TOUR, fine: true })),
    // sacs d'acide des flancs, veines, étais d'os
    ...[-1, 1].flatMap((s): Part[] => [
      blob(0.18, [s * 0.42, 0.84, -0.3], [0.8, 1, 1.15], "acid", TOUR),
      { ...meridien(SPT, [0, 0, 0], 90 * s, 0.01, 1, 6, 0.028, "acid", { ...TOUR, fine: true }), pos: SP0, rot: SP_R },
      ...corne([V(s * 0.3, 0.6, -0.1), V(s * 0.54, 0.86, 0.1), V(s * 0.48, 1.16, 0.22), V(s * 0.26, 1.34, 0.28)], 0.085, 1, "dry", TOUR),
    ]),
  ],
};

// =====================================================================================================
// Frayère
// =====================================================================================================

// organe d'eau (y = 0 : surface) : anneau de récif vivant ouvert vers +z, cage thoracique de grandes côtes d'os
// au-dessus du bassin sombre, mère-récif tapie au fond sous un grand éventail d'équipe, grappes d'œufs
// translucides (embryon sombre), écailles d'équipe sur le récif, deux tentacules qui gardent la sortie, algues
const RECIF: [number, number][] = [[1.4, -0.45], [1.43, -0.1], [1.36, 0.14], [1.22, 0.3], [1.08, 0.33], [0.96, 0.2], [0.9, -0.02], [0.9, -0.45]];
/** Œuf translucide : boule de sève dans une cupule de chair, embryon sombre vers le haut et le centre. */
const ponte = (p: Vec3, s: number, big: boolean, extra: Partial<Part> = {}): Part[] => [
  big ? blob(s, p, [1, 1.25, 1], "acid", extra) : bille(s, p, [1, 1.3, 1], "acid", extra),
  bille(r3(s * 1.1), add(p, [0, -s * 0.75, 0]), [1, 0.75, 1], "rust", extra),
  ...(big ? [bille(r3(s * 0.5), add(p, V(-p[0] * s * 0.5, s * 0.75, 0.3 * s)), [0.8, 0.9, 0.8], "black", { ...extra, fine: true })] : []),
];
// éventail : deux volets symétriques (x > 0 et son reflet), ouverts vers l'avant comme un capuchon
const EV_M = mul(Ry(24), Rx(-6));
const EV_P: Vec3 = [0.06, 0.3, -1.12];
const RAIS: [number, number][] = [[8, 1.12], [38, 1.08], [66, 0.98], [92, 0.82]];
const rai = (a: number, r: number): [number, number] => [r3(r * Math.sin(a * D) * 1.08), r3(r * Math.cos(a * D))];
const COTES: [number, number, number][] = [[-0.5, 1.06, 1.45], [0.04, 1.16, 1.75], [0.56, 1.06, 1.5]];
const spawnery: Model = {
  parts: [
    { shape: "lathe", sides: 18, arc: 284, rot: [0, 38, 0], profile: RECIF, color: "wood" },
    { shape: "lathe", sides: 12, color: "leaf_dark", profile: [[0.94, -0.22], [0, -0.26]] },
    // bouts du récif : nœuds cuirassés
    ...[38, -38].flatMap((a): Part[] => [
      bille(0.38, pol(1.16, a, -0.02), [1, 0.95, 1], "wood", { rot: [0, a, 0] }),
      plaque(0.34, pol(1.2, a, 0.24), add(pol(0.3, a, 0), [0, 1, 0.2]), pol(1, a - 90, 0), [1, 0.4, 1], "black"),
      epine(pol(1.24, a, 0.3), add(pol(0.5, a, 0), [0, 1, 0.2]), 0.09, 0.45),
    ]),
    // bosses du récif et écailles d'équipe
    ...[80, 122, 160, 200, 238, 280].map((a, i): Part => bille(0.26, pol(1.34, a, 0.0), [1, 0.9, 1.1], i % 2 ? "leaf_dark" : "wood", { rot: [0, a, 0], fine: i % 2 === 1 })),
    ...[56, 84, 112, 248, 276, 304].map((a): Part => plaque(0.29, pol(1.27, a, 0.28), add(pol(0.8, a, 0), [0, 1, 0]), pol(1, a + 90, 0), [0.9, 0.32, 0.98], "faction")),
    ...[70, 98, 128, 232, 262, 290].map((a): Part => epine(pol(1.36, a, 0.2), add(pol(1, a, 0), [0, 0.8, 0]), 0.06, 0.32, "dry", { fine: true })),
    ...[46, 128, 152, 208, 232, 314].map((a, i): Part => bille(0.07 + (i % 2) * 0.03, pol(1.22, a, 0.3), [1, 0.7, 1], "acid", { fine: true })),
    // côtes d'os
    ...COTES.flatMap(([z, x, h]) => corne([V(x, 0.15, z), V(x + 0.2, h * 0.55, z), V(x - 0.16, h * 0.96, z + 0.06), V(0.14, h * 0.94, z + 0.16)], 0.14, 2, "dry", { mirror: true }, undefined, 0.5)),
    // mère-récif : éventail d'équipe nervuré d'os, tête, cornes, mandibules, yeux
    { shape: "extrude", profile: [[0, 0], [0, 0.82], ...RAIS.flatMap(([a, r], i): [number, number][] => (i + 1 < RAIS.length ? [rai(a, r), rai((a + RAIS[i + 1][0]) / 2, r * 0.78)] : [rai(a, r)])), rai(112, 0.4)].reverse() as [number, number][], depth: 0.07, pos: EV_P, rot: eul(EV_M), color: "faction", mirror: true },
    ...RAIS.map(([a, r]): Part => {
      const [x, y] = rai(a, r + 0.12), [x0, y0] = rai(a, 0.1);
      const p = add(EV_P, app(EV_M, [x, y, 0])), q = add(EV_P, app(EV_M, [x0, y0, 0]));
      return { shape: "cone", sides: 5, radius: 0.085, height: r3(r + 0.02), pos: add(q, sub(p, q), 0.5), rot: along(sub(p, q)), color: "dry", mirror: true, fine: a > 80 || a < 10 };
    }),
    bille(0.5, [0, 0.16, -0.98], [1.15, 0.8, 0.9], "black"),
    plaque(0.36, [0, 0.46, -0.84], [0, 1, 0.5], [0, -0.4, 1], [0.9, 0.35, 1.05], "black"),
    ...[-1, 1].flatMap((s) => corne([V(s * 0.4, 0.34, -0.84), V(s * 0.62, 0.7, -0.7), V(s * 0.5, 0.92, -0.42), V(s * 0.28, 0.86, -0.22)], 0.1, 1, "black", {}, "dry")),
    ...[-1, 1].map((s): Part => lame(V(s * 0.26, 0.12, -0.62), [s * 0.1, 0.1, 1], [-s, 0, 0], 0.5, 0.2, 0.45, 0.08, "dry", { fine: true })),
    bille(0.085, [0.2, 0.42, -0.58], [1, 0.8, 1], "acid", { mirror: true }),
    bille(0.055, [0.33, 0.34, -0.6], 1, "acid", { mirror: true, fine: true }),
    // grappes d'œufs
    ...ponte(pol(0.7, 84, 0.12), 0.22, true),
    ...ponte(pol(0.68, 112, 0.08), 0.16, false),
    ...ponte(pol(0.74, 60, 0.08), 0.14, false, { fine: true }),
    ...ponte(pol(0.7, -80, 0.1), 0.2, true),
    ...ponte(pol(0.7, -106, 0.1), 0.17, false),
    ...ponte(pol(0.72, -56, 0.06), 0.15, false, { fine: true }),
    ...ponte(pol(0.44, 98, -0.02), 0.13, false, { fine: true }),
    ...ponte(pol(0.46, -96, -0.02), 0.12, false, { fine: true }),
    // tentacules de garde à la sortie
    ...[-1, 1].flatMap((s) => corne([V(s * 0.95, -0.15, 1.1), V(s * 1.16, 0.45, 1.26), V(s * 0.9, 0.86, 1.3), V(s * 0.56, 0.7, 1.26)], 0.12, 2, "rust", {}, "dry", 0.5)),
    // algues
    ...fin([62, 98, 134, 226, 262, 298].flatMap((a, i) => feuille(pol(1.36, a, -0.12), a + 20, 64, 0.5 + (i % 2) * 0.15, 0.18, i % 2 ? "leaf" : "leaf_dark"))),
  ],
};

// =====================================================================================================
// Cocon
// =====================================================================================================

// chrysalide géante du Béhémoth : œuf de chair annelé, dressé, serré par six énormes griffes d'os d'où partent des
// membranes sombres tendues ; devant, la peau se fend sur une lueur acide et le monstre replié en perce : crâne
// cornu baissé, bras de chitine et faux d'os croisées ; épaules et dos cuirassés à la couleur d'équipe, flancs de
// chitine, échine d'épines, veines de sève, racines-ancres, sacs de sève au pied, braise acide au sommet
const CHR: [number, number][] = [[0.8, 0], [1.1, 0.3], [1.28, 0.75], [1.34, 1.25], [1.28, 1.8], [1.1, 2.35], [0.86, 2.85], [0.58, 3.25], [0.3, 3.52], [0, 3.62]];
/** Peau : le même profil, annelé. */
const PEAU: [number, number][] = [[0.8, 0], [1.16, 0.3], [1.22, 0.64], [1.33, 0.98], [1.31, 1.42], [1.25, 1.5], [1.28, 1.8], [1.1, 2.22], [1.05, 2.5], [0.84, 2.86], [0.68, 3.16], [0.42, 3.42], [0, 3.62]];
const CH0: Vec3 = [0, 0.3, 0];
const peau = (a: number, y: number, off = 0): Vec3 => surf(CHR, CH0, a, y, off);
const GRIFFES = [38, 93, 148, 212, 267, 322];
const GRIFFE: [number, number][] = [[1.6, 0.05], [1.82, 1.15], [1.66, 2.45], [1.12, 3.6], [0.36, 4.3]];
/** Membrane tendue entre deux griffes voisines (angle du milieu `a`), bord libre festonné. */
const MEMB: [number, number][] = [[-0.74, 0], [0.74, 0], [0.86, 0.9], [0.9, 1.75], [0.5, 0.95], [0, 0.68], [-0.5, 0.95], [-0.9, 1.75], [-0.86, 0.9]];
function voile(a: number, l: number): Part[] {
  const m = mul(Ry(a), Rx(11));
  const o = pol(1.4, a, 0.12);
  const q = (x: number, y: number): Vec3 => add(o, app(m, [x, y, 0.03]));
  return [
    { shape: "extrude", profile: MEMB.map(([x, y]): [number, number] => [r3(x * l), y]), depth: 0.04, pos: o, rot: eul(m), color: "rubber", fine: a === 120 || a === 240 },
    ...[-1, 1].map((s): Part => ({ shape: "tube", radius: 0.03, sides: 3, path: [q(s * 0.86 * l, 1.5), q(s * 0.5 * l, 0.75), q(s * 0.2, 0.06)], bend: 0, color: "acid", fine: true })),
  ];
}
/** Voile radial tendu de la griffe à la peau (rayon, hauteur). */
const RADIAL: [number, number][] = [[1.8, 1.5], [1.66, 2.45], [1.14, 3.55], [0.88, 3.3], [1.0, 2.9], [1.14, 2.45], [1.5, 1.85]];
const cocoon: Model = {
  parts: [
    tertre(1.9, 0.34, "wood"),
    // racines-ancres
    ...[0, 60, 120, 180, 240, 300].flatMap((a, i) => corne([pol(1.2, a, 0.4), pol(1.64, a + 3, 0.56), pol(1.94, a + 8, 0.24), pol(2.04, a + 12, -0.2)], 0.23, 1, "black", { fine: i % 2 === 1 }, "dry")),
    // chrysalide, en trois étages (l'occlusion cuite prend chaque pièce pour un cylindre : un seul assombrirait le haut)
    ...[[0, 5], [5, 8], [8, 12]].map(([i, j]): Part => ({ shape: "lathe", sides: 16, profile: PEAU.slice(i, j + 1), pos: CH0, color: "rust" })),
    // griffes d'os, voiles radiaux et membranes
    ...GRIFFES.flatMap((a): Part[] => [
      bille(0.38, pol(1.58, a, 0.26), [1, 0.85, 1], "black", { fine: true }),
      ...corne(GRIFFE.map(([r, y], j) => pol(r, a + j * 2, y)), 0.27, 2, "dry", {}, undefined, 0.36),
      { shape: "extrude", profile: RADIAL, depth: 0.04, pos: [0, 0, 0], rot: [0, a - 87, 0], color: "rubber", fine: true },
    ]),
    ...([[65, 0.93], [120, 0.93], [180, 1.06], [240, 0.93], [295, 0.93]] as [number, number][]).flatMap(([a, l]) => voile(a, l)),
    // fente lumineuse et ses lèvres de chair
    blob(0.5, peau(0, 1.15, -0.1), [0.62, 1.55, 0.42], "acid", { fine: true }),
    bille(0.5, peau(0, 1.15, -0.1), [0.6, 1.5, 0.4], "acid"),
    ...[-1, 1].map((s): Part => ({ shape: "tube", radius: 0.13, sides: 5, path: [peau(0, 0.2, 0.08), peau(s * 12, 0.45, 0.08), peau(s * 17, 0.95, 0.07), peau(s * 17, 1.5, 0.07), peau(s * 14, 2.1, 0.06)], bend: 0, color: "rust", fine: true })),
    ...[[0.5, 0.75, 6], [0.95, 0.8, -6]].map(([y0, y1, d]): Part => ({ shape: "tube", radius: 0.045, sides: 4, path: [peau(-16, y0, 0.06), peau(d, (y0 + y1) / 2, 0.16), peau(16, y1, 0.06)], bend: 0, color: "rust", fine: true })),
    // crâne baissé : plaques, yeux, mandibules, cornes
    blob(0.52, peau(0, 2.5, -0.16), [1.05, 1.1, 0.9], "rust", { fine: true }),
    bille(0.42, peau(0, 2.3, 0.08), [0.85, 1.15, 0.85], "black"),
    plaque(0.32, peau(0, 2.52, 0.28), [0, 0.9, 1], [0, -1, 0.9], [0.9, 0.32, 1.2], "black", { fine: true }),
    ...[[0.14, 2.28, 0.42, 0.08], [0.25, 2.38, 0.33, 0.065], [0.1, 2.12, 0.43, 0.05]].map(([x, y, off, r], i): Part => bille(r, add(peau(0, y, off), [x, 0, 0]), 1, "acid", { mirror: true, fine: i === 2 })),
    lame(add(peau(0, 2.02, 0.3), [0.2, 0, 0]), [0.15, -1, 0.35], [-1, 0, 0], 0.5, 0.18, 0.45, 0.09, "dry", { mirror: true, fine: true }),
    ...corne([add(peau(0, 2.5, 0.06), [0.28, 0, 0]), add(peau(0, 2.8, 0.22), [0.6, 0, 0]), add(peau(0, 2.75, 0.62), [0.8, 0, 0]), add(peau(0, 2.45, 0.86), [0.7, 0, 0])], 0.16, 1, "black", { mirror: true }, "dry"),
    // bras repliés : bras de chitine, coude, faux d'os dressées devant la fente
    ...corne([peau(27, 2.05, 0.0), peau(30, 1.6, 0.26), peau(30, 1.1, 0.42), peau(28, 0.72, 0.5)], 0.2, 1, "black", { mirror: true }, "black"),
    lame(peau(27, 0.72, 0.42), [-0.42, 1, 0.12], [-1, -0.2, 0.1], 1.15, 0.36, 0.22, 0.13, "dry", { mirror: true }),
    epine(peau(29, 0.8, 0.5), add(pol(1, 40, 0), [0, -0.7, 0]), 0.1, 0.4, "dry", { mirror: true, fine: true }),
    // cuirasse : épaules et dos à la couleur d'équipe, flancs de chitine
    ...[65, 295].map((a): Part => coque(CHR, CH0, a, 44, 5, 7, 0.1, "faction", 4)),
    coque(CHR, CH0, 180, 50, 6, 8, 0.07, "faction", 4),
    coque(CHR, CH0, 180, 54, 4, 6, 0.1, "faction", 4),
    coque(CHR, CH0, 180, 50, 2, 4, 0.13, "faction", 4),
    ...[120, 240].flatMap((a): Part[] => [coque(CHR, CH0, a, 44, 2, 4, 0.09, "black", 4, { fine: true }), coque(CHR, CH0, a, 40, 5, 6, 0.07, "black", 4, { fine: true })]),
    // échine et pointes qui percent la peau
    ...[[180, 0.95, 0.8], [180, 1.6, 0.95], [180, 2.25, 0.85], [180, 2.85, 0.7], [112, 1.9, 0.6], [248, 1.9, 0.6], [128, 2.75, 0.55], [232, 2.75, 0.55]].map(([a, y, h], i): Part => epine(peau(a, y, 0.1), add(pol(1, a, 0), [0, 0.25 + y * 0.15, 0]), i < 4 ? 0.17 - i * 0.015 : 0.12, h, "dry", { fine: i > 3 })),
    // veines, sacs de sève au pied, braise au sommet
    ...[88, 150, 210, 272].map((a): Part => meridien(CHR, CH0, a, 0.03, 1, 8, 0.045, "acid", { fine: true })),
    ...[20, -20].map((a): Part => blob(0.27, pol(1.5, a, 0.42), [1, 1.1, 0.9], "acid", { fine: true })),
    ...fin([104, 164, 196, 256].flatMap((a) => grappe(pol(1.68, a, 0.34), 1.2, "acid", 1.1))),
    ...[60, 180, 300].map((a): Part => epine(add(CH0, pol(0.2, a, 3.46)), add(pol(0.7, a, 0), [0, 1, 0]), 0.1, 0.5, "dry", { fine: true })),
    bille(0.22, add(CH0, [0, 3.62, 0]), [1, 1.3, 1], "acid"),
  ],
};

export const SOUCHE_ORGAN_MODELS: Record<string, Model> = vivants({
  bramble,
  bramble_seg: brambleSeg,
  rhizome,
  burrow,
  maw,
  sporangium,
  spawnery,
  cocoon,
});
