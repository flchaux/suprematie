// Zones électriques sur le terrain (vue électrique, pose d'un bâtiment électrique) : une texture d'une
// valeur par case, comme le brouillard de guerre. Chaque réseau a sa couleur (deux zones reliées ont la
// même), un liseré marque le bord des zones, les zones mortes (générateur à sec, relais isolé) sont
// hachurées de rouge, et la zone du bâtiment en cours de pose est plus vive. Liaisons entre poteaux en traits.
import * as THREE from "three/webgpu";
import { texture, positionWorld, vec2, vec3, mix, uniform, float, step, fract } from "three/tsl";
import type { PowerZones } from "@supreme/shared";

type N = ReturnType<typeof float>;

const placeholder = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
placeholder.needsUpdate = true;
const coverNode = texture(placeholder);
const mapSize = uniform(new THREE.Vector2(1, 1));
/** 0 : surimpression cachée, 1 : affichée */
export const powerShow = uniform(0);

/** Codes de la composante alpha de la texture (une case). */
const A_DEAD = 64;
const A_FILL = 128;
const A_EDGE = 192;
const A_PREVIEW = 255;

/** Couleurs des réseaux (une par réseau, choisie par sa plus petite référence de poteau : stable). */
export const NET_COLORS = [0x3ef0ff, 0x6dff8c, 0xffc043, 0xc58bff, 0xff7ac8, 0x9dff3e, 0xff9a4a, 0x6aa8ff];
export const DEAD_COLOR = 0xff4a3d;

/** Teinte des cases selon la texture des zones (ajoutée à la couleur du terrain). */
export function applyPower(color: N): N {
  const s = coverNode.sample(vec2(positionWorld.x, positionWorld.z).div(mapSize));
  const a = s.a;
  const dead = step(0.15, a).mul(step(a, 0.35));
  const fill = step(0.4, a).mul(step(a, 0.6));
  const edge = step(0.65, a).mul(step(a, 0.85));
  const preview = step(0.9, a);
  // hachures en diagonale pour les zones mortes
  const hatch = step(0.5, fract(positionWorld.x.add(positionWorld.z).mul(1.25)));
  const k = fill.mul(0.26).add(edge.mul(0.62)).add(dead.mul(hatch).mul(0.42)).add(preview.mul(0.38)).mul(powerShow);
  return mix(color, s.rgb.mul(1.25), k) as unknown as N;
}

export interface NetInfo {
  id: number;
  color: number;
  prod: number;
  demand: number;
  cap: number;
  sat: number;
  /** autonomie en s (-1 : rien ne brûle) */
  autonomy: number;
  dead: boolean;
  /** réseau de racines de la Souche (prod : sève, demand : sels, cap : plafond) */
  roots?: boolean;
}

export class PowerCoverage {
  tex: THREE.DataTexture;
  data: Uint8Array;
  base: Uint8Array;
  w: number;
  h: number;
  /** réseaux affichés, par ordre d'identifiant (légende) */
  nets: NetInfo[] = [];
  /** couleur de chaque réseau vivant */
  colorOf = new Map<number, number>();
  private netOf: Int32Array;
  private lines: THREE.LineSegments;

