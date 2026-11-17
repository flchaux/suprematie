// Raccourcis clavier : actions nommées → touches physiques (KeyboardEvent.code) + modificateurs.
//
// On lit la touche physique et non le caractère : sur un clavier AZERTY, la touche « 1 » donne « & »,
// et les lettres changent de place. Les valeurs par défaut sont choisies d'après la disposition
// détectée (navigator.keyboard.getLayoutMap() quand le navigateur le permet) : chaque ordre garde
// la lettre mnémotechnique affichée sur la touche (A attaque, P patrouille…), où qu'elle soit.
//
// Défilement de la caméra :
// - AZERTY : flèches et ZQSD (positions physiques de WASD) ;
// - QWERTY et autres dispositions : flèches seulement, pour que A reste l'attaque en mouvement
//   (WASD aurait mis « gauche » et « attaque » sur la même touche). On peut ajouter WASD dans
//   l'écran « Raccourcis » : le conflit avec A est alors signalé.
//
// Touches fixes (non personnalisables) : Échap, et les chiffres réservés aux groupes de contrôle
// (rangée des chiffres et pavé numérique : chiffre = sélectionner, deux fois = centrer,
// Maj ou Ctrl + chiffre = créer ; Chrome intercepte Ctrl+1..8, d'où Maj).
// Ce module ne dépend ni de Svelte ni du DOM, pour être testé seul.

/** Contexte où une action s'applique. */
export type Ctx = "global" | "units" | "build" | "factory";

export interface Chord { code: string; shift?: boolean; ctrl?: boolean; alt?: boolean }

export interface ActionDef {
  id: string;
  label: string;
  group: string;
  ctx: Ctx;
  /** Maj est libre (zoom : « + » = Maj + « = ») ou porte un sens (usine : Maj = ×5). */
  shiftFree?: boolean;
  /** Touche maintenue (défilement) : lue à chaque image, pas à l'appui. */
  held?: boolean;
  /** L'auto-répétition du clavier relance l'action. */
  repeat?: boolean;
}

/** Nombre d'emplacements de la rangée de l'usine. */
export const FACTORY_SLOTS = 20;
/** Positions physiques de la rangée de l'usine (rangée du bas : W X C V B N , ; : ! en AZERTY). */
export const FACTORY_ROW = ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"];

export const GROUPS = ["Ordres", "Sélection", "Caméra", "Interface", "Usine"] as const;

