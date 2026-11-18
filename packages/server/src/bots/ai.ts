// IA d'escarmouche, organisée comme celle de Supreme Commander : des builders (tâches avec priorité
// et conditions) choisis par des gestionnaires (ingénieurs, usines, recherche, pelotons), et des
// personnalités qui changent les listes et les priorités.
//
// Couche militaire inspirée de l'IA du mod LOUD : cartes de menace (intel.ts), rapports de force qui
// orientent la production (antiaérien contre l'aviation, amphibies contre les îles), objectifs choisis
// selon leur valeur et leur défense, pelotons qui se regroupent et jugent un combat avant de l'engager
// (army.ts), appels à l'aide et cible commune entre IA alliées.
//
// Économie : modules « sushi » (voir layout.ts). Chaque module a un tapis principal qui finit dans
// un dépôt ; les extracteurs y versent le minerai, les bâtiments de part et d'autre prennent ce dont
// ils ont besoin et y reposent leurs produits ; le reste alimente le stock commun des ingénieurs.
import type { Bot, BotContext } from "./types.ts";
import { serialize, deserialize } from "node:v8";
import type { BotView, Cmd, BotUnit, BotBuilding, PlayerView } from "@supreme/shared";
import { build, move, target, O, factoryQueue, rally, setRecipe, research, hasTech, RECIPE_NONE, BUILD_FULL } from "@supreme/shared";
import { Ids, indexView, TILE, dist2, unitsNear, type ViewIndex } from "./util.ts";
import { Planner, CELLS, type Module, type Placement, type Slot, type CellSlot } from "./layout.ts";
import { PERSONAS, AIR_PLAN, TECH_PLAN, ARMY_PLAN, MAIN_AIR_PLAN, type Persona } from "./personas.ts";
import { Army } from "./army.ts";
import { intelOf, teamBoard, kindPowers, T, type Intel, type TeamBoard } from "./intel.ts";

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

