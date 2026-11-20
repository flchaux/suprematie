// Effets visuels de combat (purement graphiques, hors simulation) : boules de feu, étincelles, fumée,
// débris, traces de brûlure au sol, ondes de choc, éclairs de tir, traînées de missiles, bâtiments en feu.
// Particules : pools en tableaux plats, affichées en un InstancedMesh par pool, face à la caméra.
import * as THREE from "three/webgpu";
import { instancedBufferAttribute, uv, float, length, mx_noise_float, vec3, smoothstep, pow } from "three/tsl";
import { groundHeight, type MapData } from "./terrain.ts";

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Spawn {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number; s0: number; s1: number;
  /** couleur de début et de fin (peut dépasser 1 pour le halo) */
  c0: [number, number, number]; c1?: [number, number, number];
  a?: number; drag?: number; grav?: number;
}

/** Pool de particules en panneaux tournés vers la caméra. */
class ParticlePool {
  n = 0;
  cursor = 0;
  alive: Uint8Array;
  f: Float32Array; // 20 valeurs par particule
  mesh: THREE.InstancedMesh;
  col: THREE.InstancedBufferAttribute;
  pa: THREE.InstancedBufferAttribute; // alpha, graine
  static S = 20;
  constructor(public max: number, kind: "add" | "smoke") {
    this.alive = new Uint8Array(max);
    this.f = new Float32Array(max * ParticlePool.S);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    this.pa = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: kind === "add" ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pa = instancedBufferAttribute(this.pa, "vec2");
    const d = length(uv().sub(0.5)).mul(2);
    const disc = float(1).sub(d).clamp(0, 1);
    if (kind === "add") {
      mat.colorNode = instancedBufferAttribute(this.col, "vec3");
      mat.opacityNode = pow(disc, 1.6).mul(pa.x);
    } else {
      // bouffée de fumée : disque irrégulier par un bruit propre à chaque particule
      const nz = mx_noise_float(vec3(uv().mul(3.2), pa.y));
      mat.colorNode = instancedBufferAttribute(this.col, "vec3").mul(nz.mul(0.18).add(0.95));
      mat.opacityNode = smoothstep(0.0, 0.55, disc.mul(nz.mul(0.45).add(0.8))).mul(pa.x);
    }
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = kind === "add" ? 3 : 2;
  }
  spawn(p: Spawn): void {
    // anneau : on écrase la plus ancienne si le pool est plein
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (!this.alive[i]) this.n++;
    this.alive[i] = 1;
    const f = this.f;
    const o = i * ParticlePool.S;
    const c1 = p.c1 ?? p.c0;
    f[o] = p.x; f[o + 1] = p.y; f[o + 2] = p.z;
    f[o + 3] = p.vx ?? 0; f[o + 4] = p.vy ?? 0; f[o + 5] = p.vz ?? 0;
    f[o + 6] = 0; f[o + 7] = p.life; f[o + 8] = p.s0; f[o + 9] = p.s1;
    f[o + 10] = p.c0[0]; f[o + 11] = p.c0[1]; f[o + 12] = p.c0[2];
    f[o + 13] = c1[0]; f[o + 14] = c1[1]; f[o + 15] = c1[2];
    f[o + 16] = p.a ?? 1; f[o + 17] = p.drag ?? 0; f[o + 18] = p.grav ?? 0;
    f[o + 19] = Math.random() * Math.PI * 2;
  }
  update(dt: number, camQ: THREE.Quaternion, fadeIn: boolean): void {
    const f = this.f;
    const col = this.col.array as Float32Array;
    const pa = this.pa.array as Float32Array;
    let k = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const o = i * ParticlePool.S;
      const age = (f[o + 6] += dt);
      const life = f[o + 7];
      if (age >= life) {
        this.alive[i] = 0;
        this.n--;
        continue;
      }
      const t = age / life;
      const drag = Math.max(0, 1 - f[o + 17] * dt);
      f[o + 3] *= drag;
      f[o + 5] *= drag;
      f[o + 4] = f[o + 4] * drag + f[o + 18] * dt;
      f[o + 0] += f[o + 3] * dt;
      f[o + 1] += f[o + 4] * dt;
      f[o + 2] += f[o + 5] * dt;
      const s = f[o + 8] + (f[o + 9] - f[o + 8]) * Math.sqrt(t);
      const rot = f[o + 19] + age * 0.6;
      tmpQ2.setFromAxisAngle(Z, rot);
      tmpQ.copy(camQ).multiply(tmpQ2);
      tmpM.compose(tmpV.set(f[o], f[o + 1], f[o + 2]), tmpQ, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(k, tmpM);
      col[k * 3] = f[o + 10] + (f[o + 13] - f[o + 10]) * t;
      col[k * 3 + 1] = f[o + 11] + (f[o + 14] - f[o + 11]) * t;
      col[k * 3 + 2] = f[o + 12] + (f[o + 15] - f[o + 12]) * t;
      // fondu : la fumée apparaît puis s'efface, le feu s'éteint
      const fade = fadeIn ? Math.min(1, t * 6) * (1 - t) * (1 - t) : (1 - t) * (1 - t * 0.5);
      pa[k * 2] = f[o + 16] * fade;
      pa[k * 2 + 1] = (i % 97) * 1.37;
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.col.needsUpdate = true;
    this.pa.needsUpdate = true;
  }
}

/** Petits objets solides animés (débris) : chute, rebond, rotation. */
class DebrisPool {
  cursor = 0;
  alive: Uint8Array;
  f: Float32Array; // x y z vx vy vz age life size rx ry rz wx wy wz
  mesh: THREE.InstancedMesh;
  static S = 15;
  constructor(public max: number, public map: MapData) {
    this.alive = new Uint8Array(max);
    this.f = new Float32Array(max * DebrisPool.S);
    const g = new THREE.BoxGeometry(1, 0.55, 0.8);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0.35 }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
  }
  spawn(x: number, y: number, z: number, speed: number, size: number, color: THREE.Color): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.alive[i] = 1;
    const o = i * DebrisPool.S;
    const f = this.f;
    const a = Math.random() * Math.PI * 2;
    const h = rnd(0.3, 1) * speed;
    f[o] = x; f[o + 1] = y; f[o + 2] = z;
    f[o + 3] = Math.cos(a) * h; f[o + 4] = rnd(0.8, 1.6) * speed; f[o + 5] = Math.sin(a) * h;
    f[o + 6] = 0; f[o + 7] = rnd(2.5, 4.5); f[o + 8] = size;
    f[o + 9] = rnd(0, 6); f[o + 10] = rnd(0, 6); f[o + 11] = rnd(0, 6);
    f[o + 12] = rnd(-9, 9); f[o + 13] = rnd(-9, 9); f[o + 14] = rnd(-9, 9);
    this.mesh.setColorAt(i, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt: number): number {
    const f = this.f;
    let top = 0;
    const e = new THREE.Euler();
    for (let i = 0; i < this.max; i++) {
      const o = i * DebrisPool.S;
      if (this.alive[i]) {
        const age = (f[o + 6] += dt);
        if (age >= f[o + 7]) this.alive[i] = 0;
      }
      if (!this.alive[i]) {
        // instance vide (on garde l'ordre des couleurs : une instance par case du pool)
        tmpM.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, tmpM);
        continue;
      }
      top = i + 1;
      const g = groundHeight(this.map, f[o], f[o + 2]) + f[o + 8] * 0.25;
      if (f[o + 1] > g || f[o + 4] > 0) {
        f[o + 4] -= 22 * dt;
        f[o] += f[o + 3] * dt;
        f[o + 1] += f[o + 4] * dt;
        f[o + 2] += f[o + 5] * dt;
        f[o + 9] += f[o + 12] * dt;
        f[o + 10] += f[o + 13] * dt;
        f[o + 11] += f[o + 14] * dt;
        if (f[o + 1] < g) {
          // rebond amorti puis immobilisation
          f[o + 1] = g;
          f[o + 4] = Math.abs(f[o + 4]) * 0.3 < 1.2 ? 0 : -f[o + 4] * 0.3;
          f[o + 3] *= 0.5;
          f[o + 5] *= 0.5;
          f[o + 12] *= 0.4;
          f[o + 13] *= 0.4;
          f[o + 14] *= 0.4;
        }
      }
      const t = f[o + 6] / f[o + 7];
      const s = f[o + 8] * (t > 0.8 ? (1 - t) * 5 : 1);
      tmpQ.setFromEuler(e.set(f[o + 9], f[o + 10], f[o + 11]));
      tmpM.compose(tmpV.set(f[o], f[o + 1], f[o + 2]), tmpQ, tmpS.set(s, s, s));
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.count = top;
    this.mesh.instanceMatrix.needsUpdate = true;
    return top;
  }
}

