//! Bâtiments : pose, construction, production, bras, laboratoires, usines, réseau électrique.
//! Un bâtiment qui attend un ingrédient ou de la place est mis en sommeil (champ `wake`)
//! et réveillé par l'événement qu'il attend.

use crate::belts::{self, DIRS};
use crate::data::*;
use crate::fixed::TILE;
use crate::map::P_LAND;
use crate::world::*;

const SLEEP: u32 = 60;
pub const RECIPE_SCALE: u32 = 100 * 1024;

#[inline]
fn needs_tick(c: BClass) -> bool {
    matches!(
        c,
        BClass::Extractor | BClass::Depot | BClass::Power | BClass::Inserter | BClass::Crafter | BClass::Lab | BClass::Factory | BClass::Turret | BClass::Shield | BClass::Silo | BClass::AntiMissile | BClass::Orbital | BClass::Gate | BClass::Transfer | BClass::Radar | BClass::Beacon | BClass::Station | BClass::CargoPad | BClass::Router | BClass::Portal | BClass::Roboport | BClass::Nest
    )
}

#[inline]
fn in_grid(c: BClass) -> bool {
    !matches!(c, BClass::Belt | BClass::Inserter)
}

/// Dimensions d'un bâtiment selon l'orientation.
pub fn dims(kind: u16, dir: u8) -> (i32, i32) {
    let (w, h) = bdef(kind).size;
    if dir & 1 == 1 {
        (h as i32, w as i32)
    } else {
        (w as i32, h as i32)
    }
}

/// Nombre de cases devant la face avant du bâtiment, et la `k`-ième (dans l'ordre de la face).
#[inline]
pub fn front_count(w: i32, h: i32, dir: u8) -> usize {
    (if dir & 1 == 0 { h } else { w }) as usize
}
#[inline]
pub fn front_tile_k(x: i32, y: i32, w: i32, h: i32, dir: u8, k: usize) -> (i32, i32) {
    let k = k as i32;
    match dir & 3 {
        0 => (x + w, y + k),
        1 => (x + k, y + h),
        2 => (x - 1, y + k),
        _ => (x + k, y - 1),
    }
}

/// Case juste devant le bâtiment (sortie).
pub fn front_tile(x: i32, y: i32, w: i32, h: i32, dir: u8) -> (i32, i32) {
    match dir & 3 {
        0 => (x + w, y + (h - 1) / 2),
        1 => (x + (w - 1) / 2, y + h),
        2 => (x - 1, y + (h - 1) / 2),
        _ => (x + (w - 1) / 2, y - 1),
    }
}

/// Bit de la direction d'une pose : la pose peut remplacer les tapis et tapis de contrôle du joueur
/// sur son emprise (pose par le joueur, quel que soit le bâtiment ; les IA posent sans ce bit).
pub const DIR_REPLACE: u8 = 4;

/// Bâtiments qui peuvent prendre la place des tapis du joueur (pose avec le bit DIR_REPLACE) : tous.
/// Un bâtiment posé sur des tapis les démonte (coût et objets rendus) au lieu d'être refusé.
fn replaces_belts(_class: BClass) -> bool {
    true
}

/// Bâtiment (indice) remplaçable sur la case `i` par une pose logistique du joueur `owner`.
fn replaceable_at(w: &World, owner: u8, i: usize) -> Option<usize> {
    let o = w.map.occ[i];
    if o == 0 {
        return None;
    }
    let b = (o - 1) as usize;
    let bb = &w.buildings[b];
    (bb.alive && bb.owner == owner && matches!(bb.def().class, BClass::Belt | BClass::Router)).then_some(b)
}

/// Fantômes au plus par joueur (les plus anciens sont oubliés au-delà).
const MAX_GHOSTS: usize = 300;
/// Distance de recherche d'un ingénieur inactif pour reconstruire (sous-unités).
const GHOST_RANGE: i32 = 40 * TILE;

/// Note un bâtiment détruit comme fantôme à reconstruire (type, position, direction et niveau, recette).
pub fn add_ghost(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    let g = Ghost {
        owner: bb.owner,
        kind: bb.kind,
        x: bb.x,
        y: bb.y,
        dir: bb.dir | bb.floor << 3,
        recipe: if bb.def().class == BClass::Crafter { bb.recipe } else { RECIPE_NONE },
        taken: NONE,
    };
    let owner = g.owner;
    if w.ghosts.iter().filter(|o| o.owner == owner).count() >= MAX_GHOSTS {
        if let Some(i) = w.ghosts.iter().position(|o| o.owner == owner) {
            w.ghosts.remove(i);
        }
    }
    w.ghosts.push(g);
}

/// L'ingénieur `id` a-t-il encore l'ordre de construire ce fantôme ?
fn ghost_taken_by(w: &World, id: u32, g: &Ghost) -> bool {
    let Some(s) = w.unit(id) else { return false };
    w.units.cold[s].orders.iter().any(|o| matches!(*o, Order::Build { kind, x, y, .. } if kind == g.kind && x == g.x && y == g.y))
}

/// Ingénieur inactif (sans ordre, non transporté) du joueur le plus proche de (x, y), à portée.
fn idle_engineer(w: &World, owner: u8, x: i32, y: i32) -> Option<usize> {
    let mut best = None;
    let mut bd = i64::MAX;
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.owner[s] != owner || udef(w.units.kind[s]).build_power == 0 {
            continue;
        }
        let c = &w.units.cold[s];
        if !c.orders.is_empty() || c.carried_by != NONE {
            continue;
        }
        let d = crate::fixed::dist2(x, y, w.units.x[s], w.units.y[s]);
        if d <= (GHOST_RANGE as i64) * (GHOST_RANGE as i64) && d < bd {
            bd = d;
            best = Some(s);
        }
    }
    best
}

/**
 * Reconstruction automatique (toutes les secondes) : un fantôme dont la case est libre est confié à
 * l'ingénieur inactif le plus proche ; un fantôme reconstruit reprend sa recette et disparaît ; un
 * fantôme dont la place est prise par autre chose est oublié.
 */
pub fn rebuild_ghosts(w: &mut World) {
    let mut assigned = 0;
    let mut i = 0;
    while i < w.ghosts.len() {
        let g = w.ghosts[i];
        let floor = floor_of(g.dir);
        if !w.map.inside(g.x, g.y) {
            w.ghosts.remove(i);
            continue;
        }
        let o = w.map.occ_floor(w.map.idx(g.x, g.y), floor);
        if o != 0 {
            let b = (o - 1) as usize;
            let bb = &w.buildings[b];
            if bb.kind == g.kind && bb.x == g.x && bb.y == g.y && bb.owner == g.owner {
                if !bb.complete() {
                    i += 1;
                    continue;
                }
                // reconstruit : sa recette d'avant
                if g.recipe != RECIPE_NONE && bb.def().class == BClass::Crafter && bb.recipe == RECIPE_NONE && w.players[g.owner as usize].has_tech(RECIPES[g.recipe as usize].tech) {
                    w.buildings[b].recipe = g.recipe;
                    w.buildings[b].wake = 0;
                }
            }
            w.ghosts.remove(i);
            continue;
        }
        if g.taken != NONE {
            if ghost_taken_by(w, g.taken, &g) {
                i += 1;
                continue;
            }
            w.ghosts[i].taken = NONE;
        }
        if assigned < 16 && can_place(w, g.owner, g.kind, g.x, g.y, g.dir) {
            let (bw, bh) = dims(g.kind, g.dir);
            let (cx, cy) = (g.x * TILE + bw * TILE / 2, g.y * TILE + bh * TILE / 2);
            if let Some(s) = idle_engineer(w, g.owner, cx, cy) {
                crate::orders::give(w, s, false, Order::Build { kind: g.kind, x: g.x, y: g.y, dir: g.dir, bid: 0 });
                w.ghosts[i].taken = w.unit_id(s);
                assigned += 1;
            }
        }
        i += 1;
    }
}

/// Libère l'emprise d'une pose avec remplacement. Un tapis du même type sur la même case est
/// simplement réorienté (renvoie son indice : rien à construire) ; sinon les tapis remplacés sont
/// démontés, leur coût et les objets qu'ils portent rendus au stock (renvoie None : poser le chantier).
pub fn clear_for_replace(w: &mut World, owner: u8, kind: u16, x: i32, y: i32, dir: u8) -> Option<usize> {
    // tapis surélevé : jamais de remplacement (il ne doit pas toucher aux tapis du sol en dessous)
    if floor_of(dir) > 0 {
        return None;
    }
    if dir & DIR_REPLACE == 0 || !replaces_belts(bdef(kind).class) {
        return None;
    }
    let (bw, bh) = dims(kind, dir);
    let mut found: Vec<usize> = Vec::new();
    for ty in y..y + bh {
        for tx in x..x + bw {
            if !w.map.inside(tx, ty) {
                return None;
            }
            if let Some(b) = replaceable_at(w, owner, w.map.idx(tx, ty)) {
                if !found.contains(&b) {
                    found.push(b);
                }
            }
        }
    }
    found.sort_unstable();
    if let [b] = found[..] {
        let bb = &w.buildings[b];
        if bb.kind == kind && bb.x == x && bb.y == y && bb.complete() {
            if bb.dir != dir & 3 {
                w.buildings[b].dir = dir & 3;
                belts::rebuild_around(w, &[(x, y)]);
                wake_watchers(w, b);
                w.buildings_version = w.buildings_version.wrapping_add(1);
            }
            return Some(b);
        }
    }
    for b in found {
        let p = owner as usize;
        if w.buildings[b].def().class == BClass::Belt {
            for _ in 0..8 {
                let it = belts::take_from_belt(w, b, &|_| true);
                if it == 0 {
                    break;
                }
                w.players[p].stock[it as usize] += 1;
            }
        }
        let def = w.buildings[b].def();
        let complete = w.buildings[b].complete();
        // fragments d'énergie installés : rendus au joueur
        w.players[p].shards += w.buildings[b].shards as u32;
        for (k, &(it, n)) in def.cost.iter().enumerate() {
            w.players[p].stock[it as usize] += if complete { n as i32 } else { w.buildings[b].paid[k] as i32 };
        }
        remove_building(w, b, false);
    }
    None
}

/// Niveau demandé dans l'octet de direction d'une pose (bits 3-4 ; 0 : sol).
#[inline]
pub fn floor_of(dir: u8) -> u8 {
    ((dir >> 3) & 3).min(crate::map::FLOORS - 1)
}

pub fn can_place(w: &World, owner: u8, kind: u16, x: i32, y: i32, dir: u8) -> bool {
    if kind as usize >= BUILDINGS.len() || owner as usize >= w.players.len() {
        return false;
    }
    let def = bdef(kind);
    if !w.players[owner as usize].has_tech(def.tech) {
        return false;
    }
    // un nid n'appartient qu'à la faune, et la faune ne pose que des nids
    if (def.class == BClass::Nest) != (w.team_of(owner) == crate::nature::NATURE_TEAM) {
        return false;
    }
    let (bw, bh) = dims(kind, dir);
    if x < 1 || y < 1 || x + bw > w.map.w - 1 || y + bh > w.map.h - 1 {
        return false;
    }
    // tapis surélevé : seule sa case à son niveau compte (il passe au-dessus du sol, de l'eau, des falaises)
    let floor = floor_of(dir);
    if floor > 0 {
        return def.class == BClass::Belt && w.map.occ_floor(w.map.idx(x, y), floor) == 0;
    }
    let replace = dir & DIR_REPLACE != 0 && replaces_belts(def.class);
    for ty in y..y + bh {
        for tx in x..x + bw {
            let i = w.map.idx(tx, ty);
            if w.map.occ[i] != 0 {
                // pose logistique du joueur : ses tapis et tapis de contrôle peuvent être remplacés
                if replace && replaceable_at(w, owner, i).is_some() {
                    continue;
                }
                return false;
            }
            if w.map.cliff[i] != 0 {
                return false;
            }
            let water = w.map.height[i] < w.map.water_level;
            if def.water != water {
                return false;
            }
            if def.deposit == 0 && w.map.deposit[i] != 0 {
                return false;
            }
        }
    }
    if def.deposit != 0 {
        let ok = w.map.spots.iter().any(|s| ((def.deposit == 255 && s.kind != GEYSER) || s.kind == def.deposit) && s.x >= x && s.y >= y && s.x + 2 <= x + bw && s.y + 2 <= y + bh);
        if !ok {
            return false;
        }
    }
    true
}

pub fn place_building(w: &mut World, owner: u8, kind: u16, x: i32, y: i32, dir: u8) -> Option<usize> {
    if !can_place(w, owner, kind, x, y, dir) {
        return None;
    }
    let def = bdef(kind);
    let (bw, bh) = dims(kind, dir);
    let slot = if let Some(s) = w.bfree.pop() {
        s as usize
    } else {
        w.buildings.push(Building::default());
        w.buildings.len() - 1
    };
    let gen = w.buildings[slot].gen.wrapping_add(1);
    let mut recipe = RECIPE_NONE;
    if def.class == BClass::Extractor {
        recipe = w.map.deposit[w.map.idx(x, y)];
        for ty in y..y + bh {
            for tx in x..x + bw {
                let d = w.map.deposit[w.map.idx(tx, ty)];
                if d != 0 {
                    recipe = d;
                }
            }
        }
    }
    let (fx, fy) = front_tile(x, y, bw, bh, dir);
    let floor = floor_of(dir);
    // répartiteur : ses sorties choisies à la pose (bits 5-6 de la direction)
    let split = if kind == B_SPLITTER { ((dir >> 5) & 3).min(2) } else { 0 };
    w.buildings[slot] = Building {
        alive: true,
        gen,
        kind,
        owner,
        floor,
        split,
        dir: dir & 3,
        x,
        y,
        hp: (def.hp / 10).max(1),
        build: 0,
        recipe,
        line: NONE,
        target: NONE,
        link: NONE,
        rally: (fx * TILE + TILE / 2 + DIRS[(dir & 3) as usize].0 * TILE * 3, fy * TILE + TILE / 2 + DIRS[(dir & 3) as usize].1 * TILE * 3),
        enabled: true,
        stash: if crate::logistics::carrier_kind(def.class).is_some() { vec![0; 2 * NUM_ITEMS] } else { Vec::new() },
        // pureté du gisement (extracteur, centrale géothermique)
        purity: if def.deposit != 0 { w.map.purity_under(x, y, bw, bh) as u8 } else { 0 },
        ..Building::default()
    };
    for ty in y..y + bh {
        for tx in x..x + bw {
            let i = w.map.idx(tx, ty);
            w.map.set_occ_floor(i, floor, slot as u32 + 1);
            if !def.passable && floor == 0 {
                w.map.update_pass_with(tx, ty, true);
            }
        }
    }
    if !def.passable {
        crate::flow::mark_dirty(w, x, y, bw, bh);
    }
    if in_grid(def.class) {
        let team = w.team_of(owner);
        w.grid.add_building(slot as u32, x, y, bw, bh, team);
    }
    if needs_tick(def.class) || def.collect {
        if let Err(p) = w.active.binary_search(&(slot as u32)) {
            w.active.insert(p, slot as u32);
        }
    }
    w.buildings_version = w.buildings_version.wrapping_add(1);
    Some(slot)
}

