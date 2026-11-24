// Contrôleur de partie, ordres aux unités : clic droit contextuel et curseur qui l'annonce, modes d'ordre (attaque,
// patrouille, récolte, navette…), récolte, apprivoisement, livraison, déploiement, Arche et améliorations.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as Ord from "@supreme/shared/orders.ts";
import { cursorCss, type CursorKind } from "../ui/cursors.ts";
import { SEVE, BUILDING_WORDS, WRECK_WORDS, BClass, Layer, hasTech, smeltRecipe, NATURE_TEAM } from "@supreme/shared";
import { ui, pushMessage } from "./state.svelte.ts";
import { sfx } from "../audio/sound.ts";
import type { GameClient } from "./client.ts";
import { TILE, O } from "./clientConsts.ts";
import { ownedUnitAt, spotAt } from "./clientSelection.ts";
import { startDeploy, resetLine } from "./clientPlacement.ts";

// ---------- navette de transport ----------
/** Clic des modes de la navette : l'embarquement, puis le débarquement. */
export function ferryClick(c: GameClient, x: number, z: number, queue: boolean): void {
  if (ui.mode === "ferryFrom") {
    c.ferryFrom = { x, z };
    ui.mode = "ferryTo";
    c.scene?.addMarker(x, z, 0xc07dff);
    sfx.click();
    c.updateCursor(true);
    return;
  }
  const a = c.ferryFrom;
  if (!a) return c.cancelMode();
  const ids = c.selectedUnits().filter((u) => c.data!.units[u.kind].carry > 0 && c.data!.units[u.kind].layer === Layer.Air).map((u) => u.id);
  if (Math.hypot(x - a.x, z - a.z) <= 17) {
    pushMessage("Navette : le débarquement doit être à plus de 17 cases de l'embarquement", "alert");
    sfx.error();
    return;
  }
  if (ids.length) c.cmd(Ord.ferry(ids, Math.round(a.x * TILE), Math.round(a.z * TILE), Math.round(x * TILE), Math.round(z * TILE), queue));
  c.scene?.addMarker(x, z, 0xc07dff);
  pushMessage("Navette : les unités de combat qui attendent à l'embarquement (8 cases) sont portées au débarquement ; réglez-y le ralliement de vos usines", "info");
  sfx.confirm();
  c.cancelMode();
}

export function setMode(c: GameClient, mode: string): void {
  if (ui.mode === "copy" || ui.mode === "paste") c.plans.clear();
  ui.mode = mode;
  if (mode !== "build") c.scene?.hideGhost();
  sfx.click();
  c.updateCursor(true);
}
export function cancelMode(c: GameClient): void {
  c.deployUnits = [];
  c.poleGen = null;
  c.ferryFrom = null;
  ui.mode = "";
  ui.buildKind = -1;
  ui.lineCost = null;
  ui.grass = null;
  resetLine(c);
  c.scene?.hideGhost();
  c.plans.clear();
  c.updateCursor(true);
}

