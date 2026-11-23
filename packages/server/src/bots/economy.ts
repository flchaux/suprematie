// Économie des modules : régulation des recettes par la demande, mines mises en pause quand un dépôt
// déborde, amélioration du générateur principal.
import type { Cmd } from "@supreme/shared";
import { setRecipe, setPause, upgrade, RECIPE_NONE, BUILD_FULL } from "@supreme/shared";
import type { Module, Slot } from "./layout.ts";
import { arsenalWanted } from "./arsenal.ts";
import type { SpotState } from "./engineers.ts";
import type { SkirmishAI } from "./ai.ts";

export interface Crafter {
  x: number;
  y: number;
  kind: number;
  recipe: number;
  type: string;
  ref: number;
  paused: boolean;
  lastCmd: number;
  cooldown?: number;
  module: Module;
  slot: Slot;
}

// ---------- Économie : recettes et régulation ----------
/**
 * Régulation par la demande : chaque consommateur (usine, laboratoire) indique les objets qui lui
 * manquent ; seuls les producteurs de ces objets (et de leurs ingrédients) tournent, pour que le
 * premier assembleur du tapis ne prenne pas tout le fer. Le stock de construction compte aussi
 * comme consommateur quand il manque d'engrenages, de circuits ou d'acier.
 */
/** Variation du stock d'un objet sur les 30 dernières secondes. */
export function growth(ai: SkirmishAI, item: number): number {
  const h = ai.stockHist;
  if (h.length < 2) return 0;
  return ai.stock(item) - h[0][item];
}

/**
 * Générateur principal : zone agrandie (+50 %) dès que la recherche est faite et que la réserve couvre
 * deux fois le coût (l'amélioration ne doit pas affamer les chantiers), hors menace. Une fois amélioré,
 * le planificateur compte sa grande zone pour placer les bâtiments sans relais.
 */
export function mainGenUpgrade(ai: SkirmishAI, out: Cmd[]): void {
  const levels = ai.ctx.data.mainGeneratorLevels;
  if (!levels) return;
  for (const b of ai.ix.buildingsBy[ai.ctx.slot]) {
    if (b.kind !== ai.ids.b.main_generator || b.build < BUILD_FULL || b.upgrading) continue;
    const lv = levels[Math.min(b.level, levels.length - 1)];
    ai.planner.setPoleRange(b.x, b.y, lv.supply, lv.connect);
    const next = levels[b.level + 1];
    if (!next || ai.underPressure || !ai.has(next.tech)) continue;
    if (next.cost.every(([item, n]) => ai.stock(item) >= 2 * n)) {
      ai.log("amélioration du générateur principal");
      out.push(upgrade(b.ref));
    }
  }
}

