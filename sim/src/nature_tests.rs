//! Tests de la faune : nids, croissance, attaques en horde, expansion, sauvegarde.

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::nature::*;
use crate::world::*;

fn params(np: usize, size: i32, fauna: i32) -> Vec<i32> {
    let mut p = vec![4242, size, 0, np as i32];
    for i in 0..np {
        p.extend_from_slice(&[i as i32, 0, 100, 100]);
    }
    p.push(fauna);
    p
}

/// Zone plate et vide, sans gisement.
fn clear(w: &mut World, x0: i32, y0: i32, x1: i32, y1: i32) {
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
}

/// Monde de test avec la faune réglée, sans nid : un nid posé à la main en (200, 200).
fn with_nest(level: i32) -> World {
    let mut w = World::new(&params(1, 512, level));
    w.infinite_grid = true;
    // loin du départ du joueur
    let (sx, sy) = w.map.starts[0];
    assert!((sx - 201).abs() + (sy - 201).abs() > 100, "départ trop proche du nid de test");
    clear(&mut w, 150, 150, 260, 260);
    let i = found_nest(&mut w, 200, 200).expect("pose du nid");
    for _ in 0..3 {
        spawn_beast(&mut w, i, U_BEAST_S);
    }
    w
}

fn put(w: &mut World, owner: u8, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, owner, kind, x, y, 0).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

fn run(w: &mut World, ticks: u32) {
    for _ in 0..ticks {
        w.step(&[]);
    }
}

#[test]
fn no_fauna_by_default() {
    let w = World::new(&[1, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    assert!(!w.nature.active());
    assert_eq!(w.players.len(), 2);
}

#[test]
fn initial_nests_only_in_disputed_zones() {
    for np in [2usize, 4, 8] {
        let mut w = World::new(&params(np, 512, FAUNA_NORMAL as i32));
        w.place_start_buildings();
        assert_eq!(w.players.len(), np + 1, "joueur caché de la faune");
        assert_eq!(w.players[np].team, NATURE_TEAM);
        let nests = w.nature.nests.len();
        assert!(nests >= 2, "{np} joueurs : {nests} nids");
        let min = (60 * TILE) as i64;
        for n in &w.nature.nests {
            let b = w.building(n.b).expect("nid vivant");
            let bb = &w.buildings[b];
            assert_eq!(bb.kind, B_NEST);
            assert_eq!(bb.owner as usize, np);
            assert_eq!(n.horde.len(), 3);
            let (cx, cy) = bb.center();
            for &(sx, sy) in &w.map.starts {
                assert!(dist2(cx, cy, sx * TILE, sy * TILE) >= min * min, "nid trop près d'un départ");
            }
        }
    }
}

#[test]
fn horde_cap_grows_logarithmically() {
    let min = 1200;
    assert_eq!(horde_max(0, FAUNA_NORMAL), 5);
    assert_eq!(horde_max(4 * min, FAUNA_NORMAL), 12);
    let a = horde_max(30 * min, FAUNA_NORMAL);
    let b = horde_max(60 * min, FAUNA_NORMAL);
    let c = horde_max(120 * min, FAUNA_NORMAL);
    let d = horde_max(240 * min, FAUNA_NORMAL);
    assert!(a < b && b < c && c < d);
    // chaque doublement de l'âge n'ajoute qu'environ 7 bêtes
    assert!(d - c <= 8 && c - b <= 8);
    assert!(horde_max(u32::MAX, FAUNA_AGGRESSIVE) <= 60);
    assert_eq!(attack_size(12), 8);
    assert_eq!(attack_size(5), 4);
    // évolution : de plus en plus grosses bêtes, sans dépasser 1000 ‰
    assert_eq!(evolution(0, FAUNA_NORMAL), 0);
    assert!(evolution(12000, FAUNA_NORMAL) < evolution(36000, FAUNA_NORMAL));
    assert!(evolution(u32::MAX, FAUNA_NORMAL) <= 1000);
    // un bâtiment : très peu de chances ; beaucoup : bien plus
    assert!(attack_chance(10, FAUNA_NORMAL) <= 10);
    assert!(attack_chance(400, FAUNA_NORMAL) >= 300);
}

#[test]
fn players_cannot_place_nests() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    assert!(place_building(&mut w, 0, B_NEST, 170, 170, 0).is_none());
    let nature = w.nature.owner;
    assert!(place_building(&mut w, nature, B_DEPOT, 170, 170, 0).is_none());
}

#[test]
fn nest_grows_and_stays_home_without_neighbours() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    run(&mut w, 1200 * 5);
    assert!(w.nature.raids.iter().all(|r| r.state == crate::nature::RAID_EXPAND), "attaque sans bâtiment voisin");
    let n = &w.nature.nests[0];
    let max = horde_max(w.tick - n.born, FAUNA_NORMAL);
    assert!(n.horde.len() >= max - 1, "horde {} / {}", n.horde.len(), max);
    assert!(n.horde.len() <= max);
    // les bêtes restent autour du nid
    let (cx, cy) = w.buildings[w.building(n.b).unwrap()].center();
    for &id in &n.horde {
        let s = w.unit(id).unwrap();
        assert!(dist2(w.units.x[s], w.units.y[s], cx, cy) <= ((16 * TILE) as i64).pow(2));
    }
}