  constructor(w: number, h: number, group: THREE.Object3D) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
    this.base = new Uint8Array(w * h * 4);
    this.netOf = new Int32Array(w * h);
    this.tex = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    coverNode.value = this.tex;
    mapSize.value.set(w, h);
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicNodeMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: false }));
    this.lines.renderOrder = 5;
    this.lines.visible = false;
    this.lines.frustumCulled = false;
    group.add(this.lines);
  }

  private rect(x: number, y: number, bw: number, bh: number, s: number, f: (i: number) => void): void {
    const x0 = Math.max(0, x - s);
    const y0 = Math.max(0, y - s);
    const x1 = Math.min(this.w, x + bw + s);
    const y1 = Math.min(this.h, y + bh + s);
    for (let ty = y0; ty < y1; ty++) {
      const row = ty * this.w;
      for (let tx = x0; tx < x1; tx++) f(row + tx);
    }
  }

  /**
   * Zones de l'équipe (requête power_zones) : couleurs par réseau, bords, zones mortes, liaisons.
   * `connect(kind)` : portée de liaison d'un type de bâtiment ; `height(x, z)` : hauteur du sol.
   */
  setZones(z: PowerZones, connect: (kind: number) => number, height: (x: number, z: number) => number): void {
    const nets = new Map<number, NetInfo>();
    const minRef = new Map<number, number>();
    // réseau de racines de la Souche (n[8] = 1) : prod = sève, demand = sels, cap = plafond ; à sec sans sève
    for (const n of z.nets) nets.set(n[0], { id: n[0], color: 0, prod: n[2], demand: n[3], cap: n[4], sat: n[5], autonomy: n[7], dead: n[2] <= 0, roots: n[8] === 1 });
    for (const p of z.poles) if (p[5] > 0) minRef.set(p[5], Math.min(minRef.get(p[5]) ?? Infinity, p[9] >>> 0));
    this.colorOf.clear();
    for (const n of nets.values()) {
      const r = minRef.get(n.id) ?? n.id;
      n.color = n.dead ? DEAD_COLOR : NET_COLORS[(r * 2654435761) >>> 29];
      if (!n.dead) this.colorOf.set(n.id, n.color);
    }
    this.nets = [...nets.values()].sort((a, b) => a.id - b.id);
    // zones vivantes : réseau par case (le premier poteau qui couvre la case l'emporte)
    const netOf = this.netOf;
    netOf.fill(0);
    const alive = (net: number) => net > 0 && nets.get(net)?.dead === false;
    for (const p of z.poles) if (alive(p[5])) this.rect(p[0], p[1], p[2], p[3], p[4], (i) => { if (netOf[i] === 0) netOf[i] = p[5]; });
    const b = this.base;
    b.fill(0);
    // zones mortes (générateur à sec, relais d'un réseau sans production) : hachures rouges
    const dr = (DEAD_COLOR >> 16) & 255, dg = (DEAD_COLOR >> 8) & 255, db = DEAD_COLOR & 255;
    for (const p of z.poles) {
      if (alive(p[5])) continue;
      this.rect(p[0], p[1], p[2], p[3], p[4], (i) => {
        if (netOf[i] !== 0) return;
        b[i * 4] = dr; b[i * 4 + 1] = dg; b[i * 4 + 2] = db; b[i * 4 + 3] = A_DEAD;
      });
    }
    // couleur des zones vivantes, liseré là où la case voisine n'est pas du même réseau
    const W = this.w;
    for (const p of z.poles) {
      if (!alive(p[5])) continue;
      this.rect(p[0], p[1], p[2], p[3], p[4], (i) => {
        const net = netOf[i];
        if (b[i * 4 + 3] !== 0 || net === 0) return;
        const c = this.colorOf.get(net) ?? 0xffffff;
        const x = i % W;
        const edge = x === 0 || x === W - 1 || i < W || i >= W * (this.h - 1) || netOf[i - 1] !== net || netOf[i + 1] !== net || netOf[i - W] !== net || netOf[i + W] !== net;
        b[i * 4] = (c >> 16) & 255; b[i * 4 + 1] = (c >> 8) & 255; b[i * 4 + 2] = c & 255; b[i * 4 + 3] = edge ? A_EDGE : A_FILL;
      });
    }
    // liaisons entre poteaux d'un même réseau vivant
    const pos: number[] = [];
    const col: number[] = [];
    const cx = (p: number[]) => p[0] + p[2] / 2;
    const cz = (p: number[]) => p[1] + p[3] / 2;
    for (let i = 0; i < z.poles.length; i++) {
      const a = z.poles[i];
      if (!alive(a[5])) continue;
      for (let j = i + 1; j < z.poles.length; j++) {
        const q = z.poles[j];
        if (q[5] !== a[5]) continue;
        // portée de liaison donnée par la simulation (selon le niveau), sinon celle du type
        const r = Math.min(a[11] ?? connect(a[10]), q[11] ?? connect(q[10]));
        const dx = cx(a) - cx(q);
        const dz = cz(a) - cz(q);
        if (dx * dx + dz * dz > r * r) continue;
        const c = new THREE.Color(this.colorOf.get(a[5]) ?? 0xffffff);
        pos.push(cx(a), height(cx(a), cz(a)) + 1.6, cz(a), cx(q), height(cx(q), cz(q)) + 1.6, cz(q));
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const g = this.lines.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
  }

  /** Affiche les zones, plus la zone que couvriraient les bâtiments en cours de pose ; liaisons en option. */
  show(preview: { x: number; y: number; w: number; h: number; s: number }[], links: boolean): void {
    this.data.set(this.base);
    const d = this.data;
    for (const p of preview) this.rect(p.x, p.y, p.w, p.h, p.s, (i) => { d[i * 4] = 180; d[i * 4 + 1] = 240; d[i * 4 + 2] = 255; d[i * 4 + 3] = A_PREVIEW; });
    this.tex.needsUpdate = true;
    powerShow.value = 1;
    this.lines.visible = links;
  }

  hide(): void {
    powerShow.value = 0;
    this.lines.visible = false;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
  }
}
