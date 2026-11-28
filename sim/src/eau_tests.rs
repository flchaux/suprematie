//! Tests de l'eau de la Souche (eau.rs) : nappes, forage, puits, épuisement, œufs, frondaisons, sauvegardes.

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::eau;
use crate::fixed::TILE;
use crate::orders::{O_BUILD, O_FACTORY_QUEUE, O_UPGRADE, O_WATER};
use crate::world::*;

fn game() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 0, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    w.place_start_buildings();
    let q = w.unit(w.players[0].commander).unwrap();
    w.units.cold[q].stun = 60_000;
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

/// Graine-mère du joueur 0, terrain plat et sec de `r` cases autour, réserve large ; (indice, x, y).
fn base(w: &mut World, r: i32) -> (usize, i32, i32) {
    let h = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == 0 && w.buildings[b].kind == B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[h].x, w.buildings[h].y);
    w.map.spots.retain(|s| !(s.x >= hx - r - 2 && s.x <= hx + r + 3 && s.y >= hy - r - 2 && s.y <= hy + r + 3));
    for y in hy - r..hy + r + 3 {
        for x in hx - r..hx + r + 3 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            if w.map.occ[i] == 0 {
                w.map.update_pass(x, y);
            }
        }
    }
    w.wear.resize(w.map.spots.len(), 0);
    w.aquifer.clear();
    let net = w.buildings[h].net as usize;
    w.nets[net].store = 100_000;
    (h, hx, hy)
}

/// Nappe de `per` eau par maille sur tout le rectangle de cases donné (le reste de la carte garde la sienne).
fn soak(w: &mut World, x0: i32, y0: i32, x1: i32, y1: i32, per: u32) {
    eau::ensure(w);
    let gw = (w.map.w + eau::CELL - 1) / eau::CELL;
    for gy in y0 / eau::CELL..=y1 / eau::CELL {
        for gx in x0 / eau::CELL..=x1 / eau::CELL {
            w.aquifer[(gy * gw + gx) as usize] = per;
        }
    }
}

fn net_eau(w: &World, b: usize) -> i32 {
    w.nets[w.buildings[b].net as usize].eau
}

/// La fiche d'un forage dit l'eau de la nappe dès qu'il est creusé, même sans aucun puits dans la partie.
#[test]
fn a_borehole_reads_its_aquifer_before_any_well() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 30);
    let b = place_building(&mut w, 0, B_BOREHOLE, hx + 20, hy, 0).unwrap();
    complete_building(&mut w, b);
    w.step(&[]);
    assert!(!w.aquifer.is_empty(), "calculées dès le premier tick");
    let gw = (w.map.w + eau::CELL - 1) / eau::CELL;
    for gy in hy / eau::CELL - 4..=hy / eau::CELL + 4 {
        for gx in (hx + 20) / eau::CELL - 4..=(hx + 20) / eau::CELL + 4 {
            w.aquifer[(gy * gw + gx) as usize] = 1000;
        }
    }
    let info = crate::render::info_building(&w, w.building_ref(b));
    assert!(info.contains("\"well\":{\"rate\":250"), "{info}");
}

