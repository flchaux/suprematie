// Descriptions des unités. Clé = clé de l'unité dans les données du jeu (sim/src/data.rs).
// Généré depuis des descriptions de pièces simples (voir types.ts et kit.ts) ; aucune géométrie brute.
import type { Model } from "./types.ts";

export const UNIT_MODELS: Record<string, Model> = {
  // commander (264 triangles)
  commander: {
    parts: [
      { use: "jambe", pos: [0.45,0,0], scale: [1.4,1.2,1.4], mirror: true },
      { shape: "box", size: [1.4,0.4,0.9], pos: [0,1.25,0], color: "metal" },
      { shape: "box", size: [1.6,0.9,1.1], pos: [0,1.85,0], color: "faction", pivot: "torse" },
      { shape: "wedge", size: [1,0.35,0.5], pos: [0,2.45,0.2], color: "glass", parent: "torse" },
      { shape: "box", size: [0.45,0.45,0.45], pos: [1.05,2,0], color: "light", mirror: true, parent: "torse" },
      { use: "canon_lourd", pos: [1.05,1.7,0.2], scale: 0.8, parent: "torse" },
      { shape: "box", size: [0.3,0.7,0.3], pos: [-1.05,1.55,0.15], color: "metal", parent: "torse" },
      { shape: "sphere", radius: 0.18, pos: [0,2,0.58], color: "glow", parent: "torse" },
      { use: "antenne", pos: [-0.5,2.3,-0.4], scale: 0.8, parent: "torse" },
    ],
  },
  // eng1 (156 triangles)
  eng1: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.4, height: 0.3, pos: [0,0.7,0], color: "faction" },
      { shape: "box", size: [0.3,0.2,0.2], pos: [0,0.72,0.4], color: "glow" },
      { shape: "box", size: [0.9,0.08,0.14], pos: [0.6,0.7,0], color: "metal", mirror: true },
      { shape: "box", size: [0.1,0.3,0.1], pos: [1,0.55,0], color: "dark", mirror: true },
      { use: "rotor", pos: [1.05,0.72,0], scale: 0.45, pivot: "rotor1" },
      { use: "rotor", pos: [-1.05,0.72,0], scale: 0.45, pivot: "rotor2" },
      { shape: "box", size: [0.12,0.3,0.5], pos: [0,0.45,-0.35], color: "hazard" },
      { shape: "box", size: [0.4,0.1,0.4], pos: [0,0.35,0], color: "dark" },
    ],
  },
  // eng3 (204 triangles)
  eng3: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.5, height: 0.35, pos: [0,0.8,0], color: "faction" },
      { shape: "box", size: [0.4,0.2,0.3], pos: [0,0.85,0.5], color: "glow" },
      { shape: "box", size: [1.6,0.1,0.16], pos: [0,0.8,0], color: "metal" },
      { shape: "box", size: [0.16,0.1,1.6], pos: [0,0.8,0], color: "metal" },
      { use: "rotor", pos: [0.8,0.9,0], scale: 0.5, pivot: "r1" },
      { use: "rotor", pos: [-0.8,0.9,0], scale: 0.5, pivot: "r2" },
      { use: "rotor", pos: [0,0.9,0.8], scale: 0.5, pivot: "r3" },
      { use: "rotor", pos: [0,0.9,-0.8], scale: 0.5, pivot: "r4" },
      { shape: "box", size: [0.2,0.5,0.2], pos: [0.8,0.6,0], color: "dark", mirror: true },
      { shape: "box", size: [0.3,0.3,0.7], pos: [0,0.45,0.1], color: "hazard" },
      { shape: "box", size: [0.08,0.5,0.08], pos: [0,0.25,0.5], color: "light" },
    ],
  },
  // eng5 (304 triangles)
  eng5: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 0.6, height: 0.4, pos: [0,0.9,0], color: "faction" },
      { shape: "sphere", radius: 0.3, pos: [0,1.2,0], color: "glow" },
      { shape: "box", size: [2.2,0.1,0.2], pos: [0,0.85,0], color: "metal" },
      { shape: "box", size: [0.2,0.1,2.2], pos: [0,0.85,0], color: "metal" },
      { use: "rotor", pos: [1.1,0.95,0], scale: 0.55, pivot: "r1" },
      { use: "rotor", pos: [-1.1,0.95,0], scale: 0.55, pivot: "r2" },
      { use: "rotor", pos: [0,0.95,1.1], scale: 0.55, pivot: "r3" },
      { use: "rotor", pos: [0,0.95,-1.1], scale: 0.55, pivot: "r4" },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 0.25, pos: [1.1,0.75,0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 0.25, pos: [0,0.75,1.1], color: "dark" },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 0.25, pos: [0,0.75,-1.1], color: "dark" },
      { shape: "box", size: [0.4,0.4,0.4], pos: [0,0.55,0.5], color: "hazard" },
      { shape: "box", size: [0.12,0.5,0.12], pos: [0.3,0.45,0.2], color: "light", mirror: true },
    ],
  },
  // line_robot (132 triangles)
  line_robot: {
    parts: [
      { shape: "box", size: [0.16,0.7,0.16], pos: [0.16,0.35,0], color: "metal", mirror: true },
      { shape: "box", size: [0.24,0.08,0.34], pos: [0.16,0.04,0.06], color: "dark", mirror: true },
      { shape: "box", size: [0.6,0.55,0.3], pos: [0,0.98,0], color: "faction" },
      { shape: "box", size: [0.12,0.55,0.12], pos: [0.36,0.95,0.05], color: "metal", mirror: true },
      { shape: "box", size: [0.24,0.2,0.3], pos: [0,1.4,0.05], color: "light" },
      { shape: "box", size: [0.16,0.06,0.04], pos: [0,1.42,0.21], color: "glow" },
      { shape: "box", size: [0.08,0.08,0.6], pos: [0.36,0.8,0.4], color: "dark" },
      { shape: "box", size: [0.3,0.2,0.16], pos: [0,1,-0.22], color: "dark" },
    ],
  },
  // moto (204 triangles)
  moto: {
    parts: [
      { shape: "wedge", size: [0.7,0.3,2], pos: [0,0.55,0], color: "faction" },
      { shape: "box", size: [0.7,0.25,1.2], pos: [0,0.45,-0.3], color: "faction" },
      { shape: "box", size: [0.4,0.2,0.5], pos: [0,0.78,-0.2], color: "glass" },
      { use: "pad", pos: [0.55,0.15,0.4], mirror: true },
      { shape: "box", size: [0.12,0.12,0.9], pos: [0.45,0.4,0.4], color: "metal", mirror: true },
      { use: "reacteur", pos: [0,0.5,-1.05], scale: 0.7 },
      { shape: "box", size: [0.06,0.06,0.5], pos: [0.15,0.6,1], color: "dark", mirror: true },
    ],
  },
  // light_tank (148 triangles)
  light_tank: {
    parts: [
      { use: "chenille_l", pos: [0.95,0,0], mirror: true },
      { shape: "box", size: [1.6,0.4,2.2], pos: [0,0.55,0], color: "faction" },
      { shape: "wedge", size: [1.6,0.3,0.5], pos: [0,0.55,1.3], color: "faction" },
      { use: "tourelle", pos: [0,0.9,-0.1], pivot: "tourelle" },
      { use: "canon", pos: [0,1,0.2], parent: "tourelle" },
    ],
  },
  // artillery (192 triangles)
  artillery: {
    parts: [
      { use: "chenille_l", pos: [0.95,0,0], mirror: true },
      { shape: "box", size: [1.6,0.45,2.3], pos: [0,0.55,0], color: "faction" },
      { shape: "wedge", size: [1.6,0.25,0.5], pos: [0,0.5,1.4], color: "metal" },
      { shape: "box", size: [1.2,0.3,1], pos: [0,0.95,-0.5], color: "dark" },
      { shape: "cylinder", sides: 6, radius: 0.5, height: 0.2, pos: [0,1,0], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.9,0.45,0.9], pos: [0,1.3,-0.1], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0,1.4,0.3], rot: [-22,0,0], scale: [1,1,1.3], parent: "tourelle" },
      { shape: "box", size: [0.3,0.15,0.3], pos: [0,1.6,-0.5], color: "hazard", parent: "tourelle" },
    ],
  },
  // mobile_aa (288 triangles)
  mobile_aa: {
    parts: [
      { use: "chenille_l", pos: [0.95,0,0], mirror: true },
      { shape: "box", size: [1.6,0.4,2.2], pos: [0,0.55,0], color: "faction" },
      { shape: "wedge", size: [1.6,0.25,0.5], pos: [0,0.5,1.3], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.6, height: 0.25, pos: [0,0.9,-0.1], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [1.2,0.5,0.7], pos: [0,1.25,-0.1], color: "faction", parent: "tourelle" },
      { use: "canon", pos: [0.4,1.35,0.2], rot: [-40,0,0], scale: [1,1,0.8], mirror: true, parent: "tourelle" },
      { use: "canon", pos: [0.2,1.35,0.2], rot: [-40,0,0], scale: [1,1,0.8], mirror: true, parent: "tourelle" },
      { shape: "sphere", radius: 0.15, pos: [0,1.6,-0.3], color: "glow", parent: "tourelle" },
    ],
  },
  // sonde (156 triangles)
  sonde: {
    parts: [
      { shape: "sphere", radius: 0.5, pos: [0,0.9,0], color: "faction" },
      { shape: "box", size: [0.15,0.7,0.15], pos: [0.35,0.45,0.2], color: "metal", rot: [0,0,-20], mirror: true },
      { shape: "box", size: [0.15,0.7,0.15], pos: [0,0.45,-0.4], color: "metal", rot: [20,0,0] },
      { shape: "box", size: [0.2,0.06,0.2], pos: [0.5,0.1,0.3], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 0.15, pos: [0,1.45,0], color: "light", radiusTop: 0.15, pivot: "radar" },
      { shape: "box", size: [0.08,0.6,0.08], pos: [0,1.75,0], color: "light", parent: "radar" },
      { shape: "sphere", radius: 0.12, pos: [0,2.1,0], color: "glow", parent: "radar" },
      { shape: "box", size: [0.5,0.1,0.2], pos: [0,0.9,0.5], color: "glow" },
    ],
  },
  // assault_walker (224 triangles)
  assault_walker: {
    parts: [
      { use: "jambe", pos: [0.5,0,0], scale: [1.2,1,1.2], mirror: true },
      { shape: "box", size: [1.3,0.35,0.9], pos: [0,1.1,0], color: "metal" },
      { shape: "box", size: [1.2,0.7,1], pos: [0,1.6,0], color: "faction", pivot: "tourelle" },
      { shape: "wedge", size: [0.7,0.3,0.4], pos: [0,2.1,0.2], color: "glass", parent: "tourelle" },
      { shape: "box", size: [0.35,0.4,0.5], pos: [0.8,1.7,0.1], color: "dark", mirror: true, parent: "tourelle" },
      { use: "canon", pos: [0.8,1.7,0.4], scale: [1.3,1.3,1.1], mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.5,0.25,0.3], pos: [0,1.65,-0.65], color: "hazard", parent: "tourelle" },
    ],
  },
  // hover_tank (324 triangles)
  hover_tank: {
    parts: [
      { shape: "box", size: [2,0.45,2.8], pos: [0,0.75,0], color: "faction" },
      { shape: "wedge", size: [2,0.35,0.8], pos: [0,0.75,1.8], color: "faction" },
      { use: "pad", pos: [1,0.25,1], mirror: true },
      { use: "pad", pos: [1,0.25,-1], mirror: true },
      { shape: "box", size: [0.3,0.3,1], pos: [1.15,0.55,1], color: "metal", mirror: true },
      { shape: "box", size: [0.3,0.3,1], pos: [1.15,0.55,-1], color: "metal", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.7, height: 0.25, pos: [0,1.1,-0.2], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [1.1,0.4,1], pos: [0,1.4,-0.2], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0,1.4,0.3], parent: "tourelle" },
      { shape: "box", size: [0.3,0.3,0.3], pos: [0,1.7,-0.3], color: "glow", parent: "tourelle" },
    ],
  },
  // missile_launcher (180 triangles)
  missile_launcher: {
    parts: [
      { use: "chenille_l", pos: [1,0,0], mirror: true },
      { shape: "box", size: [1.7,0.4,2.6], pos: [0,0.55,0], color: "faction" },
      { shape: "box", size: [1,0.45,0.6], pos: [0,0.95,1], color: "glass" },
      { shape: "cylinder", sides: 6, radius: 0.5, height: 0.2, pos: [0,0.85,-0.5], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [1.2,0.3,1.8], pos: [0,1.1,-0.7], color: "metal", rot: [-25,0,0], parent: "tourelle" },
      { shape: "cone", sides: 6, radius: 0.14, height: 0.7, pos: [0.35,1.45,-0.2], color: "red", rot: [65,0,0], mirror: true, parent: "tourelle" },
      { shape: "cone", sides: 6, radius: 0.14, height: 0.7, pos: [0,1.45,-0.2], color: "light", rot: [65,0,0], parent: "tourelle" },
      { shape: "cone", sides: 6, radius: 0.14, height: 0.7, pos: [0.35,1.1,-0.9], color: "red", rot: [65,0,0], mirror: true, parent: "tourelle" },
      { shape: "cone", sides: 6, radius: 0.14, height: 0.7, pos: [0,1.1,-0.9], color: "light", rot: [65,0,0], parent: "tourelle" },
    ],
  },
  // mobile_shield (184 triangles)
  mobile_shield: {
    parts: [
      { use: "chenille_l", pos: [0.95,0,0], mirror: true },
      { shape: "box", size: [1.6,0.4,2.2], pos: [0,0.55,0], color: "faction" },
      { shape: "wedge", size: [1.6,0.25,0.5], pos: [0,0.5,1.3], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.7, height: 0.2, pos: [0,0.85,0], color: "metal" },
      { shape: "sphere", radius: 0.55, pos: [0,1.35,0], color: "glow", pivot: "emetteur" },
      { shape: "box", size: [0.12,0.5,0.12], pos: [0.55,1.1,0.55], color: "light", mirror: true },
      { shape: "box", size: [0.12,0.5,0.12], pos: [0.55,1.1,-0.55], color: "light", mirror: true },
      { shape: "box", size: [0.6,0.15,0.6], pos: [0,0.8,-0.8], color: "hazard" },
    ],
  },
  // ion_cannon (224 triangles)
  ion_cannon: {
    parts: [
      { use: "chenille_l", pos: [1,0,0], mirror: true },
      { shape: "box", size: [1.7,0.45,2.5], pos: [0,0.55,0], color: "faction" },
      { shape: "wedge", size: [1.7,0.3,0.5], pos: [0,0.5,1.5], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.55, height: 0.2, pos: [0,0.95,-0.3], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.9,0.5,1.2], pos: [0,1.25,-0.3], color: "faction", parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.18, height: 2, pos: [0,1.3,1], color: "light", rot: [90,0,0], parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.3, height: 0.15, pos: [0,1.3,0.6], color: "glow", rot: [90,0,0], parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.3, height: 0.15, pos: [0,1.3,1.1], color: "glow", rot: [90,0,0], parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.26, height: 0.2, pos: [0,1.3,2], color: "dark", rot: [90,0,0], parent: "tourelle" },
      { shape: "sphere", radius: 0.15, pos: [0,1.65,-0.5], color: "glow", parent: "tourelle" },
    ],
  },
  // drone_launcher (216 triangles)
  drone_launcher: {
    parts: [
      { use: "chenille_l", pos: [1,0,0], mirror: true },
      { shape: "box", size: [1.7,0.45,2.6], pos: [0,0.55,0], color: "faction" },
      { shape: "wedge", size: [1.7,0.3,0.5], pos: [0,0.5,1.5], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.6, height: 0.2, pos: [0,0.95,-0.2], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [1.4,0.3,1.6], pos: [0,1.2,-0.2], color: "dark", parent: "tourelle" },
      { shape: "box", size: [0.4,0.3,0.4], pos: [0.4,1.5,0.2], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.4,0.3,0.4], pos: [0.4,1.5,-0.5], color: "light", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.15,0.08,0.15], pos: [0.4,1.7,0.2], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.15,0.08,0.15], pos: [0.4,1.7,-0.5], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [1.4,0.15,0.2], pos: [0,1.4,0.7], color: "faction", parent: "tourelle" },
    ],
  },
  // siege_walker (300 triangles)
  siege_walker: {
    parts: [
      { use: "jambe", pos: [0.9,0,0.9], scale: [1.6,1.3,1.6], mirror: true },
      { use: "jambe", pos: [0.9,0,-0.9], scale: [1.6,1.3,1.6], mirror: true },
      { shape: "box", size: [2.2,0.5,2.6], pos: [0,1.5,0], color: "metal" },
      { shape: "box", size: [1.8,0.8,2], pos: [0,2.1,-0.1], color: "faction" },
      { shape: "box", size: [1,0.4,0.9], pos: [0,2.6,-0.4], color: "glass" },
      { shape: "cylinder", sides: 6, radius: 0.6, height: 0.2, pos: [0,2.55,0.5], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.8,0.5,1], pos: [0,2.85,0.5], color: "dark", parent: "tourelle" },
      { use: "canon_lourd", pos: [0,2.85,1], scale: 1.2, parent: "tourelle" },
      { shape: "box", size: [0.5,0.2,0.6], pos: [0.6,2.6,-0.8], color: "hazard", mirror: true },
    ],
  },
  // shock_robot (212 triangles)
  shock_robot: {
    parts: [
      { shape: "box", size: [0.4,1.1,0.45], pos: [0.35,0.55,0], color: "metal", mirror: true },
      { shape: "box", size: [0.55,0.15,0.8], pos: [0.35,0.08,0.1], color: "dark", mirror: true },
      { shape: "box", size: [1.1,0.5,0.7], pos: [0,1.35,0], color: "dark" },
      { shape: "box", size: [1.5,1.1,0.9], pos: [0,2.15,0], color: "faction", pivot: "torse" },
      { shape: "sphere", radius: 0.3, pos: [0,2.2,0.5], color: "glow", parent: "torse" },
      { shape: "box", size: [0.6,0.35,0.5], pos: [0,2.9,0.1], color: "light", parent: "torse" },
      { shape: "box", size: [0.3,0.1,0.05], pos: [0,2.92,0.37], color: "glow", parent: "torse" },
      { shape: "box", size: [0.6,0.6,0.6], pos: [1.05,2.5,0], color: "light", mirror: true, parent: "torse" },
      { shape: "box", size: [0.4,1,0.4], pos: [1.05,1.8,0.1], color: "metal", mirror: true, parent: "torse" },
      { shape: "box", size: [0.6,0.5,0.6], pos: [1.05,1.15,0.2], color: "dark", mirror: true, parent: "torse" },
      { shape: "cone", sides: 6, radius: 0.2, height: 0.5, pos: [0.8,3,0], color: "hazard", mirror: true, parent: "torse" },
    ],
  },
  // heavy_artillery (288 triangles)
  heavy_artillery: {
    parts: [
      { use: "chenille", pos: [1.15,0,0], scale: [1.1,1,1.25], mirror: true },
      { shape: "box", size: [2,0.5,3], pos: [0,0.65,0], color: "faction" },
      { shape: "wedge", size: [2,0.3,0.6], pos: [0,0.6,1.8], color: "metal" },
      { shape: "box", size: [1.6,0.4,1.2], pos: [0,1.1,-1], color: "dark" },
      { shape: "cylinder", sides: 6, radius: 0.8, height: 0.25, pos: [0,1.15,0.1], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [1.2,0.6,1.4], pos: [0,1.55,0], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0,1.7,0.6], rot: [-18,0,0], scale: [1.5,1.5,2.2], parent: "tourelle" },
      { shape: "box", size: [0.5,0.25,0.5], pos: [0.4,1.95,-0.4], color: "hazard", parent: "tourelle" },
    ],
  },
  // scout_plane (144 triangles)
  scout_plane: {
    parts: [
      { shape: "box", size: [0.35,0.3,1.8], pos: [0,0.4,0], color: "faction" },
      { shape: "wedge", size: [0.35,0.2,0.8], pos: [0,0.4,1.3], color: "light" },
      { shape: "wedge", size: [2,0.08,1], pos: [1,0.38,-0.2], color: "faction", rot: [0,0,0], mirror: true },
      { shape: "box", size: [0.08,0.5,0.5], pos: [0,0.7,-0.8], color: "faction" },
      { shape: "box", size: [0.9,0.06,0.4], pos: [0.5,0.4,-0.9], color: "metal", mirror: true },
      { shape: "box", size: [0.2,0.12,0.3], pos: [0,0.6,0.4], color: "glass" },
      { use: "reacteur", pos: [0,0.4,-1.2], scale: 0.5 },
    ],
  },
  // interceptor (204 triangles)
  interceptor: {
    parts: [
      { shape: "box", size: [0.45,0.35,2.2], pos: [0,0.4,0], color: "faction" },
      { shape: "wedge", size: [0.45,0.25,1], pos: [0,0.4,1.5], color: "light" },
      { shape: "wedge", size: [1.6,0.08,1.6], pos: [1,0.38,-0.3], color: "faction", mirror: true },
      { shape: "box", size: [0.08,0.6,0.6], pos: [0.2,0.8,-0.9], color: "faction", rot: [0,0,-12], mirror: true },
      { shape: "box", size: [0.25,0.15,0.5], pos: [0,0.65,0.5], color: "glass" },
      { use: "reacteur", pos: [0.22,0.4,-1.4], scale: 0.45, mirror: true },
      { shape: "box", size: [0.06,0.06,0.6], pos: [1.5,0.35,0.2], color: "red", mirror: true },
    ],
  },
  // glider (108 triangles)
  glider: {
    parts: [
      { shape: "wedge", size: [3,0.12,1.8], pos: [0,0.4,-0.1], color: "faction", rot: [0,180,0] },
      { shape: "wedge", size: [3,0.12,0.8], pos: [0,0.4,0.8], color: "faction" },
      { shape: "box", size: [0.4,0.3,1.6], pos: [0,0.5,0], color: "dark" },
      { shape: "wedge", size: [0.3,0.2,0.8], pos: [0,0.45,1.1], color: "light" },
      { shape: "box", size: [0.25,0.12,0.4], pos: [0,0.7,0.3], color: "glass" },
      { shape: "box", size: [0.08,0.08,0.7], pos: [0.9,0.35,0.8], color: "dark", mirror: true },
      { shape: "box", size: [0.4,0.25,0.25], pos: [0.5,0.45,-0.7], color: "glow", mirror: true },
    ],
  },
  // transport (204 triangles)
  transport: {
    parts: [
      { shape: "box", size: [1.4,0.9,3.4], pos: [0,0.8,0], color: "faction" },
      { shape: "wedge", size: [1.4,0.6,1], pos: [0,0.7,2.2], color: "light" },
      { shape: "box", size: [1,0.3,0.5], pos: [0,1,1.5], color: "glass" },
      { shape: "box", size: [4.2,0.12,1], pos: [0,1.15,-0.2], color: "metal" },
      { shape: "box", size: [0.5,0.15,0.7], pos: [2.3,1.15,-0.2], color: "hazard", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.4, height: 0.5, pos: [1.6,1,-0.2], color: "dark", mirror: true },
      { use: "rotor", pos: [1.6,1.3,-0.2], scale: 0.45, pivot: "rotor1" },
      { use: "rotor", pos: [-1.6,1.3,-0.2], scale: 0.45, pivot: "rotor2" },
      { shape: "box", size: [0.12,0.9,0.9], pos: [0,1.5,-1.5], color: "faction" },
      { shape: "box", size: [2.2,0.08,0.6], pos: [0,1.3,-1.6], color: "metal" },
      { shape: "box", size: [1,0.1,1.2], pos: [0,0.35,-0.2], color: "dark" },
    ],
  },
  // gunship (212 triangles)
  gunship: {
    parts: [
      { shape: "box", size: [1.1,0.8,2.2], pos: [0,0.8,0.2], color: "faction" },
      { shape: "wedge", size: [1.1,0.5,0.9], pos: [0,0.75,1.65], color: "glass" },
      { shape: "box", size: [0.35,0.35,2], pos: [0,0.95,-1.7], color: "metal" },
      { shape: "box", size: [0.08,0.7,0.4], pos: [0,1.2,-2.6], color: "faction" },
      { shape: "box", size: [2.2,0.1,0.6], pos: [0,0.85,0.1], color: "metal" },
      { shape: "box", size: [0.35,0.3,0.9], pos: [1.2,0.8,0.5], color: "dark", mirror: true },
      { use: "canon", pos: [1.2,0.8,0.9], scale: 0.7, mirror: true },
      { shape: "box", size: [0.15,0.3,0.15], pos: [0,1.3,0], color: "dark" },
      { use: "rotor", pos: [0,1.5,0], scale: 1.5, pivot: "rotor" },
      { shape: "box", size: [0.8,0.08,1.4], pos: [0,0.35,0.4], color: "dark" },
    ],
  },
  // bomber (216 triangles)
  bomber: {
    parts: [
      { shape: "box", size: [0.6,0.5,3], pos: [0,0.5,0], color: "faction" },
      { shape: "wedge", size: [0.6,0.4,1.3], pos: [0,0.5,2.1], color: "light" },
      { shape: "wedge", size: [4.2,0.1,1.8], pos: [2.1,0.45,-0.2], color: "faction", mirror: true },
      { shape: "box", size: [0.4,0.4,0.8], pos: [0.9,0.35,0.1], color: "dark", mirror: true },
      { use: "reacteur", pos: [0.9,0.35,-0.6], scale: 0.6, mirror: true },
      { shape: "box", size: [0.1,0.8,0.8], pos: [0,0.95,-1.3], color: "faction" },
      { shape: "box", size: [1.6,0.08,0.6], pos: [0,0.6,-1.4], color: "metal" },
      { shape: "box", size: [0.3,0.2,0.6], pos: [0,0.85,0.7], color: "glass" },
      { shape: "box", size: [0.4,0.15,1], pos: [0,0.2,0], color: "hazard" },
    ],
  },
  // asf (228 triangles)
  asf: {
    parts: [
      { shape: "box", size: [0.5,0.35,2.6], pos: [0,0.4,0], color: "faction" },
      { shape: "wedge", size: [0.5,0.25,1.3], pos: [0,0.4,1.9], color: "light" },
      { shape: "wedge", size: [2.4,0.08,1.4], pos: [1.3,0.38,-0.3], color: "faction", mirror: true },
      { shape: "wedge", size: [0.8,0.06,0.8], pos: [0.5,0.45,1], color: "metal", mirror: true },
      { shape: "box", size: [0.08,0.7,0.7], pos: [0.4,0.8,-1.1], color: "faction", rot: [0,0,-15], mirror: true },
      { shape: "box", size: [0.3,0.15,0.6], pos: [0,0.65,0.6], color: "glass" },
      { use: "reacteur", pos: [0.25,0.4,-1.6], scale: 0.5, mirror: true },
      { shape: "box", size: [0.06,0.06,0.8], pos: [1.9,0.35,-0.2], color: "glow", mirror: true },
    ],
  },
  // strat_bomber (324 triangles)
  strat_bomber: {
    parts: [
      { shape: "wedge", size: [7,0.2,3.2], pos: [0,0.5,-0.3], color: "faction", rot: [0,180,0] },
      { shape: "wedge", size: [7,0.2,1.6], pos: [0,0.5,1.3], color: "faction" },
      { shape: "box", size: [1,0.6,3.6], pos: [0,0.65,0.3], color: "dark" },
      { shape: "wedge", size: [0.8,0.4,1.4], pos: [0,0.6,2.7], color: "light" },
      { shape: "box", size: [0.5,0.25,0.8], pos: [0,1,1.2], color: "glass" },
      { shape: "box", size: [0.6,0.5,1], pos: [1.5,0.45,-0.2], color: "metal", mirror: true },
      { shape: "box", size: [0.6,0.5,1], pos: [2.8,0.45,-0.4], color: "metal", mirror: true },
      { use: "reacteur", pos: [1.5,0.45,-0.9], scale: 0.7, mirror: true },
      { use: "reacteur", pos: [2.8,0.45,-1.1], scale: 0.7, mirror: true },
      { shape: "box", size: [1.2,0.25,1.8], pos: [0,0.25,0.2], color: "hazard" },
      { shape: "box", size: [0.1,0.9,0.9], pos: [0,1.2,-1.4], color: "faction" },
    ],
  },
  // frigate (248 triangles)
  frigate: {
    parts: [
      { use: "coque", pos: [0,0,0], scale: [1.4,1,1.15] },
      { shape: "box", size: [0.9,0.5,0.9], pos: [0,0.85,-0.6], color: "light" },
      { shape: "box", size: [0.6,0.25,0.5], pos: [0,1.2,-0.6], color: "glass" },
      { shape: "cylinder", sides: 6, radius: 0.45, height: 0.2, pos: [0,0.62,1.2], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.6,0.3,0.6], pos: [0,0.85,1.2], color: "faction", parent: "tourelle" },
      { use: "canon", pos: [0,0.88,1.35], scale: 0.8, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.35, height: 0.2, pos: [0,0.62,-1.9], color: "metal", pivot: "tourelle2" },
      { shape: "box", size: [0.5,0.25,0.5], pos: [0,0.82,-1.9], color: "faction", parent: "tourelle2" },
      { use: "antenne", pos: [0,1.3,-0.8], scale: 0.7 },
    ],
  },
  // submarine (124 triangles)
  submarine: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 0.5, height: 3.4, pos: [0,0.4,0], color: "faction", rot: [90,0,0] },
      { shape: "cone", sides: 8, radius: 0.5, height: 0.7, pos: [0,0.4,2], color: "dark", rot: [90,0,0] },
      { shape: "cone", sides: 8, radius: 0.5, height: 0.6, pos: [0,0.4,-2], color: "dark", rot: [-90,0,0] },
      { shape: "box", size: [0.4,0.5,1], pos: [0,0.9,0.2], color: "metal" },
      { shape: "box", size: [0.08,0.4,0.08], pos: [0,1.3,0.3], color: "light" },
      { shape: "box", size: [1.7,0.08,0.5], pos: [0,0.4,-1.5], color: "dark" },
      { shape: "box", size: [0.08,0.7,0.4], pos: [0,0.55,-1.5], color: "dark" },
      { shape: "box", size: [0.3,0.1,0.1], pos: [0,0.95,0.72], color: "glow" },
    ],
  },
  // destroyer (336 triangles)
  destroyer: {
    parts: [
      { use: "coque", pos: [0,0,0], scale: [1.8,1.1,1.65] },
      { shape: "box", size: [1.2,0.7,1.4], pos: [0,0.95,-0.9], color: "light" },
      { shape: "box", size: [0.8,0.3,0.7], pos: [0,1.45,-0.9], color: "glass" },
      { shape: "cylinder", sides: 6, radius: 0.6, height: 0.2, pos: [0,0.65,1.9], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.8,0.35,0.9], pos: [0,0.9,1.9], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0,0.95,2.1], scale: 0.6, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.5, height: 0.2, pos: [0,0.65,0.5], color: "metal", pivot: "tourelle2" },
      { shape: "box", size: [0.7,0.3,0.8], pos: [0,0.85,0.5], color: "faction", parent: "tourelle2" },
      { use: "canon_lourd", pos: [0,0.9,0.7], scale: 0.5, parent: "tourelle2" },
      { shape: "cylinder", sides: 6, radius: 0.45, height: 0.2, pos: [0,0.65,-3], color: "metal" },
      { shape: "box", size: [0.12,0.5,0.12], pos: [0,1.9,-0.9], color: "light" },
      { shape: "box", size: [0.7,0.1,0.3], pos: [0,1.7,-0.9], color: "hazard" },
    ],
  },
  // missile_cruiser (336 triangles)
  missile_cruiser: {
    parts: [
      { use: "coque", pos: [0,0,0], scale: [1.9,1.1,1.8] },
      { shape: "box", size: [1.2,0.8,1.2], pos: [0,1,-0.2], color: "light" },
      { shape: "box", size: [0.8,0.3,0.6], pos: [0,1.55,-0.1], color: "glass" },
      { shape: "box", size: [1.2,0.3,1.2], pos: [0,0.7,2], color: "dark" },
      { shape: "box", size: [0.2,0.1,0.2], pos: [0.35,0.87,2.4], color: "glow", mirror: true },
      { shape: "box", size: [0.2,0.1,0.2], pos: [0.35,0.87,1.7], color: "glow", mirror: true },
      { shape: "box", size: [1.2,0.3,1], pos: [0,0.7,-1.9], color: "dark" },
      { shape: "box", size: [0.2,0.1,0.2], pos: [0.35,0.87,-1.6], color: "red", mirror: true },
      { shape: "box", size: [0.2,0.1,0.2], pos: [0.35,0.87,-2.2], color: "red", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.1, pos: [0,1.8,-0.2], color: "light", radiusTop: 0.1, pivot: "radar" },
      { shape: "box", size: [0.1,0.4,0.1], pos: [0,1.7,-0.2], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.4, height: 0.2, pos: [0,0.65,0.9], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [0.5,0.25,0.5], pos: [0,0.85,0.9], color: "faction", parent: "tourelle" },
      { use: "canon", pos: [0,0.88,1], scale: 0.7, parent: "tourelle" },
    ],
  },
  // spider (512 triangles)
  spider: {
    parts: [
      { shape: "box", size: [2.4,0.7,3], pos: [0,1.9,0], color: "dark" },
      { shape: "box", size: [2,0.6,2.4], pos: [0,2.5,0], color: "faction" },
      { use: "patte", pos: [1.2,1.5,1.1], scale: 1.2, rot: [0,25,0], mirror: true },
      { use: "patte", pos: [1.2,1.5,0.35], scale: 1.2, rot: [0,8,0], mirror: true },
      { use: "patte", pos: [1.2,1.5,-0.4], scale: 1.2, rot: [0,-8,0], mirror: true },
      { use: "patte", pos: [1.2,1.5,-1.1], scale: 1.2, rot: [0,-25,0], mirror: true },
      { shape: "box", size: [1.4,0.5,1.4], pos: [0,3.05,-0.2], color: "metal" },
      { shape: "cylinder", sides: 6, radius: 0.7, height: 0.3, pos: [0,3.35,0.2], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [1,0.5,1.2], pos: [0,3.7,0.2], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0.3,3.7,0.7], scale: 1.1, mirror: true, parent: "tourelle" },
      { shape: "sphere", radius: 0.25, pos: [0,3.2,1.45], color: "glow" },
      { shape: "box", size: [0.5,0.2,0.7], pos: [0,2.9,-1.4], color: "hazard" },
    ],
  },
  // colossus (332 triangles)
  colossus: {
    parts: [
      { shape: "box", size: [0.9,1.7,1], pos: [0.8,0.85,0], color: "metal", mirror: true },
      { shape: "box", size: [1.3,0.3,1.6], pos: [0.8,0.15,0.2], color: "dark", mirror: true },
      { shape: "box", size: [0.6,0.6,0.8], pos: [0.8,1.75,0], color: "faction", mirror: true },
      { shape: "box", size: [2.6,0.8,1.4], pos: [0,2.2,0], color: "dark" },
      { shape: "box", size: [3,1.4,1.6], pos: [0,3.2,0], color: "faction", pivot: "torse" },
      { shape: "box", size: [0.9,0.7,0.8], pos: [0,4.2,0.2], color: "light", parent: "torse" },
      { shape: "box", size: [0.6,0.15,0.1], pos: [0,4.25,0.62], color: "glow", parent: "torse" },
      { shape: "box", size: [1,1,1], pos: [2,3.6,0], color: "metal", mirror: true, parent: "torse" },
      { shape: "box", size: [0.7,1.6,0.7], pos: [2,2.6,0.2], color: "dark", mirror: true, parent: "torse" },
      { use: "canon_lourd", pos: [2,2.4,1], scale: 1.3, mirror: true, parent: "torse" },
      { shape: "sphere", radius: 0.4, pos: [0,3.3,0.9], color: "glow", parent: "torse" },
      { shape: "cone", sides: 6, radius: 0.3, height: 0.8, pos: [1.3,4.2,0], color: "hazard", mirror: true, parent: "torse" },
    ],
  },
  // fortress (424 triangles)
  fortress: {
    parts: [
      { shape: "box", size: [1,1.2,1], pos: [1.7,1,1.4], color: "metal", mirror: true },
      { shape: "box", size: [1,1.2,1], pos: [1.7,1,-1.4], color: "metal", mirror: true },
      { shape: "box", size: [1.6,0.3,1.8], pos: [1.7,0.15,1.5], color: "dark", mirror: true },
      { shape: "box", size: [1.6,0.3,1.8], pos: [1.7,0.15,-1.5], color: "dark", mirror: true },
      { shape: "box", size: [4.2,0.6,4.6], pos: [0,1.9,0], color: "dark" },
      { shape: "box", size: [3.6,1,4], pos: [0,2.6,0], color: "faction" },
      { shape: "box", size: [2,0.8,1.6], pos: [0,3.5,-1], color: "light" },
      { shape: "box", size: [1.2,0.3,0.8], pos: [0,4,-1], color: "glass" },
      { shape: "cylinder", sides: 6, radius: 0.9, height: 0.25, pos: [0,3.2,1.2], color: "metal", pivot: "tourelle" },
      { shape: "box", size: [1.4,0.7,1.6], pos: [0,3.65,1.2], color: "faction", parent: "tourelle" },
      { use: "canon_lourd", pos: [0.4,3.7,1.9], scale: 1.5, mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 6, radius: 0.45, height: 0.2, pos: [1.4,3.2,-0.6], color: "metal", mirror: true, pivot: "tourelle2" },
      { shape: "box", size: [0.6,0.4,0.7], pos: [1.4,3.5,-0.6], color: "faction", parent: "tourelle2" },
      { use: "canon", pos: [1.4,3.55,-0.3], parent: "tourelle2" },
      { shape: "box", size: [0.5,0.5,0.5], pos: [1.4,3.3,-1.7], color: "hazard", mirror: true },
    ],
  },
  // mothership (344 triangles)
  mothership: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 4, height: 0.6, pos: [0,0.8,0], color: "faction", radiusTop: 3.2 },
      { shape: "cylinder", sides: 8, radius: 4.3, height: 0.3, pos: [0,0.5,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 2.6, height: 0.5, pos: [0,1.3,0], color: "metal", radiusTop: 1.8 },
      { shape: "sphere", radius: 1.2, pos: [0,1.9,0], color: "glass" },
      { shape: "box", size: [0.8,0.2,1.4], pos: [0,0.55,4], color: "glow" },
      { shape: "box", size: [1.2,0.35,2], pos: [0,0.65,-4.2], color: "metal" },
      { shape: "box", size: [0.8,0.2,0.5], pos: [3.2,1.2,0.8], color: "glow", mirror: true },
      { shape: "box", size: [0.8,0.2,0.5], pos: [3.2,1.2,-0.8], color: "glow", mirror: true },
      { shape: "box", size: [0.8,0.5,0.8], pos: [2.3,1.45,2], color: "light", mirror: true },
      { shape: "box", size: [0.8,0.5,0.8], pos: [2.3,1.45,-2], color: "light", mirror: true },
      { shape: "box", size: [0.8,0.5,0.8], pos: [0,1.45,3], color: "light" },
      { use: "reacteur", pos: [1.2,0.8,-4.6], scale: 1.2, mirror: true },
    ],
  },
  // hyper_cruiser (312 triangles)
  hyper_cruiser: {
    parts: [
      { shape: "box", size: [1.6,0.8,6], pos: [0,0.9,0], color: "faction" },
      { shape: "wedge", size: [1.6,0.7,2.6], pos: [0,0.85,4.3], color: "light" },
      { shape: "box", size: [0.8,0.5,2.4], pos: [0,1.5,-0.8], color: "metal" },
      { shape: "box", size: [0.5,0.2,0.8], pos: [0,1.9,-0.8], color: "glass" },
      { shape: "wedge", size: [2.4,0.2,2], pos: [1.9,0.8,-1.5], color: "dark", mirror: true },
      { shape: "box", size: [0.4,0.4,2.6], pos: [2.4,0.9,-1.4], color: "metal", mirror: true },
      { shape: "box", size: [0.15,0.4,0.15], pos: [0.9,1.45,1], color: "glow", mirror: true },
      { shape: "box", size: [0.15,0.4,0.15], pos: [0.9,1.45,2], color: "glow", mirror: true },
      { shape: "box", size: [2.2,0.12,0.2], pos: [0,0.5,2], color: "glow" },
      { use: "reacteur", pos: [0.5,0.9,-3.3], scale: 1, mirror: true },
      { use: "reacteur", pos: [0,1.2,-3.3], scale: 0.7 },
      { shape: "box", size: [0.3,0.2,0.7], pos: [0,1.4,2.2], color: "hazard" },
    ],
  },
};
