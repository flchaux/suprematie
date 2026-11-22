//! Tests : ramassage de la sortie d'un bâtiment (ordre Pickup) et livraison de la soute au dépôt le plus
//! proche (ordre Deliver), pour le commandant et les ingénieurs (voir units.rs, drones.rs).

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::drones::{has, total, EV_NO_DEPOT};
use crate::fixed::{dist, TILE};
use crate::orders::{O_DELIVER, O_PICKUP};
use crate::units::{PK_FULL, PK_NO_DEPOT, PK_WORKING};
use crate::world::*;

/// Joueurs (deux pour les tests d'adversaire), recherche faite, réseau partout, terrain plat de 20 à
/// 220, sans gisement.
fn world_n(np: usize) -> World {
    let mut p = vec![4242, 512, 0, np as i32];
    for i in 0..np {
        p.extend_from_slice(&[i as i32, i as i32, 100, 100]);
    }
    let mut w = World::new(&p);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    for y in 20..220 {
        for x in 20..220 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.map.spots.retain(|s| !(s.x >= 18 && s.x < 220 && s.y >= 18 && s.y < 220));
    w
}

fn world() -> World {
    world_n(1)
}

fn depot(w: &mut World, x: i32, y: i32, items: &[(u8, u16)]) -> usize {
    let d = place_building(w, 0, B_DEPOT, x, y, 0).expect("dépôt");
    complete_building(w, d);
    for &(it, n) in items {
        crate::drones::put(&mut w.buildings[d].stash, it, n);
    }
    d
}

/// Fonderie terminée (fer → plaque de fer) avec `n` plaques qui attendent en sortie.
fn furnace(w: &mut World, x: i32, y: i32, n: u16) -> usize {
    let f = place_building(w, 0, B_FURNACE, x, y, 0).expect("fonderie");
    complete_building(w, f);
    w.buildings[f].recipe = smelt_recipe(IRON_ORE).unwrap() as u8;
    w.buildings[f].out = n;
    f
}

fn unit(w: &mut World, kind: u16, x: i32, y: i32) -> u32 {
    w.spawn_unit(kind, 0, x * TILE, y * TILE)
}

fn send(w: &mut World, code: i32, flags: i32, arg: i32, ids: &[u32]) {
    let mut o = vec![0, code, 0, flags, arg, ids.len() as i32];
    o.extend(ids.iter().map(|&i| i as i32));
    o[0] = o.len() as i32 - 1;
    w.step(&o);
}

fn pickup(w: &mut World, ids: &[u32], b: usize) {
    let r = w.building_ref(b) as i32;
    send(w, O_PICKUP, 0, r, ids);
}

fn deliver(w: &mut World, ids: &[u32], item: u8) {
    send(w, O_DELIVER, 0, item as i32, ids);
}

fn hold(w: &World, id: u32) -> Vec<u16> {
    w.units.cold[w.unit(id).unwrap()].hold.clone()
}

fn first(w: &World, id: u32) -> Option<Order> {
    w.units.cold[w.unit(id).unwrap()].orders.first().copied()
}

fn state(w: &World, id: u32) -> u16 {
    w.units.cold[w.unit(id).unwrap()].timer
}

fn pos(w: &World, id: u32) -> (i32, i32) {
    let s = w.unit(id).unwrap();
    (w.units.x[s], w.units.y[s])
}

/// Événements `code` vus pendant `n` ticks.
fn steps_events(w: &mut World, n: u32, code: i32) -> Vec<[i32; 5]> {
    let mut v = Vec::new();
    for _ in 0..n {
        w.step(&[]);
        for e in w.events.chunks_exact(5) {
            if e[0] == code {
                v.push([e[0], e[1], e[2], e[3], e[4]]);
            }
        }
    }
    v
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

/// L'ingénieur va à la fonderie, prend tout ce qui attend en sortie, puis reste posté et prend chaque
/// nouvelle plaque à mesure qu'elle sort.
#[test]
fn pickup_takes_what_waits_then_keeps_collecting() {
    let mut w = world();
    let f = furnace(&mut w, 100, 100, 12);
    let id = unit(&mut w, U_ENG1, 80, 100);
    pickup(&mut w, &[id], f);
    assert!(matches!(first(&w, id), Some(Order::Pickup { .. })), "ordre accepté");
    steps(&mut w, 300);
    assert_eq!(has(&hold(&w, id), IRON_PLATE), 12, "tout ce qui attendait est dans la soute");
    assert_eq!(w.buildings[f].out, 0, "sortie vidée");
    assert_eq!(state(&w, id), PK_WORKING, "posté");
    let (x, y) = pos(&w, id);
    let (cx, cy) = w.buildings[f].center();
    assert!(dist(x, y, cx, cy) <= 5 * TILE, "posté près de la fonderie");
    // de nouvelles plaques sortent : il les prend aussitôt, et l'ordre continue
    w.buildings[f].out = 3;
    steps(&mut w, 2);
    assert_eq!(has(&hold(&w, id), IRON_PLATE), 15);
    assert!(matches!(first(&w, id), Some(Order::Pickup { .. })), "l'ordre ne finit pas seul");
}

/// Un extracteur réel : le commandant ramasse le minerai qu'il sort (ressource brute, pas fondue).
#[test]
fn commander_picks_up_extractor_ore() {
    let mut w = world();
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(100 + dx, 100 + dy);
            w.map.deposit[i] = COPPER_ORE;
        }
    }
    w.map.spots.push(crate::map::Spot { kind: COPPER_ORE, x: 100, y: 100, purity: 0 });
    let e = place_building(&mut w, 0, B_EXTRACTOR, 100, 100, 0).expect("extracteur");
    complete_building(&mut w, e);
    let id = unit(&mut w, U_COMMANDER, 90, 100);
    pickup(&mut w, &[id], e);
    steps(&mut w, 1200);
    let got = has(&hold(&w, id), COPPER_ORE);
    assert!(got >= 5, "minerai ramassé : {got}");
    assert_eq!(total(&hold(&w, id)), got as u32, "rien d'autre dans la soute");
}

