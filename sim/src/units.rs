//! Unités : exécution des ordres, déplacement, construction, recyclage, transport, capacités spéciales.

use crate::buildings::{self, dims};
use crate::data::*;
use crate::fixed::{angle_diff, dist, dist2, turn_towards, TILE};
use crate::flow::{self, AT_GOAL, NO_DIR};
use crate::map::{P_HOVER, P_LAND, P_NAVAL};
use crate::world::*;

/// Distance (sous-unités) à laquelle le commandant récupère les objets d'un tapis.
const COLLECT_RANGE: i32 = 3 * TILE;

#[inline]
pub fn move_class(layer: Layer) -> Option<u8> {
    match layer {
        Layer::Land => Some(0),
        Layer::Hover => Some(1),
        Layer::Naval | Layer::Sub => Some(2),
        Layer::Air => None,
    }
}
#[inline]
pub fn pass_mask(layer: Layer) -> u8 {
    match layer {
        Layer::Land => P_LAND,
        Layer::Hover => P_HOVER,
        Layer::Naval | Layer::Sub => P_NAVAL,
        Layer::Air => 0xff,
    }
}
/// Avion à voilure fixe : avance toujours, tourne en rond autour de sa cible.
#[inline]
pub fn fixed_wing(kind: u16) -> bool {
    let d = udef(kind);
    d.layer == Layer::Air && !matches!(kind, U_TRANSPORT | U_MOTHERSHIP | U_HYPER | U_DRAGON | U_STAR_CRUISER) && d.key != "gunship"
}
/// Unité à pattes (robots, marcheurs) : elle change de direction en marchant, sans pivoter sur place,
/// et le haut de son corps vise sa prochaine cible pendant la marche.
#[inline]
pub fn legged(kind: u16) -> bool {
    matches!(
        udef(kind).key,
        "commander" | "line_robot" | "assault_walker" | "siege_walker" | "shock_robot" | "heavy_artillery" | "spider" | "colossus" | "fortress"
    )
}

#[inline]
fn turn_rate(kind: u16) -> i32 {
    let d = udef(kind);
    if fixed_wing(kind) {
        700
    } else if legged(kind) {
        // des jambes tournent vite : un demi-tour en 8 ticks
        4096
    } else if d.radius > 500 {
        500
    } else if d.radius > 280 {
        900
    } else {
        2000
    }
}

pub fn build_range(kind: u16, dir: u8) -> i32 {
    let (bw, bh) = dims(kind, dir);
    (6 + bw.max(bh) / 2) * TILE
}

/// Libère le but de déplacement de l'unité.
pub fn clear_goal(w: &mut World, s: usize) {
    let g = w.units.cold[s].goal;
    if g != 0 {
        flow::release_goal(w, g);
        w.units.cold[s].goal = 0;
    }
}

pub fn pop_order(w: &mut World, s: usize) {
    clear_goal(w, s);
    let c = &mut w.units.cold[s];
    if !c.orders.is_empty() {
        c.orders.remove(0);
    }
    c.stuck = 0;
    c.noprog = 0;
    c.best_dist = i32::MAX;
    c.timer = 0;
    c.work = 0;
}

pub fn clear_orders(w: &mut World, s: usize) {
    clear_goal(w, s);
    let c = &mut w.units.cold[s];
    c.orders.clear();
    c.stuck = 0;
    c.noprog = 0;
    c.best_dist = i32::MAX;
    c.timer = 0;
    c.work = 0;
}

