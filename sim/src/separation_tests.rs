//! Tests : distance tolérée entre unités (units::update_units) : plus courte entre alliés, surtout en
//! marche ; pleine face à l'ennemi et pour les très grosses unités.

use crate::data::*;
use crate::fixed::{dist, TILE};
use crate::orders::{apply_orders, O_MOVE};
use crate::units::{SEP_MARCH, SEP_REST};
use crate::world::*;

fn world() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 1, 100, 100]);
    w.infinite_grid = true;
    let (x0, y0, x1, y1) = (60, 60, 200, 200);
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
    w
}

/// Deux unités posées l'une sur l'autre (à un quart de case) à l'arrêt, puis `ticks` ticks : distance
/// finale en pour cent de la somme de leurs rayons.
fn rest(w: &mut World, kind: u16, owners: (u8, u8), ticks: u32) -> i32 {
    let (x, y) = (120 * TILE, 120 * TILE);
    let a = w.spawn_unit(kind, owners.0, x, y);
    let b = w.spawn_unit(kind, owners.1, x + TILE / 4, y);
    for _ in 0..ticks {
        w.step(&[]);
    }
    pct(w, a, b)
}

fn pct(w: &World, a: u32, b: u32) -> i32 {
    let (a, b) = (w.unit(a).unwrap(), w.unit(b).unwrap());
    let d = dist(w.units.x[a], w.units.y[a], w.units.x[b], w.units.y[b]);
    d * 100 / (udef(w.units.kind[a]).radius + udef(w.units.kind[b]).radius)
}

/// Déplacement simple, chacun gardant son écart au centre du groupe (comme le client).
fn go(w: &mut World, ids: &[u32], gx: i32, gy: i32) {
    let n = ids.len() as i32;
    let ss: Vec<usize> = ids.iter().map(|&id| w.unit(id).unwrap()).collect();
    let cx = ss.iter().map(|&s| w.units.x[s]).sum::<i32>() / n;
    let cy = ss.iter().map(|&s| w.units.y[s]).sum::<i32>() / n;
    let mut cmd = vec![O_MOVE, w.units.owner[ss[0]] as i32, 0, gx * TILE, gy * TILE, n];
    for (k, &s) in ss.iter().enumerate() {
        cmd.extend_from_slice(&[ids[k] as i32, gx * TILE + w.units.x[s] - cx, gy * TILE + w.units.y[s] - cy]);
    }
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(w, &msg);
}

fn done(w: &World, ids: &[u32]) -> bool {
    ids.iter().all(|&id| w.units.cold[w.unit(id).unwrap()].orders.is_empty())
}

fn block(w: &mut World, x: i32, y: i32, n: i32) -> Vec<u32> {
    (0..n).map(|i| w.spawn_unit(U_LIGHT_TANK, 0, x * TILE + (i % 8) * 290, y * TILE + (i / 8) * 290)).collect()
}

#[test]
fn allies_at_rest_stand_slightly_closer_than_their_radii() {
    let p = rest(&mut world(), U_LIGHT_TANK, (0, 0), 100);
    assert!((SEP_REST - 2..=SEP_REST + 2).contains(&p), "alliés à l'arrêt à {p} %");
}

#[test]
fn enemies_keep_their_full_distance() {
    // sondes sans arme : elles ne se tirent pas dessus
    let sonde = UNITS.iter().position(|u| u.key == "sonde").unwrap() as u16;
    let p = rest(&mut world(), sonde, (0, 1), 100);
    assert!(p >= 98, "ennemis à {p} %");
    let p = rest(&mut world(), sonde, (0, 0), 100);
    assert!((SEP_REST - 2..=SEP_REST + 2).contains(&p), "alliées à {p} %");
}

#[test]
fn very_big_units_keep_their_full_distance() {
    let spider = UNITS.iter().position(|u| u.key == "spider").unwrap() as u16;
    let p = rest(&mut world(), spider, (0, 0), 200);
    assert!(p >= 97, "araignées à {p} %");
}

/// En marche, deux alliés restent à la distance de marche (75 %) ; arrivés, ils reprennent celle de l'arrêt.
#[test]
fn allies_on_the_move_tolerate_each_other_then_spread_out() {
    let mut w = world();
    let a = w.spawn_unit(U_LIGHT_TANK, 0, 80 * TILE, 120 * TILE);
    let b = w.spawn_unit(U_LIGHT_TANK, 0, 80 * TILE, 120 * TILE + TILE / 4);
    go(&mut w, &[a, b], 150, 120);
    for _ in 0..200 {
        w.step(&[]);
    }
    let p = pct(&w, a, b);
    assert!((SEP_MARCH - 5..=SEP_MARCH + 5).contains(&p), "en marche à {p} %");
    for _ in 0..1200 {
        w.step(&[]);
    }
    assert!(done(&w, &[a, b]));
    let p = pct(&w, a, b);
    assert!((SEP_REST - 2..=SEP_REST + 2).contains(&p), "arrivés à {p} %");
}

/// Deux groupes de 40 chars qui se croisent de face passent l'un dans l'autre en moins de 23 s (24,9 s
/// avec la distance pleine), puis chacun s'immobilise sans se chevaucher plus qu'à l'arrêt.
#[test]
fn two_groups_cross_head_on_without_jamming() {
    let mut w = world();
    let a = block(&mut w, 100, 126, 40);
    let b = block(&mut w, 160, 126, 40);
    go(&mut w, &a, 165, 129);
    go(&mut w, &b, 105, 129);
    let all = [a, b].concat();
    let mut t = 0;
    while !done(&w, &all) && t < 1000 {
        w.step(&[]);
        t += 1;
    }
    assert!(t < 23 * 20, "croisement fini en {t} ticks");
    for _ in 0..200 {
        w.step(&[]);
    }
    let pos: Vec<(i32, i32)> = all.iter().map(|&id| w.unit(id).unwrap()).map(|s| (w.units.x[s], w.units.y[s])).collect();
    for _ in 0..40 {
        w.step(&[]);
    }
    for (k, &id) in all.iter().enumerate() {
        let s = w.unit(id).unwrap();
        assert_eq!((w.units.x[s], w.units.y[s]), pos[k], "l'unité {k} bouge encore");
        for &o in &all[k + 1..] {
            assert!(pct(&w, id, o) >= SEP_REST - 2, "unités trop serrées à l'arrêt : {} %", pct(&w, id, o));
        }
    }
}
