//! Tests des Transhumants : chariots et soutes, repli, départ, atelier de secours de l'Arche, relevés, race amphibie
//! (voir docs/spec/races.md).

use crate::buildings::{complete_building, place_building, remove_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::orders::*;
use crate::world::*;

fn game() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_TRANSH as i32, 0]);
    w.place_start_buildings();
    w
}

fn order(w: &mut World, cmd: i32, args: &[i32]) {
    let mut o = vec![0, cmd, 0];
    o.extend_from_slice(args);
    o[0] = o.len() as i32 - 1;
    w.step(&o);
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

fn all(w: &World, kind: u16) -> Vec<usize> {
    (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0 && w.units.kind[s] == kind).collect()
}

fn buildings(w: &World, kind: u16) -> Vec<usize> {
    (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].owner == 0 && w.buildings[b].kind == kind).collect()
}

fn has(w: &World, b: usize, it: u8) -> u16 {
    crate::drones::has(&w.buildings[b].stash, it)
}

fn stock(w: &mut World, b: usize, it: u8, n: u16) {
    crate::drones::put(&mut w.buildings[b].stash, it, n);
}

fn rec(k: &str) -> u8 {
    RECIPES.iter().position(|r| r.key == k).unwrap() as u8
}

/// Terrain plat (sans gisement) ; `height` sous 100 : de l'eau.
fn flatten(w: &mut World, x0: i32, y0: i32, x1: i32, y1: i32, height: u8) {
    w.map.spots.retain(|s| !(s.x >= x0 - 2 && s.x <= x1 && s.y >= y0 - 2 && s.y <= y1));
    for y in y0..y1 {
        for x in x0..x1 {
            let i = w.map.idx(x, y);
            w.map.height[i] = height;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.wear.resize(w.map.spots.len(), 0);
}

fn spot(w: &mut World, kind: u8, x: i32, y: i32) {
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(x + dx, y + dy);
            w.map.deposit[i] = kind;
        }
    }
    w.map.spots.push(crate::map::Spot { kind, x, y, purity: 0 });
    w.wear.resize(w.map.spots.len(), 0);
}

/// Terrain plat autour du départ, électricité partout ; (x, y) : le départ.
fn base() -> (World, i32, i32) {
    let mut w = game();
    let (sx, sy) = w.map.starts[0];
    flatten(&mut w, sx - 34, sy - 34, sx + 34, sy + 34, 150);
    w.infinite_grid = true;
    w.power_dirty = true;
    (w, sx, sy)
}

fn put(w: &mut World, kind: u16, x: i32, y: i32, recipe: u8) -> usize {
    let b = place_building(w, 0, kind, x, y, 0).expect("pose");
    complete_building(w, b);
    if recipe != RECIPE_NONE {
        w.buildings[b].recipe = recipe;
        w.buildings[b].repeat = true;
    }
    b
}

fn bref(w: &World, b: usize) -> i32 {
    w.building_ref(b) as i32
}

/// Attelle un chariot à la soute, payé d'office.
fn cart(w: &mut World, h: usize) -> usize {
    stock(w, h, IRON_PLATE, 6);
    stock(w, h, GEAR, 2);
    let before = all(w, U_T_CART);
    let r = bref(w, h);
    order(w, O_HITCH, &[r]);
    *all(w, U_T_CART).iter().find(|s| !before.contains(s)).expect("chariot attelé")
}

fn haul(w: &mut World, c: usize, site: usize, feed: bool) {
    let (id, r) = (w.unit_id(c) as i32, bref(w, site));
    order(w, O_HAUL, &[if feed { 2 } else { 0 }, r, 1, id]);
}

fn fold(w: &mut World, b: usize) {
    let r = bref(w, b);
    order(w, O_PACK, &[1, r]);
    steps(w, crate::transhumants::FOLD_TICKS as u32 + 2);
}

fn deploy(w: &mut World, s: usize) {
    let id = w.unit_id(s) as i32;
    order(w, O_DEPLOY, &[1, id]);
    steps(w, crate::transhumants::DEPLOY_TICKS as u32 + 5);
}

// ---------- chariots ----------

/// Des modules collés à la soute, du côté par où le chariot arrive, ne l'empêchent pas de livrer.
#[test]
fn carts_unload_over_modules_glued_to_the_hold() {
    let delivered = |walls: &[(i32, i32)]| {
        let (mut w, x, y) = base();
        spot(&mut w, HYDROCARBON, x + 22, y + 20);
        let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
        let d = put(&mut w, B_T_DRILL, x + 22, y + 20, RECIPE_NONE);
        for &(dx, dy) in walls {
            put(&mut w, B_T_ASSEMBLER, x + dx, y + 20 + dy, RECIPE_NONE);
        }
        let c = cart(&mut w, h);
        haul(&mut w, c, d, false);
        steps(&mut w, 3600);
        has(&w, h, HYDROCARBON)
    };
    let alone = delivered(&[]);
    assert!(alone > 60, "soute seule : {alone}");
    let walled = delivered(&[(2, 0), (0, 2), (0, -2), (-2, 0), (2, 2), (2, -2), (-2, 2), (-2, -2)]);
    assert!(walled as u32 * 10 >= alone as u32 * 8, "entourée de modules : {walled} au lieu de {alone}");
}

