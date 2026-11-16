// Rendu des entités : un InstancedMesh par type d'unité, de bâtiment et d'objet sur tapis ;
// chaque pièce mobile (tourelle) est un mesh instancié séparé. Interpolation entre les deux derniers ticks.
import * as THREE from "three/webgpu";
import type { GameData, Frame } from "@supreme/shared";
import { UNIT_WORDS, BUILDING_WORDS, ITEM_WORDS, PROJ_WORDS, WRECK_WORDS, SHIELD_WORDS, UF, BF, BClass, Layer } from "@supreme/shared";
import { buildModel, fallbackModel, PLAYER_COLORS } from "../models/generator.ts";
import { teamInstancedMesh, setTeamColor, type TeamMesh } from "./materials.ts";
import { UNIT_MODELS } from "../../../../assets/models/units.ts";
import { BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { groundHeight, HSCALE, type MapData } from "./terrain.ts";

const TILE = 256;
const ANG = (Math.PI * 2) / 65536;

class KindMesh {
  body: TeamMesh | null = null;
  pivots: { tm: TeamMesh; origin: THREE.Vector3; spin: boolean }[] = [];
  cap = 0;
  n = 0;
  constructor(
    public scene: THREE.Object3D,
    public built: ReturnType<typeof buildModel>,
    public scale: number,
  ) {}
  ensure(need: number): void {
    if (need <= this.cap) return;
    const cap = Math.max(16, this.cap * 2, need);
    if (this.body) this.scene.remove(this.body.mesh);
    for (const p of this.pivots) this.scene.remove(p.tm.mesh);
    this.body = teamInstancedMesh(this.built.body, cap);
    this.scene.add(this.body.mesh);
    this.pivots = this.built.pivots.map((p) => {
      const tm = teamInstancedMesh(p.geometry, cap);
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

export class Entities {
  group = new THREE.Group();
  unitMeshes: KindMesh[] = [];
  buildingMeshes: KindMesh[] = [];
  teamColors: THREE.Color[] = PLAYER_COLORS.map((c) => new THREE.Color(c));
  items: THREE.InstancedMesh;
  proj: THREE.InstancedMesh;
  explosions: THREE.InstancedMesh;
  shields: THREE.InstancedMesh;
  wrecks: THREE.InstancedMesh;
  rings: THREE.InstancedMesh;
  bars: THREE.InstancedMesh;
  icons: THREE.InstancedMesh[];
  beams: THREE.LineSegments;
  beamPos: Float32Array;
  beamCol: Float32Array;
  ghostGroup = new THREE.Group();
  fx: { x: number; y: number; z: number; r: number; age: number; life: number; color: THREE.Color }[] = [];
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
      this.unitMeshes.push(new KindMesh(this.group, built, scale));
    }
    for (const b of data.buildings) {
      const built = buildModel(BUILDING_MODELS[b.key] ?? fallbackModel(b.w > 1 ? 1.2 : 0.4));
      const size = new THREE.Vector3();
      built.box.getSize(size);
      const scale = (b.w * 0.98) / Math.max(size.x, size.z, 0.01);
      this.buildingMeshes.push(new KindMesh(this.group, built, scale));
    }
    const basic = (opts: Record<string, unknown>) => new THREE.MeshBasicNodeMaterial(opts);
    this.items = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.14, 0.2), new THREE.MeshStandardNodeMaterial({ roughness: 0.5 }), 20000);
    this.items.count = 0;
    this.items.frustumCulled = false;
    this.items.setColorAt(0, new THREE.Color());
    this.group.add(this.items);
    this.proj = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.5), basic({}), 8000);
    this.proj.count = 0;
    this.proj.frustumCulled = false;
    this.proj.setColorAt(0, new THREE.Color());
    this.group.add(this.proj);
    this.explosions = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), basic({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 3000);
    this.explosions.count = 0;
    this.explosions.frustumCulled = false;
    this.explosions.setColorAt(0, new THREE.Color());
    this.group.add(this.explosions);
    this.shields = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), basic({ transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }), 400);
    this.shields.count = 0;
    this.shields.frustumCulled = false;
    this.shields.setColorAt(0, new THREE.Color());
    this.group.add(this.shields);
    this.wrecks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardNodeMaterial({ color: 0x4a3b30, roughness: 1 }), 6000);
    this.wrecks.count = 0;
    this.wrecks.frustumCulled = false;
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
    for (const ic of this.icons) ic.count = 0;
    let rings = 0;
    let bars = 0;
    this.screen.length = 0;
    const [vx0, vz0, vx1, vz1] = viewRect;
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
      const frac = Math.max(0, Math.min(1, hp / def.hp));
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
      this.proj.setColorAt(np, tmpC.setHex(special ? 0xffe070 : PROJ_COLORS[w?.proj ?? 0] ?? 0xffffff));
      np++;
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
    if (this.fx.length > 2900) return;
    const y = groundHeight(this.map, x, z) + 0.3;
    const color = kind === 3 ? new THREE.Color(1, 0.95, 0.8) : kind === 2 ? new THREE.Color(1, 0.6, 0.25) : new THREE.Color(1, 0.55, 0.15);
    this.fx.push({ x, y, z, r: Math.max(0.4, r), age: 0, life: kind === 3 ? 2.5 : kind >= 1 ? 1.2 : 0.45, color });
  }

  addBeam(a: THREE.Vector3, b: THREE.Vector3, color: number, life = 0.15): void {
    if (this.beamList.length > 3900) return;
    this.beamList.push({ a, b, age: 0, life, color: new THREE.Color(color) });
  }

  private updateFx(dt: number): void {
    let n = 0;
    this.fx = this.fx.filter((e) => (e.age += dt) < e.life);
    for (const e of this.fx) {
      const k = e.age / e.life;
      const s = e.r * (0.4 + k * 0.9);
      tmpM.compose(tmpV.set(e.x, e.y, e.z), tmpQ.identity(), tmpS.set(s, s * 0.8, s));
      this.explosions.setMatrixAt(n, tmpM);
      this.explosions.setColorAt(n, tmpC.copy(e.color).multiplyScalar((1 - k) * (1 - k)));
      n++;
    }
    this.explosions.count = n;
    this.explosions.instanceMatrix.needsUpdate = true;
    if (this.explosions.instanceColor) this.explosions.instanceColor.needsUpdate = true;
    this.beamList = this.beamList.filter((b) => (b.age += dt) < b.life);
    let k = 0;
    for (const b of this.beamList) {
      const f = 1 - b.age / b.life;
      this.beamPos.set([b.a.x, b.a.y, b.a.z, b.b.x, b.b.y, b.b.z], k * 6);
      this.beamCol.set([b.color.r * f, b.color.g * f, b.color.b * f, b.color.r * f, b.color.g * f, b.color.b * f], k * 6);
      k++;
    }
    this.beams.geometry.setDrawRange(0, k * 2);
    (this.beams.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.beams.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }
}

const PROJ_COLORS: Record<number, number> = { 0: 0xffd27a, 1: 0xffb050, 2: 0xff7050, 3: 0x404040, 4: 0x9fd0ff, 5: 0x7fffff, 6: 0x7dfcff, 7: 0x9db7ff, 8: 0xff5050 };