/** Installer une amélioration sur les porteurs `refs` (payée tout de suite). */
export function installMod(c: GameClient, mod: number, refs: number[]): void {
  c.cmd(Ord.installMod(mod, refs));
  sfx.confirm();
}
export function cancelMod(c: GameClient, refs: number[]): void {
  c.cmd(Ord.cancelMod(refs));
  sfx.click();
}
/** Transhumants : enregistrer le gabarit `k` (0 à 2) d'un type d'unité. */
export function kitSet(c: GameClient, kind: number, k: number, set: number[]): void {
  c.cmd(Ord.kitSet(kind, k, set));
  sfx.click();
}
/** Gabarit de production d'un type d'unité (1 à 3 ; 0 : aucun). */
export function kitActive(c: GameClient, kind: number, k: number): void {
  c.cmd(Ord.kitActive(kind, k));
  sfx.confirm();
}
/** Équiper les unités `refs` (un emplacement à 0 reste comme il est). */
export function kitApply(c: GameClient, set: number[], refs: number[]): void {
  c.cmd(Ord.kitApply(set, refs));
  sfx.confirm();
}
/** Arches sélectionnées. */
function arks(c: GameClient): number[] {
  return c.selectedUnits().filter((u) => c.data!.units[u.kind].key === "ark").map((u) => u.id);
}
/** Tourelles de l'Arche : 0 replier, 1 déployer, 2 suivre l'Arche, 3 tenir la place. */
export function arkTurrets(c: GameClient, action: 0 | 1 | 2 | 3): void {
  const a = arks(c);
  if (a.length) c.cmd(Ord.arkTurrets(a, action));
  sfx.click();
}
/** Type voulu de la tourelle `k` (-1 : toutes) de l'Arche sélectionnée. */
export function arkTurretType(c: GameClient, k: number, kind: number): void {
  const a = arks(c);
  if (a.length) c.cmd(Ord.arkTurretType(a[0], k, kind));
  sfx.click();
}
export function arkBoost(c: GameClient): void {
  const a = arks(c);
  if (a.length) c.cmd(Ord.arkBoost(a));
  sfx.confirm();
}
/** File de l'atelier embarqué de l'Arche sélectionnée. */
export function arkQueue(c: GameClient, kind: number, delta: number): void {
  const a = arks(c);
  if (a.length) c.cmd(Ord.arkQueue(a[0], kind, delta));
  sfx.click();
}

// ---------- curseur contextuel ----------
/** Met à jour la forme du curseur selon ce qu'un clic ferait sous la souris (au plus 20 fois par seconde). */
export function updateCursor(c: GameClient, force = false): void {
  const el = c.canvasEl;
  if (!el) return;
  const now = performance.now();
  if (!force && now - c.cursorAt < 50) return;
  c.cursorAt = now;
  const kind = cursorIntent(c, c.mouse.x, c.mouse.y);
  if (kind !== c.cursorKind) {
    c.cursorKind = kind;
    el.style.cursor = cursorCss(kind);
  }
}

/**
 * Ce que ferait un clic à l'écran (x, y), pour le curseur : mêmes règles que le clic droit
 * (contextCommand) et que les modes d'ordre (modeClick).
 */
