// Passerelles des Transhumants (visuel seulement) : deux bâtiments du même joueur transhumant qui se touchent par
// un côté (réseau de transfert, voir docs/spec/races.md) sont reliés par une courte passerelle en métal à
// caillebotis et garde-corps, posée à cheval sur la jonction, centrée sur la partie commune des deux côtés, à
// hauteur du plancher des modules. Calculées d'après les bâtiments de la trame, refaites seulement quand ils
// changent (version des bâtiments, ou bâtiments de la zone vue que porte la trame) ; un seul maillage instancié
// (géométrie fusionnée : position, normale).
// Celles d'un ennemi suivent le brouillard comme ses bâtiments.
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Frame, GameData } from "@supreme/shared";
import { BUILDING_WORDS } from "@supreme/shared";
import { groundHeight } from "./terrain.ts";
import type { FrameCtx } from "./entities/common.ts";

/** Race des Transhumants (data::RACE_TRANSH). */
const RACE_TRANSH = 2;
/** Nombre maximal de passerelles dessinées. */
export const WALKWAYS_MAX = 4000;
/** Longueur de la passerelle en travers de la jonction, largeur, hauteur du plancher des modules (cases). */
export const WALK_LEN = 1.1;
export const WALK_WIDTH = 0.56;
export const WALK_Y = 0.4;

/** Emprise d'un bâtiment transhumant terminé (cases), et son joueur. */
export interface WalkBuilding {
  x: number;
  z: number;
  w: number;
  h: number;
  owner: number;
}

/**
 * Jonction entre deux bâtiments `a` et `b` (indices dans la liste) : centre (x, z) sur la ligne de contact, longueur
 * de la partie commune des deux côtés, et sens : `axis` 0 si la ligne de contact est parallèle à z (les bâtiments sont
 * côte à côte en x : la passerelle va selon x), 1 si elle est parallèle à x.
 */
export interface Junction {
  a: number;
  b: number;
  x: number;
  z: number;
  len: number;
  axis: 0 | 1;
}

/**
 * Jonctions entre bâtiments du même joueur qui se touchent par un côté (même partiellement) ; un contact par un coin
 * seulement ne compte pas. Chaque paire une fois, dans l'ordre des bâtiments.
 */
export function junctions(bs: readonly WalkBuilding[]): Junction[] {
  const cells = new Map<number, number>();
  const key = (x: number, z: number) => x * 65536 + z;
  bs.forEach((b, i) => {
    for (let z = b.z; z < b.z + b.h; z++) for (let x = b.x; x < b.x + b.w; x++) cells.set(key(x, z), i);
  });
  const out: Junction[] = [];
  // côté +x puis côté +z de chaque bâtiment : chaque paire n'est vue qu'une fois
  const span = new Map<number, [number, number]>();
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    for (const axis of [0, 1] as const) {
      span.clear();
      const n = axis === 0 ? b.h : b.w;
      for (let k = 0; k < n; k++) {
        const j = axis === 0 ? cells.get(key(b.x + b.w, b.z + k)) : cells.get(key(b.x + k, b.z + b.h));
        if (j === undefined || j === i || bs[j].owner !== b.owner) continue;
        const s = span.get(j);
        const t = (axis === 0 ? b.z : b.x) + k;
        if (s) s[1] = t + 1;
        else span.set(j, [t, t + 1]);
      }
      for (const [j, [lo, hi]] of span) {
        const mid = (lo + hi) / 2;
        out.push(axis === 0 ? { a: i, b: j, x: b.x + b.w, z: mid, len: hi - lo, axis } : { a: i, b: j, x: mid, z: b.z + b.h, len: hi - lo, axis });
      }
    }
  }
  return out;
}

/** Bâtiments transhumants terminés de la trame (emprise tournée selon leur sens). */
export function walkBuildings(f: Frame, data: GameData): WalkBuilding[] {
  const buf = f.buf;
  const v: WalkBuilding[] = [];
  let o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const def = data.buildings[buf[o + 1] & 0xff];
    if (!def || (def.race ?? 0) !== RACE_TRANSH || buf[o + 4] < 65536) continue;
    const dir = (buf[o + 1] >> 16) & 3;
    v.push({ x: buf[o + 2] & 0xffff, z: (buf[o + 2] >>> 16) & 0xffff, w: dir & 1 ? def.h : def.w, h: dir & 1 ? def.w : def.h, owner: (buf[o + 1] >> 8) & 0xff });
  }
  return v;
}

/** Empreinte des bâtiments d'une trame (références et cases) : change quand la zone vue en montre d'autres. */
export function frameSignature(f: Frame): number {
  const buf = f.buf;
  let h = f.nBuildings | 0;
  let o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) h = (Math.imul(h, 31) + (buf[o] ^ Math.imul(buf[o + 2], 0x9e3779b1))) | 0;
  return h;
}

