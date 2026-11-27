//! Tests des chenillards attelés à l'Arche (voir convoi.rs, « Chenillards attelés ») : attelage derrière les remorques,
//! suivi à travers un obstacle, ralentissement de l'Arche, dételage (ordre, Arche détruite ou embarquée, chenillard
//! détruit), neuf au plus, sauvegarde et déterminisme.

use crate::ameliorations::*;
use crate::convoi::*;
use crate::data::*;
use crate::drones::put;
use crate::fixed::{dist, TILE};
use crate::orders::*;
use crate::world::*;

fn params() -> Vec<i32> {
    vec![4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_TRANSH as i32, RACE_INDUS as i32]
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

/// Terrain plat et vide de (x0, y0) à (x1, y1) (cases).
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

/// L'Arche du joueur 0 au milieu d'un terrain plat, tournée vers l'est, soute garnie, toutes les recherches de sa race.
fn game() -> (World, usize) {
    let mut w = World::new(&params());
    flatten(&mut w, 180, 180, 330, 330);
    let s = w.unit(w.players[0].commander).unwrap();
    w.units.x[s] = 255 * TILE;
    w.units.y[s] = 255 * TILE;
    w.units.px[s] = w.units.x[s];
    w.units.py[s] = w.units.y[s];
    w.units.facing[s] = 0;
    for it in 1..=ENERGY_CELL {
        put(&mut w.units.cold[s].hold, it, 500);
    }
    w.players[0].purse[RELEVES as usize] = 1000;
    for (t, d) in TECHS.iter().enumerate() {
        if d.race == RACE_TRANSH {
            w.players[0].set_tech(t as u8);
        }
    }
    steps(&mut w, 1);
    (w, s)
}

fn id(w: &World, s: usize) -> i32 {
    w.unit_id(s) as i32
}

fn spawn(w: &mut World, kind: u16, x: i32, y: i32) -> usize {
    let u = w.spawn_unit(kind, 0, x * TILE, y * TILE);
    slot_of(u)
}

fn go(w: &mut World, s: usize, x: i32, y: i32) {
    let u = id(w, s);
    order(w, 0, O_MOVE, &[0, x * TILE, y * TILE, 1, u, x * TILE, y * TILE]);
}

/// Ordre « Atteler à l'Arche » pour ces chenillards.
fn tow(w: &mut World, ark: usize, list: &[usize], queue: bool) {
    let mut a = vec![queue as i32, id(w, ark), list.len() as i32];
    a.extend(list.iter().map(|&s| id(w, s)));
    order(w, 0, O_TOW, &a);
}

/// Chenillards attelés à la première Arche, dans l'ordre du convoi.
fn towed(w: &World, i: usize) -> Vec<usize> {
    w.arks[i].tow.iter().filter_map(|&t| w.unit(t)).collect()
}

/// Trois chenillards à l'ouest de l'Arche, attelés un à un (le plus proche d'abord).
fn three_hitched(w: &mut World, s: usize) -> [usize; 3] {
    let c = [spawn(w, U_CH_FURNACE, 246, 252), spawn(w, U_CH_LAB, 243, 258), spawn(w, U_CH_HOLD, 240, 252)];
    for &u in &c {
        tow(w, s, &[u], false);
        for _ in 0..600 {
            steps(w, 1);
            if towed_by(w, u).is_some() {
                break;
            }
        }
    }
    assert_eq!(towed(w, 0), c, "les trois attelés, dans l'ordre");
    c
}

#[test]
fn chenillards_hitch_behind_the_trailers_in_the_order_they_arrive() {
    let (mut w, s) = game();
    let ark = id(&w, s);
    order(&mut w, 0, O_MOD_INSTALL, &[M_RADAR as i32, 1, ark]);
    let t = install_ticks(&w, 0, M_RADAR) as u32;
    steps(&mut w, t + 4);
    let car = car_unit(&w, 0, 0).expect("une remorque");
    let c = three_hitched(&mut w, s);
    // rang 1, 2, 3, et chacun garde son ordre d'attelage
    for (k, &u) in c.iter().enumerate() {
        assert_eq!(towed_by(&w, u), Some((0, k)));
        assert!(matches!(w.units.cold[u].orders[..], [Order::Tow { ark: a }] if a == ark as u32));
    }
    // en file derrière la remorque, chacun à la longueur de son timon du crochet du véhicule qui le précède
    steps(&mut w, 40);
    let mut prev = (car, CAR_BACK);
    for &u in &c {
        let (p, hook) = prev;
        let f = w.units.facing[p];
        let hx = w.units.x[p] - (w.trig.cos(f) as i64 * hook as i64 / 16384) as i32;
        let hy = w.units.y[p] - (w.trig.sin(f) as i64 * hook as i64 / 16384) as i32;
        let d = dist(w.units.x[u], w.units.y[u], hx, hy);
        assert!((d - tow_lengths(w.units.kind[u]).0).abs() < 16, "timon de {u} : {d}");
        prev = (u, tow_lengths(w.units.kind[u]).1);
    }
    // l'Arche part vers l'est : ils la suivent sans rien recevoir
    go(&mut w, s, 290, 255);
    steps(&mut w, 400);
    let mut x = w.units.x[car];
    for &u in &c {
        assert!(w.units.x[u] < x && w.units.x[u] > 262 * TILE, "{u} suit le convoi");
        x = w.units.x[u];
    }
}

#[test]
fn hitched_chenillards_take_the_arks_path_through_a_gap() {
    let (mut w, s) = game();
    // convoi complet : quatre remorques et neuf chenillards (la trace de l'Arche s'allonge pour eux)
    let ark = id(&w, s);
    for m in [M_TURRETS1, M_TURRETS2, M_TURRETS3, M_RADAR] {
        order(&mut w, 0, O_MOD_INSTALL, &[m as i32, 1, ark]);
        let t = install_ticks(&w, 0, m) as u32;
        steps(&mut w, t + 1);
    }
    steps(&mut w, 2);
    let mut c = three_hitched(&mut w, s).to_vec();
    let kinds = [U_CH_ASSEMBLER, U_CH_WORKSHOP, U_CH_DRILL, U_CH_GENERATOR, U_CH_BASTION, U_CH_REFINERY];
    let more: Vec<usize> = kinds.iter().enumerate().map(|(k, &kind)| spawn(&mut w, kind, 228 - 4 * (k as i32 % 3), 250 + 6 * (k as i32 / 3))).collect();
    for &u in &more {
        tow(&mut w, s, &[u], false);
        steps(&mut w, 500);
    }
    c.extend(more);
    assert_eq!(towed(&w, 0), c);
    let mut chain: Vec<usize> = (0..4).filter_map(|k| car_unit(&w, 0, k)).collect();
    assert_eq!(chain.len(), 4);
    chain.extend(&c);
    let c = chain;
    // un mur percé d'un passage de trois cases
    for x in 220..300 {
        if !(254..257).contains(&x) {
            let i = w.map.idx(x, 270);
            w.map.cliff[i] = 1;
            w.map.update_pass(x, 270);
        }
    }
    let m = crate::units::pass_mask(Layer::Hover);
    for (x, y) in [(255, 300), (295, 300), (255, 300), (255, 245), (215, 245)] {
        go(&mut w, s, x, y);
        for _ in 0..2500 {
            steps(&mut w, 1);
            let mut prev = (w.units.x[s], w.units.y[s]);
            for (k, &u) in c.iter().enumerate() {
                let (ux, uy) = (w.units.x[u], w.units.y[u]);
                assert!(w.map.passable(ux / TILE, uy / TILE, m), "chenillard {k} sur un obstacle en ({}, {}) au tick {}", ux / TILE, uy / TILE, w.tick);
                assert!(dist(ux, uy, prev.0, prev.1) < 4 * TILE, "chenillard {k} décroché au tick {}", w.tick);
                prev = (ux, uy);
            }
            if w.units.cold[s].orders.is_empty() {
                break;
            }
        }
        assert!(dist(w.units.x[s], w.units.y[s], x * TILE, y * TILE) < 3 * TILE, "l'Arche arrive en ({x}, {y})");
        assert_eq!(towed(&w, 0), c[4..], "toujours attelés");
    }
}

#[test]
fn each_hitched_chenillard_slows_the_ark_by_three_percent() {
    let (mut w, s) = game();
    let v = speed(&w, s);
    three_hitched(&mut w, s);
    assert_eq!(speed(&w, s), v * 91 / 100);
    // et elle avance bien moins vite : 30 s de route
    let x0 = w.units.x[s];
    go(&mut w, s, 320, 255);
    steps(&mut w, 600);
    let towing = w.units.x[s] - x0;
    let (mut w2, s2) = game();
    go(&mut w2, s2, 320, 255);
    steps(&mut w2, 600);
    let free = w2.units.x[s2] - x0;
    assert!(towing < free * 95 / 100 && towing > free * 85 / 100, "{towing} contre {free}");
}

#[test]
fn a_move_deploy_or_queued_order_unhitches_and_those_behind_move_up() {
    let (mut w, s) = game();
    let [a, b, c] = three_hitched(&mut w, s);
    let d = spawn(&mut w, U_CH_GENERATOR, 246, 262);
    tow(&mut w, s, &[d], false);
    steps(&mut w, 600);
    assert_eq!(towed(&w, 0), [a, b, c, d]);
    // déplacement : b s'en va, c et d remontent d'un cran
    go(&mut w, b, 250, 230);
    steps(&mut w, 2);
    assert_eq!(towed(&w, 0), [a, c, d]);
    assert_eq!((towed_by(&w, b), towed_by(&w, c)), (None, Some((0, 1))));
    steps(&mut w, 200);
    assert!(dist(w.units.x[b], w.units.y[b], 250 * TILE, 230 * TILE) < 12 * TILE, "il roule de son côté");
    let f = w.units.facing[a];
    let hook = tow_lengths(w.units.kind[a]).1 as i64;
    let (hx, hy) = (w.units.x[a] - (w.trig.cos(f) as i64 * hook / 16384) as i32, w.units.y[a] - (w.trig.sin(f) as i64 * hook / 16384) as i32);
    assert!((dist(w.units.x[c], w.units.y[c], hx, hy) - tow_lengths(w.units.kind[c]).0).abs() < 40, "c a pris la place de b");
    // « Déployer » : il se dételle et se déploie
    let ia = id(&w, a);
    order(&mut w, 0, O_DEPLOY, &[1, ia]);
    steps(&mut w, 2);
    assert_eq!(towed(&w, 0), [c, d]);
    assert_eq!(w.units.cold[a].pack, crate::transhumants::PACK_DEPLOYING);
    // un ordre en file : il part dès qu'on le lui donne ; « Dételer » (arrêt) : il reste où il est
    let (x, y) = (260 * TILE, 280 * TILE);
    let (ic, id_d) = (id(&w, c), id(&w, d));
    order(&mut w, 0, O_MOVE, &[1, x, y, 1, ic, x, y]);
    order(&mut w, 0, O_STOP, &[1, id_d]);
    steps(&mut w, 2);
    assert!(towed(&w, 0).is_empty());
    assert!(matches!(w.units.cold[c].orders[..], [Order::Move { .. }]) && w.units.cold[d].orders.is_empty());
    assert_eq!(speed(&w, s), unit_speed(U_ARK), "plus rien ne la ralentit");
}

#[test]
fn a_destroyed_ark_unhitches_all_and_a_destroyed_chenillard_frees_its_place() {
    let (mut w, s) = game();
    let [a, b, c] = three_hitched(&mut w, s);
    // un chenillard du milieu détruit : le suivant remonte
    crate::combat::damage_unit(&mut w, b, 1_000_000, 1);
    steps(&mut w, 2);
    assert_eq!(towed(&w, 0), [a, c]);
    assert_eq!(towed_by(&w, c), Some((0, 1)));
    // l'Arche embarquée : tous dételés
    w.units.cold[s].carried_by = w.unit_id(s);
    steps(&mut w, 2);
    assert!(w.arks[0].tow.is_empty() && [a, c].iter().all(|&u| w.units.cold[u].orders.is_empty()));
    w.units.cold[s].carried_by = NONE;
    // une seconde Arche qui disparaît (une Arche détruite élimine son joueur ; ici, seule l'Arche s'en va)
    let id2 = w.spawn_unit(U_ARK, 0, 255 * TILE, 290 * TILE);
    let s2 = slot_of(id2);
    w.units.facing[s2] = 0;
    let e = spawn(&mut w, U_CH_HOLD, 248, 290);
    tow(&mut w, s2, &[e], false);
    steps(&mut w, 400);
    let i2 = ark_of(&w, s2).unwrap();
    assert_eq!(towed(&w, i2), [e]);
    crate::transhumants::vanish(&mut w, s2);
    steps(&mut w, 3);
    assert!(ark_of(&w, s2).is_none());
    assert!(towed_by(&w, e).is_none() && w.units.cold[e].orders.is_empty(), "dételé, il s'arrête");
    // une Arche détruite emporte son joueur : ses chenillards attelés avec
    crate::combat::damage_unit(&mut w, s, 1_000_000, 1);
    steps(&mut w, 3);
    assert!(w.arks.is_empty() && !w.units.alive[a] && !w.units.alive[e]);
}

#[test]
fn nine_chenillards_at_most() {
    let (mut w, s) = game();
    let list: Vec<usize> = (0..11).map(|k| spawn(&mut w, U_CH_FURNACE, 225 + 3 * (k % 4), 245 + 5 * (k / 4))).collect();
    tow(&mut w, s, &list, false);
    steps(&mut w, 2000);
    assert_eq!(w.arks[0].tow.len(), TOW_MAX);
    let left: Vec<usize> = list.iter().copied().filter(|&u| towed_by(&w, u).is_none()).collect();
    assert_eq!(left.len(), 2);
    assert!(left.iter().all(|&u| w.units.cold[u].orders.is_empty()), "les deux de trop renoncent");
    // un ordre de plus est refusé
    tow(&mut w, s, &left, false);
    assert!(left.iter().all(|&u| w.units.cold[u].orders.is_empty()));
    assert_eq!(speed(&w, s), unit_speed(U_ARK) * 73 / 100);
}

#[test]
fn hitched_chenillards_survive_a_save_and_old_saves_still_load() {
    let (mut w, s) = game();
    let old = crate::save::write(&w, 12, &[]);
    let w12 = crate::save::restore(&old).expect("version 12");
    assert!(w12.arks[0].tow.is_empty());
    let c = three_hitched(&mut w, s);
    go(&mut w, s, 280, 262);
    steps(&mut w, 60);
    let mut w2 = crate::save::restore(&crate::save::snapshot(&w)).expect("sauvegarde lue");
    assert_eq!(w.hash(), w2.hash());
    assert_eq!(towed(&w2, 0), c);
    for _ in 0..400 {
        assert_eq!(w.step(&[]), w2.step(&[]), "même suite de partie");
    }
    assert_eq!(towed(&w2, 0), c);
}

#[test]
fn hitching_is_deterministic() {
    let run = || {
        let (mut w, s) = game();
        let list: Vec<usize> = (0..5).map(|k| spawn(&mut w, U_CH_LAB, 232 + 4 * k, 248 + 3 * (k % 2))).collect();
        tow(&mut w, s, &list, false);
        steps(&mut w, 300);
        go(&mut w, s, 290, 280);
        steps(&mut w, 500);
        go(&mut w, list[2], 240, 240);
        steps(&mut w, 300);
        (w.hash(), w.arks[0].tow.clone())
    };
    let (h, t) = run();
    assert_eq!(t.len(), 4);
    assert_eq!((h, t), run());
}
