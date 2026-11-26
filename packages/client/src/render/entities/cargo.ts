// Rendu des entités, ce qui circule : trains et drones de fret, objets sur les tapis, plateaux des
// ascenseurs de tapis (leur mât et leurs quais sont dessinés avec les bâtiments, voir buildings.ts ;
// le mouvement d'un objet dans un ascenseur est décrit dans ../liftAnim.ts).
import * as THREE from "three/webgpu";
import { ITEM_WORDS, CARRIER_WORDS } from "@supreme/shared";
import { buildModel, fallbackModel } from "../../models/generator.ts";
import { FLOOR_H, liftOut, liftPad, liftUp } from "../liftAnim.ts";
import { setTeamColor } from "../materials.ts";
import { ASCENSEUR_MAT } from "../../../../../assets/models/buildings.ts";
import { ITEM_MODELS } from "../../../../../assets/models/items.ts";
import { groundHeight, HSCALE } from "../terrain.ts";
import type { Entities } from "../entities.ts";
import { ANG, TILE, UP, dirQuat, tmpM, tmpM2, tmpQ, tmpQ2, tmpS, tmpV, tmpV2, type FrameCtx } from "./common.ts";
import { KindMesh } from "./kindMesh.ts";

/** ascenseur de tapis de l'image : centre de la case, palier bas, orientation du mât, sens, plateau en attente */
export interface Lift {
  x: number;
  z: number;
  /** hauteur du palier bas */
  y: number;
  /** orientation du modèle (le mât est en +x) */
  orient: number;
  /** vrai s'il monte : le palier d'entrée est le palier bas */
  up: boolean;
  /** terminé (pas en chantier) */
  ready: boolean;
  /** déploiement du plateau en attente au palier d'entrée (0 à 1 ; -1 : aucun objet dans la case) */
  parked: number;
}
/** le plateau n'a pas de pièce aux couleurs d'une équipe */
const NO_TEAM = new THREE.Color(1, 1, 1);
/** Benne du chariot de convoi (repère de son modèle, assets/models/nomades/convoi.ts) : places, de l'arrière vers
 * l'avant (x, z, rotation), remplies selon sa cale (1 à 6 : chariots::LOAD_SLOTS de la simulation), hauteur du
 * plancher, taille d'un objet par rapport à celle des tapis. */
const CART_SLOTS: readonly (readonly [number, number, number])[] = [
  [-0.21, -0.54, 0.12],
  [0.21, -0.54, -0.18],
  [-0.21, -0.22, -0.08],
  [0.21, -0.22, 0.2],
  [-0.21, 0.1, 0.16],
  [0.21, 0.1, -0.1],
];
const CART_FLOOR = 0.47;
const CART_ITEM = 0.85;

/** Trains, drones de fret, robots logistiques et drones de ravitaillement. */
export function drawCarriers(e: Entities, ctx: FrameCtx): void {
  const { f, buf, alpha, myTeam, strategic, dt, seen, teamOf } = ctx;
  // ----- trains et drones de fret -----
  if (f.tick !== e.carTick) {
    e.carPrev = e.carCur;
    e.carCur = new Map();
    for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += CARRIER_WORDS) e.carCur.set(buf[o], [buf[o + 1], buf[o + 2]]);
    e.carTick = f.tick;
  }
  if (!strategic) {
    for (let i = 0, o = f.carrierOff; i < f.nCarriers; i++, o += CARRIER_WORDS) {
      const idx = buf[o];
      const kind = buf[o + 3] & 0xff;
      const owner = (buf[o + 3] >> 8) & 0xff;
      const moving = (buf[o + 3] >> 16) & 1;
      const loaded = (buf[o + 3] >> 17) & 1;
      const cur = e.carCur.get(idx) ?? [buf[o + 1], buf[o + 2]];
      // une place de véhicule libérée est reprise par un autre (drones de ravitaillement) : pas d'interpolation
      // entre deux véhicules différents (saut de plus de 4 cases en un tick)
      const p0 = e.carPrev.get(idx);
      const prev = p0 && Math.abs(p0[0] - cur[0]) + Math.abs(p0[1] - cur[1]) < 4 * TILE ? p0 : cur;
      const x = (prev[0] + (cur[0] - prev[0]) * alpha) / TILE;
      const z = (prev[1] + (cur[1] - prev[1]) * alpha) / TILE;
      if (teamOf(owner) !== myTeam && !seen(x, z, 1)) continue;
      // drone de ravitaillement : modèle avec caisse quand il porte sa charge
      const km = e.vehicleMeshes[kind === 3 && loaded ? 4 : kind];
      if (!km) continue;
      km.ensure(km.n + 1);
      const g = groundHeight(e.map, x, z);
      let y = g + 0.05;
      if (kind >= 1) {
        // drone : vol à 5 cases au-dessus du sol (ou de l'eau), posé sur l'héliport à l'arrêt ; robot : 3 cases ;
        // drone de ravitaillement : 2,5 cases
        const target = moving ? Math.max(g, e.map.waterLevel * HSCALE) + (kind === 2 ? 3 : kind === 3 ? 2.5 : 5) : g + 0.45;
        const a = e.carAlt.get(idx) ?? target;
        const na = a + (target - a) * Math.min(1, dt * 2.5);
        e.carAlt.set(idx, na);
        y = na;
      }
      const ang = (buf[o + 4] & 0xffff) * ANG;
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - ang);
      const sc = km.scale;
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sc, sc, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      setTeamColor(km.body!, km.n, e.teamColors[owner % 8]);
      km.n++;
    }
  }
}

