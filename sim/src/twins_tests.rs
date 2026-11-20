//! Tests : machines jumelles qui partagent ingrédients et produits, en dernier recours après les bras
//! et les tapis.

use crate::buildings::{accepts, complete_building, insert_item, own_feed, place_building, twins_of};
use crate::data::*;
use crate::world::*;

fn world() -> World {
    let mut w = World::new(&[4242, 512, 0, 1, 0, 0, 100, 100]);
    w.players[0].researched = u64::MAX;
    w.infinite_grid = true;
    for y in 80..130 {
        for x in 80..130 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            w.map.update_pass(x, y);
        }
    }
    w.map.spots.retain(|s| !(s.x >= 78 && s.x <= 130 && s.y >= 78 && s.y <= 130));
    w
}

fn put(w: &mut World, kind: u16, x: i32, y: i32, dir: u8) -> usize {
    let b = place_building(w, 0, kind, x, y, dir).unwrap_or_else(|| panic!("pose impossible {} en {},{}", bdef(kind).key, x, y));
    complete_building(w, b);
    b
}

/// Deux assembleurs d'engrenages collés : A en (100, 100), B en (102, 100) (2 × 2 chacun).
fn twin_assemblers(w: &mut World) -> (usize, usize) {
    let a = put(w, B_ASSEMBLER1, 100, 100, 0);
    let b = put(w, B_ASSEMBLER1, 102, 100, 0);
    let gear = RECIPES.iter().position(|r| r.key == "gear").unwrap() as i32;
    for m in [a, b] {
        let id = w.building_ref(m) as i32;
        w.step(&[4, crate::orders::O_SET_RECIPE, 0, id, gear]);
    }
    assert_eq!(twins_of(w, a), vec![b]);
    (a, b)
}

/// Tapis de sortie vers le nord depuis la case (x, 99), en cul-de-sac : renvoie sa première case.
fn north_belt(w: &mut World, x: i32) -> usize {
    let first = put(w, B_BELT1, x, 99, 3);
    for y in 81..99 {
        put(w, B_BELT1, x, y, 3);
    }
    first
}

fn items_on(w: &World, belt: usize) -> u32 {
    let l = &w.belts.lines[w.buildings[belt].line as usize];
    assert!(l.items.iter().all(|&(it, _)| it == GEAR));
    l.items.len() as u32
}

/// Fabrications terminées pendant un tick : la machine travaillait et ne travaille plus.
struct Crafts {
    prev: Vec<bool>,
    made: Vec<u32>,
}

impl Crafts {
    fn new(n: usize) -> Self {
        Crafts { prev: vec![false; n], made: vec![0; n] }
    }
    fn watch(&mut self, w: &World, ms: &[usize]) {
        for (i, &m) in ms.iter().enumerate() {
            let now = w.buildings[m].working;
            if self.prev[i] && !now {
                self.made[i] += 1;
            }
            self.prev[i] = now;
        }
    }
}

/// Plaques données à la main (sans bras ni tapis) : compte ce qui est inséré.
fn stuff(w: &mut World, m: usize, given: &mut u32) {
    while accepts(w, m, IRON_PLATE) {
        insert_item(w, m, IRON_PLATE);
        *given += 1;
    }
}

/// Deux usines collées, chacune avec son tapis de sortie : chaque tapis reçoit exactement la production
/// de son usine (le partage des produits ne sert pas quand les tapis prennent tout).
#[test]
fn twins_with_own_belts_keep_their_output() {
    let mut w = world();
    let (a, b) = twin_assemblers(&mut w);
    let (ba, bb) = (north_belt(&mut w, 100), north_belt(&mut w, 103));
    let mut c = Crafts::new(2);
    let mut given = 0;
    for _ in 0..1500 {
        stuff(&mut w, a, &mut given);
        stuff(&mut w, b, &mut given);
        w.step(&[]);
        c.watch(&w, &[a, b]);
    }
    let (ma, mb) = (c.made[0], c.made[1]);
    println!("A {} B {} tapis A {} tapis B {}", ma, mb, items_on(&w, ba), items_on(&w, bb));
    assert!(ma >= 10 && mb >= 10, "trop peu de production : {} et {}", ma, mb);
    assert_eq!(items_on(&w, ba) + w.buildings[a].out as u32, ma, "le tapis de A reçoit la production de A");
    assert_eq!(items_on(&w, bb) + w.buildings[b].out as u32, mb, "le tapis de B reçoit la production de B");
}

