//! Tests du chariot bouclier des Transhumants : la bulle protège le convoi, ses paliers (rayon, points, recharge),
//! la bulle réfléchissante, l'installation par paliers, la sauvegarde et le déterminisme. Voir bouclier.rs.

use crate::ameliorations::*;
use crate::bouclier::*;
use crate::data::*;
use crate::drones::put;
use crate::fixed::TILE;
use crate::orders::*;
use crate::world::*;

/// Deux joueurs (Transhumants, Industriels) sur un terrain plat, sans faune ; (x, y) : le centre (cases). L'Arche du
/// joueur 0 est posée près du centre, soute garnie, relevés en poche, toutes les recherches de sa race.
fn field() -> (World, i32, i32) {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 0, RACE_TRANSH as i32, 0]);
    let (cx, cy) = (w.map.w / 2, w.map.h / 2);
    for y in cy - 40..cy + 40 {
        for x in cx - 40..cx + 40 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    let ark = w.unit(w.players[0].commander).unwrap();
    w.units.x[ark] = (cx - 20) * TILE;
    w.units.y[ark] = (cy + 20) * TILE;
    w.units.px[ark] = w.units.x[ark];
    w.units.py[ark] = w.units.y[ark];
    for it in 1..=ENERGY_CELL {
        put(&mut w.units.cold[ark].hold, it, 500);
    }
    w.players[0].purse[RELEVES as usize] = 1000;
    for (t, d) in TECHS.iter().enumerate() {
        if d.race == RACE_TRANSH {
            w.players[0].set_tech(t as u8);
        }
    }
    (w, cx, cy)
}

fn unit(w: &mut World, kind: u16, p: u8, x: i32, y: i32) -> usize {
    let id = w.spawn_unit(kind, p, x * TILE, y * TILE);
    w.unit(id).unwrap()
}

/// Équipe une unité d'office.
fn fit(w: &mut World, s: usize, m: u8) {
    let sl = MODS[m as usize].slot as u32;
    w.units.cold[s].mods = (w.units.cold[s].mods & !(0xffu64 << (8 * sl))) | (m as u64) << (8 * sl);
    applied(w, Host::U(s));
}

/// Bulle pleine, tout de suite.
fn charge(w: &mut World, s: usize) {
    w.units.cold[s].shield = unit_shield(w, s).1;
    w.units.cold[s].shield_down = 0;
}

