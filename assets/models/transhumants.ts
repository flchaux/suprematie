// Les Transhumants (voir docs/propositions/races.md) : modules déployés, chenillards et armée.
// Un peuple nomade dont toute l'industrie roule : larges chenilles de caoutchouc, châssis bas et longs, bâches
// ocre et sable sur arceaux, coffres sanglés, mâts repliables, peu de verre, métal patiné. La couleur du joueur
// court sur les jupes des chenilles et les bandes des bâches. Les modules déployés gardent leurs chenilles
// (relevées sur les côtés) et posent quatre stabilisateurs au sol : on voit un véhicule arrêté.
// Repère : +x à droite, +y en haut, +z vers l'avant ; le jeu met chaque modèle à la taille de son emprise.
import type { Model, Part, Vec3 } from "./types.ts";
import { stade } from "./kit.ts";

type C = Part["color"];
const q = (v: number) => +v.toFixed(3);

/** Contour en demi-ellipse (largeur 2 x rx, hauteur ry) posé sur y = 0, à extruder le long de z (bâche, voûte). */
function voute(rx: number, ry: number, n = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    out.push([q(Math.cos(a) * rx), q(Math.sin(a) * ry)]);
  }
  return out;
}

/** Arceau : demi-ellipse d'épaisseur `ep` (nervure, bande de bâche). */
function arceau(rx: number, ry: number, ep: number, n = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    out.push([q(Math.cos(a) * rx), q(Math.sin(a) * ry)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * Math.PI;
    out.push([q(Math.cos(a) * (rx - ep)), q(Math.sin(a) * (ry - ep))]);
  }
  return out;
}

/** Tracé d'une hélice d'axe y (filet de vrille), centrée en (cx, cz). */
function heliceY(cx: number, cz: number, r: number, y0: number, y1: number, tours: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * tours * 2 * Math.PI;
    out.push([q(cx + Math.cos(a) * r), q(y0 + (y1 - y0) * t), q(cz + Math.sin(a) * r)]);
  }
  return out;
}

/** Tracé d'une hélice d'axe z (vrille couchée), centrée en (cx, cy). */
function heliceZ(cx: number, cy: number, r: number, z0: number, z1: number, tours: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * tours * 2 * Math.PI;
    out.push([q(cx + Math.cos(a) * r), q(cy + Math.sin(a) * r), q(z0 + (z1 - z0) * t)]);
  }
  return out;
}

/**
 * Place une pièce le long d'un axe incliné (canon) : `base` = origine, `elev` = hausse en degrés (0 : vers +z),
 * `d` = distance le long de l'axe, `h` = décalage perpendiculaire. Un cylindre couché dans l'axe prend rot: [90, 0, 0].
 */
function incl(base: Vec3, elev: number, d: number, h: number, p: Part): Part {
  const a = (elev * Math.PI) / 180;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const r = p.rot ?? [0, 0, 0];
  return { ...p, pos: [base[0], q(base[1] + s * d + c * h), q(base[2] + c * d - s * h)], rot: [r[0] - elev, r[1], r[2]] };
}

/** Profil (rayon, longueur) d'un fût de canon : culasse, fût, manchon, frein de bouche. */
function fut(r: number, l: number): [number, number][] {
  return [[0, 0], [q(r * 1.6), 0], [q(r * 1.6), q(l * 0.1)], [q(r * 1.1), q(l * 0.14)], [q(r), q(l * 0.5)], [q(r * 1.25), q(l * 0.52)], [q(r * 1.25), q(l * 0.6)], [q(r), q(l * 0.62)], [q(r * 0.9), q(l * 0.88)], [q(r * 1.5), q(l * 0.9)], [q(r * 1.5), q(l)], [0, q(l)]];
}

/**
 * Large chenille de caoutchouc (paire symétrique en ±x) : bande en stade, flasque sombre, barbotin et roue folle
 * d'acier, galets et crampons du brin supérieur tous les `pas` (pièces fines ; `pas` = 0 : ni galets ni crampons). Longueur l (z), hauteur h, largeur w,
 * posée à y0, centrée en z.
 */
function chenille(x: number, l: number, h: number, w: number, y0 = 0, z = 0, pas = 0.25): Part[] {
  const y = q(y0 + h / 2);
  const p: Part[] = [
    { shape: "extrude", profile: stade(l, h, 4), depth: w, bevel: 0.03, pos: [x, y, z], rot: [0, -90, 0], color: "rubber", mirror: true },
    { shape: "extrude", profile: stade(q(l - 0.14), q(h * 0.6), 3), depth: q(w + 0.03), pos: [x, y, z], rot: [0, -90, 0], color: "dark", mirror: true, fine: true },
    { shape: "cylinder", sides: 8, radius: q(h * 0.36), height: q(w + 0.05), pos: [x, y, q(z + l / 2 - h / 2)], rot: [0, 0, 90], color: "steel", mirror: true, fine: true },
    { shape: "cylinder", sides: 8, radius: q(h * 0.33), height: q(w + 0.05), pos: [x, y, q(z - l / 2 + h / 2)], rot: [0, 0, 90], color: "steel", mirror: true, fine: true },
  ];
  if (pas <= 0) return p;
  const n = Math.max(2, Math.round((l - 2 * h) / (h * 0.75)));
  for (let i = 0; i < n; i++) {
    const zz = q(z - l / 2 + h + ((l - 2 * h) * (i + 0.5)) / n);
    p.push({ shape: "cylinder", sides: 6, radius: q(h * 0.24), height: q(w + 0.04), pos: [x, q(y0 + h * 0.3), zz], rot: [0, 0, 90], color: "metal", mirror: true, fine: true });
  }
  // crampons du brin supérieur
  const nc = Math.max(3, Math.round((l - h) / pas));
  for (let i = 0; i < nc; i++) {
    const zz = q(z - (l - h) / 2 + ((l - h) * (i + 0.5)) / nc);
    p.push({ shape: "box", size: [q(w + 0.01), 0.025, 0.05], pos: [x, q(y0 + h + 0.005), zz], color: "dark", mirror: true, fine: true });
  }
  return p;
}

/** Caisse ou coffre de bois (ou de tôle) ceinturé de deux sangles sombres. */
function coffre(pos: Vec3, size: Vec3, color: C = "wood", sangle: C = "black"): Part[] {
  const [x, y, z] = pos;
  return [
    { shape: "box", size, pos, color },
    { shape: "box", size: [q(size[0] + 0.012), q(size[1] + 0.012), 0.035], pos: [x, y, q(z + size[2] * 0.27)], color: sangle, fine: true },
    { shape: "box", size: [q(size[0] + 0.012), q(size[1] + 0.012), 0.035], pos: [x, y, q(z - size[2] * 0.27)], color: sangle, fine: true },
  ];
}

/**
 * Bâche sur arceaux (axe z) : voûte de toile de demi-largeur rx, de hauteur ry et de longueur l posée en (x, y, z),
 * des bandes d'équipe et, si `aretes`, des arceaux d'acier (pièces fines) aux extrémités.
 */
function bache(x: number, y: number, z: number, rx: number, ry: number, l: number, color: C = "dry", bandes = 2, aretes = true): Part[] {
  const p: Part[] = [{ shape: "extrude", profile: voute(rx, ry), depth: l, pos: [x, y, z], color }];
  for (let i = 0; i < bandes; i++) {
    const zz = q(z - l / 2 + (l * (i + 0.5)) / bandes);
    p.push({ shape: "extrude", profile: arceau(q(rx + 0.045), q(ry + 0.045), 0.06, 6), depth: q(Math.min(0.14, l * 0.16)), pos: [x, y, zz], color: "faction" });
  }
  for (const s of aretes ? [1, -1] : []) {
    p.push({ shape: "extrude", profile: arceau(q(rx + 0.015), q(ry + 0.015), 0.035), depth: 0.04, pos: [x, y, q(z + (s * (l - 0.04)) / 2)], color: "metal", fine: true });
  }
  return p;
}

/**
 * Socle d'un module déployé de w x d cases : caisse basse entre deux larges chenilles (les côtés, brin
 * supérieur visible de dessus) à jupes d'équipe et garde-boue rouille, plateau d'acier patiné à planches, quatre
 * stabilisateurs (bras, vérin, patin posé au sol) aux coins. Plateau : |x| < w/2 - 0,32, dessus à y = 0,62 ;
 * `recul` raccourcit la caisse et le plateau à l'avant (place d'une rampe).
 */
function socleNomade(w: number, d: number, recul = 0): Part[] {
  const hw = w / 2;
  const hd = d / 2;
  const tx = q(hw - 0.17);
  const tl = q(d - 0.5);
  const dx = q(hw - 0.32);
  const p: Part[] = [
    ...chenille(tx, tl, 0.46, 0.3, 0.04),
    // jupes d'équipe sur le flanc des chenilles (laissent voir les galets), garde-boue aux deux bouts
    { shape: "box", size: [0.03, 0.24, q(tl - 0.3)], pos: [q(tx + 0.165), 0.36, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.035, 0.04, q(tl - 0.3)], pos: [q(tx + 0.168), 0.48, 0], color: "rust", mirror: true },
    { shape: "box", size: [0.34, 0.04, 0.24], pos: [tx, 0.53, q(tl / 2 - 0.14)], color: "rust", mirror: true },
    { shape: "box", size: [0.34, 0.04, 0.24], pos: [tx, 0.53, q(-tl / 2 + 0.14)], color: "rust", mirror: true },
    // caisse basse et plateau
    { shape: "bevel", size: [q(2 * dx - 0.06), 0.42, q(d - 0.26 - recul)], pos: [0, 0.36, q(-recul / 2)], bevel: 0.04, color: "dark" },
    { shape: "bevel", size: [q(2 * dx), 0.06, q(d - 0.3 - recul)], pos: [0, 0.59, q(-recul / 2)], bevel: 0.02, color: "metal" },
    ...[-0.5, 0, 0.5].map((f): Part => ({ shape: "box", size: [0.015, 0.012, q(d - 0.34 - recul)], pos: [q(f * dx), 0.624, q(-recul / 2)], color: "dark", fine: true })),
  ];
  // stabilisateurs : bras rouille sortis de la caisse, vérin d'acier, patin sombre au sol
  for (const sz of [1, -1]) {
    const x1 = q(hw - 0.16);
    const z1 = q(sz * (hd - 0.12));
    p.push(
      { shape: "tube", radius: 0.045, sides: 4, path: [[q(dx - 0.2), 0.42, q(sz * (hd - 0.16))], [x1, 0.42, z1]], color: "rust", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.16, pos: [x1, 0.38, z1], color: "dark", mirror: true, fine: true },
      { shape: "cylinder", sides: 6, radius: 0.04, height: 0.4, pos: [x1, 0.23, z1], color: "steel", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.13, radiusTop: 0.09, height: 0.06, pos: [x1, 0.03, z1], color: "dark", mirror: true },
      { shape: "box", size: [0.12, 0.03, 0.03], pos: [x1, 0.47, z1], color: "hazard", mirror: true, fine: true },
    );
  }
  return p;
}

/**
 * Châssis commun des chenillards (modules repliés) : longueur l (z), deux larges chenilles, garde-chenilles
 * rouille, jupes d'équipe, caisse basse à nez incliné, plateau de planches, cabine basse à toit de bâche,
 * phares ambre, échappement, coffres arrière. Le chargement se pose sur le plateau : x de -0,64 à 0,64,
 * z de -l/2 à l/2 - 0,75, y = 0,65.
 */
