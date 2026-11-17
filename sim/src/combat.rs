//! Combat : recherche de cibles par grille spatiale, tirs, projectiles, dégâts, boucliers,
//! destructions, élimination des joueurs et vision.

use crate::buildings;
use crate::data::*;
use crate::fixed::{dist, dist2, TILE};
use crate::world::*;

pub const GROUND_TARGET: u32 = 0x8000_0000;
/// Projectile spécial : rayon prolongé (laser, souffle de feu) qui suit sa source et sa cible.
pub const SPECIAL_BEAM: u8 = 3;

#[inline]
fn layer_mask(w: &World, s: usize) -> u8 {
    let d = udef(w.units.kind[s]);
    match d.layer {
        Layer::Land => M_LAND,
        Layer::Hover => {
            let (x, y) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
            if w.map.inside(x, y) && w.map.is_water(x, y) {
                M_NAVAL
            } else {
                M_LAND
            }
        }
        Layer::Naval => M_NAVAL,
        Layer::Sub => M_SUB,
        Layer::Air => M_AIR,
    }
}

#[inline]
fn visible(w: &World, team: u8, x: i32, y: i32, sub: bool) -> bool {
    let vw = w.vis_w;
    let cx = (x / (4 * TILE)).clamp(0, vw - 1);
    let cy = (y / (4 * TILE)).clamp(0, vw - 1);
    let v = w.vis[team as usize][(cy * vw + cx) as usize];
    if sub {
        v & 4 != 0
    } else {
        v & 3 != 0
    }
}

/// Une unité ennemie est-elle une cible valide pour cette arme ?
fn unit_target_ok(w: &World, team: u8, wi: usize, t: usize, x: i32, y: i32) -> bool {
    if !w.units.alive[t] || w.units.cold[t].carried_by != NONE || w.units.hp[t] <= 0 {
        return false;
    }
    if w.team_of(w.units.owner[t]) == team {
        return false;
    }
    let wd = &WEAPONS[wi];
    let lm = layer_mask(w, t);
    if wd.mask & lm == 0 {
        return false;
    }
    let (tx, ty) = (w.units.x[t], w.units.y[t]);
    let r = wd.range * TILE + udef(w.units.kind[t]).radius;
    let d2 = dist2(x, y, tx, ty);
    if d2 > (r as i64) * (r as i64) {
        return false;
    }
    if wd.min_range > 0 && d2 < ((wd.min_range * TILE) as i64).pow(2) {
        return false;
    }
    let sub = lm == M_SUB;
    if sub && d2 < (15 * TILE as i64).pow(2) {
        return true;
    }
    visible(w, team, tx, ty, sub)
}

fn building_target_ok(w: &World, team: u8, wi: usize, b: usize, x: i32, y: i32) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || bb.hp <= 0 || w.team_of(bb.owner) == team {
        return false;
    }
    let wd = &WEAPONS[wi];
    let m = if bb.def().water { M_NAVAL } else { M_LAND };
    if wd.mask & m == 0 {
        return false;
    }
    let (cx, cy) = bb.center();
    let (bw, bh) = bb.size();
    let r = wd.range * TILE + bw.max(bh) * TILE / 2;
    let d2 = dist2(x, y, cx, cy);
    if d2 > (r as i64) * (r as i64) {
        return false;
    }
    if wd.min_range > 0 && d2 < ((wd.min_range * TILE) as i64).pow(2) {
        return false;
    }
    visible(w, team, cx, cy, false)
}

fn target_ok(w: &World, team: u8, wi: usize, t: u32, x: i32, y: i32) -> bool {
    if t & GROUND_TARGET != 0 && t != NONE {
        let tx = ((t & 0xfff) as i32) * TILE + TILE / 2;
        let ty = (((t >> 12) & 0xfff) as i32) * TILE + TILE / 2;
        let wd = &WEAPONS[wi];
        if wd.mask & M_SURF == 0 {
            return false;
        }
        let r = wd.range * TILE;
        return dist2(x, y, tx, ty) <= (r as i64) * (r as i64);
    }
    if let Some(u) = w.unit(t) {
        return unit_target_ok(w, team, wi, u, x, y);
    }
    if let Some(b) = w.building(t) {
        return building_target_ok(w, team, wi, b, x, y);
    }
    false
}

