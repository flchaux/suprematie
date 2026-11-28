//! Tests de l'aide des semeurs (aide.rs) : rendement décroissant, racine-puits, frondaison, graine-mère, matrice.

use crate::aide;
use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::orders::{O_ASSIST, O_MOVE};
use crate::world::*;

/// Souche (joueur 0) contre Industriels, sans faune ; la Reine est figée.
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

/// Graine-mère du joueur 0 sur un terrain plat et dégagé de `r` cases ; renvoie (indice, x, y).
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
    let net = w.buildings[h].net as usize;
    w.nets[net].store = 100_000;
    (h, hx, hy)
}

fn put(w: &mut World, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, 0, kind, x, y, 0).unwrap_or_else(|| panic!("{} en ({x}, {y})", bdef(kind).key));
    complete_building(w, b);
    crate::buildings::rebuild_power(w);
    b
}

/// Racine-puits du joueur 0 sur un gisement de fer posé là.
fn taproot(w: &mut World, x: i32, y: i32) -> usize {
    for dy in 0..2 {
        for dx in 0..2 {
            let i = w.map.idx(x + dx, y + dy);
            w.map.deposit[i] = IRON_ORE;
        }
    }
    w.map.spots.push(crate::map::Spot { kind: IRON_ORE, x, y, purity: 0 });
    w.wear.resize(w.map.spots.len(), 0);
    put(w, B_TAPROOT, x, y)
}

/// `n` semeurs du joueur 0 à deux cases de (x, y).
fn sowers(w: &mut World, n: usize, x: i32, y: i32) -> Vec<u32> {
    (0..n).map(|k| w.spawn_unit(U_SOWER, 0, (x + 2) * TILE + (k as i32 % 4) * 120, (y + 3) * TILE + (k as i32 / 4) * 120)).collect()
}

fn assist(w: &mut World, ids: &[u32], b: usize) {
    let mut a = vec![0, w.building_ref(b) as i32, ids.len() as i32];
    a.extend(ids.iter().map(|&i| i as i32));
    order(w, O_ASSIST, &a);
}

/// Sels produits par le joueur 0 pendant `ticks`.
fn salts(w: &mut World, ticks: u32) -> i32 {
    let before = w.players[0].produced[SELS as usize];
    steps(w, ticks);
    (w.players[0].produced[SELS as usize] - before) as i32
}

#[test]
fn each_sower_helps_a_little_less() {
    let each: Vec<u32> = (1..=6).map(|n| aide::bonus(n) - aide::bonus(n - 1)).collect();
    assert_eq!(each, vec![250, 200, 166, 142, 125, 111], "25 %, 20 %, 17 %, 14 %, 12,5 %, 11 %");
    assert_eq!((aide::bonus(0), aide::bonus(2), aide::bonus(4)), (0, 450, 758));
    assert_eq!(aide::bonus(aide::HELPERS_MAX), aide::bonus(aide::HELPERS_MAX + 5), "pas plus de douze");
    assert_eq!(aide::bonus(aide::HELPERS_MAX), 1480);
}

/// Des semeurs qui aident une racine-puits lui font tirer plus de sels ; partis, elle revient à son débit.
#[test]
fn sowers_raise_a_taproot_output() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 20);
    let t = taproot(&mut w, hx + 3, hy);
    steps(&mut w, 20);
    assert_eq!(salts(&mut w, 400), 20, "un sel par seconde");
    let ids = sowers(&mut w, 2, hx + 3, hy);
    assist(&mut w, &ids, t);
    steps(&mut w, 200);
    assert_eq!(aide::count(&w, t), 2, "les deux semeurs sont à leur poste");
    assert!(ids.iter().all(|&i| matches!(w.units.cold[w.unit(i).unwrap()].orders.first(), Some(Order::Assist { .. }))), "ils y restent");
    assert_eq!(crate::souche::organ_rate(&w, t), (0, 145));
    let got = salts(&mut w, 400);
    assert!((28..=30).contains(&got), "+45 % : {got}");
    assert!(crate::render::info_building(&w, w.building_ref(t)).contains("\"aid\":{\"n\":2,\"bonus\":450,\"next\":166,\"max\":12}"));
    // ailleurs, ils n'aident plus
    let mut a = vec![0, (hx - 10) * TILE, hy * TILE, ids.len() as i32];
    for (k, &i) in ids.iter().enumerate() {
        a.extend([i as i32, (hx - 10) * TILE, (hy + 2 * k as i32) * TILE]);
    }
    order(&mut w, O_MOVE, &a);
    steps(&mut w, 100);
    assert_eq!(aide::count(&w, t), 0);
    assert_eq!(salts(&mut w, 400), 20);
}

/// Les semeurs aident au contact (pas de loin) ; douze tiennent autour d'un organe de 2 × 2 cases.
#[test]
fn twelve_sowers_gather_close_around_an_organ() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 20);
    let t = taproot(&mut w, hx + 3, hy);
    let ids: Vec<u32> = (0..12).map(|k| w.spawn_unit(U_SOWER, 0, (hx + 10 + k % 4) * TILE, (hy + 8 + k / 4) * TILE)).collect();
    assist(&mut w, &ids, t);
    steps(&mut w, 600);
    assert_eq!(aide::count(&w, t), 12, "tous à leur poste");
    let (cx, cy) = w.buildings[t].center();
    let far = ids.iter().map(|&i| w.unit(i).unwrap()).map(|s| (((w.units.x[s] - cx).pow(2) + (w.units.y[s] - cy).pow(2)) as f64).sqrt() / TILE as f64).fold(0.0, f64::max);
    assert!(far <= 3.0, "au contact : le plus loin à {far:.1} cases du centre");
}

