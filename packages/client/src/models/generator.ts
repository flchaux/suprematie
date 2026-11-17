// Générateur de modèles : assemble les pièces simples d'une description en un mesh à facettes.
// Les pièces de couleur « faction » portent un masque (attribut `mask`) : le shader les teinte
// avec la couleur du joueur. L'attribut `mat` donne la couche de texture (matière) de chaque pièce. Les pièces mobiles (pivot) forment des géométries séparées.
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import type { Model, Part, ColorName } from "../../../../assets/models/types.ts";
import { KIT } from "../../../../assets/models/kit.ts";

export const PALETTE: Record<ColorName, number> = {
  faction: 0xffffff,
  metal: 0x8a939e,
  dark: 0x3a4049,
  light: 0xc9d0d8,
  glow: 0x6ff6ff,
  amber: 0xffa531,
  hazard: 0xe0b030,
  glass: 0x27496b,
  red: 0xc84040,
  black: 0x15181c,
  /** teinte de la ressource exploitée (extracteur), fixée par instance ; couleur par défaut pour le visualiseur */
  ore: 0xd08a40,
};

/** Couche de texture de chaque couleur de pièce (voir render/textures.ts ; 5 = pas de texture). */
export const MATERIAL_LAYER: Record<ColorName, number> = { faction: 0, light: 0, metal: 1, red: 1, dark: 2, black: 2, hazard: 3, glass: 4, glow: 5, amber: 5, ore: 5 };

export const PLAYER_COLORS = [0x3b82f6, 0xef4444, 0x22c55e, 0xeab308, 0xa855f7, 0xf97316, 0x06b6d4, 0xec4899];
export const PLAYER_COLOR_NAMES = ["Bleu", "Rouge", "Vert", "Jaune", "Violet", "Orange", "Cyan", "Rose"];

export interface BuiltPivot {
  name: string;
  geometry: THREE.BufferGeometry;
  origin: THREE.Vector3;
}
export interface BuiltModel {
  body: THREE.BufferGeometry;
  pivots: BuiltPivot[];
  box: THREE.Box3;
  triangles: number;
}

const DEG = Math.PI / 180;

function wedgeGeometry(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  // Prisme : arête haute à l'arrière (-z), pente vers l'avant (+z)
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0 && p.getZ(i) > 0) p.setY(i, -sy / 2);
  }
  return g;
}

/**
 * Boîte dont toutes les arêtes sont chanfreinées (enveloppe convexe de 24 points) : 44 triangles.
 * Les facettes des chanfreins accrochent la lumière et donnent l'aspect de plaques de blindage.
 */
const bevelCache = new Map<string, THREE.BufferGeometry>();
function bevelGeometry(sx: number, sy: number, sz: number, c: number): THREE.BufferGeometry {
  const key = `${sx},${sy},${sz},${c}`;
  const hit = bevelCache.get(key);
  if (hit) return hit.clone();
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const cx = Math.min(c, hx * 0.95);
  const cy = Math.min(c, hy * 0.95);
  const cz = Math.min(c, hz * 0.95);
  const pts: THREE.Vector3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      // points des faces x, y et z, rentrés du chanfrein sur les deux autres axes
      pts.push(new THREE.Vector3(a * hx, b * (hy - cy), hz - cz), new THREE.Vector3(a * hx, b * (hy - cy), -(hz - cz)));
      pts.push(new THREE.Vector3(a * (hx - cx), b * hy, hz - cz), new THREE.Vector3(a * (hx - cx), b * hy, -(hz - cz)));
      pts.push(new THREE.Vector3(a * (hx - cx), b * (hy - cy), hz), new THREE.Vector3(a * (hx - cx), b * (hy - cy), -hz));
    }
  }
  const g = new ConvexGeometry(pts);
  bevelCache.set(key, g);
  return g.clone();
}

function shapeGeometry(part: Part): THREE.BufferGeometry {
  const sides = part.sides ?? 6;
  switch (part.shape) {
    case "cylinder": {
      const r = part.radius ?? 0.5;
      return new THREE.CylinderGeometry(part.radiusTop ?? r, r, part.height ?? 1, sides, 1);
    }
    case "cone":
      return new THREE.ConeGeometry(part.radius ?? 0.5, part.height ?? 1, sides, 1);
    case "wedge": {
      const s = part.size ?? [1, 1, 1];
      return wedgeGeometry(s[0], s[1], s[2]);
    }
    case "sphere":
      return new THREE.IcosahedronGeometry(part.radius ?? 0.5, Math.max(0, Math.min(1, part.detail ?? 0)));
    case "bevel": {
      const s = part.size ?? [1, 1, 1];
      return bevelGeometry(s[0], s[1], s[2], part.bevel ?? Math.min(s[0], s[1], s[2]) * 0.18);
    }
    case "box":
    default: {
      const s = part.size ?? [1, 1, 1];
      return new THREE.BoxGeometry(s[0], s[1], s[2]);
    }
  }
}

