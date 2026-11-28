//! Les Transhumants : industrie montée sur des chenillards (voir docs/spec/races.md).
//!
//! - Chenillard : une unité qui porte un module (foreuse, fonderie, assembleur, raffinerie, générateur,
//!   soute, laboratoire, atelier, bastion). Ordre « Déployer » (O_DEPLOY) : immobile pendant
//!   DEPLOY_TICKS, il devient le bâtiment du module, posé sous lui (une foreuse cherche un gisement à
//!   3 cases au plus). Ordre « Replier » (O_PACK) sur le bâtiment : il redevient un chenillard, immobile
//!   pendant FOLD_TICKS ; le contenu du module retourne à la réserve, sa recette et le combustible du
//!   générateur restent dans le chenillard.
//! - Pas de tapis ni de bras : les bâtiments qui se touchent forment un réseau de transfert (transfert.rs) ; un
//!   objet va à n'importe quel destinataire du réseau, comme s'ils étaient collés (transfert direct, machines
//!   jumelles) ; la soute (un dépôt, avec son propre stock) alimente les fabricants du réseau. Repliée, la soute
//!   garde son stock à bord (`UnitCold::hold` du chenillard).
//! - Raclage : la foreuse nomade extrait deux fois plus vite qu'un extracteur, mais use le gisement
//!   (`World::wear`, ‰) : +2 ‰ toutes les 5 s de forage, jusqu'à 600 ‰ ; il se reconstitue au même
//!   rythme quand aucune foreuse nomade n'y travaille.
//! - Améliorations : celles de l'Arche, des modules et des unités sont dans ameliorations.rs ; un module garde les
//!   siennes au repli et au déploiement.
//! - Recherche par relevés : chaque carré de 8 × 8 cases de carte (2 × 2 cases de vision) que l'équipe découvre
//!   donne un relevé à chacun de ses Transhumants, chaque ennemi détruit 4 par palier ; un laboratoire nomade qui
//!   n'en a pas en tire un des environs toutes les 2 s. Une unité de recherche coûte 3 relevés par palier.
//! - Race amphibie : l'Arche, ses remorques, les chenillards et les unités sont de la couche `Layer::Hover` (terre et
//!   eau) ; un module ne se déploie que sur la terre.
//! - Chariots de convoi et soute : voir chariots.rs.

use crate::buildings;
pub use crate::chariots::{carts_of, feed_crafters, haul_ok, haul_step, hitch, CARTS_PER_HOLD, HAUL_WAIT};
use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::world::*;

pub const PACK_DEPLOYING: u8 = 1;
/// Plan d'un déploiement (`UnitCold::timer`) : sens choisi par le joueur.
const PLAN_CHOSEN: u16 = 0x100;
pub const PACK_FOLDING: u8 = 2;
/// Durées du déploiement et du repli (ticks).
pub const DEPLOY_TICKS: u16 = 300;
pub const FOLD_TICKS: u16 = 200;
/// Usure des gisements (‰) : pas toutes les WEAR_PERIOD ticks, plafond.
pub const WEAR_PERIOD: u32 = 100;
pub const WEAR_STEP: u16 = 2;
pub const WEAR_MAX: u16 = 600;
/// Relevés par palier pour une unité de recherche ; relevés par palier d'un ennemi détruit.
pub const RELEVES_PER_TIER: i32 = 3;
pub const RELEVES_PER_KILL_TIER: i32 = 4;
/// Un laboratoire nomade sans relevés en tire un toutes les LAB_TRICKLE ticks.
pub const LAB_TRICKLE: u32 = 40;
/// Événement : un chenillard n'a pas pu se déployer [joueur, x, y, type d'unité].
pub const EV_DEPLOY_FAILED: i32 = 45;
/// Butin : un Transhumant qui détruit une unité ou un bâtiment ennemi en récupère une part du coût, versée
/// à sa réserve la plus proche : [x, y (sous-unités), joueur, objets récupérés].
pub const EV_LOOT: i32 = 49;
/// Part du coût de la victime prise en butin (%), arrondie au plus proche pour chaque objet.
pub const LOOT_PCT: u32 = 25;
/// Bâtiment détruit : pillé par l'unité des Transhumants la plus proche, à cette distance au plus (cases).
pub const LOOT_RANGE: i32 = 15;
/// Hydrocarbures de réserve au départ, à bord de la soute (le réservoir du générateur est plein en plus).
pub const START_FUEL_RESERVE: u16 = 40;
/// Poteaux relais qu'un générateur nomade peut avoir plantés en même temps.
pub const POLES_PER_GEN: usize = 3;

#[inline]
pub fn is_transh(w: &World, p: u8) -> bool {
    w.players.get(p as usize).is_some_and(|pl| pl.race == RACE_TRANSH)
}

/// Chenillard qui se replie en ce bâtiment (NO_KIND : aucun).
pub fn chenillard_of(bkind: u16) -> u16 {
    UNITS.iter().position(|u| u.deploys == bkind).map_or(NO_KIND, |i| i as u16)
}

