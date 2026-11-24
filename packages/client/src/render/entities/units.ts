// Rendu des entités, passes des unités : modèle et pièces mobiles (tourelle, jambes, chenilles, droïde
// roulant, déploiements décrits dans le modèle), œufs et naissances de la Souche, Reine enracinée ou qui
// apprivoise un nid, icônes stratégiques, cercles de sélection, barres de vie, insignes de vétérance,
// rayons des ingénieurs ; puis les fantômes (unités qui viennent de passer une porte ou des anneaux) et
// les coques vides des œufs éclos.
import * as THREE from "three/webgpu";
import { UNIT_WORDS, UF, Layer } from "@supreme/shared";
import { condShown, depMatrix } from "../../models/generator.ts";
import { BIRTH_TIME, birthScale, eggPose, HUSK_LIFE, huskPose } from "../eggAnim.ts";
import { setTeamColor } from "../materials.ts";
import { groundHeight } from "../terrain.ts";
import type { Entities } from "../entities.ts";
import { ANG, ORDER_TAME, TAME_SHOW, TILE, UP, ZAXIS, tmpC, tmpM, tmpM2, tmpQ, tmpQ2, tmpQ3, tmpS, tmpV, tmpV2, type FrameCtx } from "./common.ts";

/** code de l'ordre de récolte du commandant (Order::Harvest), dans le mot aux des unités */
const ORDER_HARVEST = 16;
/** Enfoncement d'un fouisseur enterré (part de sa hauteur). */
const BURIED_DEPTH = 0.43;

