//! Tests : dépôts à stock propre et drones de ravitaillement des constructeurs (voir drones.rs).

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::drones::{has, DRONE};
use crate::fixed::TILE;
use crate::world::*;

/// Un joueur (deux pour les tests d'équipe), recherche faite, réseau partout, terrain plat de 40 à 200.
fn world(np: usize) -> World {
    let mut p = vec![4242, 512, 0, np as i32];
    for i in 0..np {
        p.extend_from_slice(&[i as i32, 0, 100, 100]);
    }
    let mut w = World::new(&p);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    for y in 40..200 {
        for x in 40..200 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.map.spots.retain(|s| !(s.x >= 38 && s.x < 200 && s.y >= 38 && s.y < 200));
    w
}

fn depot(w: &mut World, owner: u8, x: i32, y: i32, items: &[(u8, u16)]) -> usize {
    let d = place_building(w, owner, B_DEPOT, x, y, 0).expect("dépôt");
    complete_building(w, d);
    for &(it, n) in items {
        crate::drones::put(&mut w.buildings[d].stash, it, n);
    }
    d
}

fn engineer(w: &mut World, x: i32, y: i32) -> (u32, usize) {
    let id = w.spawn_unit(U_ENG1, 0, x * TILE, y * TILE);
    (id, w.unit(id).unwrap())
}

fn build(w: &mut World, id: u32, kind: u16, x: i32, y: i32) {
    let s = w.unit(id).unwrap();
    w.units.cold[s].orders.push(Order::Build { kind, x, y, dir: 0, bid: 0 });
}

fn site(w: &World, kind: u16, x: i32, y: i32) -> Option<usize> {
    let o = w.map.occ[w.map.idx(x, y)];
    (o != 0 && w.buildings[o as usize - 1].kind == kind).then(|| o as usize - 1)
}

fn cost_of(kind: u16, it: u8) -> u16 {
    bdef(kind).cost.iter().find(|c| c.0 == it).map_or(0, |c| c.1)
}

fn drones_of(w: &World, home: u32) -> usize {
    w.carriers.iter().filter(|c| c.alive && c.kind == DRONE && c.a == home).count()
}

/// Près d'un dépôt, les drones de l'ingénieur (2 au plus, 10 objets par voyage) y prennent ce que le
/// chantier demande ; la construction se paie depuis sa soute ; le dépôt perd exactement le coût.
#[test]
fn engineer_drones_fetch_from_a_nearby_depot() {
    let mut w = world(1);
    let d = depot(&mut w, 0, 100, 110, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    let (id, _) = engineer(&mut w, 100, 100);
    build(&mut w, id, B_GENERATOR, 104, 100);
    let mut most = 0;
    let mut loaded_seen = false;
    for _ in 0..1200 {
        w.step(&[]);
        most = most.max(drones_of(&w, id));
        loaded_seen |= w.carriers.iter().any(|c| c.alive && c.kind == DRONE && c.ready && c.load > 0 && c.load <= DRONE_CAP);
    }
    let g = site(&w, B_GENERATOR, 104, 100).expect("chantier posé");
    assert!(w.buildings[g].complete(), "générateur construit");
    assert!((1..=2).contains(&most), "drones en vol : {most}");
    assert!(loaded_seen, "un drone chargé a été vu en vol");
    for &(it, n) in bdef(B_GENERATOR).cost {
        let start = match it {
            IRON_PLATE => 200,
            COPPER_PLATE => 100,
            _ => 50,
        };
        let s = w.unit(id).unwrap();
        let left = has(&w.buildings[d].stash, it) + has(&w.units.cold[s].hold, it);
        assert_eq!(left, start - n, "le coût exact a été pris ({})", ITEMS[it as usize].key);
    }
    // plus rien à faire : la soute se vide dans le dépôt
    let s = w.unit(id).unwrap();
    assert_eq!(crate::drones::total(&w.units.cold[s].hold), 0, "soute vidée");
}

/// Chantier loin de tout dépôt : l'ingénieur revient d'abord à portée du dépôt, attend que ses drones
/// soient partis chercher tout le coût (ils le rejoignent en vol), puis va construire avec ce qu'il emporte.
#[test]
fn engineer_loads_before_building_out_of_reach() {
    let mut w = world(1);
    let d = depot(&mut w, 0, 60, 100, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    // à 60 cases du dépôt, ingénieur entre les deux (à 30 cases de chacun : hors de son rayon de 25)
    let (id, _) = engineer(&mut w, 90, 100);
    build(&mut w, id, B_GENERATOR, 120, 100);
    let mut went_back = false;
    let mut loaded_before = false;
    for _ in 0..3000 {
        w.step(&[]);
        let s = w.unit(id).unwrap();
        // revenu à portée du dépôt (25 cases de son centre)
        if w.units.x[s] < 86 * TILE {
            went_back = true;
        }
        if site(&w, B_GENERATOR, 120, 100).is_some() && !loaded_before {
            // au moment de poser le chantier, il a déjà tout sur lui
            let s = w.unit(id).unwrap();
            loaded_before = bdef(B_GENERATOR).cost.iter().all(|&(it, n)| has(&w.units.cold[s].hold, it) >= n);
        }
        if site(&w, B_GENERATOR, 120, 100).is_some_and(|g| w.buildings[g].complete()) {
            break;
        }
    }
    assert!(went_back, "il est d'abord allé au dépôt");
    assert!(loaded_before, "il emporte le coût du chantier avant d'y aller");
    let g = site(&w, B_GENERATOR, 120, 100).expect("chantier posé");
    assert!(w.buildings[g].complete(), "construit avec ce qu'il a emporté");
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE), 200 - cost_of(B_GENERATOR, IRON_PLATE));
}

/// Rien de disponible : le chantier reste à l'arrêt, sans rien perdre ; la fiche dit ce qui manque et ce
/// qui est à portée. Un dépôt rempli plus tard débloque tout.
#[test]
fn site_waits_when_nothing_is_available() {
    let mut w = world(1);
    let (id, _) = engineer(&mut w, 100, 100);
    build(&mut w, id, B_GENERATOR, 104, 100);
    for _ in 0..400 {
        w.step(&[]);
    }
    let g = site(&w, B_GENERATOR, 104, 100).expect("chantier posé quand même");
    assert!(!w.buildings[g].complete() && w.buildings[g].stalled, "à l'arrêt");
    let miss = crate::drones::site_missing(&w, g);
    assert_eq!(miss.len(), bdef(B_GENERATOR).cost.len());
    assert!(miss.iter().all(|&(it, n, near)| n == cost_of(B_GENERATOR, it) as u32 && near == 0));
    let info = crate::render::info_building(&w, w.building_ref(g));
    assert!(info.contains("\"missing\":[["), "fiche : {info}");
    // un dépôt apparaît à portée : le chantier reprend
    let d = depot(&mut w, 0, 100, 108, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    let miss = crate::drones::site_missing(&w, g);
    assert!(miss.iter().all(|&(it, _, near)| near == has(&w.buildings[d].stash, it) as u32));
    for _ in 0..1200 {
        w.step(&[]);
    }
    assert!(w.buildings[g].complete());
    assert!(crate::drones::site_missing(&w, g).is_empty());
}

/// Recyclage d'une épave : le produit va dans la soute de l'ingénieur (plafonnée), puis ses drones le
/// rapportent au dépôt le plus proche.
#[test]
fn reclaimed_wreck_goes_to_hold_then_depot() {
    let mut w = world(1);
    let d = depot(&mut w, 0, 100, 112, &[]);
    let (id, s) = engineer(&mut w, 100, 100);
    w.spawn_wreck(104 * TILE, 100 * TILE, &[(IRON_PLATE, 60), (STEEL, 20)], 2, 0, 0);
    let wk = (0..w.wrecks.len()).find(|&k| w.wrecks[k].alive).unwrap();
    let r = w.wreck_ref(wk);
    w.units.cold[s].orders.push(Order::Reclaim { target: r });
    for _ in 0..1200 {
        w.step(&[]);
    }
    let s = w.unit(id).unwrap();
    assert!(!w.wrecks[wk].alive, "épave recyclée");
    let got = has(&w.buildings[d].stash, IRON_PLATE) + has(&w.buildings[d].stash, STEEL);
    assert!(got > 0, "le recyclage est arrivé au dépôt");
    assert_eq!(crate::drones::total(&w.units.cold[s].hold), 0, "soute vidée");
}

/// Choix du dépôt : le plus proche du constructeur ; les dépôts d'un allié ne servent pas, son entrepôt
/// d'équipe si.
#[test]
fn nearest_usable_depot_is_chosen() {
    let mut w = world(2);
    // deux alliés
    w.players[1].team = 0;
    let near = depot(&mut w, 0, 108, 100, &[(IRON_PLATE, 100)]);
    let far = depot(&mut w, 0, 100, 118, &[(IRON_PLATE, 100)]);
    let ally = depot(&mut w, 1, 96, 100, &[(IRON_PLATE, 100)]);
    let list = crate::drones::stores_near(&w, 0, 100 * TILE, 100 * TILE, 30 * TILE);
    let order: Vec<usize> = list.iter().map(|&(_, b)| b).collect();
    assert_eq!(order, vec![near, far], "du plus proche au plus loin, sans le dépôt de l'allié");
    let wh = place_building(&mut w, 1, B_WAREHOUSE, 94, 104, 0).unwrap();
    complete_building(&mut w, wh);
    assert!(crate::drones::stores_near(&w, 0, 100 * TILE, 100 * TILE, 30 * TILE).iter().any(|&(_, b)| b == wh), "entrepôt d'équipe utilisable");
    assert!(crate::drones::usable(&w, 1, ally) && !crate::drones::usable(&w, 0, ally));
}

/// Le constructeur disparaît pendant un vol : le drone rapporte son chargement à son dépôt.
#[test]
fn drone_returns_cargo_when_its_builder_dies() {
    let mut w = world(1);
    let d = depot(&mut w, 0, 100, 120, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    let (id, _) = engineer(&mut w, 100, 100);
    build(&mut w, id, B_GENERATOR, 104, 100);
    let mut t = 0;
    while drones_of(&w, id) == 0 && t < 200 {
        w.step(&[]);
        t += 1;
    }
    assert!(drones_of(&w, id) > 0, "un drone est parti");
    let total0: u32 = w.buildings[d].stash.iter().map(|&n| n as u32).sum::<u32>() + w.carriers.iter().filter(|c| c.alive).map(|c| c.load as u32).sum::<u32>();
    let s = w.unit(id).unwrap();
    w.units.hp[s] = 0;
    w.dead_units.push(s as u32);
    for _ in 0..400 {
        w.step(&[]);
    }
    assert_eq!(w.carriers.iter().filter(|c| c.alive && c.kind == DRONE).count(), 0, "drones disparus");
    let total: u32 = w.buildings[d].stash.iter().map(|&n| n as u32).sum();
    assert_eq!(total, total0, "rien de perdu : le chargement est revenu au dépôt");
}

/// Ressources de départ : un dépôt rempli à côté du générateur principal.
#[test]
fn start_depot_is_placed_next_to_the_main_generator() {
    let mut w = World::new(&[77, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.place_start_buildings();
    for p in 0..2u8 {
        let g = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == p && w.buildings[b].kind == B_MAIN_GENERATOR).unwrap();
        let d = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == p && w.buildings[b].kind == B_DEPOT).expect("dépôt de départ");
        assert!(w.buildings[d].complete());
        let (gx, gy) = w.buildings[g].center();
        let (dx, dy) = w.buildings[d].center();
        assert!(crate::fixed::dist(gx, gy, dx, dy) < 8 * TILE, "à côté du générateur principal");
        for &(it, n) in START_ITEMS {
            assert_eq!(has(&w.buildings[d].stash, it), n);
        }
    }
}

/// Sauvegarde de version 2 : la réserve de chaque joueur devient un dépôt rempli près de son générateur
/// principal ; le stock commun de l'équipe va dans son entrepôt. La suite est déterministe.
#[test]
fn v2_save_converts_reserve_to_a_depot() {
    let mut w = World::new(&[77, 512, 0, 2, 0, 0, 100, 100, 0, 0, 100, 100]);
    w.place_start_buildings();
    // état d'une version 2 : pas de dépôt de départ, une réserve, un entrepôt d'équipe
    for b in 0..w.buildings.len() {
        if w.buildings[b].alive && w.buildings[b].kind == B_DEPOT {
            crate::buildings::remove_building(&mut w, b, false);
        }
    }
    w.players[0].old_stock[IRON_PLATE as usize] = 321;
    w.players[0].old_stock[GEAR as usize] = 12;
    w.players[1].old_stock[COPPER_PLATE as usize] = 70_000;
    let (sx, sy) = w.map.starts[1];
    let mut wh = None;
    'find: for r in 4..20 {
        for dy in -r..=r {
            if let Some(b) = place_building(&mut w, 1, B_WAREHOUSE, sx + r, sy + dy, 0) {
                complete_building(&mut w, b);
                wh = Some(b);
                break 'find;
            }
        }
    }
    let wh = wh.expect("entrepôt");
    let mut team = [[0i32; NUM_ITEMS]; 8];
    team[0][STEEL as usize] = 44;
    let bytes = crate::save::write(&w, 2, &team);
    let mut a = crate::save::restore(&bytes).expect("lecture d'une sauvegarde de version 2");
    let mut b = crate::save::restore(&bytes).unwrap();
    for p in 0..2usize {
        assert!(a.players[p].old_stock.iter().all(|&n| n == 0), "ancienne réserve vidée");
    }
    let d0 = (0..a.buildings.len()).find(|&k| a.buildings[k].alive && a.buildings[k].owner == 0 && a.buildings[k].kind == B_DEPOT).expect("dépôt converti");
    assert!(a.buildings[d0].complete());
    assert_eq!(has(&a.buildings[d0].stash, IRON_PLATE), 321);
    assert_eq!(has(&a.buildings[d0].stash, GEAR), 12);
    let d1 = (0..a.buildings.len()).find(|&k| a.buildings[k].alive && a.buildings[k].owner == 1 && a.buildings[k].kind == B_DEPOT).unwrap();
    assert_eq!(has(&a.buildings[d1].stash, COPPER_PLATE), u16::MAX, "borné à la capacité d'une case");
    assert_eq!(has(&a.buildings[wh].stash, STEEL), 44, "stock de l'équipe dans son entrepôt");
    assert!(a.stores.contains(&(d0 as u32)) && a.stores.contains(&(wh as u32)));
    // la suite est la même pour deux lectures, et une sauvegarde au format courant se relit à l'identique
    for _ in 0..200 {
        assert_eq!(a.step(&[]), b.step(&[]));
    }
    let mut c = crate::save::restore(&crate::save::snapshot(&a)).unwrap();
    for _ in 0..200 {
        assert_eq!(a.step(&[]), c.step(&[]));
    }
}

/// Une partie en cours (drones en vol, soutes) survit à une sauvegarde : mêmes hash après restore.
#[test]
fn drones_in_flight_survive_snapshot() {
    let mut w = world(1);
    depot(&mut w, 0, 100, 115, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    let (id, _) = engineer(&mut w, 100, 100);
    build(&mut w, id, B_GENERATOR, 104, 100);
    let mut t = 0;
    while drones_of(&w, id) == 0 && t < 200 {
        w.step(&[]);
        t += 1;
    }
    w.step(&[]);
    assert!(drones_of(&w, id) > 0);
    let mut c = crate::save::restore(&crate::save::snapshot(&w)).unwrap();
    for _ in 0..600 {
        assert_eq!(w.step(&[]), c.step(&[]), "snapshot/restore diverge avec des drones en vol");
    }
}
