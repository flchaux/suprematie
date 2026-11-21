//! Tests de la pureté des gisements, des geysers (centrale géothermique) et de la cadence des machines.

use crate::buildings::{can_place, complete_building, place_building, set_clock, shards_for};
use crate::data::*;
use crate::fixed::TILE;
use crate::map::{PURITY_IMPURE, PURITY_NORMAL, PURITY_PURE};
use crate::world::*;

fn params(np: usize, size: i32) -> Vec<i32> {
    let mut p = vec![4242, size, 0, np as i32];
    for i in 0..np {
        p.extend_from_slice(&[i as i32, 0, 100, 100]);
    }
    p
}

/// Zone plate et vide, sans gisement.
fn clear(w: &mut World, x0: i32, y0: i32, x1: i32, y1: i32) {
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

fn spot(w: &mut World, kind: u8, x: i32, y: i32, purity: u8) {
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(x + dx, y + dy);
            w.map.deposit[i] = kind;
        }
    }
    w.map.spots.push(crate::map::Spot { kind, x, y, purity });
}

fn put(w: &mut World, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, 0, kind, x, y, 0).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

fn world() -> World {
    let mut w = World::new(&params(1, 256));
    w.infinite_grid = true;
    // recherche de la centrale géothermique (Hydrocarbures)
    w.players[0].researched |= 1 << bdef(B_GEOTHERMAL).tech;
    clear(&mut w, 60, 60, 140, 140);
    w
}

fn dist_to_start(w: &World, x: i32, y: i32) -> i32 {
    w.map.starts.iter().map(|&(sx, sy)| crate::fixed::isqrt((((sx - x) as i64).pow(2) + ((sy - y) as i64).pow(2)) as u64) as i32).min().unwrap()
}

// ---------- Pureté ----------

#[test]
fn generated_deposits_have_a_purity() {
    let w = World::new(&params(4, 512));
    let mut seen = [0; 3];
    for s in &w.map.spots {
        assert!(matches!(s.purity, PURITY_IMPURE | PURITY_NORMAL | PURITY_PURE), "pureté {}", s.purity);
        // les gisements tout près des départs et le cristal sont normaux
        if dist_to_start(&w, s.x, s.y) < 25 || s.kind == CRYSTAL {
            assert_eq!(s.purity, PURITY_NORMAL, "gisement de départ en {},{}", s.x, s.y);
        }
        seen[match s.purity {
            PURITY_IMPURE => 0,
            PURITY_NORMAL => 1,
            _ => 2,
        }] += 1;
    }
    assert!(seen.iter().all(|&n| n > 0), "toutes les puretés existent : {seen:?}");
    // même graine, mêmes puretés
    let w2 = World::new(&params(4, 512));
    assert!(w.map.spots.iter().zip(&w2.map.spots).all(|(a, b)| a.purity == b.purity));
}

#[test]
fn purity_scales_extraction() {
    let mut w = world();
    spot(&mut w, IRON_ORE, 70, 70, PURITY_IMPURE);
    spot(&mut w, IRON_ORE, 80, 70, 0);
    spot(&mut w, IRON_ORE, 90, 70, PURITY_PURE);
    let a = put(&mut w, B_EXTRACTOR, 70, 70);
    let b = put(&mut w, B_EXTRACTOR, 80, 70);
    let c = put(&mut w, B_EXTRACTOR, 90, 70);
    for _ in 0..10 {
        w.step(&[]);
    }
    let (pa, pb, pc) = (w.buildings[a].progress, w.buildings[b].progress, w.buildings[c].progress);
    assert!(pb > 0);
    assert_eq!(pa * 2, pb, "impur : moitié");
    assert_eq!(pc, pb * 2, "pur : double");
}

// ---------- Geysers ----------

#[test]
fn geysers_lie_far_from_starts() {
    let w = World::new(&params(4, 512));
    let g: Vec<_> = w.map.spots.iter().filter(|s| s.kind == GEYSER).collect();
    assert!(g.len() >= 4, "{} geysers", g.len());
    for s in g {
        assert!(dist_to_start(&w, s.x, s.y) > 512 * 18 / 100 - 30, "geyser trop près d'un départ");
    }
}

#[test]
fn geothermal_only_on_a_geyser_and_extractors_never() {
    let mut w = world();
    spot(&mut w, GEYSER, 100, 100, 0);
    assert!(!can_place(&w, 0, B_GEOTHERMAL, 70, 70, 0), "centrale hors geyser");
    assert!(!can_place(&w, 0, B_EXTRACTOR, 100, 100, 0), "extracteur sur un geyser");
    assert!(!can_place(&w, 0, B_GENERATOR, 100, 100, 0), "autre bâtiment sur un geyser");
    assert!(can_place(&w, 0, B_GEOTHERMAL, 99, 99, 0), "centrale sur le geyser");
}