/// Un fabricant entouré de modules est livré, et vidé.
#[test]
fn carts_serve_a_crafter_walled_in_by_modules() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    stock(&mut w, h, IRON_PLATE, 400);
    let a = put(&mut w, B_T_ASSEMBLER, x + 18, y + 20, rec("gear"));
    for (dx, dy) in [(2, 0), (-2, 0), (0, 2), (0, -2), (2, 2), (-2, 2), (2, -2), (-2, -2)] {
        put(&mut w, B_T_LAB, x + 18 + dx, y + 20 + dy, RECIPE_NONE);
    }
    let (c1, c2) = (cart(&mut w, h), cart(&mut w, h));
    haul(&mut w, c1, a, true);
    haul(&mut w, c2, a, false);
    steps(&mut w, 3600);
    assert!(has(&w, h, GEAR) >= 10, "engrenages rapportés : {} (faits : {})", has(&w, h, GEAR), w.players[0].produced[GEAR as usize]);
}

/// Après une halte par-dessus des modules, le chariot repart vraiment : il ne charge pas de loin.
#[test]
fn a_cart_stopped_by_modules_still_drives_to_its_next_stop() {
    let (mut w, x, y) = base();
    spot(&mut w, IRON_ORE, x + 8, y + 20);
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let d = put(&mut w, B_T_DRILL, x + 8, y + 20, RECIPE_NONE);
    put(&mut w, B_T_ASSEMBLER, x + 2, y + 20, RECIPE_NONE);
    put(&mut w, B_T_ASSEMBLER, x + 2, y + 22, RECIPE_NONE);
    put(&mut w, B_T_ASSEMBLER, x + 2, y + 18, RECIPE_NONE);
    let c = cart(&mut w, h);
    haul(&mut w, c, d, false);
    let mut near_drill = false;
    let mut max = 0;
    for _ in 0..1200 {
        w.step(&[]);
        let load = crate::drones::total(&w.units.cold[c].hold);
        if load > max {
            let dx = (w.units.x[c] - (x + 9) * TILE).abs().max((w.units.y[c] - (y + 21) * TILE).abs());
            near_drill = dx <= 4 * TILE;
            assert!(near_drill, "chargé à {} cases de la foreuse", dx / TILE);
            max = load;
        }
        if load == 0 {
            max = 0;
        }
    }
    assert!(near_drill && has(&w, h, IRON_ORE) > 0);
}

/// Le chariot attend au module que sa cale soit pleine : 20 objets, 40 avec une remorque.
#[test]
fn a_cart_leaves_the_drill_with_a_full_hold() {
    for (m, cap) in [(0u64, 20u32), (crate::ameliorations::M_CART_BIG as u64, 40)] {
        let (mut w, x, y) = base();
        spot(&mut w, IRON_ORE, x + 24, y + 20);
        let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
        let d = put(&mut w, B_T_DRILL, x + 24, y + 20, RECIPE_NONE);
        let c = cart(&mut w, h);
        w.units.cold[c].mods = m;
        haul(&mut w, c, d, false);
        let mut best = 0;
        for _ in 0..2400 {
            w.step(&[]);
            best = best.max(crate::drones::total(&w.units.cold[c].hold));
        }
        assert_eq!(best, cap, "plus gros chargement");
        assert!(has(&w, h, IRON_ORE) as u32 >= cap);
    }
}

/// En navette de ramassage, le chariot porte à une fonderie éloignée (automatique) le minerai de sa soute, et en
/// rapporte les plaques.
#[test]
fn a_cart_brings_ore_to_a_far_furnace_and_its_plates_back() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let f = put(&mut w, B_T_FURNACE, x + 24, y + 20, RECIPE_NONE);
    stock(&mut w, h, IRON_ORE, 100);
    let c = cart(&mut w, h);
    haul(&mut w, c, f, false);
    let mut most = 0;
    for _ in 0..3600 {
        w.step(&[]);
        most = most.max(crate::drones::has(&w.units.cold[c].hold, IRON_ORE));
    }
    assert_eq!(w.buildings[f].recipe, rec("iron_plate"));
    assert!(w.players[0].produced[IRON_PLATE as usize] >= 5, "plaques : {}", w.players[0].produced[IRON_PLATE as usize]);
    assert!(has(&w, h, IRON_PLATE) >= 5, "rapportées à la soute : {}", has(&w, h, IRON_PLATE));
    // pas plus que le tampon d'entrée de la fonderie (deux fabrications et une)
    assert!((1..=3).contains(&most), "minerai à bord : {most}");
}

