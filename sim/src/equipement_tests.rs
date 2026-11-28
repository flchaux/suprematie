//! Tests de la personnalisation des Transhumants : trois emplacements par unité, spécialités des modules, gabarits,
//! coque de l'Arche qui grandit, convoi de remorques (voir ameliorations.rs, gabarits.rs, convoi.rs).

use crate::ameliorations::*;
use crate::buildings::{complete_building, place_building};
use crate::convoi::*;
use crate::data::*;
use crate::drones::{has as stock_has, put};
use crate::fixed::{dist, TILE};
use crate::gabarits::*;
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

/// L'Arche du joueur 0 au milieu d'un terrain plat, soute garnie, relevés, toutes les recherches de sa race.
fn game() -> (World, usize) {
    let mut w = World::new(&params());
    flatten(&mut w, 190, 190, 320, 320);
    let s = w.unit(w.players[0].commander).unwrap();
    for c in [&mut w.units.x[s], &mut w.units.y[s]] {
        *c = 255 * TILE;
    }
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

fn fit_now(w: &mut World, r: i32, m: u8) {
    order(w, 0, O_MOD_INSTALL, &[m as i32, 1, r]);
    let t = install_ticks(w, 0, m) as u32;
    steps(w, t + 1);
}

fn cars(w: &World) -> Vec<usize> {
    (0..w.arks[0].cars.len()).filter_map(|c| car_unit(w, 0, c)).collect()
}

fn set_of(a: u8, b: u8, c: u8) -> u32 {
    a as u32 | (b as u32) << 8 | (c as u32) << 16
}

fn go(w: &mut World, s: usize, x: i32, y: i32) {
    let u = id(w, s);
    order(w, 0, O_MOVE, &[0, x * TILE, y * TILE, 1, u, x * TILE, y * TILE]);
}

// ---------- unités : trois emplacements ----------

#[test]
fn a_unit_wears_three_upgrades_and_their_effects_add_up() {
    let (mut w, _) = game();
    let r = spawn(&mut w, U_RAM, 258, 255);
    let u = id(&w, r);
    let v0 = speed(&w, r);
    for m in [M_RAM_FLAME, M_RAM_ENGINE, M_RAM_HOOK] {
        fit_now(&mut w, u, m);
    }
    let mods = w.units.cold[r].mods;
    assert_eq!((at(mods, 0), at(mods, 1), at(mods, 2)), (M_RAM_FLAME, M_RAM_ENGINE, M_RAM_HOOK));
    assert_eq!(speed(&w, r), v0 * 150 / 100, "moteur +30 %, grappins +20 %");
    let (v, n) = weapons_of(&w, r);
    assert_eq!((n, v[0] as usize, v[1]), (2, udef(U_RAM).weapons[0] as usize, W_RAM_FLAME), "le lance-flammes s'ajoute à l'éperon");
    assert_eq!(loot_pct(&w, 0, r), 50, "butin doublé");
    // un châssis remplace l'autre, les autres emplacements restent
    fit_now(&mut w, u, M_RAM_PLATE);
    assert_eq!(at(w.units.cold[r].mods, SLOT_FRAME), M_RAM_PLATE);
    assert_eq!(speed(&w, r), v0 * 120 / 100);
    assert_eq!(unit_armor(&w, r, 1000), 650);
}

#[test]
fn plating_vision_radar_shield_and_repairs_work_on_units() {
    let (mut w, _) = game();
    let h = spawn(&mut w, U_HARROW, 258, 255);
    let g = spawn(&mut w, U_TOWED_GUN, 252, 255);
    let c = spawn(&mut w, U_RIDER, 255, 260);
    for (u, m) in [(h, M_HARROW_PLATE), (h, M_HARROW_SHIELD), (g, M_GUN_SPOTTER), (c, M_RIDER_REPAIR)] {
        let r = id(&w, u);
        fit_now(&mut w, r, m);
    }
    assert_eq!(unit_armor(&w, h, 100), 70);
    assert_eq!(unit_shield(&w, h), (4, 400));
    assert!(w.units.cold[h].shield >= 100, "la bulle démarre au quart");
    steps(&mut w, 2);
    assert!(w.shields.iter().any(|s| s.4 == w.unit_id(h)), "bulle active");
    assert_eq!((unit_vision(&w, g), unit_radar(&w, g)), (34, 45));
    let max = w.max_hp(c);
    w.units.hp[c] = max / 2;
    let before = w.units.hp[c];
    steps(&mut w, 100);
    assert!(w.units.hp[c] >= before + 4 * max / 100, "1 % par seconde");
}

#[test]
fn a_camouflage_net_hides_a_unit_at_rest_until_it_moves_or_fires() {
    let (mut w, _) = game();
    let t = spawn(&mut w, U_TRACKER, 258, 255);
    let u = id(&w, t);
    fit_now(&mut w, u, M_TRACKER_NET);
    steps(&mut w, NET_REST as u32 + 5);
    assert!(hidden(&w, t) && crate::combat::cloaked(&w, t), "cachée à l'arrêt");
    go(&mut w, t, 270, 255);
    steps(&mut w, 10);
    assert!(!hidden(&w, t), "visible en route");
    steps(&mut w, 300);
    assert!(hidden(&w, t), "de nouveau cachée");
    // un ennemi à portée : il tire, et se trahit
    let e = w.spawn_unit(U_T_CART, 1, w.units.x[t] + 5 * TILE, w.units.y[t]);
    let mut fired = false;
    for _ in 0..60 {
        steps(&mut w, 1);
        fired |= w.units.cold[t].reveal > NET_REST;
    }
    assert!(fired && w.unit(e).is_none_or(|s| w.units.hp[s] < w.max_hp(s)), "son tir le trahit");
}

// ---------- modules : spécialité ----------

#[test]
fn quick_jacks_halve_deployment_and_folding() {
    let (mut w, _) = game();
    let s = spawn(&mut w, U_CH_HOLD, 262, 255);
    w.units.cold[s].mods = (M_HOLD_QUICK as u64) << 8 | M_HOLD_BIG as u64;
    let u = id(&w, s);
    order(&mut w, 0, O_DEPLOY, &[1, u]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 / 2 + 2);
    let b = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_T_HOLD).expect("déployée en 7,5 s");
    assert_eq!((fit(&w.buildings[b]), spec(&w.buildings[b])), (M_HOLD_BIG, M_HOLD_QUICK), "les deux emplacements suivent");
    // ses chariots gardent leur équipement au repli, à côté des deux siens
    let r = w.building_ref(b) as i32;
    for it in [IRON_PLATE, GEAR] {
        put(&mut w.buildings[b].stash, it, 20);
    }
    order(&mut w, 0, O_HITCH, &[r]);
    let cart = (0..w.units.alive.len()).find(|&u| w.units.alive[u] && w.units.kind[u] == U_T_CART).expect("chariot");
    w.units.cold[cart].mods = M_CART_FAST as u64;
    order(&mut w, 0, O_PACK, &[1, r]);
    let f = (0..w.units.alive.len()).find(|&u| w.units.alive[u] && w.units.kind[u] == U_CH_HOLD).expect("repliée");
    let mods = w.units.cold[f].mods;
    assert_eq!((at(mods, 0), at(mods, 1), at(mods, 2)), (M_HOLD_BIG, M_HOLD_QUICK, M_CART_FAST));
    assert_eq!(speed(&w, f), unit_speed(U_CH_HOLD), "l'équipement d'un chariot n'accélère pas la soute");
    let left = w.units.cold[f].ready_tick - w.tick;
    assert!(left <= crate::transhumants::FOLD_TICKS as u32 / 2, "repli en 5 s ({left})");
}

