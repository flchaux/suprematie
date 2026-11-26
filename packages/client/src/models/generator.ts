// Générateur de modèles : assemble les pièces simples d'une description en un mesh à facettes.
// Les pièces de couleur « faction » portent un masque (attribut `mask`) : le shader les teinte
// avec la couleur du joueur. L'attribut `mat` donne la couche de texture (matière) de chaque pièce. Les pièces mobiles (pivot) forment des géométries séparées.
import * as THREE from "three/webgpu";
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
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
  // décorations du sol
  leaf: 0x5f8a3a,
  leaf_dark: 0x335c2e,
  wood: 0x6e4c30,
  dry: 0xb09458,
  rock: 0x8c8780,
  snow: 0xedf2f6,
  ice: 0x9ccbe0,
  crystal: 0x4fdcf0,
  flower: 0xe8c43a,
  rust: 0x8c4d2c,
  copper: 0xb8703a,
  steel: 0xb4bcc6,
  rubber: 0x26282b,
  concrete: 0x9a968c,
  acid: 0x9dff3a,
};

/**
 * Matière de chaque couleur de pièce (voir render/textures.ts et render/materials.ts) : 0 blindage, 1 métal,
 * 2 métal sombre, 3 danger, 4 verre, 5 lumineux (sans texture), 6 caoutchouc, 7 cuivre, 8 béton. Les couches
 * 9 à 12 (chitine, écorce, chair, os) et 13 à 20 (matières de récupération) ne viennent que de SKIN_LAYER.
 */
export const MATERIAL_LAYER: Record<ColorName, number> = { faction: 0, light: 0, metal: 1, red: 1, steel: 1, dark: 2, black: 2, hazard: 3, glass: 4, glow: 5, amber: 5, ore: 5,
  leaf: 5, leaf_dark: 5, wood: 5, dry: 5, rock: 5, snow: 5, ice: 5, crystal: 5, flower: 5, rust: 5, rubber: 6, copper: 7, concrete: 8, acid: 5 };

/** Nombre de couches de matière : longueur des tables par couche (LAYER_CELL de render/textures.ts, LAYER_METAL et LAYER_ROUGH de render/materials.ts). */
export const LAYER_COUNT = 21;

/**
 * Matières des modèles marqués `skin` (assets/models/types.ts) : pour eux seulement, les couleurs citées
 * prennent cette couche à la place de celle de MATERIAL_LAYER ; les autres (pièces lumineuses) gardent la
 * leur. Un modèle sans `skin` ne lit jamais cette table : son maillage est le même qu'avant elle.
 * Souche : 9 chitine (plaques noires ou à la couleur du joueur), 10 écorce (racines, tertres), 11 chair
 * (chairs, feuilles, membranes), 12 os (crocs, griffes, côtes, épines).
 * Transhumants : 13 plaques rapiécées, 14 acier usé, 15 tôle grasse, 16 peinture écaillée (couleur du joueur, panneaux
 * clairs, rouges et de danger), 17 rouille, 18 bâche, 19 planches, 20 cuivre martelé.
 */
export const SKIN_LAYER: Record<NonNullable<Model["skin"]>, Partial<Record<ColorName, number>>> = {
  souche: { faction: 9, black: 9, wood: 10, rust: 11, leaf_dark: 11, leaf: 11, flower: 11, rubber: 11, dry: 12 },
  nomade: { metal: 13, steel: 14, dark: 15, black: 15, faction: 16, light: 16, red: 16, hazard: 16, rust: 17, dry: 18, snow: 18, wood: 19, copper: 20 },
};

export const PLAYER_COLORS = [0x3b82f6, 0xef4444, 0x22c55e, 0xeab308, 0xa855f7, 0xf97316, 0x06b6d4, 0xec4899];
export const PLAYER_COLOR_NAMES = ["Bleu", "Rouge", "Vert", "Jaune", "Violet", "Orange", "Cyan", "Rose"];

export interface BuiltPivot {
  name: string;
  geometry: THREE.BufferGeometry;
  /** sans les pièces fines (caméra lointaine) ; absent si le modèle n'en a pas */
  geometryLo?: THREE.BufferGeometry;
  origin: THREE.Vector3;
}
export interface BuiltModel {
  body: THREE.BufferGeometry;
  /** jeu de matières du modèle (les trappes ajoutées après coup le reprennent) */
  skin?: Model["skin"];
  /** améliorations qui rehaussent l'unité (clé, hauteur en unités du modèle ; absent : aucune) */
  lift?: [string, number][];
  /** corps sans les pièces fines (niveau de détail réduit) ; absent si le modèle n'a pas de pièce fine */
  bodyLo?: THREE.BufferGeometry;
  pivots: BuiltPivot[];
  box: THREE.Box3;
  triangles: number;
  /** triangles sans les pièces fines */
  trianglesLo: number;
  /** nombre de variantes du modèle (pièces « si:vN », voir variantOf) ; 1 : une seule allure */
  variants: number;
  /**
   * Bâtiments à trappes (voir withHatches) : pour chaque côté du modèle (+x, +z, -x, -z) et chaque case
   * de bord (`w` par côté), retrait de la paroi depuis la face nominale (cases ; NaN : pas de trappe),
   * puis (4 × `w` valeurs) la hauteur du haut de cette paroi (cases ; NaN si rien).
   */
  hatches?: Float32Array;
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

/** Profil (rayon, hauteur) tourné autour de y ; `arc` en degrés. */
function latheGeometry(profile: [number, number][], sides: number, arc = 360): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  if (pts.length < 2) pts.push(new THREE.Vector2(0.5, 0), new THREE.Vector2(0.5, 1));
  return new THREE.LatheGeometry(pts, sides, 0, Math.min(360, arc) * DEG);
}

