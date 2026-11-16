// IA d'escarmouche, organisée comme celle de Supreme Commander : des builders (tâches avec priorité
// et conditions) choisis par des gestionnaires (ingénieurs, usines, recherche, pelotons), et des
// personnalités qui changent les listes et les priorités.
//
// Économie : modules « sushi » (voir layout.ts). Chaque module a un tapis principal qui finit dans
// un dépôt ; les extracteurs y versent le minerai, les bâtiments de part et d'autre prennent ce dont
// ils ont besoin et y reposent leurs produits ; le reste alimente le stock commun des ingénieurs.
import type { Bot, BotContext } from "./types.ts";
import type { BotView, Cmd, BotUnit, BotBuilding, PlayerView } from "@supreme/shared";
import { build, move, target, O, factoryQueue, rally, setRecipe, research, hasTech, RECIPE_NONE, BUILD_FULL } from "@supreme/shared";
import { Ids, indexView, TILE, dist2, type ViewIndex } from "./util.ts";
import { Planner, CELLS, type Module, type Placement, type Slot, type CellSlot } from "./layout.ts";
import { PERSONAS, type Persona } from "./personas.ts";
import { Army } from "./army.ts";

interface Project {
  id: number;
  name: string;
  places: Placement[];
  st: number[]; // 0 à faire, 1 fait, 2 échec
  builders: number[];
  lastIssue: number;
  started: number;
  remote: boolean;
  critical: boolean; // échec du premier placement = abandon
  module: Module | null;
  slot: Slot | null;
  spot: SpotState | null;
  cost: number[];
  lastProgress: number;
  doneCount: number;
  cell?: CellSlot;
}

interface SpotState {
  kind: number;
  x: number;
  y: number;
  st: number; // 0 libre, 1 utilisé, 2 impossible
  tries: number;
  next: number; // tick avant nouvel essai
}

interface Crafter {
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

interface EngBuilder {
  name: string;
  prio: number;
  remote?: boolean;
  est: number[]; // coût estimé (fer, cuivre, acier, engrenages, circuits)
  make: () => Project | null;
}

const NI = 27;

export class SkirmishAI implements Bot {
  ctx: BotContext;
  ids: Ids;
  persona: Persona;
  planner: Planner;
  army: Army;
  view!: BotView;
  ix!: ViewIndex;
  me!: PlayerView;
  tick = 0;
  home: [number, number];
  projects: Project[] = [];
  nextProject = 1;
  spots: SpotState[] = [];
  crafters: Crafter[] = [];
  factoryInfo = new Map<number, { module: Module; slot: Slot; lastQ: number; rallied: boolean; front: number; lastStart: number }>();
  starved = new Map<number, number>();
  busy = new Map<number, Project>();
  pendingPlan = new Map<Module, string[]>();
  modulePlansUsed = 0;
  lastResearch = -1e9;
  lastThreat = -1e9;
  underPressure = false;
  rng: number;
  enemyDir: [number, number] = [0, 0];
  rally: [number, number] = [0, 0];
  turretsPlanned = 0;
  extCount = new Map<number, number>();
  reclaiming = new Map<number, number>(); // ingénieur -> épave
  combatKinds: boolean[];
  engKinds: boolean[];
  produces = new Map<Module, Set<number>>();
  failures = 0;
  openingIdx = 0;
  waiting = new Set<Module>();
  ironSave = false;
  stockHist: number[][] = [];
  busMines = new Map<number, number>();
  blockedSince = new Map<string, number>();
  thinkN = 0;
  stats = { projectsDone: 0, projectsFailed: 0 };
  debug = false;

  constructor(ctx: BotContext) {
    this.ctx = ctx;
    this.ids = new Ids(ctx.data);
    this.persona = PERSONAS[ctx.personality] ?? PERSONAS.adaptive;
    this.planner = new Planner(ctx.sim, ctx.slot, this.ids, ctx.map.w, ctx.map.h);
    this.army = new Army(this.persona.firstAttack);
    const st = ctx.map.starts[ctx.slot] ?? [ctx.map.w >> 1, ctx.map.h >> 1];
    this.home = [st[0], st[1]];
    this.rng = (ctx.slot + 1) * 2654435761;
    this.combatKinds = ctx.data.units.map((u, i) => i !== this.ids.u.commander && u.buildPower === 0 && u.weapons.length > 0);
    this.engKinds = ctx.data.units.map((u, i) => i !== this.ids.u.commander && u.buildPower > 0);
    for (const s of ctx.map.spots) this.spots.push({ kind: s.kind, x: s.x, y: s.y, st: 0, tries: 0, next: 0 });
    // direction des adversaires (moyenne des départs des autres joueurs)
    let ex = 0;
    let ey = 0;
    for (let i = 0; i < ctx.map.starts.length; i++) {
      if (i === ctx.slot) continue;
      const [x, y] = ctx.map.starts[i];
      const d = Math.hypot(x - st[0], y - st[1]) || 1;
      ex += (x - st[0]) / d / d;
      ey += (y - st[1]) / d / d;
    }
    const n = Math.hypot(ex, ey) || 1;
    this.enemyDir = [ex / n, ey / n];
    this.debug = typeof process !== "undefined" && process.env?.BOTDEBUG === String(ctx.slot);
  }

  log(...a: unknown[]): void {
    if (this.debug) console.log(`[J${this.ctx.slot} t${this.tick}]`, ...a);
  }

