// Foreuse nomade (bâtiment « t_drill ») et chariot foreuse (unité « ch_drill ») : même gréement, voir foreuseNomade.
import type { Part, Vec3 } from "../types.ts";
import { q, heliceY, coffre, bache, chariotNomade } from "./commun.ts";
import type { C } from "./commun.ts";

// ——— Foreuse nomade : chariot et gréement de forage ———

/** Point d'articulation du mât (pied du mât, à l'arrière du chariot) et longueur du mât. */
export const MAT_H: Vec3 = [0.3, 0.7, -1.15];
export const MAT_L = 2.1;
/** Ancrage du vérin de levage sur le plateau. */
export const VERIN_A: Vec3 = [0.3, 0.6, 0.3];

/**
 * Foreuse nomade : chariot à chenilles (cabine à gauche, moteur, coffres), quatre stabilisateurs (bras
 * coulissants, vérins et patins), mât de forage en treillis articulé à l'arrière du chariot, vérin de levage
 * télescopique, tige de forage à vrille et tête motrice. Les pièces sont décrites dans la pose déployée (le
 * bâtiment « t_drill »). Avec `chariot`, ce sont celles du chenillard foreuse : les chenilles roulent et chaque
 * pièce mobile porte son animation de déploiement (pivots « dep|… », voir render/entities.ts), de 0 (replié)
 * à 1 (déployé) en 15 s :
 * - 0,08 → 0,3 : les bras sortent du châssis ;
 * - 0,3 → 0,48 : les vérins descendent et posent les patins ;
 * - 0,5 → 0,85 : le mât, couché sur le chariot, se relève (+90° autour de x), poussé par le vérin télescopique ;
 * - 0,85 → 1 : la tige descend dans le sol.
 * Sans `chariot`, la tige est le pivot « foret », qui tourne quand la foreuse travaille.
 */
