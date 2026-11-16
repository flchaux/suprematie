// Gestionnaire de pelotons : les unités produites sont regroupées en pelotons avec une mission
// (formation au point de ralliement, attaque, défense, raid). Les unités terrestres et l'aviation
// forment des pelotons séparés : l'aviation peut frapper les adversaires inaccessibles par la terre.
// Les ordres ne sont renvoyés que lorsque la cible change ou que le peloton s'est arrêté.
import type { BotUnit, Cmd } from "@supreme/shared";
import { move, target, O, Layer } from "@supreme/shared";
import { TILE, dist2, unitsNear, type ViewIndex } from "./util.ts";
import type { SkirmishAI } from "./ai.ts";

type Mission = "form" | "attack" | "defend" | "raid";

interface Platoon {
  id: number;
  air: boolean;
  units: Set<number>;
  mission: Mission;
  targetPlayer: number;
  tx: number;
  ty: number;
  lastOrder: number;
  launched: number; // taille au lancement
  directOn: number; // cible d'attaque directe (commandant)
}

export class Army {
  platoons: Platoon[] = [];
  of = new Map<number, Platoon>();
  nextId = 1;
  attackSize: number;
  airSize: number;
  attacks = 0;
  threat: { x: number; y: number; n: number; tick: number } | null = null;

  constructor(firstAttack: number, airAttack: number) {
    this.attackSize = firstAttack;
    this.airSize = airAttack;
  }

  forming(air: boolean): Platoon {
    let p = this.platoons.find((q) => q.mission === "form" && q.air === air);
    if (!p) {
      p = { id: this.nextId++, air, units: new Set(), mission: "form", targetPlayer: -1, tx: 0, ty: 0, lastOrder: -1e9, launched: 0, directOn: 0 };
      this.platoons.push(p);
    }
    return p;
  }

  think(ai: SkirmishAI, ix: ViewIndex, tick: number, out: Cmd[]): void {
    const me = ai.ctx.slot;
    const mine = new Map<number, BotUnit>();
    const data = ai.ctx.data;
    for (const u of ix.unitsBy[me]) {
      if (ai.isCombat(u.kind)) mine.set(u.id, u);
    }
    for (const p of this.platoons) {
      for (const id of p.units) {
        if (!mine.has(id)) {
          p.units.delete(id);
          this.of.delete(id);
        }
      }
    }
    this.platoons = this.platoons.filter((p) => p.units.size > 0 || p.mission === "form");
    for (const u of mine.values()) {
      if (!this.of.has(u.id)) {
        const f = this.forming(data.units[u.kind].layer === Layer.Air);
        f.units.add(u.id);
        this.of.set(u.id, f);
      }
    }
    const P = ai.persona;
    this.detectThreat(ai, ix, tick);
    const units = (p: Platoon): BotUnit[] => {
      const l: BotUnit[] = [];
      for (const id of p.units) {
        const u = mine.get(id);
        if (u) l.push(u);
      }
      return l;
    };
    for (const p of this.platoons.slice()) {
      const us = units(p);
      if (us.length === 0) continue;
      const form = this.forming(p.air);
      if (this.threat && (p.mission === "form" || p.mission === "defend")) {
        p.mission = "defend";
        this.order(p, us, this.threat.x, this.threat.y, tick, out, true, 6);
        continue;
      }
      if (p.mission === "defend") {
        // menace partie : retour en formation
        if (p !== form) this.merge(p, form, us);
        form.mission = "form";
        form.lastOrder = -1e9;
        continue;
      }
      if (p.mission === "form") {
        this.formThink(ai, p, us, tick, out);
        continue;
      }
      // attaque ou raid
      if (!ai.view.players[p.targetPlayer]?.alive || ai.sameTeam(p.targetPlayer) || (!p.air && !ai.reachable(p.targetPlayer))) {
        const t = ai.pickTarget(!p.air);
        if (t < 0) {
          this.merge(p, form, us);
          continue;
        }
        p.targetPlayer = t;
        p.lastOrder = -1e9;
      }
      // peloton décimé : retour à la base (sauf l'aviation, qui frappe jusqu'au bout)
      if (!p.air && us.length < Math.max(3, p.launched * 0.2)) {
        this.merge(p, form, us);
        const [rx, ry] = ai.rallyPoint();
        out.push(move(us, rx, ry, false, false));
        continue;
      }
      const goal = p.mission === "raid" ? ai.raidTarget(p.targetPlayer) : ai.attackTarget(p.targetPlayer);
      if (!goal) continue;
      const [gx, gy, cmdId] = goal;
      if (p.air && cmdId) {
        // frappe aérienne directe sur le commandant
        if (p.directOn !== cmdId || tick - p.lastOrder > 200) {
          const idle = p.directOn !== cmdId ? us : us.filter((u) => u.nOrders === 0);
          if (idle.length) out.push(target(O.ATTACK, idle.map((u) => u.id), cmdId));
          p.directOn = cmdId;
          p.lastOrder = tick;
        }
        continue;
      }
      let cx = 0;
      let cy = 0;
      for (const u of us) {
        cx += u.x;
        cy += u.y;
      }
      cx /= us.length;
      cy /= us.length;
      const near = dist2(cx, cy, gx, gy) < (28 * TILE) ** 2;
      if (near && cmdId && p.mission === "attack") {
        if (p.directOn !== cmdId || tick - p.lastOrder > 100) {
          const idle = p.directOn !== cmdId ? us : us.filter((u) => u.nOrders === 0);
          if (idle.length) out.push(target(O.ATTACK, idle.map((u) => u.id), cmdId));
          p.directOn = cmdId;
          p.lastOrder = tick;
        }
        continue;
      }
      p.directOn = 0;
      this.order(p, us, gx, gy, tick, out, false, 12);
    }
  }

