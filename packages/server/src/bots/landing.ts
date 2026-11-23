// Transports et débarquements de l'IA.
//
// L'IA produit quelques transports quand un adversaire n'est pas joignable par la terre (c'est alors son
// mode d'attaque terrestre normal), ou quand ses assauts terrestres sont repoussés. Un débarquement :
// - load    : chaque transport va chercher ses passagers (pris dans le peloton terrestre en formation) ;
// - fly     : vol vers un point du sol ennemi peu défendu, surtout contre l'aviation, près d'un objectif ;
// - return  : demi-tour (trop de pertes en route, base envahie) ;
// puis les transports rentrent, et les troupes débarquées (groupe) attaquent ce qu'elles ont sous la main ;
// sans plus d'objectif sur cette terre, elles attendent qu'un transport libre vienne les reprendre.
import type { BotBuilding, BotUnit, Cmd } from "@supreme/shared";
import { move, load, point, target, factoryQueue, rally, O, Layer, BUILD_FULL } from "@supreme/shared";
import { TILE, dist2 } from "./util.ts";
import { T, kindPowers } from "./intel.ts";
import { arsenalDepot, arsenalWanted } from "./arsenal.ts";
import { landComponents } from "./ai.ts";
import type { Placement } from "./layout.ts";
import type { SkirmishAI, EngBuilder } from "./ai.ts";

const MIN = 1200;

export interface LandingOp {
  id: number;
  phase: "load" | "fly" | "return";
  /** transport -> passagers prévus */
  assign: Map<number, number[]>;
  /** transports et passagers au départ de l'opération (pertes) */
  carriers0: number;
  since: number;
  lastOrder: number;
  /** point de débarquement, objectif, terre visée */
  lx: number;
  ly: number;
  ox: number;
  oy: number;
  comp: number;
  player: number;
  /** groupe repris sur une autre terre (id), 0 : troupes de la base */
  from: number;
}

/** Troupes débarquées. */
export interface LandGroup {
  id: number;
  units: Set<number>;
  ox: number;
  oy: number;
  comp: number;
  tx: number;
  ty: number;
  lastOrder: number;
  since: number;
  /** sans objectif sur cette terre depuis ce tick (0 : en a un) */
  idleSince: number;
  /** rendu à l'armée, ou réembarqué */
  done?: boolean;
}

export interface LandingState {
  wanted: boolean;
  lastCheck: number;
  op: LandingOp | null;
  groups: LandGroup[];
  nextId: number;
  lastOp: number;
  /** usine aérienne de l'arsenal */
  yard: { x: number; y: number; dir: number } | null;
  yardTries: number;
  yardNext: number;
  lastQ: Record<number, number>;
  homeOrder: Record<number, number>;
  /** débarquements anéantis : objectif et tick (moins tentant un moment) */
  fails: { x: number; y: number; tick: number }[];
  stats: { ops: number; landed: number; lost: number };
}

export function newLanding(): LandingState {
  return { wanted: false, lastCheck: -1e9, op: null, groups: [], nextId: 1, lastOp: -1e9, yard: null, yardTries: 0, yardNext: 0, lastQ: {}, homeOrder: {}, fails: [], stats: { ops: 0, landed: 0, lost: 0 } };
}

/** Transport aérien (le marcheur de siège transporte aussi, mais c'est une unité de combat). */
export function isTransport(ai: SkirmishAI, kind: number): boolean {
  const d = ai.ctx.data.units[kind];
  return d.carry > 0 && d.layer === Layer.Air;
}

/** Unité menée par un débarquement (hors des pelotons de l'armée). */
export function landingOwns(ai: SkirmishAI): Set<number> {
  const s = new Set<number>();
  const S = ai.landing;
  if (S.op) for (const l of S.op.assign.values()) for (const id of l) s.add(id);
  for (const g of S.groups) for (const id of g.units) s.add(id);
  return s;
}

function tileOf(ai: SkirmishAI, x: number, y: number): number {
  const m = ai.ctx.map;
  return Math.max(0, Math.min(m.h - 1, Math.floor(y / TILE))) * m.w + Math.max(0, Math.min(m.w - 1, Math.floor(x / TILE)));
}

/** Aucun adversaire n'a sa base sur notre terre. */
export function isolated(ai: SkirmishAI): boolean {
  return ai.enemyIds.length > 0 && !ai.enemyIds.some((e) => ai.baseReachable(e));
}

