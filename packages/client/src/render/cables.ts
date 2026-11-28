// Câbles des Transhumants (affichage seulement, rien dans la simulation) : chaque module déployé est
// branché au générateur nomade le plus proche du même joueur dont la zone le couvre, sinon au poteau relais
// le plus proche qui le couvre ; chaque poteau, à son générateur ou au poteau qui le précède dans sa file
// (arbre de liaisons le plus court, porté de 13 cases comme pour la plantation). Le câble est posé au sol,
// pas tendu : courbe douce en plan (flèche de 7 à 9 % de sa longueur, côté et ondulation tirés d'un hachage
// de la paire), fin, qui épouse le relief et passe sous le bord de chaque bâtiment (pas de prise).
// Une seule géométrie fusionnée, refaite seulement quand les bâtiments connus changent.
import * as THREE from "three/webgpu";
import { attribute } from "three/tsl";
import { BClass, BUILDING_WORDS } from "@supreme/shared";
import type { Frame, GameData } from "@supreme/shared";
import { fogFactor, applyFog } from "./fog.ts";
import { groundHeight, type MapData } from "./terrain.ts";

/** Rôle d'un bâtiment des Transhumants pour les câbles. */
export const CABLE_MODULE = 0;
export const CABLE_GEN = 1;
export const CABLE_POLE = 2;

/** Bâtiment branché (cases) : emprise [x, x + w[ × [z, z + h[, rayon de zone `supply`, portée de liaison `connect`. */
export interface CableNode {
  ref: number;
  owner: number;
  role: number;
  x: number;
  z: number;
  w: number;
  h: number;
  supply: number;
  connect: number;
}

/** Portée de liaison des poteaux nomades (data.rs, `t_pole`), de centre à centre. */
const POLE_LINK = 13;

const cx = (n: CableNode) => n.x + n.w / 2;
const cz = (n: CableNode) => n.z + n.h / 2;
const d2 = (a: CableNode, b: CableNode) => (cx(a) - cx(b)) ** 2 + (cz(a) - cz(b)) ** 2;
/** La zone électrique de `src` touche-t-elle l'emprise de `n` (comme rebuild_power) ? */
const covers = (src: CableNode, n: CableNode) =>
  n.x < src.x + src.w + src.supply && n.x + n.w > src.x - src.supply && n.z < src.z + src.h + src.supply && n.z + n.h > src.z - src.supply;

/**
 * Paires [consommateur, source] (indices dans `nodes`), joueur par joueur. Poteaux : arbre de Prim à partir
 * des générateurs (à chaque pas, le poteau libre le plus proche d'un nœud déjà relié, à la portée de liaison
 * au plus) ; un poteau qu'aucune file ne relie à un générateur n'a pas de câble. Modules : le générateur le
 * plus proche dont la zone touche leur emprise, sinon le poteau relié le plus proche qui les couvre. Égalités :
 * la plus petite référence. Ordre du résultat : référence du consommateur croissante.
 */
export function cablePairs(nodes: CableNode[]): [number, number][] {
  const order = nodes.map((_, i) => i).sort((a, b) => nodes[a].ref - nodes[b].ref);
  const owners = [...new Set(order.map((i) => nodes[i].owner))].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const p of owners) {
    const mine = order.filter((i) => nodes[i].owner === p);
    const gens = mine.filter((i) => nodes[i].role === CABLE_GEN);
    if (!gens.length) continue;
    const linked = [...gens];
    const free = mine.filter((i) => nodes[i].role === CABLE_POLE);
    const poles: number[] = [];
    for (;;) {
      let best = -1, to = -1, bd = Infinity;
      for (const i of free) {
        for (const j of linked) {
          const r = Math.min(nodes[i].connect || POLE_LINK, nodes[j].connect || POLE_LINK);
          const d = d2(nodes[i], nodes[j]);
          if (d > r * r + 1e-6) continue;
          // parcours par référence croissante : à égalité, la première paire trouvée reste
          if (d < bd - 1e-9) {
            bd = d;
            best = i;
            to = j;
          }
        }
      }
      if (best < 0) break;
      out.push([best, to]);
      free.splice(free.indexOf(best), 1);
      linked.push(best);
      poles.push(best);
    }
    const nearest = (n: CableNode, among: number[]) => {
      let b = -1, bd = Infinity;
      for (const j of among) {
        if (!covers(nodes[j], n)) continue;
        const d = d2(n, nodes[j]);
        if (d < bd - 1e-9) {
          bd = d;
          b = j;
        }
      }
      return b;
    };
    for (const i of mine) {
      if (nodes[i].role !== CABLE_MODULE) continue;
      const s = nearest(nodes[i], gens);
      const t = s >= 0 ? s : nearest(nodes[i], poles);
      if (t >= 0) out.push([i, t]);
    }
  }
  return out.sort((a, b) => nodes[a[0]].ref - nodes[b[0]].ref);
}

