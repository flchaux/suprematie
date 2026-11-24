// Tronçons de l'Arche : améliorations par emplacement, pivots conditionnels, train de chenilles et caisse d'un tronçon
// (voir arche-armement.ts, arche-coque.ts, arche-mobilite.ts et docs/spec/races.md).
// Repère : +x à droite, +y en haut, +z vers l'avant. Coque nue de z = -2,42 à z = 2,45, pont à y = 0,97.
import type { Part } from "../types.ts";
import { q, chenille } from "./commun.ts";

/** Améliorations d'armement (gaillard d'avant) et de mobilité (bloc arrière). */
export const ARMES = "ark_w_siege+ark_w_flame+ark_w_rockets+ark_w_rail+ark_w_flak";
export const MOBILITE = "ark_engine1+ark_engine2+ark_spur+ark_boost";
/** Améliorations de pont et de soutien (portées par les remorques). */
export const REMORQUES = "ark_turrets1+ark_turrets2+ark_turrets3+ark_workshop+ark_holds+ark_repair+ark_radar+ark_jammer+ark_dynamo+ark_loot";

/** Pivots des armes d'origine de l'Arche : le canon de proue et la défense antiaérienne arrière. */
export const CANON = "sauf:ark_w_siege+ark_w_flame+ark_w_rockets+ark_w_rail#tourelle";
export const FLAK = "sauf:ark_w_flak#tourelle_aa";

/** Pièces d'un pivot : la première porte le pivot (son origine), les autres le suivent. */
export function groupe(pivot: string, parts: Part[]): Part[] {
  return parts.map((p) => ({ ...p, pivot }));
}

/** Train de chenilles court d'un tronçon (même voie que la coque, sans flasque ni galets) : bandes fixes, crampons qui glissent. */
export function train(cond: string, nom: string, l: number, z: number): Part[] {
  return chenille(1.0, l, 0.64, 0.5, 0, z, 0.3, true)
    .filter((p) => (p.shape !== "extrude" || p.color !== "dark") && p.color !== "metal")
    .map((p) => ({ ...p, bevel: 0, pivot: `si:${cond}#${p.pivot ?? "fixe"}_${nom}` }));
}

/**
 * Caisse d'un tronçon de la coque, de `z0` (bord du pont de l'Arche) à `z1` : soufflet à nu entre les deux ponts,
 * passerelle et attaches, caisse, pont, jupes d'équipe, bande d'équipe en travers. `s` : 1 devant, -1 derrière.
 */
export function caisse(s: 1 | -1, z0: number, z1: number): Part[] {
  const z = (d: number) => q(s * d);
  const a = q(z0 + 0.22); // bord du pont du tronçon
  const l = q(z1 - a);
  const zc = q((a + z1) / 2);
  return [
    { shape: "extrude", profile: [[z(a + 0.06), 0.26], [z(z1 - 0.2), 0.26], [z(z1 + 0.06), 0.54], [z(z1), 0.92], [z(a + 0.06), 0.92]], depth: 1.44, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
    { shape: "box", size: [2.1, 0.06, l], pos: [0, 0.94, z(zc)], color: "metal" },
    // soufflet entre les deux ponts
    ...[0.03, 0.08, 0.13, 0.18].map((d, k): Part => ({ shape: "box", size: [k % 2 ? 1.56 : 1.74, k % 2 ? 0.42 : 0.52, 0.04], pos: [0, 0.68, z(z0 + d)], color: "rubber", fine: k % 2 === 1 })),
    // passerelle de pont, attaches latérales et leurs axes
    { shape: "box", size: [0.9, 0.03, 0.4], pos: [0, 0.98, z(z0 + 0.11)], color: "hazard" },
    { shape: "box", size: [0.7, 0.034, 0.34], pos: [0, 0.981, z(z0 + 0.11)], color: "metal" },
    { shape: "box", size: [0.14, 0.14, 0.56], pos: [0.96, 0.86, z(z0 + 0.11)], color: "rust", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.07, height: 0.2, pos: [0.96, 0.92, z(z0 + 0.11)], color: "steel", mirror: true, fine: true },
    // jupes d'équipe et longerons, comme ceux de la coque
    { shape: "box", size: [0.04, 0.22, q(l - 0.1)], pos: [1.29, 0.6, z(zc)], color: "faction", mirror: true },
    { shape: "box", size: [0.14, 0.06, l], pos: [0.79, 0.7, z(zc)], color: "rust", mirror: true, fine: true },
    { shape: "box", size: [2.12, 0.02, 0.12], pos: [0, 0.975, z(a + 0.1)], color: "faction" },
  ];
}