/** Faut-il des transports ? (une fois par 10 s) */
export function landingGoal(ai: SkirmishAI): void {
  const S = ai.landing;
  if (S.wanted || ai.tick - S.lastCheck < 200) return;
  S.lastCheck = ai.tick;
  const iso = isolated(ai);
  if (ai.level === "facile") {
    S.wanted = iso && ai.tick > 15 * MIN;
    return;
  }
  if (ai.tick < 5 * MIN) return;
  const island = ai.enemyIds.some((e) => !ai.baseReachable(e));
  // défense terrestre forte : plusieurs assauts repoussés par l'adversaire visé
  const repelled = ai.landTarget >= 0 ? ai.army.repelled[ai.landTarget] ?? 0 : 0;
  S.wanted = iso || (island && ai.tick > 8 * MIN) || (repelled >= 4 && ai.tick > 14 * MIN);
  if (S.wanted) ai.log("transports voulus", iso ? "(île)" : island ? "(un adversaire est sur une île)" : "(défense terrestre forte)");
}

function transportsWanted(ai: SkirmishAI): number {
  if (!ai.landing.wanted) return 0;
  if (ai.level === "facile") return 2;
  return Math.min(6, ai.persona.transports + (isolated(ai) ? 1 : 0) + (ai.level === "difficile" ? 1 : 0));
}

// ---------- Usine et production ----------

/** Usines aériennes qui peuvent puiser au dépôt de l'arsenal. */
function airYards(ai: SkirmishAI): BotBuilding[] {
  const dep = arsenalDepot(ai);
  const r = (ai.ctx.data.depot?.factorySupply ?? 30) - 1;
  return ai.ix.buildingsBy[ai.ctx.slot].filter((b) => b.kind === ai.ids.b.air_factory && b.build >= BUILD_FULL && dep !== null && Math.hypot(b.x + 1.5 - dep.x - 1, b.y + 1.5 - dep.y - 1) <= r);
}

export function landingBuilders(ai: SkirmishAI, L: EngBuilder[]): void {
  const S = ai.landing;
  if (!S.wanted || !arsenalWanted(ai) || !ai.arsenal.plan || !arsenalDepot(ai)) return;
  if (!ai.has(ai.ids.t.electronics) || S.yardNext > ai.tick || S.yardTries >= 6) return;
  if (S.yard && ai.placementState({ kind: ai.ids.b.air_factory, x: S.yard.x, y: S.yard.y, dir: 0 }) === 0 && !ai.projects.some((p) => p.name === "airyard")) S.yard = null;
  if (S.yard || airYards(ai).length) return;
  L.push({ name: "airyard", prio: 804, est: [0, 0, 20, 10, 15], make: () => makeAirYard(ai) });
}

function makeAirYard(ai: SkirmishAI) {
  const S = ai.landing;
  const plan = ai.arsenal.plan;
  if (!plan) return null;
  S.yardTries++;
  const kind = ai.ids.b.air_factory;
  const [dx, dy] = plan.depot;
  for (const [ox, oy] of [[0, 0], [14, 0], [-14, 0], [0, 14], [0, -14]]) {
    const pos = ai.planner.findFree(kind, dx + ox, dy + oy, 0, 24, 1);
    if (!pos || Math.hypot(pos[0] - dx, pos[1] - dy) > 26) continue;
    const places: Placement[] = [{ kind, x: pos[0], y: pos[1], dir: 0, tag: "factory" }];
    const power = ai.planner.robust(() => {
      const p = ai.planner.ensurePower(pos[0], pos[1], 3, 3);
      return p.length || ai.planner.covered(pos[0], pos[1], 3, 3) ? [...p, ...ai.planner.bridgeAll(places)] : null;
    });
    if (!power) continue;
    ai.planner.mark(pos[0], pos[1], 3, 2);
    plan.mod.use += ai.ctx.data.buildings[kind].powerUse;
    for (const p of power) plan.mod.prod += ai.ctx.data.buildings[p.kind].powerProd;
    S.yard = { x: pos[0], y: pos[1], dir: 0 };
    return ai.newProject("airyard", [...power, ...places], {});
  }
  S.yardNext = ai.tick + 1800;
  return null;
}

export function transports(ai: SkirmishAI): BotUnit[] {
  return ai.ix.unitsBy[ai.ctx.slot].filter((u) => isTransport(ai, u.kind));
}

