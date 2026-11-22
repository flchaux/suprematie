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
    // banc : réseau partout (le banc mesure la simulation, pas l'implantation des zones)
    w.infinite_grid = true;
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
                    // banc : réservoir inépuisable
                    w.buildings[b].fuel = 1_000_000_000;
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
            w.units.cold[s].orders.push(Order::Move { x: tx, y: ty, gx: tx, gy: ty, attack: true, eta: 0 });
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

/// Scène de démonstration de la logistique (?demo=logistique) : deux alliés, deux trains sur un rail
/// coudé, trois drones de fret, un entrepôt d'équipe, et quelques bâtiments en difficulté (icônes).
pub fn logistics_demo() -> World {
    let mut w = World::new(&[7, 512, 0, 2, 0, 0, 100, 100, 0, 0, 100, 100]);
    // démo : réseau partout
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    let (sx, sy) = w.map.starts[0];
    let (x0, y0) = ((sx - 10).clamp(4, 400), (sy - 20).clamp(4, 400));
    flat(&mut w, x0 - 4, y0 - 6, x0 + 100, y0 + 70);
    let put = |w: &mut World, owner: u8, kind: u16, x: i32, y: i32, dir: u8| -> usize {
        let b = place_building(w, owner, kind, x, y, dir).unwrap_or(usize::MAX);
        if b != usize::MAX {
            complete_building(w, b);
            // démo : générateurs au réservoir inépuisable
            if bdef(kind).class == BClass::Power {
                w.buildings[b].fuel = 1_000_000_000;
            }
        }
        b
    };
    // gares : la vôtre (joueur 0) et celle d'un allié (joueur 1), reliées par un rail coudé
    put(&mut w, 0, B_GENERATOR, x0, y0 - 3, 0);
    let a = put(&mut w, 0, B_STATION, x0, y0, 0);
    put(&mut w, 1, B_GENERATOR, x0 + 70, y0 + 37, 0);
    let b = put(&mut w, 1, B_STATION, x0 + 70, y0 + 40, 0);
    // la gare (2 x 2) occupe x0 et x0 + 1 : la voie commence juste à côté, en x0 + 2
    for x in x0 + 2..x0 + 50 {
        put(&mut w, 0, B_RAIL, x, y0 + 1, 0);
    }
    for y in y0 + 1..y0 + 42 {
        put(&mut w, 0, B_RAIL, x0 + 50, y, 1);
    }
    for x in x0 + 50..x0 + 70 {
        put(&mut w, 0, B_RAIL, x, y0 + 41, 0);
    }
    // héliports de fret
    put(&mut w, 0, B_GENERATOR, x0, y0 + 57, 0);
    let pa = put(&mut w, 0, B_CARGO_PAD, x0, y0 + 60, 0);
    put(&mut w, 1, B_GENERATOR, x0 + 85, y0 + 2, 0);
    let pb = put(&mut w, 1, B_CARGO_PAD, x0 + 85, y0 + 5, 0);
    // entrepôt d'équipe
    let wh = put(&mut w, 0, B_WAREHOUSE, x0 + 10, y0 + 10, 0);
    // dépôts remplis près des gares et des héliports (véhicules payés par les dépôts proches)
    for (owner, dx, dy) in [(0u8, 4, 3), (0, 4, 57), (1, 80, 30)] {
        let d = put(&mut w, owner, B_DEPOT, x0 + dx, y0 + dy, 0);
        if d != usize::MAX {
            for (it, n) in [(IRON_PLATE, 600), (GEAR, 500), (STEEL, 500), (CIRCUIT, 500)] {
                crate::drones::put(&mut w.buildings[d].stash, it, n);
            }
        }
    }
    if a != usize::MAX && b != usize::MAX && pa != usize::MAX && pb != usize::MAX {
        w.buildings[a].stash[IRON_PLATE as usize] = 1500;
        w.buildings[b].stash[COPPER_PLATE as usize] = 800;
        w.buildings[pa].stash[CIRCUIT as usize] = 200;
        let (rb, rpb) = (w.building_ref(b), w.building_ref(pb));
        for _ in 0..2 {
            crate::logistics::link(&mut w, 0, a, rb);
        }
        for _ in 0..3 {
            crate::logistics::link(&mut w, 0, pa, rpb);
        }
    }
    if wh != usize::MAX {
        crate::drones::put(&mut w.buildings[wh].stash, IRON_PLATE, 750);
        crate::drones::put(&mut w.buildings[wh].stash, STEEL, 120);
        w.buildings[wh].recipe = STEEL;
    }
    // diagnostics : fonderie sans minerai (entrée manquante), assembleur hors réseau
    put(&mut w, 0, B_GENERATOR, x0 + 20, y0 + 20, 0);
    let f = put(&mut w, 0, B_FURNACE, x0 + 23, y0 + 20, 0);
    if f != usize::MAX {
        w.buildings[f].recipe = 0;
    }
    // base de robots : ils apportent du minerai (dépôt voisin) à la fonderie voisine et évacuent ses plaques
    // (hors du cadre de copie du test des plans : x0+10..38, y0+10..30)
    put(&mut w, 0, B_GENERATOR, x0 + 10, y0 + 35, 0);
    put(&mut w, 0, B_GENERATOR, x0 + 13, y0 + 35, 0);
    put(&mut w, 0, B_ROBOPORT, x0 + 12, y0 + 38, 0);
    let rd = put(&mut w, 0, B_DEPOT, x0 + 16, y0 + 38, 0);
    if rd != usize::MAX {
        crate::drones::put(&mut w.buildings[rd].stash, IRON_ORE, 400);
    }
    // portail de don de l'allié (joueur 1)
    put(&mut w, 1, B_PORTAL, x0 + 60, y0 + 20, 0);
    let asm = put(&mut w, 0, B_ASSEMBLER1, x0 + 34, y0 + 26, 0);
    if asm != usize::MAX {
        w.buildings[asm].recipe = 4;
    }
    // tapis surélevés : une ligne monte par un ascenseur, passe au-dessus d'une ligne au sol et d'un
    // générateur, puis redescend vers un dépôt
    for x in x0 + 40..x0 + 43 {
        put(&mut w, 0, B_BELT1, x, y0 + 50, 0);
    }
    for x in x0 + 43..x0 + 51 {
        put(&mut w, 0, B_BELT1, x, y0 + 50, 1 << 3);
    }
    for x in x0 + 51..x0 + 54 {
        put(&mut w, 0, B_BELT1, x, y0 + 50, 0);
    }
    put(&mut w, 0, B_DEPOT, x0 + 54, y0 + 50, 0);
    for y in y0 + 45..y0 + 55 {
        put(&mut w, 0, B_BELT1, x0 + 46, y, 1);
    }
    put(&mut w, 0, B_GENERATOR, x0 + 48, y0 + 49, 0);
    let start = w.map.occ[w.map.idx(x0 + 40, y0 + 50)];
    let cross = w.map.occ[w.map.idx(x0 + 46, y0 + 45)];
    for k in 0..12 {
        if start != 0 && k % 2 == 0 {
            crate::belts::put_on_belt(&mut w, start as usize - 1, IRON_ORE);
        }
        if cross != 0 {
            crate::belts::put_on_belt(&mut w, cross as usize - 1, COPPER_ORE);
        }
        w.step(&[]);
        w.step(&[]);
        w.step(&[]);
    }
    // extracteurs améliorés (niveaux 2 et 3) sur un gisement de démonstration
    put(&mut w, 0, B_GENERATOR, x0 + 44, y0 + 34, 0);
    for (k, x) in [x0 + 40, x0 + 47].into_iter().enumerate() {
        let y = y0 + 37;
        for dy in 0..2 {
            for dx in 0..2 {
                let i = w.map.idx(x + dx, y + dy);
                w.map.deposit[i] = COPPER_ORE;
            }
        }
        w.map.spots.push(crate::map::Spot { kind: COPPER_ORE, x, y, purity: 0 });
        let e = put(&mut w, 0, B_EXTRACTOR, x, y, 1);
        if e != usize::MAX {
            w.buildings[e].level = k as u8 + 1;
        }
    }
    // goulottes : une file de tapis passe sous les deux extracteurs (arrivée latérale) ; un troisième
    // extracteur, tourné vers l'est, débouche sur deux tapis qui partent dans le même sens
    for x in x0 + 39..x0 + 48 {
        // un collecteur de surplus au milieu de la file
        put(&mut w, 0, if x == x0 + 44 { B_COLLECTOR } else { B_BELT1 }, x, y0 + 39, 0);
    }
    // dépôt amélioré : il rend des engrenages et des circuits sur un tapis qui part vers le sud
    let d = put(&mut w, 0, B_DEPOT, x0 + 48, y0 + 39, 0);
    if d != usize::MAX {
        w.buildings[d].level = 1;
        w.buildings[d].filters = vec![GEAR, CIRCUIT];
        crate::drones::put(&mut w.buildings[d].stash, GEAR, 200);
        crate::drones::put(&mut w.buildings[d].stash, CIRCUIT, 200);
    }
    for y in y0 + 41..y0 + 47 {
        put(&mut w, 0, B_BELT1, x0 + 49, y, 1);
    }
    // tapis le long de la face sud du dépôt, vers l'ouest : le premier est un virage alimenté par le dépôt
    for x in (x0 + 44..x0 + 49).rev() {
        put(&mut w, 0, B_BELT1, x, y0 + 41, 2);
    }
    // répartiteur réglé « gauche et avant » (vitrine)
    for (dx, dy) in [(52, 47), (53, 48), (44, 48), (42, 47), (55, 45)] {
        let sp = put(&mut w, 0, B_SPLITTER, x0 + dx, y0 + dy, 1);
        if sp != usize::MAX {
            w.buildings[sp].split = 1;
            break;
        }
    }
    // bras en quart de tour : tourné vers le sud, il prend sur ce tapis (à sa droite) et dépose devant lui
    let arm = put(&mut w, 0, B_INSERTER, x0 + 50, y0 + 44, 1);
    if arm != usize::MAX {
        w.buildings[arm].turn = 1;
    }
    put(&mut w, 0, B_DEPOT, x0 + 50, y0 + 45, 0);
    let (ex, ey) = (x0 + 52, y0 + 34);
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(ex + dx, ey + dy);
            w.map.deposit[i] = IRON_ORE;
        }
    }
    w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x: ex, y: ey, purity: 0 });
    put(&mut w, 0, B_EXTRACTOR, ex, ey, 0);
    for x in ex + 2..ex + 7 {
        put(&mut w, 0, B_BELT1, x, ey, 0);
        put(&mut w, 0, B_BELT1, x, ey + 1, 0);
    }
    // répartiteur alimenté par un extracteur : la file tourne vers le sud pour entrer par son arrière ; ses
    // sorties gauche et droite partent vers le sud en virage (il compte comme un tapis pour leur forme),
    // l'avant tout droit ; trois files jusqu'à deux dépôts
    let (ex, ey) = (x0 + 58, y0 + 56);
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(ex + dx, ey + dy);
            w.map.deposit[i] = IRON_ORE;
        }
    }
    w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x: ex, y: ey, purity: 0 });
    put(&mut w, 0, B_EXTRACTOR, ex, ey, 0);
    put(&mut w, 0, B_BELT1, ex + 2, ey + 1, 0);
    put(&mut w, 0, B_BELT1, ex + 3, ey + 1, 0);
    put(&mut w, 0, B_BELT1, ex + 4, ey + 1, 1);
    put(&mut w, 0, B_SPLITTER, ex + 4, ey + 2, 1);
    for x in ex + 3..ex + 6 {
        for y in ey + if x == ex + 4 { 3 } else { 2 }..ey + 6 {
            put(&mut w, 0, B_BELT1, x, y, 1);
        }
    }
    put(&mut w, 0, B_DEPOT, ex + 3, ey + 6, 0);
    put(&mut w, 0, B_DEPOT, ex + 5, ey + 6, 0);
    // machines jumelles : deux paires d'assembleurs d'engrenages collés, nourries par un seul tapis
    // (dépôt amélioré qui rend des plaques) qui entre dans la première de chaque paire.
    // - à gauche, chacune a son tapis de sortie vers un dépôt : chacune sort sur le sien ;
    // - à droite, seule la seconde a un tapis de sortie : la première sort par sa voisine.
    let gear = RECIPES.iter().position(|r| r.key == "gear").unwrap_or(0) as u8;
    let (tx, ty) = (x0 + 66, y0 + 54);
    for (px, both) in [(tx, true), (tx + 10, false)] {
        let d = put(&mut w, 0, B_DEPOT, px, ty - 6, 0);
        if d != usize::MAX {
            w.buildings[d].level = 1;
            w.buildings[d].filters = vec![IRON_PLATE];
            crate::drones::put(&mut w.buildings[d].stash, IRON_PLATE, 400);
        }
        for y in ty - 4..ty {
            put(&mut w, 0, B_BELT1, px, y, 1);
        }
        for m in [put(&mut w, 0, B_ASSEMBLER1, px, ty, 0), put(&mut w, 0, B_ASSEMBLER1, px + 2, ty, 0)] {
            if m != usize::MAX {
                w.buildings[m].recipe = gear;
                w.buildings[m].repeat = true;
            }
        }
        for (bx, dx) in [(px, px), (px + 3, px + 2)] {
            if bx == px && !both {
                continue;
            }
            for y in ty + 2..ty + 7 {
                put(&mut w, 0, B_BELT1, bx, y, 1);
            }
            put(&mut w, 0, B_DEPOT, dx, ty + 7, 0);
        }
    }
    // générateurs jumeaux : un générateur principal nourri par un dépôt collé (hydrocarbure de son stock),
    // collé à un générateur vide sans fournisseur, qui vit du combustible partagé (conduite verte)
    let gm = put(&mut w, 0, B_MAIN_GENERATOR, tx + 20, ty, 0);
    let gs = put(&mut w, 0, B_GENERATOR, tx + 23, ty, 0);
    let gd = put(&mut w, 0, B_DEPOT, tx + 20, ty + 3, 0);
    if gm != usize::MAX && gs != usize::MAX && gd != usize::MAX {
        w.buildings[gm].fuel = 10 * FUEL_HYDROCARBON;
        w.buildings[gs].fuel = 0;
        crate::drones::put(&mut w.buildings[gd].stash, HYDROCARBON, 400);
    }
    for _ in 0..20 {
        w.step(&[]);
    }
    w
}

