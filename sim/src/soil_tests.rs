//! Tests du sol mangé par la Souche (soil.rs) : herbe, épuisement, terreau permanent, réseau, sauvegarde.

use crate::buildings::{complete_building, place_building, rebuild_power, remove_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::soil;
use crate::souche;
use crate::world::*;

/// Partie Souche (joueur 0) contre Souche (joueur 1), sans faune ni brouillard ; la Reine du joueur 0 est figée.
fn game(fog: i32) -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, fog, RACE_SOUCHE as i32, RACE_SOUCHE as i32]);
    w.place_start_buildings();
    for p in 0..2 {
        let q = w.unit(w.players[p].commander).unwrap();
        w.units.cold[q].stun = 60_000;
    }
    w
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

/// Graine-mère du joueur, sur un terrain plat et dégagé de `r` cases tout autour ; renvoie (indice, x, y).
fn base(w: &mut World, p: u8, r: i32) -> (usize, i32, i32) {
    let heart = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == p && w.buildings[b].kind == B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    let (x0, y0, x1, y1) = (hx - r, hy - r, hx + r + 3, hy + r + 3);
    w.map.spots.retain(|s| !(s.x >= x0 - 2 && s.x <= x1 && s.y >= y0 - 2 && s.y <= y1));
    for y in y0..y1 {
        for x in x0..x1 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            if w.map.occ[i] == 0 {
                w.map.update_pass(x, y);
            }
        }
    }
    w.wear.resize(w.map.spots.len(), 0);
    (heart, hx, hy)
}

fn put(w: &mut World, owner: u8, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, owner, kind, x, y, 0).unwrap_or_else(|| panic!("{} en ({x}, {y})", bdef(kind).key));
    complete_building(w, b);
    rebuild_power(w);
    b
}

/// Le terreau et les périmètres tenus à jour case par case sont ceux qu'on calculerait de zéro.
fn check_terreau(w: &mut World) {
    let (kept, eaters) = (w.terreau.clone(), w.eaters.clone());
    w.terreau.clear();
    soil::ensure(w);
    assert!(kept == w.terreau, "terreau tenu à jour différent du terreau recalculé");
    assert!(eaters == w.eaters, "périmètres tenus à jour différents des périmètres recalculés");
}

fn eaten(w: &World) -> usize {
    w.soil.iter().filter(|&&o| o != 0).count()
}

/// Repas d'une frondaison poussée du joueur.
fn meal_of(w: &World, b: usize) -> soil::Meal {
    let bb = &w.buildings[b];
    soil::meal(w, B_LEAVES, bb.owner, (bb.x, bb.y, 2, 2), (bb.ammo as i32, bb.ammo as i32 + soil::RING), 0)
}

