//! Tests des races : socle commun (race du joueur, droits par race, sauvegarde), Souche (réseau de
//! racines, croissance, couveuse, Matrice, digestion) et Transhumants (déploiement, repli, relevés,
//! usure des gisements).

use crate::buildings::{complete_building, place_building, remove_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::orders::{O_BUILD, O_DEPLOY, O_DEPLOY_AT, O_FACTORY_QUEUE, O_MOVE, O_PACK, O_PLANT_POLE, O_RESEARCH, O_RESEARCH_QUEUE, O_TAME};
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
    // le terreau de départ est petit (deux cases autour de la graine-mère) : une place à son bord
    let spots = [(3, 0), (3, 1), (-2, 0), (-2, 1), (0, 3), (1, 3), (0, -2), (1, -2), (3, 3), (-2, -2), (3, -2), (-2, 3)];
    let leaves = spots.iter().find_map(|&(dx, dy)| place_building(&mut w, 0, B_LEAVES, hx + dx, hy + dy, 0)).expect("frondaison sur le terreau");
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
    flatten(&mut w, hx - 30, hy - 4, hx, hy + 6);
    // une file continue plantée d'un coup (glisser-déposer), au-delà du terreau actuel
    let roots: Vec<usize> = (0..18).map(|k| place_building(&mut w, 0, B_ROOT, hx - 1 - k, hy + 1, 2).expect("racine sur le terreau à venir")).collect();
    assert!(place_building(&mut w, 0, B_ROOT, hx - 40, hy + 1, 0).is_none(), "loin de tout : refusée");
    steps(&mut w, 1200);
    for &r in &roots {
        assert!(w.buildings[r].complete(), "chaque racine pousse à son tour");
        assert_eq!(w.buildings[r].net, w.buildings[heart].net);
    }
}

#[test]
fn roots_link_only_by_contact() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    flatten(&mut w, hx - 12, hy - 4, hx, hy + 6);
    let put = |w: &mut World, x: i32, y: i32| {
        let b = place_building(w, 0, B_ROOT, x, y, 0).expect("racine sur le terreau");
        complete_building(w, b);
        b
    };
    // collée à la graine-mère par un côté : posée, même réseau
    let a = put(&mut w, hx - 1, hy + 1);
    // sur le terreau mais sans contact (à deux cases de `a`) : refusée, pas de réseau isolé
    assert!(place_building(&mut w, 0, B_ROOT, hx - 3, hy + 1, 0).is_none(), "racine sans contact");
    // en diagonale de `a` (un coin seulement) : refusée aussi
    assert!(place_building(&mut w, 0, B_ROOT, hx - 2, hy + 2, 0).is_none(), "racine en diagonale");
    // la case qui manque, puis la suivante : le câble avance d'une case à la fois
    let d = put(&mut w, hx - 2, hy + 1);
    let b = put(&mut w, hx - 3, hy + 1);
    // une racine encore en croissance compte : on peut s'y coller
    let g = place_building(&mut w, 0, B_ROOT, hx - 4, hy + 1, 0).expect("racine collée à la précédente");
    assert!(!w.buildings[g].complete());
    assert!(place_building(&mut w, 0, B_ROOT, hx - 5, hy + 1, 0).is_some(), "collée à une racine en croissance");
    crate::buildings::rebuild_power(&mut w);
    for r in [a, d, b] {
        assert_eq!(w.buildings[r].net, w.buildings[heart].net);
    }
    // une file tracée doit partir du réseau : détachée, elle est refusée en entier ; collée, acceptée
    let line = |x0: i32| (0..4).map(|k| (x0 - k, hy - 3, 0u8)).collect::<Vec<_>>();
    assert!(crate::buildings::can_place_line(&w, 0, B_ROOT, &line(hx - 1)).iter().all(|&ok| !ok), "file détachée");
    let col: Vec<(i32, i32, u8)> = (0..4).map(|k| (hx - 1, hy + 2 + k, 0u8)).collect();
    assert!(crate::buildings::can_place_line(&w, 0, B_ROOT, &col).iter().all(|&ok| ok), "file collée à `a`");
}

