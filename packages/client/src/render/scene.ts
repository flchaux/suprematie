// Scène : moteur Three.js (WebGPU, repli automatique WebGL2), caméra inclinable à zoom continu,
// lumières et ombres portées, halo lumineux (bloom), terrain, entités, fantôme de placement, sélection à la souris.
import * as THREE from "three/webgpu";
import { pass, renderOutput, vec3, vec4, float, dot, mix, screenUV, smoothstep, length } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { fogEnabled } from "./fog.ts";
import { loadModelTextures, setTexturesEnabled } from "./textures.ts";
import { DEFAULT_GFX, type GfxSettings } from "./gfx.ts";
import type { GameData, Frame } from "@supreme/shared";
import { BClass } from "@supreme/shared";
import { Terrain, groundHeight, type MapData } from "./terrain.ts";
import { Entities, FLOOR_H } from "./entities.ts";
import { Decorations } from "./decor.ts";
import { buildingScale, buildModel, fallbackModel } from "../models/generator.ts";
import { BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { teamInstancedMesh, setTeamColor } from "./materials.ts";
import { CommandOverlay } from "./overlay.ts";
import { PowerCoverage } from "./power.ts";

const PAD_OK = new THREE.Color(0.2, 0.75, 0.35);
const PAD_BAD = new THREE.Color(1.6, 0.12, 0.1);
/** distance de caméra où les pièces fines des modèles disparaissent (LOD_FAR) et reviennent (LOD_NEAR) */
const LOD_FAR = 95;
const LOD_NEAR = 85;

/** Statistiques du rendu de la dernière image. */
export interface RenderStats {
  drawCalls: number;
  triangles: number;
  particles: number;
  /** décorations du sol affichées */
  decor: number;
  cpuMs: number;
  shadowSize: number;
}

export class GameScene {
  renderer!: THREE.WebGPURenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 6000);
  terrain!: Terrain;
  entities!: Entities;
  decor: Decorations | null = null;
  map!: MapData;
  data!: GameData;
  // caméra : point visé, distance, inclinaison, rotation
  target = new THREE.Vector3(256, 0, 256);
  distance = 60;
  tilt = 0.95; // radians depuis l'horizontale (1.57 = vue de dessus)
  yaw = 0;
  iconDistance = 260;
  /** niveau de détail réduit en cours (caméra lointaine) */
  private lodLo = false;
  backend = "";
  ghost: { mesh: THREE.InstancedMesh; kind: number } | null = null;
  /** couverture électrique (surimpression pendant la pose d'un bâtiment électrique) */
  power: PowerCoverage | null = null;
  /** constructions prévues et ordres affichés avec Maj */
  overlay: CommandOverlay | null = null;
  showOrders = false;
  ghostMeshes = new Map<number, ReturnType<typeof teamInstancedMesh>>();
  lineGhost: THREE.InstancedMesh | null = null;
  /** pose d'un bras : flèche de la case de prise vers la case de dépôt, et cadres sur ces deux cases */
  armArrows: THREE.InstancedMesh;
  /** aperçu d'une formation orientée (clic droit glissé) : une flèche par place, une grande flèche de direction */
  formArrows: THREE.InstancedMesh;
  armPads: THREE.InstancedMesh;
  markers: THREE.InstancedMesh;
  markerList: { x: number; z: number; age: number; color: THREE.Color }[] = [];
  rangeRing: THREE.Mesh;
  // soleil chaud ; l'ambiance (ciel et environnement réfléchi) est froide : ombres bleutées
  sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  /** direction vers le soleil (normalisée) */
  sunDir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
  post: THREE.RenderPipeline | null = null;
  bloomPass: ReturnType<typeof bloom> | null = null;
  gfx: GfxSettings = { ...DEFAULT_GFX };
  stats: RenderStats = { drawCalls: 0, triangles: 0, particles: 0, decor: 0, cpuMs: 0, shadowSize: 0 };
  time = 0;

  constructor(public canvasParent: HTMLElement) {
    const marker = new THREE.ConeGeometry(0.4, 1.2, 5).rotateX(Math.PI);
    this.markers = new THREE.InstancedMesh(marker, new THREE.MeshBasicNodeMaterial({ depthTest: false, transparent: true }), 200);
    this.markers.count = 0;
    this.markers.renderOrder = 7;
    this.markers.frustumCulled = false;
    this.markers.setColorAt(0, new THREE.Color());
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0xffd060, transparent: true, opacity: 0.6, depthTest: false }));
    this.rangeRing.visible = false;
    // flèche plate (de x = -1 à x = +1, pointe en +x) et cadre carré d'une case, posés au sol
    const arrow = new THREE.Shape();
    arrow.moveTo(-1.0, -0.09);
    arrow.lineTo(0.5, -0.09);
    arrow.lineTo(0.5, -0.26);
    arrow.lineTo(1.05, 0);
    arrow.lineTo(0.5, 0.26);
    arrow.lineTo(0.5, 0.09);
    arrow.lineTo(-1.0, 0.09);
    const overlay = (opacity: number) => new THREE.MeshBasicNodeMaterial({ transparent: true, opacity, depthTest: false, depthWrite: false });
    this.armArrows = new THREE.InstancedMesh(new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2), overlay(0.9), 512);
    this.armPads = new THREE.InstancedMesh(new THREE.RingGeometry(0.5, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), overlay(0.95), 1024);
    this.formArrows = new THREE.InstancedMesh(new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2), overlay(0.85), 1024);
    for (const m of [this.armArrows, this.armPads, this.formArrows]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 9;
      m.setColorAt(0, new THREE.Color());
    }
    this.rangeRing.renderOrder = 8;
  }

  async init(forceWebGL = false): Promise<void> {
    // anticrénelage en passe finale (FXAA) plutôt que matériel (MSAA) : moins coûteux
    this.renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL });
    // courbe de tons « cinéma » : les hautes lumières (tirs, explosions) gardent du détail au lieu de saturer
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.canvasParent.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    await this.renderer.init();
    this.backend = (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL2";
    this.scene.background = new THREE.Color(0x0b1016);
    // ambiance : environnement réfléchi (métal) et lumière d'appoint froide, faible
    this.scene.environment = environmentTexture();
    this.scene.environmentIntensity = 0.45;
    this.scene.add(new THREE.HemisphereLight(0xc4d6f0, 0x3a3326, 0.8));
    // soleil : l'ombre suit la caméra et couvre seulement la zone vue
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 900;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.add(sun, sun.target);
    this.renderer.info.autoReset = false;
    // textures des modèles : chargées en tâche de fond (couleurs unies en attendant)
    loadModelTextures().catch((e) => console.warn("textures des modèles indisponibles", e));
    this.buildPost();
    this.scene.add(this.markers);
    this.scene.add(this.armArrows, this.armPads);
    this.scene.add(this.formArrows);
    this.scene.add(this.rangeRing);
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  /**
   * Chaîne d'image : scène, halo lumineux facultatif (tirs, explosions), courbe de tons et espace de
   * couleur, étalonnage (contraste, saturation, vignettage léger), puis anticrénelage FXAA.
   */
  private buildPost(): void {
    const make = (withBloom: boolean): THREE.RenderPipeline => {
      const post = new THREE.RenderPipeline(this.renderer);
      post.outputColorTransform = false;
      const scenePass = pass(this.scene, this.camera);
      const color = scenePass.getTextureNode("output");
      let hdr = color;
      if (withBloom) {
        this.bloomPass = bloom(color, 0.5, 0.35, 0.9);
        hdr = color.add(this.bloomPass) as typeof color;
      }
      const ldr = renderOutput(hdr);
      // étalonnage : un peu plus de contraste, couleurs légèrement désaturées (rendu « métal »), coins assombris
      const lum = dot(ldr.rgb, vec3(0.2126, 0.7152, 0.0722));
      const sat = mix(vec3(lum, lum, lum), ldr.rgb, float(0.94));
      const con = sat.sub(0.5).mul(1.08).add(0.5);
      const vig = float(1).sub(smoothstep(0.45, 0.95, length(screenUV.sub(0.5)).mul(1.25)).mul(0.22));
      post.outputNode = fxaa(vec4(con.mul(vig).clamp(0, 1), float(1)));
      return post;
    };
    this.postNoBloom = make(false);
    this.post = make(true);
  }
  /** chaîne d'image sans halo (réglage graphique) */
  postNoBloom: THREE.RenderPipeline | null = null;

  applySettings(g: GfxSettings): void {
    this.gfx = { ...g };
    this.sun.castShadow = g.shadows;
    setTexturesEnabled(g.textures !== false);
    this.renderer.shadowMap.enabled = g.shadows;
    if (this.entities) this.entities.effects.quality = g.effects;
    this.terrain?.setDetail(g.ground !== false);
    if (this.decor) this.decor.enabled = g.decor !== false;
    // changer les ombres impose de recompiler les matériaux
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) m.needsUpdate = true;
    });
  }

  setWorld(map: MapData, data: GameData): void {
    if (this.terrain) this.scene.remove(this.terrain.group);
    if (this.entities) this.scene.remove(this.entities.group);
    if (this.decor) {
      this.scene.remove(this.decor.mesh);
      this.decor.dispose();
    }
    this.map = map;
    this.data = data;
    this.terrain = new Terrain(map);
    this.terrain.setDetail(this.gfx.ground !== false);
    this.scene.add(this.terrain.group);
    this.decor = new Decorations(map, data);
    this.decor.enabled = this.gfx.decor !== false;
    this.scene.add(this.decor.mesh);
    if (this.power) this.power.dispose();
    this.power = new PowerCoverage(map.w, map.h, this.scene);
    if (this.overlay) this.scene.remove(this.overlay.group);
    this.overlay = new CommandOverlay(data, map);
    this.scene.add(this.overlay.group);
    this.entities = new Entities(data, map);
    this.entities.warmUp();
    this.entities.camera = this.camera;
    this.entities.effects.quality = this.gfx.effects;
    this.scene.add(this.entities.group);
    this.camera.far = map.w * 4;
  }

  resize(): void {
    const w = this.canvasParent.clientWidth || innerWidth;
    const h = this.canvasParent.clientHeight || innerHeight;
    this.renderer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clampCamera(): void {
    const m = this.map;
    if (!m) return;
    this.distance = Math.max(8, Math.min(m.w * 1.25, this.distance));
    this.tilt = Math.max(0.55, Math.min(1.5, this.tilt));
    this.target.x = Math.max(0, Math.min(m.w, this.target.x));
    this.target.z = Math.max(0, Math.min(m.h, this.target.z));
    this.target.y = groundHeight(m, this.target.x, this.target.z);
  }

  updateCamera(): void {
    this.clampCamera();
    // plus on s'éloigne, plus la vue se redresse vers le dessus
    const t = Math.min(1, Math.max(0, (this.distance - 40) / 300));
    const tilt = this.tilt + (1.45 - this.tilt) * t;
    const d = this.distance;
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(tilt) * d, Math.sin(tilt) * d, Math.cos(this.yaw) * Math.cos(tilt) * d);
    this.camera.position.copy(this.target).add(off);
    this.camera.lookAt(this.target);
    this.camera.near = Math.max(0.3, d / 200);
    this.camera.updateProjectionMatrix();
  }

  get strategic(): boolean {
    return this.distance > this.iconDistance;
  }

  /** Rectangle (en cases) vu par la caméra, approximé. */
  viewRect(): [number, number, number, number] {
    const pts: THREE.Vector3[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const p = this.pickGround(sx, sy, true);
      if (p) pts.push(p);
    }
    if (pts.length < 2) {
      const r = this.distance;
      return [this.target.x - r, this.target.z - r, this.target.x + r, this.target.z + r];
    }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x);
      z1 = Math.max(z1, p.z);
    }
    return [x0 - 4, z0 - 4, x1 + 4, z1 + 4];
  }

  /** Point du sol sous les coordonnées écran normalisées (-1..1). */
  pickGround(nx: number, ny: number, flat = false): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (d.y >= -1e-4) {
      // regard au-dessus de l'horizon : point lointain
      return flat ? new THREE.Vector3(o.x + d.x * this.distance * 3, 0, o.z + d.z * this.distance * 3) : null;
    }
    // plan à la hauteur moyenne puis affinage sur le relief
    let y = this.target.y;
    let p = new THREE.Vector3();
    for (let i = 0; i < (flat ? 1 : 6); i++) {
      const t = (y - o.y) / d.y;
      p = o.clone().addScaledVector(d, t);
      if (!this.map) break;
      const ny2 = groundHeight(this.map, p.x, p.z);
      if (Math.abs(ny2 - y) < 0.05) break;
      y = ny2;
    }
    if (flat && this.map) {
      p.x = Math.max(-50, Math.min(this.map.w + 50, p.x));
      p.z = Math.max(-50, Math.min(this.map.h + 50, p.z));
    }
    return p;
  }

  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const el = this.renderer.domElement;
    out.x = ((v.x + 1) / 2) * el.clientWidth;
    out.y = ((1 - v.y) / 2) * el.clientHeight;
    return v.z < 1;
  }

  /** Fantôme de placement d'un bâtiment (ou d'une ligne de bâtiments). */
  /** Fantôme de pose ; `shape` (tapis) : 1 et 2 pour les virages (modèles « _virage_g » et « _virage_d »). */
  /** hauteur du fantôme de pose (tapis surélevé : niveau x FLOOR_H), si les cases n'ont pas leur niveau */
  ghostLift = 0;
  /** dalles sous les cases du fantôme : vert pâle si la pose est possible, rouge si la case est occupée */
  ghostPads: THREE.InstancedMesh | null = null;
  private padN = 0;
  setGhost(kind: number, cells: { x: number; y: number; dir: number; ok: boolean; shape?: number; floor?: number }[]): void {
    if (kind < 0) return this.setGhosts([]);
    const groups = [0, 1, 2].map((variant) => ({ kind, variant, cells: cells.filter((c) => (c.shape ?? 0) === variant) }));
    this.setGhosts(groups);
  }

  /**
   * Fantômes de plusieurs types à la fois (plans) : vert si la case est libre, rouge sinon,
   * ou la teinte donnée (aperçu d'une copie). Les types absents de la liste sont cachés.
   */
  setGhosts(groups: { kind: number; variant?: number; cells: { x: number; y: number; dir: number; ok: boolean; floor?: number }[]; tint?: number }[]): void {
    const shown = new Set(groups.filter((g) => g.cells.length).map((g) => g.kind * 4 + (g.variant ?? 0)));
    for (const [k, g] of this.ghostMeshes) g.mesh.visible = shown.has(k);
    if (!this.ghostPads) {
      this.ghostPads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }), 4096);
      this.ghostPads.frustumCulled = false;
      this.ghostPads.renderOrder = 8;
      this.ghostPads.setColorAt(0, new THREE.Color());
      this.scene.add(this.ghostPads);
    }
    this.padN = 0;
    for (const { kind, cells, tint, variant } of groups) if (kind >= 0 && cells.length) this.fillGhost(kind, cells, tint, variant ?? 0);
    this.ghostPads.count = this.padN;
    this.ghostPads.instanceMatrix.needsUpdate = true;
    if (this.ghostPads.instanceColor) this.ghostPads.instanceColor.needsUpdate = true;
    this.fillArmArrows(groups);
  }

  /**
   * Sens des bras à poser : un bras prend sur la case derrière lui et pose sur la case devant
   * (voir sim : front_tile). Flèche cyan de l'une à l'autre, cadre ambre sur la prise, cyan sur le dépôt.
   */
  private fillArmArrows(groups: { kind: number; cells: { x: number; y: number; dir: number; ok: boolean }[] }[]): void {
    const DX = [1, 0, -1, 0];
    const DZ = [0, 1, 0, -1];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const take = new THREE.Color(1.6, 1.0, 0.25);
    const drop = new THREE.Color(0.35, 1.6, 1.8);
    const blocked = new THREE.Color(1.4, 0.3, 0.3);
    let na = 0;
    let np = 0;
    for (const { kind, cells } of groups) {
      if (kind < 0 || this.data.buildings[kind]?.cls !== BClass.Inserter) continue;
      const reach = Math.max(1, this.data.buildings[kind].reach ?? 1);
      for (const c of cells.slice(0, 512)) {
        const d = c.dir & 3;
        const cx = c.x + 0.5;
        const cz = c.y + 0.5;
        const y = groundHeight(this.map, cx, cz) + 0.45;
        q.setFromAxisAngle(up, (-d * Math.PI) / 2);
        m.compose(new THREE.Vector3(cx, y, cz), q, one);
        this.armArrows.setMatrixAt(na, m);
        this.armArrows.setColorAt(na, c.ok ? drop : blocked);
        na++;
        for (const [k, col] of [[-reach, take], [reach, drop]] as [number, THREE.Color][]) {
          m.compose(new THREE.Vector3(cx + DX[d] * k, groundHeight(this.map, cx, cz) + 0.08, cz + DZ[d] * k), new THREE.Quaternion(), one);
          this.armPads.setMatrixAt(np, m);
          this.armPads.setColorAt(np, col);
          np++;
        }
      }
    }
    this.armArrows.count = na;
    this.armPads.count = np;
    for (const mesh of [this.armArrows, this.armPads]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private fillGhost(kind: number, cells: { x: number; y: number; dir: number; ok: boolean; floor?: number }[], tint?: number, variant = 0): void {
    const key = kind * 4 + variant;
    let g = this.ghostMeshes.get(key);
    if (!g || g.mesh.count === undefined) {
      const def = this.data.buildings[kind];
      // variantes : virages des tapis, sorties du répartiteur (modèles de niveau _n2 / _n3)
      const vkey = variant === 0 ? def.key : (BUILDING_MODELS[def.key + (variant === 1 ? "_virage_g" : "_virage_d")] ? def.key + (variant === 1 ? "_virage_g" : "_virage_d") : def.key + (variant === 1 ? "_n2" : "_n3"));
      const built = buildModel(BUILDING_MODELS[vkey] ?? BUILDING_MODELS[def.key] ?? fallbackModel());
      g = teamInstancedMesh(built.body, 512);
      g.mesh.castShadow = false;
      const mat = g.mesh.material as THREE.MeshStandardNodeMaterial;
      mat.transparent = true;
      mat.opacity = 0.55;
      mat.depthWrite = false;
      const size = new THREE.Vector3();
      built.box.getSize(size);
      g.mesh.userData.scale = buildingScale(def.w, size.x, size.z, def.reach);
      this.scene.add(g.mesh);
      this.ghostMeshes.set(key, g);
    }
    const def = this.data.buildings[kind];
    const s = g.mesh.userData.scale as number;
    const m = new THREE.Matrix4();
    const good = tint !== undefined ? new THREE.Color(tint) : new THREE.Color(0.4, 1, 0.5);
    const bad = tint !== undefined ? good : new THREE.Color(1, 0.3, 0.3);
    let n = 0;
    for (const c of cells.slice(0, 512)) {
      // empreinte tournée d'un quart de tour : largeur et hauteur échangées
      const cx = c.x + (c.dir & 1 ? def.h : def.w) / 2;
      const cz = c.y + (c.dir & 1 ? def.w : def.h) / 2;
      const y = def.water ? this.map.waterLevel * 0.08 : groundHeight(this.map, cx, cz);
      const lift = c.floor !== undefined ? c.floor * FLOOR_H : this.ghostLift;
      // dalle de l'emprise : rouge vif si la case est occupée (aperçu d'une copie teintée : seulement le rouge)
      const pads = this.ghostPads;
      if (pads && this.padN < 4096 && (tint === undefined || !c.ok)) {
        const fw = c.dir & 1 ? def.h : def.w;
        const fh = c.dir & 1 ? def.w : def.h;
        m.compose(new THREE.Vector3(cx, y + 0.04 + lift, cz), new THREE.Quaternion(), new THREE.Vector3(fw * 0.96, 1, fh * 0.96));
        pads.setMatrixAt(this.padN, m);
        pads.setColorAt(this.padN, c.ok ? PAD_OK : PAD_BAD);
        this.padN++;
      }
      m.compose(new THREE.Vector3(cx, y + 0.05 + lift, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - (c.dir * Math.PI) / 2), new THREE.Vector3(s, s, s));
      g.mesh.setMatrixAt(n, m);
      setTeamColor(g, n, c.ok ? good : bad);
      n++;
    }
    g.mesh.count = n;
    g.mesh.visible = true;
    g.mesh.instanceMatrix.needsUpdate = true;
    g.team.needsUpdate = true;
  }

  private area: THREE.Group | null = null;
  /** Zone au sol (cases [x0, x1] × [y0, y1], bornes comprises) : voile et contour qui suivent le relief ; null la cache. */
  setArea(r: { x0: number; y0: number; x1: number; y1: number; color?: number; fill?: number } | null): void {
    if (this.area) {
      this.scene.remove(this.area);
      this.area.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.area = null;
    }
    if (!r || !this.map) return;
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1) + 1;
    const z0 = Math.min(r.y0, r.y1), z1 = Math.max(r.y0, r.y1) + 1;
    const h = (x: number, z: number) => Math.max(groundHeight(this.map, x, z), this.map.waterLevel * 0.08) + 0.12;
    // voile : une grille d'une case (96 × 96 au plus) qui épouse le relief
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.min(96, x1 - x0), Math.min(96, z1 - z0)).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (x0 + x1) / 2;
      const z = pos.getZ(i) + (z0 + z1) / 2;
      pos.setXYZ(i, x, h(x, z), z);
    }
    const color = r.color ?? 0x3ef0ff;
    // voile sous les fantômes (test de profondeur), contour toujours visible
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicNodeMaterial({ color, transparent: true, opacity: r.fill ?? 0.14, depthWrite: false }));
    // contour : un point par demi-case
    const pts: THREE.Vector3[] = [];
    const edge = (ax: number, az: number, bx: number, bz: number) => {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) * 2));
      for (let i = 0; i < n; i++) {
        const x = ax + ((bx - ax) * i) / n;
        const z = az + ((bz - az) * i) / n;
        pts.push(new THREE.Vector3(x, h(x, z) + 0.05, z));
      }
    };
    edge(x0, z0, x1, z0);
    edge(x1, z0, x1, z1);
    edge(x1, z1, x0, z1);
    edge(x0, z1, x0, z0);
    pts.push(pts[0].clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicNodeMaterial({ color, depthTest: false, transparent: true }));
    fill.renderOrder = 8;
    line.renderOrder = 9;
    this.area = new THREE.Group();
    this.area.add(fill, line);
    this.scene.add(this.area);
  }

  hideGhost(): void {
    for (const g of this.ghostMeshes.values()) g.mesh.visible = false;
    this.armArrows.count = 0;
    this.armPads.count = 0;
  }

  addMarker(x: number, z: number, color: number): void {
    this.markerList.push({ x, z, age: 0, color: new THREE.Color(color) });
    if (this.markerList.length > 150) this.markerList.shift();
  }

  /**
   * Aperçu d'une formation orientée : une flèche par place (cases du monde) tournée vers `angle`
   * (radians, atan2(dz, dx)), et une grande flèche du point visé vers le curseur. null : masqué.
   */
  setFormation(slots: { x: number; z: number; size: number }[] | null, angle = 0, from?: { x: number; z: number }, len = 0): void {
    const m = this.formArrows;
    if (!slots) {
      m.count = 0;
      return;
    }
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    const mat = new THREE.Matrix4();
    const col = new THREE.Color(0x7dff9a);
    let n = 0;
    for (const p of slots) {
      if (n >= 1023) break;
      const s = Math.max(0.45, p.size);
      mat.compose(new THREE.Vector3(p.x, groundHeight(this.map, p.x, p.z) + 0.15, p.z), q, new THREE.Vector3(s, 1, s));
      m.setMatrixAt(n, mat);
      m.setColorAt(n, col);
      n++;
    }
    if (from && len > 0.5) {
      // grande flèche : du centre de la formation dans la direction choisie (la flèche va de -1 à +1)
      const half = len / 2;
      const cx = from.x + Math.cos(angle) * half;
      const cz = from.z + Math.sin(angle) * half;
      mat.compose(new THREE.Vector3(cx, groundHeight(this.map, cx, cz) + 0.2, cz), q, new THREE.Vector3(half, 1, Math.max(1, half * 0.5)));
      m.setMatrixAt(n, mat);
      m.setColorAt(n, new THREE.Color(0xffd060));
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  showRange(x: number, z: number, r: number): void {
    this.rangeRing.visible = r > 0;
    this.rangeRing.position.set(x, groundHeight(this.map, x, z) + 0.3, z);
    this.rangeRing.scale.set(r, 1, r);
  }

  /** Place la caméra d'ombre sur la zone vue, alignée sur ses texels pour éviter le scintillement. */
  private updateShadow(): void {
    const sun = this.sun;
    if (!this.gfx.shadows) return;
    const half = Math.max(24, Math.min(170, this.distance * 1.1));
    const cam = sun.shadow.camera as THREE.OrthographicCamera;
    if (cam.right !== half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
    // centre un peu en avant de la cible : la caméra voit plus loin vers le haut de l'écran
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).multiplyScalar(half * 0.25);
    const c = this.target.clone().add(fwd);
    // alignement sur la grille des texels, dans le repère de la lumière
    const texel = (half * 2) / sun.shadow.mapSize.x;
    const right = new THREE.Vector3().crossVectors(this.sunDir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, this.sunDir).normalize();
    const pr = Math.round(c.dot(right) / texel) * texel - c.dot(right);
    const pu = Math.round(c.dot(up) / texel) * texel - c.dot(up);
    c.addScaledVector(right, pr).addScaledVector(up, pu);
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(this.sunDir, 400);
    sun.target.updateMatrixWorld();
    this.stats.shadowSize = half * 2;
  }

  render(frame: Frame | null, alpha: number, me: number, myTeam: number, selected: Set<number>, dt: number, spectator: boolean, fog = true): void {
    const t0 = performance.now();
    this.time += dt;
    this.updateCamera();
    this.updateShadow();
    // pas de brouillard pour un spectateur, ni dans une partie lancée sans brouillard de guerre
    fogEnabled.value = spectator || !fog ? 0 : 1;
    this.terrain?.tick(dt, this.time);
    const view = this.viewRect();
    if (frame && this.entities) {
      // niveau de détail : pièces fines retirées au-delà de LOD_FAR, rétablies en deçà de LOD_NEAR (pas de battement)
      if (this.distance > LOD_FAR) this.lodLo = true;
      else if (this.distance < LOD_NEAR) this.lodLo = false;
      this.entities.setDetail(this.lodLo);
      const iconScale = Math.max(1, this.distance / 160);
      this.entities.update(frame, alpha, me, myTeam, selected, this.strategic, iconScale, dt, spectator, view);
    }
    this.decor?.update(frame, this.camera, this.distance, this.strategic, view, this.target, this.time);
    // repères de clic
    const m = new THREE.Matrix4();
    this.markerList = this.markerList.filter((k) => (k.age += dt) < 0.8);
    let n = 0;
    for (const k of this.markerList) {
      const s = Math.max(1, this.distance / 60) * (1 - k.age * 0.6);
      m.compose(new THREE.Vector3(k.x, groundHeight(this.map, k.x, k.z) + 0.6 + k.age * 2, k.z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      this.markers.setMatrixAt(n, m);
      this.markers.setColorAt(n, k.color);
      n++;
    }
    this.markers.count = n;
    this.markers.instanceMatrix.needsUpdate = true;
    if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
    if (this.overlay && this.entities) {
      let idx: Map<number, { x: number; y: number; z: number }> | null = null;
      this.overlay.update(this.showOrders, (id) => {
        if (!idx) idx = new Map(this.entities.screen.map((u) => [u.id, u]));
        return idx.get(id);
      });
    }
    this.renderer.info.reset();
    const post = this.gfx.bloom ? this.post : this.postNoBloom;
    if (post) post.render();
    else this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render as unknown as { drawCalls?: number; calls?: number; triangles: number };
    this.stats.drawCalls = info.drawCalls ?? info.calls ?? 0;
    this.stats.triangles = info.triangles;
    this.stats.particles = this.entities?.effects.count ?? 0;
    this.stats.decor = this.decor?.count ?? 0;
    this.stats.cpuMs = performance.now() - t0;
  }
}

/**
 * Environnement réfléchi par les matériaux (équirectangulaire, généré une fois) : ciel bleu, horizon
 * clair et chaud, crêtes sombres irrégulières sur l'horizon, sol brun. Le contraste ciel / crêtes donne
 * aux surfaces métalliques des reflets nets, sans aucune géométrie supplémentaire.
 */
function environmentTexture(): THREE.DataTexture {
  const W = 256;
  const H = 128;
  // demi-flottants : toujours filtrables en WebGPU (les flottants 32 bits ne le sont pas partout)
  const data = new Uint16Array(W * H * 4);
  const sky = [0.32, 0.46, 0.72];
  const zenith = [0.16, 0.26, 0.5];
  const horizon = [0.82, 0.78, 0.72];
  const ground = [0.16, 0.14, 0.11];
  const ridge = [0.1, 0.11, 0.13];
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
  for (let y = 0; y < H; y++) {
    // v : 0 en haut (zénith), 0,5 à l'horizon, 1 en bas
    const v = (y + 0.5) / H;
    const el = (0.5 - v) * Math.PI; // élévation
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let c: number[];
      if (el > 0) {
        const t = Math.pow(1 - el / (Math.PI / 2), 3);
        c = lerp(lerp(zenith, sky, Math.min(1, (1 - el / (Math.PI / 2)) * 1.6)), horizon, t);
        // crêtes : silhouette sombre et irrégulière juste au-dessus de l'horizon
        const crest = 0.05 + 0.05 * Math.abs(Math.sin(u * 23.0) * Math.sin(u * 7.0 + 1.3)) + 0.03 * Math.abs(Math.sin(u * 61.0));
        if (el < crest) c = ridge;
      } else {
        c = lerp(ground, [0.28, 0.25, 0.2], Math.max(0, 1 + el / 0.25));
      }
      const i = (y * W + x) * 4;
      data[i] = THREE.DataUtils.toHalfFloat(c[0]);
      data[i + 1] = THREE.DataUtils.toHalfFloat(c[1]);
      data[i + 2] = THREE.DataUtils.toHalfFloat(c[2]);
      data[i + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
