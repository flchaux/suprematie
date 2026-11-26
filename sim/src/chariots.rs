//! Soute et chariots de convoi des Transhumants (voir docs/spec/races.md).
//!
//! - Soute : elle alimente depuis son stock les fabricants collés à ses faces (`feed_crafters`), et garde pour les
//!   ateliers à portée ce qui manque à leur prochaine unité (`reserved`).
//! - Chariots : six au plus par soute, ils font la navette entre elle et un module (ramassage, livraison) ou une autre
//!   soute (livraison jusqu'à égalité des stocks).

use crate::buildings;
use crate::data::*;
use crate::fixed::{dist, dist2, TILE};
use crate::transhumants::{glued, vanish};
use crate::world::*;

/// Chariots de convoi qu'une soute peut avoir attelés en même temps.
pub const CARTS_PER_HOLD: usize = 6;
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
/// Une soute qui a déjà PLENTY exemplaires d'un produit garde les LAST derniers de chacun de ses ingrédients : un
/// fabricant ne vide pas la soute pour un produit qu'elle a en nombre.
pub const PLENTY: u16 = 100;
pub const LAST: u16 = 40;
/// Minerais et matières brutes qu'une soute donne à un fabricant collé en recette automatique.
const RAW: [u8; 5] = [IRON_ORE, COPPER_ORE, SILICON, HYDROCARBON, CRYSTAL];

// ---------- attelage ----------

/// Chariots de convoi attelés à la soute `h` (leur `UnitCold::parent` est sa référence de bâtiment, que les
/// unités ignorent : `World::unit` ne la résout pas), par indice croissant.
pub fn carts_of(w: &World, h: usize) -> Vec<usize> {
    let r = w.building_ref(h);
    (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_T_CART && w.units.cold[s].parent == r).collect()
}

/// Apparition d'un chariot de convoi attelé à la soute `h`, à côté d'elle.
fn spawn_cart(w: &mut World, h: usize) -> Option<usize> {
    let (owner, (cx, cy)) = (w.buildings[h].owner, w.buildings[h].center());
    if w.players[owner as usize].unit_count >= UNIT_CAP {
        return None;
    }
    let (x, y) = buildings::free_spot_near(w, cx, cy, crate::units::pass_mask(Layer::Land));
    let id = w.spawn_unit(U_T_CART, owner, x, y);
    let s = w.unit(id)?;
    w.units.cold[s].parent = w.building_ref(h);
    Some(s)
}

/// Ordre « Atteler un chariot » sur une soute déployée : un chariot de convoi de plus (CARTS_PER_HOLD au plus),
/// payé dans les réserves à portée, la sienne d'abord. Renvoie vrai s'il est attelé.
pub fn hitch(w: &mut World, h: usize) -> bool {
    let bb = &w.buildings[h];
    if !bb.alive || bb.kind != B_T_HOLD || !bb.complete() || carts_of(w, h).len() >= CARTS_PER_HOLD {
        return false;
    }
    let (owner, (x, y)) = (bb.owner, bb.center());
    if w.players[owner as usize].unit_count >= UNIT_CAP || !crate::ameliorations::pay(w, owner, x, y, udef(U_T_CART).cost) {
        return false;
    }
    spawn_cart(w, h).is_some()
}

/// Soute d'un chariot : la sienne, ou, s'il n'en a plus (détruite), la soute déployée la plus proche qui a une
/// place libre, à laquelle il s'attelle.
fn cart_hold(w: &mut World, s: usize) -> Option<usize> {
    let owner = w.units.owner[s];
    if let Some(h) = w.building(w.units.cold[s].parent) {
        if w.buildings[h].kind == B_T_HOLD && w.buildings[h].owner == owner {
            return Some(h);
        }
    }
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let best = (0..w.buildings.len())
        .filter(|&h| {
            let bb = &w.buildings[h];
            bb.alive && bb.kind == B_T_HOLD && bb.owner == owner && bb.complete() && carts_of(w, h).len() < CARTS_PER_HOLD
        })
        .min_by_key(|&h| {
            let (cx, cy) = w.buildings[h].center();
            (dist2(x, y, cx, cy), h)
        })?;
    w.units.cold[s].parent = w.building_ref(best);
    Some(best)
}

// ---------- navettes ----------