/// Tourne d'un quart de tour un tapis, un bras ou un tapis de contrôle terminé (ordre ROTATE), sur place
/// et sans reconstruction ; les objets du tapis restent dessus.
pub fn rotate(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    if !bb.alive || !bb.complete() || !matches!(bb.def().class, BClass::Belt | BClass::Inserter | BClass::Router) {
        return;
    }
    let (x, y, class) = (bb.x, bb.y, bb.def().class);
    let bb = &mut w.buildings[b];
    bb.dir = (bb.dir + 1) & 3;
    // un bras en plein geste le termine : il dépose l'objet tenu du côté de sa nouvelle direction
    bb.wake = 0;
    if class != BClass::Inserter {
        belts::rebuild_around(w, &[(x, y)]);
    }
    wake_watchers(w, b);
}

pub fn complete_building(w: &mut World, b: usize) {
    let bb = &mut w.buildings[b];
    bb.build = BUILD_FULL;
    bb.hp = bb.def().hp;
    bb.wake = 0;
    let def = bb.def();
    if def.shield_hp > 0 {
        bb.shield = def.shield_hp / 2;
    }
    let (x, y, owner, kind) = (bb.x, bb.y, bb.owner, bb.kind);
    if def.power_use > 0 || def.power_prod > 0 || def.supply > 0 {
        w.power_dirty = true;
    }
    if def.class == BClass::Belt {
        belts::rebuild_around(w, &[(x, y)]);
    }
    if def.class == BClass::Depot {
        let lv = (w.buildings[b].level as usize).min(DEPOT_CAP.len() - 1);
        w.players[owner as usize].stock_cap += DEPOT_CAP[lv];
    }
    // fabricant sans recette collé à une machine identique : il prend sa recette (machines jumelles)
    crate::twins::adopt_twin_recipe(w, b);
    w.buildings_version = w.buildings_version.wrapping_add(1);
    w.ev(EV_BUILT, owner as i32, kind as i32, x, y);
}

pub fn remove_building(w: &mut World, b: usize, with_wreck: bool) {
    let (x, y, kind) = (w.buildings[b].x, w.buildings[b].y, w.buildings[b].kind);
    let (bw, bh) = w.buildings[b].size();
    let def = bdef(kind);
    let floor = w.buildings[b].floor;
    if def.class == BClass::Depot && w.buildings[b].complete() {
        let lv = (w.buildings[b].level as usize).min(DEPOT_CAP.len() - 1);
        let owner = w.buildings[b].owner as usize;
        w.players[owner].stock_cap -= DEPOT_CAP[lv];
    }
    w.buildings[b].alive = false;
    for ty in y..y + bh {
        for tx in x..x + bw {
            let i = w.map.idx(tx, ty);
            if w.map.occ_floor(i, floor) == b as u32 + 1 {
                w.map.set_occ_floor(i, floor, 0);
                if floor == 0 {
                    w.map.update_pass_with(tx, ty, false);
                }
            }
        }
    }
    if !def.passable {
        crate::flow::mark_dirty(w, x, y, bw, bh);
    }
    if in_grid(def.class) {
        w.grid.remove_building(b as u32, x, y, bw, bh);
    }
    if let Ok(p) = w.active.binary_search(&(b as u32)) {
        w.active.remove(p);
    }
    if def.class == BClass::Belt {
        belts::rebuild_around(w, &[(x, y)]);
    }
    if def.power_use > 0 || def.power_prod > 0 || def.supply > 0 {
        w.power_dirty = true;
    }
    if with_wreck && !matches!(def.class, BClass::Belt | BClass::Inserter | BClass::Pylon | BClass::Wall) && w.buildings[b].build > BUILD_FULL / 2 {
        let (cx, cy) = w.buildings[b].center();
        let (kind, dir) = (w.buildings[b].kind, w.buildings[b].dir & 3);
        w.spawn_wreck(cx, cy, def.cost, (bw.max(bh)) as u8, WRECK_BUILDING | kind, dir as u16 * 16384);
    }
    w.buildings[b].watchers.clear();
    w.buildings[b].queue.clear();
    w.bfree.push(b as u32);
    w.buildings_version = w.buildings_version.wrapping_add(1);
}

// ---------- Réseau électrique ----------

/// Énergie que donne cet objet au générateur `kind` (0 : il ne le brûle pas). Le réacteur à cristal brûle
/// des cellules d'énergie, les autres de l'hydrocarbure ou du carburant.
pub fn fuel_energy(kind: u16, item: u8) -> i32 {
    if bdef(kind).class != BClass::Power || kind == B_GEOTHERMAL {
        return 0;
    }
    match (kind == B_CRYSTAL_REACTOR, item) {
        (true, ENERGY_CELL) => FUEL_CELL,
        (false, HYDROCARBON) => FUEL_HYDROCARBON,
        (false, FUEL) => FUEL_REFINED,
        _ => 0,
    }
}

/// Objet combustible (hydrocarbure, carburant, cellule d'énergie) : le tapis ou le bras qui le
/// transporte est alimenté par lui et ne s'arrête pas, même hors zone électrique.
#[inline]
pub fn is_fuel(item: u8) -> bool {
    matches!(item, HYDROCARBON | FUEL | ENERGY_CELL)
}

/// Le générateur reçoit du combustible : son alerte est levée quand il est de nouveau bien rempli
/// (et ne sera pas redonnée tant qu'il ne retombe pas à sec).
fn refueled(bb: &mut Building) {
    if bb.fuel_alert == 2 {
        bb.fuel_alert = 1;
    }
    if bb.fuel >= fuel_tank(bb.kind) / 2 {
        bb.fuel_alert = 0;
    }
}

/// Réservoir d'un générateur (kW × ticks).
pub fn fuel_tank(kind: u16) -> i32 {
    FUEL_TANK_UNITS * if kind == B_CRYSTAL_REACTOR { FUEL_CELL / 4 } else { FUEL_HYDROCARBON }
}

/// Le bâtiment a-t-il besoin d'électricité ? (un extracteur sur un gisement d'hydrocarbure n'en a pas)
#[inline]
pub fn needs_power(bb: &Building) -> bool {
    bb.def().power_use > 0 && !(bb.def().class == BClass::Extractor && bb.recipe == HYDROCARBON)
}

/// Générateur : un dépôt collé l'alimente depuis la réserve du joueur (1 unité de combustible par
/// seconde au plus, quand le réservoir a la place), puis il partage son combustible avec les générateurs
/// collés (`share_fuel`) ; il dort le reste du temps.
fn tick_generator(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + DEPOT_FEED_PERIOD;
    feed_generator_from_depot(w, b);
    let mut twins = [0usize; MAX_TWINS];
    let n = twins_into(w, b, &mut twins);
    if n > 0 {
        share_fuel(w, b, &twins[..n]);
    }
}

fn feed_generator_from_depot(w: &mut World, b: usize) {
    let (kind, owner) = (w.buildings[b].kind, w.buildings[b].owner as usize);
    if touching_depots(w, b) == 0 {
        return;
    }
    for it in [HYDROCARBON, FUEL, ENERGY_CELL] {
        let e = fuel_energy(kind, it);
        if e > 0 && w.buildings[b].fuel + e <= fuel_tank(kind) && w.avail(owner, it) > 0 {
            w.pay(owner, it, 1);
            if w.buildings[b].fuel <= 0 {
                w.power_dirty = true;
            }
            w.buildings[b].fuel += e;
            refueled(&mut w.buildings[b]);
            break;
        }
    }
}

/// Puissance que le générateur `b` fournit en ce moment (kW) : sa part de la charge de sa zone.
pub fn gen_output(w: &World, b: usize) -> i32 {
    let bb = &w.buildings[b];
    let Some(n) = w.nets.get(bb.net as usize) else { return 0 };
    if bb.net == 0 || (bb.fuel <= 0 && bb.kind != B_GEOTHERMAL) || n.prod <= 0 {
        return 0;
    }
    (gen_prod(w, bb) as i64 * (n.demand.min(n.prod)) as i64 / n.prod as i64) as i32
}

pub fn rebuild_power(w: &mut World) {
    w.power_dirty = false;
    let np = w.players.len();
    w.nets.clear();
    w.nets.push(Net::default());
    let mut pole_net: Vec<u16> = vec![0; w.buildings.len()];
    let max_supply = BUILDINGS.iter().map(|d| d.supply).max().unwrap_or(0);
    for owner in 0..np as u8 {
        let poles: Vec<usize> = (0..w.buildings.len())
            .filter(|&i| {
                let b = &w.buildings[i];
                // un générateur sans combustible ne forme plus de zone et ne relie plus ses voisins
                b.alive && b.owner == owner && b.complete() && b.def().supply > 0 && !(b.def().class == BClass::Power && b.fuel <= 0 && b.kind != B_GEOTHERMAL)
            })
            .collect();
        // union-find
        let mut parent: Vec<usize> = (0..poles.len()).collect();
        fn find(p: &mut [usize], i: usize) -> usize {
            let mut r = i;
            while p[r] != r {
                r = p[r];
            }
            let mut c = i;
            while p[c] != r {
                let n = p[c];
                p[c] = r;
                c = n;
            }
            r
        }
        for i in 0..poles.len() {
            let (ax, ay) = w.buildings[poles[i]].center();
            let ca = w.buildings[poles[i]].def().connect;
            for j in (i + 1)..poles.len() {
                let (bx, by) = w.buildings[poles[j]].center();
                let r = ca.min(w.buildings[poles[j]].def().connect) * TILE;
                if crate::fixed::dist2(ax, ay, bx, by) <= (r as i64) * (r as i64) {
                    let (ra, rb) = (find(&mut parent, i), find(&mut parent, j));
                    if ra != rb {
                        let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
                        parent[hi] = lo;
                    }
                }
            }
        }
        // réseau partout (tests, démos) : un réseau illimité pour ce qui n'est dans aucune zone
        let fallback = if w.infinite_grid {
            w.nets.push(Net { sat: 1024, owner, unlimited: true, ..Net::default() });
            (w.nets.len() - 1) as u16
        } else {
            0
        };
        let mut root_net: Vec<u16> = vec![0; poles.len()];
        for i in 0..poles.len() {
            let r = find(&mut parent, i);
            if root_net[r] == 0 {
                w.nets.push(Net { sat: 1024, owner, ..Net::default() });
                root_net[r] = (w.nets.len() - 1) as u16;
            }
            root_net[i] = root_net[r];
        }
        // chaque bâtiment électrique rejoint le réseau du premier poteau (indice le plus bas) dont la zone
        // d'alimentation touche son emprise ; recherche locale par la grille des bâtiments
        for (i, &pb) in poles.iter().enumerate() {
            pole_net[pb] = root_net[i];
        }
        for bi in 0..w.buildings.len() {
            let b = &w.buildings[bi];
            if !b.alive || b.owner != owner {
                continue;
            }
            let def = b.def();
            if def.power_use == 0 && def.power_prod == 0 && def.supply == 0 {
                w.buildings[bi].net = 0;
                continue;
            }
            let (bw, bh) = b.size();
            let (bx, by) = (b.x, b.y);
            let (cx, cy) = b.center();
            let r = (max_supply + bw.max(bh) + 1) * TILE;
            let mut best = usize::MAX;
            w.grid.query_buildings(cx, cy, r, |p| {
                if p >= best || pole_net[p] == 0 {
                    return;
                }
                let pb = &w.buildings[p];
                let (pw, ph) = pb.size();
                let sp = pb.def().supply;
                if bx < pb.x + pw + sp && bx + bw > pb.x - sp && by < pb.y + ph + sp && by + bh > pb.y - sp {
                    best = p;
                }
            });
            let net = if best != usize::MAX { pole_net[best] } else { fallback };
            if b.complete() && def.power_prod > 0 && net != 0 && net != fallback {
                // les générateurs de la zone : leur production dépend de leur combustible (power_tick)
                let cap = gen_prod(w, b);
                let n = &mut w.nets[net as usize];
                n.gens.push(bi as u32);
                n.cap += cap;
            }
            w.buildings[bi].net = net;
            if net != 0 {
                w.buildings[bi].wake = 0;
                // les tapis consomment en permanence (ils n'ont pas de tick propre)
                if def.class == BClass::Belt && w.buildings[bi].complete() {
                    w.nets[net as usize].belt_demand += def.power_use;
                }
            }
        }
        for &pb in &poles {
            pole_net[pb] = 0;
        }
    }
}