/** Unités de l'image : icône en vue stratégique ou au radar, sinon modèle animé et ses repères. */
export function drawUnits(e: Entities, ctx: FrameCtx): void {
  const { f, buf, alpha, myTeam, selected, strategic, iconScale, dt, seen, teamOf, modOf, cslot, now, simT, camQ, vx0, vz0, vx1, vz1, fx } = ctx;
  let { rings, bars, nr } = ctx;
  // ----- unités -----
  let o = f.unitOff;
  for (let i = 0; i < f.nUnits; i++, o += UNIT_WORDS) {
    const id = buf[o] >>> 0;
    const kind = buf[o + 1] & 0xff;
    const owner = (buf[o + 1] >> 8) & 0xff;
    const flags = (buf[o + 1] >> 16) & 0xff;
    const x = (buf[o + 4] + (buf[o + 2] - buf[o + 4]) * alpha) / TILE;
    const z = (buf[o + 5] + (buf[o + 3] - buf[o + 5]) * alpha) / TILE;
    const enemy = teamOf(owner) !== myTeam;
    const visible = !enemy || seen(x, z, 1);
    const radar = enemy && !visible && seen(x, z, 2) && e.data.units[kind].layer !== Layer.Sub;
    if (!visible && !radar) continue;
    const def = e.data.units[kind];
    const y = e.unitHeight(kind, x, z);
    const inView = x > vx0 - 4 && x < vx1 + 4 && z > vz0 - 4 && z < vz1 + 4;
    e.screen.push({ id, kind, owner, x, y, z, visible, drawn: strategic || inView });
    const col = e.teamColors[cslot(owner)];
    if (strategic || radar) {
      const layer = def.layer;
      const ic = e.icons[layer === Layer.Air ? 1 : layer === Layer.Naval || layer === Layer.Sub ? 2 : 0];
      if (ic.count < 12000) {
        const s = iconScale * (def.tier === 6 ? 2.2 : def.key === "commander" ? 1.8 : def.buildPower > 0 ? 0.8 : 1) * (radar ? 0.8 : 1);
        const facing = (buf[o + 6] & 0xffff) * ANG;
        tmpQ.setFromAxisAngle(UP, layer === Layer.Air ? Math.PI / 2 - facing + Math.PI : 0);
        tmpM.compose(tmpV.set(x, y + 1, z), tmpQ, tmpS.set(s, s, s));
        ic.setMatrixAt(ic.count, tmpM);
        ic.setColorAt(ic.count, radar ? tmpC.setRGB(0.6, 0.6, 0.6) : selected.has(id) ? tmpC.setRGB(1, 1, 1) : col);
        ic.count++;
      }
      if (radar || !inView) continue;
      if (strategic) continue;
    }
    if (!inView) continue;
    const km = e.unitMeshes[kind];
    km.ensure(km.n + 1);
    const facing = (buf[o + 6] & 0xffff) * ANG;
    const turret = ((buf[o + 6] >>> 16) & 0xffff) * ANG;
    let bob = 0;
    if (def.layer === Layer.Air || def.layer === Layer.Hover) bob = Math.sin(performance.now() / 400 + id) * 0.06;
    // marche : la phase avance avec la distance parcourue, l'amplitude suit la vitesse
    let st = e.anim.get(id);
    if (!st) {
      e.anim.set(id, (st = { phase: (id % 7) * 0.9, torso: 0, seen: 0 }));
      // apparu là où un œuf vient d'éclore : il en sort en grandissant
      const h = def.egg ? undefined : e.hatches.find((h) => Math.abs(h.x - x) < 0.4 && Math.abs(h.z - z) < 0.4);
      if (h) st.born = h.t0;
    }
    // saut de plus de 3 cases d'une image à l'autre (porte, anneaux, téléportation) : l'unité s'efface
    // là où elle était et émerge là où elle arrive
    if (st.lx !== undefined && st.seen === e.animFrame - 1 && Math.hypot(x - st.lx, z - (st.lz ?? z)) > 3) {
      st.warp = now;
      if (e.ghosts.length < 200) e.ghosts.push({ kind, col: col.clone(), x: st.lx, y, z: st.lz ?? z, facing: (buf[o + 6] & 0xffff) * ANG, t0: now, fwd: e.gateAt(st.lx, st.lz ?? z) ? 1 : 0 });
    }
    // chenilles : distance réellement parcourue à l'écran (position interpolée d'une image à l'autre)
    if (st.lx !== undefined && st.seen === e.animFrame - 1) {
      const moved = Math.hypot(x - st.lx, z - (st.lz ?? z));
      if (moved < 3) st.dist = (st.dist ?? 0) + moved;
    }
    st.lx = x;
    st.lz = z;
    st.seen = e.animFrame;
    // droïde roulant : passage progressif de la boule au déploiement (0 : roulé, 1 : déployé)
    const depT = flags & UF.DEPLOYED ? 1 : 0;
    st.dep = (st.dep ?? depT) + Math.max(-dt * 4, Math.min(dt * 4, depT - (st.dep ?? depT)));
    const emerge = st.warp !== undefined ? Math.min(1, (now - st.warp) / 350) : 1;
    const per = Math.hypot(buf[o + 2] - buf[o + 4], buf[o + 3] - buf[o + 5]) / TILE; // cases par tick
    const vmax = Math.max(0.1, def.speed / 10); // cases par seconde
    const walk = Math.min(1, (per * 20) / vmax);
    const stride = Math.max(0.4, km.height * 0.7);
    st.phase += ((per * 20 * dt) / stride) * Math.PI;
    // chenillard des Transhumants : déploiement (15 s) ou repli (10 s) ; stabilisateurs sortis de 0 à 1
    const packing = (buf[o + 1] >>> 29) & 1 ? 1 : (buf[o + 1] >>> 30) & 1 ? 2 : 0;
    if (packing !== (st.pack ?? 0)) {
      st.pack = packing;
      st.packTick = f.tick;
    }
    // (tourelle d'une Arche : 2 s et 1,5 s)
    const queen = def.key === "queen";
    // (vérins rapides : deux fois moins long)
    const has = modOf(id);
    const packLen = queen ? 60 : def.turret ? (packing === 1 ? 40 : 30) : (packing === 1 ? 300 : 200) / (packing && e.quickKeys.some(has) ? 2 : 1);
    const packT = packing ? Math.min(1, (f.tick - (st.packTick ?? f.tick) + alpha) / packLen) : 0;
    // animations décrites dans le modèle (pivots « dep|… ») : avancement 0 replié, 1 déployé
    let depP = packing === 1 ? packT : packing === 2 ? 1 - packT : def.turret && flags & UF.DEPLOYED ? 1 : 0;
    if (walk > 0.05 && km.legs) bob += Math.abs(Math.sin(st.phase)) * 0.025 * km.height * walk;
    tmpQ.setFromAxisAngle(UP, Math.PI / 2 - facing);
    // œuf de la Souche : il respire, s'agite avant d'éclore, puis ouvre ses lèvres (le temps restant tient
    // la place de l'angle de tourelle) ; organisme qui vient d'en sortir : il grandit
    let grow = 1;
    if (def.egg) {
      const pose = eggPose(((buf[o + 6] >>> 16) & 0xffff) + 1 - alpha, simT, id % 97);
      depP = pose.dep;
      grow = pose.scale;
      bob += pose.lift * km.height;
      if (pose.tilt !== 0) tmpQ.premultiply(tmpQ2.setFromAxisAngle(tmpV2.set(Math.cos(pose.axis), 0, Math.sin(pose.axis)), pose.tilt));
    } else if (st.born !== undefined) {
      const age = Math.max(0, simT - st.born) / BIRTH_TIME;
      if (age >= 1) st.born = undefined;
      else grow = birthScale(age);
    }
    // Reine enracinée : elle s'affaisse, des racines jaillissent autour d'elle (1 : enracinée)
    if (queen) {
      const rootK = packing === 1 ? packT : packing === 2 ? 1 - packT : flags & UF.DEPLOYED ? 1 : 0;
      if (rootK > 0) {
        bob -= 0.22 * rootK * km.height;
        queenRoots(e, x, y, z, rootK, km.height, cslot(owner));
      }
    }
    // Reine qui apprivoise un nid : elle se dresse et se balance, des spores volent de sa tête vers le nid
    if (queen && buf[o + 8] >>> 24 === ORDER_TAME && (!enemy || visible)) {
      const tx = (buf[o + 8] & 0xfff) + 0.5;
      const tz = ((buf[o + 8] >> 12) & 0xfff) + 0.5;
      if (Math.hypot(tx - x, tz - z) < TAME_SHOW) {
        const s = Math.sin(simT * 4);
        grow *= 1.03 + 0.03 * s;
        bob += (0.06 + 0.04 * s) * km.height;
        tmpQ.premultiply(tmpQ2.setFromAxisAngle(tmpV2.set(Math.cos(facing), 0, Math.sin(facing)), 0.07 * Math.sin(simT * 2.6)));
        if (dt > 0) fx.charm(x + Math.cos(facing) * km.height * 0.45, y + bob + km.height * 0.8, z + Math.sin(facing) * km.height * 0.45, tx, tz, dt);
      }
    }
    // fouisseur enterré : seules les épines de son dos dépassent ; la terre vole quand il s'enterre ou surgit
    if (def.key === "burrower") {
      bob -= (st.dep ?? 0) * km.height * BURIED_DEPTH;
      if (Math.abs(depT - (st.dep ?? 0)) > 0.02 && Math.random() < dt * 20) fx.dirt(x, z, 0.8);
    }
    const sc = km.scale * (0.05 + 0.95 * emerge) * grow;
    // les origines des pivots sont à l'échelle du modèle : elles suivent l'unité quand elle grandit
    const og = sc / km.scale;
    tmpM.compose(tmpV.set(x, y + bob, z), tmpQ, tmpS.set(sc, sc, sc));
    km.body!.mesh.setMatrixAt(km.n, tmpM);
    setTeamColor(km.body!, km.n, emerge < 1 ? tmpC.copy(col).lerp(new THREE.Color(0xa8e8ff), 1 - emerge) : col);
    // haut du corps : il tourne vers sa cible à vitesse limitée (au plus 6 radians par seconde)
    const aim = flags & UF.IDLE && !(flags & UF.FIRING) && turret === 0 ? 0 : facing - turret;
    let dA = Math.atan2(Math.sin(aim - st.torso), Math.cos(aim - st.torso));
    dA = Math.max(-6 * dt, Math.min(6 * dt, dA));
    st.torso += dA;
    for (const p of km.pivots) {
      // pièce d'une amélioration qui n'est pas installée : pas dessinée
      if (!condShown(p.cond, has)) continue;
      const at = p.cond ? p.n++ : km.n;
      // la tourelle tourne vers sa cible ; les rotors tournent en continu ; les jambes se balancent
      tmpM2.makeTranslation(p.origin.x * og, p.origin.y * og, p.origin.z * og);
      if (p.wave !== 0) {
        // ondulation : chaque anneau se décale sur le côté et s'oriente le long de la vague, avec un retard
        // croissant vers la queue (la tête, anneau 1, bouge à peine)
        const ph = now / 260 - p.wave * 0.9;
        const amp = Math.min(1, (p.wave - 1) * 0.35) * 0.45 * sc;
        tmpM2.multiply(new THREE.Matrix4().makeTranslation(Math.sin(ph) * amp, Math.sin(ph * 0.5 + p.wave) * amp * 0.25, 0));
        tmpM2.multiply(new THREE.Matrix4().makeRotationY(Math.cos(ph) * 0.35 * Math.min(1, (p.wave - 1) * 0.35)));
      } else if (p.leg !== 0) {
        // jambes opposées (gauche / droite, avant / arrière) : balancement autour de la hanche
        tmpM2.multiply(new THREE.Matrix4().makeRotationX(Math.sin(st.phase + (p.leg > 1 ? Math.PI : 0)) * 0.55 * walk));
      } else if (p.mode === 1) {
        // boule du droïde : elle roule (un tour par circonférence parcourue)
        tmpM2.multiply(new THREE.Matrix4().makeRotationX(st.phase * 0.9));
      } else if (p.mode === 2) {
        // pattes du droïde : elles se déplient depuis le centre
      } else if (p.dep) {
        // déploiement décrit dans le modèle (rotations autour de l'origine du pivot, puis décalages)
        tmpM2.multiply(depMatrix(p.dep, depP, sc));
      } else if (p.slide > 0) {
        // crampons de chenille : ils avancent avec la distance parcourue, d'un pas par période (brin supérieur)
        tmpM2.multiply(new THREE.Matrix4().makeTranslation(0, 0, ((((st.dist ?? 0) / Math.max(1e-6, sc)) % p.slide) - p.slide / 2) * sc));
      } else if (!p.fixed) tmpM2.multiply(new THREE.Matrix4().makeRotationY(p.spin ? performance.now() / (p.cond ? 400 : 80) : st.torso));
      // droïde : la boule rentre quand il se déploie, les pièces déployées sortent
      const dep = st.dep ?? 0;
      const vis = p.mode === 1 ? Math.max(0.001, 1 - dep) : p.mode === 2 || p.mode === 3 ? Math.max(0.001, dep) : 1;
      tmpM2.scale(tmpS.set(sc * vis, sc * vis, sc * vis));
      const base = tmpM.clone();
      base.scale(tmpS.set(1 / sc, 1 / sc, 1 / sc));
      base.multiply(tmpM2);
      p.tm.mesh.setMatrixAt(at, base);
      setTeamColor(p.tm, at, col);
    }
    km.n++;
    const r = Math.max(0.5, e.unitRadius(kind, id) / TILE + 0.15);
    if (selected.has(id) && rings < 4000) {
      tmpM.compose(tmpV.set(x, y + 0.05, z), tmpQ.identity(), tmpS.set(r, 1, r));
      e.rings.setMatrixAt(rings, tmpM);
      e.rings.setColorAt(rings, enemy ? tmpC.setRGB(1, 0.3, 0.3) : tmpC.setRGB(0.5, 1, 0.6));
      rings++;
    }
    const hp = buf[o + 7];
    // vétérance : niveau 0 à 5 (+10 % de points de vie par niveau)
    const lvl = (buf[o + 1] >>> 24) & 7;
    const frac = Math.max(0, Math.min(1, hp / ((def.hp * (100 + 10 * lvl)) / 100)));
    if (lvl > 0 && !enemy && nr + lvl <= 3000) {
      // losanges dorés au-dessus de l'unité
      const sz = Math.max(0.22, Math.min(0.6, iconScale * 0.25));
      for (let k = 0; k < lvl; k++) {
        tmpM.compose(tmpV.set(x + (k - (lvl - 1) / 2) * sz * 1.25, y + 1.45 + r * 0.6, z + r), camQ, tmpS.set(sz, sz, sz));
        e.ranks.setMatrixAt(nr++, tmpM);
      }
    }
    if ((selected.has(id) || frac < 0.999) && bars < 5900) {
      const wdt = Math.max(0.8, r * 1.6);
      tmpM.compose(tmpV.set(x, y + 1.2 + r * 0.6, z + r), tmpQ.identity(), tmpS.set(wdt, 1, 1));
      e.bars.setMatrixAt(bars, tmpM);
      e.bars.setColorAt(bars, tmpC.setRGB(0.1, 0.1, 0.1));
      bars++;
      tmpM.compose(tmpV.set(x - (wdt * (1 - frac)) / 2, y + 1.22 + r * 0.6, z + r), tmpQ.identity(), tmpS.set(wdt * frac, 1, 0.8));
      e.bars.setMatrixAt(bars, tmpM);
      e.bars.setColorAt(bars, tmpC.setRGB(1 - frac, 0.25 + frac * 0.7, 0.2));
      bars++;
    }
    if (frac < 0.4 && def.radius >= 200) fx.burning(x, y + km.height * 0.8, z, 1 - frac / 0.4, def.radius / TILE, dt);
    // rayon de construction des ingénieurs
    if (flags & UF.WORKING) {
      const aux = buf[o + 8];
      const tx = (aux & 0xfff) + 0.5;
      const tz = ((aux >> 12) & 0xfff) + 0.5;
      if (aux >>> 24 === ORDER_HARVEST) {
        // récolte du commandant : rayon d'extraction orangé vers le gisement, fonderie dorsale allumée
        if (Math.random() < 0.35) e.addBeam(new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(tx + (Math.random() - 0.5) * 1.4, groundHeight(e.map, tx, tz) + 0.1, tz + (Math.random() - 0.5) * 1.4), 0xff8a2a, 0.14);
        // bouche du four (modèle : 0, 1,32, -0,78) et cheminées du sac dorsal (2,7, -0,66), vers l'arrière
        const fwx = Math.cos(facing) * km.scale;
        const fwz = Math.sin(facing) * km.scale;
        fx.smelting(x - fwx * 0.78, y + 1.32 * km.scale, z - fwz * 0.78, x - fwx * 0.66, y + 2.7 * km.scale, z - fwz * 0.66, tx, tz, dt);
      } else if (Math.random() < 0.5) e.addBeam(new THREE.Vector3(x, y + 0.6, z), new THREE.Vector3(tx + (Math.random() - 0.5), groundHeight(e.map, tx, tz) + 0.5, tz + (Math.random() - 0.5)), 0x7df9ff, 0.12);
    }
  }
  ctx.rings = rings;
  ctx.bars = bars;
  ctx.nr = nr;
}

