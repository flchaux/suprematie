// Mâtin des Transhumants (mastiff) : quadrupède d'assaut bâti de ferraille. Poitrail large de bloc-moteur, dos en
// dos d'âne, arrière-train fin, quatre pattes (pivots « jambe… » à la hanche), tête basse à godet de pelleteuse (pivot
// « tourelle » au cou, mâchoire inférieure en pivot de frappe « coup|… »), oreilles de tôle, queue de chaîne.
// Équipements : arme, châssis, équipement (voir sim/src/ameliorations/table.rs et docs/spec/races.md) ; grammaire des
// pivots « si: », « sauf: », « coup| » : parseCond (generator.ts) et render/entities/units.ts.
// Repère : +x à droite, +y en haut, +z vers l'avant. Les pièces « si: » ne comptent pas dans la taille du modèle.
import type { Part, Vec3 } from "../types.ts";
import { q, voute } from "./commun.ts";
import { flancsMatin, variantesMatin } from "./variantes.ts";

/** Pièces d'un pivot : la première porte le pivot (son origine), les autres le suivent. */
export function porte(pivot: string, axe: Vec3, parts: Part[]): Part[] {
  const coeur: Part = { shape: "box", size: [0.02, 0.02, 0.02], pos: axe, color: "dark", pivot };
  return [coeur, ...parts.map((p): Part => ({ ...p, pivot }))];
}

/** Pièce allongée de `a` à `b` (son axe y suit le segment) : boîte `w` x `d`, ou cylindre de rayon `w`. */
export function entre(a: Vec3, b: Vec3, w: number, d: number, p: Part): Part {
  const v: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(v[0], v[1], v[2]);
  const deg = 180 / Math.PI;
  const pos: Vec3 = [q((a[0] + b[0]) / 2), q((a[1] + b[1]) / 2), q((a[2] + b[2]) / 2)];
  const rot: Vec3 = [q(Math.atan2(v[2], v[1]) * deg), 0, q(Math.asin(-v[0] / len) * deg)];
  if (p.shape === "cylinder" || p.shape === "cone") return { radius: w, height: q(len), ...p, pos, rot };
  return { ...p, size: [w, q(len), d], pos, rot };
}

/** Copie d'une pièce du côté `s` (1 : droite, -1 : gauche) : x et les rotations y, z changent de signe. */
export function cote(s: number, p: Part): Part {
  if (s > 0) return p;
  const o: Part = { ...p };
  if (p.pos) o.pos = [q(-p.pos[0]), p.pos[1], p.pos[2]];
  if (p.rot) o.rot = [p.rot[0], q(-p.rot[1]), q(-p.rot[2])];
  if (p.path) o.path = p.path.map((v): Vec3 => [q(-v[0]), v[1], v[2]]);
  // contour extrudé : il se retourne avec la pièce
  if (p.shape === "extrude" && p.profile) o.profile = p.profile.map(([x, y]): [number, number] => [-x, y]).reverse();
  return o;
}

/** Copies lointaines mises à part : la pièce n'est dessinée que de près. */
const fin = (p: Part): Part => ({ ...p, fine: true });

// ——— Articulations ———
const COU: Vec3 = [0, 1.36, 0.98];
const EPAULE: Vec3 = [0.6, 1.2, 0.6];
const HANCHE: Vec3 = [0.44, 1.2, -0.86];
const GUEULE: Vec3 = [0, 1.18, 1.2];
/** Axe des affûts du garrot. */
const GARROT: Vec3 = [0, 1.74, 0.12];

const PATTES: [string, Vec3, number, boolean][] = [
  ["jambe_av_d", EPAULE, 1, true],
  ["jambe_av_g", EPAULE, -1, true],
  ["jambe_ar_d", HANCHE, 1, false],
  ["jambe_ar_g", HANCHE, -1, false],
];

