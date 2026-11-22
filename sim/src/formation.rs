//! Formation en file (Maj + clic droit, drapeau 8 de `O_MOVE`) : au premier point d'une file, le
//! groupe se range en rangées droites, tournées vers la direction du déplacement ; aux points
//! suivants, il garde cette disposition, tournée vers la direction du nouveau segment. L'allure
//! commune (vitesse du plus lent) vient de `orders::formation_etas` et `units::formation_pace`.

use crate::data::*;
use crate::fixed::{TILE, TRIG_ONE};
use crate::units::max_range;
use crate::world::*;

/// Drapeau de `O_MOVE` : formation en file, places calculées par la simulation.
pub const FLAG_QUEUED_FORMATION: i32 = 8;

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
        (Order::Move { x, y, gx, gy, eta, .. }, Order::Face { a }) if eta != 0 => Some((x, y, gx, gy, a as u16)),
        _ => None,
    }
}

/// Places d'une formation en file pour les unités `members` (une seule famille, par indice
/// croissant) vers le but (gx, gy). Renvoie la place de chacune, l'angle de la formation et vrai si
/// le groupe continue une formation en cours (sa disposition est gardée).
pub fn plan(w: &World, members: &[usize], gx: i32, gy: i32) -> (Vec<(i32, i32)>, u16, bool) {
    let n = members.len();
    if n == 0 {
        return (vec![], 0, false);
    }
    // suite d'une formation : tous les membres finissent leur file par la même formation
    let tails: Vec<_> = members.iter().map(|&s| formation_tail(w, s)).collect();
    if let Some(Some((_, _, g0x, g0y, a0))) = tails.first() {
        if tails.iter().all(|t| matches!(t, Some((_, _, x, y, a)) if (*x, *y, *a) == (*g0x, *g0y, *a0))) {
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
            return (slots, a1, true);
        }
    }
    if n == 1 {
        let s = members[0];
        let (sx, sy) = queue_end(w, s);
        let a = if (sx, sy) == (gx, gy) { w.units.facing[s] } else { w.trig.atan2((gy - sy) as i64, (gx - sx) as i64) };
        return (vec![(gx, gy)], a, false);
    }
    // nouvelle formation : rangées droites face à la direction du centre du groupe vers le but
    let starts: Vec<(i32, i32)> = members.iter().map(|&s| queue_end(w, s)).collect();
    let cx = (starts.iter().map(|p| p.0 as i64).sum::<i64>() / n as i64) as i32;
    let cy = (starts.iter().map(|p| p.1 as i64).sum::<i64>() / n as i64) as i32;
    let (dx, dy) = ((gx - cx) as i64, (gy - cy) as i64);
    let a = if dx * dx + dy * dy >= (2 * TILE as i64).pow(2) { w.trig.atan2(dy, dx) } else { w.units.facing[members[0]] };
    // devant : les unités armées de courte portée ; derrière : longue portée, puis les unités sans arme
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by_key(|&k| {
        let kind = w.units.kind[members[k]];
        let r = max_range(kind);
        (r == 0, r, udef(kind).radius, members[k])
    });
    // colonnes : environ deux fois plus large que profond, rangées équilibrées
    let mut cols = crate::fixed::isqrt(2 * n as u64) as usize;
    if cols * cols < 2 * n {
        cols += 1;
    }
    cols = cols.clamp(1, n);
    let rows = n.div_ceil(cols);
    let cols = n.div_ceil(rows);
    let mut slots = vec![(0, 0); n];
    let mut depth = 0i32; // avant de la rangée courante (vers l'arrière : négatif)
    let mut prev_r = 0i32;
    let mut row_f = Vec::with_capacity(rows);
    for (ri, chunk) in order.chunks(cols).enumerate() {
        let maxr = chunk.iter().map(|&k| udef(w.units.kind[members[k]]).radius).max().unwrap_or(TILE / 2);
        if ri > 0 {
            depth -= prev_r + maxr + GAP;
        }
        prev_r = maxr;
        row_f.push(depth);
        // dans la rangée, chacun garde son côté (gauche ou droite) pour ne pas croiser ses voisins
        let mut row: Vec<(i32, usize)> = chunk.iter().map(|&k| (to_local(w, starts[k].0 - cx, starts[k].1 - cy, a).1, k)).collect();
        row.sort_by_key(|&(r, k)| (r, members[k]));
        let step = 2 * maxr + GAP;
        let len = row.len() as i32;
        for (j, &(_, k)) in row.iter().enumerate() {
            let r = (2 * j as i32 - (len - 1)) * step / 2;
            slots[k] = (depth, r);
        }
    }
    // le but est au centre du bloc
    let mid = (row_f[0] + row_f[rows - 1]) / 2;
    let slots = slots
        .into_iter()
        .map(|(f, r)| {
            let (ox, oy) = to_world(w, f - mid, r, a);
            (gx + ox, gy + oy)
        })
        .collect();
    (slots, a, false)
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
