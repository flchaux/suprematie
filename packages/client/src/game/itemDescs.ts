// Descriptions des ressources (infobulle au survol) : d'où elles viennent, à quoi elles servent. Une entrée
// par clé d'objet (ITEMS dans sim/src/data.rs), sauf « none » ; un test vérifie qu'aucune ne manque. Les
// recettes et les usages chiffrés sont calculés d'après les données de la simulation.
import type { GameData } from "@supreme/shared";

export const ITEM_DESCS: Record<string, string> = {
  iron_ore: "Se fond en plaques de fer.",
  copper_ore: "Se fond en plaques de cuivre.",
  silicon: "Se fond en plaquettes.",
  hydrocarbon: "Combustible extrait sans électricité ; se raffine en carburant.",
  crystal: "Rare, dans les zones disputées ; se raffine.",
  iron_plate: "La base de l'industrie.",
  copper_plate: "Plaque conductrice.",
  steel: "Structure des usines, blindages et unités.",
  wafer: "Support des processeurs.",
  gear: "Pièce mécanique.",
  cable: "Fil de cuivre.",
  circuit: "Électronique de base.",
  engine: "Propulsion des véhicules, navires et avions.",
  ammo: "Composant d'unités et de tourelles ; tirer n'en consomme pas.",
  processor: "Électronique avancée.",
  fuel: "Brûle cinq fois plus longtemps que l'hydrocarbure.",
  composite: "Matériau léger et résistant.",
  refined_crystal: "Cristal purifié, pour les équipements de fin de partie.",
  energy_cell: "Combustible du réacteur à cristal.",
  arm_part: "Pièce mécanique, pour les lots de recherche.",
  pack1: "Lot de recherche, demandé par tous les paliers.",
  pack2: "Lot de recherche du palier 2, demandé aussi par les suivants.",
  pack3: "Lot de recherche du palier 3, demandé aussi par les suivants.",
  pack4: "Lot de recherche du palier 4, demandé aussi par les suivants.",
  pack5: "Lot de recherche du palier 5, demandé aussi par les suivants.",
  pack6: "Lot de recherche du dernier palier.",
  seve: "Nourriture de la Souche, gardée par chaque réseau.",
  sels: "Minéraux de la Souche, puisés par les racines-puits.",
  adn: "Paie les recherches. Vient de ce qui meurt sur le terreau, ou de la Matrice.",
  releves: "Paient recherches et améliorations. S'obtiennent en explorant et en détruisant.",
};

const CRAFTERS = ["Fonderie", "Assembleur", "Raffinerie", "Usine chimique"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const MAX_USES = 6;

/** Recette d'un objet en une ligne, ou vide s'il n'est pas fabriqué. */
export function itemRecipe(d: GameData, id: number): string {
  const r = d.recipes.find((x) => x.output[0] === id);
  if (!r) return "";
  const ins = r.inputs.map(([i, n]) => `${n} × ${d.items[i].name.toLowerCase()}`).join(" + ");
  return `${CRAFTERS[r.crafter] ?? "Machine"} : ${ins} → ${r.output[1]} en ${(r.time / 20).toLocaleString("fr-FR")} s`;
}

/** Ce qu'un objet sert à fabriquer pour une race : produits, puis nombre de bâtiments et d'unités qui en coûtent. */
export function itemUses(d: GameData, id: number, race: number): string {
  const made = d.recipes.filter((r) => r.inputs.some(([i]) => i === id)).map((r) => d.items[r.output[0]].name.toLowerCase());
  const parts: string[] = [];
  if (made.length) parts.push(made.slice(0, MAX_USES).join(", ") + (made.length > MAX_USES ? "…" : ""));
  const costs = (l: { race: number; cost: [number, number][] }[]) => l.filter((x) => x.race === race && x.cost.some(([i, n]) => i === id && n > 0)).length;
  const b = costs(d.buildings);
  const u = costs(d.units);
  const s = (n: number) => (n > 1 ? "s" : "");
  if (b) parts.push(`${b} bâtiment${s(b)}`);
  if (u) parts.push(`${u} unité${s(u)}`);
  return parts.join(" · ");
}

/** Contenu HTML de l'infobulle d'un objet ; `named` : avec son nom en titre. */
export function itemTip(d: GameData, id: number, race: number, named = true): string {
  const it = d.items[id];
  const desc = it && ITEM_DESCS[it.key];
  if (!desc) return "";
  const r = itemRecipe(d, id);
  const u = itemUses(d, id, race);
  return (
    (named ? `<b>${esc(it.name)}</b><br />` : "") +
    esc(desc) +
    (r ? `<br /><span class="dim">${esc(r)}</span>` : "") +
    (u ? `<br /><span class="dim">Sert à : ${esc(u)}</span>` : "")
  );
}
