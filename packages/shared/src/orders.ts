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
  /** Reine de la Souche : apprivoiser un nid de mordeurs sauvage : [drapeaux, réf. du nid, n, unités…] */
  TAME: 52,
  /** Transhumants : le générateur nomade plante un poteau relais : [réf. du générateur, x, y (cases)] */
  PLANT_POLE: 53,
  /** Transhumants : la soute attelle un chariot de convoi (coût pris dans son stock) : [réf. de la soute] */
  HITCH: 54,
  /** chariots de convoi : navette avec un module : [drapeaux (1 : en file, 2 : livrer depuis la soute), réf. du module, n, unités…] */
  HAUL: 55,
  /** mettre en pause (1) ou relancer (0) des bâtiments de production : [pause, n, réf…] */
  SET_PAUSE: 56,
  ADAPT: 57,
  SACRIFICE: 66,
  /** transports volants : navette sans fin de A (embarquement) à B (débarquement) : [drapeaux, ax, ay, bx, by (sous-unités), n, unités…] */
  FERRY: 58,
  /** Transhumants : installer une amélioration : [amélioration, n, réf. d'unité ou de module…] */
  MOD_INSTALL: 60,
  /** annuler une installation en cours (remboursée) : [n, réf…] */
  MOD_CANCEL: 61,
  /** tourelles de l'Arche : [action, n, Arches…] (0 replier, 1 déployer, 2 suivre l'Arche, 3 tenir la place) */
  ARK_TURRETS: 62,
  /** type voulu d'une tourelle : [Arche, tourelle (-1 : toutes), type] */
  ARK_TURRET_TYPE: 63,
  /** surcharge de l'Arche : [n, Arches…] */
  ARK_BOOST: 64,
  /** file de l'atelier embarqué : [Arche, type d'unité, +n ou -n] */
  ARK_QUEUE: 65,
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
/** Angle de la simulation (16 bits, un tour = 65536) d'un angle en radians. */
export function simAngle(rad: number): number {
  return Math.round((rad / (2 * Math.PI)) * 65536) & 0xffff;
}

/**
 * Déplacement en formation orientée (clic droit glissé, drapeaux 4 et 8 de l'ordre MOVE) : la simulation
 * range le groupe en rectangle tourné vers `angle` (radians, atan2(dy, dx)), le corps à corps et les plus
 * résistants devant, les tireurs derrière (voir `sim/src/formation.rs`) ; chacun rejoint sa place à
 * l'allure du plus lent puis se tourne vers l'angle. Chaque unité porte ici le but du groupe.
 */
export function moveFormation(ids: number[], gx: number, gy: number, angle: number, queue = false, attack = false): Cmd {
  const out: Cmd = [O.MOVE, (queue ? 1 : 0) | (attack ? 2 : 0) | 4 | 8, gx | 0, gy | 0, simAngle(angle), ids.length];
  for (const id of ids) out.push(id | 0, gx | 0, gy | 0);
  return out;
}

/**
 * Formation en file (Maj + clic droit, drapeaux 1 et 8 de l'ordre MOVE) : la simulation range le groupe en
 * rectangle face au trajet au premier point de la file, puis garde sa disposition aux points suivants ;
 * le groupe avance à la vitesse de sa plus lente (voir `sim/src/formation.rs`).
 */
