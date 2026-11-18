// Listes partagées par l'interface et les raccourcis clavier : catégories du menu de construction
// et unités proposées par une usine (même ordre à l'écran et au clavier).
import type { GameData } from "@supreme/shared";

/** [nom, icône, clés des bâtiments] ; l'onglet n (1..7) et le bâtiment n (1..9) au clavier. */
export const BUILD_CATS: [string, string, string[]][] = [
  ["Production", "production", ["extractor", "furnace", "assembler1", "assembler2", "assembler3", "refinery", "chemical", "lab", "depot"]],
  ["Logistique", "logistics", ["belt1", "belt2", "belt3", "inserter", "long_inserter", "splitter", "sorter", "overflow", "collector", "pylon"]],
  ["Transport", "unload", ["warehouse", "rail", "station", "cargo_pad", "roboport", "gift_portal"]],
  ["Énergie", "energy", ["generator", "hydro_plant", "crystal_reactor"]],
  ["Usines", "factory", ["land_factory", "air_factory", "naval_factory", "gantry"]],
  ["Défense", "defense", ["radar", "wall", "light_turret", "aa_turret", "heavy_turret", "fixed_artillery", "shield_gen", "antimissile"]],
  ["Spécial", "special", ["transfer", "gate", "area_shield", "missile_silo", "beacon", "orbital"]],
];

/** Types d'unités produits par une usine (indice dans data.units), dans l'ordre du panneau. */
export function factoryUnitKinds(data: GameData, factory: number): number[] {
  const out: number[] = [];
  data.units.forEach((u, i) => {
    if (u.factory === factory) out.push(i);
  });
  return out;
}