/// Départ : l'Arche (déjà posée) et ses chenillards repliés autour d'elle.
pub fn place_start(w: &mut World, p: usize) {
    let land = crate::units::pass_mask(Layer::Land);
    let kit: [(u16, i32, i32); 7] = [
        (U_CH_GENERATOR, 4, 0),
        (U_CH_DRILL, -4, 0),
        (U_CH_DRILL, 0, 4),
        (U_CH_FURNACE, 0, -4),
        (U_CH_HOLD, 4, 4),
        (U_CH_ASSEMBLER, -4, -4),
        (U_CH_WORKSHOP, 5, -5),
    ];
    for (kind, dx, dy) in kit {
        let (x, y) = crate::races::start_spot(w, p, dx, dy, land);
        let id = w.spawn_unit(kind, p as u8, x, y);
        if let Some(s) = w.unit(id) {
            if kind == U_CH_GENERATOR {
                w.units.cold[s].pack_fuel = START_FUEL_UNITS * FUEL_HYDROCARBON;
            }
            // stock de départ des Industriels, à bord de la soute repliée (il n'y a pas de réserve commune)
            if kind == U_CH_HOLD {
                for &(it, n) in START_ITEMS.iter().chain(&[(HYDROCARBON, START_FUEL_RESERVE)]) {
                    crate::drones::put(&mut w.units.cold[s].hold, it, n);
                }
            }
        }
    }
}

/// Ordre « Déployer » sur un chenillard.
pub fn start_deploy(w: &mut World, s: usize) {
    if udef(w.units.kind[s]).deploys == NO_KIND || w.units.cold[s].pack == PACK_FOLDING {
        return;
    }
    crate::units::clear_orders(w, s);
    if w.units.cold[s].pack == PACK_DEPLOYING {
        // second ordre : annule
        w.units.cold[s].pack = 0;
    } else {
        begin_deploy(w, s, None, 0);
    }
}

/// Début d'un déploiement : fin prévue, emplacement et sens du module (le plan), que le chenillard rejoint
/// pendant l'animation pour finir exactement sur le module posé. `at` : centre du module voulu (placement
/// choisi par le joueur ; sinon, ou s'il n'est plus libre, la place libre la plus proche) ; `dir` : sens
/// choisi + 1 (0 : sens automatique). Plan : `work` = (x + 1) | y << 16 de l'emplacement (0 : aucun, le
/// chenillard reste sur place), `timer` = sens + 1, plus PLAN_CHOSEN si le joueur l'a choisi.
fn begin_deploy(w: &mut World, s: usize, at: Option<(i32, i32)>, dir: u8) {
    let end = w.tick + (if crate::ameliorations::quick(w.units.cold[s].mods & 0xffff) { DEPLOY_TICKS / 2 } else { DEPLOY_TICKS }) as u32;
    let (kind, owner) = (w.units.kind[s], w.units.owner[s]);
    let bkind = udef(kind).deploys;
    let (bw, bh) = buildings::dims(bkind, 0);
    let wanted = at.map(|(x, y)| (x / TILE - bw / 2, y / TILE - bh / 2)).filter(|&(bx, by)| buildings::can_place(w, owner, bkind, bx, by, 0));
    let plan = wanted.or_else(|| deploy_spot(w, owner, bkind, w.units.x[s], w.units.y[s]));
    let (work, timer) = match plan {
        Some((bx, by)) => {
            let cur = (((w.units.facing[s] as u32 + 8192) / 16384) & 3) as u8;
            let raw = if bdef(bkind).class == BClass::Extractor { w.map.deposit[w.map.idx(bx, by)] } else { 0 };
            let recipe = if bdef(bkind).class == BClass::Extractor { raw } else { w.units.cold[s].pack_recipe };
            let (d, chosen) = if dir > 0 { ((dir - 1) & 3, PLAN_CHOSEN) } else { (best_dir(w, owner, bkind, recipe, bx, by, cur), 0) };
            ((bx as u32 + 1) | (by as u32) << 16, d as u16 + 1 + chosen)
        }
        None => (0, 0),
    };
    let c = &mut w.units.cold[s];
    c.pack = PACK_DEPLOYING;
    c.ready_tick = end;
    c.work = work;
    c.timer = timer;
}

/// Pendant le déploiement : le chenillard glisse vers le centre de l'emplacement prévu et pivote vers le
/// sens du module (au plus une demi-vitesse et un quart de tour en 2 s).
fn align(w: &mut World, s: usize) {
    let c = &w.units.cold[s];
    if c.work == 0 || c.timer == 0 {
        return;
    }
    let (bx, by) = ((c.work & 0xffff) as i32 - 1, (c.work >> 16) as i32);
    let d = ((c.timer & !PLAN_CHOSEN) - 1) as u8 & 3;
    let bkind = udef(w.units.kind[s]).deploys;
    let (bw, bh) = buildings::dims(bkind, 0);
    let (tx, ty) = (bx * TILE + bw * TILE / 2, by * TILE + bh * TILE / 2);
    let step = (unit_speed(w.units.kind[s]) / 2).max(1);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    w.units.x[s] = x + (tx - x).clamp(-step, step);
    w.units.y[s] = y + (ty - y).clamp(-step, step);
    let want = buildings::bb_dir_angle(d) as u16;
    let diff = want.wrapping_sub(w.units.facing[s]) as i16 as i32;
    let turn = 400;
    w.units.facing[s] = w.units.facing[s].wrapping_add(diff.clamp(-turn, turn) as u16);
}

