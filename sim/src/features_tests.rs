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
    // les tests qui ne portent pas sur l'électricité n'ont pas à poser de zones (voir infinite_grid)
    w.infinite_grid = true;
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
    // les générateurs des tests ont un réservoir inépuisable (la combustion a ses propres tests)
    if bdef(kind).class == BClass::Power {
        w.buildings[b].fuel = 1_000_000_000;
    }
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
    w.spawn_wreck(100 * TILE, 100 * TILE, cost, 1, 0, 0);
    w.spawn_wreck(100 * TILE + 100, 100 * TILE, cost, 1, 0, 0);
    assert_eq!(w.wrecks.iter().filter(|k| k.alive).count(), 1, "deux débris voisins fusionnent");
    for i in 0..(MAX_WRECKS as i32 + 50) {
        w.spawn_wreck((10 + (i % 40) * 5) * TILE, (10 + (i / 40) * 5) * TILE, cost, 1, 0, 0);
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
    // jamais le tapis d'un autre joueur ; n'importe quel bâtiment du joueur peut remplacer ses tapis
    assert!(!crate::buildings::can_place(&w, 0, B_BELT2, 105, 100, crate::buildings::DIR_REPLACE));
    assert!(crate::buildings::can_place(&w, 0, B_DEPOT, 100, 100, crate::buildings::DIR_REPLACE));
    assert!(!crate::buildings::can_place(&w, 0, B_DEPOT, 104, 100, crate::buildings::DIR_REPLACE), "tapis d'un autre joueur");
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

#[test]
fn sustained_beam_hits_every_tick_and_stops_with_target() {
    use crate::combat::SPECIAL_BEAM;
    let mut w = world(&[0, 1]);
    flatten(&mut w, 90, 90, 140, 140);
    let spider = w.spawn_unit(U_SPIDER, 0, 100 * TILE, 110 * TILE);
    let foe = w.spawn_unit(U_SIEGE_WALKER, 1, 120 * TILE, 110 * TILE);
    let beams = |w: &World| w.projectiles.iter().filter(|p| p.special == SPECIAL_BEAM).count();
    // attendre le premier tir
    let mut n = 0;
    while beams(&w) == 0 {
        w.step(&[]);
        n += 1;
        assert!(n < 200, "l'araignée tire");
    }
    let f = w.unit(foe).unwrap();
    let hp0 = w.units.hp[f];
    let laser = &WEAPONS[udef(U_SPIDER).weapons[0] as usize];
    // les dégâts arrivent tick après tick, pas d'un coup
    w.step(&[]);
    let hp1 = w.units.hp[f];
    assert!(hp0 - hp1 > 0 && hp0 - hp1 <= laser.dmg * 2, "un tick de rayon : {} dégâts", hp0 - hp1);
    run(&mut w, 20);
    let hp2 = w.units.hp[f];
    assert!(hp1 - hp2 >= laser.dmg * 15, "le rayon continue : {} dégâts en 20 ticks", hp1 - hp2);
    assert_eq!(beams(&w), 1, "un seul rayon à la fois");
    // la source le porte : le rayon part de la position de l'araignée
    let p = *w.projectiles.iter().find(|p| p.special == SPECIAL_BEAM).unwrap();
    let s = w.unit(spider).unwrap();
    assert_eq!((p.x0, p.y0), (w.units.x[s], w.units.y[s]));
    // cible détruite : le rayon s'éteint au tick suivant
    crate::combat::damage_unit(&mut w, f, 1_000_000, 0);
    run(&mut w, 2);
    assert_eq!(beams(&w), 0, "le rayon s'arrête avec sa cible");
}

#[test]
fn dragon_breath_burns_an_area() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 90, 90, 140, 140);
    w.spawn_unit(U_DRAGON, 0, 100 * TILE, 110 * TILE);
    let foes: Vec<u32> = (0..5).map(|k| w.spawn_unit(U_LINE_ROBOT, 1, 112 * TILE + k * 96, 110 * TILE + (k % 2) * 96)).collect();
    run(&mut w, 200);
    let alive = foes.iter().filter(|&&u| w.unit(u).is_some()).count();
    assert!(alive <= 1, "le souffle touche le groupe entier ({} survivants)", alive);
}

#[test]
fn sustained_beam_sweeps_to_next_target() {
    use crate::combat::SPECIAL_BEAM;
    let mut w = world(&[0, 1]);
    flatten(&mut w, 90, 90, 140, 140);
    w.spawn_unit(U_SPIDER, 0, 100 * TILE, 110 * TILE);
    let a = w.spawn_unit(U_SIEGE_WALKER, 1, 118 * TILE, 110 * TILE);
    let b = w.spawn_unit(U_SIEGE_WALKER, 1, 122 * TILE, 116 * TILE);
    let mut n = 0;
    while !w.projectiles.iter().any(|p| p.special == SPECIAL_BEAM) {
        w.step(&[]);
        n += 1;
        assert!(n < 200, "l'araignée tire");
    }
    assert_eq!(w.projectiles.iter().find(|p| p.special == SPECIAL_BEAM).unwrap().target, a, "la plus proche d'abord");
    let fa = w.unit(a).unwrap();
    crate::combat::damage_unit(&mut w, fa, 1_000_000, 0);
    run(&mut w, 2);
    let p = *w.projectiles.iter().find(|p| p.special == SPECIAL_BEAM).expect("le rayon continue");
    assert_eq!(p.target, b, "le rayon passe à la cible suivante");
    let fb = w.unit(b).unwrap();
    let hp = w.units.hp[fb];
    run(&mut w, 5);
    assert!(w.units.hp[fb] < hp, "et la touche");
}

#[test]
fn weapons_demo_shows_every_weapon_family() {
    use crate::combat::SPECIAL_BEAM;
    let mut w = crate::stress::weapons_demo();
    let (mut beams, mut kinetic, mut energy) = (0, 0, 0);
    let mut beam_weapons = std::collections::BTreeSet::new();
    for t in 0..600 {
        w.step(&[]);
        for p in &w.projectiles {
            if p.special == SPECIAL_BEAM {
                beams += 1;
                beam_weapons.insert(p.weapon);
            } else if p.special == 0 {
                match WEAPONS[p.weapon as usize].proj {
                    Proj::Bullet | Proj::Shell => kinetic += 1,
                    Proj::Blaster | Proj::Plasma => energy += 1,
                    _ => {}
                }
            }
        }
        if t % 100 == 99 {
            let alive = |o: u8| (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == o).count();
            println!("tick {} : rayons {} {:?}, cinétiques {}, énergie {}, unités {} contre {}", t + 1, beams, beam_weapons, kinetic, energy, alive(0), alive(1));
        }
    }
    assert!(beams > 0 && kinetic > 0 && energy > 0);
    assert!(beam_weapons.len() >= 2, "plusieurs armes à rayon tirent : {:?}", beam_weapons);
}

#[test]
fn formation_move_ends_facing_the_drag_direction() {
    use crate::fixed::dist;
    use crate::orders::{apply_orders, O_MOVE};
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 140, 140);
    let a = w.spawn_unit(U_LIGHT_TANK, 0, 100 * TILE, 100 * TILE);
    let b = w.spawn_unit(U_LIGHT_TANK, 0, 101 * TILE, 102 * TILE);
    // vers le sud (+y) : angle 16384 ; les deux chars face au sud, côte à côte sur l'axe x
    let face = 16384;
    let (gx, gy) = (110 * TILE, 115 * TILE);
    let cmd = [O_MOVE, 0, 4, gx, gy, face, 2, a as i32, gx - TILE, gy, b as i32, gx + TILE, gy];
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(&mut w, &msg);
    let sa = w.unit(a).unwrap();
    assert!(matches!(w.units.cold[sa].orders.get(1), Some(Order::Face { a: 16384 })), "le déplacement est suivi d'une orientation");
    run(&mut w, 600);
    for id in [a, b] {
        let s = w.unit(id).unwrap();
        assert!(w.units.cold[s].orders.is_empty(), "ordres terminés");
        assert_eq!(w.units.facing[s], 16384, "orienté vers le sud");
        assert!(dist(w.units.x[s], w.units.y[s], gx, gy) < 3 * TILE, "arrivé à sa place");
    }
    // sans le drapeau 4 : pas d'orientation imposée
    let cmd = [O_MOVE, 0, 0, gx, gy - 10 * TILE, 1, a as i32, gx, gy - 10 * TILE];
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(&mut w, &msg);
    let sa = w.unit(a).unwrap();
    assert_eq!(w.units.cold[sa].orders.len(), 1);
}

/// Une tourelle tire sur une unité qui passe devant elle : la visée anticipée la touche presque à chaque tir.
#[test]
fn turrets_lead_moving_targets() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 80, 80, 150, 150);
    put(&mut w, 0, B_GENERATOR, 96, 100, 0);
    let tur = put(&mut w, 0, B_LIGHT_TURRET, 100, 100, 0);
    // marcheur d'assaut ennemi qui traverse à 14 cases, perpendiculairement
    let walker = w.spawn_unit(U_ASSAULT_WALKER, 1, 114 * TILE, 88 * TILE);
    let s = w.unit(walker).unwrap();
    w.units.cold[s].orders.push(Order::Move { x: 114 * TILE, y: 118 * TILE, gx: 114 * TILE, gy: 118 * TILE, attack: false, eta: 0 });
    let wi = bdef(B_LIGHT_TURRET).weapon as i32;
    let dmg = WEAPONS[wi as usize].dmg;
    let mut shots = 0;
    let mut lost = 0;
    let mut hp = w.units.hp[s];
    for _ in 0..400 {
        w.step(&[]);
        shots += w.events.chunks(5).filter(|e| e[0] == EV_FIRE && e[1] == wi).count();
        let Some(s) = w.unit(walker) else { break };
        // le marcheur riposte peut-être, mais ne se répare pas : toute perte de PV vient de la tourelle
        lost += (hp - w.units.hp[s]).max(0);
        hp = w.units.hp[s];
    }
    let _ = tur;
    let hits = lost / dmg;
    println!("tirs {} touchés {}", shots, hits);
    assert!(shots >= 10, "la tourelle tire : {}", shots);
    assert!(hits * 10 >= shots as i32 * 8, "au moins 80 % de tirs au but : {} sur {}", hits, shots);
}

/// Amélioration d'un extracteur : recherche et coût exigés, niveau maximal, extraction plus rapide.
#[test]
fn extractor_upgrade_speeds_up_extraction() {
    use crate::orders::O_UPGRADE;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    w.players[0].researched = 1;
    // deux gisements identiques, deux extracteurs qui déversent dans un dépôt chacun
    let mut ext = Vec::new();
    for x in [96, 108].iter() {
        for dy in 0..2 {
            for dx in 0..2 {
                let i = w.map.idx(*x + dx, 100 + dy);
                w.map.deposit[i] = IRON_ORE;
            }
        }
        w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x: *x, y: 100 });
        ext.push(put(&mut w, 0, B_EXTRACTOR, *x, 100, 1));
        put(&mut w, 0, B_DEPOT, *x, 102, 0);
    }
    put(&mut w, 0, B_GENERATOR, 102, 96, 0);
    let order = |w: &mut World, b: usize| {
        let r = w.building_ref(b) as i32;
        w.step(&[3, O_UPGRADE, 0, r]);
    };
    // sans la recherche : refusé
    w.players[0].stock[STEEL as usize] = 100;
    w.players[0].stock[GEAR as usize] = 100;
    w.players[0].stock[CIRCUIT as usize] = 100;
    order(&mut w, ext[1]);
    assert_eq!(w.buildings[ext[1]].level, 0, "automatisation non faite");
    w.players[0].researched |= 1 << T_AUTOMATION;
    order(&mut w, ext[1]);
    assert_eq!(w.players[0].stock[STEEL as usize], 90, "coût payé");
    // l'amélioration prend du temps (20 s) : le niveau ne change qu'à la fin, sans extraction entre-temps
    assert!(w.buildings[ext[1]].upgrade > 0);
    assert_eq!(w.buildings[ext[1]].level, 0);
    let p0 = w.buildings[ext[1]].progress;
    for _ in 0..390 {
        w.step(&[]);
    }
    assert_eq!(w.buildings[ext[1]].level, 0, "trop tôt");
    assert_eq!(w.buildings[ext[1]].progress, p0, "pas d'extraction pendant l'amélioration");
    for _ in 0..20 {
        w.step(&[]);
    }
    assert_eq!(w.buildings[ext[1]].level, 1);
    assert_eq!(w.buildings[ext[1]].upgrade, 0);
    // niveau 2 : électronique manquante
    order(&mut w, ext[1]);
    assert_eq!(w.buildings[ext[1]].level, 1);
    // production comparée sur la même durée : un objet chaque fois que la progression repart
    let mut made = [0i64; 2];
    for _ in 0..1200 {
        let before = [w.buildings[ext[0]].progress, w.buildings[ext[1]].progress];
        w.step(&[]);
        for k in 0..2 {
            if w.buildings[ext[k]].progress < before[k] {
                made[k] += 1;
            }
        }
    }
    println!("produits : niveau 0 {} niveau 1 {}", made[0], made[1]);
    assert!(made[0] > 5);
    let ratio = made[1] as f64 / made[0] as f64;
    assert!((ratio - 1.6).abs() < 0.2, "vitesse niveau 1 : ×{:.2}", ratio);
}

