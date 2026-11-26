//! Robots des Transhumants : le Mâtin et le Berger (voir docs/spec/races.md).
//!
//! - Mâtin : quadrupède d'assaut, au corps à corps. Meute (`pack_mult`) : ses coups sont plus forts près d'autres
//!   Mâtins. Chasse (`chase`) : en marche offensive, en patrouille, en escorte ou sans ordre, il court sus à l'ennemi qui
//!   approche. Grappin magnétique (`reel`) : tant que le câble tient, il tire sa proie à lui, ou se tire vers elle si
//!   elle est trop lourde.
//! - Berger : marcheur géant de commandement, à décharges d'arc (à distance). Commandement (`flock_speed`) : les unités
//!   de son joueur autour de lui vont plus vite. Baie d'assemblage (`bay`).
//! - `stomp` : un géant écrase ce qu'il a sous les pieds (Colosse des Industriels).

use crate::ameliorations::*;
use crate::buildings;
use crate::data::*;
use crate::fixed::{dist, dist2, TILE};
use crate::world::*;

/// Meute : rayon (cases), dégâts en plus par autre Mâtin (%), au plus.
pub const PACK_RANGE: i32 = 6;
pub const PACK_PCT: i32 = 8;
pub const PACK_MAX: i32 = 40;
/// Chasse : distance (cases) à laquelle un Mâtin en marche offensive, en patrouille ou en escorte, puis sans ordre, se
/// jette sur un ennemi ; écart à son maître au-delà duquel il renonce.
const HUNT: i32 = 10;
const HUNT_IDLE: i32 = 6;
const LEASH: i32 = 14;
/// Vérins de bond : distance du bond (cases) et vitesse (%).
const LUNGE: i32 = 8;
const LUNGE_PCT: i32 = 200;
/// Grappin : pas du câble (sous-unités par tick), et distance (au bord de la proie) où il s'arrête.
const REEL_STEP: i32 = 80;
const REEL_STOP: i32 = TILE;
/// Proie trop lourde pour le grappin : palier, rayon.
const HEAVY_TIER: u8 = 3;
const HEAVY_RADIUS: i32 = 260;
/// Blindage-cage du Mâtin, blindage réactif du Berger : dégâts subis des obus, missiles et bombes (%).
pub const BLAST_PCT: i64 = 40;
/// Capteurs multispectraux : détection rapprochée (cases).
const SENSOR_RANGE: i32 = 14;
/// Nanoréparateurs : rayon (cases).
const NANITE_RANGE: i32 = 5;
/// Commandement : rayon (cases) et vitesse en plus (%), sans et avec relais.
pub const FLOCK: (i32, i32) = (12, 15);
pub const FLOCK_RELAY: (i32, i32) = (18, 30);
/// Baie d'assemblage : durée de fabrication (ticks), Mâtins vivants au plus.
pub const BAY_TICKS: u32 = 600;
pub const BAY_MAX: u16 = 4;

/// Berger en jeu : joueur, position, rayon (sous-unités) et vitesse en plus (%) de son commandement (dérivé à chaque tick).
#[derive(Clone, Copy, Debug)]
pub struct Flock {
    owner: u8,
    x: i32,
    y: i32,
    r: i32,
    pct: i32,
}

/// Début de tick : les Bergers en jeu.
pub fn begin_tick(w: &mut World) {
    w.flock.clear();
    if !w.players.iter().any(|p| p.race == RACE_TRANSH) {
        return;
    }
    for s in 0..w.units.alive.len() {
        if w.units.kind[s] == U_SHEPHERD && w.units.alive[s] && w.units.cold[s].carried_by == NONE {
            let (r, pct) = if has(w.units.cold[s].mods, M_SHEPHERD_RELAY) { FLOCK_RELAY } else { FLOCK };
            let f = Flock { owner: w.units.owner[s], x: w.units.x[s], y: w.units.y[s], r: r * TILE, pct };
            w.flock.push(f);
        }
    }
}

/// Vitesse en plus (%) de l'unité `s` près d'un Berger de son joueur (le meilleur ; un Berger n'entraîne pas un Berger).
#[inline]
pub fn flock_speed(w: &World, s: usize) -> i32 {
    if w.flock.is_empty() {
        return 0;
    }
    let (kind, owner) = (w.units.kind[s], w.units.owner[s]);
    if kind == U_SHEPHERD || udef(kind).race != RACE_TRANSH {
        return 0;
    }
    let (x, y) = (w.units.x[s], w.units.y[s]);
    w.flock.iter().filter(|f| f.owner == owner && dist2(x, y, f.x, f.y) <= f.r as i64 * f.r as i64).map(|f| f.pct).max().unwrap_or(0)
}

