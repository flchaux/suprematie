// Soute (« t_hold ») et chenillard soute (« ch_hold ») : même gréement (voir nomades/foreuse.ts pour
// l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`, celles de l'unité, qui
// portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, chariotNomade, decal } from "./commun.ts";
import type { Axe } from "./commun.ts";

/** Pied de la grue (arrière droit), hauteur du talon de la flèche, longueur de la flèche. */
const GX = 0.42;
const GZ = -0.98;
const TALON = 1.85;
const FLECHE = 1.1;
/** Course du fût télescopique de la grue. */
const COURSE = 0.42;

/**
 * Soute : chariot à chenilles portant un long conteneur rouille, un conteneur gerbé à porte d'équipe, un conteneur
 * d'équipe, des caisses sous filet et une grue de chargement ; deux ridelles qui s'abaissent en quais. Avec
 * `chariot` (chenillard soute), chaque pièce mobile porte son animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,68 : les ridelles, relevées de chaque côté du plateau, s'abaissent en quais (±90° autour de z) ;
 * - 0,6 → 0,72 : le fût télescopique de la grue monte ;
 * - 0,72 → 0,86 : la flèche, couchée vers l'avant sur le chargement, se lève (30°) ;
 * - 0,86 → 1 : la grue pivote de 45° pour amener le crochet au-dessus du quai droit.
 */