/// Sorties : un bras sans courant (hors de portée du générateur) ne doit pas bloquer le tapis de sortie
/// du même bâtiment, qui reçoit alors toute la production.
#[test]
fn unpowered_arm_does_not_starve_the_output_belt() {
    let mut w = world(&[0]);
    // électricité réelle : seules les zones des générateurs alimentent
    w.infinite_grid = false;
    flatten(&mut w, 85, 85, 125, 125);
    // générateur en (100, 100) : alimente jusqu'à x = 109 ; la fonderie (109-110) est couverte
    put(&mut w, 0, B_GENERATOR, 100, 100, 0);
    let f = put(&mut w, 0, B_FURNACE, 109, 100, 0);
    // bras à l'est, hors de portée électrique, vers un dépôt
    let arm = put(&mut w, 0, B_INSERTER, 111, 100, 0);
    put(&mut w, 0, B_DEPOT, 112, 100, 0);
    // tapis de sortie à l'ouest, vers un dépôt
    for x in (104..109).rev() {
        put(&mut w, 0, B_BELT1, x, 100, 2);
    }
    put(&mut w, 0, B_DEPOT, 102, 100, 0);
    run(&mut w, 5);
    assert_eq!(w.buildings[arm].net, 0, "le bras doit être hors réseau pour ce test");
    assert_ne!(w.buildings[f].net, 0, "la fonderie doit être alimentée");
    let before = w.players[0].stock[IRON_PLATE as usize];
    for _ in 0..3000 {
        if crate::buildings::accepts(&w, f, IRON_ORE) {
            insert_item(&mut w, f, IRON_ORE);
        }
        w.step(&[]);
    }
    let got = w.players[0].stock[IRON_PLATE as usize] - before;
    assert!(got > 20, "le tapis de sortie n'a presque rien reçu : {} plaques", got);
}

/// Sorties : deux tapis de sortie alimentés se partagent la production ; un seul tapis branché reçoit tout.
#[test]
fn single_output_belt_gets_everything() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    put(&mut w, 0, B_GENERATOR, 100, 96, 0);
    let f = put(&mut w, 0, B_FURNACE, 100, 100, 0);
    // un bras d'entrée (ne compte pas comme sortie) et un tapis de sortie à l'est
    put(&mut w, 0, B_INSERTER, 99, 100, 0);
    for x in 102..106 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    put(&mut w, 0, B_DEPOT, 106, 100, 0);
    assert_eq!(crate::buildings::outlets_of(&w, f).len(), 1);
    let before = w.players[0].stock[IRON_PLATE as usize];
    let mut fed = 0;
    for _ in 0..3000 {
        if crate::buildings::accepts(&w, f, IRON_ORE) {
            insert_item(&mut w, f, IRON_ORE);
            fed += 1;
        }
        w.step(&[]);
    }
    let got = w.players[0].stock[IRON_PLATE as usize] - before;
    assert!(got > 20 && got as i64 + 6 >= fed as i64, "production perdue ou bloquée : {} plaques pour {} minerais", got, fed);
}

/// Pose d'un tapis au niveau `floor` (bits 3-4 de l'octet de direction).
fn put_belt(w: &mut World, x: i32, y: i32, dir: u8, floor: u8) -> usize {
    put(w, 0, B_BELT1, x, y, dir | floor << 3)
}

/// Une ligne de tapis qui monte par un ascenseur, passe au-dessus d'une ligne qui la croise au sol,
/// puis redescend et livre ; chaque ligne livre ses propres objets.
fn crossing_world() -> (World, usize, usize) {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 130, 130);
    // ligne est-ouest : sol 100..103, étage 1 de 104 à 110, sol de 111 à 113, dépôt en 114
    for x in 100..104 {
        put_belt(&mut w, x, 100, 0, 0);
    }
    for x in 104..111 {
        put_belt(&mut w, x, 100, 0, 1);
    }
    for x in 111..114 {
        put_belt(&mut w, x, 100, 0, 0);
    }
    put(&mut w, 0, B_DEPOT, 114, 100, 0);
    // ligne nord-sud au sol qui passe sous l'étage en x = 107, vers un dépôt au sud
    for y in 95..104 {
        put_belt(&mut w, 107, y, 1, 0);
    }
    put(&mut w, 0, B_DEPOT, 107, 104, 0);
    let a = w.map.occ_floor(w.map.idx(100, 100), 0) as usize - 1;
    let b = w.map.occ_floor(w.map.idx(107, 95), 0) as usize - 1;
    (w, a, b)
}

#[test]
fn elevated_belts_cross_over_ground_belts() {
    let (mut w, a, b) = crossing_world();
    // la ligne qui monte, l'étage et la descente forment une seule ligne (même vitesse)
    assert_eq!(w.buildings[a].line, w.buildings[w.map.occ_floor(w.map.idx(108, 100), 1) as usize - 1].line, "ascenseur : une seule ligne");
    assert_eq!(crate::belts::ramp_to(&w, a + 3), Some(1), "montée sur la dernière case du sol");
    let top = w.map.occ_floor(w.map.idx(110, 100), 1) as usize - 1;
    assert_eq!(crate::belts::ramp_to(&w, top), Some(0), "descente sur la dernière case de l'étage");
    // la ligne au sol en x = 107 n'est pas reliée à l'étage
    let under = w.map.occ_floor(w.map.idx(107, 100), 0) as usize - 1;
    assert_ne!(w.buildings[under].line, w.buildings[a].line);
    // du fer sur la ligne qui monte, du cuivre sur celle du sol
    let (fe0, cu0) = (w.players[0].stock[IRON_ORE as usize], w.players[0].stock[COPPER_ORE as usize]);
    let mut sent = [0, 0];
    for k in 0..700 {
        if k % 10 == 0 && k < 300 {
            sent[0] += crate::belts::put_on_belt(&mut w, a, IRON_ORE) as i32;
            sent[1] += crate::belts::put_on_belt(&mut w, b, COPPER_ORE) as i32;
        }
        w.step(&[]);
    }
    let fe = w.players[0].stock[IRON_ORE as usize] - fe0;
    let cu = w.players[0].stock[COPPER_ORE as usize] - cu0;
    println!("fer {} cuivre {}", fe, cu);
    // tout arrive, rien ne se perd ni ne se mélange au croisement
    assert_eq!((fe, cu), (sent[0], sent[1]), "fer {} sur {}, cuivre {} sur {}", fe, sent[0], cu, sent[1]);
    assert!(sent[0] >= 25 && sent[1] >= 25);
}

#[test]
fn elevated_placement_rules() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 130, 130);
    put(&mut w, 0, B_FURNACE, 100, 100, 0);
    // un tapis surélevé passe au-dessus d'un bâtiment ; un autre bâtiment ne peut pas être surélevé
    assert!(crate::buildings::can_place(&w, 0, B_BELT1, 100, 100, 1 << 3));
    assert!(!crate::buildings::can_place(&w, 0, B_WALL, 104, 104, 1 << 3));
    let up = put_belt(&mut w, 100, 100, 0, 1);
    assert!(!crate::buildings::can_place(&w, 0, B_BELT1, 100, 100, 1 << 3), "case de l'étage occupée");
    assert!(crate::buildings::can_place(&w, 0, B_BELT1, 100, 100, 2 << 3), "le niveau 2 reste libre");
    // le sol sous un tapis surélevé reste libre pour la construction
    assert!(crate::buildings::can_place(&w, 0, B_WALL, 103, 100, 0));
    put_belt(&mut w, 103, 100, 0, 1);
    assert!(crate::buildings::can_place(&w, 0, B_WALL, 103, 100, 0));
    crate::buildings::remove_building(&mut w, up, false);
    assert_eq!(w.map.occ_floor(w.map.idx(100, 100), 1), 0);
    assert_ne!(w.map.occ_floor(w.map.idx(100, 100), 0), 0, "la fonderie reste");
}

#[test]
fn elevated_belts_survive_snapshot() {
    let (mut w, a, _) = crossing_world();
    for k in 0..60 {
        if k % 10 == 0 {
            crate::belts::put_on_belt(&mut w, a, IRON_ORE);
        }
        w.step(&[]);
    }
    let snap = crate::save::snapshot(&w);
    let mut w2 = crate::save::restore(&snap).expect("restauration");
    assert_eq!(w.hash(), w2.hash());
    assert_eq!(w2.map.occ_floor(w2.map.idx(105, 100), 1), w.map.occ_floor(w.map.idx(105, 100), 1));
    for _ in 0..200 {
        w.step(&[]);
        w2.step(&[]);
    }
    assert_eq!(w.hash(), w2.hash(), "même suite après restauration");
}

/// Un bâtiment posé sur des tapis du joueur les démonte (coût rendu) au lieu d'être refusé.
#[test]
fn building_over_belts_replaces_them() {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    for x in 98..103 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    let iron = w.players[0].stock[IRON_PLATE as usize];
    let belt_iron: i32 = bdef(B_BELT1).cost.iter().filter(|c| c.0 == IRON_PLATE).map(|c| c.1 as i32).sum();
    let depot_iron: i32 = bdef(B_DEPOT).cost.iter().filter(|c| c.0 == IRON_PLATE).map(|c| c.1 as i32).sum();
    // dépôt 2 x 2 sur les tapis de x = 100 et 101
    build_with(&mut w, 0, B_DEPOT, 100, 100, crate::buildings::DIR_REPLACE);
    let d = building_at(&w, 100, 100).expect("dépôt posé");
    assert_eq!(w.buildings[d].kind, B_DEPOT);
    assert_eq!(building_at(&w, 101, 100), Some(d));
    assert_eq!(w.buildings[building_at(&w, 99, 100).unwrap()].kind, B_BELT1, "les autres tapis restent");
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], iron + 2 * belt_iron - depot_iron, "deux tapis remboursés, dépôt payé");
}

/// Reconstruction automatique : un bâtiment détruit laisse un fantôme qu'un ingénieur inactif reconstruit
/// (avec sa recette) ; un ordre efface les fantômes d'une zone.
#[test]
fn destroyed_buildings_are_rebuilt_by_idle_engineers() {
    use crate::orders::{apply_orders, O_CANCEL_GHOSTS};
    let mut w = world(&[0, 1]);
    flatten(&mut w, 85, 85, 130, 130);
    put(&mut w, 0, B_GENERATOR, 96, 100, 0);
    let a = put(&mut w, 0, B_ASSEMBLER1, 100, 100, 0);
    let gear = RECIPES.iter().position(|r| r.key == "gear").unwrap() as u8;
    w.buildings[a].recipe = gear;
    let eng = w.spawn_unit(U_ENG1, 0, 104 * TILE, 104 * TILE);
    for it in 0..NUM_ITEMS {
        w.players[0].stock[it] = 500;
    }
    // destruction au combat
    crate::combat::damage_building(&mut w, a, 1_000_000, 1);
    w.step(&[]);
    assert!(!w.buildings[a].alive);
    assert_eq!(w.ghosts.len(), 1, "fantôme noté");
    // l'ingénieur inactif s'en charge et reconstruit
    let mut rebuilt = None;
    for _ in 0..1200 {
        w.step(&[]);
        let o = w.map.occ[w.map.idx(100, 100)];
        if o != 0 && w.buildings[o as usize - 1].complete() && w.ghosts.is_empty() {
            rebuilt = Some(o as usize - 1);
            break;
        }
    }
    let b = rebuilt.expect("reconstruit");
    assert_eq!(w.buildings[b].kind, B_ASSEMBLER1);
    assert_eq!(w.buildings[b].recipe, gear, "recette reprise");
    let s = w.unit(eng).unwrap();
    assert!(w.units.cold[s].orders.is_empty(), "l'ingénieur redevient inactif");
    // un fantôme effacé par le joueur n'est pas reconstruit
    crate::combat::damage_building(&mut w, b, 1_000_000, 1);
    w.step(&[]);
    assert_eq!(w.ghosts.len(), 1);
    apply_orders(&mut w, &[6, O_CANCEL_GHOSTS, 0, 95, 95, 105, 105]);
    assert!(w.ghosts.is_empty(), "fantôme effacé");
    for _ in 0..300 {
        w.step(&[]);
    }
    assert_eq!(w.map.occ[w.map.idx(100, 100)], 0, "rien n'est reconstruit");
}

