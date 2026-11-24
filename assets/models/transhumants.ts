// Les Transhumants (voir docs/propositions/races.md) : modules déployés, chenillards et armée.
// Un peuple nomade dont toute l'industrie roule : larges chenilles de caoutchouc, châssis bas et longs, bâches
// ocre et sable sur arceaux, coffres sanglés, mâts repliables, peu de verre, métal patiné. La couleur du joueur
// court sur les jupes des chenilles et les bandes des bâches. Les modules déployés gardent leurs chenilles
// (relevées sur les côtés) et posent quatre stabilisateurs au sol : on voit un véhicule arrêté.
// Repère : +x à droite, +y en haut, +z vers l'avant ; le jeu met chaque modèle à la taille de son emprise.
import type { Model, Part, Vec3 } from "./types.ts";
import { q, incl, fut, chenille, coffre, bache } from "./nomades/commun.ts";
import type { C } from "./nomades/commun.ts";
import { foreuseNomade } from "./nomades/foreuse.ts";
import { fonderieNomade } from "./nomades/fonderie.ts";
import { assembleurNomade } from "./nomades/assembleur.ts";
import { raffinerieNomade } from "./nomades/raffinerie.ts";
import { generateurNomade } from "./nomades/generateur.ts";
import { souteNomade } from "./nomades/soute.ts";
import { laboratoireNomade } from "./nomades/laboratoire.ts";
import { atelierNomade } from "./nomades/atelier.ts";
import { bastionNomade } from "./nomades/bastion.ts";
import { poteauNomade } from "./nomades/poteau.ts";
import { chariotConvoi } from "./nomades/convoi.ts";
import { annexesAssembleur, annexesFonderie, annexesForeuse, annexesRaffinerie } from "./nomades/annexes-production.ts";
import { annexesAtelier, annexesBastion, annexesGenerateur, annexesLaboratoire, annexesSoute } from "./nomades/annexes-service.ts";
import { ameliorationsArche, CANON, FLAK, groupeArche, tourelleArche } from "./nomades/arche.ts";

// ——— Bâtiments ———

export const TRANSH_BUILDING_MODELS: Record<string, Model> = {
  // t_drill : foreuse nomade déployée ; même gréement que le chenillard foreuse (voir foreuseNomade), dans sa
  // pose finale : stabilisateurs posés, mât relevé à l'arrière, tige de forage plantée (pivot « foret »)
  t_drill: { parts: [...foreuseNomade(false), ...annexesForeuse(false)] },
  // t_furnace : voir nomades/fonderie.ts (même gréement que le chenillard, pose déployée)
  t_furnace: { parts: [...fonderieNomade(false), ...annexesFonderie(false)] },
  // t_assembler : voir nomades/assembleur.ts (même gréement que le chenillard, pose déployée)
  t_assembler: { parts: [...assembleurNomade(false), ...annexesAssembleur(false)] },
  // t_refinery : voir nomades/raffinerie.ts (même gréement que le chenillard, pose déployée)
  t_refinery: { parts: [...raffinerieNomade(false), ...annexesRaffinerie(false)] },
  // t_generator : voir nomades/generateur.ts (même gréement que le chenillard, pose déployée)
  t_generator: { parts: [...generateurNomade(false), ...annexesGenerateur(false)] },
  // t_hold : voir nomades/soute.ts (même gréement que le chenillard, pose déployée)
  t_hold: { parts: [...souteNomade(false), ...annexesSoute(false)] },
  // t_lab : voir nomades/laboratoire.ts (même gréement que le chenillard, pose déployée)
  t_lab: { parts: [...laboratoireNomade(false), ...annexesLaboratoire(false)] },
  // t_workshop : voir nomades/atelier.ts (même gréement que le chenillard, pose déployée)
  t_workshop: { parts: [...atelierNomade(false), ...annexesAtelier(false)] },
  // t_bastion : voir nomades/bastion.ts (même gréement que le chenillard, pose déployée)
  t_bastion: { parts: [...bastionNomade(false), ...annexesBastion(false)] },
  // t_pole : poteau relais planté par le générateur nomade (voir nomades/poteau.ts)
  t_pole: { parts: poteauNomade() },
  // ark_dock : groupe électrogène posé par l'Arche à l'arrêt (voir nomades/arche.ts)
  ark_dock: { parts: groupeArche() },
};