#[test]
fn many_buildings_near_a_nest_bring_a_horde_attack() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    // une usine qui s'étend à 16-26 cases du nid : 30 dépôts
    let mut depots = Vec::new();
    for k in 0..30 {
        let x = 216 + (k % 6) * 3;
        let y = 186 + (k / 6) * 3;
        depots.push(put(&mut w, 0, B_DEPOT, x, y));
    }
    let mut launched = None;
    for _ in 0..6000 {
        w.step(&[]);
        if let Some(r) = w.nature.raids.iter().find(|r| r.state != crate::nature::RAID_EXPAND) {
            launched = Some((r.units.len(), w.tick));
            break;
        }
    }
    let (size, t) = launched.expect("aucune attaque malgré 30 bâtiments près du nid");
    // la horde part entière : au moins les 2/3 de son plafond
    let max = horde_max(t, FAUNA_NORMAL);
    assert!(size >= attack_size(max), "horde de {size} pour un plafond de {max}");
    run(&mut w, 1200);
    let hurt = depots.iter().any(|&b| !w.buildings[b].alive || w.buildings[b].hp < bdef(B_DEPOT).hp);
    assert!(hurt, "la horde n'a rien mordu");
}

#[test]
fn a_lone_building_is_rarely_attacked() {
    // même nid, un seul dépôt à 30 cases : sur 5 min, au plus quelques tentatives réussissent
    let mut tries = 0;
    let mut attacks = 0;
    for seed in 0..6 {
        let mut w = with_nest(FAUNA_NORMAL as i32);
        w.rng = crate::rng::Rng::new(seed);
        put(&mut w, 0, B_DEPOT, 230, 200);
        for _ in 0..6000 {
            w.step(&[]);
            if w.nature.raids.iter().any(|r| r.state != crate::nature::RAID_EXPAND) {
                attacks += 1;
                break;
            }
        }
        tries += 1;
    }
    assert!(attacks * 2 <= tries, "{attacks} attaques sur {tries} parties pour un seul bâtiment");
}

#[test]
fn peaceful_fauna_only_strikes_back() {
    let mut w = with_nest(FAUNA_PEACEFUL as i32);
    run(&mut w, 400);
    // un char léger s'approche à 6 cases du nid : rien ne se passe
    let tank = w.spawn_unit(U_LIGHT_TANK, 0, 207 * TILE, 201 * TILE);
    let s = w.unit(tank).unwrap();
    // il ne tire pas tout seul sur le nid pendant ce test
    w.units.cold[s].stun = 300;
    run(&mut w, 200);
    assert_eq!(w.units.hp[s], udef(U_LIGHT_TANK).hp, "faune paisible agressive");
    // il attaque le nid : la horde riposte
    w.units.cold[s].stun = 0;
    let nest = w.nature.nests[0].b;
    w.units.cold[s].orders.push(Order::Attack { target: nest });
    run(&mut w, 400);
    assert!(w.unit(tank).is_none_or(|s| w.units.hp[s] < udef(U_LIGHT_TANK).hp), "pas de riposte");
}

#[test]
fn normal_fauna_defends_its_territory() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    run(&mut w, 200);
    let robot = w.spawn_unit(U_LINE_ROBOT, 0, 210 * TILE, 201 * TILE);
    let s = w.unit(robot).unwrap();
    w.units.cold[s].stun = 400;
    run(&mut w, 300);
    assert!(w.unit(robot).is_none_or(|s| w.units.hp[s] < udef(U_LINE_ROBOT).hp), "intrus ignoré");
}