#[test]
fn module_specialities_change_tanks_wear_weapons_and_armor() {
    let (mut w, _) = game();
    let mut put_at = |kind: u16, x: i32| {
        let b = place_building(&mut w, 0, kind, x, 262, 0).expect("posé");
        complete_building(&mut w, b);
        b
    };
    let (gen, bas, fur) = (put_at(B_T_GENERATOR, 240), put_at(B_T_BASTION, 246), put_at(B_T_FURNACE, 252));
    let tank = crate::buildings::tank_of(&w.buildings[gen]);
    w.buildings[gen].mods = (M_GEN_TANK as u64) << 8;
    assert_eq!(crate::buildings::tank_of(&w.buildings[gen]), 3 * tank);
    w.buildings[gen].mods = (M_GEN_TANK as u64) << 8 | (M_GEN_LINES2 as u64) << 16;
    assert_eq!((crate::buildings::tank_of(&w.buildings[gen]), poles_max(&w.buildings[gen])), (3 * tank, 12));
    for (mods, weapon) in [(0, bdef(B_T_BASTION).weapon), (M_BASTION_LONG as u64, W_BASTION_LONG as i8), ((M_BASTION_FLAK as u64) << 8, W_BASTION_DUAL as i8), (M_BASTION_LONG as u64 | (M_BASTION_FLAK as u64) << 8, W_BASTION_LONG_DUAL as i8)] {
        w.buildings[bas].mods = mods;
        assert_eq!(building_weapon(&w.buildings[bas]), weapon);
    }
    w.buildings[bas].mods = (M_BASTION_ARMOR as u64) << 8;
    assert_eq!(building_armor(&w.buildings[bas], 100), 65);
    w.buildings[fur].mods = M_FURNACE_FAST as u64 | (M_FURNACE_LEAN as u64) << 8;
    assert_eq!((module_speed(&w.buildings[fur]), module_power(&w.buildings[fur])), (160, 80));
    assert_eq!((wear_felt(&w.buildings[fur], 600), LAB_RADAR), (600, 40));
    w.buildings[fur].mods = (M_DRILL_DEEP as u64) << 8;
    assert_eq!(wear_felt(&w.buildings[fur], 600), 300);
}