/// Un tick du réseau : seuls les générateurs qui ont du combustible produisent ; ils brûlent leur part
/// de la charge (au prorata de leur puissance), donc d'autant plus vite que la zone consomme.
pub fn power_tick(w: &mut World) {
    for p in w.players.iter_mut() {
        p.power_prod = 0;
        p.power_use = 0;
    }
    for ni in 1..w.nets.len() {
        let belts = w.nets[ni].belt_demand;
        w.nets[ni].demand_next += belts;
        if w.nets[ni].unlimited {
            let n = &mut w.nets[ni];
            n.demand = n.demand_next;
            n.demand_next = 0;
            n.prod = n.demand;
            n.sat = 1024;
            continue;
        }
        let gens = std::mem::take(&mut w.nets[ni].gens);
        let mut cap = 0i64;
        for &g in &gens {
            let bb = &w.buildings[g as usize];
            if bb.alive && (bb.fuel > 0 || bb.kind == B_GEOTHERMAL) {
                cap += gen_prod(w, bb) as i64;
            }
        }
        let demand = w.nets[ni].demand_next as i64;
        if cap > 0 && demand > 0 {
            let used = demand.min(cap);
            for &g in &gens {
                let bb = &mut w.buildings[g as usize];
                // la géothermie ne brûle rien
                if bb.alive && bb.fuel > 0 && bb.kind != B_GEOTHERMAL {
                    let burn = (power_prod_of(bb) as i64 * used / cap).max(1) as i32;
                    bb.fuel = (bb.fuel - burn).max(0);
                    let (owner, kind) = (bb.owner as i32, bb.kind as i32);
                    let (cx, cy) = bb.center();
                    if bb.fuel == 0 {
                        // à sec : sa zone disparaît
                        w.power_dirty = true;
                        if bb.fuel_alert < 2 {
                            bb.fuel_alert = 2;
                            w.ev(EV_FUEL_DRY, owner, cx, cy, kind);
                        }
                    } else if bb.fuel_alert == 0 && (bb.fuel as i64) < burn as i64 * 1200 {
                        // moins d'une minute à cette charge
                        bb.fuel_alert = 1;
                        w.ev(EV_FUEL_LOW, owner, cx, cy, kind);
                    }
                }
            }
        }
        let n = &mut w.nets[ni];
        n.gens = gens;
        n.prod = cap as i32;
        n.demand = demand as i32;
        n.demand_next = 0;
        n.sat = if demand <= 0 { 1024 } else { ((cap * 1024 / demand) as i32).min(1024) };
        let (prod, dem, owner) = (n.prod, n.demand, n.owner as usize);
        if let Some(p) = w.players.get_mut(owner) {
            p.power_prod += prod;
            p.power_use += dem;
        }
    }
}

/// Consomme l'énergie du bâtiment pour ce tick et renvoie la satisfaction (0..1024).
#[inline]
pub fn use_power(w: &mut World, b: usize, amount: i32) -> i32 {
    let n = w.buildings[b].net as usize;
    if n == 0 || n >= w.nets.len() {
        return 0;
    }
    w.nets[n].demand_next += amount;
    w.nets[n].sat
}

#[inline]
pub fn wake_watchers(w: &mut World, b: usize) {
    let ws = std::mem::take(&mut w.buildings[b].watchers);
    for i in ws {
        if let Some(x) = w.buildings.get_mut(i as usize) {
            x.wake = 0;
        }
    }
}

/// Rotation d'un bras en quarts de tour (1, 2 ou 3 ; 2 par défaut).
#[inline]
pub fn arm_turn(bb: &Building) -> u8 {
    if (1..=3).contains(&bb.turn) {
        bb.turn
    } else {
        2
    }
}

/// Case de prise et case de dépose d'un bras (à `reach` cases). Il dépose devant lui ; il prend derrière
/// (demi-tour), à sa droite (quart de tour) ou à sa gauche (trois quarts de tour).
pub fn arm_ends(bb: &Building) -> ((i32, i32), (i32, i32)) {
    let (dx, dy) = DIRS[(bb.dir & 3) as usize];
    let (px, py) = DIRS[((bb.dir + arm_turn(bb)) & 3) as usize];
    let r = bb.def().reach.max(1) as i32;
    ((bb.x + px * r, bb.y + py * r), (bb.x + dx * r, bb.y + dy * r))
}

/// Portée maximale des bras (cases) : pourtour à examiner autour d'un bâtiment pour trouver ses bras.
const ARM_REACH_MAX: i32 = 2;

/// Bras qui se servent au bâtiment `sb` (leur case de prise est dans son emprise), par indice croissant.
pub fn takers_of(w: &World, sb: usize) -> Vec<usize> {
    let bb = &w.buildings[sb];
    let (bw, bh) = bb.size();
    let inside = |x: i32, y: i32| x >= bb.x && x < bb.x + bw && y >= bb.y && y < bb.y + bh;
    let mut v = Vec::new();
    let r = ARM_REACH_MAX;
    for ty in bb.y - r..bb.y + bh + r {
        for tx in bb.x - r..bb.x + bw + r {
            if inside(tx, ty) || !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let c = (o - 1) as usize;
            let cb = &w.buildings[c];
            if !cb.alive || cb.def().class != BClass::Inserter || !cb.complete() {
                continue;
            }
            let ((sx, sy), _) = arm_ends(cb);
            if inside(sx, sy) {
                v.push(c);
            }
        }
    }
    v.sort_unstable();
    v
}

/// Bâtiments qui reçoivent directement les produits d'un voisin collé (transfert direct, sans bras).
fn direct_receiver(c: BClass) -> bool {
    matches!(c, BClass::Depot | BClass::Warehouse | BClass::Station | BClass::CargoPad | BClass::Crafter | BClass::Lab | BClass::Factory | BClass::Silo | BClass::AntiMissile | BClass::Power)
}

/// Bâtiments qui donnent directement leurs produits à un voisin collé.
fn direct_giver(c: BClass) -> bool {
    matches!(c, BClass::Crafter | BClass::Extractor)
}

/// La case (x, y) touche-t-elle une face du rectangle (bx, by, bw, bh) (case voisine d'un bord, hors coins) ?
fn on_face(bx: i32, by: i32, bw: i32, bh: i32, x: i32, y: i32) -> bool {
    ((x == bx - 1 || x == bx + bw) && y >= by && y < by + bh) || ((y == by - 1 || y == by + bh) && x >= bx && x < bx + bw)
}

/// Le voisin collé `c` peut-il recevoir directement l'objet `it` de `sb` ? Même propriétaire, et un
/// fabricant ne reçoit d'un autre fabricant que les ingrédients de sa recette en cours (pas de
/// changement de recette par simple contact : deux fonderies de fer côte à côte restent de fer).
fn direct_ok(w: &World, sb: usize, c: usize, it: u8) -> bool {
    let (sbb, cb) = (&w.buildings[sb], &w.buildings[c]);
    if cb.owner != sbb.owner || !accepts(w, c, it) {
        return false;
    }
    if cb.def().class == BClass::Crafter && sbb.def().class == BClass::Crafter {
        return cb.recipe != RECIPE_NONE && RECIPES[cb.recipe as usize].inputs.iter().any(|x| x.0 == it);
    }
    true
}

/// Sorties d'un bâtiment, par indice croissant, en un seul parcours du pourtour :
/// - les bras qui s'y servent ;
/// - pour un bâtiment de fabrication, les tapis qui partent de ses faces (trappes) ;
/// - pour un fabricant ou un extracteur, les bâtiments collés à une face qui reçoivent des objets
///   (transfert direct).
///
/// Elles reçoivent ses produits à tour de rôle, selon leur part (voir `next_outlet`).
pub fn outlets_of(w: &World, sb: usize) -> Vec<usize> {
    let bb = &w.buildings[sb];
    let (bw, bh) = bb.size();
    let belts_too = bb.def().class == BClass::Crafter;
    let direct = direct_giver(bb.def().class);
    let inside = |x: i32, y: i32| x >= bb.x && x < bb.x + bw && y >= bb.y && y < bb.y + bh;
    let mut v = Vec::new();
    let r = ARM_REACH_MAX;
    for ty in bb.y - r..bb.y + bh + r {
        for tx in bb.x - r..bb.x + bw + r {
            if inside(tx, ty) || !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let c = (o - 1) as usize;
            let cb = &w.buildings[c];
            if !cb.alive || !cb.complete() {
                continue;
            }
            match cb.def().class {
                BClass::Inserter => {
                    let ((sx, sy), _) = arm_ends(cb);
                    if inside(sx, sy) {
                        v.push(c);
                    }
                }
                BClass::Belt if belts_too => {
                    // tapis contre une face (pas un coin), tourné vers l'extérieur
                    let face = if tx == bb.x - 1 && ty >= bb.y && ty < bb.y + bh {
                        2
                    } else if tx == bb.x + bw && ty >= bb.y && ty < bb.y + bh {
                        0
                    } else if ty == bb.y - 1 && tx >= bb.x && tx < bb.x + bw {
                        3
                    } else if ty == bb.y + bh && tx >= bb.x && tx < bb.x + bw {
                        1
                    } else {
                        255
                    };
                    if face != 255 && belts::takes_from_face(w, c, face) {
                        v.push(c);
                    }
                }
                cl if direct && c != sb && direct_receiver(cl) && cb.owner == bb.owner && on_face(bb.x, bb.y, bw, bh, tx, ty) => v.push(c),
                _ => {}
            }
        }
    }
    v.sort_unstable();
    v.dedup();
    v
}

/// Le bâtiment `b` a-t-il une sortie sans bras : tapis de sortie (fabricant) ou voisin collé qui reçoit
/// des objets ? Test rapide (cases des faces seulement) avant le calcul complet des sorties.
fn has_direct_outlet(w: &World, b: usize) -> bool {
    let bb = &w.buildings[b];
    let class = bb.def().class;
    if !direct_giver(class) {
        return false;
    }
    let (bw, bh) = bb.size();
    let probe = |x: i32, y: i32, d: u8| -> bool {
        if !w.map.inside(x, y) {
            return false;
        }
        let o = w.map.occ[w.map.idx(x, y)];
        if o == 0 || (o - 1) as usize == b {
            return false;
        }
        let tb = &w.buildings[(o - 1) as usize];
        if !tb.alive || !tb.complete() {
            return false;
        }
        let tc = tb.def().class;
        (tc == BClass::Belt && class == BClass::Crafter && belts::takes_from_face(w, (o - 1) as usize, d)) || (direct_receiver(tc) && tb.owner == bb.owner)
    };
    (bb.x..bb.x + bw).any(|x| probe(x, bb.y - 1, 3) || probe(x, bb.y + bh, 1)) || (bb.y..bb.y + bh).any(|y| probe(bb.x - 1, y, 2) || probe(bb.x + bw, y, 0))
}

/// Poids des sorties (millièmes de %) : les parts réglées des bras, puis le reste à égalité entre les
/// sorties en automatique (bras sans réglage et tapis).
pub fn share_weights(w: &World, takers: &[usize]) -> Vec<u64> {
    let explicit: u64 = takers.iter().map(|&c| w.buildings[c].share as u64).sum();
    let autos = takers.iter().filter(|&&c| w.buildings[c].share == 0).count() as u64;
    let rest = 100_000u64.saturating_sub(explicit * 1000);
    takers
        .iter()
        .map(|&c| {
            let s = w.buildings[c].share as u64;
            if s > 0 {
                s * 1000
            } else {
                (rest / autos.max(1)).max(1)
            }
        })
        .collect()
}

const SHARE_STRIDE: u64 = 1 << 32;

/// Le bras `c` est-il prêt à prendre l'objet `it` (main vide, au repos, cible qui l'accepte) ?
fn taker_ready(w: &World, c: usize, it: u8) -> bool {
    let cb = &w.buildings[c];
    if cb.phase != 0 || cb.hand != 0 {
        return false;
    }
    let (_, (tx, ty)) = arm_ends(cb);
    if !w.map.inside(tx, ty) {
        return false;
    }
    let o = w.map.occ[w.map.idx(tx, ty)];
    if o == 0 {
        return false;
    }
    let t = (o - 1) as usize;
    w.buildings[t].complete() && (it == 0 || w.buildings[t].def().class == BClass::Belt || accepts(w, t, it))
}

/// Satisfaction électrique minimale (sur 1024) pour qu'un bras travaille.
const ARM_MIN_SAT: i32 = 256;

/// Le bras `c` a-t-il assez de courant pour travailler (même seuil que `tick_inserter`) ?
fn arm_powered(w: &World, c: usize) -> bool {
    let n = w.buildings[c].net as usize;
    n != 0 && n < w.nets.len() && w.nets[n].sat >= ARM_MIN_SAT
}

/// La sortie `c` de `sb` (bras, tapis ou voisin collé) peut-elle recevoir l'objet `it` maintenant ? Un
/// bras sans courant ne compte pas : il ne prendrait jamais son tour et bloquerait les autres sorties.
fn outlet_ready(w: &World, sb: usize, c: usize, it: u8) -> bool {
    match w.buildings[c].def().class {
        BClass::Belt => belts::belt_has_room(w, c),
        // un bras sans courant prend quand même son tour pour du combustible
        BClass::Inserter => (arm_powered(w, c) || is_fuel(it)) && taker_ready(w, c, it),
        _ => direct_ok(w, sb, c, it),
    }
}

/**
 * Tour de rôle (ordonnancement à pas pondérés) entre les sorties de `sb` (bras et tapis) : parmi
 * celles qui sont prêtes (et `me`, qui l'est), celle dont le compteur est le plus bas reçoit l'objet ;
 * son compteur avance de STRIDE / poids. Une sortie restée inactive repart du temps virtuel de la
 * source (pas de crédit accumulé). Renvoie la sortie choisie et son pas (0 : sortie unique).
 */
fn next_outlet(w: &World, sb: usize, outs: &[usize], me: Option<usize>) -> Option<(usize, u64)> {
    let it = output_of(&w.buildings[sb]);
    if outs.len() <= 1 {
        return outs.first().filter(|&&c| Some(c) == me || outlet_ready(w, sb, c, it)).map(|&c| (c, 0));
    }
    let weights = share_weights(w, outs);
    let v = w.buildings[sb].vpass;
    let mut best: Option<(usize, u64, u64)> = None;
    for (i, &c) in outs.iter().enumerate() {
        if Some(c) != me && !outlet_ready(w, sb, c, it) {
            continue;
        }
        let k = w.buildings[c].pass.max(v);
        if best.is_none_or(|(_, bk, _)| k < bk) {
            best = Some((c, k, SHARE_STRIDE / weights[i]));
        }
    }
    best.map(|(c, _, st)| (c, st))
}

