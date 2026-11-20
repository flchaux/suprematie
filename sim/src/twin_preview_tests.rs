//! Tests : aperçu de pose des machines jumelles (liseré vert) et recette prise à la fin du chantier.

use crate::buildings::{complete_building, place_building, twins_of};
use crate::data::*;
use crate::twins::{twin_bit, twin_preview};
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

fn put(w: &mut World, owner: u8, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, owner, kind, x, y, 0).expect("pose possible");
    complete_building(w, b);
    b
}

fn recipe(key: &str) -> u8 {
    RECIPES.iter().position(|r| r.key == key).unwrap() as u8
}

/// Côté entier `side` d'un bâtiment 2 × 2.
fn side2(side: usize) -> i32 {
    twin_bit(side, 0) | twin_bit(side, 1)
}

/// Un aperçu collé à une fonderie de fer : liseré sur le seul côté commun ; une fonderie sans recette,
/// une fonderie d'un autre joueur ou un assembleur ne donnent rien.
#[test]
fn preview_marks_sides_next_to_a_twin() {
    let mut w = world(&[0, 1]);
    flatten(&mut w, 85, 85, 130, 130);
    let a = put(&mut w, 0, B_FURNACE, 100, 100);
    w.buildings[a].recipe = recipe("iron_plate");
    put(&mut w, 0, B_FURNACE, 100, 104); // sans recette
    put(&mut w, 1, B_FURNACE, 104, 98); // autre joueur
    put(&mut w, 0, B_ASSEMBLER1, 106, 100); // autre type
    // à l'est de la fonderie de fer : côté ouest (2) ; décalé d'une case : une seule case collée
    // emplacements interrogés un par un (ceux d'une même pose se transmettent la recette)
    let r: Vec<i32> = [(102, 100, 0), (102, 101, 0), (104, 100, 0), (100, 102, 0)].iter().map(|&c| twin_preview(&w, 0, B_FURNACE, &[c])[0]).collect();
    assert_eq!(r[0], side2(2));
    assert_eq!(r[1], twin_bit(2, 0));
    assert_eq!(r[2], 0, "pas collé à la fonderie de fer");
    // entre la fonderie de fer (au nord) et celle sans recette (au sud) : seul le nord
    assert_eq!(r[3], side2(3));
    // la pose est impossible sur un bâtiment : rien
    assert_eq!(twin_preview(&w, 0, B_FURNACE, &[(101, 100, 0)]), vec![0]);
    // l'assembleur ne jumelle pas avec une fonderie
    assert_eq!(twin_preview(&w, 0, B_ASSEMBLER1, &[(102, 100, 0)]), vec![0]);
}

/// Une rangée posée d'un coup : la recette passe d'emplacement en emplacement, chaque côté commun
/// est marqué des deux côtés ; la rotation ne change rien pour une machine carrée.
#[test]
fn preview_row_chains_from_a_running_machine() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 130, 130);
    let a = put(&mut w, 0, B_FURNACE, 100, 100);
    w.buildings[a].recipe = recipe("iron_plate");
    for dir in 0..4u8 {
        let row = [(102, 100, dir), (104, 100, dir), (106, 100, dir)];
        let r = twin_preview(&w, 0, B_FURNACE, &row);
        assert_eq!(r, vec![side2(2) | side2(0), side2(2) | side2(0), side2(2)], "direction {dir}");
    }
    // rangée isolée : aucune recette à prendre, pas de liseré
    let r = twin_preview(&w, 0, B_FURNACE, &[(110, 110, 0), (112, 110, 0)]);
    assert_eq!(r, vec![0, 0]);
    // laboratoires : toujours jumeaux entre eux
    let r = twin_preview(&w, 0, B_LAB, &[(110, 110, 0), (110, 112, 0)]);
    assert_eq!(r, vec![side2(1), side2(3)]);
}

/// La simulation tient la promesse de l'aperçu : une rangée posée à côté d'une fonderie de fer prend sa
/// recette à la fin des chantiers, quel que soit l'ordre, et toute la rangée est jumelée.
#[test]
fn finished_row_adopts_the_twin_recipe() {
    let mut w = world(&[0]);
    flatten(&mut w, 85, 85, 130, 130);
    let a = put(&mut w, 0, B_FURNACE, 100, 100);
    let iron = recipe("iron_plate");
    w.buildings[a].recipe = iron;
    w.buildings[a].repeat = true;
    let preview = twin_preview(&w, 0, B_FURNACE, &[(102, 100, 0), (104, 100, 0), (106, 100, 0)]);
    // chantiers posés, terminés du plus loin au plus proche
    let sites: Vec<usize> = [102, 104, 106].iter().map(|&x| place_building(&mut w, 0, B_FURNACE, x, 100, 0).unwrap()).collect();
    for &s in sites.iter().rev() {
        complete_building(&mut w, s);
    }
    for &s in &sites {
        assert_eq!(w.buildings[s].recipe, iron);
        assert!(w.buildings[s].repeat, "le verrou de recette suit");
    }
    assert_eq!(twins_of(&w, sites[0]), vec![a, sites[1]]);
    assert_eq!(twins_of(&w, sites[2]), vec![sites[1]]);
    // ce que montrait l'aperçu : chaque côté marqué est bien collé à une jumelle
    assert_eq!(preview, vec![side2(2) | side2(0), side2(2) | side2(0), side2(2)]);
    // une fonderie isolée reste sans recette
    let lone = put(&mut w, 0, B_FURNACE, 110, 110);
    assert_eq!(w.buildings[lone].recipe, RECIPE_NONE);
}
