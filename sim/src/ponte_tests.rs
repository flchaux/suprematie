//! Tests de la ponte de la Souche (voir ponte.rs) : portées, œufs, éclosion.

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::orders::{O_FACTORY_QUEUE, O_MOVE, O_UPGRADE};
use crate::ponte::{self, EV_HATCH};
use crate::world::*;

/// Partie à deux joueurs sans faune : Souche (joueur 0) contre Industriels.
fn game() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    w.place_start_buildings();
    w
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

fn heart(w: &World) -> usize {
    (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].owner == 0 && w.buildings[b].kind == B_SEED_HEART).unwrap()
}

/// Unités vivantes du joueur 0 d'un type donné.
fn units_of(w: &World, kind: u16) -> Vec<usize> {
    (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0 && w.units.kind[s] == kind).collect()
}

fn eggs(w: &World) -> Vec<usize> {
    (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == 0 && ponte::is_egg(w.units.kind[s])).collect()
}

/// Couveuse terminée du joueur 0, près de sa graine-mère, sur un terrain aplani.
fn brood(w: &mut World) -> usize {
    let h = heart(w);
    let (hx, hy) = (w.buildings[h].x, w.buildings[h].y);
    for y in hy - 14..hy + 16 {
        for x in hx - 14..hx + 16 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    let b = [(4, 0), (-4, 0), (0, 4), (0, -4)].iter().find_map(|&(dx, dy)| place_building(w, 0, B_BROOD, hx + dx, hy + dy, 0)).expect("couveuse");
    complete_building(w, b);
    steps(w, 6);
    b
}

fn queue(w: &mut World, b: usize, kind: u16, n: i32) {
    let r = w.building_ref(b) as i32;
    order(w, 0, O_FACTORY_QUEUE, &[r, kind as i32, n]);
}

/// Avance jusqu'à la ponte (au plus `max` ticks) ; renvoie le nombre de ticks passés.
fn until_laid(w: &mut World, max: u32) -> u32 {
    for t in 0..max {
        if !eggs(w).is_empty() {
            return t;
        }
        w.step(&[]);
    }
    panic!("pas de ponte en {max} ticks");
}

#[test]
fn litter_sizes_are_three_to_six() {
    for (k, u) in UNITS.iter().enumerate() {
        if u.race == RACE_SOUCHE && u.factory == FactoryKind::Land && !u.commander && !ponte::is_egg(k as u16) {
            assert!((3..=6).contains(&u.litter), "{} : portée de {}", u.key, u.litter);
            assert!(ponte::is_egg(ponte::egg_of(k as u16)));
        } else {
            assert_eq!(u.litter, 0, "{} ne naît pas par portée", u.key);
        }
    }
    assert_eq!(batch(U_GNAWER), 6);
    assert_eq!(batch(U_LIGHT_TANK), 1);
    // ponte presque immédiate ; l'incubation suit l'organisme : 10 s, plus 2 s par seconde de fabrication
    assert_eq!(factory_ticks(U_GNAWER), LAY_TICKS);
    assert_eq!(ponte::incubation(U_GNAWER), 18 * 20);
    assert_eq!(ponte::incubation(U_SHELL), 38 * 20);
    assert_eq!(factory_ticks(U_LIGHT_TANK), udef(U_LIGHT_TANK).build as u32 * 20);
    assert_eq!(ponte::egg_of(U_GNAWER), U_EGG_S);
    assert_eq!(ponte::egg_of(U_SPITTER), U_EGG_M);
    assert_eq!(ponte::egg_of(U_SHELL), U_EGG_L);
}

/// La portée est pondue presque aussitôt, sans rien coûter ; ses œufs puisent ensuite leur prix dans le réseau,
/// petit à petit, et éclosent ensemble.
#[test]
fn a_brood_lays_a_whole_litter_that_pays_for_itself_and_hatches() {
    let mut w = game();
    let b = brood(&mut w);
    let h = heart(&w);
    let net = w.buildings[h].net as usize;
    let count = w.players[0].unit_count;
    queue(&mut w, b, U_GNAWER, 1);
    let t = until_laid(&mut w, 400);
    assert!(t <= LAY_TICKS + 25, "ponte : {t} ticks");
    let laid = eggs(&w);
    assert_eq!(laid.len(), 6, "six œufs");
    assert!(units_of(&w, U_GNAWER).is_empty(), "rien n'est né avant l'éclosion");
    assert!(laid.iter().all(|&s| w.units.kind[s] == U_EGG_S && ponte::content(&w, s) == Some(U_GNAWER)));
    assert_eq!(w.players[0].unit_count, count + 6, "les œufs comptent dans la limite d'unités");
    assert!(w.players[0].consumed[SEVE as usize] <= 6, "la couveuse n'a rien payé");
    // devant la couveuse, sans se chevaucher, hors de son emprise
    let (cx, cy) = w.buildings[b].center();
    let r = udef(U_EGG_S).radius;
    for (i, &a) in laid.iter().enumerate() {
        let (x, y) = (w.units.x[a], w.units.y[a]);
        assert!(dist2(x, y, cx, cy) < ((6 * TILE) as i64).pow(2), "œuf près de la couveuse");
        assert!(w.map.passable(x / TILE, y / TILE, crate::map::P_LAND), "œuf sur une case libre");
        assert!((x - cx).abs() > 3 * TILE / 2 + r || (y - cy).abs() > 3 * TILE / 2 + r, "œuf hors de la couveuse");
        for &o in &laid[i + 1..] {
            assert!(dist2(x, y, w.units.x[o], w.units.y[o]) >= ((2 * r) as i64).pow(2), "œufs qui se chevauchent");
        }
    }
    // à mi-chemin, la moitié du prix est puisée
    let pos: Vec<(i32, i32)> = laid.iter().map(|&s| (w.units.x[s], w.units.y[s])).collect();
    let inc = ponte::incubation(U_GNAWER);
    steps(&mut w, inc / 2);
    let half = w.players[0].consumed[SEVE as usize];
    assert!((70..=84).contains(&half), "sève puisée à mi-chemin : {half}");
    assert!((inc / 2 - 3..=inc / 2 + 3).contains(&ponte::hatch_left(&w, laid[0])));
    steps(&mut w, inc / 2 - 3);
    assert_eq!(eggs(&w).len(), 6);
    assert_eq!(laid.iter().map(|&s| (w.units.x[s], w.units.y[s])).collect::<Vec<_>>(), pos);
    // éclosion : les six ensemble, là où étaient les œufs, avec l'ordre de ralliement ; tout le prix a été puisé
    let mut hatched = 0;
    for _ in 0..6 {
        w.step(&[]);
        hatched += w.events.chunks(5).filter(|e| e[0] == EV_HATCH && e[3] == (U_EGG_S as i32 | (U_GNAWER as i32) << 8) && e[4] & 0xff == 0).count();
    }
    assert_eq!(hatched, 6, "six éclosions");
    assert!(eggs(&w).is_empty());
    assert_eq!(w.players[0].consumed[SEVE as usize], 6 * 25);
    assert_eq!(w.players[0].consumed[SELS as usize], 6 * 4);
    assert!(w.nets[net].sels == crate::souche::START_SELS - 24, "puisé dans le réseau");
    let born = units_of(&w, U_GNAWER);
    assert_eq!(born.len(), 6);
    assert_eq!(w.players[0].unit_count, count + 6);
    for &s in &born {
        assert!(pos.iter().any(|&(x, y)| dist2(x, y, w.units.x[s], w.units.y[s]) < (3 * TILE as i64).pow(2)), "né là où était son œuf");
        assert!(w.units.hp[s] >= udef(U_GNAWER).hp, "né en pleine santé");
    }
    // la file est vide : rien d'autre ne vient
    steps(&mut w, 600);
    assert_eq!(units_of(&w, U_GNAWER).len(), 6);
    assert!(eggs(&w).is_empty());
}

/// Sans sève, les œufs attendent ; ils reprennent où ils en étaient.
#[test]
fn eggs_wait_when_the_network_is_dry() {
    let mut w = game();
    let b = brood(&mut w);
    let net = w.buildings[b].net as usize;
    queue(&mut w, b, U_GNAWER, 1);
    until_laid(&mut w, 400);
    steps(&mut w, 100);
    w.nets[net].sels = 0;
    w.nets[net].seve = 0;
    steps(&mut w, 60);
    let s = eggs(&w)[0];
    let left = ponte::hatch_left(&w, s);
    steps(&mut w, 400);
    assert_eq!(eggs(&w).len(), 6, "aucun n'éclot sans sels");
    let now = ponte::hatch_left(&w, s);
    assert!(left - now < 60, "ils n'avancent plus : {left} puis {now}");
    assert!(crate::render::info_unit(&w, w.unit_id(s)).contains("\"wait\":true"));
    w.nets[net].seve = 300;
    w.nets[net].sels = 100;
    steps(&mut w, ponte::incubation(U_GNAWER));
    assert!(eggs(&w).is_empty());
    assert_eq!(units_of(&w, U_GNAWER).len(), 6);
    // isolée de tout réseau, une couveuse ne pond pas
    w.buildings[b].net = 0;
    let r = w.building_ref(b) as i32;
    let o = [4, O_FACTORY_QUEUE, 0, r, U_GNAWER as i32, 1];
    crate::orders::apply_orders(&mut w, &[5, o[1], o[2], o[3], o[4], o[5]]);
    assert_eq!(w.buildings[b].queue.len(), 1);
}

/// Une couveuse n'a pas plus de trois portées en train de couver.
#[test]
fn a_brood_tends_three_litters_at_most() {
    let mut w = game();
    let b = brood(&mut w);
    let net = w.buildings[b].net as usize;
    queue(&mut w, b, U_GNAWER, 8);
    steps(&mut w, 300);
    assert_eq!(eggs(&w).len(), 3 * 6);
    for _ in 0..40 {
        w.nets[net].seve = 900;
        w.nets[net].sels = 900;
        steps(&mut w, 40);
        assert!(eggs(&w).len() <= 18);
    }
    assert_eq!(units_of(&w, U_GNAWER).len() + eggs(&w).len(), 48, "huit portées en tout");
}

#[test]
fn eggs_die_before_hatching_and_enemies_shoot_them() {
    let mut w = game();
    let b = brood(&mut w);
    queue(&mut w, b, U_GNAWER, 1);
    until_laid(&mut w, 400);
    let laid = eggs(&w);
    // deux œufs écrasés : quatre rongeurs seulement
    for &s in &laid[..2] {
        crate::combat::damage_unit(&mut w, s, 10_000, 1);
    }
    w.step(&[]);
    assert_eq!(eggs(&w).len(), 4);
    // un char ennemi posé à côté tire de lui-même sur les œufs (la Reine est écartée)
    let q = w.unit(w.players[0].commander).unwrap();
    w.units.x[q] += if w.units.x[q] > 256 * TILE { -40 * TILE } else { 40 * TILE };
    let target = eggs(&w)[0];
    let (ex, ey) = (w.units.x[target], w.units.y[target]);
    let tank = w.spawn_unit(U_LIGHT_TANK, 1, ex + 3 * TILE, ey);
    steps(&mut w, 100);
    assert!(eggs(&w).len() < 4, "le char a détruit des œufs");
    let ts = w.unit(tank).expect("char encore là");
    crate::combat::damage_unit(&mut w, ts, 100_000, 0);
    let left = eggs(&w).len();
    steps(&mut w, ponte::incubation(U_GNAWER));
    assert_eq!(units_of(&w, U_GNAWER).len(), left, "seuls les œufs épargnés éclosent");
}

#[test]
fn a_wounded_egg_gives_a_wounded_organism() {
    let mut w = game();
    let b = brood(&mut w);
    queue(&mut w, b, U_SOWER, 1);
    until_laid(&mut w, 400);
    let laid = eggs(&w);
    assert_eq!(laid.len(), 3);
    // loin du terreau, pour que rien ne guérisse (ils puisent alors par leur couveuse)
    for (i, &s) in laid.iter().enumerate() {
        w.units.x[s] += if w.units.x[s] > 256 * TILE { -60 * TILE } else { 60 * TILE };
        w.units.hp[s] = [100, 50, 1][i];
    }
    let before = units_of(&w, U_SOWER).len();
    steps(&mut w, ponte::incubation(U_SOWER) + 5);
    let mut hp: Vec<i32> = units_of(&w, U_SOWER).iter().map(|&s| w.units.hp[s]).collect();
    hp.sort_unstable();
    assert_eq!(hp.len(), before + 3);
    let full = udef(U_SOWER).hp;
    // le semeur de départ est intact ; les trois nés : pleine santé, moitié, plancher d'un quart
    assert_eq!(hp, vec![full / 4, full / 2, full, full]);
}

#[test]
fn eggs_take_no_orders() {
    let mut w = game();
    let b = brood(&mut w);
    queue(&mut w, b, U_SOWER, 1);
    until_laid(&mut w, 400);
    let s = eggs(&w)[0];
    let id = w.unit_id(s) as i32;
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let rally = w.units.cold[s].orders.clone();
    assert_eq!(rally.len(), 1, "l'œuf garde l'ordre de ralliement de la couveuse");
    order(&mut w, 0, O_MOVE, &[0, x + 20 * TILE, y, 1, id, x + 20 * TILE, y]);
    steps(&mut w, 40);
    assert_eq!((w.units.x[s], w.units.y[s]), (x, y), "un œuf ne bouge pas");
    assert_eq!(w.units.cold[s].orders.len(), 1, "un œuf ne reçoit pas d'ordre");
    // à l'éclosion, l'organisme part au point de ralliement
    let (rx, ry) = w.buildings[b].rally;
    steps(&mut w, ponte::incubation(U_SOWER) + 200);
    assert!(eggs(&w).is_empty());
    assert!(units_of(&w, U_SOWER).iter().any(|&s| dist2(w.units.x[s], w.units.y[s], rx, ry) < ((3 * TILE) as i64).pow(2)), "les semeurs nés rejoignent le ralliement");
}

#[test]
fn a_litter_waits_for_room_under_the_unit_cap() {
    let mut w = game();
    let b = brood(&mut w);
    let real = w.players[0].unit_count;
    w.players[0].unit_count = UNIT_CAP - 3;
    queue(&mut w, b, U_GNAWER, 1);
    steps(&mut w, 400);
    assert!(eggs(&w).is_empty() && !w.buildings[b].working, "pas de place pour six : la couveuse attend");
    assert_eq!(w.players[0].consumed[SEVE as usize], 0, "rien n'est consommé en attendant");
    let net = w.buildings[b].net as usize;
    assert!(w.nets[net].seve >= crate::souche::START_SEVE);
    w.players[0].unit_count = real;
    until_laid(&mut w, 400);
    assert_eq!(eggs(&w).len(), 6);
}

/// Retirer une portée de la file ne coûte ni ne rend rien ; le stock qu'une couveuse d'une ancienne sauvegarde
/// avait pris pour payer retourne au réseau.
#[test]
fn a_litter_in_the_queue_costs_nothing() {
    let mut w = game();
    let b = brood(&mut w);
    queue(&mut w, b, U_SHELL, 1);
    // la carapace demande sa recherche : refusée sans elle
    assert!(w.buildings[b].queue.is_empty());
    w.players[0].set_tech(T_S_SHELLS);
    queue(&mut w, b, U_SHELL, 2);
    steps(&mut w, 8);
    assert!(w.buildings[b].working, "ponte en cours");
    let net = w.buildings[b].net as usize;
    let seve = w.nets[net].seve;
    queue(&mut w, b, U_SHELL, -2);
    assert!(w.buildings[b].queue.is_empty() && !w.buildings[b].working);
    assert_eq!(w.players[0].consumed[SEVE as usize], 0);
    assert!((w.nets[net].seve - seve).abs() <= 2, "rien à rendre");
    steps(&mut w, 200);
    assert!(eggs(&w).is_empty());
    crate::buildings::factory_put(&mut w.buildings[b], SEVE, 200);
    let seve = w.nets[net].seve;
    queue(&mut w, b, U_SHELL, 1);
    steps(&mut w, 2);
    assert!(w.nets[net].seve >= seve + 200, "l'avance d'une ancienne sauvegarde est rendue");
}

#[test]
fn fertility_and_a_rooted_queen_shorten_the_incubation() {
    let mut w = game();
    w.players[0].set_tech(T_S_FERTILITY);
    let b = brood(&mut w);
    queue(&mut w, b, U_GNAWER, 1);
    until_laid(&mut w, 400);
    let s = eggs(&w)[0];
    let full = ponte::incubation(U_GNAWER);
    assert!((full * 2 / 3 - 4..=full * 2 / 3 + 1).contains(&ponte::hatch_left(&w, s)), "{}", ponte::hatch_left(&w, s));
    steps(&mut w, full * 2 / 3 + 3);
    assert!(eggs(&w).is_empty(), "éclos un tiers plus tôt");
}

#[test]
fn successive_litters_do_not_pile_up() {
    let mut w = game();
    let b = brood(&mut w);
    let h = heart(&w);
    let net = w.buildings[h].net as usize;
    w.nets[net].seve = 900;
    w.nets[net].sels = 900;
    w.players[0].set_tech(T_S_FERTILITY);
    // trois portées de semeurs, pondues presque à la suite
    queue(&mut w, b, U_SOWER, 3);
    let mut most = 0;
    for _ in 0..400 {
        w.step(&[]);
        let e = eggs(&w);
        most = most.max(e.len());
        for (i, &a) in e.iter().enumerate() {
            for &o in &e[i + 1..] {
                let rr = (udef(w.units.kind[a]).radius + udef(w.units.kind[o]).radius) as i64;
                assert!(dist2(w.units.x[a], w.units.y[a], w.units.x[o], w.units.y[o]) >= rr * rr, "œufs de deux portées l'un sur l'autre");
            }
        }
    }
    assert!(most >= 6, "deux portées au moins ont attendu ensemble ({most})");
    steps(&mut w, 300);
    assert_eq!(units_of(&w, U_SOWER).len(), 1 + 9);
}

#[test]
fn a_flyer_hatches_from_an_egg_on_the_ground() {
    let mut w = game();
    let h = heart(&w);
    let (cx, cy) = w.buildings[h].center();
    let b = brood(&mut w);
    let parent = w.building_ref(b);
    let id = ponte::lay_egg(&mut w, 0, U_MEMBRANE, cx + 5 * TILE, cy + 5 * TILE, Some((cx, cy)), parent);
    let s = w.unit(id).unwrap();
    assert_eq!(w.units.kind[s], U_EGG_M);
    assert_eq!(udef(U_EGG_M).layer, Layer::Land);
    steps(&mut w, ponte::incubation(U_MEMBRANE) + 3);
    assert!(w.unit(id).is_none(), "l'œuf n'existe plus");
    assert_eq!(units_of(&w, U_MEMBRANE).len(), 1);
}

#[test]
fn the_demo_lays_and_hatches_in_a_loop() {
    let mut w = crate::stress::ponte_demo();
    let mut hatched = std::collections::BTreeSet::new();
    let (mut most, mut crushed) = (0, 0);
    for _ in 0..1500 {
        w.step(&[]);
        most = most.max(eggs(&w).len());
        for e in w.events.chunks(5) {
            if e[0] == EV_HATCH {
                hatched.insert((e[3] >> 8) as u16);
            }
            if e[0] == EV_UNIT_DIED && ponte::is_egg(e[3] as u16) {
                crushed += 1;
            }
        }
    }
    assert_eq!(hatched.into_iter().collect::<Vec<_>>(), vec![U_GNAWER, U_SPITTER, U_SHELL, U_MEMBRANE], "les quatre couveuses font éclore leur espèce");
    assert!(most >= 10, "plusieurs portées couvent en même temps ({most})");
    assert!(crushed > 0, "les chars adverses ont détruit des œufs");
}

/// Niveaux de la couveuse : 3, 6 puis 12 portées à la fois, payés par son réseau ; elle pond pendant sa croissance.
#[test]
fn a_brood_grows_to_six_then_twelve_litters() {
    let mut w = game();
    let b = brood(&mut w);
    let net = w.buildings[b].net as usize;
    let r = w.building_ref(b) as i32;
    let fill = |w: &mut World| {
        w.nets[net].store = 2000;
        w.nets[net].seve = 900;
        w.nets[net].sels = 900;
    };
    let count = |w: &World| ponte::litters(w, Some(w.building_ref(b))).len();
    assert_eq!(BROOD_LEVELS.iter().map(|l| l.litters).collect::<Vec<_>>(), vec![3, 6, 12]);
    // sans de quoi payer, rien ne se passe
    w.nets[net].seve = 10;
    order(&mut w, 0, O_UPGRADE, &[r]);
    assert_eq!(w.buildings[b].upgrade, 0);
    fill(&mut w);
    order(&mut w, 0, O_UPGRADE, &[r]);
    assert!(w.buildings[b].upgrade > 0);
    assert!((695..=705).contains(&w.nets[net].seve) && (815..=825).contains(&w.nets[net].sels), "payé par le réseau : {} {}", w.nets[net].seve, w.nets[net].sels);
    // annulée : le réseau est remboursé
    order(&mut w, 0, O_UPGRADE, &[r]);
    assert!(w.buildings[b].upgrade == 0 && w.nets[net].seve >= 895);
    order(&mut w, 0, O_UPGRADE, &[r]);
    // elle pond pendant sa croissance, trois portées au plus
    w.players[0].set_tech(udef(U_SHELL).tech);
    queue(&mut w, b, U_SHELL, 30);
    let mut most = 0;
    for _ in 0..60 {
        fill(&mut w);
        steps(&mut w, 4);
        most = most.max(count(&w));
    }
    assert_eq!(most, 3, "elle pond pendant sa croissance, dans la limite de son niveau");
    assert!(w.buildings[b].upgrade > 0 && w.buildings[b].level == 0);
    let peak = |w: &mut World, ticks: u32| {
        let mut most = 0;
        for _ in 0..ticks / 20 {
            fill(w);
            steps(w, 20);
            most = most.max(count(w));
        }
        most
    };
    peak(&mut w, BROOD_LEVELS[1].time as u32 * 20);
    assert_eq!((w.buildings[b].level, w.buildings[b].upgrade), (1, 0));
    assert_eq!(peak(&mut w, 700), 6);
    assert!(crate::render::info_building(&w, w.building_ref(b)).contains("\"brood\":{\"max\":6,\"litters\":[["));
    // relue en pleine croissance, la partie continue à l'identique
    order(&mut w, 0, O_UPGRADE, &[r]);
    steps(&mut w, 100);
    let mut again = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
    for _ in 0..200 {
        assert_eq!(again.step(&[]), w.step(&[]));
    }
    peak(&mut w, BROOD_LEVELS[2].time as u32 * 20);
    assert_eq!(w.buildings[b].level, 2);
    assert_eq!(peak(&mut w, 900), 12);
    // pas de niveau de plus
    let seve = w.nets[net].seve;
    order(&mut w, 0, O_UPGRADE, &[r]);
    assert!(w.buildings[b].upgrade == 0 && w.nets[net].seve >= seve - 10);
    // l'affichage en dit autant : niveau, portées qui couvent
    queue(&mut w, b, U_SHELL, 5);
    peak(&mut w, 100);
    let n = count(&w);
    assert!(n >= 2);
    let counts = ponte::litter_counts(&w);
    assert_eq!(counts, vec![(w.building_ref(b), n as u32)]);
    let f = crate::render::render(&w, 0, 0, w.map.w, w.map.h, 2, 0, false);
    let word = f.windows(6).find(|k| k[0] == r && k[1] & 0xff == B_BROOD as i32).map(|k| k[5]).expect("couveuse dans l'image");
    assert_eq!((word >> 24 & 3, word >> 26 & 15), (2, n as i32));
}

/// Une portée garde sa place jusqu'à son dernier œuf, quelle que soit l'espèce ; tous détruits, la place est rendue.
#[test]
fn a_litter_keeps_its_place_until_its_last_egg() {
    let mut w = game();
    let b = brood(&mut w);
    let net = w.buildings[b].net as usize;
    w.nets[net].store = 5000;
    let count = |w: &World| ponte::litters(w, Some(w.building_ref(b))).len();
    for kind in [U_SHELL, U_GNAWER, U_GNAWER, U_GNAWER] {
        w.players[0].set_tech(udef(kind).tech);
        queue(&mut w, b, kind, 1);
    }
    for _ in 0..8 {
        w.nets[net].seve = 900;
        w.nets[net].sels = 900;
        steps(&mut w, 20);
    }
    let l = ponte::litters(&w, Some(w.building_ref(b)));
    assert_eq!(l.len(), 3, "{l:?}");
    assert_eq!(l.iter().map(|x| (x.kind, x.eggs)).collect::<Vec<_>>(), vec![(U_SHELL, batch(U_SHELL)), (U_GNAWER, 6), (U_GNAWER, 6)]);
    assert!(l[0].laid < l[1].laid && l[1].laid < l[2].laid);
    // la première portée perd ses œufs un à un
    let of = |w: &World, laid: i32| eggs(w).into_iter().filter(|&s| w.units.cold[s].pack_fuel == laid).collect::<Vec<_>>();
    let first = of(&w, l[1].laid);
    for (k, &s) in first.iter().enumerate() {
        assert_eq!(count(&w), 3, "{k} œufs détruits");
        assert!(!ponte::has_room(&w, b), "{k} œufs détruits");
        crate::combat::damage_unit(&mut w, s, 10_000, 1);
        w.step(&[]);
    }
    assert!(of(&w, l[1].laid).is_empty());
    // la place rendue, la dernière portée de la file est pondue
    steps(&mut w, 2 * crate::souche::ORGAN_PERIOD + LAY_TICKS);
    assert!(count(&w) == 3 && w.buildings[b].queue.is_empty(), "{} portées", count(&w));
}

#[test]
fn eggs_survive_save_and_restore() {
    let mut w = game();
    let b = brood(&mut w);
    queue(&mut w, b, U_GNAWER, 1);
    until_laid(&mut w, 400);
    steps(&mut w, 100);
    let snap = crate::save::snapshot(&w);
    let mut r = crate::save::restore(&snap).expect("restauration");
    assert_eq!(r.hash(), w.hash());
    for _ in 0..ponte::incubation(U_GNAWER) + 100 {
        assert_eq!(r.step(&[]), w.step(&[]));
    }
    assert_eq!(units_of(&r, U_GNAWER).len(), 6);
}