function cursorIntent(gc: GameClient, x: number, y: number): CursorKind {
  if (gc.middle.active) return "grab";
  if (gc.mouse.down && gc.mouse.button === 2 && gc.mouse.dragging) return gc.formStart ? "move" : "grab";
  if (!gc.data || !gc.frame) return "default";
  const mode = ui.mode;
  const playing = ui.me >= 0 && !ui.spectator && !ui.replay;
  if (mode === "build" || mode === "paste") return gc.ghostCells.some((c) => !c.ok) ? "invalid" : "build";
  if (mode === "copy") return "select";
  const g = gc.groundAt(x, y);
  if (!g) return mode ? "invalid" : "default";
  const unit = ownedUnitAt(gc, x, y, true);
  const tb = gc.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
  const mine = (owner: number) => owner === ui.me;
  const enemy = (owner: number) => gc.teamOf(owner) !== gc.teamOf(ui.me);
  if (mode) {
    switch (mode) {
      case "attackMove":
        return "attackMove";
      case "patrol":
        return "patrol";
      case "reclaim":
        return "reclaim";
      case "harvest": {
        const s = spotAt(gc, Math.floor(g.x), Math.floor(g.z));
        return s && gc.harvestRecipe(s.kind) >= 0 ? "harvest" : "invalid";
      }
      case "unload":
      case "ferryTo":
        return "unload";
      case "tame":
        return wildNestAt(gc, g.x, g.z) ? "load" : "invalid";
      case "ferryFrom":
        return "load";
      case "ping":
        return "ping";
      case "assist":
        return (unit && !enemy(unit.owner)) || (tb && !enemy(tb.owner)) ? "assist" : "invalid";
      default:
        return "target";
    }
  }
  const units = playing ? gc.selectedUnits() : [];
  if (!units.length) {
    // rien de sélectionné (ou spectateur) : ce qui peut être sélectionné sous la souris
    if (playing && ui.selBuilding && mine(ui.selBuilding.owner) && (gc.data.buildings[ui.selBuilding.kind]?.cls === BClass.Factory || gc.data.buildings[ui.selBuilding.kind]?.key === "nest")) return "rally";
    if (unit && (mine(unit.owner) || !playing)) return "select";
    if (tb && (mine(tb.owner) || !playing)) return "select";
    return "default";
  }
  const ids = units.map((u) => u.id);
  if (unit && enemy(unit.owner)) return "attack";
  // Reine de la Souche sur un nid de mordeurs sauvage : elle l'apprivoise
  if (tb && wildNest(gc, tb) && units.some((u) => gc.data!.units[u.kind].key === "queen")) return "load";
  if (tb && enemy(tb.owner)) return "attack";
  const engs = units.some((u) => gc.data!.units[u.kind].buildPower > 0);
  if (unit && mine(unit.owner) && !ids.includes(unit.id)) return gc.data.units[unit.kind].carry > 0 ? "load" : "assist";
  if (tb && hungryHeart(gc, tb) && units.some((u) => sacrificeValue(gc, u.kind) > 0)) return "load";
  if (tb && mine(tb.owner)) {
    const def = gc.data.buildings[tb.kind];
    if (def.cls === BClass.Gate) return "move";
    if (engs && (tb.build < 65536 || tb.hp < def.hp)) return "repair";
    if (def.cls === BClass.Belt && tb.owner === ui.me && units.some((u) => gc.data!.units[u.kind].key === "commander")) return "load";
    if (canPickup(gc, def.cls, tb.build) && holdersOf(gc, units).length) return "load";
  }
  if (!tb && units.some((u) => gc.data!.units[u.kind].key === "commander")) {
    const s = spotAt(gc, Math.floor(g.x), Math.floor(g.z));
    if (s && gc.harvestRecipe(s.kind) >= 0) return "harvest";
  }
  // chenillard foreuse sur un gisement libre : il s'y rend et s'y déploie
  if (!tb && units.some((u) => gc.data!.units[u.kind].key === "ch_drill")) {
    const s = spotAt(gc, Math.floor(g.x), Math.floor(g.z));
    if (s && s.kind !== 250) return "harvest";
  }
  if (engs) {
    const f = gc.frame;
    for (let i = 0, o = f.wreckOff; i < f.nWrecks; i++, o += WRECK_WORDS) {
      if (Math.hypot(f.buf[o] / TILE - g.x, f.buf[o + 1] / TILE - g.z) < 1.5) return "reclaim";
    }
  }
  return "move";
}