function chenillard(l = 2.6): Part[] {
  const h = l / 2;
  return [
    ...chenille(0.66, l, 0.5, 0.38),
    { shape: "bevel", size: [0.44, 0.05, q(l - 0.14)], pos: [0.66, 0.535, 0], bevel: 0.015, color: "metal", mirror: true },
    { shape: "box", size: [0.03, 0.16, q(l * 0.74)], pos: [0.875, 0.45, -0.08], color: "faction", mirror: true },
    // caisse basse à nez incliné
    { shape: "extrude", profile: [[-h, 0.18], [q(h - 0.25), 0.18], [h, 0.4], [q(h - 0.08), 0.6], [q(-h + 0.04), 0.6], [-h, 0.48]], depth: 0.9, bevel: 0.03, rot: [0, -90, 0], color: "dark" },
    // plateau de planches
    { shape: "box", size: [1.32, 0.05, q(l - 0.78)], pos: [0, 0.625, -0.36], color: "wood" },
    ...[-0.33, 0, 0.33].map((x): Part => ({ shape: "box", size: [0.015, 0.012, q(l - 0.8)], pos: [x, 0.652, -0.36], color: "dark", fine: true })),
    // cabine basse : caisse d'acier patiné, fente vitrée, toit de bâche, phares
    { shape: "bevel", size: [1.16, 0.36, 0.52], pos: [0, 0.8, q(h - 0.38)], bevel: 0.04, color: "metal" },
    { shape: "box", size: [0.86, 0.07, 0.03], pos: [0, 0.88, q(h - 0.115)], color: "glass" },
    { shape: "extrude", profile: voute(0.6, 0.14, 6), depth: 0.6, pos: [0, 0.97, q(h - 0.38)], color: "dry" },
    { shape: "box", size: [0.1, 0.06, 0.03], pos: [0.42, 0.72, q(h - 0.115)], color: "amber", mirror: true },
    // échappement
    { shape: "tube", radius: 0.04, path: [[0.5, 0.86, q(h - 0.66)], [0.5, 1.2, q(h - 0.66)], [0.5, 1.26, q(h - 0.74)]], bend: 0.06, color: "rust" },
    // coffres arrière sur les garde-chenilles
    ...coffre([0.66, 0.65, q(-h + 0.28)], [0.3, 0.16, 0.36], "rust"),
    ...coffre([-0.66, 0.65, q(-h + 0.28)], [0.3, 0.16, 0.36], "rust"),
    // crochet d'attelage
    { shape: "box", size: [0.2, 0.08, 0.12], pos: [0, 0.3, q(-h - 0.02)], color: "steel", fine: true },
  ];
}

// ——— Modules repliés (chargements des chenillards et pièces communes aux modules déployés) ———

/** Vrille verticale (pivot « foret », elle tourne au travail) d'axe (x, z), de y0 à y1. */
function vrille(x: number, z: number, y0: number, y1: number, r: number, pivot?: string): Part[] {
  const l = y1 - y0;
  const tag = pivot ? { parent: pivot } : {};
  return [
    { shape: "lathe", sides: 10, pos: [x, y0, z], color: "dark", ...(pivot ? { pivot } : {}), profile: [[0, 0], [q(r * 0.25), q(l * 0.06)], [q(r * 0.35), q(l * 0.16)], [q(r * 0.35), q(l)], [0, q(l)]] },
    { shape: "tube", radius: q(r * 0.2), sides: 4, path: heliceY(x, z, q(r * 0.62), q(y0 + l * 0.08), q(y1 - 0.06), 3.5, 28), bend: 0, color: "steel", fine: true, ...tag },
  ];
}

// ——— Bâtiments ———