const landCache = new WeakMap<object, Int32Array>();
/** Composantes connexes des cases praticables à pied (calculées une fois par carte, comme map.rs). */
export function landComponents(map: BotContext["map"]): Int32Array {
  let comp = landCache.get(map);
  if (comp) return comp;
  const { w, h, heights, waterLevel } = map;
  const pass = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = heights[i];
      if (c < waterLevel || x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
      let mx = 0;
      if (x > 0) mx = Math.max(mx, Math.abs(heights[i - 1] - c));
      if (x < w - 1) mx = Math.max(mx, Math.abs(heights[i + 1] - c));
      if (y > 0) mx = Math.max(mx, Math.abs(heights[i - w] - c));
      if (y < h - 1) mx = Math.max(mx, Math.abs(heights[i + w] - c));
      if (mx <= 7) pass[i] = 1;
    }
  }
  comp = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!pass[s] || comp[s] >= 0) continue;
    comp[s] = n;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % w;
      if (x > 0 && pass[i - 1] && comp[i - 1] < 0) {
        comp[i - 1] = n;
        stack.push(i - 1);
      }
      if (x < w - 1 && pass[i + 1] && comp[i + 1] < 0) {
        comp[i + 1] = n;
        stack.push(i + 1);
      }
      if (i >= w && pass[i - w] && comp[i - w] < 0) {
        comp[i - w] = n;
        stack.push(i - w);
      }
      if (i + w < w * h && pass[i + w] && comp[i + w] < 0) {
        comp[i + w] = n;
        stack.push(i + w);
      }
    }
    n++;
  }
  landCache.set(map, comp);
  return comp;
}

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
  /** dépôts posés en plus de celui du module principal, et tick du dernier */
  extraDepots = 0;
  lastDepot = -1e9;
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
  mainAir = false;
  powerLow = new Set<Module>();
  failUntil = new Map<string, number>();
  busMines = new Map<number, number>();
  blockedSince = new Map<string, number>();
  thinkN = 0;
  /** échecs de placement par entrée de plan (« module:type ») */
  slotFails = new Map<string, number>();
  /** l'usine du module principal n'a pas pu être placée : le prochain module sera un module d'armée */
  factoryLost = false;
  /** depuis ce tick, plus aucun chantier en cours faute de ressources (0 : non) */
  starvedSince = 0;
  stats = { projectsDone: 0, projectsFailed: 0 };
  landTarget = -1;
  /** assauts repoussés par la cible terrestre au moment de son choix */
  landTargetRepelled = 0;
  airTarget = -1;
  debug = false;
  /** niveau de difficulté */
  level: string;
  intel!: Intel;
  board!: TeamBoard;
  enemyIds: number[] = [];
  friendIds: number[] = [];
  /** aviation ennemie / défense antiaérienne : > 1 = il manque de l'antiaérien */
  airRatio = 0;
  /** puissance terrestre ennemie (la plus forte) / la nôtre */
  landRatio = 1;
  turretsAA = 0;
  /** le commandant se met à l'abri jusqu'à ce tick (pas de construction) */
  cmdHoldUntil = -1;
  cmdMoved = -1e9;
  prof = typeof process !== "undefined" && process.env?.BOTPROF === "1";

  constructor(ctx: BotContext) {
    this.ctx = ctx;
    this.ids = new Ids(ctx.data);
    this.persona = PERSONAS[ctx.personality] ?? PERSONAS.adaptive;
    this.level = ctx.level === "facile" || ctx.level === "difficile" ? ctx.level : "normal";
    this.planner = new Planner(ctx.sim, ctx.slot, this.ids, ctx.map.w, ctx.map.h);
    this.army = new Army(this.persona.firstAttack, this.persona.airAttack);
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
    this.debug = typeof process !== "undefined" && (process.env?.BOTDEBUG ?? "").split(",").includes(String(ctx.slot));
  }

  // ---------- Sauvegarde de partie ----------
  // L'état interne (modules, chantiers, pelotons…) est cloné d'un bloc par v8.serialize, qui garde les
  // références partagées (un module est à la fois dans le planificateur, les chantiers et les usines).
  // Le contexte (simulation, données) et les tampons de travail sont recréés par le constructeur.
  static readonly SKIP_AI = new Set(["ctx", "ids", "persona", "planner", "army", "view", "ix", "me", "intel", "board", "savedBoard", "unitMap", "debug", "prof"]);
  static readonly SKIP_PLANNER = new Set(["sim", "ids", "heap", "gcost", "from", "stamp", "stampN"]);

  save(): Uint8Array {
    const pick = (o: object, skip: Set<string>) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !skip.has(k) && typeof v !== "function"));
    return serialize({ version: 1, ai: pick(this, SkirmishAI.SKIP_AI), planner: pick(this.planner, SkirmishAI.SKIP_PLANNER), army: pick(this.army, new Set()), board: this.board ?? null });
  }

  load(state: Uint8Array): void {
    const s = deserialize(state) as { version: number; ai: object; planner: object; army: object; board: TeamBoard | null };
    if (s.version !== 1) throw new Error("état d'IA de version inconnue");
    Object.assign(this, s.ai);
    Object.assign(this.planner, s.planner);
    Object.assign(this.army, s.army);
    this.savedBoard = s.board;
  }
  /** tableau d'équipe sauvegardé, repris à la première décision (le premier allié rechargé le rétablit) */
  savedBoard: TeamBoard | null = null;

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
  /**
   * Adversaire à attaquer : le plus proche encore en vie (pondéré par la taille de son armée).
   * Pour une armée terrestre, seulement les adversaires joignables par la terre. Cible collante.
   */
  pickTarget(land: boolean): number {
    const valid = (t: number) => t >= 0 && this.view.players[t]?.alive && !this.sameTeam(t) && (!land || this.reachable(t));
    const prev = land ? this.landTarget : this.airTarget;
    const repelled = (t: number) => this.army.repelled[t] ?? 0;
    // deux assauts repoussés de plus depuis le choix de cette cible : en changer
    if (land && valid(prev) && repelled(prev) >= this.landTargetRepelled + 2 && this.enemyIds.length > 1) {
      this.landTarget = -1;
      if (this.board.target === prev) this.board.target = -1;
      this.log("cible", prev, "trop défendue : changement d'adversaire");
    } else if (valid(prev)) {
      if (land && !valid(this.board.target)) this.board.target = prev;
      return prev;
    }
    const [bx, by] = this.baseCenter();
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.view.players.length; i++) {
      const p = this.view.players[i];
      if (i === this.ctx.slot || !p.alive || p.team === this.me.team) continue;
      if (land && !this.reachable(i)) continue;
      const [x, y] = this.playerPos(i);
      // plus proche, et plus faible (puissance terrestre et défenses d'après le renseignement)
      const strength = this.intel.land[i] / Math.max(1, this.intel.land[this.ctx.slot]);
      let d = Math.sqrt(dist2(bx, by, x, y)) * (1 + Math.min(3, strength) * 0.4);
      // l'aviation va de préférence là où l'armée de terre ne peut pas aller
      if (!land && !this.reachable(i)) d *= 0.5;
      // adversaires qui nous ont déjà repoussés : en dernier
      if (land) d *= 1 + repelled(i) * 0.7;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // cible commune de l'équipe : on rejoint l'adversaire choisi par un allié s'il n'est pas beaucoup
    // plus loin que le nôtre (sinon chacun garde son adversaire naturel, pour ne pas laisser l'autre libre)
    const shared = this.board.target;
    if (land && this.level !== "facile" && best >= 0 && shared !== best && valid(shared)) {
      const [sx, sy] = this.playerPos(shared);
      const [px, py] = this.playerPos(best);
      if (Math.sqrt(dist2(bx, by, sx, sy)) < Math.sqrt(dist2(bx, by, px, py)) * 1.3) best = shared;
    }
    if (land) {
      this.landTarget = best;
      this.landTargetRepelled = best >= 0 ? repelled(best) : 0;
      if (best >= 0 && !valid(shared)) {
        this.board.target = best;
        this.board.targetSince = this.tick;
      }
    } else this.airTarget = best;
    return best;
  }

  // ---------- Renseignement (cartes de menace) ----------
  enemySum(layer: T, x: number, y: number, rTiles: number): number {
    return this.intel.sum(this.enemyIds, layer, x, y, rTiles);
  }
  friendSum(layer: T, x: number, y: number, rTiles: number): number {
    return this.intel.sum(this.friendIds, layer, x, y, rTiles);
  }
  enemyAirTotal(): number {
    let s = 0;
    for (const e of this.enemyIds) s += this.intel.air[e];
    return s;
  }
  /** Défense en place autour d'un point : tourelles et unités de l'équipe. */
  defensePower(x: number, y: number): number {
    return this.friendSum(T.Surface, x, y, 30);
  }

  /** Rapports de force (LOUD : ArmyAnalysis), recalculés régulièrement. */
  analyse(): void {
    const I = this.intel;
    const me = this.ctx.slot;
    let airMax = 0;
    let airSum = 0;
    let landMax = 0;
    for (const e of this.enemyIds) {
      airMax = Math.max(airMax, I.air[e]);
      airSum += I.air[e];
      landMax = Math.max(landMax, I.land[e]);
    }
    // l'adversaire le plus aérien compte plein, les autres en partie
    const enemyAir = airMax + (airSum - airMax) * 0.3;
    const myAA = I.airToAir[me] + I.aaUnits[me] + I.aaTurrets[me] * 0.5;
    this.airRatio = enemyAir / Math.max(150, myAA);
    this.landRatio = landMax / Math.max(100, I.land[me]);
  }

  /**
   * Objectif d'attaque chez un adversaire (LOUD : plan d'attaque sur les cartes de menace).
   * mode 1 : assaut terrestre (valeur / défense au sol), 2 : frappe aérienne (valeur / antiaérien),
   * 3 : raid (installations isolées, la défense compte beaucoup).
   */
  objective(p: number, power: number, landOnly: boolean, mode: number): [number, number] | null {
    const I = this.intel;
    const seen = new Set<number>();
    const comp = landOnly ? landComponents(this.ctx.map) : null;
    const [hx, hy] = this.home;
    const home = comp ? comp[hy * this.ctx.map.w + hx] : -1;
    const [bx, by] = this.baseCenter();
    let best: [number, number] | null = null;
    let bs = 0;
    for (const b of this.ix.buildingsBy[p]) {
      const x = b.x * TILE + TILE;
      const y = b.y * TILE + TILE;
      const c = I.cell(x, y);
      if (seen.has(c) || I.layers[p][T.Eco][c] < 1) continue;
      seen.add(c);
      if (comp && comp[b.y * this.ctx.map.w + b.x] !== home && comp[Math.min(this.ctx.map.h - 1, b.y + 2) * this.ctx.map.w + b.x] !== home) continue;
      const value = I.sum([p], T.Eco, x, y, 16);
      const threat = mode === 2 ? this.enemySum(T.AntiAir, x, y, 14) : this.enemySum(T.Surface, x, y, 22);
      const dist = Math.sqrt(dist2(x, y, bx, by)) / TILE;
      let score = Math.pow(value, 0.6) / (1 + (threat / Math.max(1, power)) * (mode === 3 ? 5 : 2)) / (1 + dist / 250);
      if (mode !== 2 && threat > power * 1.3) score *= 0.15;
      if (score > bs) {
        bs = score;
        best = [x, y];
      }
    }
    // le commandant adverse : sa destruction élimine le joueur (assaut seulement)
    const c = mode === 1 ? this.unitById(this.view.players[p].commander) : undefined;
    if (c && (!comp || comp[Math.floor(c.y / TILE) * this.ctx.map.w + Math.floor(c.x / TILE)] === home)) {
      const threat = this.enemySum(T.Surface, c.x, c.y, 22);
      const dist = Math.sqrt(dist2(c.x, c.y, bx, by)) / TILE;
      let score = Math.pow(2500, 0.6) / (1 + (threat / Math.max(1, power)) * 2) / (1 + dist / 250);
      if (threat > power * 1.3) score *= 0.15;
      if (score > bs) best = [c.x, c.y];
    }
    return best;
  }

  /** Publie un appel à l'aide pour l'équipe (menace sur une de nos installations). */
  postDistress(x: number, y: number, power: number, air: boolean, vip = false): void {
    const D = this.board.distress;
    const me = this.ctx.slot;
    const old = D.find((d) => d.player === me && d.air === air && d.vip === vip && dist2(d.x, d.y, x, y) < (30 * TILE) ** 2);
    if (old) Object.assign(old, { x, y, power, tick: this.tick });
    else D.push({ x, y, power, tick: this.tick, player: me, air, vip });
  }

  /** Appel à l'aide auquel un peloton (au point x, y, de puissance donnée) devrait répondre. */
  distressFor(x: number, y: number, power: number, air: boolean): { x: number; y: number } | null {
    if (this.level === "facile") {
      const t = this.army.threat;
      return t && !air && this.tick - t.tick < 60 ? { x: t.x, y: t.y } : null;
    }
    this.board.distress = this.board.distress.filter((d) => this.tick - d.tick < 120 && this.view.players[d.player]?.alive);
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const d of this.board.distress) {
      if (d.air !== air || this.tick - d.tick > 40) continue;
      const mine = d.player === this.ctx.slot;
      const dd = dist2(x, y, d.x, d.y);
      // un allié : seulement s'il est à portée et si notre aide peut compter
      if (!mine && (dd > (160 * TILE) ** 2 || power < d.power * 0.3)) continue;
      // un commandant menacé passe avant tout (le perdre, c'est perdre la partie)
      const score = dd * (d.vip ? 0.02 : mine ? 0.25 : 1);
      if (score < bd) {
        bd = score;
        best = { x: d.x, y: d.y };
      }
    }
    return best;
  }
  /**
   * Point (sous-unités) proche de (x, y) sur la même terre que (tx, ty) : recherche en spirale jusqu'à
   * 40 cases, sinon l'objectif lui-même.
   */
  landNear(x: number, y: number, tx: number, ty: number): [number, number] {
    const map = this.ctx.map;
    const comp = landComponents(map);
    const cx = Math.max(0, Math.min(map.w - 1, Math.floor(x / TILE)));
    const cy = Math.max(0, Math.min(map.h - 1, Math.floor(y / TILE)));
    const want = comp[Math.max(0, Math.min(map.h - 1, Math.floor(ty / TILE))) * map.w + Math.max(0, Math.min(map.w - 1, Math.floor(tx / TILE)))];
    if (want < 0) return [x, y];
    if (comp[cy * map.w + cx] === want) return [x, y];
    for (let r = 1; r <= 40; r++) {
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const px = cx + dx;
          const py = cy + dy;
          if (px < 1 || py < 1 || px >= map.w - 1 || py >= map.h - 1 || comp[py * map.w + px] !== want) continue;
          // à distance égale, le point le plus proche de l'objectif
          const d = (px * TILE - tx) ** 2 + (py * TILE - ty) ** 2;
          if (d < bd) {
            bd = d;
            best = [px * TILE + TILE / 2, py * TILE + TILE / 2];
          }
        }
      }
      if (best) return best;
    }
    return [tx, ty];
  }

  playerPos(i: number): [number, number] {
    const c = this.unitById(this.view.players[i].commander);
    return c ? [c.x, c.y] : [this.ctx.map.starts[i][0] * TILE + TILE / 2, this.ctx.map.starts[i][1] * TILE + TILE / 2];
  }
  /** Le joueur est-il joignable par la terre depuis notre base ? */
  reachable(i: number): boolean {
    const comp = landComponents(this.ctx.map);
    const [hx, hy] = this.home;
    const [x, y] = this.playerPos(i);
    const a = comp[hy * this.ctx.map.w + hx];
    const b = comp[Math.floor(y / TILE) * this.ctx.map.w + Math.floor(x / TILE)];
    return a >= 0 && a === b;
  }
  anyUnreachable(): boolean {
    for (let i = 0; i < this.view.players.length; i++) {
      if (i === this.ctx.slot || !this.view.players[i].alive || this.sameTeam(i)) continue;
      if (!this.reachable(i) || !this.baseReachable(i)) return true;
    }
    return false;
  }
  /** La base de départ du joueur est-elle sur notre terre ? (stable, contrairement au commandant) */
  baseReachable(i: number): boolean {
    const comp = landComponents(this.ctx.map);
    const w = this.ctx.map.w;
    const [hx, hy] = this.home;
    const [sx, sy] = this.ctx.map.starts[i];
    return comp[hy * w + hx] >= 0 && comp[hy * w + hx] === comp[sy * w + sx];
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
    // niveau facile : décisions trois fois moins fréquentes
    if (this.level === "facile" && this.thinkN % 3 !== 1) return out;
    if (this.planner.modules.length === 0) this.setupBase();
    this.intel = intelOf(view, this.ctx.data, this.ctx.map.w, this.ctx.map.h);
    this.board = teamBoard(this.ctx.sim, this.me.team);
    if (this.savedBoard) {
      if (this.board.targetSince === -1e9 && this.board.distress.length === 0) Object.assign(this.board, this.savedBoard);
      this.savedBoard = null;
    }
    this.enemyIds = [];
    this.friendIds = [];
    for (let i = 0; i < view.players.length; i++) {
      const pl = view.players[i];
      if (!pl.alive) continue;
      if (pl.team === this.me.team) this.friendIds.push(i);
      else this.enemyIds.push(i);
    }
    if (this.thinkN % 10 === 1 && this.level !== "facile") this.analyse();
    if (this.debug && this.thinkN % 120 === 1) {
      const top = this.engBuilders(this.builderUnits()[0] ?? ({} as BotUnit)).sort((a, b) => b.prio - a.prio).slice(0, 5).map((b) => `${b.name}:${b.prio}`);
      this.log("état", "recherche", this.me.research, "plan", JSON.stringify([...this.pendingPlan.values()]), "chantiers", this.projects.map((p) => `${p.name}[${p.builders.length}]`).join(","), "priorités", top.join(" "), "commandant", ((c) => (c ? `${Math.round(c.x / TILE)},${Math.round(c.y / TILE)} ordres ${c.nOrders} (${c.order})` : "?"))(this.unitById(this.me.commander)), "abri", this.cmdHoldUntil > this.tick);
    }
    this.underPressure = this.tick - this.lastThreat < 1200;
    const prof = this.prof;
    let t0 = prof ? performance.now() : 0;
    const lap = (name: string) => {
      if (!prof) return;
      const t1 = performance.now();
      if (t1 - t0 > 15) console.log(`[J${this.ctx.slot} t${this.tick}] lent : ${name} ${(t1 - t0).toFixed(1)} ms`);
      t0 = t1;
    };
    this.engineers(out);
    lap("ingénieurs");
    if (this.thinkN % 2 === 0) this.economy(out);
    if (this.thinkN % 2 === 1) this.factories(out);
    lap("économie/usines");
    if (this.thinkN % 4 === 0) this.researchMgr(out);
    // niveau normal : tactique deux fois moins réactive que le niveau difficile
    if (this.level !== "normal" || this.thinkN % 2 === 0) this.army.think(this, this.ix, this.tick, out);
    this.commander(out);
    lap("armée");
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
      // commandant à l'abri : il garde son chantier mais n'y retourne qu'une fois le danger passé
      if (u.id === cmdId && this.tick < this.cmdHoldUntil) continue;
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
    // bâtisseur encore en route vers un chantier lointain (long détour autour d'un lac, d'une falaise) :
    // le trajet ne compte pas comme une absence de progrès
    const next = p.places.find((_, i) => p.st[i] === 0);
    if (next && p.builders.some((id) => {
      const u = this.unitById(id);
      return !!u && u.nOrders > 0 && dist2(u.x, u.y, next.x * TILE, next.y * TILE) > (20 * TILE) ** 2;
    })) p.lastProgress = Math.max(p.lastProgress, this.tick - 3000);
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
    // une seule tâche importante épargne à la fois (des réserves cumulées bloquaient tout le reste)
    let saving = false;
    for (const b of list) {
      if (b.prio <= 0) break;
      if (b.remote && isCmd && this.engineerCount() > 0) continue;
      if (this.projects.some((p) => p.name === b.name)) continue;
      if (!this.estAffordable(b.est, res)) {
        // épargner pour les tâches importantes
        if (b.prio >= 780 && !saving) {
          this.reserveEst(b.est, res);
          saving = true;
        }
        continue;
      }
      if ((this.failUntil.get(b.name) ?? 0) > this.tick) continue;
      const p = b.make();
      if (!p) {
        // échec de planification : ne pas recommencer à chaque décision
        this.failUntil.set(b.name, this.tick + (b.name === "module" ? 1200 : 300));
        // étape d'ouverture impossible (plus de gisement à portée…) : passer à la suivante
        if (b.prio === 990) this.openingIdx++;
        continue;
      }
      this.projects.push(p);
      this.starvedSince = 0;
      if (b.prio === 990) this.openingIdx++;
      this.log("début", p.name, p.slot?.type ?? "", p.places.length, "placements");
      return p;
    }
    // constructeur sans chantier faute de ressources : les usines laisseront remonter le stock
    if (list.some((b) => b.prio > 0 && !this.projects.some((p) => p.name === b.name) && !this.estAffordable(b.est, this.reserved())) && this.projects.length === 0 && !this.starvedSince) this.starvedSince = this.tick;
    if (this.debug && this.thinkN % 60 === 0) {
      const why = list.filter((b) => b.prio > 0).slice(0, 5).map((b) => {
        if (this.projects.some((p) => p.name === b.name)) return `${b.name}:en cours`;
        if (b.remote && isCmd && this.engineerCount() > 0) return `${b.name}:distant`;
        if (!this.estAffordable(b.est, res)) return `${b.name}:coût ${b.est.join("/")}`;
        if ((this.failUntil.get(b.name) ?? 0) > this.tick) return `${b.name}:échec récent`;
        return `${b.name}:?`;
      });
      this.log("rien à lancer", why.join(" "), "réservé", res.slice(0, 5).join("/"), "stock fer", this.stock(this.ids.item.iron_plate), "cuivre", this.stock(this.ids.item.copper_plate), "engr", this.stock(this.ids.item.gear), "circ", this.stock(this.ids.item.circuit));
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
      const starved = this.powerLow.has(m);
      if (m.prod < m.use * 1.1 + 60 || starved) {
        L.push({
          name: "power" + m.id,
          prio: m.prod < m.use || starved ? 960 : 700,
          remote: m.id > 0,
          est: [10, 8],
          make: () => {
            const g = this.planner.planGenerator(m);
            if (!g) return null;
            m.prod += 400;
            this.powerLow.delete(m);
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
          if (this.tick - (this.blockedSince.get(key) as number) > 4800 && m.role !== "air") k = pend.findIndex((t) => this.slotAvailable(t));
        }
        if (k >= 0) {
          const type = pend[k];
          let prio = 800 - m.id * 50;
          if (type === "lab" || type.startsWith("A:pack")) prio += P.techBias;
          if (type.startsWith("factory")) prio += P.name === "rush" ? 80 : 20;
          // première usine (et ses fournisseurs) : avant tout le reste (ingénieurs et armée en dépendent)
          if ((this.isFactoryEntry(type) || pend.slice(0, 4).includes("factory:land_factory")) && !this.hasFactorySlot()) prio = 985;
          L.push({ name: "slot" + m.id, prio, remote: m.id > 0, est: this.slotEst(type), make: () => this.makeSlot(m, type, k) });
        }
      }
    }
    // conversion du module principal à l'aviation (adversaires inaccessibles par la terre)
    if (!this.mainAir && this.has(this.ids.t.electronics) && this.has(this.ids.t.hydrocarbons) && this.anyUnreachable()) {
      const pend = this.pendingPlan.get(m0);
      if (pend && pend.length === 0 && !m0.full) {
        this.mainAir = true;
        m0.noLand = true;
        pend.push(...MAIN_AIR_PLAN);
        this.log("conversion du module principal à l'aviation");
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
      // antiaérien : quand l'aviation ennemie dépasse notre défense (la moitié des tourelles au plus)
      const wantAA = this.level !== "facile" && this.has(this.ids.t.aa_turret) && this.airRatio > 0.4 && this.turretsAA < Math.min(12, 2 + this.airRatio * 4);
      const airRaid = this.army.threat && this.army.threat.air > 0 && this.tick - this.army.threat.tick < 200;
      if (this.turretsPlanned < want || (threatened && this.turretsPlanned < want + 4) || wantAA) {
        const heavy = this.has(this.ids.t.heavy_turret) && this.stock(it.steel) > 60 && this.stock(it.ammo) > 20 && this.turretsPlanned % 2 === 1;
        const aa = wantAA && (this.turretsAA * 2 <= this.turretsPlanned || airRaid) && this.stock(it.steel) > 8;
        const kind = aa ? this.ids.b.aa_turret : heavy ? this.ids.b.heavy_turret : this.ids.b.light_turret;
        L.push({ name: "turret", prio: (threatened || (aa && airRaid) ? 870 : aa ? 760 : 560) + P.defenseBias, est: aa ? [0, 0, 8, 0, 4] : heavy ? [0, 0, 20, 0, 5] : [12, 0, 0, 4, 2], make: () => this.makeTurret(kind) });
      }
    }
    // module supplémentaire
    const allBuilt = mods.every((m) => busDone(m));
    const planDone = mods.every((m) => m.full || (this.pendingPlan.get(m)?.length ?? 0) === 0);
    const rich = this.stock(it.iron_plate) > 600 && this.stock(it.copper_plate) > 300;
    const maxMods = 1 + P.modules + (rich ? 3 : 0);
    const coreDone = m0.slots.some((s) => s.type.startsWith("factory")) && !this.projects.some((p) => p.module === m0 && p.name.startsWith("slot"));
    // le module technologique attend que l'usine soit placée (sinon le commandant, seul constructeur,
    // part poser un tapis loin de la base au lieu de l'usine qui donne les ingénieurs)
    const techFirst = !mods.some((m) => m.role === "tech") && m0.slots.some((s) => s.type === "lab") && this.hasFactorySlot();
    if (allBuilt && mods.length < maxMods && this.factoryLost && !this.hasFactorySlot()) {
      // usine impossible dans le module principal : un module d'armée, sans attendre
      L.push({ name: "module", prio: 950, remote: true, est: [150, 60], make: () => this.makeModule() });
    } else if (allBuilt && mods.length < maxMods && this.tick > P.moduleDelay && (planDone || rich || coreDone || techFirst || this.tick > P.moduleDelay * 2)) {
      L.push({ name: "module", prio: techFirst ? 810 : 520, remote: true, est: [150, 60], make: () => this.makeModule() });
    }
    // réserve presque pleine (plafond fixé par les dépôts) : un dépôt de plus près du centre, au plus
    // un par minute
    const cap = this.me.stockCap ?? 0;
    if (cap > 0 && this.extraDepots < 8 && this.tick - this.lastDepot > 1200 && this.me.stock.some((n) => n >= cap * 0.85)) {
      L.push({ name: "depot", prio: 830, est: [8], make: () => this.makeDepot(m0) });
    }
    return L;
  }

  /** Dépôt seul autour du module : agrandit la réserve. */
  makeDepot(m: Module): Project | null {
    const kind = this.ids.b.depot;
    const a = this.extraDepots * 1.3 + 0.6;
    const r = m.L / 2 + 4;
    this.extraDepots++;
    this.lastDepot = this.tick;
    const pos = this.planner.findFree(kind, Math.round(m.cx + Math.cos(a) * r), Math.round(m.cy + Math.sin(a) * r), 0, 8, 1);
    if (!pos) return null;
    this.planner.mark(pos[0], pos[1], 2, 2);
    return this.newProject("depot", [{ kind, x: pos[0], y: pos[1], dir: 0, tag: "storage" }]);
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
    if (!slot) return this.slotFailed(m, type, k);
    this.pendingPlan.get(m)?.splice(k, 1);
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

  /** Entrée de plan d'un type qui fait une usine (cellule de robots ou usine seule). */
  isFactoryEntry(type: string): boolean {
    return type.startsWith("factory") || type === "cell:robot";
  }

  /**
   * Placement impossible d'une entrée de plan : elle reste en tête du plan et sera retentée (le module
   * peut se libérer) ; après 3 échecs elle est abandonnée. Une usine perdue n'est jamais oubliée :
   * le prochain module sera un module d'armée.
   */
  slotFailed(m: Module, type: string, k: number): null {
    const key = m.id + ":" + type;
    const n = (this.slotFails.get(key) ?? 0) + 1;
    this.slotFails.set(key, n);
    this.log("échec de placement", type, "module", m.id, "essai", n);
    if (n >= 3) {
      const pend = this.pendingPlan.get(m);
      if (type === "cell:robot" && !this.hasFactorySlot() && pend) {
        // cellule trop grande pour la place restante : une usine seule, alimentée par le tapis, avec en
        // amont les assembleurs de ses composants (engrenages, câbles, circuits)
        pend.splice(k, 1, "A:gear", "A:cable", "A:circuit", "factory:land_factory");
        this.log("cellule d'usine impossible : usine seule à la place");
      } else {
        pend?.splice(k, 1);
        if (this.isFactoryEntry(type) && !this.hasFactorySlot()) this.factoryLost = true;
      }
    }
    return null;
  }

  /** Une usine (terrestre, aérienne ou navale) est-elle placée dans un module (en chantier ou finie) ? */
  hasFactorySlot(): boolean {
    return this.planner.modules.some((mm) => mm.slots.some((sl) => sl.type.startsWith("factory")));
  }

  makeCell(m: Module, type: string, k: number): Project | null {
    const cs = this.planner.allocCell(m, CELLS[type.slice(5)]);
    if (!cs) return this.slotFailed(m, type, k);
    this.pendingPlan.get(m)?.splice(k, 1);
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
      .filter((s) => s.kind === ore && s.st === 0 && s.next <= this.tick && Math.hypot(s.x - m.cx, s.y - m.cy) < m.L / 2 + (ore === this.ids.item.hydrocarbon ? 50 : m.id === 0 ? (ore === this.ids.item.iron_ore && this.moduleExt(m, ore) < 3 && this.stock(this.ids.item.iron_plate) < 120 && this.tick > 6000 ? 60 : 34) : ore === this.ids.item.iron_ore ? 60 : 40))
      .map((s) => ({ s, d: Math.hypot(s.x - hx, s.y - hy) }))
      .sort((a, b) => a.d - b.d);
    for (const { s } of cand.slice(0, 3)) {
      const smelt = ore === this.ids.item.iron_ore || ore === this.ids.item.copper_ore || ore === this.ids.item.silicon;
      // les premières mines alimentent le tapis principal, les suivantes directement le dépôt
      const busMines = this.busMines.get(m.id * 100 + ore) ?? 0;
      // trafic du tapis principal limité (les bras ne posent un objet que dans un trou de 1/2 case)
      const quota = ore === this.ids.item.iron_ore ? (m.role === "air" ? 4 : m.role === "tech" ? 4 : 5) : ore === this.ids.item.copper_ore ? (m.role === "tech" ? 3 : 2) : 9;
      const toDepot = smelt && busMines >= quota;
      // le module principal laisse le fer en trop aux autres modules (sauf si le fer manque :
      // rééquilibrage de l'économie selon les stocks, comme LOUD)
      const ironShort = this.stock(this.ids.item.iron_plate) < 100 && this.stock(this.ids.item.copper_plate) > 400 && this.moduleExt(m, ore) < 7;
      if (toDepot && m.role === "main" && ore === this.ids.item.iron_ore && this.tick > 9000 && !ironShort) {
        s.next = this.tick + 6000;
        continue;
      }
      const places = smelt ? this.planner.planMine(m, s.x, s.y, toDepot) : this.planner.planExtractor(m, s.x, s.y);
      if (!places) {
        this.log("échec du tracé de mine", ore, "en", s.x, s.y, "essai", s.tries + 1, ":", this.planner.lastFail);
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
    // défense du module le plus récemment menacé (LOUD : points de défense aux bases d'expansion),
    // tournée vers la menace ; sinon module principal, tourné vers les adversaires
    const t = this.army.threat && this.tick - this.army.threat.tick < 1200 ? this.army.threat : null;
    let m = this.planner.modules[0];
    if (!m) return null;
    let dir = this.enemyDir;
    if (t && this.level !== "facile") {
      let bd = Infinity;
      for (const mm of this.planner.modules) {
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
    const n = this.turretsPlanned;
    if (kind === this.ids.b.aa_turret) this.turretsAA++;
    // anneau orienté vers la menace (l'antiaérien plus près du centre)
    const base = Math.atan2(dir[1], dir[0]);
    const spread = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, 3.1][n % 10];
    const a = base + spread + (Math.floor(n / 10) * 0.25);
    const r = (kind === this.ids.b.aa_turret ? m.L / 2 + 2 : m.L / 2 + 10) + Math.floor(n / 10) * 4;
    const tx = Math.round(m.cx + Math.cos(a) * r);
    const ty = Math.round(m.cy + Math.sin(a) * r);
    const pos = this.planner.findFree(kind, tx, ty, 0, 8, 1);
    this.turretsPlanned++;
    if (!pos) return null;
    this.planner.mark(pos[0], pos[1], 2, 2);
    return this.newProject("turret", [{ kind, x: pos[0], y: pos[1], dir: 0, tag: "turret" }]);
  }

  makeModule(): Project | null {
    const [hx, hy] = this.home;
    const P = this.persona;
    const it = this.ids.item;
    // l'aviation d'abord si un adversaire n'est pas joignable par la terre
    let plan = P.planN[this.modulePlansUsed % P.planN.length];
    const hasAir = this.planner.modules.some((mm) => mm.role === "air");
    const hasTech = this.planner.modules.some((mm) => mm.role === "tech");
    const airReady = this.has(this.ids.t.electronics) && this.has(this.ids.t.hydrocarbons);
    // pas d'aviation sans les recherches ; pas d'armée de terre en plus si personne n'est joignable
    // progression technologique garantie : recherche à l'arrêt, ou déjà un module secondaire sans technologie
    const researchStalled = this.me.research === 0 && this.tick - this.lastResearch > 3600;
    if (!hasTech && (plan === AIR_PLAN || this.anyUnreachable() || (this.level !== "facile" && (researchStalled || this.planner.modules.length >= 2)))) plan = TECH_PLAN;
    else if (plan === AIR_PLAN && !airReady) plan = ARMY_PLAN;
    const nAir = this.planner.modules.filter((mm) => mm.role === "air").length;
    if (this.anyUnreachable() && airReady && (!hasAir || (this.pickTarget(true) < 0 && nAir < 2))) plan = AIR_PLAN;
    if (plan === ARMY_PLAN && this.pickTarget(true) < 0) {
      // personne à attaquer par la terre : passer au plan suivant
      this.modulePlansUsed++;
      if (!airReady || nAir >= 2) return null;
      plan = AIR_PLAN;
    }
    // aucune usine possible dans le module principal : celui-ci sera un module d'armée, avant toute
    // autre considération (sans usine, pas d'ingénieurs ni d'armée de toute la partie)
    if (this.factoryLost && !this.hasFactorySlot()) plan = this.pickTarget(true) >= 0 || !airReady ? ARMY_PLAN : AIR_PLAN;
    const air = plan === AIR_PLAN;
    const role = air ? "air" : plan === TECH_PLAN ? "tech" : plan.some((t) => t.startsWith("cell:robot")) ? "army" : "tech";
    // près des gisements libres les plus proches, du côté opposé aux adversaires si possible
    const comp = landComponents(this.ctx.map);
    const homeComp = comp[hy * this.ctx.map.w + hx];
    const cands = this.spots
      .filter((s) => s.st === 0 && (s.kind === it.iron_ore || s.kind === it.copper_ore))
      .map((s) => {
        const d = Math.hypot(s.x - hx, s.y - hy);
        const toward = ((s.x - hx) * this.enemyDir[0] + (s.y - hy) * this.enemyDir[1]) / (d || 1);
        // densité de gisements autour
        let dens = 0;
        let hydro = false;
        for (const o of this.spots) {
          if (o === s || o.st !== 0 || Math.abs(o.x - s.x) >= 30 || Math.abs(o.y - s.y) >= 30) continue;
          dens += o.kind === it.iron_ore ? 2 : o.kind === it.copper_ore ? 1 : 0;
          if (o.kind === it.hydrocarbon) hydro = true;
        }
        if (s.kind === it.iron_ore) dens += 2;
        // autre terre (atteinte par les ingénieurs glisseurs) : seulement en dernier recours
        const away = comp[s.y * this.ctx.map.w + s.x] !== homeComp;
        return { s, away, score: d + toward * 25 - dens * 8 - (air && hydro ? 40 : 0) + (away ? 400 : 0) };
      })
      .filter((c) => Math.hypot(c.s.x - hx, c.s.y - hy) < (c.away ? 220 : 120))
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
      // le plan choisi est consommé (les plans forcés aussi, pour ne pas les répéter)
      if (plan === P.planN[this.modulePlansUsed % P.planN.length]) this.modulePlansUsed++;
      m.role = role;
      this.pendingPlan.set(m, [...plan]);
      this.produces.set(m, new Set());
      if (plan === ARMY_PLAN) this.factoryLost = false;
      this.log("module", m.id, m.role, "en", m.cx, m.cy);
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
        const inf = sim.infoBuilding(ref) as { inv: number[]; stash: number[]; queue: [number, number][] } | null;
        if (!inf) continue;
        if (isLab) {
          const t = this.me.research;
          if (!t) continue;
          const tier = data.techs[t].tier;
          for (let k = 0; k < tier; k++) if (inf.inv[k] < 2) D.add(it.pack1 + k);
          if (!b.working) this.waiting.add(m);
        } else if (inf.queue.length) {
          const cost = data.units[inf.queue[0][0]].cost;
          // réserve de l'usine : par objet (stash)
          for (const [itm, n] of cost) if ((inf.stash[itm] ?? 0) < n) D.add(itm);
          if (!b.working) this.waiting.add(m);
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
      for (const m of this.planner.modules) {
        const D = demand.get(m) as Set<number>;
        let grew = true;
        while (grew) {
          grew = false;
          for (const c of this.crafters) {
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
    for (const m of this.planner.modules) {
      const D = demand.get(m) as Set<number>;
      if (this.stock(it.gear) < (m.role === "main" ? 25 : 40)) D.add(it.gear);
      if (this.stock(it.circuit) < (m.role === "main" ? 15 : 40)) D.add(it.circuit);
      if (this.stock(it.steel) < (m.role === "main" ? 0 : 60)) D.add(it.steel);
    }
    // énergie réelle : satisfaction du réseau d'un bâtiment de chaque module
    if (this.thinkN % 30 === 0) {
      for (const m of this.planner.modules) {
        const s = m.slots.find((sl) => this.placementState(sl.places[0]) === 3);
        if (!s) continue;
        const inf = sim.infoBuilding(sim.buildingAt(s.x, s.y)) as { sat: number; net: number } | null;
        if (inf && inf.net > 0 && inf.sat < 900 && !this.projects.some((p) => p.name === "power" + m.id)) this.powerLow.add(m);
      }
    }
    closure();
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
      // module aérien : tout tourne pour les usines (seul l'excès au dépôt arrête un producteur)
      const regulated = (!c.slot.cell || c.slot.busOut === true) && c.module.role !== "air";
      let pause = regulated && !(demand.get(c.module) as Set<number>).has(outIt);
      // demandé mais déjà en excès au dépôt : arrêt temporaire (le surplus passe les consommateurs)
      if (c.module.role === "air" && !c.slot.cell) {
        if (this.stock(outIt) > 400) pause = true;
      } else if (!regulated) {
        // cellule : régulée par ses bras
      } else if ((consumerDemand.get(c.module) as Set<number>).has(outIt)) {
        // un consommateur attend ce produit : pas d'arrêt pour excès au dépôt
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
    let landArmy = 0;
    for (const u of this.ix.unitsBy[this.ctx.slot]) if (this.combatKinds[u.kind] && data.units[u.kind].layer !== 4) landArmy++;
    const weights = this.armyWeights();
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
        if (!b.working && fi.front >= 0 && data.buildings[b.kind].factory !== 2 && this.tick - fi.lastQ > 1800 && this.tick - fi.lastStart > 1800 && this.needsBus(fi.front, fi.slot)) {
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
      if (fk === 1 && fi.module.noLand && !this.underPressure) continue;
      let pick = -1;
      const eng = this.ids.u.eng1;
      if (fk === 1 && engs < engTarget && this.canBuild(eng, avail)) {
        pick = eng;
        engs++;
      } else if (fk === 1 && this.pickTarget(true) < 0 && !this.canBuild(this.ids.u.hover_tank, avail) && ((landArmy > 24 && !this.underPressure) || (landArmy > 50 && !this.baseInvaded()))) {
        // personne n'est joignable par la terre (et pas d'amphibies) : garder les ressources pour l'aviation
        continue;
      } else if (this.stock(this.ids.item.iron_plate) < 40 && !this.underPressure && engs >= 1) {
        // le stock de construction passe d'abord
        continue;
      } else if (this.starvedSince && this.tick - this.starvedSince > 600 && !this.underPressure && engs >= 1) {
        // les constructeurs attendent des ressources depuis 30 s : pause des unités de combat
        if (this.debug && this.thinkN % 30 === 1) this.log("usines en pause : stock de construction insuffisant");
        continue;

      } else {
        // composition de l'armée : type disponible le moins représenté par rapport à son poids
        const counts = new Map<number, number>();
        for (const u of this.ix.unitsBy[this.ctx.slot]) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
        let best = Infinity;
        for (const [key, wgt] of Object.entries(weights)) {
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
      if (pick < 0 && this.debug && this.thinkN % 30 === 1) this.log("usine sans production", b.kind, "disponible :", [...avail].map((i) => this.ctx.data.items[i].key).join(","));
      if (pick >= 0) {
        out.push(factoryQueue(b.ref, pick, 1));
        fi.lastQ = this.tick;
        fi.front = pick;
      }
    }
  }

  /** Le fer manque alors que le cuivre s'accumule : l'économie doit se rééquilibrer. */
  ironStarved(): boolean {
    const it = this.ids.item;
    return this.level !== "facile" && this.stock(it.iron_plate) < 60 && this.stock(it.copper_plate) > 150 && this.tick > 3000;
  }
  /** Ennemis dans la base, plus forts que la défense en place (pas seulement un harcèlement). */
  baseInvaded(): boolean {
    const t = this.army.threat;
    return !!t && this.tick - t.tick < 60 && t.power > this.defensePower(t.x, t.y) * 0.7;
  }

  /**
   * Composition voulue de l'armée : poids de la personnalité, corrigés par les rapports de force
   * (LOUD : la production répond à ce que fait l'adversaire).
   */
  armyWeights(): Record<string, number> {
    const w: Record<string, number> = { ...this.persona.army };
    if (this.level === "facile") return w;
    const r = Math.min(2.5, this.airRatio);
    // antiaérien : chasseurs et antiaérien mobile, d'autant plus que l'aviation ennemie domine
    w.interceptor = (w.interceptor ?? 0) + 0.6 + r * 3;
    w.asf = (w.asf ?? 0) + 0.5 + r * 3;
    if (r > 0.35) w.mobile_aa = (w.mobile_aa ?? 0) + r * 2.5;
    // frappes sur l'économie adverse
    w.bomber = (w.bomber ?? 0) + 1.2;
    // un adversaire hors d'atteinte par la terre : aéroglisseurs amphibies, et l'aviation d'attaque
    // devient la priorité (les chasseurs seulement contre une aviation ennemie)
    if (this.anyUnreachable()) w.hover_tank = (w.hover_tank ?? 0) + (this.pickTarget(true) < 0 ? 8 : 2);
    if (this.pickTarget(true) < 0) {
      w.glider = (w.glider ?? 0) * 2 + 2;
      w.gunship = (w.gunship ?? 0) * 2 + 1;
      w.bomber = (w.bomber ?? 0) * 2;
      if (r < 0.3) w.interceptor = 0.3;
    }
    // adversaire plus fort au sol : plus d'artillerie et de lance-missiles (portée)
    if (this.landRatio > 1.3) {
      w.artillery = (w.artillery ?? 0) + 1;
      w.missile_launcher = (w.missile_launcher ?? 0) + 1;
    }
    return w;
  }

  /** L'unité a-t-elle besoin d'objets du tapis principal autres que les plaques (hors cellule) ? */
  needsBus(kind: number, slot: Slot): boolean {
    const it = this.ids.item;
    const cellItems = new Set<number>([it.iron_plate, it.copper_plate]);
    if (slot.cell) for (const c of this.crafters) if (c.slot.cell && c.slot.side === slot.side && Math.abs(c.slot.u0 - slot.u0) <= 10) cellItems.add(this.ctx.data.recipes[c.recipe].output[0]);
    return this.ctx.data.units[kind].cost.some(([i]) => !cellItems.has(i));
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
      if (!sameCell && ((c.slot.cell && !c.slot.busOut) || c.slot.u0 + 1 >= slot.u0)) continue;
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
    // recherches urgentes selon les rapports de force, puis la liste de la personnalité
    const urgent: string[] = [];
    if (this.level !== "facile") {
      if (this.airRatio > 0.5) urgent.push("aa_turret", "heavy_air", "superiority");
      if (this.anyUnreachable()) urgent.push("electronics", "hydrocarbons", "mobile_artillery", "assault", "heavy_air");
      if (this.landRatio > 1.5) urgent.push("heavy_turret");
    }
    for (const k of [...urgent, ...this.persona.research]) {
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
    const def = this.ctx.data.units[c.kind];
    const [bx, by] = this.baseCenter();
    // repli vers le centre de la base, à l'abri des tourelles, du côté opposé aux adversaires
    const sx = bx - this.enemyDir[0] * 8 * TILE;
    const sy = by - this.enemyDir[1] * 8 * TILE;
    const far = dist2(c.x, c.y, sx, sy) > (8 * TILE) ** 2;
    if (this.level === "facile") {
      if (c.hp < def.hp * 0.35 && this.army.threat && far && this.tick % 100 === 0) out.push(move([c], sx, sy));
      return;
    }
    // LOUD : le commandant n'affronte pas une force qui le dépasse (ses points de vie ne se réparent pas) :
    // il recule à l'opposé, derrière notre armée si elle est assez forte.
    const air = this.enemySum(T.Air, c.x, c.y, 16);
    const enemy = this.enemySum(T.Surface, c.x, c.y, 22) + air;
    const mine = kindPowers(this.ctx.data).units[c.kind].ground * Math.sqrt(c.hp / def.hp);
    if (enemy > 0) this.postDistress(c.x, c.y, enemy, air > enemy * 0.5, true);
    // il défend la base avec les tourelles et l'armée (il est solide et reste le principal bâtisseur
    // au début), mais recule si la défense locale est dépassée ou s'il est sérieusement blessé
    const local = this.friendSum(T.Surface, c.x, c.y, 22); // lui, nos tourelles et nos unités autour
    const danger = enemy > local * 1.1 || (c.hp < def.hp * 0.5 && enemy > mine * 0.3);
    if (danger) this.cmdHoldUntil = this.tick + 150;
    if (this.tick >= this.cmdHoldUntil) return;
    if (this.tick - this.cmdMoved < 40) return;
    let ex = 0;
    let ey = 0;
    let en = 0;
    let ax = 0;
    let ay = 0;
    let apow = 0;
    const kp = kindPowers(this.ctx.data).units;
    unitsNear(this.ix, c.x, c.y, 40 * TILE, (u) => {
      if (u.id === c.id || !this.combatKinds[u.kind]) return;
      const k = kp[u.kind];
      if (u.owner === this.ctx.slot || this.sameTeam(u.owner)) {
        ax += u.x * k.ground;
        ay += u.y * k.ground;
        apow += k.ground;
      } else if (dist2(u.x, u.y, c.x, c.y) < (26 * TILE) ** 2) {
        ex += u.x;
        ey += u.y;
        en++;
      }
    });
    let tx = sx;
    let ty = sy;
    if (en > 0) {
      ex /= en;
      ey /= en;
      const dx = c.x - ex;
      const dy = c.y - ey;
      const dn = Math.hypot(dx, dy) || 1;
      if (apow > enemy * 0.8) {
        // derrière notre armée, à l'opposé de l'ennemi
        tx = ax / apow + (dx / dn) * 8 * TILE;
        ty = ay / apow + (dy / dn) * 8 * TILE;
      } else {
        // fuite à l'opposé de l'ennemi, en se rapprochant du centre de la base
        tx = c.x + (dx / dn) * 16 * TILE * 0.7 + (sx - c.x) * 0.3;
        ty = c.y + (dy / dn) * 16 * TILE * 0.7 + (sy - c.y) * 0.3;
      }
    } else if (!far) return;
    const m = this.ctx.map;
    tx = Math.max(2 * TILE, Math.min((m.w - 3) * TILE, tx));
    ty = Math.max(2 * TILE, Math.min((m.h - 3) * TILE, ty));
    if (c.nOrders === 0 || en > 0) {
      out.push(move([c], tx, ty));
      this.cmdMoved = this.tick;
    }
  }
}
