//! Eau de la Souche (voir docs/spec/races.md, « Eau »).
//!
//! - Nappes phréatiques : sous la carte, une réserve d'eau par maille (CELL × CELL cases), invisible. Elle vient d'un
//!   bruit tiré de la graine de la carte (`ensure`, dérivé, jamais sauvegardé) : des poches riches, beaucoup de mailles
//!   sèches. Les étendues d'eau en ajoutent : PER_WATER_TILE par case d'eau de la maille.
//! - Forage (B_BOREHOLE) : un semeur (ou la Reine) le creuse n'importe où à terre ; il ne pousse pas seul, il faut le
//!   creuser (chantier de BOREHOLE_BUILD s). Creusé, c'est un point d'eau : sa fiche dit ce qu'un puits y tirerait, et
//!   on y construit un puits (amélioration du forage, payée par son réseau : il doit être sur le terreau).
//! - Puits (B_WELL) : sur un forage, ou posé directement au bord de l'eau (`near_water`), sur le terreau comme tout
//!   organe. Il tire l'eau des mailles à WELL_R mailles au plus : un centième d'eau par seconde pour WELL_DIV d'eau
//!   alentour, WELL_MAX au plus, aide des semeurs comprise. Ce qu'il tire est pris aux mailles les plus riches de son
//!   disque (`World::drawn`, sauvegardé) : un puits épuise les nappes et l'eau libre autour de lui, et deux puits
//!   voisins se partagent la même eau.
//! - Usages : le prix des organismes (leurs œufs la puisent comme la sève et les sels), et les frondaisons, dont la
//!   consommation se règle de 0 à 200 % (`leaf_water`, 0 au départ) : LEAF_WATER centièmes par seconde à 100 %, +50 %
//!   de vitesse.

use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::world::*;

/// Cases par côté d'une maille de nappe.
pub const CELL: i32 = 4;
/// Mailles entre deux points du bruit des nappes.
const LATTICE: i32 = 7;
/// Niveau du bruit (0 à 255) au-dessus duquel il y a une nappe, et eau par niveau au-dessus.
const NAPPE_SEUIL: u32 = 150;
const PER_LEVEL: u32 = 70;
/// Eau d'une case d'eau libre (lac, mer) dans sa maille.
pub const PER_WATER_TILE: u32 = 400;
/// Rayon (mailles) où un puits tire son eau, débit au plus (centièmes par seconde) et eau alentour par centième.
pub const WELL_R: i32 = 3;
pub const WELL_MAX: u32 = 250;
pub const WELL_DIV: u32 = 40;
/// Forage : temps de creusage (s) pour un ouvrier de puissance 10 ; durée de la construction du puits (s).
pub const BOREHOLE_BUILD: u16 = 30;
pub const WELL_TIME: u32 = 20;
/// Frondaison : eau (centièmes par seconde) à 100 %, et vitesse ajoutée (‰ par point de pourcentage).
pub const LEAF_WATER: u32 = 20;
pub const LEAF_BONUS: u32 = 5;

/// Mailles de la carte (largeur, hauteur).
#[inline]
fn grid(w: &World) -> (i32, i32) {
    ((w.map.w + CELL - 1) / CELL, (w.map.h + CELL - 1) / CELL)
}

