// Panneau de recherche : onglets, état de chaque recherche, ce qu'elle débloque, arbre des mutations de la
// Souche. Fonctions pures, sans état de l'interface : les composants (ui/Research.svelte, ResearchCard.svelte,
// MutationTree.svelte) leur passent les données de la partie et ce que le joueur a acquis.
import type { GameData } from "@supreme/shared";
import { RACE_SOUCHE } from "@supreme/shared";

/** Ce que le joueur a : recherches acquises, recherche en cours (0 : aucune), file d'attente. */
export interface ResearchState {
  has: (tech: number) => boolean;
  current: number;
  queue: number[];
}

/** Unités, bâtiments et améliorations (Transhumants) dont cette recherche est la condition. */
export interface Unlocks {
  units: number[];
  buildings: number[];
  mods: number[];
}

export function techUnlocks(d: GameData, tech: number): Unlocks {
  const out: Unlocks = { units: [], buildings: [], mods: [] };
  if (tech <= 0) return out;
  d.units.forEach((u, i) => {
    if (u.tech === tech) out.units.push(i);
  });
  d.buildings.forEach((b, i) => {
    if (b.tech === tech) out.buildings.push(i);
  });
  (d.mods ?? []).forEach((m, i) => {
    if (i > 0 && m.tech === tech) out.mods.push(i);
  });
  return out;
}

/** Mutation de la Souche : recherche à choix exclusif. */
export const isMutation = (d: GameData, tech: number): boolean => (d.techs[tech]?.excl ?? 0) > 0;

/** Recherches d'une race (la recherche 0, « aucune », n'en fait pas partie). */
export function raceTechs(d: GameData, race: number): number[] {
  const out: number[] = [];
  d.techs.forEach((t, i) => {
    if (i > 0 && (t.race ?? 0) === race) out.push(i);
  });
  return out;
}

/** Recherche interdite par un choix exclusif déjà fait, en cours ou prévu. */
export function barred(d: GameData, s: ResearchState, tech: number): boolean {
  const x = d.techs[tech].excl ?? 0;
  return x > 0 && (s.has(x) || s.current === x || s.queue.includes(x));
}

/** Prérequis acquis : d'une paire de mutations exclusives, l'une des deux suffit. */
export function met(d: GameData, s: ResearchState, prereq: number): boolean {
  const x = d.techs[prereq].excl ?? 0;
  return s.has(prereq) || (x > 0 && s.has(x));
}

export type TechStatus = "done" | "current" | "queued" | "barred" | "available" | "locked";

export function techStatus(d: GameData, s: ResearchState, tech: number): TechStatus {
  if (s.has(tech)) return "done";
  if (s.current === tech) return "current";
  if (s.queue.includes(tech)) return "queued";
  if (barred(d, s, tech)) return "barred";
  return d.techs[tech].prereq.every((p) => met(d, s, p)) ? "available" : "locked";
}

/** Prérequis en clair : « Écailles ou Sève vive » pour une paire de mutations exclusives ; avec `tiers`, le
 * palier de chaque prérequis est ajouté (il est dans un autre onglet). */
export function prereqText(d: GameData, prereq: number[], tiers = false): string {
  const tier = (p: number) => (tiers ? ` (palier ${d.techs[p].tier})` : "");
  return prereq
    .filter((p) => !(d.techs[p].excl && prereq.includes(d.techs[p].excl) && d.techs[p].excl < p))
    .map((p) => (d.techs[p].excl ? `${d.techs[p].name} ou ${d.techs[d.techs[p].excl].name}` : d.techs[p].name + tier(p)))
    .join(", ");
}

/** Un onglet du panneau : un palier, ou pour la Souche les mutations d'un côté et le reste de l'autre. */
export interface ResearchTab {
  id: string;
  label: string;
  /** palier de l'onglet ; 0 : l'onglet réunit plusieurs paliers */
  tier: number;
  kind: "tier" | "mutations" | "research";
  techs: number[];
}

/**
 * Onglets d'une race. Industriels et Transhumants : un onglet par palier. Souche : « Mutations » (les choix
 * exclusifs et les recherches qui en dépendent directement, la forme finale) et « Recherche » (tout le reste).
 */
export function researchTabs(d: GameData, race: number): ResearchTab[] {
  const mine = raceTechs(d, race);
  if (race === RACE_SOUCHE) {
    const tree = mutationTree(d, race);
    const inTree = new Set<number>([...tree.chains.flatMap((c) => c.stages.flatMap((st) => [...st.pair, ...st.finals]))]);
    return [
      { id: "mutations", label: "Mutations", tier: 0, kind: "mutations", techs: mine.filter((i) => inTree.has(i)) },
      { id: "recherche", label: "Recherche", tier: 0, kind: "research", techs: mine.filter((i) => !inTree.has(i)) },
    ];
  }
  const tiers = [...new Set(mine.map((i) => d.techs[i].tier))].sort((a, b) => a - b);
  return tiers.map((tier) => ({ id: `p${tier}`, label: `Palier ${tier}`, tier, kind: "tier" as const, techs: mine.filter((i) => d.techs[i].tier === tier) }));
}

/** Onglet à l'ouverture : celui de la recherche en cours, sinon de la première en file, sinon le premier où
 * une recherche est possible, sinon le premier. */