#[test]
fn leaves_eat_the_edge_of_the_grass_and_turn_it_into_terreau() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 30);
    let l = put(&mut w, 0, B_LEAVES, hx + 4, hy);
    steps(&mut w, 40);
    let m = meal_of(&w, l);
    assert!(m.left >= 5 && m.share == 1000, "{} cases au bord, seule à les convoiter : {}", m.left, m.share);
    // la première case, la plus proche, prend de 10 à 20 s selon sa distance
    assert!((200..=400).contains(&m.ticks), "{} ticks", m.ticks);
    steps(&mut w, m.ticks + 60);
    assert_eq!(eaten(&w), 1);
    assert_eq!(w.soil_n, 1);
    let early = souche::organ_rate(&w, l).0;
    let made = w.players[0].produced[SEVE as usize];
    let before = eaten(&w);
    steps(&mut w, 6000);
    let n = eaten(&w) - before;
    assert!((15..=30).contains(&n), "une vingtaine de cases en 5 min : {n}");
    // c'est l'herbe mangée qui donne la sève : 20 par case (et une par seconde de la graine-mère)
    let got = (w.players[0].produced[SEVE as usize] - made) as i32 - 300;
    assert!((got - 20 * n as i32).abs() <= 40, "{got} sève pour {n} cases");
    for (i, &o) in w.soil.iter().enumerate() {
        if o != 0 {
            assert_eq!(o, 1);
            assert_eq!(w.terreau[i] & 1, 1, "la case mangée est du terreau");
            let (tx, ty) = (i as i32 % w.map.w, i as i32 / w.map.w);
            assert!((tx - hx - 5).abs() <= 6 && (ty - hy - 1).abs() <= 6, "au plus près d'abord : ({}, {})", tx - hx, ty - hy);
            // toujours au bord du terreau : pas d'îlot
            let near = [(1, 0), (-1, 0), (0, 1), (0, -1)].iter().any(|&(dx, dy)| w.terreau[w.map.idx(tx + dx, ty + dy)] & 1 != 0);
            assert!(near, "case isolée ({}, {})", tx - hx, ty - hy);
        }
    }
    // plus l'herbe est loin, plus elle met de temps
    assert!(souche::organ_rate(&w, l).0 < early, "{} puis {}", early, souche::organ_rate(&w, l).0);
    let bite = |d: i32| soil::bite_ticks(B_LEAVES, 4 * d * d);
    assert_eq!((bite(4), bite(10), bite(20)), (328, 1000, 3400));
    check_terreau(&mut w);
}

/// Portée illimitée : l'herbe proche finie, la frondaison va plus loin, de moins en moins vite ; sa production est
/// toujours celle de l'herbe qu'elle mange, sans plancher.
#[test]
fn leaves_reach_without_limit_but_eat_slower_and_slower() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 70);
    let l = put(&mut w, 0, B_LEAVES, hx + 4, hy);
    steps(&mut w, 40);
    let mut rates = vec![souche::organ_rate(&w, l).0];
    let mut dist = vec![w.buildings[l].ammo];
    // tout est mangé autour d'elle, de plus en plus loin
    for r in [8, 14, 22, 40] {
        for y in hy - r..hy + r + 3 {
            for x in hx - r + 4..hx + r + 7 {
                let i = w.map.idx(x, y);
                if w.terreau[i] == 0 {
                    soil::eat(&mut w, 0, i);
                }
            }
        }
        steps(&mut w, 80);
        rates.push(souche::organ_rate(&w, l).0);
        dist.push(w.buildings[l].ammo);
    }
    println!("rendement {rates:?}, distance {dist:?}");
    assert!(rates.windows(2).all(|k| k[1] <= k[0]) && rates[0] > 100 && rates[2] < 40, "{rates:?}");
    assert!(dist.windows(2).all(|k| k[1] > k[0]) && *dist.last().unwrap() >= 38, "{dist:?}");
    // elle mange encore : une case à 40 cases prend du temps, mais vient, et donne 20 sève comme les autres
    let (n, m) = (eaten(&w), meal_of(&w, l));
    let made = w.players[0].produced[SEVE as usize];
    steps(&mut w, 2 * m.ticks);
    let got = (w.players[0].produced[SEVE as usize] - made) as i32 - 2 * m.ticks as i32 / 20;
    let k = (eaten(&w) - n) as i32;
    assert!((1..=3).contains(&k), "{k} cases en {} ticks", 2 * m.ticks);
    assert!((38..=42).contains(&got), "{got} sève pour deux cases");
    check_terreau(&mut w);
}

