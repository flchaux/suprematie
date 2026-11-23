// La Souche : les organismes de l'essaim, seconde portée (voir docs/spec/races.md et souche.ts pour le style).
//
// Même matière que les premiers organismes : chitine noire luisante (black), os (dry), chair rouille et verte,
// sève vert acide lumineuse (acid), yeux ambrés ; la couleur du joueur tient les grandes plaques du dos, les
// bandes de carapace et les crêtes. Chaque espèce a sa silhouette : la vessie est une outre lumineuse sur des
// pattes d'insecte, le dard une pelote d'aiguillons, le fouisseur une longue carapace à épines et à pelles, la
// nourrice un abdomen à mamelles sous une collerette, le frelon une flèche à quatre ailes, la murène un serpent
// de mer en anneaux, le léviathan un monstre à nageoires, le béhémoth une montagne à faux.
//
// Pivots : pattes « jambe… » ; « tourelle » (faisceau du dard, tête de la murène et du léviathan, torse du
// béhémoth) ; anneaux « ondule… » de la murène. Le frelon et la nourrice n'ont ni tourelle ni ailes animées.
import type { ColorName, Model, Part, Vec3 } from "./types.ts";
import { D, type M3, Rx, Ry, Rz, add, along, app, bille, blob, corne, effile, eul, frame, lame, mul, patte, plaque, pol, quatrePattes, r3, sixPattes, sub, unit, V, yeux } from "./souche.ts";

// ---------- aides propres à l'essaim ----------
type Prof = [number, number][];

/** Point d'un profil tourné posé en `org` et incliné par `m`, au méridien `a` (degrés), décalé de `off`. */
const surf = (prof: Prof, org: Vec3, m: M3, a: number, i: number, off: number): Vec3 => add(org, app(m, pol(prof[i][0] + off, a, prof[i][1])));

/** Veine en zigzag qui suit un profil tourné incliné (méridien `a`, entre les rangs `from` et `to`). */
function veine(prof: Prof, org: Vec3, m: M3, a: number, from: number, to: number, r: number, color: ColorName, zig = 7, extra: Partial<Part> = {}): Part {
  const path: Vec3[] = [];
  for (let i = from; i <= to; i++) path.push(surf(prof, org, m, a + (i % 2 ? zig : -zig), i, r * 0.9));
  return { shape: "tube", radius: r, sides: 3, path, bend: 0, color, ...extra };
}

/**
 * Voûte : demi-fût de carapace couché le long de z (dos en haut). Profil (rayon, z) de l'arrière vers l'avant,
 * `sy` : hauteur relative ; `tilt` : tangage en degrés (positif : le nez plonge).
 */
const voute = (pos: Vec3, prof: Prof, sy: number, color: ColorName, extra: Partial<Part> = {}, tilt = 0, sides = 10): Part =>
  ({ shape: "lathe", sides, arc: 180, profile: prof, pos, rot: eul(mul(Rx(tilt), mul(Rx(90), Ry(90)))), scale: [sy, 1, 1], color, ...extra });

/** Profil d'une plaque de voûte : bord arrière évasé (rayon `r0`, avec sa tranche), avant plus étroit (`r1`), longueur `l`. */
const ecaille = (r0: number, r1: number, l: number): Prof => [[r3(r0 * 0.86), -l / 2 + 0.01], [r0, -l / 2], [r3(r0 * 0.99), -l * 0.2], [r1, l / 2]].map(([a, b]): [number, number] => [r3(a), r3(b)]);

/** Aileron vertical dans le plan (z, y) : contour en (z, y), épaisseur `t`. */
const aileron = (pos: Vec3, prof: Prof, t: number, color: ColorName, extra: Partial<Part> = {}): Part => ({ shape: "extrude", profile: prof, depth: t, pos, rot: [0, -90, 0], color, ...extra });

/** Cône posé par sa base en `p`, dirigé selon `d`. */
const epine = (p: Vec3, d: Vec3, r: number, h: number, color: ColorName = "dry", extra: Partial<Part> = {}, sides = 5): Part =>
  ({ shape: "cone", sides, radius: r, height: h, pos: add(p, unit(d), h / 2), rot: along(d), color, ...extra });

/**
 * Écaille dressée : pyramide aplatie à arête saillante (8 triangles), pied en `p`, dressée selon `up`, arête
 * tournée vers `out` ; `w` : demi-largeur, `h` : hauteur, `t` : demi-épaisseur.
 */
function pointe(p: Vec3, up: Vec3, out: Vec3, w: number, h: number, t: number, color: ColorName, extra: Partial<Part> = {}): Part {
  const Y = unit(up);
  const X = unit([Y[1] * out[2] - Y[2] * out[1], Y[2] * out[0] - Y[0] * out[2], Y[0] * out[1] - Y[1] * out[0]]);
  const Z: Vec3 = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  return { shape: "cone", sides: 4, radius: 1, height: h, scale: [w, 1, t], pos: add(p, Y, h / 2), rot: eul([X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]), color, ...extra };
}

/** Pattes allégées au loin : sans griffes ni ergots. */
const pattes = (parts: Part[]): Part[] => parts.map((p) => (p.shape === "cone" ? { ...p, fine: true } : p));

// =====================================================================================================
// Petits organismes
// =====================================================================================================

// vessie : coureur d'assaut. Un thorax de chitine bas sur six pattes d'insecte porte une outre d'acide bien plus
// grosse que lui, tendue à éclater : sève lumineuse sous un réseau de veines noires et une membrane marbrée de vert
// sombre, cloques qui bombent, écailles d'équipe écartées par le gonflement le long du dos, calice de chair et
// griffes de chitine qui la serrent ; petite tête basse à mandibules
const OUTRE: Prof = [[0, -0.52], [0.28, -0.48], [0.5, -0.3], [0.62, -0.04], [0.63, 0.2], [0.53, 0.42], [0.35, 0.57], [0.15, 0.64], [0, 0.65]];
const OU0: Vec3 = [0, 0.94, -0.42];
const OUM = Rx(-30);
const ou = (a: number, i: number, off = 0): Vec3 => surf(OUTRE, OU0, OUM, a, i, off);
const burster: Model = {
  parts: [
    // outre, calice de chair et veines
    { shape: "lathe", sides: 14, profile: OUTRE, pos: OU0, rot: eul(OUM), color: "acid" },
    { shape: "lathe", sides: 10, profile: [[0.1, -0.56], [0.38, -0.5], [0.58, -0.3], [0.67, -0.12], [0.63, -0.1]], pos: OU0, rot: eul(OUM), color: "rust" },
    ...[22, 68, 112, 158, 202, 248, 292, 338].map((a, i) => veine(OUTRE, OU0, OUM, a, 3, i % 2 ? 6 : 7, 0.034, "black", i % 2 ? 9 : -9, { fine: i % 4 === 1 })),
    ...[45, 315].map((a): Part => ({ shape: "tube", radius: 0.024, sides: 3, path: [ou(a + 32, 5, 0.02), ou(a, 4, 0.03), ou(a - 34, 5, 0.02)], bend: 0, color: "black", fine: true })),
    // cloques prêtes à crever
    ...([[80, 4, 0.18], [-84, 4, 0.16], [-124, 4, 0.17]] as [number, number, number][]).map(([a, i, r], k): Part => bille(r, ou(a, i, 0), 1, "acid", { fine: k > 0 })),
    // écailles écartées par le gonflement le long du dos, membrane marbrée aux flancs
    ...([[0, 4, 0.3], [0, 6, 0.25], [180, 6, 0.28], [180, 4, 0.31]] as [number, number, number][]).map(([a, i, r], k): Part => {
      const p = ou(a, i, 0.02);
      return plaque(r, p, sub(p, add(OU0, [0, 0.05, 0])), [0, 1, -0.4], [k === 1 ? 0.8 : 1, 0.28, k === 1 ? 0.8 : 1], "faction");
    }),
    ...([[104, 4, 0.2], [46, 3, 0.22], [150, 6, 0.15]] as [number, number, number][]).map(([a, i, r], k): Part => {
      const p = ou(a, i, -0.02);
      return plaque(r, p, sub(p, OU0), [0, 1, 0.2], [1.1, 0.28, 1], "leaf_dark", { mirror: true, fine: k > 0 });
    }),
    // griffes de chitine qui serrent l'outre
    ...[36, 108, 180, 252, 324].map((a, i): Part => lame(ou(a, 1, 0.1), app(OUM, pol(1, a, 0.5)), app(OUM, pol(-0.6, a, 1)), 0.5, 0.15, 0.5, 0.05, "black", { fine: i % 2 === 0 })),
    // thorax, taille et tête
    blob(0.24, [0, 0.46, 0.1], [0.95, 0.85, 1.25], "black"),
    plaque(0.21, [0, 0.63, 0.22], [0, 1, 0.3], [0, 0, 1], [1.1, 0.32, 1], "faction"),
    bille(0.18, [0, 0.38, 0.5], [0.85, 0.72, 1.35], "black"),
    yeux(0.09, 0.45, 0.6, 0.036),
    bille(0.06, [0, 0.32, 0.7], [1.3, 0.7, 0.9], "acid", { fine: true }),
    lame([0.07, 0.33, 0.62], [0.3, -0.12, 1], [-1, 0, 0], 0.32, 0.1, 0.5, 0.035, "dry", { mirror: true }),
    ...pattes(sixPattes([[0.15, 0.44, 0.3], [0.19, 0.42, 0.06], [0.17, 0.42, -0.14]], [-50, -6, 40], [[52, 0.46], [-64, 0]], 0.03, "black", "rust", "dry")),
  ],
};

