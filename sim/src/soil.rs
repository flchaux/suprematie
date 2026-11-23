//! Sol de la Souche (voir docs/spec/races.md, « Herbe mangée »).
//!
//! - Herbe : tout sol à terre, sans falaise ni bâtiment, qui n'est le terreau de personne. Les frondaisons et
//!   les racines-puits la mangent case par case, tout doucement, et en font du terreau. C'est l'herbe mangée qui
//!   donne la sève (ou les sels) : une case rapporte toujours la même chose, mais prend d'autant plus de temps
//!   qu'elle est loin (`bite_ticks`, le carré de la distance).
//! - Frondaison : portée illimitée (REACH_MAX cases). Elle mange au bord du terreau de son joueur, l'herbe la plus
//!   proche d'abord, dans une couronne de RING cases (`Building::ammo` : sa distance). L'herbe recule à mesure, sa
//!   production décroît donc avec le temps, sans jamais s'arrêter tout à fait (`SPENT_PCT` au moins).
//! - Racine-puits : elle ne sort pas de son périmètre (TAPROOT_R) ; l'herbe finie, elle est épuisée (`SPENT_PCT`).
//! - Concurrence : une case convoitée par k organes (`World::eaters`) ne compte que pour 1/k dans l'appétit de
//!   chacun (`Meal::share`) : deux frondaisons au même endroit ne produisent pas plus qu'une seule.
//! - Sol mangé (`World::soil`) : un octet par case, 0 ou joueur + 1. C'est du terreau pour toujours, même si
//!   le réseau meurt : l'herbe ne repousse pas. À portée d'un poteau (REACH cases), on y pose des organes, les
//!   organismes y guérissent et les cadavres y sont digérés, pour le réseau du poteau le plus proche.
//! - Terreau par case (`World::terreau`) : un bit par joueur, zones des poteaux poussés et sol mangé. Dérivé
//!   (pas sauvegardé), tenu à jour à chaque poteau qui pousse ou meurt et à chaque case mangée ; calculé en
//!   entier au premier tick (`ensure`). Son contenu ne dépend que de l'état : une partie relue a le même.

use crate::data::*;
use crate::fixed::TILE;
use crate::souche::MAX_SUPPLY;
use crate::world::*;

/// Racine-puits : périmètre (rayon en cases, depuis le centre) où elle mange l'herbe.
pub const TAPROOT_R: i32 = 9;
/// Frondaison : largeur (cases) de la couronne où elle mange, et distance au-delà de laquelle elle ne cherche plus.
pub const RING: i32 = 4;
pub const REACH_MAX: i32 = 120;
/// Temps pour manger une case (ticks) : BITE_BASE, plus BITE_FAR par demi-case de distance au centre, au carré
/// (10 s plus 0,4 s par case au carré : 16 s à 4 cases, 20 s à 5, 50 s à 10, 1 min 40 à 15, 2 min 50 à 20).
pub const BITE_BASE: u32 = 200;
pub const BITE_FAR: u32 = 2;
/// Temps d'une case pour lequel un organe seul donne sa production nominale (ticks).
pub const LEAVES_NOMINAL: u32 = 400;
pub const TAPROOT_NOMINAL: u32 = 450;
/// Production d'un organe sans herbe, et plancher d'une frondaison (% de sa production normale).
pub const SPENT_PCT: i32 = 5;
/// Frondaison à bout : signalée sous LOW ‰ de sa production nominale, jusqu'à ce qu'elle remonte au-dessus de FINE.
pub const LOW: i32 = 200;
pub const FINE: i32 = 350;
/// Portée (cases) du poteau le plus proche pour que le sol mangé serve de terreau (pose, réseau, guérison).
pub const REACH: i32 = 14;
/// Événements : case mangée [x, y, type de l'organe, joueur] ; organe épuisé ou à bout [x, y, type, joueur].
pub const EV_GRAZE: i32 = 58;
pub const EV_SPENT: i32 = 59;

/// Organe qui mange l'herbe.
#[inline]
pub fn eats(kind: u16) -> bool {
    matches!(kind, B_LEAVES | B_TAPROOT)
}