export function economy(ai: SkirmishAI, out: Cmd[]): void {
  const it = ai.ids.item;
  ai.stockHist.push(Array.from(ai.me.stock));
  if (ai.stockHist.length > 30) ai.stockHist.shift();
  if (ai.thinkN % 4 === 0 && arsenalWanted(ai)) unjam(ai, out);
  else if (ai.pausedMines.size && !arsenalWanted(ai)) {
    // plus d'arsenal en vue : les mines reprennent
    out.push(setPause([...ai.pausedMines], false));
    ai.pausedMines.clear();
  }
  ai.loadAvg += (ai.me.powerUse - ai.loadAvg) * 0.05;
  const sim = ai.ctx.sim;
  const data = ai.ctx.data;
  const demand = new Map<Module, Set<number>>();
  for (const m of ai.planner.modules) {
    ai.produces.get(m)?.clear();
    demand.set(m, new Set());
  }
  ai.waiting.clear();
  // besoins des consommateurs
  for (const m of ai.planner.modules) {
    const D = demand.get(m) as Set<number>;
    for (const s of m.slots) {
      const isLab = s.type === "lab";
      if (!isLab && !s.type.startsWith("factory")) continue;
      const ref = sim.buildingAt(s.x, s.y);
      const b = ref ? ai.ix.bref.get(ref) : undefined;
      if (!b || b.owner !== ai.ctx.slot || b.build < BUILD_FULL) continue;
      const inf = sim.infoBuilding(ref) as { inv: number[]; stash: number[]; queue: [number, number][] } | null;
      if (!inf) continue;
      if (isLab) {
        const t = ai.me.research;
        if (!t) continue;
        const tier = data.techs[t].tier;
        for (let k = 0; k < tier; k++) if (inf.inv[k] < 2) D.add(it.pack1 + k);
        if (!b.working) ai.waiting.add(m);
      } else if (inf.queue.length) {
        const cost = data.units[inf.queue[0][0]].cost;
        // réserve de l'usine : par objet (stash)
        for (const [itm, n] of cost) if ((inf.stash[itm] ?? 0) < n) D.add(itm);
        if (!b.working) ai.waiting.add(m);
      }
    }
  }
  // fermeture : ingrédients des producteurs demandés par les consommateurs
  // contenu des producteurs (lu une fois) : seuls les ingrédients qui leur manquent sont demandés
  const invCache = new Map<number, number[] | null>();
  const invOf = (c: Crafter): number[] | null => {
    if (!c.ref) return null;
    let v = invCache.get(c.ref);
    if (v === undefined) {
      const inf = sim.infoBuilding(c.ref) as { inv: number[]; recipe: number } | null;
      v = inf && inf.recipe === c.recipe ? inf.inv : null;
      invCache.set(c.ref, v);
    }
    return v;
  };
  const closure = () => {
    for (const m of ai.planner.modules) {
      const D = demand.get(m) as Set<number>;
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of ai.crafters) {
          if (c.module !== m) continue;
          const r = data.recipes[c.recipe];
          if (!D.has(r.output[0])) continue;
          const inv = invOf(c);
          for (let j = 0; j < r.inputs.length; j++) {
            const [inp, n] = r.inputs[j];
            if (inv && inv[j] >= n * 2) continue;
            if (!D.has(inp)) {
              D.add(inp);
              grew = true;
            }
          }
        }
      }
    }
  };
  closure();
  const consumerDemand = new Map<Module, Set<number>>();
  for (const [m, D] of demand) consumerDemand.set(m, new Set(D));
  // stock de construction
  for (const m of ai.planner.modules) {
    const D = demand.get(m) as Set<number>;
    if (ai.stock(it.gear) < (m.role === "main" ? 25 : 40)) D.add(it.gear);
    if (ai.stock(it.circuit) < (m.role === "main" ? 15 : 40)) D.add(it.circuit);
    if (ai.stock(it.steel) < (m.role === "main" ? 0 : 60)) D.add(it.steel);
  }
  // générateurs à sec : en poser d'autres ne sert à rien tant que le combustible ne les atteint pas (relais
  // logistiques de l'arsenal)
  if (ai.thinkN % 30 === 0) {
    ai.dryGens = 0;
    ai.fuelDepots = [];
    if (arsenalWanted(ai) && ai.arsenal.plan) {
      for (const b of ai.ix.buildingsBy[ai.ctx.slot]) {
        if (b.build < BUILD_FULL) continue;
        if (b.kind === ai.ids.b.generator) {
          const g = sim.infoBuilding(b.ref) as { fuel: number } | null;
          if (g && g.fuel <= 0) ai.dryGens++;
        } else if (b.kind === ai.ids.b.depot) {
          const d = sim.infoBuilding(b.ref) as { stash: number[] } | null;
          if (d && (d.stash[it.hydrocarbon] ?? 0) >= 120) ai.fuelDepots.push([b.x + 1, b.y + 1]);
        }
      }
    }
  }
  // énergie réelle : satisfaction du réseau d'un bâtiment de chaque module
  if (ai.thinkN % 30 === 0) {
    for (const m of ai.planner.modules) {
      const s = m.slots.find((sl) => ai.placementState(sl.places[0]) === 3);
      if (!s) continue;
      const inf = sim.infoBuilding(sim.buildingAt(s.x, s.y)) as { sat: number; net: number } | null;
      if (inf && inf.net > 0 && inf.sat < 900 && !ai.projects.some((p) => p.name === "power" + m.id)) ai.powerLow.add(m);
    }
  }
  closure();
  for (const c of ai.crafters) {
    if (!c.ref) {
      const ti = sim.tileInfo(c.x, c.y);
      if ((ti & 0xff) === c.kind + 1 && ((ti >> 8) & 0xff) === ai.ctx.slot) c.ref = sim.buildingAt(c.x, c.y);
      else continue;
    }
    const b = ai.ix.bref.get(c.ref);
    if (!b || b.owner !== ai.ctx.slot || b.kind !== c.kind) {
      c.ref = 0;
      continue;
    }
    const r = data.recipes[c.recipe];
    if (b.build >= BUILD_FULL) ai.produces.get(c.module)?.add(r.output[0]);
    const outIt = r.output[0];
    // module aérien : tout tourne pour les usines (seul l'excès au dépôt arrête un producteur)
    const regulated = (!c.slot.cell || c.slot.busOut === true) && c.module.role !== "air";
    let pause = regulated && !(demand.get(c.module) as Set<number>).has(outIt);
    // demandé mais déjà en excès au dépôt : arrêt temporaire (le surplus passe les consommateurs)
    if (c.module.role === "air" && !c.slot.cell) {
      if (ai.stock(outIt) > 400) pause = true;
    } else if (!regulated) {
      // cellule : régulée par ses bras
    } else if ((consumerDemand.get(c.module) as Set<number>).has(outIt)) {
      // un consommateur attend ce produit : pas d'arrêt pour excès au dépôt
    } else if (!pause && ai.tick < (c.cooldown ?? 0)) pause = true;
    else if (!pause && growth(ai, outIt) > (outIt === it.gear || outIt === it.cable ? 10 : 5) && ai.stock(outIt) > 30) {
      c.cooldown = ai.tick + 400;
      pause = true;
    }
    c.paused = pause;
    let want = c.recipe;
    if (pause) want = c.kind === ai.ids.b.furnace ? ai.ids.r.iron_plate : RECIPE_NONE;
    if (b.recipe !== want && ai.tick - c.lastCmd > 60) {
      out.push(setRecipe(c.ref, want));
      c.lastCmd = ai.tick;
    }
  }
}

