// Petites décorations du sol (herbes, buissons, arbres, rochers, débris, cristaux…) : petits modèles
// low-poly (assets/models/decor.ts), un maillage instancié par sorte, chaque décoration tournée,
// mise à l'échelle et teintée selon un hachage déterministe. Placement tiré de la carte (zones
// d'altitude, pente, rives), jamais dans l'eau ni sur les gisements ; seuls les morceaux de carte vus
// sont envoyés à la carte graphique, moins denses quand la caméra s'éloigne. Masquées en vue
// stratégique, sous le brouillard non exploré et sous les bâtiments (connus par les images de la simulation).
import * as THREE from "three/webgpu";
import { attribute, positionGeometry, normalGeometry, uniform, vec3, float, sin, cos, mix, normalize, smoothstep, step, transformNormalToView } from "three/tsl";
import type { Frame, GameData } from "@supreme/shared";
import { BUILDING_WORDS } from "@supreme/shared";
import { fogFactor, applyFog } from "./fog.ts";
import { groundHeight, groundChain, rockWeight, type MapData } from "./terrain.ts";
import { buildModel } from "../models/generator.ts";
import { DECOR_MODELS } from "../../../../assets/models/decor.ts";

/**
 * Sortes de décorations : taille (plus grande dimension, en cases), balancement au vent, petite
 * (disparaît la première au loin), enfoncement dans le sol (part de la taille), ombre portée.
 */
export const DECOR_KINDS = {
  grass_tuft: { size: [0.6, 0.95], sway: 1, small: true, sink: 0.02, shadow: false },
  bush: { size: [0.7, 1.05], sway: 0.25, small: false, sink: 0.06, shadow: true },
  flowers: { size: [0.5, 0.75], sway: 0.8, small: true, sink: 0.02, shadow: false },
  conifer: { size: [1.7, 2.5], sway: 0.12, small: false, sink: 0.03, shadow: true },
  stump: { size: [0.6, 0.85], sway: 0, small: true, sink: 0.05, shadow: true },
  dead_tree: { size: [1.3, 1.9], sway: 0.08, small: false, sink: 0.03, shadow: true },
  dry_shrub: { size: [0.7, 1.05], sway: 0.6, small: true, sink: 0.03, shadow: false },
  rocks: { size: [0.65, 1.0], sway: 0, small: true, sink: 0.08, shadow: false },
  boulder: { size: [0.9, 1.5], sway: 0, small: false, sink: 0.1, shadow: true },
  reeds: { size: [0.8, 1.1], sway: 1, small: false, sink: 0.02, shadow: false },
  fallen_log: { size: [0.9, 1.3], sway: 0, small: false, sink: 0.04, shadow: true },
  ruined_pillar: { size: [0.9, 1.3], sway: 0, small: false, sink: 0.04, shadow: true },
  fern: { size: [0.6, 0.95], sway: 0.5, small: true, sink: 0.02, shadow: false },
  crystal: { size: [0.8, 1.2], sway: 0, small: false, sink: 0.05, shadow: true },
  snow_pine: { size: [1.6, 2.3], sway: 0.1, small: false, sink: 0.03, shadow: true },
  ice_rock: { size: [0.7, 1.1], sway: 0, small: false, sink: 0.08, shadow: true },
} as const;
export type DecorKind = keyof typeof DECOR_KINDS;
const KINDS = DECOR_KINDS;
type Kind = DecorKind;
const KIND_KEYS = Object.keys(KINDS) as Kind[];
const KIND_INDEX = Object.fromEntries(KIND_KEYS.map((k, i) => [k, i])) as Record<Kind, number>;

/** Zones : densité (décorations par case) et poids des sortes. */
interface Zone { density: number; kinds: [Kind, number][] }
const SHORE: Zone = { density: 0.14, kinds: [["reeds", 5], ["grass_tuft", 2], ["rocks", 1]] };
const SAND: Zone = { density: 0.04, kinds: [["dry_shrub", 2], ["rocks", 2], ["boulder", 0.5], ["ruined_pillar", 0.35]] };
const GRASS: Zone = { density: 0.19, kinds: [["grass_tuft", 6], ["bush", 3], ["flowers", 2.5], ["conifer", 1.4], ["stump", 0.5], ["rocks", 1], ["boulder", 0.4], ["fern", 1.6], ["fallen_log", 0.35], ["ruined_pillar", 0.12], ["crystal", 0.08]] };
const DRY: Zone = { density: 0.13, kinds: [["dry_shrub", 4], ["dead_tree", 0.9], ["rocks", 2], ["boulder", 1], ["grass_tuft", 1.5], ["fallen_log", 0.4], ["ruined_pillar", 0.2], ["stump", 0.3]] };
const SNOW: Zone = { density: 0.07, kinds: [["snow_pine", 2], ["ice_rock", 3], ["rocks", 0.4], ["crystal", 0.5]] };
const ROCKY: Zone = { density: 0.08, kinds: [["boulder", 2], ["rocks", 3], ["crystal", 0.35], ["dead_tree", 0.3]] };
const CHAIN_ZONES = [SAND, SAND, GRASS, DRY, SNOW];