#[test]
fn a_cut_root_splits_the_network_and_its_reserve() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    flatten(&mut w, hx - 30, hy - 4, hx, hy + 6);
    // une file continue de racines vers l'ouest, puis un bulbe au bout
    let mut roots = Vec::new();
    let mut x = hx - 1;
    while x > hx - 16 {
        let b = place_building(&mut w, 0, B_ROOT, x, hy + 1, 2).expect("racine sur le terreau");
        complete_building(&mut w, b);
        roots.push(b);
        x -= 1;
        crate::buildings::rebuild_power(&mut w);
    }
    let bulb = place_building(&mut w, 0, B_BULB, x - 1, hy + 1, 0).expect("bulbe au bout");
    complete_building(&mut w, bulb);
    crate::buildings::rebuild_power(&mut w);
    assert_eq!(w.buildings[bulb].net, w.buildings[heart].net, "un seul réseau");
    let total = net_of(&w, heart).seve;
    // une seule racine du milieu meurt : deux réseaux, la réserve partagée sans perte
    remove_building(&mut w, roots[7], false);
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
    // une entrée de file : une portée de six rongeurs, pondue en œufs qui éclosent (voir ponte_tests.rs)
    order(&mut w, 0, O_FACTORY_QUEUE, &[r, U_GNAWER as i32, 1]);
    steps(&mut w, 700);
    let n = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_GNAWER && w.units.owner[s] == 0).count();
    assert_eq!(n, 6, "une portée de six rongeurs");
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
    let foe = w.spawn_unit(U_LIGHT_TANK, 1, cx + 3 * TILE, cy + 3 * TILE);
    let fs = w.unit(foe).unwrap();
    crate::combat::damage_unit(&mut w, fs, 100_000, 0);
    w.step(&[]);
    assert!(w.players[0].purse[ADN as usize] >= 2, "digestion : {}", w.players[0].purse[ADN as usize]);
    // recherche : l'ADN puis la sève convertie
    order(&mut w, 0, O_RESEARCH, &[T_S_SPITTERS as i32]);
    steps(&mut w, 2500);
    assert!(w.players[0].has_tech(T_S_SPITTERS), "recherche faite ({} / {})", w.players[0].tech_progress[T_S_SPITTERS as usize], TECHS[T_S_SPITTERS as usize].count);
    assert!(w.players[0].consumed[ADN as usize] >= 10);
}

#[test]
fn organisms_regenerate_on_terreau() {
    let mut w = game(RACE_SOUCHE, RACE_INDUS);
    let heart = find_building(&w, 0, B_SEED_HEART).unwrap();
    let (cx, cy) = w.buildings[heart].center();
    let g = w.spawn_unit(U_GNAWER, 0, cx, cy + 5 * TILE / 2);
    let s = w.unit(g).unwrap();
    w.units.hp[s] = 100;
    steps(&mut w, 100);
    let s = w.unit(g).unwrap();
    assert!(w.units.hp[s] > 100, "un organisme guérit sur le terreau");
    // le feu fait 50 % de plus aux organismes
    assert_eq!(crate::races::family_mult(41, true), 1500);
    assert_eq!(crate::races::family_mult(41, false), 1000);
}

// ---------- Apprivoisement de la faune ----------

/// Souche (joueur 0) contre les Industriels, faune normale, et un nid de mordeurs sauvage (3 bêtes) posé
/// à une douzaine de cases de la Reine. Renvoie le monde, la Reine et la référence du nid.
fn with_wild_nest() -> (World, usize, u32) {
    let mut p = params(RACE_SOUCHE, RACE_INDUS);
    p[12] = crate::nature::FAUNA_NORMAL as i32;
    let mut w = World::new(&p);
    w.place_start_buildings();
    let q = w.unit(w.players[0].commander).unwrap();
    let (qx, qy) = (w.units.x[q] / TILE, w.units.y[q] / TILE);
    flatten(&mut w, qx - 4, qy - 4, qx + 26, qy + 8);
    let i = crate::nature::found_nest(&mut w, qx + 14, qy - 1).expect("nid");
    for _ in 0..3 {
        crate::nature::spawn_beast(&mut w, i, U_BEAST_S);
    }
    let r = w.nature.nests[i].b;
    (w, q, r)
}

