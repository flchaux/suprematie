// Ordres des joueurs. Un ordre est un tableau d'entiers [type, ...arguments] ; le relais
// y ajoute le numéro du joueur et la longueur : [longueur, type, joueur, ...arguments].

export const O = {
  MOVE: 1,
  ATTACK: 2,
  BUILD: 3,
  ASSIST: 4,
  RECLAIM: 5,
  STOP: 6,
  FACTORY_QUEUE: 7,
  FACTORY_REPEAT: 8,
  SET_RECIPE: 9,
  RESEARCH: 10,
  /** file de recherche : ajoute (ou retire si déjà en file) ; 0 vide la file */
  RESEARCH_QUEUE: 22,
  /** améliorer un bâtiment (extracteur) d'un niveau */
  UPGRADE: 40,
  /** oublier les bâtiments à reconstruire (fantômes) d'une zone */
  CANCEL_GHOSTS: 41,
  /** objets remis en sortie par un dépôt amélioré : [réf., n, objet…] */
  SET_FILTERS: 42,
  /** rotation d'un bras : [réf., quarts de tour 1 à 3] (1 : prend à droite, 2 : derrière, 3 : à gauche) */
  SET_TURN: 43,
  /** objets par voyage au départ d'une gare ou d'un héliport : [réf., n] (0 : automatique) */
  SET_LOT: 44,
  /** commandant : récupérer les objets d'un de nos tapis (versés au stock commun) */
  COLLECT: 23,
  /** tourner d'un quart de tour nos tapis, bras et tapis de contrôle : [n, réf…] */
  ROTATE: 24,
  /** annuler les constructions prévues (fantômes, ordres non commencés) qui couvrent une case : [x, y] */
  CANCEL_PLAN: 25,
  RALLY: 11,
  ATTACK_GROUND: 12,
  DEPLOY: 13,
  LOAD: 14,
  UNLOAD: 15,
  SPECIAL: 16,
  PATROL: 17,
  TOGGLE: 18,
  CANCEL: 19,
  SURRENDER: 20,
  /** part de la sortie de sa source prise par un bras (%, 0 : automatique) */
  SET_SHARE: 21,
} as const;

export type Cmd = number[];

export const TILE = 256;
export const REF_BUILDING = 1 << 30;
export const REF_WRECK = 1 << 29;
export const NONE = 0xffffffff;

export function isBuildingRef(r: number): boolean {
  return ((r >>> 0) & REF_BUILDING) !== 0;
}
export function isWreckRef(r: number): boolean {
  return ((r >>> 0) & REF_WRECK) !== 0 && !isBuildingRef(r);
}

/** Déplacement groupé : chaque unité garde sa place relative autour du but. */
export function move(units: { id: number; x: number; y: number }[], gx: number, gy: number, queue = false, attack = false, formation = true): Cmd {
  const out: Cmd = [O.MOVE, (queue ? 1 : 0) | (attack ? 2 : 0), gx | 0, gy | 0, units.length];
  let cx = 0;
  let cy = 0;
  for (const u of units) {
    cx += u.x;
    cy += u.y;
  }
  cx /= Math.max(1, units.length);
  cy /= Math.max(1, units.length);
  // rayon de formation : resserrer si le groupe est très étalé
  let spread = 0;
  for (const u of units) spread = Math.max(spread, Math.hypot(u.x - cx, u.y - cy));
  const maxSpread = TILE * (3 + Math.sqrt(units.length) * 1.2);
  const k = formation && spread > 0 ? Math.min(1, maxSpread / spread) : 0;
  for (const u of units) {
    const tx = units.length === 1 ? gx : gx + (u.x - cx) * k;
    const ty = units.length === 1 ? gy : gy + (u.y - cy) * k;
    out.push(u.id | 0, tx | 0, ty | 0);
  }
  return out;
}
/** Unité à placer en formation : position (sous-unités), rayon (sous-unités), rang (0 : première ligne). */
export interface FormationUnit {
  id: number;
  x: number;
  y: number;
  radius: number;
  rank: number;
}

/**
 * Places d'une formation orientée (comme le clic droit glissé de Supreme Commander) : lignes
 * perpendiculaires à la direction `angle` (radians, atan2(dy, dx) dans le repère de la simulation),
 * centrées sur (gx, gy). Les unités de rang faible (courte portée) vont devant, celles de rang élevé
 * derrière ; dans une ligne, chaque unité prend la place du même côté qu'elle (pas de croisements).
 * L'écart entre les unités d'une ligne et entre deux lignes suit la taille des plus grosses unités.
 */
export function formationSlots(units: FormationUnit[], gx: number, gy: number, angle: number): { id: number; x: number; y: number }[] {
  const n = units.length;
  if (n === 0) return [];
  if (n === 1) return [{ id: units[0].id, x: gx, y: gy }];
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  // vecteur latéral (perpendiculaire à l'avant)
  const rx = -fy;
  const ry = fx;
  const sorted = [...units].sort((a, b) => a.rank - b.rank || b.radius - a.radius || a.id - b.id);
  const cols = Math.min(n, Math.max(2, Math.ceil(Math.sqrt(n * 2.5))));
  const rows: FormationUnit[][] = [];
  for (let i = 0; i < n; i += cols) rows.push(sorted.slice(i, i + cols));
  const gap = (row: FormationUnit[]) => Math.max(TILE * 1.4, Math.max(...row.map((u) => u.radius)) * 2 + TILE * 0.5);
  // profondeur de chaque ligne (la première devant), puis centrage sur le point visé
  const depth: number[] = [0];
  for (let r = 1; r < rows.length; r++) depth.push(depth[r - 1] - (gap(rows[r - 1]) + gap(rows[r])) / 2);
  const mid = (depth[0] + depth[depth.length - 1]) / 2;
  const out: { id: number; x: number; y: number }[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const s = gap(row);
    const d = depth[r] - mid;
    // ordre latéral des unités (position actuelle) = ordre des places
    const byLat = [...row].sort((a, b) => a.x * rx + a.y * ry - (b.x * rx + b.y * ry) || a.id - b.id);
    for (let j = 0; j < byLat.length; j++) {
      const l = (j - (byLat.length - 1) / 2) * s;
      out.push({ id: byLat[j].id, x: Math.round(gx + fx * d + rx * l), y: Math.round(gy + fy * d + ry * l) });
    }
  }
  return out;
}

