//! Tests : tapis de contrôle, portail de don, vétérance, robots logistiques, débris.

use crate::buildings::{complete_building, insert_item, place_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;

fn world(teams: &[i32]) -> World {
    let mut p = vec![4242, 512, 0, teams.len() as i32];
    for &t in teams {
        p.extend_from_slice(&[t, 0, 100, 100]);
    }
    let mut w = World::new(&p);
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
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

fn put(w: &mut World, owner: u8, kind: u16, x: i32, y: i32, dir: u8) -> usize {
    let b = place_building(w, owner, kind, x, y, dir).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

fn run(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

/// Un tapis de contrôle tourné vers l'est en (100, 100), avec un dépôt à chaque sortie.
fn router(kind: u16) -> (World, usize, [usize; 3]) {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    let r = put(&mut w, 0, kind, 100, 100, 0);
    // gauche (nord), avant (est), droite (sud) : des dépôts 2 x 2
    let left = put(&mut w, 0, B_DEPOT, 100, 98, 0);
    let front = put(&mut w, 0, B_DEPOT, 101, 100, 0);
    let right = put(&mut w, 0, B_DEPOT, 99, 101, 0);
    (w, r, [left, front, right])
}

fn feed(w: &mut World, r: usize, item: u8, n: usize) {
    for _ in 0..n {
        while !crate::buildings::accepts(w, r, item) {
            w.step(&[]);
        }
        insert_item(w, r, item);
    }
    run(w, 20);
}

#[test]
fn splitter_alternates_outputs() {
    let (mut w, r, _) = router(B_SPLITTER);
    let before = w.players[0].stock[IRON_PLATE as usize];
    feed(&mut w, r, IRON_PLATE, 30);
    // toutes les sorties sont des dépôts du joueur : le total arrive au stock
    assert_eq!(w.players[0].stock[IRON_PLATE as usize] - before, 30);
    assert!(w.buildings[r].stash.is_empty());
}

#[test]
fn sorter_sends_chosen_item_left_only() {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    let r = put(&mut w, 0, B_SORTER, 100, 100, 0);
    w.buildings[r].recipe = COPPER_PLATE;
    // gauche : un tapis vers le nord qui finit dans un dépôt ; avant : un fabricant qui n'accepte que le fer
    let left_belt = put(&mut w, 0, B_BELT1, 100, 99, 3);
    let _ = left_belt;
    put(&mut w, 0, B_DEPOT, 100, 97, 0);
    let f = put(&mut w, 0, B_FURNACE, 101, 100, 0);
    w.buildings[f].recipe = 0; // fonderie : minerai de fer -> plaque
    let before = w.players[0].stock[COPPER_PLATE as usize];
    feed(&mut w, r, COPPER_PLATE, 5);
    feed(&mut w, r, IRON_ORE, 2);
    run(&mut w, 100);
    assert_eq!(w.players[0].stock[COPPER_PLATE as usize] - before, 5, "le cuivre part à gauche");
    assert!(w.buildings[f].inv[0] > 0 || w.buildings[f].working || w.buildings[f].out > 0, "le minerai continue tout droit");
}

#[test]
fn overflow_prefers_front_then_sides() {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    let r = put(&mut w, 0, B_OVERFLOW, 100, 100, 0);
    let f = put(&mut w, 0, B_FURNACE, 101, 100, 0);
    w.buildings[f].recipe = 0;
    put(&mut w, 0, B_DEPOT, 100, 98, 0);
    let before = w.players[0].stock[IRON_ORE as usize];
    feed(&mut w, r, IRON_ORE, 12);
    // la fonderie n'en garde qu'une petite réserve : le reste déborde à gauche (dépôt)
    let overflowed = w.players[0].stock[IRON_ORE as usize] - before;
    assert!(overflowed > 0 && overflowed < 12, "débordement partiel : {overflowed}");
}

#[test]
fn gift_portal_transfers_ally_units_only() {
    // joueurs 0 et 1 alliés, joueur 2 adversaire
    let mut w = world(&[0, 0, 1]);
    flatten(&mut w, 90, 90, 115, 115);
    let portal = put(&mut w, 1, B_PORTAL, 100, 100, 0);
    let (cx, cy) = w.buildings[portal].center();
    let gift = w.spawn_unit(U_LINE_ROBOT, 0, cx, cy);
    let enemy = w.spawn_unit(U_LINE_ROBOT, 2, cx + 64, cy);
    let n0 = w.players[0].unit_count;
    run(&mut w, 15);
    let g = w.unit(gift).expect("unité donnée");
    assert_eq!(w.units.owner[g], 1, "l'unité alliée change de propriétaire");
    assert_eq!(w.players[0].unit_count, n0 - 1);
    let e = w.unit(enemy).expect("ennemi");
    assert_eq!(w.units.owner[e], 2, "un ennemi n'est pas donné");
    let _ = TILE;
}

#[test]
fn veterancy_levels_up_from_kills() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 90, 90, 140, 140);
    let tank = w.spawn_unit(U_LIGHT_TANK, 0, 110 * TILE, 110 * TILE);
    // des cibles faibles, une à la fois ; le char est réparé entre deux combats
    for k in 0..8 {
        let v = w.spawn_unit(U_LINE_ROBOT, 1, 114 * TILE, (108 + k % 4) * TILE);
        for _ in 0..600 {
            w.step(&[]);
            if w.unit(v).is_none() {
                break;
            }
        }
        let t = w.unit(tank).expect("le char survit");
        w.units.hp[t] = w.max_hp(t);
    }
    let t = w.unit(tank).unwrap();
    // 8 robots de 200 PV = 1600 points ; un niveau tous les 2 x 550 PV
    assert_eq!(w.units.cold[t].xp, 1600);
    assert_eq!(w.units.cold[t].lvl, 1);
    assert_eq!(w.max_hp(t), udef(U_LIGHT_TANK).hp * 110 / 100);
}

#[test]
fn robots_feed_and_evacuate_nearby_buildings() {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 140, 140);
    put(&mut w, 0, B_GENERATOR, 100, 96, 0);
    put(&mut w, 0, B_GENERATOR, 103, 96, 0);
    let port = put(&mut w, 0, B_ROBOPORT, 100, 100, 0);
    put(&mut w, 0, B_GENERATOR, 114, 106, 0);
    let f = put(&mut w, 0, B_FURNACE, 114, 110, 0);
    w.buildings[f].recipe = 0;
    w.players[0].stock[IRON_ORE as usize] = 40;
    run(&mut w, 1200);
    assert!(w.buildings[port].working, "la base de robots est alimentée");
    // la fonderie a reçu du minerai par robot, et ses plaques (sortie sans bras) ont été évacuées
    assert!(w.players[0].stock[IRON_ORE as usize] < 40, "minerai livré");
    assert!(w.players[0].produced[IRON_PLATE as usize] >= 4, "la fonderie a produit");
    assert!(w.carriers.iter().filter(|c| c.alive && c.kind == 2).count() == ROBOTS_PER_PORT);
}

#[test]
fn wrecks_merge_are_capped_and_expire() {
    let mut w = world(&[0]);
    let cost = udef(U_LIGHT_TANK).cost;
    w.spawn_wreck(100 * TILE, 100 * TILE, cost, 1);
    w.spawn_wreck(100 * TILE + 100, 100 * TILE, cost, 1);
    assert_eq!(w.wrecks.iter().filter(|k| k.alive).count(), 1, "deux débris voisins fusionnent");
    for i in 0..(MAX_WRECKS as i32 + 50) {
        w.spawn_wreck((10 + (i % 40) * 5) * TILE, (10 + (i / 40) * 5) * TILE, cost, 1);
    }
    assert!(w.wrecks.iter().filter(|k| k.alive).count() <= MAX_WRECKS);
    run(&mut w, WRECK_LIFE + 200);
    assert_eq!(w.wrecks.iter().filter(|k| k.alive).count(), 0, "les débris disparaissent avec le temps");
}


/// Ordre de construction donné directement à un ingénieur posé à côté du chantier ; joue jusqu'à la fin.
fn build_with(w: &mut World, owner: u8, kind: u16, x: i32, y: i32, dir: u8) {
    let id = w.spawn_unit(U_ENG1, owner, x * TILE, (y + 2) * TILE);
    let s = w.unit(id).unwrap();
    w.units.cold[s].orders.push(Order::Build { kind, x, y, dir, bid: 0 });
    for _ in 0..1200 {
        w.step(&[]);
        let s = w.unit(id).unwrap();
        if w.units.cold[s].orders.is_empty() {
            break;
        }
    }
}

fn building_at(w: &World, x: i32, y: i32) -> Option<usize> {
    let o = w.map.occ[w.map.idx(x, y)];
    (o != 0).then(|| (o - 1) as usize)
}

#[test]
fn belt_corner_shape_follows_neighbours() {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    // tapis vers l'est jusqu'en (102, 100), puis vers le sud : la case d'angle (103, 100) est un virage
    for x in 100..103 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    let corner = put(&mut w, 0, B_BELT1, 103, 100, 1);
    let after = put(&mut w, 0, B_BELT1, 103, 101, 1);
    // alimenté par l'ouest = côté (1 + 1) % 4 = 2 : forme 1
    assert_eq!(crate::belts::belt_shape(&w, corner), 1);
    assert_eq!(crate::belts::belt_shape(&w, after), 0, "tapis derrière : droit");
    // un tapis derrière qui pointe vers l'angle le rend droit
    put(&mut w, 0, B_BELT1, 103, 99, 1);
    assert_eq!(crate::belts::belt_shape(&w, corner), 0);
    let _ = after;
    // les objets passent l'angle (sans tapis derrière) et arrivent au dépôt en bout de tracé
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    for x in 100..103 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    put(&mut w, 0, B_BELT1, 103, 100, 1);
    put(&mut w, 0, B_BELT1, 103, 101, 1);
    put(&mut w, 0, B_DEPOT, 103, 102, 0);
    let first = building_at(&w, 100, 100).unwrap();
    let before = w.players[0].stock[IRON_PLATE as usize];
    for _ in 0..4 {
        while !crate::belts::put_on_belt(&mut w, first, IRON_PLATE) {
            w.step(&[]);
        }
    }
    run(&mut w, 400);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize] - before, 4, "objets arrivés après le virage");
}

