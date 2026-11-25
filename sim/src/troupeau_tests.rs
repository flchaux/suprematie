//! Tests des robots des Transhumants : le Mâtin (meute, chasse, harpon, équipements) et le Berger (troupeau, houlette,
//! sabots, chenil). Voir troupeau.rs.

use crate::ameliorations::*;
use crate::data::*;
use crate::fixed::{dist, TILE};
use crate::orders::*;
use crate::world::*;

/// Deux joueurs (Transhumants, Industriels) sur un terrain plat, sans faune ni brouillard ; (x, y) : le centre (cases).
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
    (w, cx, cy)
}

fn unit(w: &mut World, kind: u16, p: u8, x: i32, y: i32) -> usize {
    let id = w.spawn_unit(kind, p, x * TILE, y * TILE);
    w.unit(id).unwrap()
}

/// Équipe une unité d'office.
fn fit(w: &mut World, s: usize, m: u8) {
    w.units.cold[s].mods |= (m as u64) << (8 * MODS[m as usize].slot as u32);
    applied(w, Host::U(s));
}

/// Cible inerte : un Béhémoth sans arme utile n'existe pas, on la remet à neuf et on la fige.
fn dummy(w: &mut World, kind: u16, x: i32, y: i32) -> usize {
    let s = unit(w, kind, 1, x, y);
    w.units.cold[s].stun = u16::MAX;
    s
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

fn attack(w: &mut World, s: usize, t: usize) {
    let t = w.unit_id(t);
    w.units.cold[s].orders = vec![Order::Attack { target: t }];
}

fn tiles(w: &World, a: usize, b: usize) -> i32 {
    dist(w.units.x[a], w.units.y[a], w.units.x[b], w.units.y[b]) / TILE
}

// ---------- Mâtin ----------

#[test]
fn a_mastiff_bites_harder_in_a_pack() {
    let bite = |n: i32| {
        let (mut w, x, y) = field();
        let t = dummy(&mut w, U_COLOSSUS, x, y);
        let s = unit(&mut w, U_MASTIFF, 0, x - 3, y);
        for k in 0..n {
            unit(&mut w, U_MASTIFF, 0, x - 5, y - 4 + 2 * k);
        }
        // un Mâtin ennemi ne compte pas
        unit(&mut w, U_MASTIFF, 1, x - 6, y + 5);
        steps(&mut w, 1);
        let m = crate::troupeau::pack_mult(&w, s);
        assert!(w.units.alive[t]);
        m
    };
    assert_eq!([bite(0), bite(1), bite(3)], [100, 108, 124]);
    assert_eq!(bite(8).min(140), bite(8), "40 % au plus");
}

/// Marche offensive : il quitte sa route pour mordre ce qui approche, puis la reprend. Simple déplacement : il passe.
#[test]
fn a_mastiff_chases_what_comes_near() {
    for attack_move in [true, false] {
        let (mut w, x, y) = field();
        let s = unit(&mut w, U_MASTIFF, 0, x - 20, y);
        let t = dummy(&mut w, U_LINE_ROBOT, x, y + 7);
        let id = w.unit_id(s) as i32;
        let gx = (x + 25) * TILE;
        order(&mut w, O_MOVE, &[if attack_move { 2 } else { 0 }, gx, y * TILE, 1, id, gx, y * TILE]);
        steps(&mut w, 400);
        assert_eq!(w.units.alive[t], !attack_move, "marche offensive : {attack_move}");
        steps(&mut w, 400);
        assert!((w.units.x[s] - gx).abs() < 2 * TILE, "il arrive");
    }
}

/// Le harpon tire une petite unité jusqu'au Mâtin ; une grosse l'attire à elle.
#[test]
fn the_harpoon_drags_the_lighter_of_the_two() {
    for (kind, light) in [(U_LIGHT_TANK, true), (U_COLOSSUS, false)] {
        let (mut w, x, y) = field();
        let s = unit(&mut w, U_MASTIFF, 0, x - 11, y);
        fit(&mut w, s, M_MASTIFF_HARPOON);
        let t = dummy(&mut w, kind, x, y);
        w.units.hp[t] = 1_000_000;
        // figé sur place : seul le câble bouge l'un ou l'autre
        w.units.cold[s].orders = vec![Order::Haul { site: 0, feed: false }];
        let (x0, t0) = (w.units.x[s], w.units.x[t]);
        for _ in 0..60 {
            w.units.cold[s].orders = vec![Order::Attack { target: w.unit_id(t) }];
            let keep = w.units.x[s];
            w.step(&[]);
            // sa propre course ne compte pas pour la petite proie
            if light {
                w.units.x[s] = keep;
            }
        }
        if light {
            assert!(t0 - w.units.x[t] > 4 * TILE, "tirée de {} cases", (t0 - w.units.x[t]) / TILE);
        } else {
            assert_eq!(w.units.x[t], t0, "le Colosse ne bouge pas");
            assert!(w.units.x[s] - x0 > 6 * TILE, "le Mâtin est tiré vers lui");
        }
    }
}

#[test]
fn a_harpooned_prey_cannot_fire() {
    let (mut w, x, y) = field();
    let s = unit(&mut w, U_MASTIFF, 0, x - 11, y);
    fit(&mut w, s, M_MASTIFF_HARPOON);
    let t = unit(&mut w, U_LIGHT_TANK, 1, x, y);
    w.units.hp[t] = 100_000;
    for _ in 0..200 {
        attack(&mut w, s, t);
        w.step(&[]);
        if w.units.cold[t].stun > 0 {
            return;
        }
    }
    panic!("jamais accrochée");
}

/// Corps-à-corps avec une arme de plus : il va au contact ; avec la fronde, le Berger garde ses distances.
#[test]
fn melee_units_close_in_whatever_they_carry() {
    let (mut w, x, y) = field();
    let t = dummy(&mut w, U_COLOSSUS, x, y);
    let id = w.unit_id(t);
    for (kind, m, range) in [(U_MASTIFF, M_MASTIFF_GUN, 2), (U_MASTIFF, M_MASTIFF_HARPOON, 2), (U_RAM, M_RAM_FLAME, 2), (U_SHEPHERD, M_SHEPHERD_LANTERN, 6), (U_SHEPHERD, M_SHEPHERD_SLING, 50)] {
        let s = unit(&mut w, kind, 0, x - 30, y);
        fit(&mut w, s, m);
        assert_eq!(attack_range(&w, s, id), range, "{} {}", udef(kind).name, MODS[m as usize].name);
    }
}

#[test]
fn mastiff_frames_change_speed_and_armor() {
    let (mut w, x, y) = field();
    let base = {
        let s = unit(&mut w, U_MASTIFF, 0, x, y);
        speed(&w, s)
    };
    let spring = unit(&mut w, U_MASTIFF, 0, x, y + 3);
    fit(&mut w, spring, M_MASTIFF_SPRING);
    assert_eq!(speed(&w, spring), base * 125 / 100);
    // bond : deux fois plus vite à moins de 8 cases de sa proie
    let t = dummy(&mut w, U_COLOSSUS, x + 6, y + 3);
    attack(&mut w, spring, t);
    assert_eq!(speed(&w, spring), base * 250 / 100);
    let rails = unit(&mut w, U_MASTIFF, 0, x, y + 6);
    fit(&mut w, rails, M_MASTIFF_RAILS);
    assert_eq!((speed(&w, rails), unit_armor(&w, rails, 100)), (base * 90 / 100, 65));
    let fur = unit(&mut w, U_MASTIFF, 0, x, y + 9);
    fit(&mut w, fur, M_MASTIFF_FUR);
    w.hit_weapon = 5; // obus d'artillerie
    assert_eq!(unit_armor(&w, fur, 100), 40);
    w.hit_weapon = 71; // balle
    assert_eq!(unit_armor(&w, fur, 100), 100);
}

#[test]
fn mastiff_kits_smell_spike_and_heal() {
    // truffe : un commando camouflé est repéré à 10 cases, pas sans elle
    for nose in [false, true] {
        let (mut w, x, y) = {
            let (mut w, x, y) = field();
            w.fog = true;
            (w, x, y)
        };
        let s = unit(&mut w, U_MASTIFF, 0, x, y);
        w.units.cold[s].stun = u16::MAX;
        if nose {
            fit(&mut w, s, M_MASTIFF_NOSE);
        }
        let c = dummy(&mut w, U_COMMANDO, x + 10, y);
        steps(&mut w, 40);
        assert_eq!(crate::combat::unit_seen(&w, 0, c), nose);
    }
    // collier à clous : la moitié de la morsure revient
    let (mut w, x, y) = field();
    let s = unit(&mut w, U_MASTIFF, 0, x, y);
    fit(&mut w, s, M_MASTIFF_COLLAR);
    w.units.cold[s].stun = u16::MAX;
    let biter = unit(&mut w, U_MASTIFF, 1, x + 2, y);
    let (a, b) = (w.units.hp[s], w.units.hp[biter]);
    steps(&mut w, 30);
    let (lost, back) = (a - w.units.hp[s], b - w.units.hp[biter]);
    assert!(lost > 0 && (back * 2 - lost).abs() <= 2, "subi {lost}, rendu {back}");
    // tonnelet : soigne les voisins de son joueur, pas les autres
    let (mut w, x, y) = field();
    let s = unit(&mut w, U_MASTIFF, 0, x, y);
    fit(&mut w, s, M_MASTIFF_BARREL);
    let (near, far) = (unit(&mut w, U_RIDER, 0, x + 3, y), unit(&mut w, U_RIDER, 0, x + 12, y));
    for u in [s, near, far] {
        w.units.hp[u] = 100;
    }
    steps(&mut w, 100);
    assert!(w.units.hp[s] > 100 && w.units.hp[near] > 100);
    assert_eq!(w.units.hp[far], 100);
}

// ---------- Berger ----------

/// Troupeau : les unités de son joueur autour de lui vont plus vite ; pas l'ennemi, ni un autre Berger.
#[test]
fn the_flock_walks_faster_around_a_shepherd() {
    let (mut w, x, y) = field();
    let s = unit(&mut w, U_SHEPHERD, 0, x, y);
    let near = unit(&mut w, U_RIDER, 0, x + 10, y);
    let mid = unit(&mut w, U_RIDER, 0, x + 16, y);
    let other = unit(&mut w, U_SHEPHERD, 0, x - 8, y + 8);
    let foe = unit(&mut w, U_RIDER, 1, x - 8, y);
    let v = unit_speed(U_RIDER);
    crate::troupeau::begin_tick(&mut w);
    assert_eq!([speed(&w, near), speed(&w, mid), speed(&w, foe)], [v * 115 / 100, v, v]);
    assert_eq!([speed(&w, s), speed(&w, other)], [unit_speed(U_SHEPHERD); 2]);
    fit(&mut w, s, M_SHEPHERD_BELLS);
    crate::troupeau::begin_tick(&mut w);
    assert_eq!([speed(&w, near), speed(&w, mid)], [v * 130 / 100, v * 130 / 100]);
}

/// La houlette balaie la zone ; électrique, elle paralyse ce qu'elle touche.
#[test]
fn the_crook_sweeps_and_the_electric_one_stuns() {
    for arc in [false, true] {
        let (mut w, x, y) = field();
        let s = unit(&mut w, U_SHEPHERD, 0, x, y);
        if arc {
            fit(&mut w, s, M_SHEPHERD_ARC);
        }
        let (a, b) = (unit(&mut w, U_RAM, 1, x + 4, y), unit(&mut w, U_RAM, 1, x + 4, y + 1));
        for t in [a, b] {
            w.units.hp[t] = 100_000;
            // (sans arme qui morde : ils regardent ailleurs)
            w.units.cold[t].orders = vec![];
        }
        let mut stunned = false;
        for _ in 0..40 {
            w.step(&[]);
            stunned |= w.units.cold[a].stun > 0 && w.units.cold[b].stun > 0;
        }
        assert!(w.units.hp[a] < 100_000 && w.units.hp[b] < 100_000, "les deux sont touchés");
        assert_eq!(stunned, arc);
    }
}

#[test]
fn shepherd_frames_and_parasol() {
    let (mut w, x, y) = field();
    let v = unit_speed(U_SHEPHERD);
    let s = unit(&mut w, U_SHEPHERD, 0, x, y);
    fit(&mut w, s, M_SHEPHERD_STILTS);
    assert_eq!((speed(&w, s), unit_vision(&w, s)), (v * 145 / 100, 48));
    let s = unit(&mut w, U_SHEPHERD, 0, x, y + 8);
    fit(&mut w, s, M_SHEPHERD_CLOAK);
    fit(&mut w, s, M_SHEPHERD_PARASOL);
    assert_eq!((speed(&w, s), unit_armor(&w, s, 100), unit_shield(&w, s)), (v * 90 / 100, 65, (8, 5000)));
}

/// Sabots : il écrase en marchant, pas à l'arrêt, et pas les gros.
#[test]
fn clogs_crush_small_units_underfoot() {
    for boots in [false, true] {
        let (mut w, x, y) = field();
        let s = unit(&mut w, U_SHEPHERD, 0, x - 6, y);
        if boots {
            fit(&mut w, s, M_SHEPHERD_BOOTS);
        }
        // sans arme : seul le pied compte
        w.units.cold[s].cooldown = [u16::MAX; 2];
        let t = dummy(&mut w, U_RIDER, x, y);
        w.units.hp[t] = 5000;
        let id = w.unit_id(s) as i32;
        order(&mut w, O_MOVE, &[0, (x + 8) * TILE, y * TILE, 1, id, (x + 8) * TILE, y * TILE]);
        steps(&mut w, 200);
        assert_eq!(!w.units.alive[t] || w.units.hp[t] < 5000, boots);
    }
}

/// Chenil : un Mâtin toutes les 30 s, payé, quatre au plus ; ils escortent leur Berger.
#[test]
fn the_kennel_breeds_four_mastiffs_at_most() {
    let (mut w, x, y) = field();
    let s = unit(&mut w, U_SHEPHERD, 0, x, y);
    fit(&mut w, s, M_SHEPHERD_KENNEL);
    let dogs = |w: &World| (0..w.units.alive.len()).filter(|&u| w.units.alive[u] && w.units.kind[u] == U_MASTIFF).collect::<Vec<_>>();
    steps(&mut w, 60);
    assert!(dogs(&w).is_empty(), "rien pour payer");
    let ark = w.unit(w.players[0].commander).unwrap();
    (w.units.x[ark], w.units.y[ark]) = ((x - 12) * TILE, y * TILE);
    for &(it, n) in udef(U_MASTIFF).cost {
        crate::drones::put(&mut w.units.cold[ark].hold, it, n * 10);
    }
    steps(&mut w, 20);
    assert_eq!(dogs(&w).len(), 1);
    assert_eq!(crate::drones::has(&w.units.cold[ark].hold, STEEL), 72, "payé dans la soute de l'Arche");
    steps(&mut w, 560);
    assert_eq!(dogs(&w).len(), 1, "un toutes les 30 s");
    steps(&mut w, 4000);
    assert_eq!(dogs(&w).len(), 4, "quatre au plus");
    let d = dogs(&w)[0];
    assert_eq!(w.units.cold[d].orders.first().copied().map(|o| matches!(o, Order::Assist { .. })), Some(true));
    assert!(tiles(&w, d, s) <= 8, "près de son maître");
    // un chien perdu est remplacé, et la sauvegarde garde le compte
    let mut w = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
    w.units.hp[d] = 0;
    w.dead_units.push(d as u32);
    steps(&mut w, 700);
    assert_eq!(dogs(&w).len(), 4);
}

/// Le Berger sort de l'atelier, et l'arbre y mène sans cristal.
#[test]
fn the_shepherd_is_within_reach_of_the_tree() {
    for kind in [U_MASTIFF, U_SHEPHERD] {
        let d = udef(kind);
        assert!(d.race == RACE_TRANSH && d.factory == FactoryKind::Land && d.layer == Layer::Hover);
        assert!(d.cost.iter().all(|c| ![REFINED_CRYSTAL, ENERGY_CELL, COMPOSITE].contains(&c.0)), "{}", d.name);
    }
    assert_eq!(TECHS[T_T_SHEPHERD as usize].prereq, &[T_T_MASTIFF, T_T_ARMOR]);
}

/// La démo des robots : tous équipés comme prévu, et ils viennent à bout de la troupe.
#[test]
fn robots_demo_charges() {
    let mut w = crate::stress::robots_demo();
    let of = |w: &World, p: u8, kind: u16| (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == p && w.units.kind[s] == kind).count();
    assert_eq!((of(&w, 0, U_SHEPHERD), of(&w, 0, U_MASTIFF)), (4, 4));
    steps(&mut w, 1600);
    assert_eq!((of(&w, 0, U_SHEPHERD), of(&w, 1, U_LIGHT_TANK)), (4, 0));
}
