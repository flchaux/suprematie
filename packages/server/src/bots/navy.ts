// Marine de l'IA : choix du plan d'eau, usine navale, production de la flotte, missions.
//
// Une flotte vaut la peine quand un plan d'eau assez grand touche une côte proche de la base et mène à
// portée de la base d'un adversaire (water.ts), ou quand une flotte ennemie y menace la nôtre. Les navires
// libres forment la flotte de réserve, qui patrouille devant la côte et la défend ; assez forte, elle
// attaque la marine ou les installations ennemies à portée de l'eau, et rentre quand elle est dominée.
import type { BotBuilding, BotUnit, Cmd } from "@supreme/shared";
import { move, rally, factoryQueue, isFauna, Layer, BUILD_FULL } from "@supreme/shared";
import { TILE, dist2 } from "./util.ts";
import { T, kindPowers } from "./intel.ts";
import { watersOf, seaField, usefulSea, MIN_SEA, MAX_COAST } from "./water.ts";
import { arsenalDepot, arsenalWanted } from "./arsenal.ts";
import { newProject } from "./engineers.ts";
import type { Placement } from "./layout.ts";
import type { SkirmishAI, EngBuilder } from "./ai.ts";

const MIN = 1200;

export interface Fleet {
  id: number;
  units: Set<number>;
  mission: "form" | "attack" | "retreat";
  /** objectif (sous-unités), et poste de tir en mer */
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  /** position et date du dernier ordre donné au groupe */
  tx: number;
  ty: number;
  lastOrder: number;
  since: number;
  launched: number;
  mx: number;
  my: number;
  movedAt: number;
}

export interface NavyState {
  /** l'IA veut une marine (et l'arsenal qui la nourrit) */
  wanted: boolean;
  /** plan d'eau choisi (-1 : aucun) */
  sea: number;
  /** case de ce plan d'eau la plus proche de la base */
  coast: [number, number] | null;
  /** flotte ennemie dans ce plan d'eau (puissance), et dernier tick où elle menaçait nos côtes */
  enemy: number;
  threatened: number;
  threat: [number, number, number] | null;
  yards: { x: number; y: number; dir: number }[];
  yardTries: number;
  yardNext: number;
  fleets: Fleet[];
  nextId: number;
  attackSize: number;
  patrol: number;
  lastQ: Record<number, number>;
  lastCheck: number;
  /** objectifs hors d'atteinte depuis l'eau : moins tentants un moment */
  skip: { x: number; y: number; tick: number }[];
  stats: { attacks: number; retreats: number };
}

export function newNavy(): NavyState {
  return { wanted: false, sea: -1, coast: null, enemy: 0, threatened: -1e9, threat: null, yards: [], yardTries: 0, yardNext: 0, fleets: [], nextId: 1, attackSize: 4, patrol: 0, lastQ: {}, lastCheck: -1e9, skip: [], stats: { attacks: 0, retreats: 0 } };
}

export function isShip(ai: SkirmishAI, kind: number): boolean {
  const l = ai.ctx.data.units[kind].layer;
  return l === Layer.Naval || l === Layer.Sub;
}

/** Plan d'eau d'une position (sous-unités), -1 : aucun. */
function seaAt(ai: SkirmishAI, x: number, y: number): number {
  const m = ai.ctx.map;
  const tx = Math.max(0, Math.min(m.w - 1, Math.floor(x / TILE)));
  const ty = Math.max(0, Math.min(m.h - 1, Math.floor(y / TILE)));
  return watersOf(m).comp[ty * m.w + tx];
}

// ---------- Décision ----------