/** Contour (x, y) extrudé sur `depth` le long de z, centré ; chanfrein `bevel` sur les arêtes des deux faces. */
function extrudeGeometry(profile: [number, number][], depth: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const b = Math.max(0, Math.min(bevel, depth * 0.45));
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -(depth - 2 * b) / 2);
  return g;
}

/**
 * Tuyau de section circulaire (`sides` côtés) le long d'un tracé polygonal, coudes arrondis de rayon `bend`,
 * extrémités fermées. Repères transportés parallèlement : la section ne vrille pas dans les coudes.
 */
function tubeGeometry(path: [number, number, number][], radius: number, sides: number, bend: number): THREE.BufferGeometry {
  const P = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  if (P.length < 2) P.push(new THREE.Vector3(0, 1, 0));
  const pts: THREE.Vector3[] = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const d1 = P[i].clone().sub(P[i - 1]);
    const d2 = P[i + 1].clone().sub(P[i]);
    const l1 = d1.length();
    const l2 = d2.length();
    d1.normalize();
    d2.normalize();
    const r = Math.min(bend, l1 * 0.45, l2 * 0.45);
    if (d1.dot(d2) > 0.999 || r <= 0) {
      pts.push(P[i]);
      continue;
    }
    // coude : courbe de Bézier quadratique entre les points d'entrée et de sortie
    const a = P[i].clone().addScaledVector(d1, -r);
    const c = P[i].clone().addScaledVector(d2, r);
    const k = 3;
    for (let j = 0; j <= k; j++) {
      const t = j / k;
      pts.push(a.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(P[i], 2 * t * (1 - t)).addScaledVector(c, t * t));
    }
  }
  pts.push(P[P.length - 1]);
  const n = pts.length;
  const tang = pts.map((_, i) => pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize());
  const nrm: THREE.Vector3[] = [];
  const up = Math.abs(tang[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  nrm.push(new THREE.Vector3().crossVectors(tang[0], up).normalize());
  for (let i = 1; i < n; i++) {
    const v = nrm[i - 1].clone().addScaledVector(tang[i], -nrm[i - 1].dot(tang[i]));
    nrm.push(v.lengthSq() > 1e-8 ? v.normalize() : nrm[i - 1].clone());
  }
  const ring = (i: number, s: number) => {
    const a = (s / sides) * Math.PI * 2;
    const b = new THREE.Vector3().crossVectors(tang[i], nrm[i]);
    return pts[i].clone().addScaledVector(nrm[i], Math.cos(a) * radius).addScaledVector(b, Math.sin(a) * radius);
  };
  const out: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i + 1 < n; i++) {
    for (let s = 0; s < sides; s++) {
      const a = ring(i, s), b = ring(i, s + 1), c = ring(i + 1, s + 1), d = ring(i + 1, s);
      tri(a, c, b);
      tri(a, d, c);
    }
  }
  for (let s = 1; s + 1 < sides; s++) {
    tri(ring(0, 0), ring(0, s), ring(0, s + 1));
    tri(ring(n - 1, 0), ring(n - 1, s + 1), ring(n - 1, s));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return g;
}

/**
 * Pièce pour le niveau de détail réduit : formes rondes à moitié moins de côtés (au moins 6, 4 pour un
 * tuyau), cylindres et profils extrudés sans chanfrein.
 */
function coarser(part: Part): Part {
  switch (part.shape) {
    case "lathe":
    case "torus":
      return { ...part, sides: Math.max(6, Math.round((part.sides ?? 16) / 2)) };
    case "cylinder":
    case "cone":
      // et sans chanfrein (un cylindre chanfreiné coûte trois fois plus de facettes)
      return { ...part, bevel: 0, sides: (part.sides ?? 6) > 8 ? Math.max(6, Math.round((part.sides ?? 6) / 2)) : part.sides };
    case "extrude":
      return { ...part, bevel: 0 };
    case "tube":
      return { ...part, sides: 4 };
    default:
      return part;
  }
}

function shapeGeometry(part: Part): THREE.BufferGeometry {
  const sides = part.sides ?? 6;
  switch (part.shape) {
    case "cylinder": {
      const r = part.radius ?? 0.5;
      const rt = part.radiusTop ?? r;
      const h = part.height ?? 1;
      const c = Math.min(part.bevel ?? 0, h * 0.45, r * 0.9, rt * 0.9);
      // cylindre chanfreiné : profil tourné (mêmes facettes que le cylindre simple)
      if (c > 0) return latheGeometry([[0, -h / 2], [r - c, -h / 2], [r, -h / 2 + c], [rt, h / 2 - c], [rt - c, h / 2], [0, h / 2]], sides);
      return new THREE.CylinderGeometry(rt, r, h, sides, 1);
    }
    case "lathe":
      return latheGeometry(part.profile ?? [], part.sides ?? 16, part.arc);
    case "extrude":
      return extrudeGeometry(part.profile ?? [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], part.depth ?? 1, part.bevel ?? 0);
    case "tube": {
      const r = part.radius ?? 0.05;
      return tubeGeometry(part.path ?? [[0, 0, 0], [0, 1, 0]], r, part.sides ?? 6, part.bend ?? r * 2);
    }
    case "torus":
      // section du tube : 4 côtés pour 16 autour de l'anneau (un anneau fin n'en demande pas plus)
      return new THREE.TorusGeometry(part.radius ?? 0.5, part.tube ?? 0.08, Math.max(3, Math.round((part.sides ?? 16) / 4)), part.sides ?? 16, Math.min(360, part.arc ?? 360) * DEG).rotateX(Math.PI / 2);
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
  /** normales déjà calculées (ombrage lissé) */
  smooth?: boolean;
  /** pièce de détail fin, absente du niveau de détail réduit */
  fine?: boolean;
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

function partVolume(part: Part, m: THREE.Matrix4, local?: THREE.Box3): Vol | undefined {
  let hx = 0.5, hy = 0.5, hz = 0.5;
  let round: 0 | 1 | 2 = 0;
  // tuyaux et anneaux : volume creux ou mince, ils n'assombrissent pas leurs voisins
  if (part.shape === "tube" || part.shape === "torus") return undefined;
  if ((part.shape === "lathe" || part.shape === "extrude") && local) {
    // volume pris dans la boîte locale de la forme (cylindre pour le profil tourné)
    const c = local.getCenter(new THREE.Vector3());
    const sz = local.getSize(new THREE.Vector3());
    const mc = m.clone().multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z));
    const r: 0 | 1 = part.shape === "lathe" ? 1 : 0;
    const box = new THREE.Box3(new THREE.Vector3(-sz.x / 2, -sz.y / 2, -sz.z / 2), new THREE.Vector3(sz.x / 2, sz.y / 2, sz.z / 2)).applyMatrix4(mc);
    return { inv: mc.invert(), hx: sz.x / 2, hy: sz.y / 2, hz: sz.z / 2, round: r, box };
  }
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
 * Occlusion ambiante cuite dans les sommets (second composant de l'attribut `mat`, 1 = à découvert) : depuis chaque sommet,
 * des directions de l'hémisphère de la face testent si elles rencontrent une autre pièce du modèle ou le
 * sol (y < 0). Calculée une fois au chargement, sans coût au rendu ; les creux, jointures et bas de
 * caisse s'assombrissent. Grille de répartition des volumes pour limiter les tests.
 */
function bakeAO(geos: { g: THREE.BufferGeometry; self: number; f: Flat }[], vols: (Vol | undefined)[], bounds: THREE.Box3): void {
  const N = 10;
  const size = bounds.getSize(new THREE.Vector3()).addScalar(1.6);
  const min = bounds.min.clone().subScalar(0.8);
  const mx = min.x, my = min.y, mz = min.z;
  const kx = N / size.x, ky = N / size.y, kz = N / size.z;
  const Mx = mx + size.x, My = my + size.y, Mz = mz + size.z;
  const cl = (c: number) => (c < 0 ? 0 : c > N - 1 ? N - 1 : c);
  const cx = (v: number) => cl(Math.floor((v - mx) * kx));
  const cy = (v: number) => cl(Math.floor((v - my) * ky));
  const cz = (v: number) => cl(Math.floor((v - mz) * kz));
  const grid: number[][] = Array.from({ length: N * N * N }, () => []);
  vols.forEach((v, i) => {
    if (!v) return;
    for (let x = cx(v.box.min.x); x <= cx(v.box.max.x); x++)
      for (let y = cy(v.box.min.y); y <= cy(v.box.max.y); y++)
        for (let z = cz(v.box.min.z); z <= cz(v.box.max.z); z++) grid[(x * N + y) * N + z].push(i);
  });
  const occluded = (p: THREE.Vector3, self: number): boolean => {
    if (p.y < 0) return true;
    if (p.x < mx || p.y < my || p.z < mz || p.x > Mx || p.y > My || p.z > Mz) return false;
    for (const i of grid[(cx(p.x) * N + cy(p.y)) * N + cz(p.z)]) if (i !== self && insideVol(vols[i]!, p)) return true;
    return false;
  };
  const t = new THREE.Vector3();
  const b = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const p = new THREE.Vector3();
  const a = new THREE.Vector3();
  const o = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  // directions de l'hémisphère de la face courante (calculées une fois par face)
  const dirs = AO_DIRS.map(() => new THREE.Vector3());
  // sommets répétés (même position, même normale de face : triangles voisins d'une même facette) calculés une fois
  const seen = new Map<string, number>();
  const q = (v: number) => Math.round(v * 1e4);
  /** repère de l'hémisphère autour de la normale `nrm` */
  const frame = () => {
    t.set(Math.abs(nrm.y) < 0.9 ? 0 : 1, Math.abs(nrm.y) < 0.9 ? 1 : 0, 0).cross(nrm).normalize();
    b.crossVectors(nrm, t);
    AO_DIRS.forEach((dir, j) => dirs[j].set(0, 0, 0).addScaledVector(t, dir.x).addScaledVector(b, dir.y).addScaledVector(nrm, dir.z));
  };
  for (const { g, self, f } of geos) {
    const pos = g.getAttribute("position");
    const matAttr = g.getAttribute("mat");
    // pièce lissée : hémisphère autour de la normale du sommet (partagée par les facettes voisines : un seul calcul)
    const vnorm = f.smooth ? g.getAttribute("normal") : null;
    const ao = new Float32Array(pos.count).fill(1);
    seen.clear();
    for (let i = 0; i + 2 < pos.count; i += 3) {
      if (!vnorm) {
        // normale de la face
        a.fromBufferAttribute(pos, i);
        e1.fromBufferAttribute(pos, i + 1).sub(a);
        e2.fromBufferAttribute(pos, i + 2).sub(a);
        nrm.crossVectors(e1, e2);
        if (nrm.lengthSq() < 1e-12) continue;
        nrm.normalize();
        frame();
      }
      for (let k = 0; k < 3; k++) {
        o.fromBufferAttribute(pos, i + k);
        if (vnorm) nrm.fromBufferAttribute(vnorm, i + k);
        const key = `${q(o.x)},${q(o.y)},${q(o.z)},${q(nrm.x)},${q(nrm.y)},${q(nrm.z)}`;
        const known = seen.get(key);
        if (known !== undefined) {
          ao[i + k] = known;
          continue;
        }
        if (vnorm) {
          if (nrm.lengthSq() < 1e-6) continue;
          frame();
        }
        o.addScaledVector(nrm, 0.01);
        let occ = 0;
        for (const d of dirs) {
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
        seen.set(key, ao[i + k]);
      }
    }
    for (let i = 0; i < pos.count; i++) matAttr.setY(i, ao[i]);
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

/** Retire les triangles d'aire nulle (pôles des profils tournés qui reviennent à l'axe, tracés droits). */
function dropDegenerate(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute("position");
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const keep: number[] = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    c.fromBufferAttribute(p, i + 2).sub(a);
    if (b.cross(c).lengthSq() > 1e-12) keep.push(i);
  }
  if (keep.length * 3 === p.count) return g;
  const out = new Float32Array(keep.length * 9);
  keep.forEach((i, k) => {
    for (let j = 0; j < 9; j++) out[k * 9 + j] = (p.array as Float32Array)[i * 3 + j];
  });
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(out, 3));
}

/** Angle sous lequel deux facettes voisines d'une pièce lissée se fondent. */
const CREASE = 40 * DEG;
/** niveau de détail réduit : formes rondes à moitié moins de côtés, encore lissées */
const CREASE_LO = 50 * DEG;

function isSmooth(part: Part): boolean {
  if (part.smooth !== undefined) return part.smooth;
  if (part.shape === "lathe" || part.shape === "tube" || part.shape === "torus") return true;
  return (part.shape === "cylinder" || part.shape === "cone") && (part.sides ?? 6) >= 10;
}

function flatten(parts: Part[], parentMatrix: THREE.Matrix4, out: Flat[], inherit: { pivot?: string; parent?: string; color?: ColorName; fine?: boolean }, depth = 0, lo = false): void {
  if (depth > 4) return;
  for (const part of parts) {
    if (lo && (part.fine ?? inherit.fine)) continue;
    const variants = part.mirror ? [false, true] : [false];
    for (const mirror of variants) {
      const m = new THREE.Matrix4().multiplyMatrices(parentMatrix, partMatrix(part, mirror));
      const pivot = part.pivot ?? inherit.pivot;
      const parent = part.parent ?? inherit.parent;
      const fine = part.fine ?? inherit.fine;
      if (part.use) {
        const sub = KIT[part.use];
        if (!sub) continue;
        flatten(sub, m, out, { pivot, parent, color: part.color ?? inherit.color, fine }, depth + 1, lo);
        // la position du pivot d'un sous-ensemble est son origine
        if (part.pivot && !mirror) {
          out.push({ geo: new THREE.BufferGeometry(), color: "metal", pivot: part.pivot, pivotPos: new THREE.Vector3().setFromMatrixPosition(m) });
        }
        continue;
      }
      let g = shapeGeometry(lo ? coarser(part) : part);
      g.computeBoundingBox();
      const local = g.boundingBox!.clone();
      g.applyMatrix4(m);
      if (g.index) g = g.toNonIndexed();
      g = dropDegenerate(g);
      if (m.determinant() < 0) {
        // une réflexion (nombre impair de symétries) inverse l'orientation des faces : on échange deux sommets par triangle
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i += 3) {
          const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
          p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
          p.setXYZ(i + 2, x, y, z);
        }
      }
      const smooth = isSmooth(part);
      if (smooth) {
        g.deleteAttribute("normal");
        g.deleteAttribute("uv");
        g = toCreasedNormals(g, lo ? CREASE_LO : CREASE);
      }
      const f: Flat = { geo: g, color: inherit.color && !part.color ? inherit.color : part.color ?? inherit.color ?? "metal", pivot, parent, vol: partVolume(part, m, local), smooth, fine };
      if (part.pivot && !mirror) f.pivotPos = new THREE.Vector3().setFromMatrixPosition(m);
      out.push(f);
    }
  }
}

function colorize(g: THREE.BufferGeometry, color: ColorName, smooth = false, skin?: Partial<Record<ColorName, number>>): THREE.BufferGeometry {
  let ng = g.index ? g.toNonIndexed() : g;
  const normal = ng.getAttribute("normal");
  ng = new THREE.BufferGeometry().setAttribute("position", ng.getAttribute("position"));
  // pièce lissée : normales moyennées déjà calculées ; sinon une normale par facette
  if (smooth && normal) ng.setAttribute("normal", normal);
  else ng.computeVertexNormals();
  const n = ng.getAttribute("position").count;
  const c = new THREE.Color(PALETTE[color]);
  const col = new Float32Array(n * 3);
  const mask = new Float32Array(n);
  // « mat » = (couche de matière, occlusion ambiante) dans un seul tampon : WebGPU limite un maillage à
  // 8 tampons de sommets, et les unités en utilisent déjà 7 sans celui-ci (instances comprises)
  const mat = new Float32Array(n * 2);
  // matière de la pièce : celle du jeu de matières du modèle (Souche) si la couleur y figure, sinon la commune
  const layer = skin?.[color] ?? MATERIAL_LAYER[color] ?? 1;
  for (let i = 0; i < n; i++) {
    mat[i * 2] = layer;
    mat[i * 2 + 1] = 1;
  }
  const isFaction = color === "faction" ? 1 : 0;
  const glow = color === "glow" || color === "amber" || color === "acid" || color === "crystal" ? 1 : 0;
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    mask[i] = color === "ore" ? 4 : isFaction + glow * 2;
  }
  ng.setAttribute("color", new THREE.BufferAttribute(col, 3));
  ng.setAttribute("mask", new THREE.BufferAttribute(mask, 1));
  ng.setAttribute("mat", new THREE.BufferAttribute(mat, 2));
  return ng;
}

function emptyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(9), 3));
  g.setAttribute("mask", new THREE.BufferAttribute(new Float32Array(3), 1));
  g.setAttribute("mat", new THREE.BufferAttribute(new Float32Array([0, 1, 0, 1, 0, 1]), 2));
  return g;
}

