// Véhicules de transport (logistique) : train, drone de fret, robot logistique, drone de ravitaillement
// des constructeurs (vide et chargé). Avant vers +z, échelle libre : le jeu les redimensionne (train
// ≈ 2,6 cases de long, drone de fret ≈ 1 case, robot ≈ 0,6, drone de ravitaillement ≈ 0,9).
import type { Model, Part } from "./types.ts";

/** Bogie de train centré en z : longerons sombres (côté droit, mirror) et deux roues d'acier (pièces fines). */
function bogie(z: number): Part[] {
  return [
    { shape: "box", size: [0.08,0.12,0.56], pos: [0.36,0.15,z], color: "dark", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.12, height: 0.1, pos: [0.4,0.13,z + 0.17], rot: [0,0,90], color: "steel", mirror: true, fine: true },
    { shape: "cylinder", sides: 6, radius: 0.12, height: 0.1, pos: [0.4,0.13,z - 0.17], rot: [0,0,90], color: "steel", mirror: true, fine: true },
    { shape: "box", size: [0.03,0.05,0.08], pos: [0.415,0.13,z], color: "amber", mirror: true, fine: true },
  ];
}

/** Wagon couvert centré en z (1,5 de long) : caisse à profil arrondi, toit coloré, portes, nervures, trappes. */
function wagon(z: number, toit: Part["color"]): Part[] {
  return [
    { shape: "bevel", size: [0.76,0.1,1.56], pos: [0,0.24,z], bevel: 0.03, color: "dark" },
    { shape: "extrude", profile: [[-0.39,0.28],[0.39,0.28],[0.39,0.84],[0.32,0.93],[-0.32,0.93],[-0.39,0.84]], depth: 1.5, bevel: 0.03, pos: [0,0,z], color: "metal" },
    { shape: "extrude", profile: [[-0.4,0.88],[0.4,0.88],[0.4,0.92],[0.3,1.04],[-0.3,1.04],[-0.4,0.92]], depth: 1.52, bevel: 0.02, pos: [0,0,z], color: toit },
    { shape: "box", size: [0.02,0.48,0.46], pos: [0.395,0.56,z], color: "dark", mirror: true },
    { shape: "box", size: [0.025,0.03,0.5], pos: [0.4,0.33,z], color: "steel", mirror: true, fine: true },
    ...[-0.6, -0.4, 0.4, 0.6].map((d): Part => ({ shape: "box", size: [0.02,0.52,0.035], pos: [0.395,0.57,z + d], color: "steel", mirror: true, fine: true })),
    { shape: "box", size: [0.18,0.02,0.24], pos: [0,1.045,z + 0.4], color: "dark", fine: true },
    { shape: "box", size: [0.18,0.02,0.24], pos: [0,1.045,z - 0.4], color: "dark", fine: true },
    { shape: "box", size: [0.02,0.03,1.3], pos: [0.395,0.86,z], color: "glow", mirror: true },
    ...bogie(z + 0.5),
    ...bogie(z - 0.5),
  ];
}

/** Drone de ravitaillement : quadrirotor, avec ou sans caisse sous le ventre. */
function supplyDrone(loaded: boolean): Part[] {
  const rotors = [[0.38, 0.38], [0.38, -0.38]].flatMap(([x, z]): Part[] => [
    { shape: "box", size: [0.46,0.04,0.06], pos: [x / 2,0.62,z / 2], rot: [0, x * z > 0 ? -45 : 45, 0], color: "steel", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.1, pos: [x,0.64,z], color: "dark", mirror: true, fine: true },
    { shape: "cylinder", sides: 10, radius: 0.2, height: 0.012, pos: [x,0.7,z], color: "light", mirror: true },
    { shape: "lathe", sides: 10, profile: [[0.21,0],[0.185,0]], pos: [x,0.708,z], color: "glow", mirror: true, fine: true },
  ]);
  return [
    { shape: "extrude", profile: [[-0.14,-0.22],[0.14,-0.22],[0.2,-0.12],[0.2,0.14],[0.12,0.24],[-0.12,0.24],[-0.2,0.14],[-0.2,-0.12]], depth: 0.16, bevel: 0.03, pos: [0,0.6,0], rot: [90,0,0], color: "faction" },
    { shape: "bevel", size: [0.26,0.05,0.32], pos: [0,0.69,-0.01], bevel: 0.02, color: "light" },
    { shape: "box", size: [0.12,0.04,0.03], pos: [0,0.6,0.245], color: "glow" },
    { shape: "box", size: [0.3,0.05,0.36], pos: [0,0.5,0], color: "dark" },
    ...rotors,
    // pinces
    { shape: "box", size: [0.03,0.14,0.03], pos: [0.12,0.42,0], color: "metal", mirror: true, fine: true },
    ...(loaded
      ? ([
          { shape: "bevel", size: [0.26,0.2,0.26], pos: [0,0.27,0], bevel: 0.02, color: "hazard" },
          { shape: "box", size: [0.27,0.21,0.03], pos: [0,0.27,0.06], color: "dark", fine: true },
          { shape: "box", size: [0.04,0.03,0.04], pos: [0,0.385,0], color: "amber", fine: true },
        ] as Part[])
      : ([{ shape: "box", size: [0.2,0.03,0.03], pos: [0,0.35,0], color: "metal", fine: true }] as Part[])),
  ];
}

