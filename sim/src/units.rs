//! Unités : exécution des ordres, déplacement, construction, recyclage, transport, capacités spéciales.

use crate::buildings::{self, dims};
use crate::data::*;
use crate::fixed::{angle_diff, dist, dist2, turn_towards, TILE};
use crate::flow::{self, AT_GOAL, NO_DIR};
use crate::map::{P_HOVER, P_LAND, P_NAVAL};
use crate::world::*;

/// Distance (sous-unités) à laquelle le commandant récupère les objets d'un tapis.
const COLLECT_RANGE: i32 = 3 * TILE;

/// Ramassage (ordre Pickup) : distance au bord du bâtiment à laquelle le constructeur prend sa sortie.
pub const PICKUP_RANGE: i32 = 3 * TILE;
/// Livraison (ordre Deliver) : distance au bord du dépôt à laquelle le constructeur y dépose sa soute.
pub const DELIVER_RANGE: i32 = 3 * TILE;
/// État du ramassage, gardé dans `UnitCold::timer` tant que l'ordre Pickup est en tête de file.
pub const PK_GOING: u16 = 0;
/// posté : prend ce qui sort, à mesure
pub const PK_WORKING: u16 = 1;
/// soute d'un ingénieur pleine : ses drones la vident dans un dépôt
pub const PK_FULL: u16 = 2;
/// soute pleine et rien ne la vide : soute du commandant (un dépôt) pleine pour ce produit, ou aucun
/// dépôt n'a de place pour ce que porte l'ingénieur
pub const PK_STUCK: u16 = 3;

/// Le joueur `p` peut-il ramasser la sortie du bâtiment `b` ? Ses propres extracteurs et fabricants
/// terminés (foreuses et fabricants des Transhumants compris).
pub fn pickup_ok(w: &World, p: u8, b: usize) -> bool {
    let bb = &w.buildings[b];
    bb.alive && bb.owner == p && bb.complete() && matches!(bb.def().class, BClass::Extractor | BClass::Crafter)
}

/// Le constructeur `s` est-il à moins de `range` du bord du bâtiment `b` ? Renvoie aussi le centre.
fn near_building(w: &World, s: usize, b: usize, range: i32) -> (bool, i32, i32, i32) {
    let (tx, ty) = w.buildings[b].center();
    let (bw, bh) = w.buildings[b].size();
    let reach = bw.max(bh) * TILE / 2 + range;
    (dist(w.units.x[s], w.units.y[s], tx, ty) <= reach, tx, ty, reach)
}

/// Récolte du commandant (ordre Harvest) : distance au centre de la case du gisement (sous-unités).
pub const HARVEST_RANGE: i32 = 3 * TILE;
/// Durée d'un cycle de récolte, en multiple de la durée de la recette de fonderie : extraire puis
/// fondre un minerai prend 2 fois le temps de fonte d'une fonderie de base (plaque de fer ou de cuivre :
/// 80 ticks, soit 0,25 par seconde ; plaquette de silicium : 120 ticks). Une chaîne extracteur +
/// fonderie de base sort 0,5 plaque par seconde, et jusqu'à 1,15 améliorée.
pub const HARVEST_SLOWDOWN: u32 = 2;
/// État de la récolte, gardé dans `UnitCold::timer` tant que l'ordre Harvest est en tête de file.
pub const HV_GOING: u16 = 0;
pub const HV_WORKING: u16 = 1;
/// canon du commandant occupé par un ennemi à portée : la fonderie s'arrête
pub const HV_COMBAT: u16 = 2;
/// soute pleine pour le produit fondu
pub const HV_FULL: u16 = 3;

/// Recette de fonderie utilisable par la récolte du commandant du joueur `owner` sur la case (x, y) :
/// gisement fondable, et recette débloquée (la plaquette de silicium demande l'électronique).
pub fn harvest_recipe(w: &World, owner: u8, x: i32, y: i32) -> Option<usize> {
    if !w.map.inside(x, y) {
        return None;
    }
    let r = smelt_recipe(w.map.deposit[w.map.idx(x, y)])?;
    if w.players[owner as usize].has_tech(RECIPES[r].tech) {
        Some(r)
    } else {
        None
    }
}

/// Ticks d'un cycle de récolte (multiplicateur de ressources 100 %).
pub fn harvest_cycle(r: usize) -> u32 {
    RECIPES[r].time as u32 * HARVEST_SLOWDOWN
}

#[inline]
pub fn move_class(layer: Layer) -> Option<u8> {
    match layer {
        Layer::Land => Some(0),
        Layer::Hover => Some(1),
        Layer::Naval | Layer::Sub => Some(2),
        Layer::Air => None,
    }
}
#[inline]
pub fn pass_mask(layer: Layer) -> u8 {
    match layer {
        Layer::Land => P_LAND,
        Layer::Hover => P_HOVER,
        Layer::Naval | Layer::Sub => P_NAVAL,
        Layer::Air => 0xff,
    }
}
/// Avion à voilure fixe : avance toujours, tourne en rond autour de sa cible.
#[inline]
pub fn fixed_wing(kind: u16) -> bool {
    let d = udef(kind);
    d.layer == Layer::Air && !matches!(kind, U_TRANSPORT | U_HEAVY_TRANSPORT | U_MOTHERSHIP | U_HYPER | U_DRAGON | U_STAR_CRUISER) && d.key != "gunship"
}
/// Unité à pattes (robots, marcheurs) : elle change de direction en marchant, sans pivoter sur place,
/// et le haut de son corps vise sa prochaine cible pendant la marche.
#[inline]
pub fn legged(kind: u16) -> bool {
    matches!(
        udef(kind).key,
        "behemoth" | "commander" | "line_robot" | "assault_walker" | "siege_walker" | "shock_robot" | "heavy_artillery" | "spider" | "colossus" | "fortress" | "beast_s" | "beast_m" | "beast_l"
    )
}

#[inline]
fn turn_rate(kind: u16) -> i32 {
    let d = udef(kind);
    if fixed_wing(kind) {
        700
    } else if legged(kind) {
        // des jambes tournent vite : un demi-tour en 8 ticks
        4096
    } else if d.radius > 500 {
        500
    } else if d.radius > 280 {
        900
    } else {
        2000
    }
}

pub fn build_range(kind: u16, dir: u8) -> i32 {
    let (bw, bh) = dims(kind, dir);
    (6 + bw.max(bh) / 2) * TILE
}

/// Libère le but de déplacement de l'unité.
pub fn clear_goal(w: &mut World, s: usize) {
    let g = w.units.cold[s].goal;
    if g != 0 {
        flow::release_goal(w, g);
        w.units.cold[s].goal = 0;
    }
}

pub fn pop_order(w: &mut World, s: usize) {
    clear_goal(w, s);
    let c = &mut w.units.cold[s];
    if !c.orders.is_empty() {
        c.orders.remove(0);
    }
    c.stuck = 0;
    c.noprog = 0;
    c.best_dist = i32::MAX;
    c.timer = 0;
    c.work = 0;
    c.supply_at = NONE;
}

pub fn clear_orders(w: &mut World, s: usize) {
    clear_goal(w, s);
    let c = &mut w.units.cold[s];
    c.orders.clear();
    c.stuck = 0;
    c.noprog = 0;
    c.best_dist = i32::MAX;
    c.timer = 0;
    c.work = 0;
    c.supply_at = NONE;
}

/// Déplace l'unité vers (tx, ty). Renvoie vrai à l'arrivée (à moins de `stop`).
pub fn steer(w: &mut World, s: usize, tx: i32, ty: i32, gx: i32, gy: i32, stop: i32) -> bool {
    steer_paced(w, s, tx, ty, gx, gy, stop, i32::MAX, 20, false)
}

