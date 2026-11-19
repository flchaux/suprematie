//! Tests de la logistique : entrepôt d'équipe, trains, drones de fret, sauvegarde en cours de trajet.

use crate::buildings::{complete_building, insert_item, place_building, remove_building};
use crate::data::*;
use crate::world::*;

/// Deux joueurs dans la même équipe (alliés).
fn allies() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 0, 0, 100, 100]);
    w.infinite_grid = true;
    for p in w.players.iter_mut() {
        p.researched = u64::MAX;
    }
    w
}

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

fn put(w: &mut World, owner: u8, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, owner, kind, x, y, 0).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    // les générateurs des tests ont un réservoir inépuisable (la combustion a ses propres tests)
    if bdef(kind).class == BClass::Power {
        w.buildings[b].fuel = 1_000_000_000;
    }
    b
}

/// Gare (ou héliport) alimentée par un générateur juste au-dessus.
fn station(w: &mut World, owner: u8, kind: u16, x: i32, y: i32) -> usize {
    put(w, owner, B_GENERATOR, x, y - 3);
    put(w, owner, kind, x, y)
}

fn run(w: &mut World, ticks: u32) {
    for _ in 0..ticks {
        w.step(&[]);
    }
}

const N: usize = NUM_ITEMS;

#[test]
fn warehouse_feeds_team_stock_used_by_allies() {
    let mut w = allies();
    flatten(&mut w, 100, 100, 130, 130);
    let wh = put(&mut w, 0, B_WAREHOUSE, 110, 110);
    for _ in 0..50 {
        insert_item(&mut w, wh, IRON_PLATE);
    }
    assert_eq!(w.team_stock[0][IRON_PLATE as usize], 50);
    // l'allié (joueur 1) peut payer avec : son stock d'abord, puis celui de l'équipe
    let own = w.players[1].stock[IRON_PLATE as usize];
    assert_eq!(w.avail(1, IRON_PLATE), own + 50);
    w.pay(1, IRON_PLATE, own + 20);
    assert_eq!(w.players[1].stock[IRON_PLATE as usize], 0);
    assert_eq!(w.team_stock[0][IRON_PLATE as usize], 30);
    // sortie physique : un bras ne prend que l'objet choisi
    let mut want = [true; N];
    want[0] = false;
    assert_eq!(crate::logistics::take(&mut w, wh, &want), 0, "aucun objet choisi : rien ne sort");
    w.buildings[wh].recipe = IRON_PLATE;
    assert_eq!(crate::logistics::take(&mut w, wh, &want), IRON_PLATE);
    assert_eq!(w.team_stock[0][IRON_PLATE as usize], 29);
}

/// Deux gares reliées par 69 cases de rail ; 500 plaques à livrer (capacité du train : 400).
fn rail_world() -> (World, usize, usize) {
    let mut w = allies();
    flatten(&mut w, 25, 90, 120, 110);
    let a = station(&mut w, 0, B_STATION, 30, 100);
    let b = station(&mut w, 1, B_STATION, 101, 100);
    for x in 32..101 {
        put(&mut w, 0, B_RAIL, x, 101);
    }
    run(&mut w, 10); // réseaux électriques
    w.buildings[a].stash[IRON_PLATE as usize] = 500;
    w.players[0].stock[GEAR as usize] = 100;
    w.players[0].stock[IRON_PLATE as usize] = 100;
    w.players[0].stock[STEEL as usize] = 100;
    let rb = w.building_ref(b);
    crate::logistics::link(&mut w, 0, a, rb);
    assert_eq!(w.carriers.len(), 1, "le train est acheté");
    (w, a, b)
}

#[test]
fn train_delivers_to_ally_station() {
    let (mut w, a, b) = rail_world();
    run(&mut w, 3000);
    assert_eq!(w.buildings[b].stash[N + IRON_PLATE as usize], 500, "tout est livré dans la gare de l'allié");
    assert_eq!(w.buildings[a].stash[IRON_PLATE as usize], 0);
    // le retour à vide puis l'aller-retour suivant : la gare de l'allié peut renvoyer des objets
    w.buildings[b].stash[COPPER_PLATE as usize] = 30;
    run(&mut w, 1500);
    assert_eq!(w.buildings[a].stash[N + COPPER_PLATE as usize], 30, "chargement dans l'autre sens");
}

#[test]
fn train_waits_for_cut_rail_then_resumes() {
    let (mut w, _a, b) = rail_world();
    run(&mut w, 70); // fin du premier arrêt
    // coupure de la voie au milieu
    let mid = w.map.occ[w.map.idx(70, 101)] as usize - 1;
    remove_building(&mut w, mid, false);
    run(&mut w, 1500);
    assert_eq!(w.buildings[b].stash[N + IRON_PLATE as usize], 0, "rien ne passe tant que la voie est coupée");
    put(&mut w, 0, B_RAIL, 70, 101);
    run(&mut w, 3000);
    assert_eq!(w.buildings[b].stash[N + IRON_PLATE as usize], 500, "le train repart une fois la voie réparée");
}

