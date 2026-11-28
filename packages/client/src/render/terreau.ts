// Terreau de la Souche au sol : autour de chaque racine et de chaque graine-mère poussées, l'herbe laisse
// place à un humus sombre brun-violet, mangé de mousse par taches et parcouru de fines veines de sève
// luminescentes ; à la lisière, l'herbe jaunit et des radicelles noires s'y enfoncent.
// Le grain vient des textures du sol (terre nue et herbe dense, voir terreauLayers dans ground.ts) : même
// définition que le reste du sol. La couverture est une carte à deux texels par case, adoucie (coins
// arrondis), lue avec un décalage bruité ; le bord suit en plus le relief de la texture, au pixel près.
// Tenue à jour là où un poteau pousse ou meurt, et case par case là où l'herbe est mangée.
// Terreau irrigué (à IRRIGATION cases au plus d'une racine, d'un rhizome ou d'une graine-mère : là où il sert,
// voir soil::REACH) : veines de sève et mousse ; au-delà, herbe mangée mais sèche : ni veines ni mousse, humus
// plus gris (seconde carte, `irr`).
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
/** Portée (cases) d'un poteau qui irrigue le terreau autour de lui (comme soil::REACH dans la simulation). */
export const IRRIGATION = 14;

const placeholder = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
placeholder.needsUpdate = true;
const coverNode = texture(placeholder);
const irrNode = texture(placeholder);
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
  // irrigué (à portée d'une racine) : 1 ; terreau sec au-delà : 0
  const wet = smoothstep(0.4, 0.6, irrNode.sample(p2.add(off).div(mapSize)).r);
  // humus brun-violet (marbré à grande échelle), mousse par taches au bord déchiqueté par le grain
  const tone = mix(vec3(0.055, 0.033, 0.047), vec3(0.105, 0.062, 0.095), smoothstep(-0.6, 0.6, big.add(fine.mul(0.3))));
  const humus = mix(tone, dirt.mul(vec3(0.22, 0.15, 0.26)), 0.3).mul(r);
  const mossW = smoothstep(0.12, 0.55, mid.mul(0.6).add(big.mul(0.5)));
  const mossK = smoothstep(0, 1, clamp(mossW.sub(0.5).mul(2.2).add(mossRel.sub(1).mul(3)).add(0.5), 0, 1));
  const moss = vec3(0.045, 0.115, 0.028).mul(clamp(mossRel.sub(1).mul(2.2).add(1), 0.4, 1.8));
  // terreau sec : humus délavé, plus gris et un peu plus clair, sans mousse
  const lum = humus.x.mul(0.3).add(humus.y.mul(0.5)).add(humus.z.mul(0.2));
  const dryHumus = mix(humus, vec3(lum, lum, lum).mul(1.3).add(vec3(0.014, 0.013, 0.012)), 0.55);
  const soil = mix(mix(dryHumus, humus, wet), moss, mossK.mul(0.85).mul(wet));
  // veines de sève : passages à zéro d'un bruit déformé, d'un ou deux pixels, par tronçons (elles
  // plongent dans l'humus et en ressortent), avec un léger halo ; capillaires plus fins ailleurs
  const warp = vec2(big.mul(1.6), mid.mul(0.9));
  const q = p2.add(warp);
  const vn = mx_noise_float(q.mul(0.45));
  const inside = smoothstep(0.6, 0.85, cov);
  const patchN = mx_noise_float(p2.mul(0.13).add(vec2(3.7, 9.1)));
  const broken = smoothstep(-0.35, 0.1, mid);
  const veinMask = smoothstep(0.05, 0.4, patchN).mul(inside).mul(broken).mul(wet);
  const cn = mx_noise_float(q.mul(1.9).add(vec2(4.1, 4.4)));
  const capMask = smoothstep(0.15, 0.5, patchN.negate()).mul(inside).mul(broken).mul(wet);
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