// ---------- ordres ----------
export function contextCommand(c: GameClient, x: number, y: number, queue: boolean): void {
  const g = c.groundAt(x, y);
  if (!g || !c.data || ui.me < 0) return;
  const units = c.selectedUnits();
  const gx = Math.round(g.x * TILE);
  const gy = Math.round(g.z * TILE);
  // usines sélectionnées : point de ralliement
  if (!units.length) {
    if (ui.selBuilding && ui.selBuilding.owner === ui.me) {
      const def = c.data.buildings[ui.selBuilding.kind];
      if (def.cls === BClass.Factory || def.key === "nest") {
        c.cmd(Ord.rally(ui.selBuilding.ref, gx, gy));
        {
          const h = c.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
          if (h && hungryHeart(c, h)) pushMessage("Ralliement sur la graine-mère : les organismes nés ici iront s'y sacrifier", "info");
        }
        c.scene?.addMarker(g.x, g.z, 0x7dff9a);
        sfx.confirm();
      }
    }
    return;
  }
  const ids = units.map((u) => u.id);
  const target = ownedUnitAt(c, x, y, true);
  if (target && c.teamOf(target.owner) !== c.teamOf(ui.me)) {
    c.cmd(Ord.target(O.ATTACK, ids, target.id, queue));
    c.scene?.addMarker(g.x, g.z, 0xff5050);
    sfx.confirm();
    return;
  }
  const tb = c.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
  const engs = units.filter((u) => c.data!.units[u.kind].buildPower > 0).map((u) => u.id);
  const others = units.filter((u) => c.data!.units[u.kind].buildPower === 0);
  // Reine sur un nid de mordeurs sauvage : elle l'apprivoise (les autres unités restent à l'écart)
  if (tb && wildNest(c, tb) && tameNest(c, units, tb.ref, queue)) return;
  // organismes sur une graine-mère en croissance : ils s'y sacrifient
  if (tb && hungryHeart(c, tb)) {
    const fodder = units.filter((u) => sacrificeValue(c, u.kind) > 0);
    if (fodder.length) {
      c.cmd(Ord.target(O.SACRIFICE, fodder.map((u) => u.id), tb.ref, queue));
      const seve = fodder.reduce((n, u) => n + sacrificeValue(c, u.kind), 0);
      c.scene?.addMarker(g.x, g.z, 0x8cff30);
      pushMessage(`${fodder.length} organisme${fodder.length > 1 ? "s vont" : " va"} se sacrifier dans la graine-mère : +${seve} sève`, "info");
      sfx.confirm();
      return;
    }
  }
  if (tb && c.teamOf(tb.owner) !== c.teamOf(ui.me)) {
    c.cmd(Ord.target(O.ATTACK, ids, tb.ref, queue));
    c.scene?.addMarker(g.x, g.z, 0xff5050);
    sfx.confirm();
    return;
  }
  if (target && target.owner === ui.me && !ids.includes(target.id)) {
    const td = c.data.units[target.kind];
    if (td.carry > 0) {
      c.cmd(Ord.load(target.id, ids));
      sfx.confirm();
      return;
    }
    // escorte / réparation
    c.cmd(Ord.target(O.ASSIST, ids, target.id, queue));
    sfx.confirm();
    return;
  }
  if (tb && tb.owner === ui.me) {
    const def = c.data.buildings[tb.kind];
    if (def.cls === BClass.Gate) {
      c.cmd(Ord.move(units, (tb.x + def.w / 2) * TILE, (tb.y + def.h / 2) * TILE, queue, false, false));
      sfx.confirm();
      return;
    }
    if (engs.length && (tb.build < 65536 || tb.hp < def.hp)) {
      c.cmd(Ord.target(O.ASSIST, engs, tb.ref, queue));
      if (others.length) c.cmd(Ord.move(others, gx, gy, queue));
      sfx.confirm();
      return;
    }
    // commandant sur un de nos tapis : il s'y poste et récupère les objets qui passent (dans sa soute)
    const cmdrs = units.filter((u) => c.data!.units[u.kind].key === "commander").map((u) => u.id);
    if (def.cls === BClass.Belt && cmdrs.length) {
      c.cmd(Ord.target(O.COLLECT, cmdrs, tb.ref, queue));
      const rest = units.filter((u) => !cmdrs.includes(u.id));
      if (rest.length) c.cmd(Ord.move(rest, gx, gy, queue, false));
      c.scene?.addMarker(g.x, g.z, 0xffd060);
      pushMessage("Commandant : récupération des objets du tapis (dans sa soute, ses drones les portent à un dépôt)", "info");
      sfx.confirm();
      return;
    }
    // chariots de convoi sur un de nos modules éloignés : navette avec leur soute (Maj : livrer à ce fabricant)
    const carts = units.filter((u) => c.data!.units[u.kind].key === "t_cart").map((u) => u.id);
    if (carts.length && canPickup(c, def.cls, tb.build)) {
      const feed = queue && def.cls === BClass.Crafter;
      c.cmd(Ord.haul(carts, tb.ref, feed));
      const rest = units.filter((u) => !carts.includes(u.id));
      if (rest.length) c.cmd(Ord.move(rest, gx, gy, queue, false));
      c.scene?.addMarker(g.x, g.z, 0xffc83c);
      pushMessage(feed ? `Convoi : la soute livre à ${def.name.toLowerCase()} les ingrédients de sa recette` : `Convoi : ce qui sort de ${def.name.toLowerCase()} est rapporté à la soute (Maj+clic droit sur un fabricant : le livrer)`, "info");
      sfx.confirm();
      return;
    }
    // commandant ou ingénieur sur un extracteur ou un fabricant terminé : il ramasse ce qui sort, dans sa soute
    const holders = holdersOf(c, units);
    if (canPickup(c, def.cls, tb.build) && holders.length) {
      c.cmd(Ord.pickup(holders, tb.ref, queue));
      const rest = units.filter((u) => !holders.includes(u.id));
      if (rest.length) c.cmd(Ord.move(rest, gx, gy, queue, false));
      c.scene?.addMarker(g.x, g.z, 0xffd060);
      pushMessage(`Ramassage : ce qui sort de ${def.name.toLowerCase()} va dans la soute`, "info");
      sfx.confirm();
      return;
    }
  }
  // chenillard foreuse sur un gisement libre : il s'y rend et s'y déploie
  if (!tb && drillDeployAt(c, units, g.x, g.z, queue)) return;
  // commandant sur un gisement libre (sans extracteur) : récolte avec sa fonderie intégrée
  if (!tb && harvestAt(c, units, g.x, g.z, queue, false)) return;
  // épave
  if (engs.length && c.frame) {
    const f = c.frame;
    for (let i = 0, o = f.wreckOff; i < f.nWrecks; i++, o += WRECK_WORDS) {
      if (Math.hypot(f.buf[o] / TILE - g.x, f.buf[o + 1] / TILE - g.z) < 1.5) {
        // référence d'épave : on la retrouve côté simulation par position → ordre de recyclage par zone
        void reclaimNear(c, engs, g.x, g.z, queue);
        if (others.length) c.cmd(Ord.move(others, gx, gy, queue));
        return;
      }
    }
  }
  // Maj + clic droit : formation en file (rangées au premier point, disposition gardée ensuite)
  if (queue && units.length > 1) c.cmd(Ord.moveQueuedFormation(units.map((u) => u.id), gx, gy));
  else c.cmd(Ord.move(units, gx, gy, queue, false));
  c.scene?.addMarker(g.x, g.z, 0x7dff9a);
  sfx.confirm();
}

