// Personnalités des bots : listes de builders et priorités (plans de modules, recherches, armée, attaques).

export interface Persona {
  name: string;
  /** Ouverture : builders à lancer dans l'ordre ("iron", "copper", "slot"). */
  opening: string[];
  /** Plan du premier module (ordre le long du tapis principal, de la tête vers le dépôt). */
  plan0: string[];
  /** Plan des modules suivants (cycliques). */
  planN: string[][];
  /** Recherches dans l'ordre de préférence. */
  research: string[];
  /** Poids de composition de l'armée (clé d'unité -> poids). */
  army: Record<string, number>;
  engineers: number;
  maxEngineers: number;
  turrets: number;
  firstAttack: number;
  attackGrow: number;
  maxAttack: number;
  /** Délai minimal (ticks) avant la première attaque. */
  attackDelay: number;
  /** Modules supplémentaires autorisés. */
  modules: number;
  /** Tick à partir duquel un second module peut être lancé. */
  moduleDelay: number;
  /** Bonus de priorité des builders de recherche (labos, lots). */
  techBias: number;
  /** Bonus de priorité des défenses. */
  defenseBias: number;
}

const MIN = 1200;

// Le fer et le cuivre sont fondus sur place (extracteur -> fonderie -> tapis) : le plan ne contient
// que les fonderies d'acier et de plaquettes, les assembleurs, les laboratoires et les usines.
const CORE = ["A:cable", "A:circuit", "A:gear", "A:pack1", "lab", "factory:land_factory", "A:pack1", "lab"];
const OPENING = ["iron", "iron", "copper", "slot", "slot", "slot", "iron", "slot", "copper", "slot", "slot", "iron", "slot", "copper"];

const ARMY_MODULE = ["A:cable", "A:circuit", "F:steel", "A:gear", "factory:land_factory", "F:steel", "A:cable", "A:circuit", "A:ammo", "A:engine", "factory:land_factory"];

const TECH_MODULE = ["A:cable", "A:circuit", "F:wafer", "F:steel", "F:steel", "R:fuel", "C:composite", "A:processor", "A:gear", "A:pack1", "A:arm_part", "A:pack2", "A:ammo", "A:pack3", "A:pack4", "lab", "lab"];

export const PERSONAS: Record<string, Persona> = {
  adaptive: {
    name: "adaptive",
    opening: OPENING,
    plan0: [...CORE, "F:steel", "A:arm_part", "A:pack2", "lab", "A:ammo", "F:steel", "A:pack3", "A:engine", "A:gear", "factory:land_factory"],
    planN: [ARMY_MODULE, TECH_MODULE],
    research: ["land_prod", "light_defense", "automation", "mobile_artillery", "assault", "heavy_turret", "electronics", "aa_turret", "engineer3", "hydrocarbons", "chemistry", "shields", "siege_walker", "cmd_shield"],
    army: { line_robot: 5, light_tank: 2, artillery: 1.5, assault_walker: 2, siege_walker: 1.5, ion_cannon: 0.5 },
    engineers: 3,
    maxEngineers: 7,
    turrets: 4,
    firstAttack: 16,
    attackGrow: 6,
    maxAttack: 60,
    attackDelay: 9 * MIN,
    modules: 2,
    moduleDelay: 10 * MIN,
    techBias: 0,
    defenseBias: 0,
  },
  rush: {
    name: "rush",
    opening: ["iron", "iron", "copper", "slot", "slot", "slot", "iron", "slot", "slot", "copper", "slot", "iron"],
    plan0: ["A:cable", "A:circuit", "A:gear", "A:pack1", "lab", "factory:land_factory", "F:steel", "factory:land_factory", "A:pack1", "A:arm_part", "A:pack2", "lab", "A:ammo", "A:pack3", "A:engine"],
    planN: [ARMY_MODULE],
    research: ["land_prod", "automation", "light_defense", "mobile_artillery", "assault", "electronics", "heavy_turret"],
    army: { line_robot: 6, moto: 1, light_tank: 2, artillery: 1, assault_walker: 2 },
    engineers: 2,
    maxEngineers: 5,
    turrets: 1,
    firstAttack: 8,
    attackGrow: 4,
    maxAttack: 40,
    attackDelay: 5 * MIN,
    modules: 2,
    moduleDelay: 8 * MIN,
    techBias: -50,
    defenseBias: -100,
  },
  turtle: {
    name: "turtle",
    opening: OPENING,
    plan0: [...CORE, "F:steel", "A:arm_part", "A:pack2", "lab", "A:ammo", "F:steel", "A:pack3", "A:engine", "A:gear", "factory:land_factory"],
    planN: [ARMY_MODULE, TECH_MODULE],
    research: ["land_prod", "light_defense", "automation", "heavy_turret", "mobile_artillery", "aa_turret", "assault", "electronics", "engineer3", "hydrocarbons", "chemistry", "shields", "fixed_artillery", "siege_walker", "cmd_shield"],
    army: { line_robot: 4, light_tank: 2, artillery: 2, assault_walker: 2, siege_walker: 2 },
    engineers: 3,
    maxEngineers: 8,
    turrets: 10,
    firstAttack: 40,
    attackGrow: 10,
    maxAttack: 90,
    attackDelay: 18 * MIN,
    modules: 2,
    moduleDelay: 12 * MIN,
    techBias: 20,
    defenseBias: 150,
  },
  tech: {
    name: "tech",
    opening: OPENING,
    plan0: ["A:cable", "A:circuit", "A:gear", "A:pack1", "lab", "A:pack1", "lab", "factory:land_factory", "F:steel", "A:arm_part", "A:pack2", "lab", "A:ammo", "F:steel", "A:pack3", "lab", "A:engine", "A:gear"],
    planN: [TECH_MODULE, ARMY_MODULE],
    research: ["land_prod", "automation", "light_defense", "mobile_artillery", "electronics", "hydrocarbons", "assault", "chemistry", "engineer3", "heavy_turret", "crystal_refining", "shields", "siege_walker", "ions", "drones", "cmd_shield", "shock", "heavy_artillery", "cmd_cannon", "logistics2", "aa_turret", "strategic", "area_shield", "experimental", "colossus", "spider"],
    army: { line_robot: 3, light_tank: 2, artillery: 2, assault_walker: 2, siege_walker: 3, ion_cannon: 1, drone_launcher: 1, shock_robot: 3, heavy_artillery: 1 },
    engineers: 3,
    maxEngineers: 8,
    turrets: 5,
    firstAttack: 30,
    attackGrow: 8,
    maxAttack: 80,
    attackDelay: 15 * MIN,
    modules: 3,
    moduleDelay: 9 * MIN,
    techBias: 100,
    defenseBias: 30,
  },
};