fn find_target(w: &World, team: u8, wi: usize, x: i32, y: i32) -> u32 {
    let wd = &WEAPONS[wi];
    let r = wd.range * TILE;
    let mut best = NONE;
    let mut best_d = i64::MAX;
    let enemies = !(1u8 << (team & 7));
    if !wd.prefer_buildings {
        w.grid.coarse.query_teams(x, y, r + 1024, enemies, |o| {
            if unit_target_ok(w, team, wi, o, x, y) {
                let d = dist2(x, y, w.units.x[o], w.units.y[o]);
                if d < best_d {
                    best_d = d;
                    best = o as u32;
                }
            }
        });
        if best != NONE {
            return w.unit_id(best as usize);
        }
    }
    if wd.mask & M_SURF != 0 {
        let mut bb = NONE;
        let mut bd = i64::MAX;
        w.grid.query_buildings_teams(x, y, r + 4 * TILE, enemies, |b| {
            if building_target_ok(w, team, wi, b, x, y) {
                let (cx, cy) = w.buildings[b].center();
                let mut d = dist2(x, y, cx, cy);
                if matches!(w.buildings[b].def().class, BClass::Wall | BClass::Pylon) {
                    d += 1 << 40;
                }
                if d < bd || (d == bd && (b as u32) < bb) {
                    bd = d;
                    bb = b as u32;
                }
            }
        });
        if bb != NONE {
            return w.building_ref(bb as usize);
        }
    }
    if wd.prefer_buildings {
        w.grid.coarse.query_teams(x, y, r + 1024, enemies, |o| {
            if unit_target_ok(w, team, wi, o, x, y) {
                let d = dist2(x, y, w.units.x[o], w.units.y[o]);
                if d < best_d {
                    best_d = d;
                    best = o as u32;
                }
            }
        });
        if best != NONE {
            return w.unit_id(best as usize);
        }
    }
    NONE
}

fn target_point(w: &World, t: u32) -> Option<(i32, i32)> {
    if t & GROUND_TARGET != 0 && t != NONE {
        return Some((((t & 0xfff) as i32) * TILE + TILE / 2, (((t >> 12) & 0xfff) as i32) * TILE + TILE / 2));
    }
    w.ref_pos(t)
}

/// Avance maximale de la visée anticipée (sous-unités) : au-delà, la prévision n'est plus fiable.
const LEAD_MAX: i32 = 8 * TILE;

/**
 * Point visé pour toucher l'unité `t` en mouvement avec un projectile de `per_tick` sous-unités par
 * tick tiré depuis (x, y) : sa position plus son déplacement du dernier tick multiplié par le temps
 * de vol (deux itérations : le temps de vol jusqu'au point prévu). Bâtiments et tir au sol : (tx, ty).
 */
fn lead_point(w: &World, t: u32, x: i32, y: i32, tx: i32, ty: i32, per_tick: i32) -> (i32, i32) {
    let Some(s) = w.unit(t) else { return (tx, ty) };
    let (vx, vy) = (w.units.x[s] - w.units.px[s], w.units.y[s] - w.units.py[s]);
    if vx == 0 && vy == 0 {
        return (tx, ty);
    }
    let (mut ax, mut ay) = (tx, ty);
    for _ in 0..2 {
        let ticks = dist(x, y, ax, ay) / per_tick.max(1);
        let lx = (vx * ticks).clamp(-LEAD_MAX, LEAD_MAX);
        let ly = (vy * ticks).clamp(-LEAD_MAX, LEAD_MAX);
        ax = tx + lx;
        ay = ty + ly;
    }
    let mx = w.map.w * TILE - 1;
    let my = w.map.h * TILE - 1;
    (ax.clamp(0, mx), ay.clamp(0, my))
}

