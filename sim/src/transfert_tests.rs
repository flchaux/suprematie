//! Tests du réseau de transfert des Transhumants (voir docs/spec/races.md, transfert.rs) : les bâtiments qui se
//! touchent se passent tous les objets, de proche en proche.

use crate::buildings::{complete_building, place_building, remove_building};
use crate::data::*;
use crate::orders::*;
use crate::world::*;

/// Deux Transhumants (joueurs 0 et 1), terrain plat autour du départ du joueur 0, électricité partout.
fn base() -> (World, i32, i32) {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_TRANSH as i32, RACE_TRANSH as i32]);
    w.place_start_buildings();
    let (sx, sy) = w.map.starts[0];
    let (x0, y0, x1, y1) = (sx - 40, sy - 40, sx + 40, sy + 40);
    w.map.spots.retain(|s| !(s.x >= x0 - 2 && s.x <= x1 && s.y >= y0 - 2 && s.y <= y1));
    for y in y0..y1 {
        for x in x0..x1 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.wear.resize(w.map.spots.len(), 0);
    w.infinite_grid = true;
    w.power_dirty = true;
    (w, sx - 20, sy + 20)
}

fn spot(w: &mut World, kind: u8, x: i32, y: i32) {
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(x + dx, y + dy);
            w.map.deposit[i] = kind;
        }
    }
    w.map.spots.push(crate::map::Spot { kind, x, y, purity: 0 });
    w.wear.resize(w.map.spots.len(), 0);
}

fn put_for(w: &mut World, p: u8, kind: u16, x: i32, y: i32, recipe: u8) -> usize {
    let b = place_building(w, p, kind, x, y, 0).expect("pose");
    complete_building(w, b);
    if recipe != RECIPE_NONE {
        w.buildings[b].recipe = recipe;
        w.buildings[b].repeat = true;
    }
    b
}

fn put(w: &mut World, kind: u16, x: i32, y: i32, recipe: u8) -> usize {
    put_for(w, 0, kind, x, y, recipe)
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

fn order(w: &mut World, cmd: i32, args: &[i32]) {
    let mut o = vec![0, cmd, 0];
    o.extend_from_slice(args);
    o[0] = o.len() as i32 - 1;
    w.step(&o);
}

fn has(w: &World, b: usize, it: u8) -> u16 {
    crate::drones::has(&w.buildings[b].stash, it)
}

fn stock(w: &mut World, b: usize, it: u8, n: u16) {
    crate::drones::put(&mut w.buildings[b].stash, it, n);
}

fn rec(k: &str) -> u8 {
    RECIPES.iter().position(|r| r.key == k).unwrap() as u8
}

fn made(w: &World, p: usize, it: u8) -> u32 {
    w.players[p].produced[it as usize]
}

/// Foreuse sur un gisement de fer en (x, y), suivie de `n` bastions (qui ne prennent rien), d'une fonderie et d'une
/// soute (où vont les plaques).
fn drill_line(w: &mut World, x: i32, y: i32, n: i32) -> (usize, usize) {
    spot(w, IRON_ORE, x, y);
    let d = put(w, B_T_DRILL, x, y, RECIPE_NONE);
    for k in 0..n {
        put(w, B_T_BASTION, x + 2 + 2 * k, y, RECIPE_NONE);
    }
    let f = put(w, B_T_FURNACE, x + 2 + 2 * n, y, RECIPE_NONE);
    put(w, B_T_HOLD, x + 4 + 2 * n, y, RECIPE_NONE);
    (d, f)
}

/// Le minerai de la foreuse traverse trois bâtiments qui n'en font rien jusqu'à la fonderie.
#[test]
fn ore_crosses_three_buildings_to_the_furnace() {
    let (mut w, x, y) = base();
    let (d, f) = drill_line(&mut w, x, y, 3);
    steps(&mut w, 1200);
    assert_eq!(crate::transfert::size(&w, d), 6);
    assert_eq!(crate::transfert::hops(&w, d, f), 4, "quatre sauts de la foreuse à la fonderie");
    assert_eq!(w.buildings[f].recipe, rec("iron_plate"));
    assert!(made(&w, 0, IRON_PLATE) >= 10, "plaques fondues : {}", made(&w, 0, IRON_PLATE));
}

/// La soute alimente un assembleur relié par trois bâtiments, comme s'il lui était collé.
#[test]
fn the_hold_feeds_a_crafter_three_buildings_away() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    for k in 0..3 {
        put(&mut w, B_T_BASTION, x + 2 + 2 * k, y, RECIPE_NONE);
    }
    put(&mut w, B_T_ASSEMBLER, x + 8, y, rec("gear"));
    stock(&mut w, h, IRON_PLATE, 60);
    steps(&mut w, 1200);
    assert!(made(&w, 0, GEAR) >= 10, "engrenages : {}", made(&w, 0, GEAR));
    // les engrenages reviennent à la soute
    assert!(has(&w, h, GEAR) >= 10);
}

