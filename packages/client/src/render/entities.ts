// Rendu des entités : un InstancedMesh par type d'unité, de bâtiment et d'objet sur tapis ;
// chaque pièce mobile (tourelle) est un mesh instancié séparé. Interpolation entre les deux derniers ticks.
// Les effets (feu, fumée, débris) sont dans effects.ts.
//
// Ce fichier garde la classe `Entities` : ses champs, la création des maillages (leur ordre de création
// fixe l'ordre de rendu) et `update`, qui prépare l'image puis enchaîne les passes de dessin. Le dessin
// est dans entities/, un module par thème, des fonctions qui reçoivent l'objet en premier paramètre :
//   common.ts       constantes, objets temporaires et état d'une image (`FrameCtx`) partagés
//   kindMesh.ts     modèle d'une sorte d'entité et ses maillages instanciés
//   units.ts        unités, fantômes, coques des œufs
//   buildings.ts    bâtiments, tapis, murs, racines, porte, anneaux, et les repères placés avec eux
//   cargo.ts        trains et drones de fret, objets sur les tapis, plateaux des ascenseurs
//   projectiles.ts  projectiles et rayons prolongés
//   wrecks.ts       épaves
//   energyFx.ts     bulles des boucliers, matière de l'horizon d'une porte
//   markers.ts      barres de chantier, atlas des diagnostics, vue logistique, icônes sur les toits
//   hatches.ts      trappes ouvertes et conduites des machines jumelles
import * as THREE from "three/webgpu";
import type { GameData, Frame, ModView } from "@supreme/shared";
import { frameMods, BClass, Layer, NATURE_COLOR, NATURE_TEAM, RACE_TRANSH } from "@supreme/shared";
import { texture as tslTexture, uv, vec2, instancedBufferAttribute, normalView } from "three/tsl";
import { buildingScale, buildModel, fallbackModel, PLAYER_COLORS, withHatches } from "../models/generator.ts";
import { FLOOR_H } from "./liftAnim.ts";
import { TEX_PER_TILE_UNIT, TEX_PER_TILE_BUILDING } from "./materials.ts";
import { UNIT_MODELS } from "../../../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { VEHICLE_MODELS } from "../../../../assets/models/vehicles.ts";
import { groundHeight, HSCALE, type MapData } from "./terrain.ts";
import { Effects } from "./effects.ts";
import { TILE, tmpQ, type FrameCtx } from "./entities/common.ts";
import { KindMesh, type Built } from "./entities/kindMesh.ts";
import { drawUnits, drawGhosts, drawHusks } from "./entities/units.ts";
import { drawBuildings } from "./entities/buildings.ts";
import { drawCarriers, drawItems, type Lift } from "./entities/cargo.ts";
import { drawProjectiles } from "./entities/projectiles.ts";
import { drawWrecks } from "./entities/wrecks.ts";
import { drawShields, shieldMaterial, vortexMaterial } from "./entities/energyFx.ts";
import { diagAtlas, DIAG_ICONS, SITE_BARS_MAX, updateLogistics, updateLogos } from "./entities/markers.ts";
import { RECEIVERS, updateHatches } from "./entities/hatches.ts";

