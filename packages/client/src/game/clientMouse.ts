// Contrôleur de partie, souris : branchement des écouteurs d'entrée (souris, clavier, fenêtre), boutons, déplacement,
// molette, aperçu de la formation au clic droit glissé.
//
// Méthodes de GameClient (client.ts) sorties en fonctions libres : le client est leur premier paramètre, `c`
// (`gc` dans les fonctions qui ont déjà une variable `c`).
import * as Ord from "@supreme/shared/orders.ts";
import { UNIT_WORDS } from "@supreme/shared";
import { ui } from "./state.svelte.ts";
import { setVoiceEnabled } from "../audio/voice.ts";
import { sfx, setVolume } from "../audio/sound.ts";
import { initMusic } from "../audio/music.ts";
import { initLayout } from "./keys.svelte.ts";
import { isTextField, syncModifiers } from "./heldKeys.ts";
import type { GameClient } from "./client.ts";
import { TILE } from "./clientConsts.ts";
import { localXY } from "./clientView.ts";
import { onKey } from "./clientKeyboard.ts";
import { clickSelect, boxSelect } from "./clientSelection.ts";
import { contextCommand, modeClick } from "./clientOrders.ts";
import { placeDeploy, placePole, snapBuild, placeBuildings } from "./clientPlacement.ts";
import { reclaimArea } from "./clientBuildings.ts";

// ---------- entrées ----------
export function attach(c: GameClient, el: HTMLElement, selBox: HTMLDivElement): void {
  c.canvasEl = el;
  c.selBox = selBox;
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("pointerdown", (e) => onDown(c, e));
  addEventListener("pointermove", (e) => onMove(c, e));
  addEventListener("pointerup", (e) => onUp(c, e));
  el.addEventListener("pointerenter", () => (c.mouse.inside = true));
  el.addEventListener("pointerleave", () => (c.mouse.inside = false));
  el.addEventListener("wheel", (e) => onWheel(c, e), { passive: false });
  addEventListener("keydown", (e) => onKey(c, e, true));
  addEventListener("keyup", (e) => onKey(c, e, false));
  // touches relâchées hors de la page (bascule de fenêtre, onglet caché) : plus rien n'est maintenu
  addEventListener("blur", () => c.keys.clear());
  document.addEventListener("visibilitychange", () => document.hidden && c.keys.clear());
  // liste déroulante de la partie (filtre, recette) : rendre le clavier au jeu une fois le choix fait,
  // sinon ZQSD et les flèches changeraient l'option au lieu de faire défiler la caméra
  document.addEventListener("change", (e) => {
    const t = e.target as HTMLElement | null;
    if (ui.screen === "game" && t?.tagName === "SELECT") t.blur();
  });
  void initLayout();
  const v = Number(localStorage.getItem("supreme.volume") ?? "0.5");
  ui.volume = v;
  setVolume(v);
  const mv = Number(localStorage.getItem("supreme.music") ?? "0.35");
  ui.music = mv;
  initMusic(mv);
  ui.voice = localStorage.getItem("supreme.voice") !== "0";
  setVoiceEnabled(ui.voice);
}

function onDown(c: GameClient, e: PointerEvent): void {
  sfx.unlock();
  syncModifiers(c.keys, e);
  // clic sur la carte : le champ qui avait le focus (discussion, liste…) rend le clavier au jeu
  const f = document.activeElement as HTMLElement | null;
  if (f && isTextField(f)) f.blur();
  const [x, y] = localXY(c, e);
  c.mouse.x = x;
  c.mouse.y = y;
  if (e.button === 1) {
    c.middle = { active: true, x: e.clientX, y: e.clientY };
    e.preventDefault();
    return;
  }
  // Alt+clic : ping pour l'équipe
  if (e.button === 0 && e.altKey && !ui.mode) {
    const g = c.groundAt(x, y);
    if (g) c.sendPing(g.x, g.z);
    return;
  }
  c.mouse.down = true;
  c.mouse.button = e.button;
  c.mouse.startX = x;
  c.mouse.startY = y;
  c.mouse.dragging = false;
  if (e.button === 0 && ui.mode === "build") {
    const g = c.groundAt(x, y);
    if (g) c.ghostStart = snapBuild(c, g);
    c.lineEndDir = null;
    c.lineFrozen = [];
    c.lineAxis = null;
  }
  if (e.button === 0) c.plans.down();
  // clic droit sur le terrain avec des unités : le glisser oriente la formation (sinon : caméra)
  c.formStart = null;
  c.formAngle = null;
  if (e.button === 2 && !ui.mode && ui.me >= 0 && c.selectedUnits().length > 0) {
    const g = c.groundAt(x, y);
    if (g) c.formStart = { x: g.x, z: g.z };
  }
}

