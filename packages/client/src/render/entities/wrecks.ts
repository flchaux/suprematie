// Rendu des entités, passe des épaves : la coque calcinée du modèle détruit, en partie arrachée (un
// maillage instancié par modèle, créé à la première épave), sinon un simple rocher.
import * as THREE from "three/webgpu";
import { WRECK_WORDS } from "@supreme/shared";
import { groundHeight } from "../terrain.ts";
import type { Entities } from "../entities.ts";
import { ANG, TILE, UP, tmpE, tmpM, tmpQ, tmpS, tmpV, type FrameCtx } from "./common.ts";

/** épaves dessinées par modèle (au plus) */
const WRECK_CAP = 1024;

/** Épaves de l'image. */
export function drawWrecks(e: Entities, ctx: FrameCtx): void {
  const { f, buf, strategic, seen } = ctx;
  // ----- épaves -----
  let nw = 0;
  for (const w of e.wreckMeshes.values()) w.mesh.count = 0;
  if (!strategic) {
    let o = f.wreckOff;
    for (let i = 0; i < f.nWrecks && nw < 6000; i++, o += WRECK_WORDS) {
      const x = buf[o] / TILE;
      const z = buf[o + 1] / TILE;
      if (!seen(x, z, 8)) continue;
      // modèle détruit : carcasse noire, tassée, un peu enfoncée et penchée
      const wm = wreckMesh(e, buf[o + 3] & 0xffff);
      if (wm && wm.mesh.count < WRECK_CAP) {
        const yaw = Math.PI / 2 - ((buf[o + 3] >>> 16) & 0xffff) * ANG;
        const h1 = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        const r1 = h1 - Math.floor(h1);
        const r2 = (h1 * 7.13) - Math.floor(h1 * 7.13);
        tmpQ.setFromEuler(tmpE.set((r1 - 0.5) * 0.22, yaw, (r2 - 0.5) * 0.22, "YXZ"));
        const sc = wm.scale;
        tmpM.compose(tmpV.set(x, groundHeight(e.map, x, z) - wm.height * 0.18, z), tmpQ, tmpS.set(sc, sc * 0.72, sc));
        wm.mesh.setMatrixAt(wm.mesh.count++, tmpM);
        continue;
      }
      const s = Math.min(4, 0.5 + (buf[o + 2] & 0xff) * 0.4);
      tmpQ.setFromAxisAngle(UP, x * 3.7 + z);
      tmpM.compose(tmpV.set(x, groundHeight(e.map, x, z) + 0.1, z), tmpQ, tmpS.set(s, s * 0.4, s));
      e.wrecks.setMatrixAt(nw++, tmpM);
    }
  }
  e.wrecks.count = nw;
  e.wrecks.instanceMatrix.needsUpdate = true;
  for (const w of e.wreckMeshes.values()) w.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Maillage d'épave d'un modèle (0 : inconnu ; 1 + type d'unité ; 0x8000 | type de bâtiment) : la
 * coque du modèle d'origine (sans ses pièces mobiles), en matière calcinée, percée de pans arrachés
 * (plus nombreux vers le haut, voir wreckGeometry). Créé à la première épave de ce modèle.
 */
function wreckMesh(e: Entities, model: number): { mesh: THREE.InstancedMesh; scale: number; height: number } | null {
  if (!model) return null;
  const hit = e.wreckMeshes.get(model);
  if (hit) return hit;
  const km = model & 0x8000 ? e.buildingMeshes[model & 0x7fff] : e.unitMeshes[model - 1];
  if (!km) return null;
  // matière calcinée simple (le relief vient de la géométrie arrachée)
  e.wreckMat ??= new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(wreckGeometry(km.built.body), e.wreckMat, WRECK_CAP);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  e.group.add(mesh);
  const w = { mesh, scale: km.scale, height: km.height };
  e.wreckMeshes.set(model, w);
  return w;
}

/**
 * Coque d'épave : les triangles du modèle (positions et normales seulement), dont on retire des pans
 * entiers, choisis par un hachage de la cellule de leur centre (déterministe), de plus en plus vers le haut.
 */
function wreckGeometry(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g0 = src.index ? src.toNonIndexed() : src;
  const pos = g0.getAttribute("position");
  const nor = g0.getAttribute("normal");
  const col = g0.getAttribute("color");
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    y0 = Math.min(y0, pos.getY(i));
    y1 = Math.max(y1, pos.getY(i));
  }
  const span = Math.max(1e-3, y1 - y0);
  const cellSize = Math.max(0.12, span / 4);
  const P: number[] = [];
  const N: number[] = [];
  const C: number[] = [];
  for (let t = 0; t + 2 < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    const h = Math.sin(Math.floor(cx / cellSize) * 12.9898 + Math.floor(cy / cellSize) * 78.233 + Math.floor(cz / cellSize) * 37.719) * 43758.5453;
    const r = h - Math.floor(h);
    const up = (cy - y0) / span;
    if (r > 0.95 - up * 0.5) continue;
    for (let k = 0; k < 3; k++) {
      P.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
      if (nor) N.push(nor.getX(t + k), nor.getY(t + k), nor.getZ(t + k));
      // teinte calcinée : la luminance d'origine, très assombrie (les volumes restent lisibles)
      const l = col ? 0.3 * col.getX(t + k) + 0.59 * col.getY(t + k) + 0.11 * col.getZ(t + k) : 0.5;
      const v = 0.035 + l * 0.14 + r * 0.025;
      C.push(v * 1.05, v, v * 0.95);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  if (nor) g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  else g.computeVertexNormals();
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  return g;
}