export const VEHICLE_MODELS: Record<string, Model> = {
  // train : locomotive d'équipe à capot incliné, phares cyan, cabine vitrée, ventilateurs de toit ; deux
  // wagons couverts à toit d'équipe et à toit de danger ; bogies, attelages, longeron continu
  train: {
    parts: [
      { shape: "box", size: [0.4,0.08,5.2], pos: [0,0.16,0], color: "black" },
      // locomotive : châssis, capot profilé, filets cyan, phares, calandre
      { shape: "bevel", size: [0.8,0.12,1.9], pos: [0,0.23,1.9], bevel: 0.03, color: "dark" },
      { shape: "extrude", profile: [[1.0,0.28],[2.62,0.28],[2.86,0.42],[2.88,0.55],[2.62,0.92],[1.0,0.92]], depth: 0.74, bevel: 0.04, rot: [0,-90,0], color: "faction" },
      { shape: "box", size: [0.02,0.03,1.5], pos: [0.375,0.55,1.85], color: "glow", mirror: true },
      { shape: "box", size: [0.14,0.12,0.06], pos: [0.24,0.5,2.85], color: "glow", mirror: true },
      { shape: "box", size: [0.3,0.2,0.03], pos: [0,0.74,2.76], rot: [-35,0,0], color: "dark" },
      ...[0.68, 0.74, 0.8].map((y): Part => ({ shape: "box", size: [0.26,0.012,0.02], pos: [0,y,2.88 - (y - 0.55) * 0.7], rot: [-35,0,0], color: "black", fine: true })),
      { shape: "box", size: [0.5,0.025,0.06], pos: [0,0.4,2.9], color: "hazard", fine: true },
      // capot : ventilateurs, grilles, échappement
      ...[2.25, 1.9].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 12, radius: 0.15, height: 0.04, pos: [0,0.93,z], color: "dark" },
        { shape: "box", size: [0.26,0.012,0.03], pos: [0,0.955,z], color: "black", fine: true },
        { shape: "box", size: [0.03,0.012,0.26], pos: [0,0.955,z], color: "black", fine: true },
      ]),
      { shape: "box", size: [0.5,0.02,0.2], pos: [0,0.93,1.6], color: "black" },
      { shape: "cylinder", sides: 6, radius: 0.04, height: 0.14, pos: [0.2,0.98,2.5], color: "steel", fine: true },
      // cabine vitrée, toit, gyrophare
      { shape: "bevel", size: [0.66,0.26,0.56], pos: [0,1.03,1.3], bevel: 0.04, color: "light" },
      { shape: "box", size: [0.68,0.1,0.58], pos: [0,1.06,1.3], color: "glass" },
      { shape: "box", size: [0.6,0.03,0.5], pos: [0,1.17,1.3], color: "dark" },
      { shape: "sphere", radius: 0.03, pos: [0.2,1.19,1.3], color: "amber" },
      { shape: "tube", radius: 0.008, sides: 4, path: [[-0.2,1.18,1.15],[-0.2,1.18,1.45]], color: "light", fine: true },
      ...bogie(2.35),
      ...bogie(1.35),
      // attelages
      { shape: "box", size: [0.12,0.08,0.24], pos: [0,0.24,0.88], color: "dark" },
      { shape: "box", size: [0.12,0.08,0.24], pos: [0,0.24,-0.8], color: "dark" },
      // wagons
      ...wagon(0.05, "faction"),
      ...wagon(-1.65, "hazard"),
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.28,0.5,-2.42], color: "amber", mirror: true },
    ],
  },
  // drone de fret : corps d'équipe à pans, deux poutres, quatre rotors (disques clairs, anneaux cyan, moteurs),
  // conteneur de danger suspendu par des câbles, œil cyan
  cargo_drone: {
    parts: [
      { shape: "extrude", profile: [[-0.18,-0.35],[0.18,-0.35],[0.25,-0.25],[0.25,0.25],[0.18,0.35],[-0.18,0.35],[-0.25,0.25],[-0.25,-0.25]], depth: 0.16, bevel: 0.03, pos: [0,0.6,0], rot: [90,0,0], color: "faction" },
      { shape: "box", size: [0.4,0.06,0.5], pos: [0,0.5,0], color: "dark" },
      { shape: "box", size: [0.14,0.05,0.04], pos: [0,0.6,0.36], color: "glow" },
      { shape: "box", size: [0.14,0.012,0.2], pos: [0,0.685,-0.08], color: "dark", fine: true },
      // poutres, moteurs, rotors
      { shape: "box", size: [1.5,0.05,0.08], pos: [0,0.62,0.25], color: "steel" },
      { shape: "box", size: [1.5,0.05,0.08], pos: [0,0.62,-0.25], color: "steel" },
      ...[0.25, -0.25].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 6, radius: 0.07, height: 0.12, pos: [0.75,0.64,z], color: "dark", mirror: true, fine: true },
        { shape: "cylinder", sides: 8, radius: 0.28, height: 0.015, pos: [0.75,0.7,z], rot: [0,22.5,0], color: "light", mirror: true },
        { shape: "lathe", sides: 10, profile: [[0.28,0],[0.255,0]], pos: [0.75,0.71,z], color: "glow", mirror: true, fine: true },
        { shape: "cone", sides: 6, radius: 0.05, height: 0.04, pos: [0.75,0.725,z], color: "steel", mirror: true, fine: true },
        { shape: "box", size: [0.5,0.01,0.04], pos: [0.75,0.712,z], rot: [0,30,0], color: "dark", mirror: true, fine: true },
      ]),
      // conteneur suspendu : caisse de danger, sangles, câbles, balise
      { shape: "bevel", size: [0.45,0.35,0.45], pos: [0,0.25,0], bevel: 0.03, color: "hazard" },
      { shape: "box", size: [0.47,0.37,0.04], pos: [0,0.25,0.12], color: "dark" },
      { shape: "box", size: [0.47,0.37,0.04], pos: [0,0.25,-0.12], color: "dark" },
      ...[[0.18, 0.18], [0.18, -0.18]].map(([x, z]): Part => ({ shape: "tube", radius: 0.01, sides: 4, path: [[x,0.43,z],[x * 0.8,0.48,z * 0.8]], color: "metal", mirror: true, fine: true })),
      { shape: "box", size: [0.06,0.03,0.06], pos: [0,0.44,0], color: "amber", fine: true },
    ],
  },
  // drone de ravitaillement (constructeurs) : quadrirotor compact, croix de bras d'acier, coque d'équipe à
  // dos clair, quatre rotors à anneau cyan, œil cyan à l'avant, pinces repliées sous le ventre
  supply_drone: { parts: supplyDrone(false) },
  // le même, chargé : une caisse de danger tenue par les pinces
  supply_drone_loaded: { parts: supplyDrone(true) },
  // robot logistique : petit corps clair à dessus d'équipe et visière cyan, deux propulseurs latéraux à tuyère
  // lumineuse, caisse de danger pincée sous le ventre
  logistic_robot: {
    parts: [
      { shape: "bevel", size: [0.5,0.24,0.6], pos: [0,0.5,0], bevel: 0.05, color: "light" },
      { shape: "box", size: [0.44,0.04,0.52], pos: [0,0.64,0], color: "faction" },
      { shape: "box", size: [0.3,0.05,0.02], pos: [0,0.52,0.305], color: "glow", fine: true },
      { shape: "cylinder", sides: 8, radius: 0.04, height: 0.03, pos: [0.12,0.67,0.12], color: "dark", fine: true },
      // propulseurs latéraux
      { shape: "cylinder", sides: 6, radius: 0.12, height: 0.34, bevel: 0.02, pos: [0.36,0.5,0], rot: [90,0,0], color: "steel", mirror: true },
      { shape: "box", size: [0.08,0.06,0.04], pos: [0.36,0.5,-0.17], color: "glow", mirror: true },
      { shape: "box", size: [0.12,0.06,0.16], pos: [0.26,0.5,0], color: "dark", mirror: true, fine: true },
      // caisse pincée
      { shape: "box", size: [0.3,0.2,0.3], pos: [0,0.28,0], color: "hazard" },
      { shape: "box", size: [0.32,0.22,0.03], pos: [0,0.28,0.07], color: "dark", fine: true },
      { shape: "box", size: [0.03,0.14,0.2], pos: [0.165,0.38,0], color: "metal", mirror: true, fine: true },
    ],
  },
};