/**
 * Recette de fonderie utilisée par la récolte du commandant sur un gisement de la ressource `raw`,
 * ou -1 (hydrocarbure, cristal, ou recette pas encore débloquée : la plaquette de silicium demande
 * l'électronique). Même règle que la simulation (units::harvest_recipe).
 */
export function harvestRecipe(c: GameClient, raw: number): number {
  if (!c.data) return -1;
  const r = smeltRecipe(c.data, raw);
  if (r < 0) return -1;
  const me = c.frame?.players[ui.me];
  return !me || hasTech(me, c.data.recipes[r].tech) ? r : -1;
}

/**
 * Transhumants : le chenillard foreuse sélectionné le plus proche du gisement libre sous (x, z) y roule et
 * s'y déploie (les autres unités s'y rendent). Faux s'il n'y a ni foreuse ni gisement là (pas un geyser).
 */
function drillDeployAt(c: GameClient, units: { id: number; kind: number; x: number; y: number }[], x: number, z: number, queue: boolean): boolean {
  const spot = spotAt(c, Math.floor(x), Math.floor(z));
  const drills = units.filter((u) => c.data!.units[u.kind].key === "ch_drill");
  if (!spot || spot.kind === 250 || !drills.length) return false;
  // centre du gisement (2 × 2 cases) : le chenillard s'y arrête, la foreuse le couvre
  const cx = (spot.x + 1) * TILE;
  const cz = (spot.y + 1) * TILE;
  const best = drills.reduce((a, b) => (Math.hypot(b.x - cx, b.y - cz) < Math.hypot(a.x - cx, a.y - cz) ? b : a));
  c.cmd(Ord.deployAt([best.id], cx, cz, queue));
  const rest = units.filter((u) => u.id !== best.id);
  if (rest.length) c.cmd(Ord.move(rest, Math.round(x * TILE), Math.round(z * TILE), queue, false));
  c.scene?.addMarker(spot.x + 1, spot.y + 1, 0xff9a3c);
  pushMessage(`Chariot foreuse : il se rend sur le gisement de ${c.data!.items[spot.kind]?.name.toLowerCase() ?? "minerai"} et s'y déploie`, "info");
  sfx.confirm();
  return true;
}

/** Nid de mordeurs de la faune (pas une ruche) : apprivoisable par la Reine de la Souche. */
function wildNest(c: GameClient, tb: { kind: number; owner: number }): boolean {
  return c.data?.buildings[tb.kind]?.key === "nest" && c.frame?.players[tb.owner]?.team === NATURE_TEAM;
}