interface Assembled {
  body: THREE.BufferGeometry;
  pivots: Map<string, THREE.BufferGeometry>;
  origins: Map<string, THREE.Vector3>;
  box: THREE.Box3;
  triangles: number;
}

/** Assemble un modèle ; `lo` : niveau de détail réduit (sans pièces fines, formes rondes à moitié moins de côtés). */
function assemble(model: Model, lo: boolean): Assembled {
  const flats: Flat[] = [];
  flatten(model.parts, new THREE.Matrix4(), flats, {}, 0, lo);
  const skin = model.skin ? SKIN_LAYER[model.skin] : undefined;
  const origins = new Map<string, THREE.Vector3>();
  for (const f of flats) if (f.pivotPos && f.pivot && !origins.has(f.pivot)) origins.set(f.pivot, f.pivotPos);
  const bodyParts: THREE.BufferGeometry[] = [];
  const pivotParts = new Map<string, THREE.BufferGeometry[]>();
  const box = new THREE.Box3();
  let triangles = 0;
  // géométries colorées dans le repère du modèle, puis occlusion ambiante (avant le recentrage des pivots)
  const colored: { g: THREE.BufferGeometry; self: number; f: Flat }[] = [];
  flats.forEach((f, i) => {
    if (!f.geo.getAttribute("position")) return;
    const g = colorize(f.geo, f.color, f.smooth, skin);
    g.computeBoundingBox();
    // pièce d'une amélioration (pivot « si:… ») : elle ne compte pas dans la taille du modèle
    if (g.boundingBox && !parseCond(f.pivot ?? f.parent ?? "")?.on) box.union(g.boundingBox);
    colored.push({ g, self: i, f });
  });
  if (!box.isEmpty()) bakeAO(colored, flats.map((f) => (parseCond(f.pivot ?? f.parent ?? "") ? undefined : f.vol)), box);
  for (const { g, f } of colored) {
    triangles += g.getAttribute("position").count / 3;
    const key = f.pivot ?? f.parent;
    if (key && origins.has(key)) {
      const o = origins.get(key)!;
      g.translate(-o.x, -o.y, -o.z);
      if (!pivotParts.has(key)) pivotParts.set(key, []);
      pivotParts.get(key)!.push(g);
    } else {
      bodyParts.push(g);
    }
  }
  const merge = (geos: THREE.BufferGeometry[]) => (geos.length ? mergeGeometries(geos, false) ?? emptyGeometry() : emptyGeometry());
  const pivots = new Map<string, THREE.BufferGeometry>();
  for (const [name, geos] of pivotParts) pivots.set(name, merge(geos));
  return { body: merge(bodyParts), pivots, origins, box, triangles };
}