#[test]
fn aquifers_are_hidden_patches_drawn_from_the_seed() {
    let mut w = game();
    eau::ensure(&mut w);
    let a = w.aquifer.clone();
    let dry = a.iter().filter(|&&v| v == 0).count();
    let rich = a.iter().filter(|&&v| v >= 3000).count();
    println!("{} mailles : {dry} sèches, {rich} riches", a.len());
    assert!(dry * 100 > a.len() * 30 && rich > 50, "des poches riches, beaucoup de sec : {dry} sèches, {rich} riches");
    // tirées de la graine : la même partie a les mêmes, une autre carte d'autres
    let mut v = game();
    eau::ensure(&mut v);
    assert!(v.aquifer == a);
    let mut o = World::new(&[777, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 0, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    eau::ensure(&mut o);
    assert!(o.aquifer != a);
    // l'eau libre compte : une maille de lac est riche
    let lake = (0..w.map.h).flat_map(|y| (0..w.map.w).map(move |x| (x, y))).find(|&(x, y)| {
        (0..eau::CELL).all(|dy| (0..eau::CELL).all(|dx| w.map.inside(x + dx, y + dy) && w.map.height[w.map.idx(x + dx, y + dy)] < w.map.water_level))
    });
    if let Some((x, y)) = lake {
        let gw = (w.map.w + eau::CELL - 1) / eau::CELL;
        let c = ((y / eau::CELL + 1) * gw + x / eau::CELL + 1) as usize;
        assert!(w.aquifer[c] >= 4 * eau::PER_WATER_TILE, "maille d'un lac : {}", w.aquifer[c]);
    }
}

/// Un forage ne pousse pas seul : un semeur le creuse, même loin du terreau ; creusé, sa fiche dit ce qu'un puits
/// y tirerait. Construit en puits (payé par le réseau), il tire l'eau de la nappe et l'épuise.
#[test]
fn a_sower_digs_a_borehole_that_becomes_a_well() {
    let mut w = game();
    let (h, hx, hy) = base(&mut w, 30);
    soak(&mut w, hx - 30, hy - 30, hx + 30, hy + 30, 2000);
    // loin du terreau : on peut creuser, mais il ne pousse pas seul
    let far = place_building(&mut w, 0, B_BOREHOLE, hx + 20, hy, 0).expect("forage hors du terreau");
    steps(&mut w, 400);
    assert_eq!(w.buildings[far].build, 0, "un forage ne pousse pas seul");
    // un semeur le creuse : environ 30 s
    let s = w.spawn_unit(U_SOWER, 0, (hx + 3) * TILE, (hy + 4) * TILE);
    order(&mut w, O_BUILD, &[0, B_BOREHOLE as i32, hx + 3, hy, 0, 1, s as i32]);
    let mut t = 0;
    while (0..w.buildings.len()).all(|b| !(w.buildings[b].alive && w.buildings[b].kind == B_BOREHOLE && w.buildings[b].x == hx + 3 && w.buildings[b].complete())) && t < 1200 {
        w.step(&[]);
        t += 1;
    }
    println!("forage creusé en {t} ticks");
    // il a creusé au contact du forage, pas de loin
    let (bx, by) = (hx + 3, hy);
    let sl = w.unit(s).unwrap();
    let near = ((w.units.x[sl] - (bx + 1) * TILE).pow(2) + (w.units.y[sl] - (by + 1) * TILE).pow(2)) as f64;
    assert!(near.sqrt() <= (5 * TILE / 2) as f64 + 64.0, "à {} cases du centre", near.sqrt() / TILE as f64);
    assert!((560..=760).contains(&t), "une trentaine de secondes : {t}");
    let bore = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_BOREHOLE && w.buildings[b].x == hx + 3).unwrap();
    let info = crate::render::info_building(&w, w.building_ref(bore));
    assert!(info.contains("\"well\":{\"rate\":250"), "nappe riche : {info}");
    // le puits : payé par le réseau, il remplace le forage
    let net = w.buildings[h].net as usize;
    w.nets[net].seve = 500;
    let r = w.building_ref(bore) as i32;
    order(&mut w, O_UPGRADE, &[r]);
    assert!(w.buildings[bore].upgrade > 0 && w.nets[net].seve <= 420, "payé : {}", w.nets[net].seve);
    steps(&mut w, eau::WELL_TIME * 20 + 5);
    assert_eq!(w.buildings[bore].kind, B_WELL);
    w.nets[net].eau = 0;
    let before: u32 = w.drawn.iter().map(|d| d.1).sum();
    steps(&mut w, 400);
    let got = net_eau(&w, h);
    assert!((48..=51).contains(&got), "2,5 eau par seconde : {got}");
    assert_eq!((w.drawn.iter().map(|d| d.1).sum::<u32>() - before) as i32, got, "chaque goutte vient de la nappe");
    // hors du réseau (le forage lointain) : pas de puits
    let rf = w.building_ref(far) as i32;
    complete_building(&mut w, far);
    order(&mut w, O_UPGRADE, &[rf]);
    assert_eq!(w.buildings[far].upgrade, 0, "pas de réseau pour le payer");
}

/// Un puits se pose aussi sur un forage depuis le menu de construction : le semeur l'y plante, le forage devient un
/// puits (payé par le réseau, comme le bouton de sa fiche) ; pas sur un forage hors du terreau ni pas encore creusé.
#[test]
fn a_well_can_be_placed_on_a_borehole() {
    let mut w = game();
    let (h, hx, hy) = base(&mut w, 30);
    let bore = place_building(&mut w, 0, B_BOREHOLE, hx + 3, hy, 0).unwrap();
    let far = place_building(&mut w, 0, B_BOREHOLE, hx + 20, hy, 0).unwrap();
    assert!(!crate::buildings::can_place(&w, 0, B_WELL, hx + 3, hy, 0), "pas encore creusé");
    complete_building(&mut w, bore);
    complete_building(&mut w, far);
    crate::buildings::rebuild_power(&mut w);
    assert!(crate::buildings::can_place(&w, 0, B_WELL, hx + 3, hy, 0), "sur le forage creusé, dans le réseau");
    assert!(!crate::buildings::can_place(&w, 0, B_WELL, hx + 4, hy, 0), "à cheval sur le forage : non");
    assert!(!crate::buildings::can_place(&w, 0, B_WELL, hx + 20, hy, 0), "hors du terreau : non");
    assert!(!crate::buildings::can_place(&w, 1, B_WELL, hx + 3, hy, 0), "pas sur le forage d'un autre");
    // le semeur va le planter
    let net = w.buildings[h].net as usize;
    w.nets[net].seve = 500;
    let s = w.spawn_unit(U_SOWER, 0, (hx + 8) * TILE, (hy + 6) * TILE);
    order(&mut w, O_BUILD, &[0, B_WELL as i32, hx + 3, hy, 0, 1, s as i32]);
    let mut t = 0;
    while w.buildings[bore].upgrade == 0 && t < 600 {
        w.step(&[]);
        t += 1;
    }
    assert!(w.buildings[bore].upgrade > 0 && w.nets[net].seve <= 425, "construction lancée et payée ({t} ticks, {} sève)", w.nets[net].seve);
    steps(&mut w, eau::WELL_TIME * 20 + 5);
    assert_eq!(w.buildings[bore].kind, B_WELL);
    assert!(w.unit(s).is_some_and(|k| w.units.cold[k].orders.is_empty()), "le semeur a fini");
}

/// Un puits se pose au bord de l'eau (sur le terreau), pas ailleurs sans forage.
#[test]
fn wells_stand_on_the_shore_or_on_a_borehole() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 30);
    assert!(place_building(&mut w, 0, B_WELL, hx + 3, hy, 0).is_none(), "sur le terreau, loin de l'eau");
    // un étang au sud, au bord du terreau
    for y in hy + 5..hy + 10 {
        for x in hx - 2..hx + 6 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.map.water_level = 20;
    w.aquifer.clear();
    let b = place_building(&mut w, 0, B_WELL, hx, hy + 3, 0).expect("au bord de l'étang");
    complete_building(&mut w, b);
    crate::buildings::rebuild_power(&mut w);
    let (cx, cy) = w.buildings[b].center();
    eau::ensure(&mut w);
    assert!(eau::rate_at(&w, cx, cy) > 0, "l'étang la nourrit");
}

