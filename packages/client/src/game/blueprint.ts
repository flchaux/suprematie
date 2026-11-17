// Plans (copier / coller de zones d'usine) : logique pure, sans DOM ni Svelte, testée seule.
//
// Un plan est une liste de pièces : type de bâtiment (par sa clé, pour survivre à l'ajout de
// nouveaux bâtiments), position relative en cases, direction (0 est, 1 sud, 2 ouest, 3 nord)
// et recette éventuelle (clé de recette pour un fabricant, clé d'objet pour un entrepôt).
// L'empreinte d'un bâtiment tourné d'un quart de tour échange largeur et hauteur, comme dans
// la simulation (buildings::dims).
import { BClass, BUILD_FULL, RECIPE_NONE } from "@supreme/shared";

/** Ce que la logique des plans lit dans les données de jeu. */
export interface PlanData {
  buildings: { key: string; w: number; h: number; cls: number; crafter?: number }[];
  recipes: { key: string }[];
  items: { key: string }[];
}

export interface PlanPart { key: string; x: number; y: number; dir: number; recipe?: string }
export interface Plan { id: string; name: string; parts: PlanPart[]; created: number }

/** Bâtiment lu dans le tampon de rendu. */
export interface SeenBuilding { ref: number; kind: number; owner: number; dir: number; x: number; y: number; build: number }

/** Bâtiment d'un plan posé sur la carte (type par son indice). */
export interface PlacedCell { kind: number; x: number; y: number; dir: number; recipe: number }

/** Nombre maximal de pièces dans un plan (import compris). */
export const MAX_PARTS = 2000;
/** Taille maximale d'un plan (cases). */
export const MAX_SPAN = 256;

export function dims(data: PlanData, kind: number, dir: number): [number, number] {
  const d = data.buildings[kind];
  return dir & 1 ? [d.h, d.w] : [d.w, d.h];
}

function kindIndex(data: PlanData): Map<string, number> {
  return new Map(data.buildings.map((b, i) => [b.key, i]));
}

/** Rectangle englobant des pièces connues : largeur et hauteur en cases. */
export function planSize(data: PlanData, parts: PlanPart[]): { w: number; h: number } {
  const idx = kindIndex(data);
  let w = 0;
  let h = 0;
  for (const p of parts) {
    const k = idx.get(p.key);
    if (k === undefined) continue;
    const [bw, bh] = dims(data, k, p.dir);
    w = Math.max(w, p.x + bw);
    h = Math.max(h, p.y + bh);
  }
  return { w, h };
}

/** Ramène le coin du plan en (0, 0) et trie les pièces (ligne, puis colonne). */
export function normalize(data: PlanData, parts: PlanPart[]): PlanPart[] {
  if (!parts.length) return [];
  const mx = Math.min(...parts.map((p) => p.x));
  const my = Math.min(...parts.map((p) => p.y));
  return parts.map((p) => ({ ...p, x: p.x - mx, y: p.y - my })).sort((a, b) => a.y - b.y || a.x - b.x || a.key.localeCompare(b.key));
}

/**
 * Quart de tour dans le sens des aiguilles d'une montre (vu du dessus, y vers le bas) :
 * la case (x, y) va en (-y-1, x) et chaque direction avance d'un cran (est → sud…).
 * Un bâtiment w × h qui occupe [x, x+w) × [y, y+h) occupe ensuite [-(y+h), -y) × [x, x+w).
 */
export function rotatePlan(data: PlanData, parts: PlanPart[]): PlanPart[] {
  const idx = kindIndex(data);
  const out: PlanPart[] = [];
  for (const p of parts) {
    const k = idx.get(p.key);
    if (k === undefined) continue;
    const [, bh] = dims(data, k, p.dir);
    out.push({ ...p, x: -(p.y + bh), y: p.x, dir: (p.dir + 1) & 3 });
  }
  return normalize(data, out);
}