/** Le niveau de détail réduit n'est gardé que s'il économise au moins cette part des triangles. */
const LOD_MIN_SAVING = 0.15;

/** Le modèle a des pièces que le niveau de détail réduit retire ou simplifie (sinon on ne le construit pas). */
function hasDetail(parts: Part[], depth = 0): boolean {
  if (depth > 4) return false;
  return parts.some((p) => {
    if (p.fine) return true;
    if (p.use) return hasDetail(KIT[p.use] ?? [], depth + 1);
    if (p.shape === "lathe" || p.shape === "torus" || p.shape === "tube") return true;
    if (p.shape === "extrude" && (p.bevel ?? 0) > 0) return true;
    return (p.shape === "cylinder" || p.shape === "cone") && ((p.sides ?? 6) > 8 || (p.bevel ?? 0) > 0);
  });
}

/**
 * Modèles déjà construits (par description) : le rendu des entités, les fantômes de pose et les
 * vignettes reprennent les mêmes géométries, qu'il ne faut pas modifier (les cloner avant).
 */
const builtCache = new WeakMap<Model, BuiltModel>();

export function buildModel(model: Model): BuiltModel {
  const hit = builtCache.get(model);
  if (hit) return hit;
  const hi = assemble(model, false);
  const lo = hasDetail(model.parts) ? assemble(model, true) : null;
  const useLo = !!lo && lo.triangles < hi.triangles * (1 - LOD_MIN_SAVING);
  const pivots: BuiltPivot[] = [];
  for (const [name, geometry] of hi.pivots) {
    const p: BuiltPivot = { name, geometry, origin: hi.origins.get(name)! };
    // un pivot fait entièrement de pièces fines disparaît au loin ; sa géométrie lointaine est rapportée à
    // l'origine du modèle proche (celle du modèle lointain diffère si la première pièce du pivot est fine)
    if (useLo) {
      const g = lo!.pivots.get(name);
      const lo0 = lo!.origins.get(name);
      const hi0 = hi.origins.get(name)!;
      if (g && lo0 && !lo0.equals(hi0)) {
        const moved = g.clone();
        moved.translate(lo0.x - hi0.x, lo0.y - hi0.y, lo0.z - hi0.z);
        p.geometryLo = moved;
      } else p.geometryLo = g ?? emptyGeometry();
    }
    pivots.push(p);
  }
  const box = hi.box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)) : hi.box;
  // variantes : nombre donné par le modèle, sinon 4 dès qu'un pivot dépend de la variante
  const varied = pivots.some((p) => parseCond(p.name)?.all.some((t) => t.keys.some(isVariantKey)));
  const variants = Math.max(1, Math.floor(model.variants ?? (varied ? DEFAULT_VARIANTS : 1)));
  const built: BuiltModel = { body: hi.body, pivots, box, triangles: hi.triangles, trianglesLo: useLo ? lo!.triangles : hi.triangles, variants };
  if (model.skin) built.skin = model.skin;
  if (model.lift) built.lift = Object.entries(model.lift);
  if (useLo) built.bodyLo = lo!.body;
  builtCache.set(model, built);
  return built;
}