#[test]
fn mature_nests_expand_away_from_players() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    w.nature.max_nests = 4;
    w.nature.nests[0].born = 0;
    run(&mut w, 1200 * 6);
    // essaimage forcé dès que le nid est mûr
    w.nature.next_expand = w.tick + 1;
    let before = w.nature.nests.len();
    for _ in 0..4 {
        run(&mut w, 1200);
        if w.nature.nests.len() > before {
            break;
        }
        w.nature.next_expand = w.tick + 1;
    }
    assert!(w.nature.nests.len() > before, "pas d'expansion");
    let (cx, cy) = w.buildings[w.building(w.nature.nests[0].b).unwrap()].center();
    let n = w.nature.nests.last().unwrap();
    let (nx, ny) = w.buildings[w.building(n.b).unwrap()].center();
    let d2 = dist2(cx, cy, nx, ny);
    assert!(d2 >= ((10 * TILE) as i64).pow(2) && d2 <= ((32 * TILE) as i64).pow(2));
    assert!(!n.horde.is_empty(), "le nouveau nid a ses fondateurs");
}

#[test]
fn destroyed_nest_leaves_no_ghost_nor_wreck() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    let b = w.building(w.nature.nests[0].b).unwrap();
    w.buildings[b].hp = 0;
    w.dead_buildings.push(b as u32);
    run(&mut w, 40);
    assert!(w.nature.nests.is_empty());
    assert!(w.ghosts.is_empty());
    assert!(w.wrecks.iter().all(|wk| !wk.alive));
}

#[test]
fn fauna_does_not_decide_victory() {
    let mut w = World::new(&params(2, 512, FAUNA_NORMAL as i32));
    w.place_start_buildings();
    run(&mut w, 40);
    assert_eq!(w.winner, -1);
    crate::combat::eliminate(&mut w, 1);
    run(&mut w, 5);
    assert_eq!(w.winner, 0, "la faune ne doit pas empêcher la victoire");
}

#[test]
fn snapshot_restore_keeps_fauna_in_sync() {
    let mut a = World::new(&params(2, 512, FAUNA_AGGRESSIVE as i32));
    a.place_start_buildings();
    run(&mut a, 2400);
    let snap = crate::save::snapshot(&a);
    let mut b = crate::save::restore(&snap).expect("restore");
    assert_eq!(a.hash(), b.hash());
    for _ in 0..2400 {
        assert_eq!(a.step(&[]), b.step(&[]));
    }
    assert!(!b.nature.nests.is_empty());
}

#[test]
fn fauna_orders_are_refused() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    let nature = w.nature.owner as i32;
    let id = w.nature.nests[0].horde[0];
    let s = w.unit(id).unwrap();
    let before = w.units.cold[s].orders.len();
    // ordre de déplacement envoyé au nom de la faune
    let o = [8, crate::orders::O_MOVE, nature, 0, 100 * TILE, 100 * TILE, 1, id as i32, 100 * TILE, 100 * TILE];
    w.step(&o);
    assert!(w.units.cold[s].orders.len() <= before.max(1));
    assert!(!matches!(w.units.cold[s].orders.first(), Some(Order::Move { x, .. }) if *x == 100 * TILE));
}



// ---------- Parades contre les nids rasés sans risque ----------

const U_MOTO: u16 = 5;
const U_GUNSHIP: u16 = 23;

#[test]
fn nest_spits_at_aircraft() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    run(&mut w, 40);
    // une canonnière en vol stationnaire à 10 cases, qui ne tire pas
    let g = w.spawn_unit(U_GUNSHIP, 0, 210 * TILE, 201 * TILE);
    let s = w.unit(g).unwrap();
    w.units.cold[s].stun = 600;
    run(&mut w, 300);
    assert!(w.unit(g).is_none_or(|s| w.units.hp[s] < udef(U_GUNSHIP).hp), "le nid ne crache pas sur les avions");
}