#[test]
fn the_queen_tames_a_wild_nest_and_its_horde() {
    let (mut w, q, nest) = with_wild_nest();
    let qid = w.unit_id(q) as i32;
    let b = w.building(nest).unwrap();
    // seule la Reine apprivoise, et seulement un nid sauvage
    assert!(crate::souche::tameable(&w, 0, nest));
    assert!(!crate::souche::tameable(&w, 1, nest), "pas un joueur de la Souche");
    // une escorte de rongeurs postée près du nid : elle épargne le nid et sa horde calmée
    let (cx, cy) = w.buildings[b].center();
    for k in 0..3 {
        w.spawn_unit(U_GNAWER, 0, cx - 7 * TILE, cy + (k - 1) * TILE);
    }
    order(&mut w, 0, O_TAME, &[0, nest as i32, 1, qid]);
    // elle s'approche, puis reste 30 s ; la horde calmée ne la mord pas
    let mut started = false;
    for _ in 0..1200 {
        w.step(&[]);
        if let Some(i) = crate::nature::wild_nest(&w, nest) {
            started |= w.nature.nests[i].tame > 0;
        } else {
            break;
        }
    }
    assert!(started, "l'apprivoisement a avancé");
    assert!(crate::nature::wild_nest(&w, nest).is_none(), "le nid n'est plus sauvage");
    assert_eq!(w.buildings[b].owner, 0, "le nid est à la Souche");
    assert_eq!(crate::nature::dens_of(&w, 0), 1);
    assert!(w.units.hp[q] > 9500, "la horde calmée a épargné la Reine : {}", w.units.hp[q]);
    let beasts = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0 && crate::souche::is_beast(w.units.kind[s])).count();
    assert!(beasts >= 3, "la horde suit son nid : {beasts}");
    assert!(w.units.cold[q].orders.is_empty(), "l'ordre est terminé");
    // le nid greffé pond pour son maître, sans coût : une portée d'œufs de mordeurs, qui éclosent
    steps(&mut w, crate::nature::DEN_PERIOD + 40);
    let eggs: Vec<usize> = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0 && crate::ponte::is_egg(w.units.kind[s])).collect();
    assert_eq!(eggs.len(), crate::nature::DEN_LITTER, "portée du nid greffé");
    assert!(eggs.iter().all(|&s| crate::ponte::content(&w, s).is_some_and(crate::souche::is_beast)), "des œufs de mordeurs");
    assert!(eggs.iter().all(|&s| w.units.cold[s].orders.is_empty()), "pas de ralliement : les bêtes resteront au nid");
    let den = w.nature.dens[0].brood.len();
    steps(&mut w, crate::ponte::INCUBATION + 5);
    let after = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0 && crate::souche::is_beast(w.units.kind[s])).count();
    assert_eq!(after, beasts + crate::nature::DEN_LITTER, "éclosion au nid greffé : {beasts} → {after}");
    assert_eq!(w.nature.dens[0].brood.len(), den, "les bêtes nées restent comptées dans la portée du nid");
    assert!(w.nature.dens[0].brood.iter().all(|&id| w.unit(id).is_some_and(|s| crate::souche::is_beast(w.units.kind[s]))));
    // sauvegarde : le nid greffé et ses bêtes survivent
    let snap = crate::save::snapshot(&w);
    let mut r = crate::save::restore(&snap).expect("restauration");
    assert_eq!(r.hash(), w.hash());
    assert_eq!(r.nature.dens.len(), 1);
    for _ in 0..200 {
        assert_eq!(r.step(&[]), w.step(&[]));
    }
}

#[test]
fn taming_needs_room_and_a_calm_hand() {
    let (mut w, q, nest) = with_wild_nest();
    let qid = w.unit_id(q) as i32;
    // limite : un nid greffé par stade d'évolution (1 + mutations) ; un faux nid greffé occupe la place
    w.nature.dens.push(crate::nature::Den { b: NONE, owner: 0, spawn: 1_000_000, brood: Vec::new() });
    assert_eq!(crate::souche::den_limit(&w, 0), 1);
    assert!(!crate::souche::den_room(&w, 0));
    order(&mut w, 0, O_TAME, &[0, nest as i32, 1, qid]);
    // (le faux nid disparaît à sa première mise à jour : on le remet à chaque pas)
    for _ in 0..900 {
        if crate::nature::dens_of(&w, 0) == 0 {
            w.nature.dens.push(crate::nature::Den { b: NONE, owner: 0, spawn: 1_000_000, brood: Vec::new() });
        }
        w.step(&[]);
    }
    let i = crate::nature::wild_nest(&w, nest).expect("toujours sauvage");
    assert_eq!(w.nature.nests[i].tame, 0, "pas de place : rien n'avance");
    // une mutation acquise ouvre une place de plus
    w.players[0].set_tech(T_S_SCALES);
    assert_eq!(crate::souche::den_limit(&w, 0), 2);
    steps(&mut w, 200);
    let i = crate::nature::wild_nest(&w, nest).expect("encore sauvage");
    let t = w.nature.nests[i].tame;
    assert!(t > 0, "l'apprivoisement avance");
    // frapper le nid qu'on apprivoise : l'avancement repart de zéro
    let (cx, cy) = w.buildings[w.building(nest).unwrap()].center();
    crate::nature::on_hit(&mut w, cx, cy, nest, 0);
    assert_eq!(w.nature.nests[i].tame, 0);
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
    assert_eq!(w.players[0].purse[RELEVES as usize], 20);
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
    assert!(w.wear[k] > 0, "usure du gisement : foreuse ({}, {}) lien {} travaille {} sortie {} soute {:?} stock {}", bb.x, bb.y, bb.link, bb.working, bb.out, hold, w.stock(0, IRON_ORE));
    assert!(crate::transhumants::drill_speed(&w, d) < 2000);
}