/// Déplace l'unité vers (tx, ty). Renvoie vrai à l'arrivée (à moins de `stop`).
pub fn steer(w: &mut World, s: usize, tx: i32, ty: i32, gx: i32, gy: i32, stop: i32) -> bool {
    let kind = w.units.kind[s];
    let def = udef(kind);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let d = dist(x, y, tx, ty);
    if d <= stop && !fixed_wing(kind) {
        return true;
    }
    if w.units.cold[s].deployed {
        // une unité déployée se replie avant de bouger
        w.units.cold[s].deployed = false;
        w.units.cold[s].timer = 0;
    }
    let mut heading = w.trig.atan2((ty - y) as i64, (tx - x) as i64);
    // l'unité suit un champ de flux valide (chemin connu, éventuellement un long détour)
    let mut following = false;
    if legged(kind) && w.units.cold[s].wtarget[0] == NONE {
        // le haut du corps se tourne vers la destination pendant que les jambes suivent le chemin
        // (en combat, la visée de l'arme prend le relais : voir combat::unit_weapons)
        w.units.cold[s].turret = w.trig.atan2((gy - y) as i64, (gx - x) as i64);
    }
    if let Some(class) = move_class(def.layer) {
        if d > 5 * TILE {
            if w.units.cold[s].goal == 0 {
                let key = flow::acquire_goal(w, class, gx / TILE, gy / TILE);
                w.units.cold[s].goal = key;
            }
            let key = w.units.cold[s].goal;
            let fd = flow::flow_dir(w, key, x / TILE, y / TILE);
            if fd != NO_DIR && fd != AT_GOAL {
                heading = (fd as u16).wrapping_mul(8192);
                following = true;
            }
        }
    }
    let speed = unit_speed(kind);
    let f = w.units.facing[s];
    let nf = turn_towards(f, heading, turn_rate(kind));
    w.units.facing[s] = nf;
    let diff = angle_diff(heading, nf).abs();
    let mut sp = if fixed_wing(kind) {
        speed
    } else if legged(kind) {
        // une unité à pattes ne s'arrête jamais pour tourner : elle ralentit dans les virages serrés
        if diff < 6000 {
            speed
        } else {
            speed / 2
        }
    } else if diff < 6000 {
        speed
    } else if diff < 14000 {
        speed / 2
    } else {
        0
    };
    if !fixed_wing(kind) && d < sp {
        sp = d;
    }
    if sp > 0 {
        let vx = (w.trig.cos(nf) as i64 * sp as i64 / 16384) as i32;
        let vy = (w.trig.sin(nf) as i64 * sp as i64 / 16384) as i32;
        try_move(w, s, vx, vy);
    }
    // détection de blocage : `stuck` compte les ticks sans mouvement réel,
    // `noprog` les ticks sans rapprochement du but (foule autour du point d'arrivée)
    let moved = (w.units.x[s] - x).abs() + (w.units.y[s] - y).abs();
    let nd = dist(w.units.x[s], w.units.y[s], tx, ty);
    let c = &mut w.units.cold[s];
    if moved * 4 < speed {
        c.stuck = c.stuck.saturating_add(1);
    } else {
        c.stuck = c.stuck.saturating_sub(2);
    }
    if nd + 16 < c.best_dist {
        c.best_dist = nd;
        c.noprog = 0;
    } else if following && moved * 4 >= speed && nd > stop + 6 * TILE {
        // détour le long du champ de flux (contournement d'un lac, d'une falaise) : l'unité avance,
        // même si elle s'éloigne du but à vol d'oiseau ; ce n'est pas une absence de progrès
    } else {
        c.noprog = c.noprog.saturating_add(1);
    }
    if fixed_wing(kind) {
        return nd <= stop.max(2 * TILE);
    }
    // arrivé si on piétine près du but (groupes), ou si bloqué longtemps
    (c.noprog > 20 && nd < stop + 6 * TILE) || c.stuck > 120 || c.noprog > 1200
}

fn try_move(w: &mut World, s: usize, vx: i32, vy: i32) {
    let layer = udef(w.units.kind[s]).layer;
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let mx = w.map.w * TILE - 1;
    let my = w.map.h * TILE - 1;
    let (nx, ny) = ((x + vx).clamp(0, mx), (y + vy).clamp(0, my));
    if layer == Layer::Air {
        w.units.x[s] = nx;
        w.units.y[s] = ny;
        return;
    }
    let m = pass_mask(layer);
    let cur_ok = w.map.passable(x / TILE, y / TILE, m);
    if w.map.passable(nx / TILE, ny / TILE, m) || !cur_ok {
        w.units.x[s] = nx;
        w.units.y[s] = ny;
    } else if w.map.passable(nx / TILE, y / TILE, m) {
        w.units.x[s] = nx;
    } else if w.map.passable(x / TILE, ny / TILE, m) {
        w.units.y[s] = ny;
    }
}

/// Puissance de construction effective.
fn build_power(w: &World, s: usize) -> u64 {
    let bp = udef(w.units.kind[s]).build_power as u64;
    bp * w.players[w.units.owner[s] as usize].build_mult as u64 / 100
}

