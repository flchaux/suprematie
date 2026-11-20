// Sous-ensembles réutilisables : chenilles, tourelles, canons, réacteurs, socles.
import type { Part } from "./types.ts";

/** Contour en stade (rectangle aux bouts arrondis) de longueur `l` (axe x) et de hauteur `h`, centré. */
export function stade(l: number, h: number, n = 5): [number, number][] {
  const r = h / 2;
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    out.push([l / 2 - r + Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI;
    out.push([-l / 2 + r + Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

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
  // Chenille détaillée (côté droit, utiliser mirror) : bande de caoutchouc en stade, quatre galets, barbotin
  // à l'avant, roue folle à l'arrière ; galets et moyeux sont des pièces fines. 2,3 de long, 0,5 de haut.
  chenille_d: [
    { shape: "extrude", profile: stade(2.3, 0.5, 4), depth: 0.42, bevel: 0.04, pos: [0, 0.25, 0], rot: [0, -90, 0], color: "rubber" },
    { shape: "extrude", profile: stade(2.12, 0.34, 4), depth: 0.46, pos: [0, 0.25, 0], rot: [0, -90, 0], color: "dark", fine: true },
    { shape: "cylinder", sides: 10, radius: 0.15, height: 0.48, pos: [0, 0.2, 0.42], rot: [0, 0, 90], color: "metal", fine: true },
    { shape: "cylinder", sides: 10, radius: 0.15, height: 0.48, pos: [0, 0.2, -0.05], rot: [0, 0, 90], color: "metal", fine: true },
    { shape: "cylinder", sides: 10, radius: 0.15, height: 0.48, pos: [0, 0.2, -0.52], rot: [0, 0, 90], color: "metal", fine: true },
    { shape: "cylinder", sides: 8, radius: 0.2, height: 0.5, bevel: 0.03, pos: [0, 0.27, 0.92], rot: [0, 0, 90], color: "steel" },
    { shape: "cylinder", sides: 8, radius: 0.18, height: 0.5, bevel: 0.03, pos: [0, 0.27, -0.92], rot: [0, 0, 90], color: "steel" },
    { shape: "cylinder", sides: 6, radius: 0.07, height: 0.54, pos: [0, 0.27, 0.92], rot: [0, 0, 90], color: "dark", fine: true },
  ],
  // Roue à pneu (axe x), diamètre 1, largeur 0,4 : pneu de caoutchouc, jante d'acier et moyeu (fin)
  roue_d: [
    { shape: "lathe", sides: 12, profile: [[0.36, -0.2], [0.46, -0.2], [0.5, -0.12], [0.5, 0.12], [0.46, 0.2], [0.36, 0.2]], rot: [0, 0, 90], color: "rubber" },
    { shape: "cylinder", sides: 12, radius: 0.36, height: 0.34, rot: [0, 0, 90], color: "steel" },
    { shape: "cylinder", sides: 6, radius: 0.12, height: 0.42, rot: [0, 0, 90], color: "dark", fine: true },
  ],
  // Garde-corps de 1 de long (axe x), 0,3 de haut, posé à l'origine : main courante et trois montants (pièce fine)
  garde_corps: [
    { shape: "tube", radius: 0.018, sides: 4, path: [[-0.5, 0.3, 0], [0.5, 0.3, 0]], color: "hazard", fine: true },
    { shape: "tube", radius: 0.012, sides: 4, path: [[-0.5, 0.15, 0], [0.5, 0.15, 0]], color: "light", fine: true },
    { shape: "box", size: [0.03, 0.3, 0.03], pos: [-0.48, 0.15, 0], color: "light", fine: true },
    { shape: "box", size: [0.03, 0.3, 0.03], pos: [0, 0.15, 0], color: "light", fine: true },
    { shape: "box", size: [0.03, 0.3, 0.03], pos: [0.48, 0.15, 0], color: "light", fine: true },
  ],
  // Échelle de 1 de haut (axe y), base à l'origine, plaquée contre une paroi en -z (pièce fine)
  echelle: [
    { shape: "box", size: [0.03, 1, 0.03], pos: [-0.1, 0.5, 0], color: "light", fine: true },
    { shape: "box", size: [0.03, 1, 0.03], pos: [0.1, 0.5, 0], color: "light", fine: true },
    { shape: "box", size: [0.2, 0.02, 0.02], pos: [0, 0.2, 0], color: "metal", fine: true },
    { shape: "box", size: [0.2, 0.02, 0.02], pos: [0, 0.4, 0], color: "metal", fine: true },
    { shape: "box", size: [0.2, 0.02, 0.02], pos: [0, 0.6, 0], color: "metal", fine: true },
    { shape: "box", size: [0.2, 0.02, 0.02], pos: [0, 0.8, 0], color: "metal", fine: true },
  ],
  // Cuve verticale de rayon 0,5 et de 1 de haut, base à l'origine : jupe, fût, dôme, cerclages fins
  cuve: [
    { shape: "lathe", sides: 12, profile: [[0, 0], [0.52, 0], [0.52, 0.06], [0.5, 0.08], [0.5, 0.78], [0.4, 0.93], [0.2, 0.995], [0, 1.0]], color: "light" },
    { shape: "torus", radius: 0.505, tube: 0.02, sides: 12, pos: [0, 0.3, 0], color: "metal", fine: true },
    { shape: "torus", radius: 0.505, tube: 0.02, sides: 12, pos: [0, 0.6, 0], color: "metal", fine: true },
  ],
  // Trappe d'entrée ou de sortie des objets, en unités de case, face vers +z, origine sur la paroi au
  // centre de la trappe. Le jeu la pose sur chaque case de bord des bâtiments qui reçoivent des objets
  // (voir withHatches) : plaque d'acier, volet sombre en retrait, cadre en saillie, seuil rayé. Ouverte,
  // le jeu allume le pourtour du volet (cyan : entrée, ambre : sortie) et creuse l'ouverture.
  trappe: [
    { shape: "box", size: [0.6, 0.4, 0.04], color: "steel" },
    { shape: "box", size: [0.46, 0.26, 0.03], pos: [0, 0, 0.03], color: "dark" },
    { shape: "box", size: [0.6, 0.06, 0.05], pos: [0, 0.17, 0.045], color: "steel", fine: true },
    { shape: "box", size: [0.6, 0.06, 0.05], pos: [0, -0.17, 0.045], color: "hazard", fine: true },
    { shape: "box", size: [0.07, 0.28, 0.05], pos: [0.265, 0, 0.045], color: "steel", mirror: true, fine: true },
    { shape: "box", size: [0.42, 0.02, 0.012], pos: [0, 0.06, 0.051], color: "metal", fine: true },
    { shape: "box", size: [0.42, 0.02, 0.012], pos: [0, -0.06, 0.051], color: "metal", fine: true },
  ],
  // Volant de vanne (axe y) de rayon 0,1 sur sa tige (pièce fine)
  vanne: [
    { shape: "cylinder", sides: 6, radius: 0.025, height: 0.12, pos: [0, 0.06, 0], color: "metal", fine: true },
    { shape: "torus", radius: 0.08, tube: 0.015, sides: 10, pos: [0, 0.12, 0], color: "red", fine: true },
  ],
  // Coque de navire : 1 de large, 3.4 de long, étrave en +z (mettre à l'échelle [largeur, 1, longueur/3.4])
  coque: [
    { shape: "box", size: [1, 0.4, 2.2], pos: [0, 0.2, -0.6], color: "dark" },
    { shape: "wedge", size: [0.4, 0.5, 1.2], pos: [0.25, 0.2, 1.1], rot: [0, 0, -90], mirror: true, color: "dark" },
    { shape: "box", size: [0.9, 0.12, 2.2], pos: [0, 0.46, -0.6], color: "faction" },
    { shape: "wedge", size: [0.12, 0.45, 1.2], pos: [0.225, 0.46, 1.1], rot: [0, 0, -90], mirror: true, color: "faction" },
  ],
};
