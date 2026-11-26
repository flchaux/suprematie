// Rendu des entités, passe des projectiles : ogives matérielles (balles, obus, missiles, bombes,
// torpilles) et leur lueur, traits d'énergie (cœur et halo), frappe orbitale, rayons prolongés de la
// source à la cible ; éclairs de départ et traînées (effects.ts).
import * as THREE from "three/webgpu";
import { PROJ_WORDS, Layer } from "@supreme/shared";
import { groundHeight, HSCALE } from "../terrain.ts";
import { parseCond } from "../../models/generator.ts";
import type { Entities } from "../entities.ts";
import { TILE, tmpC, tmpM, tmpQ, tmpS, tmpV, tmpV2, type FrameCtx } from "./common.ts";

const PROJ_COLORS: Record<number, number> = { 0: 0xffd27a, 1: 0xffb050, 2: 0xff7050, 3: 0x404040, 4: 0x9fd0ff, 5: 0x7fffff, 6: 0x7dfcff, 7: 0x9db7ff, 8: 0xff5050, 9: 0xff2a2a, 10: 0xff9030, 11: 0xc8ecff, 13: 0x9adf3a };
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/**
 * Apparence de chaque famille de projectiles (en cases).
 * - matériels : slug = [diamètre, longueur] de l'ogive, color = teinte du métal, grow = grossit un peu pour
 *   les armes à grand rayon d'effet ; tail = lueur derrière [diamètre, longueur, recul, couleur, intensité]
 *   (traceur des balles, culot chaud des obus, flamme des missiles) ;
 * - énergie : core / halo = [diamètre, longueur] du cœur et du halo, k = intensité du cœur.
 */
interface ProjLook {
  slug?: [number, number];
  color: number;
  grow?: boolean;
  tail?: [number, number, number, number, number];
  core?: [number, number];
  halo?: [number, number];
  k?: number;
}
const PROJ_LOOKS: Record<number, ProjLook> = {
  0: { slug: [0.045, 0.16], color: 0xd8a850, tail: [0.035, 0.7, 0.3, 0xffb060, 1.2] },
  1: { slug: [0.085, 0.26], color: 0x4a5058, grow: true, tail: [0.08, 0.16, 0.02, 0xff9a40, 2.6] },
  2: { slug: [0.07, 0.34], color: 0xc4c9cf, grow: true, tail: [0.09, 0.26, 0.08, 0xffc070, 3] },
  3: { slug: [0.13, 0.36], color: 0x3c4232, grow: true },
  4: { slug: [0.08, 0.42], color: 0x2e353c, tail: [0.05, 0.12, 0.02, 0x9fd0ff, 1.4] },
  5: { color: 0x7fffff, core: [0.18, 0.3], halo: [0.45, 0.6], k: 2.8 },
  6: { color: 0x7dfcff, core: [0.15, 0.24], halo: [0.38, 0.48], k: 2.8 },
  7: { color: 0x9db7ff, core: [0.17, 0.2], halo: [0.48, 0.5], k: 2.6 },
  8: { color: 0xff5050, core: [0.05, 1.1], halo: [0.15, 1.3], k: 3.2 },
  9: { color: 0xff2a2a, core: [0.045, 0.9], halo: [0.14, 1.05], k: 3.4 },
  11: { color: 0xc8ecff, core: [0.03, 3], halo: [0.11, 3.2], k: 3.4 },
  // crachat acide d'un nid : boule verte baveuse
  13: { color: 0x9adf3a, core: [0.16, 0.22], halo: [0.42, 0.5], k: 2 },
};