/// Chenillard en cours de déploiement ou de repli (appelé à chaque tick par `update_units`, avant les
/// ordres ; `ready_tick` : tick de fin). Renvoie vrai si l'unité ne doit pas agir ce tick (repli en
/// cours), ou si elle a disparu (déployée).
pub fn tick_unit(w: &mut World, s: usize) -> bool {
    // tourelle d'une Arche
    if crate::ameliorations::is_turret(w.units.kind[s]) {
        return crate::ameliorations::tick_turret(w, s);
    }
    match w.units.cold[s].pack {
        PACK_FOLDING => {
            if w.tick >= w.units.cold[s].ready_tick {
                w.units.cold[s].pack = 0;
                return false;
            }
            // un ordre donné pendant le repli attend la fin
            true
        }
        PACK_DEPLOYING => {
            if !w.units.cold[s].orders.is_empty() {
                // un nouvel ordre annule le déploiement
                w.units.cold[s].pack = 0;
                return false;
            }
            if w.tick >= w.units.cold[s].ready_tick {
                deploy(w, s);
                return !w.units.alive[s];
            }
            align(w, s);
            false
        }
        _ => false,
    }
}

/// Emplacement du module d'un chenillard en (x, y) (sous-unités) : la place libre la plus proche, à 3
/// cases au plus ; une foreuse doit couvrir un gisement.
fn deploy_spot(w: &World, owner: u8, bkind: u16, x: i32, y: i32) -> Option<(i32, i32)> {
    let (bw, bh) = buildings::dims(bkind, 0);
    let (bx, by) = (x / TILE - bw / 2, y / TILE - bh / 2);
    let mut best: Option<(i32, i32, i32)> = None;
    for dy in -3..=3 {
        for dx in -3..=3 {
            let d = dx * dx + dy * dy;
            if best.is_some_and(|b| b.0 <= d) {
                continue;
            }
            if buildings::can_place(w, owner, bkind, bx + dx, by + dy, 0) {
                best = Some((d, bx + dx, by + dy));
            }
        }
    }
    best.map(|b| (b.1, b.2))
}

/// Indice du gisement sous l'emprise d'un bâtiment (NONE : aucun).
pub fn spot_under(w: &World, x: i32, y: i32, bw: i32, bh: i32) -> u32 {
    w.map.spots.iter().position(|s| s.kind != GEYSER && s.x >= x && s.y >= y && s.x + 2 <= x + bw && s.y + 2 <= y + bh).map_or(NONE, |i| i as u32)
}

/// Retire une unité sans mort ni épave (chenillard devenu bâtiment, tourelle rentrée à bord de l'Arche).
pub fn vanish(w: &mut World, s: usize) {
    let owner = w.units.owner[s] as usize;
    crate::units::clear_orders(w, s);
    w.units.alive[s] = false;
    w.units.free.push(s as u32);
    w.players[owner].unit_count = w.players[owner].unit_count.saturating_sub(1);
}

