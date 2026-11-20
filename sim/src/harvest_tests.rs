//! Tests de la récolte du commandant : il extrait le minerai d'un gisement, le fond dans sa fonderie
//! intégrée et verse le produit fondu au stock du joueur (ordre Harvest, voir units.rs).

use crate::data::*;
use crate::fixed::TILE;
use crate::orders::{O_HARVEST, O_MOVE, O_STOP};
use crate::units::{harvest_cycle, HV_COMBAT, HV_FULL, HV_GOING, HV_WORKING};
use crate::world::*;

fn params(np: usize) -> Vec<i32> {
    let mut p = vec![4242, 512, 0, np as i32];
    for i in 0..np {
        p.extend_from_slice(&[i as i32, 0, 100, 100]);
    }
    p
}

/// Zone plate et vide, sans gisement.
fn flatten(w: &mut World, x0: i32, y0: i32, x1: i32, y1: i32) {
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

fn spot(w: &mut World, kind: u8, x: i32, y: i32) {
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(x + dx, y + dy);
            w.map.deposit[i] = kind;
        }
    }
    w.map.spots.push(crate::map::Spot { kind, x, y });
}

/// Monde de test : zone plate, gisements de fer (100,100), cuivre (110,100), silicium (100,110),
/// hydrocarbure (110,110), cristal (120,110). Rend le monde et l'identifiant d'un commandant posé en (90,90).
fn world(np: usize) -> (World, u32) {
    let mut w = World::new(&params(np));
    w.infinite_grid = true;
    flatten(&mut w, 70, 70, 140, 140);
    spot(&mut w, IRON_ORE, 100, 100);
    spot(&mut w, COPPER_ORE, 110, 100);
    spot(&mut w, SILICON, 100, 110);
    spot(&mut w, HYDROCARBON, 110, 110);
    spot(&mut w, CRYSTAL, 120, 110);
    let cmd = w.spawn_unit(U_COMMANDER, 0, 90 * TILE, 90 * TILE);
    (w, cmd)
}

fn harvest(w: &mut World, ids: &[u32], x: i32, y: i32, queue: bool) {
    let mut o = vec![0, O_HARVEST, 0, queue as i32, x, y, ids.len() as i32];
    o.extend(ids.iter().map(|&i| i as i32));
    o[0] = o.len() as i32 - 1;
    w.step(&o);
}

fn first(w: &World, id: u32) -> Option<Order> {
    w.units.cold[w.unit(id).unwrap()].orders.first().copied()
}

