// Builders d'ingénieurs : liste des tâches de construction avec leur priorité du moment (engBuilders), et
// fabrication des chantiers correspondants : emplacements et cellules des modules, extracteurs, tourelles,
// dépôts, modules supplémentaires. Le combustible est dans fuel.ts ; l'arsenal, la marine et les transports
// ajoutent leurs builders depuis leurs modules.
import type { BotUnit } from "@supreme/shared";
import { TILE, dist2 } from "./util.ts";
import { CELLS, type Module } from "./layout.ts";
import { AIR_PLAN, TECH_PLAN, ARMY_PLAN, MAIN_AIR_PLAN } from "./personas.ts";
import { arsenalWanted, arsenalBuilders, arsenalBuilt } from "./arsenal.ts";
import { navyBuilders } from "./navy.ts";
import { landingBuilders, isolated } from "./landing.ts";
import { landComponents } from "./land.ts";
import { pickTarget } from "./strategy.ts";
import { newProject, busProject, type Project, type SpotState } from "./engineers.ts";
import { fuelShort, fuelBuilders } from "./fuel.ts";
import type { SkirmishAI } from "./ai.ts";

export interface EngBuilder {
  name: string;
  prio: number;
  remote?: boolean;
  est: number[]; // coût estimé (fer, cuivre, acier, engrenages, circuits)
  make: () => Project | null;
}

export function countSlots(ai: SkirmishAI, m: Module | null, type: string): number {
  let n = 0;
  for (const mm of ai.planner.modules) {
    if (m && mm !== m) continue;
    for (const s of mm.slots) if (s.type === type) n++;
  }
  return n;
}