#[test]
fn a_repair_yard_heals_the_units_around_it() {
    let (mut w, _) = game();
    let b = place_building(&mut w, 0, B_T_WORKSHOP, 258, 262, 0).unwrap();
    complete_building(&mut w, b);
    w.buildings[b].mods = (M_SHOP_REPAIR as u64) << 8;
    let near = spawn(&mut w, U_RIDER, 263, 266);
    let far = spawn(&mut w, U_RIDER, 290, 290);
    for u in [near, far] {
        w.units.hp[u] = 200;
    }
    steps(&mut w, 101);
    assert!(w.units.hp[near] >= 240 && w.units.hp[far] == 200, "{} {}", w.units.hp[near], w.units.hp[far]);
}

// ---------- gabarits ----------

#[test]
fn a_group_is_equipped_by_one_order_as_supplies_allow() {
    let (mut w, s) = game();
    let units: Vec<usize> = (0..3).map(|k| spawn(&mut w, U_RIDER, 258 + k, 258)).collect();
    let set = set_of(M_RIDER_LONG, M_RIDER_PLATE, 0);
    let mut args = vec![M_RIDER_LONG as i32, M_RIDER_PLATE as i32, 0, 3];
    args.extend(units.iter().map(|&u| id(&w, u)));
    order(&mut w, 0, O_KIT_APPLY, &args);
    assert!(units.iter().all(|&u| w.units.cold[u].want == set && w.units.cold[u].mod_job == M_RIDER_LONG), "première installation lancée");
    steps(&mut w, 700);
    for &u in &units {
        let m = w.units.cold[u].mods;
        assert_eq!((at(m, 0), at(m, 1), at(m, 2)), (M_RIDER_LONG, M_RIDER_PLATE, 0));
        assert_eq!(w.units.cold[u].want, 0, "plus rien à faire");
    }
    // sans composants, l'unité attend, puis s'équipe quand ils arrivent
    let late = spawn(&mut w, U_RIDER, 258, 250);
    let stock = std::mem::take(&mut w.units.cold[s].hold);
    let u = id(&w, late);
    order(&mut w, 0, O_KIT_APPLY, &[M_RIDER_TWIN as i32, 0, 0, 1, u]);
    steps(&mut w, 60);
    assert_eq!((w.units.cold[late].mod_job, w.units.cold[late].want), (0, set_of(M_RIDER_TWIN, 0, 0)), "elle attend");
    w.units.cold[s].hold = stock;
    steps(&mut w, 400);
    assert_eq!(at(w.units.cold[late].mods, 0), M_RIDER_TWIN);
    // choisir à la main oublie le gabarit pour cet emplacement ; annuler l'oublie en entier
    order(&mut w, 0, O_KIT_APPLY, &[M_RIDER_FLAME as i32, M_RIDER_ENGINE as i32, 0, 1, u]);
    order(&mut w, 0, O_MOD_CANCEL, &[1, u]);
    assert_eq!((w.units.cold[late].want, w.units.cold[late].mod_job), (0, 0));
}

