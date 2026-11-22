//! Tests : mise en pause des bâtiments de production (ordre `O_SET_PAUSE`, voir buildings::paused).

use crate::buildings::{accepts, complete_building, crafter_power, insert_item, paused, place_building, twins_of};
use crate::data::*;
use crate::fixed::TILE;
use crate::orders::O_SET_PAUSE;
use crate::world::*;

fn world() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 1, 100, 100]);
    w.players[0].researched = u64::MAX;
    w.infinite_grid = true;
    for y in 80..130 {
        for x in 80..130 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.map.spots.retain(|s| !(s.x >= 78 && s.x <= 130 && s.y >= 78 && s.y <= 130));
    w
}

fn put(w: &mut World, owner: u8, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, owner, kind, x, y, 0).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

fn gear() -> i32 {
    RECIPES.iter().position(|r| r.key == "gear").unwrap() as i32
}

/// Assembleur d'engrenages rempli de plaques, en pleine fabrication.
fn busy_assembler(w: &mut World, x: i32) -> usize {
    let a = put(w, 0, B_ASSEMBLER1, x, 100);
    let id = w.building_ref(a) as i32;
    w.step(&[4, crate::orders::O_SET_RECIPE, 0, id, gear()]);
    while accepts(w, a, IRON_PLATE) {
        insert_item(w, a, IRON_PLATE);
    }
    for _ in 0..5 {
        w.step(&[]);
    }
    assert!(w.buildings[a].working && w.buildings[a].progress > 0, "l'assembleur travaille");
    a
}

fn pause(w: &mut World, on: bool, bs: &[usize]) {
    let mut cmd = vec![(bs.len() + 4) as i32, O_SET_PAUSE, 0, on as i32, bs.len() as i32];
    cmd.extend(bs.iter().map(|&b| w.building_ref(b) as i32));
    w.step(&cmd);
}

fn demand(w: &World, b: usize) -> i32 {
    w.nets[w.buildings[b].net as usize].demand
}

/// En pause : plus d'énergie, plus d'entrées, plus de production ; le cycle en cours et le contenu
/// restent ; la reprise finit le cycle.
#[test]
fn paused_crafter_keeps_its_cycle_and_resumes() {
    let mut w = world();
    let a = busy_assembler(&mut w, 100);
    let on = demand(&w, a);
    pause(&mut w, true, &[a]);
    assert!(paused(&w.buildings[a]));
    w.step(&[]);
    let (progress, inv, out) = (w.buildings[a].progress, w.buildings[a].inv, w.buildings[a].out);
    assert_eq!(demand(&w, a), on - crafter_power(&w.buildings[a]), "plus de consommation électrique");
    for _ in 0..600 {
        w.step(&[]);
    }
    let bb = &w.buildings[a];
    assert_eq!((bb.progress, bb.inv, bb.out), (progress, inv, out), "rien ne bouge en pause");
    assert!(bb.working, "le cycle en cours est gardé");
    // il ne prend plus d'entrées : il lui manque des plaques, et pourtant il les refuse
    w.buildings[a].inv[0] = 0;
    assert!(!accepts(&w, a, IRON_PLATE), "refuse les ingrédients");
    // reprise : le cycle reprend là où il en était
    pause(&mut w, false, &[a]);
    assert!(!paused(&w.buildings[a]));
    assert!(accepts(&w, a, IRON_PLATE));
    for _ in 0..600 {
        w.step(&[]);
        if w.buildings[a].out > out {
            break;
        }
    }
    assert!(w.buildings[a].out > out, "la fabrication s'est terminée après la reprise");
}

/// L'ordre vaut pour toute une sélection, et seulement pour nos bâtiments de production.
#[test]
fn pause_order_applies_to_a_selection() {
    let mut w = world();
    let a = busy_assembler(&mut w, 100);
    let b = busy_assembler(&mut w, 104);
    let f = put(&mut w, 0, B_LAND_FACTORY, 110, 100);
    let pylon = put(&mut w, 0, B_PYLON, 120, 100);
    let foreign = put(&mut w, 1, B_ASSEMBLER1, 100, 110);
    pause(&mut w, true, &[a, b, f, pylon]);
    assert!(paused(&w.buildings[a]) && paused(&w.buildings[b]) && paused(&w.buildings[f]));
    assert!(w.buildings[pylon].enabled, "un relais ne se met pas en pause");
    // le bâtiment d'un autre joueur n'est pas touché
    let r = w.building_ref(foreign) as i32;
    w.step(&[6, O_SET_PAUSE, 0, 1, 1, r]);
    assert!(!paused(&w.buildings[foreign]));
    // reprendre deux fois ne fait rien de plus
    pause(&mut w, false, &[a, b, f]);
    pause(&mut w, false, &[a, b, f]);
    assert!(!paused(&w.buildings[a]) && !paused(&w.buildings[b]) && !paused(&w.buildings[f]));
}

