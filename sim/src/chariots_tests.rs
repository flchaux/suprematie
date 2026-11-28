//! Tests des chariots de convoi et des Arches (voir docs/spec/races.md) : navette vers tout ce qui consomme, Arche
//! soute, collecte, Arche de relève et élimination au dernier commandant, pas de drones chez les Transhumants.

use crate::buildings::{complete_building, place_building};
use crate::data::*;
use crate::fixed::TILE;
use crate::orders::*;
use crate::world::*;

/// Partie à deux (joueur 0 Transhumant, joueur 1 Industriel), terrain plat autour du départ du joueur 0, électricité
/// partout ; (x, y) : un coin libre au sud du départ.
fn base() -> (World, i32, i32) {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_TRANSH as i32, 0]);
    w.place_start_buildings();
    let (sx, sy) = w.map.starts[0];
    let (x0, y0, x1, y1) = (sx - 50, sy - 50, sx + 50, sy + 50);
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
    w.infinite_grid = true;
    w.power_dirty = true;
    (w, sx, sy + 20)
}

fn put(w: &mut World, kind: u16, x: i32, y: i32, recipe: u8) -> usize {
    let b = place_building(w, 0, kind, x, y, 0).expect("pose");
    complete_building(w, b);
    if recipe != RECIPE_NONE {
        w.buildings[b].recipe = recipe;
        w.buildings[b].repeat = true;
    }
    b
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

fn units(w: &World, p: u8, kind: u16) -> Vec<usize> {
    (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.owner[s] == p && w.units.kind[s] == kind).collect()
}

fn has(w: &World, b: usize, it: u8) -> u16 {
    crate::drones::has(&w.buildings[b].stash, it)
}

fn stock(w: &mut World, b: usize, it: u8, n: u16) {
    crate::drones::put(&mut w.buildings[b].stash, it, n);
}

fn rec(k: &str) -> u8 {
    RECIPES.iter().position(|r| r.key == k).unwrap() as u8
}

/// Attelle un chariot à la soute `h`, payé d'office.
fn cart(w: &mut World, h: usize) -> usize {
    stock(w, h, IRON_PLATE, 6);
    stock(w, h, GEAR, 2);
    let before = units(w, 0, U_T_CART);
    let r = w.building_ref(h) as i32;
    order(w, O_HITCH, &[r]);
    *units(w, 0, U_T_CART).iter().find(|s| !before.contains(s)).expect("chariot attelé")
}

fn haul(w: &mut World, c: usize, site: usize) {
    let (id, r) = (w.unit_id(c) as i32, w.building_ref(site) as i32);
    order(w, O_HAUL, &[0, r, 1, id]);
}

fn ark(w: &World) -> usize {
    units(w, 0, U_ARK)[0]
}

// ---------- navette : tout ce qui consomme ----------

/// Un générateur éloigné de la soute (hors de son réseau) reçoit son combustible par le chariot et ne tombe pas à sec.
#[test]
fn a_cart_keeps_a_far_generator_burning() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    let g = put(&mut w, B_T_GENERATOR, x + 30, y, RECIPE_NONE);
    // une fonderie au travail dans sa zone : le générateur brûle
    let f = put(&mut w, B_T_FURNACE, x + 30, y + 3, rec("iron_plate"));
    stock(&mut w, h, HYDROCARBON, 300);
    w.buildings[g].fuel = 2 * FUEL_HYDROCARBON;
    let c = cart(&mut w, h);
    haul(&mut w, c, g);
    let mut dry = 0;
    for t in 0..6000 {
        if t % 20 == 0 {
            w.buildings[f].inv[0] = 4;
        }
        w.step(&[]);
        if t > 600 && w.buildings[g].fuel <= 0 {
            dry += 1;
        }
    }
    assert!(has(&w, h, HYDROCARBON) < 290, "combustible porté : {} restent", has(&w, h, HYDROCARBON));
    assert_eq!(dry, 0, "jamais à sec");
    assert!(w.buildings[g].fuel > 0);
}

