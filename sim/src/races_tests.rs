//! Tests des races : socle commun (race du joueur, droits par race, sauvegarde), Souche (réseau de
//! racines, croissance, couveuse, Matrice, digestion) et Transhumants (déploiement, repli, relevés,
//! usure des gisements).

use crate::buildings::{complete_building, place_building, remove_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::orders::{O_DEPLOY, O_FACTORY_QUEUE, O_MOVE, O_PACK, O_RESEARCH, O_RESEARCH_QUEUE};
use crate::world::*;

/// Paramètres d'une partie à deux joueurs (équipes 0 et 1), sans faune, avec brouillard, et leurs races.
fn params(r0: u8, r1: u8) -> Vec<i32> {
    vec![4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, r0 as i32, r1 as i32]
}

fn game(r0: u8, r1: u8) -> World {
    let mut w = World::new(&params(r0, r1));
    w.place_start_buildings();
    w
}

fn order(w: &mut World, p: i32, cmd: i32, args: &[i32]) {
    let mut o = vec![0, cmd, p];
    o.extend_from_slice(args);
    o[0] = o.len() as i32 - 1;
    w.step(&o);
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

fn find_building(w: &World, owner: u8, kind: u16) -> Option<usize> {
    (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == owner && w.buildings[b].kind == kind)
}

fn find_unit(w: &World, owner: u8, kind: u16) -> Option<usize> {
    (0..w.units.alive.len()).find(|&s| w.units.alive[s] && w.units.owner[s] == owner && w.units.kind[s] == kind)
}

/// Zone plate et vide autour de (x0, y0)–(x1, y1), sans gisement.
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
    w.wear.resize(w.map.spots.len(), 0);
}

fn spot(w: &mut World, kind: u8, x: i32, y: i32) -> usize {
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(x + dx, y + dy);
            w.map.deposit[i] = kind;
        }
    }
    w.map.spots.push(crate::map::Spot { kind, x, y, purity: 0 });
    w.wear.resize(w.map.spots.len(), 0);
    w.map.spots.len() - 1
}

fn net_of(w: &World, b: usize) -> &Net {
    &w.nets[w.buildings[b].net as usize]
}

// ---------- Socle ----------

#[test]
fn races_come_from_the_params() {
    let w = game(RACE_SOUCHE, RACE_TRANSH);
    assert_eq!(w.players[0].race, RACE_SOUCHE);
    assert_eq!(w.players[1].race, RACE_TRANSH);
    let c0 = w.unit(w.players[0].commander).unwrap();
    let c1 = w.unit(w.players[1].commander).unwrap();
    assert_eq!(w.units.kind[c0], U_QUEEN);
    assert_eq!(w.units.kind[c1], U_ARK);
    // pas de générateur principal pour ces races
    assert!(find_building(&w, 0, B_MAIN_GENERATOR).is_none());
    assert!(find_building(&w, 1, B_MAIN_GENERATOR).is_none());
    // anciennes parties (sans races) : Industriels
    let old = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1]);
    assert_eq!(old.players[0].race, RACE_INDUS);
    assert_eq!(old.units.kind[old.unit(old.players[0].commander).unwrap()], U_COMMANDER);
}

