// Variantes des paliers supérieurs des Industriels, aviation (voir « Paliers des unités » dans
// docs/spec/contenu.md) : avion espion, canonnière lourde, bombardier torpilleur.
// Même langage que leurs versions de base (units.ts) : fuselages tournés sombres, plans aux couleurs du camp,
// panneaux clairs, filets cyan, tuyères lumineuses, feux ambre ; pièces fines pour le détail.
import type { Model, Part } from "./types.ts";

/**
 * Canonnière lourde : rotor caréné en (x, z), centré à la hauteur y ; carène d'équipe, anneau lumineux, fond
 * sombre, croisillon, moteur, et pales portées par le pivot `nom` (le jeu le fait tourner seul).
 */
function rotorCarene(x: number, y: number, z: number, nom: string): Part[] {
  return [
    { shape: "torus", radius: 0.62, tube: 0.1, sides: 14, pos: [x, y, z], scale: [1, 1.4, 1], color: "faction" },
    { shape: "lathe", sides: 16, profile: [[0.55, 0], [0.49, 0]], pos: [x, y + 0.1, z], color: "glow" },
    { shape: "cylinder", sides: 8, radius: 0.54, height: 0.03, pos: [x, y - 0.12, z], color: "dark", fine: true },
    { shape: "box", size: [1.2, 0.04, 0.06], pos: [x, y - 0.09, z], color: "metal", fine: true },
    { shape: "box", size: [0.06, 0.04, 1.2], pos: [x, y - 0.09, z], color: "metal", fine: true },
    { shape: "cone", sides: 6, radius: 0.12, height: 0.16, pos: [x, y + 0.16, z], color: "steel", pivot: nom },
    { use: "rotor", pos: [x, y + 0.11, z], scale: [0.64, 1, 0.64], parent: nom },
  ];
}

