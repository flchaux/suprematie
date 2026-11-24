//! Tests des améliorations des Transhumants : installation, coût et remboursement, exclusivité, paliers,
//! tourelles de l'Arche (1, 3, 9), bouclier, modules (repli et déploiement), sauvegarde, déterminisme.

use crate::ameliorations::*;
use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::drones::{has as stock_has, put};
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

/// Partie d'un Transhumant (joueur 0) : son Arche seule sur un terrain plat au milieu de la carte, soute bien
/// garnie, beaucoup de relevés, toutes les recherches de sa race si `techs`. Renvoie la case de l'Arche.
fn ark_game(techs: bool) -> (World, usize) {
    let mut w = World::new(&params());
    flatten(&mut w, 200, 200, 310, 310);
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
        for (t, d) in TECHS.iter().enumerate() {
            if d.race == RACE_TRANSH {
                w.players[0].set_tech(t as u8);
            }
        }
    }
    steps(&mut w, 1);
    (w, s)
}

fn hold(w: &World, s: usize, it: u8) -> u16 {
    stock_has(&w.units.cold[s].hold, it)
}

fn id(w: &World, s: usize) -> i32 {
    w.unit_id(s) as i32
}

/// Installe une amélioration par l'ordre du joueur, jusqu'au bout.
fn fit_now(w: &mut World, r: i32, m: u8) {
    order(w, 0, O_MOD_INSTALL, &[m as i32, 1, r]);
    let t = install_ticks(w, 0, m) as u32;
    steps(w, t + 1);
}

fn turrets(w: &World) -> Vec<usize> {
    (0..w.units.alive.len()).filter(|&u| w.units.alive[u] && is_turret(w.units.kind[u])).collect()
}

#[test]
fn the_table_of_upgrades_is_sound() {
    for (i, d) in MODS.iter().enumerate().skip(1) {
        let i = i as u8;
        assert_eq!(udef(d.host).race, RACE_TRANSH, "{}", d.key);
        assert!((d.slot as usize) < slots(d.host).len(), "{}", d.key);
        assert!(d.time > 0 && !d.cost.is_empty() && !d.desc.is_empty(), "{}", d.key);
        assert!(d.tech == 0 || TECHS[d.tech as usize].race == RACE_TRANSH, "{}", d.key);
        if d.base != 0 {
            let b = &MODS[d.base as usize];
            assert!(d.base < i && b.host == d.host && b.slot == d.slot && b.rank + 1 == d.rank, "palier de {}", d.key);
        } else {
            assert_eq!(d.rank, 1, "{}", d.key);
        }
    }
    // chaque emplacement d'un module ou d'un chariot : deux choix exclusifs ; d'une unité de combat : deux ou trois
    for (k, u) in UNITS.iter().enumerate() {
        let k = k as u16;
        let per: Vec<usize> = (0..slots(k).len() as u8).map(|sl| MODS.iter().filter(|d| d.host == k && d.slot == sl).count()).collect();
        if u.deploys != NO_KIND {
            assert_eq!(per, [2, 2], "{}", u.key);
        } else if k == U_T_CART {
            assert_eq!(per, [2], "{}", u.key);
        } else if [U_TRACKER, U_RIDER, U_HARROW, U_TOWED_GUN, U_RAM].contains(&k) {
            assert!(per.len() == 3 && per.iter().all(|n| (2..=3).contains(n)), "{} : {per:?}", u.key);
        }
    }
    // un filet de camouflage seulement sur les types que `net_kind` reconnaît
    assert!(MODS.iter().all(|d| !d.cloak || net_kind(d.host)));
    // clés uniques
    let mut keys: Vec<&str> = MODS.iter().map(|d| d.key).collect();
    keys.sort_unstable();
    keys.dedup();
    assert_eq!(keys.len(), MODS.len());
    for slot in 0..ARK_SLOTS.len() as u8 {
        assert!(MODS.iter().filter(|d| d.host == U_ARK && d.slot == slot && d.rank == 1).count() >= 3);
        // un choix possible dès le départ, sans recherche
        assert!(MODS.iter().any(|d| d.host == U_ARK && d.slot == slot && d.tech == 0 && d.rank == 1));
    }
    assert!(MODS.iter().filter(|d| d.host == U_ARK).count() >= 15);
    // la table exportée est du JSON que le client lit (guillemets échappés)
    assert!(mods_json().starts_with("\"mods\":[{\"key\":\"none\""));
}

