// Générateur d'ordres aléatoires (mais reproductibles) pour les tests.
import { O, pack, move, build, target, factoryQueue, research, point } from "../packages/shared/src/orders.ts";
import { parseBotDump } from "../packages/shared/src/render.ts";

export function randomOrders(seed, sim) {
  let s = seed >>> 0 || 1;
  const rnd = (n) => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s % n;
  };
  const size = 512;
  return (t) => {
    const out = [];
    if (t % 7 !== 0) return out;
    const view = parseBotDump(sim.botDump());
    // la faune (équipe 8, toujours la dernière) ne donne pas d'ordres
    const np = view.players.filter((pl) => pl.team !== 8).length;
    for (let p = 0; p < np; p++) {
      const mine = view.units.filter((u) => u.owner === p);
      if (mine.length === 0) continue;
      const r = rnd(10);
      const u = mine[rnd(mine.length)];
      const tx = (u.x >> 8) + rnd(41) - 20;
      const ty = (u.y >> 8) + rnd(41) - 20;
      if (r < 3) pack(p, move([u], tx * 256, ty * 256, false, rnd(2) === 0), out);
      else if (r < 6) {
        const kinds = [0, 1, 4, 5, 11, 12, 13, 14, 16, 22];
        pack(p, build([u.id], kinds[rnd(kinds.length)], Math.max(2, Math.min(size - 8, tx)), Math.max(2, Math.min(size - 8, ty)), rnd(4), true), out);
      } else if (r < 7) {
        const f = view.buildings.find((b) => b.owner === p && b.kind === 16);
        if (f) pack(p, factoryQueue(f.ref, 4 + rnd(3), 2), out);
        pack(p, research(1 + rnd(3)), out);
      } else if (r < 8) {
        const enemy = view.units.find((e) => e.owner !== p);
        if (enemy) pack(p, target(O.ATTACK, [u.id], enemy.id), out);
      } else if (r < 9 && view.wrecks.length) {
        pack(p, target(O.RECLAIM, [u.id], view.wrecks[rnd(view.wrecks.length)].ref), out);
      } else {
        pack(p, point(O.PATROL, [u.id], tx * 256, ty * 256), out);
      }
    }
    return out;
  };
}