/// Un atelier éloigné (hors du réseau, au-delà de 30 cases) produit son unité grâce aux chariots.
#[test]
fn a_cart_feeds_a_far_workshop_until_its_unit_comes_out() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    let s = put(&mut w, B_T_WORKSHOP, x + 40, y, RECIPE_NONE);
    for &(it, n) in udef(U_CH_HOLD).cost {
        stock(&mut w, h, it, n);
    }
    let r = w.building_ref(s) as i32;
    order(&mut w, O_FACTORY_QUEUE, &[r, U_CH_HOLD as i32, 1]);
    let before = units(&w, 0, U_CH_HOLD).len();
    let c = cart(&mut w, h);
    haul(&mut w, c, s);
    steps(&mut w, 4000);
    assert_eq!(units(&w, 0, U_CH_HOLD).len(), before + 1, "chenillard soute produit");
    assert_eq!(crate::drones::has(&w.buildings[h].stash, IRON_PLATE), 0);
}

/// Ouverture d'une vraie partie, sans drones : soute et atelier déployés à leur place de départ (pas collés), un chariot
/// attelé à la soute et envoyé à l'atelier, et l'atelier produit son premier pisteur.
#[test]
fn the_start_workshop_produces_with_a_cart() {
    let (mut w, _, _) = base();
    let ids: Vec<i32> = [U_CH_HOLD, U_CH_WORKSHOP].iter().map(|&k| w.unit_id(units(&w, 0, k)[0]) as i32).collect();
    order(&mut w, O_DEPLOY, &[2, ids[0], ids[1]]);
    steps(&mut w, crate::transhumants::DEPLOY_TICKS as u32 + 5);
    let h = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_T_HOLD).expect("soute");
    let s = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_T_WORKSHOP).expect("atelier");
    let r = w.building_ref(s) as i32;
    order(&mut w, O_FACTORY_QUEUE, &[r, U_TRACKER as i32, 1]);
    let before = units(&w, 0, U_TRACKER).len();
    let c = cart(&mut w, h);
    haul(&mut w, c, s);
    steps(&mut w, 3000);
    assert_eq!(units(&w, 0, U_TRACKER).len(), before + 1, "premier pisteur (réseau : {})", crate::transfert::same_net(&w, h, s));
}

/// Les Transhumants n'ont aucun drone : ni l'atelier, ni le générateur, ni l'Arche n'en lancent.
#[test]
fn transhumants_have_no_drones() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    let s = put(&mut w, B_T_WORKSHOP, x + 12, y, RECIPE_NONE);
    let g = put(&mut w, B_T_GENERATOR, x + 6, y + 6, RECIPE_NONE);
    w.buildings[g].fuel = FUEL_HYDROCARBON;
    for it in [IRON_PLATE, GEAR, HYDROCARBON] {
        stock(&mut w, h, it, 100);
    }
    let r = w.building_ref(s) as i32;
    order(&mut w, O_FACTORY_QUEUE, &[r, U_CH_HOLD as i32, 1]);
    for _ in 0..1200 {
        w.step(&[]);
        assert!(!w.carriers.iter().any(|c| c.alive && c.owner == 0), "un drone des Transhumants");
    }
    assert_eq!(has(&w, h, IRON_PLATE), 100, "l'atelier, hors du réseau, ne prend rien à distance");
    assert_eq!(udef(U_ARK).drones, 0);
}