/** Unités sélectionnées à mettre en formation : rayon (cases) par identifiant. */
function formationUnits(c: GameClient): Map<number, number> {
  const out = new Map<number, number>();
  const f = c.frame;
  if (!f) return out;
  for (let i = 0, o = f.unitOff; i < f.nUnits; i++, o += UNIT_WORDS) {
    const id = f.buf[o] >>> 0;
    if (!c.selected.has(id) || ((f.buf[o + 1] >> 8) & 0xff) !== ui.me) continue;
    out.set(id, c.data!.units[f.buf[o + 1] & 0xff].radius / TILE);
  }
  return out;
}

function updateFormationPreview(c: GameClient, x: number, y: number, queue: boolean): void {
  const sc = c.scene;
  const start = c.formStart;
  if (!sc || !start) return;
  const g = c.groundAt(x, y);
  if (!g) return;
  const len = Math.hypot(g.x - start.x, g.z - start.z);
  if (len < 0.6) {
    c.formAngle = null;
    c.formPreview = null;
    sc.setFormation(null);
    return;
  }
  const angle = Math.atan2(g.z - start.z, g.x - start.x);
  c.formAngle = angle;
  c.formPreview = { x: start.x, z: start.z, angle, len, queue };
  void drawFormationPreview(c);
}

/** Demande les places à la simulation (les mêmes que l'ordre) et les affiche, jusqu'au dernier geste. */
async function drawFormationPreview(c: GameClient): Promise<void> {
  if (c.formAsked) return;
  c.formAsked = true;
  try {
    for (let p = c.formPreview; p; ) {
      const sizes = formationUnits(c);
      const a = [ui.me, Math.round(p.x * TILE), Math.round(p.z * TILE), Ord.simAngle(p.angle), p.queue ? 1 : 0, ...sizes.keys()];
      const s = (await c.query<number[] | null>("formation", a)) ?? [];
      if (!c.formPreview) return;
      const slots: { x: number; z: number; size: number }[] = [];
      for (let i = 0; i + 2 < s.length; i += 3) slots.push({ x: s[i + 1] / TILE, z: s[i + 2] / TILE, size: (sizes.get(s[i] >>> 0) ?? 0.5) * 0.8 });
      c.scene?.setFormation(slots, p.angle, p, Math.min(p.len, 12));
      const next: typeof c.formPreview = c.formPreview;
      p = next === p ? null : next;
    }
  } finally {
    c.formAsked = false;
  }
}

function onMove(c: GameClient, e: PointerEvent): void {
  syncModifiers(c.keys, e);
  if (!c.canvasEl) return;
  const [x, y] = localXY(c, e);
  c.mouse.x = x;
  c.mouse.y = y;
  const sc = c.scene;
  if (!sc) return;
  if (c.middle.active) {
    const dx = e.clientX - c.middle.x;
    const dy = e.clientY - c.middle.y;
    c.middle.x = e.clientX;
    c.middle.y = e.clientY;
    sc.yaw -= dx * 0.005;
    sc.tilt += dy * 0.005;
    return;
  }
  if (c.mouse.down && Math.hypot(x - c.mouse.startX, y - c.mouse.startY) > 6) c.mouse.dragging = true;
  c.updateCursor();
  if (ui.mode === "build") c.updateGhost();
  else c.plans.move();
  if (c.mouse.down && c.mouse.button === 0 && c.mouse.dragging && ui.mode !== "build" && ui.mode !== "copy" && ui.mode !== "paste" && c.selBox) {
    const b = c.selBox;
    b.style.display = "block";
    b.style.left = Math.min(x, c.mouse.startX) + "px";
    b.style.top = Math.min(y, c.mouse.startY) + "px";
    b.style.width = Math.abs(x - c.mouse.startX) + "px";
    b.style.height = Math.abs(y - c.mouse.startY) + "px";
  }
  // clic droit glissé : orientation de la formation (unités sélectionnées) ou déplacement de la caméra
  if (c.mouse.down && c.mouse.button === 2 && c.mouse.dragging && c.formStart) {
    updateFormationPreview(c, x, y, e.shiftKey);
  } else if (c.mouse.down && c.mouse.button === 2 && c.mouse.dragging) {
    const k = sc.distance / (c.canvasEl.clientHeight * 0.6);
    sc.target.x -= e.movementX * k * Math.cos(sc.yaw) + e.movementY * k * Math.sin(sc.yaw);
    sc.target.z -= -e.movementX * k * Math.sin(sc.yaw) + e.movementY * k * Math.cos(sc.yaw);
  }
}