/// Couronne (rayons intérieur et extérieur, en cases) où un organe mange ; `rin` : distance de son herbe.
#[inline]
fn ring_of(kind: u16, rin: i32) -> (i32, i32) {
    if kind == B_TAPROOT {
        (0, TAPROOT_R)
    } else {
        (rin, rin + RING)
    }
}

/// Temps (ticks) pour manger seul une case à la distance² `d2` (demi-cases) du centre de l'organe.
#[inline]
pub fn bite_ticks(d2: i32) -> u32 {
    BITE_BASE + BITE_FAR * d2.max(0) as u32
}

/// Temps d'une case pour la production nominale.
#[inline]
pub fn nominal(kind: u16) -> u32 {
    if kind == B_TAPROOT {
        TAPROOT_NOMINAL
    } else {
        LEAVES_NOMINAL
    }
}

// ---------- Terreau par case ----------

/// Calcule le terreau par case s'il ne l'est pas encore (première utilisation, partie relue).
pub fn ensure(w: &mut World) {
    if !w.players.iter().any(|p| p.race == RACE_SOUCHE) {
        w.terreau.clear();
        w.eaters.clear();
        return;
    }
    let size = (w.map.w * w.map.h) as usize;
    if w.terreau.len() == size && w.eaters.len() == size {
        return;
    }
    w.terreau.clear();
    w.terreau.resize(size, 0);
    w.eaters.clear();
    w.eaters.resize(size, 0);
    for (i, &o) in w.soil.iter().enumerate() {
        if o != 0 && o <= 8 {
            w.terreau[i] |= 1 << (o - 1);
        }
    }
    for b in 0..w.buildings.len() {
        if is_pole(&w.buildings[b]) {
            stamp(w, b, (0, 0, i32::MAX, i32::MAX));
        }
        if is_eater(&w.buildings[b]) {
            count_eater(w, b, true);
        }
    }
}

/// Organe poussé qui mange l'herbe.
#[inline]
fn is_eater(bb: &Building) -> bool {
    bb.alive && bb.complete() && eats(bb.kind)
}

/// Compte (ou décompte) l'organe `b` dans les cases de sa couronne.
fn count_eater(w: &mut World, b: usize, add: bool) {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let area = (bb.x, bb.y, bw, bh);
    let (rin, rout) = ring_of(bb.kind, bb.ammo as i32);
    let mut eaters = std::mem::take(&mut w.eaters);
    ring(w, area, rin, rout, |i, _, _, _| {
        let v = &mut eaters[i];
        *v = if add { v.saturating_add(1) } else { v.saturating_sub(1) };
        true
    });
    w.eaters = eaters;
}

/// Un organe qui mange l'herbe vient de pousser, ou de disparaître.
pub fn eater_added(w: &mut World, b: usize) {
    if !w.eaters.is_empty() && is_eater(&w.buildings[b]) {
        count_eater(w, b, true);
    }
}
pub fn eater_removed(w: &mut World, b: usize) {
    if !w.eaters.is_empty() && w.buildings[b].complete() && eats(w.buildings[b].kind) {
        count_eater(w, b, false);
    }
}

/// L'herbe de la frondaison `b` est maintenant à `r` cases : sa couronne change.
fn set_ring(w: &mut World, b: usize, r: i32) {
    let r = r.clamp(0, REACH_MAX) as u16;
    if w.buildings[b].ammo == r {
        return;
    }
    eater_removed(w, b);
    w.buildings[b].ammo = r;
    eater_added(w, b);
}

/// Poteau poussé de la Souche (racine, rhizome, graine-mère).
#[inline]
fn is_pole(bb: &Building) -> bool {
    bb.alive && bb.complete() && bb.def().race == RACE_SOUCHE && bb.def().supply > 0 && bb.owner < 8
}

/// Zone (cases, bornes exclues à droite) d'un poteau.
fn zone(bb: &Building) -> (i32, i32, i32, i32) {
    let (bw, bh) = bb.size();
    let sp = bb.def().supply;
    (bb.x - sp, bb.y - sp, bb.x + bw + sp, bb.y + bh + sp)
}