// dard : batterie antiaérienne vivante. Corps trapu campé sur quatre pattes épaisses, épaules cuirassées aux
// couleurs d'équipe ; sur le dos, une poche de muscles (pivot « tourelle ») d'où jaillit un faisceau de longs
// aiguillons d'os gainés de chitine, braqué vers le ciel, sacs de venin lumineux à leur pied, collerette
// d'écailles d'équipe ; tête basse de bélier
const DA0: Vec3 = [0, 0.86, -0.1];
const DAM = Rx(14);
const dard = (a: number, t: number, L: number, r: number, extra: Partial<Part> = {}): Part[] => {
  const d = app(DAM, [Math.sin(t * D) * Math.sin(a * D), Math.cos(t * D), Math.sin(t * D) * Math.cos(a * D)]);
  const b = add(DA0, app(DAM, pol(0.34 * Math.sin(t * D) + 0.05, a, 0.02)));
  return [
    epine(b, d, r, L, "dry", { parent: "tourelle", ...extra }),
    { shape: "cylinder", sides: 5, radius: r3(r * 1.35), radiusTop: r3(r * 0.95), height: r3(L * 0.42), pos: add(b, d, L * 0.21), rot: along(d), color: "black", parent: "tourelle", fine: true },
  ];
};
const dart: Model = {
  parts: [
    blob(0.45, [0, 0.56, -0.08], [1.1, 0.78, 1.2], "rust"),
    plaque(0.3, [0.36, 0.72, 0.16], [0.75, 1, 0.25], [0, 0, 1], [0.95, 0.32, 1.15], "faction", { mirror: true }),
    plaque(0.28, [0, 0.72, -0.54], [0, 1, -0.9], [0, 0.6, 1], [1.4, 0.32, 0.9], "faction"),
    plaque(0.22, [0.42, 0.56, -0.34], [1, 0.5, -0.2], [0, 0, 1], [0.9, 0.3, 1.2], "black", { mirror: true }),
    ...[0.1, -0.32].map((z): Part => epine(V(0.5, 0.62, z), [1, 0.35, -0.2], 0.06, 0.26, "dry", { mirror: true, fine: true })),
    // poche de muscles et faisceau
    { shape: "lathe", sides: 10, profile: [[0.36, -0.16], [0.4, 0.0], [0.3, 0.14], [0.14, 0.2], [0, 0.21]], pos: DA0, rot: eul(DAM), color: "rust", pivot: "tourelle" },
    ...[30, 90, 150, 210, 270, 330].map((a): Part => bille(0.09, add(DA0, app(DAM, pol(0.31, a, 0.08))), [1, 1.1, 1], "acid", { parent: "tourelle", fine: a !== 30 && a !== 330 })),
    ...[0, 60, 120, 180, 240, 300].map((a): Part => plaque(0.17, add(DA0, app(DAM, pol(0.44, a, 0.02))), app(DAM, pol(1, a, 0.45)), app(DAM, [0, 1, 0]), [1.05, 0.28, 1.2], "faction", { parent: "tourelle" })),
    ...[0, 120, 240].flatMap((a) => dard(a, 7, 1.45, 0.07)),
    ...[30, 81, 132, 183, 234, 285, 336].flatMap((a) => dard(a, 24, 1.3, 0.066)),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => dard(a + 8, 43, 0.95, 0.06, { fine: i % 2 === 1 })[0]),
    // tête de bélier
    blob(0.23, [0, 0.46, 0.5], [0.95, 0.8, 1.35], "black"),
    plaque(0.2, [0, 0.62, 0.58], [0, 1, 0.5], [0, -0.4, 1], [1, 0.4, 1.2], "dry"),
    yeux(0.14, 0.5, 0.7, 0.04),
    bille(0.07, [0, 0.36, 0.76], [1.3, 0.6, 0.8], "acid", { fine: true }),
    lame([0.12, 0.38, 0.66], [0.35, -0.25, 1], [-0.6, 0.7, 0], 0.32, 0.11, 0.5, 0.045, "dry", { mirror: true }),
    ...pattes(quatrePattes([0.34, 0.54, 0.24], [0.34, 0.54, -0.42], -32, 34, [[34, 0.4], [-74, 0]], 0.078, "black", "rust", "dry", "dry")),
  ],
};

// fouisseur : scolopendre cuirassée à l'affût. Six carapaces imbriquées (équipe et chitine en alternance) sur un
// corps de chair, rangée de très hautes épines d'os sur l'échine (seules visibles quand il est enterré), tête en
// coin à mandibules entre deux bras fouisseurs : pelles d'os à quatre griffes ; trois paires de pattes courtes,
// cerques en pince à l'arrière
const FO: { z: number; r: number }[] = [{ z: 0.62, r: 0.46 }, { z: 0.27, r: 0.5 }, { z: -0.08, r: 0.49 }, { z: -0.42, r: 0.44 }, { z: -0.74, r: 0.37 }, { z: -1.03, r: 0.27 }];
/** Bras fouisseur (pivot `name` à l'épaule) : pelle d'os à quatre griffes. */
function pelle(name: string, side: 1 | -1): Part[] {
  const s = (v: Vec3): Vec3 => [v[0] * side, v[1], v[2]];
  const ep = s([0.34, 0.3, 0.66]), co = s([0.66, 0.42, 0.68]), po = s([0.72, 0.35, 0.86]);
  // pelle : longueur vers l'avant, largeur de l'axe (en bas) vers le dehors (en haut)
  const f = s([0.02, -0.22, 1]), w = s([1, 0.6, 0.05]);
  const m = frame(f, w);
  const at = (x: number, y: number): Vec3 => add(po, app(m, [x, y, 0]));
  return [
    bille(0.18, ep, 1, "rust", { pivot: name }),
    { shape: "tube", radius: 0.12, sides: 5, path: [ep, co, po], bend: 0, color: "black", parent: name },
    { shape: "extrude", profile: [[-0.16, -0.1], [0.12, -0.28], [0.36, -0.33], [0.46, -0.1], [0.46, 0.12], [0.34, 0.33], [0.08, 0.28], [-0.16, 0.1]], depth: 0.12, pos: po, rot: eul(m), color: "black", parent: name },
    ...([[0.28, -0.26, -0.4], [0.4, -0.1, -0.12], [0.4, 0.1, 0.14], [0.26, 0.26, 0.42]] as Vec3[]).map(([x, y, k], i): Part => epine(at(x, y), app(m, [1, k, -0.16 * side]), 0.1, i % 3 ? 0.42 : 0.36, "dry", { parent: name }, 4)),
  ];
}
const burrower: Model = {
  parts: [
    // corps de chair sous les carapaces
    { shape: "lathe", sides: 8, profile: [[0, -1.2], [0.2, -1.1], [0.34, -0.6], [0.4, 0], [0.38, 0.6], [0.2, 0.86]], pos: [0, 0.26, 0], rot: [90, 0, 0], scale: [1, 1, 0.7], color: "rust" },
    // carapaces imbriquées et épines latérales
    ...FO.map(({ z, r }, i): Part => voute(V(0, 0.18, z), ecaille(r, r3(r * 0.9), 0.42), 0.94, i % 2 ? "black" : "faction", {}, 4, 8)),
    ...FO.map(({ z, r }, i): Part => epine(V(r * 0.93, 0.3, z - 0.12), [1, 0.25, -0.7], 0.06, 0.26, "dry", { mirror: true, fine: true }, 4)),
    // échine : grandes épines
    ...FO.map(({ z, r }, i): Part => epine(V(0, 0.16 + r * 0.9, z - 0.08), [0, 1, -0.35], 0.075, [0.5, 0.68, 0.74, 0.68, 0.52, 0.36][i], "dry")),
    ...FO.slice(0, 5).map(({ z, r }, i): Part => epine(V(r * 0.5, 0.16 + r * 0.76, z - 0.08), [0.38, 1, -0.35], 0.05, [0.34, 0.44, 0.48, 0.44, 0.32][i], "dry", { mirror: true, fine: true }, 4)),
    // crête d'équipe au pied des épines : elle dépasse aussi quand il est enterré
    ...FO.slice(0, 5).map(({ z, r }): Part => pointe(V(0, 0.12 + r * 0.9, z + 0.1), [0, 1, -0.6], [0, 0.6, 1], 0.17, 0.52, 0.06, "faction")),
    // sève entre les plaques
    ...[0.45, -0.08].map((z): Part => bille(0.07, [0.42, 0.2, z], [0.5, 0.7, 1.3], "acid", { mirror: true, fine: true })),
    // tête en coin
    bille(0.3, [0, 0.3, 0.92], [0.95, 0.62, 1.15], "black"),
    plaque(0.23, [0, 0.45, 0.94], [0, 1, 0.5], [0, -0.4, 1], [1.1, 0.35, 1.15], "dry"),
    yeux(0.17, 0.36, 1.08, 0.042),
    bille(0.08, [0, 0.22, 1.16], [1.4, 0.6, 0.8], "acid"),
    lame([0.12, 0.22, 1.1], [0.3, -0.05, 1], [-1, 0, 0], 0.32, 0.11, 0.55, 0.045, "dry", { mirror: true }),
    // bras, pattes, cerques
    ...pelle("jambe_av_d", 1),
    ...pelle("jambe_av_g", -1),
    ...([[0.36, 0.24, 0.2], [0.36, 0.24, -0.2], [0.3, 0.24, -0.6]] as Vec3[]).flatMap((h, i): Part[] => {
      const n = ["jambe_ar_1", "jambe_2", "jambe_ar_3"][i];
      const yaw = [-8, 14, 34][i];
      const segs: [number, number][] = [[28, 0.32], [-62, 0]];
      return pattes([...patte(`${n}_d`, 1, h, yaw, segs, 0.05, "black", "rust"), ...patte(`${n}_g`, -1, h, yaw, segs, 0.05, "black", "rust")]);
    }),
    lame([0.1, 0.26, -1.12], [0.35, 0.1, -1], [-1, 0, 0], 0.32, 0.11, 0.35, 0.045, "dry", { mirror: true, fine: true }),
  ],
};

