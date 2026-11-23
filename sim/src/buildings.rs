//! Bâtiments : pose, construction, production, bras, laboratoires, usines, réseau électrique.
//! Un bâtiment qui attend un ingrédient ou de la place est mis en sommeil (champ `wake`)
//! et réveillé par l'événement qu'il attend.
//!
//! Ce fichier est la façade : la boucle `update_buildings`, le sommeil et le réveil, la pause. Le reste est
//! rangé par thème dans `buildings/`, et tout ce qui est public est ré-exporté ici : `crate::buildings::xxx`.
//! - `pose` : pose, remplacement des tapis, fantômes à reconstruire, fin de chantier, retrait ;
//! - `energie` : combustible, générateurs, zones électriques, tick du réseau ;
//! - `sorties` : sorties d'un bâtiment (bras, tapis de sortie, voisins collés), tour de rôle, bras ;
//! - `jumelles` : machines jumelles (partage des ingrédients, des produits, du combustible) ;
//! - `objets` : ce qu'un bâtiment accepte, reçoit et rend ; tapis de contrôle ;
//! - `debits` : débits mesurés et débit maximal ;
//! - `depot` : dépôts et collecteurs ;
//! - `production` : extracteur, fabricants, laboratoire, cadence ;
//! - `usine` : usines d'unités ;
//! - `niveaux` : améliorations sur place ;
//! - `speciaux` : bouclier, munitions, porte de transit.
//!
//! Chaque module commence par `use super::*;` : il voit les imports ci-dessous et les éléments des autres
//! modules (ceux qui servent hors de leur module sont `pub(super)`).

use crate::belts::{self, DIRS};
use crate::data::*;
use crate::fixed::TILE;
use crate::map::P_LAND;
use crate::world::*;

mod debits;
mod depot;
mod energie;
mod jumelles;
mod niveaux;
mod objets;
mod pose;
mod production;
mod sorties;
mod speciaux;
mod usine;

pub use self::debits::*;
pub use self::depot::*;
pub use self::energie::*;
pub use self::jumelles::*;
pub use self::niveaux::*;
pub use self::objets::*;
pub use self::pose::*;
pub use self::production::*;
pub use self::sorties::*;
use self::speciaux::*;
pub use self::usine::*;

const SLEEP: u32 = 60;
pub const RECIPE_SCALE: u32 = 100 * 1024;

/// Bâtiments qu'on peut mettre en pause (ordre `O_SET_PAUSE`) : extracteurs, fabricants et usines d'unités.
#[inline]
pub fn pausable(bb: &Building) -> bool {
    matches!(bb.def().class, BClass::Extractor | BClass::Crafter | BClass::Factory)
}

/// Bâtiment mis en pause par son joueur : `enabled` faux sur un bâtiment de production. Il ne travaille
/// plus (ni énergie, ni entrées, ni production, ni partage entre jumelles) et garde tout son contenu,
/// cycle en cours compris ; il reprend là où il en était.
#[inline]
pub fn paused(bb: &Building) -> bool {
    !bb.enabled && pausable(bb)
}

#[inline]
pub fn wake_watchers(w: &mut World, b: usize) {
    let ws = std::mem::take(&mut w.buildings[b].watchers);
    for i in ws {
        if let Some(x) = w.buildings.get_mut(i as usize) {
            x.wake = 0;
        }
    }
}

fn watch(w: &mut World, target: usize, me: usize) {
    let v = &mut w.buildings[target].watchers;
    if !v.contains(&(me as u32)) && v.len() < 16 {
        v.push(me as u32);
    }
}