/// Allure d'une unité dans un déplacement en formation (`Order::Move::eta`, voir
/// orders::formation_etas) : vitesse (sous-unités par tick) qui la fait arriver à (x, y) au tick prévu
/// pour le groupe. Une unité en avance ralentit (ou attend), une unité en retard (détour, combat)
/// reprend sa pleine vitesse. Au premier tick de l'ordre, la durée prévue devient un tick d'arrivée.
pub fn formation_pace(w: &mut World, s: usize, x: i32, y: i32, eta: u32) -> i32 {
    if eta == 0 || fixed_wing(w.units.kind[s]) {
        return i32::MAX;
    }
    let eta = if eta & ETA_PENDING != 0 {
        let at = w.tick.saturating_add(eta & !ETA_PENDING);
        if let Some(Order::Move { eta: e, .. }) = w.units.cold[s].orders.first_mut() {
            *e = at;
        }
        at
    } else {
        eta
    };
    let left = eta as i64 - w.tick as i64;
    if left <= 0 {
        return i32::MAX;
    }
    let d = dist(w.units.x[s], w.units.y[s], x, y) as i64;
    ((d + left - 1) / left).max(1) as i32
}

/// Formation en file : à la fin d'un segment, le suivant (s'il n'a pas commencé) compte sa durée à
/// partir du tick d'arrivée prévu pour le groupe, pas du tick où cette unité arrive. Tout le groupe
/// partage ainsi la même horloge d'un point à l'autre : une unité en retard rattrape, une en avance
/// ralentit, et la disposition se garde sur toute la file.
fn chain_eta(w: &mut World, s: usize) {
    let o = &mut w.units.cold[s].orders;
    if let (Some(&Order::Move { eta: e0, .. }), Some(Order::Move { eta: e1, .. })) = (o.first(), o.get(1)) {
        if e0 != 0 && e0 & ETA_PENDING == 0 && e1 & ETA_PENDING != 0 {
            let at = e0.saturating_add(e1 & !ETA_PENDING).min(ETA_PENDING - 1);
            if let Some(Order::Move { eta, .. }) = o.get_mut(1) {
                *eta = at;
            }
        }
    }
}

/// Comme `steer`, à une vitesse d'au plus `cap` sous-unités par tick (allure d'un groupe en formation).
/// `patience` : ticks sans rapprochement, près du but, avant de s'arrêter là (foule autour du but).
#[allow(clippy::too_many_arguments)]
/// `form` : déplacement en formation (la place (tx, ty) garde son écart au but du groupe (gx, gy)).
pub fn steer_paced(w: &mut World, s: usize, tx: i32, ty: i32, gx: i32, gy: i32, stop: i32, cap: i32, patience: u16, form: bool) -> bool {
    let kind = w.units.kind[s];
    let def = udef(kind);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let d = dist(x, y, tx, ty);
    if d <= stop && !fixed_wing(kind) {
        return true;
    }
    if crate::essaim::rooted(w, s) {
        // la Reine se déracine avant de bouger
        crate::essaim::uproot(w, s, true);
        return false;
    }
    if w.units.cold[s].deployed {
        // une unité déployée se replie avant de bouger
        w.units.cold[s].deployed = false;
        w.units.cold[s].timer = 0;
    }
    let mut heading = w.trig.atan2((ty - y) as i64, (tx - x) as i64);
    // l'unité suit un champ de flux valide (chemin connu, éventuellement un long détour)
    let mut following = false;
    if legged(kind) && w.units.cold[s].wtarget[0] == NONE {
        // le haut du corps se tourne vers la destination pendant que les jambes suivent le chemin
        // (en combat, la visée de l'arme prend le relais : voir combat::unit_weapons)
        w.units.cold[s].turret = w.trig.atan2((gy - y) as i64, (gx - x) as i64);
    }
    if let Some(class) = move_class(def.layer) {
        // le champ de flux mène au but du groupe ; une unité dont la place est loin de ce but (grand
        // groupe, formation) la rejoint en ligne droite dès qu'elle en est aussi près que sa place,
        // sinon elle tournerait autour du but du groupe sans jamais atteindre sa place
        // En formation, l'unité lit le champ là où serait le but du groupe si elle était à sa place
        // (sa position moins son écart dans la formation) : elle suit un chemin parallèle à celui du
        // centre du groupe, et le groupe garde sa disposition en route au lieu de se resserrer sur le
        // chemin le plus court. Bloquée (passage étroit) ou hors du champ, elle lit sa propre case.
        let far = d > 5 * TILE && (form || (tx == gx && ty == gy) || dist(x, y, gx, gy) > dist(tx, ty, gx, gy) + 5 * TILE);
        if far {
            if w.units.cold[s].goal == 0 {
                let key = flow::acquire_goal(w, class, gx / TILE, gy / TILE);
                w.units.cold[s].goal = key;
            }
            let key = w.units.cold[s].goal;
            let (vx, vy) = (x - (tx - gx), y - (ty - gy));
            let mut cell = (NO_DIR, 0);
            if form && w.units.cold[s].stuck < 10 && (vx, vy) != (x, y) {
                cell = flow::flow_cell(w, key, vx.div_euclid(TILE), vy.div_euclid(TILE));
            }
            if cell.0 == NO_DIR {
                cell = flow::flow_cell(w, key, x / TILE, y / TILE);
            }
            let (fd, fan) = cell;
            if fd != NO_DIR && fd != AT_GOAL {
                // le champ ne connaît que 8 directions ; si la ligne droite vers la destination passe
                // entre deux directions qui sont toutes deux sur un plus court chemin, l'unité la suit
                // (sinon elle avancerait en escalier, d'abord en diagonale puis tout droit)
                let fh = (fd as u16).wrapping_mul(8192);
                let diff = angle_diff(heading, fh);
                let side = if diff > 0 { (fd + 1) & 7 } else { (fd + 7) & 7 };
                if !(diff.abs() <= 8192 && fan & (1 << fd) != 0 && fan & (1 << side) != 0) {
                    heading = fh;
                }
                following = true;
            }
        }
    }
    // une bête qui charge sa proie court plus vite ; en formation, l'allure du groupe (`cap`)
    // sur le terreau de la Souche, plus lente (ennemie) ou plus rapide (organisme chez lui)
    let speed = crate::essaim::speed(w, s, crate::nature::charge_speed(w, s, crate::ameliorations::speed(w, s))).min(cap.max(1));
    let f = w.units.facing[s];
    let nf = turn_towards(f, heading, turn_rate(kind));
    w.units.facing[s] = nf;
    let diff = angle_diff(heading, nf).abs();
    let mut sp = if fixed_wing(kind) {
        speed
    } else if legged(kind) {
        // une unité à pattes ne s'arrête jamais pour tourner : elle ralentit dans les virages serrés
        if diff < 6000 {
            speed
        } else {
            speed / 2
        }
    } else if diff < 6000 {
        speed
    } else if diff < 14000 {
        speed / 2
    } else {
        0
    };
    if !fixed_wing(kind) && d < sp {
        sp = d;
    }
    if sp > 0 {
        let vx = (w.trig.cos(nf) as i64 * sp as i64 / 16384) as i32;
        let vy = (w.trig.sin(nf) as i64 * sp as i64 / 16384) as i32;
        try_move(w, s, vx, vy);
    }
    // détection de blocage : `stuck` compte les ticks sans mouvement réel,
    // `noprog` les ticks sans rapprochement du but (foule autour du point d'arrivée)
    let moved = (w.units.x[s] - x).abs() + (w.units.y[s] - y).abs();
    let nd = dist(w.units.x[s], w.units.y[s], tx, ty);
    let c = &mut w.units.cold[s];
    if moved * 4 < speed {
        c.stuck = c.stuck.saturating_add(1);
    } else {
        c.stuck = c.stuck.saturating_sub(2);
    }
    if nd + 16.min(speed / 2) < c.best_dist {
        c.best_dist = nd;
        c.noprog = 0;
    } else if following && moved * 4 >= speed && nd > stop + 6 * TILE {
        // détour le long du champ de flux (contournement d'un lac, d'une falaise) : l'unité avance,
        // même si elle s'éloigne du but à vol d'oiseau ; ce n'est pas une absence de progrès
    } else {
        c.noprog = c.noprog.saturating_add(1);
    }
    if fixed_wing(kind) {
        return nd <= stop.max(2 * TILE);
    }
    // arrivé si on piétine près du but (groupes), ou si bloqué longtemps
    (c.noprog > patience && nd < stop + 6 * TILE) || c.stuck > 120 || c.noprog > 1200
}

