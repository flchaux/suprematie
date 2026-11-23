// Gestionnaire de pelotons, inspiré de l'IA du mod LOUD (AttackForceAI, plans d'attaque, réponses
// aux appels à l'aide, escadrilles de chasse et de bombardement).
//
// Les unités produites rejoignent un peloton « en formation » de leur famille : terrestre,
// amphibie (aéroglisseurs), chasseurs, frappe aérienne. Missions :
// - form    : rassemblement au point de ralliement ; lancement quand le peloton est assez fort ;
// - attack  : marche vers un point de regroupement (stage), attente des retardataires, puis assaut de
//             l'objectif ; jugement du combat à chaque décision (repli si l'ennemi local est trop fort) ;
// - retreat : retour au point de ralliement, puis fusion avec les renforts ;
// - guard   : défense d'un point menacé (nos modules ou la base d'un allié) ;
// - raid    : petit groupe rapide sur des installations isolées et peu défendues ;
// - chasseurs (une seule escadrille) : protection de nos installations, interception, escorte des bombardiers ;
// - strike  : frappe aérienne sur les installations les moins protégées par l'antiaérien.
// Les objectifs sont choisis sur les cartes de menace (intel.ts) : valeur économique / défense locale.
import type { BotUnit, Cmd } from "@supreme/shared";
import { move, target, O, Layer } from "@supreme/shared";
import { TILE, dist2, unitsNear, type ViewIndex } from "./util.ts";
import { T, kindPowers } from "./intel.ts";
import { isShip } from "./navy.ts";
import { convoy, isTransport, landingOwns } from "./landing.ts";
import { landNear } from "./land.ts";
import { pickTarget, objective, postDistress, distressFor } from "./strategy.ts";
import type { SkirmishAI } from "./ai.ts";

type Mission = "form" | "attack" | "retreat" | "guard" | "raid" | "strike";
type Family = "land" | "amphib" | "fighter" | "strike";

interface Platoon {
  id: number;
  family: Family;
  units: Set<number>;
  mission: Mission;
  targetPlayer: number;
  /** objectif (sous-unités) */
  ox: number;
  oy: number;
  /** point de regroupement avant l'assaut */
  sx: number;
  sy: number;
  staged: boolean;
  stageSince: number;
  tx: number;
  ty: number;
  lastOrder: number;
  launched: number; // taille au lancement
  launchPower: number;
  directOn: number; // cible d'attaque directe (commandant)
  since: number; // début de la mission
  quiet: number; // dernier tick avec un ennemi proche (garde)
  readySince: number; // en formation : effectif atteint depuis ce tick (0 : pas encore)
  /** dernier déplacement notable du peloton (détection d'un peloton bloqué) */
  mx?: number;
  my?: number;
  movedAt?: number;
}

const R_LOCAL = 26; // rayon (cases) du jugement local d'un combat

export class Army {
  platoons: Platoon[] = [];
  of = new Map<number, Platoon>();
  nextId = 1;
  attackSize: number;
  airSize: number;
  attacks = 0;
  retreats = 0;
  /** assauts repoussés par adversaire (indice du joueur -> nombre) : l'IA change de cible */
  repelled: Record<number, number> = {};
  /** menace sur nos installations (la plus forte), pour le commandant et la production */
  threat: { x: number; y: number; n: number; power: number; air: number; tick: number } | null = null;

  constructor(firstAttack: number, airAttack: number) {
    this.attackSize = firstAttack;
    this.airSize = airAttack;
  }

  forming(family: Family): Platoon {
    let p = this.platoons.find((q) => q.mission === "form" && q.family === family);
    if (!p) {
      p = this.newPlatoon(family, "form", -1);
      this.platoons.push(p);
    }
    return p;
  }