/// La sortie `c` de `sb` vient de recevoir un objet : son compteur avance de `stride`.
fn advance_outlet(w: &mut World, sb: usize, c: usize, stride: u64) {
    if stride == 0 {
        return;
    }
    let v = w.buildings[sb].vpass;
    let start = w.buildings[c].pass.max(v);
    w.buildings[c].pass = start + stride;
    w.buildings[sb].vpass = start;
}

/**
 * Tour du bras `me` sur sa source `sb` : renvoie son pas s'il peut prendre, sinon None après avoir
 * réveillé la sortie prioritaire (un autre bras, ou la source elle-même si c'est un de ses tapis ou
 * un voisin collé : c'est elle qui les sert).
 */
fn share_turn(w: &mut World, me: usize, sb: usize) -> Option<u64> {
    let outs = outlets_of(w, sb);
    if outs.len() <= 1 {
        return Some(0);
    }
    match next_outlet(w, sb, &outs, Some(me)) {
        Some((c, st)) if c == me => Some(st),
        Some((c, _)) => {
            let target = if w.buildings[c].def().class == BClass::Inserter { c } else { sb };
            w.buildings[target].wake = 0;
            None
        }
        None => Some(0),
    }
}

/// Part effective d'un bras dans la sortie de sa source (millièmes) et nombre de sorties de cette source
/// (bras, tapis et voisins collés).
pub fn share_info(w: &World, b: usize) -> (u64, usize) {
    let ((sx, sy), _) = arm_ends(&w.buildings[b]);
    if !w.map.inside(sx, sy) {
        return (1000, 1);
    }
    let o = w.map.occ[w.map.idx(sx, sy)];
    if o == 0 || w.buildings[(o - 1) as usize].def().class == BClass::Belt {
        return (1000, 1);
    }
    let takers = outlets_of(w, (o - 1) as usize);
    let Some(mi) = takers.iter().position(|&c| c == b) else { return (1000, 1) };
    let weights = share_weights(w, &takers);
    let total: u64 = weights.iter().sum();
    (weights[mi] * 1000 / total.max(1), takers.len())
}

fn watch(w: &mut World, target: usize, me: usize) {
    let v = &mut w.buildings[target].watchers;
    if !v.contains(&(me as u32)) && v.len() < 16 {
        v.push(me as u32);
    }
}

// ---------- Entrées / sorties d'objets ----------
fn recipe_for(w: &World, b: &Building, item: u8) -> u8 {
    let cr = b.def().crafter;
    let p = &w.players[b.owner as usize];
    for (i, r) in RECIPES.iter().enumerate() {
        if r.crafter == cr && p.has_tech(r.tech) && r.inputs.iter().any(|x| x.0 == item) {
            return i as u8;
        }
    }
    RECIPE_NONE
}

fn cost_slot(cost: &[(u8, u16)], item: u8) -> Option<usize> {
    cost.iter().position(|c| c.0 == item)
}

// ---------- débit de la dernière minute ----------

/// Compte `n` objets produits (ou reçus, déplacés) par le bâtiment, dans la tranche de 10 s en cours.
pub fn flow_add(bb: &mut Building, tick: u32, n: u16) {
    let t = tick / FLOW_SLICE;
    if t != bb.flow_at {
        // tranches écoulées depuis le dernier compte : remises à zéro (au plus une minute)
        let gap = t.saturating_sub(bb.flow_at).min(FLOW_SLICES as u32);
        for k in 1..=gap {
            bb.flow[((bb.flow_at + k) % FLOW_SLICES as u32) as usize] = 0;
        }
        bb.flow_at = t;
    }
    let c = &mut bb.flow[(t % FLOW_SLICES as u32) as usize];
    *c = c.saturating_add(n);
}

/// Débit moyen sur la dernière minute, en dixièmes par minute : les 5 tranches complètes et la tranche en cours.
pub fn flow_per_min(bb: &Building, tick: u32) -> u32 {
    let t = tick / FLOW_SLICE;
    let mut total = 0u32;
    for k in 0..FLOW_SLICES as u32 {
        // tranche jamais comptée depuis (plus récente que flow_at) : vide ; sinon encore dans la fenêtre
        if let Some(s) = t.checked_sub(k).filter(|&s| s <= bb.flow_at) {
            total += bb.flow[(s % FLOW_SLICES as u32) as usize] as u32;
        }
    }
    let span = (FLOW_SLICES as u32 - 1) * FLOW_SLICE + tick % FLOW_SLICE + 1;
    (total as u64 * 1200 * 10 / span as u64) as u32
}

/// Débit maximal du bâtiment à pleine énergie, en dixièmes par minute, pour sa production en cours
/// (recette, unité en tête de file, recherche) ; 0 : pas de maximum (dépôt, rien en cours).
/// Mêmes règles que les ticks de production : à comparer à flow_per_min.
pub fn flow_max(w: &World, b: usize) -> u32 {
    let bb = &w.buildings[b];
    let owner = bb.owner as usize;
    let tenths = |num: u64, den: u64| (num / den.max(1)) as u32;
    match bb.def().class {
        // un cycle : time * RECIPE_SCALE de progrès, speed * 1024 par tick
        BClass::Crafter if bb.recipe != RECIPE_NONE => {
            let r = &RECIPES[bb.recipe as usize];
            tenths(12_000 * r.output.1 as u64 * crafter_speed(bb) as u64, r.time as u64 * 100)
        }
        // un objet : 30 * RECIPE_SCALE de progrès, 1024 * res_mult * vitesse du niveau / 100 par tick
        BClass::Extractor => {
            let lvl = EXTRACTOR_LEVELS[(bb.level as usize).min(EXTRACTOR_LEVELS.len() - 1)].speed as u64;
            tenths(12_000 * w.players[owner].res_mult.max(0) as u64 * lvl, 30 * 100 * 100)
        }
        // une unité : build * 20 * RECIPE_SCALE de progrès, 1024 * build_mult par tick
        BClass::Factory => bb.queue.first().map_or(0, |q| tenths(12_000 * w.players[owner].build_mult.max(0) as u64, udef(q.0).build as u64 * 20 * 100)),
        // un cycle de recherche : time secondes
        BClass::Lab => {
            let t = if bb.working { bb.tech } else { w.players[owner].research };
            if t == 0 { 0 } else { tenths(600, TECHS[t as usize].time as u64) }
        }
        // prise, aller (SWING ticks), dépose, retour (SWING ticks)
        BClass::Inserter => tenths(12_000, 2 * SWING as u64 + 2),
        _ => 0,
    }
}

// ---------- usines : réserve de composants ----------
//
// Une usine garde ses composants par objet (`stash`, NUM_ITEMS cases, allouée au premier dépôt), pour toute sa file :
// jusqu'à deux unités d'avance pour chaque type d'unité en attente. Un changement de file ne perd donc rien.

/// Composants d'avance qu'une usine garde : `FACTORY_AHEAD` fois le coût de chaque type d'unité de sa file.
const FACTORY_AHEAD: u16 = 2;

/// Quantité de l'objet `item` dans la réserve de l'usine.
pub fn factory_has(bb: &Building, item: u8) -> u16 {
    bb.stash.get(item as usize).copied().unwrap_or(0)
}

/// Plafond de la réserve de l'usine pour `item` : deux fois le plus gros besoin d'une unité de la file.
fn factory_limit(bb: &Building, item: u8) -> u16 {
    bb.queue.iter().map(|q| udef(q.0).cost.iter().find(|c| c.0 == item).map_or(0, |c| c.1)).max().unwrap_or(0).saturating_mul(FACTORY_AHEAD)
}

/// Place encore libre dans la réserve de l'usine pour `item`.
pub fn factory_room(bb: &Building, item: u8) -> u16 {
    factory_limit(bb, item).saturating_sub(factory_has(bb, item))
}

pub fn factory_put(bb: &mut Building, item: u8, n: u16) {
    if bb.stash.len() < NUM_ITEMS {
        bb.stash.resize(NUM_ITEMS, 0);
    }
    bb.stash[item as usize] += n;
}

/// Après un changement de file : rend au stock du joueur ce qui dépasse le nouveau plafond de la réserve.
pub fn factory_trim(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner as usize;
    for it in 0..w.buildings[b].stash.len() {
        let bb = &w.buildings[b];
        let extra = bb.stash[it].saturating_sub(factory_limit(bb, it as u8));
        if extra > 0 {
            w.buildings[b].stash[it] -= extra;
            w.players[owner].stock[it] += extra as i32;
        }
    }
}

/// Machines jumelles qui travaillent : elles partagent ingrédients et produits une fois toutes les `TWIN_PERIOD` ticks
/// (à l'arrêt, à chacun de leurs passages).
const TWIN_PERIOD: u32 = 10;

/// Machines jumelles de `b`, par indice croissant : bâtiments terminés du même joueur, collés à une de
/// ses faces, qui fabriquent la même chose, ou générateurs qui brûlent les mêmes combustibles (règle dans
/// twins.rs). Elles partagent leurs ingrédients ou leur combustible, et leurs produits, en dernier
/// recours (voir `share_with_twins` et `share_fuel`).
pub fn twins_of(w: &World, b: usize) -> Vec<usize> {
    let mut v = [0usize; MAX_TWINS];
    let n = twins_into(w, b, &mut v);
    v[..n].to_vec()
}

/// Au plus autant de jumelles que de cases autour du plus grand bâtiment de fabrication (5 × 5).
const MAX_TWINS: usize = 20;

/// Jumelles de `b` rangées dans `v` (sans allocation), par indice croissant ; renvoie leur nombre.
fn twins_into(w: &World, b: usize, v: &mut [usize; MAX_TWINS]) -> usize {
    let bb = &w.buildings[b];
    // ce qu'elle fabrique (règle commune avec l'aperçu de pose : voir twins.rs)
    let Some(key) = crate::twins::product_key(bb) else { return 0 };
    let (bw, bh) = bb.size();
    let mut n = 0;
    for ty in bb.y - 1..=bb.y + bh {
        for tx in bb.x - 1..=bb.x + bw {
            if !on_face(bb.x, bb.y, bw, bh, tx, ty) || !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let c = (o - 1) as usize;
            if c == b || v[..n].contains(&c) || n == MAX_TWINS {
                continue;
            }
            if crate::twins::twin_with(&w.buildings[c], bb.kind, bb.owner, key) {
                v[n] = c;
                n += 1;
            }
        }
    }
    v[..n].sort_unstable();
    n
}

/// Partage avec les machines jumelles, en dernier recours : les bras, les tapis et les voisins qui
/// livrent ou reçoivent directement passent toujours avant (voir `share_inputs` et `share_outputs`).
/// Renvoie vrai si `b` attend de remettre ses produits à une jumelle (il repasse alors bientôt).
fn share_with_twins(w: &mut World, b: usize) -> bool {
    let working = w.buildings[b].working;
    if working && !w.tick.is_multiple_of(TWIN_PERIOD) {
        return false;
    }
    let mut twins = [0usize; MAX_TWINS];
    let n = twins_into(w, b, &mut twins);
    if n == 0 {
        return false;
    }
    share_inputs(w, b, &twins[..n]);
    w.buildings[b].def().class == BClass::Crafter && share_outputs(w, b, &twins[..n])
}

/**
 * Combustible partagé entre générateurs jumeaux, par unités de réservoir (un hydrocarbure, un quart de
 * cellule d'énergie), comme les ingrédients : une unité passe du mieux pourvu à l'autre quand l'écart
 * atteint 2 unités (le transfert réduit l'écart : pas d'aller-retour ; rien ne se perd, l'énergie est
 * déplacée).
 * - Un générateur sans fournisseur propre (`own_feed`) s'équilibre avec ses voisins : un seul tapis
 *   suffit pour un groupe de générateurs collés.
 * - Un générateur qui a ses bras, ses tapis, un extracteur, une raffinerie ou un dépôt collés se sert
 *   d'abord chez eux : il ne prend chez ses voisins que s'il lui reste moins de 2 unités.
 */
fn share_fuel(w: &mut World, b: usize, twins: &[usize]) {
    let unit = fuel_tank(w.buildings[b].kind) / FUEL_TANK_UNITS;
    let mut b_feed: Option<bool> = None;
    for &c in twins {
        let (mine, theirs) = (w.buildings[b].fuel, w.buildings[c].fuel);
        let (from, to, have) = if mine >= theirs + 2 * unit {
            (b, c, theirs)
        } else if theirs >= mine + 2 * unit {
            (c, b, mine)
        } else {
            continue;
        };
        let fed = if to == b { *b_feed.get_or_insert_with(|| own_feed(w, b)) } else { own_feed(w, c) };
        if (fed && have >= 2 * unit) || have + unit > fuel_tank(w.buildings[to].kind) {
            continue;
        }
        w.buildings[from].fuel -= unit;
        w.buildings[to].fuel += unit;
        refueled(&mut w.buildings[to]);
        if have <= 0 {
            // de nouveau alimenté : sa zone revient
            w.power_dirty = true;
        }
    }
}

/// Plafond des produits en attente d'un fabricant : au-delà, il ne lance plus de fabrication.
#[inline]
fn crafter_out_cap(on: u16) -> u16 {
    (on * 3).max(4)
}

/// Le bâtiment `bb` se sert-il de l'objet `it` (ingrédient de sa recette, lot de recherche, composant
/// de l'unité en tête de sa file, combustible d'un générateur) ?
fn uses_item(bb: &Building, it: u8) -> bool {
    match bb.def().class {
        BClass::Crafter => bb.recipe != RECIPE_NONE && RECIPES[bb.recipe as usize].inputs.iter().any(|x| x.0 == it),
        BClass::Lab => (PACK1..PACK1 + 6).contains(&it),
        BClass::Factory => bb.queue.first().is_some_and(|q| udef(q.0).cost.iter().any(|c| c.0 == it)),
        BClass::Power => fuel_energy(bb.kind, it) > 0,
        _ => false,
    }
}