fn try_move(w: &mut World, s: usize, vx: i32, vy: i32) {
    let layer = udef(w.units.kind[s]).layer;
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let mx = w.map.w * TILE - 1;
    let my = w.map.h * TILE - 1;
    let (nx, ny) = ((x + vx).clamp(0, mx), (y + vy).clamp(0, my));
    if layer == Layer::Air {
        w.units.x[s] = nx;
        w.units.y[s] = ny;
        return;
    }
    let m = pass_mask(layer);
    let cur_ok = w.map.passable(x / TILE, y / TILE, m);
    if w.map.passable(nx / TILE, ny / TILE, m) || !cur_ok {
        w.units.x[s] = nx;
        w.units.y[s] = ny;
    } else if w.map.passable(nx / TILE, y / TILE, m) {
        w.units.x[s] = nx;
    } else if w.map.passable(x / TILE, ny / TILE, m) {
        w.units.y[s] = ny;
    }
}

/// Oublie le champ de flux de l'unité s'il mène ailleurs qu'en (tx, ty) (à plus de 6 cases).
fn retarget(w: &mut World, s: usize, tx: i32, ty: i32) {
    let g = w.units.cold[s].goal;
    if g != 0 {
        let gt = (g & 0xffff_ffff) as i32;
        if ((gt % w.map.w) - tx / TILE).abs() + ((gt / w.map.w) - ty / TILE).abs() > 6 {
            clear_goal(w, s);
        }
    }
}

/// Chargement avant un chantier hors de portée des dépôts (`UnitCold::supply_at`, décidé par
/// drones::plan) : l'unité va au dépôt, à moins de la moitié de son rayon de ravitaillement, puis y
/// attend que ses drones remplissent sa soute. Faux s'il n'y a pas de chargement à faire.
fn supply_detour(w: &mut World, s: usize) -> bool {
    let Some(d) = crate::drones::Store::resolve(w, w.units.cold[s].supply_at) else { return false };
    let (dx, dy) = d.pos(w);
    let r = udef(w.units.kind[s]).supply * TILE / 2;
    if dist(w.units.x[s], w.units.y[s], dx, dy) > r {
        retarget(w, s, dx, dy);
        steer(w, s, dx, dy, dx, dy, r - TILE);
        w.units.cold[s].stuck = 0;
    } else {
        clear_goal(w, s);
    }
    true
}

/// Puissance de construction effective.
fn build_power(w: &World, s: usize) -> u64 {
    let bp = udef(w.units.kind[s]).build_power as u64;
    bp * w.players[w.units.owner[s] as usize].build_mult as u64 / 100
}

/// Fait progresser la construction du bâtiment `b`. Renvoie faux si le chantier est terminé.
pub fn construct(w: &mut World, s: usize, b: usize) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive {
        return false;
    }
    let def = bb.def();
    let owner = w.units.owner[s] as usize;
    if bb.complete() {
        if bb.hp < def.hp {
            // réparation
            let bp = build_power(w, s) as i32;
            let bb = &mut w.buildings[b];
            bb.hp = (bb.hp + (def.hp / (def.build as i32 * 4).max(4)).max(1) * bp / 10).min(def.hp);
            w.units.cold[s].flags |= UF_WORKING;
            return true;
        }
        return false;
    }
    let work = def.build as u64 * 20 * 10;
    let delta = (build_power(w, s) * BUILD_FULL as u64 / work).max(1) as u32;
    let p2 = (bb.build + delta).min(BUILD_FULL);
    let mut need = [0i32; 4];
    for (k, &(it, n)) in def.cost.iter().enumerate() {
        let total = (n as u64 * p2 as u64).div_ceil(BUILD_FULL as u64) as i32;
        need[k] = total - bb.paid[k] as i32;
        // payé depuis la soute du constructeur, que ses drones remplissent (voir drones.rs)
        if (crate::drones::has(&w.units.cold[s].hold, it) as i32) < need[k] {
            w.buildings[b].stalled = true;
            return true;
        }
    }
    for (k, &(it, _)) in def.cost.iter().enumerate() {
        crate::drones::take(&mut w.units.cold[s].hold, it, need[k].max(0) as u16);
        w.players[owner].consumed[it as usize] += need[k] as u32;
        w.buildings[b].paid[k] += need[k] as u16;
    }
    let bb = &mut w.buildings[b];
    bb.stalled = false;
    bb.hp = (bb.hp + crate::buildings::site_hp_gain(def.hp, bb.build, p2)).min(def.hp);
    bb.build = p2;
    w.units.cold[s].flags |= UF_WORKING;
    if p2 >= BUILD_FULL {
        buildings::complete_building(w, b);
        return false;
    }
    true
}

fn reclaim_wreck(w: &mut World, s: usize, wk: usize) -> bool {
    let bp = build_power(w, s) as i32;
    let amount = (bp / 5).max(1);
    // dans la soute de l'ingénieur, dans la limite de sa place (ses drones la vident dans un dépôt)
    let room = crate::drones::hold_room(w, s, IRON_PLATE) as i32;
    if room == 0 {
        // soute pleine (ou pas de soute) : le recyclage s'arrête
        return false;
    }
    let amount = amount.min(room);
    let wr = &mut w.wrecks[wk];
    let take_iron = amount.min(wr.iron);
    wr.iron -= take_iron;
    let take_steel = (amount - take_iron).min(wr.steel);
    wr.steel -= take_steel;
    let empty = wr.iron <= 0 && wr.steel <= 0;
    crate::drones::put(&mut w.units.cold[s].hold, IRON_PLATE, take_iron.max(0) as u16);
    crate::drones::put(&mut w.units.cold[s].hold, STEEL, take_steel.max(0) as u16);
    w.units.cold[s].flags |= UF_WORKING;
    if empty {
        w.wrecks[wk].alive = false;
        w.wfree.push(wk as u32);
        return false;
    }
    true
}

fn deconstruct(w: &mut World, s: usize, b: usize) -> bool {
    let def = w.buildings[b].def();
    let owner = w.buildings[b].owner as usize;
    let work = def.build as u64 * 20 * 10;
    let delta = (build_power(w, s) * 2 * BUILD_FULL as u64 / work).max(1) as u32;
    let bb = &mut w.buildings[b];
    let p2 = bb.build.saturating_sub(delta);
    // ce qui est récupéré va dans la soute de l'ingénieur, sans plafond (remboursement)
    let mut back = [(0u8, 0u16); 4];
    for (k, &(it, n)) in def.cost.iter().enumerate() {
        let total = (n as u64 * p2 as u64).div_ceil(BUILD_FULL as u64) as u16;
        let refund = bb.paid[k].saturating_sub(total);
        bb.paid[k] -= refund;
        back[k] = (it, refund);
    }
    for (it, n) in back {
        crate::drones::put(&mut w.units.cold[s].hold, it, n);
    }
    let bb = &mut w.buildings[b];
    bb.build = p2;
    w.units.cold[s].flags |= UF_WORKING;
    if p2 == 0 {
        // fragments d'énergie installés : rendus au joueur
        let shards = bb.shards as u32;
        bb.shards = 0;
        let eppz = (bb.kind == B_EPPZ_SOCKET) as u32;
        // rendre aussi le contenu
        let inv = bb.inv;
        let out = bb.out;
        let _ = (inv, out);
        w.players[owner].shards += shards;
        w.players[owner].eppz += eppz;
        // dépôt démonté : son stock part au dépôt le plus proche (remboursement)
        let stash = if crate::drones::is_store(&w.buildings[b]) { std::mem::take(&mut w.buildings[b].stash) } else { Vec::new() };
        let (bx, by) = w.buildings[b].center();
        buildings::remove_building(w, b, false);
        for (it, &n) in stash.iter().enumerate() {
            crate::drones::refund(w, owner as u8, bx, by, it as u8, n as u32);
        }
        return false;
    }
    if bb.build < BUILD_FULL && bb.def().class == BClass::Belt && bb.line != NONE {
        let (x, y) = (bb.x, bb.y);
        crate::belts::rebuild_around(w, &[(x, y)]);
    }
    true
}

#[cfg(test)]
thread_local! {
    pub static PROF: std::cell::RefCell<[f64; 4]> = const { std::cell::RefCell::new([0.0; 4]) };
}
#[cfg(test)]
#[allow(clippy::disallowed_types, clippy::float_arithmetic)]
fn prof_add(i: usize, t0: std::time::Instant) {
    PROF.with(|p| p.borrow_mut()[i] += t0.elapsed().as_secs_f64() * 1000.0);
}
#[cfg(test)]
#[allow(clippy::disallowed_types)]
fn prof_now() -> std::time::Instant {
    std::time::Instant::now()
}
#[cfg(not(test))]
#[inline(always)]
fn prof_now() -> u8 {
    0
}
#[cfg(not(test))]
#[inline(always)]
fn prof_add(_i: usize, _t: u8) {}

