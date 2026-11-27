// Contrôleur de partie, clavier : appuis, groupes de contrôle, Échap, actions nommées des raccourcis (keymap.ts),
// menu de construction au clavier, rangée de l'usine.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as Ord from "@supreme/shared/orders.ts";
import { BClass, Layer, hasTech } from "@supreme/shared";
import { ui, pushMessage } from "./state.svelte.ts";
import { sfx } from "../audio/sound.ts";
import { keymap, kb, keysChanged } from "./keys.svelte.ts";
import { groupKey, digitOf, isModifierCode, actionDef } from "./keymap.ts";
import { buildCats, factoryUnitKinds } from "./catalog.ts";
import { plans } from "./plans.svelte.ts";
import { escapeAction } from "./gameMenu.ts";
import { isTextField, syncModifiers, type FocusLike } from "./heldKeys.ts";
import type { GameClient } from "./client.ts";
import { selectAllArmy } from "./clientSelection.ts";
import { commandersOf } from "./clientOrders.ts";
import { rotatableSelection } from "./clientBuildings.ts";

export function onKey(c: GameClient, e: KeyboardEvent, down: boolean): void {
  syncModifiers(c.keys, e);
  if (!down) {
    // relâchement toujours pris en compte (même si un champ a pris le focus entre-temps)
    c.keys.delete(e.code);
    return;
  }
  if (kb.capturing || isTextField(e.target as FocusLike | null)) return;
  if (keymap.observe(e)) keysChanged();
  if (ui.screen !== "game" || e.metaKey) return;
  c.keys.add(e.code);
  if (isModifierCode(e.code)) return;
  // menu de partie ouvert : le clavier ne commande plus le jeu (Échap le referme, la pause reste possible)
  if (ui.menuOpen) {
    if (e.code === "Escape") c.closeMenu();
    else if (keymap.match(e, {})?.id === "pause" && !e.repeat) c.togglePause();
    return;
  }
  // menu de construction au clavier : B, puis la catégorie, puis le bâtiment
  if (kb.buildStep) {
    if (buildMenuKey(c, e)) {
      e.preventDefault();
      return;
    }
  }
  // groupes de contrôle (touche physique : « 1 » même si elle donne « & »)
  const grp = groupKey(e);
  if (grp) {
    e.preventDefault();
    if (e.repeat) return;
    const n = grp.n;
    if (grp.create) {
      c.groups.set(n, [...c.selected]);
      pushMessage(`Groupe ${n} : ${c.selected.size} unités`);
    } else {
      const g = c.groups.get(n);
      if (g) {
        c.selected = new Set(g);
        const now = performance.now();
        if (c.lastGroupKey.k === n && now - c.lastGroupKey.t < 400) c.centerOnSelection();
        c.lastGroupKey = { k: n, t: now };
        c.updateUi();
      }
    }
    return;
  }
  if (e.code === "Escape" && !e.ctrlKey && !e.altKey) {
    // Échap annonce d'abord ce qui est en cours (menu, outil, panneau, sélection) ; le menu de partie
    // ne s'ouvre que s'il n'y a plus rien à annuler
    const act = escapeAction({
      menuOpen: ui.menuOpen,
      buildStep: !!kb.buildStep,
      mode: !!ui.mode,
      panel: ui.chatOpen || kb.showKeys || ui.showResearch || ui.showStats || ui.showHelp || ui.showRecipes || plans.show || ui.showGfx,
      selection: c.selected.size > 0 || !!ui.selDeposit || !!ui.selPlan,
    });
    if (act === "closeMenu") c.closeMenu();
    else if (act === "buildStep") kb.buildStep = "";
    else if (act === "mode") c.cancelMode();
    else if (act === "panels") ui.chatOpen = kb.showKeys = ui.showResearch = ui.showStats = ui.showHelp = ui.showRecipes = plans.show = ui.showGfx = false;
    else if (act === "deselect") {
      c.selected.clear();
      ui.selDeposit = null;
      if (ui.selPlan) {
        ui.selPlan = null;
        c.scene?.overlay?.setPlanned(c.planned, null);
      }
      c.updateUi();
    } else if (!e.repeat) c.openMenu();
    return;
  }
  const units = ui.me >= 0 && c.selectedUnits().length > 0;
  const m = keymap.match(e, { units, build: ui.mode === "build" || ui.mode === "paste" || (!units && rotatableSelection(c).length > 0), factory: !units && c.myFactory() !== null });
  if (!m) return;
  e.preventDefault();
  if (e.repeat && !actionDef(m.id)?.repeat) return;
  c.runAction(m.id, m.shift);
}