#[test]
fn each_race_builds_produces_and_researches_its_own_things() {
    let mut w = game(RACE_INDUS, RACE_SOUCHE);
    let (sx, sy) = w.map.starts[0];
    // un Industriel ne pose pas d'organe, la Souche ne pose pas de tapis
    assert!(!crate::buildings::can_place(&w, 0, B_LEAVES, sx + 6, sy + 6, 0));
    assert!(!crate::races::building_ok(&w, 1, B_BELT1));
    assert!(crate::races::building_ok(&w, 1, B_ROOT));
    // recherches : celles de sa race seulement
    order(&mut w, 0, O_RESEARCH, &[T_S_SPITTERS as i32]);
    assert_eq!(w.players[0].research, 0);
    order(&mut w, 1, O_RESEARCH, &[2]);
    assert_eq!(w.players[1].research, 0);
    order(&mut w, 1, O_RESEARCH, &[T_S_SPITTERS as i32]);
    assert_eq!(w.players[1].research, T_S_SPITTERS);
    // unités : une couveuse ne produit pas de char léger
    let heart = find_building(&w, 1, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    let brood = place_building(&mut w, 1, B_BROOD, hx + 4, hy, 0).or_else(|| place_building(&mut w, 1, B_BROOD, hx - 4, hy, 0)).unwrap();
    complete_building(&mut w, brood);
    let r = w.building_ref(brood) as i32;
    order(&mut w, 1, O_FACTORY_QUEUE, &[r, U_LIGHT_TANK as i32, 1]);
    assert!(w.buildings[brood].queue.is_empty());
    order(&mut w, 1, O_FACTORY_QUEUE, &[r, U_GNAWER as i32, 1]);
    assert_eq!(w.buildings[brood].queue.len(), 1);
}

#[test]
fn souche_mutations_are_exclusive() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    order(&mut w, 0, O_RESEARCH_QUEUE, &[T_S_SCALES as i32]);
    order(&mut w, 0, O_RESEARCH_QUEUE, &[T_S_QUICK_SAP as i32]);
    let p = &w.players[0];
    assert_eq!(p.research, T_S_SCALES);
    assert!(!p.research_queue.contains(&T_S_QUICK_SAP));
    // acquise, l'autre reste interdite
    w.players[0].research = 0;
    w.players[0].set_tech(T_S_SCALES);
    order(&mut w, 0, O_RESEARCH, &[T_S_QUICK_SAP as i32]);
    assert_eq!(w.players[0].research, 0);
    // Écailles : +30 % de points de vie pour les organismes
    let q = w.unit(w.players[0].commander).unwrap();
    assert_eq!(w.max_hp(q), udef(U_QUEEN).hp * 13 / 10);
}

#[test]
fn research_beyond_64_and_shared_recipes() {
    let mut p = World::new(&params(RACE_TRANSH, RACE_INDUS)).players[0].clone();
    p.set_tech(100);
    assert!(p.has_tech(100));
    assert!(!p.has_tech(99));
    // l'électronique nomade donne aussi l'électronique (recettes des plaquettes, moteurs, processeurs)
    p.set_tech(T_T_ELECTRONICS);
    assert!(p.has_tech(T_ELECTRONICS));
}

#[test]
fn races_survive_save_and_restore() {
    let mut w = game(RACE_SOUCHE, RACE_TRANSH);
    steps(&mut w, 200);
    let snap = crate::save::snapshot(&w);
    let mut r = crate::save::restore(&snap).expect("restauration");
    assert_eq!(r.hash(), w.hash());
    assert_eq!(r.players[0].race, RACE_SOUCHE);
    let heart = find_building(&r, 0, B_SEED_HEART).unwrap();
    assert!(net_of(&r, heart).seve > 0);
    for _ in 0..300 {
        assert_eq!(r.step(&[]), w.step(&[]));
    }
}

// ---------- Souche ----------

#[test]
fn souche_starts_with_a_seed_heart_and_its_reserve() {
    let w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).expect("graine-mère");
    assert!(w.buildings[heart].complete());
    let n = net_of(&w, heart);
    assert_eq!((n.seve, n.sels), (crate::souche::START_SEVE, crate::souche::START_SELS));
    assert_eq!(n.store, crate::souche::STORE_BASE + crate::souche::STORE_HEART);
    assert!(find_unit(&w, 0, U_SOWER).is_some());
}

#[test]
fn organs_grow_on_terreau_only_and_draw_their_network() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    // loin du terreau : refusé ; sur le terreau : planté
    assert!(place_building(&mut w, 0, B_LEAVES, hx + 20, hy, 0).is_none());
    let leaves = (0..4).find_map(|k| place_building(&mut w, 0, B_LEAVES, hx + 4 + k, hy - 3, 0)).expect("frondaison sur le terreau");
    let before = net_of(&w, heart).seve;
    steps(&mut w, 10);
    assert!(!w.buildings[leaves].complete());
    // croissance : 8 s × 1,5 = 240 ticks (et le calcul du réseau)
    steps(&mut w, 300);
    assert!(w.buildings[leaves].complete(), "frondaison poussée");
    assert_eq!(w.buildings[leaves].paid[0], 40);
    // elle produit ensuite dans le réseau (la graine-mère aussi)
    let mid = net_of(&w, heart).seve;
    assert!(mid < before + 15, "la frondaison a coûté de la sève : {before} → {mid}");
    steps(&mut w, 400);
    assert!(net_of(&w, heart).seve > mid + 30, "production : {mid} → {}", net_of(&w, heart).seve);
}

