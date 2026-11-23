// Arsenal de l'IA : les composants de la marine et des transports (acier, moteurs, munitions, circuits,
// carburant) et les lots de recherche de paliers 2 à 4, que les modules « sushi » peinent à fournir.
//
// Un dépôt, une boucle de tapis qui en part et y revient, et des ateliers le long de la boucle, chacun avec
// un bras d'entrée et un bras de sortie (tracé : Planner.planArsenal). Les filtres du dépôt choisissent ce
// qui circule : l'IA y met, à chaque décision, les quatre objets qui manquent le plus aux ateliers. Ce
// dont personne n'a besoin revient au dépôt, donc la boucle ne se bouche jamais tant qu'aucun objet n'y
// atteint son plafond : chaque atelier s'arrête quand son produit est en réserve, et chaque source (tapis
// venu du dépôt principal, mines propres) quand le dépôt en a assez.
//
// L'arsenal n'est construit que si l'IA veut une marine ou des transports (voir navy.ts et landing.ts).
import type { BotBuilding, Cmd } from "@supreme/shared";
import { setFilters, setPause, setRecipe, upgrade, BUILD_FULL } from "@supreme/shared";
import { ARSENAL_ID, type ArsenalPlan, type ArsenalSlot, type Placement } from "./layout.ts";
import { landComponents } from "./ai.ts";
import type { SkirmishAI, EngBuilder } from "./ai.ts";

/** Ateliers de la rangée centrale ; les câbles vont droit à l'atelier de circuits collé (voir planArsenal). */
const INNER = ["A:cable", "A:circuit", "A:gear", "A:arm_part", "A:cable", "A:circuit", "A:pack1", "A:ammo"];
/** Ateliers des rangées extérieures. Les fonderies d'acier sont hors de la boucle si possible. */
const OUTER = ["A:pack2", "lab", "A:pack3", "A:engine", "lab", "R:fuel", "F:iron_plate", "F:wafer", "A:processor", "C:composite", "lab", "A:pack4", "A:gear", "lab"];
/** Ateliers sans lesquels il n'y a ni marine ni transports (arsenal plus court si la place manque). */
const MIN_SLOTS = 12;
/** Ordre de construction : d'abord la recherche de palier 2, puis l'acier et ce qu'il permet. */
const ORDER = ["A:cable", "A:circuit", "A:gear", "A:arm_part", "A:pack1", "lab", "A:pack2", "F:steel", "A:ammo", "A:engine", "A:pack3"];
/** Réserve visée au dépôt de l'arsenal : au-delà, l'atelier s'arrête. */
const TARGET: Record<string, number> = { iron_plate: 300, gear: 60, circuit: 90, arm_part: 12, steel: 160, ammo: 70, engine: 45, fuel: 90, wafer: 20, processor: 30, composite: 30, pack1: 10, pack2: 10, pack3: 10, pack4: 10 };
/** Bras de liaison entre le dépôt principal et le tapis de l'arsenal. */
const LINKS = 3;
/** Réserve visée du fer (au-delà, ses sources s'arrêtent) et du cuivre. */
const RAW_HIGH = 340;
const COPPER_HIGH = 140;

export interface ArsenalState {
  plan: ArsenalPlan | null;
  /** essais d'emplacement ratés, et tick avant le prochain */
  tries: number;
  next: number;
  /** des pièces de la base (boucle, liaison) ont été détruites */
  broken: boolean;
  /** bras de liaison posés (trois voulus), et module dont le dépôt les porte (le principal si possible) */
  link: number;
  linkMod: number;
  linkTries: number;
  linkNext: number;
  /** mines propres : indice de gisement (voir SkirmishAI.spots) */
  mines: number[];
  mineNext: number;
  /** le dépôt de l'arsenal a de quoi nourrir des générateurs voisins */
  fuelHere: boolean;
  /** raffinerie sur une mine de combustible (gisement), à défaut d'hydrocarbure à l'arsenal */
  refinery: { x: number; y: number } | null;
  refTries: number;
  refNext: number;
  /** relais logistiques posés, et tick avant le prochain essai */
  relays: [number, number][];
  relayNext: number;
  /** filtres en place (dépôt de l'arsenal, dépôt principal) */
  filter: number[];
  mainFilter: number[];
  /** dernier tick où chaque objet a été servi (rotation) */
  served: Record<number, number>;
  lastRecipe: Record<number, number>;
}

export function newArsenal(): ArsenalState {
  return { plan: null, tries: 0, next: 0, broken: false, link: 0, linkMod: 0, linkTries: 0, linkNext: 0, mines: [], mineNext: 0, fuelHere: false, refinery: null, refTries: 0, refNext: 0, relays: [], relayNext: 0, filter: [], mainFilter: [], served: {}, lastRecipe: {} };
}