/** L'eau sert-elle, et faut-il une marine ? (une fois par 10 s) */
export function navyGoal(ai: SkirmishAI): void {
  const N = ai.navy;
  if (ai.ctx.map.waterLevel <= 0 || ai.tick - N.lastCheck < 200) return;
  N.lastCheck = ai.tick;
  const W = watersOf(ai.ctx.map);
  if (!W.size.length) return;
  const slot = ai.ctx.slot;
  const mine = W.dist[slot];
  // flottes ennemies, par plan d'eau proche de notre base
  const fleet = new Map<number, number>();
  const kp = kindPowers(ai.ctx.data).units;
  for (const e of ai.enemyIds) {
    for (const u of ai.ix.unitsBy[e]) {
      if (!isShip(ai, u.kind)) continue;
      const c = seaAt(ai, u.x, u.y);
      if (c >= 0) fleet.set(c, (fleet.get(c) ?? 0) + kp[u.kind].ground);
    }
    for (const b of ai.ix.buildingsBy[e]) {
      if (b.kind !== ai.ids.b.naval_factory) continue;
      const c = seaAt(ai, b.x * TILE + TILE, b.y * TILE + TILE);
      if (c >= 0) fleet.set(c, (fleet.get(c) ?? 0) + 1);
    }
  }
  if (!N.yards.length) {
    let sea = usefulSea(ai.ctx.map, slot, ai.enemyIds);
    if (sea < 0) {
      // plan d'eau contesté : une flotte ou un chantier naval ennemi devant notre côte
      let best = 0;
      for (const [c, p] of fleet) {
        if (W.size[c] >= MIN_SEA && mine[c] <= MAX_COAST && p > best) {
          best = p;
          sea = c;
        }
      }
    }
    if (sea !== N.sea) {
      N.sea = sea;
      N.coast = sea >= 0 ? nearestSea(ai, sea) : null;
    }
  }
  N.enemy = N.sea >= 0 ? fleet.get(N.sea) ?? 0 : 0;
  if (N.sea < 0) {
    N.wanted = false;
    return;
  }
  if (N.wanted) return;
  const isolated = !ai.enemyIds.some((e) => ai.baseReachable(e));
  const menace = N.enemy > 60;
  if (ai.level === "facile") {
    // niveau facile : une petite flotte, tard, et seulement pour une île ou contre une flotte ennemie
    N.wanted = ai.tick > 20 * MIN && (isolated || menace);
    return;
  }
  const taste = ai.persona.naval;
  N.wanted = (menace && ai.tick > 4 * MIN) || (ai.tick > 5 * MIN && (isolated || taste >= 0.5));
  if (N.wanted) ai.log("marine voulue : plan d'eau", N.sea, "taille", W.size[N.sea], "flotte ennemie", N.enemy.toFixed(0));
}

/** Case du plan d'eau la plus proche du départ. */
function nearestSea(ai: SkirmishAI, sea: number): [number, number] | null {
  const [hx, hy] = ai.home;
  const f = seaField(ai.ctx.map, sea);
  const i = f.near[hy * ai.ctx.map.w + hx];
  if (i >= 0) return [i % ai.ctx.map.w, (i / ai.ctx.map.w) | 0];
  // plus loin que le champ de proximité : parcours direct
  const { comp } = watersOf(ai.ctx.map);
  let best: [number, number] | null = null;
  let bd = Infinity;
  for (let y = 0; y < ai.ctx.map.h; y++)
    for (let x = 0; x < ai.ctx.map.w; x++) {
      if (comp[y * ai.ctx.map.w + x] !== sea) continue;
      const d = (x - hx) ** 2 + (y - hy) ** 2;
      if (d < bd) {
        bd = d;
        best = [x, y];
      }
    }
  return best;
}

// ---------- Usine navale ----------

export function navyYards(ai: SkirmishAI): BotBuilding[] {
  return ai.ix.buildingsBy[ai.ctx.slot].filter((b) => b.kind === ai.ids.b.naval_factory && b.build >= BUILD_FULL);
}

export function navyBuilders(ai: SkirmishAI, L: EngBuilder[]): void {
  const N = ai.navy;
  if (!N.wanted || N.sea < 0 || !ai.has(ai.ids.t.naval)) return;
  // chantiers détruits : leur place se libère
  N.yards = N.yards.filter((y) => ai.projects.some((p) => p.name === "yard") || ai.placementState({ kind: ai.ids.b.naval_factory, x: y.x, y: y.y, dir: 0 }) !== 0);
  const ships = fleetSize(ai);
  const it = ai.ids.item;
  const want = ai.level === "facile" ? 1 : ships >= 5 && ai.stock(it.steel) > 220 && ai.stock(it.engine) > 30 ? 2 : 1;
  if (N.yards.length < want && N.yardNext <= ai.tick && N.yardTries < 8 && ai.stock(it.engine) >= 5) {
    L.push({ name: "yard", prio: 806, est: [0, 0, 30, 0, 15], make: () => makeYard(ai) });
  }
}