/// Un extracteur de 2 x 2 sort par ses deux cases de face, à tour de rôle.
#[test]
fn extractor_uses_both_front_outputs() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(100 + dx, 100 + dy);
            w.map.deposit[i] = IRON_ORE;
        }
    }
    w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x: 100, y: 100 });
    // sortie vers le sud (dir 1) : deux tapis en cul-de-sac sous l'extracteur, l'un sous chaque colonne
    put(&mut w, 0, B_EXTRACTOR, 100, 100, 1);
    let left = put(&mut w, 0, B_BELT1, 100, 102, 1);
    let right = put(&mut w, 0, B_BELT1, 101, 102, 1);
    for y in 103..110 {
        put(&mut w, 0, B_BELT1, 100, y, 1);
        put(&mut w, 0, B_BELT1, 101, y, 1);
    }
    put(&mut w, 0, B_GENERATOR, 96, 100, 0);
    for _ in 0..1200 {
        w.step(&[]);
    }
    let count = |w: &World, b: usize| w.belts.lines[w.buildings[b].line as usize].items.len();
    let (l, r) = (count(&w, left), count(&w, right));
    println!("gauche {} droite {}", l, r);
    assert!(l + r >= 10, "l'extracteur produit : {} + {}", l, r);
    assert!(l.abs_diff(r) <= 1, "les deux sorties servent à tour de rôle : {} contre {}", l, r);
}

/// Enjamber un seul tapis : une case à l'étage juste au-dessus du tapis croisé. La file au sol qui y
/// arrive monte (elle ne se déverse pas dans le tapis croisé par le côté), puis redescend.
#[test]
fn single_tile_overpass_crosses_a_belt() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 130, 130);
    // ligne est-ouest : sol 100..104, étage 1 en 105 (au-dessus de la ligne nord-sud), sol 106..108
    for x in 100..105 {
        put_belt(&mut w, x, 100, 0, 0);
    }
    put_belt(&mut w, 105, 100, 0, 1);
    for x in 106..109 {
        put_belt(&mut w, x, 100, 0, 0);
    }
    put(&mut w, 0, B_DEPOT, 109, 100, 0);
    // ligne nord-sud au sol en x = 105, vers un dépôt au sud
    for y in 95..104 {
        put_belt(&mut w, 105, y, 1, 0);
    }
    put(&mut w, 0, B_DEPOT, 105, 104, 0);
    let a = w.map.occ_floor(w.map.idx(100, 100), 0) as usize - 1;
    let before = w.map.occ_floor(w.map.idx(104, 100), 0) as usize - 1;
    assert_eq!(crate::belts::ramp_to(&w, before), Some(1), "la case avant le croisement doit monter");
    let under = w.map.occ_floor(w.map.idx(105, 100), 0) as usize - 1;
    assert_eq!(crate::belts::belt_shape(&w, under), 0, "le tapis croisé reste droit");
    let fe0 = w.players[0].stock[IRON_ORE as usize];
    let mut sent = 0;
    for k in 0..600 {
        if k % 10 == 0 && k < 300 {
            sent += crate::belts::put_on_belt(&mut w, a, IRON_ORE) as i32;
        }
        w.step(&[]);
    }
    assert!(sent > 20);
    assert_eq!(w.players[0].stock[IRON_ORE as usize] - fe0, sent, "tout le fer doit passer par-dessus, jusqu'au dépôt de l'est");
}

/// Collecteur de surplus : sur une file bouchée, il met le surplus en réserve et la file reste fluide ;
/// sur une file qui avance, il ne prend rien.
#[test]
fn collector_takes_only_the_surplus() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    // file bouchée : 12 tapis en cul-de-sac, collecteur à la 6e case
    for x in 100..112 {
        let k = if x == 105 { B_COLLECTOR } else { B_BELT1 };
        put(&mut w, 0, k, x, 100, 0);
    }
    let start = w.map.occ[w.map.idx(100, 100)] as usize - 1;
    let col = w.map.occ[w.map.idx(105, 100)] as usize - 1;
    assert_eq!(w.buildings[col].kind, B_COLLECTOR);
    // un dépôt à l'écart : la réserve a de la place pour tout le surplus
    put(&mut w, 0, B_DEPOT, 100, 110, 0);
    let stock0 = w.players[0].stock[IRON_ORE as usize];
    let mut sent = 0;
    for t in 0..2000 {
        if t % 3 == 0 && crate::belts::put_on_belt(&mut w, start, IRON_ORE) {
            sent += 1;
        }
        w.step(&[]);
    }
    let kept = w.players[0].stock[IRON_ORE as usize] - stock0;
    // référence : la même file, sans collecteur, qui se vide librement dans un dépôt
    let mut r = world(&[0]);
    flatten(&mut r, 85, 85, 125, 125);
    for x in 100..112 {
        put(&mut r, 0, B_BELT1, x, 100, 0);
    }
    put(&mut r, 0, B_DEPOT, 112, 100, 0);
    let rs = r.map.occ[r.map.idx(100, 100)] as usize - 1;
    let mut free = 0;
    for t in 0..2000 {
        if t % 3 == 0 && crate::belts::put_on_belt(&mut r, rs, IRON_ORE) {
            free += 1;
        }
        r.step(&[]);
    }
    println!("envoyés {} (file libre : {}) mis en réserve {}", sent, free, kept);
    // la file en aval se remplit, puis le surplus part en réserve : l'amont va aussi vite qu'une file libre
    assert!(sent * 100 >= free * 97, "l'amont reste fluide : {} objets posés contre {} sur une file libre", sent, free);
    // tout ce qui ne tient pas sur la file (12 cases de 4 objets au plus) est mis en réserve
    let on_belts = 12 * TILE / crate::belts::ITEM_GAP;
    assert!(kept >= sent - on_belts, "le surplus est mis en réserve : {} sur {}", kept, sent);
    assert_eq!(w.buildings[col].out as i32, kept);
    // file qui avance jusqu'à un dépôt : le collecteur ne prend rien
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    for x in 100..112 {
        let k = if x == 105 { B_COLLECTOR } else { B_BELT1 };
        put(&mut w, 0, k, x, 100, 0);
    }
    put(&mut w, 0, B_DEPOT, 112, 100, 0);
    let start = w.map.occ[w.map.idx(100, 100)] as usize - 1;
    let col = w.map.occ[w.map.idx(105, 100)] as usize - 1;
    for t in 0..600 {
        if t % 6 == 0 {
            crate::belts::put_on_belt(&mut w, start, IRON_ORE);
        }
        w.step(&[]);
    }
    assert_eq!(w.buildings[col].out, 0, "rien à collecter sur une file fluide");
}

/// Amélioration d'un assembleur sur place : il devient l'assembleur rapide au bout de 20 s, garde sa
/// recette ; un second ordre pendant le chantier l'annule et rembourse.
#[test]
fn assembler_upgrade_takes_time_and_can_be_cancelled() {
    use crate::orders::O_UPGRADE;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    put(&mut w, 0, B_GENERATOR, 100, 96, 0);
    let a = put(&mut w, 0, B_ASSEMBLER1, 100, 100, 0);
    let rid = RECIPES.iter().position(|r| r.key == "gear").unwrap() as i32;
    let r = w.building_ref(a) as i32;
    w.step(&[4, crate::orders::O_SET_RECIPE, 0, r, rid]);
    for (it, n) in [(STEEL, 50), (GEAR, 50), (CIRCUIT, 50)] {
        w.players[0].stock[it as usize] = n;
    }
    // lancé puis annulé : remboursé, toujours assembleur simple
    w.step(&[3, O_UPGRADE, 0, r]);
    assert!(w.buildings[a].upgrade > 0);
    assert_eq!(w.players[0].stock[STEEL as usize], 44);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert_eq!(w.buildings[a].upgrade, 0);
    assert_eq!(w.players[0].stock[STEEL as usize], 50, "remboursé");
    // lancé jusqu'au bout
    w.step(&[3, O_UPGRADE, 0, r]);
    for _ in 0..450 {
        w.step(&[]);
    }
    assert_eq!(w.buildings[a].kind, B_ASSEMBLER1 + 1, "devenu assembleur rapide");
    assert_eq!(w.buildings[a].recipe as i32, rid, "recette gardée");
    assert_eq!(w.buildings[a].hp, bdef(B_ASSEMBLER1 + 1).hp, "points de vie à la même proportion");
}

/// La réserve est plafonnée par les dépôts : une file qui livre un dépôt s'arrête quand la réserve est
/// pleine ; un dépôt amélioré agrandit la réserve et pose sur ses tapis de sortie les objets filtrés.
#[test]
fn depots_cap_the_reserve_and_upgraded_depot_outputs_filtered_items() {
    use crate::orders::{O_SET_FILTERS, O_UPGRADE};
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    assert_eq!(w.players[0].stock_cap, STOCK_BASE);
    for x in 100..106 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    let d = put(&mut w, 0, B_DEPOT, 106, 100, 0);
    assert_eq!(w.players[0].stock_cap, STOCK_BASE + DEPOT_CAP[0]);
    let start = w.map.occ[w.map.idx(100, 100)] as usize - 1;
    let cap = w.players[0].stock_cap;
    w.players[0].stock[IRON_ORE as usize] = cap - 5;
    for t in 0..600 {
        if t % 4 == 0 {
            crate::belts::put_on_belt(&mut w, start, IRON_ORE);
        }
        w.step(&[]);
    }
    assert_eq!(w.players[0].stock[IRON_ORE as usize], cap, "réserve pleine : le dépôt n'accepte plus");
    assert!(w.belts.lines.iter().any(|l| !l.items.is_empty()), "la file attend devant le dépôt");
    // amélioration : plus de place, la file repart
    for (it, n) in DEPOT_UPGRADE_COST {
        w.players[0].stock[*it as usize] = *n as i32;
    }
    let r = w.building_ref(d) as i32;
    w.step(&[3, O_UPGRADE, 0, r]);
    assert!(w.buildings[d].upgrade > 0, "amélioration lancée");
    for _ in 0..DEPOT_UPGRADE_TIME as u32 * 20 + 5 {
        w.step(&[]);
    }
    assert_eq!(w.buildings[d].level, 1);
    assert_eq!(w.players[0].stock_cap, STOCK_BASE + DEPOT_CAP[1]);
    run(&mut w, 100);
    assert!(w.players[0].stock[IRON_ORE as usize] > cap, "la file a repris");
    // sortie filtrée : un tapis qui part de la face est du dépôt
    for x in 108..114 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    w.players[0].stock[GEAR as usize] = 30;
    w.players[0].stock[COPPER_PLATE as usize] = 0;
    w.step(&[6, O_SET_FILTERS, 0, r, 2, GEAR as i32, COPPER_PLATE as i32]);
    assert_eq!(w.buildings[d].filters, vec![GEAR, COPPER_PLATE]);
    run(&mut w, 400);
    // les engrenages quittent la réserve pour le tapis en cul-de-sac (pas de cuivre : il n'y en a pas)
    let on_belts = |w: &World, it: u8| -> i32 { w.belts.lines.iter().map(|l| l.items.iter().filter(|i| i.0 == it).count() as i32).sum() };
    let g = on_belts(&w, GEAR);
    assert!(g > 5, "des engrenages sortent sur le tapis : {}", g);
    assert_eq!(w.players[0].stock[GEAR as usize], 30 - g);
    assert_eq!(on_belts(&w, COPPER_PLATE), 0);
    let out = put(&mut w, 0, B_DEPOT, 100, 110, 0);
    // les filtres d'un dépôt simple sont refusés
    let r2 = w.building_ref(out) as i32;
    w.step(&[5, O_SET_FILTERS, 0, r2, 1, GEAR as i32]);
    assert!(w.buildings[out].filters.is_empty());
    // destruction : la réserve rétrécit
    let before = w.players[0].stock_cap;
    crate::buildings::remove_building(&mut w, d, false);
    assert_eq!(w.players[0].stock_cap, before - DEPOT_CAP[1]);
}

fn unit_kind(key: &str) -> i32 {
    UNITS.iter().position(|u| u.key == key).unwrap() as i32
}