/**
 * Condition d'un pivot (améliorations des Transhumants) : « si:clé+clé#nom » n'est dessiné que si l'une de ces
 * améliorations est installée, « sauf:clé+clé#nom » que si aucune ne l'est. Plusieurs conditions à la fois :
 * « si:a+b&c#nom » (a ou b, et c), « si:a&!c+d#nom » (a, et ni c ni d). `base` : le nom qui suit (« fixe… » : la pièce
 * ne tourne pas ; « dep|… » : elle suit un déploiement, voir parseDep ; « chenille_p… » : elle glisse).
 * Variantes (pièces dépareillées, voir variantOf) : la clé « vN » est vraie pour la variante N de l'unité
 * (« si:v1+v3#nom », « sauf:v2#nom », « si:v1&tracker_gun#nom ») ; « var:1+3#nom » abrège « si:v1+v3#nom ».
 */
export interface PivotCond { on: boolean; all: { on: boolean; keys: string[] }[]; base: string }
export function parseCond(name: string): PivotCond | null {
  const m = /^(si|sauf|var):([^#]+)#(.*)$/.exec(name);
  if (!m) return null;
  const on = m[1] !== "sauf";
  const key = (k: string) => (m[1] === "var" && /^\d+$/.test(k) ? "v" + k : k);
  const all = m[2].split("&").map((t) => (t.startsWith("!") ? { on: !on, keys: t.slice(1).split("+").map(key) } : { on, keys: t.split("+").map(key) }));
  return { on, all, base: m[3] };
}

/** Nombre de variantes d'un modèle qui a des pièces de variante mais n'en dit pas le nombre (`Model.variants`). */
export const DEFAULT_VARIANTS = 4;
/** Clé de condition d'une variante (« v0 », « v1 »…) : ce n'est pas une amélioration. */
export function isVariantKey(k: string): boolean {
  const c = k.charCodeAt(1);
  return k.length >= 2 && k.length <= 3 && k.charCodeAt(0) === 118 && c >= 48 && c <= 57;
}
/** Clés « v0 » à « v15 », sans allocation à chaque image. */
export const VARIANT_KEYS = Array.from({ length: 16 }, (_, i) => "v" + i);
/**
 * Variante d'une unité (0 à n - 1) : hachage entier de son identifiant d'entité (case et génération), stable d'une
 * image à l'autre et identique chez tous les joueurs, sans rien demander à la simulation ni au hasard.
 */
export function variantOf(id: number, n: number): number {
  if (n <= 1) return 0;
  let h = Math.imul((id >>> 0) ^ (id >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) % n;
}
/**
 * Test « installée ? » d'une unité, variante comprise : les clés « vN » répondent par sa variante `v`, les autres par
 * ses améliorations (`has`).
 */
export function withVariant(has: (key: string) => boolean, v: number): (key: string) => boolean {
  const vk = VARIANT_KEYS[v] ?? "v" + v;
  return (k) => (isVariantKey(k) ? k === vk : has(k));
}
/**
 * Frappe ou tir (mâchoire, bras, mât émetteur, recul d'un mortier) : pivot « coup|x,DEG#nom ». Modélisée au repos, la pièce tourne de DEG degrés
 * autour de l'axe donné, par son origine, quand l'unité frappe, puis revient ; elle suit l'orientation du haut du corps.
 */
export interface Strike { axis: "x" | "y" | "z"; rad: number }
export function parseStrike(name: string): Strike | null {
  const m = /^coup\|([xyz]),(-?[\d.]+)#/.exec(name);
  return m ? { axis: m[1] as "x" | "y" | "z", rad: (Number(m[2]) * Math.PI) / 180 } : null;
}
/** Avancement d'une frappe (0 au repos, 1 au plus fort) `age` secondes après le coup, sur une durée `T`. */
export function strikePhase(age: number, T: number): number {
  if (age < 0 || age >= T) return 0;
  const up = T * 0.28;
  return age < up ? 1 - (1 - age / up) ** 2 : 1 - (age - up) / (T - up);
}

/** Le pivot est-il dessiné, avec ces améliorations (clés) installées ? */
export function condShown(c: PivotCond | null, has: (key: string) => boolean): boolean {
  return !c || c.all.every((t) => t.keys.some(has) === t.on);
}

/**
 * Étape d'une animation de déploiement décrite dans le nom d'un pivot (« dep|t:x,y,z:t0:t1|r:x,deg:t0:t1#nom ») :
 * la pièce est modélisée dans sa pose déployée ; à l'avancement 0 (replié), elle est décalée de (x, y, z)
 * (unités du modèle) et tournée de `deg` degrés autour de l'axe donné, par rapport à l'origine du pivot ;
 * chaque étape se résorbe entre t0 et t1 (avancement de 0 à 1, adouci). Le suffixe « #nom » distingue deux
 * pivots aux mêmes étapes.
 */
export interface DepStep { t: boolean; x: number; y: number; z: number; axis: "x" | "y" | "z"; deg: number; t0: number; t1: number }
export function parseDep(name: string): DepStep[] | null {
  if (!name.startsWith("dep|")) return null;
  const steps: DepStep[] = [];
  for (const seg of name.split("#")[0].split("|").slice(1)) {
    const [k, v, a, b] = seg.split(":");
    const t0 = Number(a), t1 = Number(b);
    if (k === "t") {
      const [x, y, z] = v.split(",").map(Number);
      steps.push({ t: true, x, y, z, axis: "x", deg: 0, t0, t1 });
    } else if (k === "r") {
      const [ax, d] = v.split(",");
      steps.push({ t: false, x: 0, y: 0, z: 0, axis: ax as "x" | "y" | "z", deg: Number(d), t0, t1 });
    }
  }
  return steps;
}
/** Part restante d'une étape à l'avancement p (1 : pas commencée, 0 : finie), adoucie. */
export function depLeft(st: DepStep, p: number): number {
  const u = Math.max(0, Math.min(1, (p - st.t0) / Math.max(1e-6, st.t1 - st.t0)));
  return 1 - u * u * (3 - 2 * u);
}

/** Transformation d'un pivot à l'avancement de déploiement p : rotations (dans l'ordre), puis décalage (×
 * `scale`, l'échelle du modèle), autour de l'origine du pivot. */
export function depMatrix(steps: DepStep[], p: number, scale: number): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  let ox = 0, oy = 0, oz = 0;
  for (const d of steps) {
    const k = depLeft(d, p);
    if (d.t) {
      ox += d.x * k;
      oy += d.y * k;
      oz += d.z * k;
      continue;
    }
    const ang = (d.deg * Math.PI * k) / 180;
    m.multiply(d.axis === "x" ? new THREE.Matrix4().makeRotationX(ang) : d.axis === "y" ? new THREE.Matrix4().makeRotationY(ang) : new THREE.Matrix4().makeRotationZ(ang));
  }
  if (ox || oy || oz) m.multiply(new THREE.Matrix4().makeTranslation(ox * scale, oy * scale, oz * scale));
  return m;
}

/** Part de l'emprise couverte par un bâtiment de plusieurs cases (marge pour distinguer les voisins). */
export const BUILDING_FILL = 0.94;

/**
 * Échelle d'un modèle de bâtiment de `w` cases dont la boîte mesure `sx` x `sz` (unités du modèle).
 * Plusieurs cases : le modèle est ajusté à l'emprise (moins une marge). Une case : les modèles sont
 * dessinés en unités de case et gardent leur taille (un bras fin reste fin), réduits seulement s'ils
 * dépassent la case (ou, pour un bras, sa portée).
 */
export function buildingScale(w: number, sx: number, sz: number, reach = 1): number {
  const m = Math.max(sx, sz, 0.01);
  // un bras long (portée 2) déborde de sa case par construction : il passe au-dessus des voisines
  if (w <= 1) return 0.98 / Math.max(1, m / Math.max(1, reach));
  return (w * BUILDING_FILL) / m;
}

/** Trappes : hauteur de leur centre, départ du rayon devant la face nominale, retrait maximal vers la paroi (cases). */
export const HATCH_Y = 0.3;
const HATCH_OUT = 0.15;
const HATCH_MAX_INSET = 0.5;

/** Distance du centre d'une case de bord à la face nominale d'un bâtiment de `w` cases (marge de BUILDING_FILL). */
export function hatchFace(w: number): number {
  return 0.52 - (w * (1 - BUILDING_FILL)) / 2;
}

/**
 * Paroi derrière chaque trappe, mesurée au rayon sur le corps du modèle non tourné, mis à l'échelle
 * du jeu (format de BuiltModel.hatches). Un modèle plus étroit que son emprise (dôme, cuve, octogone)
 * a ainsi ses trappes sur sa paroi, et pas dans le vide ; la médiane de 9 rayons ignore les saillies.
 */
function hatchWalls(body: THREE.BufferGeometry, scale: number, w: number): Float32Array {
  const out = new Float32Array(8 * w).fill(Number.NaN);
  const mesh = new THREE.Mesh(body, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.scale.setScalar(scale);
  mesh.updateMatrixWorld(true);
  const rc = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const towards = new THREE.Vector3();
  const d = w / 2 - 0.5 + hatchFace(w);
  for (let side = 0; side < 4; side++) {
    const nx = [1, 0, -1, 0][side];
    const nz = [0, 1, 0, -1][side];
    for (let k = 0; k < w; k++) {
      const t = k - (w - 1) / 2;
      const ds: number[] = [];
      towards.set(-nx, 0, -nz);
      for (const dy of [HATCH_Y - 0.15, HATCH_Y, HATCH_Y + 0.15]) {
        for (const dt of [-0.2, 0, 0.2]) {
          // départ un peu dehors : une paroi qui dépasse la face nominale compte aussi
          from.set(nx * (d + HATCH_OUT) + (side & 1 ? t + dt : 0), dy, nz * (d + HATCH_OUT) + (side & 1 ? 0 : t + dt));
          rc.set(from, towards);
          rc.far = HATCH_OUT + HATCH_MAX_INSET;
          const h = rc.intersectObject(mesh, false)[0];
          ds.push(h ? h.distance - HATCH_OUT : Number.POSITIVE_INFINITY);
        }
      }
      ds.sort((a, b) => a - b);
      const med = ds[ds.length >> 1];
      if (Number.isFinite(med)) out[side * w + k] = med;
      // haut de la paroi : rayon vertical juste derrière elle
      const back = d - Math.max(0, Number.isFinite(med) ? med : 0) - 0.12;
      rc.set(from.set(nx * back + (side & 1 ? t : 0), 20, nz * back + (side & 1 ? 0 : t)), towards.set(0, -1, 0));
      rc.far = 30;
      const top = rc.intersectObject(mesh, false)[0];
      if (top) out[4 * w + side * w + k] = top.point.y;
    }
  }
  return out;
}

const hatchedCache = new WeakMap<BuiltModel, Map<number, BuiltModel>>();

/**
 * Le modèle d'un bâtiment de `w` cases qui reçoit des objets, avec ses trappes : une pièce `trappe`
 * du kit (fermée) sur chaque case de bord de chaque côté, plaquée sur la paroi du modèle. Le jeu
 * n'ajoute que l'éclairage des trappes ouvertes, au même endroit (BuiltModel.hatches). La boîte reste
 * celle du modèle nu : les trappes en saillie ne changent pas l'échelle du bâtiment.
 */
export function withHatches(built: BuiltModel, w: number): BuiltModel {
  let byW = hatchedCache.get(built);
  const hit = byW?.get(w);
  if (hit) return hit;
  const scale = buildingScale(w, built.box.max.x - built.box.min.x, built.box.max.z - built.box.min.z);
  const walls = hatchWalls(built.body, scale, w);
  const d = w / 2 - 0.5 + hatchFace(w);
  const parts: Part[] = [];
  for (let side = 0; side < 4; side++) {
    const nx = [1, 0, -1, 0][side];
    const nz = [0, 1, 0, -1][side];
    for (let k = 0; k < w; k++) {
      const v = walls[side * w + k];
      if (Number.isNaN(v)) continue;
      // en unités du modèle : le jeu le met à l'échelle `scale`, la trappe reste en unités de case
      const r = (d - v) / scale;
      const t = (k - (w - 1) / 2) / scale;
      parts.push({ use: "trappe", pos: [nx * r + (side & 1 ? t : 0), HATCH_Y / scale, nz * r + (side & 1 ? 0 : t)], rot: [0, [90, 0, -90, 180][side], 0], scale: 1 / scale });
    }
  }
  let out: BuiltModel = { ...built, hatches: walls };
  if (parts.length) {
    const hi = assemble({ parts, skin: built.skin }, false);
    const lo = assemble({ parts, skin: built.skin }, true);
    const join = (a: THREE.BufferGeometry, b: THREE.BufferGeometry) => mergeGeometries([a, b], false) ?? a;
    out = { ...out, body: join(built.body, hi.body), triangles: built.triangles + hi.triangles, trianglesLo: built.trianglesLo + (built.bodyLo ? lo.triangles : hi.triangles) };
    if (built.bodyLo) out.bodyLo = join(built.bodyLo, lo.body);
  }
  if (!byW) hatchedCache.set(built, (byW = new Map()));
  byW.set(w, out);
  return out;
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