/** Secondes qu'une case mangée met à passer de l'herbe au terreau. */
const GROW = 3;
/** Période des relevés et des fondus, en secondes. */
const STEP = 0.2;

/**
 * Couverture du terreau : RES x RES texels par case (255 : terreau), d'après les poteaux de la Souche de la
 * trame et l'herbe mangée (sim/src/soil.rs). Tenue à jour rectangle par rectangle : seul ce qui change est
 * adouci de nouveau.
 */
export class TerreauCover {
  tex: THREE.DataTexture;
  data: Uint8Array;
  /** irrigation (255 : à portée d'un poteau), adoucie comme la couverture */
  irrTex: THREE.DataTexture;
  irr: Uint8Array;
  private irrRaw: Uint8Array;
  /** texels par case */
  readonly res = RES;
  /** augmente quand du terreau apparaît ou disparaît (plantes du décor à masquer) */
  changes = 0;
  private w: number;
  private h: number;
  private cw: number;
  private ch: number;
  /** couverture avant adoucissement */
  private raw: Uint8Array;
  private tmp: Uint8Array;
  private version = -1;
  private wait = 0;
  /** herbe mangée, par case (1 : mangée) ; null tant qu'on ne l'a pas reçue */
  private soil: Uint8Array | null = null;
  /** cases qui passent de l'herbe au terreau : avancement 0..255 */
  private growing = new Map<number, number>();
  /**
   * Poteaux poussés connus (référence -> emprise et portée ; `miss` : relevés où il manquait alors que sa
   * case était à l'écran). La trame ne contient que la zone vue, et pas les racines de très loin : ce qui
   * n'est plus à l'écran reste connu, le terreau ne se recalcule pas quand on promène la caméra.
   */
  private known = new Map<number, { x: number; z: number; w: number; h: number; s: number; miss: number }>();

