//! Production : extracteur, fabricants (fonderie, assembleur, raffinerie…) et laboratoire ; cadence
//! (fragments, consommation selon la cadence) et puissance demandée par une machine.

use super::*;

pub(super) fn tick_extractor(w: &mut World, b: usize) {
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
        // foreuse nomade : pas de face avant privilégiée, ses voisins collés sont servis à tour de rôle
        // sur toutes ses faces (transfert direct ci-dessous)
        let nomad = w.buildings[b].kind == B_T_DRILL;
        for k in 0..if nomad { 0 } else { n } {
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
    let need = need * crate::ameliorations::module_power(&w.buildings[b]) / 100;
    let s = if w.buildings[b].recipe == HYDROCARBON { 1024 } else { use_power(w, b, need) };
    let mult = w.players[owner].res_mult as u32;
    // pureté du gisement : 50 % (impur), 100 % ou 200 % (pur)
    let purity = purity_of(&w.buildings[b]);
    // foreuse nomade des Transhumants : deux fois plus vite, moins l'usure du gisement
    let nomad = if w.buildings[b].kind == B_T_DRILL { crate::transhumants::drill_speed(w, b) } else { 1000 };
    let bb = &mut w.buildings[b];
    bb.working = s > 0;
    // niveau d'amélioration : vitesse en % du niveau 0
    let gain = s as u32 * mult * lvl.speed / 100 * purity / 100 * clock_of(bb) / 100;
    bb.progress += if nomad == 1000 { gain } else { (gain as u64 * nomad as u64 / 1000) as u32 };
    if bb.progress >= 30 * RECIPE_SCALE {
        bb.progress -= 30 * RECIPE_SCALE;
        bb.out += 1;
        flow_add(bb, w.tick, 1);
        let it = bb.recipe as usize;
        w.players[owner].produced[it] += 1;
    }
}

/// Plafond des produits en attente d'un fabricant : au-delà, il ne lance plus de fabrication.
#[inline]
pub(super) fn crafter_out_cap(on: u16) -> u16 {
    (on * 3).max(4)
}

pub(super) fn tick_crafter(w: &mut World, b: usize) {
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
    bb.def().speed as u32 * furnace_level(bb).map_or(100, |l| l.speed) / 100 * clock_of(bb) / 100 * crate::ameliorations::module_speed(bb) / 100
}

// ---------- Cadence (surcadençage, sous-cadençage) ----------

/// Puissance électrique demandée par une machine à pleine marche (kW) : niveau et cadence compris, comme
/// ce qu'elle réclame à sa zone (0 : n'en consomme pas ; extracteur sur hydrocarbure : 0).
pub fn power_need(bb: &Building) -> i32 {
    match bb.def().class {
        BClass::Crafter => crafter_power(bb),
        BClass::Extractor if bb.recipe == HYDROCARBON => 0,
        BClass::Extractor => {
            let lvl = &EXTRACTOR_LEVELS[(bb.level as usize).min(EXTRACTOR_LEVELS.len() - 1)];
            (bdef(B_EXTRACTOR).power_use as i64 * lvl.power as i64 / 100 * clock_power(bb) as i64 / 1000) as i32 * crate::ameliorations::module_power(bb) / 100
        }
        _ => bb.def().power_use * crate::ameliorations::module_power(bb) / 100,
    }
}

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
    (bb.def().power_use as i64 * furnace_level(bb).map_or(100, |l| l.power) as i64 / 100 * clock_power(bb) as i64 / 1000) as i32 * crate::ameliorations::module_power(bb) / 100
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
        // gabarits économes (Transhumants) : un cycle sur 5 sans ingrédients
        let free = crate::ameliorations::free_cycle(bb);
        for (j, x) in rec.inputs.iter().enumerate().filter(|_| !free) {
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
        // four à récupération, craquage (Transhumants) : un produit de plus tous les 4 cycles
        let n = rec.output.1 as u16 * if crate::ameliorations::bonus_output(bb) { 2 } else { 1 };
        bb.out += n;
        flow_add(bb, w.tick, n);
        let owner = bb.owner as usize;
        w.players[owner].produced[rec.output.0 as usize] += n as u32;
        wake_watchers(w, b);
    }
}

pub(super) fn tick_lab(w: &mut World, b: usize) {
    let owner = w.buildings[b].owner as usize;
    share_with_twins(w, b);
    if !w.buildings[b].working {
        let t = w.players[owner].research;
        if t == 0 {
            w.buildings[b].wake = w.tick + 20;
            return;
        }
        // Souche : ADN ; Transhumants : relevés ; Industriels : un lot de chaque palier
        let race = w.players[owner].race;
        if race == RACE_SOUCHE {
            if !crate::souche::lab_start(w, b, t) {
                return;
            }
        } else if race == RACE_TRANSH {
            if !crate::transhumants::lab_start(w, b, t) {
                return;
            }
        } else {
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
        }
        let bb = &mut w.buildings[b];
        bb.working = true;
        bb.progress = 0;
        bb.tech = t;
        wake_watchers(w, b);
    }
    let need = power_need(&w.buildings[b]);
    let s = use_power(w, b, need);
    let bb = &mut w.buildings[b];
    bb.progress += s as u32 * crate::ameliorations::module_speed(bb);
    let t = bb.tech;
    let need = TECHS[t as usize].time as u32 * 20 * RECIPE_SCALE;
    if bb.progress >= need {
        bb.working = false;
        flow_add(bb, w.tick, 1);
        let p = &mut w.players[owner];
        if p.research == t && !p.has_tech(t) {
            p.tech_progress[t as usize] += 1;
            if p.tech_progress[t as usize] >= TECHS[t as usize].count {
                p.set_tech(t);
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