export { FLOOR_H };

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
  /** Souche : pan de ronce entre deux ronces voisines du même camp */
  brambleSeg: KindMesh | null = null;
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
  liftAt = new Map<number, number>();
  lifts: Lift[] = [];
  nLifts = 0;
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
  beamFrom = new Map<number, { h: number; fwd: number; air: boolean; big: number }>();
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
  vortex!: THREE.InstancedMesh;
  kawoosh!: THREE.InstancedMesh;
  /** anneaux de transport : anneaux qui montent, colonne de lumière */
  ringStack!: THREE.InstancedMesh;
  ringBeam!: THREE.InstancedMesh;
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
  wreckMeshes = new Map<number, { mesh: THREE.InstancedMesh; scale: number; height: number }>();
  wreckMat: THREE.MeshStandardNodeMaterial | null = null;
  rings: THREE.InstancedMesh;
  bars: THREE.InstancedMesh;
  /** barres de progression des chantiers et des améliorations (fond, part faite, part perdue) */
  siteBars: THREE.InstancedMesh;
  /** taille d'une case du monde en pixels à l'écran, inversée (fixée par la scène à chaque image) */
  pxWorld = 0.02;
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
  hatches: { x: number; z: number; t0: number }[] = [];
  /** coques vides des œufs éclos : elles se fanent puis rentrent dans le sol (voir eggAnim.ts) */
  husks: { kind: number; owner: number; x: number; z: number; facing: number; t0: number }[] = [];
  /** unités qui viennent de disparaître (porte, anneaux, téléportation) : elles s'effacent sur place */
  ghosts: { kind: number; col: THREE.Color; x: number; y: number; z: number; facing: number; t0: number; fwd: number }[] = [];
  animFrame = 0;
  /** améliorations des Transhumants : clé → indice */
  private modIds: Map<string, number>;
  /** améliorations qui déploient et replient deux fois plus vite */
  quickKeys: string[];
  private modFor: Frame | null = null;
  modViews = new Map<number, ModView>();
  /** nids qu'une Reine apprivoise : avancement affiché (lissé) */
  taming = new Map<number, { k: number; at: number }>();
  /** trappes ouvertes des bâtiments qui reçoivent des objets (entrée cyan, sortie ambre) ; les fermées sont dans leur modèle */
  hatchFrame: THREE.InstancedMesh;
  hatchHole: THREE.InstancedMesh;
  hatchFor: Frame | null = null;
  /** gisement (indice dans map.spots) d'après sa case d'origine, et gisements recouverts par un bâtiment à cette image */
  spotAt = new Map<number, number>();
  coveredSpots = new Set<number>();
  /** bâtiments sans trappe dans leur modèle (aucune paroi) : tables vides, par largeur */
  noHatches: Float32Array[] = [];
  /** conduites entre machines jumelles (ingrédients et produits partagés) : gaine et liseré lumineux */
  twinPipe: THREE.InstancedMesh;
  twinGlow: THREE.InstancedMesh;
  /** icônes de production sur les toits : un maillage instancié par icône, et les pastilles de fond */
  logoMeshes = new Map<string, THREE.InstancedMesh>();
  logoDiscs: THREE.InstancedMesh;
  logoFor: Frame | null = null;
  logoYaw = 0;
  /** hauteur du toit au centre de chaque type de bâtiment (à l'échelle), calculée à la demande */
  roofCache = new Map<number, number>();
  playerColor: number[] = [];

  constructor(
    public data: GameData,
    public map: MapData,
  ) {
    map.spots.forEach((sp, i) => this.spotAt.set(sp.y * map.w + sp.x, i));
    this.modIds = new Map((data.mods ?? []).map((m, i) => [m.key, i]));
    this.quickKeys = (data.mods ?? []).filter((m) => m.quick).map((m) => m.key);
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
      } else {
        // module des Transhumants : même grain que son chenillard, qui devient lui (et inversement)
        const tex = b.race === RACE_TRANSH ? TEX_PER_TILE_UNIT : TEX_PER_TILE_BUILDING;
        this.buildingMeshes.push(new KindMesh(this.group, () => hatched(buildModel(BUILDING_MODELS[b.key] ?? fallbackModel(b.w > 1 ? 1.2 : 0.4))), bScale(b), tex));
      }
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
      if (b.key === "wall" && !this.wallSeg && BUILDING_MODELS.wall_seg) this.wallSeg = new KindMesh(this.group, () => buildModel(BUILDING_MODELS.wall_seg), () => km.scale, TEX_PER_TILE_BUILDING);
      if (b.key === "bramble" && !this.brambleSeg && BUILDING_MODELS.bramble_seg) this.brambleSeg = new KindMesh(this.group, () => buildModel(BUILDING_MODELS.bramble_seg), () => km.scale, TEX_PER_TILE_BUILDING);
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
    // icônes de diagnostic : atlas dessiné à la volée (DIAG_ICONS icônes de 64 px), panneaux tournés vers la caméra
    this.diagIcon = new THREE.InstancedBufferAttribute(new Float32Array(2000), 1);
    this.diagIcon.setUsage(THREE.DynamicDrawUsage);
    const dmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
    const atlas = tslTexture(diagAtlas());
    const icon = instancedBufferAttribute(this.diagIcon, "float");
    const t = atlas.sample(vec2(uv().x.add(icon).div(DIAG_ICONS), uv().y));
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
    this.siteBars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), basic({ depthTest: false }), SITE_BARS_MAX);
    this.siteBars.renderOrder = 6;
    this.siteBars.count = 0;
    this.siteBars.frustumCulled = false;
    this.siteBars.setColorAt(0, new THREE.Color());
    this.group.add(this.siteBars);
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

  /** Une unité qui apparaît là (cocon ouvert) grandit comme si elle sortait d'un œuf. */
  addBirth(x: number, z: number, tick: number): void {
    this.hatches.push({ x, z, t0: tick / 20 });
  }

  /** Rayon de l'unité `ref` (1/256 de case) : celui de son type, sauf l'Arche, qui s'allonge d'un tronçon par
   * emplacement équipé d'armement, de coque ou de mobilité (ameliorations::ark_radius). */
  unitRadius(kind: number, ref: number): number {
    const def = this.data.units[kind];
    if (def.key !== "ark") return def.radius;
    const m = this.modViews.get(ref)?.mods;
    return m ? (this.data.arkRadii?.[+(m[0] > 0) + +(m[1] > 0) + +(m[3] > 0)] ?? def.radius) : def.radius;
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
        // léviathan : il nage le ventre sous la surface, et se hisse sur la rive
        if (u.key === "leviathan") return Math.max(g, water - 0.55);
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
    if (this.brambleSeg) all.push(this.brambleSeg);
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
    const all: (KindMesh | null)[] = [...this.unitMeshes, ...this.buildingMeshes, this.wallSeg, this.rootSeg, this.brambleSeg, this.chute, this.liftMast, this.liftTray, ...this.beltQuays.values()];
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
    // améliorations des Transhumants : pièces dessinées selon ce qui est installé
    if (this.modFor !== f) {
      this.modFor = f;
      this.modViews = frameMods(f);
    }
    const mods = this.modViews;
    const modOf = (ref: number) => {
      const m = mods.get(ref)?.mods;
      return (key: string) => !!m && m.includes(this.modIds.get(key) ?? -1);
    };
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
    this.brambleSeg?.begin();
    this.chute?.begin();
    this.liftMast?.begin();
    this.liftTray?.begin();
    for (const m of this.beltQuays.values()) m.begin();
    this.liftAt.clear();
    this.nLifts = 0;
    for (const m of this.vehicleMeshes) m.begin();
    this.frameN++;
    const now = performance.now();
    // temps de la simulation à l'image affichée (s) : il rythme les œufs, leurs coques vides et les naissances
    const simT = (f.tick - 1 + alpha) / 20;
    const camQ = this.camera?.quaternion ?? tmpQ.identity();
    for (const ic of this.icons) ic.count = 0;
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
    // les passes de dessin, dans l'ordre (voir entities/) : chacune reprend les compteurs d'instances là où
    // la précédente les a laissés
    const ctx: FrameCtx = {
      f, buf, alpha, me, myTeam, selected, strategic, iconScale, dt, spectator, viewRect,
      seen, teamOf, modOf, cslot, now, simT, camQ, vx0, vz0, vx1, vz1, fx, tickDelta,
      nd: 0, nr: 0, rings: 0, bars: 0, siteBars: 0, npip: 0, nsup: 0, nlift: 0,
      nvortex: 0, nkawoosh: 0, nring: 0, nbeam: 0,
      // portes ouvertes : celles de l'image précédente, que la passe des bâtiments remplace par celles de cette image
      gates: this.openGates,
    };
    drawUnits(this, ctx);
    drawGhosts(this, ctx);
    drawHusks(this, ctx);
    drawBuildings(this, ctx);
    const { nd, nr, rings, bars, siteBars, npip, nsup, nlift, nvortex, nkawoosh, nring, nbeam, gates } = ctx;
    this.diag.count = nd;
    this.ranks.count = nr;
    this.ranks.instanceMatrix.needsUpdate = true;
    this.diag.instanceMatrix.needsUpdate = true;
    this.diagIcon.needsUpdate = true;
    if (this.frameN % 120 === 0) for (const [k, st] of this.diagSince) if (this.frameN - st.seen > 120) this.diagSince.delete(k);
    drawCarriers(this, ctx);
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
    this.brambleSeg?.end();
    this.chute?.end();
    this.liftMast?.end();
    for (const m of this.beltQuays.values()) m.end();
    this.levelPips.count = npip;
    this.levelPips.instanceMatrix.needsUpdate = true;
    this.supports.count = nsup;
    this.supports.instanceMatrix.needsUpdate = true;
    updateLogistics(this, f, strategic, myTeam, spectator);
    this.liftGlow.count = nlift;
    this.liftGlow.instanceMatrix.needsUpdate = true;
    updateHatches(this, f, strategic, myTeam, spectator);
    updateLogos(this, f, strategic, myTeam, spectator);
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
    // barres des chantiers : n'envoyer à la carte graphique que les instances utilisées
    if (siteBars || this.siteBars.count) {
      this.siteBars.count = siteBars;
      const m = this.siteBars.instanceMatrix;
      m.clearUpdateRanges();
      m.addUpdateRange(0, Math.max(1, siteBars) * 16);
      m.needsUpdate = true;
      const c = this.siteBars.instanceColor;
      if (c) {
        c.clearUpdateRanges();
        c.addUpdateRange(0, Math.max(1, siteBars) * 3);
        c.needsUpdate = true;
      }
    }
    drawItems(this, ctx);
    drawProjectiles(this, ctx);
    drawWrecks(this, ctx);
    // ----- porte, anneaux -----
    this.openGates = gates;
    for (const [m, n] of [[this.vortex, nvortex], [this.kawoosh, nkawoosh], [this.ringStack, nring], [this.ringBeam, nbeam]] as const) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    drawShields(this, ctx);
    this.updateFx(dt);
    void me;
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