// nourrice : soigneuse sans armes. Long abdomen de chair gonflé de sève, cerclé d'anneaux d'équipe, deux rangs de
// mamelles lumineuses sur les flancs, dos moussu de frondes et de poils, vrilles nourricières qui pendent avec une
// goutte au bout ; large collerette ronde d'équipe autour d'un masque d'os lisse, sans bouche, piqué d'yeux, à la
// barbe de palpes ; six pattes charnues
const NO: Vec3 = [0, 0.82, -0.44];
const NOR: Vec3 = [0.6, 0.5, 0.86];
/** Point de l'abdomen de la nourrice : angle `a` depuis le dos (90 : flanc droit), abscisse z. */
const no = (a: number, z: number, k = 1): Vec3 => {
  const s = Math.sqrt(Math.max(0.05, 1 - ((z - NO[2]) / NOR[2]) ** 2)) * k;
  return V(Math.sin(a * D) * NOR[0] * s, NO[1] + Math.cos(a * D) * NOR[1] * s, z);
};
const noN = (a: number): Vec3 => [Math.sin(a * D), Math.cos(a * D), 0];
const COLL: Vec3 = [0, 1.0, 0.46];
const nurse: Model = {
  parts: [
    { shape: "lathe", sides: 12, profile: [[0, -0.94], [0.28, -0.84], [0.5, -0.58], [0.6, -0.15], [0.56, 0.25], [0.42, 0.62], [0.24, 0.9]], pos: NO, rot: [90, 0, 0], scale: [1, 1, 0.84], color: "rust" },
    ...[-0.06, -0.86].map((z): Part => ({ shape: "torus", radius: no(90, z)[0], tube: 0.06, sides: 12, pos: [0, NO[1], z], rot: [90, 0, 0], scale: [1, 1, 0.84], color: "faction" })),
    // mamelles : rang haut et rang bas
    ...([[0.16, 0.17], [-0.42, 0.23], [-1.0, 0.16]] as [number, number][]).flatMap(([z, r], i): Part[] => {
      const p = no(58, z, 1.0);
      return [
        bille(r, p, 1, "acid", { mirror: true, rot: [0, 20 * i, 0] }),
        plaque(r * 1.25, add(p, noN(58), -r * 0.25), noN(58), [0, 0, 1], [1, 0.35, 1], "black", { mirror: true, fine: true }),
        epine(add(p, noN(58), r * 0.75), noN(58), 0.05, 0.11, "rust", { mirror: true, fine: true }, 4),
      ];
    }),
    ...([[-0.14, 0.15], [-0.68, 0.16]] as [number, number][]).map(([z, r]): Part => bille(r, no(104, z, 1.02), [1, 1.2, 1], "acid", { mirror: true, fine: true })),
    // dos moussu : touffe de frondes couchées vers l'arrière, de part et d'autre de l'échine
    ...Array.from({ length: 18 }, (_, i): Part => {
      const z = 0.2 - i * 0.076;
      const a = [0, -20, 18, -10, 24, -26][i % 6];
      return pointe(no(a, z, 0.96), [Math.sin(a * D) * 2.2, 0.9, -0.75], [0, 0.6, 1], 0.075, [0.42, 0.34, 0.38][i % 3], 0.02, i % 3 ? "leaf_dark" : "leaf", { fine: i % 3 === 1 });
    }),
    // vrilles nourricières
    ...([[0.5, 0.2, 0.06], [0.46, -0.86, -0.16]] as Vec3[]).flatMap(([x, z, dz]): Part[] => {
      const path: Vec3[] = [[x * 0.8, 0.62, z], [x + 0.18, 0.56, z + dz], [x + 0.22, 0.36, z + dz], [x + 0.14, 0.22, z + dz * 1.4]];
      return [
        { shape: "tube", radius: 0.04, sides: 3, path, bend: 0, color: "rust", mirror: true, fine: z < 0 },
        bille(0.08, add(path[3], [0, -0.04, 0]), [0.9, 1.4, 0.9], "acid", { mirror: true, fine: z < 0 }),
      ];
    }),
    // collerette et masque
    bille(0.32, [0, 0.84, 0.36], [0.95, 0.95, 1.1], "leaf_dark"),
    ...[-128, -77, -26, 26, 77, 128].map((a): Part => {
      const r = unit([Math.sin(a * D), Math.cos(a * D), -0.34]);
      const t: Vec3 = [Math.cos(a * D), -Math.sin(a * D), 0];
      return { shape: "extrude", profile: [[0, -0.1], [0.24, -0.24], [0.46, -0.2], [0.54, 0], [0.46, 0.2], [0.24, 0.24], [0, 0.1]], depth: 0.045, pos: add(COLL, r, 0.08), rot: eul(frame(r, t)), color: "faction" };
    }),
    ...[-102, -51, 0, 51, 102].map((a): Part => {
      const r = unit([Math.sin(a * D), Math.cos(a * D), -0.34]);
      return epine(add(add(COLL, r, 0.1), [0, 0, 0.02]), r, 0.035, 0.6, "black", { fine: a % 102 !== 0 }, 3);
    }),
    blob(0.22, [0, 0.9, 0.64], [0.82, 1.15, 1.15], "dry"),
    yeux(0.1, 1.02, 0.84, 0.04),
    yeux(0.15, 0.9, 0.8, 0.032, "amber", { fine: true }),
    ...([[0.04, 0.06], [0.12, 0.1]] as [number, number][]).map(([x, d], i): Part => ({ shape: "tube", radius: 0.028, sides: 3, path: [[x, 0.72, 0.76], [x + d, 0.52, 0.9], [x + d * 0.8, 0.3, 0.84 - i * 0.05]], bend: 0, color: "rust", mirror: true, fine: i === 1 })),
    ...pattes(sixPattes([[0.3, 0.66, 0.34], [0.42, 0.62, -0.1], [0.4, 0.62, -0.6]], [-44, 0, 34], [[30, 0.4], [-74, 0]], 0.075, "black", "rust", "dry")),
  ],
};

