//! Améliorations d'un bâtiment sur place (niveau ou modèle suivant) : `upgrade_spec`, `upgrade`,
//! `tick_upgrade`. Les améliorations des Transhumants sont dans ameliorations.rs.

use super::*;

/// Amélioration possible du bâtiment : (coût, recherche, durée en ticks). Extracteur : niveau suivant
/// (EXTRACTOR_LEVELS) ; assembleur : modèle suivant (ASSEMBLER_UPGRADES) ; couveuse : plus de portées (BROOD_LEVELS).
pub fn upgrade_spec(bb: &Building) -> Option<(&'static [(u8, u16)], u8, u32)> {
    match bb.def().class {
        BClass::Extractor => EXTRACTOR_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Depot if bb.level == 0 => Some((DEPOT_UPGRADE_COST, DEPOT_UPGRADE_TECH, DEPOT_UPGRADE_TIME as u32 * 20)),
        BClass::Power if bb.kind == B_GENERATOR => GENERATOR_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Power if bb.kind == B_MAIN_GENERATOR => MAIN_GENERATOR_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Crafter if bb.kind == B_FURNACE => FURNACE_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Factory if bb.kind == B_BROOD => BROOD_LEVELS.get(bb.level as usize + 1).map(|l| (l.cost, l.tech, l.time as u32 * 20)),
        BClass::Crafter => ASSEMBLER_UPGRADES.iter().find(|u| u.0 == bb.kind).map(|u| (bdef(u.1).cost, bdef(u.1).tech, u.2 as u32 * 20)),
        _ => None,
    }
}

/**
 * Ordre UPGRADE sur l'extracteur ou l'assembleur `b` : lance son amélioration (il doit être terminé, la
 * recherche faite et le coût disponible dans les dépôts proches, payé aussitôt : drones::pay_near ; couveuse :
 * dans son réseau de racines). Le bâtiment ne travaille plus jusqu'à la fin (voir tick_upgrade), sauf le
 * générateur principal et la couveuse. Sur une amélioration en cours, l'ordre l'annule et rembourse (dépôt le
 * plus proche, ou réseau).
 */
pub fn upgrade(w: &mut World, b: usize) -> bool {
    let bb = &w.buildings[b];
    if !bb.alive || !bb.complete() {
        return false;
    }
    let Some((cost, tech, _)) = upgrade_spec(bb) else { return false };
    let owner = bb.owner;
    if bb.upgrade > 0 {
        for &(it, n) in cost {
            crate::drones::refund_at(w, owner, b, it, n as u32);
        }
        w.buildings[b].upgrade = 0;
        w.buildings[b].wake = 0;
        w.power_dirty |= w.buildings[b].def().class == BClass::Power;
        return true;
    }
    let (x, y) = w.buildings[b].center();
    if !w.players[owner as usize].has_tech(tech) {
        return false;
    }
    let paid = if w.buildings[b].def().race == RACE_SOUCHE {
        let net = w.buildings[b].net;
        let dues: Vec<(u8, i32)> = cost.iter().map(|&(it, n)| (it, n as i32)).collect();
        net != 0 && crate::souche::take_all(w, owner, net, &dues)
    } else {
        crate::drones::pay_near(w, owner, x, y, cost)
    };
    if !paid {
        return false;
    }
    w.buildings[b].upgrade = 1;
    w.buildings[b].wake = 0;
    // un générateur n'est pas dans la liste des bâtiments actifs : il y entre pour son chantier
    if let Err(p) = w.active.binary_search(&(b as u32)) {
        w.active.insert(p, b as u32);
    }
    // générateur : sans production pendant le chantier
    w.power_dirty |= w.buildings[b].def().class == BClass::Power;
    true
}

/// Amélioration en cours : le chantier avance d'un tick ; à la fin, l'extracteur passe au niveau suivant,
/// l'assembleur devient le modèle suivant (points de vie à la même proportion).
pub(super) fn tick_upgrade(w: &mut World, b: usize) {
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
        BClass::Crafter if bb.kind == B_FURNACE => bb.level += 1,
        BClass::Factory => bb.level += 1,
        BClass::Power => {
            bb.level += 1;
            w.power_dirty = true;
        }
        BClass::Depot => {
            // dépôt plus grand : son plafond passe à DEPOT_CAP[1]
            bb.level += 1;
        }
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