export const TRANSH_BUILDING_MODELS: Record<string, Model> = {
  // t_drill : foreuse nomade posée sur un gisement ; mât de forage relevé à deux rails rouille et entretoises,
  // moufle au sommet, vérin de levage depuis l'arrière, tête motrice d'équipe et vrille tournante (pivot « foret »)
  // plongeant dans un puits bordé de minerai ; moteur sous bâche à l'arrière, trémie et goulotte vers l'avant
  t_drill: {
    parts: [
      ...socleNomade(2, 2),
      // puits : lèvre de minerai (teintée selon la ressource), fond noir, éclats
      { shape: "lathe", sides: 12, pos: [0, 0.62, 0.32], color: "ore", profile: [[0.2, 0], [0.36, 0], [0.36, 0.03], [0.3, 0.07], [0.24, 0.07], [0.2, 0.04]] },
      { shape: "cylinder", sides: 12, radius: 0.22, height: 0.02, pos: [0, 0.635, 0.32], color: "black" },
      { shape: "box", size: [0.09, 0.06, 0.07], pos: [0.3, 0.66, 0.6], rot: [12, 30, 8], color: "ore", fine: true },
      { shape: "box", size: [0.08, 0.05, 0.08], pos: [-0.36, 0.66, 0.5], rot: [-8, 50, 10], color: "ore", fine: true },
      // vrille (pivot)
      ...vrille(0, 0.32, 0.62, 1.55, 0.3, "foret"),
      // mât de forage : deux rails, entretoises, moufle et poulie
      { shape: "box", size: [0.08, 2.0, 0.1], pos: [0.27, 1.6, 0.06], color: "rust", mirror: true },
      ...[1.0, 1.55, 2.1].map((y): Part => ({ shape: "box", size: [0.5, 0.05, 0.05], pos: [0, y, 0.06], color: "dark" })),
      ...[0.8, 1.35, 1.9].map((y): Part => ({ shape: "tube", radius: 0.018, sides: 4, path: [[-0.25, y, 0.06], [0.25, q(y + 0.45), 0.06]], color: "metal", fine: true })),
      { shape: "bevel", size: [0.66, 0.16, 0.36], pos: [0, 2.65, 0.14], bevel: 0.03, color: "metal" },
      { shape: "cylinder", sides: 10, radius: 0.12, height: 0.08, pos: [0, 2.65, 0.32], rot: [90, 0, 0], color: "steel" },
      { shape: "sphere", radius: 0.04, pos: [0.3, 2.76, 0.14], color: "amber" },
      // tête motrice d'équipe sur les rails, flexible de cuivre
      { shape: "bevel", size: [0.5, 0.26, 0.34], pos: [0, 1.72, 0.3], bevel: 0.04, color: "faction" },
      { shape: "cylinder", sides: 10, radius: 0.08, height: 0.2, pos: [0, 1.56, 0.32], color: "dark" },
      { shape: "tube", radius: 0.03, sides: 5, path: [[0.2, 1.8, 0.2], [0.42, 1.6, -0.1], [0.45, 0.9, -0.45]], bend: 0.12, color: "copper", fine: true },
      // vérin de levage du mât (depuis l'arrière du plateau)
      { shape: "tube", radius: 0.06, path: [[0, 0.75, -0.62], [0, 1.4, 0.02]], color: "dark" },
      { shape: "tube", radius: 0.04, path: [[0, 1.2, -0.17], [0, 1.85, 0.05]], color: "steel" },
      // moteur sous bâche à l'arrière, échappement
      { shape: "bevel", size: [0.9, 0.3, 0.5], pos: [0, 0.77, -0.6], bevel: 0.03, color: "metal" },
      ...bache(0, 0.92, -0.6, 0.42, 0.26, 0.5, "dry", 1),
      { shape: "tube", radius: 0.045, path: [[-0.55, 0.62, -0.75], [-0.55, 1.4, -0.75], [-0.5, 1.48, -0.72]], bend: 0.06, color: "rust" },
      // trémie à minerai (avant droit) et goulotte vers la sortie
      { shape: "lathe", sides: 4, pos: [0.44, 0.62, 0.12], rot: [0, 45, 0], color: "rust", profile: [[0.08, 0], [0.1, 0], [0.3, 0.34], [0.3, 0.38], [0.26, 0.38], [0.08, 0.06]] },
      { shape: "box", size: [0.3, 0.02, 0.3], pos: [0.44, 0.97, 0.12], color: "ore" },
      { shape: "box", size: [0.2, 0.05, 0.6], pos: [0.44, 0.55, 0.72], rot: [32, 0, 0], color: "metal" },
      { shape: "box", size: [0.14, 0.02, 0.54], pos: [0.44, 0.58, 0.71], rot: [32, 0, 0], color: "ore", fine: true },
      { shape: "lathe", sides: 6, pos: [0.44, 0, 0.86], color: "ore", profile: [[0, 0], [0.13, 0], [0.08, 0.07], [0, 0.1]] },
      // coffres sanglés à gauche
      ...coffre([-0.45, 0.74, 0.55], [0.32, 0.22, 0.36], "wood"),
      ...coffre([-0.47, 0.73, 0.1], [0.28, 0.2, 0.32], "rust"),
    ],
  },
  // t_furnace : fonderie nomade ; creuset tournant sur tourillons entre deux montants rouille, bain de fonte
  // ambre, bec verseur ; cheminée télescopique haubanée (trois tronçons), soufflerie à conduite de cuivre,
  // bac de charbon, coupe-vent de toile tendu à l'arrière
  t_furnace: {
    parts: [
      ...socleNomade(2, 2),
      // creuset : montants, tourillons, cuve tournée, bain, bec
      { shape: "box", size: [0.1, 0.62, 0.22], pos: [0.46, 0.93, 0.2], color: "rust", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.08, height: 1.02, pos: [0, 1.1, 0.2], rot: [0, 0, 90], color: "steel" },
      { shape: "lathe", sides: 14, pos: [0, 0.7, 0.2], color: "dark", profile: [[0, 0], [0.2, 0], [0.28, 0.08], [0.33, 0.3], [0.36, 0.52], [0.39, 0.56], [0.39, 0.6], [0.33, 0.6], [0.31, 0.55], [0, 0.55]] },
      { shape: "torus", radius: 0.345, tube: 0.025, sides: 14, pos: [0, 1.0, 0.2], color: "rust", fine: true },
      { shape: "cylinder", sides: 14, radius: 0.31, height: 0.02, pos: [0, 1.24, 0.2], color: "amber" },
      { shape: "wedge", size: [0.14, 0.07, 0.18], pos: [0, 1.28, 0.6], color: "dark" },
      // couvercle ouvert, relevé vers l'arrière
      { shape: "cylinder", sides: 12, radius: 0.36, height: 0.05, pos: [0, 1.55, -0.18], rot: [-72, 0, 0], color: "rust" },
      { shape: "box", size: [0.3, 0.06, 0.06], pos: [0, 1.82, -0.24], color: "steel" },
      // cheminée télescopique et haubans
      { shape: "lathe", sides: 10, pos: [-0.42, 0.62, -0.45], color: "dark", profile: [[0, 0], [0.22, 0], [0.22, 0.1], [0.17, 0.16], [0.17, 0.8], [0.19, 0.82], [0.19, 0.88], [0.14, 0.9], [0.14, 1.45], [0.16, 1.47], [0.16, 1.52], [0.11, 1.54], [0.11, 1.95], [0.15, 1.98], [0.15, 2.02], [0, 2.02]] },
      { shape: "cylinder", sides: 10, radius: 0.105, height: 0.02, pos: [-0.42, 2.645, -0.45], color: "black" },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 0.03, pos: [-0.42, 2.74, -0.45], color: "rust" },
      { shape: "box", size: [0.02, 0.1, 0.02], pos: [-0.3, 2.69, -0.45], color: "metal", fine: true },
      { shape: "tube", radius: 0.008, sides: 3, path: [[-0.42, 2.2, -0.45], [0.66, 0.62, -0.84]], color: "black", fine: true },
      { shape: "tube", radius: 0.008, sides: 3, path: [[-0.42, 2.2, -0.45], [-0.66, 0.62, 0.8]], color: "black", fine: true },
      { shape: "tube", radius: 0.008, sides: 3, path: [[-0.42, 2.2, -0.45], [-0.66, 0.62, -0.84]], color: "black", fine: true },
      // soufflerie : caisson, ventilateur, conduite de cuivre
      { shape: "bevel", size: [0.36, 0.34, 0.36], pos: [0.45, 0.81, -0.5], bevel: 0.04, color: "metal" },
      { shape: "cylinder", sides: 12, radius: 0.13, height: 0.04, pos: [0.45, 0.99, -0.5], color: "black" },
      { shape: "box", size: [0.24, 0.015, 0.04], pos: [0.45, 1.02, -0.5], rot: [0, 30, 0], color: "steel", fine: true },
      { shape: "tube", radius: 0.045, path: [[0.4, 0.82, -0.32], [0.32, 0.82, -0.05], [0.28, 0.82, 0.12]], bend: 0.1, color: "copper" },
      // bac de charbon
      ...coffre([0.45, 0.74, 0.64], [0.3, 0.22, 0.3], "rust"),
      { shape: "box", size: [0.26, 0.04, 0.26], pos: [0.45, 0.86, 0.64], color: "black" },
      // coupe-vent : toile tendue entre deux perches à l'arrière
      { shape: "box", size: [0.04, 0.8, 0.04], pos: [0.08, 1.0, -0.8], color: "wood" },
      { shape: "box", size: [0.04, 0.8, 0.04], pos: [0.66, 1.0, -0.8], color: "wood" },
      { shape: "box", size: [0.58, 0.55, 0.02], pos: [0.37, 1.08, -0.8], rot: [-8, 0, 0], color: "dry" },
      { shape: "box", size: [0.58, 0.1, 0.025], pos: [0.37, 1.2, -0.79], rot: [-8, 0, 0], color: "faction" },
      ...coffre([-0.46, 0.72, 0.62], [0.3, 0.2, 0.32], "wood"),
    ],
  },
  // t_assembler : assembleur nomade ; auvent de toile tendu sur quatre perches au-dessus de l'établi (arrière),
  // bras articulé sur plateau tournant (pivot « bras », il tourne au travail) devant, bacs de pièces, outils
  t_assembler: {
    parts: [
      ...socleNomade(2, 2),
      // auvent : perches, toile inclinée, bandes d'équipe, haubans
      ...[[0.64, -0.08], [0.64, -0.82]].map(([x, z]): Part => ({ shape: "box", size: [0.05, 0.8, 0.05], pos: [x, 1.02, z], color: "wood", mirror: true })),
      { shape: "box", size: [1.6, 0.03, 0.98], pos: [0, 1.42, -0.45], rot: [-9, 0, 0], color: "dry" },
      { shape: "box", size: [1.62, 0.035, 0.16], pos: [0, 1.44, -0.25], rot: [-9, 0, 0], color: "faction" },
      { shape: "box", size: [1.62, 0.035, 0.16], pos: [0, 1.38, -0.7], rot: [-9, 0, 0], color: "faction" },
      { shape: "box", size: [1.6, 0.1, 0.02], pos: [0, 1.46, 0.04], color: "dry" },
      { shape: "tube", radius: 0.008, sides: 3, path: [[0.64, 1.42, 0.03], [0.84, 0.0, 0.5]], color: "black", mirror: true, fine: true },
      // établi de bois sous l'auvent, étau, outils, panneau d'outils
      { shape: "box", size: [1.1, 0.06, 0.38], pos: [-0.05, 0.92, -0.6], color: "wood" },
      ...[-0.5, 0.4].map((x): Part => ({ shape: "box", size: [0.06, 0.3, 0.32], pos: [x, 0.77, -0.6], color: "dark" })),
      { shape: "box", size: [0.14, 0.1, 0.1], pos: [0.28, 1.0, -0.55], color: "steel" },
      { shape: "box", size: [0.3, 0.06, 0.12], pos: [-0.25, 0.98, -0.64], color: "rust", fine: true },
      { shape: "box", size: [1.1, 0.36, 0.03], pos: [-0.05, 1.12, -0.82], color: "metal" },
      ...[-0.45, -0.2, 0.1, 0.35].map((x): Part => ({ shape: "box", size: [0.03, 0.16, 0.02], pos: [x, 1.12, -0.8], color: "steel", fine: true })),
      // bras articulé (pivot) : plateau tournant, épaule, bras d'équipe, avant-bras, pince
      { shape: "cylinder", sides: 12, radius: 0.24, height: 0.1, pos: [0.22, 0.67, 0.35], color: "steel", pivot: "bras" },
      { shape: "bevel", size: [0.24, 0.24, 0.26], pos: [0.22, 0.82, 0.35], bevel: 0.03, color: "dark", parent: "bras" },
      { shape: "box", size: [0.12, 0.62, 0.14], pos: [0.22, 1.12, 0.22], rot: [-28, 0, 0], color: "faction", parent: "bras" },
      { shape: "cylinder", sides: 8, radius: 0.08, height: 0.2, pos: [0.22, 1.4, 0.08], rot: [0, 0, 90], color: "steel", parent: "bras" },
      { shape: "box", size: [0.1, 0.1, 0.56], pos: [0.22, 1.32, 0.32], rot: [18, 0, 0], color: "rust", parent: "bras" },
      { shape: "box", size: [0.16, 0.12, 0.08], pos: [0.22, 1.2, 0.6], color: "dark", parent: "bras" },
      { shape: "box", size: [0.03, 0.14, 0.04], pos: [0.28, 1.1, 0.62], color: "steel", parent: "bras" },
      { shape: "box", size: [0.03, 0.14, 0.04], pos: [0.16, 1.1, 0.62], color: "steel", parent: "bras" },
      { shape: "tube", radius: 0.015, sides: 4, path: [[0.3, 0.85, 0.35], [0.3, 1.3, 0.12], [0.3, 1.32, 0.4]], bend: 0.08, color: "copper", parent: "bras", fine: true },
      // bacs de pièces à l'avant gauche, coffre sanglé
      ...coffre([-0.42, 0.73, 0.55], [0.4, 0.2, 0.38], "rust"),
      { shape: "box", size: [0.34, 0.03, 0.32], pos: [-0.42, 0.84, 0.55], color: "steel" },
      ...coffre([-0.44, 0.72, 0.08], [0.3, 0.18, 0.3], "wood"),
      { shape: "box", size: [0.1, 0.05, 0.03], pos: [0.55, 0.7, 0.86], color: "amber" },
    ],
  },
  // t_refinery : raffinerie nomade ; deux colonnes de distillation relevées (cerclages, bande d'équipe, échelle),
  // grande cuve couchée sable à bandes d'équipe sur berceaux, torchère à flamme ambre, tuyauteries de cuivre,
  // poste de contrôle sous bâche
  t_refinery: {
    parts: [
      ...socleNomade(2, 2),
      // colonnes
      { shape: "lathe", sides: 12, pos: [-0.38, 0.62, -0.42], color: "metal", profile: [[0, 0], [0.25, 0], [0.25, 0.08], [0.22, 0.12], [0.22, 1.7], [0.16, 1.82], [0.06, 1.86], [0, 1.86]] },
      ...[0.95, 1.35, 1.75].map((y): Part => ({ shape: "torus", radius: 0.225, tube: 0.02, sides: 12, pos: [-0.38, y, -0.42], color: "rust", fine: true })),
      { shape: "cylinder", sides: 12, radius: 0.226, height: 0.14, pos: [-0.38, 1.55, -0.42], color: "faction" },
      { shape: "lathe", sides: 12, pos: [-0.38, 0.62, 0.14], color: "metal", profile: [[0, 0], [0.19, 0], [0.19, 0.06], [0.16, 0.1], [0.16, 1.3], [0.11, 1.4], [0, 1.43]] },
      ...[1.05, 1.5].map((y): Part => ({ shape: "torus", radius: 0.165, tube: 0.018, sides: 12, pos: [-0.38, y, 0.14], color: "rust", fine: true })),
      { shape: "cylinder", sides: 12, radius: 0.166, height: 0.1, pos: [-0.38, 1.28, 0.14], color: "faction" },
      { use: "echelle", pos: [-0.62, 0.62, -0.42], rot: [0, -90, 0], scale: [1, 1.6, 1] },
      { shape: "tube", radius: 0.04, path: [[-0.38, 2.0, -0.42], [-0.38, 2.1, -0.15], [-0.38, 2.1, 0.14], [-0.38, 2.04, 0.14]], bend: 0.08, color: "copper" },
      // cuve couchée sur berceaux
      { shape: "lathe", sides: 12, pos: [0.36, 0.93, -0.8], rot: [90, 0, 0], color: "dry", profile: [[0, 0], [0.18, 0.02], [0.26, 0.1], [0.28, 0.2], [0.28, 1.36], [0.26, 1.46], [0.18, 1.54], [0, 1.56]] },
      ...[-0.45, 0.3].map((z): Part => ({ shape: "cylinder", sides: 12, radius: 0.29, height: 0.1, pos: [0.36, 0.93, z], rot: [90, 0, 0], color: "faction" })),
      ...[-0.6, 0.45].map((z): Part => ({ shape: "box", size: [0.44, 0.2, 0.1], pos: [0.36, 0.72, z], color: "dark" })),
      { shape: "cylinder", sides: 8, radius: 0.07, height: 0.08, pos: [0.36, 1.24, -0.1], color: "steel" },
      { use: "vanne", pos: [0.36, 1.28, -0.1], scale: 0.8 },
      // tuyauteries de la cuve aux colonnes
      { shape: "tube", radius: 0.04, path: [[0.36, 0.78, 0.76], [0.36, 0.72, 0.84], [-0.1, 0.72, 0.84], [-0.1, 0.72, 0.14], [-0.22, 0.72, 0.14]], bend: 0.1, color: "copper" },
      { shape: "tube", radius: 0.035, path: [[0.1, 0.95, -0.42], [-0.16, 0.95, -0.42]], color: "copper", fine: true },
      // torchère arrière droite
      { shape: "cylinder", sides: 6, radius: 0.035, height: 1.1, pos: [0.0, 1.17, -0.8], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.06, radiusTop: 0.07, height: 0.08, pos: [0.0, 1.75, -0.8], color: "dark" },
      { shape: "cone", sides: 6, radius: 0.06, height: 0.16, pos: [0.0, 1.87, -0.8], color: "amber" },
      // poste de contrôle sous bâche (avant gauche)
      { shape: "bevel", size: [0.34, 0.26, 0.26], pos: [-0.4, 0.76, 0.62], bevel: 0.03, color: "metal" },
      ...bache(-0.4, 0.89, 0.62, 0.19, 0.12, 0.28, "rust", 1),
      { shape: "box", size: [0.18, 0.07, 0.02], pos: [-0.4, 0.8, 0.755], color: "glow" },
    ],
  },
  // t_generator : générateur nomade ; bloc moteur à culasses et carter, radiateur à hélice horizontale (pivot
  // « rotor », elle tourne au travail), deux échappements, réservoir sable ; pylône d'alimentation relevé à
  // l'arrière gauche : treillis effilé, traverse, isolateurs, câble
  t_generator: {
    parts: [
      ...socleNomade(2, 2),
      // bloc moteur
      { shape: "bevel", size: [0.62, 0.36, 0.8], pos: [0.18, 0.82, 0.12], bevel: 0.04, color: "metal" },
      ...[-0.14, 0.08, 0.3].flatMap((z): Part[] => [0.04, 0.32].map((x): Part => ({ shape: "box", size: [0.22, 0.1, 0.16], pos: [x, 1.05, z], color: "dark" }))),
      { shape: "box", size: [0.04, 0.2, 0.66], pos: [0.5, 0.8, 0.12], color: "faction" },
      { shape: "tube", radius: 0.025, sides: 5, path: [[-0.14, 0.95, -0.15], [-0.3, 0.95, -0.2], [-0.4, 1.2, -0.45]], bend: 0.06, color: "copper", fine: true },
      // radiateur et hélice (avant)
      { shape: "bevel", size: [0.66, 0.42, 0.3], pos: [0.18, 0.84, 0.7], bevel: 0.03, color: "dark" },
      { shape: "lathe", sides: 14, pos: [0.18, 1.05, 0.7], color: "rust", profile: [[0.19, 0], [0.23, 0], [0.23, 0.06], [0.19, 0.06]] },
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.06, pos: [0.18, 1.08, 0.7], color: "steel", pivot: "rotor" },
      ...[0, 120, 240].map((a): Part => ({ shape: "box", size: [0.34, 0.012, 0.07], pos: [0.18, 1.09, 0.7], rot: [10, a, 0], color: "steel", parent: "rotor" })),
      ...[0.68, 0.78, 0.88, 0.98].map((y): Part => ({ shape: "box", size: [0.58, 0.02, 0.02], pos: [0.18, y, 0.855], color: "black", fine: true })),
      // échappements
      { shape: "tube", radius: 0.05, path: [[0.49, 0.95, -0.05], [0.58, 0.95, -0.05], [0.58, 1.7, -0.05]], bend: 0.08, color: "rust" },
      { shape: "tube", radius: 0.05, path: [[0.49, 0.95, 0.3], [0.58, 0.95, 0.3], [0.58, 1.55, 0.3]], bend: 0.08, color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.065, height: 0.04, pos: [0.58, 1.71, -0.05], color: "black" },
      { shape: "cylinder", sides: 8, radius: 0.065, height: 0.04, pos: [0.58, 1.56, 0.3], color: "black" },
      // réservoir sable sur berceau (arrière droit), bidons
      { shape: "lathe", sides: 10, pos: [0.36, 0.84, -0.66], rot: [0, 0, 90], color: "dry", profile: [[0, -0.3], [0.15, -0.29], [0.19, -0.24], [0.19, 0.24], [0.15, 0.29], [0, 0.3]] },
      { shape: "box", size: [0.06, 0.23, 0.3], pos: [0.36, 0.73, -0.66], color: "faction" },
      ...[0.0, 0.16].map((x): Part => ({ shape: "box", size: [0.12, 0.2, 0.16], pos: [x, 0.72, -0.4], color: "red" })),
      // pylône d'alimentation : quatre montants effilés, ceintures, traverse, isolateurs, câble
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]): Part => ({ shape: "tube", radius: 0.03, sides: 4, path: [[q(-0.42 + sx * 0.2), 0.62, q(-0.48 + sz * 0.2)], [q(-0.42 + sx * 0.05), 2.5, q(-0.48 + sz * 0.05)]], color: "rust" })),
      ...[1.1, 1.6, 2.05].map((y): Part => {
        const r = q((0.2 - ((y - 0.62) / 1.88) * 0.15) * 1.414);
        return { shape: "lathe", sides: 4, rot: [0, 45, 0], pos: [-0.42, y, -0.48], color: "dark", profile: [[r, 0], [q(r + 0.02), 0], [q(r + 0.02), 0.04], [r, 0.04]] };
      }),
      { shape: "box", size: [0.9, 0.06, 0.06], pos: [-0.42, 2.45, -0.48], color: "dark" },
      ...[-0.38, 0.38].map((dx): Part => ({ shape: "cylinder", sides: 6, radius: 0.04, height: 0.14, pos: [q(-0.42 + dx), 2.55, -0.48], color: "light" })),
      { shape: "cylinder", sides: 6, radius: 0.04, height: 0.16, pos: [-0.42, 2.6, -0.48], color: "light" },
      { shape: "sphere", radius: 0.045, pos: [-0.42, 2.72, -0.48], color: "amber" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[-0.04, 2.6, -0.48], [0.0, 1.6, -0.3], [0.04, 1.1, -0.2]], bend: 0.3, color: "black", fine: true },
      ...coffre([-0.44, 0.72, 0.55], [0.3, 0.2, 0.42], "wood"),
    ],
  },
  // t_hold : soute ; deux conteneurs ondulés (rouille, aux couleurs de l'équipe) sanglés au plateau, pile de
  // caisses sous un filet tendu, sacs de toile
  t_hold: {
    parts: [
      ...socleNomade(2, 2),
      // conteneur rouille, long, à gauche
      { shape: "bevel", size: [0.64, 0.6, 1.5], pos: [-0.34, 0.93, -0.12], bevel: 0.03, color: "rust" },
      ...[-0.65, -0.4, -0.15, 0.1, 0.35].map((z): Part => ({ shape: "box", size: [0.66, 0.5, 0.03], pos: [-0.34, 0.93, z], color: "dark", fine: true })),
      { shape: "box", size: [0.54, 0.5, 0.02], pos: [-0.34, 0.93, 0.635], color: "dark" },
      { shape: "box", size: [0.03, 0.46, 0.03], pos: [-0.34, 0.93, 0.65], color: "steel", fine: true },
      // conteneur d'équipe, court, à droite derrière
      { shape: "bevel", size: [0.62, 0.52, 0.86], pos: [0.34, 0.89, -0.44], bevel: 0.03, color: "faction" },
      ...[-0.7, -0.44, -0.18].map((z): Part => ({ shape: "box", size: [0.64, 0.42, 0.03], pos: [0.34, 0.89, z], color: "metal", fine: true })),
      // sangles des conteneurs
      ...[-0.6, 0.35].map((z): Part => ({ shape: "box", size: [0.68, 0.64, 0.04], pos: [-0.34, 0.93, z], color: "black" })),
      { shape: "box", size: [0.66, 0.56, 0.04], pos: [0.34, 0.89, -0.56], color: "black", fine: true },
      // caisses à l'avant droit, filet tendu, sac
      ...coffre([0.34, 0.76, 0.45], [0.6, 0.26, 0.6], "wood"),
      ...coffre([0.26, 1.0, 0.4], [0.34, 0.22, 0.4], "wood"),
      { shape: "lathe", sides: 6, pos: [0.52, 0.89, 0.58], color: "dry", profile: [[0, 0], [0.1, 0], [0.13, 0.08], [0.1, 0.18], [0, 0.2]] },
      ...[0.2, 0.4, 0.6].map((z): Part => ({ shape: "tube", radius: 0.01, sides: 3, path: [[0.04, 0.65, z], [0.08, 1.13, z], [0.6, 1.13, z], [0.66, 0.65, z]], bend: 0.05, color: "black", fine: true })),
      ...[0.16, 0.34, 0.52].map((x): Part => ({ shape: "tube", radius: 0.01, sides: 3, path: [[x, 0.65, 0.12], [x, 1.13, 0.18], [x, 1.13, 0.62], [x, 0.65, 0.76]], bend: 0.05, color: "black", fine: true })),
      { shape: "box", size: [0.1, 0.05, 0.03], pos: [-0.6, 0.7, 0.86], color: "amber" },
    ],
  },
  // t_lab : laboratoire nomade ; tente à faîtage (toile sable, bande d'équipe, porte sombre) à l'arrière, deux
  // mâts d'antenne haubanés à feu ambre, parabole d'observation tournante (pivot « radar ») sur un mât
  // télescopique, caisse d'instruments à petit écran
  t_lab: {
    parts: [
      ...socleNomade(2, 2),
      // tente à faîtage
      { shape: "extrude", profile: [[-0.66, 0], [0.66, 0], [0.6, 0.36], [0, 0.72], [-0.6, 0.36]], depth: 0.9, pos: [0, 0.62, -0.4], color: "dry" },
      { shape: "extrude", profile: [[-0.1, 0.62], [0.1, 0.62], [0, 0.74]], depth: 0.94, pos: [0, 0.62, -0.4], color: "faction" },
      { shape: "extrude", profile: [[-0.66, 0], [0.66, 0], [0.6, 0.36], [0, 0.72], [-0.6, 0.36]], depth: 0.04, pos: [0, 0.62, 0.05], scale: [1.03, 1.03, 1], color: "metal", fine: true },
      { shape: "extrude", profile: [[-0.18, 0], [0.18, 0], [0.12, 0.42], [-0.12, 0.42]], depth: 0.02, pos: [0, 0.62, 0.065], color: "black" },
      { shape: "extrude", profile: [[-0.62, 0.02], [-0.28, 0.02], [-0.28, 0.3]], depth: 0.02, pos: [0, 0.62, 0.07], color: "faction" },
      { shape: "tube", radius: 0.008, sides: 3, path: [[0, 1.34, -0.85], [0, 0.62, -0.88]], color: "black", fine: true },
      // mât à parabole (avant droit) : tronçons télescopiques, parabole tournante
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.7, pos: [0.42, 0.97, 0.45], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.045, height: 0.5, pos: [0.42, 1.55, 0.45], color: "steel" },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.08, pos: [0.42, 1.82, 0.45], color: "dark", pivot: "radar" },
      { shape: "lathe", sides: 14, pos: [0.42, 2.05, 0.52], rot: [-60, 0, 0], color: "light", parent: "radar", profile: [[0, 0], [0.12, 0.01], [0.24, 0.05], [0.32, 0.11], [0.3, 0.12], [0.22, 0.07], [0.1, 0.03], [0, 0.02]] },
      { shape: "box", size: [0.06, 0.24, 0.06], pos: [0.42, 1.94, 0.47], rot: [30, 0, 0], color: "dark", parent: "radar" },
      { shape: "tube", radius: 0.01, sides: 4, path: [[0.42, 2.1, 0.55], [0.42, 2.28, 0.74]], color: "steel", parent: "radar", fine: true },
      { shape: "sphere", radius: 0.03, pos: [0.42, 2.29, 0.75], color: "amber", parent: "radar" },
      // deux mâts d'antenne fins haubanés
      ...[[-0.56, 0.6, 2.4], [0.58, -0.78, 2.1]].flatMap(([x, z, top]): Part[] => [
        { shape: "cylinder", sides: 6, radius: 0.035, height: q(top - 0.62), pos: [x, q((top + 0.62) / 2), z], color: "steel" },
        { shape: "cylinder", sides: 6, radius: 0.05, height: 0.08, pos: [x, q(top * 0.6 + 0.25), z], color: "dark" },
        { shape: "sphere", radius: 0.04, pos: [x, top, z], color: "amber" },
        { shape: "box", size: [0.3, 0.02, 0.02], pos: [x, q(top - 0.25), z], color: "dark", fine: true },
        { shape: "tube", radius: 0.006, sides: 3, path: [[x, q(top - 0.2), z], [q(x * 1.5), 0.04, q(z * 1.2)]], color: "black", fine: true },
      ]),
      // caisse d'instruments, petit écran
      ...coffre([-0.3, 0.76, 0.58], [0.46, 0.26, 0.34], "rust"),
      { shape: "box", size: [0.26, 0.12, 0.02], pos: [-0.3, 0.8, 0.755], color: "glow" },
      { shape: "box", size: [0.06, 0.04, 0.03], pos: [-0.12, 0.8, 0.755], color: "amber", fine: true },
    ],
  },
  // t_workshop : atelier (usine d'unités, 3 x 3) ; grande tente-hangar de toile sable sur arceaux, bandes d'équipe,
  // gueule sombre à l'avant sous un rouleau de bâche, rampe d'acier rayée jusqu'au sol (+z) ; grue repliable à
  // l'arrière droit, cheminée à l'arrière gauche, coffres sanglés de part et d'autre de la rampe
  t_workshop: {
    parts: [
      ...socleNomade(3, 3, 0.4),
      // tente-hangar
      ...bache(0, 0.62, -0.3, 0.96, 1.12, 2.1, "dry", 2),
      ...[-0.65, 0.05].map((z): Part => ({ shape: "extrude", profile: arceau(0.98, 1.14, 0.03), depth: 0.05, pos: [0, 0.62, z], color: "metal", fine: true })),
      { shape: "box", size: [0.18, 0.04, 2.14], pos: [0, 1.75, -0.3], color: "rust" },
      // gueule : ouverture sombre, montants, rouleau de bâche relevée, feux
      { shape: "extrude", profile: voute(0.72, 0.88), depth: 0.04, pos: [0, 0.62, 0.76], color: "black" },
      { shape: "box", size: [0.08, 0.92, 0.08], pos: [0.76, 1.08, 0.76], color: "rust", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 1.5, pos: [0, 1.56, 0.8], rot: [0, 0, 90], color: "dry" },
      { shape: "box", size: [1.5, 0.06, 0.03], pos: [0, 1.56, 0.89], color: "faction" },
      { shape: "box", size: [0.12, 0.08, 0.03], pos: [0.56, 1.36, 0.8], color: "amber", mirror: true },
      // rampe vers l'avant : plan incliné d'acier, rayures, rambardes
      { shape: "bevel", size: [1.3, 0.03, 0.2], pos: [0, 0.635, 0.86], bevel: 0.01, color: "steel" },
      { shape: "wedge", size: [1.3, 0.62, 0.56], pos: [0, 0.31, 1.22], color: "metal" },
      ...[1.06, 1.22, 1.38].map((z): Part => ({ shape: "box", size: [1.26, 0.02, 0.05], pos: [0, q(0.635 - (z - 0.94) * 1.107), z], rot: [48, 0, 0], color: "hazard", fine: true })),
      { shape: "box", size: [0.06, 0.08, 0.8], pos: [0.68, 0.36, 1.2], rot: [48, 0, 0], color: "rust", mirror: true },
      // grue repliable : fût, flèche, vérin, câble, crochet
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.3, pos: [1.04, 0.77, -1.1], color: "dark" },
      { shape: "box", size: [0.12, 1.4, 0.12], pos: [1.04, 1.6, -1.1], color: "rust" },
      { shape: "box", size: [0.1, 0.1, 1.5], pos: [1.04, 2.26, -0.45], rot: [-8, 0, 0], color: "faction" },
      { shape: "tube", radius: 0.025, path: [[1.04, 1.4, -1.05], [1.04, 2.15, -0.8]], color: "steel" },
      { shape: "tube", radius: 0.008, sides: 3, path: [[1.04, 2.34, 0.27], [1.04, 1.7, 0.28]], color: "black", fine: true },
      { shape: "box", size: [0.08, 0.1, 0.06], pos: [1.04, 1.66, 0.28], color: "hazard" },
      // cheminée de l'arrière gauche
      { shape: "lathe", sides: 10, pos: [-1.04, 0.62, -1.1], color: "dark", profile: [[0, 0], [0.14, 0], [0.14, 0.08], [0.11, 0.12], [0.11, 1.45], [0.14, 1.5], [0.14, 1.56], [0, 1.56]] },
      { shape: "cylinder", sides: 6, radius: 0.17, height: 0.03, pos: [-1.04, 2.3, -1.1], color: "rust" },
      // coffres de part et d'autre de la rampe et le long des flancs
      ...coffre([-0.98, 0.75, 0.7], [0.36, 0.24, 0.4], "rust"),
      ...coffre([0.98, 0.75, 0.7], [0.36, 0.24, 0.4], "wood"),
      ...coffre([-1.05, 0.73, 0.35], [0.2, 0.2, 0.5], "wood"),
      { shape: "lathe", sides: 8, pos: [1.06, 0.62, 0.4], color: "dry", profile: [[0, 0], [0.1, 0], [0.1, 0.3], [0.07, 0.34], [0, 0.34]] },
    ],
  },
  // t_bastion : bastion ; tourelle lourde ancrée sur le socle nomade, plaques de blindage rouille inclinées au bord
  // du plateau ; tourelle à pans (pivot « tourelle ») à masque de toile, long fût d'acier, caisse de munitions
  // arrière, épiscope, antenne
  t_bastion: {
    parts: [
      ...socleNomade(2, 2),
      // plaques de blindage (parapet) autour du plateau
      { shape: "box", size: [1.3, 0.3, 0.06], pos: [0, 0.74, 0.82], rot: [-20, 0, 0], color: "rust" },
      { shape: "box", size: [0.06, 0.3, 1.5], pos: [0.66, 0.74, 0], rot: [0, 0, -20], color: "rust", mirror: true },
      { shape: "box", size: [1.3, 0.3, 0.06], pos: [0, 0.74, -0.82], rot: [20, 0, 0], color: "rust" },
      { shape: "box", size: [1.1, 0.06, 0.04], pos: [0, 0.82, 0.86], rot: [-20, 0, 0], color: "faction" },
      { shape: "box", size: [0.04, 0.06, 1.3], pos: [0.7, 0.82, 0], rot: [0, 0, -20], color: "faction", mirror: true },
      // tourelle (pivot)
      { shape: "cylinder", sides: 14, radius: 0.6, height: 0.16, pos: [0, 0.7, 0], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.48, -0.6], [0.48, -0.6], [0.55, -0.1], [0.4, 0.42], [-0.4, 0.42], [-0.55, -0.1]], depth: 0.46, bevel: 0.05, pos: [0, 1.01, -0.2], rot: [90, 0, 0], color: "metal", parent: "tourelle" },
      { shape: "extrude", profile: [[-0.48, -0.6], [0.48, -0.6], [0.55, -0.1], [0.4, 0.42], [-0.4, 0.42], [-0.55, -0.1]], depth: 0.05, pos: [0, 1.255, -0.22], rot: [90, 0, 0], scale: [0.78, 0.78, 1], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.04, 0.16, 0.8], pos: [0.53, 1.0, -0.3], rot: [0, 0, -8], color: "rust", mirror: true, parent: "tourelle" },
      // masque de toile, fût, frein de bouche
      { shape: "lathe", sides: 10, pos: [0, 1.0, 0.14], rot: [90, 0, 0], color: "dry", parent: "tourelle", profile: [[0, 0], [0.2, 0], [0.21, 0.06], [0.15, 0.15], [0.08, 0.2], [0, 0.2]] },
      { shape: "lathe", sides: 10, pos: [0, 1.0, 0.2], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: fut(0.06, 0.8) },
      { shape: "box", size: [0.2, 0.04, 0.06], pos: [0, 1.0, 0.96], color: "dark", parent: "tourelle", fine: true },
      // nuque : caisse de munitions sanglée, épiscope, antenne
      { shape: "bevel", size: [0.6, 0.24, 0.24], pos: [0, 1.02, -0.86], bevel: 0.03, color: "wood", parent: "tourelle" },
      { shape: "box", size: [0.62, 0.26, 0.035], pos: [0, 1.02, -0.86], color: "black", parent: "tourelle", fine: true },
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.12, pos: [-0.2, 1.33, -0.3], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.12, 0.04, 0.02], pos: [-0.2, 1.35, -0.18], color: "amber", parent: "tourelle" },
      { shape: "tube", radius: 0.01, sides: 4, path: [[0.3, 1.27, -0.55], [0.3, 1.9, -0.6]], color: "steel", parent: "tourelle", fine: true },
      { shape: "sphere", radius: 0.025, pos: [0.3, 1.91, -0.6], color: "amber", parent: "tourelle", fine: true },
    ],
  },
};