#[test]
fn an_upgrade_is_paid_then_installed_on_the_ark() {
    let (mut w, s) = ark_game(false);
    let ark = id(&w, s);
    let (iron, gear, rel) = (hold(&w, s, IRON_PLATE), hold(&w, s, GEAR), w.players[0].purse[RELEVES as usize]);
    let v0 = speed(&w, s);
    order(&mut w, 0, O_MOD_INSTALL, &[M_ENGINE1 as i32, 1, ark]);
    assert_eq!(w.units.cold[s].mod_job, M_ENGINE1);
    assert_eq!((hold(&w, s, IRON_PLATE), hold(&w, s, GEAR)), (iron - 30, gear - 14), "composants pris dans sa soute");
    assert_eq!(w.players[0].purse[RELEVES as usize], rel - 10, "relevés");
    assert_eq!(speed(&w, s), v0, "pas d'effet avant la fin");
    // une seule installation à la fois
    order(&mut w, 0, O_MOD_INSTALL, &[M_W_FLAME as i32, 1, ark]);
    assert_eq!(w.units.cold[s].mod_job, M_ENGINE1);
    let t = install_ticks(&w, 0, M_ENGINE1) as u32;
    steps(&mut w, t);
    assert_eq!((w.units.cold[s].mod_job, w.units.cold[s].mods), (0, set_at(SLOT_DRIVE, M_ENGINE1)));
    assert_eq!(speed(&w, s), v0 * 125 / 100);
    // l'autre emplacement reste libre : lance-flammes
    fit_now(&mut w, ark, M_W_FLAME);
    assert_eq!(weapons_of(&w, s).0[0], W_FLAME);
    assert!(has(w.units.cold[s].mods, M_ENGINE1));
}

fn set_at(slot: u8, m: u8) -> u64 {
    (m as u64) << (8 * slot)
}

#[test]
fn an_upgrade_needs_its_research_its_rank_its_owner_and_its_price() {
    let (mut w, s) = ark_game(false);
    let ark = id(&w, s);
    let h = Host::U(s);
    assert_eq!(blocked(&w, h, M_W_SIEGE), 2, "recherche");
    order(&mut w, 0, O_MOD_INSTALL, &[M_W_SIEGE as i32, 1, ark]);
    assert_eq!(w.units.cold[s].mod_job, 0);
    w.players[0].set_tech(T_T_ARMORY);
    assert_eq!(blocked(&w, h, M_W_SIEGE), 0);
    w.players[0].set_tech(T_T_DRIVE);
    assert_eq!(blocked(&w, h, M_ENGINE2), 3, "palier précédent");
    assert_eq!(blocked(&w, h, M_DRILL_FAST), 1, "autre porteur");
    // un autre joueur ne peut pas la lui installer
    order(&mut w, 1, O_MOD_INSTALL, &[M_ENGINE1 as i32, 1, ark]);
    assert_eq!(w.units.cold[s].mod_job, 0);
    // sans relevés, ou sans composants : rien n'est pris
    w.players[0].purse[RELEVES as usize] = 9;
    order(&mut w, 0, O_MOD_INSTALL, &[M_ENGINE1 as i32, 1, ark]);
    assert_eq!((w.units.cold[s].mod_job, hold(&w, s, GEAR)), (0, 500));
    w.players[0].purse[RELEVES as usize] = 100;
    crate::drones::take(&mut w.units.cold[s].hold, GEAR, 500);
    order(&mut w, 0, O_MOD_INSTALL, &[M_ENGINE1 as i32, 1, ark]);
    assert_eq!((w.units.cold[s].mod_job, hold(&w, s, IRON_PLATE), w.players[0].purse[RELEVES as usize]), (0, 500, 100));
    // numéros hors table : ignorés
    for m in [0, -1, 56, 255, 256, 99999] {
        order(&mut w, 0, O_MOD_INSTALL, &[m, 1, ark]);
        assert_eq!(w.units.cold[s].mod_job, 0);
    }
}

#[test]
fn a_folded_hold_pays_for_the_ark() {
    let (mut w, s) = ark_game(false);
    w.units.cold[s].hold.clear();
    let hid = w.spawn_unit(U_CH_HOLD, 0, 258 * TILE, 255 * TILE);
    let hs = w.unit(hid).unwrap();
    put(&mut w.units.cold[hs].hold, IRON_PLATE, 30);
    put(&mut w.units.cold[hs].hold, GEAR, 14);
    let ark = id(&w, s);
    order(&mut w, 0, O_MOD_INSTALL, &[M_ENGINE1 as i32, 1, ark]);
    assert_eq!(w.units.cold[s].mod_job, M_ENGINE1);
    assert_eq!(crate::drones::total(&w.units.cold[hs].hold), 0, "payée par la soute repliée");
}

#[test]
fn cancelling_refunds_everything() {
    let (mut w, s) = ark_game(false);
    let ark = id(&w, s);
    order(&mut w, 0, O_MOD_INSTALL, &[M_REPAIR as i32, 1, ark]);
    steps(&mut w, 100);
    assert_eq!(w.units.cold[s].mod_job, M_REPAIR);
    assert!(hold(&w, s, CIRCUIT) < 500);
    order(&mut w, 0, O_MOD_CANCEL, &[1, ark]);
    assert_eq!((w.units.cold[s].mod_job, w.units.cold[s].mods), (0, 0));
    assert_eq!([hold(&w, s, IRON_PLATE), hold(&w, s, GEAR), hold(&w, s, CIRCUIT)], [500, 500, 500]);
    assert_eq!(w.players[0].purse[RELEVES as usize], 1000);
}