/** Disques plats posés sur le sol : traces de brûlure et ondes de choc. */
class DecalPool {
  cursor = 0;
  f: Float32Array; // x y z size0 size1 age life nx ny nz
  alive: Uint8Array;
  mesh: THREE.InstancedMesh;
  pa: THREE.InstancedBufferAttribute;
  static S = 10;
  constructor(public max: number, kind: "scorch" | "wave") {
    this.alive = new Uint8Array(max);
    this.f = new Float32Array(max * DecalPool.S);
    this.pa = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage) as THREE.InstancedBufferAttribute;
    const pa = instancedBufferAttribute(this.pa, "vec2");
    const d = length(uv().sub(0.5)).mul(2);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (kind === "scorch") {
      const nz = mx_noise_float(vec3(uv().mul(5), pa.y));
      mat.colorNode = vec3(0.05, 0.04, 0.035);
      mat.opacityNode = smoothstep(1.0, 0.35, d.add(nz.mul(0.25))).mul(pa.x).mul(0.75);
    } else {
      mat.blending = THREE.AdditiveBlending;
      mat.colorNode = vec3(2.2, 1.7, 1.1);
      mat.opacityNode = smoothstep(0.7, 0.92, d).mul(smoothstep(1.0, 0.94, d)).mul(pa.x);
    }
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = kind === "scorch" ? 1 : 3;
  }
  spawn(x: number, y: number, z: number, s0: number, s1: number, life: number, normal: THREE.Vector3): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.alive[i] = 1;
    const o = i * DecalPool.S;
    const f = this.f;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = s0; f[o + 4] = s1; f[o + 5] = 0; f[o + 6] = life;
    f[o + 7] = normal.x; f[o + 8] = normal.y; f[o + 9] = normal.z;
  }
  update(dt: number, fade: (t: number) => number): void {
    const f = this.f;
    const pa = this.pa.array as Float32Array;
    let k = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const o = i * DecalPool.S;
      const age = (f[o + 5] += dt);
      if (age >= f[o + 6]) {
        this.alive[i] = 0;
        continue;
      }
      const t = age / f[o + 6];
      const s = f[o + 3] + (f[o + 4] - f[o + 3]) * Math.sqrt(t);
      tmpQ.setFromUnitVectors(Y, tmpN.set(f[o + 7], f[o + 8], f[o + 9]));
      tmpM.compose(tmpV.set(f[o], f[o + 1], f[o + 2]), tmpQ, tmpS.set(s, 1, s));
      this.mesh.setMatrixAt(k, tmpM);
      pa[k * 2] = fade(t);
      pa[k * 2 + 1] = (i % 53) * 2.1;
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.pa.needsUpdate = true;
  }
}

