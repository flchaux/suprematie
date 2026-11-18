// Rendu des entités : un InstancedMesh par type d'unité, de bâtiment et d'objet sur tapis ;
// chaque pièce mobile (tourelle) est un mesh instancié séparé. Interpolation entre les deux derniers ticks.
// Les effets (feu, fumée, débris) sont dans effects.ts.
import * as THREE from "three/webgpu";
import type { GameData, Frame } from "@supreme/shared";
import { UNIT_WORDS, BUILDING_WORDS, ITEM_WORDS, PROJ_WORDS, WRECK_WORDS, SHIELD_WORDS, CARRIER_WORDS, UF, BF, BClass, Layer, PACK1 } from "@supreme/shared";
import { texture as tslTexture, uv, vec2, instancedBufferAttribute } from "three/tsl";
import { BUILDING_FILL, buildingScale, buildModel, fallbackModel, PLAYER_COLORS } from "../models/generator.ts";
import { teamInstancedMesh, setTeamColor, setAccentColor, TEX_PER_TILE_UNIT, TEX_PER_TILE_BUILDING, type TeamMesh } from "./materials.ts";
import { UNIT_MODELS } from "../../../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { VEHICLE_MODELS } from "../../../../assets/models/vehicles.ts";
import { ITEM_MODELS } from "../../../../assets/models/items.ts";
import { groundHeight, HSCALE, type MapData } from "./terrain.ts";
import { Effects } from "./effects.ts";
import { sprite } from "../ui/sprites.ts";

const TILE = 256;
const ANG = (Math.PI * 2) / 65536;
/** épaves dessinées par modèle (au plus) */
const WRECK_CAP = 1024;