/// Une usine d'unités en pause garde l'unité en cours ; ses drones ne vont plus chercher de composants.
#[test]
fn paused_factory_holds_its_unit() {
    let mut w = world();
    let f = put(&mut w, 0, B_LAND_FACTORY, 100, 100);
    let kind = U_LIGHT_TANK;
    for &(it, n) in udef(kind).cost {
        crate::buildings::factory_put(&mut w.buildings[f], it, n * 2);
    }
    let r = w.building_ref(f) as i32;
    w.step(&[5, crate::orders::O_FACTORY_QUEUE, 0, r, kind as i32, 1]);
    for _ in 0..5 {
        w.step(&[]);
    }
    assert!(w.buildings[f].working, "l'usine fabrique");
    let units = w.players[0].unit_count;
    pause(&mut w, true, &[f]);
    let progress = w.buildings[f].progress;
    let stash = w.buildings[f].stash.clone();
    for _ in 0..(crate::data::factory_ticks(kind) + 200) {
        w.step(&[]);
    }
    assert_eq!(w.buildings[f].progress, progress);
    assert_eq!(w.buildings[f].stash, stash);
    assert_eq!(w.players[0].unit_count, units, "aucune unité ne sort");
    assert!(w.carriers.iter().all(|c| !c.alive || c.a != r as u32), "aucun drone de l'usine en vol");
    pause(&mut w, false, &[f]);
    for _ in 0..(crate::data::factory_ticks(kind) + 200) {
        w.step(&[]);
    }
    assert_eq!(w.players[0].unit_count, units + 1, "l'unité sort après la reprise");
}

/// Un extracteur en pause ne sort plus de minerai.
#[test]
fn paused_extractor_stops() {
    let mut w = world();
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(100 + dx, 100 + dy);
            w.map.deposit[i] = IRON_ORE;
        }
    }
    w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x: 100, y: 100, purity: 0 });
    let e = put(&mut w, 0, B_EXTRACTOR, 100, 100);
    for _ in 0..50 {
        w.step(&[]);
    }
    pause(&mut w, true, &[e]);
    let (progress, out) = (w.buildings[e].progress, w.buildings[e].out);
    for _ in 0..1200 {
        w.step(&[]);
    }
    assert_eq!((w.buildings[e].progress, w.buildings[e].out), (progress, out));
    pause(&mut w, false, &[e]);
    for _ in 0..1200 {
        w.step(&[]);
    }
    assert!(w.buildings[e].out > out || w.buildings[e].progress != progress, "il reprend");
}

/// Une machine en pause ne partage plus avec ses jumelles.
#[test]
fn paused_machine_has_no_twins() {
    let mut w = world();
    let a = busy_assembler(&mut w, 100);
    let b = busy_assembler(&mut w, 102);
    assert_eq!(twins_of(&w, a), vec![b]);
    pause(&mut w, true, &[b]);
    assert!(twins_of(&w, a).is_empty() && twins_of(&w, b).is_empty());
    pause(&mut w, false, &[b]);
    assert_eq!(twins_of(&w, a), vec![b]);
}

/// La pause est dans la sauvegarde et dans le hash ; la partie restaurée reprend de la même façon.
#[test]
fn pause_survives_save_and_restore() {
    let mut w = world();
    let a = busy_assembler(&mut w, 100);
    pause(&mut w, true, &[a]);
    let h = w.hash();
    let mut back = crate::save::restore(&crate::save::snapshot(&w)).expect("restauration");
    assert!(paused(&back.buildings[a]));
    assert_eq!(back.buildings[a].progress, w.buildings[a].progress);
    assert_eq!(back.hash(), h);
    pause(&mut w, false, &[a]);
    pause(&mut back, false, &[a]);
    for _ in 0..400 {
        w.step(&[]);
        back.step(&[]);
    }
    assert_eq!(back.hash(), w.hash());
    // l'état de pause compte dans le hash
    let h = w.hash();
    w.buildings[a].enabled = false;
    assert_ne!(w.hash(), h);
    let _ = TILE;
}
