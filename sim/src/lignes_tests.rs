//! Tests des lignes du générateur nomade (voir docs/spec/races.md, « Poteaux relais » et « Améliorations ») : trois
//! poteaux relais de base, six avec Lignes I, douze avec Lignes II (qui demande Lignes I), un troisième emplacement à
//! côté du réservoir, poteaux en trop gardés, sauvegardes avec les anciens « Câbles longs ».

use crate::ameliorations::*;
use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::drones::put;
use crate::fixed::TILE;
use crate::orders::*;
use crate::world::*;

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

/// Partie d'un Transhumant (joueur 0) sur un terrain plat : son Arche (soute garnie, relevés) et un générateur nomade
/// déployé à l'écart ; recherches des modules si `techs`. Renvoie le générateur.
fn gen_game(techs: bool) -> (World, usize) {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_TRANSH as i32, RACE_INDUS as i32]);
    w.map.spots.retain(|s| !(s.x >= 198 && s.x <= 310 && s.y >= 198 && s.y <= 310));
    for y in 200..310 {
        for x in 200..310 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.wear.resize(w.map.spots.len(), 0);
    let s = w.unit(w.players[0].commander).unwrap();
    w.units.x[s] = 255 * TILE;
    w.units.y[s] = 255 * TILE;
    w.units.px[s] = w.units.x[s];
    w.units.py[s] = w.units.y[s];
    for it in 1..=ENERGY_CELL {
        put(&mut w.units.cold[s].hold, it, 500);
    }
    w.players[0].purse[RELEVES as usize] = 1000;
    if techs {
        w.players[0].set_tech(T_T_FITTINGS);
        w.players[0].set_tech(T_T_FITTINGS2);
    }
    let g = place_building(&mut w, 0, B_T_GENERATOR, 270, 272, 0).expect("générateur");
    complete_building(&mut w, g);
    steps(&mut w, 1);
    (w, g)
}

/// Quinze cases à portée du générateur (13 cases de centre à centre), en deux rangées.
fn spots(w: &World, g: usize) -> Vec<(i32, i32)> {
    let (gx, gy) = (w.buildings[g].x, w.buildings[g].y);
    [-6, -4, -2, 0, 2, 4, 6, 8].iter().flat_map(|&dx| [(gx + dx, gy - 4), (gx + dx, gy + 5)]).take(15).collect()
}

/// Le générateur plante un poteau sur chaque case de `at` (ordre du joueur) ; renvoie ses poteaux.
fn plant_all(w: &mut World, g: usize, at: &[(i32, i32)]) -> usize {
    let r = w.building_ref(g) as i32;
    for &(x, y) in at {
        order(w, 0, O_PLANT_POLE, &[r, x, y]);
    }
    crate::transhumants::poles_of(w, g).len()
}

/// Installe une amélioration par l'ordre du joueur, jusqu'au bout.
fn fit_now(w: &mut World, g: usize, m: u8) {
    let r = w.building_ref(g) as i32;
    order(w, 0, O_MOD_INSTALL, &[m as i32, 1, r]);
    assert_eq!(w.buildings[g].mod_job, m, "installation commencée");
    let t = install_ticks(w, 0, m) as u32;
    steps(w, t + 1);
    assert!(has(w.buildings[g].mods, m), "installée");
}

#[test]
fn a_generator_plants_three_poles_without_lines() {
    let (mut w, g) = gen_game(false);
    assert_eq!(poles_max(&w.buildings[g]), 3);
    let sp = spots(&w, g);
    assert_eq!(plant_all(&mut w, g, &sp[..3]), 3);
    // le quatrième est refusé, quelle que soit la case
    assert_eq!(plant_all(&mut w, g, &sp[3..]), 3, "quatrième poteau refusé");
}

#[test]
fn lines_one_then_two_give_six_then_twelve_poles() {
    let (mut w, g) = gen_game(true);
    let sp = spots(&w, g);
    assert_eq!(plant_all(&mut w, g, &sp[..3]), 3);
    // Lignes II demande Lignes I : refusée, rien de payé
    assert_eq!(blocked(&w, Host::B(g), M_GEN_LINES2), 3);
    let rel = w.players[0].purse[RELEVES as usize];
    let r = w.building_ref(g) as i32;
    order(&mut w, 0, O_MOD_INSTALL, &[M_GEN_LINES2 as i32, 1, r]);
    assert_eq!((w.buildings[g].mod_job, w.players[0].purse[RELEVES as usize]), (0, rel), "Lignes II sans Lignes I refusée");
    // Lignes I : six poteaux
    fit_now(&mut w, g, M_GEN_LINES1);
    assert_eq!(poles_max(&w.buildings[g]), 6);
    assert_eq!(plant_all(&mut w, g, &sp[3..]), 6, "six poteaux avec Lignes I, pas un de plus");
    // Lignes II remplace Lignes I : douze poteaux
    assert_eq!(blocked(&w, Host::B(g), M_GEN_LINES2), 0);
    fit_now(&mut w, g, M_GEN_LINES2);
    assert_eq!((at(w.buildings[g].mods, SLOT_LINES), poles_max(&w.buildings[g])), (M_GEN_LINES2, 12));
    assert!(has_rank(w.buildings[g].mods, M_GEN_LINES1) && !has(w.buildings[g].mods, M_GEN_LINES1));
    assert_eq!(plant_all(&mut w, g, &sp[6..]), 12, "douze poteaux avec Lignes II, pas un de plus");
}

