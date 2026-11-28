// Contrôleur de partie, vue : boucle d'affichage (rendu, zone vue envoyée au Worker, requêtes périodiques, cercles
// de portée), caméra (défilement, marque-pages, recentrage), conversion d'un point de l'écran en point du terrain.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import type * as THREE from "three/webgpu";
import { UNIT_WORDS, BUILDING_WORDS } from "@supreme/shared";
import type { PowerZones } from "@supreme/shared";
import { groundHeight } from "../render/terrain.ts";
import { ui, pushMessage, hasTechUI } from "./state.svelte.ts";
import { keymap, kb, keyOf } from "./keys.svelte.ts";
import { keyboardPan, type FocusLike } from "./heldKeys.ts";
import { buildingRanges, unitRanges, type Circle, type RangeKind } from "../render/ranges.ts";
import type { GameClient } from "./client.ts";
import { TILE } from "./clientConsts.ts";
import { queryZone, refreshUnitInfo, refreshGroupMods } from "./clientUiSync.ts";
import { plannedAt } from "./clientSelection.ts";
import { drawMinimap } from "./clientMinimap.ts";

// mode test : pas de rendu 3D (tests automatisés dans Chrome sans GPU)
const NORENDER = new URLSearchParams(location.search).has("norender");

// ---------- boucle d'affichage ----------
export function loop(gc: GameClient, now: number): void {
  requestAnimationFrame((t) => loop(gc, t));
  const sc = gc.scene;
  if (!sc || ui.screen !== "game") return;
  const dt = Math.min(0.1, (now - (gc.fpsTime || now)) / 1000);
  gc.fpsTime = now;
  gc.fpsCount++;
  panCamera(gc, dt);
  // en pause, l'image reste sur le dernier tick (et les effets se figent)
  const paused = gc.paused();
  const alpha = !gc.frame ? 0 : paused ? 1 : Math.min(1, ((performance.now() - gc.frameTime) * ui.speed) / 50);
  sc.paused = paused;
  const myTeam = gc.frame?.players[ui.me]?.team ?? -1;
  if (!NORENDER) sc.render(gc.frame, alpha, ui.me, myTeam, gc.selected, dt, ui.spectator, ui.fog);
  // zone vue envoyée au Worker
  const r = sc.viewRect();
  gc.worker?.postMessage({ type: "view", x0: Math.floor(r[0]), y0: Math.floor(r[1]), x1: Math.ceil(r[2]), y1: Math.ceil(r[3]), detail: sc.strategic ? 0 : sc.distance > 150 ? 1 : 2, player: ui.me });
  if (now - gc.lastUiUpdate > 250) {
    ui.fps = Math.round((gc.fpsCount * 1000) / (now - gc.lastUiUpdate || 1));
    if (ui.showPerf) ui.perf = { ...sc.stats, frameMs: gc.fpsCount ? (now - gc.lastUiUpdate) / gc.fpsCount : 0 };
    gc.fpsCount = 0;
    gc.lastUiUpdate = now;
    gc.updateUi();
    queryZone(gc, sc);
    if (!(ui.mode === "build" && gc.ghostCells.length)) gc.queryBuildReach(sc);
  }
  // Souche : herbe mangée, redemandée quand elle change (et de temps en temps : territoire découvert)
  const cover = sc.terreau;
  if (gc.frame && cover && (gc.frame.soilN > 0 || gc.soilSeen > 0)) {
    const fresh = gc.soilFor !== cover;
    const wait = fresh ? 0 : gc.frame.soilN !== gc.soilSeen ? 900 : 6000;
    if (now - gc.lastSoil > wait) {
      gc.lastSoil = now;
      gc.soilSeen = gc.frame.soilN;
      gc.soilFor = cover;
      void gc.query<Int32Array>("soil", [ui.spectator ? -1 : ui.me]).then((runs) => runs && gc.scene?.terreau === cover && cover.setSoil(runs));
    }
  }
  // zones électriques : vue électrique (touche maintenue) ou pose d'un bâtiment qui consomme ou alimente
  const pv = keymap.held("powerView", gc.keys);
  if (pv !== ui.powerView) ui.powerView = pv;
  const placing = ui.mode === "build" && ui.buildKind >= 0 ? gc.data?.buildings[ui.buildKind] : undefined;
  // Souche : tout organe se pose sur le terreau, montré comme les zones électriques
  const placingPower = !!placing && (placing.supply > 0 || placing.powerUse > 0 || (placing.race ?? 0) === 1);
  const showZones = pv || placingPower;
  // les zones servent aussi à la mini-carte et aux jauges : requête toutes les 2 s, toutes les 0,4 s affichées
  if (gc.frame && ui.me >= 0 && now - gc.lastZonesQuery > (showZones ? 400 : 2000)) {
    gc.lastZonesQuery = now;
    void gc.query<PowerZones | null>("powerZones", [ui.me]).then((z) => {
      if (!z || !gc.data) return;
      gc.zones = z;
      const data = gc.data;
      sc.power?.setZones(z, (kind) => data.buildings[kind]?.connect ?? 0, (x, zz) => (gc.map ? groundHeight(gc.map, x, zz) : 0));
      if (sc.power) ui.powerNets = sc.power.nets;
      if (sc.entities) {
        const g = new Map<number, { f: number; low: boolean }>();
        const autonomy = new Map<number, number>();
        for (const n of z.nets) autonomy.set(n[0], n[7]);
        for (const q of z.poles) if (q[6] === 1) g.set(q[9] >>> 0, { f: q[7] / 1000, low: q[7] <= 0 || (q[5] > 0 && (autonomy.get(q[5]) ?? -1) >= 0 && (autonomy.get(q[5]) ?? 0) < 60) });
        sc.entities.fuelGauges = g;
      }
    });
  }
  if (showZones && sc.power && gc.frame) {
    const preview = placing && placing.supply > 0 ? gc.ghostCells.map((c) => ({ x: c.x, y: c.y, w: c.dir & 1 ? placing.h : placing.w, h: c.dir & 1 ? placing.w : placing.h, s: placing.supply })) : [];
    sc.power.show(preview, pv);
    gc.lastPowerShow = now;
  } else if (gc.lastPowerShow) {
    gc.lastPowerShow = 0;
    sc.power?.hide();
  }
  // vue logistique : tant que la touche est maintenue
  const logi = keymap.held("logisticsView", gc.keys);
  if (logi !== ui.logisticsView) ui.logisticsView = logi;
  if (sc.entities) sc.entities.logistics = logi;
  // points de vie de l'unité sélectionnée seule
  if (ui.unitInfo && now - gc.unitInfoAt > 400) refreshUnitInfo(gc);
  if (ui.groupMods && now - gc.groupModsAt > 400) refreshGroupMods(gc);
  // curseur : les unités bougent sous une souris immobile, la sélection change
  if (now - gc.cursorAt > 150) gc.updateCursor();
  // ordres affichés avec Maj (unités sélectionnées) ; constructions prévues de nos bâtisseurs
  const shift = gc.keys.has("ShiftLeft") || gc.keys.has("ShiftRight");
  // ordres des seules unités qui nous appartiennent (jamais ceux d'un ennemi sélectionné)
  // chariots de convoi sélectionnés : leur navette ou leur collecte est toujours tracée (du foyer au bâtiment desservi)
  const cartGroup = !shift && gc.selOwn.size > 0 && ui.me >= 0 ? ui.selUnits.find((g) => gc.data?.units[g.kind]?.key === "t_cart") : undefined;
  sc.showOrders = (shift && gc.selOwn.size > 0) || !!cartGroup;
  if (sc.showOrders && now - gc.lastOrdersQuery > 250) {
    gc.lastOrdersQuery = now;
    const ids = (shift ? [...gc.selOwn] : cartGroup!.ids).slice(0, 400);
    void gc.query<Int32Array | null>("orders", ids).then((r) => sc.overlay?.setOrders(r));
  }
  if (ui.me >= 0 && !ui.spectator && now - gc.lastPlannedQuery > 500) {
    gc.lastPlannedQuery = now;
    void gc.query<number[] | null>("researchQueue", [ui.me]).then((r) => {
      const q = r ?? [];
      // juste après une modification locale, la simulation n'a pas encore exécuté les ordres
      if (performance.now() - gc.researchEdit < 2000) return;
      if (q.length !== ui.researchQueue.length || q.some((x, i) => x !== ui.researchQueue[i])) ui.researchQueue = q;
    });
    void gc.query<Int32Array | null>("planned", [ui.me]).then((r) => {
      gc.planned = r ?? [];
      // fantôme sélectionné disparu (chantier posé, annulé…) : fiche refermée
      const p = ui.selPlan;
      if (p && !plannedAt(gc, p.x, p.y, (k, x, y) => k === p.kind && x === p.x && y === p.y)) ui.selPlan = null;
      sc.overlay?.setPlanned(gc.planned, ui.selPlan);
    });
  }
  sc.rangeCircles = ui.gfx.ranges === false ? null : selectionRanges(gc, now);
  if (now - gc.lastMinimap > (sc.pings?.list.length ? 80 : 200)) {
    gc.lastMinimap = now;
    drawMinimap(gc);
  }
}

