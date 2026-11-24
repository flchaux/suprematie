// Matériaux : couleur de sommet, teinte du joueur par instance (pièces « faction »), pièces lumineuses.
import * as THREE from "three/webgpu";
import { attribute, mix, instancedBufferAttribute, float, vec3, step, clamp, positionView, normalView, dFdx, dFdy, cross, dot, sign, abs, normalize, mx_noise_float, positionGeometry, smoothstep } from "three/tsl";
import { fogFactor, applyFog } from "./fog.ts";
import { modelTexture } from "./textures.ts";

type N = ReturnType<typeof float>;

/** Répétitions de texture par unité du monde (une case = 1) : unités et bâtiments. */
export const TEX_PER_TILE_UNIT = 0.8;
export const TEX_PER_TILE_BUILDING = 0.33;

/**
 * Aspect métallique et rugosité de chaque couche de matière (attribut « mat », MATERIAL_LAYER et SKIN_LAYER du
 * générateur). Couches 6 à 8 : caoutchouc (mat), cuivre (très métallique, lisse), béton (mat, minéral) ;
 * 9 à 12, Souche : chitine (luisante), écorce (mate), chair (humide), os (mat) ; 13 à 20, Transhumants : plaques
 * rapiécées, acier usé, tôle grasse, peinture écaillée, rouille, bâche, planches, cuivre martelé.
 */
export const LAYER_METAL = [0.3, 0.62, 0.45, 0.2, 0.1, 0, 0, 0.85, 0, 0.2, 0, 0, 0, 0.5, 0.58, 0.4, 0.15, 0.1, 0, 0, 0.75];
export const LAYER_ROUGH = [0.5, 0.36, 0.5, 0.55, 0.1, 0.6, 0.85, 0.3, 0.88, 0.4, 0.85, 0.55, 0.62, 0.55, 0.46, 0.62, 0.58, 0.9, 0.95, 0.88, 0.42];

/** Première couche de récupération (Transhumants) : pour elles, le canal bleu de la texture est une part d'usure. */
export const LAYER_SALVAGE = 13;
/** Couches sans rouille : à partir de la bâche (taches), du cuivre (vert-de-gris). */
const LAYER_CANVAS = 18;
const LAYER_COPPER = 20;

export interface TeamMesh {
  mesh: THREE.InstancedMesh;
  team: THREE.InstancedBufferAttribute;
  /** teinte des pièces « ore » (ressource exploitée), par instance */
  accent: THREE.InstancedBufferAttribute;
}

/**
 * InstancedMesh dont les pièces « faction » prennent la couleur de chaque instance.
 * `texScale` : répétitions de la texture par unité du repère du modèle (0 : sans texture).
 */
