//! Tests des anneaux de transport, de la porte de transit, de l'EPPZ, des réplicateurs et du droïde roulant.

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::nature::*;
use crate::world::*;

fn params(np: usize, fauna: i32) -> Vec<i32> {
    let mut p = vec![4242, 512, 0, np as i32];
    for i in 0..np {
        p.extend_from_slice(&[i as i32, 0, 100, 100]);
    }
    p.push(fauna);
    p
}

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

fn world(fauna: i32) -> World {
    let mut w = World::new(&params(1, fauna));
    w.infinite_grid = true;
    w.players[0].researched = u64::MAX;
    clear(&mut w, 150, 150, 300, 300);
    w
}

fn put(w: &mut World, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, 0, kind, x, y, 0).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

fn run(w: &mut World, ticks: u32) {
    for _ in 0..ticks {
        w.step(&[]);
    }
}

fn special(w: &mut World, b: usize, target: u32) {
    let r = w.building_ref(b) as i32;
    w.step(&[6, crate::orders::O_SPECIAL, 0, r, 0, 0, target as i32]);
}

// ---------- Anneaux et porte ----------

#[test]
fn rings_exchange_after_rising_and_only_at_medium_range() {
    let mut w = world(0);
    let a = put(&mut w, B_TRANSFER, 160, 160);
    let b = put(&mut w, B_TRANSFER, 200, 160);
    let far = put(&mut w, B_TRANSFER, 280, 280);
    run(&mut w, 5);
    let (ax, ay) = w.buildings[a].center();
    let u = w.spawn_unit(U_LINE_ROBOT, 0, ax, ay);
    // trop loin : rien ne se passe
    let rf = w.building_ref(far);
    special(&mut w, a, rf);
    assert_eq!(w.buildings[a].charge, 0, "anneaux lancés au-delà de leur portée");
    // portée moyenne : les anneaux montent, puis l'échange a lieu
    let rb = w.building_ref(b);
    special(&mut w, a, rb);
    assert!(w.buildings[a].charge > 0 && w.buildings[b].charge > 0, "les deux plateformes s'animent");
    let s = w.unit(u).unwrap();
    assert!(dist2(w.units.x[s], w.units.y[s], ax, ay) < (TILE as i64).pow(2), "échange avant la fin de la montée");
    run(&mut w, crate::logistics::RINGS_TIME + 2);
    let (bx, by) = w.buildings[b].center();
    let s = w.unit(u).unwrap();
    assert!(dist2(w.units.x[s], w.units.y[s], bx, by) < (3 * TILE as i64).pow(2), "unité pas arrivée");
    assert!(w.buildings[a].cooldown > 0);
}

#[test]
fn gate_traveller_walks_out_of_the_horizon() {
    let mut w = world(0);
    let a = put(&mut w, B_GATE, 170, 170);
    let b = put(&mut w, B_GATE, 270, 270);
    let rb = w.building_ref(b) as i32;
    special(&mut w, a, rb as u32);
    // ouverture (5 s)
    run(&mut w, 130);
    assert!(w.buildings[a].working && w.buildings[b].working, "portes ouvertes");
    let (ax, ay) = w.buildings[a].center();
    let u = w.spawn_unit(U_LINE_ROBOT, 0, ax, ay);
    run(&mut w, 3);
    let (bx, by) = w.buildings[b].center();
    let s = w.unit(u).unwrap();
    assert!(dist2(w.units.x[s], w.units.y[s], bx, by) <= (2 * TILE as i64).pow(2), "elle sort de l'horizon de l'autre porte");
    // elle s'éloigne de la porte, sans y rentrer de nouveau
    run(&mut w, 200);
    let s = w.unit(u).unwrap();
    let d = dist2(w.units.x[s], w.units.y[s], bx, by);
    assert!(d >= (3 * TILE as i64).pow(2) && d <= (9 * TILE as i64).pow(2), "elle ne s'est pas écartée");
}

// ---------- EPPZ ----------

