// Pings des joueurs : anneaux qui s'élargissent à l'endroit signalé, et une pointe qui rebondit au-dessus.
import * as THREE from "three/webgpu";
import { groundHeight, type MapData } from "./terrain.ts";

/** durée d'affichage d'un ping (s), sur la carte et la minicarte */
export const PING_TIME = 6;
const MAX = 24;
const WAVES = 3;

export interface Ping { x: number; z: number; color: number; age: number }

export class Pings {
  group = new THREE.Group();
  list: Ping[] = [];
  private rings: THREE.InstancedMesh;
  private tips: THREE.InstancedMesh;

  constructor(private map: MapData) {
    const mat = () => new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), mat(), MAX * WAVES);
    this.tips = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.4, 4).rotateX(Math.PI), mat(), MAX);
    for (const m of [this.rings, this.tips]) {
      m.count = 0;
      m.frustumCulled = false;
      m.renderOrder = 10;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
    }
  }

  add(x: number, z: number, color: number): void {
    this.list.push({ x, z, color, age: 0 });
    if (this.list.length > MAX) this.list.shift();
  }

  /** `size` : taille à l'écran (cases), proportionnelle à la distance de la caméra. */
  update(dt: number, size: number): void {
    if (!this.list.length && !this.tips.count) return;
    this.list = this.list.filter((p) => (p.age += dt) < PING_TIME);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    let n = 0;
    let t = 0;
    for (const p of this.list) {
      const y = groundHeight(this.map, p.x, p.z) + 0.3;
      const fade = Math.min(1, (PING_TIME - p.age) / 1.2);
      c.setHex(p.color).multiplyScalar(0.4 + 0.6 * fade);
      for (let w = 0; w < WAVES; w++) {
        const f = (p.age * 0.7 + w / WAVES) % 1;
        const s = size * (0.25 + f * 1.6) * fade;
        m.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(s, 1, s));
        this.rings.setMatrixAt(n, m);
        this.rings.setColorAt(n++, c);
      }
      const s = size * 0.45 * fade;
      m.compose(new THREE.Vector3(p.x, y + s * (1.3 + 0.5 * Math.abs(Math.sin(p.age * 4))), p.z), q, new THREE.Vector3(s, s, s));
      this.tips.setMatrixAt(t, m);
      this.tips.setColorAt(t++, c);
    }
    this.rings.count = n;
    this.tips.count = t;
    for (const k of [this.rings, this.tips]) {
      k.instanceMatrix.needsUpdate = true;
      if (k.instanceColor) k.instanceColor.needsUpdate = true;
    }
  }
}
