// Statistiques de partie : relevés périodiques calculés sur la copie de référence du serveur.
// Ce code ne tourne que sur le serveur (hors simulation) : les nombres à virgule y sont permis,
// mais les valeurs envoyées sont arrondies à l'entier.
import { BClass, BUILD_FULL, hasTech } from "@supreme/shared";
import type { GameData, BotView, StatSample, PlayerStats } from "@supreme/shared";

/** Intervalle entre deux relevés (600 ticks = 30 s de jeu). */
export const STATS_EVERY = 600;

/**
 * « Valeur matière » de chaque objet : un minerai (objet qu'aucune recette ne produit) vaut 1,
 * un produit vaut la somme des valeurs de ses entrées divisée par la quantité produite.
 * Si plusieurs recettes donnent le même objet, la moins chère l'emporte ; une recette qui
 * dépend (même indirectement) de son propre produit est ignorée. L'objet 0 (« rien ») vaut 0.
 */
export function itemValues(data: GameData): number[] {
  const n = data.items.length;
  const byOutput: number[][] = Array.from({ length: n }, () => []);
  data.recipes.forEach((r, i) => {
    if (r.output[0] > 0 && r.output[0] < n && r.output[1] > 0) byOutput[r.output[0]].push(i);
  });
  const value: (number | undefined)[] = new Array(n);
  const visiting = new Uint8Array(n);
  const valueOf = (item: number): number | null => {
    if (item <= 0 || item >= n) return 0;
    const known = value[item];
    if (known !== undefined) return known;
    if (visiting[item]) return null; // boucle
    if (byOutput[item].length === 0) return (value[item] = 1); // minerai
    visiting[item] = 1;
    let best: number | null = null;
    for (const ri of byOutput[item]) {
      const r = data.recipes[ri];
      let sum = 0;
      let ok = true;
      for (const [it, q] of r.inputs) {
        const v = valueOf(it);
        if (v === null) {
          ok = false;
          break;
        }
        sum += v * q;
      }
      if (ok) {
        const v = sum / r.output[1];
        if (best === null || v < best) best = v;
      }
    }
    visiting[item] = 0;
    // toutes les recettes bouclent : l'objet est traité comme une matière première
    return (value[item] = best ?? 1);
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(valueOf(i) ?? 1);
  return out;
}

/** Objets bruts (minerais) : produits par aucune recette. */
export function oreItems(data: GameData): number[] {
  const made = new Set(data.recipes.map((r) => r.output[0]));
  const out: number[] = [];
  for (let i = 1; i < data.items.length; i++) if (!made.has(i)) out.push(i);
  return out;
}

/** Unité de combat : armée, ni commandant ni ingénieur (pas de capacité de construction). */
export function isCombatUnit(data: GameData, kind: number): boolean {
  const u = data.units[kind];
  return !!u && u.weapons.length > 0 && u.buildPower === 0;
}

export function costValue(cost: [number, number][], values: number[]): number {
  let s = 0;
  for (const [it, q] of cost) s += (values[it] ?? 0) * q;
  return s;
}

/** Bâtiments comptés : tous sauf la logistique de base (tapis et bras), trop nombreux pour être parlants. */
const NOT_COUNTED: number[] = [BClass.Belt, BClass.Inserter];

/** Données précalculées pour les relevés d'une partie. */
export class StatsCalc {
  readonly values: number[];
  readonly ores: number[];
  readonly unitValue: number[];
  readonly combat: boolean[];
  readonly counted: boolean[];
  readonly data: GameData;
  constructor(data: GameData) {
    this.data = data;
    this.values = itemValues(data);
    this.ores = oreItems(data);
    this.unitValue = data.units.map((u) => costValue(u.cost, this.values));
    this.combat = data.units.map((_, k) => isCombatUnit(data, k));
    this.counted = data.buildings.map((b) => !NOT_COUNTED.includes(b.cls));
  }

  /** Relevé de tous les joueurs à partir de l'état complet (botDump). */
  sample(view: BotView): StatSample {
    const np = view.players.length;
    const army = new Array<number>(np).fill(0);
    const armyValue = new Array<number>(np).fill(0);
    const buildings = new Array<number>(np).fill(0);
    for (const u of view.units) {
      if (u.owner >= np || !this.combat[u.kind]) continue;
      army[u.owner]++;
      armyValue[u.owner] += this.unitValue[u.kind];
    }
    for (const b of view.buildings) {
      if (b.owner < np && b.build >= BUILD_FULL && this.counted[b.kind]) buildings[b.owner]++;
    }
    const players: PlayerStats[] = view.players.map((p, i) => {
      let ore = 0;
      for (const it of this.ores) ore += p.produced[it] ?? 0;
      let research = 0;
      for (let t = 1; t < this.data.techs.length; t++) if (hasTech(p, t)) research++;
      return {
        alive: p.alive,
        units: p.unitCount,
        army: army[i],
        armyValue: Math.round(armyValue[i]),
        ore,
        powerProd: p.powerProd,
        powerUse: p.powerUse,
        research,
        buildings: buildings[i],
        kills: p.kills,
        losses: p.losses,
      };
    });
    return { tick: view.tick, players };
  }
}

/**
 * Ce qu'un spectateur ou un joueur a le droit de voir d'un relevé : pendant la partie, un joueur
 * ne voit que son équipe (les autres sont remplacés par null) ; un spectateur voit tout.
 */
export function visibleSample(s: StatSample, teams: number[], slot: number): StatSample {
  if (slot < 0 || teams[slot] === undefined) return s;
  const team = teams[slot];
  return { tick: s.tick, players: s.players.map((p, i) => (teams[i] === team ? p : null)) };
}
