// Types des données de jeu exportées par la simulation (data_json).

export interface ItemDef { key: string; name: string; color: number }
export interface RecipeDef { key: string; crafter: number; inputs: [number, number][]; output: [number, number]; time: number; tech: number }
export interface WeaponDef { dmg: number; range: number; cooldown: number; proj: number; aoe: number; mask: number; salvo: number; /** rayon prolongé : durée en ticks, dégâts infligés à chaque tick (0 : tir ordinaire) */ sustain: number; /** portée minimale (cases) */ minRange?: number }
export interface TechDef {
  key: string; name: string; tier: number; count: number; time: number; prereq: number[]; desc: string;
  /** race qui peut la rechercher ; choix exclusif (Souche) : recherche qu'elle interdit (0 : aucune) */
  race: number; excl: number;
}
/** Race jouable (voir docs/spec/races.md). */
export interface RaceDef { key: string; name: string; desc: string }
export const RACE_INDUS = 0;
export const RACE_SOUCHE = 1;
export const RACE_TRANSH = 2;
export interface BuildingDef {
  key: string; name: string; w: number; h: number; hp: number; powerUse: number; powerProd: number; cost: [number, number][];
  build: number; tech: number; cls: number; speed: number; crafter: number; factory: number; weapon: number; supply: number;
  connect: number; radar: number; shieldR: number; deposit: number; water: boolean; passable: boolean; reach: number;
  /** tapis collecteur de surplus */
  collect?: boolean;
  /** race qui le pose */
  race: number;
}
export interface UnitDef {
  key: string; name: string; layer: number; hp: number; speed: number; radius: number; weapons: number[]; vision: number; radar: number;
  cost: [number, number][]; build: number; tech: number; factory: number; buildPower: number; carry: number; drones: number; supply: number; hold: number; shieldR: number; tier: number; altitude: number;
  /** race qui la produit ; unité de commandement ; organisme vivant (Souche) */
  race: number; commander: boolean; bio: boolean;
  /** chenillard des Transhumants : bâtiment qu'il devient une fois déployé (-1 : aucun) */
  deploys: number;
  /** organisme de la Souche : taille de la portée pondue par la couveuse pour une entrée de file (0 : une unité à la fois) */
  litter: number;
  /** œuf de la Souche : unité immobile qui éclot en un organisme (voir sim/src/ponte.rs) */
  egg: boolean;
  /** tourelle déployée par une Arche des Transhumants : elle ne reçoit pas d'ordres (voir sim/src/ameliorations.rs) */
  turret: boolean;
}
/** Amélioration des Transhumants (voir sim/src/ameliorations.rs) : `host` : unité qui la porte (pour un module, son
 * chenillard) ; `slot` : emplacement ; `rank`, `base` : palier et palier précédent exigé (0 : aucun) ; le coût compte
 * les relevés ; `time` en secondes. */
export interface ModDef {
  key: string; name: string; desc: string; icon: string; host: number; slot: number; rank: number; base: number; tech: number;
  cost: [number, number][]; time: number;
  /** arme donnée : [rang de l'arme remplacée, arme (-1 : aucune)] ; radar donné (cases, 0 : aucun) */
  weapon: [number, number]; radar: number;
}
/** Fiche des améliorations d'une unité ou d'un module : installées (par emplacement), en cours (ticks restants, total),
 * disponible à portée pour payer (relevés compris), état de l'Arche. */
export interface ModInfo { host: number; mods: number[]; job: number; left: number; total: number; reach: number[]; ark: ArkInfo | null }
/** État d'une Arche : tourelles [type, type voulu, état, ticks, PV ‰, déployée, unité], file de l'atelier embarqué… */
export interface ArkInfo {
  turrets: [number, number, number, number, number, number, number][];
  out: boolean; hold: boolean; queue: [number, number][]; prog: number; paid: boolean; boost: number; boostReady: number;
  shieldR: number; shieldMax: number; dock: boolean; cap: number;
}
/** États d'une tourelle d'Arche (comme TU_* dans ameliorations.rs). */
export const TU = { ABOARD: 0, OUT: 1, RETURN: 2, LOST: 3, CONVERT: 4 } as const;
export interface GameData {
  races: RaceDef[];
  items: ItemDef[]; recipes: RecipeDef[]; weapons: WeaponDef[]; techs: TechDef[]; buildings: BuildingDef[]; units: UnitDef[];
  /** améliorations des Transhumants (indice 0 : rien), emplacements de l'Arche et des autres, types de tourelles (indices d'unités) */
  mods: ModDef[]; arkSlots: { key: string; name: string; icon: string }[]; oneSlot: { key: string; name: string; icon: string }; turretKinds: number[];
  missileCost: [number, number][]; interceptorCost: [number, number][];
  /** niveaux d'un extracteur : vitesse et consommation en % du niveau 0, coût et recherche du passage à ce niveau */
  /** combustible des générateurs : énergie par unité (kW × ticks) et taille du réservoir (unités) */
  fuel?: { hydrocarbon: number; refined: number; cell: number; tankUnits: number };
  /** dépôts : plafond par objet et par niveau, amélioration, filtres de sortie ; drones de ravitaillement
   * (objets par voyage, vitesse), drones et rayon des usines, rayon « à portée » (paiements immédiats, affichage) */
  depot?: { cap: number[]; upgradeCost: [number, number][]; upgradeTech: number; upgradeTime: number; maxFilters: number; droneCap: number; droneSpeed: number; factoryDrones: number; factorySupply: number; near: number; relayRange: number; relayLink: number; relayDrones: number };
  extractorLevels?: { speed: number; power: number; cost: [number, number][]; tech: number; /** durée de l'amélioration vers ce niveau (s) */ time?: number }[];
  /** niveaux de la fonderie (amélioration sur place) : vitesse et énergie en %, coût, recherche, durée (s) */
  furnaceLevels?: { speed: number; power: number; cost: [number, number][]; tech: number; time: number }[];
  /** améliorations des assembleurs sur place : [type actuel, type visé, durée (s)] ; coût et recherche du type visé */
  /** niveaux du générateur : production (kW), coût, recherche et durée (s) de passage à ce niveau */
  generatorLevels?: { prod: number; cost: [number, number][]; tech: number; time: number }[];
  /** niveaux du générateur principal : rayon de zone et portée de liaison (cases), coût, recherche et durée (s) ; il reste en service pendant le chantier */
  mainGeneratorLevels?: { supply: number; connect: number; cost: [number, number][]; tech: number; time: number }[];
  assemblerUpgrades?: [number, number, number][];
  /** véhicules de transport : 0 train, 1 drone de fret (speed : sous-unités par tick) */
  carriers: { capacity: number; speed: number; buffer: number; cost: [number, number][] }[];
}