/// Fait progresser la construction du bâtiment `b`. Renvoie faux si le chantier est terminé.
pub fn construct(w: &mut World, s: usize, b: usize) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive {
        return false;
    }
    let def = bb.def();
    let owner = bb.owner as usize;
    if bb.complete() {
        if bb.hp < def.hp {
            // réparation
            let bp = build_power(w, s) as i32;
            let bb = &mut w.buildings[b];
            bb.hp = (bb.hp + (def.hp / (def.build as i32 * 4).max(4)).max(1) * bp / 10).min(def.hp);
            w.units.cold[s].flags |= UF_WORKING;
            return true;
        }
        return false;
    }
    let work = def.build as u64 * 20 * 10;
    let delta = (build_power(w, s) * BUILD_FULL as u64 / work).max(1) as u32;
    let p2 = (bb.build + delta).min(BUILD_FULL);
    let mut need = [0i32; 4];
    for (k, &(it, n)) in def.cost.iter().enumerate() {
        let total = (n as u64 * p2 as u64).div_ceil(BUILD_FULL as u64) as i32;
        need[k] = total - bb.paid[k] as i32;
        // le stock du joueur d'abord, puis le stock commun de son équipe (entrepôts)
        if w.avail(owner, it) < need[k] {
            w.buildings[b].stalled = true;
            return true;
        }
    }
    for (k, &(it, _)) in def.cost.iter().enumerate() {
        w.pay(owner, it, need[k]);
        w.players[owner].consumed[it as usize] += need[k] as u32;
        w.buildings[b].paid[k] += need[k] as u16;
    }
    let bb = &mut w.buildings[b];
    bb.stalled = false;
    bb.build = p2;
    bb.hp = (bb.hp + (def.hp as i64 * delta as i64 / BUILD_FULL as i64) as i32).min(def.hp);
    w.units.cold[s].flags |= UF_WORKING;
    if p2 >= BUILD_FULL {
        buildings::complete_building(w, b);
        return false;
    }
    true
}

fn reclaim_wreck(w: &mut World, s: usize, wk: usize) -> bool {
    let bp = build_power(w, s) as i32;
    let owner = w.units.owner[s] as usize;
    let amount = (bp / 5).max(1);
    let wr = &mut w.wrecks[wk];
    let take_iron = amount.min(wr.iron);
    wr.iron -= take_iron;
    let take_steel = (amount - take_iron).min(wr.steel);
    wr.steel -= take_steel;
    let empty = wr.iron <= 0 && wr.steel <= 0;
    w.players[owner].stock[IRON_PLATE as usize] += take_iron;
    w.players[owner].stock[STEEL as usize] += take_steel;
    w.units.cold[s].flags |= UF_WORKING;
    if empty {
        w.wrecks[wk].alive = false;
        w.wfree.push(wk as u32);
        return false;
    }
    true
}

fn deconstruct(w: &mut World, s: usize, b: usize) -> bool {
    let def = w.buildings[b].def();
    let owner = w.buildings[b].owner as usize;
    let work = def.build as u64 * 20 * 10;
    let delta = (build_power(w, s) * 2 * BUILD_FULL as u64 / work).max(1) as u32;
    let bb = &mut w.buildings[b];
    let p2 = bb.build.saturating_sub(delta);
    for (k, &(it, n)) in def.cost.iter().enumerate() {
        let total = (n as u64 * p2 as u64).div_ceil(BUILD_FULL as u64) as u16;
        let refund = bb.paid[k].saturating_sub(total);
        bb.paid[k] -= refund;
        w.players[owner].stock[it as usize] += refund as i32;
    }
    bb.build = p2;
    w.units.cold[s].flags |= UF_WORKING;
    if p2 == 0 {
        // rendre aussi le contenu
        let inv = bb.inv;
        let out = bb.out;
        let _ = (inv, out);
        buildings::remove_building(w, b, false);
        return false;
    }
    if bb.build < BUILD_FULL && bb.def().class == BClass::Belt && bb.line != NONE {
        let (x, y) = (bb.x, bb.y);
        crate::belts::rebuild_around(w, &[(x, y)]);
    }
    true
}

#[cfg(test)]
thread_local! {
    pub static PROF: std::cell::RefCell<[f64; 4]> = const { std::cell::RefCell::new([0.0; 4]) };
}
#[cfg(test)]
#[allow(clippy::disallowed_types, clippy::float_arithmetic)]
fn prof_add(i: usize, t0: std::time::Instant) {
    PROF.with(|p| p.borrow_mut()[i] += t0.elapsed().as_secs_f64() * 1000.0);
}
#[cfg(test)]
#[allow(clippy::disallowed_types)]
fn prof_now() -> std::time::Instant {
    std::time::Instant::now()
}
#[cfg(not(test))]
#[inline(always)]
fn prof_now() -> u8 {
    0
}
#[cfg(not(test))]
#[inline(always)]
fn prof_add(_i: usize, _t: u8) {}