/// Le chariot n'emporte que ce que la soute a : rien pour une fonderie de cuivre tant qu'elle n'a que du fer ; du
/// minerai de cuivre arrivé, il en porte.
#[test]
fn a_cart_takes_nothing_its_hold_lacks() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let f = put(&mut w, B_T_FURNACE, x + 24, y + 20, rec("copper_plate"));
    stock(&mut w, h, IRON_ORE, 100);
    let c = cart(&mut w, h);
    haul(&mut w, c, f, false);
    for _ in 0..1800 {
        w.step(&[]);
        assert_eq!(crate::drones::total(&w.units.cold[c].hold), 0, "rien à porter");
    }
    assert_eq!(has(&w, h, IRON_ORE), 100);
    stock(&mut w, h, COPPER_ORE, 50);
    steps(&mut w, 2400);
    assert!(w.players[0].produced[COPPER_PLATE as usize] > 0, "le cuivre arrive");
    assert_eq!(w.players[0].produced[IRON_PLATE as usize], 0);
}

/// Le chariot laisse à la soute ce qu'elle garde pour l'atelier embarqué de l'Arche (`reserved`).
#[test]
fn a_cart_leaves_what_the_hold_keeps_for_the_workshops() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let a = put(&mut w, B_T_ASSEMBLER, x + 24, y + 20, rec("gear"));
    let c = cart(&mut w, h);
    haul(&mut w, c, a, false);
    // l'Arche attend une soute (16 plaques, 4 engrenages) qu'elle ne peut pas lancer : plus de place pour une unité
    let ark = all(&w, U_ARK)[0];
    let i = crate::ameliorations::ark_of(&w, ark).unwrap();
    w.arks[i].queue = vec![(U_CH_HOLD, 1)];
    w.players[0].unit_count = UNIT_CAP;
    stock(&mut w, h, IRON_PLATE, 16);
    for _ in 0..1800 {
        w.step(&[]);
        assert_eq!(crate::drones::total(&w.units.cold[c].hold), 0, "les plaques gardées restent");
    }
    assert_eq!(has(&w, h, IRON_PLATE), 16);
    // dix de plus : elles partent, pas les seize gardées
    stock(&mut w, h, IRON_PLATE, 10);
    for _ in 0..2400 {
        w.step(&[]);
        assert!(has(&w, h, IRON_PLATE) >= 16);
    }
    assert!(w.players[0].produced[GEAR as usize] > 0, "l'assembleur a reçu le surplus");
}

/// Réaffecté avec un chargement à bord, un chariot le rend à sa soute avant de livrer un fabricant.
#[test]
fn a_reassigned_cart_returns_its_old_cargo() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    stock(&mut w, h, IRON_PLATE, 400);
    let a = put(&mut w, B_T_ASSEMBLER, x + 14, y + 20, rec("gear"));
    let c = cart(&mut w, h);
    crate::drones::put(&mut w.units.cold[c].hold, IRON_ORE, 20);
    haul(&mut w, c, a, true);
    steps(&mut w, 1800);
    assert_eq!(crate::drones::has(&w.units.cold[c].hold, IRON_ORE), 0, "minerai resté à bord");
    assert_eq!(has(&w, h, IRON_ORE), 20);
    // (quatre engrenages : sa sortie est pleine)
    assert!(w.players[0].produced[GEAR as usize] >= 4, "engrenages : {}", w.players[0].produced[GEAR as usize]);
}

/// Module détruit ou replié : le chariot rapporte ce qu'il a à bord, puis s'arrête.
#[test]
fn a_cart_without_its_module_brings_its_load_home() {
    let (mut w, x, y) = base();
    spot(&mut w, IRON_ORE, x + 20, y + 20);
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let d = put(&mut w, B_T_DRILL, x + 20, y + 20, RECIPE_NONE);
    let c = cart(&mut w, h);
    haul(&mut w, c, d, false);
    for _ in 0..2000 {
        w.step(&[]);
        if crate::drones::total(&w.units.cold[c].hold) >= 8 {
            break;
        }
    }
    let n = crate::drones::total(&w.units.cold[c].hold);
    assert!(n >= 8);
    let before = has(&w, h, IRON_ORE);
    remove_building(&mut w, d, true);
    steps(&mut w, 1200);
    assert_eq!(crate::drones::total(&w.units.cold[c].hold), 0, "chargement rapporté");
    assert_eq!(has(&w, h, IRON_ORE) as u32, before as u32 + n);
    assert!(w.units.cold[c].orders.is_empty(), "et le chariot s'arrête");
}

