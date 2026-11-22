//! Ponte de la Souche (voir docs/spec/races.md).
//!
//! Les couveuses ne font pas naître leurs organismes un par un. Une entrée de file est une **portée**
//! (`UnitDef::litter`, 3 à 6 selon l'espèce) : la couveuse paie la portée entière, la porte pendant la
//! moitié du temps de fabrication cumulé de ses organismes (`data::factory_ticks`), puis pond tous ses
//! œufs d'un coup devant elle (`lay`).
//!
//! Un œuf est une unité (`U_EGG_S`, `U_EGG_M`, `U_EGG_L` selon la taille de l'espèce) : immobile, sans
//! arme, il ne reçoit pas d'ordre, et l'ennemi peut le détruire comme n'importe quelle unité. Il éclot
//! `INCUBATION` ticks après la ponte (un tiers de moins avec Fécondité) : l'œuf disparaît sans mort ni
//! cadavre et l'organisme prend sa place (`hatch`), blessé dans la même proportion que l'œuf.
//!
//! Un nid greffé (nid de mordeurs apprivoisé, `nature::Den`) pond de la même façon, sans coût : une
//! portée de `nature::DEN_LITTER` œufs de mordeurs devant lui.
//!
//! Rien de nouveau n'est sérialisé. Un œuf garde dans ses champs d'unité : l'espèce qu'il porte
//! (`UnitCold::work` = type + 1), le tick d'éclosion (`ready_tick`), la durée de l'incubation (`timer`)
//! et l'ordre de ralliement de la couveuse (`orders`), dont l'organisme hérite.

use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::map::P_LAND;
use crate::world::*;

/// Incubation d'un œuf, en ticks (15 s).
pub const INCUBATION: u32 = 300;
/// Événement : un œuf a éclos (x, y, type de l'œuf | type de l'organisme << 8, joueur | orientation << 8).
pub const EV_HATCH: i32 = 48;
/// Temps restant affiché d'un œuf qui n'éclora pas (voir `hatch_left`).
pub const EGG_NEVER: u32 = 0xffff;
/// Part minimale des points de vie de l'organisme né d'un œuf blessé (‰).
const HATCH_MIN_HP: i64 = 250;

#[inline]
pub fn is_egg(kind: u16) -> bool {
    matches!(kind, U_EGG_S | U_EGG_M | U_EGG_L)
}

/// Œuf (type d'unité) d'une espèce, d'après sa taille.
pub fn egg_of(kind: u16) -> u16 {
    match udef(kind).radius {
        r if r <= 100 => U_EGG_S,
        r if r <= 170 => U_EGG_M,
        _ => U_EGG_L,
    }
}

/// Durée de l'incubation pour ce joueur (Fécondité : couveuses 50 % plus rapides).
pub fn incubation(w: &World, owner: u8) -> u32 {
    INCUBATION * 100 / crate::souche::brood_speed(w, owner).max(1)
}

/// Espèce portée par l'œuf `s`, s'il en porte une.
pub fn content(w: &World, s: usize) -> Option<u16> {
    let k = w.units.cold[s].work;
    (is_egg(w.units.kind[s]) && k >= 1 && (k as usize) <= UNITS.len()).then(|| (k - 1) as u16)
}

/// Ticks avant l'éclosion de l'œuf `s` (EGG_NEVER s'il ne porte rien : il n'éclora pas).
#[inline]
pub fn hatch_left(w: &World, s: usize) -> u32 {
    if content(w, s).is_some() {
        w.units.cold[s].ready_tick.saturating_sub(w.tick).min(EGG_NEVER - 1)
    } else {
        EGG_NEVER
    }
}

/// Sens de la sortie d'un bâtiment (vecteur unité).
fn out_dir(dir: u8) -> (i32, i32) {
    match dir & 3 {
        0 => (1, 0),
        1 => (0, 1),
        2 => (-1, 0),
        _ => (0, -1),
    }
}

/// Distance entre deux cases voisines d'un pavage hexagonal de coordonnées axiales (q, r).
fn hex_ring(q: i32, r: i32) -> i32 {
    (q.abs() + r.abs() + (q + r).abs()) / 2
}

/// Places d'une portée de `n` œufs de rayon `r` autour du point (cx, cy), en nid d'abeilles serré : le
/// centre, puis l'anneau qui l'entoure (un œuf sur deux d'abord, pour qu'une petite portée reste
/// ramassée), puis les anneaux suivants. `d` : sens de la sortie (les œufs ne reculent pas de plus d'un
/// rang vers le bâtiment). Une place est prise si elle n'est pas au sol, ou si un œuf y est déjà.
fn clutch_spots(w: &World, cx: i32, cy: i32, d: (i32, i32), r: i32, n: usize) -> Vec<(i32, i32)> {
    const RING1: [(i32, i32); 6] = [(1, 0), (-1, 1), (0, -1), (0, 1), (-1, 0), (1, -1)];
    let sp = 2 * r + 20;
    let l = (-d.1, d.0);
    let mut cells: Vec<(i32, i32)> = vec![(0, 0)];
    cells.extend_from_slice(&RING1);
    for k in 2..=4 {
        for q in -k..=k {
            for rr in -k..=k {
                if hex_ring(q, rr) == k {
                    cells.push((q, rr));
                }
            }
        }
    }
    let mut out: Vec<(i32, i32)> = Vec::with_capacity(n);
    for (q, rr) in cells {
        if out.len() >= n {
            break;
        }
        // côté (le long de la façade) et avancée (vers la sortie)
        let side = sp * (2 * q + rr) / 2;
        let fwd = sp * rr * 887 / 1024;
        if fwd < -(sp + 16) {
            continue;
        }
        let (x, y) = (cx + l.0 * side + d.0 * fwd, cy + l.1 * side + d.1 * fwd);
        if x < 0 || y < 0 || !w.map.passable(x / TILE, y / TILE, P_LAND) {
            continue;
        }
        let clear = |ox: i32, oy: i32, or: i32| dist2(x, y, ox, oy) >= ((r + or) as i64).pow(2);
        if !out.iter().all(|&(ox, oy)| clear(ox, oy, r)) {
            continue;
        }
        let mut free = true;
        w.grid.fine.query(x, y, r + 200, |o| {
            if w.units.alive[o] && is_egg(w.units.kind[o]) && !clear(w.units.x[o], w.units.y[o], udef(w.units.kind[o]).radius) {
                free = false;
            }
        });
        if free {
            out.push((x, y));
        }
    }
    // plus de place devant (façade murée, rive) : le reste sur la case libre la plus proche
    let mut k = 0i32;
    while out.len() < n {
        let (fx, fy) = crate::buildings::free_spot_near(w, cx, cy, P_LAND);
        out.push((fx + (k % 3 - 1) * 70, fy + ((k / 3) % 3 - 1) * 70));
        k += 1;
    }
    out
}