/// Un dépôt collé à une usine l'alimente depuis la réserve du joueur, sans tapis ni bras.
#[test]
fn depot_touching_a_factory_feeds_it_from_the_reserve() {
    use crate::orders::O_FACTORY_QUEUE;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    put(&mut w, 0, B_GENERATOR, 100, 96, 0);
    put(&mut w, 0, B_GENERATOR, 102, 96, 0);
    let f = put(&mut w, 0, B_LAND_FACTORY, 100, 100, 0);
    let r = w.building_ref(f) as i32;
    let robot = unit_kind("line_robot");
    w.players[0].stock[IRON_PLATE as usize] = 100;
    w.players[0].stock[GEAR as usize] = 100;
    w.step(&[5, O_FACTORY_QUEUE, 0, r, robot, 2]);
    let units0 = w.players[0].unit_count;
    // sans dépôt : rien n'arrive
    run(&mut w, 200);
    assert_eq!(w.players[0].unit_count, units0);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], 100);
    // dépôt contre la face ouest
    put(&mut w, 0, B_DEPOT, 98, 100, 0);
    assert_eq!(crate::buildings::touching_depots(&w, f), 1);
    run(&mut w, 900);
    assert_eq!(w.players[0].unit_count, units0 + 2, "deux robots produits");
    assert_eq!(w.buildings[f].flow.iter().map(|&n| n as u32).sum::<u32>(), 2, "débit : deux unités comptées");
    let cost = udef(robot as u16).cost;
    let iron = cost.iter().find(|c| c.0 == IRON_PLATE).unwrap().1 as i32;
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], 100 - 2 * iron, "pris dans la réserve, l'avance rendue à la fin de la file");
    assert_eq!(crate::buildings::factory_has(&w.buildings[f], IRON_PLATE), 0);
}

/// L'alimentation par dépôt est lente (1 objet par seconde) et un seul dépôt compte : en coller un
/// second ne va pas plus vite.
#[test]
fn only_one_depot_feeds_a_factory_slowly() {
    use crate::buildings::DEPOT_FEED_PERIOD;
    use crate::orders::O_FACTORY_QUEUE;
    let delivered = |depots: &[(i32, i32)]| {
        let mut w = world(&[0]);
        flatten(&mut w, 85, 85, 125, 125);
        put(&mut w, 0, B_GENERATOR, 100, 96, 0);
        put(&mut w, 0, B_GENERATOR, 102, 96, 0);
        let f = put(&mut w, 0, B_LAND_FACTORY, 100, 100, 0);
        let r = w.building_ref(f) as i32;
        // une grosse unité : la réserve de l'usine ne se remplit pas pendant la mesure
        w.step(&[5, O_FACTORY_QUEUE, 0, r, unit_kind("light_tank"), 1]);
        for it in [STEEL, GEAR, CIRCUIT] {
            w.players[0].stock[it as usize] = 100;
        }
        for &(x, y) in depots {
            put(&mut w, 0, B_DEPOT, x, y, 0);
        }
        run(&mut w, 10 * DEPOT_FEED_PERIOD);
        // pris dans la réserve (une partie a déjà pu partir dans un char en construction)
        [STEEL, GEAR, CIRCUIT].iter().map(|&it| (100 - w.players[0].stock[it as usize]) as u32).sum::<u32>()
    };
    let one = delivered(&[(98, 100)]);
    assert!((9..=11).contains(&one), "un objet par période : {one}");
    assert_eq!(delivered(&[(98, 100), (100, 103)]), one, "un second dépôt ne va pas plus vite");
}

/// L'usine garde d'avance les composants de deux unités pour chaque type de sa file ; ce qui dépasse
/// quand la file change retourne à la réserve, et une unité abandonnée en cours rend ses composants.
#[test]
fn factory_buffers_two_units_for_its_whole_queue() {
    use crate::buildings::{accepts, factory_has};
    use crate::orders::O_FACTORY_QUEUE;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    let f = put(&mut w, 0, B_LAND_FACTORY, 100, 100, 0);
    let r = w.building_ref(f) as i32;
    let (robot, moto) = (unit_kind("line_robot"), unit_kind("moto"));
    let need = |k: i32, it: u8| udef(k as u16).cost.iter().find(|c| c.0 == it).map_or(0, |c| c.1);
    assert!(!accepts(&w, f, IRON_PLATE), "file vide : rien n'est accepté");
    w.step(&[5, O_FACTORY_QUEUE, 0, r, robot, 1]);
    w.step(&[5, O_FACTORY_QUEUE, 0, r, moto, 1]);
    let mut n = 0;
    while accepts(&w, f, IRON_PLATE) {
        insert_item(&mut w, f, IRON_PLATE);
        n += 1;
    }
    let lim = 2 * need(robot, IRON_PLATE).max(need(moto, IRON_PLATE));
    assert_eq!(n, lim, "deux unités d'avance pour le plus gros besoin de la file");
    assert!(!accepts(&w, f, STEEL), "objet inutile à la file refusé");
    // retirer la moto : l'excédent retourne à la réserve
    let before = w.players[0].stock[IRON_PLATE as usize];
    w.step(&[5, O_FACTORY_QUEUE, 0, r, moto, -1]);
    let keep = 2 * need(robot, IRON_PLATE);
    assert_eq!(factory_has(&w.buildings[f], IRON_PLATE), keep);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], before + (lim - keep) as i32);
    // vider la file : tout revient
    w.step(&[5, O_FACTORY_QUEUE, 0, r, robot, -1]);
    assert_eq!(factory_has(&w.buildings[f], IRON_PLATE), 0);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize], before + lim as i32);
}

/// Une usine en panne de composants depuis 10 s le signale une fois à son joueur.
#[test]
fn starved_factory_raises_one_alert() {
    use crate::orders::O_FACTORY_QUEUE;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    put(&mut w, 0, B_GENERATOR, 100, 96, 0);
    put(&mut w, 0, B_GENERATOR, 102, 96, 0);
    let f = put(&mut w, 0, B_LAND_FACTORY, 100, 100, 0);
    let r = w.building_ref(f) as i32;
    w.step(&[5, O_FACTORY_QUEUE, 0, r, unit_kind("line_robot"), 1]);
    let mut alerts = Vec::new();
    for _ in 0..1200 {
        w.step(&[]);
        alerts.extend(w.events.chunks(5).filter(|e| e[0] == EV_FACTORY_STARVED).map(|e| (e[1], e[4])));
    }
    assert_eq!(alerts.len(), 1, "une seule alerte par attente");
    assert_eq!(alerts[0], (0, IRON_PLATE as i32), "joueur et premier composant manquant");
}

/// Gardien : -45 % de dégâts reçus de face, rien de dos ; tourelle mobile : -30 % une fois déployée.
#[test]
fn guardian_front_armor_and_deployed_turret_armor() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 90, 90, 130, 130);
    let id = w.spawn_unit(U_GUARDIAN, 0, 110 * TILE, 110 * TILE);
    let g = w.unit(id).unwrap();
    w.units.facing[g] = 0; // tourné vers +x
    let hit = |w: &mut World, s: usize, from: (i32, i32)| {
        let h0 = w.units.hp[s];
        w.hit_from = from;
        crate::combat::damage_unit(w, s, 100, 1);
        w.hit_from = (i32::MIN, 0);
        h0 - w.units.hp[s]
    };
    assert_eq!(hit(&mut w, g, (120 * TILE, 112 * TILE)), 55, "de face");
    assert_eq!(hit(&mut w, g, (100 * TILE, 110 * TILE)), 100, "de dos");
    assert_eq!(hit(&mut w, g, (110 * TILE, 120 * TILE)), 100, "de flanc");
    assert_eq!(hit(&mut w, g, (i32::MIN, 0)), 100, "origine inconnue");
    let id = w.spawn_unit(U_DEPLOY_TURRET, 0, 115 * TILE, 115 * TILE);
    let t = w.unit(id).unwrap();
    assert_eq!(hit(&mut w, t, (120 * TILE, 115 * TILE)), 100);
    w.units.cold[t].deployed = true;
    assert_eq!(hit(&mut w, t, (120 * TILE, 115 * TILE)), 70);
}

/// Tourelle mobile : elle ne tire qu'une fois déployée (seule, à l'arrêt, avec une cible).
#[test]
fn deploy_turret_fires_only_when_deployed() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 80, 80, 150, 150);
    let t = w.spawn_unit(U_DEPLOY_TURRET, 0, 100 * TILE, 110 * TILE);
    // une cible sans arme dans son champ de vision (20 cases)
    w.spawn_unit(U_JAMMER, 1, 118 * TILE, 110 * TILE);
    let fired = |w: &World| w.projectiles.iter().any(|p| p.weapon == 49);
    for _ in 0..30 {
        w.step(&[]);
        assert!(!fired(&w), "pas de tir avant le déploiement");
    }
    let mut ok = false;
    for _ in 0..120 {
        w.step(&[]);
        ok |= fired(&w);
    }
    assert!(w.units.cold[w.unit(t).unwrap()].deployed, "déployée");
    assert!(ok, "tire une fois déployée");
}

/// Lance-roquettes : 16 roquettes non guidées, dispersées autour du point visé.
#[test]
fn rocket_salvo_is_scattered() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 80, 80, 150, 150);
    w.spawn_unit(U_ROCKET_BATTERY, 0, 100 * TILE, 110 * TILE);
    w.spawn_unit(U_DEPLOY_TURRET, 1, 116 * TILE, 110 * TILE);
    let mut shots = Vec::new();
    for _ in 0..60 {
        w.step(&[]);
        shots = w.projectiles.iter().filter(|p| p.weapon == 46).map(|p| (p.tx, p.ty, p.target)).collect();
        if !shots.is_empty() {
            break;
        }
    }
    assert_eq!(shots.len(), 16);
    let (xmin, xmax) = (shots.iter().map(|s| s.0).min().unwrap(), shots.iter().map(|s| s.0).max().unwrap());
    assert!(xmax - xmin > 3 * TILE, "dispersées sur plusieurs cases : {}", xmax - xmin);
    assert!(shots.iter().all(|s| s.2 == NONE), "non guidées");
}

/// Commando furtif : invisible (ni ciblé ni affiché) tant qu'il ne tire pas, sauf de tout près.
#[test]
fn commando_is_cloaked_until_it_fires_or_is_approached() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 80, 80, 150, 150);
    let c = w.spawn_unit(U_COMMANDO, 0, 100 * TILE, 110 * TILE);
    let tank = w.spawn_unit(U_GUARDIAN, 1, 116 * TILE, 110 * TILE);
    let cs = w.unit(c).unwrap();
    w.update_vis_all();
    assert!(!crate::combat::unit_seen(&w, 1, cs), "camouflé à 16 cases");
    let shown = |w: &World| {
        let buf = crate::render::render(w, 0, 0, 512, 512, 2, 1, false);
        let o = crate::render::HEADER + w.players.len() * crate::render::PLAYER_WORDS;
        (0..buf[3] as usize).any(|i| buf[o + i * crate::render::UNIT_WORDS] as u32 == c)
    };
    assert!(!shown(&w), "absent du rendu de l'adversaire");
    let hp0 = w.units.hp[cs];
    for _ in 0..100 {
        w.step(&[]);
    }
    assert_eq!(w.units.hp[w.unit(c).unwrap()], hp0, "jamais pris pour cible");
    // un tir le trahit
    let cs = w.unit(c).unwrap();
    w.units.cold[cs].reveal = 100;
    w.update_vis_all();
    assert!(crate::combat::unit_seen(&w, 1, cs) && shown(&w));
    // camouflé de nouveau, mais repéré de tout près
    w.units.cold[cs].reveal = 0;
    let ts = w.unit(tank).unwrap();
    w.units.x[ts] = 102 * TILE;
    w.units.y[ts] = 110 * TILE;
    w.update_vis_all();
    assert!(crate::combat::unit_seen(&w, 1, cs), "repéré à 2 cases");
}

/// Brouilleur : ses alliés disparaissent du radar ennemi (pas de la vue directe) ; le bombardier
/// furtif n'apparaît jamais au radar.
#[test]
fn jammer_and_stealth_bomber_hide_from_radar() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 80, 80, 180, 150);
    let id = w.spawn_unit(U_EW_PLANE, 1, 100 * TILE, 110 * TILE);
    let ew = w.unit(id).unwrap();
    let id = w.spawn_unit(U_GUARDIAN, 0, 132 * TILE, 110 * TILE);
    let tank = w.unit(id).unwrap();
    let id = w.spawn_unit(U_STEALTH_BOMBER, 0, 132 * TILE, 118 * TILE);
    let bomber = w.unit(id).unwrap();
    w.update_vis_all();
    assert!(crate::combat::unit_seen(&w, 1, tank), "au radar");
    assert!(!crate::combat::unit_seen(&w, 1, bomber), "furtif : absent du radar");
    let id = w.spawn_unit(U_JAMMER, 0, 134 * TILE, 110 * TILE);
    let jam = w.unit(id).unwrap();
    w.update_vis_all();
    assert!(!crate::combat::unit_seen(&w, 1, tank), "brouillé");
    assert!(!crate::combat::unit_seen(&w, 1, jam));
    // à vue, plus rien ne le cache
    w.units.x[ew] = 126 * TILE;
    w.update_vis_all();
    assert!(crate::combat::unit_seen(&w, 1, tank));
    assert!(crate::combat::unit_seen(&w, 1, bomber));
}