/// Tire avec l'arme `wi` depuis (x, y) sur la cible `t`.
fn fire(w: &mut World, owner: u8, wi: usize, x: i32, y: i32, t: u32, dmg_mult: i32, src: u32) {
    let Some((tx, ty)) = target_point(w, t) else { return };
    let wd = &WEAPONS[wi];
    let dmg = wd.dmg * dmg_mult / 100;
    if wd.sustain > 0 {
        // rayon prolongé : il dure `sustain` ticks et touche à chaque tick (voir beam_tick)
        w.projectiles.push(Projectile {
            weapon: wi as u8,
            owner,
            x0: x,
            y0: y,
            tx,
            ty,
            target: t,
            t: 0,
            total: wd.sustain,
            dmg,
            aoe: wd.aoe,
            special: SPECIAL_BEAM,
            src,
        });
        w.ev(EV_FIRE, wi as i32, x, y, owner as i32);
        return;
    }
    if wd.speed == 0 {
        // rayon instantané
        w.ev(EV_BEAM, x, y, tx, ty);
        let team = w.team_of(owner);
        if shield_absorb(w, team, x, y, tx, ty, dmg) {
            return;
        }
        w.shooter = src;
        if wd.aoe > 0 {
            area_damage(w, tx, ty, wd.aoe, dmg, owner, wd.mask, false);
        } else {
            hit_ref(w, t, dmg, owner, wd.stun);
        }
        w.shooter = NONE;
        return;
    }
    let per_tick = (wd.speed * TILE / 20).max(1);
    let homing = wd.proj == crate::data::Proj::Missile || wd.proj == crate::data::Proj::Torpedo;
    // visée anticipée : un projectile non guidé vise l'endroit où sera une unité en mouvement à son arrivée
    let (tx, ty) = if homing { (tx, ty) } else { lead_point(w, t, x, y, tx, ty, per_tick) };
    for k in 0..wd.salvo.max(1) {
        let (mut ax, mut ay) = (tx, ty);
        if k > 0 {
            ax += w.rng.range(-96, 96);
            ay += w.rng.range(-96, 96);
        }
        let d = dist(x, y, ax, ay);
        let total = (d / per_tick).clamp(1, 600) as u16 + k as u16;
        w.projectiles.push(Projectile {
            weapon: wi as u8,
            owner,
            x0: x,
            y0: y,
            tx: ax,
            ty: ay,
            target: if homing || wd.aoe == 0 { t } else { NONE },
            t: 0,
            total,
            dmg,
            aoe: wd.aoe,
            special: 0,
            src,
        });
    }
    w.ev(EV_FIRE, wi as i32, x, y, owner as i32);
}

pub fn unit_weapons(w: &mut World, s: usize, forced: u32) {
    let kind = w.units.kind[s];
    let def = udef(kind);
    if def.weapons.is_empty() {
        return;
    }
    let owner = w.units.owner[s];
    let team = w.team_of(owner);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let p = &w.players[owner as usize];
    let upgraded = kind == U_COMMANDER && p.has_tech(T_CMD_CANNON);
    for i in 0..def.weapons.len().min(2) {
        let mut wi = def.weapons[i] as usize;
        if upgraded && i == 0 {
            wi = W_CMD_UP as usize;
        }
        let c = &mut w.units.cold[s];
        if c.cooldown[i] > 0 {
            c.cooldown[i] -= 1;
        }
        let cur = c.wtarget[i];
        let mut t = NONE;
        if forced != NONE && target_ok(w, team, wi, forced, x, y) {
            t = forced;
        } else if cur != NONE && !(w.tick + s as u32).is_multiple_of(10) && target_ok(w, team, wi, cur, x, y) {
            t = cur;
        } else if (w.tick + s as u32).is_multiple_of(5) || cur != NONE {
            t = find_target(w, team, wi, x, y);
        }
        w.units.cold[s].wtarget[i] = t;
        if t == NONE {
            continue;
        }
        if let Some((tx, ty)) = target_point(w, t) {
            let a = w.trig.atan2((ty - y) as i64, (tx - x) as i64);
            w.units.cold[s].turret = a;
        }
        if kind == U_HEAVY_ARTY && !w.units.cold[s].deployed {
            continue;
        }
        if w.units.cold[s].cooldown[i] == 0 {
            w.units.cold[s].cooldown[i] = WEAPONS[wi].cooldown;
            w.units.cold[s].flags |= UF_FIRING;
            // vétérance : +5 % de dégâts par niveau
            let mult = 100 + 5 * w.units.cold[s].lvl as i32;
            let me = w.unit_id(s);
            fire(w, owner, wi, x, y, t, mult, me);
        }
    }
}

pub fn building_weapon(w: &mut World, b: usize) {
    let wi = w.buildings[b].def().weapon;
    if wi < 0 {
        return;
    }
    let wi = wi as usize;
    let owner = w.buildings[b].owner;
    let team = w.team_of(owner);
    let (x, y) = w.buildings[b].center();
    if w.buildings[b].cooldown > 0 {
        w.buildings[b].cooldown -= 1;
    }
    let cur = w.buildings[b].target;
    let t = if cur != NONE && !(w.tick + b as u32).is_multiple_of(10) && target_ok(w, team, wi, cur, x, y) {
        cur
    } else if (w.tick + b as u32).is_multiple_of(5) || cur != NONE {
        find_target(w, team, wi, x, y)
    } else {
        NONE
    };
    w.buildings[b].target = t;
    w.buildings[b].working = t != NONE;
    if t == NONE {
        w.buildings[b].wake = w.tick + 5 - (w.tick + b as u32) % 5;
        return;
    }
    if let Some((tx, ty)) = target_point(w, t) {
        w.buildings[b].turret = w.trig.atan2((ty - y) as i64, (tx - x) as i64);
    }
    if w.buildings[b].cooldown == 0 {
        w.buildings[b].cooldown = WEAPONS[wi].cooldown;
        fire(w, owner, wi, x, y, t, 100, NONE);
    }
}

