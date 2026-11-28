//! Soute et chariots de convoi des Transhumants (voir docs/spec/races.md).
//!
//! - Soute : elle alimente depuis son stock les fabricants de son réseau de transfert (`feed_crafters`), et garde pour les
//!   ateliers à portée ce qui manque à leur prochaine unité (`reserved`).
//! - Chariots : six au plus par soute, ils font la navette entre elle et un module (ramassage, livraison) ou une autre
//!   soute (livraison jusqu'à égalité des stocks).

use crate::buildings;
use crate::data::*;
use crate::drones::Store;
use crate::fixed::{dist, dist2, TILE};
use crate::transhumants::vanish;
use crate::world::*;

/// Chariots de convoi qu'une soute (ou une Arche) peut avoir attelés en même temps.
pub const CARTS_PER_HOLD: usize = 6;
/// Arche : ses chariots font leurs navettes après ARK_HAUL_REST ticks à l'arrêt (3 s, comme le groupe électrogène) ;
/// quand elle roule, ils la suivent à ARK_FOLLOW de sa coque.
pub const ARK_HAUL_REST: u16 = 60;
const ARK_FOLLOW: i32 = 4 * TILE;
/// Collecte : bâtiments de production visités jusqu'à GATHER_RANGE cases de son foyer.
pub const GATHER_RANGE: i32 = 40;
/// Navette d'un chariot : au module, attente (ticks) sans que rien n'en sorte avant de rentrer avec un chargement
/// incomplet ; en livraison, avant de rentrer avec ce que le fabricant ne prend pas.
pub const HAUL_WAIT: u32 = 100;
/// Distance (sous-unités) du centre d'un chariot au bord d'un bâtiment à laquelle il charge ou décharge : il y est
/// collé (sa caisse touche le bâtiment). Il fait donc le trajet même entre deux bâtiments proches.
const HAUL_REACH: i32 = TILE / 2;
/// Chariot arrêté en chemin depuis HAUL_STUCK ticks par un obstacle entre lui et le bâtiment (module collé autour,
/// case infranchissable ; pas une foule, qui s'écarte) : distance au bord du bâtiment qui lui suffit.
const HAUL_OVER: i32 = 5 * TILE;
const HAUL_STUCK: u16 = 15;
/// Phases de la navette (bit 0 de `UnitCold::timer`) : vers le premier arrêt (le module, ou la soute en livraison),
/// puis vers le second.
const HAUL_OUT: u16 = 0;
const HAUL_BACK: u16 = 1;
/// Minerais et matières brutes qu'une soute donne à un fabricant collé en recette automatique.
const RAW: [u8; 5] = [IRON_ORE, COPPER_ORE, SILICON, HYDROCARBON, CRYSTAL];

// ---------- attelage ----------

/// Chariots de convoi attelés au foyer de référence `r` (soute : sa référence de bâtiment ; Arche : son identifiant
/// d'unité), par indice croissant. `UnitCold::parent` du chariot garde cette référence.
pub fn carts_of_ref(w: &World, r: u32) -> Vec<usize> {
    (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_T_CART && w.units.cold[s].parent == r).collect()
}

/// Chariots de convoi attelés à la soute `h`.
pub fn carts_of(w: &World, h: usize) -> Vec<usize> {
    carts_of_ref(w, w.building_ref(h))
}

/// Chariots de convoi attelés à l'Arche `s`.
pub fn ark_carts(w: &World, s: usize) -> Vec<usize> {
    carts_of_ref(w, w.unit_id(s))
}

/// Le foyer `st` (soute déployée, ou Arche) du joueur `owner` peut-il avoir des chariots ?
fn home_ok(w: &World, owner: u8, st: Store) -> bool {
    match st {
        Store::B(h) => {
            let bb = &w.buildings[h];
            bb.alive && bb.kind == B_T_HOLD && bb.owner == owner && bb.complete()
        }
        Store::U(a) => w.units.alive[a] && w.units.kind[a] == U_ARK && w.units.owner[a] == owner,
    }
}

/// Apparition d'un chariot de convoi attelé au foyer `home`, à côté de lui.
pub(crate) fn spawn_cart(w: &mut World, home: Store) -> Option<usize> {
    let owner = match home {
        Store::B(h) => w.buildings[h].owner,
        Store::U(a) => w.units.owner[a],
    };
    let (cx, cy) = home.pos(w);
    if w.players[owner as usize].unit_count >= UNIT_CAP {
        return None;
    }
    let (x, y) = buildings::free_spot_near(w, cx, cy, crate::units::pass_mask(Layer::Land));
    let id = w.spawn_unit(U_T_CART, owner, x, y);
    let s = w.unit(id)?;
    w.units.cold[s].parent = home.id(w);
    Some(s)
}

/// Ordre « Atteler un chariot » sur une soute déployée ou une Arche : un chariot de convoi de plus (CARTS_PER_HOLD
/// au plus par foyer), payé dans les réserves à portée, la sienne d'abord. Renvoie vrai s'il est attelé.
pub fn hitch_at(w: &mut World, home: Store) -> bool {
    let owner = match home {
        Store::B(h) => w.buildings[h].owner,
        Store::U(a) => w.units.owner[a],
    };
    if !home_ok(w, owner, home) || carts_of_ref(w, home.id(w)).len() >= CARTS_PER_HOLD {
        return false;
    }
    let (x, y) = home.pos(w);
    if w.players[owner as usize].unit_count >= UNIT_CAP || !crate::ameliorations::pay(w, owner, x, y, udef(U_T_CART).cost) {
        return false;
    }
    spawn_cart(w, home).is_some()
}

