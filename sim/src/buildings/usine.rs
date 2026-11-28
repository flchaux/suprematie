//! Usines d'unités : réserve de composants (`factory_*`) et production de la file (`tick_factory`).

use super::*;

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

/// Plafond de la réserve de l'usine pour `item` : deux fois le plus gros besoin d'une entrée de la file
/// (une unité, ou une portée de la Souche).
fn factory_limit(bb: &Building, item: u8) -> u16 {
    // (une portée d'œufs ne coûte rien à la couveuse)
    bb.queue.iter().filter(|q| udef(q.0).litter == 0).map(|q| udef(q.0).cost.iter().find(|c| c.0 == item).map_or(0, |c| c.1 * batch(q.0))).max().unwrap_or(0).saturating_mul(FACTORY_AHEAD)
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

/// Après un changement de file : ce qui dépasse le nouveau plafond de la réserve de l'usine est
/// remboursé (dépôt le plus proche).
pub fn factory_trim(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner;
    for it in 0..w.buildings[b].stash.len() {
        let bb = &w.buildings[b];
        let extra = bb.stash[it].saturating_sub(factory_limit(bb, it as u8));
        if extra > 0 {
            w.buildings[b].stash[it] -= extra;
            if w.buildings[b].def().race == RACE_SOUCHE {
                let net = w.buildings[b].net;
                crate::souche::refund(w, net, it as u8, extra as i32);
            } else {
                crate::drones::refund_at(w, owner, b, it as u8, extra as u32);
            }
        }
    }
}

/// Usine en attente de composants depuis 10 s : alerte EV_FACTORY_STARVED pour son joueur.
const FACTORY_ALERT_DELAY: u32 = 200;
const FACTORY_ALERTED: u32 = NONE - 1;

pub(super) fn tick_factory(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner as usize;
    let Some(&(kind, _)) = w.buildings[b].queue.first() else {
        w.buildings[b].working = false;
        w.buildings[b].target = NONE;
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    };
    let def = udef(kind);
    let litter = def.litter > 0;
    if w.buildings[b].def().race == RACE_SOUCHE {
        // frayère : le coût de l'unité vient du réseau de racines ; couveuse : rien à payer, ses œufs paient
        if litter {
            crate::ponte::give_back(w, b);
        } else {
            crate::souche::feed_factory(w, b);
        }
    }
    share_with_twins(w, b);
    // une entrée de file : une unité, ou la portée entière d'un organisme de la Souche (voir ponte.rs)
    let n = batch(kind);
    if !w.buildings[b].working {
        // couveuse : reliée à un réseau, et pas plus de portées en train de couver que son niveau n'en permet
        if litter && (w.buildings[b].net == 0 || !crate::ponte::has_room(w, b)) {
            w.buildings[b].wake = w.tick + crate::souche::ORGAN_PERIOD;
            return;
        }
        let missing = if litter { None } else { def.cost.iter().find(|c| factory_has(&w.buildings[b], c.0) < c.1 * n).map(|c| c.0) };
        // Arche : pas plus de ARKS_MAX en jeu (la suivante attend qu'une disparaisse)
        let ark_full = kind == U_ARK && crate::transhumants::arks_of(w, owner as u8) >= crate::transhumants::ARKS_MAX;
        if missing.is_some() || ark_full || w.players[owner].unit_count + n as u32 > UNIT_CAP {
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
        if !litter {
            for c in def.cost {
                w.buildings[b].stash[c.0 as usize] -= c.1 * n;
                w.players[owner].consumed[c.0 as usize] += (c.1 * n) as u32;
            }
        }
        w.buildings[b].target = NONE;
        w.buildings[b].working = true;
        w.buildings[b].progress = 0;
        // Transhumants : l'unité sortira équipée selon son gabarit, s'il peut être payé (pas une Arche : elle sort nue)
        if def.race == RACE_TRANSH && kind != U_ARK {
            let (cx, cy) = w.buildings[b].center();
            w.buildings[b].kit = crate::gabarits::begin(w, owner as u8, cx, cy, kind);
        }
        wake_watchers(w, b);
    }
    let use_ = power_need(&w.buildings[b]);
    let s = use_power(w, b, use_);
    let mut mult = w.players[owner].build_mult as u32 * crate::ameliorations::module_speed(&w.buildings[b]) / 100;
    if w.buildings[b].def().race == RACE_SOUCHE {
        mult = mult * crate::souche::brood_speed(w, owner as u8) / 100;
        // Reine enracinée : les couveuses de son réseau pondent plus vite
        if w.buildings[b].net != 0 && crate::essaim::royal_net(w, owner as u8) == w.buildings[b].net {
            mult = mult * crate::essaim::Q_BROOD / 100;
        }
    }
    w.buildings[b].progress += s as u32 * mult;
    if w.buildings[b].progress >= (factory_ticks(kind) + crate::gabarits::ticks(w.buildings[b].kit)) * RECIPE_SCALE {
        w.buildings[b].working = false;
        let tick = w.tick;
        flow_add(&mut w.buildings[b], tick, n);
        if def.litter > 0 {
            // couveuse : la portée est pondue devant elle, ses œufs éclosent plus tard
            crate::ponte::lay(w, b, kind);
        } else {
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
            // cour de rodage (Transhumants) : premier niveau de vétérance
            if crate::ameliorations::fit(&w.buildings[b]) == crate::ameliorations::M_SHOP_VETS && !def.weapons.is_empty() {
                w.units.cold[s].lvl = 1;
                w.units.cold[s].xp = 2 * def.hp.max(1) as u32;
                w.units.hp[s] = w.max_hp(s);
            }
            w.units.cold[s].orders.push(Order::Move { x: rally.0, y: rally.1, gx: rally.0, gy: rally.1, attack: false, pace: 0, wait: 0 });
            if def.race == RACE_TRANSH {
                let kit = std::mem::take(&mut w.buildings[b].kit);
                crate::gabarits::deliver(w, s, kit);
            }
        }
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
        // dernier exemplaire d'un type : son avance de composants est remboursée
        factory_trim(w, b);
        wake_watchers(w, b);
    }
}

#[inline]
pub fn bb_dir_angle(dir: u8) -> i32 {
    (dir as i32 & 3) * 16384
}