pub fn update_units(w: &mut World) {
    let t_sep = prof_now();
    let n = w.units.alive.len();
    // poussées de séparation (calculées puis appliquées)
    let mut push: Vec<(i32, i32)> = vec![(0, 0); n];
    for s in 0..n {
        if !w.units.alive[s] || w.units.cold[s].carried_by != NONE {
            continue;
        }
        let k = w.units.kind[s];
        // séparation un tick sur deux (poussée doublée), jamais pour les avions à voilure fixe ni les œufs
        // (immobiles : ce sont les autres qui s'en écartent)
        // (ni une tourelle d'Arche déployée, ni un fouisseur enterré : on lui marche dessus)
        let fixed = crate::ponte::is_egg(k) || crate::essaim::buried(w, s) || (w.units.cold[s].deployed && crate::ameliorations::is_turret(k));
        if fixed_wing(k) || fixed || (w.tick + s as u32) & 1 == 1 {
            continue;
        }
        let def = udef(k);
        let air = def.layer == Layer::Air;
        let (x, y, r) = (w.units.x[s], w.units.y[s], def.radius);
        let moving = !w.units.cold[s].orders.is_empty();
        let big = r > 500;
        let mut px = 0i64;
        let mut py = 0i64;
        let units = &w.units;
        w.grid.fine.query(x, y, r + 200, |o| {
            if o == s || (units.kind[o] == U_BURROWER && units.cold[o].deployed) {
                return;
            }
            let od = udef(units.kind[o]);
            if (od.layer == Layer::Air) != air {
                return;
            }
            let rr = r + od.radius;
            let dx = (x - units.x[o]) as i64;
            let dy = (y - units.y[o]) as i64;
            let d2 = dx * dx + dy * dy;
            if d2 >= (rr as i64) * (rr as i64) {
                return;
            }
            if od.radius > 500 && !big {
                return; // poussé par le gros
            }
            let d = crate::fixed::isqrt(d2 as u64) as i64;
            let overlap = rr as i64 - d;
            let (ux, uy) = if d == 0 { (if s < o { -1 } else { 1 }, 0) } else { (dx * 64 / d, dy * 64 / d) };
            let f = if moving { 6 } else { 8 };
            px += ux * overlap * f / (64 * 8);
            py += uy * overlap * f / (64 * 8);
        });
        push[s].0 += px as i32;
        push[s].1 += py as i32;
        if big {
            let units = &w.units;
            let mut extra: Vec<(usize, i32, i32)> = Vec::new();
            w.grid.fine.query(x, y, r + 320, |o| {
                if o == s || (udef(units.kind[o]).layer == Layer::Air) != air || udef(units.kind[o]).radius > 500 {
                    return;
                }
                let rr = r + udef(units.kind[o]).radius;
                let dx = (units.x[o] - x) as i64;
                let dy = (units.y[o] - y) as i64;
                let d2 = dx * dx + dy * dy;
                if d2 < (rr as i64) * (rr as i64) {
                    let d = crate::fixed::isqrt(d2 as u64).max(1) as i64;
                    let overlap = rr as i64 - d;
                    extra.push((o, (dx * overlap / d / 2) as i32, (dy * overlap / d / 2) as i32));
                }
            });
            for (o, ex, ey) in extra {
                push[o].0 += ex;
                push[o].1 += ey;
            }
        }
    }
    prof_add(0, t_sep);
    for s in 0..n {
        if !w.units.alive[s] {
            continue;
        }
        w.units.px[s] = w.units.x[s];
        w.units.py[s] = w.units.y[s];
        let carrier = w.units.cold[s].carried_by;
        if carrier != NONE {
            if let Some(c) = w.unit(carrier) {
                w.units.x[s] = w.units.x[c];
                w.units.y[s] = w.units.y[c];
                w.units.px[s] = w.units.px[c];
                w.units.py[s] = w.units.py[c];
            }
            continue;
        }
        w.units.cold[s].flags = 0;
        // œuf de la Souche : immobile et inerte, il éclot à son heure (voir ponte.rs)
        if crate::ponte::is_egg(w.units.kind[s]) {
            crate::ponte::tick_egg(w, s);
            continue;
        }
        if w.units.cold[s].stun > 0 {
            w.units.cold[s].stun -= 1;
            continue;
        }
        let kind = w.units.kind[s];
        let def = udef(kind);
        // amélioration des Transhumants en cours d'installation
        if w.units.cold[s].mod_job != 0 {
            crate::ameliorations::tick_job(w, crate::ameliorations::Host::U(s));
        }
        // boucliers
        {
            let shield_max = crate::ameliorations::unit_shield(w, s).1;
            let c = &mut w.units.cold[s];
            let max = if kind == U_COMMANDER { if w.players[w.units.owner[s] as usize].has_tech(T_CMD_SHIELD) { 4000 } else { 0 } } else { shield_max };
            if max > 0 {
                if c.shield_down > 0 {
                    c.shield_down -= 1;
                    if c.shield_down == 0 {
                        c.shield = max / 4;
                    }
                } else {
                    c.shield = (c.shield + (max / 600).max(1)).min(max);
                }
            }
        }
        // chenillard des Transhumants : déploiement ou repli en cours
        // (Reine de la Souche : elle s'enracine ou se déracine)
        if w.units.cold[s].pack != 0 && if kind == U_QUEEN { crate::essaim::tick_queen(w, s) } else { crate::transhumants::tick_unit(w, s) } {
            continue;
        }
        let t_ord = prof_now();
        let forced = run_order(w, s);
        prof_add(1, t_ord);
        let t_w = prof_now();
        crate::combat::unit_weapons(w, s, forced);
        prof_add(2, t_w);
        special(w, s);
        // séparation
        let (dx, dy) = push[s];
        if (dx != 0 || dy != 0) && !crate::essaim::rooted(w, s) {
            let dx = dx.clamp(-60, 60);
            let dy = dy.clamp(-60, 60);
            try_move(w, s, dx, dy);
        }
        // sortir d'une case bloquée (bâtiment posé dessus)
        if def.layer != Layer::Air {
            let m = pass_mask(def.layer);
            let (x, y) = (w.units.x[s], w.units.y[s]);
            if !w.map.passable(x / TILE, y / TILE, m) {
                let (fx, fy) = buildings::free_spot_near(w, x, y, m);
                let ddx = (fx - x).clamp(-64, 64);
                let ddy = (fy - y).clamp(-64, 64);
                w.units.x[s] = x + ddx;
                w.units.y[s] = y + ddy;
            }
            if w.units.cold[s].warp > 0 {
                w.units.cold[s].warp -= 1;
            } else {
                gate_check(w, s);
            }
        }
    }
}