/// Le bâtiment `b` a-t-il ses propres fournisseurs : un bras qui dépose dans son emprise, un tapis qui y
/// finit, un voisin collé qui lui donne directement des objets dont il se sert (extracteur, fabricant),
/// un dépôt collé pour une usine ou un générateur ? Une jumelle ne compte pas (elle ne lui donne pas ses
/// produits).
pub(crate) fn own_feed(w: &World, b: usize) -> bool {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let inside = |x: i32, y: i32| x >= bb.x && x < bb.x + bw && y >= bb.y && y < bb.y + bh;
    let r = ARM_REACH_MAX;
    for ty in bb.y - r..bb.y + bh + r {
        for tx in bb.x - r..bb.x + bw + r {
            if inside(tx, ty) || !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let c = (o - 1) as usize;
            let cb = &w.buildings[c];
            if !cb.alive || !cb.complete() {
                continue;
            }
            let face = on_face(bb.x, bb.y, bw, bh, tx, ty);
            let fed = match cb.def().class {
                BClass::Inserter => {
                    let (_, (dx, dy)) = arm_ends(cb);
                    inside(dx, dy)
                }
                BClass::Belt if face && cb.line != NONE => {
                    let l = &w.belts.lines[cb.line as usize];
                    l.out_floor == 0 && l.out_pos >= 0 && l.tiles.last() == Some(&(c as u32)) && inside(l.out_pos % w.map.w, l.out_pos / w.map.w)
                }
                BClass::Depot => face && cb.owner == bb.owner && matches!(bb.def().class, BClass::Factory | BClass::Power),
                BClass::Crafter if face && cb.owner == bb.owner && cb.recipe != RECIPE_NONE => uses_item(bb, RECIPES[cb.recipe as usize].output.0),
                BClass::Extractor => face && cb.owner == bb.owner && uses_item(bb, cb.recipe),
                _ => false,
            };
            if fed {
                return true;
            }
        }
    }
    false
}

/**
 * Ingrédients partagés avec les jumelles : pour chaque ingrédient, de la mieux pourvue vers l'autre,
 * seulement quand l'écart atteint 2 (jamais d'aller-retour : le transfert réduit l'écart).
 * - Une jumelle sans fournisseur propre (`own_feed`) s'équilibre avec ses voisines, un objet par passage :
 *   un seul tapis suffit pour une rangée.
 * - Une jumelle qui a ses bras ou ses tapis se sert d'abord chez eux : elle ne prend chez ses voisines
 *   que si elle est à l'arrêt faute de cet ingrédient, juste de quoi lancer une fabrication.
 */
fn share_inputs(w: &mut World, b: usize, twins: &[usize]) {
    // emplacements partagés : (indice dans inv ou stash, objet, quantité pour une fabrication)
    let slots: Vec<(usize, u8, u16)> = {
        let bb = &w.buildings[b];
        match bb.def().class {
            BClass::Crafter => RECIPES[bb.recipe as usize].inputs.iter().enumerate().map(|(j, x)| (j, x.0, x.1 as u16)).collect(),
            BClass::Lab => {
                let t = w.players[bb.owner as usize].research;
                let tier = if t == 0 { 0 } else { TECHS[t as usize].tier as usize };
                (0..6).map(|j| (j, PACK1 + j as u8, (j < tier) as u16)).collect()
            }
            BClass::Factory => udef(bb.queue[0].0).cost.iter().map(|c| (c.0 as usize, c.0, c.1)).collect(),
            _ => return,
        }
    };
    let factory = w.buildings[b].def().class == BClass::Factory;
    let get = |bb: &Building, j: usize| if factory { factory_has(bb, j as u8) } else { bb.inv[j] };
    // à l'arrêt faute d'ingrédients, et pas parce que ses produits ne partent pas
    let idle = |bb: &Building| {
        !bb.working && (bb.def().class != BClass::Crafter || bb.out + RECIPES[bb.recipe as usize].output.1 as u16 <= crafter_out_cap(RECIPES[bb.recipe as usize].output.1 as u16))
    };
    // fournisseurs propres, calculés à la demande (un parcours du pourtour)
    let mut b_feed: Option<bool> = None;
    for &c in twins {
        let mut c_feed: Option<bool> = None;
        for &(j, it, need) in &slots {
            let (mine, theirs) = (get(&w.buildings[b], j), get(&w.buildings[c], j));
            let (from, to, have, gap) = if mine >= theirs + 2 {
                (b, c, theirs, mine - theirs)
            } else if theirs >= mine + 2 {
                (c, b, mine, theirs - mine)
            } else {
                continue;
            };
            let fed = if to == b { *b_feed.get_or_insert_with(|| own_feed(w, b)) } else { *c_feed.get_or_insert_with(|| own_feed(w, c)) };
            let mut k = if !fed {
                1
            } else if have < need && idle(&w.buildings[to]) {
                (need - have).min(gap / 2)
            } else {
                continue;
            };
            if factory {
                k = k.min(factory_room(&w.buildings[to], it));
                if k == 0 {
                    continue;
                }
                w.buildings[from].stash[j] -= k;
                factory_put(&mut w.buildings[to], it, k);
            } else {
                w.buildings[from].inv[j] -= k;
                w.buildings[to].inv[j] += k;
            }
            w.buildings[to].wake = 0;
        }
    }
}

/// Sorties propres d'un fabricant pour son produit `it` : ses bras, ses tapis de sortie et les voisins
/// collés qui peuvent le recevoir (un fabricant voisin seulement si sa recette s'en sert, ce qui exclut
/// les jumelles). Renvoie (au moins une sortie, au moins une sortie prête maintenant).
fn own_outlets(w: &World, b: usize, it: u8) -> (bool, bool) {
    let mut any = false;
    for c in outlets_of(w, b) {
        let cb = &w.buildings[c];
        if cb.def().class == BClass::Crafter && !uses_item(cb, it) {
            continue;
        }
        any = true;
        if outlet_ready(w, b, c, it) {
            return (true, true);
        }
    }
    (any, false)
}

/**
 * Produits finis remis aux jumelles, en dernier recours : une machine les donne à une voisine seulement
 * si aucune de ses propres sorties (bras, tapis, voisin collé) n'est prête et qu'elle n'en a aucune ou
 * qu'elle est pleine (elle ne lancerait plus de fabrication). La voisine les prend seulement si une de
 * ses propres sorties est prête et qu'elle n'a presque rien en attente (moins d'une fabrication) : sa
 * production passe avant, et elle ne les rend jamais (elle a une sortie prête, la donneuse n'en a pas).
 * Renvoie vrai si `b` garde des produits qu'il voudrait remettre à une jumelle.
 */
fn share_outputs(w: &mut World, b: usize, twins: &[usize]) -> bool {
    let rec = &RECIPES[w.buildings[b].recipe as usize];
    let (it, on) = (rec.output.0, rec.output.1 as u16);
    let cap = crafter_out_cap(on);
    // donneuse : produits en attente, aucune sortie propre prête, et aucune sortie ou plus de place
    let stuck = |out: u16, (any, ready): (bool, bool)| out > 0 && !ready && (!any || out + on > cap);
    // sorties propres de `b`, calculées à la demande (un parcours du pourtour)
    let mut b_outs: Option<(bool, bool)> = None;
    if w.buildings[b].out > 0 {
        b_outs = Some(own_outlets(w, b, it));
    }
    let mut waiting = false;
    for &c in twins {
        let (bo, co) = (w.buildings[b].out, w.buildings[c].out);
        let (g, r) = if b_outs.is_some_and(|o| stuck(bo, o)) {
            waiting = true;
            // receveuse : presque rien en attente et une sortie propre prête
            if co >= on || !own_outlets(w, c, it).1 {
                continue;
            }
            (b, c)
        } else if co > 0 && bo < on && stuck(co, own_outlets(w, c, it)) && b_outs.get_or_insert_with(|| own_outlets(w, b, it)).1 {
            (c, b)
        } else {
            continue;
        };
        let k = w.buildings[g].out.min(on - w.buildings[r].out);
        w.buildings[g].out -= k;
        w.buildings[r].out += k;
        // la donneuse peut relancer une fabrication, la receveuse pose les produits sur ses sorties
        w.buildings[g].wake = 0;
        w.buildings[r].wake = 0;
        wake_watchers(w, r);
    }
    waiting && b_outs.is_some_and(|o| stuck(w.buildings[b].out, o))
}

/// Un dépôt collé à une usine lui donne un objet de la réserve du joueur toutes les `DEPOT_FEED_PERIOD` ticks
/// (1 par seconde) : un appoint lent, bien en deçà d'un tapis. Un seul dépôt compte par usine.
pub const DEPOT_FEED_PERIOD: u32 = 20;

/// Usine en attente de composants depuis 10 s : alerte EV_FACTORY_STARVED pour son joueur.
const FACTORY_ALERT_DELAY: u32 = 200;
const FACTORY_ALERTED: u32 = NONE - 1;

/// Nombre de dépôts terminés du même joueur collés à une face du bâtiment `b`.
pub fn touching_depots(w: &World, b: usize) -> u32 {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let mut v: Vec<usize> = Vec::new();
    for ty in bb.y - 1..=bb.y + bh {
        for tx in bb.x - 1..=bb.x + bw {
            if !on_face(bb.x, bb.y, bw, bh, tx, ty) || !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let c = (o - 1) as usize;
            let cb = &w.buildings[c];
            if cb.alive && cb.complete() && cb.owner == bb.owner && cb.def().class == BClass::Depot {
                v.push(c);
            }
        }
    }
    v.sort_unstable();
    v.dedup();
    v.len() as u32
}

/// Dépôt collé (un seul compte, quel que soit leur nombre) : l'usine puise dans la réserve du joueur (puis de son équipe) les composants de sa file,
/// à tour de rôle entre les objets de l'unité en tête, puis ceux des suivantes. `charge` garde le tick de la dernière prise.
fn feed_from_depots(w: &mut World, b: usize) {
    let last = w.buildings[b].charge;
    if w.tick < last.saturating_add(DEPOT_FEED_PERIOD) {
        return;
    }
    if touching_depots(w, b) == 0 {
        w.buildings[b].charge = w.tick;
        return;
    }
    // au plus 3 objets accumulés pendant un sommeil (SLEEP = 60 ticks)
    let mut budget = ((w.tick - last) / DEPOT_FEED_PERIOD).min(SLEEP / DEPOT_FEED_PERIOD);
    w.buildings[b].charge = w.tick;
    let owner = w.buildings[b].owner as usize;
    let kinds: Vec<u16> = w.buildings[b].queue.iter().map(|q| q.0).collect();
    for k in kinds {
        let cost = udef(k).cost;
        // tour de rôle : un objet de chaque composant par passe, jusqu'au plafond de la réserve
        loop {
            let mut took = false;
            for &(it, _) in cost {
                if budget == 0 {
                    return;
                }
                if factory_room(&w.buildings[b], it) == 0 || w.avail(owner, it) <= 0 {
                    continue;
                }
                w.pay(owner, it, 1);
                factory_put(&mut w.buildings[b], it, 1);
                budget -= 1;
                took = true;
            }
            if !took {
                break;
            }
        }
    }
}

/// Le bâtiment accepte-t-il cet objet (par un bras ou un tapis) ?
pub fn accepts(w: &World, b: usize, item: u8) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || !bb.complete() || item == 0 {
        return false;
    }
    match bb.def().class {
        BClass::Depot => w.stock_room(bb.owner as usize, item) > 0,
        BClass::Warehouse | BClass::Station | BClass::CargoPad => crate::logistics::accepts(w, b, item),
        BClass::Power => {
            let e = fuel_energy(bb.kind, item);
            e > 0 && bb.fuel + e <= fuel_tank(bb.kind)
        }
        BClass::Router => bb.stash.len() < 4,
        BClass::Crafter => {
            if bb.recipe == RECIPE_NONE {
                bb.def().crafter != Crafter::Assembler && recipe_for(w, bb, item) != RECIPE_NONE
            } else {
                let r = &RECIPES[bb.recipe as usize];
                if let Some(j) = r.inputs.iter().position(|x| x.0 == item) {
                    (bb.inv[j] as u32) < r.inputs[j].1 as u32 * 2 + 1
                } else {
                    // une fonderie vide peut changer de recette
                    // (sauf si la recette a été fixée par le joueur : `repeat` sert de verrou pour les fabricants)
                    !bb.repeat && bb.def().crafter != Crafter::Assembler && !bb.working && bb.out == 0 && bb.inv.iter().all(|&x| x == 0) && recipe_for(w, bb, item) != RECIPE_NONE
                }
            }
        }
        BClass::Lab => (PACK1..PACK1 + 6).contains(&item) && bb.inv[(item - PACK1) as usize] < 2,
        BClass::Factory => factory_room(bb, item) > 0,
        BClass::Silo => cost_slot(MISSILE_COST, item).is_some_and(|j| bb.inv[j] < MISSILE_COST[j].1),
        BClass::AntiMissile => cost_slot(INTERCEPTOR_COST, item).is_some_and(|j| bb.inv[j] < INTERCEPTOR_COST[j].1),
        _ => false,
    }
}

pub fn insert_item(w: &mut World, b: usize, item: u8) {
    let class = w.buildings[b].def().class;
    match class {
        BClass::Depot => {
            let o = w.buildings[b].owner as usize;
            w.players[o].stock[item as usize] += 1;
            let tick = w.tick;
            flow_add(&mut w.buildings[b], tick, 1);
        }
        BClass::Warehouse | BClass::Station | BClass::CargoPad => crate::logistics::insert(w, b, item),
        BClass::Power => {
            let bb = &mut w.buildings[b];
            let was_dry = bb.fuel <= 0;
            bb.fuel += fuel_energy(bb.kind, item);
            refueled(bb);
            if was_dry && bb.fuel > 0 {
                // de nouveau alimenté : sa zone revient
                w.power_dirty = true;
            }
        }
        BClass::Router => {
            let bb = &mut w.buildings[b];
            bb.stash.push(item as u16);
            bb.wake = 0;
        }
        BClass::Crafter => {
            let need_switch = {
                let bb = &w.buildings[b];
                bb.recipe == RECIPE_NONE || !RECIPES[bb.recipe as usize].inputs.iter().any(|x| x.0 == item)
            };
            if need_switch {
                let r = recipe_for(w, &w.buildings[b], item);
                w.buildings[b].recipe = r;
                w.buildings[b].inv = [0; 6];
            }
            let bb = &mut w.buildings[b];
            if bb.recipe != RECIPE_NONE {
                if let Some(j) = RECIPES[bb.recipe as usize].inputs.iter().position(|x| x.0 == item) {
                    bb.inv[j] += 1;
                }
            }
        }
        BClass::Lab => {
            w.buildings[b].inv[(item - PACK1) as usize] += 1;
        }
        BClass::Factory => factory_put(&mut w.buildings[b], item, 1),
        BClass::Silo => {
            if let Some(j) = cost_slot(MISSILE_COST, item) {
                w.buildings[b].inv[j] += 1;
            }
        }
        BClass::AntiMissile => {
            if let Some(j) = cost_slot(INTERCEPTOR_COST, item) {
                w.buildings[b].inv[j] += 1;
            }
        }
        _ => {}
    }
    w.buildings[b].wake = 0;
}

