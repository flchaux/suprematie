//! Tests : amélioration du générateur principal (zone +50 %) et anneau de gisements de la carte.

use crate::buildings::{complete_building, place_building, supply_of};
use crate::data::*;
use crate::map::{in_main_ring, Map, MAIN_GEN_SPOT, RING_KINDS};
use crate::orders::O_UPGRADE;
use crate::world::*;

/// Monde d'un joueur sans réseau partout (les zones comptent), terrain dégagé autour de (100, 100).
fn world() -> World {
    let mut w = World::new(&[4242, 512, 0, 1, 0, 0, 100, 100]);
    w.infinite_grid = false;
    for y in 50..170 {
        for x in 50..170 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.map.spots.retain(|s| !(s.x >= 48 && s.x < 170 && s.y >= 48 && s.y < 170));
    // dépôt des tests (paiements immédiats : dépôts à moins de 30 cases du générateur en (100, 100))
    let d = place_building(&mut w, 0, B_DEPOT, 95, 106, 0).unwrap();
    complete_building(&mut w, d);
    w
}

fn put(w: &mut World, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, 0, kind, x, y, 0).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    if bdef(kind).class == BClass::Power {
        w.buildings[b].fuel = 1_000_000_000;
    }
    b
}

fn run(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

fn give_cost(w: &mut World) {
    for &(it, n) in MAIN_GENERATOR_LEVELS[1].cost {
        w.set_stock(0, it, n as i32);
    }
}

/// Le niveau 0 est le bâtiment tel quel ; le niveau 1 porte la zone et la liaison à +50 %, et coûte cher.
#[test]
fn main_generator_levels_data() {
    let d = bdef(B_MAIN_GENERATOR);
    let (l0, l1) = (&MAIN_GENERATOR_LEVELS[0], &MAIN_GENERATOR_LEVELS[1]);
    assert_eq!((l0.supply, l0.connect), (d.supply, d.connect));
    assert_eq!(l1.supply * 2, l0.supply * 3, "zone +50 %");
    assert_eq!(l1.connect * 2, l0.connect * 3, "liaison +50 %");
    assert_eq!(l1.tech, T_ELECTRONICS);
    assert!(l1.time >= 60, "chantier long");
    // plus cher que le générateur principal lui-même et que tout niveau de générateur
    let total = |c: &[(u8, u16)]| c.iter().map(|&(_, n)| n as u32).sum::<u32>();
    assert!(total(l1.cost) > total(d.cost) && total(l1.cost) > 4 * total(GENERATOR_LEVELS[2].cost));
    assert!(l1.cost.iter().any(|&(it, _)| it == ENGINE) && l1.cost.iter().any(|&(it, _)| it == STEEL));
    assert!(crate::buildings::max_supply() >= l1.supply);
}

/// L'amélioration demande la recherche et le coût, paie aussitôt, garde le générateur en service pendant
/// le chantier, puis agrandit sa zone : un bâtiment à 22 cases rejoint le réseau à la fin.
#[test]
fn main_generator_upgrade_extends_zone() {
    let mut w = world();
    let g = put(&mut w, B_MAIN_GENERATOR, 100, 100);
    // fonderie à 22 cases du bord est de l'emprise : hors de la zone de 18, dans celle de 27
    let f = put(&mut w, B_FURNACE, 100 + 3 + 22, 100);
    run(&mut w, 2);
    assert!(w.buildings[g].net != 0);
    assert_eq!(w.buildings[f].net, 0, "hors zone au niveau 0");
    assert_eq!(supply_of(&w.buildings[g]), 18);
    let r = w.building_ref(g) as i32;

    // sans la recherche : refusé ; sans le coût : refusé
    w.players[0].researched = 1;
    give_cost(&mut w);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert_eq!(w.buildings[g].upgrade, 0, "recherche électronique requise");
    w.players[0].researched = u64::MAX;
    w.set_stock(0, ENGINE, w.stock(0, ENGINE) - 1);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert_eq!(w.buildings[g].upgrade, 0, "coût incomplet");

    // lancée : coût payé, toujours 1 500 kW et zone de 18 pendant le chantier
    give_cost(&mut w);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert!(w.buildings[g].upgrade > 0);
    for &(it, _) in MAIN_GENERATOR_LEVELS[1].cost {
        assert_eq!(w.stock(0, it), 0, "payé aussitôt");
    }
    run(&mut w, 20);
    assert_eq!(w.players[0].power_prod, bdef(B_MAIN_GENERATOR).power_prod, "en service pendant le chantier");
    assert_eq!(w.buildings[f].net, 0);
    assert_eq!(supply_of(&w.buildings[g]), 18);

    // fin du chantier : niveau 1, zone de 27, la fonderie est alimentée par le même réseau
    run(&mut w, MAIN_GENERATOR_LEVELS[1].time as u32 * 20);
    assert_eq!(w.buildings[g].upgrade, 0);
    assert_eq!(w.buildings[g].level, 1);
    assert_eq!(supply_of(&w.buildings[g]), 27);
    assert!(w.buildings[f].net != 0 && w.buildings[f].net == w.buildings[g].net, "zones recalculées");
    let z = crate::render::power_zones(&w, 0);
    assert!(z.contains(",27,"), "vue électrique : rayon amélioré ({z})");

    // niveau maximal : plus rien à améliorer, rien n'est payé
    give_cost(&mut w);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert_eq!(w.buildings[g].upgrade, 0);
    assert_eq!(w.stock(0, STEEL), MAIN_GENERATOR_LEVELS[1].cost[0].1 as i32);

    // un bâtiment à 30 cases reste hors zone
    let far = put(&mut w, B_FURNACE, 100 - 30 - 2, 100);
    run(&mut w, 2);
    assert_eq!(w.buildings[far].net, 0);
}

/// Un second ordre pendant le chantier l'annule et rembourse ; la zone ne change pas.
#[test]
fn main_generator_upgrade_cancel_refunds() {
    let mut w = world();
    let g = put(&mut w, B_MAIN_GENERATOR, 100, 100);
    let r = w.building_ref(g) as i32;
    w.players[0].researched = u64::MAX;
    give_cost(&mut w);
    w.step(&[3, O_UPGRADE, 0, r]);
    run(&mut w, 100);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert_eq!(w.buildings[g].upgrade, 0);
    assert_eq!(w.buildings[g].level, 0);
    for &(it, n) in MAIN_GENERATOR_LEVELS[1].cost {
        assert_eq!(w.stock(0, it), n as i32, "remboursé");
    }
}

/// Le niveau et le chantier sont dans la sauvegarde et dans le hash.
#[test]
fn main_generator_level_in_save_and_hash() {
    let mut w = world();
    let g = put(&mut w, B_MAIN_GENERATOR, 100, 100);
    let r = w.building_ref(g) as i32;
    w.players[0].researched = u64::MAX;
    give_cost(&mut w);
    w.step(&[3, O_UPGRADE, 0, r]);
    run(&mut w, 50);
    // pendant le chantier : la restauration reprend l'avancement
    let mut back = crate::save::restore(&crate::save::snapshot(&w)).expect("restauration");
    assert_eq!(back.buildings[g].upgrade, w.buildings[g].upgrade);
    assert_eq!(back.hash(), w.hash());
    run(&mut w, MAIN_GENERATOR_LEVELS[1].time as u32 * 20);
    run(&mut back, MAIN_GENERATOR_LEVELS[1].time as u32 * 20);
    assert_eq!(back.buildings[g].level, 1);
    assert_eq!(back.hash(), w.hash());
    // le niveau compte dans le hash
    let h = w.hash();
    w.buildings[g].level = 0;
    assert_ne!(w.hash(), h);
}

/// Chaque départ a ses gisements de l'anneau (mêmes types partout), hors de la zone de départ du
/// générateur principal et dans sa zone améliorée, sur toutes les tailles, avec ou sans eau.
#[test]
fn map_ring_deposits_at_every_start() {
    for seed in [1u32, 7, 42, 4242, 12345, 99991, 31337, 2026] {
        for &(size, water) in &[(512, false), (512, true), (1024, false), (1024, true)] {
            for np in [2usize, 4, 8] {
                let m = Map::generate(seed, size, water, np);
                for &(sx, sy) in &m.starts {
                    let (gx, gy) = (sx + MAIN_GEN_SPOT.0, sy + MAIN_GEN_SPOT.1);
                    let ring: Vec<u8> = m.spots.iter().filter(|s| in_main_ring(gx, gy, s.x, s.y)).map(|s| s.kind).collect();
                    for kind in [IRON_ORE, COPPER_ORE, SILICON, HYDROCARBON] {
                        let want = RING_KINDS.iter().filter(|&&k| k == kind).count();
                        let got = ring.iter().filter(|&&k| k == kind).count();
                        assert!(got >= want, "graine {seed}, {size}, eau {water}, {np} joueurs : {got} gisements {kind} dans l'anneau de ({sx}, {sy}), {want} attendus");
                    }
                    // les gisements de l'anneau sont sur la terre et marqués sur la carte
                    for s in m.spots.iter().filter(|s| in_main_ring(gx, gy, s.x, s.y)) {
                        assert!(!m.is_water(s.x, s.y));
                        assert_eq!(m.deposit[m.idx(s.x + 1, s.y + 1)], s.kind);
                    }
                }
            }
        }
    }
}

/// L'anneau s'ajoute après les gisements d'avant, qui ne changent pas (mêmes positions, même ordre).
#[test]
fn map_ring_keeps_previous_deposits() {
    // somme de contrôle des gisements d'avant l'anneau, relevée avant son ajout
    let sum = |seed: u32, size: i32, water: bool, np: usize| {
        let m = Map::generate(seed, size, water, np);
        // les geysers, placés après l'anneau, ne comptent pas
        let spots: Vec<_> = m.spots.iter().filter(|s| s.kind != GEYSER).collect();
        let old = spots.len() - RING_KINDS.len() * np;
        spots[..old].iter().fold(0u64, |h, s| h.wrapping_mul(1_000_003).wrapping_add((s.kind as u64) << 40 | (s.x as u64) << 20 | s.y as u64))
    };
    assert_eq!(sum(12345, 512, false, 4), OLD_SPOTS_12345_512_4);
    assert_eq!(sum(4242, 1024, true, 8), OLD_SPOTS_4242_1024W_8);
}
const OLD_SPOTS_12345_512_4: u64 = 17614342118707906942;
const OLD_SPOTS_4242_1024W_8: u64 = 14807513473817974732;

/// Dans une vraie partie, le générateur principal est à la place prévue par la carte et les gisements
/// de l'anneau sont hors de sa zone, puis dedans après l'amélioration.
#[test]
fn start_generator_sits_where_the_map_expects() {
    for seed in [1, 7, 42, 4242, 12345] {
        let mut p = vec![seed, 512, 0, 4];
        for t in 0..4 {
            p.extend_from_slice(&[t, 0, 100, 100]);
        }
        let mut w = World::new(&p);
        w.place_start_buildings();
        for pl in 0..4u8 {
            let (sx, sy) = w.map.starts[pl as usize];
            let g = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == pl && w.buildings[b].kind == B_MAIN_GENERATOR).expect("générateur principal");
            assert_eq!((w.buildings[g].x, w.buildings[g].y), (sx + MAIN_GEN_SPOT.0, sy + MAIN_GEN_SPOT.1), "graine {seed}, joueur {pl}");
        }
    }
}