/// Exécute l'ordre courant. Renvoie la cible imposée aux armes (ou NONE).
fn run_order(w: &mut World, s: usize) -> u32 {
    let Some(&o) = w.units.cold[s].orders.first() else {
        idle(w, s);
        return NONE;
    };
    let kind = w.units.kind[s];
    let def = udef(kind);
    let owner = w.units.owner[s];
    match o {
        Order::Move { x, y, gx, gy, attack, eta } => {
            if attack && has_target_in_range(w, s) && !fixed_wing(kind) {
                return NONE;
            }
            let cap = formation_pace(w, s, x, y, eta);
            // en formation, chacun va jusqu'à sa place (le groupe garde sa forme), quitte à attendre
            // qu'un voisin qui croise son chemin se dégage ; sinon on s'arrête dès qu'on touche sa
            // place, et on renonce vite si la foule bloque, pour ne pas se bousculer autour d'un but commun
            let (stop, patience) = if eta != 0 { (TILE / 4, 100) } else { (def.radius + TILE / 2, 20) };
            if steer_paced(w, s, x, y, gx, gy, stop, cap, patience, eta != 0) {
                chain_eta(w, s);
                pop_order(w, s);
            }
            NONE
        }
        Order::Patrol { x, y, ox, oy } => {
            if has_target_in_range(w, s) && !fixed_wing(kind) {
                return NONE;
            }
            if steer(w, s, x, y, x, y, def.radius + TILE) {
                clear_goal(w, s);
                let c = &mut w.units.cold[s];
                c.orders[0] = Order::Patrol { x: ox, y: oy, ox: x, oy: y };
                c.stuck = 0;
                c.best_dist = i32::MAX;
            }
            NONE
        }
        Order::Attack { target } => {
            let Some((tx, ty)) = w.ref_pos(target) else {
                pop_order(w, s);
                return NONE;
            };
            if w.wreck(target).is_some() {
                pop_order(w, s);
                return NONE;
            }
            let range = crate::ameliorations::attack_range(w, s, target) * TILE;
            let d = dist(w.units.x[s], w.units.y[s], tx, ty);
            if fixed_wing(kind) {
                steer(w, s, tx, ty, tx, ty, 0);
            } else if d > range * 9 / 10 {
                // relancer le but si la cible s'est éloignée
                let g = w.units.cold[s].goal;
                if g != 0 {
                    let gt = (g & 0xffff_ffff) as i32;
                    let (gx, gy) = (gt % w.map.w, gt / w.map.w);
                    if (gx - tx / TILE).abs() + (gy - ty / TILE).abs() > 6 {
                        clear_goal(w, s);
                    }
                }
                steer(w, s, tx, ty, tx, ty, range * 8 / 10);
                w.units.cold[s].stuck = 0;
            }
            target
        }
        Order::AttackGround { x, y } => {
            let range = crate::ameliorations::attack_range(w, s, NONE) * TILE;
            let d = dist(w.units.x[s], w.units.y[s], x, y);
            if fixed_wing(kind) {
                steer(w, s, x, y, x, y, 0);
            } else if d > range * 9 / 10 {
                steer(w, s, x, y, x, y, range * 8 / 10);
                w.units.cold[s].stuck = 0;
            }
            // cible au sol : encodée comme case
            0x8000_0000 | ((y / TILE) as u32) << 12 | (x / TILE) as u32
        }
        Order::Build { kind: bk, x, y, dir, bid } => {
            if def.build_power == 0 {
                pop_order(w, s);
                return NONE;
            }
            if let Some(b) = w.building(bid) {
                // Souche : l'organe planté pousse seul, le semeur repart
                if !w.buildings[b].complete() && w.buildings[b].def().race == RACE_SOUCHE {
                    pop_order(w, s);
                    return NONE;
                }
                // chantier posé : ce qui manque aux environs se charge d'abord ; puis à portée
                if !w.buildings[b].complete() && supply_detour(w, s) {
                    return NONE;
                }
                let (cx, cy) = w.buildings[b].center();
                let range = build_range(w.buildings[b].kind, w.buildings[b].dir);
                if dist(w.units.x[s], w.units.y[s], cx, cy) > range {
                    retarget(w, s, cx, cy);
                    steer(w, s, cx, cy, cx, cy, range - TILE);
                    return NONE;
                }
                if !construct(w, s, b) {
                    pop_order(w, s);
                }
                return NONE;
            }
            if bid != 0 && bid != NONE {
                // chantier détruit
                pop_order(w, s);
                return NONE;
            }
            let (bw, bh) = dims(bk, dir);
            let cx = x * TILE + bw * TILE / 2;
            let cy = y * TILE + bh * TILE / 2;
            let range = build_range(bk, dir);
            if dist(w.units.x[s], w.units.y[s], cx, cy) > range {
                // chantier hors de portée des dépôts : charger d'abord la soute
                if supply_detour(w, s) {
                    return NONE;
                }
                retarget(w, s, cx, cy);
                if steer(w, s, cx, cy, cx, cy, range - TILE) && w.units.cold[s].stuck > 100 {
                    pop_order(w, s);
                }
                return NONE;
            }
            clear_goal(w, s);
            // bâtiment identique déjà en chantier à cet endroit ?
            if w.map.inside(x, y) {
                let o = w.map.occ_floor(w.map.idx(x, y), buildings::floor_of(dir));
                if o != 0 {
                    let b = (o - 1) as usize;
                    let bb = &w.buildings[b];
                    if bb.kind == bk && bb.x == x && bb.y == y && w.team_of(bb.owner) == w.team_of(owner) && !bb.complete() {
                        let r = w.building_ref(b);
                        w.units.cold[s].orders[0] = Order::Build { kind: bk, x, y, dir, bid: r };
                        return NONE;
                    }
                }
            }
            // pose avec remplacement : tapis réorienté sur place, ou tapis démontés avant le chantier
            if let Some(b) = buildings::clear_for_replace(w, owner, bk, x, y, dir) {
                let r = w.building_ref(b);
                w.units.cold[s].orders[0] = Order::Build { kind: bk, x, y, dir, bid: r };
                return NONE;
            }
            match buildings::place_building(w, owner, bk, x, y, dir) {
                Some(b) => {
                    let r = w.building_ref(b);
                    w.units.cold[s].orders[0] = Order::Build { kind: bk, x, y, dir, bid: r };
                }
                None => pop_order(w, s),
            }
            NONE
        }
        Order::Assist { target } => {
            if let Some(b) = w.building(target) {
                let range = build_range(w.buildings[b].kind, w.buildings[b].dir);
                let (cx, cy) = w.buildings[b].center();
                // un organe de la Souche pousse seul : on ne l'aide pas, on le soigne une fois poussé
                let growing = !w.buildings[b].complete() && w.buildings[b].def().race == RACE_SOUCHE;
                if w.team_of(w.buildings[b].owner) != w.team_of(owner) || def.build_power == 0 || growing {
                    pop_order(w, s);
                    return NONE;
                }
                if !w.buildings[b].complete() && supply_detour(w, s) {
                    return NONE;
                }
                if dist(w.units.x[s], w.units.y[s], cx, cy) > range {
                    retarget(w, s, cx, cy);
                    steer(w, s, cx, cy, cx, cy, range - TILE);
                    return NONE;
                }
                clear_goal(w, s);
                if !construct(w, s, b) {
                    pop_order(w, s);
                }
                return NONE;
            }
            if let Some(t) = w.unit(target) {
                // escorte
                let (tx, ty) = (w.units.x[t], w.units.y[t]);
                let d = dist(w.units.x[s], w.units.y[s], tx, ty);
                if d > 7 * TILE {
                    let g = w.units.cold[s].goal;
                    if g != 0 {
                        let gt = (g & 0xffff_ffff) as i32;
                        if ((gt % w.map.w) - tx / TILE).abs() + ((gt / w.map.w) - ty / TILE).abs() > 6 {
                            clear_goal(w, s);
                        }
                    }
                    steer(w, s, tx, ty, tx, ty, 5 * TILE);
                    w.units.cold[s].stuck = 0;
                } else if def.build_power > 0 && w.units.hp[t] < w.max_hp(t) && w.team_of(w.units.owner[t]) == w.team_of(owner) {
                    let bp = build_power(w, s) as i32;
                    let max = w.max_hp(t);
                    w.units.hp[t] = (w.units.hp[t] + (max / 400).max(1) * bp / 10).min(max);
                    w.units.cold[s].flags |= UF_WORKING;
                }
                return NONE;
            }
            pop_order(w, s);
            NONE
        }
        Order::Reclaim { target } => {
            if def.build_power == 0 {
                pop_order(w, s);
                return NONE;
            }
            let pos = w.ref_pos(target);
            let Some((tx, ty)) = pos else {
                pop_order(w, s);
                return NONE;
            };
            let range = 6 * TILE;
            if dist(w.units.x[s], w.units.y[s], tx, ty) > range {
                steer(w, s, tx, ty, tx, ty, range - TILE);
                return NONE;
            }
            clear_goal(w, s);
            let cont = if let Some(wk) = w.wreck(target) {
                reclaim_wreck(w, s, wk)
            } else if let Some(b) = w.building(target) {
                if w.buildings[b].owner == owner {
                    deconstruct(w, s, b)
                } else {
                    false
                }
            } else {
                false
            };
            if !cont {
                pop_order(w, s);
            }
            NONE
        }
        Order::Collect { target } => {
            // commandant posté près d'un de nos tapis : chaque objet qui passe sur cette case va dans sa soute
            let Some(b) = w.building(target) else {
                pop_order(w, s);
                return NONE;
            };
            if w.buildings[b].owner != owner || w.buildings[b].def().class != BClass::Belt {
                pop_order(w, s);
                return NONE;
            }
            let (tx, ty) = w.buildings[b].center();
            let range = COLLECT_RANGE;
            if dist(w.units.x[s], w.units.y[s], tx, ty) > range {
                steer(w, s, tx, ty, tx, ty, range - TILE);
                return NONE;
            }
            clear_goal(w, s);
            // dans la limite de la soute (ses drones la vident dans un dépôt)
            let room: Vec<bool> = (0..NUM_ITEMS).map(|it| crate::drones::hold_room(w, s, it as u8) > 0).collect();
            if !room.iter().skip(1).any(|&r| r) {
                return NONE;
            }
            let it = crate::belts::take_from_belt(w, b, &|it| room[it as usize]);
            if it != 0 {
                crate::drones::put(&mut w.units.cold[s].hold, it, 1);
                w.units.cold[s].flags |= UF_WORKING;
            }
            NONE
        }
        Order::DeployAt { x, y, dir } => {
            crate::transhumants::deploy_at(w, s, x, y, dir);
            NONE
        }
        Order::Pickup { target } => {
            // constructeur posté près d'un de nos extracteurs ou fabricants : ce qui attend dans sa
            // sortie va dans sa soute, à mesure que ça sort
            let b = match w.building(target) {
                Some(b) if def.hold > 0 && pickup_ok(w, owner, b) => b,
                _ => {
                    pop_order(w, s);
                    return NONE;
                }
            };
            let (near, tx, ty, reach) = near_building(w, s, b, PICKUP_RANGE);
            if !near {
                w.units.cold[s].timer = PK_GOING;
                steer(w, s, tx, ty, tx, ty, reach - TILE);
                return NONE;
            }
            clear_goal(w, s);
            // place pour le produit de sa sortie (soute du commandant : 600 par objet ; d'un ingénieur : au total)
            let it = buildings::output_of(&w.buildings[b]);
            let room = if it != 0 { crate::drones::hold_room(w, s, it) } else { 1 };
            if room > 0 {
                w.units.cold[s].timer = PK_WORKING;
                if it != 0 {
                    let k = (w.buildings[b].out as u32).min(room) as u16;
                    w.buildings[b].out -= k;
                    w.buildings[b].wake = 0;
                    crate::drones::put(&mut w.units.cold[s].hold, it, k);
                    w.units.cold[s].flags |= UF_WORKING;
                }
                return NONE;
            }
            // soute pleine : les drones d'un ingénieur la vident au dépôt qui a de la place, à toute distance ;
            // celle du commandant est un dépôt, qu'il ne vide pas : il attend (le reste attend en sortie)
            w.units.cold[s].timer = if crate::drones::will_unload(w, s) { PK_FULL } else { PK_STUCK };
            NONE
        }
        Order::Deliver { item } => {
            // porter un objet de la soute (0 : toute la soute) au dépôt le plus proche qui a de la place
            let Some((first, st)) = (if def.hold > 0 { crate::drones::deliver_target(w, s, item) } else { None }) else {
                // aucun dépôt n'a de place pour ce qu'il porte (une demande explicite le signale)
                if item != 0 && crate::drones::has(&w.units.cold[s].hold, item) > 0 {
                    w.ev(crate::drones::EV_NO_DEPOT, owner as i32, w.units.x[s], w.units.y[s], item as i32);
                }
                pop_order(w, s);
                return NONE;
            };
            // à 3 cases du bord du dépôt (ou du commandant, dont la soute est un dépôt)
            let (tx, ty) = st.pos(w);
            let reach = DELIVER_RANGE
                + match st {
                    crate::drones::Store::B(b) => {
                        let (bw, bh) = w.buildings[b].size();
                        bw.max(bh) * TILE / 2
                    }
                    crate::drones::Store::U(u) => udef(w.units.kind[u]).radius,
                };
            if dist(w.units.x[s], w.units.y[s], tx, ty) > reach {
                steer(w, s, tx, ty, tx, ty, reach - TILE);
                return NONE;
            }
            clear_goal(w, s);
            // dépose tout ce que ce dépôt peut prendre ; le reste ira au suivant (tick d'après)
            let items: Vec<u8> = if item != 0 { vec![item] } else { (first..NUM_ITEMS as u8).collect() };
            for it in items {
                let k = crate::drones::has(&w.units.cold[s].hold, it).min(st.room(w, it));
                if k > 0 {
                    crate::drones::take(&mut w.units.cold[s].hold, it, k);
                    st.put(w, it, k);
                    w.units.cold[s].flags |= UF_WORKING;
                }
            }
            let hold = &w.units.cold[s].hold;
            let left = if item != 0 { crate::drones::has(hold, item) as u32 } else { crate::drones::total(hold) };
            if left == 0 {
                pop_order(w, s);
            }
            NONE
        }
        Order::Haul { site, feed } => {
            crate::transhumants::haul_step(w, s, site, feed);
            NONE
        }
        Order::Tame { target } => {
            crate::souche::tame_step(w, s, target);
            NONE
        }
        Order::Harvest { x, y } => {
            // commandant : extraire le minerai du gisement et le fondre dans sa fonderie intégrée
            let Some(r) = (if kind == U_COMMANDER { harvest_recipe(w, owner, x, y) } else { None }) else {
                pop_order(w, s);
                return NONE;
            };
            let (tx, ty) = (x * TILE + TILE / 2, y * TILE + TILE / 2);
            if dist(w.units.x[s], w.units.y[s], tx, ty) > HARVEST_RANGE {
                w.units.cold[s].timer = HV_GOING;
                steer(w, s, tx, ty, tx, ty, HARVEST_RANGE - TILE);
                return NONE;
            }
            clear_goal(w, s);
            // combat : tant que son canon a une cible, la récolte attend (l'ordre reste)
            if has_target_in_range(w, s) {
                w.units.cold[s].timer = HV_COMBAT;
                return NONE;
            }
            let (out, n) = RECIPES[r].output;
            let o = owner as usize;
            // soute pleine : la récolte attend que les drones la vident dans un dépôt
            if crate::drones::hold_room(w, s, out) < n as u32 {
                w.units.cold[s].timer = HV_FULL;
                return NONE;
            }
            // pureté du gisement récolté
            let mult = w.players[o].res_mult.max(1) as u32 * w.map.purity_under(x, y, 1, 1) / 100;
            let need = harvest_cycle(r) * 100;
            let c = &mut w.units.cold[s];
            c.timer = HV_WORKING;
            c.flags |= UF_WORKING;
            c.work += mult;
            if c.work >= need {
                c.work -= need;
                crate::drones::put(&mut c.hold, out, n as u16);
                w.players[o].produced[out as usize] += n as u32;
            }
            NONE
        }
        Order::Load { target } => {
            let Some(t) = w.unit(target) else {
                pop_order(w, s);
                return NONE;
            };
            let (tx, ty) = (w.units.x[t], w.units.y[t]);
            if dist(w.units.x[s], w.units.y[s], tx, ty) > 2 * TILE + def.radius {
                steer(w, s, tx, ty, tx, ty, TILE);
                w.units.cold[s].stuck = 0;
                return NONE;
            }
            load_unit(w, s, t);
            pop_order(w, s);
            NONE
        }
        Order::Face { a } => {
            // les avions à voilure fixe ne s'arrêtent pas pour s'orienter
            if fixed_wing(kind) {
                pop_order(w, s);
                return NONE;
            }
            let a = a as u16;
            let nf = turn_towards(w.units.facing[s], a, turn_rate(kind));
            w.units.facing[s] = nf;
            if nf == a {
                pop_order(w, s);
            }
            NONE
        }
        Order::Enter { target } => {
            let Some(t) = w.unit(target) else {
                pop_order(w, s);
                return NONE;
            };
            let (tx, ty) = (w.units.x[t], w.units.y[t]);
            if dist(w.units.x[s], w.units.y[s], tx, ty) > 2 * TILE + udef(w.units.kind[t]).radius {
                steer(w, s, tx, ty, tx, ty, TILE);
                w.units.cold[s].stuck = 0;
                return NONE;
            }
            pop_order(w, s);
            load_unit(w, t, s);
            NONE
        }
        Order::Unload { x, y } => {
            if steer(w, s, x, y, x, y, TILE) || dist(w.units.x[s], w.units.y[s], x, y) < 2 * TILE {
                unload_all(w, s);
                pop_order(w, s);
            }
            NONE
        }
        Order::Ferry { ax, ay, bx, by } => {
            ferry_step(w, s, ax, ay, bx, by);
            NONE
        }
        Order::Teleport { x, y } => {
            let p = &w.players[owner as usize];
            if kind != U_COMMANDER || !p.has_tech(T_CMD_TELEPORT) || w.tick < w.units.cold[s].ready_tick {
                pop_order(w, s);
                return NONE;
            }
            let c = &mut w.units.cold[s];
            c.timer += 1;
            c.flags |= UF_CHARGING;
            if c.timer >= 100 {
                let (fx, fy) = buildings::free_spot_near(w, x, y, P_LAND);
                let (ox, oy) = (w.units.x[s], w.units.y[s]);
                w.ev(EV_TELEPORT, ox, oy, fx, fy);
                w.units.x[s] = fx;
                w.units.y[s] = fy;
                w.units.px[s] = fx;
                w.units.py[s] = fy;
                w.units.cold[s].ready_tick = w.tick + 1200;
                pop_order(w, s);
            }
            NONE
        }
        Order::Jump { beacon } => {
            let Some(b) = w.building(beacon) else {
                pop_order(w, s);
                return NONE;
            };
            // seulement vers une de nos balises d'hyperespace, terminée et alimentée (`working`)
            let bb = &w.buildings[b];
            if kind != U_HYPER || bb.owner != owner || !bb.complete() || bb.def().class != BClass::Beacon || !bb.working {
                pop_order(w, s);
                return NONE;
            }
            let c = &mut w.units.cold[s];
            c.timer += 1;
            c.flags |= UF_CHARGING;
            if c.timer >= 200 {
                let (bx, by) = w.buildings[b].center();
                let (ox, oy) = (w.units.x[s], w.units.y[s]);
                w.ev(EV_TELEPORT, ox, oy, bx, by);
                w.units.x[s] = bx + 3 * TILE;
                w.units.y[s] = by;
                w.units.px[s] = bx + 3 * TILE;
                w.units.py[s] = by;
                pop_order(w, s);
            }
            NONE
        }
    }
}