/// Marque la zone du poteau `b`, dans le rectangle `clip`.
fn stamp(w: &mut World, b: usize, clip: (i32, i32, i32, i32)) {
    let bit = 1u8 << w.buildings[b].owner;
    let z = zone(&w.buildings[b]);
    let (mw, mh) = (w.map.w, w.map.h);
    let (x0, x1) = (z.0.max(clip.0).max(0), z.2.min(clip.2).min(mw));
    let (y0, y1) = (z.1.max(clip.1).max(0), z.3.min(clip.3).min(mh));
    if x0 >= x1 {
        return;
    }
    for y in y0..y1 {
        let row = (y * mw) as usize;
        for v in &mut w.terreau[row + x0 as usize..row + x1 as usize] {
            *v |= bit;
        }
    }
}

/// Un poteau vient de pousser.
pub fn pole_added(w: &mut World, b: usize) {
    if !w.terreau.is_empty() && is_pole(&w.buildings[b]) {
        stamp(w, b, (0, 0, i32::MAX, i32::MAX));
    }
}

/// Un poteau vient de disparaître (déjà retiré de la grille) : son rectangle est refait d'après ce qui reste.
pub fn pole_removed(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    if w.terreau.is_empty() || !bb.complete() || bb.owner >= 8 {
        return;
    }
    let owner = bb.owner;
    let z = zone(bb);
    let bit = 1u8 << owner;
    let (mw, mh) = (w.map.w, w.map.h);
    let clip = (z.0.max(0), z.1.max(0), z.2.min(mw), z.3.min(mh));
    for y in clip.1..clip.3 {
        for x in clip.0..clip.2 {
            let i = (y * mw + x) as usize;
            let mine = w.soil.get(i).is_some_and(|&o| o == owner + 1);
            if !mine {
                w.terreau[i] &= !bit;
            }
        }
    }
    let (cx, cy) = ((z.0 + z.2) * TILE / 2, (z.1 + z.3) * TILE / 2);
    let r = ((z.2 - z.0).max(z.3 - z.1) / 2 + MAX_SUPPLY + 4) * TILE;
    let mut near: Vec<usize> = Vec::new();
    w.grid.query_buildings(cx, cy, r, |p| {
        if p != b && w.buildings[p].owner == owner && is_pole(&w.buildings[p]) {
            near.push(p);
        }
    });
    near.sort_unstable();
    near.dedup();
    for p in near {
        stamp(w, p, clip);
    }
}

// ---------- Herbe ----------

/// Case d'herbe : à terre, sans falaise ni bâtiment, terreau de personne.
#[inline]
fn grass(w: &World, i: usize) -> bool {
    w.terreau.get(i) == Some(&0) && w.map.occ[i] == 0 && w.map.cliff[i] == 0 && w.map.height[i] >= w.map.water_level
}

/// Case d'herbe au bord du terreau du joueur (un de ses quatre côtés en est) : une frondaison ne mange que là.
#[inline]
fn edge(w: &World, i: usize, tx: i32, ty: i32, owner: u8) -> bool {
    if !grass(w, i) || owner >= 8 {
        return false;
    }
    let bit = 1u8 << owner;
    let mw = w.map.w as usize;
    (tx > 0 && w.terreau[i - 1] & bit != 0) || (tx + 1 < w.map.w && w.terreau[i + 1] & bit != 0) || (ty > 0 && w.terreau[i - mw] & bit != 0) || (ty + 1 < w.map.h && w.terreau[i + mw] & bit != 0)
}