#[test]
fn a_slot_keeps_one_branch_and_ranks_follow_each_other() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_PLATE1);
    let steel = hold(&w, s, STEEL);
    // palier suivant : remplace le précédent sans rien rendre
    fit_now(&mut w, ark, M_PLATE2);
    assert!(has(w.units.cold[s].mods, M_PLATE2) && has_rank(w.units.cold[s].mods, M_PLATE1));
    assert_eq!(hold(&w, s, STEEL), steel - 50);
    assert_eq!(blocked(&w, Host::U(s), M_PLATE1), 4, "palier déjà dépassé");
    // autre branche : remplace, la moitié des composants des deux paliers est rendue (60 fer, 10 + 50 acier, 10 engrenages)
    let (iron, steel) = (hold(&w, s, IRON_PLATE), hold(&w, s, STEEL));
    fit_now(&mut w, ark, M_REACTIVE);
    assert_eq!(at(w.units.cold[s].mods, SLOT_HULL), M_REACTIVE);
    assert_eq!((hold(&w, s, IRON_PLATE), hold(&w, s, STEEL)), (iron + 30, steel - 30 + 5 + 25));
    // dégâts : les obus sont amortis de moitié, pas les balles
    w.hit_weapon = 5;
    assert_eq!(unit_armor(&w, s, 100), 50);
    w.hit_weapon = 4;
    assert_eq!(unit_armor(&w, s, 100), 100);
    w.hit_weapon = 255;
}

#[test]
fn the_ark_deploys_one_then_three_then_nine_turrets() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    for (m, n) in [(M_TURRETS1, 1), (M_TURRETS2, 3), (M_TURRETS3, 9)] {
        fit_now(&mut w, ark, m);
        assert_eq!(turret_count(w.units.cold[s].mods), n);
        order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
        steps(&mut w, 400);
        let t = turrets(&w);
        assert_eq!(t.len(), n, "tourelles dehors");
        for &u in &t {
            assert!(w.units.cold[u].deployed, "déployée à son poste");
            let d = dist(w.units.x[u], w.units.y[u], w.units.x[s], w.units.y[s]);
            assert!((3 * TILE..8 * TILE).contains(&d), "autour de l'Arche ({d})");
        }
        // rappel : toutes rentrent
        order(&mut w, 0, O_ARK_TURRETS, &[0, 1, ark]);
        steps(&mut w, 300);
        assert!(turrets(&w).is_empty(), "rentrées à bord");
        assert!(w.arks[0].turrets.iter().all(|t| t.state == TU_ABOARD));
    }
    // un joueur ne donne pas d'ordre à une tourelle
    order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
    steps(&mut w, 300);
    let u = turrets(&w)[0];
    let (x, y, tid) = (w.units.x[u], w.units.y[u], id(&w, u));
    order(&mut w, 0, O_MOVE, &[0, x + 20 * TILE, y, 1, tid, x + 20 * TILE, y]);
    steps(&mut w, 40);
    assert_eq!((w.units.x[u], w.units.y[u]), (x, y));
    // pont changé de branche : les tourelles disparaissent avec leurs affûts
    fit_now(&mut w, ark, M_HOLDS);
    assert!(turrets(&w).is_empty());
    assert_eq!(store_cap(&w, s), 2000);
}

#[test]
fn turrets_follow_the_ark_or_hold_their_ground() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_TURRETS1);
    fit_now(&mut w, ark, M_TURRETS2);
    order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
    steps(&mut w, 300);
    assert_eq!(turrets(&w).len(), 3);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    // consigne « suivre » (au départ) : l'Arche part, elles la rejoignent, et se redéploient là où elle s'arrête
    let gx = x + 25 * TILE;
    order(&mut w, 0, O_MOVE, &[0, gx, y, 1, ark, gx, y]);
    steps(&mut w, 330);
    assert!(turrets(&w).iter().all(|&u| !w.units.cold[u].deployed), "repliées en route");
    steps(&mut w, 700);
    let t = turrets(&w);
    assert_eq!(t.len(), 3);
    for &u in &t {
        assert!(w.units.cold[u].deployed && dist(w.units.x[u], w.units.y[u], w.units.x[s], w.units.y[s]) < 8 * TILE, "redéployées autour de l'Arche");
    }
    // consigne « tenir » : elles restent où elles sont
    order(&mut w, 0, O_ARK_TURRETS, &[3, 1, ark]);
    let posts: Vec<(i32, i32)> = t.iter().map(|&u| (w.units.x[u], w.units.y[u])).collect();
    order(&mut w, 0, O_MOVE, &[0, x, y, 1, ark, x, y]);
    steps(&mut w, 500);
    assert_eq!(turrets(&w).iter().map(|&u| (w.units.x[u], w.units.y[u])).collect::<Vec<_>>(), posts, "elles tiennent la place");
    assert!(turrets(&w).iter().all(|&u| w.units.cold[u].deployed));
    // rappel de loin : elles roulent jusqu'à l'Arche
    order(&mut w, 0, O_ARK_TURRETS, &[0, 1, ark]);
    steps(&mut w, 600);
    assert!(turrets(&w).is_empty(), "rentrées de loin");
}

