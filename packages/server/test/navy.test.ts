// Marine et transports des IA : choix du plan d'eau, plan de l'arsenal, missions de la flotte, débarquements,
// reprise d'une sauvegarde. Les vues sont construites à partir d'une vraie partie au tick 0, avec des unités
// ajoutées : aucune simulation n'est jouée (voir tools/bench/naval-check.ts pour une partie entière).
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { Sim, parseBotDump, keyIndex, O, TILE, Layer } from "@supreme/shared";
import type { GameData, BotView, BotUnit, Cmd } from "@supreme/shared";
import type { MapInfo } from "../src/bots/index.ts";
import { SkirmishAI, landComponents } from "../src/bots/ai.ts";
import { indexView } from "../src/bots/util.ts";
import { intelOf, teamBoard } from "../src/bots/intel.ts";
import { watersOf, usefulSea, seaField, navigable, MIN_SEA } from "../src/bots/water.ts";
import { navyGoal, navyThink, station } from "../src/bots/navy.ts";
import { landingGoal, landingThink, landingOwns, chooseLanding, isolated } from "../src/bots/landing.ts";
import { arsenalWanted } from "../src/bots/arsenal.ts";

const wasm = readFileSync(new URL("../../client/public/sim.wasm", import.meta.url));

interface Game {
  sim: Sim;
  data: GameData;
  map: MapInfo;
  view: BotView;
  u: Record<string, number>;
}

async function game(seed: number, water: number, np = 2): Promise<Game> {
  const params = [seed, 512, water, np];
  for (let i = 0; i < np; i++) params.push(i, 1, 100, 100);
  const sim = await Sim.load(wasm);
  sim.init(params);
  const data: GameData = JSON.parse(sim.dataJson());
  const info = sim.mapInfo();
  const map: MapInfo = { w: info[0], h: info[1], waterLevel: info[2], starts: [], spots: [], heights: sim.mapHeights() };
  let o = 4;
  for (let i = 0; i < info[3]; i++, o += 2) map.starts.push([info[o], info[o + 1]]);
  const ns = info[o++];
  for (let i = 0; i < ns; i++, o += 3) map.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
  return { sim, data, map, view: parseBotDump(sim.botDump()), u: keyIndex(data.units) };
}

function mkAI(g: Game, slot: number, personality = "adaptive", level = "normal"): SkirmishAI {
  return new SkirmishAI({ slot, personality, aix: 100, level, sim: g.sim, data: g.data, map: g.map });
}

/** Met l'IA devant une vue, comme au début de think(). */
function face(g: Game, ai: SkirmishAI, tick: number, units: BotUnit[]): void {
  const view: BotView = { ...g.view, tick, units: [...g.view.units, ...units] };
  ai.view = view;
  ai.ix = indexView(view);
  ai.me = view.players[ai.ctx.slot];
  ai.tick = tick;
  ai.unitMap = null;
  ai.intel = intelOf(view, g.data, g.map.w, g.map.h);
  ai.board = teamBoard(g.sim, ai.me.team);
  ai.enemyIds = view.players.map((_, i) => i).filter((i) => i !== ai.ctx.slot && i < g.map.starts.length);
  ai.hostileIds = ai.enemyIds.slice();
  ai.friendIds = [ai.ctx.slot];
  if (ai.planner.modules.length === 0) ai.setupBase();
}

function unit(g: Game, id: number, key: string, owner: number, x: number, y: number, more: Partial<BotUnit> = {}): BotUnit {
  const kind = g.u[key];
  return { id, kind, owner, x: Math.round(x), y: Math.round(y), hp: g.data.units[kind].hp, order: 0, nOrders: 0, carried: false, cargo: 0, ...more };
}

const ids = (c: Cmd): number[] => (c[0] === O.MOVE ? c.slice(5).filter((_, i) => i % 3 === 0) : c[0] === O.LOAD ? c.slice(3) : c[0] === O.UNLOAD ? c.slice(5) : c.slice(4));

let isles: Game; // graine 1 : deux îles, une mer commune
let lake: Game; // graine 7 : même terre, une mer commune
let dry: Game;

beforeAll(async () => {
  isles = await game(1, 1);
  lake = await game(7, 1);
  dry = await game(7, 0);
});

