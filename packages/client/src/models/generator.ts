// Générateur de modèles : assemble les pièces simples d'une description en un mesh à facettes.
// Les pièces de couleur « faction » portent un masque (attribut `mask`) : le shader les teinte
// avec la couleur du joueur. L'attribut `mat` donne la couche de texture (matière) de chaque pièce. Les pièces mobiles (pivot) forment des géométries séparées.
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Model, Part, ColorName } from "../../../../assets/models/types.ts";
import { KIT } from "../../../../assets/models/kit.ts";

export const PALETTE: Record<ColorName, number> = {
  faction: 0xffffff,
  metal: 0x8a939e,
  dark: 0x3a4049,
  light: 0xc9d0d8,
  glow: 0x6ff6ff,
  hazard: 0xe0b030,
  glass: 0x27496b,
  red: 0xc84040,
  black: 0x15181c,
};

/** Couche de texture de chaque couleur de pièce (voir render/textures.ts ; 5 = pas de texture). */
export const MATERIAL_LAYER: Record<ColorName, number> = { faction: 0, light: 0, metal: 1, red: 1, dark: 2, black: 2, hazard: 3, glass: 4, glow: 5 };

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
      return new THREE.IcosahedronGeometry(part.radius ?? 0.5, 0);
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
}

function partMatrix(part: Part, mirror: boolean): THREE.Matrix4 {
  const pos = part.pos ?? [0, 0, 0];
  const rot = part.rot ?? [0, 0, 0];
  const sc = part.scale ?? 1;
  const s = typeof sc === "number" ? [sc, sc, sc] : sc;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * DEG, (mirror ? -rot[1] : rot[1]) * DEG, (mirror ? -rot[2] : rot[2]) * DEG, "XYZ"));
  m.compose(new THREE.Vector3(mirror ? -pos[0] : pos[0], pos[1], pos[2]), q, new THREE.Vector3(s[0], s[1], s[2]));
  return m;
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
      if (mirror) {
        // la symétrie inverse l'orientation des faces : on échange deux sommets par triangle
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i += 3) {
          const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
          p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
          p.setXYZ(i + 2, x, y, z);
        }
      }
      const f: Flat = { geo: g, color: inherit.color && !part.color ? inherit.color : part.color ?? inherit.color ?? "metal", pivot, parent };
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
  const glow = color === "glow" ? 1 : 0;
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    mask[i] = isFaction + glow * 2;
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
  for (const f of flats) {
    if (!f.geo.getAttribute("position")) continue;
    const g = colorize(f.geo, f.color);
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
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
export function fallbackModel(height = 0.6): Model {
  return {
    parts: [
      { shape: "box", size: [1, height, 1], pos: [0, height / 2, 0], color: "faction" },
      { shape: "wedge", size: [0.6, 0.2, 0.4], pos: [0, height + 0.1, 0.2], color: "metal" },
    ],
  };
}