/// Un semeur n'aide que ce qui produit : sur un bulbe, il le soigne puis s'en va ; un semeur adverse n'aide pas.
#[test]
fn sowers_only_help_their_own_producers() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 20);
    let bulb = put(&mut w, B_BULB, hx + 3, hy);
    let ids = sowers(&mut w, 1, hx + 3, hy);
    assist(&mut w, &ids, bulb);
    steps(&mut w, 200);
    let s = w.unit(ids[0]).unwrap();
    assert!(w.units.cold[s].orders.is_empty(), "rien à faire sur un bulbe intact");
    assert_eq!(aide::count(&w, bulb), 0);
    let t = taproot(&mut w, hx, hy - 2);
    let foe = w.spawn_unit(U_SOWER, 1, (hx - 3) * TILE, (hy + 3) * TILE);
    let f = w.unit(foe).unwrap();
    let r = w.building_ref(t);
    w.units.cold[f].orders.push(Order::Assist { target: r });
    steps(&mut w, 100);
    assert_eq!(aide::count(&w, t), 0, "pas pour l'adversaire");
}

/// Une frondaison aidée mange son herbe plus vite, et la sève avec.
#[test]
fn sowers_make_leaves_eat_faster() {
    let run = |helpers: usize| {
        let mut w = game();
        let (_, hx, hy) = base(&mut w, 30);
        let l = put(&mut w, B_LEAVES, hx + 4, hy);
        let ids = sowers(&mut w, helpers, hx + 4, hy);
        assist(&mut w, &ids, l);
        steps(&mut w, 200);
        assert_eq!(aide::count(&w, l), helpers as u32);
        let made = w.players[0].produced[SEVE as usize];
        let eaten = w.soil_n;
        steps(&mut w, 4000);
        ((w.players[0].produced[SEVE as usize] - made) as i32 - 200, (w.soil_n - eaten) as i32)
    };
    let (alone, n1) = run(0);
    let (helped, n4) = run(4);
    println!("seule : {alone} sève, {n1} cases ; quatre semeurs : {helped} sève, {n4} cases");
    assert!(helped * 100 > alone * 160 && helped * 100 < alone * 185, "+76 % environ : {alone} puis {helped}");
    assert!(n4 > n1 * 3 / 2, "elle mange plus vite : {n1} puis {n4}");
}

/// Une graine-mère aidée : sa sève, et ses œufs éclosent plus vite.
#[test]
fn sowers_make_a_seed_heart_hatch_faster() {
    let hatch = |helpers: usize| {
        let mut w = game();
        let (h, hx, hy) = base(&mut w, 20);
        let ids = sowers(&mut w, helpers, hx - 3, hy);
        assist(&mut w, &ids, h);
        steps(&mut w, 200);
        assert_eq!(aide::count(&w, h), helpers as u32);
        let net = w.buildings[h].net as usize;
        w.nets[net].seve = 5000;
        w.nets[net].sels = 5000;
        w.nets[net].eau = 5000;
        let before = w.players[0].produced[SEVE as usize];
        let r = w.building_ref(h) as i32;
        order(&mut w, crate::orders::O_FACTORY_QUEUE, &[r, U_GNAWER as i32, 1]);
        let mut t = 0;
        while (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_GNAWER).count() < 6 && t < 2000 {
            w.step(&[]);
            t += 1;
        }
        (t, (w.players[0].produced[SEVE as usize] - before) as i32 * 1000 / t as i32)
    };
    let (alone, sap) = hatch(0);
    let (helped, sap2) = hatch(2);
    println!("éclosion : seule {alone} ticks ({sap} ‰ sève/tick), deux semeurs {helped} ticks ({sap2})");
    assert!(helped * 145 < alone * 105 && helped * 145 > alone * 95, "+45 % de vitesse : {alone} puis {helped}");
    assert!(sap2 > sap * 13 / 10, "sa sève aussi");
}

/// Une matrice aidée cherche plus vite.
#[test]
fn sowers_speed_up_research_in_a_matrix() {
    let progress = |helpers: usize| {
        let mut w = game();
        let (_, hx, hy) = base(&mut w, 20);
        let m = put(&mut w, B_MATRIX, hx + 3, hy);
        w.players[0].purse[ADN as usize] = 500;
        let ids = sowers(&mut w, helpers, hx + 3, hy);
        assist(&mut w, &ids, m);
        steps(&mut w, 200);
        order(&mut w, crate::orders::O_RESEARCH, &[T_S_SPITTERS as i32]);
        let mut t = 0;
        while !w.players[0].has_tech(T_S_SPITTERS) && t < 20_000 {
            w.step(&[]);
            t += 1;
        }
        t
    };
    let (a, b) = (progress(0), progress(1));
    println!("recherche : seule {a} ticks, un semeur {b}");
    assert!(a < 20_000 && b * 125 > a * 95 && b * 125 < a * 105, "+25 % de vitesse : {a} puis {b}");
}

/// L'aide se relit à l'identique d'une sauvegarde.
#[test]
fn help_survives_save_and_restore() {
    let mut w = game();
    let (h, hx, hy) = base(&mut w, 20);
    let t = taproot(&mut w, hx + 3, hy);
    let ids = sowers(&mut w, 3, hx + 3, hy);
    assist(&mut w, &ids, t);
    let ids2 = sowers(&mut w, 2, hx - 3, hy);
    assist(&mut w, &ids2, h);
    steps(&mut w, 150);
    let mut r = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
    for _ in 0..400 {
        assert_eq!(r.step(&[]), w.step(&[]));
    }
    assert_eq!((aide::count(&r, t), aide::count(&r, h)), (3, 2));
}
