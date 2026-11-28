// Gestionnaire des usines : production de chaque usine terrestre ou aérienne, composition voulue de
// l'armée, composants disponibles sur le tapis principal en amont d'une usine.
import type { Cmd } from "@supreme/shared";
import { factoryQueue, rally, BUILD_FULL, Layer } from "@supreme/shared";
import type { Module, Slot } from "./layout.ts";
import { arsenalDepot, pendingYard } from "./arsenal.ts";
import { transports } from "./landing.ts";
import { pickTarget } from "./strategy.ts";
import { engineerCount } from "./engineers.ts";
import { moduleExt } from "./builders.ts";
import type { SkirmishAI } from "./ai.ts";

// ---------- Usines ----------
export function factories(ai: SkirmishAI, out: Cmd[]): void {
  const P = ai.persona;
  const data = ai.ctx.data;
  const engTarget = Math.min(P.maxEngineers, P.engineers + Math.floor(ai.tick / (6 * 1200)));
  let engs = engineerCount(ai);
  let landArmy = 0;
  for (const u of ai.ix.unitsBy[ai.ctx.slot]) if (ai.combatKinds[u.kind] && data.units[u.kind].layer <= Layer.Hover) landArmy++;
  const weights = armyWeights(ai);
  const ldep = arsenalDepot(ai);
  const thrifty = ai.ironForArsenal && ai.arsenal.link > 0 && !ai.underPressure && landArmy > Math.max(40, ai.army.attackSize * 1.3) && ai.landRatio < 0.9;
  // une île arme de quoi remplir ses transports, en plus de sa garnison
  const landCap = 24 + (ai.landing.wanted ? transports(ai).length * 10 : 0);
  // passagers à fournir aux transports : le tapis de la cellule de robots passe avant le stock
  const boarding = ai.landing.wanted && landArmy < landCap - 24 + 8;
  for (const b of ai.ix.buildingsBy[ai.ctx.slot]) {
    if (data.buildings[b.kind].cls !== 8 || b.build < BUILD_FULL) continue;
    let fi = ai.factoryInfo.get(b.ref);
    if (!fi) {
      const m = ai.planner.modules.find((mm) => mm.slots.some((s) => s.x === b.x && s.y === b.y));
      const slot = m?.slots.find((s) => s.x === b.x && s.y === b.y);
      if (!m || !slot) continue;
      fi = { module: m, slot, lastQ: -1e9, rallied: false, front: -1, lastStart: ai.tick };
      ai.factoryInfo.set(b.ref, fi);
    }
    if (!fi.rallied) {
      const [rx, ry] = ai.rally;
      out.push(rally(b.ref, rx, ry));
      fi.rallied = true;
    }
    if (b.queue >= 1) {
      // unité en attente de composants trop longtemps : l'annuler et éviter ce type un moment
      if (!b.working && fi.front >= 0 && data.buildings[b.kind].factory !== 2 && ai.tick - fi.lastQ > 1800 && ai.tick - fi.lastStart > 1800 && needsBus(ai, fi.front, fi.slot)) {
        out.push(factoryQueue(b.ref, fi.front, -1));
        ai.starved.set(fi.module.id * 100 + fi.front, ai.tick + 6000);
        fi.lastQ = ai.tick;
      }
      if (b.working) fi.lastStart = ai.tick;
      continue;
    }
    if (ai.tick - fi.lastQ < 40) continue;
    if (ai.me.unitCount >= 950) continue;
    const avail = availableAt(ai, fi.module, fi.slot);
    const fk = data.buildings[b.kind].factory;
    if (fk === 1 && fi.module.noLand && !ai.underPressure && !boarding) continue;
    // usine aérienne que ses drones nourrissent au dépôt de l'arsenal : elle lui laisse l'acier des navires et
    // des transports
    const fed = fk === 2 && ldep !== null && Math.hypot(b.x - ldep.x, b.y - ldep.y) <= 30;
    if (fed && (ai.stock(ai.ids.item.steel) < 60 || pendingYard(ai))) continue;
    let pick = -1;
    const eng = ai.ids.u.eng1;
    if (fk === 1 && engs < engTarget && canBuild(ai, eng, avail)) {
      pick = eng;
      engs++;
    } else if (fk === 1 && pickTarget(ai, true) < 0 && !canBuild(ai, ai.ids.u.hover_tank, avail) && ((landArmy > landCap && !ai.underPressure) || (landArmy > 50 && !ai.baseInvaded()))) {
      // personne n'est joignable par la terre (et pas d'amphibies) : garder les ressources pour l'aviation
      continue;
    } else if (ai.stock(ai.ids.item.iron_plate) < 40 && !ai.underPressure && engs >= 1 && !boarding) {
      // le stock de construction passe d'abord
      continue;
    } else if (thrifty && fk === 1) {
      // armée suffisante et arsenal à court de fer : il passe d'abord
      continue;
    } else if (ai.starvedSince && ai.tick - ai.starvedSince > 600 && !ai.underPressure && engs >= 1 && !boarding) {
      // les constructeurs attendent des ressources depuis 30 s : pause des unités de combat
      if (ai.debug && ai.thinkN % 30 === 1) ai.log("usines en pause : stock de construction insuffisant");
      continue;

    } else {
      // composition de l'armée : type disponible le moins représenté par rapport à son poids
      const counts = new Map<number, number>();
      for (const u of ai.ix.unitsBy[ai.ctx.slot]) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
      let best = Infinity;
      for (const [key, wgt] of Object.entries(weights)) {
        const k = ai.ids.u[key];
        if (k === undefined || data.units[k].factory !== fk || !canBuild(ai, k, avail)) continue;
        // (et pas de nuée de chasseurs quand l'ennemi ne vole pas)
        if (fed && (key === "interceptor" || key === "asf") && (counts.get(k) ?? 0) >= 6 + ai.airRatio * 12) continue;
        if ((ai.starved.get(fi.module.id * 100 + k) ?? 0) > ai.tick) continue;
        // les unités de palier supérieur sont préférées quand elles sont disponibles
        const tierBonus = 1 + data.units[k].tier * 0.3;
        const score = ((counts.get(k) ?? 0) + 1 + ai.random() * 0.5) / (wgt * tierBonus);
        if (score < best) {
          best = score;
          pick = k;
        }
      }
    }
    if (pick < 0 && ai.debug && ai.thinkN % 30 === 1) ai.log("usine sans production", b.kind, "disponible :", [...avail].map((i) => ai.ctx.data.items[i].key).join(","));
    if (pick >= 0) {
      out.push(factoryQueue(b.ref, pick, 1));
      fi.lastQ = ai.tick;
      fi.front = pick;
    }
  }
}