/// Soute repliée puis redéployée : ses chariots reprennent leurs navettes.
#[test]
fn carts_resume_their_routes_when_the_hold_is_redeployed() {
    let (mut w, x, y) = base();
    spot(&mut w, IRON_ORE, x + 16, y + 20);
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let d = put(&mut w, B_T_DRILL, x + 16, y + 20, RECIPE_NONE);
    let a = put(&mut w, B_T_ASSEMBLER, x + 16, y + 26, rec("gear"));
    let (c1, _, c3) = (cart(&mut w, h), cart(&mut w, h), cart(&mut w, h));
    haul(&mut w, c1, d, false);
    haul(&mut w, c3, a, true);
    let (dr, ar) = (w.building_ref(d), w.building_ref(a));
    fold(&mut w, h);
    // la sauvegarde garde les navettes à bord
    let mut w = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
    let ch = *all(&w, U_CH_HOLD).iter().find(|&&s| w.units.cold[s].pack_fuel == 3).expect("soute repliée avec ses trois chariots");
    deploy(&mut w, ch);
    let cs = all(&w, U_T_CART);
    assert_eq!(cs.len(), 3);
    let route = |s: usize| match w.units.cold[s].orders.first() {
        Some(Order::Haul { site, feed }) => Some((*site, *feed)),
        _ => None,
    };
    let mut routes: Vec<_> = cs.iter().filter_map(|&s| route(s)).collect();
    routes.sort_unstable();
    let mut want = vec![(dr, false), (ar, true)];
    want.sort_unstable();
    assert_eq!(routes, want);
}

/// Les chariots d'une soute neuve se paient dans les réserves à portée.
#[test]
fn a_new_hold_hitches_carts_paid_by_the_stores_around_it() {
    let (mut w, x, y) = base();
    let h1 = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    stock(&mut w, h1, IRON_PLATE, 100);
    stock(&mut w, h1, GEAR, 100);
    let h2 = put(&mut w, B_T_HOLD, x + 10, y + 20, RECIPE_NONE);
    let r = bref(&w, h2);
    order(&mut w, O_HITCH, &[r]);
    assert_eq!(crate::transhumants::carts_of(&w, h2).len(), 1);
    assert_eq!((has(&w, h1, IRON_PLATE), has(&w, h1, GEAR)), (94, 98));
    // rien à portée : pas de chariot
    w.buildings[h1].stash = Vec::new();
    for s in 0..w.units.alive.len() {
        w.units.cold[s].hold = Vec::new();
    }
    order(&mut w, O_HITCH, &[r]);
    assert_eq!(crate::transhumants::carts_of(&w, h2).len(), 1);
}

/// Un chariot livre une autre soute : ce que la sienne a de plus, jusqu'à ce qu'elles en aient autant.
#[test]
fn a_cart_shares_the_stock_of_its_hold_with_another() {
    let (mut w, x, y) = base();
    let h1 = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let h2 = put(&mut w, B_T_HOLD, x + 12, y + 20, RECIPE_NONE);
    let c = cart(&mut w, h1);
    stock(&mut w, h1, IRON_PLATE, 60);
    stock(&mut w, h1, GEAR, 30);
    stock(&mut w, h2, STEEL, 40);
    haul(&mut w, c, h2, true);
    assert!(matches!(w.units.cold[c].orders.first(), Some(Order::Haul { feed: true, .. })), "ordre accepté");
    steps(&mut w, 4000);
    for (it, n) in [(IRON_PLATE, 60u16), (GEAR, 30)] {
        let (a, b, k) = (has(&w, h1, it), has(&w, h2, it), crate::drones::has(&w.units.cold[c].hold, it));
        assert_eq!(a + b + k, n, "rien ne se perd");
        assert!(a.abs_diff(b) <= 2, "objet {it} : {a} et {b}");
    }
    assert_eq!(has(&w, h2, STEEL), 40, "il ne rapporte rien");
    // pas vers sa propre soute
    haul(&mut w, c, h1, true);
    steps(&mut w, 2);
    assert!(!matches!(w.units.cold[c].orders.first(), Some(Order::Haul { .. })));
}

// ---------- soute et modules collés ----------

/// Une fonderie automatique collée à la soute fond ce que la soute a comme minerai.
#[test]
fn an_automatic_furnace_glued_to_a_hold_smelts_its_ore() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let f = put(&mut w, B_T_FURNACE, x + 2, y + 20, RECIPE_NONE);
    stock(&mut w, h, IRON_ORE, 30);
    stock(&mut w, h, COPPER_ORE, 12);
    stock(&mut w, h, IRON_PLATE, 50);
    steps(&mut w, 600);
    assert_eq!(w.buildings[f].recipe, rec("iron_plate"), "le minerai le plus abondant");
    assert!(w.players[0].produced[IRON_PLATE as usize] > 0);
    // le fer épuisé, elle passe au cuivre
    steps(&mut w, 3000);
    assert_eq!(has(&w, h, IRON_ORE), 0);
    assert!(w.players[0].produced[COPPER_PLATE as usize] > 0, "puis le cuivre");
    assert_eq!(w.players[0].produced[STEEL as usize], 0, "elle ne fond que du minerai");
}

