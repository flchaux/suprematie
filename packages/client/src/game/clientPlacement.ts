// Contrôleur de partie, pose : mode construction (fantôme, files de tapis, rails et murs, niveaux, jumelages, coût),
// pose des bâtiments, placement d'un module de chenillard et des poteaux d'un générateur nomade.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import type * as THREE from "three/webgpu";
import * as Ord from "@supreme/shared/orders.ts";
import { BUILDING_WORDS, BClass } from "@supreme/shared";
import { ui, pushMessage } from "./state.svelte.ts";
import { sfx } from "../audio/sound.ts";
import { isMachine, machineRow } from "./machineRow.ts";
import * as Belts from "./belts.ts";
import { shortCells } from "./reach.ts";
import type { GameClient } from "./client.ts";
import { TILE } from "./clientConsts.ts";
import { reachStock } from "./clientUiSync.ts";

/** Mode placement du déploiement : le fantôme du module du premier chenillard suit la souris. */
export function startDeploy(c: GameClient, list: { id: number; kind: number }[]): void {
  if (ui.mode === "copy" || ui.mode === "paste") c.cancelMode();
  c.poleGen = null;
  c.deployUnits = list;
  ui.buildKind = c.data!.units[list[0].kind].deploys;
  ui.mode = "build";
  resetLine(c);
  c.beltForced = false;
  sfx.click();
  c.updateGhost();
  const more = list.length > 1 ? ` · Maj+clic : placer ensuite les ${list.length - 1} autres` : "";
  pushMessage(`${c.data!.units[list[0].kind].name} : choisissez l'emplacement et le sens du module (R pour tourner), clic pour le déployer${more}`, "info");
}

/** Clic en mode placement du déploiement : le chenillard roule jusqu'au module fantôme et s'y déploie. */
export function placeDeploy(gc: GameClient, shift: boolean): void {
  const cur = gc.deployUnits[0];
  const c = gc.ghostCells[0];
  if (!cur || !c || !c.ok) {
    const def = gc.data!.buildings[ui.buildKind];
    pushMessage(`Pas la place de déployer ici${def?.deposit ? " : la foreuse se pose sur un gisement libre" : " : terrain plat et libre"}`, "alert");
    sfx.error();
    return;
  }
  const def = gc.data!.buildings[ui.buildKind];
  const w = c.dir & 1 ? def.h : def.w;
  const h = c.dir & 1 ? def.w : def.h;
  gc.cmd(Ord.deployAt([cur.id], Math.round((c.x + w / 2) * TILE), Math.round((c.y + h / 2) * TILE), false, c.dir));
  gc.scene?.addMarker(c.x + w / 2, c.y + h / 2, 0xff9a3c);
  sfx.confirm();
  const rest = gc.deployUnits.slice(1);
  if (shift && rest.length) startDeploy(gc, rest);
  else gc.cancelMode();
}

/** Transhumants : le générateur sélectionné plante ses poteaux relais (fantôme du poteau, clic pour le planter). */
export function startPole(c: GameClient): void {
  const info = ui.buildingInfo as Record<string, any> | null;
  const sel = ui.selBuildings.find((b) => b.owner === ui.me && c.data?.buildings[b.kind].key === "t_generator");
  const kind = c.data?.buildings.findIndex((b) => b.key === "t_pole") ?? -1;
  if (!sel || !info?.transh?.poles || kind < 0) return;
  if (ui.mode === "copy" || ui.mode === "paste") c.cancelMode();
  c.deployUnits = [];
  const t = info.transh;
  c.poleGen = { ref: sel.ref, cx: t.at[0] + 1, cy: t.at[1] + 1, poles: [...t.poles], reach: t.poleReach, max: t.polesMax };
  if (c.poleGen.poles.length >= c.poleGen.max) {
    pushMessage(`Ce générateur a déjà planté ses ${c.poleGen.max} poteaux : repliez-en un ou plantez avec un autre générateur`, "alert");
    sfx.error();
    c.poleGen = null;
    return;
  }
  ui.buildKind = kind;
  ui.mode = "build";
  resetLine(c);
  c.beltForced = false;
  sfx.click();
  c.updateGhost();
  pushMessage(`Planter un poteau : à ${t.poleReach} cases au plus du générateur ou d'un de ses poteaux (${c.poleGen.max - c.poleGen.poles.length} restants) · Maj+clic : en planter d'autres`, "info");
}

