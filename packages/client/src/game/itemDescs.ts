// Descriptions des ressources (infobulle au survol) : d'où elles viennent, à quoi elles servent. Une entrée
// par clé d'objet (ITEMS dans sim/src/data.rs), sauf « none » ; un test vérifie qu'aucune ne manque. Les
// recettes et les usages chiffrés sont calculés d'après les données de la simulation.
import type { GameData } from "@supreme/shared";

export const ITEM_DESCS: Record<string, string> = {
  iron_ore: "Minerai brut, extrait d'un gisement de fer. Une fonderie en fait des plaques de fer, la base de presque tout.",
  copper_ore: "Minerai brut, extrait d'un gisement de cuivre. Une fonderie en fait des plaques de cuivre.",
  silicon: "Sable brut, extrait d'un gisement de silicium. Une fonderie en fait des plaquettes pour les processeurs.",
  hydrocarbon: "Pétrole brut, extrait d'un gisement sans électricité. Brûle dans les générateurs et les centrales ; une raffinerie en fait du carburant, cinq fois plus énergétique.",
  crystal: "Cristal brut, rare et placé dans les zones disputées. Une raffinerie le purifie en cristal raffiné.",
  iron_plate: "Plaque de base de l'industrie : bâtiments, tapis, engrenages, circuits et acier en consomment. À produire en premier et en quantité.",
  copper_plate: "Plaque conductrice : câbles, munitions, relais électriques et premiers lots de recherche.",
  steel: "Plaques de fer refondues, cinq pour une. Structure des usines, des blindages et de la plupart des unités.",
  wafer: "Silicium fondu en disque, support des processeurs.",
  gear: "Pièce mécanique : moteurs, bras, tapis rapides, chars, et premiers lots de recherche.",
  cable: "Fil de cuivre, dont les circuits consomment trois chacun.",
  circuit: "Électronique de base : machines, radars, tourelles, processeurs et lots de recherche du palier 2.",
  engine: "Propulsion des véhicules, des navires et des avions.",
  ammo: "Obus et cartouches : entrent dans la fabrication des unités armées, des grosses tourelles et des lots de recherche militaires. Les armes ne consomment pas de munitions en tirant.",
  processor: "Électronique avancée : unités lourdes, boucliers, silos, et lots de recherche des paliers 4 à 6.",
  fuel: "Hydrocarbure raffiné : fabrique les avions et le composite, et brûle cinq fois plus longtemps que l'hydrocarbure dans un générateur.",
  composite: "Matériau léger et résistant : bâtiments et unités avancés, lots de recherche des paliers 4 et 6.",
  refined_crystal: "Cristal purifié : cellules d'énergie, missiles stratégiques, équipements de fin de partie et lots du palier 5.",
  energy_cell: "Concentré d'énergie : combustible du réacteur à cristal, unités expérimentales et lots du palier 6.",
  arm_part: "Pièce de bras mécanique, destinée aux lots de recherche du palier 2.",
  pack1: "Lot de recherche du palier 1, consommé par les laboratoires. Il reste demandé par tous les paliers suivants.",
  pack2: "Lot de recherche du palier 2, consommé par les laboratoires avec ceux du palier 1.",
  pack3: "Lot de recherche du palier 3, consommé par les laboratoires avec ceux des paliers inférieurs.",
  pack4: "Lot de recherche du palier 4, consommé par les laboratoires avec ceux des paliers inférieurs.",
  pack5: "Lot de recherche du palier 5, consommé par les laboratoires avec ceux des paliers inférieurs.",
  pack6: "Lot de recherche du palier 6 (expérimentales, canon orbital), consommé par les laboratoires avec ceux des paliers inférieurs.",
  seve: "Nourriture de la Souche, gardée dans la réserve de chaque réseau de racines. Les frondaisons en produisent ; tout ce qui pousse ou pond en consomme.",
  sels: "Minéraux de la Souche, puisés par les racines-puits et gardés dans la réserve de chaque réseau de racines. Servent aux organes et aux organismes solides.",
  adn: "Savoir de la Souche, commun à tous ses réseaux. S'obtient en digérant ce qui meurt sur le terreau, ou par la Matrice à partir de sève ; paie les recherches.",
  releves: "Savoir des Transhumants, commun à tout le camp. S'obtient en explorant la carte et en détruisant des ennemis, ou lentement au laboratoire nomade ; paie les recherches et les améliorations.",
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