/// Cases d'une couronne (rayons en cases) autour du centre de l'emprise : (indice, x, y, distance² en demi-cases).
/// `f` renvoie faux pour s'arrêter.
fn ring(w: &World, (x, y, bw, bh): (i32, i32, i32, i32), rin: i32, rout: i32, mut f: impl FnMut(usize, i32, i32, i32) -> bool) {
    let (cx2, cy2) = (2 * x + bw, 2 * y + bh);
    let lo = if rin > 0 { (2 * rin - 1) * (2 * rin - 1) } else { 0 };
    let hi = (2 * rout + 1) * (2 * rout + 1);
    let root = |v: i32| crate::fixed::isqrt(v.max(0) as u64) as i32;
    let (mw, mh) = (w.map.w, w.map.h);
    for ty in (y - rout - 1).max(0)..(y + bh + rout + 1).min(mh) {
        let dy = 2 * ty + 1 - cy2;
        let dy2 = dy * dy;
        if dy2 > hi {
            continue;
        }
        // cases dont le centre est à moins de wo demi-cases, hors de celles à moins de wi
        let wo = root(hi - dy2);
        let (x0, x1) = ((cx2 - wo).div_euclid(2), (cx2 - 1 + wo).div_euclid(2));
        let (a1, b0) = if dy2 < lo {
            let wi = root(lo - dy2 - 1) + 1;
            ((cx2 - 1 - wi).div_euclid(2), (cx2 + wi).div_euclid(2))
        } else {
            (x1, x1 + 1)
        };
        for (p, q) in [(x0, a1.min(x1)), (b0.max(x0), x1)] {
            for tx in p.max(0)..=q.min(mw - 1) {
                let dx = 2 * tx + 1 - cx2;
                let d2 = dx * dx + dy2;
                if d2 >= lo && d2 <= hi && !f((ty * mw + tx) as usize, tx, ty, d2) {
                    return;
                }
            }
        }
    }
}

/// Cases d'herbe du périmètre d'une racine-puits posée là.
pub fn grass_left(w: &World, x: i32, y: i32, bw: i32, bh: i32) -> i32 {
    let mut n = 0;
    ring(w, (x, y, bw, bh), 0, TAPROOT_R, |i, _, _, _| {
        n += grass(w, i) as i32;
        true
    });
    n
}

/// Cases de ce périmètre qui pourraient être de l'herbe (à terre, sans falaise), mangées ou non.
fn ground_total(w: &World, x: i32, y: i32, bw: i32, bh: i32) -> i32 {
    let mut n = 0;
    ring(w, (x, y, bw, bh), 0, TAPROOT_R, |i, tx, ty, _| {
        let under = tx >= x && tx < x + bw && ty >= y && ty < y + bh;
        n += (!under && w.map.cliff[i] == 0 && w.map.height[i] >= w.map.water_level) as i32;
        true
    });
    n
}

/// Ce qu'un organe a à manger dans sa couronne : cases, part qui lui en revient (‰ : 1000 s'il est seul à les
/// convoiter), temps de la case qu'il mange (ticks, seul), temps de tout manger seul (ticks), distance² de la plus
/// proche (demi-cases), et la case mangée.
#[derive(Clone, Copy, Default)]
pub struct Meal {
    pub left: u32,
    pub share: u32,
    pub ticks: u32,
    pub all: u32,
    pub near: i32,
    cell: Option<(usize, i32, i32)>,
}

/// Emprise d'un organe : (x, y, largeur, hauteur).
type Area = (i32, i32, i32, i32);

/// Repas d'un organe de type `kind` dans la couronne donnée ; `extra` : 1 pour un organe pas encore compté dans les
/// cases (aperçu de pose : son emprise n'est pas mangée). La case mangée est la plus proche, à un tirage près (bord
/// irrégulier).
pub fn meal(w: &World, kind: u16, owner: u8, area: Area, (rin, rout): (i32, i32), extra: u32) -> Meal {
    let mut m = Meal { near: i32::MAX, ..Meal::default() };
    let (mut best, mut shares) = (i32::MAX, 0u32);
    let (x, y, bw, bh) = area;
    if w.terreau.is_empty() {
        return m;
    }
    let leaves = kind == B_LEAVES;
    ring(w, area, rin, rout, |i, tx, ty, d2| {
        let ok = if leaves { edge(w, i, tx, ty, owner) } else { grass(w, i) };
        if ok && !(extra > 0 && tx >= x && tx < x + bw && ty >= y && ty < y + bh) {
            m.left += 1;
            m.all += bite_ticks(d2);
            m.near = m.near.min(d2);
            shares += 1000 / (w.eaters.get(i).copied().unwrap_or(0) as u32 + extra).max(1);
            let k = d2 + (crate::rng::hash3(tx, ty, 0x6A_55) % 40) as i32;
            if k < best {
                best = k;
                m.ticks = bite_ticks(d2);
                m.cell = Some((i, tx, ty));
            }
        }
        true
    });
    m.share = shares.checked_div(m.left).unwrap_or(0);
    m
}