/// Soute plafonnée (ingénieur : 40) : il ne prend que ce qui tient ; sans aucun dépôt, il attend posté
/// sans rien perdre (le reste reste dans la sortie).
#[test]
fn pickup_stops_at_hold_cap_without_depot() {
    let mut w = world();
    let f = furnace(&mut w, 100, 100, 60);
    let id = unit(&mut w, U_ENG1, 90, 100);
    pickup(&mut w, &[id], f);
    steps(&mut w, 300);
    assert_eq!(total(&hold(&w, id)), udef(U_ENG1).hold as u32, "soute pleine");
    assert_eq!(w.buildings[f].out, 60 - udef(U_ENG1).hold, "le reste attend en sortie");
    assert_eq!(state(&w, id), PK_NO_DEPOT, "aucun dépôt : il attend");
    assert!(matches!(first(&w, id), Some(Order::Pickup { .. })));
}

/// Soute pleine près d'un dépôt (à son rayon) : il reste posté, ses drones vident la soute dans le dépôt,
/// et il reprend : toute la sortie finit au dépôt.
#[test]
fn full_hold_near_a_depot_is_emptied_by_drones() {
    let mut w = world();
    let d = depot(&mut w, 100, 112, &[]);
    let f = furnace(&mut w, 100, 100, 60);
    let id = unit(&mut w, U_ENG1, 95, 100);
    pickup(&mut w, &[id], f);
    let mut full_seen = false;
    let mut far = 0;
    for _ in 0..1500 {
        w.step(&[]);
        full_seen |= state(&w, id) == PK_FULL;
        let (x, y) = pos(&w, id);
        let (cx, cy) = w.buildings[f].center();
        far = far.max(dist(x, y, cx, cy));
    }
    assert!(full_seen, "soute pleine, vidée par les drones");
    assert!(far <= 8 * TILE, "il n'a pas quitté la fonderie : {}", far / TILE);
    assert_eq!(w.buildings[f].out, 0);
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE) as u32 + total(&hold(&w, id)), 60, "rien perdu");
    assert!(has(&w.buildings[d].stash, IRON_PLATE) >= 20, "les drones ont vidé la soute");
}