function makeYard(ai: SkirmishAI) {
  const N = ai.navy;
  N.yardTries++;
  const map = ai.ctx.map;
  const { comp } = watersOf(map);
  const kind = ai.ids.b.naval_factory;
  const dep = arsenalDepot(ai);
  const [ax, ay] = dep ? [dep.x, dep.y] : (ai.arsenal.plan?.depot ?? ai.home);
  const [hx, hy] = ai.home;
  const R = 80;
  const cands: { x: number; y: number; w: number }[] = [];
  const sea = (x: number, y: number) => x >= 1 && y >= 1 && x < map.w - 1 && y < map.h - 1 && comp[y * map.w + x] === N.sea;
  for (let y = Math.max(2, ay - R); y < Math.min(map.h - 6, ay + R); y++) {
    for (let x = Math.max(2, ax - R); x < Math.min(map.w - 6, ax + R); x++) {
      if (!sea(x, y) || !sea(x + 2, y + 2) || !sea(x + 2, y) || !sea(x, y + 2) || !sea(x + 1, y + 1)) continue;
      // une terre à quelques cases, pour le relais électrique ; pas collé à la côte (la sortie doit rester libre)
      let shore = false;
      for (const [dx, dy] of [[-4, 1], [6, 1], [1, -4], [1, 6], [-3, -3], [5, 5], [-3, 5], [5, -3]]) if (map.heights[(y + dy) * map.w + x + dx] >= map.waterLevel) shore = true;
      if (!shore) continue;
      const w = Math.hypot(x - ax, y - ay) + Math.hypot(x - hx, y - hy) * 0.3 + ((x - hx) * ai.enemyDir[0] + (y - hy) * ai.enemyDir[1]) * 0.2;
      cands.push({ x, y, w });
    }
  }
  cands.sort((a, b) => a.w - b.w);
  const D: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let tried = 0;
  for (const c of cands) {
    if (tried >= 60) break;
    if (N.yards.some((y) => Math.abs(y.x - c.x) < 8 && Math.abs(y.y - c.y) < 8)) continue;
    if (!ai.planner.areaFree(c.x, c.y, 3)) continue;
    // sortie : la direction qui donne sur le plus d'eau
    let dir = -1;
    let open = 0;
    for (let d = 0; d < 4; d++) {
      let n = 0;
      for (let k = 1; k <= 10; k++) {
        const ex = c.x + 1 + D[d][0] * (k + 1);
        const ey = c.y + 1 + D[d][1] * (k + 1);
        if (!sea(ex, ey) || !sea(ex + D[d][1], ey + D[d][0]) || !sea(ex - D[d][1], ey - D[d][0])) break;
        n++;
      }
      if (n > open) {
        open = n;
        dir = d;
      }
    }
    if (open < 5) continue;
    tried++;
    if (!ai.ctx.sim.canPlace(ai.ctx.slot, kind, c.x, c.y, dir)) continue;
    const places: Placement[] = [{ kind, x: c.x, y: c.y, dir, tag: "factory" }];
    const power = ai.planner.robust(() => {
      const p = ai.planner.ensurePower(c.x, c.y, 3, 3);
      return p.length || ai.planner.covered(c.x, c.y, 3, 3) ? [...p, ...ai.planner.bridgeAll(places)] : null;
    });
    if (!power) continue;
    ai.planner.mark(c.x, c.y, 3, 2);
    N.yards.push({ x: c.x, y: c.y, dir });
    if (ai.arsenal.plan) {
      ai.arsenal.plan.mod.use += ai.ctx.data.buildings[kind].powerUse;
      for (const p of power) ai.arsenal.plan.mod.prod += ai.ctx.data.buildings[p.kind].powerProd;
    }
    ai.log("usine navale en", c.x, c.y, "à", Math.hypot(c.x - ax, c.y - ay).toFixed(0), "cases de l'arsenal");
    return newProject(ai, "yard", [...power, ...places], {});
  }
  N.yardNext = ai.tick + 1800;
  ai.log("pas de place pour une usine navale", cands.length, "cases examinées");
  return null;
}