#[test]
fn ruins_hold_an_eppz_that_a_lone_player_captures() {
    let mut w = World::new(&params(2, FAUNA_NORMAL as i32));
    w.place_start_buildings();
    assert!(!w.nature.ruins.is_empty());
    let rb = w.nature.ruins[0].b;
    let b = w.building(rb).unwrap();
    assert!(w.buildings[b].working, "EPPZ présent");
    // la ruine ne se vise pas et ne prend pas de dégâts
    crate::combat::damage_building(&mut w, b, 1_000_000, 0);
    assert!(w.building(rb).is_some());
    // un char du joueur 0 stationne à côté (on écarte la faune du coin)
    let (cx, cy) = w.buildings[b].center();
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && w.units.owner[s] as usize == w.nature.owner as usize && dist2(w.units.x[s], w.units.y[s], cx, cy) < (30 * TILE as i64).pow(2) {
            w.units.x[s] += 60 * TILE;
            w.units.px[s] = w.units.x[s];
        }
    }
    let t = w.spawn_unit(U_LIGHT_TANK, 0, cx + 2 * TILE, cy);
    let ts = w.unit(t).unwrap();
    w.units.cold[ts].stun = 1000;
    for _ in 0..30 {
        run(&mut w, 20);
        if w.players[0].eppz > 0 {
            break;
        }
    }
    assert_eq!(w.players[0].eppz, 1, "EPPZ pas capturé");
    assert!(!w.buildings[b].working, "l'EPPZ est parti");
}

#[test]
fn eppz_socket_needs_an_eppz_and_powers_without_fuel() {
    let mut w = world(0);
    w.infinite_grid = false;
    assert!(place_building(&mut w, 0, B_EPPZ_SOCKET, 200, 200, 0).is_none(), "socle sans EPPZ");
    w.players[0].eppz = 1;
    let b = put(&mut w, B_EPPZ_SOCKET, 200, 200);
    assert_eq!(w.players[0].eppz, 0, "EPPZ posé");
    run(&mut w, 5);
    assert_eq!(w.players[0].power_prod, bdef(B_EPPZ_SOCKET).power_prod);
    assert_eq!(w.buildings[b].fuel, 0);
    // un ingénieur le démonte : l'EPPZ revient
    let r = w.building_ref(b) as i32;
    let (cx, cy) = w.buildings[b].center();
    let e = w.spawn_unit(U_ENG1, 0, cx + 3 * TILE, cy) as i32;
    w.step(&[6, crate::orders::O_RECLAIM, 0, 0, r, 1, e]);
    for _ in 0..3000 {
        w.step(&[]);
        if w.building(r as u32).is_none() {
            break;
        }
    }
    assert!(w.building(r as u32).is_none());
    assert_eq!(w.players[0].eppz, 1, "EPPZ rendu");
}

// ---------- Réplicateurs ----------

#[test]
fn replicators_shrug_off_everything_but_the_disruptor() {
    let mut w = world(FAUNA_NORMAL as i32);
    let i = found_colony(&mut w, 200, 200, SPECIES_REPLICATORS).expect("ruche");
    spawn_beast(&mut w, i, U_REPLICATOR);
    let id = *w.nature.nests[i].horde.last().unwrap();
    let s = w.unit(id).unwrap();
    // un char tire : rien
    let tank = w.spawn_unit(U_LIGHT_TANK, 0, 190 * TILE, 200 * TILE);
    w.shooter = tank;
    crate::combat::damage_unit(&mut w, s, 500, 0);
    assert_eq!(w.units.hp[s], udef(U_REPLICATOR).hp, "un char blesse un réplicateur");
    let hive = w.building(w.nature.nests[i].b).unwrap();
    crate::combat::damage_building(&mut w, hive, 500, 0);
    assert_eq!(w.buildings[hive].hp, bdef(B_HIVE).hp, "un char blesse la ruche");
    // le disrupteur : oui
    let d = w.spawn_unit(U_DISRUPTOR, 0, 190 * TILE, 202 * TILE);
    w.shooter = d;
    crate::combat::damage_unit(&mut w, s, 100, 0);
    assert_eq!(w.units.hp[s], udef(U_REPLICATOR).hp - 100);
    // et il blesse peu le reste
    let ts = w.unit(tank).unwrap();
    crate::combat::damage_unit(&mut w, ts, 100, 0);
    assert_eq!(w.units.hp[ts], udef(U_LIGHT_TANK).hp - 20);
    w.shooter = NONE;
}

