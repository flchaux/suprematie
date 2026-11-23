//! Formations calculées par la simulation (drapeau 8 de `O_MOVE`). Un groupe se range en rectangle, les
//! unités réparties par rôle de l'avant vers l'arrière (voir `rank`) :
//! - clic droit glissé (drapeaux 4 et 8) : rectangle tourné vers l'angle choisi ;
//! - Maj + clic droit (drapeaux 1 et 8) : au premier point d'une file, rectangle face au trajet ; aux
//!   points suivants, le groupe garde cette disposition, tournée vers la direction du nouveau segment.
//!
//! Allure : chacun va au plus à la vitesse du plus lent de sa famille (`paces`) ; le groupe ne ralentit
//! jamais davantage, sauf le pivot d'une disposition gardée. À chaque point, les
//! premiers arrivés attendent les autres à leur place (`hold`).

use crate::data::*;
use crate::fixed::{angle_diff, dist, turn_towards, TILE, TRIG_ONE};
use crate::units::{fixed_wing, max_range, turn_rate};
use crate::world::*;

/// Unité de `Order::Move::pace` : sous-unités par tick, en seizièmes.
const PACE: i64 = 16;
/// Attente au plus du reste du groupe à un point de la formation (ticks : 15 s).
pub const HOLD_TICKS: u16 = 300;
/// Période (ticks) à laquelle un groupe qui s'attend regarde si tout le monde est là.
const HOLD_CHECK: u32 = 4;
/// Une unité à moins de cette distance de sa place y est arrivée, pour ceux qui attendent.
const HOLD_NEAR: i32 = TILE / 2;
/// Écart d'orientation (16 bits) au plus pour repartir vers le point suivant.
const HOLD_ANGLE: i32 = 5000;

/// Drapeau de `O_MOVE` : formation dont les places sont calculées par la simulation.
pub const FLAG_PLANNED: i32 = 8;

/// Écart entre deux unités voisines d'une rangée, et entre deux rangées (en plus de leurs rayons).
const GAP: i32 = TILE / 2;

/// Famille d'une unité pour les formations : terrestre (dont glisseurs), navale, aérienne. Chaque
/// famille forme son propre bloc centré sur le but, et règle son allure sur sa plus lente.
pub fn family(kind: u16) -> u8 {
    match udef(kind).layer {
        Layer::Land | Layer::Hover => 0,
        Layer::Naval | Layer::Sub => 1,
        Layer::Air => 2,
    }
}

/// Portée (cases) d'une arme de corps à corps, au plus ; et d'un tireur, au moins.
const MELEE_RANGE: i32 = 4;
const SHOOTER_RANGE: i32 = 28;
/// Un tireur dont les points de vie dépassent ce nombre par case de portée est un sac à points de vie
/// (colosse, araignée, destroyer…) : il va devant.
const TANK_HP_PER_RANGE: i32 = 150;

/// Rang d'un type d'unité dans une formation (le plus petit devant) : rôle, puis départage dans le rôle.
/// - 0 : corps à corps, les plus résistants devant ;
/// - 1 : ligne (tir direct) et sacs à points de vie, les plus résistants devant ;
/// - 2 : porteurs de bouclier sans arme (leur bulle couvre la ligne et les tireurs) ;
/// - 3 : tireurs à longue portée et antiaériens, les plus longues portées derrière ;
/// - 4 : sans arme (constructeurs, chariots, transports…) ;
/// - 5 : unité de commandement (sa perte élimine le joueur).
pub fn rank(kind: u16) -> (u8, i32, i32) {
    let d = udef(kind);
    let range = max_range(kind);
    let tough = d.hp + d.shield_hp;
    let aa_only = d.layer != Layer::Air && range > 0 && d.weapons.iter().all(|&wi| WEAPONS[wi as usize].mask == M_AIR);
    if d.commander {
        (5, 0, 0)
    } else if range == 0 {
        if d.shield_hp > 0 { (2, 0, -tough) } else { (4, 0, -tough) }
    } else if range <= MELEE_RANGE {
        (0, 0, -tough)
    } else if aa_only || (range >= SHOOTER_RANGE && d.hp < TANK_HP_PER_RANGE * range) {
        (3, range, -tough)
    } else {
        (1, 0, -tough)
    }
}

/// Fin de la file de déplacements d'une unité : place du dernier `Move` en file, sinon sa position.
pub fn queue_end(w: &World, s: usize) -> (i32, i32) {
    w.units.cold[s].orders.iter().rev().find_map(|o| if let Order::Move { x, y, .. } = *o { Some((x, y)) } else { None }).unwrap_or((w.units.x[s], w.units.y[s]))
}