/// Deux puits voisins se partagent la même eau ; la nappe épuisée, ils ne tirent plus rien.
#[test]
fn wells_drain_their_surroundings() {
    let mut w = game();
    let (h, hx, hy) = base(&mut w, 30);
    eau::ensure(&mut w);
    for v in w.aquifer.iter_mut() {
        *v = 0;
    }
    soak(&mut w, hx - 8, hy - 8, hx + 10, hy + 10, 150);
    let a = place_building(&mut w, 0, B_WELL, hx + 3, hy, 0);
    assert!(a.is_none());
    // deux forages changés en puits, collés
    let mk = |w: &mut World, x: i32, y: i32| {
        let b = place_building(w, 0, B_BOREHOLE, x, y, 0).expect("forage");
        complete_building(w, b);
        w.buildings[b].kind = B_WELL;
        crate::buildings::rebuild_power(w);
        b
    };
    let p1 = mk(&mut w, hx + 3, hy);
    let (cx, cy) = w.buildings[p1].center();
    let start = eau::available(&w, cx, cy);
    let r1 = eau::rate_at(&w, cx, cy);
    let p2 = mk(&mut w, hx, hy + 3);
    let net = w.buildings[h].net as usize;
    w.nets[net].eau = 0;
    let mut last = 0;
    // une demi-heure
    for _ in 0..36 {
        steps(&mut w, 1000);
        last = eau::rate_at(&w, cx, cy);
    }
    let got = w.nets[net].eau;
    println!("eau alentour {start}, débit {r1} puis {last}, tirée {got}");
    assert!(got > 0 && last < r1 / 2, "la nappe baisse : {r1} puis {last}");
    assert!(eau::available(&w, cx, cy) + got as u32 <= start, "tirée de la nappe");
    assert!(w.buildings[p2].alive);
    // tout tiré : plus rien
    let total: u32 = w.aquifer.iter().sum();
    w.drawn = w.aquifer.iter().enumerate().filter(|&(_, &v)| v > 0).map(|(c, &v)| (c as u32, v)).collect();
    assert!(total > 0);
    w.nets[net].eau = 0;
    steps(&mut w, 400);
    assert_eq!(w.nets[net].eau, 0, "nappe vide");
}

