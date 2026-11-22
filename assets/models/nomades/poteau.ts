// Poteau nomade (t_pole, 1 × 1) : relais électrique que le générateur nomade plante autour du campement et
// rembarque au repli. Un trépied de perches de bois liées par une corde, un mât d'acier télescopique à deux
// étages pris dans le nœud, une traverse à isolateurs de céramique, trois haubans tendus vers des piquets, un
// fanion aux couleurs de l'équipe en tête, une lanterne ambre sous la traverse et, au pied, le coffret du
// câble sanglé à une perche. Repère : +x à droite, +y en haut, +z vers l'avant.
import type { Part, Vec3 } from "../types.ts";
import { q, coffre } from "./commun.ts";

const rad = (a: number) => (a * Math.PI) / 180;

/**
 * Échelle du poteau : un bâtiment de 1 × 1 garde les unités du modèle (une unité = une case) ; à 0,68, il
 * fait environ 1,4 case de haut, à peine plus que les modules déployés qu'il relie.
 */
const K = 0.68;
const k3 = (v: Vec3): Vec3 => [q(v[0] * K), q(v[1] * K), q(v[2] * K)];
function echelle(p: Part): Part {
  const o: Part = { ...p };
  if (p.pos) o.pos = k3(p.pos);
  if (p.size) o.size = k3(p.size);
  if (p.path) o.path = p.path.map(k3);
  if (p.profile) o.profile = p.profile.map(([x, y]) => [q(x * K), q(y * K)]);
  for (const f of ["radius", "radiusTop", "height", "tube", "depth", "bevel"] as const) if (p[f] !== undefined) o[f] = q((p[f] as number) * K);
  return o;
}

export function poteauNomade(): Part[] {
  const out: Part[] = [];
  const NOEUD = 0.92;
  // trépied : trois perches de bois du sol au nœud, sabots de fer
  for (const a of [90, 210, 330]) {
    const [fx, fz] = [q(Math.cos(rad(a)) * 0.34), q(Math.sin(rad(a)) * 0.34)];
    out.push({ shape: "tube", radius: 0.032, sides: 6, path: [[fx, 0.02, fz], [q(fx * 0.12), NOEUD + 0.08, q(fz * 0.12)]], color: "wood", smooth: false });
    out.push({ shape: "cylinder", sides: 6, radius: 0.05, radiusTop: 0.04, height: 0.06, pos: [fx, 0.03, fz], color: "dark" });
  }
  // nœud de corde et bande d'équipe sous le nœud
  out.push({ shape: "torus", radius: 0.07, tube: 0.026, sides: 8, pos: [0, NOEUD, 0], color: "dry" });
  out.push({ shape: "torus", radius: 0.075, tube: 0.02, sides: 8, pos: [0, NOEUD - 0.06, 0], color: "dry" });
  out.push({ shape: "cylinder", sides: 8, radius: 0.06, height: 0.1, pos: [0, NOEUD - 0.17, 0], color: "faction" });
  // mât télescopique : premier étage pris dans le trépied, collier, second étage plus fin
  out.push({ shape: "cylinder", sides: 8, radius: 0.045, height: 1.05, pos: [0, 0.95, 0], color: "steel" });
  out.push({ shape: "cylinder", sides: 8, radius: 0.058, height: 0.06, pos: [0, 1.47, 0], color: "dark" });
  out.push({ shape: "cylinder", sides: 8, radius: 0.03, height: 0.5, pos: [0, 1.74, 0], color: "metal" });
  out.push({ shape: "box", size: [0.02, 0.08, 0.04], pos: [0.06, 1.47, 0], color: "black", fine: true });
  // traverse à isolateurs (trois disques de céramique de chaque côté, embout lumineux)
  out.push({ shape: "box", size: [0.76, 0.05, 0.06], pos: [0, 1.82, 0], color: "wood" });
  out.push({ shape: "box", size: [0.04, 0.2, 0.03], pos: [0.12, 1.73, 0], rot: [0, 0, -40], color: "metal", mirror: true, fine: true });
  for (const y of [1.86, 1.9, 1.94]) {
    out.push({ shape: "cylinder", sides: 8, radius: 0.05, height: 0.02, pos: [0.32, y, 0], color: "light", mirror: true, fine: true });
  }
  out.push({ shape: "cylinder", sides: 6, radius: 0.022, height: 0.14, pos: [0.32, 1.9, 0], color: "light", mirror: true });
  out.push({ shape: "sphere", radius: 0.028, pos: [0.32, 1.98, 0], color: "glow", mirror: true });
  // lanterne ambre pendue sous la traverse
  out.push({ shape: "box", size: [0.012, 0.08, 0.012], pos: [-0.2, 1.76, 0], color: "black", fine: true });
  out.push({ shape: "cylinder", sides: 6, radius: 0.04, height: 0.07, pos: [-0.2, 1.69, 0], color: "amber" });
  out.push({ shape: "cone", sides: 6, radius: 0.05, height: 0.04, pos: [-0.2, 1.745, 0], color: "dark" });
  // tête : pointe et fanion d'équipe
  out.push({ shape: "cone", sides: 6, radius: 0.035, height: 0.12, pos: [0, 2.05, 0], color: "dark" });
  out.push({ shape: "extrude", profile: [[0, 0], [0.34, -0.07], [0.3, -0.1], [0.34, -0.15], [0, -0.2]], depth: 0.012, pos: [0.02, 2.04, 0], rot: [0, -70, 0], color: "faction" });
  // haubans vers trois piquets, entre les pieds du trépied
  const tete: Vec3 = [0, 1.5, 0];
  for (const a of [30, 150, 270]) {
    const [px, pz] = [q(Math.cos(rad(a)) * 0.46), q(Math.sin(rad(a)) * 0.46)];
    out.push({ shape: "tube", radius: 0.006, sides: 4, path: [tete, [px, 0.06, pz]], color: "black", fine: true });
    out.push({ shape: "cylinder", sides: 4, radius: 0.018, radiusTop: 0.01, height: 0.1, pos: [px, 0.04, pz], color: "wood" });
  }
  // coffret du câble au pied, câble qui monte le long du mât
  out.push(...coffre([0.13, 0.1, 0.2], [0.18, 0.16, 0.12], "dark", "dry"));
  out.push({ shape: "box", size: [0.05, 0.03, 0.02], pos: [0.13, 0.13, 0.265], color: "amber" });
  out.push({ shape: "tube", radius: 0.012, sides: 5, path: [[0.13, 0.18, 0.2], [0.05, 0.5, 0.05], [0.05, 1.4, 0.03]], color: "rubber", fine: true });
  return out.map(echelle);
}