#[test]
fn hold_feeds_glued_crafters_from_its_stock() {
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
    // minerai dans le stock de la soute repliée (il devient le stock du dépôt au déploiement)
    crate::drones::put(&mut w.units.cold[hold].hold, IRON_ORE, 50);
    let ids: Vec<i32> = [hold, fur, gen].iter().map(|&s| w.unit_id(s) as i32).collect();
    order(&mut w, 0, O_DEPLOY, &[3, ids[0], ids[1], ids[2]]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 400);
    assert!(find_building(&w, 0, B_T_HOLD).is_some() && find_building(&w, 0, B_T_FURNACE).is_some());
    assert!(w.stock(0, IRON_ORE) < 50, "la soute nourrit la fonderie");
    assert!(w.players[0].produced[IRON_PLATE as usize] > 0, "plaques fondues");
}

#[test]
fn exploration_and_labs_give_releves() {
    let mut w = game(RACE_TRANSH, RACE_INDUS);
    let ark = w.unit(w.players[0].commander).unwrap();
    let start = w.players[0].purse[RELEVES as usize];
    let (x, y) = (w.units.x[ark], w.units.y[ark]);
    let tx = if x > 256 * TILE { x - 60 * TILE } else { x + 60 * TILE };
    let id = w.unit_id(ark) as i32;
    order(&mut w, 0, O_MOVE, &[0, tx, y, 1, id, tx, y]);
    steps(&mut w, 600);
    assert!(w.players[0].purse[RELEVES as usize] > start + 10, "relevés : {start} → {}", w.players[0].purse[RELEVES as usize]);
    // un Industriel n'en gagne pas
    assert_eq!(w.players[1].purse[RELEVES as usize], 0);
}

/// Transhumants : le stock de départ est à bord de la soute repliée, et devient le stock de la soute
/// déployée. Une sauvegarde de version 3 (races, réserve commune) : la réserve va dans la soute, les
/// relevés restent dans la bourse.
#[test]
fn transhumant_start_stock_rides_in_the_hold_and_v3_reserve_converts() {
    let mut w = game(RACE_TRANSH, RACE_INDUS);
    let h = find_unit(&w, 0, U_CH_HOLD).unwrap();
    assert_eq!(crate::drones::has(&w.units.cold[h].hold, IRON_PLATE), 300, "stock de départ à bord");
    assert_eq!(w.stock(0, IRON_PLATE), 300);
    // état d'une version 3 : la réserve dans la bourse, soute repliée vide
    w.units.cold[h].hold.clear();
    w.players[0].purse[IRON_PLATE as usize] = 123;
    let bytes = crate::save::write(&w, 3, &[]);
    let a = crate::save::restore(&bytes).expect("sauvegarde de version 3 lue");
    let h = find_unit(&a, 0, U_CH_HOLD).unwrap();
    assert_eq!(crate::drones::has(&a.units.cold[h].hold, IRON_PLATE), 123, "réserve convertie dans la soute");
    assert_eq!(a.players[0].purse[IRON_PLATE as usize], 0);
    assert_eq!(a.players[0].purse[RELEVES as usize], 20, "les relevés restent dans la bourse");
}