fn order(w: &mut World, cmd: i32, args: &[i32]) {
    let mut o = vec![0, cmd, 0];
    o.extend_from_slice(args);
    o[0] = o.len() as i32 - 1;
    w.step(&o);
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

/// `n` cavaliers ennemis (80 dégâts par coup, un coup par seconde chacun) tirent sur `t` depuis `d` cases à l'est ;
/// ils ne meurent pas (la riposte ne compte pas). La bulle d'origine regagne 100 points par seconde.
fn gunners(w: &mut World, t: usize, d: i32, n: i32) -> Vec<usize> {
    let (x, y) = (w.units.x[t] / TILE + d, w.units.y[t] / TILE);
    let id = w.unit_id(t);
    (0..n)
        .map(|k| {
            let g = unit(w, U_RIDER, 1, x, y - n + 2 * k);
            w.units.hp[g] = 1_000_000;
            w.units.cold[g].orders = vec![Order::Attack { target: id }];
            g
        })
        .collect()
}

/// Le convoi dans la bulle ne prend rien tant qu'elle tient ; la bulle, elle, s'use.
#[test]
fn the_bubble_covers_the_convoy() {
    let (mut w, x, y) = field();
    let cart = unit(&mut w, U_SHIELD_CART, 0, x, y);
    charge(&mut w, cart);
    let mate = unit(&mut w, U_RIDER, 0, x + 3, y);
    w.units.cold[mate].stun = u16::MAX;
    let hp = w.units.hp[mate];
    gunners(&mut w, mate, 14, 2);
    steps(&mut w, 200);
    assert_eq!(w.units.hp[mate], hp, "à l'abri de la bulle");
    let sh = w.units.cold[cart].shield;
    assert!(sh < BASE_HP && sh > 0, "la bulle a pris les coups : {sh}");
    // la même unité hors de la bulle est touchée
    let (mut w, x, y) = field();
    let cart = unit(&mut w, U_SHIELD_CART, 0, x, y);
    charge(&mut w, cart);
    let mate = unit(&mut w, U_RIDER, 0, x - 9, y);
    w.units.cold[mate].stun = u16::MAX;
    let hp = w.units.hp[mate];
    gunners(&mut w, mate, 14, 2);
    steps(&mut w, 200);
    assert!(w.units.hp[mate] < hp, "hors de la bulle");
    assert_eq!(w.units.cold[cart].shield, BASE_HP);
}

/// Paliers : rayon (émetteur), points (accumulateurs), recharge (régénérateurs).
#[test]
fn tiers_widen_fill_and_speed_up_the_bubble() {
    let (mut w, x, y) = field();
    let s = unit(&mut w, U_SHIELD_CART, 0, x, y);
    assert_eq!(unit_shield(&w, s), (6, 3000));
    for (m, r) in [(M_SC_WIDE1, 8), (M_SC_WIDE2, 10), (M_SC_WIDE3, 12), (M_SC_MIRROR, 6)] {
        fit(&mut w, s, m);
        assert_eq!(unit_shield(&w, s).0, r, "{}", MODS[m as usize].name);
    }
    for (m, hp) in [(M_SC_CELLS1, 5000), (M_SC_CELLS2, 8000), (M_SC_CELLS3, 12000)] {
        fit(&mut w, s, m);
        assert_eq!(unit_shield(&w, s).1, hp, "{}", MODS[m as usize].name);
    }
    // recharge : de vide à pleine en 30 s, 18 s, 10 s (à l'arrondi du gain par tick près)
    for (m, full) in [(0u8, 600u32), (M_SC_REGEN1, 360), (M_SC_REGEN2, 200)] {
        let (mut w, x, y) = field();
        let s = unit(&mut w, U_SHIELD_CART, 0, x, y);
        if m != 0 {
            fit(&mut w, s, m);
        }
        w.units.cold[s].shield = 0;
        steps(&mut w, full / 2);
        let half = w.units.cold[s].shield;
        assert!((half - BASE_HP / 2).abs() <= BASE_HP / 25, "{m} : à mi-temps {half}");
        steps(&mut w, full / 2 - full / 20);
        assert!(w.units.cold[s].shield < BASE_HP, "{m} : pas encore pleine");
        steps(&mut w, full / 10);
        assert_eq!(w.units.cold[s].shield, BASE_HP, "{m} : pleine");
    }
}

/// Brisée, la bulle revient au quart après 10 s, 6 s ou 3 s selon les régénérateurs.
#[test]
fn a_broken_bubble_comes_back_sooner_with_regenerators() {
    for (m, back) in [(0u8, 200u32), (M_SC_REGEN1, 120), (M_SC_REGEN2, 60)] {
        let (mut w, x, y) = field();
        let s = unit(&mut w, U_SHIELD_CART, 0, x, y);
        if m != 0 {
            fit(&mut w, s, m);
        }
        w.units.cold[s].shield = 30;
        let mate = unit(&mut w, U_RIDER, 0, x + 2, y);
        w.units.cold[mate].stun = u16::MAX;
        let gs = gunners(&mut w, mate, 14, 3);
        // le premier coup brise la bulle ; on arrête les tireurs aussitôt
        let mut t = 0;
        while w.units.cold[s].shield_down == 0 {
            w.step(&[]);
            t += 1;
            assert!(t < 400, "la bulle tient trop longtemps");
        }
        for g in gs {
            w.units.cold[g].orders.clear();
            w.units.cold[g].stun = u16::MAX;
        }
        assert_eq!(w.units.cold[s].shield_down as u32, back);
        steps(&mut w, back - 1);
        assert_eq!(w.units.cold[s].shield, 0, "{m} : encore brisée");
        steps(&mut w, 1);
        assert_eq!(w.units.cold[s].shield, BASE_HP / 4, "{m} : revenue au quart");
    }
}

/// Bulle réfléchissante : chaque coup arrêté (80) en renvoie 30 % (24) au tireur ; sans elle, rien.
#[test]
fn the_mirror_sends_back_part_of_the_blow() {
    for mirror in [false, true] {
        let (mut w, x, y) = field();
        let s = unit(&mut w, U_SHIELD_CART, 0, x, y);
        if mirror {
            fit(&mut w, s, M_SC_MIRROR);
        }
        charge(&mut w, s);
        let mate = unit(&mut w, U_RIDER, 0, x + 2, y);
        w.units.cold[mate].stun = u16::MAX;
        let g = gunners(&mut w, mate, 14, 1)[0];
        let hp = w.units.hp[g];
        let mut hits = 0;
        for _ in 0..300 {
            let before = w.units.cold[s].shield;
            w.step(&[]);
            if w.units.cold[s].shield < before {
                hits += 1;
            }
        }
        let lost = hp - w.units.hp[g];
        assert!(hits > 3 && w.units.hp[mate] == udef(U_RIDER).hp, "la bulle arrête les coups");
        assert_eq!(lost, if mirror { hits * 80 * MIRROR_PCT / 100 } else { 0 }, "{hits} coups arrêtés");
    }
}

/// Installation par l'ordre du joueur : un palier demande le précédent, payé dans les réserves à portée.
#[test]
fn tiers_install_in_order_and_are_paid() {
    let (mut w, _, _) = field();
    let ark = w.unit(w.players[0].commander).unwrap();
    let (ax, ay) = (w.units.x[ark] / TILE, w.units.y[ark] / TILE);
    let s = unit(&mut w, U_SHIELD_CART, 0, ax + 6, ay);
    let r = w.unit_id(s) as i32;
    let steel = crate::drones::has(&w.units.cold[ark].hold, STEEL);
    order(&mut w, O_MOD_INSTALL, &[M_SC_WIDE2 as i32, 1, r]);
    assert_eq!(w.units.cold[s].mod_job, 0, "palier II sans le palier I : refusé");
    for m in [M_SC_WIDE1, M_SC_WIDE2, M_SC_CELLS1, M_SC_REGEN1] {
        order(&mut w, O_MOD_INSTALL, &[m as i32, 1, r]);
        assert_eq!(w.units.cold[s].mod_job, m, "{}", MODS[m as usize].name);
        let t = install_ticks(&w, 0, m) as u32;
        steps(&mut w, t + 1);
        assert!(has(w.units.cold[s].mods, m));
    }
    assert_eq!(unit_shield(&w, s), (10, 5000));
    assert_eq!(recharge(w.units.cold[s].mods), (360, 120));
    assert_eq!(crate::drones::has(&w.units.cold[ark].hold, STEEL), steel - 8, "palier II payé en acier");
    // l'autre branche de l'émetteur remplace les paliers en place
    order(&mut w, O_MOD_INSTALL, &[M_SC_MIRROR as i32, 1, r]);
    let t = install_ticks(&w, 0, M_SC_MIRROR) as u32;
    steps(&mut w, t + 1);
    assert!(has(w.units.cold[s].mods, M_SC_MIRROR) && !has_rank(w.units.cold[s].mods, M_SC_WIDE1));
    assert_eq!(unit_shield(&w, s), (6, 5000));
    // la fiche donne la bulle au client
    assert!(info(&w, Host::U(s)).contains("\"bubble\":[6,5000,360,120,30]"));
}

/// Le chariot bouclier sort de l'atelier, derrière sa recherche.
#[test]
fn the_shield_cart_needs_its_research() {
    let d = udef(U_SHIELD_CART);
    assert!(d.race == RACE_TRANSH && d.factory == FactoryKind::Land && d.layer == Layer::Hover && d.weapons.is_empty());
    assert_eq!((d.tech, d.shield_r, d.shield_hp), (T_T_SHIELD_CART, BASE_R, BASE_HP));
    assert_eq!(TECHS[T_T_SHIELD_CART as usize].prereq, &[T_T_BUBBLE]);
    assert_eq!(TECHS[T_T_SHIELD_CART as usize].race, RACE_TRANSH);
    assert!(!crate::gabarits::has_kits(U_SHIELD_CART), "pas une unité de combat");
}

/// Sauvegarde : améliorations, points de la bulle et rupture en cours sont gardés ; la suite est la même.
#[test]
fn saves_keep_the_bubble() {
    let (mut w, x, y) = field();
    let s = unit(&mut w, U_SHIELD_CART, 0, x, y);
    fit(&mut w, s, M_SC_WIDE1);
    fit(&mut w, s, M_SC_CELLS1);
    fit(&mut w, s, M_SC_REGEN1);
    charge(&mut w, s);
    let b = unit(&mut w, U_SHIELD_CART, 0, x - 10, y);
    fit(&mut w, b, M_SC_MIRROR);
    w.units.cold[b].shield = 0;
    w.units.cold[b].shield_down = 50;
    let mate = unit(&mut w, U_RIDER, 0, x + 3, y);
    gunners(&mut w, mate, 14, 2);
    steps(&mut w, 40);
    let bytes = crate::save::snapshot(&w);
    let mut w2 = crate::save::restore(&bytes).expect("sauvegarde lue");
    assert_eq!(w.hash(), w2.hash());
    assert_eq!((w2.units.cold[s].mods, w2.units.cold[s].shield), (w.units.cold[s].mods, w.units.cold[s].shield));
    for _ in 0..400 {
        assert_eq!(w.step(&[]), w2.step(&[]), "même suite de partie");
    }
    assert_eq!(w.hash(), w2.hash());
}

/// Deux parties identiques donnent la même suite, bulle réfléchissante comprise.
#[test]
fn shield_carts_are_deterministic() {
    let run = || {
        let (mut w, x, y) = field();
        let mut h = Vec::new();
        for (k, m) in [M_SC_WIDE2, M_SC_MIRROR, M_SC_CELLS3].into_iter().enumerate() {
            let s = unit(&mut w, U_SHIELD_CART, 0, x, y - 8 + 8 * k as i32);
            fit(&mut w, s, m);
            let mate = unit(&mut w, U_RIDER, 0, x + 2, y - 8 + 8 * k as i32);
            gunners(&mut w, mate, 13, 2);
        }
        for _ in 0..500 {
            w.step(&[]);
            h.push(w.hash());
        }
        h
    };
    assert_eq!(run(), run());
}