/** Exécute une action nommée du module de raccourcis. */
export function runAction(c: GameClient, id: string, shift = false): void {
  if (id.startsWith("factory")) {
    queueSlot(c, Number(id.slice(7)) - 1, shift ? 5 : 1);
    return;
  }
  if (id.startsWith("camGo")) return c.recallBookmark(Number(id.slice(5)) - 1);
  if (id.startsWith("camSave")) return c.saveBookmark(Number(id.slice(7)) - 1);
  switch (id) {
    case "attackMove":
      if (c.selected.size) c.setMode("attackMove");
      break;
    case "patrol":
      if (c.selected.size) c.setMode("patrol");
      break;
    case "stop":
      c.stopSelected();
      break;
    case "reclaim":
      if (ui.canBuild) c.setMode("reclaim");
      break;
    case "assist":
      if (c.selected.size) c.setMode("assist");
      break;
    case "harvest":
      if (commandersOf(c, c.selectedUnits()).length) c.setMode("harvest");
      break;
    case "deploy":
      c.deploySelected();
      break;
    case "tow":
      c.towSelected();
      break;
    case "unload":
      c.setMode("unload");
      break;
    case "tame":
      c.tameMode();
      break;
    case "ferry":
      if (ui.selUnits.some((g) => c.data!.units[g.kind].carry > 0 && c.data!.units[g.kind].layer === Layer.Air) && ui.selForeign < 0) c.setMode("ferryFrom");
      break;
    case "ping": {
      const g = c.mouse.inside ? c.groundAt(c.mouse.x, c.mouse.y) : null;
      if (g) c.sendPing(g.x, g.z);
      else if (ui.me >= 0) c.setMode("ping");
      break;
    }
    case "buildMenu":
      if (ui.canBuild) {
        kb.buildStep = "cat";
        sfx.click();
      }
      break;
    case "rotate":
      if (ui.mode === "build") {
        // file de tapis en cours de tracé : R tourne la fin de la file (d'un quart de tour à chaque appui)
        if (c.isBeltKind() && c.mouse.down && c.ghostStart && c.ghostCells.length > 1) {
          const end = c.ghostCells[c.ghostCells.length - 1].dir;
          c.lineEndDir = (end + 1) % 4;
          c.updateGhost();
          break;
        }
        // tapis : la direction (donc la forme) est automatique jusqu'au premier R, qui la force
        const cur = c.ghostCells.length === 1 ? c.ghostCells[0].dir : ui.buildDir;
        ui.buildDir = ((c.isBeltKind() && !c.beltForced ? cur : ui.buildDir) + 1) % 4;
        c.beltForced = true;
        c.updateGhost();
      } else if (ui.mode === "paste") c.plans.rotate();
      else {
        // tapis, bras ou tapis de contrôle sélectionnés : un quart de tour sur place
        const refs = rotatableSelection(c);
        if (refs.length) {
          c.cmd(Ord.rotate(refs));
          sfx.click();
        }
      }
      break;
    case "copyPlan":
      c.plans.startCopy();
      break;
    case "pastePlan":
      c.plans.startPaste();
      break;
    case "planLibrary":
      plans.show = !plans.show;
      break;
    case "selectArmy":
      selectAllArmy(c);
      break;
    case "idleEngineer":
      c.selectIdleEngineer(shift);
      break;
    case "cancelBuilding":
      c.demolishSelected();
      break;
    case "pauseBuilding":
      c.togglePauseSelected();
      break;
    case "zoomIn":
      if (c.scene) {
        c.scene.distance /= 1.3;
        c.scene.clampCamera();
      }
      break;
    case "zoomOut":
      if (c.scene) {
        c.scene.distance *= 1.3;
        c.scene.clampCamera();
      }
      break;
    case "commander":
      c.centerOnCommander();
      break;
    case "alert":
      if (c.alertPos && c.scene) {
        c.scene.target.x = c.alertPos.x;
        c.scene.target.z = c.alertPos.z;
      }
      break;
    case "research":
      ui.showResearch = !ui.showResearch;
      break;
    case "stats":
      ui.showStats = !ui.showStats;
      break;
    case "recipes":
      ui.showRecipes = !ui.showRecipes;
      break;
    case "help":
      ui.showHelp = !ui.showHelp;
      break;
    case "chat":
      // déjà ouverte mais sans le focus (clic sur la carte entre-temps) : Entrée y ramène le clavier
      ui.chatOpen = true;
      setTimeout(() => document.querySelector<HTMLInputElement>(".chatbox input")?.focus());
      break;
    case "perf":
      ui.showPerf = !ui.showPerf;
      break;
    case "speedUp":
      c.stepSpeed(1);
      break;
    case "speedDown":
      c.stepSpeed(-1);
      break;
    case "pause":
      c.togglePause();
      break;
  }
}