/** Liste des builders d'ingénieurs avec leur priorité actuelle. */
export function engBuilders(ai: SkirmishAI, u: BotUnit): EngBuilder[] {
  const P = ai.persona;
  const L: EngBuilder[] = [];
  const it = ai.ids.item;
  const mods = ai.planner.modules;
  const m0 = mods[0];
  if (!m0) return L;
  const busDone = (m: Module) => (m as Module & { busDone?: boolean }).busDone === true;
  for (const m of mods) {
    if (!busDone(m)) {
      L.push({ name: "bus" + m.id, prio: 1000 - m.id, remote: m.id > 0, est: [m.L + 8], make: () => busProject(ai, m, m.id > 0) });
      continue;
    }
    // énergie
    // un réseau qui manque de combustible n'a pas besoin de générateurs de plus (voir fuelBuilders)
    const starved = ai.powerLow.has(m) && !fuelShort(ai);
    if ((m.prod < m.use * 1.1 + 60 || starved) && ai.dryGens < 3) {
      L.push({
        name: "power" + m.id,
        prio: m.prod < m.use || starved ? 960 : 700,
        remote: m.id > 0,
        est: [10, 8],
        make: () => {
          const g = ai.planner.planGenerator(m);
          if (!g) return null;
          m.prod += 400;
          ai.powerLow.delete(m);
          return newProject(ai, "power" + m.id, g, { module: m, remote: m.id > 0 });
        },
      });
    }
    // extracteurs (avec fonderie sur place pour le fer, le cuivre et le silicium)
    const ores = [it.iron_ore, it.copper_ore, it.hydrocarbon];
    for (const ore of ores) {
      const ext = moduleExt(ai, m, ore);
      let prio = 0;
      if (ore === it.hydrocarbon) {
        // l'hydrocarbure ne sert qu'aux raffineries du module
        if (ext < 1 && (ai.pendingPlan.get(m)?.includes("R:fuel") === false) && m.slots.some((s) => s.type === "R:fuel")) prio = 780;
      } else {
        const plate = ore === it.iron_ore ? it.iron_plate : it.copper_plate;
        const low = ai.stock(plate) < (ore === it.iron_ore ? 90 : 50);
        prio = (ore === it.iron_ore ? 720 : 715) - ext * 8 + (low ? 140 : 0);
        if (m.id > 0 && ext < (ore === it.iron_ore ? 2 : 1)) prio = 905 - m.id;
      }
      if (prio > 0 && m.feeders < 12) {
        L.push({ name: `ext${m.id}:${ore}`, prio, remote: m.id > 0, est: [45, 15], make: () => makeExtractor(ai, m, ore) });
      }
    }
    // emplacement suivant du plan du module
    const pend = ai.pendingPlan.get(m);
    if (pend && pend.length && !m.full) {
      // ordre strict du plan, sauf si l'entrée de tête attend une recherche depuis longtemps
      let k = slotAvailable(ai, pend[0]) ? 0 : -1;
      if (k < 0) {
        const key = m.id + ":" + pend[0];
        if (!ai.blockedSince.has(key)) ai.blockedSince.set(key, ai.tick);
        if (ai.tick - (ai.blockedSince.get(key) as number) > 4800 && m.role !== "air") k = pend.findIndex((t) => slotAvailable(ai, t));
      }
      if (k >= 0) {
        const type = pend[k];
        let prio = 800 - m.id * 50;
        if (type === "lab" || type.startsWith("A:pack")) prio += P.techBias;
        if (type.startsWith("factory")) prio += P.name === "rush" ? 80 : 20;
        // première usine (et ses fournisseurs) : avant tout le reste (ingénieurs et armée en dépendent)
        if ((isFactoryEntry(ai, type) || pend.slice(0, 4).includes("factory:land_factory")) && !hasFactorySlot(ai)) prio = 985;
        L.push({ name: "slot" + m.id, prio, remote: m.id > 0, est: slotEst(ai, type), make: () => makeSlot(ai, m, type, k) });
      }
    }
  }
  // conversion du module principal à l'aviation (adversaires inaccessibles par la terre)
  if (!ai.mainAir && ai.has(ai.ids.t.electronics) && ai.has(ai.ids.t.hydrocarbons) && ai.anyUnreachable()) {
    const pend = ai.pendingPlan.get(m0);
    if (pend && pend.length === 0 && !m0.full) {
      ai.mainAir = true;
      m0.noLand = true;
      pend.push(...MAIN_AIR_PLAN);
      ai.log("conversion du module principal à l'aviation");
    }
  }
  // ouverture : ordre de construction fixe au début de la partie
  const op = ai.persona.opening[ai.openingIdx];
  if (op !== undefined && busDone(m0)) {
    const name = op === "slot" ? "slot0" : op === "iron" ? `ext0:${it.iron_ore}` : `ext0:${it.copper_ore}`;
    const b = L.find((x) => x.name === name);
    if (b) b.prio = 990;
    else ai.openingIdx++;
  }
  // défenses
  if (ai.has(ai.ids.t.light_defense)) {
    const minutes = ai.tick / 1200;
    const want = Math.min(P.turrets + Math.floor(minutes / 8) * (P.turrets > 4 ? 2 : 1), P.turrets * 3 + 2);
    const threatened = ai.underPressure;
    // antiaérien : quand l'aviation ennemie dépasse notre défense (la moitié des tourelles au plus)
    // (sur une île, l'ennemi vient par les airs : trois tourelles d'avance, et le double quand il vole)
    const island = ai.arsenal.plan !== null && isolated(ai);
    const wantAA = ai.level !== "facile" && ai.has(ai.ids.t.aa_turret) && (ai.airRatio > 0.4 || (island && ai.turretsAA < 3)) && ai.turretsAA < Math.min(12, (island ? 4 : 2) + ai.airRatio * 4);
    const airRaid = ai.army.threat && ai.army.threat.air > 0 && ai.tick - ai.army.threat.tick < 200;
    if (ai.turretsPlanned < want || (threatened && ai.turretsPlanned < want + 4) || wantAA) {
      const heavy = ai.has(ai.ids.t.heavy_turret) && ai.stock(it.steel) > 60 && ai.stock(it.ammo) > 20 && ai.turretsPlanned % 2 === 1;
      const aa = wantAA && (ai.turretsAA * 2 <= ai.turretsPlanned || airRaid) && ai.stock(it.steel) > 8;
      const kind = aa ? ai.ids.b.aa_turret : heavy ? ai.ids.b.heavy_turret : ai.ids.b.light_turret;
      L.push({ name: "turret", prio: (threatened || (aa && airRaid) ? 870 : aa ? 760 : 560) + P.defenseBias, est: aa ? [0, 0, 8, 0, 4] : heavy ? [0, 0, 20, 0, 5] : [12, 0, 0, 4, 2], make: () => makeTurret(ai, kind) });
    }
  }
  // module supplémentaire
  const allBuilt = mods.every((m) => busDone(m));
  const planDone = mods.every((m) => m.full || (ai.pendingPlan.get(m)?.length ?? 0) === 0);
  const rich = ai.stock(it.iron_plate) > 600 && ai.stock(it.copper_plate) > 300;
  const maxMods = 1 + P.modules + (rich ? 3 : 0);
  const coreDone = m0.slots.some((s) => s.type.startsWith("factory")) && !ai.projects.some((p) => p.module === m0 && p.name.startsWith("slot"));
  // le module technologique attend que l'usine soit placée (sinon le commandant, seul constructeur,
  // part poser un tapis loin de la base au lieu de l'usine qui donne les ingénieurs)
  // l'arsenal fournit aussi la recherche : il passe avant un module technologique
  const arsenal = arsenalWanted(ai);
  const techFirst = !arsenal && !mods.some((m) => m.role === "tech") && m0.slots.some((s) => s.type === "lab") && hasFactorySlot(ai);
  if (allBuilt && mods.length < maxMods && ai.factoryLost && !hasFactorySlot(ai)) {
    // usine impossible dans le module principal : un module d'armée, sans attendre
    L.push({ name: "module", prio: 950, remote: true, est: [150, 60], make: () => makeModule(ai) });
  } else if (arsenal && (arsenalBuilt(ai) < 14 || ai.stock(it.iron_plate) < 500)) {
    // pas de module de plus tant que l'arsenal n'est pas en marche, ou que le fer lui manque
  } else if (allBuilt && mods.length < maxMods && ai.tick > P.moduleDelay && (planDone || rich || coreDone || techFirst || ai.tick > P.moduleDelay * 2)) {
    L.push({ name: "module", prio: techFirst ? 810 : 520, remote: true, est: [150, 60], make: () => makeModule(ai) });
  }
  // réserve presque pleine (plafond fixé par les dépôts) : un dépôt de plus près du centre, au plus
  // un par minute
  const cap = ai.me.stockCap ?? 0;
  if (cap > 0 && ai.extraDepots < 8 && ai.tick - ai.lastDepot > 1200 && ai.me.stock.some((n) => n >= cap * 0.85)) {
    L.push({ name: "depot", prio: 830, est: [8], make: () => makeDepot(ai, m0) });
  }
  fuelBuilders(ai, L);
  arsenalBuilders(ai, L);
  navyBuilders(ai, L);
  landingBuilders(ai, L);
  return L;
}