/** Valeurs par décoration : x, y, z, taille, angle, teinte, balancement, nuance chaude/froide, sorte. */
const STRIDE = 9;
/** Nombre maximal de décorations envoyées à la carte graphique. */
const MAX = 6000;
const CHUNK = 32;
/** Au-delà de cette distance de caméra, plus de décorations. */
const FAR = 250;

/** Hachage entier déterministe → 0..1. */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(s, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bruit de valeurs lissé (0..1), période `scale` cases. */
function vnoise(x: number, y: number, scale: number, s: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, s);
  const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s);
  const d = hash(ix + 1, iy + 1, s);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function pick(z: Zone, r: number, forest: number): Kind {
  let total = 0;
  for (const [k, w] of z.kinds) total += k === "conifer" ? w * forest : w;
  let t = r * total;
  for (const [k, w] of z.kinds) {
    t -= k === "conifer" ? w * forest : w;
    if (t <= 0) return k;
  }
  return z.kinds[z.kinds.length - 1][0];
}

const baseCache = new Map<Kind, { geo: THREE.BufferGeometry; triangles: number }>();
/** Modèle d'une sorte, ramené à une plus grande dimension de 1, base à y = 0 (construit une fois). */
export function decorGeometry(kind: DecorKind): { geo: THREE.BufferGeometry; triangles: number } {
  let hit = baseCache.get(kind);
  if (!hit) {
    const built = buildModel(DECOR_MODELS[kind] ?? { parts: [{ shape: "sphere", radius: 0.5, pos: [0, 0.3, 0], color: "rock" }] });
    const size = new THREE.Vector3();
    built.box.getSize(size);
    const s = 1 / Math.max(size.x, size.y, size.z, 0.01);
    // géométrie partagée par le cache du générateur : on met à l'échelle une copie
    const geo = built.body.clone().scale(s, s, s);
    hit = { geo, triangles: built.triangles };
    baseCache.set(kind, hit);
  }
  return hit;
}

/**
 * Matériau commun des décorations. Par instance : `dpos` (x, y, z, taille) et `dinfo` (angle,
 * teinte, balancement, nuance). La rotation, l'échelle et le vent sont faits dans le nuanceur de
 * sommets ; la position est aussi celle de la passe d'ombre.
 */
export function decorMaterial(time = uniform(0)): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const p = attribute("dpos", "vec4");
  const info = attribute("dinfo", "vec4");
  const q = positionGeometry;
  const c = cos(info.x);
  const s = sin(info.x);
  // balancement au vent : le haut des plantes oscille (le carré de la hauteur garde le pied fixe)
  const bend = q.y.mul(q.y).mul(info.z).mul(0.09);
  const t = time.mul(1.6).add(p.x.mul(0.9)).add(p.z.mul(0.55));
  const wind = vec3(sin(t), 0, sin(t.mul(0.8).add(1.3)).mul(0.6)).mul(bend);
  const local = vec3(q.x.mul(c).add(q.z.mul(s)), q.y, q.z.mul(c).sub(q.x.mul(s)));
  mat.positionNode = p.xyz.add(local.add(wind).mul(p.w));
  const n = normalGeometry;
  const rn = vec3(n.x.mul(c).add(n.z.mul(s)), n.y, n.z.mul(c).sub(n.x.mul(s)));
  // normales un peu tirées vers le haut : éclairage doux, accordé au sol qui les entoure
  mat.normalNode = transformNormalToView(normalize(mix(rn, vec3(0, 1, 0), 0.22)));
  const vcol = attribute("color", "vec3");
  const mask = attribute("mask", "float");
  // teinte par instance : luminosité et nuance chaude (jaunie) ou froide (bleutée)
  const hue = mix(vec3(0.94, 1.0, 1.08), vec3(1.08, 1.0, 0.86), info.w);
  const col = vcol.mul(hue).mul(info.y);
  const fog = fogFactor();
  mat.colorNode = applyFog(col as unknown as Parameters<typeof applyFog>[0], fog);
  // cristaux : léger éclat propre
  mat.emissiveNode = col.mul(step(float(1.5), mask)).mul(0.45).mul(fog);
  // invisibles sous le brouillard non exploré
  mat.opacityNode = smoothstep(0.22, 0.36, fog);
  mat.alphaTest = 0.5;
  return mat;
}

