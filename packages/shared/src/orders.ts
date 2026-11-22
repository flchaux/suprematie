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
  /** sorties d'un répartiteur : [réf., mode] (0 : gauche, avant, droite ; 1 : gauche et avant ; 2 : droite et avant) */
  SET_SPLIT: 45,
  /** vider une gare ou un héliport : [réf.] ; « à envoyer » et « reçus » retournent au stock du joueur */
  EMPTY_STASH: 46,
  /** cadence d'une machine : [réf., cadence %] (10 à 250 par pas de 10 ; au-dessus de 100 %, des fragments d'énergie) */
  SET_CLOCK: 47,
  /** commandant : récupérer les objets d'un de nos tapis (dans sa soute ; ses drones les portent à un dépôt) */
  COLLECT: 23,
  /** tourner d'un quart de tour nos tapis, bras et tapis de contrôle : [n, réf…] */
  ROTATE: 24,
  /** annuler les constructions prévues (fantômes, ordres non commencés) qui couvrent une case : [x, y] */
  CANCEL_PLAN: 25,
  /** commandant : récolter un gisement et fondre le minerai (fonderie intégrée) : [drapeaux, x, y (cases), n, unités…] */
  HARVEST: 26,
  /** Transhumants : replier des modules déployés en chenillards : [n, réf. de bâtiment…] */
  PACK: 48,
  /** chenillards : rouler jusqu'au point et s'y déployer : [drapeaux, x, y (sous-unités), n, unités…] */
  DEPLOY_AT: 49,
  /** commandant, ingénieurs : ramasser ce qui sort d'un de nos extracteurs ou fabricants (soute) : [drapeaux, réf., n, unités…] */
  PICKUP: 50,
  /** commandant, ingénieurs : porter un objet de la soute (0 : tout) au dépôt le plus proche qui a de la place : [drapeaux, objet, n, unités…] */
  DELIVER: 51,
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

/** Resserrement d'un groupe très étalé : facteur appliqué aux écarts au centre (1 : inchangé). */
function squeeze(units: { x: number; y: number }[], cx: number, cy: number): number {
  let spread = 0;
  for (const u of units) spread = Math.max(spread, Math.hypot(u.x - cx, u.y - cy));
  const maxSpread = TILE * (3 + Math.sqrt(units.length) * 1.2);
  return spread > 0 ? Math.min(1, maxSpread / spread) : 0;
}

function centroid(units: { x: number; y: number }[]): { cx: number; cy: number } {
  let cx = 0;
  let cy = 0;
  for (const u of units) {
    cx += u.x;
    cy += u.y;
  }
  const n = Math.max(1, units.length);
  return { cx: cx / n, cy: cy / n };
}

/** Déplacement groupé : chaque unité garde sa place relative autour du but. */
export function move(units: { id: number; x: number; y: number }[], gx: number, gy: number, queue = false, attack = false, formation = true): Cmd {
  const out: Cmd = [O.MOVE, (queue ? 1 : 0) | (attack ? 2 : 0), gx | 0, gy | 0, units.length];
  const { cx, cy } = centroid(units);
  // rayon de formation : resserrer si le groupe est très étalé
  const k = formation ? squeeze(units, cx, cy) : 0;
  for (const u of units) {
    const tx = units.length === 1 ? gx : gx + (u.x - cx) * k;
    const ty = units.length === 1 ? gy : gy + (u.y - cy) * k;
    out.push(u.id | 0, tx | 0, ty | 0);
  }
  return out;
}
/** Unité à placer en formation : position (sous-unités) et orientation (angle 16 bits de la simulation). */
export interface FormationUnit {
  id: number;
  x: number;
  y: number;
  facing: number;
}

/**
 * Cap actuel d'un groupe (radians, atan2(dy, dx)) : moyenne des orientations des unités si elles
 * regardent à peu près du même côté, sinon direction du centre du groupe vers le but.
 */
