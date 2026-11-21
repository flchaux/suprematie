// Gisements : un amas de roches (ou de cristaux) aux tailles, aux formes et aux nuances variées, entouré
// d'éclats plats, posé sur une tache de minerai fondue dans le sol (voir depositMask, lue par ground.ts
// et par le sol sans textures). Rien n'est aligné sur les cases : le gisement n'a pas de bord net.
//
// Les roches hautes restent dans l'emprise de 2 × 2 cases et disparaissent sous un bâtiment (extracteur,
// centrale géothermique) ; les éclats du pourtour sont assez plats pour passer sous un tapis ou un mur.
import * as THREE from "three/webgpu";
import { attribute, vec3 } from "three/tsl";
import { fogFactor } from "./fog.ts";
import { rockDetail } from "./ground.ts";
import { groundHeight, type MapData } from "./terrain.ts";

/** sorte de gisement des geysers (voir GEYSER dans sim/src/data.rs) */
const GEYSER = 250;
const CRYSTAL = 5;

/** Nuances des roches par sorte de gisement : dominante, seconde (rouille, vert-de-gris, quartz…), sombre. */
const ROCK_COLORS: Record<number, [number, number, number]> = {
  1: [0x6f8ba8, 0x8a5a44, 0x4d5f78],
  2: [0xd0763a, 0x6f9e86, 0x9a4f2a],
  3: [0xe4dcc0, 0xf6f2e4, 0xb3a98c],
  4: [0x2a2233, 0x41364f, 0x17121d],
  5: [0x66e8ff, 0xa6f5ff, 0x3fc4e8],
  [GEYSER]: [0xb9a98e, 0xd8cfb8, 0x8f8a7a],
};
/** Teinte de la tache au sol par sorte (poussière de minerai, plus terne que les roches). */
const STAIN_COLORS: Record<number, number> = { 1: 0x8a9bb0, 2: 0xc07a48, 3: 0xddd5b8, 4: 0x2e2733, 5: 0x7fc4cf, [GEYSER]: 0xbdb198 };
const GREY = new THREE.Color(0x7c7a72);
const DUST = new THREE.Color(0x6b5a45);

/** Générateur aléatoire à graine : un gisement a toujours la même forme. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const spotSeed = (s: { x: number; y: number; kind: number }) => (Math.imul(s.x, 73856093) ^ Math.imul(s.y, 19349663) ^ Math.imul(s.kind, 83492791)) >>> 0;

/** Couleur d'une roche selon la pureté : un gisement impur tire sur le gris, un gisement pur est plus vif. */
function purityTint(c: THREE.Color, purity: number): THREE.Color {
  if (purity <= 50) return c.lerp(GREY, 0.45).multiplyScalar(0.88);
  if (purity >= 200) {
    const l = (c.r + c.g + c.b) / 3;
    return c.setRGB(l + (c.r - l) * 1.25, l + (c.g - l) * 1.25, l + (c.b - l) * 1.25).multiplyScalar(1.1);
  }
  return c;
}

/**
 * Roche : icosaèdre dont les sommets sont déplacés au hasard (les sommets communs bougent ensemble),
 * dessous aplati. Facettes franches ; couleur des sommets : une clarté par facette, plus sombre vers le pied.
 */
