// Petites décorations du sol (herbes, buissons, arbres, rochers, débris, cristaux…) : sprites générés
// (tools/sprites/, DECOR) réunis dans un atlas, affichés en panneaux face à la caméra, tous dans un
// seul appel de dessin instancié. Placement déterministe tiré de la carte (zones d'altitude, pente,
// rives), jamais dans l'eau ni sur les gisements ; seuls les morceaux de carte vus sont envoyés à la
// carte graphique, moins denses quand la caméra s'éloigne. Masquées en vue stratégique, sous le
// brouillard non exploré et sous les bâtiments (connus par les images de la simulation).
import * as THREE from "three/webgpu";
import { attribute, positionGeometry, uniform, vec2, vec3, float, sin, mod, floor, dot, mix, smoothstep, texture, transformNormalToView } from "three/tsl";
import type { Frame, GameData } from "@supreme/shared";
import { BUILDING_WORDS } from "@supreme/shared";
import { fogFactor, applyFog } from "./fog.ts";
import { groundHeight, groundChain, rockWeight, type MapData } from "./terrain.ts";

const atlasUrl = Object.values(import.meta.glob("../assets/decor/atlas.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>)[0];

/** Cases de l'atlas : ordre de DECOR dans tools/sprites/manifest.mjs. */
const KINDS = {
  grass_tuft: { size: [0.55, 0.8], sway: 1, small: true },
  bush: { size: [0.8, 1.1], sway: 0.4, small: false },
  flowers: { size: [0.5, 0.7], sway: 0.8, small: true },
  conifer: { size: [1.7, 2.4], sway: 0.15, small: false },
  stump: { size: [0.55, 0.75], sway: 0, small: true },
  dead_tree: { size: [1.4, 2.0], sway: 0.1, small: false },
  dry_shrub: { size: [0.6, 0.9], sway: 0.6, small: true },
  rocks: { size: [0.55, 0.85], sway: 0, small: true },
  boulder: { size: [0.9, 1.4], sway: 0, small: false },
  reeds: { size: [0.8, 1.1], sway: 1, small: false },
  metal_debris: { size: [0.8, 1.2], sway: 0, small: false },
  crystal: { size: [0.7, 1.0], sway: 0, small: false },
  snow_pine: { size: [1.6, 2.2], sway: 0.1, small: false },
  ice_rock: { size: [0.7, 1.0], sway: 0, small: false },
} as const;
type Kind = keyof typeof KINDS;
const KIND_KEYS = Object.keys(KINDS) as Kind[];
const KIND_INDEX = Object.fromEntries(KIND_KEYS.map((k, i) => [k, i])) as Record<Kind, number>;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 4;

/** Zones : densité (décorations par case) et poids des sortes. */
interface Zone { density: number; kinds: [Kind, number][] }
const SHORE: Zone = { density: 0.14, kinds: [["reeds", 5], ["grass_tuft", 2], ["rocks", 1]] };
const SAND: Zone = { density: 0.04, kinds: [["dry_shrub", 2], ["rocks", 2], ["boulder", 0.5], ["metal_debris", 0.6]] };
const GRASS: Zone = { density: 0.19, kinds: [["grass_tuft", 6], ["bush", 3], ["flowers", 2.5], ["conifer", 1.4], ["stump", 0.5], ["rocks", 1], ["boulder", 0.4], ["metal_debris", 0.25], ["crystal", 0.08]] };
const DRY: Zone = { density: 0.13, kinds: [["dry_shrub", 4], ["dead_tree", 0.9], ["rocks", 2], ["boulder", 1], ["grass_tuft", 1.5], ["metal_debris", 0.5], ["stump", 0.3]] };
const SNOW: Zone = { density: 0.07, kinds: [["snow_pine", 2], ["ice_rock", 3], ["rocks", 0.4], ["crystal", 0.5]] };
const ROCKY: Zone = { density: 0.08, kinds: [["boulder", 2], ["rocks", 3], ["crystal", 0.35], ["dead_tree", 0.3]] };
const CHAIN_ZONES = [SAND, SAND, GRASS, DRY, SNOW];

/** Valeurs par décoration : x, y, z, taille, case de l'atlas, miroir, teinte, balancement. */
const STRIDE = 8;
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

let atlas: THREE.Texture | null = null;
/** Atlas des sprites, chargé une fois (partagé entre les parties). */
function decorAtlas(): THREE.Texture {
  if (!atlas) {
    atlas = new THREE.TextureLoader().load(atlasUrl);
    atlas.flipY = false;
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = 4;
  }
  return atlas;
}

interface Chunk { data: Float32Array; cells: Int32Array; rank: Float32Array }

export class Decorations {
  mesh: THREE.Mesh;
  /** nombre de décorations affichées */
  count = 0;
  enabled = true;
  private chunks: Chunk[] = [];
  private cw: number;
  private ch: number;
  private pos: THREE.InstancedBufferAttribute;
  private info: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private camRight = uniform(new THREE.Vector3(1, 0, 0));
  private camUp = uniform(new THREE.Vector3(0, 1, 0));
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
    this.place();
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute("position", quad.getAttribute("position"));
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.info.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("dpos", this.pos);
    geo.setAttribute("dinfo", this.info);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, this.material());
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  /** Placement déterministe : une décoration au plus par case, regroupées par morceaux de carte. */
  private place(): void {
    const m = this.map;
    const { w, h, heights, waterLevel } = m;
    const blocked = new Uint8Array(w * h);
    const block = (x0: number, z0: number, x1: number, z1: number) => {
      for (let z = Math.max(0, z0); z <= Math.min(h - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) blocked[z * w + x] = 1;
    };
    for (const s of m.spots) block(s.x - 1, s.y - 1, s.x + 2, s.y + 2);
    for (const [sx, sy] of m.starts) block(sx - 3, sy - 3, sx + 3, sy + 3);
    const hAt = (x: number, z: number) => heights[Math.min(h - 1, Math.max(0, z)) * w + Math.min(w - 1, Math.max(0, x))];
    const lists: number[][] = Array.from({ length: this.cw * this.ch }, () => []);
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
        lists[ci].push(px, groundHeight(m, px, pz) - 0.04 * size, pz, size, KIND_INDEX[kind], hash(x, z, 11) < 0.5 ? -1 : 1, 0.86 + hash(x, z, 12) * 0.2, def.sway, rank, z * w + x);
      }
    }
    // chaque morceau trié par rang : la densité réduite est un préfixe
    this.chunks = lists.map((l) => {
      const n = l.length / 10;
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => l[a * 10 + 8] - l[b * 10 + 8] || a - b);
      const data = new Float32Array(n * STRIDE);
      const cells = new Int32Array(n);
      const rank = new Float32Array(n);
      order.forEach((src, i) => {
        for (let k = 0; k < STRIDE; k++) data[i * STRIDE + k] = l[src * 10 + k];
        rank[i] = l[src * 10 + 8];
        cells[i] = l[src * 10 + 9];
      });
      return { data, cells, rank };
    });
  }

  private material(): THREE.MeshStandardNodeMaterial {
    const tex = decorAtlas();
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    const p = attribute("dpos", "vec4");
    const info = attribute("dinfo", "vec4");
    const q = positionGeometry;
    const size = p.w;
    // balancement au vent : le haut des plantes oscille
    const sway = sin(this.time.mul(1.6).add(p.x.mul(0.9)).add(p.z.mul(0.55))).mul(info.w).mul(q.y.mul(q.y)).mul(0.07);
    mat.positionNode = p.xyz.add(this.camRight.mul(q.x.add(sway).mul(size))).add(this.camUp.mul(q.y.mul(size)));
    const kind = info.x;
    const col = mod(kind, float(ATLAS_COLS));
    const row = floor(kind.div(ATLAS_COLS));
    const u = q.x.mul(info.y).add(0.5).mul(0.98).add(0.01);
    const v = float(1).sub(q.y).mul(0.98).add(0.01);
    const s = texture(tex, vec2(col.add(u).div(ATLAS_COLS), row.add(v).div(ATLAS_ROWS)));
    // couleurs un peu désaturées : le sol et les décorations restent moins contrastés que les unités
    const l = dot(s.rgb, vec3(0.3, 0.55, 0.15));
    const c = mix(vec3(l, l, l), s.rgb, 0.75).mul(info.z);
    const fog = fogFactor();
    mat.colorNode = applyFog(c, fog);
    // éclairées comme le sol plat qui les entoure
    mat.normalNode = transformNormalToView(vec3(0, 1, 0));
    // cristaux : léger éclat propre
    mat.emissiveNode = c.mul(kind.equal(float(KIND_INDEX.crystal)).select(float(0.35), float(0))).mul(fog);
    // invisibles sous le brouillard non exploré
    mat.opacityNode = s.a.mul(smoothstep(0.22, 0.36, fog));
    mat.alphaTest = 0.5;
    return mat;
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
  update(f: Frame | null, camera: THREE.Camera, distance: number, strategic: boolean, viewRect: [number, number, number, number], target: THREE.Vector3, time: number): void {
    if (f && !strategic) this.trackBuildings(f, viewRect);
    const show = this.enabled && !strategic && distance < FAR;
    if (!show) {
      this.mesh.visible = false;
      this.count = 0;
      return;
    }
    this.time.value = time;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    this.camRight.value.set(e[0], e[1], e[2]).normalize();
    this.camUp.value.set(e[4], e[5], e[6]).normalize();
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
    const pos = this.pos.array as Float32Array;
    const info = this.info.array as Float32Array;
    let n = 0;
    for (const id of ids) {
      const ch = this.chunks[id];
      const d = ch.data;
      for (let i = 0; i < ch.rank.length && n < MAX; i++) {
        if (ch.rank[i] >= k) break;
        if (this.covered[ch.cells[i]]) continue;
        const s = i * STRIDE;
        pos[n * 4] = d[s];
        pos[n * 4 + 1] = d[s + 1];
        pos[n * 4 + 2] = d[s + 2];
        pos[n * 4 + 3] = d[s + 3];
        info[n * 4] = d[s + 4];
        info[n * 4 + 1] = d[s + 5];
        info[n * 4 + 2] = d[s + 6];
        info[n * 4 + 3] = d[s + 7];
        n++;
      }
      if (n >= MAX) break;
    }
    this.count = n;
    this.geo.instanceCount = n;
    this.pos.clearUpdateRanges();
    this.info.clearUpdateRanges();
    this.pos.addUpdateRange(0, n * 4);
    this.info.addUpdateRange(0, n * 4);
    this.pos.needsUpdate = true;
    this.info.needsUpdate = true;
  }
}
