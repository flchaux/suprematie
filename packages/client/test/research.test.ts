// Panneau de recherche : onglets par race, arbre des mutations de la Souche, ce qu'une recherche débloque,
// état d'une recherche. Les tests tiennent à la structure des données, pas aux valeurs d'équilibrage.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, RACE_INDUS, RACE_SOUCHE, RACE_TRANSH } from "@supreme/shared";
import type { GameData } from "@supreme/shared";
import { researchTabs, defaultTab, mutationTree, techUnlocks, techStatus, prereqText, raceTechs, isMutation, mutationFigure, mutationEffect, genome, recipeOfRace, type ResearchState } from "../src/game/research.ts";

let d: GameData;
const tech = (key: string): number => d.techs.findIndex((t) => t.key === key);
const state = (has: string[] = [], current = "", queue: string[] = []): ResearchState => {
  const set = new Set(has.map(tech));
  return { has: (t) => t === 0 || set.has(t), current: current ? tech(current) : 0, queue: queue.map(tech) };
};

beforeAll(async () => {
  const sim = await Sim.load(readFileSync(new URL("../public/sim.wasm", import.meta.url)));
  d = JSON.parse(sim.dataJson()) as GameData;
});

describe("onglets du panneau de recherche", () => {
  it("Industriels et Transhumants : un onglet par palier, chaque recherche dans un seul onglet", () => {
    for (const race of [RACE_INDUS, RACE_TRANSH]) {
      const tabs = researchTabs(d, race);
      const tiers = [...new Set(raceTechs(d, race).map((i) => d.techs[i].tier))].sort((a, b) => a - b);
      expect(tabs.map((t) => t.tier)).toEqual(tiers);
      expect(tabs.every((t) => t.kind === "tier" && t.techs.every((i) => d.techs[i].tier === t.tier))).toBe(true);
      expect(tabs.flatMap((t) => t.techs).sort((a, b) => a - b)).toEqual(raceTechs(d, race));
    }
    expect(researchTabs(d, RACE_INDUS).length).toBe(6);
  });

  it("Souche : un onglet Mutations et un onglet Recherche, qui se partagent toutes ses recherches", () => {
    const tabs = researchTabs(d, RACE_SOUCHE);
    expect(tabs.map((t) => t.id)).toEqual(["mutations", "recherche"]);
    expect([...tabs[0].techs, ...tabs[1].techs].sort((a, b) => a - b)).toEqual(raceTechs(d, RACE_SOUCHE));
    // toutes les mutations sont dans le premier, avec la recherche qui en dépend (Métamorphose) ; aucune dans le second
    expect(raceTechs(d, RACE_SOUCHE).filter((i) => isMutation(d, i)).every((i) => tabs[0].techs.includes(i))).toBe(true);
    expect(tabs[0].techs).toContain(tech("s_behemoth"));
    expect(tabs[1].techs.some((i) => isMutation(d, i))).toBe(false);
    expect(tabs[1].techs).toContain(tech("s_spitters"));
  });

  it("onglet d'ouverture : la recherche en cours, sinon la file, sinon le premier où l'on peut chercher", () => {
    const indus = researchTabs(d, RACE_INDUS);
    const first = indus[0].techs[0];
    const later = indus[2].techs[0];
    expect(defaultTab(d, state(), indus)).toBe("p1");
    expect(defaultTab(d, { has: (t) => t === 0, current: later, queue: [first] }, indus)).toBe("p3");
    expect(defaultTab(d, { has: (t) => t === 0, current: 0, queue: [later] }, indus)).toBe("p3");
    expect(defaultTab(d, state(), researchTabs(d, RACE_SOUCHE))).toBe("mutations");
    expect(defaultTab(d, state([], "s_spitters"), researchTabs(d, RACE_SOUCHE))).toBe("recherche");
  });
});