pub fn update_units(w: &mut World) {
    let t_sep = prof_now();
    let n = w.units.alive.len();
    // poussées de séparation (calculées puis appliquées)
    let mut push: Vec<(i32, i32)> = vec![(0, 0); n];
    for s in 0..n {
        if !w.units.alive[s] || w.units.cold[s].carried_by != NONE {
            continue;
        }
        let k = w.units.kind[s];
        // séparation un tick sur deux (poussée doublée), jamais pour les avions à voilure fixe
        if fixed_wing(k) || (w.tick + s as u32) & 1 == 1 {
            continue;
        }
        let def = udef(k);
        let air = def.layer == Layer::Air;
        let (x, y, r) = (w.units.x[s], w.units.y[s], def.radius);
        let moving = !w.units.cold[s].orders.is_empty();
        let big = r > 500;
        let mut px = 0i64;
        let mut py = 0i64;
        let units = &w.units;
        w.grid.fine.query(x, y, r + 200, |o| {
            if o == s {
                return;
            }
            let od = udef(units.kind[o]);
            if (od.layer == Layer::Air) != air {
                return;
            }
            let rr = r + od.radius;
            let dx = (x - units.x[o]) as i64;
            let dy = (y - units.y[o]) as i64;
            let d2 = dx * dx + dy * dy;
            if d2 >= (rr as i64) * (rr as i64) {
                return;
            }
            if od.radius > 500 && !big {
                return; // poussé par le gros
            }
            let d = crate::fixed::isqrt(d2 as u64) as i64;
            let overlap = rr as i64 - d;
            let (ux, uy) = if d == 0 { (if s < o { -1 } else { 1 }, 0) } else { (dx * 64 / d, dy * 64 / d) };
            let f = if moving { 6 } else { 8 };
            px += ux * overlap * f / (64 * 8);
            py += uy * overlap * f / (64 * 8);
        });
        push[s].0 += px as i32;
        push[s].1 += py as i32;
        if big {
            let units = &w.units;
            let mut extra: Vec<(usize, i32, i32)> = Vec::new();
            w.grid.fine.query(x, y, r + 320, |o| {
                if o == s || (udef(units.kind[o]).layer == Layer::Air) != air || udef(units.kind[o]).radius > 500 {
                    return;
                }
                let rr = r + udef(units.kind[o]).radius;
                let dx = (units.x[o] - x) as i64;
                let dy = (units.y[o] - y) as i64;
                let d2 = dx * dx + dy * dy;
                if d2 < (rr as i64) * (rr as i64) {
                    let d = crate::fixed::isqrt(d2 as u64).max(1) as i64;
                    let overlap = rr as i64 - d;
                    extra.push((o, (dx * overlap / d / 2) as i32, (dy * overlap / d / 2) as i32));
                }
            });
            for (o, ex, ey) in extra {
                push[o].0 += ex;
                push[o].1 += ey;
            }
        }
    }
    prof_add(0, t_sep);
    for s in 0..n {
        if !w.units.alive[s] {
            continue;
        }
        w.units.px[s] = w.units.x[s];
        w.units.py[s] = w.units.y[s];
        let carrier = w.units.cold[s].carried_by;
        if carrier != NONE {
            if let Some(c) = w.unit(carrier) {
                w.units.x[s] = w.units.x[c];
                w.units.y[s] = w.units.y[c];
                w.units.px[s] = w.units.px[c];
                w.units.py[s] = w.units.py[c];
            }
            continue;
        }
        w.units.cold[s].flags = 0;
        if w.units.cold[s].stun > 0 {
            w.units.cold[s].stun -= 1;
            continue;
        }
        let kind = w.units.kind[s];
        let def = udef(kind);
        // boucliers
        {
            let c = &mut w.units.cold[s];
            let max = if kind == U_COMMANDER { if w.players[w.units.owner[s] as usize].has_tech(T_CMD_SHIELD) { 4000 } else { 0 } } else { def.shield_hp };
            if max > 0 {
                if c.shield_down > 0 {
                    c.shield_down -= 1;
                    if c.shield_down == 0 {
                        c.shield = max / 4;
                    }
                } else {
                    c.shield = (c.shield + (max / 600).max(1)).min(max);
                }
            }
        }
        let t_ord = prof_now();
        let forced = run_order(w, s);
        prof_add(1, t_ord);
        let t_w = prof_now();
        crate::combat::unit_weapons(w, s, forced);
        prof_add(2, t_w);
        special(w, s);
        // séparation
        let (dx, dy) = push[s];
        if dx != 0 || dy != 0 {
            let dx = dx.clamp(-60, 60);
            let dy = dy.clamp(-60, 60);
            try_move(w, s, dx, dy);
        }
        // sortir d'une case bloquée (bâtiment posé dessus)
        if def.layer != Layer::Air {
            let m = pass_mask(def.layer);
            let (x, y) = (w.units.x[s], w.units.y[s]);
            if !w.map.passable(x / TILE, y / TILE, m) {
                let (fx, fy) = buildings::free_spot_near(w, x, y, m);
                let ddx = (fx - x).clamp(-64, 64);
                let ddy = (fy - y).clamp(-64, 64);
                w.units.x[s] = x + ddx;
                w.units.y[s] = y + ddy;
            }
            gate_check(w, s);
        }
    }
}