export function foreuseNomade(chariot: boolean): Part[] {
  const [hx, hy, hz] = MAT_H;
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const mat = "r:x,90:0.5:0.85";
  const p: Part[] = [
    ...chariotNomade(chariot, { zs: [0.85, -0.7] }),
    // berceau du mât couché (avant droit)
    { shape: "box", size: [0.05, 0.16, 0.06], pos: [0.16, 0.64, 0.95], color: "rust" },
    { shape: "box", size: [0.05, 0.16, 0.06], pos: [0.44, 0.64, 0.95], color: "rust" },
    { shape: "box", size: [0.36, 0.04, 0.08], pos: [0.3, 0.71, 0.95], color: "dark" },
    // moteur arrière gauche sous bâche, échappement
    { shape: "bevel", size: [0.56, 0.3, 0.6], pos: [-0.33, 0.72, -0.85], bevel: 0.03, color: "dark" },
    ...bache(-0.33, 0.87, -0.85, 0.27, 0.18, 0.56, "dry", 1, false),
    { shape: "tube", radius: 0.04, path: [[-0.6, 0.7, -1.02], [-0.6, 1.26, -1.02], [-0.56, 1.32, -0.98]], bend: 0.06, color: "rust" },
    // réservoir hydraulique et coffres
    { shape: "cylinder", sides: 10, radius: 0.12, height: 0.5, pos: [-0.33, 0.7, -0.2], rot: [90, 0, 0], color: "steel" },
    ...coffre([-0.33, 0.66, 0.35], [0.4, 0.18, 0.34], "rust"),
    // charnière du mât : chape sur le plateau arrière droit
    { shape: "box", size: [0.46, 0.14, 0.2], pos: [hx, 0.62, hz], color: "steel" },
    // ancrage du vérin de levage
    { shape: "box", size: [0.2, 0.08, 0.16], pos: [VERIN_A[0], 0.59, VERIN_A[2]], color: "steel" },
  ];
  // ——— mât de forage en treillis, articulé en MAT_H (pose déployée : vertical, derrière la charnière) ———
  const m = dep(mat, "mat");
  const zf = hz - 0.03; // face avant du mât
  const zb = hz - 0.29; // face arrière
  p.push({ shape: "cylinder", sides: 8, radius: 0.07, height: 0.5, pos: [hx, hy, hz], rot: [0, 0, 90], color: "steel", ...m });
  for (const x of [hx - 0.16, hx + 0.16]) {
    for (const z of [zf, zb]) {
      p.push({ shape: "box", size: [0.045, MAT_L, 0.045], pos: [x, q(hy + MAT_L / 2), z], color: "rust", ...m });
    }
  }
  for (let i = 0; i < 5; i++) {
    const y = q(hy + 0.25 + i * 0.42);
    p.push(
      { shape: "box", size: [0.32, 0.035, 0.035], pos: [hx, y, zf], color: "dark", ...m },
      { shape: "box", size: [0.32, 0.035, 0.035], pos: [hx, y, zb], color: "dark", ...m },
    );
    if (i < 4) p.push({ shape: "tube", radius: 0.014, sides: 4, path: [[hx - 0.16, y, zf], [hx + 0.16, q(y + 0.42), zf]], color: "metal", fine: true, ...m });
  }
  // moufle (tête du mât) d'équipe, poulie, feu de signalisation
  const top = q(hy + MAT_L);
  p.push(
    { shape: "bevel", size: [0.44, 0.18, 0.4], pos: [hx, q(top + 0.06), q((zf + zb) / 2)], bevel: 0.03, color: "faction", ...m },
    { shape: "cylinder", sides: 10, radius: 0.13, height: 0.07, pos: [hx, q(top + 0.02), q(zb - 0.04)], rot: [90, 0, 0], color: "steel", ...m },
    { shape: "sphere", radius: 0.045, pos: [q(hx + 0.18), q(top + 0.18), zf], color: "amber", ...m },
  );
  // ——— tige de forage, à l'arrière du mât (elle descend dans le sol à la fin) ———
  const tz = q(zb - 0.13);
  // chariot : la tige suit le mât (ancre du pivot sur la charnière), puis descend ; foreuse déployée : la
  // même tige tourne au travail (pivot « foret », origine sur son axe), la tête motrice reste fixe
  const t = dep(`${mat}|t:0,0.9,0:0.85:1`, "tige");
  const tete = chariot ? t : {};
  if (chariot) p.push({ shape: "box", size: [0.02, 0.02, 0.02], pos: [hx, hy, hz], color: "dark", ...t });
  const foret = chariot ? t : { pivot: "foret" };
  p.push(
    { shape: "lathe", sides: 10, pos: [hx, -0.35, tz], color: "dark", profile: [[0, 0], [0.04, 0.08], [0.07, 0.2], [0.07, 2.0], [0, 2.0]], ...foret },
    { shape: "tube", radius: 0.02, sides: 4, path: heliceY(hx, tz, 0.1, -0.25, 1.2, 3, 18), bend: 0, color: "steel", ...foret },
    { shape: "bevel", size: [0.3, 0.22, 0.26], pos: [hx, 1.72, tz], bevel: 0.03, color: "faction", ...tete },
    { shape: "tube", radius: 0.025, sides: 5, path: [[q(hx - 0.1), 1.76, tz], [q(hx - 0.35), 1.4, q(tz + 0.2)], [q(hx - 0.3), 0.75, hz]], bend: 0.12, color: "copper", fine: true, ...tete },
  );
  // foreuse déployée : déblais de minerai autour du trou (teintés selon la ressource)
  if (!chariot) p.push({ shape: "lathe", sides: 10, pos: [hx, 0, tz], color: "ore", profile: [[0.1, 0], [0.34, 0], [0.24, 0.07], [0.12, 0.05]] });
  // ——— vérin de levage télescopique, du plateau (VERIN_A) au mât (à 0,9 de la charnière) ———
  // pose déployée : vers B = (hx, hy + 0,9, hz - 0,16) ; replié, B tourne avec le mât (+90° autour de x)
  const [ax, ay, az] = VERIN_A;
  const by = hy + 0.9, bz = hz - 0.16;
  const fy = hy + 0.16, fz = hz + 0.9; // B replié
  const len = Math.hypot(by - ay, bz - az);
  const len0 = Math.hypot(fy - ay, fz - az);
  const u: Vec3 = [0, (by - ay) / len, (bz - az) / len];
  const ang = q(((Math.atan2(by - ay, bz - az) - Math.atan2(fy - ay, fz - az)) * 180) / Math.PI);
  const at = (d: number): Vec3 => [ax, q(ay + u[1] * d), q(az + u[2] * d)];
  const seg = (d0: number, d1: number, r: number, color: C, retrait: number, nom: string): Part => ({
    shape: "tube", radius: r, sides: 6, path: [at(d0), at(d1)], color,
    ...(chariot ? { pivot: `dep|r:x,${ang}:0.5:0.85|t:0,${q(-u[1] * retrait)},${q(-u[2] * retrait)}:0.5:0.85#${nom}` } : {}),
  });
  // ancres des pivots du vérin (origine en A) : chaque étage tourne autour de A et rentre dans le précédent
  const course = len - len0;
  const st = len0 - 0.08;
  const anchor = (nom: string, retrait: number): Part => ({ shape: "box", size: [0.01, 0.01, 0.01], pos: VERIN_A, color: "dark", ...(chariot ? { pivot: `dep|r:x,${ang}:0.5:0.85|t:0,${q(-u[1] * retrait)},${q(-u[2] * retrait)}:0.5:0.85#${nom}` } : {}) });
  p.push(
    anchor("verin0", 0),
    seg(0, st, 0.065, "dark", 0, "verin0"),
    anchor("verin1", course / 3),
    seg(q(st - 0.05), q(2 * st - 0.05), 0.05, "steel", course / 3, "verin1"),
    anchor("verin2", (2 * course) / 3),
    seg(q(2 * st - 0.1), q(3 * st - 0.1), 0.04, "steel", (2 * course) / 3, "verin2"),
    anchor("verin3", course),
    seg(q(3 * st - 0.15), q(len), 0.03, "steel", course, "verin3"),
  );
  return p;
}