export const BClass = {
  Extractor: 0, Belt: 1, Inserter: 2, Crafter: 3, Lab: 4, Depot: 5, Power: 6, Pylon: 7, Factory: 8, Radar: 9, Wall: 10,
  Turret: 11, Shield: 12, Transfer: 13, Gate: 14, Silo: 15, AntiMissile: 16, Beacon: 17, Orbital: 18,
  Warehouse: 19, Rail: 20, Station: 21, CargoPad: 22, Router: 23, Portal: 24, Roboport: 25, Nest: 26, Ruin: 27, Organ: 28, Relay: 29,
} as const;
/** Bâtiments qu'on peut mettre en pause (ordre SET_PAUSE) : extracteurs, fabricants, usines d'unités (comme buildings::pausable). */
export function pausableClass(cls: number): boolean {
  return cls === BClass.Extractor || cls === BClass.Crafter || cls === BClass.Factory;
}
/** Objets des races : sève et sels (réserve des réseaux de la Souche), ADN (recherche de la Souche), relevés (recherche des Transhumants). */
export const SEVE = 27;
export const SELS = 28;
export const ADN = 29;
export const RELEVES = 30;
/** Équipe de la faune (joueur caché, toujours le dernier de la liste des joueurs ; voir sim/src/nature.rs). */
export const NATURE_TEAM = 8;
/** Couleur des bêtes et des nids de la faune (brun de terre, distinct des 8 couleurs de joueur). */
export const NATURE_COLOR = 0x8f6a4a;
/** Bâtiments qui reçoivent des objets (tapis, bras, transfert direct) : leurs modèles portent des trappes. */
export const RECEIVER_CLASSES: ReadonlySet<number> = new Set<number>([BClass.Crafter, BClass.Lab, BClass.Depot, BClass.Factory, BClass.Silo, BClass.AntiMissile, BClass.Warehouse, BClass.Station, BClass.CargoPad, BClass.Power]);
export const Layer = { Land: 0, Hover: 1, Naval: 2, Sub: 3, Air: 4 } as const;
export const Factory = { None: 0, Land: 1, Air: 2, Naval: 3, Exp: 4 } as const;
export const RECIPE_NONE = 255;
export const PACK1 = 21;
/** objets brûlés par les générateurs (identifiants de sim/src/data.rs) */
export const HYDROCARBON = 4;
export const FUEL_ITEM = 16;
export const ENERGY_CELL = 19;
export const BUILD_FULL = 65536;
/** dernière ressource brute (minerai de fer 1 … cristal 5) */
export const LAST_RAW = 5;

/**
 * Récolte du commandant : recette de fonderie qui fond la ressource brute `raw` (son unique ingrédient),
 * ou -1 (hydrocarbure, cristal : pas de recette de fonderie). Même règle que `smelt_recipe` (sim/src/data.rs).
 */
export function smeltRecipe(data: GameData, raw: number): number {
  if (raw <= 0 || raw > LAST_RAW) return -1;
  return data.recipes.findIndex((r) => r.crafter === 0 && r.inputs.length === 1 && r.inputs[0][0] === raw);
}
/** Durée d'un cycle de récolte du commandant (ticks) : 2 fois la recette de fonderie (sim : units::HARVEST_SLOWDOWN). */
export const HARVEST_SLOWDOWN = 2;

export function keyIndex<T extends { key: string }>(list: T[]): Record<string, number> {
  const m: Record<string, number> = {};
  list.forEach((d, i) => (m[d.key] = i));
  return m;
}