/// Le chariot peut-il faire la navette avec le bâtiment `b` du joueur `p` ? Ramassage : un extracteur ou un
/// fabricant terminé ; livraison (`feed`) : un fabricant terminé qui a une recette, ou une soute.
pub fn haul_ok(w: &World, p: u8, b: usize, feed: bool) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || bb.owner != p || !bb.complete() {
        return false;
    }
    match bb.def().class {
        BClass::Crafter => !feed || bb.recipe != RECIPE_NONE,
        BClass::Extractor => !feed,
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

/// Un pas de la navette d'un chariot de convoi (ordre Haul). Ramassage : il charge ce qui sort du module, repart
/// cale pleine ou quand rien n'en sort depuis HAUL_WAIT ticks, et décharge tout dans sa soute ; puis recommence.
/// Livraison (`feed`) : il rend d'abord à sa soute ce que le fabricant ne prend pas, y prend les ingrédients de sa
/// recette (part égale de sa cale pour chacun), les y porte et les y met à mesure qu'il les accepte ; il rentre quand
/// sa cale est vide, ou après HAUL_WAIT ticks sans que rien ne passe. Vers une autre soute : voir `load_surplus`.
/// Module perdu ou replié : il rapporte ce qu'il a à bord, puis s'arrête.
pub fn haul_step(w: &mut World, s: usize, site: u32, feed: bool) {
    let owner = w.units.owner[s];
    let Some(h) = cart_hold(w, s) else {
        crate::units::pop_order(w, s);
        return;
    };
    let Some(b) = w.building(site).filter(|&b| b != h && haul_ok(w, owner, b, feed)) else {
        if crate::drones::total(&w.units.cold[s].hold) > 0 {
            if !cart_at(w, s, h) {
                return;
            }
            unload(w, s, h);
        }
        crate::units::pop_order(w, s);
        return;
    };
    let out = w.units.cold[s].timer & 1 == HAUL_OUT;
    match (feed, out) {
        (false, true) => {
            if cart_at(w, s, b) {
                collect(w, s, b);
            }
        }
        (false, false) => {
            if cart_at(w, s, h) {
                unload(w, s, h);
                if crate::drones::total(&w.units.cold[s].hold) == 0 {
                    set_phase(w, s, HAUL_OUT);
                }
            }
        }
        (true, true) => {
            if cart_at(w, s, h) {
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
    if now >= cap || (k == 0 && now > 0 && waited(w, s)) {
        set_phase(w, s, HAUL_BACK);
    }
}

/// À la soute `h` : le chariot y rend ce que le fabricant `b` ne prend pas et y prend les ingrédients de sa recette.
fn load_inputs(w: &mut World, s: usize, h: usize, b: usize) {
    let inputs = RECIPES[w.buildings[b].recipe as usize].inputs;
    unload_but(w, s, h, &|it| inputs.iter().any(|x| x.0 == it));
    let keep = reserved(w, h);
    let last = last_kept(w, h, w.buildings[b].recipe);
    let cap = crate::ameliorations::cart_cap(w, s);
    let share = (cap / inputs.len().max(1) as u32).max(1) as u16;
    for &(it, _) in inputs {
        let want = share.saturating_sub(crate::drones::has(&w.units.cold[s].hold, it));
        let k = want.min(crate::drones::has(&w.buildings[h].stash, it).saturating_sub(keep[it as usize].max(last)));
        if k > 0 {
            crate::drones::take(&mut w.buildings[h].stash, it, k);
            crate::drones::put(&mut w.units.cold[s].hold, it, k);
        }
    }
}

/// À la soute `h`, pour l'autre soute `b` : le chariot prend ce que la sienne a de plus, objet par objet à tour de
/// rôle, jusqu'à ce que les deux (son chargement compris) en aient autant.
fn load_surplus(w: &mut World, s: usize, h: usize, b: usize) {
    let mut left = crate::ameliorations::cart_cap(w, s).saturating_sub(crate::drones::total(&w.units.cold[s].hold));
    let mut any = true;
    while left > 0 && any {
        any = false;
        for it in 1..NUM_ITEMS as u8 {
            let aboard = crate::drones::has(&w.units.cold[s].hold, it);
            let (mine, theirs) = (crate::drones::has(&w.buildings[h].stash, it), crate::drones::has(&w.buildings[b].stash, it) + aboard);
            if left > 0 && mine >= theirs + 2 && crate::drones::store_room(&w.buildings[b], it) > aboard {
                crate::drones::take(&mut w.buildings[h].stash, it, 1);
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
        unload(w, s, b);
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

/// Le chariot `s` met dans la soute `h` tout ce qu'elle a la place de prendre.
fn unload(w: &mut World, s: usize, h: usize) {
    unload_but(w, s, h, &|_| false);
}

/// Comme `unload`, en gardant à bord les objets `keep`.
fn unload_but(w: &mut World, s: usize, h: usize, keep: &dyn Fn(u8) -> bool) {
    if w.units.cold[s].hold.is_empty() {
        return;
    }
    let st = crate::drones::Store::B(h);
    for it in 1..NUM_ITEMS as u8 {
        if keep(it) {
            continue;
        }
        let k = crate::drones::has(&w.units.cold[s].hold, it).min(st.room(w, it));
        if k > 0 {
            crate::drones::take(&mut w.units.cold[s].hold, it, k);
            st.put(w, it, k);
        }
    }
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
        let Some(s) = spawn_cart(w, h) else { continue };
        w.units.cold[s].mods = crate::ameliorations::at(mods, 2 + k as u8) as u64;
        let Some(&(site, feed)) = routes.get(k) else { continue };
        let feed = feed != 0;
        let owner = w.units.owner[s];
        if w.building(site).is_some_and(|b| haul_ok(w, owner, b, feed)) {
            crate::orders::give(w, s, false, Order::Haul { site, feed });
        }
    }
}

// ---------- soute : modules collés ----------

/// Ce que la soute `h` garde pour les ateliers qui s'y servent : ce qui manque à leur prochaine unité (atelier déployé à
/// FACTORY_SUPPLY cases au plus, atelier de l'Arche à NEAR_SUPPLY cases). Une fois servis, ils ne gardent plus rien :
/// les fabricants qui font les composants attendus reprennent.
pub fn reserved(w: &World, h: usize) -> [u16; NUM_ITEMS] {
    let mut keep = [0u16; NUM_ITEMS];
    let owner = w.buildings[h].owner;
    let (cx, cy) = w.buildings[h].center();
    let r = FACTORY_SUPPLY * TILE;
    let mut shops: Vec<usize> = Vec::new();
    w.grid.query_buildings(cx, cy, r, |o| {
        let ob = &w.buildings[o];
        if ob.alive && ob.owner == owner && ob.complete() && ob.def().class == BClass::Factory && !ob.queue.is_empty() && !buildings::paused(ob) {
            shops.push(o);
        }
    });
    shops.sort_unstable();
    shops.dedup();
    for o in shops {
        let ob = &w.buildings[o];
        let (ox, oy) = ob.center();
        if dist2(cx, cy, ox, oy) > r as i64 * r as i64 {
            continue;
        }
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

/// Ce que la soute `h` garde de chaque ingrédient de la recette `r`, selon ce qu'elle a déjà de son produit.
fn last_kept(w: &World, h: usize, r: u8) -> u16 {
    if crate::drones::has(&w.buildings[h].stash, RECIPES[r as usize].output.0) >= PLENTY {
        LAST
    } else {
        0
    }
}

/// Soute d'un Transhumant : elle alimente depuis son stock les fabricants collés à ses faces (un objet par fabricant
/// et par passage), une fois les ateliers servis (`reserved`) et sans s'épuiser pour un produit qu'elle a en nombre
/// (`last_kept`). Un fabricant en recette automatique reçoit du minerai
/// (`auto_ore`).
pub fn feed_crafters(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    let owner = bb.owner;
    let (x, y) = (bb.x, bb.y);
    let (bw, bh) = bb.size();
    let (cx, cy) = bb.center();
    let mut near: Vec<usize> = Vec::new();
    w.grid.query_buildings(cx, cy, 4 * TILE, |o| {
        if o == b {
            return;
        }
        let ob = &w.buildings[o];
        if !ob.alive || ob.owner != owner || !ob.complete() || ob.def().class != BClass::Crafter || (ob.recipe == RECIPE_NONE && ob.def().crafter == Crafter::Assembler) {
            return;
        }
        let (ow, oh) = ob.size();
        // collés par une face (pas seulement par un coin)
        let touch_x = (ob.x + ow == x || x + bw == ob.x) && ob.y < y + bh && y < ob.y + oh;
        let touch_y = (ob.y + oh == y || y + bh == ob.y) && ob.x < x + bw && x < ob.x + ow;
        if touch_x || touch_y {
            near.push(o);
        }
    });
    if near.is_empty() {
        return;
    }
    near.sort_unstable();
    let keep = reserved(w, b);
    // palan : deux objets au lieu d'un
    let rounds = if crate::ameliorations::spec(&w.buildings[b]) == crate::ameliorations::M_HOLD_CRANE { 2 } else { 1 };
    for o in (0..rounds).flat_map(|_| near.iter().copied()) {
        if let Some(it) = auto_ore(w, b, o) {
            crate::drones::take(&mut w.buildings[b].stash, it, 1);
            buildings::insert_item(w, o, it);
            continue;
        }
        let r = w.buildings[o].recipe;
        if r == RECIPE_NONE {
            continue;
        }
        let last = last_kept(w, b, r);
        for &(it, _) in RECIPES[r as usize].inputs {
            if crate::drones::has(&w.buildings[b].stash, it) > keep[it as usize].max(last) && buildings::accepts(w, o, it) {
                crate::drones::take(&mut w.buildings[b].stash, it, 1);
                buildings::insert_item(w, o, it);
            }
        }
    }
}

/// Minerai que la soute `b` donne au fabricant collé `o` en recette automatique : celui qu'elle a en plus grand nombre
/// parmi ceux qu'il peut traiter. Rien tant qu'il a de quoi travailler : sa recette est servie par la soute ou par une
/// foreuse collée.
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
        if RECIPES[ob.recipe as usize].inputs.iter().any(|x| crate::drones::has(stash, x.0) > 0) || glued(w, o).into_iter().any(|g| w.buildings[g].def().class == BClass::Extractor && uses(w.buildings[g].recipe)) {
            return None;
        }
    }
    let have = |it: u8| crate::drones::has(&w.buildings[b].stash, it);
    RAW.into_iter().filter(|&it| have(it) > 0 && buildings::accepts(w, o, it)).max_by_key(|&it| (have(it), std::cmp::Reverse(it)))
}