/** Cercles de portée de la sélection : positions affichées (interpolées) des unités, centres des bâtiments. */
function selectionRanges(c: GameClient, now: number): Record<RangeKind, Circle[]> | null {
  const data = c.data;
  const f = c.frame;
  const ent = c.scene?.entities;
  if (!data || !f || !ent || !c.selected.size) return null;
  const out: Record<RangeKind, Circle[]> = { ground: [], air: [], sub: [], min: [], radar: [] };
  const put = (r: Partial<Record<RangeKind, number>>, x: number, z: number) => {
    for (const k in r) out[k as RangeKind].push({ x, z, r: r[k as RangeKind]! });
  };
  // améliorations des Transhumants installées sur une unité ou un module
  const modsOf = (ref: number) => (ent.modViews.get(ref)?.mods ?? []).filter((m) => m > 0).map((m) => data.mods[m]);
  const byKind = new Map<number, Partial<Record<RangeKind, number>>>();
  for (const u of ent.screen) {
    if (!c.selected.has(u.id)) continue;
    const fit = modsOf(u.id);
    if (fit.length) {
      put(unitRanges(data.units[u.kind], data.weapons, -1, fit), u.x, u.z);
      continue;
    }
    let r = byKind.get(u.kind);
    if (!r) {
      const d = data.units[u.kind];
      // canon renforcé (recherche 34) : il remplace le canon du robot de commandement
      r = unitRanges(d, data.weapons, d.key === "commander" && u.owner === ui.me && hasTechUI(34) ? 1 : -1);
      byKind.set(u.kind, r);
    }
    put(r, u.x, u.z);
  }
  // bâtiments : relus quatre fois par seconde (ils ne bougent pas)
  const refs = new Set(ui.selBuildings.map((b) => b.ref));
  const key = [...refs].join();
  const cache = c.rangeBuildings;
  if (key !== cache.key || (refs.size && now - cache.at > 250)) {
    const list: { ref: number; kind: number; x: number; z: number }[] = [];
    if (refs.size) {
      for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
        if (!refs.has(f.buf[o] >>> 0)) continue;
        const kind = f.buf[o + 1] & 0xff;
        const d = data.buildings[kind];
        list.push({ ref: f.buf[o] >>> 0, kind, x: (f.buf[o + 2] & 0xffff) + d.w / 2, z: (f.buf[o + 2] >>> 16) + d.h / 2 });
      }
    }
    // vue stratégique : les bâtiments peuvent manquer à l'image, on garde les derniers connus
    if (key !== cache.key || list.length) c.rangeBuildings = { at: now, key, list };
    else cache.at = now;
  }
  for (const b of c.rangeBuildings.list) put(buildingRanges(data.buildings[b.kind], data.weapons, modsOf(b.ref)), b.x, b.z);
  return out;
}