/// Scène de démonstration des armes (?demo=armes) : les expérimentales et des unités à balles, à traits
/// d'énergie et à obus (joueur 0) face à une armée nombreuse et à des tourelles (joueur 1).
pub fn weapons_demo() -> World {
    let mut w = World::new(&[11, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    // démo : réseau partout
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    // au centre de la carte, loin des commandants (la mort d'un commandant élimine son armée)
    let (x0, y0) = (w.map.w / 2 - 40, w.map.h / 2 - 30);
    flat(&mut w, x0 - 6, y0 - 6, x0 + 80, y0 + 66);
    let spawn = |w: &mut World, kind: u16, owner: u8, x: i32, y: i32| {
        w.spawn_unit(kind, owner, x * TILE + TILE / 2, y * TILE + TILE / 2);
    };
    // joueur 0 : expérimentales au centre, appuis sur les ailes
    spawn(&mut w, U_SPIDER, 0, x0 + 14, y0 + 30);
    spawn(&mut w, U_ROACH, 0, x0 + 18, y0 + 18);
    spawn(&mut w, U_COLOSSUS, 0, x0 + 18, y0 + 42);
    spawn(&mut w, U_DRAGON, 0, x0 + 30, y0 + 24);
    spawn(&mut w, U_STAR_CRUISER, 0, x0 + 6, y0 + 30);
    for k in 0..6 {
        spawn(&mut w, U_LIGHT_TANK, 0, x0 + 20, y0 + 8 + k * 2);
        spawn(&mut w, U_LINE_ROBOT, 0, x0 + 22, y0 + 46 + k * 2);
        spawn(&mut w, U_LINE_ROBOT, 0, x0 + 23, y0 + 46 + k * 2);
    }
    for k in 0..3 {
        spawn(&mut w, U_ARTILLERY, 0, x0 + 8, y0 + 12 + k * 3);
    }
    // joueur 1 : une armée serrée et des défenses fixes
    spawn(&mut w, U_FORTRESS, 1, x0 + 56, y0 + 22);
    spawn(&mut w, U_FORTRESS, 1, x0 + 56, y0 + 42);
    spawn(&mut w, U_COLOSSUS, 1, x0 + 46, y0 + 20);
    spawn(&mut w, U_ROACH, 1, x0 + 46, y0 + 42);
    for k in 0..120 {
        spawn(&mut w, U_LINE_ROBOT, 1, x0 + 40 + (k % 10) * 2, y0 + 8 + (k / 10) * 4);
    }
    for k in 0..24 {
        spawn(&mut w, U_LIGHT_TANK, 1, x0 + 62 + (k % 4) * 3, y0 + 8 + (k / 4) * 9);
    }
    for k in 0..3 {
        spawn(&mut w, U_SIEGE_WALKER, 1, x0 + 62, y0 + 16 + k * 14);
    }
    for k in 0..4 {
        if let Some(b) = place_building(&mut w, 1, B_HEAVY_TURRET, x0 + 68, y0 + 10 + k * 12, 0) {
            complete_building(&mut w, b);
        }
    }
    // un mur continu devant les tourelles, avec un retour en angle
    for y in y0 + 6..y0 + 56 {
        if let Some(b) = place_building(&mut w, 1, B_WALL, x0 + 66, y, 0) {
            complete_building(&mut w, b);
        }
    }
    for x in x0 + 67..x0 + 72 {
        if let Some(b) = place_building(&mut w, 1, B_WALL, x, y0 + 6, 0) {
            complete_building(&mut w, b);
        }
    }
    // les deux armées marchent l'une vers l'autre en attaquant (attaque en mouvement)
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.kind[s] == U_COMMANDER {
            continue;
        }
        let gx = if w.units.owner[s] == 0 { x0 + 64 } else { x0 + 10 };
        let (x, y) = (gx * TILE, w.units.y[s]);
        crate::orders::give(&mut w, s, false, Order::Move { x, y, gx: x, gy: y, attack: true, eta: 0 });
    }
    w
}

/// Vitrine des modèles (?demo=vitrine) : un exemplaire terminé de chaque bâtiment, puis chaque unité à
/// l'arrêt, en rangées (joueur 0, au centre de la carte, loin du commandant adverse). Les bâtiments qui
/// demandent de l'eau manquent ; l'extracteur reçoit un gisement sous lui.
pub fn showcase_demo() -> World {
    let mut w = World::new(&[11, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
        // de quoi poser le socle à EPPZ
        pl.eppz = 1;
    }
    const COLS: i32 = 8;
    const STEP: i32 = 7;
    let rows = BUILDINGS.len() as i32 / COLS + 1;
    let (x0, y0) = (w.map.w / 2 - COLS * STEP / 2, w.map.h / 2 - 40);
    flat(&mut w, x0 - 4, y0 - 4, x0 + COLS * STEP + 4, y0 + rows * STEP + 40);
    for (k, def) in BUILDINGS.iter().enumerate() {
        let (x, y) = (x0 + (k as i32 % COLS) * STEP, y0 + (k as i32 / COLS) * STEP);
        if def.deposit != 0 {
            // gisement de fer, ou geyser pour la centrale géothermique
            let kind = if def.deposit == 255 { IRON_ORE } else { def.deposit };
            for dy in 0..def.size.1 as i32 {
                for dx in 0..def.size.0 as i32 {
                    let i = w.map.idx(x + dx, y + dy);
                    w.map.deposit[i] = kind;
                }
            }
            w.map.spots.push(crate::map::Spot { kind, x, y, purity: 0 });
        }
        if let Some(b) = place_building(&mut w, 0, k as u16, x, y, 0) {
            complete_building(&mut w, b);
        }
    }
    let uy = y0 + rows * STEP + 4;
    for k in 0..UNITS.len() as i32 {
        let (x, y) = (x0 + (k % 12) * 5, uy + (k / 12) * 6);
        w.spawn_unit(k as u16, 0, x * TILE + TILE / 2, y * TILE + TILE / 2);
    }
    w
}

/// Démo des déplacements en formation orientée : une armée mêlée du joueur 0 (motos, chars,
/// artilleries, marcheurs, robots, glisseurs), en bloc tourné vers l'est, sur un grand terrain plat
/// autour du départ du joueur 0.
/// Le client lui donne des ordres en local (`?demo=formation`).
pub fn formation_demo() -> World {
    let mut w = World::new(&[13, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    // près du départ du joueur 0 (la caméra y commence), à côté de son commandant
    let (sx, sy) = w.map.starts[0];
    let (x0, y0) = ((sx - 30).clamp(4, w.map.w - 124), (sy - 36).clamp(4, w.map.h - 84));
    flat(&mut w, x0, y0, x0 + 120, y0 + 80);
    let keys = ["moto", "light_tank", "artillery", "assault_walker", "line_robot", "hover_tank"];
    let kinds: Vec<u16> = keys.iter().map(|k| UNITS.iter().position(|u| u.key == *k).unwrap() as u16).collect();
    for r in 0..4 {
        for c in 0..6 {
            let kind = kinds[((r * 6 + c) % 6) as usize];
            let id = w.spawn_unit(kind, 0, (x0 + 20 + c * 2) * TILE + TILE / 2, (y0 + 30 + r * 2) * TILE + TILE / 2);
            if let Some(s) = w.unit(id) {
                w.units.facing[s] = 0;
            }
        }
    }
    w
}

/// Démonstration des anneaux, de la porte et des droïdes (?demo=anciens) : deux portes reliées que des
/// unités traversent en boucle, deux plateformes d'anneaux qui échangent leurs unités toutes les 20 s,
/// des droïdes roulants qui chargent puis se déploient face à des robots adverses immobiles, un
/// générateur de bouclier mobile, des disrupteurs face à des réplicateurs, un socle à EPPZ.
pub fn anciens_demo() -> World {
    let mut w = World::new(&[17, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
        pl.eppz = 1;
    }
    let (sx, sy) = w.map.starts[0];
    let (x0, y0) = ((sx - 30).clamp(4, w.map.w - 154), (sy - 36).clamp(4, w.map.h - 104));
    flat(&mut w, x0, y0, x0 + 150, y0 + 100);
    let key = |k: &str| UNITS.iter().position(|u| u.key == k).unwrap() as u16;
    // portes : A regarde vers l'est, B vers l'ouest ; reliées et ouvertes
    let a = place_building(&mut w, 0, B_GATE, x0 + 20, y0 + 16, 0).unwrap();
    let b = place_building(&mut w, 0, B_GATE, x0 + 50, y0 + 16, 2).unwrap();
    complete_building(&mut w, a);
    complete_building(&mut w, b);
    let (ra, rb) = (w.building_ref(a), w.building_ref(b));
    w.buildings[a].link = rb;
    w.buildings[b].link = ra;
    let (acx, acy) = w.buildings[a].center();
    for k in 0..6 {
        let kind = key(["line_robot", "moto", "light_tank"][k % 3]);
        let (ux, uy) = (acx + (6 + k as i32 * 2) * TILE, acy + ((k as i32 % 3) - 1) * TILE);
        let id = w.spawn_unit(kind, 0, ux, uy);
        if let Some(s) = w.unit(id) {
            w.units.cold[s].orders.push(Order::Patrol { x: acx, y: acy, ox: ux, oy: uy });
        }
    }
    // anneaux : deux plateformes à 25 cases, relance automatique
    let r1 = place_building(&mut w, 0, B_TRANSFER, x0 + 20, y0 + 45, 0).unwrap();
    let r2 = place_building(&mut w, 0, B_TRANSFER, x0 + 45, y0 + 45, 0).unwrap();
    complete_building(&mut w, r1);
    complete_building(&mut w, r2);
    let rr2 = w.building_ref(r2);
    w.buildings[r1].repeat = true;
    w.buildings[r1].target = rr2;
    w.buildings[r1].cooldown = 60;
    let (c1x, c1y) = w.buildings[r1].center();
    for k in 0..4 {
        w.spawn_unit(key("line_robot"), 0, c1x + [-1, 1, 0, 0][k] * TILE / 2 * 3, c1y + [0, 0, -1, 1][k] * TILE / 2 * 3);
    }
    // droïdes roulants face à des robots adverses immobiles ; bouclier mobile
    for k in 0..4 {
        let id = w.spawn_unit(U_ROLL_DROID, 0, (x0 + 75) * TILE, (y0 + 30 + k * 3) * TILE);
        if let Some(s) = w.unit(id) {
            w.units.cold[s].orders.push(Order::Move { x: (x0 + 92) * TILE, y: (y0 + 34) * TILE, gx: (x0 + 92) * TILE, gy: (y0 + 34) * TILE, attack: true, eta: 0 });
        }
    }
    for k in 0..5 {
        let id = w.spawn_unit(key("line_robot"), 1, (x0 + 108) * TILE, (y0 + 28 + k * 3) * TILE);
        if let Some(s) = w.unit(id) {
            w.units.cold[s].stun = 60000;
        }
    }
    w.spawn_unit(key("mobile_shield"), 0, (x0 + 80) * TILE, (y0 + 52) * TILE);
    // disrupteurs face à des réplicateurs (au joueur 1, pour l'image)
    for k in 0..3 {
        w.spawn_unit(U_DISRUPTOR, 0, (x0 + 75) * TILE, (y0 + 70 + k * 3) * TILE);
        w.spawn_unit(U_REPLICATOR, 1, (x0 + 95) * TILE, (y0 + 70 + k * 3) * TILE);
    }
    // socle à EPPZ
    if let Some(s) = place_building(&mut w, 0, B_EPPZ_SOCKET, x0 + 20, y0 + 70, 0) {
        complete_building(&mut w, s);
    }
    w
}

/// Galerie des projectiles : une rangée par arme, chaque tireur bombarde le sol à 20 cases devant lui
/// (rien ne riposte) ; des transports adverses immobiles servent de cibles aux armes antiaériennes.
/// Les navires sont posés à terre : ils ne bougent pas mais tirent.
pub fn projectiles_demo() -> World {
    let mut w = World::new(&[11, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    let (x0, y0) = (w.map.w / 2 - 40, w.map.h / 2 - 60);
    const SHOOTERS: [u16; 25] = [4, 5, 6, 7, 10, 11, 12, 14, 15, 16, 17, 18, 23, 24, 31, 32, 33, 36, 37, 38, 40, 41, 44, 46, 48];
    flat(&mut w, x0 - 10, y0 - 6, x0 + 40, y0 + SHOOTERS.len() as i32 * 4 + 6);
    for (i, &kind) in SHOOTERS.iter().enumerate() {
        let y = y0 + i as i32 * 4;
        let id = w.spawn_unit(kind, 0, x0 * TILE + TILE / 2, y * TILE + TILE / 2);
        if let Some(s) = w.unit(id) {
            let (tx, ty) = ((x0 + 20) * TILE + TILE / 2, y * TILE + TILE / 2);
            crate::orders::give(&mut w, s, false, Order::AttackGround { x: tx, y: ty });
        }
    }
    // antiaérien : défense mobile, chasseur de supériorité, sous-marin (torpilles sur un navire)
    for (k, &kind) in [8u16, 25, 20].iter().enumerate() {
        w.spawn_unit(kind, 0, (x0 - 6) * TILE, (y0 + 10 + k as i32 * 30) * TILE);
    }
    for k in 0..6 {
        w.spawn_unit(22, 1, (x0 + 2 + k * 2) * TILE, (y0 + 10 + (k % 3) * 30) * TILE);
    }
    w.spawn_unit(28, 0, (x0 - 6) * TILE, (y0 + 100) * TILE);
    w.spawn_unit(27, 1, (x0 + 4) * TILE, (y0 + 100) * TILE);
    w
}