  constructor(w: number, h: number) {
    this.cw = w;
    this.ch = h;
    this.w = w * RES;
    this.h = h * RES;
    this.data = new Uint8Array(this.w * this.h);
    this.raw = new Uint8Array(this.w * this.h);
    this.tmp = new Uint8Array(this.w * this.h);
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.irr = new Uint8Array(this.w * this.h);
    this.irrRaw = new Uint8Array(this.w * this.h);
    this.irrTex = new THREE.DataTexture(this.irr, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.irrTex.magFilter = THREE.LinearFilter;
    this.irrTex.minFilter = THREE.LinearFilter;
    this.irrTex.needsUpdate = true;
    coverNode.value = this.tex;
    irrNode.value = this.irrTex;
    mapSize.value.set(w, h);
    terreauShow.value = 0;
  }

  /** Terreau irrigué (à portée d'un poteau) sur la case (x, z) ? */
  wetAt(x: number, z: number): boolean {
    if (!this.at(x, z)) return false;
    return this.irr[(z * RES + (RES >> 1)) * this.w + x * RES + (RES >> 1)] > 120;
  }

  /** Terreau sur la case (x, z) ? */
  at(x: number, z: number): boolean {
    if (x < 0 || z < 0 || x >= this.cw || z >= this.ch) return false;
    return this.data[(z * RES + (RES >> 1)) * this.w + x * RES + (RES >> 1)] > 120;
  }

  /** Herbe mangée, reçue de la simulation : suites [longueur << 8 | joueur + 1]. Les nouvelles cases fondent. */
  setSoil(runs: Int32Array | number[]): void {
    const n = this.cw * this.ch;
    const first = this.soil === null;
    const old = this.soil;
    const soil = new Uint8Array(n);
    let i = 0;
    for (const v of runs) {
      const len = v >>> 8;
      if (v & 0xff) soil.fill(1, i, Math.min(n, i + len));
      i += len;
    }
    let gone = false;
    for (let k = 0; k < n; k++) {
      const was = old ? old[k] : 0;
      if (soil[k] === was) continue;
      if (was) {
        // replay, partie relue : de l'herbe est revenue
        gone = true;
        this.growing.delete(k);
      } else if (!first) this.growing.set(k, 1);
    }
    this.soil = soil;
    if (first || gone) this.rebuild(0, 0, this.cw, this.ch);
  }

  /**
   * Relevé des poteaux de la trame et avance des fondus (au plus toutes les 0,2 s). `view` : zone à l'écran
   * [x0, z0, x1, z1] ; `detailed` : la trame contient les racines (pas la vue stratégique).
   */
  update(f: Frame, data: GameData, dt: number, view: [number, number, number, number], detailed: boolean): void {
    this.wait -= dt;
    const due = this.wait <= 0;
    if (!due && f.buildingsVersion === this.version) return;
    if (due) this.wait = STEP;
    if (due || f.buildingsVersion !== this.version) this.poles(f, data, view, detailed);
    this.version = f.buildingsVersion;
    if (due) this.fade();
  }

  private poles(f: Frame, data: GameData, view: [number, number, number, number], detailed: boolean): void {
    const buf = f.buf;
    for (const p of this.known.values()) p.miss++;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const d = data.buildings[buf[o + 1] & 0xff];
      if (!d || d.race !== 1 || d.supply <= 0 || buf[o + 4] < 65536) continue;
      const ref = buf[o] >>> 0;
      const p = this.known.get(ref);
      if (p) p.miss = 0;
      else {
        const q = { x: buf[o + 2] & 0xffff, z: (buf[o + 2] >>> 16) & 0xffff, w: d.w, h: d.h, s: d.supply, miss: 0 };
        this.known.set(ref, q);
        this.rebuild(q.x - IRRIGATION, q.z - IRRIGATION, q.x + q.w + IRRIGATION, q.z + q.h + IRRIGATION);
      }
    }
    for (const [ref, p] of this.known) {
      // absent de la trame alors qu'il devrait y être (trois relevés de suite : une trame peut être en retard
      // sur la caméra) : il est mort
      const inView = detailed && p.x > view[0] + 2 && p.x < view[2] - 2 && p.z > view[1] + 2 && p.z < view[3] - 2;
      if (p.miss > 0 && !inView) p.miss = 0;
      else if (p.miss >= 3) {
        this.known.delete(ref);
        this.rebuild(p.x - IRRIGATION, p.z - IRRIGATION, p.x + p.w + IRRIGATION, p.z + p.h + IRRIGATION);
      }
    }
  }

  /** Fondu des cases mangées. */
  private fade(): void {
    if (!this.growing.size) return;
    const step = Math.ceil((255 * STEP) / GROW);
    for (const [k, v] of this.growing) {
      const nv = Math.min(255, v + step);
      if (nv >= 255) this.growing.delete(k);
      else this.growing.set(k, nv);
      const x = k % this.cw;
      const z = (k / this.cw) | 0;
      // sous la zone d'un poteau, la case est déjà du terreau
      if (this.raw[z * RES * this.w + x * RES] < nv) {
        for (let dz = 0; dz < RES; dz++) this.raw.fill(nv, (z * RES + dz) * this.w + x * RES, (z * RES + dz) * this.w + (x + 1) * RES);
        this.blur(this.raw, this.data, x * RES, z * RES, (x + 1) * RES, (z + 1) * RES);
      }
      if (v < 128 && nv >= 128) this.changes++;
    }
    this.tex.needsUpdate = true;
    terreauShow.value = 1;
  }