#[test]
fn a_drill_sent_to_a_deposit_rolls_there_and_deploys_on_it() {
    let mut w = game(RACE_TRANSH, RACE_INDUS);
    let s = find_unit(&w, 0, U_CH_DRILL).unwrap();
    let (tx, ty) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
    flatten(&mut w, tx - 4, ty - 4, tx + 20, ty + 6);
    let k = spot(&mut w, COPPER_ORE, tx + 14, ty);
    // clic droit sur le gisement : point au centre du gisement (2 × 2 cases)
    let (gx, gy) = ((tx + 15) * TILE, (ty + 1) * TILE);
    let id = w.unit_id(s) as i32;
    order(&mut w, 0, O_DEPLOY_AT, &[0, gx, gy, 1, id]);
    steps(&mut w, 400);
    assert_eq!(w.units.cold[s].pack, crate::transhumants::PACK_DEPLOYING, "arrivé, il se déploie");
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 5);
    let b = find_building(&w, 0, B_T_DRILL).expect("foreuse déployée");
    assert_eq!(w.buildings[b].link, k as u32, "sur le gisement visé");
    assert_eq!(w.buildings[b].recipe, COPPER_ORE);
}

#[test]
fn deployed_modules_face_their_links() {
    let (mut w, s, _k) = nomads();
    // foreuse sur le gisement, fonderie collée à sa gauche (ouest), atelier collé au nord de la fonderie
    let f = find_unit(&w, 0, U_CH_FURNACE).unwrap();
    let a = find_unit(&w, 0, U_CH_WORKSHOP).unwrap();
    let sp = w.map.spots[_k].clone();
    // fonderie (2 × 2) en (sp.x - 2, sp.y) ; atelier (3 × 3) en (sp.x - 3, sp.y - 3)
    w.units.x[f] = (sp.x - 1) * TILE + TILE / 2;
    w.units.y[f] = (sp.y + 1) * TILE + TILE / 2;
    w.units.x[a] = (sp.x - 2) * TILE + TILE / 2;
    w.units.y[a] = (sp.y - 2) * TILE + TILE / 2;
    let ids = [w.unit_id(s) as i32, w.unit_id(f) as i32, w.unit_id(a) as i32];
    order(&mut w, 0, O_DEPLOY, &[3, ids[0], ids[1], ids[2]]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 5);
    let d = find_building(&w, 0, B_T_DRILL).expect("foreuse");
    let fu = find_building(&w, 0, B_T_FURNACE).expect("fonderie");
    let at = find_building(&w, 0, B_T_WORKSHOP).expect("atelier");
    let (dd, fb, ab) = (&w.buildings[d], &w.buildings[fu], &w.buildings[at]);
    // la face avant de la foreuse donne sur la fonderie
    let (bw, bh) = dd.size();
    let (fx, fy) = crate::buildings::front_tile(dd.x, dd.y, bw, bh, dd.dir);
    let (fw, fh) = fb.size();
    assert!(fx >= fb.x && fx < fb.x + fw && fy >= fb.y && fy < fb.y + fh, "foreuse ({}, {}) sens {} vers la fonderie ({}, {})", dd.x, dd.y, dd.dir, fb.x, fb.y);
    // la sortie de l'atelier est dégagée
    let (aw, ah) = ab.size();
    for k in 0..crate::buildings::front_count(aw, ah, ab.dir) {
        let (x, y) = crate::buildings::front_tile_k(ab.x, ab.y, aw, ah, ab.dir, k);
        assert_eq!(w.map.occ[w.map.idx(x, y)], 0, "sortie de l'atelier libre (sens {})", ab.dir);
    }
}

#[test]
fn a_deploying_chenillard_settles_on_its_module_spot_and_direction() {
    let (mut w, s, k) = nomads();
    // décalé d'une case et tourné de travers : il doit rejoindre le centre de l'emplacement et le sens prévus
    w.units.x[s] += TILE / 2;
    w.units.facing[s] = 5000;
    let id = w.unit_id(s) as i32;
    order(&mut w, 0, O_DEPLOY, &[1, id]);
    let (work, timer) = (w.units.cold[s].work, w.units.cold[s].timer);
    assert!(work != 0 && timer != 0, "plan du déploiement");
    let (bx, by) = ((work & 0xffff) as i32 - 1, (work >> 16) as i32);
    let dir = (timer - 1) as u8;
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 - 2);
    assert_eq!((w.units.x[s], w.units.y[s]), (bx * TILE + TILE, by * TILE + TILE), "centré sur l'emplacement");
    assert_eq!(w.units.facing[s], crate::buildings::bb_dir_angle(dir) as u16, "tourné vers le sens du module");
    steps(&mut w, 5);
    let b = find_building(&w, 0, B_T_DRILL).expect("foreuse");
    assert_eq!((w.buildings[b].x, w.buildings[b].y), (bx, by));
    assert_eq!(w.buildings[b].dir, dir, "sens du plan (rien de collé ne le change)");
    assert_eq!(w.buildings[b].link, k as u32);
}

