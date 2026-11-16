// Gestionnaire de pelotons : les unités produites sont regroupées en pelotons avec une mission
// (formation au point de ralliement, attaque, défense, raid). Les ordres ne sont renvoyés que
// lorsque la cible change ou que le peloton s'est arrêté.
import type { BotUnit, Cmd } from "@supreme/shared";
import { move, target, O } from "@supreme/shared";
import { TILE, dist2, unitsNear, type ViewIndex } from "./util.ts";
import type { SkirmishAI } from "./ai.ts";

type Mission = "form" | "attack" | "defend" | "raid";

interface Platoon {
  id: number;
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
  attacks = 0;
  threat: { x: number; y: number; n: number; tick: number } | null = null;

  constructor(firstAttack: number) {
    this.attackSize = firstAttack;
  }

  forming(): Platoon {
    let p = this.platoons.find((q) => q.mission === "form");
    if (!p) {
      p = { id: this.nextId++, units: new Set(), mission: "form", targetPlayer: -1, tx: 0, ty: 0, lastOrder: -1e9, launched: 0, directOn: 0 };
      this.platoons.push(p);
    }
    return p;
  }

  think(ai: SkirmishAI, ix: ViewIndex, tick: number, out: Cmd[]): void {
    const me = ai.ctx.slot;
    const mine = new Map<number, BotUnit>();
    for (const u of ix.unitsBy[me]) {
      if (ai.isCombat(u.kind)) mine.set(u.id, u);
    }
    // nettoyage
    for (const p of this.platoons) {
      for (const id of p.units) if (!mine.has(id)) {
        p.units.delete(id);
        this.of.delete(id);
      }
    }
    this.platoons = this.platoons.filter((p) => p.units.size > 0 || p.mission === "form");
    // nouvelles unités
    const form = this.forming();
    for (const u of mine.values()) {
      if (!this.of.has(u.id)) {
        form.units.add(u.id);
        this.of.set(u.id, form);
      }
    }
    const P = ai.persona;
    // menace sur la base
    this.detectThreat(ai, ix, tick);
    const units = (p: Platoon): BotUnit[] => {
      const l: BotUnit[] = [];
      for (const id of p.units) {
        const u = mine.get(id);
        if (u) l.push(u);
      }
      return l;
    };
    for (const p of this.platoons) {
      const us = units(p);
      if (us.length === 0) continue;
      if (this.threat && (p.mission === "form" || p.mission === "defend")) {
        p.mission = "defend";
        this.order(p, us, this.threat.x, this.threat.y, tick, out, true, 6);
        continue;
      }
      if (p.mission === "defend") {
        // menace partie : retour en formation (ou fusion avec le peloton en formation)
        if (p !== form) {
          for (const u of us) {
            p.units.delete(u.id);
            form.units.add(u.id);
            this.of.set(u.id, form);
          }
        }
        form.mission = "form";
        form.lastOrder = -1e9;
        continue;
      }
      if (p.mission === "form") {
        const [rx, ry] = ai.rallyPoint();
        // rassembler les traînards
        if (tick - p.lastOrder > 200) {
          const far = us.filter((u) => dist2(u.x, u.y, rx, ry) > (12 * TILE) ** 2 && u.nOrders === 0);
          if (far.length) out.push(move(far, rx, ry, false, true));
          p.lastOrder = tick;
        }
        const ready = tick >= P.attackDelay || (ai.underPressure && us.length >= this.attackSize * 2);
        if (us.length >= this.attackSize && ready) {
          const tgt = ai.pickTarget();
          if (tgt >= 0) {
            p.mission = "attack";
            p.targetPlayer = tgt;
            p.launched = us.length;
            p.lastOrder = -1e9;
            this.attacks++;
            this.attackSize = Math.min(P.maxAttack, this.attackSize + P.attackGrow);
          }
        } else if (P.name === "rush" && this.attacks === 0 && us.length >= 6 && tick >= P.attackDelay * 0.6 && !this.platoons.some((q) => q.mission === "raid")) {
          // raid de harcèlement : petit groupe rapide sur les installations éloignées
          const tgt = ai.pickTarget();
          if (tgt >= 0) {
            const np: Platoon = { id: this.nextId++, units: new Set(), mission: "raid", targetPlayer: tgt, tx: 0, ty: 0, lastOrder: -1e9, launched: 0, directOn: 0 };
            for (const u of us.slice(0, 6)) {
              p.units.delete(u.id);
              np.units.add(u.id);
              this.of.set(u.id, np);
            }
            np.launched = np.units.size;
            this.platoons.push(np);
          }
        }
        continue;
      }
      if (p.mission === "attack" || p.mission === "raid") {
        if (!ai.view.players[p.targetPlayer]?.alive || ai.sameTeam(p.targetPlayer)) {
          const t = ai.pickTarget();
          if (t < 0) continue;
          p.targetPlayer = t;
          p.lastOrder = -1e9;
        }
        // peloton décimé : retour à la base
        if (us.length < Math.max(3, p.launched * 0.2)) {
          for (const u of us) {
            p.units.delete(u.id);
            form.units.add(u.id);
            this.of.set(u.id, form);
          }
          const [rx, ry] = ai.rallyPoint();
          out.push(move(us, rx, ry, false, false));
          continue;
        }
        const goal = p.mission === "raid" ? ai.raidTarget(p.targetPlayer) : ai.attackTarget(p.targetPlayer);
        if (!goal) continue;
        const [gx, gy, cmdId] = goal;
        // centre du peloton
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
