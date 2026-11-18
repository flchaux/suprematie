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
        BClass::Extractor | BClass::Inserter | BClass::Crafter | BClass::Lab | BClass::Factory | BClass::Turret | BClass::Shield | BClass::Silo | BClass::AntiMissile | BClass::Orbital | BClass::Gate | BClass::Transfer | BClass::Radar | BClass::Beacon | BClass::Station | BClass::CargoPad | BClass::Router | BClass::Portal | BClass::Roboport
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
        let ok = w.map.spots.iter().any(|s| (def.deposit == 255 || s.kind == def.deposit) && s.x >= x && s.y >= y && s.x + 2 <= x + bw && s.y + 2 <= y + bh);
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
    w.buildings[slot] = Building {
        alive: true,
        gen,
        kind,
        owner,
        floor,
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
    if needs_tick(def.class) {
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
    w.buildings_version = w.buildings_version.wrapping_add(1);
    w.ev(EV_BUILT, owner as i32, kind as i32, x, y);
}

pub fn remove_building(w: &mut World, b: usize, with_wreck: bool) {
    let (x, y, kind) = (w.buildings[b].x, w.buildings[b].y, w.buildings[b].kind);
    let (bw, bh) = w.buildings[b].size();
    let def = bdef(kind);
    let floor = w.buildings[b].floor;
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
                b.alive && b.owner == owner && b.complete() && b.def().supply > 0
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
            let net = if best != usize::MAX { pole_net[best] } else { 0 };
            if b.complete() && def.power_prod > 0 && net != 0 {
                w.nets[net as usize].prod += def.power_prod;
            }
            w.buildings[bi].net = net;
            if net != 0 {
                w.buildings[bi].wake = 0;
            }
        }
        for &pb in &poles {
            pole_net[pb] = 0;
        }
    }
}

