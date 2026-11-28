// Contrôleur de partie, bâtiments : ordres aux bâtiments sélectionnés (file des usines, recette, réglages, pause,
// rotation), recherche, modules des Transhumants, démolition et recyclage en zone.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as Ord from "@supreme/shared/orders.ts";
import { UNIT_WORDS, BUILDING_WORDS, WRECK_WORDS, UF, BClass, pausableClass } from "@supreme/shared";
import { groundHeight } from "../render/terrain.ts";
import { ui, pushMessage, hasTechUI } from "./state.svelte.ts";
import { sfx } from "../audio/sound.ts";
import type { GameClient } from "./client.ts";
import { TILE, O } from "./clientConsts.ts";

/** Nos bâtiments de production terminés de la sélection, qu'on peut mettre en pause ou relancer. */
export function pausableSelection(c: GameClient): { ref: number; paused: boolean }[] {
  return ui.selBuildings.filter((b) => b.owner === ui.me && b.built && pausableClass(c.data?.buildings[b.kind]?.cls ?? -1)).map((b) => ({ ref: b.ref, paused: !!b.paused }));
}
/**
 * Bouton (ou raccourci) Pause : met en pause les bâtiments de production sélectionnés ; s'ils sont
 * tous déjà en pause, les relance. L'état affiché suit tout de suite, la simulation confirme ensuite.
 */
export function togglePauseSelected(c: GameClient): void {
  const l = c.pausableSelection();
  if (!l.length) return;
  const on = !l.every((b) => b.paused);
  c.cmd(Ord.setPause(l.map((b) => b.ref), on));
  const refs = new Set(l.map((b) => b.ref));
  ui.selBuildings = ui.selBuildings.map((b) => (refs.has(b.ref) ? { ...b, paused: on } : b));
  if (ui.buildingInfo && ui.selBuilding && refs.has(ui.selBuilding.ref)) ui.buildingInfo = { ...ui.buildingInfo, enabled: !on };
  sfx.click();
}

/** Transhumants : la soute sélectionnée, ou l'Arche sélectionnée seule, attelle un chariot de convoi. */
export function hitchCart(c: GameClient): void {
  const h = ui.selBuildings.find((b) => b.owner === ui.me && c.data?.buildings[b.kind].key === "t_hold");
  const sel = c.selectedUnits();
  const ark = sel.length === 1 && c.data?.units[sel[0].kind].key === "ark" ? sel[0] : undefined;
  const r = h?.ref ?? ark?.id;
  if (r === undefined) return;
  c.cmd(Ord.hitch(r));
  sfx.confirm();
}

/** Transhumants : nos modules parmi les bâtiments sélectionnés, ceux qui se replient (pas les poteaux ni le quai de l'Arche). */
export function foldableSelection(c: GameClient): number[] {
  const d = c.data;
  if (!d) return [];
  return ui.selBuildings.filter((b) => b.owner === ui.me && foldable(d.buildings[b.kind])).map((b) => b.ref);
}

function foldable(bd: { race?: number; key: string }): boolean {
  return (bd.race ?? 0) === 2 && bd.key !== "t_pole" && bd.key !== "ark_dock";
}

/** Transhumants : replier les modules sélectionnés, un ou plusieurs à la fois (ils redeviennent des chenillards). */
export function packSelected(c: GameClient): void {
  const refs = foldableSelection(c);
  if (refs.length) {
    c.cmd(Ord.fold(refs));
    sfx.confirm();
  } else sfx.error();
}

/** Nos tapis, bras et tapis de contrôle terminés parmi la sélection (ordre ROTATE). */
export function rotatableSelection(c: GameClient): number[] {
  // plusieurs bâtiments sélectionnés : seule la démolition est possible
  if (ui.me < 0 || !c.data || c.selected.size !== 1) return [];
  const out: number[] = [];
  for (const id of c.selected) {
    if (!Ord.isBuildingRef(id)) continue;
    const b = c.findBuilding(id);
    const cls = b ? c.data.buildings[b.kind]?.cls : -1;
    if (b && b.owner === ui.me && (cls === BClass.Belt || cls === BClass.Inserter || cls === BClass.Router)) out.push(id);
  }
  return out;
}

// ---------- usines et bâtiments ----------
export function queueUnit(c: GameClient, kind: number, delta: number): void {
  if (ui.selBuilding) c.cmd(Ord.factoryQueue(ui.selBuilding.ref, kind, delta));
}
export function toggleRepeat(c: GameClient, on: boolean): void {
  if (ui.selBuilding) c.cmd(Ord.factoryRepeat(ui.selBuilding.ref, on));
}
export function setRecipe(c: GameClient, r: number): void {
  if (ui.selBuilding) c.cmd(Ord.setRecipe(ui.selBuilding.ref, r));
}