export function landingFactories(ai: SkirmishAI, out: Cmd[]): void {
  const S = ai.landing;
  if (!S.wanted) return;
  const data = ai.ctx.data;
  const have = transports(ai).length;
  const want = transportsWanted(ai);
  const u = ai.ids.u;
  let queued = 0;
  for (const b of airYards(ai)) {
    const own = S.yard !== null && b.x === S.yard.x && b.y === S.yard.y;
    if (S.lastQ[b.ref] === undefined) {
      S.lastQ[b.ref] = -1e9;
      if (own) {
        const [rx, ry] = ai.baseCenter();
        out.push(rally(b.ref, rx, ry));
      }
    }
    if (b.queue >= 1 || ai.tick - S.lastQ[b.ref] < 60 || ai.me.unitCount >= 950) continue;
    const afford = (k: number, times = 1) => k !== undefined && ai.has(data.units[k].tech) && data.units[k].cost.every(([i, n]) => ai.stock(i) >= n * times);
    let pick = -1;
    if (have + queued < want) {
      if (have >= 2 && afford(u.heavy_transport)) pick = u.heavy_transport;
      else if (afford(u.transport)) pick = u.transport;
      if (pick >= 0) queued++;
    } else if (own) {
      // transports au complet : quelques chasseurs d'escorte, davantage contre une forte aviation ennemie
      let fighters = 0;
      for (const x of ai.ix.unitsBy[ai.ctx.slot]) if (x.kind === u.interceptor || x.kind === u.asf) fighters++;
      if (fighters < 6 + ai.airRatio * 12 && ai.stock(ai.ids.item.steel) >= 70) {
        if (afford(u.asf, 3)) pick = u.asf;
        else if (afford(u.interceptor, 3)) pick = u.interceptor;
      }
    }
    if (pick < 0) continue;
    out.push(factoryQueue(b.ref, pick, 1));
    S.lastQ[b.ref] = ai.tick;
  }
}

// ---------- Choix du point de débarquement ----------

function groundPower(ai: SkirmishAI, us: BotUnit[]): number {
  const kp = kindPowers(ai.ctx.data).units;
  let s = 0;
  for (const u of us) s += kp[u.kind].ground * Math.sqrt(Math.max(0.05, Math.min(1, u.hp / Math.max(1, ai.ctx.data.units[u.kind].hp))));
  return s;
}

interface Landing {
  lx: number;
  ly: number;
  ox: number;
  oy: number;
  comp: number;
  player: number;
}

/** Défense antiaérienne le long du vol (points tous les 24 cases, l'arrivée exceptée). */
function routeAA(ai: SkirmishAI, x0: number, y0: number, x1: number, y1: number): number {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.floor(d / (24 * TILE));
  let s = 0;
  for (let k = 1; k < n; k++) s += ai.enemySum(T.AntiAir, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, 14);
  return s;
}

/**
 * Où débarquer un groupe de puissance `power` porté par `n` transports partis de (fx, fy) : les objectifs
 * (bâtiments de valeur, commandant) les moins défendus au sol et contre l'aviation, sur une autre terre que
 * `avoid` si possible ; puis la case de terre la plus sûre près de l'objectif.
 */