#[test]
fn turrets_shoot_fall_and_are_rebuilt_in_the_chosen_type() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_TURRETS1);
    // type choisi à bord : conversion de 5 s, sans coût
    order(&mut w, 0, O_ARK_TURRET_TYPE, &[ark, -1, 2]);
    steps(&mut w, 3);
    assert_eq!(w.arks[0].turrets[0].state, TU_CONVERT);
    steps(&mut w, TURRET_CONVERT as u32 + 2);
    assert_eq!((w.arks[0].turrets[0].state, w.arks[0].turrets[0].kind), (TU_ABOARD, 2));
    order(&mut w, 0, O_ARK_TURRET_TYPE, &[ark, 0, 0]);
    steps(&mut w, TURRET_CONVERT as u32 + 4);
    order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
    steps(&mut w, 200);
    let u = turrets(&w)[0];
    assert_eq!(w.units.kind[u], U_TUR_GUN);
    // elle tire ; sa victime donne relevés et expérience à l'Arche
    let (x, y) = (w.units.x[u], w.units.y[u]);
    let tank = w.spawn_unit(U_LIGHT_TANK, 1, x + 12 * TILE, y);
    let ts = w.unit(tank).unwrap();
    w.units.cold[ts].stun = 400;
    w.units.cold[s].cooldown = [400; 2];
    let hp = w.units.hp[ts];
    steps(&mut w, 60);
    assert!(w.units.hp[ts] < hp, "la tourelle tire");
    let tu = w.unit_id(u);
    w.units.cold[ts].last_hit = tu;
    let rel = w.players[0].purse[RELEVES as usize];
    w.units.hp[ts] = 0;
    w.dead_units.push(ts as u32);
    steps(&mut w, 1);
    assert!(w.players[0].purse[RELEVES as usize] > rel && w.units.cold[s].xp > 0);
    // détruite : reconstruite à bord, payée, 30 s ; dans le nouveau type voulu
    order(&mut w, 0, O_ARK_TURRET_TYPE, &[ark, 0, 1]);
    let (iron, circ) = (hold(&w, s, IRON_PLATE), hold(&w, s, CIRCUIT));
    w.units.hp[u] = 0;
    w.dead_units.push(u as u32);
    steps(&mut w, 15);
    assert!(turrets(&w).is_empty());
    assert_eq!(w.arks[0].turrets[0].state, TU_LOST);
    assert_eq!((hold(&w, s, IRON_PLATE), hold(&w, s, CIRCUIT)), (iron - 10, circ - 2), "reconstruction payée");
    steps(&mut w, TURRET_REBUILD as u32 + 200);
    let t = turrets(&w);
    assert_eq!(t.len(), 1, "reconstruite et ressortie");
    assert_eq!(w.units.kind[t[0]], U_TUR_AA);
}

#[test]
fn a_turret_waits_for_its_price() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_TURRETS1);
    order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
    steps(&mut w, 200);
    w.units.cold[s].hold.clear();
    let u = turrets(&w)[0];
    w.units.hp[u] = 0;
    w.dead_units.push(u as u32);
    steps(&mut w, 900);
    assert_eq!((w.arks[0].turrets[0].state, w.arks[0].turrets[0].timer), (TU_LOST, 0), "sans composants, elle attend");
    put(&mut w.units.cold[s].hold, IRON_PLATE, 12);
    put(&mut w.units.cold[s].hold, GEAR, 4);
    steps(&mut w, TURRET_REBUILD as u32 + 200);
    assert_eq!(turrets(&w).len(), 1);
}

#[test]
fn the_shield_covers_the_convoy_and_grows_with_its_rank() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_SHIELD1);
    assert_eq!(unit_shield(&w, s), (6, 2500));
    steps(&mut w, 700);
    assert_eq!(w.units.cold[s].shield, 2500, "rechargé");
    // un chenillard à 4 cases, dans la bulle : un obus tiré du dehors ne le blesse pas
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let c = w.spawn_unit(U_CH_DRILL, 0, x + 4 * TILE, y);
    let gun = w.spawn_unit(U_LIGHT_TANK, 1, x + 15 * TILE, y);
    let (cs, gs) = (w.unit(c).unwrap(), w.unit(gun).unwrap());
    let hp = w.units.hp[cs];
    w.units.cold[s].cooldown = [2000; 2];
    let gid = w.unit_id(gs) as i32;
    order(&mut w, 1, O_ATTACK, &[0, c as i32, 1, gid]);
    w.units.hp[gs] = 100_000;
    steps(&mut w, 120);
    assert_eq!(w.units.hp[cs], hp, "le bouclier prend les coups");
    assert!(w.units.cold[s].shield < 2500 || w.units.cold[gs].flags & UF_FIRING == 0);
    // paliers
    fit_now(&mut w, ark, M_SHIELD2);
    assert_eq!(unit_shield(&w, s), (8, 5000));
    fit_now(&mut w, ark, M_SHIELD3);
    assert_eq!(unit_shield(&w, s), (11, 9000));
    assert!(w.units.cold[s].shield > 0);
    // brisé : il revient après 10 s ; remplacé : il s'éteint
    w.units.cold[s].shield = 0;
    w.units.cold[s].shield_down = 200;
    steps(&mut w, 201);
    assert!(w.units.cold[s].shield >= 2250);
    fit_now(&mut w, ark, M_PLATE1);
    assert_eq!((w.units.cold[s].shield, unit_shield(&w, s)), (0, (0, 0)));
    assert!(!w.shields.iter().any(|sh| sh.4 == ark as u32));
}