describe("eau utile", () => {
  it("une mer qui borde les deux bases est utile, une carte sans eau n'en a pas", () => {
    for (const g of [isles, lake]) {
      const sea = usefulSea(g.map, 0, [1]);
      expect(sea).toBeGreaterThanOrEqual(0);
      expect(watersOf(g.map).size[sea]).toBeGreaterThan(MIN_SEA);
      expect(usefulSea(g.map, 1, [0])).toBe(sea);
    }
    expect(watersOf(dry.map).size.length).toBe(0);
    expect(usefulSea(dry.map, 0, [1])).toBe(-1);
  });

  it("une mer qui ne mène à personne ne sert pas", () => {
    expect(usefulSea(isles.map, 0, [])).toBe(-1);
  });

  it("le champ de proximité donne une case navigable de cette mer", () => {
    const sea = usefulSea(lake.map, 0, [1]);
    const f = seaField(lake.map, sea);
    const W = watersOf(lake.map);
    const [sx, sy] = lake.map.starts[0];
    const i = f.near[sy * lake.map.w + sx];
    expect(W.comp[i]).toBe(sea);
    expect(navigable(lake.map, i % lake.map.w, (i / lake.map.w) | 0)).toBe(true);
    // à une case près en diagonale, la distance suit celle du départ à la côte
    expect(Math.abs(f.dist[sy * lake.map.w + sx] - W.dist[0][sea])).toBeLessThan(W.dist[0][sea] * 0.5);
  });
});

describe("décision", () => {
  const goals = (g: Game, personality: string, level: string, tick: number, units: BotUnit[] = []): SkirmishAI => {
    const ai = mkAI(g, 0, personality, level);
    face(g, ai, tick, units);
    navyGoal(ai);
    landingGoal(ai);
    return ai;
  };
  it("carte sans eau : ni marine, ni transports, ni arsenal", () => {
    const ai = goals(dry, "adaptive", "difficile", 24000);
    expect(ai.navy.wanted).toBe(false);
    expect(ai.landing.wanted).toBe(false);
    expect(arsenalWanted(ai)).toBe(false);
  });
  it("île : marine et transports ; terre commune : marine selon la personnalité", () => {
    const a = goals(isles, "rush", "normal", 9000);
    expect(isolated(a)).toBe(true);
    expect(a.navy.wanted && a.landing.wanted).toBe(true);
    expect(goals(lake, "adaptive", "normal", 9000).navy.wanted).toBe(true);
    expect(goals(lake, "adaptive", "normal", 9000).landing.wanted).toBe(false);
    expect(goals(lake, "rush", "normal", 9000).navy.wanted).toBe(false);
  });
  it("une flotte ennemie fait réagir même une personnalité peu navale, et une défense forte fait voler", () => {
    const sea = usefulSea(lake.map, 0, [1]);
    const i = seaField(lake.map, sea).near[lake.map.starts[0][1] * lake.map.w + lake.map.starts[0][0]];
    const x = (i % lake.map.w) * TILE;
    const y = ((i / lake.map.w) | 0) * TILE;
    const ai = goals(lake, "rush", "normal", 9000, [unit(lake, 900, "frigate", 1, x, y), unit(lake, 901, "frigate", 1, x, y)]);
    expect(ai.navy.wanted).toBe(true);
    const b = mkAI(lake, 0, "rush");
    face(lake, b, 20000, []);
    b.landTarget = 1;
    b.army.repelled[1] = 4;
    landingGoal(b);
    expect(b.landing.wanted).toBe(true);
  });
  it("niveau facile : rien sur une terre commune, plus tard et moins sur une île", () => {
    expect(goals(lake, "adaptive", "facile", 60000).navy.wanted).toBe(false);
    expect(goals(isles, "adaptive", "facile", 9000).navy.wanted).toBe(false);
    expect(goals(isles, "adaptive", "facile", 30000).landing.wanted).toBe(true);
  });
});

