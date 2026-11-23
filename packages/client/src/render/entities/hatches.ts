// Rendu des entités, trappes ouvertes des bâtiments qui reçoivent des objets (entrée cyan, sortie ambre ;
// les trappes fermées font partie du modèle) et conduites entre machines jumelles. Recalculées à chaque
// nouvel état de la partie, pas à chaque image.
import * as THREE from "three/webgpu";
import type { Frame } from "@supreme/shared";
import { BUILDING_WORDS, BClass, PACK1, RECEIVER_CLASSES } from "@supreme/shared";
import { hatchFace, HATCH_Y } from "../../models/generator.ts";
import { groundHeight, HSCALE } from "../terrain.ts";
import type { Entities } from "../entities.ts";
import { UP, tmpM, tmpS, tmpV } from "./common.ts";

/** Bâtiments qui reçoivent des objets (et ont donc des trappes) ; ce sont aussi ceux qui reçoivent par transfert direct. */
export const RECEIVERS = RECEIVER_CLASSES;
const RECIPE_NONE = 255;
/** trappe ouverte logée dans la trappe du modèle : échelles du cadre lumineux (0,64 x 0,44 -> 0,46 x 0,28) et de l'ouverture (0,5 x 0,3 -> 0,38 x 0,2) */
const FITTED_GLOW = new THREE.Vector3(0.46 / 0.64, 0.28 / 0.44, 0.1);
const FITTED_HOLE = new THREE.Vector3(0.38 / 0.5, 0.2 / 0.3, 0.1);
const CRAFTER_ASSEMBLER = 1;

/**
 * Trappes des bâtiments qui reçoivent des objets : sur chaque case de bord, ouverte si un tapis
 * ou un bras y entre (cadre cyan) ou en sort (cadre ambre), fermée sinon. Recalculées à chaque
 * nouvel état de la partie (pas à chaque image).
 */
