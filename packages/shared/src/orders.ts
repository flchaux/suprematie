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
export function setShare(ref: number, pct: number): Cmd {
  return [O.SET_SHARE, ref | 0, Math.max(0, Math.min(100, Math.round(pct)))];
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