#[test]
fn a_replicator_that_kills_a_building_breeds() {
    let mut w = world(FAUNA_NORMAL as i32);
    let i = found_colony(&mut w, 260, 260, SPECIES_REPLICATORS).expect("ruche");
    spawn_beast(&mut w, i, U_REPLICATOR);
    let author = *w.nature.nests[i].horde.last().unwrap();
    let before = w.players[w.nature.owner as usize].unit_count;
    let wall = put(&mut w, B_WALL, 200, 200);
    w.shooter = author;
    let nat = w.nature.owner;
    crate::combat::damage_building(&mut w, wall, 100_000, nat);
    w.shooter = NONE;
    run(&mut w, 3);
    assert!(w.players[w.nature.owner as usize].unit_count > before, "pas de nouveau réplicateur");
}

#[test]
fn disruptor_wins_against_a_replicator() {
    let mut w = world(FAUNA_NORMAL as i32);
    let i = found_colony(&mut w, 260, 260, SPECIES_REPLICATORS).expect("ruche");
    spawn_beast(&mut w, i, U_REPLICATOR);
    let id = *w.nature.nests[i].horde.last().unwrap();
    let s = w.unit(id).unwrap();
    // le réplicateur est amené devant deux disrupteurs
    w.units.x[s] = 200 * TILE;
    w.units.y[s] = 200 * TILE;
    w.units.px[s] = w.units.x[s];
    w.units.py[s] = w.units.y[s];
    w.spawn_unit(U_DISRUPTOR, 0, 206 * TILE, 200 * TILE);
    w.spawn_unit(U_DISRUPTOR, 0, 206 * TILE, 202 * TILE);
    run(&mut w, 400);
    assert!(w.unit(id).is_none(), "le réplicateur résiste aux disrupteurs");
}

// ---------- Droïde roulant ----------

#[test]
fn roll_droid_deploys_to_fire_and_shields_only_when_deployed() {
    let mut w = World::new(&params(2, 0));
    w.infinite_grid = true;
    clear(&mut w, 150, 150, 300, 300);
    let d = w.spawn_unit(U_ROLL_DROID, 0, 200 * TILE, 200 * TILE);
    let s = w.unit(d).unwrap();
    run(&mut w, 5);
    assert!(!w.units.cold[s].deployed);
    assert!(w.shields.iter().all(|sh| sh.4 != d), "bouclier en boule");
    // une cible à portée : il se déplie et tire
    let enemy = w.spawn_unit(U_LINE_ROBOT, 1, 210 * TILE, 200 * TILE);
    let es = w.unit(enemy).unwrap();
    w.units.cold[es].stun = 1000;
    run(&mut w, 60);
    assert!(w.units.cold[s].deployed, "pas déployé");
    assert!(w.shields.iter().any(|sh| sh.4 == d), "pas de bouclier déployé");
    assert!(w.unit(enemy).is_none_or(|e| w.units.hp[e] < udef(U_LINE_ROBOT).hp), "pas de tir");
    // vitesse : plus rapide qu'une moto
    assert!(udef(U_ROLL_DROID).speed > 60);
}

#[test]
fn anciens_demo_runs_gates_rings_and_droids() {
    let mut w = crate::stress::anciens_demo();
    let mut teleports = 0;
    let mut deployed = false;
    for _ in 0..900 {
        w.step(&[]);
        teleports += w.events.chunks(5).filter(|e| e[0] == EV_TELEPORT).count();
        deployed |= (0..w.units.alive.len()).any(|s| w.units.alive[s] && w.units.kind[s] == U_ROLL_DROID && w.units.cold[s].deployed);
    }
    assert!(teleports >= 4, "{teleports} passages (porte et anneaux)");
    assert!(deployed, "aucun droïde déployé");
}

#[test]
fn demo_rings_repeat() {
    let mut w = crate::stress::anciens_demo();
    let r1 = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_TRANSFER && w.buildings[b].repeat).unwrap();
    let mut starts = 0;
    let mut last = 0;
    for _ in 0..1500 {
        w.step(&[]);
        let c = w.buildings[r1].charge;
        if c > 0 && last == 0 {
            starts += 1;
        }
        last = c;
    }
    assert!(starts >= 3, "{starts} séquences d'anneaux en 75 s");
}