/// Une usine sans sortie collée à une usine qui a son tapis : sa production passe par la voisine, sans
/// perte ni duplication, et ne revient pas.
#[test]
fn twin_without_outlet_hands_output_to_neighbour() {
    let mut w = world();
    let (a, b) = twin_assemblers(&mut w);
    let belt = north_belt(&mut w, 103);
    let mut c = Crafts::new(2);
    let mut given = 0;
    let mut max_b_out = 0;
    for _ in 0..1000 {
        stuff(&mut w, a, &mut given);
        stuff(&mut w, b, &mut given);
        w.step(&[]);
        c.watch(&w, &[a, b]);
        max_b_out = max_b_out.max(w.buildings[b].out);
    }
    let (ma, mb) = (c.made[0], c.made[1]);
    let on_belt = items_on(&w, belt);
    let (oa, ob) = (w.buildings[a].out as u32, w.buildings[b].out as u32);
    println!("A {} B {} tapis {} en attente {} {}", ma, mb, on_belt, oa, ob);
    assert!(ma >= 10, "l'usine sans sortie reste bloquée : {} fabrications", ma);
    assert!(ma + 2 >= mb, "l'usine sans sortie ralentit : {} contre {}", ma, mb);
    // rien ne se perd ni ne se duplique : engrenages, puis plaques
    assert_eq!(on_belt + oa + ob, ma + mb);
    let held: u32 = [a, b].iter().map(|&m| w.buildings[m].inv[0] as u32).sum();
    let busy: u32 = [a, b].iter().filter(|&&m| w.buildings[m].working).count() as u32;
    assert_eq!(given, 2 * (ma + mb + busy) + held);
    // la voisine ne garde jamais plus d'une fabrication de la donneuse en plus de la sienne
    assert!(max_b_out <= 2, "produits accumulés chez la voisine : {}", max_b_out);
}

/// Une usine qui a son tapis et une jumelle sans sortie : la jumelle ne lui renvoie rien (pas d'aller-
/// retour), et quand le tapis est plein, les produits restent sur place au lieu de partir chez elle.
#[test]
fn output_sharing_never_goes_back() {
    let mut w = world();
    let (a, b) = twin_assemblers(&mut w);
    // tapis court : il se remplit vite
    put(&mut w, B_BELT1, 103, 99, 3);
    put(&mut w, B_BELT1, 103, 98, 3);
    let mut given = 0;
    for _ in 0..2000 {
        stuff(&mut w, a, &mut given);
        stuff(&mut w, b, &mut given);
        w.step(&[]);
    }
    // tout est plein : les deux sont à l'arrêt, chacune avec ses produits, sans transfert ni perte
    let cap = 4;
    assert!(w.buildings[a].out <= cap && w.buildings[b].out <= cap);
    assert!(!w.buildings[a].working && !w.buildings[b].working);
}

/// Tapis vers le sud qui finit dans A (case (100, 100)) par sa face nord : renvoie sa première case.
fn feed_belt_into_a(w: &mut World) -> usize {
    for y in 92..=99 {
        put(w, B_BELT1, 100, y, 1);
    }
    w.map.occ[w.map.idx(100, 92)] as usize - 1
}

/// Un tick : les tapis d'entrée reçoivent une plaque s'il y a de la place (celui de B seulement si
/// `supply`) ; les produits sont retirés (sorties toujours libres).
fn feed_tick(w: &mut World, c: &mut Crafts, ms: [usize; 2], belts: [usize; 2], supply: bool, injected: &mut u32) {
    crate::belts::put_on_belt(w, belts[0], IRON_PLATE);
    if supply && crate::belts::put_on_belt(w, belts[1], IRON_PLATE) {
        *injected += 1;
    }
    for m in ms {
        w.buildings[m].out = 0;
    }
    w.step(&[]);
    c.watch(w, &ms);
}