/** Hachage stable d'une paire de références (côté, flèche, ondulation). */
export function pairHash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Le câble part de sous le bâtiment : ses bouts sont à cette distance (cases) en deçà du bord de l'emprise. */
export const END_IN = 0.15;
/** Rayon du câble, et marge au-dessus du sol (le sol est un maillage plus grossier que la hauteur lue). */
const CABLE_R = 0.02;
const CABLE_LIFT = 0.03;
/** Pas des points de la courbe (cases) ; près des bouts, plus serré (la courbe y tourne le plus vite). */
const STEP = 0.32;
const END_S = [0, 0.1, 0.25, 0.45];
/** Sous cet écart entre les deux bords, les bâtiments se touchent : pas de câble. */
const MIN_GAP = 0.35;

/** Courbe d'un câble : points en plan, hauteur au-dessus du sol (centre du câble), et ses deux bouts. */
export interface CableCurve {
  xs: number[];
  zs: number[];
  /** hauteur du centre du câble au-dessus du sol */
  ys: number[];
  /** bouts, sous le bord de chaque emprise : point au sol (x, z) et direction sortante (vers l'autre bout) */
  ends: [number, number, number, number][];
  /** longueur de la corde entre les bouts, flèche latérale (signée : + à gauche de la corde) */
  len: number;
  sag: number;
}

/** Sortie de l'emprise de `n`, depuis son centre, dans la direction (ux, uz) : point du bord. */
function exitPoint(n: CableNode, ux: number, uz: number): [number, number] {
  const hw = n.w / 2, hh = n.h / 2;
  const t = Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity, Math.abs(uz) > 1e-9 ? hh / Math.abs(uz) : Infinity);
  return [cx(n) + ux * t, cz(n) + uz * t];
}

/**
 * Courbe du câble de `a` vers `b` (hachage `seed`) : posé au sol, il part de sous `a` (juste en deçà du bord de
 * son emprise tourné vers `b`) et entre sous `b`. En plan : flèche de 7 à 9 % de la corde (sin πt) plus une ondulation de
 * moins de 0,8 % (sin 2πt ou sin 3πt), du côté tiré du hachage. Null si les bâtiments se touchent.
 */
export function cableCurve(a: CableNode, b: CableNode, seed: number): CableCurve | null {
  let ux = cx(b) - cx(a), uz = cz(b) - cz(a);
  const dl = Math.hypot(ux, uz);
  if (dl < 1e-6) return null;
  ux /= dl;
  uz /= dl;
  const [ax, az] = exitPoint(a, ux, uz);
  const [bx, bz] = exitPoint(b, -ux, -uz);
  if ((bx - ax) * ux + (bz - az) * uz < MIN_GAP) return null;
  // bouts sous les châssis, un peu en deçà des bords : le câble sort de sous le bâtiment
  const p0x = ax - ux * END_IN, p0z = az - uz * END_IN;
  const p1x = bx + ux * END_IN, p1z = bz + uz * END_IN;
  const len = (p1x - p0x) * ux + (p1z - p0z) * uz;
  const side = seed & 1 ? 1 : -1;
  const a1 = len * (0.07 + (0.02 * ((seed >>> 1) & 255)) / 255);
  const a2 = len * ((0.008 * ((seed >>> 9) & 255)) / 255);
  const k2 = 2 + ((seed >>> 17) & 1);
  const nx = -uz * side, nz = ux * side;
  // abscisses : serrées près des bouts, régulières au milieu
  const ts: number[] = [];
  if (len < 2 * END_S[END_S.length - 1] + STEP) {
    const n = Math.max(6, Math.ceil(len / 0.12));
    for (let i = 0; i <= n; i++) ts.push(i / n);
  } else {
    const end = END_S[END_S.length - 1];
    for (const s of END_S) ts.push(s / len);
    const mid = len - 2 * end;
    const n = Math.max(1, Math.ceil(mid / STEP));
    for (let i = 1; i < n; i++) ts.push((end + (mid * i) / n) / len);
    for (let i = END_S.length - 1; i >= 0; i--) ts.push(1 - END_S[i] / len);
  }
  const xs: number[] = [], zs: number[] = [], ys: number[] = [];
  let sag = 0;
  for (const t of ts) {
    const off = a1 * Math.sin(Math.PI * t) + a2 * Math.sin(k2 * Math.PI * t);
    if (Math.abs(off) > Math.abs(sag)) sag = off;
    xs.push(p0x + (p1x - p0x) * t + nx * off);
    zs.push(p0z + (p1z - p0z) * t + nz * off);
    ys.push(CABLE_R + CABLE_LIFT);
  }
  return {
    xs, zs, ys, len, sag: sag * side,
    ends: [[p0x, p0z, ux, uz], [p1x, p1z, -ux, -uz]],
  };
}

