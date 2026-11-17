// Couverture électrique : pendant la pose d'un bâtiment électrique, les cases alimentées par nos
// générateurs et pylônes sont teintées en bleu clair sur le terrain (texture d'une valeur par case,
// comme le brouillard de guerre), et la zone que couvrirait le bâtiment posé est plus vive.
import * as THREE from "three/webgpu";
import { texture, positionWorld, vec2, vec3, mix, uniform, float, smoothstep } from "three/tsl";

type N = ReturnType<typeof float>;

const placeholder = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
placeholder.needsUpdate = true;
const coverNode = texture(placeholder);
const mapSize = uniform(new THREE.Vector2(1, 1));
/** 0 : surimpression cachée, 1 : affichée */
export const powerShow = uniform(0);

/** Teinte bleu clair des cases alimentées (128 : réseau existant, 255 : zone du bâtiment en cours de pose). */
export function applyPower(color: N): N {
  const c = coverNode.sample(vec2(positionWorld.x, positionWorld.z).div(mapSize)).r;
  const existing = smoothstep(0.2, 0.45, c);
  const preview = smoothstep(0.7, 0.95, c);
  const k = existing.mul(0.32).add(preview.mul(0.2)).mul(powerShow);
  return mix(color, vec3(0.55, 0.85, 1.25), k) as unknown as N;
}

export class PowerCoverage {
  tex: THREE.DataTexture;
  data: Uint8Array;
  base: Uint8Array;
  w: number;
  h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h);
    this.base = new Uint8Array(w * h);
    this.tex = new THREE.DataTexture(this.data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    coverNode.value = this.tex;
    mapSize.value.set(w, h);
  }

  private stamp(arr: Uint8Array, x: number, y: number, bw: number, bh: number, s: number, v: number): void {
    const x0 = Math.max(0, x - s);
    const y0 = Math.max(0, y - s);
    const x1 = Math.min(this.w, x + bw + s);
    const y1 = Math.min(this.h, y + bh + s);
    for (let ty = y0; ty < y1; ty++) {
      const row = ty * this.w;
      for (let tx = x0; tx < x1; tx++) if (arr[row + tx] < v) arr[row + tx] = v;
    }
  }

  /** Réseau existant : bâtiments qui alimentent (x, y, largeur, hauteur, rayon en cases). */
  setNetwork(poles: { x: number; y: number; w: number; h: number; s: number }[]): void {
    this.base.fill(0);
    for (const p of poles) this.stamp(this.base, p.x, p.y, p.w, p.h, p.s, 128);
  }

  /** Affiche le réseau, plus la zone que couvriraient les bâtiments en cours de pose. */
  show(preview: { x: number; y: number; w: number; h: number; s: number }[]): void {
    this.data.set(this.base);
    for (const p of preview) this.stamp(this.data, p.x, p.y, p.w, p.h, p.s, 255);
    this.tex.needsUpdate = true;
    powerShow.value = 1;
  }

  hide(): void {
    powerShow.value = 0;
  }
}