/// Une fonderie automatique servie par une foreuse collée garde son minerai, même à côté d'une soute qui en a un autre.
#[test]
fn a_hold_does_not_change_the_ore_of_a_furnace_fed_by_a_drill() {
    let (mut w, x, y) = base();
    spot(&mut w, IRON_ORE, x, y + 20);
    let h = put(&mut w, B_T_HOLD, x + 4, y + 20, RECIPE_NONE);
    put(&mut w, B_T_DRILL, x, y + 20, RECIPE_NONE);
    let f = put(&mut w, B_T_FURNACE, x + 2, y + 20, RECIPE_NONE);
    steps(&mut w, 400);
    stock(&mut w, h, COPPER_ORE, 200);
    for _ in 0..100 {
        steps(&mut w, 20);
        assert_eq!(w.buildings[f].recipe, rec("iron_plate"));
    }
    assert_eq!(w.players[0].produced[COPPER_PLATE as usize], 0);
}

/// La soute garde pour l'atelier ce qui manque à son unité : un assembleur collé ne prend que le reste.
#[test]
fn the_workshop_is_served_before_the_glued_assemblers() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    put(&mut w, B_T_FURNACE, x + 2, y + 20, rec("iron_plate"));
    put(&mut w, B_T_ASSEMBLER, x - 2, y + 20, rec("gear"));
    let s = put(&mut w, B_T_WORKSHOP, x + 8, y + 24, RECIPE_NONE);
    stock(&mut w, h, IRON_ORE, 600);
    stock(&mut w, h, GEAR, 100);
    let r = bref(&w, s);
    order(&mut w, O_FACTORY_QUEUE, &[r, U_CH_HOLD as i32, 1]);
    let mut started = 0;
    for t in 1..=2400 {
        w.step(&[]);
        if w.buildings[s].working {
            started = t;
            break;
        }
    }
    assert!(started > 0, "production lancée en deux minutes (plaques reçues : {})", crate::buildings::factory_has(&w.buildings[s], IRON_PLATE));
    // l'atelier servi, l'assembleur reprend
    let gears = w.players[0].produced[GEAR as usize];
    steps(&mut w, 1200);
    assert!(w.players[0].produced[GEAR as usize] > gears, "l'assembleur reprend ensuite");
}

/// Un atelier qui attend des engrenages n'empêche pas l'assembleur d'en faire : la réserve n'est pas une impasse.
#[test]
fn the_workshop_reserve_never_starves_the_parts_it_waits_for() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    put(&mut w, B_T_FURNACE, x + 2, y + 20, rec("iron_plate"));
    put(&mut w, B_T_ASSEMBLER, x - 2, y + 20, rec("gear"));
    let s = put(&mut w, B_T_WORKSHOP, x + 8, y + 24, RECIPE_NONE);
    stock(&mut w, h, IRON_ORE, 600);
    let r = bref(&w, s);
    order(&mut w, O_FACTORY_QUEUE, &[r, U_CH_HOLD as i32, 1]);
    for _ in 0..4800 {
        w.step(&[]);
        if w.buildings[s].working {
            return;
        }
    }
    panic!("jamais lancée : plaques {}, engrenages {}", crate::buildings::factory_has(&w.buildings[s], IRON_PLATE), crate::buildings::factory_has(&w.buildings[s], GEAR));
}

/// Un fabricant ne vide pas la soute pour un produit qu'elle a déjà en nombre ; tant que l'ingrédient abonde, il continue.
#[test]
fn a_crafter_leaves_the_last_plates_of_the_hold_once_its_product_abounds() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    put(&mut w, B_T_ASSEMBLER, x - 2, y + 20, rec("gear"));
    stock(&mut w, h, IRON_PLATE, 100);
    stock(&mut w, h, GEAR, 80);
    steps(&mut w, 6000);
    // 80 engrenages, puis 60 plaques de plus en font 30 : les 40 dernières restent
    assert_eq!((has(&w, h, IRON_PLATE), has(&w, h, GEAR)), (40, 110));
    // des plaques de plus : il reprend
    stock(&mut w, h, IRON_PLATE, 50);
    steps(&mut w, 6000);
    assert_eq!((has(&w, h, IRON_PLATE), has(&w, h, GEAR)), (40, 135));
    // plus d'engrenages en nombre : il prend tout
    w.buildings[h].stash[GEAR as usize] = 0;
    steps(&mut w, 6000);
    assert_eq!((has(&w, h, IRON_PLATE), has(&w, h, GEAR)), (0, 20));
}