/// Exécute l'ordre courant. Renvoie la cible imposée aux armes (ou NONE).
fn run_order(w: &mut World, s: usize) -> u32 {
    let Some(&o) = w.units.cold[s].orders.first() else {
        idle(w, s);
        return NONE;
    };
    let kind = w.units.kind[s];
    let def = udef(kind);
    let owner = w.units.owner[s];
    match o {
        Order::Move { x, y, gx, gy, attack } => {
            if attack && has_target_in_range(w, s) && !fixed_wing(kind) {
                return NONE;
            }
            let stop = def.radius + TILE / 2;
            if steer(w, s, x, y, gx, gy, stop) {
                pop_order(w, s);
            }
            NONE
        }
        Order::Patrol { x, y, ox, oy } => {
            if has_target_in_range(w, s) && !fixed_wing(kind) {
                return NONE;
            }
            if steer(w, s, x, y, x, y, def.radius + TILE) {
                clear_goal(w, s);
                let c = &mut w.units.cold[s];
                c.orders[0] = Order::Patrol { x: ox, y: oy, ox: x, oy: y };
                c.stuck = 0;
                c.best_dist = i32::MAX;
            }
            NONE
        }
        Order::Attack { target } => {
            let Some((tx, ty)) = w.ref_pos(target) else {
                pop_order(w, s);
                return NONE;
            };
            if w.wreck(target).is_some() {
                pop_order(w, s);
                return NONE;
            }
            let range = max_range(kind) * TILE;
            let d = dist(w.units.x[s], w.units.y[s], tx, ty);
            if fixed_wing(kind) {
                steer(w, s, tx, ty, tx, ty, 0);
            } else if d > range * 9 / 10 {
                // relancer le but si la cible s'est éloignée
                let g = w.units.cold[s].goal;
                if g != 0 {
                    let gt = (g & 0xffff_ffff) as i32;
                    let (gx, gy) = (gt % w.map.w, gt / w.map.w);
                    if (gx - tx / TILE).abs() + (gy - ty / TILE).abs() > 6 {
                        clear_goal(w, s);
                    }
                }
                steer(w, s, tx, ty, tx, ty, range * 8 / 10);
                w.units.cold[s].stuck = 0;
            }
            target
        }
        Order::AttackGround { x, y } => {
            let range = max_range(kind) * TILE;
            let d = dist(w.units.x[s], w.units.y[s], x, y);
            if fixed_wing(kind) {
                steer(w, s, x, y, x, y, 0);
            } else if d > range * 9 / 10 {
                steer(w, s, x, y, x, y, range * 8 / 10);
                w.units.cold[s].stuck = 0;
            }
            // cible au sol : encodée comme case
            0x8000_0000 | ((y / TILE) as u32) << 12 | (x / TILE) as u32
        }
        Order::Build { kind: bk, x, y, dir, bid } => {
            if def.build_power == 0 {
                pop_order(w, s);
                return NONE;
            }
            if let Some(b) = w.building(bid) {
                if !construct(w, s, b) {
                    pop_order(w, s);
                }
                return NONE;
            }
            if bid != 0 && bid != NONE {
                // chantier détruit
                pop_order(w, s);
                return NONE;
            }
            let (bw, bh) = dims(bk, dir);
            let cx = x * TILE + bw * TILE / 2;
            let cy = y * TILE + bh * TILE / 2;
            let range = build_range(bk, dir);
            if dist(w.units.x[s], w.units.y[s], cx, cy) > range {
                if steer(w, s, cx, cy, cx, cy, range - TILE) && w.units.cold[s].stuck > 100 {
                    pop_order(w, s);
                }
                return NONE;
            }
            clear_goal(w, s);
            // bâtiment identique déjà en chantier à cet endroit ?
            if w.map.inside(x, y) {
                let o = w.map.occ_floor(w.map.idx(x, y), buildings::floor_of(dir));
                if o != 0 {
                    let b = (o - 1) as usize;
                    let bb = &w.buildings[b];
                    if bb.kind == bk && bb.x == x && bb.y == y && w.team_of(bb.owner) == w.team_of(owner) && !bb.complete() {
                        let r = w.building_ref(b);
                        w.units.cold[s].orders[0] = Order::Build { kind: bk, x, y, dir, bid: r };
                        return NONE;
                    }
                }
            }
            // pose avec remplacement : tapis réorienté sur place, ou tapis démontés avant le chantier
            if let Some(b) = buildings::clear_for_replace(w, owner, bk, x, y, dir) {
                let r = w.building_ref(b);
                w.units.cold[s].orders[0] = Order::Build { kind: bk, x, y, dir, bid: r };
                return NONE;
            }
            match buildings::place_building(w, owner, bk, x, y, dir) {
                Some(b) => {
                    let r = w.building_ref(b);
                    w.units.cold[s].orders[0] = Order::Build { kind: bk, x, y, dir, bid: r };
                }
                None => pop_order(w, s),
            }
            NONE
        }
        Order::Assist { target } => {
            if let Some(b) = w.building(target) {
                let range = build_range(w.buildings[b].kind, w.buildings[b].dir);
                let (cx, cy) = w.buildings[b].center();
                if w.team_of(w.buildings[b].owner) != w.team_of(owner) || def.build_power == 0 {
                    pop_order(w, s);
                    return NONE;
                }
                if dist(w.units.x[s], w.units.y[s], cx, cy) > range {
                    steer(w, s, cx, cy, cx, cy, range - TILE);
                    return NONE;
                }
                clear_goal(w, s);
                if !construct(w, s, b) {
                    pop_order(w, s);
                }
                return NONE;
            }
            if let Some(t) = w.unit(target) {
                // escorte
                let (tx, ty) = (w.units.x[t], w.units.y[t]);
                let d = dist(w.units.x[s], w.units.y[s], tx, ty);
                if d > 7 * TILE {
                    let g = w.units.cold[s].goal;
                    if g != 0 {
                        let gt = (g & 0xffff_ffff) as i32;
                        if ((gt % w.map.w) - tx / TILE).abs() + ((gt / w.map.w) - ty / TILE).abs() > 6 {
                            clear_goal(w, s);
                        }
                    }
                    steer(w, s, tx, ty, tx, ty, 5 * TILE);
                    w.units.cold[s].stuck = 0;
                } else if def.build_power > 0 && w.units.hp[t] < w.max_hp(t) && w.team_of(w.units.owner[t]) == w.team_of(owner) {
                    let bp = build_power(w, s) as i32;
                    let max = w.max_hp(t);
                    w.units.hp[t] = (w.units.hp[t] + (max / 400).max(1) * bp / 10).min(max);
                    w.units.cold[s].flags |= UF_WORKING;
                }
                return NONE;
            }
            pop_order(w, s);
            NONE
        }
        Order::Reclaim { target } => {
            if def.build_power == 0 {
                pop_order(w, s);
                return NONE;
            }
            let pos = w.ref_pos(target);
            let Some((tx, ty)) = pos else {
                pop_order(w, s);
                return NONE;
            };
            let range = 6 * TILE;
            if dist(w.units.x[s], w.units.y[s], tx, ty) > range {
                steer(w, s, tx, ty, tx, ty, range - TILE);
                return NONE;
            }
            clear_goal(w, s);
            let cont = if let Some(wk) = w.wreck(target) {
                reclaim_wreck(w, s, wk)
            } else if let Some(b) = w.building(target) {
                if w.buildings[b].owner == owner {
                    deconstruct(w, s, b)
                } else {
                    false
                }
            } else {
                false
            };
            if !cont {
                pop_order(w, s);
            }
            NONE
        }
        Order::Collect { target } => {
            // commandant posté près d'un de nos tapis : chaque objet qui passe sur cette case est versé au stock
            let Some(b) = w.building(target) else {
                pop_order(w, s);
                return NONE;
            };
            if w.buildings[b].owner != owner || w.buildings[b].def().class != BClass::Belt {
                pop_order(w, s);
                return NONE;
            }
            let (tx, ty) = w.buildings[b].center();
            let range = COLLECT_RANGE;
            if dist(w.units.x[s], w.units.y[s], tx, ty) > range {
                steer(w, s, tx, ty, tx, ty, range - TILE);
                return NONE;
            }
            clear_goal(w, s);
            let it = crate::belts::take_from_belt(w, b, &|_| true);
            if it != 0 {
                w.players[owner as usize].stock[it as usize] += 1;
                w.units.cold[s].flags |= UF_WORKING;
            }
            NONE
        }
        Order::Load { target } => {
            let Some(t) = w.unit(target) else {
                pop_order(w, s);
                return NONE;
            };
            let (tx, ty) = (w.units.x[t], w.units.y[t]);
            if dist(w.units.x[s], w.units.y[s], tx, ty) > 2 * TILE + def.radius {
                steer(w, s, tx, ty, tx, ty, TILE);
                w.units.cold[s].stuck = 0;
                return NONE;
            }
            load_unit(w, s, t);
            pop_order(w, s);
            NONE
        }
        Order::Face { a } => {
            // les avions à voilure fixe ne s'arrêtent pas pour s'orienter
            if fixed_wing(kind) {
                pop_order(w, s);
                return NONE;
            }
            let a = a as u16;
            let nf = turn_towards(w.units.facing[s], a, turn_rate(kind));
            w.units.facing[s] = nf;
            if nf == a {
                pop_order(w, s);
            }
            NONE
        }
        Order::Enter { target } => {
            let Some(t) = w.unit(target) else {
                pop_order(w, s);
                return NONE;
            };
            let (tx, ty) = (w.units.x[t], w.units.y[t]);
            if dist(w.units.x[s], w.units.y[s], tx, ty) > 2 * TILE + udef(w.units.kind[t]).radius {
                steer(w, s, tx, ty, tx, ty, TILE);
                w.units.cold[s].stuck = 0;
                return NONE;
            }
            pop_order(w, s);
            load_unit(w, t, s);
            NONE
        }
        Order::Unload { x, y } => {
            if steer(w, s, x, y, x, y, TILE) || dist(w.units.x[s], w.units.y[s], x, y) < 2 * TILE {
                unload_all(w, s);
                pop_order(w, s);
            }
            NONE
        }
        Order::Teleport { x, y } => {
            let p = &w.players[owner as usize];
            if kind != U_COMMANDER || !p.has_tech(T_CMD_TELEPORT) || w.tick < w.units.cold[s].ready_tick {
                pop_order(w, s);
                return NONE;
            }
            let c = &mut w.units.cold[s];
            c.timer += 1;
            c.flags |= UF_CHARGING;
            if c.timer >= 100 {
                let (fx, fy) = buildings::free_spot_near(w, x, y, P_LAND);
                let (ox, oy) = (w.units.x[s], w.units.y[s]);
                w.ev(EV_TELEPORT, ox, oy, fx, fy);
                w.units.x[s] = fx;
                w.units.y[s] = fy;
                w.units.px[s] = fx;
                w.units.py[s] = fy;
                w.units.cold[s].ready_tick = w.tick + 1200;
                pop_order(w, s);
            }
            NONE
        }
        Order::Jump { beacon } => {
            let Some(b) = w.building(beacon) else {
                pop_order(w, s);
                return NONE;
            };
            if kind != U_HYPER || w.buildings[b].owner != owner || !w.buildings[b].complete() {
                pop_order(w, s);
                return NONE;
            }
            let c = &mut w.units.cold[s];
            c.timer += 1;
            c.flags |= UF_CHARGING;
            if c.timer >= 200 {
                let (bx, by) = w.buildings[b].center();
                let (ox, oy) = (w.units.x[s], w.units.y[s]);
                w.ev(EV_TELEPORT, ox, oy, bx, by);
                w.units.x[s] = bx + 3 * TILE;
                w.units.y[s] = by;
                w.units.px[s] = bx + 3 * TILE;
                w.units.py[s] = by;
                pop_order(w, s);
            }
            NONE
        }
    }
}