/// Transport lourd : il emporte un marcheur de siège, que le transport ordinaire refuse.
#[test]
fn heavy_transport_carries_heavy_units() {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 130, 130);
    let id = w.spawn_unit(U_TRANSPORT, 0, 110 * TILE, 110 * TILE);
    let t = w.unit(id).unwrap();
    let id = w.spawn_unit(U_HEAVY_TRANSPORT, 0, 112 * TILE, 110 * TILE);
    let h = w.unit(id).unwrap();
    let id = w.spawn_unit(U_SIEGE_WALKER, 0, 115 * TILE, 115 * TILE);
    let sw = w.unit(id).unwrap();
    crate::units::load_unit(&mut w, t, sw);
    assert!(w.units.cold[t].cargo.is_empty(), "trop lourd pour le transport");
    crate::units::load_unit(&mut w, h, sw);
    assert_eq!(w.units.cold[h].cargo.len(), 1);
}

/// Porte-avions : il lance jusqu'à 6 intercepteurs (payés sur la réserve) et répare l'aviation proche.
#[test]
fn carrier_launches_interceptors_and_repairs_aircraft() {
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 130, 130);
    for it in [STEEL, CIRCUIT, FUEL] {
        w.players[0].stock[it as usize] = 200;
    }
    let c = w.spawn_unit(U_CARRIER, 0, 110 * TILE, 110 * TILE);
    for _ in 0..200 * 8 {
        w.step(&[]);
    }
    let wing: Vec<usize> = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_INTERCEPTOR && w.units.cold[s].parent == c).collect();
    assert_eq!(wing.len(), CARRIER_WING as usize);
    assert_eq!(w.players[0].stock[STEEL as usize], 200 - 4 * CARRIER_WING as i32, "payés");
    // réparation : un intercepteur abîmé près du porte-avions
    let cs = w.unit(c).unwrap();
    let i = wing[0];
    let iid = w.unit_id(i);
    w.units.x[i] = w.units.x[cs] + 2 * TILE;
    w.units.y[i] = w.units.y[cs];
    w.units.hp[i] = 100;
    for _ in 0..40 {
        w.step(&[]);
    }
    assert!(w.units.hp[w.unit(iid).unwrap()] > 100, "réparé");
}

/// Rotation du bras : il dépose devant lui et prend derrière (½ tour), à sa droite (¼) ou à sa gauche (¾).
#[test]
fn arm_turn_picks_from_the_chosen_side() {
    use crate::orders::O_SET_TURN;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    put(&mut w, 0, B_GENERATOR, 96, 96, 0);
    // bras tourné vers l'est en (100, 100), dépôt devant lui ; un tapis à sa droite (sud) et un à sa
    // gauche (nord), chacun chargé d'un objet différent, qui partent vers l'ouest (ils ne touchent rien)
    let arm = put(&mut w, 0, B_INSERTER, 100, 100, 0);
    put(&mut w, 0, B_DEPOT, 101, 100, 0);
    let right = put(&mut w, 0, B_BELT1, 100, 101, 2);
    let left = put(&mut w, 0, B_BELT1, 100, 99, 2);
    assert_eq!(crate::buildings::arm_ends(&w.buildings[arm]).0, (99, 100), "½ tour par défaut : derrière");
    let r = w.building_ref(arm) as i32;
    let stock = |w: &World, it: u8| w.players[0].stock[it as usize];
    let (g0, c0) = (stock(&w, GEAR), stock(&w, CIRCUIT));
    let mut feed = |w: &mut World| {
        crate::belts::put_on_belt(w, right, GEAR);
        crate::belts::put_on_belt(w, left, CIRCUIT);
    };
    feed(&mut w);
    run(&mut w, 60);
    assert_eq!((stock(&w, GEAR), stock(&w, CIRCUIT)), (g0, c0), "rien derrière : il ne prend rien");
    // quart de tour : il prend à sa droite
    w.step(&[4, O_SET_TURN, 0, r, 1]);
    assert_eq!(crate::buildings::arm_ends(&w.buildings[arm]).0, (100, 101));
    run(&mut w, 60);
    assert_eq!((stock(&w, GEAR), stock(&w, CIRCUIT)), (g0 + 1, c0), "¼ tour : l'engrenage de droite");
    // trois quarts de tour : il prend à sa gauche
    w.step(&[4, O_SET_TURN, 0, r, 3]);
    feed(&mut w);
    run(&mut w, 60);
    // les deux circuits posés à gauche (le premier y attendait encore)
    assert_eq!((stock(&w, GEAR), stock(&w, CIRCUIT)), (g0 + 1, c0 + 2), "¾ tour : les circuits de gauche");
    // valeur invalide : ignorée
    w.step(&[4, O_SET_TURN, 0, r, 7]);
    assert_eq!(w.buildings[arm].turn, 3);
}

/// Débit de la dernière minute : tranches de 10 s glissantes, remises à zéro après un silence.
#[test]
fn flow_averages_the_last_minute() {
    use crate::buildings::{flow_add, flow_per_min};
    let mut bb = Building::default();
    for t in (0..1200).step_by(20) {
        flow_add(&mut bb, t, 1);
    }
    assert_eq!(flow_per_min(&bb, 1199), 600, "60 objets en une minute : 60,0 par minute");
    assert_eq!(flow_per_min(&bb, 2399), 0, "une minute de silence");
    for t in (2400..3600).step_by(40) {
        flow_add(&mut bb, t, 1);
    }
    assert_eq!(flow_per_min(&bb, 3599), 300, "rythme divisé par deux");
    // la tranche en cours compte au prorata : pas de chute brutale au changement de tranche
    flow_add(&mut bb, 3600, 1);
    let v = flow_per_min(&bb, 3600);
    assert!((290..=320).contains(&v), "{v}");
}

/// Virage alimenté par un bâtiment : un tapis posé le long de la face d'une fonderie, sans tapis qui
/// l'alimente, devient un virage qui reçoit ses produits ; tourner (R) le tapis de sortie vers la file
/// voisine crée ce virage.
#[test]
fn belt_along_a_face_becomes_a_building_fed_curve() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x: 94, y: 100 });
    for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
        let i = w.map.idx(94 + dx, 100 + dy);
        w.map.deposit[i] = IRON_ORE;
    }
    put(&mut w, 0, B_EXTRACTOR, 94, 100, 0);
    for x in 96..100 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    let f = put(&mut w, 0, B_FURNACE, 100, 100, 0);
    put(&mut w, 0, B_GENERATOR, 100, 104, 0);
    // tapis de sortie vers l'est en (102, 101), puis une file qui monte vers le nord jusqu'à un dépôt
    let out = put(&mut w, 0, B_BELT1, 102, 101, 0);
    let mid = put(&mut w, 0, B_BELT1, 102, 100, 3);
    put(&mut w, 0, B_BELT1, 102, 99, 3);
    put(&mut w, 0, B_DEPOT, 102, 97, 0);
    // le tapis du dessus touche aussi la face et rien ne l'alimente : lui aussi est un virage de sortie
    let mut outs = crate::buildings::out_belts(&w, f);
    outs.sort_unstable();
    assert_eq!(outs, vec![out, mid], "tout droit vers l'est, et le virage du dessus");
    // R trois fois : il pointe vers le nord, le long de la face est de la fonderie
    for _ in 0..3 {
        crate::buildings::rotate(&mut w, out);
    }
    assert_eq!(w.buildings[out].dir, 3);
    // alimenté par l'ouest = côté (3 + 3) % 4 : forme 2
    assert_eq!(crate::belts::belt_shape(&w, out), 2, "virage alimenté par la fonderie");
    assert_eq!(crate::belts::belt_shape(&w, mid), 0, "le tapis suivant, alimenté par derrière, reste droit");
    assert_eq!(crate::buildings::out_belts(&w, f), vec![out], "seul le virage reçoit les produits");
    let before = w.players[0].stock[IRON_PLATE as usize];
    run(&mut w, 4000);
    assert!(w.players[0].stock[IRON_PLATE as usize] - before > 10, "les plaques passent par le virage jusqu'au dépôt");
}

/// Un générateur s'améliore deux fois : sans production pendant le chantier, puis plus de puissance.
#[test]
fn generator_upgrade_raises_power_production() {
    use crate::orders::O_UPGRADE;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    let g = put(&mut w, 0, B_GENERATOR, 100, 100, 0);
    let r = w.building_ref(g) as i32;
    for (it, n) in [(STEEL, 100), (GEAR, 50), (CIRCUIT, 50), (ENGINE, 50)] {
        w.players[0].stock[it as usize] = n;
    }
    run(&mut w, 10);
    assert_eq!(w.players[0].power_prod, GENERATOR_LEVELS[0].prod);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert!(w.buildings[g].upgrade > 0);
    run(&mut w, 10);
    assert_eq!(w.players[0].power_prod, 0, "arrêté pendant le chantier");
    run(&mut w, GENERATOR_LEVELS[1].time as u32 * 20);
    assert_eq!(w.buildings[g].level, 1);
    assert_eq!(w.players[0].power_prod, GENERATOR_LEVELS[1].prod);
    // niveau 3, puis plus rien à améliorer
    w.step(&[3, O_UPGRADE, 0, r]);
    run(&mut w, GENERATOR_LEVELS[2].time as u32 * 20 + 10);
    assert_eq!(w.buildings[g].level, 2);
    assert_eq!(w.players[0].power_prod, GENERATOR_LEVELS[2].prod);
    let steel = w.players[0].stock[STEEL as usize];
    w.step(&[3, O_UPGRADE, 0, r]);
    assert_eq!(w.buildings[g].upgrade, 0);
    assert_eq!(w.players[0].stock[STEEL as usize], steel, "niveau maximal : rien n'est payé");
}

/// Débit maximal calculé : un assembleur toujours approvisionné et vidé l'atteint (à un tick près par cycle).
#[test]
fn assembler_fed_continuously_reaches_its_max_flow() {
    use crate::buildings::{flow_max, flow_per_min};
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    put(&mut w, 0, B_GENERATOR, 100, 96, 0);
    let a = put(&mut w, 0, B_ASSEMBLER1, 100, 100, 0);
    let rid = RECIPES.iter().position(|r| r.key == "gear").unwrap() as i32;
    let r = w.building_ref(a) as i32;
    w.step(&[4, crate::orders::O_SET_RECIPE, 0, r, rid]);
    for _ in 0..2400 {
        for _ in 0..2 {
            if crate::buildings::accepts(&w, a, IRON_PLATE) {
                insert_item(&mut w, a, IRON_PLATE);
            }
        }
        w.buildings[a].out = 0;
        w.step(&[]);
    }
    let (now, max) = (flow_per_min(&w.buildings[a], w.tick), flow_max(&w, a));
    assert!(max > 0);
    assert!(now * 100 >= max * 85 && now <= max + max / 20, "réel {now}, max {max}");
}

/// Un mur ennemi sur la trajectoire d'un tir direct prend le coup à la place de la cible ; un obus
/// d'artillerie passe par-dessus.
#[test]
fn enemy_wall_stops_direct_fire() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 85, 85, 125, 125);
    let target = put(&mut w, 1, B_DEPOT, 110, 100, 0);
    let walls = [put(&mut w, 1, B_WALL, 106, 100, 0), put(&mut w, 1, B_WALL, 106, 101, 0)];
    let tank = w.spawn_unit(unit_kind("light_tank") as u16, 0, 100 * TILE + TILE / 2, 101 * TILE);
    w.step(&[6, crate::orders::O_ATTACK, 0, 0, w.building_ref(target) as i32, 1, tank as i32]);
    let mut fired = 0;
    for _ in 0..300 {
        w.step(&[]);
        fired += w.events.chunks(5).filter(|e| e[0] == EV_FIRE).count();
    }
    assert!(fired > 3, "le char a tiré");
    assert_eq!(w.buildings[target].hp, bdef(B_DEPOT).hp, "le dépôt derrière le mur n'est pas touché");
    let lost: i32 = walls.iter().map(|&b| if w.buildings[b].alive { bdef(B_WALL).hp - w.buildings[b].hp } else { bdef(B_WALL).hp }).sum();
    assert!(lost > 0, "le mur prend les tirs");
}