  newPlatoon(family: Family, mission: Mission, tgt: number, tick = 0): Platoon {
    return { id: this.nextId++, family, units: new Set(), mission, targetPlayer: tgt, ox: 0, oy: 0, sx: 0, sy: 0, staged: false, stageSince: 0, tx: 0, ty: 0, lastOrder: -1e9, launched: 0, launchPower: 0, directOn: 0, since: tick, quiet: tick, readySince: 0 };
  }

  /** Unités terrestres du peloton en formation (réserve où puise un débarquement). */
  reserve(ai: SkirmishAI, mine: Map<number, BotUnit>): BotUnit[] {
    const l: BotUnit[] = [];
    for (const p of this.platoons) {
      if (p.mission !== "form" || (p.family !== "land" && p.family !== "amphib")) continue;
      for (const id of p.units) {
        const u = mine.get(id);
        if (u && !u.carried) l.push(u);
      }
    }
    return l;
  }

  /** Retire des unités de leurs pelotons (confiées à un débarquement). */
  release(ids: number[]): void {
    for (const id of ids) {
      this.of.get(id)?.units.delete(id);
      this.of.delete(id);
    }
  }

  familyOf(ai: SkirmishAI, kind: number): Family {
    const d = ai.ctx.data.units[kind];
    if (d.layer === Layer.Air) {
      const kp = kindPowers(ai.ctx.data).units[kind];
      return kp.ground === 0 && kp.aa > 0 ? "fighter" : "strike";
    }
    if (d.layer === Layer.Hover) return "amphib";
    return "land";
  }