function rockGeometry(detail: number, seed: number, rough: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute("position");
  const r = rng(seed);
  const moved = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 50)},${Math.round(p.getY(i) * 50)},${Math.round(p.getZ(i) * 50)}`;
    let k = moved.get(key);
    if (k === undefined) moved.set(key, (k = 1 - rough + r() * rough * 2));
    p.setXYZ(i, p.getX(i) * k, Math.max(-0.35, p.getY(i) * k), p.getZ(i) * k);
  }
  const col = new Float32Array(p.count * 3);
  for (let f = 0; f < p.count; f += 3) {
    const face = 0.8 + r() * 0.36;
    for (let i = f; i < f + 3; i++) {
      const v = face * (0.68 + 0.32 * Math.min(1, Math.max(0, (p.getY(i) + 0.35) / 1.1)));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

/** Cristal : prisme hexagonal de rayon 0,5 et de hauteur 1, pied à l'origine, pointe à six pans ; une clarté par pan. */
function crystalGeometry(): THREE.BufferGeometry {
  const pts: number[] = [];
  const col: number[] = [];
  const r = rng(99);
  const tri = (a: number[], b: number[], c: number[], v: number) => {
    pts.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) col.push(v, v, v);
  };
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2;
    const x0 = Math.cos(a0) * 0.5, z0 = Math.sin(a0) * 0.5;
    const x1 = Math.cos(a1) * 0.5, z1 = Math.sin(a1) * 0.5;
    const v = 0.75 + r() * 0.4;
    // pan du fût (un peu plus étroit au pied), puis pan de la pointe
    tri([x0 * 0.8, 0, z0 * 0.8], [x1, 0.68, z1], [x1 * 0.8, 0, z1 * 0.8], v);
    tri([x0 * 0.8, 0, z0 * 0.8], [x0, 0.68, z0], [x1, 0.68, z1], v);
    tri([x0, 0.68, z0], [0.06, 1, 0.04], [x1, 0.68, z1], v * 1.15);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}

/** Une pièce d'un gisement : sa géométrie, sa pose, sa couleur ; `tall` : cachée sous un bâtiment. */
interface Piece {
  geo: number;
  m: THREE.Matrix4;
  c: THREE.Color;
  tall: boolean;
}
const G_BIG = 0;
const G_SMALL = 1;
const G_PEBBLE = 2;
const G_CRYSTAL = 3;

/** Les pièces du gisement `s`, tirées au hasard d'après sa position (toujours les mêmes). */
function spotPieces(map: MapData, s: MapData["spots"][number]): Piece[] {
  const r = rng(spotSeed(s));
  const out: Piece[] = [];
  const cx = s.x + 1;
  const cz = s.y + 1;
  const rich = s.purity >= 200 ? 1.3 : s.purity <= 50 ? 0.72 : 1;
  const pal = ROCK_COLORS[s.kind] ?? ROCK_COLORS[1];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  /**
   * Nuance tirée de la palette, de clarté variable. `mixed` : part des roches d'une autre nuance que
   * la dominante (les grosses roches gardent la couleur du minerai, qui dit ce qu'est le gisement).
   */
  const shade = (mixed = 0.35, dim = 1) => {
    const u = r();
    const c = new THREE.Color(pal[u >= mixed ? 0 : u < mixed * 0.45 ? 1 : 2]);
    return purityTint(c, s.purity).multiplyScalar((0.86 + r() * 0.28) * dim);
  };
  /** roche de rayon `rad` en (dx, dz) du centre, aplatie de `flat`, pied enfoncé dans le sol */
  const rock = (geo: number, dx: number, dz: number, rad: number, flat: number, tall: boolean, c: THREE.Color) => {
    const x = cx + dx;
    const z = cz + dz;
    const sy = rad * flat;
    q.setFromEuler(e.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.5));
    out.push({ geo, m: new THREE.Matrix4().compose(new THREE.Vector3(x, groundHeight(map, x, z) + sy * 0.3, z), q, new THREE.Vector3(rad * (0.85 + r() * 0.35), sy, rad * (0.85 + r() * 0.35))), c, tall });
  };
  const turn = r() * Math.PI * 2;
  if (s.kind === CRYSTAL) {
    // cristaux : un grand au centre, des moyens penchés vers l'extérieur, des éclats au pied
    const crystal = (dist: number, ang: number, h: number, rad: number, lean: number) => {
      const x = cx + Math.cos(ang) * dist;
      const z = cz + Math.sin(ang) * dist;
      // penché dans la direction (cos, sin) : rotation autour de l'axe horizontal perpendiculaire
      q.setFromAxisAngle(new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang)), lean).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI));
      out.push({ geo: G_CRYSTAL, m: new THREE.Matrix4().compose(new THREE.Vector3(x, groundHeight(map, x, z) - 0.04, z), q, new THREE.Vector3(rad * 2, h, rad * 2)), c: shade(0.5), tall: true });
    };
    crystal(r() * 0.12, turn, (1.25 + r() * 0.3) * (rich > 1 ? 1.12 : 1), 0.2, r() * 0.12);
    const mid = Math.round(4 * rich);
    for (let i = 0; i < mid; i++) crystal(0.3 + r() * 0.2, turn + (i / mid) * Math.PI * 2 + r() * 0.5, 0.65 + r() * 0.4, 0.14 + r() * 0.04, 0.3 + r() * 0.35);
    const low = Math.round(6 * rich);
    for (let i = 0; i < low; i++) crystal(0.55 + r() * 0.3, turn + (i / low) * Math.PI * 2 + r() * 0.7, 0.25 + r() * 0.25, 0.09 + r() * 0.04, 0.45 + r() * 0.5);
  } else if (s.kind === GEYSER) {
    // geyser : margelle de concrétions autour de l'évent
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const d = 0.55 + r() * 0.3;
      rock(G_SMALL, Math.cos(a) * d, Math.sin(a) * d, 0.2 + r() * 0.13, 0.6 + r() * 0.2, true, shade(0.5));
    }
  } else {
    // minerai : une ou deux grosses roches près du centre, des moyennes autour
    const big = rich > 1 ? 3 : rich < 1 ? 1 : 2;
    for (let i = 0; i < big; i++) {
      const a = turn + (i / big) * Math.PI * 2 + (r() - 0.5) * 0.8;
      const d = i === 0 && big < 3 ? r() * 0.2 : 0.34 + r() * 0.22;
      rock(G_BIG, Math.cos(a) * d, Math.sin(a) * d, 0.34 + r() * 0.13, 0.72 + r() * 0.22, true, shade(0));
    }
    const small = Math.round((6 + r() * 3) * rich);
    for (let i = 0; i < small; i++) {
      const a = turn + 0.6 + (i / small) * Math.PI * 2 + (r() - 0.5) * 0.9;
      const d = 0.42 + r() * 0.5;
      rock(G_SMALL, Math.cos(a) * d, Math.sin(a) * d, 0.15 + r() * 0.15, 0.6 + r() * 0.3, true, shade(0.3));
    }
  }
  // éclats plats du pourtour : de plus en plus rares en s'éloignant, mêlés de terre
  const pebbles = Math.round((11 + r() * 5) * rich);
  for (let i = 0; i < pebbles; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.65 + 1.75 * Math.pow(r(), 1.5);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    // jamais dans l'eau
    if (map.heights[Math.min(map.h - 1, Math.max(0, Math.floor(z))) * map.w + Math.min(map.w - 1, Math.max(0, Math.floor(x)))] < map.waterLevel) continue;
    rock(G_PEBBLE, Math.cos(a) * d, Math.sin(a) * d, 0.06 + r() * 0.1, 0.4 + r() * 0.25, false, shade(0.4, 0.9).lerp(DUST, 0.15 + r() * 0.3));
  }
  return out;
}

/** Côté d'un morceau de carte (cases) : seuls les gisements des morceaux vus sont dessinés. */
const CHUNK = 128;

export class Deposits {
  group = new THREE.Group();
  private geos: THREE.BufferGeometry[];
  private mats: THREE.Material[];
  /** par gisement : ses pièces hautes (maillage, rang, pose), cachées quand un bâtiment le recouvre */
  private tall: { mesh: THREE.InstancedMesh; i: number; m: THREE.Matrix4 }[][] = [];
  private hidden: boolean[] = [];
  /** gisement d'après sa case d'origine (z × largeur + x) */
  readonly index = new Map<number, number>();

  constructor(private map: MapData) {
    this.geos = [rockGeometry(1, 11, 0.2), rockGeometry(0, 23, 0.24), rockGeometry(0, 37, 0.3), crystalGeometry()];
    // roche : couleur de l'instance × clarté des facettes × grain de la texture de roche, assombrie par le brouillard
    const fog = fogFactor();
    const shade = attribute("color", "vec3").mul(fog.mul(0.88).add(0.12));
    const rockMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0.12 });
    rockMat.colorNode = shade.mul(rockDetail(1.6));
    // cristal : lisse, avec un éclat propre qui nourrit le halo du rendu
    const crystalMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.22, metalness: 0 });
    crystalMat.colorNode = shade;
    crystalMat.emissiveNode = vec3(0.06, 0.34, 0.42).mul(attribute("color", "vec3")).mul(fog);
    this.mats = [rockMat, crystalMat];
    // pièces de chaque gisement, rangées par morceau de carte et par géométrie
    const cols = Math.ceil(map.w / CHUNK);
    const bins = new Map<number, { spot: number; p: Piece }[]>();
    map.spots.forEach((s, si) => {
      this.index.set(s.y * map.w + s.x, si);
      this.tall.push([]);
      this.hidden.push(false);
      const chunk = Math.floor(s.y / CHUNK) * cols + Math.floor(s.x / CHUNK);
      for (const p of spotPieces(map, s)) {
        const key = chunk * 4 + p.geo;
        let list = bins.get(key);
        if (!list) bins.set(key, (list = []));
        list.push({ spot: si, p });
      }
    });
    for (const [key, list] of bins) {
      const geo = key % 4;
      const mesh = new THREE.InstancedMesh(this.geos[geo], geo === G_CRYSTAL ? crystalMat : rockMat, list.length);
      list.forEach(({ spot, p }, i) => {
        mesh.setMatrixAt(i, p.m);
        mesh.setColorAt(i, p.c);
        if (p.tall) this.tall[spot].push({ mesh, i, m: p.m });
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = geo !== G_PEBBLE;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  /**
   * Cache les pièces hautes des gisements recouverts par un bâtiment (indices dans map.spots), montre
   * celles des autres. Ne touche qu'aux gisements dont l'état change.
   */
  setCovered(covered: Set<number>): void {
    const zero = ZERO;
    const apply = (si: number, hide: boolean) => {
      if (this.hidden[si] === hide) return;
      this.hidden[si] = hide;
      for (const t of this.tall[si]) {
        t.mesh.setMatrixAt(t.i, hide ? zero : t.m);
        t.mesh.instanceMatrix.needsUpdate = true;
      }
    };
    for (const si of this.wasCovered) if (!covered.has(si)) apply(si, false);
    for (const si of covered) apply(si, true);
    this.wasCovered = new Set(covered);
  }
  private wasCovered = new Set<number>();

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Carte des taches de minerai, une valeur par case, lue avec un filtrage bilinéaire : rgb = teinte de la
 * tache (sRGB, selon la sorte et la pureté du gisement), a = poids (1 au cœur, 0 hors de la tache).
 * Chaque tache a sa forme (ovale et lobes tirés au hasard) ; le sol en déforme encore le bord avec un bruit.
 */
export function depositMask(map: MapData): THREE.DataTexture {
  const { w, h } = map;
  const data = new Uint8Array(w * h * 4);
  const best = new Float32Array(w * h).fill(1e9);
  for (const s of map.spots) {
    const r = rng(spotSeed(s) ^ 0x5bd1e995);
    const cx = s.x + 1;
    const cz = s.y + 1;
    const R = (s.kind === GEYSER ? 3 : 2.45) * (0.9 + r() * 0.25) * (s.purity >= 200 ? 1.12 : s.purity <= 50 ? 0.9 : 1);
    const a2 = r() * Math.PI;
    const a3 = r() * Math.PI * 2;
    const oval = 0.14 + r() * 0.16;
    const lobes = 0.06 + r() * 0.1;
    // la couleur de travail est linéaire ; la texture est en sRGB (plus fine dans les tons sombres)
    const c = purityTint(new THREE.Color(STAIN_COLORS[s.kind] ?? 0x888888), s.purity).convertLinearToSRGB();
    const rgb = [c.r, c.g, c.b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
    const reach = 6;
    for (let z = Math.max(0, cz - reach); z < Math.min(h, cz + reach); z++) {
      for (let x = Math.max(0, cx - reach); x < Math.min(w, cx + reach); x++) {
        const dx = x + 0.5 - cx;
        const dz = z + 0.5 - cz;
        const ang = Math.atan2(dz, dx);
        // rayon de la tache dans cette direction : un ovale à lobes, jamais plus étroit que 2 cases
        // (le poids met ainsi au moins 1,7 case à s'annuler : aucune marche d'une case à l'autre)
        const edge = Math.min(3.5, Math.max(2, R * (1 + oval * Math.cos(2 * (ang - a2)) + lobes * Math.cos(3 * ang - a3))));
        const dist = Math.hypot(dx, dz);
        const d = dist / edge;
        if (dist > edge + 1.6) continue;
        const k = z * w + x;
        if (d < best[k]) {
          best[k] = d;
          data[k * 4] = rgb[0];
          data[k * 4 + 1] = rgb[1];
          data[k * 4 + 2] = rgb[2];
        }
        const t = Math.min(1, Math.max(0, (dist - 0.3) / (edge - 0.3)));
        data[k * 4 + 3] = Math.max(data[k * 4 + 3], Math.round((1 - t) * 255));
      }
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