/// Calcule la réserve d'eau de chaque maille s'il ne l'est pas encore (premier tick d'une partie avec la Souche,
/// partie relue) : la fiche d'un forage la lit.
pub fn ensure(w: &mut World) {
    let (gw, gh) = grid(w);
    if w.aquifer.len() == (gw * gh) as usize || !w.players.iter().any(|p| p.race == RACE_SOUCHE) {
        return;
    }
    let seed = w.params.first().copied().unwrap_or(1) as u32 ^ 0x4EA0_5EED;
    let corner = |lx: i32, ly: i32, s: u32| (crate::rng::hash3(lx, ly, s) & 255) as i32;
    // bruit de valeur, interpolé entre les points d'un réseau de LATTICE mailles, plus une octave plus fine
    let value = |gx: i32, gy: i32, step: i32, s: u32| -> i32 {
        let (lx, ly) = (gx.div_euclid(step), gy.div_euclid(step));
        let (fx, fy) = (gx.rem_euclid(step), gy.rem_euclid(step));
        let top = corner(lx, ly, s) * (step - fx) + corner(lx + 1, ly, s) * fx;
        let bot = corner(lx, ly + 1, s) * (step - fx) + corner(lx + 1, ly + 1, s) * fx;
        (top * (step - fy) + bot * fy) / (step * step)
    };
    let mut aq = vec![0u32; (gw * gh) as usize];
    for gy in 0..gh {
        for gx in 0..gw {
            let v = (2 * value(gx, gy, LATTICE, seed) + value(gx, gy, 3, seed ^ 0x9E37)) / 3;
            let mut r = (v as u32).saturating_sub(NAPPE_SEUIL) * PER_LEVEL;
            for ty in gy * CELL..((gy + 1) * CELL).min(w.map.h) {
                for tx in gx * CELL..((gx + 1) * CELL).min(w.map.w) {
                    if w.map.height[w.map.idx(tx, ty)] < w.map.water_level {
                        r += PER_WATER_TILE;
                    }
                }
            }
            aq[(gy * gw + gx) as usize] = r;
        }
    }
    w.aquifer = aq;
}

/// Eau déjà tirée de la maille `c`.
#[inline]
fn drawn_of(w: &World, c: u32) -> u32 {
    w.drawn.binary_search_by_key(&c, |d| d.0).map_or(0, |k| w.drawn[k].1)
}

/// Eau qui reste dans la maille `c`.
#[inline]
pub fn remaining(w: &World, c: u32) -> u32 {
    w.aquifer.get(c as usize).copied().unwrap_or(0).saturating_sub(drawn_of(w, c))
}

/// Mailles (indices croissants) du disque d'un puits centré en (x, y) (sous-unités).
fn disc(w: &World, x: i32, y: i32) -> Vec<u32> {
    let (gw, gh) = grid(w);
    let (cx, cy) = (x / (CELL * TILE), y / (CELL * TILE));
    let mut out = Vec::new();
    for gy in (cy - WELL_R).max(0)..=(cy + WELL_R).min(gh - 1) {
        for gx in (cx - WELL_R).max(0)..=(cx + WELL_R).min(gw - 1) {
            let (mx, my) = (gx * CELL * TILE + CELL * TILE / 2, gy * CELL * TILE + CELL * TILE / 2);
            if dist2(mx, my, x, y) <= (((WELL_R * CELL + CELL / 2) * TILE) as i64).pow(2) {
                out.push((gy * gw + gx) as u32);
            }
        }
    }
    out
}

/// Eau qui reste à portée d'un puits centré en (x, y) (sous-unités).
pub fn available(w: &World, x: i32, y: i32) -> u32 {
    if w.aquifer.is_empty() {
        return 0;
    }
    disc(w, x, y).into_iter().map(|c| remaining(w, c)).sum()
}

/// Débit (centièmes d'eau par seconde) d'un puits centré en (x, y), sans l'aide des semeurs.
pub fn rate_at(w: &World, x: i32, y: i32) -> u32 {
    (available(w, x, y) / WELL_DIV).min(WELL_MAX)
}

/// Une case d'eau libre touche-t-elle l'emprise (x, y, bw, bh) ou sa bordure ?
pub fn near_water(w: &World, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    (y - 1..y + bh + 1).any(|ty| (x - 1..x + bw + 1).any(|tx| w.map.inside(tx, ty) && w.map.height[w.map.idx(tx, ty)] < w.map.water_level))
}

