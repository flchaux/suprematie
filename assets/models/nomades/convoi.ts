// Chariot de convoi (t_cart) : petit chenillard de charge attelé à une soute, qui fait la navette entre elle et
// un module éloigné. Deux chenilles courtes, un châssis bas, un poste de conduite à l'avant gauche (siège,
// guidon, pare-brise, auvent de bâche), une benne ouverte à ridelles de bois, un timon d'attelage replié à
// l'arrière, des jupes et une bande aux couleurs de l'équipe. La benne est vide : le client y pose ce que le
// chariot porte (CART_SLOTS dans packages/client/src/render/entities/cargo.ts, plancher à CART_FLOOR).
// Repère : +x à droite, +y en haut, +z vers l'avant.
import type { Part } from "../types.ts";
import { chenille, voute } from "./commun.ts";
import { ridellesConvoi, variantesConvoi } from "./variantes.ts";

export function chariotConvoi(): Part[] {
  const p: Part[] = [
    ...chenille(0.4, 1.6, 0.34, 0.2, 0, 0, 0.3, true),
    // châssis et plancher
    { shape: "bevel", size: [0.6, 0.18, 1.5], pos: [0, 0.34, 0], bevel: 0.03, color: "dark" },
    { shape: "box", size: [0.84, 0.04, 1.4], pos: [0, 0.45, -0.02], color: "metal" },
    { shape: "box", size: [0.025, 0.14, 1.0], pos: [0.51, 0.28, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.21, 0.035, 0.18], pos: [0.4, 0.37, 0.72], color: "rust", mirror: true },
    // poste de conduite : siège, dossier, guidon, pare-brise et auvent
    { shape: "bevel", size: [0.24, 0.08, 0.26], pos: [-0.2, 0.53, 0.48], bevel: 0.02, color: "rubber" },
    { shape: "box", size: [0.24, 0.24, 0.05], pos: [-0.2, 0.66, 0.35], color: "rubber" },
    { shape: "tube", radius: 0.018, sides: 5, path: [[-0.2, 0.47, 0.66], [-0.2, 0.68, 0.62], [-0.1, 0.72, 0.62]], color: "steel", fine: true },
    { shape: "box", size: [0.18, 0.03, 0.03], pos: [-0.2, 0.72, 0.62], color: "black" },
    { shape: "box", size: [0.3, 0.18, 0.02], pos: [-0.2, 0.72, 0.72], rot: [-15, 0, 0], color: "glass" },
    { shape: "tube", radius: 0.016, sides: 5, path: [[-0.35, 0.47, 0.72], [-0.35, 0.98, 0.66], [-0.35, 0.98, 0.32], [-0.35, 0.47, 0.32]], bend: 0.06, color: "steel", fine: true },
    { shape: "tube", radius: 0.016, sides: 5, path: [[-0.05, 0.47, 0.72], [-0.05, 0.98, 0.66], [-0.05, 0.98, 0.32], [-0.05, 0.47, 0.32]], bend: 0.06, color: "steel", fine: true },
    { shape: "extrude", profile: voute(0.17, 0.06, 5), depth: 0.42, pos: [-0.2, 0.98, 0.49], color: "dry" },
    // phares
    { shape: "box", size: [0.09, 0.05, 0.03], pos: [0.24, 0.42, 0.76], color: "amber", mirror: true },
    // benne à ridelles de bois (côtés, avant, hayon), montants d'acier
    ...ridellesConvoi(),
    { shape: "box", size: [0.77, 0.22, 0.04], pos: [0, 0.58, -0.72], color: "wood" },
    { shape: "box", size: [0.4, 0.22, 0.04], pos: [0.18, 0.58, 0.28], color: "wood" },
    { shape: "box", size: [0.79, 0.035, 0.05], pos: [0, 0.68, -0.72], color: "faction" },
    ...[0.26, -0.22, -0.7].map((z): Part => ({ shape: "box", size: [0.05, 0.26, 0.05], pos: [0.39, 0.58, z], color: "steel", mirror: true, fine: true })),
    // timon d'attelage replié sous la benne, anneau
    { shape: "box", size: [0.06, 0.05, 0.36], pos: [0, 0.34, -0.9], color: "rust" },
    { shape: "torus", radius: 0.06, tube: 0.015, sides: 8, pos: [0, 0.34, -1.1], rot: [90, 0, 0], color: "steel", fine: true },
    // fanion d'équipe sur un montant
    { shape: "cylinder", sides: 5, radius: 0.012, height: 0.5, pos: [0.4, 0.95, -0.7], color: "steel", fine: true },
    { shape: "extrude", profile: [[0, 0], [0.2, -0.05], [0, -0.1]], depth: 0.01, pos: [0.4, 1.18, -0.7], rot: [0, 90, 0], color: "faction" },
    // variantes : pièces dépareillées (voir nomades/variantes.ts)
    ...variantesConvoi(),
  ];
  return p;
}