/// Distance (cases) du bord de terreau à manger le plus proche, cherchée de `from` à `to` cases.
fn seek(w: &World, owner: u8, area: Area, from: i32, to: i32, extra: u32) -> Option<i32> {
    let mut r = from;
    while r <= to {
        let m = meal(w, B_LEAVES, owner, area, (r, (r + RING).min(to.max(r))), extra);
        if m.left > 0 {
            return Some(crate::fixed::isqrt(m.near as u64) as i32 / 2);
        }
        r += RING;
    }
    None
}

/// Production (‰ de la nominale) d'un organe qui a ce repas.
pub fn yield_of(kind: u16, m: &Meal) -> i32 {
    let y = if m.left == 0 { 0 } else { (nominal(kind) * m.share / m.ticks.max(1)) as i32 };
    if m.left == 0 || kind == B_LEAVES {
        y.max(SPENT_PCT * 10)
    } else {
        y
    }
}

/// Organe de la Souche, une fois par passage (souche::tick_organ) : il mange l'herbe. Son rendement (‰ de la
/// production nominale) est gardé dans `timer`, l'avancement de la case (millièmes de tick) dans `charge`, la
/// distance de son herbe (frondaison) dans `ammo`. Épuisé ou à bout : `stalled`.
pub fn graze(w: &mut World, b: usize) {
    let kind = w.buildings[b].kind;
    if !eats(kind) || w.buildings[b].net == 0 {
        return;
    }
    ensure(w);
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let (owner, area) = (bb.owner, (bb.x, bb.y, bw, bh));
    let leaves = kind == B_LEAVES;
    // de l'herbe revenue plus près (racine morte) : regardée toutes les 30 s
    let rin = bb.ammo as i32;
    if leaves && rin > 0 && (w.tick / crate::souche::ORGAN_PERIOD + b as u32).is_multiple_of(30) {
        if let Some(r) = seek(w, owner, area, 0, rin - 1, 0) {
            set_ring(w, b, r);
        }
    }
    let mut m = meal(w, kind, owner, area, ring_of(kind, w.buildings[b].ammo as i32), 0);
    if leaves {
        let rin = w.buildings[b].ammo as i32;
        let r = if m.left > 0 {
            Some(crate::fixed::isqrt(m.near as u64) as i32 / 2)
        } else if rin < REACH_MAX {
            Some(seek(w, owner, area, rin, REACH_MAX, 0).unwrap_or(REACH_MAX))
        } else {
            None
        };
        if let Some(r) = r.filter(|&r| r != rin) {
            set_ring(w, b, r);
            m = meal(w, kind, owner, area, ring_of(kind, r), 0);
        }
    }
    let y = yield_of(kind, &m);
    let was = w.buildings[b].stalled;
    let spent = if leaves { y < LOW || (was && y < FINE) } else { m.left == 0 };
    let bb = &mut w.buildings[b];
    bb.stalled = spent;
    bb.timer = y as u16;
    if spent && !was {
        let (cx, cy) = bb.center();
        w.ev(EV_SPENT, cx, cy, kind as i32, owner as i32);
    }
    let Some((i, tx, ty)) = m.cell else { return };
    let bb = &mut w.buildings[b];
    bb.charge += crate::souche::ORGAN_PERIOD * m.share;
    if bb.charge < m.ticks * 1000 {
        return;
    }
    bb.charge -= m.ticks * 1000;
    eat(w, owner, i);
    w.ev(EV_GRAZE, tx * TILE + TILE / 2, ty * TILE + TILE / 2, kind as i32, owner as i32);
}

/// Un organe mange `n` cases d'un coup (démonstrations).
pub fn graze_now(w: &mut World, b: usize, n: u32) {
    for _ in 0..n {
        w.buildings[b].charge = 100_000_000;
        graze(w, b);
        w.buildings[b].charge = 0;
    }
}

/// La case d'indice `i` devient le terreau du joueur, pour toujours.
pub fn eat(w: &mut World, owner: u8, i: usize) {
    let size = (w.map.w * w.map.h) as usize;
    if w.soil.len() != size {
        w.soil.clear();
        w.soil.resize(size, 0);
    }
    if w.soil[i] == 0 {
        w.soil_n += 1;
    }
    w.soil[i] = owner + 1;
    if owner < 8 && !w.terreau.is_empty() {
        w.terreau[i] |= 1 << owner;
    }
}