// ——— Unités ———

/** Chargement du chenillard foreuse : mât de forage couché, vrille couchée à filet, tête motrice d'équipe. */
function chDrill(): Part[] {
  return [
    // berceaux
    ...[-1.05, 0.3].map((z): Part => ({ shape: "box", size: [0.7, 0.16, 0.12], pos: [0, 0.72, z], color: "dark" })),
    // mât couché : deux rails, entretoises, moufle à l'arrière
    { shape: "box", size: [0.07, 0.08, 1.8], pos: [0.27, 0.82, -0.38], color: "rust", mirror: true },
    ...[-1.0, -0.4, 0.2].map((z): Part => ({ shape: "box", size: [0.5, 0.05, 0.05], pos: [0, 0.82, z], color: "dark" })),
    { shape: "bevel", size: [0.66, 0.2, 0.3], pos: [0, 0.86, -1.18], bevel: 0.03, color: "metal" },
    // vrille couchée (pointe vers l'avant) à filet sombre
    { shape: "lathe", sides: 10, pos: [0, 1.04, -0.95], rot: [90, 0, 0], color: "steel", profile: [[0, 0], [0.14, 0], [0.15, 0.1], [0.14, 1.2], [0.06, 1.42], [0, 1.48]] },
    { shape: "tube", radius: 0.026, sides: 4, path: heliceZ(0, 1.04, 0.16, -0.85, 0.35, 3.5, 24), bend: 0, color: "dark", fine: true },
    // tête motrice
    { shape: "bevel", size: [0.44, 0.3, 0.3], pos: [0, 1.04, -0.98], bevel: 0.04, color: "faction" },
    { shape: "tube", radius: 0.03, sides: 5, path: [[0.2, 1.1, -1.05], [0.45, 0.9, -0.8], [0.5, 0.72, -0.4]], bend: 0.1, color: "copper", fine: true },
    // vérin replié
    { shape: "tube", radius: 0.05, path: [[-0.42, 0.74, -1.1], [-0.42, 0.74, 0.1]], color: "dark" },
    { shape: "tube", radius: 0.035, path: [[-0.42, 0.74, 0.1], [-0.42, 0.74, 0.4]], color: "steel" },
  ];
}