export interface DecorBatch {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  pos: THREE.InstancedBufferAttribute;
  info: THREE.InstancedBufferAttribute;
}

/** Maillage instancié d'une sorte (au plus `cap` décorations). */
export function decorBatch(kind: DecorKind, cap: number, mat: THREE.Material): DecorBatch {
  const base = decorGeometry(kind).geo;
  const geo = new THREE.InstancedBufferGeometry();
  // copies : chaque partie libère ses tampons sans toucher au modèle partagé
  for (const name of ["position", "normal", "color", "mask"]) geo.setAttribute(name, base.getAttribute(name).clone());
  const pos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  pos.setUsage(THREE.DynamicDrawUsage);
  info.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("dpos", pos);
  geo.setAttribute("dinfo", info);
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = KINDS[kind].shadow;
  mesh.visible = false;
  return { mesh, geo, pos, info };
}

interface Chunk { data: Float32Array; cells: Int32Array; rank: Float32Array }

export class Decorations {
  /** groupe des maillages (un par sorte) */
  mesh = new THREE.Group();
  /** nombre de décorations affichées */
  count = 0;
  enabled = true;
  private chunks: Chunk[] = [];
  private cw: number;
  private ch: number;
  private batches: (DecorBatch | null)[] = [];
  private counts = new Int32Array(KIND_KEYS.length);
  private mat: THREE.MeshStandardNodeMaterial;
  private time = uniform(0);
  /** cases couvertes par des bâtiments (compte) */
  private covered: Uint8Array;
  private known = new Map<number, { x: number; z: number; w: number; h: number }>();
  private lastSig = -1;
  private lastCount = -1;
  private coverVersion = 0;
  private fillKey = "";

  constructor(private map: MapData, private data: GameData) {
    this.covered = new Uint8Array(map.w * map.h);
    this.cw = Math.ceil(map.w / CHUNK);
    this.ch = Math.ceil(map.h / CHUNK);
    const totals = this.place();
    this.mat = decorMaterial(this.time);
    // un maillage par sorte présente sur la carte, à la taille du plus grand remplissage possible
    this.batches = KIND_KEYS.map((k, i) => {
      if (!totals[i]) return null;
      const b = decorBatch(k, Math.min(MAX, totals[i]), this.mat);
      this.mesh.add(b.mesh);
      return b;
    });
    this.mesh.visible = false;
  }

  dispose(): void {
    for (const b of this.batches) b?.geo.dispose();
    this.mat.dispose();
  }