export function chooseLanding(ai: SkirmishAI, power: number, n: number, fx: number, fy: number, sameLand: boolean): Landing | null {
  const I = ai.intel;
  const map = ai.ctx.map;
  const comp = landComponents(map);
  const home = comp[tileOf(ai, fx, fy)];
  const cands: { x: number; y: number; c: number; e: number; s: number }[] = [];
  for (const e of ai.enemyIds) {
    const seen = new Set<number>();
    const add = (x: number, y: number, value: number) => {
      const c = comp[tileOf(ai, x, y)];
      if (c < 0 || (c === home && !sameLand)) return;
      const threat = ai.enemySum(T.Surface, x, y, 22);
      const aa = ai.enemySum(T.AntiAir, x, y, 14);
      const d = Math.sqrt(dist2(x, y, fx, fy)) / TILE;
      let s = Math.pow(value, 0.6) / (1 + (threat / Math.max(1, power)) * 2) / (1 + aa / (150 * n)) / (1 + d / 400);
      if (threat > power * 1.5) s *= 0.2;
      for (const k of ai.landing.fails) if (ai.tick - k.tick < 7200 && dist2(k.x, k.y, x, y) < (24 * TILE) ** 2) s *= 0.4;
      cands.push({ x, y, c, e, s });
    };
    for (const b of ai.ix.buildingsBy[e]) {
      const x = b.x * TILE + TILE;
      const y = b.y * TILE + TILE;
      const c = I.cell(x, y);
      if (seen.has(c) || I.layers[e][T.Eco][c] < 1) continue;
      seen.add(c);
      add(x, y, I.sum([e], T.Eco, x, y, 16));
    }
    const cmd = ai.unitById(ai.view.players[e].commander);
    if (cmd) add(cmd.x, cmd.y, 2500);
  }
  cands.sort((a, b) => b.s - a.s);
  for (const c of cands.slice(0, 10)) {
    let best: [number, number] | null = null;
    let bs = Infinity;
    for (const r of [9, 13, 17]) {
      for (let k = 0; k < 12; k++) {
        const x = c.x + Math.cos((k * Math.PI) / 6) * r * TILE;
        const y = c.y + Math.sin((k * Math.PI) / 6) * r * TILE;
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        if (tx < 4 || ty < 4 || tx >= map.w - 4 || ty >= map.h - 4) continue;
        let ok = true;
        for (let dy = -2; dy <= 2 && ok; dy += 2) for (let dx = -2; dx <= 2 && ok; dx += 2) ok = comp[(ty + dy) * map.w + tx + dx] === c.c;
        if (!ok) continue;
        const s = ai.enemySum(T.AntiAir, x, y, 14) * 1.5 + ai.enemySum(T.Surface, x, y, 12) + r * 2 + (Math.sqrt(dist2(x, y, fx, fy)) / TILE) * 0.5;
        if (s < bs) {
          bs = s;
          best = [x, y];
        }
      }
    }
    if (!best) continue;
    // défense antiaérienne trop forte (en route ou sur place) : les transports n'arriveraient pas
    const aa = ai.enemySum(T.AntiAir, best[0], best[1], 14) + routeAA(ai, fx, fy, best[0], best[1]) * 0.5;
    if (ai.level !== "facile" && aa > 300 * n) continue;
    return { lx: best[0], ly: best[1], ox: c.x, oy: c.y, comp: c.c, player: c.e };
  }
  return null;
}

// ---------- Conduite ----------

export function landingThink(ai: SkirmishAI, out: Cmd[]): void {
  const S = ai.landing;
  const all = transports(ai);
  if (!all.length && !S.op && !S.groups.length) return;
  const mine = new Map<number, BotUnit>();
  for (const u of ai.view.units) if (u.owner === ai.ctx.slot) mine.set(u.id, u);
  if (S.op) opThink(ai, S.op, mine, out);
  groupsThink(ai, mine, out);
  homeThink(ai, all, out);
  if (!S.op) startOp(ai, all, mine, out);
}

/** Transports hors opération : retour à la base, et passagers oubliés rendus au sol. */
function homeThink(ai: SkirmishAI, all: BotUnit[], out: Cmd[]): void {
  const S = ai.landing;
  const [bx, by] = ai.baseCenter();
  for (const u of all) {
    if (S.op?.assign.has(u.id)) continue;
    if (u.nOrders > 0 && ai.tick - (S.homeOrder[u.id] ?? -1e9) < 1200) continue;
    if (u.cargo > 0 && u.nOrders === 0) {
      const [px, py] = landSpot(ai, ...ai.rallyPoint());
      out.push(point(O.UNLOAD, [u.id], px, py));
      S.homeOrder[u.id] = ai.tick;
    } else if (u.cargo === 0 && u.nOrders === 0 && dist2(u.x, u.y, bx, by) > (30 * TILE) ** 2) {
      out.push(move([u], bx, by));
      S.homeOrder[u.id] = ai.tick;
    }
  }
}

/** Case de notre terre de départ la plus proche d'un point. */
function landSpot(ai: SkirmishAI, x: number, y: number): [number, number] {
  return ai.landNear(x, y, ai.home[0] * TILE, ai.home[1] * TILE);
}

/** Passager possible : de l'armée de terre, pas trop gros, pas au combat pour la base. */
function fits(ai: SkirmishAI, u: BotUnit, heavy: boolean): boolean {
  const d = ai.ctx.data.units[u.kind];
  return (d.layer === Layer.Land || d.layer === Layer.Hover) && d.radius <= (heavy ? 520 : 300) && d.tier < 6 && ai.isCombat(u.kind);
}