/// Puits (toutes les ORGAN_PERIOD ticks, une seconde) : il tire l'eau de son disque (aide des semeurs comprise),
/// la prend aux mailles les plus riches, et la verse dans son réseau. Reste en cent-millièmes dans `progress`.
pub fn tick_well(w: &mut World, b: usize) {
    ensure(w);
    let bb = &w.buildings[b];
    if bb.net == 0 {
        w.buildings[b].working = false;
        return;
    }
    let (cx, cy) = bb.center();
    let aid = crate::aide::mult(w, b) as u64;
    let rate = rate_at(w, cx, cy) as u64 * aid / 1000;
    let bb = &mut w.buildings[b];
    let sum = bb.progress as u64 + rate * 1000;
    bb.progress = (sum % crate::soil::YIELD_UNIT) as u32;
    bb.working = rate > 0;
    let n = (sum / crate::soil::YIELD_UNIT) as u32;
    if n == 0 {
        return;
    }
    let (net, owner) = (bb.net, bb.owner);
    let cells = disc(w, cx, cy);
    for _ in 0..n {
        // la maille la plus riche (la première à égalité)
        let Some(c) = cells.iter().copied().max_by_key(|&c| (remaining(w, c), std::cmp::Reverse(c))) else { break };
        match w.drawn.binary_search_by_key(&c, |d| d.0) {
            Ok(k) => w.drawn[k].1 += 1,
            Err(k) => w.drawn.insert(k, (c, 1)),
        }
    }
    crate::souche::feed_eau(w, owner, net, n as i32);
}

/// Consommation d'eau d'une frondaison (%, 0 à 200 ; 0 tant qu'on ne l'a pas réglée : une frondaison ne boit pas
/// l'eau des œufs sans qu'on le lui demande) : `Building::lot` = pourcentage + 1.
#[inline]
pub fn leaf_pct(bb: &Building) -> u32 {
    (bb.lot as u32).saturating_sub(1).min(200)
}

/// Frondaison, pendant un passage de `period` ticks : elle boit son eau (reste en centièmes dans `cooldown`) et va
/// d'autant plus vite ; sans eau dans son réseau, elle va à son rythme. Renvoie le multiplicateur de vitesse (‰).
pub fn leaf_water(w: &mut World, b: usize, period: u32) -> u32 {
    let bb = &w.buildings[b];
    let pct = leaf_pct(bb);
    if pct == 0 || bb.net == 0 {
        return 1000;
    }
    let need = LEAF_WATER * pct * period / 100 / crate::souche::ORGAN_PERIOD;
    let sum = bb.cooldown as u32 + need;
    let (whole, rest) = (sum / 100, sum % 100);
    let (owner, net) = (bb.owner, bb.net);
    if whole > 0 && !crate::souche::take_all(w, owner, net, &[(EAU, whole as i32)]) {
        return 1000;
    }
    w.buildings[b].cooldown = rest as u16;
    1000 + LEAF_BONUS * pct
}

/// La frondaison `b` a-t-elle de l'eau pour son prochain passage ?
fn leaf_has_water(w: &World, b: usize) -> bool {
    let bb = &w.buildings[b];
    let n = w.nets.get(bb.net as usize).filter(|_| bb.net != 0);
    n.is_some_and(|n| n.unlimited || n.eau > 0)
}

/// Fiche (JSON, champ ajouté) : forage et puits, ce que tire (ou tirerait) le puits et l'eau alentour ; frondaison, sa
/// consommation d'eau.
pub fn info(w: &World, b: usize) -> String {
    let bb = &w.buildings[b];
    match bb.kind {
        B_BOREHOLE | B_WELL => {
            let (cx, cy) = bb.center();
            let aid = if bb.kind == B_WELL && bb.complete() { crate::aide::mult_now(w, b) } else { 1000 };
            let rate = rate_at(w, cx, cy) as u64 * aid as u64 / 1000;
            format!(",\"well\":{{\"rate\":{},\"avail\":{},\"max\":{}}}", rate, available(w, cx, cy), WELL_MAX)
        }
        B_LEAVES if bb.complete() => {
            let pct = leaf_pct(bb);
            format!(",\"water\":{{\"pct\":{},\"use\":{},\"bonus\":{},\"ok\":{}}}", pct, LEAF_WATER * pct / 100, LEAF_BONUS * pct, pct == 0 || leaf_has_water(w, b))
        }
        _ => String::new(),
    }
}
