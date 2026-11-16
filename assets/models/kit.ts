// Sous-ensembles réutilisables : chenilles, tourelles, canons, réacteurs, socles.
import type { Part } from "./types.ts";

export const KIT: Record<string, Part[]> = {
  // Chenille : à placer sur un côté (utiliser mirror pour l'autre)
  chenille: [
    { shape: "box", size: [0.45, 0.45, 2.3], pos: [0, 0.25, 0], color: "dark" },
    { shape: "box", size: [0.5, 0.12, 2.0], pos: [0, 0.5, 0], color: "metal" },
    { shape: "cylinder", sides: 6, radius: 0.22, height: 0.5, pos: [0, 0.25, 1.05], rot: [0, 0, 90], color: "metal" },
    { shape: "cylinder", sides: 6, radius: 0.22, height: 0.5, pos: [0, 0.25, -1.05], rot: [0, 0, 90], color: "metal" },
  ],
  // Tourelle compacte, centrée sur l'origine (à marquer pivot dans le modèle)
  tourelle: [
    { shape: "cylinder", sides: 6, radius: 0.55, height: 0.35, pos: [0, 0, 0], color: "faction" },
    { shape: "box", size: [0.5, 0.25, 0.5], pos: [0, 0.25, -0.05], color: "metal" },
  ],
  // Canon pointant vers +z, base à l'origine
  canon: [
    { shape: "cylinder", sides: 5, radius: 0.08, height: 1.2, pos: [0, 0, 0.6], rot: [90, 0, 0], color: "metal" },
    { shape: "cylinder", sides: 5, radius: 0.12, height: 0.2, pos: [0, 0, 1.2], rot: [90, 0, 0], color: "dark" },
  ],
  canon_lourd: [
    { shape: "box", size: [0.3, 0.3, 0.5], pos: [0, 0, 0.2], color: "dark" },
    { shape: "cylinder", sides: 6, radius: 0.14, height: 1.8, pos: [0, 0, 1.1], rot: [90, 0, 0], color: "metal" },
    { shape: "cylinder", sides: 6, radius: 0.2, height: 0.3, pos: [0, 0, 2.0], rot: [90, 0, 0], color: "dark" },
  ],
  // Réacteur (tuyère) pointant vers -z
  reacteur: [
    { shape: "cylinder", sides: 6, radius: 0.25, radiusTop: 0.3, height: 0.7, rot: [90, 0, 0], color: "metal" },
    { shape: "cylinder", sides: 6, radius: 0.2, height: 0.08, pos: [0, 0, -0.37], rot: [90, 0, 0], color: "glow" },
  ],
  // Socle carré de bâtiment, 1 x 1 au sol (mettre à l'échelle avec scale)
  socle: [
    { shape: "box", size: [1, 0.15, 1], pos: [0, 0.075, 0], color: "dark" },
    { shape: "box", size: [0.9, 0.1, 0.9], pos: [0, 0.2, 0], color: "metal" },
  ],
  // Jambe de marcheur (verticale, pied en bas à l'origine)
  jambe: [
    { shape: "box", size: [0.22, 0.9, 0.22], pos: [0, 0.45, 0], color: "metal" },
    { shape: "box", size: [0.4, 0.1, 0.5], pos: [0, 0.05, 0.05], color: "dark" },
    { shape: "box", size: [0.26, 0.25, 0.26], pos: [0, 0.9, 0], color: "faction" },
  ],
  // Aile (côté droit, utiliser mirror)
  aile: [
    { shape: "wedge", size: [1.4, 0.1, 0.8], pos: [0.8, 0, -0.1], color: "faction" },
  ],
  // Antenne / mât
  antenne: [
    { shape: "cylinder", sides: 5, radius: 0.04, height: 1.0, pos: [0, 0.5, 0], color: "light" },
    { shape: "sphere", radius: 0.08, pos: [0, 1.0, 0], color: "glow" },
  ],
  // Chenille légère (24 triangles par côté)
  chenille_l: [
    { shape: "box", size: [0.4, 0.4, 2.2], pos: [0, 0.22, 0], color: "dark" },
    { shape: "box", size: [0.44, 0.1, 1.9], pos: [0, 0.44, 0], color: "metal" },
  ],
  // Pales de rotor / hélice (à marquer pivot), centrées sur l'origine
  rotor: [
    { shape: "box", size: [1.6, 0.03, 0.12], pos: [0, 0, 0], color: "light" },
    { shape: "box", size: [0.12, 0.03, 1.6], pos: [0, 0.02, 0], color: "light" },
  ],
  // Patin de glisseur
  pad: [
    { shape: "cylinder", sides: 6, radius: 0.4, height: 0.18, pos: [0, 0.09, 0], color: "dark" },
    { shape: "box", size: [0.4, 0.04, 0.4], pos: [0, 0.02, 0], color: "glow" },
  ],
  // Patte d'araignée (côté droit, hanche à l'origine, pied à y = -1)
  patte: [
    { shape: "box", size: [1.12, 0.2, 0.2], pos: [0.5, 0.25, 0], rot: [0, 0, 26.6], color: "faction" },
    { shape: "box", size: [0.2, 1.62, 0.2], pos: [1.3, -0.25, 0], rot: [0, 0, 21.7], color: "metal" },
    { shape: "box", size: [0.3, 0.1, 0.3], pos: [1.6, -0.97, 0], color: "dark" },
  ],
  // Coque de navire : 1 de large, 3.4 de long, étrave en +z (mettre à l'échelle [largeur, 1, longueur/3.4])
  coque: [
    { shape: "box", size: [1, 0.4, 2.2], pos: [0, 0.2, -0.6], color: "dark" },
    { shape: "wedge", size: [0.4, 0.5, 1.2], pos: [0.25, 0.2, 1.1], rot: [0, 0, -90], mirror: true, color: "dark" },
    { shape: "box", size: [0.9, 0.12, 2.2], pos: [0, 0.46, -0.6], color: "faction" },
    { shape: "wedge", size: [0.12, 0.45, 1.2], pos: [0.225, 0.46, 1.1], rot: [0, 0, -90], mirror: true, color: "faction" },
  ],
};