/// Boucliers actifs de ce tick.
pub fn collect_shields(w: &mut World) {
    w.shields.clear();
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.cold[s].carried_by != NONE {
            continue;
        }
        let d = udef(w.units.kind[s]);
        if d.shield_r > 0 && w.units.cold[s].shield > 0 && w.units.cold[s].shield_down == 0 {
            let id = w.unit_id(s);
            w.shields.push((w.units.x[s], w.units.y[s], d.shield_r * TILE, w.team_of(w.units.owner[s]), id));
        }
    }
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if bb.alive && bb.def().class == BClass::Shield && bb.complete() && bb.working && bb.enabled && bb.shield > 0 && bb.shield_down == 0 {
            let (cx, cy) = bb.center();
            let r = bb.def().shield_r * TILE;
            let team = w.team_of(bb.owner);
            let rf = w.building_ref(b);
            w.shields.push((cx, cy, r, team, rf));
        }
    }
}

/// Un bouclier ennemi entre la source et l'impact absorbe le coup.
fn shield_absorb(w: &mut World, team: u8, x0: i32, y0: i32, tx: i32, ty: i32, dmg: i32) -> bool {
    for i in 0..w.shields.len() {
        let (sx, sy, r, st, rf) = w.shields[i];
        if st == team {
            continue;
        }
        let r2 = (r as i64) * (r as i64);
        if dist2(sx, sy, tx, ty) <= r2 && dist2(sx, sy, x0, y0) > r2 {
            let down = if let Some(u) = w.unit(rf) {
                let c = &mut w.units.cold[u];
                c.shield -= dmg;
                if c.shield <= 0 {
                    c.shield = 0;
                    c.shield_down = 200;
                    true
                } else {
                    false
                }
            } else if let Some(b) = w.building(rf) {
                let bb = &mut w.buildings[b];
                bb.shield -= dmg;
                if bb.shield <= 0 {
                    bb.shield = 0;
                    bb.shield_down = 200;
                    true
                } else {
                    false
                }
            } else {
                false
            };
            if down {
                w.shields[i].2 = 0;
            }
            w.ev(EV_SHIELD_HIT, tx, ty, sx, sy);
            return true;
        }
    }
    false
}

pub fn damage_unit(w: &mut World, s: usize, dmg: i32, attacker: u8) {
    if !w.units.alive[s] || w.units.hp[s] <= 0 {
        return;
    }
    let mut dmg = dmg;
    if w.units.kind[s] == U_COMMANDER {
        let c = &mut w.units.cold[s];
        if c.shield > 0 && c.shield_down == 0 {
            let a = dmg.min(c.shield);
            c.shield -= a;
            dmg -= a;
            if c.shield == 0 {
                c.shield_down = 300;
            }
        }
    }
    w.units.hp[s] -= dmg;
    if dmg > 0 {
        let (o, x, y) = (w.units.owner[s], w.units.x[s], w.units.y[s]);
        w.note_attacked(o, attacker, x, y, w.units.kind[s] == U_COMMANDER);
    }
    if w.shooter != NONE {
        w.units.cold[s].last_hit = w.shooter;
    }
    if w.units.hp[s] <= 0 {
        w.dead_units.push(s as u32);
        if (attacker as usize) < w.players.len() {
            w.players[attacker as usize].kills += 1;
        }
    }
}

pub fn damage_building(w: &mut World, b: usize, dmg: i32, attacker: u8) {
    if !w.buildings[b].alive || w.buildings[b].hp <= 0 {
        return;
    }
    if dmg > 0 {
        let (cx, cy) = w.buildings[b].center();
        w.note_attacked(w.buildings[b].owner, attacker, cx, cy, false);
    }
    let bb = &mut w.buildings[b];
    bb.hp -= dmg;
    if bb.hp <= 0 {
        w.dead_buildings.push(b as u32);
    }
}

fn hit_ref(w: &mut World, t: u32, dmg: i32, owner: u8, stun: u16) {
    if let Some(u) = w.unit(t) {
        damage_unit(w, u, dmg, owner);
        if stun > 0 {
            w.units.cold[u].stun = w.units.cold[u].stun.max(stun);
        }
    } else if let Some(b) = w.building(t) {
        damage_building(w, b, dmg, owner);
        if stun > 0 {
            w.buildings[b].stun = w.buildings[b].stun.max(stun);
        }
    }
}

