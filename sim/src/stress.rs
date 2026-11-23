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
        pl.researched2 = u64::MAX;
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

/// Démo de la ponte de la Souche (?demo=ponte) : le joueur 0 (Souche) a quatre couveuses autour de sa
/// graine-mère, qui pondent en boucle (rongeurs, cracheurs, carapaces, planeurs à membranes) grâce à une
/// réserve sans fond ; des chars adverses viennent tirer sur la première portée. Le client y joue le
/// joueur 0 en local : on peut cliquer sur une couveuse, un œuf, et changer les files.
pub fn ponte_demo() -> World {
    let mut w = World::new(&[19, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    let (sx, sy) = w.map.starts[0];
    flat(&mut w, sx - 40, sy - 40, sx + 40, sy + 40);
    w.place_start_buildings();
    for t in [T_S_SPITTERS, T_S_SHELLS, T_S_VINES, T_S_MEMBRANES] {
        w.players[0].set_tech(t);
    }
    let heart = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == 0 && w.buildings[b].kind == B_SEED_HEART);
    let Some(heart) = heart else { return w };
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    // une couveuse de chaque côté de la graine-mère, sortie vers l'extérieur
    let mut broods = Vec::new();
    for (dx, dy, dir, kind) in [(4, 0, 0u8, U_GNAWER), (0, 4, 1, U_SPITTER), (-4, 0, 2, U_SHELL), (0, -4, 3, U_MEMBRANE)] {
        if let Some(b) = place_building(&mut w, 0, B_BROOD, hx + dx, hy + dy, dir) {
            complete_building(&mut w, b);
            broods.push((b, kind));
        }
    }
    // le réseau se forme, puis reçoit une réserve sans fond
    for _ in 0..10 {
        w.step(&[]);
    }
    for &(b, kind) in &broods {
        let net = w.buildings[b].net as usize;
        if net != 0 {
            w.nets[net].seve = 1_000_000;
            w.nets[net].sels = 1_000_000;
        }
        w.buildings[b].queue.push((kind, 1));
        w.buildings[b].repeat = true;
        w.buildings[b].wake = 0;
        // ralliement à l'écart, pour que les œufs suivants aient la place
        let (cx, cy) = w.buildings[b].center();
        let (rx, ry) = w.buildings[b].rally;
        w.buildings[b].rally = (cx + (rx - cx) * 3, cy + (ry - cy) * 3);
    }
    // quatre chars adverses viennent de l'est : ils tirent sur la première portée de rongeurs
    let (cx, cy) = w.buildings[heart].center();
    for k in 0..4 {
        let id = w.spawn_unit(U_LIGHT_TANK, 1, cx + 44 * TILE, cy + (k - 2) * 2 * TILE);
        if let Some(s) = w.unit(id) {
            let (tx, ty) = (cx + 9 * TILE, cy);
            w.units.cold[s].orders.push(Order::Move { x: tx, y: ty, gx: tx, gy: ty, attack: true, eta: 0 });
        }
    }
    w
}

/// Démo de la Souche, suite (?demo=essaim) : autour de la graine-mère du joueur 0, tous les nouveaux organes
/// (rhizome, ronces, deux terriers reliés, panse et ses épaves, sporange, cocon qui mûrit, frayère sur un
/// lac), la Reine qui s'enracine, des racines qui étranglent une fonderie ennemie, un exemplaire de chaque
/// nouvel organisme, des vessies lâchées sur des chars et des flaques d'acide. On y joue le joueur 0.
pub fn essaim_demo() -> World {
    let mut w = World::new(&[19, 512, 1, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 0, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    let (sx, sy) = w.map.starts[0];
    flat(&mut w, sx - 50, sy - 45, sx + 50, sy + 45);
    w.place_start_buildings();
    for t in (T_S_SPITTERS..=T_S_BIG_LEAVES).chain(T_S_BRAMBLES..=T_S_BEHEMOTH) {
        // une mutation de chaque paire
        if !matches!(t, T_S_QUICK_SAP | T_S_FERTILITY | T_S_DEEP_ROOTS | T_S_STICKY | T_S_SPINES) {
            w.players[0].set_tech(t);
        }
    }
    let heart = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == 0 && w.buildings[b].kind == B_SEED_HEART);
    let Some(heart) = heart else { return w };
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    let put = |w: &mut World, owner: u8, kind: u16, x: i32, y: i32| -> Option<usize> {
        let b = place_building(w, owner, kind, x, y, 0)?;
        complete_building(w, b);
        Some(b)
    };
    // câble vers l'est (rhizome au bout), vers l'ouest et vers le sud
    for k in 0..14 {
        put(&mut w, 0, B_ROOT, hx + 3 + k, hy + 1);
        put(&mut w, 0, B_ROOT, hx - 1 - k, hy + 1);
    }
    for k in 0..9 {
        put(&mut w, 0, B_ROOT, hx + 1, hy + 3 + k);
    }
    put(&mut w, 0, B_RHIZOME, hx + 17, hy + 1);
    put(&mut w, 0, B_SPORANGIUM, hx + 18, hy - 3);
    put(&mut w, 0, B_COCOON, hx + 8, hy - 5);
    put(&mut w, 0, B_MATRIX, hx - 4, hy - 2);
    put(&mut w, 0, B_LEAVES, hx - 8, hy - 2);
    put(&mut w, 0, B_BROOD, hx + 4, hy + 3);
    let maw = put(&mut w, 0, B_MAW, hx - 6, hy + 3);
    let a = put(&mut w, 0, B_BURROW, hx + 3, hy - 3);
    let b = put(&mut w, 0, B_BURROW, hx + 20, hy + 5);
    for k in 0..7 {
        put(&mut w, 0, B_BRAMBLE, hx - 16 + k, hy - 2);
    }
    // une fonderie ennemie au bout du câble ouest, déjà étreinte
    put(&mut w, 1, B_FURNACE, hx - 16, hy + 1);
    // un lac au sud, la frayère sur l'eau
    let lvl = w.map.water_level;
    for y in hy + 11..hy + 30 {
        for x in hx - 12..hx + 15 {
            let i = w.map.idx(x, y);
            if w.map.occ[i] == 0 {
                w.map.height[i] = lvl.saturating_sub(12);
                w.map.update_pass(x, y);
            }
        }
    }
    put(&mut w, 0, B_SPAWNERY, hx, hy + 12);
    w.nav = crate::flow::Nav::new(&w.map);
    for _ in 0..10 {
        w.step(&[]);
    }
    let net = w.buildings[heart].net as usize;
    if net != 0 {
        w.nets[net].seve = 1_000_000;
        w.nets[net].sels = 1_000_000;
    }
    if let (Some(a), Some(b)) = (a, b) {
        crate::souche::link_burrow(&mut w, a, b);
    }
    if let Some(m) = maw {
        let (cx, cy) = w.buildings[m].center();
        w.spawn_wreck(cx - 4 * TILE, cy + 5 * TILE, &[(STEEL, 400)], 2, 1 + U_LIGHT_TANK, 9000);
        w.spawn_wreck(cx + 3 * TILE, cy + 4 * TILE, &[(STEEL, 400)], 2, 1 + U_ASSAULT_WALKER, 30000);
    }
    w.players[0].purse[ADN as usize] = 300;
    w.players[0].scars = [5200, 3100, 800, 0, 1500];
    // la Reine s'enracine au nord-ouest de la graine-mère
    if let Some(q) = w.unit(w.players[0].commander) {
        w.units.x[q] = (hx - 1) * TILE;
        w.units.y[q] = (hy - 1) * TILE;
        crate::essaim::toggle_root(&mut w, q);
    }
    // un exemplaire de chaque nouvel organisme, en rang au nord
    for (k, kind) in [U_BURSTER, U_DART, U_BURROWER, U_NURSE, U_SHELL, U_HORNET].into_iter().enumerate() {
        w.spawn_unit(kind, 0, (hx - 2 + 3 * k as i32) * TILE, (hy - 9) * TILE);
    }
    w.spawn_unit(U_MORAY, 0, (hx - 5) * TILE, (hy + 16) * TILE);
    w.spawn_unit(U_LEVIATHAN, 0, (hx + 8) * TILE, (hy + 15) * TILE);
    w.spawn_unit(U_BEHEMOTH, 0, (hx + 27) * TILE, (hy - 4) * TILE);
    // des chars arrivent de l'est ; des vessies et des cracheurs les attendent
    for k in 0..6 {
        let id = w.spawn_unit(U_LIGHT_TANK, 1, (hx + 46) * TILE, (hy - 4 + 2 * k) * TILE);
        if let Some(s) = w.unit(id) {
            let (tx, ty) = ((hx + 26) * TILE, (hy + 2) * TILE);
            w.units.cold[s].orders.push(Order::Move { x: tx, y: ty, gx: tx, gy: ty, attack: true, eta: 0 });
        }
        w.spawn_unit(if k % 2 == 0 { U_BURSTER } else { U_SPITTER }, 0, (hx + 24) * TILE, (hy - 2 + 2 * k) * TILE);
    }
    crate::essaim::spill(&mut w, 0, (hx + 12) * TILE, (hy + 8) * TILE, 420, 8, 2000);
    crate::essaim::spill(&mut w, 0, (hx + 15) * TILE, (hy + 9) * TILE, 600, 8, 2000);
    w
}

/// Démo des ascenseurs de tapis (?demo=ascenseurs) : deux extracteurs du joueur 0 alimentent quatre files
/// qui changent de niveau. Tapis roulant : sol, étage 1, étage 2, puis retour au sol. Tapis rapide : une
/// montée suivie aussitôt d'une descente, puis un ascenseur pris par le côté (virage). Tapis express :
/// les deux étages à la suite. Tapis roulant vers le sud : montée et descente dans l'autre axe.
pub fn lifts_demo() -> World {
    let mut w = World::new(&[7, 512, 0, 2, 0, 0, 100, 100, 0, 0, 100, 100]);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
    }
    let (sx, sy) = w.map.starts[0];
    let (x0, y0) = ((sx + 4).clamp(8, w.map.w - 40), (sy - 8).clamp(8, w.map.h - 40));
    flat(&mut w, x0 - 6, y0 - 6, x0 + 30, y0 + 26);
    let put = |w: &mut World, kind: u16, x: i32, y: i32, dir: u8, floor: u8| {
        if let Some(b) = place_building(w, 0, kind, x, y, dir | floor << 3) {
            complete_building(w, b);
        }
    };
    let mine = |w: &mut World, x: i32, y: i32, ore: u8| {
        for dy in 0..2 {
            for dx in 0..2 {
                let i = w.map.idx(x + dx, y + dy);
                w.map.deposit[i] = ore;
            }
        }
        w.map.spots.push(crate::map::Spot { kind: ore, x, y, purity: 0 });
        put(w, B_EXTRACTOR, x, y, 0, 0);
    };
    // file vers l'est : (première case, dernière case, niveau)
    let east = |w: &mut World, kind: u16, y: i32, runs: &[(i32, i32, u8)]| {
        for &(a, b, floor) in runs {
            for x in a..=b {
                put(w, kind, x0 + x, y, 0, floor);
            }
        }
    };
    mine(&mut w, x0, y0, IRON_ORE);
    // tapis roulant : sol, étage 1, étage 2, étage 1, sol, dépôt
    east(&mut w, B_BELT1, y0, &[(2, 5, 0), (6, 9, 1), (10, 13, 2), (14, 16, 1), (17, 19, 0)]);
    put(&mut w, B_DEPOT, x0 + 20, y0, 0, 0);
    // tapis rapide : montée et descente collées, virage vers le sud, puis ascenseur pris par le côté
    east(&mut w, B_BELT2, y0 + 1, &[(2, 3, 0), (4, 4, 1), (5, 7, 0)]);
    for y in y0 + 1..y0 + 5 {
        put(&mut w, B_BELT2, x0 + 8, y, 1, 0);
    }
    east(&mut w, B_BELT2, y0 + 5, &[(8, 8, 0), (9, 13, 1), (14, 16, 0)]);
    put(&mut w, B_DEPOT, x0 + 17, y0 + 5, 0, 0);
    mine(&mut w, x0, y0 + 10, COPPER_ORE);
    // tapis express : les deux étages à la suite, puis retour au sol
    east(&mut w, B_BELT3, y0 + 10, &[(2, 4, 0), (5, 6, 1), (7, 9, 2), (10, 10, 1), (11, 13, 0)]);
    put(&mut w, B_DEPOT, x0 + 14, y0 + 10, 0, 0);
    // tapis roulant vers le sud : montée, étage 1, descente
    east(&mut w, B_BELT1, y0 + 11, &[(2, 4, 0)]);
    for (y, floor) in [(11, 0u8), (12, 0), (13, 1), (14, 1), (15, 1), (16, 1), (17, 0), (18, 0)] {
        put(&mut w, B_BELT1, x0 + 5, y0 + y, 1, floor);
    }
    put(&mut w, B_DEPOT, x0 + 5, y0 + 19, 0, 0);
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

/// Démo des chantiers (?demo=chantiers) : chantiers du joueur 0 à tous les avancements, sans
/// constructeur (ils restent figés) — bâtiments des Industriels, organes et racines de la Souche, files de
/// tapis (avancement croissant le long de la file), rails, répartiteurs, bras, murs ; un chantier endommagé.
/// Sert à vérifier les barres de progression des chantiers.
pub fn chantiers_demo() -> World {
    let mut w = World::new(&[23, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    for pl in w.players.iter_mut() {
        pl.researched = u64::MAX;
        pl.researched2 = u64::MAX;
    }
    let (sx, sy) = w.map.starts[0];
    let (x0, y0) = ((sx + 4).clamp(8, w.map.w - 60), (sy - 12).clamp(8, w.map.h - 40));
    flat(&mut w, x0 - 4, y0 - 4, x0 + 50, y0 + 30);
    // chantier à l'avancement f (sur 1000), points de vie montés avec lui (comme sur un vrai chantier)
    let site = |w: &mut World, kind: u16, x: i32, y: i32, dir: u8, f: u32| -> Option<usize> {
        let b = place_building(w, 0, kind, x, y, dir)?;
        let bb = &mut w.buildings[b];
        bb.build = (BUILD_FULL as u64 * f as u64 / 1000) as u32;
        bb.hp = ((bb.def().hp as i64 * f as i64 + 999) / 1000).max(1) as i32;
        Some(b)
    };
    // bâtiments des Industriels, puis organes de la Souche
    let mut x = x0;
    for (k, kind) in [B_ASSEMBLER1, B_FURNACE, B_LAB, B_DEPOT, B_LIGHT_TURRET, B_LAND_FACTORY].into_iter().enumerate() {
        site(&mut w, kind, x, y0, 0, 120 + 150 * k as u32);
        x += bdef(kind).size.0 as i32 + 2;
    }
    let mut x = x0;
    for (k, kind) in [B_LEAVES, B_BULB, B_MATRIX, B_THORN, B_BLOOM].into_iter().enumerate() {
        let b = site(&mut w, kind, x, y0 + 7, 0, 200 + 170 * k as u32);
        // l'épine a reçu des coups : moins de points de vie que son avancement
        if kind == B_THORN {
            if let Some(b) = b {
                w.buildings[b].hp /= 3;
            }
        }
        x += bdef(kind).size.0 as i32 + 2;
    }
    for k in 0..6 {
        site(&mut w, B_ROOT, x + k, y0 + 7, 0, 150 * (k as u32 + 1));
    }
    // files de tapis : l'avancement croît le long de la file
    for (row, kind, n) in [(12, B_BELT1, 30), (13, B_BELT2, 20), (14, B_BELT3, 12)] {
        for k in 0..n {
            site(&mut w, kind, x0 + k, y0 + row, 0, (1000 * (k as u32 + 1)) / (n as u32 + 1));
        }
    }
    // rails, répartiteurs et trieur, bras, murs, relais
    for k in 0..10 {
        site(&mut w, B_RAIL, x0 + 2 * k, y0 + 17, 0, 90 * (k as u32 + 1));
    }
    for (k, kind) in [B_SPLITTER, B_SORTER, B_OVERFLOW, B_INSERTER, B_LONG_INSERTER, B_PYLON].into_iter().enumerate() {
        site(&mut w, kind, x0 + 3 * k as i32, y0 + 21, 0, 140 * (k as u32 + 1));
    }
    for k in 0..8 {
        site(&mut w, B_WALL, x0 + 20 + k, y0 + 21, 0, 110 * (k as u32 + 1));
    }
    w
}

/// Démonstration des améliorations des Transhumants (`?demo=arche`, joueur 0) : une Arche à grande bulle, canon lourd
/// et couronne de neuf tourelles déployées, une Arche nue à équiper, les modules aménagés, et un siège de chars.
pub fn arche_demo() -> World {
    use crate::ameliorations as am;
    let mut w = World::new(&[29, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 0, RACE_TRANSH as i32, RACE_INDUS as i32]);
    w.infinite_grid = true;
    let (cx, cy) = (w.map.w / 2, w.map.h / 2);
    flat(&mut w, cx - 46, cy - 30, cx + 46, cy + 30);
    for (t, d) in TECHS.iter().enumerate() {
        if d.race == RACE_TRANSH {
            w.players[0].set_tech(t as u8);
        }
    }
    w.players[0].purse[RELEVES as usize] = 600;
    let Some(a) = w.unit(w.players[0].commander) else { return w };
    let place = |w: &mut World, s: usize, x: i32, y: i32| {
        w.units.x[s] = x * TILE + TILE / 2;
        w.units.y[s] = y * TILE + TILE / 2;
        w.units.px[s] = w.units.x[s];
        w.units.py[s] = w.units.y[s];
        w.units.facing[s] = 0;
    };
    place(&mut w, a, cx - 8, cy);
    let fitted = [am::M_W_SIEGE, am::M_SHIELD3, am::M_TURRETS3, am::M_ENGINE2, am::M_REPAIR];
    w.units.cold[a].mods = fitted.iter().fold(0u64, |m, &k| m | (k as u64) << (8 * am::MODS[k as usize].slot));
    w.units.cold[a].shield = 9000;
    for it in 1..=ENERGY_CELL {
        crate::drones::put(&mut w.units.cold[a].hold, it, 400);
    }
    am::order_turrets(&mut w, a, 1);
    // une Arche nue, à équiper ; ses composants viennent de la soute de la première
    let id = w.spawn_unit(U_ARK, 0, (cx - 14) * TILE, (cy + 12) * TILE);
    if let Some(b) = w.unit(id) {
        w.units.facing[b] = 0;
    }
    // modules aménagés (premier choix d'un côté, second de l'autre) et chenillards
    let kinds = [B_T_FURNACE, B_T_ASSEMBLER, B_T_GENERATOR, B_T_HOLD, B_T_LAB, B_T_BASTION];
    for (k, &kind) in kinds.iter().enumerate() {
        for (j, y) in [cy - 14, cy - 10].into_iter().enumerate() {
            let Some(b) = place_building(&mut w, 0, kind, cx - 28 + 3 * k as i32, y, 0) else { continue };
            complete_building(&mut w, b);
            let host = crate::transhumants::chenillard_of(kind);
            let ids: Vec<u8> = (1..am::MODS.len() as u8).filter(|&m| am::MODS[m as usize].host == host).collect();
            w.buildings[b].mods = ids.get(j).copied().unwrap_or(0) as u64;
            w.buildings[b].fuel = START_FUEL_UNITS * FUEL_HYDROCARBON;
        }
    }
    for (k, kind) in [U_RIDER, U_RAM, U_HARROW, U_TOWED_GUN].into_iter().enumerate() {
        w.spawn_unit(kind, 0, (cx - 26) * TILE, (cy - 2 + 3 * k as i32) * TILE);
    }
    for k in 0..10 {
        w.spawn_unit(U_LIGHT_TANK, 1, (cx + 40 + (k % 2) * 2) * TILE, (cy - 10 + 2 * k) * TILE);
    }
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && w.units.owner[s] == 1 && w.units.kind[s] == U_LIGHT_TANK {
            w.units.hp[s] = 6000;
            let (x, y) = ((cx - 8) * TILE, cy * TILE);
            w.units.cold[s].orders.push(Order::Move { x, y, gx: x, gy: y, attack: true, eta: 0 });
        }
    }
    w.power_dirty = true;
    w
}

/// Démo des Transhumants (`?demo=nomades`) : une soute déployée et garnie, trois chariots de convoi (deux
/// rapportent la sortie d'une fonderie éloignée, un livre des plaques à un assembleur éloigné), un
/// générateur nomade et une file de poteaux relais. Réseau partout.
pub fn nomades_demo() -> World {
    let mut w = World::new(&[23, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    w.players[0].race = RACE_TRANSH;
    let (sx, sy) = w.map.starts[0];
    let (x0, y0) = ((sx - 20).clamp(8, w.map.w - 50), (sy - 6).clamp(8, w.map.h - 30));
    flat(&mut w, x0 - 4, y0 - 6, x0 + 44, y0 + 16);
    let put = |w: &mut World, kind: u16, x: i32, y: i32| -> Option<usize> {
        let b = place_building(w, 0, kind, x, y, 0)?;
        complete_building(w, b);
        Some(b)
    };
    let recipe = |key: &str| RECIPES.iter().position(|r| r.key == key).unwrap_or(0) as u8;
    let (hx, hy) = (x0 + 20, y0 + 4);
    let Some(h) = put(&mut w, B_T_HOLD, hx, hy) else { return w };
    crate::drones::put(&mut w.buildings[h].stash, IRON_PLATE, 300);
    crate::drones::put(&mut w.buildings[h].stash, GEAR, 60);
    if let Some(f) = put(&mut w, B_T_FURNACE, hx + 18, hy) {
        w.buildings[f].recipe = recipe("iron_plate");
        w.buildings[f].out = 60;
        let fr = w.building_ref(f);
        for _ in 0..2 {
            if crate::transhumants::hitch(&mut w, h) {
                let s = *crate::transhumants::carts_of(&w, h).last().unwrap();
                w.units.cold[s].orders.push(Order::Haul { site: fr, feed: false });
            }
        }
    }
    if let Some(a) = put(&mut w, B_T_ASSEMBLER, hx - 18, hy) {
        w.buildings[a].recipe = recipe("gear");
        let ar = w.building_ref(a);
        if crate::transhumants::hitch(&mut w, h) {
            let s = *crate::transhumants::carts_of(&w, h).last().unwrap();
            w.units.cold[s].orders.push(Order::Haul { site: ar, feed: true });
        }
    }
    if let Some(g) = put(&mut w, B_T_GENERATOR, hx, hy + 6) {
        w.buildings[g].fuel = START_FUEL_UNITS * FUEL_HYDROCARBON;
        for k in 1..=3 {
            crate::transhumants::plant_pole(&mut w, g, hx + 1 + 11 * k, hy + 8);
        }
    }
    w.power_dirty = true;
    w
}

/// Démo des relais logistiques (`?demo=relais`, joueur 0) : un dépôt garni, une chaîne de trois relais, au
/// bout un ingénieur qui bâtit trois chantiers et une usine terrestre qui produit : les drones des relais leur
/// portent tout depuis le dépôt, à 100 cases. Commandant à côté du dépôt, soute vide. Réseau partout.
pub fn relais_demo() -> World {
    let mut w = World::new(&[23, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    w.players[0].researched = u64::MAX;
    let (sx, sy) = w.map.starts[0];
    let (x0, y0) = ((sx - 50).clamp(8, w.map.w - 140), (sy - 10).clamp(8, w.map.h - 40));
    flat(&mut w, x0 - 4, y0 - 8, x0 + 128, y0 + 26);
    let put = |w: &mut World, kind: u16, x: i32, y: i32| -> Option<usize> {
        let b = place_building(w, 0, kind, x, y, 0)?;
        complete_building(w, b);
        Some(b)
    };
    if let Some(d) = put(&mut w, B_DEPOT, x0, y0) {
        for (it, n) in [(IRON_PLATE, 600), (COPPER_PLATE, 400), (GEAR, 300), (CIRCUIT, 300), (STEEL, 200)] {
            crate::drones::put(&mut w.buildings[d].stash, it, n);
        }
    }
    for k in 0..3 {
        put(&mut w, B_RELAY, x0 + 10 + 38 * k, y0);
    }
    if let Some(c) = w.unit(w.players[0].commander) {
        w.units.cold[c].hold.clear();
        for (v, t) in [(&mut w.units.x, x0 - 6), (&mut w.units.px, x0 - 6)] {
            v[c] = t * TILE;
        }
        for v in [&mut w.units.y, &mut w.units.py] {
            v[c] = (y0 + 1) * TILE;
        }
    }
    let id = w.spawn_unit(U_ENG1, 0, (x0 + 100) * TILE, (y0 + 6) * TILE);
    if let Some(s) = w.unit(id) {
        for (k, kind) in [B_GENERATOR, B_LAB, B_FURNACE].into_iter().enumerate() {
            w.units.cold[s].orders.push(Order::Build { kind, x: x0 + 96 + 5 * k as i32, y: y0 + 10, dir: 0, bid: 0 });
        }
    }
    if let Some(f) = put(&mut w, B_LAND_FACTORY, x0 + 92, y0 - 6) {
        w.buildings[f].queue.push((U_LINE_ROBOT, 20));
        w.buildings[f].repeat = true;
    }
    w
}
