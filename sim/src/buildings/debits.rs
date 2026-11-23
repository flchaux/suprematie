//! Débits : objets comptés sur la dernière minute (`flow_add`, `flow_per_min`) et débit maximal d'un
//! bâtiment (`flow_max`).

use super::*;

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
        // pureté du gisement et cadence comprises (comme tick_extractor)
        BClass::Extractor => {
            let lvl = EXTRACTOR_LEVELS[(bb.level as usize).min(EXTRACTOR_LEVELS.len() - 1)].speed as u64;
            tenths(12_000 * w.players[owner].res_mult.max(0) as u64 * lvl * purity_of(bb) as u64 * clock_of(bb) as u64, 30 * 100 * 100 * 100 * 100)
        }
        // une unité (ou une portée) : factory_ticks * RECIPE_SCALE de progrès, 1024 * build_mult par tick
        BClass::Factory => bb.queue.first().map_or(0, |q| tenths(120 * w.players[owner].build_mult.max(0) as u64 * crate::ameliorations::module_speed(bb) as u64 * batch(q.0) as u64, factory_ticks(q.0) as u64 * 100)),
        // un cycle de recherche : time secondes
        BClass::Lab => {
            let t = if bb.working { bb.tech } else { w.players[owner].research };
            if t == 0 { 0 } else { tenths(6 * crate::ameliorations::module_speed(bb) as u64, TECHS[t as usize].time as u64) }
        }
        // prise, aller (SWING ticks), dépose, retour (SWING ticks)
        BClass::Inserter => tenths(12_000, 2 * SWING as u64 + 2),
        _ => 0,
    }
}
