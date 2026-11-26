//! Chariot bouclier des Transhumants (`t_shield_cart`) : sa bulle couvre le convoi autour de lui, avec les règles
//! des autres boucliers (`combat::collect_shields`, `shield_absorb`). Ses trois emplacements (`SHIELD_SLOTS`) :
//! émetteur (rayon, ou bulle réfléchissante), accumulateurs (points), régénérateurs (recharge et retour après
//! une rupture). Tout se déduit de `UnitCold::mods` ; aucun état propre, rien de plus à sauvegarder.

use crate::ameliorations::*;
use crate::data::*;
use crate::world::World;

/// Bulle d'origine : rayon (cases) et points (ceux de `UNITS`).
pub const BASE_R: i32 = 6;
pub const BASE_HP: i32 = 3000;
/// Recharge d'origine : ticks pour passer de vide à pleine, ticks avant le retour au quart après une rupture.
pub const FULL_TICKS: i32 = 600;
pub const DOWN_TICKS: u16 = 200;
/// Part des coups arrêtés renvoyée au tireur par la bulle réfléchissante (%).
pub const MIRROR_PCT: i32 = 30;

/// Bulle du chariot bouclier selon ses améliorations : (rayon en cases, points).
pub fn bubble(mods: u64) -> (i32, i32) {
    let r = match at(mods, 0) {
        M_SC_WIDE1 => 8,
        M_SC_WIDE2 => 10,
        M_SC_WIDE3 => 12,
        _ => BASE_R,
    };
    let hp = match at(mods, 1) {
        M_SC_CELLS1 => 5000,
        M_SC_CELLS2 => 8000,
        M_SC_CELLS3 => 12000,
        _ => BASE_HP,
    };
    (r, hp)
}

/// Recharge du chariot bouclier : (ticks de vide à pleine, ticks avant le retour au quart après une rupture).
pub fn recharge(mods: u64) -> (i32, u16) {
    match at(mods, 2) {
        M_SC_REGEN1 => (360, 120),
        M_SC_REGEN2 => (200, 60),
        _ => (FULL_TICKS, DOWN_TICKS),
    }
}

/// Recharge d'une unité à bouclier (`kind`, `mods`) : celle du chariot bouclier, ou la règle commune.
#[inline]
pub fn unit_recharge(kind: u16, mods: u64) -> (i32, u16) {
    if kind == U_SHIELD_CART {
        recharge(mods)
    } else {
        (FULL_TICKS, DOWN_TICKS)
    }
}

/// Part (%) des coups arrêtés que la bulle de l'unité `s` renvoie au tireur (0 : aucune).
#[inline]
pub fn mirror_pct(w: &World, s: usize) -> i32 {
    if w.units.kind[s] == U_SHIELD_CART && has(w.units.cold[s].mods, M_SC_MIRROR) {
        MIRROR_PCT
    } else {
        0
    }
}

/// Bulle réfléchissante : la bulle de l'unité `s` vient d'arrêter `dmg` tirés par `src` (une unité ou un bâtiment
/// d'une autre équipe) ; il en reçoit `mirror_pct`, porté par le chariot (butin, relevés, expérience).
pub fn reflect(w: &mut World, s: usize, src: u32, dmg: i32) {
    let pct = mirror_pct(w, s);
    let back = dmg * pct / 100;
    if back <= 0 {
        return;
    }
    let owner = w.units.owner[s];
    let team = w.team_of(owner);
    let (shooter, weapon, from) = (w.shooter, w.hit_weapon, w.hit_from);
    w.shooter = w.unit_id(s);
    w.hit_weapon = 255;
    w.hit_from = (w.units.x[s], w.units.y[s]);
    if let Some(u) = w.unit(src) {
        if w.team_of(w.units.owner[u]) != team {
            crate::combat::damage_unit(w, u, back, owner);
        }
    } else if let Some(b) = w.building(src) {
        if w.team_of(w.buildings[b].owner) != team {
            crate::combat::damage_building(w, b, back, owner);
        }
    }
    w.shooter = shooter;
    w.hit_weapon = weapon;
    w.hit_from = from;
}