/** L'IA a-t-elle besoin d'un arsenal (et n'a-t-elle pas renoncé à le placer) ? */
export function arsenalWanted(ai: SkirmishAI): boolean {
  return (ai.navy.wanted || ai.landing.wanted) && (ai.arsenal.plan !== null || ai.arsenal.tries < 6);
}

function built(ai: SkirmishAI, x: number, y: number, kind: number): BotBuilding | null {
  const ref = ai.ctx.sim.buildingAt(x, y);
  const b = ref ? ai.ix.bref.get(ref) : undefined;
  return b && b.owner === ai.ctx.slot && b.kind === kind && b.build >= BUILD_FULL ? b : null;
}

export function arsenalDepot(ai: SkirmishAI): BotBuilding | null {
  const p = ai.arsenal.plan;
  return p ? built(ai, p.depot[0], p.depot[1], ai.ids.b.depot) : null;
}

/** Ateliers terminés. */
export function arsenalBuilt(ai: SkirmishAI): number {
  const p = ai.arsenal.plan;
  if (!p) return 0;
  let n = 0;
  for (const s of p.slots) if (built(ai, s.x, s.y, ai.slotKind(s.type))) n++;
  return n;
}

/** Lots de recherche produits par l'arsenal (il faut au moins un de ses laboratoires). */
export function arsenalPacks(ai: SkirmishAI, packs: Set<number>): void {
  const p = ai.arsenal.plan;
  if (!p || !p.slots.some((s) => s.type === "lab" && built(ai, s.x, s.y, ai.ids.b.lab))) return;
  for (const s of p.slots) {
    if (!s.type.startsWith("A:pack") || !built(ai, s.x, s.y, ai.slotKind(s.type))) continue;
    const r = ai.slotRecipe(s.type);
    if (r !== undefined) packs.add(ai.ctx.data.recipes[r].output[0]);
  }
}

// ---------- Construction ----------

export function arsenalBuilders(ai: SkirmishAI, L: EngBuilder[]): void {
  if (!arsenalWanted(ai)) return;
  const A = ai.arsenal;
  const m0 = ai.planner.modules[0];
  const it = ai.ids.item;
  // l'usine du module principal (ingénieurs, armée) passe avant
  if (!m0 || ai.openingIdx < ai.persona.opening.length || !ai.hasFactorySlot()) return;
  if (!A.plan) {
    if (A.next <= ai.tick) L.push({ name: "arsenal", prio: 812, est: [115, 30], make: () => makeArsenal(ai) });
    return;
  }
  const dep = arsenalDepot(ai);
  if (!dep) {
    // dépôt détruit (ou chantier interrompu) : reposer ce qui manque de la base
    if (A.next <= ai.tick) L.push({ name: "arsenal", prio: 812, est: [60, 20], make: () => rebuildBase(ai) });
    return;
  }
  if (A.broken && A.next <= ai.tick && !ai.underPressure) L.push({ name: "arsenal", prio: 810, est: [20, 4], make: () => rebuildBase(ai) });
  const n = arsenalBuilt(ai);
  const links = n < 6 ? 1 : LINKS;
  if (A.link < links && A.linkTries < 4 && A.linkNext <= ai.tick) L.push({ name: "arslink", prio: A.link === 0 ? 811 : 803, est: A.link === 0 ? [30, 4] : [12, 4], make: () => makeLink(ai) });
  const mod = A.plan.mod;
  // des générateurs à sec ailleurs n'empêchent pas d'en poser près d'un dépôt qui a de l'hydrocarbure
  if (mod.prod < mod.use * 1.1 + 60 && (ai.dryGens < 2 || ai.arsenal.fuelHere)) {
    L.push({
      name: "power" + ARSENAL_ID,
      prio: mod.prod < mod.use * 0.6 ? 940 : 790,
      est: [10, 8],
      make: () => {
        const g = ai.planner.planGenerator(mod);
        if (!g) return null;
        mod.prod += 400;
        return ai.newProject("power" + ARSENAL_ID, g, {});
      },
    });
  }
  relayBuilder(ai, dep, L);
  refineryBuilder(ai, L);
  const s = nextSlot(ai);
  if (s) L.push({ name: "arsslot", prio: n < 12 ? 808 : 782, est: ai.slotEst(s.type), make: () => makeSlot(ai, s) });
  if (A.mineNext <= ai.tick && n >= 3) {
    const ore = nextMine(ai, n);
    if (ore >= 0) L.push({ name: "arsmine", prio: ore === it.iron_ore && mineCount(ai, ore) === 0 ? 868 : ore === it.iron_ore || ore === it.copper_ore ? 774 : ore === it.hydrocarbon ? 809 : 786, est: [45, 15], make: () => makeMine(ai, ore) });
  }
}

// ---------- Relais logistiques ----------
// Les drones d'un générateur et d'une usine ne puisent qu'à 30 cases. Une chaîne de relais relie au dépôt de
// l'arsenal les mines de combustible (ses générateurs) et les usines navales trop loin de lui.

