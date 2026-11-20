// Textures des modèles 3D : une matière répétable par catégorie de couleur des pièces (voir
// tools/textures/), réunies dans un atlas avec une marge raccordée autour de chaque case (pas de
// couture aux niveaux de détail). Les modèles n'ont pas de coordonnées de texture : projection
// triplanaire dans le repère du modèle. Canaux : rouge = détail (module la couleur), vert = relief,
// bleu = rugosité relative.
import * as THREE from "three/webgpu";
import { texture, uniform, vec2, vec3, float, fract, floor, mod, dFdx, dFdy, abs, pow, positionGeometry, normalGeometry, attribute } from "three/tsl";

type N = ReturnType<typeof float>;

/** Cases de l'atlas, dans l'ordre de tools/textures/manifest.mjs. */
export const MATERIAL_KEYS = ["armor", "metal", "dark", "hazard", "glass", "concrete"] as const;
/** Matière « sans texture » (pièces lumineuses). */
export const NO_TEXTURE = 5;
/**
 * Case de l'atlas de chaque matière (attribut « mat », voir MATERIAL_LAYER du générateur) : les cinq
 * premières ont la leur, le caoutchouc reprend le métal sombre, le cuivre le métal, le béton sa case.
 */
const LAYER_CELL = [0, 1, 2, 3, 4, 0, 2, 1, 5];

const files = import.meta.glob("../assets/textures/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const TILE = 512;
const PAD = 32;
const CELL = TILE + 2 * PAD;
const COLS = 3;
const ROWS = 2;

const placeholder = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
placeholder.needsUpdate = true;
const atlasNode = texture(placeholder);
/** 0 : couleurs unies, 1 : textures (réglage graphique) ; reste à 0 tant que l'atlas n'est pas chargé. */
export const texAmount = uniform(0);
let wanted = 1;
let loaded = false;

export function setTexturesEnabled(on: boolean): void {
  wanted = on ? 1 : 0;
  if (loaded) texAmount.value = wanted;
}

/** Charge les textures et construit l'atlas (une fois). */
export async function loadModelTextures(): Promise<void> {
  if (loaded) return;
  const canvas = document.createElement("canvas");
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await Promise.all(
    MATERIAL_KEYS.map(async (key, i) => {
      const url = Object.entries(files).find(([p]) => p.endsWith(`/${key}.webp`))?.[1];
      if (!url) return;
      const img = await createImageBitmap(await (await fetch(url)).blob());
      const x0 = (i % COLS) * CELL;
      const y0 = Math.floor(i / COLS) * CELL;
      // la case et sa marge : l'image répétée 3 x 3, découpée
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, CELL, CELL);
      ctx.clip();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ctx.drawImage(img, x0 + PAD + dx * TILE, y0 + PAD + dy * TILE, TILE, TILE);
      ctx.restore();
    }),
  );
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace; // données (détail, relief), pas des couleurs
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  atlasNode.value = tex;
  loaded = true;
  texAmount.value = wanted;
}

/**
 * Échantillon triplanaire de l'atlas pour la couche `mat` (attribut des sommets).
 * `scale` : répétitions de la texture par unité du repère du modèle.
 */
export function modelTexture(scale: number): { detail: N; height: N; rough: N; amount: N } {
  // couche de matière : premier composant de l'attribut « mat » (le second est l'occlusion ambiante)
  const mat = attribute("mat", "vec2").x;
  let layer: N = float(LAYER_CELL[LAYER_CELL.length - 1]) as unknown as N;
  for (let i = LAYER_CELL.length - 2; i >= 0; i--) layer = mat.lessThan(float(i + 0.5)).select(float(LAYER_CELL[i]), layer) as unknown as N;
  const cell = vec2(mod(layer, float(COLS)), floor(layer.div(COLS)));
  const cellUV = vec2(CELL / (COLS * CELL), CELL / (ROWS * CELL));
  const padUV = vec2(PAD / (COLS * CELL), PAD / (ROWS * CELL));
  const innerUV = vec2(TILE / (COLS * CELL), TILE / (ROWS * CELL));
  // repère du modèle (et non de l'instance) : la texture suit l'unité quand elle bouge ou tourne
  const p = positionGeometry.mul(scale);
  const sample = (t: ReturnType<typeof vec2>) => {
    const uv = cell.mul(cellUV).add(padUV).add(fract(t).mul(innerUV));
    // dérivées de la coordonnée continue : bon niveau de détail, pas de couture au raccord
    return atlasNode.sample(uv).grad(dFdx(t).mul(innerUV), dFdy(t).mul(innerUV));
  };
  const n = abs(normalGeometry);
  const w4 = pow(n, vec3(4, 4, 4));
  const w = w4.div(w4.x.add(w4.y).add(w4.z));
  const sx = sample(vec2(p.z, p.y));
  const sy = sample(vec2(p.x, p.z));
  const sz = sample(vec2(p.x, p.y));
  const t = sx.mul(w.x).add(sy.mul(w.y)).add(sz.mul(w.z));
  // pas de texture sur les pièces lumineuses
  const has = float(1).sub(abs(mat.sub(float(NO_TEXTURE))).lessThan(float(0.5)).select(float(1), float(0)));
  return { detail: t.r as unknown as N, height: t.g as unknown as N, rough: t.b as unknown as N, amount: texAmount.mul(has) as unknown as N };
}