#[test]
fn belt_replacement_rotates_or_swaps_with_refund() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 90, 90, 115, 115);
    let b = put(&mut w, 0, B_BELT1, 100, 100, 0);
    let other = put(&mut w, 1, B_BELT1, 105, 100, 0);
    let _ = other;
    // sans le bit de remplacement : refusé (les IA ne remplacent jamais) ; avec : accepté
    assert!(!crate::buildings::can_place(&w, 0, B_SPLITTER, 100, 100, 0));
    assert!(crate::buildings::can_place(&w, 0, B_SPLITTER, 100, 100, crate::buildings::DIR_REPLACE));
    // jamais le tapis d'un autre joueur, ni un bâtiment non logistique
    assert!(!crate::buildings::can_place(&w, 0, B_BELT2, 105, 100, crate::buildings::DIR_REPLACE));
    assert!(!crate::buildings::can_place(&w, 0, B_DEPOT, 100, 100, crate::buildings::DIR_REPLACE));
    // même type, autre direction : réorienté sur place, sans chantier
    build_with(&mut w, 0, B_BELT1, 100, 100, 1 | crate::buildings::DIR_REPLACE);
    assert_eq!(building_at(&w, 100, 100), Some(b));
    assert_eq!(w.buildings[b].dir, 1);
    // autre type : le tapis est démonté et remboursé, le répartiteur construit à sa place
    let iron = w.players[0].stock[IRON_PLATE as usize];
    let belt_iron: i32 = bdef(B_BELT1).cost.iter().filter(|c| c.0 == IRON_PLATE).map(|c| c.1 as i32).sum();
    let split_iron: i32 = bdef(B_SPLITTER).cost.iter().filter(|c| c.0 == IRON_PLATE).map(|c| c.1 as i32).sum();
    build_with(&mut w, 0, B_SPLITTER, 100, 100, crate::buildings::DIR_REPLACE);
    let s = building_at(&w, 100, 100).expect("répartiteur posé");
    assert_eq!(w.buildings[s].kind, B_SPLITTER);
    assert!(w.buildings[s].complete());
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], iron + belt_iron - split_iron, "tapis remboursé, répartiteur payé");
}