/// Objet produit disponible en sortie du bâtiment.
fn output_of(b: &Building) -> u8 {
    match b.def().class {
        BClass::Crafter if b.recipe != RECIPE_NONE && b.out > 0 => RECIPES[b.recipe as usize].output.0,
        BClass::Extractor if b.out > 0 => b.recipe,
        _ => 0,
    }
}

fn take_output(w: &mut World, b: usize, want: &[bool; NUM_ITEMS]) -> u8 {
    if matches!(w.buildings[b].def().class, BClass::Warehouse | BClass::Station | BClass::CargoPad) {
        return crate::logistics::take(w, b, want);
    }
    if w.buildings[b].def().class == BClass::Depot {
        return depot_take(w, b, &|i| want[i as usize]);
    }
    let it = output_of(&w.buildings[b]);
    if it != 0 && want[it as usize] {
        w.buildings[b].out -= 1;
        w.buildings[b].wake = 0;
        return it;
    }
    0
}

/// Pousse un objet vers la case (x, y) : tapis ou bâtiment qui l'accepte.
/// Un tapis de contrôle ne reçoit que par l'arrière : l'objet doit avancer dans sa direction.
#[inline]
/// Sorties d'un répartiteur selon son mode, en indices de [gauche, avant, droite] : 0 les trois,
/// 1 gauche et avant, 2 avant et droite.
pub fn splitter_outs(split: u8) -> &'static [usize] {
    match split {
        1 => &[0, 1],
        2 => &[1, 2],
        _ => &[0, 1, 2],
    }
}

pub fn router_entry_ok(bb: &Building, travel_dir: u8) -> bool {
    bb.def().class != BClass::Router || bb.dir & 3 == travel_dir & 3
}

/// Pose l'objet sur la case (x, y) (tapis ou bâtiment qui l'accepte) ; `travel_dir` : direction dans
/// laquelle il avance (un tapis de contrôle ne le prend que par l'arrière).
fn push_to(w: &mut World, x: i32, y: i32, item: u8, travel_dir: u8) -> bool {
    if !w.map.inside(x, y) {
        return false;
    }
    let o = w.map.occ[w.map.idx(x, y)];
    if o == 0 {
        return false;
    }
    let t = (o - 1) as usize;
    if !w.buildings[t].complete() {
        return false;
    }
    if w.buildings[t].def().class == BClass::Belt {
        return belts::put_on_belt(w, t, item);
    }
    if router_entry_ok(&w.buildings[t], travel_dir) && accepts(w, t, item) {
        insert_item(w, t, item);
        wake_watchers(w, t);
        return true;
    }
    false
}

// ---------- Mise à jour ----------
pub fn update_buildings(w: &mut World) {
    let mut i = 0;
    while i < w.active.len() {
        let b = w.active[i] as usize;
        i += 1;
        let bb = &w.buildings[b];
        if !bb.alive || !bb.complete() || w.tick < bb.wake {
            continue;
        }
        if bb.stun > 0 {
            w.buildings[b].stun -= 1;
            continue;
        }
        if bb.upgrade > 0 {
            // amélioration en cours : le bâtiment ne travaille pas (sa production en cours attend)
            tick_upgrade(w, b);
            continue;
        }
        match bb.def().class {
            BClass::Extractor => tick_extractor(w, b),
            BClass::Depot => tick_depot(w, b),
            BClass::Belt if bb.def().collect => tick_collector(w, b),
            BClass::Inserter => tick_inserter(w, b),
            BClass::Crafter => tick_crafter(w, b),
            BClass::Lab => tick_lab(w, b),
            BClass::Factory => tick_factory(w, b),
            BClass::Turret => {
                let need = bb.def().power_use;
                let ok = need == 0 || use_power(w, b, need) > 512;
                if ok {
                    crate::combat::building_weapon(w, b);
                }
            }
            // nid de la faune : il crache sur les avions et les navires
            BClass::Nest => crate::combat::building_weapon(w, b),
            BClass::Shield => tick_shield(w, b),
            BClass::Silo => tick_ammo_builder(w, b, MISSILE_COST, 1, 1200),
            BClass::AntiMissile => {
                tick_ammo_builder(w, b, INTERCEPTOR_COST, 3, 400);
                crate::combat::antimissile(w, b);
            }
            // générateur : alimenté par un dépôt collé (et amélioration, voir upgrade)
            BClass::Power => tick_generator(w, b),
            BClass::Orbital => {
                let need = bdef(B_ORBITAL).power_use;
                let s = use_power(w, b, need);
                let bb = &mut w.buildings[b];
                bb.charge = (bb.charge + s as u32).min(60 * 20 * 1024);
                bb.working = s > 0;
            }
            BClass::Gate => tick_gate(w, b),
            BClass::Station | BClass::CargoPad => crate::logistics::tick_station(w, b),
            BClass::Router => tick_router(w, b),
            BClass::Portal => crate::logistics::tick_portal(w, b),
            BClass::Roboport => crate::logistics::tick_roboport(w, b),
            BClass::Transfer | BClass::Radar | BClass::Beacon => {
                let need = bb.def().power_use;
                let s = use_power(w, b, need);
                let bb = &mut w.buildings[b];
                bb.working = s >= 512;
                if bb.cooldown > 0 {
                    bb.cooldown -= 1;
                }
            }
            _ => {}
        }
    }
}

/// Tapis de contrôle : un objet par tick, de la mémoire tampon (4 objets) vers les sorties.
/// Répartiteur : gauche, avant, droite à tour de rôle. Trieur : l'objet choisi à gauche, le reste
/// devant. Débordement : devant d'abord, sur les côtés quand l'avant est bloqué.
fn tick_router(w: &mut World, b: usize) {
    if w.buildings[b].stash.is_empty() {
        w.buildings[b].working = false;
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    }
    let bb = &w.buildings[b];
    let (x, y, d, kind, filter, turn) = (bb.x, bb.y, bb.dir as usize, bb.kind, bb.recipe, bb.hand as usize);
    let item = bb.stash[0] as u8;
    let outs = [(d + 3) % 4, d, (d + 1) % 4]; // gauche, avant, droite
    // répartiteur : ses sorties (les trois, ou un angle et l'avant), servies à tour de rôle
    let split_outs = splitter_outs(w.buildings[b].split);
    let mut rot = [0usize; 3];
    let order: &[usize] = match kind {
        B_SPLITTER => {
            let n = split_outs.len();
            for (i, r) in rot.iter_mut().enumerate().take(n) {
                *r = split_outs[(turn + i) % n];
            }
            &rot[..n]
        }
        B_SORTER => {
            if filter != 0 && filter != RECIPE_NONE && item == filter {
                &[0]
            } else {
                &[1]
            }
        }
        _ => &[1, 0, 2],
    };
    for &k in order {
        let (dx, dy) = DIRS[outs[k]];
        if push_to(w, x + dx, y + dy, item, outs[k] as u8) {
            let bb = &mut w.buildings[b];
            bb.stash.remove(0);
            bb.working = true;
            if kind == B_SPLITTER {
                // la sortie suivante dans la liste du mode
                let pos = split_outs.iter().position(|&o| o == k).unwrap_or(0);
                bb.hand = ((pos + 1) % split_outs.len()) as u8;
            }
            wake_watchers(w, b);
            return;
        }
    }
    let bb = &mut w.buildings[b];
    bb.working = false;
    bb.wake = w.tick + 4;
}

/// Amélioration possible du bâtiment : (coût, recherche, durée en ticks). Extracteur : niveau suivant
/// (EXTRACTOR_LEVELS) ; assembleur : modèle suivant (ASSEMBLER_UPGRADES).
pub fn upgrade_spec(bb: &Building) -> Option<(&'static [(u8, u16)], u8, u32)> {
    match bb.def().class {
        BClass::Extractor => EXTRACTOR_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Depot if bb.level == 0 => Some((DEPOT_UPGRADE_COST, DEPOT_UPGRADE_TECH, DEPOT_UPGRADE_TIME as u32 * 20)),
        BClass::Power if bb.kind == B_GENERATOR => GENERATOR_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Crafter if bb.kind == B_FURNACE => FURNACE_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Crafter => ASSEMBLER_UPGRADES.iter().find(|u| u.0 == bb.kind).map(|u| (bdef(u.1).cost, bdef(u.1).tech, u.2 as u32 * 20)),
        _ => None,
    }
}

/**
 * Ordre UPGRADE sur l'extracteur ou l'assembleur `b` : lance son amélioration (il doit être terminé, la
 * recherche faite et le coût disponible, payé aussitôt). Le bâtiment ne travaille plus jusqu'à la fin
 * (voir tick_upgrade). Sur une amélioration en cours, l'ordre l'annule et rembourse.
 */
pub fn upgrade(w: &mut World, b: usize) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || !bb.complete() {
        return false;
    }
    let Some((cost, tech, _)) = upgrade_spec(bb) else { return false };
    let owner = bb.owner as usize;
    if bb.upgrade > 0 {
        for &(it, n) in cost {
            w.players[owner].stock[it as usize] += n as i32;
        }
        w.buildings[b].upgrade = 0;
        w.buildings[b].wake = 0;
        w.power_dirty |= w.buildings[b].def().class == BClass::Power;
        return true;
    }
    if !w.players[owner].has_tech(tech) || !cost.iter().all(|&(it, n)| w.avail(owner, it) >= n as i32) {
        return false;
    }
    for &(it, n) in cost {
        w.pay(owner, it, n as i32);
    }
    w.buildings[b].upgrade = 1;
    w.buildings[b].wake = 0;
    // un générateur n'est pas dans la liste des bâtiments actifs : il y entre pour son chantier
    if let Err(p) = w.active.binary_search(&(b as u32)) {
        w.active.insert(p, b as u32);
    }
    // générateur : sans production pendant le chantier
    w.power_dirty |= w.buildings[b].def().class == BClass::Power;
    true
}

/// Production électrique d'un bâtiment terminé (kW) : niveau d'un générateur amélioré, rien pendant une amélioration.
/// Production d'un générateur en ce moment (kW) : sa puissance nominale, ou, pour une centrale
/// géothermique, celle de son geyser.
pub fn gen_prod(w: &World, bb: &Building) -> i32 {
    let p = if bb.kind == B_GEOTHERMAL { geo_output(w, bb) } else { power_prod_of(bb) };
    // cadence : un générateur surcadencé produit (et brûle) d'autant plus
    (p as i64 * clock_of(bb) as i64 / 100) as i32
}

/// Période (ticks) de l'ondulation d'un geyser : une minute.
pub const GEO_PERIOD: u32 = 1200;

/// Centrale géothermique : puissance nominale × pureté du geyser, qui ondule de 50 % à 150 % sur une
/// minute (moyenne 100 %), chaque geyser avec son propre décalage.
pub fn geo_output(w: &World, bb: &Building) -> i32 {
    if !bb.complete() || bb.upgrade > 0 {
        return 0;
    }
    let base = bb.def().power_prod as i64 * purity_of(bb) as i64 / 100;
    let t = (w.tick + crate::rng::hash3(bb.x, bb.y, 0x6e0) % GEO_PERIOD) % GEO_PERIOD;
    let half = GEO_PERIOD / 2;
    let tri = if t < half { t } else { GEO_PERIOD - t } as i64;
    (base * (500 + tri * 1000 / half as i64) / 1000) as i32
}

pub fn power_prod_of(bb: &Building) -> i32 {
    if bb.upgrade > 0 {
        0
    } else if bb.kind == B_GENERATOR {
        GENERATOR_LEVELS[(bb.level as usize).min(GENERATOR_LEVELS.len() - 1)].prod
    } else {
        bb.def().power_prod
    }
}

/// Objets prélevés au plus par tick par un collecteur (au-delà du débit d'un tapis express).
const COLLECT_PER_TICK: usize = 2;

/**
 * Collecteur de surplus (tapis surmonté d'un portique) : quand la file est bouchée en aval, les objets
 * à l'arrêt sur sa case (tassés à l'avant de la ligne) partent dans le stock du joueur ; la file reste
 * fluide en amont. Tant que la file avance, il ne prend rien. Compteur des objets mis en réserve : `out`.
 */
