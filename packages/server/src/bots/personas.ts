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
  /** Taille d'un groupe aérien avant son premier raid. */
  airAttack: number;
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

// Le fer et le cuivre sont fondus sur place (extracteur -> fonderie -> tapis). Chaque module a un
// rôle : le tapis principal ne supporte qu'un trafic modéré (un bras ne pose un objet que dans un trou
// d'une demi-case), donc les cellules (alimentées par bras) et la production pour le stock
// (assembleurs « sushi » qui déposent sur le tapis) sont séparées.
// - principal : science palier 1 et robots, plus un peu d'engrenages et de circuits pour le stock ;
// - technologie : lots 2 et 3 sur le tapis, laboratoires en aval ;
// - aviation : acier, circuits, carburant et munitions pour les planeurs ;
// - armée : cellules de robots.
// Un même objet ne doit jamais arriver à la fois par le tapis et par un bras de cellule : le bras du
// tapis pourrait le prendre puis rester bloqué (la cible n'en veut plus) et affamer le bâtiment.
// Les modules à cellules n'ont donc pas d'assembleurs « sushi » d'engrenages ou de circuits.
const MAIN = ["cell:science", "cell:robot"];
const MAIN_RUSH = ["cell:science", "cell:robot", "cell:robot"];
const OPENING = ["iron", "iron", "copper", "slot", "iron", "copper", "slot", "iron"];

export const TECH_PLAN: string[] = ["cell:circuits", "A:gear", "cell:pack2", "cell:sciencebus", "cell:circuits", "cell:sciencebus", "F:steel", "A:ammo", "A:pack3", "F:steel", "A:engine"];
export const AIR_PLAN: string[] = ["cell:circuits", "F:steel", "R:fuel", "F:steel", "A:ammo", "F:steel", "factory:air_factory", "F:steel", "factory:air_factory"];
export const MAIN_AIR_PLAN: string[] = ["factory:air_factory", "cell:circuits", "F:steel", "R:fuel", "F:steel", "A:ammo", "F:steel", "F:steel"];
export const ARMY_PLAN: string[] = ["cell:robot", "cell:robot", "cell:robot"];
const TECH2_PLAN: string[] = ["cell:circuits", "F:wafer", "F:steel", "R:fuel", "C:composite", "A:processor", "A:pack4", "A:gear", "A:arm_part", "A:pack2", "A:ammo", "A:pack3", "cell:sciencebus"];

export const PERSONAS: Record<string, Persona> = {
  adaptive: {
    name: "adaptive",
    opening: OPENING,
    plan0: MAIN,
    planN: [TECH_PLAN, AIR_PLAN, ARMY_PLAN, AIR_PLAN, ARMY_PLAN],
    research: ["land_prod", "automation", "electronics", "hydrocarbons", "light_defense", "mobile_artillery", "aa_turret", "heavy_air", "assault", "heavy_turret", "engineer3", "chemistry", "shields", "siege_walker", "cmd_shield"],
    army: { line_robot: 5, light_tank: 2, artillery: 1.5, assault_walker: 2, guardian: 1.5, rocket_battery: 1, siege_walker: 1.5, ion_cannon: 0.5, glider: 3, gunship: 2 },
    engineers: 4,
    maxEngineers: 7,
    turrets: 4,
    firstAttack: 16,
    airAttack: 8,
    attackGrow: 6,
    maxAttack: 60,
    attackDelay: 9 * MIN,
    modules: 3,
    moduleDelay: 5 * MIN,
    techBias: 0,
    defenseBias: 0,
  },
  rush: {
    name: "rush",
    opening: OPENING,
    plan0: MAIN_RUSH,
    planN: [ARMY_PLAN, TECH_PLAN, AIR_PLAN, ARMY_PLAN, AIR_PLAN],
    research: ["land_prod", "automation", "electronics", "hydrocarbons", "light_defense", "mobile_artillery", "heavy_air", "assault", "heavy_turret"],
    army: { line_robot: 6, moto: 1, light_tank: 2, artillery: 1, assault_walker: 2, guardian: 1, glider: 3, gunship: 2 },
    engineers: 2,
    maxEngineers: 5,
    turrets: 1,
    firstAttack: 8,
    airAttack: 6,
    attackGrow: 4,
    maxAttack: 40,
    attackDelay: 5 * MIN,
    modules: 3,
    moduleDelay: 6 * MIN,
    techBias: -50,
    defenseBias: -100,
  },
  turtle: {
    name: "turtle",
    opening: OPENING,
    plan0: MAIN,
    planN: [TECH_PLAN, AIR_PLAN, ARMY_PLAN, AIR_PLAN],
    research: ["land_prod", "light_defense", "automation", "electronics", "hydrocarbons", "aa_turret", "mobile_artillery", "heavy_turret", "heavy_air", "assault", "engineer3", "chemistry", "shields", "fixed_artillery", "siege_walker", "cmd_shield"],
    army: { line_robot: 4, light_tank: 2, artillery: 2, assault_walker: 2, guardian: 2, rocket_battery: 1, deploy_turret: 1.5, siege_walker: 2, glider: 3, gunship: 2 },
    engineers: 4,
    maxEngineers: 8,
    turrets: 10,
    // 34 (et non 40) : avec la visée anticipée, les escarmouches coûtent plus d'unités
    firstAttack: 34,
    airAttack: 10,
    attackGrow: 10,
    maxAttack: 90,
    attackDelay: 18 * MIN,
    modules: 3,
    moduleDelay: 6 * MIN,
    techBias: 20,
    defenseBias: 150,
  },
  tech: {
    name: "tech",
    opening: OPENING,
    plan0: MAIN,
    planN: [TECH_PLAN, AIR_PLAN, TECH2_PLAN, ARMY_PLAN, AIR_PLAN],
    research: ["land_prod", "automation", "electronics", "hydrocarbons", "light_defense", "mobile_artillery", "assault", "chemistry", "engineer3", "heavy_turret", "crystal_refining", "shields", "siege_walker", "ions", "drones", "cmd_shield", "shock", "heavy_artillery", "cmd_cannon", "logistics2", "aa_turret", "strategic", "area_shield", "experimental", "colossus", "spider"],
    army: { line_robot: 3, light_tank: 2, artillery: 2, assault_walker: 2, rocket_battery: 1.5, siege_walker: 3, ion_cannon: 1, drone_launcher: 1, shock_robot: 3, heavy_artillery: 1, glider: 3, gunship: 2, stealth_bomber: 1 },
    engineers: 4,
    maxEngineers: 8,
    turrets: 5,
    firstAttack: 30,
    airAttack: 10,
    attackGrow: 8,
    maxAttack: 80,
    attackDelay: 15 * MIN,
    modules: 3,
    moduleDelay: 6 * MIN,
    techBias: 100,
    defenseBias: 30,
  },
};