class KindMesh {
  body: TeamMesh | null = null;
  pivots: { tm: TeamMesh; origin: THREE.Vector3; spin: boolean; leg: number; wave: number }[] = [];
  cap = 0;
  n = 0;
  /** hauteur du modèle à l'échelle (pour placer la fumée au sommet) */
  height = 1;
  constructor(
    public scene: THREE.Object3D,
    public built: ReturnType<typeof buildModel>,
    public scale: number,
    /** répétitions de texture par case du monde */
    public texPerTile = 0,
    /** ombres portées (désactivées pour les objets des tapis, très nombreux) */
    public shadows = true,
  ) {
    const size = new THREE.Vector3();
    built.box.getSize(size);
    this.height = size.y * scale;
    this.legs = built.pivots.some((p) => /^jambe/.test(p.name));
  }
  /** le modèle a des jambes articulées (pivots « jambe… ») */
  legs = false;
  ensure(need: number): void {
    if (need <= this.cap) return;
    const cap = Math.max(16, this.cap * 2, need);
    if (this.body) this.scene.remove(this.body.mesh);
    for (const p of this.pivots) this.scene.remove(p.tm.mesh);
    this.body = teamInstancedMesh(this.built.body, cap, this.texPerTile * this.scale);
    this.body.mesh.castShadow = this.shadows;
    this.scene.add(this.body.mesh);
    this.pivots = this.built.pivots.map((p) => {
      const tm = teamInstancedMesh(p.geometry, cap, this.texPerTile * this.scale);
      this.scene.add(tm.mesh);
      // jambe : 1 ou 2 selon la phase (gauche ou arrière décalée d'un demi-pas), 0 sinon
      const leg = /^jambe/.test(p.name) ? 1 + (Number(/_g\b|_g_|_g$/.test(p.name)) ^ Number(/_ar/.test(p.name))) : 0;
      // anneau d'un corps qui ondule (« ondule1 », « ondule2 »… de la tête vers la queue), 0 sinon
      const wave = Number(/^ondule(\d+)/.exec(p.name)?.[1] ?? 0);
      return { tm, origin: p.origin.clone().multiplyScalar(this.scale), spin: /rotor|helice|foret|radar|emetteur|cristal|feu/.test(p.name), leg, wave };
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
const RECEIVERS = new Set<number>([BClass.Crafter, BClass.Lab, BClass.Depot, BClass.Factory, BClass.Silo, BClass.AntiMissile, BClass.Warehouse, BClass.Station, BClass.CargoPad]);
const RECIPE_NONE = 255;
/** teinte d'un bâtiment en cours d'amélioration (chantier ambre) */
const UPGRADE_TINT = new THREE.Color(0xffc266);
const CRAFTER_ASSEMBLER = 1;

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpQ3 = new THREE.Quaternion();
// vue logistique : tapis vide, fluide, chargé, saturé ; bâtiment bloqué, affamé, sans énergie, en marche
const LOGI_EMPTY = new THREE.Color(0.25, 0.32, 0.45);
const LOGI_FLOW = new THREE.Color(0.25, 1.1, 0.45);
const LOGI_BUSY = new THREE.Color(1.3, 1.05, 0.2);
const LOGI_FULL = new THREE.Color(1.5, 0.18, 0.12);
const LOGI_BLOCKED = new THREE.Color(1.5, 0.18, 0.12);
const LOGI_STARVED = new THREE.Color(1.4, 0.75, 0.1);
const LOGI_POWER = new THREE.Color(0.85, 0.35, 1.5);
const LOGI_OK = new THREE.Color(0.2, 0.6, 0.3);
/** hauteur d'un niveau de tapis (cases du monde) : niveau 1 au-dessus des bâtiments bas, niveau 2 encore au-dessus */
export const FLOOR_H = 1.6;
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
  /** pans de mur entre deux murs voisins du même camp (à l'échelle du poteau) */
  wallSeg: KindMesh | null = null;
  /** goulottes entre les sorties d'un extracteur et les tapis devant lui */
  chute: KindMesh | null = null;
  /** niveau d'un extracteur amélioré : une barre ambrée par niveau sur la façade avant du socle */
  levelPips: THREE.InstancedMesh;
  /** vue logistique (touche maintenue) : dalles colorées sur les tapis (remplissage) et sous les bâtiments en difficulté */
  logistics = false;
  logiPads: THREE.InstancedMesh;
  /** tapis surélevés : piliers, et cages d'ascenseur (montants et traverse) là où un tapis change de niveau */
  supports: THREE.InstancedMesh;
  liftGlow: THREE.InstancedMesh;
  teamColors: THREE.Color[] = PLAYER_COLORS.map((c) => new THREE.Color(c));
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
  anim = new Map<number, { phase: number; torso: number; seen: number }>();
  animFrame = 0;
  /** trappes des bâtiments qui reçoivent des objets : fermées, ou ouvertes (entrée cyan, sortie ambre) */
  hatchClosed: THREE.InstancedMesh;
  hatchFrame: THREE.InstancedMesh;
  hatchHole: THREE.InstancedMesh;
  private hatchFor: Frame | null = null;
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
    for (const u of data.units) {
      const built = buildModel(UNIT_MODELS[u.key] ?? fallbackModel(0.5));
      const size = new THREE.Vector3();
      built.box.getSize(size);
      const target = Math.max(0.7, (u.radius * 2.3) / TILE);
      const scale = target / Math.max(size.x, size.z, 0.01);
      this.unitMeshes.push(new KindMesh(this.group, built, scale, TEX_PER_TILE_UNIT));
    }
    for (const b of data.buildings) {
      const built = buildModel(BUILDING_MODELS[b.key] ?? fallbackModel(b.w > 1 ? 1.2 : 0.4));
      const size = new THREE.Vector3();
      built.box.getSize(size);
      const scale = buildingScale(b.w, size.x, size.z, b.reach);
      this.buildingMeshes.push(new KindMesh(this.group, built, scale, TEX_PER_TILE_BUILDING));
      const lv: KindMesh[] = [];
      for (let n = 2; BUILDING_MODELS[`${b.key}_n${n}`]; n++) {
        const bl = buildModel(BUILDING_MODELS[`${b.key}_n${n}`]);
        const sz = new THREE.Vector3();
        bl.box.getSize(sz);
        lv.push(new KindMesh(this.group, bl, buildingScale(b.w, sz.x, sz.z, b.reach), TEX_PER_TILE_BUILDING));
      }
      if (lv.length) this.levelMeshes.set(this.buildingMeshes.length - 1, lv);
      // tapis : virages (objets entrant par la gauche, par la droite), à l'échelle du tapis droit
      if (b.cls === BClass.Belt) {
        const g = BUILDING_MODELS[b.key + "_virage_g"];
        const d = BUILDING_MODELS[b.key + "_virage_d"];
        if (g && d) this.beltCurves.set(this.buildingMeshes.length - 1, [new KindMesh(this.group, buildModel(g), scale, TEX_PER_TILE_BUILDING), new KindMesh(this.group, buildModel(d), scale, TEX_PER_TILE_BUILDING)]);
      }
      if (b.cls === BClass.Wall && !this.wallSeg && BUILDING_MODELS.wall_seg) this.wallSeg = new KindMesh(this.group, buildModel(BUILDING_MODELS.wall_seg), scale, TEX_PER_TILE_BUILDING);
      if (b.cls === BClass.Extractor && !this.chute && BUILDING_MODELS.goulotte) this.chute = new KindMesh(this.group, buildModel(BUILDING_MODELS.goulotte), 1, TEX_PER_TILE_BUILDING);
    }
    const basic = (opts: Record<string, unknown>) => new THREE.MeshBasicNodeMaterial(opts);
    this.itemColors = data.items.map((it) => new THREE.Color(it.color ?? 0xffffff));
    // projectiles lumineux (couleurs au-delà de 1 : halo)
    this.proj = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), basic({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 8000);
    this.proj.count = 0;
    this.proj.frustumCulled = false;
    this.proj.setColorAt(0, new THREE.Color());
    this.group.add(this.proj);
    this.slugs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardNodeMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.35 }), 6000);
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
    this.liftGlow = new THREE.InstancedMesh(post, new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0x3ef0ff).multiplyScalar(1.6) }), 2000);
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
    for (const [key, len] of [["train", 2.6], ["cargo_drone", 1.1], ["logistic_robot", 0.6]] as const) {
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
    this.shields = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), basic({ transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }), 400);
    this.shields.count = 0;
    this.shields.frustumCulled = false;
    this.shields.setColorAt(0, new THREE.Color());
    this.group.add(this.shields);
    this.wrecks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardNodeMaterial({ color: 0x4a3b30, roughness: 1 }), 6000);
    this.wrecks.count = 0;
    this.wrecks.frustumCulled = false;
    this.wrecks.castShadow = true;
    // trappes : plaque fermée ; ouverte = cadre lumineux coloré autour d'une ouverture sombre
    const HATCH_MAX = 6000;
    this.hatchClosed = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.4, 0.05), new THREE.MeshStandardNodeMaterial({ color: 0x3a434e, roughness: 0.55, metalness: 0.5 }), HATCH_MAX);
    this.hatchFrame = new THREE.InstancedMesh(new THREE.BoxGeometry(0.64, 0.44, 0.04), new THREE.MeshBasicNodeMaterial({}), HATCH_MAX);
    this.hatchHole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), new THREE.MeshBasicNodeMaterial({ color: 0x06090d }), HATCH_MAX);
    this.hatchFrame.setColorAt(0, new THREE.Color());
    for (const m of [this.hatchClosed, this.hatchFrame, this.hatchHole]) {
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
    for (const m of this.unitMeshes) m.begin();
    for (const m of this.buildingMeshes) m.begin();
    for (const l of this.levelMeshes.values()) for (const m of l) m.begin();
    for (const [g, d] of this.beltCurves.values()) {
      g.begin();
      d.begin();
    }
    this.wallSeg?.begin();
    this.chute?.begin();
    for (const m of this.vehicleMeshes) m.begin();
    this.frameN++;
    let nd = 0;
    let nr = 0;
    const now = performance.now();
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
      this.screen.push({ id, kind, owner, x, y, z, visible });
      const col = this.teamColors[owner % 8];
      const inView = x > vx0 - 4 && x < vx1 + 4 && z > vz0 - 4 && z < vz1 + 4;
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
      if (!st) this.anim.set(id, (st = { phase: (id % 7) * 0.9, torso: 0, seen: 0 }));
      st.seen = this.animFrame;
      const per = Math.hypot(buf[o + 2] - buf[o + 4], buf[o + 3] - buf[o + 5]) / TILE; // cases par tick
      const vmax = Math.max(0.1, def.speed / 10); // cases par seconde
      const walk = Math.min(1, (per * 20) / vmax);
      const stride = Math.max(0.4, km.height * 0.7);
      st.phase += ((per * 20 * dt) / stride) * Math.PI;
      if (walk > 0.05 && km.legs) bob += Math.abs(Math.sin(st.phase)) * 0.025 * km.height * walk;
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - facing);
      const sc = km.scale;
      tmpM.compose(tmpV.set(x, y + bob, z), tmpQ, tmpS.set(sc, sc, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      setTeamColor(km.body!, km.n, col);
      // haut du corps : il tourne vers sa cible à vitesse limitée (au plus 6 radians par seconde)
      const aim = flags & UF.IDLE && !(flags & UF.FIRING) && turret === 0 ? 0 : facing - turret;
      let dA = Math.atan2(Math.sin(aim - st.torso), Math.cos(aim - st.torso));
      dA = Math.max(-6 * dt, Math.min(6 * dt, dA));
      st.torso += dA;
      for (const p of km.pivots) {
        // la tourelle tourne vers sa cible ; les rotors tournent en continu ; les jambes se balancent
        tmpM2.makeTranslation(p.origin.x, p.origin.y, p.origin.z);
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
        } else tmpM2.multiply(new THREE.Matrix4().makeRotationY(p.spin ? performance.now() / 80 : st.torso));
        tmpM2.scale(tmpS.set(sc, sc, sc));
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
        if (Math.random() < 0.5) this.addBeam(new THREE.Vector3(x, y + 0.6, z), new THREE.Vector3(tx + (Math.random() - 0.5), groundHeight(this.map, tx, tz) + 0.5, tz + (Math.random() - 0.5)), 0x7df9ff, 0.12);
      }
    }
    // ----- bâtiments -----
    let npip = 0;
    let nsup = 0;
    let nlift = 0;
    /** pilier ou montant : boîte de (sx, h, sz) posée en (x, y0, z), tournée de q */
    const support = (x: number, y0: number, z: number, sx: number, h: number, sz: number, q: THREE.Quaternion, glow = false) => {
      const m = glow ? this.liftGlow : this.supports;
      const n = glow ? nlift : nsup;
      if (n >= (glow ? 2000 : 8000) || h <= 0) return;
      tmpM2.compose(tmpV.set(x, y0, z), q, tmpS.set(sx, h, sz));
      m.setMatrixAt(n, tmpM2);
      if (glow) nlift++;
      else nsup++;
    };
    // murs : case -> équipe, pour relier chaque mur à ses voisins du même camp par des pans fins
    const walls = new Map<number, number>();
    // tapis du sol terminés : case -> direction (goulottes des extracteurs)
    const groundBelts = new Map<number, number>();
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const cls = this.data.buildings[buf[o + 1] & 0xff]?.cls;
      if (cls === BClass.Wall) walls.set(buf[o + 2] >>> 0, teamOf((buf[o + 1] >> 8) & 0xff));
      else if (cls === BClass.Belt && buf[o + 4] >= 65536 && ((buf[o + 1] >>> 28) & 3) === 0) groundBelts.set(buf[o + 2] >>> 0, (buf[o + 1] >> 16) & 3);
    }
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = buf[o + 1] & 0xff;
      const owner = (buf[o + 1] >> 8) & 0xff;
      const dir = (buf[o + 1] >> 16) & 3;
      const bflags = (buf[o + 1] >> 20) & 0xff;
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      const def = this.data.buildings[kind];
      const cx = bx + def.w / 2;
      const cz = bz + def.h / 2;
      const enemy = teamOf(owner) !== myTeam;
      if (enemy && !seen(cx, cz, 8 | 1)) continue;
      const col = this.teamColors[owner % 8];
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
      // extracteur ou dépôt amélioré : modèle de son niveau
      const lvl = def.cls === BClass.Extractor || def.cls === BClass.Depot ? (buf[o + 5] >>> 24) & 3 : 0;
      const km = shape ? (this.beltCurves.get(kind)?.[shape - 1] ?? this.buildingMeshes[kind]) : ((lvl > 0 ? this.levelMeshes.get(kind)?.[lvl - 1] : undefined) ?? this.buildingMeshes[kind]);
      // amélioration en cours (millièmes, 0 : aucune) : chantier, le bâtiment ne travaille pas
      const upg = def.cls !== BClass.Belt ? Math.max(0, buf[o + 7]) / 1000 : 0;
      km.ensure(km.n + 1);
      const build = buf[o + 4] / 65536;
      const ground = groundHeight(this.map, cx, cz);
      // tapis surélevé (bits 28-29) ; montée ou descente vers le niveau des bits 3-4 du mot auxiliaire
      const floor = def.cls === BClass.Belt ? (buf[o + 1] >>> 28) & 3 : 0;
      const ramp = def.cls === BClass.Belt && (buf[o + 5] & 4) !== 0 ? (buf[o + 5] >> 3) & 3 : -1;
      const y = ground + (ramp >= 0 ? ((floor + ramp) / 2) * FLOOR_H : floor * FLOOR_H);
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - (dir * Math.PI) / 2);
      const sc = km.scale;
      const sy = build >= 1 ? sc : sc * Math.max(0.08, build);
      let szz = sc;
      tmpQ3.copy(tmpQ);
      if (ramp >= 0) {
        // rampe : le tapis s'incline vers l'avant (+z du modèle) et s'allonge pour couvrir la case
        const pitch = Math.atan2((ramp - floor) * FLOOR_H, 1);
        tmpQ3.multiply(tmpQ2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -pitch));
        szz = sc / Math.cos(pitch);
      }
      tmpM.compose(tmpV.set(cx, def.water ? this.map.waterLevel * HSCALE : y, cz), tmpQ3, tmpS.set(sc, sy, szz));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      const c = build < 1 ? tmpC.copy(col).lerp(new THREE.Color(0x9fe8ff), 0.5) : upg > 0 ? tmpC.copy(col).lerp(UPGRADE_TINT, 0.45 + 0.1 * Math.sin(performance.now() / 180)) : bflags & BF.UNPOWERED ? tmpC.copy(col).multiplyScalar(0.45) : col;
      setTeamColor(km.body!, km.n, c);
      // tapis surélevé : pilier sous la case ; rampe : cage d'ascenseur (deux montants, traverse, filets)
      if (def.cls === BClass.Belt && (floor > 0 || ramp >= 0)) {
        if (ramp < 0) support(cx, ground, cz, 0.16, floor * FLOOR_H - 0.02, 0.16, tmpQ);
        else {
          const top = Math.max(floor, ramp) * FLOOR_H + 0.4;
          for (const side of [-1, 1]) {
            tmpV2.set(side * 0.4, 0, 0).applyQuaternion(tmpQ);
            support(cx + tmpV2.x, ground, cz + tmpV2.z, 0.1, top, 0.1, tmpQ);
            support(cx + tmpV2.x * 1.12, ground + 0.15, cz + tmpV2.z * 1.12, 0.025, top - 0.3, 0.025, tmpQ, true);
          }
          support(cx, ground + top, cz, 0.9, 0.08, 0.12, tmpQ);
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
          rot = phase === 1 ? Math.PI * (1 - timer / 6) : phase === 2 ? Math.PI : phase === 3 ? (Math.PI * timer) / 6 : 0;
        } else if (bflags & BF.WORKING && upg === 0) rot = performance.now() / 300;
        tmpM2.makeTranslation(p.origin.x, p.origin.y * (sy / sc), p.origin.z);
        tmpM2.multiply(new THREE.Matrix4().makeRotationY(rot));
        tmpM2.scale(tmpS.set(sc, sy, sc));
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
        const cur = this.carCur.get(idx) ?? [buf[o + 1], buf[o + 2]];
        const prev = this.carPrev.get(idx) ?? cur;
        const x = (prev[0] + (cur[0] - prev[0]) * alpha) / TILE;
        const z = (prev[1] + (cur[1] - prev[1]) * alpha) / TILE;
        if (teamOf(owner) !== myTeam && !seen(x, z, 1)) continue;
        const km = this.vehicleMeshes[kind];
        if (!km) continue;
        km.ensure(km.n + 1);
        const g = groundHeight(this.map, x, z);
        let y = g + 0.05;
        if (kind >= 1) {
          // drone : vol à 5 cases au-dessus du sol (ou de l'eau), posé sur l'héliport à l'arrêt ; robot : 3 cases
          const target = moving ? Math.max(g, this.map.waterLevel * HSCALE) + (kind === 2 ? 3 : 5) : g + 0.45;
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
    this.wallSeg?.end();
    this.chute?.end();
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
    for (const km of this.itemMeshes) km?.begin();
    if (!strategic) {
      o = f.itemOff;
      tmpQ.setFromAxisAngle(UP, 0.45);
      for (let i = 0; i < f.nItems && ni < 20000; i++, o += ITEM_WORDS) {
        const kind = buf[o + 2] & 0xff;
        const km = this.itemMesh(kind);
        if (!km) continue;
        const x = buf[o] / TILE;
        const z = buf[o + 1] / TILE;
        // élévation sur un tapis surélevé ou dans un ascenseur (1/256 de niveau)
        const elev = ((buf[o + 2] >> 8) / 256) * FLOOR_H;
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
      let arc = 1.2;
      if (w?.proj === 1 || special === 1) arc = Math.min(60, dist * 0.35); // obus, missile stratégique
      else if (w?.proj === 2) arc = Math.min(8, dist * 0.15);
      else if (w?.proj === 3) arc = 0;
      const gy0 = groundHeight(this.map, x0, z0);
      const gy1 = groundHeight(this.map, x1, z1);
      let y = gy0 + (gy1 - gy0) * tt + 1 + Math.sin(Math.PI * tt) * arc;
      if (w?.proj === 3) y = gy1 + 12 * (1 - tt) + 0.5; // bombe : tombe
      if (special === 2) y = gy1 + 60 * (1 - tt);
      const dx = x1 - x0;
      const dz = z1 - z0;
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmpV.set(dx, special === 2 ? -50 : 0, dz).normalize());
      const big = special === 1 ? 3 : special === 2 ? 2 : w && w.aoe > 600 ? 1.8 : 1;
      const pk = w?.proj ?? 0;
      if (special === 0 && (pk === 0 || pk === 1) && nk < 6000) {
        // cinétique : balle (laiton) ou obus (acier sombre), et un traceur discret derrière la balle
        const shell = pk === 1;
        const k = shell ? 0.16 * big : 0.06 * big;
        tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(k, k, shell ? 0.3 * big : 0.22 * big));
        this.slugs.setMatrixAt(nk, tmpM);
        this.slugs.setColorAt(nk, shell ? tmpC.setHex(0x4a5058) : tmpC.setHex(0xd8a850));
        nk++;
        if (!shell) {
          tmpM.compose(tmpV.set(x - (dx / (dist || 1)) * 0.35, y, z - (dz / (dist || 1)) * 0.35), tmpQ, tmpS.set(0.3 * big, 0.3 * big, 1.3 * big));
          this.proj.setMatrixAt(np, tmpM);
          this.proj.setColorAt(np, tmpC.setHex(0xffb060).multiplyScalar(0.9));
          np++;
        }
      } else {
        // énergie : trait lumineux (les traits « blaster » sont plus longs et plus fins)
        const blaster = pk === 9;
        // canon de rail : trait très long et fin
        const rail = pk === 11;
        tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(big * (blaster ? 0.7 : rail ? 0.5 : 1), big * (blaster ? 0.7 : rail ? 0.5 : 1), big * (blaster ? 2.6 : rail ? 6 : 1)));
        this.proj.setMatrixAt(np, tmpM);
        this.proj.setColorAt(np, tmpC.setHex(special ? 0xffe070 : PROJ_COLORS[pk] ?? 0xffffff).multiplyScalar(pk === 3 ? 0.6 : blaster ? 3.2 : 2.6));
        np++;
      }
      const elapsed = buf[o + 4] & 0xffff;
      if (elapsed >= 1 && elapsed <= tickDelta && special === 0 && pk !== 3 && pk !== 4) fx.muzzle(x0, gy0 + 1, z0, pk, big);
      if (special || pk === 1 || pk === 2 || pk === 4 || pk === 11) fx.trail(x, y, z, pk, dt, big);
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
      this.hatchClosed.count = this.hatchFrame.count = this.hatchHole.count = 0;
      this.hatchFor = null;
      return;
    }
    if (f === this.hatchFor) return;
    this.hatchFor = f;
    const buf = f.buf;
    const W = this.map.w;
    const DX = [1, 0, -1, 0];
    const DZ = [0, 1, 0, -1];
    // tapis et bras : case -> direction (bras : 4 * portée + direction)
    const links = new Map<number, number>();
    let o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const bd = this.data.buildings[buf[o + 1] & 0xff];
      if (bd.cls !== BClass.Belt && bd.cls !== BClass.Inserter) continue;
      // un tapis surélevé ne touche pas les bâtiments
      if ((buf[o + 1] >>> 28) & 3) continue;
      const dir = (buf[o + 1] >> 16) & 3;
      links.set(((buf[o + 2] >>> 16) & 0xffff) * W + (buf[o + 2] & 0xffff), (bd.cls === BClass.Inserter ? 4 * Math.max(1, bd.reach ?? 1) : 0) + dir);
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
    const inCol = new THREE.Color(0.5, 2.2, 2.6);
    const outCol = new THREE.Color(2.8, 1.7, 0.35);
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let nc = 0;
    let no = 0;
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const kind = buf[o + 1] & 0xff;
      const def = this.data.buildings[kind];
      if (!RECEIVERS.has(def.cls) || buf[o + 4] < 65536) continue;
      const owner = (buf[o + 1] >> 8) & 0xff;
      if (!spectator && (f.players[owner]?.team ?? owner) !== myTeam) continue;
      const dir = (buf[o + 1] >> 16) & 3;
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      const w = dir & 1 ? def.h : def.w;
      const h = dir & 1 ? def.w : def.h;
      const inside = (x: number, z: number) => x >= bx && x < bx + w && z >= bz && z < bz + h;
      // face du modèle, depuis le centre de la case de bord (le modèle laisse une marge sur l'emprise)
      const face = 0.52 - (def.w * (1 - BUILDING_FILL)) / 2;
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
          } else if (code !== undefined) {
            const d = code & 3;
            const r = code >> 2;
            if (inside(ox + r * DX[d], oz + r * DZ[d])) state = 1;
            else if (inside(ox - r * DX[d], oz - r * DZ[d])) state = 2;
          }
          // transfert direct avec un bâtiment collé
          if (state === 0) {
            const nb = cells.get(oz * W + ox);
            if (nb !== undefined && nb !== o) {
              if (takes(nb, o, gives(nb))) state = 1;
              else if (takes(o, nb, gives(o))) state = 2;
            }
          }
          // bras long posé à 2 cases de la face (par-dessus la case voisine)
          if (state === 0) {
            const lx = ox + DX[side];
            const lz = oz + DZ[side];
            const lc = links.get(lz * W + lx);
            if (lc !== undefined && lc >> 2 === 2) {
              const d = lc & 3;
              if (inside(lx + 2 * DX[d], lz + 2 * DZ[d])) state = 1;
              else if (inside(lx - 2 * DX[d], lz - 2 * DZ[d])) state = 2;
            }
          }
          const px = ex + 0.5 + DX[side] * face;
          const pz = ez + 0.5 + DZ[side] * face;
          const y = groundHeight(this.map, px, pz) + 0.3;
          q.setFromAxisAngle(UP, [Math.PI / 2, 0, -Math.PI / 2, Math.PI][side]);
          if (state === 0) {
            if (nc >= 6000) continue;
            tmpM.compose(tmpV.set(px, y, pz), q, one);
            this.hatchClosed.setMatrixAt(nc++, tmpM);
          } else {
            if (no >= 6000) continue;
            tmpM.compose(tmpV.set(px, y, pz), q, one);
            this.hatchFrame.setMatrixAt(no, tmpM);
            this.hatchFrame.setColorAt(no, state === 1 ? inCol : outCol);
            tmpM.compose(tmpV.set(px + DX[side] * 0.012, y, pz + DZ[side] * 0.012), q, one);
            this.hatchHole.setMatrixAt(no, tmpM);
            no++;
          }
        }
      }
    }
    this.hatchClosed.count = nc;
    this.hatchFrame.count = no;
    this.hatchHole.count = no;
    for (const m of [this.hatchClosed, this.hatchFrame, this.hatchHole]) m.instanceMatrix.needsUpdate = true;
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
        // dépôt amélioré : objets filtrés sur le toit
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
      const top = groundHeight(this.map, cx, cz) + this.roofHeight(kind, cls === BClass.Depot ? (buf[o + 5] >>> 24) & 3 : 0) + 0.05;
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

const PROJ_COLORS: Record<number, number> = { 0: 0xffd27a, 1: 0xffb050, 2: 0xff7050, 3: 0x404040, 4: 0x9fd0ff, 5: 0x7fffff, 6: 0x7dfcff, 7: 0x9db7ff, 8: 0xff5050, 9: 0xff2a2a, 10: 0xff9030, 11: 0xc8ecff };
