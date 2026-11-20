//! Machines jumelles : une seule règle pour le partage (`buildings::twins_of`), pour la recette qu'un
//! fabricant prend à la fin de son chantier (`adopt_twin_recipe`) et pour l'aperçu de pose
//! (`twin_preview`, liseré vert sur les côtés de l'aperçu qui formeront un jumelage).

use crate::buildings::{can_place, dims, wake_watchers};
use crate::data::*;
use crate::world::*;

/// Ce que fabrique une machine, au sens du jumelage : sa recette (fabricant), l'unité en tête de sa
/// file (usine), 0 pour un laboratoire (ils travaillent tous à la recherche du joueur) ; pour un
/// générateur, ce qu'il brûle (0 : hydrocarbure et carburant, 1 : cellules d'énergie) ; None : rien.
pub fn product_key(bb: &Building) -> Option<u16> {
    match bb.def().class {
        BClass::Crafter => (bb.recipe != RECIPE_NONE).then_some(bb.recipe as u16),
        BClass::Factory => bb.queue.first().map(|q| q.0),
        BClass::Lab => Some(0),
        BClass::Power => Some(fuel_key(bb.kind)),
        _ => None,
    }
}

/// Combustibles d'un générateur, au sens du jumelage : 1 pour le réacteur à cristal (cellules), 0 pour
/// les autres (hydrocarbure et carburant).
#[inline]
fn fuel_key(kind: u16) -> u16 {
    (kind == B_CRYSTAL_REACTOR) as u16
}

/// Types qui peuvent être jumeaux : le même type ; deux générateurs quelconques (le générateur
/// principal, un générateur et une centrale brûlent la même chose : `product_key` les départage).
#[inline]
fn same_family(a: u16, b: u16) -> bool {
    a == b || (bdef(a).class == BClass::Power && bdef(b).class == BClass::Power)
}

/// `cb` est-il une jumelle possible pour une machine de type `kind` du joueur `owner` qui fabrique
/// `key` : terminé, pas en amélioration, même type (ou deux générateurs), même joueur, même produit
/// (mêmes combustibles) ?
#[inline]
pub fn twin_with(cb: &Building, kind: u16, owner: u8, key: u16) -> bool {
    cb.alive && cb.complete() && cb.upgrade == 0 && same_family(cb.kind, kind) && cb.owner == owner && product_key(cb) == Some(key)
}

/// Case extérieure collée au côté `side` (0 : +x, 1 : +y, 2 : -x, 3 : -y), `k`-ième case le long du côté,
/// d'une emprise (x, y, bw, bh). Même ordre que les trappes du client.
#[inline]
fn face_tile(x: i32, y: i32, bw: i32, bh: i32, side: usize, k: i32) -> (i32, i32) {
    match side {
        0 => (x + bw, y + k),
        1 => (x + k, y + bh),
        2 => (x - 1, y + k),
        _ => (x + k, y - 1),
    }
}

/// Bâtiments collés à une face de `b`, par indice croissant, sans doublon.
fn face_neighbors(w: &World, b: usize) -> Vec<usize> {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let mut v = Vec::new();
    for side in 0..4 {
        for k in 0..if side & 1 == 0 { bh } else { bw } {
            let (tx, ty) = face_tile(bb.x, bb.y, bw, bh, side, k);
            if !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o != 0 && o as usize - 1 != b {
                v.push(o as usize - 1);
            }
        }
    }
    v.sort_unstable();
    v.dedup();
    v
}

/**
 * Fin du chantier d'un fabricant sans recette : il prend celle de la plus ancienne (plus petit indice)
 * machine collée qui pourrait être sa jumelle (même type, même joueur, terminée, pas en amélioration,
 * avec une recette), avec son verrou, et la transmet de proche en proche aux machines identiques
 * terminées et encore sans recette qui lui sont collées : une rangée posée à côté d'une machine en
 * marche devient une rangée de jumelles, quel que soit l'ordre dans lequel les chantiers finissent.
 * Un bâtiment reconstruit qui a sa propre recette à reprendre (fantôme) n'est pas concerné.
 */
pub fn adopt_twin_recipe(w: &mut World, b: usize) {
    let bb = &w.buildings[b];
    if bb.def().class != BClass::Crafter || bb.recipe != RECIPE_NONE || bb.upgrade != 0 {
        return;
    }
    let (kind, owner) = (bb.kind, bb.owner);
    let restoring = |w: &World, c: usize| {
        let cb = &w.buildings[c];
        w.ghosts.iter().any(|g| g.owner == owner && g.kind == kind && g.x == cb.x && g.y == cb.y && g.recipe != RECIPE_NONE)
    };
    if restoring(w, b) {
        return;
    }
    let Some(src) = face_neighbors(w, b).into_iter().find(|&c| {
        let cb = &w.buildings[c];
        cb.recipe != RECIPE_NONE && twin_with(cb, kind, owner, cb.recipe as u16)
    }) else {
        return;
    };
    let (recipe, repeat) = (w.buildings[src].recipe, w.buildings[src].repeat);
    let mut todo = vec![b];
    while let Some(m) = todo.pop() {
        let mb = &mut w.buildings[m];
        mb.recipe = recipe;
        mb.repeat = repeat;
        mb.wake = 0;
        wake_watchers(w, m);
        for c in face_neighbors(w, m) {
            let cb = &w.buildings[c];
            if cb.alive && cb.complete() && cb.upgrade == 0 && cb.kind == kind && cb.owner == owner && cb.recipe == RECIPE_NONE && !restoring(w, c) && !todo.contains(&c) {
                todo.push(c);
            }
        }
    }
}