#[test]
fn templates_keep_only_what_fits_and_what_is_researched() {
    let (mut w, _) = game();
    assert_eq!(valid(U_RIDER, set_of(M_RIDER_LONG, M_RAM_PLATE, M_RIDER_LOOT)), set_of(M_RIDER_LONG, 0, M_RIDER_LOOT), "pas l'amélioration d'un autre");
    assert_eq!(valid(U_RIDER, set_of(M_RIDER_PLATE, 0, 0)), 0, "pas dans un autre emplacement");
    assert!(has_kits(U_RIDER) && !has_kits(U_ARK) && !has_kits(U_CH_DRILL) && !has_kits(U_T_CART));
    order(&mut w, 0, O_KIT_SET, &[U_RIDER as i32, 1, M_RIDER_LONG as i32, M_RIDER_PLATE as i32, M_RIDER_LOOT as i32]);
    order(&mut w, 0, O_KIT_ACTIVE, &[U_RIDER as i32, 2]);
    assert_eq!(active(&w, 0, U_RIDER), set_of(M_RIDER_LONG, M_RIDER_PLATE, M_RIDER_LOOT));
    assert_eq!(active(&w, 0, U_RAM), 0);
    // recherche perdue (autre partie) : le gabarit s'y limite
    w.players[0].researched2 &= !(1u64 << (T_T_GEAR - 64));
    assert_eq!(active(&w, 0, U_RIDER), 0);
    // un gabarit vidé n'est plus celui de la production
    order(&mut w, 0, O_KIT_SET, &[U_RIDER as i32, 1, 0, 0, 0]);
    assert_eq!(w.players[0].kits[0].active, 0);
    // ordres hors bornes : sans effet
    order(&mut w, 0, O_KIT_SET, &[9999, 0, 1, 1, 1]);
    order(&mut w, 0, O_KIT_ACTIVE, &[U_RIDER as i32, 9]);
    order(&mut w, 0, O_KIT_SET, &[U_ARK as i32, 0, M_W_SIEGE as i32, 0, 0]);
    assert_eq!(w.players[0].kits.len(), 1);
}