/** case (x, y) à portée du générateur qui plante ou d'un de ses poteaux (règle de transhumants::pole_in_reach) */
function poleInReach(c: GameClient, x: number, y: number): boolean {
  const g = c.poleGen;
  if (!g) return true;
  const r2 = g.reach * g.reach;
  const near = (cx: number, cy: number) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2;
  return near(g.cx, g.cy) || g.poles.some(([px, py]) => near(px + 0.5, py + 0.5));
}

/** Clic en mode placement des poteaux : le générateur plante le poteau du fantôme. */
export function placePole(gc: GameClient, shift: boolean): void {
  const g = gc.poleGen;
  const c = gc.ghostCells[0];
  if (!g || !c || !c.ok) {
    pushMessage(c && !poleInReach(gc, c.x, c.y) ? `Trop loin : un poteau se plante à ${g?.reach ?? 0} cases au plus du générateur ou d'un de ses poteaux` : "Pas la place de planter un poteau ici", "alert");
    sfx.error();
    return;
  }
  gc.cmd(Ord.plantPole(g.ref, c.x, c.y));
  g.poles.push([c.x, c.y]);
  gc.scene?.addMarker(c.x + 0.5, c.y + 0.5, 0xff9a3c);
  sfx.confirm();
  if (shift && g.poles.length < g.max) gc.updateGhost();
  else gc.cancelMode();
}

// ---------- placement des bâtiments ----------
export function startBuild(c: GameClient, kind: number): void {
  if (ui.mode === "copy" || ui.mode === "paste") c.cancelMode();
  c.deployUnits = [];
  c.poleGen = null;
  ui.buildKind = kind;
  ui.mode = "build";
  resetLine(c);
  c.beltForced = false;
  sfx.click();
  c.updateGhost();
}

