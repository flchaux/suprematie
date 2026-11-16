// Descriptions des bâtiments. Clé = clé du bâtiment dans les données du jeu (sim/src/data.rs).
// Le modèle est redimensionné pour couvrir son emprise au sol (w x h cases) ; +z = avant (sortie).
import type { Model } from "./types.ts";

export const BUILDING_MODELS: Record<string, Model> = {
  // extractor (144 triangles)
  extractor: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "box", size: [1.2,0.8,1.2], pos: [0,0.65,0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.35, height: 1.2, pos: [0,1.4,0], color: "metal" },
      { shape: "box", size: [0.15,1.6,0.15], pos: [0.55,1,0.55], color: "hazard", mirror: true },
      { shape: "box", size: [0.15,1.6,0.15], pos: [0.55,1,-0.55], color: "hazard", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.5, height: 0.15, pos: [0,2.1,0], color: "dark", pivot: "foret" },
      { shape: "wedge", size: [0.5,0.3,0.5], pos: [0,0.45,0.85], color: "metal" },
    ],
  },
  // belt1 (84 triangles)
  belt1: {
    parts: [
      { shape: "box", size: [0.9,0.1,1], pos: [0,0.05,0], color: "metal" },
      { shape: "box", size: [0.08,0.15,1], pos: [0.46,0.075,0], color: "light", mirror: true },
      { shape: "wedge", size: [0.2,0.3,0.4], pos: [0.15,0.13,0.25], color: "dark", rot: [0,0,-90], mirror: true },
      { shape: "wedge", size: [0.2,0.3,0.4], pos: [0.15,0.13,-0.25], color: "dark", rot: [0,0,-90], mirror: true },
    ],
  },
  // belt2 (84 triangles)
  belt2: {
    parts: [
      { shape: "box", size: [0.9,0.1,1], pos: [0,0.05,0], color: "dark" },
      { shape: "box", size: [0.08,0.15,1], pos: [0.46,0.075,0], color: "light", mirror: true },
      { shape: "wedge", size: [0.2,0.3,0.4], pos: [0.15,0.13,0.25], color: "hazard", rot: [0,0,-90], mirror: true },
      { shape: "wedge", size: [0.2,0.3,0.4], pos: [0.15,0.13,-0.25], color: "hazard", rot: [0,0,-90], mirror: true },
    ],
  },
  // belt3 (84 triangles)
  belt3: {
    parts: [
      { shape: "box", size: [0.9,0.1,1], pos: [0,0.05,0], color: "dark" },
      { shape: "box", size: [0.08,0.15,1], pos: [0.46,0.075,0], color: "light", mirror: true },
      { shape: "wedge", size: [0.2,0.3,0.4], pos: [0.15,0.13,0.25], color: "glow", rot: [0,0,-90], mirror: true },
      { shape: "wedge", size: [0.2,0.3,0.4], pos: [0.15,0.13,-0.25], color: "glow", rot: [0,0,-90], mirror: true },
    ],
  },
  // inserter (72 triangles)
  inserter: {
    parts: [
      { shape: "box", size: [0.8,0.12,0.8], pos: [0,0.06,0], color: "dark" },
      { shape: "box", size: [0.5,0.2,0.5], pos: [0,0.22,-0.1], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 0.2, pos: [0,0.4,-0.1], color: "metal" },
      { shape: "box", size: [0.1,0.1,0.7], pos: [0,0.55,0.2], color: "hazard", pivot: "bras" },
      { shape: "box", size: [0.25,0.1,0.1], pos: [0,0.5,0.58], color: "metal", parent: "bras" },
    ],
  },
  // furnace (96 triangles)
  furnace: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "box", size: [1.6,1.1,1.6], pos: [0,0.8,0], color: "metal" },
      { shape: "box", size: [0.8,0.4,0.1], pos: [0,0.6,0.81], color: "glow" },
      { shape: "cylinder", sides: 6, radius: 0.22, height: 0.9, pos: [0.45,1.8,-0.45], color: "dark" },
      { shape: "box", size: [1.65,0.15,1.65], pos: [0,1.4,0], color: "faction" },
      { shape: "box", size: [0.4,0.2,0.4], pos: [-0.4,1.55,0.3], color: "hazard" },
    ],
  },
  // assembler1 (96 triangles)
  assembler1: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "box", size: [2.4,0.6,2.4], pos: [0,0.55,0], color: "metal" },
      { shape: "box", size: [2,0.6,2], pos: [0,1.15,0], color: "faction" },
      { shape: "box", size: [0.6,0.2,0.3], pos: [0,0.5,1.25], color: "hazard" },
      { shape: "box", size: [0.5,0.35,0.5], pos: [0.7,1.6,0.4], color: "dark" },
      { shape: "box", size: [0.12,0.12,0.9], pos: [0,1.9,0.2], color: "light", pivot: "bras" },
      { shape: "box", size: [0.3,0.1,0.2], pos: [0,1.9,0.75], color: "hazard", parent: "bras" },
    ],
  },
  // assembler2 (132 triangles)
  assembler2: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "box", size: [2.4,0.6,2.4], pos: [0,0.55,0], color: "metal" },
      { shape: "box", size: [2,0.6,2], pos: [0,1.15,0], color: "faction" },
      { shape: "box", size: [0.6,0.2,0.3], pos: [0,0.5,1.25], color: "glow" },
      { shape: "box", size: [0.5,0.35,0.5], pos: [0.7,1.6,0.4], color: "dark" },
      { shape: "box", size: [0.12,0.12,0.9], pos: [0,1.9,0.2], color: "light", pivot: "bras" },
      { shape: "box", size: [0.3,0.1,0.2], pos: [0,1.9,0.75], color: "hazard", parent: "bras" },
      { shape: "box", size: [0.3,0.9,0.3], pos: [-0.9,1.7,-0.7], color: "dark" },
      { shape: "box", size: [0.5,0.1,0.5], pos: [-0.9,2.2,-0.7], color: "glow" },
      { shape: "box", size: [0.2,0.5,2.2], pos: [1.1,1,0], color: "light" },
    ],
  },
  // assembler3 (196 triangles)
  assembler3: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "box", size: [2.4,0.6,2.4], pos: [0,0.55,0], color: "metal" },
      { shape: "box", size: [2,0.6,2], pos: [0,1.15,0], color: "faction" },
      { shape: "box", size: [0.6,0.2,0.3], pos: [0,0.5,1.25], color: "glow" },
      { shape: "box", size: [0.5,0.35,0.5], pos: [0.7,1.6,0.4], color: "dark" },
      { shape: "box", size: [0.12,0.12,0.9], pos: [0,1.9,0.2], color: "light", pivot: "bras" },
      { shape: "box", size: [0.3,0.1,0.2], pos: [0,1.9,0.75], color: "hazard", parent: "bras" },
      { shape: "box", size: [0.3,0.9,0.3], pos: [-0.9,1.7,-0.7], color: "dark" },
      { shape: "box", size: [0.5,0.1,0.5], pos: [-0.9,2.2,-0.7], color: "glow" },
      { shape: "box", size: [0.2,0.5,2.2], pos: [1.1,1,0], color: "light" },
      { shape: "box", size: [2.2,0.15,2.2], pos: [0,1.5,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.4, pos: [0.7,1.8,-0.7], color: "light" },
      { shape: "sphere", radius: 0.3, pos: [0.7,2.1,-0.7], color: "glow" },
    ],
  },
  // refinery (172 triangles)
  refinery: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "cylinder", sides: 6, radius: 0.55, height: 1.6, pos: [-0.7,1,-0.7], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.55, height: 1.6, pos: [0.7,1,-0.7], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 2.4, pos: [0,1.4,0.2], color: "dark" },
      { shape: "box", size: [2.2,0.3,0.5], pos: [0,0.55,0.9], color: "hazard" },
      { shape: "box", size: [0.15,0.15,1.8], pos: [-0.7,1.9,0], color: "light" },
      { shape: "box", size: [0.15,0.15,1.8], pos: [0.7,1.9,0], color: "light" },
      { shape: "sphere", radius: 0.2, pos: [0,2.7,0.2], color: "glow" },
      { shape: "box", size: [1,0.5,0.8], pos: [0.8,0.55,0.5], color: "metal" },
    ],
  },
  // chemical (148 triangles)
  chemical: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "sphere", radius: 0.7, pos: [-0.7,1,-0.6], color: "faction" },
      { shape: "sphere", radius: 0.7, pos: [0.7,1,-0.6], color: "light" },
      { shape: "cylinder", sides: 6, radius: 0.45, height: 1.4, pos: [0,0.95,0.7], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 1.2, pos: [-0.7,1.9,0.6], color: "dark" },
      { shape: "box", size: [0.15,0.15,1.6], pos: [0,1.6,-0.6], color: "hazard" },
      { shape: "box", size: [2.2,0.4,0.4], pos: [0,0.5,1.2], color: "dark" },
      { shape: "box", size: [0.4,0.2,0.4], pos: [0.9,1.75,0.8], color: "glow" },
    ],
  },
  // lab (132 triangles)
  lab: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "box", size: [2.4,0.7,2.4], pos: [0,0.6,0], color: "faction" },
      { shape: "box", size: [1.6,0.1,0.1], pos: [0,1,1.21], color: "glow" },
      { shape: "sphere", radius: 0.85, pos: [0,1.5,0], color: "light" },
      { shape: "box", size: [0.7,0.4,0.5], pos: [0,1.4,0.55], color: "glass" },
      { use: "antenne", pos: [0.9,0.9,-0.9], scale: 1.4 },
      { shape: "box", size: [0.5,0.3,0.5], pos: [-0.9,1.1,0.9], color: "dark" },
    ],
  },
  // depot (84 triangles)
  depot: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "box", size: [1.7,0.9,1.7], pos: [0,0.7,0], color: "metal" },
      { shape: "box", size: [1.8,0.2,1.8], pos: [0,1.2,0], color: "faction" },
      { shape: "box", size: [1,0.7,0.1], pos: [0,0.6,0.86], color: "dark" },
      { shape: "box", size: [1,0.1,0.12], pos: [0,0.98,0.88], color: "hazard" },
      { shape: "box", size: [0.3,0.3,0.3], pos: [-0.5,1.45,-0.4], color: "hazard" },
    ],
  },
  // generator (168 triangles)
  generator: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 1, pos: [0,0.8,0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.3, pos: [0,1.45,0], color: "dark" },
      { shape: "sphere", radius: 0.3, pos: [0,1.75,0], color: "glow" },
      { shape: "box", size: [0.12,0.8,0.5], pos: [0.8,0.8,0], color: "metal", mirror: true },
      { shape: "box", size: [0.5,0.8,0.12], pos: [0,0.8,0.8], color: "metal" },
      { shape: "box", size: [0.5,0.8,0.12], pos: [0,0.8,-0.8], color: "metal" },
      { shape: "box", size: [0.6,0.3,0.1], pos: [0,0.4,0.75], color: "hazard" },
    ],
  },
  // pylon (116 triangles)
  pylon: {
    parts: [
      { shape: "box", size: [0.7,0.12,0.7], pos: [0,0.06,0], color: "dark" },
      { shape: "cylinder", sides: 5, radius: 0.12, height: 1.6, pos: [0,0.9,0], color: "metal", radiusTop: 0.06 },
      { shape: "box", size: [0.7,0.08,0.08], pos: [0,1.4,0], color: "light" },
      { shape: "cylinder", sides: 5, radius: 0.07, height: 0.2, pos: [0.3,1.3,0], color: "faction", mirror: true },
      { shape: "sphere", radius: 0.12, pos: [0,1.75,0], color: "glow" },
      { shape: "box", size: [0.4,0.06,0.06], pos: [0,1.1,0], color: "light" },
    ],
  },
  // hydro_plant (180 triangles)
  hydro_plant: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 1.5, pos: [-0.7,1,-0.6], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 1.5, pos: [0.7,1,-0.6], color: "metal" },
      { shape: "box", size: [2.4,0.9,1], pos: [0,0.65,0.8], color: "dark" },
      { shape: "cylinder", sides: 6, radius: 0.25, height: 2.2, pos: [0,1.35,-0.1], color: "dark", radiusTop: 0.35 },
      { shape: "box", size: [1.8,0.2,0.7], pos: [0,0.95,0.8], color: "faction" },
      { shape: "box", size: [1.2,0.35,0.1], pos: [0,0.6,1.31], color: "glow" },
      { shape: "box", size: [0.15,0.15,1.4], pos: [0,1.9,-0.6], color: "hazard" },
      { shape: "sphere", radius: 0.22, pos: [0,2.6,-0.1], color: "glow" },
    ],
  },
  // land_factory (180 triangles)
  land_factory: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [5,1,5] },
      { shape: "box", size: [4.4,1.3,0.6], pos: [0,0.8500000000000001,-1.9], color: "metal" },
      { shape: "box", size: [0.6,1.3,3.8], pos: [1.9000000000000001,0.8500000000000001,-0.1], color: "metal", mirror: true },
      { shape: "box", size: [4.4,0.45,4], pos: [0,1.7000000000000002,-0.4], color: "faction" },
      { shape: "box", size: [4.4,0.4,0.5], pos: [0,1.5,2], color: "faction" },
      { shape: "box", size: [3.2,0.9,0.1], pos: [0,0.8500000000000001,1.9], color: "black" },
      { shape: "box", size: [3.2,0.08,0.7], pos: [0,0.26,2.25], color: "hazard" },
      { shape: "box", size: [0.4,1,0.4], pos: [-1.9,2,-1.7], color: "dark" },
      { shape: "box", size: [0.9,0.5,0.9], pos: [1.5,2.1,-1.2], color: "light" },
      { shape: "box", size: [0.9,0.12,0.12], pos: [0,1.15,2], color: "glow" },
      { shape: "box", size: [1,0.3,0.1], pos: [1,1,2.05], color: "hazard" },
      { shape: "cylinder", sides: 6, radius: 0.2, height: 1, pos: [1.9,2.1,-1.8], color: "dark" },
    ],
  },
  // air_factory (156 triangles)
  air_factory: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [5,1,5] },
      { shape: "box", size: [4.4,0.9,3], pos: [0,0.65,-1], color: "metal" },
      { shape: "wedge", size: [4.4,1,3], pos: [0,1.6,-1], color: "faction", rot: [0,180,0] },
      { shape: "box", size: [3.4,0.9,0.2], pos: [0,0.65,0.55], color: "black" },
      { shape: "box", size: [2.4,0.1,2], pos: [0,0.27,1.5], color: "dark" },
      { shape: "box", size: [0.3,0.1,1.8], pos: [0,0.34,1.5], color: "hazard" },
      { shape: "box", size: [0.12,0.1,1.8], pos: [0.9,0.34,1.5], color: "light", mirror: true },
      { shape: "box", size: [0.6,1.8,0.6], pos: [-2,1.1,0.6], color: "light" },
      { shape: "box", size: [0.9,0.4,0.9], pos: [-2,2.2,0.6], color: "glass" },
      { shape: "box", size: [0.15,0.15,3.4], pos: [2,0.4,1.7], color: "glow", rot: [0,0,0] },
      { shape: "box", size: [0.15,0.15,3.4], pos: [-1.5,0.4,1], color: "glow" },
    ],
  },
  // naval_factory (204 triangles)
  naval_factory: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [5,1,5] },
      { shape: "box", size: [1,0.9,4.4], pos: [1.9,0.65,0], color: "metal", mirror: true },
      { shape: "box", size: [2.9,0.9,1], pos: [0,0.65,-1.95], color: "metal" },
      { shape: "box", size: [2.9,0.05,3.4], pos: [0,0.27,0.6], color: "glass" },
      { shape: "box", size: [2.9,0.05,3.4], pos: [0,0.31,0.6], color: "glass" },
      { shape: "box", size: [1,0.15,4.5], pos: [1.9,1.15,0], color: "faction", mirror: true },
      { shape: "box", size: [3,0.25,0.4], pos: [0,1.5,-0.8], color: "faction" },
      { shape: "box", size: [0.25,0.9,0.25], pos: [1.5,1.45,-0.8], color: "light", mirror: true },
      { shape: "box", size: [0.15,0.15,1.4], pos: [0,1.4,-0.3], color: "dark" },
      { shape: "box", size: [0.12,0.6,0.12], pos: [0,1.1,0.3], color: "hazard" },
      { shape: "box", size: [0.2,0.3,0.2], pos: [1.5,1.2,1.5], color: "glow", mirror: true },
      { shape: "wedge", size: [2.9,0.1,0.4], pos: [0,0.26,2.3], color: "hazard" },
    ],
  },
  // gantry (204 triangles)
  gantry: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [7,1,7] },
      { shape: "box", size: [0.9,3.2,0.9], pos: [3,1.8,3], color: "faction", mirror: true },
      { shape: "box", size: [0.9,3.2,0.9], pos: [3,1.8,-3], color: "faction", mirror: true },
      { shape: "box", size: [0.6,0.6,6], pos: [3,3.6,0], color: "metal", mirror: true },
      { shape: "box", size: [6,0.6,0.6], pos: [0,3.6,-3], color: "metal" },
      { shape: "box", size: [6,0.6,0.6], pos: [0,3.6,3], color: "metal" },
      { shape: "box", size: [6,0.5,0.7], pos: [0,3.1,-0.5], color: "hazard", pivot: "bras" },
      { shape: "box", size: [0.8,0.8,0.8], pos: [0,2.6,-0.5], color: "dark", parent: "bras" },
      { shape: "box", size: [0.15,1.2,0.15], pos: [0,2,-0.5], color: "light", parent: "bras" },
      { shape: "box", size: [3.6,0.1,4], pos: [0,0.27,0.5], color: "dark" },
      { shape: "box", size: [2.6,0.08,2.6], pos: [0,0.3,0.5], color: "glow" },
      { shape: "box", size: [1,0.1,1], pos: [2,0.3,2.8], color: "hazard" },
      { shape: "box", size: [0.4,3.2,0.4], pos: [-2.4,1.8,-2.4], color: "light" },
    ],
  },
  // radar (132 triangles)
  radar: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "box", size: [1,0.7,1], pos: [0,0.6,0], color: "faction" },
      { shape: "cylinder", sides: 5, radius: 0.15, height: 1, pos: [0,1.4,0], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.9, height: 0.2, pos: [0,2,0], color: "light", radiusTop: 0.2, pivot: "radar" },
      { shape: "box", size: [0.08,0.5,0.08], pos: [0,2.35,0.1], color: "light", parent: "radar" },
      { shape: "sphere", radius: 0.1, pos: [0,2.65,0.1], color: "glow", parent: "radar" },
      { shape: "box", size: [0.4,0.3,0.3], pos: [0.5,0.5,0.6], color: "dark" },
    ],
  },
  // wall (96 triangles)
  wall: {
    parts: [
      { shape: "box", size: [1,0.2,1], pos: [0,0.1,0], color: "dark" },
      { shape: "box", size: [0.95,0.7,0.95], pos: [0,0.55,0], color: "metal" },
      { shape: "box", size: [0.95,0.15,0.95], pos: [0,1,0], color: "faction" },
      { shape: "box", size: [0.25,0.25,0.25], pos: [0.3,1.2,0.3], color: "light", mirror: true },
      { shape: "box", size: [0.25,0.25,0.25], pos: [0.3,1.2,-0.3], color: "light", mirror: true },
      { shape: "box", size: [0.6,0.12,0.05], pos: [0,0.6,0.49], color: "hazard" },
    ],
  },
  // light_turret (144 triangles)
  light_turret: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "cylinder", sides: 8, radius: 0.55, height: 0.3, pos: [0,0.5,0], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.5, height: 0.3, pos: [0,0.8,0], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [0.6,0.35,0.6], pos: [0,1.05,-0.05], color: "faction", parent: "tourelle" },
      { use: "canon", pos: [0,1.05,0.25], scale: 0.8, parent: "tourelle" },
      { shape: "box", size: [0.3,0.1,0.3], pos: [0.7,0.3,0.7], color: "hazard" },
    ],
  },
  // aa_turret (272 triangles)
  aa_turret: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "cylinder", sides: 8, radius: 0.55, height: 0.3, pos: [0,0.5,0], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.5, height: 0.25, pos: [0,0.8,0], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [0.9,0.4,0.6], pos: [0,1.1,0], color: "faction", parent: "tourelle" },
      { use: "canon", pos: [0.3,1.2,0.2], rot: [-45,0,0], scale: 0.9, mirror: true, parent: "tourelle" },
      { use: "canon", pos: [0.15,1.2,0.2], rot: [-45,0,0], scale: 0.9, mirror: true, parent: "tourelle" },
      { shape: "sphere", radius: 0.15, pos: [0,1.4,-0.3], color: "glow", parent: "tourelle" },
    ],
  },
  // heavy_turret (244 triangles)
  heavy_turret: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "cylinder", sides: 8, radius: 0.8, height: 0.4, pos: [0,0.55,0], color: "metal" },
      { shape: "box", size: [1.7,0.2,1.7], pos: [0,0.35,0], color: "hazard" },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 0.3, pos: [0,0.95,0], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [1,0.5,1], pos: [0,1.3,-0.1], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0.3,1.3,0.4], scale: 0.9, mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.4,0.2,0.3], pos: [0,1.65,-0.5], color: "glow", parent: "tourelle" },
    ],
  },
  // fixed_artillery (208 triangles)
  fixed_artillery: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "box", size: [2.4,0.5,2.4], pos: [0,0.5,0], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 1, height: 0.3, pos: [0,0.95,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.9, height: 0.3, pos: [0,1.25,0], color: "faction", pivot: "tourelle" },
      { shape: "box", size: [1.3,0.8,1.4], pos: [0,1.8,-0.2], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0,1.9,0.4], rot: [-30,0,0], scale: [1.6,1.6,2.4], parent: "tourelle" },
      { shape: "box", size: [0.6,0.25,0.5], pos: [0,2.3,-0.6], color: "hazard", parent: "tourelle" },
      { shape: "box", size: [0.5,0.4,0.5], pos: [1,0.8,1], color: "hazard", mirror: true },
    ],
  },
  // shield_gen (168 triangles)
  shield_gen: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.8, pos: [0,0.7,0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 0.15, pos: [0,1.2,0], color: "light", radiusTop: 0.2 },
      { shape: "sphere", radius: 0.4, pos: [0,1.6,0], color: "glow", pivot: "emetteur" },
      { shape: "box", size: [0.12,0.9,0.12], pos: [0.65,0.8,0.65], color: "metal", mirror: true },
      { shape: "box", size: [0.12,0.9,0.12], pos: [0.65,0.8,-0.65], color: "metal", mirror: true },
      { shape: "box", size: [0.6,0.15,0.15], pos: [0,0.35,0.8], color: "hazard" },
    ],
  },
  // transfer (188 triangles)
  transfer: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 1.5, height: 0.15, pos: [0,0.08,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 1.3, height: 0.12, pos: [0,0.2,0], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 1, height: 0.1, pos: [0,0.3,0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 0.08, pos: [0,0.38,0], color: "glow" },
      { shape: "box", size: [0.3,0.3,0.3], pos: [1.1,0.35,1.1], color: "hazard", mirror: true },
      { shape: "box", size: [0.3,0.3,0.3], pos: [1.1,0.35,-1.1], color: "hazard", mirror: true },
      { shape: "box", size: [0.8,0.12,0.3], pos: [0,0.35,1.35], color: "hazard" },
    ],
  },
  // gate (176 triangles)
  gate: {
    parts: [
      { shape: "box", size: [3.6,0.2,1.2], pos: [0,0.1,0], color: "dark" },
      { shape: "box", size: [0.8,0.4,1], pos: [-1.4,0.4,0], color: "metal" },
      { shape: "box", size: [0.45,0.9,0.5], pos: [1.5,2.1,0], color: "faction", rot: [0,0,0] },
      { shape: "box", size: [0.45,0.9,0.5], pos: [1.061,3.161,0], color: "metal", rot: [0,0,45] },
      { shape: "box", size: [0.45,0.9,0.5], pos: [0,3.6,0], color: "faction", rot: [0,0,90] },
      { shape: "box", size: [0.45,0.9,0.5], pos: [-1.061,3.161,0], color: "metal", rot: [0,0,135] },
      { shape: "box", size: [0.45,0.9,0.5], pos: [-1.5,2.1,0], color: "faction", rot: [0,0,180] },
      { shape: "box", size: [0.45,0.9,0.5], pos: [-1.061,1.039,0], color: "metal", rot: [0,0,225] },
      { shape: "box", size: [0.45,0.9,0.5], pos: [0,0.6,0], color: "faction", rot: [0,0,270] },
      { shape: "box", size: [0.45,0.9,0.5], pos: [1.061,1.039,0], color: "metal", rot: [0,0,315] },
      { shape: "cylinder", sides: 8, radius: 1.15, height: 0.06, pos: [0,2.1,0], color: "glow", rot: [90,0,0] },
      { shape: "box", size: [0.5,0.4,0.5], pos: [1.4,0.4,0], color: "metal" },
      { shape: "box", size: [1,0.1,0.3], pos: [0,0.25,1.4], color: "hazard" },
    ],
  },
  // area_shield (208 triangles)
  area_shield: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 1.4, pos: [0,1,0], color: "faction", radiusTop: 0.45 },
      { shape: "cylinder", sides: 8, radius: 1.1, height: 0.2, pos: [0,1.8,0], color: "light", radiusTop: 1.3 },
      { shape: "sphere", radius: 0.6, pos: [0,2.4,0], color: "glow", pivot: "emetteur" },
      { shape: "box", size: [0.2,1.4,0.2], pos: [1,1,1], color: "metal", mirror: true },
      { shape: "box", size: [0.2,1.4,0.2], pos: [1,1,-1], color: "metal", mirror: true },
      { shape: "sphere", radius: 0.15, pos: [1,1.8,1], color: "glow", mirror: true },
      { shape: "box", size: [1.2,0.2,0.3], pos: [0,0.45,1.2], color: "hazard" },
    ],
  },
  // crystal_reactor (176 triangles)
  crystal_reactor: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [4,1,4] },
      { shape: "cylinder", sides: 8, radius: 1.5, height: 0.3, pos: [0,0.4,0], color: "metal" },
      { shape: "box", size: [0.5,1.6,0.5], pos: [1.3,1.2,1.3], color: "faction", mirror: true },
      { shape: "box", size: [0.5,1.6,0.5], pos: [1.3,1.2,-1.3], color: "faction", mirror: true },
      { shape: "cone", sides: 6, radius: 0.9, height: 1.6, pos: [0,2,0], color: "glow", pivot: "cristal" },
      { shape: "cone", sides: 6, radius: 0.9, height: 1.6, pos: [0,0.8,0], color: "glow", rot: [180,0,0], pivot: "cristal" },
      { shape: "box", size: [2.6,0.2,0.3], pos: [0,2.1,1.3], color: "light" },
      { shape: "box", size: [0.3,0.2,2.6], pos: [1.3,2.1,0], color: "light", mirror: true },
      { shape: "box", size: [1,0.3,0.5], pos: [0,0.6,1.8], color: "hazard" },
    ],
  },
  // missile_silo (160 triangles)
  missile_silo: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "cylinder", sides: 8, radius: 1.2, height: 0.3, pos: [0,0.45,0], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 1, height: 0.2, pos: [0,0.7,0], color: "hazard" },
      { shape: "box", size: [0.9,0.2,1.8], pos: [0.45,0.88,0], color: "faction", mirror: true },
      { shape: "box", size: [0.06,0.1,1.5], pos: [0,0.88,0], color: "glow" },
      { shape: "box", size: [0.5,0.5,0.5], pos: [1.3,0.55,-1.2], color: "dark", mirror: true },
      { shape: "cone", sides: 6, radius: 0.3, height: 0.7, pos: [0,1,0], color: "red" },
    ],
  },
  // antimissile (220 triangles)
  antimissile: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "cylinder", sides: 8, radius: 0.55, height: 0.3, pos: [0,0.5,0], color: "metal" },
      { shape: "box", size: [1.2,0.2,1], pos: [0,0.8,0], color: "faction", pivot: "tourelle" },
      { shape: "cylinder", sides: 5, radius: 0.16, height: 0.9, pos: [0.3,1.3,0.2], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 5, radius: 0.16, height: 0.9, pos: [0.3,1.3,-0.2], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "cone", sides: 5, radius: 0.12, height: 0.3, pos: [0.3,1.9,0.2], color: "red", mirror: true, parent: "tourelle" },
      { shape: "sphere", radius: 0.12, pos: [0,1,-0.4], color: "glow", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.1, pos: [0,1.3,-0.5], color: "light", radiusTop: 0.1, parent: "tourelle" },
    ],
  },
  // beacon (220 triangles)
  beacon: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [2,1,2] },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.3, pos: [0,0.45,0], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 2, pos: [0,1.5,0], color: "faction", radiusTop: 0.15 },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.1, pos: [0,1.2,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.1, pos: [0,1.8,0], color: "light" },
      { shape: "sphere", radius: 0.35, pos: [0,2.7,0], color: "glow", pivot: "feu" },
      { shape: "box", size: [0.12,0.8,0.12], pos: [0.7,0.7,0.7], color: "metal", mirror: true, rot: [0,0,0] },
      { shape: "box", size: [0.12,0.8,0.12], pos: [0.7,0.7,-0.7], color: "metal", mirror: true },
    ],
  },
  // orbital (288 triangles)
  orbital: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [5,1,5] },
      { shape: "cylinder", sides: 8, radius: 2, height: 0.4, pos: [0,0.5,0], color: "metal" },
      { shape: "box", size: [0.8,1.5,0.8], pos: [1.9,1,1.9], color: "faction", mirror: true },
      { shape: "box", size: [0.8,1.5,0.8], pos: [1.9,1,-1.9], color: "faction", mirror: true },
      { shape: "cylinder", sides: 8, radius: 1.2, height: 0.8, pos: [0,1.1,0], color: "dark", radiusTop: 0.9 },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 3.2, pos: [0,3,0], color: "light", radiusTop: 0.45, pivot: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.8, height: 0.2, pos: [0,2,0], color: "glow", parent: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.6, height: 0.2, pos: [0,3,0], color: "glow", parent: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.55, height: 0.25, pos: [0,4.7,0], color: "dark", parent: "canon" },
      { shape: "box", size: [0.2,0.2,3.4], pos: [0,1.6,0], color: "hazard", parent: "canon" },
      { shape: "box", size: [3.4,0.2,0.2], pos: [0,1.6,0], color: "hazard", parent: "canon" },
    ],
  },
};
