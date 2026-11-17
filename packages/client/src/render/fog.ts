// Brouillard de guerre partagé par tous les matériaux (terrain, eau, bâtiments, unités) :
// une texture de visibilité lissée, échantillonnée en 5 points pour adoucir les bords.
import * as THREE from "three/webgpu";
import { texture, positionWorld, vec2, float, mix, uniform, vec3, dot } from "three/tsl";

type N = ReturnType<typeof float>;

const placeholder = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
placeholder.needsUpdate = true;

/** Texture de visibilité courante (remplacée à chaque nouvelle carte). */
export const fogTexture = texture(placeholder);
/** Taille de la carte (cases) et taille d'un texel de la texture (en UV). */
export const fogMapSize = uniform(new THREE.Vector2(1, 1));
export const fogTexel = uniform(new THREE.Vector2(1, 1));
/** 0 : pas de brouillard (spectateur, replay), 1 : brouillard actif. */
export const fogEnabled = uniform(1);

/** Facteur de visibilité 0..1 au point du monde courant (1 = vu). */
export function fogFactor(): N {
  const uv = vec2(positionWorld.x, positionWorld.z).div(fogMapSize);
  const d = fogTexel.mul(0.85);
  const s = fogTexture.sample(uv).r.mul(2)
    .add(fogTexture.sample(uv.add(vec2(d.x, d.y))).r)
    .add(fogTexture.sample(uv.add(vec2(d.x.negate(), d.y))).r)
    .add(fogTexture.sample(uv.add(vec2(d.x, d.y.negate()))).r)
    .add(fogTexture.sample(uv.add(vec2(d.x.negate(), d.y.negate()))).r)
    .div(6);
  return mix(float(1), s, fogEnabled) as unknown as N;
}

/** Applique le brouillard à une couleur : assombrit et désature les zones non vues. */
export function applyFog(color: N, f: N): N {
  const lum = dot(color, vec3(0.3, 0.55, 0.15));
  const grey = vec3(lum, lum, lum).mul(vec3(0.8, 0.88, 1.05));
  const desat = mix(grey, color, f.mul(f));
  return desat.mul(f.mul(0.88).add(0.12)) as unknown as N;
}

export function setFogTexture(tex: THREE.DataTexture, mapW: number, mapH: number): void {
  fogTexture.value = tex;
  fogMapSize.value.set(mapW, mapH);
  fogTexel.value.set(1 / tex.image.width, 1 / tex.image.height);
}