describe("arbre des mutations", () => {
  it("chaque mutation y est une fois, par paires qui s'excluent l'une l'autre", () => {
    const tree = mutationTree(d, RACE_SOUCHE);
    const stages = tree.chains.flatMap((c) => c.stages);
    const all = stages.flatMap((st) => st.pair);
    expect([...all].sort((a, b) => a - b)).toEqual(raceTechs(d, RACE_SOUCHE).filter((i) => isMutation(d, i)));
    for (const st of stages) {
      expect(d.techs[st.pair[0]].excl).toBe(st.pair[1]);
      expect(d.techs[st.pair[1]].excl).toBe(st.pair[0]);
      expect(d.techs[st.pair[0]].tier).toBe(d.techs[st.pair[1]].tier);
    }
  });

  it("le tronc enchaîne les stades : chacun exige une mutation du précédent, et le dernier ouvre la forme finale", () => {
    const tree = mutationTree(d, RACE_SOUCHE);
    const trunk = tree.chains[0].stages;
    expect(trunk.length).toBeGreaterThan(1);
    expect(tree.chains.every((c) => c.stages.length <= trunk.length)).toBe(true);
    expect(trunk[0].pair).toContain(tech("s_scales"));
    expect(trunk[0].needs).toEqual([]);
    for (let k = 1; k < trunk.length; k++) {
      expect(trunk[k].tier).toBeGreaterThan(trunk[k - 1].tier);
      for (const m of trunk[k].pair) expect(d.techs[m].prereq.some((p) => trunk[k - 1].pair.includes(p))).toBe(true);
    }
    expect(trunk[trunk.length - 1].finals).toEqual([tech("s_behemoth")]);
  });

  it("le gène des racines est à part : il demande une recherche ordinaire, pas une mutation", () => {
    const side = mutationTree(d, RACE_SOUCHE).chains.slice(1);
    expect(side.length).toBe(1);
    expect(side[0].stages[0].pair).toContain(tech("s_sticky"));
    expect(side[0].stages[0].needs).toEqual([tech("s_brambles")]);
  });

  it("les autres races n'ont pas de mutation", () => {
    expect(mutationTree(d, RACE_INDUS).chains).toEqual([]);
    expect(mutationTree(d, RACE_TRANSH).chains).toEqual([]);
  });
});

describe("état d'une recherche", () => {
  it("un choix exclusif écarte l'autre mutation dès qu'il est en file, et pour de bon une fois acquis", () => {
    const [scales, sap, acid] = ["s_scales", "s_quick_sap", "s_acid"].map(tech);
    expect(techStatus(d, state(), scales)).toBe("available");
    expect(techStatus(d, state(), acid)).toBe("locked");
    expect(techStatus(d, state([], "", ["s_scales"]), scales)).toBe("queued");
    expect(techStatus(d, state([], "", ["s_scales"]), sap)).toBe("barred");
    expect(techStatus(d, state([], "s_scales"), scales)).toBe("current");
    expect(techStatus(d, state([], "s_scales"), sap)).toBe("barred");
    expect(techStatus(d, state(["s_scales"]), scales)).toBe("done");
    expect(techStatus(d, state(["s_scales"]), sap)).toBe("barred");
    // l'une des deux mutations du stade précédent suffit
    expect(techStatus(d, state(["s_scales"]), acid)).toBe("available");
    expect(techStatus(d, state(["s_quick_sap"]), acid)).toBe("available");
  });

  it("prérequis en clair : une paire de mutations s'écrit « l'une ou l'autre », un autre palier est nommé", () => {
    const a = d.techs[tech("s_acid")];
    expect(prereqText(d, a.prereq)).toBe(`${d.techs[tech("s_scales")].name} ou ${d.techs[tech("s_quick_sap")].name}`);
    const shells = d.techs[tech("s_shells")];
    expect(prereqText(d, shells.prereq, true)).toBe(`${d.techs[tech("s_spitters")].name} (palier 1)`);
    expect(prereqText(d, shells.prereq)).toBe(d.techs[tech("s_spitters")].name);
  });

  it("génome : mutations acquises, mutations auxquelles on a renoncé, nids greffés permis", () => {
    const none = genome(d, state(), RACE_SOUCHE);
    expect(none).toMatchObject({ acquired: [], renounced: [], stages: 0, dens: 1 });
    expect(none.total).toBe(mutationTree(d, RACE_SOUCHE).chains.flatMap((c) => c.stages).length);
    const g = genome(d, state(["s_scales", "s_fertility"]), RACE_SOUCHE);
    expect(g.acquired).toEqual([tech("s_scales"), tech("s_fertility")]);
    expect(g.renounced).toEqual([tech("s_quick_sap"), tech("s_acid")]);
    expect(g.stages).toBe(2);
    expect(g.dens).toBe(3);
  });
});

