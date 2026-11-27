//! Entrées et sorties d'objets : ce qu'un bâtiment accepte (`accepts`), reçoit (`insert_item`) et rend
//! (`output_of`, `take_output`), pose sur une case voisine (`push_to`), tapis de contrôle (répartiteur,
//! trieur, débordement : `tick_router`).

use super::*;

// ---------- Entrées / sorties d'objets ----------
/// Recette du fabricant `b` qui se sert de `item` (la première recherchée de son type), RECIPE_NONE : aucune.
pub fn recipe_for(w: &World, b: &Building, item: u8) -> u8 {
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
    if !bb.alive || !bb.complete() || item == 0 || paused(bb) {
        return false;
    }
    match bb.def().class {
        BClass::Depot => crate::drones::store_room(bb, item) > 0,
        BClass::Warehouse | BClass::Station | BClass::CargoPad => crate::logistics::accepts(w, b, item),
        BClass::Power => {
            let e = fuel_energy(bb.kind, item);
            e > 0 && bb.fuel + e <= tank_of(bb)
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
            crate::drones::put(&mut w.buildings[b].stash, item, 1);
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
    // un objet qui manquait au stock : les bras qui attendaient de quoi se servir se réveillent
    if matches!(class, BClass::Depot | BClass::Warehouse) && crate::drones::has(&w.buildings[b].stash, item) == 1 {
        wake_watchers(w, b);
    }
    w.buildings[b].wake = 0;
}

/// Objet produit disponible en sortie du bâtiment.
pub fn output_of(b: &Building) -> u8 {
    match b.def().class {
        BClass::Crafter if b.recipe != RECIPE_NONE && b.out > 0 => RECIPES[b.recipe as usize].output.0,
        BClass::Extractor if b.out > 0 => b.recipe,
        _ => 0,
    }
}

pub(super) fn take_output(w: &mut World, b: usize, want: &[bool; NUM_ITEMS]) -> u8 {
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
pub(super) fn push_to(w: &mut World, x: i32, y: i32, item: u8, travel_dir: u8) -> bool {
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

/// Tapis de contrôle : un objet par tick, de la mémoire tampon (4 objets) vers les sorties.
/// Répartiteur : gauche, avant, droite à tour de rôle. Trieur : l'objet choisi à gauche, le reste
/// devant. Débordement : devant d'abord, sur les côtés quand l'avant est bloqué.
pub(super) fn tick_router(w: &mut World, b: usize) {
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