/// L'atelier embarqué de l'Arche ne se paie que dans sa propre soute, pas dans une soute voisine.
#[test]
fn the_ark_workshop_pays_from_the_ark_hold_only() {
    let (mut w, _, _) = base();
    let a = ark(&w);
    let (ax, ay) = (w.units.x[a] / TILE, w.units.y[a] / TILE);
    let h = put(&mut w, B_T_HOLD, ax + 6, ay + 6, RECIPE_NONE);
    for &(it, n) in udef(U_CH_WORKSHOP).cost {
        stock(&mut w, h, it, n);
    }
    for s in units(&w, 0, U_CH_WORKSHOP) {
        crate::transhumants::vanish(&mut w, s);
    }
    w.units.cold[a].hold = Vec::new();
    let id = w.unit_id(a) as i32;
    order(&mut w, O_ARK_QUEUE, &[id, U_CH_WORKSHOP as i32, 1]);
    let i = crate::ameliorations::ark_of(&w, a).unwrap();
    steps(&mut w, 200);
    assert!(!w.arks[i].paid, "pas payé dans la soute voisine");
    for &(it, n) in udef(U_CH_WORKSHOP).cost {
        crate::drones::put(&mut w.units.cold[a].hold, it, n);
    }
    steps(&mut w, 20);
    assert!(w.arks[i].paid, "payé dans la soute de l'Arche");
}

// ---------- l'Arche comme soute ----------

/// L'Arche part avec un chariot attelé ; elle en attelle jusqu'à six, payés dans sa soute ; sa fiche les compte.
#[test]
fn the_ark_starts_with_a_cart_and_hitches_six_at_most() {
    let (mut w, _, _) = base();
    let a = ark(&w);
    assert_eq!(crate::chariots::ark_carts(&w, a).len(), 1, "un chariot au départ");
    for &(it, n) in udef(U_T_CART).cost {
        crate::drones::put(&mut w.units.cold[a].hold, it, 10 * n);
    }
    let id = w.unit_id(a) as i32;
    for _ in 0..8 {
        order(&mut w, O_HITCH, &[id]);
    }
    assert_eq!(crate::chariots::ark_carts(&w, a).len(), crate::chariots::CARTS_PER_HOLD);
    let plates = crate::drones::has(&w.units.cold[a].hold, IRON_PLATE);
    assert_eq!(plates, 60 - 5 * 6, "cinq payés dans la soute de l'Arche");
    let info = crate::ameliorations::info(&w, crate::ameliorations::Host::U(a));
    assert!(info.contains("\"carts\":6,\"cartsMax\":6"), "{info}");
}

/// Arche à l'arrêt : son chariot fait la navette avec une fonderie éloignée et décharge les plaques dans sa soute ; elle
/// roule : il la suit sans repartir vers la fonderie, puis reprend quand elle s'arrête.
#[test]
fn ark_carts_shuttle_at_rest_and_follow_when_it_rolls() {
    let (mut w, _, _) = base();
    let a = ark(&w);
    let c = crate::chariots::ark_carts(&w, a)[0];
    let (ax, ay) = (w.units.x[a] / TILE, w.units.y[a] / TILE);
    let f = put(&mut w, B_T_FURNACE, ax + 20, ay, rec("iron_plate"));
    w.buildings[f].out = 60;
    w.units.cold[a].hold = Vec::new();
    haul(&mut w, c, f);
    steps(&mut w, 1500);
    let got = crate::drones::has(&w.units.cold[a].hold, IRON_PLATE);
    assert!(got >= 20, "plaques dans la soute de l'Arche : {got}");
    // il rentre à l'Arche (phase retour, collé à elle)
    let near = |w: &World| crate::fixed::dist(w.units.x[c], w.units.y[c], w.units.x[a], w.units.y[a]) < crate::ameliorations::radius(&w.units, a) + 2 * TILE;
    for _ in 0..2000 {
        w.step(&[]);
        if w.units.cold[c].timer & 1 == 1 && near(&w) {
            break;
        }
    }
    assert!(near(&w), "rentré à l'Arche");
    // l'Arche part vers l'ouest : il la suit, sans repartir vers la fonderie
    let id = w.unit_id(a) as i32;
    let (tx, ty) = ((ax - 20) * TILE, ay * TILE);
    order(&mut w, O_MOVE, &[0, tx, ty, 1, id, tx, ty]);
    for t in 0..300 {
        w.step(&[]);
        assert_eq!(w.units.cold[c].timer & 1, 1, "pas de nouvel aller pendant qu'elle roule (tick {t})");
        let d = crate::fixed::dist(w.units.x[c], w.units.y[c], w.units.x[a], w.units.y[a]);
        assert!(d < 12 * TILE, "il la suit à distance ({} cases)", d / TILE);
    }
    // arrêtée depuis 3 s : il reprend sa navette
    let mut resumed = false;
    for _ in 0..1500 {
        w.step(&[]);
        resumed |= w.units.cold[c].timer & 1 == 0;
    }
    assert!(resumed, "il reprend la navette une fois l'Arche arrêtée");
    assert!(matches!(w.units.cold[c].orders.first(), Some(Order::Haul { .. })));
}