/// Dégâts de zone. `all` : touche aussi les alliés (explosions, missiles stratégiques).
pub fn area_damage(w: &mut World, x: i32, y: i32, r: i32, dmg: i32, owner: u8, mask: u8, all: bool) {
    let team = w.team_of(owner);
    let r = r.max(32);
    let r2 = (r as i64) * (r as i64);
    let mut hits: Vec<(usize, i32)> = Vec::new();
    {
        let units = &w.units;
        let players = &w.players;
        w.grid.fine.query(x, y, r + 320, |o| {
            if !units.alive[o] || units.cold[o].carried_by != NONE {
                return;
            }
            let ot = players[units.owner[o] as usize].team;
            if !all && ot == team {
                return;
            }
            let air = udef(units.kind[o]).layer == Layer::Air;
            if air && mask & M_AIR == 0 && !all {
                return;
            }
            if !air && mask & (M_SURF | M_SUB) == 0 {
                return;
            }
            let rr = r + udef(units.kind[o]).radius;
            let d2 = dist2(x, y, units.x[o], units.y[o]);
            if d2 <= (rr as i64) * (rr as i64) {
                let falloff = if all { (dmg as i64 * (2 * r2 - d2.min(r2)) / (2 * r2)) as i32 } else { dmg };
                hits.push((o, falloff));
            }
        });
    }
    for (o, d) in hits {
        damage_unit(w, o, d, owner);
    }
    if mask & M_SURF == 0 && !all {
        return;
    }
    let mut bh: Vec<(usize, i32)> = Vec::new();
    w.grid.query_buildings(x, y, r + 4 * TILE, |b| {
        let bb = &w.buildings[b];
        if !bb.alive || (!all && w.team_of(bb.owner) == team) {
            return;
        }
        let (bw, bhh) = bb.size();
        let nx = x.clamp(bb.x * TILE, (bb.x + bw) * TILE);
        let ny = y.clamp(bb.y * TILE, (bb.y + bhh) * TILE);
        let d2 = dist2(x, y, nx, ny);
        if d2 <= r2 {
            let falloff = if all { (dmg as i64 * (2 * r2 - d2.min(r2)) / (2 * r2)) as i32 } else { dmg };
            bh.push((b, falloff));
        }
    });
    // petits éléments : tapis et bras
    let rt = r / TILE + 1;
    let (cx, cy) = (x / TILE, y / TILE);
    for ty in (cy - rt).max(0)..=(cy + rt).min(w.map.h - 1) {
        for tx in (cx - rt).max(0)..=(cx + rt).min(w.map.w - 1) {
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let b = (o - 1) as usize;
            let bb = &w.buildings[b];
            if !matches!(bb.def().class, BClass::Belt | BClass::Inserter) || (!all && w.team_of(bb.owner) == team) {
                continue;
            }
            if dist2(x, y, tx * TILE + TILE / 2, ty * TILE + TILE / 2) <= r2 {
                bh.push((b, dmg / 2));
            }
        }
    }
    bh.sort_unstable();
    bh.dedup_by_key(|e| e.0);
    for (b, d) in bh {
        damage_building(w, b, d, owner);
    }
}

pub fn update_projectiles(w: &mut World) {
    let mut i = 0;
    while i < w.projectiles.len() {
        let p = w.projectiles[i];
        if p.special == 255 {
            w.projectiles.swap_remove(i);
            continue;
        }
        let mut p = p;
        if p.special == SPECIAL_BEAM {
            if beam_tick(w, &mut p) {
                w.projectiles[i] = p;
                i += 1;
            } else {
                w.projectiles.swap_remove(i);
            }
            continue;
        }
        p.t += 1;
        let homing = p.special == 0 && matches!(WEAPONS[p.weapon as usize].proj, Proj::Missile | Proj::Torpedo);
        if homing {
            if let Some((tx, ty)) = w.ref_pos(p.target) {
                p.tx = tx;
                p.ty = ty;
            }
        }
        if p.t < p.total {
            w.projectiles[i] = p;
            i += 1;
            continue;
        }
        w.projectiles.swap_remove(i);
        w.shooter = p.src;
        impact(w, &p);
        w.shooter = NONE;
    }
}

