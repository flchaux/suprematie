// Laboratoire nomade (« t_lab ») et chenillard laboratoire (« ch_lab ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, voute, chariotNomade } from "./commun.ts";

/** Pied du mât d'observation (avant droit) et course de chacun de ses deux tronçons télescopiques. */
const MX = 0.36;
const MZ = 0.42;
const COURSE = 0.55;
/** Hausse de la parabole (axe incliné vers l'avant). */
const HAUSSE = 55;

/**
 * Laboratoire nomade : chariot à chenilles portant un abri de toile tendue sur cadre (bande d'équipe, porte,
 * hublot) à deux extensions latérales coulissantes, un mât d'observation télescopique à parabole, deux antennes
 * fouet et une caisse d'instruments à écran. Avec `chariot` (chenillard laboratoire), chaque pièce mobile porte
 * son animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,68 : les extensions sortent de chaque côté de l'abri ;
 * - 0,58 → 0,84 : le mât monte, un tronçon après l'autre (0,58 → 0,72, puis 0,72 → 0,84) ;
 * - 0,68 → 0,85 : les antennes, couchées sur le toit, se dressent ;
 * - 0,84 → 0,96 : la parabole, rangée à plat (creux vers le ciel), se déplie vers l'avant.
 * Sans `chariot`, la tête du mât et la parabole forment le pivot « radar », qui tourne quand le laboratoire travaille.
 */