/** Dépôt seul autour du module : agrandit la réserve. */
export function makeDepot(ai: SkirmishAI, m: Module): Project | null {
  const kind = ai.ids.b.depot;
  const a = ai.extraDepots * 1.3 + 0.6;
  const r = m.L / 2 + 4;
  ai.extraDepots++;
  ai.lastDepot = ai.tick;
  const pos = ai.planner.findFree(kind, Math.round(m.cx + Math.cos(a) * r), Math.round(m.cy + Math.sin(a) * r), 0, 8, 1);
  if (!pos) return null;
  ai.planner.mark(pos[0], pos[1], 2, 2);
  return newProject(ai, "depot", [{ kind, x: pos[0], y: pos[1], dir: 0, tag: "storage" }]);
}

export function slotEst(ai: SkirmishAI, type: string): number[] {
  const c = [0, 0, 0, 0, 0];
  const it = ai.ids.item;
  const keys = [it.iron_plate, it.copper_plate, it.steel, it.gear, it.circuit];
  const kinds = type.startsWith("cell:") ? CELLS[type.slice(5)].comps.map((cc) => ai.ids.b[cc.key]) : [slotKind(ai, type)];
  for (const kind of kinds) {
    for (const [i, n] of ai.ctx.data.buildings[kind].cost) {
      const k = keys.indexOf(i);
      if (k >= 0) c[k] += n;
    }
    c[0] += 6;
    c[1] += 4;
  }
  return c;
}

