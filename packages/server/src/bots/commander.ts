// Commandant : mise à l'abri quand une force le dépasse.
import type { Cmd } from "@supreme/shared";
import { move } from "@supreme/shared";
import { TILE, dist2, unitsNear } from "./util.ts";
import { T, kindPowers } from "./intel.ts";
import { postDistress } from "./strategy.ts";
import type { SkirmishAI } from "./ai.ts";

// ---------- Commandant ----------
export function commander(ai: SkirmishAI, out: Cmd[]): void {
  const c = ai.unitById(ai.me.commander);
  if (!c) return;
  const def = ai.ctx.data.units[c.kind];
  const [bx, by] = ai.baseCenter();
  // repli vers le centre de la base, à l'abri des tourelles, du côté opposé aux adversaires
  const sx = bx - ai.enemyDir[0] * 8 * TILE;
  const sy = by - ai.enemyDir[1] * 8 * TILE;
  const far = dist2(c.x, c.y, sx, sy) > (8 * TILE) ** 2;
  if (ai.level === "facile") {
    if (c.hp < def.hp * 0.35 && ai.army.threat && far && ai.tick % 100 === 0) out.push(move([c], sx, sy));
    return;
  }
  // LOUD : le commandant n'affronte pas une force qui le dépasse (ses points de vie ne se réparent pas) :
  // il recule à l'opposé, derrière notre armée si elle est assez forte.
  const air = ai.enemySum(T.Air, c.x, c.y, 16);
  const enemy = ai.enemySum(T.Surface, c.x, c.y, 22) + air;
  const mine = kindPowers(ai.ctx.data).units[c.kind].ground * Math.sqrt(c.hp / def.hp);
  if (enemy > 0) postDistress(ai, c.x, c.y, enemy, air > enemy * 0.5, true);
  // il défend la base avec les tourelles et l'armée (il est solide et reste le principal bâtisseur
  // au début), mais recule si la défense locale est dépassée ou s'il est sérieusement blessé
  const local = ai.friendSum(T.Surface, c.x, c.y, 22); // lui, nos tourelles et nos unités autour
  const danger = enemy > local * 1.1 || (c.hp < def.hp * 0.5 && enemy > mine * 0.3);
  if (danger) ai.cmdHoldUntil = ai.tick + 150;
  if (ai.tick >= ai.cmdHoldUntil) return;
  if (ai.tick - ai.cmdMoved < 40) return;
  let ex = 0;
  let ey = 0;
  let en = 0;
  let ax = 0;
  let ay = 0;
  let apow = 0;
  const kp = kindPowers(ai.ctx.data).units;
  unitsNear(ai.ix, c.x, c.y, 40 * TILE, (u) => {
    if (u.id === c.id || !ai.combatKinds[u.kind]) return;
    const k = kp[u.kind];
    if (u.owner === ai.ctx.slot || ai.sameTeam(u.owner)) {
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
  const m = ai.ctx.map;
  tx = Math.max(2 * TILE, Math.min((m.w - 3) * TILE, tx));
  ty = Math.max(2 * TILE, Math.min((m.h - 3) * TILE, ty));
  if (c.nOrders === 0 || en > 0) {
    out.push(move([c], tx, ty));
    ai.cmdMoved = ai.tick;
  }
}