export function clearResearchQueue(c: GameClient): void {
  c.researchEdit = performance.now();
  c.cmd(Ord.researchQueue(0));
  ui.researchQueue = [];
  sfx.click();
}
/** Lance la recherche tout de suite (Maj+clic). */
export function research(c: GameClient, t: number): void {
  c.researchEdit = performance.now();
  c.cmd(Ord.research(t));
  ui.researchQueue = ui.researchQueue.filter((q) => q !== t);
  sfx.confirm();
}
/**
 * Clic sur une recherche : en file (précédée de ses prérequis manquants, dans l'ordre) ; si elle y
 * est déjà, retirée. Sans recherche en cours, la première démarre aussitôt.
 */
export function queueResearch(c: GameClient, t: number): void {
  const d = c.data;
  if (!d || ui.me < 0) return;
  c.researchEdit = performance.now();
  if (ui.researchQueue.includes(t)) {
    c.cmd(Ord.researchQueue(t));
    ui.researchQueue = ui.researchQueue.filter((q) => q !== t);
    sfx.click();
    return;
  }
  const have = (q: number) => hasTechUI(q) || ui.research === q || ui.researchQueue.includes(q);
  const chain: number[] = [];
  let choice = -1;
  const visit = (q: number) => {
    if (have(q) || chain.includes(q)) return;
    for (const r of d.techs[q].prereq) {
      // mutations exclusives : l'une des deux suffit, et c'est au joueur de choisir laquelle
      const x = d.techs[r].excl ?? 0;
      if (x && have(x)) continue;
      if (x && !have(r)) choice = r;
      else visit(r);
    }
    chain.push(q);
  };
  visit(t);
  if (choice >= 0) {
    pushMessage(`Choisissez d'abord une mutation : ${d.techs[choice].name} ou ${d.techs[d.techs[choice].excl].name}`, "alert");
    sfx.error();
    return;
  }
  for (const q of chain) c.cmd(Ord.researchQueue(q));
  // affichage immédiat (la simulation confirme au prochain relevé)
  const rest = !ui.research ? chain.slice(1) : chain;
  if (!ui.research && chain.length) ui.research = chain[0];
  ui.researchQueue = [...ui.researchQueue, ...rest];
  sfx.confirm();
}
/** Souche : fixe dans l'espèce la résistance à une famille d'armes (Matrice, Mémoire du sang). */
export function adapt(c: GameClient, family: number): void {
  c.cmd(Ord.adapt(family));
  sfx.click();
}
export function toggleBuilding(c: GameClient): void {
  if (ui.selBuilding) c.cmd(Ord.toggle(ui.selBuilding.ref));
}
/** Part de la sortie de sa source prise par le bras sélectionné (%, 0 : automatique). */
/** Améliore le bâtiment sélectionné d'un niveau (extracteur). */
export function upgradeBuilding(c: GameClient): void {
  if (ui.selBuilding) {
    c.cmd(Ord.upgrade(ui.selBuilding.ref));
    sfx.confirm();
  }
}
/** Sorties du répartiteur sélectionné (0 : les trois, 1 : gauche et avant, 2 : droite et avant). */
export function setSplit(c: GameClient, mode: number): void {
  if (ui.selBuilding) c.cmd(Ord.setSplit(ui.selBuilding.ref, mode));
}
/** Cadence de la machine sélectionnée (10 à 250 %, par pas de 10 ; au-dessus de 100 %, des fragments d'énergie). */
export function setClock(c: GameClient, clock: number): void {
  if (ui.selBuilding) {
    c.cmd(Ord.setClock(ui.selBuilding.ref, clock));
    sfx.click();
  }
}
/** Rotation du bras sélectionné, en quarts de tour (1 : prend à droite, 2 : derrière, 3 : à gauche). */
/** Objets par voyage des véhicules qui partent de la gare sélectionnée (0 : automatique). */
export function setLot(c: GameClient, n: number): void {
  if (ui.selBuilding) c.cmd(Ord.setLot(ui.selBuilding.ref, n));
}
/** Vide une gare ou un héliport : son contenu retourne au stock. */
export function emptyStash(c: GameClient): void {
  if (ui.selBuilding) c.cmd(Ord.emptyStash(ui.selBuilding.ref));
}
export function setTurn(c: GameClient, quarters: number): void {
  if (ui.selBuilding) c.cmd(Ord.setTurn(ui.selBuilding.ref, quarters));
}
/** Objets remis en sortie par le dépôt amélioré sélectionné. */
export function setFilters(c: GameClient, items: number[]): void {
  if (ui.selBuilding) c.cmd(Ord.setFilters(ui.selBuilding.ref, items));
}
export function setShare(c: GameClient, pct: number): void {
  if (ui.selBuilding) c.cmd(Ord.setShare(ui.selBuilding.ref, pct));
}
export function cancelBuilding(c: GameClient): void {
  if (ui.selBuilding) c.cmd(Ord.cancel(ui.selBuilding.ref));
}

