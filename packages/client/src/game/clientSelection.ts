// Contrôleur de partie, sélection : clic, double-clic, cadre, unité ou bâtiment sous le curseur, constructions
// prévues, gisements, unités sélectionnées, constructeur inactif.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as THREE from "three/webgpu";
import * as Ord from "@supreme/shared/orders.ts";
import { UNIT_WORDS, BUILDING_WORDS, BClass } from "@supreme/shared";
import { groundHeight, HSCALE } from "../render/terrain.ts";
import { ui, pushMessage } from "./state.svelte.ts";
import { sfx } from "../audio/sound.ts";
import type { GameClient } from "./client.ts";
import { TILE } from "./clientConsts.ts";
import { ownBuilders } from "./clientBuildings.ts";

export function findBuilding(c: GameClient, ref: number): { ref: number; kind: number; owner: number; x: number; y: number } | null {
  const f = c.frame;
  if (!f) return null;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    if (f.buf[o] >>> 0 === ref) return { ref, kind: f.buf[o + 1] & 0xff, owner: (f.buf[o + 1] >> 8) & 0xff, x: f.buf[o + 2] & 0xffff, y: (f.buf[o + 2] >>> 16) & 0xffff };
  }
  return null;
}

export function buildingAtTile(c: GameClient, tx: number, tz: number): { ref: number; kind: number; owner: number; x: number; y: number; build: number; hp: number } | null {
  const f = c.frame;
  if (!f || !c.data) return null;
  // plusieurs niveaux sur une case (tapis surélevé au-dessus) : le plus haut d'abord
  let best: { ref: number; kind: number; owner: number; x: number; y: number; build: number; hp: number } | null = null;
  let bestFloor = -1;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const kind = f.buf[o + 1] & 0xff;
    const def = c.data.buildings[kind];
    const x = f.buf[o + 2] & 0xffff;
    const y = (f.buf[o + 2] >>> 16) & 0xffff;
    const floor = (f.buf[o + 1] >>> 28) & 3;
    if (tx >= x && tx < x + def.w && tz >= y && tz < y + def.h && floor > bestFloor) {
      best = { ref: f.buf[o] >>> 0, kind, owner: (f.buf[o + 1] >> 8) & 0xff, x, y, build: f.buf[o + 4], hp: f.buf[o + 3] };
      bestFloor = floor;
    }
  }
  return best;
}

export function teamOf(c: GameClient, p: number): number {
  return c.frame?.players[p]?.team ?? p;
}

/**
 * Constructeur inactif suivant (ingénieurs et commandant sans ordre : ni déplacement, construction,
 * réparation ni récolte), par identifiant croissant et en boucle ; Maj : le précédent. Centre la caméra.
 */
export function selectIdleEngineer(c: GameClient, back = false): void {
  if (ui.me < 0) return;
  const idle = ownBuilders(c).filter((b) => b.idle);
  if (!idle.length) {
    pushMessage("Aucun constructeur inactif");
    sfx.error();
    return;
  }
  idle.sort((a, b) => a.id - b.id);
  const last = c.lastIdleEngineer;
  if (back) idle.reverse();
  const next = idle.find((u) => (back ? u.id < last : u.id > last)) ?? idle[0];
  c.lastIdleEngineer = next.id;
  c.selected = new Set([next.id]);
  if (c.scene) {
    c.scene.target.x = next.x;
    c.scene.target.z = next.y;
  }
  sfx.click();
  c.updateUi();
}