#[test]
fn a_line_of_roots_grows_step_by_step() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    flatten(&mut w, hx - 30, hy - 4, hx - 3, hy + 6);
    // une file plantée d'un coup, au-delà du terreau actuel
    let roots: Vec<usize> = (0..6).map(|k| place_building(&mut w, 0, B_ROOT, hx - 5 - 3 * k, hy + 1, 0).expect("racine sur le terreau à venir")).collect();
    assert!(place_building(&mut w, 0, B_ROOT, hx - 40, hy + 1, 0).is_none(), "loin de tout : refusée");
    steps(&mut w, 1200);
    for &r in &roots {
        assert!(w.buildings[r].complete(), "chaque racine pousse à son tour");
        assert_eq!(w.buildings[r].net, w.buildings[heart].net);
    }
}

#[test]
fn a_cut_root_splits_the_network_and_its_reserve() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    flatten(&mut w, hx - 30, hy - 4, hx - 3, hy + 6);
    // une file de racines vers l'ouest, puis un bulbe au bout
    let mut roots = Vec::new();
    let mut x = hx - 6;
    while x > hx - 22 {
        let b = place_building(&mut w, 0, B_ROOT, x, hy + 1, 0).expect("racine sur le terreau");
        complete_building(&mut w, b);
        roots.push(b);
        x -= 3;
        crate::buildings::rebuild_power(&mut w);
    }
    let bulb = place_building(&mut w, 0, B_BULB, x - 1, hy + 1, 0).expect("bulbe au bout");
    complete_building(&mut w, bulb);
    crate::buildings::rebuild_power(&mut w);
    assert_eq!(w.buildings[bulb].net, w.buildings[heart].net, "un seul réseau");
    let total = net_of(&w, heart).seve;
    // deux racines du milieu meurent (les terreaux voisins se recouvrent) : deux réseaux, la réserve
    // partagée sans perte
    remove_building(&mut w, roots[1], false);
    remove_building(&mut w, roots[2], false);
    crate::buildings::rebuild_power(&mut w);
    assert_ne!(w.buildings[bulb].net, w.buildings[heart].net, "réseau coupé");
    let (a, b) = (net_of(&w, heart).seve, net_of(&w, bulb).seve);
    assert!(b > 0, "le morceau du bulbe garde une part");
    assert_eq!(a + b, total, "partage sans perte");
}

#[test]
fn brood_pays_units_from_the_network() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    let brood = [(4, 0), (-4, 0), (0, 4), (0, -4)].iter().find_map(|&(dx, dy)| place_building(&mut w, 0, B_BROOD, hx + dx, hy + dy, 0)).expect("couveuse");
    complete_building(&mut w, brood);
    steps(&mut w, 6);
    let r = w.building_ref(brood) as i32;
    let before = net_of(&w, heart).seve;
    order(&mut w, 0, O_FACTORY_QUEUE, &[r, U_GNAWER as i32, 2]);
    steps(&mut w, 400);
    let n = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_GNAWER && w.units.owner[s] == 0).count();
    assert_eq!(n, 2, "deux rongeurs");
    assert!(net_of(&w, heart).seve < before, "payés par le réseau");
}

#[test]
fn matrix_researches_with_adn_and_digestion_feeds_it() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    let m = [(4, 0), (-3, 0), (0, 4), (0, -3)].iter().find_map(|&(dx, dy)| place_building(&mut w, 0, B_MATRIX, hx + dx, hy + dy, 0)).expect("matrice");
    complete_building(&mut w, m);
    // un ennemi meurt sur le terreau : digéré, il donne de l'ADN
    let (cx, cy) = w.buildings[heart].center();
    let foe = w.spawn_unit(U_LIGHT_TANK, 1, cx + 3 * TILE, cy + 5 * TILE);
    let fs = w.unit(foe).unwrap();
    crate::combat::damage_unit(&mut w, fs, 100_000, 0);
    w.step(&[]);
    assert!(w.players[0].stock[ADN as usize] >= 2, "digestion : {}", w.players[0].stock[ADN as usize]);
    // recherche : l'ADN puis la sève convertie
    order(&mut w, 0, O_RESEARCH, &[T_S_SPITTERS as i32]);
    steps(&mut w, 2500);
    assert!(w.players[0].has_tech(T_S_SPITTERS), "recherche faite ({} / {})", w.players[0].tech_progress[T_S_SPITTERS as usize], TECHS[T_S_SPITTERS as usize].count);
    assert!(w.players[0].consumed[ADN as usize] >= 10);
}

