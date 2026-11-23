//! Tests : sorties d'un stock (dépôt, entrepôt d'équipe). Tour de rôle des bras qui s'y servent, et
//! cadence de pose d'un dépôt sur ses tapis de sortie.

use crate::belts::{Line, ITEM_GAP};
use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::drones::has;
use crate::fixed::TILE;
use crate::world::*;
use std::collections::VecDeque;

fn world() -> World {
    let mut w = World::new(&[4242, 512, 0, 1, 0, 0, 100, 100]);
    w.players[0].researched = u64::MAX;
    // pas de zones électriques à poser (voir infinite_grid)
    w.infinite_grid = true;
    w.map.spots.retain(|s| !(s.x >= 88 && s.x <= 130 && s.y >= 88 && s.y <= 120));
    for y in 90..120 {
        for x in 90..130 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w
}

fn put(w: &mut World, kind: u16, x: i32, y: i32, dir: u8) -> usize {
    let b = place_building(w, 0, kind, x, y, dir).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

fn run(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

fn on_belts(w: &World, it: u8) -> usize {
    w.belts.lines.iter().filter(|l| l.alive).map(|l| l.items.iter().filter(|i| i.0 == it).count()).sum()
}

/// Un stock en (100, 100) avec deux bras : le premier (le plus petit identifiant, donc le premier servi
/// à égalité) dépose dans un laboratoire, qui ne veut que des lots de recherche ; le second dans un
/// dépôt, qui prend tout. Renvoie (stock, laboratoire, dépôt d'arrivée).
fn two_arms(source: u16) -> (World, usize, usize, usize) {
    let mut w = world();
    let s = put(&mut w, source, 100, 100, 0);
    // bras vers l'est : il prend derrière lui en (101, 100), dans le stock, et dépose en (103, 100)
    put(&mut w, B_INSERTER, 102, 100, 0);
    let lab = put(&mut w, B_LAB, 103, 100, 0);
    // bras vers le sud : il prend en (100, 101), dans le stock, et dépose en (100, 103)
    put(&mut w, B_INSERTER, 100, 102, 1);
    let to = put(&mut w, B_DEPOT, 100, 103, 0);
    (w, s, lab, to)
}

/// Le bras dont la cible ne veut rien du stock ne garde pas le tour : l'autre bras se sert.
#[test]
fn depot_arm_with_nothing_to_take_lets_the_others_pass() {
    let (mut w, d, lab, to) = two_arms(B_DEPOT);
    crate::drones::put(&mut w.buildings[d].stash, IRON_PLATE, 50);
    run(&mut w, 300);
    let got = has(&w.buildings[to].stash, IRON_PLATE);
    assert!(got >= 15, "le second bras vide le dépôt malgré le premier, qui n'a rien à prendre : {}", got);
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE) + got + w.buildings.iter().filter(|b| b.alive && b.hand == IRON_PLATE).count() as u16, 50);
    // des lots arrivent : le premier bras reprend son tour, le second continue
    crate::drones::put(&mut w.buildings[d].stash, PACK1, 2);
    run(&mut w, 100);
    // le premier bras, resté sans tour, passe devant ; le second peut prendre l'autre lot (son dépôt prend tout)
    assert!(w.buildings[lab].inv[0] >= 1, "le laboratoire reçoit un lot");
    assert_eq!(w.buildings[lab].inv[0] + has(&w.buildings[to].stash, PACK1), 2, "les deux lots sont partis");
    assert!(has(&w.buildings[to].stash, IRON_PLATE) > got, "le second bras continue");
    // sortie filtrée : seuls les objets filtrés comptent pour le tour de rôle
    w.buildings[d].filters = vec![PACK1, IRON_PLATE];
    crate::drones::put(&mut w.buildings[d].stash, IRON_PLATE, 20);
    let before = has(&w.buildings[to].stash, IRON_PLATE);
    run(&mut w, 200);
    assert!(has(&w.buildings[to].stash, IRON_PLATE) >= before + 10, "avec des filtres aussi");
}

/// Un objet qui manquait au dépôt y entre (comme au bout d'un tapis) : les bras qui dormaient faute
/// d'objet à prendre se réveillent tout de suite, sans attendre la fin de leur sommeil.
#[test]
fn arms_wake_when_a_missing_item_enters_the_depot() {
    let (mut w, d, lab, _) = two_arms(B_DEPOT);
    let arms: Vec<usize> = (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].kind == B_INSERTER).collect();
    assert_eq!(arms.len(), 2);
    // les deux bras dorment pour longtemps
    let mut guard = 0;
    while arms.iter().any(|&a| w.buildings[a].wake < w.tick + 30) {
        w.step(&[]);
        guard += 1;
        assert!(guard < 200, "les bras ne s'endorment pas");
    }
    crate::buildings::insert_item(&mut w, d, PACK1);
    run(&mut w, 12);
    assert_eq!(w.buildings[lab].inv[0], 1, "le lot est pris dès son arrivée");
    // un objet déjà en stock ne réveille personne : pas de réveil à chaque arrivée d'un flux continu
    crate::drones::put(&mut w.buildings[d].stash, COPPER_ORE, 5);
    w.buildings[d].watchers = vec![arms[0] as u32];
    crate::buildings::insert_item(&mut w, d, COPPER_ORE);
    assert_eq!(w.buildings[d].watchers, vec![arms[0] as u32]);
}