export const ACTIONS: ActionDef[] = [
  { id: "attackMove", label: "Attaque en mouvement", group: "Ordres", ctx: "units" },
  { id: "patrol", label: "Patrouille", group: "Ordres", ctx: "units" },
  { id: "stop", label: "Arrêt", group: "Ordres", ctx: "units" },
  { id: "assist", label: "Escorter / assister", group: "Ordres", ctx: "units" },
  { id: "reclaim", label: "Recycler", group: "Ordres", ctx: "units" },
  { id: "deploy", label: "Déployer", group: "Ordres", ctx: "units" },
  { id: "unload", label: "Décharger", group: "Ordres", ctx: "units" },
  { id: "buildMenu", label: "Menu de construction (puis catégorie, puis bâtiment)", group: "Ordres", ctx: "units" },
  { id: "rotate", label: "Tourner le bâtiment ou le plan à poser (file de tapis en cours de tracé : sa fin)", group: "Ordres", ctx: "build" },
  { id: "copyPlan", label: "Plan : copier une zone de vos bâtiments (glisser un cadre)", group: "Ordres", ctx: "global" },
  { id: "pastePlan", label: "Plan : coller le plan actif (Maj+clic : garder l'outil)", group: "Ordres", ctx: "global" },
  { id: "planLibrary", label: "Bibliothèque de plans", group: "Interface", ctx: "global" },
  { id: "selectArmy", label: "Toute l'armée visible", group: "Sélection", ctx: "global" },
  { id: "idleEngineer", label: "Ingénieur inactif suivant", group: "Sélection", ctx: "global" },
  { id: "cancelBuilding", label: "Démolir le bâtiment sélectionné (chantier : annuler ; ingénieurs : recyclage en zone)", group: "Sélection", ctx: "global" },
  { id: "panUp", label: "Défiler vers le haut", group: "Caméra", ctx: "global", held: true, shiftFree: true },
  { id: "panDown", label: "Défiler vers le bas", group: "Caméra", ctx: "global", held: true, shiftFree: true },
  { id: "panLeft", label: "Défiler vers la gauche", group: "Caméra", ctx: "global", held: true, shiftFree: true },
  { id: "panRight", label: "Défiler vers la droite", group: "Caméra", ctx: "global", held: true, shiftFree: true },
  { id: "zoomIn", label: "Rapprocher", group: "Caméra", ctx: "global", shiftFree: true, repeat: true },
  { id: "zoomOut", label: "Éloigner", group: "Caméra", ctx: "global", shiftFree: true, repeat: true },
  { id: "commander", label: "Centrer sur le commandant", group: "Caméra", ctx: "global" },
  { id: "alert", label: "Aller à la dernière alerte", group: "Caméra", ctx: "global" },
  { id: "camGo1", label: "Marque-page 1 : rappeler", group: "Caméra", ctx: "global" },
  { id: "camGo2", label: "Marque-page 2 : rappeler", group: "Caméra", ctx: "global" },
  { id: "camGo3", label: "Marque-page 3 : rappeler", group: "Caméra", ctx: "global" },
  { id: "camSave1", label: "Marque-page 1 : enregistrer", group: "Caméra", ctx: "global" },
  { id: "camSave2", label: "Marque-page 2 : enregistrer", group: "Caméra", ctx: "global" },
  { id: "camSave3", label: "Marque-page 3 : enregistrer", group: "Caméra", ctx: "global" },
  { id: "research", label: "Recherche", group: "Interface", ctx: "global" },
  { id: "stats", label: "Statistiques", group: "Interface", ctx: "global" },
  { id: "help", label: "Aide", group: "Interface", ctx: "global" },
  { id: "chat", label: "Discussion", group: "Interface", ctx: "global" },
  { id: "perf", label: "Détail des performances", group: "Interface", ctx: "global" },
  ...Array.from({ length: FACTORY_SLOTS }, (_, i): ActionDef => ({ id: `factory${i + 1}`, label: `Unité ${i + 1} (Maj : ×5)`, group: "Usine", ctx: "factory", shiftFree: true })),
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
export function actionDef(id: string): ActionDef | undefined {
  return BY_ID.get(id);
}

// ---------- dispositions ----------

export type LayoutKind = "azerty" | "qwerty" | "autre";
export interface Layout {
  kind: LayoutKind;
  /** Caractère affiché (minuscule) par touche physique. */
  chars: Map<string, string>;
  source: "api" | "langue" | "défaut";
}

const US_PUNCT: [string, string][] = [
  ["Minus", "-"], ["Equal", "="], ["BracketLeft", "["], ["BracketRight", "]"], ["Backslash", "\\"], ["Semicolon", ";"],
  ["Quote", "'"], ["Backquote", "`"], ["Comma", ","], ["Period", "."], ["Slash", "/"], ["IntlBackslash", "<"],
];
function usChars(): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(97 + i);
    m.set("Key" + ch.toUpperCase(), ch);
  }
  for (let d = 0; d < 10; d++) m.set("Digit" + d, String(d));
  for (const [c, ch] of US_PUNCT) m.set(c, ch);
  return m;
}
function azertyChars(): Map<string, string> {
  const m = usChars();
  const fr: [string, string][] = [
    ["KeyQ", "a"], ["KeyW", "z"], ["KeyA", "q"], ["KeyZ", "w"], ["KeyM", ","], ["Semicolon", "m"], ["Comma", ";"], ["Period", ":"], ["Slash", "!"],
    ["Digit1", "&"], ["Digit2", "é"], ["Digit3", "\""], ["Digit4", "'"], ["Digit5", "("], ["Digit6", "-"], ["Digit7", "è"], ["Digit8", "_"], ["Digit9", "ç"], ["Digit0", "à"],
    ["Minus", ")"], ["Equal", "="], ["BracketLeft", "^"], ["BracketRight", "$"], ["Quote", "ù"], ["Backslash", "*"], ["Backquote", "²"], ["IntlBackslash", "<"],
  ];
  for (const [c, ch] of fr) m.set(c, ch);
  return m;
}