/// Fin du déploiement : le chenillard devient son module, ou reste chenillard s'il n'y a pas la place.
fn deploy(w: &mut World, s: usize) {
    let (kind, owner) = (w.units.kind[s], w.units.owner[s]);
    let bkind = udef(kind).deploys;
    let (x, y) = (w.units.x[s], w.units.y[s]);
    w.units.cold[s].pack = 0;
    // le plan du début du déploiement s'il tient toujours, sinon la place libre la plus proche
    let (pw, pt) = (w.units.cold[s].work, w.units.cold[s].timer);
    let planned = (pw != 0).then(|| ((pw & 0xffff) as i32 - 1, (pw >> 16) as i32)).filter(|&(bx, by)| buildings::can_place(w, owner, bkind, bx, by, 0));
    let Some((bx, by)) = planned.or_else(|| deploy_spot(w, owner, bkind, x, y)) else {
        w.ev(EV_DEPLOY_FAILED, owner as i32, x, y, kind as i32);
        return;
    };
    let Some(b) = buildings::place_building(w, owner, bkind, bx, by, 0) else {
        w.ev(EV_DEPLOY_FAILED, owner as i32, x, y, kind as i32);
        return;
    };
    let (hp, max) = (w.units.hp[s], w.max_hp(s).max(1));
    let (recipe, fuel) = (w.units.cold[s].pack_recipe, w.units.cold[s].pack_fuel);
    // soute : son stock replié redevient le stock du dépôt
    let stock = std::mem::take(&mut w.units.cold[s].hold);
    let aboard = std::mem::take(&mut w.units.cold[s].aboard);
    let (mods, mod_job, mod_left) = (w.units.cold[s].mods, w.units.cold[s].mod_job, w.units.cold[s].mod_left);
    vanish(w, s);
    buildings::complete_building(w, b);
    let def = bdef(bkind);
    let bb = &mut w.buildings[b];
    // (au-delà de ses emplacements, pour une soute : équipements des chariots rentrés, voir stow_carts)
    let own = crate::ameliorations::own_mods(kind, mods);
    bb.mods = own;
    bb.mod_job = mod_job;
    bb.mod_left = mod_left;
    bb.hp = ((def.hp as i64 * hp as i64 / max as i64) as i32).clamp(1, def.hp);
    if def.class == BClass::Crafter && recipe != RECIPE_NONE {
        bb.recipe = recipe;
        // recette fixée par le joueur (sinon automatique)
        bb.repeat = fuel != 0;
    }
    if def.class == BClass::Factory {
        // atelier : sa file repliée (NONE : en boucle)
        bb.repeat = aboard.iter().any(|e| e.0 == NONE);
        bb.queue = aboard.iter().filter(|e| e.0 != NONE).map(|&(k, n)| (k as u16, n as u16)).collect();
    }
    if def.class == BClass::Power {
        bb.fuel = fuel;
        w.power_dirty = true;
    }
    if def.class == BClass::Depot {
        bb.stash = stock;
    }
    if own != 0 {
        crate::ameliorations::applied(w, crate::ameliorations::Host::B(b));
    }
    if bkind == B_T_HOLD {
        crate::chariots::unstow_carts(w, b, fuel, mods, &aboard);
    }
    if def.class == BClass::Extractor {
        let (bw, bh) = buildings::dims(bkind, 0);
        let spot = spot_under(w, bx, by, bw, bh);
        w.buildings[b].link = spot;
    }
    // sens logique : celui du plan (le chenillard s'y est tourné), puis le module et ses voisins collés se
    // tournent selon leurs liaisons (à égalité, chacun garde le sien)
    if pt != 0 {
        w.buildings[b].dir = ((pt & !PLAN_CHOSEN) - 1) as u8 & 3;
        if def.class == BClass::Factory {
            set_rally(w, b);
        }
        // sens choisi par le joueur (placement) : l'orientation automatique ne le change plus
        if pt & PLAN_CHOSEN != 0 {
            w.buildings[b].turn = 1;
        }
    }
    orient(w, b);
    for o in glued(w, b) {
        orient(w, o);
    }
}