#[test]
fn a_module_placed_by_the_player_keeps_its_spot_and_angle() {
    let (mut w, _s, _k) = nomads();
    let a = find_unit(&w, 0, U_CH_ASSEMBLER).unwrap();
    let (tx, ty) = (w.units.x[a] / TILE, w.units.y[a] / TILE);
    flatten(&mut w, tx - 8, ty - 8, tx + 8, ty + 8);
    // placement choisi : module 2 × 2 en (tx + 3, ty - 2), sens 3 (face avant vers le nord)
    let (bx, by) = (tx + 3, ty - 2);
    let id = w.unit_id(a) as i32;
    order(&mut w, 0, O_DEPLOY_AT, &[(3 + 1) << 2, (bx + 1) * TILE, (by + 1) * TILE, 1, id]);
    steps(&mut w, 200 + crate::transhumants::DEPLOY_TICKS as u32);
    let b = find_building(&w, 0, B_T_ASSEMBLER).expect("assembleur déployé");
    assert_eq!((w.buildings[b].x, w.buildings[b].y, w.buildings[b].dir), (bx, by, 3));
    // un voisin qui arrive ne le fait pas tourner
    let h = find_unit(&w, 0, U_CH_HOLD).unwrap();
    let hid = w.unit_id(h) as i32;
    order(&mut w, 0, O_DEPLOY_AT, &[0, (bx + 3) * TILE, (by + 1) * TILE, 1, hid]);
    steps(&mut w, 300 + crate::transhumants::DEPLOY_TICKS as u32);
    assert!(find_building(&w, 0, B_T_HOLD).is_some(), "soute collée");
    assert_eq!(w.buildings[b].dir, 3, "sens choisi gardé");
}

#[test]
fn a_drill_feeds_its_neighbours_on_every_side() {
    let (mut w, s, k) = nomads();
    let sp = w.map.spots[k].clone();
    let f = find_unit(&w, 0, U_CH_FURNACE).unwrap();
    let f2 = find_unit(&w, 0, U_CH_HOLD).unwrap();
    let g = find_unit(&w, 0, U_CH_GENERATOR).unwrap();
    // fonderie à l'ouest de la foreuse, soute à l'est, générateur au nord
    let place = |w: &mut World, u: usize, cx: i32, cy: i32, flags: i32| {
        let id = w.unit_id(u) as i32;
        order(w, 0, O_DEPLOY_AT, &[flags, cx * TILE, cy * TILE, 1, id]);
    };
    place(&mut w, s, sp.x + 1, sp.y + 1, 1 << 2);
    place(&mut w, f, sp.x - 1, sp.y + 1, 1 << 2);
    place(&mut w, f2, sp.x + 3, sp.y + 1, 1 << 2);
    place(&mut w, g, sp.x + 1, sp.y - 1, 1 << 2);
    steps(&mut w, 300 + crate::transhumants::DEPLOY_TICKS as u32);
    let d = find_building(&w, 0, B_T_DRILL).expect("foreuse");
    let fu = find_building(&w, 0, B_T_FURNACE).expect("fonderie");
    let ho = find_building(&w, 0, B_T_HOLD).expect("soute");
    assert_eq!(w.buildings[d].dir, 0, "foreuse tournée vers l'est (soute)");
    steps(&mut w, 1500);
    // la fonderie (derrière la foreuse) reçoit aussi du minerai, pas seulement la soute (devant)
    assert!(w.buildings[fu].recipe != RECIPE_NONE && w.players[0].produced[IRON_PLATE as usize] > 0, "la fonderie, à l'arrière, est servie");
    let in_hold = crate::drones::has(&w.buildings[ho].stash, IRON_ORE);
    assert!(in_hold > 0, "la soute, devant, est servie");
}

// ---------- Poteaux relais du générateur nomade ----------