fn idle(w: &mut World, s: usize) {
    let kind = w.units.kind[s];
    if fixed_wing(kind) {
        // les avions tournent en rond au-dessus de leur position
        let a = w.units.facing[s].wrapping_add(900);
        w.units.facing[s] = a;
        let sp = unit_speed(kind) / 2;
        let vx = (w.trig.cos(a) as i64 * sp as i64 / 16384) as i32;
        let vy = (w.trig.sin(a) as i64 * sp as i64 / 16384) as i32;
        try_move(w, s, vx, vy);
    }
}

pub fn max_range(kind: u16) -> i32 {
    udef(kind).weapons.iter().map(|&wi| WEAPONS[wi as usize].range).max().unwrap_or(0)
}

fn has_target_in_range(w: &World, s: usize) -> bool {
    w.units.cold[s].wtarget.iter().any(|&t| t != NONE)
}

pub fn load_unit(w: &mut World, carrier: usize, t: usize) {
    let cap = udef(w.units.kind[carrier]).carry as usize;
    let tk = w.units.kind[t];
    let td = udef(tk);
    if cap == 0 || w.units.cold[carrier].cargo.len() >= cap || w.units.owner[carrier] != w.units.owner[t] {
        return;
    }
    if !matches!(td.layer, Layer::Land | Layer::Hover) || td.radius > 300 || td.tier == 6 {
        return;
    }
    if w.units.kind[carrier] == U_SIEGE_WALKER && tk != U_LINE_ROBOT {
        return;
    }
    clear_orders(w, t);
    let cid = w.unit_id(carrier);
    let tid = w.unit_id(t);
    w.units.cold[t].carried_by = cid;
    w.units.cold[carrier].cargo.push(tid);
}

