// Gestionnaire des ingénieurs : chantiers (Project) confiés aux bâtisseurs (commandant, ingénieurs), suivi
// de leur avancement, coûts et réserves, choix du prochain chantier parmi les builders (builders.ts),
// recyclage des épaves et récolte du commandant quand il n'y a rien à construire.
import type { BotUnit, Cmd } from "@supreme/shared";
import { build, move, target, harvest, O, smeltRecipe } from "@supreme/shared";
import { TILE, dist2 } from "./util.ts";
import type { Module, Placement, Slot, CellSlot } from "./layout.ts";
import { engBuilders } from "./builders.ts";
import type { SkirmishAI } from "./ai.ts";

export interface Project {
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

/** code de l'ordre de récolte du commandant (Order::Harvest) dans BotUnit.order */
const ORDER_HARVEST = 16;

export interface SpotState {
  kind: number;
  x: number;
  y: number;
  st: number; // 0 libre, 1 utilisé, 2 impossible
  tries: number;
  next: number; // tick avant nouvel essai
}

const NI = 27;

// ---------- Ingénieurs ----------
export function builderUnits(ai: SkirmishAI): BotUnit[] {
  const l: BotUnit[] = [];
  for (const u of ai.ix.unitsBy[ai.ctx.slot]) {
    if (u.kind === ai.ids.u.commander || ai.engKinds[u.kind]) l.push(u);
  }
  return l;
}

export function engineers(ai: SkirmishAI, out: Cmd[]): void {
  const builders = builderUnits(ai);
  const alive = new Set(builders.map((u) => u.id));
  // suivi des projets
  for (const p of ai.projects) {
    p.builders = p.builders.filter((id) => alive.has(id));
    checkProject(ai, p);
  }
  for (const p of ai.projects) {
    if (isFinished(ai, p)) {
      for (const id of p.builders) ai.busy.delete(id);
      finishProject(ai, p);
    }
  }
  ai.projects = ai.projects.filter((p) => !isFinished(ai, p));
  for (const id of [...ai.busy.keys()]) if (!alive.has(id) || !ai.projects.includes(ai.busy.get(id) as Project)) ai.busy.delete(id);
  // ordres
  let started = 0;
  const cmdId = ai.me.commander;
  for (const u of builders) {
    // commandant à l'abri : il garde son chantier mais n'y retourne qu'une fois le danger passé
    if (u.id === cmdId && ai.tick < ai.cmdHoldUntil) continue;
    const p = ai.busy.get(u.id);
    if (p) {
      if (u.nOrders === 0 && ai.tick - p.lastIssue > 25) issue(ai, p, u, out);
      continue;
    }
    if (ai.reclaiming.has(u.id)) {
      if (u.nOrders > 0) continue;
      ai.reclaiming.delete(u.id);
    }
    if (u.nOrders > 0 && u.id !== cmdId) continue;
    // commandant : un déplacement ou une récolte (ordre sans fin) n'empêche pas de lui confier un chantier
    if (u.nOrders > 0 && u.order !== 1 && u.order !== 2 && u.order !== ORDER_HARVEST) continue;
    // aider un grand projet
    const help = ai.projects.find((q) => q.builders.length < 3 && remaining(ai, q) >= 8 && (!q.remote || u.id !== cmdId));
    if (help) {
      help.builders.push(u.id);
      ai.busy.set(u.id, help);
      issue(ai, help, u, out);
      continue;
    }
    if (started < 1) {
      const p2 = startProject(ai, u);
      if (p2) {
        started++;
        p2.builders.push(u.id);
        ai.busy.set(u.id, p2);
        issue(ai, p2, u, out);
        continue;
      }
    }
    // aider n'importe quel projet en cours
    const any = ai.projects.find((q) => q.builders.length < 2 && remaining(ai, q) >= 2 && (!q.remote || u.id !== cmdId));
    if (any && u.id !== cmdId) {
      any.builders.push(u.id);
      ai.busy.set(u.id, any);
      issue(ai, any, u, out);
      continue;
    }
    reclaim(ai, u, out);
  }
}

export function remaining(ai: SkirmishAI, p: Project): number {
  let n = 0;
  for (const s of p.st) if (s === 0) n++;
  return n;
}
export function isFinished(ai: SkirmishAI, p: Project): boolean {
  return p.st.every((s) => s !== 0) || (p.critical && p.st[0] === 2);
}

export function checkProject(ai: SkirmishAI, p: Project): void {
  let changed = false;
  for (let i = 0; i < p.places.length; i++) {
    if (p.st[i] !== 0) continue;
    const pl = p.places[i];
    const s = ai.placementState(pl);
    if (s === 3) {
      p.st[i] = 1;
      changed = true;
      p.doneCount++;
    } else if (s === 2) {
      p.st[i] = 2;
      changed = true;
    } else if (s === 0 && ai.tick - p.started > 60 && !ai.ctx.sim.canPlace(ai.ctx.slot, pl.kind, pl.x, pl.y, pl.dir)) {
      // la technologie peut manquer (pas un échec définitif) : seulement si la case est bloquée
      if (ai.has(ai.ctx.data.buildings[pl.kind].tech)) {
        p.st[i] = 2;
        changed = true;
      }
    }
  }
  if (changed) p.lastProgress = ai.tick;
  // bâtisseur encore en route vers un chantier lointain (long détour autour d'un lac, d'une falaise) :
  // le trajet ne compte pas comme une absence de progrès
  const next = p.places.find((_, i) => p.st[i] === 0);
  if (next && p.builders.some((id) => {
    const u = ai.unitById(id);
    return !!u && u.nOrders > 0 && dist2(u.x, u.y, next.x * TILE, next.y * TILE) > (20 * TILE) ** 2;
  })) p.lastProgress = Math.max(p.lastProgress, ai.tick - 3000);
  // projet bloqué trop longtemps (stock vide ou chantier inaccessible)
  if (ai.tick - p.lastProgress > 6000 && p.builders.length > 0) {
    for (let i = 0; i < p.st.length; i++) if (p.st[i] === 0) p.st[i] = 2;
  }
}

export function finishProject(ai: SkirmishAI, p: Project): void {
  let failed = 0;
  const aborted = p.critical && p.st[0] === 2;
  for (let i = 0; i < p.places.length; i++) {
    if (p.st[i] === 2 || (aborted && p.st[i] === 0)) {
      failed++;
      const s = ai.placementState(p.places[i]);
      if (s === 0 || s === 2) ai.planner.release(p.places[i]);
    }
  }
  ai.log("fin", p.name, p.slot?.type ?? "", p.st.join(""), "durée", ai.tick - p.started);
  if (failed) ai.stats.projectsFailed++;
  else ai.stats.projectsDone++;
  if (p.spot) {
    if (p.st[0] === 2) {
      p.spot.st = 0;
      p.spot.tries++;
      p.spot.next = ai.tick + 3000;
      if (p.spot.tries > 2) p.spot.st = 2;
      const key = (p.spot as SpotState & { key?: number }).key ?? p.spot.kind;
      ai.extCount.set(key, (ai.extCount.get(key) ?? 1) - 1);
    }
  }
  if (p.slot && p.st[0] === 2) {
    // emplacement perdu : remettre l'entrée dans le plan du module
    const pend = p.module ? ai.pendingPlan.get(p.module) : null;
    const lost = p.cell ? p.cell.slots : [p.slot];
    if (pend) pend.unshift(p.cell ? "cell:" + p.cell.cell.name : p.slot.type);
    for (const sl of lost) {
      const k = p.module?.slots.indexOf(sl) ?? -1;
      if (k >= 0) p.module?.slots.splice(k, 1);
    }
    ai.crafters = ai.crafters.filter((c) => !lost.includes(c.slot));
  }
  if (p.name === "bus" && p.module) {
    (p.module as Module & { busDone?: boolean }).busDone = true;
  }
}

/** Envoie au bâtisseur les placements restants de sa part du projet. */
export function issue(ai: SkirmishAI, p: Project, u: BotUnit, out: Cmd[]): void {
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
  p.lastIssue = ai.tick;
}

/** Coût total d'une liste de placements. */
export function costOf(ai: SkirmishAI, places: Placement[]): number[] {
  const c = new Array(NI).fill(0);
  for (const p of places) for (const [it, n] of ai.ctx.data.buildings[p.kind].cost) c[it] += n;
  return c;
}
export function reserved(ai: SkirmishAI): number[] {
  const c = new Array(NI).fill(0);
  for (const p of ai.projects) {
    for (let i = 0; i < p.places.length; i++) {
      if (p.st[i] !== 0) continue;
      for (const [it, n] of ai.ctx.data.buildings[p.places[i].kind].cost) c[it] += n;
    }
  }
  return c;
}
export function affordable(ai: SkirmishAI, cost: number[], res: number[]): boolean {
  for (let i = 0; i < NI; i++) if (cost[i] > 0 && ai.stock(i) - res[i] < cost[i]) return false;
  return true;
}
export function estAffordable(ai: SkirmishAI, est: number[], res: number[]): boolean {
  const it = ai.ids.item;
  const keys = [it.iron_plate, it.copper_plate, it.steel, it.gear, it.circuit];
  for (let k = 0; k < keys.length; k++) if ((est[k] ?? 0) > 0 && ai.stock(keys[k]) - res[keys[k]] < est[k]) return false;
  return true;
}

export function reserveEst(ai: SkirmishAI, est: number[], res: number[]): void {
  const it = ai.ids.item;
  const keys = [it.iron_plate, it.copper_plate, it.steel, it.gear, it.circuit];
  for (let k = 0; k < keys.length; k++) res[keys[k]] += est[k] ?? 0;
}

export function newProject(ai: SkirmishAI, name: string, places: Placement[], extra: Partial<Project> = {}): Project {
  return {
    id: ai.nextProject++,
    name,
    places,
    st: places.map(() => 0),
    builders: [],
    lastIssue: -1e9,
    started: ai.tick,
    remote: false,
    critical: false,
    module: null,
    slot: null,
    spot: null,
    cost: costOf(ai, places),
    lastProgress: ai.tick,
    doneCount: 0,
    ...extra,
  };
}

/**
 * Tapis principal d'un module et ses relais : une file de tapis s'arrête si une de ses cases est hors
 * zone électrique (un générateur posé pour un module lointain compte dans sa production).
 */
export function busProject(ai: SkirmishAI, m: Module, remote: boolean): Project {
  const places = ai.planner.busPlaces(m);
  for (const pl of places) m.prod += ai.ctx.data.buildings[pl.kind].powerProd;
  return newProject(ai, "bus", places, { module: m, remote });
}

export function startProject(ai: SkirmishAI, u: BotUnit): Project | null {
  const list = engBuilders(ai, u);
  list.sort((a, b) => b.prio - a.prio);
  const res = reserved(ai);
  const isCmd = u.id === ai.me.commander;
  // une seule tâche importante épargne à la fois (des réserves cumulées bloquaient tout le reste)
  let saving = false;
  for (const b of list) {
    if (b.prio <= 0) break;
    if (b.remote && isCmd && engineerCount(ai) > 0) continue;
    if (ai.projects.some((p) => p.name === b.name)) continue;
    if (!estAffordable(ai, b.est, res)) {
      // épargner pour les tâches importantes
      if (b.prio >= 780 && !saving) {
        reserveEst(ai, b.est, res);
        saving = true;
      }
      continue;
    }
    if ((ai.failUntil.get(b.name) ?? 0) > ai.tick) continue;
    const p = b.make();
    if (!p) {
      // échec de planification : ne pas recommencer à chaque décision
      ai.failUntil.set(b.name, ai.tick + (b.name === "module" ? 1200 : 300));
      // étape d'ouverture impossible (plus de gisement à portée…) : passer à la suivante
      if (b.prio === 990) ai.openingIdx++;
      continue;
    }
    ai.projects.push(p);
    ai.starvedSince = 0;
    if (b.prio === 990) ai.openingIdx++;
    ai.log("début", p.name, p.slot?.type ?? "", p.places.length, "placements");
    return p;
  }
  // constructeur sans chantier faute de ressources : les usines laisseront remonter le stock
  if (list.some((b) => b.prio > 0 && !ai.projects.some((p) => p.name === b.name) && !estAffordable(ai, b.est, reserved(ai))) && ai.projects.length === 0 && !ai.starvedSince) ai.starvedSince = ai.tick;
  if (ai.debug && ai.thinkN % 60 === 0) {
    const why = list.filter((b) => b.prio > 0).slice(0, 5).map((b) => {
      if (ai.projects.some((p) => p.name === b.name)) return `${b.name}:en cours`;
      if (b.remote && isCmd && engineerCount(ai) > 0) return `${b.name}:distant`;
      if (!estAffordable(ai, b.est, res)) return `${b.name}:coût ${b.est.join("/")}`;
      if ((ai.failUntil.get(b.name) ?? 0) > ai.tick) return `${b.name}:échec récent`;
      return `${b.name}:?`;
    });
    ai.log("rien à lancer", why.join(" "), "réservé", res.slice(0, 5).join("/"), "stock fer", ai.stock(ai.ids.item.iron_plate), "cuivre", ai.stock(ai.ids.item.copper_plate), "engr", ai.stock(ai.ids.item.gear), "circ", ai.stock(ai.ids.item.circuit));
  }
  return null;
}

export function engineerCount(ai: SkirmishAI): number {
  let n = 0;
  for (const u of ai.ix.unitsBy[ai.ctx.slot]) if (ai.engKinds[u.kind]) n++;
  return n;
}

export function reclaim(ai: SkirmishAI, u: BotUnit, out: Cmd[]): void {
  if (ai.tick % 40 !== (u.id % 4) * 10) return;
  const [bx, by] = ai.baseCenter();
  const maxR = (u.id === ai.me.commander ? 30 : 60) * TILE;
  let best = null;
  let bd = Infinity;
  const taken = new Set(ai.reclaiming.values());
  for (const w of ai.view.wrecks) {
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
    ai.reclaiming.set(u.id, best.ref);
    return;
  }
  // commandant sans travail : récolter un gisement libre près de la base (fonderie intégrée)
  if (u.id === ai.me.commander && u.nOrders === 0 && harvestIdle(ai, u, out)) return;
  // rester près de la base
  if (u.nOrders === 0 && dist2(u.x, u.y, bx, by) > (40 * TILE) ** 2) out.push(move([u], bx, by));
}

/**
 * Commandant inoccupé : récolte le gisement libre (ni extracteur, ni projet) le plus proche, à moins de
 * 30 cases de la base, dont le produit fondu manque le plus au stock. Faux s'il n'y en a pas.
 */
export function harvestIdle(ai: SkirmishAI, u: BotUnit, out: Cmd[]): boolean {
  const [bx, by] = ai.baseCenter();
  let best: SpotState | null = null;
  let bs = Infinity;
  for (const s of ai.spots) {
    if (s.st !== 0 || ai.projects.some((p) => p.spot === s)) continue;
    const r = smeltRecipe(ai.ctx.data, s.kind);
    if (r < 0 || !ai.has(ai.ctx.data.recipes[r].tech)) continue;
    if (dist2(s.x * TILE, s.y * TILE, bx, by) > (30 * TILE) ** 2) continue;
    if (ai.ctx.sim.tileInfo(s.x, s.y) > 0) continue;
    // le produit le plus rare d'abord, puis le plus proche
    const score = ai.stock(ai.ctx.data.recipes[r].output[0]) * 4 * TILE + Math.sqrt(dist2(s.x * TILE, s.y * TILE, u.x, u.y));
    if (score < bs) {
      bs = score;
      best = s;
    }
  }
  if (!best) return false;
  out.push(harvest([u.id], best.x, best.y));
  return true;
}