/// « Atteler un chariot » sur la soute `h`.
pub fn hitch(w: &mut World, h: usize) -> bool {
    hitch_at(w, Store::B(h))
}

/// Le chariot `s` se rattache au foyer `home` (clic droit sur une Arche) s'il y a une place ; vrai s'il y est attelé.
pub fn rehome(w: &mut World, s: usize, home: Store) -> bool {
    let r = home.id(w);
    if w.units.cold[s].parent == r {
        return true;
    }
    if !home_ok(w, w.units.owner[s], home) || carts_of_ref(w, r).len() >= CARTS_PER_HOLD {
        return false;
    }
    w.units.cold[s].parent = r;
    true
}

/// Foyer d'un chariot : sa soute ou son Arche, ou, s'il n'en a plus (détruite, repliée), la soute déployée la plus
/// proche qui a une place libre, sinon l'Arche la plus proche qui en a une, à laquelle il s'attelle.
fn cart_home(w: &mut World, s: usize) -> Option<Store> {
    let owner = w.units.owner[s];
    let p = w.units.cold[s].parent;
    if let Some(h) = w.building(p).map(Store::B).or_else(|| w.unit(p).map(Store::U)) {
        if home_ok(w, owner, h) {
            return Some(h);
        }
    }
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let hold = (0..w.buildings.len())
        .filter(|&h| home_ok(w, owner, Store::B(h)) && carts_of(w, h).len() < CARTS_PER_HOLD)
        .min_by_key(|&h| {
            let (cx, cy) = w.buildings[h].center();
            (dist2(x, y, cx, cy), h)
        })
        .map(Store::B);
    let best = hold.or_else(|| {
        w.arks
            .iter()
            .filter_map(|a| w.unit(a.unit))
            .filter(|&a| home_ok(w, owner, Store::U(a)) && ark_carts(w, a).len() < CARTS_PER_HOLD)
            .min_by_key(|&a| (dist2(x, y, w.units.x[a], w.units.y[a]), a))
            .map(Store::U)
    })?;
    w.units.cold[s].parent = best.id(w);
    Some(best)
}

/// L'Arche `a` est-elle à l'arrêt depuis ARK_HAUL_REST ticks (ses chariots font alors leurs navettes) ?
fn ark_resting(w: &World, a: usize) -> bool {
    crate::ameliorations::ark_of(w, a).is_some_and(|i| w.arks[i].rest >= ARK_HAUL_REST)
}

// ---------- navettes ----------

/// Le chariot peut-il faire la navette avec le bâtiment `b` du joueur `p` ? Ramassage : un bâtiment terminé qui
/// produit ou qui consomme des objets (extracteur, fabricant, générateur, atelier) ; livraison (`feed`) : un
/// fabricant terminé qui a une recette, ou une soute.
pub fn haul_ok(w: &World, p: u8, b: usize, feed: bool) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || bb.owner != p || !bb.complete() {
        return false;
    }
    match bb.def().class {
        BClass::Crafter => !feed || bb.recipe != RECIPE_NONE,
        BClass::Extractor | BClass::Power | BClass::Factory => !feed,
        BClass::Depot => feed && bb.kind == B_T_HOLD,
        _ => false,
    }
}

/// Le chariot `s` est-il collé au bâtiment `b` ? Sinon il y roule. Arrêté en chemin près de lui par un obstacle
/// (modules collés autour), il charge et décharge par-dessus ce qui l'arrête.
fn cart_at(w: &mut World, s: usize, b: usize) -> bool {
    let bb = &w.buildings[b];
    let (tx, ty) = bb.center();
    let (bx, by) = (bb.x * TILE, bb.y * TILE);
    let (bw, bh) = bb.size();
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let (px, py) = (x.clamp(bx, bx + bw * TILE), y.clamp(by, by + bh * TILE));
    let d = dist(x, y, px, py);
    if d > HAUL_REACH && !(d <= HAUL_OVER && w.units.cold[s].stuck > HAUL_STUCK && walled_off(w, s, b, px, py)) {
        crate::units::steer(w, s, tx, ty, tx, ty, TILE);
        return false;
    }
    crate::units::clear_goal(w, s);
    true
}

/// Le chariot `s` est-il collé à son foyer (soute, ou Arche : sa caisse touche la coque) ? Sinon il y roule.
fn cart_home_at(w: &mut World, s: usize, home: Store) -> bool {
    match home {
        Store::B(h) => cart_at(w, s, h),
        Store::U(a) => {
            let (ax, ay) = (w.units.x[a], w.units.y[a]);
            let reach = crate::ameliorations::radius(&w.units, a) + udef(U_T_CART).radius + HAUL_REACH;
            if dist(w.units.x[s], w.units.y[s], ax, ay) > reach {
                crate::units::steer(w, s, ax, ay, ax, ay, TILE);
                return false;
            }
            crate::units::clear_goal(w, s);
            true
        }
    }
}

/// L'Arche `a` du chariot `s` roule : il la suit à distance (escorte), sans naviguer.
fn follow_ark(w: &mut World, s: usize, a: usize) {
    let (ax, ay) = (w.units.x[a], w.units.y[a]);
    let keep = crate::ameliorations::radius(&w.units, a) + ARK_FOLLOW;
    if dist(w.units.x[s], w.units.y[s], ax, ay) > keep {
        crate::units::steer(w, s, ax, ay, ax, ay, TILE);
    } else {
        crate::units::clear_goal(w, s);
    }
}

