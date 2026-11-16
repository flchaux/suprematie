// Terrain : maillage à facettes tiré de la carte de hauteurs, couleurs par altitude et pente,
// eau, gisements, brouillard de guerre (texture de visibilité de l'équipe).
import * as THREE from "three/webgpu";
import { attribute, texture, positionWorld, vec2, float, mix, uniform, vec3 } from "three/tsl";

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

function terrainColor(h: number, slope: number, water: number, out: THREE.Color): void {
  // altitude relative à l'eau
  const rel = h - water;
  if (rel < 0) out.setRGB(0.42, 0.4, 0.3);
  else if (rel < 5) out.setRGB(0.66, 0.62, 0.45);
  else if (h < 120) out.setRGB(0.3, 0.45, 0.24);
  else if (h < 165) out.setRGB(0.36, 0.48, 0.27);
  else if (h < 205) out.setRGB(0.47, 0.45, 0.36);
  else out.setRGB(0.75, 0.76, 0.78);
  if (slope > 7) out.lerp(new THREE.Color(0.32, 0.3, 0.3), 0.8);
  else if (slope > 3) out.lerp(new THREE.Color(0.4, 0.38, 0.33), 0.35);
}

export class Terrain {
  group = new THREE.Group();
  fogTex: THREE.DataTexture;
  fogData: Uint8Array;
  visW = 0;
  fogEnabled = uniform(1);

  constructor(public map: MapData) {
    const { w, h, heights } = map;
    const step = w > 600 ? 2 : 1;
    const nx = Math.floor(w / step) + 1;
    const nz = Math.floor(h / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const c = new THREE.Color();
    const hAt = (x: number, z: number) => heights[Math.min(h - 1, Math.max(0, z)) * w + Math.min(w - 1, Math.max(0, x))];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = i * step;
        const z = j * step;
        // moyenne des cases autour du sommet
        const hv = (hAt(x - 1, z - 1) + hAt(x, z - 1) + hAt(x - 1, z) + hAt(x, z)) / 4;
        const k = j * nx + i;
        pos[k * 3] = x;
        pos[k * 3 + 1] = hv * HSCALE;
        pos[k * 3 + 2] = z;
        const slope = Math.max(Math.abs(hAt(x, z) - hAt(x - step, z)), Math.abs(hAt(x, z) - hAt(x, z - step))) / step;
        terrainColor(hv, slope, map.waterLevel, c);
        // légère variation
        const n = ((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1) * 0.04;
        col[k * 3] = c.r + n;
        col[k * 3 + 1] = c.g + n;
        col[k * 3 + 2] = c.b + n;
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
    let geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    // brouillard : texture de visibilité
    this.visW = Math.floor(w / 4);
    this.fogData = new Uint8Array(this.visW * this.visW).fill(60);
    this.fogTex = new THREE.DataTexture(this.fogData, this.visW, this.visW, THREE.RedFormat, THREE.UnsignedByteType);
    this.fogTex.magFilter = THREE.LinearFilter;
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.needsUpdate = true;
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const uv = vec2(positionWorld.x.div(float(w)), positionWorld.z.div(float(h)));
    const fog = texture(this.fogTex, uv).r;
    const fogF = mix(float(1), fog, this.fogEnabled);
    mat.colorNode = attribute("color", "vec3").mul(fogF);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = false;
    this.group.add(mesh);
    // eau
    if (map.waterLevel > 0) {
      const wg = new THREE.PlaneGeometry(w + 400, h + 400, 1, 1);
      wg.rotateX(-Math.PI / 2);
      const wm = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.78 });
      const wfog = mix(float(1), texture(this.fogTex, uv).r, this.fogEnabled);
      wm.colorNode = vec3(0.12, 0.3, 0.45).mul(wfog);
      const water = new THREE.Mesh(wg, wm);
      water.position.set(w / 2, map.waterLevel * HSCALE - 0.05, h / 2);
      this.group.add(water);
    }
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

  /** Met à jour le brouillard à partir de la grille de visibilité (bits : 1 vue, 2 radar, 8 explorée). */
  updateFog(vis: Uint8Array): void {
    const n = Math.min(vis.length, this.fogData.length);
    for (let i = 0; i < n; i++) {
      const v = vis[i];
      this.fogData[i] = v & 1 ? 255 : v & 8 ? 150 : v & 2 ? 110 : 70;
    }
    this.fogTex.needsUpdate = true;
  }
}
