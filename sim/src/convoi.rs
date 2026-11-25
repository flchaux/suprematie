//! Convoi de l'Arche (Transhumants, voir docs/spec/races.md, « Convoi »).
//!
//! - Une amélioration de pont ou de soutien est portée par une ou plusieurs remorques (unités `ark_car`) attelées
//!   derrière l'Arche : une seule, sauf la couronne de tourelles qui en demande trois (trois tourelles chacune).
//!   Ordre du convoi : remorques de pont, puis celle de soutien.
//! - Elles n'obéissent qu'à l'Arche et la suivent comme des remorques : chacune garde la longueur de son timon
//!   derrière le véhicule qui la précède. Là où ce chemin coupe un obstacle, elle prend celui par où l'Arche est passée
//!   (`Ark::trail`) : un convoi passe donc partout où l'Arche passe. L'Arche écarte ses remorques quand elle revient
//!   sur elles. Rien ne les pousse ; les autres unités les contournent.
//! - Remorque détruite : son amélioration est hors service (`in_service`) jusqu'à sa reconstruction, payée dans les
//!   réserves à portée, en CAR_REBUILD ticks, une à la fois. Ses tourelles à bord sont perdues avec elle.
//! - Arche embarquée (transport, anneaux) : ses remorques rentrent avec elle et ressortent derrière elle.

use crate::ameliorations::*;
use crate::data::*;
use crate::fixed::{dist, isqrt, TILE};
use crate::world::*;

/// Rangée à bord : elle ressort dès que l'Arche est posée.
pub const CAR_STOWED: u8 = 0;
/// Attelée.
pub const CAR_OUT: u8 = 1;
/// Détruite : à reconstruire (`timer` : ticks restants, 0 tant qu'elle n'est pas payée).
pub const CAR_LOST: u8 = 2;

/// remorque d'Arche détruite : [joueur, x, y, amélioration]
pub const EV_CAR_LOST: i32 = 73;
/// Reconstruction d'une remorque (ticks).
pub const CAR_REBUILD: u16 = 900;
/// Remorques d'un convoi, au plus (trois de pont, une de soutien).
pub const CARS_MAX: usize = 4;

/// Attelage de l'Arche : distance de son centre (1/256 de case), sans et avec un bloc de mobilité à l'arrière.
pub const HITCH: [i32; 2] = [390, 560];
/// Longueur du timon (de l'attelage au centre de la remorque), et de ce centre à l'attelage arrière.
pub const DRAWBAR: i32 = 260;
pub const CAR_BACK: i32 = 200;
/// Pas et longueur de la trace de l'Arche.
const TRAIL_STEP: i32 = 64;
const TRAIL_MAX: usize = 96;

#[derive(Clone, Copy, Default, Debug)]
pub struct ArkCar {
    /// amélioration qu'elle porte (indice dans MODS)
    pub m: u8,
    pub state: u8,
    pub timer: u16,
    /// unité attelée (NONE : aucune)
    pub unit: u32,
    /// points de vie à bord (‰)
    pub hp: u16,
}
crate::ser_struct!(ArkCar { m, state, timer, unit, hp });

/// Amélioration portée par une remorque, ou à bord.
#[inline]
pub fn is_car(kind: u16) -> bool {
    kind == U_ARK_CAR
}

/// Remorques que demandent les améliorations d'une Arche, de la plus proche à la plus lointaine (0 : fin).
pub fn wanted(mods: u64) -> [u8; CARS_MAX] {
    let mut v = [0u8; CARS_MAX];
    let mut n = 0;
    let deck = at(mods, SLOT_DECK);
    if deck != 0 {
        for _ in 0..if deck == M_TURRETS3 { 3 } else { 1 } {
            v[n] = deck;
            n += 1;
        }
    }
    let support = at(mods, SLOT_SUPPORT);
    if support != 0 {
        v[n] = support;
    }
    v
}

/// Deux paliers d'une même branche (la remorque reste, on change ce qu'elle porte).
fn same_branch(a: u8, b: u8) -> bool {
    let root = |mut k: u8| {
        while MODS[k as usize].base != 0 {
            k = MODS[k as usize].base;
        }
        k
    };
    root(a) == root(b)
}