function panCamera(gc: GameClient, dt: number): void {
  const sc = gc.scene!;
  const speed = sc.distance * 1.4 * dt;
  // le clavier n'est coupé que par le focus dans un champ de saisie (pas par la boîte de discussion
  // restée ouverte sans le focus, ni par un menu) ou par l'écran « Raccourcis » qui attend une touche
  let [dx, dz] = keyboardPan(gc.keys, keymap, { focus: document.activeElement as FocusLike | null, capturing: kb.capturing });
  const el = gc.canvasEl!;
  if (gc.mouse.inside && document.hasFocus() && !gc.mouse.down) {
    const m = 6;
    if (gc.mouse.x < m) dx -= 1;
    if (gc.mouse.x > el.clientWidth - m) dx += 1;
    if (gc.mouse.y < m) dz -= 1;
    if (gc.mouse.y > el.clientHeight - m) dz += 1;
  }
  if (dx || dz) {
    const c = Math.cos(sc.yaw);
    const s = Math.sin(sc.yaw);
    sc.target.x += (dx * c + dz * s) * speed;
    sc.target.z += (-dx * s + dz * c) * speed;
  }
}

function ndc(c: GameClient, x: number, y: number): [number, number] {
  const el = c.canvasEl!;
  return [(x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1];
}
export function groundAt(c: GameClient, x: number, y: number): THREE.Vector3 | null {
  const [nx, ny] = ndc(c, x, y);
  return c.scene?.pickGround(nx, ny) ?? null;
}

export function localXY(c: GameClient, e: PointerEvent | WheelEvent): [number, number] {
  const r = c.canvasEl!.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

export function saveBookmark(c: GameClient, i: number): void {
  const sc = c.scene;
  if (!sc) return;
  c.bookmarks[i] = { x: sc.target.x, z: sc.target.z, distance: sc.distance };
  pushMessage(`Marque-page ${i + 1} enregistré (${keyOf(`camGo${i + 1}`) || "touche libre"} pour y revenir)`, "good");
}
export function recallBookmark(c: GameClient, i: number): void {
  const b = c.bookmarks[i];
  const sc = c.scene;
  if (!sc) return;
  if (!b) {
    const k = keyOf(`camSave${i + 1}`);
    pushMessage(`Marque-page ${i + 1} vide${k ? ` (${k} pour l'enregistrer)` : ""}`);
    return;
  }
  sc.target.x = b.x;
  sc.target.z = b.z;
  sc.distance = b.distance;
  sc.clampCamera();
}

export function centerOnCommander(c: GameClient): void {
  const f = c.frame;
  const me = f?.players[ui.me];
  if (!f || !me || !c.scene) return;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
    if (f.buf[o] >>> 0 === me.commander) {
      c.scene.target.x = f.buf[o + 2] / TILE;
      c.scene.target.z = f.buf[o + 3] / TILE;
      return;
    }
  }
}

export function centerOnSelection(c: GameClient): void {
  const pts = c.selectedUnits();
  if (!pts.length || !c.scene) return;
  c.scene.target.x = pts.reduce((s, u) => s + u.x, 0) / pts.length / TILE;
  c.scene.target.z = pts.reduce((s, u) => s + u.y, 0) / pts.length / TILE;
}