/// Un obstacle sépare-t-il le chariot `s` du point (px, py) du bord du bâtiment `b` : une case qu'il ne peut pas
/// franchir (autre bâtiment, falaise) sur la ligne droite qui les joint ? Les unités ne comptent pas.
fn walled_off(w: &World, s: usize, b: usize, px: i32, py: i32) -> bool {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let m = crate::units::pass_mask(udef(w.units.kind[s]).layer);
    let n = dist(x, y, px, py) / (TILE / 4) + 1;
    (1..=n).any(|k| {
        let (tx, ty) = ((x + (px - x) * k / n).div_euclid(TILE), (y + (py - y) * k / n).div_euclid(TILE));
        w.map.inside(tx, ty) && w.map.occ[w.map.idx(tx, ty)] as usize != b + 1 && !w.map.passable(tx, ty, m)
    })
}

/// Attente d'un chariot (au module, ou au fabricant qui ne prend plus rien) : compte les ticks dans les bits
/// hauts de `UnitCold::timer` (remis à zéro à chaque ordre) ; vrai quand HAUL_WAIT ticks sont passés.
fn waited(w: &mut World, s: usize) -> bool {
    let c = &mut w.units.cold[s];
    let n = (c.timer >> 1) + 1;
    c.timer = (c.timer & 1) | (n.min(HAUL_WAIT as u16) << 1);
    n as u32 >= HAUL_WAIT
}

/// Quelque chose a bougé : l'attente repart de zéro.
fn moved(w: &mut World, s: usize) {
    w.units.cold[s].timer &= 1;
}

/// Le chariot passe à la phase `phase` : attente remise à zéro, et il reprend la route (une halte par-dessus des
/// modules ne vaut que pour l'arrêt où il était).
fn set_phase(w: &mut World, s: usize, phase: u16) {
    let c = &mut w.units.cold[s];
    c.timer = phase;
    c.stuck = 0;
    c.noprog = 0;
    c.best_dist = i32::MAX;
}

/// Un pas de la navette d'un chariot de convoi (ordre Haul), depuis son foyer (soute, ou Arche à l'arrêt). Ramassage :
/// il met dans le module ce qu'il a emporté pour lui, charge ce qui en sort, repart cale pleine ou quand rien n'en
/// sort depuis HAUL_WAIT ticks (module à l'arrêt ou sans produit compris), et décharge dans son foyer ce qui y entre ;
/// puis il y prend ce que le module demande (`load_demand`), le lui porte et l'y met à mesure qu'il l'accepte
/// (`drop_demand`), et recommence.
/// Livraison (`feed`) : il rend d'abord à son foyer ce que le fabricant ne prend pas, y prend les ingrédients de sa
/// recette (part égale de sa cale pour chacun), les y porte et les y met à mesure qu'il les accepte ; il rentre quand
/// sa cale est vide, ou après HAUL_WAIT ticks sans que rien ne passe. Vers une autre soute : voir `load_surplus`.
/// Arche : quand elle roule, il finit son aller puis la suit à distance sans repartir ; embarquée, il attend.
/// Module perdu ou replié : il rapporte ce qu'il a à bord, puis s'arrête.
pub fn haul_step(w: &mut World, s: usize, site: u32, feed: bool) {
    let owner = w.units.owner[s];
    let Some(h) = cart_home(w, s) else {
        crate::units::pop_order(w, s);
        return;
    };
    // Arche : embarquée, ses chariots attendent sur place ; en route, ils la suivent au lieu de repartir
    let mut roaming = false;
    if let Store::U(a) = h {
        if w.units.cold[a].carried_by != NONE {
            crate::units::clear_goal(w, s);
            return;
        }
        roaming = !ark_resting(w, a);
    }
    let Some(b) = w.building(site).filter(|&b| Store::B(b) != h && haul_ok(w, owner, b, feed)) else {
        if crate::drones::total(&w.units.cold[s].hold) > 0 {
            if !cart_home_at(w, s, h) {
                return;
            }
            unload(w, s, h);
        }
        crate::units::pop_order(w, s);
        return;
    };
    let out = w.units.cold[s].timer & 1 == HAUL_OUT;
    let follow = |w: &mut World| {
        if let Store::U(a) = h {
            follow_ark(w, s, a);
        }
    };
    match (feed, out) {
        (false, true) => {
            if cart_at(w, s, b) {
                drop_demand(w, s, b);
                collect(w, s, b);
            }
        }
        (false, false) => {
            if cart_home_at(w, s, h) {
                unload(w, s, h);
                if roaming {
                    follow(w);
                } else if crate::drones::total(&w.units.cold[s].hold) == 0 || waited(w, s) {
                    // à l'aller, il emporte ce que le module demande, si son foyer l'a (ce qui n'est pas entré dans
                    // une Arche pleine reste à bord)
                    load_demand(w, s, h, b);
                    set_phase(w, s, HAUL_OUT);
                }
            }
        }
        (true, true) => {
            if roaming {
                follow(w);
            } else if cart_home_at(w, s, h) {
                if w.buildings[b].kind == B_T_HOLD {
                    unload(w, s, h);
                    load_surplus(w, s, h, b);
                } else {
                    load_inputs(w, s, h, b);
                }
                // il part dès qu'il a quelque chose ; une cale vide attend que la soute en ait
                if crate::drones::total(&w.units.cold[s].hold) > 0 {
                    set_phase(w, s, HAUL_BACK);
                }
            }
        }
        (true, false) => {
            if cart_at(w, s, b) {
                deliver(w, s, b);
            }
        }
    }
}