export function snapBuild(c: GameClient, g: THREE.Vector3): { x: number; y: number } {
  const def = c.data!.buildings[ui.buildKind];
  let x = Math.round(g.x - def.w / 2);
  let y = Math.round(g.z - def.h / 2);
  if (def.deposit !== 0 && c.map) {
    // aligner sur le gisement le plus proche
    let best = null;
    let bd = 6;
    for (const s of c.map.spots) {
      if (def.deposit !== 255 && s.kind !== def.deposit) continue;
      const d = Math.hypot(s.x + 1 - g.x, s.y + 1 - g.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best) {
      x = best.x - Math.floor((def.w - 2) / 2);
      y = best.y - Math.floor((def.h - 2) / 2);
    }
  }
  return { x, y };
}

/** File en L de `a` à `b` : premier tronçon horizontal si `horizFirst` (axe choisi par le geste, Belts.lockAxis). */
function lineCells(c: GameClient, a: { x: number; y: number }, b: { x: number; y: number }, horizFirst: boolean): { x: number; y: number; dir: number }[] {
  const def = c.data!.buildings[ui.buildKind];
  // racines de la Souche : une file continue, case par case, orientée dans le sens du tracé (comme un
  // tapis) ; elles se relient par contact
  const isRoot = def.key === "root";
  const step = def.cls === BClass.Pylon && (def.race ?? 0) !== 1 ? 7 : def.w;
  const out: { x: number; y: number; dir: number }[] = [];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const hdir = sx > 0 ? 0 : 2;
  const vdir = sy > 0 ? 1 : 3;
  const isBelt = def.cls === BClass.Belt;
  // rails : orientés dans le sens de leur segment (la voie se relie par simple contact ; la direction
  // ne sert qu'au modèle : direction 0, rails selon x ; direction 1, rails selon z)
  const isRail = def.cls === BClass.Rail;
  const along = (dir: number, horiz: boolean) => (isBelt || isRoot ? dir : isRail ? (horiz ? 0 : 1) : ui.buildDir);
  if (horizFirst) {
    for (let i = 0; i <= Math.abs(dx); i += step) out.push({ x: a.x + i * sx, y: a.y, dir: along(dy !== 0 && i === Math.abs(dx) ? vdir : hdir, dx !== 0 || dy === 0) });
    for (let j = step; j <= Math.abs(dy); j += step) out.push({ x: b.x, y: a.y + j * sy, dir: along(vdir, false) });
  } else {
    for (let j = 0; j <= Math.abs(dy); j += step) out.push({ x: a.x, y: a.y + j * sy, dir: along(dx !== 0 && j === Math.abs(dy) ? hdir : vdir, false) });
    for (let i = step; i <= Math.abs(dx); i += step) out.push({ x: a.x + i * sx, y: b.y, dir: along(hdir, true) });
  }
  return out.slice(0, 200);
}

/** Fin du tracé d'une file : la prochaine repart de zéro, au sol. */
export function resetLine(c: GameClient): void {
  c.ghostStart = null;
  c.lineFrozen = [];
  c.lineAxis = null;
  c.lineEndDir = null;
  ui.buildFloor = 0;
}

export function isBeltKind(c: GameClient): boolean {
  return c.data?.buildings[ui.buildKind]?.cls === BClass.Belt;
}
/** Pose logistique (tapis, tapis de contrôle, bras) : elle peut remplacer nos tapis existants. */
/** Toute pose du joueur peut remplacer ses tapis (un bâtiment posé dessus les démonte). */
function replaceFlag(c: GameClient): number {
  return ui.buildKind >= 0 ? 4 : 0;
}
/** Tapis complets visibles (toutes équipes) : case -> { direction, propriétaire }. */
function beltTiles(c: GameClient): Map<number, { dir: number; owner: number }> {
  const m = new Map<number, { dir: number; owner: number }>();
  const f = c.frame;
  if (!f || !c.data || !c.map) return m;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const kind = f.buf[o + 1] & 0xff;
    if (c.data.buildings[kind]?.cls !== BClass.Belt || f.buf[o + 4] < 65536) continue;
    if ((f.buf[o + 1] >>> 28) & 3) continue; // tapis surélevé
    const x = f.buf[o + 2] & 0xffff;
    const y = (f.buf[o + 2] >>> 16) & 0xffff;
    m.set(y * c.map.w + x, { dir: (f.buf[o + 1] >> 16) & 3, owner: (f.buf[o + 1] >> 8) & 0xff });
  }
  return m;
}
/** Répartiteurs terminés : case -> direction, sorties (masque de directions) et propriétaire. */
function splitterTiles(c: GameClient): Map<number, { dir: number; outs: number; owner: number }> {
  const m = new Map<number, { dir: number; outs: number; owner: number }>();
  const f = c.frame;
  if (!f || !c.data || !c.map) return m;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    if (c.data.buildings[f.buf[o + 1] & 0xff]?.key !== "splitter" || f.buf[o + 4] < 65536) continue;
    const dir = (f.buf[o + 1] >> 16) & 3;
    const x = f.buf[o + 2] & 0xffff;
    const y = (f.buf[o + 2] >>> 16) & 0xffff;
    m.set(y * c.map.w + x, { dir, outs: Belts.splitterOuts(dir, (f.buf[o + 5] >>> 24) & 3), owner: (f.buf[o + 1] >> 8) & 0xff });
  }
  return m;
}
/** Voisins « tapis » (tapis et répartiteurs ; seulement les nôtres si `mine`) pour belts.ts. */
function beltNeighbours(c: GameClient, belts: Map<number, { dir: number; owner: number }>, splitters: Map<number, { dir: number; outs: number; owner: number }>, mine: boolean): Belts.BeltNeighbours {
  const W = c.map!.w;
  const H = c.map!.h;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  return {
    belt: (x, y) => {
      const b = inside(x, y) ? belts.get(y * W + x) : undefined;
      return b && (!mine || b.owner === ui.me) ? b.dir : undefined;
    },
    // un tapis (posé ou en cours de pose) sur la case l'emporte
    splitter: (x, y) => {
      if (!inside(x, y) || belts.has(y * W + x)) return 0;
      const s = splitters.get(y * W + x);
      return s && (!mine || s.owner === ui.me) ? s.outs : 0;
    },
  };
}