function startOp(ai: SkirmishAI, all: BotUnit[], mine: Map<number, BotUnit>, out: Cmd[]): void {
  const S = ai.landing;
  const iso = isolated(ai);
  if (!S.wanted || ai.baseInvaded()) return;
  const easy = ai.level === "facile" ? 2 : 1;
  if (ai.tick - S.lastOp < (iso ? 600 : 2400) * easy || ai.tick < ai.persona.attackDelay * 0.8 * easy) return;
  const [bx, by] = ai.baseCenter();
  const ready = all.filter((u) => u.cargo === 0 && dist2(u.x, u.y, bx, by) < (70 * TILE) ** 2 && u.hp > ai.ctx.data.units[u.kind].hp * 0.4);
  if (!ready.length) return;
  // 1) un groupe débarqué qui n'a plus rien à faire sur sa terre ; 2) le peloton terrestre de la base
  const stuck = S.groups.find((g) => g.idleSince > 0 && ai.tick - g.idleSince > 400 && g.units.size >= 4);
  let pool: BotUnit[];
  if (stuck) pool = [...stuck.units].map((id) => mine.get(id)).filter((u): u is BotUnit => !!u && !u.carried);
  else {
    const min = Math.min(2, transportsWanted(ai));
    if (ready.length < min) return;
    pool = ai.army.reserve(ai, mine);
  }
  if (!pool.length) return;
  // passagers : les plus proches du centre du groupe, les plus forts d'abord dans les limites de place
  const cx = pool.reduce((a, u) => a + u.x, 0) / pool.length;
  const cy = pool.reduce((a, u) => a + u.y, 0) / pool.length;
  const kp = kindPowers(ai.ctx.data).units;
  const list = pool.filter((u) => dist2(u.x, u.y, cx, cy) < (45 * TILE) ** 2).sort((a, b) => kp[b.kind].ground - kp[a.kind].ground || a.id - b.id);
  const assign = new Map<number, number[]>();
  const taken: BotUnit[] = [];
  for (const c of ready.sort((a, b) => a.id - b.id)) {
    const d = ai.ctx.data.units[c.kind];
    const heavy = c.kind === ai.ids.u.heavy_transport;
    const got: number[] = [];
    for (const u of list) {
      if (got.length >= d.carry) break;
      if (taken.includes(u) || !fits(ai, u, heavy)) continue;
      got.push(u.id);
      taken.push(u);
    }
    if (got.length) assign.set(c.id, got);
  }
  const room = ready.reduce((a, u) => a + ai.ctx.data.units[u.kind].carry, 0);
  if (!stuck && taken.length < Math.max(8, Math.min(room, 30) * 0.7)) return;
  if (!taken.length) return;
  const power = groundPower(ai, taken);
  const L = chooseLanding(ai, power, assign.size, cx, cy, !iso && !stuck && sameLandAllowed(ai));
  S.lastOp = ai.tick;
  if (!L && !stuck) return;
  // groupe sans objectif ailleurs : retour à la base
  const [rx, ry] = landSpot(ai, ...ai.rallyPoint());
  const dest = L ?? { lx: rx, ly: ry, ox: rx, oy: ry, comp: landComponents(ai.ctx.map)[tileOf(ai, rx, ry)], player: -1 };
  if (stuck) {
    for (const u of taken) stuck.units.delete(u.id);
    stuck.done = true;
  }
  else ai.army.release(taken.map((u) => u.id));
  S.op = { id: S.nextId++, phase: "load", assign, carriers0: assign.size, since: ai.tick, lastOrder: ai.tick, lx: dest.lx, ly: dest.ly, ox: dest.ox, oy: dest.oy, comp: dest.comp, player: dest.player, from: stuck?.id ?? 0 };
  for (const [c, ids] of assign) out.push(load(c, ids));
  ai.log("débarquement", S.op.id, ": embarquement de", taken.length, "unités dans", assign.size, "transports, vers", Math.round(dest.lx / TILE), Math.round(dest.ly / TILE));
}

/** Un débarquement sur notre propre terre (défense terrestre forte) est-il permis ? */
function sameLandAllowed(ai: SkirmishAI): boolean {
  const t = ai.landTarget;
  return t >= 0 && (ai.army.repelled[t] ?? 0) >= 4;
}