export function layoutKind(chars: ReadonlyMap<string, string>): LayoutKind {
  const q = chars.get("KeyQ");
  if (q === "a" && chars.get("KeyW") === "z") return "azerty";
  if (q === "q" && chars.get("KeyW") === "w" && chars.get("KeyY") === "y") return "qwerty";
  return "autre";
}

/**
 * Disposition à partir de la carte du navigateur (code → caractère) si elle existe,
 * sinon d'après la langue (français de France ou de Belgique : AZERTY), sinon QWERTY.
 */
export function detectLayout(apiMap?: ReadonlyMap<string, string> | null, lang?: string): Layout {
  if (apiMap && apiMap.size) {
    const chars = new Map<string, string>();
    for (const [c, ch] of apiMap) chars.set(c, ch.toLowerCase());
    return { kind: layoutKind(chars), chars, source: "api" };
  }
  if (lang && /^fr(-(fr|be|lu|mc))?$/i.test(lang)) return { kind: "azerty", chars: azertyChars(), source: "langue" };
  return { kind: "qwerty", chars: usChars(), source: "défaut" };
}

const isDigitCode = (code: string) => /^(Digit|Numpad)[0-9]$/.test(code);

/** Touche physique qui affiche ce caractère (hors chiffres), ou la position QWERTY à défaut. */
export function codeForChar(layout: Layout, ch: string): string | null {
  let other: string | null = null;
  for (const [code, c] of layout.chars) {
    if (c !== ch || isDigitCode(code) || code.startsWith("Numpad")) continue;
    if (code.startsWith("Key")) return code;
    other ??= code;
  }
  if (other) return other;
  if (/^[a-z]$/.test(ch)) return "Key" + ch.toUpperCase();
  return null;
}

/** Raccourcis par défaut pour une disposition. */
export function defaultBindings(layout: Layout): Record<string, Chord[]> {
  const k = (ch: string, mods: Omit<Chord, "code"> = {}): Chord[] => {
    const code = codeForChar(layout, ch);
    return code ? [{ code, ...mods }] : [];
  };
  const named = (code: string, mods: Omit<Chord, "code"> = {}): Chord => ({ code, ...mods });
  const wasd = layout.kind === "azerty"; // ZQSD
  const out: Record<string, Chord[]> = {
    attackMove: k("a"),
    patrol: k("p"),
    stop: k("x"),
    assist: k("g"),
    reclaim: k("e"),
    deploy: k("f"),
    unload: k("u"),
    buildMenu: k("b"),
    rotate: k("r"),
    copyPlan: k("c", { ctrl: true }),
    pastePlan: k("v", { ctrl: true }),
    planLibrary: k("l"),
    selectArmy: k("a", { ctrl: true }),
    idleEngineer: k("i"),
    cancelBuilding: [named("Delete")],
    panUp: [named("ArrowUp"), ...(wasd ? [named("KeyW")] : [])],
    panDown: [named("ArrowDown"), ...(wasd ? [named("KeyS")] : [])],
    panLeft: [named("ArrowLeft"), ...(wasd ? [named("KeyA")] : [])],
    panRight: [named("ArrowRight"), ...(wasd ? [named("KeyD")] : [])],
    zoomIn: [named("NumpadAdd"), ...k("="), named("PageUp")],
    zoomOut: [named("NumpadSubtract"), ...k("-"), named("PageDown")],
    commander: [...k("c"), named("Home")],
    alert: [named("Space")],
    camGo1: [named("F2")],
    camGo2: [named("F3")],
    camGo3: [named("F4")],
    camSave1: [named("F2", { shift: true })],
    camSave2: [named("F3", { shift: true })],
    camSave3: [named("F4", { shift: true })],
    research: k("t"),
    stats: [named("Tab")],
    help: [named("F1"), ...k("h")],
    chat: [named("Enter")],
    // F3 sert aux marque-pages : les performances passent sur F9
    perf: [named("F9")],
  };
  for (let i = 0; i < FACTORY_SLOTS; i++) out[`factory${i + 1}`] = i < FACTORY_ROW.length ? [named(FACTORY_ROW[i])] : [];
  return out;
}