export async function updateGhost(gc: GameClient): Promise<void> {
  if (ui.mode !== "build" || ui.buildKind < 0 || !gc.scene || !gc.data) return;
  const g = gc.groundAt(gc.mouse.x, gc.mouse.y);
  if (!g) return;
  const def = gc.data.buildings[ui.buildKind];
  const cur = snapBuild(gc, g);
  // machines qui peuvent se jumeler : une rangée se pose en glissant
  const machine = isMachine(def.cls);
  // placement d'un module de chenillard : un seul fantôme, pas de file
  const lineable = !gc.deployUnits.length && !gc.poleGen && (def.cls === BClass.Belt || def.cls === BClass.Rail || def.cls === BClass.Wall || (def.cls === BClass.Pylon && def.key !== "rhizome") || machine);
  const isBelt = def.cls === BClass.Belt;
  const belts = isBelt ? beltTiles(gc) : new Map<number, { dir: number; owner: number }>();
  const splitters = isBelt ? splitterTiles(gc) : new Map<number, { dir: number; outs: number; owner: number }>();
  // direction automatique d'un tapis posé seul : il prolonge ce qui débouche sur sa case, ou alimente un voisin
  const autoDir = (x: number, y: number) => {
    const s = (sx: number, sy: number) => {
      const e = gc.map && sx >= 0 && sy >= 0 ? splitters.get(sy * gc.map.w + sx) : undefined;
      return e && e.owner === ui.me ? e.dir : undefined;
    };
    return Belts.autoBeltDir(x, y, beltNeighbours(gc, belts, splitters, true), s, ui.buildDir);
  };
  // file : partie figée (changements de niveau) puis tronçon en cours, de sa dernière case au curseur ; le
  // sens de l'angle suit le geste (axe le long duquel le curseur a quitté le départ du tronçon)
  const drawing = gc.mouse.down && gc.ghostStart && lineable;
  const frozen = drawing && isBelt ? gc.lineFrozen : [];
  const nf = frozen.length;
  let cells: { x: number; y: number; dir: number }[];
  if (drawing && machine) cells = machineRow(gc.ghostStart!, cur, def, ui.buildDir);
  else if (drawing) {
    const segStart = nf ? frozen[nf - 1] : gc.ghostStart!;
    gc.lineAxis = Belts.lockAxis(segStart, cur, gc.lineAxis);
    const dx = Math.abs(cur.x - segStart.x);
    const dy = Math.abs(cur.y - segStart.y);
    cells = Belts.joinSegment(frozen, lineCells(gc, segStart, cur, gc.lineAxis ? gc.lineAxis === "h" : dx >= dy));
    // fin de file tournée avec R pendant le tracé
    if (isBelt && gc.lineEndDir !== null && cells.length > Math.max(1, nf)) cells[cells.length - 1].dir = gc.lineEndDir;
  } else cells = [{ ...cur, dir: isBelt && !gc.beltForced ? autoDir(cur.x, cur.y) : ui.buildDir }];
  /** un de nos tapis au sol sur la case, perpendiculaire à la direction `dir` */
  const across = (c: { x: number; y: number; dir: number }): boolean => {
    const e = gc.map ? belts.get(c.y * gc.map.w + c.x) : undefined;
    return !!e && e.owner === ui.me && (e.dir & 1) !== (c.dir & 1);
  };
  // file qui finit en travers d'un de nos tapis : on veut s'y brancher (la file s'arrête juste avant
  // et le nourrit par le côté), pas l'enjamber ni le tourner ; sauf si sa fin a été tournée avec R
  if (isBelt && ui.buildFloor === 0 && cells.length > Math.max(1, nf) && gc.lineEndDir === null && across(cells[cells.length - 1])) cells.pop();
  const seq = ++gc.ghostSeq;
  const rf = replaceFlag(gc);
  const base = isBelt ? ui.buildFloor : 0;
  // pose possible de chaque case à un niveau donné
  const canAt = async (floor: number): Promise<boolean[]> => {
    const args = [ui.me, ui.buildKind];
    for (const c of cells) args.push(c.x, c.y, c.dir | rf | ((floor & 3) << 3));
    return (await gc.query<boolean[]>("canPlaceMany", args)) ?? [];
  };
  let floors = cells.map(() => base);
  let okAt = await canAt(base);
  if (isBelt) {
    // file de tapis : la partie figée garde ses niveaux ; le tronçon en cours part du niveau choisi et
    // monte de lui-même au-dessus des obstacles (bâtiment, eau, falaise, autre file qui la croise) ; les
    // ascenseurs se forment aux changements de niveau
    const at: boolean[][] = [];
    for (let f = 0; f <= 2; f++) at.push(f === base ? okAt : cells.length > 1 && (f > base || frozen.some((c) => c.floor === f)) ? await canAt(f) : cells.map(() => false));
    // un de nos tapis au sol qui croise la file (perpendiculaire) : on passe au-dessus au lieu de le
    // tourner ; sauf la case de départ : partir d'un tapis, c'est le prolonger en faisant un angle
    const crossing = cells.map((c, i) => i > 0 && across(c));
    const r = Belts.lineFloors(cells, Math.min(nf, cells.length), frozen.map((c) => c.floor), base, at, crossing);
    floors = r.floors;
    okAt = r.ok;
  }
  // jumelages qui se formeront : règle de la simulation, avec la recette que prendra chaque machine
  // (générateurs : combustible partagé avec les générateurs collés)
  let twins: number[] = [];
  if (machine || def.cls === BClass.Power) {
    const args = [ui.me, ui.buildKind];
    for (const c of cells) args.push(c.x, c.y, c.dir | rf);
    twins = (await gc.query<number[] | null>("twinPreview", args)) ?? [];
  }
  // matériaux : disponible à portée du lieu (stocks à moins de 30 cases, réseau des relais, soutes des
  // constructeurs choisis) ; les cases de la file qu'il ne couvre plus (coût cumulé) sont ambre
  const reach = def.cost.length && ui.race === 0 ? await reachStock(gc, cur.x + (def.w >> 1), cur.y + (def.h >> 1), gc.data.depot?.near ?? 30, gc.engineers()) : null;
  // frondaison, racine-puits : l'herbe qu'elle aura à manger autour d'elle
  let grass: typeof ui.grass = null;
  let grassR = 0;
  if (def.key === "leaves" || def.key === "taproot") {
    const v = (await gc.query<number[]>("soilPreview", [ui.buildKind, cells[0].x, cells[0].y])) ?? [];
    if (v.length === 6) {
      grass = { left: v[0], total: v[1], secs: v[2], share: v[4], rate: v[5] };
      grassR = v[3] + 0.5;
    }
  }
  // racines et rhizomes de la Souche : leur coût monte avec la distance à la graine-mère
  const farPriced = (def.race ?? 0) === 1 && def.supply > 0 && def.key !== "seed_heart";
  let lineCost: typeof ui.lineCost = null;
  if (farPriced) {
    const args = [ui.me, ui.buildKind];
    cells.forEach((c, i) => okAt[i] && args.push(c.x, c.y, c.dir));
    const v = (await gc.query<number[]>("lineCost", args)) ?? [];
    const cost: [number, number][] = [];
    for (let i = 1; i + 1 < v.length; i += 2) cost.push([v[i], v[i + 1]]);
    lineCost = args.length > 2 ? { n: (args.length - 2) / 3, cost, pct: v[0] ?? 0 } : null;
  }
  if (seq !== gc.ghostSeq || ui.mode !== "build") return;
  ui.lineCost = lineCost;
  ui.grass = grass;
  if (reach) {
    ui.buildReach = reach;
    ui.buildReachAt = "cursor";
  }
  gc.scene.ghostLift = 0;
  // poteaux d'un générateur nomade : à portée de lui ou d'un de ses poteaux
  if (gc.poleGen) okAt = okAt.map((ok, i) => ok && poleInReach(gc, cells[i].x, cells[i].y));
  const short = shortCells(reach, def.cost, cells.map((_, i) => !!okAt[i]));
  gc.ghostCells = cells.map((c, i) => ({ ...c, ok: !!okAt[i], floor: isBelt ? floors[i] : 0, twins: twins[i] ?? 0, short: short[i] }));
  // aperçu des virages : forme d'après les tapis existants et les autres tapis en cours de pose
  if (isBelt && gc.map) {
    for (const c of gc.ghostCells) belts.set(c.y * gc.map.w + c.x, { dir: c.dir, owner: ui.me });
    const n = beltNeighbours(gc, belts, splitters, false);
    gc.scene.setGhost(ui.buildKind, gc.ghostCells.map((c) => ({ ...c, shape: Belts.beltShape(c.x, c.y, c.dir, n) })));
  } else if (gc.data?.buildings[ui.buildKind]?.key === "splitter") {
    gc.scene.setGhost(ui.buildKind, gc.ghostCells.map((c) => ({ ...c, shape: ui.buildSplit })));
  } else gc.scene.setGhost(ui.buildKind, gc.ghostCells);
  const wpn = def.weapon >= 0 ? gc.data.weapons[def.weapon] : null;
  // portée : arme, radar, bouclier ; relais logistique : sa zone (dépôts du réseau, destinations servies)
  const relayR = def.cls === BClass.Relay ? (gc.data.depot?.relayRange ?? 0) : 0;
  gc.scene.showRange(cur.x + def.w / 2, cur.y + def.h / 2, wpn ? wpn.range : def.radar || def.shieldR || relayR || grassR);
}

