//! Tests : économie d'une zone électrique (barre des ressources, voir zone_eco.rs).

use crate::buildings::{complete_building, place_building, power_prod_of};
use crate::data::*;
use crate::world::*;
use crate::zone_eco::{zone_at, zone_economy, Zone};

fn params() -> Vec<i32> {
    vec![4242, 256, 0, 1, 0, 0, 60, 60]
}

/// Monde d'un joueur où les zones comptent, terrain plat et sans gisement de (130, 130) à (230, 230).
fn world() -> World {
    let mut w = World::new(&params());
    w.infinite_grid = false;
    w.map.spots.retain(|s| !(s.x >= 128 && s.x < 230 && s.y >= 128 && s.y < 230));
    for y in 130..230 {
        for x in 130..230 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
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

fn set_recipe(w: &mut World, b: usize, key: &str) {
    let r = RECIPES.iter().position(|r| r.key == key).unwrap() as i32;
    let rf = w.building_ref(b) as i32;
    w.step(&[4, crate::orders::O_SET_RECIPE, 0, rf, r]);
}

/// Champ entier ou liste d'entiers du JSON de zone_economy.
fn field(s: &str, k: &str) -> Vec<i64> {
    let at = s.find(&format!("\"{}\":", k)).unwrap_or_else(|| panic!("{} absent de {}", k, s)) + k.len() + 3;
    let rest = &s[at..];
    let body = if let Some(r) = rest.strip_prefix('[') { &r[..r.find(']').unwrap()] } else { &rest[..rest.find([',', '}']).unwrap()] };
    body.split(',').filter(|x| !x.is_empty()).map(|x| x.parse().unwrap()).collect()
}

#[test]
fn zone_counts_its_machines_depots_and_fuel() {
    let mut w = world();
    let g = put(&mut w, B_GENERATOR, 170, 170);
    let f = put(&mut w, B_FURNACE, 174, 170);
    let d_in = put(&mut w, B_DEPOT, 170, 175);
    let d_out = put(&mut w, B_DEPOT, 215, 215);
    w.buildings[d_in].stash = vec![0; NUM_ITEMS];
    w.buildings[d_in].stash[IRON_ORE as usize] = 77;
    w.buildings[d_out].stash = vec![0; NUM_ITEMS];
    w.buildings[d_out].stash[IRON_ORE as usize] = 500;
    set_recipe(&mut w, f, "iron_plate");
    for _ in 0..3 {
        w.step(&[]);
    }
    let net = w.buildings[g].net;
    assert!(net != 0);
    assert_eq!(zone_at(&w, 0, 171, 171), Zone::Live(net));
    assert_eq!(zone_at(&w, 0, 225, 225), Zone::None, "loin de tout poteau");
    let s = zone_economy(&w, 0, 171, 171);
    assert_eq!(field(&s, "zone"), [1]);
    assert_eq!(field(&s, "net"), [net as i64]);
    // stock : le dépôt de la zone seulement (l'autre est hors zone)
    assert_eq!(field(&s, "stock")[IRON_ORE as usize], 77);
    assert_eq!(field(&s, "cap"), [DEPOT_CAP[0] as i64]);
    // fonderie de base : une plaque toutes les 40 ticks à vitesse 100, soit 30 par minute
    assert_eq!(bdef(B_FURNACE).speed, 100);
    assert_eq!(field(&s, "prod")[IRON_PLATE as usize], 3000);
    assert_eq!(field(&s, "cons")[IRON_ORE as usize], 3000);
    // générateur à pleine charge : sa puissance en hydrocarbures (1 500 kW·s chacun)
    let hydro = power_prod_of(&w.buildings[g]) as i64 * 100 * 1200 / FUEL_HYDROCARBON as i64;
    assert_eq!(field(&s, "cons")[HYDROCARBON as usize], hydro);
    assert_eq!(field(&s, "machines"), [2]);
    // hors zone : rien
    assert_eq!(zone_economy(&w, 0, 225, 225), "{\"zone\":0}");
}

#[test]
fn overclock_raises_the_maximum() {
    let mut w = world();
    put(&mut w, B_GENERATOR, 170, 170);
    let f = put(&mut w, B_FURNACE, 174, 170);
    set_recipe(&mut w, f, "iron_plate");
    w.players[0].shards = 3;
    assert!(crate::buildings::set_clock(&mut w, f, 200));
    w.step(&[]);
    let s = zone_economy(&w, 0, 171, 171);
    assert_eq!(field(&s, "prod")[IRON_PLATE as usize], 6000, "200 % : 60 par minute");
}

#[test]
fn dry_generator_keeps_a_dead_zone_with_its_depot() {
    let mut w = world();
    let g = put(&mut w, B_GENERATOR, 170, 170);
    let d = put(&mut w, B_DEPOT, 170, 175);
    w.buildings[d].stash = vec![0; NUM_ITEMS];
    w.buildings[d].stash[HYDROCARBON as usize] = 5;
    w.buildings[g].fuel = 0;
    w.power_dirty = true;
    w.step(&[]);
    assert_eq!(zone_at(&w, 0, 171, 171), Zone::Dry(g));
    let s = zone_economy(&w, 0, 171, 171);
    assert_eq!(field(&s, "zone"), [2]);
    assert_eq!(field(&s, "stock")[HYDROCARBON as usize], 5);
    // le générateur à sec compte encore sa consommation maximale (celle qu'il aurait, ravitaillé)
    assert!(field(&s, "cons")[HYDROCARBON as usize] > 0);
}

/// Export en lecture seule : l'état (hash) ne change pas.
#[test]
fn zone_economy_does_not_touch_the_state() {
    let mut w = world();
    put(&mut w, B_GENERATOR, 170, 170);
    w.step(&[]);
    let h = w.hash();
    let _ = zone_economy(&w, 0, 171, 171);
    let _ = zone_economy(&w, 0, 10, 10);
    assert_eq!(h, w.hash());
}

/// Souche : le réseau de racines au centre de l'écran, sa réserve et la sève de sa graine-mère.
#[test]
fn souche_follows_the_root_network() {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    w.place_start_buildings();
    for _ in 0..3 {
        w.step(&[]);
    }
    let heart = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == 0 && w.buildings[b].kind == B_SEED_HEART).unwrap();
    // la graine-mère du départ est poussée : elle a son réseau
    let net = w.buildings[heart].net;
    assert!(net != 0);
    let (cx, cy) = w.buildings[heart].center();
    let (tx, ty) = (cx / crate::fixed::TILE, cy / crate::fixed::TILE);
    assert_eq!(zone_at(&w, 0, tx, ty), Zone::Roots(net));
    let s = zone_economy(&w, 0, tx, ty);
    assert_eq!(field(&s, "zone"), [3]);
    assert_eq!(field(&s, "stock")[SEVE as usize], w.nets[net as usize].seve as i64);
    assert_eq!(field(&s, "cap"), [w.nets[net as usize].store as i64]);
    // une sève par seconde
    assert!(field(&s, "prod")[SEVE as usize] >= 6000);
}