export function slotKind(ai: SkirmishAI, type: string): number {
  const [k, v] = type.split(":");
  const b = ai.ids.b;
  if (k === "F") return b.furnace;
  if (k === "A") return b.assembler1;
  if (k === "R") return b.refinery;
  if (k === "C") return b.chemical;
  if (k === "lab") return b.lab;
  if (k === "factory") return b[v];
  return b.assembler1;
}
export function slotRecipe(ai: SkirmishAI, type: string): number | undefined {
  const [k, v] = type.split(":");
  if (k === "F" || k === "A" || k === "R" || k === "C") return ai.ids.r[v];
  return undefined;
}
export function slotAvailable(ai: SkirmishAI, type: string): boolean {
  if (type.startsWith("cell:")) {
    for (const cc of CELLS[type.slice(5)].comps) {
      if (!ai.has(ai.ctx.data.buildings[ai.ids.b[cc.key]].tech)) return false;
      if (cc.recipe && !ai.has(ai.ctx.data.recipes[ai.ids.r[cc.recipe]].tech)) return false;
    }
    return true;
  }
  const kind = slotKind(ai, type);
  if (!ai.has(ai.ctx.data.buildings[kind].tech)) return false;
  const r = slotRecipe(ai, type);
  if (r !== undefined && !ai.has(ai.ctx.data.recipes[r].tech)) return false;
  return true;
}

export function makeSlot(ai: SkirmishAI, m: Module, type: string, k: number): Project | null {
  if (type.startsWith("cell:")) return makeCell(ai, m, type, k);
  const kind = slotKind(ai, type);
  const d = ai.ctx.data.buildings[kind];
  const recipe = slotRecipe(ai, type);
  const isFactory = type.startsWith("factory");
  const isLab = type === "lab";
  const slot = ai.planner.allocSlot(m, kind, d.w, type, { input: true, output: !isFactory && !isLab, faceOut: isFactory, recipe });
  if (!slot) return slotFailed(ai, m, type, k);
  ai.pendingPlan.get(m)?.splice(k, 1);
  for (const pl of slot.places) {
    const bd = ai.ctx.data.buildings[pl.kind];
    m.use += bd.powerUse;
    m.prod += bd.powerProd;
  }
  if (recipe !== undefined) {
    ai.crafters.push({ x: slot.x, y: slot.y, kind, recipe, type, ref: 0, paused: false, lastCmd: -1e9, module: m, slot });
  }
  return newProject(ai, "slot" + m.id, slot.places, { module: m, slot, remote: m.id > 0, critical: true });
}

/** Entrée de plan d'un type qui fait une usine (cellule de robots ou usine seule). */
export function isFactoryEntry(ai: SkirmishAI, type: string): boolean {
  return type.startsWith("factory") || type === "cell:robot";
}

/**
 * Placement impossible d'une entrée de plan : elle reste en tête du plan et sera retentée (le module
 * peut se libérer) ; après 3 échecs elle est abandonnée. Une usine perdue n'est jamais oubliée :
 * le prochain module sera un module d'armée.
 */
export function slotFailed(ai: SkirmishAI, m: Module, type: string, k: number): null {
  const key = m.id + ":" + type;
  const n = (ai.slotFails.get(key) ?? 0) + 1;
  ai.slotFails.set(key, n);
  ai.log("échec de placement", type, "module", m.id, "essai", n);
  if (n >= 3) {
    const pend = ai.pendingPlan.get(m);
    if (type === "cell:robot" && !hasFactorySlot(ai) && pend) {
      // cellule trop grande pour la place restante : une usine seule, alimentée par le tapis, avec en
      // amont les assembleurs de ses composants (engrenages, câbles, circuits)
      pend.splice(k, 1, "A:gear", "A:cable", "A:circuit", "factory:land_factory");
      ai.log("cellule d'usine impossible : usine seule à la place");
    } else {
      pend?.splice(k, 1);
      if (isFactoryEntry(ai, type) && !hasFactorySlot(ai)) ai.factoryLost = true;
    }
  }
  return null;
}

