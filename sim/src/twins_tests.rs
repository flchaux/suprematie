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

// ---------- Générateurs : combustible partagé ----------

/// Unité de réservoir d'un générateur à hydrocarbure (un hydrocarbure).
const U: i32 = FUEL_HYDROCARBON;

/// Un générateur principal nourri par un tapis d'hydrocarbure, collé à un générateur sans fournisseur :
/// sous charge, le voisin reste alimenté par le combustible du principal et ne tombe jamais à sec. Un
/// réacteur à cristal collé (autre combustible) ne partage pas.
#[test]
fn generators_share_fuel_with_neighbours() {
    let mut w = world();
    w.infinite_grid = false;
    let m = put(&mut w, B_MAIN_GENERATOR, 100, 100, 0);
    let g = put(&mut w, B_GENERATOR, 103, 100, 0);
    let r = put(&mut w, B_CRYSTAL_REACTOR, 100, 97, 0);
    assert_eq!(twins_of(&w, m), vec![g]);
    assert!(twins_of(&w, r).is_empty(), "le réacteur ne brûle pas d'hydrocarbure");
    // tapis d'hydrocarbure qui entre dans le principal par sa face ouest
    for x in 92..100 {
        put(&mut w, B_BELT1, x, 100, 0);
    }
    let start = w.map.occ[w.map.idx(92, 100)] as usize - 1;
    assert!(own_feed(&w, m) && !own_feed(&w, g));
    w.buildings[m].fuel = 10 * U;
    // charge : dix radars (1 000 kW), plus que ce que le principal seul consommerait sans voisin
    for k in 0..10 {
        put(&mut w, B_RADAR, 100 + (k % 5) * 2, 104 + (k / 5) * 2, 0);
    }
    crate::buildings::rebuild_power(&mut w);
    let mut dry_after_start = 0;
    let mut burned_by_g = false;
    for t in 0..6000 {
        crate::belts::put_on_belt(&mut w, start, HYDROCARBON);
        w.step(&[]);
        if t > 400 && w.buildings[g].fuel <= 0 {
            dry_after_start += 1;
        }
        burned_by_g |= crate::buildings::gen_output(&w, g) > 0;
    }
    println!("principal {} voisin {} (unités)", w.buildings[m].fuel / U, w.buildings[g].fuel / U);
    assert!(burned_by_g, "le voisin doit produire");
    assert_eq!(dry_after_start, 0, "le voisin sans fournisseur ne doit jamais tomber à sec");
    assert!(w.buildings[g].fuel > U);
    assert_eq!(w.buildings[r].fuel, 0, "le réacteur ne reçoit rien");
}

/// Priorité au fournisseur propre : un générateur qui a son tapis ne prend rien chez son voisin tant
/// qu'il lui reste au moins 2 unités, puis juste de quoi remonter à 2. Un générateur sans fournisseur
/// s'équilibre avec son voisin. Le combustible est déplacé, jamais copié ni perdu.
#[test]
fn generator_with_own_belt_takes_fuel_last() {
    // réseau illimité, sans charge : seul le tapis consomme un peu (quelques kW), les réservoirs ne bougent
    // que par le partage, par unités entières (30 000) ; `burn` couvre largement la consommation du tapis
    let mut w = world();
    let burn = U / 4;
    let m = put(&mut w, B_MAIN_GENERATOR, 100, 100, 0);
    let g = put(&mut w, B_GENERATOR, 103, 100, 0);
    // aperçu de pose : un générateur sous le principal sera son jumeau (liseré vert), pas un réacteur
    use crate::twins::twin_preview;
    assert_ne!(twin_preview(&w, 0, B_GENERATOR, &[(100, 103, 0)]), vec![0]);
    assert_eq!(twin_preview(&w, 0, B_CRYSTAL_REACTOR, &[(100, 103, 0)]), vec![0]);
    let h = put(&mut w, B_GENERATOR, 100, 103, 0);
    // tapis (vide) qui entre dans G par sa face est
    for x in (105..111).rev() {
        put(&mut w, B_BELT1, x, 100, 2);
    }
    assert!(own_feed(&w, g) && !own_feed(&w, m) && !own_feed(&w, h));
    let fuel = |w: &World| [m, g, h].map(|b| w.buildings[b].fuel);
    w.buildings[m].fuel = 20 * U;
    w.buildings[g].fuel = 5 * U;
    w.buildings[h].fuel = 0;
    let total: i32 = fuel(&w).iter().sum();
    for _ in 0..400 {
        w.step(&[]);
    }
    let [fm, fg, fh] = fuel(&w);
    println!("principal {} G {} H {} (total {} sur {})", fm, fg, fh, fm + fg + fh, total);
    assert!(fg <= 5 * U && fg > 5 * U - burn, "G a son tapis et assez de combustible : il ne prend rien ({})", fg);
    assert!(fm - fh < 2 * U && fh - fm < 2 * U, "H, sans fournisseur, s'équilibre avec le principal : {} et {}", fm / U, fh / U);
    assert!(fm + fg + fh <= total && fm + fg + fh > total - burn, "rien ne se perd ni ne se duplique");
    // G presque vide (son tapis ne livre rien) : il se sert chez le principal, juste de quoi remonter à 2
    w.buildings[g].fuel = U / 2;
    let total: i32 = fuel(&w).iter().sum();
    for _ in 0..400 {
        w.step(&[]);
    }
    let [fm, fg, fh] = fuel(&w);
    assert!((2 * U..3 * U).contains(&fg), "G remonte à 2 unités : {}", fg as f64 / U as f64);
    assert!(fm + fg + fh <= total && fm + fg + fh > total - burn, "rien ne se perd ni ne se duplique");
}