/// Le croiseur hyperespace ne saute que vers une de nos balises d'hyperespace alimentées.
#[test]
fn hyper_jump_needs_a_powered_beacon() {
    use crate::orders::O_SPECIAL;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 125, 125, 165);
    flatten(&mut w, 85, 85, 125, 125);
    let depot = put(&mut w, 0, B_DEPOT, 110, 150, 0);
    let s = w.spawn_unit(U_HYPER, 0, 100 * TILE, 95 * TILE);
    let pos = |w: &World| w.unit(s).map(|u| (w.units.x[u], w.units.y[u])).unwrap();
    let p0 = pos(&w);
    w.step(&[6, O_SPECIAL, 0, s as i32, 0, 0, w.building_ref(depot) as i32]);
    run(&mut w, 260);
    assert!(crate::fixed::dist(p0.0, p0.1, pos(&w).0, pos(&w).1) < 20 * TILE, "pas de saut vers un dépôt");
    put(&mut w, 0, B_GENERATOR, 104, 150, 0);
    let beacon = put(&mut w, 0, B_BEACON, 107, 150, 0);
    run(&mut w, 10);
    assert!(w.buildings[beacon].working, "balise alimentée");
    w.step(&[6, O_SPECIAL, 0, s as i32, 0, 0, w.building_ref(beacon) as i32]);
    run(&mut w, 260);
    let (bx, by) = w.buildings[beacon].center();
    assert!(crate::fixed::dist(bx, by, pos(&w).0, pos(&w).1) <= 4 * TILE, "saut près de la balise");
}

/// Un tapis de contrôle ne reçoit que par son arrière : un tapis qui débouche sur son côté attend.
#[test]
fn router_takes_items_only_from_behind() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    // répartiteur tourné vers l'est en (105, 100) ; un tapis arrive du nord sur son côté
    put(&mut w, 0, B_SPLITTER, 105, 100, 0);
    for y in 96..100 {
        put(&mut w, 0, B_BELT1, 105, y, 1);
    }
    let r = w.map.occ[w.map.idx(105, 100)] as usize - 1;
    let start = w.map.occ[w.map.idx(105, 96)] as usize - 1;
    for _ in 0..200 {
        crate::belts::put_on_belt(&mut w, start, IRON_ORE);
        w.step(&[]);
    }
    assert!(w.buildings[r].stash.is_empty(), "rien n'entre par le côté");
    // par l'arrière : ça passe
    for x in 101..105 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    let back = w.map.occ[w.map.idx(101, 100)] as usize - 1;
    let mut got = false;
    for _ in 0..200 {
        crate::belts::put_on_belt(&mut w, back, COPPER_ORE);
        w.step(&[]);
        got |= !w.buildings[r].stash.is_empty();
    }
    assert!(got, "par l'arrière, les objets entrent");
}

/// Un bombardier qui survole un bouclier ennemi : ses bombes, larguées au-dessus de la bulle, la heurtent.
#[test]
fn bombs_dropped_over_a_shield_hit_the_shield() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 85, 85, 125, 125);
    put(&mut w, 1, B_GENERATOR, 100, 96, 0);
    let sg = put(&mut w, 1, B_SHIELD_GEN, 103, 100, 0);
    let target = put(&mut w, 1, B_DEPOT, 103, 103, 0);
    run(&mut w, 40);
    let shield0 = w.buildings[sg].shield;
    assert!(shield0 > 0, "bouclier actif");
    let bomber = w.spawn_unit(unit_kind("bomber") as u16, 0, 90 * TILE, 104 * TILE);
    w.step(&[6, crate::orders::O_ATTACK, 0, 0, w.building_ref(target) as i32, 1, bomber as i32]);
    // le bouclier se recharge vite : on compte ses impacts
    let mut hits = 0;
    for _ in 0..600 {
        w.step(&[]);
        hits += w.events.chunks(5).filter(|e| e[0] == EV_SHIELD_HIT).count();
    }
    assert_eq!(w.buildings[target].hp, bdef(B_DEPOT).hp, "le dépôt sous le bouclier n'est pas touché");
    assert!(hits > 0, "le bouclier a encaissé les bombes");
}

/// Générateur au combustible : sans combustible il ne produit rien ; il brûle d'autant plus vite que sa
/// zone consomme ; un dépôt collé l'alimente depuis la réserve.
#[test]
fn generators_burn_fuel_according_to_load() {
    let mut w = world(&[0]);
    // électricité réelle : seules les zones des générateurs alimentent
    w.infinite_grid = false;
    flatten(&mut w, 80, 80, 150, 130);
    // deux zones séparées, chacune un générateur ; 1 laboratoire dans la première, 4 dans la seconde
    let g1 = put(&mut w, 0, B_GENERATOR, 90, 100, 0);
    let g2 = put(&mut w, 0, B_GENERATOR, 130, 100, 0);
    put(&mut w, 0, B_LAB, 90, 103, 0);
    for k in 0..4 {
        put(&mut w, 0, B_LAB, 126 + 2 * (k % 2) + 4 * (k / 2), 103, 0);
    }
    w.buildings[g1].fuel = 0;
    w.buildings[g2].fuel = 0;
    crate::buildings::rebuild_power(&mut w);
    // les laboratoires sans recherche ne consomment pas : on fait tirer chaque laboratoire à la main
    let labs1: Vec<usize> = (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].kind == B_LAB && w.buildings[b].x < 110).collect();
    let labs2: Vec<usize> = (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].kind == B_LAB && w.buildings[b].x > 110).collect();
    assert_eq!((labs1.len(), labs2.len()), (1, 4));
    let draw = |w: &mut World| {
        for &b in labs1.iter().chain(labs2.iter()) {
            crate::buildings::use_power(w, b, 60);
        }
        crate::buildings::power_tick(w);
    };
    draw(&mut w);
    draw(&mut w);
    let n1 = w.buildings[labs1[0]].net as usize;
    assert_eq!(w.nets[n1].sat, 0, "sans combustible : rien");
    assert_eq!(w.nets[n1].prod, 0);
    // un hydrocarbure chacun (par un bras ou un tapis : insert_item)
    assert!(crate::buildings::accepts(&w, g1, HYDROCARBON));
    assert!(!crate::buildings::accepts(&w, g1, IRON_PLATE), "seulement du combustible");
    crate::buildings::insert_item(&mut w, g1, HYDROCARBON);
    crate::buildings::insert_item(&mut w, g2, HYDROCARBON);
    assert_eq!(w.buildings[g1].fuel, FUEL_HYDROCARBON);
    // de nouveau alimentés : leurs zones reviennent
    assert!(w.power_dirty);
    crate::buildings::rebuild_power(&mut w);
    let n1 = w.buildings[labs1[0]].net as usize;
    assert_ne!(n1, 0);
    for _ in 0..100 {
        draw(&mut w);
    }
    assert_eq!(w.nets[n1].sat, 1024, "alimenté");
    let used1 = FUEL_HYDROCARBON - w.buildings[g1].fuel;
    let used2 = FUEL_HYDROCARBON - w.buildings[g2].fuel;
    assert_eq!(used1, 60 * 100, "brûle exactement ce que la zone consomme");
    assert_eq!(used2, 4 * used1, "quatre fois plus de consommation, quatre fois plus de combustible");
    // épuisé : plus rien
    w.buildings[g2].fuel = 1;
    draw(&mut w);
    draw(&mut w);
    let n2 = w.buildings[labs2[0]].net as usize;
    assert_eq!(w.nets[n2].sat, 0, "réservoir vide : la zone s'éteint");
    // réservoir plein : il refuse
    w.buildings[g1].fuel = crate::buildings::fuel_tank(B_GENERATOR);
    assert!(!crate::buildings::accepts(&w, g1, HYDROCARBON));
    // un dépôt collé l'alimente depuis la réserve (1 par seconde)
    w.buildings[g1].fuel = 0;
    put(&mut w, 0, B_DEPOT, 92, 100, 0);
    w.players[0].stock[HYDROCARBON as usize] = 10;
    run(&mut w, 70);
    assert!(w.buildings[g1].fuel >= 3 * FUEL_HYDROCARBON, "le dépôt collé verse de l'hydrocarbure");
    assert!(w.players[0].stock[HYDROCARBON as usize] <= 7);
}

/// Un extracteur sur un gisement d'hydrocarbure fonctionne sans électricité ; collé à un générateur, il
/// le remplit directement. Les zones reliées par des relais n'en font qu'une.
#[test]
fn hydrocarbon_extractor_needs_no_power_and_zones_merge() {
    let mut w = world(&[0]);
    // électricité réelle : seules les zones des générateurs alimentent
    w.infinite_grid = false;
    flatten(&mut w, 80, 80, 150, 130);
    for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
        let i = w.map.idx(96 + dx, 100 + dy);
        w.map.deposit[i] = HYDROCARBON;
    }
    w.map.spots.push(crate::map::Spot { kind: HYDROCARBON, x: 96, y: 100 });
    // aucun générateur alimenté : l'extracteur tourne quand même ; tourné vers l'ouest, il donne au générateur
    let g = put(&mut w, 0, B_GENERATOR, 94, 100, 0);
    w.buildings[g].fuel = 0;
    let e = put(&mut w, 0, B_EXTRACTOR, 96, 100, 2);
    run(&mut w, 400);
    // 400 ticks à 1 objet / 30 ticks : 13 objets, versés au générateur (rien ne consomme)
    assert!(w.buildings[g].fuel >= 10 * FUEL_HYDROCARBON, "l'extracteur tourne sans électricité et remplit le générateur collé : {}", w.buildings[g].fuel);
    let _ = e;
    // zones : un second générateur loin, relié par des relais (22 cases entre deux relais)
    let far = put(&mut w, 0, B_GENERATOR, 140, 100, 0);
    w.buildings[far].fuel = 0;
    put(&mut w, 0, B_PYLON, 114, 101, 0);
    put(&mut w, 0, B_PYLON, 132, 101, 0);
    let lab = put(&mut w, 0, B_LAB, 140, 103, 0);
    crate::buildings::rebuild_power(&mut w);
    // le générateur lointain est à sec : sa zone n'existe pas, le laboratoire n'est dans aucune zone
    assert_eq!(w.buildings[lab].net, 0, "zone d'un générateur à sec : rien");
    crate::buildings::insert_item(&mut w, far, HYDROCARBON);
    crate::buildings::rebuild_power(&mut w);
    assert_eq!(w.buildings[lab].net, w.buildings[g].net, "rempli : une seule zone, reliée par les relais");
    let n = w.buildings[lab].net as usize;
    assert_eq!(w.nets[n].gens.len(), 2);
    crate::buildings::use_power(&mut w, lab, 60);
    crate::buildings::power_tick(&mut w);
    crate::buildings::use_power(&mut w, lab, 60);
    crate::buildings::power_tick(&mut w);
    assert_eq!(w.nets[n].sat, 1024, "le laboratoire loin est alimenté par le générateur qui a du combustible");
}

/// Départ d'une vraie partie : chaque joueur a son générateur principal, avec du combustible, et sa zone
/// alimente les bâtiments posés près du commandant.
#[test]
fn main_generator_is_placed_at_start_with_fuel() {
    let mut w = world(&[0, 1]);
    // comme une vraie partie : aucune recherche
    for pl in w.players.iter_mut() {
        pl.researched = 1;
    }
    w.place_start_buildings();
    for p in 0..2u8 {
        let (sx, sy) = w.map.starts[p as usize];
        let g = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == p && w.buildings[b].kind == B_MAIN_GENERATOR).expect("générateur principal");
        assert!(w.buildings[g].complete());
        assert_eq!(w.buildings[g].fuel, START_FUEL_UNITS * FUEL_HYDROCARBON);
        let (gx, gy) = (w.buildings[g].x, w.buildings[g].y);
        assert!((gx - sx).abs() <= 6 && (gy - sy).abs() <= 6, "près du commandant");
        assert!(w.buildings[g].net != 0);
        assert_eq!(w.nets[w.buildings[g].net as usize].cap, 1500);
    }
    // une centrale à hydrocarbure (recherche Hydrocarbures) se pose désormais hors gisement
    w.players[0].researched = u64::MAX;
    let (sx, sy) = w.map.starts[0];
    assert!(crate::buildings::place_building(&mut w, 0, B_HYDRO, sx + 8, sy + 8, 0).is_some() || crate::buildings::place_building(&mut w, 0, B_HYDRO, sx - 10, sy + 8, 0).is_some());
}