// frelon : chasseur ailé. Thorax de chitine, taille étranglée, abdomen de guêpe cerclé aux couleurs d'équipe,
// recourbé sur un long dard d'os ; deux paires d'ailes étroites rejetées en flèche, nervurées de sève ; tête aux
// énormes yeux composés lumineux, antennes, mandibules ; pattes repliées sous le thorax
/** Aile du frelon (côté droit, symétrique) : contour (x, z) posé à plat puis relevé de `up` degrés, racine en `org`. */
function aileFrelon(org: Vec3, c: Prof, up: number, nerv: [number, number][], lead: [number, number][], fine = false): Part[] {
  const m = Rz(up);
  const at = (x: number, z: number, y = 0): Vec3 => add(org, app(m, [x, y, z]));
  return [
    { shape: "extrude", profile: c, depth: 0.025, pos: org, rot: eul(mul(m, Rx(90))), color: "leaf_dark", mirror: true },
    { shape: "tube", radius: 0.036, sides: 4, path: lead.map(([x, z]) => at(x, z, 0.015)), bend: 0, color: "black", mirror: true, fine },
    ...nerv.map(([x, z]): Part => ({ shape: "tube", radius: 0.016, sides: 3, path: [at(0.06, 0.02, 0.02), at(x * 0.55, z * 0.42, 0.02), at(x, z, 0.02)], bend: 0, color: "acid", mirror: true, fine: true })),
  ];
}
/** Anneaux de l'abdomen : centre, rayon arrière, rayon avant, longueur, tangage (négatif : pointe vers l'arrière et le bas). */
const FR: [Vec3, number, number, number, number, ColorName][] = [
  [[0, 0.1, -0.42], 0.22, 0.08, 0.26, 4, "black"],
  [[0, 0.1, -0.62], 0.29, 0.17, 0.28, -4, "faction"],
  [[0, 0.06, -0.84], 0.29, 0.22, 0.28, -14, "black"],
  [[0, -0.02, -1.06], 0.24, 0.23, 0.28, -24, "faction"],
  [[0, -0.14, -1.25], 0.15, 0.19, 0.26, -36, "black"],
];
const hornet: Model = {
  parts: [
    // thorax et taille
    blob(0.27, [0, 0.04, 0.16], [0.95, 0.95, 1.25], "black"),
    plaque(0.22, [0, 0.26, 0.2], [0, 1, 0.1], [0, 0, 1], [1.05, 0.35, 1.3], "faction"),
    { shape: "cylinder", sides: 5, radius: 0.12, radiusTop: 0.07, height: 0.3, pos: [0, 0.07, -0.2], rot: [-90, 0, 0], color: "black" },
    // abdomen cerclé et dard
    ...FR.map(([p, r0, r1, l, t, c]): Part => ({ shape: "lathe", sides: 10, profile: [[0, -l * 0.5], [r0 * 0.8, -l * 0.5], [r0, -l * 0.36], [(r0 + r1) / 2 + 0.02, l * 0.1], [r1, l * 0.5]].map(([a, b]): [number, number] => [r3(a), r3(b)]), pos: p, rot: [90 + t, 0, 0], color: c })),
    ...[1, 3].map((i): Part => bille(0.08, add(FR[i][0], [0.18, -0.16, 0]), [0.8, 0.8, 1.2], "acid", { mirror: true, fine: true })),
    ...effile([[0, -0.2, -1.32], [0, -0.36, -1.52], [0, -0.6, -1.66]], 0.1, 0.06, "black", {}, "dry", 5),
    ...([[0.38, -0.66], [0.33, -0.92], [0.22, -1.14]] as [number, number][]).map(([y, z], i): Part => epine([0, y, z], [0, 1, -0.8 - i * 0.3], 0.045, 0.24, "dry", { fine: i === 2 })),
    // ailes
    ...aileFrelon([0.14, 0.18, 0.28], [[0, 0.1], [0.5, 0.02], [1.1, -0.34], [1.55, -0.86], [1.72, -1.24], [1.4, -1.04], [0.9, -0.72], [0.4, -0.36], [0, -0.14]], 14, [[1.5, -0.98], [1.0, -0.66]], [[0, 0.08], [0.5, 0.01], [1.1, -0.35], [1.55, -0.87], [1.72, -1.24]]),
    ...aileFrelon([0.13, 0.13, 0.02], [[0, 0.06], [0.36, -0.08], [0.72, -0.46], [0.92, -0.96], [0.92, -1.24], [0.68, -1.0], [0.42, -0.68], [0.18, -0.36], [0, -0.16]], 4, [[0.8, -0.96]], [[0, 0.04], [0.36, -0.09], [0.72, -0.47], [0.92, -0.97], [0.92, -1.24]], true),
    // taches d'équipe au bout des ailes
    { shape: "extrude", profile: [[0.74, -0.14], [1.1, -0.35], [1.55, -0.87], [1.7, -1.2], [1.3, -0.82], [0.9, -0.42]], depth: 0.045, pos: [0.14, 0.18, 0.28], rot: eul(mul(Rz(14), Rx(90))), color: "faction", mirror: true },
    // tête
    blob(0.17, [0, 0.0, 0.56], [0.95, 0.95, 1.05], "black"),
    blob(0.13, [0.125, 0.06, 0.62], [0.75, 1.1, 1.15], "amber", { mirror: true, rot: [0, -20, 0] }),
    ...effile([[0.06, 0.13, 0.66], [0.16, 0.24, 0.86], [0.28, 0.2, 1.08]], 0.024, 0.016, "black", { mirror: true, fine: true }, undefined, 4),
    bille(0.05, [0, -0.1, 0.72], [1.2, 0.8, 0.8], "acid", { fine: true }),
    lame([0.07, -0.08, 0.66], [0.25, -0.3, 1], [-1, 0, 0], 0.32, 0.11, 0.5, 0.04, "dry", { mirror: true }),
    // pattes repliées
    ...[0.32, 0.12, -0.04].map((z, i): Part => ({ shape: "tube", radius: 0.028, sides: 3, path: [[0.12, -0.1, z], [0.3, -0.16, z + 0.08 - i * 0.08], [0.2, -0.34, z - 0.16], [0.14, -0.44, z - 0.34]], bend: 0, color: "black", mirror: true, fine: i > 0 })),
  ],
};

// =====================================================================================================
// Murène (navale)
// =====================================================================================================

