// Générateur nomade (« t_generator ») et chenillard générateur (« ch_generator ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, chariotNomade } from "./commun.ts";

/** Pied du pylône d'alimentation télescopique (arrière gauche). */
export const PYLONE: Vec3 = [-0.42, 0.575, -0.78];
/** Tronçons du pylône : demi-largeur, bas, haut (pose déployée) ; course de chaque tronçon. */
const TRONCONS: [number, number, number][] = [
  [0.09, 0.575, 1.275],
  [0.065, 1.2, 1.9],
  [0.045, 1.85, 2.55],
];
const COURSE = 0.65;
/** Radiateur (avant droit) et son ventilateur horizontal. */
const RADIATEUR: Vec3 = [0.28, 0.575, 0.65];
/** Échappements : x, z des pieds, hauteur des charnières. */
const ECHAP = { x: 0.5, zs: [-0.22, 0.12], y: 0.99 };

/**
 * Générateur nomade : chariot à chenilles (cabine à l'avant gauche), bloc moteur à deux rangées de culasses et
 * bande d'équipe, radiateur à ventilateur horizontal (avant droit), deux échappements rouille à clapets, réservoir
 * sable sur berceau (arrière droit), touret de câble et jerricans, pylône d'alimentation télescopique (arrière
 * gauche) à traverse repliable et isolateurs. Avec `chariot` (chenillard générateur), les pièces mobiles portent
 * leur animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,65 : les deux échappements, couchés vers l'avant sur le moteur, se dressent (+90° autour de x) ;
 * - 0,55 → 0,75 puis 0,65 → 0,85 : les deux tronçons du pylône sortent l'un de l'autre ;
 * - 0,6 → 0,75 : le ventilateur sort du radiateur ;
 * - 0,85 → 1 : les deux bras de la traverse, pendus le long du pylône, se relèvent à l'horizontale.
 * Sans `chariot`, l'hélice du ventilateur est le pivot « rotor », qui tourne quand le générateur travaille.
 */