/** Recette à mémoriser : fabricant d'assemblage ou recette verrouillée par le joueur, sortie d'un entrepôt. */
export function recipeKey(data: PlanData, kind: number, info: { recipe?: number; repeat?: boolean } | null): string | undefined {
  const def = data.buildings[kind];
  const r = info?.recipe;
  if (r === undefined || r === RECIPE_NONE) return undefined;
  if (def.cls === BClass.Crafter && (def.crafter === 1 || info?.repeat)) return data.recipes[r]?.key;
  if (def.cls === BClass.Warehouse && r > 0) return data.items[r]?.key;
  return undefined;
}

/** Faut-il demander la recette de ce bâtiment à la simulation ? */
export function hasRecipe(data: PlanData, kind: number): boolean {
  const c = data.buildings[kind].cls;
  return c === BClass.Crafter || c === BClass.Warehouse;
}

/**
 * Bâtiments terminés du joueur entièrement compris dans le rectangle de cases [x0, x1] × [y0, y1]
 * (bornes comprises), par position (ligne, puis colonne).
 */
export function captureArea(data: PlanData, seen: SeenBuilding[], me: number, x0: number, y0: number, x1: number, y1: number): SeenBuilding[] {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  return seen
    .filter((b) => {
      if (b.owner !== me || b.build < BUILD_FULL || !data.buildings[b.kind]) return false;
      const [w, h] = dims(data, b.kind, b.dir);
      return b.x >= ax && b.y >= ay && b.x + w - 1 <= bx && b.y + h - 1 <= by;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x || a.ref - b.ref);
}

/** Pièces d'un plan à partir des bâtiments capturés (recettes dans le même ordre, ou absentes). */
export function partsFrom(data: PlanData, caught: SeenBuilding[], recipes: (string | undefined)[] = []): PlanPart[] {
  return normalize(
    data,
    caught.map((b, i) => {
      const p: PlanPart = { key: data.buildings[b.kind].key, x: b.x, y: b.y, dir: b.dir & 3 };
      if (recipes[i]) p.recipe = recipes[i];
      return p;
    }),
  );
}

/** Position des pièces quand le plan est centré sur la case (cx, cy) ; les types inconnus sont ignorés. */
export function placePlan(data: PlanData, parts: PlanPart[], cx: number, cy: number): PlacedCell[] {
  const idx = kindIndex(data);
  const { w, h } = planSize(data, parts);
  const ox = Math.round(cx - w / 2);
  const oy = Math.round(cy - h / 2);
  const out: PlacedCell[] = [];
  for (const p of parts) {
    const k = idx.get(p.key);
    if (k === undefined) continue;
    let recipe = -1;
    if (p.recipe) {
      const cls = data.buildings[k].cls;
      recipe = cls === BClass.Warehouse ? data.items.findIndex((it) => it.key === p.recipe) : data.recipes.findIndex((r) => r.key === p.recipe);
    }
    out.push({ kind: k, x: ox + p.x, y: oy + p.y, dir: p.dir, recipe });
  }
  return out;
}

/** Indices des cases regroupés par type (types croissants), pour une requête canPlaceMany par type. */
export function groupByKind(cells: { kind: number }[]): [number, number[]][] {
  const m = new Map<number, number[]>();
  cells.forEach((c, i) => {
    const l = m.get(c.kind);
    if (l) l.push(i);
    else m.set(c.kind, [i]);
  });
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/** Arguments de canPlaceMany : [joueur, type, puis (x, y, dir)…]. */
export function canPlaceArgs(me: number, kind: number, cells: { x: number; y: number; dir: number }[]): number[] {
  const a = [me, kind];
  for (const c of cells) a.push(c.x, c.y, c.dir);
  return a;
}

function center(data: PlanData, c: PlacedCell): [number, number] {
  const [w, h] = dims(data, c.kind, c.dir);
  return [c.x + w / 2, c.y + h / 2];
}

/** Ordre du plus proche voisin depuis (sx, sy) (en cases), comme une pose en ligne. */
export function nearestOrder<T extends PlacedCell>(data: PlanData, cells: T[], sx: number, sy: number): T[] {
  const left = cells.map((c) => ({ c, p: center(data, c) }));
  const out: T[] = [];
  let x = sx;
  let y = sy;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = (left[i].p[0] - x) ** 2 + (left[i].p[1] - y) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const [n] = left.splice(bi, 1);
    out.push(n.c);
    [x, y] = n.p;
  }
  return out;
}

/** Pièces par ingénieur en dessous desquelles on ne partage pas le travail. */
export const SHARE_MIN = 4;

/**
 * Répartit les chantiers entre ingénieurs (positions en cases) : la file du plus proche voisin
 * est coupée en tronçons contigus, un par ingénieur (au plus un tronçon pour SHARE_MIN pièces) ;
 * chaque tronçon va à l'ingénieur libre le plus proche, les ingénieurs en trop renforcent le
 * tronçon le plus proche d'eux. Chaque tronçon est ensuite réordonné depuis ses ingénieurs.
 */
export function splitAmong<T extends PlacedCell>(data: PlanData, cells: T[], engs: { id: number; x: number; y: number }[]): { ids: number[]; cells: T[] }[] {
  if (!cells.length || !engs.length) return [];
  const cx = engs.reduce((s, e) => s + e.x, 0) / engs.length;
  const cy = engs.reduce((s, e) => s + e.y, 0) / engs.length;
  const order = nearestOrder(data, cells, cx, cy);
  const k = Math.max(1, Math.min(engs.length, Math.floor(order.length / SHARE_MIN)));
  const chunks: { ids: number[]; cells: T[]; start: [number, number] }[] = [];
  for (let i = 0; i < k; i++) {
    const part = order.slice(Math.floor((i * order.length) / k), Math.floor(((i + 1) * order.length) / k));
    chunks.push({ ids: [], cells: part, start: center(data, part[0]) });
  }
  const free = [...engs].sort((a, b) => a.id - b.id);
  const dist = (e: { x: number; y: number }, p: [number, number]) => (e.x - p[0]) ** 2 + (e.y - p[1]) ** 2;
  for (const ch of chunks) {
    let bi = 0;
    for (let i = 1; i < free.length; i++) if (dist(free[i], ch.start) < dist(free[bi], ch.start)) bi = i;
    ch.ids.push(free.splice(bi, 1)[0].id);
  }
  for (const e of free) {
    let best = chunks[0];
    for (const ch of chunks) if (dist(e, ch.start) < dist(e, best.start)) best = ch;
    best.ids.push(e.id);
  }
  for (const ch of chunks) {
    const mine = engs.filter((e) => ch.ids.includes(e.id));
    const mx = mine.reduce((s, e) => s + e.x, 0) / mine.length;
    const my = mine.reduce((s, e) => s + e.y, 0) / mine.length;
    ch.cells = nearestOrder(data, ch.cells, mx, my);
    ch.ids.sort((a, b) => a - b);
  }
  return chunks.map(({ ids, cells }) => ({ ids, cells }));
}

// ---------- export / import (texte à copier-coller entre joueurs) ----------

export const EXPORT_PREFIX = "SUPREME-PLAN-1:";

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function fromBase64(s: string): string {
  const bin = atob(s);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Chaîne d'export : préfixe + JSON compact en base 64 ({ n: nom, p: [[clé, x, y, dir, recette?]…] }). */
export function exportPlan(plan: Pick<Plan, "name" | "parts">): string {
  const p = plan.parts.map((x) => (x.recipe ? [x.key, x.x, x.y, x.dir, x.recipe] : [x.key, x.x, x.y, x.dir]));
  return EXPORT_PREFIX + toBase64(JSON.stringify({ n: plan.name, p }));
}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/**
 * Lit une chaîne d'export (espaces et retours à la ligne tolérés). Les pièces mal formées sont
 * refusées ; avec les données de jeu, les types inconnus sont écartés et comptés.
 */
export function importPlan(text: string, data?: PlanData): { ok: true; name: string; parts: PlanPart[]; unknown: number } | { ok: false; error: string } {
  const t = text.replace(/\s+/g, "");
  if (!t.startsWith(EXPORT_PREFIX)) return { ok: false, error: "Ce texte n'est pas un plan exporté (il doit commencer par « SUPREME-PLAN-1: »)" };
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64(t.slice(EXPORT_PREFIX.length)));
  } catch {
    return { ok: false, error: "Plan illisible : le texte est incomplet ou abîmé" };
  }
  const o = raw as { n?: unknown; p?: unknown };
  if (!o || typeof o !== "object" || !Array.isArray(o.p)) return { ok: false, error: "Plan illisible : liste des bâtiments absente" };
  if (o.p.length > MAX_PARTS) return { ok: false, error: `Plan trop grand (${o.p.length} bâtiments, ${MAX_PARTS} au plus)` };
  const known = data ? kindIndex(data) : null;
  const parts: PlanPart[] = [];
  let unknown = 0;
  for (const e of o.p) {
    if (!Array.isArray(e) || e.length < 4 || e.length > 5) return { ok: false, error: "Plan illisible : bâtiment mal décrit" };
    const [key, x, y, dir, recipe] = e as unknown[];
    if (typeof key !== "string" || key.length > 40 || !isInt(x, 0, MAX_SPAN - 1) || !isInt(y, 0, MAX_SPAN - 1) || !isInt(dir, 0, 3)) return { ok: false, error: "Plan illisible : bâtiment mal décrit" };
    if (recipe !== undefined && (typeof recipe !== "string" || recipe.length > 40)) return { ok: false, error: "Plan illisible : recette mal décrite" };
    if (known && !known.has(key)) {
      unknown++;
      continue;
    }
    parts.push(recipe ? { key, x, y, dir, recipe } : { key, x, y, dir });
  }
  if (!parts.length) return { ok: false, error: unknown ? "Aucun bâtiment de ce plan n'existe dans cette version du jeu" : "Plan vide" };
  const name = typeof o.n === "string" && o.n.trim() ? o.n.trim().slice(0, 60) : "Plan importé";
  return { ok: true, name, parts: data ? normalize(data, parts) : parts, unknown };
}