/// Deux frondaisons qui convoitent la même herbe se gênent : elles ne produisent pas plus qu'une seule.
#[test]
fn two_leaves_on_the_same_grass_do_not_double_the_sap() {
    let seve = |spots: &[(i32, i32)]| {
        let mut w = game(0);
        let (_, hx, hy) = base(&mut w, 0, 40);
        let organs: Vec<usize> = spots.iter().map(|&(x, y)| put(&mut w, 0, B_LEAVES, hx + x, hy + y)).collect();
        let before = w.players[0].produced[SEVE as usize];
        steps(&mut w, 4000);
        check_terreau(&mut w);
        let shares: Vec<u32> = organs.iter().map(|&b| meal_of(&w, b).share).collect();
        ((w.players[0].produced[SEVE as usize] - before) as i32 - 200, eaten(&w) as i32, shares)
    };
    let (one, n1, _) = seve(&[(4, 0)]);
    let (two, n2, shares) = seve(&[(4, 0), (4, 2)]);
    let (apart, _, free) = seve(&[(4, 0), (-3, 0)]);
    println!("seule {one} ({n1} cases), collées {two} ({n2} cases) {shares:?}, écartées {apart} {free:?}");
    // (la seconde, deux cases plus loin, a un peu d'herbe à elle)
    assert!(two * 100 < one * 140, "collées : {two} contre {one} pour une seule");
    assert!(n2 * 100 < n1 * 140, "elles ne mangent pas deux fois plus vite : {n2} contre {n1}");
    assert!(shares.iter().all(|&s| s < 750), "chacune n'a qu'une part : {shares:?}");
    assert!(apart > two, "de part et d'autre de la graine-mère, elles se gênent moins : {apart}");
}

/// À bout (sous un cinquième de son rendement), une frondaison le signale une fois ; de l'herbe revenue plus près
/// la relance.
#[test]
fn a_tired_leaf_warns_once_and_recovers_when_grass_comes_back() {
    let mut w = game(0);
    let (heart, hx, hy) = base(&mut w, 0, 40);
    let l = put(&mut w, 0, B_LEAVES, hx + 4, hy);
    // un long câble : la frondaison est loin de l'herbe, sauf s'il meurt
    let roots: Vec<usize> = (0..14).map(|k| put(&mut w, 0, B_ROOT, hx + 3 + k, hy + 2)).collect();
    soil::ensure(&mut w);
    for y in hy - 25..hy + 28 {
        for x in hx - 20..hx + 30 {
            let i = w.map.idx(x, y);
            if w.terreau[i] == 0 {
                soil::eat(&mut w, 0, i);
            }
        }
    }
    let mut events = 0;
    for _ in 0..400 {
        w.step(&[]);
        events += w.events.chunks(5).filter(|e| e[0] == soil::EV_SPENT).count();
    }
    assert!(w.buildings[l].stalled, "à bout : {}", souche::organ_rate(&w, l).0);
    assert_eq!(events, 1, "une seule alerte");
    let n = w.buildings[heart].net as usize;
    w.nets[n].seve = 0;
    steps(&mut w, 400);
    // vingt secondes : 20 sève de la graine-mère, et ce que donne l'herbe lointaine
    let got = w.nets[n].seve;
    assert!((20..=24).contains(&got), "sève : {got}");
    // le câble meurt : ses cases redeviennent de l'herbe, la frondaison s'en aperçoit en 30 s au plus
    for &r in &roots[2..] {
        remove_building(&mut w, r, false);
    }
    steps(&mut w, 700);
    assert!(!w.buildings[l].stalled && w.buildings[l].ammo < 12, "herbe à {} cases", w.buildings[l].ammo);
}