// ---------- collecte ----------

/// Bâtiment `b` à collecter pour un chariot du joueur `p` dont le foyer est en (hx, hy) : un des siens, terminé, qui a
/// un produit en sortie (extracteur, fabricant), à GATHER_RANGE au plus de son foyer.
fn gather_ok(w: &World, p: u8, b: usize, hx: i32, hy: i32) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || bb.owner != p || !bb.complete() || !matches!(bb.def().class, BClass::Extractor | BClass::Crafter) || bb.out == 0 || buildings::output_of(bb) == 0 {
        return false;
    }
    let (cx, cy) = bb.center();
    let r = GATHER_RANGE as i64 * TILE as i64;
    dist2(hx, hy, cx, cy) <= r * r
}

/// Bâtiments que visent les autres chariots en collecte du même joueur que `s` (références).
fn gather_claimed(w: &World, s: usize) -> Vec<u32> {
    let p = w.units.owner[s];
    let mut v: Vec<u32> = (0..w.units.alive.len())
        .filter(|&o| o != s && w.units.alive[o] && w.units.kind[o] == U_T_CART && w.units.owner[o] == p && matches!(w.units.cold[o].orders.first(), Some(Order::Gather)))
        .map(|o| w.units.cold[o].work)
        .filter(|&r| r != NONE)
        .collect();
    v.sort_unstable();
    v
}

/// Prochain bâtiment de la tournée du chariot `s` (foyer `h`) : ceux qui ne sont pas dans le réseau de transfert de
/// sa soute d'abord (ceux du réseau la servent déjà), le plus plein d'abord, puis le plus proche du foyer, puis le plus
/// petit indice ; pas un bâtiment qu'un autre chariot en collecte vise déjà.
fn gather_pick(w: &World, s: usize, h: Store) -> Option<usize> {
    let p = w.units.owner[s];
    let (hx, hy) = h.pos(w);
    let claimed = gather_claimed(w, s);
    let mut cand: Vec<usize> = Vec::new();
    w.grid.query_buildings(hx, hy, GATHER_RANGE * TILE, |b| cand.push(b));
    cand.sort_unstable();
    cand.dedup();
    cand.into_iter()
        .filter(|&b| gather_ok(w, p, b, hx, hy) && claimed.binary_search(&w.building_ref(b)).is_err())
        .min_by_key(|&b| {
            let in_net = matches!(h, Store::B(hb) if crate::transfert::same_net(w, hb, b));
            let (cx, cy) = w.buildings[b].center();
            (in_net, std::cmp::Reverse(w.buildings[b].out), dist2(hx, hy, cx, cy), b)
        })
}

/// Un pas de la collecte d'un chariot de convoi (ordre Gather) : il fait le tour des bâtiments de production de son
/// joueur autour de son foyer (`gather_pick`), y charge ce qui attend en sortie, rentre décharger quand sa cale est
/// pleine ou qu'il n'y a plus rien à prendre, puis recommence. Plusieurs chariots en collecte ne visent jamais le même
/// bâtiment en même temps. Comme en navette : une Arche qui roule est suivie, une Arche embarquée attendue.
pub fn gather_step(w: &mut World, s: usize) {
    let Some(h) = cart_home(w, s) else {
        crate::units::pop_order(w, s);
        return;
    };
    let mut roaming = false;
    if let Store::U(a) = h {
        if w.units.cold[a].carried_by != NONE {
            crate::units::clear_goal(w, s);
            return;
        }
        roaming = !ark_resting(w, a);
    }
    let cap = crate::ameliorations::cart_cap(w, s);
    let carried = crate::drones::total(&w.units.cold[s].hold);
    if w.units.cold[s].timer & 1 == HAUL_BACK {
        if cart_home_at(w, s, h) {
            unload(w, s, h);
            if let Store::U(a) = h {
                if roaming {
                    follow_ark(w, s, a);
                    return;
                }
            }
            if crate::drones::total(&w.units.cold[s].hold) == 0 || waited(w, s) {
                set_phase(w, s, HAUL_OUT);
                w.units.cold[s].work = NONE;
            }
        }
        return;
    }
    if carried >= cap {
        set_phase(w, s, HAUL_BACK);
        return;
    }
    let p = w.units.owner[s];
    let (hx, hy) = h.pos(w);
    let mut target = w.building(w.units.cold[s].work).filter(|&b| gather_ok(w, p, b, hx, hy));
    // (sans cible, il ne cherche qu'une fois par seconde)
    if target.is_none() && (w.units.cold[s].work != NONE || (w.tick + s as u32).is_multiple_of(20)) {
        target = gather_pick(w, s, h);
        w.units.cold[s].work = target.map_or(NONE, |b| w.building_ref(b));
    }
    let Some(b) = target else {
        // plus rien à prendre : il rentre décharger, puis attend auprès de son foyer
        if carried > 0 {
            set_phase(w, s, HAUL_BACK);
        } else if let (Store::U(a), true) = (h, roaming) {
            follow_ark(w, s, a);
        } else {
            cart_home_at(w, s, h);
        }
        return;
    };
    if cart_at(w, s, b) {
        let it = buildings::output_of(&w.buildings[b]);
        let k = (w.buildings[b].out as u32).min(cap - carried) as u16;
        if k > 0 {
            w.buildings[b].out -= k;
            w.buildings[b].wake = 0;
            crate::drones::put(&mut w.units.cold[s].hold, it, k);
        }
        // bâtiment vidé (ou cale pleine) : au suivant
        w.units.cold[s].work = NONE;
        set_phase(w, s, if carried + k as u32 >= cap { HAUL_BACK } else { HAUL_OUT });
    }
}