export function generateurNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const [rx, , rz] = RADIATEUR;
  const p: Part[] = [
    ...chariotNomade(chariot),
    // bloc moteur, culasses, bande d'équipe, durites
    { shape: "box", size: [0.6, 0.34, 0.76], pos: [0.28, 0.745, 0.05], color: "metal" },
    ...[0.1, 0.32].map((x): Part => ({ shape: "box", size: [0.16, 0.1, 0.62], pos: [x, 0.965, 0.05], color: "dark" })),
    ...[0.1, 0.32].flatMap((x): Part[] => [-0.15, 0.05, 0.25].map((z): Part => ({ shape: "box", size: [0.12, 0.03, 0.14], pos: [x, 1.025, z], color: "rust", fine: true }))),
    { shape: "box", size: [0.02, 0.16, 0.6], pos: [0.585, 0.76, 0.05], color: "faction" },
    { shape: "tube", radius: 0.025, sides: 5, path: [[0.1, 0.9, 0.43], [0.1, 0.9, 0.55]], color: "copper", fine: true },
    { shape: "tube", radius: 0.025, sides: 5, path: [[0.46, 0.7, 0.43], [0.46, 0.7, 0.55]], color: "copper", fine: true },
    // radiateur : caisson, grille de façade
    { shape: "box", size: [0.56, 0.34, 0.3], pos: [rx, 0.745, rz], color: "dark" },
    ...[0.66, 0.74, 0.82].map((y): Part => ({ shape: "box", size: [0.5, 0.025, 0.02], pos: [rx, y, q(rz + 0.155)], color: "black", fine: true })),
    // pieds des échappements
    ...ECHAP.zs.map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.06, height: 0.08, pos: [ECHAP.x, 0.95, z], color: "dark", fine: true })),
    // réservoir sable sur berceau (arrière droit), bande d'équipe, bouchon
    { shape: "box", size: [0.5, 0.1, 0.26], pos: [0.3, 0.62, -0.8], color: "dark", fine: true },
    { shape: "lathe", sides: 12, pos: [0.3, 0.86, -0.8], rot: [0, 0, 90], color: "dry", profile: [[0, -0.3], [0.19, -0.24], [0.19, 0.24], [0, 0.3]] },
    { shape: "cylinder", sides: 12, radius: 0.2, height: 0.06, pos: [0.42, 0.86, -0.8], rot: [0, 0, 90], color: "faction", fine: true },
    { shape: "cylinder", sides: 6, radius: 0.04, height: 0.06, pos: [0.2, 1.06, -0.8], color: "steel", fine: true },
    // touret de câble, jerricans, coffre (gauche)
    { shape: "cylinder", sides: 10, radius: 0.2, height: 0.04, pos: [-0.5, 0.79, 0.25], rot: [0, 0, 90], color: "wood", fine: true },
    { shape: "cylinder", sides: 10, radius: 0.2, height: 0.04, pos: [-0.22, 0.79, 0.25], rot: [0, 0, 90], color: "wood", fine: true },
    { shape: "cylinder", sides: 10, radius: 0.15, height: 0.26, pos: [-0.36, 0.79, 0.25], rot: [0, 0, 90], color: "black" },
    ...[0.12, 0.32].map((z): Part => ({ shape: "box", size: [0.08, 0.2, 0.14], pos: [-0.56, 0.68, q(z - 0.4)], color: "red", fine: true })),
    ...coffre([-0.3, 0.68, -0.2], [0.26, 0.2, 0.3], "wood").map((c): Part => ({ ...c, fine: true })),
    // pylône : semelle et tronçon de pied (fixe)
    { shape: "box", size: [0.3, 0.04, 0.3], pos: [PYLONE[0], 0.595, PYLONE[2]], color: "rust", fine: true },
  ];

  // ——— pylône télescopique : deux tronçons rentrés dans le pied, coiffe et traverse en tête ———
  const [mx, , mz] = PYLONE;
  const steps = ["", `t:0,${-COURSE},0:0.55:0.75`, `t:0,${-COURSE},0:0.55:0.75|t:0,${-COURSE},0:0.65:0.85`];
  TRONCONS.forEach(([hw, y0, y1], i) => {
    const tr = i ? dep(steps[i], `pylone${i}`) : {};
    p.push({ shape: "box", size: [q(2 * hw), q(y1 - y0), q(2 * hw)], pos: [mx, q((y0 + y1) / 2), mz], color: i ? "rust" : "dark", ...tr });
    p.push({ shape: "box", size: [q(2 * hw + 0.03), 0.04, q(2 * hw + 0.03)], pos: [mx, q(y1 - 0.02), mz], color: i === 1 ? "faction" : "metal", ...(i === 1 ? {} : { fine: true }), ...tr });
  });
  const top = TRONCONS[2][2];
  const tete = dep(steps[2], "pylone2");
  p.push({ shape: "box", size: [0.28, 0.05, 0.14], pos: [mx, q(top + 0.025), mz], color: "faction", ...tete });
  // bras de la traverse (charnières aux bouts de la coiffe) : pendus le long du pylône sur le chariot ; leur
  // décalage (descente du pylône) est exprimé avant la rotation du bras, d'où t = (±2 x course, 0, 0)
  const LB = 0.38;
  for (const s of [1, -1]) {
    const hx = q(mx + s * 0.13);
    const hy = q(top + 0.03);
    const br = dep(`r:z,${-s * 90}:0.85:1|t:${s * COURSE},0,0:0.55:0.75|t:${s * COURSE},0,0:0.65:0.85`, s > 0 ? "traverse_d" : "traverse_g");
    p.push(
      { shape: "tube", radius: 0.03, sides: 4, pos: [hx, hy, mz], path: [[0, 0, 0], [q(s * LB), 0, 0]], color: "dark", ...br },
      { shape: "cylinder", sides: 6, radius: 0.035, height: 0.12, pos: [q(hx + s * (LB - 0.04)), q(hy + 0.08), mz], color: "light", fine: true, ...br },
      ...[0.1, 0.13].map((dy): Part => ({ shape: "cylinder", sides: 6, radius: 0.05, height: 0.012, pos: [q(hx + s * (LB - 0.04)), q(hy + dy), mz], color: "light", fine: true, ...br })),
    );
  }
  // câble d'alimentation : de la tête du pylône au moteur (générateur déployé seulement)
  if (!chariot) {
    p.push({ shape: "tube", radius: 0.012, sides: 3, path: [[q(mx + 0.47), q(top + 0.14), mz], [0.1, 1.3, -0.5], [0.0, 0.9, -0.3]], bend: 0.3, color: "black", fine: true });
  }

  // ——— échappements : couchés vers l'avant sur le moteur, ils se dressent sur leurs charnières ———
  ECHAP.zs.forEach((z, i) => {
    p.push(
      { shape: "lathe", sides: 8, pos: [ECHAP.x, ECHAP.y, z], color: "rust", profile: [[0.045, 0], [0.045, 0.6], [0.058, 0.64]], ...dep("r:x,90:0.5:0.65", `echap${i}`) },
      { shape: "box", size: [0.1, 0.012, 0.1], pos: [ECHAP.x, q(ECHAP.y + 0.66), q(z - 0.03)], rot: [-25, 0, 0], color: "black", fine: true, ...dep("r:x,90:0.5:0.65", `echap${i}`) },
    );
  });

  // ——— ventilateur du radiateur : rentré dans le caisson sur le chariot ———
  const ve = dep("t:0,-0.08,0:0.6:0.75", "ventilateur");
  const rotor = chariot ? ve : { pivot: "rotor" };
  p.push(
    { shape: "cylinder", sides: 12, radius: 0.14, height: 0.06, pos: [rx, 0.945, rz], color: "metal", ...ve },
    ...[0, 60, 120].map((a): Part => ({ shape: "box", size: [0.25, 0.012, 0.05], pos: [rx, 0.98, rz], rot: [0, a, 0], color: "black", ...(a ? { fine: true } : {}), ...rotor })),
    { shape: "cylinder", sides: 6, radius: 0.035, height: 0.04, pos: [rx, 0.985, rz], color: "steel", fine: true, ...rotor },
  );
  return p;
}
