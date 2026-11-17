// Rendu des entités : un InstancedMesh par type d'unité, de bâtiment et d'objet sur tapis ;
// chaque pièce mobile (tourelle) est un mesh instancié séparé. Interpolation entre les deux derniers ticks.
// Les effets (feu, fumée, débris) sont dans effects.ts.
import * as THREE from "three/webgpu";
import type { GameData, Frame } from "@supreme/shared";
import { UNIT_WORDS, BUILDING_WORDS, ITEM_WORDS, PROJ_WORDS, WRECK_WORDS, SHIELD_WORDS, CARRIER_WORDS, UF, BF, BClass, Layer } from "@supreme/shared";
import { texture as tslTexture, uv, vec2, instancedBufferAttribute } from "three/tsl";
import { buildModel, fallbackModel, PLAYER_COLORS } from "../models/generator.ts";
import { teamInstancedMesh, setTeamColor, setAccentColor, TEX_PER_TILE_UNIT, TEX_PER_TILE_BUILDING, type TeamMesh } from "./materials.ts";
import { UNIT_MODELS } from "../../../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { VEHICLE_MODELS } from "../../../../assets/models/vehicles.ts";
import { groundHeight, HSCALE, type MapData } from "./terrain.ts";
import { Effects } from "./effects.ts";

const TILE = 256;
const ANG = (Math.PI * 2) / 65536;