#[test]
fn grass_is_dry_open_ground_that_is_nobodys_terreau() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 40);
    soil::ensure(&mut w);
    let count = |w: &World| soil::grass_left(w, hx + 20, hy, 2, 2);
    let open = count(&w);
    // de l'eau, une falaise, un bâtiment, une racine (sa zone est du terreau), le sol d'un autre joueur
    let i = w.map.idx(hx + 25, hy);
    w.map.height[i] = 0;
    w.map.water_level = 10;
    assert_eq!(count(&w), open - 1, "l'eau");
    let i = w.map.idx(hx + 25, hy + 1);
    w.map.cliff[i] = 1;
    assert_eq!(count(&w), open - 2, "la falaise");
    let i = w.map.idx(hx + 25, hy + 2);
    soil::eat(&mut w, 1, i);
    assert_eq!(count(&w), open - 3, "le sol mangé par un autre");
    w.players[1].race = RACE_INDUS;
    let f = place_building(&mut w, 1, B_WALL, hx + 18, hy + 2, 0);
    if f.is_none() {
        // le mur demande sa recherche
        w.players[1].set_tech(3);
        place_building(&mut w, 1, B_WALL, hx + 18, hy + 2, 0).expect("mur");
    }
    assert_eq!(count(&w), open - 4, "un bâtiment");
    for k in 0..15 {
        put(&mut w, 0, B_ROOT, hx + 3 + k, hy + 1);
    }
    assert!(count(&w) < open - 30, "les zones des racines sont du terreau : {} contre {open}", count(&w));
    check_terreau(&mut w);
}

#[test]
fn eaten_ground_is_terreau_within_reach_of_a_pole() {
    let mut w = game(0);
    let (heart, hx, hy) = base(&mut w, 0, 40);
    soil::ensure(&mut w);
    // hors du terreau : refusé ; une fois l'herbe mangée, un organe s'y plante et rejoint le réseau
    assert!(place_building(&mut w, 0, B_BULB, hx + 9, hy, 0).is_none());
    for x in hx + 5..hx + 25 {
        for y in hy..hy + 2 {
            let i = w.map.idx(x, y);
            soil::eat(&mut w, 0, i);
        }
    }
    let b = put(&mut w, 0, B_BULB, hx + 9, hy);
    assert_eq!(w.buildings[b].net, w.buildings[heart].net);
    assert_eq!(souche::net_at(&w, 0, hx + 12, hy), w.buildings[heart].net);
    assert_eq!(souche::net_at(&w, 1, hx + 12, hy), 0, "pas pour l'adversaire");
    // à plus de 14 cases de tout poteau, le sol mangé ne sert plus
    assert!(place_building(&mut w, 0, B_BULB, hx + 20, hy, 0).is_none());
    assert_eq!(souche::net_at(&w, 0, hx + 20, hy), 0);
    // un organisme y guérit, un cadavre ennemi y est digéré
    let s = slot_of(w.spawn_unit(U_SHELL, 0, (hx + 13) * TILE, hy * TILE + 64));
    w.units.hp[s] = 500;
    steps(&mut w, 100);
    assert!(w.units.hp[s] > 600, "guérit : {}", w.units.hp[s]);
    let n = w.buildings[heart].net as usize;
    w.nets[n].seve = 0;
    let adn = w.players[0].purse[ADN as usize];
    let foe = slot_of(w.spawn_unit(U_GNAWER, 1, (hx + 14) * TILE, hy * TILE + 64));
    crate::combat::damage_unit(&mut w, foe, 10_000, 0);
    w.step(&[]);
    assert!(w.nets[n].seve >= 10 && w.players[0].purse[ADN as usize] > adn, "digéré");
}

#[test]
fn terreau_of_dead_roots_turns_back_to_grass_but_eaten_ground_stays() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 40);
    let roots: Vec<usize> = (0..12).map(|k| put(&mut w, 0, B_ROOT, hx + 3 + k, hy + 1)).collect();
    soil::ensure(&mut w);
    let at = |w: &World, x: i32, y: i32| w.terreau[w.map.idx(x, y)] & 1 != 0;
    assert!(at(&w, hx + 12, hy + 3));
    let i = w.map.idx(hx + 12, hy + 4);
    soil::eat(&mut w, 0, i);
    let j = w.map.idx(hx + 13, hy + 7);
    soil::eat(&mut w, 0, j);
    for &r in &roots[5..] {
        remove_building(&mut w, r, false);
        check_terreau(&mut w);
    }
    assert!(!at(&w, hx + 12, hy + 3), "la zone d'une racine morte redevient de l'herbe");
    assert!(at(&w, hx + 12, hy + 4) && at(&w, hx + 13, hy + 7), "ce qui est mangé le reste");
    assert!(at(&w, hx + 6, hy + 3), "les racines restantes gardent leur zone");
}