// ---------- repli ----------

/// Replier un module surcadencé rend ses fragments d'énergie.
#[test]
fn folding_an_overclocked_module_returns_its_shards() {
    let (mut w, x, y) = base();
    spot(&mut w, IRON_ORE, x + 12, y + 2);
    let d = put(&mut w, B_T_DRILL, x + 12, y + 2, RECIPE_NONE);
    w.players[0].shards = 3;
    assert!(crate::buildings::set_clock(&mut w, d, 250));
    assert_eq!(w.players[0].shards, 0);
    fold(&mut w, d);
    assert_eq!(w.players[0].shards, 3);
}

/// Replier l'atelier rend le coût de l'unité en cours et garde sa file.
#[test]
fn folding_the_workshop_refunds_its_unit_and_keeps_its_queue() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y + 20, RECIPE_NONE);
    let s = put(&mut w, B_T_WORKSHOP, x + 4, y + 20, RECIPE_NONE);
    for it in [IRON_PLATE, GEAR, COPPER_PLATE] {
        stock(&mut w, h, it, 200);
    }
    let r = bref(&w, s);
    order(&mut w, O_FACTORY_QUEUE, &[r, U_CH_WORKSHOP as i32, 1]);
    order(&mut w, O_FACTORY_QUEUE, &[r, U_TRACKER as i32, 5]);
    w.buildings[s].repeat = true;
    for _ in 0..2000 {
        w.step(&[]);
        if w.buildings[s].working && w.buildings[s].progress > 0 {
            break;
        }
    }
    assert!(w.buildings[s].working);
    let queue = w.buildings[s].queue.clone();
    let before = all(&w, U_CH_WORKSHOP);
    order(&mut w, O_PACK, &[1, r]);
    steps(&mut w, 300);
    // (les drones de l'atelier rapportent ce qu'ils avaient en vol)
    for it in [IRON_PLATE, GEAR, COPPER_PLATE] {
        assert_eq!(has(&w, h, it), 200, "objet {it} rendu");
    }
    let c = *all(&w, U_CH_WORKSHOP).iter().find(|s| !before.contains(s)).unwrap();
    deploy(&mut w, c);
    let b = *buildings(&w, B_T_WORKSHOP).last().unwrap();
    assert_eq!(w.buildings[b].queue, queue);
    assert!(w.buildings[b].repeat, "en boucle comme avant");
}

/// Une recette fixée par le joueur le reste après repli et redéploiement ; une recette automatique aussi.
#[test]
fn a_fixed_recipe_stays_fixed_after_a_move() {
    for fixed in [true, false] {
        let (mut w, x, y) = base();
        let f = put(&mut w, B_T_FURNACE, x + 10, y + 10, rec("copper_plate"));
        w.buildings[f].repeat = fixed;
        let before = all(&w, U_CH_FURNACE);
        fold(&mut w, f);
        let c = *all(&w, U_CH_FURNACE).iter().find(|s| !before.contains(s)).unwrap();
        deploy(&mut w, c);
        let b = *buildings(&w, B_T_FURNACE).last().unwrap();
        assert_eq!((w.buildings[b].recipe, w.buildings[b].repeat), (rec("copper_plate"), fixed));
    }
}

// ---------- départ, énergie, relevés ----------

/// Départ : 60 hydrocarbures, 20 dans le générateur et 40 à bord de la soute ; le drone du générateur se sert.
#[test]
fn the_start_gives_sixty_hydrocarbon() {
    let (mut w, _, _) = base();
    let g = all(&w, U_CH_GENERATOR)[0];
    let h = all(&w, U_CH_HOLD)[0];
    assert_eq!(w.units.cold[g].pack_fuel, 20 * FUEL_HYDROCARBON);
    assert_eq!(crate::drones::has(&w.units.cold[h].hold, HYDROCARBON), 40);
    let ids = [w.unit_id(g) as i32, w.unit_id(h) as i32];
    order(&mut w, O_DEPLOY, &[2, ids[0], ids[1]]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 5);
    let (gb, hb) = (buildings(&w, B_T_GENERATOR)[0], buildings(&w, B_T_HOLD)[0]);
    w.buildings[gb].fuel = 2 * FUEL_HYDROCARBON;
    steps(&mut w, 400);
    assert!(has(&w, hb, HYDROCARBON) <= 30, "ravitaillé depuis la soute : {}", has(&w, hb, HYDROCARBON));
}

/// La puissance affichée par la fiche de la foreuse est celle qu'elle consomme.
#[test]
fn the_drill_uses_the_power_its_sheet_shows() {
    let (mut w, x, y) = base();
    spot(&mut w, IRON_ORE, x + 12, y + 2);
    let d = put(&mut w, B_T_DRILL, x + 12, y + 2, RECIPE_NONE);
    assert_eq!(crate::buildings::power_need(&w.buildings[d]), bdef(B_T_DRILL).power_use);
    assert_eq!(bdef(B_T_DRILL).power_use, 90);
}