// ---------- libellés ----------

const NAMED: Record<string, string> = {
  Space: "Espace", Enter: "Entrée", Tab: "Tab", Escape: "Échap", Delete: "Suppr", Backspace: "Retour arr.", Insert: "Inser",
  Home: "Origine", End: "Fin", PageUp: "Page ↑", PageDown: "Page ↓",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  NumpadAdd: "Pavé +", NumpadSubtract: "Pavé −", NumpadMultiply: "Pavé ×", NumpadDivide: "Pavé ÷", NumpadEnter: "Pavé Entrée", NumpadDecimal: "Pavé .",
  CapsLock: "Verr. maj", ContextMenu: "Menu", Pause: "Pause", ScrollLock: "Arrêt défil",
};

export function keyLabel(layout: Layout, code: string): string {
  if (NAMED[code]) return NAMED[code];
  if (/^F\d+$/.test(code)) return code;
  if (/^Digit\d$/.test(code)) return code.slice(5); // les touches portent aussi le chiffre
  if (/^Numpad\d$/.test(code)) return "Pavé " + code.slice(6);
  const ch = layout.chars.get(code);
  if (ch && ch.trim()) return ch.toUpperCase();
  return code.replace(/^Key/, "");
}

export function chordLabel(layout: Layout, c: Chord): string {
  return (c.ctrl ? "Ctrl+" : "") + (c.alt ? "Alt+" : "") + (c.shift ? "Maj+" : "") + keyLabel(layout, c.code);
}

// ---------- correspondance ----------

/** Ce qu'on lit d'un KeyboardEvent. */
export interface KeyLike { code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey?: boolean }

const MODIFIER_CODES = new Set(["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "AltGraph"]);
export const isModifierCode = (code: string) => MODIFIER_CODES.has(code);

export function chordMatches(b: Chord, e: KeyLike, shiftFree = false): boolean {
  return b.code === e.code && !!b.ctrl === e.ctrlKey && !!b.alt === e.altKey && (shiftFree || !!b.shift === e.shiftKey);
}

/** Groupe de contrôle : chiffre de la rangée ou du pavé ; Maj ou Ctrl = créer. */
export function groupKey(e: KeyLike): { n: number; create: boolean } | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (!m || e.altKey || e.metaKey) return null;
  return { n: Number(m[1]), create: e.shiftKey || e.ctrlKey };
}

/** Chiffre 1..9 (0 = 10) pour le menu de construction. */
export function digitOf(code: string): number | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (!m) return null;
  return m[1] === "0" ? 10 : Number(m[1]);
}

/** Touche réservée (non attribuable) ou null. */
export function reservedReason(c: Chord): string | null {
  if (c.code === "Escape") return "Échap est réservée (annuler)";
  if (isDigitCode(c.code)) return "Les chiffres sont réservés aux groupes de contrôle";
  if (isModifierCode(c.code)) return "Choisissez une touche autre qu'un modificateur";
  return null;
}

const PRIORITY: Ctx[] = ["factory", "build", "units", "global"];

/** Relation entre deux contextes pour une même touche. */
function ctxRelation(a: Ctx, b: Ctx): "conflit" | "masque" | null {
  if (a === b) return "conflit";
  const s = new Set([a, b]);
  if (s.has("factory")) return s.has("global") ? "masque" : null; // usine sélectionnée : sans unités ni placement
  return "conflit"; // global, unités et placement peuvent être actifs ensemble
}

export interface Conflict {
  /** Action qui l'emporte (usine) ou première action, et l'autre. */
  a: string;
  b: string;
  chord: Chord;
  /** « conflit » : ambiguïté ; « masque » : la touche de l'usine cache l'autre quand une usine est sélectionnée. */
  kind: "conflit" | "masque";
}