export function placeBuildings(gc: GameClient, shift: boolean): void {
  const engs = gc.engineers();
  if (!engs.length) {
    pushMessage("Sélectionnez un ingénieur ou le robot de commandement", "alert");
    sfx.error();
    return;
  }
  const cells = gc.ghostCells.filter((c) => c.ok);
  if (!cells.length) {
    sfx.error();
    return;
  }
  const rf = replaceFlag(gc);
  // niveau propre à chaque case (montée automatique au-dessus des obstacles)
  // répartiteur : ses sorties dans les bits 5-6 de la direction
  const split = gc.data?.buildings[ui.buildKind]?.key === "splitter" ? (ui.buildSplit & 3) << 5 : 0;
  cells.forEach((c, i) => gc.cmd(Ord.build(engs, ui.buildKind, c.x, c.y, c.dir | rf | (((c.floor ?? 0) & 3) << 3) | split, shift || i > 0)));
  sfx.confirm();
  resetLine(gc);
  if (!shift) {
    const def = gc.data!.buildings[ui.buildKind];
    if (!(def.cls === BClass.Belt || def.cls === BClass.Rail || def.cls === BClass.Wall || def.cls === BClass.Pylon || def.cls === BClass.Inserter)) gc.cancelMode();
    else gc.updateGhost();
  }
  gc.scene?.showRange(0, 0, 0);
}