/** Racines d'une Reine enracinée : six grosses racines sortent du sol autour d'elle et y replongent. */
function queenRoots(e: Entities, x: number, y: number, z: number, k: number, height: number, slot: number): void {
  const seg = e.rootSeg;
  if (!seg) return;
  for (let i = 0; i < 6; i++) {
    seg.ensure(seg.n + 1);
    const a = (i / 6) * Math.PI * 2 + 0.35;
    // longues et minces, la pointe piquée dans le sol (inclinées) ; elles montent du sol en grandissant
    const len = seg.scale * height * (2.5 + (i % 2) * 0.6);
    const thick = seg.scale * height * 0.85;
    tmpQ2.setFromAxisAngle(UP, a).multiply(tmpQ3.setFromAxisAngle(ZAXIS, -0.2));
    tmpM2.compose(tmpV.set(x, y + (0.2 - 0.6 * (1 - k)) * height, z), tmpQ2, tmpS.set(len * (0.35 + 0.65 * k), thick, thick));
    seg.body!.mesh.setMatrixAt(seg.n, tmpM2);
    setTeamColor(seg.body!, seg.n, e.teamColors[slot]);
    seg.n++;
  }
}

/** Unités qui viennent de disparaître d'ici (porte, anneaux, téléportation). */
export function drawGhosts(e: Entities, ctx: FrameCtx): void {
  const { now } = ctx;
  // ----- fantômes : unités qui viennent de passer une porte ou des anneaux ; elles s'effacent sur place
  // (dans une porte : en avançant dans l'horizon) -----
  e.ghosts = e.ghosts.filter((g) => now - g.t0 < 350);
  for (const g of e.ghosts) {
    const t = (now - g.t0) / 350;
    const km = e.unitMeshes[g.kind];
    km.ensure(km.n + 1);
    const sc = km.scale * (1 - t * 0.95);
    const adv = g.fwd * t * 0.9;
    tmpQ.setFromAxisAngle(UP, Math.PI / 2 - g.facing);
    tmpM.compose(tmpV.set(g.x + Math.cos(g.facing) * adv, g.y, g.z + Math.sin(g.facing) * adv), tmpQ, tmpS.set(sc, sc, sc));
    km.body!.mesh.setMatrixAt(km.n, tmpM);
    const c = tmpC.copy(g.col).lerp(new THREE.Color(0xa8e8ff), t);
    setTeamColor(km.body!, km.n, c);
    for (const p of km.pivots) {
      if (p.cond?.on) continue;
      const at = p.cond ? p.n++ : km.n;
      tmpM2.makeTranslation(p.origin.x, p.origin.y, p.origin.z).scale(tmpS.set(sc, sc, sc));
      const base = tmpM.clone();
      base.scale(tmpS.set(1 / sc, 1 / sc, 1 / sc));
      base.multiply(tmpM2);
      p.tm.mesh.setMatrixAt(at, base);
      setTeamColor(p.tm, at, c);
    }
    km.n++;
  }
}

