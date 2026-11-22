//! Tests : relais logistiques (voir drones.rs, « relais logistiques », et economie.md).

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::drones::{has, Store, DRONE, RELAY_BACK};
use crate::fixed::TILE;
use crate::world::*;

/// Un joueur, recherche faite, réseau partout, terrain plat de 40 à 220 ; commandant à l'écart, soute vide.
fn world() -> World {
    let mut w = World::new(&[4242, 512, 0, 1, 0, 0, 100, 100]);
    w.infinite_grid = true;
    w.players[0].researched = u64::MAX;
    for y in 40..220 {
        for x in 40..220 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.map.spots.retain(|s| !(s.x >= 38 && s.x < 220 && s.y >= 38 && s.y < 220));
    if let Some(c) = w.unit(w.players[0].commander) {
        w.units.x[c] = 60 * TILE;
        w.units.y[c] = 200 * TILE;
        w.units.px[c] = 60 * TILE;
        w.units.py[c] = 200 * TILE;
        w.units.cold[c].hold.clear();
    }
    w
}

fn put(w: &mut World, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, 0, kind, x, y, 0).expect("bâtiment posé");
    complete_building(w, b);
    b
}

fn depot(w: &mut World, x: i32, y: i32, items: &[(u8, u16)]) -> usize {
    let d = put(w, B_DEPOT, x, y);
    for &(it, n) in items {
        crate::drones::put(&mut w.buildings[d].stash, it, n);
    }
    d
}

const STOCK: &[(u8, u16)] = &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)];

/// Dépôt en x = 60, relais en 70, 110, 148 (centres à 40 et 38 cases : reliés de proche en proche).
fn chain(w: &mut World, with_middle: bool) -> usize {
    let d = depot(w, 60, 100, STOCK);
    put(w, B_RELAY, 70, 100);
    if with_middle {
        put(w, B_RELAY, 110, 100);
    }
    put(w, B_RELAY, 148, 100);
    d
}

fn relay_drones(w: &World) -> usize {
    w.carriers.iter().filter(|c| c.alive && c.kind == DRONE && c.relay != 0).count()
}

/// Réseau : relais reliés de proche en proche à 40 cases au plus ; un trou plus grand coupe le réseau ;
/// les stocks du réseau sont ceux à moins de 20 cases d'un de ses relais.
#[test]
fn relay_network_links_relays_within_reach() {
    let mut w = world();
    let d = chain(&mut w, true);
    let (x, y) = (160 * TILE, 100 * TILE);
    let rel = crate::drones::net_relays(&w, 0, x, y, RELAY_RANGE * TILE);
    assert_eq!(rel.len(), 3, "les trois relais sont reliés");
    let st = crate::drones::supply_stores(&w, 0, x, y, NEAR_SUPPLY * TILE, RELAY_RANGE * TILE);
    assert_eq!(st.iter().map(|e| e.1).collect::<Vec<_>>(), vec![Store::B(d)], "le dépôt à 100 cases est dans le réseau");
    assert_eq!(crate::drones::reach_amount(&w, 0, x, y, NEAR_SUPPLY * TILE, IRON_PLATE), 200);
    // hors de la zone du dernier relais : rien
    assert!(crate::drones::supply_stores(&w, 0, 175 * TILE, y, NEAR_SUPPLY * TILE, RELAY_RANGE * TILE).is_empty());
    // sans le relais du milieu (trou de 78 cases) : réseau coupé
    let mut w = world();
    chain(&mut w, false);
    assert_eq!(crate::drones::net_relays(&w, 0, x, y, RELAY_RANGE * TILE).len(), 1);
    assert!(crate::drones::supply_stores(&w, 0, x, y, NEAR_SUPPLY * TILE, RELAY_RANGE * TILE).is_empty());
    // le relais d'un autre joueur ne relie rien
    assert_eq!(crate::drones::reach_amount(&w, 1, x, y, NEAR_SUPPLY * TILE, IRON_PLATE), 0);
}

