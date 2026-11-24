// Générateur d'ordres aléatoires (mais reproductibles) pour les tests.
import { O, pack, move, moveFormation, build, target, factoryQueue, research, point, harvest, installMod, cancelMod, arkTurrets, arkTurretType, arkBoost, arkQueue, kitSet, kitActive, kitApply } from "../packages/shared/src/orders.ts";
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
  // gisements de la carte (map_info : w, h, eau, n départs, départs…, n gisements, puis kind, x, y)
  let spots = null;
  const spotList = () => {
    if (spots) return spots;
    const m = sim.mapInfo();
    let o = 4 + m[3] * 2;
    const n = m[o++];
    spots = [];
    for (let i = 0; i < n; i++, o += 3) spots.push({ kind: m[o], x: m[o + 1], y: m[o + 2] });
    return spots;
  };
  return (t) => {
    const out = [];
    if (t % 7 !== 0) return out;
    const view = parseBotDump(sim.botDump());
    // la faune (équipe 8, toujours la dernière) ne donne pas d'ordres
    const np = view.players.filter((pl) => pl.team !== 8).length;
    for (let p = 0; p < np; p++) {
      const mine = view.units.filter((u) => u.owner === p);
      if (mine.length === 0) continue;
      // Transhumants : améliorations de l'Arche (unité 62), tourelles, surcharge, atelier embarqué
      const ark = mine.find((v) => v.kind === 62);
      if (ark && rnd(2) === 0) {
        const q = rnd(12);
        if (q < 4) pack(p, installMod(1 + rnd(25), [ark.id]), out);
        else if (q === 4) pack(p, cancelMod([ark.id]), out);
        else if (q < 8) pack(p, arkTurrets([ark.id], rnd(4)), out);
        else if (q < 10) pack(p, arkTurretType(ark.id, rnd(10) - 1, rnd(3)), out);
        else if (q === 10) pack(p, arkBoost([ark.id]), out);
        else pack(p, arkQueue(ark.id, 63 + rnd(14), rnd(3) - 1), out);
      }
      // Transhumants : équipement des unités (améliorations 44 à 80), gabarits (types d'unité 72 à 76), modules
      if (ark && rnd(3) === 0) {
        const q = rnd(6);
        const kind = 72 + rnd(5);
        const set = [44 + rnd(37), 44 + rnd(37), 44 + rnd(37)];
        if (q === 0) pack(p, kitSet(kind, rnd(3), set), out);
        else if (q === 1) pack(p, kitActive(kind, rnd(4)), out);
        else if (q === 2) pack(p, kitApply(set, mine.slice(0, 8).map((v) => v.id)), out);
        else if (q === 3) pack(p, installMod(44 + rnd(37), [mine[rnd(mine.length)].id]), out);
        else {
          const b = view.buildings.find((x) => x.owner === p);
          if (b) pack(p, installMod(rnd(99), [b.ref]), out);
        }
      }
      const r = rnd(10);
      const u = mine[rnd(mine.length)];
      const tx = (u.x >> 8) + rnd(41) - 20;
      const ty = (u.y >> 8) + rnd(41) - 20;
      if (r < 2) pack(p, move([u], tx * 256, ty * 256, false, rnd(2) === 0), out);
      else if (r < 3) {
        // formation orientée (allure du plus lent, orientation à l'arrivée) : jusqu'à 6 unités, angle au hasard
        const group = mine.slice(0, 6).map((v) => v.id);
        pack(p, moveFormation(group, tx * 256, ty * 256, (rnd(360) * Math.PI) / 180, rnd(4) === 0, rnd(2) === 0), out);
      }
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
      } else if (rnd(3) === 0) {
        // récolte (seul un commandant l'accepte, sur un gisement fondable) : le gisement le plus proche
        const sp = spotList().reduce((a, b) => (Math.abs(b.x - tx) + Math.abs(b.y - ty) < Math.abs(a.x - tx) + Math.abs(a.y - ty) ? b : a), spotList()[0]);
        if (sp) pack(p, harvest([u.id], sp.x + rnd(2), sp.y + rnd(2)), out);
      } else {
        pack(p, point(O.PATROL, [u.id], tx * 256, ty * 256), out);
      }
    }
    return out;
  };
}