/** Objets sur les tapis et plateaux des ascenseurs (ceux relevés par la passe des bâtiments). */
export function drawItems(e: Entities, ctx: FrameCtx): void {
  const { f, buf, strategic } = ctx;
  // ----- objets sur les tapis : petit modèle par type, teinté de la couleur de l'objet -----
  let ni = 0;
  /** plateau d'un ascenseur, à `up` niveau (0 à 1) au-dessus du palier bas, déployé de `grow` (0 à 1) depuis le mât */
  const pad = (l: Lift, up: number, grow: number) => {
    const tray = e.liftTray;
    if (!tray || grow <= 0) return;
    tray.ensure(tray.n + 1);
    const sc = tray.scale;
    dirQuat(tmpQ2, l.orient);
    // il sort du mât : son plan se réduit vers lui
    tmpV2.set(ASCENSEUR_MAT * sc * (1 - grow), 0, 0).applyQuaternion(tmpQ2);
    tmpM.compose(tmpV.set(l.x + tmpV2.x, l.y + up * FLOOR_H + 0.09 * sc, l.z + tmpV2.z), tmpQ2, tmpS.set(sc * grow, sc, sc));
    tray.body!.mesh.setMatrixAt(tray.n, tmpM);
    setTeamColor(tray.body!, tray.n, NO_TEAM);
    tray.n++;
  };
  for (const km of e.itemMeshes) km?.begin();
  if (!strategic) {
    let o = f.itemOff;
    tmpQ.setFromAxisAngle(UP, 0.45);
    for (let i = 0; i < f.nItems && ni < 20000; i++, o += ITEM_WORDS) {
      const kind = buf[o + 2] & 0xff;
      const km = itemMesh(e, kind);
      if (!km) continue;
      let x = buf[o] / TILE;
      let z = buf[o + 1] / TILE;
      // élévation sur un tapis surélevé (1/256 de niveau) ; une fraction de niveau : l'objet est dans un
      // ascenseur, il roule sur un quai, monte ou descend à la verticale sur un plateau, sort par l'autre quai
      const lvl256 = buf[o + 2] >> 8;
      let elev = (lvl256 / 256) * FLOOR_H;
      const fr = (lvl256 & 255) / 256;
      if (fr > 0) {
        const tx = Math.floor(x);
        const tz = Math.floor(z);
        const low = lvl256 >> 8;
        const out = liftOut(fr);
        // l'objet reste sur la droite qui joint le centre de la case au point où la simulation le place
        const dist = Math.hypot(x - tx - 0.5, z - tz - 0.5);
        const k = dist > 1e-6 ? (out * 0.5) / dist : 0;
        x = tx + 0.5 + (x - tx - 0.5) * k;
        z = tz + 0.5 + (z - tz - 0.5) * k;
        const up = liftUp(fr);
        elev = (low + up) * FLOOR_H;
        const li = e.liftAt.get((tz * e.map.w + tx) * 2 + Math.min(1, low));
        if (li !== undefined) {
          const l = e.lifts[li];
          // sur le quai d'entrée : un plateau l'attend au palier ; en course : son plateau le porte ;
          // sur le quai de sortie : son plateau rentre dans le mât, un autre se déploie au palier d'entrée
          if (out > 0 && fr < 0.5 === l.up) l.parked = 1;
          else {
            const g = out > 0 ? liftPad(out) : 1;
            pad(l, up, g);
            l.parked = Math.max(l.parked, 1 - g);
          }
        }
      }
      km.ensure(km.n + 1);
      const s = km.scale;
      tmpM.compose(tmpV.set(x, groundHeight(e.map, x, z) + 0.15 + elev, z), tmpQ, tmpS.set(s, s, s));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      setTeamColor(km.body!, km.n, e.itemColors[kind]);
      km.n++;
      ni++;
    }
    // chariots de convoi : leur chargement dans la benne (un seul objet, autant de places que leur cale est pleine)
    for (let i = 0; i < e.nCartLoads; i++) {
      const r = e.cartLoads[i];
      const km = itemMesh(e, r.item);
      if (!km) continue;
      const s = (km.scale * CART_ITEM) / r.scale;
      for (let k = 0; k < Math.min(r.n, CART_SLOTS.length); k++) {
        const [sx, sz, a] = CART_SLOTS[k];
        km.ensure(km.n + 1);
        tmpQ2.setFromAxisAngle(UP, a);
        tmpM.copy(r.m).multiply(tmpM2.compose(tmpV.set(sx, CART_FLOOR, sz), tmpQ2, tmpS.set(s, s, s)));
        km.body!.mesh.setMatrixAt(km.n, tmpM);
        setTeamColor(km.body!, km.n, e.itemColors[r.item]);
        km.n++;
      }
    }
  }
  for (const km of e.itemMeshes) km?.end();
  // plateau en attente au palier d'entrée de chaque ascenseur
  for (let i = 0; i < e.nLifts; i++) {
    const l = e.lifts[i];
    if (l.ready) pad(l, l.up ? 0 : 1, l.parked < 0 ? 1 : l.parked);
  }
  e.liftTray?.end();
}

/** Maillage des objets d'un type (modèle de assets/models/items.ts, un quart de case de large). */
function itemMesh(e: Entities, kind: number): KindMesh | undefined {
  let km = e.itemMeshes[kind];
  if (km) return km;
  const key = e.data.items[kind]?.key;
  if (!key) return undefined;
  const built = buildModel(ITEM_MODELS[key] ?? fallbackModel(0.5));
  const size = new THREE.Vector3();
  built.box.getSize(size);
  km = new KindMesh(e.group, built, 0.24 / Math.max(size.x, size.z, 0.01), 0, false);
  e.itemMeshes[kind] = km;
  return km;
}