function endOp(ai: SkirmishAI, mine: Map<number, BotUnit>): void {
  const S = ai.landing;
  const op = S.op;
  if (!op) return;
  S.op = null;
  S.lastOp = ai.tick;
  // passagers encore au sol (embarquement interrompu) : rendus à l'armée, ou à leur groupe
  if (op.from) {
    const g = S.groups.find((x) => x.id === op.from);
    if (g) for (const ids of op.assign.values()) for (const id of ids) {
      const u = mine.get(id);
      if (u && !u.carried) g.units.add(id);
    }
  }
}

function opThink(ai: SkirmishAI, op: LandingOp, mine: Map<number, BotUnit>, out: Cmd[]): void {
  const S = ai.landing;
  const tick = ai.tick;
  // pertes : un transport abattu emporte ses passagers
  for (const [c, ids] of [...op.assign]) {
    const left = ids.filter((id) => mine.has(id));
    if (!mine.has(c)) {
      // passagers qui n'avaient pas embarqué : à un autre transport, sinon rendus à l'armée
      const other = [...op.assign.keys()].find((k) => k !== c && mine.has(k));
      if (op.phase === "load" && other !== undefined) {
        const u = mine.get(other) as BotUnit;
        const list = op.assign.get(other) as number[];
        const cap = ai.ctx.data.units[u.kind].carry;
        for (const id of left) if (list.length < cap) list.push(id);
      }
      op.assign.delete(c);
      S.stats.lost++;
    } else if (left.length !== ids.length) op.assign.set(c, left);
  }
  let carriers = [...op.assign.keys()].map((id) => mine.get(id)).filter((u): u is BotUnit => !!u);
  if (!carriers.length) return endOp(ai, mine);
  if (op.phase === "load") {
    let loaded = 0;
    let waiting = 0;
    for (const c of carriers) {
      const ids = op.assign.get(c.id) as number[];
      const out1 = ids.filter((id) => !mine.get(id)?.carried);
      loaded += c.cargo;
      waiting += out1.length;
      // transport arrêté avant d'avoir tout son monde : relancer
      if (out1.length && c.nOrders === 0 && tick - op.lastOrder > 40) {
        out.push(load(c.id, out1));
        op.lastOrder = tick;
      }
    }
    const late = tick - op.since > 1400;
    if (ai.baseInvaded() && !op.from) {
      ai.log("débarquement", op.id, ": base envahie, embarquement annulé");
      op.phase = "return";
      op.since = tick;
      op.lastOrder = -1e9;
      return;
    }
    if (waiting > 0 && !late) return;
    // passagers restés au sol : rendus à l'armée (ou à leur groupe)
    const g = op.from ? S.groups.find((x) => x.id === op.from) : undefined;
    for (const c of carriers) {
      const ids = op.assign.get(c.id) as number[];
      const aboard = ids.filter((id) => mine.get(id)?.carried);
      if (g) for (const id of ids) if (!aboard.includes(id)) g.units.add(id);
      if (aboard.length || c.cargo > 0) op.assign.set(c.id, aboard);
      else op.assign.delete(c.id);
    }
    carriers = carriers.filter((c) => op.assign.has(c.id));
    if (loaded < 4) {
      ai.log("débarquement", op.id, ": trop peu d'embarqués");
      op.phase = "return";
      op.since = tick;
      op.lastOrder = -1e9;
      return;
    }
    op.phase = "fly";
    op.since = tick;
    op.lastOrder = -1e9;
    op.carriers0 = op.assign.size;
    S.stats.ops++;
    ai.log("débarquement", op.id, ": départ,", loaded, "embarqués");
  }
  if (op.phase === "fly") {
    // objectif disparu pendant l'embarquement ou trop défendu contre l'aviation : un autre, ou demi-tour
    const lead = carriers[0];
    const far = Math.sqrt(dist2(lead.x, lead.y, op.lx, op.ly)) / TILE;
    if (ai.level !== "facile" && far > 50 && op.player >= 0 && tick - op.lastOrder > 100) {
      const aa = ai.enemySum(T.AntiAir, op.lx, op.ly, 14);
      const dead = !ai.view.players[op.player]?.alive;
      if (dead || aa > 400 * carriers.length || carriers.length <= op.carriers0 * 0.4) {
        const L = chooseLanding(ai, 400 * carriers.length, carriers.length, lead.x, lead.y, true);
        if (L && carriers.length > op.carriers0 * 0.4) {
          Object.assign(op, L);
          op.lastOrder = -1e9;
        } else {
          ai.log("débarquement", op.id, ": demi-tour");
          op.phase = "return";
          op.since = tick;
          op.lastOrder = -1e9;
        }
      }
    }
  }
  const [rx, ry] = landSpot(ai, ...ai.rallyPoint());
  const [gx, gy] = op.phase === "return" ? [rx, ry] : [op.lx, op.ly];
  let aboard = 0;
  let k = 0;
  for (const c of carriers) {
    if (c.cargo === 0 && !(op.assign.get(c.id) as number[]).some((id) => mine.get(id)?.carried)) {
      landed(ai, op, c.id, mine, out);
      continue;
    }
    aboard++;
    // points de débarquement écartés de quelques cases, sur la même terre
    const a = k++ * 2.4;
    const [px, py] = k === 1 ? [gx, gy] : ai.landNear(gx + Math.cos(a) * 4 * TILE, gy + Math.sin(a) * 4 * TILE, gx, gy);
    if (op.lastOrder < 0 || (c.nOrders === 0 && tick - op.lastOrder > 60)) out.push(point(O.UNLOAD, [c.id], px, py));
  }
  if (op.lastOrder < 0) op.lastOrder = tick;
  if (!aboard) {
    endOp(ai, mine);
    return;
  }
  // jamais de transport bloqué : passé le délai, demi-tour, puis débarquement sur place
  if (tick - op.since > 3600) {
    if (op.phase === "fly") {
      op.phase = "return";
      op.since = tick;
      op.lastOrder = -1e9;
    } else {
      for (const c of carriers) out.push(point(O.UNLOAD, [c.id], c.x, c.y));
      op.since = tick;
    }
  }
}

