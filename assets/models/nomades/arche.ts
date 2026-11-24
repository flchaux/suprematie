// Améliorations visibles de l'Arche, ses tourelles déployables, son groupe électrogène, et les aménagements des
// modules (voir sim/src/ameliorations.rs et docs/spec/races.md).
// L'Arche grandit : l'armement lui ajoute un gaillard d'avant (arche-armement.ts), la mobilité un bloc arrière
// (arche-mobilite.ts), la coque des encorbellements (arche-coque.ts) ; ce que portent les emplacements de pont et de
// soutien est sur ses remorques (remorque.ts).
// Un pivot « si:clé+clé#nom » n'est dessiné que si une de ces améliorations est installée ; « si:clé&clé#nom » que si
// toutes le sont ; « sauf:clé+clé#nom » que si aucune ne l'est. Nom « fixe… » : la pièce ne tourne pas ; « radar… » :
// elle tourne sans cesse ; « chenille_p… » : crampons qui glissent ; sinon elle vise avec la tourelle. Les pièces
// « si: » ne comptent pas dans la taille du modèle (render/entities.ts, generator.ts).
// Repère : +x à droite, +y en haut, +z vers l'avant. Pont de l'Arche : y = 0,97.
import type { Part, Vec3 } from "../types.ts";
import { q, incl, chenille, coffre } from "./commun.ts";
import { groupe } from "./arche-commun.ts";
import { armement } from "./arche-armement.ts";
import { coque } from "./arche-coque.ts";
import { mobilite } from "./arche-mobilite.ts";

export { CANON, FLAK } from "./arche-commun.ts";

/** Toutes les améliorations visibles de l'Arche, à ajouter à son modèle. */
export function ameliorationsArche(): Part[] {
  return [...armement(), ...coque(), ...mobilite()];
}

/**
 * Tourelle déployable de l'Arche (unité) : petit affût à chenilles, quatre béquilles qui s'ouvrent au déploiement
 * (pivots « dep|… »), pièce sur pivot « tourelle » qui vise ; `genre` : 0 mitrailleuse, 1 antiaérienne, 2 mortier.
 */