/// Même règle pour l'entrepôt d'équipe, dont un seul objet (choisi) sort par bras.
#[test]
fn warehouse_arm_with_nothing_to_take_lets_the_others_pass() {
    let (mut w, s, lab, to) = two_arms(B_WAREHOUSE);
    crate::drones::put(&mut w.buildings[s].stash, IRON_PLATE, 50);
    crate::drones::put(&mut w.buildings[s].stash, PACK1, 2);
    w.buildings[s].recipe = IRON_PLATE;
    run(&mut w, 300);
    assert!(has(&w.buildings[to].stash, IRON_PLATE) >= 15, "le second bras se sert : {}", has(&w.buildings[to].stash, IRON_PLATE));
    assert_eq!(w.buildings[lab].inv[0], 0, "les lots ne sont pas l'objet choisi : ils restent");
    w.buildings[s].recipe = PACK1;
    run(&mut w, 100);
    assert!(w.buildings[lab].inv[0] >= 1, "objet choisi : les lots, le premier bras en prend");
    assert_eq!(w.buildings[lab].inv[0] + has(&w.buildings[to].stash, PACK1), 2, "les deux lots sont partis");
}

/// Un dépôt, une file de `n` tapis qui part de sa face est, et un dépôt d'arrivée au bout (ou rien).
fn depot_and_belt(kind: u16, n: i32, end: bool) -> (World, usize, usize) {
    let mut w = world();
    let d = put(&mut w, B_DEPOT, 100, 100, 0);
    for x in 102..102 + n {
        put(&mut w, kind, x, 100, 0);
    }
    let to = if end { put(&mut w, B_DEPOT, 102 + n, 100, 0) } else { usize::MAX };
    (w, d, to)
}

/// Un dépôt remplit son tapis de sortie à la cadence du tapis : un objet toutes les 3 ticks sur un tapis
/// simple (il avance de 24 par tick, l'écart minimal est de 64), et non un par seconde.
#[test]
fn depot_fills_a_slow_belt_at_belt_rate() {
    let (mut w, d, to) = depot_and_belt(B_BELT1, 12, true);
    crate::drones::put(&mut w.buildings[d].stash, IRON_PLATE, 200);
    // la file se forme au premier tick : le dépôt a pu la trouver absente et attendre une seconde
    run(&mut w, 40);
    let start = has(&w.buildings[d].stash, IRON_PLATE);
    run(&mut w, 120);
    let out = start - has(&w.buildings[d].stash, IRON_PLATE);
    assert!((39..=41).contains(&out), "un objet toutes les 3 ticks, 40 en 120 ticks : {}", out);
    // rien ne se perd, et tout arrive
    run(&mut w, 800);
    assert_eq!(has(&w.buildings[to].stash, IRON_PLATE), 200);
    assert_eq!(on_belts(&w, IRON_PLATE), 0);
    // tapis rapide : 2 ticks ; express : 1 tick
    for (kind, n) in [(B_BELT2, 60), (B_BELT3, 120)] {
        let (mut w, d, _) = depot_and_belt(kind, 12, true);
        crate::drones::put(&mut w.buildings[d].stash, IRON_PLATE, 400);
        run(&mut w, 40);
        let start = has(&w.buildings[d].stash, IRON_PLATE);
        run(&mut w, 120);
        let out = start - has(&w.buildings[d].stash, IRON_PLATE);
        assert!((n - 1..=n + 1).contains(&out), "{} : {} objets en 120 ticks", bdef(kind).key, out);
    }
}