/** Appui pendant le menu de construction ; vrai si l'appui est consommé. */
function buildMenuKey(c: GameClient, e: KeyboardEvent): boolean {
  if (!ui.canBuild) {
    kb.buildStep = "";
    return false;
  }
  const n = e.ctrlKey || e.altKey ? null : digitOf(e.code);
  if (n === null) {
    // Échap ou la touche du menu referment le menu ; toute autre touche le referme et agit
    const again = keymap.match(e, { units: true })?.id === "buildMenu";
    kb.buildStep = "";
    return e.code === "Escape" || again;
  }
  if (e.repeat) return true;
  if (kb.buildStep === "cat") {
    if (n <= buildCats(ui.race).length) {
      kb.buildCat = n - 1;
      kb.buildStep = "item";
      sfx.click();
    } else sfx.error();
    return true;
  }
  const key = buildCats(ui.race)[kb.buildCat]?.[2][n - 1];
  const idx = key && c.data ? c.data.buildings.findIndex((b) => b.key === key) : -1;
  if (idx < 0) {
    sfx.error();
    return true;
  }
  const me = c.frame?.players[ui.me];
  if (me && !hasTech(me, c.data!.buildings[idx].tech)) {
    pushMessage(`${c.data!.buildings[idx].name} : recherche requise (${c.data!.techs[c.data!.buildings[idx].tech].name})`, "alert");
    sfx.error();
    return true;
  }
  kb.buildStep = "";
  c.startBuild(idx);
  return true;
}

/** Mon usine sélectionnée (seule, sans unités), ou null. */
export function myFactory(c: GameClient): { ref: number; factory: number } | null {
  const b = ui.selBuilding;
  if (!b || b.owner !== ui.me || !c.data) return null;
  const def = c.data.buildings[b.kind];
  return def.cls === BClass.Factory ? { ref: b.ref, factory: def.factory } : null;
}

/** Touche n de la rangée de l'usine : met en file la n-ième unité du panneau. */
function queueSlot(c: GameClient, slot: number, delta: number): void {
  const fac = c.myFactory();
  if (!fac || !c.data) return;
  const kind = factoryUnitKinds(c.data, fac.factory, ui.race)[slot];
  if (kind === undefined) return;
  const me = c.frame?.players[ui.me];
  const u = c.data.units[kind];
  if (me && !hasTech(me, u.tech)) {
    pushMessage(`${u.name} : recherche requise (${c.data.techs[u.tech].name})`, "alert");
    sfx.error();
    return;
  }
  c.queueUnit(kind, delta);
  sfx.click();
}