/** Pattes d'origine : membres de poutrelle, roues d'articulation, grosses pattes à griffes d'acier. */
function patte(avant: boolean): Part[] {
  const [x, y, z] = avant ? EPAULE : HANCHE;
  // coude et cheville : la patte avant est droite et massive, l'arrière repliée en jarret
  const K: Vec3 = avant ? [q(x + 0.06), 0.66, q(z + 0.02)] : [q(x + 0.06), 0.72, q(z + 0.2)];
  const A: Vec3 = avant ? [q(x + 0.06), 0.16, q(z + 0.14)] : [q(x + 0.06), 0.2, q(z - 0.2)];
  const e = avant ? 1 : 0.82;
  return [
    { shape: "cylinder", sides: 10, radius: q(0.27 * e), height: 0.26, pos: [x, y, z], rot: [0, 0, 90], color: "steel" },
    { shape: "cylinder", sides: 6, radius: q(0.13 * e), height: 0.34, pos: [x, y, z], rot: [0, 0, 90], color: "dark", fine: true },
    entre([x, y, z], K, q(0.3 * e), q(0.42 * e), { shape: "box", color: "rust" }),
    { shape: "box", size: [0.05, q(0.42 * e), q(0.34 * e)], pos: [q(x + 0.17 * e), q(y - 0.22), z], color: "faction" },
    { shape: "cylinder", sides: 6, radius: q(0.18 * e), height: q(0.34 * e), pos: K, rot: [0, 0, 90], color: "steel" },
    entre(K, A, q(0.26 * e), q(0.28 * e), { shape: "box", color: "metal" }),
    fin(entre([q(x + 0.06), q(y - 0.1), q(z - 0.2 * e)], [A[0], q(A[1] + 0.2), q(A[2] - 0.16)], 0.045, 0, { shape: "cylinder", sides: 6, color: "copper" })),
    // patte : bloc sombre et trois griffes
    { shape: "box", size: [q(0.4 * e), 0.2, q(0.5 * e)], pos: [A[0], 0.1, q(A[2] + 0.1)], color: "dark" },
    ...[-0.13, 0, 0.13].map((dx): Part => ({ shape: "wedge", size: [0.1, 0.13, 0.2], pos: [q(A[0] + dx * e), 0.065, q(A[2] + 0.1 + 0.32 * e)], color: "steel", fine: dx !== 0 })),
  ];
}

/** Vérins de bond : lames d'acier en arc, gros vérin hydraulique à tige polie, patin large. */
function ressort(avant: boolean): Part[] {
  const [x, y, z] = avant ? EPAULE : HANCHE;
  const X = q(x + 0.16);
  const dz = avant ? 0.1 : -0.06;
  return [
    { shape: "cylinder", sides: 10, radius: 0.28, height: 0.3, pos: [x, y, z], rot: [0, 0, 90], color: "steel" },
    entre([x, y, z], [X, 0.98, q(z + dz)], 0.34, 0.4, { shape: "bevel", bevel: 0.05, color: "faction" }),
    // vérin : corps sombre cerclé, tige polie
    { shape: "cylinder", sides: 6, radius: 0.07, height: 0.86, pos: [X, 0.56, q(z + dz)], color: "light" },
    { shape: "cylinder", sides: 8, radius: 0.17, height: 0.5, pos: [X, 0.74, q(z + dz)], color: "dark" },
    ...[0.54, 0.94].map((h, i): Part => ({ shape: "torus", radius: 0.18, tube: 0.04, sides: 8, pos: [X, h, q(z + dz)], color: "hazard", fine: i === 1 })),
    // lame d'acier arquée vers l'arrière
    { shape: "tube", radius: 0.07, sides: 4, path: [[X, 1.08, q(z + dz - 0.1)], [X, 0.74, q(z + dz - 0.5)], [X, 0.3, q(z + dz - 0.42)], [X, 0.08, q(z + dz)]], bend: 0.24, color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.3, radiusTop: 0.18, height: 0.14, pos: [X, 0.07, q(z + dz)], color: "dark" },
    { shape: "box", size: [0.3, 0.05, 0.62], pos: [X, 0.03, q(z + dz + 0.14)], color: "hazard" },
  ];
}