/**
 * Touche Suppr : le bâtiment sélectionné est démonté par nos constructeurs les plus proches (libres
 * d'abord) ; un chantier est annulé tout de suite. Avec des ingénieurs sélectionnés : recyclage en zone.
 */
export function demolishSelected(c: GameClient): void {
  if (ui.selPlan && !c.selected.size) {
    c.cancelPlan();
    return;
  }
  if (ui.selBuildings.length > 1) {
    // modules des Transhumants : repliés (ils ne se démolissent pas) ; le reste est démoli
    const fold = foldableSelection(c);
    if (fold.length) c.cmd(Ord.fold(fold));
    const rest = ui.selBuildings.filter((b) => b.owner === ui.me && !fold.includes(b.ref)).map((b) => b.ref);
    if (rest.length) demolishMany(c, rest);
    else if (fold.length) sfx.confirm();
    return;
  }
  if (ui.selBuilding && ui.selBuilding.owner === ui.me && c.data && foldable(c.data.buildings[ui.selBuilding.kind])) {
    packSelected(c);
    return;
  }
  const sb = ui.selBuilding;
  if (sb && sb.owner === ui.me) {
    const f = c.frame;
    let build = 65536;
    let cx = 0;
    let cy = 0;
    const d = c.data!.buildings[sb.kind];
    if (f) {
      for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
        if (f.buf[o] >>> 0 !== sb.ref) continue;
        build = f.buf[o + 4];
        const dir = (f.buf[o + 1] >> 16) & 3;
        cx = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
        cy = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
      }
    }
    if (build < 65536) {
      c.cmd(Ord.cancel(sb.ref));
      sfx.confirm();
      return;
    }
    const builders = ownBuilders(c).sort((a, b) => Number(!a.idle) - Number(!b.idle) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    if (!builders.length) {
      pushMessage("Aucun constructeur pour démonter ce bâtiment", "alert");
      sfx.error();
      return;
    }
    for (const b of builders.slice(0, 2)) c.cmd(Ord.target(O.RECLAIM, [b.id], sb.ref, !b.idle));
    c.scene?.addMarker(cx, cy, 0xffd060);
    sfx.confirm();
    return;
  }
  if (c.engineers().length) c.setMode("reclaim");
}

/** Nos constructeurs (ingénieurs et commandant) : position en cases, inactifs (sans ordre) ou non. */
export function ownBuilders(c: GameClient): { id: number; x: number; y: number; idle: boolean }[] {
  const f = c.frame;
  const out: { id: number; x: number; y: number; idle: boolean }[] = [];
  if (!f || !c.data) return out;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
    const w1 = f.buf[o + 1];
    if (((w1 >> 8) & 0xff) !== ui.me || !(c.data.units[w1 & 0xff]?.buildPower > 0)) continue;
    out.push({ id: f.buf[o] >>> 0, x: f.buf[o + 2] / TILE, y: f.buf[o + 3] / TILE, idle: (((w1 >>> 16) & 0xff) & UF.IDLE) !== 0 });
  }
  return out;
}

/**
 * Recyclage en zone (cadre à l'écran) : nos bâtiments (chantiers annulés directement) et les épaves.
 * Les cibles sont réparties entre les constructeurs sélectionnés (sinon les plus proches), chacun
 * enchaînant les plus proches de sa position précédente, avec une charge équilibrée.
 */