/// Deux réseaux séparés par une case ne s'échangent rien ; un poteau relais posé dans le trou les relie.
#[test]
fn separate_networks_exchange_nothing_until_a_pole_joins_them() {
    let (mut w, x, y) = base();
    spot(&mut w, IRON_ORE, x, y);
    let d = put(&mut w, B_T_DRILL, x, y, RECIPE_NONE);
    put(&mut w, B_T_BASTION, x + 2, y, RECIPE_NONE);
    // une case libre en x + 4
    let f = put(&mut w, B_T_FURNACE, x + 5, y, RECIPE_NONE);
    let h = put(&mut w, B_T_HOLD, x + 7, y, RECIPE_NONE);
    // un générateur (le poteau ouvre une zone électrique : il lui faut du courant)
    put(&mut w, B_T_GENERATOR, x + 9, y, RECIPE_NONE);
    stock(&mut w, h, HYDROCARBON, 200);
    steps(&mut w, 800);
    assert!(!crate::transfert::same_net(&w, d, f));
    assert_eq!(made(&w, 0, IRON_PLATE), 0, "rien ne passe le trou");
    let p = put(&mut w, B_T_POLE, x + 4, y, RECIPE_NONE);
    steps(&mut w, 800);
    assert!(crate::transfert::same_net(&w, d, f));
    assert_eq!(crate::transfert::size(&w, p), 6);
    assert!(made(&w, 0, IRON_PLATE) > 0, "le poteau sert de chemin");
}

/// Des bâtiments qui ne se touchent que par un coin ne sont pas reliés ; un contact partiel d'un côté suffit.
#[test]
fn corners_do_not_link_but_a_partial_side_does() {
    let (mut w, x, y) = base();
    let a = put(&mut w, B_T_BASTION, x, y, RECIPE_NONE);
    let b = put(&mut w, B_T_BASTION, x + 2, y + 2, RECIPE_NONE);
    let c = put(&mut w, B_T_BASTION, x + 2, y - 1, RECIPE_NONE);
    steps(&mut w, 1);
    assert!(!crate::transfert::same_net(&w, a, b), "coin seulement");
    assert!(crate::transfert::same_net(&w, a, c), "une case de côté en commun");
}

/// Un bâtiment du milieu détruit, ou replié, coupe le réseau.
#[test]
fn losing_the_middle_building_cuts_the_network() {
    for fold in [false, true] {
        let (mut w, x, y) = base();
        let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
        let m = put(&mut w, B_T_LAB, x + 2, y, RECIPE_NONE);
        let a = put(&mut w, B_T_ASSEMBLER, x + 4, y, rec("gear"));
        stock(&mut w, h, IRON_PLATE, 400);
        steps(&mut w, 600);
        assert!(made(&w, 0, GEAR) > 0);
        if fold {
            let r = w.building_ref(m) as i32;
            order(&mut w, O_PACK, &[1, r]);
            assert!(!w.buildings[m].alive, "replié");
        } else {
            remove_building(&mut w, m, true);
        }
        steps(&mut w, 200);
        assert!(!crate::transfert::same_net(&w, h, a));
        let plates = has(&w, h, IRON_PLATE);
        steps(&mut w, 600);
        assert_eq!(has(&w, h, IRON_PLATE), plates, "plus rien ne part (repli : {fold})");
    }
}

/// Les priorités de la soute valent pour tout le réseau : un assembleur relié lui laisse les 40 dernières plaques
/// une fois qu'elle a 100 engrenages.
#[test]
fn the_hold_keeps_its_last_plates_across_the_network() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    put(&mut w, B_T_BASTION, x + 2, y, RECIPE_NONE);
    put(&mut w, B_T_ASSEMBLER, x + 4, y, rec("gear"));
    stock(&mut w, h, IRON_PLATE, 100);
    stock(&mut w, h, GEAR, 80);
    steps(&mut w, 6000);
    assert_eq!((has(&w, h, IRON_PLATE), has(&w, h, GEAR)), (40, 110));
}

/// Un atelier relié à la soute par une longue file de poteaux (au-delà de 30 cases) passe avant l'assembleur collé :
/// la soute lui garde ce qui manque à son unité, et ses drones vont l'y chercher.
#[test]
fn a_far_workshop_of_the_network_is_served_first() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    put(&mut w, B_T_ASSEMBLER, x - 2, y, rec("gear"));
    for k in 0..34 {
        put(&mut w, B_T_POLE, x + 2 + k, y, RECIPE_NONE);
    }
    let s = put(&mut w, B_T_WORKSHOP, x + 36, y, RECIPE_NONE);
    for &(it, n) in udef(U_CH_HOLD).cost {
        stock(&mut w, h, it, n);
    }
    let r = w.building_ref(s) as i32;
    order(&mut w, O_FACTORY_QUEUE, &[r, U_CH_HOLD as i32, 1]);
    for _ in 0..3600 {
        w.step(&[]);
        if w.buildings[s].working {
            assert_eq!(made(&w, 0, GEAR), 0, "l'assembleur n'a rien pris de ce qui était gardé");
            return;
        }
    }
    panic!("atelier jamais servi");
}