/** Profil (z, y) du tronc, du poitrail au croupion : dos en dos d'âne. */
const TRONC: [number, number][] = [[-1.2, 1.0], [-0.4, 0.9], [0.2, 0.74], [0.82, 0.7], [1.06, 0.92], [1.06, 1.34], [0.72, 1.62], [0.12, 1.7], [-0.5, 1.56], [-1.2, 1.36]];

/** Godet (profil z, y) de la mâchoire inférieure. */
const GODET: [number, number][] = [[0, -0.06], [0.26, -0.22], [0.66, -0.22], [0.88, -0.02], [0.8, 0.02], [0.62, -0.1], [0.24, -0.08], [0.02, 0.06]];

function corps(): Part[] {
  return [
    // tronc : âme de tôle, poitrail de bloc-moteur, croupe
    { shape: "extrude", profile: TRONC, depth: 0.74, bevel: 0.04, rot: [0, -90, 0], color: "metal" },
    { shape: "bevel", size: [1.28, 0.78, 0.86], pos: [0, 1.12, 0.52], bevel: 0.12, color: "rust" },
    { shape: "box", size: [0.9, 0.54, 0.7], pos: [0, 1.18, -0.16], color: "dark" },
    { shape: "box", size: [0.76, 0.5, 0.54], pos: [0, 1.2, -0.92], color: "rust" },
    // bande du joueur le long de l'échine
    { shape: "box", size: [0.36, 0.06, 0.62], pos: [0, 1.7, 0.4], rot: [8, 0, 0], color: "faction" },
    { shape: "box", size: [0.36, 0.06, 0.66], pos: [0, 1.66, -0.2], rot: [-13, 0, 0], color: "faction" },
    { shape: "box", size: [0.34, 0.06, 0.72], pos: [0, 1.48, -0.84], rot: [-16, 0, 0], color: "faction" },
    // plaques rapiécées des flancs
    ...flancsMatin(),
    { shape: "box", size: [0.06, 0.3, 0.4], pos: [-0.46, 1.3, -0.24], rot: [0, 0, 9], color: "hazard", fine: true },
    { shape: "box", size: [0.06, 0.34, 0.36], pos: [0.46, 1.26, -0.2], rot: [0, 0, -5], color: "dry", fine: true },
    { shape: "box", size: [0.06, 0.3, 0.34], pos: [0.4, 1.24, -0.94], rot: [0, 0, 4], color: "metal", mirror: true },
    // moteur du poitrail : cylindres de cuivre en V, calandre rougeoyante, deux pots sur le garrot
    ...[0.18, -0.1].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.12, height: 0.36, pos: [0.5, 1.56, q(0.5 + z)], rot: [0, 0, -38], color: "copper", mirror: true, fine: z < 0 })),
    { shape: "box", size: [0.66, 0.3, 0.05], pos: [0, 0.94, 0.965], rot: [-14, 0, 0], color: "black" },
    ...[-0.18, 0, 0.18].map((x): Part => ({ shape: "box", size: [0.07, 0.24, 0.05], pos: [x, 0.94, 0.985], rot: [-14, 0, 0], color: "amber", fine: x !== 0 })),
    { shape: "cylinder", sides: 6, radius: 0.07, radiusTop: 0.1, height: 0.46, pos: [0.36, 1.78, 0.1], rot: [-26, 0, -10], color: "steel", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.075, height: 0.03, pos: [0.4, 1.985, 0.0], rot: [-26, 0, -10], color: "amber", mirror: true, fine: true },
    // ventre : réservoir, tuyaux
    { shape: "cylinder", sides: 6, radius: 0.2, height: 0.9, pos: [0, 0.8, -0.2], rot: [84, 0, 0], color: "copper", fine: true },
    { shape: "tube", radius: 0.035, sides: 4, path: [[0.4, 1.02, 0.1], [0.5, 0.84, -0.3], [0.36, 1.0, -0.8]], bend: 0.12, color: "copper", mirror: true, fine: true },
    // cou : soufflet de caoutchouc, vérins
    { shape: "cylinder", sides: 6, radius: 0.38, radiusTop: 0.3, height: 0.4, pos: [0, 1.36, 1.0], rot: [74, 0, 0], color: "rubber" },
    // queue de chaîne, fanion
    ...[[1.42, -1.24, 0.1], [1.56, -1.36, 0.09], [1.74, -1.42, 0.08], [1.92, -1.42, 0.07]].map(([y, z, r], i): Part => ({ shape: "sphere", radius: q(r + 0.02), pos: [0, y, z], color: "steel", fine: i % 2 === 1 })),
    { shape: "tube", radius: 0.035, sides: 4, path: [[0, 1.36, -1.16], [0, 1.6, -1.4], [0, 2.14, -1.42]], bend: 0.02, color: "dark" },
    { shape: "box", size: [0.03, 0.22, 0.26], pos: [0, 2.06, -1.56], color: "faction" },
  ];
}

