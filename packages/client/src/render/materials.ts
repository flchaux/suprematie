// Matériaux : couleur de sommet, teinte du joueur par instance (pièces « faction »), pièces lumineuses.
import * as THREE from "three/webgpu";
import { attribute, mix, instancedBufferAttribute, float, step, clamp, positionView, normalView, dFdx, dFdy, cross, dot, sign, abs, normalize, mx_noise_float, positionGeometry } from "three/tsl";
import { fogFactor, applyFog } from "./fog.ts";
import { modelTexture } from "./textures.ts";

/** Répétitions de texture par unité du monde (une case = 1) : unités et bâtiments. */
export const TEX_PER_TILE_UNIT = 0.8;
export const TEX_PER_TILE_BUILDING = 0.33;

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
  let base = mix(mix(vcol, tcol, isFaction), acol, isOre);
  if (texScale > 0) {
    const t = modelTexture(texScale);
    // détail : module la couleur autour de 1, avec une légère salissure (dans le repère du modèle : elle suit l'unité)
    const grime = mx_noise_float(positionGeometry.mul(0.35)).mul(0.08);
    base = base.mul(mix(float(1), t.detail.mul(1.3).add(0.35).sub(grime), t.amount));
    mat.roughnessNode = mix(float(0.65), t.rough.sub(0.5).mul(0.5).add(0.62), t.amount);
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
