// Plans côté interface : bibliothèque (localStorage), outil « Copier » (cadre au sol), outil
// « Coller » (fantômes de tout le plan, rotation, ordres de construction répartis entre les
// ingénieurs sélectionnés) et recettes à rétablir quand les bâtiments collés sont terminés.
// La logique pure (rotation, export, regroupements) est dans blueprint.ts.
import * as Ord from "@supreme/shared/orders.ts";
import { BUILDING_WORDS, BUILD_FULL } from "@supreme/shared";
import type { Frame } from "@supreme/shared";
import type { GameClient } from "./client.ts";
import { ui, pushMessage } from "./state.svelte.ts";
import { keyOf } from "./keys.svelte.ts";
import { sfx } from "../audio/sound.ts";
import * as BP from "./blueprint.ts";

const TILE = 256;
/** Délai au-delà duquel on renonce à rétablir une recette (ms). */
const RECIPE_WAIT = 5 * 60 * 1000;

function storage(): BP.PlanStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const saved = BP.loadLibrary(storage());

export const plans = $state({
  list: saved.plans,
  /** Plan actif (le dernier copié, importé ou choisi). */
  active: saved.active,
  /** Panneau de la bibliothèque ouvert. */
  show: false,
  /** Résumé affiché pendant le collage (« 12 / 14 posables »). */
  status: "",
});

function persist(): void {
  if (!BP.saveLibrary(storage(), { plans: plans.list, active: plans.active })) pushMessage("Plans : enregistrement impossible dans ce navigateur (ils valent pour cette session)", "alert");
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function activePlan(): BP.Plan | null {
  return plans.list.find((p) => p.id === plans.active) ?? null;
}

export function addPlan(name: string, parts: BP.PlanPart[]): BP.Plan {
  const p: BP.Plan = { id: newId(), name, parts, created: Date.now() };
  plans.list = [p, ...plans.list];
  plans.active = p.id;
  persist();
  return p;
}

export function renamePlan(id: string, name: string): void {
  const p = plans.list.find((x) => x.id === id);
  const n = name.trim().slice(0, 60);
  if (!p || !n) return;
  p.name = n;
  persist();
}

export function removePlan(id: string): void {
  plans.list = plans.list.filter((p) => p.id !== id);
  if (plans.active === id) plans.active = plans.list[0]?.id ?? "";
  persist();
}

export function setActive(id: string): void {
  plans.active = id;
  persist();
}

export function exportText(id: string): string {
  const p = plans.list.find((x) => x.id === id);
  return p ? BP.exportPlan(p) : "";
}

/** Importe une chaîne d'export ; renvoie un message d'erreur ou null. */
export function importText(text: string): string | null {
  const r = BP.importPlan(text, ui.data ?? undefined);
  if (!r.ok) return r.error;
  const p = addPlan(r.name, r.parts);
  pushMessage(`Plan « ${p.name} » importé : ${p.parts.length} bâtiments${r.unknown ? ` (${r.unknown} de type inconnu ignorés)` : ""}`, "good");
  return null;
}

/** Bâtiments du tampon de rendu. */
export function seenBuildings(f: Frame): BP.SeenBuilding[] {
  const out: BP.SeenBuilding[] = [];
  const b = f.buf;
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const w = b[o + 1];
    out.push({ ref: b[o] >>> 0, kind: w & 0xff, owner: (w >> 8) & 0xff, dir: (w >> 16) & 3, x: b[o + 2] & 0xffff, y: (b[o + 2] >>> 16) & 0xffff, build: b[o + 4] });
  }
  return out;
}

interface PendingRecipe { kind: number; x: number; y: number; recipe: number; ref: number; until: number; checked: number }

/** Outils « Copier » et « Coller » ; branché sur le contrôleur de partie. */
export class PlanTool {
  private copyStart: { x: number; y: number } | null = null;
  /** Plan sous le curseur (tourné par R). */
  private cursor: BP.PlanPart[] = [];
  private turns = 0;
  private cells: (BP.PlacedCell & { ok: boolean })[] = [];
  private seq = 0;
  private lastKey = "";
  pending: PendingRecipe[] = [];

  constructor(private c: GameClient) {}

  private tileAt(): { x: number; y: number } | null {
    const g = this.c.groundAt(this.c.mouse.x, this.c.mouse.y);
    return g ? { x: Math.floor(g.x), y: Math.floor(g.z) } : null;
  }

  startCopy(): void {
    // copier ne donne aucun ordre : permis aussi en démo vue par un joueur
    if (ui.me < 0) return;
    this.c.cancelMode();
    this.c.setMode("copy");
  }

