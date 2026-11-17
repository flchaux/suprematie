// Scène : moteur Three.js (WebGPU, repli automatique WebGL2), caméra inclinable à zoom continu,
// lumières et ombres portées, halo lumineux (bloom), terrain, entités, fantôme de placement, sélection à la souris.
import * as THREE from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fogEnabled } from "./fog.ts";
import { DEFAULT_GFX, type GfxSettings } from "./gfx.ts";
import type { GameData, Frame } from "@supreme/shared";
import { Terrain, groundHeight, type MapData } from "./terrain.ts";
import { Entities } from "./entities.ts";
import { buildModel, fallbackModel } from "../models/generator.ts";
import { BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { teamInstancedMesh, setTeamColor } from "./materials.ts";

/** Statistiques du rendu de la dernière image. */
export interface RenderStats {
  drawCalls: number;
  triangles: number;
  particles: number;
  cpuMs: number;
  shadowSize: number;
}

export class GameScene {
  renderer!: THREE.WebGPURenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 6000);
  terrain!: Terrain;
  entities!: Entities;
  map!: MapData;
  data!: GameData;
  // caméra : point visé, distance, inclinaison, rotation
  target = new THREE.Vector3(256, 0, 256);
  distance = 60;
  tilt = 0.95; // radians depuis l'horizontale (1.57 = vue de dessus)
  yaw = 0;
  iconDistance = 260;
  backend = "";
  ghost: { mesh: THREE.InstancedMesh; kind: number } | null = null;
  ghostMeshes = new Map<number, ReturnType<typeof teamInstancedMesh>>();
  lineGhost: THREE.InstancedMesh | null = null;
  markers: THREE.InstancedMesh;
  markerList: { x: number; z: number; age: number; color: THREE.Color }[] = [];
  rangeRing: THREE.Mesh;
  sun = new THREE.DirectionalLight(0xfff1dc, 2.3);
  /** direction vers le soleil (normalisée) */
  sunDir = new THREE.Vector3(-0.55, 0.72, 0.42).normalize();
  post: THREE.RenderPipeline | null = null;
  bloomPass: ReturnType<typeof bloom> | null = null;
  gfx: GfxSettings = { ...DEFAULT_GFX };
  stats: RenderStats = { drawCalls: 0, triangles: 0, particles: 0, cpuMs: 0, shadowSize: 0 };
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
    this.rangeRing.renderOrder = 8;
  }

  async init(forceWebGL = false): Promise<void> {
    this.renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.canvasParent.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    await this.renderer.init();
    this.backend = (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL2";
    this.scene.background = new THREE.Color(0x0b1016);
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3b3426, 1.1));
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
    this.buildPost();
    this.scene.add(this.markers);
    this.scene.add(this.rangeRing);
    this.resize();
    addEventListener("resize", () => this.resize());
  }

  /** Rendu en deux temps : scène puis halo lumineux sur les parties très claires (tirs, explosions). */
  private buildPost(): void {
    const post = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    const color = scenePass.getTextureNode("output");
    this.bloomPass = bloom(color, 0.55, 0.35, 0.82);
    post.outputNode = color.add(this.bloomPass);
    this.post = post;
  }

  applySettings(g: GfxSettings): void {
    this.gfx = { ...g };
    this.sun.castShadow = g.shadows;
    this.renderer.shadowMap.enabled = g.shadows;
    if (this.entities) this.entities.effects.quality = g.effects;
    // changer les ombres impose de recompiler les matériaux
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !Array.isArray(m)) m.needsUpdate = true;
    });
  }

  setWorld(map: MapData, data: GameData): void {
    if (this.terrain) this.scene.remove(this.terrain.group);
    if (this.entities) this.scene.remove(this.entities.group);
    this.map = map;
    this.data = data;
    this.terrain = new Terrain(map);
    this.scene.add(this.terrain.group);
    this.entities = new Entities(data, map);
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
  setGhost(kind: number, cells: { x: number; y: number; dir: number; ok: boolean }[]): void {
    for (const [k, g] of this.ghostMeshes) g.mesh.visible = k === kind && cells.length > 0;
    if (kind < 0 || !cells.length) return;
    let g = this.ghostMeshes.get(kind);
    if (!g || g.mesh.count === undefined) {
      const def = this.data.buildings[kind];
      const built = buildModel(BUILDING_MODELS[def.key] ?? fallbackModel());
      g = teamInstancedMesh(built.body, 512);
      g.mesh.castShadow = false;
      const mat = g.mesh.material as THREE.MeshStandardNodeMaterial;
      mat.transparent = true;
      mat.opacity = 0.55;
      mat.depthWrite = false;
      const size = new THREE.Vector3();
      built.box.getSize(size);
      g.mesh.userData.scale = (def.w * 0.98) / Math.max(size.x, size.z, 0.01);
      this.scene.add(g.mesh);
      this.ghostMeshes.set(kind, g);
    }
    const def = this.data.buildings[kind];
    const s = g.mesh.userData.scale as number;
    const m = new THREE.Matrix4();
    let n = 0;
    for (const c of cells.slice(0, 512)) {
      const cx = c.x + def.w / 2;
      const cz = c.y + def.h / 2;
      const y = def.water ? this.map.waterLevel * 0.08 : groundHeight(this.map, cx, cz);
      m.compose(new THREE.Vector3(cx, y + 0.05, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - (c.dir * Math.PI) / 2), new THREE.Vector3(s, s, s));
      g.mesh.setMatrixAt(n, m);
      setTeamColor(g, n, c.ok ? new THREE.Color(0.4, 1, 0.5) : new THREE.Color(1, 0.3, 0.3));
      n++;
    }
    g.mesh.count = n;
    g.mesh.visible = true;
    g.mesh.instanceMatrix.needsUpdate = true;
    g.team.needsUpdate = true;
  }

  hideGhost(): void {
    for (const g of this.ghostMeshes.values()) g.mesh.visible = false;
  }

  addMarker(x: number, z: number, color: number): void {
    this.markerList.push({ x, z, age: 0, color: new THREE.Color(color) });
    if (this.markerList.length > 150) this.markerList.shift();
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

  render(frame: Frame | null, alpha: number, me: number, myTeam: number, selected: Set<number>, dt: number, spectator: boolean): void {
    const t0 = performance.now();
    this.time += dt;
    this.updateCamera();
    this.updateShadow();
    fogEnabled.value = spectator ? 0 : 1;
    this.terrain?.tick(dt, this.time);
    if (frame && this.entities) {
      const iconScale = Math.max(1, this.distance / 160);
      this.entities.update(frame, alpha, me, myTeam, selected, this.strategic, iconScale, dt, spectator, this.viewRect());
    }
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
    this.renderer.info.reset();
    if (this.gfx.bloom && this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
    const info = this.renderer.info.render as unknown as { drawCalls?: number; calls?: number; triangles: number };
    this.stats.drawCalls = info.drawCalls ?? info.calls ?? 0;
    this.stats.triangles = info.triangles;
    this.stats.particles = this.entities?.effects.count ?? 0;
    this.stats.cpuMs = performance.now() - t0;
  }
}