/// Chariot qui rentre à une Arche pleine : ce qui n'entre pas dans sa soute reste à bord.
#[test]
fn what_does_not_fit_in_the_ark_stays_aboard() {
    let (mut w, _, _) = base();
    let a = ark(&w);
    let c = crate::chariots::ark_carts(&w, a)[0];
    let cap = crate::ameliorations::store_cap(&w, a);
    w.units.cold[a].hold = Vec::new();
    crate::drones::put(&mut w.units.cold[a].hold, IRON_PLATE, cap - 5);
    crate::drones::put(&mut w.units.cold[c].hold, IRON_PLATE, 12);
    let ark_id = w.unit_id(a) as i32;
    let cid = w.unit_id(c) as i32;
    order(&mut w, O_HAUL, &[0, ark_id, 1, cid]);
    steps(&mut w, 300);
    assert_eq!(crate::drones::has(&w.units.cold[a].hold, IRON_PLATE), cap);
    assert_eq!(crate::drones::has(&w.units.cold[c].hold, IRON_PLATE), 7, "le reste demeure à bord");
}

/// Clic droit d'un chariot de soute sur notre Arche : il s'y rattache.
#[test]
fn a_hold_cart_rehomes_to_the_ark() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    let c = cart(&mut w, h);
    let a = ark(&w);
    let (aid, cid) = (w.unit_id(a), w.unit_id(c) as i32);
    order(&mut w, O_HAUL, &[0, aid as i32, 1, cid]);
    assert_eq!(w.units.cold[c].parent, aid);
    assert_eq!(crate::chariots::ark_carts(&w, a).len(), 2);
    assert!(crate::chariots::carts_of(&w, h).is_empty());
}

/// La soute de l'Arche garde ce qui manque à l'unité de son atelier embarqué : son chariot ne l'emporte pas.
#[test]
fn ark_carts_leave_what_its_workshop_waits_for() {
    let (mut w, _, _) = base();
    let a = ark(&w);
    let c = crate::chariots::ark_carts(&w, a)[0];
    let (ax, ay) = (w.units.x[a] / TILE, w.units.y[a] / TILE);
    let asm = put(&mut w, B_T_ASSEMBLER, ax + 20, ay, rec("gear"));
    let i = crate::ameliorations::ark_of(&w, a).unwrap();
    w.arks[i].queue = vec![(U_CH_HOLD, 1)];
    w.players[0].unit_count = UNIT_CAP;
    w.units.cold[a].hold = Vec::new();
    crate::drones::put(&mut w.units.cold[a].hold, IRON_PLATE, 16);
    haul(&mut w, c, asm);
    for _ in 0..1500 {
        w.step(&[]);
        assert_eq!(crate::drones::has(&w.units.cold[c].hold, IRON_PLATE), 0, "les plaques gardées restent");
    }
    crate::drones::put(&mut w.units.cold[a].hold, IRON_PLATE, 10);
    steps(&mut w, 2000);
    assert!(w.players[0].produced[GEAR as usize] > 0, "le surplus part");
    assert!(crate::drones::has(&w.units.cold[a].hold, IRON_PLATE) >= 16);
}

// ---------- collecte ----------