class KindMesh {
  body: TeamMesh | null = null;
  pivots: { tm: TeamMesh; origin: THREE.Vector3; spin: boolean }[] = [];
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
  ) {
    const size = new THREE.Vector3();
    built.box.getSize(size);
    this.height = size.y * scale;
  }
  ensure(need: number): void {
    if (need <= this.cap) return;
    const cap = Math.max(16, this.cap * 2, need);
    if (this.body) this.scene.remove(this.body.mesh);
    for (const p of this.pivots) this.scene.remove(p.tm.mesh);
    this.body = teamInstancedMesh(this.built.body, cap, this.texPerTile * this.scale);
    this.scene.add(this.body.mesh);
    this.pivots = this.built.pivots.map((p) => {
      const tm = teamInstancedMesh(p.geometry, cap, this.texPerTile * this.scale);
      this.scene.add(tm.mesh);
      return { tm, origin: p.origin.clone().multiplyScalar(this.scale), spin: /rotor|helice|foret|radar|emetteur|cristal|feu/.test(p.name) };
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

const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
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
  teamColors: THREE.Color[] = PLAYER_COLORS.map((c) => new THREE.Color(c));
  items: THREE.InstancedMesh;
  proj: THREE.InstancedMesh;
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
      const scale = (b.w * 0.98) / Math.max(size.x, size.z, 0.01);
      this.buildingMeshes.push(new KindMesh(this.group, built, scale, TEX_PER_TILE_BUILDING));
    }
    const basic = (opts: Record<string, unknown>) => new THREE.MeshBasicNodeMaterial(opts);
    this.items = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.14, 0.2), new THREE.MeshStandardNodeMaterial({ roughness: 0.5 }), 20000);
    this.items.count = 0;
    this.items.frustumCulled = false;
    this.items.setColorAt(0, new THREE.Color());
    this.group.add(this.items);
    // projectiles lumineux (couleurs au-delà de 1 : halo)
    this.proj = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), basic({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 8000);
    this.proj.count = 0;
    this.proj.frustumCulled = false;
    this.proj.setColorAt(0, new THREE.Color());
    this.group.add(this.proj);
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
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - facing);
      const sc = km.scale;
      tmpM.compose(tmpV.set(x, y + bob, z), tmpQ, tmpS.set(sc, sc, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      setTeamColor(km.body!, km.n, col);
      for (const p of km.pivots) {
        // la tourelle tourne vers sa cible ; les rotors tournent en continu
        const isRotor = p.spin;
        const rot = flags & UF.IDLE && !(flags & UF.FIRING) && turret === 0 ? 0 : facing - turret;
        tmpM2.makeTranslation(p.origin.x, p.origin.y, p.origin.z);
        tmpM2.multiply(new THREE.Matrix4().makeRotationY(isRotor ? performance.now() / 80 : rot));
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
      const km = this.buildingMeshes[kind];
      km.ensure(km.n + 1);
      const build = buf[o + 4] / 65536;
      const y = groundHeight(this.map, cx, cz);
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - (dir * Math.PI) / 2);
      const sc = km.scale;
      const sy = build >= 1 ? sc : sc * Math.max(0.08, build);
      tmpM.compose(tmpV.set(cx, def.water ? this.map.waterLevel * HSCALE : y, cz), tmpQ, tmpS.set(sc, sy, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      const c = build < 1 ? tmpC.copy(col).lerp(new THREE.Color(0x9fe8ff), 0.5) : bflags & BF.UNPOWERED ? tmpC.copy(col).multiplyScalar(0.45) : col;
      setTeamColor(km.body!, km.n, c);
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
        } else if (bflags & BF.WORKING) rot = performance.now() / 300;
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
      if ((frac < 0.999 || selected.has(ref)) && build >= 1 && def.cls !== BClass.Belt && bars < 5900) {
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
    // ----- objets sur les tapis -----
    let ni = 0;
    if (!strategic) {
      o = f.itemOff;
      for (let i = 0; i < f.nItems && ni < 20000; i++, o += ITEM_WORDS) {
        const x = buf[o] / TILE;
        const z = buf[o + 1] / TILE;
        tmpM.makeTranslation(x, groundHeight(this.map, x, z) + 0.2, z);
        this.items.setMatrixAt(ni, tmpM);
        this.items.setColorAt(ni, tmpC.setHex(this.data.items[buf[o + 2]]?.color ?? 0xffffff));
        ni++;
      }
    }
    this.items.count = ni;
    this.items.instanceMatrix.needsUpdate = true;
    if (this.items.instanceColor) this.items.instanceColor.needsUpdate = true;
    // ----- projectiles -----
    let np = 0;
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
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(big, big, big * (w?.proj === 0 ? 2 : 1)));
      this.proj.setMatrixAt(np, tmpM);
      const pk = w?.proj ?? 0;
      this.proj.setColorAt(np, tmpC.setHex(special ? 0xffe070 : PROJ_COLORS[pk] ?? 0xffffff).multiplyScalar(pk === 3 ? 0.6 : 2.6));
      np++;
      const elapsed = buf[o + 4] & 0xffff;
      if (elapsed >= 1 && elapsed <= tickDelta && special === 0 && pk !== 3 && pk !== 4) fx.muzzle(x0, gy0 + 1, z0, pk, big);
      if (special || pk === 1 || pk === 2 || pk === 4) fx.trail(x, y, z, pk, dt, big);
    }
    this.proj.count = np;
    this.proj.instanceMatrix.needsUpdate = true;
    if (this.proj.instanceColor) this.proj.instanceColor.needsUpdate = true;
    // ----- épaves -----
    let nw = 0;
    if (!strategic) {
      o = f.wreckOff;
      for (let i = 0; i < f.nWrecks && nw < 6000; i++, o += WRECK_WORDS) {
        const x = buf[o] / TILE;
        const z = buf[o + 1] / TILE;
        if (!seen(x, z, 8)) continue;
        const s = Math.min(4, 0.5 + (buf[o + 2] & 0xff) * 0.4);
        tmpQ.setFromAxisAngle(UP, x * 3.7 + z);
        tmpM.compose(tmpV.set(x, groundHeight(this.map, x, z) + 0.1, z), tmpQ, tmpS.set(s, s * 0.4, s));
        this.wrecks.setMatrixAt(nw++, tmpM);
      }
    }
    this.wrecks.count = nw;
    this.wrecks.instanceMatrix.needsUpdate = true;
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

const PROJ_COLORS: Record<number, number> = { 0: 0xffd27a, 1: 0xffb050, 2: 0xff7050, 3: 0x404040, 4: 0x9fd0ff, 5: 0x7fffff, 6: 0x7dfcff, 7: 0x9db7ff, 8: 0xff5050 };