/// Formation en cours : la file finit par `[Move en formation, Face]`. Renvoie (place, but du
/// groupe, angle de la formation).
fn formation_tail(w: &World, s: usize) -> Option<(i32, i32, i32, i32, u16)> {
    let o = &w.units.cold[s].orders;
    let n = o.len();
    if n < 2 {
        return None;
    }
    match (o[n - 2], o[n - 1]) {
        (Order::Move { x, y, gx, gy, pace, .. }, Order::Face { a }) if pace != 0 => Some((x, y, gx, gy, a as u16)),
        _ => None,
    }
}

/// Formation calculée pour une famille d'unités.
pub struct Plan {
    /// place de chaque membre, dans l'ordre donné
    pub slots: Vec<(i32, i32)>,
    /// angle de la formation (orientation à l'arrivée)
    pub angle: u16,
    /// le groupe prolonge une formation en file : il passe le point précédent sans s'arrêter
    pub cont: bool,
    /// il garde aussi sa disposition (déplacée ou tournée) d'un point à l'autre
    pub keep: bool,
}

/// Places d'une formation pour les unités `members` (une seule famille, par indice croissant) vers le
/// but (gx, gy). `face` : angle choisi (clic droit glissé) ; sinon face au trajet, en gardant la
/// disposition d'une formation en cours. `queue` : le déplacement part de la fin des files d'ordres.
pub fn plan(w: &World, members: &[usize], gx: i32, gy: i32, face: Option<u16>, queue: bool) -> Plan {
    let n = members.len();
    if n == 0 {
        return Plan { slots: vec![], angle: face.unwrap_or(0), cont: false, keep: false };
    }
    // suite d'une formation : tous les membres finissent leur file par la même formation
    let tails: Vec<_> = members.iter().map(|&s| if queue { formation_tail(w, s) } else { None }).collect();
    let mut cont = false;
    if let Some(Some((_, _, g0x, g0y, a0))) = tails.first() {
        cont = tails.iter().all(|t| matches!(t, Some((_, _, x, y, a)) if (*x, *y, *a) == (*g0x, *g0y, *a0)));
        if cont && face.is_none() {
            let (dx, dy) = (gx - g0x, gy - g0y);
            let a1 = if (dx as i64).pow(2) + (dy as i64).pow(2) >= (TILE as i64).pow(2) { w.trig.atan2(dy as i64, dx as i64) } else { *a0 };
            let slots = tails
                .iter()
                .map(|t| {
                    let (x, y, ..) = t.unwrap();
                    if a1 == *a0 {
                        return (x + dx, y + dy);
                    }
                    let (f, r) = to_local(w, x - g0x, y - g0y, *a0);
                    let (ox, oy) = to_world(w, f, r, a1);
                    (gx + ox, gy + oy)
                })
                .collect();
            return Plan { slots, angle: a1, cont, keep: true };
        }
    }
    let starts: Vec<(i32, i32)> = members.iter().map(|&s| if queue { queue_end(w, s) } else { (w.units.x[s], w.units.y[s]) }).collect();
    let cx = (starts.iter().map(|p| p.0 as i64).sum::<i64>() / n as i64) as i32;
    let cy = (starts.iter().map(|p| p.1 as i64).sum::<i64>() / n as i64) as i32;
    let (dx, dy) = ((gx - cx) as i64, (gy - cy) as i64);
    // sans angle choisi : de la position d'une unité seule, ou du centre du groupe, vers le but
    let near = if n == 1 { 1 } else { (2 * TILE as i64).pow(2) };
    let a = match face {
        Some(a) => a,
        None if dx * dx + dy * dy >= near => w.trig.atan2(dy, dx),
        None => w.units.facing[members[0]],
    };
    if n == 1 {
        return Plan { slots: vec![(gx, gy)], angle: a, cont, keep: false };
    }
    let slots = rectangle(w, members, &starts, (cx, cy), a)
        .into_iter()
        .map(|(f, r)| {
            let (ox, oy) = to_world(w, f, r, a);
            (gx + ox, gy + oy)
        })
        .collect();
    Plan { slots, angle: a, cont, keep: false }
}

/// Allure d'un déplacement en formation, par unité de `list` (indice, place) : seizièmes de sous-unité par
/// tick (`Order::Move::pace`, 0 : pas d'allure imposée). Chaque famille va à la vitesse de sa plus lente ;
/// une unité seule de sa famille et les avions à voilure fixe gardent leur vitesse. `keep` : le groupe
/// garde sa disposition depuis la fin des files ; dans un tournant, l'intérieur du bloc a moins de chemin
/// et ralentit d'autant, l'extérieur va à la vitesse du plus lent.
pub fn paces(w: &World, list: &[(usize, i32, i32)], keep: bool) -> Vec<u16> {
    let mut out = vec![0; list.len()];
    for fam in 0..3 {
        let members: Vec<usize> = (0..list.len()).filter(|&k| family(w.units.kind[list[k].0]) == fam && !fixed_wing(w.units.kind[list[k].0])).collect();
        if members.len() < 2 {
            continue;
        }
        let vmin = members.iter().map(|&k| crate::ameliorations::speed(w, list[k].0)).min().unwrap_or(1).max(1) as i64;
        let way = |k: usize| {
            let (s, tx, ty) = list[k];
            let (sx, sy) = queue_end(w, s);
            dist(sx, sy, tx, ty) as i64
        };
        let far = members.iter().map(|&k| way(k)).max().unwrap_or(0).max(1);
        for &k in &members {
            let p = if keep { (vmin * PACE * way(k) + far - 1) / far } else { vmin * PACE };
            out[k] = p.clamp(1, u16::MAX as i64 - 1) as u16;
        }
    }
    out
}