fn idle(w: &mut World, s: usize) {
    let kind = w.units.kind[s];
    if fixed_wing(kind) {
        // les avions tournent en rond au-dessus de leur position
        let a = w.units.facing[s].wrapping_add(900);
        w.units.facing[s] = a;
        let sp = unit_speed(kind) / 2;
        let vx = (w.trig.cos(a) as i64 * sp as i64 / 16384) as i32;
        let vy = (w.trig.sin(a) as i64 * sp as i64 / 16384) as i32;
        try_move(w, s, vx, vy);
    }
}

pub fn max_range(kind: u16) -> i32 {
    udef(kind).weapons.iter().map(|&wi| WEAPONS[wi as usize].range).max().unwrap_or(0)
}

fn has_target_in_range(w: &World, s: usize) -> bool {
    w.units.cold[s].wtarget.iter().any(|&t| t != NONE)
}

/// Le transport `carrier` peut-il embarquer l'unité `t` (place à bord, même joueur, taille, couche) ?
pub fn can_load(w: &World, carrier: usize, t: usize) -> bool {
    let cap = udef(w.units.kind[carrier]).carry as usize;
    let tk = w.units.kind[t];
    let td = udef(tk);
    if cap == 0 || w.units.cold[carrier].cargo.len() >= cap || w.units.owner[carrier] != w.units.owner[t] {
        return false;
    }
    // le transport lourd emporte aussi les unités lourdes (marcheurs, artillerie lourde), jamais les expérimentales
    let max_r = if w.units.kind[carrier] == U_HEAVY_TRANSPORT { 520 } else { 300 };
    if !matches!(td.layer, Layer::Land | Layer::Hover) || td.radius > max_r || td.tier == 6 {
        return false;
    }
    w.units.kind[carrier] != U_SIEGE_WALKER || tk == U_LINE_ROBOT
}