  think(ai: SkirmishAI, ix: ViewIndex, tick: number, out: Cmd[]): void {
    const me = ai.ctx.slot;
    const mine = new Map<number, BotUnit>();
    // les navires et les troupes d'un débarquement ont leurs propres missions (navy.ts, landing.ts)
    const landed = landingOwns(ai);
    for (const u of ix.unitsBy[me]) if (ai.isCombat(u.kind) && !isShip(ai, u.kind) && !isTransport(ai, u.kind) && !landed.has(u.id)) mine.set(u.id, u);
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
        const f = this.forming(this.familyOf(ai, u.kind));
        f.units.add(u.id);
        this.of.set(u.id, f);
      }
    }
    this.detectThreats(ai, ix, tick);
    const units = (p: Platoon): BotUnit[] => {
      const l: BotUnit[] = [];
      for (const id of p.units) {
        const u = mine.get(id);
        if (u) l.push(u);
      }
      return l;
    };
    const ctx = { mine, units };
    if (ai.debug && tick % 1200 < 20) {
      ai.log("pelotons", this.platoons.filter((p) => p.units.size).map((p) => {
        const us = [...p.units].map((id) => ai.unitById(id)).filter((u): u is BotUnit => !!u);
        const [cx, cy] = us.length ? centroid(us) : [0, 0];
        const T_ = 256;
        return `${p.id}:${p.family}/${p.mission}/${p.units.size}→J${p.targetPlayer}@${Math.round(cx / T_)},${Math.round(cy / T_)}${p.mission !== "form" ? `>${Math.round(p.ox / T_)},${Math.round(p.oy / T_)}${p.staged ? "" : " rgt " + Math.round(p.sx / T_) + "," + Math.round(p.sy / T_)} ord ${us.filter((u) => u.nOrders > 0).length}` : ""}`;
      }).join(" "), "cible terre", pickTarget(ai, true), "taille", this.attackSize);
    }
    for (const p of this.platoons.slice()) {
      const us = units(p);
      if (us.length === 0) continue;
      if (p.family === "fighter") this.fighterThink(ai, p, us, tick, out);
      else if (p.family === "strike") this.strikeThink(ai, p, us, tick, out);
      else this.landThink(ai, p, us, tick, out, ctx);
    }
  }

  // ---------- Forces terrestres ----------

  landThink(ai: SkirmishAI, p: Platoon, us: BotUnit[], tick: number, out: Cmd[], ctx: { units: (p: Platoon) => BotUnit[] }): void {
    const amphib = p.family === "amphib";
    const form = this.forming(p.family);
    const [cx, cy] = centroid(us);
    const power = this.power(ai, us, false);
    // appel à l'aide : nos installations ou celles d'un allié
    if (p.mission === "form" || p.mission === "guard") {
      const d = distressFor(ai, cx, cy, power, false);
      if (d) {
        if (p.mission !== "guard" || dist2(p.ox, p.oy, d.x, d.y) > (20 * TILE) ** 2) {
          p.mission = "guard";
          p.ox = d.x;
          p.oy = d.y;
          p.since = tick;
          p.lastOrder = -1e9;
        }
      }
    }
    // commandant en danger : les pelotons d'attaque proches reviennent le protéger
    const vip = ai.level !== "facile" ? ai.board.distress.find((d) => d.vip && d.player === ai.ctx.slot && tick - d.tick < 40) : undefined;
    if ((p.mission === "attack" || p.mission === "raid") && vip && dist2(cx, cy, vip.x, vip.y) < (120 * TILE) ** 2) {
      p.mission = "guard";
      p.ox = vip.x;
      p.oy = vip.y;
      p.since = tick;
      p.lastOrder = -1e9;
      ai.log("rappel du peloton", p.id, "pour protéger le commandant");
    }
    // une grosse menace sur notre base rappelle les pelotons d'attaque proches
    if ((p.mission === "attack" || p.mission === "raid") && this.threat && ai.level !== "facile") {
      const home = this.threat;
      const ours = ai.defensePower(home.x, home.y);
      if (home.power > ours * 1.2 && dist2(cx, cy, home.x, home.y) < (110 * TILE) ** 2 && home.power > power * 0.3) {
        p.mission = "guard";
        p.ox = home.x;
        p.oy = home.y;
        p.since = tick;
        p.lastOrder = -1e9;
        ai.log("rappel du peloton", p.id, "pour défendre la base");
      }
    }
    switch (p.mission) {
      case "guard": {
        const enemy = ai.enemySum(T.Surface, p.ox, p.oy, 30) + ai.enemySum(T.Air, p.ox, p.oy, 20) * 0.3;
        if (enemy > 0) p.quiet = tick;
        if (tick - p.quiet > 150 || tick - p.since > 6000) {
          // menace écartée : retour en formation
          if (p !== form) this.merge(p, form, us);
          form.mission = "form";
          form.lastOrder = -1e9;
          return;
        }
        this.order(p, us, p.ox, p.oy, tick, out, true, 6);
        return;
      }
      case "form":
        this.formLand(ai, p, us, power, tick, out);
        return;
      case "retreat": {
        const [rx, ry] = ai.rallyPoint();
        if (dist2(cx, cy, rx, ry) < (14 * TILE) ** 2 || tick - p.since > 2400) {
          this.merge(p, form, us);
          return;
        }
        this.order(p, us, rx, ry, tick, out, true, 6, false);
        return;
      }
    }
    // attaque ou raid
    if (!ai.view.players[p.targetPlayer]?.alive || ai.sameTeam(p.targetPlayer) || (!amphib && !ai.reachable(p.targetPlayer))) {
      const t = pickTarget(ai, !amphib);
      if (t < 0) {
        this.merge(p, form, us);
        return;
      }
      p.targetPlayer = t;
      p.ox = 0;
      p.lastOrder = -1e9;
    }
    // peloton décimé : repli
    if (us.length < Math.max(3, p.launched * 0.25)) {
      this.retreat(ai, p, tick, "décimé");
      return;
    }
    // peloton bloqué (point inaccessible, embouteillage) : d'abord droit sur l'objectif, puis repli
    if (p.movedAt === undefined || dist2(cx, cy, p.mx ?? 0, p.my ?? 0) > (4 * TILE) ** 2) {
      p.mx = cx;
      p.my = cy;
      p.movedAt = tick;
    } else if (tick - p.movedAt > 1500 && dist2(cx, cy, p.ox, p.oy) > (14 * TILE) ** 2) {
      p.movedAt = tick;
      if (!p.staged) {
        ai.log("peloton", p.id, "bloqué : assaut direct");
        p.staged = true;
        p.lastOrder = -1e9;
      } else {
        this.retreat(ai, p, tick, "bloqué");
        return;
      }
    }
    // jugement local du combat (LOUD : comparaison des menaces avant d'engager)
    if (ai.level !== "facile") {
      const enemy = ai.enemySum(T.Surface, cx, cy, R_LOCAL);
      const friends = ai.friendSum(T.Surface, cx, cy, R_LOCAL * 0.6);
      const ours = Math.max(power, friends);
      if (enemy > ours * (p.staged ? 1.9 : 1.4) && enemy > 0) {
        this.retreat(ai, p, tick, `ennemi ${enemy.toFixed(0)} contre ${ours.toFixed(0)}`);
        return;
      }
    }
    // objectif atteint ou invalide : choisir le suivant
    if (p.ox === 0 || this.cleared(ai, p)) {
      const obj = p.mission === "raid" ? objective(ai, p.targetPlayer, power, !amphib, 3) : objective(ai, p.targetPlayer, power, !amphib, 1);
      if (!obj) {
        const st = ai.ctx.map.starts[p.targetPlayer];
        p.ox = st[0] * TILE;
        p.oy = st[1] * TILE;
      } else {
        p.ox = obj[0];
        p.oy = obj[1];
      }
      this.setStage(ai, p, cx, cy);
      p.lastOrder = -1e9;
    }
    // commandant ennemi proche : attaque directe
    const c = ai.unitById(ai.view.players[p.targetPlayer].commander);
    if (c && dist2(cx, cy, c.x, c.y) < (24 * TILE) ** 2 && p.mission === "attack") {
      if (p.directOn !== c.id || tick - p.lastOrder > 100) {
        const idle = p.directOn !== c.id ? us : us.filter((u) => u.nOrders === 0);
        if (idle.length) out.push(target(O.ATTACK, idle.map((u) => u.id), c.id));
        p.directOn = c.id;
        p.lastOrder = tick;
      }
      return;
    }
    p.directOn = 0;
    if (!p.staged && ai.level !== "facile") {
      // regroupement avant l'assaut : on attend que 70 % du peloton soit là (au plus 25 s)
      const near = us.filter((u) => dist2(u.x, u.y, p.sx, p.sy) < (12 * TILE) ** 2).length;
      if (near >= us.length * 0.7 || (p.stageSince && tick - p.stageSince > 500)) {
        p.staged = true;
        p.lastOrder = -1e9;
      } else {
        if (!p.stageSince && near > 0) p.stageSince = tick;
        this.order(p, us, p.sx, p.sy, tick, out, false, 6);
        return;
      }
    }
    this.order(p, us, p.ox, p.oy, tick, out, false, 10);
    void ctx;
  }

  formLand(ai: SkirmishAI, p: Platoon, us: BotUnit[], power: number, tick: number, out: Cmd[]): void {
    const P = ai.persona;
    let [rx, ry] = ai.rallyPoint();
    // escorte : le commandant loin de la base, ou rien à attaquer par la terre
    const c = ai.unitById(ai.me.commander);
    if (c && ai.level !== "facile") {
      const [bx, by] = ai.baseCenter();
      if (dist2(c.x, c.y, bx, by) > (30 * TILE) ** 2 || pickTarget(ai, p.family !== "amphib") < 0) {
        rx = c.x;
        ry = c.y;
      }
    }
    if (tick - p.lastOrder > 200) {
      const far = us.filter((u) => dist2(u.x, u.y, rx, ry) > (12 * TILE) ** 2 && u.nOrders === 0);
      if (far.length) out.push(move(far, rx, ry, false, true));
      p.lastOrder = tick;
    }
    const amphib = p.family === "amphib";
    const need = amphib ? Math.max(6, this.attackSize >> 1) : this.attackSize;
    const delay = P.attackDelay * (ai.level === "facile" ? 1.6 : 1);
    const ready = tick >= delay || (ai.underPressure && us.length >= need * 2);
    if (!ready) return;
    const tgt = pickTarget(ai, !amphib);
    if (tgt < 0) return;
    // les renforts rejoignent l'attaque en cours sur la même cible
    const running = this.platoons.find((q) => q !== p && q.family === p.family && q.mission === "attack" && q.targetPlayer === tgt && q.units.size > 0);
    if (running && us.length >= 4) {
      const rc = centroid(us);
      // seulement si le chemin est sûr : la puissance du groupe de renfort suffit
      const [qx, qy] = running.staged ? [running.ox, running.oy] : [running.sx, running.sy];
      if (ai.level === "facile" || ai.enemySum(T.Surface, (rc[0] + qx) / 2, (rc[1] + qy) / 2, R_LOCAL) < power) {
        const np = this.newPlatoon(p.family, "attack", tgt, tick);
        Object.assign(np, { ox: running.ox, oy: running.oy, sx: running.sx, sy: running.sy, staged: false, stageSince: 0, launched: us.length, launchPower: power });
        // les renforts se regroupent sur le point de regroupement puis rejoignent l'assaut
        if (running.staged) {
          np.sx = qx;
          np.sy = qy;
        }
        this.merge(p, np, us);
        this.platoons.push(np);
        return;
      }
    }
    // lancement : assez nombreux, et (LOUD) assez fort pour la défense de l'objectif
    const obj = objective(ai, tgt, power, !amphib, 1);
    const defense = obj ? ai.enemySum(T.Surface, obj[0], obj[1], R_LOCAL) : 0;
    const strongEnough = ai.level === "facile" || power > defense * 1.3;
    // assez nombreux depuis longtemps : on attaque quand même (une armée qui attend ne sert à rien)
    if (us.length < need) p.readySince = 0;
    else if (!p.readySince) p.readySince = tick;
    const waited = p.readySince > 0 && tick - p.readySince > 2400;
    const big = us.length >= need * 2;
    let launchTgt = tgt;
    let launchObj = obj;
    if (us.length >= need && !strongEnough && !big && waited) {
      // trop faible pour cet objectif : une installation moins défendue, chez n'importe quel adversaire
      // joignable (plutôt que de se faire repousser sans rien détruire)
      let bestDef = Infinity;
      launchObj = null;
      for (const e of ai.enemyIds) {
        if (!amphib && !ai.reachable(e)) continue;
        const o = objective(ai, e, power, !amphib, 3);
        if (!o) continue;
        const d = ai.enemySum(T.Surface, o[0], o[1], R_LOCAL);
        if (d < bestDef) {
          bestDef = d;
          launchTgt = e;
          launchObj = o;
        }
      }
      if (!launchObj || power <= bestDef * 1.3) {
        // rien d'abordable : attendre d'être deux fois plus nombreux
        return;
      }
    }
    if ((us.length >= need && (strongEnough || waited)) || big) {
      p.readySince = 0;
      const np = this.newPlatoon(p.family, "attack", launchTgt, tick);
      np.launched = us.length;
      np.launchPower = power;
      if (launchObj) {
        np.ox = launchObj[0];
        np.oy = launchObj[1];
      }
      this.merge(p, np, us);
      this.platoons.push(np);
      const [cx, cy] = centroid(us);
      if (np.ox) this.setStage(ai, np, cx, cy);
      this.attacks++;
      this.attackSize = Math.min(P.maxAttack, this.attackSize + P.attackGrow);
      ai.log("attaque", np.id, "sur", launchTgt, us.length, "unités, puissance", power.toFixed(0), "défense", defense.toFixed(0));
      return;
    }
    if (!amphib && P.name === "rush" && this.attacks === 0 && us.length >= 6 && tick >= P.attackDelay * 0.6 && !this.platoons.some((q) => q.mission === "raid")) {
      // raid de harcèlement : petit groupe sur les installations isolées
      const np = this.newPlatoon("land", "raid", tgt, tick);
      np.launched = 6;
      this.merge(p, np, us.slice(0, 6));
      this.platoons.push(np);
    }
  }

  /** Point de regroupement : sur la ligne vers l'objectif, à distance de sa défense. */
  setStage(ai: SkirmishAI, p: Platoon, cx: number, cy: number): void {
    const dx = p.ox - cx;
    const dy = p.oy - cy;
    const d = Math.hypot(dx, dy) || 1;
    const back = Math.min(d * 0.5, 40 * TILE);
    p.sx = p.ox - (dx / d) * back;
    p.sy = p.oy - (dy / d) * back;
    // regroupement sur la terre ferme reliée à l'objectif (la ligne droite peut traverser un lac)
    if (p.family !== "amphib" && p.family !== "air") {
      const pt = landNear(ai, p.sx, p.sy, p.ox, p.oy);
      p.sx = pt[0];
      p.sy = pt[1];
    }
    p.staged = d < 30 * TILE || ai.level === "facile";
    p.stageSince = 0;
  }

  retreat(ai: SkirmishAI, p: Platoon, tick: number, why: string): void {
    p.mission = "retreat";
    p.since = tick;
    p.lastOrder = -1e9;
    p.staged = false;
    this.retreats++;
    if ((p.mission === "retreat") && (why.startsWith("ennemi") || why === "décimé" || why === "bloqué")) this.repelled[p.targetPlayer] = (this.repelled[p.targetPlayer] ?? 0) + 1;
    // il faudra une armée un peu plus grosse la prochaine fois
    this.attackSize = Math.min(ai.persona.maxAttack, this.attackSize + Math.ceil(ai.persona.attackGrow / 2));
    ai.log("repli du peloton", p.id, why);
  }

  /** L'objectif ne vaut plus rien : plus de bâtiments ni de défense autour. */
  cleared(ai: SkirmishAI, p: Platoon): boolean {
    const who = [p.targetPlayer];
    return ai.intel.sum(who, T.Eco, p.ox, p.oy, 8) < 1 && ai.intel.sum(who, T.Surface, p.ox, p.oy, 8) < 1;
  }

  // ---------- Aviation ----------

  fighterThink(ai: SkirmishAI, p: Platoon, us: BotUnit[], tick: number, out: Cmd[]): void {
    // tous les chasseurs forment une seule escadrille
    const form = this.forming("fighter");
    if (p !== form) {
      this.merge(p, form, us);
      form.lastOrder = -1e9;
      return;
    }
    // (l'escadrille reste en mission « form » : c'est elle qui accueille les nouveaux chasseurs)
    const power = this.power(ai, us, true);
    // 1) interception : aviation ennemie près de nos installations ou de celles d'un allié
    const d = distressFor(ai, ...centroid(us), power, true);
    if (d) {
      this.order(p, us, d.x, d.y, tick, out, true, 6);
      return;
    }
    // 2) escorte de la frappe aérienne en cours
    const strike = this.platoons.find((q) => q.family === "strike" && q.mission === "strike" && q.units.size > 0);
    if (strike && strike.ox && ai.enemyAirTotal() > 0) {
      const sx = (strike.tx || strike.ox) as number;
      const sy = (strike.ty || strike.oy) as number;
      this.order(p, us, sx, sy, tick, out, false, 10);
      return;
    }
    // 3) escorte d'un débarquement en vol
    const lead = convoy(ai);
    if (lead) {
      this.order(p, us, lead.x, lead.y, tick, out, true, 10);
      return;
    }
    // 4) patrouille au-dessus de la base
    const [bx, by] = ai.baseCenter();
    if (tick - p.lastOrder > 400) {
      const [rx, ry] = ai.rallyPoint();
      out.push(move(us, (bx + rx) / 2, (by + ry) / 2, false, true));
      p.lastOrder = tick;
    }
  }

  strikeThink(ai: SkirmishAI, p: Platoon, us: BotUnit[], tick: number, out: Cmd[]): void {
    const form = this.forming("strike");
    const power = this.power(ai, us, false);
    if (p.mission === "form") {
      // défense de la base contre une attaque terrestre
      const d = distressFor(ai, ...centroid(us), power, false);
      if (d && dist2(d.x, d.y, ...ai.baseCenter()) < (80 * TILE) ** 2) {
        this.order(p, us, d.x, d.y, tick, out, true, 6);
        return;
      }
      const [rx, ry] = ai.baseCenter();
      if (tick - p.lastOrder > 300) {
        const far = us.filter((u) => dist2(u.x, u.y, rx, ry) > (14 * TILE) ** 2 && u.nOrders === 0);
        if (far.length) out.push(move(far, rx, ry, false, false));
        p.lastOrder = tick;
      }
      if (us.length < this.airSize) return;
      const tgt = pickTarget(ai, false);
      if (tgt < 0) return;
      // LOUD : l'escadrille part quand elle surpasse l'antiaérien de son objectif (ou quand elle est
      // très nombreuse) ; sinon elle s'accumule
      if (ai.level !== "facile" && us.length < 40) {
        const obj = objective(ai, tgt, power, false, 2);
        const c = ai.unitById(ai.view.players[tgt].commander);
        const aaObj = obj ? ai.enemySum(T.AntiAir, obj[0], obj[1], 14) : Infinity;
        const aaCmd = c ? ai.enemySum(T.AntiAir, c.x, c.y, 14) : Infinity;
        if (power < Math.min(aaObj, aaCmd) * 1.2) return;
      }
      const np = this.newPlatoon("strike", "strike", tgt, tick);
      np.launched = us.length;
      np.launchPower = power;
      this.merge(p, np, us);
      this.platoons.push(np);
      this.airSize = Math.min(30, this.airSize + 2);
      return;
    }
    if (p.mission === "retreat") {
      const [bx, by] = ai.baseCenter();
      const [cx, cy] = centroid(us);
      if (dist2(cx, cy, bx, by) < (16 * TILE) ** 2 || tick - p.since > 1500) this.merge(p, form, us);
      else this.order(p, us, bx, by, tick, out, true, 6, false);
      return;
    }
    // frappe : pertes trop lourdes -> retour (sauf si tout le reste a échoué)
    if (us.length < Math.max(2, p.launched * 0.4) && ai.level !== "facile") {
      p.mission = "retreat";
      p.since = tick;
      p.lastOrder = -1e9;
      this.airSize = Math.min(36, this.airSize + 3);
      ai.log("retour de l'escadrille", p.id);
      return;
    }
    if (!ai.view.players[p.targetPlayer]?.alive || ai.sameTeam(p.targetPlayer)) {
      const t = pickTarget(ai, false);
      if (t < 0) {
        this.merge(p, form, us);
        return;
      }
      p.targetPlayer = t;
      p.ox = 0;
    }
    // commandant exposé (peu d'antiaérien autour) : frappe directe
    const c = ai.unitById(ai.view.players[p.targetPlayer].commander);
    if (c) {
      const aa = ai.intel.sum([c.owner], T.AntiAir, c.x, c.y, 14);
      const exposed = aa < power * 0.35 || !ai.reachable(p.targetPlayer);
      if (exposed || ai.level === "facile") {
        if (p.directOn !== c.id || tick - p.lastOrder > 200) {
          const idle = p.directOn !== c.id ? us : us.filter((u) => u.nOrders === 0);
          if (idle.length) out.push(target(O.ATTACK, idle.map((u) => u.id), c.id));
          p.directOn = c.id;
          p.lastOrder = tick;
        }
        return;
      }
    }
    p.directOn = 0;
    if (p.ox === 0 || this.cleared(ai, p)) {
      const obj = objective(ai, p.targetPlayer, power, false, 2);
      if (!obj) {
        const st = ai.ctx.map.starts[p.targetPlayer];
        p.ox = st[0] * TILE;
        p.oy = st[1] * TILE;
      } else {
        p.ox = obj[0];
        p.oy = obj[1];
      }
      p.lastOrder = -1e9;
    }
    this.order(p, us, p.ox, p.oy, tick, out, false, 8);
  }

  // ---------- Outils ----------

  /** Puissance d'un groupe (contre le sol ou contre l'air), points de vie restants compris. */
  power(ai: SkirmishAI, us: BotUnit[], aa: boolean): number {
    const kp = kindPowers(ai.ctx.data).units;
    let s = 0;
    for (const u of us) {
      const k = kp[u.kind];
      const hpf = Math.sqrt(Math.max(0.05, Math.min(1, u.hp / Math.max(1, ai.ctx.data.units[u.kind].hp))));
      s += (aa ? k.aa : Math.max(k.ground, k.aa * 0.2)) * hpf;
    }
    return s;
  }

  merge(from: Platoon, to: Platoon, us: BotUnit[]): void {
    for (const u of us) {
      from.units.delete(u.id);
      to.units.add(u.id);
      this.of.set(u.id, to);
    }
  }

  /** Déplacement (attaque en route par défaut) vers (x, y) si la cible a bougé ou si le peloton s'est arrêté. */
  order(p: Platoon, us: BotUnit[], x: number, y: number, tick: number, out: Cmd[], urgent: boolean, moveTiles: number, attack = true): void {
    const moved = dist2(p.tx, p.ty, x, y) > (moveTiles * TILE) ** 2;
    const idle = us.filter((u) => u.nOrders === 0 && dist2(u.x, u.y, x, y) > (8 * TILE) ** 2);
    const wait = urgent ? 30 : 100;
    if ((moved && tick - p.lastOrder > wait) || tick - p.lastOrder > 600) {
      out.push(move(us, x, y, false, attack));
      p.tx = x;
      p.ty = y;
      p.lastOrder = tick;
    } else if (idle.length > 0 && tick - p.lastOrder > 60) {
      out.push(move(idle, x, y, false, attack));
      p.lastOrder = tick;
    }
  }

  /** Menaces sur chacun de nos modules : appels à l'aide publiés pour l'équipe. */
  detectThreats(ai: SkirmishAI, ix: ViewIndex, tick: number): void {
    const me = ai.ctx.slot;
    const kp = kindPowers(ai.ctx.data).units;
    let worst: Army["threat"] = null;
    const sites: [number, number, number][] = ai.planner.modules.map((m) => [m.cx * TILE + TILE / 2, m.cy * TILE + TILE / 2, (m.L / 2 + 18) * TILE]);
    if (!sites.length) {
      const [bx, by] = ai.baseCenter();
      sites.push([bx, by, ai.baseRadius() * TILE]);
    }
    for (const [sx, sy, r] of sites) {
      let n = 0;
      let x = 0;
      let y = 0;
      let power = 0;
      let air = 0;
      unitsNear(ix, sx, sy, r, (u) => {
        if (u.owner === me || ai.sameTeam(u.owner)) return;
        const k = kp[u.kind];
        if (!k || (k.ground === 0 && k.aa === 0)) return;
        n++;
        x += u.x;
        y += u.y;
        if (k.air) air += k.ground;
        else power += k.ground;
      });
      if (n === 0) continue;
      const t = { x: x / n, y: y / n, n, power: power + air, air, tick };
      postDistress(ai, t.x, t.y, power, air > power);
      if (!worst || t.power > worst.power) worst = t;
    }
    if (worst) {
      this.threat = worst;
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

function centroid(us: BotUnit[]): [number, number] {
  let x = 0;
  let y = 0;
  for (const u of us) {
    x += u.x;
    y += u.y;
  }
  return [x / us.length, y / us.length];
}