/// Un tick de rayon prolongé : il suit sa source et sa cible et inflige ses dégâts. Quand la cible
/// meurt ou sort de portée, le rayon balaie vers la cible la plus proche pour le reste de sa durée.
/// Faux quand il s'éteint : durée écoulée, source détruite ou paralysée, plus aucune cible.
fn beam_tick(w: &mut World, p: &mut Projectile) -> bool {
    p.t += 1;
    if p.t > p.total {
        return false;
    }
    if p.src != NONE {
        let Some(s) = w.unit(p.src) else { return false };
        if w.units.cold[s].stun > 0 {
            return false;
        }
        p.x0 = w.units.x[s];
        p.y0 = w.units.y[s];
    }
    let wd = &WEAPONS[p.weapon as usize];
    let team = w.team_of(p.owner);
    let reach = ((wd.range + 2) * TILE) as i64;
    let in_reach = |w: &World, t: u32| target_point(w, t).filter(|&(tx, ty)| dist2(p.x0, p.y0, tx, ty) <= reach * reach);
    let pos = match in_reach(w, p.target) {
        Some(q) => q,
        None => {
            // cible perdue : la suivante (pas pour un tir au sol ni pour un bâtiment sans unité porteuse)
            if p.src == NONE || (p.target & GROUND_TARGET != 0 && p.target != NONE) {
                return false;
            }
            let t = find_target(w, team, p.weapon as usize, p.x0, p.y0);
            let Some(q) = in_reach(w, t) else { return false };
            p.target = t;
            q
        }
    };
    p.tx = pos.0;
    p.ty = pos.1;
    if wd.mask & M_AIR == 0 && shield_absorb(w, team, p.x0, p.y0, p.tx, p.ty, p.dmg) {
        return true;
    }
    w.shooter = p.src;
    if p.aoe > 0 {
        area_damage(w, p.tx, p.ty, p.aoe, p.dmg, p.owner, wd.mask, false);
    } else {
        hit_ref(w, p.target, p.dmg, p.owner, wd.stun);
    }
    w.shooter = NONE;
    true
}

fn impact(w: &mut World, p: &Projectile) {
    let team = w.team_of(p.owner);
    match p.special {
        1 => {
            w.ev(EV_EXPLOSION, p.tx, p.ty, 25 * TILE, 3);
            area_damage(w, p.tx, p.ty, 25 * TILE, 20000, p.owner, M_SURF | M_AIR | M_SUB, true);
            return;
        }
        2 => {
            w.ev(EV_EXPLOSION, p.tx, p.ty, 6 * TILE, 2);
            area_damage(w, p.tx, p.ty, 6 * TILE, 6000, p.owner, M_SURF, true);
            return;
        }
        _ => {}
    }
    let wd = &WEAPONS[p.weapon as usize];
    if wd.mask & M_AIR == 0 && shield_absorb(w, team, p.x0, p.y0, p.tx, p.ty, p.dmg) {
        return;
    }
    let size = if p.aoe > 0 { p.aoe } else { 64 };
    w.ev(EV_EXPLOSION, p.tx, p.ty, size, if p.aoe > 600 { 1 } else { 0 });
    if p.aoe > 0 {
        area_damage(w, p.tx, p.ty, p.aoe, p.dmg, p.owner, wd.mask, false);
        if wd.stun > 0 {
            // étourdit tout dans la zone
            let r2 = (p.aoe as i64).pow(2);
            let mut stun_u = Vec::new();
            let units = &w.units;
            w.grid.fine.query(p.tx, p.ty, p.aoe + 320, |o| {
                if units.alive[o] && dist2(p.tx, p.ty, units.x[o], units.y[o]) <= r2 {
                    stun_u.push(o);
                }
            });
            for o in stun_u {
                if w.team_of(w.units.owner[o]) != team {
                    w.units.cold[o].stun = w.units.cold[o].stun.max(wd.stun);
                }
            }
            let mut stun_b = Vec::new();
            w.grid.query_buildings(p.tx, p.ty, p.aoe, |b| stun_b.push(b));
            for b in stun_b {
                if w.buildings[b].alive && w.team_of(w.buildings[b].owner) != team {
                    w.buildings[b].stun = w.buildings[b].stun.max(wd.stun);
                }
            }
        }
        return;
    }
    // coup direct : la cible doit encore être là
    if let Some(u) = w.unit(p.target) {
        let r = udef(w.units.kind[u]).radius + 96;
        if dist2(w.units.x[u], w.units.y[u], p.tx, p.ty) <= (r as i64) * (r as i64) {
            damage_unit(w, u, p.dmg, p.owner);
            if wd.stun > 0 {
                w.units.cold[u].stun = w.units.cold[u].stun.max(wd.stun);
            }
        }
    } else if let Some(b) = w.building(p.target) {
        damage_building(w, b, p.dmg, p.owner);
    }
}