export function updateHatches(e: Entities, f: Frame, strategic: boolean, myTeam: number, spectator: boolean): void {
  if (strategic) {
    e.hatchFrame.count = e.hatchHole.count = 0;
    e.twinPipe.count = e.twinGlow.count = 0;
    e.hatchFor = null;
    return;
  }
  if (f === e.hatchFor) return;
  e.hatchFor = f;
  const buf = f.buf;
  const W = e.map.w;
  const DX = [1, 0, -1, 0];
  const DZ = [0, 1, 0, -1];
  // tapis et bras : case -> direction (bras : 16 * quarts de tour + 4 * portée + direction)
  const links = new Map<number, number>();
  const curves = new Map<number, number>();
  let o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const bd = e.data.buildings[buf[o + 1] & 0xff];
    if (bd.cls !== BClass.Belt && bd.cls !== BClass.Inserter) continue;
    // un tapis surélevé ne touche pas les bâtiments
    if ((buf[o + 1] >>> 28) & 3) continue;
    const dir = (buf[o + 1] >> 16) & 3;
    const cell = ((buf[o + 2] >>> 16) & 0xffff) * W + (buf[o + 2] & 0xffff);
    const arm = bd.cls === BClass.Inserter ? 16 * (buf[o + 6] & 3 || 2) + 4 * Math.max(1, bd.reach ?? 1) : 0;
    links.set(cell, arm + dir);
    // virage : côté par lequel il est alimenté (tapis latéral ou bâtiment)
    const shape = bd.cls === BClass.Belt ? buf[o + 5] & 3 : 0;
    if (shape) curves.set(cell, shape === 1 ? (dir + 1) & 3 : (dir + 3) & 3);
  }
  // transfert direct : case -> bâtiment (fabricants, extracteurs et receveurs), pour ouvrir la trappe
  // entre deux bâtiments collés qui s'échangent des objets
  const cells = new Map<number, number>();
  o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const def = e.data.buildings[buf[o + 1] & 0xff];
    if ((def.cls !== BClass.Extractor && !RECEIVERS.has(def.cls)) || buf[o + 4] < 65536) continue;
    const dir = (buf[o + 1] >> 16) & 3;
    const bx = buf[o + 2] & 0xffff;
    const bz = (buf[o + 2] >>> 16) & 0xffff;
    const w = dir & 1 ? def.h : def.w;
    const h = dir & 1 ? def.w : def.h;
    for (let z = bz; z < bz + h; z++) for (let x = bx; x < bx + w; x++) cells.set(z * W + x, o);
  }
  const recipes = e.data.recipes;
  /** objet donné par un fabricant ou un extracteur (0 : aucun) */
  const gives = (b: number): number => {
    const cls = e.data.buildings[buf[b + 1] & 0xff].cls;
    const v = buf[b + 5] & 0xff;
    if (cls === BClass.Extractor) return v;
    if (cls === BClass.Crafter && v !== RECIPE_NONE) return recipes[v]?.output[0] ?? 0;
    return 0;
  };
  /** `t` reçoit-il directement l'objet `it` de `s` (même règle, simplifiée, que direct_ok dans la simulation) ? */
  const takes = (s: number, t: number, it: number): boolean => {
    if (!it || ((buf[s + 1] >> 8) & 0xff) !== ((buf[t + 1] >> 8) & 0xff)) return false;
    const td = e.data.buildings[buf[t + 1] & 0xff];
    if (td.cls === BClass.Lab) return it >= PACK1 && it < PACK1 + 6;
    if (td.cls !== BClass.Crafter) return true;
    const r = buf[t + 5] & 0xff;
    if (r !== RECIPE_NONE) return recipes[r]?.inputs.some((x) => x[0] === it) ?? false;
    // fabricant sans recette : seul un extracteur l'amorce (fonderie, raffinerie…)
    return e.data.buildings[buf[s + 1] & 0xff].cls === BClass.Extractor && td.crafter !== CRAFTER_ASSEMBLER && recipes.some((x) => x.crafter === td.crafter && x.inputs.some((y) => y[0] === it));
  };
  /** dépôt `s` collé au générateur `t` du même joueur : il l'alimente en combustible depuis son stock */
  const feeds = (s: number, t: number): boolean =>
    e.data.buildings[buf[s + 1] & 0xff].cls === BClass.Depot && e.data.buildings[buf[t + 1] & 0xff].cls === BClass.Power && ((buf[s + 1] >> 8) & 0xff) === ((buf[t + 1] >> 8) & 0xff);
  const inCol = new THREE.Color(0.5, 2.2, 2.6);
  const outCol = new THREE.Color(2.8, 1.7, 0.35);
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  /**
   * Retrait de la trappe du bâtiment `b` sur sa face `side` (repère du monde), case de bord (ex, ez) :
   * jusqu'à la paroi du modèle (voir hatchInsets) ; NaN si aucune paroi derrière.
   */
  /** haut de la paroi derrière la dernière trappe demandée à insetAt */
  const topOut = [0];
  const insetAt = (b: number, side: number, ex: number, ez: number): number => {
    const kind = buf[b + 1] & 0xff;
    const def = e.data.buildings[kind];
    topOut[0] = Number.NaN;
    if (def.w !== def.h) return 0;
    const insets = hatchInsets(e, kind, def.cls === BClass.Depot || def.cls === BClass.Power ? (buf[b + 5] >>> 24) & 3 : 0, def.w);
    const dir = (buf[b + 1] >> 16) & 3;
    // côté et case correspondants du modèle : rotation inverse (-yaw) de la normale et du centre de la case
    const yaw = Math.PI / 2 - (dir * Math.PI) / 2;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const vx = ex + 0.5 - ((buf[b + 2] & 0xffff) + def.w / 2);
    const vz = ez + 0.5 - (((buf[b + 2] >>> 16) & 0xffff) + def.h / 2);
    const mnx = Math.round(DX[side] * cy - DZ[side] * sy);
    const mnz = Math.round(DX[side] * sy + DZ[side] * cy);
    const mside = mnx === 1 ? 0 : mnz === 1 ? 1 : mnx === -1 ? 2 : 3;
    const mt = mside & 1 ? vx * cy - vz * sy : vx * sy + vz * cy;
    const mk = Math.min(def.w - 1, Math.max(0, Math.round(mt + (def.w - 1) / 2)));
    topOut[0] = insets[4 * def.w + mside * def.w + mk];
    return insets[mside * def.w + mk];
  };
  /**
   * Machines jumelles (même règle que twin_pair dans la simulation) : même type, même joueur, et même
   * produit (recette d'un fabricant, unité en tête de file d'une usine ; tous les laboratoires) ; pour
   * les générateurs, même joueur et mêmes combustibles (le réacteur à cristal seulement avec un réacteur).
   */
  const twins = (a: number, b: number): boolean => {
    if (buf[a + 7] > 0 || buf[b + 7] > 0) return false;
    const da = e.data.buildings[buf[a + 1] & 0xff];
    const db = e.data.buildings[buf[b + 1] & 0xff];
    if (da.cls === BClass.Power) {
      return db.cls === BClass.Power && ((buf[a + 1] >> 8) & 0xff) === ((buf[b + 1] >> 8) & 0xff) && (da.key === "crystal_reactor") === (db.key === "crystal_reactor");
    }
    if ((buf[a + 1] & 0xffff) !== (buf[b + 1] & 0xffff)) return false;
    const cls = da.cls;
    if (cls === BClass.Lab) return true;
    if (cls === BClass.Crafter) return (buf[a + 5] & 0xff) !== RECIPE_NONE && (buf[a + 5] & 0xff) === (buf[b + 5] & 0xff);
    if (cls === BClass.Factory) return (buf[a + 5] & 0xff) !== 0 && (buf[a + 5] & 0xff) === (buf[b + 5] & 0xff);
    return false;
  };
  const twinCol = new THREE.Color(0.3, 1.8, 0.6);
  let no = 0;
  let nt = 0;
  o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const kind = buf[o + 1] & 0xff;
    const def = e.data.buildings[kind];
    // la Souche n'a pas de trappes (voir hatched)
    if (!RECEIVERS.has(def.cls) || (def.race ?? 0) === 1 || buf[o + 4] < 65536) continue;
    const owner = (buf[o + 1] >> 8) & 0xff;
    if (!spectator && (f.players[owner]?.team ?? owner) !== myTeam) continue;
    const dir = (buf[o + 1] >> 16) & 3;
    const bx = buf[o + 2] & 0xffff;
    const bz = (buf[o + 2] >>> 16) & 0xffff;
    const w = dir & 1 ? def.h : def.w;
    const h = dir & 1 ? def.w : def.h;
    const inside = (x: number, z: number) => x >= bx && x < bx + w && z >= bz && z < bz + h;
    // face du modèle, depuis le centre de la case de bord (le modèle laisse une marge sur l'emprise)
    const face = hatchFace(def.w);
    // base du modèle (comme le bâtiment : sol en son centre, ou surface de l'eau)
    const base = def.water ? e.map.waterLevel * HSCALE : groundHeight(e.map, bx + w / 2, bz + h / 2);
    for (let side = 0; side < 4; side++) {
      const n = side & 1 ? w : h; // cases le long de la face
      for (let k = 0; k < n; k++) {
        // case de bord, case voisine à l'extérieur, centre de la trappe sur la face
        const ex = side === 0 ? bx + w - 1 : side === 2 ? bx : bx + k;
        const ez = side === 1 ? bz + h - 1 : side === 3 ? bz : bz + k;
        const ox = ex + DX[side];
        const oz = ez + DZ[side];
        const code = links.get(oz * W + ox);
        let state = 0; // 0 fermée, 1 entrée, 2 sortie
        if (code !== undefined && code < 4) {
          // tapis qui part de la face ; un virage en pleine ligne dont l'arrière touche la face
          // (alimenté par le côté) ne reçoit rien (takes_from_face dans la simulation)
          if (code === side) state = curves.has(oz * W + ox) ? 0 : 2;
          else if (code === (side + 2) % 4) state = 1;
          // virage alimenté par cette face
          else if (curves.get(oz * W + ox) === (side + 2) % 4) state = 2;
        } else if (code !== undefined) {
          // bras : dépose devant lui, prise selon sa rotation
          const d = code & 3;
          const r = (code >> 2) & 3;
          const p = (d + (code >> 4)) & 3;
          if (inside(ox + r * DX[d], oz + r * DZ[d])) state = 1;
          else if (inside(ox + r * DX[p], oz + r * DZ[p])) state = 2;
        }
        // transfert direct avec un bâtiment collé ; machine jumelle (3) : ingrédients, produits ou combustible partagés
        if (state === 0) {
          const nb = cells.get(oz * W + ox);
          if (nb !== undefined && nb !== o && twins(o, nb)) state = 3;
          else if (nb !== undefined && nb !== o) {
            if (takes(nb, o, gives(nb)) || feeds(nb, o)) state = 1;
            else if (takes(o, nb, gives(o)) || feeds(o, nb)) state = 2;
          }
        }
        // bras long posé à 2 cases de la face (par-dessus la case voisine)
        if (state === 0) {
          const lx = ox + DX[side];
          const lz = oz + DZ[side];
          const lc = links.get(lz * W + lx);
          if (lc !== undefined && ((lc >> 2) & 3) === 2) {
            const d = lc & 3;
            const p = (d + (lc >> 4)) & 3;
            if (inside(lx + 2 * DX[d], lz + 2 * DZ[d])) state = 1;
            else if (inside(lx + 2 * DX[p], lz + 2 * DZ[p])) state = 2;
          }
        }
        // fermée : la trappe du modèle suffit
        if (state === 0) continue;
        const v = insetAt(o, side, ex, ez);
        const myTop = topOut[0];
        // la paroi porte la trappe du modèle (l'éclairage s'y loge) ; sans paroi, la trappe ouverte reste au bord
        const fitted = !Number.isNaN(v);
        const inset = fitted ? v : 0;
        const px = ex + 0.5 + DX[side] * (face - inset);
        const pz = ez + 0.5 + DZ[side] * (face - inset);
        // jumelles : une conduite relie les deux trappes, tracée une fois (depuis la plus petite référence)
        if (state === 3 && nt < 3000) {
          const nb = cells.get(oz * W + ox)!;
          if (buf[o] >>> 0 < buf[nb] >>> 0) {
            const nface = hatchFace(e.data.buildings[buf[nb + 1] & 0xff].w);
            const nv = insetAt(nb, (side + 2) % 4, ox, oz);
            const nTop = topOut[0];
            const ninset = Number.isNaN(nv) ? 0 : nv;
            // passerelle posée sur le haut des deux parois, de l'une à l'autre (visible d'en haut)
            const a = face - inset;
            const b = 1 - (nface - ninset);
            const len = Math.max(0.1, b - a) + 0.5;
            const mid = (a + b) / 2;
            const mx = ex + 0.5 + DX[side] * mid;
            const mz = ez + 0.5 + DZ[side] * mid;
            const gy = groundHeight(e.map, mx, mz);
            const top = Math.min(Number.isNaN(myTop) ? 0.5 : myTop, Number.isNaN(nTop) ? 0.5 : nTop);
            q.setFromAxisAngle(UP, side & 1 ? 0 : Math.PI / 2);
            tmpM.compose(tmpV.set(mx, gy + top + 0.03, mz), q, tmpS.set(0.36, 0.12, len));
            e.twinPipe.setMatrixAt(nt, tmpM);
            tmpM.compose(tmpV.set(mx, gy + top + 0.1, mz), q, tmpS.set(0.12, 0.03, len + 0.02));
            e.twinGlow.setMatrixAt(nt, tmpM);
            nt++;
          }
        }
        if (no >= 6000) continue;
        const y = (fitted ? base : groundHeight(e.map, px, pz)) + HATCH_Y;
        q.setFromAxisAngle(UP, [Math.PI / 2, 0, -Math.PI / 2, Math.PI][side]);
        // dans la trappe du modèle (kit « trappe ») : pourtour lumineux sur le volet, ouverture sombre
        // devant, le tout en retrait du cadre ; sans paroi : cadre lumineux complet au bord
        const glowAt = fitted ? 0.06 : 0;
        const holeAt = fitted ? 0.065 : 0.012;
        tmpM.compose(tmpV.set(px + DX[side] * glowAt, y, pz + DZ[side] * glowAt), q, fitted ? FITTED_GLOW : one);
        e.hatchFrame.setMatrixAt(no, tmpM);
        e.hatchFrame.setColorAt(no, state === 1 ? inCol : state === 3 ? twinCol : outCol);
        tmpM.compose(tmpV.set(px + DX[side] * holeAt, y, pz + DZ[side] * holeAt), q, fitted ? FITTED_HOLE : one);
        e.hatchHole.setMatrixAt(no, tmpM);
        no++;
      }
    }
  }
  e.hatchFrame.count = no;
  e.hatchHole.count = no;
  e.twinPipe.count = e.twinGlow.count = nt;
  e.twinPipe.instanceMatrix.needsUpdate = true;
  e.twinGlow.instanceMatrix.needsUpdate = true;
  for (const m of [e.hatchFrame, e.hatchHole]) m.instanceMatrix.needsUpdate = true;
  if (e.hatchFrame.instanceColor) e.hatchFrame.instanceColor.needsUpdate = true;
}

/**
 * Retrait (en cases) de chaque trappe depuis sa face nominale jusqu'à la paroi du modèle qui la porte,
 * puis hauteur du haut de cette paroi : voir BuiltModel.hatches (mesuré à la construction du modèle).
 */
function hatchInsets(e: Entities, kind: number, lvl: number, w: number): Float32Array {
  const km = (lvl > 0 ? e.levelMeshes.get(kind)?.[lvl - 1] : undefined) ?? e.buildingMeshes[kind];
  return km?.built.hatches ?? (e.noHatches[w] ??= new Float32Array(8 * w).fill(Number.NaN));
}