/** Chargement du chenillard fonderie : creuset couvert sur tourillons, cheminée couchée en tronçons, bac de charbon. */
function chFurnace(): Part[] {
  return [
    { shape: "box", size: [0.08, 0.36, 0.2], pos: [0.44, 0.84, 0.05], color: "rust", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.06, height: 0.96, pos: [0, 0.94, 0.05], rot: [0, 0, 90], color: "steel" },
    { shape: "lathe", sides: 14, pos: [0, 0.66, 0.05], color: "dark", profile: [[0, 0], [0.2, 0], [0.28, 0.06], [0.34, 0.24], [0.37, 0.48], [0.4, 0.52], [0.4, 0.55], [0, 0.55]] },
    { shape: "lathe", sides: 14, pos: [0, 1.2, 0.05], color: "rust", profile: [[0, 0], [0.41, 0], [0.41, 0.04], [0.3, 0.1], [0.1, 0.13], [0, 0.13]] },
    { shape: "box", size: [0.2, 0.05, 0.05], pos: [0, 1.36, 0.05], color: "steel" },
    { shape: "wedge", size: [0.14, 0.07, 0.16], pos: [0, 1.17, 0.47], color: "dark" },
    { shape: "box", size: [0.08, 0.04, 0.02], pos: [0, 1.0, 0.41], color: "amber" },
    // cheminée en tronçons couchés vers l'arrière
    { shape: "lathe", sides: 10, pos: [0.34, 0.86, -0.4], rot: [-90, 0, 0], color: "dark", profile: [[0, 0], [0.17, 0], [0.17, 0.75], [0.14, 0.78], [0.14, 0.85], [0, 0.85]] },
    { shape: "torus", radius: 0.175, tube: 0.02, sides: 10, pos: [0.34, 0.86, -0.7], rot: [90, 0, 0], color: "rust", fine: true },
    { shape: "cylinder", sides: 6, radius: 0.2, height: 0.04, pos: [0.34, 0.86, -1.27], rot: [90, 0, 0], color: "rust" },
    // bac de charbon, coffre
    ...coffre([-0.34, 0.78, -0.82], [0.48, 0.24, 0.62], "rust"),
    { shape: "box", size: [0.44, 0.04, 0.58], pos: [-0.34, 0.9, -0.82], color: "black" },
  ];
}

/** Chargement du chenillard assembleur : bras replié sur son plateau, rouleau de bâche, établi plié, caisses. */
function chAssembler(): Part[] {
  return [
    // bras replié en Z : plateau tournant, épaule, bras d'équipe relevé vers l'arrière, avant-bras rabattu, pince
    { shape: "cylinder", sides: 12, radius: 0.26, height: 0.1, pos: [0.15, 0.7, 0.2], color: "steel" },
    { shape: "bevel", size: [0.28, 0.24, 0.3], pos: [0.15, 0.87, 0.2], bevel: 0.04, color: "dark" },
    { shape: "tube", radius: 0.09, sides: 4, path: [[0.15, 0.95, 0.2], [0.15, 1.42, -0.48]], color: "faction" },
    { shape: "cylinder", sides: 8, radius: 0.1, height: 0.26, pos: [0.15, 1.45, -0.5], rot: [0, 0, 90], color: "steel" },
    { shape: "tube", radius: 0.07, sides: 4, path: [[0.15, 1.42, -0.5], [0.15, 1.08, 0.3]], color: "rust" },
    { shape: "bevel", size: [0.2, 0.14, 0.12], pos: [0.15, 1.04, 0.36], bevel: 0.02, color: "dark" },
    { shape: "box", size: [0.03, 0.14, 0.04], pos: [0.22, 0.94, 0.4], color: "steel" },
    { shape: "box", size: [0.03, 0.14, 0.04], pos: [0.08, 0.94, 0.4], color: "steel" },
    { shape: "tube", radius: 0.018, sides: 4, path: [[0.3, 0.95, 0.15], [0.3, 1.4, -0.4]], color: "copper", fine: true },
    // rouleau de bâche (auvent replié) et perches
    { shape: "cylinder", sides: 8, radius: 0.12, height: 1.2, pos: [0, 0.78, -1.08], rot: [0, 0, 90], color: "dry" },
    ...[-0.3, 0.3].map((x): Part => ({ shape: "box", size: [0.1, 0.25, 0.04], pos: [x, 0.78, -1.08], color: "faction" })),
    { shape: "box", size: [1.2, 0.04, 0.04], pos: [0, 0.7, -0.88], color: "wood" },
    { shape: "box", size: [1.2, 0.04, 0.04], pos: [0, 0.75, -0.92], color: "wood" },
    // établi plié, caisses
    { shape: "bevel", size: [0.4, 0.12, 0.6], pos: [-0.38, 0.72, -0.3], bevel: 0.02, color: "wood" },
    ...coffre([-0.38, 0.86, -0.32], [0.32, 0.16, 0.3], "rust"),
    ...coffre([-0.38, 0.75, 0.3], [0.36, 0.2, 0.34], "wood"),
  ];
}

