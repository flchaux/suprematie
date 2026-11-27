//! Pose et retrait des bâtiments : emprise et face avant, pose avec remplacement des tapis, fantômes à
//! reconstruire, règles de pose (`can_place`), chantier (`place_building`), rotation, fin de chantier
//! (`complete_building`), retrait (`remove_building`), case libre la plus proche (`free_spot_near`).

use super::*;

#[inline]
fn needs_tick(c: BClass) -> bool {
    matches!(
        c,
        BClass::Extractor | BClass::Depot | BClass::Power | BClass::Inserter | BClass::Crafter | BClass::Lab | BClass::Factory | BClass::Turret | BClass::Shield | BClass::Silo | BClass::AntiMissile | BClass::Orbital | BClass::Gate | BClass::Transfer | BClass::Radar | BClass::Beacon | BClass::Station | BClass::CargoPad | BClass::Router | BClass::Portal | BClass::Roboport | BClass::Nest | BClass::Organ
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
/// démontés, leur coût et les objets qu'ils portent remboursés (renvoie None : poser le chantier).
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
                crate::drones::refund_at(w, owner, b, it, 1);
            }
        }
        let def = w.buildings[b].def();
        let complete = w.buildings[b].complete();
        // fragments d'énergie installés : rendus au joueur
        w.players[p].shards += w.buildings[b].shards as u32;
        for (k, &(it, n)) in def.cost.iter().enumerate() {
            let n = if complete { n as u32 } else { w.buildings[b].paid[k] as u32 };
            crate::drones::refund_at(w, owner, b, it, n);
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
    can_place_with(w, owner, kind, x, y, dir, false)
}

/// Aperçu d'une file posée d'un coup : chaque emplacement est-il posable ? Une file de racines de la Souche
/// se plante sur le terreau à venir de ses racines précédentes (elles poussent de proche en proche) : une
/// case couverte par la zone d'une racine acceptée plus tôt dans la file compte comme du terreau.
pub fn can_place_line(w: &World, owner: u8, kind: u16, cells: &[(i32, i32, u8)]) -> Vec<bool> {
    let chain = kind == B_ROOT;
    let mut done: Vec<(i32, i32)> = Vec::new();
    cells
        .iter()
        .map(|&(x, y, dir)| {
            let mut ok = can_place(w, owner, kind, x, y, dir);
            // une racine collée par un côté à la précédente de la file est acceptée (la file pousse de proche en proche)
            if !ok && chain && done.iter().any(|&(px, py)| (x - px).abs() + (y - py).abs() == 1) {
                ok = can_place_with(w, owner, kind, x, y, dir, true);
            }
            if ok && chain {
                done.push((x, y));
            }
            ok
        })
        .collect()
}