/** Côtés du tube du câble. */
const SIDES = 6;
const RUBBER = new THREE.Color(0x232427);
const RING_COS = Array.from({ length: SIDES }, (_, k) => Math.cos((k / SIDES) * Math.PI * 2));
const RING_SIN = Array.from({ length: SIDES }, (_, k) => Math.sin((k / SIDES) * Math.PI * 2));

/** Tampons de la géométrie fusionnée, alloués à la bonne taille, remplis par `pushCable`. */
interface Geo {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  idx: Uint32Array;
  /** sommets et indices écrits */
  nv: number;
  ni: number;
}

function vert(g: Geo, x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color): void {
  const o = g.nv * 3;
  g.pos[o] = x; g.pos[o + 1] = y; g.pos[o + 2] = z;
  g.nrm[o] = nx; g.nrm[o + 1] = ny; g.nrm[o + 2] = nz;
  g.col[o] = c.r; g.col[o + 1] = c.g; g.col[o + 2] = c.b;
  g.nv++;
}

/** Triangle (a, b, c), tourné vers l'extérieur (matière à une face) : l'ordre suit la normale de son premier sommet. */
function tri(g: Geo, a: number, b: number, c: number): void {
  const p = g.pos;
  const e1x = p[b * 3] - p[a * 3], e1y = p[b * 3 + 1] - p[a * 3 + 1], e1z = p[b * 3 + 2] - p[a * 3 + 2];
  const e2x = p[c * 3] - p[a * 3], e2y = p[c * 3 + 1] - p[a * 3 + 1], e2z = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const flip = nx * g.nrm[a * 3] + ny * g.nrm[a * 3 + 1] + nz * g.nrm[a * 3 + 2] < 0;
  g.idx[g.ni++] = a;
  g.idx[g.ni++] = flip ? c : b;
  g.idx[g.ni++] = flip ? b : c;
}

function pushCable(g: Geo, c: CableCurve, map: MapData): void {
  const n = c.xs.length;
  const base = g.nv;
  const py: number[] = [];
  for (let i = 0; i < n; i++) py.push(groundHeight(map, c.xs[i], c.zs[i]) + c.ys[i]);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let tx = c.xs[i1] - c.xs[i0], ty = py[i1] - py[i0], tz = c.zs[i1] - c.zs[i0];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    // repère : côté horizontal, puis « haut » perpendiculaire à la tangente
    let sx = -tz, sz = tx;
    const sl = Math.sqrt(sx * sx + sz * sz) || 1;
    sx /= sl; sz /= sl;
    const upx = -sz * ty, upy = sz * tx - sx * tz, upz = sx * ty;
    for (let k = 0; k < SIDES; k++) {
      const ca = RING_COS[k], sa = RING_SIN[k];
      const ox = sx * ca + upx * sa, oy = upy * sa, oz = sz * ca + upz * sa;
      vert(g, c.xs[i] + ox * CABLE_R, py[i] + oy * CABLE_R, c.zs[i] + oz * CABLE_R, ox, oy, oz, RUBBER);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a = base + i * SIDES + k, b = base + i * SIDES + ((k + 1) % SIDES);
      tri(g, a, a + SIDES, b);
      tri(g, b, a + SIDES, b + SIDES);
    }
  }
}

/** Relevés des bâtiments de la trame (s) ; entre deux, seul un changement de `buildingsVersion` en déclenche un. */
const SCAN = 0.25;
/** Bit de vision d'une case (vu ou exploré), comme les bâtiments ennemis de la passe des bâtiments. */
const SEEN_BITS = 8 | 1;

interface Known extends CableNode {
  miss: number;
}

/**
 * Câbles de la carte. Les bâtiments des Transhumants vus dans les trames restent connus hors de l'écran (la
 * trame ne contient que la zone vue) ; un bâtiment absent alors que sa case est à l'écran (trois relevés de
 * suite) est retiré. Un bâtiment ennemi n'est connu que là où l'équipe voit ou a exploré, comme son modèle.
 */
export class Cables {
  mesh: THREE.Mesh;
  /** triangles de la géométrie courante, durée de la dernière reconstruction (ms), nombre de reconstructions */
  triangles = 0;
  buildMs = 0;
  builds = 0;
  /** câbles affichés */
  count = 0;
  private known = new Map<number, Known>();
  private wait = 0;
  private version = -1;
  private dirty = false;
  private genLean: number;
  private map: MapData;
  private data: GameData;

