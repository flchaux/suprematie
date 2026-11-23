// Combustible des générateurs : dépôts collés aux générateurs et mines de combustible (builders et chantiers).
import type { BotBuilding } from "@supreme/shared";
import { landComponents } from "./land.ts";
import { newProject, type Project, type SpotState } from "./engineers.ts";
import type { EngBuilder } from "./builders.ts";
import type { SkirmishAI } from "./ai.ts";

// ---------- Combustible ----------
// Les générateurs brûlent de l'hydrocarbure : sans combustible, ils ne produisent rien. Chaque
// générateur a un dépôt collé ; des mines de combustible (extracteur d'hydrocarbure, qui tourne sans
// électricité, et dépôt collé) remplissent leur dépôt, où le drone de chaque générateur (30 cases) vient
// chercher son combustible.
// Un extracteur de base donne 2 hydrocarbures en 3 s, soit environ 1 000 kW.

/** La réserve d'hydrocarbure est restée presque vide ces 30 dernières secondes. */
export function fuelShort(ai: SkirmishAI): boolean {
  const hc = ai.ids.item.hydrocarbon;
  if (ai.tick < 2400 || ai.stock(hc) >= 6) return false;
  return ai.stockHist.every((h) => h[hc] < 6);
}

/** Mines de combustible en place ou en chantier (une mine détruite libère son gisement). */
export function fuelMineCount(ai: SkirmishAI): number {
  ai.fuelMines = ai.fuelMines.filter((i) => {
    const s = ai.spots[i];
    if (ai.projects.some((p) => p.spot === s)) return true;
    const st = ai.placementState({ kind: ai.ids.b.extractor, x: s.x, y: s.y, dir: 0 });
    if (st === 1 || st === 3) return true;
    if (s.st === 1) s.st = 0;
    return false;
  });
  return ai.fuelMines.length;
}

export function fuelBuilders(ai: SkirmishAI, L: EngBuilder[]): void {
  const me = ai.ctx.slot;
  const data = ai.ctx.data;
  const dep = ai.ids.b.depot;
  // générateurs sans dépôt collé (construit ou prévu) : le générateur principal d'abord
  const depots: [number, number][] = [];
  for (const b of ai.ix.buildingsBy[me]) if (b.kind === dep) depots.push([b.x, b.y]);
  for (const p of ai.projects) p.places.forEach((pl, i) => {
    if (pl.kind === dep && p.st[i] === 0) depots.push([pl.x, pl.y]);
  });
  const glued = (gx: number, gy: number, s: number) =>
    depots.some(([x, y]) => ((x + 2 === gx || x === gx + s) && y < gy + s && y + 2 > gy) || ((y + 2 === gy || y === gy + s) && x < gx + s && x + 2 > gx));
  let lonely: BotBuilding | null = null;
  for (const b of ai.ix.buildingsBy[me]) {
    const d = data.buildings[b.kind];
    if (d.powerProd <= 0 || (ai.noFuelDepot.get(b.ref) ?? 0) > ai.tick || glued(b.x, b.y, d.w)) continue;
    if (!lonely || b.kind === ai.ids.b.main_generator) lonely = b;
  }
  if (lonely) {
    const g = lonely;
    L.push({
      name: "fueldepot",
      prio: g.kind === ai.ids.b.main_generator ? 994 : 940,
      est: [8],
      make: () => {
        const s = data.buildings[g.kind].w;
        const pos = ai.planner.depotSpotNear(g.x, g.y, s, true);
        if (!pos) {
          ai.noFuelDepot.set(g.ref, ai.tick + 3000);
          return null;
        }
        return newProject(ai, "fueldepot", [ai.planner.takeFuelDepot(pos[0], pos[1], g.x, g.y, s)]);
      },
    });
  }
  // mines de combustible : autant que la charge le demande, une de plus si la réserve reste vide
  const n = fuelMineCount(ai);
  let want = 1 + Math.floor(ai.loadAvg / 900);
  // réserve vide : une mine de plus, le temps que la précédente se fasse sentir
  const short = fuelShort(ai) && ai.tick - ai.lastFuelMine > 2400;
  if (short) want = Math.max(want, n + 1);
  if (n >= Math.min(want, 10) || (n > 0 && ai.stock(ai.ids.item.hydrocarbon) > 150 && ai.dryGens < 2)) return;
  L.push({ name: "fuel", prio: n === 0 ? 995 : short ? 950 : 770, remote: n > 0, est: [18, 5], make: () => makeFuelMine(ai, n) });
}

export function makeFuelMine(ai: SkirmishAI, n: number): Project | null {
  const [hx, hy] = ai.home;
  const w = ai.ctx.map.w;
  const comp = landComponents(ai.ctx.map);
  const home = comp[hy * w + hx];
  const maxD = n === 0 ? 45 : 120;
  const cand = ai.spots
    .map((s, i) => ({ s, i, d: Math.hypot(s.x - hx, s.y - hy) }))
    .filter((c) => c.s.kind === ai.ids.item.hydrocarbon && c.s.st === 0 && c.s.next <= ai.tick && c.d < maxD && comp[c.s.y * w + c.s.x] === home)
    .sort((a, b) => a.d - b.d);
  for (const { s, i, d } of cand.slice(0, 3)) {
    const places = ai.planner.planFuelMine(s.x, s.y);
    if (!places) {
      ai.log("échec de la mine de combustible en", s.x, s.y, ":", ai.planner.lastFail);
      s.tries++;
      s.next = ai.tick + 2400;
      if (s.tries > 3) s.st = 2;
      continue;
    }
    s.st = 1;
    ai.fuelMines.push(i);
    ai.lastFuelMine = ai.tick;
    const p = newProject(ai, "fuel", places, { spot: s, remote: d > 45, critical: true });
    // pas un extracteur de module (voir finishProject)
    (s as SpotState & { key?: number }).key = -1;
    return p;
  }
  return null;
}