/// Modules des Transhumants du même joueur, terminés, collés à une face du bâtiment `b`, par indice croissant.
pub fn glued(w: &World, b: usize) -> Vec<usize> {
    let bb = &w.buildings[b];
    let owner = bb.owner;
    let (x, y) = (bb.x, bb.y);
    let (bw, bh) = bb.size();
    let (cx, cy) = bb.center();
    let mut near: Vec<usize> = Vec::new();
    w.grid.query_buildings(cx, cy, 5 * TILE, |o| {
        if o == b {
            return;
        }
        let ob = &w.buildings[o];
        if !ob.alive || ob.owner != owner || !ob.complete() || ob.def().race != RACE_TRANSH {
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
    near.sort_unstable();
    near
}

/// Intérêt d'une case devant la face avant du module `b` (orientation automatique) : un voisin qui reçoit
/// ce que le module produit (foreuse, fabricant) attire la face avant ; une usine veut une sortie libre ;
/// les autres modules se tournent vers le côté dégagé.
fn front_score(w: &World, me: usize, owner: u8, kind: u16, recipe: u8, fx: i32, fy: i32) -> i32 {
    if !w.map.inside(fx, fy) {
        return -3;
    }
    let class = bdef(kind).class;
    let i = w.map.idx(fx, fy);
    let o = w.map.occ[i];
    if o == 0 {
        let free = w.map.passable(fx, fy, crate::units::pass_mask(Layer::Land));
        return match (class, free) {
            (BClass::Factory, true) => 4,
            (_, true) => 1,
            _ => -2,
        };
    }
    if (o - 1) as usize == me {
        return 0;
    }
    let nb = &w.buildings[(o - 1) as usize];
    if nb.owner != owner || !nb.alive {
        return -2;
    }
    let nc = nb.def().class;
    match class {
        // foreuse : son minerai va à une fonderie, une raffinerie, une soute (ou un générateur pour l'hydrocarbure)
        BClass::Extractor => {
            let raw = recipe;
            let takes = match nc {
                BClass::Depot => true,
                BClass::Crafter => matches!((nb.def().crafter, raw), (Crafter::Furnace, IRON_ORE | COPPER_ORE | SILICON) | (Crafter::Refinery, HYDROCARBON | CRYSTAL)),
                BClass::Power => raw == HYDROCARBON,
                _ => false,
            };
            if takes {
                10
            } else {
                -1
            }
        }
        // fabricant : son produit va à la soute, à l'atelier, ou à un fabricant dont la recette l'utilise
        BClass::Crafter => {
            let out = if recipe == RECIPE_NONE { 0 } else { RECIPES[recipe as usize].output.0 };
            let takes = match nc {
                BClass::Depot | BClass::Factory => true,
                BClass::Crafter => out != 0 && nb.recipe != RECIPE_NONE && RECIPES[nb.recipe as usize].inputs.iter().any(|x| x.0 == out),
                BClass::Power => out == FUEL,
                _ => false,
            };
            if takes {
                10
            } else {
                -1
            }
        }
        // atelier : les unités sortent par l'avant
        BClass::Factory => -6,
        _ => -1,
    }
}

/// Oriente un module déployé (ils sont carrés : tourner ne change pas l'emprise) dans le sens le plus
/// logique d'après ses voisins (voir `front_score`) ; à égalité, il garde son sens. Le point de
/// ralliement d'un atelier suit sa sortie.
pub fn orient(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    // `turn` = 1 : sens choisi par le joueur au placement, gardé
    if !bb.alive || bb.def().race != RACE_TRANSH || bb.turn == 1 {
        return;
    }
    let (bw, bh) = bb.size();
    if bw != bh {
        return;
    }
    let (x, y, cur) = (bb.x, bb.y, bb.dir & 3);
    let d = best_dir_at(w, b, bb.owner, bb.kind, bb.recipe, x, y, cur);
    if d == cur {
        return;
    }
    w.buildings[b].dir = d;
    if w.buildings[b].def().class == BClass::Factory {
        set_rally(w, b);
    }
    w.buildings_version = w.buildings_version.wrapping_add(1);
}

/// Point de ralliement d'un atelier : trois cases devant sa sortie.
fn set_rally(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let d = bb.dir & 3;
    let (fx, fy) = buildings::front_tile(bb.x, bb.y, bw, bh, d);
    let (dx, dy) = crate::belts::DIRS[d as usize];
    w.buildings[b].rally = (fx * TILE + TILE / 2 + dx * TILE * 3, fy * TILE + TILE / 2 + dy * TILE * 3);
}

/// Sens le plus logique d'un module de type `kind` posé en (x, y) (voir `front_score`) ; à égalité, `cur`.
fn best_dir(w: &World, owner: u8, kind: u16, recipe: u8, x: i32, y: i32, cur: u8) -> u8 {
    best_dir_at(w, usize::MAX, owner, kind, recipe, x, y, cur)
}

#[allow(clippy::too_many_arguments)]
fn best_dir_at(w: &World, me: usize, owner: u8, kind: u16, recipe: u8, x: i32, y: i32, cur: u8) -> u8 {
    let (bw, bh) = buildings::dims(kind, 0);
    let mut best = (i32::MIN, cur);
    for d in [cur, 0, 1, 2, 3] {
        let n = buildings::front_count(bw, bh, d);
        let score: i32 = (0..n)
            .map(|k| {
                let (fx, fy) = buildings::front_tile_k(x, y, bw, bh, d, k);
                front_score(w, me, owner, kind, recipe, fx, fy)
            })
            .sum();
        if score > best.0 {
            best = (score, d);
        }
    }
    best.1
}

/// Ordre « déployer ici » : le chenillard roule jusqu'au point (x, y), puis se déploie (ses ordres suivants
/// sont abandonnés : il devient un bâtiment). Bloqué en route, il se déploie là où il est.
pub fn deploy_at(w: &mut World, s: usize, x: i32, y: i32, dir: u8) {
    let arrived = crate::units::steer(w, s, x, y, x, y, TILE / 3);
    if !arrived && w.units.cold[s].stuck <= 100 {
        return;
    }
    crate::units::clear_orders(w, s);
    begin_deploy(w, s, Some((x, y)), dir);
}

/// Ordre « Replier » sur un module déployé : il redevient un chenillard.
pub fn fold(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    if !bb.alive || !bb.complete() || bb.upgrade > 0 || bb.def().race != RACE_TRANSH {
        return;
    }
    let ukind = chenillard_of(bb.kind);
    if ukind == NO_KIND {
        return;
    }
    let owner = bb.owner as usize;
    if w.players[owner].unit_count >= UNIT_CAP {
        return;
    }
    let def = bb.def();
    let (cx, cy) = bb.center();
    let ratio = (bb.hp as i64 * 1000 / def.hp.max(1) as i64) as i32;
    let recipe = if def.class == BClass::Crafter { bb.recipe } else { RECIPE_NONE };
    // gardé à bord : combustible d'un générateur ; fabricant : recette fixée par le joueur (1)
    let fuel = match def.class {
        BClass::Power => bb.fuel,
        BClass::Crafter => bb.repeat as i32,
        _ => 0,
    };
    // le contenu du module est remboursé (dépôt le plus proche, sans plafond) ; le stock d'une soute
    // reste à bord du chenillard
    let mut refund: Vec<(u8, i32)> = Vec::new();
    if def.class == BClass::Crafter && recipe != RECIPE_NONE {
        let r = &RECIPES[recipe as usize];
        for (k, &(it, _)) in r.inputs.iter().enumerate() {
            refund.push((it, bb.inv[k] as i32));
        }
        refund.push((r.output.0, bb.out as i32));
    }
    if def.class == BClass::Extractor && bb.recipe != 0 && bb.recipe != RECIPE_NONE {
        refund.push((bb.recipe, bb.out as i32));
    }
    // atelier : sa file reste à bord, l'unité en cours est rendue
    let mut list: Vec<(u32, u32)> = Vec::new();
    if def.class == BClass::Factory {
        if let (true, Some(&(k, _))) = (bb.working, bb.queue.first()) {
            refund.extend(udef(k).cost.iter().map(|&(it, n)| (it, n as i32)));
        }
        list.extend(bb.queue.iter().map(|&(k, n)| (k as u32, n as u32)));
        if bb.repeat {
            list.push((NONE, 1));
        }
    }
    // fragments d'énergie : rendus au joueur
    w.players[owner].shards += w.buildings[b].shards as u32;
    w.buildings[b].shards = 0;
    // soute : ses chariots de convoi rentrent avec elle (nombre gardé à bord, dans `pack_fuel`)
    let mut carts = crate::chariots::Stowed { n: 0, mods: 0, routes: Vec::new() };
    if w.buildings[b].kind == B_T_HOLD {
        carts = crate::chariots::stow_carts(w, b);
        list = std::mem::take(&mut carts.routes);
    }
    let aboard = if def.class == BClass::Depot { std::mem::take(&mut w.buildings[b].stash) } else { Vec::new() };
    for (it, n) in w.buildings[b].stash.iter().enumerate() {
        if *n > 0 {
            refund.push((it as u8, *n as i32));
        }
    }
    // atelier : l'équipement payé de l'unité en cours est rendu
    let kit = std::mem::take(&mut w.buildings[b].kit);
    if kit != 0 {
        crate::gabarits::refund(w, owner as u8, cx, cy, kit);
    }
    let around = glued(w, b);
    let (mods, mod_job, mod_left) = (w.buildings[b].mods, w.buildings[b].mod_job, w.buildings[b].mod_left);
    buildings::remove_building(w, b, false);
    for o in around {
        orient(w, o);
    }
    for (it, n) in refund {
        if n > 0 && (it as usize) < NUM_ITEMS {
            crate::drones::refund(w, owner as u8, cx, cy, it, n as u32);
        }
    }
    let m = crate::units::pass_mask(Layer::Land);
    let (x, y) = buildings::free_spot_near(w, cx, cy, m);
    let id = w.spawn_unit(ukind, owner as u8, x, y);
    if let Some(s) = w.unit(id) {
        let max = w.max_hp(s);
        let c = &mut w.units.cold[s];
        c.pack = PACK_FOLDING;
        c.ready_tick = w.tick + (if crate::ameliorations::quick(mods & 0xffff) { FOLD_TICKS / 2 } else { FOLD_TICKS }) as u32;
        c.pack_recipe = recipe;
        c.pack_fuel = if ukind == U_CH_HOLD { carts.n } else { fuel };
        c.hold = aboard;
        c.aboard = list;
        c.mods = mods | carts.mods;
        c.mod_job = mod_job;
        c.mod_left = mod_left;
        w.units.hp[s] = ((max as i64 * ratio as i64 / 1000) as i32).clamp(1, max);
    }
}

/// Poteaux relais plantés par le générateur nomade `g` (leur `link` est sa référence), par indice croissant.
pub fn poles_of(w: &World, g: usize) -> Vec<usize> {
    let r = w.building_ref(g);
    (0..w.buildings.len()).filter(|&i| w.buildings[i].alive && w.buildings[i].kind == B_T_POLE && w.buildings[i].link == r).collect()
}

/// Un poteau sur la case (x, y) serait-il relié au générateur `g` ou à l'un de ses poteaux (portée de
/// liaison du poteau, de centre à centre) ?
pub fn pole_in_reach(w: &World, g: usize, x: i32, y: i32) -> bool {
    let reach = bdef(B_T_POLE).connect as i64 * TILE as i64;
    let (px, py) = (x * TILE + TILE / 2, y * TILE + TILE / 2);
    std::iter::once(g).chain(poles_of(w, g)).any(|b| {
        let (cx, cy) = w.buildings[b].center();
        dist2(px, py, cx, cy) <= reach * reach
    })
}

/// Le générateur nomade `g` plante un poteau relais sur la case (x, y) : tout de suite, sans coût, s'il en a
/// moins que sa limite (`ameliorations::poles_max` : POLES_PER_GEN, plus avec les lignes), si la case est libre et à portée de lui ou d'un de ses poteaux.
pub fn plant_pole(w: &mut World, g: usize, x: i32, y: i32) -> bool {
    let gb = &w.buildings[g];
    if !gb.alive || gb.kind != B_T_GENERATOR || !gb.complete() {
        return false;
    }
    let owner = gb.owner;
    if poles_of(w, g).len() >= crate::ameliorations::poles_max(&w.buildings[g]) || !pole_in_reach(w, g, x, y) {
        return false;
    }
    let Some(b) = buildings::place_building(w, owner, B_T_POLE, x, y, 0) else { return false };
    buildings::complete_building(w, b);
    w.buildings[b].link = w.building_ref(g);
    true
}

/// Le générateur nomade `g` s'en va (replié, détruit ou démonté) : il rembarque ses poteaux.
pub fn pull_poles(w: &mut World, g: usize) {
    for b in poles_of(w, g) {
        buildings::remove_building(w, b, false);
    }
}

/// Vitesse (‰) d'une foreuse nomade : deux fois un extracteur, moins l'usure de son gisement.
pub fn drill_speed(w: &World, b: usize) -> u32 {
    let spot = w.buildings[b].link;
    let wear = if spot == NONE { 0 } else { w.wear.get(spot as usize).copied().unwrap_or(0) as u32 };
    2 * (1000 - crate::ameliorations::wear_felt(&w.buildings[b], wear)) * crate::ameliorations::module_speed(&w.buildings[b]) / 100
}

/// Usure des gisements (toutes les WEAR_PERIOD ticks).
pub fn update(w: &mut World) {
    if !w.tick.is_multiple_of(WEAR_PERIOD) || !w.players.iter().any(|p| p.race == RACE_TRANSH) {
        return;
    }
    if w.wear.len() < w.map.spots.len() {
        w.wear.resize(w.map.spots.len(), 0);
    }
    // usure de ce passage : le plus fort des forages du gisement (forage propre : aucune ; percussion : double)
    let mut drilled = vec![0u16; w.wear.len()];
    for &b in &w.active {
        let bb = &w.buildings[b as usize];
        if bb.alive && bb.kind == B_T_DRILL && bb.complete() && bb.working && (bb.link as usize) < drilled.len() {
            let k = match crate::ameliorations::fit(bb) {
                crate::ameliorations::M_DRILL_CLEAN => 0,
                crate::ameliorations::M_DRILL_FAST => 2 * WEAR_STEP,
                _ => WEAR_STEP,
            };
            let d = &mut drilled[bb.link as usize];
            *d = (*d).max(k);
        }
    }
    for (i, d) in drilled.iter().enumerate() {
        let v = &mut w.wear[i];
        *v = if *d > 0 { (*v + *d).min(WEAR_MAX) } else { v.saturating_sub(WEAR_STEP) };
    }
}

/// Recherche dans un laboratoire nomade : une unité de recherche coûte 3 relevés par palier. Renvoie vrai
/// si le laboratoire peut lancer l'unité (relevés payés) ; sinon il en tire un des environs et attend.
pub fn lab_start(w: &mut World, b: usize, t: u8) -> bool {
    let owner = w.buildings[b].owner as usize;
    let need = lab_need(&w.buildings[b], t);
    if w.players[owner].purse[RELEVES as usize] >= need {
        w.players[owner].purse[RELEVES as usize] -= need;
        w.players[owner].consumed[RELEVES as usize] += need as u32;
        return true;
    }
    w.players[owner].purse[RELEVES as usize] += 1;
    w.players[owner].produced[RELEVES as usize] += 1;
    let field = crate::ameliorations::fit(&w.buildings[b]) == crate::ameliorations::M_LAB_FIELD;
    w.buildings[b].wake = w.tick + if field { LAB_TRICKLE / 2 } else { LAB_TRICKLE };
    false
}

/// Relevés d'une unité de la recherche `t` dans ce laboratoire (carnets de terrain : un de moins par palier).
pub fn lab_need(bb: &Building, t: u8) -> i32 {
    let per = if crate::ameliorations::fit(bb) == crate::ameliorations::M_LAB_FIELD { RELEVES_PER_TIER - 1 } else { RELEVES_PER_TIER };
    per * TECHS[t as usize].tier.max(1) as i32
}

/// Relevés gagnés par une équipe en explorant (une case de vision découverte sur quatre, voir combat::update_vision).
pub fn explored(w: &mut World, team: usize, n: u32) {
    if n == 0 {
        return;
    }
    for p in w.players.iter_mut() {
        if p.race == RACE_TRANSH && p.alive && p.team as usize == team {
            p.purse[RELEVES as usize] += n as i32;
            p.produced[RELEVES as usize] += n;
        }
    }
}

/// Relevés gagnés par un Transhumant qui détruit une unité ennemie de palier `tier`.
pub fn kill_credit(w: &mut World, killer: u8, tier: u8) {
    if let Some(p) = w.players.get_mut(killer as usize) {
        if p.race == RACE_TRANSH {
            let n = RELEVES_PER_KILL_TIER * tier.max(1) as i32;
            p.purse[RELEVES as usize] += n;
            p.produced[RELEVES as usize] += n as u32;
        }
    }
}

/// Butin du joueur `looter` (unité qui pille : `by`) sur une victime de `victim` détruite en (x, y) qui valait
/// `cost` : LOOT_PCT % de chaque objet (plus avec des améliorations ; arrondi au plus proche), versés à la réserve
/// du pillard la plus proche (dépôt, soute, Arche). Rien pour un autre peuple, un allié ou la faune ; ni monnaie de race, ni sève, ni sels.
fn loot(w: &mut World, looter: u8, by: usize, victim: u8, x: i32, y: i32, cost: &[(u8, u32)]) {
    if !w.players.get(looter as usize).is_some_and(|p| p.race == RACE_TRANSH) {
        return;
    }
    let vt = w.team_of(victim);
    if vt == w.team_of(looter) || vt == crate::nature::NATURE_TEAM {
        return;
    }
    let mut total = 0;
    let pct = crate::ameliorations::loot_pct(w, looter, by);
    for &(it, n) in cost {
        if crate::races::is_currency(it) || it == SEVE || it == SELS {
            continue;
        }
        let g = (n * pct + 50) / 100;
        if g > 0 {
            crate::drones::refund(w, looter, x, y, it, g);
            total += g;
        }
    }
    if total > 0 {
        w.ev(EV_LOOT, x, y, looter as i32, total as i32);
    }
}

/// Unité `s` détruite par l'unité `by` du joueur `killer` (dernier coup) : butin si c'est un Transhumant.
pub fn loot_unit(w: &mut World, killer: u8, by: usize, s: usize) {
    let cost: Vec<(u8, u32)> = udef(w.units.kind[s]).cost.iter().map(|&(it, n)| (it, n as u32)).collect();
    let (x, y, owner) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
    loot(w, killer, by, owner, x, y, &cost);
}

/// Bâtiment `b` détruit : l'unité ennemie des Transhumants la plus proche (à LOOT_RANGE cases au plus ; à
/// égalité, la plus petite) le pille ; un chantier ne rend que ce qui y a été apporté.
pub fn loot_building(w: &mut World, b: usize) {
    if !w.players.iter().any(|p| p.race == RACE_TRANSH) {
        return;
    }
    let bb = &w.buildings[b];
    let (owner, (cx, cy)) = (bb.owner, bb.center());
    let team = w.team_of(owner);
    let r = (LOOT_RANGE * TILE) as i64;
    let mut best: Option<(i64, usize)> = None;
    w.grid.coarse.query(cx, cy, LOOT_RANGE * TILE, |s| {
        let o = w.units.owner[s];
        if !w.units.alive[s] || w.team_of(o) == team || w.players[o as usize].race != RACE_TRANSH {
            return;
        }
        let d = dist2(cx, cy, w.units.x[s], w.units.y[s]);
        if d <= r * r && best.is_none_or(|(bd, bs)| (d, s) < (bd, bs)) {
            best = Some((d, s));
        }
    });
    let Some((_, s)) = best else { return };
    let complete = bb.complete();
    let cost: Vec<(u8, u32)> = bb.def().cost.iter().enumerate().map(|(k, &(it, n))| (it, if complete { n as u32 } else { bb.paid[k] as u32 })).collect();
    let looter = w.units.owner[s];
    loot(w, looter, s, owner, cx, cy, &cost);
}

/// Points de vie (‰) : blindage des chenillards et de l'Arche.
pub fn hp_mult(w: &World, owner: u8, kind: u16) -> i32 {
    let d = udef(kind);
    if d.race == RACE_TRANSH && (d.deploys != NO_KIND || d.commander || kind == U_ARK_CAR) && w.players.get(owner as usize).is_some_and(|p| p.has_tech(T_T_ARMOR)) {
        1500
    } else {
        1000
    }
}

/// Fiche d'un module : chenillard correspondant, usure du gisement, taille de son réseau de transfert (JSON, champs
/// ajoutés à la fiche).
pub fn info(w: &World, b: usize) -> String {
    let bb = &w.buildings[b];
    let wear = if bb.kind == B_T_DRILL && bb.link != NONE { w.wear.get(bb.link as usize).copied().unwrap_or(0) as i32 } else { -1 };
    // générateur : ses poteaux (nombre, plafond, cases) pour le bouton « Planter un poteau » et la portée affichée
    let poles = if bb.kind == B_T_GENERATOR {
        let at: Vec<String> = poles_of(w, b).iter().map(|&p| format!("[{},{}]", w.buildings[p].x, w.buildings[p].y)).collect();
        format!(",\"poles\":[{}],\"polesMax\":{},\"poleReach\":{},\"at\":[{},{}]", at.join(","), crate::ameliorations::poles_max(bb), bdef(B_T_POLE).connect, bb.x, bb.y)
    } else if bb.kind == B_T_HOLD {
        let cost: Vec<String> = udef(U_T_CART).cost.iter().map(|&(it, n)| format!("[{},{}]", it, n)).collect();
        format!(",\"carts\":{},\"cartsMax\":{},\"cartCost\":[{}]", carts_of(w, b).len(), CARTS_PER_HOLD, cost.join(","))
    } else {
        String::new()
    };
    // (pas de chenillard : poteau, groupe de l'Arche)
    let ch = chenillard_of(bb.kind);
    let mods = crate::ameliorations::info(w, crate::ameliorations::Host::B(b));
    // réseau de transfert : nombre de bâtiments (1 : seul)
    let net = crate::transfert::size(w, b).max(1);
    format!(
        ",\"transh\":{{\"unit\":{},\"wear\":{},\"speed\":{},\"kw\":{},\"net\":{},\"mods\":{}{}}}",
        if ch == NO_KIND { -1 } else { ch as i32 },
        wear,
        crate::ameliorations::module_speed(bb),
        crate::buildings::power_prod_of(bb),
        net,
        mods,
        poles
    )
}