/** Une usine (terrestre, aérienne ou navale) est-elle placée dans un module (en chantier ou finie) ? */
export function hasFactorySlot(ai: SkirmishAI): boolean {
  return ai.planner.modules.some((mm) => mm.slots.some((sl) => sl.type.startsWith("factory")));
}

export function makeCell(ai: SkirmishAI, m: Module, type: string, k: number): Project | null {
  const cs = ai.planner.allocCell(m, CELLS[type.slice(5)]);
  if (!cs) return slotFailed(ai, m, type, k);
  ai.pendingPlan.get(m)?.splice(k, 1);
  for (const pl of cs.places) {
    const bd = ai.ctx.data.buildings[pl.kind];
    m.use += bd.powerUse;
    m.prod += bd.powerProd;
  }
  for (const sl of cs.slots) {
    const recipe = slotRecipe(ai, sl.type);
    if (recipe !== undefined) ai.crafters.push({ x: sl.x, y: sl.y, kind: sl.kind, recipe, type: sl.type, ref: 0, paused: false, lastCmd: -1e9, module: m, slot: sl });
  }
  // le premier placement (bâtiment principal) conditionne la cellule
  const main = cs.places.findIndex((p) => p.tag?.startsWith("factory") || p.tag === "lab");
  if (main > 0) {
    const t = cs.places[0];
    cs.places[0] = cs.places[main];
    cs.places[main] = t;
  }
  return newProject(ai, "slot" + m.id, cs.places, { module: m, slot: cs.slots.find((s) => s.type.startsWith("factory") || s.type === "lab") ?? cs.slots[0], remote: m.id > 0, critical: true, cell: cs });
}

export function moduleExt(ai: SkirmishAI, m: Module, ore: number): number {
  return ai.extCount.get(m.id * 100 + ore) ?? 0;
}

export function makeExtractor(ai: SkirmishAI, m: Module, ore: number): Project | null {
  const hx = ai.planner.wx(m, 0, 0);
  const hy = ai.planner.wy(m, 0, 0);
  const cand = ai.spots
    .filter((s) => s.kind === ore && s.st === 0 && s.next <= ai.tick && Math.hypot(s.x - m.cx, s.y - m.cy) < m.L / 2 + (ore === ai.ids.item.hydrocarbon ? 50 : m.id === 0 ? (ore === ai.ids.item.iron_ore && moduleExt(ai, m, ore) < 3 && ai.stock(ai.ids.item.iron_plate) < 120 && ai.tick > 6000 ? 60 : 34) : ore === ai.ids.item.iron_ore ? 60 : 40))
    .map((s) => ({ s, d: Math.hypot(s.x - hx, s.y - hy) }))
    .sort((a, b) => a.d - b.d);
  for (const { s } of cand.slice(0, 3)) {
    const smelt = ore === ai.ids.item.iron_ore || ore === ai.ids.item.copper_ore || ore === ai.ids.item.silicon;
    // les premières mines alimentent le tapis principal, les suivantes directement le dépôt
    const busMines = ai.busMines.get(m.id * 100 + ore) ?? 0;
    // trafic du tapis principal limité (les bras ne posent un objet que dans un trou de 1/2 case)
    const quota = ore === ai.ids.item.iron_ore ? (m.role === "air" ? 4 : m.role === "tech" ? 4 : 5) : ore === ai.ids.item.copper_ore ? (m.role === "tech" ? 3 : 2) : 9;
    const toDepot = smelt && busMines >= quota;
    // le module principal laisse le fer en trop aux autres modules (sauf si le fer manque :
    // rééquilibrage de l'économie selon les stocks, comme LOUD)
    const ironShort = ai.stock(ai.ids.item.iron_plate) < 100 && ai.stock(ai.ids.item.copper_plate) > 400 && moduleExt(ai, m, ore) < 7;
    if (toDepot && m.role === "main" && ore === ai.ids.item.iron_ore && ai.tick > 9000 && !ironShort) {
      s.next = ai.tick + 6000;
      continue;
    }
    const places = smelt ? ai.planner.planMine(m, s.x, s.y, toDepot) : ai.planner.planExtractor(m, s.x, s.y);
    if (!places) {
      ai.log("échec du tracé de mine", ore, "en", s.x, s.y, "essai", s.tries + 1, ":", ai.planner.lastFail);
      s.tries++;
      s.next = ai.tick + 2400;
      if (s.tries > 3) s.st = 2;
      continue;
    }
    s.st = 1;
    if (!toDepot) ai.busMines.set(m.id * 100 + ore, busMines + 1);
    for (const pl of places) {
      const bd = ai.ctx.data.buildings[pl.kind];
      m.use += bd.powerUse;
      m.prod += bd.powerProd;
    }
    const key = m.id * 100 + ore;
    ai.extCount.set(key, (ai.extCount.get(key) ?? 0) + 1);
    const far = Math.hypot(s.x - ai.home[0], s.y - ai.home[1]) > 45;
    const p = newProject(ai, `ext${m.id}:${ore}`, places, { module: m, spot: s, remote: far || m.id > 0, critical: true });
    // l'extracteur compte pour le module
    (p.spot as SpotState & { key?: number }).key = key;
    return p;
  }
  return null;
}