/// Débit inchangé : un assembleur relié par deux bâtiments reçoit au même rythme qu'un assembleur collé (un objet
/// par seconde et par ingrédient, deux avec le palan).
#[test]
fn the_network_does_not_change_the_rate() {
    let run = |gap: i32, crane: bool| {
        let (mut w, x, y) = base();
        let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
        for k in 0..gap {
            put(&mut w, B_T_BASTION, x + 2 + 2 * k, y, RECIPE_NONE);
        }
        put(&mut w, B_T_ASSEMBLER, x + 2 + 2 * gap, y, rec("gear"));
        if crane {
            w.buildings[h].mods = (crate::ameliorations::M_HOLD_CRANE as u64) << 8;
        }
        stock(&mut w, h, IRON_PLATE, 1000);
        steps(&mut w, 2000);
        1000 - has(&w, h, IRON_PLATE) as u32
    };
    for crane in [false, true] {
        let glued = run(0, crane);
        assert!(glued > 0);
        assert_eq!(run(2, crane), glued, "palan : {crane}");
    }
}

/// Deux joueurs dont les bâtiments se touchent ne partagent rien : le bâtiment d'un autre ne sert pas de chemin.
#[test]
fn neighbouring_players_share_nothing() {
    let (mut w, x, y) = base();
    // foreuse et fonderie du joueur 0 séparées par un bastion du joueur 1
    spot(&mut w, IRON_ORE, x, y);
    let d = put(&mut w, B_T_DRILL, x, y, RECIPE_NONE);
    let e = put_for(&mut w, 1, B_T_BASTION, x + 2, y, RECIPE_NONE);
    let f = put(&mut w, B_T_FURNACE, x + 4, y, RECIPE_NONE);
    put(&mut w, B_T_HOLD, x + 4, y + 2, RECIPE_NONE);
    // un assembleur du joueur 1 collé à la fonderie du joueur 0
    let a = put_for(&mut w, 1, B_T_ASSEMBLER, x + 6, y, rec("gear"));
    steps(&mut w, 800);
    assert!(!crate::transfert::same_net(&w, d, e) && !crate::transfert::same_net(&w, d, f) && !crate::transfert::same_net(&w, f, a));
    assert_eq!(made(&w, 0, IRON_PLATE), 0);
    // le même chemin avec un bastion du joueur 0 : le minerai passe
    remove_building(&mut w, e, false);
    put(&mut w, B_T_BASTION, x + 2, y, RECIPE_NONE);
    steps(&mut w, 800);
    assert!(made(&w, 0, IRON_PLATE) > 0);
    assert_eq!(made(&w, 1, GEAR), 0, "rien pour le voisin");
}

/// Les réseaux ne sont pas sauvegardés : recalculés au chargement, la partie continue à l'identique.
#[test]
fn networks_survive_save_and_load() {
    let (mut w, x, y) = base();
    let (d, f) = drill_line(&mut w, x, y, 3);
    steps(&mut w, 300);
    let bytes = crate::save::snapshot(&w);
    let mut w2 = crate::save::restore(&bytes).expect("sauvegarde lue");
    for _ in 0..600 {
        assert_eq!(w.step(&[]), w2.step(&[]), "même empreinte après rechargement");
    }
    assert!(crate::transfert::same_net(&w2, d, f));
    assert!(made(&w2, 0, IRON_PLATE) > 0);
}

/// Deux parties identiques donnent les mêmes empreintes ; la fiche donne la taille du réseau.
#[test]
fn networks_are_deterministic_and_shown_on_the_sheet() {
    let run = || {
        let (mut w, x, y) = base();
        let (d, _) = drill_line(&mut w, x, y, 3);
        let h = put(&mut w, B_T_HOLD, x + 2, y + 2, RECIPE_NONE);
        put(&mut w, B_T_ASSEMBLER, x + 4, y + 2, rec("gear"));
        stock(&mut w, h, IRON_PLATE, 50);
        let mut hs = Vec::new();
        for _ in 0..800 {
            hs.push(w.step(&[]));
        }
        assert!(made(&w, 0, GEAR) > 0 && made(&w, 0, IRON_PLATE) > 0);
        assert!(crate::transhumants::info(&w, d).contains("\"net\":8"), "{}", crate::transhumants::info(&w, d));
        hs
    };
    assert_eq!(run(), run());
}