/** Notre graine-mère (Souche) encore en croissance : elle se nourrit de sacrifices. */
function hungryHeart(c: GameClient, tb: { kind: number; owner: number; build: number }): boolean {
  return tb.owner === ui.me && tb.build < 65536 && c.data?.buildings[tb.kind]?.key === "seed_heart";
}
/** Sève que rapporte un organisme sacrifié (souche::sacrifice_value). */
function sacrificeValue(c: GameClient, kind: number): number {
  const u = c.data?.units[kind];
  if (!u || u.race !== 1 || u.commander || u.egg) return 0;
  return u.cost.find(([it]) => it === SEVE)?.[1] ?? 0;
}
/** Nid de mordeurs sauvage visé au sol : celui de la case, sinon le plus proche à moins de 4 cases du point. */
function wildNestAt(c: GameClient, x: number, z: number): number {
  const tb = c.buildingAtTile(Math.floor(x), Math.floor(z));
  if (tb && wildNest(c, tb)) return tb.ref;
  const f = c.frame;
  let best = 0;
  let bd = 4;
  if (f && c.data) {
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = f.buf[o + 1] & 0xff;
      if (!wildNest(c, { kind, owner: (f.buf[o + 1] >> 8) & 0xff })) continue;
      const def = c.data.buildings[kind];
      const d = Math.hypot((f.buf[o + 2] & 0xffff) + def.w / 2 - x, (f.buf[o + 2] >>> 16) + def.h / 2 - z);
      if (d < bd) {
        bd = d;
        best = f.buf[o] >>> 0;
      }
    }
  }
  return best;
}

/** Bouton ou touche « Apprivoiser » de la Reine : choisir un nid (refus si la limite est atteinte). */
export function tameMode(c: GameClient): void {
  if (!c.selectedUnits().some((u) => c.data!.units[u.kind].key === "queen")) return;
  const { have, max } = c.denLimit();
  if (have >= max) {
    pushMessage(`Nids greffés : ${have} / ${max}. Chaque mutation acquise permet d'en greffer un de plus`, "alert");
    sfx.error();
    return;
  }
  c.setMode("tame");
}

/** Nids greffés au plus : un, plus un par mutation acquise (souche::den_limit). */
export function denLimit(c: GameClient): { have: number; max: number } {
  const me = c.frame?.players[ui.me];
  let max = 1;
  if (me && c.data) for (let t = 0; t < c.data.techs.length; t++) if (c.data.techs[t].race === 1 && c.data.techs[t].excl && hasTech(me, t)) max++;
  let have = 0;
  const f = c.frame;
  if (f) for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) if (((f.buf[o + 1] >> 8) & 0xff) === ui.me && c.data?.buildings[f.buf[o + 1] & 0xff]?.key === "nest") have++;
  return { have, max };
}

/** Ordre « Apprivoiser » pour les Reines de la sélection ; faux s'il n'y en a pas. */
function tameNest(c: GameClient, units: { id: number; kind: number }[], nest: number, queue: boolean): boolean {
  const queens = units.filter((u) => c.data!.units[u.kind].key === "queen").map((u) => u.id);
  if (!queens.length) return false;
  const { have, max } = c.denLimit();
  if (have >= max) {
    pushMessage(`Nids greffés : ${have} / ${max}. Chaque mutation acquise permet d'en greffer un de plus`, "alert");
    sfx.error();
    return true;
  }
  c.cmd(Ord.tame(queens, nest, queue));
  pushMessage("La Reine apprivoise le nid : 30 s à moins de 6 cases. Sa horde est calmée envers vous ; frapper le nid ou ses bêtes fait tout reprendre à zéro", "info");
  sfx.confirm();
  return true;
}

/** Constructeurs à soute (commandant, ingénieurs, Arche) parmi les unités. */
function holdersOf(c: GameClient, units: { id: number; kind: number }[]): number[] {
  return units.filter((u) => (c.data!.units[u.kind].hold ?? 0) > 0).map((u) => u.id);
}

