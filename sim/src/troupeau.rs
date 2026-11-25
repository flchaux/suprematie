//! Robots des Transhumants : le Mâtin et le Berger (voir docs/spec/races.md).
//!
//! - Mâtin : chien de garde mécanique. Meute (`pack_mult`) : ses coups sont plus forts près d'autres Mâtins. Chasse
//!   (`chase`) : en marche offensive, en patrouille, en escorte ou sans ordre, il court sus à l'ennemi qui approche.
//!   Harpon (`reel`) : tant que le câble tient, il tire sa proie à lui, ou se tire vers elle si elle est trop lourde.
//! - Berger : géant à houlette. Troupeau (`flock_speed`) : les unités de son joueur autour de lui vont plus vite.
//!   Sabots (`stomp`), chenil (`kennel`).

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
/// jette sur un ennemi ; écart à son maître au-delà duquel il renonce. Un Berger en marche offensive ou en patrouille
/// chasse d'aussi loin.
const HUNT: i32 = 10;
const HUNT_IDLE: i32 = 6;
const LEASH: i32 = 14;
/// Pattes à ressorts : distance du bond (cases) et vitesse (%).
const LUNGE: i32 = 8;
const LUNGE_PCT: i32 = 200;
/// Harpon : pas du câble (sous-unités par tick), et distance (au bord de la proie) où il s'arrête.
const REEL_STEP: i32 = 80;
const REEL_STOP: i32 = TILE;
/// Proie trop lourde pour le harpon : palier, rayon.
const HEAVY_TIER: u8 = 3;
const HEAVY_RADIUS: i32 = 260;
/// Toison de câbles : dégâts subis des explosions (%).
pub const FUR_PCT: i64 = 40;
/// Truffe : détection rapprochée (cases).
const NOSE_RANGE: i32 = 14;
/// Tonnelet : rayon (cases).
const BARREL_RANGE: i32 = 5;
/// Troupeau : rayon (cases) et vitesse en plus (%), sans et avec sonnailles.
pub const FLOCK: (i32, i32) = (12, 15);
pub const FLOCK_BELLS: (i32, i32) = (18, 30);
/// Sabots : dégâts par tick aux petites unités qu'il touche en marchant.
const BOOTS_DMG: i32 = 30;
/// Chenil : durée de fabrication (ticks), Mâtins vivants au plus.
pub const KENNEL_TICKS: u32 = 600;
pub const KENNEL_MAX: u16 = 4;

/// Berger en marche : joueur, position, rayon (sous-unités) et vitesse (%) de son troupeau (dérivé à chaque tick).
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
            let (r, pct) = if has(w.units.cold[s].mods, M_SHEPHERD_BELLS) { FLOCK_BELLS } else { FLOCK };
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

/// Combattant au corps-à-corps (bélier, Mâtin, Berger) : il va au contact, et son arme de plus, s'il en a une, tire en
/// chemin ; sauf avec une pièce d'artillerie (fronde), qui garde ses distances.
#[inline]
pub fn brawler(w: &World, s: usize) -> bool {
    if !matches!(w.units.kind[s], U_RAM | U_MASTIFF | U_SHEPHERD) {
        return false;
    }
    let (v, n) = weapons_of(w, s);
    n < 2 || WEAPONS[v[1] as usize].min_range == 0
}

