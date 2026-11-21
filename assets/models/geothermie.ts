// Centrale géothermique (voir sim/src/buildings.rs, geo_output) : posée sur un geyser, sans combustible.
//
// Dalle de béton 3 x 3 ; au centre, la tête de puits sur le geyser (collerette, vanne à volant, dôme
// grillagé) ; derrière, une haute cheminée de vapeur évasée à bandeau d'équipe et anneau lumineux ; à
// gauche, la salle des turbines (toit d'équipe, verrière, grille de ventilation) ; à droite, deux
// échangeurs de chaleur verticaux à brides ; des conduites isolées relient le puits aux turbines et aux
// échangeurs. Pièces fines : brides, volant, échelle, rambarde.
import type { Model, Part } from "./types.ts";

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Conduite isolée de (a) à (b), à hauteur y, avec deux brides fines. */
function conduite(ax: number, az: number, bx: number, bz: number, y: number, color: Part["color"]): Part[] {
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const rot: Part["rot"] = ax === bx ? [90, 0, 0] : [0, 0, 90];
  return [
    { shape: "tube", radius: 0.08, sides: 10, path: [[ax, y, az], [bx, y, bz]], color },
    { shape: "cylinder", sides: 10, radius: 0.105, height: 0.04, pos: [r3(mx - (bx - ax) * 0.25), y, r3(mz - (bz - az) * 0.25)], rot, color: "dark", fine: true },
    { shape: "cylinder", sides: 10, radius: 0.105, height: 0.04, pos: [r3(mx + (bx - ax) * 0.25), y, r3(mz + (bz - az) * 0.25)], rot, color: "dark", fine: true },
  ];
}

const geothermal: Model = {
  parts: [
    // dalle et liserés
    { shape: "bevel", size: [3, 0.16, 3], pos: [0, 0.08, 0], bevel: 0.06, color: "concrete" },
    { shape: "bevel", size: [2.84, 0.08, 2.84], pos: [0, 0.2, 0], bevel: 0.03, color: "dark" },
    { shape: "box", size: [0.8, 0.04, 0.03], pos: [0.8, 0.09, 1.484], color: "glow", mirror: true },
    // tête de puits au centre, sur le geyser : collerette, fût, dôme grillagé, vanne à volant
    { shape: "cylinder", sides: 14, radius: 0.62, height: 0.1, bevel: 0.03, pos: [0, 0.29, 0.2], color: "steel" },
    { shape: "cylinder", sides: 14, radius: 0.42, radiusTop: 0.36, height: 0.5, pos: [0, 0.58, 0.2], color: "metal" },
    { shape: "torus", radius: 0.4, tube: 0.03, sides: 14, pos: [0, 0.5, 0.2], color: "glow" },
    { shape: "lathe", sides: 14, pos: [0, 0.83, 0.2], color: "light", profile: [[0, 0], [0.38, 0], [0.34, 0.12], [0.24, 0.22], [0.12, 0.27], [0, 0.28]] },
    ...[0, 45, 90, 135].map((a): Part => ({ shape: "box", size: [0.76, 0.02, 0.025], pos: [0, 0.96, 0.2], rot: [0, a, 0], color: "black", fine: true })),
    { shape: "cylinder", sides: 8, radius: 0.05, height: 0.3, pos: [0.5, 0.65, 0.2], rot: [0, 0, 90], color: "steel" },
    { shape: "torus", radius: 0.12, tube: 0.02, sides: 10, pos: [0.66, 0.65, 0.2], rot: [0, 0, 90], color: "hazard", fine: true },
    // cheminée de vapeur évasée à l'arrière
    { shape: "cylinder", sides: 12, radius: 0.5, height: 0.12, pos: [0.15, 0.3, -0.95], color: "concrete" },
    { shape: "lathe", sides: 14, pos: [0.15, 0.32, -0.95], color: "light", profile: [[0.42, 0], [0.36, 0.3], [0.3, 0.7], [0.28, 1.05], [0.31, 1.35], [0.36, 1.55], [0.33, 1.55], [0.3, 1.4]] },
    { shape: "cylinder", sides: 14, radius: 0.305, height: 0.14, pos: [0.15, 1.12, -0.95], color: "faction" },
    { shape: "torus", radius: 0.32, tube: 0.022, sides: 14, pos: [0.15, 0.82, -0.95], color: "glow" },
    { shape: "cylinder", sides: 10, radius: 0.29, height: 0.02, pos: [0.15, 1.82, -0.95], color: "black" },
    { use: "echelle", pos: [0.15, 0.36, -0.6], scale: [0.6, 1.2, 1] },
    // salle des turbines à gauche : caisson, toit d'équipe, verrière, grille
    { shape: "bevel", size: [0.95, 0.7, 1.7], pos: [-0.98, 0.59, 0.25], bevel: 0.05, color: "dark" },
    { shape: "bevel", size: [1.01, 0.09, 1.76], pos: [-0.98, 0.98, 0.25], bevel: 0.03, color: "faction" },
    { shape: "box", size: [0.5, 0.05, 1.3], pos: [-0.98, 1.04, 0.25], color: "glass" },
    ...[-0.2, 0.25, 0.7].map((z): Part => ({ shape: "box", size: [0.03, 0.3, 0.3], pos: [-0.49, 0.55, z], color: "black", fine: true })),
    { shape: "box", size: [0.03, 0.04, 1.3], pos: [-0.495, 0.78, 0.25], color: "glow" },
    { shape: "box", size: [0.1, 0.07, 0.03], pos: [-0.98, 0.5, 1.11], color: "amber" },
    // deux échangeurs de chaleur verticaux à droite
    ...[0.55, 1.05].flatMap((z): Part[] => [
      { shape: "cylinder", sides: 12, radius: 0.26, height: 0.95, bevel: 0.04, pos: [1.05, 0.72, z], color: "steel" },
      { shape: "sphere", radius: 0.26, detail: 1, pos: [1.05, 1.2, z], scale: [1, 0.5, 1], color: "steel" },
      { shape: "torus", radius: 0.27, tube: 0.02, sides: 12, pos: [1.05, 0.5, z], color: "dark", fine: true },
      { shape: "torus", radius: 0.27, tube: 0.02, sides: 12, pos: [1.05, 0.95, z], color: "dark", fine: true },
      { shape: "cylinder", sides: 12, radius: 0.27, height: 0.08, pos: [1.05, 0.75, z], color: "faction" },
    ]),
    // conduites : puits vers turbines et vers échangeurs, cheminée vers turbines
    ...conduite(-0.4, 0.2, -0.5, 0.2, 0.6, "copper"),
    ...conduite(0.4, 0.45, 0.8, 0.45, 0.5, "light"),
    ...conduite(0.4, 0.95, 0.8, 0.95, 0.5, "light"),
    { shape: "tube", radius: 0.07, sides: 10, path: [[-0.55, 0.85, -0.6], [-0.2, 0.85, -0.6], [-0.2, 0.85, -0.95], [-0.15, 0.85, -0.95]], color: "copper" },
    { use: "garde_corps", pos: [0, 0.25, 1.38], scale: [1.2, 0.8, 1] },
  ],
};

export const GEO_MODELS: Record<string, Model> = { geothermal };