/// Soute pleine et aucun dépôt à portée de drones : il va lui-même livrer au dépôt le plus proche, puis
/// revient ramasser la suite.
#[test]
fn full_hold_far_from_depots_makes_the_trip() {
    let mut w = world();
    let d = depot(&mut w, 40, 100, &[]);
    let f = furnace(&mut w, 120, 100, 60);
    let id = unit(&mut w, U_ENG1, 115, 100);
    pickup(&mut w, &[id], f);
    let mut delivering = false;
    for _ in 0..4000 {
        w.step(&[]);
        delivering |= matches!(first(&w, id), Some(Order::Deliver { item: 0 }));
        if w.buildings[f].out == 0 && total(&hold(&w, id)) == 0 {
            break;
        }
    }
    assert!(delivering, "il est parti livrer");
    assert_eq!(w.buildings[f].out, 0, "il est revenu prendre la suite");
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE) as u32 + total(&hold(&w, id)), 60, "rien perdu");
    assert!(has(&w.buildings[d].stash, IRON_PLATE) >= 40, "un voyage livré au dépôt");
    assert!(matches!(first(&w, id), Some(Order::Pickup { .. })), "il a repris son poste");
}

/// Livrer un objet : au dépôt le plus proche qui a de la place pour lui (le plus proche est plein) ;
/// l'ordre finit quand la soute n'en a plus. Loin de tout dépôt, les autres objets restent à bord.
#[test]
fn deliver_goes_to_the_nearest_depot_with_room() {
    let mut w = world();
    let cap = DEPOT_CAP[0] as u16;
    let full = depot(&mut w, 140, 100, &[(IRON_PLATE, cap)]);
    let room = depot(&mut w, 40, 100, &[]);
    let id = unit(&mut w, U_ENG1, 100, 100);
    let s = w.unit(id).unwrap();
    crate::drones::put(&mut w.units.cold[s].hold, IRON_PLATE, 25);
    crate::drones::put(&mut w.units.cold[s].hold, COPPER_PLATE, 10);
    deliver(&mut w, &[id], IRON_PLATE);
    assert!(matches!(first(&w, id), Some(Order::Deliver { item: IRON_PLATE })));
    steps(&mut w, 200);
    assert_eq!(has(&hold(&w, id), COPPER_PLATE), 10, "en route, loin des dépôts : le cuivre reste à bord");
    steps(&mut w, 2300);
    assert_eq!(has(&w.buildings[room].stash, IRON_PLATE), 25, "livré au dépôt qui a de la place");
    assert_eq!(has(&w.buildings[full].stash, IRON_PLATE), cap, "le dépôt plein n'a rien reçu");
    assert_eq!(has(&hold(&w, id), IRON_PLATE), 0);
    // le cuivre n'est pas livré par l'ordre, mais ses drones le vident au dépôt une fois à portée
    assert_eq!(has(&hold(&w, id), COPPER_PLATE) + has(&w.buildings[room].stash, COPPER_PLATE), 10, "rien perdu");
    assert!(first(&w, id).is_none(), "ordre fini");
}

/// Livrer toute la soute (objet 0) au plus proche ; un dépôt d'un autre joueur ne compte pas.
#[test]
fn deliver_all_ignores_foreign_depots() {
    let mut w = world_n(2);
    let foreign = place_building(&mut w, 1, B_DEPOT, 110, 100, 0).expect("dépôt adverse");
    complete_building(&mut w, foreign);
    let mine = depot(&mut w, 60, 100, &[]);
    let id = unit(&mut w, U_ENG1, 100, 100);
    let s = w.unit(id).unwrap();
    crate::drones::put(&mut w.units.cold[s].hold, IRON_PLATE, 7);
    crate::drones::put(&mut w.units.cold[s].hold, GEAR, 3);
    deliver(&mut w, &[id], 0);
    steps(&mut w, 2000);
    assert_eq!(total(&w.buildings[foreign].stash), 0);
    assert_eq!(has(&w.buildings[mine].stash, IRON_PLATE), 7);
    assert_eq!(has(&w.buildings[mine].stash, GEAR), 3);
    assert_eq!(total(&hold(&w, id)), 0);
}