// ——— Unités ———

export const TRANSH_UNIT_MODELS: Record<string, Model> = {
  // ark : l'Arche, chenillard-ville ; quatre trains de chenilles larges sous une caisse longue à jupes d'équipe,
  // tourelle de proue à canon (pivot « tourelle »), passerelle à fente vitrée, rangée de tentes sur arceaux et
  // cheminées, grue couchée, tourelle antiaérienne arrière à deux fûts (pivot « tourelle_aa »), coffres et mât
  ark: {
    parts: [
      ...chenille(1.0, 2.1, 0.66, 0.5, 0, 1.18, 0.3, true),
      ...chenille(1.0, 2.1, 0.66, 0.5, 0, -1.18, 0.3, true),
      { shape: "box", size: [0.14, 0.06, 4.6], pos: [0.79, 0.7, 0], color: "rust", mirror: true },
      { shape: "box", size: [0.04, 0.22, 4.1], pos: [1.29, 0.6, 0], color: "faction", mirror: true },
      // caisse longue à proue inclinée, pont
      { shape: "extrude", profile: [[-2.4, 0.24], [2.0, 0.24], [2.45, 0.55], [2.3, 0.92], [-2.3, 0.92], [-2.42, 0.6]], depth: 1.44, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "box", size: [2.1, 0.06, 4.5], pos: [0, 0.94, -0.05], color: "metal" },
      ...[-0.7, 0, 0.7].map((x): Part => ({ shape: "box", size: [0.02, 0.012, 4.3], pos: [x, 0.975, -0.05], color: "dark", fine: true })),
      // tourelle de proue (pivot) : couronne, caisse à pans, fût
      { shape: "cylinder", sides: 12, radius: 0.46, height: 0.14, pos: [0, 1.04, 1.7], color: "steel", pivot: CANON },
      { shape: "extrude", profile: [[-0.38, -0.42], [0.38, -0.42], [0.44, 0.02], [0.3, 0.4], [-0.3, 0.4], [-0.44, 0.02]], depth: 0.32, bevel: 0.04, pos: [0, 1.26, 1.66], rot: [90, 0, 0], color: "metal", parent: CANON },
      { shape: "box", size: [0.5, 0.03, 0.5], pos: [0, 1.43, 1.64], color: "faction", parent: CANON },
      { shape: "cylinder", sides: 8, radius: 0.075, height: 0.9, pos: [0, 1.26, 2.43], rot: [90, 0, 0], color: "steel", parent: CANON },
      { shape: "cylinder", sides: 8, radius: 0.11, height: 0.14, pos: [0, 1.26, 2.86], rot: [90, 0, 0], color: "dark", parent: CANON },
      { shape: "lathe", sides: 8, pos: [0, 1.26, 1.94], rot: [90, 0, 0], color: "dry", parent: CANON, profile: [[0, 0], [0.17, 0], [0.12, 0.12], [0, 0.14]] },
      // passerelle : caisse d'acier, fente vitrée, toit de bâche, gyrophare
      { shape: "bevel", size: [1.7, 0.5, 0.62], pos: [0, 1.22, 0.85], bevel: 0.05, color: "metal" },
      { shape: "box", size: [1.3, 0.1, 0.03], pos: [0, 1.36, 1.165], color: "glass" },
      { shape: "box", size: [1.8, 0.08, 0.72], pos: [0, 1.5, 0.85], color: "rust" },
      { shape: "sphere", radius: 0.05, pos: [0.6, 1.72, 0.85], color: "amber" },
      { shape: "box", size: [0.14, 0.07, 0.03], pos: [0.85, 0.72, 2.36], color: "amber", mirror: true },
      // rangée de tentes sur arceaux
      ...bache(-0.3, 0.97, -0.05, 0.62, 0.66, 0.95, "rust", 1, false),
      ...bache(0, 0.97, -1.22, 0.86, 0.74, 1.05, "dry", 1, false),
      // cheminées
      { shape: "lathe", sides: 10, pos: [0.62, 0.97, 0.38], color: "dark", profile: [[0, 0], [0.15, 0], [0.11, 0.12], [0.11, 1.25], [0.14, 1.36], [0, 1.36]] },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 0.03, pos: [0.62, 2.42, 0.38], color: "rust" },
      { shape: "lathe", sides: 10, pos: [-0.75, 0.97, -0.68], color: "dark", profile: [[0, 0], [0.13, 0], [0.09, 0.12], [0.09, 1.0], [0.12, 1.1], [0, 1.1]] },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.03, pos: [-0.75, 2.12, -0.68], color: "rust" },
      // grue couchée le long du flanc droit
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.24, pos: [0.82, 1.09, -2.0], color: "dark" },
      { shape: "box", size: [0.12, 0.12, 1.7], pos: [0.86, 1.24, -1.1], rot: [3, 0, 0], color: "faction" },
      { shape: "box", size: [0.1, 0.16, 0.12], pos: [0.86, 1.18, -0.24], color: "hazard" },
      // tourelle antiaérienne arrière (pivot) : socle, caisse, deux fûts relevés
      { shape: "cylinder", sides: 10, radius: 0.3, height: 0.14, pos: [0, 1.04, -2.02], color: "steel", pivot: FLAK },
      { shape: "box", size: [0.44, 0.26, 0.4], pos: [0, 1.24, -2.04], color: "metal", parent: FLAK },
      incl([0.13, 1.3, -1.95], 50, 0.35, 0, { shape: "cylinder", sides: 6, radius: 0.04, height: 0.7, rot: [90, 0, 0], color: "steel", mirror: true, parent: FLAK }),
      incl([0.13, 1.3, -1.95], 50, 0.72, 0, { shape: "cylinder", sides: 8, radius: 0.055, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, parent: FLAK, fine: true }),
      { shape: "box", size: [0.3, 0.03, 0.2], pos: [0, 1.38, -2.1], color: "faction", parent: FLAK },
      // coffres sanglés sur le pont, mât à fanion
      ...coffre([-0.78, 1.08, 0.38], [0.36, 0.22, 0.4], "wood"),
      ...coffre([-0.78, 1.08, -2.0], [0.4, 0.22, 0.4], "rust"),
      { shape: "cylinder", sides: 6, radius: 0.025, height: 1.5, pos: [-0.45, 2.2, 0.75], color: "steel", fine: true },
      { shape: "box", size: [0.02, 0.22, 0.38], pos: [-0.45, 2.8, 0.56], color: "faction", fine: true },
      { shape: "sphere", radius: 0.04, pos: [-0.45, 2.96, 0.75], color: "amber", fine: true },
      // améliorations installées (pivots « si:… », voir nomades/arche.ts)
      ...ameliorationsArche(),
    ],
  },
  // ch_drill : chariot foreuse, la foreuse repliée sur son chariot ; il se déploie en foreuse nomade (voir foreuseNomade)
  ch_drill: { parts: [...foreuseNomade(true), ...annexesForeuse(true)] },
  ch_furnace: { parts: [...fonderieNomade(true), ...annexesFonderie(true)] },
  ch_assembler: { parts: [...assembleurNomade(true), ...annexesAssembleur(true)] },
  ch_refinery: { parts: [...raffinerieNomade(true), ...annexesRaffinerie(true)] },
  ch_generator: { parts: [...generateurNomade(true), ...annexesGenerateur(true)] },
  ch_hold: { parts: [...souteNomade(true), ...annexesSoute(true)] },
  ch_lab: { parts: [...laboratoireNomade(true), ...annexesLaboratoire(true)] },
  ch_workshop: { parts: [...atelierNomade(true), ...annexesAtelier(true)] },
  ch_bastion: { parts: [...bastionNomade(true), ...annexesBastion(true)] },
  // t_cart : chariot de convoi attelé à une soute (voir nomades/convoi.ts)
  t_cart: { parts: chariotConvoi() },
  // tourelles déployables de l'Arche (voir nomades/arche.ts)
  turret_gun: { parts: tourelleArche(0) },
  turret_aa: { parts: tourelleArche(1) },
  turret_mortar: { parts: tourelleArche(2) },
  // tracker : pisteur, buggy léger ; quatre roues à pneus, caisse ouverte d'équipe, arceau de sécurité, pare-soleil
  // de toile, mât d'observation (pivot « tourelle ») à optique ambre et mitrailleuse, bidons
  tracker: {
    parts: [
      { use: "roue_d", pos: [0.62, 0.3, 0.7], scale: [0.6, 0.6, 0.6], mirror: true },
      { use: "roue_d", pos: [0.62, 0.3, -0.7], scale: [0.6, 0.6, 0.6], mirror: true },
      { shape: "box", size: [1.1, 0.06, 0.1], pos: [0, 0.3, 0.7], color: "dark" },
      { shape: "box", size: [1.1, 0.06, 0.1], pos: [0, 0.3, -0.7], color: "dark" },
      // caisse ouverte
      { shape: "extrude", profile: [[-1.0, 0.25], [0.85, 0.25], [1.05, 0.42], [0.95, 0.55], [-0.95, 0.58], [-1.02, 0.42]], depth: 0.82, bevel: 0.03, rot: [0, -90, 0], color: "faction" },
      { shape: "box", size: [0.6, 0.04, 0.9], pos: [0, 0.59, -0.05], color: "dark" },
      { shape: "box", size: [0.6, 0.12, 0.03], pos: [0, 0.68, 0.55], rot: [-30, 0, 0], color: "glass" },
      // arceau de sécurité, pare-soleil
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.36, 0.58, 0.45], [0.33, 1.0, 0.25], [0.33, 1.0, -0.3], [0.36, 0.58, -0.5]], bend: 0.1, color: "steel", mirror: true },
      { shape: "box", size: [0.76, 0.025, 0.6], pos: [0, 1.02, -0.02], color: "dry" },
      { shape: "box", size: [0.76, 0.028, 0.1], pos: [0, 1.025, -0.02], color: "faction" },
      // phares, bidons et roue de secours
      { shape: "box", size: [0.08, 0.06, 0.03], pos: [0.3, 0.5, 1.03], color: "amber", mirror: true },
      ...[0.22, -0.22].map((x): Part => ({ shape: "bevel", size: [0.14, 0.2, 0.12], pos: [x, 0.66, -0.88], bevel: 0.02, color: "rust" })),
      { use: "roue_d", pos: [0, 0.68, -1.04], rot: [90, 0, 0], scale: [0.45, 0.45, 0.45] },
      // mât d'observation (pivot) : fût télescopique, tête optique, mitrailleuse
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.1, pos: [0, 0.65, -0.3], color: "steel", pivot: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.035, height: 0.9, pos: [0, 1.1, -0.3], color: "rust", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.025, height: 0.5, pos: [0, 1.7, -0.3], color: "steel", parent: "tourelle" },
      { shape: "bevel", size: [0.22, 0.12, 0.14], pos: [0, 1.98, -0.3], bevel: 0.02, color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.04, height: 0.04, pos: [0.06, 1.98, -0.22], rot: [90, 0, 0], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.1, 0.1, 0.24], pos: [0, 0.78, -0.25], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.025, height: 0.5, pos: [0, 0.8, 0.1], rot: [90, 0, 0], color: "steel", parent: "tourelle" },
    ],
  },
  // rider : cavalier, char rapide à chenilles larges ; caisse basse à glacis, jupes d'équipe, tourelle plate à pans
  // (pivot « tourelle ») à canon moyen et masque de toile, rouleaux de bâche et bidons sur la plage arrière
  rider: {
    parts: [
      ...chenille(0.62, 2.2, 0.42, 0.36, 0, 0, 0.25, true),
      { shape: "bevel", size: [0.1, 0.04, 2.1], pos: [0.43, 0.45, 0], bevel: 0.015, color: "metal", mirror: true },
      { shape: "box", size: [0.03, 0.14, 1.6], pos: [0.83, 0.38, 0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[-1.1, 0.16], [0.8, 0.16], [1.15, 0.36], [0.9, 0.56], [-1.0, 0.58], [-1.12, 0.42]], depth: 0.86, bevel: 0.03, rot: [0, -90, 0], color: "dark" },
      { shape: "bevel", size: [1.2, 0.05, 0.6], pos: [0, 0.58, 0.55], bevel: 0.015, color: "metal" },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [0.35, 0.45, 1.06], color: "amber", mirror: true },
      // plage arrière : rouleaux de bâche, bidons
      { shape: "cylinder", sides: 8, radius: 0.09, height: 1.0, pos: [0, 0.68, -0.92], rot: [0, 0, 90], color: "dry" },
      { shape: "box", size: [0.06, 0.2, 0.2], pos: [0.25, 0.68, -0.92], color: "faction" },
      ...[0.35, -0.35].map((x): Part => ({ shape: "bevel", size: [0.14, 0.18, 0.12], pos: [x, 0.66, -0.7], bevel: 0.02, color: "rust" })),
      { shape: "tube", radius: 0.035, path: [[0.4, 0.5, -1.05], [0.4, 0.75, -1.12]], color: "rust" },
      // tourelle (pivot)
      { shape: "extrude", profile: [[-0.4, -0.45], [0.4, -0.45], [0.46, 0.05], [0.28, 0.4], [-0.28, 0.4], [-0.46, 0.05]], depth: 0.24, bevel: 0.04, pos: [0, 0.72, -0.05], rot: [90, 0, 0], color: "metal", pivot: "tourelle" },
      { shape: "extrude", profile: [[-0.4, -0.45], [0.4, -0.45], [0.46, 0.05], [0.28, 0.4], [-0.28, 0.4], [-0.46, 0.05]], depth: 0.04, pos: [0, 0.85, -0.07], rot: [90, 0, 0], scale: [0.76, 0.76, 1], color: "faction", parent: "tourelle" },
      { shape: "lathe", sides: 8, pos: [0, 0.72, 0.3], rot: [90, 0, 0], color: "dry", parent: "tourelle", profile: [[0, 0], [0.15, 0], [0.11, 0.12], [0, 0.14]] },
      { shape: "lathe", sides: 10, pos: [0, 0.72, 0.34], rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: fut(0.05, 0.95) },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.06, pos: [-0.15, 0.89, -0.2], color: "dark", parent: "tourelle" },
      { shape: "tube", radius: 0.01, sides: 4, path: [[0.22, 0.85, -0.35], [0.22, 1.35, -0.42]], color: "steel", parent: "tourelle", fine: true },
    ],
  },
  // harrow : herse, défense antiaérienne mobile ; chenillard léger, tourelle (pivot « tourelle ») portant quatre
  // canons relevés vers le ciel en deux nacelles, jupe de toile, viseur ambre
  harrow: {
    parts: [
      ...chenille(0.6, 2.0, 0.42, 0.34, 0, 0, 0.25, true),
      { shape: "bevel", size: [0.1, 0.04, 1.9], pos: [0.42, 0.45, 0], bevel: 0.015, color: "metal", mirror: true },
      { shape: "box", size: [0.03, 0.14, 1.5], pos: [0.8, 0.38, 0], color: "faction", mirror: true },
      { shape: "extrude", profile: [[-1.0, 0.16], [0.75, 0.16], [1.05, 0.36], [0.85, 0.56], [-0.9, 0.58], [-1.02, 0.42]], depth: 0.82, bevel: 0.03, rot: [0, -90, 0], color: "dark" },
      { shape: "bevel", size: [0.9, 0.24, 0.42], pos: [0, 0.66, 0.6], bevel: 0.03, color: "metal" },
      { shape: "box", size: [0.6, 0.06, 0.03], pos: [0, 0.72, 0.815], color: "glass" },
      ...coffre([0, 0.68, -0.82], [0.7, 0.2, 0.3], "rust"),
      // tourelle (pivot) : couronne, caisse, jupe de toile
      { shape: "cylinder", sides: 12, radius: 0.4, height: 0.12, pos: [0, 0.64, -0.15], color: "steel", pivot: "tourelle" },
      { shape: "bevel", size: [0.56, 0.3, 0.6], pos: [0, 0.85, -0.18], bevel: 0.05, color: "metal", parent: "tourelle" },
      { shape: "lathe", sides: 8, pos: [0, 0.7, -0.18], rot: [0, 22.5, 0], color: "dry", parent: "tourelle", profile: [[0.42, 0], [0.46, 0], [0.38, 0.18], [0.34, 0.18]] },
      { shape: "box", size: [0.3, 0.03, 0.3], pos: [0, 1.01, -0.25], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.12, 0.08, 0.1], pos: [-0.12, 1.06, 0.02], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.08, 0.04, 0.02], pos: [-0.12, 1.06, 0.075], color: "amber", parent: "tourelle" },
      // deux nacelles relevées, deux fûts chacune
      incl([0.4, 0.9, -0.3], 52, 0.05, 0, { shape: "bevel", size: [0.18, 0.24, 0.5], bevel: 0.03, color: "rust", mirror: true, parent: "tourelle" }),
      incl([0.4, 0.9, -0.3], 52, 0.05, 0.125, { shape: "box", size: [0.14, 0.02, 0.36], color: "faction", mirror: true, parent: "tourelle" }),
      incl([0.35, 0.92, -0.3], 52, 0.75, 0, { shape: "cylinder", sides: 6, radius: 0.03, height: 1.2, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" }),
      incl([0.45, 0.92, -0.3], 52, 0.75, 0, { shape: "cylinder", sides: 6, radius: 0.03, height: 1.2, rot: [90, 0, 0], color: "steel", mirror: true, parent: "tourelle" }),
      incl([0.35, 0.92, -0.3], 52, 1.33, 0, { shape: "cylinder", sides: 6, radius: 0.045, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", fine: true }),
      incl([0.45, 0.92, -0.3], 52, 1.33, 0, { shape: "cylinder", sides: 6, radius: 0.045, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, parent: "tourelle", fine: true }),
      incl([0.4, 0.92, -0.3], 52, 0.62, 0, { shape: "box", size: [0.18, 0.06, 0.06], color: "dark", mirror: true, parent: "tourelle", fine: true }),
    ],
  },
  // towed_gun : canon tracté ; petit tracteur à chenilles et cabine bâchée à l'avant, affût à deux roues et flèches
  // jointes à l'arrière, long fût d'acier relevé (pivot « tourelle ») au-dessus du tracteur, bouclier de toile ;
  // béquilles écartées et bêches (pivot « deplie », visibles quand l'unité est déployée)
  towed_gun: {
    parts: [
      // tracteur
      ...chenille(0.45, 1.0, 0.36, 0.26, 0, 0.75, 0.25, true),
      { shape: "bevel", size: [0.66, 0.3, 1.0], pos: [0, 0.4, 0.75], bevel: 0.04, color: "dark" },
      { shape: "bevel", size: [0.66, 0.24, 0.42], pos: [0, 0.66, 0.92], bevel: 0.03, color: "metal" },
      { shape: "box", size: [0.5, 0.06, 0.03], pos: [0, 0.7, 1.135], color: "glass" },
      ...bache(0, 0.78, 0.92, 0.35, 0.12, 0.44, "dry", 1),
      { shape: "box", size: [0.08, 0.05, 0.03], pos: [0.24, 0.5, 1.255], color: "amber", mirror: true },
      ...coffre([0, 0.62, 0.42], [0.56, 0.16, 0.3], "rust"),
      // timon
      { shape: "tube", radius: 0.035, sides: 4, path: [[0, 0.3, 0.25], [0, 0.3, -0.1]], color: "steel" },
      // affût : essieu, deux roues, flèches jointes
      { use: "roue_d", pos: [0.42, 0.3, -0.35], scale: [0.4, 0.6, 0.6], mirror: true },
      { shape: "box", size: [0.8, 0.08, 0.1], pos: [0, 0.3, -0.35], color: "dark" },
      { shape: "tube", radius: 0.04, sides: 4, path: [[0.12, 0.3, -0.4], [0.06, 0.12, -1.25]], color: "rust", mirror: true },
      { shape: "box", size: [0.24, 0.12, 0.06], pos: [0, 0.08, -1.27], color: "dark" },
      // pièce (pivot) : berceau, bouclier de toile, long fût relevé
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.1, pos: [0, 0.4, -0.35], color: "steel", pivot: "tourelle" },
      { shape: "bevel", size: [0.3, 0.2, 0.5], pos: [0, 0.55, -0.4], bevel: 0.03, color: "metal", parent: "tourelle" },
      { shape: "box", size: [0.7, 0.36, 0.04], pos: [0, 0.68, -0.18], rot: [-10, 0, 0], color: "dry", parent: "tourelle" },
      { shape: "box", size: [0.7, 0.06, 0.045], pos: [0, 0.82, -0.2], rot: [-10, 0, 0], color: "faction", parent: "tourelle" },
      incl([0, 0.62, -0.45], 14, 0, 0, { shape: "lathe", sides: 10, rot: [90, 0, 0], color: "steel", parent: "tourelle", profile: fut(0.055, 2.0) }),
      incl([0, 0.62, -0.45], 14, 0.4, -0.09, { shape: "cylinder", sides: 6, radius: 0.03, height: 0.6, rot: [90, 0, 0], color: "dark", parent: "tourelle", fine: true }),
      // béquilles écartées, vérins et bêches (déployé)
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.08, pos: [0, 0.3, -0.5], color: "dark", pivot: "deplie" },
      { shape: "tube", radius: 0.035, sides: 4, path: [[0.15, 0.3, -0.5], [0.75, 0.12, -1.0]], color: "rust", mirror: true, parent: "deplie" },
      { shape: "box", size: [0.22, 0.16, 0.05], pos: [0.78, 0.06, -1.03], rot: [0, -40, 0], color: "dark", mirror: true, parent: "deplie" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.04, pos: [0.5, 0.02, -0.25], color: "dark", mirror: true, parent: "deplie" },
      { shape: "cylinder", sides: 6, radius: 0.03, height: 0.26, pos: [0.5, 0.15, -0.25], color: "steel", mirror: true, parent: "deplie" },
    ],
  },
  // ram : bélier, chenillard d'assaut blindé ; chenilles larges sous garde-chenilles épais, caisse à plaques
  // rouille inclinées, grande proue d'éperonnage d'acier en chevron à dents, jupes d'équipe, échappements,
  // poste de pilotage bas à fente
  ram: {
    parts: [
      ...chenille(0.7, 2.3, 0.5, 0.42, 0, 0, 0.25, true),
      { shape: "bevel", size: [0.48, 0.06, 1.5], pos: [0.7, 0.55, -0.25], bevel: 0.02, color: "rust", mirror: true },
      { shape: "box", size: [0.04, 0.22, 1.4], pos: [0.94, 0.42, -0.25], color: "faction", mirror: true },
      // caisse : flancs inclinés, dos bombé
      { shape: "extrude", profile: [[-1.2, 0.2], [0.9, 0.2], [1.1, 0.4], [0.9, 0.82], [-1.0, 0.86], [-1.2, 0.6]], depth: 0.96, bevel: 0.04, rot: [0, -90, 0], color: "dark" },
      { shape: "extrude", profile: [[-0.56, 0.58], [0.56, 0.58], [0.4, 1.02], [-0.4, 1.02]], depth: 1.6, bevel: 0.04, pos: [0, 0, -0.25], color: "rust" },
      { shape: "box", size: [0.7, 0.04, 1.3], pos: [0, 1.03, -0.3], color: "metal" },
      { shape: "box", size: [0.18, 0.05, 1.32], pos: [0, 1.06, -0.3], color: "faction" },
      // poste de pilotage bas à fente
      { shape: "bevel", size: [0.6, 0.18, 0.3], pos: [0, 1.12, 0.38], bevel: 0.03, color: "metal" },
      { shape: "box", size: [0.4, 0.04, 0.02], pos: [0, 1.14, 0.535], color: "glass" },
      // proue d'éperonnage : chevron d'acier, arête, dents, rails de fixation
      { shape: "extrude", profile: [[-0.98, 0.9], [0.98, 0.9], [0.98, 1.05], [0.2, 1.62], [-0.2, 1.62], [-0.98, 1.05]], depth: 0.52, bevel: 0.03, pos: [0, 0.42, 0], rot: [90, 0, 0], color: "steel" },
      { shape: "wedge", size: [1.4, 0.36, 0.5], pos: [0, 0.86, 0.8], color: "dark" },
      { shape: "box", size: [0.06, 0.03, 0.62], pos: [0, 0.88, 0.8], rot: [36, 0, 0], color: "faction" },
      ...[[0, 1.62], [0.42, 1.34], [0.8, 1.1]].map(([x, z]): Part => ({ shape: "cone", sides: 5, radius: 0.1, height: 0.42, pos: [x, 0.42, q(z + 0.14)], rot: [90, 0, 0], color: "dark", mirror: x !== 0 })),
      { shape: "box", size: [0.1, 0.14, 0.5], pos: [0.45, 0.68, 0.75], color: "dark", mirror: true },
      { shape: "box", size: [1.6, 0.04, 0.05], pos: [0, 0.6, 1.0], color: "hazard", fine: true },
      // échappements, coffres
      { shape: "tube", radius: 0.045, path: [[0.38, 0.8, -1.05], [0.38, 1.1, -1.1], [0.38, 1.16, -1.2]], bend: 0.06, color: "rust", mirror: true },
      ...coffre([0, 0.95, -1.08], [0.4, 0.16, 0.2], "wood"),
    ],
  },
};