/** Chargement du chenillard raffinerie : cuve couchée sable à bandes d'équipe, colonne couchée cerclée, tuyaux. */
function chRefinery(): Part[] {
  return [
    ...[-1.0, 0.25].map((z): Part => ({ shape: "box", size: [1.2, 0.14, 0.1], pos: [0, 0.71, z], color: "dark" })),
    { shape: "lathe", sides: 12, pos: [-0.26, 1.0, -1.25], rot: [90, 0, 0], color: "dry", profile: [[0, 0], [0.2, 0.02], [0.3, 0.1], [0.32, 0.2], [0.32, 1.6], [0.3, 1.7], [0.2, 1.78], [0, 1.8]] },
    ...[-0.85, 0.05].map((z): Part => ({ shape: "cylinder", sides: 12, radius: 0.33, height: 0.1, pos: [-0.26, 1.0, z], rot: [90, 0, 0], color: "faction" })),
    { shape: "cylinder", sides: 8, radius: 0.06, height: 0.08, pos: [-0.26, 1.34, -0.4], color: "steel" },
    // colonne couchée
    { shape: "lathe", sides: 12, pos: [0.38, 0.95, -1.25], rot: [90, 0, 0], color: "metal", profile: [[0, 0], [0.22, 0], [0.22, 1.5], [0.14, 1.62], [0, 1.66]] },
    ...[-0.9, -0.45, 0.0].map((z): Part => ({ shape: "torus", radius: 0.225, tube: 0.02, sides: 12, pos: [0.38, 0.95, z], rot: [90, 0, 0], color: "rust", fine: true })),
    { shape: "tube", radius: 0.035, path: [[0.1, 1.15, -1.1], [0.1, 1.25, -0.6], [-0.05, 1.25, -0.2]], bend: 0.08, color: "copper" },
    { use: "vanne", pos: [-0.26, 1.36, 0.1], scale: 0.8 },
  ];
}

/** Chargement du chenillard générateur : bloc moteur et radiateur, pylône couché en treillis, isolateurs. */
function chGenerator(): Part[] {
  return [
    { shape: "bevel", size: [0.62, 0.34, 0.8], pos: [0.2, 0.82, -0.02], bevel: 0.04, color: "metal" },
    ...[-0.25, -0.02, 0.21].map((z): Part => ({ shape: "bevel", size: [0.46, 0.08, 0.16], pos: [0.2, 1.03, z], bevel: 0.02, color: "dark" })),
    { shape: "box", size: [0.04, 0.2, 0.66], pos: [0.52, 0.82, -0.02], color: "faction" },
    { shape: "bevel", size: [0.62, 0.36, 0.2], pos: [0.2, 0.83, 0.48], bevel: 0.03, color: "dark" },
    ...[0.72, 0.82, 0.92].map((y): Part => ({ shape: "box", size: [0.54, 0.02, 0.02], pos: [0.2, y, 0.585], color: "black", fine: true })),
    { shape: "tube", radius: 0.045, path: [[0.42, 0.95, -0.3], [0.42, 1.25, -0.3]], color: "rust" },
    // pylône couché en treillis (côté gauche) : longerons, entretoises, traverse et isolateurs
    { shape: "box", size: [0.05, 0.05, 1.9], pos: [-0.5, 0.74, -0.35], color: "rust" },
    { shape: "box", size: [0.05, 0.05, 1.9], pos: [-0.22, 0.74, -0.35], color: "rust" },
    { shape: "box", size: [0.05, 0.05, 1.9], pos: [-0.36, 0.9, -0.35], color: "rust" },
    ...[-1.1, -0.7, -0.3, 0.1, 0.5].map((z): Part => ({ shape: "tube", radius: 0.015, sides: 4, path: [[-0.5, 0.74, z], [-0.36, 0.9, q(z + 0.2)], [-0.22, 0.74, q(z + 0.4)]], color: "dark", fine: true })),
    { shape: "box", size: [0.08, 0.6, 0.08], pos: [-0.36, 0.95, -1.22], rot: [0, 0, 90], color: "dark" },
    ...[-0.62, -0.1].map((x): Part => ({ shape: "cylinder", sides: 6, radius: 0.04, height: 0.12, pos: [x, 1.05, -1.22], color: "light" })),
    ...coffre([0.24, 0.76, -0.82], [0.4, 0.2, 0.4], "wood"),
  ];
}

/** Chargement du chenillard soute : conteneur rouille et conteneur d'équipe gerbés, sangles, filet. */
function chHold(): Part[] {
  return [
    { shape: "bevel", size: [1.2, 0.48, 1.0], pos: [0, 0.89, -0.78], bevel: 0.03, color: "rust" },
    ...[-1.15, -0.95, -0.75, -0.55].map((z): Part => ({ shape: "box", size: [1.22, 0.38, 0.03], pos: [0, 0.89, z], color: "dark", fine: true })),
    { shape: "bevel", size: [1.1, 0.42, 0.8], pos: [0, 0.86, 0.12], bevel: 0.03, color: "faction" },
    ...[-0.12, 0.12, 0.36].map((z): Part => ({ shape: "box", size: [1.12, 0.32, 0.03], pos: [0, 0.86, z], color: "metal", fine: true })),
    ...coffre([0.2, 1.24, -0.88], [0.5, 0.22, 0.5], "wood"),
    ...coffre([-0.3, 1.23, -0.62], [0.36, 0.2, 0.36], "wood"),
    // sangles et filet
    ...[-1.05, -0.5, 0.1].map((z): Part => ({ shape: "box", size: [1.24, 0.52, 0.04], pos: [0, 0.89, z], color: "black" })),
    ...[-0.4, 0.0, 0.4].map((x): Part => ({ shape: "tube", radius: 0.01, sides: 3, path: [[x, 1.13, -1.26], [x, 1.36, -1.1], [x, 1.36, -0.45], [x, 1.13, -0.3]], bend: 0.05, color: "black", fine: true })),
  ];
}

/** Chargement du chenillard laboratoire : mât télescopique couché, parabole repliée, tente roulée, caisse d'instruments. */
function chLab(): Part[] {
  return [
    // mât couché sur sa béquille, parabole retournée à l'arrière
    { shape: "box", size: [0.12, 0.22, 0.12], pos: [0.3, 0.76, 0.3], color: "dark" },
    { shape: "cylinder", sides: 8, radius: 0.06, height: 1.3, pos: [0.3, 0.9, -0.38], rot: [90, 0, 0], color: "rust" },
    { shape: "cylinder", sides: 8, radius: 0.045, height: 0.5, pos: [0.3, 0.9, 0.42], rot: [90, 0, 0], color: "steel" },
    { shape: "sphere", radius: 0.04, pos: [0.3, 0.9, 0.68], color: "amber" },
    { shape: "lathe", sides: 14, pos: [0.22, 0.85, -0.92], rot: [0, 0, 0], color: "light", profile: [[0, 0], [0.12, 0.01], [0.24, 0.05], [0.34, 0.11], [0.32, 0.12], [0.22, 0.07], [0.1, 0.03], [0, 0.02]] },
    { shape: "box", size: [0.05, 0.16, 0.05], pos: [0.22, 0.75, -0.92], color: "dark" },
    // tente roulée et sac
    { shape: "cylinder", sides: 8, radius: 0.13, height: 0.6, pos: [-0.3, 0.8, -0.95], rot: [90, 0, 0], color: "dry" },
    ...[-1.1, -0.8].map((z): Part => ({ shape: "torus", radius: 0.135, tube: 0.02, sides: 8, pos: [-0.3, 0.8, z], rot: [90, 0, 0], color: "faction" })),
    // caisse d'instruments, antennes fouet couchées
    ...coffre([-0.3, 0.79, -0.15], [0.48, 0.26, 0.5], "rust"),
    { shape: "box", size: [0.26, 0.1, 0.02], pos: [-0.3, 0.82, 0.105], color: "glow" },
    { shape: "tube", radius: 0.012, sides: 4, path: [[-0.5, 0.95, -0.2], [-0.5, 0.95, 0.5]], color: "steel", fine: true },
    { shape: "tube", radius: 0.012, sides: 4, path: [[-0.1, 0.95, -0.2], [-0.1, 0.95, 0.5]], color: "steel", fine: true },
  ];
}

/** Chargement du chenillard bastion : tourelle à pans, long fût couché vers l'arrière sur un berceau de route. */
function chBastion(): Part[] {
  return [
    { shape: "cylinder", sides: 14, radius: 0.5, height: 0.12, pos: [0, 0.7, 0.05], color: "steel" },
    { shape: "extrude", profile: [[-0.4, -0.42], [0.4, -0.42], [0.46, 0.0], [0.34, 0.48], [-0.34, 0.48], [-0.46, 0.0]], depth: 0.36, bevel: 0.04, pos: [0, 0.94, 0.05], rot: [90, 0, 0], color: "metal" },
    { shape: "extrude", profile: [[-0.4, -0.42], [0.4, -0.42], [0.46, 0.0], [0.34, 0.48], [-0.34, 0.48], [-0.46, 0.0]], depth: 0.04, pos: [0, 1.13, 0.03], rot: [90, 0, 0], scale: [0.76, 0.76, 1], color: "faction" },
    // fût couché vers l'arrière, masque de toile
    { shape: "lathe", sides: 10, pos: [0, 0.94, -0.3], rot: [-90, 0, 0], color: "dry", profile: [[0, 0], [0.2, 0], [0.2, 0.06], [0.14, 0.18], [0, 0.2]] },
    { shape: "lathe", sides: 10, pos: [0, 0.94, -0.4], rot: [-90, 0, 0], color: "steel", profile: fut(0.065, 1.05) },
    // berceau de route (verrou du fût)
    { shape: "tube", radius: 0.03, sides: 4, path: [[-0.2, 0.65, -1.12], [0, 0.92, -1.12], [0.2, 0.65, -1.12]], color: "rust" },
    { shape: "box", size: [0.2, 0.06, 0.08], pos: [0, 0.88, -1.12], color: "hazard" },
    // plaques de blindage repliées sur les côtés
    { shape: "box", size: [0.05, 0.3, 0.9], pos: [0.6, 0.8, -0.6], rot: [0, 0, -12], color: "rust", mirror: true },
    ...coffre([0, 0.8, 0.5], [0.5, 0.18, 0.18], "wood"),
  ];
}

/** Chargement du chenillard atelier (châssis de 3,2) : tente-hangar pliée en accordéon, arceaux gerbés, rampe relevée. */
function chWorkshop(): Part[] {
  return [
    // toile pliée : voûte basse et plis
    ...bache(0, 0.65, -0.5, 0.66, 0.42, 1.5, "dry", 2),
    ...[-1.2, -1.1, -1.0].map((z): Part => ({ shape: "extrude", profile: arceau(0.69, 0.46, 0.04, 6), depth: 0.05, pos: [0, 0.65, z], color: "metal" })),
    { shape: "box", size: [0.12, 0.04, 1.54], pos: [0, 1.08, -0.5], color: "rust" },
    // rampe relevée à l'arrière (plaque rayée)
    { shape: "box", size: [1.1, 0.5, 0.06], pos: [0, 0.92, -1.52], rot: [-12, 0, 0], color: "metal" },
    ...[0.78, 0.94, 1.1].map((y): Part => ({ shape: "box", size: [1.06, 0.03, 0.02], pos: [0, y, q(-1.55 + (y - 0.92) * 0.2)], rot: [-12, 0, 0], color: "hazard", fine: true })),
    // grue repliée, coffres
    { shape: "box", size: [0.1, 0.1, 1.2], pos: [0.56, 0.75, 0.0], color: "faction" },
    { shape: "box", size: [0.1, 0.1, 0.9], pos: [-0.56, 0.75, 0.05], color: "rust" },
    ...coffre([0.3, 0.76, 0.38], [0.36, 0.22, 0.3], "wood"),
    ...coffre([-0.3, 0.76, 0.38], [0.36, 0.22, 0.3], "rust"),
  ];
}