/// Aucun dépôt : l'ordre est abandonné tout de suite, la soute ne bouge pas, le joueur est prévenu.
#[test]
fn deliver_without_depot_is_dropped_with_an_event() {
    let mut w = world();
    let id = unit(&mut w, U_ENG1, 100, 100);
    let s = w.unit(id).unwrap();
    crate::drones::put(&mut w.units.cold[s].hold, IRON_PLATE, 20);
    let start = pos(&w, id);
    // l'ordre est traité dans le tick même de l'envoi : on regarde ses événements
    deliver(&mut w, &[id], IRON_PLATE);
    let mut ev: Vec<[i32; 5]> = w.events.chunks_exact(5).filter(|e| e[0] == EV_NO_DEPOT).map(|e| [e[0], e[1], e[2], e[3], e[4]]).collect();
    ev.extend(steps_events(&mut w, 20, EV_NO_DEPOT));
    assert!(first(&w, id).is_none(), "ordre abandonné");
    assert_eq!(has(&hold(&w, id), IRON_PLATE), 20, "rien perdu");
    assert_eq!(pos(&w, id), start, "il n'a pas bougé");
    assert_eq!(ev.len(), 1, "prévenu une fois");
    assert_eq!((ev[0][1], ev[0][4]), (0, IRON_PLATE as i32), "joueur et objet de l'événement");
    // rien à livrer (objet absent de la soute) : abandonné sans événement
    deliver(&mut w, &[id], COPPER_PLATE);
    assert!(first(&w, id).is_none());
    assert!(!w.events.chunks_exact(5).any(|e| e[0] == EV_NO_DEPOT));
}

/// Dépôt qui se remplit pendant la livraison : il y dépose ce qui tient, puis, faute d'autre dépôt, garde
/// le reste et le signale.
#[test]
fn deliver_to_an_almost_full_depot_keeps_the_rest() {
    let mut w = world();
    let cap = DEPOT_CAP[0] as u16;
    let d = depot(&mut w, 60, 100, &[(IRON_PLATE, cap - 5)]);
    let id = unit(&mut w, U_ENG1, 100, 100);
    let s = w.unit(id).unwrap();
    crate::drones::put(&mut w.units.cold[s].hold, IRON_PLATE, 20);
    deliver(&mut w, &[id], IRON_PLATE);
    let ev = steps_events(&mut w, 2000, EV_NO_DEPOT);
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE), cap, "dépôt rempli");
    assert_eq!(has(&hold(&w, id), IRON_PLATE), 15, "le reste reste dans la soute");
    assert!(first(&w, id).is_none(), "ordre fini");
    assert_eq!(ev.len(), 1, "prévenu une fois");
}

/// Qui accepte les ordres : constructeurs avec une soute (commandant, ingénieurs, Arche), sur nos
/// extracteurs et fabricants terminés seulement.
#[test]
fn pickup_and_deliver_targets_and_units() {
    let mut w = world();
    let f = furnace(&mut w, 100, 100, 5);
    let tank = unit(&mut w, U_LIGHT_TANK, 90, 100);
    let queen = UNITS.iter().position(|u| u.key == "queen").unwrap() as u16;
    let ark = UNITS.iter().position(|u| u.key == "ark").unwrap() as u16;
    let q = unit(&mut w, queen, 90, 104);
    let a = unit(&mut w, ark, 90, 108);
    let e = unit(&mut w, U_ENG1, 90, 112);
    pickup(&mut w, &[tank, q, a, e], f);
    assert!(first(&w, tank).is_none(), "pas de soute : refusé");
    assert!(first(&w, q).is_none(), "la Reine n'a pas de soute");
    assert!(matches!(first(&w, a), Some(Order::Pickup { .. })), "l'Arche accepte");
    assert!(matches!(first(&w, e), Some(Order::Pickup { .. })));
    // dépôt, tapis, chantier : refusés
    let d = depot(&mut w, 120, 120, &[]);
    let belt = place_building(&mut w, 0, B_BELT1, 130, 130, 0).unwrap();
    complete_building(&mut w, belt);
    let site = place_building(&mut w, 0, B_FURNACE, 140, 140, 0).unwrap();
    for b in [d, belt, site] {
        let id = unit(&mut w, U_ENG1, 150, 150);
        pickup(&mut w, &[id], b);
        assert!(first(&w, id).is_none(), "cible refusée : {}", w.buildings[b].def().key);
    }
    // livraison : refusée pour une unité sans soute ; objet hors bornes refusé
    send(&mut w, O_DELIVER, 0, IRON_PLATE as i32, &[tank]);
    assert!(first(&w, tank).is_none());
    send(&mut w, O_DELIVER, 0, 999, &[e]);
    assert!(matches!(first(&w, e), Some(Order::Pickup { .. })), "ordre invalide ignoré");
}