function relaysAlive(ai: SkirmishAI): [number, number][] {
  return ai.arsenal.relays.filter(([x, y]) => {
    const s = ai.placementState({ kind: ai.ids.b.logistic_relay, x, y, dir: 0 });
    return s === 1 || s === 3 || ai.projects.some((p) => p.name === "relay");
  });
}

/** Les points a et b (cases) sont-ils reliés par des relais ? */
function relayed(ai: SkirmishAI, rel: [number, number][], a: [number, number], b: [number, number]): boolean {
  const d = ai.ctx.data.depot;
  if (!d) return true;
  const near = (p: [number, number], q: [number, number], r: number) => Math.hypot(p[0] + 1 - q[0], p[1] + 1 - q[1]) <= r - 1;
  const seen = new Set<number>();
  const stack: number[] = [];
  rel.forEach((p, i) => {
    if (near(p, a, d.relayRange)) {
      seen.add(i);
      stack.push(i);
    }
  });
  while (stack.length) {
    const i = stack.pop() as number;
    if (near(rel[i], b, d.relayRange)) return true;
    rel.forEach((q, j) => {
      if (!seen.has(j) && near(q, [rel[i][0] + 1, rel[i][1] + 1], d.relayLink)) {
        seen.add(j);
        stack.push(j);
      }
    });
  }
  return false;
}

/** Points que les relais doivent relier au dépôt de l'arsenal. */
function relayTargets(ai: SkirmishAI, dep: BotBuilding): [number, number][] {
  const out: [number, number][] = [];
  const r = (ai.ctx.data.depot?.factorySupply ?? 30) - 1;
  for (const y of ai.navy.yards) if (Math.hypot(y.x + 1.5 - dep.x - 1, y.y + 1.5 - dep.y - 1) > r) out.push([y.x + 1, y.y + 1]);
  // le dépôt principal (générateurs de la base)
  const dp = ai.planner.modules[0]?.bus.find((p) => p.kind === ai.ids.b.depot);
  if (dp) out.push([dp.x + 1, dp.y + 1]);
  // les dépôts pleins d'hydrocarbure les plus proches, quand des générateurs sont à sec ; et la raffinerie
  if (ai.dryGens > 0) {
    const fuel = ai.fuelDepots.filter(([x, y]) => Math.hypot(x - dep.x, y - dep.y) < 100).sort((a, b) => Math.hypot(a[0] - dep.x, a[1] - dep.y) - Math.hypot(b[0] - dep.x, b[1] - dep.y));
    out.push(...fuel.slice(0, 2));
  }
  if (ai.arsenal.refinery) out.push([ai.arsenal.refinery.x + 1, ai.arsenal.refinery.y + 1]);
  return out;
}

function relayBuilder(ai: SkirmishAI, dep: BotBuilding, L: EngBuilder[]): void {
  const A = ai.arsenal;
  if (A.relayNext > ai.tick || !ai.has(ai.ids.t.automation) || ai.projects.some((p) => p.name === "relay")) return;
  A.relays = relaysAlive(ai);
  for (const t of relayTargets(ai, dep)) {
    if (relayed(ai, A.relays, [dep.x + 1, dep.y + 1], t)) continue;
    L.push({ name: "relay", prio: 804, est: [30, 0, 0, 12, 12], make: () => makeRelays(ai, dep, t) });
    return;
  }
}

// ---------- Carburant ----------

/**
 * Aucun gisement d'hydrocarbure libre pour l'arsenal, et pas de carburant : une raffinerie sur le dépôt d'une
 * mine de combustible déjà en place (relié à l'arsenal par les relais logistiques).
 */
function refineryBuilder(ai: SkirmishAI, L: EngBuilder[]): void {
  const A = ai.arsenal;
  if (!ai.landing.wanted || !ai.has(ai.ids.t.hydrocarbons) || A.refTries >= 4 || A.refNext > ai.tick) return;
  if (A.refinery && ai.placementState({ kind: ai.ids.b.refinery, x: A.refinery.x, y: A.refinery.y, dir: 0 }) === 0 && !ai.projects.some((p) => p.name === "fuelref")) A.refinery = null;
  if (A.refinery || mineCount(ai, ai.ids.item.hydrocarbon) > 0 || ai.stock(ai.ids.item.fuel) > 60) return;
  L.push({ name: "fuelref", prio: 803, est: [14, 4, 8, 5, 4], make: () => makeRefinery(ai) });
}