interface Flat {
  geo: THREE.BufferGeometry; // déjà transformée dans le repère du modèle
  color: ColorName;
  pivot?: string;
  parent?: string;
  pivotPos?: THREE.Vector3;
  /** volume plein de la pièce (occlusion ambiante) */
  vol?: Vol;
}

/**
 * Volume approché d'une pièce pour le calcul d'occlusion : boîte (forme 0), cylindre ou cône
 * d'axe y (forme 1) ou sphère (forme 2), dans son repère local (`inv` : modèle -> pièce).
 */
interface Vol {
  inv: THREE.Matrix4;
  hx: number;
  hy: number;
  hz: number;
  round: 0 | 1 | 2;
  box: THREE.Box3;
}

function partVolume(part: Part, m: THREE.Matrix4): Vol {
  let hx = 0.5, hy = 0.5, hz = 0.5;
  let round: 0 | 1 | 2 = 0;
  if (part.shape === "cylinder" || part.shape === "cone") {
    const r = Math.max(part.radius ?? 0.5, part.radiusTop ?? 0);
    hx = hz = r;
    hy = (part.height ?? 1) / 2;
    round = 1;
  } else if (part.shape === "sphere") {
    hx = hy = hz = part.radius ?? 0.5;
    round = 2;
  } else {
    const s = part.size ?? [1, 1, 1];
    hx = s[0] / 2;
    hy = s[1] / 2;
    hz = s[2] / 2;
  }
  const box = new THREE.Box3(new THREE.Vector3(-hx, -hy, -hz), new THREE.Vector3(hx, hy, hz)).applyMatrix4(m);
  return { inv: m.clone().invert(), hx, hy, hz, round, box };
}

const tmpP = new THREE.Vector3();
function insideVol(v: Vol, p: THREE.Vector3): boolean {
  if (!v.box.containsPoint(p)) return false;
  const q = tmpP.copy(p).applyMatrix4(v.inv);
  if (v.round === 2) return q.lengthSq() <= v.hx * v.hx;
  if (Math.abs(q.y) > v.hy) return false;
  if (v.round === 1) return q.x * q.x + q.z * q.z <= v.hx * v.hx;
  return Math.abs(q.x) <= v.hx && Math.abs(q.z) <= v.hz;
}

/** Directions de l'hémisphère (repère local, z = normale), réparties en spirale et pondérées vers la normale. */
const AO_DIRS: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const z = Math.sqrt(1 - (i + 0.5) / n); // cosinus : plus de directions près de la normale
    const r = Math.sqrt(1 - z * z);
    const a = i * 2.399963;
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return out;
})();
/** distances de test (unités du modèle) et poids : un obstacle proche assombrit davantage */
const AO_STEPS: [number, number][] = [[0.15, 1], [0.5, 0.6]];

/**
 * Occlusion ambiante cuite dans les sommets (attribut `ao`, 1 = à découvert) : depuis chaque sommet,
 * des directions de l'hémisphère de la face testent si elles rencontrent une autre pièce du modèle ou le
 * sol (y < 0). Calculée une fois au chargement, sans coût au rendu ; les creux, jointures et bas de
 * caisse s'assombrissent. Grille de répartition des volumes pour limiter les tests.
 */
