// Terreau de la Souche au sol : autour de chaque racine et de chaque graine-mère poussées, l'herbe laisse
// place à une terre végétalisée sombre, marbrée de mousse et parcourue de veines de sève luminescentes.
// Une valeur par case (comme le brouillard de guerre), lue avec un bord bruité pour que la lisière ondule
// au lieu de suivre les cases. Recalculée seulement quand les bâtiments changent (ou toutes les secondes).
import * as THREE from "three/webgpu";
import { texture, positionWorld, vec2, vec3, mix, uniform, float, smoothstep, mx_noise_float, abs, pow } from "three/tsl";
import { BUILDING_WORDS } from "@supreme/shared";
import type { Frame, GameData } from "@supreme/shared";

type V3 = ReturnType<typeof vec3>;

const placeholder = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
placeholder.needsUpdate = true;
const coverNode = texture(placeholder);
const mapSize = uniform(new THREE.Vector2(1, 1));
/** 0 tant qu'aucune case n'est couverte (le mélange coûte alors une lecture, sans effet). */
const terreauShow = uniform(0);

/** Couleur du sol avec le terreau (avant le brouillard). */
export function applyTerreau<T>(input: T): T {
  const color = input as unknown as V3;
  const p2 = vec2(positionWorld.x, positionWorld.z);
  const mottle = mx_noise_float(p2.mul(0.33));
  const grain = mx_noise_float(p2.mul(1.9));
  const veinN = mx_noise_float(p2.mul(0.55).add(vec2(13.1, 7.7)));
  // lisière bruitée : la lecture est décalée d'une demi-case environ
  const cov = coverNode.sample(p2.add(vec2(mottle.mul(0.7), grain.mul(0.35))).div(mapSize)).r;
  const k = smoothstep(0.28, 0.62, cov).mul(terreauShow);
  // humus brun-violet sombre, taches de mousse, grain fin
  const humus = mix(vec3(0.07, 0.045, 0.05), vec3(0.095, 0.06, 0.085), smoothstep(-0.5, 0.5, grain));
  const soil = mix(humus, vec3(0.07, 0.13, 0.035), smoothstep(-0.1, 0.65, mottle)).mul(float(1).add(grain.mul(0.16)));
  // veines de sève : crêtes fines d'un bruit, vert acide, par endroits seulement (un second bruit les éteint)
  const patch = smoothstep(0.05, 0.45, mx_noise_float(p2.mul(0.12).add(vec2(3.7, 9.1))));
  const vein = pow(float(1).sub(abs(veinN)), float(36)).mul(patch).mul(smoothstep(0.45, 0.8, cov));
  const lit = mix(soil, vec3(0.2, 0.55, 0.14), vein.mul(0.55));
  // frange : l'herbe jaunit et s'assombrit à la lisière
  const fringe = smoothstep(0.05, 0.3, cov).mul(float(1).sub(k)).mul(terreauShow);
  const edged = mix(color, color.mul(vec3(0.62, 0.58, 0.42)), fringe.mul(0.7));
  return mix(edged, lit, k) as unknown as T;
}

/** Couverture du terreau : une case par octet (255 : terreau), d'après les poteaux de la Souche de la trame. */
export class TerreauCover {
  tex: THREE.DataTexture;
  data: Uint8Array;
  private w: number;
  private h: number;
  private version = -1;
  private sig = -1;
  private wait = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h);
    this.tex = new THREE.DataTexture(this.data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    coverNode.value = this.tex;
    mapSize.value.set(w, h);
    terreauShow.value = 0;
  }

  /** Recalcule la couverture quand les bâtiments ont changé (ou au plus toutes les secondes). */
  update(f: Frame, data: GameData, dt: number): void {
    this.wait -= dt;
    if (f.buildingsVersion === this.version && this.wait > 0) return;
    this.version = f.buildingsVersion;
    this.wait = 1;
    const buf = f.buf;
    // signature des poteaux poussés (position, taille, portée) : rien à refaire si elle n'a pas changé
    let sig = 0;
    let n = 0;
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const d = data.buildings[buf[o + 1] & 0xff];
      if (!d || d.race !== 1 || d.supply <= 0 || buf[o + 4] < 65536) continue;
      sig = (Math.imul(sig, 31) + (buf[o + 2] >>> 0) + d.supply) | 0;
      n++;
    }
    sig = (sig + n) | 0;
    if (sig === this.sig) return;
    this.sig = sig;
    const out = this.data;
    out.fill(0);
    for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
      const d = data.buildings[buf[o + 1] & 0xff];
      if (!d || d.race !== 1 || d.supply <= 0 || buf[o + 4] < 65536) continue;
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      const s = d.supply;
      const x0 = Math.max(0, bx - s);
      const z0 = Math.max(0, bz - s);
      const x1 = Math.min(this.w, bx + d.w + s);
      const z1 = Math.min(this.h, bz + d.h + s);
      for (let z = z0; z < z1; z++) out.fill(255, z * this.w + x0, z * this.w + x1);
    }
    this.tex.needsUpdate = true;
    terreauShow.value = n > 0 ? 1 : 0;
  }
}