/**
 * Composition voulue de l'armée : poids de la personnalité, corrigés par les rapports de force
 * (LOUD : la production répond à ce que fait l'adversaire).
 */
export function armyWeights(ai: SkirmishAI): Record<string, number> {
  const w: Record<string, number> = { ...ai.persona.army };
  if (ai.level === "facile") return w;
  const r = Math.min(2.5, ai.airRatio);
  // antiaérien : chasseurs et antiaérien mobile, d'autant plus que l'aviation ennemie domine
  w.interceptor = (w.interceptor ?? 0) + 0.6 + r * 3;
  w.asf = (w.asf ?? 0) + 0.5 + r * 3;
  if (r > 0.35) w.mobile_aa = (w.mobile_aa ?? 0) + r * 2.5;
  if (r > 0.35) w.flak = (w.flak ?? 0) + r * 2;
  // marine adverse : bombardiers torpilleurs
  if (ai.navy.enemy > 60) w.torpedo_bomber = (w.torpedo_bomber ?? 0) + 1.5;
  // frappes sur l'économie adverse
  w.bomber = (w.bomber ?? 0) + 1.2;
  // un adversaire hors d'atteinte par la terre : aéroglisseurs amphibies, et l'aviation d'attaque
  // devient la priorité (les chasseurs seulement contre une aviation ennemie)
  if (ai.anyUnreachable()) w.hover_tank = (w.hover_tank ?? 0) + (pickTarget(ai, true) < 0 ? 8 : 2);
  if (pickTarget(ai, true) < 0) {
    w.glider = (w.glider ?? 0) * 2 + 2;
    w.gunship = (w.gunship ?? 0) * 2 + 1;
    w.bomber = (w.bomber ?? 0) * 2;
    if (r < 0.3) w.interceptor = 0.3;
  }
  // réplicateurs (faune) en vue : seuls les disrupteurs en viennent à bout
  const repl = ai.ctx.data.units.findIndex((u) => u.key === "replicator");
  if (repl >= 0) {
    let n = 0;
    for (const u of ai.view.units) if (u.kind === repl) n++;
    if (n > 0) w.disruptor = (w.disruptor ?? 0) + Math.min(6, 1 + n * 0.5);
  }
  // adversaire plus fort au sol : plus d'artillerie et de lance-missiles (portée)
  if (ai.landRatio > 1.3) {
    w.artillery = (w.artillery ?? 0) + 1;
    w.missile_launcher = (w.missile_launcher ?? 0) + 1;
  }
  return w;
}

/** L'unité a-t-elle besoin d'objets du tapis principal autres que les plaques (hors cellule) ? */
export function needsBus(ai: SkirmishAI, kind: number, slot: Slot): boolean {
  const it = ai.ids.item;
  const cellItems = new Set<number>([it.iron_plate, it.copper_plate]);
  if (slot.cell) for (const c of ai.crafters) if (c.slot.cell && c.slot.side === slot.side && Math.abs(c.slot.u0 - slot.u0) <= 10) cellItems.add(ai.ctx.data.recipes[c.recipe].output[0]);
  return ai.ctx.data.units[kind].cost.some(([i]) => !cellItems.has(i));
}

/** Objets disponibles sur le tapis principal en amont d'un emplacement. */
export function availableAt(ai: SkirmishAI, m: Module, slot: Slot): Set<number> {
  const s = new Set<number>();
  // plaques fondues aux mines du module (arrivent en tête du tapis)
  if (moduleExt(ai, m, ai.ids.item.iron_ore) > 0) s.add(ai.ids.item.iron_plate);
  if (moduleExt(ai, m, ai.ids.item.copper_ore) > 0) s.add(ai.ids.item.copper_plate);
  for (const c of ai.crafters) {
    if (c.module !== m || !c.ref) continue;
    const sameCell = slot.cell && c.slot.cell && c.slot.side === slot.side && Math.abs(c.slot.u0 - slot.u0) <= 10;
    if (!sameCell && ((c.slot.cell && !c.slot.busOut) || c.slot.u0 + 1 >= slot.u0)) continue;
    const b = ai.ix.bref.get(c.ref);
    if (!b || b.build < BUILD_FULL) continue;
    s.add(ai.ctx.data.recipes[c.recipe].output[0]);
  }
  return s;
}
export function canBuild(ai: SkirmishAI, kind: number, avail: Set<number>): boolean {
  const u = ai.ctx.data.units[kind];
  if (!ai.has(u.tech)) return false;
  for (const [it] of u.cost) if (!avail.has(it)) return false;
  return true;
}