#[test]
fn horde_is_not_lured_far_from_its_nest() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    run(&mut w, 40);
    // un robot immobile à 35 cases (derrière une ligne de tourelles, par exemple)
    let bait = w.spawn_unit(U_LINE_ROBOT, 0, 236 * TILE, 201 * TILE);
    let bs = w.unit(bait).unwrap();
    w.units.cold[bs].stun = 2000;
    // la horde a été provoquée près du nid et poursuit le robot
    let tick = w.tick;
    let n = &mut w.nature.nests[0];
    n.alarm = tick + 2000;
    n.ax = 205 * TILE;
    n.ay = 201 * TILE;
    for id in w.nature.nests[0].horde.clone() {
        let s = w.unit(id).unwrap();
        w.units.cold[s].orders.push(Order::Attack { target: bait });
    }
    run(&mut w, 600);
    assert_eq!(w.units.hp[bs], udef(U_LINE_ROBOT).hp, "la horde s'est laissé attirer");
    let (cx, cy) = w.buildings[w.building(w.nature.nests[0].b).unwrap()].center();
    for id in w.nature.nests[0].horde.clone() {
        let s = w.unit(id).unwrap();
        assert!(dist2(w.units.x[s], w.units.y[s], cx, cy) <= ((24 * TILE) as i64).pow(2), "bête trop loin du nid");
    }
}

#[test]
fn distant_artillery_triggers_a_counter_attack() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    for _ in 0..4 {
        spawn_beast(&mut w, 0, U_BEAST_S);
    }
    run(&mut w, 40);
    // obus tirés de 45 cases, bien au-delà de la zone défendue (artillerie lourde)
    let b = w.building(w.nature.nests[0].b).unwrap();
    let mut raided = false;
    for _ in 0..20 {
        w.hit_from = (245 * TILE, 201 * TILE);
        crate::combat::damage_building(&mut w, b, 300, 0);
        w.hit_from = (i32::MIN, 0);
        run(&mut w, 40);
        if w.nature.raids.iter().any(|r| r.state <= RAID_ASSAULT && dist2(r.tx, r.ty, 245 * TILE, 201 * TILE) <= ((6 * TILE) as i64).pow(2)) {
            raided = true;
            break;
        }
    }
    assert!(raided, "pas de contre-attaque vers l'artillerie");
}

#[test]
fn struck_nest_spawns_defenders() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    run(&mut w, 40);
    // pas de naissance ordinaire pendant le test
    w.nature.nests[0].spawn = 100_000;
    let before = w.nature.nests[0].horde.len();
    let b = w.building(w.nature.nests[0].b).unwrap();
    crate::combat::damage_building(&mut w, b, 100, 0);
    run(&mut w, 40);
    assert!(w.nature.nests[0].horde.len() >= before + 2, "pas de ponte d'urgence");
    // une seule salve par délai
    let after = w.nature.nests[0].horde.len();
    crate::combat::damage_building(&mut w, b, 100, 0);
    run(&mut w, 40);
    assert_eq!(w.nature.nests[0].horde.len(), after, "pontes d'urgence trop rapprochées");
}

#[test]
fn nest_hardens_with_evolution() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    assert_eq!(nest_damage(&w, 1000), 800);
    w.tick = 72_000; // une heure
    let late = nest_damage(&w, 1000);
    assert!(late < 700 && late >= 400, "résistance tardive : {late}");
    assert_eq!(nest_damage(&w, 1), 1);
}

#[test]
fn beasts_charge_their_prey() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    let id = w.nature.nests[0].horde[0];
    let s = w.unit(id).unwrap();
    let base = unit_speed(U_BEAST_S);
    assert_eq!(charge_speed(&w, s, base), base);
    // une moto toute proche : la bête charge, plus vite que la moto
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let m = w.spawn_unit(U_MOTO, 0, x + 6 * TILE, y);
    w.units.cold[s].orders.push(Order::Attack { target: m });
    assert!(charge_speed(&w, s, base) > unit_speed(U_MOTO));
}

#[test]
fn destroyed_nest_gives_power_shards() {
    let mut w = with_nest(FAUNA_NORMAL as i32);
    run(&mut w, 40);
    assert_eq!(w.players[0].shards, 0);
    let b = w.building(w.nature.nests[0].b).unwrap();
    // le joueur 0 abat le nid
    crate::combat::damage_building(&mut w, b, 100_000, 0);
    run(&mut w, 40);
    assert!(w.nature.nests.is_empty());
    assert!(w.players[0].shards >= 1, "pas de fragment");
}