#[test]
fn taproots_graze_too_and_dry_up() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 40);
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(hx + 4 + dx, hy + dy);
            w.map.deposit[i] = HYDROCARBON;
        }
    }
    w.map.spots.push(crate::map::Spot { kind: HYDROCARBON, x: hx + 4, y: hy, purity: 0 });
    w.wear.resize(w.map.spots.len(), 0);
    let t = put(&mut w, 0, B_TAPROOT, hx + 4, hy);
    steps(&mut w, 40);
    let near = souche::organ_rate(&w, t).0;
    assert!(near > 300, "herbe toute proche : {near}");
    steps(&mut w, 2000);
    assert!((4..=10).contains(&eaten(&w)), "{} cases", eaten(&w));
    // elle ne sort pas de son périmètre
    for i in 0..w.terreau.len() {
        let (x, y) = (i as i32 % w.map.w, i as i32 / w.map.w);
        if w.terreau[i] == 0 && (x - hx).abs() < 22 && (y - hy).abs() < 22 {
            soil::eat(&mut w, 0, i);
        }
    }
    steps(&mut w, 40);
    assert!(w.buildings[t].stalled);
    assert_eq!(souche::organ_rate(&w, t), (3 * soil::SPENT_PCT, 0));
}

/// Une racine mange très court (une case au-delà de sa zone), quatre fois plus vite qu'une frondaison, pour moitié
/// moins de sève par case.
#[test]
fn roots_eat_a_very_short_way_four_times_faster_for_half_the_sap() {
    for d in 1..12 {
        let d2 = 4 * d * d;
        assert_eq!(soil::bite_ticks(B_ROOT, d2), soil::bite_ticks(B_LEAVES, d2) / 4);
    }
    let mut w = game(0);
    let (heart, hx, hy) = base(&mut w, 0, 50);
    // à l'écart de la graine-mère : une file droite de 20 racines, la sève comptée à partir de là
    let line: Vec<usize> = (0..30).map(|k| put(&mut w, 0, B_ROOT, hx + 3 + k, hy + 1)).collect();
    let net = w.buildings[heart].net;
    assert!(line.iter().all(|&r| w.buildings[r].net == net && net != 0));
    let made = w.players[0].produced[SEVE as usize];
    steps(&mut w, 42);
    // de quoi manger, en partage avec ses voisines
    let mid = &w.buildings[line[15]];
    let m = soil::meal(&w, B_ROOT, 0, (mid.x, mid.y, 1, 1), (0, soil::ROOT_R), 0);
    assert!(m.left == 10 && m.share == 200 && m.near == 64, "cinq racines convoitent chaque case : {} cases, part {}", m.left, m.share);
    assert!((80..=100).contains(&m.ticks), "une case à 4 cases : {} ticks", m.ticks);
    assert!(souche::organ_rate(&w, line[15]).0 > 0);
    let mut t = 42;
    let mut last = 0;
    while t < 4000 && (eaten(&w) != last || t < 1500) {
        last = eaten(&w);
        steps(&mut w, 500);
        t += 500;
    }
    let n = eaten(&w) as i32;
    // deux cases par racine (une de chaque côté), et le bout
    assert!((60..=76).contains(&n), "{n} cases pour 30 racines");
    let got = (w.players[0].produced[SEVE as usize] - made) as i32 - t as i32 / 20;
    assert!((got - soil::ROOT_SEVE * n).abs() <= 2, "{got} sève pour {n} cases");
    for (i, &o) in w.soil.iter().enumerate() {
        if o != 0 {
            let (tx, ty) = (i as i32 % w.map.w, i as i32 / w.map.w);
            let near = line.iter().map(|&r| (w.buildings[r].x - tx).pow(2) + (w.buildings[r].y - ty).pow(2)).min().unwrap();
            assert!((10..=20).contains(&near), "une case au-delà de sa zone : ({}, {})", tx - hx, ty - hy);
        }
    }
    // l'herbe de sa portée finie, elle ne donne plus rien, sans alerte ; elle ne va pas plus loin
    assert!(line.iter().all(|&r| souche::organ_rate(&w, r) == (0, 0) && !w.buildings[r].stalled));
    steps(&mut w, 1000);
    assert_eq!(eaten(&w) as i32, n);
    check_terreau(&mut w);
    // hors de tout réseau vivant, elle ne mange pas
    remove_building(&mut w, line[2], false);
    remove_building(&mut w, heart, false);
    for x in 0..10 {
        let i = w.map.idx(hx + 18 + x, hy + 5);
        w.soil[i] = 0;
        w.terreau[i] = 0;
    }
    let cut = line[20];
    steps(&mut w, 4);
    w.buildings[cut].net = 0;
    let k = w.buildings[cut].charge;
    soil::graze(&mut w, cut, 40);
    assert_eq!(w.buildings[cut].charge, k);
}

