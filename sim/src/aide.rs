//! Aide des semeurs (Souche, voir docs/spec/races.md, « Aide des semeurs »).
//!
//! Un semeur à qui l'on donne l'ordre d'assister (clic droit) un bâtiment de la Souche terminé qui produit (`helps`)
//! va s'y poster et l'aide tant qu'il n'a pas d'autre ordre (`units::update_units`, `Order::Assist`). Chaque semeur
//! ajoute un peu moins que le précédent : le k-ième ajoute 1000 / (k + 3) ‰ de productivité (25 %, 20 %, 16,6 %,
//! 14,2 %, 12,5 %…), HELPERS_MAX semeurs au plus (+148 % à douze). Ce qui est accéléré :
//! - frondaison, racine : l'herbe mangée (vitesse et sève) ;
//! - racine saline : les sels ; puits : l'eau ;
//! - graine-mère (et couveuse d'une ancienne partie) : sa sève, et l'incubation de ses œufs ;
//! - matrice : la recherche ; frayère : la fabrication.
//!
//! Les semeurs sont comptés à la demande dans la grille des unités (refaite au début de chaque tick), une fois par
//! tick et par bâtiment (`World::aid`, dérivé, jamais sauvegardé : une partie relue recompte au même moment).

use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::world::*;

/// Semeurs qui comptent au plus, par bâtiment.
pub const HELPERS_MAX: u32 = 12;

/// Bâtiment que des semeurs peuvent aider.
#[inline]
pub fn helps(kind: u16) -> bool {
    matches!(kind, B_LEAVES | B_ROOT | B_TAPROOT | B_SEED_HEART | B_BROOD | B_MATRIX | B_SPAWNERY | B_WELL)
}

/// Productivité ajoutée (‰) par `n` semeurs.
pub fn bonus(n: u32) -> u32 {
    (1..=n.min(HELPERS_MAX)).map(|k| 1000 / (k + 3)).sum()
}

/// Le semeur `s` peut-il aider le bâtiment `b` (à lui, terminé, qui produit) ?
pub fn can_help(w: &World, s: usize, b: usize) -> bool {
    let bb = &w.buildings[b];
    w.units.kind[s] == U_SOWER && bb.alive && bb.complete() && bb.owner == w.units.owner[s] && bb.def().race == RACE_SOUCHE && helps(bb.kind)
}

/// Distance (sous-unités) à laquelle un semeur aide un bâtiment : celle où il s'arrête pour l'assister.
#[inline]
fn reach(bb: &Building) -> i32 {
    crate::units::build_range(bb.kind, bb.dir) + TILE / 2
}

/// Semeurs qui aident le bâtiment `b` en ce moment : ordre d'assistance en tête, à portée.
pub fn count(w: &World, b: usize) -> u32 {
    let bb = &w.buildings[b];
    if !bb.alive || !bb.complete() || !helps(bb.kind) || bb.def().race != RACE_SOUCHE {
        return 0;
    }
    let r = w.building_ref(b);
    let range = reach(bb);
    let (cx, cy) = bb.center();
    let mut n = 0;
    w.grid.fine.query(cx, cy, range, |s| {
        if w.units.alive[s] && w.units.kind[s] == U_SOWER && w.units.owner[s] == bb.owner && matches!(w.units.cold[s].orders.first(), Some(&Order::Assist { target }) if target == r) && dist2(w.units.x[s], w.units.y[s], cx, cy) <= (range as i64).pow(2) {
            n += 1;
        }
    });
    n
}

/// Multiplicateur (‰) de la productivité du bâtiment `b`, ses semeurs comptés une fois par tick.
pub fn mult(w: &mut World, b: usize) -> u32 {
    if !helps(w.buildings[b].kind) {
        return 1000;
    }
    if w.aid.len() < w.buildings.len() {
        w.aid.resize(w.buildings.len(), (0, 0));
    }
    let t = w.tick + 1;
    let n = match w.aid[b] {
        (at, n) if at == t => n as u32,
        _ => {
            let n = count(w, b);
            w.aid[b] = (t, n as u16);
            n
        }
    };
    1000 + bonus(n)
}

/// Multiplicateur (‰) compté sans le garder (affichage).
pub fn mult_now(w: &World, b: usize) -> u32 {
    1000 + bonus(count(w, b))
}

/// Fiche d'un bâtiment que des semeurs peuvent aider (JSON, champ ajouté) : semeurs qui l'aident, productivité ajoutée
/// (‰), et ce qu'ajouterait le suivant.
pub fn info(w: &World, b: usize) -> String {
    let bb = &w.buildings[b];
    if !helps(bb.kind) || !bb.complete() || bb.def().race != RACE_SOUCHE {
        return String::new();
    }
    let n = count(w, b);
    let next = if n < HELPERS_MAX { 1000 / (n + 4) } else { 0 };
    format!(",\"aid\":{{\"n\":{},\"bonus\":{},\"next\":{},\"max\":{}}}", n, bonus(n), next, HELPERS_MAX)
}
