//! Partie de référence synthétique (8 joueurs, 8 000 unités, ~40 000 bâtiments et tapis) pour mesurer
//! le temps de simulation par tick. Lancer : cargo test --release stress -- --ignored --nocapture

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;

fn flat(w: &mut World, x0: i32, y0: i32, x1: i32, y1: i32) {
    w.map.spots.retain(|s| !(s.x >= x0 - 2 && s.x <= x1 && s.y >= y0 - 2 && s.y <= y1));
    for y in y0.max(1)..y1.min(w.map.h - 1) {
        for x in x0.max(1)..x1.min(w.map.w - 1) {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
}

pub fn reference_world_quiet() -> World {
    build_reference(false)
}

pub fn reference_world() -> World {
    build_reference(true)
}

fn build_reference(verbose: bool) -> World {
    let mut p = vec![99, 1024, 0, 8];
    for i in 0..8 {
        p.extend_from_slice(&[i, 0, 100, 100]);
    }
    let mut w = World::new(&p);
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    let starts = w.map.starts.clone();
    let mut buildings = 0;
    for (pi, &(sx, sy)) in starts.iter().enumerate() {
        let owner = pi as u8;
        // usine de 60 x 60 cases : lignes de tapis avec fonderies et bras
        let (bx, by) = ((sx - 30).clamp(2, 1024 - 64), (sy - 30).clamp(2, 1024 - 64));
        flat(&mut w, bx - 2, by - 2, bx + 62, by + 62);
        for row in 0..8 {
            let y = by + row * 7 + 3;
            for x in bx..bx + 58 {
                if let Some(b) = place_building(&mut w, owner, B_BELT1, x, y, 0) {
                    complete_building(&mut w, b);
                    buildings += 1;
                }
            }
            for k in 0..14 {
                let x = bx + k * 4;
                if let Some(b) = place_building(&mut w, owner, B_FURNACE, x, y - 3, 0) {
                    complete_building(&mut w, b);
                    buildings += 1;
                }
                for (dx, dir) in [(0, 3u8), (1, 1u8)] {
                    if let Some(b) = place_building(&mut w, owner, B_INSERTER, x + dx, y - 1, dir) {
                        complete_building(&mut w, b);
                        buildings += 1;
                    }
                }
                if let Some(b) = place_building(&mut w, owner, B_WALL, x + 2, y - 1, 0) {
                    complete_building(&mut w, b);
                    buildings += 1;
                }
            }
            // des objets sur les tapis
            let o = w.map.occ[w.map.idx(bx + 1, y)];
            if o != 0 {
                let line = w.buildings[(o - 1) as usize].line;
                if line != NONE {
                    let l = &mut w.belts.lines[line as usize];
                    let len = l.len();
                    let mut pos = 200;
                    while pos < len - 64 {
                        l.insert_at(IRON_ORE, pos);
                        pos += 96;
                    }
                }
            }
            for x in [bx + 2, bx + 20, bx + 40] {
                if let Some(b) = place_building(&mut w, owner, B_GENERATOR, x, y + 1, 0) {
                    complete_building(&mut w, b);
                }
            }
        }
        // remplir jusqu'à ~5 000 éléments par joueur avec des tapis en serpentin
        let mut count = 0;
        'outer: for yy in (by + 60)..(by + 140).min(1020) {
            for xx in bx..(bx + 60) {
                if count >= 4000 {
                    break 'outer;
                }
                if w.map.inside(xx, yy) && w.map.cliff[w.map.idx(xx, yy)] == 0 && w.map.height[w.map.idx(xx, yy)] >= w.map.water_level {
                    let dir = if (yy - by) % 2 == 0 { 0 } else { 2 };
                    if let Some(b) = place_building(&mut w, owner, B_BELT1, xx, yy, dir) {
                        complete_building(&mut w, b);
                        count += 1;
                        buildings += 1;
                    }
                }
            }
        }
        // 1 000 unités par joueur, vers le centre en attaque
        let kinds = [U_LINE_ROBOT, 6, 10, 7, 8, 20, 21];
        for i in 0..999 {
            let k = kinds[i % kinds.len()];
            let x = (sx * TILE + ((i % 40) as i32 - 20) * TILE).clamp(TILE, 1023 * TILE);
            let y = (sy * TILE + ((i / 40) as i32 - 12) * TILE).clamp(TILE, 1023 * TILE);
            let id = w.spawn_unit(k, owner, x, y);
            let s = slot_of(id);
            let (tx, ty) = (512 * TILE, 512 * TILE);
            w.units.cold[s].orders.push(Order::Move { x: tx, y: ty, gx: tx, gy: ty, attack: true });
        }
    }
    w.nav = crate::flow::Nav::new(&w.map);
    crate::flow::rebuild_goal_refs(&mut w);
    if verbose {
        #[cfg(test)]
        println!("bâtiments et tapis : {buildings}, unités : {}", w.units.alive.iter().filter(|&&a| a).count());
    }
    let _ = buildings;
    w
}

#[test]
#[ignore]
fn stress_reference() {
    let mut w = reference_world();
    let mut times: Vec<f64> = Vec::new();
    let mut last = std::time::Instant::now();
    #[allow(clippy::disallowed_types)]
    for t in 0..1400 {
        w.step(&[]);
        let now = std::time::Instant::now();
        #[allow(clippy::float_arithmetic)]
        times.push(now.duration_since(last).as_secs_f64() * 1000.0);
        last = now;
        if t % 200 == 0 {
            let alive = w.units.alive.iter().filter(|&&a| a).count();
            println!("tick {t} : {:.2} ms, unités {alive}, projectiles {}", times.last().unwrap(), w.projectiles.len());
        }
    }
    times.sort_by(|a, b| a.partial_cmp(b).unwrap());
    #[allow(clippy::float_arithmetic)]
    let mean = times.iter().sum::<f64>() / times.len() as f64;
    println!("moyenne {:.2} ms, p99 {:.2} ms, max {:.2} ms", mean, times[times.len() * 99 / 100], times.last().unwrap());
}

#[test]
#[ignore]
#[allow(clippy::disallowed_types, clippy::float_arithmetic)]
fn stress_profile() {
    let mut w = reference_world();
    let names = ["ordres+énergie", "grille+boucliers", "bâtiments", "tapis", "unités", "projectiles", "morts", "flux", "vision", "hash"];
    let mut acc = [0f64; 10];
    for _ in 0..800 {
        let mut ts = [std::time::Instant::now(); 11];
        w.events.clear();
        crate::orders::apply_orders(&mut w, &[]);
        if w.power_dirty && w.tick % 5 == 0 {
            crate::buildings::rebuild_power(&mut w);
        }
        crate::buildings::power_tick(&mut w);
        ts[1] = std::time::Instant::now();
        let teams: Vec<u8> = w.players.iter().map(|p| p.team).collect();
        w.grid.rebuild_units(&w.units, &teams);
        crate::combat::collect_shields(&mut w);
        ts[2] = std::time::Instant::now();
        crate::buildings::update_buildings(&mut w);
        ts[3] = std::time::Instant::now();
        crate::belts::update_belts(&mut w);
        ts[4] = std::time::Instant::now();
        crate::units::update_units(&mut w);
        ts[5] = std::time::Instant::now();
        crate::combat::update_projectiles(&mut w);
        ts[6] = std::time::Instant::now();
        crate::combat::cleanup_dead(&mut w);
        ts[7] = std::time::Instant::now();
        crate::flow::process_dirty(&mut w);
        ts[8] = std::time::Instant::now();
        if w.tick % 10 == 0 {
            w.update_vis_all();
        }
        ts[9] = std::time::Instant::now();
        w.tick += 1;
        let _ = w.hash();
        ts[10] = std::time::Instant::now();
        for i in 0..10 {
            acc[i] += ts[i + 1].duration_since(ts[i]).as_secs_f64() * 1000.0 / 800.0;
        }
    }
    for i in 0..10 {
        println!("{:>18} : {:.2} ms", names[i], acc[i]);
    }
    crate::units::PROF.with(|p| {
        let p = p.borrow();
        println!("  dont séparation {:.2} ms, ordres {:.2} ms, armes {:.2} ms", p[0] / 800.0, p[1] / 800.0, p[2] / 800.0);
    });
}