/// Meute : dégâts (%) du Mâtin `s`, selon les autres Mâtins de son joueur autour de lui.
pub fn pack_mult(w: &World, s: usize) -> i32 {
    let (x, y, owner) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
    let r = PACK_RANGE * TILE;
    let units = &w.units;
    let mut n = 0;
    w.grid.fine.query(x, y, r, |o| {
        if o != s && units.alive[o] && units.kind[o] == U_MASTIFF && units.owner[o] == owner && units.cold[o].carried_by == NONE && dist2(x, y, units.x[o], units.y[o]) <= r as i64 * r as i64 {
            n += 1;
        }
    });
    100 + (n * PACK_PCT).min(PACK_MAX)
}

/// Unité qui se bat à la portée de son arme principale : au contact (bélier, Mâtin), à celle de sa décharge (Berger).
/// Son arme de plus, si elle en a une, tire en chemin sans l'arrêter, même si elle porte plus loin ; sauf une pièce
/// d'artillerie (mortier), qui la fait garder ses distances.
#[inline]
pub fn closes_in(w: &World, s: usize) -> bool {
    if !matches!(w.units.kind[s], U_RAM | U_MASTIFF | U_SHEPHERD) {
        return false;
    }
    let (v, n) = weapons_of(w, s);
    n < 2 || WEAPONS[v[1] as usize].min_range == 0
}

/// Chasse d'un Mâtin : la proie qu'il poursuit ce tick (il va vers elle), ou NONE : il suit ses ordres.
/// La proie est gardée dans `UnitCold::work` (0 : aucune).
pub fn chase(w: &mut World, s: usize) -> u32 {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let (hunt, from) = match w.units.cold[s].orders.first() {
        None => (HUNT_IDLE, None),
        Some(Order::Move { attack: true, .. } | Order::Patrol { .. }) if closes_in(w, s) => (HUNT, None),
        Some(&Order::Assist { target }) => match w.unit(target) {
            Some(m) => (HUNT, Some((w.units.x[m], w.units.y[m]))),
            None => return drop_prey(w, s),
        },
        _ => return drop_prey(w, s),
    };
    let team = w.team_of(w.units.owner[s]);
    let near = |w: &World, t: u32, r: i32| w.ref_pos(t).filter(|&(tx, ty)| dist2(x, y, tx, ty) <= (r * TILE) as i64 * (r * TILE) as i64);
    if (w.tick + s as u32).is_multiple_of(5) {
        // le grappin porte plus loin que la chasse : son viseur sert à repérer la proie la plus proche
        let t = crate::combat::find_target(w, team, W_MASTIFF_GRAPPLE as usize, x, y);
        let keep = t != NONE && near(w, t, hunt).is_some();
        if !keep {
            return drop_prey(w, s);
        }
        w.units.cold[s].work = t;
    }
    let prey = w.units.cold[s].work;
    if prey == 0 {
        return NONE;
    }
    let Some((tx, ty)) = near(w, prey, HUNT + 4) else { return drop_prey(w, s) };
    if from.is_some_and(|(mx, my)| dist2(mx, my, tx, ty) > (LEASH * TILE) as i64 * (LEASH * TILE) as i64) {
        return drop_prey(w, s);
    }
    let reach = WEAPONS[udef(w.units.kind[s]).weapons[0] as usize].range * TILE;
    if dist(x, y, tx, ty) > reach * 9 / 10 {
        crate::units::retarget(w, s, tx, ty);
        crate::units::steer(w, s, tx, ty, tx, ty, reach * 8 / 10);
        w.units.cold[s].stuck = 0;
        w.units.cold[s].noprog = 0;
    }
    prey
}

/// Le Mâtin `s` n'a plus de proie : il reprend ses ordres.
fn drop_prey(w: &mut World, s: usize) -> u32 {
    if w.units.cold[s].work != 0 {
        w.units.cold[s].work = 0;
        crate::units::clear_goal(w, s);
        w.units.cold[s].best_dist = i32::MAX;
        w.units.cold[s].noprog = 0;
    }
    NONE
}

/// Vérins de bond : vitesse (%) du Mâtin `s`, doublée à l'approche de sa proie.
pub fn lunge(w: &World, s: usize) -> i32 {
    let prey = match w.units.cold[s].orders.first() {
        Some(&Order::Attack { target }) => target,
        _ => w.units.cold[s].work,
    };
    if prey == 0 {
        return 100;
    }
    let r = (LUNGE * TILE) as i64;
    match w.ref_pos(prey) {
        Some((tx, ty)) if dist2(w.units.x[s], w.units.y[s], tx, ty) <= r * r => LUNGE_PCT,
        _ => 100,
    }
}