#[test]
fn research_queue_chains_and_respects_prerequisites() {
    use crate::orders::{apply_orders, O_RESEARCH, O_RESEARCH_QUEUE};
    let mut w = world(&[0]);
    w.players[0].researched = 1;
    let t = |k: &str| TECHS.iter().position(|d| d.key == k).unwrap() as i32;
    let (auto, land, elec, art) = (t("automation"), t("land_prod"), t("electronics"), t("mobile_artillery"));
    let order = |w: &mut World, o: i32, tech: i32| apply_orders(w, &[3, o, 0, tech]);
    // électronique dépend de l'automatisation : refusée seule, acceptée derrière elle
    order(&mut w, O_RESEARCH_QUEUE, elec);
    assert!(w.players[0].research_queue.is_empty() && w.players[0].research == 0);
    order(&mut w, O_RESEARCH_QUEUE, auto);
    assert_eq!(w.players[0].research, auto as u8, "file vide et aucune recherche : lancée tout de suite");
    order(&mut w, O_RESEARCH_QUEUE, elec);
    order(&mut w, O_RESEARCH_QUEUE, land);
    order(&mut w, O_RESEARCH_QUEUE, art);
    assert_eq!(w.players[0].research_queue, vec![elec as u8, land as u8, art as u8]);
    // retirer la production terrestre retire l'artillerie qui en dépend
    order(&mut w, O_RESEARCH_QUEUE, land);
    assert_eq!(w.players[0].research_queue, vec![elec as u8]);
    order(&mut w, O_RESEARCH_QUEUE, land);
    // fin de la recherche en cours : la suivante démarre
    let p = &mut w.players[0];
    p.researched |= 1u64 << auto;
    p.research = 0;
    p.start_queued();
    assert_eq!(p.research, elec as u8);
    assert_eq!(p.research_queue, vec![land as u8]);
    // choisir directement une recherche de la file la retire de la file
    order(&mut w, O_RESEARCH, land);
    assert_eq!(w.players[0].research, land as u8);
    assert!(w.players[0].research_queue.is_empty());
    // 0 : tout annuler
    order(&mut w, O_RESEARCH_QUEUE, art);
    order(&mut w, O_RESEARCH, 0);
    assert!(w.players[0].research == 0 && w.players[0].research_queue.is_empty());
}

