// Terrain : maillage lissé tiré de la carte de hauteurs, couleurs continues selon l'altitude et la pente,
// grain procédural, eau animée avec écume, gisements, brouillard de guerre (voir fog.ts).
import * as THREE from "three/webgpu";
import { attribute, texture, positionWorld, vec2, float, mix, uniform, vec3, mx_noise_float, smoothstep, normalize, transformNormalToView, cameraPosition, dot, max, pow, sin } from "three/tsl";
import { fogFactor, applyFog, setFogTexture } from "./fog.ts";

export const HSCALE = 0.08; // hauteur monde par unité de hauteur de la carte

export interface MapData {
  w: number;
  h: number;
  waterLevel: number;
  heights: Uint8Array;
  starts: [number, number][];
  spots: { kind: number; x: number; y: number }[];
}

export function parseMapInfo(info: Int32Array, heights: Uint8Array): MapData {
  const m: MapData = { w: info[0], h: info[1], waterLevel: info[2], heights, starts: [], spots: [] };
  let o = 4;
  for (let i = 0; i < info[3]; i++, o += 2) m.starts.push([info[o], info[o + 1]]);
  const ns = info[o++];
  for (let i = 0; i < ns; i++, o += 3) m.spots.push({ kind: info[o], x: info[o + 1], y: info[o + 2] });
  return m;
}

/** Hauteur du sol (monde) au point (x, z) en cases, interpolée. */
export function groundHeight(m: MapData, x: number, z: number): number {
  const fx = Math.max(0, Math.min(m.w - 1.001, x - 0.5));
  const fz = Math.max(0, Math.min(m.h - 1.001, z - 0.5));
  const ix = fx | 0;
  const iz = fz | 0;
  const tx = fx - ix;
  const tz = fz - iz;
  const h = m.heights;
  const w = m.w;
  const a = h[iz * w + ix];
  const b = h[iz * w + ix + 1];
  const c = h[(iz + 1) * w + ix];
  const d = h[(iz + 1) * w + ix + 1];
  return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) * HSCALE;
}
export function surfaceHeight(m: MapData, x: number, z: number): number {
  return Math.max(groundHeight(m, x, z), m.waterLevel * HSCALE);
}

export const DEPOSIT_COLORS: Record<number, number> = { 1: 0x6f8ba8, 2: 0xd0763a, 3: 0xe4dcc0, 4: 0x241c2c, 5: 0x66e8ff };

const C_SEABED = new THREE.Color(0.36, 0.35, 0.27);
const C_SAND = new THREE.Color(0.7, 0.64, 0.46);
const C_GRASS = new THREE.Color(0.26, 0.4, 0.19);
const C_GRASS2 = new THREE.Color(0.33, 0.43, 0.22);
const C_DRY = new THREE.Color(0.45, 0.42, 0.33);
const C_SNOW = new THREE.Color(0.78, 0.79, 0.82);
const C_ROCK = new THREE.Color(0.36, 0.34, 0.32);
const C_DIRT = new THREE.Color(0.42, 0.38, 0.3);

const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Couleur continue selon l'altitude (relative à l'eau) et la pente : transitions douces. */
function terrainColor(h: number, slope: number, water: number, out: THREE.Color): void {
  const rel = h - water;
  out.copy(C_SEABED);
  out.lerp(C_SAND, sstep(-3, 0, rel));
  out.lerp(C_GRASS, sstep(3, 9, rel));
  out.lerp(C_GRASS2, sstep(125, 160, h));
  out.lerp(C_DRY, sstep(175, 205, h));
  out.lerp(C_SNOW, sstep(212, 232, h));
  out.lerp(rel < 2 ? C_DIRT : C_ROCK, sstep(2.5, 8, slope) * 0.85);
}

/** Lissage temporel du brouillard : vitesse d'apparition / de disparition (niveaux par seconde). */
const FOG_REVEAL = 900;
const FOG_HIDE = 260;

export class Terrain {
  group = new THREE.Group();
  fogTex: THREE.DataTexture;
  fogData: Uint8Array;
  fogTarget: Uint8Array;
  fogDirty = false;
  heightTex: THREE.DataTexture;
  visW = 0;
  waterTime = uniform(0);