/** Tête (pivot « tourelle », origine au cou) : crâne, museau, yeux, oreilles ; mâchoire de godet en pivot de frappe. */
function tete(): Part[] {
  return [
    ...porte("tourelle", COU, [
      { shape: "bevel", size: [0.74, 0.5, 0.58], pos: [0, 1.46, 1.28], bevel: 0.1, color: "metal" },
      { shape: "box", size: [0.3, 0.06, 0.54], pos: [0, 1.73, 1.28], color: "faction" },
      // museau : capot à bande d'équipe, truffe
      { shape: "box", size: [0.48, 0.28, 0.56], pos: [0, 1.4, 1.68], color: "rust" },
      { shape: "box", size: [0.26, 0.05, 0.5], pos: [0, 1.56, 1.68], color: "faction" },
      { shape: "box", size: [0.26, 0.16, 0.12], pos: [0, 1.46, 1.97], color: "black" },
      // arcades et yeux ambre
      { shape: "box", size: [0.26, 0.09, 0.22], pos: [0.24, 1.68, 1.52], rot: [16, 0, -14], color: "dark", mirror: true },
      { shape: "box", size: [0.16, 0.12, 0.06], pos: [0.25, 1.58, 1.575], color: "amber", mirror: true },
      // oreilles de tôle pliée
      { shape: "wedge", size: [0.26, 0.34, 0.34], pos: [0.4, 1.78, 1.16], rot: [-18, 0, -28], color: "rust", mirror: true },
      // crocs du haut
      ...[[0.2, 1.88], [0.22, 1.66]].map(([x, z]): Part => ({ shape: "cone", sides: 4, radius: 0.06, height: 0.2, pos: [x, 1.2, z], rot: [180, 0, 0], color: "light", mirror: true, fine: true })),
    ]),
    // mâchoire : godet de pelleteuse denté, bras d'acier (pivot à la charnière)
    ...porte("sauf:mastiff_crusher#coup|x,32#gueule", GUEULE, [
      { shape: "extrude", profile: GODET, depth: 0.6, pos: [GUEULE[0], 1.14, 1.2], rot: [0, -90, 0], color: "steel" },
      { shape: "extrude", profile: [[-0.05, -0.06], [0.28, -0.24], [0.68, -0.24], [0.9, 0], [0.5, 0.02]], depth: 0.06, pos: [0.3, 1.14, 1.2], rot: [0, -90, 0], color: "hazard", mirror: true, fine: true },
      ...[-0.22, -0.075, 0.075, 0.22].map((x): Part => ({ shape: "cone", sides: 4, radius: 0.06, height: 0.22, pos: [x, 1.18, 2.1], rot: [24, 0, 0], color: "light", fine: Math.abs(x) < 0.1 })),
    ]),
  ];
}

// ——— Équipements ———

/** Mâchoires hydrauliques : large godet à crémaillère de dents, joues d'acier, vérins apparents ; remplacent la mâchoire
 * d'origine. */