export const PALIERS_AIR: Record<string, Model> = {
  // spy_plane : avion de reconnaissance stratégique, version aboutie de l'éclaireur. Long fuselage sombre en
  // aiguille à nez clair, grandes ailes delta minces d'équipe prolongées par des arêtes (chines) jusqu'au nez,
  // deux réacteurs à mi-envergure (cône d'entrée d'air, tuyère cyan) portant des dérives inclinées vers
  // l'intérieur, radôme dorsal clair à filet cyan, mât d'antenne, nacelles de capteurs en bout d'aile (lentille
  // ambre) et sous le ventre ; sans arme
  spy_plane: {
    parts: [
      // fuselage en aiguille, nez clair et sonde
      { shape: "lathe", sides: 12, pos: [0, 0.45, 0], rot: [90, 0, 0], scale: [1, 1, 0.7], color: "dark", profile: [[0, -1.9], [0.14, -1.9], [0.2, -1.6], [0.22, -0.8], [0.22, 0.4], [0.19, 1.1], [0.14, 1.6], [0.085, 2.0], [0, 2.0]] },
      { shape: "lathe", sides: 12, pos: [0, 0.45, 0], rot: [90, 0, 0], scale: [1, 1, 0.7], color: "light", profile: [[0, 1.98], [0.087, 1.98], [0.05, 2.2], [0.015, 2.33], [0, 2.35]] },
      { shape: "cylinder", sides: 4, radius: 0.01, height: 0.14, pos: [0, 0.45, 2.4], rot: [90, 0, 0], color: "dark", fine: true },
      // ailes delta minces et arêtes jusqu'au nez : plan d'équipe, panneau clair, bord de fuite cyan, volets
      { shape: "extrude", profile: [[0.05, 2.0], [0.26, 1.3], [0.4, 0.5], [1.28, -1.3], [1.34, -1.4], [1.34, -1.55], [0.1, -1.55]], depth: 0.05, bevel: 0.015, pos: [0, 0.45, 0], rot: [90, 0, 0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[0.86, -0.56], [1.12, -1.08], [1.12, -1.48], [0.86, -1.48]], depth: 0.02, pos: [0, 0.48, 0], rot: [90, 0, 0], color: "light", mirror: true },
      { shape: "box", size: [1.12, 0.022, 0.04], pos: [0.78, 0.45, -1.56], color: "glow", mirror: true },
      { shape: "box", size: [0.02, 0.012, 0.32], pos: [1.0, 0.49, -1.3], color: "dark", mirror: true, fine: true },
      { shape: "box", size: [0.012, 0.01, 0.7], pos: [0.3, 0.478, 0.9], rot: [0, -10, 0], color: "glow", mirror: true, fine: true },
      // verrière biplace et arceau
      { shape: "sphere", radius: 1, detail: 1, pos: [0, 0.57, 1.05], scale: [0.12, 0.09, 0.36], color: "glass" },
      { shape: "tube", radius: 0.01, sides: 4, path: [[-0.11, 0.58, 1.02], [0, 0.665, 1.02], [0.11, 0.58, 1.02]], bend: 0.05, color: "dark", fine: true },
      // radôme dorsal clair à filet cyan, dos d'équipe à grilles, mât d'antenne
      { shape: "lathe", sides: 12, pos: [0, 0.62, -0.05], rot: [90, 0, 0], scale: [1, 1, 0.5], color: "light", profile: [[0, -0.6], [0.08, -0.55], [0.13, -0.35], [0.13, 0.3], [0.09, 0.5], [0, 0.56]] },
      { shape: "box", size: [0.025, 0.015, 0.75], pos: [0, 0.685, -0.07], color: "glow" },
      { shape: "bevel", size: [0.22, 0.06, 0.9], pos: [0, 0.59, -1.15], bevel: 0.02, color: "faction" },
      ...[-1.0, -1.15, -1.3].map((z): Part => ({ shape: "box", size: [0.14, 0.01, 0.025], pos: [0, 0.622, z], color: "black", fine: true })),
      { use: "antenne", pos: [0, 0.6, -1.5], scale: 0.26, fine: true },
      // réacteurs à mi-envergure : nacelle d'acier, entrée d'air noire et cône, tuyère lumineuse
      { shape: "lathe", sides: 12, pos: [0.62, 0.45, 0], rot: [90, 0, 0], color: "steel", mirror: true, profile: [[0, -1.78], [0.13, -1.78], [0.14, -1.84], [0.165, -1.84], [0.18, -1.6], [0.18, 0.3], [0.16, 0.6], [0.15, 0.64], [0, 0.64]] },
      { shape: "cylinder", sides: 12, radius: 0.13, height: 0.02, pos: [0.62, 0.45, 0.65], rot: [90, 0, 0], color: "black", mirror: true },
      { shape: "cone", sides: 10, radius: 0.1, height: 0.32, pos: [0.62, 0.45, 0.78], rot: [90, 0, 0], color: "steel", mirror: true },
      { shape: "cylinder", sides: 12, radius: 0.12, height: 0.02, pos: [0.62, 0.45, -1.79], rot: [90, 0, 0], color: "glow", mirror: true },
      { shape: "torus", radius: 0.182, tube: 0.015, sides: 12, pos: [0.62, 0.45, -1.2], rot: [90, 0, 0], color: "dark", mirror: true, fine: true },
      ...[-0.5, -0.65, -0.8].map((z): Part => ({ shape: "box", size: [0.16, 0.012, 0.03], pos: [0.62, 0.632, z], color: "black", mirror: true, fine: true })),
      // dérives inclinées vers l'intérieur sur les réacteurs, feu cyan
      { shape: "extrude", profile: [[-1.7, 0], [-1.05, 0], [-1.42, 0.45], [-1.62, 0.45]], depth: 0.04, bevel: 0.012, pos: [0.62, 0.6, 0], rot: [-90, -105, -90], color: "faction", mirror: true },
      { shape: "box", size: [0.02, 0.02, 0.18], pos: [0.5, 1.03, -1.52], rot: [0, 0, 15], color: "glow", mirror: true, fine: true },
      // nacelles de capteurs en bout d'aile : lentille ambre, bague cyan
      { shape: "lathe", sides: 8, pos: [1.37, 0.45, -1.05], rot: [90, 0, 0], color: "light", mirror: true, profile: [[0, -0.55], [0.045, -0.5], [0.065, -0.35], [0.065, 0.3], [0.045, 0.45], [0, 0.5]] },
      { shape: "sphere", radius: 0.035, pos: [1.37, 0.45, -0.58], color: "amber", mirror: true },
      { shape: "torus", radius: 0.066, tube: 0.012, sides: 8, pos: [1.37, 0.45, -0.85], rot: [90, 0, 0], color: "glow", mirror: true, fine: true },
      // nacelle de capteurs ventrale : carène claire, hublots sombres, optique ambre
      { shape: "lathe", sides: 10, pos: [0, 0.26, 0.35], rot: [90, 0, 0], color: "light", profile: [[0, -0.6], [0.06, -0.55], [0.1, -0.35], [0.1, 0.4], [0.07, 0.55], [0, 0.6]] },
      { shape: "box", size: [0.03, 0.05, 0.6], pos: [0.095, 0.25, 0.35], color: "dark", mirror: true, fine: true },
      { shape: "sphere", radius: 0.05, pos: [0, 0.24, 0.92], color: "amber" },
      { shape: "sphere", radius: 0.03, pos: [0.2, 0.47, 0.2], color: "amber", mirror: true, fine: true },
    ],
  },

  // heavy_gunship : canonnière lourde, version blindée de la canonnière. Coque tournée massive habillée de
  // plaques d'équipe (dos et flancs à filet cyan), grande verrière, quatre rotors carénés d'équipe à anneau
  // lumineux (pivots « rotor… »), moignons d'aile, deux réacteurs dorsaux, poutre de queue à double dérive,
  // blasters jumelés sous le nez (pivot « tourelle », bagues cyan) et tourelle antiaérienne légère sur le dos
  heavy_gunship: {
    parts: [
      // coque, verrière et arceau
      { shape: "lathe", sides: 10, pos: [0, 1.0, 0], rot: [90, 0, 0], scale: [1, 1, 0.78], color: "dark", profile: [[0, -1.6], [0.42, -1.5], [0.6, -1.0], [0.7, -0.2], [0.7, 0.5], [0.62, 1.05], [0.46, 1.5], [0.24, 1.85], [0, 1.95]] },
      { shape: "lathe", sides: 10, pos: [0, 1.3, 1.2], rot: [90, 0, 0], scale: [0.36, 1, 0.25], color: "glass", profile: [[0, -0.6], [0.75, -0.4], [1, 0], [0.75, 0.4], [0, 0.6]] },
      { shape: "tube", radius: 0.018, sides: 4, path: [[-0.33, 1.32, 1.12], [0, 1.56, 1.12], [0.33, 1.32, 1.12]], bend: 0.12, color: "dark", fine: true },
      { shape: "box", size: [0.05, 0.04, 0.04], pos: [0.3, 0.95, 1.72], color: "amber", mirror: true, fine: true },
      // blindage d'équipe : plaque dorsale à grilles, plaques de flanc à filet cyan
      { shape: "bevel", size: [0.95, 0.2, 1.8], pos: [0, 1.48, -0.35], bevel: 0.06, color: "faction" },
      ...[-0.9, -1.03, -1.16].map((z): Part => ({ shape: "box", size: [0.5, 0.012, 0.05], pos: [0, 1.585, z], color: "black", fine: true })),
      { shape: "extrude", profile: [[-1.08, 0.98], [-0.9, 0.74], [0.75, 0.74], [0.98, 0.98], [0.8, 1.24], [-0.95, 1.24]], depth: 0.1, bevel: 0.03, pos: [0.68, 0, 0], rot: [0, -90, 0], color: "faction", mirror: true },
      { shape: "box", size: [0.03, 0.04, 1.5], pos: [0.735, 1.0, -0.05], color: "glow", mirror: true, fine: true },
      // moignons d'aile clairs et bras des rotors
      { shape: "extrude", profile: [[0.6, 0.32], [1.3, 0.22], [1.3, -0.22], [0.6, -0.32]], depth: 0.1, bevel: 0.03, pos: [0, 1.0, 0], rot: [90, 0, 0], color: "light", mirror: true },
      { shape: "box", size: [0.06, 0.04, 0.04], pos: [1.28, 1.06, 0], color: "amber", mirror: true, fine: true },
      { shape: "box", size: [0.44, 0.14, 0.24], pos: [0.88, 1.0, 0.95], color: "dark", mirror: true },
      { shape: "box", size: [0.44, 0.14, 0.24], pos: [0.88, 1.0, -0.95], color: "dark", mirror: true },
      // quatre rotors carénés
      ...rotorCarene(1.62, 1.05, 0.95, "rotor1"),
      ...rotorCarene(-1.62, 1.05, 0.95, "rotor2"),
      ...rotorCarene(1.62, 1.05, -0.95, "rotor3"),
      ...rotorCarene(-1.62, 1.05, -0.95, "rotor4"),
      { shape: "box", size: [0.04, 0.06, 0.06], pos: [2.35, 1.05, 0.95], color: "amber", mirror: true, fine: true },
      { shape: "box", size: [0.04, 0.06, 0.06], pos: [2.35, 1.05, -0.95], color: "amber", mirror: true, fine: true },
      // réacteurs dorsaux : carénage, nacelle d'acier, entrée noire, tuyère lumineuse
      { shape: "box", size: [0.16, 0.2, 0.5], pos: [0.34, 1.3, -1.2], color: "dark", mirror: true, fine: true },
      { shape: "cylinder", sides: 6, radius: 0.14, radiusTop: 0.17, height: 0.88, pos: [0.34, 1.5, -1.0], rot: [90, 0, 0], color: "steel", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.1, height: 0.03, pos: [0.34, 1.5, -1.45], rot: [90, 0, 0], color: "glow", mirror: true, fine: true },
      // poutre de queue, empennage clair, double dérive d'équipe, feu arrière
      { shape: "cylinder", sides: 6, radius: 0.12, radiusTop: 0.26, height: 1.8, pos: [0, 1.1, -2.1], rot: [90, 0, 0], color: "metal" },
      { shape: "extrude", profile: [[0, -2.55], [0.75, -2.62], [0.75, -2.92], [0, -2.98]], depth: 0.05, bevel: 0.015, pos: [0, 1.1, 0], rot: [90, 0, 0], color: "light", mirror: true },
      { shape: "extrude", profile: [[-3.0, 1.08], [-2.55, 1.08], [-2.75, 1.78], [-3.02, 1.78]], depth: 0.06, bevel: 0.018, pos: [0.72, 0, 0], rot: [0, -90, 0], color: "faction", mirror: true },
      { shape: "box", size: [0.03, 0.03, 0.22], pos: [0.72, 1.79, -2.89], color: "glow", mirror: true, fine: true },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.04, pos: [0, 1.1, -3.01], rot: [90, 0, 0], color: "glow", fine: true },
      // patins : longeron et deux jambes
      { shape: "box", size: [0.05, 0.05, 1.6], pos: [0.45, 0.4, -0.05], color: "metal", mirror: true, fine: true },
      { shape: "box", size: [0.04, 0.3, 0.04], pos: [0.45, 0.54, 0.55], rot: [-20, 0, 0], color: "metal", mirror: true, fine: true },
      { shape: "box", size: [0.04, 0.3, 0.04], pos: [0.45, 0.54, -0.62], rot: [20, 0, 0], color: "metal", mirror: true, fine: true },
      // blasters jumelés sous le nez (pivot « tourelle ») : rotule, masque, tubes d'acier à bagues cyan
      { shape: "sphere", radius: 0.22, pos: [0, 0.6, 1.35], color: "dark", pivot: "tourelle" },
      { shape: "box", size: [0.42, 0.2, 0.22], pos: [0, 0.57, 1.5], color: "steel", parent: "tourelle" },
      { shape: "cylinder", sides: 5, radius: 0.068, height: 0.22, pos: [0.12, 0.56, 1.66], rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 5, radius: 0.045, height: 0.72, pos: [0.12, 0.56, 2.12], rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.058, height: 0.06, pos: [0.12, 0.56, 1.98], rot: [90, 0, 0], color: "glow", mirror: true, parent: "tourelle", fine: true },
      { shape: "cylinder", sides: 6, radius: 0.058, height: 0.06, pos: [0.12, 0.56, 2.44], rot: [90, 0, 0], color: "glow", mirror: true, parent: "tourelle", fine: true },
      // tourelle antiaérienne dorsale (pivot « tourelle_aa ») : couronne, caisse à pans, toit d'équipe, viseur, deux tubes
      { shape: "cylinder", sides: 10, radius: 0.32, height: 0.06, pos: [0, 1.61, -0.1], color: "dark", fine: true },
      { shape: "cylinder", sides: 10, radius: 0.28, height: 0.1, pos: [0, 1.68, -0.1], color: "steel", pivot: "tourelle_aa" },
      { shape: "extrude", profile: [[-0.2, -0.2], [0.2, -0.2], [0.22, 0.07], [0.12, 0.2], [-0.12, 0.2], [-0.22, 0.07]], depth: 0.18, bevel: 0.025, pos: [0, 1.82, -0.12], rot: [90, 0, 0], color: "light", parent: "tourelle_aa" },
      { shape: "extrude", profile: [[-0.2, -0.2], [0.2, -0.2], [0.22, 0.07], [0.12, 0.2], [-0.12, 0.2], [-0.22, 0.07]], depth: 0.03, pos: [0, 1.925, -0.13], rot: [90, 0, 0], scale: [0.78, 0.78, 1], color: "faction", parent: "tourelle_aa" },
      { shape: "box", size: [0.14, 0.035, 0.03], pos: [0, 1.86, 0.085], color: "glow", parent: "tourelle_aa", fine: true },
      { shape: "cylinder", sides: 5, radius: 0.03, height: 0.5, pos: [0.09, 1.946, 0.287], rot: [65, 0, 0], color: "steel", mirror: true, parent: "tourelle_aa" },
      { shape: "cylinder", sides: 6, radius: 0.038, height: 0.06, pos: [0.09, 2.04, 0.49], rot: [65, 0, 0], color: "dark", mirror: true, parent: "tourelle_aa", fine: true },
    ],
  },

  // torpedo_bomber : bombardier torpilleur, bimoteur de mer de la famille du bombardier. Fuselage sombre à nez
  // entièrement vitré (cadres sombres), verrière, dos d'équipe à filet cyan, ailes droites légèrement en flèche
  // (plan sombre, panneaux d'équipe, saumons clairs, bords d'attaque et de fuite cyan), deux réacteurs en nacelle
  // d'acier (bague d'équipe, entrée noire, tuyère lumineuse), deux grosses torpilles claires à ogive rouge sur
  // pylônes entre fuselage et moteurs, dépassant devant les ailes ; empennage clair, dérive d'équipe
  torpedo_bomber: {
    parts: [
      // fuselage, nez vitré et ses cadres, verrière
      { shape: "lathe", sides: 12, pos: [0, 0.6, 0], rot: [90, 0, 0], scale: [1, 1, 0.9], color: "dark", profile: [[0, -2.35], [0.1, -2.3], [0.2, -1.7], [0.3, -0.8], [0.34, 0.2], [0.33, 1.0], [0.29, 1.5], [0.25, 1.72], [0, 1.72]] },
      { shape: "lathe", sides: 12, pos: [0, 0.6, 0], rot: [90, 0, 0], scale: [1, 1, 0.9], color: "glass", profile: [[0, 1.7], [0.252, 1.7], [0.23, 1.88], [0.18, 2.04], [0.1, 2.15], [0, 2.19]] },
      { shape: "torus", radius: 0.254, tube: 0.018, sides: 12, pos: [0, 0.6, 1.72], rot: [90, 0, 0], scale: [1, 1, 0.9], color: "dark" },
      { shape: "tube", radius: 0.012, sides: 4, path: [[0, 0.833, 1.72], [0, 0.812, 1.88], [0, 0.768, 2.04], [0, 0.69, 2.15]], bend: 0.08, color: "dark", fine: true },
      { shape: "lathe", sides: 10, pos: [0, 0.88, 1.15], rot: [90, 0, 0], scale: [0.2, 1, 0.13], color: "glass", profile: [[0, -0.38], [0.75, -0.25], [1, 0], [0.75, 0.25], [0, 0.38]] },
      { shape: "tube", radius: 0.013, sides: 4, path: [[-0.19, 0.88, 1.05], [0, 1.0, 1.05], [0.19, 0.88, 1.05]], bend: 0.08, color: "dark", fine: true },
      // dos d'équipe à filet cyan, grilles, feux
      { shape: "bevel", size: [0.4, 0.08, 1.75], pos: [0, 0.88, -0.12], bevel: 0.03, color: "faction" },
      { shape: "box", size: [0.03, 0.02, 1.5], pos: [0, 0.925, -0.12], color: "glow", fine: true },
      ...[-0.6, -0.75, -0.9].map((z): Part => ({ shape: "box", size: [0.24, 0.012, 0.04], pos: [0, 0.922, z], color: "black", fine: true })),
      { shape: "box", size: [0.05, 0.04, 0.05], pos: [0.3, 0.75, 0.9], color: "amber", mirror: true },
      // ailes : plan sombre, panneau d'équipe, saumon clair, bords d'attaque et de fuite cyan, ailerons, feux
      { shape: "extrude", profile: [[0.25, 0.5], [2.55, 0.2], [2.68, 0.12], [2.68, -0.2], [2.55, -0.27], [0.25, -0.5]], depth: 0.09, bevel: 0.03, pos: [0, 0.62, 0], rot: [90, 0, 0], color: "dark", mirror: true },
      { shape: "extrude", profile: [[0.36, 0.43], [2.12, 0.2], [2.12, -0.27], [0.36, -0.44]], depth: 0.02, pos: [0, 0.67, 0], rot: [90, 0, 0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[2.22, 0.2], [2.6, 0.14], [2.6, -0.22], [2.22, -0.27]], depth: 0.02, pos: [0, 0.67, 0], rot: [90, 0, 0], color: "light", mirror: true },
      { shape: "tube", radius: 0.022, sides: 4, path: [[0.27, 0.62, 0.5], [2.56, 0.62, 0.2]], color: "glow", mirror: true },
      { shape: "tube", radius: 0.018, sides: 4, path: [[0.3, 0.63, -0.505], [2.55, 0.63, -0.275]], color: "glow", mirror: true },
      { shape: "box", size: [0.6, 0.012, 0.02], pos: [1.85, 0.685, -0.2], rot: [0, -5.7, 0], color: "black", mirror: true, fine: true },
      { shape: "box", size: [0.05, 0.05, 0.08], pos: [2.68, 0.64, -0.05], color: "amber", mirror: true },
      // réacteurs en nacelle : carène d'acier, bague d'équipe, entrée noire et cône, tuyère lumineuse
      { shape: "lathe", sides: 10, pos: [1.2, 0.6, 0], rot: [90, 0, 0], color: "steel", mirror: true, profile: [[0, -0.95], [0.14, -0.95], [0.2, -0.6], [0.22, 0.45], [0.17, 0.9], [0, 0.9]] },
      { shape: "cylinder", sides: 10, radius: 0.226, height: 0.22, pos: [1.2, 0.6, 0.55], rot: [90, 0, 0], color: "faction", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.15, height: 0.02, pos: [1.2, 0.6, 0.91], rot: [90, 0, 0], color: "black", mirror: true },
      { shape: "cone", sides: 6, radius: 0.07, height: 0.12, pos: [1.2, 0.6, 0.96], rot: [90, 0, 0], color: "steel", mirror: true, fine: true },
      { shape: "cylinder", sides: 10, radius: 0.13, height: 0.02, pos: [1.2, 0.6, -0.96], rot: [90, 0, 0], color: "glow", mirror: true },
      ...[-0.3, -0.45].map((z): Part => ({ shape: "box", size: [0.18, 0.012, 0.03], pos: [1.2, 0.82, z], color: "black", mirror: true, fine: true })),
      // torpilles sous les ailes : corps clair, ogive rouge, bagues, empennage en croix, hélice ; pylône
      { shape: "box", size: [0.05, 0.14, 0.55], pos: [0.62, 0.51, 0.15], color: "metal", mirror: true },
      { shape: "lathe", sides: 8, pos: [0.62, 0.36, 0.25], rot: [90, 0, 0], color: "light", mirror: true, profile: [[0, -0.85], [0.05, -0.8], [0.1, -0.5], [0.1, 0.45], [0, 0.45]] },
      { shape: "lathe", sides: 8, pos: [0.62, 0.36, 0.25], rot: [90, 0, 0], color: "red", mirror: true, profile: [[0, 0.44], [0.1, 0.44], [0.088, 0.68], [0.045, 0.82], [0, 0.85]] },
      { shape: "cylinder", sides: 8, radius: 0.106, height: 0.04, pos: [0.62, 0.36, 0.05], rot: [90, 0, 0], color: "steel", mirror: true, fine: true },
      { shape: "box", size: [0.26, 0.02, 0.14], pos: [0.62, 0.36, -0.47], color: "dark", mirror: true },
      { shape: "box", size: [0.02, 0.26, 0.14], pos: [0.62, 0.36, -0.47], color: "dark", mirror: true },
      { shape: "box", size: [0.18, 0.015, 0.025], pos: [0.62, 0.36, -0.6], rot: [0, 0, 30], color: "steel", mirror: true, fine: true },
      // empennage clair à bord de fuite cyan, dérive d'équipe, feu cyan
      { shape: "extrude", profile: [[0.12, -1.7], [1.05, -1.9], [1.1, -1.95], [1.1, -2.12], [0.12, -2.22]], depth: 0.05, bevel: 0.015, pos: [0, 0.66, 0], rot: [90, 0, 0], color: "light", mirror: true },
      { shape: "tube", radius: 0.014, sides: 4, path: [[0.15, 0.665, -2.225], [1.1, 0.665, -2.125]], color: "glow", mirror: true },
      { shape: "extrude", profile: [[-2.3, 0.62], [-1.6, 0.62], [-1.95, 1.35], [-2.32, 1.38]], depth: 0.06, bevel: 0.018, rot: [0, -90, 0], color: "faction" },
      { shape: "box", size: [0.03, 0.03, 0.3], pos: [0, 1.37, -2.15], color: "glow", fine: true },
    ],
  },
};