/// Défense antimissile : abat les missiles stratégiques qui visent sa zone.
pub fn antimissile(w: &mut World, b: usize) {
    if w.buildings[b].ammo == 0 {
        return;
    }
    let (cx, cy) = w.buildings[b].center();
    let team = w.team_of(w.buildings[b].owner);
    for i in 0..w.projectiles.len() {
        let p = w.projectiles[i];
        if p.special == 1 && w.team_of(p.owner) != team && p.t * 2 >= p.total && dist2(cx, cy, p.tx, p.ty) <= (45 * TILE as i64).pow(2) {
            w.projectiles[i].special = 255;
            w.buildings[b].ammo -= 1;
            let px = p.x0 + (p.tx - p.x0) * p.t as i32 / p.total.max(1) as i32;
            let py = p.y0 + (p.ty - p.y0) * p.t as i32 / p.total.max(1) as i32;
            w.ev(EV_INTERCEPT, cx, cy, px, py);
            return;
        }
    }
}

/// Supprime les unités et bâtiments détruits ; gère les explosions et l'élimination.
pub fn cleanup_dead(w: &mut World) {
    let mut guard = 0;
    loop {
        guard += 1;
        let mut du = std::mem::take(&mut w.dead_units);
        let mut db = std::mem::take(&mut w.dead_buildings);
        if (du.is_empty() && db.is_empty()) || guard > 50 {
            break;
        }
        du.sort_unstable();
        du.dedup();
        db.sort_unstable();
        db.dedup();
        for s in du {
            let s = s as usize;
            if !w.units.alive[s] {
                continue;
            }
            kill_unit(w, s);
        }
        for b in db {
            let b = b as usize;
            if !w.buildings[b].alive {
                continue;
            }
            let (cx, cy) = w.buildings[b].center();
            let kind = w.buildings[b].kind;
            let owner = w.buildings[b].owner;
            let (bw, bh) = w.buildings[b].size();
            w.ev(EV_BUILDING_DIED, cx, cy, kind as i32, owner as i32);
            w.ev(EV_EXPLOSION, cx, cy, bw.max(bh) * TILE / 2, 0);
            // chantier rendu au joueur à moitié ? non : perdu
            buildings::remove_building(w, b, true);
            if kind == B_CRYSTAL_REACTOR {
                w.ev(EV_EXPLOSION, cx, cy, 15 * TILE, 3);
                area_damage(w, cx, cy, 15 * TILE, 8000, owner, M_SURF | M_AIR, true);
            }
        }
    }
    check_victory(w);
}

/// Expérience : l'unité qui a porté le dernier coup gagne les points de vie de sa victime ;
/// un niveau tous les deux fois ses propres points de vie détruits (5 niveaux au plus).
fn credit_kill(w: &mut World, victim: usize) {
    let Some(k) = w.unit(w.units.cold[victim].last_hit) else { return };
    if w.team_of(w.units.owner[k]) == w.team_of(w.units.owner[victim]) {
        return;
    }
    let gain = udef(w.units.kind[victim]).hp.max(1) as u32;
    let own = udef(w.units.kind[k]).hp.max(1) as u32;
    let c = &mut w.units.cold[k];
    c.xp = c.xp.saturating_add(gain);
    let lvl = ((c.xp / (2 * own)) as u8).min(MAX_LVL);
    if lvl > c.lvl {
        c.lvl = lvl;
        // montée de niveau : points de vie maximum relevés et soin partiel
        let max = w.max_hp(k);
        w.units.hp[k] = (w.units.hp[k] + max / 4).min(max);
        let (x, y) = (w.units.x[k], w.units.y[k]);
        w.ev(EV_PROMOTED, x, y, lvl as i32, w.units.owner[k] as i32);
    }
}

fn kill_unit(w: &mut World, s: usize) {
    credit_kill(w, s);
    let kind = w.units.kind[s];
    let owner = w.units.owner[s];
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let def = udef(kind);
    w.ev(EV_UNIT_DIED, x, y, kind as i32, owner as i32);
    w.ev(EV_EXPLOSION, x, y, def.radius * 2, if def.tier == 6 { 2 } else { 0 });
    // passagers
    let cargo = std::mem::take(&mut w.units.cold[s].cargo);
    for c in cargo {
        if let Some(cs) = w.unit(c) {
            w.units.cold[cs].carried_by = NONE;
            w.units.hp[cs] = 0;
            w.dead_units.push(cs as u32);
        }
    }
    let parent = w.units.cold[s].parent;
    if let Some(p) = w.unit(parent) {
        w.units.cold[p].children = w.units.cold[p].children.saturating_sub(1);
    }
    crate::units::clear_orders(w, s);
    w.units.alive[s] = false;
    w.units.free.push(s as u32);
    w.players[owner as usize].unit_count = w.players[owner as usize].unit_count.saturating_sub(1);
    w.players[owner as usize].losses += 1;
    if def.layer != Layer::Air || def.tier == 6 {
        let rot = w.units.facing[s];
        w.spawn_wreck(x, y, def.cost, (def.radius / TILE + 1) as u8, kind + 1, rot);
    }
    if kind == U_COMMANDER {
        w.ev(EV_EXPLOSION, x, y, 12 * TILE, 3);
        area_damage(w, x, y, 12 * TILE, 6000, owner, M_SURF, true);
        eliminate(w, owner);
    }
}