describe("ce qu'une recherche débloque", () => {
  it("chaque unité, bâtiment et amélioration soumis à une recherche figure dans ce qu'elle débloque", () => {
    d.units.forEach((u, i) => {
      if (u.tech > 0) expect(techUnlocks(d, u.tech).units).toContain(i);
    });
    d.buildings.forEach((b, i) => {
      if (b.tech > 0) expect(techUnlocks(d, b.tech).buildings).toContain(i);
    });
    d.mods.forEach((m, i) => {
      if (i > 0 && m.tech > 0) expect(techUnlocks(d, m.tech).mods).toContain(i);
    });
    expect(techUnlocks(d, 0)).toEqual({ units: [], buildings: [], mods: [] });
  });

  it("Ronces débloque la ronce et le rhizome ; une mutation ne débloque rien : elle change l'espèce", () => {
    const keys = techUnlocks(d, tech("s_brambles")).buildings.map((i) => d.buildings[i].key);
    expect(keys).toContain("bramble");
    expect(keys).toContain("rhizome");
    expect(techUnlocks(d, tech("s_scales"))).toEqual({ units: [], buildings: [], mods: [] });
  });
});

describe("mise en avant de l'effet d'une mutation", () => {
  it("l'effet est la description sans l'étiquette ni la mention de l'exclusion", () => {
    expect(mutationEffect("Mutation : +30 % de points de vie pour tous les organismes. Exclut Sève vive.")).toBe("+30 % de points de vie pour tous les organismes");
    expect(mutationEffect("Renvoie un tiers des morsures.")).toBe("Renvoie un tiers des morsures");
  });

  it("le chiffre vient de la description : signe écrit ou déduit, doublement, tiers, rien sinon", () => {
    expect(mutationFigure("Mutation : +30 % de points de vie pour tous les organismes. Exclut Sève vive.")).toBe("+30 %");
    expect(mutationFigure("Mutation : régénération doublée sur le terreau, 1 % par seconde ailleurs. Exclut Écailles.")).toBe("×2");
    expect(mutationFigure("Mutation : racines et organes subissent 40 % de dégâts en moins. Exclut Grandes frondaisons.")).toBe("−40 %");
    expect(mutationFigure("Mutation : ennemis au sol 35 % plus lents sur votre terreau. Exclut Racines étrangleuses.")).toBe("−35 %");
    expect(mutationFigure("Mutation : éclosion des œufs et croissance des organes 50 % plus rapides. Exclut Acide.")).toBe("+50 %");
    expect(mutationFigure("Mutation : renvoie un tiers des morsures subies. Exclut Sang acide.")).toBe("1/3");
    expect(mutationFigure("Mutation : un organisme tué au sol laisse une flaque d'acide. Exclut Carapaces d'épines.")).toBeNull();
  });
});

describe("recettes d'une race", () => {
  it("seulement celles que ses recherches peuvent débloquer, sans lot de recherche hors des Industriels", () => {
    const keys = (race: number) => d.recipes.filter((r) => recipeOfRace(d, race, r)).map((r) => r.key);
    expect(keys(RACE_INDUS)).toEqual(d.recipes.map((r) => r.key));
    const t = keys(RACE_TRANSH);
    for (const k of ["iron_plate", "gear", "processor", "engine", "refined_crystal", "energy_cell"]) expect(t).toContain(k);
    expect(t.filter((k) => k.startsWith("pack"))).toEqual([]);
    // pièce de bras : seule l'automatisation des Industriels la débloque
    expect(t).not.toContain("arm_part");
  });
});