pub fn load_unit(w: &mut World, carrier: usize, t: usize) {
    if !can_load(w, carrier, t) {
        return;
    }
    clear_orders(w, t);
    let cid = w.unit_id(carrier);
    let tid = w.unit_id(t);
    w.units.cold[t].carried_by = cid;
    w.units.cold[carrier].cargo.push(tid);
}

/// Navette : rayon autour du point d'embarquement où les unités qui attendent sont prises (sous-unités).
pub const FERRY_R: i32 = 8 * TILE;
/// Navette : attente sans nouveau passager avant de partir avec ce qui est à bord (ticks).
const FERRY_WAIT: u16 = 100;

/// Navette possible : les deux points assez éloignés (un débarqué ne doit pas être repris aussitôt), et
/// de la terre ferme près de l'un et de l'autre.
pub fn ferry_ok(w: &World, ax: i32, ay: i32, bx: i32, by: i32) -> bool {
    let land = |x: i32, y: i32| {
        let (fx, fy) = buildings::free_spot_near(w, x, y, P_LAND);
        w.map.passable(fx / TILE, fy / TILE, P_LAND)
    };
    dist(ax, ay, bx, by) > 2 * FERRY_R && land(ax, ay) && land(bx, by)
}

/// Transport en navette en route vers le débarquement (bit 0 de `UnitCold::timer`) ?
pub fn ferry_loaded(w: &World, s: usize) -> bool {
    w.units.cold[s].timer & 1 != 0
}

/**
 * Navette d'un transport : au point A, il embarque les unités de combat terrestres de son joueur qui y attendent
 * sans ordre (ni constructeur, ni commandant, ni unité déployée), la plus proche de lui d'abord ; plein, ou après
 * 5 s sans nouveau passager, il va les déposer au point B, puis revient. Phase dans le bit 0 de `UnitCold::timer`
 * (1 : en route vers B), attente dans les bits suivants.
 */
fn ferry_step(w: &mut World, s: usize, ax: i32, ay: i32, bx: i32, by: i32) {
    let def = udef(w.units.kind[s]);
    let cap = def.carry as usize;
    let (x, y) = (w.units.x[s], w.units.y[s]);
    w.units.cold[s].stuck = 0;
    if ferry_loaded(w, s) {
        if steer(w, s, bx, by, bx, by, TILE) || dist(x, y, bx, by) < 2 * TILE {
            unload_all(w, s);
            clear_goal(w, s);
            w.units.cold[s].timer = 0;
        }
        return;
    }
    if w.units.cold[s].cargo.len() >= cap {
        clear_goal(w, s);
        w.units.cold[s].timer = 1;
        return;
    }
    let da = dist(x, y, ax, ay);
    if da > FERRY_R + 4 * TILE {
        steer(w, s, ax, ay, ax, ay, TILE);
        return;
    }
    let owner = w.units.owner[s];
    let mut best: Option<(i64, usize)> = None;
    w.grid.fine.query(ax, ay, FERRY_R, |t| {
        let u = &w.units;
        if !u.alive[t] || u.owner[t] != owner || u.hp[t] <= 0 {
            return;
        }
        let c = &u.cold[t];
        let d = udef(u.kind[t]);
        // une unité qui attend : sans ordre, pas à bord, pas en batterie, pas un chenillard qui se déploie
        if !c.orders.is_empty() || c.carried_by != NONE || c.deployed || c.pack != 0 {
            return;
        }
        if d.commander || d.build_power > 0 || d.deploys != NO_KIND || d.speed == 0 || d.weapons.is_empty() {
            return;
        }
        if dist2(u.x[t], u.y[t], ax, ay) > (FERRY_R as i64).pow(2) || !can_load(w, s, t) {
            return;
        }
        let k = (dist2(u.x[t], u.y[t], x, y), t);
        if best.is_none_or(|b| k < b) {
            best = Some(k);
        }
    });
    if let Some((_, t)) = best {
        let (tx, ty) = (w.units.x[t], w.units.y[t]);
        if dist(x, y, tx, ty) <= 2 * TILE + def.radius {
            load_unit(w, s, t);
            w.units.cold[s].timer = 0;
        } else {
            steer(w, s, tx, ty, tx, ty, TILE);
        }
        return;
    }
    if da > 2 * TILE {
        steer(w, s, ax, ay, ax, ay, TILE);
    }
    if !w.units.cold[s].cargo.is_empty() {
        w.units.cold[s].timer += 2;
        if w.units.cold[s].timer >= 2 * FERRY_WAIT {
            clear_goal(w, s);
            w.units.cold[s].timer = 1;
        }
    }
}

