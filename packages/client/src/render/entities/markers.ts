// Rendu des entités, repères posés sur les bâtiments : barres de progression des chantiers (décodage et
// taille dans ../siteBars.ts), atlas des icônes de diagnostic (les icônes sont placées par la passe des
// bâtiments, voir buildings.ts), dalles de la vue logistique, icônes de production sur les toits.
import * as THREE from "three/webgpu";
import type { Frame } from "@supreme/shared";
import { BUILDING_WORDS, ITEM_WORDS, BF, BClass, PACK1 } from "@supreme/shared";
import { FLOOR_H } from "../liftAnim.ts";
import { siteBarSize, type SiteBar } from "../siteBars.ts";
import { groundHeight } from "../terrain.ts";
import { sprite } from "../../ui/sprites.ts";
import type { Entities } from "../entities.ts";
import { TILE, UP, tmpM, tmpQ, tmpS, tmpV } from "./common.ts";

/** barres de chantier : 3 instances au plus par chantier (fond, part faite, part perdue) */
export const SITE_BARS_MAX = 16384;
// couleurs données en sRGB (comme à l'écran) : en linéaire, le cyan sortait presque blanc
const SITE_BACK = new THREE.Color(0x0b0e12);
const SITE_DONE = new THREE.Color(0x1fb8ff);
const SITE_LOST = new THREE.Color(0xe8321f);
const SITE_UPGRADE = new THREE.Color(0xffa41f);

/**
 * Barre de progression d'un chantier ou d'une amélioration, à plat au-dessus du bâtiment de `w` × `h` cases
 * centré en (cx, cz), au sol à la hauteur `y` : fond sombre, part faite (cyan, ambre pour une amélioration),
 * part perdue en dégâts (rouge). Taille selon le zoom (`siteBarSize`). Rend le nouveau nombre d'instances.
 */
export function pushSiteBar(e: Entities, n: number, sb: SiteBar, cx: number, y: number, cz: number, w: number, h: number): number {
  const { width, thick, lift } = siteBarSize(w, h, w === 1 && h === 1, e.pxWorld);
  const z = cz + h / 2 - thick / 2 - 0.05;
  const yy = y + lift;
  const m = e.siteBars;
  tmpM.compose(tmpV.set(cx, yy, z), tmpQ.identity(), tmpS.set(width, 1, thick));
  m.setMatrixAt(n, tmpM);
  m.setColorAt(n++, SITE_BACK);
  // la part pleine laisse un liseré du fond tout autour
  const pad = thick * 0.18;
  const inner = width - 2 * pad;
  const x0 = cx - inner / 2;
  if (sb.done > 0.002) {
    tmpM.compose(tmpV.set(x0 + (inner * sb.done) / 2, yy + 0.02, z), tmpQ, tmpS.set(inner * sb.done, 1, thick - 2 * pad));
    m.setMatrixAt(n, tmpM);
    m.setColorAt(n++, sb.upgrade ? SITE_UPGRADE : SITE_DONE);
  }
  if (sb.lost > 0.01) {
    tmpM.compose(tmpV.set(x0 + inner * (sb.done + sb.lost / 2), yy + 0.02, z), tmpQ, tmpS.set(inner * sb.lost, 1, thick - 2 * pad));
    m.setMatrixAt(n, tmpM);
    m.setColorAt(n++, SITE_LOST);
  }
  return n;
}

/** Bâtiments qui affichent une icône de diagnostic. */
export const DIAG_CLASSES = new Set<number>([BClass.Crafter, BClass.Extractor, BClass.Lab, BClass.Factory, BClass.Station, BClass.CargoPad, BClass.Turret, BClass.Radar, BClass.Shield, BClass.Organ]);

/** Nombre d'icônes de l'atlas de diagnostic, et celle de la pause. */
export const DIAG_ICONS = 5;
export const DIAG_PAUSED = 4;