#[test]
fn geothermal_output_waves_without_fuel() {
    let mut w = World::new(&params(1, 256));
    w.players[0].researched |= 1 << bdef(B_GEOTHERMAL).tech;
    clear(&mut w, 60, 60, 140, 140);
    spot(&mut w, GEYSER, 100, 100, PURITY_PURE);
    let g = put(&mut w, B_GEOTHERMAL, 99, 99);
    assert_eq!(w.buildings[g].fuel, 0);
    let (mut lo, mut hi) = (i32::MAX, 0);
    for _ in 0..crate::buildings::GEO_PERIOD + 20 {
        w.step(&[]);
        let p = w.players[0].power_prod;
        lo = lo.min(p);
        hi = hi.max(p);
    }
    let base = bdef(B_GEOTHERMAL).power_prod * 2; // geyser pur
    assert!(lo >= base / 2 - 10 && lo <= base / 2 + 40, "creux {lo}");
    assert!(hi <= base * 3 / 2 + 10 && hi >= base * 3 / 2 - 40, "crête {hi}");
    assert_eq!(w.buildings[g].fuel, 0, "rien n'a brûlé");
    // la centrale refuse le combustible
    assert_eq!(crate::buildings::fuel_energy(B_GEOTHERMAL, HYDROCARBON), 0);
}

// ---------- Cadence ----------

#[test]
fn overclock_needs_shards_and_speeds_up() {
    let mut w = world();
    spot(&mut w, IRON_ORE, 80, 70, 0);
    spot(&mut w, IRON_ORE, 90, 70, 0);
    let a = put(&mut w, B_EXTRACTOR, 80, 70);
    let b = put(&mut w, B_EXTRACTOR, 90, 70);
    assert_eq!(shards_for(100), 0);
    assert_eq!(shards_for(150), 1);
    assert_eq!(shards_for(160), 2);
    assert_eq!(shards_for(250), 3);
    // pas de fragment : pas de surcadençage
    assert!(!set_clock(&mut w, b, 200));
    assert_eq!(crate::buildings::clock_of(&w.buildings[b]), 100);
    // deux fragments : 200 %
    w.players[0].shards = 2;
    assert!(set_clock(&mut w, b, 200));
    assert_eq!((w.players[0].shards, w.buildings[b].shards), (0, 2));
    for _ in 0..10 {
        w.step(&[]);
    }
    let net = w.buildings[a].net as usize;
    assert_eq!(w.buildings[b].progress, w.buildings[a].progress * 2, "200 % : deux fois plus vite");
    // énergie : 1 + 2,5 = 3,5 fois la consommation d'un extracteur
    let one = bdef(B_EXTRACTOR).power_use;
    assert_eq!(w.nets[net].demand, one + one * 2500 / 1000);
    // ralentir rend les fragments ; sous-cadencer n'en demande pas
    assert!(set_clock(&mut w, b, 50));
    assert_eq!((w.players[0].shards, w.buildings[b].shards), (2, 0));
    assert_eq!(crate::buildings::clock_power(&w.buildings[b]), 400);
}

#[test]
fn reclaimed_machine_returns_its_shards() {
    let mut w = world();
    spot(&mut w, IRON_ORE, 80, 70, 0);
    let b = put(&mut w, B_EXTRACTOR, 80, 70);
    w.players[0].shards = 3;
    assert!(set_clock(&mut w, b, 250));
    assert_eq!(w.players[0].shards, 0);
    // un ingénieur démonte l'extracteur
    let r = w.building_ref(b) as i32;
    let e = w.spawn_unit(U_ENG1, 0, 84 * TILE, 71 * TILE) as i32;
    w.step(&[6, crate::orders::O_RECLAIM, 0, 0, r, 1, e]);
    for _ in 0..2000 {
        w.step(&[]);
        if w.building(r as u32).is_none() {
            break;
        }
    }
    assert!(w.building(r as u32).is_none(), "pas démonté");
    assert_eq!(w.players[0].shards, 3, "fragments rendus");
}

#[test]
fn clock_order_from_the_network() {
    let mut w = world();
    spot(&mut w, IRON_ORE, 80, 70, 0);
    let b = put(&mut w, B_EXTRACTOR, 80, 70);
    let r = w.building_ref(b) as i32;
    w.step(&[4, crate::orders::O_SET_CLOCK, 0, r, 70]);
    assert_eq!(crate::buildings::clock_of(&w.buildings[b]), 70);
    // un bâtiment qui ne se règle pas
    let p = put(&mut w, B_PYLON, 100, 100);
    assert!(!set_clock(&mut w, p, 50));
    let _ = TILE;
}