describe("arsenal", () => {
  it("trouve sa place, sans recouvrement, et sa boucle revient au dépôt", () => {
    const ai = mkAI(isles, 0);
    face(isles, ai, 6000, []);
    const [hx, hy] = ai.home;
    const P = ai.planner;
    const plan = P.planArsenal(P.freeGrid(hx, hy, 90), hx, hy, 46, 7, 12, ["A:cable", "A:circuit", "A:gear", "A:arm_part"], ["A:pack2", "lab"], () => 0);
    expect(plan).not.toBeNull();
    if (!plan) return;
    const seen = new Map<number, string>();
    const take = (x: number, y: number, s: number, what: string) => {
      for (let ty = y; ty < y + s; ty++)
        for (let tx = x; tx < x + s; tx++) {
          const i = ty * isles.map.w + tx;
          expect(seen.get(i) ?? "", `${what} sur ${seen.get(i)}`).toBe("");
          seen.set(i, what);
        }
    };
    for (const p of plan.base) take(p.x, p.y, isles.data.buildings[p.kind].w, isles.data.buildings[p.kind].key);
    for (const s of plan.slots) {
      take(s.x, s.y, 2, s.type);
      take(s.ins.x, s.ins.y, 1, "bras");
      take(s.outs.x, s.outs.y, 1, "bras");
    }
    // l'atelier de câbles est collé à celui de circuits
    const cable = plan.slots.find((s) => s.type === "A:cable");
    const circuit = plan.slots.find((s) => s.type === "A:circuit");
    expect(Math.abs((cable?.x ?? 0) - (circuit?.x ?? 9)) + Math.abs((cable?.y ?? 0) - (circuit?.y ?? 9))).toBe(2);
    // suivre le tapis depuis la case où pose le premier bras de sortie du dépôt
    const belts = new Map(plan.base.filter((p) => p.kind === ai.ids.b.belt1).map((p) => [p.y * isles.map.w + p.x, p.dir]));
    const DX = [1, 0, -1, 0];
    const DY = [0, 1, 0, -1];
    const out = plan.base.find((p) => p.tag === "out") as { x: number; y: number; dir: number };
    let x = out.x + DX[out.dir];
    let y = out.y + DY[out.dir];
    let n = 0;
    while (belts.has(y * isles.map.w + x) && n++ < 400) {
      const d = belts.get(y * isles.map.w + x) as number;
      x += DX[d];
      y += DY[d];
    }
    expect(n).toBeGreaterThan(30);
    expect(seen.get(y * isles.map.w + x)).toBe("depot");
  });
});

describe("flotte", () => {
  const fleet = (g: Game, ai: SkirmishAI, n: number, key = "frigate"): BotUnit[] => {
    const [x, y] = station(ai);
    return Array.from({ length: n }, (_, k) => unit(g, 1000 + k, key, 0, x + k * 64, y));
  };
  const ready = (n: number, foes: (ai: SkirmishAI) => BotUnit[] = () => [], tick = 30000): { ai: SkirmishAI; out: Cmd[]; ships: BotUnit[] } => {
    const ai = mkAI(lake, 0);
    face(lake, ai, 9000, []);
    navyGoal(ai);
    const ships = fleet(lake, ai, n);
    face(lake, ai, tick, [...ships, ...foes(ai)]);
    const out: Cmd[] = [];
    navyThink(ai, out);
    return { ai, out, ships };
  };
  it("attaque le commandant ennemi à portée de l'eau quand elle est assez nombreuse", () => {
    // commandant adverse amené au bord de l'eau
    const near = (ai: SkirmishAI): BotUnit[] => {
      const f = seaField(lake.map, ai.navy.sea);
      const [ex, ey] = lake.map.starts[1];
      const i = f.near[ey * lake.map.w + ex];
      const c = lake.view.units.find((u) => u.id === lake.view.players[1].commander) as BotUnit;
      c.x = ((i % lake.map.w) + 2) * TILE;
      c.y = ((i / lake.map.w) | 0) * TILE;
      return [];
    };
    const { ai, out, ships } = ready(8, near);
    const g = ai.navy.fleets.find((f) => f.mission === "attack");
    expect(g?.units.size).toBe(ships.length);
    // au tick suivant, la flotte part vers son poste
    face(lake, ai, 30010, ships);
    navyThink(ai, out);
    const mv = out.filter((c) => c[0] === O.MOVE && (c[1] & 2) !== 0);
    expect(mv.some((c) => ids(c).length === ships.length)).toBe(true);
    const W = watersOf(lake.map);
    const last = mv[mv.length - 1];
    expect(W.comp[Math.floor(last[3] / TILE) * lake.map.w + Math.floor(last[2] / TILE)]).toBe(ai.navy.sea);
  });
  it("défend la côte contre une flotte plus faible, se replie devant une plus forte", () => {
    const foes = (n: number) => (ai: SkirmishAI) => {
      // une case de la même mer, à une quinzaine de cases du poste
      const [x, y] = station(ai);
      const W = watersOf(lake.map);
      for (let k = 0; k < 32; k++) {
        const fx = x + Math.cos((k * Math.PI) / 16) * 15 * TILE;
        const fy = y + Math.sin((k * Math.PI) / 16) * 15 * TILE;
        if (W.comp[Math.floor(fy / TILE) * lake.map.w + Math.floor(fx / TILE)] !== ai.navy.sea) continue;
        return Array.from({ length: n }, (_, j) => unit(lake, 2000 + j, "frigate", 1, fx + j, fy));
      }
      throw new Error("pas de case de mer");
    };
    const a = ready(5, foes(2));
    expect(a.ai.navy.threat).not.toBeNull();
    const toFoe = a.out.find((c) => c[0] === O.MOVE && ids(c).length === 5) as Cmd;
    const [sx, sy] = station(a.ai);
    expect(Math.hypot(toFoe[2] - sx, toFoe[3] - sy)).toBeGreaterThan(8 * TILE);
    // attaque lancée, puis dominée : repli
    const b = ready(5);
    const f = b.ai.navy.fleets[0];
    f.mission = "attack";
    f.launched = 5;
    b.ai.navy.fleets = [f];
    face(lake, b.ai, 30100, [...b.ships, ...foes(14)(b.ai)]);
    navyThink(b.ai, []);
    expect(b.ai.navy.fleets.find((x) => x.units.size > 0)?.mission).toBe("retreat");
  });
  it("une flotte peu nombreuse patrouille", () => {
    const { ai, out } = ready(2);
    expect(ai.navy.fleets.every((f) => f.mission === "form")).toBe(true);
    expect(out.some((c) => c[0] === O.MOVE && ids(c).length === 2)).toBe(true);
  });
  it("les navires ne rejoignent pas les pelotons terrestres", () => {
    const { ai, ships } = ready(3);
    ai.army.think(ai, ai.ix, ai.tick, []);
    expect(ships.some((s) => ai.army.of.has(s.id))).toBe(false);
  });
});