export function teamInstancedMesh(geometry: THREE.BufferGeometry, max: number, texScale = 0): TeamMesh {
  const team = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  team.setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.65, metalness: 0.25 });
  const vcol = attribute("color", "vec3");
  // matière par pièce (attribut « mat ») : blindage peint, métal nu, métal sombre, peinture de danger,
  // verre, lumineux, caoutchouc, cuivre, béton, puis chitine, écorce, chair et os de la Souche. Le métal nu
  // est très métallique et assez lisse : il reflète l'environnement.
  const matAo = attribute("mat", "vec2");
  const layer = matAo.x;
  const byLayer = (v: number[]): N => {
    let node: N = float(v[v.length - 1]) as unknown as N;
    for (let i = v.length - 2; i >= 0; i--) node = layer.lessThan(float(i + 0.5)).select(float(v[i]), node) as unknown as N;
    return node;
  };
  const metal = byLayer(LAYER_METAL);
  const rough = byLayer(LAYER_ROUGH);
  // occlusion ambiante cuite au chargement (générateur) : sur la lumière indirecte, et un peu sur la directe
  const ao = matAo.y;
  mat.aoNode = ao;
  mat.metalnessNode = metal;
  mat.roughnessNode = rough;
  const mask = attribute("mask", "float");
  const isFaction = clamp(mask, float(0), float(1)).mul(float(1).sub(step(float(1.5), mask)));
  const isOre = step(float(3), mask);
  const glow = step(float(1.5), mask).mul(float(1).sub(isOre));
  const accent = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(0.6), 3);
  accent.setUsage(THREE.DynamicDrawUsage);
  const acol = instancedBufferAttribute(accent, "vec3");
  const tcol = instancedBufferAttribute(team, "vec3");
  // brouillard : les bâtiments ennemis explorés mais hors de vue restent assombris
  const fog = fogFactor();
  // couleur d'équipe : peinture sur métal, un peu désaturée et assombrie (moins « jouet »)
  const tlum = dot(tcol, vec3(0.2126, 0.7152, 0.0722));
  const paint = mix(vec3(tlum, tlum, tlum), tcol, float(0.78)).mul(0.82);
  let base = mix(mix(vcol, paint, isFaction), acol, isOre).mul(mix(float(1), ao, float(0.45)));
  if (texScale > 0) {
    const t = modelTexture(texScale);
    // détail : module la couleur autour de 1, avec une légère salissure (dans le repère du modèle : elle suit l'unité)
    const grime = mx_noise_float(positionGeometry.mul(0.35)).mul(0.08);
    const shade = mix(float(1), t.detail.mul(1.3).add(0.35).sub(grime), t.amount);
    // matières de récupération : l'usure lue dans la texture (0,3 : rien ; 0,95 : entière) teinte la pièce, en
    // rouille sur le métal et la peinture, en taches brunes sur la toile, en vert-de-gris sur le cuivre
    const salvage = step(float(LAYER_SALVAGE - 0.5), layer);
    const wear = smoothstep(float(0.4), float(0.8), t.rough).mul(salvage).mul(t.amount);
    const tint = layer.lessThan(float(LAYER_CANVAS - 0.5)).select(vec3(0.24, 0.075, 0.02), layer.lessThan(float(LAYER_COPPER - 0.5)).select(vec3(0.13, 0.08, 0.035), vec3(0.16, 0.34, 0.24)));
    base = mix(base, tint.mul(mix(float(1), ao, float(0.45))), wear.mul(0.88)).mul(shade);
    mat.metalnessNode = metal.mul(float(1).sub(wear.mul(0.85)));
    const relRough = mix(t.rough.sub(0.5).mul(0.35), wear.mul(0.35), salvage);
    mat.roughnessNode = mix(rough, rough.add(relRough), t.amount);
    // relief : perturbation de la normale par les dérivées de la hauteur (sans coordonnées de texture)
    const h = t.height.mul(t.amount).mul(0.025);
    const sx = dFdx(positionView);
    const sy = dFdy(positionView);
    const r1 = cross(sy, normalView);
    const r2 = cross(normalView, sx);
    const det = dot(sx, r1);
    const grad = sign(det).mul(r1.mul(dFdx(h)).add(r2.mul(dFdy(h))));
    mat.normalNode = normalize(abs(det).mul(normalView).sub(grad));
  }
  mat.colorNode = applyFog(base, fog);
  // pièces lumineuses : au-delà de 1 pour nourrir le halo (bloom)
  mat.emissiveNode = vcol.mul(glow).mul(float(1.6)).add(acol.mul(isOre).mul(float(0.9))).mul(fog);
  const mesh = new THREE.InstancedMesh(geometry, mat, max);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return { mesh, team, accent };
}

export function setAccentColor(tm: TeamMesh, i: number, color: THREE.Color): void {
  tm.accent.setXYZ(i, color.r, color.g, color.b);
  tm.accent.needsUpdate = true;
}

export function setTeamColor(tm: TeamMesh, i: number, color: THREE.Color): void {
  tm.team.setXYZ(i, color.r, color.g, color.b);
}