export const TRANSH_UNIT_MODELS: Record<string, Model> = {
  // ark : l'Arche, chenillard-ville ; quatre trains de chenilles larges sous une caisse longue à jupes d'équipe,
  // tourelle de proue à canon (pivot « tourelle »), passerelle à fente vitrée, rangée de tentes sur arceaux et
  // cheminées, grue couchée, tourelle antiaérienne arrière à deux fûts (pivot « tourelle_aa »), coffres et mât
  ark: {
    parts: [
      ...chenille(1.0, 2.1, 0.66, 0.5, 0, 1.18, 0),
      ...chenille(1.0, 2.1, 0.66, 0.5, 0, -1.18, 0),
      { shape: "box", size: [0.56, 0.06, 4.6], pos: [1.0, 0.7, 0], color: "rust", mirror: true },
      { shape: "box", size: [0.04, 0.22, 4.1], pos: [1.29, 0.6, 0], color: "faction", mirror: true },
      // caisse longue à proue inclinée, pont
      { shape: "extrude", profile: [[-2.4, 0.24], [2.0, 0.24], [2.45, 0.55], [2.3, 0.92], [-2.3, 0.92], [-2.42, 0.6]], depth: 1.44, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "box", size: [2.1, 0.06, 4.5], pos: [0, 0.94, -0.05], color: "metal" },
      ...[-0.7, 0, 0.7].map((x): Part => ({ shape: "box", size: [0.02, 0.012, 4.3], pos: [x, 0.975, -0.05], color: "dark", fine: true })),
      // tourelle de proue (pivot) : couronne, caisse à pans, fût
      { shape: "cylinder", sides: 12, radius: 0.46, height: 0.14, pos: [0, 1.04, 1.7], color: "steel", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.38, -0.42], [0.38, -0.42], [0.44, 0.02], [0.3, 0.4], [-0.3, 0.4], [-0.44, 0.02]], depth: 0.32, bevel: 0.04, pos: [0, 1.26, 1.66], rot: [90, 0, 0], color: "metal", parent: "tourelle" },
      { shape: "box", size: [0.5, 0.03, 0.5], pos: [0, 1.43, 1.64], color: "faction", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.075, height: 0.9, pos: [0, 1.26, 2.43], rot: [90, 0, 0], color: "steel", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.11, height: 0.14, pos: [0, 1.26, 2.86], rot: [90, 0, 0], color: "dark", parent: "tourelle" },
      { shape: "lathe", sides: 8, pos: [0, 1.26, 1.94], rot: [90, 0, 0], color: "dry", parent: "tourelle", profile: [[0, 0], [0.17, 0], [0.12, 0.12], [0, 0.14]] },
      // passerelle : caisse d'acier, fente vitrée, toit de bâche, gyrophare
      { shape: "bevel", size: [1.7, 0.5, 0.62], pos: [0, 1.22, 0.85], bevel: 0.05, color: "metal" },
      { shape: "box", size: [1.3, 0.1, 0.03], pos: [0, 1.36, 1.165], color: "glass" },
      { shape: "box", size: [1.8, 0.08, 0.72], pos: [0, 1.5, 0.85], color: "rust" },
      { shape: "sphere", radius: 0.05, pos: [0.6, 1.72, 0.85], color: "amber" },
      { shape: "box", size: [0.14, 0.07, 0.03], pos: [0.85, 0.72, 2.36], color: "amber", mirror: true },
      // rangée de tentes sur arceaux
      ...bache(-0.3, 0.97, -0.05, 0.62, 0.66, 0.95, "rust", 1, false),
      ...bache(0, 0.97, -1.22, 0.86, 0.74, 1.05, "dry", 1, false),
      // cheminées
      { shape: "lathe", sides: 10, pos: [0.62, 0.97, 0.38], color: "dark", profile: [[0, 0], [0.15, 0], [0.11, 0.12], [0.11, 1.25], [0.14, 1.36], [0, 1.36]] },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 0.03, pos: [0.62, 2.42, 0.38], color: "rust" },
      { shape: "lathe", sides: 10, pos: [-0.75, 0.97, -0.68], color: "dark", profile: [[0, 0], [0.13, 0], [0.09, 0.12], [0.09, 1.0], [0.12, 1.1], [0, 1.1]] },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.03, pos: [-0.75, 2.12, -0.68], color: "rust" },
      // grue couchée le long du flanc droit
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.24, pos: [0.82, 1.09, -2.0], color: "dark" },
      { shape: "box", size: [0.12, 0.12, 1.7], pos: [0.86, 1.24, -1.1], rot: [3, 0, 0], color: "faction" },
      { shape: "box", size: [0.1, 0.16, 0.12], pos: [0.86, 1.18, -0.24], color: "hazard" },
      // tourelle antiaérienne arrière (pivot) : socle, caisse, deux fûts relevés
      { shape: "cylinder", sides: 10, radius: 0.3, height: 0.14, pos: [0, 1.04, -2.02], color: "steel", pivot: "tourelle_aa" },
      { shape: "box", size: [0.44, 0.26, 0.4], pos: [0, 1.24, -2.04], color: "metal", parent: "tourelle_aa" },
      incl([0.13, 1.3, -1.95], 50, 0.35, 0, { shape: "cylinder", sides: 6, radius: 0.04, height: 0.7, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle_aa" }),
      incl([0.13, 1.3, -1.95], 50, 0.72, 0, { shape: "cylinder", sides: 8, radius: 0.055, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle_aa", fine: true }),
      { shape: "box", size: [0.3, 0.03, 0.2], pos: [0, 1.38, -2.1], color: "faction", parent: "tourelle_aa" },
      // coffres sanglés sur le pont, mât à fanion
      ...coffre([-0.78, 1.08, 0.38], [0.36, 0.22, 0.4], "wood"),
      ...coffre([-0.78, 1.08, -2.0], [0.4, 0.22, 0.4], "rust"),
      { shape: "cylinder", sides: 6, radius: 0.025, height: 1.5, pos: [-0.45, 2.2, 0.75], color: "steel", fine: true },
      { shape: "box", size: [0.02, 0.22, 0.38], pos: [-0.45, 2.8, 0.56], color: "faction", fine: true },
      { shape: "sphere", radius: 0.04, pos: [-0.45, 2.96, 0.75], color: "amber", fine: true },
    ],
  },
  ch_drill: { parts: [...chenillard(), ...chDrill()] },
  ch_furnace: { parts: [...chenillard(), ...chFurnace()] },
  ch_assembler: { parts: [...chenillard(), ...chAssembler()] },
  ch_refinery: { parts: [...chenillard(), ...chRefinery()] },
  ch_generator: { parts: [...chenillard(), ...chGenerator()] },
  ch_hold: { parts: [...chenillard(), ...chHold()] },
  ch_lab: { parts: [...chenillard(), ...chLab()] },
  ch_workshop: { parts: [...chenillard(3.4), ...chWorkshop()] },
  ch_bastion: { parts: [...chenillard(), ...chBastion()] },
  // tracker : pisteur, buggy léger ; quatre roues à pneus, caisse ouverte d'équipe, arceau de sécurité, pare-soleil
  // de toile, mât d'observation (pivot « tourelle ») à optique ambre et mitrailleuse, bidons
  tracker: {
    parts: [
      { use: "roue_d", pos: [0.62, 0.3, 0.7], scale: [0.6, 0.6, 0.6], mirror: true },
      { use: "roue_d", pos: [0.62, 0.3, -0.7], scale: [0.6, 0.6, 0.6], mirror: true },
      { shape: "box", size: [1.1, 0.06, 0.1], pos: [0, 0.3, 0.7], color: "dark" },
      { shape: "box", size: [1.1, 0.06, 0.1], pos: [0, 0.3, -0.7], color: "dark" },
      // caisse ouverte
      { shape: "extrude", profile: [[-1.0, 0.25], [0.85, 0.25], [1.05, 0.42], [0.95, 0.55], [-0.95, 0.58], [-1.02, 0.42]], depth: 0.82, bevel: 0.03, rot: [0, -90, 0], color: "faction" },
      { shape: "box", size: [0.6, 0.04, 0.9], pos: [0, 0.59, -0.05], color: "dark" },
      { shape: "box", size: [0.6, 0.12, 0.03], pos: [0, 0.68, 0.55], rot: [-30, 0, 0], color: "glass" },
      // arceau de sécurité, pare-soleil
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.36, 0.58, 0.45], [0.33, 1.0, 0.25], [0.33, 1.0, -0.3], [0.36, 0.58, -0.5]], bend: 0.1, color: "steel", mirror: true },
      { shape: "box", size: [0.76, 0.025, 0.6], pos: [0, 1.02, -0.02], color: "dry" },
      { shape: "box", size: [0.76, 0.028, 0.1], pos: [0, 1.025, -0.02], color: "faction" },
      // phares, bidons et roue de secours
      { shape: "box", size: [0.08, 0.06, 0.03], pos: [0.3, 0.5, 1.03], color: "amber", mirror: true },
      ...[0.22, -0.22].map((x): Part => ({ shape: "bevel", size: [0.14, 0.2, 0.12], pos: [x, 0.66, -0.88], bevel: 0.02, color: "rust" })),
      { use: "roue_d", pos: [0, 0.68, -1.04], rot: [90, 0, 0], scale: [0.45, 0.45, 0.45] },
      // mât d'observation (pivot) : fût télescopique, tête optique, mitrailleuse
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.1, pos: [0, 0.65, -0.3], color: "steel", pivot: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.035, height: 0.9, pos: [0, 1.1, -0.3], color: "rust", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.025, height: 0.5, pos: [0, 1.7, -0.3], color: "steel", parent: "tourelle" },
      { shape: "bevel", size: [0.22, 0.12, 0.14], pos: [0, 1.98, -0.3], bevel: 0.02, color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.04, height: 0.04, pos: [0.06, 1.98, -0.22], rot: [90, 0, 0], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.1, 0.1, 0.24], pos: [0, 0.78, -0.25], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.025, height: 0.5, pos: [0, 0.8, 0.1], rot: [90, 0, 0], color: "steel", parent: "tourelle" },
    ],
  },
  // rider : cavalier, char rapide à chenilles larges ; caisse basse à glacis, jupes d'équipe, tourelle plate à pans
  // (pivot « tourelle ») à canon moyen et masque de toile, rouleaux de bâche et bidons sur la plage arrière
  rider: {
    parts: [
      ...chenille(0.62, 2.2, 0.42, 0.36),
      { shape: "bevel", size: [0.42, 0.04, 2.1], pos: [0.62, 0.45, 0], bevel: 0.015, color: "metal", mirror: true },
      { shape: "box", size: [0.03, 0.14, 1.6], pos: [0.83, 0.38, 0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[-1.1, 0.16], [0.8, 0.16], [1.15, 0.36], [0.9, 0.56], [-1.0, 0.58], [-1.12, 0.42]], depth: 0.86, bevel: 0.03, rot: [0, -90, 0], color: "dark" },
      { shape: "bevel", size: [1.2, 0.05, 0.6], pos: [0, 0.58, 0.55], bevel: 0.015, color: "metal" },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [0.35, 0.45, 1.06], color: "amber", mirror: true },
      // plage arrière : rouleaux de bâche, bidons
      { shape: "cylinder", sides: 8, radius: 0.09, height: 1.0, pos: [0, 0.68, -0.92], rot: [0, 0, 90], color: "dry" },
      { shape: "box", size: [0.06, 0.2, 0.2], pos: [0.25, 0.68, -0.92], color: "faction" },
      ...[0.35, -0.35].map((x): Part => ({ shape: "bevel", size: [0.14, 0.18, 0.12], pos: [x, 0.66, -0.7], bevel: 0.02, color: "rust" })),
      { shape: "tube", radius: 0.035, path: [[0.4, 0.5, -1.05], [0.4, 0.75, -1.12]], color: "rust" },
      // tourelle (pivot)
      { shape: "extrude", profile: [[-0.4, -0.45], [0.4, -0.45], [0.46, 0.05], [0.28, 0.4], [-0.28, 0.4], [-0.46, 0.05]], depth: 0.24, bevel: 0.04, pos: [0, 0.72, -0.05], rot: [90, 0, 0], color: "metal", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.4, -0.45], [0.4, -0.45], [0.46, 0.05], [0.28, 0.4], [-0.28, 0.4], [-0.46, 0.05]], depth: 0.04, pos: [0, 0.85, -0.07], rot: [90, 0, 0], scale: [0.76, 0.76, 1], color: "faction", parent: "tourelle" },
      { shape: "lathe", sides: 8, pos: [0, 0.72, 0.3], rot: [90, 0, 0], color: "dry", parent: "tourelle", profile: [[0, 0], [0.15, 0], [0.11, 0.12], [0, 0.14]] },
      { shape: "lathe", sides: 10, pos: [0, 0.72, 0.34], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: fut(0.05, 0.95) },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.06, pos: [-0.15, 0.89, -0.2], color: "dark", parent: "tourelle" },
      { shape: "tube", radius: 0.01, sides: 4, path: [[0.22, 0.85, -0.35], [0.22, 1.35, -0.42]], color: "steel", parent: "tourelle", fine: true },
    ],
  },
  // harrow : herse, défense antiaérienne mobile ; chenillard léger, tourelle (pivot « tourelle ») portant quatre
  // canons relevés vers le ciel en deux nacelles, jupe de toile, viseur ambre
  harrow: {
    parts: [
      ...chenille(0.6, 2.0, 0.42, 0.34),
      { shape: "bevel", size: [0.4, 0.04, 1.9], pos: [0.6, 0.45, 0], bevel: 0.015, color: "metal", mirror: true },
      { shape: "box", size: [0.03, 0.14, 1.5], pos: [0.8, 0.38, 0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[-1.0, 0.16], [0.75, 0.16], [1.05, 0.36], [0.85, 0.56], [-0.9, 0.58], [-1.02, 0.42]], depth: 0.82, bevel: 0.03, rot: [0, -90, 0], color: "dark" },
      { shape: "bevel", size: [0.9, 0.24, 0.42], pos: [0, 0.66, 0.6], bevel: 0.03, color: "metal" },
      { shape: "box", size: [0.6, 0.06, 0.03], pos: [0, 0.72, 0.815], color: "glass" },
      ...coffre([0, 0.68, -0.82], [0.7, 0.2, 0.3], "rust"),
      // tourelle (pivot) : couronne, caisse, jupe de toile
      { shape: "cylinder", sides: 12, radius: 0.4, height: 0.12, pos: [0, 0.64, -0.15], color: "steel", pivot: "tourelle" },
      { shape: "bevel", size: [0.56, 0.3, 0.6], pos: [0, 0.85, -0.18], bevel: 0.05, color: "metal", parent: "tourelle" },
      { shape: "lathe", sides: 8, pos: [0, 0.7, -0.18], rot: [0, 22.5, 0], color: "dry", parent: "tourelle", profile: [[0.42, 0], [0.46, 0], [0.38, 0.18], [0.34, 0.18]] },
      { shape: "box", size: [0.3, 0.03, 0.3], pos: [0, 1.01, -0.25], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.12, 0.08, 0.1], pos: [-0.12, 1.06, 0.02], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.08, 0.04, 0.02], pos: [-0.12, 1.06, 0.075], color: "amber", parent: "tourelle" },
      // deux nacelles relevées, deux fûts chacune
      incl([0.4, 0.9, -0.3], 52, 0.05, 0, { shape: "bevel", size: [0.18, 0.24, 0.5], bevel: 0.03, color: "rust", mirror: true, parent: "tourelle" }),
      incl([0.4, 0.9, -0.3], 52, 0.05, 0.125, { shape: "box", size: [0.14, 0.02, 0.36], color: "faction", mirror: true, parent: "tourelle" }),
      incl([0.35, 0.92, -0.3], 52, 0.75, 0, { shape: "cylinder", sides: 6, radius: 0.03, height: 1.2, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" }),
      incl([0.45, 0.92, -0.3], 52, 0.75, 0, { shape: "cylinder", sides: 6, radius: 0.03, height: 1.2, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" }),
      incl([0.35, 0.92, -0.3], 52, 1.33, 0, { shape: "cylinder", sides: 6, radius: 0.045, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", fine: true }),
      incl([0.45, 0.92, -0.3], 52, 1.33, 0, { shape: "cylinder", sides: 6, radius: 0.045, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", fine: true }),
      incl([0.4, 0.92, -0.3], 52, 0.62, 0, { shape: "box", size: [0.18, 0.06, 0.06], color: "dark", mirror: true, parent: "tourelle", fine: true }),
    ],
  },
  // towed_gun : canon tracté ; petit tracteur à chenilles et cabine bâchée à l'avant, affût à deux roues et flèches
  // jointes à l'arrière, long fût d'acier relevé (pivot « tourelle ») au-dessus du tracteur, bouclier de toile ;
  // béquilles écartées et bêches (pivot « deplie », visibles quand l'unité est déployée)
  towed_gun: {
    parts: [
      // tracteur
      ...chenille(0.45, 1.0, 0.36, 0.26, 0, 0.75),
      { shape: "bevel", size: [0.66, 0.3, 1.0], pos: [0, 0.4, 0.75], bevel: 0.04, color: "dark" },
      { shape: "bevel", size: [0.66, 0.24, 0.42], pos: [0, 0.66, 0.92], bevel: 0.03, color: "metal" },
      { shape: "box", size: [0.5, 0.06, 0.03], pos: [0, 0.7, 1.135], color: "glass" },
      ...bache(0, 0.78, 0.92, 0.35, 0.12, 0.44, "dry", 1),
      { shape: "box", size: [0.08, 0.05, 0.03], pos: [0.24, 0.5, 1.255], color: "amber", mirror: true },
      ...coffre([0, 0.62, 0.42], [0.56, 0.16, 0.3], "rust"),
      // timon
      { shape: "tube", radius: 0.035, sides: 4, path: [[0, 0.3, 0.25], [0, 0.3, -0.1]], color: "steel" },
      // affût : essieu, deux roues, flèches jointes
      { use: "roue_d", pos: [0.42, 0.3, -0.35], scale: [0.4, 0.6, 0.6], mirror: true },
      { shape: "box", size: [0.8, 0.08, 0.1], pos: [0, 0.3, -0.35], color: "dark" },
      { shape: "tube", radius: 0.04, sides: 4, path: [[0.12, 0.3, -0.4], [0.06, 0.12, -1.25]], color: "rust", mirror: true },
      { shape: "box", size: [0.24, 0.12, 0.06], pos: [0, 0.08, -1.27], color: "dark" },
      // pièce (pivot) : berceau, bouclier de toile, long fût relevé
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.1, pos: [0, 0.4, -0.35], color: "steel", pivot: "tourelle" },
      { shape: "bevel", size: [0.3, 0.2, 0.5], pos: [0, 0.55, -0.4], bevel: 0.03, color: "metal", parent: "tourelle" },
      { shape: "box", size: [0.7, 0.36, 0.04], pos: [0, 0.68, -0.18], rot: [-10, 0, 0], color: "dry", parent: "tourelle" },
      { shape: "box", size: [0.7, 0.06, 0.045], pos: [0, 0.82, -0.2], rot: [-10, 0, 0], color: "faction", parent: "tourelle" },
      incl([0, 0.62, -0.45], 14, 0, 0, { shape: "lathe", sides: 10, rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: fut(0.055, 2.0) }),
      incl([0, 0.62, -0.45], 14, 0.4, -0.09, { shape: "cylinder", sides: 6, radius: 0.03, height: 0.6, rot: [90, 0, 0], color: "dark", parent: "tourelle", fine: true }),
      // béquilles écartées, vérins et bêches (déployé)
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.08, pos: [0, 0.3, -0.5], color: "dark", pivot: "deplie" },
      { shape: "tube", radius: 0.035, sides: 4, path: [[0.15, 0.3, -0.5], [0.75, 0.12, -1.0]], color: "rust", mirror: true, parent: "deplie" },
      { shape: "box", size: [0.22, 0.16, 0.05], pos: [0.78, 0.06, -1.03], rot: [0, -40, 0], color: "dark", mirror: true, parent: "deplie" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.04, pos: [0.5, 0.02, -0.25], color: "dark", mirror: true, parent: "deplie" },
      { shape: "cylinder", sides: 6, radius: 0.03, height: 0.26, pos: [0.5, 0.15, -0.25], color: "steel", mirror: true, parent: "deplie" },
    ],
  },
  // ram : bélier, chenillard d'assaut blindé ; chenilles larges sous garde-chenilles épais, caisse à plaques
  // rouille inclinées, grande proue d'éperonnage d'acier en chevron à dents, jupes d'équipe, échappements,
  // poste de pilotage bas à fente
  ram: {
    parts: [
      ...chenille(0.7, 2.3, 0.5, 0.42),
      { shape: "bevel", size: [0.48, 0.06, 1.5], pos: [0.7, 0.55, -0.25], bevel: 0.02, color: "rust", mirror: true },
      { shape: "box", size: [0.04, 0.22, 1.4], pos: [0.94, 0.42, -0.25], color: "faction", mirror: true },
      // caisse : flancs inclinés, dos bombé
      { shape: "extrude", profile: [[-1.2, 0.2], [0.9, 0.2], [1.1, 0.4], [0.9, 0.82], [-1.0, 0.86], [-1.2, 0.6]], depth: 0.96, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[-0.56, 0.58], [0.56, 0.58], [0.4, 1.02], [-0.4, 1.02]], depth: 1.6, bevel: 0.04, pos: [0, 0, -0.25], color: "rust" },
      { shape: "box", size: [0.7, 0.04, 1.3], pos: [0, 1.03, -0.3], color: "metal" },
      { shape: "box", size: [0.18, 0.05, 1.32], pos: [0, 1.06, -0.3], color: "faction" },
      // poste de pilotage bas à fente
      { shape: "bevel", size: [0.6, 0.18, 0.3], pos: [0, 1.12, 0.38], bevel: 0.03, color: "metal" },
      { shape: "box", size: [0.4, 0.04, 0.02], pos: [0, 1.14, 0.535], color: "glass" },
      // proue d'éperonnage : chevron d'acier, arête, dents, rails de fixation
      { shape: "extrude", profile: [[-0.98, 0.9], [0.98, 0.9], [0.98, 1.05], [0.2, 1.62], [-0.2, 1.62], [-0.98, 1.05]], depth: 0.52, bevel: 0.03, pos: [0, 0.42, 0], rot: [90, 0, 0], color: "steel" },
      { shape: "wedge", size: [1.4, 0.36, 0.5], pos: [0, 0.86, 0.8], color: "dark" },
      { shape: "box", size: [0.06, 0.03, 0.62], pos: [0, 0.88, 0.8], rot: [36, 0, 0], color: "faction" },
      ...[[0, 1.62], [0.42, 1.34], [0.8, 1.1]].map(([x, z]): Part => ({ shape: "cone", sides: 5, radius: 0.1, height: 0.42, pos: [x, 0.42, q(z + 0.14)], rot: [90, 0, 0], color: "dark", mirror: x !== 0 })),
      { shape: "box", size: [0.1, 0.14, 0.5], pos: [0.45, 0.68, 0.75], color: "dark", mirror: true },
      { shape: "box", size: [1.6, 0.04, 0.05], pos: [0, 0.6, 1.0], color: "hazard", fine: true },
      // échappements, coffres
      { shape: "tube", radius: 0.045, path: [[0.38, 0.8, -1.05], [0.38, 1.1, -1.1], [0.38, 1.16, -1.2]], bend: 0.06, color: "rust", mirror: true },
      ...coffre([0, 0.95, -1.08], [0.4, 0.16, 0.2], "wood"),
    ],
  },
};
