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
    w.units.cold[s].orders.push(Order::Move { x: 114 * TILE, y: 118 * TILE, gx: 114 * TILE, gy: 118 * TILE, attack: false });
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
    assert!(kept >= sent - 40, "le surplus est mis en réserve : {} sur {}", kept, sent);
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