fn state(w: &World, id: u32) -> u16 {
    w.units.cold[w.unit(id).unwrap()].timer
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

/// Le commandant va au gisement, puis chaque cycle de récolte transforme un minerai en sa plaque, versée
/// au stock ; le minerai brut n'entre jamais au stock. Seul le commandant accepte l'ordre.
#[test]
fn commander_harvests_and_smelts_ore() {
    let (mut w, cmd) = world(1);
    let robot = w.spawn_unit(U_LINE_ROBOT, 0, 91 * TILE, 90 * TILE);
    let st0 = w.players[0].stock;
    harvest(&mut w, &[cmd, robot], 100, 100, false);
    assert!(w.units.cold[w.unit(robot).unwrap()].orders.is_empty(), "seul le commandant récolte");
    assert_eq!(first(&w, cmd), Some(Order::Harvest { x: 100, y: 100 }));
    assert_eq!(state(&w, cmd), HV_GOING);
    // il se rend au gisement
    let mut arrived = None;
    for t in 0..600 {
        w.step(&[]);
        if state(&w, cmd) == HV_WORKING {
            arrived = Some(t);
            break;
        }
    }
    assert!(arrived.is_some(), "le commandant n'a pas atteint le gisement");
    let s = w.unit(cmd).unwrap();
    let d = crate::fixed::dist(w.units.x[s], w.units.y[s], 100 * TILE + TILE / 2, 100 * TILE + TILE / 2);
    assert!(d <= crate::units::HARVEST_RANGE, "trop loin du gisement : {d}");
    // débit : un cycle de 80 ticks par plaque (2 fois la recette de la fonderie)
    let cycle = harvest_cycle(RECIPES.iter().position(|r| r.key == "iron_plate").unwrap());
    assert_eq!(cycle, 80);
    let p0 = w.players[0].stock[IRON_PLATE as usize];
    steps(&mut w, cycle * 10);
    let got = w.players[0].stock[IRON_PLATE as usize] - p0;
    assert!((9..=10).contains(&got), "10 cycles doivent donner 10 plaques : {got}");
    assert_eq!(w.players[0].stock[IRON_ORE as usize], st0[IRON_ORE as usize], "le minerai est fondu, pas stocké");
    assert!(w.players[0].produced[IRON_PLATE as usize] >= got as u32, "comptée dans la production");
    // l'ordre ne se termine pas seul
    assert_eq!(first(&w, cmd), Some(Order::Harvest { x: 100, y: 100 }));
    assert_eq!(state(&w, cmd), HV_WORKING);
    // effet visible : le commandant est marqué au travail
    assert!(w.units.cold[s].flags & UF_WORKING != 0);

    // cuivre : plaque de cuivre
    let c0 = w.players[0].stock[COPPER_PLATE as usize];
    harvest(&mut w, &[cmd], 110, 100, false);
    steps(&mut w, 600);
    assert!(w.players[0].stock[COPPER_PLATE as usize] - c0 >= 4, "le cuivre donne des plaques de cuivre");
    assert_eq!(w.players[0].stock[COPPER_ORE as usize], st0[COPPER_ORE as usize]);
}

/// Seuls les gisements qu'une fonderie sait fondre se récoltent : le silicium attend la recette de la
/// plaquette (électronique) ; l'hydrocarbure, le cristal et une case sans gisement sont refusés.
#[test]
fn harvest_needs_a_smeltable_deposit() {
    let (mut w, cmd) = world(1);
    for (x, y) in [(110, 110), (120, 110), (95, 95), (100, 110), (-5, 3), (100, 600)] {
        harvest(&mut w, &[cmd], x, y, false);
        assert_eq!(first(&w, cmd), None, "ordre refusé en {x},{y}");
    }
    // la recherche électronique débloque la plaquette de silicium
    w.players[0].researched |= 1u64 << T_ELECTRONICS;
    let r = RECIPES.iter().position(|r| r.key == "wafer").unwrap();
    assert_eq!(smelt_recipe(SILICON), Some(r));
    harvest(&mut w, &[cmd], 100, 110, false);
    assert_eq!(first(&w, cmd), Some(Order::Harvest { x: 100, y: 110 }));
    let w0 = w.players[0].stock[WAFER as usize];
    steps(&mut w, 1200);
    let got = w.players[0].stock[WAFER as usize] - w0;
    assert!(got >= 3, "le silicium donne des plaquettes : {got}");
    assert_eq!(harvest_cycle(r), 120);
}

/// Un nouvel ordre ou l'arrêt annule la récolte ; un ordre en file (Maj) passe d'abord.
#[test]
fn new_order_interrupts_harvest() {
    let (mut w, cmd) = world(1);
    harvest(&mut w, &[cmd], 100, 100, false);
    steps(&mut w, 400);
    assert_eq!(state(&w, cmd), HV_WORKING);
    // déplacement sans Maj : la récolte est annulée
    w.step(&[9, O_MOVE, 0, 0, 80 * TILE, 80 * TILE, 1, cmd as i32, 80 * TILE, 80 * TILE]);
    assert!(matches!(first(&w, cmd), Some(Order::Move { .. })));
    assert_eq!(w.units.cold[w.unit(cmd).unwrap()].orders.len(), 1);
    let p0 = w.players[0].stock[IRON_PLATE as usize];
    steps(&mut w, 300);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], p0, "plus de récolte après un nouvel ordre");
    // récolte en file derrière un déplacement : il récolte une fois arrivé
    w.step(&[9, O_MOVE, 0, 0, 75 * TILE, 75 * TILE, 1, cmd as i32, 75 * TILE, 75 * TILE]);
    harvest(&mut w, &[cmd], 100, 100, true);
    assert_eq!(w.units.cold[w.unit(cmd).unwrap()].orders.len(), 2);
    steps(&mut w, 1000);
    assert_eq!(first(&w, cmd), Some(Order::Harvest { x: 100, y: 100 }));
    assert!(w.players[0].stock[IRON_PLATE as usize] > p0);
    // arrêt
    w.step(&[4, O_STOP, 0, 1, cmd as i32]);
    assert_eq!(first(&w, cmd), None);
    let p1 = w.players[0].stock[IRON_PLATE as usize];
    steps(&mut w, 200);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], p1);
}