/** Un bâtiment de cette classe, à cet avancement, a-t-il une sortie à ramasser (extracteur, fabricant terminés) ? */
function canPickup(c: GameClient, cls: number, build: number): boolean {
  return (cls === BClass.Extractor || cls === BClass.Crafter) && build >= 65536;
}

/**
 * Livraison : les constructeurs sélectionnés portent l'objet `item` de leur soute (0 : tout) au dépôt le
 * plus proche qui a de la place (Maj : en file).
 */
export function deliverSelected(c: GameClient, item: number, queue = false): void {
  const ids = holdersOf(c, c.selectedUnits());
  if (!ids.length || !c.data) return;
  c.cmd(Ord.deliver(ids, item, queue));
  const what = item ? c.data.items[item]?.name.toLowerCase() : "la soute";
  pushMessage(`Livraison : ${what} part au dépôt le plus proche qui a de la place`, "info");
  sfx.confirm();
}

/** Commandants parmi les unités. */
export function commandersOf(c: GameClient, units: { id: number; kind: number }[]): number[] {
  return units.filter((u) => c.data!.units[u.kind].key === "commander").map((u) => u.id);
}

/**
 * Ordre de récolte au point (x, z) de la carte pour les commandants de `units` (les autres unités s'y
 * rendent). Faux si rien n'est récoltable là ; `explain` dit alors pourquoi.
 */
function harvestAt(c: GameClient, units: { id: number; kind: number; x: number; y: number }[], x: number, z: number, queue: boolean, explain: boolean): boolean {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const spot = spotAt(c, tx, tz);
  const cmdrs = commandersOf(c, units);
  const fail = (msg: string): boolean => {
    if (explain) {
      pushMessage(msg, "alert");
      sfx.error();
    }
    return false;
  };
  if (!cmdrs.length) return fail("Récolte : sélectionnez votre commandant");
  if (!spot) return fail("Récolte : cliquez sur un gisement de minerai de fer, de cuivre ou de silicium");
  const items = c.data!.items;
  const r = c.harvestRecipe(spot.kind);
  if (r < 0) {
    const sr = smeltRecipe(c.data!, spot.kind);
    return fail(sr < 0 ? `Récolte : la fonderie du commandant ne sait pas fondre ${items[spot.kind]?.name.toLowerCase() ?? "ce gisement"}` : `Récolte : la recette « ${items[c.data!.recipes[sr].output[0]]?.name} » n'est pas encore recherchée`);
  }
  c.cmd(Ord.harvest(cmdrs, tx, tz, queue));
  const rest = units.filter((u) => !cmdrs.includes(u.id));
  if (rest.length) c.cmd(Ord.move(rest, Math.round(x * TILE), Math.round(z * TILE), queue, false));
  c.scene?.addMarker(x, z, 0xff9a3c);
  const rec = c.data!.recipes[r];
  pushMessage(`Commandant : récolte du ${items[spot.kind]?.name.toLowerCase()}, fondu en ${items[rec.output[0]]?.name.toLowerCase()} (versé au stock)`, "info");
  sfx.confirm();
  return true;
}

/** Recyclage : la simulation identifie l'épave la plus proche du point. */
async function reclaimNear(c: GameClient, engs: number[], x: number, z: number, queue: boolean): Promise<void> {
  const ref = await c.query<number>("wreckAt", [Math.round(x * TILE), Math.round(z * TILE)]);
  if (ref) {
    c.cmd(Ord.target(O.RECLAIM, engs, ref, queue));
    c.scene?.addMarker(x, z, 0xffd060);
    sfx.confirm();
  }
}