/// Chasse d'un Mâtin ou d'un Berger : la proie qu'il poursuit ce tick (il va vers elle), ou NONE : il suit ses ordres.
/// La proie est gardée dans `UnitCold::work` (0 : aucune).
pub fn chase(w: &mut World, s: usize) -> u32 {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let dog = w.units.kind[s] == U_MASTIFF;
    let (hunt, from) = match w.units.cold[s].orders.first() {
        None if dog => (HUNT_IDLE, None),
        Some(Order::Move { attack: true, .. } | Order::Patrol { .. }) if brawler(w, s) => (HUNT, None),
        Some(&Order::Assist { target }) if dog => match w.unit(target) {
            Some(m) => (HUNT, Some((w.units.x[m], w.units.y[m]))),
            None => return drop_prey(w, s),
        },
        _ => return drop_prey(w, s),
    };
    let team = w.team_of(w.units.owner[s]);
    let near = |w: &World, t: u32, r: i32| w.ref_pos(t).filter(|&(tx, ty)| dist2(x, y, tx, ty) <= (r * TILE) as i64 * (r * TILE) as i64);
    if (w.tick + s as u32).is_multiple_of(5) {
        // le harpon porte plus loin que la chasse : son viseur sert à repérer la proie la plus proche
        let t = crate::combat::find_target(w, team, W_MASTIFF_HARPOON as usize, x, y);
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

/// Pattes à ressorts : vitesse (%) du Mâtin `s`, doublée à l'approche de sa proie.
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

/// Câble du harpon (une fois par tick, `src` : le Mâtin, `target` : ce qu'il a accroché) : une petite unité au sol est
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
    if w.units.kind[s] == U_MASTIFF && has(w.units.cold[s].mods, M_MASTIFF_NOSE) {
        NOSE_RANGE
    } else {
        3
    }
}

/// Collier à clous : le Mâtin `s` renvoie la moitié des morsures.
#[inline]
pub fn spiked(w: &World, s: usize) -> bool {
    w.units.kind[s] == U_MASTIFF && has(w.units.cold[s].mods, M_MASTIFF_COLLAR)
}

/// Capacités d'un Mâtin ou d'un Berger améliorés, chaque tick.
pub fn tick(w: &mut World, s: usize) {
    let mods = w.units.cold[s].mods;
    match w.units.kind[s] {
        U_MASTIFF if w.tick.is_multiple_of(20) && has(mods, M_MASTIFF_BARREL) => {
            let (x, y, o) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
            repair(w, x, y, o, BARREL_RANGE, false);
        }
        U_SHEPHERD => {
            let moving = w.units.x[s] != w.units.px[s] || w.units.y[s] != w.units.py[s];
            if moving && has(mods, M_SHEPHERD_BOOTS) {
                stomp(w, s, BOOTS_DMG, true);
            }
            if has(mods, M_SHEPHERD_KENNEL) {
                kennel(w, s);
            }
        }
        _ => {}
    }
}

/// Un géant écrase les petites unités ennemies sous ses pieds, ou dès qu'il les touche (`touch`) : `dmg` par tick.
pub fn stomp(w: &mut World, s: usize, dmg: i32, touch: bool) {
    let (x, y, owner) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
    let team = w.team_of(owner);
    let r = udef(w.units.kind[s]).radius;
    let mut hits = Vec::new();
    let units = &w.units;
    w.grid.fine.query(x, y, r + if touch { 340 } else { 0 }, |o| {
        if units.alive[o] && units.cold[o].carried_by == NONE {
            let od = udef(units.kind[o]);
            let rr = r + if touch { od.radius + 32 } else { 0 };
            if matches!(od.layer, Layer::Land | Layer::Hover) && od.radius < 300 && dist2(x, y, units.x[o], units.y[o]) < (rr as i64 * rr as i64) {
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

/// Chenil : un Mâtin toutes les KENNEL_TICKS (KENNEL_MAX vivants au plus), payé dans les réserves à portée ; il escorte
/// son Berger. `UnitCold::ready_tick` : tick où le prochain est prêt.
fn kennel(w: &mut World, s: usize) {
    let owner = w.units.owner[s];
    let c = &w.units.cold[s];
    if w.tick < c.ready_tick || !w.tick.is_multiple_of(10) || c.children >= KENNEL_MAX || w.players[owner as usize].unit_count >= UNIT_CAP {
        return;
    }
    let (x, y) = (w.units.x[s], w.units.y[s]);
    if !pay(w, owner, x, y, udef(U_MASTIFF).cost) {
        return;
    }
    w.units.cold[s].ready_tick = w.tick + KENNEL_TICKS;
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