#[test]
fn the_workshop_delivers_equipped_units_and_pays_for_it() {
    let (mut w, s) = game();
    let b = place_building(&mut w, 0, B_T_WORKSHOP, 262, 255, 0).unwrap();
    complete_building(&mut w, b);
    let g = place_building(&mut w, 0, B_T_GENERATOR, 258, 255, 0).unwrap();
    complete_building(&mut w, g);
    w.buildings[g].fuel = 100_000_000;
    w.power_dirty = true;
    order(&mut w, 0, O_KIT_SET, &[U_RIDER as i32, 0, M_RIDER_LONG as i32, M_RIDER_PLATE as i32, 0]);
    order(&mut w, 0, O_KIT_ACTIVE, &[U_RIDER as i32, 1]);
    let (steel, rel) = (stock_has(&w.units.cold[s].hold, STEEL), w.players[0].purse[RELEVES as usize]);
    let r = w.building_ref(b) as i32;
    order(&mut w, 0, O_FACTORY_QUEUE, &[r, U_RIDER as i32, 1]);
    for it in 1..=ENERGY_CELL {
        crate::buildings::factory_put(&mut w.buildings[b], it, 8);
    }
    steps(&mut w, 30);
    assert!(w.buildings[b].working);
    assert_eq!(w.buildings[b].kit, set_of(M_RIDER_LONG, M_RIDER_PLATE, 0), "équipement payé au début");
    assert_eq!(w.players[0].purse[RELEVES as usize], rel - 8, "relevés des deux améliorations");
    assert!(stock_has(&w.units.cold[s].hold, STEEL) + 8 <= steel, "acier des deux améliorations");
    steps(&mut w, 900);
    let u = (0..w.units.alive.len()).find(|&u| w.units.alive[u] && w.units.kind[u] == U_RIDER).expect("sorti");
    assert_eq!((at(w.units.cold[u].mods, 0), at(w.units.cold[u].mods, 1), w.units.cold[u].want), (M_RIDER_LONG, M_RIDER_PLATE, 0), "déjà équipé");
    assert_eq!(w.buildings[b].kit, 0);
    // file retirée : l'équipement payé est rendu
    order(&mut w, 0, O_FACTORY_QUEUE, &[r, U_RIDER as i32, 1]);
    for it in 1..=ENERGY_CELL {
        crate::buildings::factory_put(&mut w.buildings[b], it, 8);
    }
    let rel = w.players[0].purse[RELEVES as usize];
    steps(&mut w, 70);
    assert_eq!(w.players[0].purse[RELEVES as usize], rel - 8);
    order(&mut w, 0, O_FACTORY_QUEUE, &[r, U_RIDER as i32, -1]);
    assert_eq!((w.players[0].purse[RELEVES as usize], w.buildings[b].kit), (rel, 0));
    // sans relevés : l'unité sort nue et s'équipera plus tard
    w.players[0].purse[RELEVES as usize] = -1000;
    order(&mut w, 0, O_FACTORY_QUEUE, &[r, U_RIDER as i32, 1]);
    for it in 1..=ENERGY_CELL {
        crate::buildings::factory_put(&mut w.buildings[b], it, 8);
    }
    steps(&mut w, 900);
    let v = (0..w.units.alive.len()).find(|&v| w.units.alive[v] && w.units.kind[v] == U_RIDER && v != u).expect("sorti");
    assert_eq!((w.units.cold[v].mods, w.units.cold[v].want), (0, set_of(M_RIDER_LONG, M_RIDER_PLATE, 0)));
    w.players[0].purse[RELEVES as usize] = 100;
    steps(&mut w, 700);
    assert_eq!(w.units.cold[v].mods as u32, set_of(M_RIDER_LONG, M_RIDER_PLATE, 0));
}

// ---------- Arche : coque ----------

#[test]
fn the_ark_grows_with_each_section() {
    let (mut w, s) = game();
    let ark = id(&w, s);
    assert_eq!(radius(&w.units, s), 360);
    for (m, r) in [(M_W_SIEGE, 395), (M_ENGINE1, 430), (M_PLATE1, 465), (M_RADAR, 465)] {
        fit_now(&mut w, ark, m);
        assert_eq!(radius(&w.units, s), r, "{}", MODS[m as usize].key);
    }
    // une unité à ses côtés est tenue plus loin
    let u = spawn(&mut w, U_RIDER, 255, 255);
    w.units.x[u] = w.units.x[s] + 300;
    w.units.y[u] = w.units.y[s] + 300;
    steps(&mut w, 120);
    let d = dist(w.units.x[u], w.units.y[u], w.units.x[s], w.units.y[s]);
    assert!(d > 440, "écartée ({d})");
}

// ---------- convoi ----------