function makeRefinery(ai: SkirmishAI) {
  const A = ai.arsenal;
  const plan = A.plan as ArsenalPlan;
  A.refTries++;
  A.refNext = ai.tick + 1200;
  const spots = ai.fuelMines
    .map((i) => ai.spots[i])
    .filter((s) => s.st === 1 && built(ai, s.x, s.y, ai.ids.b.extractor))
    .sort((a, b) => Math.hypot(a.x - plan.depot[0], a.y - plan.depot[1]) - Math.hypot(b.x - plan.depot[0], b.y - plan.depot[1]));
  for (const s of spots) {
    // dépôt collé devant l'extracteur
    const dep = ai.ix.buildingsBy[ai.ctx.slot].find((b) => b.kind === ai.ids.b.depot && b.build >= BUILD_FULL && Math.abs(b.x - s.x) + Math.abs(b.y - s.y) === 2 && (b.x === s.x || b.y === s.y));
    if (!dep) continue;
    const places = ai.planner.planMineRefinery(s.x, s.y, dep.x, dep.y);
    if (!places) continue;
    A.refinery = { x: places[0].x, y: places[0].y };
    return ai.newProject("fuelref", places, { remote: true });
  }
  return null;
}

function makeRelays(ai: SkirmishAI, dep: BotBuilding, t: [number, number]) {
  const A = ai.arsenal;
  const d = ai.ctx.data.depot;
  A.relayNext = ai.tick + 1200;
  if (!d) return null;
  const [ax, ay] = [dep.x + 1, dep.y + 1];
  const len = Math.hypot(t[0] - ax, t[1] - ay);
  // premier relais près du dépôt, dernier près du but, les autres à égale distance
  const first = Math.min(13, len / 2);
  const last = Math.max(first, len - 13);
  const hops = Math.max(1, Math.ceil((last - first) / (d.relayLink - 10)));
  const pts: [number, number][] = [];
  for (let k = 0; k <= hops; k++) {
    const at = (first + ((last - first) * k) / hops) / len;
    const x = Math.round(ax + (t[0] - ax) * at);
    const y = Math.round(ay + (t[1] - ay) * at);
    // un relais déjà là fait l'affaire
    const old = A.relays.find((p) => Math.hypot(p[0] - x, p[1] - y) < 5);
    const pos = old ?? ai.planner.findFree(ai.ids.b.logistic_relay, x, y, 0, 12, 0);
    if (!pos) return null;
    if (!pts.some((p) => Math.hypot(p[0] - pos[0], p[1] - pos[1]) < 4)) pts.push([pos[0], pos[1]]);
  }
  if (!relayed(ai, [...A.relays, ...pts], [ax, ay], t)) return null;
  // deux relais à la fois au plus (leurs circuits sont rares), à partir du dépôt
  const fresh = pts.filter((p) => !A.relays.some((q) => q[0] === p[0] && q[1] === p[1])).slice(0, 2);
  if (!fresh.length) return null;
  for (const [x, y] of fresh) ai.planner.mark(x, y, 2, 2);
  A.relays.push(...fresh);
  return ai.newProject("relay", fresh.map(([x, y]) => ({ kind: ai.ids.b.logistic_relay, x, y, dir: 0, tag: "relay" })), {});
}

/** Les tapis de l'arsenal ne passent pas devant les extracteurs (ils y prendraient du minerai brut). */
function lockFronts(ai: SkirmishAI): void {
  for (const b of ai.ix.buildingsBy[ai.ctx.slot]) if (b.kind === ai.ids.b.extractor) ai.planner.lockFront(b.x, b.y, b.dir);
}

function makeArsenal(ai: SkirmishAI) {
  const A = ai.arsenal;
  const [hx, hy] = ai.home;
  const m0 = ai.planner.modules[0];
  const dp = m0.bus.find((p) => p.kind === ai.ids.b.depot);
  const [mx, my] = dp ? [dp.x, dp.y] : [hx, hy];
  const coast = ai.navy.wanted ? ai.navy.coast : null;
  const comp = landComponents(ai.ctx.map);
  const homeComp = comp[hy * ai.ctx.map.w + hx];
  lockFronts(ai);
  // les tapis d'amenée des modules, qui ne se croisent pas, peuvent enfermer le dépôt principal : l'arsenal va
  // de préférence là où un tapis parti de ce dépôt peut arriver
  const RADIUS = 46;
  const grid = ai.planner.freeGrid(hx, hy, RADIUS + 40);
  const reach = ai.planner.linkReach(mx, my, 95);
  let any = false;
  // sans liaison, il faut au moins deux gisements de fer à soi
  const mines = ai.spots.filter((s) => s.kind === ai.ids.item.iron_ore && s.st === 0 && Math.hypot(s.x - hx, s.y - hy) < 60 && comp[s.y * ai.ctx.map.w + s.x] === homeComp).length;
  const weight = (x: number, y: number, tx: number, ty: number): number => {
    if (x < 1 || y < 1 || x >= ai.ctx.map.w - 1 || y >= ai.ctx.map.h - 1 || comp[y * ai.ctx.map.w + x] !== homeComp) return Infinity;
    // près du dépôt principal (le tapis qui l'alimente), puis près de la côte ; pas vers l'ennemi
    const path = reach.get(ty * ai.ctx.map.w + tx);
    if (!any && (path === undefined || path > 110)) return Infinity;
    let w = Math.hypot(x - mx, y - my) * 0.4 + (path ?? 0) * 0.6;
    if (coast) w += Math.hypot(x - coast[0], y - coast[1]) * 0.7;
    w += ((x - hx) * ai.enemyDir[0] + (y - hy) * ai.enemyDir[1]) * 0.3;
    return w;
  };
  for (const cols of [7, 6, 5, 4, 3, -7, -5, -4]) {
    // (négatif : dernier recours, sans liaison avec le dépôt principal)
    any = cols < 0;
    if (any && mines < 2) break;
    const plan = ai.planner.planArsenal(grid, hx, hy, RADIUS, Math.abs(cols), MIN_SLOTS, INNER, OUTER, weight);
    if (!plan) continue;
    // ordre de construction : un atelier de chaque type d'ORDER, puis les autres
    const first = ORDER.map((t) => plan.slots.find((s) => s.type === t)).filter((s): s is ArsenalSlot => !!s);
    plan.slots = [...first, ...plan.slots.filter((s) => !first.includes(s))];
    A.plan = plan;
    // la première liaison est tracée (et réservée) aussitôt : d'autres tapis lui couperaient le chemin
    planLink(ai);
    for (const p of plan.base) {
      const d = ai.ctx.data.buildings[p.kind];
      plan.mod.use += d.powerUse;
      plan.mod.prod += d.powerProd;
    }
    ai.log("arsenal en", plan.depot[0], plan.depot[1], cols, "colonnes, liaison", A.link ? "tracée" : "impossible : " + ai.planner.lastFail);
    return ai.newProject("arsenal", plan.base, { critical: true });
  }
  A.tries++;
  A.next = ai.tick + 2400;
  return null;
}