/** Projectiles de l'image. */
export function drawProjectiles(e: Entities, ctx: FrameCtx): void {
  const { f, buf, alpha, dt, spectator, seen, now, fx, tickDelta } = ctx;
  // ----- projectiles -----
  let np = 0;
  let nk = 0;
  let nb = 0;
  let o = f.projOff;
  for (let i = 0; i < f.nProj && np < 8000; i++, o += PROJ_WORDS) {
    const t = ((buf[o + 4] & 0xffff) + alpha) / Math.max(1, (buf[o + 4] >>> 16) & 0xffff);
    const wi = buf[o + 5] & 0xff;
    const special = (buf[o + 5] >> 16) & 0xff;
    const x0 = buf[o] / TILE;
    const z0 = buf[o + 1] / TILE;
    const x1 = buf[o + 2] / TILE;
    const z1 = buf[o + 3] / TILE;
    const tt = Math.min(1, t);
    const x = x0 + (x1 - x0) * tt;
    const z = z0 + (z1 - z0) * tt;
    if (!spectator && !seen(x, z, 1) && !seen(x0, z0, 1)) continue;
    const w = e.data.weapons[wi];
    if (special === 3) {
      // rayon prolongé : de la source (pivot « laser » du modèle) à la cible, pendant toute sa durée
      if (nb >= 400) continue;
      const src = beamSource(e, wi);
      const d0 = Math.hypot(x1 - x0, z1 - z0) || 1;
      const ax = x0 + ((x1 - x0) / d0) * src.fwd;
      const az = z0 + ((z1 - z0) / d0) * src.fwd;
      const ay = (src.air ? unitHeightAt(e, wi, ax, az) : groundHeight(e.map, ax, az)) + src.h;
      const by = groundHeight(e.map, x1, z1) + 0.4;
      // grappin : un câble tendu, sans lueur
      if (w?.proj === 0) {
        if (nk < 6000) {
          tmpV.set(x1 - ax, by - ay, z1 - az);
          const cl = tmpV.length();
          tmpQ.setFromUnitVectors(Z_AXIS, tmpV.normalize());
          tmpM.compose(tmpV.set((ax + x1) / 2, (ay + by) / 2, (az + z1) / 2), tmpQ, tmpS.set(0.07, 0.07, cl));
          e.slugs.setMatrixAt(nk, tmpM);
          e.slugs.setColorAt(nk, tmpC.setHex(0x6a5f52));
          nk++;
        }
        continue;
      }
      const fire = w?.proj === 10;
      const life = (buf[o + 4] & 0xffff) + alpha;
      const total = Math.max(1, (buf[o + 4] >>> 16) & 0xffff);
      // montée et extinction en quelques ticks, scintillement
      const ramp = Math.min(1, life / 3, (total - life + 1) / 3);
      const flick = 1 + 0.18 * Math.sin(now / 23 + i * 1.7) + 0.08 * Math.sin(now / 7 + i);
      const r = (fire ? 0.16 : 0.05) * src.big * Math.max(0.15, ramp) * flick;
      tmpV.set(x1 - ax, by - ay, z1 - az);
      const len = tmpV.length();
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmpV.normalize());
      tmpM.compose(tmpV.set(ax, ay, az), tmpQ, tmpS.set(r * 0.5, r * 0.5, len));
      e.beamCore.setMatrixAt(nb, tmpM);
      e.beamCore.setColorAt(nb, fire ? tmpC.setRGB(1.9, 1.1, 0.4) : tmpC.setRGB(2.0, 0.9, 0.9));
      tmpM.compose(tmpV.set(ax, ay, az), tmpQ, tmpS.set(r * 1.8, r * 1.8, len));
      e.beamGlow.setMatrixAt(nb, tmpM);
      e.beamGlow.setColorAt(nb, fire ? tmpC.setRGB(1.2, 0.35, 0.05) : tmpC.setRGB(1.3, 0.1, 0.1));
      nb++;
      fx.beam(ax, ay, az, x1, by, z1, w?.proj ?? 8, dt, src.big);
      continue;
    }
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const pk = w?.proj ?? 0;
    const gy0 = groundHeight(e.map, x0, z0);
    const gy1 = groundHeight(e.map, x1, z1);
    const dx = x1 - x0;
    const dz = z1 - z0;
    // hauteur et pente de la trajectoire : y(t) et dy/dt (pour orienter le projectile selon sa course)
    let arc = 1.2;
    if (pk === 1 || special === 1 || special === 255) arc = Math.min(60, dist * 0.35); // obus, missile stratégique
    else if (pk === 2) arc = Math.min(8, dist * 0.15);
    else if (pk === 3 || pk === 4) arc = 0;
    let y = gy0 + (gy1 - gy0) * tt + 1 + Math.sin(Math.PI * tt) * arc;
    let vy = gy1 - gy0 + Math.PI * Math.cos(Math.PI * tt) * arc;
    if (pk === 3) {
      // bombe : tombe en avançant
      y = gy1 + 12 * (1 - tt) + 0.5;
      vy = -12;
    } else if (pk === 4) {
      // torpille : juste sous la surface
      y = Math.max(gy0 + (gy1 - gy0) * tt, e.map.waterLevel * HSCALE) - 0.06;
      vy = 0;
    }
    if (special === 2) {
      y = gy1 + 60 * (1 - tt);
      vy = -60;
    }
    tmpV.set(dx, vy, dz);
    if (tmpV.lengthSq() < 1e-6) tmpV.set(0, -1, 0);
    tmpQ.setFromUnitVectors(Z_AXIS, tmpV.normalize());
    // vecteur unitaire de la course (pour placer flamme et traceur derrière le projectile)
    const ux = tmpV.x;
    const uy = tmpV.y;
    const uz = tmpV.z;
    const big = special === 1 || special === 255 ? 3 : special === 2 ? 2 : w && w.aoe > 600 ? 1.8 : 1;
    const look = special === 0 ? PROJ_LOOKS[pk] : undefined;
    if (special === 2) {
      // frappe orbitale : colonne d'énergie qui tombe du ciel
      np = glow(e, np, x, y, z, 0.35, 0.35, 4, 0xfff0b0, 3.2);
      np = glow(e, np, x, y, z, 1.1, 1.1, 5, 0xffc040, 0.9);
    } else if (look?.slug || special === 1 || special === 255) {
      // projectile matériel : ogive orientée selon la course, et sa lueur (traceur, propulseur, culot chaud)
      const L = look ?? PROJ_LOOKS[2]!;
      const sz = special ? 3.2 : L.grow ? Math.min(big, 1.4) : 1;
      if (nk < 6000) {
        tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(L.slug![0] * sz, L.slug![0] * sz, L.slug![1] * sz));
        e.slugs.setMatrixAt(nk, tmpM);
        e.slugs.setColorAt(nk, tmpC.setHex(special ? 0xe8e8e8 : L.color));
        nk++;
      }
      if (L.tail) {
        const [r, len, back, col, k] = L.tail;
        const off = (L.slug![1] * 0.5 + back) * sz;
        const pulse = pk === 2 || special ? 0.8 + 0.4 * Math.sin(now / 17 + i * 2.3) : 1;
        np = glow(e, np, x - ux * off, y - uy * off, z - uz * off, r * sz * pulse, r * sz * pulse, len * sz, col, k);
      }
    } else {
      // énergie : cœur fin et lumineux + halo large et pâle
      const L = look ?? { core: [0.12, 0.3], halo: [0.32, 0.45], color: 0xffe070, k: 2.6 };
      const pulse = pk === 7 ? 0.85 + 0.25 * Math.sin(now / 40 + i * 1.3) : 1;
      const col = special ? 0xffe070 : (PROJ_COLORS[pk] ?? 0xffffff);
      np = glow(e, np, x, y, z, L.core![0] * big * pulse, L.core![0] * big * pulse, L.core![1] * big, col, L.k ?? 2.6);
      np = glow(e, np, x, y, z, L.halo![0] * big * pulse, L.halo![0] * big * pulse, L.halo![1] * big, col, (L.k ?? 2.6) * 0.22);
    }
    const elapsed = buf[o + 4] & 0xffff;
    if (elapsed >= 1 && elapsed <= tickDelta && special === 0 && pk !== 3 && pk !== 4) fx.muzzle(x0, gy0 + 1, z0, pk, big);
    if (special || pk === 1 || pk === 2 || pk === 4 || pk === 11) fx.trail(x, y, z, special === 1 || special === 255 ? 2 : pk, dt, big);
  }
  e.proj.count = np;
  e.proj.instanceMatrix.needsUpdate = true;
  if (e.proj.instanceColor) e.proj.instanceColor.needsUpdate = true;
  e.slugs.count = nk;
  e.slugs.instanceMatrix.needsUpdate = true;
  if (e.slugs.instanceColor) e.slugs.instanceColor.needsUpdate = true;
  for (const m of [e.beamCore, e.beamGlow]) {
    m.count = nb;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

/** Une lueur (ellipsoïde additif d'axe la course courante, tmpQ) ; renvoie le nouveau compte. */
function glow(e: Entities, n: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, k: number): number {
  if (n >= 8000) return n;
  tmpM.compose(tmpV2.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
  e.proj.setMatrixAt(n, tmpM);
  e.proj.setColorAt(n, tmpC.setHex(color).multiplyScalar(k));
  return n + 1;
}

/**
 * Origine d'un rayon prolongé de l'arme `wi` : pivot « laser » du modèle de l'unité qui la porte
 * (hauteur et avancée vers la cible, à l'échelle), sinon aux trois cinquièmes de sa hauteur.
 */
function beamSource(e: Entities, wi: number): { h: number; fwd: number; air: boolean; big: number } {
  let s = e.beamFrom.get(wi);
  if (s) return s;
  // arme d'amélioration : son porteur ; lance-flammes de l'Arche : depuis sa tourelle de proue
  const ark = e.data.units.findIndex((u) => u.key === "ark");
  const mod = e.data.mods.find((m) => m.weapon[1] === wi);
  const own = e.data.units.findIndex((u) => u.weapons.includes(wi));
  const kind = own >= 0 ? own : (mod?.host ?? ark);
  if (kind === ark && own < 0 && ark >= 0) {
    const k = e.unitMeshes[ark].scale;
    s = { h: 1.26 * k, fwd: 2.8 * k, air: false, big: 1 };
    e.beamFrom.set(wi, s);
    return s;
  }
  const km = kind >= 0 ? e.unitMeshes[kind] : undefined;
  const def = kind >= 0 ? e.data.units[kind] : undefined;
  const piv = km?.built.pivots.find((p) => {
    const c = parseCond(p.name);
    return c ? !!mod && c.base.startsWith("laser") && c.all.some((t) => t.on && t.keys.includes(mod.key)) : p.name === "laser";
  });
  const h = piv ? piv.origin.y * km!.scale : (km?.height ?? 1) * 0.6;
  // (arme d'amélioration sans pivot : depuis l'avant du porteur)
  const fwd = piv ? Math.hypot(piv.origin.x, piv.origin.z) * km!.scale : own < 0 && def ? (def.radius / TILE) * 0.9 : 0;
  const air = def ? def.layer === Layer.Air || def.layer === Layer.Hover : false;
  s = { h, fwd, air, big: def && def.tier === 6 ? 1.5 : 1 };
  e.beamFrom.set(wi, s);
  return s;
}

/** Hauteur de l'unité qui porte l'arme `wi` (rayons tirés depuis les airs, ou par un amphibie). */
function unitHeightAt(e: Entities, wi: number, x: number, z: number): number {
  const own = e.data.units.findIndex((u) => u.weapons.includes(wi));
  const kind = own >= 0 ? own : (e.data.mods.find((m) => m.weapon[1] === wi)?.host ?? -1);
  return kind >= 0 ? e.unitHeight(kind, x, z) : groundHeight(e.map, x, z);
}