// ---------- Production ----------

/** Composition voulue de la flotte : selon la menace adverse. */
function fleetWeights(ai: SkirmishAI): Record<string, number> {
  const w: Record<string, number> = { frigate: 3, submarine: 0.8, destroyer: 4, missile_cruiser: 2, carrier: 0.5, railgun_ship: 2 };
  if (ai.navy.enemy > 60) {
    // marine adverse : torpilles et navires de ligne
    w.submarine += 2.5;
    w.destroyer += 2;
  }
  if (ai.airRatio > 0.4) {
    w.frigate += 1;
    w.missile_cruiser += 1;
    w.carrier += 0.5;
  }
  return w;
}

export function fleetSize(ai: SkirmishAI): number {
  let n = 0;
  for (const u of ai.ix.unitsBy[ai.ctx.slot]) if (isShip(ai, u.kind)) n++;
  return n;
}

export function navyFactories(ai: SkirmishAI, out: Cmd[]): void {
  const N = ai.navy;
  if (!N.wanted) return;
  const data = ai.ctx.data;
  const ships = fleetSize(ai);
  const cap = ai.level === "facile" ? 4 : Math.min(40, 12 + Math.floor(ai.tick / (5 * MIN)) + (N.enemy > 60 ? 10 : 0));
  for (const b of navyYards(ai)) {
    if (N.lastQ[b.ref] === undefined) {
      const [rx, ry] = station(ai);
      out.push(rally(b.ref, rx, ry));
      N.lastQ[b.ref] = -1e9;
    }
    if (b.queue >= 1 || ai.tick - N.lastQ[b.ref] < 60 || ships >= cap || ai.me.unitCount >= 950) continue;
    const counts = new Map<number, number>();
    for (const u of ai.ix.unitsBy[ai.ctx.slot]) if (isShip(ai, u.kind)) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
    let pick = -1;
    let best = Infinity;
    for (const [key, wgt] of Object.entries(fleetWeights(ai))) {
      const k = ai.ids.u[key];
      if (k === undefined || !ai.has(data.units[k].tech)) continue;
      // seulement ce que les dépôts couvrent : la file ne doit pas attendre un composant qui ne vient pas
      if (!data.units[k].cost.every(([i, n]) => ai.stock(i) >= n)) continue;
      const score = ((counts.get(k) ?? 0) + 1) / wgt;
      if (score < best) {
        best = score;
        pick = k;
      }
    }
    if (pick < 0) continue;
    out.push(factoryQueue(b.ref, pick, 1));
    N.lastQ[b.ref] = ai.tick;
  }
}

// ---------- Missions ----------