export function makeTurret(ai: SkirmishAI, kind: number): Project | null {
  // défense du module le plus récemment menacé (LOUD : points de défense aux bases d'expansion),
  // tournée vers la menace ; sinon module principal, tourné vers les adversaires
  const t = ai.army.threat && ai.tick - ai.army.threat.tick < 1200 ? ai.army.threat : null;
  let m = ai.planner.modules[0];
  if (!m) return null;
  let dir = ai.enemyDir;
  if (t && ai.level !== "facile") {
    let bd = Infinity;
    for (const mm of ai.planner.modules) {
      const d = dist2(mm.cx * TILE, mm.cy * TILE, t.x, t.y);
      if (d < bd) {
        bd = d;
        m = mm;
      }
    }
    const dx = t.x / TILE - m.cx;
    const dy = t.y / TILE - m.cy;
    const dn = Math.hypot(dx, dy);
    if (dn > 1) dir = [dx / dn, dy / dn];
  }
  const n = ai.turretsPlanned;
  if (kind === ai.ids.b.aa_turret) ai.turretsAA++;
  // anneau orienté vers la menace (l'antiaérien plus près du centre)
  const base = Math.atan2(dir[1], dir[0]);
  const spread = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, 3.1][n % 10];
  const a = base + spread + (Math.floor(n / 10) * 0.25);
  const r = (kind === ai.ids.b.aa_turret ? m.L / 2 + 2 : m.L / 2 + 10) + Math.floor(n / 10) * 4;
  const tx = Math.round(m.cx + Math.cos(a) * r);
  const ty = Math.round(m.cy + Math.sin(a) * r);
  const pos = ai.planner.findFree(kind, tx, ty, 0, 8, 1);
  ai.turretsPlanned++;
  if (!pos) return null;
  ai.planner.mark(pos[0], pos[1], 2, 2);
  return newProject(ai, "turret", [{ kind, x: pos[0], y: pos[1], dir: 0, tag: "turret" }]);
}

