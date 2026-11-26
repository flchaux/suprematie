// Rendu des entités, passe des bâtiments : modèle (niveau, virage ou jonction d'un tapis, virage d'un
// rail, mât et quais d'un ascenseur) et pièces mobiles, teintes (chantier, amélioration, sans énergie,
// minerai, apprivoisement), porte de transit et anneaux de transport, piliers des tapis surélevés, pans de
// mur, tronçons de racine, goulottes des extracteurs, et les repères posés au-dessus : cercle de
// sélection, icône de diagnostic, barres de vie, de chantier, d'apprivoisement et de combustible.
import * as THREE from "three/webgpu";
import type { GameData } from "@supreme/shared";
import { BUILDING_WORDS, BF, BClass, NATURE_TEAM, pausableClass } from "@supreme/shared";
import { condShown } from "../../models/generator.ts";
import { FLOOR_H, liftDash } from "../liftAnim.ts";
import { barInView, broodOf, pipLayout, PIPS_PER_ROW, siteBarOf, tameOf } from "../siteBars.ts";
import { setTeamColor, setAccentColor } from "../materials.ts";
import { ASCENSEUR_MAT } from "../../../../../assets/models/buildings.ts";
import { groundHeight, HSCALE } from "../terrain.ts";
import { sideFeeds, splitterOuts } from "../../game/belts.ts";
import type { Entities } from "../entities.ts";
import { ANG, TAME_RING, UP, dirQuat, tmpC, tmpM, tmpM2, tmpQ, tmpQ2, tmpQ3, tmpS, tmpV, tmpV2, type FrameCtx } from "./common.ts";
import type { KindMesh } from "./kindMesh.ts";
import { DIAG_CLASSES, DIAG_PAUSED, SITE_BARS_MAX, pushSiteBar } from "./markers.ts";

/** durée de l'apprivoisement (nature::TAME_TICKS), en secondes */
const TAME_SECONDS = 30;
/** teinte d'un bâtiment en cours d'amélioration (chantier ambre) */
const UPGRADE_TINT = new THREE.Color(0xffc266);
/** anneaux lumineux sur le mât d'un ascenseur de tapis, et leur course au-dessus du palier bas (cases) */
const LIFT_DASHES = 3;
const LIFT_DASH_Y0 = 0.1;
const LIFT_DASH_SPAN = FLOOR_H + 0.1;

/** Teinte vive de chaque ressource extraite (plus lisible que la couleur d'objet, souvent terne). */
const ORE_TINTS: Record<string, number> = { iron_ore: 0x6f9be0, copper_ore: 0xf07a2a, silicon: 0xf2e6b0, hydrocarbon: 0xa050e0, crystal: 0x40f0ff };
const oreCache = new Map<number, THREE.Color>();
function oreTint(item: number, data: GameData): THREE.Color | null {
  if (!item || item === 255) return null;
  let c = oreCache.get(item);
  if (!c) {
    const it = data.items[item];
    if (!it) return null;
    c = new THREE.Color(ORE_TINTS[it.key] ?? it.color);
    oreCache.set(item, c);
  }
  return c;
}