function onUp(c: GameClient, e: PointerEvent): void {
  if (e.button === 1) {
    c.middle.active = false;
    return;
  }
  if (!c.mouse.down) return;
  c.mouse.down = false;
  if (c.selBox) c.selBox.style.display = "none";
  const [x, y] = localXY(c, e);
  if (!c.canvasEl?.contains(e.target as Node) && !c.mouse.dragging) return;
  if (e.button === 0) {
    if (ui.mode === "build") {
      if (c.deployUnits.length) placeDeploy(c, e.shiftKey);
      else if (c.poleGen) placePole(c, e.shiftKey);
      else placeBuildings(c, e.shiftKey);
      return;
    }
    if (ui.mode === "copy" || ui.mode === "paste") {
      c.plans.up(e.shiftKey);
      return;
    }
    if (ui.mode === "reclaim" && c.mouse.dragging) {
      // cadre de recyclage : tous nos bâtiments et les épaves du cadre
      void reclaimArea(c, c.mouse.startX, c.mouse.startY, x, y, e.shiftKey);
      if (c.selBox) c.selBox.style.display = "none";
      return;
    }
    if (ui.mode) {
      modeClick(c, x, y, e.shiftKey);
      return;
    }
    if (c.mouse.dragging) boxSelect(c, c.mouse.startX, c.mouse.startY, x, y, e.shiftKey);
    else clickSelect(c, x, y, e.shiftKey, e.ctrlKey);
  } else if (e.button === 2) {
    const start = c.formStart;
    const angle = c.formAngle;
    c.formStart = null;
    c.formAngle = null;
    c.formPreview = null;
    c.scene?.setFormation(null);
    if (c.mouse.dragging && start && angle !== null && c.data && ui.me >= 0) {
      // formation orientée : rectangle par rôles tourné vers la direction du glisser (places calculées
      // par la simulation), à la vitesse du plus lent ; chacun se tourne vers cette direction à l'arrivée
      const ids = [...formationUnits(c).keys()];
      if (ids.length) {
        c.cmd(Ord.moveFormation(ids, Math.round(start.x * TILE), Math.round(start.z * TILE), angle, e.shiftKey));
        c.scene?.addMarker(start.x, start.z, 0x7dff9a);
        sfx.confirm();
      }
      return;
    }
    if (c.mouse.dragging) return;
    if (ui.mode) {
      c.cancelMode();
      return;
    }
    contextCommand(c, x, y, e.shiftKey);
  }
}

function onWheel(gc: GameClient, e: WheelEvent): void {
  e.preventDefault();
  const sc = gc.scene;
  if (!sc) return;
  // pose d'un répartiteur : la molette choisit ses sorties (les trois, gauche et avant, droite et avant)
  if (ui.mode === "build" && gc.data?.buildings[ui.buildKind]?.key === "splitter" && !e.ctrlKey) {
    ui.buildSplit = (ui.buildSplit + (e.deltaY < 0 ? 1 : 2)) % 3;
    sfx.click();
    gc.updateGhost();
    return;
  }
  // pose de tapis : la molette choisit le niveau (sol, étage 1, étage 2) au lieu du zoom. Pendant le
  // tracé, la partie déjà tracée garde son niveau : seule la suite de la file monte ou descend
  if (ui.mode === "build" && gc.isBeltKind() && !e.ctrlKey) {
    const f = Math.max(0, Math.min(2, ui.buildFloor + (e.deltaY < 0 ? 1 : -1)));
    if (f !== ui.buildFloor) {
      const cells = gc.ghostCells;
      if (gc.mouse.down && gc.ghostStart && cells.length > 1 && cells.length > gc.lineFrozen.length) {
        gc.lineFrozen = cells.map((c) => ({ x: c.x, y: c.y, dir: c.dir, floor: c.floor ?? 0 }));
        gc.lineAxis = null;
        gc.lineEndDir = null;
      }
      ui.buildFloor = f;
      sfx.click();
      gc.updateGhost();
    }
    return;
  }
  const [x, y] = localXY(gc, e);
  const before = gc.groundAt(x, y);
  const f = Math.exp(Math.sign(e.deltaY) * Math.min(0.5, Math.abs(e.deltaY) / 400));
  sc.distance *= f;
  sc.clampCamera();
  sc.updateCamera();
  // zoom vers le curseur
  const after = gc.groundAt(x, y);
  if (before && after) {
    sc.target.x += before.x - after.x;
    sc.target.z += before.z - after.z;
  }
}