export function makeModule(ai: SkirmishAI): Project | null {
  const [hx, hy] = ai.home;
  const P = ai.persona;
  const it = ai.ids.item;
  // l'aviation d'abord si un adversaire n'est pas joignable par la terre
  let plan = P.planN[ai.modulePlansUsed % P.planN.length];
  const hasAir = ai.planner.modules.some((mm) => mm.role === "air");
  const hasTech = ai.arsenal.plan !== null || ai.planner.modules.some((mm) => mm.role === "tech");
  const airReady = ai.has(ai.ids.t.electronics) && ai.has(ai.ids.t.hydrocarbons);
  // pas d'aviation sans les recherches ; pas d'armée de terre en plus si personne n'est joignable
  // progression technologique garantie : recherche à l'arrêt, ou déjà un module secondaire sans technologie
  const researchStalled = ai.me.research === 0 && ai.tick - ai.lastResearch > 3600;
  if (!hasTech && (plan === AIR_PLAN || ai.anyUnreachable() || (ai.level !== "facile" && (researchStalled || ai.planner.modules.length >= 2)))) plan = TECH_PLAN;
  else if (plan === AIR_PLAN && !airReady) plan = ARMY_PLAN;
  const nAir = ai.planner.modules.filter((mm) => mm.role === "air").length;
  if (ai.anyUnreachable() && airReady && (!hasAir || (pickTarget(ai, true) < 0 && nAir < 2))) plan = AIR_PLAN;
  if (plan === ARMY_PLAN && pickTarget(ai, true) < 0) {
    // personne à attaquer par la terre : passer au plan suivant
    ai.modulePlansUsed++;
    if (!airReady || nAir >= 2) return null;
    plan = AIR_PLAN;
  }
  // aucune usine possible dans le module principal : celui-ci sera un module d'armée, avant toute
  // autre considération (sans usine, pas d'ingénieurs ni d'armée de toute la partie)
  if (ai.factoryLost && !hasFactorySlot(ai)) plan = pickTarget(ai, true) >= 0 || !airReady ? ARMY_PLAN : AIR_PLAN;
  const air = plan === AIR_PLAN;
  const role = air ? "air" : plan === TECH_PLAN ? "tech" : plan.some((t) => t.startsWith("cell:robot")) ? "army" : "tech";
  // près des gisements libres les plus proches, du côté opposé aux adversaires si possible
  const comp = landComponents(ai.ctx.map);
  const homeComp = comp[hy * ai.ctx.map.w + hx];
  const cands = ai.spots
    .filter((s) => s.st === 0 && (s.kind === it.iron_ore || s.kind === it.copper_ore))
    .map((s) => {
      const d = Math.hypot(s.x - hx, s.y - hy);
      const toward = ((s.x - hx) * ai.enemyDir[0] + (s.y - hy) * ai.enemyDir[1]) / (d || 1);
      // densité de gisements autour
      let dens = 0;
      let hydro = false;
      for (const o of ai.spots) {
        if (o === s || o.st !== 0 || Math.abs(o.x - s.x) >= 30 || Math.abs(o.y - s.y) >= 30) continue;
        dens += o.kind === it.iron_ore ? 2 : o.kind === it.copper_ore ? 1 : 0;
        if (o.kind === it.hydrocarbon) hydro = true;
      }
      if (s.kind === it.iron_ore) dens += 2;
      // autre terre (atteinte par les ingénieurs glisseurs) : seulement en dernier recours
      const away = comp[s.y * ai.ctx.map.w + s.x] !== homeComp;
      return { s, away, score: d + toward * 25 - dens * 8 - (air && hydro ? 40 : 0) + (away ? 400 : 0) };
    })
    .filter((c) => Math.hypot(c.s.x - hx, c.s.y - hy) < (c.away ? 220 : 120))
    .sort((a, b) => a.score - b.score);
  for (const { s } of cands.slice(0, 4)) {
    const near = ai.spots.filter((o) => Math.abs(o.x - s.x) < 60 && Math.abs(o.y - s.y) < 60);
    // centre décalé vers la base
    const dx = hx - s.x;
    const dy = hy - s.y;
    const dn = Math.hypot(dx, dy) || 1;
    const cx = Math.round(s.x + (dx / dn) * 14);
    const cy = Math.round(s.y + (dy / dn) * 14);
    const m = ai.planner.findModule(cx, cy, near, [38, 32, 26], 8);
    if (!m) {
      s.tries++;
      continue;
    }
    // le plan choisi est consommé (les plans forcés aussi, pour ne pas les répéter)
    if (plan === P.planN[ai.modulePlansUsed % P.planN.length]) ai.modulePlansUsed++;
    m.role = role;
    ai.pendingPlan.set(m, [...plan]);
    ai.produces.set(m, new Set());
    if (plan === ARMY_PLAN) ai.factoryLost = false;
    ai.log("module", m.id, m.role, "en", m.cx, m.cy);
    return busProject(ai, m, true);
  }
  return null;
}