#[test]
fn a_module_keeps_its_upgrade_when_it_folds_and_deploys() {
    let (mut w, s) = ark_game(true);
    let b = place_building(&mut w, 0, B_T_FURNACE, 262, 255, 0).unwrap();
    complete_building(&mut w, b);
    w.infinite_grid = true;
    w.power_dirty = true;
    w.buildings[b].recipe = 0;
    let r = w.building_ref(b) as i32;
    let base = crate::buildings::crafter_speed(&w.buildings[b]);
    order(&mut w, 0, O_MOD_INSTALL, &[M_FURNACE_FAST as i32, 1, r]);
    assert_eq!(w.buildings[b].mod_job, M_FURNACE_FAST);
    // à l'arrêt pendant l'installation
    w.buildings[b].inv[0] = 5;
    steps(&mut w, 100);
    assert_eq!((w.buildings[b].inv[0], w.buildings[b].out), (5, 0), "ne travaille pas");
    // repliée au milieu de l'installation : elle continue sur le chenillard
    order(&mut w, 0, O_PACK, &[1, r]);
    let c = (0..w.units.alive.len()).find(|&u| w.units.alive[u] && w.units.kind[u] == U_CH_FURNACE).unwrap();
    assert_eq!(w.units.cold[c].mod_job, M_FURNACE_FAST);
    steps(&mut w, 400);
    assert!(has(w.units.cold[c].mods, M_FURNACE_FAST), "installée sur le chenillard");
    // redéployée : toujours là, et elle travaille plus vite
    let cid = w.unit_id(c) as i32;
    order(&mut w, 0, O_DEPLOY, &[1, cid]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 3);
    let b2 = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_T_FURNACE).unwrap();
    assert_eq!(fit(&w.buildings[b2]), M_FURNACE_FAST);
    assert_eq!(crate::buildings::crafter_speed(&w.buildings[b2]), base * 160 / 100);
    // l'autre branche la remplace
    let r2 = w.building_ref(b2) as i32;
    fit_now(&mut w, r2, M_FURNACE_YIELD);
    assert_eq!(fit(&w.buildings[b2]), M_FURNACE_YIELD);
    let _ = s;
}

#[test]
fn a_folding_hold_keeps_the_fittings_of_its_carts() {
    let (mut w, _) = ark_game(true);
    let h = place_building(&mut w, 0, B_T_HOLD, 262, 255, 0).unwrap();
    complete_building(&mut w, h);
    put(&mut w.buildings[h].stash, IRON_PLATE, 100);
    put(&mut w.buildings[h].stash, GEAR, 50);
    let r = w.building_ref(h) as i32;
    for _ in 0..3 {
        order(&mut w, 0, O_HITCH, &[r]);
    }
    let carts = crate::transhumants::carts_of(&w, h);
    let ids: Vec<i32> = carts.iter().map(|&s| id(&w, s)).collect();
    fit_now(&mut w, ids[0], M_CART_BIG);
    fit_now(&mut w, ids[2], M_CART_FAST);
    assert_eq!(cart_cap(&w, carts[0]), 40);
    fit_now(&mut w, r, M_HOLD_BIG);
    order(&mut w, 0, O_PACK, &[1, r]);
    steps(&mut w, 250);
    let c = (0..w.units.alive.len()).find(|&u| w.units.alive[u] && w.units.kind[u] == U_CH_HOLD).unwrap();
    let cid = id(&w, c);
    order(&mut w, 0, O_DEPLOY, &[1, cid]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 3);
    let h2 = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_T_HOLD).unwrap();
    assert_eq!((w.buildings[h2].mods, crate::drones::store_cap(&w.buildings[h2])), (M_HOLD_BIG as u64, 1500));
    let mut mods: Vec<u64> = crate::transhumants::carts_of(&w, h2).iter().map(|&s| w.units.cold[s].mods).collect();
    mods.sort_unstable();
    assert_eq!(mods, [0, M_CART_BIG as u64, M_CART_FAST as u64]);
}