  constructor(map: MapData, data: GameData) {
    this.map = map;
    this.data = data;
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
    mat.colorNode = applyFog(attribute("color", "vec3") as unknown as Parameters<typeof applyFog>[0], fogFactor());
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    // sans ombres reçues : avec, le rendu logiciel (WebGPU sous SwiftShader) perdait le périphérique 4 fois sur 6
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.mesh.visible = false;
    this.genLean = (data.mods ?? []).findIndex((m) => m.key === "gen_lean");
  }

  /**
   * Relevé des bâtiments (au plus toutes les 0,25 s, ou quand la simulation signale un changement) et
   * reconstruction si l'ensemble connu a changé. `view` : zone à l'écran ; `detailed` : pas la vue stratégique
   * (dont la trame n'a pas les poteaux) ; `mods` : améliorations de la trame (zone du générateur sobre).
   */
  update(f: Frame, dt: number, view: [number, number, number, number], detailed: boolean, enabled: boolean, myTeam: number, spectator: boolean, mods: Map<number, { mods: number[] }>): void {
    this.mesh.visible = enabled && detailed && this.count > 0;
    if (!enabled || !detailed) return;
    this.wait -= dt;
    if (this.wait > 0 && f.buildingsVersion === this.version) return;
    this.wait = SCAN;
    this.version = f.buildingsVersion;
    this.scan(f, view, myTeam, spectator, mods);
    if (this.dirty) this.rebuild();
    this.mesh.visible = this.count > 0;
  }

  private scan(f: Frame, view: [number, number, number, number], myTeam: number, spectator: boolean, mods: Map<number, { mods: number[] }>): void {
    const buf = f.buf;
    const vis = f.vis;
    const vw = f.visW;
    for (const k of this.known.values()) k.miss++;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const d = this.data.buildings[buf[o + 1] & 0xff];
      if (!d || d.race !== 2 || buf[o + 4] < 65536) continue;
      const owner = (buf[o + 1] >> 8) & 0xff;
      const x = buf[o + 2] & 0xffff;
      const z = (buf[o + 2] >>> 16) & 0xffff;
      if (!spectator && vis && (f.players[owner]?.team ?? owner) !== myTeam) {
        const vx = Math.min(vw - 1, Math.max(0, ((x + d.w / 2) / 4) | 0));
        const vz = Math.min(vw - 1, Math.max(0, ((z + d.h / 2) / 4) | 0));
        if ((vis[vz * vw + vx] & SEEN_BITS) === 0) continue;
      }
      const ref = buf[o] >>> 0;
      const role = d.cls === BClass.Power ? CABLE_GEN : d.cls === BClass.Pylon ? CABLE_POLE : CABLE_MODULE;
      const lean = role === CABLE_GEN && this.genLean >= 0 && !!mods.get(ref)?.mods.includes(this.genLean);
      const supply = d.supply + (lean ? 3 : 0);
      const k = this.known.get(ref);
      if (k) {
        k.miss = 0;
        if (k.supply !== supply) {
          k.supply = supply;
          this.dirty = true;
        }
      } else {
        this.known.set(ref, { ref, owner, role, x, z, w: d.w, h: d.h, supply, connect: d.connect, miss: 0 });
        this.dirty = true;
      }
    }
    for (const [ref, k] of this.known) {
      // absent de la trame alors qu'il devrait y être (trois relevés : une trame peut retarder sur la caméra)
      const inView = k.x > view[0] + 2 && k.x < view[2] - 2 && k.z > view[1] + 2 && k.z < view[3] - 2;
      if (k.miss > 0 && !inView) k.miss = 0;
      else if (k.miss >= 3) {
        this.known.delete(ref);
        this.dirty = true;
      }
    }
  }

  private rebuild(): void {
    const t0 = performance.now();
    this.dirty = false;
    const nodes = [...this.known.values()];
    const cables: CableCurve[] = [];
    let nv = 0, ni = 0;
    for (const [i, j] of cablePairs(nodes)) {
      const a = nodes[i], b = nodes[j];
      const c = cableCurve(a, b, pairHash(a.ref, b.ref));
      if (!c) continue;
      cables.push(c);
      nv += c.xs.length * SIDES;
      ni += (c.xs.length - 1) * SIDES * 6;
    }
    const g: Geo = { pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), col: new Float32Array(nv * 3), idx: new Uint32Array(ni), nv: 0, ni: 0 };
    for (const c of cables) pushCable(g, c, this.map);
    const old = this.mesh.geometry;
    const geo = new THREE.BufferGeometry();
    if (ni) {
      geo.setAttribute("position", new THREE.BufferAttribute(g.pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(g.nrm, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(g.col, 3));
      geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere();
    }
    this.mesh.geometry = geo;
    old.dispose();
    this.count = cables.length;
    this.triangles = ni / 3;
    this.builds++;
    this.buildMs = performance.now() - t0;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