/** Passerelle de longueur 1 selon x, largeur WALK_WIDTH selon z, plancher à y = 0 : caillebotis, garde-corps. */
function walkwayGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.deleteAttribute("uv");
    g.translate(x, y, z);
    parts.push(g);
  };
  const hw = WALK_WIDTH / 2;
  // longerons et caillebotis : barreaux en travers et deux lisses en long
  box(1, 0.05, 0.04, 0, -0.03, hw - 0.02);
  box(1, 0.05, 0.04, 0, -0.03, -hw + 0.02);
  for (let k = 0; k < 9; k++) box(0.035, 0.025, WALK_WIDTH - 0.06, -0.45 + k * 0.1125, 0, 0);
  box(1, 0.02, 0.025, 0, 0, hw / 3);
  box(1, 0.02, 0.025, 0, 0, -hw / 3);
  // garde-corps : poteaux, main courante et lisse intermédiaire de chaque côté
  for (const s of [1, -1]) {
    for (const x of [-0.46, 0, 0.46]) box(0.03, 0.3, 0.03, x, 0.15, s * (hw - 0.02));
    box(1, 0.03, 0.035, 0, 0.3, s * (hw - 0.02));
    box(1, 0.02, 0.02, 0, 0.16, s * (hw - 0.02));
  }
  const g = mergeGeometries(parts, false) ?? new THREE.BoxGeometry(1, 0.05, WALK_WIDTH);
  for (const p of parts) p.dispose();
  return g;
}

/** Passerelles : un maillage instancié, refait quand les bâtiments changent, filtré par le brouillard. */
export class Walkways {
  readonly mesh: THREE.InstancedMesh;
  /** version des bâtiments des passerelles calculées (-1 : aucune) */
  private version = -1;
  /** dernière trame traitée */
  private frame: Frame | null = null;
  /** matrices de toutes les passerelles (16 nombres chacune), centre et joueur de chacune */
  private mats = new Float32Array(WALKWAYS_MAX * 16);
  private at = new Float32Array(WALKWAYS_MAX * 2);
  private owners = new Uint8Array(WALKWAYS_MAX);
  private n = 0;
  /** empreinte des bâtiments de la trame des passerelles calculées */
  private sig = 0;

  constructor() {
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x8c949c, roughness: 0.42, metalness: 0.75 });
    this.mesh = new THREE.InstancedMesh(walkwayGeometry(), mat, WALKWAYS_MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  /** Recalcule les passerelles d'après les bâtiments de la trame (seulement quand ils ont changé). */
  private rebuild(f: Frame, data: GameData, map: Parameters<typeof groundHeight>[0]): void {
    const bs = walkBuildings(f, data);
    const js = junctions(bs);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(WALK_LEN, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const j of js) {
      if (n >= WALKWAYS_MAX) break;
      q.setFromAxisAngle(up, j.axis === 0 ? 0 : Math.PI / 2);
      p.set(j.x, groundHeight(map, j.x, j.z) + WALK_Y, j.z);
      m.compose(p, q, s);
      m.toArray(this.mats, n * 16);
      this.at[2 * n] = j.x;
      this.at[2 * n + 1] = j.z;
      this.owners[n] = bs[j.a].owner;
      n++;
    }
    this.n = n;
    this.version = f.buildingsVersion;
  }

  /**
   * Passe des bâtiments : passerelles de la trame (refaites si les bâtiments ont changé) ; celles d'un ennemi
   * seulement là où il est vu, comme ses bâtiments ; aucune en vue stratégique. Rien à faire entre deux trames.
   */
  update(ctx: FrameCtx, data: GameData, map: Parameters<typeof groundHeight>[0]): void {
    const { f, strategic, seen, teamOf, myTeam } = ctx;
    if (strategic) {
      this.mesh.count = 0;
      this.frame = null;
      return;
    }
    if (f === this.frame) return;
    this.frame = f;
    // la trame ne porte que les bâtiments autour de la zone vue : la liste change aussi quand la caméra bouge
    const sig = frameSignature(f);
    if (f.buildingsVersion !== this.version || sig !== this.sig) {
      this.rebuild(f, data, map);
      this.sig = sig;
    }
    const dst = this.mesh.instanceMatrix.array as Float32Array;
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      if (teamOf(this.owners[i]) !== myTeam && !seen(this.at[2 * i], this.at[2 * i + 1], 8 | 1)) continue;
      for (let c = 0; c < 16; c++) dst[k * 16 + c] = this.mats[i * 16 + c];
      k++;
    }
    this.mesh.count = k;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, Math.max(1, k) * 16);
    im.needsUpdate = true;
  }
}