/** Un transport a débarqué ses passagers : il rentre, et ses troupes forment (ou rejoignent) un groupe. */
function landed(ai: SkirmishAI, op: LandingOp, carrier: number, mine: Map<number, BotUnit>, out: Cmd[]): void {
  const S = ai.landing;
  const ids = (op.assign.get(carrier) as number[]).filter((id) => mine.has(id));
  op.assign.delete(carrier);
  const c = mine.get(carrier) as BotUnit;
  const [bx, by] = ai.baseCenter();
  out.push(move([c], bx, by));
  S.homeOrder[carrier] = ai.tick;
  // rentrés à la base : l'armée les reprend
  const comp = landComponents(ai.ctx.map);
  const home = comp[ai.home[1] * ai.ctx.map.w + ai.home[0]];
  const here = comp[tileOf(ai, c.x, c.y)];
  if (!ids.length || op.phase === "return" || (here === home && op.player < 0)) return;
  S.stats.landed += ids.length;
  let g = S.groups.find((x) => x.id === op.id);
  if (!g) {
    g = { id: op.id, units: new Set(), ox: op.ox, oy: op.oy, comp: op.comp, tx: 0, ty: 0, lastOrder: -1e9, since: ai.tick, idleSince: 0 };
    S.groups.push(g);
    ai.log("débarquement", op.id, ": troupes au sol en", Math.round(c.x / TILE), Math.round(c.y / TILE));
  }
  for (const id of ids) g.units.add(id);
}

// ---------- Troupes débarquées ----------