/** Bâtiments de l'image : un premier parcours relève les voisinages (murs, racines, tapis au sol, répartiteurs, gisements recouverts), le second dessine. */
export function drawBuildings(e: Entities, ctx: FrameCtx): void {
  const { f, buf, me, myTeam, selected, strategic, iconScale, dt, viewRect, seen, teamOf, modOf, cslot, now, simT, camQ, fx } = ctx;
  let { nd, rings, bars, siteBars } = ctx;
  // ----- bâtiments -----
  let nvortex = 0;
  let nkawoosh = 0;
  let nring = 0;
  let nbeam = 0;
  const gates: { x: number; z: number }[] = [];
  e.coveredSpots.clear();
  let npip = 0;
  let nsup = 0;
  let nlift = 0;
  /** pilier ou montant : boîte de (sx, h, sz) posée en (x, y0, z), tournée de q */
  const support = (x: number, y0: number, z: number, sx: number, h: number, sz: number, q: THREE.Quaternion, glow = false) => {
    const m = glow ? e.liftGlow : e.supports;
    const n = glow ? nlift : nsup;
    if (n >= (glow ? 4000 : 8000) || h <= 0) return;
    tmpM2.compose(tmpV.set(x, y0, z), q, tmpS.set(sx, h, sz));
    m.setMatrixAt(n, tmpM2);
    if (glow) nlift++;
    else nsup++;
  };
  // murs : case -> équipe, pour relier chaque mur à ses voisins du même camp par des pans fins
  const walls = new Map<number, number>();
  // racines : case -> joueur + 1, pour relier chaque racine aux racines et graines-mères collées
  const rootCells = new Map<number, number>();
  // tapis du sol terminés : case -> direction (goulottes des extracteurs)
  const groundBelts = new Map<number, number>();
  // répartiteurs terminés : case -> sorties (masque de directions), comptés comme des tapis pour les jonctions
  const splitterOutsAt = new Map<number, number>();
  let o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const bd = e.data.buildings[buf[o + 1] & 0xff];
    const cls = bd?.cls;
    if (cls === BClass.Wall) walls.set(buf[o + 2] >>> 0, teamOf((buf[o + 1] >> 8) & 0xff));
    // Souche : cases des racines et des graines-mères (poteaux du réseau) -> joueur + 1
    else if (bd && bd.race === 1 && bd.supply > 0) {
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      for (let dz = 0; dz < bd.h; dz++) for (let dx = 0; dx < bd.w; dx++) rootCells.set(((bx + dx) | ((bz + dz) << 16)) >>> 0, ((buf[o + 1] >> 8) & 0xff) + 1);
    }
    else if (cls === BClass.Belt && buf[o + 4] >= 65536 && ((buf[o + 1] >>> 28) & 3) === 0) groundBelts.set(buf[o + 2] >>> 0, (buf[o + 1] >> 16) & 3);
    else if (bd?.key === "splitter" && buf[o + 4] >= 65536) splitterOutsAt.set(buf[o + 2] >>> 0, splitterOuts((buf[o + 1] >> 16) & 3, (buf[o + 5] >>> 24) & 3));
    // gisement (2 × 2 cases) recouvert par un bâtiment : ses roches hautes seront cachées
    if (bd && bd.w > 1 && e.spotAt.size) {
      const bx = buf[o + 2] & 0xffff;
      const bz = (buf[o + 2] >>> 16) & 0xffff;
      for (let dz = 0; dz < bd.h - 1; dz++) {
        for (let dx = 0; dx < bd.w - 1; dx++) {
          const si = e.spotAt.get((bz + dz) * e.map.w + bx + dx);
          if (si !== undefined) e.coveredSpots.add(si);
        }
      }
    }
  }
  o = f.buildingOff;
  for (let i = 0; i < f.nBuildings; i++, o += BUILDING_WORDS) {
    const kind = buf[o + 1] & 0xff;
    const owner = (buf[o + 1] >> 8) & 0xff;
    let dir = (buf[o + 1] >> 16) & 3;
    const bflags = (buf[o + 1] >> 20) & 0xff;
    const bx = buf[o + 2] & 0xffff;
    const bz = (buf[o + 2] >>> 16) & 0xffff;
    const def = e.data.buildings[kind];
    const cx = bx + def.w / 2;
    const cz = bz + def.h / 2;
    const enemy = teamOf(owner) !== myTeam;
    if (enemy && !seen(cx, cz, 8 | 1)) continue;
    const col = e.teamColors[cslot(owner)];
    if (strategic && def.cls !== BClass.Belt && def.cls !== BClass.Inserter) {
      const ic = e.icons[3];
      if (ic.count < 12000) {
        const s = iconScale * Math.max(0.7, def.w / 3);
        tmpM.compose(tmpV.set(cx, groundHeight(e.map, cx, cz) + 1, cz), tmpQ.identity(), tmpS.set(s, s, s));
        ic.setMatrixAt(ic.count, tmpM);
        ic.setColorAt(ic.count, col);
        ic.count++;
      }
      continue;
    }
    if (strategic) continue;
    // tapis en virage : forme calculée par la simulation d'après les tapis voisins (mot auxiliaire)
    const shape = def.cls === BClass.Belt ? buf[o + 5] & 3 : 0;
    // extracteur, dépôt ou générateur amélioré : modèle de son niveau
    const lvl = def.cls === BClass.Extractor || def.cls === BClass.Depot || def.cls === BClass.Power || def.key === "splitter" || def.key === "furnace" ? (buf[o + 5] >>> 24) & 3 : 0;
    // tapis droit au sol rejoint par le côté : variante au rebord ouvert (jonction en T continue)
    const junction = def.cls === BClass.Belt && !shape && buf[o + 4] >= 65536 && ((buf[o + 1] >>> 28) & 3) === 0 && (buf[o + 5] & 4) === 0 ? beltJunction(e, kind, bx, bz, dir, groundBelts, splitterOutsAt) : undefined;
    // rail en virage : forme 1 + c (simulation, d'après les rails voisins) reliant les côtés c et c + 1 ;
    // le modèle relie l'arrière (côté dir + 2) et la gauche (côté dir + 1) : dir = c + 3
    const railShape = def.cls === BClass.Rail ? buf[o + 5] & 7 : 0;
    const railCurve = railShape >= 1 && railShape <= 4 ? e.railCurves.get(kind) : undefined;
    if (railCurve) dir = (railShape + 2) & 3;
    // tapis surélevé (bits 28-29) ; montée ou descente vers le niveau des bits 3-4 du mot auxiliaire :
    // la case est un ascenseur, dessiné par son mât (du palier bas au palier haut) et ses quais à la place du tapis
    const floor = def.cls === BClass.Belt ? (buf[o + 1] >>> 28) & 3 : 0;
    const ramp = def.cls === BClass.Belt && (buf[o + 5] & 4) !== 0 ? (buf[o + 5] >> 3) & 3 : -1;
    const mast = ramp >= 0 ? e.liftMast : null;
    const km = mast ?? railCurve ?? junction ?? (shape ? (e.beltCurves.get(kind)?.[shape - 1] ?? e.buildingMeshes[kind]) : ((lvl > 0 ? e.levelMeshes.get(kind)?.[lvl - 1] : undefined) ?? e.buildingMeshes[kind]));
    // amélioration en cours (millièmes, 0 : aucune) : chantier, le bâtiment ne travaille pas
    const upg = def.cls !== BClass.Belt ? Math.max(0, buf[o + 7]) / 1000 : 0;
    km.ensure(km.n + 1);
    const build = buf[o + 4] / 65536;
    const ground = groundHeight(e.map, cx, cz);
    const low = mast ? Math.min(floor, ramp) : floor;
    const y = ground + low * FLOOR_H;
    // le mât d'un ascenseur est à droite du modèle : on le retourne quand la file arrive par ce côté-là (forme 2)
    const orient = mast && shape === 2 ? (dir + 2) & 3 : dir;
    dirQuat(tmpQ, orient);
    // cocon de la Souche qui mûrit : il bat, de plus en plus vite et fort, jusqu'à s'ouvrir
    const ripe = def.key === "cocoon" && build >= 1 ? (buf[o + 5] & 0x3ff) / 1000 : -1;
    const sc = ripe < 0 ? km.scale : km.scale * (1 + Math.sin(simT * (3 + 9 * ripe * ripe)) * (0.008 + 0.03 * ripe));
    // les hauteurs du mât sont en cases du monde : seul son plan est à l'échelle du tapis
    // frondaison ou racine-puits épuisée (plus d'herbe autour) : elle s'affaisse
    const wilt = def.cls === BClass.Organ && build >= 1 && bflags & BF.NO_INPUT ? 0.78 : 1;
    const sy = (mast ? 1 : sc) * (build >= 1 ? wilt : Math.max(0.08, build));
    tmpM.compose(tmpV.set(cx, def.water ? e.map.waterLevel * HSCALE : y, cz), tmpQ, tmpS.set(sc, sy, sc));
    km.body!.mesh.setMatrixAt(km.n, tmpM);
    const tameTint = def.key === "nest" ? tameOf(buf, o, true) : null;
    const c = tameTint && tameTint.progress > 0 ? tmpC.copy(col).lerp(e.teamColors[cslot(tameTint.tamer)], tameTint.progress * (0.65 + 0.35 * Math.sin(simT * 5))) : build < 1 ? tmpC.copy(col).lerp(new THREE.Color(0x9fe8ff), 0.5) : upg > 0 ? tmpC.copy(col).lerp(UPGRADE_TINT, 0.45 + 0.1 * Math.sin(performance.now() / 180)) : bflags & BF.UNPOWERED ? tmpC.copy(col).multiplyScalar(0.45) : col;
    setTeamColor(km.body!, km.n, c);
    // porte de transit (aux2 : charge d'ouverture, 0 à 100) : gerbe à l'ouverture, puis horizon ondulant
    if (def.key === "gate" && build >= 1) {
      const charge = buf[o + 6];
      if (charge >= 60) {
        // anneau : centre (0 ; 2,1 ; 0) du modèle, rayon intérieur 1,26 ; l'horizon est dans le plan de l'anneau
        const r = 1.26 * sc;
        const cy = y + 2.1 * sy;
        tmpV2.set(0, 0, 1).applyQuaternion(tmpQ);
        if (nvortex < 64) {
          const k = Math.min(1, (charge - 60) / 15);
          tmpM2.compose(tmpV.set(cx, cy, cz), tmpQ, tmpS.set(r * k, r * k, 1));
          e.vortex.setMatrixAt(nvortex++, tmpM2);
        }
        if (charge < 90 && nkawoosh < 64) {
          // gerbe : une poche d'énergie jaillit vers l'avant puis se rétracte
          const k = Math.sin(((charge - 60) / 30) * Math.PI);
          const len = Math.max(0.05, k * 2.6 * sc);
          tmpM2.compose(tmpV.set(cx + tmpV2.x * len, cy, cz + tmpV2.z * len), tmpQ, tmpS.set(r * 0.8, r * 0.8, len));
          e.kawoosh.setMatrixAt(nkawoosh++, tmpM2);
        }
        if (charge >= 100) gates.push({ x: cx, z: cz });
      }
    }
    // anneaux de transport (aux : montée, ticks restants ; aux2 : recharge) : cinq anneaux montent,
    // éclair de lumière à l'échange, puis ils redescendent dans la plateforme
    if (def.cls === BClass.Transfer && build >= 1) {
      const charge = buf[o + 5];
      const cool = buf[o + 6];
      const up = charge > 0 ? 1 - charge / 30 : cool > 380 ? (cool - 380) / 20 : 0;
      if (up > 0) {
        const rr = 1.2 * sc;
        for (let k = 0; k < 5 && nring < 400; k++) {
          const h = (0.35 + k * 0.42) * Math.max(0, Math.min(1, up * 1.6 - k * 0.12));
          tmpM2.compose(tmpV.set(cx, y + 0.3 + h, cz), tmpQ.identity(), tmpS.set(rr, 1.4, rr));
          e.ringStack.setMatrixAt(nring++, tmpM2);
        }
        const flash = (charge > 0 && charge <= 5) || cool > 390 ? 1 : 0;
        if (flash && nbeam < 64) {
          tmpM2.compose(tmpV.set(cx, y + 1.5, cz), tmpQ.identity(), tmpS.set(rr * 0.95, 3, rr * 0.95));
          e.ringBeam.setMatrixAt(nbeam++, tmpM2);
        }
      }
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - (dir * Math.PI) / 2);
    }
    // tapis surélevé : pilier sous la case
    if (def.cls === BClass.Belt && floor > 0 && !mast) support(cx, ground, cz, 0.16, floor * FLOOR_H - 0.02, 0.16, tmpQ);
    if (mast) {
      const li = e.nLifts++;
      const l = (e.lifts[li] ??= { x: 0, z: 0, y: 0, orient: 0, up: false, ready: false, parked: -1 });
      l.x = cx;
      l.z = cz;
      l.y = y;
      l.orient = orient;
      l.up = ramp > floor;
      l.ready = build >= 1;
      l.parked = -1;
      e.liftAt.set((bz * e.map.w + bx) * 2 + Math.min(1, low), li);
      // quais aux couleurs du tapis : l'entrée au niveau du tapis, derrière lui (ou du côté d'où arrive
      // la file, s'il est pris par le côté : forme 1 ou 2), la sortie devant lui au niveau visé
      const quay = e.beltQuays.get(kind) ?? e.beltQuays.values().next().value;
      if (quay) {
        quay.ensure(quay.n + 2);
        const qs = quay.scale;
        const qy = build >= 1 ? qs : qs * Math.max(0.08, build);
        for (const [at, d] of [[floor, shape === 1 ? dir + 3 : shape === 2 ? dir + 1 : dir], [ramp, dir + 2]]) {
          tmpM2.compose(tmpV.set(cx, ground + at * FLOOR_H, cz), dirQuat(tmpQ2, d & 3), tmpS.set(qs, qy, qs));
          quay.body!.mesh.setMatrixAt(quay.n, tmpM2);
          setTeamColor(quay.body!, quay.n, c);
          quay.n++;
        }
      }
      tmpV2.set(ASCENSEUR_MAT * sc, 0, 0).applyQuaternion(tmpQ);
      const mx = cx + tmpV2.x;
      const mz = cz + tmpV2.z;
      // ascenseur en hauteur (du niveau 1 au niveau 2) : son mât descend jusqu'au sol
      if (low > 0) support(mx, ground, mz, 0.05 * sc, low * FLOOR_H + 0.01, 0.07 * sc, tmpQ);
      // anneaux lumineux sur le mât : ils courent dans le sens de la marche, et se figent quand le
      // tapis n'a plus d'énergie
      if (build >= 1) {
        for (let k = 0; k < LIFT_DASHES; k++) {
          const h = LIFT_DASH_Y0 + liftDash(k, LIFT_DASHES, simT, ramp > floor, !(bflags & BF.UNPOWERED)) * LIFT_DASH_SPAN;
          support(mx, y + h, mz, 0.064 * sc, 0.07, 0.084 * sc, tmpQ, true);
        }
      }
    }
    // extracteur amélioré : barres de niveau sur la façade avant (repère du bâtiment)
    if (lvl > 0 && build >= 1 && npip + lvl <= 2000) {
      const bw = dir & 1 ? def.h : def.w;
      const bh = dir & 1 ? def.w : def.h;
      for (let k = 0; k < lvl; k++) {
        // avant du modèle = +z local ; décalage latéral centré
        tmpV2.set((k - (lvl - 1) / 2) * 0.42, 0.34, Math.max(bw, bh) / 2 - 0.02).applyQuaternion(tmpQ);
        tmpM2.compose(tmpV.set(cx + tmpV2.x, y + tmpV2.y, cz + tmpV2.z), tmpQ, tmpS.set(1, 1, 1));
        e.levelPips.setMatrixAt(npip++, tmpM2);
      }
    }
    // extracteur : une goulotte de chaque case de sortie (face avant) vers le tapis qui s'y trouve
    if (def.cls === BClass.Extractor && build >= 1 && e.chute) drawChutes(e, e.chute, bx, bz, dir, def.w, def.h, groundBelts);
    // racine : un tronçon vers chaque voisin (est, sud, ouest, nord) qui est une racine ou une graine-mère
    // du même joueur : la file forme un câble continu, comme le réseau qu'elle relie
    const rseg = e.rootSeg;
    if (def.key === "root" && rseg) {
      for (let d = 0; d < 4; d++) {
        const nx = bx + [1, 0, -1, 0][d];
        const nz = bz + [0, 1, 0, -1][d];
        if (nx < 0 || nz < 0 || rootCells.get((nx | (nz << 16)) >>> 0) !== owner + 1) continue;
        rseg.ensure(rseg.n + 1);
        tmpQ2.setFromAxisAngle(UP, (-d * Math.PI) / 2);
        tmpM2.compose(tmpV.set(cx, y, cz), tmpQ2, tmpS.set(rseg.scale, sy * (rseg.scale / sc), rseg.scale));
        rseg.body!.mesh.setMatrixAt(rseg.n, tmpM2);
        setTeamColor(rseg.body!, rseg.n, c);
        rseg.n++;
      }
    }
    const seg = def.key === "bramble" ? e.brambleSeg : e.wallSeg;
    if (def.cls === BClass.Wall && seg) {
      // un pan vers chaque voisin (est, sud, ouest, nord) qui est un mur du même camp
      const team = teamOf(owner);
      const ys = def.water ? e.map.waterLevel * HSCALE : y;
      for (let d = 0; d < 4; d++) {
        const nx = bx + [1, 0, -1, 0][d];
        const nz = bz + [0, 1, 0, -1][d];
        if (nx < 0 || nz < 0 || walls.get((nx | (nz << 16)) >>> 0) !== team) continue;
        seg.ensure(seg.n + 1);
        tmpQ2.setFromAxisAngle(UP, (-d * Math.PI) / 2);
        tmpM2.compose(tmpV.set(cx, ys, cz), tmpQ2, tmpS.set(seg.scale, sy * (seg.scale / sc), seg.scale));
        seg.body!.mesh.setMatrixAt(seg.n, tmpM2);
        setTeamColor(seg.body!, seg.n, c);
        seg.n++;
      }
    }
    // extracteur : pièces teintées selon la ressource exploitée
    const ore = def.cls === BClass.Extractor ? oreTint(buf[o + 5] & 0xff, e.data) : null;
    const has = modOf(buf[o] >>> 0);
    if (ore) setAccentColor(km.body!, km.n, ore);
    for (const p of km.pivots) {
      // pièce d'une amélioration qui n'est pas installée : pas dessinée
      if (!condShown(p.cond, has)) continue;
      const at = p.cond ? p.n++ : km.n;
      let rot = 0;
      if (p.fixed) rot = 0;
      else if (def.cls === BClass.Turret) rot = Math.PI / 2 - (buf[o + 5] & 0xffff) * ANG - (Math.PI / 2 - (dir * Math.PI) / 2);
      else if (def.cls === BClass.Inserter) {
        const phase = (buf[o + 5] >> 8) & 0xff;
        const timer = (buf[o + 5] >> 16) & 0xff;
        // la pince est à l'avant du modèle (angle 0 : devant, sur la case de dépose) ; à la prise, elle est
        // tournée d'un quart, d'un demi ou de trois quarts de tour (-sweep). Phase 1 : chargée, elle va
        // de la prise à la dépose ; 2 : à la dépose ; 3 : à vide, elle revient ; 0 : elle attend à la prise.
        const sweep = ((buf[o + 6] & 3 || 2) * Math.PI) / 2;
        rot = phase === 1 ? (-sweep * timer) / 6 : phase === 2 ? 0 : phase === 3 ? -sweep * (1 - timer / 6) : -sweep;
      } else if (bflags & BF.WORKING && upg === 0) rot = performance.now() / 300;
      // EPPZ d'une ruine : il flotte en tournant tant qu'il n'est pas pris, puis disparaît
      const gone = p.mode === 4 && !(bflags & BF.WORKING) ? 0.001 : 1;
      const bobY = p.mode === 4 ? Math.sin(performance.now() / 500) * 0.06 : 0;
      tmpM2.makeTranslation(p.origin.x, p.origin.y * (sy / sc) + bobY, p.origin.z);
      tmpM2.multiply(new THREE.Matrix4().makeRotationY(rot));
      tmpM2.scale(tmpS.set(sc * gone, sy * gone, sc * gone));
      const base = new THREE.Matrix4().compose(tmpV.set(cx, def.water ? e.map.waterLevel * HSCALE : y, cz), tmpQ, tmpS.set(1, 1, 1));
      base.multiply(tmpM2);
      p.tm.mesh.setMatrixAt(at, base);
      setTeamColor(p.tm, at, c);
      if (ore) setAccentColor(p.tm, at, ore);
    }
    km.n++;
    const ref = buf[o] >>> 0;
    if (selected.has(ref) && rings < 4000) {
      const r = def.w * 0.75;
      tmpM.compose(tmpV.set(cx, y + 0.1, cz), tmpQ.identity(), tmpS.set(r, 1, r));
      e.rings.setMatrixAt(rings, tmpM);
      e.rings.setColorAt(rings, enemy ? tmpC.setRGB(1, 0.3, 0.3) : tmpC.setRGB(0.5, 1, 0.6));
      rings++;
    }
    const hp = buf[o + 3];
    const frac = Math.max(0, Math.min(1, hp / def.hp));
    // diagnostic (nos bâtiments) : icône si le problème dure plus de 2 s
    if (owner === me && build >= 1 && DIAG_CLASSES.has(def.cls)) {
      // en pause (bâtiment de production, BF.ENABLED éteint) : signe de pause, tout de suite
      const paused = pausableClass(def.cls) && !(bflags & BF.ENABLED);
      const icon = paused ? DIAG_PAUSED : bflags & BF.UNPOWERED ? 0 : bflags & BF.NO_INPUT ? 1 : bflags & BF.OUT_BLOCKED ? 2 : bflags & BF.LOW_POWER ? 3 : -1;
      const ref = buf[o] >>> 0;
      if (icon < 0) e.diagSince.delete(ref);
      else {
        let st = e.diagSince.get(ref);
        if (!st || st.icon !== icon) e.diagSince.set(ref, (st = { icon, since: now, seen: 0 }));
        st.seen = e.frameN;
        if ((paused || now - st.since > 2000) && nd < 2000) {
          const s = Math.max(0.9, Math.min(3, iconScale * 0.9));
          tmpM.compose(tmpV.set(cx, y + km.height + 0.9 * s, cz), camQ, tmpS.set(s, s, s));
          e.diag.setMatrixAt(nd, tmpM);
          (e.diagIcon.array as Float32Array)[nd] = icon;
          nd++;
        }
      }
    }
    // bâtiment endommagé : fumée, puis flammes
    if (frac < 0.6 && build >= 1 && def.cls !== BClass.Belt && def.cls !== BClass.Inserter && (!enemy || seen(cx, cz, 1))) {
      fx.burning(cx, y + km.height * 0.85, cz, (0.6 - frac) / 0.6, Math.max(def.w, def.h) * 0.45, dt);
    }
    // nid qu'une Reine apprivoise : animation, et barre violette sous ses points de vie
    const tame = tameOf(buf, o, def.key === "nest");
    const shownTame = tame && (!enemy || seen(cx, cz, 1) || tame.tamer === me) ? tame : null;
    if (!shownTame && e.taming.delete(ref) && teamOf(owner) === NATURE_TEAM && dt > 0) fx.tameBroken(cx, cz, TAME_RING);
    const tameK = shownTame ? tameStep(e, ref, shownTame.progress, simT) : 0;
    if (shownTame && shownTame.progress > 0 && dt > 0) fx.tamingNest(cx, cz, TAME_RING, tameK, dt);
    // chantier (tapis compris) ou amélioration : barre de progression, dans la zone vue seulement
    const sb = siteBarOf(buf, o, def.hp, def.cls === BClass.Belt);
    if (sb) {
      if (siteBars + 3 <= SITE_BARS_MAX && barInView(cx, cz, viewRect)) siteBars = pushSiteBar(e, siteBars, sb, cx, y, cz, def.w, def.h);
    } else if ((frac < 0.999 || selected.has(ref) || shownTame) && def.cls !== BClass.Belt && bars < 5900) {
      const wdt = def.w * 0.8;
      tmpM.compose(tmpV.set(cx, y + 2.2, cz + def.h / 2), tmpQ.identity(), tmpS.set(wdt, 1, 1));
      e.bars.setMatrixAt(bars, tmpM);
      e.bars.setColorAt(bars, tmpC.setRGB(0.1, 0.1, 0.1));
      bars++;
      tmpM.compose(tmpV.set(cx - (wdt * (1 - frac)) / 2, y + 2.22, cz + def.h / 2), tmpQ.identity(), tmpS.set(wdt * frac, 1, 0.8));
      e.bars.setMatrixAt(bars, tmpM);
      e.bars.setColorAt(bars, tmpC.setRGB(1 - frac, 0.25 + frac * 0.7, 0.2));
      bars++;
      if (shownTame) {
        // apprivoisement : sous la vie, au moins 4 pixels d'épaisseur
        const thick = Math.max(0.22, 4 * e.pxWorld);
        const tz = cz + def.h / 2 + 0.12 + thick / 2;
        tmpM.compose(tmpV.set(cx, y + 2.2, tz), tmpQ.identity(), tmpS.set(wdt, 1, thick / 0.12));
        e.bars.setMatrixAt(bars, tmpM);
        e.bars.setColorAt(bars, tmpC.setRGB(0.1, 0.06, 0.14));
        bars++;
        const tk = Math.max(0.015, tameK);
        tmpM.compose(tmpV.set(cx - (wdt * 0.97 * (1 - tk)) / 2, y + 2.22, tz), tmpQ, tmpS.set(wdt * 0.97 * tk, 1, (thick * 0.7) / 0.12));
        e.bars.setMatrixAt(bars, tmpM);
        e.bars.setColorAt(bars, tmpC.setRGB(0.85, 0.35 + 0.1 * Math.sin(simT * 6), 1));
        bars++;
      }
    }
    // graine-mère (ou couveuse d'une ancienne partie) de l'équipe : une pastille par portée possible (pleine : elle couve ; toutes ambre : limite atteinte)
    if ((def.key === "seed_heart" || def.key === "brood") && build >= 1 && !enemy && !strategic && e.data.broodLevels && bars < 5900) {
      const br = broodOf(buf, o, e.data.broodLevels);
      const pl = pipLayout(br.max, e.pxWorld);
      const lift = y + km.height + 0.6;
      const cols = Math.min(br.max, PIPS_PER_ROW);
      tmpM.compose(tmpV.set(cx, lift, cz), tmpQ.identity(), tmpS.set(cols * pl.step + 0.14, 1, (pl.rows * pl.step + 0.14) / 0.12));
      e.bars.setMatrixAt(bars, tmpM);
      e.bars.setColorAt(bars, tmpC.setRGB(0.04, 0.06, 0.05));
      bars++;
      for (let k = 0; k < br.max; k++) {
        const px = cx + ((k % PIPS_PER_ROW) - (cols - 1) / 2) * pl.step;
        const pz = cz + (Math.floor(k / PIPS_PER_ROW) - (pl.rows - 1) / 2) * pl.step;
        tmpM.compose(tmpV.set(px, lift + 0.02, pz), tmpQ, tmpS.set(pl.size, 1, pl.size / 0.12));
        e.bars.setMatrixAt(bars, tmpM);
        e.bars.setColorAt(bars, k >= br.n ? tmpC.setRGB(0.16, 0.2, 0.16) : br.n >= br.max ? tmpC.setRGB(1, 0.65, 0.15) : tmpC.setRGB(0.5, 1, 0.25));
        bars++;
      }
    }
    // générateur de l'équipe : jauge de combustible au-dessus (verte, ambre sous une minute d'autonomie,
    // rouge clignotante à sec)
    const gauge = def.cls === BClass.Power && build >= 1 && upg === 0 ? e.fuelGauges.get(buf[o] >>> 0) : undefined;
    if (gauge && bars < 5900 && !strategic) {
      const wdt = def.w * 0.7;
      const lift = y + km.height + 0.5;
      // barre à plat, comme les points de vie (géométrie couchée), un peu plus épaisse
      tmpM.compose(tmpV.set(cx, lift, cz), tmpQ.identity(), tmpS.set(wdt + 0.12, 1, 2.6));
      e.bars.setMatrixAt(bars, tmpM);
      e.bars.setColorAt(bars, tmpC.setRGB(0.06, 0.08, 0.1));
      bars++;
      const dry = gauge.f <= 0;
      const f = dry ? 1 : Math.max(0.04, gauge.f);
      tmpM.compose(tmpV.set(cx - (wdt * (1 - f)) / 2, lift + 0.02, cz), tmpQ.identity(), tmpS.set(wdt * f, 1, 1.8));
      e.bars.setMatrixAt(bars, tmpM);
      if (dry) e.bars.setColorAt(bars, Math.floor(now / 400) % 2 ? tmpC.setRGB(1, 0.2, 0.15) : tmpC.setRGB(0.35, 0.05, 0.04));
      else if (gauge.low) e.bars.setColorAt(bars, tmpC.setRGB(1, 0.7, 0.2));
      else e.bars.setColorAt(bars, tmpC.setRGB(0.3, 1, 0.6));
      bars++;
    }
  }
  ctx.nd = nd;
  ctx.rings = rings;
  ctx.bars = bars;
  ctx.siteBars = siteBars;
  ctx.npip = npip;
  ctx.nsup = nsup;
  ctx.nlift = nlift;
  ctx.nvortex = nvortex;
  ctx.nkawoosh = nkawoosh;
  ctx.nring = nring;
  ctx.nbeam = nbeam;
  ctx.gates = gates;
}

