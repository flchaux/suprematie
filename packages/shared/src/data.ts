// Types des données de jeu exportées par la simulation (data_json).

export interface ItemDef { key: string; name: string; color: number }
export interface RecipeDef { key: string; crafter: number; inputs: [number, number][]; output: [number, number]; time: number; tech: number }
export interface WeaponDef { dmg: number; range: number; cooldown: number; proj: number; aoe: number; mask: number; salvo: number; /** rayon prolongé : durée en ticks, dégâts infligés à chaque tick (0 : tir ordinaire) */ sustain: number }
export interface TechDef { key: string; name: string; tier: number; count: number; time: number; prereq: number[]; desc: string }
export interface BuildingDef {
  key: string; name: string; w: number; h: number; hp: number; powerUse: number; powerProd: number; cost: [number, number][];
  build: number; tech: number; cls: number; speed: number; crafter: number; factory: number; weapon: number; supply: number;
  connect: number; radar: number; shieldR: number; deposit: number; water: boolean; passable: boolean; reach: number;
  /** tapis collecteur de surplus */
  collect?: boolean;
}
export interface UnitDef {
  key: string; name: string; layer: number; hp: number; speed: number; radius: number; weapons: number[]; vision: number; radar: number;
  cost: [number, number][]; build: number; tech: number; factory: number; buildPower: number; carry: number; shieldR: number; tier: number; altitude: number;
}
export interface GameData {
  items: ItemDef[]; recipes: RecipeDef[]; weapons: WeaponDef[]; techs: TechDef[]; buildings: BuildingDef[]; units: UnitDef[];
  missileCost: [number, number][]; interceptorCost: [number, number][];
  /** niveaux d'un extracteur : vitesse et consommation en % du niveau 0, coût et recherche du passage à ce niveau */
  /** combustible des générateurs : énergie par unité (kW × ticks) et taille du réservoir (unités) */
  fuel?: { hydrocarbon: number; refined: number; cell: number; tankUnits: number };
  /** dépôts : réserve de base, capacité par niveau, amélioration (sorties filtrées) */
  depot?: { base: number; cap: number[]; upgradeCost: [number, number][]; upgradeTech: number; upgradeTime: number; maxFilters: number };
  extractorLevels?: { speed: number; power: number; cost: [number, number][]; tech: number; /** durée de l'amélioration vers ce niveau (s) */ time?: number }[];
  /** améliorations des assembleurs sur place : [type actuel, type visé, durée (s)] ; coût et recherche du type visé */
  /** niveaux du générateur : production (kW), coût, recherche et durée (s) de passage à ce niveau */
  generatorLevels?: { prod: number; cost: [number, number][]; tech: number; time: number }[];
  assemblerUpgrades?: [number, number, number][];
  /** véhicules de transport : 0 train, 1 drone de fret (speed : sous-unités par tick) */
  carriers: { capacity: number; speed: number; buffer: number; cost: [number, number][] }[];
}

export const BClass = {
  Extractor: 0, Belt: 1, Inserter: 2, Crafter: 3, Lab: 4, Depot: 5, Power: 6, Pylon: 7, Factory: 8, Radar: 9, Wall: 10,
  Turret: 11, Shield: 12, Transfer: 13, Gate: 14, Silo: 15, AntiMissile: 16, Beacon: 17, Orbital: 18,
  Warehouse: 19, Rail: 20, Station: 21, CargoPad: 22, Router: 23, Portal: 24, Roboport: 25,
} as const;
export const Layer = { Land: 0, Hover: 1, Naval: 2, Sub: 3, Air: 4 } as const;
export const Factory = { None: 0, Land: 1, Air: 2, Naval: 3, Exp: 4 } as const;
export const RECIPE_NONE = 255;
export const PACK1 = 21;
/** objets brûlés par les générateurs (identifiants de sim/src/data.rs) */
export const HYDROCARBON = 4;
export const FUEL_ITEM = 16;
export const ENERGY_CELL = 19;
export const BUILD_FULL = 65536;

export function keyIndex<T extends { key: string }>(list: T[]): Record<string, number> {
  const m: Record<string, number> = {};
  list.forEach((d, i) => (m[d.key] = i));
  return m;
}