/// Trois zones en ligne : celle du milieu à sec, les deux du bout ne sont plus reliées (chacune vit de
/// son propre combustible) ; les tapis hors zone ou dans une zone éteinte s'arrêtent.
#[test]
fn dry_middle_zone_splits_the_network_and_stops_belts() {
    let mut w = world(&[0]);
    w.infinite_grid = false;
    flatten(&mut w, 80, 80, 150, 130);
    // générateurs à 16 cases d'écart (liaison : 20) ; A et C sont à 32 cases (non reliés directement)
    let a = put(&mut w, 0, B_GENERATOR, 100, 100, 0);
    let b = put(&mut w, 0, B_GENERATOR, 116, 100, 0);
    let c = put(&mut w, 0, B_GENERATOR, 132, 100, 0);
    let la = put(&mut w, 0, B_LAB, 100, 103, 0);
    let lc = put(&mut w, 0, B_LAB, 132, 103, 0);
    for g in [a, b, c] {
        w.buildings[g].fuel = 10 * FUEL_HYDROCARBON;
    }
    crate::buildings::rebuild_power(&mut w);
    assert_ne!(w.buildings[la].net, 0);
    assert_eq!(w.buildings[la].net, w.buildings[lc].net, "trois zones alimentées : un seul réseau");
    w.buildings[b].fuel = 0;
    crate::buildings::rebuild_power(&mut w);
    let (na, nc) = (w.buildings[la].net, w.buildings[lc].net);
    assert!(na != 0 && nc != 0 && na != nc, "milieu à sec : deux réseaux isolés ({} et {})", na, nc);
    assert_eq!(w.nets[na as usize].gens, vec![a as u32]);
    assert_eq!(w.nets[nc as usize].gens, vec![c as u32]);
    // tapis : une file dans la zone de A tourne ; une file qui sort de toute zone s'arrête entièrement
    let first = put(&mut w, 0, B_BELT1, 96, 106, 0);
    for x in 97..100 {
        put(&mut w, 0, B_BELT1, x, 106, 0);
    }
    let long = put(&mut w, 0, B_BELT1, 96, 115, 0);
    for x in 97..125 {
        put(&mut w, 0, B_BELT1, x, 115, 0);
    }
    run(&mut w, 30);
    let line = |w: &World, b: usize| w.belts.lines[w.buildings[b].line as usize].powered;
    assert!(line(&w, first), "file dans la zone de A : alimentée");
    assert!(!line(&w, long), "file qui traverse une zone éteinte et le vide : arrêtée");
    crate::belts::put_on_belt(&mut w, long, IRON_ORE);
    let before = w.belts.lines[w.buildings[long].line as usize].items[0].1;
    run(&mut w, 40);
    assert_eq!(w.belts.lines[w.buildings[long].line as usize].items[0].1, before, "les objets ne bougent pas");
    // les tapis consomment : 1 kW par case de tapis de base
    let n = w.buildings[first].net as usize;
    assert!(w.nets[n].demand >= 4, "les tapis consomment ({} kW)", w.nets[n].demand);
    // une zone sous-alimentée ne coupe pas les tapis ; une zone éteinte, si
    let tiles = w.belts.lines[w.buildings[first].line as usize].tiles.clone();
    w.nets[n].sat = 100;
    assert!(crate::belts::line_powered(&w, &tiles), "zone sous-alimentée : les tapis tournent");
    w.nets[n].sat = 0;
    assert!(!crate::belts::line_powered(&w, &tiles), "zone éteinte : arrêtés");
}

/// Combustible transporté : un générateur alimenté seulement par un tapis venant d'un extracteur
/// d'hydrocarbure se remplit de nouveau après être tombé à sec (le tapis chargé d'hydrocarbure tourne sans
/// courant) ; un bras sans courant passe le combustible mais pas le minerai. Alertes : une fois chacune.
#[test]
fn fuel_carrying_belts_and_arms_run_without_power_and_alerts_fire_once() {
    let mut w = world(&[0]);
    w.infinite_grid = false;
    flatten(&mut w, 80, 80, 130, 130);
    for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
        let i = w.map.idx(90 + dx, 100 + dy);
        w.map.deposit[i] = HYDROCARBON;
    }
    w.map.spots.push(crate::map::Spot { kind: HYDROCARBON, x: 90, y: 100 });
    put(&mut w, 0, B_EXTRACTOR, 90, 100, 0);
    for x in 92..98 {
        put(&mut w, 0, B_BELT1, x, 100, 0);
    }
    let g = put(&mut w, 0, B_GENERATOR, 98, 100, 0);
    // à sec : la zone s'éteint, mais le tapis d'hydrocarbure continue et remplit le générateur
    w.buildings[g].fuel = 0;
    w.power_dirty = true;
    run(&mut w, 1200);
    assert!(w.buildings[g].fuel > 5 * FUEL_HYDROCARBON, "réalimenté par son tapis : {}", w.buildings[g].fuel);
    // bras sans courant : le combustible passe, le minerai non
    let mut w = world(&[0]);
    w.infinite_grid = false;
    flatten(&mut w, 80, 80, 130, 130);
    let gen = put(&mut w, 0, B_GENERATOR, 100, 100, 0);
    w.buildings[gen].fuel = 0;
    let arm = put(&mut w, 0, B_INSERTER, 102, 100, 2);
    let belt = put(&mut w, 0, B_BELT1, 103, 100, 0);
    w.power_dirty = true;
    run(&mut w, 10);
    crate::belts::put_on_belt(&mut w, belt, IRON_ORE);
    run(&mut w, 200);
    assert_eq!(w.buildings[gen].fuel, 0, "le bras sans courant ne prend pas de minerai");
    let l = w.buildings[belt].line as usize;
    w.belts.lines[l].items.clear();
    crate::belts::put_on_belt(&mut w, belt, HYDROCARBON);
    run(&mut w, 200);
    // reçu (le générateur, de nouveau alimenté, en brûle déjà un peu pour le bras et le tapis)
    assert!(w.buildings[gen].fuel > FUEL_HYDROCARBON / 2, "mais il passe l'hydrocarbure au générateur : {}", w.buildings[gen].fuel);
    let _ = arm;
    // alertes : moins d'une minute, puis à sec, une seule fois chacune
    let mut w = world(&[0]);
    w.infinite_grid = false;
    flatten(&mut w, 80, 80, 130, 130);
    let g = put(&mut w, 0, B_GENERATOR, 100, 100, 0);
    let lab = put(&mut w, 0, B_LAB, 100, 103, 0);
    w.buildings[g].fuel = 2 * FUEL_HYDROCARBON;
    crate::buildings::rebuild_power(&mut w);
    let (mut low, mut dry) = (0, 0);
    for _ in 0..1200 {
        crate::buildings::use_power(&mut w, lab, 300);
        w.events.clear();
        crate::buildings::power_tick(&mut w);
        for e in w.events.chunks(5) {
            low += (e[0] == EV_FUEL_LOW) as i32;
            dry += (e[0] == EV_FUEL_DRY) as i32;
        }
    }
    assert_eq!((low, dry), (1, 1), "une alerte « moins d'une minute », puis une « à sec »");
}

/// Deux assembleurs collés qui font la même recette partagent leurs ingrédients : celui qui ne reçoit
/// rien produit aussi. Un troisième, collé mais sur une autre recette, ne reçoit rien.
#[test]
fn twin_crafters_share_their_inputs() {
    use crate::buildings::{accepts, twins_of};
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    let a = put(&mut w, 0, B_ASSEMBLER1, 100, 100, 0);
    let b = put(&mut w, 0, B_ASSEMBLER1, 102, 100, 0);
    let c = put(&mut w, 0, B_ASSEMBLER1, 100, 102, 0);
    let gear = RECIPES.iter().position(|r| r.key == "gear").unwrap() as i32;
    let other = RECIPES.iter().position(|r| r.crafter == Crafter::Assembler && r.key != "gear").unwrap() as i32;
    for (m, r) in [(a, gear), (b, gear), (c, other)] {
        let id = w.building_ref(m) as i32;
        w.step(&[4, crate::orders::O_SET_RECIPE, 0, id, r]);
    }
    assert_eq!(twins_of(&w, a), vec![b]);
    for _ in 0..1200 {
        if accepts(&w, a, IRON_PLATE) {
            insert_item(&mut w, a, IRON_PLATE);
        }
        w.buildings[a].out = 0;
        w.buildings[b].out = 0;
        w.step(&[]);
    }
    let made = |m: usize| crate::buildings::flow_per_min(&w.buildings[m], w.tick);
    assert!(made(b) > 0, "la jumelle produit avec les ingrédients partagés");
    assert!(made(a) > 0);
    assert_eq!(made(c), 0, "une recette différente ne partage pas");
    assert!(w.buildings[c].inv.iter().all(|&x| x == 0));
}

/// Deux usines collées qui produisent la même unité équilibrent leur réserve de composants.
#[test]
fn twin_factories_share_their_components() {
    use crate::buildings::{factory_has, twins_of};
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    let a = put(&mut w, 0, B_LAND_FACTORY, 100, 100, 0);
    let b = put(&mut w, 0, B_LAND_FACTORY, 103, 100, 0);
    let k = unit_kind("light_tank") as u16;
    for f in [a, b] {
        w.buildings[f].queue.push((k, 5));
    }
    assert_eq!(twins_of(&w, b), vec![a]);
    let cost = udef(k).cost;
    for &(it, n) in cost {
        crate::buildings::factory_put(&mut w.buildings[a], it, n * 2);
    }
    run(&mut w, 200);
    for &(it, _) in cost {
        assert!(factory_has(&w.buildings[b], it) > 0 || w.buildings[b].working || w.buildings[b].flow.iter().any(|&x| x > 0), "objet {it} partagé");
    }
    // une autre unité en tête : plus de partage
    w.buildings[b].queue[0].0 = unit_kind("line_robot") as u16;
    assert!(twins_of(&w, a).is_empty());
}

/// Répartiteur : ses sorties se règlent — les trois (par défaut), un angle et l'avant — à la pose (bits
/// 5-6 de la direction de l'ordre de construction) et après (ordre SET_SPLIT).
#[test]
fn splitter_outputs_are_configurable() {
    use crate::orders::{O_BUILD, O_SET_SPLIT};
    let count = |w: &World, b: usize| w.belts.lines[w.buildings[b].line as usize].items.len();
    let setup = |w: &mut World| -> (usize, [usize; 3]) {
        // répartiteur tourné vers l'est en (100, 100) ; un tapis en cul-de-sac à chaque sortie
        let r = put(w, 0, B_SPLITTER, 100, 100, 0);
        let left = put(w, 0, B_BELT1, 100, 99, 3);
        let front = put(w, 0, B_BELT1, 101, 100, 0);
        let right = put(w, 0, B_BELT1, 100, 101, 1);
        (r, [left, front, right])
    };
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    let (r, outs) = setup(&mut w);
    assert_eq!(w.buildings[r].split, 0);
    feed(&mut w, r, IRON_PLATE, 6);
    assert_eq!(outs.map(|b| count(&w, b)), [2, 2, 2], "par défaut : les trois sorties");
    // gauche et avant
    let rr = w.building_ref(r) as i32;
    w.step(&[4, O_SET_SPLIT, 0, rr, 1]);
    assert_eq!(w.buildings[r].split, 1);
    for b in outs {
        let l = w.buildings[b].line as usize;
        w.belts.lines[l].items.clear();
    }
    feed(&mut w, r, IRON_PLATE, 6);
    assert_eq!(outs.map(|b| count(&w, b)), [3, 3, 0], "gauche et avant");
    // droite et avant
    w.step(&[4, O_SET_SPLIT, 0, rr, 2]);
    for b in outs {
        let l = w.buildings[b].line as usize;
        w.belts.lines[l].items.clear();
    }
    feed(&mut w, r, IRON_PLATE, 6);
    assert_eq!(outs.map(|b| count(&w, b)), [0, 3, 3], "droite et avant");
    // valeur invalide : ignorée
    w.step(&[4, O_SET_SPLIT, 0, rr, 3]);
    assert_eq!(w.buildings[r].split, 2);
    // réglé à la pose : bits 5-6 de la direction de l'ordre de construction
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    let c = w.players[0].commander as i32;
    let cs = w.unit(c as u32).unwrap();
    w.units.x[cs] = 100 * TILE;
    w.units.y[cs] = 103 * TILE;
    w.step(&[9, O_BUILD, 0, 0, B_SPLITTER as i32, 100, 100, 1 << 5, 1, c]);
    run(&mut w, 400);
    let b = building_at(&w, 100, 100).expect("répartiteur posé");
    assert_eq!(w.buildings[b].kind, B_SPLITTER);
    assert_eq!(w.buildings[b].split, 1, "réglé à la pose");
    assert_eq!(w.buildings[b].dir, 0);
}