/// Point visé par un chariot en collecte : le bâtiment de sa tournée, ou son foyer quand il rentre (affichage).
pub fn gather_point(w: &World, s: usize) -> Option<(i32, i32)> {
    match w.building(w.units.cold[s].work) {
        Some(b) if w.units.cold[s].timer & 1 == HAUL_OUT => Some(w.buildings[b].center()),
        _ => home_point(w, s),
    }
}

/// Position du foyer (soute ou Arche) du chariot `s`, s'il en a un (affichage de ses ordres).
pub fn home_point(w: &World, s: usize) -> Option<(i32, i32)> {
    let p = w.units.cold[s].parent;
    w.building(p).map(|b| w.buildings[b].center()).or_else(|| w.unit(p).map(|a| (w.units.x[a], w.units.y[a])))
}

/// Au module : le chariot charge ce qui en sort.
fn collect(w: &mut World, s: usize, b: usize) {
    let cap = crate::ameliorations::cart_cap(w, s);
    let carried = crate::drones::total(&w.units.cold[s].hold);
    let it = buildings::output_of(&w.buildings[b]);
    let k = if it != 0 { (w.buildings[b].out as u32).min(cap.saturating_sub(carried)) as u16 } else { 0 };
    if k > 0 {
        w.buildings[b].out -= k;
        w.buildings[b].wake = 0;
        crate::drones::put(&mut w.units.cold[s].hold, it, k);
        moved(w, s);
    }
    let now = carried + k as u32;
    // un fabricant à l'arrêt sans rien à rendre, un générateur ou un atelier (rien à rapporter) : le chariot rentre
    // chercher ce qu'il demande
    let bb = &w.buildings[b];
    let starved = match bb.def().class {
        BClass::Crafter => !bb.working && bb.out == 0,
        BClass::Power | BClass::Factory => true,
        _ => false,
    };
    if now >= cap || (k == 0 && (now > 0 || starved) && waited(w, s)) {
        set_phase(w, s, HAUL_BACK);
    }
}

/// Ce que le module `b` demande au foyer `h` pour la navette de ramassage du chariot `s` : (objet, quantité au plus).
/// - Fabricant : les ingrédients de sa recette, la cale partagée au prorata de la recette, sans dépasser la place de
///   son tampon d'entrée (2 fabrications et 1) ; en recette automatique, le minerai que le foyer a en plus grand
///   nombre parmi ceux qu'il peut traiter.
/// - Générateur : son premier combustible que le foyer a, de quoi remplir son réservoir.
/// - Atelier : ce qui manque à sa réserve pour sa file (deux unités d'avance), la cale partagée au prorata.
/// - Une foreuse ne demande rien.
fn demand(w: &World, s: usize, h: Store, b: usize) -> Vec<(u8, u16)> {
    let bb = &w.buildings[b];
    let cap = crate::ameliorations::cart_cap(w, s);
    match bb.def().class {
        BClass::Crafter => {}
        BClass::Power => {
            let room = (buildings::tank_of(bb) - bb.fuel).max(0);
            return [HYDROCARBON, FUEL, ENERGY_CELL]
                .into_iter()
                .find(|&it| buildings::fuel_energy(bb.kind, it) > 0 && h.has(w, it) > 0)
                .map(|it| (it, (room / buildings::fuel_energy(bb.kind, it).max(1)).min(cap as i32) as u16))
                .filter(|&(_, n)| n > 0)
                .into_iter()
                .collect();
        }
        BClass::Factory => {
            let want: Vec<(u8, u32)> = (1..NUM_ITEMS as u8).map(|it| (it, buildings::factory_room(bb, it) as u32)).filter(|&(it, n)| n > 0 && h.has(w, it) > 0).collect();
            let sum: u32 = want.iter().map(|x| x.1).sum::<u32>().max(1);
            return want.into_iter().map(|(it, n)| (it, (cap * n / sum).max(1).min(n) as u16)).collect();
        }
        _ => return Vec::new(),
    }
    if bb.recipe != RECIPE_NONE {
        let inputs = RECIPES[bb.recipe as usize].inputs;
        let sum: u32 = inputs.iter().map(|x| x.1 as u32).sum::<u32>().max(1);
        return inputs
            .iter()
            .enumerate()
            .map(|(j, &(it, n))| {
                let share = (cap * n as u32 / sum).max(1);
                let room = (2 * n as u32 + 1).saturating_sub(bb.inv[j] as u32);
                (it, share.min(room) as u16)
            })
            .collect();
    }
    if bb.def().crafter == Crafter::Assembler {
        return Vec::new();
    }
    let have = |it: u8| h.has(w, it);
    let Some(it) = RAW.into_iter().filter(|&it| have(it) > 0 && buildings::accepts(w, b, it)).max_by_key(|&it| (have(it), std::cmp::Reverse(it))) else { return Vec::new() };
    let r = buildings::recipe_for(w, bb, it);
    let n = RECIPES[r as usize].inputs.iter().find(|x| x.0 == it).map_or(1, |x| x.1 as u32);
    vec![(it, (2 * n + 1).min(cap) as u16)]
}