/**
 * Dépôt de module presque plein d'une plaque : le tapis principal, qui y finit, se boucherait (plus rien
 * ne passerait, pas même l'autre plaque). Les mines de cette plaque sont mises en pause, sauf (une à la
 * fois) quand un fabricant du module en manque ; le dépôt est agrandi dès que possible.
 */
export function unjam(ai: SkirmishAI, out: Cmd[]): void {
  const it = ai.ids.item;
  const sim = ai.ctx.sim;
  for (const m of ai.planner.modules) {
    const dp = m.bus.find((p) => p.kind === ai.ids.b.depot);
    if (!dp) continue;
    const ref = sim.buildingAt(dp.x, dp.y);
    const b = ref ? ai.ix.bref.get(ref) : undefined;
    if (!b || b.owner !== ai.ctx.slot || b.kind !== ai.ids.b.depot || b.build < BUILD_FULL) continue;
    const inf = sim.infoBuilding(ref) as { stash: number[] } | null;
    if (!inf) continue;
    const cap = b.level > 0 ? 2000 : 600;
    if (b.level === 0 && !b.upgrading && ai.has(ai.ids.t.automation) && inf.stash.some((n) => n >= cap * 0.5) && ai.stock(it.steel) >= 20 && ai.stock(it.gear) >= 12 && ai.stock(it.circuit) >= 8) out.push(upgrade(ref));
    for (const [ore, plate] of [[it.iron_ore, it.iron_plate], [it.copper_ore, it.copper_plate]]) {
      const key = m.id * 100 + ore;
      const n = Math.max(inf.stash[plate] ?? 0, inf.stash[ore] ?? 0);
      const high = n >= cap * 0.8;
      const low = n < cap * 0.7;
      if (!high && !low) continue;
      let hungry = false;
      if (high) {
        for (const c of ai.crafters) {
          if (c.module !== m || !c.ref || c.paused) continue;
          const r = ai.ctx.data.recipes[c.recipe];
          const j = r.inputs.findIndex(([i]) => i === plate);
          if (j < 0) continue;
          const ci = sim.infoBuilding(c.ref) as { inv: number[]; recipe: number } | null;
          if (ci && ci.recipe === c.recipe && ci.inv[j] < r.inputs[j][1]) {
            hungry = true;
            break;
          }
        }
      }
      let allowed = high ? (hungry ? 1 : 0) : 99;
      const on: number[] = [];
      const off: number[] = [];
      for (const s of ai.spots) {
        if (s.st !== 1 || (s as SpotState & { key?: number }).key !== key) continue;
        const e = sim.buildingAt(s.x, s.y);
        const eb = e ? ai.ix.bref.get(e) : undefined;
        if (!eb || eb.owner !== ai.ctx.slot || eb.build < BUILD_FULL) continue;
        if (allowed > 0) {
          allowed--;
          if (ai.pausedMines.delete(e)) on.push(e);
        } else if (!ai.pausedMines.has(e)) {
          ai.pausedMines.add(e);
          off.push(e);
        }
      }
      if (on.length) out.push(setPause(on, false));
      if (off.length) out.push(setPause(off, true));
    }
  }
}