#[test]
fn yield_upgrades_give_more_for_the_same_ore() {
    let (mut w, _) = ark_game(true);
    let b = place_building(&mut w, 0, B_T_FURNACE, 262, 255, 0).unwrap();
    complete_building(&mut w, b);
    w.infinite_grid = true;
    w.power_dirty = true;
    w.buildings[b].recipe = 0;
    w.buildings[b].mods = M_FURNACE_YIELD as u64;
    let mut made = 0;
    for _ in 0..8 {
        w.buildings[b].inv[0] = 1;
        w.buildings[b].wake = 0;
        steps(&mut w, 60);
        made += w.buildings[b].out as u32;
        w.buildings[b].out = 0;
    }
    assert_eq!(made, 10, "8 minerais, 10 plaques");
    // gabarits économes : un cycle sur 5 ne prend rien
    let a = place_building(&mut w, 0, B_T_ASSEMBLER, 268, 255, 0).unwrap();
    complete_building(&mut w, a);
    w.power_dirty = true;
    let gear = RECIPES.iter().position(|r| r.key == "gear").unwrap();
    w.buildings[a].recipe = gear as u8;
    w.buildings[a].mods = M_ASM_THRIFT as u64;
    w.buildings[a].inv[0] = 20;
    let mut gears = 0;
    for _ in 0..30 {
        w.buildings[a].wake = 0;
        steps(&mut w, 30);
        gears += w.buildings[a].out;
        w.buildings[a].out = 0;
    }
    assert!(gears >= 12, "20 plaques donnent plus de 10 engrenages ({gears})");
}

#[test]
fn drills_wear_the_deposit_according_to_their_upgrade() {
    let wear_after = |m: u8| {
        let (mut w, _) = ark_game(true);
        let k = w.map.spots.len();
        for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
            let i = w.map.idx(262 + dx, 255 + dy);
            w.map.deposit[i] = IRON_ORE;
        }
        w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x: 262, y: 255, purity: 100 });
        w.wear.resize(w.map.spots.len(), 0);
        let b = place_building(&mut w, 0, B_T_DRILL, 262, 255, 0).unwrap();
        complete_building(&mut w, b);
        w.buildings[b].link = k as u32;
        w.buildings[b].mods = m as u64;
        w.infinite_grid = true;
        w.power_dirty = true;
        let mut made = 0;
        for _ in 0..1000 {
            steps(&mut w, 1);
            made += w.buildings[b].out as u32;
            w.buildings[b].out = 0;
        }
        (w.wear[k], made)
    };
    let (w0, n0) = wear_after(0);
    let (wf, nf) = wear_after(M_DRILL_FAST);
    let (wc, nc) = wear_after(M_DRILL_CLEAN);
    assert_eq!((wf, wc), (2 * w0, 0), "percussion : deux fois plus d'usure ; propre : aucune");
    assert!(w0 > 0 && nf > n0 * 3 / 2 && nc < n0, "{n0} {nf} {nc}");
}

#[test]
fn module_upgrades_change_storage_power_and_weapons() {
    let (mut w, _) = ark_game(true);
    let put_b = |w: &mut World, kind: u16, x: i32| {
        let b = place_building(w, 0, kind, x, 262, 0).unwrap();
        complete_building(w, b);
        b
    };
    let hold_b = put_b(&mut w, B_T_HOLD, 250);
    assert_eq!(crate::drones::store_cap(&w.buildings[hold_b]), 600);
    w.buildings[hold_b].mods = M_HOLD_BIG as u64;
    assert_eq!(crate::drones::store_cap(&w.buildings[hold_b]), 1500);
    w.buildings[hold_b].mods = M_HOLD_ARMOR as u64;
    let hp = w.buildings[hold_b].hp;
    crate::combat::damage_building(&mut w, hold_b, 100, 1);
    assert_eq!(w.buildings[hold_b].hp, hp - 50);
    let g = put_b(&mut w, B_T_GENERATOR, 254);
    let r = w.building_ref(g) as i32;
    assert_eq!(crate::buildings::power_prod_of(&w.buildings[g]), 600);
    fit_now(&mut w, r, M_GEN_BIG);
    assert_eq!(crate::buildings::power_prod_of(&w.buildings[g]), 1000);
    fit_now(&mut w, r, M_GEN_LEAN);
    assert_eq!((crate::buildings::power_prod_of(&w.buildings[g]), crate::buildings::supply_of(&w.buildings[g])), (600, 12));
    let bast = put_b(&mut w, B_T_BASTION, 258);
    let r = w.building_ref(bast) as i32;
    fit_now(&mut w, r, M_BASTION_LONG);
    assert_eq!(WEAPONS[building_weapon(&w.buildings[bast]) as usize].range, 44);
    fit_now(&mut w, r, M_BASTION_SHIELD);
    steps(&mut w, 700);
    assert_eq!(w.buildings[bast].shield, 1500);
    assert!(w.shields.iter().any(|s| s.4 == r as u32 && s.2 == 6 * TILE), "bulle du bastion");
}

