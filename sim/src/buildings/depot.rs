//! Dépôts et collecteurs : dépôts collés à un bâtiment (`touching_depots`), sortie d'un dépôt sur ses
//! tapis (`tick_depot`), collecteur de surplus (`tick_collector`).

use super::*;

/// Un dépôt collé à un générateur lui donne une unité de combustible toutes les `DEPOT_FEED_PERIOD`
/// ticks (1 par seconde).
pub const DEPOT_FEED_PERIOD: u32 = 20;

/// Dépôts terminés du même joueur collés à une face du bâtiment `b`, par indice croissant ; pour un Transhumant,
/// les soutes de son réseau de transfert, de la plus proche (bâtiments traversés) à la plus loin.
pub fn touching_depots(w: &World, b: usize) -> Vec<usize> {
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
    // Transhumants : les soutes de tout le réseau de transfert, les plus proches d'abord
    if crate::transfert::members(w, b).len() > 1 {
        v.extend(crate::transfert::members(w, b).iter().map(|&c| c as usize).filter(|&c| c != b && w.buildings[c].def().class == BClass::Depot));
        v.sort_unstable();
        v.dedup();
        crate::transfert::sort_by_hops(w, b, &mut v);
        return v;
    }
    v.sort_unstable();
    v.dedup();
    v
}

/// Objets prélevés au plus par tick par un collecteur (au-delà du débit d'un tapis express).
const COLLECT_PER_TICK: usize = 2;

/**
 * Collecteur de surplus (tapis surmonté d'un portique) : quand la file est bouchée en aval, les objets
 * à l'arrêt sur sa case (tassés à l'avant de la ligne) partent au dépôt du joueur le plus proche (à moins
 * de NEAR_SUPPLY cases) qui a de la place pour eux ; la file reste fluide en amont. Tant que la file
 * avance, il ne prend rien. Compteur des objets mis en dépôt : `out`.
 */
pub(super) fn tick_collector(w: &mut World, b: usize) {
    let (li, idx, owner, (cx, cy)) = {
        let bb = &w.buildings[b];
        if bb.line == NONE {
            return;
        }
        (bb.line as usize, bb.line_idx as i32, bb.owner, bb.center())
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
        // aucun dépôt proche n'a de place pour cet objet : il laisse passer
        let item = l.items[k].0;
        let Some(dest) = crate::drones::store_with_room(w, owner, cx, cy, NEAR_SUPPLY * TILE, item) else { return };
        let l = &mut w.belts.lines[li];
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
            dest.put(w, it, 1);
            let bb = &mut w.buildings[b];
            bb.out = bb.out.wrapping_add(1);
            bb.working = true;
        }
    }
}

/// Sortie d'un dépôt (actives par défaut) : prochain objet de son stock, à tour de rôle, que `want`
/// accepte ; avec des filtres, seulement les objets filtrés. Il quitte le stock. 0 : rien.
pub(super) fn depot_take(w: &mut World, b: usize, want: &dyn Fn(u8) -> bool) -> u8 {
    let bb = &w.buildings[b];
    if bb.stash.is_empty() {
        return 0;
    }
    // objets candidats : les filtres, sinon tous les objets
    let n = if bb.filters.is_empty() { NUM_ITEMS - 1 } else { bb.filters.len() };
    let start = bb.timer as usize % n;
    for k in 0..n {
        let j = (start + k) % n;
        let bb = &w.buildings[b];
        let it = if bb.filters.is_empty() { j as u8 + 1 } else { bb.filters[j] };
        if it != 0 && crate::drones::has(&bb.stash, it) > 0 && want(it) {
            crate::drones::take(&mut w.buildings[b].stash, it, 1);
            w.buildings[b].timer = ((j + 1) % n) as _;
            return it;
        }
    }
    0
}

/// Attente d'un dépôt qui n'a rien à poser, ou dont les tapis de sortie sont bouchés (ticks).
const DEPOT_IDLE: u32 = 20;

/**
 * Dépôt : il pose ses objets (filtrés, ou tous sans filtre), pris dans son stock à tour de rôle, sur les
 * tapis qui partent de ses faces ; sinon il dort. Il revient dès qu'un de ses tapis a de nouveau la
 * place (`belts::room_wait` : le temps que l'objet posé s'écarte, 3 ticks sur un tapis simple), et ne
 * dort `DEPOT_IDLE` ticks que s'il n'a rien à poser ou que ses tapis sont bouchés : un tapis de sortie
 * qui s'écoule se remplit à sa pleine cadence.
 */
pub(super) fn tick_depot(w: &mut World, b: usize) {
    let belts = out_belts(w, b);
    let mut any = false;
    // délai le plus court avant qu'un tapis de sortie ait de nouveau la place (None : tous bouchés)
    let mut soon: Option<u32> = None;
    let mut empty = false;
    for t in belts.iter().copied() {
        let mut wait = belts::room_wait(w, t);
        if wait == Some(0) {
            let it = depot_take(w, b, &|_| true);
            if it == 0 {
                empty = true;
                break;
            }
            belts::put_on_belt(w, t, it);
            any = true;
            wait = belts::room_wait(w, t);
        }
        if let Some(n) = wait {
            soon = Some(soon.map_or(n, |s| s.min(n)));
        }
    }
    w.buildings[b].working = any;
    w.buildings[b].wake = w.tick
        + if belts.is_empty() {
            SLEEP
        } else if empty {
            DEPOT_IDLE
        } else {
            soon.map_or(DEPOT_IDLE, |n| n.clamp(1, DEPOT_IDLE))
        };
}