/// Exploration : un relevé pour quatre cases de vision découvertes.
#[test]
fn exploring_gives_one_releve_for_four_cells() {
    let (mut w, x, y) = base();
    steps(&mut w, 40);
    let seen = |w: &World| w.vis[0].iter().filter(|&&c| c & 8 != 0).count() as i32;
    let (cells, got) = (seen(&w), w.players[0].purse[RELEVES as usize]);
    let dx = if x < w.map.w / 2 { 1 } else { -1 };
    for k in 1..=6 {
        w.spawn_unit(U_TRACKER, 0, (x + dx * 50 * k) * TILE, y * TILE);
        steps(&mut w, 20);
    }
    let (cells, got) = (seen(&w) - cells, w.players[0].purse[RELEVES as usize] - got);
    assert!(cells > 1000, "cases découvertes : {cells}");
    assert!((got * 4 - cells).abs() * 10 < cells, "relevés : {got} pour {cells} cases");
}

// ---------- Arche ----------

/// Sans atelier ni recherche, l'Arche peut toujours fabriquer un chenillard atelier, lentement.
#[test]
fn the_ark_can_always_rebuild_a_workshop() {
    let (mut w, _, _) = base();
    for s in all(&w, U_CH_WORKSHOP) {
        crate::transhumants::vanish(&mut w, s);
    }
    let ark = all(&w, U_ARK)[0];
    let id = w.unit_id(ark) as i32;
    let i = crate::ameliorations::ark_of(&w, ark).unwrap();
    // rien d'autre que l'atelier
    order(&mut w, O_ARK_QUEUE, &[id, U_CH_DRILL as i32, 1]);
    assert!(w.arks[i].queue.is_empty(), "seulement un atelier");
    order(&mut w, O_ARK_QUEUE, &[id, U_CH_WORKSHOP as i32, 1]);
    assert_eq!(w.arks[i].queue, vec![(U_CH_WORKSHOP, 1)]);
    for s in 0..w.units.alive.len() {
        w.units.cold[s].hold = Vec::new();
    }
    steps(&mut w, 400);
    assert!(!w.arks[i].paid, "rien pour la payer");
    for &(it, n) in udef(U_CH_WORKSHOP).cost {
        crate::drones::put(&mut w.units.cold[ark].hold, it, n);
    }
    steps(&mut w, 20);
    assert!(w.arks[i].paid, "payée sur la soute de l'Arche");
    assert_eq!(crate::drones::total(&w.units.cold[ark].hold), 0);
    // cinq fois plus lent qu'un atelier
    let t = factory_ticks(U_CH_WORKSHOP);
    steps(&mut w, t * 4);
    assert!(all(&w, U_CH_WORKSHOP).is_empty(), "pas encore");
    steps(&mut w, t + 40);
    assert_eq!(all(&w, U_CH_WORKSHOP).len(), 1);
    assert!(w.arks[i].queue.is_empty());
}

/// Remorque atelier perdue, ou remplacée : l'atelier de secours passe devant ce que l'Arche ne peut plus fabriquer.
#[test]
fn the_rescue_workshop_goes_first_in_the_ark_queue() {
    let (mut w, _, _) = base();
    let ark = all(&w, U_ARK)[0];
    let id = w.unit_id(ark) as i32;
    let i = crate::ameliorations::ark_of(&w, ark).unwrap();
    w.units.cold[ark].mods = (crate::ameliorations::M_WORKSHOP as u64) << (8 * crate::ameliorations::SLOT_DECK as u32);
    steps(&mut w, 60);
    for &(it, n) in &[(IRON_PLATE, 400u16), (GEAR, 200), (COPPER_PLATE, 200)] {
        crate::drones::put(&mut w.units.cold[ark].hold, it, n);
    }
    let iron = w.stock(0, IRON_PLATE);
    order(&mut w, O_ARK_QUEUE, &[id, U_CH_DRILL as i32, 2]);
    steps(&mut w, 40);
    assert!(w.arks[i].paid);
    w.units.cold[ark].mods = 0;
    order(&mut w, O_ARK_QUEUE, &[id, U_CH_WORKSHOP as i32, 1]);
    steps(&mut w, 40);
    assert_eq!(w.arks[i].queue, vec![(U_CH_WORKSHOP, 1), (U_CH_DRILL, 2)]);
    assert!(w.arks[i].paid);
    assert_eq!(w.stock(0, IRON_PLATE), iron - 40, "la foreuse en cours est remboursée, l'atelier payé");
    // sans chenillard atelier en file, le reste attend
    order(&mut w, O_ARK_QUEUE, &[id, U_CH_WORKSHOP as i32, -1]);
    let drills = all(&w, U_CH_DRILL).len();
    steps(&mut w, 2000);
    assert_eq!((all(&w, U_CH_DRILL).len(), w.arks[i].queue.clone()), (drills, vec![(U_CH_DRILL, 2)]));
}