/// Bit du liseré de jumelage : `k`-ième case le long du côté `side` (8 bits par côté).
pub const fn twin_bit(side: usize, k: i32) -> i32 {
    1 << (side as i32 * 8 + k)
}

/**
 * Aperçu de pose : pour chaque emplacement (x, y, dir) d'un bâtiment de type `kind` du joueur `owner`,
 * dans l'ordre de pose, les cases de bord (bits `twin_bit`) collées à une machine qui sera sa jumelle :
 * une machine existante qui fabrique la même chose, ou un autre emplacement posable de la même pose.
 * Ce que fabriquera la nouvelle machine suit la simulation : un laboratoire travaille toujours à la
 * recherche ; un générateur est jumeau de tout générateur collé qui brûle les mêmes combustibles ; un fabricant prend la recette de sa plus ancienne voisine possible (`adopt_twin_recipe`),
 * transmise d'emplacement en emplacement ; une usine neuve a une file vide et n'a pas de jumelle.
 * Un emplacement où la pose est impossible ne compte pas (0).
 */
pub fn twin_preview(w: &World, owner: u8, kind: u16, cells: &[(i32, i32, u8)]) -> Vec<i32> {
    let mut out = vec![0; cells.len()];
    if kind as usize >= BUILDINGS.len() {
        return out;
    }
    let class = bdef(kind).class;
    if !matches!(class, BClass::Crafter | BClass::Lab | BClass::Power) {
        return out;
    }
    let rect: Vec<(i32, i32, i32, i32)> = cells.iter().map(|&(x, y, d)| {
        let (bw, bh) = dims(kind, d & 3);
        (x, y, bw, bh)
    }).collect();
    let ok: Vec<bool> = cells.iter().map(|&(x, y, d)| can_place(w, owner, kind, x, y, d)).collect();
    // emplacement de la pose qui couvre la case (tx, ty)
    let cell_at = |tx: i32, ty: i32, not: usize| (0..cells.len()).find(|&j| j != not && ok[j] && tx >= rect[j].0 && tx < rect[j].0 + rect[j].2 && ty >= rect[j].1 && ty < rect[j].1 + rect[j].3);
    // machine existante qui pourrait être la jumelle d'une machine de ce type qui fabrique `key`
    let existing = |tx: i32, ty: i32| -> Option<&Building> {
        if !w.map.inside(tx, ty) {
            return None;
        }
        let o = w.map.occ[w.map.idx(tx, ty)];
        (o != 0).then(|| &w.buildings[o as usize - 1])
    };
    let mut key: Vec<Option<u16>> = vec![None; cells.len()];
    if class != BClass::Crafter {
        // laboratoire : la recherche du joueur ; générateur : ses combustibles
        let k0 = if class == BClass::Power { fuel_key(kind) } else { 0 };
        for (i, k) in key.iter_mut().enumerate() {
            *k = ok[i].then_some(k0);
        }
    } else {
        // recette prise à la plus ancienne voisine existante, puis transmise entre emplacements collés
        for i in 0..cells.len() {
            if !ok[i] {
                continue;
            }
            let (x, y, bw, bh) = rect[i];
            let mut best: Option<(usize, u16)> = None;
            for side in 0..4 {
                for k in 0..if side & 1 == 0 { bh } else { bw } {
                    let (tx, ty) = face_tile(x, y, bw, bh, side, k);
                    let Some(cb) = existing(tx, ty) else { continue };
                    let c = w.map.occ[w.map.idx(tx, ty)] as usize - 1;
                    if cb.recipe != RECIPE_NONE && twin_with(cb, kind, owner, cb.recipe as u16) && best.is_none_or(|(bc, _)| c < bc) {
                        best = Some((c, cb.recipe as u16));
                    }
                }
            }
            key[i] = best.map(|b| b.1);
        }
        loop {
            let mut changed = false;
            for i in 0..cells.len() {
                if !ok[i] || key[i].is_some() {
                    continue;
                }
                let (x, y, bw, bh) = rect[i];
                'sides: for side in 0..4 {
                    for k in 0..if side & 1 == 0 { bh } else { bw } {
                        let (tx, ty) = face_tile(x, y, bw, bh, side, k);
                        if let Some(j) = cell_at(tx, ty, i).filter(|&j| key[j].is_some()) {
                            key[i] = key[j];
                            changed = true;
                            break 'sides;
                        }
                    }
                }
            }
            if !changed {
                break;
            }
        }
    }
    for i in 0..cells.len() {
        let Some(my) = key[i] else { continue };
        let (x, y, bw, bh) = rect[i];
        for side in 0..4 {
            for k in 0..if side & 1 == 0 { bh } else { bw } {
                let (tx, ty) = face_tile(x, y, bw, bh, side, k);
                let twin = match cell_at(tx, ty, i) {
                    Some(j) => key[j] == Some(my),
                    None => existing(tx, ty).is_some_and(|cb| twin_with(cb, kind, owner, my)),
                };
                if twin {
                    out[i] |= twin_bit(side, k);
                }
            }
        }
    }
    out
}