function rebuildBase(ai: SkirmishAI) {
  const plan = ai.arsenal.plan as ArsenalPlan;
  const places = plan.base.filter((p) => ai.placementState(p) !== 3);
  ai.arsenal.broken = false;
  ai.arsenal.next = ai.tick + 2400;
  return places.length ? ai.newProject("arsenal", places, {}) : null;
}

/** Trace une liaison (bras, tapis) depuis le dépôt d'un module jusqu'au tapis d'amenée de l'arsenal. */
function planLink(ai: SkirmishAI): Placement[] | null {
  const A = ai.arsenal;
  const plan = A.plan as ArsenalPlan;
  lockFronts(ai);
  for (const m of ai.planner.modules) {
    if (A.link > 0 && m.id !== A.linkMod) continue;
    const dp = m.bus.find((p) => p.kind === ai.ids.b.depot);
    if (!dp || !built(ai, dp.x, dp.y, ai.ids.b.depot) || Math.hypot(dp.x - plan.depot[0], dp.y - plan.depot[1]) > 85) continue;
    const places = ai.planner.planLink(dp.x, dp.y, plan.mod, ARSENAL_ID * 2 + 2);
    if (!places) continue;
    A.linkMod = m.id;
    A.link++;
    // la liaison se répare avec la boucle
    plan.base.push(...places);
    return places;
  }
  return null;
}

function makeLink(ai: SkirmishAI) {
  const A = ai.arsenal;
  const places = planLink(ai);
  if (places) return ai.newProject("arslink", places, {});
  ai.log("liaison de l'arsenal impossible :", ai.planner.lastFail);
  A.linkTries++;
  A.linkNext = ai.tick + 1800;
  return null;
}

function nextSlot(ai: SkirmishAI): ArsenalSlot | null {
  const plan = ai.arsenal.plan as ArsenalPlan;
  if (ai.projects.some((p) => p.name === "arsslot")) return null;
  for (const s of plan.slots) {
    if (s.tries >= 4 || s.next > ai.tick || !ai.slotAvailable(s.type)) continue;
    // palier 4 : seulement si le palier 3 est atteint
    if (s.type === "A:pack4" && !ai.has(ai.ids.t.chemistry)) continue;
    if (!built(ai, s.x, s.y, ai.slotKind(s.type)) || !armsBuilt(ai, s)) return s;
  }
  return null;
}

/** Atelier sans bras de sortie : laboratoire, ou câbles donnés au voisin collé. */
function noOut(s: ArsenalSlot): boolean {
  return s.type === "lab" || s.type === "A:cable";
}

function armsBuilt(ai: SkirmishAI, s: ArsenalSlot): boolean {
  if (!built(ai, s.ins.x, s.ins.y, ai.ids.b.inserter)) return false;
  return noOut(s) || !!built(ai, s.outs.x, s.outs.y, ai.ids.b.inserter);
}