#[test]
fn units_are_equipped_several_at_once() {
    let (mut w, s) = ark_game(true);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let ids: Vec<i32> = (0..3).map(|k| w.spawn_unit(U_RIDER, 0, x + (6 + k) * TILE, y) as i32).collect();
    order(&mut w, 0, O_MOD_INSTALL, &[M_RIDER_PLATE as i32, 3, ids[0], ids[1], ids[2]]);
    let t = install_ticks(&w, 0, M_RIDER_PLATE) as u32;
    steps(&mut w, t + 1);
    for &i in &ids {
        let u = w.unit(i as u32).unwrap();
        assert!(has(w.units.cold[u].mods, M_RIDER_PLATE));
        assert_eq!(unit_armor(&w, u, 100), 70);
    }
    // le canon tracté à tube allongé attaque de plus loin
    let g = w.spawn_unit(U_TOWED_GUN, 0, x, y + 8 * TILE);
    let gs = w.unit(g).unwrap();
    assert_eq!(attack_range(&w, gs, NONE), 40);
    fit_now(&mut w, g as i32, M_GUN_LONG);
    assert_eq!(attack_range(&w, gs, NONE), 54);
}

#[test]
fn boost_workshop_dynamo_and_repair_work() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    let base = speed(&w, s);
    // surcharge : 12 s, puis recharge
    fit_now(&mut w, ark, M_BOOST);
    order(&mut w, 0, O_ARK_BOOST, &[1, ark]);
    assert_eq!(speed(&w, s), base * 160 / 100);
    steps(&mut w, BOOST_TICKS);
    assert_eq!(speed(&w, s), base);
    order(&mut w, 0, O_ARK_BOOST, &[1, ark]);
    assert_eq!(speed(&w, s), base, "pas encore rechargée");
    // atelier embarqué : en roulant, à 60 %
    fit_now(&mut w, ark, M_WORKSHOP);
    order(&mut w, 0, O_ARK_QUEUE, &[ark, U_TRACKER as i32, 2]);
    let gx = w.units.x[s] + 30 * TILE;
    let y = w.units.y[s];
    order(&mut w, 0, O_MOVE, &[0, gx, y, 1, ark, gx, y]);
    steps(&mut w, 2 * factory_ticks(U_TRACKER) * 100 / WORKSHOP_PCT + 30);
    let n = (0..w.units.alive.len()).filter(|&u| w.units.alive[u] && w.units.owner[u] == 0 && w.units.kind[u] == U_TRACKER).count();
    assert_eq!((n, w.arks[0].queue.len()), (2, 0));
    // une unité en cours retirée de la file est remboursée
    let iron = hold(&w, s, IRON_PLATE);
    order(&mut w, 0, O_ARK_QUEUE, &[ark, U_TRACKER as i32, 1]);
    steps(&mut w, 20);
    assert_eq!(hold(&w, s, IRON_PLATE), iron - 5);
    order(&mut w, 0, O_ARK_QUEUE, &[ark, U_TRACKER as i32, -1]);
    assert_eq!(hold(&w, s, IRON_PLATE), iron);
    steps(&mut w, 700);
    // groupe électrogène : posé à l'arrêt, rembarqué au départ
    fit_now(&mut w, ark, M_DYNAMO);
    steps(&mut w, 100);
    let d = w.building(w.arks[0].dock).expect("groupe posé");
    steps(&mut w, 10);
    assert_eq!(crate::buildings::gen_prod(&w, &w.buildings[d]), 500);
    assert!(w.buildings[d].net != 0, "il forme une zone sans combustible");
    let gx = w.units.x[s] - 10 * TILE;
    order(&mut w, 0, O_MOVE, &[0, gx, y, 1, ark, gx, y]);
    steps(&mut w, 120);
    assert!(!(0..w.buildings.len()).any(|b| w.buildings[b].alive && w.buildings[b].kind == B_ARK_DOCK), "rembarqué");
    // bras réparateurs
    fit_now(&mut w, ark, M_REPAIR);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let c = w.spawn_unit(U_CH_DRILL, 0, x + 5 * TILE, y);
    let cs = w.unit(c).unwrap();
    w.units.hp[cs] = 100;
    steps(&mut w, 200);
    assert!(w.units.hp[cs] > 100, "réparé");
    assert!(w.units.hp[cs] < 100 + 12 * w.max_hp(cs) / 100);
}

#[test]
fn spur_loot_radar_and_jammer_work() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    fit_now(&mut w, ark, M_SPUR);
    let e = w.spawn_unit(U_ENG1, 1, x + 6 * TILE, y);
    let es = w.unit(e).unwrap();
    w.units.cold[es].stun = 600;
    w.units.hp[es] = 900;
    w.units.cold[s].cooldown = [600; 2];
    let gx = x + 12 * TILE;
    order(&mut w, 0, O_MOVE, &[0, gx, y, 1, ark, gx, y]);
    steps(&mut w, 160);
    assert!(w.unit(e).is_none(), "écrasé par l'éperon");
    // butin : 40 % au lieu de 25 %
    assert_eq!(loot_pct(&w, 0, s), 25);
    fit_now(&mut w, ark, M_LOOT);
    assert_eq!((loot_pct(&w, 0, s), loot_pct(&w, 1, s)), (40, 25));
    let ram = w.spawn_unit(U_RAM, 0, x, y + 6 * TILE);
    let rs = w.unit(ram).unwrap();
    w.units.cold[rs].mods = M_RAM_HOOK as u64;
    assert_eq!(loot_pct(&w, 0, rs), 80);
    fit_now(&mut w, ark, M_RADAR);
    assert_eq!((unit_radar(&w, s), unit_vision(&w, s)), (70, 40));
    fit_now(&mut w, ark, M_JAMMER);
    steps(&mut w, 11);
    assert!(crate::combat::radar_stealth(&w, s), "brouillée");
}