/// Vitesse (sous-unités) permise à ce tick par une allure en seizièmes.
pub fn pace_speed(w: &World, pace: u16) -> i32 {
    if pace == 0 || pace == u16::MAX {
        return i32::MAX;
    }
    let (p, t) = (pace as i64, w.tick as i64);
    ((t + 1) * p / PACE - t * p / PACE) as i32
}

/// Direction à prendre depuis la place d'une unité en formation : vers le point suivant de sa file, ou
/// orientation finale.
fn next_heading(w: &World, s: usize) -> Option<u16> {
    let o = &w.units.cold[s].orders;
    match (o.first(), o.get(1)) {
        (Some(&Order::Move { x: x0, y: y0, .. }), Some(&Order::Move { x, y, .. })) if (x, y) != (x0, y0) => Some(w.trig.atan2((y - y0) as i64, (x - x0) as i64)),
        (_, Some(&Order::Face { a })) => Some(a as u16),
        _ => None,
    }
}

/// Unité arrivée à un point d'une formation : elle attend à sa place que tout le groupe y soit (au plus
/// `HOLD_TICKS`), puis le groupe se tourne ou repart vers le point suivant en rangs. Poussée par un
/// retardataire qui passe, elle revient à sa place. Le groupe : nos unités de la même famille en formation
/// vers le même but.
pub fn hold(w: &mut World, s: usize) -> bool {
    let Some(&Order::Move { x, y, gx, gy, pace, wait, .. }) = w.units.cold[s].orders.first() else { return false };
    if pace == 0 || wait == 0 {
        return false;
    }
    let there = dist(w.units.x[s], w.units.y[s], x, y) <= HOLD_NEAR;
    let c = &mut w.units.cold[s];
    if there {
        c.noprog = 0;
        c.best_dist = i32::MAX;
    }
    if let Some(Order::Move { wait, .. }) = c.orders.first_mut() {
        *wait -= 1;
    }
    // en attendant, elle se tourne vers le point suivant (ou l'orientation finale)
    if let (true, Some(a)) = (there, next_heading(w, s)) {
        w.units.facing[s] = turn_towards(w.units.facing[s], a, turn_rate(w.units.kind[s]));
    }
    // tout le groupe regarde au même tick, pour repartir ensemble
    if !w.tick.is_multiple_of(HOLD_CHECK) {
        return true;
    }
    let (o, fam) = (w.units.owner[s], family(w.units.kind[s]));
    (0..w.units.alive.len()).any(|u| {
        if !w.units.alive[u] || w.units.owner[u] != o || family(w.units.kind[u]) != fam {
            return false;
        }
        let c = &w.units.cold[u];
        match c.orders.first() {
            Some(&Order::Move { x, y, gx: ax, gy: ay, pace, .. }) if pace != 0 && (ax, ay) == (gx, gy) => {
                let late = dist(w.units.x[u], w.units.y[u], x, y) > HOLD_NEAR;
                c.noprog <= 100 && c.stuck <= 60 && (late || (matches!(c.orders.get(1), Some(Order::Move { .. })) && next_heading(w, u).is_some_and(|a| angle_diff(w.units.facing[u], a).abs() > HOLD_ANGLE)))
            }
            _ => false,
        }
    })
}

