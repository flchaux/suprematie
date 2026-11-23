// Stratégie militaire de l'IA : choix de l'adversaire, rapports de force, objectifs d'attaque sur les cartes
// de menace (intel.ts) et appels à l'aide entre alliés. Les pelotons (army.ts), les usines et les builders
// s'en servent pour savoir qui attaquer et où.
import type { BotBuilding } from "@supreme/shared";
import { isFauna } from "@supreme/shared";
import { TILE, dist2 } from "./util.ts";
import { T } from "./intel.ts";
import { landComponents } from "./land.ts";
import type { SkirmishAI } from "./ai.ts";

/** Adversaire à attaquer : le plus proche encore en vie. */
/**
 * Adversaire à attaquer : le plus proche encore en vie (pondéré par la taille de son armée).
 * Pour une armée terrestre, seulement les adversaires joignables par la terre. Cible collante.
 */
export function pickTarget(ai: SkirmishAI, land: boolean): number {
  const valid = (t: number) => t >= 0 && ai.view.players[t]?.alive && !ai.sameTeam(t) && (!land || ai.reachable(t));
  const prev = land ? ai.landTarget : ai.airTarget;
  const repelled = (t: number) => ai.army.repelled[t] ?? 0;
  // deux assauts repoussés de plus depuis le choix de cette cible : en changer
  if (land && valid(prev) && repelled(prev) >= ai.landTargetRepelled + 2 && ai.enemyIds.length > 1) {
    ai.landTarget = -1;
    if (ai.board.target === prev) ai.board.target = -1;
    ai.log("cible", prev, "trop défendue : changement d'adversaire");
  } else if (valid(prev)) {
    if (land && !valid(ai.board.target)) ai.board.target = prev;
    return prev;
  }
  const [bx, by] = ai.baseCenter();
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < ai.view.players.length; i++) {
    const p = ai.view.players[i];
    if (i === ai.ctx.slot || !p.alive || p.team === ai.me.team || isFauna(ai.view.players, i)) continue;
    if (land && !ai.reachable(i)) continue;
    const [x, y] = ai.playerPos(i);
    // plus proche, et plus faible (puissance terrestre et défenses d'après le renseignement)
    const strength = ai.intel.land[i] / Math.max(1, ai.intel.land[ai.ctx.slot]);
    let d = Math.sqrt(dist2(bx, by, x, y)) * (1 + Math.min(3, strength) * 0.4);
    // l'aviation va de préférence là où l'armée de terre ne peut pas aller
    if (!land && !ai.reachable(i)) d *= 0.5;
    // adversaires qui nous ont déjà repoussés : en dernier
    if (land) d *= 1 + repelled(i) * 0.7;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  // cible commune de l'équipe : on rejoint l'adversaire choisi par un allié s'il n'est pas beaucoup
  // plus loin que le nôtre (sinon chacun garde son adversaire naturel, pour ne pas laisser l'autre libre)
  const shared = ai.board.target;
  if (land && ai.level !== "facile" && best >= 0 && shared !== best && valid(shared)) {
    const [sx, sy] = ai.playerPos(shared);
    const [px, py] = ai.playerPos(best);
    if (Math.sqrt(dist2(bx, by, sx, sy)) < Math.sqrt(dist2(bx, by, px, py)) * 1.3) best = shared;
  }
  if (land) {
    ai.landTarget = best;
    ai.landTargetRepelled = best >= 0 ? repelled(best) : 0;
    if (best >= 0 && !valid(shared)) {
      ai.board.target = best;
      ai.board.targetSince = ai.tick;
    }
  } else ai.airTarget = best;
  return best;
}

/** Rapports de force (LOUD : ArmyAnalysis), recalculés régulièrement. */
export function analyse(ai: SkirmishAI): void {
  const I = ai.intel;
  const me = ai.ctx.slot;
  let airMax = 0;
  let airSum = 0;
  let landMax = 0;
  for (const e of ai.enemyIds) {
    airMax = Math.max(airMax, I.air[e]);
    airSum += I.air[e];
    landMax = Math.max(landMax, I.land[e]);
  }
  // l'adversaire le plus aérien compte plein, les autres en partie
  const enemyAir = airMax + (airSum - airMax) * 0.3;
  const myAA = I.airToAir[me] + I.aaUnits[me] + I.aaTurrets[me] * 0.5;
  ai.airRatio = enemyAir / Math.max(150, myAA);
  ai.landRatio = landMax / Math.max(100, I.land[me]);
}

/**
 * Objectif d'attaque chez un adversaire (LOUD : plan d'attaque sur les cartes de menace).
 * mode 1 : assaut terrestre (valeur / défense au sol), 2 : frappe aérienne (valeur / antiaérien),
 * 3 : raid (installations isolées, la défense compte beaucoup).
 */