pub fn unload_all(w: &mut World, carrier: usize) {
    let cargo = std::mem::take(&mut w.units.cold[carrier].cargo);
    let (x, y) = (w.units.x[carrier], w.units.y[carrier]);
    for (i, id) in cargo.into_iter().enumerate() {
        if let Some(t) = w.unit(id) {
            let m = pass_mask(udef(w.units.kind[t]).layer);
            let ox = x + ((i as i32 % 4) - 2) * TILE;
            let oy = y + ((i as i32 / 4) - 1) * TILE;
            let (fx, fy) = buildings::free_spot_near(w, ox, oy, m);
            w.units.x[t] = fx;
            w.units.y[t] = fy;
            w.units.px[t] = fx;
            w.units.py[t] = fy;
            w.units.cold[t].carried_by = NONE;
        }
    }
}

/// Portes de transit : une unité qui entre dans une porte ouverte ressort par l'autre.
fn gate_check(w: &mut World, s: usize) {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let o = w.map.occ[w.map.idx(x / TILE, y / TILE)];
    if o == 0 {
        return;
    }
    let b = (o - 1) as usize;
    let bb = &w.buildings[b];
    if bb.def().class != BClass::Gate || !bb.working || bb.owner != w.units.owner[s] {
        return;
    }
    let (cx, cy) = bb.center();
    if dist2(x, y, cx, cy) > (TILE as i64 * 3 / 2).pow(2) {
        return;
    }
    let Some(t) = w.building(bb.link) else { return };
    // terrier de la Souche : sa sortie n'a pas besoin d'être ouverte en retour
    let burrow = bb.kind == B_BURROW;
    if burrow {
        // on n'y entre que pour y aller : l'ordre de déplacement mène au terrier (on peut lui marcher dessus)
        let meant = matches!(w.units.cold[s].orders.first(), Some(&Order::Move { gx, gy, .. }) if dist2(gx, gy, cx, cy) <= (2 * TILE as i64).pow(2));
        if !meant || !crate::souche::burrow_fits(w.units.kind[s]) {
            return;
        }
    }
    if !w.buildings[t].working && !burrow {
        return;
    }
    // l'unité ressort de l'horizon de la porte d'arrivée, puis s'en écarte de quelques cases vers l'avant
    let (tx, ty) = w.buildings[t].center();
    let (fdx, fdy) = crate::belts::DIRS[(w.buildings[t].dir & 3) as usize];
    let m = pass_mask(udef(w.units.kind[s]).layer);
    let (ox, oy) = (tx + fdx * TILE / 2, ty + fdy * TILE / 2);
    let out = if burrow { 3 } else { 5 };
    let (gx, gy) = buildings::free_spot_near(w, tx + fdx * out * TILE, ty + fdy * out * TILE, m);
    w.ev(if burrow { crate::essaim::EV_BURROW } else { EV_TELEPORT }, x, y, ox, oy);
    w.units.x[s] = ox;
    w.units.y[s] = oy;
    w.units.px[s] = ox;
    w.units.py[s] = oy;
    w.units.facing[s] = w.trig.atan2(fdy as i64, fdx as i64);
    w.units.cold[s].warp = 40;
    // l'ordre de déplacement vers la porte est terminé ; l'unité s'éloigne de l'horizon
    if let Some(Order::Move { .. }) = w.units.cold[s].orders.first() {
        pop_order(w, s);
    }
    w.units.cold[s].orders.insert(0, Order::Move { x: gx, y: gy, gx, gy, attack: false, eta: 0 });
}

/// Porte-avions : chaque seconde, les appareils alliés à moins de 8 cases regagnent 1 % de leurs points de vie.
fn carrier_repair(w: &mut World, s: usize) {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let owner = w.units.owner[s];
    let r = 8 * TILE;
    let mut near = Vec::new();
    let units = &w.units;
    w.grid.fine.query(x, y, r, |o| {
        if units.alive[o] && units.owner[o] == owner && dist2(x, y, units.x[o], units.y[o]) <= (r as i64) * (r as i64) {
            near.push(o);
        }
    });
    near.sort_unstable();
    for o in near {
        let d = udef(w.units.kind[o]);
        if d.layer == Layer::Air && w.units.cold[o].carried_by == NONE {
            let max = w.max_hp(o);
            w.units.hp[o] = (w.units.hp[o] + (max / 100).max(1)).min(max);
        }
    }
}

/// Capacités propres à certaines unités.
fn special(w: &mut World, s: usize) {
    let kind = w.units.kind[s];
    let owner = w.units.owner[s] as usize;
    match kind {
        U_FORTRESS | U_MOTHERSHIP | U_CARRIER => {
            let (child, period, max) = match kind {
                U_FORTRESS => (U_LINE_ROBOT, 200, 12),
                U_MOTHERSHIP => (U_GLIDER, 120, 12),
                _ => (U_INTERCEPTOR, 200, CARRIER_WING),
            };
            if kind == U_CARRIER && w.tick.is_multiple_of(20) {
                carrier_repair(w, s);
            }
            let c = &mut w.units.cold[s];
            c.timer += 1;
            if c.timer >= period && c.children < max && w.players[owner].unit_count < UNIT_CAP {
                let cost = udef(child).cost;
                let (ux, uy) = (w.units.x[s], w.units.y[s]);
                // payé par les dépôts proches (paiement immédiat)
                if crate::drones::pay_near(w, owner as u8, ux, uy, cost) {
                    w.units.cold[s].timer = 0;
                    w.units.cold[s].children += 1;
                    let (x, y) = (w.units.x[s], w.units.y[s]);
                    let m = pass_mask(udef(child).layer);
                    let (fx, fy) = if m == 0xff { (x, y) } else { buildings::free_spot_near(w, x, y + 4 * TILE, m) };
                    let pid = w.unit_id(s);
                    let id = w.spawn_unit(child, owner as u8, fx, fy);
                    let cs = slot_of(id);
                    w.units.cold[cs].parent = pid;
                    w.units.cold[cs].orders.push(Order::Assist { target: pid });
                }
            }
        }
        U_BURROWER => crate::essaim::burrow_step(w, s),
        U_COMMANDO => {
            let c = &mut w.units.cold[s];
            c.reveal = c.reveal.saturating_sub(1);
        }
        U_HEAVY_ARTY | U_DEPLOY_TURRET | U_ROLL_DROID | U_TOWED_GUN => {
            // droïde roulant : il se déplie en moins d'une seconde
            let delay = if kind == U_ROLL_DROID { 16 } else { 60 };
            let c = &mut w.units.cold[s];
            let wants = c.wtarget[0] != NONE || matches!(c.orders.first(), Some(Order::AttackGround { .. }) | Some(Order::Attack { .. }));
            if wants && !c.deployed && w.units.px[s] == w.units.x[s] && w.units.py[s] == w.units.y[s] {
                c.timer += 1;
                if c.timer >= delay {
                    c.deployed = true;
                    c.timer = 0;
                }
            }
        }
        U_COLOSSUS => {
            // écrase les petites unités ennemies sous ses pieds
            let (x, y) = (w.units.x[s], w.units.y[s]);
            let team = w.team_of(owner as u8);
            let r = udef(kind).radius;
            let mut hits = Vec::new();
            let units = &w.units;
            w.grid.fine.query(x, y, r, |o| {
                if units.alive[o] && units.cold[o].carried_by == NONE {
                    let od = udef(units.kind[o]);
                    if matches!(od.layer, Layer::Land | Layer::Hover) && od.radius < 300 && dist2(x, y, units.x[o], units.y[o]) < (r as i64 * r as i64) {
                        hits.push(o);
                    }
                }
            });
            for o in hits {
                if w.team_of(w.units.owner[o]) != team {
                    crate::combat::damage_unit(w, o, 150, owner as u8);
                }
            }
        }
        _ => {}
    }
}