function overlap(x: Chord, xFree: boolean, y: Chord, yFree: boolean): boolean {
  return x.code === y.code && !!x.ctrl === !!y.ctrl && !!x.alt === !!y.alt && (xFree || yFree || !!x.shift === !!y.shift);
}

export interface HelpRow { group: string; keys: string; label: string }

/** Lignes de l'aide : touches fixes, puis chaque action avec ses touches actuelles. */
export function helpRows(km: Keymap): HelpRow[] {
  const rows: HelpRow[] = [
    { group: "Sélection", keys: "Maj+1…0 / Ctrl+1…0", label: "Créer ou remplacer un groupe (rangée des chiffres ou pavé numérique)" },
    { group: "Sélection", keys: "1…0", label: "Sélectionner le groupe (deux fois rapidement : centrer la caméra)" },
    { group: "Interface", keys: "Échap", label: "Annuler le mode ou le menu en cours, fermer la fenêtre, désélectionner" },
  ];
  const b = km.short("buildMenu");
  if (b) rows.push({ group: "Ordres", keys: `${b}, 1…6, 1…9`, label: "Construire : catégorie (onglet), puis bâtiment, avec un bâtisseur sélectionné" });
  for (const a of ACTIONS) {
    if (a.group === "Usine" || a.id === "buildMenu") continue;
    rows.push({ group: a.group, keys: km.describe(a.id), label: a.label });
  }
  const fac = ACTIONS.filter((a) => a.group === "Usine").map((a) => km.short(a.id)).filter(Boolean);
  if (fac.length) rows.push({ group: "Usine", keys: fac.join(" "), label: "Usine sélectionnée : mettre en file l'unité 1, 2, 3… du panneau (Maj : ×5)" });
  return GROUPS.flatMap((g) => rows.filter((r) => r.group === g));
}