/// Générateur nomade déployé sur un terrain plat qui s'étend vers le centre de la carte ; renvoie aussi le
/// sens de ce terrain (+1 vers l'est, -1 vers l'ouest).
fn camp() -> (World, usize, i32) {
    let mut w = game(RACE_TRANSH, RACE_INDUS);
    let g = find_unit(&w, 0, U_CH_GENERATOR).unwrap();
    let (tx, ty) = (w.units.x[g] / TILE, w.units.y[g] / TILE);
    let sx = if tx < w.map.w / 2 { 1 } else { -1 };
    flatten(&mut w, (tx - 8).min(tx + sx * 45), ty - 12, (tx + 8).max(tx + sx * 45), ty + 12);
    let id = w.unit_id(g) as i32;
    order(&mut w, 0, O_DEPLOY, &[1, id]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 5);
    let gb = find_building(&w, 0, B_T_GENERATOR).expect("générateur déployé");
    (w, gb, sx)
}

fn poles(w: &World) -> usize {
    (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].kind == B_T_POLE).count()
}

#[test]
fn poles_extend_the_generator_zone_from_pole_to_pole() {
    let (mut w, g, sx) = camp();
    let (gx, gy) = (w.buildings[g].x, w.buildings[g].y);
    // un laboratoire hors de la zone du générateur (9 cases autour de son emprise)
    let lab = place_building(&mut w, 0, B_T_LAB, gx + sx * 22, gy, 0).expect("laboratoire");
    complete_building(&mut w, lab);
    steps(&mut w, 2);
    assert_ne!(w.buildings[lab].net, w.buildings[g].net, "hors zone sans poteau");
    let r = w.building_ref(g) as i32;
    // trop loin du générateur : refusé
    order(&mut w, 0, O_PLANT_POLE, &[r, gx + sx * 24, gy]);
    assert_eq!(poles(&w), 0, "poteau hors de portée refusé");
    // un poteau à portée du générateur, puis un second à portée du premier : la zone s'étend jusqu'au laboratoire
    order(&mut w, 0, O_PLANT_POLE, &[r, gx + sx * 12, gy]);
    order(&mut w, 0, O_PLANT_POLE, &[r, gx + sx * 24, gy]);
    assert_eq!(poles(&w), 2);
    steps(&mut w, 2);
    let net = w.buildings[g].net;
    assert!(net != 0);
    for p in crate::transhumants::poles_of(&w, g) {
        assert_eq!(w.buildings[p].net, net, "poteau relié au générateur");
        assert!(w.buildings[p].complete(), "planté tout de suite");
    }
    assert_eq!(w.buildings[lab].net, net, "le laboratoire est dans la zone étendue");
    assert!(w.nets[net as usize].prod > 0);
    // pas de poteau par un chantier (ordre de construction) : ils viennent du générateur
    let ark = (0..w.units.alive.len()).find(|&s| w.units.alive[s] && w.units.owner[s] == 0 && udef(w.units.kind[s]).build_power > 0).expect("constructeur");
    let id = w.unit_id(ark) as i32;
    order(&mut w, 0, O_BUILD, &[0, B_T_POLE as i32, gx + sx * 4, gy - 4, 0, 1, id]);
    steps(&mut w, 200);
    assert_eq!(poles(&w), 2, "ordre de construction d'un poteau refusé");
}

#[test]
fn a_generator_plants_ten_poles_at_most_and_takes_them_back_when_it_folds() {
    let (mut w, g, _) = camp();
    let (gx, gy) = (w.buildings[g].x, w.buildings[g].y);
    let r = w.building_ref(g) as i32;
    let spots: Vec<(i32, i32)> = [-4, -2, 0, 2, 4, 6].iter().flat_map(|&dx| [(gx + dx, gy - 4), (gx + dx, gy + 5)]).collect();
    for &(x, y) in &spots {
        order(&mut w, 0, O_PLANT_POLE, &[r, x, y]);
    }
    assert_eq!(poles(&w), crate::transhumants::POLES_PER_GEN, "une dizaine de poteaux par générateur");
    assert_eq!(crate::transhumants::poles_of(&w, g).len(), crate::transhumants::POLES_PER_GEN);
    // un poteau détruit libère sa place
    let p = crate::transhumants::poles_of(&w, g)[3];
    remove_building(&mut w, p, true);
    let (x, y) = spots[11];
    order(&mut w, 0, O_PLANT_POLE, &[r, x, y]);
    assert_eq!(poles(&w), crate::transhumants::POLES_PER_GEN);
    // sauvegarde : les poteaux gardent leur générateur
    let w2 = crate::save::restore(&crate::save::snapshot(&w)).expect("restauration");
    assert_eq!(w2.hash(), w.hash());
    assert_eq!(crate::transhumants::poles_of(&w2, g).len(), crate::transhumants::POLES_PER_GEN);
    // repli : le générateur rembarque ses poteaux
    order(&mut w, 0, O_PACK, &[1, r]);
    assert!(find_building(&w, 0, B_T_GENERATOR).is_none());
    assert_eq!(poles(&w), 0, "poteaux rembarqués au repli");
    steps(&mut w, 2);
    // un autre joueur ne plante pas avec notre générateur
    let (mut w, g, _) = camp();
    let r = w.building_ref(g) as i32;
    let (gx, gy) = (w.buildings[g].x, w.buildings[g].y);
    order(&mut w, 1, O_PLANT_POLE, &[r, gx, gy - 4]);
    assert_eq!(poles(&w), 0);
}