function makeSlot(ai: SkirmishAI, s: ArsenalSlot) {
  const plan = ai.arsenal.plan as ArsenalPlan;
  const b = ai.ids.b;
  const kind = ai.slotKind(s.type);
  const places: Placement[] = [{ kind, x: s.x, y: s.y, dir: 0, tag: s.type }, { kind: b.inserter, ...s.ins, tag: "in" }];
  if (!noOut(s)) places.push({ kind: b.inserter, ...s.outs, tag: "out" });
  const first = s.tries === 0;
  s.tries++;
  s.next = ai.tick + 1200;
  ai.planner.robust(() => {
    for (const p of places.slice()) {
      const d = ai.ctx.data.buildings[p.kind];
      if (d.powerUse > 0) places.push(...ai.planner.ensurePower(p.x, p.y, d.w, d.w));
    }
    return places;
  });
  if (first) {
    for (const p of places) {
      const d = ai.ctx.data.buildings[p.kind];
      plan.mod.use += d.powerUse;
      plan.mod.prod += d.powerProd;
    }
  }
  return ai.newProject("arsslot", places, {});
}

// ---------- Mines propres ----------

function mineCount(ai: SkirmishAI, ore: number): number {
  return ai.arsenal.mines.filter((i) => ai.spots[i].kind === ore && ai.spots[i].st === 1).length;
}

/** Prochain minerai à amener au dépôt de l'arsenal (-1 : aucun). */
function nextMine(ai: SkirmishAI, n: number): number {
  const it = ai.ids.item;
  const want: [number, number][] = [[it.iron_ore, n >= 9 ? 3 : n >= 5 ? 2 : 1], [it.copper_ore, n >= 6 ? 1 : 0]];
  const plan = ai.arsenal.plan as ArsenalPlan;
  const ready = (type: string) => plan.slots.some((s) => s.type === type && built(ai, s.x, s.y, ai.slotKind(type)));
  // hydrocarbure : d'abord le combustible des générateurs voisins (leurs drones puisent au dépôt), puis la raffinerie
  if (n >= 4) want.unshift([it.hydrocarbon, ready("R:fuel") && n >= 14 ? 2 : 1]);
  if (ready("F:wafer")) want.unshift([it.silicon, 1]);
  for (const [ore, k] of want) if (mineCount(ai, ore) < k && (ai.failUntil.get("arsmine" + ore) ?? 0) <= ai.tick) return ore;
  return -1;
}

function makeMine(ai: SkirmishAI, ore: number) {
  const A = ai.arsenal;
  const plan = A.plan as ArsenalPlan;
  const it = ai.ids.item;
  const [dx, dy] = plan.depot;
  const comp = landComponents(ai.ctx.map);
  const w = ai.ctx.map.w;
  const home = comp[ai.home[1] * w + ai.home[0]];
  const smelt = ore === it.iron_ore || ore === it.copper_ore;
  const cand = ai.spots
    .map((s, i) => ({ s, i, d: Math.hypot(s.x - dx, s.y - dy) }))
    .filter((c) => c.s.kind === ore && c.s.st === 0 && c.s.next <= ai.tick && c.d < 62 && comp[c.s.y * w + c.s.x] === home)
    .sort((a, b) => a.d - b.d);
  lockFronts(ai);
  for (const { s, i, d } of cand.slice(0, 3)) {
    const places = ai.planner.robust(() => (smelt ? ai.planner.planMine(plan.mod, s.x, s.y, true) : ai.planner.planExtractor(plan.mod, s.x, s.y)));
    if (!places) {
      s.tries++;
      s.next = ai.tick + 2400;
      if (s.tries > 3) s.st = 2;
      continue;
    }
    s.st = 1;
    (s as { key?: number }).key = ARSENAL_ID * 100 + ore;
    A.mines.push(i);
    for (const p of places) {
      const b = ai.ctx.data.buildings[p.kind];
      plan.mod.use += b.powerUse;
      plan.mod.prod += b.powerProd;
    }
    return ai.newProject("arsmine", places, { spot: s, remote: d > 45, critical: true });
  }
  ai.failUntil.set("arsmine" + ore, ai.tick + 2400);
  return null;
}

// ---------- Pilotage : recettes, filtres, arrêts ----------

interface Info {
  inv: number[];
  stash: number[];
  recipe: number;
  enabled: boolean;
}