/// Câble du grappin (une fois par tick, `src` : le Mâtin, `target` : ce qu'il a accroché) : une petite unité au sol est
/// tirée vers lui et ne peut rien faire d'autre ; ce qui est trop lourd (grosse unité, bâtiment, navire, pièce de
/// l'Arche) le tire, lui.
pub fn reel(w: &mut World, src: u32, target: u32) {
    let Some(s) = w.unit(src) else { return };
    let Some((tx, ty)) = w.ref_pos(target) else { return };
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let t = w.unit(target);
    let edge = t.map_or(2 * TILE, |t| radius(&w.units, t)) + radius(&w.units, s);
    let d = dist(x, y, tx, ty);
    if d <= edge + REEL_STOP {
        return;
    }
    let light = t.filter(|&t| {
        let k = w.units.kind[t];
        let td = udef(k);
        matches!(td.layer, Layer::Land | Layer::Hover) && td.tier <= HEAVY_TIER && td.radius <= HEAVY_RADIUS && !td.commander && !is_ark_part(k) && !crate::ponte::is_egg(k) && w.units.cold[t].pack == 0
    });
    let (m, gx, gy) = match light {
        Some(t) => {
            w.units.cold[t].stun = w.units.cold[t].stun.max(2);
            (t, x, y)
        }
        None => (s, tx, ty),
    };
    let (mx, my) = (w.units.x[m], w.units.y[m]);
    let nx = mx + ((gx - mx) as i64 * REEL_STEP as i64 / d as i64) as i32;
    let ny = my + ((gy - my) as i64 * REEL_STEP as i64 / d as i64) as i32;
    if w.map.inside(nx / TILE, ny / TILE) && w.map.passable(nx / TILE, ny / TILE, crate::units::pass_mask(udef(w.units.kind[m]).layer)) {
        w.units.x[m] = nx;
        w.units.y[m] = ny;
    }
}

/// Détection rapprochée de l'unité `s` (cases) : commandos camouflés, fouisseurs enterrés.
#[inline]
pub fn near_vision(w: &World, s: usize) -> i32 {
    if w.units.kind[s] == U_MASTIFF && has(w.units.cold[s].mods, M_MASTIFF_SENSORS) {
        SENSOR_RANGE
    } else {
        3
    }
}

/// Coque électrifiée : le Mâtin `s` renvoie la moitié des coups reçus au corps à corps.
#[inline]
pub fn shocks(w: &World, s: usize) -> bool {
    w.units.kind[s] == U_MASTIFF && has(w.units.cold[s].mods, M_MASTIFF_SHOCK)
}

/// Capacités d'un Mâtin ou d'un Berger améliorés, chaque tick.
pub fn tick(w: &mut World, s: usize) {
    let mods = w.units.cold[s].mods;
    match w.units.kind[s] {
        U_MASTIFF if w.tick.is_multiple_of(20) && has(mods, M_MASTIFF_NANITES) => {
            let (x, y, o) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
            repair(w, x, y, o, NANITE_RANGE, false);
        }
        U_SHEPHERD if has(mods, M_SHEPHERD_BAY) => bay(w, s),
        _ => {}
    }
}

/// Un géant écrase les petites unités ennemies sous ses pieds : `dmg` par tick.
pub fn stomp(w: &mut World, s: usize, dmg: i32) {
    let (x, y, owner) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
    let team = w.team_of(owner);
    let r = udef(w.units.kind[s]).radius;
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
            crate::combat::damage_unit(w, o, dmg, owner);
        }
    }
}

/// Baie d'assemblage : un Mâtin toutes les BAY_TICKS (BAY_MAX vivants au plus), payé dans les réserves à portée ; il
/// escorte son Berger. `UnitCold::ready_tick` : tick où le prochain est prêt.
fn bay(w: &mut World, s: usize) {
    let owner = w.units.owner[s];
    let c = &w.units.cold[s];
    if w.tick < c.ready_tick || !w.tick.is_multiple_of(10) || c.children >= BAY_MAX || w.players[owner as usize].unit_count >= UNIT_CAP {
        return;
    }
    let (x, y) = (w.units.x[s], w.units.y[s]);
    if !pay(w, owner, x, y, udef(U_MASTIFF).cost) {
        return;
    }
    w.units.cold[s].ready_tick = w.tick + BAY_TICKS;
    w.units.cold[s].children += 1;
    // il descend derrière son maître
    let a = w.units.facing[s].wrapping_add(32768);
    let r = udef(U_SHEPHERD).radius + TILE;
    let (mx, my) = (w.map.w * TILE - 1, w.map.h * TILE - 1);
    let bx = (x + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32).clamp(0, mx);
    let by = (y + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32).clamp(0, my);
    let (fx, fy) = buildings::free_spot_near(w, bx, by, crate::units::pass_mask(udef(U_MASTIFF).layer));
    let master = w.unit_id(s);
    let id = w.spawn_unit(U_MASTIFF, owner, fx, fy);
    let d = slot_of(id);
    w.units.facing[d] = w.units.facing[s];
    w.units.cold[d].parent = master;
    w.units.cold[d].orders.push(Order::Assist { target: master });
}