fn tick_collector(w: &mut World, b: usize) {
    let (li, idx, owner) = {
        let bb = &w.buildings[b];
        if bb.line == NONE {
            return;
        }
        (bb.line as usize, bb.line_idx as i32, bb.owner as usize)
    };
    for _ in 0..COLLECT_PER_TICK {
        let l = &mut w.belts.lines[li];
        let n = l.tiles.len() as i32;
        // la case occupe [a, a + TILE) en distance depuis l'avant de la ligne
        let a = (n - 1 - idx) * TILE;
        let packed = (l.moving as usize).min(l.items.len());
        // premier objet sur la case (ou derrière) et position de l'objet qui le précède
        let mut pos = 0;
        let mut prev: Option<(usize, i32)> = None;
        let mut found = None;
        for k in 0..l.items.len() {
            let p = pos + l.items[k].1;
            if p >= a {
                if p < a + TILE {
                    found = Some(k);
                }
                break;
            }
            prev = Some((k, p));
            pos = p;
        }
        let Some(k) = found else { return };
        // réserve pleine pour cet objet : il laisse passer
        let pl = &w.players[owner];
        if pl.stock[l.items[k].0 as usize] >= pl.stock_cap {
            return;
        }
        // surplus : la file arrêtée en aval remonte jusqu'à la case (l'objet suivant s'y arrêterait),
        // ou la case est au bout de la ligne et sa sortie est bloquée
        let blocked = match prev {
            Some((pk, pp)) => pk < packed && pp + crate::belts::ITEM_GAP >= a,
            None => k < packed,
        };
        if !blocked {
            return;
        }
        let (it, gap) = l.items.remove(k).unwrap_or((0, 0));
        // l'objet suivant reprend l'écart de l'objet retiré ; il peut de nouveau avancer
        if let Some(next) = l.items.get_mut(k) {
            next.1 += gap;
        }
        l.moving = k as u32;
        if it != 0 {
            w.players[owner].stock[it as usize] += 1;
            let bb = &mut w.buildings[b];
            bb.out = bb.out.wrapping_add(1);
            bb.working = true;
        }
    }
}

/// Amélioration en cours : le chantier avance d'un tick ; à la fin, l'extracteur passe au niveau suivant,
/// l'assembleur devient le modèle suivant (points de vie à la même proportion).
fn tick_upgrade(w: &mut World, b: usize) {
    let Some((_, _, total)) = upgrade_spec(&w.buildings[b]) else {
        w.buildings[b].upgrade = 0;
        return;
    };
    let bb = &mut w.buildings[b];
    bb.upgrade += 1;
    if bb.upgrade <= total {
        return;
    }
    bb.upgrade = 0;
    bb.wake = 0;
    match bb.def().class {
        BClass::Extractor => bb.level += 1,
        BClass::Crafter if bb.kind == B_FURNACE => bb.level += 1,
        BClass::Power => {
            bb.level += 1;
            w.power_dirty = true;
        }
        BClass::Depot => {
            // dépôt plus grand : la réserve du joueur grandit d'autant
            bb.level += 1;
            let owner = bb.owner as usize;
            w.players[owner].stock_cap += DEPOT_CAP[1] - DEPOT_CAP[0];
        }
        _ => {
            if let Some(u) = ASSEMBLER_UPGRADES.iter().find(|u| u.0 == bb.kind) {
                let (old, new) = (bb.def().hp, bdef(u.1).hp);
                bb.hp = (bb.hp as i64 * new as i64 / old.max(1) as i64) as i32;
                bb.kind = u.1;
            }
        }
    }
    wake_watchers(w, b);
}

/// Sortie d'un dépôt amélioré : prochain objet filtré (à tour de rôle) que le joueur a en réserve et
/// que `want` accepte ; il quitte la réserve. 0 : rien (dépôt non amélioré, sans filtre, réserve vide).
fn depot_take(w: &mut World, b: usize, want: &dyn Fn(u8) -> bool) -> u8 {
    let bb = &w.buildings[b];
    if bb.level == 0 || bb.filters.is_empty() {
        return 0;
    }
    let owner = bb.owner as usize;
    let n = bb.filters.len();
    let start = bb.timer as usize % n;
    for k in 0..n {
        let it = w.buildings[b].filters[(start + k) % n];
        if it != 0 && w.players[owner].stock[it as usize] > 0 && want(it) {
            w.players[owner].stock[it as usize] -= 1;
            w.buildings[b].timer = ((start + k + 1) % n) as _;
            return it;
        }
    }
    0
}

/**
 * Dépôt : un dépôt amélioré avec des filtres pose ses objets filtrés (pris dans la réserve, à tour de
 * rôle) sur les tapis qui partent de ses faces ; sinon il dort.
 */
fn tick_depot(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    if bb.level == 0 || bb.filters.is_empty() {
        w.buildings[b].working = false;
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    }
    let belts = out_belts(w, b);
    let mut any = false;
    for t in belts.iter().copied() {
        if !belts::belt_has_room(w, t) {
            continue;
        }
        let it = depot_take(w, b, &|_| true);
        if it == 0 {
            break;
        }
        belts::put_on_belt(w, t, it);
        any = true;
    }
    w.buildings[b].working = any;
    w.buildings[b].wake = w.tick + if belts.is_empty() { 20 } else { 2 };
}

fn tick_extractor(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner as usize;
    if w.buildings[b].out > 0 {
        let (x, y, bw, bh, dir) = {
            let bb = &w.buildings[b];
            let (bw, bh) = bb.size();
            (bb.x, bb.y, bw, bh, bb.dir)
        };
        let it = w.buildings[b].recipe;
        let before = w.buildings[b].out;
        // sorties : toutes les cases devant la face avant, servies à tour de rôle (le compteur `timer`
        // de l'extracteur garde la prochaine) ; une case qui ne peut pas recevoir laisse passer l'autre
        let n = front_count(bw, bh, dir).max(1);
        let start = w.buildings[b].timer as usize % n;
        let mut done = false;
        for k in 0..n {
            let (fx, fy) = front_tile_k(x, y, bw, bh, dir, (start + k) % n);
            if push_to(w, fx, fy, it, dir) {
                w.buildings[b].timer = ((start + k + 1) % n) as _;
                done = true;
                break;
            }
        }
        if done {
            w.buildings[b].out -= 1;
            wake_watchers(w, b);
        } else {
            // sinon, transfert direct vers un voisin collé (à tour de rôle avec les bras)
            push_out(w, b);
            if w.buildings[b].out >= before && w.buildings[b].out >= 5 {
                w.buildings[b].wake = w.tick + 5;
                w.buildings[b].working = false;
                return;
            }
        }
    }
    let lvl = &EXTRACTOR_LEVELS[(w.buildings[b].level as usize).min(EXTRACTOR_LEVELS.len() - 1)];
    // sur un gisement d'hydrocarbure, l'extracteur fonctionne sans électricité
    let need = (bdef(B_EXTRACTOR).power_use as i64 * lvl.power as i64 / 100 * clock_power(&w.buildings[b]) as i64 / 1000) as i32;
    let s = if w.buildings[b].recipe == HYDROCARBON { 1024 } else { use_power(w, b, need) };
    let mult = w.players[owner].res_mult as u32;
    // pureté du gisement : 50 % (impur), 100 % ou 200 % (pur)
    let purity = purity_of(&w.buildings[b]);
    let bb = &mut w.buildings[b];
    bb.working = s > 0;
    // niveau d'amélioration : vitesse en % du niveau 0
    bb.progress += s as u32 * mult * lvl.speed / 100 * purity / 100 * clock_of(bb) / 100;
    if bb.progress >= 30 * RECIPE_SCALE {
        bb.progress -= 30 * RECIPE_SCALE;
        bb.out += 1;
        flow_add(bb, w.tick, 1);
        let it = bb.recipe as usize;
        w.players[owner].produced[it] += 1;
    }
}

/// Tapis qui partent d'une face du bâtiment `b` (case voisine d'un bord, tapis tourné vers l'extérieur) :
/// les « trappes de sortie ». Par ordre de case (déterministe).
/// Bâtiment qui dépose ses produits sur les tapis de ses faces (fabricant, dépôt amélioré à sorties filtrées).
pub fn feeds_belts(bb: &Building) -> bool {
    bb.alive && bb.complete() && (bb.def().class == BClass::Crafter || (bb.def().class == BClass::Depot && bb.level > 0))
}

pub fn out_belts(w: &World, b: usize) -> Vec<usize> {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let mut v = Vec::new();
    // (case voisine, direction vers l'extérieur) pour chaque case de bord
    let mut probe = |x: i32, y: i32, d: u8| {
        if !w.map.inside(x, y) {
            return;
        }
        let o = w.map.occ[w.map.idx(x, y)];
        if o == 0 {
            return;
        }
        let t = (o - 1) as usize;
        let tb = &w.buildings[t];
        if tb.alive && tb.complete() && tb.def().class == BClass::Belt && belts::takes_from_face(w, t, d) {
            v.push(t);
        }
    };
    for x in bb.x..bb.x + bw {
        probe(x, bb.y - 1, 3);
        probe(x, bb.y + bh, 1);
    }
    for y in bb.y..bb.y + bh {
        probe(bb.x - 1, y, 2);
        probe(bb.x + bw, y, 0);
    }
    v
}

/// Sert la sortie dont c'est le tour quand c'est un tapis de sortie (pose du produit) ou un voisin collé
/// (transfert direct) ; si c'est le tour d'un bras, le réveille. Renvoie vrai si le bâtiment a au moins
/// une sortie sans bras.
fn push_out(w: &mut World, b: usize) -> bool {
    let it = output_of(&w.buildings[b]);
    // test rapide d'abord (faces seulement) : la plupart des bâtiments n'ont que des bras
    if it == 0 || !has_direct_outlet(w, b) {
        return false;
    }
    let outs = outlets_of(w, b);
    match next_outlet(w, b, &outs, None) {
        Some((c, st)) if w.buildings[c].def().class == BClass::Belt => {
            if belts::put_on_belt(w, c, it) {
                advance_outlet(w, b, c, st);
                w.buildings[b].out -= 1;
                wake_watchers(w, b);
            }
        }
        Some((c, _)) if w.buildings[c].def().class == BClass::Inserter => w.buildings[c].wake = 0,
        Some((c, st)) => {
            // voisin collé : next_outlet ne le choisit que s'il accepte l'objet (direct_ok)
            insert_item(w, c, it);
            wake_watchers(w, c);
            advance_outlet(w, b, c, st);
            w.buildings[b].out -= 1;
            wake_watchers(w, b);
        }
        None => {}
    }
    true
}

fn tick_crafter(w: &mut World, b: usize) {
    // trappes de sortie et transfert direct : un tapis qui part du bâtiment, ou un voisin collé qui
    // reçoit des objets, prend ses produits sans bras
    let outlets = w.buildings[b].out > 0 && push_out(w, b);
    let to_twin = w.buildings[b].recipe != RECIPE_NONE && share_with_twins(w, b);
    tick_crafter_work(w, b);
    if w.buildings[b].out > 0 && (outlets || to_twin) {
        // produits en attente : revenir bientôt les poser (le tapis avance) ou les remettre à une jumelle
        let soon = w.tick + if outlets { 2 } else { TWIN_PERIOD };
        if w.buildings[b].wake > soon {
            w.buildings[b].wake = soon;
        }
    }
}

/// Niveau d'amélioration d'une fonderie (FURNACE_LEVELS) ; les autres fabricants changent de modèle.
fn furnace_level(bb: &Building) -> Option<&'static ExtractorLevel> {
    (bb.kind == B_FURNACE).then(|| &FURNACE_LEVELS[(bb.level as usize).min(FURNACE_LEVELS.len() - 1)])
}

/// Vitesse d'un fabricant (% de la vitesse de référence des recettes), niveau de la fonderie compris.
pub fn crafter_speed(bb: &Building) -> u32 {
    bb.def().speed as u32 * furnace_level(bb).map_or(100, |l| l.speed) / 100 * clock_of(bb) / 100
}

// ---------- Cadence (surcadençage, sous-cadençage) ----------

/// Pureté (%) du gisement sous un extracteur ou une centrale géothermique, relevée à la pose.
#[inline]
pub fn purity_of(bb: &Building) -> u32 {
    if bb.purity == 0 {
        100
    } else {
        bb.purity as u32
    }
}

/// Cadence plafonnée : 250 % (100 % + trois fragments de 50 %).
pub const CLOCK_MAX: u32 = 250;
pub const CLOCK_MIN: u32 = 10;
/// Consommation électrique (‰) selon la cadence, par pas de 10 % : (cadence)^1,32, comme une machine
/// réelle dont la puissance croît plus vite que la vitesse (×0,4 à 50 %, ×2,5 à 200 %, ×3,36 à 250 %).
const CLOCK_POWER: [u32; 26] = [0, 48, 119, 204, 298, 400, 509, 624, 745, 870, 1000, 1134, 1273, 1415, 1560, 1709, 1861, 2017, 2175, 2336, 2500, 2667, 2836, 3007, 3181, 3358];

/// Les machines dont on règle la cadence : extracteurs, machines de production, générateurs.
pub fn clockable(bb: &Building) -> bool {
    matches!(bb.def().class, BClass::Extractor | BClass::Crafter | BClass::Power) && bb.kind != B_MAIN_GENERATOR
}
#[inline]
pub fn clock_of(bb: &Building) -> u32 {
    if bb.clock == 0 {
        100
    } else {
        bb.clock as u32
    }
}
/// Multiplicateur (‰) de la consommation électrique à la cadence de `bb`.
#[inline]
pub fn clock_power(bb: &Building) -> u32 {
    CLOCK_POWER[(clock_of(bb) / 10).min(25) as usize]
}
/// Fragments nécessaires pour une cadence : un par tranche de 50 % au-dessus de 100 %.
pub fn shards_for(clock: u32) -> u32 {
    clock.saturating_sub(100).div_ceil(50)
}

/// Règle la cadence de `b` (arrondie à 10 %) : installe les fragments qui manquent, pris dans la
/// réserve du joueur, et rend ceux qui ne servent plus. Faux si la machine ne se règle pas ou si les
/// fragments manquent.
pub fn set_clock(w: &mut World, b: usize, clock: u32) -> bool {
    if !clockable(&w.buildings[b]) {
        return false;
    }
    let clock = (clock.clamp(CLOCK_MIN, CLOCK_MAX) + 5) / 10 * 10;
    let need = shards_for(clock);
    let have = w.buildings[b].shards as u32;
    let p = w.buildings[b].owner as usize;
    if need > have {
        if w.players[p].shards < need - have {
            return false;
        }
        w.players[p].shards -= need - have;
    } else {
        w.players[p].shards += have - need;
    }
    let bb = &mut w.buildings[b];
    bb.shards = need as u8;
    bb.clock = if clock == 100 { 0 } else { clock as u8 };
    bb.wake = 0;
    w.power_dirty |= bb.def().class == BClass::Power;
    true
}