  formThink(ai: SkirmishAI, p: Platoon, us: BotUnit[], tick: number, out: Cmd[]): void {
    const P = ai.persona;
    const [rx, ry] = ai.rallyPoint();
    if (tick - p.lastOrder > 200) {
      const far = us.filter((u) => dist2(u.x, u.y, rx, ry) > (12 * TILE) ** 2 && u.nOrders === 0);
      if (far.length) out.push(move(far, rx, ry, false, true));
      p.lastOrder = tick;
    }
    const need = p.air ? this.airSize : this.attackSize;
    const ready = tick >= P.attackDelay || p.air || (ai.underPressure && us.length >= need * 2);
    if (us.length >= need && ready) {
      const tgt = ai.pickTarget(!p.air);
      if (tgt < 0) return;
      // les renforts rejoignent l'attaque en cours sur la même cible
      const running = this.platoons.find((q) => q !== p && q.air === p.air && q.mission === "attack" && q.targetPlayer === tgt && q.units.size > 0);
      if (running && !p.air) {
        this.merge(p, running, us);
        running.lastOrder = -1e9;
        return;
      }
      const np: Platoon = { id: this.nextId++, air: p.air, units: new Set(), mission: "attack", targetPlayer: tgt, tx: 0, ty: 0, lastOrder: -1e9, launched: us.length, directOn: 0 };
      this.merge(p, np, us);
      this.platoons.push(np);
      if (p.air) this.airSize = Math.min(30, this.airSize + 2);
      else {
        this.attacks++;
        this.attackSize = Math.min(P.maxAttack, this.attackSize + P.attackGrow);
      }
    } else if (!p.air && P.name === "rush" && this.attacks === 0 && us.length >= 6 && tick >= P.attackDelay * 0.6 && !this.platoons.some((q) => q.mission === "raid")) {
      // raid de harcèlement : petit groupe sur les installations éloignées
      const tgt = ai.pickTarget(true);
      if (tgt >= 0) {
        const np: Platoon = { id: this.nextId++, air: false, units: new Set(), mission: "raid", targetPlayer: tgt, tx: 0, ty: 0, lastOrder: -1e9, launched: 6, directOn: 0 };
        this.merge(p, np, us.slice(0, 6));
        this.platoons.push(np);
      }
    }
  }

  merge(from: Platoon, to: Platoon, us: BotUnit[]): void {
    for (const u of us) {
      from.units.delete(u.id);
      to.units.add(u.id);
      this.of.set(u.id, to);
    }
  }

  /** Attaque-déplacement vers (x, y) si la cible a bougé ou si le peloton s'est arrêté. */
  order(p: Platoon, us: BotUnit[], x: number, y: number, tick: number, out: Cmd[], urgent: boolean, moveTiles: number): void {
    const moved = dist2(p.tx, p.ty, x, y) > (moveTiles * TILE) ** 2;
    const idle = us.filter((u) => u.nOrders === 0 && dist2(u.x, u.y, x, y) > (8 * TILE) ** 2);
    const wait = urgent ? 30 : 100;
    if ((moved && tick - p.lastOrder > wait) || tick - p.lastOrder > 600) {
      out.push(move(us, x, y, false, true));
      p.tx = x;
      p.ty = y;
      p.lastOrder = tick;
    } else if (idle.length > 0 && tick - p.lastOrder > 60) {
      out.push(move(idle, x, y, false, true));
      p.lastOrder = tick;
    }
  }

  detectThreat(ai: SkirmishAI, ix: ViewIndex, tick: number): void {
    const [bx, by] = ai.baseCenter();
    const r = ai.baseRadius() * TILE;
    let n = 0;
    let sx = 0;
    let sy = 0;
    const me = ai.ctx.slot;
    unitsNear(ix, bx, by, r, (u) => {
      if (u.owner === me || ai.sameTeam(u.owner)) return;
      const k = ai.ctx.data.units[u.kind];
      if (!k || k.weapons.length === 0) return;
      n++;
      sx += u.x;
      sy += u.y;
    });
    if (n > 0) {
      this.threat = { x: sx / n, y: sy / n, n, tick };
      ai.lastThreat = tick;
    } else if (this.threat && tick - this.threat.tick > 100) {
      this.threat = null;
    }
  }

  size(): number {
    let n = 0;
    for (const p of this.platoons) n += p.units.size;
    return n;
  }
}