/// L'amélioration de cet emplacement (pont, soutien) de l'Arche `s` est-elle en service ? Non si une de ses
/// remorques est détruite.
pub fn in_service(w: &World, s: usize, slot: u8) -> bool {
    ark_of(w, s).is_none_or(|i| w.arks[i].cars.iter().all(|c| c.state != CAR_LOST || MODS[c.m as usize].slot != slot))
}

/// Remorque qui porte la tourelle `k` (sur `n`) : son indice dans `Ark::cars`.
pub fn turret_car(k: usize, n: usize) -> usize {
    if n > 3 {
        k / 3
    } else {
        0
    }
}

/// Unité de la remorque `c` de l'Arche `i`, si elle est attelée.
pub fn car_unit(w: &World, i: usize, c: usize) -> Option<usize> {
    w.arks[i].cars.get(c).filter(|c| c.state == CAR_OUT).and_then(|c| w.unit(c.unit))
}

/// D'où sort, et où rentre, ce que porte la remorque `c` : elle, ou l'Arche tant qu'elle n'est pas attelée.
pub fn car_pos(w: &World, i: usize, s: usize, c: usize) -> (i32, i32) {
    let u = car_unit(w, i, c).unwrap_or(s);
    (w.units.x[u], w.units.y[u])
}

/// Chaque tick, pour l'Arche `s` (état `i`) : remorques attelées, détruites, reconstruites, puis leur place.
pub fn update(w: &mut World, i: usize, s: usize) {
    let mods = w.units.cold[s].mods;
    let want = wanted(mods);
    let n = want.iter().take_while(|&&m| m != 0).count();
    if n == 0 && w.arks[i].cars.is_empty() && w.arks[i].trail.is_empty() {
        return;
    }
    record_trail(w, i, s);
    // branche abandonnée : les remorques en trop disparaissent avec elle
    while w.arks[i].cars.len() > n {
        let c = w.arks[i].cars.pop().unwrap_or_default();
        drop_unit(w, c);
    }
    for (k, &m) in want.iter().enumerate().take(n) {
        match w.arks[i].cars.get(k).copied() {
            None => w.arks[i].cars.push(ArkCar { m, state: CAR_STOWED, timer: 0, unit: NONE, hp: 1000 }),
            Some(c) if c.m != m => {
                if same_branch(c.m, m) {
                    w.arks[i].cars[k].m = m;
                    if let Some(u) = w.unit(c.unit) {
                        w.units.cold[u].mods = carried(m);
                    }
                } else {
                    drop_unit(w, c);
                    w.arks[i].cars[k] = ArkCar { m, state: CAR_STOWED, timer: 0, unit: NONE, hp: 1000 };
                }
            }
            _ => {}
        }
    }
    let owner = w.units.owner[s];
    let (ax, ay) = (w.units.x[s], w.units.y[s]);
    let aboard = w.units.cold[s].carried_by != NONE;
    let mut rebuilding = w.arks[i].cars.iter().any(|c| c.state == CAR_LOST && c.timer > 0);
    for k in 0..n {
        let mut c = w.arks[i].cars[k];
        match c.state {
            CAR_OUT => match w.unit(c.unit) {
                None => {
                    c = ArkCar { m: c.m, state: CAR_LOST, timer: 0, unit: NONE, hp: 0 };
                    lose_turrets(w, i, s, k);
                    w.ev(EV_CAR_LOST, owner as i32, ax, ay, c.m as i32);
                }
                Some(u) if aboard => {
                    c.hp = (w.units.hp[u] as i64 * 1000 / w.max_hp(u).max(1) as i64).clamp(1, 1000) as u16;
                    crate::transhumants::vanish(w, u);
                    c.unit = NONE;
                    c.state = CAR_STOWED;
                }
                _ => {}
            },
            CAR_LOST => {
                if c.timer > 0 {
                    c.timer -= 1;
                    if c.timer == 0 {
                        c.state = CAR_STOWED;
                        c.hp = 1000;
                    }
                } else if !rebuilding && !aboard && w.tick.is_multiple_of(10) && pay(w, owner, ax, ay, udef(U_ARK_CAR).cost) {
                    rebuilding = true;
                    c.timer = CAR_REBUILD;
                }
            }
            _ => {
                if !aboard && w.players[owner as usize].unit_count < UNIT_CAP {
                    let (x, y) = start_place(w, i, s, k);
                    let id = w.spawn_unit(U_ARK_CAR, owner, x, y);
                    let u = slot_of(id);
                    w.units.hp[u] = ((w.max_hp(u) as i64 * c.hp as i64 / 1000) as i32).max(1);
                    w.units.facing[u] = w.units.facing[s];
                    w.units.cold[u].parent = w.arks[i].unit;
                    w.units.cold[u].mods = carried(c.m);
                    c.unit = id;
                    c.state = CAR_OUT;
                }
            }
        }
        w.arks[i].cars[k] = c;
    }
    if !aboard {
        follow(w, i, s);
    }
}