  startPaste(id = plans.active): void {
    if (ui.me < 0 || ui.spectator || !this.c.data) return;
    const p = plans.list.find((x) => x.id === id);
    if (!p) {
      const k = keyOf("copyPlan");
      pushMessage(`Aucun plan : copiez d'abord une zone${k ? ` (${k})` : ""}`, "alert");
      sfx.error();
      return;
    }
    if (plans.active !== id) setActive(id);
    this.c.cancelMode();
    this.cursor = p.parts;
    this.turns = 0;
    this.c.setMode("paste");
    void this.updatePaste();
  }

  rotate(): void {
    if (ui.mode !== "paste" || !this.c.data) return;
    this.cursor = BP.rotatePlan(this.c.data, this.cursor);
    this.turns = (this.turns + 1) & 3;
    sfx.click();
    void this.updatePaste(true);
  }

  /** Effacer les aides visuelles (fin d'un mode). */
  clear(): void {
    this.copyStart = null;
    this.cells = [];
    this.lastKey = "";
    this.seq++;
    plans.status = "";
    this.c.scene?.setArea(null);
    this.c.scene?.setGhosts([]);
  }

  down(): void {
    if (ui.mode === "copy") this.copyStart = this.tileAt();
  }

  move(): void {
    if (ui.mode === "paste") void this.updatePaste();
    else if (ui.mode === "copy" && this.c.mouse.down && this.copyStart) this.previewCopy();
  }

  up(shift: boolean): void {
    if (ui.mode === "copy") void this.finishCopy();
    else if (ui.mode === "paste") this.paste(shift);
  }

  private copyRect(): { x0: number; y0: number; x1: number; y1: number } | null {
    const end = this.tileAt();
    const a = this.copyStart ?? end;
    if (!a || !end) return null;
    return { x0: a.x, y0: a.y, x1: end.x, y1: end.y };
  }

  private caught(r: { x0: number; y0: number; x1: number; y1: number }): BP.SeenBuilding[] {
    const f = this.c.frame;
    if (!f || !this.c.data) return [];
    return BP.captureArea(this.c.data, seenBuildings(f), ui.me, r.x0, r.y0, r.x1, r.y1);
  }

  private previewCopy(): void {
    const r = this.copyRect();
    const sc = this.c.scene;
    if (!r || !sc) return;
    sc.setArea(r);
    const caught = this.caught(r);
    sc.setGhosts(BP.groupByKind(caught).map(([kind, idx]) => ({ kind, cells: idx.map((i) => ({ ...caught[i], ok: true })), tint: 0x3ef0ff })));
    plans.status = `${caught.length} bâtiment${caught.length > 1 ? "s" : ""}`;
  }

  private async finishCopy(): Promise<void> {
    const data = this.c.data;
    const r = this.copyRect();
    this.clear();
    if (!data || !r) return;
    if (this.c.scene?.strategic) {
      pushMessage("Rapprochez la caméra : en vue stratégique, tapis et bras ne sont pas visibles", "alert");
      sfx.error();
      return;
    }
    const caught = this.caught(r);
    if (!caught.length) {
      pushMessage("Aucun de vos bâtiments terminés n'est entièrement dans ce cadre", "alert");
      sfx.error();
      return;
    }
    if (caught.length > BP.MAX_PARTS) {
      pushMessage(`Zone trop grande : ${caught.length} bâtiments (${BP.MAX_PARTS} au plus)`, "alert");
      sfx.error();
      return;
    }
    this.c.cancelMode();
    const infos = await Promise.all(caught.map((b) => (BP.hasRecipe(data, b.kind) ? this.c.query<{ recipe: number; repeat: boolean } | null>("building", [b.ref]) : Promise.resolve(null))));
    const parts = BP.partsFrom(data, caught, caught.map((b, i) => BP.recipeKey(data, b.kind, infos[i])));
    const p = addPlan(BP.nextName(plans.list), parts);
    const { w, h } = BP.planSize(data, parts);
    const kv = keyOf("pastePlan");
    pushMessage(`Plan « ${p.name} » copié : ${parts.length} bâtiment${parts.length > 1 ? "s" : ""}, ${w}×${h} cases${kv ? ` (${kv} pour coller)` : ""}`, "good");
    sfx.confirm();
    // comme dans Factorio : le plan copié passe sous le curseur si un bâtisseur est sélectionné
    if (ui.canBuild) this.startPaste(p.id);
  }

