// Matériaux : couleur de sommet, teinte du joueur par instance (pièces « faction »), pièces lumineuses.
import * as THREE from "three/webgpu";
import { attribute, mix, instancedBufferAttribute, float, step, clamp, vec3 } from "three/tsl";

export interface TeamMesh {
  mesh: THREE.InstancedMesh;
  team: THREE.InstancedBufferAttribute;
}

/** InstancedMesh dont les pièces « faction » prennent la couleur de chaque instance. */
export function teamInstancedMesh(geometry: THREE.BufferGeometry, max: number): TeamMesh {
  const team = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  team.setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.65, metalness: 0.25 });
  const vcol = attribute("color", "vec3");
  const mask = attribute("mask", "float");
  const isFaction = clamp(mask, float(0), float(1)).mul(float(1).sub(step(float(1.5), mask)));
  const glow = step(float(1.5), mask);
  const tcol = instancedBufferAttribute(team, "vec3");
  mat.colorNode = mix(vcol, tcol, isFaction);
  mat.emissiveNode = vcol.mul(glow).mul(float(0.9)).add(vec3(0, 0, 0));
  const mesh = new THREE.InstancedMesh(geometry, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return { mesh, team };
}

export function setTeamColor(tm: TeamMesh, i: number, color: THREE.Color): void {
  tm.team.setXYZ(i, color.r, color.g, color.b);
}