#[test]
fn every_ark_weapon_hits() {
    for (m, wi) in [(M_W_SIEGE, W_SIEGE), (M_W_FLAME, W_FLAME), (M_W_ROCKETS, W_ROCKETS), (M_W_RAIL, W_RAIL)] {
        let (mut w, s) = ark_game(true);
        let ark = id(&w, s);
        fit_now(&mut w, ark, m);
        assert_eq!(weapons_of(&w, s).0[0], wi);
        let (x, y) = (w.units.x[s], w.units.y[s]);
        let e = w.spawn_unit(U_LIGHT_TANK, 1, x + 10 * TILE, y);
        let es = w.unit(e).unwrap();
        w.units.hp[es] = 100_000;
        w.units.cold[es].stun = 2000;
        steps(&mut w, 260);
        assert!(w.units.hp[es] < 100_000, "{}", MODS[m as usize].name);
    }
    // batterie antiaérienne : contre les avions ; le canon d'origine reste contre le sol
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_W_FLAK);
    assert_eq!(weapons_of(&w, s).0, [69, W_FLAK]);
    assert_eq!(attack_range(&w, s, NONE), 24);
    let e = w.spawn_unit(U_TRANSPORT, 1, w.units.x[s] + 34 * TILE, w.units.y[s]);
    assert_eq!(attack_range(&w, s, e), 40);
}

#[test]
fn saves_keep_the_upgrades() {
    let (mut w, s) = ark_game(true);
    let ark = id(&w, s);
    fit_now(&mut w, ark, M_TURRETS1);
    fit_now(&mut w, ark, M_TURRETS2);
    fit_now(&mut w, ark, M_SHIELD1);
    order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
    order(&mut w, 0, O_MOD_INSTALL, &[M_ENGINE1 as i32, 1, ark]);
    steps(&mut w, 60);
    let bytes = crate::save::snapshot(&w);
    let mut w2 = crate::save::restore(&bytes).expect("sauvegarde lue");
    assert_eq!(w.hash(), w2.hash());
    for _ in 0..600 {
        assert_eq!(w.step(&[]), w2.step(&[]), "même suite de partie");
    }
    assert_eq!(turrets(&w2).len(), 3);
    assert!(has(w2.units.cold[s].mods, M_ENGINE1));
}

#[test]
fn saves_from_before_the_upgrades_still_load() {
    let (mut w, _) = ark_game(false);
    steps(&mut w, 20);
    let mut v6 = crate::save::write(&w, 6, &[]);
    let w7 = crate::save::restore(&crate::save::write(&w, 7, &[])).expect("version 7");
    assert_eq!((w7.arks.len(), w7.units.cold.len()), (1, w.units.cold.len()));
    let w6 = crate::save::restore(&v6).expect("version 6");
    assert_eq!(w6.arks.len(), 1, "état de l'Arche recréé");
    assert_eq!(w6.units.alive.len(), w.units.alive.len());
    // recherches : une sauvegarde d'alors n'en avait que 64
    for p in w.players.iter_mut() {
        p.tech_progress.truncate(64);
    }
    v6 = crate::save::write(&w, 6, &[]);
    let mut w6 = crate::save::restore(&v6).expect("version 6, 64 recherches");
    assert!(w6.players.iter().all(|p| p.tech_progress.len() == TECHS.len()));
    order(&mut w6, 0, O_RESEARCH, &[T_T_CROWN as i32]);
    steps(&mut w6, 50);
}

#[test]
fn upgrades_are_deterministic() {
    let run = || {
        let (mut w, s) = ark_game(true);
        let ark = id(&w, s);
        let mut h = Vec::new();
        for m in [M_TURRETS1, M_TURRETS2, M_TURRETS3, M_W_ROCKETS, M_BOOST, M_REPAIR] {
            fit_now(&mut w, ark, m);
        }
        order(&mut w, 0, O_ARK_TURRET_TYPE, &[ark, -1, 2]);
        order(&mut w, 0, O_ARK_TURRETS, &[1, 1, ark]);
        let (x, y) = (w.units.x[s], w.units.y[s]);
        for k in 0..12 {
            w.spawn_unit(U_LIGHT_TANK, 1, x + 26 * TILE, y + (k - 6) * TILE);
        }
        order(&mut w, 0, O_ARK_BOOST, &[1, ark]);
        let gx = x + 12 * TILE;
        order(&mut w, 0, O_MOVE, &[2, gx, y, 1, ark, gx, y]);
        for _ in 0..800 {
            h.push(w.step(&[]));
        }
        h
    };
    assert_eq!(run(), run());
}