/** Atlas des icônes de diagnostic : sans énergie, entrée manquante, sortie bloquée, énergie faible, en pause. */
export function diagAtlas(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64 * DIAG_ICONS;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const disc = (i: number, color: string) => {
      g.beginPath();
      g.arc(i * 64 + 32, 32, 27, 0, Math.PI * 2);
      g.fillStyle = "rgba(10,14,20,0.85)";
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = color;
      g.stroke();
    };
    const bolt = (i: number, color: string) => {
      const x = i * 64;
      g.beginPath();
      g.moveTo(x + 36, 12);
      g.lineTo(x + 22, 35);
      g.lineTo(x + 31, 35);
      g.lineTo(x + 27, 52);
      g.lineTo(x + 43, 27);
      g.lineTo(x + 34, 27);
      g.closePath();
      g.fillStyle = color;
      g.fill();
    };
    disc(0, "#ff4d4d");
    bolt(0, "#ff4d4d");
    g.strokeStyle = "#ff4d4d";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(16, 48);
    g.lineTo(48, 16);
    g.stroke();
    // entrée manquante : flèche vers un bac vide
    disc(1, "#ffb547");
    g.strokeStyle = "#ffb547";
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(96, 14);
    g.lineTo(96, 36);
    g.moveTo(87, 28);
    g.lineTo(96, 37);
    g.lineTo(105, 28);
    g.moveTo(80, 42);
    g.lineTo(80, 49);
    g.lineTo(112, 49);
    g.lineTo(112, 42);
    g.stroke();
    // sortie bloquée : caisse barrée
    disc(2, "#ffb547");
    g.strokeStyle = "#ffb547";
    g.lineWidth = 4;
    g.strokeRect(146, 18, 28, 28);
    g.beginPath();
    g.moveTo(146, 18);
    g.lineTo(174, 46);
    g.moveTo(174, 18);
    g.lineTo(146, 46);
    g.stroke();
    // énergie faible
    disc(3, "#ffe066");
    bolt(3, "#ffe066");
    // en pause : deux barres
    disc(DIAG_PAUSED, "#9fc6ff");
    g.fillStyle = "#9fc6ff";
    g.fillRect(DIAG_PAUSED * 64 + 21, 18, 8, 28);
    g.fillRect(DIAG_PAUSED * 64 + 35, 18, 8, 28);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// vue logistique : tapis vide, fluide, chargé, saturé ; bâtiment bloqué, affamé, sans énergie, en marche
const LOGI_EMPTY = new THREE.Color(0.25, 0.32, 0.45);
const LOGI_FLOW = new THREE.Color(0.25, 1.1, 0.45);
const LOGI_BUSY = new THREE.Color(1.3, 1.05, 0.2);
const LOGI_FULL = new THREE.Color(1.5, 0.18, 0.12);
const LOGI_BLOCKED = new THREE.Color(1.5, 0.18, 0.12);
const LOGI_STARVED = new THREE.Color(1.4, 0.75, 0.1);
const LOGI_POWER = new THREE.Color(0.85, 0.35, 1.5);
const LOGI_OK = new THREE.Color(0.2, 0.6, 0.3);

/**
 * Vue logistique : sur chaque tapis, une dalle selon son remplissage (objets sur la case : vide,
 * fluide, chargé, saturé) ; sous les bâtiments, une dalle s'ils sont bloqués (sortie pleine), affamés
 * (entrée manquante) ou sans énergie suffisante ; vert pâle s'ils tournent.
 */
export function updateLogistics(e: Entities, f: Frame, strategic: boolean, myTeam: number, spectator: boolean): void {
  const m = e.logiPads;
  if (!e.logistics || strategic) {
    m.count = 0;
    return;
  }
  const buf = f.buf;
  // objets par case de tapis (cases du monde, tous niveaux)
  const fill = new Map<number, number>();
  for (let i = 0, o = f.itemOff; i < f.nItems; i++, o += ITEM_WORDS) {
    const key = Math.floor(buf[o + 1] / TILE) * 65536 + Math.floor(buf[o] / TILE);
    fill.set(key, (fill.get(key) ?? 0) + 1);
  }
  let n = 0;
  const put = (x: number, y: number, z: number, w: number, h: number, c: THREE.Color) => {
    if (n >= 20000) return;
    tmpM.compose(tmpV.set(x, y, z), tmpQ.identity(), tmpS.set(w, 1, h));
    m.setMatrixAt(n, tmpM);
    m.setColorAt(n, c);
    n++;
  };
  for (let i = 0, o = f.buildingOff; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const kind = buf[o + 1] & 0xff;
    const def = e.data.buildings[kind];
    const owner = (buf[o + 1] >> 8) & 0xff;
    if (!spectator && (f.players[owner]?.team ?? owner) !== myTeam) continue;
    if (buf[o + 4] < 65536) continue;
    const dir = (buf[o + 1] >> 16) & 3;
    const flags = (buf[o + 1] >> 20) & 0xff;
    const x = buf[o + 2] & 0xffff;
    const z = (buf[o + 2] >>> 16) & 0xffff;
    const bw = dir & 1 ? def.h : def.w;
    const bh = dir & 1 ? def.w : def.h;
    const cx = x + bw / 2;
    const cz = z + bh / 2;
    const g = groundHeight(e.map, cx, cz);
    if (def.cls === BClass.Belt) {
      const floor = (buf[o + 1] >>> 28) & 3;
      const k = fill.get(z * 65536 + x) ?? 0;
      put(cx, g + floor * FLOOR_H + 0.14, cz, 0.62, 0.92, k >= 4 ? LOGI_FULL : k === 3 ? LOGI_BUSY : k > 0 ? LOGI_FLOW : LOGI_EMPTY);
      continue;
    }
    if (def.cls === BClass.Wall || def.cls === BClass.Pylon || def.cls === BClass.Inserter) continue;
    const c =
      flags & BF.OUT_BLOCKED ? LOGI_BLOCKED : flags & BF.NO_INPUT ? LOGI_STARVED : flags & (BF.UNPOWERED | BF.LOW_POWER) && def.powerUse > 0 ? LOGI_POWER : flags & BF.WORKING ? LOGI_OK : null;
    if (c) put(cx, g + 0.06, cz, bw * 1.04, bh * 1.04, c);
  }
  m.count = n;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

/**
 * Hauteur du toit d'un bâtiment à son centre : la face la plus haute du modèle qui recouvre le
 * point central (et non le sommet d'une cheminée ou d'une antenne posée à côté).
 */
function roofHeight(e: Entities, kind: number, lvl = 0): number {
  const key = kind * 8 + lvl;
  const hit = e.roofCache.get(key);
  if (hit !== undefined) return hit;
  const km = (lvl > 0 ? e.levelMeshes.get(kind)?.[lvl - 1] : undefined) ?? e.buildingMeshes[kind];
  let top = 0;
  if (km) {
    const p = km.built.body.getAttribute("position");
    for (let i = 0; i + 2 < p.count; i += 3) {
      const ax = p.getX(i), az = p.getZ(i);
      const bx = p.getX(i + 1), bz = p.getZ(i + 1);
      const cx = p.getX(i + 2), cz = p.getZ(i + 2);
      // le point (0, 0) est-il dans la projection du triangle sur le sol ?
      const d1 = (0 - bx) * (az - bz) - (ax - bx) * (0 - bz);
      const d2 = (0 - cx) * (bz - cz) - (bx - cx) * (0 - cz);
      const d3 = (0 - ax) * (cz - az) - (cx - ax) * (0 - az);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (neg && pos) continue;
      top = Math.max(top, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3);
    }
    top *= km.scale;
    if (top <= 0) top = km.height;
  }
  e.roofCache.set(key, top);
  return top;
}

/** Maillage d'une icône posée à plat (texture de l'icône générée), créé à la première utilisation. */
function logoMesh(e: Entities, key: string): THREE.InstancedMesh | null {
  let m = e.logoMeshes.get(key);
  if (m) return m;
  const [cat, k] = key.split("/") as ["items" | "units", string];
  const url = sprite(cat, k);
  if (!url) return null;
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, alphaTest: 0.08, depthWrite: false }), 2000);
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = 3;
  e.group.add(m);
  e.logoMeshes.set(key, m);
  return m;
}