/// Au foyer `h`, avant une navette de ramassage vers `b` : le chariot emporte ce que le module demande, si le foyer
/// l'a, sans toucher à ce qu'il garde pour les ateliers (`reserved`), dans la place libre de sa cale.
fn load_demand(w: &mut World, s: usize, h: Store, b: usize) {
    let want = demand(w, s, h, b);
    if want.is_empty() {
        return;
    }
    let keep = reserved_at(w, h);
    let mut left = crate::ameliorations::cart_cap(w, s).saturating_sub(crate::drones::total(&w.units.cold[s].hold));
    for (it, n) in want {
        let k = n.min(left.min(u16::MAX as u32) as u16).min(h.has(w, it).saturating_sub(keep[it as usize]));
        if k > 0 {
            h.take(w, it, k);
            crate::drones::put(&mut w.units.cold[s].hold, it, k);
            left -= k as u32;
        }
    }
}

/// Au module `b`, en navette de ramassage : le chariot y met, à mesure qu'il les accepte, les objets qu'il a emportés
/// pour lui (fabricant : ingrédients de sa recette, minerai brut en recette automatique ; générateur : combustible ;
/// atelier : composants de sa file), jamais son produit.
fn drop_demand(w: &mut World, s: usize, b: usize) {
    let bb = &w.buildings[b];
    let class = bb.def().class;
    if !matches!(class, BClass::Crafter | BClass::Power | BClass::Factory) || crate::drones::total(&w.units.cold[s].hold) == 0 {
        return;
    }
    let out = buildings::output_of(bb);
    let mut any = false;
    for it in 1..NUM_ITEMS as u8 {
        let bb = &w.buildings[b];
        let wanted = match class {
            BClass::Crafter if bb.recipe != RECIPE_NONE => RECIPES[bb.recipe as usize].inputs.iter().any(|x| x.0 == it),
            BClass::Crafter => RAW.contains(&it),
            _ => true,
        };
        if !wanted || it == out {
            continue;
        }
        while crate::drones::has(&w.units.cold[s].hold, it) > 0 && buildings::accepts(w, b, it) {
            crate::drones::take(&mut w.units.cold[s].hold, it, 1);
            buildings::insert_item(w, b, it);
            any = true;
        }
    }
    if any {
        moved(w, s);
    }
}

/// Au foyer `h` : le chariot y rend ce que le fabricant `b` ne prend pas et y prend les ingrédients de sa recette.
fn load_inputs(w: &mut World, s: usize, h: Store, b: usize) {
    let inputs = RECIPES[w.buildings[b].recipe as usize].inputs;
    unload_but(w, s, h, &|it| inputs.iter().any(|x| x.0 == it));
    let keep = reserved_at(w, h);
    let cap = crate::ameliorations::cart_cap(w, s);
    let share = (cap / inputs.len().max(1) as u32).max(1) as u16;
    for &(it, _) in inputs {
        let want = share.saturating_sub(crate::drones::has(&w.units.cold[s].hold, it));
        let k = want.min(h.has(w, it).saturating_sub(keep[it as usize]));
        if k > 0 {
            h.take(w, it, k);
            crate::drones::put(&mut w.units.cold[s].hold, it, k);
        }
    }
}

/// Au foyer `h`, pour l'autre soute `b` : le chariot prend ce que le sien a de plus, objet par objet à tour de rôle,
/// jusqu'à ce que les deux (son chargement compris) en aient autant.
fn load_surplus(w: &mut World, s: usize, h: Store, b: usize) {
    let mut left = crate::ameliorations::cart_cap(w, s).saturating_sub(crate::drones::total(&w.units.cold[s].hold));
    let mut any = true;
    while left > 0 && any {
        any = false;
        for it in 1..NUM_ITEMS as u8 {
            let aboard = crate::drones::has(&w.units.cold[s].hold, it);
            let (mine, theirs) = (h.has(w, it), crate::drones::has(&w.buildings[b].stash, it) + aboard);
            if left > 0 && mine >= theirs + 2 && crate::drones::store_room(&w.buildings[b], it) > aboard {
                h.take(w, it, 1);
                crate::drones::put(&mut w.units.cold[s].hold, it, 1);
                left -= 1;
                any = true;
            }
        }
    }
}

/// À l'arrivée d'une livraison : le chariot met dans `b` (fabricant ou soute) ce qu'il accepte.
fn deliver(w: &mut World, s: usize, b: usize) {
    let before = crate::drones::total(&w.units.cold[s].hold);
    if w.buildings[b].kind == B_T_HOLD {
        unload(w, s, Store::B(b));
    } else {
        for it in 1..NUM_ITEMS as u8 {
            while crate::drones::has(&w.units.cold[s].hold, it) > 0 && buildings::accepts(w, b, it) {
                crate::drones::take(&mut w.units.cold[s].hold, it, 1);
                buildings::insert_item(w, b, it);
            }
        }
    }
    let left = crate::drones::total(&w.units.cold[s].hold);
    if left == 0 {
        set_phase(w, s, HAUL_OUT);
    } else if left < before {
        moved(w, s);
    } else if waited(w, s) {
        set_phase(w, s, HAUL_OUT);
    }
}

/// Le chariot `s` met dans son foyer `h` tout ce qu'il a la place de prendre (une Arche : dans la limite de sa
/// soute ; le reste demeure à bord).
fn unload(w: &mut World, s: usize, h: Store) {
    unload_but(w, s, h, &|_| false);
}

