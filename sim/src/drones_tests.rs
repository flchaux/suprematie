//! Tests : dépôts à stock propre et drones de ravitaillement des constructeurs (voir drones.rs).

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::drones::{has, Store, DRONE};
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
    let order: Vec<Store> = list.iter().map(|&(_, st)| st).filter(|st| matches!(st, Store::B(_))).collect();
    assert_eq!(order, vec![Store::B(near), Store::B(far)], "du plus proche au plus loin, sans le dépôt de l'allié");
    let wh = place_building(&mut w, 1, B_WAREHOUSE, 94, 104, 0).unwrap();
    complete_building(&mut w, wh);
    assert!(crate::drones::stores_near(&w, 0, 100 * TILE, 100 * TILE, 30 * TILE).iter().any(|&(_, st)| st == Store::B(wh)), "entrepôt d'équipe utilisable");
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

/// Ressources de départ : dans la soute du commandant, qui compte comme un dépôt ; aucun dépôt au départ.
#[test]
fn start_resources_are_in_the_commander_hold() {
    let mut w = World::new(&[77, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.place_start_buildings();
    for p in 0..2u8 {
        assert!(!(0..w.buildings.len()).any(|b| w.buildings[b].alive && w.buildings[b].owner == p && w.buildings[b].kind == B_DEPOT), "pas de dépôt de départ");
        let s = w.unit(w.players[p as usize].commander).unwrap();
        for &(it, n) in START_ITEMS {
            assert_eq!(has(&w.units.cold[s].hold, it), n);
        }
        let (x, y) = (w.units.x[s], w.units.y[s]);
        assert_eq!(crate::drones::stores_near(&w, p, x, y, TILE), vec![(0, Store::U(s))], "sa soute est un stock");
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
    w.players[0].purse[IRON_PLATE as usize] = 321;
    w.players[0].purse[GEAR as usize] = 12;
    w.players[1].purse[COPPER_PLATE as usize] = 70_000;
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
        assert!(a.players[p].purse.iter().all(|&n| n == 0), "ancienne réserve vidée");
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

/// Générateur à moitié vide : son drone va chercher de l'hydrocarbure dans un dépôt à moins de 30 cases
/// (il n'y a plus de réserve où son dépôt collé puisait) ; trop loin, rien n'arrive.
#[test]
fn generator_drone_fetches_fuel_from_nearby_depot() {
    use crate::buildings::fuel_tank;
    let mut w = world(1);
    w.infinite_grid = false;
    let g = place_building(&mut w, 0, B_GENERATOR, 100, 100, 0).unwrap();
    complete_building(&mut w, g);
    w.buildings[g].fuel = 0;
    let far = depot(&mut w, 0, 140, 100, &[(HYDROCARBON, 50)]);
    for _ in 0..200 {
        w.step(&[]);
    }
    assert_eq!(w.buildings[g].fuel, 0, "dépôt à 40 cases : trop loin");
    let d = depot(&mut w, 0, 112, 100, &[(HYDROCARBON, 50)]);
    for _ in 0..400 {
        w.step(&[]);
    }
    assert!(w.buildings[g].fuel > fuel_tank(B_GENERATOR) / 2, "réservoir rempli par drone : {}", w.buildings[g].fuel);
    assert!(has(&w.buildings[d].stash, HYDROCARBON) < 50);
    assert_eq!(has(&w.buildings[far].stash, HYDROCARBON), 50);
}

/// Sauvegarde sans numéro (« SUPR ») à la disposition de la version 2 : lue comme une version 2, puis
/// convertie (la réserve devient un dépôt).
#[test]
fn unversioned_save_is_read_as_v2_and_converted() {
    use crate::ser::{Ser, W};
    let mut w = World::new(&[77, 512, 0, 1, 0, 0, 100, 100]);
    w.place_start_buildings();
    for b in 0..w.buildings.len() {
        if w.buildings[b].alive && w.buildings[b].kind == B_DEPOT {
            crate::buildings::remove_building(&mut w, b, false);
        }
    }
    w.players[0].purse[STEEL as usize] = 77;
    let v2 = crate::save::write(&w, 2, &[]);
    // en-tête « SUP2 » + version (5 + 1 octets) remplacé par « SUPR » seul
    let mut o = W::new();
    0x5355_5052u32.ser(&mut o);
    let mut bytes = o.buf;
    bytes.extend_from_slice(&v2[6..]);
    let a = crate::save::restore(&bytes).expect("sauvegarde sans numéro lue");
    let d = (0..a.buildings.len()).find(|&k| a.buildings[k].alive && a.buildings[k].kind == B_DEPOT).expect("dépôt converti");
    assert_eq!(has(&a.buildings[d].stash, STEEL), 77);
}

/// Fer pris au dépôt (et pas encore rendu) : soute, drones en vol et chantiers payés.
fn iron_out(w: &World, d: usize) -> (u16, u16) {
    (200 - has(&w.buildings[d].stash, IRON_PLATE), cost_of(B_GENERATOR, IRON_PLATE))
}

/// File de trois chantiers : les drones vont chercher le coût de toute la file, pas seulement celui du
/// chantier en cours : avant que le premier soit terminé, le dépôt a déjà donné le fer des trois.
#[test]
fn drones_fetch_for_the_whole_queue() {
    let mut w = world(1);
    let d = depot(&mut w, 0, 100, 110, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    let (id, _) = engineer(&mut w, 100, 100);
    for k in 0..3 {
        build(&mut w, id, B_GENERATOR, 104 + 4 * k, 100);
    }
    let mut all_fetched = false;
    for _ in 0..3000 {
        w.step(&[]);
        let (out, cost) = iron_out(&w, d);
        if out >= 3 * cost {
            all_fetched = true;
            break;
        }
        if site(&w, B_GENERATOR, 104, 100).is_some_and(|g| w.buildings[g].complete()) {
            break;
        }
    }
    assert!(all_fetched, "le fer des trois chantiers est parti avant la fin du premier");
    for _ in 0..3000 {
        w.step(&[]);
    }
    for k in 0..3 {
        let g = site(&w, B_GENERATOR, 104 + 4 * k, 100).expect("chantier posé");
        assert!(w.buildings[g].complete(), "générateur {k} construit");
    }
    let (out, cost) = iron_out(&w, d);
    assert_eq!(out, 3 * cost, "le dépôt a perdu exactement le coût des trois");
}

/// Annulation (arrêt) : les prises encore en route rendent leur chargement au dépôt et reviennent à vide,
/// la soute repart au dépôt : rien n'est perdu.
#[test]
fn cancelled_orders_send_resources_back() {
    let mut w = world(1);
    let d = depot(&mut w, 0, 100, 112, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    // chantiers loin du dépôt : l'ingénieur charge d'abord, rien n'est posé tout de suite
    let (id, s) = engineer(&mut w, 100, 100);
    w.units.cold[s].orders.push(Order::Build { kind: B_GENERATOR, x: 150, y: 100, dir: 0, bid: 0 });
    w.units.cold[s].orders.push(Order::Build { kind: B_GENERATOR, x: 154, y: 100, dir: 0, bid: 0 });
    let mut pickup_seen = false;
    for _ in 0..400 {
        w.step(&[]);
        pickup_seen = w.carriers.iter().any(|c| c.alive && c.kind == DRONE && c.a == id && c.state == 1 && !c.ready && c.load > 0);
        let s = w.unit(id).unwrap();
        if pickup_seen && crate::drones::total(&w.units.cold[s].hold) > 0 {
            break;
        }
    }
    assert!(pickup_seen, "une prise est en route vers le dépôt");
    assert!(site(&w, B_GENERATOR, 150, 100).is_none(), "rien n'est encore posé");
    w.step(&[4, crate::orders::O_STOP, 0, 1, id as i32]);
    // à la décision suivante, les prises en route rendent leur chargement réservé
    for _ in 0..crate::drones::PLAN_PERIOD {
        w.step(&[]);
    }
    assert!(
        !w.carriers.iter().any(|c| c.alive && c.kind == DRONE && c.a == id && c.state == 1 && !c.ready && c.load > 0),
        "plus aucune prise en route"
    );
    for _ in 0..1200 {
        w.step(&[]);
    }
    let s = w.unit(id).unwrap();
    assert_eq!(crate::drones::total(&w.units.cold[s].hold), 0, "soute rapatriée");
    assert_eq!(drones_of(&w, id), 0, "drones rentrés");
    for (it, n) in [(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)] {
        assert_eq!(has(&w.buildings[d].stash, it), n, "{} revenu au dépôt", ITEMS[it as usize].key);
    }
}

/// Sans aucun dépôt, un ingénieur près du commandant construit avec ce que porte le commandant : ses drones
/// puisent dans la soute du commandant comme dans un dépôt.
#[test]
fn engineer_fetches_from_the_commander_hold() {
    let mut w = world(1);
    let c = w.unit(w.players[0].commander).unwrap();
    w.units.x[c] = 100 * TILE;
    w.units.y[c] = 110 * TILE;
    w.units.px[c] = 100 * TILE;
    w.units.py[c] = 110 * TILE;
    for &(it, n) in &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)] {
        crate::drones::put(&mut w.units.cold[c].hold, it, n);
    }
    let (id, _) = engineer(&mut w, 100, 100);
    build(&mut w, id, B_GENERATOR, 104, 100);
    let mut from_cmd = false;
    for _ in 0..1500 {
        w.step(&[]);
        let cref = w.players[0].commander;
        from_cmd |= w.carriers.iter().any(|k| k.alive && k.kind == DRONE && k.a == id && k.b == cref);
    }
    assert!(from_cmd, "un drone de l'ingénieur est allé au commandant");
    let g = site(&w, B_GENERATOR, 104, 100).expect("chantier posé");
    assert!(w.buildings[g].complete(), "construit avec la soute du commandant");
    let c = w.unit(w.players[0].commander).unwrap();
    assert_eq!(has(&w.units.cold[c].hold, IRON_PLATE), 200 - cost_of(B_GENERATOR, IRON_PLATE));
}

/// Le commandant qui a les ressources sur lui n'appelle pas le dépôt ; ses drones ne vont chercher que ce
/// qui manque à sa soute pour toute sa file.
#[test]
fn commander_uses_his_hold_before_calling_a_depot() {
    let mut w = world(1);
    let c = w.unit(w.players[0].commander).unwrap();
    let id = w.players[0].commander;
    let (x, y) = (w.units.x[c] / TILE, w.units.y[c] / TILE);
    let d = depot(&mut w, 0, x, y + 10, &[(IRON_PLATE, 200), (COPPER_PLATE, 100), (GEAR, 50), (CIRCUIT, 50)]);
    w.units.cold[c].hold = Vec::new();
    for &(it, n) in bdef(B_GENERATOR).cost {
        crate::drones::put(&mut w.units.cold[c].hold, it, n);
    }
    w.units.cold[c].orders.push(Order::Build { kind: B_GENERATOR, x: x + 4, y, dir: 0, bid: 0 });
    for _ in 0..300 {
        w.step(&[]);
        assert_eq!(drones_of(&w, id), 0, "il a tout sur lui : aucun drone");
    }
    // deux chantiers de plus : il ne va chercher que ce qui manque
    let s = w.unit(id).unwrap();
    w.units.cold[s].orders.push(Order::Build { kind: B_GENERATOR, x: x + 8, y, dir: 0, bid: 0 });
    for _ in 0..2000 {
        w.step(&[]);
    }
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE), 200 - cost_of(B_GENERATOR, IRON_PLATE), "le dépôt n'a donné que le second");
}

/// Un chantier intact a des points de vie au moins à son avancement (sa barre de progression ne montre pas
/// de dégâts) : les gains ne perdent pas leurs arrondis d'un pas à l'autre (`site_hp_gain`). Grand bâtiment
/// (beaucoup de points de vie, des centaines de pas) et tapis (peu de points de vie, gros pas).
#[test]
fn intact_site_keeps_hp_up_with_its_progress() {
    for (kind, x) in [(B_LAND_FACTORY, 110), (B_BELT1, 104)] {
        let mut w = world(1);
        depot(&mut w, 0, 100, 110, &[(IRON_PLATE, 500), (COPPER_PLATE, 300), (GEAR, 200), (CIRCUIT, 200), (STEEL, 200)]);
        let (id, _) = engineer(&mut w, 100, 100);
        build(&mut w, id, kind, x, 100);
        let max = bdef(kind).hp as i64;
        let mut seen = 0;
        for _ in 0..6000 {
            w.step(&[]);
            let Some(b) = site(&w, kind, x, 100) else { continue };
            let bb = &w.buildings[b];
            if bb.complete() {
                break;
            }
            if bb.build > 0 {
                seen += 1;
                // points de vie (sur le maximum) >= avancement (sur BUILD_FULL), à un point de vie près
                assert!((bb.hp as i64 + 1) * BUILD_FULL as i64 >= max * bb.build as i64, "{kind} : {} PV sur {max} à {} / {}", bb.hp, bb.build, BUILD_FULL);
            }
        }
        assert!(seen > 0, "{kind} : chantier commencé");
        let b = site(&w, kind, x, 100).expect("chantier");
        assert!(w.buildings[b].complete(), "{kind} terminé");
    }
}