  random(): number {
    this.rng = (Math.imul(this.rng ^ (this.rng >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return this.rng / 4294967296;
  }

  // ---------- Requêtes ----------
  isCombat(kind: number): boolean {
    return this.combatKinds[kind] === true;
  }
  has(tech: number): boolean {
    return hasTech(this.me, tech);
  }
  sameTeam(p: number): boolean {
    return this.view.players[p]?.team === this.me.team;
  }
  stock(item: number): number {
    return this.me.stock[item];
  }
  baseCenter(): [number, number] {
    const m = this.planner.modules[0];
    if (m) return [m.cx * TILE + TILE / 2, m.cy * TILE + TILE / 2];
    return [this.home[0] * TILE, this.home[1] * TILE];
  }
  baseRadius(): number {
    const m = this.planner.modules[0];
    return m ? m.L / 2 + 22 : 35;
  }
  rallyPoint(): [number, number] {
    return this.rally;
  }

  /** Adversaire à attaquer : le plus proche encore en vie. */
  pickTarget(): number {
    const [bx, by] = this.baseCenter();
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.view.players.length; i++) {
      const p = this.view.players[i];
      if (i === this.ctx.slot || !p.alive || p.team === this.me.team) continue;
      const c = this.unitById(p.commander);
      const [x, y] = c ? [c.x, c.y] : [this.ctx.map.starts[i][0] * TILE, this.ctx.map.starts[i][1] * TILE];
      // préférer les joueurs affaiblis
      const army = this.ix.unitsBy[i].length;
      const d = Math.sqrt(dist2(bx, by, x, y)) * (1 + army / 150);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  unitById(id: number): BotUnit | undefined {
    if (!this.unitMap) {
      this.unitMap = new Map();
      for (const u of this.view.units) this.unitMap.set(u.id, u);
    }
    return this.unitMap.get(id);
  }
  unitMap: Map<number, BotUnit> | null = null;

  attackTarget(p: number): [number, number, number] | null {
    const c = this.unitById(this.view.players[p].commander);
    if (c) return [c.x, c.y, c.id];
    const st = this.ctx.map.starts[p];
    return [st[0] * TILE, st[1] * TILE, 0];
  }
  raidTarget(p: number): [number, number, number] | null {
    // bâtiment adverse le plus éloigné de son commandant (extracteur isolé)
    const c = this.unitById(this.view.players[p].commander);
    const st = this.ctx.map.starts[p];
    const [cx, cy] = c ? [c.x, c.y] : [st[0] * TILE, st[1] * TILE];
    let best: BotBuilding | null = null;
    let bd = 0;
    const [hx, hy] = this.baseCenter();
    for (const b of this.ix.buildingsBy[p]) {
      const d = dist2(b.x * TILE, b.y * TILE, cx, cy) - dist2(b.x * TILE, b.y * TILE, hx, hy) * 0.5;
      if (d > bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) return this.attackTarget(p);
    return [best.x * TILE + TILE, best.y * TILE + TILE, 0];
  }

  // ---------- Décision ----------
  think(view: BotView): Cmd[] {
    this.view = view;
    this.ix = indexView(view);
    this.me = view.players[this.ctx.slot];
    this.tick = view.tick;
    this.unitMap = null;
    this.thinkN++;
    const out: Cmd[] = [];
    if (!this.me?.alive) return out;
    if (this.planner.modules.length === 0) this.setupBase();
    this.underPressure = this.tick - this.lastThreat < 1200;
    this.engineers(out);
    if (this.thinkN % 2 === 0) this.economy(out);
    if (this.thinkN % 2 === 1) this.factories(out);
    if (this.thinkN % 4 === 0) this.researchMgr(out);
    this.army.think(this, this.ix, this.tick, out);
    this.commander(out);
    return out;
  }

  setupBase(): void {
    const [sx, sy] = this.home;
    const near = this.spots.filter((s) => Math.abs(s.x - sx) < 50 && Math.abs(s.y - sy) < 50);
    const m = this.planner.findModule(sx, sy, near, [50, 44, 38, 32, 26], 10);
    if (m) {
      m.role = "main";
      this.pendingPlan.set(m, [...this.persona.plan0]);
      this.produces.set(m, new Set());
    }
    this.updateRally();
  }

  updateRally(): void {
    const [bx, by] = this.baseCenter();
    const r = (this.baseRadius() - 8) * TILE;
    this.rally = [bx + this.enemyDir[0] * r, by + this.enemyDir[1] * r];
  }

  // ---------- Ingénieurs ----------
  builderUnits(): BotUnit[] {
    const l: BotUnit[] = [];
    for (const u of this.ix.unitsBy[this.ctx.slot]) {
      if (u.kind === this.ids.u.commander || this.engKinds[u.kind]) l.push(u);
    }
    return l;
  }

  placementState(p: Placement): number {
    const ti = this.ctx.sim.tileInfo(p.x, p.y);
    if (ti <= 0) return 0; // vide
    if ((ti & 0xff) === p.kind + 1 && ((ti >> 8) & 0xff) === this.ctx.slot) return (ti >> 20) & 1 ? 3 : 1; // 1 en chantier, 3 fini
    return 2; // occupé par autre chose
  }

  engineers(out: Cmd[]): void {
    const builders = this.builderUnits();
    const alive = new Set(builders.map((u) => u.id));
    // suivi des projets
    for (const p of this.projects) {
      p.builders = p.builders.filter((id) => alive.has(id));
      this.checkProject(p);
    }
    for (const p of this.projects) {
      if (this.isFinished(p)) {
        for (const id of p.builders) this.busy.delete(id);
        this.finishProject(p);
      }
    }
    this.projects = this.projects.filter((p) => !this.isFinished(p));
    for (const id of [...this.busy.keys()]) if (!alive.has(id) || !this.projects.includes(this.busy.get(id) as Project)) this.busy.delete(id);
    // ordres
    let started = 0;
    const cmdId = this.me.commander;
    for (const u of builders) {
      const p = this.busy.get(u.id);
      if (p) {
        if (u.nOrders === 0 && this.tick - p.lastIssue > 25) this.issue(p, u, out);
        continue;
      }
      if (this.reclaiming.has(u.id)) {
        if (u.nOrders > 0) continue;
        this.reclaiming.delete(u.id);
      }
      if (u.nOrders > 0 && u.id !== cmdId) continue;
      if (u.nOrders > 0 && u.order !== 1 && u.order !== 2) continue;
      // aider un grand projet
      const help = this.projects.find((q) => q.builders.length < 3 && this.remaining(q) >= 8 && (!q.remote || u.id !== cmdId));
      if (help) {
        help.builders.push(u.id);
        this.busy.set(u.id, help);
        this.issue(help, u, out);
        continue;
      }
      if (started < 1) {
        const p2 = this.startProject(u);
        if (p2) {
          started++;
          p2.builders.push(u.id);
          this.busy.set(u.id, p2);
          this.issue(p2, u, out);
          continue;
        }
      }
      // aider n'importe quel projet en cours
      const any = this.projects.find((q) => q.builders.length < 2 && this.remaining(q) >= 2 && (!q.remote || u.id !== cmdId));
      if (any && u.id !== cmdId) {
        any.builders.push(u.id);
        this.busy.set(u.id, any);
        this.issue(any, u, out);
        continue;
      }
      this.reclaim(u, out);
    }
  }

  remaining(p: Project): number {
    let n = 0;
    for (const s of p.st) if (s === 0) n++;
    return n;
  }
  isFinished(p: Project): boolean {
    return p.st.every((s) => s !== 0) || (p.critical && p.st[0] === 2);
  }

  checkProject(p: Project): void {
    let changed = false;
    for (let i = 0; i < p.places.length; i++) {
      if (p.st[i] !== 0) continue;
      const pl = p.places[i];
      const s = this.placementState(pl);
      if (s === 3) {
        p.st[i] = 1;
        changed = true;
        p.doneCount++;
      } else if (s === 2) {
        p.st[i] = 2;
        changed = true;
      } else if (s === 0 && this.tick - p.started > 60 && !this.ctx.sim.canPlace(this.ctx.slot, pl.kind, pl.x, pl.y, pl.dir)) {
        // la technologie peut manquer (pas un échec définitif) : seulement si la case est bloquée
        if (this.has(this.ctx.data.buildings[pl.kind].tech)) {
          p.st[i] = 2;
          changed = true;
        }
      }
    }
    if (changed) p.lastProgress = this.tick;
    // projet bloqué trop longtemps (stock vide ou chantier inaccessible)
    if (this.tick - p.lastProgress > 6000 && p.builders.length > 0) {
      for (let i = 0; i < p.st.length; i++) if (p.st[i] === 0) p.st[i] = 2;
    }
  }

  finishProject(p: Project): void {
    let failed = 0;
    const aborted = p.critical && p.st[0] === 2;
    for (let i = 0; i < p.places.length; i++) {
      if (p.st[i] === 2 || (aborted && p.st[i] === 0)) {
        failed++;
        const s = this.placementState(p.places[i]);
        if (s === 0 || s === 2) this.planner.release(p.places[i]);
      }
    }
    this.log("fin", p.name, p.slot?.type ?? "", p.st.join(""), "durée", this.tick - p.started);
    if (failed) this.stats.projectsFailed++;
    else this.stats.projectsDone++;
    if (p.spot) {
      if (p.st[0] === 2) {
        p.spot.st = 0;
        p.spot.tries++;
        p.spot.next = this.tick + 3000;
        if (p.spot.tries > 2) p.spot.st = 2;
        const key = (p.spot as SpotState & { key?: number }).key ?? p.spot.kind;
        this.extCount.set(key, (this.extCount.get(key) ?? 1) - 1);
      }
    }
    if (p.slot && p.st[0] === 2) {
      // emplacement perdu : remettre l'entrée dans le plan du module
      const pend = p.module ? this.pendingPlan.get(p.module) : null;
      const lost = p.cell ? p.cell.slots : [p.slot];
      if (pend) pend.unshift(p.cell ? "cell:" + p.cell.cell.name : p.slot.type);
      for (const sl of lost) {
        const k = p.module?.slots.indexOf(sl) ?? -1;
        if (k >= 0) p.module?.slots.splice(k, 1);
      }
      this.crafters = this.crafters.filter((c) => !lost.includes(c.slot));
    }
    if (p.name === "bus" && p.module) {
      (p.module as Module & { busDone?: boolean }).busDone = true;
    }
  }

  /** Envoie au bâtisseur les placements restants de sa part du projet. */
  issue(p: Project, u: BotUnit, out: Cmd[]): void {
    const rem: number[] = [];
    for (let i = 0; i < p.places.length; i++) if (p.st[i] === 0) rem.push(i);
    if (rem.length === 0) return;
    // part de ce bâtisseur
    const nb = Math.max(1, p.builders.length);
    const k = Math.max(0, p.builders.indexOf(u.id));
    let mine = rem;
    if (nb > 1 && rem.length > 4) {
      const chunk = Math.ceil(rem.length / nb);
      mine = rem.slice(k * chunk, (k + 1) * chunk);
      if (mine.length === 0) mine = rem.slice(-chunk);
    }
    // ordre du plus proche voisin
    let cx = u.x / TILE;
    let cy = u.y / TILE;
    const order: number[] = [];
    const left = mine.slice();
    while (left.length && order.length < 60) {
      let bi = 0;
      let bd = Infinity;
      for (let j = 0; j < left.length; j++) {
        const pl = p.places[left[j]];
        const d = (pl.x - cx) ** 2 + (pl.y - cy) ** 2;
        // les extracteurs et bâtiments d'abord pour les petits projets
        if (d < bd) {
          bd = d;
          bi = j;
        }
      }
      const i = left.splice(bi, 1)[0];
      order.push(i);
      cx = p.places[i].x;
      cy = p.places[i].y;
    }
    let first = true;
    for (const i of order) {
      const pl = p.places[i];
      out.push(build([u.id], pl.kind, pl.x, pl.y, pl.dir, !first));
      first = false;
    }
    p.lastIssue = this.tick;
  }

  /** Coût total d'une liste de placements. */
  costOf(places: Placement[]): number[] {
    const c = new Array(NI).fill(0);
    for (const p of places) for (const [it, n] of this.ctx.data.buildings[p.kind].cost) c[it] += n;
    return c;
  }
  reserved(): number[] {
    const c = new Array(NI).fill(0);
    for (const p of this.projects) {
      for (let i = 0; i < p.places.length; i++) {
        if (p.st[i] !== 0) continue;
        for (const [it, n] of this.ctx.data.buildings[p.places[i].kind].cost) c[it] += n;
      }
    }
    return c;
  }
  affordable(cost: number[], res: number[]): boolean {
    for (let i = 0; i < NI; i++) if (cost[i] > 0 && this.stock(i) - res[i] < cost[i]) return false;
    return true;
  }
  estAffordable(est: number[], res: number[]): boolean {
    const it = this.ids.item;
    const keys = [it.iron_plate, it.copper_plate, it.steel, it.gear, it.circuit];
    for (let k = 0; k < keys.length; k++) if ((est[k] ?? 0) > 0 && this.stock(keys[k]) - res[keys[k]] < est[k]) return false;
    return true;
  }

  reserveEst(est: number[], res: number[]): void {
    const it = this.ids.item;
    const keys = [it.iron_plate, it.copper_plate, it.steel, it.gear, it.circuit];
    for (let k = 0; k < keys.length; k++) res[keys[k]] += est[k] ?? 0;
  }

  newProject(name: string, places: Placement[], extra: Partial<Project> = {}): Project {
    return {
      id: this.nextProject++,
      name,
      places,
      st: places.map(() => 0),
      builders: [],
      lastIssue: -1e9,
      started: this.tick,
      remote: false,
      critical: false,
      module: null,
      slot: null,
      spot: null,
      cost: this.costOf(places),
      lastProgress: this.tick,
      doneCount: 0,
      ...extra,
    };
  }

  startProject(u: BotUnit): Project | null {
    const list = this.engBuilders(u);
    list.sort((a, b) => b.prio - a.prio);
    const res = this.reserved();
    const isCmd = u.id === this.me.commander;
    for (const b of list) {
      if (b.prio <= 0) break;
      if (b.remote && isCmd && this.engineerCount() > 0) continue;
      if (this.projects.some((p) => p.name === b.name)) continue;
      if (!this.estAffordable(b.est, res)) {
        // épargner pour les tâches importantes
        if (b.prio >= 780) this.reserveEst(b.est, res);
        continue;
      }
      const p = b.make();
      if (!p) continue;
      this.projects.push(p);
      if (b.prio === 990) this.openingIdx++;
      this.log("début", p.name, p.slot?.type ?? "", p.places.length, "placements");
      return p;
    }
    return null;
  }

  engineerCount(): number {
    let n = 0;
    for (const u of this.ix.unitsBy[this.ctx.slot]) if (this.engKinds[u.kind]) n++;
    return n;
  }

  countSlots(m: Module | null, type: string): number {
    let n = 0;
    for (const mm of this.planner.modules) {
      if (m && mm !== m) continue;
      for (const s of mm.slots) if (s.type === type) n++;
    }
    return n;
  }

  /** Liste des builders d'ingénieurs avec leur priorité actuelle. */
  engBuilders(u: BotUnit): EngBuilder[] {
    const P = this.persona;
    const L: EngBuilder[] = [];
    const it = this.ids.item;
    const mods = this.planner.modules;
    const m0 = mods[0];
    if (!m0) return L;
    const busDone = (m: Module) => (m as Module & { busDone?: boolean }).busDone === true;
    for (const m of mods) {
      if (!busDone(m)) {
        L.push({ name: "bus" + m.id, prio: 1000 - m.id, remote: m.id > 0, est: [m.L + 8], make: () => this.newProject("bus", m.bus.slice(), { module: m, remote: m.id > 0 }) });
        continue;
      }
      // énergie
      if (m.prod < m.use * 1.1 + 60) {
        L.push({
          name: "power" + m.id,
          prio: m.prod < m.use ? 960 : 700,
          remote: m.id > 0,
          est: [10, 8],
          make: () => {
            const g = this.planner.planGenerator(m);
            if (!g) return null;
            m.prod += 400;
            return this.newProject("power" + m.id, [g], { module: m, remote: m.id > 0 });
          },
        });
      }
      // extracteurs (avec fonderie sur place pour le fer, le cuivre et le silicium)
      const ores = [it.iron_ore, it.copper_ore, it.hydrocarbon];
      for (const ore of ores) {
        const ext = this.moduleExt(m, ore);
        let prio = 0;
        if (ore === it.hydrocarbon) {
          // l'hydrocarbure ne sert qu'aux raffineries du module
          if (ext < 1 && (this.pendingPlan.get(m)?.includes("R:fuel") === false) && m.slots.some((s) => s.type === "R:fuel")) prio = 780;
        } else {
          const plate = ore === it.iron_ore ? it.iron_plate : it.copper_plate;
          const low = this.stock(plate) < (ore === it.iron_ore ? 90 : 50);
          prio = (ore === it.iron_ore ? 720 : 715) - ext * 8 + (low ? 140 : 0);
          if (m.id > 0 && ext < (ore === it.iron_ore ? 2 : 1)) prio = 905 - m.id;
        }
        if (prio > 0 && m.feeders < 12) {
          L.push({ name: `ext${m.id}:${ore}`, prio, remote: m.id > 0, est: [45, 15], make: () => this.makeExtractor(m, ore) });
        }
      }
      // emplacement suivant du plan du module
      const pend = this.pendingPlan.get(m);
      if (pend && pend.length && !m.full) {
        // ordre strict du plan, sauf si l'entrée de tête attend une recherche depuis longtemps
        let k = this.slotAvailable(pend[0]) ? 0 : -1;
        if (k < 0) {
          const key = m.id + ":" + pend[0];
          if (!this.blockedSince.has(key)) this.blockedSince.set(key, this.tick);
          if (this.tick - (this.blockedSince.get(key) as number) > 4800) k = pend.findIndex((t) => this.slotAvailable(t));
        }
        if (k >= 0) {
          const type = pend[k];
          let prio = 800 - m.id * 50;
          if (type === "lab" || type.startsWith("A:pack")) prio += P.techBias;
          if (type.startsWith("factory")) prio += P.name === "rush" ? 80 : 20;
          L.push({ name: "slot" + m.id, prio, remote: m.id > 0, est: this.slotEst(type), make: () => this.makeSlot(m, type, k) });
        }
      }
    }
    // ouverture : ordre de construction fixe au début de la partie
    const op = this.persona.opening[this.openingIdx];
    if (op !== undefined && busDone(m0)) {
      const name = op === "slot" ? "slot0" : op === "iron" ? `ext0:${it.iron_ore}` : `ext0:${it.copper_ore}`;
      const b = L.find((x) => x.name === name);
      if (b) b.prio = 990;
      else this.openingIdx++;
    }
    // défenses
    if (this.has(this.ids.t.light_defense)) {
      const minutes = this.tick / 1200;
      const want = Math.min(P.turrets + Math.floor(minutes / 8) * (P.turrets > 4 ? 2 : 1), P.turrets * 3 + 2);
      const threatened = this.underPressure;
      if (this.turretsPlanned < want || (threatened && this.turretsPlanned < want + 4)) {
        const heavy = this.has(this.ids.t.heavy_turret) && this.stock(it.steel) > 60 && this.stock(it.ammo) > 20 && this.turretsPlanned % 2 === 1;
        const kind = heavy ? this.ids.b.heavy_turret : this.ids.b.light_turret;
        L.push({ name: "turret", prio: (threatened ? 870 : 560) + P.defenseBias, est: heavy ? [0, 0, 20, 0, 5] : [12, 0, 0, 4, 2], make: () => this.makeTurret(kind) });
      }
    }
    // module supplémentaire
    const allBuilt = mods.every((m) => busDone(m));
    const planDone = mods.every((m) => m.full || (this.pendingPlan.get(m)?.length ?? 0) === 0);
    if (allBuilt && mods.length < 1 + P.modules && this.tick > P.moduleDelay && (planDone || this.tick > P.moduleDelay * 2)) {
      L.push({ name: "module", prio: 520, remote: true, est: [150, 60], make: () => this.makeModule() });
    }
    return L;
  }

  slotEst(type: string): number[] {
    const c = [0, 0, 0, 0, 0];
    const it = this.ids.item;
    const keys = [it.iron_plate, it.copper_plate, it.steel, it.gear, it.circuit];
    const kinds = type.startsWith("cell:") ? CELLS[type.slice(5)].comps.map((cc) => this.ids.b[cc.key]) : [this.slotKind(type)];
    for (const kind of kinds) {
      for (const [i, n] of this.ctx.data.buildings[kind].cost) {
        const k = keys.indexOf(i);
        if (k >= 0) c[k] += n;
      }
      c[0] += 6;
      c[1] += 4;
    }
    return c;
  }

  slotKind(type: string): number {
    const [k, v] = type.split(":");
    const b = this.ids.b;
    if (k === "F") return b.furnace;
    if (k === "A") return b.assembler1;
    if (k === "R") return b.refinery;
    if (k === "C") return b.chemical;
    if (k === "lab") return b.lab;
    if (k === "factory") return b[v];
    return b.assembler1;
  }
  slotRecipe(type: string): number | undefined {
    const [k, v] = type.split(":");
    if (k === "F" || k === "A" || k === "R" || k === "C") return this.ids.r[v];
    return undefined;
  }
  slotAvailable(type: string): boolean {
    if (type.startsWith("cell:")) {
      for (const cc of CELLS[type.slice(5)].comps) {
        if (!this.has(this.ctx.data.buildings[this.ids.b[cc.key]].tech)) return false;
        if (cc.recipe && !this.has(this.ctx.data.recipes[this.ids.r[cc.recipe]].tech)) return false;
      }
      return true;
    }
    const kind = this.slotKind(type);
    if (!this.has(this.ctx.data.buildings[kind].tech)) return false;
    const r = this.slotRecipe(type);
    if (r !== undefined && !this.has(this.ctx.data.recipes[r].tech)) return false;
    return true;
  }

  makeSlot(m: Module, type: string, k: number): Project | null {
    if (type.startsWith("cell:")) return this.makeCell(m, type, k);
    const kind = this.slotKind(type);
    const d = this.ctx.data.buildings[kind];
    const recipe = this.slotRecipe(type);
    const isFactory = type.startsWith("factory");
    const isLab = type === "lab";
    const slot = this.planner.allocSlot(m, kind, d.w, type, { input: true, output: !isFactory && !isLab, faceOut: isFactory, recipe });
    const pend = this.pendingPlan.get(m);
    pend?.splice(k, 1);
    if (!slot) return null;
    for (const pl of slot.places) {
      const bd = this.ctx.data.buildings[pl.kind];
      m.use += bd.powerUse;
      m.prod += bd.powerProd;
    }
    if (recipe !== undefined) {
      this.crafters.push({ x: slot.x, y: slot.y, kind, recipe, type, ref: 0, paused: false, lastCmd: -1e9, module: m, slot });
    }
    return this.newProject("slot" + m.id, slot.places, { module: m, slot, remote: m.id > 0, critical: true });
  }

  makeCell(m: Module, type: string, k: number): Project | null {
    const cs = this.planner.allocCell(m, CELLS[type.slice(5)]);
    const pend = this.pendingPlan.get(m);
    pend?.splice(k, 1);
    if (!cs) return null;
    for (const pl of cs.places) {
      const bd = this.ctx.data.buildings[pl.kind];
      m.use += bd.powerUse;
      m.prod += bd.powerProd;
    }
    for (const sl of cs.slots) {
      const recipe = this.slotRecipe(sl.type);
      if (recipe !== undefined) this.crafters.push({ x: sl.x, y: sl.y, kind: sl.kind, recipe, type: sl.type, ref: 0, paused: false, lastCmd: -1e9, module: m, slot: sl });
    }
    // le premier placement (bâtiment principal) conditionne la cellule
    const main = cs.places.findIndex((p) => p.tag?.startsWith("factory") || p.tag === "lab");
    if (main > 0) {
      const t = cs.places[0];
      cs.places[0] = cs.places[main];
      cs.places[main] = t;
    }
    return this.newProject("slot" + m.id, cs.places, { module: m, slot: cs.slots.find((s) => s.type.startsWith("factory") || s.type === "lab") ?? cs.slots[0], remote: m.id > 0, critical: true, cell: cs });
  }

  moduleExt(m: Module, ore: number): number {
    return this.extCount.get(m.id * 100 + ore) ?? 0;
  }

  makeExtractor(m: Module, ore: number): Project | null {
    const hx = this.planner.wx(m, 0, 0);
    const hy = this.planner.wy(m, 0, 0);
    const cand = this.spots
      .filter((s) => s.kind === ore && s.st === 0 && s.next <= this.tick && Math.hypot(s.x - m.cx, s.y - m.cy) < m.L / 2 + (m.id === 0 ? (this.tick > 7200 && ore === this.ids.item.iron_ore ? 60 : 34) : 26))
      .map((s) => ({ s, d: Math.hypot(s.x - hx, s.y - hy) }))
      .sort((a, b) => a.d - b.d);
    for (const { s } of cand.slice(0, 3)) {
      const smelt = ore === this.ids.item.iron_ore || ore === this.ids.item.copper_ore || ore === this.ids.item.silicon;
      // les premières mines alimentent le tapis principal, les suivantes directement le dépôt
      const busMines = this.busMines.get(m.id * 100 + ore) ?? 0;
      const quota = ore === this.ids.item.iron_ore ? 6 : ore === this.ids.item.copper_ore ? 2 : 9;
      const toDepot = smelt && busMines >= quota;
      const places = smelt ? this.planner.planMine(m, s.x, s.y, toDepot) : this.planner.planExtractor(m, s.x, s.y);
      if (!places) {
        s.tries++;
        s.next = this.tick + 2400;
        if (s.tries > 3) s.st = 2;
        continue;
      }
      s.st = 1;
      if (!toDepot) this.busMines.set(m.id * 100 + ore, busMines + 1);
      for (const pl of places) {
        const bd = this.ctx.data.buildings[pl.kind];
        m.use += bd.powerUse;
        m.prod += bd.powerProd;
      }
      const key = m.id * 100 + ore;
      this.extCount.set(key, (this.extCount.get(key) ?? 0) + 1);
      const far = Math.hypot(s.x - this.home[0], s.y - this.home[1]) > 45;
      const p = this.newProject(`ext${m.id}:${ore}`, places, { module: m, spot: s, remote: far || m.id > 0, critical: true });
      // l'extracteur compte pour le module
      (p.spot as SpotState & { key?: number }).key = key;
      return p;
    }
    return null;
  }

  makeTurret(kind: number): Project | null {
    const m = this.planner.modules[0];
    if (!m) return null;
    const n = this.turretsPlanned;
    // anneau orienté vers les adversaires
    const base = Math.atan2(this.enemyDir[1], this.enemyDir[0]);
    const spread = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, 3.1][n % 10];
    const a = base + spread + (Math.floor(n / 10) * 0.25);
    const r = m.L / 2 + 10 + Math.floor(n / 10) * 4;
    const tx = Math.round(m.cx + Math.cos(a) * r);
    const ty = Math.round(m.cy + Math.sin(a) * r);
    const pos = this.planner.findFree(kind, tx, ty, 0, 8, 1);
    this.turretsPlanned++;
    if (!pos) return null;
    this.planner.mark(pos[0], pos[1], 2, 2);
    return this.newProject("turret", [{ kind, x: pos[0], y: pos[1], dir: 0, tag: "turret" }]);
  }

  makeModule(): Project | null {
    // près des gisements libres les plus proches, du côté opposé aux adversaires si possible
    const [hx, hy] = this.home;
    const P = this.persona;
    const cands = this.spots
      .filter((s) => s.st === 0 && (s.kind === this.ids.item.iron_ore || s.kind === this.ids.item.copper_ore))
      .map((s) => {
        const d = Math.hypot(s.x - hx, s.y - hy);
        const toward = ((s.x - hx) * this.enemyDir[0] + (s.y - hy) * this.enemyDir[1]) / (d || 1);
        // densité de gisements autour
        let dens = 0;
        for (const o of this.spots) if (o !== s && o.st === 0 && Math.abs(o.x - s.x) < 30 && Math.abs(o.y - s.y) < 30) dens += o.kind === this.ids.item.iron_ore ? 2 : o.kind === this.ids.item.copper_ore ? 1 : 0;
        if (s.kind === this.ids.item.iron_ore) dens += 2;
        return { s, score: d + toward * 25 - dens * 8 };
      })
      .filter((c) => Math.hypot(c.s.x - hx, c.s.y - hy) < 110)
      .sort((a, b) => a.score - b.score);
    for (const { s } of cands.slice(0, 4)) {
      const near = this.spots.filter((o) => Math.abs(o.x - s.x) < 60 && Math.abs(o.y - s.y) < 60);
      // centre décalé vers la base
      const dx = hx - s.x;
      const dy = hy - s.y;
      const dn = Math.hypot(dx, dy) || 1;
      const cx = Math.round(s.x + (dx / dn) * 14);
      const cy = Math.round(s.y + (dy / dn) * 14);
      const m = this.planner.findModule(cx, cy, near, [38, 32, 26], 8);
      if (!m) {
        s.tries++;
        continue;
      }
      const plan = P.planN[this.modulePlansUsed % P.planN.length];
      this.modulePlansUsed++;
      m.role = "extra";
      this.pendingPlan.set(m, [...plan]);
      this.produces.set(m, new Set());
      return this.newProject("bus", m.bus.slice(), { module: m, remote: true });
    }
    return null;
  }

  reclaim(u: BotUnit, out: Cmd[]): void {
    if (this.tick % 40 !== (u.id % 4) * 10) return;
    const [bx, by] = this.baseCenter();
    const maxR = (u.id === this.me.commander ? 30 : 60) * TILE;
    let best = null;
    let bd = Infinity;
    const taken = new Set(this.reclaiming.values());
    for (const w of this.view.wrecks) {
      if (taken.has(w.ref)) continue;
      const db = dist2(w.x, w.y, bx, by);
      if (db > maxR * maxR) continue;
      const d = dist2(w.x, w.y, u.x, u.y);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    if (best) {
      out.push(target(O.RECLAIM, [u.id], best.ref));
      this.reclaiming.set(u.id, best.ref);
      return;
    }
    // rester près de la base
    if (u.nOrders === 0 && dist2(u.x, u.y, bx, by) > (40 * TILE) ** 2) out.push(move([u], bx, by));
  }

  // ---------- Économie : recettes et régulation ----------
  /**
   * Régulation par la demande : chaque consommateur (usine, laboratoire) indique les objets qui lui
   * manquent ; seuls les producteurs de ces objets (et de leurs ingrédients) tournent, pour que le
   * premier assembleur du tapis ne prenne pas tout le fer. Le stock de construction compte aussi
   * comme consommateur quand il manque d'engrenages, de circuits ou d'acier.
   */
  /** Variation du stock d'un objet sur les 30 dernières secondes. */
  growth(item: number): number {
    const h = this.stockHist;
    if (h.length < 2) return 0;
    return this.stock(item) - h[0][item];
  }

  economy(out: Cmd[]): void {
    const it = this.ids.item;
    this.stockHist.push(Array.from(this.me.stock));
    if (this.stockHist.length > 30) this.stockHist.shift();
    const sim = this.ctx.sim;
    const data = this.ctx.data;
    const demand = new Map<Module, Set<number>>();
    for (const m of this.planner.modules) {
      this.produces.get(m)?.clear();
      demand.set(m, new Set());
    }
    this.waiting.clear();
    // besoins des consommateurs
    for (const m of this.planner.modules) {
      const D = demand.get(m) as Set<number>;
      for (const s of m.slots) {
        const isLab = s.type === "lab";
        if (!isLab && !s.type.startsWith("factory")) continue;
        const ref = sim.buildingAt(s.x, s.y);
        const b = ref ? this.ix.bref.get(ref) : undefined;
        if (!b || b.owner !== this.ctx.slot || b.build < BUILD_FULL) continue;
        const inf = sim.infoBuilding(ref) as { inv: number[]; queue: [number, number][] } | null;
        if (!inf) continue;
        if (isLab) {
          const t = this.me.research;
          if (!t) continue;
          const tier = data.techs[t].tier;
          for (let k = 0; k < tier; k++) if (inf.inv[k] < 2) D.add(it.pack1 + k);
          if (!b.working) this.waiting.add(m);
        } else if (inf.queue.length) {
          const cost = data.units[inf.queue[0][0]].cost;
          for (let j = 0; j < cost.length; j++) if (inf.inv[j] < cost[j][1]) D.add(cost[j][0]);
          if (!b.working) this.waiting.add(m);
        }
      }
      // stock de construction
      if (this.stock(it.gear) < 40) D.add(it.gear);
      if (this.stock(it.circuit) < 30) D.add(it.circuit);
      if (this.stock(it.steel) < 30 && this.tick > 12000) D.add(it.steel);
    }
    // fermeture : ingrédients des producteurs demandés
    for (const m of this.planner.modules) {
      const D = demand.get(m) as Set<number>;
      let grew = true;
      while (grew) {
        grew = false;
        for (const c of this.crafters) {
          if (c.module !== m) continue;
          const r = data.recipes[c.recipe];
          if (!D.has(r.output[0])) continue;
          for (const [inp] of r.inputs) {
            if (!D.has(inp)) {
              D.add(inp);
              grew = true;
            }
          }
        }
      }
    }
    for (const c of this.crafters) {
      if (!c.ref) {
        const ti = sim.tileInfo(c.x, c.y);
        if ((ti & 0xff) === c.kind + 1 && ((ti >> 8) & 0xff) === this.ctx.slot) c.ref = sim.buildingAt(c.x, c.y);
        else continue;
      }
      const b = this.ix.bref.get(c.ref);
      if (!b || b.owner !== this.ctx.slot || b.kind !== c.kind) {
        c.ref = 0;
        continue;
      }
      const r = data.recipes[c.recipe];
      if (b.build >= BUILD_FULL) this.produces.get(c.module)?.add(r.output[0]);
      const outIt = r.output[0];
      let pause = !c.slot.cell && !(demand.get(c.module) as Set<number>).has(outIt);
      // demandé mais déjà en excès au dépôt : arrêt temporaire (le surplus passe les consommateurs)
      if (c.slot.cell) {
        // cellule : régulée par ses bras
      } else if (!pause && this.tick < (c.cooldown ?? 0)) pause = true;
      else if (!pause && this.growth(outIt) > (outIt === it.gear || outIt === it.cable ? 10 : 5) && this.stock(outIt) > 30) {
        c.cooldown = this.tick + 400;
        pause = true;
      }
      c.paused = pause;
      let want = c.recipe;
      if (pause) want = c.kind === this.ids.b.furnace ? this.ids.r.iron_plate : RECIPE_NONE;
      if (b.recipe !== want && this.tick - c.lastCmd > 60) {
        out.push(setRecipe(c.ref, want));
        c.lastCmd = this.tick;
      }
    }
  }

  /** La recherche a-t-elle encore besoin de lots de ce palier ? */
  researchWants(tier: number): boolean {
    const techs = this.ctx.data.techs;
    for (const k of this.persona.research) {
      const t = this.ids.t[k];
      if (t === undefined || this.has(t)) continue;
      if (techs[t].tier >= tier) return true;
    }
    return false;
  }

  // ---------- Usines ----------
  factories(out: Cmd[]): void {
    const P = this.persona;
    const data = this.ctx.data;
    const engTarget = Math.min(P.maxEngineers, P.engineers + Math.floor(this.tick / (6 * 1200)));
    let engs = this.engineerCount();
    for (const b of this.ix.buildingsBy[this.ctx.slot]) {
      if (data.buildings[b.kind].cls !== 8 || b.build < BUILD_FULL) continue;
      let fi = this.factoryInfo.get(b.ref);
      if (!fi) {
        const m = this.planner.modules.find((mm) => mm.slots.some((s) => s.x === b.x && s.y === b.y));
        const slot = m?.slots.find((s) => s.x === b.x && s.y === b.y);
        if (!m || !slot) continue;
        fi = { module: m, slot, lastQ: -1e9, rallied: false, front: -1, lastStart: this.tick };
        this.factoryInfo.set(b.ref, fi);
      }
      if (!fi.rallied) {
        const [rx, ry] = this.rally;
        out.push(rally(b.ref, rx, ry));
        fi.rallied = true;
      }
      if (b.queue >= 1) {
        // unité en attente de composants trop longtemps : l'annuler et éviter ce type un moment
        if (!b.working && fi.front >= 0 && this.tick - fi.lastQ > 1800 && this.tick - fi.lastStart > 1800) {
          out.push(factoryQueue(b.ref, fi.front, -1));
          this.starved.set(fi.module.id * 100 + fi.front, this.tick + 6000);
          fi.lastQ = this.tick;
        }
        if (b.working) fi.lastStart = this.tick;
        continue;
      }
      if (this.tick - fi.lastQ < 40) continue;
      if (this.me.unitCount >= 950) continue;
      const avail = this.availableAt(fi.module, fi.slot);
      const fk = data.buildings[b.kind].factory;
      let pick = -1;
      const eng = this.ids.u.eng1;
      if (fk === 1 && engs < engTarget && this.canBuild(eng, avail)) {
        pick = eng;
        engs++;
      } else if (this.stock(this.ids.item.iron_plate) < 40 && !this.underPressure && engs >= 1) {
        // le stock de construction passe d'abord
        continue;
      } else {
        // composition de l'armée : type disponible le moins représenté par rapport à son poids
        const counts = new Map<number, number>();
        for (const u of this.ix.unitsBy[this.ctx.slot]) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
        let best = Infinity;
        for (const [key, wgt] of Object.entries(P.army)) {
          const k = this.ids.u[key];
          if (k === undefined || data.units[k].factory !== fk || !this.canBuild(k, avail)) continue;
          if ((this.starved.get(fi.module.id * 100 + k) ?? 0) > this.tick) continue;
          // les unités de palier supérieur sont préférées quand elles sont disponibles
          const tierBonus = 1 + data.units[k].tier * 0.3;
          const score = ((counts.get(k) ?? 0) + 1 + this.random() * 0.5) / (wgt * tierBonus);
          if (score < best) {
            best = score;
            pick = k;
          }
        }
      }
      if (pick >= 0) {
        out.push(factoryQueue(b.ref, pick, 1));
        fi.lastQ = this.tick;
        fi.front = pick;
      }
    }
  }

  /** Objets disponibles sur le tapis principal en amont d'un emplacement. */
  availableAt(m: Module, slot: Slot): Set<number> {
    const s = new Set<number>();
    // plaques fondues aux mines du module (arrivent en tête du tapis)
    if (this.moduleExt(m, this.ids.item.iron_ore) > 0) s.add(this.ids.item.iron_plate);
    if (this.moduleExt(m, this.ids.item.copper_ore) > 0) s.add(this.ids.item.copper_plate);
    for (const c of this.crafters) {
      if (c.module !== m || !c.ref) continue;
      const sameCell = slot.cell && c.slot.cell && c.slot.side === slot.side && Math.abs(c.slot.u0 - slot.u0) <= 10;
      if (!sameCell && (c.slot.cell || c.slot.u0 + 1 >= slot.u0)) continue;
      const b = this.ix.bref.get(c.ref);
      if (!b || b.build < BUILD_FULL) continue;
      s.add(this.ctx.data.recipes[c.recipe].output[0]);
    }
    return s;
  }
  canBuild(kind: number, avail: Set<number>): boolean {
    const u = this.ctx.data.units[kind];
    if (!this.has(u.tech)) return false;
    for (const [it] of u.cost) if (!avail.has(it)) return false;
    return true;
  }

  // ---------- Recherche ----------
  researchMgr(out: Cmd[]): void {
    if (this.me.research !== 0) return;
    if (this.tick - this.lastResearch < 40) return;
    const techs = this.ctx.data.techs;
    // lots produits en amont d'un laboratoire
    const packs = new Set<number>();
    for (const m of this.planner.modules) {
      for (const lab of m.slots) {
        if (lab.type !== "lab") continue;
        const st = this.placementState(lab.places[0]);
        if (st !== 3) continue;
        for (const it of this.availableAt(m, lab)) packs.add(it);
      }
    }
    const pack1 = this.ids.item.pack1;
    for (const k of this.persona.research) {
      const t = this.ids.t[k];
      if (t === undefined || this.has(t)) continue;
      const td = techs[t];
      if (!td.prereq.every((q) => this.has(q))) continue;
      let ok = true;
      for (let tier = 1; tier <= td.tier; tier++) if (!packs.has(pack1 + tier - 1)) ok = false;
      if (!ok) continue;
      out.push(research(t));
      this.lastResearch = this.tick;
      return;
    }
  }

  // ---------- Commandant ----------
  commander(out: Cmd[]): void {
    const c = this.unitById(this.me.commander);
    if (!c) return;
    // en danger : rentrer au centre de la base si des ennemis sont proches et qu'il est blessé
    if (c.hp < this.ctx.data.units[c.kind].hp * 0.35 && this.army.threat) {
      const [bx, by] = this.baseCenter();
      if (dist2(c.x, c.y, bx, by) > (6 * TILE) ** 2 && this.tick % 100 === 0) out.push(move([c], bx - this.enemyDir[0] * 10 * TILE, by - this.enemyDir[1] * 10 * TILE));
    }
  }
}
