// Terreau de la Souche au sol : autour de chaque racine et de chaque graine-mère poussées, l'herbe laisse
// place à un humus sombre brun-violet, mangé de mousse par taches et parcouru de fines veines de sève
// luminescentes ; à la lisière, l'herbe jaunit et des radicelles noires s'y enfoncent.
// Le grain vient des textures du sol (terre nue et herbe dense, voir terreauLayers dans ground.ts) : même
// définition que le reste du sol. La couverture est une carte à deux texels par case, adoucie (coins
// arrondis), lue avec un décalage bruité ; le bord suit en plus le relief de la texture, au pixel près.
// Recalculée seulement quand les poteaux poussés connus changent.
import * as THREE from "three/webgpu";
import { texture, positionWorld, vec2, vec3, mix, uniform, float, smoothstep, mx_noise_float, abs, clamp, fwidth } from "three/tsl";
import { BUILDING_WORDS } from "@supreme/shared";
import type { Frame, GameData } from "@supreme/shared";
import { terreauLayers } from "./ground.ts";

type V3 = ReturnType<typeof vec3>;
type N = ReturnType<typeof float>;

/** Texels de la carte de couverture par case. */
const RES = 2;
/** Rayon de l'adoucissement de la couverture, en texels (arrondit les coins d'environ une case et demie). */
const BLUR = 3;

const placeholder = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
placeholder.needsUpdate = true;
const coverNode = texture(placeholder);
const mapSize = uniform(new THREE.Vector2(1, 1));
/** 0 tant qu'aucune case n'est couverte. */
const terreauShow = uniform(0);

type Noise = ReturnType<typeof mx_noise_float>;
/**
 * Ligne là où le bruit `n` passe par zéro, d'épaisseur constante à l'écran (`px` pixels environ), sans
 * crénelage ; `w` : épaisseur en plus, en unités du bruit (visible de près seulement).
 */
const line = (n: Noise, px: number, w = 0): N => {
  const fw = fwidth(n);
  return float(1).sub(smoothstep(fw.mul(px * 0.5).add(w), fw.mul(px * 0.5 + 1).add(w), abs(n))) as unknown as N;
};

/**
 * Couleur du sol avec le terreau (avant le brouillard). `textured` : le grain vient de l'atlas du sol
 * (matériau détaillé) ; sinon d'un bruit fin (matériau simple).
 */