pub fn unload_all(w: &mut World, carrier: usize) {
    let cargo = std::mem::take(&mut w.units.cold[carrier].cargo);
    let (x, y) = (w.units.x[carrier], w.units.y[carrier]);
    for (i, id) in cargo.into_iter().enumerate() {
        if let Some(t) = w.unit(id) {
            let m = pass_mask(udef(w.units.kind[t]).layer);
            let ox = x + ((i as i32 % 4) - 2) * TILE;
            let oy = y + ((i as i32 / 4) - 1) * TILE;
            let (fx, fy) = buildings::free_spot_near(w, ox, oy, m);
            w.units.x[t] = fx;
            w.units.y[t] = fy;
            w.units.px[t] = fx;
            w.units.py[t] = fy;
            w.units.cold[t].carried_by = NONE;
        }
    }
}

/// Portes de transit : une unité qui entre dans une porte ouverte ressort par l'autre.
fn gate_check(w: &mut World, s: usize) {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let o = w.map.occ[w.map.idx(x / TILE, y / TILE)];
    if o == 0 {
        return;
    }
    let b = (o - 1) as usize;
    let bb = &w.buildings[b];
    if bb.def().class != BClass::Gate || !bb.working || bb.owner != w.units.owner[s] {
        return;
    }
    let (cx, cy) = bb.center();
    if dist2(x, y, cx, cy) > (TILE as i64 * 3 / 2).pow(2) {
        return;
    }
    let Some(t) = w.building(bb.link) else { return };
    if !w.buildings[t].working {
        return;
    }
    let (tx, ty) = w.buildings[t].center();
    let m = pass_mask(udef(w.units.kind[s]).layer);
    let (fx, fy) = buildings::free_spot_near(w, tx, ty + 4 * TILE, m);
    w.ev(EV_TELEPORT, x, y, fx, fy);
    w.units.x[s] = fx;
    w.units.y[s] = fy;
    w.units.px[s] = fx;
    w.units.py[s] = fy;
    // l'ordre de déplacement vers la porte est terminé
    if let Some(Order::Move { .. }) = w.units.cold[s].orders.first() {
        pop_order(w, s);
    }
}

