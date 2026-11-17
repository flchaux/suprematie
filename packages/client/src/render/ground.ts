// Textures du sol : six matières répétables en couleur (voir tools/textures/, GROUND), réunies dans
// un atlas à marges raccordées, mélangées dans le shader du terrain selon des poids continus :
// une « chaîne » d'altitude (fond marin → sable → herbe → herbe sèche → neige) dont seules deux
// couches voisines sont lues en chaque point, la roche sur les pentes (projection triplanaire), un
// bruit à grande échelle pour les taches de végétation et une seconde lecture à grande échelle pour
// casser la répétition. Lectures inconditionnelles avec dérivées explicites (`.grad`) : valable en
// WebGPU comme en WebGL2, sans couture de niveau de détail au raccord des cases.
import * as THREE from "three/webgpu";
import {
  texture, vec2, vec3, float, fract, floor, mod, dFdx, dFdy, abs, pow, positionWorld, normalWorld, attribute,
  mx_noise_float, smoothstep, mix, clamp, dot, min, max, uniformArray,
} from "three/tsl";

type N = ReturnType<typeof float>;
type V2 = ReturnType<typeof vec2>;

/** Ordre des couches : identique à GROUND dans tools/textures/manifest.mjs. */
export const GROUND_KEYS = ["seabed", "sand", "grass", "dry", "snow", "rock"] as const;
const ROCK = 5;
/** Luminance moyenne de chaque couche (sRGB décodé), pour le mélange selon le relief des textures. */
const LUM = [0.35, 0.62, 0.34, 0.41, 0.81, 0.35];
/** Taille d'une répétition de texture, en cases. */
const TILE_CELLS = 7.5;
const ROCK_CELLS = 6;

const files = import.meta.glob("../assets/ground/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const TILE = 512;
const PAD = 32;
const CELL = TILE + 2 * PAD;
const COLS = 3;
const ROWS = 2;

const placeholder = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
placeholder.needsUpdate = true;
const atlasNode = texture(placeholder);
let loading: Promise<boolean> | null = null;

/** Charge les textures du sol et construit l'atlas (une fois) ; faux si indisponibles. */
export function loadGroundTextures(): Promise<boolean> {
  loading ??= (async () => {
    const canvas = document.createElement("canvas");
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    let n = 0;
    await Promise.all(
      GROUND_KEYS.map(async (key, i) => {
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
        n++;
      }),
    );
    if (n < GROUND_KEYS.length) return false;
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    atlasNode.value = tex;
    return true;
  })().catch((e) => {
    console.warn("textures du sol indisponibles", e);
    return false;
  });
  return loading;
}

const cellUV = vec2(CELL / (COLS * CELL), CELL / (ROWS * CELL));
const padUV = vec2(PAD / (COLS * CELL), PAD / (ROWS * CELL));
const innerUV = vec2(TILE / (COLS * CELL), TILE / (ROWS * CELL));

/** Lecture de la couche `layer` (nombre, éventuellement calculé) à la coordonnée continue `t` (en répétitions). */
function sampleLayer(layer: N, t: V2) {
  const cell = vec2(mod(layer, float(COLS)), floor(layer.div(COLS)));
  const uv = cell.mul(cellUV).add(padUV).add(fract(t).mul(innerUV));
  // dérivées de la coordonnée continue : bon niveau de détail même là où la couche change
  return atlasNode.sample(uv).grad(dFdx(t).mul(innerUV), dFdy(t).mul(innerUV)).rgb;
}

const lum = (c: ReturnType<typeof vec3>) => dot(c, vec3(0.3, 0.55, 0.15));

/**
 * Couleur du sol (linéaire) au point courant. Attribut des sommets « ground » : x = position dans
 * la chaîne d'altitude (0 fond marin … 4 neige), y = poids de la roche (pente).
 */
export function groundColor(): ReturnType<typeof vec3> {
  const g = attribute("ground", "vec2");
  const p2 = vec2(positionWorld.x, positionWorld.z);
  const macro = mx_noise_float(p2.mul(0.045)); // -1..1, grandes taches
  const mid = mx_noise_float(p2.mul(0.21));
  // taches : la chaîne est décalée par le bruit entre l'herbe et l'herbe sèche (jamais vers le sable)
  const zone = smoothstep(1.6, 2.0, g.x).mul(float(1).sub(smoothstep(3.1, 3.7, g.x)));
  const shifted = g.x.add(macro.mul(0.55).add(mid.mul(0.25)).mul(zone)).add(mid.mul(0.1));
  const tn = clamp(max(shifted, min(g.x, 2)), 0, 4);
  const la = floor(min(tn, 3.999));
  const lb = min(la.add(1), 4);
  const f = tn.sub(la);
  // coordonnées : légère déformation par le bruit (casse l'alignement des répétitions)
  const warp = vec2(mid, macro).mul(0.06);
  const uv = p2.div(TILE_CELLS).add(warp);
  // couche B tournée d'un quart de tour : deux couches voisines ne répètent pas le même motif
  const uvB = vec2(uv.y.negate(), uv.x).add(0.37);
  const ca = sampleLayer(la, uv);
  const cb = sampleLayer(lb, uvB);
  const lumArr = uniformArray(LUM, "float");
  const da = clamp(lum(ca).sub(lumArr.element(la.toInt())), -0.1, 0.1);
  const db = clamp(lum(cb).sub(lumArr.element(lb.toInt())), -0.1, 0.1);
  // mélange selon le relief des textures : 0 en f = 0, 1 en f = 1 (continu quand la couche change)
  const bw = smoothstep(0, 1, clamp(f.sub(0.5).mul(2.2).add(db.sub(da).mul(3)).add(0.5), 0, 1));
  let col = mix(ca, cb, bw);
  // roche : projection triplanaire (le dessus et les deux côtés), mêlée selon la pente
  const n = abs(normalWorld);
  const w4 = pow(n, vec3(4, 4, 4));
  const w = w4.div(w4.x.add(w4.y).add(w4.z));
  const pr = positionWorld.div(ROCK_CELLS);
  const rock = float(ROCK);
  const rx = sampleLayer(rock, vec2(pr.z, pr.y));
  const ry = sampleLayer(rock, vec2(pr.x, pr.z).add(0.5));
  const rz = sampleLayer(rock, vec2(pr.x, pr.y));
  const rc = rx.mul(w.x).add(ry.mul(w.y)).add(rz.mul(w.z));
  const rn = clamp(g.y.add(mid.mul(0.12)).add(macro.mul(0.08)), 0, 1);
  const dr = clamp(lum(rc).sub(LUM[ROCK]), -0.2, 0.2);
  const rw = smoothstep(0, 1, clamp(rn.sub(0.5).mul(3).add(dr.mul(3)).add(0.5), 0, 1)).mul(smoothstep(0.02, 0.15, g.y));
  col = mix(col, rc, rw);
  // seconde échelle (environ 37 cases, tournée) : variations lentes de luminosité
  const big = vec2(p2.x.mul(0.8).sub(p2.y.mul(0.6)), p2.x.mul(0.6).add(p2.y.mul(0.8))).div(37);
  const bl = lum(sampleLayer(float(3), big));
  const slow = float(1).add(clamp(bl.sub(LUM[3]), -0.1, 0.1));
  // teinte à grande échelle (comme l'ancien grain)
  const tint = mix(vec3(0.93, 0.96, 0.88), vec3(1.06, 1.02, 0.95), macro.mul(0.5).add(0.5));
  return max(col.mul(tint).mul(slow), vec3(0, 0, 0)) as unknown as ReturnType<typeof vec3>;
}