describe("débarquement", () => {
  const T0 = 30000;
  const setup = (): { ai: SkirmishAI; carriers: BotUnit[]; men: BotUnit[] } => {
    const ai = mkAI(isles, 0);
    face(isles, ai, T0 - 1000, []);
    landingGoal(ai);
    expect(ai.landing.wanted).toBe(true);
    const [bx, by] = ai.baseCenter();
    const carriers = [0, 1].map((k) => unit(isles, 500 + k, "transport", 0, bx + k * 4 * TILE, by));
    const [rx, ry] = ai.rallyPoint();
    const men = Array.from({ length: 20 }, (_, k) => unit(isles, 600 + k, "line_robot", 0, rx + (k % 5) * TILE, ry + Math.floor(k / 5) * TILE));
    return { ai, carriers, men };
  };
  const step = (ai: SkirmishAI, tick: number, units: BotUnit[]): Cmd[] => {
    face(isles, ai, tick, units);
    const out: Cmd[] = [];
    ai.army.think(ai, ai.ix, tick, []);
    landingThink(ai, out);
    return out;
  };

  it("embarque, vole vers l'île ennemie, débarque, attaque, et les transports rentrent", () => {
    const { ai, carriers, men } = setup();
    // 1) embarquement : un ordre par transport, 20 passagers retirés des pelotons
    let out = step(ai, T0, [...carriers, ...men]);
    const loads = out.filter((c) => c[0] === O.LOAD);
    expect(loads.length).toBe(2);
    expect(new Set(loads.flatMap(ids)).size).toBe(20);
    expect(men.some((m) => ai.army.of.has(m.id))).toBe(false);
    expect(landingOwns(ai).size).toBe(20);
    // 2) la moitié embarquée : on attend
    const half = men.map((m, k) => ({ ...m, carried: k < 10 }));
    out = step(ai, T0 + 100, [{ ...carriers[0], cargo: 10, nOrders: 0 }, { ...carriers[1], nOrders: 5 }, ...half]);
    expect(ai.landing.op?.phase).toBe("load");
    expect(out.some((c) => c[0] === O.UNLOAD)).toBe(false);
    // 3) tout le monde à bord : départ vers la terre de l'ennemi
    const aboard = men.map((m) => ({ ...m, carried: true }));
    const full = carriers.map((c) => ({ ...c, cargo: 10 }));
    out = step(ai, T0 + 200, [...full, ...aboard]);
    const un = out.filter((c) => c[0] === O.UNLOAD);
    expect(un.length).toBe(2);
    const comp = landComponents(isles.map);
    const at = (c: Cmd) => comp[Math.floor(c[3] / TILE) * isles.map.w + Math.floor(c[2] / TILE)];
    const enemy = comp[isles.map.starts[1][1] * isles.map.w + isles.map.starts[1][0]];
    expect(un.map(at)).toEqual([enemy, enemy]);
    // 4) au sol : les transports rentrent, les troupes attaquent
    const [lx, ly] = [un[0][2], un[0][3]];
    const landed = men.map((m, k) => ({ ...m, x: lx + (k % 5) * TILE, y: ly + Math.floor(k / 5) * TILE }));
    const empty = carriers.map((c) => ({ ...c, x: lx, y: ly }));
    out = step(ai, T0 + 900, [...empty, ...landed]);
    expect(ai.landing.op).toBeNull();
    expect(ai.landing.stats.landed).toBe(20);
    expect(out.some((c) => c[0] === O.MOVE && ids(c).includes(500) && (c[1] & 2) === 0)).toBe(true);
    expect(out.some((c) => (c[0] === O.ATTACK || (c[0] === O.MOVE && (c[1] & 2) !== 0)) && ids(c).some((id) => id >= 600))).toBe(true);
    expect(men.some((m) => ai.army.of.has(m.id))).toBe(false);
  });

  it("transport abattu : l'autre continue ; tous abattus : l'opération s'arrête", () => {
    const { ai, carriers, men } = setup();
    step(ai, T0, [...carriers, ...men]);
    const aboard = men.map((m) => ({ ...m, carried: true }));
    step(ai, T0 + 200, [...carriers.map((c) => ({ ...c, cargo: 10 })), ...aboard]);
    expect(ai.landing.op?.phase).toBe("fly");
    const first = ai.landing.op?.assign.get(500) as number[];
    const rest = aboard.filter((m) => !first.includes(m.id));
    step(ai, T0 + 400, [{ ...carriers[1], cargo: 10, nOrders: 1 }, ...rest]);
    expect(ai.landing.op?.assign.size).toBe(1);
    expect(ai.landing.stats.lost).toBe(1);
    step(ai, T0 + 500, []);
    expect(ai.landing.op).toBeNull();
    expect(landingOwns(ai).size).toBe(0);
  });

  it("ne reste jamais bloqué : embarquement trop long, transport arrêté en route", () => {
    const { ai, carriers, men } = setup();
    step(ai, T0, [...carriers, ...men]);
    // un seul transport chargé au bout du délai : il part, les autres soldats reviennent à l'armée
    const half = men.map((m) => ({ ...m, carried: (ai.landing.op?.assign.get(500) as number[]).includes(m.id) }));
    let out = step(ai, T0 + 1500, [{ ...carriers[0], cargo: 10 }, carriers[1], ...half]);
    expect(ai.landing.op?.phase).toBe("fly");
    expect(landingOwns(ai).size).toBe(10);
    // il s'arrête en chemin avec ses passagers : l'ordre est redonné
    out = step(ai, T0 + 1700, [{ ...carriers[0], cargo: 10, nOrders: 0 }, carriers[1], ...half]);
    expect(out.some((c) => c[0] === O.UNLOAD && ids(c).includes(500))).toBe(true);
    // trop longtemps : demi-tour
    step(ai, T0 + 1500 + 3700, [{ ...carriers[0], cargo: 10, nOrders: 1 }, carriers[1], ...half]);
    expect(ai.landing.op?.phase).toBe("return");
    // un transport hors opération avec des passagers (vieille sauvegarde) les dépose
    ai.landing.op = null;
    out = step(ai, T0 + 9000, [{ ...carriers[0], cargo: 3 }]);
    expect(out.some((c) => c[0] === O.UNLOAD && ids(c).includes(500))).toBe(true);
  });

  it("évite un point trop défendu contre l'aviation", () => {
    const { ai, carriers, men } = setup();
    const [ex, ey] = isles.map.starts[1];
    const aa = Array.from({ length: 12 }, (_, k) => unit(isles, 700 + k, "mobile_aa", 1, (ex + (k % 4) * 3 - 4) * TILE, (ey + Math.floor(k / 4) * 3 - 3) * TILE));
    face(isles, ai, T0, [...carriers, ...men, ...aa]);
    const [bx, by] = ai.baseCenter();
    expect(chooseLanding(ai, 600, 2, bx, by, false)).toBeNull();
    face(isles, ai, T0, [...carriers, ...men]);
    const L = chooseLanding(ai, 600, 2, bx, by, false);
    expect(L?.player).toBe(1);
  });

  it("un groupe sans objectif attend un transport libre, qui vient le reprendre", () => {
    const { ai, carriers, men } = setup();
    // groupe débarqué sur une terre vide : un point de terre qui n'est ni la nôtre ni celle de l'ennemi n'existe
    // pas forcément ; on prend la terre ennemie sans ses bâtiments ni son commandant
    const c = isles.view.units.find((u) => u.id === isles.view.players[1].commander) as BotUnit;
    const comp = landComponents(isles.map);
    const [ex, ey] = isles.map.starts[1];
    const here = comp[ey * isles.map.w + ex];
    ai.landing.groups.push({ id: 9, units: new Set(men.slice(0, 8).map((m) => m.id)), ox: 0, oy: 0, comp: here, tx: 0, ty: 0, lastOrder: -1e9, since: T0 - 3000, idleSince: 0 });
    const away = men.slice(0, 8).map((m, k) => ({ ...m, x: (ex + k) * TILE, y: ey * TILE }));
    const saved = [isles.view.buildings, c.x, c.y] as const;
    isles.view.buildings = [];
    // commandant ennemi en mer : il n'est sur aucune terre
    const i = seaField(isles.map, usefulSea(isles.map, 0, [1])).near[ey * isles.map.w + ex];
    [c.x, c.y] = [(i % isles.map.w) * TILE, ((i / isles.map.w) | 0) * TILE];
    step(ai, T0, [...carriers, ...away]);
    expect(ai.landing.groups[0].idleSince).toBe(T0);
    const out = step(ai, T0 + 1000, [...carriers, ...away]);
    const loads = out.filter((x) => x[0] === O.LOAD);
    expect(new Set(loads.flatMap(ids)).size).toBe(8);
    expect(ai.landing.op?.from).toBe(9);
    [isles.view.buildings, c.x, c.y] = saved;
  });
});

