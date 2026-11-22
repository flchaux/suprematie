// Surcouche de commandement :
// - constructions prévues : fantômes bleutés des bâtiments en file chez nos bâtisseurs, avant que le
//   chantier soit posé ;
// - ordres (avec Maj) : trajet de chaque unité sélectionnée à travers sa file d'ordres, avec un repère
//   coloré par type d'ordre à chaque étape.
import * as THREE from "three/webgpu";
import type { GameData } from "@supreme/shared";
import { buildingScale, buildModel, fallbackModel } from "../models/generator.ts";
import { BUILDING_MODELS } from "../../../../assets/models/buildings.ts";
import { teamInstancedMesh, setTeamColor, type TeamMesh } from "./materials.ts";
import { groundHeight, type MapData } from "./terrain.ts";

const TILE = 256;
const MAX_SEG = 6000;

/** Couleur des ordres (code de la simulation : 1 déplacement, 2 attaque en mouvement, …). */
export const ORDER_COLORS: Record<number, number> = {
  1: 0x6cff8c, 2: 0xffa040, 3: 0x58d8ff, 4: 0xff4d4d, 5: 0xff4d4d, 6: 0xffd060, 7: 0x7da8ff,
  8: 0xd8b060, 9: 0xc07dff, 10: 0xc07dff, 11: 0xff70e0, 12: 0xff70e0, 13: 0xc07dff,
  // ramassage d'un tapis, récolte, déploiement, ramassage d'une sortie, livraison au dépôt
  15: 0xffd060, 16: 0xff9a3c, 17: 0xff9a3c, 18: 0xffd060, 19: 0xffd060,
};

export class CommandOverlay {
  group = new THREE.Group();
  private planned = new Map<number, { tm: TeamMesh; scale: number }>();
  private lines: THREE.LineSegments;
  private pos: Float32Array;
  private col: Float32Array;
  private marks: THREE.InstancedMesh;
  /** files d'ordres reçues : id → [x, y (unité), étapes (code, x, y)] */
  private orders: { id: number; x: number; y: number; steps: [number, number, number][] }[] = [];

  constructor(
    public data: GameData,
    public map: MapData,
  ) {
    this.pos = new Float32Array(MAX_SEG * 6);
    this.col = new Float32Array(MAX_SEG * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicNodeMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;
    this.lines.visible = false;
    this.group.add(this.lines);
    const ring = new THREE.RingGeometry(0.35, 0.55, 16).rotateX(-Math.PI / 2);
    this.marks = new THREE.InstancedMesh(ring, new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false }), 3000);
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 7;
    this.marks.count = 0;
    this.marks.setColorAt(0, new THREE.Color());
    this.group.add(this.marks);
  }

  /** Constructions prévues (liste plate : type, x, y, direction). */
  setPlanned(list: Int32Array | number[], sel: { kind: number; x: number; y: number } | null = null): void {
    const by = new Map<number, [number, number, number][]>();
    for (let i = 0; i + 3 < list.length; i += 4) {
      const k = list[i];
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push([list[i + 1], list[i + 2], list[i + 3]]);
    }
    for (const [k, g] of this.planned) if (!by.has(k)) g.tm.mesh.count = 0;
    const m = new THREE.Matrix4();
    const tint = new THREE.Color(0.35, 0.75, 1.3);
    const selTint = new THREE.Color(1.6, 1.05, 0.35);
    for (const [kind, cells] of by) {
      let g = this.planned.get(kind);
      const def = this.data.buildings[kind];
      if (!def) continue;
      if (!g) {
        const built = buildModel(BUILDING_MODELS[def.key] ?? fallbackModel());
        const tm = teamInstancedMesh(built.body, 512);
        tm.mesh.castShadow = false;
        tm.mesh.receiveShadow = false;
        const mat = tm.mesh.material as THREE.MeshStandardNodeMaterial;
        mat.transparent = true;
        mat.opacity = 0.38;
        mat.depthWrite = false;
        const size = new THREE.Vector3();
        built.box.getSize(size);
        g = { tm, scale: buildingScale(def.w, size.x, size.z, def.reach) };
        this.group.add(tm.mesh);
        this.planned.set(kind, g);
      }
      let n = 0;
      for (const [x, y, dir] of cells.slice(0, 512)) {
        const cx = x + (dir & 1 ? def.h : def.w) / 2;
        const cz = y + (dir & 1 ? def.w : def.h) / 2;
        const gy = def.water ? this.map.waterLevel * 0.08 : groundHeight(this.map, cx, cz);
        const s = g.scale;
        m.compose(new THREE.Vector3(cx, gy + 0.04, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - (dir * Math.PI) / 2), new THREE.Vector3(s, s, s));
        g.tm.mesh.setMatrixAt(n, m);
        // fantôme sélectionné : ambre, plus vif
        setTeamColor(g.tm, n, sel && sel.kind === kind && sel.x === x && sel.y === y ? selTint : tint);
        n++;
      }
      g.tm.mesh.count = n;
      g.tm.mesh.instanceMatrix.needsUpdate = true;
      g.tm.team.needsUpdate = true;
    }
  }

  /** Files d'ordres (format de la simulation : id, x, y, n, puis n fois code, x, y). */
  setOrders(buf: Int32Array | number[] | null): void {
    this.orders = [];
    if (!buf) return;
    for (let o = 0; o + 3 < buf.length; ) {
      const id = buf[o] >>> 0;
      const n = buf[o + 3];
      const steps: [number, number, number][] = [];
      for (let k = 0; k < n; k++) steps.push([buf[o + 4 + k * 3], buf[o + 5 + k * 3], buf[o + 6 + k * 3]]);
      this.orders.push({ id, x: buf[o + 1], y: buf[o + 2], steps });
      o += 4 + n * 3;
    }
  }

  /**
   * Trace les ordres (si `show`) ; `pos` donne la position affichée (interpolée) d'une unité.
   * Les étapes partagées par plusieurs unités (même point) ne reçoivent qu'un repère.
   */
  update(show: boolean, pos: (id: number) => { x: number; y: number; z: number } | undefined): void {
    if (!show || !this.orders.length) {
      this.lines.visible = false;
      this.marks.count = 0;
      return;
    }
    let seg = 0;
    let nm = 0;
    const seen = new Set<number>();
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const put = (i: number, x: number, y: number, z: number) => {
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
    };
    for (const u of this.orders) {
      const p = pos(u.id);
      let px = p ? p.x : u.x / TILE;
      let pz = p ? p.z : u.y / TILE;
      let py = groundHeight(this.map, px, pz) + 0.3;
      for (const [code, sx, sy] of u.steps) {
        if (seg >= MAX_SEG) break;
        const x = sx / TILE;
        const z = sy / TILE;
        const y = groundHeight(this.map, x, z) + 0.3;
        c.setHex(ORDER_COLORS[code] ?? 0xffffff);
        put(seg * 2, px, py, pz);
        put(seg * 2 + 1, x, y, z);
        seg++;
        const key = (Math.round(x * 2) * 8192 + Math.round(z * 2)) * 16 + code;
        if (!seen.has(key) && nm < 3000) {
          seen.add(key);
          m.compose(new THREE.Vector3(x, y + 0.02, z), q, new THREE.Vector3(1, 1, 1));
          this.marks.setMatrixAt(nm, m);
          this.marks.setColorAt(nm, c);
          nm++;
        }
        px = x;
        py = y;
        pz = z;
      }
    }
    this.lines.geometry.setDrawRange(0, seg * 2);
    (this.lines.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    this.lines.visible = seg > 0;
    this.marks.count = nm;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
  }
}