#[test]
fn organisms_regenerate_on_terreau() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let q = w.unit(w.players[0].commander).unwrap();
    w.units.hp[q] = 5000;
    steps(&mut w, 100);
    assert!(w.units.hp[q] > 5000, "la Reine guérit sur le terreau");
    // le feu fait 50 % de plus aux organismes
    assert_eq!(crate::races::family_mult(41, true), 1500);
    assert_eq!(crate::races::family_mult(41, false), 1000);
}

// ---------- Transhumants ----------

/// Transhumant (joueur 0) avec un gisement de fer tout près d'un chenillard foreuse.
fn nomads() -> (World, usize, usize) {
    let mut w = game(RACE_TRANSH, RACE_INDUS);
    let s = find_unit(&w, 0, U_CH_DRILL).unwrap();
    let (tx, ty) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
    flatten(&mut w, tx - 6, ty - 6, tx + 8, ty + 8);
    let k = spot(&mut w, IRON_ORE, tx + 1, ty);
    (w, s, k)
}

#[test]
fn transhumants_start_with_their_chenillards() {
    let w = game(RACE_TRANSH, RACE_INDUS);
    for k in [U_CH_GENERATOR, U_CH_DRILL, U_CH_FURNACE, U_CH_HOLD, U_CH_ASSEMBLER, U_CH_WORKSHOP] {
        assert!(find_unit(&w, 0, k).is_some(), "chenillard {}", udef(k).key);
    }
    let g = find_unit(&w, 0, U_CH_GENERATOR).unwrap();
    assert_eq!(w.units.cold[g].pack_fuel, START_FUEL_UNITS * FUEL_HYDROCARBON);
    assert_eq!(w.players[0].stock[RELEVES as usize], 20);
}

#[test]
fn a_chenillard_deploys_on_a_deposit_and_folds_back() {
    let (mut w, s, k) = nomads();
    let id = w.unit_id(s) as i32;
    order(&mut w, 0, O_DEPLOY, &[1, id]);
    assert_eq!(w.units.cold[s].pack, crate::transhumants::PACK_DEPLOYING);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 2);
    assert!(w.unit(id as u32).is_none(), "le chenillard est devenu son module");
    let b = find_building(&w, 0, B_T_DRILL).expect("foreuse nomade");
    assert!(w.buildings[b].complete());
    assert_eq!(w.buildings[b].link, k as u32, "posée sur le gisement");
    assert_eq!(w.buildings[b].recipe, IRON_ORE);
    // repli : le module redevient un chenillard, immobile un moment
    let r = w.building_ref(b) as i32;
    order(&mut w, 0, O_PACK, &[1, r]);
    assert!(find_building(&w, 0, B_T_DRILL).is_none());
    let s2 = find_unit(&w, 0, U_CH_DRILL).expect("chenillard replié");
    assert_eq!(w.units.cold[s2].pack, crate::transhumants::PACK_FOLDING);
    let (x0, y0) = (w.units.x[s2], w.units.y[s2]);
    let id2 = w.unit_id(s2) as i32;
    order(&mut w, 0, O_MOVE, &[0, x0 + 20 * TILE, y0, 1, id2, x0 + 20 * TILE, y0]);
    steps(&mut w, 50);
    assert_eq!((w.units.x[s2], w.units.y[s2]), (x0, y0), "immobile pendant le repli");
    steps(&mut w, 400);
    assert!(w.units.x[s2] > x0 + 5 * TILE, "repart après le repli");
}

#[test]
fn a_moving_order_cancels_deployment() {
    let (mut w, s, _) = nomads();
    let id = w.unit_id(s) as i32;
    order(&mut w, 0, O_DEPLOY, &[1, id]);
    steps(&mut w, 50);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    order(&mut w, 0, O_MOVE, &[0, x + 10 * TILE, y, 1, id, x + 10 * TILE, y]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32);
    assert!(w.unit(id as u32).is_some());
    assert!(find_building(&w, 0, B_T_DRILL).is_none());
}