export function moveQueuedFormation(ids: number[], gx: number, gy: number, attack = false): Cmd {
  const out: Cmd = [O.MOVE, 1 | (attack ? 2 : 0) | 8, gx | 0, gy | 0, ids.length];
  for (const id of ids) out.push(id | 0, gx | 0, gy | 0);
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
/**
 * Transhumants : chenillards qui roulent jusqu'au point (x, y) (sous-unités, centre du module) et s'y
 * déploient ; `dir` : sens du module choisi par le joueur (absent : sens automatique).
 */
export function deployAt(ids: number[], x: number, y: number, queue = false, dir?: number): Cmd {
  const flags = (queue ? 1 : 0) | (dir === undefined ? 0 : ((dir & 3) + 1) << 2);
  return [O.DEPLOY_AT, flags, x | 0, y | 0, ids.length, ...ids.map((v) => v | 0)];
}
/** commandant, ingénieurs : ramasser ce qui sort du bâtiment `ref` (extracteur, fabricant), dans leur soute */
export function pickup(ids: number[], ref: number, queue = false): Cmd {
  return target(O.PICKUP, ids, ref, queue);
}
/** commandant, ingénieurs : porter l'objet `item` de leur soute (0 : tout) au dépôt le plus proche qui a de la place */
export function deliver(ids: number[], item: number, queue = false): Cmd {
  return [O.DELIVER, queue ? 1 : 0, item | 0, ids.length, ...ids.map((x) => x | 0)];
}
/** Souche : la Reine apprivoise le nid de mordeurs sauvage `nest` (référence de bâtiment). */
export function tame(ids: number[], nest: number, queue = false): Cmd {
  return target(O.TAME, ids, nest, queue);
}
/** Transhumants : le générateur nomade `gen` plante un poteau relais sur la case (x, y). */
export function plantPole(gen: number, x: number, y: number): Cmd {
  return [O.PLANT_POLE, gen | 0, x | 0, y | 0];
}
/** Transhumants : la soute `hold` attelle un chariot de convoi. */
export function hitch(hold: number): Cmd {
  return [O.HITCH, hold | 0];
}
/**
 * Chariots de convoi : navette avec le module `site` ; `feed` : de la soute vers ce fabricant (ingrédients de sa
 * recette), sinon de ce module vers la soute (ce qui en sort).
 */
export function haul(ids: number[], site: number, feed: boolean, queue = false): Cmd {
  return [O.HAUL, (queue ? 1 : 0) | (feed ? 2 : 0), site | 0, ids.length, ...ids.map((x) => x | 0)];
}
/** Transhumants : replier des modules déployés (ils redeviennent des chenillards). */
export function fold(refs: number[]): Cmd {
  return [O.PACK, refs.length, ...refs.map((x) => x | 0)];
}
/** Transhumants : installer l'amélioration `mod` sur des unités ou des modules (payée tout de suite, l'un après l'autre). */
export function installMod(mod: number, refs: number[]): Cmd {
  return [O.MOD_INSTALL, mod, refs.length, ...refs.map((x) => x | 0)];
}
/** Annuler l'installation en cours (composants et relevés rendus). */
export function cancelMod(refs: number[]): Cmd {
  return [O.MOD_CANCEL, refs.length, ...refs.map((x) => x | 0)];
}
/** Tourelles de l'Arche : 0 replier, 1 déployer, 2 consigne « suivre », 3 « tenir la place ». */
export function arkTurrets(arks: number[], action: 0 | 1 | 2 | 3): Cmd {
  return [O.ARK_TURRETS, action, arks.length, ...arks.map((x) => x | 0)];
}
/** Type voulu (indice dans data.turretKinds) de la tourelle `k` de l'Arche (-1 : toutes). */
export function arkTurretType(ark: number, k: number, kind: number): Cmd {
  return [O.ARK_TURRET_TYPE, ark | 0, k | 0, kind | 0];
}
export function arkBoost(arks: number[]): Cmd {
  return [O.ARK_BOOST, arks.length, ...arks.map((x) => x | 0)];
}
/** File de l'atelier embarqué : `delta` unités de plus (ou de moins). */
export function arkQueue(ark: number, kind: number, delta: number): Cmd {
  return [O.ARK_QUEUE, ark | 0, kind | 0, delta | 0];
}
export function load(carrier: number, ids: number[]): Cmd {
  return [O.LOAD, carrier | 0, ids.length, ...ids.map((x) => x | 0)];
}
/** Navette de transports entre A (embarquement) et B (débarquement), en sous-unités. */
export function ferry(ids: number[], ax: number, ay: number, bx: number, by: number, queue = false): Cmd {
  return [O.FERRY, queue ? 1 : 0, ax | 0, ay | 0, bx | 0, by | 0, ids.length, ...ids.map((v) => v | 0)];
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
/** Souche : fixe dans l'espèce la résistance à une famille d'armes (Mémoire du sang). */
export function adapt(family: number): Cmd {
  return [O.ADAPT, family | 0];
}
/** Met en pause (ou relance) des extracteurs, fabricants et usines d'unités. */
export function setPause(refs: number[], on: boolean): Cmd {
  return [O.SET_PAUSE, on ? 1 : 0, refs.length, ...refs.map((r) => r | 0)];
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