#[test]
fn cargo_drones_fly_straight_with_small_loads() {
    let mut w = allies();
    flatten(&mut w, 25, 90, 160, 110);
    let a = station(&mut w, 0, B_CARGO_PAD, 30, 100);
    let b = station(&mut w, 0, B_CARGO_PAD, 150, 100);
    run(&mut w, 10);
    w.buildings[a].stash[CIRCUIT as usize] = 60;
    w.players[0].stock[STEEL as usize] = 100;
    w.players[0].stock[CIRCUIT as usize] = 100;
    let rb = w.building_ref(b);
    crate::logistics::link(&mut w, 0, a, rb);
    // un aller : 120 cases à 24 cases/s = 5 s ; chaque vol emporte 25 objets au plus
    run(&mut w, 200);
    let first = w.buildings[b].stash[N + CIRCUIT as usize];
    assert_eq!(first, 25, "premier vol : une petite cargaison");
    run(&mut w, 1200);
    assert_eq!(w.buildings[b].stash[N + CIRCUIT as usize], 60);
    // relier une gare à elle-même retire ses véhicules
    let ra = w.building_ref(a);
    crate::logistics::link(&mut w, 0, a, ra);
    run(&mut w, 1);
    assert!(w.carriers.iter().all(|c| !c.alive));
}

#[test]
fn snapshot_with_carriers_in_flight_is_deterministic() {
    let (mut w, _a, _b) = rail_world();
    run(&mut w, 150); // train en route
    assert!(w.carriers[0].state == 1, "le train roule");
    let snap = crate::save::snapshot(&w);
    let mut w2 = crate::save::restore(&snap).expect("restauration");
    for _ in 0..1500 {
        assert_eq!(w.step(&[]), w2.step(&[]));
    }
}

/// Objets par voyage réglés sur la gare : le train charge au plus ce nombre et attend de l'avoir pour
/// partir ; en automatique, il part dès qu'il a quelque chose.
#[test]
fn train_trip_size_is_configurable() {
    use crate::orders::O_SET_LOT;
    let (mut w, a, b) = rail_world();
    w.buildings[a].stash[IRON_PLATE as usize] = 30;
    let ra = w.building_ref(a) as i32;
    w.step(&[4, O_SET_LOT, 0, ra, 100]);
    assert_eq!(w.buildings[a].lot, 100);
    // 30 plaques seulement : le train attend à quai
    run(&mut w, 600);
    assert_eq!(w.carriers[0].state, 0, "il attend un voyage complet");
    assert_eq!(w.buildings[b].stash[N + IRON_PLATE as usize], 0);
    // 250 de plus : il part avec 100, pas plus
    w.buildings[a].stash[IRON_PLATE as usize] += 250;
    run(&mut w, 40);
    assert_eq!(w.carriers[0].state, 1, "parti");
    assert_eq!(w.carriers[0].load, 100, "un voyage de 100");
    // automatique : il part dès qu'il a quelque chose
    w.step(&[4, O_SET_LOT, 0, ra, 0]);
    run(&mut w, 3000);
    assert_eq!(w.buildings[b].stash[N + IRON_PLATE as usize], 280, "tout est livré");
    // borné par la capacité ; seulement pour une gare ou un héliport du joueur
    w.step(&[4, O_SET_LOT, 0, ra, 9999]);
    assert_eq!(w.buildings[a].lot, CARRIERS[0].capacity);
    let rb = w.building_ref(b) as i32;
    w.step(&[4, O_SET_LOT, 0, rb, 50]);
    assert_eq!(w.buildings[b].lot, 0, "la gare de l'allié n'est pas à nous");
}

/// Gares sans électricité : une gare dans une zone sous-alimentée (ou éteinte) reçoit quand même le train
/// et le décharge (on peut toujours livrer du combustible à une zone en panne).
#[test]
fn stations_work_in_an_underpowered_zone() {
    let mut w = allies();
    w.infinite_grid = false;
    flatten(&mut w, 25, 90, 120, 120);
    let a = station(&mut w, 0, B_STATION, 30, 100);
    let b = station(&mut w, 0, B_STATION, 101, 100);
    for x in 32..101 {
        put(&mut w, 0, B_RAIL, x, 101);
    }
    // gros consommateur dans la zone de la gare B : 3 000 kW pour 400 produits
    put(&mut w, 0, B_ORBITAL, 104, 92);
    run(&mut w, 40);
    w.buildings[a].stash[HYDROCARBON as usize] = 100;
    w.players[0].stock[GEAR as usize] = 100;
    w.players[0].stock[IRON_PLATE as usize] = 100;
    w.players[0].stock[STEEL as usize] = 100;
    let rb = w.building_ref(b);
    crate::logistics::link(&mut w, 0, a, rb);
    run(&mut w, 3000);
    assert_eq!(w.buildings[b].stash[N + HYDROCARBON as usize], 100, "déchargé malgré la zone sous-alimentée");
}