function groupsThink(ai: SkirmishAI, mine: Map<number, BotUnit>, out: Cmd[]): void {
  const S = ai.landing;
  const comp = landComponents(ai.ctx.map);
  const home = comp[ai.home[1] * ai.ctx.map.w + ai.home[0]];
  for (const g of S.groups) {
    const us: BotUnit[] = [];
    for (const id of g.units) {
      const u = mine.get(id);
      if (u && !u.carried) us.push(u);
      else if (!u) g.units.delete(id);
    }
    if (!us.length) continue;
    const [cx, cy] = centroid(us);
    const power = groundPower(ai, us);
    const who = ai.hostileIds;
    const cleared = g.ox === 0 || (ai.intel.sum(who, T.Eco, g.ox, g.oy, 8) < 1 && ai.intel.sum(who, T.Surface, g.ox, g.oy, 8) < 1);
    const stalled = ai.tick - g.since > 2400 && us.every((u) => u.nOrders === 0);
    if (cleared || stalled) {
      const o = nextObjective(ai, g, cx, cy, power);
      g.since = ai.tick;
      if (!o) {
        // plus rien ici : sur notre propre terre, retour à l'armée ; sinon, en attente d'un transport
        if (g.comp === home) {
          g.units.clear();
          g.done = true;
        } else if (!g.idleSince) g.idleSince = ai.tick;
        continue;
      }
      g.idleSince = 0;
      g.ox = o[0];
      g.oy = o[1];
      g.lastOrder = -1e9;
    }
    // commandant ennemi à portée de main : attaque directe
    let direct = 0;
    for (const e of ai.enemyIds) {
      const c = ai.unitById(ai.view.players[e].commander);
      if (c && dist2(c.x, c.y, cx, cy) < (20 * TILE) ** 2) direct = c.id;
    }
    if (direct) {
      const idle = us.filter((u) => u.nOrders === 0 || ai.tick - g.lastOrder > 400);
      if (idle.length && ai.tick - g.lastOrder > 60) {
        out.push(target(O.ATTACK, idle.map((u) => u.id), direct));
        g.lastOrder = ai.tick;
      }
      continue;
    }
    const moved = dist2(g.tx, g.ty, g.ox, g.oy) > (6 * TILE) ** 2;
    const idle = us.filter((u) => u.nOrders === 0 && dist2(u.x, u.y, g.ox, g.oy) > (8 * TILE) ** 2);
    if (moved || ai.tick - g.lastOrder > 900) {
      out.push(move(us, g.ox, g.oy, false, true));
      g.tx = g.ox;
      g.ty = g.oy;
      g.lastOrder = ai.tick;
    } else if (idle.length && ai.tick - g.lastOrder > 80) {
      out.push(move(idle, g.ox, g.oy, false, true));
      g.lastOrder = ai.tick;
    }
  }
  // groupe anéanti sur son objectif : cet endroit est plus défendu qu'il n'en a l'air
  for (const g of S.groups) if (g.units.size === 0 && !g.done) S.fails.push({ x: g.ox, y: g.oy, tick: ai.tick });
  S.fails = S.fails.filter((k) => ai.tick - k.tick < 7200).slice(-12);
  S.groups = S.groups.filter((g) => g.units.size > 0);
}

/** Objectif suivant d'un groupe débarqué, sur la même terre : proche, de valeur, peu défendu. */
function nextObjective(ai: SkirmishAI, g: LandGroup, cx: number, cy: number, power: number): [number, number] | null {
  const comp = landComponents(ai.ctx.map);
  const I = ai.intel;
  let best: [number, number] | null = null;
  let bs = 0;
  const consider = (x: number, y: number, value: number) => {
    if (comp[tileOf(ai, x, y)] !== g.comp) return;
    const threat = ai.enemySum(T.Surface, x, y, 18);
    const d = Math.sqrt(dist2(x, y, cx, cy)) / TILE;
    const s = Math.pow(value, 0.6) / (1 + (threat / Math.max(1, power)) * 2) / (1 + d / 60);
    if (s > bs) {
      bs = s;
      best = [x, y];
    }
  };
  for (const e of ai.enemyIds) {
    const seen = new Set<number>();
    for (const b of ai.ix.buildingsBy[e]) {
      const x = b.x * TILE + TILE;
      const y = b.y * TILE + TILE;
      const c = I.cell(x, y);
      if (seen.has(c) || I.layers[e][T.Eco][c] < 1) continue;
      seen.add(c);
      consider(x, y, I.layers[e][T.Eco][c]);
    }
    const cmd = ai.unitById(ai.view.players[e].commander);
    if (cmd) consider(cmd.x, cmd.y, 1500);
  }
  return best;
}

function centroid(us: BotUnit[]): [number, number] {
  let x = 0;
  let y = 0;
  for (const u of us) {
    x += u.x;
    y += u.y;
  }
  return [x / us.length, y / us.length];
}

/** Transport de tête d'un débarquement en vol (escorte des chasseurs), ou null. */
export function convoy(ai: SkirmishAI): BotUnit | null {
  const op = ai.landing.op;
  if (!op || op.phase !== "fly") return null;
  for (const id of op.assign.keys()) {
    const u = ai.unitById(id);
    if (u) return u;
  }
  return null;
}

/** Recherches que les transports demandent. */
export function landingResearch(ai: SkirmishAI): { first: string[]; later: string[] } {
  if (!ai.landing.wanted || !arsenalWanted(ai)) return { first: [], later: [] };
  // sur une île, l'attaque ennemie viendra aussi par les airs
  return { first: isolated(ai) ? ["electronics", "aa_turret", "hydrocarbons"] : ["electronics", "hydrocarbons"], later: ["heavy_air"] };
}