  private async updatePaste(force = false): Promise<void> {
    const data = this.c.data;
    const sc = this.c.scene;
    const g = this.c.groundAt(this.c.mouse.x, this.c.mouse.y);
    if (ui.mode !== "paste" || !data || !sc || !g) return;
    const placed = BP.placePlan(data, this.cursor, g.x, g.z);
    if (!placed.length) return;
    const ox = Math.min(...placed.map((c) => c.x));
    const oy = Math.min(...placed.map((c) => c.y));
    const key = `${ox},${oy},${this.turns}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    const seq = ++this.seq;
    const groups = BP.groupByKind(placed);
    const res = await Promise.all(groups.map(([kind, idx]) => this.c.query<boolean[]>("canPlaceMany", BP.canPlaceArgs(ui.me, kind, idx.map((i) => placed[i])))));
    if (seq !== this.seq || ui.mode !== "paste") return;
    const cells = placed.map((c) => ({ ...c, ok: false }));
    groups.forEach(([, idx], j) => idx.forEach((i, n) => (cells[i].ok = !!res[j]?.[n])));
    this.cells = cells;
    sc.setGhosts(groups.map(([kind, idx]) => ({ kind, cells: idx.map((i) => cells[i]) })));
    const { w, h } = BP.planSize(data, this.cursor);
    sc.setArea({ x0: ox, y0: oy, x1: ox + w - 1, y1: oy + h - 1, color: 0xffb547, fill: 0.05 });
    const ok = cells.filter((c) => c.ok).length;
    plans.status = ok === cells.length ? `${ok} bâtiment${ok > 1 ? "s" : ""}` : `${ok} / ${cells.length} posables`;
  }

  private paste(shift: boolean): void {
    const data = this.c.data;
    if (!data) return;
    const engs = this.c.selectedUnits().filter((u) => data.units[u.kind].buildPower > 0);
    if (!engs.length) {
      pushMessage("Sélectionnez un ingénieur ou le robot de commandement", "alert");
      sfx.error();
      return;
    }
    const valid = this.cells.filter((c) => c.ok);
    if (!valid.length) {
      sfx.error();
      return;
    }
    const groups = BP.splitAmong(data, valid, engs.map((e) => ({ id: e.id, x: e.x / TILE, y: e.y / TILE })));
    const now = performance.now();
    for (const g of groups) {
      g.cells.forEach((c, i) => this.c.cmd(Ord.build(g.ids, c.kind, c.x, c.y, c.dir, shift || i > 0)));
      for (const c of g.cells) if (c.recipe >= 0) this.pending.push({ kind: c.kind, x: c.x, y: c.y, recipe: c.recipe, ref: 0, until: now + RECIPE_WAIT, checked: 0 });
    }
    const skipped = this.cells.length - valid.length;
    pushMessage(`Plan collé : ${valid.length} chantier${valid.length > 1 ? "s" : ""}${groups.length > 1 ? ` répartis entre ${groups.length} équipes d'ingénieurs` : ""}${skipped ? `, ${skipped} case${skipped > 1 ? "s" : ""} occupée${skipped > 1 ? "s" : ""} ignorée${skipped > 1 ? "s" : ""}` : ""}`, "good");
    sfx.confirm();
    if (shift) void this.updatePaste(true);
    else this.c.cancelMode();
  }

  /** Recettes en attente : envoyées quand le bâtiment collé est terminé (appelé quelques fois par seconde). */
  tick(): void {
    const f = this.c.frame;
    if (!this.pending.length || !f || ui.me < 0) return;
    const now = performance.now();
    const at = new Map<string, BP.SeenBuilding>();
    for (const b of seenBuildings(f)) if (b.owner === ui.me) at.set(`${b.x},${b.y}`, b);
    this.pending = this.pending.filter((p) => {
      if (now > p.until) return false;
      const b = at.get(`${p.x},${p.y}`);
      if (b && b.kind === p.kind) {
        p.ref = b.ref;
        if (b.build < BUILD_FULL) return true;
        this.c.cmd(Ord.setRecipe(b.ref, p.recipe));
        return false;
      }
      if (b) return false; // autre bâtiment à cet endroit
      // chantier déjà vu mais absent de la vue : détruit ou annulé ?
      if (p.ref && now - p.checked > 2000) {
        p.checked = now;
        const ref = p.ref;
        void this.c.query<unknown>("building", [ref]).then((r) => {
          if (r === null) this.pending = this.pending.filter((x) => x.ref !== ref);
        });
      }
      return true;
    });
  }
}