// murène : serpent de mer. Corps en anneaux qui ondule (pivots « ondule2 » à « ondule7 », de la nuque vers la
// queue) et dont les boucles crèvent la surface (y = 0) : fût de chair sombre, écaille dorsale en alternance
// équipe et chitine, voile dorsale dentelée d'équipe à rayons d'os, points de sève aux flancs ; cou dressé ;
// tête (pivot « tourelle ») à longues mâchoires béantes hérissées de crocs, gorge lumineuse, crête dressée,
// ouïes lumineuses ; nageoire caudale en faux
/** Ligne du corps : centre de chaque anneau (x, y, z) et rayon, de la nuque vers la queue. */
const MU: [Vec3, number][] = [
  [[0.0, 0.42, 1.36], 0.56], [[0.16, -0.22, 0.78], 0.64], [[0.3, 0.12, 0.06], 0.68], [[0.18, 0.42, -0.66], 0.66],
  [[-0.12, 0.0, -1.34], 0.59], [[-0.26, -0.24, -1.98], 0.49], [[-0.1, 0.06, -2.56], 0.37],
];
/** Repère d'un anneau : x = côté, y = vers l'avant du corps, z = vers le ventre. */
function repere(k: number): { m: M3; t: Vec3; n: Vec3 } {
  const a = MU[Math.max(0, k - 1)][0], b = MU[Math.min(MU.length - 1, k + 1)][0];
  const t = unit(sub(a, b));
  const X = unit([t[2], 0, -t[0]]);
  const n: Vec3 = [t[1] * X[2] - t[2] * X[1], t[2] * X[0] - t[0] * X[2], t[0] * X[1] - t[1] * X[0]];
  return { m: [X[0], t[0], -n[0], X[1], t[1], -n[1], X[2], t[2], -n[2]], t, n };
}
function anneau(k: number): Part[] {
  const [p, r] = MU[k];
  const { m, t, n } = repere(k);
  const name = k > 0 ? { pivot: `ondule${k + 1}` } : {};
  const port = k > 0 ? { parent: `ondule${k + 1}` } : {};
  const L = 0.9;
  const arc = (A: number): M3 => mul(m, Ry(180 - A / 2));
  const f = frame(t, n);
  const s = r / 0.55;
  return [
    { shape: "lathe", sides: 10, profile: [[0, -L * 0.54], [r * 0.82, -L * 0.52], [r, -L * 0.38], [r * 0.82, L * 0.5]].map(([a, b]): [number, number] => [r3(a), r3(b)]), pos: p, rot: eul(m), color: "leaf_dark", ...name },
    { shape: "lathe", sides: 6, arc: 150, profile: [[r * 0.94, -L * 0.6], [r * 1.12, -L * 0.6], [r * 1.07, -0.02], [r * 0.9, L * 0.5]].map(([a, b]): [number, number] => [r3(a), r3(b)]), pos: p, rot: eul(arc(150)), color: k % 2 ? "black" : "faction", ...port },
    // voile dorsale et son rayon d'os
    { shape: "extrude", profile: [[0.42, 0], [0.1, 0.3 * s], [-0.3, 0.62 * s], [-0.62, 0.7 * s], [-0.44, 0.34 * s], [-0.5, 0]].map(([a, b]): [number, number] => [r3(a), r3(b + r * 0.94)]), depth: 0.06, pos: p, rot: eul(f), color: k % 2 ? "faction" : "rust", ...port },
    epine(add(p, app(f, [0.16, r * 0.98, 0])), app(f, [-0.8, 0.78, 0]), 0.06 * s, r3(1.04 * s), "dry", { ...port, fine: true }, 4),
    ...([1, -1] as const).map((c): Part => bille(0.09 * s, add(p, app(f, [-0.02, r * 0.42, c * r * 0.92])), [0.7, 0.7, 1.3], "acid", { ...port, fine: true })),
  ];
}
const MT: Vec3 = [0, 1.2, 1.72];
const moray: Model = {
  parts: [
    ...MU.flatMap((_, k) => anneau(k)),
    // queue en faux, portée par le dernier anneau
    ...effile([MU[6][0], [0.02, 0.16, -3.06], [0.04, 0.26, -3.34]], 0.32, 0.17, "black", { parent: "ondule7" }, undefined, 6),
    aileron([0.02, 0.14, -2.98], [[0.2, 0.08], [-0.24, 0.5], [-0.66, 1.04], [-0.6, 0.5], [-0.54, 0.12], [-0.64, -0.32], [-0.2, -0.18], [0.2, -0.14]], 0.07, "faction", { parent: "ondule7" }),
    epine([0.02, 0.22, -2.86], [0, 0.85, -0.62], 0.07, 1.12, "dry", { parent: "ondule7" }, 4),
    // cou dressé
    { shape: "lathe", sides: 10, profile: [[0.56, -0.42], [0.56, -0.1], [0.47, 0.3], [0.4, 0.5]], pos: [0, 0.82, 1.5], rot: [28, 0, 0], color: "leaf_dark" },
    ...[0.62, 0.86].map((y, i): Part => bille(0.12, [0.47 - i * 0.04, y, 1.72 + i * 0.02], [0.45, 1.0, 0.6], "acid", { mirror: true, rot: [28, 0, 0], fine: i > 0 })),
    { shape: "lathe", sides: 6, arc: 150, profile: [[0.56, -0.46], [0.62, -0.44], [0.6, -0.1], [0.5, 0.3], [0.42, 0.5]], pos: [0, 0.82, 1.5], rot: eul(mul(Rx(28), Ry(105))), color: "black" },
    // tête : crâne, museau, mâchoire ouverte
    bille(0.4, MT, 1, "leaf_dark", { pivot: "tourelle" }),
    blob(0.44, [0, 1.42, 2.1], [0.92, 0.78, 1.3], "black", { parent: "tourelle" }),
    blob(0.32, [0, 1.46, 2.72], [0.82, 0.55, 1.5], "black", { parent: "tourelle" }),
    plaque(0.36, [0, 1.72, 2.2], [0, 1, 0.12], [0, 0, 1], [0.9, 0.3, 1.5], "faction", { parent: "tourelle" }),
    blob(0.3, [0, 0.96, 2.52], [0.86, 0.42, 1.95], "black", { parent: "tourelle", rot: [20, 0, 0] }),
    bille(0.3, [0, 1.2, 2.18], [1.0, 0.8, 1.1], "rust", { parent: "tourelle", fine: true }),
    bille(0.2, [0, 1.2, 2.42], [1.1, 0.8, 0.9], "acid", { parent: "tourelle" }),
    // crocs : deux rangs et les grands crochets du bout
    ...[2.5, 2.72, 2.92].map((z, i): Part => epine([0.2 - i * 0.025, 1.36, z], [0.1, -1, 0.1], 0.05, 0.3, "dry", { parent: "tourelle", mirror: true, fine: i !== 1 }, 4)),
    epine([0.09, 1.38, 3.1], [0, -1, 0.15], 0.06, 0.42, "dry", { parent: "tourelle", mirror: true }, 4),
    ...[2.4, 2.64, 2.86].map((z, i): Part => epine([0.2 - i * 0.02, 1.0 - i * 0.07, z], [0.15, 1, 0.05], 0.05, 0.28, "dry", { parent: "tourelle", mirror: true, fine: i !== 1 }, 4)),
    epine([0.07, 0.8, 3.02], [0, 1, 0.3], 0.055, 0.38, "dry", { parent: "tourelle", mirror: true }, 4),
    // yeux sous des arcades d'os
    bille(0.075, [0.3, 1.6, 2.42], 1, "amber", { parent: "tourelle", mirror: true }),
    epine([0.27, 1.66, 2.5], [0.5, 0.45, -1], 0.08, 0.55, "dry", { parent: "tourelle", mirror: true }, 4),
    ...[[0.36, 1.3, 1.9], [0.34, 1.1, 1.96]].map((p, i): Part => epine(p as Vec3, [0.8, -0.1 - i * 0.3, -0.8], 0.07, 0.5, "dry", { parent: "tourelle", mirror: true, fine: i > 0 }, 4)),
    // crête dressée de la nuque
    aileron([0, 1.66, 2.0], [[0.46, 0.06], [0.2, 0.36], [-0.2, 0.74], [-0.26, 0.48], [-0.66, 0.7], [-0.58, 0.36], [-0.86, 0.3], [-0.5, -0.1], [0.0, -0.1]], 0.06, "faction", { parent: "tourelle" }),
    ...([[0.3, 0.2, 0.62, 0.62], [0.05, 0.1, 0.9, 0.7], [-0.15, -0.02, 0.9, 0.42]] as [number, number, number, number][]).map(([z, , L, u], i): Part => epine([0, 1.66, 2.0 + z - 0.1], [0, u, -0.62 - i * 0.1], 0.05, L, "dry", { parent: "tourelle", fine: true }, 4)),
  ],
};

// =====================================================================================================
// Léviathan (géant amphibie)
// =====================================================================================================

// léviathan : monstre marin qui nage et se hisse à terre. Coque de chair sombre au ventre bas, dos blindé de
// grandes voûtes de chitine sous une échine de boucliers d'équipe à épines d'os, récif incrusté sur les flancs
// (coraux d'os, balanes à bouche lumineuse), ouïes lumineuses ; quatre longues nageoires-pattes à bord d'attaque
// de chitine (pivots « jambe… ») ; queue à large palme ; tête (pivot « tourelle ») aussi large que le corps :
// mâchoire inférieure en pelle hérissée de défenses, gueule lumineuse, frontal d'équipe, quatre yeux, deux leurres
const LE: Prof = [[0, -3.3], [0.55, -3.1], [1.1, -2.3], [1.55, -1.2], [1.75, -0.1], [1.7, 0.9], [1.4, 1.8], [1.05, 2.3]];
const LE0: Vec3 = [0, 1.12, 0];
const LEY = 0.7;
/** Rayon de la coque à l'abscisse z. */
const leR = (z: number): number => {
  for (let i = 1; i < LE.length; i++) if (z <= LE[i][1]) return LE[i - 1][0] + ((LE[i][0] - LE[i - 1][0]) * (z - LE[i - 1][1])) / (LE[i][1] - LE[i - 1][1]);
  return LE[LE.length - 1][0];
};
/** Point du dos du léviathan : angle `a` depuis le haut, abscisse z, décalé de `off`. */
const le = (a: number, z: number, off = 0): Vec3 => V(Math.sin(a * D) * (leR(z) + off), LE0[1] + Math.cos(a * D) * (leR(z) + off) * LEY, z);
const leN = (a: number): Vec3 => [Math.sin(a * D), Math.cos(a * D), 0];
/**
 * Nageoire-patte (pivot `name` à la hanche) : bras court de chitine, longue palme `s` fois agrandie couchée vers
 * l'arrière de `back` degrés, posée au sol par sa pointe, bord d'attaque en os et deux rayons.
 */