/// Deux chariots en collecte font le tour des fonderies éloignées (jamais deux sur la même en même temps) et rapportent
/// leurs plaques à la soute.
#[test]
fn gathering_carts_share_the_rounds() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    let fs: Vec<usize> = (0..3).map(|k| put(&mut w, B_T_FURNACE, x + 12 + 6 * k, y + 10, rec("iron_plate"))).collect();
    for &f in &fs {
        w.buildings[f].out = 12;
    }
    let (c1, c2) = (cart(&mut w, h), cart(&mut w, h));
    let ids = [w.unit_id(c1) as i32, w.unit_id(c2) as i32];
    order(&mut w, O_GATHER, &[0, 2, ids[0], ids[1]]);
    for _ in 0..2400 {
        w.step(&[]);
        let (a, b) = (w.units.cold[c1].work, w.units.cold[c2].work);
        assert!(a == NONE || a != b, "deux chariots sur le même bâtiment");
    }
    assert_eq!(has(&w, h, IRON_PLATE), 36, "toutes les plaques rapportées");
    assert!(fs.iter().all(|&f| w.buildings[f].out == 0));
    assert!(matches!(w.units.cold[c1].orders.first(), Some(Order::Gather)), "la collecte continue");
}

/// La collecte va d'abord aux bâtiments hors du réseau de la soute, le plus plein d'abord.
#[test]
fn gathering_goes_first_to_the_fullest_building_outside_the_network() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    let near = put(&mut w, B_T_FURNACE, x + 14, y, rec("iron_plate"));
    let full = put(&mut w, B_T_FURNACE, x + 24, y, rec("copper_plate"));
    w.buildings[near].out = 3;
    w.buildings[full].out = 9;
    let c = cart(&mut w, h);
    let id = w.unit_id(c) as i32;
    order(&mut w, O_GATHER, &[0, 1, id]);
    // (sans cible, il cherche une fois par seconde)
    steps(&mut w, 21);
    assert_eq!(w.units.cold[c].work, w.building_ref(full), "le plus plein d'abord");
}

// ---------- Arche de relève, élimination ----------

/// Après la recherche, l'atelier déployé produit une Arche : nue, soute vide, avec son propre état ; trois au plus.
#[test]
fn a_workshop_builds_a_relief_ark_three_at_most() {
    let (mut w, x, y) = base();
    let h = put(&mut w, B_T_HOLD, x, y, RECIPE_NONE);
    let s = put(&mut w, B_T_WORKSHOP, x + 2, y, RECIPE_NONE);
    let r = w.building_ref(s) as i32;
    order(&mut w, O_FACTORY_QUEUE, &[r, U_ARK as i32, 1]);
    assert!(w.buildings[s].queue.is_empty(), "pas sans la recherche");
    w.players[0].set_tech(T_T_RELIEF);
    order(&mut w, O_FACTORY_QUEUE, &[r, U_ARK as i32, 5]);
    assert_eq!(w.buildings[s].queue, vec![(U_ARK, 2)], "trois Arches au plus, la première comprise");
    // (l'atelier collé à la soute est servi un objet de chaque sorte par seconde : sa réserve est garnie d'office)
    let _ = h;
    for &(it, n) in udef(U_ARK).cost {
        crate::buildings::factory_put(&mut w.buildings[s], it, 2 * n);
    }
    steps(&mut w, factory_ticks(U_ARK) + 600);
    let arks = units(&w, 0, U_ARK);
    assert!(arks.len() >= 2, "une Arche de relève");
    let new = arks[1];
    assert_eq!(w.units.cold[new].mods, 0, "sans améliorations");
    assert_eq!(crate::drones::total(&w.units.cold[new].hold), 0, "soute vide");
    assert!(crate::ameliorations::ark_of(&w, new).is_some(), "son propre état");
    assert!(w.arks[crate::ameliorations::ark_of(&w, new).unwrap()].turrets.is_empty());
    // l'atelier embarqué d'une Arche ne fait pas d'Arche
    let id = w.unit_id(new) as i32;
    order(&mut w, O_ARK_QUEUE, &[id, U_ARK as i32, 1]);
    assert!(w.arks[crate::ameliorations::ark_of(&w, new).unwrap()].queue.is_empty());
    for &(it, n) in udef(U_ARK).cost {
        crate::buildings::factory_put(&mut w.buildings[s], it, n);
    }
    steps(&mut w, factory_ticks(U_ARK) + 600);
    assert_eq!(units(&w, 0, U_ARK).len(), 3);
    order(&mut w, O_FACTORY_QUEUE, &[r, U_ARK as i32, 1]);
    assert!(w.buildings[s].queue.is_empty(), "plus au-delà de trois");
}

