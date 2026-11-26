// Listes partagées par l'interface et les raccourcis clavier : catégories du menu de construction
// et unités proposées par une usine (même ordre à l'écran et au clavier).
import type { GameData } from "@supreme/shared";

/** [nom, icône, clés des bâtiments] ; l'onglet n (1..7) et le bâtiment n (1..9) au clavier. */
export const BUILD_CATS: [string, string, string[]][] = [
  ["Production", "production", ["extractor", "furnace", "assembler1", "assembler2", "assembler3", "refinery", "chemical", "lab", "depot"]],
  ["Logistique", "logistics", ["belt1", "belt2", "belt3", "inserter", "long_inserter", "splitter", "sorter", "overflow"]],
  ["Transport", "unload", ["warehouse", "logistic_relay", "rail", "station", "cargo_pad", "roboport", "gift_portal"]],
  ["Énergie", "energy", ["main_generator", "generator", "pylon", "hydro_plant", "crystal_reactor", "geothermal", "eppz_socket"]],
  ["Usines", "factory", ["land_factory", "air_factory", "naval_factory", "gantry"]],
  ["Défense", "defense", ["radar", "wall", "light_turret", "aa_turret", "heavy_turret", "fixed_artillery", "shield_gen", "antimissile"]],
  ["Spécial", "special", ["transfer", "gate", "area_shield", "missile_silo", "beacon", "orbital"]],
];

/** Menu de construction de la Souche : organes posés sur le terreau de ses racines. */
export const SOUCHE_CATS: [string, string, string[]][] = [
  ["Réseau", "production", ["root", "rhizome", "seed_heart", "leaves", "taproot", "bulb", "burrow"]],
  ["Organes", "factory", ["matrix", "maw", "spawnery", "cocoon"]],
  ["Défense", "defense", ["thorn", "bramble", "sporangium", "bloom"]],
];

/** Catégories du menu de construction selon la race (les Transhumants ne construisent pas : ils déploient leurs chenillards). */
export function buildCats(race: number): [string, string, string[]][] {
  return race === 1 ? SOUCHE_CATS : race === 2 ? [] : BUILD_CATS;
}

/** Types d'unités produits par une usine (indice dans data.units), dans l'ordre du panneau : ceux de la race de l'usine. */
export function factoryUnitKinds(data: GameData, factory: number, race = 0): number[] {
  const out: number[] = [];
  data.units.forEach((u, i) => {
    if (u.factory === factory && (u.race ?? 0) === race) out.push(i);
  });
  return out;
}