/// Consommation d'un fabricant (kW), niveau de la fonderie compris.
pub fn crafter_power(bb: &Building) -> i32 {
    (bb.def().power_use as i64 * furnace_level(bb).map_or(100, |l| l.power) as i64 / 100 * clock_power(bb) as i64 / 1000) as i32
}

fn tick_crafter_work(w: &mut World, b: usize) {
    let r = w.buildings[b].recipe;
    if r == RECIPE_NONE {
        w.buildings[b].working = false;
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    }
    let rec = &RECIPES[r as usize];
    if !w.buildings[b].working {
        let on = rec.output.1 as u16;
        let cap = crafter_out_cap(on);
        let bb = &w.buildings[b];
        let has = rec.inputs.iter().enumerate().all(|(j, x)| bb.inv[j] >= x.1 as u16);
        if bb.out + on > cap || !has {
            w.buildings[b].wake = w.tick + SLEEP;
            return;
        }
        let owner = bb.owner as usize;
        let bb = &mut w.buildings[b];
        for (j, x) in rec.inputs.iter().enumerate() {
            bb.inv[j] -= x.1 as u16;
            w.players[owner].consumed[x.0 as usize] += x.1 as u32;
        }
        bb.working = true;
        bb.progress = 0;
        wake_watchers(w, b);
    }
    let speed = crafter_speed(&w.buildings[b]);
    let use_ = crafter_power(&w.buildings[b]);
    let s = use_power(w, b, use_);
    let bb = &mut w.buildings[b];
    bb.progress += speed * s as u32;
    if bb.progress >= rec.time as u32 * RECIPE_SCALE {
        bb.working = false;
        bb.out += rec.output.1 as u16;
        flow_add(bb, w.tick, rec.output.1 as u16);
        let owner = bb.owner as usize;
        w.players[owner].produced[rec.output.0 as usize] += rec.output.1 as u32;
        wake_watchers(w, b);
    }
}

fn tick_lab(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner as usize;
    share_with_twins(w, b);
    if !w.buildings[b].working {
        let t = w.players[owner].research;
        if t == 0 {
            w.buildings[b].wake = w.tick + 20;
            return;
        }
        let tier = TECHS[t as usize].tier as usize;
        let has = (0..tier).all(|k| w.buildings[b].inv[k] > 0);
        if !has {
            w.buildings[b].wake = w.tick + SLEEP;
            return;
        }
        for k in 0..tier {
            w.buildings[b].inv[k] -= 1;
            w.players[owner].consumed[PACK1 as usize + k] += 1;
        }
        let bb = &mut w.buildings[b];
        bb.working = true;
        bb.progress = 0;
        bb.tech = t;
        wake_watchers(w, b);
    }
    let s = use_power(w, b, bdef(B_LAB).power_use);
    let bb = &mut w.buildings[b];
    bb.progress += s as u32 * 100;
    let t = bb.tech;
    let need = TECHS[t as usize].time as u32 * 20 * RECIPE_SCALE;
    if bb.progress >= need {
        bb.working = false;
        flow_add(bb, w.tick, 1);
        let p = &mut w.players[owner];
        if p.research == t && !p.has_tech(t) {
            p.tech_progress[t as usize] += 1;
            if p.tech_progress[t as usize] >= TECHS[t as usize].count {
                p.researched |= 1u64 << t;
                p.research = 0;
                p.start_queued();
                w.ev(EV_RESEARCH, owner as i32, t as i32, 0, 0);
                if t == T_CMD_SHIELD {
                    let c = w.players[owner].commander;
                    if let Some(s) = w.unit(c) {
                        w.units.cold[s].shield = 4000;
                    }
                }
            }
        }
    }
}

fn tick_factory(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner as usize;
    let Some(&(kind, _)) = w.buildings[b].queue.first() else {
        w.buildings[b].working = false;
        w.buildings[b].target = NONE;
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    };
    feed_from_depots(w, b);
    share_with_twins(w, b);
    let def = udef(kind);
    if !w.buildings[b].working {
        let missing = def.cost.iter().find(|c| factory_has(&w.buildings[b], c.0) < c.1).map(|c| c.0);
        if missing.is_some() || w.players[owner].unit_count >= UNIT_CAP {
            // en panne de composants depuis FACTORY_ALERT_DELAY : une alerte pour son joueur (une seule par attente)
            let bb = &mut w.buildings[b];
            // `target` : NONE hors attente, tick du début de l'attente, puis FACTORY_ALERTED une fois l'alerte donnée
            match (missing, bb.target) {
                (None, _) => bb.target = NONE,
                (Some(_), NONE) => bb.target = w.tick,
                (Some(it), t) if t != FACTORY_ALERTED && w.tick - t >= FACTORY_ALERT_DELAY => {
                    bb.target = FACTORY_ALERTED;
                    let (cx, cy) = bb.center();
                    w.ev(EV_FACTORY_STARVED, owner as i32, cx, cy, it as i32);
                }
                _ => {}
            }
            w.buildings[b].wake = w.tick + SLEEP;
            return;
        }
        for c in def.cost {
            w.buildings[b].stash[c.0 as usize] -= c.1;
            w.players[owner].consumed[c.0 as usize] += c.1 as u32;
        }
        w.buildings[b].target = NONE;
        w.buildings[b].working = true;
        w.buildings[b].progress = 0;
        wake_watchers(w, b);
    }
    let use_ = w.buildings[b].def().power_use;
    let s = use_power(w, b, use_);
    let mult = w.players[owner].build_mult as u32;
    w.buildings[b].progress += s as u32 * mult;
    if w.buildings[b].progress >= def.build as u32 * 20 * RECIPE_SCALE {
        w.buildings[b].working = false;
        // sortie de l'unité
        let bb = &w.buildings[b];
        let (bw, bh) = bb.size();
        let (fx, fy) = front_tile(bb.x, bb.y, bw, bh, bb.dir);
        let (mut sx, mut sy) = (fx * TILE + TILE / 2, fy * TILE + TILE / 2);
        if def.layer == Layer::Air {
            let c = bb.center();
            sx = c.0;
            sy = c.1;
        }
        let rally = bb.rally;
        let tick = w.tick;
        flow_add(&mut w.buildings[b], tick, 1);
        let id = w.spawn_unit(kind, owner as u8, sx, sy);
        let s = slot_of(id);
        w.units.facing[s] = (bb_dir_angle(w.buildings[b].dir)) as u16;
        w.units.cold[s].orders.push(Order::Move { x: rally.0, y: rally.1, gx: rally.0, gy: rally.1, attack: false });
        let bb = &mut w.buildings[b];
        if let Some(q) = bb.queue.first_mut() {
            q.1 = q.1.saturating_sub(1);
            if q.1 == 0 {
                let k = q.0;
                bb.queue.remove(0);
                if bb.repeat {
                    bb.queue.push((k, 1));
                }
            }
        }
        bb.wake = 0;
        // dernier exemplaire d'un type : son avance de composants retourne au stock
        factory_trim(w, b);
        wake_watchers(w, b);
    }
}

#[inline]
pub fn bb_dir_angle(dir: u8) -> i32 {
    (dir as i32 & 3) * 16384
}

fn tick_shield(w: &mut World, b: usize) {
    let use_ = w.buildings[b].def().power_use;
    // bouclier coupé : il ne consomme rien (et ne se recharge pas)
    let s = if w.buildings[b].enabled { use_power(w, b, use_) } else { 0 };
    let bb = &mut w.buildings[b];
    let max = bb.def().shield_hp;
    bb.working = s >= 512;
    if bb.shield_down > 0 {
        bb.shield_down -= 1;
        if bb.shield_down == 0 {
            bb.shield = max / 4;
        }
        return;
    }
    if bb.working && bb.enabled {
        bb.shield = (bb.shield + max / 400).min(max);
    }
}

fn tick_ammo_builder(w: &mut World, b: usize, cost: &[(u8, u16)], max: u16, ticks: u32) {
    let use_ = w.buildings[b].def().power_use;
    let bb = &w.buildings[b];
    if bb.ammo >= max {
        w.buildings[b].working = false;
        w.buildings[b].wake = w.tick + 20;
        return;
    }
    if !bb.working {
        let has = cost.iter().enumerate().all(|(j, c)| bb.inv[j] >= c.1);
        if !has {
            w.buildings[b].wake = w.tick + 20;
            return;
        }
        let bb = &mut w.buildings[b];
        for (j, c) in cost.iter().enumerate() {
            bb.inv[j] -= c.1;
        }
        bb.working = true;
        bb.progress = 0;
        wake_watchers(w, b);
    }
    let s = use_power(w, b, use_);
    let bb = &mut w.buildings[b];
    bb.progress += s as u32 * 100;
    if bb.progress >= ticks * RECIPE_SCALE {
        bb.working = false;
        bb.ammo += 1;
    }
}

fn tick_gate(w: &mut World, b: usize) {
    let open = w.buildings[b].enabled && w.building(w.buildings[b].link).is_some();
    if !open {
        // porte fermée ou non reliée : elle ne consomme rien
        w.buildings[b].working = false;
        w.buildings[b].charge = 0;
        return;
    }
    // ouverture : forte consommation pendant 5 s, puis maintien
    let charging = w.buildings[b].charge < 100;
    let need = if charging { 4000 } else { 1500 };
    let s = use_power(w, b, need);
    let bb = &mut w.buildings[b];
    if s >= 700 {
        if charging {
            bb.charge += 1;
        }
        bb.working = !charging;
    } else {
        bb.working = false;
        if bb.charge > 0 {
            bb.charge -= 1;
        }
    }
}

// ---------- Bras ----------
const SWING: u16 = 6;

fn tick_inserter(w: &mut World, b: usize) {
    let ((sx, sy), (tx, ty)) = arm_ends(&w.buildings[b]);
    if !w.map.inside(sx, sy) || !w.map.inside(tx, ty) {
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    }
    let s = use_power(w, b, w.buildings[b].def().power_use);
    // sans courant, le bras ne manipule que du combustible (le combustible qu'il porte l'alimente)
    let fuel_only = s < ARM_MIN_SAT;
    if fuel_only {
        let bb = &w.buildings[b];
        if matches!(bb.phase, 1 | 2) && !is_fuel(bb.hand) {
            w.buildings[b].wake = w.tick + 10;
            return;
        }
    }
    let to = w.map.occ[w.map.idx(tx, ty)];
    let so = w.map.occ[w.map.idx(sx, sy)];
    match w.buildings[b].phase {
        0 => {
            if to == 0 || so == 0 {
                w.buildings[b].wake = w.tick + 20;
                return;
            }
            let (t, sb) = ((to - 1) as usize, (so - 1) as usize);
            if !w.buildings[t].complete() || !w.buildings[sb].complete() {
                w.buildings[b].wake = w.tick + 20;
                return;
            }
            let mut want = [false; NUM_ITEMS];
            let tclass = w.buildings[t].def().class;
            let mut any = false;
            for (it, slot) in want.iter_mut().enumerate().skip(1) {
                *slot = (tclass == BClass::Belt || accepts(w, t, it as u8)) && (!fuel_only || is_fuel(it as u8));
                any |= *slot;
            }
            if !any && fuel_only {
                // sans courant et rien à brûler à prendre : on réessaie bientôt (le courant peut revenir)
                w.buildings[b].wake = w.tick + 10;
                return;
            }
            if !any {
                watch(w, t, b);
                w.buildings[b].wake = w.tick + SLEEP;
                return;
            }
            let mut stride = 0;
            let got = if w.buildings[sb].def().class == BClass::Belt {
                belts::take_from_belt(w, sb, &|i| want[i as usize])
            } else {
                // plusieurs bras sur la même source : ils se servent à tour de rôle, selon leur part
                match share_turn(w, b, sb) {
                    Some(st) => stride = st,
                    None => {
                        watch(w, sb, b);
                        w.buildings[b].wake = w.tick + 4;
                        return;
                    }
                }
                take_output(w, sb, &want)
            };
            if got != 0 {
                advance_outlet(w, sb, b, stride);
            }
            if got == 0 {
                if w.buildings[sb].def().class == BClass::Belt {
                    w.buildings[b].wake = w.tick + 3;
                } else {
                    watch(w, sb, b);
                    w.buildings[b].wake = w.tick + SLEEP;
                }
                return;
            }
            if w.buildings[sb].def().class != BClass::Belt {
                wake_watchers(w, sb);
            }
            let bb = &mut w.buildings[b];
            bb.hand = got;
            bb.phase = 1;
            bb.timer = SWING;
            bb.working = true;
        }
        1 => {
            let bb = &mut w.buildings[b];
            bb.timer = bb.timer.saturating_sub(1);
            if bb.timer == 0 {
                bb.phase = 2;
            }
        }
        2 => {
            let item = w.buildings[b].hand;
            if push_to(w, tx, ty, item, w.buildings[b].dir) {
                let tick = w.tick;
                let bb = &mut w.buildings[b];
                flow_add(bb, tick, 1);
                bb.hand = 0;
                bb.phase = 3;
                bb.timer = SWING;
            } else if to != 0 && w.buildings[(to - 1) as usize].def().class != BClass::Belt {
                watch(w, (to - 1) as usize, b);
                w.buildings[b].wake = w.tick + SLEEP;
            } else {
                w.buildings[b].wake = w.tick + 3;
            }
        }
        _ => {
            let bb = &mut w.buildings[b];
            bb.timer = bb.timer.saturating_sub(1);
            if bb.timer == 0 {
                bb.phase = 0;
                bb.working = false;
            }
        }
    }
}

/// Trouve une case libre (passable) près de (x, y) pour la couche donnée.
pub fn free_spot_near(w: &World, x: i32, y: i32, mask: u8) -> (i32, i32) {
    let tx = x / TILE;
    let ty = y / TILE;
    for r in 0..12i32 {
        for dy in -r..=r {
            for dx in -r..=r {
                if dx.abs() != r && dy.abs() != r {
                    continue;
                }
                if w.map.passable(tx + dx, ty + dy, mask) {
                    return ((tx + dx) * TILE + TILE / 2, (ty + dy) * TILE + TILE / 2);
                }
            }
        }
    }
    let _ = P_LAND;
    (x, y)
}