describe("sauvegarde", () => {
  it("garde flotte, débarquement et arsenal en cours", () => {
    const ai = mkAI(isles, 0);
    face(isles, ai, 30000, []);
    navyGoal(ai);
    landingGoal(ai);
    ai.landing.op = { id: 3, phase: "fly", assign: new Map([[500, [600, 601]]]), carriers0: 1, since: 29000, lastOrder: 29000, lx: 1, ly: 2, ox: 3, oy: 4, comp: 1, player: 1, from: 0 };
    ai.navy.fleets.push({ id: 1, units: new Set([7, 8]), mission: "attack", ox: 1, oy: 1, sx: 1, sy: 1, tx: 0, ty: 0, lastOrder: 0, since: 0, launched: 2, mx: 0, my: 0, movedAt: 0 });
    const P = ai.planner;
    ai.arsenal.plan = P.planArsenal(P.freeGrid(...ai.home, 90), ...ai.home, 46, 7, 12, ["A:cable", "A:circuit"], ["lab", "lab"], () => 0);
    const b = mkAI(isles, 0);
    b.load(ai.save());
    expect(b.landing).toEqual(ai.landing);
    expect(b.navy).toEqual(ai.navy);
    expect(b.arsenal).toEqual(ai.arsenal);
    expect(b.landing.op?.assign.get(500)).toEqual([600, 601]);
  });
  it("reprend une sauvegarde d'avant la marine : valeurs de départ, et l'IA décide normalement", () => {
    const ai = mkAI(isles, 0);
    face(isles, ai, 6000, []);
    const old = ai as unknown as Record<string, unknown>;
    for (const k of ["navy", "landing", "arsenal", "pausedMines", "dryGens", "fuelDepots", "ironForArsenal"]) delete old[k];
    const state = ai.save();
    const b = mkAI(isles, 0);
    b.load(state);
    expect(b.navy.sea).toBe(-1);
    expect(b.landing.op).toBeNull();
    const view: BotView = { ...isles.view, tick: 6010 };
    expect(() => b.think(view)).not.toThrow();
    for (let k = 1; k < 12; k++) b.think({ ...view, tick: 6010 + k * 10 });
    expect(b.navy.wanted).toBe(true);
    expect(b.landing.wanted).toBe(true);
  });
});

describe("données", () => {
  it("les clés d'unités et de bâtiments utilisées existent", () => {
    for (const k of ["frigate", "submarine", "destroyer", "missile_cruiser", "carrier", "railgun_ship", "transport", "heavy_transport"]) expect(isles.u[k], k).toBeDefined();
    expect(isles.data.units[isles.u.transport].layer).toBe(Layer.Air);
    const b = keyIndex(isles.data.buildings);
    expect(isles.data.buildings[b.naval_factory].water).toBe(true);
    expect(b.logistic_relay).toBeDefined();
  });
});
