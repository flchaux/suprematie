// Véhicules de transport (logistique) : train et drone de fret. Avant vers +z, échelle libre :
// le jeu les redimensionne (train ≈ 2,6 cases de long, drone ≈ 1 case).
import type { Model } from "./types.ts";

export const VEHICLE_MODELS: Record<string, Model> = {
  // train : locomotive à l'avant, deux wagons couverts
  train: {
    parts: [
      { shape: "box", size: [0.8,0.15,5.2], pos: [0,0.18,0], color: "dark" },
      { shape: "box", size: [0.75,0.65,1.4], pos: [0,0.6,1.75], color: "faction" },
      { shape: "wedge", size: [0.75,0.4,0.5], pos: [0,0.55,2.6], color: "faction" },
      { shape: "box", size: [0.6,0.25,0.5], pos: [0,1.05,1.3], color: "glass" },
      { shape: "box", size: [0.14,0.14,0.08], pos: [0.25,0.6,2.86], color: "glow", mirror: true },
      { shape: "box", size: [0.78,0.7,1.5], pos: [0,0.62,0.05], color: "metal" },
      { shape: "box", size: [0.8,0.08,1.5], pos: [0,1.0,0.05], color: "faction" },
      { shape: "box", size: [0.78,0.7,1.5], pos: [0,0.62,-1.65], color: "metal" },
      { shape: "box", size: [0.8,0.08,1.5], pos: [0,1.0,-1.65], color: "hazard" },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.12, pos: [0.4,0.16,1.9], rot: [0,0,90], color: "black", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.12, pos: [0.4,0.16,-0.5], rot: [0,0,90], color: "black", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.16, height: 0.12, pos: [0.4,0.16,-2.2], rot: [0,0,90], color: "black", mirror: true },
    ],
  },
  // drone de fret : quatre rotors, conteneur suspendu
  cargo_drone: {
    parts: [
      { shape: "box", size: [0.5,0.18,0.7], pos: [0,0.6,0], color: "faction" },
      { shape: "box", size: [1.5,0.06,0.1], pos: [0,0.62,0.25], color: "metal" },
      { shape: "box", size: [1.5,0.06,0.1], pos: [0,0.62,-0.25], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.28, height: 0.04, pos: [0.75,0.7,0.25], color: "light", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.28, height: 0.04, pos: [0.75,0.7,-0.25], color: "light", mirror: true },
      { shape: "box", size: [0.45,0.35,0.45], pos: [0,0.25,0], color: "hazard" },
      { shape: "box", size: [0.1,0.06,0.1], pos: [0,0.5,0.38], color: "glow" },
    ],
  },
};