  /** Refait la couverture d'un rectangle de cases (bornes exclues à droite) d'après les poteaux et l'herbe mangée. */
  private rebuild(cx0: number, cz0: number, cx1: number, cz1: number): void {
    const x0 = Math.max(0, cx0), z0 = Math.max(0, cz0), x1 = Math.min(this.cw, cx1), z1 = Math.min(this.ch, cz1);
    if (x0 >= x1 || z0 >= z1) return;
    const W = this.w;
    const raw = this.raw;
    for (let z = z0 * RES; z < z1 * RES; z++) raw.fill(0, z * W + x0 * RES, z * W + x1 * RES);
    if (this.soil) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const k = z * this.cw + x;
          if (!this.soil[k]) continue;
          const v = this.growing.get(k) ?? 255;
          for (let dz = 0; dz < RES; dz++) raw.fill(v, (z * RES + dz) * W + x * RES, (z * RES + dz) * W + (x + 1) * RES);
        }
      }
    }
    const irr = this.irrRaw;
    for (let z = z0 * RES; z < z1 * RES; z++) irr.fill(0, z * W + x0 * RES, z * W + x1 * RES);
    for (const p of this.known.values()) {
      const ax = Math.max(x0, p.x - p.s), bx = Math.min(x1, p.x + p.w + p.s);
      const az = Math.max(z0, p.z - p.s), bz = Math.min(z1, p.z + p.h + p.s);
      if (ax < bx && az < bz) for (let z = az * RES; z < bz * RES; z++) raw.fill(255, z * W + ax * RES, z * W + bx * RES);
      // irrigation : le carré de portée du poteau (comme soil::nearest_pole)
      const ix = Math.max(x0, p.x - IRRIGATION), jx = Math.min(x1, p.x + p.w + IRRIGATION);
      const iz = Math.max(z0, p.z - IRRIGATION), jz = Math.min(z1, p.z + p.h + IRRIGATION);
      if (ix < jx && iz < jz) for (let z = iz * RES; z < jz * RES; z++) irr.fill(255, z * W + ix * RES, z * W + jx * RES);
    }
    this.blur(raw, this.data, x0 * RES, z0 * RES, x1 * RES, z1 * RES);
    this.blur(irr, this.irr, x0 * RES, z0 * RES, x1 * RES, z1 * RES);
    this.tex.needsUpdate = true;
    this.irrTex.needsUpdate = true;
    this.changes++;
    terreauShow.value = this.known.size > 0 || this.soil?.includes(1) ? 1 : 0;
  }

  /**
   * Adoucissement de `raw` dans `out`, sur le rectangle de texels [x0, x1[ × [z0, z1[ et son bord : moyenne glissante
   * horizontale puis verticale (le bord droit d'une zone reste à 0,5 sur sa limite).
   */
  private blur(raw: Uint8Array, out: Uint8Array, x0: number, z0: number, x1: number, z1: number): void {
    const W = this.w;
    const H = this.h;
    const tmp = this.tmp;
    const span = 2 * BLUR + 1;
    const ax = Math.max(0, x0 - BLUR), bx = Math.min(W, x1 + BLUR);
    const az = Math.max(0, z0 - BLUR), bz = Math.min(H, z1 + BLUR);
    const tz0 = Math.max(0, az - BLUR), tz1 = Math.min(H, bz + BLUR);
    for (let z = tz0; z < tz1; z++) {
      const row = z * W;
      let sum = 0;
      for (let x = Math.max(0, ax - BLUR); x <= ax + BLUR && x < W; x++) sum += raw[row + x];
      for (let x = ax; x < bx; x++) {
        tmp[row + x] = (sum / span + 0.5) | 0;
        if (x + BLUR + 1 < W) sum += raw[row + x + BLUR + 1];
        if (x - BLUR >= 0) sum -= raw[row + x - BLUR];
      }
    }
    for (let x = ax; x < bx; x++) {
      let sum = 0;
      for (let z = Math.max(0, az - BLUR); z <= az + BLUR && z < H; z++) sum += tmp[z * W + x];
      for (let z = az; z < bz; z++) {
        out[z * W + x] = (sum / span + 0.5) | 0;
        if (z + BLUR + 1 < H) sum += tmp[(z + BLUR + 1) * W + x];
        if (z - BLUR >= 0) sum -= tmp[(z - BLUR) * W + x];
      }
    }
  }
}