export function laboratoireNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const p: Part[] = [
    ...chariotNomade(chariot),
    // abri : toile sable sur cadre, toit d'acier, bande d'équipe, porte et hublot à l'avant, marchepied
    { shape: "box", size: [1.0, 0.62, 0.95], pos: [0, 0.885, -0.7], color: "dry" },
    { shape: "box", size: [1.04, 0.03, 0.99], pos: [0, 1.205, -0.7], color: "metal" },
    { shape: "extrude", profile: voute(0.5, 0.09, 6), depth: 0.97, pos: [0, 1.215, -0.7], color: "dry" },
    { shape: "box", size: [0.12, 0.02, 0.98], pos: [0, 1.3, -0.7], color: "faction", fine: true },
    { shape: "box", size: [1.02, 0.08, 0.97], pos: [0, 1.1, -0.7], color: "faction" },
    ...[-0.5, 0.5].flatMap((x): Part[] => [-1.17, -0.23].map((z): Part => ({ shape: "box", size: [0.04, 0.62, 0.04], pos: [x, 0.885, z], color: "rust", fine: true }))),
    { shape: "box", size: [0.3, 0.5, 0.02], pos: [-0.22, 0.83, -0.22], color: "dark" },
    { shape: "box", size: [0.26, 0.12, 0.02], pos: [0.2, 0.95, -0.22], color: "glass", fine: true },
    { shape: "box", size: [0.3, 0.03, 0.12], pos: [-0.22, 0.6, -0.16], color: "steel", fine: true },
    // caisse d'instruments (gauche, derrière la cabine), écran, voyant
    ...coffre([-0.33, 0.715, 0.2], [0.5, 0.28, 0.5], "rust"),
    { shape: "box", size: [0.3, 0.02, 0.2], pos: [-0.36, 0.862, 0.2], color: "glow" },
    { shape: "box", size: [0.05, 0.03, 0.05], pos: [-0.15, 0.865, 0.36], color: "amber", fine: true },
    { shape: "tube", radius: 0.015, sides: 4, path: [[-0.08, 0.7, 0.1], [0.1, 0.6, 0.1], [0.1, 0.6, -0.2]], bend: 0.05, color: "black", fine: true },
  ];
  // ——— extensions latérales : rentrées dans l'abri sur le chariot ———
  for (const s of [1, -1]) {
    const g = dep(`t:${q(-s * 0.42)},0,0:0.5:0.68`, s > 0 ? "ext_d" : "ext_g");
    p.push(
      { shape: "box", size: [0.42, 0.5, 0.7], pos: [q(s * 0.69), 0.9, -0.7], color: "dry", ...g },
      { shape: "box", size: [0.44, 0.03, 0.72], pos: [q(s * 0.69), 1.165, -0.7], color: "wood", ...g },
      { shape: "box", size: [0.02, 0.12, 0.42], pos: [q(s * 0.905), 0.98, -0.7], color: "glass", fine: true, ...g },
      { shape: "box", size: [0.02, 0.05, 0.7], pos: [q(s * 0.905), 0.72, -0.7], color: "faction", fine: true, ...g },
    );
  }
  // ——— antennes fouet aux coins arrière du toit : couchées vers l'avant sur le chariot ———
  for (const s of [1, -1]) {
    const x = q(s * 0.4);
    const a = dep("r:x,90:0.68:0.85", s > 0 ? "ant_d" : "ant_g");
    p.push(
      { shape: "box", size: [0.06, 0.05, 0.06], pos: [x, 1.255, -1.1], color: "dark", fine: true, ...a },
      { shape: "cylinder", sides: 5, radius: 0.016, height: 0.8, pos: [x, 1.65, -1.1], color: "steel", fine: true, ...a },
      { shape: "box", size: [0.2, 0.015, 0.015], pos: [x, 1.85, -1.1], color: "dark", fine: true, ...a },
      { shape: "sphere", radius: 0.035, pos: [x, 2.05, -1.1], color: "amber", fine: true, ...a },
    );
  }
  // ——— mât d'observation télescopique (avant droit) ———
  const m1 = dep(`t:0,${-COURSE},0:0.58:0.72`, "mat1");
  const m2s = `t:0,${-COURSE},0:0.58:0.72|t:0,${-COURSE},0:0.72:0.84`;
  const m2 = dep(m2s, "mat2");
  p.push(
    { shape: "box", size: [0.22, 0.06, 0.22], pos: [MX, 0.605, MZ], color: "dark", fine: true },
    { shape: "cylinder", sides: 6, radius: 0.065, height: 0.6, pos: [MX, 0.935, MZ], color: "rust" },
    { shape: "cylinder", sides: 8, radius: 0.08, height: 0.04, pos: [MX, 1.22, MZ], color: "dark", fine: true },
    { shape: "cylinder", sides: 6, radius: 0.05, height: 0.6, pos: [MX, 1.48, MZ], color: "steel", ...m1 },
    { shape: "cylinder", sides: 8, radius: 0.06, height: 0.04, pos: [MX, 1.76, MZ], color: "dark", fine: true, ...m1 },
    { shape: "cylinder", sides: 6, radius: 0.037, height: 0.6, pos: [MX, 2.03, MZ], color: "steel", ...m2 },
  );
  // tête du mât et parabole : pivot « radar » du laboratoire déployé ; sur le chariot, elles suivent le mât
  const radar = chariot ? m2 : { pivot: "radar" };
  p.push({ shape: "cylinder", sides: 10, radius: 0.1, height: 0.08, pos: [MX, 2.37, MZ], color: "dark", ...radar });
  // parabole, charnière sur la tête : rangée à plat (axe vertical), dépliée vers l'avant (axe incliné de HAUSSE)
  const H: Vec3 = [MX, 2.43, MZ];
  const a = (HAUSSE * Math.PI) / 180;
  const n: Vec3 = [0, Math.cos(a), Math.sin(a)];
  const at = (d: number): Vec3 => [MX, q(H[1] + n[1] * d), q(H[2] + n[2] * d)];
  // décalage dans le repère déployé : après la rotation (-HAUSSE autour de x), il doit être vertical
  const tv: Vec3 = [0, q(-COURSE * Math.cos(a)), q(-COURSE * Math.sin(a))];
  const t = `t:${tv.join(",")}`;
  const par = chariot ? dep(`r:x,${-HAUSSE}:0.84:0.96|${t}:0.58:0.72|${t}:0.72:0.84`, "parabole") : { pivot: "radar" };
  p.push(
    // première pièce du groupe sur la charnière (origine du pivot du chariot)
    { shape: "box", size: [0.06, 0.1, 0.06], pos: H, color: "dark", ...par },
    { shape: "lathe", sides: 12, pos: at(0.03), rot: [HAUSSE, 0, 0], color: "light", ...par, profile: [[0, 0], [0.16, 0.02], [0.3, 0.08], [0.32, 0.1], [0.16, 0.04], [0, 0.025]] },
    { shape: "tube", radius: 0.012, sides: 4, path: [at(0.05), at(0.26)], color: "steel", fine: true, ...par },
    { shape: "cylinder", sides: 6, radius: 0.035, height: 0.06, pos: at(0.27), rot: [HAUSSE, 0, 0], color: "dark", fine: true, ...par },
    { shape: "sphere", radius: 0.02, pos: at(0.31), color: "amber", fine: true, ...par },
  );
  // laboratoire déployé : haubans du mât (dans la boîte du modèle)
  if (!chariot) {
    for (const [x, z] of [[0.66, 1.08], [0.02, 1.02], [0.66, -0.15]]) {
      p.push({ shape: "tube", radius: 0.006, sides: 3, path: [[MX, 2.0, MZ], [x, 0.6, z]], color: "black", fine: true });
    }
  }
  return p;
}