pub fn power_tick(w: &mut World) {
    for p in w.players.iter_mut() {
        p.power_prod = 0;
        p.power_use = 0;
    }
    for n in w.nets.iter_mut().skip(1) {
        n.demand = n.demand_next;
        n.demand_next = 0;
        n.sat = if n.demand <= 0 { 1024 } else { ((n.prod as i64 * 1024 / n.demand as i64) as i32).min(1024) };
        if let Some(p) = w.players.get_mut(n.owner as usize) {
            p.power_prod += n.prod;
            p.power_use += n.demand;
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

/// Case de prise et case de dépose d'un bras (à `reach` cases de part et d'autre, selon sa direction).
pub fn arm_ends(bb: &Building) -> ((i32, i32), (i32, i32)) {
    let (dx, dy) = DIRS[(bb.dir & 3) as usize];
    let r = bb.def().reach.max(1) as i32;
    ((bb.x - dx * r, bb.y - dy * r), (bb.x + dx * r, bb.y + dy * r))
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
    matches!(c, BClass::Depot | BClass::Warehouse | BClass::Station | BClass::CargoPad | BClass::Crafter | BClass::Lab | BClass::Factory | BClass::Silo | BClass::AntiMissile)
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
                    if cb.dir == face {
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
        (tc == BClass::Belt && class == BClass::Crafter && tb.dir == d) || (direct_receiver(tc) && tb.owner == bb.owner)
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
        BClass::Inserter => arm_powered(w, c) && taker_ready(w, c, it),
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

/// Le bâtiment accepte-t-il cet objet (par un bras ou un tapis) ?
pub fn accepts(w: &World, b: usize, item: u8) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || !bb.complete() || item == 0 {
        return false;
    }
    match bb.def().class {
        BClass::Depot => true,
        BClass::Warehouse | BClass::Station | BClass::CargoPad => crate::logistics::accepts(w, b, item),
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
        BClass::Factory => {
            if let Some(&(k, _)) = bb.queue.first() {
                let cost = udef(k).cost;
                if let Some(j) = cost_slot(cost, item) {
                    return bb.inv[j] < cost[j].1;
                }
            }
            false
        }
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
        }
        BClass::Warehouse | BClass::Station | BClass::CargoPad => crate::logistics::insert(w, b, item),
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
        BClass::Factory => {
            if let Some(&(k, _)) = w.buildings[b].queue.first() {
                if let Some(j) = cost_slot(udef(k).cost, item) {
                    w.buildings[b].inv[j] += 1;
                }
            }
        }
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
    let it = output_of(&w.buildings[b]);
    if it != 0 && want[it as usize] {
        w.buildings[b].out -= 1;
        w.buildings[b].wake = 0;
        return it;
    }
    0
}

/// Pousse un objet vers la case (x, y) : tapis ou bâtiment qui l'accepte.
fn push_to(w: &mut World, x: i32, y: i32, item: u8) -> bool {
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
    if accepts(w, t, item) {
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
            BClass::Shield => tick_shield(w, b),
            BClass::Silo => tick_ammo_builder(w, b, MISSILE_COST, 1, 1200),
            BClass::AntiMissile => {
                tick_ammo_builder(w, b, INTERCEPTOR_COST, 3, 400);
                crate::combat::antimissile(w, b);
            }
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
    let order: &[usize] = match kind {
        B_SPLITTER => match turn % 3 {
            0 => &[0, 1, 2],
            1 => &[1, 2, 0],
            _ => &[2, 0, 1],
        },
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
        if push_to(w, x + dx, y + dy, item) {
            let bb = &mut w.buildings[b];
            bb.stash.remove(0);
            bb.working = true;
            if kind == B_SPLITTER {
                bb.hand = ((k + 1) % 3) as u8;
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
    true
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
            if push_to(w, fx, fy, it) {
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
    let s = use_power(w, b, bdef(B_EXTRACTOR).power_use * lvl.power / 100);
    let mult = w.players[owner].res_mult as u32;
    let bb = &mut w.buildings[b];
    bb.working = s > 0;
    // niveau d'amélioration : vitesse en % du niveau 0
    bb.progress += s as u32 * mult * lvl.speed / 100;
    if bb.progress >= 30 * RECIPE_SCALE {
        bb.progress -= 30 * RECIPE_SCALE;
        bb.out += 1;
        let it = bb.recipe as usize;
        w.players[owner].produced[it] += 1;
    }
}

/// Tapis qui partent d'une face du bâtiment `b` (case voisine d'un bord, tapis tourné vers l'extérieur) :
/// les « trappes de sortie ». Par ordre de case (déterministe).
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
        if tb.alive && tb.complete() && tb.def().class == BClass::Belt && tb.dir == d {
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
    tick_crafter_work(w, b);
    if outlets && w.buildings[b].out > 0 {
        // produits en attente : revenir bientôt les poser (le tapis avance)
        let soon = w.tick + 2;
        if w.buildings[b].wake > soon {
            w.buildings[b].wake = soon;
        }
    }
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
        let cap = (on * 3).max(4);
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
    let speed = w.buildings[b].def().speed as u32;
    let use_ = w.buildings[b].def().power_use;
    let s = use_power(w, b, use_);
    let bb = &mut w.buildings[b];
    bb.progress += speed * s as u32;
    if bb.progress >= rec.time as u32 * RECIPE_SCALE {
        bb.working = false;
        bb.out += rec.output.1 as u16;
        let owner = bb.owner as usize;
        w.players[owner].produced[rec.output.0 as usize] += rec.output.1 as u32;
        wake_watchers(w, b);
    }
}

fn tick_lab(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner as usize;
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
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    };
    let def = udef(kind);
    if !w.buildings[b].working {
        let has = def.cost.iter().enumerate().all(|(j, c)| w.buildings[b].inv[j] >= c.1);
        if !has || w.players[owner].unit_count >= UNIT_CAP {
            w.buildings[b].wake = w.tick + SLEEP;
            return;
        }
        for (j, c) in def.cost.iter().enumerate() {
            w.buildings[b].inv[j] -= c.1;
            w.players[owner].consumed[c.0 as usize] += c.1 as u32;
        }
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
        wake_watchers(w, b);
    }
}

#[inline]
pub fn bb_dir_angle(dir: u8) -> i32 {
    (dir as i32 & 3) * 16384
}

fn tick_shield(w: &mut World, b: usize) {
    let use_ = w.buildings[b].def().power_use;
    let s = use_power(w, b, use_);
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
    let use_ = w.buildings[b].def().power_use;
    let open = w.buildings[b].enabled && w.building(w.buildings[b].link).is_some();
    if !open {
        use_power(w, b, use_);
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
    if s < ARM_MIN_SAT {
        w.buildings[b].wake = w.tick + 10;
        return;
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
                *slot = tclass == BClass::Belt || accepts(w, t, it as u8);
                any |= *slot;
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
            if push_to(w, tx, ty, item) {
                let bb = &mut w.buildings[b];
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