export class Effects {
  group = new THREE.Group();
  fire: ParticlePool;
  smoke: ParticlePool;
  debris: DebrisPool;
  scorch: DecalPool;
  waves: DecalPool;
  /** 1 : effets complets, 0.4 : réduits */
  quality = 1;
  /** zone vue (cases), avec marge : rien n'est créé en dehors */
  view: [number, number, number, number] = [0, 0, 1e9, 1e9];
  enabled = true;

  constructor(public map: MapData) {
    this.fire = new ParticlePool(7000, "add");
    this.smoke = new ParticlePool(6000, "smoke");
    this.debris = new DebrisPool(1500, map);
    this.scorch = new DecalPool(500, "scorch");
    this.waves = new DecalPool(64, "wave");
    this.group.add(this.scorch.mesh, this.debris.mesh, this.smoke.mesh, this.fire.mesh, this.waves.mesh);
  }

  get count(): number {
    return this.fire.n + this.smoke.n;
  }

  inView(x: number, z: number, margin = 6): boolean {
    const [x0, z0, x1, z1] = this.view;
    return this.enabled && x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin;
  }

  private n(base: number): number {
    const v = base * this.quality;
    return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0);
  }

  private normalAt(x: number, z: number): THREE.Vector3 {
    const m = this.map;
    const dx = groundHeight(m, x + 0.5, z) - groundHeight(m, x - 0.5, z);
    const dz = groundHeight(m, x, z + 0.5) - groundHeight(m, x, z - 0.5);
    return tmpN.set(-dx, 1, -dz).normalize();
  }

  /** Explosion : kind 0 petite, 1 moyenne (zone), 2 grande (expérimentale), 3 énorme (missile stratégique). */
  explosion(x: number, z: number, r: number, kind: number): void {
    if (!this.inView(x, z, r + 8)) return;
    const g = Math.max(groundHeight(this.map, x, z), this.map.waterLevel * 0.08);
    const y = g + 0.3;
    const huge = kind === 3;
    const big = kind >= 1;
    r = Math.max(0.35, r);
    // éclair
    this.fire.spawn({ x, y: y + r * 0.3, z, life: huge ? 0.35 : 0.12, s0: r * 2.4, s1: r * 3.4, c0: [5, 4.2, 3], c1: [3, 1.5, 0.5] });
    // boules de feu
    const nf = this.n(Math.min(huge ? 60 : 22, 3 + r * 3));
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.4, 1.6) * r * (huge ? 0.6 : 1.4);
      this.fire.spawn({
        x: x + rnd(-0.3, 0.3) * r, y: y + rnd(0, 0.4) * r, z: z + rnd(-0.3, 0.3) * r,
        vx: Math.cos(a) * sp, vy: rnd(0.5, 1.5) * r * (huge ? 1.6 : 1), vz: Math.sin(a) * sp,
        life: rnd(0.35, 0.75) * (huge ? 3 : big ? 1.4 : 1), s0: r * rnd(0.4, 0.7), s1: r * rnd(1.0, 1.5),
        c0: [3.2, 2.0, 0.7], c1: [1.2, 0.25, 0.05], drag: 2.5, grav: huge ? 3 : 0,
      });
    }
    // étincelles
    const ns = this.n(Math.min(30, 4 + r * 5));
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(5, 13) * Math.min(2, 0.6 + r * 0.5);
      this.fire.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: rnd(3, 11), vz: Math.sin(a) * sp, life: rnd(0.3, 0.8), s0: 0.22, s1: 0.08, c0: [3.5, 2.6, 1.3], c1: [2, 0.6, 0.1], grav: -18, drag: 0.8 });
    }
    // fumée
    const nk = this.n(Math.min(huge ? 50 : 14, 2 + r * 2));
    for (let i = 0; i < nk; i++) {
      const gray = rnd(0.1, 0.2);
      this.smoke.spawn({
        x: x + rnd(-0.5, 0.5) * r, y: y + rnd(0, 0.5) * r, z: z + rnd(-0.5, 0.5) * r,
        vx: rnd(-0.6, 0.6), vy: rnd(0.7, 1.6) * (huge ? 4 : 1), vz: rnd(-0.6, 0.6),
        life: rnd(2, 3.8) * (huge ? 2.5 : big ? 1.3 : 1), s0: r * 0.7, s1: r * rnd(2.0, 2.8),
        c0: [gray + 0.05, gray + 0.04, gray + 0.03], c1: [gray * 2.2, gray * 2.1, gray * 2], a: 0.8, drag: 0.6, grav: 0.15,
      });
    }
    // poussière soulevée au sol
    if (big) {
      const nd = this.n(Math.min(huge ? 40 : 14, 6 + r * 2));
      for (let i = 0; i < nd; i++) {
        const a = (i / nd) * Math.PI * 2;
        const sp = r * rnd(1.5, 2.5) * (huge ? 0.8 : 1);
        this.smoke.spawn({ x, y: g + 0.3, z, vx: Math.cos(a) * sp, vy: 0.3, vz: Math.sin(a) * sp, life: rnd(1.5, 2.6) * (huge ? 2 : 1), s0: r * 0.5, s1: r * 1.6, c0: [0.42, 0.37, 0.29], c1: [0.55, 0.5, 0.42], a: 0.55, drag: 1.6 });
      }
    }
    // onde de choc et trace au sol
    if (kind >= 2) this.waves.spawn(x, g + 0.25, z, r * 0.3, r * (huge ? 2.2 : 3), huge ? 1.4 : 0.6, this.normalAt(x, z));
    if (g > this.map.waterLevel * 0.08 + 0.02 && r >= 0.45) this.scorch.spawn(x, g + 0.06, z, r * 1.5, r * 1.7, huge ? 90 : 30, this.normalAt(x, z));
  }

  /** Débris d'une unité ou d'un bâtiment détruit. */
  wreckage(x: number, z: number, size: number, color: THREE.Color, building: boolean): void {
    if (!this.inView(x, z)) return;
    const g = groundHeight(this.map, x, z) + 0.3;
    const n = this.n(Math.min(building ? 26 : 10, (building ? 6 : 3) + size * (building ? 4 : 3)));
    const metal = new THREE.Color(0.32, 0.31, 0.3);
    for (let i = 0; i < n; i++) {
      const c = i % 3 === 0 ? color.clone().multiplyScalar(0.7) : metal.clone().multiplyScalar(rnd(0.6, 1.2));
      this.debris.spawn(x + rnd(-0.4, 0.4) * size, g + rnd(0, 0.5) * size, z + rnd(-0.4, 0.4) * size, rnd(3, 7) * Math.min(1.6, 0.6 + size * 0.3), rnd(0.12, 0.3) * Math.min(2.5, 0.7 + size * 0.4), c);
    }
    if (building) {
      // nuage de poussière de l'effondrement
      const nd = this.n(4 + size * 3);
      for (let i = 0; i < nd; i++) {
        this.smoke.spawn({ x: x + rnd(-0.5, 0.5) * size, y: g, z: z + rnd(-0.5, 0.5) * size, vx: rnd(-1, 1), vy: rnd(0.4, 1.2), vz: rnd(-1, 1), life: rnd(2.5, 4.5), s0: size * 0.6, s1: size * 1.5, c0: [0.38, 0.34, 0.28], c1: [0.5, 0.47, 0.42], a: 0.65, drag: 0.8 });
      }
    }
  }

  /** Morsure d'une bête de la faune : éclat sombre et brève poussière au point mordu. */
  bite(x: number, y: number, z: number, big: number): void {
    if (!this.inView(x, z, 2)) return;
    this.fire.spawn({ x, y, z, life: 0.1, s0: 0.35 * big, s1: 0.6 * big, c0: [1.6, 0.35, 0.18], c1: [0.4, 0.05, 0.02] });
    if (Math.random() < 0.5 * this.quality) this.smoke.spawn({ x, y, z, vy: 0.4, life: rnd(0.3, 0.6), s0: 0.15 * big, s1: 0.5 * big, c0: [0.35, 0.27, 0.2], a: 0.45, drag: 1.5 });
  }

  /** Éclair de départ d'un tir. */
  muzzle(x: number, y: number, z: number, proj: number, big: number): void {
    if (!this.inView(x, z, 2)) return;
    const colors: Record<number, [number, number, number]> = { 5: [1.5, 3.5, 4], 6: [1.4, 4, 4], 7: [2, 2.4, 5], 8: [4, 1, 1], 11: [2.4, 3.6, 5] };
    const c = colors[proj] ?? [4, 3, 1.6];
    this.fire.spawn({ x, y, z, life: 0.07, s0: 0.55 * big, s1: 0.9 * big, c0: c });
    if (proj === 1 || proj === 2) {
      // fumée de départ des obus et missiles
      this.smoke.spawn({ x, y, z, vy: 0.6, life: rnd(0.7, 1.2), s0: 0.3 * big, s1: 1.0 * big, c0: [0.4, 0.4, 0.4], c1: [0.6, 0.6, 0.6], a: 0.5, drag: 1 });
    }
  }

  /**
   * Rayon prolongé (appelé à chaque image) : étincelles et lueur au point d'impact ; pour le souffle
   * de feu (proj 10), flammes projetées le long du rayon.
   */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, proj: number, dt: number, big: number): void {
    if (!this.inView(bx, bz, 4) && !this.inView(ax, az, 4)) return;
    const fire = proj === 10;
    const c: [number, number, number] = fire ? [2.4, 1.1, 0.25] : [2.4, 0.5, 0.45];
    this.fire.spawn({ x: bx, y: by, z: bz, life: 0.08, s0: 0.4 * big, s1: 0.7 * big, c0: c });
    if (fire) {
      const n = Math.ceil(dt * 50 * this.quality);
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      for (let i = 0; i < n; i++) {
        const t = Math.random();
        const sp = rnd(0.6, 1.4);
        this.fire.spawn({
          x: ax + dx * t + rnd(-0.2, 0.2) * big,
          y: ay + dy * t + rnd(-0.2, 0.2) * big,
          z: az + dz * t + rnd(-0.2, 0.2) * big,
          vx: dx * 0.25 * sp,
          vy: dy * 0.25 * sp + 0.4,
          vz: dz * 0.25 * sp,
          life: rnd(0.18, 0.35),
          s0: (0.15 + t * 0.45) * big,
          s1: (0.35 + t * 0.9) * big,
          c0: [2.2, 1.1, 0.3],
          c1: [1.4, 0.35, 0.05],
        });
      }
      if (Math.random() < dt * 20 * this.quality) this.smoke.spawn({ x: bx, y: by + 0.3, z: bz, vy: 0.8, life: rnd(0.8, 1.4), s0: 0.6 * big, s1: 2 * big, c0: [0.25, 0.22, 0.2], c1: [0.4, 0.4, 0.4], a: 0.45, drag: 1 });
    } else if (Math.random() < dt * 30 * this.quality) {
      // laser : fumée de la surface brûlée
      this.smoke.spawn({ x: bx, y: by, z: bz, vy: 0.7, life: rnd(0.5, 0.9), s0: 0.2 * big, s1: 0.8 * big, c0: [0.35, 0.33, 0.32], a: 0.4, drag: 1 });
    }
  }

  /** Traînée d'un projectile (appelée à chaque image). */
  trail(x: number, y: number, z: number, proj: number, dt: number, big: number): void {
    if (!this.inView(x, z, 2)) return;
    if (proj === 2 || (proj !== 1 && big > 1.5)) {
      // missile : flamme + fumée
      if (Math.random() < dt * 60 * this.quality) {
        this.smoke.spawn({ x: x + rnd(-0.05, 0.05), y, z: z + rnd(-0.05, 0.05), vy: 0.2, life: rnd(0.6, 1.1) * big, s0: 0.18 * big, s1: 0.65 * big, c0: [0.7, 0.68, 0.65], c1: [0.55, 0.55, 0.55], a: 0.55, drag: 1.5 });
      }
      this.fire.spawn({ x, y, z, life: 0.05, s0: 0.4 * big, s1: 0.25 * big, c0: [4, 2.4, 0.9] });
    } else if (proj === 1) {
      // obus : fin filet de fumée (plus épais pour l'artillerie lourde)
      if (Math.random() < dt * 25 * this.quality) this.smoke.spawn({ x, y, z, life: 0.5 * big, s0: 0.08 * big, s1: 0.3 * big, c0: [0.6, 0.58, 0.55], a: 0.35 });
    } else if (proj === 11) {
      // canon de rail : sillage ionisé bleuté qui s'attarde
      if (Math.random() < dt * 90 * this.quality) this.fire.spawn({ x, y, z, life: rnd(0.25, 0.45), s0: 0.22 * big, s1: 0.05, c0: [1.6, 2.6, 4], c1: [0.4, 0.8, 1.8] });
    } else if (proj === 4) {
      // torpille : bulles
      if (Math.random() < dt * 20 * this.quality) this.smoke.spawn({ x, y: this.map.waterLevel * 0.08 + 0.02, z, life: 0.8, s0: 0.15, s1: 0.4, c0: [0.8, 0.9, 0.95], a: 0.6 });
    }
  }

  /** Fumée (et flammes si très endommagé) au-dessus d'un bâtiment ou d'une grosse unité. */
  burning(x: number, y: number, z: number, damage: number, size: number, dt: number): void {
    if (!this.inView(x, z, 2)) return;
    const rate = damage * 10 * this.quality * Math.min(3, 0.6 + size * 0.5);
    if (Math.random() < rate * dt) {
      const gray = rnd(0.08, 0.16);
      this.smoke.spawn({ x: x + rnd(-0.3, 0.3) * size, y, z: z + rnd(-0.3, 0.3) * size, vx: rnd(-0.2, 0.2) + 0.25, vy: rnd(1, 1.8), vz: rnd(-0.2, 0.2) + 0.1, life: rnd(2.2, 3.5), s0: 0.3 * size + 0.2, s1: 1.1 * size + 0.6, c0: [gray, gray, gray], c1: [gray * 2.6, gray * 2.6, gray * 2.6], a: 0.7, drag: 0.3 });
    }
    if (damage > 0.55 && Math.random() < rate * dt * 1.3) {
      this.fire.spawn({ x: x + rnd(-0.3, 0.3) * size, y: y - 0.2, z: z + rnd(-0.3, 0.3) * size, vy: rnd(0.8, 1.6), life: rnd(0.3, 0.6), s0: 0.25 * size + 0.15, s1: 0.1, c0: [3, 1.6, 0.4], c1: [1.5, 0.3, 0.05] });
    }
  }

  /** Étincelles d'impact (rayon, bouclier). */
  sparks(x: number, y: number, z: number, color: [number, number, number], n = 5): void {
    if (!this.inView(x, z, 2)) return;
    this.fire.spawn({ x, y, z, life: 0.1, s0: 0.6, s1: 0.9, c0: color });
    for (let i = 0, m = this.n(n); i < m; i++) {
      this.fire.spawn({ x, y, z, vx: rnd(-6, 6), vy: rnd(1, 7), vz: rnd(-6, 6), life: rnd(0.2, 0.45), s0: 0.16, s1: 0.06, c0: color, grav: -16 });
    }
  }

  /** Téléportation / saut : anneau bleu et éclat. */
  warp(x: number, z: number): void {
    if (!this.inView(x, z)) return;
    const g = groundHeight(this.map, x, z);
    this.fire.spawn({ x, y: g + 1, z, life: 0.5, s0: 3, s1: 1, c0: [1.5, 2.8, 5] });
    this.waves.spawn(x, g + 0.2, z, 0.5, 4, 0.5, this.normalAt(x, z));
    for (let i = 0, m = this.n(14); i < m; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.fire.spawn({ x, y: g + 0.5, z, vx: Math.cos(a) * 4, vy: rnd(1, 4), vz: Math.sin(a) * 4, life: 0.5, s0: 0.3, s1: 0.05, c0: [1.2, 2.5, 5], drag: 2 });
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    this.fire.update(dt, camera.quaternion, false);
    this.smoke.update(dt, camera.quaternion, true);
    this.debris.update(dt);
    this.scorch.update(dt, (t) => (t > 0.7 ? (1 - t) / 0.3 : 1));
    this.waves.update(dt, (t) => (1 - t) * (1 - t));
  }
}
