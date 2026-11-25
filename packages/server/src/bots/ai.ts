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
// ils ont besoin et y reposent leurs produits ; le reste reste dans le dépôt, où les drones des
// constructeurs (commandant, ingénieurs, usines) viennent puiser (il n'y a pas de réserve commune :
// voir Dépôts et drones dans docs/spec/economie.md ; `stock` est le total des dépôts et des soutes).
//
// Ce fichier garde l'état de l'IA (SkirmishAI), ses requêtes de base et la boucle de décision (think). Le
// reste est réparti par thème, en fonctions qui reçoivent l'IA en premier paramètre :
//   strategy.ts   adversaire visé, rapports de force, objectifs d'attaque, appels à l'aide
//   land.ts       terres joignables à pied
//   engineers.ts  chantiers et bâtisseurs
//   builders.ts   liste des builders d'ingénieurs et fabrication des chantiers
//   fuel.ts       combustible des générateurs
//   economy.ts    régulation des recettes, dépôts pleins, générateur principal
//   factories.ts  production des usines
//   research.ts   recherche
//   commander.ts  mise à l'abri du commandant
//   arsenal.ts, navy.ts, landing.ts, army.ts   arsenal, marine, transports, pelotons
import type { Bot, BotContext } from "./types.ts";
import { serialize, deserialize } from "node:v8";
import type { BotView, Cmd, BotUnit, PlayerView } from "@supreme/shared";
import { hasTech, isFauna } from "@supreme/shared";
import { Ids, indexView, TILE, type ViewIndex } from "./util.ts";
import { Planner, type Module, type Placement, type Slot } from "./layout.ts";
import { PERSONAS, type Persona } from "./personas.ts";
import { Army } from "./army.ts";
import { newArsenal, arsenalThink, type ArsenalState } from "./arsenal.ts";
import { newNavy, navyGoal, navyFactories, navyThink, type NavyState } from "./navy.ts";
import { newLanding, landingGoal, landingFactories, landingThink, type LandingState } from "./landing.ts";
import { intelOf, teamBoard, T, type Intel, type TeamBoard } from "./intel.ts";
import { landComponents } from "./land.ts";
import { analyse } from "./strategy.ts";
import { engineers, builderUnits, type Project, type SpotState } from "./engineers.ts";
import { engBuilders } from "./builders.ts";
import { economy, mainGenUpgrade, type Crafter } from "./economy.ts";
import { factories } from "./factories.ts";
import { researchMgr } from "./research.ts";
import { commander } from "./commander.ts";