// ---------- Mise à jour ----------
pub fn update_buildings(w: &mut World) {
    let mut i = 0;
    while i < w.active.len() {
        let b = w.active[i] as usize;
        i += 1;
        let bb = &w.buildings[b];
        if !bb.alive || w.tick < bb.wake {
            continue;
        }
        if !bb.complete() {
            // Souche : l'organe pousse seul
            if bb.def().race == RACE_SOUCHE {
                crate::souche::grow(w, b);
            }
            continue;
        }
        if bb.stun > 0 {
            w.buildings[b].stun -= 1;
            continue;
        }
        if bb.mod_job != 0 {
            // module des Transhumants : amélioration en cours d'installation, il ne travaille pas (la soute et le
            // générateur restent en service)
            let kind = bb.kind;
            crate::ameliorations::tick_job(w, crate::ameliorations::Host::B(b));
            if w.tick.is_multiple_of(DEPOT_FEED_PERIOD) {
                match kind {
                    B_T_HOLD => crate::transhumants::feed_crafters(w, b),
                    B_T_GENERATOR => tick_generator(w, b),
                    _ => {}
                }
            }
            w.buildings[b].wake = 0;
            continue;
        }
        if bb.upgrade > 0 {
            // amélioration en cours : le bâtiment ne travaille pas (sa production en cours attend) ; le
            // générateur principal, resté en service, garde l'apport de son dépôt collé (sans partage)
            let main = bb.kind == B_MAIN_GENERATOR;
            tick_upgrade(w, b);
            if main && w.buildings[b].upgrade > 0 && w.tick.is_multiple_of(DEPOT_FEED_PERIOD) {
                feed_generator_from_depot(w, b);
            }
            continue;
        }
        if paused(bb) {
            // en pause : endormi jusqu'à la reprise (l'ordre le réveille)
            w.buildings[b].wake = u32::MAX;
            continue;
        }
        match bb.def().class {
            BClass::Extractor => tick_extractor(w, b),
            // soute des Transhumants : elle alimente les fabricants collés (pas de sorties filtrées)
            BClass::Depot if bb.kind == B_T_HOLD => {
                w.buildings[b].wake = w.tick + DEPOT_FEED_PERIOD;
                crate::transhumants::feed_crafters(w, b);
            }
            BClass::Depot => tick_depot(w, b),
            BClass::Organ => crate::souche::tick_organ(w, b),
            // racine, rhizome et ronce de la Souche (les relais et les murs des Industriels n'ont pas de tick)
            BClass::Pylon | BClass::Wall => crate::souche::tick_root(w, b),
            BClass::Belt if bb.def().collect => tick_collector(w, b),
            BClass::Inserter => tick_inserter(w, b),
            BClass::Crafter => tick_crafter(w, b),
            BClass::Lab => tick_lab(w, b),
            BClass::Factory => tick_factory(w, b),
            BClass::Turret => {
                let need = bb.def().power_use;
                let ok = need == 0 || use_power(w, b, need) > 512;
                if ok {
                    crate::combat::building_weapon(w, b);
                }
            }
            // nid de la faune : il crache sur les avions et les navires
            BClass::Nest => crate::combat::building_weapon(w, b),
            BClass::Shield => tick_shield(w, b),
            BClass::Silo => tick_ammo_builder(w, b, MISSILE_COST, 1, 1200),
            BClass::AntiMissile => {
                tick_ammo_builder(w, b, INTERCEPTOR_COST, 3, 400);
                crate::combat::antimissile(w, b);
            }
            // générateur : alimenté par un dépôt collé (et amélioration, voir upgrade)
            BClass::Power => tick_generator(w, b),
            BClass::Orbital => {
                let need = bdef(B_ORBITAL).power_use;
                let s = use_power(w, b, need);
                let bb = &mut w.buildings[b];
                bb.charge = (bb.charge + s as u32).min(60 * 20 * 1024);
                bb.working = s > 0;
            }
            BClass::Gate => tick_gate(w, b),
            BClass::Station | BClass::CargoPad => crate::logistics::tick_station(w, b),
            BClass::Router => tick_router(w, b),
            BClass::Portal => crate::logistics::tick_portal(w, b),
            BClass::Roboport => crate::logistics::tick_roboport(w, b),
            BClass::Transfer | BClass::Radar | BClass::Beacon => {
                let need = bb.def().power_use;
                let s = use_power(w, b, need);
                let bb = &mut w.buildings[b];
                bb.working = s >= 512;
                if bb.cooldown > 0 {
                    bb.cooldown -= 1;
                }
                // anneaux de transport : la séquence monte, puis l'échange a lieu ; en relance automatique
                // (démonstration : `repeat`, partenaire dans `target`), une nouvelle séquence part dès la recharge finie
                if bb.def().class == BClass::Transfer && bb.repeat && bb.charge == 0 && bb.cooldown == 0 && bb.working {
                    let partner = bb.target;
                    if let Some(t) = w.building(partner) {
                        if w.buildings[t].charge == 0 {
                            w.buildings[t].charge = crate::logistics::RINGS_TIME;
                            let bb = &mut w.buildings[b];
                            bb.charge = crate::logistics::RINGS_TIME;
                            bb.link = partner;
                        }
                    }
                }
                let bb = &mut w.buildings[b];
                if bb.charge > 0 {
                    bb.charge -= 1;
                    if bb.charge == 0 && bb.link != NONE {
                        crate::logistics::rings_exchange(w, b);
                    }
                }
            }
            _ => {}
        }
    }
}