/// Capacités propres à certaines unités.
fn special(w: &mut World, s: usize) {
    let kind = w.units.kind[s];
    let owner = w.units.owner[s] as usize;
    match kind {
        U_FORTRESS | U_MOTHERSHIP => {
            let child = if kind == U_FORTRESS { U_LINE_ROBOT } else { U_GLIDER };
            let period = if kind == U_FORTRESS { 200 } else { 120 };
            let c = &mut w.units.cold[s];
            c.timer += 1;
            if c.timer >= period && c.children < 12 && w.players[owner].unit_count < UNIT_CAP {
                let cost = udef(child).cost;
                if cost.iter().all(|&(it, n)| w.avail(owner, it) >= n as i32) {
                    for &(it, n) in cost {
                        w.pay(owner, it, n as i32);
                    }
                    w.units.cold[s].timer = 0;
                    w.units.cold[s].children += 1;
                    let (x, y) = (w.units.x[s], w.units.y[s]);
                    let m = pass_mask(udef(child).layer);
                    let (fx, fy) = if m == 0xff { (x, y) } else { buildings::free_spot_near(w, x, y + 4 * TILE, m) };
                    let pid = w.unit_id(s);
                    let id = w.spawn_unit(child, owner as u8, fx, fy);
                    let cs = slot_of(id);
                    w.units.cold[cs].parent = pid;
                    w.units.cold[cs].orders.push(Order::Assist { target: pid });
                }
            }
        }
        U_HEAVY_ARTY => {
            let c = &mut w.units.cold[s];
            let wants = c.wtarget[0] != NONE || matches!(c.orders.first(), Some(Order::AttackGround { .. }) | Some(Order::Attack { .. }));
            if wants && !c.deployed && w.units.px[s] == w.units.x[s] && w.units.py[s] == w.units.y[s] {
                c.timer += 1;
                if c.timer >= 60 {
                    c.deployed = true;
                    c.timer = 0;
                }
            }
        }
        U_COLOSSUS => {
            // écrase les petites unités ennemies sous ses pieds
            let (x, y) = (w.units.x[s], w.units.y[s]);
            let team = w.team_of(owner as u8);
            let r = udef(kind).radius;
            let mut hits = Vec::new();
            let units = &w.units;
            w.grid.fine.query(x, y, r, |o| {
                if units.alive[o] && units.cold[o].carried_by == NONE {
                    let od = udef(units.kind[o]);
                    if matches!(od.layer, Layer::Land | Layer::Hover) && od.radius < 300 && dist2(x, y, units.x[o], units.y[o]) < (r as i64 * r as i64) {
                        hits.push(o);
                    }
                }
            });
            for o in hits {
                if w.team_of(w.units.owner[o]) != team {
                    crate::combat::damage_unit(w, o, 150, owner as u8);
                }
            }
        }
        _ => {}
    }
}