export async function modeClick(c: GameClient, x: number, y: number, queue: boolean): Promise<void> {
  const g = c.groundAt(x, y);
  if (!g || !c.data) return;
  const gx = Math.round(g.x * TILE);
  const gy = Math.round(g.z * TILE);
  const units = c.selectedUnits();
  const ids = units.map((u) => u.id);
  const mode = ui.mode;
  const tb = c.buildingAtTile(Math.floor(g.x), Math.floor(g.z));
  const tu = ownedUnitAt(c, x, y, true);
  switch (mode) {
    case "attackMove":
      c.cmd(Ord.move(units, gx, gy, queue, true));
      c.scene?.addMarker(g.x, g.z, 0xff9050);
      break;
    case "patrol":
      c.cmd(Ord.point(O.PATROL, ids, gx, gy, queue));
      c.scene?.addMarker(g.x, g.z, 0x50b0ff);
      break;
    case "attackGround":
      c.cmd(Ord.point(O.ATTACK_GROUND, ids, gx, gy, queue));
      c.scene?.addMarker(g.x, g.z, 0xff5050);
      break;
    case "tame": {
      const nest = wildNestAt(c, g.x, g.z);
      if (!nest) {
        pushMessage("Apprivoiser : cliquez un nid de mordeurs sauvage (les ruches de réplicateurs ne s'apprivoisent pas)", "alert");
        sfx.error();
        return;
      }
      if (tameNest(c, units, nest, queue)) c.scene?.addMarker(g.x, g.z, 0x9be05a);
      c.cancelMode();
      return;
    }
    case "ferryFrom":
    case "ferryTo":
      c.ferryClick(g.x, g.z, queue);
      return;
    case "ping":
      c.sendPing(g.x, g.z);
      if (!queue) c.cancelMode();
      return;
    case "unload":
      c.cmd(Ord.point(O.UNLOAD, ids, gx, gy, queue));
      c.scene?.addMarker(g.x, g.z, 0x50b0ff);
      break;
    case "reclaim": {
      const engs = c.engineers();
      if (tb && tb.owner === ui.me) c.cmd(Ord.target(O.RECLAIM, engs, tb.ref, queue));
      else await reclaimNear(c, engs, g.x, g.z, queue);
      break;
    }
    case "assist":
      if (tu) c.cmd(Ord.target(O.ASSIST, ids, tu.id, queue));
      else if (tb) c.cmd(Ord.target(O.ASSIST, c.engineers(), tb.ref, queue));
      break;
    case "harvest":
      if (!harvestAt(c, units, g.x, g.z, queue, true)) return;
      if (!queue) c.cancelMode();
      return;
    case "teleport":
    case "jump": {
      const src = units.find((u) => (mode === "teleport" ? c.data!.units[u.kind].key === "commander" : c.data!.units[u.kind].key === "hyper_cruiser"));
      // saut hyperespace : seulement vers une de nos balises (alimentée, vérifié par la simulation)
      if (mode === "jump" && !(tb && tb.owner === ui.me && c.data!.buildings[tb.kind]?.cls === BClass.Beacon)) {
        pushMessage("Saut hyperespace : cliquez sur une de vos balises d'hyperespace", "alert");
        sfx.error();
        return;
      }
      if (src) c.cmd(Ord.special(src.id, gx, gy, tb ? tb.ref : 0));
      break;
    }
    case "launch":
    case "fire":
    case "transfer":
    case "link":
      if (ui.selBuilding) c.cmd(Ord.special(ui.selBuilding.ref, gx, gy, tb ? tb.ref : 0));
      break;
  }
  sfx.confirm();
  if (!queue) c.cancelMode();
}

export function stopSelected(c: GameClient): void {
  const ids = c.selectedUnits().map((u) => u.id);
  if (ids.length) c.cmd(Ord.stop(ids));
}
/**
 * Déployer : les chenillards des Transhumants passent en mode placement (fantôme du module : position et
 * sens, R pour tourner) ; l'Arche déploie ou replie ses tourelles ; les autres unités déployables (sonde,
 * artillerie) se déploient sur place.
 */
export function deploySelected(c: GameClient): void {
  const sel = c.selectedUnits();
  const ch = sel.filter((u) => (c.data!.units[u.kind].deploys ?? -1) >= 0);
  const other = sel.filter((u) => !ch.includes(u) && c.data!.units[u.kind].key !== "ark").map((u) => u.id);
  // Arche : ses tourelles
  const ark = ui.unitInfo?.mods?.ark;
  if (ark?.turrets.length) c.arkTurrets(ark.out ? 0 : 1);
  if (other.length) c.cmd(Ord.deploy(other));
  if (ch.length) startDeploy(c, ch.map((u) => ({ id: u.id, kind: u.kind })));
}