export function groupHeading(units: FormationUnit[], gx: number, gy: number): number {
  let sx = 0;
  let sy = 0;
  for (const u of units) {
    const a = ((u.facing & 0xffff) / 65536) * 2 * Math.PI;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  if (Math.hypot(sx, sy) >= units.length * 0.5) return Math.atan2(sy, sx);
  const { cx, cy } = centroid(units);
  return Math.atan2(gy - cy, gx - cx);
}

/**
 * Places d'une formation orientée (comme le clic droit glissé de Supreme Commander) : le groupe garde
 * sa disposition actuelle (écarts au centre, resserrés s'il est très étalé), tournée pour que son avant
 * (son cap actuel, voir `groupHeading`) regarde vers `angle` (radians, atan2(dy, dx) dans le repère de
 * la simulation), et centrée sur (gx, gy).
 */
export function formationSlots(units: FormationUnit[], gx: number, gy: number, angle: number): { id: number; x: number; y: number }[] {
  const n = units.length;
  if (n === 0) return [];
  if (n === 1) return [{ id: units[0].id, x: Math.round(gx), y: Math.round(gy) }];
  const { cx, cy } = centroid(units);
  const k = squeeze(units, cx, cy);
  const rot = angle - groupHeading(units, gx, gy);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return units.map((u) => {
    const ox = (u.x - cx) * k;
    const oy = (u.y - cy) * k;
    return { id: u.id, x: Math.round(gx + ox * c - oy * s), y: Math.round(gy + ox * s + oy * c) };
  });
}

/** Angle de la simulation (16 bits, un tour = 65536) d'un angle en radians. */
export function simAngle(rad: number): number {
  return Math.round((rad / (2 * Math.PI)) * 65536) & 0xffff;
}

/**
 * Déplacement en formation orientée : chaque unité rejoint sa place puis se tourne vers `angle`
 * (radians, atan2(dy, dx)). Drapeau 4 de l'ordre MOVE : l'orientation suit le but du groupe ; la
 * simulation fait avancer le groupe à la vitesse de la plus lente pour qu'il arrive ensemble.
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
/** commandant : récolter le gisement de la case (x, y) et fondre le minerai (fonderie intégrée) */
export function harvest(ids: number[], x: number, y: number, queue = false): Cmd {
  return point(O.HARVEST, ids, x, y, queue);
}
export function deploy(ids: number[]): Cmd {
  return [O.DEPLOY, ids.length, ...ids.map((x) => x | 0)];
}
/** Transhumants : chenillards qui roulent jusqu'au point (x, y) (sous-unités) et s'y déploient. */
export function deployAt(ids: number[], x: number, y: number, queue = false): Cmd {
  return point(O.DEPLOY_AT, ids, x, y, queue);
}
/** commandant, ingénieurs : ramasser ce qui sort du bâtiment `ref` (extracteur, fabricant), dans leur soute */
export function pickup(ids: number[], ref: number, queue = false): Cmd {
  return target(O.PICKUP, ids, ref, queue);
}
/** commandant, ingénieurs : porter l'objet `item` de leur soute (0 : tout) au dépôt le plus proche qui a de la place */
export function deliver(ids: number[], item: number, queue = false): Cmd {
  return [O.DELIVER, queue ? 1 : 0, item | 0, ids.length, ...ids.map((x) => x | 0)];
}
/** Transhumants : replier des modules déployés (ils redeviennent des chenillards). */
export function fold(refs: number[]): Cmd {
  return [O.PACK, refs.length, ...refs.map((x) => x | 0)];
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
export function setSplit(ref: number, mode: number): Cmd {
  return [O.SET_SPLIT, ref | 0, Math.max(0, Math.min(2, mode | 0))];
}
export function setLot(ref: number, n: number): Cmd {
  return [O.SET_LOT, ref | 0, Math.max(0, Math.round(n))];
}
export function setClock(ref: number, clock: number): Cmd {
  return [O.SET_CLOCK, ref | 0, Math.max(10, Math.min(250, Math.round(clock / 10) * 10))];
}
export function emptyStash(ref: number): Cmd {
  return [O.EMPTY_STASH, ref | 0];
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