export function arsenalThink(ai: SkirmishAI, out: Cmd[]): void {
  const A = ai.arsenal;
  const plan = A.plan;
  if (!plan) return;
  const dep = arsenalDepot(ai);
  if (!dep) return;
  const sim = ai.ctx.sim;
  const data = ai.ctx.data;
  const it = ai.ids.item;
  const inf = sim.infoBuilding(dep.ref) as Info | null;
  if (!inf) return;
  const stash = (i: number): number => inf.stash[i] ?? 0;
  const key = (i: number): string => data.items[i].key;
  A.fuelHere = stash(it.hydrocarbon) >= 10;
  ai.ironForArsenal = stash(it.iron_plate) < 40;
  // recette de la raffinerie de la mine de combustible
  if (A.refinery) {
    const b = built(ai, A.refinery.x, A.refinery.y, ai.ids.b.refinery);
    if (b && b.recipe !== ai.ids.r.fuel && ai.tick - (A.lastRecipe[b.ref] ?? -1e9) > 100) {
      out.push(setRecipe(b.ref, ai.ids.r.fuel));
      A.lastRecipe[b.ref] = ai.tick;
    }
  }
  // besoins des ateliers : objet -> urgence (3 : à l'arrêt, 1 : bientôt)
  const need = new Map<number, number>();
  let steel = false;
  const ask = (i: number, n: number) => need.set(i, (need.get(i) ?? 0) + n);
  for (const s of plan.slots) {
    const b = built(ai, s.x, s.y, ai.slotKind(s.type));
    if (!b) continue;
    const ci = sim.infoBuilding(b.ref) as Info | null;
    if (!ci) continue;
    if (s.type === "lab") {
      const t = ai.me.research;
      if (!t) continue;
      for (let k = 0; k < data.techs[t].tier; k++) {
        if (ci.inv[k] < 1) ask(it.pack1 + k, 3);
        else if (ci.inv[k] < 2) ask(it.pack1 + k, 1);
      }
      continue;
    }
    const r = ai.slotRecipe(s.type) as number;
    const rec = data.recipes[r];
    if (b.recipe !== r) {
      if (ai.has(rec.tech) && ai.tick - (A.lastRecipe[b.ref] ?? -1e9) > 100) {
        out.push(setRecipe(b.ref, r));
        A.lastRecipe[b.ref] = ai.tick;
      }
      continue;
    }
    const prod = rec.output[0];
    // l'acier attend que le fer ait servi aux circuits et aux lots de recherche
    const lean = prod === it.steel && stash(it.iron_plate) < 80 && (!ai.has(ai.ids.t.electronics) || stash(it.circuit) < 6);
    const tgt = lean ? 30 : targetOf(ai, key(prod));
    const n = stash(prod);
    const on = ci.enabled;
    if (s.type === "A:cable") {
      // pas de réserve de câbles : l'atelier s'arrête de lui-même quand son voisin en a assez
      if (ci.inv[0] < 1) ask(it.copper_plate, 2);
      continue;
    }
    if (on && n >= tgt) out.push(setPause([b.ref], true));
    else if (!on && n < tgt * 0.75) out.push(setPause([b.ref], false));
    if (n >= tgt || (!on && n >= tgt * 0.75)) continue;
    if (s.type === "F:steel") {
      // hors de la boucle, le tapis d'amenée la nourrit ; sinon elle demande son fer comme les autres
      steel = true;
      if (s.loop && ci.inv[0] < 5) ask(it.iron_plate, 2);
      continue;
    }
    for (let j = 0; j < rec.inputs.length; j++) {
      const [inp, q] = rec.inputs[j];
      if (inp === it.cable) continue;
      if (ci.inv[j] < q) ask(inp, 3);
      else if (ci.inv[j] < 2 * q) ask(inp, 1);
    }
  }
  // filtres du dépôt : les deux objets les plus demandés qu'il a, selon l'urgence et l'attente depuis leur
  // dernier service (plus d'objets à la fois, et le fer, que tous demandent, passerait trop peu)
  const cand = [...need].filter(([i]) => stash(i) > 0).map(([i, n]): [number, number] => [i, n * (Math.min(400, ai.tick - (A.served[i] ?? -400)) + 20)]);
  cand.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  let pick = cand.slice(0, 2).map(([i]) => i);
  for (const i of pick) A.served[i] = ai.tick;
  if (!pick.length) pick = [emptyItem(inf.stash, data.items.length)];
  if (changed(A.filter, pick)) {
    out.push(setFilters(dep.ref, pick));
    A.filter = pick;
  }
  // apport du dépôt principal : fer et cuivre, seulement ce qui manque ici
  const dp = ai.planner.modules.find((m) => m.id === A.linkMod)?.bus.find((p) => p.kind === ai.ids.b.depot);
  const mb = dp ? built(ai, dp.x, dp.y, ai.ids.b.depot) : null;
  if (mb && A.link > 0) {
    const mi = sim.infoBuilding(mb.ref) as Info | null;
    if (mi) {
      const main: number[] = [];
      // les fonderies d'acier puisent sur ce tapis : il coule tant que l'acier manque
      if (stash(it.iron_plate) < (steel ? RAW_HIGH + 160 : RAW_HIGH)) main.push(it.iron_plate);
      if (stash(it.copper_plate) < COPPER_HIGH) main.push(it.copper_plate);
      if (!main.length) main.push(emptyItem(mi.stash, data.items.length));
      if (changed(A.mainFilter, main)) {
        out.push(setFilters(mb.ref, main));
        A.mainFilter = main;
      }
    }
  }
  // mines propres : arrêt quand le dépôt en a assez
  const on: number[] = [];
  const off: number[] = [];
  for (const i of A.mines) {
    const s = ai.spots[i];
    if (s.st !== 1) continue;
    const e = built(ai, s.x, s.y, ai.ids.b.extractor);
    if (!e) continue;
    const item = s.kind === it.iron_ore ? it.iron_plate : s.kind === it.copper_ore ? it.copper_plate : s.kind;
    const n = Math.max(stash(item), stash(s.kind));
    const paused = ai.pausedMines.has(e.ref);
    const high = item === it.iron_plate && steel ? RAW_HIGH + 160 : RAW_HIGH;
    if (!paused && n >= high) {
      ai.pausedMines.add(e.ref);
      off.push(e.ref);
    } else if (paused && n < high - 100) {
      ai.pausedMines.delete(e.ref);
      on.push(e.ref);
    }
  }
  if (on.length) out.push(setPause(on, false));
  if (off.length) out.push(setPause(off, true));
  if (ai.thinkN % 20 === 4) upgrades(ai, dep, out);
  if (ai.thinkN % 60 === 10) A.broken = !ai.projects.some((p) => p.name === "arsenal" || p.name === "arslink") && plan.base.some((p) => ai.placementState(p) === 0);
}