// ---------- sélection ----------
export function ownedUnitAt(c: GameClient, x: number, y: number, anyOwner = false): { id: number; kind: number; owner: number } | null {
  const sc = c.scene;
  if (!sc) return null;
  // le clic touche l'unité n'importe où sur sa silhouette : segment écran du pied au sommet du
  // modèle, épaissi de sa demi-largeur (et de quelques pixels de tolérance) ; la plus proche gagne
  let best = null;
  let bd = Infinity;
  const foot = { x: 0, y: 0 };
  const top = { x: 0, y: 0 };
  const side = { x: 0, y: 0 };
  const right = new THREE.Vector3().setFromMatrixColumn(sc.camera.matrixWorld, 0);
  for (const u of sc.entities.screen) {
    // une unité qu'on ne voit pas ne se clique pas : hors du dessin de cette image, ou cachée par le relief
    if (!u.visible || !u.drawn) continue;
    if (!anyOwner && u.owner !== ui.me) continue;
    const km = sc.entities.unitMeshes[u.kind];
    const h = Math.max(0.4, km?.height ?? 0.8);
    const half = Math.max(0.35, (sc.entities.unitRadius(u.kind, u.id) * 2.3) / TILE / 2);
    if (!sc.project(u.x, u.y, u.z, foot) || !sc.project(u.x, u.y + h, u.z, top)) continue;
    sc.project(u.x + right.x * half, u.y + h / 2, u.z + right.z * half, side);
    const mid = { x: (foot.x + top.x) / 2, y: (foot.y + top.y) / 2 };
    const w = Math.max(6, Math.hypot(side.x - mid.x, side.y - mid.y));
    // distance du clic au segment pied-sommet
    const vx = top.x - foot.x;
    const vy = top.y - foot.y;
    const t = Math.max(0, Math.min(1, ((x - foot.x) * vx + (y - foot.y) * vy) / (vx * vx + vy * vy || 1)));
    const d = Math.hypot(x - (foot.x + vx * t), y - (foot.y + vy * t));
    if (d <= w + 5 && d < bd && !hiddenByTerrain(c, u.x, u.y + h / 2, u.z)) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/** Le relief s'interpose-t-il entre la caméra et ce point ? (échantillons le long du segment, jusqu'au plus haut sommet) */
function hiddenByTerrain(gc: GameClient, x: number, y: number, z: number): boolean {
  const sc = gc.scene;
  const m = gc.map;
  if (!sc || !m) return false;
  if (gc.maxGround < 0) {
    let top = 0;
    for (let i = 0; i < m.heights.length; i++) if (m.heights[i] > top) top = m.heights[i];
    gc.maxGround = top * HSCALE;
  }
  const c = sc.camera.position;
  const len = Math.hypot(c.x - x, c.y - y, c.z - z);
  if (len < 1) return false;
  // la première case autour de l'unité ne compte pas (pente sous ses pieds)
  for (let s = 1; s < len; s += 0.5) {
    const t = s / len;
    const py = y + (c.y - y) * t;
    if (py > gc.maxGround) break;
    if (groundHeight(m, x + (c.x - x) * t, z + (c.z - z) * t) > py + 0.2) return true;
  }
  return false;
}

export function clickSelect(c: GameClient, x: number, y: number, add: boolean, _ctrl: boolean): void {
  const u = ownedUnitAt(c, x, y, true);
  if (!add) c.selected.clear();
  if (u) {
    const now = performance.now();
    if (u.owner === ui.me && c.lastClick.id === u.id && now - c.lastClick.time < 350) {
      // double-clic : toutes les unités de ce type à l'écran
      const el = c.canvasEl!;
      const p = { x: 0, y: 0 };
      for (const v of c.scene!.entities.screen) {
        if (v.owner === ui.me && v.kind === u.kind && c.scene!.project(v.x, v.y, v.z, p) && p.x >= 0 && p.y >= 0 && p.x <= el.clientWidth && p.y <= el.clientHeight) c.selected.add(v.id);
      }
    } else if (add && c.selected.has(u.id)) c.selected.delete(u.id);
    else {
      // sélection homogène : des unités ou des bâtiments, pas les deux
      for (const id of [...c.selected]) if (Ord.isBuildingRef(id)) c.selected.delete(id);
      c.selected.add(u.id);
    }
    c.lastClick = { time: now, id: u.id };
    sfx.click();
  } else {
    const g = c.groundAt(x, y);
    if (g) {
      const b = c.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
      if (b) {
        const now = performance.now();
        if (!add) c.selected.clear();
        // plusieurs bâtiments (Maj+clic, double-clic, cadre) : la sélection n'a plus d'unités
        for (const id of [...c.selected]) if (!Ord.isBuildingRef(id)) c.selected.delete(id);
        if (!add && b.owner === ui.me && c.lastClick.id === b.ref && now - c.lastClick.time < 350 && c.data!.buildings[b.kind]?.cls === BClass.Belt) {
          // double-clic sur un tapis : tout son chemin, jusqu'aux tapis de contrôle (requête à la simulation)
          c.selected.add(b.ref);
          const click = now;
          void c.query<number[]>("beltPath", [b.ref]).then((refs) => {
            // sélection changée entre-temps (autre clic) : ne rien ajouter
            if (c.lastClick.time !== click || !c.selected.has(b.ref)) return;
            for (const r of refs ?? []) c.selected.add(r);
            c.updateUi();
          });
        } else if (!add && b.owner === ui.me && c.lastClick.id === b.ref && now - c.lastClick.time < 350) {
          // double-clic : tous nos bâtiments de ce type à l'écran
          const el = c.canvasEl!;
          for (const ref of ownBuildingsInRect(c, 0, 0, el.clientWidth, el.clientHeight, b.kind)) c.selected.add(ref);
        } else if (add && c.selected.has(b.ref)) c.selected.delete(b.ref);
        else c.selected.add(b.ref);
        c.lastClick = { time: now, id: b.ref };
        sfx.click();
      } else if (!add) {
        const tx = Math.floor(g.x);
        const tz = Math.floor(g.z);
        // construction prévue (fantôme) sous le curseur : sa fiche, d'où on peut l'annuler
        const pl = plannedAt(c, tx, tz);
        ui.selPlan = pl;
        c.scene?.overlay?.setPlanned(c.planned, pl);
        if (pl) {
          ui.selDeposit = null;
          sfx.click();
          c.updateUi();
          return;
        }
        // gisement (2 x 2 cases) sous le curseur : fiche du gisement
        const s = spotAt(c, tx, tz);
        ui.selDeposit = s ? { kind: s.kind, x: s.x, y: s.y, purity: s.purity } : null;
        if (s) sfx.click();
      }
    }
  }
  c.updateUi();
}

/** Construction prévue qui couvre la case (tx, tz) (et vérifie `ok`, si donné). */
export function plannedAt(c: GameClient, tx: number, tz: number, ok?: (kind: number, x: number, y: number) => boolean): { kind: number; x: number; y: number; dir: number } | null {
  const l = c.planned;
  for (let i = 0; i + 3 < l.length; i += 4) {
    const [kind, x, y, dir] = [l[i], l[i + 1], l[i + 2], l[i + 3]];
    const d = c.data?.buildings[kind];
    if (!d) continue;
    if (ok) {
      if (ok(kind, x, y)) return { kind, x, y, dir };
      continue;
    }
    const w = dir & 1 ? d.h : d.w;
    const h = dir & 1 ? d.w : d.h;
    if (tx >= x && tx < x + w && tz >= y && tz < y + h) return { kind, x, y, dir };
  }
  return null;
}
/** Annule la construction prévue sélectionnée (touche Suppr ou bouton de sa fiche). */
export function cancelPlan(c: GameClient): void {
  const p = ui.selPlan;
  if (!p) return;
  c.cmd(Ord.cancelPlan(p.x, p.y));
  ui.selPlan = null;
  c.scene?.overlay?.setPlanned(c.planned, null);
  sfx.confirm();
}

/** Bâtiment posé sur le gisement sélectionné (un extracteur), s'il y en a un. */
export function depositUser(c: GameClient): { kind: number; owner: number } | null {
  const d = ui.selDeposit;
  if (!d) return null;
  const b = c.buildingAtTile(d.x, d.y) ?? c.buildingAtTile(d.x + 1, d.y + 1);
  return b ? { kind: b.kind, owner: b.owner } : null;
}

export function boxSelect(c: GameClient, x0: number, y0: number, x1: number, y1: number, add: boolean): void {
  const sc = c.scene!;
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  if (!add) c.selected.clear();
  const p = { x: 0, y: 0 };
  let n = 0;
  const hits: number[][] = [];
  for (const u of sc.entities.screen) {
    if (u.owner !== ui.me) continue;
    if (!sc.project(u.x, u.y + 0.3, u.z, p)) continue;
    if (p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) hits.push([u.id, u.kind]);
  }
  // les œufs de la Souche, les tourelles et les remorques d'Arche ne reçoivent pas d'ordres : le cadre ne les prend que
  // s'il n'y a qu'eux
  const inert = (kind: number) => c.data!.units[kind].egg || c.data!.units[kind].turret || c.data!.units[kind].car;
  const eggsOnly = hits.every(([, kind]) => inert(kind));
  for (const [id, kind] of hits) {
    if (!eggsOnly && inert(kind)) continue;
    c.selected.add(id);
    n++;
  }
  if (n) {
    for (const id of [...c.selected]) if (Ord.isBuildingRef(id)) c.selected.delete(id);
  } else if (![...c.selected].some((id) => !Ord.isBuildingRef(id))) {
    // aucune unité dans le cadre : nos bâtiments (plusieurs : pause, repli des modules des Transhumants, démolition)
    for (const ref of ownBuildingsInRect(c, ax, ay, bx, by)) {
      c.selected.add(ref);
      n++;
    }
  }
  if (n) sfx.click();
  c.updateUi();
}

/** Nos bâtiments dont le centre est dans le rectangle d'écran (pixels), d'un type donné si `kind` est fourni. */
function ownBuildingsInRect(c: GameClient, ax: number, ay: number, bx: number, by: number, kind?: number): number[] {
  const sc = c.scene;
  const f = c.frame;
  const out: number[] = [];
  if (!sc || !f || !c.data || !c.map) return out;
  const p = { x: 0, y: 0 };
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const w1 = f.buf[o + 1];
    if (((w1 >> 8) & 0xff) !== ui.me || (kind !== undefined && (w1 & 0xff) !== kind)) continue;
    const d = c.data.buildings[w1 & 0xff];
    const dir = (w1 >> 16) & 3;
    const x = (f.buf[o + 2] & 0xffff) + (dir & 1 ? d.h : d.w) / 2;
    const z = ((f.buf[o + 2] >>> 16) & 0xffff) + (dir & 1 ? d.w : d.h) / 2;
    if (sc.project(x, groundHeight(c.map, x, z) + 0.3, z, p) && p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by) out.push(f.buf[o] >>> 0);
  }
  return out;
}

export function selectIds(c: GameClient, ids: number[]): void {
  c.selected = new Set(ids);
  c.updateUi();
}

export function selectAllArmy(c: GameClient): void {
  c.selected.clear();
  for (const u of c.scene?.entities.screen ?? []) {
    const d = c.data!.units[u.kind];
    if (u.owner === ui.me && d.buildPower === 0 && d.weapons.length > 0) c.selected.add(u.id);
  }
  c.updateUi();
}

/** Unités sélectionnées (positions en sous-unités, comme la simulation). */
export function selectedUnits(c: GameClient): { id: number; kind: number; x: number; y: number }[] {
  const f = c.frame;
  const out: { id: number; kind: number; x: number; y: number }[] = [];
  if (!f) return out;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
    const id = f.buf[o] >>> 0;
    if (c.selected.has(id) && ((f.buf[o + 1] >> 8) & 0xff) === ui.me) out.push({ id, kind: f.buf[o + 1] & 0xff, x: f.buf[o + 2], y: f.buf[o + 3] });
  }
  return out;
}
export function engineers(c: GameClient): number[] {
  return c.selectedUnits().filter((u) => c.data!.units[u.kind].buildPower > 0).map((u) => u.id);
}

/** Gisement (2 x 2 cases) qui couvre la case (tx, tz), s'il y en a un. */
export function spotAt(c: GameClient, tx: number, tz: number): { kind: number; x: number; y: number } | null {
  return c.map?.spots.find((p) => tx >= p.x && tx < p.x + 2 && tz >= p.y && tz < p.y + 2) ?? null;
}