// ---------- Sol mangé comme terreau ----------

/// L'emprise touche-t-elle du sol mangé par ce joueur ?
fn on_soil(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    if w.soil.is_empty() {
        return false;
    }
    (y.max(0)..(y + bh).min(w.map.h)).any(|ty| (x.max(0)..(x + bw).min(w.map.w)).any(|tx| w.soil[w.map.idx(tx, ty)] == owner + 1))
}

/// Poteau de la Souche du joueur le plus proche de l'emprise, à REACH cases au plus, parmi ceux qu'accepte
/// `ok` (le plus petit indice à égalité).
fn nearest_pole(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32, ok: impl Fn(usize) -> bool) -> Option<usize> {
    let r = (REACH + bw.max(bh) + 4) * TILE;
    let mut best: Option<(i32, usize)> = None;
    w.grid.query_buildings(x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2, r, |p| {
        let pb = &w.buildings[p];
        if !pb.alive || pb.owner != owner || pb.def().race != RACE_SOUCHE || pb.def().supply == 0 || !ok(p) {
            return;
        }
        let (pw, ph) = pb.size();
        let gap = |a: i32, al: i32, b: i32, bl: i32| (b - (a + al - 1)).max(a - (b + bl - 1)).max(0);
        let d = gap(x, bw, pb.x, pw).max(gap(y, bh, pb.y, ph));
        if d <= REACH && best.is_none_or(|k| (d, p) < k) {
            best = Some((d, p));
        }
    });
    best.map(|(_, p)| p)
}

/// Organe sur du sol mangé : le poteau (accepté par `ok`) dont il rejoint le réseau.
pub fn pole_for(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32, ok: impl Fn(usize) -> bool) -> Option<usize> {
    if !on_soil(w, owner, x, y, bw, bh) {
        return None;
    }
    nearest_pole(w, owner, x, y, bw, bh, ok)
}

/// Pose d'un organe sur du sol mangé, à portée d'un poteau (même en croissance).
pub fn can_place(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    pole_for(w, owner, x, y, bw, bh, |_| true).is_some()
}

/// Réseau du sol mangé de la case (tx, ty) pour ce joueur (0 : aucun).
pub fn net_at(w: &World, owner: u8, tx: i32, ty: i32) -> u16 {
    pole_for(w, owner, tx, ty, 1, 1, |p| w.buildings[p].complete() && w.buildings[p].net != 0).map_or(0, |p| w.buildings[p].net)
}

// ---------- Sauvegarde, affichage ----------

/// Suites (longueur, valeur) du sol mangé.
fn runs(soil: &[u8], mut f: impl FnMut(u32, u8)) {
    let mut i = 0;
    while i < soil.len() {
        let v = soil[i];
        let mut n = 1;
        while i + n < soil.len() && soil[i + n] == v {
            n += 1;
        }
        f(n as u32, v);
        i += n;
    }
}

pub fn write(soil: &[u8], o: &mut crate::ser::W) {
    let mut v: Vec<(u32, u8)> = Vec::new();
    runs(soil, |n, k| v.push((n, k)));
    crate::ser::Ser::ser(&v, o);
}

/// Relit le sol mangé ; une longueur inattendue donne un sol intact.
pub fn read(r: &mut crate::ser::R, size: usize) -> Vec<u8> {
    let v: Vec<(u32, u8)> = crate::ser::Ser::de(r);
    let mut soil = Vec::with_capacity(size);
    for (n, k) in v {
        if soil.len() + n as usize > size {
            return Vec::new();
        }
        soil.resize(soil.len() + n as usize, k);
    }
    if soil.len() == size {
        soil
    } else {
        Vec::new()
    }
}