/**
 * Améliorations payées par l'acier en trop : les mines de fer à portée du dépôt (extracteur puis fonderie,
 * +60 %), et les extracteurs d'hydrocarbure quand des générateurs sont à sec. Une à la fois, sans entamer ce
 * qu'il faut aux chantiers de la marine et des transports.
 */
function upgrades(ai: SkirmishAI, dep: BotBuilding, out: Cmd[]): void {
  const it = ai.ids.item;
  const waiting = (ai.navy.wanted && !ai.navy.yards.length && ai.has(ai.ids.t.naval)) || ai.projects.some((p) => p.name === "yard" || p.name === "airyard");
  if (waiting || ai.underPressure || ai.stock(it.steel) < 70 || ai.stock(it.gear) < 20 || ai.stock(it.circuit) < 10) return;
  const reach = (ai.ctx.data.depot?.near ?? 30) - 3;
  const near = ai.ix.buildingsBy[ai.ctx.slot].filter((b) => b.build >= BUILD_FULL && Math.hypot(b.x - dep.x, b.y - dep.y) <= reach);
  if (near.some((b) => b.upgrading && b.kind !== ai.ids.b.depot)) return;
  const ext = near.filter((b) => b.kind === ai.ids.b.extractor && b.level === 0);
  const iron = ext.find((b) => b.recipe === it.iron_ore);
  // une fonderie collée à un extracteur déjà amélioré
  const furnace = near.find((b) => b.kind === ai.ids.b.furnace && b.level === 0 && b.recipe === ai.ids.r.iron_plate && near.some((e) => e.kind === ai.ids.b.extractor && e.level > 0 && Math.abs(e.x - b.x) <= 2 && Math.abs(e.y - b.y) <= 2));
  const hydro = ai.dryGens > 0 ? ext.find((b) => b.recipe === it.hydrocarbon) : undefined;
  const b = furnace ?? hydro ?? iron;
  if (b) out.push(upgrade(b.ref));
}

/** Une usine navale ou aérienne attend ses matériaux. */
export function pendingYard(ai: SkirmishAI): boolean {
  if (ai.projects.some((p) => p.name === "yard" || p.name === "airyard")) return true;
  if (ai.navy.wanted && ai.has(ai.ids.t.naval) && !ai.navy.yards.length && ai.navy.yardTries < 8) return true;
  return ai.landing.wanted && ai.has(ai.ids.t.electronics) && !ai.landing.yard && ai.landing.yardTries < 6 && !ai.ix.buildingsBy[ai.ctx.slot].some((b) => b.kind === ai.ids.b.air_factory);
}

/** Réserve visée d'un produit ; rien pour un lot dont la recherche n'a plus besoin. */
function targetOf(ai: SkirmishAI, item: string): number {
  // usine navale ou aérienne à construire : les circuits ne vont plus aux lots de recherche ni aux processeurs
  if ((item === "arm_part" || item === "processor" || item === "pack2") && ai.stock(ai.ids.item.circuit) < 20 && pendingYard(ai)) return 0;
  // de même l'acier : pas de munitions, peu de moteurs, tant que l'usine n'a pas le sien
  if (ai.stock(ai.ids.item.steel) < 40 && pendingYard(ai)) {
    if (item === "ammo" || item === "pack3") return 0;
    if (item === "engine") return 6;
  }
  if (item === "processor" && !ai.has(ai.ids.t.chemistry)) return 6;
  if (item.startsWith("pack")) return ai.researchWants(Number(item.slice(4))) ? TARGET[item] ?? 10 : 0;
  return TARGET[item] ?? 40;
}

/** Objet absent du dépôt : en filtre unique, il arrête ses sorties. */
function emptyItem(stash: number[], n: number): number {
  for (let i = n - 1; i > 0; i--) if (!(stash[i] > 0)) return i;
  return 0;
}

function changed(a: number[], b: number[]): boolean {
  return a.length !== b.length || a.some((x) => !b.includes(x));
}