function broyeur(): Part[] {
  return [
    ...porte("si:mastiff_crusher#tourelle", COU, [
      // joues et mâchoire haute
      { shape: "bevel", size: [0.22, 0.62, 0.66], pos: [0.48, 1.36, 1.4], bevel: 0.06, color: "hazard", mirror: true },
      { shape: "bevel", size: [1.1, 0.24, 0.5], pos: [0, 1.5, 2.02], bevel: 0.06, color: "steel" },
      { shape: "box", size: [0.9, 0.05, 0.3], pos: [0, 1.64, 2.0], color: "faction" },
      ...[-0.44, -0.22, 0, 0.22, 0.44].map((x): Part => ({ shape: "cone", sides: 4, radius: 0.1, height: 0.34, pos: [x, 1.26, 2.18], rot: [174, 0, 0], color: "light" })),
      // vérins : gros corps sombres, tiges polies
      entre([0.52, 1.82, 1.0], [0.54, 1.66, 1.62], 0.1, 0, { shape: "cylinder", sides: 8, color: "dark", mirror: true }),
      entre([0.54, 1.66, 1.62], [0.52, 1.52, 2.02], 0.055, 0, { shape: "cylinder", sides: 6, color: "light", mirror: true }),
    ]),
    ...porte("si:mastiff_crusher#coup|x,36#broyeur", GUEULE, [
      { shape: "extrude", profile: [[-0.1, 0], [0.2, -0.34], [0.8, -0.38], [1.2, -0.06], [1.1, 0], [0.76, -0.2], [0.28, -0.16], [0, 0.12]], depth: 1.14, pos: [0, 1.12, 1.18], rot: [0, -90, 0], color: "steel" },
      { shape: "extrude", profile: [[-0.16, 0.04], [0.18, -0.4], [0.84, -0.44], [1.26, -0.04], [0.7, 0.04]], depth: 0.1, pos: [0.58, 1.12, 1.18], rot: [0, -90, 0], color: "rust", mirror: true },
      ...[-0.44, -0.22, 0, 0.22, 0.44].map((x): Part => ({ shape: "cone", sides: 4, radius: 0.1, height: 0.36, pos: [x, 1.2, 2.4], rot: [28, 0, 0], color: "light" })),
    ]),
  ];
}

