//! Races jouables : ce qui diffère d'une race à l'autre au départ et dans les règles communes
//! (commandant, stock et bâtiments de départ, droit de poser, produire et rechercher).
//! Règles propres à chaque race : souche.rs, transhumants.rs. Spécification : docs/spec/races.md.

use crate::data::*;
use crate::fixed::TILE;
use crate::world::{Player, World};

/// Unité de commandement de chaque race.
pub fn commander_kind(race: u8) -> u16 {
    match race {
        RACE_SOUCHE => U_QUEEN,
        RACE_TRANSH => U_ARK,
        _ => U_COMMANDER,
    }
}

/// Unité de commandement (sa destruction élimine le joueur).
#[inline]
pub fn is_commander(kind: u16) -> bool {
    udef(kind).commander
}

/// Bourse de départ selon la race (monnaies de race ; les objets de départ sont dans un dépôt des
/// Industriels ou la soute repliée des Transhumants ; ceux de la Souche, dans son réseau).
pub fn start_stock(p: &mut Player) {
    p.purse = [0; NUM_ITEMS];
    if p.race == RACE_TRANSH {
        // les Transhumants recherchent par relevés : quelques-uns pour lancer la première étude
        p.purse[RELEVES as usize] = 20;
    }
}

/// Monnaie de race (ADN, relevés) : un compte du joueur (`Player::purse`), pas un objet en dépôt.
#[inline]
pub fn is_currency(it: u8) -> bool {
    it == ADN || it == RELEVES
}

/// Bâtiments et unités de départ d'une race autre que les Industriels. Renvoie vrai si la race a
/// posé son départ elle-même (sinon : générateur principal des Industriels).
pub fn place_start(w: &mut World, p: usize) -> bool {
    match w.players[p].race {
        RACE_SOUCHE => {
            crate::souche::place_start(w, p);
            true
        }
        RACE_TRANSH => {
            crate::transhumants::place_start(w, p);
            true
        }
        _ => false,
    }
}

/// Le joueur `p` peut-il poser ce type de bâtiment (race) ?
#[inline]
pub fn building_ok(w: &World, p: u8, kind: u16) -> bool {
    let race = w.players.get(p as usize).map_or(0, |pl| pl.race);
    bdef(kind).race == race
}

/// Le joueur `p` peut-il produire ce type d'unité (race) ?
#[inline]
pub fn unit_ok(w: &World, p: u8, kind: u16) -> bool {
    let race = w.players.get(p as usize).map_or(0, |pl| pl.race);
    (kind as usize) < UNITS.len() && udef(kind).race == race
}

/// Le joueur `p` peut-il lancer cette recherche (race, choix exclusif déjà fait ou prévu) ?
pub fn tech_ok(w: &World, p: u8, t: u8) -> bool {
    let Some(pl) = w.players.get(p as usize) else { return false };
    let Some(d) = TECHS.get(t as usize) else { return false };
    if d.race != pl.race {
        return false;
    }
    if d.excl != 0 {
        let x = d.excl;
        if pl.has_tech(x) || pl.research == x || pl.research_queue.contains(&x) {
            return false;
        }
    }
    true
}

/// Point d'apparition libre près d'une position de départ, décalé de (dx, dy) cases.
pub fn start_spot(w: &World, p: usize, dx: i32, dy: i32, mask: u8) -> (i32, i32) {
    let (sx, sy) = w.map.starts[p];
    crate::buildings::free_spot_near(w, (sx + dx) * TILE + TILE / 2, (sy + dy) * TILE + TILE / 2, mask)
}

/// Multiplicateur des dégâts selon la famille de l'arme et la cible (‰ : 1000 = inchangé).
/// Organismes vivants (Souche) : le feu leur fait 50 % de plus.
pub fn family_mult(weapon: u8, bio: bool) -> i32 {
    if (weapon as usize) >= WEAPONS.len() {
        return 1000;
    }
    match WEAPONS[weapon as usize].proj {
        Proj::Fire if bio => 1500,
        _ => 1000,
    }
}