export function objective(ai: SkirmishAI, p: number, power: number, landOnly: boolean, mode: number): [number, number] | null {
  const I = ai.intel;
  const seen = new Set<number>();
  const comp = landOnly ? landComponents(ai.ctx.map) : null;
  const [hx, hy] = ai.home;
  const home = comp ? comp[hy * ai.ctx.map.w + hx] : -1;
  const [bx, by] = ai.baseCenter();
  let best: [number, number] | null = null;
  let bs = 0;
  for (const b of ai.ix.buildingsBy[p]) {
    const x = b.x * TILE + TILE;
    const y = b.y * TILE + TILE;
    const c = I.cell(x, y);
    if (seen.has(c) || I.layers[p][T.Eco][c] < 1) continue;
    seen.add(c);
    if (comp && comp[b.y * ai.ctx.map.w + b.x] !== home && comp[Math.min(ai.ctx.map.h - 1, b.y + 2) * ai.ctx.map.w + b.x] !== home) continue;
    const value = I.sum([p], T.Eco, x, y, 16);
    const threat = mode === 2 ? ai.enemySum(T.AntiAir, x, y, 14) : ai.enemySum(T.Surface, x, y, 22);
    const dist = Math.sqrt(dist2(x, y, bx, by)) / TILE;
    let score = Math.pow(value, 0.6) / (1 + (threat / Math.max(1, power)) * (mode === 3 ? 5 : 2)) / (1 + dist / 250);
    if (mode !== 2 && threat > power * 1.3) score *= 0.15;
    if (score > bs) {
      bs = score;
      best = [x, y];
    }
  }
  // le commandant adverse : sa destruction élimine le joueur (assaut seulement)
  const c = mode === 1 ? ai.unitById(ai.view.players[p].commander) : undefined;
  if (c && (!comp || comp[Math.floor(c.y / TILE) * ai.ctx.map.w + Math.floor(c.x / TILE)] === home)) {
    const threat = ai.enemySum(T.Surface, c.x, c.y, 22);
    const dist = Math.sqrt(dist2(c.x, c.y, bx, by)) / TILE;
    let score = Math.pow(2500, 0.6) / (1 + (threat / Math.max(1, power)) * 2) / (1 + dist / 250);
    if (threat > power * 1.3) score *= 0.15;
    if (score > bs) best = [c.x, c.y];
  }
  return best;
}

/** Publie un appel à l'aide pour l'équipe (menace sur une de nos installations). */
export function postDistress(ai: SkirmishAI, x: number, y: number, power: number, air: boolean, vip = false): void {
  const D = ai.board.distress;
  const me = ai.ctx.slot;
  const old = D.find((d) => d.player === me && d.air === air && d.vip === vip && dist2(d.x, d.y, x, y) < (30 * TILE) ** 2);
  if (old) Object.assign(old, { x, y, power, tick: ai.tick });
  else D.push({ x, y, power, tick: ai.tick, player: me, air, vip });
}

/** Appel à l'aide auquel un peloton (au point x, y, de puissance donnée) devrait répondre. */
export function distressFor(ai: SkirmishAI, x: number, y: number, power: number, air: boolean): { x: number; y: number } | null {
  if (ai.level === "facile") {
    const t = ai.army.threat;
    return t && !air && ai.tick - t.tick < 60 ? { x: t.x, y: t.y } : null;
  }
  ai.board.distress = ai.board.distress.filter((d) => ai.tick - d.tick < 120 && ai.view.players[d.player]?.alive);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const d of ai.board.distress) {
    if (d.air !== air || ai.tick - d.tick > 40) continue;
    const mine = d.player === ai.ctx.slot;
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

export function attackTarget(ai: SkirmishAI, p: number): [number, number, number] | null {
  const c = ai.unitById(ai.view.players[p].commander);
  if (c) return [c.x, c.y, c.id];
  const st = ai.ctx.map.starts[p];
  return [st[0] * TILE, st[1] * TILE, 0];
}
export function raidTarget(ai: SkirmishAI, p: number): [number, number, number] | null {
  // bâtiment adverse le plus éloigné de son commandant (extracteur isolé)
  const c = ai.unitById(ai.view.players[p].commander);
  const st = ai.ctx.map.starts[p];
  const [cx, cy] = c ? [c.x, c.y] : [st[0] * TILE, st[1] * TILE];
  let best: BotBuilding | null = null;
  let bd = 0;
  const [hx, hy] = ai.baseCenter();
  for (const b of ai.ix.buildingsBy[p]) {
    const d = dist2(b.x * TILE, b.y * TILE, cx, cy) - dist2(b.x * TILE, b.y * TILE, hx, hy) * 0.5;
    if (d > bd) {
      bd = d;
      best = b;
    }
  }
  if (!best) return attackTarget(ai, p);
  return [best.x * TILE + TILE, best.y * TILE + TILE, 0];
}