/// Ce que porte une remorque, rangé comme une amélioration installée (pour son modèle).
fn carried(m: u8) -> u64 {
    (m as u64) << (8 * MODS[m as usize].slot as u32)
}

fn drop_unit(w: &mut World, c: ArkCar) {
    if let Some(u) = w.unit(c.unit) {
        crate::transhumants::vanish(w, u);
    }
}

/// La remorque `c` est détruite : les tourelles qu'elle avait à bord sont perdues avec elle.
fn lose_turrets(w: &mut World, i: usize, s: usize, c: usize) {
    let n = turret_count(w.units.cold[s].mods);
    for k in 0..w.arks[i].turrets.len().min(n) {
        let t = &mut w.arks[i].turrets[k];
        if turret_car(k, n) == c && matches!(t.state, TU_ABOARD | TU_CONVERT) {
            *t = ArkTurret { kind: t.kind, want: t.want, state: TU_LOST, timer: 0, unit: NONE, hp: 0 };
        }
    }
}

/// Trace de l'Arche : un point tous les TRAIL_STEP, le plus récent à la fin ; effacée par un saut (porte, anneaux).
fn record_trail(w: &mut World, i: usize, s: usize) {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let t = &mut w.arks[i].trail;
    match t.last() {
        Some(&(lx, ly)) if dist(x, y, lx, ly) > 3 * TILE => t.clear(),
        Some(&(lx, ly)) if dist(x, y, lx, ly) < TRAIL_STEP => return,
        _ => {}
    }
    t.push((x, y));
    if t.len() > TRAIL_MAX {
        t.remove(0);
    }
}

/// Point de la trace à la distance `d` derrière l'Arche (None : la trace est trop courte).
fn on_trail(w: &World, i: usize, s: usize, d: i32) -> Option<(i32, i32)> {
    let (mut x, mut y) = (w.units.x[s], w.units.y[s]);
    let mut left = d;
    for &(tx, ty) in w.arks[i].trail.iter().rev() {
        let seg = dist(x, y, tx, ty);
        if seg >= left && seg > 0 {
            return Some((x + ((tx - x) as i64 * left as i64 / seg as i64) as i32, y + ((ty - y) as i64 * left as i64 / seg as i64) as i32));
        }
        left -= seg;
        x = tx;
        y = ty;
    }
    None
}

/// Distance du centre de l'Arche au centre de la remorque `k`, convoi tendu.
pub fn reach_back(mods: u64, k: usize) -> i32 {
    HITCH[(at(mods, SLOT_DRIVE) != 0) as usize] + DRAWBAR + k as i32 * (CAR_BACK + DRAWBAR)
}

/// Une remorque passe-t-elle en (x, y) ? (comme l'Arche : sur terre et sur l'eau)
fn pass_ok(w: &World, x: i32, y: i32) -> bool {
    x >= 0 && y >= 0 && x < w.map.w * TILE && y < w.map.h * TILE && w.map.passable(x / TILE, y / TILE, crate::units::pass_mask(udef(U_ARK_CAR).layer))
}

/// Où apparaît la remorque `k` : droit derrière l'Arche, sinon sur sa trace, sinon là où est l'Arche.
fn start_place(w: &World, i: usize, s: usize, k: usize) -> (i32, i32) {
    let d = reach_back(w.units.cold[s].mods, k);
    let a = w.units.facing[s].wrapping_add(32768);
    let (x, y) = (w.units.x[s] + (w.trig.cos(a) as i64 * d as i64 / 16384) as i32, w.units.y[s] + (w.trig.sin(a) as i64 * d as i64 / 16384) as i32);
    if pass_ok(w, x, y) {
        return (x, y);
    }
    on_trail(w, i, s, d).filter(|&(x, y)| pass_ok(w, x, y)).unwrap_or((w.units.x[s], w.units.y[s]))
}