/** Angle de la simulation (16 bits, un tour = 65536) d'un angle en radians. */
export function simAngle(rad: number): number {
  return Math.round((rad / (2 * Math.PI)) * 65536) & 0xffff;
}

/**
 * Déplacement en formation orientée : chaque unité rejoint sa place puis se tourne vers `angle`
 * (radians, atan2(dy, dx)). Drapeau 4 de l'ordre MOVE : l'orientation suit le but du groupe.
 */
export function moveFormation(units: FormationUnit[], gx: number, gy: number, angle: number, queue = false, attack = false): Cmd {
  const slots = formationSlots(units, gx, gy, angle);
  const out: Cmd = [O.MOVE, (queue ? 1 : 0) | (attack ? 2 : 0) | 4, gx | 0, gy | 0, simAngle(angle), slots.length];
  for (const p of slots) out.push(p.id | 0, p.x | 0, p.y | 0);
  return out;
}

export function target(type: number, ids: number[], tgt: number, queue = false): Cmd {
  return [type, queue ? 1 : 0, tgt | 0, ids.length, ...ids.map((x) => x | 0)];
}
export function build(ids: number[], kind: number, x: number, y: number, dir: number, queue = false): Cmd {
  return [O.BUILD, queue ? 1 : 0, kind, x, y, dir, ids.length, ...ids.map((x) => x | 0)];
}
export function stop(ids: number[]): Cmd {
  return [O.STOP, ids.length, ...ids.map((x) => x | 0)];
}
export function factoryQueue(ref: number, kind: number, delta: number): Cmd {
  return [O.FACTORY_QUEUE, ref | 0, kind, delta];
}
export function factoryRepeat(ref: number, on: boolean): Cmd {
  return [O.FACTORY_REPEAT, ref | 0, on ? 1 : 0];
}
export function setRecipe(ref: number, recipe: number): Cmd {
  return [O.SET_RECIPE, ref | 0, recipe];
}
export function researchQueue(tech: number): Cmd {
  return [O.RESEARCH_QUEUE, tech];
}
export function research(tech: number): Cmd {
  return [O.RESEARCH, tech];
}
export function rally(ref: number, x: number, y: number): Cmd {
  return [O.RALLY, ref | 0, x | 0, y | 0];
}
export function point(type: number, ids: number[], x: number, y: number, queue = false): Cmd {
  return [type, queue ? 1 : 0, x | 0, y | 0, ids.length, ...ids.map((v) => v | 0)];
}
export function deploy(ids: number[]): Cmd {
  return [O.DEPLOY, ids.length, ...ids.map((x) => x | 0)];
}
export function load(carrier: number, ids: number[]): Cmd {
  return [O.LOAD, carrier | 0, ids.length, ...ids.map((x) => x | 0)];
}
export function special(src: number, x: number, y: number, tgt: number): Cmd {
  return [O.SPECIAL, src | 0, x | 0, y | 0, tgt | 0];
}
/** Part de la sortie de sa source prise par un bras, en % (0 : automatique). */
export function cancelGhosts(x0: number, y0: number, x1: number, y1: number): Cmd {
  return [O.CANCEL_GHOSTS, x0 | 0, y0 | 0, x1 | 0, y1 | 0];
}
export function upgrade(ref: number): Cmd {
  return [O.UPGRADE, ref | 0];
}
export function setLot(ref: number, n: number): Cmd {
  return [O.SET_LOT, ref | 0, Math.max(0, Math.round(n))];
}
export function setTurn(ref: number, quarters: number): Cmd {
  return [O.SET_TURN, ref | 0, Math.max(1, Math.min(3, quarters | 0))];
}
export function setFilters(ref: number, items: number[]): Cmd {
  const l = items.filter((i) => i > 0).slice(0, 4);
  return [O.SET_FILTERS, ref | 0, l.length, ...l.map((i) => i | 0)];
}
export function setShare(ref: number, pct: number): Cmd {
  return [O.SET_SHARE, ref | 0, Math.max(0, Math.min(100, Math.round(pct)))];
}
export function cancelPlan(x: number, y: number): Cmd {
  return [O.CANCEL_PLAN, x | 0, y | 0];
}
export function rotate(refs: number[]): Cmd {
  return [O.ROTATE, refs.length, ...refs.map((r) => r | 0)];
}
export function toggle(ref: number): Cmd {
  return [O.TOGGLE, ref | 0];
}
export function cancel(ref: number): Cmd {
  return [O.CANCEL, ref | 0];
}
export function surrender(): Cmd {
  return [O.SURRENDER];
}

/** Ajoute longueur et joueur à un ordre, pour le paquet d'un tick. */
export function pack(player: number, cmd: Cmd, out: number[]): void {
  out.push(cmd.length + 1, cmd[0], player);
  for (let i = 1; i < cmd.length; i++) out.push(cmd[i] | 0);
}

/** Vérifie la forme d'un ordre reçu du réseau (taille et entiers). */
export function validCmd(c: unknown): c is Cmd {
  return Array.isArray(c) && c.length >= 1 && c.length <= 8000 && c.every((v) => Number.isInteger(v) && v >= -2147483648 && v <= 4294967295);
}