function bakeAO(geos: { g: THREE.BufferGeometry; self: number }[], vols: (Vol | undefined)[], bounds: THREE.Box3): void {
  const N = 10;
  const size = bounds.getSize(new THREE.Vector3()).addScalar(1.6);
  const min = bounds.min.clone().subScalar(0.8);
  const cell = (v: number, k: 0 | 1 | 2) => Math.max(0, Math.min(N - 1, Math.floor(((v - min.getComponent(k)) / size.getComponent(k)) * N)));
  const grid: number[][] = Array.from({ length: N * N * N }, () => []);
  vols.forEach((v, i) => {
    if (!v) return;
    for (let x = cell(v.box.min.x, 0); x <= cell(v.box.max.x, 0); x++)
      for (let y = cell(v.box.min.y, 1); y <= cell(v.box.max.y, 1); y++)
        for (let z = cell(v.box.min.z, 2); z <= cell(v.box.max.z, 2); z++) grid[(x * N + y) * N + z].push(i);
  });
  const occluded = (p: THREE.Vector3, self: number): boolean => {
    if (p.y < 0) return true;
    if (p.x < min.x || p.y < min.y || p.z < min.z || p.x > min.x + size.x || p.y > min.y + size.y || p.z > min.z + size.z) return false;
    for (const i of grid[(cell(p.x, 0) * N + cell(p.y, 1)) * N + cell(p.z, 2)]) if (i !== self && insideVol(vols[i]!, p)) return true;
    return false;
  };
  const t = new THREE.Vector3();
  const b = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  const a = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const { g, self } of geos) {
    const pos = g.getAttribute("position");
    const ao = new Float32Array(pos.count).fill(1);
    for (let i = 0; i + 2 < pos.count; i += 3) {
      // normale de la face
      a.fromBufferAttribute(pos, i);
      e1.fromBufferAttribute(pos, i + 1).sub(a);
      e2.fromBufferAttribute(pos, i + 2).sub(a);
      nrm.crossVectors(e1, e2);
      if (nrm.lengthSq() < 1e-12) continue;
      nrm.normalize();
      t.set(Math.abs(nrm.y) < 0.9 ? 0 : 1, Math.abs(nrm.y) < 0.9 ? 1 : 0, 0).cross(nrm).normalize();
      b.crossVectors(nrm, t);
      for (let k = 0; k < 3; k++) {
        const o = new THREE.Vector3().fromBufferAttribute(pos, i + k).addScaledVector(nrm, 0.01);
        let occ = 0;
        for (const dir of AO_DIRS) {
          d.set(0, 0, 0).addScaledVector(t, dir.x).addScaledVector(b, dir.y).addScaledVector(nrm, dir.z);
          for (const [dist, w] of AO_STEPS) {
            p.copy(o).addScaledVector(d, dist);
            if (occluded(p, self)) {
              occ += w;
              break;
            }
          }
        }
        // occ / directions : part pondérée des directions bouchées (1 par direction au plus)
        ao[i + k] = Math.max(0.3, 1 - 0.85 * (occ / AO_DIRS.length));
      }
    }
    g.setAttribute("ao", new THREE.BufferAttribute(ao, 1));
  }
}

/** Symétrie par rapport au plan x = 0 (copie `mirror`). */
const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

/**
 * Matrice d'une pièce dans le repère de son parent. La copie `mirror` est une vraie réflexion :
 * les sous-ensembles du kit (ailes, pattes…) sont donc eux aussi réfléchis.
 */
function partMatrix(part: Part, mirror: boolean): THREE.Matrix4 {
  const pos = part.pos ?? [0, 0, 0];
  const rot = part.rot ?? [0, 0, 0];
  const sc = part.scale ?? 1;
  const s = typeof sc === "number" ? [sc, sc, sc] : sc;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, "XYZ"));
  m.compose(new THREE.Vector3(pos[0], pos[1], pos[2]), q, new THREE.Vector3(s[0], s[1], s[2]));
  return mirror ? m.premultiply(MIRROR_X) : m;
}

function flatten(parts: Part[], parentMatrix: THREE.Matrix4, out: Flat[], inherit: { pivot?: string; parent?: string; color?: ColorName }, depth = 0): void {
  if (depth > 4) return;
  for (const part of parts) {
    const variants = part.mirror ? [false, true] : [false];
    for (const mirror of variants) {
      const m = new THREE.Matrix4().multiplyMatrices(parentMatrix, partMatrix(part, mirror));
      const pivot = part.pivot ?? inherit.pivot;
      const parent = part.parent ?? inherit.parent;
      if (part.use) {
        const sub = KIT[part.use];
        if (!sub) continue;
        flatten(sub, m, out, { pivot, parent, color: part.color ?? inherit.color }, depth + 1);
        // la position du pivot d'un sous-ensemble est son origine
        if (part.pivot && !mirror) {
          out.push({ geo: new THREE.BufferGeometry(), color: "metal", pivot: part.pivot, pivotPos: new THREE.Vector3().setFromMatrixPosition(m) });
        }
        continue;
      }
      let g = shapeGeometry(part);
      g.applyMatrix4(m);
      if (g.index) g = g.toNonIndexed();
      if (m.determinant() < 0) {
        // une réflexion (nombre impair de symétries) inverse l'orientation des faces : on échange deux sommets par triangle
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i += 3) {
          const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
          p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
          p.setXYZ(i + 2, x, y, z);
        }
      }
      const f: Flat = { geo: g, color: inherit.color && !part.color ? inherit.color : part.color ?? inherit.color ?? "metal", pivot, parent, vol: partVolume(part, m) };
      if (part.pivot && !mirror) f.pivotPos = new THREE.Vector3().setFromMatrixPosition(m);
      out.push(f);
    }
  }
}