export function tourelleArche(genre: 0 | 1 | 2): Part[] {
  const p: Part[] = [
    ...chenille(0.36, 1.0, 0.26, 0.2, 0, 0, 0.2, true),
    { shape: "bevel", size: [0.6, 0.2, 0.96], pos: [0, 0.3, 0], bevel: 0.04, color: "dark" },
    { shape: "box", size: [0.02, 0.12, 0.7], pos: [0.48, 0.3, 0], color: "faction", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.3, height: 0.1, pos: [0, 0.44, 0], color: "steel" },
    { shape: "box", size: [0.08, 0.05, 0.03], pos: [0.2, 0.36, 0.49], color: "amber", mirror: true },
  ];
  // béquilles : repliées contre la caisse, elles pivotent vers l'extérieur puis posent leur patin
  for (const [sx, sz, nom] of [[1, 1, "ad"], [-1, 1, "ag"], [1, -1, "rd"], [-1, -1, "rg"]] as const) {
    const x = q(sx * 0.62);
    const z = q(sz * 0.52);
    const piv = `dep|t:${q(-sx * 0.3)},0,0:0:0.5|t:0,0.2,0:0.5:1#${nom}`;
    p.push(
      { shape: "box", size: [0.34, 0.07, 0.1], pos: [q(sx * 0.46), 0.3, z], rot: [0, q(-sx * sz * 18), 0], color: "rust", pivot: piv },
      { shape: "cylinder", sides: 6, radius: 0.035, height: 0.3, pos: [x, 0.17, z], color: "steel", pivot: piv },
      { shape: "cylinder", sides: 6, radius: 0.12, radiusTop: 0.08, height: 0.05, pos: [x, 0.025, z], color: "dark", pivot: piv },
    );
  }
  if (genre === 0) {
    p.push(
      ...groupe("tourelle", [
        { shape: "cylinder", sides: 10, radius: 0.26, height: 0.1, pos: [0, 0.53, 0], color: "dark" },
        { shape: "bevel", size: [0.44, 0.28, 0.46], pos: [0, 0.7, -0.02], bevel: 0.04, color: "metal" },
        { shape: "box", size: [0.62, 0.34, 0.04], pos: [0, 0.74, 0.22], rot: [-12, 0, 0], color: "dry" },
        { shape: "box", size: [0.62, 0.06, 0.045], pos: [0, 0.88, 0.19], rot: [-12, 0, 0], color: "faction" },
        ...[0.06, 0.14].map((x): Part => ({ shape: "cylinder", sides: 6, radius: 0.03, height: 0.62, pos: [x, 0.7, 0.5], rot: [90, 0, 0], color: "steel", mirror: true })),
        { shape: "cylinder", sides: 8, radius: 0.1, height: 0.1, pos: [0, 0.7, 0.66], rot: [90, 0, 0], color: "dark" },
        ...coffre([0.3, 0.66, -0.04], [0.14, 0.2, 0.3], "wood"),
      ]),
    );
  } else if (genre === 1) {
    p.push(
      ...groupe("tourelle", [
        { shape: "cylinder", sides: 10, radius: 0.26, height: 0.1, pos: [0, 0.53, 0], color: "dark" },
        { shape: "bevel", size: [0.4, 0.3, 0.4], pos: [0, 0.72, -0.06], bevel: 0.04, color: "metal" },
        { shape: "box", size: [0.3, 0.03, 0.24], pos: [0, 0.885, -0.1], color: "faction" },
        ...[0.2, 0.3].map((x): Part => incl([x, 0.76, 0], 55, 0.36, 0, { shape: "cylinder", sides: 6, radius: 0.035, height: 0.76, rot: [90, 0, 0], color: "steel", mirror: true })),
        ...[0.2, 0.3].map((x): Part => incl([x, 0.76, 0], 55, 0.74, 0, { shape: "cylinder", sides: 6, radius: 0.055, height: 0.1, rot: [90, 0, 0], color: "dark", mirror: true, fine: true })),
        { shape: "cylinder", sides: 5, radius: 0.015, height: 0.3, pos: [0, 1.02, -0.18], color: "steel", fine: true },
        { shape: "box", size: [0.26, 0.12, 0.03], pos: [0, 1.16, -0.18], color: "light" },
      ]),
    );
  } else {
    p.push(
      ...groupe("tourelle", [
        { shape: "cylinder", sides: 10, radius: 0.28, height: 0.1, pos: [0, 0.53, 0], color: "dark" },
        { shape: "box", size: [0.08, 0.34, 0.4], pos: [0.22, 0.72, -0.02], color: "rust", mirror: true },
        incl([0, 0.7, -0.14], 58, 0.36, 0, { shape: "lathe", sides: 10, rot: [90, 0, 0], color: "steel", profile: [[0, -0.36], [0.16, -0.36], [0.16, -0.1], [0.13, -0.06], [0.13, 0.36], [0.17, 0.38], [0.17, 0.46], [0.11, 0.46], [0.11, 0.3], [0, 0.3]] }),
        { shape: "cylinder", sides: 6, radius: 0.04, height: 0.46, pos: [0, 0.74, 0.26], rot: [-35, 0, 0], color: "hazard" },
        { shape: "box", size: [0.52, 0.06, 0.06], pos: [0, 0.86, -0.12], color: "faction" },
        ...coffre([0, 0.58, -0.36], [0.4, 0.16, 0.16], "wood"),
      ]),
    );
  }
  return p;
}

/** Groupe électrogène posé par l'Arche (« ark_dock », 1 × 1) : générateur sur patins, prise et mât à lanterne. */
export function groupeArche(): Part[] {
  return [
    { shape: "box", size: [0.8, 0.08, 0.14], pos: [0, 0.04, 0.28], color: "rust" },
    { shape: "box", size: [0.8, 0.08, 0.14], pos: [0, 0.04, -0.28], color: "rust" },
    { shape: "bevel", size: [0.62, 0.36, 0.62], pos: [-0.04, 0.27, 0], bevel: 0.05, color: "hazard" },
    { shape: "box", size: [0.5, 0.04, 0.5], pos: [-0.04, 0.46, 0], color: "dark" },
    { shape: "box", size: [0.64, 0.06, 0.3], pos: [-0.04, 0.36, 0], color: "faction" },
    { shape: "cylinder", sides: 10, radius: 0.16, height: 0.14, pos: [0.34, 0.28, 0], rot: [0, 0, 90], color: "copper" },
    { shape: "torus", radius: 0.17, tube: 0.03, sides: 12, pos: [0.42, 0.28, 0], rot: [0, 0, 90], color: "black" },
    { shape: "tube", radius: 0.035, sides: 5, path: [[-0.22, 0.48, 0.16], [-0.22, 0.76, 0.16], [-0.28, 0.82, 0.16]], bend: 0.06, color: "rust" },
    { shape: "cylinder", sides: 6, radius: 0.03, height: 1.1, pos: [0.2, 1.0, -0.2], color: "steel" },
    { shape: "box", size: [0.4, 0.04, 0.04], pos: [0.2, 1.46, -0.2], color: "wood" },
    { shape: "sphere", radius: 0.06, pos: [0.2, 1.6, -0.2], color: "amber" },
    { shape: "box", size: [0.1, 0.1, 0.02], pos: [-0.1, 0.3, 0.32], color: "glow" },
  ];
}
