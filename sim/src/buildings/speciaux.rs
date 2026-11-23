//! Bâtiments à charge : bouclier, fabrication de munitions (silo, antimissile), porte de transit (et terrier
//! de la Souche, qui a son tick dans souche.rs).

use super::*;

pub(super) fn tick_shield(w: &mut World, b: usize) {
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

pub(super) fn tick_ammo_builder(w: &mut World, b: usize, cost: &[(u8, u16)], max: u16, ticks: u32) {
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

pub(super) fn tick_gate(w: &mut World, b: usize) {
    // terrier de la Souche : pas d'énergie, il suit son réseau de racines
    if w.buildings[b].kind == B_BURROW {
        crate::souche::tick_burrow(w, b);
        return;
    }
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