export function applyTerreau<T>(input: T, textured = false): T {
  const base = input as unknown as V3;
  const p2 = vec2(positionWorld.x, positionWorld.z);
  const big = mx_noise_float(p2.mul(0.21));
  const mid = mx_noise_float(p2.mul(0.77).add(vec2(5.3, 1.9)));
  const fine = mx_noise_float(p2.mul(2.9).add(vec2(-7.1, 3.3)));
  // grain : relief de la terre et de la mousse autour de 1, contraste renforcé
  let relief: N;
  let mossRel: N;
  let dirt: V3;
  if (textured) {
    const L = terreauLayers(p2);
    relief = L.relief;
    mossRel = L.moss;
    dirt = L.dirt as unknown as V3;
  } else {
    const f2 = mx_noise_float(p2.mul(6.3).add(vec2(2.2, -8.4)));
    const f3 = mx_noise_float(p2.mul(13.7).add(vec2(-3.9, 6.1)));
    relief = float(1).add(fine.mul(0.08)).add(f2.mul(0.06)).add(f3.mul(0.045)) as unknown as N;
    mossRel = float(1).add(f2.mul(0.08)).add(f3.mul(0.07)) as unknown as N;
    dirt = vec3(0.36, 0.28, 0.19).mul(relief) as unknown as V3;
  }
  const d = relief.sub(1).mul(3.2);
  const r = clamp(d.add(1), 0.3, 2.2);
  // couverture : lecture décalée (jusqu'à une case environ) par un bruit sur trois octaves, seuil modulé par le grain
  const off = vec2(big.mul(0.9).add(mid.mul(0.45)).add(fine.mul(0.16)), mid.mul(0.7).sub(big.mul(0.6)).sub(fine.mul(0.14)));
  const cov = coverNode.sample(p2.add(off).div(mapSize)).r;
  const k = smoothstep(0.42, 0.58, cov.add(d.mul(0.3))).mul(terreauShow);
  // humus brun-violet (marbré à grande échelle), mousse par taches au bord déchiqueté par le grain
  const tone = mix(vec3(0.055, 0.033, 0.047), vec3(0.105, 0.062, 0.095), smoothstep(-0.6, 0.6, big.add(fine.mul(0.3))));
  const humus = mix(tone, dirt.mul(vec3(0.22, 0.15, 0.26)), 0.3).mul(r);
  const mossW = smoothstep(0.12, 0.55, mid.mul(0.6).add(big.mul(0.5)));
  const mossK = smoothstep(0, 1, clamp(mossW.sub(0.5).mul(2.2).add(mossRel.sub(1).mul(3)).add(0.5), 0, 1));
  const moss = vec3(0.045, 0.115, 0.028).mul(clamp(mossRel.sub(1).mul(2.2).add(1), 0.4, 1.8));
  const soil = mix(humus, moss, mossK.mul(0.85));
  // veines de sève : passages à zéro d'un bruit déformé, d'un ou deux pixels, par tronçons (elles
  // plongent dans l'humus et en ressortent), avec un léger halo ; capillaires plus fins ailleurs
  const warp = vec2(big.mul(1.6), mid.mul(0.9));
  const q = p2.add(warp);
  const vn = mx_noise_float(q.mul(0.45));
  const inside = smoothstep(0.6, 0.85, cov);
  const patchN = mx_noise_float(p2.mul(0.13).add(vec2(3.7, 9.1)));
  const broken = smoothstep(-0.35, 0.1, mid);
  const veinMask = smoothstep(0.05, 0.4, patchN).mul(inside).mul(broken);
  const cn = mx_noise_float(q.mul(1.9).add(vec2(4.1, 4.4)));
  const capMask = smoothstep(0.15, 0.5, patchN.negate()).mul(inside).mul(broken);
  // de loin, les veines s'estompent et perdent leur halo (une case ne fait plus que quelques pixels)
  const far = smoothstep(0.02, 0.07, fwidth(p2.x).add(fwidth(p2.y)));
  const halo = float(1).sub(smoothstep(0, fwidth(vn).mul(5).add(0.012), abs(vn))).mul(veinMask).mul(float(1).sub(far));
  const sap = line(vn, 1.6, 0.003).mul(veinMask).mul(float(1).sub(far.mul(0.75))).add(line(cn, 1, 0.001).mul(capMask).mul(0.4)) as unknown as N;
  const lit = mix(soil.add(vec3(0.02, 0.07, 0.01).mul(halo)), vec3(0.28, 0.8, 0.1), clamp(sap, 0, 1));
  // lisière : l'herbe jaunit et s'assombrit, des radicelles noires s'y enfoncent
  const fringe = smoothstep(0.12, 0.46, cov.add(d.mul(0.25))).mul(float(1).sub(k)).mul(terreauShow);
  const rootlet = line(cn, 1.6, 0.004).mul(smoothstep(0.2, 0.42, cov));
  const edged = mix(mix(base, base.mul(vec3(0.55, 0.5, 0.36)), fringe.mul(0.75)), vec3(0.04, 0.025, 0.032), rootlet.mul(fringe).mul(0.9));
  return mix(edged, lit, k) as unknown as T;
}

/** Couverture du terreau : RES x RES texels par case (255 : terreau), d'après les poteaux de la Souche de la trame. */
export class TerreauCover {
  tex: THREE.DataTexture;
  data: Uint8Array;
  /** texels par case */
  readonly res = RES;
  private w: number;
  private h: number;
  private tmp: Uint8Array;
  private version = -1;
  private wait = 0;
  /**
   * Poteaux poussés connus (référence -> emprise et portée ; `miss` : relevés où il manquait alors que sa
   * case était à l'écran). La trame ne contient que la zone vue, et pas les racines de très loin : ce qui
   * n'est plus à l'écran reste connu, le terreau ne se recalcule pas quand on promène la caméra.
   */
  private known = new Map<number, { x: number; z: number; w: number; h: number; s: number; miss: number }>();