#[test]
fn deck_and_support_upgrades_ride_on_trailers() {
    let (mut w, s) = game();
    let ark = id(&w, s);
    assert!(cars(&w).is_empty());
    fit_now(&mut w, ark, M_RADAR);
    steps(&mut w, 2);
    assert_eq!(cars(&w).len(), 1);
    fit_now(&mut w, ark, M_TURRETS1);
    fit_now(&mut w, ark, M_TURRETS2);
    steps(&mut w, 2);
    assert_eq!(wanted(w.units.cold[s].mods), [M_TURRETS2, M_RADAR, 0, 0]);
    assert_eq!(cars(&w).len(), 2, "un palier garde la même remorque");
    fit_now(&mut w, ark, M_TURRETS3);
    steps(&mut w, 2);
    let c = cars(&w);
    assert_eq!(c.len(), 4, "couronne : trois remorques, plus le radar");
    // en file derrière l'Arche, à leur distance
    for (k, &u) in c.iter().enumerate() {
        let d = dist(w.units.x[u], w.units.y[u], w.units.x[s], w.units.y[s]);
        assert!((d - reach_back(w.units.cold[s].mods, k)).abs() < 80, "remorque {k} à {d}");
        assert!(w.units.x[u] < w.units.x[s], "derrière");
        assert_eq!(w.units.cold[u].parent, w.unit_id(s));
    }
    // elles n'obéissent pas
    let (x, u) = (w.units.x[c[0]], id(&w, c[0]));
    order(&mut w, 0, O_MOVE, &[0, x, 200 * TILE, 1, u, x, 200 * TILE]);
    steps(&mut w, 40);
    assert!(w.units.cold[c[0]].orders.is_empty() && w.units.x[c[0]] == x);
    // pont changé : ses remorques laissent la place à une seule
    fit_now(&mut w, ark, M_HOLDS);
    steps(&mut w, 2);
    assert_eq!((cars(&w).len(), store_cap(&w, s)), (2, 2000));
}

#[test]
fn trailers_follow_the_ark_through_turns_and_never_stand_on_obstacles() {
    let (mut w, s) = game();
    let ark = id(&w, s);
    for m in [M_TURRETS1, M_TURRETS2, M_TURRETS3, M_RADAR] {
        fit_now(&mut w, ark, m);
    }
    // un mur percé d'un passage de trois cases
    for x in 230..290 {
        if !(254..257).contains(&x) {
            let i = w.map.idx(x, 270);
            w.map.cliff[i] = 1;
            w.map.update_pass(x, 270);
        }
    }
    let m = crate::units::pass_mask(Layer::Land);
    let check = |w: &World| {
        let mut prev = (w.units.x[s], w.units.y[s]);
        for (k, u) in cars(w).into_iter().enumerate() {
            let (x, y) = (w.units.x[u], w.units.y[u]);
            assert!(w.map.passable(x / TILE, y / TILE, m), "remorque {k} sur un obstacle en ({}, {}) au tick {}", x / TILE, y / TILE, w.tick);
            let d = dist(x, y, prev.0, prev.1);
            assert!(d < 4 * TILE, "remorque {k} décrochée ({d}) au tick {}", w.tick);
            prev = (x, y);
        }
    };
    for (x, y) in [(255, 285), (275, 285), (255, 285), (255, 250), (235, 250), (255, 285)] {
        go(&mut w, s, x, y);
        for _ in 0..900 {
            steps(&mut w, 1);
            check(&w);
            if w.units.cold[s].orders.is_empty() {
                break;
            }
        }
        assert!(dist(w.units.x[s], w.units.y[s], x * TILE, y * TILE) < 3 * TILE, "l'Arche arrive en ({x}, {y})");
        assert_eq!(cars(&w).len(), 4);
    }
    // demi-tour sur place : elle ne roule pas sur ses remorques
    go(&mut w, s, 255, 250);
    let mut min = i32::MAX;
    for _ in 0..200 {
        steps(&mut w, 1);
        for u in cars(&w) {
            min = min.min(dist(w.units.x[u], w.units.y[u], w.units.x[s], w.units.y[s]));
        }
    }
    assert!(min > 380, "une remorque sous l'Arche ({min})");
}