function colorize(g: THREE.BufferGeometry, color: ColorName): THREE.BufferGeometry {
  let ng = g.index ? g.toNonIndexed() : g;
  ng = new THREE.BufferGeometry().setAttribute("position", ng.getAttribute("position"));
  ng.computeVertexNormals();
  const n = ng.getAttribute("position").count;
  const c = new THREE.Color(PALETTE[color]);
  const col = new Float32Array(n * 3);
  const mask = new Float32Array(n);
  const mat = new Float32Array(n).fill(MATERIAL_LAYER[color] ?? 1);
  const isFaction = color === "faction" ? 1 : 0;
  const glow = color === "glow" || color === "amber" ? 1 : 0;
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    mask[i] = color === "ore" ? 4 : isFaction + glow * 2;
  }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
  ng.setAttribute("mask", new THREE.BufferAttribute(mask, 1));
  ng.setAttribute("mat", new THREE.BufferAttribute(mat, 1));
  return ng;
}

function emptyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute("mask", new THREE.BufferAttribute(new Float32Array(3), 1));
  g.setAttribute("mat", new THREE.BufferAttribute(new Float32Array(3), 1));
  g.setAttribute("ao", new THREE.BufferAttribute(new Float32Array(3).fill(1), 1));
  return g;
}

export function buildModel(model: Model): BuiltModel {
  const flats: Flat[] = [];
  flatten(model.parts, new THREE.Matrix4(), flats, {});
  const pivotOrigins = new Map<string, THREE.Vector3>();
  for (const f of flats) if (f.pivotPos && f.pivot && !pivotOrigins.has(f.pivot)) pivotOrigins.set(f.pivot, f.pivotPos);
  const bodyParts: THREE.BufferGeometry[] = [];
  const pivotParts = new Map<string, THREE.BufferGeometry[]>();
  const box = new THREE.Box3();
  let triangles = 0;
  // géométries colorées dans le repère du modèle, puis occlusion ambiante (avant le recentrage des pivots)
  const colored: { g: THREE.BufferGeometry; self: number; f: Flat }[] = [];
  flats.forEach((f, i) => {
    if (!f.geo.getAttribute("position")) return;
    const g = colorize(f.geo, f.color);
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
    colored.push({ g, self: i, f });
  });
  if (!box.isEmpty()) bakeAO(colored, flats.map((f) => f.vol), box);
  for (const { g, f } of colored) {
    triangles += g.getAttribute("position").count / 3;
    const key = f.pivot ?? f.parent;
    if (key && pivotOrigins.has(key)) {
      const o = pivotOrigins.get(key)!;
      g.translate(-o.x, -o.y, -o.z);
      if (!pivotParts.has(key)) pivotParts.set(key, []);
      pivotParts.get(key)!.push(g);
    } else {
      bodyParts.push(g);
    }
  }
  const body = bodyParts.length ? mergeGeometries(bodyParts, false) ?? emptyGeometry() : emptyGeometry();
  const pivots: BuiltPivot[] = [];
  for (const [name, geos] of pivotParts) {
    pivots.push({ name, geometry: mergeGeometries(geos, false) ?? emptyGeometry(), origin: pivotOrigins.get(name)! });
  }
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return { body, pivots, box, triangles };
}

/** Modèle de secours : une boîte aux couleurs du joueur. */
/** Part de l'emprise couverte par un bâtiment de plusieurs cases (marge pour distinguer les voisins). */
export const BUILDING_FILL = 0.94;

/**
 * Échelle d'un modèle de bâtiment de `w` cases dont la boîte mesure `sx` x `sz` (unités du modèle).
 * Plusieurs cases : le modèle est ajusté à l'emprise (moins une marge). Une case : les modèles sont
 * dessinés en unités de case et gardent leur taille (un bras fin reste fin), réduits seulement s'ils
 * dépassent la case.
 */
export function buildingScale(w: number, sx: number, sz: number): number {
  const m = Math.max(sx, sz, 0.01);
  if (w <= 1) return 0.98 / Math.max(1, m);
  return (w * BUILDING_FILL) / m;
}

export function fallbackModel(height = 0.6): Model {
  return {
    parts: [
      { shape: "box", size: [1, height, 1], pos: [0, height / 2, 0], color: "faction" },
      { shape: "wedge", size: [0.6, 0.2, 0.4], pos: [0, height + 0.1, 0.2], color: "metal" },
    ],
  };
}