/** Coques vides des œufs éclos (et oubli des éclosions passées). */
export function drawHusks(e: Entities, ctx: FrameCtx): void {
  const { strategic, cslot, simT, vx0, vz0, vx1, vz1 } = ctx;
  // ----- coques vides des œufs éclos : les lèvres s'affaissent, le cœur s'éteint, elles rentrent dans le sol -----
  // (une entrée datée de plus d'une seconde dans le futur vient d'une partie précédente)
  e.hatches = e.hatches.filter((h) => simT - h.t0 < 1 && simT - h.t0 > -1);
  e.husks = e.husks.filter((h) => simT - h.t0 < HUSK_LIFE && simT - h.t0 > -1);
  if (!strategic) {
    for (const h of e.husks) {
      if (h.x < vx0 - 4 || h.x > vx1 + 4 || h.z < vz0 - 4 || h.z > vz1 + 4) continue;
      const pose = huskPose(Math.max(0, simT - h.t0));
      const km = e.unitMeshes[h.kind];
      km.ensure(km.n + 1);
      const sc = km.scale * pose.scale;
      const col = e.teamColors[cslot(h.owner)];
      tmpQ.setFromAxisAngle(UP, Math.PI / 2 - h.facing);
      tmpM.compose(tmpV.set(h.x, e.unitHeight(h.kind, h.x, h.z) - pose.sink * km.height, h.z), tmpQ, tmpS.set(sc, sc, sc));
      km.body!.mesh.setMatrixAt(km.n, tmpM);
      setTeamColor(km.body!, km.n, col);
      for (const p of km.pivots) {
        tmpM2.makeTranslation(p.origin.x * pose.scale, p.origin.y * pose.scale, p.origin.z * pose.scale);
        if (p.dep) tmpM2.multiply(depMatrix(p.dep, pose.dep, sc));
        tmpM2.scale(tmpS.set(sc, sc, sc));
        const base = tmpM.clone();
        base.scale(tmpS.set(1 / sc, 1 / sc, 1 / sc));
        base.multiply(tmpM2);
        p.tm.mesh.setMatrixAt(km.n, base);
        setTeamColor(p.tm, km.n, col);
      }
      km.n++;
    }
  }
}