/// `terreau` : pour une racine de la Souche plantée dans une file, le terreau est supposé (voir can_place_line).
fn can_place_with(w: &World, owner: u8, kind: u16, x: i32, y: i32, dir: u8, terreau: bool) -> bool {
    if kind as usize >= BUILDINGS.len() || owner as usize >= w.players.len() {
        return false;
    }
    let def = bdef(kind);
    // race : sauf dans les démos et les tests (réseau partout), qui posent tout pour le même joueur
    if !w.players[owner as usize].has_tech(def.tech) || (!w.infinite_grid && !crate::races::building_ok(w, owner, kind)) {
        return false;
    }
    // un nid (ou une ruine des Anciens) n'appartient qu'à la faune, et la faune ne pose que ceux-là
    if matches!(def.class, BClass::Nest | BClass::Ruin) != (w.team_of(owner) == crate::nature::NATURE_TEAM) {
        return false;
    }
    // socle à EPPZ : il faut un EPPZ capturé
    if kind == B_EPPZ_SOCKET && w.players[owner as usize].eppz == 0 {
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
    // Souche : sur le terreau de son réseau (sauf la graine-mère)
    if def.race == RACE_SOUCHE && !w.infinite_grid && !terreau && !crate::souche::can_place(w, owner, kind, x, y, bw, bh) {
        return false;
    }
    if def.deposit != 0 {
        let ok = w.map.spots.iter().any(|s| ((def.deposit == 255 && s.kind != GEYSER) || s.kind == def.deposit) && s.x >= x && s.y >= y && s.x + 2 <= x + bw && s.y + 2 <= y + bh);
        if !ok {
            return false;
        }
    }
    true
}

/// Points de vie gagnés par un chantier qui passe de l'avancement `from` à `to` (sur `BUILD_FULL`) : la part
/// de `max_hp` entre les deux, calculée sur l'avancement total pour que les arrondis ne s'accumulent pas (un
/// chantier intact garde des points de vie au moins à son avancement, ce que montre sa barre).
pub fn site_hp_gain(max_hp: i32, from: u32, to: u32) -> i32 {
    let part = |p: u32| (max_hp as i64 * p.min(BUILD_FULL) as i64 / BUILD_FULL as i64) as i32;
    part(to) - part(from)
}

pub fn place_building(w: &mut World, owner: u8, kind: u16, x: i32, y: i32, dir: u8) -> Option<usize> {
    if !can_place(w, owner, kind, x, y, dir) {
        return None;
    }
    // le socle reçoit un EPPZ du joueur (rendu si le chantier est annulé ou le socle démonté)
    if kind == B_EPPZ_SOCKET {
        w.players[owner as usize].eppz -= 1;
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
    if def.class == BClass::Extractor || (def.class == BClass::Organ && def.deposit != 0) {
        recipe = crate::map::deposit_under(&w.map, x, y, bw, bh);
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
    // la Souche : chaque organe pousse seul (voir souche::grow), il a donc un tick
    if needs_tick(def.class) || def.collect || def.race == RACE_SOUCHE {
        if let Err(p) = w.active.binary_search(&(slot as u32)) {
            w.active.insert(p, slot as u32);
        }
    }
    if def.race == RACE_SOUCHE {
        // racine, rhizome : plus ils sont loin d'une graine-mère, plus ils coûtent (fixé à la pose)
        if crate::souche::is_far_priced(kind) {
            let hearts = crate::souche::hearts(w, owner);
            w.buildings[slot].lot = crate::souche::far_pct(&hearts, kind, x, y, dir);
        }
        // son réseau (la réserve qui le fait pousser) au prochain calcul des zones
        w.power_dirty = true;
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
    if def.power_use > 0 || def.power_prod > 0 || def.supply > 0 || def.race == RACE_SOUCHE {
        w.power_dirty = true;
    }
    if def.race == RACE_SOUCHE && def.supply > 0 {
        crate::soil::pole_added(w, b);
    }
    crate::soil::eater_added(w, b);
    if def.class == BClass::Belt {
        belts::rebuild_around(w, &[(x, y)]);
    }
    // dépôt, entrepôt : ses drones et ceux des constructeurs voisins peuvent y puiser
    crate::drones::store_added(w, b);
    // fabricant sans recette collé à une machine identique : il prend sa recette (machines jumelles)
    crate::twins::adopt_twin_recipe(w, b);
    // Transhumants : les réseaux de transfert sont à recalculer
    crate::transfert::mark(w, kind);
    w.buildings_version = w.buildings_version.wrapping_add(1);
    w.ev(EV_BUILT, owner as i32, kind as i32, x, y);
}

pub fn remove_building(w: &mut World, b: usize, with_wreck: bool) {
    let (x, y, kind) = (w.buildings[b].x, w.buildings[b].y, w.buildings[b].kind);
    let (bw, bh) = w.buildings[b].size();
    let def = bdef(kind);
    let floor = w.buildings[b].floor;
    // générateur nomade : ses poteaux partent avec lui (replié, détruit ou démonté)
    if kind == B_T_GENERATOR {
        crate::transhumants::pull_poles(w, b);
    }
    crate::drones::store_removed(w, b);
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
    if def.power_use > 0 || def.power_prod > 0 || def.supply > 0 || def.race == RACE_SOUCHE {
        w.power_dirty = true;
    }
    if def.race == RACE_SOUCHE && def.supply > 0 {
        crate::soil::pole_removed(w, b);
    }
    crate::soil::eater_removed(w, b);
    // un organe de la Souche ne laisse pas d'épave (il est digéré, voir souche::digest)
    if with_wreck && def.race != RACE_SOUCHE && !matches!(def.class, BClass::Belt | BClass::Inserter | BClass::Pylon | BClass::Wall) && w.buildings[b].build > BUILD_FULL / 2 {
        let (cx, cy) = w.buildings[b].center();
        let (kind, dir) = (w.buildings[b].kind, w.buildings[b].dir & 3);
        w.spawn_wreck(cx, cy, def.cost, (bw.max(bh)) as u8, WRECK_BUILDING | kind, dir as u16 * 16384);
    }
    w.buildings[b].watchers.clear();
    w.buildings[b].queue.clear();
    crate::transfert::mark(w, kind);
    w.bfree.push(b as u32);
    w.buildings_version = w.buildings_version.wrapping_add(1);
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