/// Rentabilité d'une racine selon sa distance à la graine-mère : 20 sève d'herbe par racine d'une file droite, pour un
/// prix qui monte de 2 % par case ; elle se paie jusqu'à 200 cases. L'aperçu de pose annonce ce qu'elle rapporte.
#[test]
fn a_root_pays_for_itself_up_to_two_hundred_cells() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 60);
    let first: Vec<usize> = (0..6).map(|k| put(&mut w, 0, B_ROOT, hx + 3 + k, hy + 1)).collect();
    soil::ensure(&mut w);
    // ce qu'annonce l'aperçu d'une file de 30 racines de plus, sur un pré intact
    let cells: Vec<(i32, i32, u8)> = (0..30).map(|k| (hx + 9 + k, hy + 1, 0)).collect();
    let v = souche::line_cost(&w, 0, B_ROOT, &cells);
    let (grass, seve, cost) = (v[1], v[2], v[4]);
    let made = w.players[0].produced[SEVE as usize] as i32;
    for &(x, y, _) in &cells {
        put(&mut w, 0, B_ROOT, x, y);
    }
    steps(&mut w, 3000);
    let got = w.players[0].produced[SEVE as usize] as i32 - made - 150;
    println!("30 racines de plus : {grass} cases d'herbe, {seve} sève annoncée, {got} tirée (toute la file), {cost} de prix");
    assert!((60..=76).contains(&grass), "{grass}");
    // les six premières racines mangent aussi leur herbe (120 sève et le bout de file)
    assert!((got - seve - 130).abs() <= 50, "annoncé {seve}, tiré {got} avec les six premières");
    assert!(first.iter().all(|&r| w.buildings[r].alive));
    // prix d'une racine à d cases, contre les 20 sève qu'elle rapporte
    let heart = [(0, 0, 3, 3)];
    let price = |d: i32| souche::far_cost(bdef(B_ROOT).cost[0].1, souche::far_pct(&heart, B_ROOT, 2 + d, 1, 0)) as i32;
    let gain = 2 * soil::ROOT_SEVE;
    println!("distance : prix, bilan d'une racine en file droite (deux côtés d'herbe), d'un seul côté");
    for d in [1, 10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 300] {
        println!("{d:>4} cases : {:>2} sève, {:+}, {:+}", price(d), gain - price(d), gain / 2 - price(d));
    }
    assert_eq!((price(1), price(50), price(100), price(200)), (4, 8, 12, 20));
    assert!((1..=200).all(|d| price(d) <= gain) && (207..300).all(|d| price(d) > gain));
}