/** Tourelle dorsale : couronne, bouclier d'équipe, deux tubes, tambours. */
function affut(): Part[] {
  return porte("si:mastiff_gun#tourelle", GARROT, [
    { shape: "cylinder", sides: 10, radius: 0.36, height: 0.12, pos: [0, 1.76, 0.12], color: "steel" },
    { shape: "bevel", size: [0.5, 0.32, 0.6], pos: [0, 1.98, 0.06], bevel: 0.05, color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.075, height: 1.3, pos: [0.17, 2.02, 0.84], rot: [90, 0, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.5, pos: [0.17, 2.02, 0.56], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.11, height: 0.16, pos: [0.17, 2.02, 1.5], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "box", size: [0.34, 0.5, 0.07], pos: [0.5, 2.04, 0.32], rot: [-8, 28, 0], color: "faction", mirror: true },
    { shape: "cylinder", sides: 8, radius: 0.22, height: 0.24, pos: [0.44, 1.96, -0.12], rot: [0, 0, 90], color: "rust", mirror: true },
    { shape: "box", size: [0.12, 0.1, 0.03], pos: [0, 2.06, 0.37], color: "amber" },
  ]);
}

/** Grappin magnétique : gros tambour de câble, affût, grappin à tête aimantée ; le câble part de la bouche (pivot
 * « laser »). */
function harpon(): Part[] {
  return [
    ...porte("si:mastiff_grapple#tourelle", GARROT, [
      { shape: "cylinder", sides: 10, radius: 0.34, height: 0.12, pos: [0, 1.76, 0.12], color: "dark" },
      // tambour : deux flasques jaunes, câble de cuivre
      { shape: "cylinder", sides: 10, radius: 0.28, height: 0.5, pos: [0, 2.06, -0.28], rot: [0, 0, 90], color: "copper" },
      { shape: "cylinder", sides: 10, radius: 0.4, height: 0.07, pos: [0.29, 2.06, -0.28], rot: [0, 0, 90], color: "hazard", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.1, height: 0.8, pos: [0, 2.06, -0.28], rot: [0, 0, 90], color: "steel" },
      // tube et fourche
      { shape: "bevel", size: [0.3, 0.28, 0.46], pos: [0, 1.96, 0.24], bevel: 0.05, color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.9, pos: [0, 2.02, 0.72], rot: [90, 0, 0], color: "dark" },
      { shape: "torus", radius: 0.15, tube: 0.045, sides: 10, pos: [0, 2.02, 1.14], rot: [90, 0, 0], color: "faction" },
      // grappin : hampe claire, tête aimantée (disque à bobine), griffes repliées
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.7, pos: [0, 2.02, 1.44], rot: [90, 0, 0], color: "light" },
      { shape: "cylinder", sides: 10, radius: 0.22, height: 0.16, pos: [0, 2.02, 1.86], rot: [90, 0, 0], color: "dark" },
      { shape: "torus", radius: 0.16, tube: 0.05, sides: 10, pos: [0, 2.02, 1.95], rot: [90, 0, 0], color: "copper" },
      { shape: "box", size: [0.07, 0.07, 0.3], pos: [0.2, 2.02, 1.74], rot: [0, -24, 0], color: "steel", mirror: true },
    ]),
    { shape: "box", size: [0.02, 0.02, 0.02], pos: [0, 2.02, 1.1], color: "dark", pivot: "si:mastiff_grapple#laser" },
  ];
}

/** Blindage lourd : poutrelles d'acier boulonnées en long sur les flancs et le dos, traverses, attaches rayées. */
function rails(): Part[] {
  const I: [number, number][] = [[-0.13, -0.11], [0.13, -0.11], [0.13, -0.05], [0.045, -0.02], [0.045, 0.05], [0.1, 0.06], [0.1, 0.13], [-0.1, 0.13], [-0.1, 0.06], [-0.045, 0.05], [-0.045, -0.02], [-0.13, -0.05]];
  const rail = (x: number, y: number, z: number, l: number, rx: number, rz: number): Part => ({ shape: "extrude", profile: I, depth: l, pos: [x, y, z], rot: [rx, 0, rz], color: "steel", mirror: true });
  return porte("si:mastiff_plate#fixe_rails", [0, 1.3, 0], [
    rail(0.78, 1.46, 0.36, 1.3, 0, -62),
    rail(0.84, 1.16, 0.36, 1.2, 0, -90),
    rail(0.8, 0.86, 0.36, 1.1, 0, -108),
    rail(0.58, 1.4, -0.78, 1.0, -6, -66),
    rail(0.62, 1.1, -0.78, 0.96, -4, -90),
    rail(0.3, 1.86, 0.06, 1.7, -8, -12),
    // traverses et attaches rayées
    ...[0.66, -0.28].map((z): Part => ({ shape: "box", size: [1.5, 0.12, 0.2], pos: [0, 1.74, z], color: "dark" })),
    { shape: "box", size: [0.08, 0.86, 0.16], pos: [0.92, 1.16, 0.72], color: "hazard", mirror: true },
    { shape: "box", size: [0.08, 0.86, 0.16], pos: [0.92, 1.16, -0.06], color: "hazard", mirror: true },
    { shape: "box", size: [0.5, 0.05, 0.9], pos: [0, 1.9, 0.06], rot: [-8, 0, 0], color: "faction" },
  ]);
}

/** Blindage-cage : de chaque côté, un longeron sous l'échine et une grille de barreaux qui pend devant le flanc, à
 * distance de la caisse ; une grille plus courte devant le poitrail. */