/// Sol mangé pour l'affichage du joueur : suites [longueur << 8 | joueur + 1]. Le sol mangé par une autre
/// équipe n'y est que là où la sienne a déjà vu (spectateur, partie sans brouillard : tout).
pub fn layer(w: &World, player: i32) -> Vec<i32> {
    let mut out = Vec::new();
    let team = (player >= 0).then(|| w.players.get(player as usize).map(|p| p.team)).flatten().filter(|&t| w.fog && (t as usize) < w.vis.len());
    let mut seen = w.soil.clone();
    if let Some(t) = team {
        for (i, v) in seen.iter_mut().enumerate() {
            if *v == 0 || w.team_of(*v - 1) == t {
                continue;
            }
            let (x, y) = (i as i32 % w.map.w, i as i32 / w.map.w);
            let k = ((y / 4).min(w.vis_w - 1) * w.vis_w + (x / 4).min(w.vis_w - 1)) as usize;
            if w.vis[t as usize][k] & (1 | 8) == 0 {
                *v = 0;
            }
        }
    }
    runs(&seen, |n, k| out.push((n << 8) as i32 | k as i32));
    out
}

/// Fiche d'un organe qui mange l'herbe (JSON) : distance de l'herbe qu'il mange (cases), secondes par case, part qui
/// lui revient (‰), production (‰ de la nominale), épuisé ou à bout ; racine-puits : cases d'herbe qui restent dans
/// son périmètre, cases du périmètre, secondes pour tout manger.
pub fn info(w: &World, b: usize) -> String {
    let bb = &w.buildings[b];
    if !eats(bb.kind) {
        return String::new();
    }
    let (bw, bh) = bb.size();
    let area = (bb.x, bb.y, bw, bh);
    let p = if bb.complete() { view(w, bb.kind, bb.owner, area, ring_of(bb.kind, bb.ammo as i32), 0) } else { preview_at(w, bb.kind, bb.owner, area) };
    format!(
        ",\"soil\":{{\"near\":{},\"secs\":{},\"share\":{},\"rate\":{},\"left\":{},\"total\":{},\"all\":{},\"spent\":{},\"pct\":{}}}",
        p[0],
        p[1],
        p[3],
        if bb.complete() { bb.timer as i32 } else { p[4] },
        p[5],
        p[6],
        p[7],
        bb.complete() && bb.stalled,
        SPENT_PCT
    )
}

/// [distance de l'herbe (cases ; -1 : aucune), secondes par case, rayon à montrer, part (‰), production (‰), cases
/// d'herbe, cases du périmètre, secondes pour tout manger] ; les trois dernières pour une racine-puits seulement.
fn view(w: &World, kind: u16, owner: u8, area: Area, ring: (i32, i32), extra: u32) -> [i32; 8] {
    let m = meal(w, kind, owner, area, ring, extra);
    let (x, y, bw, bh) = area;
    let near = if m.left == 0 { -1 } else { crate::fixed::isqrt(m.near as u64) as i32 / 2 };
    let secs = (m.ticks as u64 * 50 / m.share.max(1) as u64) as i32;
    let tap = kind == B_TAPROOT;
    let all = if tap { (m.all as u64 * 50 / m.share.max(1) as u64) as i32 } else { 0 };
    let total = if tap { ground_total(w, x, y, bw, bh) } else { 0 };
    [near, secs, ring.1, m.share as i32, yield_of(kind, &m), if tap { m.left as i32 } else { 0 }, total, all]
}

/// Organe pas encore poussé : il mangera l'herbe la plus proche.
fn preview_at(w: &World, kind: u16, owner: u8, area: Area) -> [i32; 8] {
    let rin = if kind == B_LEAVES { seek(w, owner, area, 0, REACH_MAX, 1).unwrap_or(REACH_MAX) } else { 0 };
    view(w, kind, owner, area, ring_of(kind, rin), 1)
}

/// Aperçu de pose d'un organe pour le joueur (voir `view`).
pub fn preview(w: &World, owner: u8, kind: u16, x: i32, y: i32) -> Vec<i32> {
    if kind as usize >= BUILDINGS.len() || !eats(kind) {
        return Vec::new();
    }
    let (bw, bh) = crate::buildings::dims(kind, 0);
    if x < 0 || y < 0 || x >= w.map.w || y >= w.map.h {
        return Vec::new();
    }
    preview_at(w, kind, owner, (x, y, bw, bh)).to_vec()
}
