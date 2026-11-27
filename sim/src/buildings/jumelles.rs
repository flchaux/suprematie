//! Machines jumelles : recherche des jumelles (`twins_of`), partage en dernier recours des ingrédients,
//! des produits (`share_with_twins`) et du combustible (`share_fuel`). La règle « même fabrication » est
//! dans twins.rs.

use super::*;

/// Machines jumelles qui travaillent : elles partagent ingrédients et produits une fois toutes les `TWIN_PERIOD` ticks
/// (à l'arrêt, à chacun de leurs passages).
pub(super) const TWIN_PERIOD: u32 = 10;

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
pub(super) const MAX_TWINS: usize = 20;

/// Jumelles de `b` rangées dans `v` (sans allocation), par indice croissant ; renvoie leur nombre.
pub(super) fn twins_into(w: &World, b: usize, v: &mut [usize; MAX_TWINS]) -> usize {
    let bb = &w.buildings[b];
    // une machine en pause ne partage pas (comme pendant une amélioration)
    if paused(bb) {
        return 0;
    }
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
            if crate::twins::twin_with(&w.buildings[c], bb.kind, bb.owner, key) && !paused(&w.buildings[c]) {
                v[n] = c;
                n += 1;
            }
        }
    }
    // Transhumants : les jumelles de tout le réseau de transfert, les plus proches d'abord (MAX_TWINS au plus)
    if crate::transfert::members(w, b).len() > 1 {
        let mut all: Vec<usize> = crate::transfert::members(w, b)
            .iter()
            .map(|&c| c as usize)
            .filter(|&c| c != b && crate::twins::twin_with(&w.buildings[c], bb.kind, bb.owner, key) && !paused(&w.buildings[c]))
            .chain(v[..n].iter().copied())
            .collect();
        all.sort_unstable();
        all.dedup();
        crate::transfert::sort_by_hops(w, b, &mut all);
        n = all.len().min(MAX_TWINS);
        v[..n].copy_from_slice(&all[..n]);
        return n;
    }
    v[..n].sort_unstable();
    n
}

/// Partage avec les machines jumelles, en dernier recours : les bras, les tapis et les voisins qui
/// livrent ou reçoivent directement passent toujours avant (voir `share_inputs` et `share_outputs`).
/// Renvoie vrai si `b` attend de remettre ses produits à une jumelle (il repasse alors bientôt).
pub(super) fn share_with_twins(w: &mut World, b: usize) -> bool {
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
pub(super) fn share_fuel(w: &mut World, b: usize, twins: &[usize]) {
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
        if (fed && have >= 2 * unit) || have + unit > tank_of(&w.buildings[to]) {
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
    // Transhumants : un fournisseur n'importe où dans le réseau de transfert (soute, foreuse, fabricant)
    crate::transfert::members(w, b).iter().any(|&c| {
        let cb = &w.buildings[c as usize];
        c as usize != b
            && match cb.def().class {
                BClass::Depot => matches!(bb.def().class, BClass::Factory | BClass::Power),
                BClass::Crafter => cb.recipe != RECIPE_NONE && uses_item(bb, RECIPES[cb.recipe as usize].output.0),
                BClass::Extractor => uses_item(bb, cb.recipe),
                _ => false,
            }
    })
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
            BClass::Factory => udef(bb.queue[0].0).cost.iter().map(|c| (c.0 as usize, c.0, c.1 * batch(bb.queue[0].0))).collect(),
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