/// Chantier à 100 cases du dépôt, au bout d'une chaîne de relais : l'ingénieur ne retourne pas se charger
/// au dépôt ; les drones des relais lui portent tout le coût, et le dépôt perd exactement ce coût.
#[test]
fn relay_drones_supply_a_far_site() {
    let mut w = world();
    let d = chain(&mut w, true);
    let id = w.spawn_unit(U_ENG1, 0, 160 * TILE, 100 * TILE);
    let s = w.unit(id).unwrap();
    w.units.cold[s].orders.push(Order::Build { kind: B_GENERATOR, x: 162, y: 104, dir: 0, bid: 0 });
    let mut min_x = i32::MAX;
    let mut seen = 0;
    let mut back = false;
    for _ in 0..2400 {
        w.step(&[]);
        let s = w.unit(id).unwrap();
        min_x = min_x.min(w.units.x[s]);
        seen = seen.max(relay_drones(&w));
        back |= w.carriers.iter().any(|c| c.alive && c.state == RELAY_BACK);
    }
    let o = w.map.occ[w.map.idx(162, 104)];
    assert!(o != 0, "chantier posé");
    let g = o as usize - 1;
    assert!(w.buildings[g].complete(), "générateur construit avec ce que les relais ont apporté");
    assert!(min_x > 140 * TILE, "l'ingénieur n'est pas reparti se charger au dépôt ({})", min_x / TILE);
    assert!((1..=RELAY_DRONES as usize).contains(&seen), "drones de relais en vol : {seen}");
    assert!(back, "les drones rentrent à leur relais après la livraison");
    for &(it, n) in bdef(B_GENERATOR).cost {
        let start = STOCK.iter().find(|e| e.0 == it).unwrap().1;
        let s = w.unit(id).unwrap();
        assert_eq!(has(&w.buildings[d].stash, it) + has(&w.units.cold[s].hold, it), start - n, "coût exact ({})", ITEMS[it as usize].key);
    }
    assert_eq!(relay_drones(&w), 0, "tous rentrés");
}

/// Usine au bout de la chaîne : les drones des relais remplissent sa réserve d'avance ; sans le relais du
/// milieu, rien n'arrive.
#[test]
fn relay_drones_supply_a_far_factory() {
    for with_middle in [true, false] {
        let mut w = world();
        let d = chain(&mut w, with_middle);
        let f = put(&mut w, B_LAND_FACTORY, 158, 98);
        w.buildings[f].queue.push((U_LINE_ROBOT, 5));
        for _ in 0..600 {
            w.step(&[]);
        }
        let got = crate::buildings::factory_has(&w.buildings[f], IRON_PLATE) as u32 + u32::from(w.buildings[f].queue.first().map_or(0, |q| 5 - q.1));
        if with_middle {
            assert!(got > 0, "composants livrés par les relais");
            assert!(has(&w.buildings[d].stash, IRON_PLATE) < 200);
        } else {
            assert_eq!(got, 0, "réseau coupé : rien");
            assert_eq!(has(&w.buildings[d].stash, IRON_PLATE), 200);
        }
    }
}

/// Paiement immédiat (amélioration sur place) : il puise dans les dépôts du réseau des relais qui couvrent
/// le bâtiment.
#[test]
fn immediate_payment_uses_the_relay_network() {
    let mut w = world();
    let d = chain(&mut w, true);
    let (x, y) = (160 * TILE, 100 * TILE);
    assert!(crate::drones::pay_near(&mut w, 0, x, y, &[(IRON_PLATE, 30), (GEAR, 5)]));
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE), 170);
    assert!(!crate::drones::pay_near(&mut w, 0, x, y, &[(STEEL, 1)]), "rien d'autre");
    assert!(!crate::drones::pay_near(&mut w, 0, 190 * TILE, y, &[(IRON_PLATE, 1)]), "hors de portée");
}

/// Couleur des coûts (interface) : le disponible en un point compte le réseau des relais et la soute des
/// constructeurs choisis ; pas le reste du stock du joueur.
#[test]
fn reach_stock_counts_the_network_and_the_builder_hold() {
    let mut w = world();
    chain(&mut w, true);
    depot(&mut w, 100, 180, &[(STEEL, 99)]);
    let id = w.spawn_unit(U_ENG1, 0, 100 * TILE, 150 * TILE);
    let s = w.unit(id).unwrap();
    crate::drones::put(&mut w.units.cold[s].hold, STEEL, 7);
    let v = crate::render::reach_stock(&w, 0, 160 * TILE, 100 * TILE, NEAR_SUPPLY * TILE, &[id]);
    assert_eq!(v[IRON_PLATE as usize], 200);
    assert_eq!(v[STEEL as usize], 7, "soute de l'ingénieur, pas le dépôt lointain");
    let v = crate::render::reach_stock(&w, 0, 190 * TILE, 100 * TILE, NEAR_SUPPLY * TILE, &[]);
    assert_eq!(v[IRON_PLATE as usize], 0);
}

/// Drones de relais en vol : sauvegarde et reprise identiques.
#[test]
fn relay_drones_survive_snapshot() {
    let mut w = world();
    chain(&mut w, true);
    let id = w.spawn_unit(U_ENG1, 0, 160 * TILE, 100 * TILE);
    let s = w.unit(id).unwrap();
    w.units.cold[s].orders.push(Order::Build { kind: B_GENERATOR, x: 162, y: 104, dir: 0, bid: 0 });
    let mut t = 0;
    while relay_drones(&w) == 0 && t < 400 {
        w.step(&[]);
        t += 1;
    }
    assert!(relay_drones(&w) > 0);
    let mut c = crate::save::restore(&crate::save::snapshot(&w)).unwrap();
    assert_eq!(c.relays, w.relays);
    for _ in 0..800 {
        assert_eq!(w.step(&[]), c.step(&[]), "snapshot/restore diverge avec des drones de relais en vol");
    }
}
