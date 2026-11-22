// Rendu des entités : un InstancedMesh par type d'unité, de bâtiment et d'objet sur tapis ;
// chaque pièce mobile (tourelle) est un mesh instancié séparé. Interpolation entre les deux derniers ticks.
// Les effets (feu, fumée, débris) sont dans effects.ts.
import * as THREE from "three/webgpu";
import type { GameData, Frame } from "@supreme/shared";
import { UNIT_WORDS, BUILDING_WORDS, ITEM_WORDS, PROJ_WORDS, WRECK_WORDS, SHIELD_WORDS, CARRIER_WORDS, UF, BF, BClass, Layer, PACK1, NATURE_COLOR, NATURE_TEAM, RECEIVER_CLASSES } from "@supreme/shared";
import { texture as tslTexture, uv, vec2, vec3, float, time, instancedBufferAttribute, normalView } from "three/tsl";
import { buildingScale, buildModel, depMatrix, fallbackModel, hatchFace, HATCH_Y, parseDep, PLAYER_COLORS, withHatches, type DepStep } from "../models/generator.ts";
import { BIRTH_TIME, birthScale, eggPose, HUSK_LIFE, huskPose } from "./eggAnim.ts";
import { FLOOR_H, liftDash, liftOut, liftPad, liftUp } from "./liftAnim.ts";
import { teamInstancedMesh, setTeamColor, setAccentColor, TEX_PER_TILE_UNIT, TEX_PER_TILE_BUILDING, type TeamMesh } from "./materials.ts";
import { UNIT_MODELS } from "../../../../assets/models/units.ts";
import { ASCENSEUR_MAT, BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { VEHICLE_MODELS } from "../../../../assets/models/vehicles.ts";
import { ITEM_MODELS } from "../../../../assets/models/items.ts";
import { groundHeight, HSCALE, type MapData } from "./terrain.ts";
import { Effects } from "./effects.ts";
import { sideFeeds, splitterOuts } from "../game/belts.ts";
import { sprite } from "../ui/sprites.ts";

const TILE = 256;
const ANG = (Math.PI * 2) / 65536;
/** épaves dessinées par modèle (au plus) */
const WRECK_CAP = 1024;

type Built = ReturnType<typeof buildModel>;

/**
 * Modèle d'une sorte d'entité et ses maillages instanciés. Le modèle peut être construit à la demande
 * (première apparition de la sorte à l'écran) : `built` et `scale` sont alors des fonctions, évaluées
 * une fois au premier accès (le chargement d'une partie ne construit pas les modèles qu'on ne voit pas).
 */
class KindMesh {
  body: TeamMesh | null = null;
  pivots: { tm: TeamMesh; origin: THREE.Vector3; spin: boolean; leg: number; wave: number; mode: number; slide: number; dep: DepStep[] | null }[] = [];
  cap = 0;
  n = 0;
  private builtV: Built | null;
  private scaleV: number | null;
  constructor(
    public scene: THREE.Object3D,
    private builtSrc: Built | (() => Built),
    private scaleSrc: number | ((b: Built) => number),
    /** répétitions de texture par case du monde */
    public texPerTile = 0,
    /** ombres portées (désactivées pour les objets des tapis, très nombreux) */
    public shadows = true,
  ) {
    this.builtV = typeof builtSrc === "function" ? null : builtSrc;
    this.scaleV = typeof scaleSrc === "function" ? null : scaleSrc;
  }
  get built(): Built {
    if (!this.builtV) this.builtV = (this.builtSrc as () => Built)();
    return this.builtV;
  }
  get scale(): number {
    if (this.scaleV === null) this.scaleV = (this.scaleSrc as (b: Built) => number)(this.built);
    return this.scaleV;
  }
  /** hauteur du modèle à l'échelle (pour placer la fumée au sommet) */
  get height(): number {
    return (this.built.box.max.y - this.built.box.min.y) * this.scale;
  }
  /** le modèle a des jambes articulées (pivots « jambe… ») */
  get legs(): boolean {
    return this.built.pivots.some((p) => /^jambe/.test(p.name));
  }
  /** niveau de détail réduit (caméra lointaine) : géométries sans les pièces fines */
  lo = false;
  private bodyGeo(): THREE.BufferGeometry {
    return (this.lo && this.built.bodyLo) || this.built.body;
  }
  private pivotGeo(i: number): THREE.BufferGeometry {
    const p = this.built.pivots[i];
    return (this.lo && p.geometryLo) || p.geometry;
  }
  /** Change le niveau de détail : on échange seulement les géométries (mêmes attributs, mêmes instances). */
  setLod(lo: boolean): void {
    if (lo === this.lo) return;
    this.lo = lo;
    // modèle pas encore construit (ou sans version allégée) : rien à échanger, ensure() prendra la bonne
    if (!this.builtV?.bodyLo) return;
    if (this.body) this.body.mesh.geometry = this.bodyGeo();
    this.pivots.forEach((p, i) => (p.tm.mesh.geometry = this.pivotGeo(i)));
  }
  ensure(need: number): void {
    if (need <= this.cap) return;
    const cap = Math.max(16, this.cap * 2, need);
    if (this.body) this.scene.remove(this.body.mesh);
    for (const p of this.pivots) this.scene.remove(p.tm.mesh);
    this.body = teamInstancedMesh(this.bodyGeo(), cap, this.texPerTile * this.scale);
    this.body.mesh.castShadow = this.shadows;
    this.scene.add(this.body.mesh);
    this.pivots = this.built.pivots.map((p, i) => {
      const tm = teamInstancedMesh(this.pivotGeo(i), cap, this.texPerTile * this.scale);
      this.scene.add(tm.mesh);
      // jambe : 1 ou 2 selon la phase (gauche ou arrière décalée d'un demi-pas), 0 sinon
      const leg = /^jambe/.test(p.name) ? 1 + (Number(/_g\b|_g_|_g$/.test(p.name)) ^ Number(/_ar/.test(p.name))) : 0;
      // anneau d'un corps qui ondule (« ondule1 », « ondule2 »… de la tête vers la queue), 0 sinon
      const wave = Number(/^ondule(\d+)/.exec(p.name)?.[1] ?? 0);
      // droïde roulant : 1 « boule » (roulé), 2 « deplie… » (déployé), 3 « deplie_tourelle » (déployé, vise) ;
      // 4 « eppz… » : l'EPPZ d'une ruine, visible tant qu'elle le garde (bâtiment en service)
      const mode = /^boule/.test(p.name) ? 1 : /^deplie_tourelle/.test(p.name) ? 3 : /^deplie/.test(p.name) ? 2 : /^eppz/.test(p.name) ? 4 : 0;
      // « chenille_p0.25 » : crampons du brin supérieur d'une chenille, qui glissent vers l'avant quand l'unité
      // roule, d'un pas (0,25 unité du modèle) par période ; 0 sinon
      const slide = Number(/^chenille_p([\d.]+)/.exec(p.name)?.[1] ?? 0);
      return { tm, origin: p.origin.clone().multiplyScalar(this.scale), spin: /rotor|helice|foret|radar|emetteur|cristal|feu/.test(p.name), leg, wave, mode, slide, dep: parseDep(p.name) };
    });
    this.cap = cap;
  }
  begin(): void {
    this.n = 0;
  }
  end(): void {
    if (!this.body) return;
    this.body.mesh.count = this.n;
    this.body.mesh.instanceMatrix.needsUpdate = true;
    this.body.team.needsUpdate = true;
    for (const p of this.pivots) {
      p.tm.mesh.count = this.n;
      p.tm.mesh.instanceMatrix.needsUpdate = true;
      p.tm.team.needsUpdate = true;
    }
  }
}

/** Bâtiments qui reçoivent des objets (et ont donc des trappes) ; ce sont aussi ceux qui reçoivent par transfert direct. */
const RECEIVERS = RECEIVER_CLASSES;
const RECIPE_NONE = 255;
/** code de l'ordre de récolte du commandant (Order::Harvest), dans le mot aux des unités */
const ORDER_HARVEST = 16;
/** trappe ouverte logée dans la trappe du modèle : échelles du cadre lumineux (0,64 x 0,44 -> 0,46 x 0,28) et de l'ouverture (0,5 x 0,3 -> 0,38 x 0,2) */
const FITTED_GLOW = new THREE.Vector3(0.46 / 0.64, 0.28 / 0.44, 0.1);
const FITTED_HOLE = new THREE.Vector3(0.38 / 0.5, 0.2 / 0.3, 0.1);
/** teinte d'un bâtiment en cours d'amélioration (chantier ambre) */
const UPGRADE_TINT = new THREE.Color(0xffc266);
const CRAFTER_ASSEMBLER = 1;

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpQ3 = new THREE.Quaternion();
/** rotation d'un modèle (avant : +z) vers la direction `dir` de la simulation (0 est, 1 sud, 2 ouest, 3 nord) */
const dirQuat = (q: THREE.Quaternion, dir: number): THREE.Quaternion => q.setFromAxisAngle(UP, Math.PI / 2 - (dir * Math.PI) / 2);
/** anneaux lumineux sur le mât d'un ascenseur de tapis, et leur course au-dessus du palier bas (cases) */
const LIFT_DASHES = 3;
const LIFT_DASH_Y0 = 0.1;
const LIFT_DASH_SPAN = FLOOR_H + 0.1;
/** ascenseur de tapis de l'image : centre de la case, palier bas, orientation du mât, sens, plateau en attente */
interface Lift {
  x: number;
  z: number;
  /** hauteur du palier bas */
  y: number;
  /** orientation du modèle (le mât est en +x) */
  orient: number;
  /** vrai s'il monte : le palier d'entrée est le palier bas */
  up: boolean;
  /** terminé (pas en chantier) */
  ready: boolean;
  /** déploiement du plateau en attente au palier d'entrée (0 à 1 ; -1 : aucun objet dans la case) */
  parked: number;
}
/** le plateau n'a pas de pièce aux couleurs d'une équipe */
const NO_TEAM = new THREE.Color(1, 1, 1);
// vue logistique : tapis vide, fluide, chargé, saturé ; bâtiment bloqué, affamé, sans énergie, en marche
const LOGI_EMPTY = new THREE.Color(0.25, 0.32, 0.45);
const LOGI_FLOW = new THREE.Color(0.25, 1.1, 0.45);
const LOGI_BUSY = new THREE.Color(1.3, 1.05, 0.2);
const LOGI_FULL = new THREE.Color(1.5, 0.18, 0.12);
const LOGI_BLOCKED = new THREE.Color(1.5, 0.18, 0.12);
const LOGI_STARVED = new THREE.Color(1.4, 0.75, 0.1);
const LOGI_POWER = new THREE.Color(0.85, 0.35, 1.5);
const LOGI_OK = new THREE.Color(0.2, 0.6, 0.3);
export { FLOOR_H };
const tmpV2 = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpE = new THREE.Euler();

/**
 * Coque d'épave : les triangles du modèle (positions et normales seulement), dont on retire des pans
 * entiers, choisis par un hachage de la cellule de leur centre (déterministe), de plus en plus vers le haut.
 */
function wreckGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g0 = src.index ? src.toNonIndexed() : src;
  const pos = g0.getAttribute("position");
  const nor = g0.getAttribute("normal");
  const col = g0.getAttribute("color");
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    y0 = Math.min(y0, pos.getY(i));
    y1 = Math.max(y1, pos.getY(i));
  }
  const span = Math.max(1e-3, y1 - y0);
  const cellSize = Math.max(0.12, span / 4);
  const P: number[] = [];
  const N: number[] = [];
  const C: number[] = [];
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const h = Math.sin(Math.floor(cx / cellSize) * 12.9898 + Math.floor(cy / cellSize) * 78.233 + Math.floor(cz / cellSize) * 37.719) * 43758.5453;
    const r = h - Math.floor(h);
    const up = (cy - y0) / span;
    if (r > 0.95 - up * 0.5) continue;
    for (let k = 0; k < 3; k++) {
      P.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      if (nor) N.push(nor.getX(t + k), nor.getY(t + k), nor.getZ(t + k));
      // teinte calcinée : la luminance d'origine, très assombrie (les volumes restent lisibles)
      const l = col ? 0.3 * col.getX(t + k) + 0.59 * col.getY(t + k) + 0.11 * col.getZ(t + k) : 0.5;
      const v = 0.035 + l * 0.14 + r * 0.025;
      C.push(v * 1.05, v, v * 0.95);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  if (nor) g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  else g.computeVertexNormals();
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

export interface UnitScreen {
  id: number;
  kind: number;
  owner: number;
  x: number; // monde (cases)
  y: number; // hauteur
  z: number;
  visible: boolean;
  /** dessinée à cette image (modèle dans la vue, ou icône en vue stratégique) : seule une unité dessinée se clique */
  drawn: boolean;
}

/** Teinte vive de chaque ressource extraite (plus lisible que la couleur d'objet, souvent terne). */
const ORE_TINTS: Record<string, number> = { iron_ore: 0x6f9be0, copper_ore: 0xf07a2a, silicon: 0xf2e6b0, hydrocarbon: 0xa050e0, crystal: 0x40f0ff };
const oreCache = new Map<number, THREE.Color>();
function oreTint(item: number, data: GameData): THREE.Color | null {
  if (!item || item === 255) return null;
  let c = oreCache.get(item);
  if (!c) {
    const it = data.items[item];
    if (!it) return null;
    c = new THREE.Color(ORE_TINTS[it.key] ?? it.color);
    oreCache.set(item, c);
  }
  return c;
}

export class Entities {
  group = new THREE.Group();
  unitMeshes: KindMesh[] = [];
  buildingMeshes: KindMesh[] = [];
  /** modèles des niveaux améliorés (extracteur : clé_n2, clé_n3), par type de bâtiment */
  levelMeshes = new Map<number, KindMesh[]>();
  /** virages des tapis par type : [entrée à gauche, entrée à droite] (forme 1 et 2 de la simulation) */
  beltCurves = new Map<number, [KindMesh, KindMesh]>();
  /** tapis droits rejoints par le côté (jonction en T) : ouverts à gauche (-x), à droite (+x), des deux côtés */
  beltJunctions = new Map<number, [KindMesh, KindMesh, KindMesh]>();
  /** rails en virage par type (modèle <clé>_virage, à l'échelle du rail droit) : quart de cercle entre l'arrière et la gauche */
  railCurves = new Map<number, KindMesh>();
  /** pans de mur entre deux murs voisins du même camp (à l'échelle du poteau) */
  wallSeg: KindMesh | null = null;
  /** Souche : tronçon de racine, du centre de la case vers un voisin relié (comme les pans de mur) */
  rootSeg: KindMesh | null = null;
  /** goulottes entre les sorties d'un extracteur et les tapis devant lui */
  chute: KindMesh | null = null;
  /** niveau d'un extracteur amélioré : une barre ambrée par niveau sur la façade avant du socle */
  levelPips: THREE.InstancedMesh;
  /** vue logistique (touche maintenue) : dalles colorées sur les tapis (remplissage) et sous les bâtiments en difficulté */
  logistics = false;
  /** combustible des générateurs de l'équipe (référence → fraction du réservoir, autonomie courte) */
  fuelGauges = new Map<number, { f: number; low: boolean }>();
  logiPads: THREE.InstancedMesh;
  /**
   * Ascenseurs des tapis, là où un tapis change de niveau : le mât (commun à tous les tapis), les plateaux
   * qui y coulissent (un sous l'objet en course, un en attente au palier d'entrée), et les quais par type
   * de tapis (un au niveau d'entrée, un au niveau de sortie).
   */
  liftMast: KindMesh | null = null;
  liftTray: KindMesh | null = null;
  beltQuays = new Map<number, KindMesh>();
  /** ascenseurs dessinés à cette image : (case × 2 + niveau bas) -> rang dans `lifts` */
  private liftAt = new Map<number, number>();
  private lifts: Lift[] = [];
  private nLifts = 0;
  /** tapis surélevés : piliers ; ascenseurs : mât prolongé jusqu'au sol quand il est en hauteur, anneaux lumineux du mât */
  supports: THREE.InstancedMesh;
  liftGlow: THREE.InstancedMesh;
  /** couleurs des joueurs, puis (indice 8) celle de la faune */
  teamColors: THREE.Color[] = [...PLAYER_COLORS, NATURE_COLOR].map((c) => new THREE.Color(c));
  /** objets des tapis : un maillage instancié par type d'objet (créé à la première apparition) */
  itemMeshes: (KindMesh | undefined)[] = [];
  itemColors: THREE.Color[] = [];
  proj: THREE.InstancedMesh;
  /** projectiles cinétiques (balles, obus) : métal éclairé, pas de halo */
  slugs: THREE.InstancedMesh;
  /** rayons prolongés : cœur clair et halo coloré (cylindres étirés de la source à la cible) */
  beamCore: THREE.InstancedMesh;
  beamGlow: THREE.InstancedMesh;
  /** origine des rayons prolongés par arme : hauteur et avancée (vers la cible) du pivot « laser » */
  private beamFrom = new Map<number, { h: number; fwd: number; air: boolean; big: number }>();
  effects: Effects;
  camera: THREE.Camera | null = null;
  /** trains (0) et drones de fret (1) */
  vehicleMeshes: KindMesh[] = [];
  /** positions des véhicules au tick précédent et au tick courant (interpolation), altitude des drones */
  carPrev = new Map<number, [number, number]>();
  carCur = new Map<number, [number, number]>();
  carTick = -1;
  carAlt = new Map<number, number>();
  /** icônes de diagnostic au-dessus des bâtiments (sans énergie, entrée manquante, sortie bloquée, énergie faible) */
  diag: THREE.InstancedMesh;
  diagIcon: THREE.InstancedBufferAttribute;
  diagSince = new Map<number, { icon: number; since: number; seen: number }>();
  /** insignes de vétérance (losanges dorés) */
  ranks: THREE.InstancedMesh;
  frameN = 0;
  lastFxTick = -1;
  shields: THREE.InstancedMesh;
  /** porte de transit : horizon des événements (disque ondulant) et gerbe d'ouverture */
  private vortex!: THREE.InstancedMesh;
  private kawoosh!: THREE.InstancedMesh;
  /** anneaux de transport : anneaux qui montent, colonne de lumière */
  private ringStack!: THREE.InstancedMesh;
  private ringBeam!: THREE.InstancedMesh;
  /** portes ouvertes vues à l'image précédente (centre au sol, pour reconnaître une unité qui y entre) */
  private openGates: { x: number; z: number }[] = [];
  gateAt(x: number, z: number): boolean {
    return this.openGates.some((g) => Math.abs(g.x - x) < 2.2 && Math.abs(g.z - z) < 2.2);
  }
  /** bulle simple (réglage graphique « boucliers détaillés » coupé) et bulle détaillée */
  private shieldPlain: THREE.Material;
  private shieldFancy: THREE.Material;
  /** Boucliers détaillés (alvéoles, bord lumineux, ondulation) ou simple bulle translucide. */
  setShieldFx(on: boolean): void {
    this.shields.material = on ? this.shieldFancy : this.shieldPlain;
  }
  wrecks: THREE.InstancedMesh;
  /** épaves dessinées avec le modèle détruit (noir, en partie arraché), une par modèle */
  private wreckMeshes = new Map<number, { mesh: THREE.InstancedMesh; scale: number; height: number }>();
  private wreckMat: THREE.MeshStandardNodeMaterial | null = null;
  rings: THREE.InstancedMesh;
  bars: THREE.InstancedMesh;
  icons: THREE.InstancedMesh[];
  beams: THREE.LineSegments;
  beamPos: Float32Array;
  beamCol: Float32Array;
  ghostGroup = new THREE.Group();
  beamList: { a: THREE.Vector3; b: THREE.Vector3; age: number; life: number; color: THREE.Color }[] = [];
  /** Positions monde interpolées des unités affichées (pour la sélection à la souris). */
  screen: UnitScreen[] = [];
  /** animation des unités (purement visuelle) : phase de pas, angle lissé du haut du corps */
  /** dist : cases parcourues (chenilles) ; pack, packTick : déploiement (1) ou repli (2) d'un chenillard, et son tick de début */
  /** born : temps de simulation (s) où l'organisme est sorti de son œuf (il grandit pendant BIRTH_TIME) */
  anim = new Map<number, { phase: number; torso: number; seen: number; dep?: number; lx?: number; lz?: number; warp?: number; dist?: number; pack?: number; packTick?: number; born?: number }>();
  /** éclosions récentes (t0 : temps de simulation, s) : l'organisme qui apparaît là sort de son œuf */
  private hatches: { x: number; z: number; t0: number }[] = [];
  /** coques vides des œufs éclos : elles se fanent puis rentrent dans le sol (voir eggAnim.ts) */
  private husks: { kind: number; owner: number; x: number; z: number; facing: number; t0: number }[] = [];
  /** unités qui viennent de disparaître (porte, anneaux, téléportation) : elles s'effacent sur place */
  private ghosts: { kind: number; col: THREE.Color; x: number; y: number; z: number; facing: number; t0: number; fwd: number }[] = [];
  animFrame = 0;
  /** trappes ouvertes des bâtiments qui reçoivent des objets (entrée cyan, sortie ambre) ; les fermées sont dans leur modèle */
  hatchFrame: THREE.InstancedMesh;
  hatchHole: THREE.InstancedMesh;
  private hatchFor: Frame | null = null;
  /** gisement (indice dans map.spots) d'après sa case d'origine, et gisements recouverts par un bâtiment à cette image */
  private spotAt = new Map<number, number>();
  coveredSpots = new Set<number>();
  /** bâtiments sans trappe dans leur modèle (aucune paroi) : tables vides, par largeur */
  private noHatches: Float32Array[] = [];
  /** conduites entre machines jumelles (ingrédients et produits partagés) : gaine et liseré lumineux */
  twinPipe: THREE.InstancedMesh;
  twinGlow: THREE.InstancedMesh;
  /** icônes de production sur les toits : un maillage instancié par icône, et les pastilles de fond */
  private logoMeshes = new Map<string, THREE.InstancedMesh>();
  private logoDiscs: THREE.InstancedMesh;
  private logoFor: Frame | null = null;
  private logoYaw = 0;
  /** hauteur du toit au centre de chaque type de bâtiment (à l'échelle), calculée à la demande */
  private roofCache = new Map<number, number>();
  playerColor: number[] = [];

  constructor(
    public data: GameData,
    public map: MapData,
  ) {
    map.spots.forEach((sp, i) => this.spotAt.set(sp.y * map.w + sp.x, i));
    // modèles construits à la demande (première apparition), sauf les tapis (variantes à l'échelle du tapis droit)
    for (const u of data.units) {
      // un œuf garde la taille de son rayon (les autres unités : 0,7 case au moins)
      const target = u.egg ? (u.radius * 2.2) / TILE : Math.max(0.7, (u.radius * 2.3) / TILE);
      const scaleOf = (built: Built) => target / Math.max(built.box.max.x - built.box.min.x, built.box.max.z - built.box.min.z, 0.01);
      this.unitMeshes.push(new KindMesh(this.group, () => buildModel(UNIT_MODELS[u.key] ?? fallbackModel(0.5)), scaleOf, TEX_PER_TILE_UNIT));
    }
    const bScale = (b: (typeof data.buildings)[number]) => (built: Built) => buildingScale(b.w, built.box.max.x - built.box.min.x, built.box.max.z - built.box.min.z, b.reach);
    for (const b of data.buildings) {
      // bâtiments qui reçoivent des objets : leurs trappes (fermées) font partie du modèle ; pas ceux de la
      // Souche (organes vivants, sans tapis ni bras)
      const hatched = (built: Built) => (RECEIVERS.has(b.cls) && (b.race ?? 0) !== 1 && b.w === b.h && b.w > 1 ? withHatches(built, b.w) : built);
      if (b.cls === BClass.Belt) {
        const built = buildModel(BUILDING_MODELS[b.key] ?? fallbackModel(0.4));
        this.buildingMeshes.push(new KindMesh(this.group, built, bScale(b)(built), TEX_PER_TILE_BUILDING));
      } else this.buildingMeshes.push(new KindMesh(this.group, () => hatched(buildModel(BUILDING_MODELS[b.key] ?? fallbackModel(b.w > 1 ? 1.2 : 0.4))), bScale(b), TEX_PER_TILE_BUILDING));
      const km = this.buildingMeshes[this.buildingMeshes.length - 1];
      const lv: KindMesh[] = [];
      for (let n = 2; BUILDING_MODELS[`${b.key}_n${n}`]; n++) {
        const desc = BUILDING_MODELS[`${b.key}_n${n}`];
        lv.push(new KindMesh(this.group, () => hatched(buildModel(desc)), bScale(b), TEX_PER_TILE_BUILDING));
      }
      if (lv.length) this.levelMeshes.set(this.buildingMeshes.length - 1, lv);
      // tapis : virages (objets entrant par la gauche, par la droite), à l'échelle du tapis droit
      if (b.cls === BClass.Belt) {
        const scale = km.scale;
        const g = BUILDING_MODELS[b.key + "_virage_g"];
        const d = BUILDING_MODELS[b.key + "_virage_d"];
        if (g && d) this.beltCurves.set(this.buildingMeshes.length - 1, [new KindMesh(this.group, buildModel(g), scale, TEX_PER_TILE_BUILDING), new KindMesh(this.group, buildModel(d), scale, TEX_PER_TILE_BUILDING)]);
        const jn = ["_jonction_g", "_jonction_d", "_jonction_gd"].map((suf) => BUILDING_MODELS[b.key + suf]);
        if (jn.every((m) => m)) this.beltJunctions.set(this.buildingMeshes.length - 1, jn.map((m) => new KindMesh(this.group, buildModel(m!), scale, TEX_PER_TILE_BUILDING)) as [KindMesh, KindMesh, KindMesh]);
        // ascenseurs : quai aux couleurs du tapis ; mât et plateau communs (construits à la demande)
        const quay = BUILDING_MODELS[b.key + "_quai"];
        if (quay) this.beltQuays.set(this.buildingMeshes.length - 1, new KindMesh(this.group, () => buildModel(quay), scale, TEX_PER_TILE_BUILDING));
        if (!this.liftMast && BUILDING_MODELS.ascenseur && BUILDING_MODELS.ascenseur_plateau) {
          this.liftMast = new KindMesh(this.group, () => buildModel(BUILDING_MODELS.ascenseur), scale, TEX_PER_TILE_BUILDING);
          this.liftTray = new KindMesh(this.group, () => buildModel(BUILDING_MODELS.ascenseur_plateau), scale, TEX_PER_TILE_BUILDING, false);
        }
      }
      // rail : virage (forme 1 à 4 de la simulation), à l'échelle du rail droit
      const rv = b.cls === BClass.Rail ? BUILDING_MODELS[b.key + "_virage"] : undefined;
      if (rv) this.railCurves.set(this.buildingMeshes.length - 1, new KindMesh(this.group, () => buildModel(rv), () => km.scale, TEX_PER_TILE_BUILDING));
      // segment de mur : à l'échelle du poteau (construits ensemble, à la demande)
      if (b.cls === BClass.Wall && !this.wallSeg && BUILDING_MODELS.wall_seg) this.wallSeg = new KindMesh(this.group, () => buildModel(BUILDING_MODELS.wall_seg), () => km.scale, TEX_PER_TILE_BUILDING);
      if (b.key === "root" && !this.rootSeg && BUILDING_MODELS.root_seg) this.rootSeg = new KindMesh(this.group, () => buildModel(BUILDING_MODELS.root_seg), () => km.scale, TEX_PER_TILE_BUILDING);
      if (b.cls === BClass.Extractor && !this.chute && BUILDING_MODELS.goulotte) this.chute = new KindMesh(this.group, buildModel(BUILDING_MODELS.goulotte), 1, TEX_PER_TILE_BUILDING);
    }
    const basic = (opts: Record<string, unknown>) => new THREE.MeshBasicNodeMaterial(opts);
    this.itemColors = data.items.map((it) => new THREE.Color(it.color ?? 0xffffff));
    // projectiles lumineux (couleurs au-delà de 1 : halo) : ellipsoïde d'axe +z, de diamètre 1 ; chaque
    // trait d'énergie est dessiné deux fois, un cœur fin et très lumineux et un halo large et pâle
    // bord adouci : l'éclat décroît vers la silhouette (face tournée vers la caméra pleine, bord nul)
    const glowMat = basic({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    glowMat.opacityNode = normalView.z.abs().pow(1.6);
    this.proj = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 14, 10), glowMat, 8000);
    this.proj.count = 0;
    this.proj.frustumCulled = false;
    this.proj.setColorAt(0, new THREE.Color());
    this.group.add(this.proj);
    // projectiles matériels (balles, obus, missiles, bombes, torpilles) : ogive d'axe +z, pointe en avant,
    // de longueur 1 et de diamètre 1
    const ogive = new THREE.LatheGeometry(
      [[0, -0.5], [0.4, -0.5], [0.5, -0.4], [0.5, 0.08], [0.44, 0.24], [0.3, 0.4], [0.12, 0.48], [0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)),
      12,
    ).rotateX(Math.PI / 2);
    this.slugs = new THREE.InstancedMesh(ogive, new THREE.MeshStandardNodeMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.4 }), 6000);
    this.slugs.count = 0;
    this.slugs.frustumCulled = false;
    this.slugs.setColorAt(0, new THREE.Color());
    this.group.add(this.slugs);
    // cylindre d'axe +z, de z = 0 à z = 1
    const tube = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.beamCore = new THREE.InstancedMesh(tube, basic({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 400);
    this.beamGlow = new THREE.InstancedMesh(tube, basic({ transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 400);
    for (const m of [this.beamCore, this.beamGlow]) {
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
    }
    this.levelPips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.08, 0.06), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0xffb547).multiplyScalar(1.8) }), 2000);
    this.levelPips.count = 0;
    this.levelPips.frustumCulled = false;
    this.group.add(this.levelPips);
    // boîte unité posée sur y = 0 (étirée en hauteur pour les piliers et les montants)
    const post = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.supports = new THREE.InstancedMesh(post, new THREE.MeshStandardNodeMaterial({ color: 0x3a4250, roughness: 0.45, metalness: 0.7 }), 8000);
    this.supports.castShadow = true;
    this.liftGlow = new THREE.InstancedMesh(post, new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0x3ef0ff).multiplyScalar(1.6) }), 4000);
    for (const m of [this.supports, this.liftGlow]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.logiPads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.72, depthTest: false, depthWrite: false }), 20000);
    this.logiPads.count = 0;
    this.logiPads.frustumCulled = false;
    this.logiPads.renderOrder = 6;
    this.logiPads.setColorAt(0, new THREE.Color());
    this.group.add(this.logiPads);
    this.effects = new Effects(map);
    this.group.add(this.effects.group);
    // genres de véhicules (Carrier::kind) 0 à 3, puis le drone de ravitaillement chargé (4)
    for (const [key, len] of [["train", 2.6], ["cargo_drone", 1.1], ["logistic_robot", 0.6], ["supply_drone", 0.9], ["supply_drone_loaded", 0.9]] as const) {
      const built = buildModel(VEHICLE_MODELS[key] ?? fallbackModel(0.5));
      const size = new THREE.Vector3();
      built.box.getSize(size);
      this.vehicleMeshes.push(new KindMesh(this.group, built, len / Math.max(size.x, size.z, 0.01), TEX_PER_TILE_UNIT));
    }
    // icônes de diagnostic : atlas dessiné à la volée (4 icônes de 64 px), panneaux tournés vers la caméra
    this.diagIcon = new THREE.InstancedBufferAttribute(new Float32Array(2000), 1);
    this.diagIcon.setUsage(THREE.DynamicDrawUsage);
    const dmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
    const atlas = tslTexture(diagAtlas());
    const icon = instancedBufferAttribute(this.diagIcon, "float");
    const t = atlas.sample(vec2(uv().x.add(icon).div(4), uv().y));
    dmat.colorNode = t.rgb;
    dmat.opacityNode = t.a;
    this.ranks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.7, 0.7).rotateZ(Math.PI / 4), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(2.2, 1.7, 0.5), depthTest: false, transparent: true }), 3000);
    this.ranks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ranks.frustumCulled = false;
    this.ranks.renderOrder = 8;
    this.ranks.count = 0;
    this.group.add(this.ranks);
    this.diag = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dmat, 2000);
    this.diag.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.diag.frustumCulled = false;
    this.diag.renderOrder = 9;
    this.diag.count = 0;
    this.group.add(this.diag);
    this.vortex = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 48), vortexMaterial(), 64);
    this.kawoosh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 12), basic({ color: 0x9fdcff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), 64);
    this.ringStack = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.11, 8, 40).rotateX(Math.PI / 2), new THREE.MeshStandardNodeMaterial({ color: 0xe0c070, metalness: 0.35, roughness: 0.35, emissive: 0x8a6418 }), 400);
    this.ringBeam = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), basic({ color: 0xcfefff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 64);
    for (const m of [this.vortex, this.kawoosh, this.ringStack, this.ringBeam]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.shieldPlain = basic({ transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    this.shieldFancy = shieldMaterial();
    this.shields = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 48, 24), this.shieldFancy, 400);
    this.shields.count = 0;
    this.shields.frustumCulled = false;
    this.shields.setColorAt(0, new THREE.Color());
    this.group.add(this.shields);
    this.wrecks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardNodeMaterial({ color: 0x4a3b30, roughness: 1 }), 6000);
    this.wrecks.count = 0;
    this.wrecks.frustumCulled = false;
    this.wrecks.castShadow = true;
    // trappes ouvertes : pourtour lumineux coloré autour d'une ouverture sombre
    const HATCH_MAX = 6000;
    this.hatchFrame = new THREE.InstancedMesh(new THREE.BoxGeometry(0.64, 0.44, 0.04), new THREE.MeshBasicNodeMaterial({}), HATCH_MAX);
    this.hatchHole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), new THREE.MeshBasicNodeMaterial({ color: 0x06090d }), HATCH_MAX);
    this.hatchFrame.setColorAt(0, new THREE.Color());
    this.twinPipe = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardNodeMaterial({ color: 0x4a5560, roughness: 0.45, metalness: 0.6 }), 3000);
    this.twinGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.3, 1.8, 0.6) }), 3000);
    for (const m of [this.hatchFrame, this.hatchHole, this.twinPipe, this.twinGlow]) {
      m.count = 0;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.logoDiscs = new THREE.InstancedMesh(new THREE.CircleGeometry(0.58, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0x050a10, transparent: true, opacity: 0.72, depthWrite: false }), 4000);
    this.logoDiscs.count = 0;
    this.logoDiscs.frustumCulled = false;
    this.logoDiscs.renderOrder = 2;
    this.group.add(this.logoDiscs);
    this.wrecks.receiveShadow = true;
    this.group.add(this.wrecks);
    const ring = new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(ring, basic({ color: 0x7dff9a, depthTest: false, transparent: true }), 4000);
    this.rings.renderOrder = 5;
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.rings.setColorAt(0, new THREE.Color());
    this.group.add(this.rings);
    this.bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.12).rotateX(-Math.PI / 2), basic({ depthTest: false }), 6000);
    this.bars.renderOrder = 6;
    this.bars.count = 0;
    this.bars.frustumCulled = false;
    this.bars.setColorAt(0, new THREE.Color());
    this.group.add(this.bars);
    // icônes stratégiques : carré (terre), triangle (air), losange (mer), petit carré (bâtiment)
    const shapes = [
      new THREE.PlaneGeometry(1, 1),
      new THREE.CircleGeometry(0.75, 3),
      new THREE.CircleGeometry(0.75, 4),
      new THREE.PlaneGeometry(1.2, 1.2),
    ];
    this.icons = shapes.map((g, i) => {
      if (i === 0 || i === 3) g.rotateX(-Math.PI / 2);
      else g.rotateX(-Math.PI / 2);
      const m = new THREE.InstancedMesh(g, basic({ depthTest: false, transparent: true, opacity: i === 3 ? 0.75 : 1 }), 12000);
      m.renderOrder = 4;
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
      return m;
    });
    this.beamPos = new Float32Array(4000 * 6);
    this.beamCol = new Float32Array(4000 * 6);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(this.beamPos, 3).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute("color", new THREE.BufferAttribute(this.beamCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.beams = new THREE.LineSegments(bg, new THREE.LineBasicNodeMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beams.frustumCulled = false;
    this.group.add(this.beams);
    this.group.add(this.ghostGroup);
  }

  /**
   * Éclosion d'un œuf (type d'unité `kind`, joueur `owner`) en (x, z) au tick `tick` : sa coque vide reste
   * là un instant, et l'organisme qui apparaît à cet endroit en sort en grandissant.
   */
  addHatch(x: number, z: number, kind: number, owner: number, facing: number, tick: number): void {
    const t0 = tick / 20;
    this.hatches.push({ x, z, t0 });
    if (this.husks.length < 400 && this.unitMeshes[kind]) this.husks.push({ kind, owner, x, z, facing, t0 });
  }

  unitHeight(kind: number, x: number, z: number): number {
    const u = this.data.units[kind];
    const g = groundHeight(this.map, x, z);
    const water = this.map.waterLevel * HSCALE;
    switch (u.layer) {
      case Layer.Naval:
        return water - 0.05;
      case Layer.Sub:
        return water - 0.45;
      case Layer.Hover:
        return Math.max(g, water) + u.altitude / TILE;
      case Layer.Air:
        return Math.max(g, water) + u.altitude / TILE;
      default:
        return g;
    }
  }

  /**
   * Met à jour toutes les instances pour l'image courante.
   * alpha : interpolation entre le tick précédent et le tick courant (0..1).
   */
  /**
   * Construit en tâche de fond, pendant les temps morts du navigateur, les modèles pas encore apparus :
   * la première apparition d'une sorte d'entité ne fige pas l'image. Un modèle par temps mort.
   */
  warmUp(): void {
    const all: KindMesh[] = [...this.unitMeshes, ...this.buildingMeshes];
    for (const l of this.levelMeshes.values()) all.push(...l);
    if (this.wallSeg) all.push(this.wallSeg);
    if (this.rootSeg) all.push(this.rootSeg);
    for (const m of [this.liftMast, this.liftTray, ...this.beltQuays.values()]) if (m) all.push(m);
    let i = 0;
    const idle: (cb: (d?: { timeRemaining(): number }) => void) => void =
      typeof requestIdleCallback === "function" ? (cb) => requestIdleCallback(cb, { timeout: 2000 }) : (cb) => setTimeout(cb, 30);
    const step = (d?: { timeRemaining(): number }) => {
      // tant qu'il reste du temps dans ce temps mort (au moins un modèle)
      do {
        if (i >= all.length) return;
        void all[i++].scale; // construit le modèle et son échelle
      } while (d && d.timeRemaining() > 8);
      idle(step);
    };
    idle(step);
  }

  /** Niveau de détail réduit pour tous les modèles (pièces fines retirées), selon la distance de la caméra. */
  setDetail(lo: boolean): void {
    const all: (KindMesh | null)[] = [...this.unitMeshes, ...this.buildingMeshes, this.wallSeg, this.rootSeg, this.chute, this.liftMast, this.liftTray, ...this.beltQuays.values()];
    for (const l of this.levelMeshes.values()) all.push(...l);
    for (const l of this.beltCurves.values()) all.push(...l);
    for (const l of this.beltJunctions.values()) all.push(...l);
    all.push(...this.railCurves.values());
    for (const k of all) k?.setLod(lo);
  }

  update(f: Frame, alpha: number, me: number, myTeam: number, selected: Set<number>, strategic: boolean, iconScale: number, dt: number, spectator: boolean, viewRect: [number, number, number, number]): void {
    // nettoyage de l'état d'animation des unités disparues ou longtemps hors de vue
    if (++this.animFrame % 600 === 0) for (const [k, v] of this.anim) if (this.animFrame - v.seen > 600) this.anim.delete(k);
    const buf = f.buf;
    const vis = f.vis;
    const vw = f.visW;
    const seen = (x: number, z: number, bit: number) => {
      if (spectator || !vis) return true;
      const cx = Math.min(vw - 1, Math.max(0, (x / 4) | 0));
      const cz = Math.min(vw - 1, Math.max(0, (z / 4) | 0));
      return (vis[cz * vw + cx] & bit) !== 0;
    };
    const teamOf = (p: number) => f.players[p]?.team ?? p;
    /** indice de couleur d'un propriétaire : 0 à 7 pour les joueurs, 8 pour la faune */
    const cslot = (p: number) => (f.players[p]?.team === NATURE_TEAM ? 8 : p % 8);
    for (const m of this.unitMeshes) m.begin();
    for (const m of this.buildingMeshes) m.begin();
    for (const l of this.levelMeshes.values()) for (const m of l) m.begin();
    for (const [g, d] of this.beltCurves.values()) {
      g.begin();
      d.begin();
    }
    for (const l of this.beltJunctions.values()) for (const m of l) m.begin();
    for (const m of this.railCurves.values()) m.begin();
    this.wallSeg?.begin();
    this.rootSeg?.begin();
    this.chute?.begin();
    this.liftMast?.begin();
    this.liftTray?.begin();
    for (const m of this.beltQuays.values()) m.begin();
    this.liftAt.clear();
    this.nLifts = 0;
    for (const m of this.vehicleMeshes) m.begin();
    this.frameN++;
    let nd = 0;
    let nr = 0;
    const now = performance.now();
    // temps de la simulation à l'image affichée (s) : il rythme les œufs, leurs coques vides et les naissances
    const simT = (f.tick - 1 + alpha) / 20;
    const camQ = this.camera?.quaternion ?? tmpQ.identity();
    for (const ic of this.icons) ic.count = 0;
    let rings = 0;
    let bars = 0;
    this.screen.length = 0;
    const [vx0, vz0, vx1, vz1] = viewRect;
    const fx = this.effects;
    fx.view = viewRect;
    fx.enabled = !strategic;
    // nouveau tick : les projectiles apparus depuis le dernier affichage font un éclair de départ
    const tickDelta = this.lastFxTick < 0 ? 0 : Math.max(0, Math.min(40, f.tick - this.lastFxTick));
    this.lastFxTick = f.tick;
    // ----- geysers : panache de vapeur qui monte et retombe en une minute -----
    if (!strategic) {
      const tsec = now / 1000;
      for (const s of this.map.spots) {
        if (s.kind !== 250) continue;
        const gx = s.x + 1;
        const gz = s.y + 1;
        if (gx < vx0 - 4 || gx > vx1 + 4 || gz < vz0 - 4 || gz > vz1 + 4) continue;
        const k = 0.5 + 0.5 * Math.sin((tsec * 2 * Math.PI) / 60 + s.x * 0.7);
        fx.steam(gx, groundHeight(this.map, gx, gz) + 0.3, gz, k, dt);
      }
    }
    // ----- unités -----
    let o = f.unitOff;
    for (let i = 0; i < f.nUnits; i++, o += UNIT_WORDS) {
      const id = buf[o] >>> 0;
      const kind = buf[o + 1] & 0xff;
      const owner = (buf[o + 1] >> 8) & 0xff;
      const flags = (buf[o + 1] >> 16) & 0xff;
      const x = (buf[o + 4] + (buf[o + 2] - buf[o + 4]) * alpha) / TILE;
      const z = (buf[o + 5] + (buf[o + 3] - buf[o + 5]) * alpha) / TILE;
      const enemy = teamOf(owner) !== myTeam;
      const visible = !enemy || seen(x, z, 1);
      const radar = enemy && !visible && seen(x, z, 2) && this.data.units[kind].layer !== Layer.Sub;
      if (!visible && !radar) continue;
      const def = this.data.units[kind];
      const y = this.unitHeight(kind, x, z);
      const inView = x > vx0 - 4 && x < vx1 + 4 && z > vz0 - 4 && z < vz1 + 4;
      this.screen.push({ id, kind, owner, x, y, z, visible, drawn: strategic || inView });
      const col = this.teamColors[cslot(owner)];
      if (strategic || radar) {
        const layer = def.layer;
        const ic = this.icons[layer === Layer.Air ? 1 : layer === Layer.Naval || layer === Layer.Sub ? 2 : 0];
        if (ic.count < 12000) {
          const s = iconScale * (def.tier === 6 ? 2.2 : def.key === "commander" ? 1.8 : def.buildPower > 0 ? 0.8 : 1) * (radar ? 0.8 : 1);
          const facing = (buf[o + 6] & 0xffff) * ANG;
          tmpQ.setFromAxisAngle(UP, layer === Layer.Air ? Math.PI / 2 - facing + Math.PI : 0);
          tmpM.compose(tmpV.set(x, y + 1, z), tmpQ, tmpS.set(s, s, s));
          ic.setMatrixAt(ic.count, tmpM);
          ic.setColorAt(ic.count, radar ? tmpC.setRGB(0.6, 0.6, 0.6) : selected.has(id) ? tmpC.setRGB(1, 1, 1) : col);
          ic.count++;
        }
        if (radar || !inView) continue;
        if (strategic) continue;
      }
      if (!inView) continue;
      const km = this.unitMeshes[kind];
      km.ensure(km.n + 1);
      const facing = (buf[o + 6] & 0xffff) * ANG;
      const turret = ((buf[o + 6] >>> 16) & 0xffff) * ANG;
      let bob = 0;
      if (def.layer === Layer.Air || def.layer === Layer.Hover) bob = Math.sin(performance.now() / 400 + id) * 0.06;
      // marche : la phase avance avec la distance parcourue, l'amplitude suit la vitesse
      let st = this.anim.get(id);
      if (!st) {
        this.anim.set(id, (st = { phase: (id % 7) * 0.9, torso: 0, seen: 0 }));
        // apparu là où un œuf vient d'éclore : il en sort en grandissant
        const h = def.egg ? undefined : this.hatches.find((h) => Math.abs(h.x - x) < 0.4 && Math.abs(h.z - z) < 0.4);
        if (h) st.born = h.t0;
      }
      // saut de plus de 3 cases d'une image à l'autre (porte, anneaux, téléportation) : l'unité s'efface
      // là où elle était et émerge là où elle arrive
      if (st.lx !== undefined && st.seen === this.animFrame - 1 && Math.hypot(x - st.lx, z - (st.lz ?? z)) > 3) {
        st.warp = now;
        if (this.ghosts.length < 200) this.ghosts.push({ kind, col: col.clone(), x: st.lx, y, z: st.lz ?? z, facing: (buf[o + 6] & 0xffff) * ANG, t0: now, fwd: this.gateAt(st.lx, st.lz ?? z) ? 1 : 0 });
      }
      // chenilles : distance réellement parcourue à l'écran (position interpolée d'une image à l'autre)
      if (st.lx !== undefined && st.seen === this.animFrame - 1) {
        const moved = Math.hypot(x - st.lx, z - (st.lz ?? z));
        if (moved < 3) st.dist = (st.dist ?? 0) + moved;
      }
      st.lx = x;
      st.lz = z;
      st.seen = this.animFrame;
      // droïde roulant : passage progressif de la boule au déploiement (0 : roulé, 1 : déployé)
      const depT = flags & UF.DEPLOYED ? 1 : 0;
      st.dep = (st.dep ?? depT) + Math.max(-dt * 4, Math.min(dt * 4, depT - (st.dep ?? depT)));
      const emerge = st.warp !== undefined ? Math.min(1, (now - st.warp) / 350) : 1;
      const per = Math.hypot(buf[o + 2] - buf[o + 4], buf[o + 3] - buf[o + 5]) / TILE; // cases par tick
      const vmax = Math.max(0.1, def.speed / 10); // cases par seconde
      const walk = Math.min(1, (per * 20) / vmax);
      const stride = Math.max(0.4, km.height * 0.7);
      st.phase += ((per * 20 * dt) / stride) * Math.PI;
      // chenillard des Transhumants : déploiement (15 s) ou repli (10 s) ; stabilisateurs sortis de 0 à 1
      const packing = (buf[o + 1] >>> 29) & 1 ? 1 : (buf[o + 1] >>> 30) & 1 ? 2 : 0;
      if (packing !== (st.pack ?? 0)) {
        st.pack = packing;
        st.packTick = f.tick;
      }
      const packT = packing ? Math.min(1, (f.tick - (st.packTick ?? f.tick) + alpha) / (packing === 1 ? 300 : 200)) : 0;
      // animations décrites dans le modèle (pivots « dep|… ») : avancement 0 replié, 1 déployé
      let depP = packing === 1 ? packT : packing === 2 ? 1 - packT : 0;
      if (walk > 0.05 && km.legs) bob += Math.abs(Math.sin(st.phase)) * 0.025 * km.height * walk;
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - facing);
      // œuf de la Souche : il respire, s'agite avant d'éclore, puis ouvre ses lèvres (le temps restant tient
      // la place de l'angle de tourelle) ; organisme qui vient d'en sortir : il grandit
      let grow = 1;
      if (def.egg) {
        const pose = eggPose(((buf[o + 6] >>> 16) & 0xffff) + 1 - alpha, simT, id % 97);
        depP = pose.dep;
        grow = pose.scale;
        bob += pose.lift * km.height;
        if (pose.tilt !== 0) tmpQ.premultiply(tmpQ2.setFromAxisAngle(tmpV2.set(Math.cos(pose.axis), 0, Math.sin(pose.axis)), pose.tilt));
      } else if (st.born !== undefined) {
        const age = Math.max(0, simT - st.born) / BIRTH_TIME;
        if (age >= 1) st.born = undefined;
        else grow = birthScale(age);
      }
      const sc = km.scale * (0.05 + 0.95 * emerge) * grow;
      // les origines des pivots sont à l'échelle du modèle : elles suivent l'unité quand elle grandit
      const og = sc / km.scale;
      tmpM.compose(tmpV.set(x, y + bob, z), tmpQ, tmpS.set(sc, sc, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      setTeamColor(km.body!, km.n, emerge < 1 ? tmpC.copy(col).lerp(new THREE.Color(0xa8e8ff), 1 - emerge) : col);
      // haut du corps : il tourne vers sa cible à vitesse limitée (au plus 6 radians par seconde)
      const aim = flags & UF.IDLE && !(flags & UF.FIRING) && turret === 0 ? 0 : facing - turret;
      let dA = Math.atan2(Math.sin(aim - st.torso), Math.cos(aim - st.torso));
      dA = Math.max(-6 * dt, Math.min(6 * dt, dA));
      st.torso += dA;
      for (const p of km.pivots) {
        // la tourelle tourne vers sa cible ; les rotors tournent en continu ; les jambes se balancent
        tmpM2.makeTranslation(p.origin.x * og, p.origin.y * og, p.origin.z * og);
        if (p.wave !== 0) {
          // ondulation : chaque anneau se décale sur le côté et s'oriente le long de la vague, avec un retard
          // croissant vers la queue (la tête, anneau 1, bouge à peine)
          const ph = now / 260 - p.wave * 0.9;
          const amp = Math.min(1, (p.wave - 1) * 0.35) * 0.45 * sc;
          tmpM2.multiply(new THREE.Matrix4().makeTranslation(Math.sin(ph) * amp, Math.sin(ph * 0.5 + p.wave) * amp * 0.25, 0));
          tmpM2.multiply(new THREE.Matrix4().makeRotationY(Math.cos(ph) * 0.35 * Math.min(1, (p.wave - 1) * 0.35)));
        } else if (p.leg !== 0) {
          // jambes opposées (gauche / droite, avant / arrière) : balancement autour de la hanche
          tmpM2.multiply(new THREE.Matrix4().makeRotationX(Math.sin(st.phase + (p.leg > 1 ? Math.PI : 0)) * 0.55 * walk));
        } else if (p.mode === 1) {
          // boule du droïde : elle roule (un tour par circonférence parcourue)
          tmpM2.multiply(new THREE.Matrix4().makeRotationX(st.phase * 0.9));
        } else if (p.mode === 2) {
          // pattes du droïde : elles se déplient depuis le centre
        } else if (p.dep) {
          // déploiement décrit dans le modèle (rotations autour de l'origine du pivot, puis décalages)
          tmpM2.multiply(depMatrix(p.dep, depP, sc));
        } else if (p.slide > 0) {
          // crampons de chenille : ils avancent avec la distance parcourue, d'un pas par période (brin supérieur)
          tmpM2.multiply(new THREE.Matrix4().makeTranslation(0, 0, ((((st.dist ?? 0) / Math.max(1e-6, sc)) % p.slide) - p.slide / 2) * sc));
        } else tmpM2.multiply(new THREE.Matrix4().makeRotationY(p.spin ? performance.now() / 80 : st.torso));
        // droïde : la boule rentre quand il se déploie, les pièces déployées sortent
        const dep = st.dep ?? 0;
        const vis = p.mode === 1 ? Math.max(0.001, 1 - dep) : p.mode === 2 || p.mode === 3 ? Math.max(0.001, dep) : 1;
        tmpM2.scale(tmpS.set(sc * vis, sc * vis, sc * vis));
        const base = tmpM.clone();
        base.scale(tmpS.set(1 / sc, 1 / sc, 1 / sc));
        base.multiply(tmpM2);
        p.tm.mesh.setMatrixAt(km.n, base);
        setTeamColor(p.tm, km.n, col);
      }
      km.n++;
      const r = Math.max(0.5, def.radius / TILE + 0.15);
      if (selected.has(id) && rings < 4000) {
        tmpM.compose(tmpV.set(x, y + 0.05, z), tmpQ.identity(), tmpS.set(r, 1, r));
        this.rings.setMatrixAt(rings, tmpM);
        this.rings.setColorAt(rings, enemy ? tmpC.setRGB(1, 0.3, 0.3) : tmpC.setRGB(0.5, 1, 0.6));
        rings++;
      }
      const hp = buf[o + 7];
      // vétérance : niveau 0 à 5 (+10 % de points de vie par niveau)
      const lvl = (buf[o + 1] >>> 24) & 7;
      const frac = Math.max(0, Math.min(1, hp / ((def.hp * (100 + 10 * lvl)) / 100)));
      if (lvl > 0 && !enemy && nr + lvl <= 3000) {
        // losanges dorés au-dessus de l'unité
        const sz = Math.max(0.22, Math.min(0.6, iconScale * 0.25));
        for (let k = 0; k < lvl; k++) {
          tmpM.compose(tmpV.set(x + (k - (lvl - 1) / 2) * sz * 1.25, y + 1.45 + r * 0.6, z + r), camQ, tmpS.set(sz, sz, sz));
          this.ranks.setMatrixAt(nr++, tmpM);
        }
      }
      if ((selected.has(id) || frac < 0.999) && bars < 5900) {
        const wdt = Math.max(0.8, r * 1.6);
        tmpM.compose(tmpV.set(x, y + 1.2 + r * 0.6, z + r), tmpQ.identity(), tmpS.set(wdt, 1, 1));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(0.1, 0.1, 0.1));
        bars++;
        tmpM.compose(tmpV.set(x - (wdt * (1 - frac)) / 2, y + 1.22 + r * 0.6, z + r), tmpQ.identity(), tmpS.set(wdt * frac, 1, 0.8));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(1 - frac, 0.25 + frac * 0.7, 0.2));
        bars++;
      }
      if (frac < 0.4 && def.radius >= 200) fx.burning(x, y + km.height * 0.8, z, 1 - frac / 0.4, def.radius / TILE, dt);
      // rayon de construction des ingénieurs
      if (flags & UF.WORKING) {
        const aux = buf[o + 8];
        const tx = (aux & 0xfff) + 0.5;
        const tz = ((aux >> 12) & 0xfff) + 0.5;
        if (aux >>> 24 === ORDER_HARVEST) {
          // récolte du commandant : rayon d'extraction orangé vers le gisement, fonderie dorsale allumée
          if (Math.random() < 0.35) this.addBeam(new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(tx + (Math.random() - 0.5) * 1.4, groundHeight(this.map, tx, tz) + 0.1, tz + (Math.random() - 0.5) * 1.4), 0xff8a2a, 0.14);
          // bouche du four (modèle : 0, 1,32, -0,78) et cheminées du sac dorsal (2,7, -0,66), vers l'arrière
          const fwx = Math.cos(facing) * km.scale;
          const fwz = Math.sin(facing) * km.scale;
          fx.smelting(x - fwx * 0.78, y + 1.32 * km.scale, z - fwz * 0.78, x - fwx * 0.66, y + 2.7 * km.scale, z - fwz * 0.66, tx, tz, dt);
        } else if (Math.random() < 0.5) this.addBeam(new THREE.Vector3(x, y + 0.6, z), new THREE.Vector3(tx + (Math.random() - 0.5), groundHeight(this.map, tx, tz) + 0.5, tz + (Math.random() - 0.5)), 0x7df9ff, 0.12);
      }
    }
    // ----- fantômes : unités qui viennent de passer une porte ou des anneaux ; elles s'effacent sur place
    // (dans une porte : en avançant dans l'horizon) -----
    this.ghosts = this.ghosts.filter((g) => now - g.t0 < 350);
    for (const g of this.ghosts) {
      const t = (now - g.t0) / 350;
      const km = this.unitMeshes[g.kind];
      km.ensure(km.n + 1);
      const sc = km.scale * (1 - t * 0.95);
      const adv = g.fwd * t * 0.9;
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - g.facing);
      tmpM.compose(tmpV.set(g.x + Math.cos(g.facing) * adv, g.y, g.z + Math.sin(g.facing) * adv), tmpQ, tmpS.set(sc, sc, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      const c = tmpC.copy(g.col).lerp(new THREE.Color(0xa8e8ff), t);
      setTeamColor(km.body!, km.n, c);
      for (const p of km.pivots) {
        tmpM2.makeTranslation(p.origin.x, p.origin.y, p.origin.z).scale(tmpS.set(sc, sc, sc));
        const base = tmpM.clone();
        base.scale(tmpS.set(1 / sc, 1 / sc, 1 / sc));
        base.multiply(tmpM2);
        p.tm.mesh.setMatrixAt(km.n, base);
        setTeamColor(p.tm, km.n, c);
      }
      km.n++;
    }
    // ----- coques vides des œufs éclos : les lèvres s'affaissent, le cœur s'éteint, elles rentrent dans le sol -----
    // (une entrée datée de plus d'une seconde dans le futur vient d'une partie précédente)
    this.hatches = this.hatches.filter((h) => simT - h.t0 < 1 && simT - h.t0 > -1);
    this.husks = this.husks.filter((h) => simT - h.t0 < HUSK_LIFE && simT - h.t0 > -1);
    if (!strategic) {
      for (const h of this.husks) {
        if (h.x < vx0 - 4 || h.x > vx1 + 4 || h.z < vz0 - 4 || h.z > vz1 + 4) continue;
        const pose = huskPose(Math.max(0, simT - h.t0));
        const km = this.unitMeshes[h.kind];
        km.ensure(km.n + 1);
        const sc = km.scale * pose.scale;
        const col = this.teamColors[cslot(h.owner)];
        tmpQ.setFromAxisAngle(UP, Math.PI / 2 - h.facing);
        tmpM.compose(tmpV.set(h.x, this.unitHeight(h.kind, h.x, h.z) - pose.sink * km.height, h.z), tmpQ, tmpS.set(sc, sc, sc));
        km.body!.mesh.setMatrixAt(km.n, tmpM);
        setTeamColor(km.body!, km.n, col);
        for (const p of km.pivots) {
          tmpM2.makeTranslation(p.origin.x * pose.scale, p.origin.y * pose.scale, p.origin.z * pose.scale);
          if (p.dep) tmpM2.multiply(depMatrix(p.dep, pose.dep, sc));
          tmpM2.scale(tmpS.set(sc, sc, sc));
          const base = tmpM.clone();
          base.scale(tmpS.set(1 / sc, 1 / sc, 1 / sc));
          base.multiply(tmpM2);
          p.tm.mesh.setMatrixAt(km.n, base);
          setTeamColor(p.tm, km.n, col);
        }
        km.n++;
      }
    }
    // ----- bâtiments -----
    let nvortex = 0;
    let nkawoosh = 0;
    let nring = 0;
    let nbeam = 0;
    const gates: { x: number; z: number }[] = [];
    this.coveredSpots.clear();
    let npip = 0;
    let nsup = 0;
    let nlift = 0;
    /** pilier ou montant : boîte de (sx, h, sz) posée en (x, y0, z), tournée de q */
    const support = (x: number, y0: number, z: number, sx: number, h: number, sz: number, q: THREE.Quaternion, glow = false) => {
      const m = glow ? this.liftGlow : this.supports;
      const n = glow ? nlift : nsup;
      if (n >= (glow ? 4000 : 8000) || h <= 0) return;
      tmpM2.compose(tmpV.set(x, y0, z), q, tmpS.set(sx, h, sz));
      m.setMatrixAt(n, tmpM2);
      if (glow) nlift++;
      else nsup++;
    };
    // murs : case -> équipe, pour relier chaque mur à ses voisins du même camp par des pans fins
    const walls = new Map<number, number>();
    // racines : case -> joueur + 1, pour relier chaque racine aux racines et graines-mères collées
    const rootCells = new Map<number, number>();
    // tapis du sol terminés : case -> direction (goulottes des extracteurs)
    const groundBelts = new Map<number, number>();
    // répartiteurs terminés : case -> sorties (masque de directions), comptés comme des tapis pour les jonctions
    const splitterOutsAt = new Map<number, number>();
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const bd = this.data.buildings[buf[o + 1] & 0xff];
      const cls = bd?.cls;
      if (cls === BClass.Wall) walls.set(buf[o + 2] >>> 0, teamOf((buf[o + 1] >> 8) & 0xff));
      // Souche : cases des racines et des graines-mères (poteaux du réseau) -> joueur + 1
      else if (bd && bd.race === 1 && bd.supply > 0) {
        const bx = buf[o + 2] & 0xffff;
        const bz = (buf[o + 2] >>> 16) & 0xffff;
        for (let dz = 0; dz < bd.h; dz++) for (let dx = 0; dx < bd.w; dx++) rootCells.set(((bx + dx) | ((bz + dz) << 16)) >>> 0, ((buf[o + 1] >> 8) & 0xff) + 1);
      }
      else if (cls === BClass.Belt && buf[o + 4] >= 65536 && ((buf[o + 1] >>> 28) & 3) === 0) groundBelts.set(buf[o + 2] >>> 0, (buf[o + 1] >> 16) & 3);
      else if (bd?.key === "splitter" && buf[o + 4] >= 65536) splitterOutsAt.set(buf[o + 2] >>> 0, splitterOuts((buf[o + 1] >> 16) & 3, (buf[o + 5] >>> 24) & 3));
      // gisement (2 × 2 cases) recouvert par un bâtiment : ses roches hautes seront cachées
      if (bd && bd.w > 1 && this.spotAt.size) {
        const bx = buf[o + 2] & 0xffff;
        const bz = (buf[o + 2] >>> 16) & 0xffff;
        for (let dz = 0; dz < bd.h - 1; dz++) {
          for (let dx = 0; dx < bd.w - 1; dx++) {
            const si = this.spotAt.get((bz + dz) * this.map.w + bx + dx);
            if (si !== undefined) this.coveredSpots.add(si);
          }
        }
      }
    }
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = buf[o + 1] & 0xff;
      const owner = (buf[o + 1] >> 8) & 0xff;
      let dir = (buf[o + 1] >> 16) & 3;
      const bflags = (buf[o + 1] >> 20) & 0xff;
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      const def = this.data.buildings[kind];
      const cx = bx + def.w / 2;
      const cz = bz + def.h / 2;
      const enemy = teamOf(owner) !== myTeam;
      if (enemy && !seen(cx, cz, 8 | 1)) continue;
      const col = this.teamColors[cslot(owner)];
      if (strategic && def.cls !== BClass.Belt && def.cls !== BClass.Inserter) {
        const ic = this.icons[3];
        if (ic.count < 12000) {
          const s = iconScale * Math.max(0.7, def.w / 3);
          tmpM.compose(tmpV.set(cx, groundHeight(this.map, cx, cz) + 1, cz), tmpQ.identity(), tmpS.set(s, s, s));
          ic.setMatrixAt(ic.count, tmpM);
          ic.setColorAt(ic.count, col);
          ic.count++;
        }
        continue;
      }
      if (strategic) continue;
      // tapis en virage : forme calculée par la simulation d'après les tapis voisins (mot auxiliaire)
      const shape = def.cls === BClass.Belt ? buf[o + 5] & 3 : 0;
      // extracteur, dépôt ou générateur amélioré : modèle de son niveau
      const lvl = def.cls === BClass.Extractor || def.cls === BClass.Depot || def.cls === BClass.Power || def.key === "splitter" || def.key === "furnace" ? (buf[o + 5] >>> 24) & 3 : 0;
      // tapis droit au sol rejoint par le côté : variante au rebord ouvert (jonction en T continue)
      const junction = def.cls === BClass.Belt && !shape && buf[o + 4] >= 65536 && ((buf[o + 1] >>> 28) & 3) === 0 && (buf[o + 5] & 4) === 0 ? this.beltJunction(kind, bx, bz, dir, groundBelts, splitterOutsAt) : undefined;
      // rail en virage : forme 1 + c (simulation, d'après les rails voisins) reliant les côtés c et c + 1 ;
      // le modèle relie l'arrière (côté dir + 2) et la gauche (côté dir + 1) : dir = c + 3
      const railShape = def.cls === BClass.Rail ? buf[o + 5] & 7 : 0;
      const railCurve = railShape >= 1 && railShape <= 4 ? this.railCurves.get(kind) : undefined;
      if (railCurve) dir = (railShape + 2) & 3;
      // tapis surélevé (bits 28-29) ; montée ou descente vers le niveau des bits 3-4 du mot auxiliaire :
      // la case est un ascenseur, dessiné par son mât (du palier bas au palier haut) et ses quais à la place du tapis
      const floor = def.cls === BClass.Belt ? (buf[o + 1] >>> 28) & 3 : 0;
      const ramp = def.cls === BClass.Belt && (buf[o + 5] & 4) !== 0 ? (buf[o + 5] >> 3) & 3 : -1;
      const mast = ramp >= 0 ? this.liftMast : null;
      const km = mast ?? railCurve ?? junction ?? (shape ? (this.beltCurves.get(kind)?.[shape - 1] ?? this.buildingMeshes[kind]) : ((lvl > 0 ? this.levelMeshes.get(kind)?.[lvl - 1] : undefined) ?? this.buildingMeshes[kind]));
      // amélioration en cours (millièmes, 0 : aucune) : chantier, le bâtiment ne travaille pas
      const upg = def.cls !== BClass.Belt ? Math.max(0, buf[o + 7]) / 1000 : 0;
      km.ensure(km.n + 1);
      const build = buf[o + 4] / 65536;
      const ground = groundHeight(this.map, cx, cz);
      const low = mast ? Math.min(floor, ramp) : floor;
      const y = ground + low * FLOOR_H;
      // le mât d'un ascenseur est à droite du modèle : on le retourne quand la file arrive par ce côté-là (forme 2)
      const orient = mast && shape === 2 ? (dir + 2) & 3 : dir;
      dirQuat(tmpQ, orient);
      const sc = km.scale;
      // les hauteurs du mât sont en cases du monde : seul son plan est à l'échelle du tapis
      const sy = (mast ? 1 : sc) * (build >= 1 ? 1 : Math.max(0.08, build));
      tmpM.compose(tmpV.set(cx, def.water ? this.map.waterLevel * HSCALE : y, cz), tmpQ, tmpS.set(sc, sy, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      const c = build < 1 ? tmpC.copy(col).lerp(new THREE.Color(0x9fe8ff), 0.5) : upg > 0 ? tmpC.copy(col).lerp(UPGRADE_TINT, 0.45 + 0.1 * Math.sin(performance.now() / 180)) : bflags & BF.UNPOWERED ? tmpC.copy(col).multiplyScalar(0.45) : col;
      setTeamColor(km.body!, km.n, c);
      // porte de transit (aux2 : charge d'ouverture, 0 à 100) : gerbe à l'ouverture, puis horizon ondulant
      if (def.cls === BClass.Gate && build >= 1) {
        const charge = buf[o + 6];
        if (charge >= 60) {
          // anneau : centre (0 ; 2,1 ; 0) du modèle, rayon intérieur 1,26 ; l'horizon est dans le plan de l'anneau
          const r = 1.26 * sc;
          const cy = y + 2.1 * sy;
          tmpV2.set(0, 0, 1).applyQuaternion(tmpQ);
          if (nvortex < 64) {
            const k = Math.min(1, (charge - 60) / 15);
            tmpM2.compose(tmpV.set(cx, cy, cz), tmpQ, tmpS.set(r * k, r * k, 1));
            this.vortex.setMatrixAt(nvortex++, tmpM2);
          }
          if (charge < 90 && nkawoosh < 64) {
            // gerbe : une poche d'énergie jaillit vers l'avant puis se rétracte
            const k = Math.sin(((charge - 60) / 30) * Math.PI);
            const len = Math.max(0.05, k * 2.6 * sc);
            tmpM2.compose(tmpV.set(cx + tmpV2.x * len, cy, cz + tmpV2.z * len), tmpQ, tmpS.set(r * 0.8, r * 0.8, len));
            this.kawoosh.setMatrixAt(nkawoosh++, tmpM2);
          }
          if (charge >= 100) gates.push({ x: cx, z: cz });
        }
      }
      // anneaux de transport (aux : montée, ticks restants ; aux2 : recharge) : cinq anneaux montent,
      // éclair de lumière à l'échange, puis ils redescendent dans la plateforme
      if (def.cls === BClass.Transfer && build >= 1) {
        const charge = buf[o + 5];
        const cool = buf[o + 6];
        const up = charge > 0 ? 1 - charge / 30 : cool > 380 ? (cool - 380) / 20 : 0;
        if (up > 0) {
          const rr = 1.2 * sc;
          for (let k = 0; k < 5 && nring < 400; k++) {
            const h = (0.35 + k * 0.42) * Math.max(0, Math.min(1, up * 1.6 - k * 0.12));
            tmpM2.compose(tmpV.set(cx, y + 0.3 + h, cz), tmpQ.identity(), tmpS.set(rr, 1.4, rr));
            this.ringStack.setMatrixAt(nring++, tmpM2);
          }
          const flash = (charge > 0 && charge <= 5) || cool > 390 ? 1 : 0;
          if (flash && nbeam < 64) {
            tmpM2.compose(tmpV.set(cx, y + 1.5, cz), tmpQ.identity(), tmpS.set(rr * 0.95, 3, rr * 0.95));
            this.ringBeam.setMatrixAt(nbeam++, tmpM2);
          }
        }
        tmpQ.setFromAxisAngle(UP, Math.PI / 2 - (dir * Math.PI) / 2);
      }
      // tapis surélevé : pilier sous la case
      if (def.cls === BClass.Belt && floor > 0 && !mast) support(cx, ground, cz, 0.16, floor * FLOOR_H - 0.02, 0.16, tmpQ);
      if (mast) {
        const li = this.nLifts++;
        const l = (this.lifts[li] ??= { x: 0, z: 0, y: 0, orient: 0, up: false, ready: false, parked: -1 });
        l.x = cx;
        l.z = cz;
        l.y = y;
        l.orient = orient;
        l.up = ramp > floor;
        l.ready = build >= 1;
        l.parked = -1;
        this.liftAt.set((bz * this.map.w + bx) * 2 + Math.min(1, low), li);
        // quais aux couleurs du tapis : l'entrée au niveau du tapis, derrière lui (ou du côté d'où arrive
        // la file, s'il est pris par le côté : forme 1 ou 2), la sortie devant lui au niveau visé
        const quay = this.beltQuays.get(kind) ?? this.beltQuays.values().next().value;
        if (quay) {
          quay.ensure(quay.n + 2);
          const qs = quay.scale;
          const qy = build >= 1 ? qs : qs * Math.max(0.08, build);
          for (const [at, d] of [[floor, shape === 1 ? dir + 3 : shape === 2 ? dir + 1 : dir], [ramp, dir + 2]]) {
            tmpM2.compose(tmpV.set(cx, ground + at * FLOOR_H, cz), dirQuat(tmpQ2, d & 3), tmpS.set(qs, qy, qs));
            quay.body!.mesh.setMatrixAt(quay.n, tmpM2);
            setTeamColor(quay.body!, quay.n, c);
            quay.n++;
          }
        }
        tmpV2.set(ASCENSEUR_MAT * sc, 0, 0).applyQuaternion(tmpQ);
        const mx = cx + tmpV2.x;
        const mz = cz + tmpV2.z;
        // ascenseur en hauteur (du niveau 1 au niveau 2) : son mât descend jusqu'au sol
        if (low > 0) support(mx, ground, mz, 0.05 * sc, low * FLOOR_H + 0.01, 0.07 * sc, tmpQ);
        // anneaux lumineux sur le mât : ils courent dans le sens de la marche, et se figent quand le
        // tapis n'a plus d'énergie
        if (build >= 1) {
          for (let k = 0; k < LIFT_DASHES; k++) {
            const h = LIFT_DASH_Y0 + liftDash(k, LIFT_DASHES, simT, ramp > floor, !(bflags & BF.UNPOWERED)) * LIFT_DASH_SPAN;
            support(mx, y + h, mz, 0.064 * sc, 0.07, 0.084 * sc, tmpQ, true);
          }
        }
      }
      // extracteur amélioré : barres de niveau sur la façade avant (repère du bâtiment)
      if (lvl > 0 && build >= 1 && npip + lvl <= 2000) {
        const bw = dir & 1 ? def.h : def.w;
        const bh = dir & 1 ? def.w : def.h;
        for (let k = 0; k < lvl; k++) {
          // avant du modèle = +z local ; décalage latéral centré
          tmpV2.set((k - (lvl - 1) / 2) * 0.42, 0.34, Math.max(bw, bh) / 2 - 0.02).applyQuaternion(tmpQ);
          tmpM2.compose(tmpV.set(cx + tmpV2.x, y + tmpV2.y, cz + tmpV2.z), tmpQ, tmpS.set(1, 1, 1));
          this.levelPips.setMatrixAt(npip++, tmpM2);
        }
      }
      // extracteur : une goulotte de chaque case de sortie (face avant) vers le tapis qui s'y trouve
      if (def.cls === BClass.Extractor && build >= 1 && this.chute) this.drawChutes(this.chute, bx, bz, dir, def.w, def.h, groundBelts);
      // racine : un tronçon vers chaque voisin (est, sud, ouest, nord) qui est une racine ou une graine-mère
      // du même joueur : la file forme un câble continu, comme le réseau qu'elle relie
      const rseg = this.rootSeg;
      if (def.key === "root" && rseg) {
        for (let d = 0; d < 4; d++) {
          const nx = bx + [1, 0, -1, 0][d];
          const nz = bz + [0, 1, 0, -1][d];
          if (nx < 0 || nz < 0 || rootCells.get((nx | (nz << 16)) >>> 0) !== owner + 1) continue;
          rseg.ensure(rseg.n + 1);
          tmpQ2.setFromAxisAngle(UP, (-d * Math.PI) / 2);
          tmpM2.compose(tmpV.set(cx, y, cz), tmpQ2, tmpS.set(rseg.scale, sy * (rseg.scale / sc), rseg.scale));
          rseg.body!.mesh.setMatrixAt(rseg.n, tmpM2);
          setTeamColor(rseg.body!, rseg.n, c);
          rseg.n++;
        }
      }
      const seg = this.wallSeg;
      if (def.cls === BClass.Wall && seg) {
        // un pan vers chaque voisin (est, sud, ouest, nord) qui est un mur du même camp
        const team = teamOf(owner);
        const ys = def.water ? this.map.waterLevel * HSCALE : y;
        for (let d = 0; d < 4; d++) {
          const nx = bx + [1, 0, -1, 0][d];
          const nz = bz + [0, 1, 0, -1][d];
          if (nx < 0 || nz < 0 || walls.get((nx | (nz << 16)) >>> 0) !== team) continue;
          seg.ensure(seg.n + 1);
          tmpQ2.setFromAxisAngle(UP, (-d * Math.PI) / 2);
          tmpM2.compose(tmpV.set(cx, ys, cz), tmpQ2, tmpS.set(seg.scale, sy * (seg.scale / sc), seg.scale));
          seg.body!.mesh.setMatrixAt(seg.n, tmpM2);
          setTeamColor(seg.body!, seg.n, c);
          seg.n++;
        }
      }
      // extracteur : pièces teintées selon la ressource exploitée
      const ore = def.cls === BClass.Extractor ? oreTint(buf[o + 5] & 0xff, this.data) : null;
      if (ore) setAccentColor(km.body!, km.n, ore);
      for (const p of km.pivots) {
        let rot = 0;
        if (def.cls === BClass.Turret) rot = Math.PI / 2 - (buf[o + 5] & 0xffff) * ANG - (Math.PI / 2 - (dir * Math.PI) / 2);
        else if (def.cls === BClass.Inserter) {
          const phase = (buf[o + 5] >> 8) & 0xff;
          const timer = (buf[o + 5] >> 16) & 0xff;
          // la pince est à l'avant du modèle (angle 0 : devant, sur la case de dépose) ; à la prise, elle est
          // tournée d'un quart, d'un demi ou de trois quarts de tour (-sweep). Phase 1 : chargée, elle va
          // de la prise à la dépose ; 2 : à la dépose ; 3 : à vide, elle revient ; 0 : elle attend à la prise.
          const sweep = ((buf[o + 6] & 3 || 2) * Math.PI) / 2;
          rot = phase === 1 ? (-sweep * timer) / 6 : phase === 2 ? 0 : phase === 3 ? -sweep * (1 - timer / 6) : -sweep;
        } else if (bflags & BF.WORKING && upg === 0) rot = performance.now() / 300;
        // EPPZ d'une ruine : il flotte en tournant tant qu'il n'est pas pris, puis disparaît
        const gone = p.mode === 4 && !(bflags & BF.WORKING) ? 0.001 : 1;
        const bobY = p.mode === 4 ? Math.sin(performance.now() / 500) * 0.06 : 0;
        tmpM2.makeTranslation(p.origin.x, p.origin.y * (sy / sc) + bobY, p.origin.z);
        tmpM2.multiply(new THREE.Matrix4().makeRotationY(rot));
        tmpM2.scale(tmpS.set(sc * gone, sy * gone, sc * gone));
        const base = new THREE.Matrix4().compose(tmpV.set(cx, def.water ? this.map.waterLevel * HSCALE : y, cz), tmpQ, tmpS.set(1, 1, 1));
        base.multiply(tmpM2);
        p.tm.mesh.setMatrixAt(km.n, base);
        setTeamColor(p.tm, km.n, c);
        if (ore) setAccentColor(p.tm, km.n, ore);
      }
      km.n++;
      const ref = buf[o] >>> 0;
      if (selected.has(ref) && rings < 4000) {
        const r = def.w * 0.75;
        tmpM.compose(tmpV.set(cx, y + 0.1, cz), tmpQ.identity(), tmpS.set(r, 1, r));
        this.rings.setMatrixAt(rings, tmpM);
        this.rings.setColorAt(rings, enemy ? tmpC.setRGB(1, 0.3, 0.3) : tmpC.setRGB(0.5, 1, 0.6));
        rings++;
      }
      const hp = buf[o + 3];
      const frac = Math.max(0, Math.min(1, hp / def.hp));
      // diagnostic (nos bâtiments) : icône si le problème dure plus de 2 s
      if (owner === me && build >= 1 && DIAG_CLASSES.has(def.cls)) {
        const icon = bflags & BF.UNPOWERED ? 0 : bflags & BF.NO_INPUT ? 1 : bflags & BF.OUT_BLOCKED ? 2 : bflags & BF.LOW_POWER ? 3 : -1;
        const ref = buf[o] >>> 0;
        if (icon < 0) this.diagSince.delete(ref);
        else {
          let st = this.diagSince.get(ref);
          if (!st || st.icon !== icon) this.diagSince.set(ref, (st = { icon, since: now, seen: 0 }));
          st.seen = this.frameN;
          if (now - st.since > 2000 && nd < 2000) {
            const s = Math.max(0.9, Math.min(3, iconScale * 0.9));
            tmpM.compose(tmpV.set(cx, y + km.height + 0.9 * s, cz), camQ, tmpS.set(s, s, s));
            this.diag.setMatrixAt(nd, tmpM);
            (this.diagIcon.array as Float32Array)[nd] = icon;
            nd++;
          }
        }
      }
      // bâtiment endommagé : fumée, puis flammes
      if (frac < 0.6 && build >= 1 && def.cls !== BClass.Belt && def.cls !== BClass.Inserter && (!enemy || seen(cx, cz, 1))) {
        fx.burning(cx, y + km.height * 0.85, cz, (0.6 - frac) / 0.6, Math.max(def.w, def.h) * 0.45, dt);
      }
      if (build < 1 && def.cls !== BClass.Belt && bars < 5900) {
        // chantier : barre toujours visible ; avancement en cyan, points de vie perdus (dégâts) en rouge
        // (la simulation fait monter les points de vie avec l'avancement)
        const wdt = def.w * 0.8;
        const z = cz + def.h / 2;
        const lift = y + 2.2;
        const hpf = Math.min(build, frac);
        tmpM.compose(tmpV.set(cx, lift, z), tmpQ.identity(), tmpS.set(wdt + 0.12, 1, 2.4));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(0.08, 0.1, 0.12));
        bars++;
        if (hpf > 0.002) {
          tmpM.compose(tmpV.set(cx - (wdt * (1 - hpf)) / 2, lift + 0.02, z), tmpQ.identity(), tmpS.set(wdt * hpf, 1, 1.6));
          this.bars.setMatrixAt(bars, tmpM);
          this.bars.setColorAt(bars, tmpC.setRGB(0.35, 0.85, 1));
          bars++;
        }
        if (build - hpf > 0.01) {
          const mid = hpf + (build - hpf) / 2;
          tmpM.compose(tmpV.set(cx - wdt / 2 + wdt * mid, lift + 0.02, z), tmpQ.identity(), tmpS.set(wdt * (build - hpf), 1, 1.6));
          this.bars.setMatrixAt(bars, tmpM);
          this.bars.setColorAt(bars, tmpC.setRGB(0.9, 0.2, 0.15));
          bars++;
        }
      } else if (upg > 0 && bars < 5900) {
        // amélioration : barre toujours visible, avancement en ambre
        const wdt = def.w * 0.8;
        const z = cz + def.h / 2;
        const lift = y + 2.2;
        tmpM.compose(tmpV.set(cx, lift, z), tmpQ.identity(), tmpS.set(wdt + 0.12, 1, 2.4));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(0.08, 0.1, 0.12));
        bars++;
        tmpM.compose(tmpV.set(cx - (wdt * (1 - upg)) / 2, lift + 0.02, z), tmpQ.identity(), tmpS.set(wdt * upg, 1, 1.6));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(1, 0.72, 0.25));
        bars++;
      } else if ((frac < 0.999 || selected.has(ref)) && def.cls !== BClass.Belt && bars < 5900) {
        const wdt = def.w * 0.8;
        tmpM.compose(tmpV.set(cx, y + 2.2, cz + def.h / 2), tmpQ.identity(), tmpS.set(wdt, 1, 1));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(0.1, 0.1, 0.1));
        bars++;
        tmpM.compose(tmpV.set(cx - (wdt * (1 - frac)) / 2, y + 2.22, cz + def.h / 2), tmpQ.identity(), tmpS.set(wdt * frac, 1, 0.8));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(1 - frac, 0.25 + frac * 0.7, 0.2));
        bars++;
      }
      // générateur de l'équipe : jauge de combustible au-dessus (verte, ambre sous une minute d'autonomie,
      // rouge clignotante à sec)
      const gauge = def.cls === BClass.Power && build >= 1 && upg === 0 ? this.fuelGauges.get(buf[o] >>> 0) : undefined;
      if (gauge && bars < 5900 && !strategic) {
        const wdt = def.w * 0.7;
        const lift = y + km.height + 0.5;
        // barre à plat, comme les points de vie (géométrie couchée), un peu plus épaisse
        tmpM.compose(tmpV.set(cx, lift, cz), tmpQ.identity(), tmpS.set(wdt + 0.12, 1, 2.6));
        this.bars.setMatrixAt(bars, tmpM);
        this.bars.setColorAt(bars, tmpC.setRGB(0.06, 0.08, 0.1));
        bars++;
        const dry = gauge.f <= 0;
        const f = dry ? 1 : Math.max(0.04, gauge.f);
        tmpM.compose(tmpV.set(cx - (wdt * (1 - f)) / 2, lift + 0.02, cz), tmpQ.identity(), tmpS.set(wdt * f, 1, 1.8));
        this.bars.setMatrixAt(bars, tmpM);
        if (dry) this.bars.setColorAt(bars, Math.floor(now / 400) % 2 ? tmpC.setRGB(1, 0.2, 0.15) : tmpC.setRGB(0.35, 0.05, 0.04));
        else if (gauge.low) this.bars.setColorAt(bars, tmpC.setRGB(1, 0.7, 0.2));
        else this.bars.setColorAt(bars, tmpC.setRGB(0.3, 1, 0.6));
        bars++;
      }
    }
    this.diag.count = nd;
    this.ranks.count = nr;
    this.ranks.instanceMatrix.needsUpdate = true;
    this.diag.instanceMatrix.needsUpdate = true;
    this.diagIcon.needsUpdate = true;
    if (this.frameN % 120 === 0) for (const [k, st] of this.diagSince) if (this.frameN - st.seen > 120) this.diagSince.delete(k);
    // ----- trains et drones de fret -----
    if (f.tick !== this.carTick) {
      this.carPrev = this.carCur;
      this.carCur = new Map();
      for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += CARRIER_WORDS) this.carCur.set(buf[o], [buf[o + 1], buf[o + 2]]);
      this.carTick = f.tick;
    }
    if (!strategic) {
      for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += CARRIER_WORDS) {
        const idx = buf[o];
        const kind = buf[o + 3] & 0xff;
        const owner = (buf[o + 3] >> 8) & 0xff;
        const moving = (buf[o + 3] >> 16) & 1;
        const loaded = (buf[o + 3] >> 17) & 1;
        const cur = this.carCur.get(idx) ?? [buf[o + 1], buf[o + 2]];
        // une place de véhicule libérée est reprise par un autre (drones de ravitaillement) : pas d'interpolation
        // entre deux véhicules différents (saut de plus de 4 cases en un tick)
        const p0 = this.carPrev.get(idx);
        const prev = p0 && Math.abs(p0[0] - cur[0]) + Math.abs(p0[1] - cur[1]) < 4 * TILE ? p0 : cur;
        const x = (prev[0] + (cur[0] - prev[0]) * alpha) / TILE;
        const z = (prev[1] + (cur[1] - prev[1]) * alpha) / TILE;
        if (teamOf(owner) !== myTeam && !seen(x, z, 1)) continue;
        // drone de ravitaillement : modèle avec caisse quand il porte sa charge
        const km = this.vehicleMeshes[kind === 3 && loaded ? 4 : kind];
        if (!km) continue;
        km.ensure(km.n + 1);
        const g = groundHeight(this.map, x, z);
        let y = g + 0.05;
        if (kind >= 1) {
          // drone : vol à 5 cases au-dessus du sol (ou de l'eau), posé sur l'héliport à l'arrêt ; robot : 3 cases ;
          // drone de ravitaillement : 2,5 cases
          const target = moving ? Math.max(g, this.map.waterLevel * HSCALE) + (kind === 2 ? 3 : kind === 3 ? 2.5 : 5) : g + 0.45;
          const a = this.carAlt.get(idx) ?? target;
          const na = a + (target - a) * Math.min(1, dt * 2.5);
          this.carAlt.set(idx, na);
          y = na;
        }
        const ang = (buf[o + 4] & 0xffff) * ANG;
        tmpQ.setFromAxisAngle(UP, Math.PI / 2 - ang);
        const sc = km.scale;
        tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sc, sc, sc));
        km.body!.mesh.setMatrixAt(km.n, tmpM);
        setTeamColor(km.body!, km.n, this.teamColors[owner % 8]);
        km.n++;
      }
    }
    for (const m of this.vehicleMeshes) m.end();
    for (const m of this.unitMeshes) m.end();
    for (const m of this.buildingMeshes) m.end();
    for (const l of this.levelMeshes.values()) for (const m of l) m.end();
    for (const [g, d] of this.beltCurves.values()) {
      g.end();
      d.end();
    }
    for (const l of this.beltJunctions.values()) for (const m of l) m.end();
    for (const m of this.railCurves.values()) m.end();
    this.wallSeg?.end();
    this.rootSeg?.end();
    this.chute?.end();
    this.liftMast?.end();
    for (const m of this.beltQuays.values()) m.end();
    this.levelPips.count = npip;
    this.levelPips.instanceMatrix.needsUpdate = true;
    this.supports.count = nsup;
    this.supports.instanceMatrix.needsUpdate = true;
    this.updateLogistics(f, strategic, myTeam, spectator);
    this.liftGlow.count = nlift;
    this.liftGlow.instanceMatrix.needsUpdate = true;
    this.updateHatches(f, strategic, myTeam, spectator);
    this.updateLogos(f, strategic, myTeam, spectator);
    for (const ic of this.icons) {
      ic.instanceMatrix.needsUpdate = true;
      if (ic.instanceColor) ic.instanceColor.needsUpdate = true;
    }
    this.rings.count = rings;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.bars.count = bars;
    this.bars.instanceMatrix.needsUpdate = true;
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
    // ----- objets sur les tapis : petit modèle par type, teinté de la couleur de l'objet -----
    let ni = 0;
    /** plateau d'un ascenseur, à `up` niveau (0 à 1) au-dessus du palier bas, déployé de `grow` (0 à 1) depuis le mât */
    const pad = (l: Lift, up: number, grow: number) => {
      const tray = this.liftTray;
      if (!tray || grow <= 0) return;
      tray.ensure(tray.n + 1);
      const sc = tray.scale;
      dirQuat(tmpQ2, l.orient);
      // il sort du mât : son plan se réduit vers lui
      tmpV2.set(ASCENSEUR_MAT * sc * (1 - grow), 0, 0).applyQuaternion(tmpQ2);
      tmpM.compose(tmpV.set(l.x + tmpV2.x, l.y + up * FLOOR_H + 0.09 * sc, l.z + tmpV2.z), tmpQ2, tmpS.set(sc * grow, sc, sc));
      tray.body!.mesh.setMatrixAt(tray.n, tmpM);
      setTeamColor(tray.body!, tray.n, NO_TEAM);
      tray.n++;
    };
    for (const km of this.itemMeshes) km?.begin();
    if (!strategic) {
      o = f.itemOff;
      tmpQ.setFromAxisAngle(UP, 0.45);
      for (let i = 0; i < f.nItems && ni < 20000; i++, o += ITEM_WORDS) {
        const kind = buf[o + 2] & 0xff;
        const km = this.itemMesh(kind);
        if (!km) continue;
        let x = buf[o] / TILE;
        let z = buf[o + 1] / TILE;
        // élévation sur un tapis surélevé (1/256 de niveau) ; une fraction de niveau : l'objet est dans un
        // ascenseur, il roule sur un quai, monte ou descend à la verticale sur un plateau, sort par l'autre quai
        const lvl256 = buf[o + 2] >> 8;
        let elev = (lvl256 / 256) * FLOOR_H;
        const fr = (lvl256 & 255) / 256;
        if (fr > 0) {
          const tx = Math.floor(x);
          const tz = Math.floor(z);
          const low = lvl256 >> 8;
          const out = liftOut(fr);
          // l'objet reste sur la droite qui joint le centre de la case au point où la simulation le place
          const dist = Math.hypot(x - tx - 0.5, z - tz - 0.5);
          const k = dist > 1e-6 ? (out * 0.5) / dist : 0;
          x = tx + 0.5 + (x - tx - 0.5) * k;
          z = tz + 0.5 + (z - tz - 0.5) * k;
          const up = liftUp(fr);
          elev = (low + up) * FLOOR_H;
          const li = this.liftAt.get((tz * this.map.w + tx) * 2 + Math.min(1, low));
          if (li !== undefined) {
            const l = this.lifts[li];
            // sur le quai d'entrée : un plateau l'attend au palier ; en course : son plateau le porte ;
            // sur le quai de sortie : son plateau rentre dans le mât, un autre se déploie au palier d'entrée
            if (out > 0 && fr < 0.5 === l.up) l.parked = 1;
            else {
              const g = out > 0 ? liftPad(out) : 1;
              pad(l, up, g);
              l.parked = Math.max(l.parked, 1 - g);
            }
          }
        }
        km.ensure(km.n + 1);
        const s = km.scale;
        tmpM.compose(tmpV.set(x, groundHeight(this.map, x, z) + 0.15 + elev, z), tmpQ, tmpS.set(s, s, s));
        km.body!.mesh.setMatrixAt(km.n, tmpM);
        setTeamColor(km.body!, km.n, this.itemColors[kind]);
        km.n++;
        ni++;
      }
    }
    for (const km of this.itemMeshes) km?.end();
    // plateau en attente au palier d'entrée de chaque ascenseur
    for (let i = 0; i < this.nLifts; i++) {
      const l = this.lifts[i];
      if (l.ready) pad(l, l.up ? 0 : 1, l.parked < 0 ? 1 : l.parked);
    }
    this.liftTray?.end();
    // ----- projectiles -----
    let np = 0;
    let nk = 0;
    let nb = 0;
    o = f.projOff;
    for (let i = 0; i < f.nProj && np < 8000; i++, o += PROJ_WORDS) {
      const t = ((buf[o + 4] & 0xffff) + alpha) / Math.max(1, (buf[o + 4] >>> 16) & 0xffff);
      const wi = buf[o + 5] & 0xff;
      const special = (buf[o + 5] >> 16) & 0xff;
      const x0 = buf[o] / TILE;
      const z0 = buf[o + 1] / TILE;
      const x1 = buf[o + 2] / TILE;
      const z1 = buf[o + 3] / TILE;
      const tt = Math.min(1, t);
      const x = x0 + (x1 - x0) * tt;
      const z = z0 + (z1 - z0) * tt;
      if (!spectator && !seen(x, z, 1) && !seen(x0, z0, 1)) continue;
      const w = this.data.weapons[wi];
      if (special === 3) {
        // rayon prolongé : de la source (pivot « laser » du modèle) à la cible, pendant toute sa durée
        if (nb >= 400) continue;
        const src = this.beamSource(wi);
        const d0 = Math.hypot(x1 - x0, z1 - z0) || 1;
        const ax = x0 + ((x1 - x0) / d0) * src.fwd;
        const az = z0 + ((z1 - z0) / d0) * src.fwd;
        const ay = (src.air ? this.unitHeightAt(wi, ax, az) : groundHeight(this.map, ax, az)) + src.h;
        const by = groundHeight(this.map, x1, z1) + 0.4;
        const fire = w?.proj === 10;
        const life = (buf[o + 4] & 0xffff) + alpha;
        const total = Math.max(1, (buf[o + 4] >>> 16) & 0xffff);
        // montée et extinction en quelques ticks, scintillement
        const ramp = Math.min(1, life / 3, (total - life + 1) / 3);
        const flick = 1 + 0.18 * Math.sin(now / 23 + i * 1.7) + 0.08 * Math.sin(now / 7 + i);
        const r = (fire ? 0.16 : 0.05) * src.big * Math.max(0.15, ramp) * flick;
        tmpV.set(x1 - ax, by - ay, z1 - az);
        const len = tmpV.length();
        tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmpV.normalize());
        tmpM.compose(tmpV.set(ax, ay, az), tmpQ, tmpS.set(r * 0.5, r * 0.5, len));
        this.beamCore.setMatrixAt(nb, tmpM);
        this.beamCore.setColorAt(nb, fire ? tmpC.setRGB(1.9, 1.1, 0.4) : tmpC.setRGB(2.0, 0.9, 0.9));
        tmpM.compose(tmpV.set(ax, ay, az), tmpQ, tmpS.set(r * 1.8, r * 1.8, len));
        this.beamGlow.setMatrixAt(nb, tmpM);
        this.beamGlow.setColorAt(nb, fire ? tmpC.setRGB(1.2, 0.35, 0.05) : tmpC.setRGB(1.3, 0.1, 0.1));
        nb++;
        fx.beam(ax, ay, az, x1, by, z1, w?.proj ?? 8, dt, src.big);
        continue;
      }
      const dist = Math.hypot(x1 - x0, z1 - z0);
      const pk = w?.proj ?? 0;
      const gy0 = groundHeight(this.map, x0, z0);
      const gy1 = groundHeight(this.map, x1, z1);
      const dx = x1 - x0;
      const dz = z1 - z0;
      // hauteur et pente de la trajectoire : y(t) et dy/dt (pour orienter le projectile selon sa course)
      let arc = 1.2;
      if (pk === 1 || special === 1 || special === 255) arc = Math.min(60, dist * 0.35); // obus, missile stratégique
      else if (pk === 2) arc = Math.min(8, dist * 0.15);
      else if (pk === 3 || pk === 4) arc = 0;
      let y = gy0 + (gy1 - gy0) * tt + 1 + Math.sin(Math.PI * tt) * arc;
      let vy = gy1 - gy0 + Math.PI * Math.cos(Math.PI * tt) * arc;
      if (pk === 3) {
        // bombe : tombe en avançant
        y = gy1 + 12 * (1 - tt) + 0.5;
        vy = -12;
      } else if (pk === 4) {
        // torpille : juste sous la surface
        y = Math.max(gy0 + (gy1 - gy0) * tt, this.map.waterLevel * HSCALE) - 0.06;
        vy = 0;
      }
      if (special === 2) {
        y = gy1 + 60 * (1 - tt);
        vy = -60;
      }
      tmpV.set(dx, vy, dz);
      if (tmpV.lengthSq() < 1e-6) tmpV.set(0, -1, 0);
      tmpQ.setFromUnitVectors(Z_AXIS, tmpV.normalize());
      // vecteur unitaire de la course (pour placer flamme et traceur derrière le projectile)
      const ux = tmpV.x;
      const uy = tmpV.y;
      const uz = tmpV.z;
      const big = special === 1 || special === 255 ? 3 : special === 2 ? 2 : w && w.aoe > 600 ? 1.8 : 1;
      const look = special === 0 ? PROJ_LOOKS[pk] : undefined;
      if (special === 2) {
        // frappe orbitale : colonne d'énergie qui tombe du ciel
        np = this.glow(np, x, y, z, 0.35, 0.35, 4, 0xfff0b0, 3.2);
        np = this.glow(np, x, y, z, 1.1, 1.1, 5, 0xffc040, 0.9);
      } else if (look?.slug || special === 1 || special === 255) {
        // projectile matériel : ogive orientée selon la course, et sa lueur (traceur, propulseur, culot chaud)
        const L = look ?? PROJ_LOOKS[2]!;
        const sz = special ? 3.2 : L.grow ? Math.min(big, 1.4) : 1;
        if (nk < 6000) {
          tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(L.slug![0] * sz, L.slug![0] * sz, L.slug![1] * sz));
          this.slugs.setMatrixAt(nk, tmpM);
          this.slugs.setColorAt(nk, tmpC.setHex(special ? 0xe8e8e8 : L.color));
          nk++;
        }
        if (L.tail) {
          const [r, len, back, col, k] = L.tail;
          const off = (L.slug![1] * 0.5 + back) * sz;
          const pulse = pk === 2 || special ? 0.8 + 0.4 * Math.sin(now / 17 + i * 2.3) : 1;
          np = this.glow(np, x - ux * off, y - uy * off, z - uz * off, r * sz * pulse, r * sz * pulse, len * sz, col, k);
        }
      } else {
        // énergie : cœur fin et lumineux + halo large et pâle
        const L = look ?? { core: [0.12, 0.3], halo: [0.32, 0.45], color: 0xffe070, k: 2.6 };
        const pulse = pk === 7 ? 0.85 + 0.25 * Math.sin(now / 40 + i * 1.3) : 1;
        const col = special ? 0xffe070 : (PROJ_COLORS[pk] ?? 0xffffff);
        np = this.glow(np, x, y, z, L.core![0] * big * pulse, L.core![0] * big * pulse, L.core![1] * big, col, L.k ?? 2.6);
        np = this.glow(np, x, y, z, L.halo![0] * big * pulse, L.halo![0] * big * pulse, L.halo![1] * big, col, (L.k ?? 2.6) * 0.22);
      }
      const elapsed = buf[o + 4] & 0xffff;
      if (elapsed >= 1 && elapsed <= tickDelta && special === 0 && pk !== 3 && pk !== 4) fx.muzzle(x0, gy0 + 1, z0, pk, big);
      if (special || pk === 1 || pk === 2 || pk === 4 || pk === 11) fx.trail(x, y, z, special === 1 || special === 255 ? 2 : pk, dt, big);
    }
    this.proj.count = np;
    this.proj.instanceMatrix.needsUpdate = true;
    if (this.proj.instanceColor) this.proj.instanceColor.needsUpdate = true;
    this.slugs.count = nk;
    this.slugs.instanceMatrix.needsUpdate = true;
    if (this.slugs.instanceColor) this.slugs.instanceColor.needsUpdate = true;
    for (const m of [this.beamCore, this.beamGlow]) {
      m.count = nb;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // ----- épaves -----
    let nw = 0;
    for (const w of this.wreckMeshes.values()) w.mesh.count = 0;
    if (!strategic) {
      o = f.wreckOff;
      for (let i = 0; i < f.nWrecks && nw < 6000; i++, o += WRECK_WORDS) {
        const x = buf[o] / TILE;
        const z = buf[o + 1] / TILE;
        if (!seen(x, z, 8)) continue;
        // modèle détruit : carcasse noire, tassée, un peu enfoncée et penchée
        const wm = this.wreckMesh(buf[o + 3] & 0xffff);
        if (wm && wm.mesh.count < WRECK_CAP) {
          const yaw = Math.PI / 2 - ((buf[o + 3] >>> 16) & 0xffff) * ANG;
          const h1 = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
          const r1 = h1 - Math.floor(h1);
          const r2 = (h1 * 7.13) - Math.floor(h1 * 7.13);
          tmpQ.setFromEuler(tmpE.set((r1 - 0.5) * 0.22, yaw, (r2 - 0.5) * 0.22, "YXZ"));
          const sc = wm.scale;
          tmpM.compose(tmpV.set(x, groundHeight(this.map, x, z) - wm.height * 0.18, z), tmpQ, tmpS.set(sc, sc * 0.72, sc));
          wm.mesh.setMatrixAt(wm.mesh.count++, tmpM);
          continue;
        }
        const s = Math.min(4, 0.5 + (buf[o + 2] & 0xff) * 0.4);
        tmpQ.setFromAxisAngle(UP, x * 3.7 + z);
        tmpM.compose(tmpV.set(x, groundHeight(this.map, x, z) + 0.1, z), tmpQ, tmpS.set(s, s * 0.4, s));
        this.wrecks.setMatrixAt(nw++, tmpM);
      }
    }
    this.wrecks.count = nw;
    this.wrecks.instanceMatrix.needsUpdate = true;
    for (const w of this.wreckMeshes.values()) w.mesh.instanceMatrix.needsUpdate = true;
    // ----- porte, anneaux -----
    this.openGates = gates;
    for (const [m, n] of [[this.vortex, nvortex], [this.kawoosh, nkawoosh], [this.ringStack, nring], [this.ringBeam, nbeam]] as const) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    // ----- boucliers -----
    let ns = 0;
    o = f.shieldOff;
    for (let i = 0; i < f.nShields && ns < 400; i++, o += SHIELD_WORDS) {
      const x = buf[o] / TILE;
      const z = buf[o + 1] / TILE;
      if (!seen(x, z, 1)) continue;
      const r = buf[o + 2] / TILE;
      const team = buf[o + 3] & 0xff;
      const pct = (buf[o + 3] >> 8) / 100;
      tmpM.compose(tmpV.set(x, groundHeight(this.map, x, z), z), tmpQ.identity(), tmpS.set(r, r * 0.6, r));
      this.shields.setMatrixAt(ns, tmpM);
      // couleur de l'équipe : premier joueur de cette équipe
      const p = f.players.findIndex((pl) => pl.team === team);
      this.shields.setColorAt(ns, tmpC.copy(this.teamColors[Math.max(0, p) % 8]).lerp(new THREE.Color(0x88ddff), 0.5).multiplyScalar(0.4 + pct * 0.6));
      ns++;
    }
    this.shields.count = ns;
    this.shields.instanceMatrix.needsUpdate = true;
    if (this.shields.instanceColor) this.shields.instanceColor.needsUpdate = true;
    this.updateFx(dt);
    void me;
  }

  /**
   * Trappes des bâtiments qui reçoivent des objets : sur chaque case de bord, ouverte si un tapis
   * ou un bras y entre (cadre cyan) ou en sort (cadre ambre), fermée sinon. Recalculées à chaque
   * nouvel état de la partie (pas à chaque image).
   */
  private updateHatches(f: Frame, strategic: boolean, myTeam: number, spectator: boolean): void {
    if (strategic) {
      this.hatchFrame.count = this.hatchHole.count = 0;
      this.twinPipe.count = this.twinGlow.count = 0;
      this.hatchFor = null;
      return;
    }
    if (f === this.hatchFor) return;
    this.hatchFor = f;
    const buf = f.buf;
    const W = this.map.w;
    const DX = [1, 0, -1, 0];
    const DZ = [0, 1, 0, -1];
    // tapis et bras : case -> direction (bras : 16 * quarts de tour + 4 * portée + direction)
    const links = new Map<number, number>();
    const curves = new Map<number, number>();
    let o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const bd = this.data.buildings[buf[o + 1] & 0xff];
      if (bd.cls !== BClass.Belt && bd.cls !== BClass.Inserter) continue;
      // un tapis surélevé ne touche pas les bâtiments
      if ((buf[o + 1] >>> 28) & 3) continue;
      const dir = (buf[o + 1] >> 16) & 3;
      const cell = ((buf[o + 2] >>> 16) & 0xffff) * W + (buf[o + 2] & 0xffff);
      const arm = bd.cls === BClass.Inserter ? 16 * (buf[o + 6] & 3 || 2) + 4 * Math.max(1, bd.reach ?? 1) : 0;
      links.set(cell, arm + dir);
      // virage : côté par lequel il est alimenté (tapis latéral ou bâtiment)
      const shape = bd.cls === BClass.Belt ? buf[o + 5] & 3 : 0;
      if (shape) curves.set(cell, shape === 1 ? (dir + 1) & 3 : (dir + 3) & 3);
    }
    // transfert direct : case -> bâtiment (fabricants, extracteurs et receveurs), pour ouvrir la trappe
    // entre deux bâtiments collés qui s'échangent des objets
    const cells = new Map<number, number>();
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const def = this.data.buildings[buf[o + 1] & 0xff];
      if ((def.cls !== BClass.Extractor && !RECEIVERS.has(def.cls)) || buf[o + 4] < 65536) continue;
      const dir = (buf[o + 1] >> 16) & 3;
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      const w = dir & 1 ? def.h : def.w;
      const h = dir & 1 ? def.w : def.h;
      for (let z = bz; z < bz + h; z++) for (let x = bx; x < bx + w; x++) cells.set(z * W + x, o);
    }
    const recipes = this.data.recipes;
    /** objet donné par un fabricant ou un extracteur (0 : aucun) */
    const gives = (b: number): number => {
      const cls = this.data.buildings[buf[b + 1] & 0xff].cls;
      const v = buf[b + 5] & 0xff;
      if (cls === BClass.Extractor) return v;
      if (cls === BClass.Crafter && v !== RECIPE_NONE) return recipes[v]?.output[0] ?? 0;
      return 0;
    };
    /** `t` reçoit-il directement l'objet `it` de `s` (même règle, simplifiée, que direct_ok dans la simulation) ? */
    const takes = (s: number, t: number, it: number): boolean => {
      if (!it || ((buf[s + 1] >> 8) & 0xff) !== ((buf[t + 1] >> 8) & 0xff)) return false;
      const td = this.data.buildings[buf[t + 1] & 0xff];
      if (td.cls === BClass.Lab) return it >= PACK1 && it < PACK1 + 6;
      if (td.cls !== BClass.Crafter) return true;
      const r = buf[t + 5] & 0xff;
      if (r !== RECIPE_NONE) return recipes[r]?.inputs.some((x) => x[0] === it) ?? false;
      // fabricant sans recette : seul un extracteur l'amorce (fonderie, raffinerie…)
      return this.data.buildings[buf[s + 1] & 0xff].cls === BClass.Extractor && td.crafter !== CRAFTER_ASSEMBLER && recipes.some((x) => x.crafter === td.crafter && x.inputs.some((y) => y[0] === it));
    };
    /** dépôt `s` collé au générateur `t` du même joueur : il l'alimente en combustible depuis son stock */
    const feeds = (s: number, t: number): boolean =>
      this.data.buildings[buf[s + 1] & 0xff].cls === BClass.Depot && this.data.buildings[buf[t + 1] & 0xff].cls === BClass.Power && ((buf[s + 1] >> 8) & 0xff) === ((buf[t + 1] >> 8) & 0xff);
    const inCol = new THREE.Color(0.5, 2.2, 2.6);
    const outCol = new THREE.Color(2.8, 1.7, 0.35);
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    /**
     * Retrait de la trappe du bâtiment `b` sur sa face `side` (repère du monde), case de bord (ex, ez) :
     * jusqu'à la paroi du modèle (voir hatchInsets) ; NaN si aucune paroi derrière.
     */
    /** haut de la paroi derrière la dernière trappe demandée à insetAt */
    const topOut = [0];
    const insetAt = (b: number, side: number, ex: number, ez: number): number => {
      const kind = buf[b + 1] & 0xff;
      const def = this.data.buildings[kind];
      topOut[0] = Number.NaN;
      if (def.w !== def.h) return 0;
      const insets = this.hatchInsets(kind, def.cls === BClass.Depot || def.cls === BClass.Power ? (buf[b + 5] >>> 24) & 3 : 0, def.w);
      const dir = (buf[b + 1] >> 16) & 3;
      // côté et case correspondants du modèle : rotation inverse (-yaw) de la normale et du centre de la case
      const yaw = Math.PI / 2 - (dir * Math.PI) / 2;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const vx = ex + 0.5 - ((buf[b + 2] & 0xffff) + def.w / 2);
      const vz = ez + 0.5 - (((buf[b + 2] >>> 16) & 0xffff) + def.h / 2);
      const mnx = Math.round(DX[side] * cy - DZ[side] * sy);
      const mnz = Math.round(DX[side] * sy + DZ[side] * cy);
      const mside = mnx === 1 ? 0 : mnz === 1 ? 1 : mnx === -1 ? 2 : 3;
      const mt = mside & 1 ? vx * cy - vz * sy : vx * sy + vz * cy;
      const mk = Math.min(def.w - 1, Math.max(0, Math.round(mt + (def.w - 1) / 2)));
      topOut[0] = insets[4 * def.w + mside * def.w + mk];
      return insets[mside * def.w + mk];
    };
    /**
     * Machines jumelles (même règle que twin_pair dans la simulation) : même type, même joueur, et même
     * produit (recette d'un fabricant, unité en tête de file d'une usine ; tous les laboratoires) ; pour
     * les générateurs, même joueur et mêmes combustibles (le réacteur à cristal seulement avec un réacteur).
     */
    const twins = (a: number, b: number): boolean => {
      if (buf[a + 7] > 0 || buf[b + 7] > 0) return false;
      const da = this.data.buildings[buf[a + 1] & 0xff];
      const db = this.data.buildings[buf[b + 1] & 0xff];
      if (da.cls === BClass.Power) {
        return db.cls === BClass.Power && ((buf[a + 1] >> 8) & 0xff) === ((buf[b + 1] >> 8) & 0xff) && (da.key === "crystal_reactor") === (db.key === "crystal_reactor");
      }
      if ((buf[a + 1] & 0xffff) !== (buf[b + 1] & 0xffff)) return false;
      const cls = da.cls;
      if (cls === BClass.Lab) return true;
      if (cls === BClass.Crafter) return (buf[a + 5] & 0xff) !== RECIPE_NONE && (buf[a + 5] & 0xff) === (buf[b + 5] & 0xff);
      if (cls === BClass.Factory) return (buf[a + 5] & 0xff) !== 0 && (buf[a + 5] & 0xff) === (buf[b + 5] & 0xff);
      return false;
    };
    const twinCol = new THREE.Color(0.3, 1.8, 0.6);
    let no = 0;
    let nt = 0;
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = buf[o + 1] & 0xff;
      const def = this.data.buildings[kind];
      // la Souche n'a pas de trappes (voir hatched)
      if (!RECEIVERS.has(def.cls) || (def.race ?? 0) === 1 || buf[o + 4] < 65536) continue;
      const owner = (buf[o + 1] >> 8) & 0xff;
      if (!spectator && (f.players[owner]?.team ?? owner) !== myTeam) continue;
      const dir = (buf[o + 1] >> 16) & 3;
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      const w = dir & 1 ? def.h : def.w;
      const h = dir & 1 ? def.w : def.h;
      const inside = (x: number, z: number) => x >= bx && x < bx + w && z >= bz && z < bz + h;
      // face du modèle, depuis le centre de la case de bord (le modèle laisse une marge sur l'emprise)
      const face = hatchFace(def.w);
      // base du modèle (comme le bâtiment : sol en son centre, ou surface de l'eau)
      const base = def.water ? this.map.waterLevel * HSCALE : groundHeight(this.map, bx + w / 2, bz + h / 2);
      for (let side = 0; side < 4; side++) {
        const n = side & 1 ? w : h; // cases le long de la face
        for (let k = 0; k < n; k++) {
          // case de bord, case voisine à l'extérieur, centre de la trappe sur la face
          const ex = side === 0 ? bx + w - 1 : side === 2 ? bx : bx + k;
          const ez = side === 1 ? bz + h - 1 : side === 3 ? bz : bz + k;
          const ox = ex + DX[side];
          const oz = ez + DZ[side];
          const code = links.get(oz * W + ox);
          let state = 0; // 0 fermée, 1 entrée, 2 sortie
          if (code !== undefined && code < 4) {
            if (code === side) state = 2;
            else if (code === (side + 2) % 4) state = 1;
            // virage alimenté par cette face
            else if (curves.get(oz * W + ox) === (side + 2) % 4) state = 2;
          } else if (code !== undefined) {
            // bras : dépose devant lui, prise selon sa rotation
            const d = code & 3;
            const r = (code >> 2) & 3;
            const p = (d + (code >> 4)) & 3;
            if (inside(ox + r * DX[d], oz + r * DZ[d])) state = 1;
            else if (inside(ox + r * DX[p], oz + r * DZ[p])) state = 2;
          }
          // transfert direct avec un bâtiment collé ; machine jumelle (3) : ingrédients, produits ou combustible partagés
          if (state === 0) {
            const nb = cells.get(oz * W + ox);
            if (nb !== undefined && nb !== o && twins(o, nb)) state = 3;
            else if (nb !== undefined && nb !== o) {
              if (takes(nb, o, gives(nb)) || feeds(nb, o)) state = 1;
              else if (takes(o, nb, gives(o)) || feeds(o, nb)) state = 2;
            }
          }
          // bras long posé à 2 cases de la face (par-dessus la case voisine)
          if (state === 0) {
            const lx = ox + DX[side];
            const lz = oz + DZ[side];
            const lc = links.get(lz * W + lx);
            if (lc !== undefined && ((lc >> 2) & 3) === 2) {
              const d = lc & 3;
              const p = (d + (lc >> 4)) & 3;
              if (inside(lx + 2 * DX[d], lz + 2 * DZ[d])) state = 1;
              else if (inside(lx + 2 * DX[p], lz + 2 * DZ[p])) state = 2;
            }
          }
          // fermée : la trappe du modèle suffit
          if (state === 0) continue;
          const v = insetAt(o, side, ex, ez);
          const myTop = topOut[0];
          // la paroi porte la trappe du modèle (l'éclairage s'y loge) ; sans paroi, la trappe ouverte reste au bord
          const fitted = !Number.isNaN(v);
          const inset = fitted ? v : 0;
          const px = ex + 0.5 + DX[side] * (face - inset);
          const pz = ez + 0.5 + DZ[side] * (face - inset);
          // jumelles : une conduite relie les deux trappes, tracée une fois (depuis la plus petite référence)
          if (state === 3 && nt < 3000) {
            const nb = cells.get(oz * W + ox)!;
            if (buf[o] >>> 0 < buf[nb] >>> 0) {
              const nface = hatchFace(this.data.buildings[buf[nb + 1] & 0xff].w);
              const nv = insetAt(nb, (side + 2) % 4, ox, oz);
              const nTop = topOut[0];
              const ninset = Number.isNaN(nv) ? 0 : nv;
              // passerelle posée sur le haut des deux parois, de l'une à l'autre (visible d'en haut)
              const a = face - inset;
              const b = 1 - (nface - ninset);
              const len = Math.max(0.1, b - a) + 0.5;
              const mid = (a + b) / 2;
              const mx = ex + 0.5 + DX[side] * mid;
              const mz = ez + 0.5 + DZ[side] * mid;
              const gy = groundHeight(this.map, mx, mz);
              const top = Math.min(Number.isNaN(myTop) ? 0.5 : myTop, Number.isNaN(nTop) ? 0.5 : nTop);
              q.setFromAxisAngle(UP, side & 1 ? 0 : Math.PI / 2);
              tmpM.compose(tmpV.set(mx, gy + top + 0.03, mz), q, tmpS.set(0.36, 0.12, len));
              this.twinPipe.setMatrixAt(nt, tmpM);
              tmpM.compose(tmpV.set(mx, gy + top + 0.1, mz), q, tmpS.set(0.12, 0.03, len + 0.02));
              this.twinGlow.setMatrixAt(nt, tmpM);
              nt++;
            }
          }
          if (no >= 6000) continue;
          const y = (fitted ? base : groundHeight(this.map, px, pz)) + HATCH_Y;
          q.setFromAxisAngle(UP, [Math.PI / 2, 0, -Math.PI / 2, Math.PI][side]);
          // dans la trappe du modèle (kit « trappe ») : pourtour lumineux sur le volet, ouverture sombre
          // devant, le tout en retrait du cadre ; sans paroi : cadre lumineux complet au bord
          const glowAt = fitted ? 0.06 : 0;
          const holeAt = fitted ? 0.065 : 0.012;
          tmpM.compose(tmpV.set(px + DX[side] * glowAt, y, pz + DZ[side] * glowAt), q, fitted ? FITTED_GLOW : one);
          this.hatchFrame.setMatrixAt(no, tmpM);
          this.hatchFrame.setColorAt(no, state === 1 ? inCol : state === 3 ? twinCol : outCol);
          tmpM.compose(tmpV.set(px + DX[side] * holeAt, y, pz + DZ[side] * holeAt), q, fitted ? FITTED_HOLE : one);
          this.hatchHole.setMatrixAt(no, tmpM);
          no++;
        }
      }
    }
    this.hatchFrame.count = no;
    this.hatchHole.count = no;
    this.twinPipe.count = this.twinGlow.count = nt;
    this.twinPipe.instanceMatrix.needsUpdate = true;
    this.twinGlow.instanceMatrix.needsUpdate = true;
    for (const m of [this.hatchFrame, this.hatchHole]) m.instanceMatrix.needsUpdate = true;
    if (this.hatchFrame.instanceColor) this.hatchFrame.instanceColor.needsUpdate = true;
  }

  /**
   * Maillage d'épave d'un modèle (0 : inconnu ; 1 + type d'unité ; 0x8000 | type de bâtiment) : la
   * coque du modèle d'origine (sans ses pièces mobiles), en matière calcinée, percée de pans arrachés
   * (plus nombreux vers le haut, voir wreckGeometry). Créé à la première épave de ce modèle.
   */
  private wreckMesh(model: number): { mesh: THREE.InstancedMesh; scale: number; height: number } | null {
    if (!model) return null;
    const hit = this.wreckMeshes.get(model);
    if (hit) return hit;
    const km = model & 0x8000 ? this.buildingMeshes[model & 0x7fff] : this.unitMeshes[model - 1];
    if (!km) return null;
    // matière calcinée simple (le relief vient de la géométrie arrachée)
    this.wreckMat ??= new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(wreckGeometry(km.built.body), this.wreckMat, WRECK_CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const w = { mesh, scale: km.scale, height: km.height };
    this.wreckMeshes.set(model, w);
    return w;
  }

  /**
   * Retrait (en cases) de chaque trappe depuis sa face nominale jusqu'à la paroi du modèle qui la porte,
   * puis hauteur du haut de cette paroi : voir BuiltModel.hatches (mesuré à la construction du modèle).
   */
  private hatchInsets(kind: number, lvl: number, w: number): Float32Array {
    const km = (lvl > 0 ? this.levelMeshes.get(kind)?.[lvl - 1] : undefined) ?? this.buildingMeshes[kind];
    return km?.built.hatches ?? (this.noHatches[w] ??= new Float32Array(8 * w).fill(Number.NaN));
  }

  /**
   * Variante d'un tapis droit en (x, z), tourné vers `dir`, rejoint par le côté : un tapis au sol voisin,
   * perpendiculaire, qui pointe vers lui, ou une sortie de répartiteur (`belts` : case x | z << 16 ->
   * direction ; `splitters` : case -> sorties). Indéfini sinon.
   */
  private beltJunction(kind: number, x: number, z: number, dir: number, belts: Map<number, number>, splitters: Map<number, number>): KindMesh | undefined {
    const set = this.beltJunctions.get(kind);
    if (!set) return undefined;
    const inside = (nx: number, nz: number) => nx >= 0 && nz >= 0;
    const m = sideFeeds(x, z, dir, {
      belt: (nx, nz) => (inside(nx, nz) ? belts.get(nx | (nz << 16)) : undefined),
      splitter: (nx, nz) => (inside(nx, nz) ? (splitters.get(nx | (nz << 16)) ?? 0) : 0),
    });
    // repère du modèle (tourné de π/2 - dir·π/2, voir le placement des bâtiments) : le côté dir + 1 est
    // à gauche (-x), le côté dir + 3 à droite (+x)
    const neg = (m & 1) !== 0;
    const pos = (m & 2) !== 0;
    return neg && pos ? set[2] : neg ? set[0] : pos ? set[1] : undefined;
  }

  /**
   * Hauteur du toit d'un bâtiment à son centre : la face la plus haute du modèle qui recouvre le
   * point central (et non le sommet d'une cheminée ou d'une antenne posée à côté).
   */
  private roofHeight(kind: number, lvl = 0): number {
    const key = kind * 8 + lvl;
    const hit = this.roofCache.get(key);
    if (hit !== undefined) return hit;
    const km = (lvl > 0 ? this.levelMeshes.get(kind)?.[lvl - 1] : undefined) ?? this.buildingMeshes[kind];
    let top = 0;
    if (km) {
      const p = km.built.body.getAttribute("position");
      for (let i = 0; i + 2 < p.count; i += 3) {
        const ax = p.getX(i), az = p.getZ(i);
        const bx = p.getX(i + 1), bz = p.getZ(i + 1);
        const cx = p.getX(i + 2), cz = p.getZ(i + 2);
        // le point (0, 0) est-il dans la projection du triangle sur le sol ?
        const d1 = (0 - bx) * (az - bz) - (ax - bx) * (0 - bz);
        const d2 = (0 - cx) * (bz - cz) - (bx - cx) * (0 - cz);
        const d3 = (0 - ax) * (cz - az) - (cx - ax) * (0 - az);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (neg && pos) continue;
        top = Math.max(top, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3);
      }
      top *= km.scale;
      if (top <= 0) top = km.height;
    }
    this.roofCache.set(key, top);
    return top;
  }

  /** Maillage d'une icône posée à plat (texture de l'icône générée), créé à la première utilisation. */
  private logoMesh(key: string): THREE.InstancedMesh | null {
    let m = this.logoMeshes.get(key);
    if (m) return m;
    const [cat, k] = key.split("/") as ["items" | "units", string];
    const url = sprite(cat, k);
    if (!url) return null;
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, alphaTest: 0.08, depthWrite: false }), 2000);
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = 3;
    this.group.add(m);
    this.logoMeshes.set(key, m);
    return m;
  }

  /**
   * Icônes de production sur les toits de nos bâtiments : recette d'un bâtiment de fabrication,
   * unité en cours d'une usine, lots de la recherche d'un laboratoire
   * (plusieurs icônes côte à côte, un peu superposées). Posées à plat, tournées vers le haut de l'écran.
   */
  private updateLogos(f: Frame, strategic: boolean, myTeam: number, spectator: boolean): void {
    const cam = this.camera;
    let yaw = this.logoYaw;
    if (cam) {
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      if (Math.abs(fwd.x) + Math.abs(fwd.z) > 1e-3) yaw = Math.atan2(-fwd.x, -fwd.z);
    }
    if (strategic) {
      for (const m of this.logoMeshes.values()) m.count = 0;
      this.logoDiscs.count = 0;
      this.logoFor = null;
      return;
    }
    if (f === this.logoFor && Math.abs(yaw - this.logoYaw) < 0.01) return;
    this.logoFor = f;
    this.logoYaw = yaw;
    for (const m of this.logoMeshes.values()) m.count = 0;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const buf = f.buf;
    let nd = 0;
    let o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = buf[o + 1] & 0xff;
      const def = this.data.buildings[kind];
      const cls = def.cls;
      // (pas d'icône sur l'extracteur : ses pièces sont teintées selon le minerai exploité)
      if (cls !== BClass.Crafter && cls !== BClass.Factory && cls !== BClass.Lab && cls !== BClass.Depot) continue;
      if (buf[o + 4] < 65536) continue;
      const owner = (buf[o + 1] >> 8) & 0xff;
      if (!spectator && (f.players[owner]?.team ?? owner) !== myTeam) continue;
      const aux = buf[o + 5] & 0xff;
      const keys: string[] = [];
      if (cls === BClass.Crafter && aux !== 255) {
        const it = this.data.recipes[aux]?.output[0];
        if (it !== undefined) keys.push("items/" + this.data.items[it].key);
      } else if (cls === BClass.Factory && aux > 0) keys.push("units/" + this.data.units[aux - 1]?.key);
      else if (cls === BClass.Depot) {
        // dépôt : objets filtrés sur le toit (sans filtre, tout sort : pas d'icône)
        const w5 = buf[o + 5];
        for (const it of [w5 & 0xff, (w5 >>> 8) & 0xff, (w5 >>> 16) & 0xff, buf[o + 6] & 0xff]) if (it > 0 && this.data.items[it]) keys.push("items/" + this.data.items[it].key);
      } else if (cls === BClass.Lab && aux > 0) {
        const tier = this.data.techs[aux]?.tier ?? 0;
        for (let k = 0; k < tier; k++) keys.push("items/" + this.data.items[PACK1 + k].key);
      }
      if (!keys.length) continue;
      const dir = (buf[o + 1] >> 16) & 3;
      const bw = dir & 1 ? def.h : def.w;
      const bh = dir & 1 ? def.w : def.h;
      const cx = (buf[o + 2] & 0xffff) + bw / 2;
      const cz = ((buf[o + 2] >>> 16) & 0xffff) + bh / 2;
      const top = groundHeight(this.map, cx, cz) + this.roofHeight(kind, cls === BClass.Depot || this.data.buildings[kind].key === "furnace" ? (buf[o + 5] >>> 24) & 3 : 0) + 0.05;
      const size = Math.min(1.7, Math.max(0.55, Math.min(bw, bh) * 0.42));
      // icônes côte à côte, superposées d'un tiers, centrées sur le toit
      const step = size * 0.68;
      const n = keys.length;
      for (let k = 0; k < n; k++) {
        const m = this.logoMesh(keys[k]);
        if (!m || m.count >= 2000) continue;
        const off = (k - (n - 1) / 2) * step;
        tmpM.compose(tmpV.set(cx + rx * off, top + k * 0.004, cz + rz * off), q, tmpS.set(size, 1, size));
        m.setMatrixAt(m.count++, tmpM);
      }
      if (nd < 4000) {
        const wd = size + step * (n - 1);
        tmpM.compose(tmpV.set(cx, top - 0.01, cz), q, tmpS.set(wd / 1.0, 1, size));
        this.logoDiscs.setMatrixAt(nd++, tmpM);
      }
    }
    this.logoDiscs.count = nd;
    this.logoDiscs.instanceMatrix.needsUpdate = true;
    for (const m of this.logoMeshes.values()) m.instanceMatrix.needsUpdate = true;
  }

  /** Une lueur (ellipsoïde additif d'axe la course courante, tmpQ) ; renvoie le nouveau compte. */
  private glow(n: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, k: number): number {
    if (n >= 8000) return n;
    tmpM.compose(tmpV2.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
    this.proj.setMatrixAt(n, tmpM);
    this.proj.setColorAt(n, tmpC.setHex(color).multiplyScalar(k));
    return n + 1;
  }

  /**
   * Origine d'un rayon prolongé de l'arme `wi` : pivot « laser » du modèle de l'unité qui la porte
   * (hauteur et avancée vers la cible, à l'échelle), sinon aux trois cinquièmes de sa hauteur.
   */
  private beamSource(wi: number): { h: number; fwd: number; air: boolean; big: number } {
    let s = this.beamFrom.get(wi);
    if (s) return s;
    const kind = this.data.units.findIndex((u) => u.weapons.includes(wi));
    const km = kind >= 0 ? this.unitMeshes[kind] : undefined;
    const def = kind >= 0 ? this.data.units[kind] : undefined;
    const piv = km?.built.pivots.find((p) => p.name === "laser");
    const h = piv ? piv.origin.y * km!.scale : (km?.height ?? 1) * 0.6;
    const fwd = piv ? Math.hypot(piv.origin.x, piv.origin.z) * km!.scale : 0;
    const air = def ? def.layer === Layer.Air || def.layer === Layer.Hover : false;
    s = { h, fwd, air, big: def && def.tier === 6 ? 1.5 : 1 };
    this.beamFrom.set(wi, s);
    return s;
  }

  /** Hauteur de vol de l'unité qui porte l'arme `wi` (rayons tirés depuis les airs). */
  private unitHeightAt(wi: number, x: number, z: number): number {
    const kind = this.data.units.findIndex((u) => u.weapons.includes(wi));
    return kind >= 0 ? this.unitHeight(kind, x, z) : groundHeight(this.map, x, z);
  }

  /**
   * Goulottes d'un extracteur posé en (bx, bz), tourné vers `dir` : pour chaque case devant sa face
   * avant qui porte un tapis, un petit tapis incliné descend du socle jusqu'au tapis. Tapis dans le sens
   * de la sortie : la goulotte rejoint son début ; en travers ou à contresens : elle s'arrête sur son
   * bord (arrivée latérale).
   */
  private drawChutes(km: KindMesh, bx: number, bz: number, dir: number, w: number, h: number, belts: Map<number, number>): void {
    const DX = [1, 0, -1, 0];
    const DZ = [0, 1, 0, -1];
    const bw = dir & 1 ? h : w;
    const bh = dir & 1 ? w : h;
    // cases devant la face avant (même ordre que la simulation : front_tiles)
    const tiles: [number, number][] = [];
    if (dir === 0) for (let z = bz; z < bz + bh; z++) tiles.push([bx + bw, z]);
    else if (dir === 1) for (let x = bx; x < bx + bw; x++) tiles.push([x, bz + bh]);
    else if (dir === 2) for (let z = bz; z < bz + bh; z++) tiles.push([bx - 1, z]);
    else for (let x = bx; x < bx + bw; x++) tiles.push([x, bz - 1]);
    const dx = DX[dir];
    const dz = DZ[dir];
    const yaw = Math.PI / 2 - (dir * Math.PI) / 2;
    for (const [tx, tz] of tiles) {
      const bd = belts.get((tx | (tz << 16)) >>> 0);
      if (bd === undefined) continue;
      // bord de la case du tapis côté extracteur, au milieu de la case
      const ex = tx + 0.5 - dx * 0.5;
      const ez = tz + 0.5 - dz * 0.5;
      // départ dans le socle de l'extracteur ; arrivée au début du tapis (même sens) ou sur son bord
      const reach = bd === dir ? 0.12 : 0.24;
      const sx = ex - dx * 0.22;
      const sz = ez - dz * 0.22;
      const fx = ex + dx * reach;
      const fz = ez + dz * reach;
      const g = groundHeight(this.map, ex, ez);
      const y0 = g + 0.24;
      const y1 = g + 0.1;
      const len = Math.hypot(fx - sx, fz - sz);
      const pitch = Math.atan2(y0 - y1, len);
      km.ensure(km.n + 1);
      tmpQ2.setFromAxisAngle(UP, yaw).multiply(tmpQ3.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
      tmpM2.compose(tmpV.set((sx + fx) / 2, (y0 + y1) / 2 - 0.03, (sz + fz) / 2), tmpQ2, tmpS.set(1, 1, len / Math.cos(pitch)));
      km.body!.mesh.setMatrixAt(km.n, tmpM2);
      setTeamColor(km.body!, km.n, tmpC.setRGB(1, 1, 1));
      km.n++;
    }
  }

  /**
   * Vue logistique : sur chaque tapis, une dalle selon son remplissage (objets sur la case : vide,
   * fluide, chargé, saturé) ; sous les bâtiments, une dalle s'ils sont bloqués (sortie pleine), affamés
   * (entrée manquante) ou sans énergie suffisante ; vert pâle s'ils tournent.
   */
  private updateLogistics(f: Frame, strategic: boolean, myTeam: number, spectator: boolean): void {
    const m = this.logiPads;
    if (!this.logistics || strategic) {
      m.count = 0;
      return;
    }
    const buf = f.buf;
    // objets par case de tapis (cases du monde, tous niveaux)
    const fill = new Map<number, number>();
    for (let i = 0, o = f.itemOff; i < f.nItems; i++, o += ITEM_WORDS) {
      const key = Math.floor(buf[o + 1] / TILE) * 65536 + Math.floor(buf[o] / TILE);
      fill.set(key, (fill.get(key) ?? 0) + 1);
    }
    let n = 0;
    const put = (x: number, y: number, z: number, w: number, h: number, c: THREE.Color) => {
      if (n >= 20000) return;
      tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(w, 1, h));
      m.setMatrixAt(n, tmpM);
      m.setColorAt(n, c);
      n++;
    };
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = buf[o + 1] & 0xff;
      const def = this.data.buildings[kind];
      const owner = (buf[o + 1] >> 8) & 0xff;
      if (!spectator && (f.players[owner]?.team ?? owner) !== myTeam) continue;
      if (buf[o + 4] < 65536) continue;
      const dir = (buf[o + 1] >> 16) & 3;
      const flags = (buf[o + 1] >> 20) & 0xff;
      const x = buf[o + 2] & 0xffff;
      const z = (buf[o + 2] >>> 16) & 0xffff;
      const bw = dir & 1 ? def.h : def.w;
      const bh = dir & 1 ? def.w : def.h;
      const cx = x + bw / 2;
      const cz = z + bh / 2;
      const g = groundHeight(this.map, cx, cz);
      if (def.cls === BClass.Belt) {
        const floor = (buf[o + 1] >>> 28) & 3;
        const k = fill.get(z * 65536 + x) ?? 0;
        put(cx, g + floor * FLOOR_H + 0.14, cz, 0.62, 0.92, k >= 4 ? LOGI_FULL : k === 3 ? LOGI_BUSY : k > 0 ? LOGI_FLOW : LOGI_EMPTY);
        continue;
      }
      if (def.cls === BClass.Wall || def.cls === BClass.Pylon || def.cls === BClass.Inserter) continue;
      const c =
        flags & BF.OUT_BLOCKED ? LOGI_BLOCKED : flags & BF.NO_INPUT ? LOGI_STARVED : flags & (BF.UNPOWERED | BF.LOW_POWER) && def.powerUse > 0 ? LOGI_POWER : flags & BF.WORKING ? LOGI_OK : null;
      if (c) put(cx, g + 0.06, cz, bw * 1.04, bh * 1.04, c);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Maillage des objets d'un type (modèle de assets/models/items.ts, un quart de case de large). */
  private itemMesh(kind: number): KindMesh | undefined {
    let km = this.itemMeshes[kind];
    if (km) return km;
    const key = this.data.items[kind]?.key;
    if (!key) return undefined;
    const built = buildModel(ITEM_MODELS[key] ?? fallbackModel(0.5));
    const size = new THREE.Vector3();
    built.box.getSize(size);
    km = new KindMesh(this.group, built, 0.24 / Math.max(size.x, size.z, 0.01), 0, false);
    this.itemMeshes[kind] = km;
    return km;
  }

  addExplosion(x: number, z: number, r: number, kind: number): void {
    this.effects.explosion(x, z, r, kind);
  }

  addBeam(a: THREE.Vector3, b: THREE.Vector3, color: number, life = 0.15): void {
    if (this.beamList.length > 3900) return;
    this.beamList.push({ a, b, age: 0, life, color: new THREE.Color(color) });
  }

  private updateFx(dt: number): void {
    if (this.camera) this.effects.update(dt, this.camera);
    this.beamList = this.beamList.filter((b) => (b.age += dt) < b.life);
    let k = 0;
    for (const b of this.beamList) {
      const f = (1 - b.age / b.life) * 2.2;
      this.beamPos.set([b.a.x, b.a.y, b.a.z, b.b.x, b.b.y, b.b.z], k * 6);
      this.beamCol.set([b.color.r * f, b.color.g * f, b.color.b * f, b.color.r * f, b.color.g * f, b.color.b * f], k * 6);
      k++;
    }
    this.beams.geometry.setDrawRange(0, k * 2);
    (this.beams.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.beams.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Bâtiments qui affichent une icône de diagnostic. */
const DIAG_CLASSES = new Set<number>([BClass.Crafter, BClass.Extractor, BClass.Lab, BClass.Factory, BClass.Station, BClass.CargoPad, BClass.Turret, BClass.Radar, BClass.Shield]);

/** Atlas des icônes de diagnostic : sans énergie, entrée manquante, sortie bloquée, énergie faible. */
function diagAtlas(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const disc = (i: number, color: string) => {
      g.beginPath();
      g.arc(i * 64 + 32, 32, 27, 0, Math.PI * 2);
      g.fillStyle = "rgba(10,14,20,0.85)";
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = color;
      g.stroke();
    };
    const bolt = (i: number, color: string) => {
      const x = i * 64;
      g.beginPath();
      g.moveTo(x + 36, 12);
      g.lineTo(x + 22, 35);
      g.lineTo(x + 31, 35);
      g.lineTo(x + 27, 52);
      g.lineTo(x + 43, 27);
      g.lineTo(x + 34, 27);
      g.closePath();
      g.fillStyle = color;
      g.fill();
    };
    disc(0, "#ff4d4d");
    bolt(0, "#ff4d4d");
    g.strokeStyle = "#ff4d4d";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(16, 48);
    g.lineTo(48, 16);
    g.stroke();
    // entrée manquante : flèche vers un bac vide
    disc(1, "#ffb547");
    g.strokeStyle = "#ffb547";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(96, 14);
    g.lineTo(96, 36);
    g.moveTo(87, 28);
    g.lineTo(96, 37);
    g.lineTo(105, 28);
    g.moveTo(80, 42);
    g.lineTo(80, 49);
    g.lineTo(112, 49);
    g.lineTo(112, 42);
    g.stroke();
    // sortie bloquée : caisse barrée
    disc(2, "#ffb547");
    g.strokeStyle = "#ffb547";
    g.lineWidth = 4;
    g.strokeRect(146, 18, 28, 28);
    g.beginPath();
    g.moveTo(146, 18);
    g.lineTo(174, 46);
    g.moveTo(174, 18);
    g.lineTo(146, 46);
    g.stroke();
    // énergie faible
    disc(3, "#ffe066");
    bolt(3, "#ffe066");
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Horizon des événements d'une porte : disque bleu d'eau lumineuse, ondes concentriques qui partent du
 * centre, bord plus clair, reflets qui tournent lentement.
 */
function vortexMaterial(): THREE.Material {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const p = uv().sub(vec2(0.5, 0.5));
  const d = p.length().mul(2);
  const ripple = d.mul(22).sub(time.mul(3.2)).sin().mul(0.5).add(0.5);
  const swirl = p.x.mul(9).add(time.mul(0.8)).sin().mul(p.y.mul(9).sub(time.mul(0.6)).cos()).mul(0.5).add(0.5);
  const edge = d.pow(6);
  const glow = ripple.mul(0.35).add(swirl.mul(0.25)).add(edge.mul(0.9)).add(0.3);
  m.colorNode = vec3(0.35, 0.7, 1.4).mul(glow).add(vec3(0.6, 0.85, 1).mul(edge));
  m.opacityNode = float(0.85).mul(float(1).sub(d.pow(14)));
  return m;
}

/** Motif d'alvéoles hexagonales (traits blancs sur fond transparent), répété sur la bulle des boucliers. */
function hexTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = Math.round(w * Math.sqrt(3));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineWidth = 3;
  const r = w / 3;
  const hex = (cx: number, cy: number) => {
    g.beginPath();
    for (let k = 0; k <= 6; k++) {
      const a = (Math.PI / 3) * k;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  // pavage qui se raccorde sur les bords (deux colonnes décalées)
  const dy = (r * Math.sqrt(3)) / 2;
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2], [r * 1.5 - w / 2 + w / 2, dy], [0, h / 2], [w, h / 2], [w / 2, 0], [w / 2, h]]) hex(cx, cy);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Bulle de bouclier détaillée : bord lumineux (plus le regard est rasant, plus elle brille), alvéoles
 * hexagonales qui glissent lentement, vague lumineuse qui parcourt la bulle. Couleur : celle de l'instance.
 */
function shieldMaterial(): THREE.Material {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const hex = tslTexture(hexTexture(), uv().mul(vec2(16, 8)).add(vec2(time.mul(0.015), 0))).a;
  const rim = float(1).sub(normalView.z.abs()).pow(2.4);
  const wave = uv().y.mul(26).sub(time.mul(1.6)).sin().mul(0.5).add(0.5);
  const a = rim.mul(0.75).add(hex.mul(0.22).mul(wave.mul(0.6).add(0.4))).add(0.025);
  m.colorNode = vec3(1).mul(rim.mul(1.4).add(1));
  m.opacityNode = a.clamp(0, 1);
  return m;
}

const PROJ_COLORS: Record<number, number> = { 0: 0xffd27a, 1: 0xffb050, 2: 0xff7050, 3: 0x404040, 4: 0x9fd0ff, 5: 0x7fffff, 6: 0x7dfcff, 7: 0x9db7ff, 8: 0xff5050, 9: 0xff2a2a, 10: 0xff9030, 11: 0xc8ecff, 13: 0x9adf3a };
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/**
 * Apparence de chaque famille de projectiles (en cases).
 * - matériels : slug = [diamètre, longueur] de l'ogive, color = teinte du métal, grow = grossit un peu pour
 *   les armes à grand rayon d'effet ; tail = lueur derrière [diamètre, longueur, recul, couleur, intensité]
 *   (traceur des balles, culot chaud des obus, flamme des missiles) ;
 * - énergie : core / halo = [diamètre, longueur] du cœur et du halo, k = intensité du cœur.
 */
interface ProjLook {
  slug?: [number, number];
  color: number;
  grow?: boolean;
  tail?: [number, number, number, number, number];
  core?: [number, number];
  halo?: [number, number];
  k?: number;
}
const PROJ_LOOKS: Record<number, ProjLook> = {
  0: { slug: [0.045, 0.16], color: 0xd8a850, tail: [0.035, 0.7, 0.3, 0xffb060, 1.2] },
  1: { slug: [0.085, 0.26], color: 0x4a5058, grow: true, tail: [0.08, 0.16, 0.02, 0xff9a40, 2.6] },
  2: { slug: [0.07, 0.34], color: 0xc4c9cf, grow: true, tail: [0.09, 0.26, 0.08, 0xffc070, 3] },
  3: { slug: [0.13, 0.36], color: 0x3c4232, grow: true },
  4: { slug: [0.08, 0.42], color: 0x2e353c, tail: [0.05, 0.12, 0.02, 0x9fd0ff, 1.4] },
  5: { color: 0x7fffff, core: [0.18, 0.3], halo: [0.45, 0.6], k: 2.8 },
  6: { color: 0x7dfcff, core: [0.15, 0.24], halo: [0.38, 0.48], k: 2.8 },
  7: { color: 0x9db7ff, core: [0.17, 0.2], halo: [0.48, 0.5], k: 2.6 },
  8: { color: 0xff5050, core: [0.05, 1.1], halo: [0.15, 1.3], k: 3.2 },
  9: { color: 0xff2a2a, core: [0.045, 0.9], halo: [0.14, 1.05], k: 3.4 },
  11: { color: 0xc8ecff, core: [0.03, 3], halo: [0.11, 3.2], k: 3.4 },
  // crachat acide d'un nid : boule verte baveuse
  13: { color: 0x9adf3a, core: [0.16, 0.22], halo: [0.42, 0.5], k: 2 },
};
