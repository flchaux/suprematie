//! Tests : paliers des unités des Industriels. Comme dans Supreme Commander, un rôle a une version par
//! palier : les variantes des paliers supérieurs (char lourd, flak mobile, avion espion, canonnière lourde,
//! bombardier torpilleur, sous-marin chasseur, croiseur antiaérien) complètent les échelles.

use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;

fn kind(key: &str) -> u16 {
    UNITS.iter().position(|u| u.key == key).unwrap_or_else(|| panic!("unité {key}")) as u16
}

/// Monde de deux équipes : une mer profonde sur un carré de 120 cases de côté (x et y de 40 à 160).
fn sea_world() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100]);
    w.infinite_grid = true;
    w.map.spots.clear();
    let deep = w.map.water_level - 6;
    for y in 40..160 {
        for x in 40..160 {
            let i = w.map.idx(x, y);
            w.map.height[i] = deep;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w
}

fn hp_of(w: &World, id: u32) -> i32 {
    w.unit(id).map_or(0, |s| w.units.hp[s])
}

/// Échelles de rôles : chaque variante existe, est des Industriels, sort de la même usine que la version
/// du palier inférieur, et monte d'au moins un palier.
#[test]
fn industrial_roles_climb_the_tiers() {
    let ladders: &[&[&str]] = &[
        &["light_tank", "guardian", "heavy_tank"],
        &["mobile_aa", "flak"],
        &["scout_plane", "spy_plane"],
        &["gunship", "heavy_gunship"],
        &["bomber", "torpedo_bomber"],
        &["submarine", "hunter_sub"],
        &["frigate", "aa_cruiser"],
    ];
    for l in ladders {
        let defs: Vec<&UnitDef> = l.iter().map(|k| udef(kind(k))).collect();
        for d in &defs {
            assert_eq!(d.race, RACE_INDUS, "{}", d.key);
            assert!(d.factory == defs[0].factory, "{} : pas la même usine que {}", d.key, defs[0].key);
        }
        // la variante d'un palier supérieur vient au même palier (bombardier torpilleur) ou plus haut
        for p in defs.windows(2) {
            assert!(p[1].tier >= p[0].tier, "{} (palier {}) après {} (palier {})", p[1].key, p[1].tier, p[0].key, p[0].tier);
        }
        let last = defs[defs.len() - 1];
        assert!(TECHS[last.tech as usize].tier >= 3 && TECHS[last.tech as usize].race == RACE_INDUS, "{} : recherche {}", last.key, TECHS[last.tech as usize].key);
    }
    assert_eq!(udef(U_HUNTER_SUB).key, "hunter_sub");
    // les variantes de ligne du palier 5 sont plus résistantes que leur version de base
    assert!(udef(kind("heavy_tank")).hp > 4 * udef(kind("light_tank")).hp);
    assert!(udef(kind("heavy_gunship")).hp > 2 * udef(kind("gunship")).hp);
}

/// La canonnière lourde vole sur place comme la canonnière ; l'avion espion et le bombardier torpilleur
/// sont des avions à voilure fixe.
#[test]
fn the_heavy_gunship_hovers_like_the_gunship() {
    assert!(!crate::units::fixed_wing(kind("gunship")));
    assert!(!crate::units::fixed_wing(kind("heavy_gunship")));
    assert!(crate::units::fixed_wing(kind("spy_plane")));
    assert!(crate::units::fixed_wing(kind("torpedo_bomber")));
}

/// Le bombardier torpilleur coule un navire : sa torpille touche ce qui est sur l'eau.
#[test]
fn a_torpedo_bomber_hits_a_ship() {
    let mut w = sea_world();
    let ship = w.spawn_unit(kind("frigate"), 1, 100 * TILE, 100 * TILE);
    let plane = w.spawn_unit(kind("torpedo_bomber"), 0, 70 * TILE, 100 * TILE);
    w.units.cold[slot_of(plane)].orders.push(Order::Attack { target: ship });
    let full = hp_of(&w, ship);
    for _ in 0..600 {
        w.step(&[]);
    }
    assert!(hp_of(&w, ship) < full - 250, "frégate : {} / {full}", hp_of(&w, ship));
}

/// Le sous-marin chasseur repère un sous-marin à 25 cases (sonar de 30 cases, au lieu de 18) et le torpille
/// sans ordre ; un sous-marin ordinaire au même endroit ne le voit pas.
#[test]
fn the_hunter_sub_finds_and_sinks_a_submarine() {
    let run = |hunter: &str| {
        let mut w = sea_world();
        let prey = w.spawn_unit(kind("submarine"), 1, 100 * TILE, 100 * TILE);
        w.spawn_unit(kind(hunter), 0, 75 * TILE, 100 * TILE);
        let full = hp_of(&w, prey);
        for _ in 0..200 {
            w.step(&[]);
        }
        full - hp_of(&w, prey)
    };
    let hit = run("hunter_sub");
    assert!(hit >= 380, "dégâts du sous-marin chasseur : {hit}");
    assert_eq!(run("submarine"), 0, "un sous-marin ordinaire ne voit pas à 25 cases");
}