/// Comme `unload`, en gardant à bord les objets `keep`.
fn unload_but(w: &mut World, s: usize, h: Store, keep: &dyn Fn(u8) -> bool) {
    if w.units.cold[s].hold.is_empty() {
        return;
    }
    for it in 1..NUM_ITEMS as u8 {
        if keep(it) {
            continue;
        }
        let k = crate::drones::has(&w.units.cold[s].hold, it).min(h.room(w, it));
        if k > 0 {
            crate::drones::take(&mut w.units.cold[s].hold, it, k);
            h.put(w, it, k);
        }
    }
}

/// Places de la benne d'un chariot que le client remplit (render/entities/cargo.ts, `CART_SLOTS`).
pub const LOAD_SLOTS: u32 = 6;

/// Ce que montre la benne du chariot `s` (tampon de rendu, à la place de l'angle de tourelle) : l'objet qu'il porte
/// le plus (le premier à égalité) | places remplies (1 à LOAD_SLOTS, selon sa cale) << 8 ; 0 : vide.
pub fn load_view(w: &World, s: usize) -> i32 {
    let h = &w.units.cold[s].hold;
    let total = crate::drones::total(h);
    if total == 0 {
        return 0;
    }
    let mut best = 0;
    for (it, &n) in h.iter().enumerate() {
        if n > h[best] {
            best = it;
        }
    }
    let cap = crate::ameliorations::cart_cap(w, s).max(1);
    let fill = (LOAD_SLOTS * total).div_ceil(cap).clamp(1, LOAD_SLOTS);
    best as i32 | (fill as i32) << 8
}

// ---------- repli et déploiement de la soute ----------

/// Chariots rentrés dans une soute repliée : leur nombre, leurs équipements (octets 2 à 7 de `UnitCold::mods` du
/// chenillard) et leurs navettes (`UnitCold::aboard` : module, livraison ; NONE : aucune).
pub struct Stowed {
    pub n: i32,
    pub mods: u64,
    pub routes: Vec<(u32, u32)>,
}

/// Repli de la soute `h` : ses chariots rentrent (leur chargement va dans son stock ; une installation en cours est
/// remboursée).
pub fn stow_carts(w: &mut World, h: usize) -> Stowed {
    let mut st = Stowed { n: 0, mods: 0, routes: Vec::new() };
    for (k, s) in carts_of(w, h).into_iter().enumerate() {
        crate::ameliorations::cancel(w, crate::ameliorations::Host::U(s));
        st.mods |= (w.units.cold[s].mods & 0xff) << (8 * (2 + k.min(5)));
        st.routes.push(match w.units.cold[s].orders.first() {
            Some(&Order::Haul { site, feed }) => (site, feed as u32),
            _ => (NONE, 0),
        });
        st.n += 1;
        let cargo = std::mem::take(&mut w.units.cold[s].hold);
        for (it, &n) in cargo.iter().enumerate() {
            if n > 0 {
                crate::drones::put(&mut w.buildings[h].stash, it as u8, n);
            }
        }
        vanish(w, s);
    }
    st
}

/// Soute `h` redéployée : ses chariots ressortent (déjà payés), équipés, et reprennent leur navette si leur module
/// est toujours là.
pub fn unstow_carts(w: &mut World, h: usize, n: i32, mods: u64, routes: &[(u32, u32)]) {
    for k in 0..n.clamp(0, CARTS_PER_HOLD as i32) as usize {
        let Some(s) = spawn_cart(w, Store::B(h)) else { continue };
        w.units.cold[s].mods = crate::ameliorations::at(mods, 2 + k as u8) as u64;
        let Some(&(site, feed)) = routes.get(k) else { continue };
        let feed = feed != 0;
        let owner = w.units.owner[s];
        if w.building(site).is_some_and(|b| haul_ok(w, owner, b, feed)) {
            crate::orders::give(w, s, false, Order::Haul { site, feed });
        }
    }
}

// ---------- soute : réseau de transfert ----------

/// Ce que la soute `h` garde pour les ateliers qui s'y servent : ce qui manque à leur prochaine unité (atelier déployé à
/// FACTORY_SUPPLY cases au plus ou dans son réseau de transfert, atelier de l'Arche à NEAR_SUPPLY cases). Une fois servis, ils ne gardent plus rien :
/// les fabricants qui font les composants attendus reprennent.
pub fn reserved(w: &World, h: usize) -> [u16; NUM_ITEMS] {
    reserved_at(w, Store::B(h))
}