  /** Placement déterministe : une décoration au plus par case, regroupées par morceaux de carte. Rend le nombre de chaque sorte. */
  private place(): number[] {
    const m = this.map;
    const { w, h, heights, waterLevel } = m;
    const totals = KIND_KEYS.map(() => 0);
    const blocked = new Uint8Array(w * h);
    const block = (x0: number, z0: number, x1: number, z1: number) => {
      for (let z = Math.max(0, z0); z <= Math.min(h - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) blocked[z * w + x] = 1;
    };
    // gisements : clairière ronde (pas un carré), un peu plus large que l'emprise
    for (const s of m.spots) {
      for (let z = s.y - 2; z <= s.y + 3; z++) for (let x = s.x - 2; x <= s.x + 3; x++) if (Math.hypot(x + 0.5 - (s.x + 1), z + 0.5 - (s.y + 1)) < 2.05) block(x, z, x, z);
    }
    for (const [sx, sy] of m.starts) block(sx - 3, sy - 3, sx + 3, sy + 3);
    const hAt = (x: number, z: number) => heights[Math.min(h - 1, Math.max(0, z)) * w + Math.min(w - 1, Math.max(0, x))];
    const lists: number[][] = Array.from({ length: this.cw * this.ch }, () => []);
    const F = STRIDE + 2; // + rang et case
    for (let z = 2; z < h - 2; z++) {
      for (let x = 2; x < w - 2; x++) {
        const r0 = hash(x, z, 1);
        if (r0 > 0.3) continue; // aucune zone ne dépasse cette densité
        if (blocked[z * w + x]) continue;
        const hc = hAt(x, z);
        const rel = hc - waterLevel;
        if (waterLevel > 0 && rel < 1.5) continue;
        // jamais au bord de l'eau dans le doute : les quatre voisines doivent être émergées
        if (waterLevel > 0 && Math.min(hAt(x - 1, z), hAt(x + 1, z), hAt(x, z - 1), hAt(x, z + 1)) <= waterLevel) continue;
        const gx = (hAt(x + 2, z) - hAt(x - 2, z)) / 4;
        const gz = (hAt(x, z + 2) - hAt(x, z - 2)) / 4;
        const rock = rockWeight(Math.hypot(gx, gz) * 1.6);
        let zone: Zone;
        if (rock > 0.3 + hash(x, z, 2) * 0.4) zone = ROCKY;
        else if (waterLevel > 0 && rel < 6 && Math.min(hAt(x - 3, z), hAt(x + 3, z), hAt(x, z - 3), hAt(x, z + 3)) <= waterLevel) zone = SHORE;
        else zone = CHAIN_ZONES[Math.max(0, Math.min(4, Math.round(groundChain(hc, waterLevel) + (hash(x, z, 3) - 0.5) * 0.9)))];
        // grappes : la densité suit un bruit lent
        const cl = vnoise(x, z, 9, 4);
        const p = zone.density * (0.15 + 1.7 * cl * cl);
        if (r0 >= p) continue;
        const forest = 0.2 + 3 * Math.max(0, vnoise(x, z, 26, 5) - 0.45);
        const kind = pick(zone, hash(x, z, 6), forest);
        const def = KINDS[kind];
        if (!def.small && rock > 0.25 && kind !== "boulder" && kind !== "crystal") continue; // pas d'arbre sur les fortes pentes
        const px = x + 0.15 + hash(x, z, 7) * 0.7;
        const pz = z + 0.15 + hash(x, z, 8) * 0.7;
        const size = def.size[0] + (def.size[1] - def.size[0]) * hash(x, z, 9);
        // rang : les petites décorations disparaissent les premières quand la caméra s'éloigne
        const rank = def.small ? 0.25 + hash(x, z, 10) * 0.75 : hash(x, z, 10) * 0.7;
        const ci = Math.floor(z / CHUNK) * this.cw + Math.floor(x / CHUNK);
        const angle = hash(x, z, 11) * Math.PI * 2;
        const tint = 0.84 + hash(x, z, 12) * 0.24;
        lists[ci].push(px, groundHeight(m, px, pz) - def.sink * size, pz, size, angle, tint, def.sway, hash(x, z, 13), KIND_INDEX[kind], rank, z * w + x);
        totals[KIND_INDEX[kind]]++;
      }
    }
    // chaque morceau trié par rang : la densité réduite est un préfixe
    this.chunks = lists.map((l) => {
      const n = l.length / F;
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => l[a * F + STRIDE] - l[b * F + STRIDE] || a - b);
      const data = new Float32Array(n * STRIDE);
      const cells = new Int32Array(n);
      const rank = new Float32Array(n);
      order.forEach((src, i) => {
        for (let k = 0; k < STRIDE; k++) data[i * STRIDE + k] = l[src * F + k];
        rank[i] = l[src * F + STRIDE];
        cells[i] = l[src * F + STRIDE + 1];
      });
      return { data, cells, rank };
    });
    return totals;
  }