export type Storage ={ getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
export const STORAGE_KEY = "supreme.keys";

export class Keymap {
  layout: Layout;
  /** Raccourcis modifiés par le joueur (les autres suivent la disposition). */
  overrides: Record<string, Chord[]> = {};
  private defaults: Record<string, Chord[]>;

  constructor(layout: Layout) {
    this.layout = layout;
    this.defaults = defaultBindings(layout);
  }

  setLayout(layout: Layout): void {
    this.layout = layout;
    this.defaults = defaultBindings(layout);
  }

  /**
   * Apprend le caractère d'une touche à partir d'un appui réel (navigateurs sans carte de disposition).
   * Renvoie vrai si les libellés ou les valeurs par défaut changent.
   */
  observe(e: KeyLike & { key: string }): boolean {
    if (this.layout.source === "api" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
    if (e.key.length !== 1 || isDigitCode(e.code) || e.code.startsWith("Numpad") || e.code === "Space") return false;
    const ch = e.key.toLowerCase();
    if (this.layout.chars.get(e.code) === ch) return false;
    this.observed.set(e.code, ch);
    let chars = this.guessChars(this.layout.kind);
    const kind = layoutKind(chars);
    if (kind !== "autre" && kind !== this.layout.kind) chars = this.guessChars(kind);
    this.setLayout({ kind: layoutKind(chars), chars, source: this.layout.source });
    return true;
  }
  private observed = new Map<string, string>();
  /** Table de base d'une disposition, corrigée par les caractères observés (un caractère par touche). */
  private guessChars(kind: LayoutKind): Map<string, string> {
    const chars = kind === "azerty" ? azertyChars() : usChars();
    for (const [code, ch] of this.observed) {
      for (const [c, x] of chars) if (x === ch && !this.observed.has(c)) chars.delete(c);
      chars.set(code, ch);
    }
    return chars;
  }

  defaultsOf(id: string): Chord[] {
    return this.defaults[id] ?? [];
  }
  get(id: string): Chord[] {
    return this.overrides[id] ?? this.defaultsOf(id);
  }
  isDefault(id: string): boolean {
    return !this.overrides[id];
  }
  set(id: string, chords: Chord[]): void {
    const clean = chords.map((c) => ({ code: c.code, ...(c.shift ? { shift: true } : {}), ...(c.ctrl ? { ctrl: true } : {}), ...(c.alt ? { alt: true } : {}) }));
    if (JSON.stringify(clean) === JSON.stringify(this.defaultsOf(id))) delete this.overrides[id];
    else this.overrides[id] = clean;
  }
  /** Remplace (index existant) ou ajoute (index = longueur) une touche d'une action. */
  assign(id: string, index: number, c: Chord): void {
    const list = [...this.get(id)];
    list[Math.min(index, list.length)] = c;
    this.set(id, list);
  }
  remove(id: string, index: number): void {
    this.set(id, this.get(id).filter((_, i) => i !== index));
  }
  reset(id?: string): void {
    if (id) delete this.overrides[id];
    else this.overrides = {};
  }

  /** Action déclenchée par un appui, selon les contextes actifs (usine > placement > unités > global). */
  match(e: KeyLike, active: Partial<Record<Ctx, boolean>>): { id: string; shift: boolean } | null {
    if (e.metaKey) return null;
    for (const ctx of PRIORITY) {
      if (ctx !== "global" && !active[ctx]) continue;
      for (const a of ACTIONS) {
        if (a.ctx !== ctx) continue;
        for (const b of this.get(a.id)) if (chordMatches(b, e, a.shiftFree)) return { id: a.id, shift: e.shiftKey };
      }
    }
    return null;
  }

  /** Touche maintenue (défilement) : une des touches de l'action est enfoncée. */
  held(id: string, down: ReadonlySet<string>): boolean {
    for (const b of this.get(id)) if (down.has(b.code)) return true;
    return false;
  }

  /** Touches partagées entre actions qui peuvent être actives en même temps. */
  conflicts(): Conflict[] {
    const out: Conflict[] = [];
    for (let i = 0; i < ACTIONS.length; i++) {
      const A = ACTIONS[i];
      for (let j = i + 1; j < ACTIONS.length; j++) {
        const B = ACTIONS[j];
        const rel = ctxRelation(A.ctx, B.ctx);
        if (!rel) continue;
        for (const x of this.get(A.id)) {
          for (const y of this.get(B.id)) {
            if (!overlap(x, !!A.shiftFree, y, !!B.shiftFree)) continue;
            if (rel === "masque") out.push(A.ctx === "factory" ? { a: A.id, b: B.id, chord: x, kind: rel } : { a: B.id, b: A.id, chord: y, kind: rel });
            else out.push({ a: A.id, b: B.id, chord: x, kind: rel });
          }
        }
      }
    }
    return out;
  }

  /** Conflits qui concernent une action. */
  conflictsOf(id: string): Conflict[] {
    return this.conflicts().filter((c) => c.a === id || c.b === id);
  }

  label(c: Chord): string {
    return chordLabel(this.layout, c);
  }
  /** Toutes les touches d'une action, pour l'aide. */
  describe(id: string, sep = " / "): string {
    const l = this.get(id);
    return l.length ? l.map((c) => this.label(c)).join(sep) : "—";
  }
  /** Première touche d'une action, pour les pastilles des boutons. */
  short(id: string): string {
    const c = this.get(id)[0];
    return c ? this.label(c) : "";
  }

  load(storage: Storage | null): void {
    this.overrides = {};
    try {
      const raw = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
      for (const [id, list] of Object.entries(raw)) {
        if (!BY_ID.has(id) || !Array.isArray(list)) continue;
        const chords = list.filter((c): c is Chord => !!c && typeof c === "object" && typeof (c as Chord).code === "string" && !reservedReason(c as Chord));
        this.overrides[id] = chords.map((c) => ({ code: c.code, ...(c.shift ? { shift: true } : {}), ...(c.ctrl ? { ctrl: true } : {}), ...(c.alt ? { alt: true } : {}) }));
      }
    } catch {
      // stockage illisible : valeurs par défaut
    }
  }

  save(storage: Storage | null): void {
    try {
      if (!storage) return;
      if (Object.keys(this.overrides).length) storage.setItem(STORAGE_KEY, JSON.stringify(this.overrides));
      else storage.removeItem(STORAGE_KEY);
    } catch {
      // stockage indisponible : les réglages valent pour cette session
    }
  }
}
