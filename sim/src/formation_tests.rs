//! Tests : déplacement en formation orientée (clic droit glissé), comme dans Supreme Commander : le
//! groupe garde sa disposition, tournée vers l'angle choisi, avance à la vitesse du plus lent, et
//! chaque unité finit orientée selon l'angle.

use crate::data::*;
use crate::fixed::{dist, TILE};
use crate::orders::{apply_orders, O_MOVE};
use crate::world::*;

fn world() -> World {
    let mut w = World::new(&[4242, 512, 0, 1, 0, 0, 100, 100]);
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    w.infinite_grid = true;
    flatten(&mut w, 60, 60, 200, 200);
    w
}

fn kind(key: &str) -> u16 {
    UNITS.iter().position(|u| u.key == key).unwrap() as u16
}
fn moto() -> u16 {
    kind("moto")
}
fn hover_tank() -> u16 {
    kind("hover_tank")
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

/// Ordre de formation orientée aux places données par l'ordre (drapeau 4 sans le 8) : écarts au centre du groupe tournés de `rot` quarts de tour (sens horaire à
/// l'écran : +x vers +y), centrés sur le but ; chaque unité se tourne vers `face` à l'arrivée.
fn formation_order(w: &mut World, ids: &[u32], gx: i32, gy: i32, face: i32, rot: i32) -> Vec<(i32, i32)> {
    let n = ids.len() as i32;
    let ss: Vec<usize> = ids.iter().map(|&id| w.unit(id).unwrap()).collect();
    let cx = ss.iter().map(|&s| w.units.x[s]).sum::<i32>() / n;
    let cy = ss.iter().map(|&s| w.units.y[s]).sum::<i32>() / n;
    let mut cmd = vec![O_MOVE, 0, 4, gx, gy, face, n];
    let mut slots = vec![];
    for (k, &s) in ss.iter().enumerate() {
        let (mut ox, mut oy) = (w.units.x[s] - cx, w.units.y[s] - cy);
        for _ in 0..rot.rem_euclid(4) {
            (ox, oy) = (-oy, ox);
        }
        slots.push((gx + ox, gy + oy));
        cmd.extend_from_slice(&[ids[k] as i32, gx + ox, gy + oy]);
    }
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(w, &msg);
    slots
}

/// Fait tourner la partie jusqu'à ce que toutes les unités aient fini leurs ordres ; renvoie, pour
/// chacune, le tick où son déplacement s'est terminé (place atteinte, avant de se tourner).
fn run_until_done(w: &mut World, ids: &[u32], max: u32) -> Vec<u32> {
    let mut arrived = vec![0u32; ids.len()];
    for t in 1..=max {
        w.step(&[]);
        let mut all = true;
        for (k, &id) in ids.iter().enumerate() {
            let s = w.unit(id).unwrap();
            let moving = matches!(w.units.cold[s].orders.first(), Some(Order::Move { .. }));
            if arrived[k] == 0 && !moving {
                arrived[k] = t;
            }
            all &= w.units.cold[s].orders.is_empty();
        }
        if all {
            return arrived;
        }
    }
    panic!("ordres pas terminés après {max} ticks");
}

/// Le groupe garde sa disposition (un L asymétrique), tournée d'un quart de tour vers le sud : chaque
/// unité rejoint sa place à moins d'un quart de case, donc les écarts entre unités sont conservés.
#[test]
fn formation_keeps_its_layout_rotated_towards_the_angle() {
    let mut w = world();
    // L tourné vers l'est (+x) : trois chars en ligne, un quatrième sur le côté, un cinquième devant
    let pos = [(80, 80), (82, 80), (84, 80), (80, 82), (87, 81)];
    let ids: Vec<u32> = pos.iter().map(|&(x, y)| w.spawn_unit(U_LIGHT_TANK, 0, x * TILE, y * TILE)).collect();
    for &id in &ids {
        let s = w.unit(id).unwrap();
        w.units.facing[s] = 0;
    }
    // vers le sud (+y) : un quart de tour ; ce qui était devant (+x) passe au sud
    let slots = formation_order(&mut w, &ids, 130 * TILE, 115 * TILE, 16384, 1);
    run_until_done(&mut w, &ids, 2000);
    for (k, &id) in ids.iter().enumerate() {
        let s = w.unit(id).unwrap();
        let d = dist(w.units.x[s], w.units.y[s], slots[k].0, slots[k].1);
        assert!(d <= TILE / 4 + 16, "unité {k} à {} sous-unités de sa place", d);
    }
    // le char de tête (le plus à l'est au départ) est maintenant le plus au sud
    let y = |k: usize| w.units.y[w.unit(ids[k]).unwrap()];
    assert!((0..4).all(|k| y(4) > y(k) + 2 * TILE), "le char de tête est devant, vers le sud");
}

/// Groupe mêlé de motos (rapides), de chars et d'artilleries (lentes) : tous avancent à l'allure des
/// artilleries et finissent ensemble. Sans formation orientée, les motos arrivent bien avant.
#[test]
fn formation_moves_at_the_slowest_speed_and_arrives_together() {
    let kinds = [moto(), U_LIGHT_TANK, U_ARTILLERY, moto(), U_LIGHT_TANK, U_ARTILLERY];
    let spawn = |w: &mut World| -> Vec<u32> {
        // côte à côte, perpendiculairement au trajet (en file, les rapides pousseraient les lents)
        let ids: Vec<u32> = kinds.iter().enumerate().map(|(k, &kind)| w.spawn_unit(kind, 0, 80 * TILE, (86 + k as i32 * 2) * TILE)).collect();
        for &id in &ids {
            let s = w.unit(id).unwrap();
            w.units.facing[s] = 0;
        }
        ids
    };
    let far = 50 * TILE;
    let vmin = unit_speed(U_ARTILLERY);
    let mut w = world();
    let ids = spawn(&mut w);
    let s0 = w.unit(ids[0]).unwrap();
    let (x0, y0) = (w.units.x[s0], w.units.y[s0]);
    formation_order(&mut w, &ids, 130 * TILE, 91 * TILE, 0, 0);
    // à mi-parcours, la moto n'a pas pris d'avance sur l'allure de l'artillerie
    let mut moto_half = 0;
    for t in 1..=200 {
        w.step(&[]);
        if t == 200 {
            let s = w.unit(ids[0]).unwrap();
            moto_half = dist(x0, y0, w.units.x[s], w.units.y[s]);
        }
    }
    assert!(moto_half <= 200 * vmin * 11 / 10, "la moto va à l'allure de l'artillerie ({} > {})", moto_half, 200 * vmin);
    assert!(moto_half >= 200 * vmin * 6 / 10, "le groupe avance ({})", moto_half);
    let arrived = run_until_done(&mut w, &ids, 2000);
    let (first, last) = (*arrived.iter().min().unwrap() + 200, *arrived.iter().max().unwrap() + 200);
    assert!(last - first <= 30, "arrivés ensemble : du tick {first} au tick {last}");
    assert!(first as i32 >= far / vmin * 9 / 10, "à la vitesse du plus lent : arrivée au tick {first}");

    // déplacement simple (sans angle) : chacun à sa vitesse
    let mut w = world();
    let ids = spawn(&mut w);
    let mut cmd = vec![O_MOVE, 0, 0, 130 * TILE, 91 * TILE, ids.len() as i32];
    for &id in &ids {
        let s = w.unit(id).unwrap();
        cmd.extend_from_slice(&[id as i32, w.units.x[s] + far, w.units.y[s]]);
    }
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(&mut w, &msg);
    let arrived = run_until_done(&mut w, &ids, 2000);
    assert!(arrived[0] * 3 / 2 < arrived[2], "sans formation, la moto arrive bien avant l'artillerie : {:?}", arrived);
}

/// À l'arrivée, chaque unité (chenillée, à pattes, glisseur) regarde exactement dans la direction
/// choisie, y compris en diagonale.
#[test]
fn formation_ends_facing_the_angle() {
    for face in [0, 8192 * 3, 40000, 57344] {
        let mut w = world();
        let kinds = [U_LIGHT_TANK, U_ASSAULT_WALKER, hover_tank(), U_LINE_ROBOT];
        let ids: Vec<u32> = kinds.iter().enumerate().map(|(k, &kind)| w.spawn_unit(kind, 0, (100 + k as i32 * 2) * TILE, 100 * TILE)).collect();
        formation_order(&mut w, &ids, 120 * TILE, 125 * TILE, face, 1);
        run_until_done(&mut w, &ids, 2000);
        for &id in &ids {
            let s = w.unit(id).unwrap();
            assert_eq!(w.units.facing[s] as i32, face, "{} orienté selon l'angle", udef(w.units.kind[s]).key);
        }
    }
}

/// Grand groupe mêlé (24 unités de quatre types) envoyé loin en diagonale : chaque unité finit à sa
/// place (les lignes restent droites) et le groupe finit ensemble (les premiers attendent les autres).
#[test]
fn big_mixed_formation_stays_in_shape() {
    let mut w = world();
    let kinds = [U_LIGHT_TANK, U_ARTILLERY, U_ASSAULT_WALKER, U_LINE_ROBOT];
    let mut ids = vec![];
    for r in 0..4 {
        for c in 0..6 {
            ids.push(w.spawn_unit(kinds[((r * 6 + c) % 4) as usize], 0, (80 + c * 2) * TILE, (80 + r * 2) * TILE));
        }
    }
    for &id in &ids {
        let s = w.unit(id).unwrap();
        w.units.facing[s] = 0;
    }
    // vers le nord-est : un quart de tour en arrière (l'avant, +x, passe au nord)
    let slots = formation_order(&mut w, &ids, 150 * TILE, 110 * TILE, 49152, 3);
    let arrived = run_until_done(&mut w, &ids, 3000);
    for (k, &id) in ids.iter().enumerate() {
        let s = w.unit(id).unwrap();
        let d = dist(w.units.x[s], w.units.y[s], slots[k].0, slots[k].1);
        assert!(d <= TILE / 2, "unité {k} ({}) à {:.2} case de sa place", udef(w.units.kind[s]).key, d as f64 / TILE as f64);
        assert_eq!(w.units.facing[s], 49152);
    }
    let spread = arrived.iter().max().unwrap() - arrived.iter().min().unwrap();
    assert!(spread <= 40, "arrivés ensemble : {:?}", arrived);
}


// ---------- Formation en file (Maj + clic droit, drapeau 8) ----------

/// Maj + clic droit vers (gx, gy) tel que le client l'envoie (`moveQueuedFormation`).
fn queued_order(w: &mut World, ids: &[u32], gx: i32, gy: i32) {
    let mut cmd = vec![O_MOVE, 0, 1 | crate::formation::FLAG_PLANNED, gx, gy, ids.len() as i32];
    for &id in ids {
        cmd.extend_from_slice(&[id as i32, gx, gy]);
    }
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(w, &msg);
}

/// Places en file de chaque unité (dernier déplacement en file).
fn queued_slots(w: &World, ids: &[u32]) -> Vec<(i32, i32)> {
    ids.iter().map(|&id| crate::formation::queue_end(w, w.unit(id).unwrap())).collect()
}

/// Groupe en tas (positions désordonnées) : au premier Maj + clic droit vers l'est, il se range en
/// rangées droites perpendiculaires au trajet (même x par rangée), régulièrement espacées, centrées
/// sur le but ; l'artillerie (longue portée) est derrière les chars.
#[test]
fn queued_formation_lines_up_in_rows_facing_the_move() {
    let mut w = world();
    let pos = [(80, 80), (81, 83), (79, 85), (83, 81), (82, 86), (78, 82), (84, 84), (80, 88)];
    let kinds = [U_ARTILLERY, U_LIGHT_TANK, U_LIGHT_TANK, U_ARTILLERY, U_LIGHT_TANK, U_LIGHT_TANK, U_ARTILLERY, U_LIGHT_TANK];
    let ids: Vec<u32> = pos.iter().zip(kinds).map(|(&(x, y), k)| w.spawn_unit(k, 0, x * TILE, y * TILE)).collect();
    // but plein est du centre du groupe
    let gy = pos.iter().map(|p| p.1).sum::<i32>() * TILE / 8;
    let gx = 140 * TILE;
    queued_order(&mut w, &ids, gx, gy);
    let slots = queued_slots(&w, &ids);
    // 8 unités : 2 rangées de 4, face à l'est (+x)
    let mut xs: Vec<i32> = slots.iter().map(|p| p.0).collect();
    xs.sort();
    xs.dedup_by(|a, b| (*a - *b).abs() <= 2);
    assert_eq!(xs.len(), 2, "deux rangées : {:?}", slots);
    for row_x in &xs {
        let mut ys: Vec<i32> = slots.iter().filter(|p| (p.0 - row_x).abs() <= 2).map(|p| p.1).collect();
        ys.sort();
        assert_eq!(ys.len(), 4);
        let step = ys[1] - ys[0];
        assert!(step >= 2 * 128, "espacées selon la taille ({step})");
        assert!(ys.windows(2).all(|p| (p[1] - p[0] - step).abs() <= 2), "espacement régulier : {:?}", ys);
    }
    // centre du bloc sur le but
    let cx = slots.iter().map(|p| p.0).sum::<i32>() / 8;
    let cy = slots.iter().map(|p| p.1).sum::<i32>() / 8;
    assert!(dist(cx, cy, gx, gy) <= TILE / 2, "centré sur le but");
    // l'artillerie (longue portée) est dans la rangée arrière (à l'ouest), les chars devant
    assert!((0..8).filter(|&k| kinds[k] == U_ARTILLERY).all(|k| (slots[k].0 - xs[0]).abs() <= 2), "artillerie derrière");
    assert_eq!((0..8).filter(|&k| (slots[k].0 - xs[1]).abs() <= 2 && kinds[k] == U_LIGHT_TANK).count(), 4, "chars devant");
    // en jeu : chacun rejoint sa place et regarde vers l'est
    run_until_done(&mut w, &ids, 3000);
    for (k, &id) in ids.iter().enumerate() {
        let s = w.unit(id).unwrap();
        assert!(dist(w.units.x[s], w.units.y[s], slots[k].0, slots[k].1) <= TILE / 2, "unité {k} à sa place");
        assert_eq!(w.units.facing[s], 0, "face au trajet");
    }
}

/// Trois points en file : la disposition prise au premier point est gardée aux suivants (tout droit,
/// puis tournée d'un quart de tour vers le sud), sans arrêt aux points intermédiaires, et le groupe
/// mêlé (motos, chars, artilleries) avance à la vitesse de l'artillerie : les motos ne prennent pas
/// d'avance, et sur le segment droit les écarts entre unités restent ceux de la formation.
#[test]
fn queued_formation_keeps_layout_and_slowest_speed_over_segments() {
    let mut w = world();
    let kinds = [moto(), U_LIGHT_TANK, U_ARTILLERY, moto(), U_LIGHT_TANK, U_ARTILLERY, moto(), U_LIGHT_TANK];
    let ids: Vec<u32> = kinds.iter().enumerate().map(|(k, &kind)| w.spawn_unit(kind, 0, (68 + (k as i32 % 3) * 3) * TILE, (80 + k as i32) * TILE + TILE / 2)).collect();
    let p1 = (100 * TILE, 84 * TILE);
    let p2 = (150 * TILE, 84 * TILE);
    let p3 = (150 * TILE, 130 * TILE);
    queued_order(&mut w, &ids, p1.0, p1.1);
    let first = queued_slots(&w, &ids);
    queued_order(&mut w, &ids, p2.0, p2.1);
    let second = queued_slots(&w, &ids);
    queued_order(&mut w, &ids, p3.0, p3.1);
    let third = queued_slots(&w, &ids);
    // une seule orientation finale, pour le dernier point
    for &id in &ids {
        let s = w.unit(id).unwrap();
        let faces = w.units.cold[s].orders.iter().filter(|o| matches!(o, Order::Face { .. })).count();
        assert_eq!(faces, 1, "pas d'arrêt pour se tourner aux points intermédiaires");
    }
    for k in 0..ids.len() {
        // tout droit : même disposition, déplacée
        assert_eq!((second[k].0 - p2.0, second[k].1 - p2.1), (first[k].0 - p1.0, first[k].1 - p1.1));
        // vers le sud : tournée d'un quart de tour, (dx, dy) devient (-dy, dx)
        let (dx1, dy1) = (second[k].0 - p2.0, second[k].1 - p2.1);
        let (dx2, dy2) = (third[k].0 - p3.0, third[k].1 - p3.1);
        assert!((dx2 + dy1).abs() <= 8 && (dy2 - dx1).abs() <= 8, "unité {k} : ({dx1}, {dy1}) → ({dx2}, {dy2})");
    }
    // allure commune : au début, une moto ne dépasse pas l'allure de l'artillerie
    let vmin = unit_speed(U_ARTILLERY);
    let m = w.unit(ids[0]).unwrap();
    let (mx0, my0) = (w.units.x[m], w.units.y[m]);
    for _ in 0..150 {
        w.step(&[]);
    }
    let m = w.unit(ids[0]).unwrap();
    let moved = dist(mx0, my0, w.units.x[m], w.units.y[m]);
    assert!(moved <= 150 * vmin * 12 / 10, "la moto va à l'allure de l'artillerie ({moved} > {})", 150 * vmin);
    // sur le segment droit, loin des points : chaque unité reste à moins d'une case de l'endroit où
    // la formation la place par rapport au char de référence
    let mut checked = 0;
    let mut worst = 0;
    for _ in 0..5000 {
        w.step(&[]);
        let on_second = ids.iter().all(|&id| {
            let s = w.unit(id).unwrap();
            matches!(w.units.cold[s].orders.first(), Some(Order::Move { gx, gy, .. }) if (*gx, *gy) == p2)
        });
        let s0 = w.unit(ids[1]).unwrap();
        let (x0, y0) = (w.units.x[s0], w.units.y[s0]);
        if on_second && dist(x0, y0, second[1].0, second[1].1) > 8 * TILE && dist(x0, y0, first[1].0, first[1].1) > 8 * TILE {
            for k in 0..ids.len() {
                let s = w.unit(ids[k]).unwrap();
                let (ex, ey) = (x0 + second[k].0 - second[1].0, y0 + second[k].1 - second[1].1);
                worst = worst.max(dist(w.units.x[s], w.units.y[s], ex, ey));
            }
            checked += 1;
        }
        if ids.iter().all(|&id| w.units.cold[w.unit(id).unwrap()].orders.is_empty()) {
            break;
        }
    }
    assert!(checked > 50, "formation suivie en route ({checked} ticks)");
    assert!(worst <= TILE, "formation gardée en route : écart maximal {:.2} case", worst as f64 / TILE as f64);
    for (k, &id) in ids.iter().enumerate() {
        let s = w.unit(id).unwrap();
        assert!(dist(w.units.x[s], w.units.y[s], third[k].0, third[k].1) <= TILE / 2, "unité {k} à sa place finale");
        assert_eq!(w.units.facing[s], 16384, "face au dernier segment (sud)");
    }
}

/// Une unité ajoutée à la sélection (pas dans la formation) : le groupe se range à nouveau. Un
/// ordre sans Maj annule la formation : le Maj + clic droit suivant repart en rangées.
#[test]
fn queued_formation_restarts_for_a_new_group_or_after_a_plain_order() {
    let mut w = world();
    let ids: Vec<u32> = (0..4).map(|k| w.spawn_unit(U_LIGHT_TANK, 0, 80 * TILE, (80 + 2 * k) * TILE)).collect();
    queued_order(&mut w, &ids, 120 * TILE, 83 * TILE);
    let extra = w.spawn_unit(U_LIGHT_TANK, 0, 70 * TILE, 70 * TILE);
    let mut all = ids.clone();
    all.push(extra);
    let ends = queued_slots(&w, &all);
    let cx = ends.iter().map(|p| p.0).sum::<i32>() / 5;
    queued_order(&mut w, &all, cx, 140 * TILE);
    let slots = queued_slots(&w, &all);
    // 5 unités vers le sud depuis le centre des fins de file : rangées horizontales (même y)
    let mut ys: Vec<i32> = slots.iter().map(|p| p.1).collect();
    ys.sort();
    ys.dedup_by(|a, b| (*a - *b).abs() <= 2);
    assert_eq!(ys.len(), 2, "nouvelle formation en deux rangées : {:?}", slots);
    // ordre sans Maj : plus de formation en cours
    let mut cmd = vec![O_MOVE, 0, 0, 100 * TILE, 100 * TILE, all.len() as i32];
    for &id in &all {
        cmd.extend_from_slice(&[id as i32, 100 * TILE, 100 * TILE]);
    }
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(&mut w, &msg);
    for &id in &all {
        let s = w.unit(id).unwrap();
        assert!(!w.units.cold[s].orders.iter().any(|o| matches!(o, Order::Face { .. })), "formation annulée");
    }
}

/// Obstacle : un mur en travers du trajet, percé d'une brèche décalée du trajet direct. Le groupe le
/// contourne par la brèche (chacun lit le champ de flux à sa place dans la formation, et sa propre
/// case quand il bute sur le mur) et chaque unité finit à sa place, au second point.
#[test]
fn queued_formation_goes_around_a_wall() {
    let mut w = world();
    w.nav = crate::flow::Nav::new(&w.map);
    for y in 62..198 {
        if (100..=106).contains(&y) {
            continue;
        }
        let b = crate::buildings::place_building(&mut w, 0, B_WALL, 110, y, 0).unwrap();
        crate::buildings::complete_building(&mut w, b);
    }
    crate::flow::process_dirty(&mut w);
    let ids: Vec<u32> = (0..8).map(|k| w.spawn_unit(U_LIGHT_TANK, 0, (80 + (k % 4) * 2) * TILE, (80 + (k / 4) * 2) * TILE + TILE / 2)).collect();
    queued_order(&mut w, &ids, 95 * TILE, 85 * TILE);
    queued_order(&mut w, &ids, 140 * TILE, 85 * TILE);
    let slots = queued_slots(&w, &ids);
    run_until_done(&mut w, &ids, 4000);
    for (k, &id) in ids.iter().enumerate() {
        let s = w.unit(id).unwrap();
        let d = dist(w.units.x[s], w.units.y[s], slots[k].0, slots[k].1);
        assert!(d <= TILE / 2, "unité {k} à {:.2} cases de sa place", d as f64 / TILE as f64);
    }
}

// ---------- Rectangle par rôles (clic droit glissé, drapeaux 4 et 8) ----------

/// Clic droit glissé vers (gx, gy), angle `face`, tel que le client l'envoie (`moveFormation`).
fn drag_order(w: &mut World, ids: &[u32], gx: i32, gy: i32, face: i32, queue: bool) {
    let mut cmd = vec![O_MOVE, 0, i32::from(queue) | 4 | crate::formation::FLAG_PLANNED, gx, gy, face, ids.len() as i32];
    for &id in ids {
        cmd.extend_from_slice(&[id as i32, gx, gy]);
    }
    let mut msg = vec![cmd.len() as i32];
    msg.extend_from_slice(&cmd);
    apply_orders(w, &msg);
}

/// Aucune place n'en recouvre une autre.
fn assert_no_overlap(w: &World, ids: &[u32], slots: &[(i32, i32)]) {
    let r = |k: usize| udef(w.units.kind[w.unit(ids[k]).unwrap()]).radius;
    for i in 0..ids.len() {
        for j in 0..i {
            let d = dist(slots[i].0, slots[i].1, slots[j].0, slots[j].1);
            assert!(d >= r(i) + r(j), "places {i} et {j} trop proches ({d} < {})", r(i) + r(j));
        }
    }
}

/// Rôles : corps à corps devant, puis les sacs à points de vie et la ligne du plus résistant au plus
/// fragile, les boucliers, les tireurs et antiaériens, les unités sans arme, le commandant.
#[test]
fn formation_ranks_by_role() {
    let front_to_back = ["ram", "shell", "gnawer", "colossus", "hover_tank", "assault_walker", "light_tank", "line_robot", "moto", "mobile_shield", "mobile_aa", "artillery", "missile_launcher", "heavy_artillery", "sonde", "commander"];
    for p in front_to_back.windows(2) {
        assert!(crate::formation::rank(kind(p[0])) < crate::formation::rank(kind(p[1])), "{} devant {}", p[0], p[1]);
    }
    for p in [("destroyer", "missile_cruiser"), ("frigate", "carrier"), ("spider", "artillery"), ("roll_droid", "light_tank")] {
        assert!(crate::formation::rank(kind(p.0)) < crate::formation::rank(kind(p.1)), "{} devant {}", p.0, p.1);
    }
}

/// Armée en tas, envoyée par un clic droit glissé vers le nord : rectangle plein (rangées droites, toutes
/// de la même largeur), centré sur le point visé, deux fois plus large que profond, les rôles de l'avant
/// vers l'arrière, aux places montrées par l'aperçu ; chacun y arrive et regarde le nord.
#[test]
fn dragged_formation_is_a_rectangle_ordered_by_role() {
    let mut w = world();
    let keys = ["artillery", "gnawer", "line_robot", "hover_tank", "mobile_aa", "light_tank"];
    let ids: Vec<u32> = (0..24).map(|k| w.spawn_unit(kind(keys[k as usize % 6]), 0, (80 + (k * 7) % 13) * TILE, (120 + (k * 5) % 11) * TILE)).collect();
    let goal = (120 * TILE, 100 * TILE);
    let list: Vec<i32> = ids.iter().map(|&i| i as i32).collect();
    let before = w.hash();
    let shown = crate::orders::formation_preview(&w, 0, goal.0, goal.1, 49152, false, &list);
    assert_eq!(before, w.hash(), "l'aperçu ne change rien");
    drag_order(&mut w, &ids, goal.0, goal.1, 49152, false);
    let slots = queued_slots(&w, &ids);
    for c in shown.chunks_exact(3) {
        let k = ids.iter().position(|&i| i as i32 == c[0]).unwrap();
        assert_eq!((c[1], c[2]), slots[k], "l'aperçu montre les places de l'ordre");
    }
    assert_eq!(shown.len(), 24 * 3);
    assert_no_overlap(&w, &ids, &slots);
    // face au nord : l'avant est vers les y décroissants
    let mut ys: Vec<i32> = slots.iter().map(|p| p.1).collect();
    ys.sort();
    ys.dedup_by(|a, b| (*a - *b).abs() <= 3);
    assert_eq!(ys.len(), 4, "quatre rangées : {ys:?}");
    let edges = |y: i32| {
        let row: Vec<usize> = (0..24).filter(|&k| (slots[k].1 - y).abs() <= 3).collect();
        let r = |k: usize| udef(w.units.kind[w.unit(ids[k]).unwrap()]).radius;
        (row.iter().map(|&k| slots[k].0 - r(k)).min().unwrap(), row.iter().map(|&k| slots[k].0 + r(k)).max().unwrap())
    };
    let (l0, r0) = edges(ys[0]);
    for &y in &ys {
        let (l, r) = edges(y);
        assert!((l - l0).abs() <= 8 && (r - r0).abs() <= 8, "rangée de la même largeur : {l}..{r}, {l0}..{r0}");
    }
    assert!((l0 + r0 - 2 * goal.0).abs() <= 8 && (ys[0] + ys[3] - 2 * goal.1).abs() <= 8, "centré sur le point visé");
    let (width, depth) = (r0 - l0, ys[3] - ys[0] + 260);
    assert!(width > depth && width < 4 * depth, "plus large que profond : {width} × {depth}");
    // aucun rôle n'est devant un rôle qui doit l'être avant lui
    for i in 0..24 {
        for j in 0..24 {
            let (a, b) = (kind(keys[i % 6]), kind(keys[j % 6]));
            if crate::formation::rank(a) < crate::formation::rank(b) {
                assert!(slots[i].1 <= slots[j].1 + 3, "{} devant {}", keys[i % 6], keys[j % 6]);
            }
        }
    }
    run_until_done(&mut w, &ids, 4000);
    for (k, &id) in ids.iter().enumerate() {
        let s = w.unit(id).unwrap();
        let d = dist(w.units.x[s], w.units.y[s], slots[k].0, slots[k].1);
        assert!(d <= TILE / 2, "unité {k} à {:.2} case de sa place", d as f64 / TILE as f64);
        assert_eq!(w.units.facing[s], 49152, "face au nord");
    }
}

/// Tailles très différentes (colosses, chars, artilleries), angle oblique : les places ne se recouvrent
/// pas, les colosses sont devant.
#[test]
fn dragged_formation_spaces_units_by_size() {
    for (n, face) in [(5, 0), (14, 9000), (31, 50000)] {
        let mut w = world();
        let keys = ["light_tank", "artillery", "colossus", "moto"];
        let ids: Vec<u32> = (0..n).map(|k| w.spawn_unit(kind(keys[k as usize % 4]), 0, (70 + (k % 6) * 6) * TILE, (70 + (k / 6) * 6) * TILE)).collect();
        let goal = (130 * TILE, 130 * TILE);
        drag_order(&mut w, &ids, goal.0, goal.1, face, false);
        let slots = queued_slots(&w, &ids);
        assert_no_overlap(&w, &ids, &slots);
        let (c, s) = (w.trig.cos(face as u16) as i64, w.trig.sin(face as u16) as i64);
        let front = |k: usize| (slots[k].0 - goal.0) as i64 * c + (slots[k].1 - goal.1) as i64 * s;
        for k in (0..n as usize).filter(|k| k % 4 == 2) {
            assert!((0..n as usize).filter(|j| j % 4 == 1).all(|j| front(k) > front(j)), "colosse devant l'artillerie");
        }
    }
}

/// Maj + clic droit puis Maj + clic droit glissé : le groupe passe le premier point sans s'arrêter pour se
/// tourner et finit en rectangle face à l'angle choisi ; le Maj + clic droit suivant garde ce rectangle.
#[test]
fn dragged_formation_extends_a_queued_one() {
    let mut w = world();
    let keys = ["light_tank", "artillery", "moto", "light_tank", "artillery", "moto"];
    let ids: Vec<u32> = keys.iter().enumerate().map(|(k, key)| w.spawn_unit(kind(key), 0, (80 + k as i32 % 3 * 3) * TILE, (80 + k as i32) * TILE)).collect();
    queued_order(&mut w, &ids, 110 * TILE, 83 * TILE);
    drag_order(&mut w, &ids, 140 * TILE, 83 * TILE, 16384, true);
    let faces = |w: &World| -> Vec<i32> {
        ids.iter().flat_map(|&id| w.units.cold[w.unit(id).unwrap()].orders.iter().filter_map(|o| if let Order::Face { a } = *o { Some(a) } else { None }).collect::<Vec<_>>()).collect()
    };
    assert_eq!(faces(&w), vec![16384; 6], "une seule orientation, celle du glisser");
    let second = queued_slots(&w, &ids);
    // face au sud : deux rangées, l'artillerie au nord
    assert!((0..6).filter(|k| k % 3 == 1).all(|a| (0..6).filter(|k| k % 3 == 0).all(|t| second[t].1 >= second[a].1)), "artillerie derrière : {second:?}");
    queued_order(&mut w, &ids, 140 * TILE, 130 * TILE);
    let third = queued_slots(&w, &ids);
    for k in 0..6 {
        assert!((third[k].0 - second[k].0).abs() <= 8 && (third[k].1 - second[k].1 - 47 * TILE).abs() <= 8, "disposition gardée");
    }
    run_until_done(&mut w, &ids, 4000);
    for (k, &id) in ids.iter().enumerate() {
        let s = w.unit(id).unwrap();
        assert!(dist(w.units.x[s], w.units.y[s], third[k].0, third[k].1) <= TILE / 2, "unité {k} à sa place");
    }
}

// ---------- Allure : la vitesse du plus lent, sans autre ralentissement ----------

/// Distance parcourue en ligne droite par chaque unité entre les ticks 30 et 60 (en pleine course).
fn cruise(w: &mut World, ids: &[u32]) -> Vec<i32> {
    for _ in 0..30 {
        w.step(&[]);
    }
    let at = |w: &World| -> Vec<(i32, i32)> { ids.iter().map(|&id| w.unit(id).map(|s| (w.units.x[s], w.units.y[s])).unwrap()).collect() };
    let a = at(w);
    for _ in 0..30 {
        w.step(&[]);
    }
    at(w).iter().zip(&a).map(|(p, q)| dist(p.0, p.1, q.0, q.1)).collect()
}

/// Rongeurs éparpillés sur 24 cases (une seule sorte d'unité) : en formation, glissée ou en file, chacun
/// court à la pleine vitesse du rongeur, aussi vite que sans formation, quelle que soit la distance de sa place.
#[test]
fn formation_of_one_kind_is_not_slowed() {
    for queued in [false, true] {
        let mut w = world();
        let ids: Vec<u32> = (0..12).map(|k| w.spawn_unit(kind("gnawer"), 0, (70 + (k * 7) % 25) * TILE, (80 + 2 * k) * TILE)).collect();
        for &id in &ids {
            let s = w.unit(id).unwrap();
            w.units.facing[s] = 0;
        }
        if queued {
            queued_order(&mut w, &ids, 140 * TILE, 91 * TILE);
        } else {
            drag_order(&mut w, &ids, 140 * TILE, 91 * TILE, 0, false);
        }
        let full = 30 * unit_speed(kind("gnawer"));
        let d = cruise(&mut w, &ids);
        assert!(d.iter().all(|&d| d >= full * 95 / 100), "pleine vitesse {full}, en file {queued} : {d:?}");
    }
}

/// Groupe mêlé et épars : chacun va à la vitesse du plus lent (l'artillerie), ni plus vite ni moins vite,
/// que sa place soit proche ou loin ; sur le terreau de son joueur, un groupe de la Souche garde son bonus.
#[test]
fn formation_goes_at_the_slowest_speed() {
    let mut w = world();
    let keys = ["moto", "light_tank", "artillery", "gnawer"];
    let ids: Vec<u32> = (0..12).map(|k| w.spawn_unit(kind(keys[k as usize % 4]), 0, (70 + (k * 7) % 25) * TILE, (80 + 2 * k) * TILE)).collect();
    for &id in &ids {
        let s = w.unit(id).unwrap();
        w.units.facing[s] = 0;
    }
    let vmin = keys.iter().map(|k| unit_speed(kind(k))).min().unwrap();
    drag_order(&mut w, &ids, 150 * TILE, 91 * TILE, 0, false);
    let d = cruise(&mut w, &ids);
    assert!(d.iter().all(|&d| d >= 30 * vmin * 95 / 100 && d <= 30 * vmin + 60), "vitesse du plus lent {} : {d:?}", 30 * vmin);

    let mut w = world();
    w.players[0].race = RACE_SOUCHE;
    crate::soil::ensure(&mut w);
    w.terreau.fill(1);
    let ids: Vec<u32> = (0..6).map(|k| w.spawn_unit(kind(if k % 2 == 0 { "gnawer" } else { "shell" }), 0, (70 + k * 4) * TILE, (80 + 2 * k) * TILE)).collect();
    for &id in &ids {
        let s = w.unit(id).unwrap();
        w.units.facing[s] = 0;
    }
    w.players[0].researched2 = u64::MAX;
    drag_order(&mut w, &ids, 150 * TILE, 85 * TILE, 0, false);
    let bonus = crate::essaim::speed(&w, w.unit(ids[0]).unwrap(), unit_speed(kind("shell")));
    assert!(bonus > unit_speed(kind("shell")), "le terreau accélère");
    let d = cruise(&mut w, &ids);
    assert!(d.iter().all(|&d| d >= 30 * bonus * 95 / 100 && d <= 30 * bonus + 60), "bonus du terreau gardé {} : {d:?}", 30 * bonus);
}

/// Grande armée mêlée en tas, dont les rôles doivent se croiser (tireurs devant, corps à corps derrière) :
/// les premiers arrivés laissent passer les autres, et chacun finit à sa place, tourné vers l'angle.
#[test]
fn big_crossing_formation_reaches_every_slot() {
    for (n, face) in [(40, 0), (80, 20000)] {
        let mut w = world();
        let keys = ["artillery", "heavy_artillery", "light_tank", "assault_walker", "gnawer"];
        // par colonnes : l'artillerie à l'est (devant), les rongeurs à l'ouest
        let ids: Vec<u32> = (0..n).map(|k| w.spawn_unit(kind(keys[(k * 5 / n) as usize]), 0, (110 - k * 5 / n * 5) * TILE, (80 + (k % (n / 5)) * 2) * TILE)).collect();
        drag_order(&mut w, &ids, 140 * TILE, 110 * TILE, face, false);
        let slots = queued_slots(&w, &ids);
        run_until_done(&mut w, &ids, 4000);
        let mut off: Vec<String> = vec![];
        for (k, &id) in ids.iter().enumerate() {
            let s = w.unit(id).unwrap();
            let d = dist(w.units.x[s], w.units.y[s], slots[k].0, slots[k].1);
            if d > TILE {
                off.push(format!("{k} {} à {:.1}", udef(w.units.kind[s]).key, d as f64 / TILE as f64));
            }
        }
        assert!(off.is_empty(), "{n} unités : {off:?}");
    }
}
