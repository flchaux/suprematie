// Chariot de convoi (t_cart) : petit chenillard de charge attelé à une soute, qui fait la navette entre elle et
// un module éloigné. Deux chenilles courtes, un châssis bas, un poste de conduite à l'avant gauche (siège,
// guidon, pare-brise, auvent de bâche), une benne ouverte à ridelles de bois chargée de caisses sanglées et d'un
// sac sous bâche, un timon d'attelage replié à l'arrière, des jupes et une bande aux couleurs de l'équipe.
// Repère : +x à droite, +y en haut, +z vers l'avant.
import type { Part } from "../types.ts";
import { chenille, coffre, voute } from "./commun.ts";

export function chariotConvoi(): Part[] {
  const p: Part[] = [
    ...chenille(0.5, 1.6, 0.34, 0.24, 0, 0, 0.3, true),
    // châssis et plancher
    { shape: "bevel", size: [0.76, 0.18, 1.5], pos: [0, 0.34, 0], bevel: 0.03, color: "dark" },
    { shape: "box", size: [1.04, 0.04, 1.4], pos: [0, 0.45, -0.02], color: "metal" },
    { shape: "box", size: [0.025, 0.14, 1.0], pos: [0.63, 0.28, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.26, 0.035, 0.18], pos: [0.5, 0.37, 0.72], color: "rust", mirror: true },
    // poste de conduite : siège, dossier, guidon, pare-brise et auvent
    { shape: "bevel", size: [0.3, 0.08, 0.26], pos: [-0.26, 0.53, 0.48], bevel: 0.02, color: "rubber" },
    { shape: "box", size: [0.3, 0.24, 0.05], pos: [-0.26, 0.66, 0.35], color: "rubber" },
    { shape: "tube", radius: 0.018, sides: 5, path: [[-0.26, 0.47, 0.66], [-0.26, 0.68, 0.62], [-0.14, 0.72, 0.62]], color: "steel", fine: true },
    { shape: "box", size: [0.22, 0.03, 0.03], pos: [-0.26, 0.72, 0.62], color: "black" },
    { shape: "box", size: [0.38, 0.18, 0.02], pos: [-0.26, 0.72, 0.72], rot: [-15, 0, 0], color: "glass" },
    { shape: "tube", radius: 0.016, sides: 5, path: [[-0.44, 0.47, 0.72], [-0.44, 0.98, 0.66], [-0.44, 0.98, 0.32], [-0.44, 0.47, 0.32]], bend: 0.06, color: "steel", fine: true },
    { shape: "tube", radius: 0.016, sides: 5, path: [[-0.08, 0.47, 0.72], [-0.08, 0.98, 0.66], [-0.08, 0.98, 0.32], [-0.08, 0.47, 0.32]], bend: 0.06, color: "steel", fine: true },
    { shape: "extrude", profile: voute(0.21, 0.06, 5), depth: 0.42, pos: [-0.26, 0.98, 0.49], color: "dry" },
    // phares
    { shape: "box", size: [0.09, 0.05, 0.03], pos: [0.3, 0.42, 0.76], color: "amber", mirror: true },
    // benne à ridelles de bois (côtés, avant, hayon), montants d'acier
    { shape: "box", size: [0.04, 0.22, 1.0], pos: [0.48, 0.58, -0.22], color: "wood", mirror: true },
    { shape: "box", size: [0.96, 0.22, 0.04], pos: [0, 0.58, -0.72], color: "wood" },
    { shape: "box", size: [0.5, 0.22, 0.04], pos: [0.23, 0.58, 0.28], color: "wood" },
    { shape: "box", size: [0.98, 0.035, 0.05], pos: [0, 0.68, -0.72], color: "faction" },
    ...[0.26, -0.22, -0.7].map((z): Part => ({ shape: "box", size: [0.05, 0.26, 0.05], pos: [0.49, 0.58, z], color: "steel", mirror: true, fine: true })),
    // chargement : caisses sanglées, sac sous bâche
    ...coffre([0.22, 0.6, -0.08], [0.36, 0.26, 0.3]),
    ...coffre([0.2, 0.84, -0.1], [0.28, 0.2, 0.24], "rust"),
    ...coffre([-0.22, 0.6, -0.46], [0.36, 0.26, 0.3], "metal"),
    { shape: "sphere", radius: 0.2, detail: 1, pos: [-0.24, 0.6, -0.08], scale: [1, 0.7, 1.1], color: "dry" },
    { shape: "box", size: [0.03, 0.02, 0.4], pos: [-0.24, 0.73, -0.08], color: "black", fine: true },
    { shape: "sphere", radius: 0.14, detail: 1, pos: [0.22, 0.58, -0.48], scale: [1, 0.7, 1], color: "copper" },
    // timon d'attelage replié sous la benne, anneau
    { shape: "box", size: [0.06, 0.05, 0.36], pos: [0, 0.34, -0.9], color: "rust" },
    { shape: "torus", radius: 0.06, tube: 0.015, sides: 8, pos: [0, 0.34, -1.1], rot: [90, 0, 0], color: "steel", fine: true },
    // fanion d'équipe sur un montant
    { shape: "cylinder", sides: 5, radius: 0.012, height: 0.5, pos: [0.5, 0.95, -0.7], color: "steel", fine: true },
    { shape: "extrude", profile: [[0, 0], [0.2, -0.05], [0, -0.1]], depth: 0.01, pos: [0.5, 1.18, -0.7], rot: [0, 90, 0], color: "faction" },
  ];
  return p;
}