#[test]
fn preview_layer_and_save_tell_the_same_ground() {
    let mut w = game(1);
    let (_, hx, hy) = base(&mut w, 0, 30);
    let l = put(&mut w, 0, B_LEAVES, hx + 4, hy);
    soil::ensure(&mut w);
    // aperçu de pose : ce qu'aura la frondaison une fois poussée (sa voisine convoite la même herbe)
    steps(&mut w, 40);
    let (gx, gy) = (hx + 4, hy + 3);
    let p = soil::preview(&w, 0, B_LEAVES, gx, gy);
    let twin = put(&mut w, 0, B_LEAVES, gx, gy);
    steps(&mut w, 40);
    let m = meal_of(&w, twin);
    assert!((p[3] - m.share as i32).abs() < 60, "part : aperçu {}, posée {}", p[3], m.share);
    assert!((p[4] - w.buildings[twin].timer as i32).abs() < 120, "rendement : aperçu {}, posée {}", p[4], w.buildings[twin].timer);
    assert!(p[3] < 900 && p[0] >= 1 && p[2] == p[0] + soil::RING, "{p:?}");
    remove_building(&mut w, twin, false);
    assert!(soil::preview(&w, 0, B_BULB, gx, gy).is_empty());
    let t = soil::preview(&w, 0, B_TAPROOT, gx, gy);
    assert!(t[2] == soil::TAPROOT_R && t[5] > 50 && t[6] >= t[5], "{t:?}");
    steps(&mut w, 2200);
    let n = eaten(&w);
    assert!(n >= 4);
    // affichage : le joueur voit son sol ; l'adversaire, qui n'est jamais venu, non ; un spectateur, oui
    let seen = |w: &World, p: i32| soil::layer(w, p).iter().filter(|&&v| v & 0xff != 0).map(|&v| v >> 8).sum::<i32>();
    assert_eq!(seen(&w, 0), n as i32);
    assert_eq!(seen(&w, 1), 0);
    assert_eq!(seen(&w, -1), n as i32);
    assert_eq!(soil::layer(&w, 0).iter().map(|&v| v >> 8).sum::<i32>(), w.map.w * w.map.h);
    // sauvegarde : relue à n'importe quel tick, la partie continue à l'identique (terreau refait compris)
    for k in 0..30 {
        if k == 4 {
            for j in 0..6 {
                place_building(&mut w, 0, B_ROOT, hx + 3 + j, hy + 2, 0);
            }
        }
        if k == 20 {
            let r = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_ROOT);
            if let Some(r) = r {
                remove_building(&mut w, r, false);
            }
        }
        let mut r = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
        assert!(r.soil == w.soil && r.soil_n == w.soil_n);
        for t in 0..37 {
            assert_eq!(r.step(&[]), w.step(&[]), "passage {k}, tick {t}");
        }
        assert!(r.terreau == w.terreau, "passage {k}");
    }
    assert!(w.buildings[l].alive);
}

/// Les poteaux qui poussent et meurent dans le désordre, et l'herbe mangée entre-temps : le terreau tenu à jour
/// reste celui qu'on recalculerait.
#[test]
fn incremental_terreau_matches_a_full_rebuild() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 40);
    w.players[0].set_tech(T_S_BRAMBLES);
    soil::ensure(&mut w);
    let mut rng = crate::rng::Rng { state: 7 };
    let mut poles: Vec<usize> = Vec::new();
    let (mut born, mut dead) = (0, 0);
    for k in 0..900 {
        match rng.below(8) {
            0..=4 => {
                // une racine ou un rhizome collé à un poteau
                let (mut x, mut y) = (hx + 3, hy + 1);
                if !poles.is_empty() {
                    let p = &w.buildings[poles[rng.below(poles.len() as u32) as usize]];
                    let (pw, ph) = p.size();
                    (x, y) = [(p.x + pw, p.y), (p.x - 1, p.y), (p.x, p.y + ph), (p.x, p.y - 1)][rng.below(4) as usize];
                }
                let kind = if rng.below(6) == 0 { B_RHIZOME } else { B_ROOT };
                if let Some(b) = place_building(&mut w, 0, kind, x, y, 0) {
                    complete_building(&mut w, b);
                    poles.push(b);
                    born += 1;
                }
            }
            5 if poles.len() > 4 => {
                dead += 1;
                let b = poles.swap_remove(rng.below(poles.len() as u32) as usize);
                remove_building(&mut w, b, false);
            }
            6 => {
                let i = w.map.idx(hx - 15 + rng.below(40) as i32, hy - 15 + rng.below(40) as i32);
                soil::eat(&mut w, 0, i);
            }
            _ => {
                if k % 20 == 0 {
                    w.step(&[]);
                }
            }
        }
        if k % 7 == 0 {
            check_terreau(&mut w);
        }
    }
    check_terreau(&mut w);
    assert!(born > 60 && dead > 20, "{born} poteaux poussés, {dead} morts");
}