/// Chaque remorque attelée prend sa place derrière le véhicule qui la précède.
fn follow(w: &mut World, i: usize, s: usize) {
    let mods = w.units.cold[s].mods;
    let (ax, ay) = (w.units.x[s], w.units.y[s]);
    let back = HITCH[(at(mods, SLOT_DRIVE) != 0) as usize] as i64;
    let f = w.units.facing[s];
    let (mut hx, mut hy) = (ax - (w.trig.cos(f) as i64 * back / 16384) as i32, ay - (w.trig.sin(f) as i64 * back / 16384) as i32);
    // l'Arche écarte une remorque qu'elle approche de trop près
    let clear = (ark_radius(mods) * 4 / 5 + udef(U_ARK_CAR).radius) as i64;
    for k in 0..w.arks[i].cars.len() {
        let Some(u) = car_unit(w, i, k) else { continue };
        let (cx, cy) = (w.units.x[u], w.units.y[u]);
        // timon : la remorque reste à DRAWBAR de l'attelage, dans la direction où elle est
        let (mut dx, mut dy) = ((cx - hx) as i64, (cy - hy) as i64);
        let mut d = isqrt((dx * dx + dy * dy) as u64) as i64;
        if d == 0 {
            let g = w.units.facing[u].wrapping_add(32768);
            (dx, dy) = (w.trig.cos(g) as i64, w.trig.sin(g) as i64);
            d = 16384;
        }
        let (mut nx, mut ny) = (hx + (dx * DRAWBAR as i64 / d) as i32, hy + (dy * DRAWBAR as i64 / d) as i32);
        let (ox, oy) = ((nx - ax) as i64, (ny - ay) as i64);
        let o = isqrt((ox * ox + oy * oy) as u64) as i64;
        if o < clear && o > 0 {
            nx = ax + (ox * clear / o) as i32;
            ny = ay + (oy * clear / o) as i32;
        }
        if !pass_ok(w, nx, ny) {
            // obstacle : elle passe par où l'Arche est passée, ou reste où elle est
            match on_trail(w, i, s, reach_back(mods, k)).filter(|&(x, y)| pass_ok(w, x, y)) {
                Some((tx, ty)) => {
                    let step = 96;
                    let (mx, my) = (cx + (tx - cx).clamp(-step, step), cy + (ty - cy).clamp(-step, step));
                    // trop loin de sa place (obstacle contourné) : elle la rejoint d'un coup
                    (nx, ny) = if pass_ok(w, mx, my) && dist(mx, my, tx, ty) < 4 * TILE { (mx, my) } else { (tx, ty) };
                }
                None => (nx, ny) = (cx, cy),
            }
        }
        w.units.x[u] = nx;
        w.units.y[u] = ny;
        let (fx, fy) = ((hx - nx) as i64, (hy - ny) as i64);
        if fx != 0 || fy != 0 {
            let want = w.trig.atan2(fy, fx);
            let turn = want.wrapping_sub(w.units.facing[u]) as i16 as i32;
            w.units.facing[u] = w.units.facing[u].wrapping_add(turn.clamp(-1600, 1600) as u16);
        }
        let g = w.units.facing[u];
        hx = nx - (w.trig.cos(g) as i64 * CAR_BACK as i64 / 16384) as i32;
        hy = ny - (w.trig.sin(g) as i64 * CAR_BACK as i64 / 16384) as i32;
    }
}

pub fn hash_into(a: &Ark, h: &mut crate::ser::Hasher) {
    for c in &a.cars {
        h.add(c.m as u64 | (c.state as u64) << 8 | (c.timer as u64) << 16 | (c.hp as u64) << 32);
    }
    if let Some(&(x, y)) = a.trail.first() {
        h.add((x as u32 as u64) | (y as u32 as u64) << 32);
        h.add(a.trail.len() as u64);
    }
}

/// Remorques de l'Arche (JSON) : [amélioration, état, ticks, PV ‰, unité].
pub fn info(w: &World, i: usize) -> String {
    let v: Vec<String> = w.arks[i]
        .cars
        .iter()
        .map(|c| {
            let u = w.unit(c.unit);
            let hp = u.map_or(c.hp as i64, |u| w.units.hp[u] as i64 * 1000 / w.max_hp(u).max(1) as i64);
            format!("[{},{},{},{},{}]", c.m, c.state, c.timer, hp, u.map_or(-1, |u| w.unit_id(u) as i64))
        })
        .collect();
    format!("[{}]", v.join(","))
}