/// Un répartiteur compte comme un tapis pour la forme des tapis voisins : un tapis posé en travers d'une
/// de ses sorties devient un virage, celui qui part tout droit de son avant reste droit, et l'entrée (un
/// virage qui débouche à l'arrière) ne change pas. Une sortie coupée par le mode ne compte plus ; un
/// tapis alimenté par une sortie ne reçoit pas les produits d'un bâtiment voisin.
#[test]
fn splitter_outputs_shape_neighbour_belts() {
    use crate::belts::belt_shape;
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    let s = put(&mut w, 0, B_SPLITTER, 100, 100, 0);
    // entrée : une file qui descend vers le sud puis tourne vers l'est dans l'arrière du répartiteur
    let top = put(&mut w, 0, B_BELT1, 99, 98, 1);
    put(&mut w, 0, B_BELT1, 99, 99, 1);
    let input = put(&mut w, 0, B_BELT1, 99, 100, 0);
    // sorties gauche (nord) et droite (sud) : des files vers l'est, en travers ; avant : tout droit
    let left = put(&mut w, 0, B_BELT1, 100, 99, 0);
    let left2 = put(&mut w, 0, B_BELT1, 101, 99, 0);
    let right = put(&mut w, 0, B_BELT1, 100, 101, 0);
    let right2 = put(&mut w, 0, B_BELT1, 101, 101, 0);
    let front = put(&mut w, 0, B_BELT1, 101, 100, 0);
    put(&mut w, 0, B_DEPOT, 102, 98, 0);
    put(&mut w, 0, B_DEPOT, 102, 101, 0);
    assert_eq!(belt_shape(&w, input), 2, "l'entrée reste un virage alimenté par le nord");
    assert_eq!(belt_shape(&w, left), 1, "sortie gauche : virage alimenté par le sud");
    assert_eq!(belt_shape(&w, right), 2, "sortie droite : virage alimenté par le nord");
    assert_eq!(belt_shape(&w, front), 0, "sortie avant : droit");
    assert_eq!((belt_shape(&w, left2), belt_shape(&w, right2)), (0, 0));
    // les objets entrent par la file et sortent des trois côtés
    let before = w.players[0].stock[IRON_PLATE as usize];
    for _ in 0..6 {
        while !crate::belts::put_on_belt(&mut w, top, IRON_PLATE) {
            w.step(&[]);
        }
        run(&mut w, 10);
    }
    run(&mut w, 400);
    assert_eq!(w.players[0].stock[IRON_PLATE as usize] - before, 4, "deux par la gauche, deux par la droite");
    assert_eq!(w.belts.lines[w.buildings[front].line as usize].items.len(), 2, "deux devant (cul-de-sac)");
    // gauche et avant seulement : le tapis de droite n'est plus alimenté, il redevient droit
    w.buildings[s].split = 1;
    assert_eq!((belt_shape(&w, left), belt_shape(&w, right)), (1, 0));
    // avant et droite seulement
    w.buildings[s].split = 2;
    assert_eq!((belt_shape(&w, left), belt_shape(&w, right)), (0, 2));
    // une fonderie touche le tapis de droite par le sud : il reste alimenté par le répartiteur, elle n'y
    // dépose rien ; sans cette sortie, il devient le virage de sortie de la fonderie
    let f = put(&mut w, 0, B_FURNACE, 100, 102, 0);
    assert_eq!(belt_shape(&w, right), 2);
    assert!(crate::buildings::out_belts(&w, f).is_empty(), "la sortie du répartiteur l'emporte");
    w.buildings[s].split = 1;
    assert_eq!(belt_shape(&w, right), 1, "virage alimenté par la fonderie");
    assert_eq!(crate::buildings::out_belts(&w, f), vec![right]);
}

/// La fonderie s'améliore sur place (automatisation, puis électronique) : elle garde sa recette et va
/// d'autant plus vite que son niveau est élevé.
#[test]
fn furnace_upgrade_speeds_up_smelting() {
    use crate::buildings::{accepts, crafter_speed, flow_max, flow_per_min};
    use crate::orders::O_UPGRADE;
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 125, 125);
    let f = put(&mut w, 0, B_FURNACE, 100, 100, 0);
    for it in [STEEL, GEAR, CIRCUIT, ENGINE, PROCESSOR] {
        w.players[0].stock[it as usize] = 100;
    }
    let r = w.building_ref(f) as i32;
    let base = crafter_speed(&w.buildings[f]);
    w.step(&[3, O_UPGRADE, 0, r]);
    assert!(w.buildings[f].upgrade > 0, "amélioration lancée");
    assert_eq!(w.players[0].stock[STEEL as usize], 92, "coût payé");
    for _ in 0..20 * 20 + 5 {
        w.step(&[]);
    }
    assert_eq!(w.buildings[f].level, 1);
    assert_eq!(crafter_speed(&w.buildings[f]), base * 160 / 100);
    // niveau 2 alimenté sans arrêt : il produit plus vite que la fonderie de base
    w.step(&[3, O_UPGRADE, 0, r]);
    for _ in 0..30 * 20 + 5 {
        w.step(&[]);
    }
    assert_eq!(w.buildings[f].level, 2);
    let plain = put(&mut w, 0, B_FURNACE, 110, 100, 0);
    for _ in 0..1200 {
        for m in [f, plain] {
            if accepts(&w, m, IRON_ORE) {
                insert_item(&mut w, m, IRON_ORE);
            }
            w.buildings[m].out = 0;
        }
        w.step(&[]);
    }
    let (fast, slow) = (flow_per_min(&w.buildings[f], w.tick), flow_per_min(&w.buildings[plain], w.tick));
    assert!(fast * 100 >= slow * 200, "niveau 3 : {fast} contre {slow}");
    assert!(flow_max(&w, f) > flow_max(&w, plain));
    w.step(&[3, O_UPGRADE, 0, r]);
    assert_eq!(w.buildings[f].upgrade, 0, "pas de niveau 4");
}

#[test]
fn projectiles_demo_fires_every_projectile_kind() {
    let mut w = crate::stress::projectiles_demo();
    let mut kinds = std::collections::BTreeSet::new();
    for _ in 0..900 {
        w.step(&[]);
        for p in &w.projectiles {
            kinds.insert(WEAPONS[p.weapon as usize].proj as u8);
        }
    }
    println!("familles de projectiles : {:?}", kinds);
    assert!(kinds.len() >= 10, "presque toutes les familles tirent : {:?}", kinds);
}

#[test]
fn showcase_demo_places_every_land_building_and_unit() {
    let mut w = crate::stress::showcase_demo();
    for _ in 0..40 {
        w.step(&[]);
    }
    // tous les bâtiments terrestres (ceux qui demandent de l'eau manquent) et toutes les unités du joueur 0
    let land = BUILDINGS.iter().filter(|d| !d.water).count();
    let placed = w.buildings.iter().filter(|b| b.alive && b.owner == 0).count();
    assert!(placed >= land - 2, "{placed} bâtiments posés sur {land}");
    let units = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0).count();
    assert!(units >= UNITS.len(), "{units} unités");
}

/// Partie sans brouillard de guerre (paramètre après la faune) : toute la carte est vue par chaque
/// équipe, les unités furtives sont visibles et ciblées ; le réglage survit à la sauvegarde.
#[test]
fn no_fog_of_war_reveals_everything() {
    let base = |fog: Option<i32>| {
        let mut p = vec![4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0];
        if let Some(f) = fog {
            p.push(f);
        }
        p
    };
    // paramètre absent (anciennes sauvegardes) ou à 1 : brouillard
    for fog in [None, Some(1)] {
        let w = World::new(&base(fog));
        assert!(w.fog);
        let far = w.vis[1].iter().filter(|&&c| c & 1 == 0).count();
        assert!(far > w.vis[1].len() / 2, "l'essentiel de la carte est caché");
    }
    let mut w = World::new(&base(Some(0)));
    assert!(!w.fog);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    flatten(&mut w, 80, 80, 150, 150);
    // un char ennemi à l'autre bout de la carte, sans aucune unité de l'équipe 1 à proximité
    let id = w.spawn_unit(U_GUARDIAN, 0, 20 * TILE, 490 * TILE);
    let far = w.unit(id).unwrap();
    // un commando camouflé à 16 cases d'un char ennemi
    let c = w.spawn_unit(U_COMMANDO, 0, 100 * TILE, 110 * TILE);
    w.spawn_unit(U_GUARDIAN, 1, 116 * TILE, 110 * TILE);
    w.update_vis_all();
    for v in &w.vis {
        assert!(v.iter().all(|&c| c == crate::combat::VIS_ALL), "toute la carte vue et explorée");
    }
    assert!(crate::combat::unit_seen(&w, 1, far), "char lointain vu");
    let cs = w.unit(c).unwrap();
    assert!(crate::combat::cloaked(&w, cs));
    assert!(crate::combat::unit_seen(&w, 1, cs), "commando camouflé vu");
    // le rendu de l'adversaire montre le commando, et sa grille de vision est pleine
    let buf = crate::render::render(&w, 0, 0, 512, 512, 2, 1, true);
    let o = crate::render::HEADER + w.players.len() * crate::render::PLAYER_WORDS;
    assert!((0..buf[3] as usize).any(|i| buf[o + i * crate::render::UNIT_WORDS] as u32 == c), "commando affiché");
    assert_eq!(buf[11], 1);
    let full = (crate::combat::VIS_ALL as u32) * 0x0101_0101;
    let words = (w.vis_w * w.vis_w / 4) as usize;
    assert!(buf[buf.len() - words..].iter().all(|&x| x as u32 == full), "grille de vision pleine");
    // le char tire sur le commando sans l'avoir repéré
    let hp0 = w.units.hp[cs];
    for _ in 0..100 {
        w.step(&[]);
    }
    assert!(w.unit(c).map(|s| w.units.hp[s] < hp0).unwrap_or(true), "commando pris pour cible");
    // sauvegarde : le réglage vient des paramètres et la grille reste pleine
    let r = crate::save::restore(&crate::save::snapshot(&w)).unwrap();
    assert!(!r.fog);
    assert!(r.vis.iter().all(|v| v.iter().all(|&c| c == crate::combat::VIS_ALL)));
    assert_eq!(r.hash(), w.hash());
}

#[test]
fn belt_contents_per_tile_and_line() {
    // file de 4 tapis vers l'est qui ne débouche nulle part : les objets se tassent au bout
    let mut w = world(&[0]);
    flatten(&mut w, 90, 90, 115, 115);
    let tiles: Vec<usize> = (100..104).map(|x| put(&mut w, 0, B_BELT1, x, 100, 0)).collect();
    run(&mut w, 10); // le courant de la file est revu tous les 10 ticks
    let empty = crate::belts::belt_contents(&w, tiles[0]).expect("tapis relié à une file");
    assert_eq!(empty, crate::belts::BeltContents { tile: vec![], line: vec![], tiles: 4, jam: 0, powered: true });
    for it in [IRON_PLATE, IRON_PLATE, COPPER_PLATE, IRON_PLATE, COPPER_PLATE] {
        while !crate::belts::put_on_belt(&mut w, tiles[0], it) {
            w.step(&[]);
        }
    }
    run(&mut w, 400);
    let last = crate::belts::belt_contents(&w, tiles[3]).unwrap();
    assert_eq!(last.tile, vec![IRON_PLATE, IRON_PLATE, COPPER_PLATE, IRON_PLATE], "case de sortie pleine, de l'avant vers l'arrière");
    assert_eq!(last.line, vec![(IRON_PLATE, 3), (COPPER_PLATE, 2)], "toute la file, par objet");
    assert_eq!(last.jam, 5, "file bouchée : tout est tassé");
    assert_eq!(crate::belts::belt_contents(&w, tiles[2]).unwrap().tile, vec![COPPER_PLATE]);
    assert!(crate::belts::belt_contents(&w, tiles[0]).unwrap().tile.is_empty());
    // la fiche du bâtiment l'expose ; un bâtiment qui n'est pas un tapis n'a pas de contenu de tapis
    let info = crate::render::info_building(&w, w.building_ref(tiles[3]));
    assert!(info.starts_with(r#"{"belt":{"tile":[6,6,7,6],"line":[[6,3],[7,2]],"tiles":4,"cap":16,"jam":5,"powered":true},"#), "{info}");
    let depot = put(&mut w, 0, B_DEPOT, 100, 105, 0);
    assert!(crate::belts::belt_contents(&w, depot).is_none());
    assert!(crate::render::info_building(&w, w.building_ref(depot)).starts_with(r#"{"belt":null,"#));
}