/** Poste de la flotte de réserve : au large de l'usine navale (ou de la côte). */
export function station(ai: SkirmishAI): [number, number] {
  const N = ai.navy;
  const y = N.yards[0];
  if (y) {
    const D: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (let k = 9; k >= 4; k--) {
      const x = (y.x + 1.5 + D[y.dir][0] * k) * TILE;
      const yy = (y.y + 1.5 + D[y.dir][1] * k) * TILE;
      if (seaAt(ai, x, yy) === N.sea) return [x, yy];
    }
  }
  const c = N.coast ?? ai.home;
  return [c[0] * TILE + TILE / 2, c[1] * TILE + TILE / 2];
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

/** Point du plan d'eau le plus proche d'une position, et distance en cases (null : trop loin). */
function seaPoint(ai: SkirmishAI, x: number, y: number): { x: number; y: number; d: number } | null {
  const m = ai.ctx.map;
  const f = seaField(m, ai.navy.sea);
  const tx = Math.max(0, Math.min(m.w - 1, Math.floor(x / TILE)));
  const ty = Math.max(0, Math.min(m.h - 1, Math.floor(y / TILE)));
  const i = f.near[ty * m.w + tx];
  if (i < 0) return null;
  const px = i % m.w;
  const py = (i / m.w) | 0;
  return { x: px * TILE + TILE / 2, y: py * TILE + TILE / 2, d: Math.hypot(px - tx, py - ty) };
}

/** Navires ennemis du plan d'eau. */
function enemyShips(ai: SkirmishAI): BotUnit[] {
  const l: BotUnit[] = [];
  for (const e of ai.hostileIds) for (const u of ai.ix.unitsBy[e]) if (isShip(ai, u.kind) && seaAt(ai, u.x, u.y) === ai.navy.sea) l.push(u);
  return l;
}

function shipPower(ai: SkirmishAI, us: BotUnit[], shore: boolean): number {
  const kp = kindPowers(ai.ctx.data).units;
  let s = 0;
  for (const u of us) {
    const d = ai.ctx.data.units[u.kind];
    // un sous-marin ne tire que sur ce qui flotte
    if (shore && d.layer === Layer.Sub) continue;
    s += kp[u.kind].ground * Math.sqrt(Math.max(0.05, Math.min(1, u.hp / Math.max(1, d.hp))));
  }
  return s;
}

/** Portée (cases) contre la terre de la plus courte arme de ligne du groupe : d'où tirer sur la côte. */
function shoreRange(ai: SkirmishAI, us: BotUnit[]): number {
  let r = 0;
  for (const u of us) {
    for (const wi of ai.ctx.data.units[u.kind].weapons) {
      const w = ai.ctx.data.weapons[wi];
      if (w && w.mask & 1) r = Math.max(r, w.range);
    }
  }
  return r;
}

/** Objectif à portée de l'eau : installations ou marine ennemies, selon leur valeur et leur défense. */
function seaObjective(ai: SkirmishAI, us: BotUnit[], foes: BotUnit[]): { x: number; y: number; sx: number; sy: number; defense: number } | null {
  const I = ai.intel;
  const [bx, by] = ai.baseCenter();
  const range = Math.max(0, shoreRange(ai, us) - 4);
  const shore = shipPower(ai, us, true);
  let best: { x: number; y: number; sx: number; sy: number; defense: number } | null = null;
  let bs = 0;
  if (range > 0) {
    const seen = new Set<number>();
    for (const e of ai.enemyIds) {
      for (const b of ai.ix.buildingsBy[e]) {
        const x = b.x * TILE + TILE;
        const y = b.y * TILE + TILE;
        const c = I.cell(x, y);
        if (seen.has(c) || I.layers[e][T.Eco][c] < 1) continue;
        seen.add(c);
        const p = seaPoint(ai, x, y);
        if (!p || p.d > range) continue;
        const value = I.sum([e], T.Eco, x, y, 16);
        const threat = ai.enemySum(T.Surface, p.x, p.y, 26);
        const dist = Math.sqrt(dist2(x, y, bx, by)) / TILE;
        let score = Math.pow(value, 0.6) / (1 + (threat / Math.max(1, shore)) * 2) / (1 + dist / 250);
        if (threat > shore * 1.3) score *= 0.15;
        for (const k of ai.navy.skip) if (ai.tick - k.tick < 6000 && dist2(k.x, k.y, x, y) < (16 * TILE) ** 2) score *= 0.2;
        if (score > bs) {
          bs = score;
          best = { x, y, sx: p.x, sy: p.y, defense: threat };
        }
      }
      // commandant adverse à portée de tir
      const c = ai.unitById(ai.view.players[e].commander);
      const p = c ? seaPoint(ai, c.x, c.y) : null;
      if (c && p && p.d <= range) {
        const threat = ai.enemySum(T.Surface, p.x, p.y, 26);
        const score = (Math.pow(2500, 0.6) / (1 + (threat / Math.max(1, shore)) * 2)) * (threat > shore * 1.3 ? 0.15 : 1);
        if (score > bs) {
          bs = score;
          best = { x: c.x, y: c.y, sx: p.x, sy: p.y, defense: threat };
        }
      }
    }
  }
  // marine adverse plus faible : la détruire d'abord (elle protège la côte et menace la nôtre)
  if (foes.length) {
    const [fx, fy] = centroid(foes);
    const near = foes.reduce((a, u) => (dist2(u.x, u.y, fx, fy) < dist2(a.x, a.y, fx, fy) ? u : a));
    const threat = shipPower(ai, foes, false);
    const all = shipPower(ai, us, false);
    if (all > threat * 1.2) {
      const score = Math.pow(1500, 0.6) / (1 + (threat / Math.max(1, all)) * 2);
      if (score > bs) best = { x: near.x, y: near.y, sx: near.x, sy: near.y, defense: threat };
    }
  }
  return best;
}

export function navyThink(ai: SkirmishAI, out: Cmd[]): void {
  const N = ai.navy;
  const tick = ai.tick;
  const ships = ai.ix.unitsBy[ai.ctx.slot].filter((u) => isShip(ai, u.kind));
  if (!ships.length || ai.ctx.map.waterLevel <= 0) {
    N.fleets = [];
    return;
  }
  if (N.sea < 0) N.sea = seaAt(ai, ships[0].x, ships[0].y);
  if (N.sea < 0) return;
  const byId = new Map(ships.map((u) => [u.id, u]));
  let form = N.fleets.find((f) => f.mission === "form");
  if (!form) {
    form = newFleet(N, "form", tick);
    N.fleets.push(form);
  }
  const owned = new Set<number>();
  for (const f of N.fleets) {
    for (const id of f.units) {
      if (byId.has(id)) owned.add(id);
      else f.units.delete(id);
    }
  }
  for (const u of ships) if (!owned.has(u.id)) form.units.add(u.id);
  N.fleets = N.fleets.filter((f) => f === form || f.units.size > 0);
  const foes = enemyShips(ai);
  detectThreat(ai, foes);
  if (ai.debug && tick % 1200 < 20) ai.log("flottes", N.fleets.map((f) => `${f.id}:${f.mission}/${f.units.size}>${Math.round(f.ox / TILE)},${Math.round(f.oy / TILE)}`).join(" "), "navires ennemis", foes.length, "menace", N.threat ? N.threat[2].toFixed(0) : "-");
  for (const f of N.fleets.slice()) {
    const us = [...f.units].map((id) => byId.get(id)).filter((u): u is BotUnit => !!u);
    if (!us.length) continue;
    if (f === form) formThink(ai, f, us, foes, out);
    else fleetThink(ai, f, form, us, foes, out);
  }
}

function newFleet(N: NavyState, mission: Fleet["mission"], tick: number): Fleet {
  return { id: N.nextId++, units: new Set(), mission, ox: 0, oy: 0, sx: 0, sy: 0, tx: 0, ty: 0, lastOrder: -1e9, since: tick, launched: 0, mx: 0, my: 0, movedAt: tick };
}

/** Navires ennemis à portée de nos installations côtières. */
function detectThreat(ai: SkirmishAI, foes: BotUnit[]): void {
  const N = ai.navy;
  N.threat = null;
  if (!foes.length) return;
  const sites: [number, number, number][] = ai.planner.modules.map((m) => [m.cx * TILE, m.cy * TILE, (m.L / 2 + 40) * TILE]);
  for (const y of N.yards) sites.push([y.x * TILE, y.y * TILE, 45 * TILE]);
  if (N.coast) sites.push([N.coast[0] * TILE, N.coast[1] * TILE, 40 * TILE]);
  if (ai.arsenal.plan) sites.push([ai.arsenal.plan.depot[0] * TILE, ai.arsenal.plan.depot[1] * TILE, 45 * TILE]);
  const near = foes.filter((u) => sites.some(([x, y, r]) => dist2(u.x, u.y, x, y) < r * r));
  if (!near.length) return;
  const [x, y] = centroid(near);
  const c = near.reduce((a, u) => (dist2(u.x, u.y, x, y) < dist2(a.x, a.y, x, y) ? u : a));
  N.threat = [c.x, c.y, shipPower(ai, near, false)];
  N.threatened = ai.tick;
}

function formThink(ai: SkirmishAI, f: Fleet, us: BotUnit[], foes: BotUnit[], out: Cmd[]): void {
  const N = ai.navy;
  const tick = ai.tick;
  const power = shipPower(ai, us, false);
  const [sx, sy] = station(ai);
  // défense de la côte : engager si l'on tient le combat, sinon rester près de l'usine et de ses tourelles
  if (N.threat) {
    const [x, y, p] = N.threat;
    const friends = ai.friendSum(T.Surface, x, y, 26);
    if (power + friends * 0.5 > p * 0.7) order(f, us, x, y, tick, out, 30, true);
    else order(f, us, sx, sy, tick, out, 30, true);
    return;
  }
  // attaque : assez nombreux et assez forts pour l'objectif (ou depuis longtemps)
  const size = ai.level === "facile" ? 6 : N.attackSize;
  if (us.length >= Math.min(3, size)) {
    const obj = seaObjective(ai, us, foes);
    const shore = obj && obj.sx !== obj.x ? shipPower(ai, us, true) : power;
    if (obj && us.length >= size && (shore > obj.defense * 1.2 || us.length >= size * 2)) {
      const g = newFleet(N, "attack", tick);
      g.launched = us.length;
      Object.assign(g, { ox: obj.x, oy: obj.y, sx: obj.sx, sy: obj.sy });
      for (const u of us) {
        f.units.delete(u.id);
        g.units.add(u.id);
      }
      N.fleets.push(g);
      N.stats.attacks++;
      N.attackSize = Math.min(16, N.attackSize + 1);
      ai.log("attaque navale", g.id, us.length, "navires, puissance", power.toFixed(0), "défense", obj.defense.toFixed(0), "en", Math.round(obj.x / TILE), Math.round(obj.y / TILE));
      return;
    }
  }
  // patrouille le long de la côte : poste de l'usine, puis les points de côte proches des modules
  if (tick - f.lastOrder > 900) {
    const pts: [number, number][] = [[sx, sy]];
    for (const m of ai.planner.modules) {
      const p = seaPoint(ai, m.cx * TILE, m.cy * TILE);
      if (p && p.d < 45 && pts.every((q) => dist2(q[0], q[1], p.x, p.y) > (20 * TILE) ** 2)) pts.push([p.x, p.y]);
    }
    N.patrol = (N.patrol + 1) % pts.length;
    const [px, py] = pts[N.patrol];
    out.push(move(us, px, py, false, true));
    f.tx = px;
    f.ty = py;
    f.lastOrder = tick;
  }
}

function fleetThink(ai: SkirmishAI, f: Fleet, form: Fleet, us: BotUnit[], foes: BotUnit[], out: Cmd[]): void {
  const N = ai.navy;
  const tick = ai.tick;
  const [cx, cy] = centroid(us);
  const [hx, hy] = station(ai);
  if (f.mission === "retreat") {
    if (dist2(cx, cy, hx, hy) < (14 * TILE) ** 2 || tick - f.since > 3000) {
      for (const u of us) form.units.add(u.id);
      f.units.clear();
      return;
    }
    order(f, us, hx, hy, tick, out, 60, false);
    return;
  }
  const power = shipPower(ai, us, false);
  const retreat = (why: string) => {
    f.mission = "retreat";
    f.since = tick;
    f.lastOrder = -1e9;
    N.stats.retreats++;
    N.attackSize = Math.min(16, N.attackSize + 1);
    ai.log("repli de la flotte", f.id, why);
  };
  if (us.length < Math.max(1, f.launched * 0.3)) return retreat("décimée");
  if (ai.level !== "facile") {
    const enemy = ai.enemySum(T.Surface, cx, cy, 26) + shipPower(ai, foes.filter((u) => ai.ctx.data.units[u.kind].layer === Layer.Sub && dist2(u.x, u.y, cx, cy) < (26 * TILE) ** 2), false);
    if (enemy > power * 1.6) return retreat(`ennemi ${enemy.toFixed(0)} contre ${power.toFixed(0)}`);
  }
  // une grosse menace sur nos côtes rappelle la flotte
  if (N.threat && N.threat[2] > 200 && ai.level !== "facile") {
    const reserve = shipPower(ai, ai.ix.unitsBy[ai.ctx.slot].filter((u) => form.units.has(u.id)), false);
    if (N.threat[2] > reserve && dist2(cx, cy, N.threat[0], N.threat[1]) < (160 * TILE) ** 2) {
      order(f, us, N.threat[0], N.threat[1], tick, out, 60, true);
      return;
    }
  }
  // peloton bloqué loin de son objectif
  if (dist2(cx, cy, f.mx, f.my) > (4 * TILE) ** 2) {
    f.mx = cx;
    f.my = cy;
    f.movedAt = tick;
  } else if (tick - f.movedAt > 1800 && dist2(cx, cy, f.sx, f.sy) > (16 * TILE) ** 2) return retreat("bloquée");
  // objectif détruit (ou poste tenu sans rien à portée) : le suivant
  const cleared = ai.intel.sum(ai.hostileIds, T.Eco, f.ox, f.oy, 8) < 1 && ai.intel.sum(ai.hostileIds, T.Surface, f.ox, f.oy, 8) < 1 && !foes.some((u) => dist2(u.x, u.y, f.ox, f.oy) < (20 * TILE) ** 2);
  const bored = tick - f.movedAt > 2400 && dist2(cx, cy, f.sx, f.sy) <= (16 * TILE) ** 2;
  if (cleared || bored) {
    const obj = seaObjective(ai, us, foes);
    if (!obj) return retreat("plus d'objectif");
    if (!cleared && dist2(obj.x, obj.y, f.ox, f.oy) < (12 * TILE) ** 2) {
      // au poste depuis longtemps sans venir à bout de l'objectif : hors d'atteinte, on l'oublie un moment
      N.skip = [...N.skip.filter((k) => tick - k.tick < 6000), { x: f.ox, y: f.oy, tick }].slice(-8);
      return retreat("objectif hors d'atteinte");
    }
    Object.assign(f, { ox: obj.x, oy: obj.y, sx: obj.sx, sy: obj.sy });
    f.movedAt = tick;
    f.lastOrder = -1e9;
  }
  order(f, us, f.sx, f.sy, tick, out, 100, true);
}

/** Déplacement (attaque en route) vers (x, y) si la cible a bougé, ou relance des navires arrêtés loin d'elle. */
function order(f: Fleet, us: BotUnit[], x: number, y: number, tick: number, out: Cmd[], wait: number, attack: boolean): void {
  const moved = dist2(f.tx, f.ty, x, y) > (8 * TILE) ** 2;
  if ((moved && tick - f.lastOrder > wait) || tick - f.lastOrder > 900) {
    out.push(move(us, x, y, false, attack));
    f.tx = x;
    f.ty = y;
    f.lastOrder = tick;
    return;
  }
  const idle = us.filter((u) => u.nOrders === 0 && dist2(u.x, u.y, x, y) > (10 * TILE) ** 2);
  if (idle.length && tick - f.lastOrder > 100) {
    out.push(move(idle, x, y, false, attack));
    f.lastOrder = tick;
  }
}

/** Recherches que la marine demande : d'abord (avant celles de la personnalité), puis ensuite. */
export function navyResearch(ai: SkirmishAI): { first: string[]; later: string[] } {
  if (!ai.navy.wanted || !arsenalWanted(ai)) return { first: [], later: [] };
  const aa = !ai.enemyIds.some((e) => ai.baseReachable(e)) ? ["aa_turret"] : [];
  return { first: ["electronics", ...aa, "naval"], later: ["hydrocarbons", "chemistry", "destroyer", "missile_cruiser", "heavy_navy"] };
}

/** Le joueur a-t-il des navires (faune exclue) ? */
export function hasNavy(ai: SkirmishAI, p: number): boolean {
  return !isFauna(ai.view.players, p) && ai.ix.unitsBy[p].some((u) => isShip(ai, u.kind));
}