#[test]
fn lines_have_their_own_slot_beside_the_tank_and_follow_the_module() {
    let (mut w, g) = gen_game(true);
    assert_eq!(slots(U_CH_GENERATOR).len(), 3);
    assert_eq!(slots(U_CH_FURNACE).len(), 2, "les autres modules gardent deux emplacements");
    fit_now(&mut w, g, M_GEN_BIG);
    fit_now(&mut w, g, M_GEN_TANK);
    fit_now(&mut w, g, M_GEN_LINES1);
    let mods = w.buildings[g].mods;
    assert_eq!((at(mods, 0), at(mods, SLOT_SPEC), at(mods, SLOT_LINES)), (M_GEN_BIG, M_GEN_TANK, M_GEN_LINES1), "rien de remplacé");
    // repli puis déploiement : les trois restent
    let r = w.building_ref(g) as i32;
    order(&mut w, 0, O_PACK, &[1, r]);
    let c = (0..w.units.alive.len()).find(|&u| w.units.alive[u] && w.units.kind[u] == U_CH_GENERATOR).expect("chenillard");
    assert_eq!(w.units.cold[c].mods, mods, "sur le chenillard");
    steps(&mut w, crate::transhumants::FOLD_TICKS as u32 + 2);
    let cid = w.unit_id(c) as i32;
    order(&mut w, 0, O_DEPLOY, &[1, cid]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 3);
    let g2 = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_T_GENERATOR).expect("redéployé");
    assert_eq!(w.buildings[g2].mods, mods, "redéployé avec ses trois améliorations");
    assert_eq!(poles_max(&w.buildings[g2]), 6);
}

#[test]
fn a_generator_keeps_its_extra_poles_but_plants_no_more() {
    let (mut w, g) = gen_game(true);
    fit_now(&mut w, g, M_GEN_LINES1);
    let sp = spots(&w, g);
    assert_eq!(plant_all(&mut w, g, &sp[..6]), 6);
    // amélioration perdue : ses six poteaux restent, plantés et reliés
    w.buildings[g].mods = 0;
    steps(&mut w, 20);
    assert_eq!(crate::transhumants::poles_of(&w, g).len(), 6, "poteaux en trop gardés");
    assert_eq!(plant_all(&mut w, g, &sp[6..]), 6, "plus de poteau au-delà de la limite");
    // il en perd : il replante jusqu'à sa limite seulement
    for p in crate::transhumants::poles_of(&w, g).into_iter().take(4) {
        crate::buildings::remove_building(&mut w, p, true);
    }
    assert_eq!(plant_all(&mut w, g, &sp[6..]), 3);
}

#[test]
fn a_save_with_long_cables_reads_back_with_lines_two() {
    let (mut w, g) = gen_game(false);
    // ancien état : « Câbles longs » (indice 90) en spécialité, sur le module et sur un chenillard replié
    w.buildings[g].mods = M_GEN_BIG as u64 | (M_GEN_LINES1 as u64) << 8;
    let cid = w.spawn_unit(U_CH_GENERATOR, 0, 262 * TILE, 262 * TILE);
    let c = w.unit(cid).unwrap();
    w.units.cold[c].mods = (M_GEN_LINES1 as u64) << 8;
    // un générateur au réservoir triplé ne change pas
    let t = place_building(&mut w, 0, B_T_GENERATOR, 240, 240, 0).unwrap();
    complete_building(&mut w, t);
    w.buildings[t].mods = (M_GEN_TANK as u64) << 8;
    // (relu d'une sauvegarde au format 13, d'avant l'eau : la conversion vise les sauvegardes jusqu'à ce format)
    let w2 = crate::save::restore(&crate::save::write(&w, 13, &[])).expect("restauration");
    let m = w2.buildings[g].mods;
    assert_eq!((at(m, 0), at(m, SLOT_SPEC), at(m, SLOT_LINES)), (M_GEN_BIG, 0, M_GEN_LINES2));
    assert_eq!(poles_max(&w2.buildings[g]), 12);
    assert_eq!(w2.units.cold[c].mods, (M_GEN_LINES2 as u64) << 16, "chenillard aussi");
    assert_eq!(w2.buildings[t].mods, (M_GEN_TANK as u64) << 8);
    // relue une seconde fois : rien ne bouge
    let w3 = crate::save::restore(&crate::save::snapshot(&w2)).expect("restauration");
    assert_eq!(w3.hash(), w2.hash());
}