/// En entrée, une machine se sert d'abord par ses bras : tant que ses bras la fournissent, elle ne prend
/// rien chez sa jumelle, même mieux pourvue. Sans fournisseur, elle se sert chez la voisine.
#[test]
fn twin_inputs_prefer_own_arm() {
    let mut w = world();
    let (a, b) = twin_assemblers(&mut w);
    // A : un tapis qui la remplit en permanence
    let fa = feed_belt_into_a(&mut w);
    // les deux déjà pleines au départ : aucune n'est à l'arrêt en attendant son premier objet
    stuff(&mut w, a, &mut 0);
    let mut injected = 0u32;
    stuff(&mut w, b, &mut injected);
    // B : deux bras qui prennent sur un tapis au sud (vers l'ouest, en cul-de-sac) ; à eux deux, ils
    // suivent sa consommation
    assert!(!own_feed(&w, b), "pas encore de fournisseur");
    let arms = [put(&mut w, B_INSERTER, 102, 102, 3), put(&mut w, B_INSERTER, 103, 102, 3)];
    assert!(own_feed(&w, b));
    for x in 102..=108 {
        put(&mut w, B_BELT1, x, 103, 2);
    }
    let fb = w.map.occ[w.map.idx(108, 103)] as usize - 1;
    let line = w.buildings[fb].line as usize;
    let mut c = Crafts::new(2);
    for _ in 0..1500 {
        feed_tick(&mut w, &mut c, [a, b], [fa, fb], true, &mut injected);
    }
    let delivered = injected - w.belts.lines[line].items.len() as u32 - arms.iter().filter(|&&m| w.buildings[m].hand != 0).count() as u32;
    let mb = c.made[1];
    let busy = w.buildings[b].working as u32;
    println!("A {} B {} fabrications, bras {} plaques, reste {} / {}", c.made[0], mb, delivered, w.buildings[a].inv[0], w.buildings[b].inv[0]);
    assert!(mb >= 30, "B ne produit pas assez : {}", mb);
    // B peut dépanner A (à l'arrêt faute de plaques) mais ne prend rien chez elle
    let used = 2 * (mb + busy) + w.buildings[b].inv[0] as u32;
    assert!(used <= delivered, "B ne doit consommer que les plaques de ses bras : {} pour {} livrées", used, delivered);

    // les bras n'ont plus rien à prendre : B se sert chez sa jumelle
    let before = c.made[1];
    for _ in 0..1500 {
        feed_tick(&mut w, &mut c, [a, b], [fa, fb], false, &mut injected);
    }
    assert!(c.made[1] > before + 5, "sans ses bras, B doit se servir chez A : {} puis {}", before, c.made[1]);
}

/// Même règle pour un tapis qui entre dans la machine : B ne consomme que ce que son tapis apporte.
#[test]
fn twin_inputs_prefer_own_belt() {
    let mut w = world();
    let (a, b) = twin_assemblers(&mut w);
    let fa = feed_belt_into_a(&mut w);
    // les deux déjà pleines au départ : aucune n'est à l'arrêt en attendant son premier objet
    stuff(&mut w, a, &mut 0);
    let mut injected = 0u32;
    stuff(&mut w, b, &mut injected);
    // B : tapis vers le nord qui finit dans B par sa face sud
    for y in 102..=108 {
        put(&mut w, B_BELT1, 102, y, 3);
    }
    let fb = w.map.occ[w.map.idx(102, 108)] as usize - 1;
    let line = w.buildings[fb].line as usize;
    // le tapis qui finit dans B compte comme son fournisseur propre
    assert!(own_feed(&w, b));
    let mut c = Crafts::new(2);
    for _ in 0..1500 {
        feed_tick(&mut w, &mut c, [a, b], [fa, fb], true, &mut injected);
    }
    let delivered = injected - w.belts.lines[line].items.len() as u32;
    let mb = c.made[1];
    let busy = w.buildings[b].working as u32;
    assert!(mb >= 30, "B ne produit pas assez : {}", mb);
    // B peut dépanner A (à l'arrêt faute de plaques) mais ne prend rien chez elle
    let used = 2 * (mb + busy) + w.buildings[b].inv[0] as u32;
    assert!(used <= delivered, "B ne doit consommer que les plaques de son tapis : {} pour {} livrées", used, delivered);
}

#[test]
fn tmp_demo_twins() {
    let mut w = crate::stress::logistics_demo();
    for _ in 0..2400 { w.step(&[]); }
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if bb.alive && bb.kind == B_ASSEMBLER1 {
            println!("asm {} ({},{}) recipe {} out {} inv {:?} flow {} twins {:?} working {}", b, bb.x, bb.y, bb.recipe, bb.out, &bb.inv[..1], crate::buildings::flow_per_min(bb, w.tick), twins_of(&w, b), bb.working);
        }
    }
}