#[test]
fn deployed_generator_keeps_its_fuel_and_powers_the_drill() {
    let (mut w, s, k) = nomads();
    let g = find_unit(&w, 0, U_CH_GENERATOR).unwrap();
    let h = find_unit(&w, 0, U_CH_HOLD).unwrap();
    // le générateur à gauche de la foreuse, la soute (qui reçoit le minerai) à droite
    w.units.x[g] = w.units.x[s] - 3 * TILE;
    w.units.y[g] = w.units.y[s];
    // la soute collée à la foreuse, qui sera posée sur le gisement
    let sp = &w.map.spots[k];
    w.units.x[h] = (sp.x + 3) * TILE + TILE / 2;
    w.units.y[h] = (sp.y + 1) * TILE;
    let ids = [w.unit_id(s) as i32, w.unit_id(g) as i32, w.unit_id(h) as i32];
    order(&mut w, 0, O_DEPLOY, &[3, ids[0], ids[1], ids[2]]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 10);
    let gb = find_building(&w, 0, B_T_GENERATOR).expect("générateur déployé");
    assert!(w.buildings[gb].fuel > 0);
    let d = find_building(&w, 0, B_T_DRILL).unwrap();
    steps(&mut w, 600);
    assert!(w.players[0].produced[IRON_ORE as usize] > 0, "la foreuse extrait");
    // usure : elle augmente quand la foreuse travaille
    let bb = &w.buildings[d];
    let hold = find_building(&w, 0, B_T_HOLD).map(|h| (w.buildings[h].x, w.buildings[h].y));
    assert!(w.wear[k] > 0, "usure du gisement : foreuse ({}, {}) lien {} travaille {} sortie {} soute {:?} stock {}", bb.x, bb.y, bb.link, bb.working, bb.out, hold, w.players[0].stock[IRON_ORE as usize]);
    assert!(crate::transhumants::drill_speed(&w, d) < 2000);
}

#[test]
fn hold_feeds_glued_crafters_from_the_reserve() {
    let (mut w, _, _) = nomads();
    let hold = find_unit(&w, 0, U_CH_HOLD).unwrap();
    let fur = find_unit(&w, 0, U_CH_FURNACE).unwrap();
    let gen = find_unit(&w, 0, U_CH_GENERATOR).unwrap();
    let (x, y) = (w.units.x[hold], w.units.y[hold]);
    flatten(&mut w, x / TILE - 8, y / TILE - 8, x / TILE + 8, y / TILE + 8);
    w.units.x[fur] = x + 2 * TILE;
    w.units.y[fur] = y;
    w.units.x[gen] = x;
    w.units.y[gen] = y + 3 * TILE;
    w.units.cold[fur].pack_recipe = 0; // plaques de fer
    w.players[0].stock[IRON_ORE as usize] = 50;
    let ids: Vec<i32> = [hold, fur, gen].iter().map(|&s| w.unit_id(s) as i32).collect();
    order(&mut w, 0, O_DEPLOY, &[3, ids[0], ids[1], ids[2]]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 400);
    assert!(find_building(&w, 0, B_T_HOLD).is_some() && find_building(&w, 0, B_T_FURNACE).is_some());
    assert!(w.players[0].stock[IRON_ORE as usize] < 50, "la soute nourrit la fonderie");
    assert!(w.players[0].produced[IRON_PLATE as usize] > 0, "plaques fondues");
}

#[test]
fn exploration_and_labs_give_releves() {
    let mut w = game(RACE_TRANSH, RACE_INDUS);
    let ark = w.unit(w.players[0].commander).unwrap();
    let start = w.players[0].stock[RELEVES as usize];
    let (x, y) = (w.units.x[ark], w.units.y[ark]);
    let tx = if x > 256 * TILE { x - 60 * TILE } else { x + 60 * TILE };
    let id = w.unit_id(ark) as i32;
    order(&mut w, 0, O_MOVE, &[0, tx, y, 1, id, tx, y]);
    steps(&mut w, 600);
    assert!(w.players[0].stock[RELEVES as usize] > start + 10, "relevés : {start} → {}", w.players[0].stock[RELEVES as usize]);
    // un Industriel n'en gagne pas
    assert_eq!(w.players[1].stock[RELEVES as usize], 0);
}