function cage(): Part[] {
  const p: Part[] = [];
  const zs = [0.84, 0.6, 0.36, 0.12, -0.12, -0.36, -0.6, -0.84, -1.04];
  for (const s of [1, -1]) {
    const X = q(s * 0.98);
    p.push({ shape: "box", size: [0.1, 0.1, 2.1], pos: [X, 1.62, -0.1], color: "dark" });
    p.push({ shape: "box", size: [0.08, 0.08, 2.0], pos: [q(s * 1.02), 0.86, -0.1], color: "steel" });
    zs.forEach((z, i) => p.push({ shape: "box", size: [0.05, 0.86, 0.05], pos: [q(s * 1.0), 1.22, z], color: i % 3 === 1 ? "metal" : "steel", fine: i % 2 === 1 }));
    // pattes d'attache à la caisse
    for (const z of [0.6, -0.6]) p.push({ shape: "box", size: [0.3, 0.06, 0.08], pos: [q(s * 0.84), 1.62, z], color: "steel" });
  }
  // grille du poitrail
  for (const x of [-0.42, -0.21, 0, 0.21, 0.42]) p.push({ shape: "box", size: [0.05, 0.6, 0.05], pos: [x, 1.0, 1.24], color: "steel", fine: x === 0 });
  p.push({ shape: "box", size: [1.0, 0.07, 0.07], pos: [0, 1.32, 1.22], color: "dark" }, { shape: "box", size: [1.0, 0.07, 0.07], pos: [0, 0.7, 1.26], color: "dark" });
  p.push({ shape: "box", size: [0.2, 0.07, 1.5], pos: [0, 1.84, -0.1], rot: [-7, 0, 0], color: "faction" });
  return porte("si:mastiff_slat#fixe_cage", [0, 1.4, 0], p);
}

/** Capteurs multispectraux : deux paraboles de part et d'autre du museau, fouets à pointe ambre, gros objectif cyan. */
function truffe(): Part[] {
  return porte("si:mastiff_sensors#tourelle", COU, [
    { shape: "sphere", radius: 0.17, detail: 1, pos: [0, 1.5, 2.04], color: "glow" },
    { shape: "torus", radius: 0.17, tube: 0.045, sides: 10, pos: [0, 1.5, 1.99], rot: [90, 0, 0], color: "copper" },
    { shape: "box", size: [0.9, 0.07, 0.07], pos: [0, 1.6, 1.66], color: "steel" },
    { shape: "lathe", sides: 10, profile: [[0, 0], [0.16, 0.04], [0.3, 0.14], [0.33, 0.14], [0.17, 0], [0, -0.04]], pos: [0.5, 1.66, 1.68], rot: [42, 0, -38], color: "light", mirror: true },
    { shape: "cylinder", sides: 5, radius: 0.03, height: 0.28, pos: [0.57, 1.78, 1.77], rot: [42, 0, -38], color: "amber", mirror: true },
    { shape: "tube", radius: 0.03, sides: 4, path: [[0.22, 1.72, 1.2], [0.46, 2.2, 1.0], [0.8, 2.56, 0.5]], bend: 0.3, color: "dark", mirror: true },
    { shape: "sphere", radius: 0.08, pos: [0.8, 2.56, 0.5], color: "amber", mirror: true },
  ]);
}