#[test]
fn attacked_event_is_throttled_and_flags_commander() {
    let mut w = world(&[0, 1, 0]);
    flatten(&mut w, 90, 90, 115, 115);
    let u = w.spawn_unit(U_LINE_ROBOT, 0, 100 * TILE, 100 * TILE);
    let s = w.unit(u).unwrap();
    let count = |w: &World, cmd: i32| w.events.chunks(5).filter(|e| e[0] == EV_ATTACKED && e[1] == 0 && e[4] == cmd).count();
    w.events.clear();
    crate::combat::damage_unit(&mut w, s, 5, 1);
    crate::combat::damage_unit(&mut w, s, 5, 1);
    assert_eq!(count(&w, 0), 1, "un seul événement pour deux dégâts rapprochés");
    // un allié (même équipe) ne déclenche pas d'alerte
    w.events.clear();
    w.tick += 100;
    crate::combat::damage_unit(&mut w, s, 5, 2);
    assert_eq!(count(&w, 0), 0);
    // après le délai, l'ennemi déclenche de nouveau ; le commandant a son propre événement
    crate::combat::damage_unit(&mut w, s, 5, 1);
    assert_eq!(count(&w, 0), 1);
    let c = w.players[0].commander;
    let cs = match w.unit(c) {
        Some(cs) => cs,
        None => {
            let id = w.spawn_unit(U_COMMANDER, 0, 104 * TILE, 100 * TILE);
            w.unit(id).unwrap()
        }
    };
    crate::combat::damage_unit(&mut w, cs, 5, 1);
    assert_eq!(count(&w, 1), 1, "commandant attaqué");
}