// ---------- Butin ----------

fn kill_unit_by(w: &mut World, s: usize, killer: usize) {
    w.units.cold[s].last_hit = w.unit_id(killer);
    w.units.hp[s] = 0;
    w.dead_units.push(s as u32);
    steps(w, 1);
}

#[test]
fn transhumants_loot_a_quarter_of_what_they_destroy() {
    let mut w = game(RACE_TRANSH, RACE_INDUS);
    let ark = find_unit(&w, 0, U_ARK).unwrap();
    let (ax, ay) = (w.units.x[ark], w.units.y[ark]);
    let (tx, ty) = (ax / TILE, ay / TILE);
    flatten(&mut w, tx - 30, ty - 6, tx + 30, ty + 6);
    let items = [STEEL, GEAR, CIRCUIT, IRON_PLATE];
    let stock = |w: &World, p: usize| items.map(|it| w.stock(p, it));
    // char léger ennemi (3 acier, 3 engrenages, 2 circuits) achevé par l'Arche : un quart, arrondi, de chaque
    let s0 = stock(&w, 0);
    let id = w.spawn_unit(U_LIGHT_TANK, 1, ax + 3 * TILE, ay);
    let s = w.unit(id).unwrap();
    kill_unit_by(&mut w, s, ark);
    let s1 = stock(&w, 0);
    assert_eq!([s1[0] - s0[0], s1[1] - s0[1], s1[2] - s0[2]], [1, 1, 1], "butin du char léger");
    // dépôt ennemi (8 fer) détruit près de l'Arche : 2 fer
    let d = place_building(&mut w, 1, B_DEPOT, tx + 4, ty + 2, 0).expect("dépôt ennemi");
    complete_building(&mut w, d);
    w.buildings[d].hp = 0;
    w.dead_buildings.push(d as u32);
    steps(&mut w, 1);
    let s2 = stock(&w, 0);
    assert_eq!(s2[3] - s1[3], 2, "butin du dépôt");
    // loin de tout Transhumant : rien
    let far = place_building(&mut w, 1, B_DEPOT, tx + 25, ty + 2, 0).expect("dépôt lointain");
    complete_building(&mut w, far);
    let far_d = crate::fixed::dist2(ax, ay, w.buildings[far].center().0, w.buildings[far].center().1);
    let nearest = (0..w.units.alive.len()).filter(|&u| w.units.alive[u] && w.units.owner[u] == 0).map(|u| crate::fixed::dist2(w.buildings[far].center().0, w.buildings[far].center().1, w.units.x[u], w.units.y[u])).min().unwrap();
    assert!(nearest > ((crate::transhumants::LOOT_RANGE * TILE) as i64).pow(2), "aucun Transhumant à portée ({far_d})");
    w.buildings[far].hp = 0;
    w.dead_buildings.push(far as u32);
    steps(&mut w, 1);
    assert_eq!(stock(&w, 0)[3], s2[3], "pas de butin sans pillard proche");
    // les Industriels ne pillent pas
    let p1 = stock(&w, 1);
    let tank = w.spawn_unit(U_LIGHT_TANK, 1, ax + 3 * TILE, ay);
    let tk = w.unit(tank).unwrap();
    let rider = w.spawn_unit(U_CH_FURNACE, 0, ax + 5 * TILE, ay);
    let rs = w.unit(rider).unwrap();
    kill_unit_by(&mut w, rs, tk);
    assert_eq!(stock(&w, 1), p1, "un Industriel ne prend pas de butin");
}
