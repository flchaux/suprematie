// Cercles de portée des unités et bâtiments sélectionnés : tir au sol, antiaérien, anti-sous-marin, zone
// morte (portée minimale) et radar. Les cercles d'une même famille sont fondus : seul le contour de leur
// réunion est tracé (une armée de vingt chars montre une ligne, pas vingt cercles).
import * as THREE from "three/webgpu";
import type { BuildingDef, UnitDef, WeaponDef } from "@supreme/shared";
import { groundHeight, type MapData } from "./terrain.ts";

export type RangeKind = "ground" | "air" | "sub" | "min" | "radar";
export const RANGE_COLORS: Record<RangeKind, number> = { ground: 0xff7a4d, air: 0x6ad0ff, sub: 0x3fe0c0, min: 0xff2d2d, radar: 0x6cff8c };
export interface Circle { x: number; z: number; r: number }

const M_AIR = 8;
const M_SUB = 4;
const M_LAND = 1;
const SEGS = 96;
/** cercles par famille au plus ; au-delà, les plus proches sont confondus */
const MAX_CIRCLES = 72;
const MAX_QUADS = 12000;
/** en deçà, une arme tombe à l'aplomb (bombe, morsure) : pas de cercle */
const MIN_SHOWN = 5;

/** Portées (cases) à montrer pour des armes et un radar, la plus grande de chaque famille. */
export function rangesOf(weapons: WeaponDef[], radar: number): Partial<Record<RangeKind, number>> {
  const out: Partial<Record<RangeKind, number>> = {};
  const put = (k: RangeKind, r: number) => {
    if (r >= MIN_SHOWN && r > (out[k] ?? 0)) out[k] = r;
  };
  for (const w of weapons) {
    if (w.mask === M_AIR) put("air", w.range);
    else if (w.mask & M_SUB && !(w.mask & M_LAND)) put("sub", w.range);
    else {
      put("ground", w.range);
      if (w.mask & M_AIR) put("air", w.range);
    }
    put("min", w.minRange ?? 0);
  }
  put("radar", radar);
  // même portée au sol et en l'air : un seul contour
  if (out.air !== undefined && out.air === out.ground) delete out.air;
  return out;
}

/** Portées d'un type d'unité ; `cannon` : arme qui remplace la sienne (canon renforcé du commandant). */
export function unitRanges(d: UnitDef, weapons: WeaponDef[], cannon = -1): Partial<Record<RangeKind, number>> {
  const list = cannon >= 0 ? [cannon, ...d.weapons.slice(1)] : d.weapons;
  return rangesOf(list.map((i) => weapons[i]).filter(Boolean), d.radar);
}
export function buildingRanges(d: BuildingDef, weapons: WeaponDef[]): Partial<Record<RangeKind, number>> {
  return rangesOf(d.weapon >= 0 && weapons[d.weapon] ? [weapons[d.weapon]] : [], d.radar);
}

/** Trop de cercles : un seul par maille, de plus en plus grande, jusqu'à tenir dans `max`. */
export function thin(list: Circle[], max = MAX_CIRCLES): Circle[] {
  let out = list;
  for (let cell = 1; out.length > max; cell *= 1.6) {
    const seen = new Map<number, Circle>();
    for (const c of list) {
      const k = Math.floor(c.x / cell) * 4096 + Math.floor(c.z / cell);
      const o = seen.get(k);
      if (!o || o.r < c.r) seen.set(k, c);
    }
    out = [...seen.values()];
  }
  return out;
}

/**
 * Contour de la réunion des cercles : segments [x0, z0, x1, z1…]. Pour chaque cercle, les arcs couverts par
 * les autres sont calculés exactement, puis les arcs restants découpés (`segs` segments par tour).
 */
export function unionOutline(list: Circle[], segs = SEGS): number[] {
  const out: number[] = [];
  const TAU = 2 * Math.PI;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    // arcs couverts [début, fin], dans [0, TAU]
    const cover: [number, number][] = [];
    let inside = false;
    for (let j = 0; j < list.length && !inside; j++) {
      if (j === i) continue;
      const o = list[j];
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      // contenu dans un autre ; confondus : seul le premier compte
      if (d + c.r <= o.r + 1e-6) inside = d > 1e-6 || o.r > c.r + 1e-6 || j < i;
      else if (d < o.r + c.r && d + o.r > c.r) {
        const half = Math.acos(Math.max(-1, Math.min(1, (d * d + c.r * c.r - o.r * o.r) / (2 * d * c.r))));
        const a = (Math.atan2(o.z - c.z, o.x - c.x) - half + 2 * TAU) % TAU;
        const b = a + 2 * half;
        if (b > TAU) cover.push([a, TAU], [0, b - TAU]);
        else cover.push([a, b]);
      }
    }
    if (inside) continue;
    cover.sort((p, q) => p[0] - q[0]);
    cover.push([TAU, TAU]);
    let at = 0;
    for (const [a, b] of cover) {
      if (a - at > 1e-4) {
        const n = Math.max(1, Math.ceil(((a - at) / TAU) * segs));
        for (let s = 0; s < n; s++) {
          const u = at + ((a - at) * s) / n;
          const v = at + ((a - at) * (s + 1)) / n;
          out.push(c.x + Math.cos(u) * c.r, c.z + Math.sin(u) * c.r, c.x + Math.cos(v) * c.r, c.z + Math.sin(v) * c.r);
        }
      }
      at = Math.max(at, b);
    }
  }
  return out;
}

export class RangeRings {
  mesh: THREE.Mesh;
  private pos = new Float32Array(MAX_QUADS * 12);
  private col = new Float32Array(MAX_QUADS * 12);
  private drawn = false;

  constructor(private map: MapData) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const index = new Uint32Array(MAX_QUADS * 6);
    for (let i = 0; i < MAX_QUADS; i++) index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicNodeMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /** Trace les contours (`width` : épaisseur du trait, en cases). null : masqué. */
  update(circles: Record<RangeKind, Circle[]> | null, width: number): void {
    if (!circles) {
      if (this.drawn) this.mesh.visible = this.drawn = false;
      return;
    }
    let q = 0;
    const c = new THREE.Color();
    for (const kind of Object.keys(RANGE_COLORS) as RangeKind[]) {
      const segs = unionOutline(thin(circles[kind]));
      c.setHex(RANGE_COLORS[kind]);
      for (let i = 0; i + 3 < segs.length && q < MAX_QUADS; i += 4, q++) {
        const [x0, z0, x1, z1] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]];
        const l = Math.hypot(x1 - x0, z1 - z0) || 1;
        const nx = (-(z1 - z0) / l) * width * 0.5;
        const nz = ((x1 - x0) / l) * width * 0.5;
        const y0 = groundHeight(this.map, x0, z0) + 0.3;
        const y1 = groundHeight(this.map, x1, z1) + 0.3;
        this.pos.set([x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz], q * 12);
        for (let v = 0; v < 4; v++) this.col.set([c.r, c.g, c.b], q * 12 + v * 3);
      }
    }
    const g = this.mesh.geometry;
    g.setDrawRange(0, q * 6);
    g.getAttribute("position").needsUpdate = true;
    g.getAttribute("color").needsUpdate = true;
    this.mesh.visible = this.drawn = q > 0;
  }
}
