//! Tests de gameplay et de déterminisme.

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;

fn params(np: usize, size: i32) -> Vec<i32> {
    let mut p = vec![4242, size, 0, np as i32];
    for i in 0..np {
        p.extend_from_slice(&[i as i32, 0, 100, 100]);
    }
    p
}

/// Prépare une zone plate et vide.
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

fn spot(w: &mut World, kind: u8, x: i32, y: i32) {
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(x + dx, y + dy);
            w.map.deposit[i] = kind;
        }
    }
    w.map.spots.push(crate::map::Spot { kind, x, y });
}

fn put(w: &mut World, kind: u16, x: i32, y: i32, dir: u8) -> usize {
    let b = place_building(w, 0, kind, x, y, dir).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

fn set_recipe(w: &mut World, b: usize, key: &str) {
    let r = RECIPES.iter().position(|r| r.key == key).unwrap() as i32;
    let rf = w.building_ref(b) as i32;
    let o = [4, crate::orders::O_SET_RECIPE, 0, rf, r];
    w.step(&o);
}

#[test]
fn production_chain_reaches_tier3_packs() {
    let mut w = World::new(&params(1, 512));
    w.players[0].researched = u64::MAX;
    flatten(&mut w, 95, 105, 180, 130);
    let y = 120;
    // tapis principal vers l'est, jusqu'à un dépôt
    for x in 100..=170 {
        put(&mut w, B_BELT1, x, y, 0);
    }
    put(&mut w, B_DEPOT, 171, y, 0);
    // extracteurs sous le tapis, sortie vers le haut
    for (i, x) in [100, 103, 106, 109, 112].iter().enumerate() {
        let kind = if i < 3 { IRON_ORE } else { COPPER_ORE };
        spot(&mut w, kind, *x, y + 1);
        put(&mut w, B_EXTRACTOR, *x, y + 1, 3);
    }
    spot(&mut w, IRON_ORE, 115, y + 1);
    put(&mut w, B_EXTRACTOR, 115, y + 1, 3);
    spot(&mut w, IRON_ORE, 118, y + 1);
    put(&mut w, B_EXTRACTOR, 118, y + 1, 3);
    // fonderies au-dessus, avec bras d'entrée et de sortie
    let mut furnace = |w: &mut World, x: i32, recipe: &str| {
        let b = put(w, B_FURNACE, x, y - 3, 0);
        put(w, B_INSERTER, x, y - 1, 3);
        put(w, B_INSERTER, x + 1, y - 1, 1);
        set_recipe(w, b, recipe);
    };
    furnace(&mut w, 120, "iron_plate");
    furnace(&mut w, 123, "iron_plate");
    furnace(&mut w, 126, "iron_plate");
    furnace(&mut w, 129, "copper_plate");
    furnace(&mut w, 132, "steel");
    furnace(&mut w, 135, "steel");
    furnace(&mut w, 138, "copper_plate");
    furnace(&mut w, 141, "iron_plate");
    let mut asm = |w: &mut World, x: i32, recipe: &str| {
        let b = put(w, B_ASSEMBLER1, x, y - 3, 0);
        put(w, B_INSERTER, x, y - 1, 3);
        put(w, B_INSERTER, x + 1, y - 1, 1);
        set_recipe(w, b, recipe);
    };
    asm(&mut w, 145, "ammo");
    asm(&mut w, 149, "pack3");
    asm(&mut w, 153, "gear");
    asm(&mut w, 157, "pack1");
    // énergie
    for x in [100, 103, 106, 109, 112, 115] {
        put(&mut w, B_GENERATOR, x, 110, 0);
    }
    for x in [102, 108, 114, 119, 125, 131, 137, 143, 147, 151, 155, 159, 163] {
        if w.map.occ[w.map.idx(x, y - 1)] == 0 {
            put(&mut w, B_PYLON, x, y - 1, 0);
        } else {
            put(&mut w, B_PYLON, x, y - 5, 0);
        }
    }
    for x in [101, 107, 113, 119] {
        put(&mut w, B_PYLON, x, y + 3, 0);
    }
    for x in [101, 107, 113] {
        put(&mut w, B_PYLON, x, 114, 0);
    }
    let stock0 = w.players[0].stock;
    for _ in 0..20 * 60 * 6 {
        w.step(&[]);
    }
    let p = &w.players[0];
    let gained = |it: u8| p.stock[it as usize] - stock0[it as usize];
    println!(
        "fer {} cuivre {} acier {} munitions {} lots1 {} lots3 {} | produit lots3 {} | énergie {}/{}",
        gained(IRON_PLATE),
        gained(COPPER_PLATE),
        gained(STEEL),
        gained(AMMO),
        gained(PACK1),
        gained(PACK1 + 2),
        p.produced[(PACK1 + 2) as usize],
        p.power_use,
        p.power_prod
    );
    assert!(p.produced[IRON_PLATE as usize] > 50, "pas de plaques de fer");
    assert!(p.produced[STEEL as usize] > 5, "pas d'acier");
    assert!(p.produced[AMMO as usize] > 2, "pas de munitions");
    assert!(p.produced[(PACK1 + 2) as usize] > 0, "pas de lots du palier 3");
    assert!(p.produced[PACK1 as usize] > 0, "pas de lots 1");
    assert!(gained(PACK1 + 2) > 0, "les lots 3 n'arrivent pas au dépôt");
}

#[test]
fn research_with_labs() {
    let mut w = World::new(&params(1, 512));
    flatten(&mut w, 95, 105, 140, 130);
    let lab = put(&mut w, B_LAB, 110, 115, 0);
    for x in [100, 103] {
        put(&mut w, B_GENERATOR, x, 115, 0);
    }
    put(&mut w, B_PYLON, 107, 116, 0);
    w.buildings[lab].inv[0] = 2;
    let o = [3, crate::orders::O_RESEARCH, 0, 1];
    w.step(&o);
    assert_eq!(w.players[0].research, 1);
    for _ in 0..400 {
        w.buildings[lab].inv[0] = 2;
        w.step(&[]);
    }
    assert!(w.players[0].tech_progress[1] > 2, "la recherche n'avance pas");
}

fn battle_world(n: usize) -> World {
    // pas de modification de la carte ici : restore() la régénère à partir de la graine
    let mut w = World::new(&params(2, 512));
    let kinds = [U_LINE_ROBOT, 6, 10, 7];
    for i in 0..n {
        for p in 0..2u8 {
            let k = kinds[i % kinds.len()];
            let x = if p == 0 { 180 } else { 330 } * TILE + ((i % 25) as i32) * TILE;
            let y = 160 * TILE + ((i / 25) as i32) * TILE * 4;
            let id = w.spawn_unit(k, p, x, y);
            let s = slot_of(id);
            let tx = if p == 0 { 300 * TILE } else { 200 * TILE };
            w.units.cold[s].orders.push(Order::Move { x: tx, y, gx: tx, gy: 250 * TILE, attack: true });
        }
    }
    w
}

#[test]
fn battle_1000_vs_1000_deterministic() {
    let mut a = battle_world(1000);
    let mut b = battle_world(1000);
    let mut deaths = 0;
    for t in 0..1200 {
        let ha = a.step(&[]);
        let hb = b.step(&[]);
        assert_eq!(ha, hb, "désynchronisation au tick {t}");
        deaths += a.events.chunks(5).filter(|e| e[0] == EV_UNIT_DIED).count();
        if t == 600 {
            let snap = crate::save::snapshot(&a);
            let mut c = crate::save::restore(&snap).unwrap();
            for _ in 0..50 {
                let h1 = a.step(&[]);
                b.step(&[]);
                let h2 = c.step(&[]);
                assert_eq!(h1, h2, "snapshot/restore diverge en combat");
            }
        }
    }
    println!("morts : {deaths}, unités restantes : {} / {}", a.players[0].unit_count, a.players[1].unit_count);
    assert!(deaths > 200, "pas assez de combat ({deaths})");
}

#[test]
fn commander_builds_with_stock() {
    let mut w = World::new(&params(1, 512));
    let c = w.players[0].commander;
    let s = slot_of(c);
    let (sx, sy) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
    let o = [9, crate::orders::O_BUILD, 0, 0, B_GENERATOR as i32, sx + 4, sy + 4, 0, 1, c as i32];
    w.step(&o);
    for _ in 0..400 {
        w.step(&[]);
    }
    let built = w.buildings.iter().any(|b| b.alive && b.kind == B_GENERATOR && b.complete());
    assert!(built, "le commandant n'a pas construit le générateur");
}

#[test]
fn debug_battle_positions() {
    let mut a = battle_world(50);
    for t in 0..1200 {
        a.step(&[]);
        if t % 200 == 0 {
            let mut sx = [0i64; 2];
            let mut n = [0i64; 2];
            let mut ord = [0usize; 2];
            for s in 0..a.units.alive.len() {
                if a.units.alive[s] && a.units.kind[s] != U_COMMANDER {
                    let p = a.units.owner[s] as usize;
                    sx[p] += a.units.x[s] as i64 / 256;
                    n[p] += 1;
                    ord[p] += a.units.cold[s].orders.len();
                }
            }
            println!("t={t} x0={} x1={} ord={:?} targets={}", sx[0] / n[0].max(1), sx[1] / n[1].max(1), ord, a.units.cold.iter().filter(|c| c.wtarget[0] != NONE).count());
        }
    }
}

#[test]
fn flow_field_goes_around_wall() {
    let mut w = World::new(&params(1, 512));
    w.players[0].researched = u64::MAX;
    flatten(&mut w, 60, 60, 200, 200);
    w.nav = crate::flow::Nav::new(&w.map);
    // mur vertical de x=130, y=70..190 avec un passage en y=185..187
    for y in 70..190 {
        if (185..=187).contains(&y) {
            continue;
        }
        put(&mut w, B_WALL, 130, y, 0);
    }
    crate::flow::process_dirty(&mut w);
    let id = w.spawn_unit(6, 0, 100 * TILE, 100 * TILE);
    let s = slot_of(id);
    let (tx, ty) = (160 * TILE, 100 * TILE);
    w.units.cold[s].orders.push(Order::Move { x: tx, y: ty, gx: tx, gy: ty, attack: false });
    for t in 0..1500 {
        w.step(&[]);
        if t % 20 == 0 && t > 200 && t < 440 {
            let g = w.units.cold[s].goal;
            let (ux, uy) = (w.units.x[s], w.units.y[s]);
            let fd = if g != 0 { crate::flow::flow_dir(&mut w, g, ux / TILE, uy / TILE) } else { 99 };
            println!("t={t} pos={},{} ({},{}) facing={} fd={fd} stuck={}", ux / TILE, uy / TILE, ux % TILE, uy % TILE, w.units.facing[s], w.units.cold[s].stuck);
        }
        if w.units.cold[s].orders.is_empty() {
            break;
        }
    }
    let d = crate::fixed::dist(w.units.x[s], w.units.y[s], tx, ty);
    println!("arrivée à {} cases, en {} ticks, position {},{}", d / TILE, w.tick, w.units.x[s] / TILE, w.units.y[s] / TILE);
    assert!(d < 3 * TILE, "l'unité n'a pas contourné le mur");
}

#[test]
fn flow_goal_on_building_goes_around_wall() {
    // but posé au centre d'un bâtiment (case infranchissable) : le chemin doit quand même
    // contourner le mur au lieu d'aller tout droit s'y bloquer
    let mut w = World::new(&params(1, 512));
    w.players[0].researched = u64::MAX;
    flatten(&mut w, 60, 60, 200, 200);
    w.nav = crate::flow::Nav::new(&w.map);
    for y in 70..190 {
        if (185..=187).contains(&y) {
            continue;
        }
        put(&mut w, B_WALL, 130, y, 0);
    }
    let depot = put(&mut w, B_DEPOT, 160, 100, 0);
    crate::flow::process_dirty(&mut w);
    let (bx, by) = w.buildings[depot].center();
    let id = w.spawn_unit(6, 0, 100 * TILE, 100 * TILE);
    let s = slot_of(id);
    w.units.cold[s].orders.push(Order::Move { x: bx, y: by, gx: bx, gy: by, attack: false });
    for _ in 0..2500 {
        w.step(&[]);
        if w.units.cold[s].orders.is_empty() {
            break;
        }
    }
    let d = crate::fixed::dist(w.units.x[s], w.units.y[s], bx, by);
    assert!(d < 5 * TILE, "l'unité n'a pas atteint le bâtiment : arrêtée à {} cases, en {},{}", d / TILE, w.units.x[s] / TILE, w.units.y[s] / TILE);
}

#[test]
fn long_detour_keeps_the_order() {
    // mur de 360 cases : pour rejoindre un point à 60 cases, l'unité doit s'éloigner du but pendant
    // bien plus de 1200 ticks ; elle ne doit pas abandonner son ordre en route
    let mut w = World::new(&params(1, 512));
    w.players[0].researched = u64::MAX;
    flatten(&mut w, 60, 0, 200, 440);
    w.nav = crate::flow::Nav::new(&w.map);
    for y in 1..420 {
        if (415..=417).contains(&y) {
            continue;
        }
        put(&mut w, B_WALL, 130, y, 0);
    }
    crate::flow::process_dirty(&mut w);
    let id = w.spawn_unit(U_LINE_ROBOT, 0, 100 * TILE, 100 * TILE);
    let s = slot_of(id);
    let (tx, ty) = (160 * TILE, 100 * TILE);
    w.units.cold[s].orders.push(Order::Move { x: tx, y: ty, gx: tx, gy: ty, attack: false });
    for _ in 0..12000 {
        w.step(&[]);
        if w.units.cold[s].orders.is_empty() {
            break;
        }
    }
    let d = crate::fixed::dist(w.units.x[s], w.units.y[s], tx, ty);
    assert!(d < 3 * TILE, "ordre abandonné en route : arrêtée à {} cases, en {},{} (tick {})", d / TILE, w.units.x[s] / TILE, w.units.y[s] / TILE, w.tick);
}

/// Plusieurs bras sur la même source : ils alternent, et la part réglée d'un bras est respectée.
#[test]
fn arms_share_output_of_same_source() {
    let mut w = World::new(&params(1, 512));
    w.players[0].researched = u64::MAX;
    flatten(&mut w, 85, 85, 125, 125);
    spot(&mut w, IRON_ORE, 100, 100);
    // extracteur tourné vers une case vide : sa sortie ne part que par les bras
    let ext = put(&mut w, B_EXTRACTOR, 100, 100, 3);
    let a1 = put(&mut w, B_INSERTER, 102, 100, 0);
    let a2 = put(&mut w, B_INSERTER, 102, 101, 0);
    let a3 = put(&mut w, B_INSERTER, 99, 100, 2);
    put(&mut w, B_DEPOT, 103, 100, 0);
    put(&mut w, B_DEPOT, 97, 100, 0);
    put(&mut w, B_GENERATOR, 100, 104, 0);
    assert_eq!(crate::buildings::takers_of(&w, ext), vec![a1, a2, a3]);
    let arms = [a1, a2, a3];
    let run = |w: &mut World, ticks: u32| -> [u32; 3] {
        let mut n = [0u32; 3];
        let mut prev = [0u8; 3];
        for _ in 0..ticks {
            w.step(&[]);
            for k in 0..3 {
                let ph = w.buildings[arms[k]].phase;
                if prev[k] == 0 && ph == 1 {
                    n[k] += 1;
                }
                prev[k] = ph;
            }
        }
        n
    };
    run(&mut w, 400);
    let n = run(&mut w, 6000);
    let total: u32 = n.iter().sum();
    assert!(total > 60, "trop peu d'objets pris : {:?}", n);
    for &c in &n {
        // parts égales (un tiers chacun), à 15 % près
        assert!((c as f64 / total as f64 - 1.0 / 3.0).abs() < 0.05, "partage inégal : {:?}", n);
    }
    // le premier bras réglé à 80 % : les deux autres se partagent le reste
    let rf = w.building_ref(a1) as i32;
    w.step(&[4, crate::orders::O_SET_SHARE, 0, rf, 80]);
    assert_eq!(w.buildings[a1].share, 80);
    run(&mut w, 400);
    let n = run(&mut w, 6000);
    let total: u32 = n.iter().sum();
    let f = n[0] as f64 / total as f64;
    assert!((f - 0.8).abs() < 0.05, "part réglée non respectée : {:?} ({:.2})", n, f);
}

/// Trappes : sans aucun bras, un tapis qui entre dans une fonderie la livre, et un tapis qui en
/// part reçoit ses plaques jusqu'au dépôt.
#[test]
fn belts_feed_and_drain_buildings_without_arms() {
    let mut w = World::new(&params(1, 512));
    w.players[0].researched = u64::MAX;
    flatten(&mut w, 85, 85, 125, 125);
    spot(&mut w, IRON_ORE, 94, 100);
    put(&mut w, B_EXTRACTOR, 94, 100, 0); // sortie vers l'est, sur le tapis
    for x in 96..100 {
        put(&mut w, B_BELT1, x, 100, 0); // tapis entrant dans la fonderie
    }
    let f = put(&mut w, B_FURNACE, 100, 100, 0);
    for x in 102..106 {
        put(&mut w, B_BELT1, x, 100, 0); // tapis qui part de la face est de la fonderie
    }
    put(&mut w, B_DEPOT, 106, 100, 0);
    put(&mut w, B_GENERATOR, 100, 104, 0);
    assert_eq!(crate::buildings::out_belts(&w, f).len(), 1);
    let before = w.players[0].stock[IRON_PLATE as usize];
    for _ in 0..4000 {
        w.step(&[]);
    }
    let got = w.players[0].stock[IRON_PLATE as usize] - before;
    assert!(got >= 10, "plaques arrivées au dépôt : {}", got);
}

/// Fonderie approvisionnée en minerai (elle produit à son rythme), ses tapis de sortie en cul-de-sac.
fn outlet_world() -> (World, usize) {
    let mut w = World::new(&params(1, 512));
    w.players[0].researched = u64::MAX;
    flatten(&mut w, 85, 85, 125, 125);
    let f = put(&mut w, B_FURNACE, 100, 100, 0);
    set_recipe(&mut w, f, "iron_plate");
    put(&mut w, B_GENERATOR, 96, 96, 0);
    (w, f)
}

/// Objets posés sur la ligne du tapis `b` (cul-de-sac : ils s'y accumulent).
fn items_on(w: &World, b: usize) -> usize {
    w.belts.lines[w.buildings[b].line as usize].items.len()
}

/// Plusieurs tapis de sortie : ils reçoivent les produits à tour de rôle.
#[test]
fn output_belts_alternate() {
    let (mut w, f) = outlet_world();
    let east = put(&mut w, B_BELT1, 102, 100, 0);
    for x in 103..110 {
        put(&mut w, B_BELT1, x, 100, 0);
    }
    let south = put(&mut w, B_BELT1, 100, 102, 1);
    for y in 103..110 {
        put(&mut w, B_BELT1, 100, y, 1);
    }
    assert_eq!(crate::buildings::out_belts(&w, f).len(), 2);
    for _ in 0..1600 {
        w.buildings[f].inv[0] = w.buildings[f].inv[0].max(10);
        w.step(&[]);
    }
    let (a, b) = (items_on(&w, east), items_on(&w, south));
    println!("tapis est {} sud {}", a, b);
    assert!(a + b >= 12, "trop peu de produits posés : {} + {}", a, b);
    assert!(a.abs_diff(b) <= 1, "les tapis n'alternent pas : {} contre {}", a, b);
}

/// Un bras et un tapis sur le même bâtiment : chacun reçoit, le bras n'est pas affamé par le tapis.
#[test]
fn output_arm_and_belt_alternate() {
    let (mut w, f) = outlet_world();
    let belt = put(&mut w, B_BELT1, 102, 100, 0);
    for x in 103..112 {
        put(&mut w, B_BELT1, x, 100, 0);
    }
    let arm = put(&mut w, B_INSERTER, 100, 99, 3); // prend dans la fonderie, pose au nord
    put(&mut w, B_DEPOT, 100, 97, 0);
    let mut picks = 0;
    let mut prev = 0u8;
    for _ in 0..1600 {
        w.buildings[f].inv[0] = w.buildings[f].inv[0].max(10);
        w.step(&[]);
        let ph = w.buildings[arm].phase;
        if prev == 0 && ph == 1 {
            picks += 1;
        }
        prev = ph;
    }
    let on_belt = items_on(&w, belt);
    println!("bras {} tapis {}", picks, on_belt);
    assert!(picks + on_belt as u32 >= 12, "trop peu de produits : {} + {}", picks, on_belt);
    assert!(picks.abs_diff(on_belt as u32) <= 1, "le bras et le tapis n'alternent pas : {} contre {}", picks, on_belt);
}