function nageoire(name: string, side: 1 | -1, hip: Vec3, yaw: number, back: number, s: number): Part[] {
  const X = (v: Vec3): Vec3 => [v[0] * side, v[1], v[2]];
  const p1: Vec3 = V(hip[0] + Math.cos(yaw * D) * 0.6 * s, hip[1] + 0.16 * s, hip[2] - Math.sin(yaw * D) * 0.6 * s);
  const p2: Vec3 = V(p1[0] + Math.cos(yaw * D) * 0.4 * s, hip[1] - 0.2 * s, p1[2] - Math.sin(yaw * D) * 0.4 * s);
  const [h, k, w] = [hip, p1, p2].map(X);
  const ay = (yaw + back) * D;
  const drop = Math.asin(Math.min(0.6, Math.max(0.02, (w[1] - 0.06) / (2.0 * s))));
  const f = X([Math.cos(ay) * Math.cos(drop), -Math.sin(drop), -Math.sin(ay) * Math.cos(drop)]);
  const m = frame(f, X([-Math.sin(ay), 0.1, -Math.cos(ay)]));
  const at = (x: number, y: number): Vec3 => add(w, app(m, [x * s, y * s, 0]));
  const palme: Prof = [[-0.15, -0.3], [0.5, -0.5], [1.15, -0.44], [1.7, -0.16], [2.02, 0.3], [1.62, 0.3], [1.36, 0.6], [1.06, 0.44], [0.8, 0.72], [0.45, 0.52], [-0.1, 0.34]];
  return [
    bille(0.42 * s, h, 1, "leaf_dark", { pivot: name }),
    { shape: "tube", radius: r3(0.27 * s), sides: 6, path: [h, k, w], bend: 0, color: "black", parent: name },
    plaque(0.42 * s, add(k, [0, 0.16 * s, 0]), [0.35 * side, 1, 0], sub(w, h), [0.9, 0.35, 1.2], "faction", { parent: name }),
    epine(add(k, [0, 0.24 * s, 0]), X([0.5, 1, -0.6]), 0.13 * s, 0.6 * s, "dry", { parent: name, fine: true }),
    { shape: "extrude", profile: palme.map(([a, q]): [number, number] => [r3(a * s), r3(q * s)]), depth: r3(0.07 * s), pos: w, rot: eul(m), color: "rust", parent: name },
    ...effile([at(-0.1, -0.1), at(1.0, -0.44), at(2.2, 0.3)], 0.19 * s, 0.12 * s, "black", { parent: name }, "dry", 5),
    ...([[1.5, 0.66], [0.86, 0.8]] as [number, number][]).map(([x, y]): Part => {
      const d = sub(at(x, y), w);
      return epine(w, d, 0.1 * s, r3(Math.hypot(...d)), "dry", { parent: name, fine: true }, 4);
    }),
  ];
}
/** Balane (évent) : petit cratère à bouche lumineuse, dressé selon `d`. */
const balane = (p: Vec3, d: Vec3, r: number, h: number, extra: Partial<Part> = {}, color: ColorName = "wood", sides = 5): Part[] => [
  { shape: "lathe", sides, profile: [[r * 1.25, -h * 0.25], [r, h * 0.45], [r * 0.66, h], [r * 0.42, h * 0.9]].map(([a, b]): [number, number] => [r3(a), r3(b)]), pos: p, rot: along(d), color, ...extra },
  bille(r * 0.56, add(p, unit(d), h * 0.86), [1, 0.5, 1], "acid", { rot: along(d), ...extra }),
];
const LT: Vec3 = [0, 1.2, 2.2];
const leviathan: Model = {
  parts: [
    // coque au ventre bas
    { shape: "lathe", sides: 12, profile: LE, pos: LE0, rot: [90, 0, 0], scale: [1, 1, LEY], color: "leaf_dark" },
    // voûtes de chitine
    ...[1.1, -0.15, -1.4].map((z, i): Part => {
      const r = leR(z) + 0.14;
      return voute(V(0, LE0[1] - 0.02, z), [[r * 0.9, -0.66], [r * 1.03, -0.68], [r * 1.02, 0], [r * 0.9, 0.56]].map(([a, b]): [number, number] => [r3(a), r3(b)]), LEY + 0.03, "black", {}, [6, 0, -6][i], 10);
    }),
    // échine : boucliers d'équipe et épines
    ...[1.5, 0.36, -0.82, -2.0].map((z, i): Part => {
      const k = [0.92, 1.06, 0.98, 0.8][i];
      return plaque(k, add(le(0, z, 0.16), [0, [0.02, 0.02, 0.04, 0.14][i], 0]), [0, 1, [0.2, 0, -0.16, -0.36][i]], [0, 0, 1], [1.0, 0.24, 0.8], "faction");
    }),
    ...[0.96, -0.2, -1.34, -2.3].map((z, i): Part => epine(le(0, z, 0.16), [0, 1, -0.7], [0.17, 0.19, 0.17, 0.13][i], [0.9, 1.2, 1.0, 0.7][i], "dry")),
    // récif : boucliers latéraux, coraux, balanes
    ...([[48, 0.95, 0.52], [46, -0.35, 0.56], [48, -1.5, 0.42]] as [number, number, number][]).map(([a, z, r], i): Part => plaque(r, le(a, z, 0.16), leN(a), [0, 0, 1], [0.9, 0.3, 1.1], i === 1 ? "faction" : "wood", { mirror: true, fine: i === 2 })),
    ...([[46, 0.34, 0.26, 0.56], [44, -0.98, 0.22, 0.5]] as [number, number, number, number][]).flatMap(([a, z, r, h]) => balane(le(a, z, 0.1), add(leN(a), [0, 0.3, -0.25]), r, h, { mirror: true, fine: z < 0 })),
    ...([[64, 1.0], [62, -1.2]] as [number, number][]).flatMap(([a, z], i): Part[] => {
      const q = le(a, z, 0.08);
      return [
        epine(q, [0.7, 1, -0.2], 0.11, 0.85, "dry", { mirror: true, fine: i > 0 }, 4),
        epine(q, [1, 0.35, 0.35], 0.09, 0.6, "dry", { mirror: true, fine: true }, 4),
      ];
    }),
    // ouïes lumineuses
    ...[1.66, 2.02].map((z): Part => bille(0.3, V(leR(z) * 0.97, 1.08, z), [0.25, 1.1, 0.4], "acid", { mirror: true, rot: [20, 0, 0], fine: z > 2 })),
    // queue et palme
    ...effile([[0, 1.1, -2.9], [0, 0.84, -3.6], [0, 0.6, -4.2]], 0.66, 0.36, "leaf_dark", {}, "black", 8),
    plaque(0.52, [0, 1.62, -3.1], [0, 1, -0.5], [0, 0.5, 1], [0.95, 0.32, 1.0], "faction"),
    { shape: "extrude", profile: [[0, 0.5], [0.6, 0.12], [1.35, -0.2], [1.85, -0.8], [1.3, -0.62], [0.85, -0.86], [0.45, -0.56], [0, -0.7]], depth: 0.09, pos: [0, 0.62, -3.9], rot: eul(mul(Rx(6), Rx(90))), color: "rust", mirror: true },
    ...[[1.9, -0.75], [0.9, -0.95]].map(([x, z], i): Part => epine([0.05, 0.64, -3.75], [x, -0.08, z - 0.15], 0.13, r3(Math.hypot(x, z + 0.15) + 0.2 - i * 0.1), "dry", { mirror: true }, 4)),
    // nageoires-pattes
    ...nageoire("jambe_av_d", 1, [1.42, 0.92, 1.1], -14, 52, 1.16),
    ...nageoire("jambe_av_g", -1, [1.42, 0.92, 1.1], -14, 52, 1.16),
    ...nageoire("jambe_ar_d", 1, [1.2, 0.86, -1.6], 22, 30, 0.82),
    ...nageoire("jambe_ar_g", -1, [1.2, 0.86, -1.6], 22, 30, 0.82),
    // tête : nuque, crâne, frontal, museau
    blob(1.0, LT, [1.08, 0.82, 0.8], "leaf_dark", { pivot: "tourelle" }),
    blob(1.15, [0, 1.74, 3.0], [1.0, 0.5, 1.08], "black", { parent: "tourelle" }),
    plaque(0.95, [0, 2.14, 2.74], [0, 1, 0.14], [0, 0, 1], [1.0, 0.28, 1.0], "faction", { parent: "tourelle" }),
    plaque(0.52, [0, 2.1, 3.72], [0, 1, 0.55], [0, -0.5, 1], [1.2, 0.42, 1.05], "dry", { parent: "tourelle" }),
    epine([0, 2.2, 3.66], [0, 1, 0.5], 0.17, 0.75, "dry", { parent: "tourelle" }),
    // mâchoire inférieure en pelle, gueule lumineuse
    { shape: "lathe", sides: 11, profile: [[0.1, -0.46], [0.66, -0.42], [1.06, -0.06], [1.2, 0.42], [1.1, 0.5]], pos: [0, 0.72, 2.98], scale: [1.04, 1, 1.36], color: "black", parent: "tourelle" },
    bille(0.95, [0, 0.92, 2.98], [1.08, 0.3, 1.32], "rust", { parent: "tourelle" }),
    bille(0.72, [0, 1.26, 2.9], [1.2, 0.42, 1.3], "acid", { parent: "tourelle" }),
    // défenses et crocs
    ...([[15, 1.15, 0.17], [40, 0.8, 0.14], [64, 0.66, 0.13], [86, 0.5, 0.12]] as [number, number, number][]).map(([a, h, r], i): Part => epine(V(Math.sin(a * D) * 1.18, 1.08, 2.96 + Math.cos(a * D) * 1.54), [Math.sin(a * D) * 0.4, 1, Math.cos(a * D) * 0.2], r, h, "dry", { parent: "tourelle", mirror: true, fine: i === 2 })),
    ...[[0.2, 4.06], [0.56, 3.82], [0.84, 3.4]].map(([x, z], i): Part => epine([x, 1.62, z], [0.1, -1, 0.1], 0.12, 0.56 - i * 0.06, "dry", { parent: "tourelle", mirror: true, fine: i === 1 }, 4)),
    // yeux et arcades
    bille(0.16, [0.8, 1.98, 3.36], 1, "amber", { parent: "tourelle", mirror: true }),
    bille(0.12, [0.98, 1.84, 2.98], 1, "amber", { parent: "tourelle", mirror: true, fine: true }),
    epine([0.72, 2.08, 3.3], [0.8, 0.5, -1], 0.18, 1.0, "dry", { parent: "tourelle", mirror: true }),
    epine([1.06, 1.44, 2.6], [1, 0.1, -0.6], 0.2, 1.0, "dry", { parent: "tourelle", mirror: true }),
    // leurres de sève
    ...corne([[0.4, 2.2, 2.8], [0.66, 3.0, 3.0], [0.74, 3.2, 3.8], [0.66, 2.86, 4.3]], 0.07, 1, "black", { parent: "tourelle", mirror: true, fine: true }, undefined, 0.3),
    bille(0.2, [0.66, 2.76, 4.3], [1, 1.2, 1], "acid", { parent: "tourelle", mirror: true, fine: true }),
  ],
};

