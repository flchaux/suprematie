// Statistiques de partie côté interface : qui a le droit de voir quoi, courbes affichées, résumés.
import type { PlayerStats, StatSample } from "@supreme/shared";
import { ui } from "../game/state.svelte.ts";
import { PLAYER_COLORS } from "../models/generator.ts";

export const playerColor = (i: number): string => "#" + PLAYER_COLORS[i % 8].toString(16).padStart(6, "0");

/** Tout est visible pour un spectateur, en replay et une fois la partie finie. */
export function seesAll(): boolean {
  return ui.spectator || ui.replay || ui.ended || ui.gameOver !== null || ui.me < 0;
}

/** Joueurs visibles : pendant la partie, un joueur ne voit que son équipe (brouillard de guerre). */
export function visiblePlayers(): number[] {
  const all = ui.players.map((_, i) => i);
  if (seesAll()) return all;
  const team = ui.players[ui.me]?.team;
  return all.filter((i) => i === ui.me || (team !== undefined && ui.players[i].team === team));
}

/** Relevés à afficher : en replay, seulement ceux déjà atteints par la lecture (sauf à la fin). */
export function shownSamples(): StatSample[] {
  if (ui.replay && !ui.gameOver) return ui.stats.filter((s) => s.tick <= ui.tick);
  return ui.stats;
}

export interface Metric {
  key: string;
  title: string;
  unit?: string;
  value: (p: PlayerStats) => number;
  /** seconde série en pointillés (énergie consommée) */
  value2?: (p: PlayerStats) => number;
  legend2?: [string, string];
}

export const METRICS: Metric[] = [
  { key: "army", title: "Armée", unit: "unités de combat", value: (p) => p.army },
  { key: "armyValue", title: "Valeur de l'armée", unit: "matière", value: (p) => p.armyValue },
  { key: "ore", title: "Minerai extrait", unit: "cumulé", value: (p) => p.ore },
  { key: "power", title: "Énergie", unit: "kW", value: (p) => p.powerProd, value2: (p) => p.powerUse, legend2: ["produite", "consommée"] },
  { key: "research", title: "Recherches", unit: "technologies", value: (p) => p.research },
  { key: "kills", title: "Destructions", unit: "cumulées", value: (p) => p.kills },
];

/** Nombre compact : 1 234 → « 1,2 k ». */
export function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(".", ",") + " M";
  if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(".", ",") + " k";
  return String(Math.round(v));
}

/** Durée de jeu à partir d'un nombre de ticks (20 par seconde). */
export function duration(ticks: number): string {
  const s = Math.floor(ticks / 20);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min ${ss} s`;
}

export interface PlayerSummary {
  maxArmy: number;
  maxArmyValue: number;
  ore: number;
  research: number;
  maxBuildings: number;
  kills: number;
  losses: number;
}

/** Résumé de fin de partie d'un joueur à partir de l'historique (null s'il n'y a aucun relevé). */
export function summarize(samples: StatSample[], i: number): PlayerSummary | null {
  let out: PlayerSummary | null = null;
  for (const s of samples) {
    const p = s.players[i];
    if (!p) continue;
    out ??= { maxArmy: 0, maxArmyValue: 0, ore: 0, research: 0, maxBuildings: 0, kills: 0, losses: 0 };
    out.maxArmy = Math.max(out.maxArmy, p.army);
    out.maxArmyValue = Math.max(out.maxArmyValue, p.armyValue);
    out.maxBuildings = Math.max(out.maxBuildings, p.buildings);
    out.ore = p.ore;
    out.research = p.research;
    out.kills = p.kills;
    out.losses = p.losses;
  }
  return out;
}