/// Comme `reserved`, pour un foyer de chariots : soute (avec son réseau de transfert) ou Arche.
pub fn reserved_at(w: &World, st: Store) -> [u16; NUM_ITEMS] {
    let mut keep = [0u16; NUM_ITEMS];
    let owner = match st {
        Store::B(h) => w.buildings[h].owner,
        Store::U(a) => w.units.owner[a],
    };
    let (cx, cy) = st.pos(w);
    let net: &[u32] = match st {
        Store::B(h) => crate::transfert::members(w, h),
        Store::U(_) => &[],
    };
    let r = FACTORY_SUPPLY * TILE;
    let mut shops: Vec<usize> = Vec::new();
    let shop = |ob: &Building| ob.alive && ob.owner == owner && ob.complete() && ob.def().class == BClass::Factory && !ob.queue.is_empty() && !buildings::paused(ob);
    w.grid.query_buildings(cx, cy, r, |o| {
        let ob = &w.buildings[o];
        let (ox, oy) = ob.center();
        if shop(ob) && dist2(cx, cy, ox, oy) <= r as i64 * r as i64 {
            shops.push(o);
        }
    });
    // les ateliers de son réseau de transfert, même plus loin
    shops.extend(net.iter().map(|&o| o as usize).filter(|&o| shop(&w.buildings[o])));
    shops.sort_unstable();
    shops.dedup();
    for o in shops {
        let ob = &w.buildings[o];
        // l'unité en cours est déjà payée : la suivante est la même, ou l'entrée d'après
        let last = ob.working && ob.queue[0].1 <= 1;
        let next = if !last || ob.repeat && ob.queue.len() == 1 { ob.queue.first() } else { ob.queue.get(1) };
        let Some(&(kind, _)) = next else { continue };
        for &(it, n) in udef(kind).cost {
            keep[it as usize] += n.saturating_sub(buildings::factory_has(ob, it));
        }
    }
    let r = NEAR_SUPPLY * TILE;
    for a in &w.arks {
        let (Some(s), false, Some(&(kind, _))) = (w.unit(a.unit), a.paid, a.queue.first()) else { continue };
        if w.units.owner[s] == owner && dist2(cx, cy, w.units.x[s], w.units.y[s]) <= r as i64 * r as i64 {
            for &(it, n) in udef(kind).cost {
                keep[it as usize] += n;
            }
        }
    }
    keep
}

/// Soute d'un Transhumant : elle alimente depuis son stock les fabricants et les ateliers de son réseau de transfert
/// (collés ou reliés par d'autres bâtiments, du plus proche au plus loin ; un objet par ingrédient, par destinataire
/// et par passage). Elle donne aux fabricants tout ce qu'elle a, sauf ce qu'elle garde pour les ateliers (`reserved`) ;
/// les ateliers reçoivent ce qui manque à la réserve de leur file. Un fabricant en recette automatique reçoit du
/// minerai (`auto_ore`).
pub fn feed_crafters(w: &mut World, b: usize) {
    // les fabricants et les ateliers de son réseau de transfert (collés, ou reliés par d'autres bâtiments), les plus
    // proches d'abord
    let near: Vec<usize> = crate::transfert::linked(w, b)
        .into_iter()
        .filter(|&o| {
            let ob = &w.buildings[o];
            match ob.def().class {
                BClass::Crafter => !(ob.recipe == RECIPE_NONE && ob.def().crafter == Crafter::Assembler),
                BClass::Factory => !ob.queue.is_empty() && !buildings::paused(ob),
                _ => false,
            }
        })
        .collect();
    if near.is_empty() {
        return;
    }
    let keep = reserved(w, b);
    // palan : deux objets au lieu d'un
    let rounds = if crate::ameliorations::spec(&w.buildings[b]) == crate::ameliorations::M_HOLD_CRANE { 2 } else { 1 };
    for o in (0..rounds).flat_map(|_| near.iter().copied()) {
        // atelier : un de chaque composant qui manque à la réserve de sa file (c'est pour lui que la soute garde)
        if w.buildings[o].def().class == BClass::Factory {
            for it in 1..NUM_ITEMS as u8 {
                if crate::drones::has(&w.buildings[b].stash, it) > 0 && buildings::factory_room(&w.buildings[o], it) > 0 {
                    crate::drones::take(&mut w.buildings[b].stash, it, 1);
                    buildings::insert_item(w, o, it);
                }
            }
            continue;
        }
        if let Some(it) = auto_ore(w, b, o) {
            crate::drones::take(&mut w.buildings[b].stash, it, 1);
            buildings::insert_item(w, o, it);
            continue;
        }
        let r = w.buildings[o].recipe;
        if r == RECIPE_NONE {
            continue;
        }
        for &(it, _) in RECIPES[r as usize].inputs {
            if crate::drones::has(&w.buildings[b].stash, it) > keep[it as usize] && buildings::accepts(w, o, it) {
                crate::drones::take(&mut w.buildings[b].stash, it, 1);
                buildings::insert_item(w, o, it);
            }
        }
    }
}

/// Minerai que la soute `b` donne au fabricant collé `o` en recette automatique : celui qu'elle a en plus grand nombre
/// parmi ceux qu'il peut traiter. Rien tant qu'il a de quoi travailler : sa recette est servie par la soute ou par une
/// foreuse de son réseau de transfert.
fn auto_ore(w: &World, b: usize, o: usize) -> Option<u8> {
    let ob = &w.buildings[o];
    if ob.repeat || ob.def().crafter == Crafter::Assembler {
        return None;
    }
    if ob.recipe != RECIPE_NONE {
        if ob.working || ob.out > 0 || ob.inv.iter().any(|&n| n > 0) {
            return None;
        }
        let uses = |it: u8| RECIPES[ob.recipe as usize].inputs.iter().any(|x| x.0 == it);
        let stash = &w.buildings[b].stash;
        if RECIPES[ob.recipe as usize].inputs.iter().any(|x| crate::drones::has(stash, x.0) > 0) || crate::transfert::linked(w, o).into_iter().any(|g| w.buildings[g].def().class == BClass::Extractor && uses(w.buildings[g].recipe)) {
            return None;
        }
    }
    let have = |it: u8| crate::drones::has(&w.buildings[b].stash, it);
    RAW.into_iter().filter(|&it| have(it) > 0 && buildings::accepts(w, o, it)).max_by_key(|&it| (have(it), std::cmp::Reverse(it)))
}
