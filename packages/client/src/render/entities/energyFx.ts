// Rendu des entités, champs d'énergie : bulles des boucliers (passe de dessin, matière détaillée et son
// motif d'alvéoles) et horizon des événements d'une porte de transit (matière ; la porte elle-même est
// placée par la passe des bâtiments, voir buildings.ts).
import * as THREE from "three/webgpu";
import { SHIELD_WORDS } from "@supreme/shared";
import { texture as tslTexture, uv, vec2, vec3, float, time, normalView } from "three/tsl";
import { groundHeight } from "../terrain.ts";
import type { Entities } from "../entities.ts";
import { TILE, tmpC, tmpM, tmpQ, tmpS, tmpV, type FrameCtx } from "./common.ts";

/** Bulles des boucliers de l'image, à la couleur de leur équipe. */
export function drawShields(e: Entities, ctx: FrameCtx): void {
  const { f, buf, seen } = ctx;
  // ----- boucliers -----
  let ns = 0;
  let o = f.shieldOff;
  for (let i = 0; i < f.nShields && ns < 400; i++, o += SHIELD_WORDS) {
    const x = buf[o] / TILE;
    const z = buf[o + 1] / TILE;
    if (!seen(x, z, 1)) continue;
    const r = buf[o + 2] / TILE;
    const team = buf[o + 3] & 0xff;
    const pct = (buf[o + 3] >> 8) / 100;
    tmpM.compose(tmpV.set(x, groundHeight(e.map, x, z), z), tmpQ.identity(), tmpS.set(r, r * 0.6, r));
    e.shields.setMatrixAt(ns, tmpM);
    // couleur de l'équipe : premier joueur de cette équipe
    const p = f.players.findIndex((pl) => pl.team === team);
    e.shields.setColorAt(ns, tmpC.copy(e.teamColors[Math.max(0, p) % 8]).lerp(new THREE.Color(0x88ddff), 0.5).multiplyScalar(0.4 + pct * 0.6));
    ns++;
  }
  e.shields.count = ns;
  e.shields.instanceMatrix.needsUpdate = true;
  if (e.shields.instanceColor) e.shields.instanceColor.needsUpdate = true;
}

/**
 * Horizon des événements d'une porte : disque bleu d'eau lumineuse, ondes concentriques qui partent du
 * centre, bord plus clair, reflets qui tournent lentement.
 */
export function vortexMaterial(): THREE.Material {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const p = uv().sub(vec2(0.5, 0.5));
  const d = p.length().mul(2);
  const ripple = d.mul(22).sub(time.mul(3.2)).sin().mul(0.5).add(0.5);
  const swirl = p.x.mul(9).add(time.mul(0.8)).sin().mul(p.y.mul(9).sub(time.mul(0.6)).cos()).mul(0.5).add(0.5);
  const edge = d.pow(6);
  const glow = ripple.mul(0.35).add(swirl.mul(0.25)).add(edge.mul(0.9)).add(0.3);
  m.colorNode = vec3(0.35, 0.7, 1.4).mul(glow).add(vec3(0.6, 0.85, 1).mul(edge));
  m.opacityNode = float(0.85).mul(float(1).sub(d.pow(14)));
  return m;
}

/** Motif d'alvéoles hexagonales (traits blancs sur fond transparent), répété sur la bulle des boucliers. */
function hexTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = Math.round(w * Math.sqrt(3));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineWidth = 3;
  const r = w / 3;
  const hex = (cx: number, cy: number) => {
    g.beginPath();
    for (let k = 0; k <= 6; k++) {
      const a = (Math.PI / 3) * k;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  // pavage qui se raccorde sur les bords (deux colonnes décalées)
  const dy = (r * Math.sqrt(3)) / 2;
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2], [r * 1.5 - w / 2 + w / 2, dy], [0, h / 2], [w, h / 2], [w / 2, 0], [w / 2, h]]) hex(cx, cy);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Bulle de bouclier détaillée : bord lumineux (plus le regard est rasant, plus elle brille), alvéoles
 * hexagonales qui glissent lentement, vague lumineuse qui parcourt la bulle. Couleur : celle de l'instance.
 */
export function shieldMaterial(): THREE.Material {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const hex = tslTexture(hexTexture(), uv().mul(vec2(16, 8)).add(vec2(time.mul(0.015), 0))).a;
  const rim = float(1).sub(normalView.z.abs()).pow(2.4);
  const wave = uv().y.mul(26).sub(time.mul(1.6)).sin().mul(0.5).add(0.5);
  const a = rim.mul(0.75).add(hex.mul(0.22).mul(wave.mul(0.6).add(0.4))).add(0.025);
  m.colorNode = vec3(1).mul(rim.mul(1.4).add(1));
  m.opacityNode = a.clamp(0, 1);
  return m;
}