  constructor(public map: MapData) {
    const { w, h, heights } = map;
    const step = w > 600 ? 2 : 1;
    const nx = Math.floor(w / step) + 1;
    const nz = Math.floor(h / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const c = new THREE.Color();
    const hAt = (x: number, z: number) => heights[Math.min(h - 1, Math.max(0, z)) * w + Math.min(w - 1, Math.max(0, x))];
    // hauteur d'un sommet : moyenne des 4 cases qui le touchent
    const hv = (x: number, z: number) => (hAt(x - 1, z - 1) + hAt(x, z - 1) + hAt(x - 1, z) + hAt(x, z)) / 4;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = i * step;
        const z = j * step;
        const hc = hv(x, z);
        const k = j * nx + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = hc * HSCALE;
        pos[k * 3 + 2] = z;
        // pente : différences centrées sur 2 cases, plus douces que la différence brute
        const gx = (hv(x + 2, z) - hv(x - 2, z)) / 4;
        const gz = (hv(x, z + 2) - hv(x, z - 2)) / 4;
        terrainColor(hc, Math.hypot(gx, gz) * 1.6, map.waterLevel, c);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let o = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const cc = a + nx;
        const d = cc + 1;
        idx[o++] = a;
        idx[o++] = cc;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = cc;
        idx[o++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals(); // normales lissées : plus de facettes
    // brouillard : texture de visibilité, lissée dans le temps (fogData suit fogTarget)
    this.visW = Math.floor(w / 4);
    this.fogData = new Uint8Array(this.visW * this.visW).fill(40);
    this.fogTarget = new Uint8Array(this.visW * this.visW).fill(40);
    this.fogTex = new THREE.DataTexture(this.fogData, this.visW, this.visW, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.needsUpdate = true;
    setFogTexture(this.fogTex, w, h);
    const fog = fogFactor();
    // hauteurs du sol (pour la profondeur de l'eau et l'écume)
    this.heightTex = new THREE.DataTexture(heights, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;
    // sol : couleur des sommets + grain procédural (taches de végétation, gravier fin)
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.93, metalness: 0 });
    const p2 = vec2(positionWorld.x, positionWorld.z);
    const macro = mx_noise_float(p2.mul(0.045)); // -1..1, grandes taches
    const mid = mx_noise_float(p2.mul(0.27));
    const fine = mx_noise_float(p2.mul(2.3));
    const base = attribute("color", "vec3");
    const tint = mix(vec3(0.92, 0.95, 0.85), vec3(1.08, 1.02, 0.94), macro.mul(0.5).add(0.5));
    const grain = float(1).add(mid.mul(0.07)).add(fine.mul(0.045));
    const ground = base.mul(tint).mul(grain);
    mat.colorNode = applyFog(ground, fog);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    // eau
    if (map.waterLevel > 0) this.group.add(this.buildWater(map, fog));
    // bordure sombre autour de la carte
    const border = new THREE.Mesh(new THREE.PlaneGeometry(w * 4, h * 4).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0x0b1016 }));
    border.position.set(w / 2, -1, h / 2);
    this.group.add(border);
    // gisements
    const rock = new THREE.IcosahedronGeometry(0.42, 0);
    const dmat = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.3 });
    const rocks = new THREE.InstancedMesh(rock, dmat, map.spots.length * 4);
    const m4 = new THREE.Matrix4();
    let r = 0;
    for (const s of map.spots) {
      const color = new THREE.Color(DEPOSIT_COLORS[s.kind] ?? 0xffffff);
      for (let k = 0; k < 4; k++) {
        const x = s.x + 0.5 + (k % 2);
        const z = s.y + 0.5 + (k >> 1);
        const y = groundHeight(map, x, z) + 0.1;
        const sc = 0.8 + ((k * 7 + s.x) % 5) * 0.08;
        m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, k + s.y, 0)), new THREE.Vector3(sc, sc * 0.7, sc));
        rocks.setMatrixAt(r, m4);
        rocks.setColorAt(r, s.kind === 5 ? color : color);
        r++;
      }
    }
    rocks.count = r;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    this.group.add(rocks);
    if (map.spots.some((s) => s.kind === 5)) {
      // halo lumineux des cristaux
      const glow = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.35, 0), new THREE.MeshBasicNodeMaterial({ color: 0x8ff4ff }), map.spots.length);
      let g = 0;
      for (const s of map.spots) {
        if (s.kind !== 5) continue;
        m4.compose(new THREE.Vector3(s.x + 1, groundHeight(map, s.x + 1, s.y + 1) + 1.0, s.y + 1), new THREE.Quaternion(), new THREE.Vector3(1, 2, 1));
        glow.setMatrixAt(g++, m4);
      }
      glow.count = g;
      this.group.add(glow);
    }
  }

  /** Eau animée : profondeur (couleur, transparence), vaguelettes, reflet du ciel, écume sur les rives. */
  private buildWater(map: MapData, fog: ReturnType<typeof fogFactor>): THREE.Mesh {
    const { w, h } = map;
    const wg = new THREE.PlaneGeometry(w + 400, h + 400, 1, 1);
    wg.rotateX(-Math.PI / 2);
    const wm = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.05, transparent: true, depthWrite: false });
    const t = this.waterTime;
    const p2 = vec2(positionWorld.x, positionWorld.z);
    const ground = texture(this.heightTex, p2.div(vec2(w, h))).r.mul(255);
    const depth = float(map.waterLevel).sub(ground).mul(HSCALE).max(0); // en unités du monde
    const shallow = vec3(0.13, 0.44, 0.47);
    const deep = vec3(0.04, 0.14, 0.27);
    const body = mix(shallow, deep, smoothstep(0, 3.5, depth));
    // vaguelettes : deux bruits qui défilent dans des directions différentes
    const n1 = mx_noise_float(vec3(p2.mul(0.35).add(vec2(t.mul(0.11), t.mul(0.07))), t.mul(0.15)));
    const n2 = mx_noise_float(vec3(p2.mul(0.9).sub(vec2(t.mul(0.05), t.mul(0.13))), t.mul(0.21)));
    const nx = n1.mul(0.16).add(n2.mul(0.08));
    const nz = n2.mul(0.16).sub(n1.mul(0.06));
    const nWorld = normalize(vec3(nx, 1, nz));
    wm.normalNode = transformNormalToView(nWorld);
    // reflet du ciel selon l'angle de vue (Fresnel)
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(float(1).sub(max(dot(viewDir, nWorld), 0)), 4);
    const sky = vec3(0.55, 0.68, 0.82);
    // écume : bande près des rives, ondulante
    // écume : un liseré fin au bord, et des bandes qui avancent vers la rive en eau peu profonde
    const shore = float(1).sub(smoothstep(0.0, 0.32, depth));
    const edge = float(1).sub(smoothstep(0.0, 0.05, depth));
    const ripple = sin(depth.mul(32).sub(t.mul(1.7)).add(n1.mul(2.5))).mul(0.5).add(0.5);
    const bands = smoothstep(0.72, 0.97, ripple).mul(shore).mul(n2.mul(0.4).add(0.65));
    const foam = max(edge.mul(0.85), bands.mul(0.75)).min(1);
    const color = mix(mix(body, sky, fres.mul(0.55)), vec3(0.92, 0.96, 0.98), foam);
    wm.colorNode = applyFog(color, fog);
    wm.opacityNode = mix(float(0.5), float(0.9), smoothstep(0, 2.2, depth)).max(foam).mul(fog.mul(0.25).add(0.75));
    const water = new THREE.Mesh(wg, wm);
    water.position.set(w / 2, map.waterLevel * HSCALE - 0.05, h / 2);
    water.receiveShadow = true;
    water.renderOrder = 1;
    return water;
  }

  /** Nouvelle grille de visibilité (bits : 1 vue, 2 radar, 8 explorée) ; le passage est progressif. */
  updateFog(vis: Uint8Array): void {
    const n = Math.min(vis.length, this.fogTarget.length);
    for (let i = 0; i < n; i++) {
      const v = vis[i];
      this.fogTarget[i] = v & 1 ? 255 : v & 8 ? 140 : v & 2 ? 100 : 40;
    }
    this.fogDirty = true;
  }

  /** Avance le fondu du brouillard et l'animation de l'eau. */
  tick(dt: number, time: number): void {
    this.waterTime.value = time;
    if (!this.fogDirty) return;
    const up = Math.max(1, Math.round(FOG_REVEAL * dt));
    const down = Math.max(1, Math.round(FOG_HIDE * dt));
    const cur = this.fogData;
    const tgt = this.fogTarget;
    let moving = false;
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i];
      const b = tgt[i];
      if (a === b) continue;
      cur[i] = b > a ? Math.min(b, a + up) : Math.max(b, a - down);
      moving = true;
    }
    if (moving) this.fogTex.needsUpdate = true;
    else this.fogDirty = false;
  }
}