export async function reclaimArea(gc: GameClient, x0: number, y0: number, x1: number, y1: number, queue: boolean): Promise<void> {
  const sc = gc.scene;
  const f = gc.frame;
  if (!sc || !f || !gc.data || !gc.map) return;
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  const p = { x: 0, y: 0 };
  const inBox = (x: number, z: number) => sc.project(x, groundHeight(gc.map!, x, z) + 0.3, z, p) && p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by;
  const targets: { ref: number; x: number; y: number }[] = [];
  let cancelled = 0;
  // bâtiments à reconstruire (fantômes) du cadre : oubliés
  const corners = [gc.groundAt(ax, ay), gc.groundAt(bx, ay), gc.groundAt(ax, by), gc.groundAt(bx, by)].filter((c): c is NonNullable<typeof c> => !!c);
  if (corners.length) {
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    gc.cmd(Ord.cancelGhosts(Math.floor(Math.min(...xs)), Math.floor(Math.min(...zs)), Math.floor(Math.max(...xs)), Math.floor(Math.max(...zs))));
  }
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const w1 = f.buf[o + 1];
    if (((w1 >> 8) & 0xff) !== ui.me) continue;
    const d = gc.data.buildings[w1 & 0xff];
    const dir = (w1 >> 16) & 3;
    const x = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
    const y = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
    if (!inBox(x, y)) continue;
    if (f.buf[o + 4] < 65536) {
      gc.cmd(Ord.cancel(f.buf[o] >>> 0));
      cancelled++;
    } else targets.push({ ref: f.buf[o] >>> 0, x, y });
  }
  const wrecks: { x: number; y: number }[] = [];
  for (let i = 0, o = f.wreckOff; i < f.nWrecks; i++, o += WRECK_WORDS) {
    const x = f.buf[o] / TILE;
    const y = f.buf[o + 1] / TILE;
    if (inBox(x, y)) wrecks.push({ x, y });
  }
  for (const wk of wrecks.slice(0, 80)) {
    const ref = await gc.query<number>("wreckAt", [Math.round(wk.x * TILE), Math.round(wk.y * TILE)]);
    if (ref && !targets.some((t) => t.ref === ref)) targets.push({ ref, x: wk.x, y: wk.y });
  }
  if (!targets.length) {
    if (cancelled) sfx.confirm();
    else sfx.error();
    return;
  }
  assignReclaim(gc, targets, queue);
}

/** Démolit plusieurs de nos bâtiments : chantiers annulés tout de suite, les autres répartis entre les constructeurs. */
function demolishMany(c: GameClient, refs: number[]): void {
  const f = c.frame;
  if (!f || !c.data) return;
  const want = new Set(refs);
  const targets: { ref: number; x: number; y: number }[] = [];
  let cancelled = 0;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const ref = f.buf[o] >>> 0;
    if (!want.has(ref)) continue;
    const w1 = f.buf[o + 1];
    const d = c.data.buildings[w1 & 0xff];
    const dir = (w1 >> 16) & 3;
    const x = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
    const y = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
    if (f.buf[o + 4] < 65536) {
      c.cmd(Ord.cancel(ref));
      cancelled++;
    } else targets.push({ ref, x, y });
  }
  if (targets.length) assignReclaim(c, targets, false);
  else if (cancelled) sfx.confirm();
  else sfx.error();
}

/**
 * Répartit des cibles de recyclage entre les constructeurs sélectionnés (sinon les 3 plus proches) :
 * chacun enchaîne les plus proches de sa position précédente, avec une charge équilibrée.
 */
function assignReclaim(gc: GameClient, targets: { ref: number; x: number; y: number }[], queue: boolean): void {
  const sel = new Set(gc.engineers());
  let builders = ownBuilders(gc).filter((b) => sel.has(b.id));
  if (!builders.length) {
    // aucun ingénieur sélectionné : les 3 constructeurs les plus proches de la zone
    const cx = targets.reduce((s, t) => s + t.x, 0) / targets.length;
    const cy = targets.reduce((s, t) => s + t.y, 0) / targets.length;
    builders = ownBuilders(gc).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).slice(0, 3);
  }
  if (!builders.length) {
    pushMessage("Aucun constructeur pour recycler cette zone", "alert");
    sfx.error();
    return;
  }
  const plan = builders.map((b) => ({ id: b.id, x: b.x, y: b.y, list: [] as number[] }));
  const left = targets.slice(0, 300);
  while (left.length) {
    // le couple (constructeur, cible) le moins coûteux : trajet depuis sa dernière cible + charge
    let best = 0;
    let bi = 0;
    let bc = Infinity;
    for (let k = 0; k < plan.length; k++) {
      const pl = plan[k];
      for (let i = 0; i < left.length; i++) {
        const c = Math.hypot(left[i].x - pl.x, left[i].y - pl.y) + pl.list.length * 6;
        if (c < bc) {
          bc = c;
          best = i;
          bi = k;
        }
      }
    }
    const t = left.splice(best, 1)[0];
    const pl = plan[bi];
    pl.list.push(t.ref);
    pl.x = t.x;
    pl.y = t.y;
  }
  for (const pl of plan) pl.list.forEach((ref, i) => gc.cmd(Ord.target(O.RECLAIM, [pl.id], ref, queue || i > 0)));
  sfx.confirm();
  pushMessage(`Recyclage : ${targets.length} cible${targets.length > 1 ? "s" : ""}, ${plan.filter((p) => p.list.length).length} constructeur${plan.length > 1 ? "s" : ""}`, "info");
}

/** Gare ou héliport sélectionné : retire ses véhicules (relier le bâtiment à lui-même). */
export function removeCarriers(c: GameClient): void {
  const sb = ui.selBuilding;
  if (sb) c.cmd(Ord.special(sb.ref, 0, 0, sb.ref));
}