/// Tapis en cul-de-sac : le dépôt le remplit, puis attend (il ne revient qu'une fois par seconde) ;
/// quand la file se vide, il reprend.
#[test]
fn depot_waits_on_a_jammed_belt_then_resumes() {
    let (mut w, d, _) = depot_and_belt(B_BELT1, 3, false);
    crate::drones::put(&mut w.buildings[d].stash, IRON_PLATE, 200);
    run(&mut w, 400);
    // tassés depuis le bout : un objet tous les 64, du bout jusqu'au centre de la première case
    let n = on_belts(&w, IRON_PLATE);
    assert_eq!(n, 11);
    assert_eq!(has(&w.buildings[d].stash, IRON_PLATE) as usize, 200 - n);
    let first = w.map.occ[w.map.idx(102, 100)] as usize - 1;
    assert_eq!(crate::belts::room_wait(&w, first), None, "file bouchée : pas de délai connu");
    // le dépôt dort entre deux essais : sur 100 ticks, son réveil est toujours à plus de 3 ticks de son
    // dernier passage (une seconde, pas l'attente courte d'un tapis qui s'écoule)
    let mut far = 0;
    for _ in 0..100 {
        w.step(&[]);
        if w.buildings[d].wake > w.tick + 3 {
            far += 1;
        }
    }
    assert!(far >= 75, "le dépôt dort devant un tapis bouché : {} ticks sur 100", far);
    // la file se vide (objets retirés à la main) : le dépôt reprend dans la seconde
    for l in w.belts.lines.iter_mut() {
        l.items.clear();
        l.moving = 0;
    }
    run(&mut w, 30);
    assert!(on_belts(&w, IRON_PLATE) >= 3, "le dépôt a repris : {}", on_belts(&w, IRON_PLATE));
}

fn line(tiles: usize, speed: i32, gaps: &[i32]) -> Line {
    Line { alive: true, tiles: vec![0; tiles], items: gaps.iter().map(|&g| (IRON_PLATE, g)).collect::<VecDeque<_>>(), speed, moving: 0, out_pos: -1, out_floor: 0, powered: true }
}

/// Délai avant de pouvoir poser un objet : le temps que l'objet gênant s'écarte, ou rien de connu si la
/// file est tassée jusqu'à lui.
#[test]
fn room_wait_follows_the_blocking_item() {
    // centre de la dernière case d'une file de 4 cases
    let p = 3 * TILE + TILE / 2;
    assert_eq!(line(4, 24, &[]).room_wait(p), Some(0), "file vide");
    assert_eq!(line(4, 24, &[p - ITEM_GAP]).room_wait(p), Some(0), "objet à l'écart minimal");
    // un objet vient d'être posé en p : il doit avancer de 64
    assert_eq!(line(4, 24, &[p]).room_wait(p), Some(3));
    assert_eq!(line(4, 48, &[p]).room_wait(p), Some(2));
    assert_eq!(line(4, 72, &[p]).room_wait(p), Some(1));
    // il a déjà avancé de 24 : encore 40
    assert_eq!(line(4, 24, &[p - 24]).room_wait(p), Some(2));
    // un objet en amont, à 10 de p : il doit passer p puis s'en écarter (74)
    assert_eq!(line(4, 24, &[p + 10]).room_wait(p), Some(4));
    // file tassée depuis le bout jusqu'à p : aucun objet ne peut avancer
    let mut gaps = vec![0];
    gaps.extend(std::iter::repeat_n(ITEM_GAP, (p / ITEM_GAP) as usize));
    assert_eq!(gaps.iter().sum::<i32>(), p);
    assert_eq!(line(4, 24, &gaps).room_wait(p), None);
    // presque tassée : il reste 40 d'écart en tout devant l'objet gênant, il lui faut 64
    gaps[1] += 40;
    gaps.pop();
    assert_eq!(gaps.iter().sum::<i32>(), p - 24);
    assert_eq!(line(4, 24, &gaps).room_wait(p), Some(2), "40 d'écart, 40 à parcourir");
    gaps[1] -= 8;
    gaps[2] += 8;
    gaps.push(ITEM_GAP - 8);
    assert_eq!(gaps.iter().sum::<i32>(), p - 24 + 56);
    assert_eq!(line(4, 24, &gaps).room_wait(p), None, "40 d'écart, 56 à parcourir");
    // file arrêtée (sans courant) : aucun délai connu, sauf si elle porte du combustible
    let mut l = line(4, 24, &[p]);
    l.powered = false;
    assert_eq!(l.room_wait(p), None);
    l.items[0].0 = HYDROCARBON;
    assert_eq!(l.room_wait(p), Some(3));
    // hors de la file
    assert_eq!(line(4, 24, &[]).room_wait(4 * TILE), None);
}