fn second_ark(w: &mut World) -> usize {
    let a = ark(w);
    let id = w.spawn_unit(U_ARK, 0, w.units.x[a] + 20 * TILE, w.units.y[a]);
    w.unit(id).unwrap()
}

fn kill(w: &mut World, s: usize) {
    w.units.hp[s] = 0;
    w.dead_units.push(s as u32);
    w.step(&[]);
    w.step(&[]);
}

/// Deux Arches : la première meurt, le joueur vit et la seconde devient son commandant ; la dernière meurt, il tombe.
#[test]
fn a_player_falls_only_with_his_last_ark() {
    let (mut w, _, _) = base();
    let a = ark(&w);
    let b = second_ark(&mut w);
    kill(&mut w, a);
    assert!(w.players[0].alive, "il reste une Arche");
    assert_eq!(w.players[0].commander, w.unit_id(b), "la seconde commande");
    assert_eq!(w.arks.len(), 1, "l'état de la première est parti");
    kill(&mut w, b);
    assert!(!w.players[0].alive, "plus de commandant : éliminé");
}

/// Abandon : toutes les Arches tombent, le joueur est éliminé.
#[test]
fn surrender_takes_every_ark() {
    let (mut w, _, _) = base();
    second_ark(&mut w);
    order(&mut w, O_SURRENDER, &[]);
    w.step(&[]);
    assert!(!w.players[0].alive);
    assert!(units(&w, 0, U_ARK).is_empty());
}

/// Sauvegarde et rechargement : deux Arches, leurs chariots en navette et en collecte, à l'identique.
#[test]
fn arks_and_carts_survive_save_and_load() {
    let (mut w, x, y) = base();
    let b = second_ark(&mut w);
    let a = ark(&w);
    let f = put(&mut w, B_T_FURNACE, x + 20, y, rec("iron_plate"));
    w.buildings[f].out = 40;
    let c = crate::chariots::ark_carts(&w, a)[0];
    haul(&mut w, c, f);
    crate::drones::put(&mut w.units.cold[b].hold, IRON_PLATE, 12);
    crate::drones::put(&mut w.units.cold[b].hold, GEAR, 4);
    let bid = w.unit_id(b) as i32;
    order(&mut w, O_HITCH, &[bid]);
    let c2 = crate::chariots::ark_carts(&w, b)[0];
    let id2 = w.unit_id(c2) as i32;
    order(&mut w, O_GATHER, &[0, 1, id2]);
    steps(&mut w, 200);
    let mut w2 = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
    for _ in 0..800 {
        assert_eq!(w.step(&[]), w2.step(&[]));
    }
    assert!(matches!(w2.units.cold[c2].orders.first(), Some(Order::Gather)));
    assert_eq!(w2.units.cold[c2].parent, w2.unit_id(b));
}

/// Déterminisme : deux parties identiques (chariots de l'Arche en navette, collecte) donnent les mêmes empreintes.
#[test]
fn ark_carts_are_deterministic() {
    let run = || {
        let (mut w, x, y) = base();
        let a = ark(&w);
        let f = put(&mut w, B_T_FURNACE, x + 20, y, rec("iron_plate"));
        w.buildings[f].out = 40;
        let c = crate::chariots::ark_carts(&w, a)[0];
        let id = w.unit_id(c) as i32;
        order(&mut w, O_GATHER, &[0, 1, id]);
        (0..1500).map(|_| w.step(&[])).collect::<Vec<u32>>()
    };
    assert_eq!(run(), run());
}
