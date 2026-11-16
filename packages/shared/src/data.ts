// Types des données de jeu exportées par la simulation (data_json).

export interface ItemDef { key: string; name: string; color: number }
export interface RecipeDef { key: string; crafter: number; inputs: [number, number][]; output: [number, number]; time: number; tech: number }
export interface WeaponDef { dmg: number; range: number; cooldown: number; proj: number; aoe: number; mask: number; salvo: number }
export interface TechDef { key: string; name: string; tier: number; count: number; time: number; prereq: number[]; desc: string }
export interface BuildingDef {
  key: string; name: string; w: number; h: number; hp: number; powerUse: number; powerProd: number; cost: [number, number][];
  build: number; tech: number; cls: number; speed: number; crafter: number; factory: number; weapon: number; supply: number;
  connect: number; radar: number; shieldR: number; deposit: number; water: boolean; passable: boolean;
}
export interface UnitDef {
  key: string; name: string; layer: number; hp: number; speed: number; radius: number; weapons: number[]; vision: number; radar: number;
  cost: [number, number][]; build: number; tech: number; factory: number; buildPower: number; carry: number; shieldR: number; tier: number; altitude: number;
}
export interface GameData {
  items: ItemDef[]; recipes: RecipeDef[]; weapons: WeaponDef[]; techs: TechDef[]; buildings: BuildingDef[]; units: UnitDef[];
  missileCost: [number, number][]; interceptorCost: [number, number][];
}

export const BClass = {
  Extractor: 0, Belt: 1, Inserter: 2, Crafter: 3, Lab: 4, Depot: 5, Power: 6, Pylon: 7, Factory: 8, Radar: 9, Wall: 10,
  Turret: 11, Shield: 12, Transfer: 13, Gate: 14, Silo: 15, AntiMissile: 16, Beacon: 17, Orbital: 18,
} as const;
export const Layer = { Land: 0, Hover: 1, Naval: 2, Sub: 3, Air: 4 } as const;
export const Factory = { None: 0, Land: 1, Air: 2, Naval: 3, Exp: 4 } as const;
export const RECIPE_NONE = 255;
export const PACK1 = 21;
export const BUILD_FULL = 65536;

export function keyIndex<T extends { key: string }>(list: T[]): Record<string, number> {
  const m: Record<string, number> = {};
  list.forEach((d, i) => (m[d.key] = i));
  return m;
}