  constructor(w: number, h: number) {
    this.w = w * RES;
    this.h = h * RES;
    this.data = new Uint8Array(this.w * this.h);
    this.tmp = new Uint8Array(this.w * this.h);
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    coverNode.value = this.tex;
    mapSize.value.set(w, h);
    terreauShow.value = 0;
  }

  /**
   * Recalcule la couverture quand les poteaux connus ont changé (relevé de la trame à chaque changement de
   * bâtiments, et au plus toutes les 0,3 s). `view` : zone à l'écran [x0, z0, x1, z1] ; `detailed` : la trame
   * contient les racines (pas la vue stratégique).
   */
  update(f: Frame, data: GameData, dt: number, view: [number, number, number, number], detailed: boolean): void {
    this.wait -= dt;
    if (f.buildingsVersion === this.version && this.wait > 0) return;
    this.version = f.buildingsVersion;
    this.wait = 0.3;
    const buf = f.buf;
    let dirty = false;
    for (const p of this.known.values()) p.miss++;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const d = data.buildings[buf[o + 1] & 0xff];
      if (!d || d.race !== 1 || d.supply <= 0 || buf[o + 4] < 65536) continue;
      const ref = buf[o] >>> 0;
      const p = this.known.get(ref);
      if (p) p.miss = 0;
      else {
        this.known.set(ref, { x: buf[o + 2] & 0xffff, z: (buf[o + 2] >>> 16) & 0xffff, w: d.w, h: d.h, s: d.supply, miss: 0 });
        dirty = true;
      }
    }
    for (const [ref, p] of this.known) {
      // absent de la trame alors qu'il devrait y être (trois relevés de suite : une trame peut être en retard
      // sur la caméra) : il est mort
      const inView = detailed && p.x > view[0] + 2 && p.x < view[2] - 2 && p.z > view[1] + 2 && p.z < view[3] - 2;
      if (p.miss > 0 && !inView) p.miss = 0;
      else if (p.miss >= 3) {
        this.known.delete(ref);
        dirty = true;
      }
    }
    if (!dirty) return;
    const W = this.w;
    const H = this.h;
    const raw = this.tmp;
    raw.fill(0);
    for (const p of this.known.values()) {
      const x0 = Math.max(0, (p.x - p.s) * RES);
      const z0 = Math.max(0, (p.z - p.s) * RES);
      const x1 = Math.min(W, (p.x + p.w + p.s) * RES);
      const z1 = Math.min(H, (p.z + p.h + p.s) * RES);
      for (let z = z0; z < z1; z++) raw.fill(255, z * W + x0, z * W + x1);
    }
    // adoucissement : moyenne glissante horizontale puis verticale (le bord droit reste à 0,5 sur la limite)
    const out = this.data;
    const span = 2 * BLUR + 1;
    for (let z = 0; z < H; z++) {
      const row = z * W;
      let sum = 0;
      for (let x = 0; x <= BLUR && x < W; x++) sum += raw[row + x];
      for (let x = 0; x < W; x++) {
        out[row + x] = (sum / span + 0.5) | 0;
        if (x + BLUR + 1 < W) sum += raw[row + x + BLUR + 1];
        if (x - BLUR >= 0) sum -= raw[row + x - BLUR];
      }
    }
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let z = 0; z <= BLUR && z < H; z++) sum += out[z * W + x];
      for (let z = 0; z < H; z++) {
        raw[z * W + x] = (sum / span + 0.5) | 0;
        if (z + BLUR + 1 < H) sum += out[(z + BLUR + 1) * W + x];
        if (z - BLUR >= 0) sum -= out[(z - BLUR) * W + x];
      }
    }
    out.set(raw);
    this.tex.needsUpdate = true;
    terreauShow.value = this.known.size > 0 ? 1 : 0;
  }
}