// ---------- race amphibie ----------

/// Bras de mer profond au milieu du terrain, de `y - 30` à `y + 30`, entre x + 8 et x + 24.
fn strait() -> (World, i32, i32) {
    let (mut w, x, y) = base();
    let wl = w.map.water_level.max(40);
    w.map.water_level = wl;
    flatten(&mut w, x + 8, y - 34, x + 24, y + 34, wl - 10);
    (w, x, y)
}

/// L'Arche, ses chenillards et ses unités traversent l'eau.
#[test]
fn transhumants_cross_the_water() {
    let (mut w, x, y) = strait();
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && w.units.owner[s] == 0 && w.units.kind[s] != U_ARK {
            crate::transhumants::vanish(&mut w, s);
        }
    }
    let kinds = [U_CH_DRILL, U_CH_WORKSHOP, U_TRACKER, U_RIDER, U_RAM, U_TOWED_GUN, U_T_CART];
    for (k, &kind) in kinds.iter().enumerate() {
        w.spawn_unit(kind, 0, (x - 2) * TILE, (y - 9 + 3 * k as i32) * TILE);
    }
    let ids: Vec<i32> = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0).map(|s| w.unit_id(s) as i32).collect();
    let mut args = vec![0, (x + 30) * TILE, y * TILE, ids.len() as i32];
    for &i in &ids {
        args.extend([i, (x + 30) * TILE, y * TILE]);
    }
    order(&mut w, O_MOVE, &args);
    steps(&mut w, 1200);
    for &i in &ids {
        let s = w.unit(i as u32).unwrap();
        assert!(w.units.x[s] > (x + 24) * TILE, "{} a traversé (x = {})", udef(w.units.kind[s]).name, w.units.x[s] / TILE - x);
    }
    // un module ne se déploie pas sur l'eau
    let d = slot_of(w.spawn_unit(U_CH_FURNACE, 0, (x + 16) * TILE, y * TILE));
    deploy(&mut w, d);
    assert!(w.units.alive[d] && buildings(&w, B_T_FURNACE).is_empty(), "reste chenillard sur l'eau");
}

/// Les remorques de l'Arche la suivent sur l'eau, ses tourelles s'y déploient.
#[test]
fn the_ark_convoy_floats() {
    let (mut w, x, y) = strait();
    let ark = all(&w, U_ARK)[0];
    w.units.cold[ark].mods = (crate::ameliorations::M_TURRETS2 as u64) << (8 * crate::ameliorations::SLOT_DECK as u32);
    steps(&mut w, 60);
    let id = w.unit_id(ark) as i32;
    order(&mut w, O_MOVE, &[0, (x + 16) * TILE, y * TILE, 1, id, (x + 16) * TILE, y * TILE]);
    steps(&mut w, 500);
    assert!((w.units.x[ark] - (x + 16) * TILE).abs() < 2 * TILE, "l'Arche est au milieu de l'eau");
    for s in all(&w, U_ARK_CAR) {
        let d = crate::fixed::dist(w.units.x[s], w.units.y[s], w.units.x[ark], w.units.y[ark]);
        assert!(d < 7 * TILE, "remorque à {} cases", d / TILE);
    }
    assert!(!all(&w, U_ARK_CAR).is_empty());
    order(&mut w, O_ARK_TURRETS, &[1, 1, id]);
    steps(&mut w, 200);
    let t = all(&w, U_TUR_GUN);
    assert_eq!(t.len(), 3);
    for s in t {
        let d = crate::fixed::dist(w.units.x[s], w.units.y[s], w.units.x[ark], w.units.y[ark]);
        assert!(d < 8 * TILE, "tourelle à {} cases de l'Arche", d / TILE);
    }
}

/// La démo du gué : tout le monde est sur l'eau au moment de la capture (tools/e2e-gue.mjs), et un chariot livre
/// l'autre rive.
#[test]
fn gue_demo_crosses_the_water() {
    let mut w = crate::stress::gue_demo();
    steps(&mut w, 220);
    let wet = |w: &World, s: usize| w.map.is_water(w.units.x[s] / TILE, w.units.y[s] / TILE);
    for kind in [U_ARK, U_CH_DRILL, U_CH_WORKSHOP] {
        assert!(all(&w, kind).iter().any(|&s| wet(&w, s)), "{} sur l'eau", udef(kind).name);
    }
    steps(&mut w, 1500);
    let h = buildings(&w, B_T_HOLD);
    assert!(has(&w, h[1], IRON_PLATE) > 0, "la soute de l'autre rive est livrée");
}