export function souteNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const p: Part[] = [
    ...chariotNomade(chariot),
    // long conteneur rouille (gauche), nervures, portes avant, sangles
    { shape: "box", size: [0.58, 0.56, 1.62], pos: [-0.33, 0.855, -0.34], color: "rust" },
    ...[-1.0, -0.72, -0.44, -0.16, 0.12].map((z): Part => ({ shape: "box", size: [0.6, 0.48, 0.025], pos: [-0.33, 0.855, z], color: "dark", fine: true })),
    { shape: "box", size: [0.52, 0.5, 0.02], pos: [-0.33, 0.855, 0.475], color: "dark" },
    { shape: "box", size: [0.025, 0.46, 0.025], pos: [-0.42, 0.855, 0.49], color: "steel", fine: true },
    { shape: "box", size: [0.025, 0.46, 0.025], pos: [-0.24, 0.855, 0.49], color: "steel", fine: true },
    { shape: "box", size: [0.61, 0.58, 0.045], pos: [-0.33, 0.865, 0.28], color: "black" },
    { shape: "box", size: [0.61, 0.58, 0.045], pos: [-0.33, 0.865, -0.15], color: "black", fine: true },
    // conteneur gerbé sur l'arrière du premier : acier, porte d'équipe
    { shape: "box", size: [0.54, 0.4, 0.8], pos: [-0.33, 1.335, -0.72], color: "metal" },
    ...[-0.95, -0.72, -0.49].map((z): Part => ({ shape: "box", size: [0.56, 0.34, 0.025], pos: [-0.33, 1.335, z], color: "dark", fine: true })),
    { shape: "box", size: [0.48, 0.34, 0.02], pos: [-0.33, 1.335, -0.315], color: "faction" },
    // conteneur d'équipe (droite), nervures, porte, sangle
    { shape: "box", size: [0.58, 0.5, 0.9], pos: [0.34, 0.825, -0.3], color: "faction" },
    ...[-0.6, -0.3, 0.0].map((z): Part => ({ shape: "box", size: [0.6, 0.44, 0.025], pos: [0.34, 0.825, z], color: "metal", fine: true })),
    { shape: "box", size: [0.5, 0.44, 0.02], pos: [0.34, 0.825, 0.155], color: "dark" },
    { shape: "box", size: [0.61, 0.52, 0.045], pos: [0.34, 0.835, -0.45], color: "black", fine: true },
    // caisses de l'avant droit sous un filet tendu, sac de toile
    ...coffre([0.34, 0.71, 0.5], [0.56, 0.27, 0.42], "wood"),
    ...coffre([0.36, 0.71, 0.93], [0.5, 0.27, 0.34], "wood"),
    ...coffre([0.3, 0.965, 0.62], [0.38, 0.24, 0.4], "rust"),
    { shape: "lathe", sides: 6, pos: [0.5, 0.845, 0.95], color: "dry", fine: true, profile: [[0, 0], [0.1, 0], [0.12, 0.07], [0.09, 0.16], [0, 0.18]] },
    ...[0.18, 0.42].map((x): Part => ({ shape: "tube", radius: 0.01, sides: 3, path: [[x, 0.85, 0.27], [x, 1.1, 0.42], [x, 1.1, 0.82], [x, 0.85, 1.1]], bend: 0.04, color: "black", fine: true })),
    ...[0.55, 0.75].map((z): Part => ({ shape: "tube", radius: 0.01, sides: 3, path: [[0.06, 0.85, z], [0.11, 1.1, z], [0.49, 1.1, z], [0.62, 0.85, z]], bend: 0.04, color: "black", fine: true })),
  ];
  // ——— ridelles / quais : charnière au bord du plateau ; relevées (verticales) sur le chariot, à plat en quais ———
  for (const s of [1, -1]) {
    const g = dep(`r:z,${s * 90}:0.5:0.68`, s > 0 ? "quai_d" : "quai_g");
    const hx = q(s * 0.69);
    p.push(
      // première pièce du groupe (origine du pivot) : barre de charnière, pas fine (le niveau réduit garde la même origine)
      { shape: "box", size: [0.05, 0.05, 1.28], pos: [hx, 0.6, -0.08], color: "steel", ...g },
      { shape: "box", size: [0.46, 0.04, 1.28], pos: [q(s * 0.94), 0.6, -0.08], color: "metal", ...g },
      ...[-0.56, -0.08, 0.4].map((z): Part => ({ shape: "box", size: [0.42, 0.015, 0.04], pos: [q(s * 0.94), 0.625, z], color: "dark", fine: true, ...g })),
      { shape: "box", size: [0.04, 0.05, 1.28], pos: [q(s * 1.15), 0.6, -0.08], color: "hazard", ...g },
    );
  }
  // ——— grue de chargement (arrière droit) : couronne et fût fixes, fût télescopique, flèche ———
  const H: Vec3 = [GX, TALON, GZ];
  p.push(
    { shape: "cylinder", sides: 6, radius: 0.15, height: 0.12, pos: [GX, 0.635, GZ], color: "dark" },
    { shape: "box", size: [0.16, 0.705, 0.16], pos: [GX, 1.0475, GZ], color: "rust" },
    { shape: "box", size: [0.11, 0.54, 0.11], pos: [GX, 1.6, GZ], color: "steel", ...dep(`t:0,${-COURSE},0:0.6:0.72`, "fut") },
  );
  // flèche : dressée à 30°, orientée à 45° vers l'avant droit ; repliée, couchée vers l'avant (+z)
  const u: Vec3 = [Math.sin(Math.PI / 4) * Math.cos(Math.PI / 6), 0.5, Math.cos(Math.PI / 4) * Math.cos(Math.PI / 6)];
  const at = (d: number, dy = 0): Vec3 => [q(H[0] + u[0] * d), q(H[1] + u[1] * d + dy), q(H[2] + u[2] * d)];
  const rs: [Axe, number][] = [["x", 30], ["y", -45]];
  const f = dep(`r:x,30:0.72:0.86|r:y,-45:0.86:1|t:${decal(rs, [0, -COURSE, 0])}:0.6:0.72`, "fleche");
  const tip = at(FLECHE);
  p.push(
    { shape: "box", size: [0.15, 0.12, 0.15], pos: H, color: "dark", ...f },
    { shape: "tube", radius: 0.065, sides: 4, path: [at(-0.08), tip], bend: 0, color: "faction", ...f },
    { shape: "tube", radius: 0.028, sides: 5, path: [[q(GX + 0.04), 1.55, q(GZ + 0.04)], at(0.45, -0.05)], color: "steel", ...f },
    { shape: "box", size: [0.1, 0.12, 0.1], pos: tip, color: "dark", ...f },
    { shape: "tube", radius: 0.008, sides: 3, path: [tip, [tip[0], q(tip[1] - 0.3), tip[2]]], color: "black", fine: true, ...f },
    { shape: "box", size: [0.07, 0.09, 0.07], pos: [tip[0], q(tip[1] - 0.34), tip[2]], color: "hazard", ...f },
  );
  return p;
}