// ---------- bibliothèque (localStorage) ----------

export interface Library { plans: Plan[]; active: string }
export type PlanStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export const LIBRARY_KEY = "supreme.plans";

/** Bibliothèque enregistrée ; vide si le stockage est absent ou illisible. */
export function loadLibrary(storage: PlanStorage | null): Library {
  try {
    const raw = JSON.parse(storage?.getItem(LIBRARY_KEY) ?? "null") as { plans?: unknown; active?: unknown } | null;
    if (!raw || !Array.isArray(raw.plans)) return { plans: [], active: "" };
    const plans: Plan[] = [];
    for (const p of raw.plans as Partial<Plan>[]) {
      if (!p || typeof p.id !== "string" || typeof p.name !== "string" || !Array.isArray(p.parts)) continue;
      const parts = p.parts.filter((x): x is PlanPart => !!x && typeof x.key === "string" && isInt(x.x, 0, MAX_SPAN) && isInt(x.y, 0, MAX_SPAN) && isInt(x.dir, 0, 3));
      if (parts.length) plans.push({ id: p.id, name: p.name, parts, created: Number(p.created) || 0 });
    }
    const active = typeof raw.active === "string" && plans.some((p) => p.id === raw.active) ? raw.active : (plans[0]?.id ?? "");
    return { plans, active };
  } catch {
    return { plans: [], active: "" };
  }
}

/** Enregistre la bibliothèque ; faux si le stockage est indisponible ou plein. */
export function saveLibrary(storage: PlanStorage | null, lib: Library): boolean {
  try {
    if (!storage) return false;
    storage.setItem(LIBRARY_KEY, JSON.stringify({ plans: lib.plans, active: lib.active }));
    return true;
  } catch {
    return false;
  }
}

/** Nom libre « Plan n ». */
export function nextName(plans: { name: string }[]): string {
  const used = new Set(plans.map((p) => p.name));
  let n = plans.length + 1;
  while (used.has(`Plan ${n}`)) n++;
  return `Plan ${n}`;
}