#[test]
fn a_lost_trailer_takes_its_upgrade_until_it_is_rebuilt() {
    let (mut w, s) = game();
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_RADAR);
    fit_now(&mut w, ark, M_HOLDS);
    steps(&mut w, 2);
    assert_eq!((unit_radar(&w, s), store_cap(&w, s)), (ARK_RADAR, 2000));
    let c = cars(&w);
    crate::combat::damage_unit(&mut w, c[1], 1_000_000, 1);
    steps(&mut w, 2);
    assert!(!in_service(&w, s, SLOT_SUPPORT) && in_service(&w, s, SLOT_DECK));
    assert_eq!((unit_radar(&w, s), store_cap(&w, s)), (0, 2000), "plus de radar, toujours les soutes");
    // reconstruite à bord, payée dans la soute
    let iron = stock_has(&w.units.cold[s].hold, IRON_PLATE);
    steps(&mut w, 20);
    assert_eq!(stock_has(&w.units.cold[s].hold, IRON_PLATE), iron - 30);
    steps(&mut w, CAR_REBUILD as u32 + 20);
    assert_eq!((cars(&w).len(), unit_radar(&w, s)), (2, ARK_RADAR));
}

#[test]
fn turrets_aboard_a_lost_trailer_are_lost_with_it() {
    let (mut w, s) = game();
    let ark = id(&w, s);
    for m in [M_TURRETS1, M_TURRETS2, M_TURRETS3] {
        fit_now(&mut w, ark, m);
    }
    steps(&mut w, 2);
    let c = cars(&w);
    assert_eq!(c.len(), 3);
    crate::combat::damage_unit(&mut w, c[2], 1_000_000, 1);
    steps(&mut w, 2);
    let lost: Vec<usize> = (0..9).filter(|&k| w.arks[0].turrets[k].state == TU_LOST).collect();
    assert_eq!(lost, [6, 7, 8], "les trois tourelles de la dernière remorque");
    order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
    steps(&mut w, 300);
    let out = (0..w.units.alive.len()).filter(|&u| w.units.alive[u] && is_turret(w.units.kind[u])).count();
    assert_eq!(out, 6, "les autres sortent");
}

#[test]
fn trailers_come_aboard_with_the_ark_and_survive_a_save() {
    let (mut w, s) = game();
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_WORKSHOP);
    fit_now(&mut w, ark, M_REPAIR);
    order(&mut w, 0, O_KIT_SET, &[U_RAM as i32, 2, M_RAM_SAW as i32, 0, M_RAM_SHIELD as i32]);
    go(&mut w, s, 270, 262);
    steps(&mut w, 60);
    let mut w2 = crate::save::restore(&crate::save::snapshot(&w)).expect("sauvegarde lue");
    assert_eq!(w.hash(), w2.hash());
    for _ in 0..400 {
        assert_eq!(w.step(&[]), w2.step(&[]), "même suite de partie");
    }
    assert_eq!((cars(&w2).len(), w2.players[0].kits.len()), (2, 1));
    // embarquée : les remorques rentrent, puis ressortent
    w.units.cold[s].carried_by = w.unit_id(s);
    steps(&mut w, 2);
    assert!(cars(&w).is_empty() && w.arks[0].cars.iter().all(|c| c.state == CAR_STOWED));
    w.units.cold[s].carried_by = NONE;
    steps(&mut w, 2);
    assert_eq!(cars(&w).len(), 2);
}

#[test]
fn saves_from_before_the_slots_move_each_upgrade_to_its_own() {
    let (mut w, _) = game();
    let t = spawn(&mut w, U_TRACKER, 258, 255);
    let h = spawn(&mut w, U_CH_HOLD, 262, 255);
    w.units.cold[t].mods = M_TRACKER_RADAR as u64;
    w.units.cold[h].mods = M_HOLD_BIG as u64 | (M_CART_FAST as u64) << 8 | (M_CART_BIG as u64) << 16;
    let old = crate::save::write(&w, 10, &[]);
    let w2 = crate::save::restore(&old).expect("version 10");
    assert_eq!(w2.units.cold[t].mods, (M_TRACKER_RADAR as u64) << 16);
    assert_eq!(w2.units.cold[h].mods, M_HOLD_BIG as u64 | (M_CART_FAST as u64) << 16 | (M_CART_BIG as u64) << 24);
    assert_eq!(unit_radar(&w2, t), 45);
}