/** Avancement affiché d'un nid qu'une Reine apprivoise : la simulation l'avance d'une seconde à la fois. */
function tameStep(e: Entities, ref: number, k: number, simT: number): number {
  const t = e.taming.get(ref);
  if (!t || t.k !== k) e.taming.set(ref, { k, at: simT });
  return k > 0 ? Math.min(1, k + Math.max(0, Math.min(1, simT - (t && t.k === k ? t.at : simT))) / TAME_SECONDS) : 0;
}

/**
 * Variante d'un tapis droit en (x, z), tourné vers `dir`, rejoint par le côté : un tapis au sol voisin,
 * perpendiculaire, qui pointe vers lui, ou une sortie de répartiteur (`belts` : case x | z << 16 ->
 * direction ; `splitters` : case -> sorties). Indéfini sinon.
 */
function beltJunction(e: Entities, kind: number, x: number, z: number, dir: number, belts: Map<number, number>, splitters: Map<number, number>): KindMesh | undefined {
  const set = e.beltJunctions.get(kind);
  if (!set) return undefined;
  const inside = (nx: number, nz: number) => nx >= 0 && nz >= 0;
  const m = sideFeeds(x, z, dir, {
    belt: (nx, nz) => (inside(nx, nz) ? belts.get(nx | (nz << 16)) : undefined),
    splitter: (nx, nz) => (inside(nx, nz) ? (splitters.get(nx | (nz << 16)) ?? 0) : 0),
  });
  // repère du modèle (tourné de π/2 - dir·π/2, voir le placement des bâtiments) : le côté dir + 1 est
  // à gauche (-x), le côté dir + 3 à droite (+x)
  const neg = (m & 1) !== 0;
  const pos = (m & 2) !== 0;
  return neg && pos ? set[2] : neg ? set[0] : pos ? set[1] : undefined;
}