/// Temps par tick d'une très grosse base : 400 frondaisons au milieu d'un pré déjà mangé (mesure, à la demande).
#[test]
#[ignore]
fn four_hundred_leaves_profile() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 70);
    soil::ensure(&mut w);
    for y in hy - 60..hy + 60 {
        for x in hx - 60..hx + 60 {
            let i = w.map.idx(x, y);
            if w.terreau[i] == 0 && (x - hx).pow(2) + (y - hy).pow(2) < 42 * 42 {
                soil::eat(&mut w, 0, i);
            }
        }
    }
    for k in 0..40 {
        put(&mut w, 0, B_ROOT, hx + 3 + k, hy + 1);
        put(&mut w, 0, B_ROOT, hx - 1 - k, hy + 1);
    }
    let mut n = 0;
    for y in (hy - 14..hy + 14).step_by(2) {
        for x in (hx - 40..hx + 40).step_by(2) {
            if n < 400 && place_building(&mut w, 0, B_LEAVES, x, y, 0).map(|b| complete_building(&mut w, b)).is_some() {
                n += 1;
            }
        }
    }
    rebuild_power(&mut w);
    steps(&mut w, 100);
    let t = std::time::Instant::now();
    steps(&mut w, 2000);
    println!("{n} frondaisons : {:.3} ms/tick, {} cases mangées", t.elapsed().as_secs_f64() * 1000.0 / 2000.0, w.soil_n);
}

/// Temps par tick de mille racines qui mangent, puis qui n'ont plus rien à manger (mesure, à la demande).
#[test]
#[ignore]
fn thousand_roots_profile() {
    let mut w = game(0);
    let (_, hx, hy) = base(&mut w, 0, 70);
    // un peigne : un câble est-ouest, des rangs nord-sud toutes les dix cases
    let mut n = 0;
    for k in 0..60 {
        for x in [hx + 3 + k, hx - 1 - k] {
            n += place_building(&mut w, 0, B_ROOT, x, hy + 1, 0).map(|b| complete_building(&mut w, b)).is_some() as i32;
        }
    }
    for x in (hx - 50..=hx + 60).step_by(10) {
        for k in 1..50 {
            for y in [hy + 1 + k, hy + 1 - k] {
                n += place_building(&mut w, 0, B_ROOT, x, y, 0).map(|b| complete_building(&mut w, b)).is_some() as i32;
            }
        }
    }
    rebuild_power(&mut w);
    let ms = |w: &mut World, t: u32| {
        let at = std::time::Instant::now();
        steps(w, t);
        at.elapsed().as_secs_f64() * 1000.0 / t as f64
    };
    let (eat, rest) = (ms(&mut w, 1000), {
        steps(&mut w, 2000);
        ms(&mut w, 1000)
    });
    println!("{n} racines : {eat:.3} ms/tick pendant qu'elles mangent, {rest:.3} ensuite ; {} cases mangées", w.soil_n);
}