/// Combat : tant que le canon du commandant a une cible, la fonderie s'arrête ; l'ordre reste et la
/// récolte reprend seule quand l'ennemi est parti.
#[test]
fn combat_pauses_harvest() {
    let (mut w, cmd) = world(2);
    harvest(&mut w, &[cmd], 100, 100, false);
    steps(&mut w, 400);
    assert_eq!(state(&w, cmd), HV_WORKING);
    let s = w.unit(cmd).unwrap();
    let (cx, cy) = (w.units.x[s], w.units.y[s]);
    // un ennemi immobile, très solide, à portée de canon
    let foe = w.spawn_unit(U_LINE_ROBOT, 1, cx + 6 * TILE, cy);
    let fs = w.unit(foe).unwrap();
    w.units.hp[fs] = 1_000_000_000;
    steps(&mut w, 20);
    assert_eq!(state(&w, cmd), HV_COMBAT, "le commandant combat");
    let p0 = w.players[0].stock[IRON_PLATE as usize];
    let work = w.units.cold[w.unit(cmd).unwrap()].work;
    steps(&mut w, 300);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], p0, "pas de récolte pendant le combat");
    assert_eq!(w.units.cold[w.unit(cmd).unwrap()].work, work, "le cycle en cours est gelé");
    assert_eq!(first(&w, cmd), Some(Order::Harvest { x: 100, y: 100 }), "l'ordre reste");
    // l'ennemi s'en va loin : la récolte reprend
    let fs = w.unit(foe).unwrap();
    w.units.cold[fs].orders.clear();
    w.units.x[fs] = 300 * TILE;
    w.units.y[fs] = 300 * TILE;
    w.units.px[fs] = 300 * TILE;
    w.units.py[fs] = 300 * TILE;
    steps(&mut w, 300);
    assert_eq!(state(&w, cmd), HV_WORKING);
    assert!(w.players[0].stock[IRON_PLATE as usize] > p0, "la récolte a repris");
}

/// Réserve pleine pour le produit fondu : la récolte attend, sans rien perdre, et reprend quand il y a de la place.
#[test]
fn full_stock_pauses_harvest() {
    let (mut w, cmd) = world(1);
    harvest(&mut w, &[cmd], 100, 100, false);
    steps(&mut w, 400);
    let cap = w.players[0].stock_cap;
    w.players[0].stock[IRON_PLATE as usize] = cap;
    steps(&mut w, 200);
    assert_eq!(state(&w, cmd), HV_FULL);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], cap, "jamais au-delà du plafond");
    w.players[0].stock[IRON_PLATE as usize] = cap - 50;
    steps(&mut w, 200);
    assert_eq!(state(&w, cmd), HV_WORKING);
    assert!(w.players[0].stock[IRON_PLATE as usize] > cap - 50);
}

/// La récolte en cours survit à une sauvegarde : mêmes hash après restore (carte générée, gisement naturel).
#[test]
fn harvest_survives_snapshot() {
    let mut w = World::new(&params(1));
    let cmd = w.players[0].commander;
    let s = w.unit(cmd).unwrap();
    let (cx, cy) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
    // gisement de fer naturel le plus proche du commandant
    let sp = *w.map.spots.iter().filter(|s| s.kind == IRON_ORE).min_by_key(|s| (s.x - cx).abs() + (s.y - cy).abs()).expect("gisement de fer");
    harvest(&mut w, &[cmd], sp.x, sp.y, false);
    steps(&mut w, 700);
    assert_eq!(state(&w, cmd), HV_WORKING, "le commandant récolte");
    let snap = crate::save::snapshot(&w);
    let mut c = crate::save::restore(&snap).unwrap();
    assert_eq!(first(&c, cmd), Some(Order::Harvest { x: sp.x, y: sp.y }));
    for _ in 0..300 {
        assert_eq!(w.step(&[]), c.step(&[]), "snapshot/restore diverge pendant la récolte");
    }
    assert_eq!(w.players[0].stock, c.players[0].stock);
}