/**
 * Goulottes d'un extracteur posé en (bx, bz), tourné vers `dir` : pour chaque case devant sa face
 * avant qui porte un tapis, un petit tapis incliné descend du socle jusqu'au tapis. Tapis dans le sens
 * de la sortie : la goulotte rejoint son début ; en travers ou à contresens : elle s'arrête sur son
 * bord (arrivée latérale).
 */
function drawChutes(e: Entities, km: KindMesh, bx: number, bz: number, dir: number, w: number, h: number, belts: Map<number, number>): void {
  const DX = [1, 0, -1, 0];
  const DZ = [0, 1, 0, -1];
  const bw = dir & 1 ? h : w;
  const bh = dir & 1 ? w : h;
  // cases devant la face avant (même ordre que la simulation : front_tiles)
  const tiles: [number, number][] = [];
  if (dir === 0) for (let z = bz; z < bz + bh; z++) tiles.push([bx + bw, z]);
  else if (dir === 1) for (let x = bx; x < bx + bw; x++) tiles.push([x, bz + bh]);
  else if (dir === 2) for (let z = bz; z < bz + bh; z++) tiles.push([bx - 1, z]);
  else for (let x = bx; x < bx + bw; x++) tiles.push([x, bz - 1]);
  const dx = DX[dir];
  const dz = DZ[dir];
  const yaw = Math.PI / 2 - (dir * Math.PI) / 2;
  for (const [tx, tz] of tiles) {
    const bd = belts.get((tx | (tz << 16)) >>> 0);
    if (bd === undefined) continue;
    // bord de la case du tapis côté extracteur, au milieu de la case
    const ex = tx + 0.5 - dx * 0.5;
    const ez = tz + 0.5 - dz * 0.5;
    // départ dans le socle de l'extracteur ; arrivée au début du tapis (même sens) ou sur son bord
    const reach = bd === dir ? 0.12 : 0.24;
    const sx = ex - dx * 0.22;
    const sz = ez - dz * 0.22;
    const fx = ex + dx * reach;
    const fz = ez + dz * reach;
    const g = groundHeight(e.map, ex, ez);
    const y0 = g + 0.24;
    const y1 = g + 0.1;
    const len = Math.hypot(fx - sx, fz - sz);
    const pitch = Math.atan2(y0 - y1, len);
    km.ensure(km.n + 1);
    tmpQ2.setFromAxisAngle(UP, yaw).multiply(tmpQ3.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
    tmpM2.compose(tmpV.set((sx + fx) / 2, (y0 + y1) / 2 - 0.03, (sz + fz) / 2), tmpQ2, tmpS.set(1, 1, len / Math.cos(pitch)));
    km.body!.mesh.setMatrixAt(km.n, tmpM2);
    setTeamColor(km.body!, km.n, tmpC.setRGB(1, 1, 1));
    km.n++;
  }
}