  /** Suit les bâtiments de la zone vue : leurs cases (et une marge pour les grands) sont libérées des décorations. */
  private trackBuildings(f: Frame, viewRect: [number, number, number, number]): void {
    const buf = f.buf;
    let sig = 0;
    let o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) sig = (Math.imul(sig, 31) + buf[o] + Math.imul(buf[o + 2], 7)) | 0;
    if (sig === this.lastSig && f.nBuildings === this.lastCount) return;
    this.lastSig = sig;
    this.lastCount = f.nBuildings;
    const present = new Set<number>();
    let changed = false;
    o = f.buildingOff;
    for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const ref = buf[o];
      present.add(ref);
      if (this.known.has(ref)) continue;
      const kind = buf[o + 1] & 0xff;
      const dir = (buf[o + 1] >> 16) & 3;
      const def = this.data.buildings[kind];
      if (!def) continue;
      const bw = dir & 1 ? def.h : def.w;
      const bh = dir & 1 ? def.w : def.h;
      const mg = bw * bh > 1 ? 1 : 0;
      const b = { x: (buf[o + 2] & 0xffff) - mg, z: ((buf[o + 2] >>> 16) & 0xffff) - mg, w: bw + 2 * mg, h: bh + 2 * mg };
      this.known.set(ref, b);
      this.cover(b, 1);
      changed = true;
    }
    // bâtiments disparus : seulement ceux de la zone couverte par l'image
    const [x0, z0, x1, z1] = viewRect;
    for (const [ref, b] of this.known) {
      if (present.has(ref) || b.x < x0 || b.z < z0 || b.x + b.w > x1 || b.z + b.h > z1) continue;
      this.known.delete(ref);
      this.cover(b, -1);
      changed = true;
    }
    if (changed) this.coverVersion++;
  }

  private cover(b: { x: number; z: number; w: number; h: number }, d: number): void {
    const { w, h } = this.map;
    for (let z = Math.max(0, b.z); z < Math.min(h, b.z + b.h); z++) {
      for (let x = Math.max(0, b.x); x < Math.min(w, b.x + b.w); x++) {
        const i = z * w + x;
        this.covered[i] = Math.max(0, Math.min(255, this.covered[i] + d));
      }
    }
  }

  /** Mise à jour par image : visibilité, morceaux vus, densité selon la distance, bâtiments. */
  update(f: Frame | null, _camera: THREE.Camera, distance: number, strategic: boolean, viewRect: [number, number, number, number], target: THREE.Vector3, time: number): void {
    if (f && !strategic) this.trackBuildings(f, viewRect);
    const show = this.enabled && !strategic && distance < FAR;
    if (!show) {
      this.mesh.visible = false;
      this.count = 0;
      return;
    }
    this.time.value = time;
    // densité : complète de près, un quart au loin
    const k = Math.round((1 - 0.75 * Math.max(0, Math.min(1, (distance - 60) / (FAR - 70)))) * 20) / 20;
    const [x0, z0, x1, z1] = viewRect;
    const c0 = Math.max(0, Math.floor(x0 / CHUNK));
    const r0 = Math.max(0, Math.floor(z0 / CHUNK));
    const c1 = Math.min(this.cw - 1, Math.floor(x1 / CHUNK));
    const r1 = Math.min(this.ch - 1, Math.floor(z1 / CHUNK));
    const key = `${c0},${r0},${c1},${r1},${k},${this.coverVersion}`;
    if (key !== this.fillKey) {
      this.fillKey = key;
      this.fill(c0, r0, c1, r1, k, target);
    }
    this.mesh.visible = this.count > 0;
  }

  private fill(c0: number, r0: number, c1: number, r1: number, k: number, target: THREE.Vector3): void {
    // morceaux du plus proche au plus lointain : le plafond retire d'abord les décorations lointaines
    const ids: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ids.push(r * this.cw + c);
    const dist = (id: number) => Math.hypot(((id % this.cw) + 0.5) * CHUNK - target.x, (Math.floor(id / this.cw) + 0.5) * CHUNK - target.z);
    ids.sort((a, b) => dist(a) - dist(b) || a - b);
    const counts = this.counts;
    counts.fill(0);
    let n = 0;
    for (const id of ids) {
      const ch = this.chunks[id];
      const d = ch.data;
      for (let i = 0; i < ch.rank.length && n < MAX; i++) {
        if (ch.rank[i] >= k) break;
        if (this.covered[ch.cells[i]]) continue;
        const s = i * STRIDE;
        const kind = d[s + 8];
        const b = this.batches[kind];
        if (!b) continue;
        const j = counts[kind]++ * 4;
        const pos = b.pos.array as Float32Array;
        const info = b.info.array as Float32Array;
        pos[j] = d[s];
        pos[j + 1] = d[s + 1];
        pos[j + 2] = d[s + 2];
        pos[j + 3] = d[s + 3];
        info[j] = d[s + 4];
        info[j + 1] = d[s + 5];
        info[j + 2] = d[s + 6];
        info[j + 3] = d[s + 7];
        n++;
      }
      if (n >= MAX) break;
    }
    this.count = n;
    this.batches.forEach((b, i) => {
      if (!b) return;
      const c = counts[i];
      b.geo.instanceCount = c;
      b.mesh.visible = c > 0;
      if (!c) return;
      b.pos.clearUpdateRanges();
      b.info.clearUpdateRanges();
      b.pos.addUpdateRange(0, c * 4);
      b.info.addUpdateRange(0, c * 4);
      b.pos.needsUpdate = true;
      b.info.needsUpdate = true;
    });
  }
}