// =====================================================================================================
// Béhémoth (expérimentale)
// =====================================================================================================

// béhémoth : la plus grande bête de l'essaim, sortie d'un cocon. Quatre jambes-piliers aux genoux d'os portent un
// corps de chair sous une montagne de grandes écailles dressées (équipe et chitine), d'où percent des cheminées à
// spores lumineuses ; devant, un torse dressé (pivot « tourelle ») à cage de côtes sur un cœur de sève, épaulières
// d'équipe, deux bras-faux d'os gigantesques qui se referment devant lui, deux petits bras griffus, tête basse à
// collerette d'équipe, gueule lumineuse à mandibules multiples
const BE0: Vec3 = [0, 2.35, -1.5];
const BEM = Rx(-12);
/** Point de la montagne : rayon, angle (0 : avant), hauteur au-dessus de son pied. */
const be = (r: number, a: number, y: number): Vec3 => add(BE0, app(BEM, pol(r, a, y)));
const beD = (r: number, a: number, y: number): Vec3 => app(BEM, pol(r, a, y));
/** Corps : profil (rayon, z) autour de `BC`, écrasé de `BCY` en hauteur. */
const BC: Vec3 = [0, 2.4, -1.4];
const BCY = 0.84;
const BCP: Prof = [[0, -2.4], [0.8, -2.2], [1.45, -1.5], [1.78, -0.4], [1.7, 0.8], [1.4, 1.7], [1.0, 2.5]];
/** Jambe-pilier (pivot `name` à la hanche) : cuisse à plaque d'équipe, genou à ergot d'os, tibia à arête, pied griffu. */
function pilier(name: string, side: 1 | -1, hip: Vec3, knee: Vec3, foot: Vec3, r: number): Part[] {
  const X = (v: Vec3): Vec3 => [v[0] * side, v[1], v[2]];
  const [h, k, p] = [hip, knee, foot].map(X);
  const thigh = sub(k, h), shin = sub(p, k);
  const lt = Math.hypot(...thigh), ls = Math.hypot(...shin);
  const out: Vec3 = X([1, 0.25, 0]);
  const fw = Math.atan2(foot[0] - hip[0], foot[2] - hip[2]);
  return [
    bille(r * 1.4, h, 1, "rust", { pivot: name }),
    { shape: "cylinder", sides: 7, radius: r3(r * 1.2), radiusTop: r3(r * 0.85), height: r3(lt), pos: add(h, thigh, 0.5), rot: along(thigh), color: "black", parent: name, smooth: true },
    plaque(r * 1.6, add(add(h, thigh, 0.62), out, r * 0.6), add(out, [0, 1.1, 0]), thigh, [0.95, 0.34, 1.15], "faction", { parent: name }),
    bille(r * 1.0, k, 1, "black", { parent: name }),
    epine(add(k, unit(thigh), r * 0.5), add(unit(thigh), [0, 0.5, 0]), r * 0.55, r * 2.6, "dry", { parent: name }),
    { shape: "cylinder", sides: 7, radius: r3(r * 0.9), radiusTop: r3(r * 0.55), height: r3(ls), pos: add(k, shin, 0.5), rot: along(shin), color: "black", parent: name, smooth: true },
    plaque(r * 1.05, add(add(k, shin, 0.36), out, r * 0.66), out, shin, [0.85, 0.34, 1.6], "dry", { parent: name }),
    bille(0.12, add(add(k, shin, 0.76), out, r * 0.56), [1, 1.6, 1], "acid", { parent: name, fine: true }),
    bille(r * 0.85, add(p, [0, r * 0.35, 0]), [1.15, 0.75, 1.15], "rust", { parent: name, fine: true }),
    ...[-62, 0, 62, 180].map((da, i): Part => {
      const a = fw + da * D;
      const d: Vec3 = [Math.sin(a) * side, -0.32, Math.cos(a)];
      const from = add(p, [Math.sin(a) * side * r * 0.25, r * 0.4, Math.cos(a) * r * 0.25]);
      return epine(from, d, r * 0.46, i === 3 ? r * 1.2 : r * 1.75, "dry", { parent: name });
    }),
  ];
}
/** Cheminée à spores : tronc noueux à lèvres évasées, bouche lumineuse, spore au bord. */
function cheminee(a: number, r0: number, y: number, tilt: number, r: number, h: number, fine = false): Part[] {
  const p = be(r0, a, y);
  const d = beD(tilt, a, 1);
  const at = (t: number): Vec3 => add(p, unit(d), t * h);
  return [
    { shape: "lathe", sides: 7, profile: [[r * 1.45, -h * 0.1], [r * 0.95, h * 0.42], [r * 1.1, h * 0.5], [r * 0.82, h * 0.8], [r * 1.12, h], [r * 0.7, h * 0.94]].map(([x, z]): [number, number] => [r3(x), r3(z)]), pos: p, rot: along(d), color: "rust", fine },
    bille(r * 0.86, at(0.95), [1, 0.5, 1], "acid", { rot: along(d), fine }),
    bille(r * 0.4, add(at(1.06), [r * 0.3, 0, r * 0.2]), 1, "acid", { fine: true }),
  ];
}
/** Contour d'une longue faux : base en x = 0, pointe en x = L, tranchant vers +y. */
function grandeFaux(L: number, W: number, curve: number, n = 6): Prof {
  const top: Prof = [], bot: Prof = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = curve * L * t * t;
    const w = (W / 2) * Math.pow(1 - t, 0.75) * (0.72 + 0.5 * Math.sin(Math.PI * t));
    top.push([r3(L * t), r3(y + w * 0.8)]);
    bot.push([r3(L * t), r3(y - w * 1.2)]);
  }
  return [...bot, ...top.slice(0, n).reverse()];
}
/** Bras-faux (porté par la « tourelle ») : bras, coude à éperon, avant-bras, faux d'os géante à dos dentelé. */
function faux(side: 1 | -1): Part[] {
  const X = (v: Vec3): Vec3 => [v[0] * side, v[1], v[2]];
  const ep = X([1.2, 4.1, 1.1]), co = X([2.75, 4.95, 0.5]), po = X([3.2, 4.85, 1.9]);
  const m = frame(X([-0.05, -0.62, 0.8]), X([-0.85, -0.52, -0.25]));
  const L = 3.6;
  const at = (x: number, y: number, z = 0): Vec3 => add(po, app(m, [x, y, z * side]));
  const b = { parent: "tourelle" };
  return [
    ...effile([ep, co, po, add(po, sub(po, co), 0.12)], 0.46, 0.3, "black", b, undefined, 7).slice(0, -1),
    bille(0.52, co, 1, "black", b),
    plaque(0.66, add(add(ep, sub(co, ep), 0.5), [0, 0.3, 0]), X([0.1, 1, -0.2]), sub(co, ep), [0.85, 0.34, 1.15], "faction", b),
    epine(co, X([0.9, 0.35, -0.9]), 0.3, 1.35, "dry", b),
    bille(0.44, po, 1, "rust", b),
    { shape: "extrude", profile: grandeFaux(L, 1.15, 0.24), depth: 0.2, bevel: 0.07, pos: po, rot: eul(m), color: "dry", ...b },
    // dos de chitine dentelé, veine de sève sur le plat
    { shape: "tube", radius: 0.15, sides: 5, path: [at(-0.1, -0.2), at(0.6, -0.56), at(1.4, -0.56), at(2.3, -0.1)], bend: 0, color: "black", ...b },
    { shape: "tube", radius: 0.06, sides: 4, path: [at(0.3, -0.1, -0.1), at(1.1, -0.1, -0.1), at(1.9, 0.12, -0.1), at(2.6, 0.5, -0.09)], bend: 0, color: "acid", ...b },
    ...[0.5, 1.05, 1.6].map((x, i): Part => epine(at(x, -0.56 + i * 0.04), app(m, [-0.55, -1, 0]), 0.15, 0.62 - i * 0.08, "dry", { ...b, fine: i === 1 })),
  ];
}
const BT: Vec3 = [0, 2.9, 1.0];
const behemoth: Model = {
  parts: [
    // corps de chair cerclé de chitine, ventre à poches
    { shape: "lathe", sides: 14, profile: BCP, pos: BC, rot: [90, 0, 0], scale: [1, 1, BCY], color: "rust" },
    ...[2, 4].map((i): Part => ({ shape: "torus", radius: BCP[i][0], tube: 0.17, sides: 12, pos: [0, BC[1], r3(BC[2] + BCP[i][1])], rot: [90, 0, 0], scale: [1, 1, BCY], color: "black" })),
    ...([[0.8, -0.4], [0.86, -1.5], [0.7, -2.5]] as [number, number][]).map(([x, z], i): Part => bille(0.34, [x, 1.28, z], [0.9, 1.1, 1.1], "acid", { mirror: true, fine: i > 0 })),
    // montagne : noyau et deux couronnes d'écailles
    { shape: "lathe", sides: 10, profile: [[1.85, -0.1], [1.75, 0.7], [1.4, 1.6], [0.95, 2.2], [0.5, 2.5]], pos: BE0, rot: eul(BEM), color: "black", smooth: false },
    ...[0, 40, 80, 120, 160, 200, 240, 280, 320].map((a, i): Part => pointe(be(1.7, a + 20, -0.1), beD(0.48, a + 20, 1), beD(1, a + 20, -0.4), 1.0, i % 3 === 1 ? 2.9 : 2.4, 0.55, i % 3 === 1 ? "black" : "faction")),
    ...[0, 60, 120, 180, 240, 300].map((a, i): Part => pointe(be(1.16, a, 0.95), beD(0.32, a, 1), beD(1, a, -0.3), 0.92, 3.0 - (i % 2) * 0.35, 0.5, i % 2 ? "black" : "faction")),
    // sève qui luit entre les écailles, épines d'os
    ...[0, 40, 80, 120, 160, 200, 240, 280, 320].map((a, i): Part => bille(0.3, be(1.82, a, 0.62), [0.7, 1.5, 0.5], "acid", { rot: [0, a, 0], fine: i % 2 === 1 })),
    ...[30, 90, 150, 210, 270, 330].map((a): Part => bille(0.24, be(1.36, a, 1.75), [0.7, 1.4, 0.5], "acid", { rot: [0, a, 0] })),
    ...[40, 120, 200, 280, 320, 80].map((a, i): Part => epine(be(1.75, a, 0.9), beD(1.1, a, 0.8), 0.22, 1.35, "dry", { fine: i > 3 })),
    // cheminées à spores
    ...cheminee(0, 0.05, 2.2, 0.05, 0.46, 2.1),
    ...cheminee(90, 0.72, 1.95, 0.34, 0.36, 1.75),
    ...cheminee(270, 0.72, 1.95, 0.34, 0.36, 1.75),
    ...cheminee(150, 0.85, 1.8, 0.55, 0.3, 1.4),
    ...cheminee(210, 0.85, 1.8, 0.55, 0.3, 1.4, true),
    // queue courte à masse d'épines
    ...effile([[0, 2.2, -3.3], [0, 1.85, -3.9], [0, 1.5, -4.2]], 0.7, 0.5, "black", {}, undefined, 7).slice(0, -1),
    pointe([0, 2.6, -3.35], [0, 0.6, -1], [0, 1, 0.4], 0.8, 1.35, 0.34, "faction"),
    ...([[0, 0.9, -0.8], [0.9, 0.35, -0.6], [-0.9, 0.35, -0.6], [0.5, -0.4, -1], [-0.5, -0.4, -1]] as Vec3[]).map((d, i): Part => epine(add([0, 1.65, -3.95], unit(d), 0.2), d, 0.22, 0.95, "dry", { fine: i > 2 })),
    // jambes
    ...pilier("jambe_av_d", 1, [1.45, 2.5, 0.3], [2.5, 3.05, 0.7], [2.8, 0, 0.95], 0.54),
    ...pilier("jambe_av_g", -1, [1.45, 2.5, 0.3], [2.5, 3.05, 0.7], [2.8, 0, 0.95], 0.54),
    ...pilier("jambe_ar_d", 1, [1.4, 2.4, -2.5], [2.45, 2.9, -2.95], [2.75, 0, -3.15], 0.54),
    ...pilier("jambe_ar_g", -1, [1.4, 2.4, -2.5], [2.45, 2.9, -2.95], [2.75, 0, -3.15], 0.54),
    // torse dressé : taille, poitrail, cœur de sève et côtes
    bille(1.05, BT, [1.05, 0.9, 1], "rust", { pivot: "tourelle" }),
    blob(1.2, [0, 3.75, 1.3], [1.12, 0.95, 0.98], "black", { parent: "tourelle" }),
    bille(0.62, [0, 3.15, 2.05], [1.05, 1.1, 0.6], "acid", { parent: "tourelle" }),
    ...[3.55, 3.05].flatMap((y, i) => corne([[1.0 - i * 0.08, y + 0.12, 1.5], [0.9 - i * 0.04, y - 0.05, 2.2], [0.5, y - 0.2, 2.52], [0.12, y - 0.26, 2.52]], 0.15, 1, "dry", { parent: "tourelle", mirror: true, fine: i === 1 }, undefined, 0.3)),
    // épaules : boucliers d'équipe et épines, échine d'écailles entre les omoplates
    plaque(1.0, [1.15, 4.55, 1.1], [0.75, 1, -0.1], [0, 0, 1], [0.9, 0.36, 1.1], "faction", { parent: "tourelle", mirror: true }),
    ...([[1.35, 4.95, 1.5], [1.45, 4.9, 0.7]] as Vec3[]).map((p, i): Part => epine(p, [0.55, 1, 0.3 - i * 1.0], 0.2, 1.15 - i * 0.2, "dry", { parent: "tourelle", mirror: true, fine: i > 0 })),
    ...([[4.6, 1.75, 1.1], [4.75, 1.15, 1.3], [4.55, 0.55, 1.1]] as Vec3[]).map(([y, z, h], i): Part => pointe([0, y, z], [0, 0.8, -1], [0, 1, 0.6], 0.55, h, 0.3, i === 1 ? "black" : "dry", { parent: "tourelle" })),
    ...faux(1),
    ...faux(-1),
    // petits bras griffus
    { shape: "tube", radius: 0.16, sides: 5, path: [[0.6, 2.85, 1.7], [1.2, 2.45, 2.4], [0.85, 2.15, 3.0]], bend: 0, color: "black", parent: "tourelle", mirror: true, fine: true },
    ...[-0.1, 0.5].map((x): Part => lame([0.85, 2.18, 2.94], [x, -0.35, 1], [-1, -0.4, 0], 0.8, 0.24, 0.4, 0.08, "dry", { parent: "tourelle", mirror: true, fine: true })),
    // tête : cou, crâne, collerette d'équipe
    blob(0.7, [0, 3.85, 2.2], [0.95, 0.9, 1.05], "leaf_dark", { parent: "tourelle" }),
    ...[-84, -42, 0, 42, 84].map((a): Part => {
      const r: Vec3 = [Math.sin(a * D), Math.cos(a * D) + 0.1, -0.5];
      return pointe(add([0, 4.0, 2.55], unit(r), 0.2), r, [0, 0.5, 1], 0.52, 1.5, 0.16, "faction", { parent: "tourelle" });
    }),
    ...[-63, -21, 21, 63].map((a): Part => {
      const r: Vec3 = [Math.sin(a * D), Math.cos(a * D), -0.45];
      return epine(add([0, 4.0, 2.6], unit(r), 0.3), r, 0.14, 1.3, "dry", { parent: "tourelle" });
    }),
    blob(0.72, [0, 3.8, 3.1], [0.95, 0.72, 1.35], "black", { parent: "tourelle" }),
    plaque(0.58, [0, 4.2, 3.2], [0, 1, 0.35], [0, -0.35, 1], [0.95, 0.4, 1.35], "dry", { parent: "tourelle" }),
    epine([0, 4.2, 3.65], [0, 0.9, 1], 0.2, 0.95, "dry", { parent: "tourelle" }),
    yeux(0.46, 4.05, 3.6, 0.13, "amber", { parent: "tourelle" }),
    yeux(0.6, 3.9, 3.3, 0.1, "amber", { parent: "tourelle" }),
    // gueule à mandibules multiples
    bille(0.46, [0, 3.45, 3.6], [1.15, 0.9, 1], "acid", { parent: "tourelle" }),
    ...([[0.56, 3.7, 3.5, 1.35, 0.42], [0.46, 3.36, 3.55, 1.1, 0.36], [0.22, 3.1, 3.5, 0.9, 0.28]] as [number, number, number, number, number][]).map(([x, y, z, L, W], i): Part =>
      lame([x, y, z], [0.45 - i * 0.16, 0.1 - i * 0.32, 1], [-1, 0.25 * i, 0], L, W, 0.5, 0.13, "dry", { parent: "tourelle", mirror: true, fine: i === 2 })),
    epine([0.2, 3.66, 3.95], [0.05, -1, 0.35], 0.1, 0.5, "dry", { parent: "tourelle", mirror: true, fine: true }, 4),
  ],
};

export const SOUCHE_SWARM_MODELS: Record<string, Model> = {
  burster,
  dart,
  burrower,
  nurse,
  hornet,
  moray,
  leviathan,
  behemoth,
};