// déplacés dans leur module, toujours importables d'ici
export { landComponents };
export type { EngBuilder } from "./builders.ts";

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
  /** adversaires (joueurs) : la faune n'en fait pas partie */
  enemyIds: number[] = [];
  /** tout ce qui menace : adversaires et faune (cartes de menace) */
  hostileIds: number[] = [];
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
  /** mines de combustible (extracteur d'hydrocarbure + dépôt) : indices dans `spots` */
  fuelMines: number[] = [];
  /** charge électrique lissée (kW) : dimensionne les mines de combustible */
  loadAvg = 0;
  /** générateurs auxquels aucun dépôt ne peut être collé : pas de nouvel essai avant ce tick */
  noFuelDepot = new Map<number, number>();
  /** tick de la dernière mine de combustible lancée */
  lastFuelMine = -1e9;
  // marine et transports : données simples (sauvegardées telles quelles ; absentes d'une vieille sauvegarde,
  // elles gardent leur valeur de départ)
  arsenal: ArsenalState = newArsenal();
  navy: NavyState = newNavy();
  landing: LandingState = newLanding();
  /** l'arsenal manque de fer (voir arsenalThink) */
  ironForArsenal = false;
  /** générateurs sans combustible (compté seulement quand l'IA a un arsenal) */
  dryGens = 0;
  /** dépôts (cases) bien pourvus en hydrocarbure, à relier aux générateurs à sec */
  fuelDepots: [number, number][] = [];
  /** extracteurs mis en pause par l'IA (voir unjam, arsenal.ts) */
  pausedMines = new Set<number>();

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
    this.combatKinds = ctx.data.units.map((u) => !u.commander && u.buildPower === 0 && u.weapons.length > 0);
    this.engKinds = ctx.data.units.map((u) => !u.commander && u.buildPower > 0);
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
  /** Total d'un objet dans nos dépôts et dans les soutes de nos constructeurs. */
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

  // ---------- Renseignement (cartes de menace) ----------
  enemySum(layer: T, x: number, y: number, rTiles: number): number {
    return this.intel.sum(this.hostileIds, layer, x, y, rTiles);
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

  playerPos(i: number): [number, number] {
    const c = this.unitById(this.view.players[i].commander);
    return c ? [c.x, c.y] : [this.ctx.map.starts[i][0] * TILE + TILE / 2, this.ctx.map.starts[i][1] * TILE + TILE / 2];
  }
  /**
   * Le joueur est-il joignable par la terre depuis notre base ? Son commandant est sur notre terre ou, s'il est sur
   * l'eau (Arche, amphibie), un de ses bâtiments.
   */
  reachable(i: number): boolean {
    const comp = landComponents(this.ctx.map);
    const w = this.ctx.map.w;
    const [hx, hy] = this.home;
    const [x, y] = this.playerPos(i);
    const a = comp[hy * w + hx];
    const b = comp[Math.floor(y / TILE) * w + Math.floor(x / TILE)];
    return a >= 0 && (a === b || (b < 0 && (this.ix.buildingsBy[i] ?? []).some((o) => comp[o.y * w + o.x] === a)));
  }
  anyUnreachable(): boolean {
    for (let i = 0; i < this.view.players.length; i++) {
      if (i === this.ctx.slot || !this.view.players[i].alive || this.sameTeam(i) || isFauna(this.view.players, i)) continue;
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

  placementState(p: Placement): number {
    const ti = this.ctx.sim.tileInfo(p.x, p.y);
    if (ti <= 0) return 0; // vide
    if ((ti & 0xff) === p.kind + 1 && ((ti >> 8) & 0xff) === this.ctx.slot) return (ti >> 20) & 1 ? 3 : 1; // 1 en chantier, 3 fini
    return 2; // occupé par autre chose
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
    this.hostileIds = [];
    this.friendIds = [];
    for (let i = 0; i < view.players.length; i++) {
      const pl = view.players[i];
      if (!pl.alive) continue;
      if (pl.team === this.me.team) this.friendIds.push(i);
      else {
        this.hostileIds.push(i);
        if (!isFauna(view.players, i)) this.enemyIds.push(i);
      }
    }
    if (this.thinkN % 10 === 1 && this.level !== "facile") analyse(this);
    if (this.debug && this.thinkN % 120 === 1) {
      const top = engBuilders(this, builderUnits(this)[0] ?? ({} as BotUnit)).sort((a, b) => b.prio - a.prio).slice(0, 5).map((b) => `${b.name}:${b.prio}`);
      this.log("état", "recherche", this.me.research, "plan", JSON.stringify([...this.pendingPlan.values()]), "chantiers", this.projects.map((p) => `${p.name}[${p.builders.length}]`).join(","), "priorités", top.join(" "), "commandant", ((c) => (c ? `${Math.round(c.x / TILE)},${Math.round(c.y / TILE)} ordres ${c.nOrders} (${c.order})` : "?"))(this.unitById(this.me.commander)), "abri", this.cmdHoldUntil > this.tick);
    }
    if (this.thinkN % 10 === 3) {
      navyGoal(this);
      landingGoal(this);
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
    engineers(this, out);
    lap("ingénieurs");
    if (this.thinkN % 2 === 0) {
      economy(this, out);
      arsenalThink(this, out);
    }
    if (this.thinkN % 2 === 1) {
      factories(this, out);
      navyFactories(this, out);
      landingFactories(this, out);
    }
    lap("économie/usines");
    if (this.thinkN % 4 === 0) researchMgr(this, out);
    if (this.thinkN % 20 === 7) mainGenUpgrade(this, out);
    // niveau normal : tactique deux fois moins réactive que le niveau difficile
    if (this.level !== "normal" || this.thinkN % 2 === 0) {
      this.army.think(this, this.ix, this.tick, out);
      navyThink(this, out);
      landingThink(this, out);
    }
    commander(this, out);
    lap("armée");
    return out;
  }

  setupBase(): void {
    const [sx, sy] = this.home;
    // générateur principal posé au départ : ses cases sont prises et sa zone alimente la base
    let startProd = 0;
    for (const b of this.ix.buildingsBy[this.ctx.slot]) {
      if (b.kind !== this.ids.b.main_generator) continue;
      this.planner.addExisting(b.kind, b.x, b.y);
      startProd += this.ctx.data.buildings[b.kind].powerProd;
    }
    const near = this.spots.filter((s) => Math.abs(s.x - sx) < 50 && Math.abs(s.y - sy) < 50);
    // départ encombré (gisements, générateur principal, relief) : chercher un peu plus loin
    let m: Module | null = null;
    for (const shift of [10, 16, 24]) {
      m = this.planner.findModule(sx, sy, near, [50, 44, 38, 32, 26], shift);
      if (m) break;
    }
    if (m) {
      m.role = "main";
      m.prod += startProd;
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
}