pub fn eliminate(w: &mut World, p: u8) {
    if !w.players[p as usize].alive {
        return;
    }
    w.players[p as usize].alive = false;
    w.ev(EV_ELIMINATED, p as i32, 0, 0, 0);
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && w.units.owner[s] == p && w.units.hp[s] > 0 {
            w.units.hp[s] = 0;
            w.dead_units.push(s as u32);
        }
    }
    for b in 0..w.buildings.len() {
        if w.buildings[b].alive && w.buildings[b].owner == p && w.buildings[b].hp > 0 {
            w.buildings[b].hp = 0;
            w.dead_buildings.push(b as u32);
        }
    }
}

fn check_victory(w: &mut World) {
    if w.winner != -1 {
        return;
    }
    let mut teams: Vec<u8> = w.players.iter().filter(|p| p.alive).map(|p| p.team).collect();
    teams.sort_unstable();
    teams.dedup();
    let distinct_start = {
        let mut t: Vec<u8> = w.players.iter().map(|p| p.team).collect();
        t.sort_unstable();
        t.dedup();
        t.len()
    };
    if distinct_start < 2 {
        // partie d'entraînement : se termine si le joueur meurt
        if teams.is_empty() {
            w.winner = -2;
            w.ev(EV_GAME_OVER, -2, 0, 0, 0);
        }
        return;
    }
    if teams.len() <= 1 {
        w.winner = teams.first().map(|&t| t as i32).unwrap_or(-2);
        let wv = w.winner;
        w.ev(EV_GAME_OVER, wv, 0, 0, 0);
    }
}

/// Vision, radar et détection par équipe, sur une grille de 4x4 cases.
pub fn update_visibility(w: &mut World) {
    let vw = w.vis_w;
    for v in w.vis.iter_mut() {
        for c in v.iter_mut() {
            *c &= 8;
        }
    }
    let stamp = |vis: &mut Vec<u8>, x: i32, y: i32, r_tiles: i32, bit: u8| {
        if r_tiles <= 0 {
            return;
        }
        let cx = x / (4 * TILE);
        let cy = y / (4 * TILE);
        let rc = (r_tiles + 3) / 4;
        let r2 = (rc * rc + rc) as i64;
        for dy in -rc..=rc {
            let yy = cy + dy;
            if yy < 0 || yy >= vw {
                continue;
            }
            for dx in -rc..=rc {
                let xx = cx + dx;
                if xx < 0 || xx >= vw || (dx * dx + dy * dy) as i64 > r2 {
                    continue;
                }
                vis[(yy * vw + xx) as usize] |= bit;
            }
        }
    };
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.cold[s].carried_by != NONE {
            continue;
        }
        let team = w.players[w.units.owner[s] as usize].team as usize;
        if team >= w.vis.len() {
            continue;
        }
        let k = w.units.kind[s];
        let d = udef(k);
        let (x, y) = (w.units.x[s], w.units.y[s]);
        let vis = &mut w.vis[team];
        stamp(vis, x, y, d.vision, 1 | 8);
        let deployed_sonde = k == U_SONDE && w.units.cold[s].deployed;
        if d.radar > 0 && (k != U_SONDE || deployed_sonde) {
            stamp(vis, x, y, d.radar, 2);
        }
        if deployed_sonde {
            stamp(vis, x, y, 25, 4);
        } else if d.layer == Layer::Naval || d.layer == Layer::Sub {
            stamp(vis, x, y, if d.radius > 400 { 30 } else { 18 }, 4);
        }
    }
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if !bb.alive {
            continue;
        }
        let def = bb.def();
        if def.vision == 0 && def.radar == 0 {
            continue;
        }
        let team = w.players[bb.owner as usize].team as usize;
        let (x, y) = bb.center();
        let vis = &mut w.vis[team];
        stamp(vis, x, y, def.vision, 1 | 8);
        if def.radar > 0 && bb.complete() && bb.working {
            stamp(vis, x, y, def.radar, 2);
        }
    }
}