/** Coque électrifiée : anneau isolant au cou, couronne d'électrodes de cuivre à pointe lumineuse, bobine sur le poitrail. */
function collier(): Part[] {
  const p: Part[] = [
    { shape: "cylinder", sides: 10, radius: 0.5, radiusTop: 0.46, height: 0.26, pos: [0, 1.36, 0.94], rot: [78, 0, 0], color: "dark" },
    { shape: "torus", radius: 0.5, tube: 0.04, sides: 12, pos: [0, 1.39, 1.06], rot: [78, 0, 0], color: "copper", fine: true },
  ];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 2 * Math.PI;
    const [sx, cy] = [Math.sin(a), Math.cos(a)];
    p.push({ shape: "cone", sides: 4, radius: 0.09, height: 0.44, pos: [q(sx * 0.68), q(1.36 + cy * 0.68), q(0.94 - cy * 0.14)], rot: [q(-12 * cy), 0, q((-a * 180) / Math.PI)], color: "copper" });
    p.push({ shape: "sphere", radius: 0.07, pos: [q(sx * 0.92), q(1.36 + cy * 0.92), q(0.94 - cy * 0.19)], color: "glow", fine: i % 2 === 1 });
  }
  p.push({ shape: "cylinder", sides: 8, radius: 0.14, height: 0.3, pos: [0, 0.9, 1.12], rot: [90, 0, 0], color: "copper" });
  p.push({ shape: "box", size: [0.24, 0.22, 0.05], pos: [0, 0.84, 1.28], color: "faction" });
  return porte("si:mastiff_shock#fixe_collier", [0, 1.36, 0.94], p);
}

/** Nanoréparateurs : bidon d'acier cerclé d'une bande lumineuse, pendu sous le cou, croix de soin ; coffres et tuyaux au
 * dos. */
function nanites(): Part[] {
  return [
    ...porte("si:mastiff_nanites#tourelle", COU, [
      { shape: "lathe", sides: 10, profile: [[0, -0.5], [0.26, -0.5], [0.33, -0.4], [0.33, 0.4], [0.26, 0.5], [0, 0.5]], pos: [0, 0.82, 1.42], rot: [0, 0, 90], color: "metal" },
      { shape: "torus", radius: 0.33, tube: 0.04, sides: 10, pos: [0, 0.82, 1.42], rot: [0, 0, 90], color: "glow" },
      { shape: "torus", radius: 0.33, tube: 0.035, sides: 10, pos: [0.3, 0.82, 1.42], rot: [0, 0, 90], color: "steel", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.08, pos: [0.53, 0.82, 1.42], rot: [0, 0, 90], color: "dark", mirror: true },
      { shape: "box", size: [0.34, 0.34, 0.06], pos: [0, 0.82, 1.77], color: "light" },
      { shape: "box", size: [0.1, 0.28, 0.04], pos: [0, 0.82, 1.805], color: "red" },
      { shape: "box", size: [0.28, 0.1, 0.04], pos: [0, 0.82, 1.805], color: "red" },
      { shape: "tube", radius: 0.06, sides: 4, path: [[0.34, 0.96, 1.36], [0.46, 1.36, 1.14], [0.2, 1.72, 1.02]], bend: 0.2, color: "dark", mirror: true },
    ]),
    // coffres du dos à croix, tuyaux
    ...porte("si:mastiff_nanites#fixe_trousse", [0, 1.5, -0.7], [
      { shape: "extrude", profile: voute(0.3, 0.22, 5), depth: 0.6, pos: [0, 1.56, -0.62], rot: [-14, 0, 0], color: "light" },
      { shape: "box", size: [0.34, 0.05, 0.12], pos: [0, 1.8, -0.6], rot: [-14, 0, 0], color: "red" },
      { shape: "box", size: [0.12, 0.05, 0.34], pos: [0, 1.8, -0.6], rot: [-14, 0, 0], color: "red" },
    ]),
  ];
}

/** Modèle complet du Mâtin. */
export function matin(): Part[] {
  return [
    ...corps(),
    ...PATTES.flatMap(([nom, o, s, avant]) => [
      ...porte(`sauf:mastiff_leap#${nom}`, [q(o[0] * s), o[1], o[2]], patte(avant).map((p) => cote(s, p))),
      ...porte(`si:mastiff_leap#${nom}`, [q(o[0] * s), o[1], o[2]], ressort(avant).map((p) => cote(s, p))),
    ]),
    ...tete(),
    ...broyeur(),
    ...affut(),
    ...harpon(),
    ...rails(),
    ...cage(),
    ...truffe(),
    ...collier(),
    ...nanites(),
    ...variantesMatin(),
  ];
}