export function defaultTab(d: GameData, s: ResearchState, tabs: ResearchTab[]): string {
  const holding = (t: number) => tabs.find((tab) => tab.techs.includes(t));
  const busy = (s.current > 0 && holding(s.current)) || s.queue.map(holding).find((t) => t);
  if (busy) return busy.id;
  const open = tabs.find((tab) => tab.techs.some((i) => techStatus(d, s, i) === "available"));
  return (open ?? tabs[0])?.id ?? "";
}

/** Un stade de l'arbre des mutations : deux mutations qui s'excluent. */
export interface MutationStage {
  /** les deux mutations, la plus petite référence à gauche */
  pair: [number, number];
  tier: number;
  /** recherches ordinaires exigées avant ce stade (ex. Ronces pour le gène des racines) */
  needs: number[];
  /** recherches ordinaires que ce stade ouvre, l'une ou l'autre mutation acquise (ex. Métamorphose) */
  finals: number[];
}
/** Une lignée : des stades qui s'enchaînent, chacun exigeant une mutation du précédent. */
export interface MutationChain {
  stages: MutationStage[];
}
export interface MutationTree {
  /** la lignée la plus longue d'abord (le tronc), puis les gènes isolés */
  chains: MutationChain[];
}

export function mutationTree(d: GameData, race: number): MutationTree {
  const mine = raceTechs(d, race);
  const stages: MutationStage[] = [];
  const stageOf = new Map<number, MutationStage>();
  for (const i of mine) {
    const x = d.techs[i].excl ?? 0;
    if (x <= i) continue; // la paire est créée par sa plus petite référence
    const st: MutationStage = { pair: [i, x], tier: d.techs[i].tier, needs: [], finals: [] };
    stages.push(st);
    stageOf.set(i, st);
    stageOf.set(x, st);
  }
  const parent = new Map<MutationStage, MutationStage>();
  for (const st of stages) {
    for (const p of new Set([...d.techs[st.pair[0]].prereq, ...d.techs[st.pair[1]].prereq])) {
      const up = stageOf.get(p);
      if (up && up !== st) parent.set(st, up);
      else if (!up) st.needs.push(p);
    }
  }
  // recherches ordinaires qui exigent une mutation : rattachées au stade de cette mutation
  for (const i of mine) {
    if (stageOf.has(i)) continue;
    const up = d.techs[i].prereq.map((p) => stageOf.get(p)).find((st) => st);
    if (up) up.finals.push(i);
  }
  const chains: MutationChain[] = [];
  for (const root of stages.filter((st) => !parent.has(st))) {
    const chain: MutationStage[] = [];
    let at: MutationStage | undefined = root;
    while (at) {
      chain.push(at);
      const cur: MutationStage = at;
      at = stages.find((st) => parent.get(st) === cur && !chain.includes(st));
    }
    chains.push({ stages: chain });
  }
  chains.sort((a, b) => b.stages.length - a.stages.length || a.stages[0].tier - b.stages[0].tier);
  return { chains };
}

/** Effet d'une mutation, sans l'étiquette « Mutation : » ni la mention de ce qu'elle exclut (l'arbre le montre). */
export function mutationEffect(desc: string): string {
  return desc
    .replace(/^Mutation\s*:\s*/i, "")
    .replace(/\s*Exclut [^.]*\.?\s*$/i, "")
    .replace(/\.$/, "");
}

/**
 * Le chiffre à mettre en avant pour une mutation, tiré de sa description : « +30 % », « −40 % », « ×2 », « 1/3 ».
 * null quand la description n'en donne pas (l'arbre affiche alors une icône).
 */
export function mutationFigure(desc: string): string | null {
  const text = mutationEffect(desc);
  if (/\bdoublée?s?\b/i.test(text)) return "×2";
  if (/\bun tiers\b/i.test(text)) return "1/3";
  const m = /([+\-−])?\s?(\d+(?:[.,]\d+)?)\s?%/.exec(text);
  if (!m) return null;
  const after = text.slice(m.index);
  const sign = m[1] ? (m[1] === "+" ? "+" : "−") : /en moins|plus lents?\b|de moins/i.test(after) ? "−" : /plus rapides?\b|en plus|de plus/i.test(after) ? "+" : "";
  return `${sign}${m[2]} %`;
}

/** Le génome du joueur : mutations acquises, celles auxquelles il a renoncé, nids greffés permis. */
export interface Genome {
  acquired: number[];
  renounced: number[];
  /** stades (paires) où une mutation est acquise, sur le nombre de stades */
  stages: number;
  total: number;
  /** nids de la faune greffés au plus : un, plus un par mutation acquise (souche::den_limit) */
  dens: number;
}

export function genome(d: GameData, s: ResearchState, race: number): Genome {
  const tree = mutationTree(d, race);
  const all = tree.chains.flatMap((c) => c.stages);
  const acquired = all.flatMap((st) => st.pair.filter((i) => s.has(i)));
  const renounced = all.flatMap((st) => st.pair.filter((i) => !s.has(i) && s.has(d.techs[i].excl)));
  return { acquired, renounced, stages: all.filter((st) => st.pair.some((i) => s.has(i))).length, total: all.length, dens: 1 + acquired.length };
}