/// Les organismes coûtent de l'eau : sans eau, leurs œufs attendent.
#[test]
fn eggs_need_water() {
    let mut w = game();
    let (h, _, _) = base(&mut w, 20);
    assert!(udef(U_GNAWER).cost.iter().any(|&(it, n)| it == EAU && n > 0));
    let net = w.buildings[h].net as usize;
    w.nets[net].seve = 2000;
    w.nets[net].sels = 2000;
    w.nets[net].eau = 0;
    let r = w.building_ref(h) as i32;
    order(&mut w, O_FACTORY_QUEUE, &[r, U_GNAWER as i32, 1]);
    steps(&mut w, 800);
    let gnawers = |w: &World| (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_GNAWER).count();
    assert_eq!(gnawers(&w), 0, "pas d'eau, pas d'éclosion");
    w.nets[net].eau = 500;
    steps(&mut w, 800);
    assert_eq!(gnawers(&w), 6);
    let used = w.players[0].consumed[EAU as usize];
    assert_eq!(used, 6 * udef(U_GNAWER).cost.iter().find(|c| c.0 == EAU).unwrap().1 as u32);
}

/// La consommation d'eau d'une frondaison se règle de 0 à 200 % : plus elle boit, plus elle mange vite.
#[test]
fn leaves_drink_to_grow_faster() {
    let run = |pct: i32, water: i32| {
        let mut w = game();
        let (h, hx, hy) = base(&mut w, 30);
        let l = place_building(&mut w, 0, B_LEAVES, hx + 4, hy, 0).unwrap();
        complete_building(&mut w, l);
        crate::buildings::rebuild_power(&mut w);
        let r = w.building_ref(l) as i32;
        order(&mut w, O_WATER, &[pct, 1, r]);
        let net = w.buildings[h].net as usize;
        w.nets[net].eau = water;
        let made = w.players[0].produced[SEVE as usize];
        steps(&mut w, 2000);
        let drunk = water - w.nets[net].eau;
        ((w.players[0].produced[SEVE as usize] - made) as i32 - 100, drunk, eau::leaf_pct(&w.buildings[l]))
    };
    let (dry, d0, p0) = run(0, 5000);
    let (normal, d1, _) = run(100, 5000);
    let (full, d2, p2) = run(200, 5000);
    let (thirsty, d3, _) = run(200, 0);
    println!("sans eau {dry} ({d0}), 100 % {normal} ({d1}), 200 % {full} ({d2}), réseau sec {thirsty}");
    assert_eq!((p0, p2), (0, 200));
    assert_eq!(d0, 0, "à 0 %, elle ne boit pas");
    assert!((18..=22).contains(&d1) && (38..=42).contains(&d2), "0,2 puis 0,4 eau par seconde : {d1} {d2}");
    assert!(normal * 100 > dry * 135 && full * 100 > dry * 175, "+50 % puis +100 % : {dry} {normal} {full}");
    assert!((thirsty - dry).abs() * 10 <= dry, "sans eau dans le réseau, son rythme : {thirsty} contre {dry}");
}

/// L'eau tirée et les réserves d'eau se relisent ; une sauvegarde d'avant l'eau se lit encore.
#[test]
fn water_survives_save_and_old_saves_load() {
    let mut w = game();
    let (h, hx, hy) = base(&mut w, 30);
    soak(&mut w, hx - 30, hy - 30, hx + 30, hy + 30, 3000);
    let b = place_building(&mut w, 0, B_BOREHOLE, hx + 3, hy, 0).unwrap();
    complete_building(&mut w, b);
    w.buildings[b].kind = B_WELL;
    crate::buildings::rebuild_power(&mut w);
    steps(&mut w, 300);
    // (les nappes de ce test sont posées à la main : la partie relue les recalcule de la graine)
    let mut r = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
    assert!(r.drawn == w.drawn && !w.drawn.is_empty());
    assert_eq!(net_eau(&r, h), net_eau(&w, h));
    eau::ensure(&mut r);
    r.aquifer.clone_from(&w.aquifer);
    for _ in 0..200 {
        assert_eq!(r.step(&[]), w.step(&[]));
    }
    // format 13 : tableaux d'objets à 31 cases ; les stocks d'une gare (à envoyer, puis reçus) sont élargis
    let mut old = game();
    old.players[0].produced[SEVE as usize] = 77;
    let st = (0..old.buildings.len()).find(|&b| old.buildings[b].alive).unwrap();
    let mut stash = vec![0u16; 2 * NUM_ITEMS_V13];
    stash[3] = 5;
    stash[NUM_ITEMS_V13 + 3] = 9;
    old.buildings[st].stash = stash;
    let bytes = crate::save::write(&old, 13, &[]);
    let back = crate::save::restore(&bytes).expect("format 13 relu");
    assert_eq!(back.players[0].produced[SEVE as usize], 77);
    assert_eq!(back.players[0].produced[EAU as usize], 0);
    let s = &back.buildings[st].stash;
    assert_eq!((s.len(), s[3], s[NUM_ITEMS + 3]), (2 * NUM_ITEMS, 5, 9));
}