/**
 * Icônes de production sur les toits de nos bâtiments : recette d'un bâtiment de fabrication,
 * unité en cours d'une usine, lots de la recherche d'un laboratoire
 * (plusieurs icônes côte à côte, un peu superposées). Posées à plat, tournées vers le haut de l'écran.
 */
export function updateLogos(e: Entities, f: Frame, strategic: boolean, myTeam: number, spectator: boolean): void {
  const cam = e.camera;
  let yaw = e.logoYaw;
  if (cam) {
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    if (Math.abs(fwd.x) + Math.abs(fwd.z) > 1e-3) yaw = Math.atan2(-fwd.x, -fwd.z);
  }
  if (strategic) {
    for (const m of e.logoMeshes.values()) m.count = 0;
    e.logoDiscs.count = 0;
    e.logoFor = null;
    return;
  }
  if (f === e.logoFor && Math.abs(yaw - e.logoYaw) < 0.01) return;
  e.logoFor = f;
  e.logoYaw = yaw;
  for (const m of e.logoMeshes.values()) m.count = 0;
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const buf = f.buf;
  let nd = 0;
  let o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const kind = buf[o + 1] & 0xff;
    const def = e.data.buildings[kind];
    const cls = def.cls;
    // (pas d'icône sur l'extracteur : ses pièces sont teintées selon le minerai exploité)
    if (cls !== BClass.Crafter && cls !== BClass.Factory && cls !== BClass.Lab && cls !== BClass.Depot) continue;
    if (buf[o + 4] < 65536) continue;
    const owner = (buf[o + 1] >> 8) & 0xff;
    if (!spectator && (f.players[owner]?.team ?? owner) !== myTeam) continue;
    const aux = buf[o + 5] & 0xff;
    const keys: string[] = [];
    if (cls === BClass.Crafter && aux !== 255) {
      const it = e.data.recipes[aux]?.output[0];
      if (it !== undefined) keys.push("items/" + e.data.items[it].key);
    } else if (cls === BClass.Factory && aux > 0) keys.push("units/" + e.data.units[aux - 1]?.key);
    else if (cls === BClass.Depot) {
      // dépôt : objets filtrés sur le toit (sans filtre, tout sort : pas d'icône)
      const w5 = buf[o + 5];
      for (const it of [w5 & 0xff, (w5 >>> 8) & 0xff, (w5 >>> 16) & 0xff, buf[o + 6] & 0xff]) if (it > 0 && e.data.items[it]) keys.push("items/" + e.data.items[it].key);
    } else if (cls === BClass.Lab && aux > 0) {
      const tier = e.data.techs[aux]?.tier ?? 0;
      for (let k = 0; k < tier; k++) keys.push("items/" + e.data.items[PACK1 + k].key);
    }
    if (!keys.length) continue;
    const dir = (buf[o + 1] >> 16) & 3;
    const bw = dir & 1 ? def.h : def.w;
    const bh = dir & 1 ? def.w : def.h;
    const cx = (buf[o + 2] & 0xffff) + bw / 2;
    const cz = ((buf[o + 2] >>> 16) & 0xffff) + bh / 2;
    const top = groundHeight(e.map, cx, cz) + roofHeight(e, kind, cls === BClass.Depot || e.data.buildings[kind].key === "furnace" ? (buf[o + 5] >>> 24) & 3 : 0) + 0.05;
    const size = Math.min(1.7, Math.max(0.55, Math.min(bw, bh) * 0.42));
    // icônes côte à côte, superposées d'un tiers, centrées sur le toit
    const step = size * 0.68;
    const n = keys.length;
    for (let k = 0; k < n; k++) {
      const m = logoMesh(e, keys[k]);
      if (!m || m.count >= 2000) continue;
      const off = (k - (n - 1) / 2) * step;
      tmpM.compose(tmpV.set(cx + rx * off, top + k * 0.004, cz + rz * off), q, tmpS.set(size, 1, size));
      m.setMatrixAt(m.count++, tmpM);
    }
    if (nd < 4000) {
      const wd = size + step * (n - 1);
      tmpM.compose(tmpV.set(cx, top - 0.01, cz), q, tmpS.set(wd / 1.0, 1, size));
      e.logoDiscs.setMatrixAt(nd++, tmpM);
    }
  }
  e.logoDiscs.count = nd;
  e.logoDiscs.instanceMatrix.needsUpdate = true;
  for (const m of e.logoMeshes.values()) m.instanceMatrix.needsUpdate = true;
}