/// Rectangle d'angle `a`, environ deux fois plus large que profond, centré sur (0, 0) : place (avant,
/// côté) de chaque membre. Les rangées se remplissent de l'avant vers l'arrière dans l'ordre des rôles
/// (`rank`) ; à type égal, ceux qui sont déjà devant y restent. Dans une rangée, chacun garde son côté
/// pour ne pas croiser ses voisins.
fn rectangle(w: &World, members: &[usize], starts: &[(i32, i32)], c: (i32, i32), a: u16) -> Vec<(i32, i32)> {
    let n = members.len();
    let local: Vec<(i32, i32)> = starts.iter().map(|p| to_local(w, p.0 - c.0, p.1 - c.1, a)).collect();
    let diam: Vec<i32> = members.iter().map(|&s| 2 * udef(w.units.kind[s]).radius).collect();
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by_cached_key(|&k| {
        let kind = w.units.kind[members[k]];
        (rank(kind), kind, -local[k].0, members[k])
    });
    // largeur visée : deux fois la profondeur, arrondie à l'unité au-dessus (moyenne des tailles)
    let area: i64 = diam.iter().map(|&d| ((d + GAP) as i64).pow(2)).sum();
    let cell = (diam.iter().map(|&d| (d + GAP) as i64).sum::<i64>() / n as i64).max(1);
    let want = crate::fixed::isqrt(2 * area as u64) as i64;
    let widest = diam.iter().copied().max().unwrap_or(0) as i64;
    let target = ((want + cell - 1) / cell * cell - GAP as i64).max(widest);
    let rows = split_rows(&order, &diam, target).len();
    // plus petite largeur qui donne autant de rangées : rangées équilibrées
    let (mut lo, mut hi) = (widest, target);
    while lo < hi {
        let mid = (lo + hi) / 2;
        if split_rows(&order, &diam, mid).len() <= rows {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    let rows = split_rows(&order, &diam, lo);
    let natural = |row: &[usize]| row.iter().map(|&k| diam[k]).sum::<i32>() + GAP * (row.len() as i32 - 1);
    let width = rows.iter().map(|r| natural(r)).max().unwrap_or(0);
    let mut slots = vec![(0, 0); n];
    let mut row_f = Vec::with_capacity(rows.len());
    let mut depth = 0i32; // rangée courante (vers l'arrière : négatif)
    let mut prev_r = 0i32;
    for (ri, chunk) in rows.iter().enumerate() {
        let maxr = chunk.iter().map(|&k| diam[k] / 2).max().unwrap_or(TILE / 2);
        if ri > 0 {
            depth -= prev_r + maxr + GAP;
        }
        prev_r = maxr;
        row_f.push(depth);
        let mut row: Vec<usize> = chunk.to_vec();
        row.sort_by_key(|&k| (local[k].1, members[k]));
        // chaque rangée occupe toute la largeur, sauf la dernière si elle est trop courte (elle est centrée)
        let nat = natural(&row);
        let spread = if ri + 1 < rows.len() || 3 * nat >= 2 * width { width - nat } else { 0 };
        let m = row.len() as i32;
        let mut edge = -(nat + if m > 1 { spread } else { 0 }) / 2;
        for (j, &k) in row.iter().enumerate() {
            let extra = if m > 1 { spread * j as i32 / (m - 1) } else { 0 };
            slots[k] = (depth, edge + extra + diam[k] / 2);
            edge += diam[k] + GAP;
        }
    }
    let mid = (row_f[0] + row_f[rows.len() - 1]) / 2;
    slots.into_iter().map(|(f, r)| (f - mid, r)).collect()
}

/// Découpe `order` en rangées d'au plus `width` sous-unités de large.
fn split_rows<'a>(order: &'a [usize], diam: &[i32], width: i64) -> Vec<&'a [usize]> {
    let mut out = vec![];
    let (mut i, mut used) = (0, 0i64);
    for (j, &k) in order.iter().enumerate() {
        let d = diam[k] as i64;
        if j > i && used + GAP as i64 + d > width {
            out.push(&order[i..j]);
            i = j;
            used = d;
        } else {
            used += if j > i { GAP as i64 + d } else { d };
        }
    }
    out.push(&order[i..]);
    out
}

/// Écart (dx, dy) exprimé dans le repère d'une formation d'angle `a` : (avant, côté).
fn to_local(w: &World, dx: i32, dy: i32, a: u16) -> (i32, i32) {
    let (c, s) = (w.trig.cos(a) as i64, w.trig.sin(a) as i64);
    let (dx, dy) = (dx as i64, dy as i64);
    (((dx * c + dy * s) / TRIG_ONE as i64) as i32, ((dy * c - dx * s) / TRIG_ONE as i64) as i32)
}

/// Inverse de `to_local` : (avant, côté) dans une formation d'angle `a` vers un écart (dx, dy).
fn to_world(w: &World, f: i32, r: i32, a: u16) -> (i32, i32) {
    let (c, s) = (w.trig.cos(a) as i64, w.trig.sin(a) as i64);
    let (f, r) = (f as i64, r as i64);
    (((f * c - r * s) / TRIG_ONE as i64) as i32, ((f * s + r * c) / TRIG_ONE as i64) as i32)
}

/// Enlève l'orientation finale (`Face`) d'une formation qu'on prolonge : le groupe passe le point
/// sans s'arrêter pour se tourner.
pub fn drop_tail_face(w: &mut World, s: usize) {
    if let Some(Order::Face { .. }) = w.units.cold[s].orders.last() {
        if w.units.cold[s].orders.len() >= 2 {
            w.units.cold[s].orders.pop();
        }
    }
}