/// Pond un œuf de l'espèce `kind` en (x, y) pour `owner` ; à l'éclosion l'organisme ira en `rally`, ou
/// restera sur place s'il n'y en a pas.
pub fn lay_egg(w: &mut World, owner: u8, kind: u16, x: i32, y: i32, rally: Option<(i32, i32)>) -> u32 {
    let inc = incubation(w, owner);
    let facing = w.rng.below(65536) as u16;
    let id = w.spawn_unit(egg_of(kind), owner, x, y);
    let s = slot_of(id);
    w.units.facing[s] = facing;
    let c = &mut w.units.cold[s];
    c.work = kind as u32 + 1;
    c.ready_tick = w.tick + inc;
    c.timer = inc.min(u16::MAX as u32) as u16;
    if let Some((rx, ry)) = rally {
        c.orders.push(Order::Move { x: rx, y: ry, gx: rx, gy: ry, attack: false, eta: 0 });
    }
    id
}

/// Pond une portée de `n` œufs de l'espèce `kind` autour de (cx, cy), vers `d` (voir `clutch_spots`).
pub fn lay_clutch(w: &mut World, owner: u8, kind: u16, n: usize, cx: i32, cy: i32, d: (i32, i32), rally: Option<(i32, i32)>) -> Vec<u32> {
    let r = udef(egg_of(kind)).radius;
    clutch_spots(w, cx, cy, d, r, n).into_iter().map(|(x, y)| lay_egg(w, owner, kind, x, y, rally)).collect()
}

/// La couveuse `b` pond la portée de l'espèce `kind` devant sa sortie.
pub fn lay(w: &mut World, b: usize, kind: u16) {
    let rally = w.buildings[b].rally;
    lay_from(w, b, kind, batch(kind) as usize, Some(rally));
}

/// Le bâtiment `b` (couveuse, nid greffé) pond `n` œufs de l'espèce `kind` devant sa sortie ; renvoie
/// leurs identifiants.
pub fn lay_from(w: &mut World, b: usize, kind: u16, n: usize, rally: Option<(i32, i32)>) -> Vec<u32> {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let (cx, cy) = bb.center();
    let d = out_dir(bb.dir);
    let half = if d.0 != 0 { bw } else { bh } * TILE / 2;
    let r = udef(egg_of(kind)).radius;
    // centre de la portée : un rang d'œufs entre lui et la façade
    let ahead = half + 3 * r + 44;
    let owner = bb.owner;
    lay_clutch(w, owner, kind, n, cx + d.0 * ahead, cy + d.1 * ahead, d, rally)
}

/// Un tick d'un œuf (appelé par `units::update_units` à la place des ordres et des armes) : il éclot
/// quand son heure est venue. Un œuf qui ne porte rien (vitrine des modèles) reste un œuf.
pub fn tick_egg(w: &mut World, s: usize) {
    if w.tick >= w.units.cold[s].ready_tick && content(w, s).is_some() {
        hatch(w, s);
    }
}

/// Éclosion : l'œuf disparaît sans mort ni cadavre, l'organisme qu'il portait prend sa place, avec
/// son orientation, ses ordres et la même part de points de vie.
pub fn hatch(w: &mut World, s: usize) {
    let egg = w.units.kind[s];
    let old = w.unit_id(s);
    let kind = content(w, s);
    let owner = w.units.owner[s];
    let (x, y, facing) = (w.units.x[s], w.units.y[s], w.units.facing[s]);
    let (hp, max) = (w.units.hp[s].max(0) as i64, w.max_hp(s).max(1) as i64);
    let orders = std::mem::take(&mut w.units.cold[s].orders);
    w.units.alive[s] = false;
    w.units.free.push(s as u32);
    let pl = &mut w.players[owner as usize];
    pl.unit_count = pl.unit_count.saturating_sub(1);
    let Some(kind) = kind else { return };
    let id = w.spawn_unit(kind, owner, x, y);
    let n = slot_of(id);
    w.units.facing[n] = facing;
    w.units.cold[n].orders = orders;
    let full = w.units.hp[n] as i64;
    w.units.hp[n] = (full * (hp * 1000 / max).clamp(HATCH_MIN_HP, 1000) / 1000).max(1) as i32;
    w.ev(EV_HATCH, x, y, egg as i32 | (kind as i32) << 8, owner as i32 | (facing as i32) << 8);
    // nid greffé : la bête née de l'œuf reste comptée dans sa portée
    crate::nature::egg_hatched(w, old, id);
}
