//! Améliorations des Transhumants (voir docs/spec/races.md, « Améliorations »).
//!
//! - Une amélioration (`MODS`) s'installe sur une unité ou un module précis, depuis sa fiche (ordre
//!   `O_MOD_INSTALL`) : l'Arche a cinq emplacements (`ARK_SLOTS`), une unité de combat trois (arme, châssis,
//!   équipement), un chenillard (et son module déployé) deux (rendement, spécialité), un chariot de convoi un. Un
//!   emplacement ne garde qu'une amélioration : les branches s'excluent. Un palier demande le palier précédent et le
//!   remplace. La table est dans ameliorations/table.rs.
//! - Coût payé tout de suite : composants pris dans les réserves à portée (soute de l'Arche, dépôts et soutes,
//!   chenillards soutes repliés), relevés dans la bourse du joueur. L'ordre `O_MOD_CANCEL` annule et rembourse
//!   tout. Une amélioration remplacée par une autre branche rend la moitié de ses composants.
//! - État : `UnitCold::mods` et `Building::mods`, un octet par emplacement (indice dans MODS, 0 : rien) ;
//!   `mod_job` (amélioration en cours d'installation) et `mod_left` (ticks restants). Ils suivent le module à
//!   son repli et à son déploiement.
//! - Arche : tourelles déployables, atelier embarqué, surcharge, groupe électrogène (`Ark`, un par Arche, dans
//!   `World::arks`). Ses améliorations de pont et de soutien sont portées par des remorques (convoi.rs).
//! - Gabarits d'équipement des unités (gabarits.rs).

mod table;
pub use table::*;

use crate::buildings;
use crate::data::*;
use crate::drones::Store;
use crate::fixed::{dist, dist2, TILE};
use crate::world::*;

// ---------- lecture ----------

/// Amélioration installée dans un emplacement (0 : rien).
#[inline]
pub fn at(mods: u64, slot: u8) -> u8 {
    (mods >> (8 * (slot as u32 & 7))) as u8
}

#[inline]
fn set(mods: u64, slot: u8, v: u8) -> u64 {
    let sh = 8 * (slot as u32 & 7);
    (mods & !(0xffu64 << sh)) | (v as u64) << sh
}

/// L'amélioration `id` est-elle installée ?
#[inline]
pub fn has(mods: u64, id: u8) -> bool {
    mods != 0 && at(mods, MODS[id as usize].slot) == id
}

/// Même branche, à ce palier ou plus haut.
pub fn has_rank(mods: u64, id: u8) -> bool {
    let mut k = at(mods, MODS[id as usize].slot);
    while k != 0 {
        if k == id {
            return true;
        }
        k = MODS[k as usize].base;
    }
    false
}

/// Améliorations installées d'une unité ordinaire (au plus trois emplacements).
#[inline]
fn fitted(mods: u64) -> impl Iterator<Item = &'static ModDef> {
    (0..3u8).map(move |k| at(mods, k)).filter(|&m| m != 0).map(|m| &MODS[m as usize])
}

/// Rayon de l'Arche (1/256 de case) : sa coque s'allonge d'un tronçon par emplacement équipé d'armement, de coque ou
/// de mobilité.
pub const ARK_RADII: [i32; 4] = [360, 395, 430, 465];
pub fn ark_radius(mods: u64) -> i32 {
    ARK_RADII[[SLOT_ARM, SLOT_HULL, SLOT_DRIVE].iter().filter(|&&k| at(mods, k) != 0).count()]
}

/// Rayon de l'unité `s` : celui de son type, sauf l'Arche, qui grandit avec ses améliorations.
#[inline]
pub fn radius(units: &Units, s: usize) -> i32 {
    let k = units.kind[s];
    if k == U_ARK {
        ark_radius(units.cold[s].mods)
    } else {
        udef(k).radius
    }
}

/// Ce type d'unité (ou de chenillard) a-t-il des améliorations ?
pub fn host_has_mods(host: u16) -> bool {
    host != NO_KIND && MODS.iter().any(|d| d.host == host)
}

/// Tourelles déployables d'une Arche (0, 1, 3 ou 9).
pub fn turret_count(mods: u64) -> usize {
    match at(mods, SLOT_DECK) {
        M_TURRETS1 => 1,
        M_TURRETS2 => 3,
        M_TURRETS3 => 9,
        _ => 0,
    }
}

/// Tourelle déployée par une Arche.
#[inline]
pub fn is_turret(kind: u16) -> bool {
    matches!(kind, U_TUR_GUN | U_TUR_AA | U_TUR_MORTAR)
}

/// Remorque ou tourelle d'une Arche : elle n'obéit qu'à l'Arche.
#[inline]
pub fn is_ark_part(kind: u16) -> bool {
    matches!(kind, U_TUR_GUN | U_TUR_AA | U_TUR_MORTAR | U_ARK_CAR)
}

// ---------- effets sur les unités ----------

/// Armes de l'unité `s`, améliorations comprises (au plus deux), et leur nombre.
#[inline]
pub fn weapons_of(w: &World, s: usize) -> ([u8; 2], usize) {
    let def = udef(w.units.kind[s]);
    let mut n = def.weapons.len().min(2);
    let mut v = [0u8; 2];
    v[..n].copy_from_slice(&def.weapons[..n]);
    let mods = w.units.cold[s].mods;
    if mods != 0 {
        if let Some((k, wi)) = mod_weapon(w.units.kind[s], at(mods, 0)) {
            // (une arme de plus : lance-flammes de proue du bélier)
            v[k] = wi;
            n = n.max(k + 1);
        }
    }
    (v, n)
}

/// Arme donnée par l'amélioration `m` à une unité `kind` : (rang de l'arme remplacée, arme).
pub fn mod_weapon(kind: u16, m: u8) -> Option<(usize, u8)> {
    Some(match (kind, m) {
        (U_ARK, M_W_SIEGE) => (0, W_SIEGE),
        (U_ARK, M_W_FLAME) => (0, W_FLAME),
        (U_ARK, M_W_ROCKETS) => (0, W_ROCKETS),
        (U_ARK, M_W_RAIL) => (0, W_RAIL),
        (U_ARK, M_W_FLAK) => (1, W_FLAK),
        (U_RIDER, M_RIDER_TWIN) => (0, W_RIDER_TWIN),
        (U_HARROW, M_HARROW_LONG) => (0, W_HARROW_LONG),
        (U_HARROW, M_HARROW_MIXED) => (0, W_HARROW_MIXED),
        (U_TOWED_GUN, M_GUN_LONG) => (0, W_GUN_LONG),
        (U_TOWED_GUN, M_GUN_CLUSTER) => (0, W_GUN_CLUSTER),
        (U_TOWED_GUN, M_GUN_FAST) => (0, W_GUN_FAST),
        (U_TRACKER, M_TRACKER_GUN) => (0, W_TRACKER_GUN),
        (U_TRACKER, M_TRACKER_ROCKET) => (0, W_TRACKER_ROCKET),
        (U_RIDER, M_RIDER_LONG) => (0, W_RIDER_LONG),
        (U_RIDER, M_RIDER_FLAME) => (0, W_RIDER_FLAME),
        (U_HARROW, M_HARROW_MISSILE) => (0, W_HARROW_MISSILE),
        (U_RAM, M_RAM_SAW) => (0, W_RAM_SAW),
        (U_RAM, M_RAM_FLAME) => (1, W_RAM_FLAME),
        _ => return None,
    })
}

/// Portée (cases) à laquelle l'unité `s` s'approche pour attaquer `target` (une unité, un bâtiment, ou NONE : le
/// sol). Transhumants : la plus grande des armes qui peuvent viser cette cible ; autres races : de toutes.
pub fn attack_range(w: &World, s: usize, target: u32) -> i32 {
    let kind = w.units.kind[s];
    if udef(kind).race != RACE_TRANSH {
        return crate::units::max_range(kind);
    }
    let air = w.unit(target).is_some_and(|t| udef(w.units.kind[t]).layer == Layer::Air);
    let want = if air { M_AIR } else { M_SURF };
    let (v, n) = weapons_of(w, s);
    let best = v[..n].iter().map(|&wi| &WEAPONS[wi as usize]).filter(|d| d.mask & want != 0).map(|d| d.range).max();
    best.unwrap_or_else(|| crate::units::max_range(kind))
}

/// Vitesse de l'unité `s` (sous-unités par tick), améliorations et surcharge comprises.
#[inline]
pub fn speed(w: &World, s: usize) -> i32 {
    let base = unit_speed(w.units.kind[s]);
    let mods = w.units.cold[s].mods;
    if mods == 0 {
        return base;
    }
    let pct = match w.units.kind[s] {
        U_ARK => {
            let drive = match at(mods, SLOT_DRIVE) {
                M_ENGINE1 => 125,
                M_ENGINE2 => 160,
                M_BOOST if boosted(w, s) => 160,
                _ => 100,
            };
            let weight = match at(mods, SLOT_HULL) {
                M_PLATE1 => 5,
                M_PLATE2 => 10,
                _ => 0,
            };
            drive - weight
        }
        // (chenillard soute : au-delà du deuxième octet, les équipements de ses chariots)
        U_CH_HOLD => 100,
        _ => 100 + fitted(mods).map(|d| d.speed as i32).sum::<i32>(),
    };
    base * pct.max(10) / 100
}

/// Dégâts subis par l'unité `s`, améliorations comprises (`World::hit_weapon` : arme du coup).
pub fn unit_armor(w: &World, s: usize, dmg: i32) -> i32 {
    let mods = w.units.cold[s].mods;
    if mods == 0 {
        return dmg;
    }
    let pct = match w.units.kind[s] {
        U_ARK => match at(mods, SLOT_HULL) {
            M_PLATE1 => 85,
            M_PLATE2 => 70,
            M_REACTIVE if WEAPONS.get(w.hit_weapon as usize).is_some_and(|d| matches!(d.proj, Proj::Shell | Proj::Missile | Proj::Bomb | Proj::Fire)) => 50,
            _ => 100,
        },
        U_CH_HOLD if has(mods, M_HOLD_ARMOR) => 50,
        U_CH_HOLD => 100,
        _ => (100 - fitted(mods).map(|d| d.armor as i64).sum::<i64>()).max(10),
    };
    if pct == 100 {
        dmg
    } else {
        (dmg as i64 * pct / 100) as i32
    }
}

/// Bouclier de l'unité `s` : (rayon en cases, points) ; (0, 0) : aucun.
#[inline]
pub fn unit_shield(w: &World, s: usize) -> (i32, i32) {
    if w.units.kind[s] == U_ARK {
        return match at(w.units.cold[s].mods, SLOT_HULL) {
            M_SHIELD1 => (6, 2500),
            M_SHIELD2 => (8, 5000),
            M_SHIELD3 => (11, 9000),
            _ => (0, 0),
        };
    }
    let mods = w.units.cold[s].mods;
    if mods != 0 && w.units.kind[s] != U_CH_HOLD {
        if let Some(d) = fitted(mods).find(|d| d.shield.1 > 0) {
            return d.shield;
        }
    }
    let d = udef(w.units.kind[s]);
    (d.shield_r, d.shield_hp)
}

/// Rayon du radar de l'unité `s` (cases).
#[inline]
pub fn unit_radar(w: &World, s: usize) -> i32 {
    let base = udef(w.units.kind[s]).radar;
    let mods = w.units.cold[s].mods;
    match w.units.kind[s] {
        _ if mods == 0 => base,
        U_ARK if has(mods, M_RADAR) && crate::convoi::in_service(w, s, SLOT_SUPPORT) => ARK_RADAR,
        U_ARK | U_CH_HOLD => base,
        _ => fitted(mods).map(|d| d.radar as i32).fold(base, i32::max),
    }
}

/// Rayon de vision de l'unité `s` (cases).
#[inline]
pub fn unit_vision(w: &World, s: usize) -> i32 {
    let v = udef(w.units.kind[s]).vision;
    let mods = w.units.cold[s].mods;
    match w.units.kind[s] {
        _ if mods == 0 => v,
        U_ARK if has(mods, M_RADAR) && crate::convoi::in_service(w, s, SLOT_SUPPORT) => v.max(40),
        U_ARK | U_CH_HOLD => v,
        _ => fitted(mods).map(|d| d.vision as i32).fold(v, i32::max),
    }
}

/// L'unité `s` porte un filet de camouflage.
#[inline]
pub fn has_net(w: &World, s: usize) -> bool {
    net_kind(w.units.kind[s]) && fitted(w.units.cold[s].mods).any(|d| d.cloak)
}

/// Types d'unités qui peuvent porter un filet de camouflage (lu pour chaque cible possible de chaque tir : le type
/// écarte presque tout le monde sans lire l'état froid de l'unité).
#[inline]
pub fn net_kind(kind: u16) -> bool {
    matches!(kind, U_TRACKER | U_TOWED_GUN)
}

/// Unité cachée sous son filet : à l'arrêt depuis NET_REST ticks, et elle n'a pas tiré (`UnitCold::reveal`).
#[inline]
pub fn hidden(w: &World, s: usize) -> bool {
    net_kind(w.units.kind[s]) && w.units.cold[s].mods != 0 && w.units.cold[s].reveal == 0 && has_net(w, s)
}

/// Ticks à l'arrêt avant de se fondre sous un filet de camouflage ; après un tir.
pub const NET_REST: u16 = 60;
pub const NET_FIRED: u16 = 100;

/// Chaque tick, après son déplacement, unité qui porte des améliorations : filet de camouflage, points de vie regagnés.
pub fn tick_unit(w: &mut World, s: usize) {
    if matches!(w.units.kind[s], U_ARK | U_CH_HOLD | U_T_CART) {
        return;
    }
    if has_net(w, s) {
        let moving = w.units.x[s] != w.units.px[s] || w.units.y[s] != w.units.py[s];
        let c = &mut w.units.cold[s];
        c.reveal = if moving { c.reveal.max(NET_REST) } else { c.reveal.saturating_sub(1) };
    }
    if w.tick.is_multiple_of(20) {
        let k: i64 = fitted(w.units.cold[s].mods).map(|d| d.regen as i64).sum();
        let max = w.max_hp(s);
        if k > 0 && w.units.hp[s] < max {
            w.units.hp[s] = (w.units.hp[s] + ((max as i64 * k / 1000) as i32).max(1)).min(max);
        }
    }
}

/// Déploiement, repli ou mise en batterie deux fois plus rapides.
#[inline]
pub fn quick(mods: u64) -> bool {
    mods != 0 && (0..2u8).any(|k| at(mods, k) != 0 && MODS[at(mods, k) as usize].quick)
}

/// Rayon (cases) de la bulle de brouillage de l'unité `s` (0 : aucune).
#[inline]
pub fn unit_jam(w: &World, s: usize) -> i32 {
    match w.units.kind[s] {
        U_JAMMER => JAM_RADIUS,
        U_ARK if has(w.units.cold[s].mods, M_JAMMER) && crate::convoi::in_service(w, s, SLOT_SUPPORT) => 16,
        _ => 0,
    }
}

/// Plafond par objet de la soute d'un commandant (elle compte comme un dépôt).
pub fn store_cap(w: &World, s: usize) -> u16 {
    if w.units.kind[s] == U_ARK && has(w.units.cold[s].mods, M_HOLDS) && crate::convoi::in_service(w, s, SLOT_DECK) {
        2000
    } else {
        crate::drones::COMMANDER_CAP
    }
}

/// Cale d'un chariot de convoi.
pub fn cart_cap(w: &World, s: usize) -> u32 {
    if has(w.units.cold[s].mods, M_CART_BIG) {
        40
    } else {
        udef(U_T_CART).hold as u32
    }
}

/// Butin (% du coût) du joueur `p` : LOOT_PCT, 40 % avec les grues de pillage de son Arche ; plus pour une unité
/// équipée (grappins du bélier, filets du cavalier ; `killer` : unité qui pille).
pub fn loot_pct(w: &World, p: u8, killer: usize) -> u32 {
    let ark = w.arks.iter().any(|a| w.unit(a.unit).is_some_and(|s| w.units.owner[s] == p && has(w.units.cold[s].mods, M_LOOT) && crate::convoi::in_service(w, s, SLOT_SUPPORT)));
    let base = if ark { 40 } else { crate::transhumants::LOOT_PCT };
    let more: u32 = match w.units.kind[killer] {
        U_ARK | U_CH_HOLD => 0,
        _ => fitted(w.units.cold[killer].mods).map(|d| d.loot as u32).sum(),
    };
    base * (100 + more) / 100
}

/// Surcharge de l'Arche `s` en cours ?
pub fn boosted(w: &World, s: usize) -> bool {
    let id = w.unit_id(s);
    w.arks.iter().any(|a| a.unit == id && w.tick < a.boost_until)
}

// ---------- effets sur les modules ----------

/// Amélioration de rendement du module (0 : aucune).
#[inline]
pub fn fit(bb: &Building) -> u8 {
    bb.mods as u8
}

/// Spécialité du module (0 : aucune).
#[inline]
pub fn spec(bb: &Building) -> u8 {
    at(bb.mods, SLOT_SPEC)
}

/// Vitesse du module (%) : extraction, fabrication, recherche, production d'unités.
#[inline]
pub fn module_speed(bb: &Building) -> u32 {
    match fit(bb) {
        M_DRILL_FAST | M_FURNACE_FAST | M_REF_FAST => 160,
        M_DRILL_CLEAN => 90,
        M_ASM_FAST | M_LAB_FAST | M_SHOP_FAST => 150,
        _ => 100,
    }
}

/// Consommation du module (%).
#[inline]
pub fn module_power(bb: &Building) -> i32 {
    let pct = match fit(bb) {
        M_FURNACE_FAST | M_REF_FAST => 160,
        M_DRILL_FAST | M_ASM_FAST | M_LAB_FAST | M_SHOP_FAST => 150,
        _ => 100,
    };
    if matches!(spec(bb), M_FURNACE_LEAN | M_ASM_LEAN | M_REF_LEAN) {
        pct / 2
    } else {
        pct
    }
}

/// Fin d'un cycle d'un fabricant : produit en plus (four à récupération, craquage : un cycle sur 4) ?
pub fn bonus_output(bb: &mut Building) -> bool {
    if !matches!(fit(bb), M_FURNACE_YIELD | M_REF_CRACK) {
        return false;
    }
    bb.mod_n += 1;
    if bb.mod_n >= 4 {
        bb.mod_n = 0;
        return true;
    }
    false
}

/// Début d'un cycle d'un assembleur : sans consommer d'ingrédients (gabarits économes : un cycle sur 5) ?
pub fn free_cycle(bb: &mut Building) -> bool {
    if fit(bb) != M_ASM_THRIFT {
        return false;
    }
    bb.mod_n += 1;
    if bb.mod_n >= 5 {
        bb.mod_n = 0;
        return true;
    }
    false
}

/// Dégâts subis par un module (soute blindée, spécialités blindées).
#[inline]
pub fn building_armor(bb: &Building, dmg: i32) -> i32 {
    if bb.mods == 0 {
        return dmg;
    }
    if fit(bb) == M_HOLD_ARMOR {
        return dmg / 2;
    }
    (dmg as i64 * (100 - MODS[spec(bb) as usize].armor as i64) / 100) as i32
}

/// Radar d'un module (cases ; 0 : celui de son type).
#[inline]
pub fn building_radar(bb: &Building) -> i32 {
    if spec(bb) == M_LAB_ANTENNA {
        LAB_RADAR
    } else {
        0
    }
}

/// Réservoir d'un générateur : multiple de celui de son type.
#[inline]
pub fn tank_mult(bb: &Building) -> i32 {
    if spec(bb) == M_GEN_TANK {
        3
    } else {
        1
    }
}

/// Poteaux relais d'un générateur nomade, au plus.
pub fn poles_max(bb: &Building) -> usize {
    if spec(bb) == M_GEN_POLES {
        16
    } else {
        crate::transhumants::POLES_PER_GEN
    }
}

/// Usure (‰) qui compte pour le débit d'une foreuse nomade.
pub fn wear_felt(bb: &Building, wear: u32) -> u32 {
    if spec(bb) == M_DRILL_DEEP {
        wear.min(300)
    } else {
        wear.min(1000)
    }
}

/// Bouclier d'un bâtiment : (rayon en cases, points).
#[inline]
pub fn building_shield(bb: &Building) -> (i32, i32) {
    if fit(bb) == M_BASTION_SHIELD {
        (6, 1500)
    } else {
        (bb.def().shield_r, bb.def().shield_hp)
    }
}

/// Arme d'un bâtiment (canon long du bastion, affût antiaérien).
#[inline]
pub fn building_weapon(bb: &Building) -> i8 {
    if bb.mods == 0 {
        return bb.def().weapon;
    }
    match (fit(bb) == M_BASTION_LONG, spec(bb) == M_BASTION_FLAK) {
        (true, true) => W_BASTION_LONG_DUAL as i8,
        (true, false) => W_BASTION_LONG as i8,
        (false, true) => W_BASTION_DUAL as i8,
        _ => bb.def().weapon,
    }
}

// ---------- installation ----------

/// Porteur d'améliorations : une unité, ou un module déployé.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Host {
    U(usize),
    B(usize),
}

impl Host {
    /// Porteur désigné par une référence (identifiant d'unité ou référence de bâtiment), s'il est à `p`.
    pub fn resolve(w: &World, p: u8, r: u32) -> Option<Host> {
        if let Some(b) = w.building(r) {
            let bb = &w.buildings[b];
            return (bb.owner == p && bb.complete() && bb.def().race == RACE_TRANSH).then_some(Host::B(b));
        }
        w.unit(r).filter(|&s| w.units.owner[s] == p).map(Host::U)
    }
    /// Type d'unité du porteur (pour un module : son chenillard).
    pub fn kind(self, w: &World) -> u16 {
        match self {
            Host::U(s) => w.units.kind[s],
            Host::B(b) => crate::transhumants::chenillard_of(w.buildings[b].kind),
        }
    }
    pub fn owner(self, w: &World) -> u8 {
        match self {
            Host::U(s) => w.units.owner[s],
            Host::B(b) => w.buildings[b].owner,
        }
    }
    pub fn pos(self, w: &World) -> (i32, i32) {
        match self {
            Host::U(s) => (w.units.x[s], w.units.y[s]),
            Host::B(b) => w.buildings[b].center(),
        }
    }
    pub fn mods(self, w: &World) -> u64 {
        match self {
            Host::U(s) => w.units.cold[s].mods,
            Host::B(b) => w.buildings[b].mods,
        }
    }
    /// Installation en cours : (amélioration, ticks restants) ; (0, 0) : aucune.
    pub fn job(self, w: &World) -> (u8, u16) {
        match self {
            Host::U(s) => (w.units.cold[s].mod_job, w.units.cold[s].mod_left),
            Host::B(b) => (w.buildings[b].mod_job, w.buildings[b].mod_left),
        }
    }
    fn set_job(self, w: &mut World, job: u8, left: u16) {
        match self {
            Host::U(s) => {
                w.units.cold[s].mod_job = job;
                w.units.cold[s].mod_left = left;
            }
            Host::B(b) => {
                w.buildings[b].mod_job = job;
                w.buildings[b].mod_left = left;
                w.buildings[b].wake = 0;
            }
        }
    }
}

/// Réserves où se paie une amélioration au point (x, y) : celles des paiements immédiats (dépôts, soutes, soute
/// de l'Arche) et les chenillards soutes repliés à moins de NEAR_SUPPLY cases, la plus proche d'abord.
fn sources(w: &World, p: u8, x: i32, y: i32) -> Vec<(i64, Store)> {
    let mut v = crate::drones::supply_stores(w, p, x, y, NEAR_SUPPLY * TILE, RELAY_RANGE * TILE);
    let r2 = (NEAR_SUPPLY * TILE) as i64 * (NEAR_SUPPLY * TILE) as i64;
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && w.units.owner[s] == p && w.units.kind[s] == U_CH_HOLD && w.units.cold[s].carried_by == NONE {
            let d = dist2(x, y, w.units.x[s], w.units.y[s]);
            if d <= r2 {
                v.push((d, Store::U(s)));
            }
        }
    }
    v.sort_unstable();
    v
}

/// Paie `cost` au point (x, y) ; faux, sans rien prendre, si les réserves à portée ne couvrent pas tout.
pub(crate) fn pay(w: &mut World, p: u8, x: i32, y: i32, cost: &[(u8, u16)]) -> bool {
    let src = sources(w, p, x, y);
    if !cost.iter().all(|&(it, n)| src.iter().map(|&(_, st)| st.has(w, it) as u32).sum::<u32>() >= n as u32) {
        return false;
    }
    for &(it, n) in cost {
        let mut left = n;
        for &(_, st) in &src {
            left -= st.take(w, it, left);
        }
        w.players[p as usize].consumed[it as usize] += n as u32;
    }
    true
}

/// Durée d'une installation (ticks) pour le joueur `p`.
pub fn install_ticks(w: &World, p: u8, id: u8) -> u16 {
    let mult = w.players.get(p as usize).map_or(100, |pl| pl.build_mult).max(1) as u32;
    (MODS[id as usize].time as u32 * 2000 / mult).clamp(1, u16::MAX as u32) as u16
}

/// Pourquoi l'amélioration `id` ne peut pas s'installer sur `h`, hors paiement : 0 elle le peut, 1 autre type
/// de porteur, 2 recherche manquante, 3 palier précédent manquant, 4 déjà installée (ou palier plus haut), 5 une
/// installation est déjà en cours.
pub fn blocked(w: &World, h: Host, id: u8) -> u8 {
    let Some(d) = MODS.get(id as usize).filter(|_| id != 0) else { return 1 };
    if h.kind(w) != d.host {
        return 1;
    }
    let mods = h.mods(w);
    if has_rank(mods, id) {
        return 4;
    }
    if !w.players.get(h.owner(w) as usize).is_some_and(|pl| pl.has_tech(d.tech)) {
        return 2;
    }
    if d.base != 0 && at(mods, d.slot) != d.base {
        return 3;
    }
    if h.job(w).0 != 0 {
        return 5;
    }
    0
}

/// Ordre « installer l'amélioration `id` » sur `h` : payée tout de suite.
pub fn install(w: &mut World, h: Host, id: u8) -> bool {
    if blocked(w, h, id) != 0 {
        return false;
    }
    let d = &MODS[id as usize];
    let p = h.owner(w);
    let (x, y) = h.pos(w);
    if w.players[p as usize].purse[RELEVES as usize] < d.releves as i32 || !pay(w, p, x, y, d.cost) {
        return false;
    }
    w.players[p as usize].purse[RELEVES as usize] -= d.releves as i32;
    w.players[p as usize].consumed[RELEVES as usize] += d.releves as u32;
    let t = install_ticks(w, p, id);
    h.set_job(w, id, t);
    true
}

/// Ordre « annuler l'installation » : composants et relevés rendus en entier.
pub fn cancel(w: &mut World, h: Host) -> bool {
    let (id, _) = h.job(w);
    if id == 0 {
        return false;
    }
    let d = &MODS[id as usize];
    let p = h.owner(w);
    let (x, y) = h.pos(w);
    h.set_job(w, 0, 0);
    for &(it, n) in d.cost {
        crate::drones::refund(w, p, x, y, it, n as u32);
    }
    w.players[p as usize].purse[RELEVES as usize] += d.releves as i32;
    true
}

/// Un tick d'installation sur `h` (il en a une en cours).
pub fn tick_job(w: &mut World, h: Host) {
    let (id, left) = h.job(w);
    if left > 1 {
        match h {
            Host::U(s) => w.units.cold[s].mod_left = left - 1,
            Host::B(b) => w.buildings[b].mod_left = left - 1,
        }
        return;
    }
    h.set_job(w, 0, 0);
    let d = &MODS[id as usize];
    let p = h.owner(w);
    let (x, y) = h.pos(w);
    // branche remplacée : la moitié des composants de ses paliers est rendue
    let old = at(h.mods(w), d.slot);
    if old != d.base {
        let mut k = old;
        while k != 0 {
            for &(it, n) in MODS[k as usize].cost {
                crate::drones::refund(w, p, x, y, it, n as u32 / 2);
            }
            k = MODS[k as usize].base;
        }
    }
    let mods = set(h.mods(w), d.slot, id);
    match h {
        Host::U(s) => w.units.cold[s].mods = mods,
        Host::B(b) => {
            w.buildings[b].mods = mods;
            w.buildings[b].mod_n = 0;
        }
    }
    applied(w, h);
    w.ev(EV_MOD_DONE, p as i32, id as i32, x, y);
}

/// Effets immédiats d'une amélioration qui vient de s'installer, ou d'un module qui vient de se déployer.
pub fn applied(w: &mut World, h: Host) {
    match h {
        Host::U(s) => {
            // le bouclier démarre au quart de ses points, ou s'éteint avec son émetteur
            let max = unit_shield(w, s).1;
            let c = &mut w.units.cold[s];
            c.shield = if max == 0 { 0 } else { c.shield.clamp(max / 4, max) };
            c.shield_down = 0;
            // nouvelle arme : elle cherche une cible à sa portée
            w.units.cold[s].wtarget = [NONE; 2];
        }
        Host::B(b) => {
            let max = building_shield(&w.buildings[b]).1;
            let bb = &mut w.buildings[b];
            match bb.def().class {
                BClass::Turret => {
                    bb.shield = max / 4;
                    bb.shield_down = 0;
                    bb.target = NONE;
                }
                BClass::Power => w.power_dirty = true,
                _ => {}
            }
            w.buildings[b].wake = 0;
        }
    }
}

// ---------- événements ----------
/// amélioration installée : [joueur, amélioration, x, y]
pub const EV_MOD_DONE: i32 = 70;
/// tourelle d'Arche détruite : [joueur, x, y, type d'unité]
pub const EV_TURRET_LOST: i32 = 71;
/// surcharge d'une Arche : [x, y, joueur]
pub const EV_BOOST: i32 = 72;

// ---------- l'Arche ----------

/// Tourelle à bord.
pub const TU_ABOARD: u8 = 0;
/// Dehors : en route vers son poste, ou déployée.
pub const TU_OUT: u8 = 1;
/// Rappelée : elle se replie puis roule jusqu'à l'Arche.
pub const TU_RETURN: u8 = 2;
/// Détruite : à reconstruire (`timer` : ticks restants, 0 tant qu'elle n'est pas payée).
pub const TU_LOST: u8 = 3;
/// Conversion vers un autre type, à bord (`timer` : ticks restants).
pub const TU_CONVERT: u8 = 4;

/// Types de tourelles, dans l'ordre du choix du joueur.
pub const TURRET_KINDS: [u16; 3] = [U_TUR_GUN, U_TUR_AA, U_TUR_MORTAR];
/// Déploiement d'une tourelle à son poste, repli avant le retour (ticks).
pub const TURRET_DEPLOY: u32 = 40;
pub const TURRET_FOLD: u32 = 30;
/// Reconstruction d'une tourelle détruite, conversion d'un type à l'autre (ticks).
pub const TURRET_REBUILD: u16 = 600;
pub const TURRET_CONVERT: u16 = 100;
/// Intervalle entre deux tourelles qui sortent (ticks).
const TURRET_EVERY: u32 = 8;
/// Points de vie (‰) regagnés par seconde à bord ; il en faut TURRET_FIT ‰ pour ressortir.
const TURRET_HEAL: u16 = 30;
const TURRET_FIT: u16 = 400;
/// Repos (ticks) avant de déployer les tourelles, de poser le groupe électrogène.
const REST_TURRETS: u16 = 20;
const REST_DOCK: u16 = 60;
/// L'Arche est partie quand elle s'éloigne de plus de cette distance de son point d'arrêt.
const LEAVE: i32 = 2 * TILE;
/// Retour d'une tourelle : au-delà de cette durée (ticks), elle est reprise là où elle est.
const RETURN_MAX: u16 = 900;
/// Surcharge : durée et recharge (ticks).
pub const BOOST_TICKS: u32 = 240;
pub const BOOST_READY: u32 = 1800;
/// Atelier embarqué : vitesse (% d'un atelier), unités d'un type en file au plus.
pub const WORKSHOP_PCT: u32 = 60;
const QUEUE_MAX: u16 = 100;
/// Bras réparateurs, cour de réparation d'un atelier : rayon (cases).
const REPAIR_RANGE: i32 = 10;
const SHOP_REPAIR_RANGE: i32 = 8;
/// Éperon : dégâts par tick au contact.
const SPUR_DMG: i32 = 30;

#[derive(Clone, Copy, Default, Debug)]
pub struct ArkTurret {
    /// type (indice dans TURRET_KINDS) et type voulu
    pub kind: u8,
    pub want: u8,
    pub state: u8,
    pub timer: u16,
    /// unité dehors (NONE : à bord)
    pub unit: u32,
    /// points de vie à bord (‰)
    pub hp: u16,
}
crate::ser_struct!(ArkTurret { kind, want, state, timer, unit, hp });

/// État d'une Arche (tourelles, atelier embarqué, surcharge, groupe électrogène).
#[derive(Clone, Default, Debug)]
pub struct Ark {
    pub unit: u32,
    /// tourelles demandées dehors ; consigne : elles tiennent la place quand l'Arche part
    pub out: bool,
    pub hold: bool,
    /// point d'arrêt et repos (ticks)
    pub ax: i32,
    pub ay: i32,
    pub rest: u16,
    pub turrets: Vec<ArkTurret>,
    /// atelier embarqué : file (type, nombre), avancement, unité en tête payée
    pub queue: Vec<(u16, u16)>,
    pub prog: u32,
    pub paid: bool,
    pub boost_until: u32,
    pub boost_ready: u32,
    /// groupe électrogène posé (référence de bâtiment, NONE : aucun)
    pub dock: u32,
    /// équipement déjà payé de l'unité en cours de l'atelier embarqué (voir gabarits.rs)
    pub kit: u32,
    /// remorques attelées et trace de l'Arche (voir convoi.rs)
    pub cars: Vec<crate::convoi::ArkCar>,
    pub trail: Vec<(i32, i32)>,
}
crate::ser_struct!(Ark { unit, out, hold, ax, ay, rest, turrets, queue, prog, paid, boost_until, boost_ready, dock; since 11: kit, cars, trail });

/// Indice de l'état de l'Arche `s` dans World::arks.
pub fn ark_of(w: &World, s: usize) -> Option<usize> {
    let id = w.unit_id(s);
    w.arks.iter().position(|a| a.unit == id)
}

/// Une Arche vient d'apparaître : son état, rangé par case d'unité croissante.
pub fn ark_added(w: &mut World, s: usize) {
    let id = w.unit_id(s);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    w.arks.retain(|a| slot_of(a.unit) != s);
    let k = w.arks.partition_point(|a| slot_of(a.unit) < s);
    w.arks.insert(k, Ark { unit: id, ax: x, ay: y, dock: NONE, ..Ark::default() });
}

/// Après la lecture d'une sauvegarde : états manquants (sauvegardes d'avant les améliorations).
pub fn rebuild_arks(w: &mut World) {
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && w.units.kind[s] == U_ARK && ark_of(w, s).is_none() {
            ark_added(w, s);
        }
    }
}

/// Sauvegardes d'avant la version 11 : unités et modules n'avaient qu'un emplacement (le premier octet) ; chaque
/// amélioration rejoint le sien. Chenillard soute : les équipements de ses chariots, dans les octets suivants, se
/// décalent d'un cran.
pub fn convert_slots(w: &mut World) {
    for s in 0..w.units.alive.len() {
        let (kind, mods) = (w.units.kind[s], w.units.cold[s].mods);
        if mods == 0 || kind == U_ARK {
            continue;
        }
        let m = at(mods, 0);
        let own = if m == 0 { 0 } else { (m as u64) << (8 * MODS[m as usize].slot as u32) };
        let carts = if kind == U_CH_HOLD { (mods & !0xff) << 8 } else { 0 };
        w.units.cold[s].mods = own | carts;
    }
}

/// Chaque tick, après les unités : tourelles, atelier embarqué, groupe, réparations, éperon.
pub fn update(w: &mut World) {
    let mut i = 0;
    while i < w.arks.len() {
        let Some(s) = w.unit(w.arks[i].unit) else {
            // Arche perdue : ses tourelles et son groupe tombent avec le joueur (élimination)
            w.arks.remove(i);
            continue;
        };
        update_ark(w, i, s);
        i += 1;
    }
    // ateliers à cour de réparation
    if w.tick.is_multiple_of(20) && w.players.iter().any(|p| p.race == RACE_TRANSH) {
        for k in 0..w.active.len() {
            let b = w.active[k] as usize;
            let bb = &w.buildings[b];
            if bb.alive && bb.kind == B_T_WORKSHOP && bb.complete() && spec(bb) == M_SHOP_REPAIR {
                let ((x, y), owner) = (bb.center(), bb.owner);
                repair(w, x, y, owner, SHOP_REPAIR_RANGE, false);
            }
        }
    }
}

fn update_ark(w: &mut World, i: usize, s: usize) {
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let mods = w.units.cold[s].mods;
    let carried = w.units.cold[s].carried_by != NONE;
    let moving = (x != w.units.px[s] || y != w.units.py[s]) && !w.units.cold[s].orders.is_empty();
    let a = &mut w.arks[i];
    let left = carried || dist(x, y, a.ax, a.ay) > LEAVE;
    if left {
        a.ax = x;
        a.ay = y;
    }
    a.rest = if left || moving { 0 } else { a.rest.saturating_add(1) };
    crate::convoi::update(w, i, s);
    update_turrets(w, i, s, left);
    update_dock(w, i, s, left);
    if mods == 0 || carried {
        return;
    }
    if at(mods, SLOT_DECK) == M_WORKSHOP && w.units.cold[s].stun == 0 && crate::convoi::in_service(w, s, SLOT_DECK) {
        update_workshop(w, i, s);
    }
    if has(mods, M_REPAIR) && w.tick.is_multiple_of(20) && crate::convoi::in_service(w, s, SLOT_SUPPORT) {
        repair(w, x, y, w.units.owner[s], REPAIR_RANGE, true);
    }
    if has(mods, M_SPUR) && moving {
        spur(w, s);
    }
}

/// Poste de la tourelle `k` sur `n` autour de l'Arche `s` : en couronne, la première vers l'avant.
fn post(w: &World, s: usize, k: usize, n: usize) -> (i32, i32) {
    // demi-case : la coque de l'Arche s'allonge avec ses améliorations
    let r = TILE / 2
        + TILE
            * match n {
                1 => 4,
                3 => 5,
                _ => 6,
            };
    let a = w.units.facing[s].wrapping_add((k as u32 * 65536 / n.max(1) as u32) as u16);
    let x = w.units.x[s] + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32;
    let y = w.units.y[s] + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32;
    let (mx, my) = (w.map.w * TILE - 1, w.map.h * TILE - 1);
    buildings::free_spot_near(w, x.clamp(0, mx), y.clamp(0, my), crate::units::pass_mask(Layer::Land))
}

/// Retire la tourelle `u` du monde sans mort ni épave (remise à bord) ; renvoie ses points de vie (‰).
fn embark(w: &mut World, u: usize) -> u16 {
    let hp = (w.units.hp[u] as i64 * 1000 / w.max_hp(u).max(1) as i64).clamp(1, 1000) as u16;
    crate::transhumants::vanish(w, u);
    hp
}

fn update_turrets(w: &mut World, i: usize, s: usize, left: bool) {
    let n = turret_count(w.units.cold[s].mods);
    if n == 0 && w.arks[i].turrets.is_empty() {
        return;
    }
    // branche abandonnée : les tourelles en trop rentrent
    while w.arks[i].turrets.len() > n {
        let t = w.arks[i].turrets.pop().unwrap_or_default();
        if let Some(u) = w.unit(t.unit) {
            embark(w, u);
        }
    }
    while w.arks[i].turrets.len() < n {
        // les nouvelles tourelles prennent le type voulu de la première
        let k = w.arks[i].turrets.first().map_or(0, |t| t.want);
        w.arks[i].turrets.push(ArkTurret { kind: k, want: k, state: TU_ABOARD, timer: 0, unit: NONE, hp: 1000 });
    }
    let owner = w.units.owner[s];
    let id = w.arks[i].unit;
    let carried = w.units.cold[s].carried_by != NONE;
    let (ax, ay) = (w.units.x[s], w.units.y[s]);
    // rappel, ou consigne « suivre » : l'Arche part, ses tourelles se replient et la rejoignent
    if !w.arks[i].out || (left && !w.arks[i].hold) {
        for t in w.arks[i].turrets.iter_mut().filter(|t| t.state == TU_OUT) {
            t.state = TU_RETURN;
            t.timer = 0;
        }
    }
    // une seule reconstruction à la fois
    let mut rebuilding = w.arks[i].turrets.iter().any(|t| t.state == TU_LOST && t.timer > 0);
    let mut launched = !w.tick.is_multiple_of(TURRET_EVERY);
    for k in 0..n {
        let mut t = w.arks[i].turrets[k];
        // la remorque qui la porte : sans elle, ni sortie, ni retour à bord, ni reconstruction
        let car = crate::convoi::turret_car(k, n);
        let lost = w.arks[i].cars.get(car).is_some_and(|c| c.state == crate::convoi::CAR_LOST);
        // elle sort, et rentre, par le plus proche de son poste (ou d'elle) : sa remorque, ou l'Arche
        let (px, py) = match w.unit(t.unit) {
            Some(u) => (w.units.x[u], w.units.y[u]),
            None if t.state == TU_ABOARD && w.arks[i].out => post(w, s, k, n),
            None => (ax, ay),
        };
        let (cx, cy) = crate::convoi::car_pos(w, i, s, car);
        let from_car = dist(px, py, cx, cy) < dist(px, py, ax, ay);
        let ((bx, by), br) = if from_car { ((cx, cy), udef(U_ARK_CAR).radius) } else { ((ax, ay), radius(&w.units, s)) };
        match t.state {
            TU_ABOARD => {
                if t.hp < 1000 && w.tick.is_multiple_of(20) {
                    t.hp = (t.hp + TURRET_HEAL).min(1000);
                }
                let a = &w.arks[i];
                let ready = a.out && a.rest >= REST_TURRETS && !carried && !lost && t.hp >= TURRET_FIT;
                if t.want != t.kind {
                    t.state = TU_CONVERT;
                    t.timer = TURRET_CONVERT;
                } else if ready && !launched && w.players[owner as usize].unit_count < UNIT_CAP {
                    launched = true;
                    let d = dist(bx, by, px, py).max(1);
                    let (ox, oy) = (bx + (px - bx) * br.min(d) / d, by + (py - by) * br.min(d) / d);
                    let uid = w.spawn_unit(TURRET_KINDS[t.kind as usize % 3], owner, ox, oy);
                    let u = slot_of(uid);
                    w.units.hp[u] = ((w.max_hp(u) as i64 * t.hp as i64 / 1000) as i32).max(1);
                    w.units.facing[u] = w.trig.atan2((py - ay) as i64, (px - ax) as i64);
                    w.units.cold[u].parent = id;
                    w.units.cold[u].orders.push(Order::Move { x: px, y: py, gx: px, gy: py, attack: false, pace: 0, wait: 0 });
                    t.unit = uid;
                    t.state = TU_OUT;
                }
            }
            TU_OUT | TU_RETURN => match w.unit(t.unit) {
                None => {
                    t.state = TU_LOST;
                    t.timer = 0;
                    t.unit = NONE;
                    w.ev(EV_TURRET_LOST, owner as i32, ax, ay, TURRET_KINDS[t.kind as usize % 3] as i32);
                }
                Some(u) if t.state == TU_OUT => {
                    // arrivée à son poste : elle se déploie
                    let c = &mut w.units.cold[u];
                    if c.orders.is_empty() && c.pack == 0 && !c.deployed {
                        c.pack = crate::transhumants::PACK_DEPLOYING;
                        c.ready_tick = w.tick + TURRET_DEPLOY;
                    }
                }
                Some(u) => {
                    t.timer = t.timer.saturating_add(1);
                    let c = &mut w.units.cold[u];
                    if c.deployed {
                        c.deployed = false;
                        c.pack = crate::transhumants::PACK_FOLDING;
                        c.ready_tick = w.tick + TURRET_FOLD;
                    } else if c.pack == crate::transhumants::PACK_DEPLOYING {
                        c.pack = 0;
                    }
                    if c.pack == 0 && !carried {
                        let idle = c.orders.is_empty();
                        let near = dist(w.units.x[u], w.units.y[u], bx, by) <= br + TILE * 3 / 2;
                        if !lost && (near || t.timer >= RETURN_MAX) {
                            t.hp = embark(w, u);
                            t.unit = NONE;
                            t.state = TU_ABOARD;
                            t.timer = 0;
                        } else if idle || w.tick.is_multiple_of(10) {
                            crate::units::clear_orders(w, u);
                            w.units.cold[u].orders.push(Order::Move { x: bx, y: by, gx: bx, gy: by, attack: false, pace: 0, wait: 0 });
                        }
                    }
                }
            },
            TU_LOST => {
                t.kind = t.want;
                if t.timer > 0 {
                    t.timer -= 1;
                    if t.timer == 0 {
                        t.state = TU_ABOARD;
                        t.hp = 1000;
                    }
                } else if !rebuilding && !carried && !lost && w.tick.is_multiple_of(10) && pay(w, owner, ax, ay, udef(TURRET_KINDS[t.kind as usize % 3]).cost) {
                    rebuilding = true;
                    t.timer = TURRET_REBUILD;
                }
            }
            _ => {
                t.timer = t.timer.saturating_sub(1);
                if t.timer == 0 {
                    t.kind = t.want;
                    t.state = TU_ABOARD;
                }
            }
        }
        w.arks[i].turrets[k] = t;
    }
}

/// Tourelle d'Arche qui se déploie ou se replie (`UnitCold::pack`) : vrai tant qu'elle ne doit pas agir. Appelé
/// par transhumants::tick_unit.
pub fn tick_turret(w: &mut World, s: usize) -> bool {
    if w.tick < w.units.cold[s].ready_tick {
        return true;
    }
    let c = &mut w.units.cold[s];
    c.deployed = c.pack == crate::transhumants::PACK_DEPLOYING;
    c.pack = 0;
    false
}

/// Ordre sur les tourelles de l'Arche `s` : 0 replier, 1 déployer, 2 consigne « suivre », 3 « tenir la place ».
pub fn order_turrets(w: &mut World, s: usize, action: i32) {
    let Some(i) = ark_of(w, s) else { return };
    let (x, y) = (w.units.x[s], w.units.y[s]);
    match action {
        0 => w.arks[i].out = false,
        1 => w.arks[i].out = true,
        3 => w.arks[i].hold = true,
        2 => {
            // consigne « suivre » : celles que l'Arche avait laissées derrière elle rentrent
            w.arks[i].hold = false;
            for k in 0..w.arks[i].turrets.len() {
                let t = w.arks[i].turrets[k];
                if t.state == TU_OUT && w.unit(t.unit).is_some_and(|u| dist(w.units.x[u], w.units.y[u], x, y) > 10 * TILE) {
                    w.arks[i].turrets[k].state = TU_RETURN;
                    w.arks[i].turrets[k].timer = 0;
                }
            }
        }
        _ => {}
    }
}

/// Ordre : type voulu de la tourelle `k` de l'Arche `s` (-1 : toutes). Dehors, elle change à son retour à bord ;
/// détruite, elle est reconstruite dans ce type.
pub fn set_turret_type(w: &mut World, s: usize, k: i32, kind: i32) {
    let Some(i) = ark_of(w, s) else { return };
    if !(0..TURRET_KINDS.len() as i32).contains(&kind) {
        return;
    }
    for (j, t) in w.arks[i].turrets.iter_mut().enumerate() {
        if (k >= 0 && k != j as i32) || (t.state == TU_LOST && t.timer > 0) {
            continue;
        }
        t.want = kind as u8;
        // conversion en cours, ramenée au type d'origine : annulée
        if t.state == TU_CONVERT && t.want == t.kind {
            t.state = TU_ABOARD;
            t.timer = 0;
        }
    }
}

/// Ordre : surcharge de l'Arche `s`.
pub fn boost(w: &mut World, s: usize) -> bool {
    let Some(i) = ark_of(w, s) else { return false };
    if !has(w.units.cold[s].mods, M_BOOST) || w.tick < w.arks[i].boost_ready {
        return false;
    }
    w.arks[i].boost_until = w.tick + BOOST_TICKS;
    w.arks[i].boost_ready = w.tick + BOOST_READY;
    let (x, y, o) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
    w.ev(EV_BOOST, x, y, o as i32, 0);
    true
}

/// Unité que l'atelier embarqué peut fabriquer.
fn workshop_ok(w: &World, p: u8, kind: u16) -> bool {
    crate::races::unit_ok(w, p, kind) && udef(kind).race == RACE_TRANSH && udef(kind).factory == FactoryKind::Land && w.players[p as usize].has_tech(udef(kind).tech)
}

/// Ordre : file de l'atelier embarqué de l'Arche `s` (delta < 0 : retire ; l'unité en cours retirée est remboursée).
pub fn workshop_queue(w: &mut World, s: usize, kind: i32, delta: i32) {
    let Some(i) = ark_of(w, s) else { return };
    let p = w.units.owner[s];
    if !(0..UNITS.len() as i32).contains(&kind) || !has(w.units.cold[s].mods, M_WORKSHOP) {
        return;
    }
    let kind = kind as u16;
    let delta = delta.clamp(-(QUEUE_MAX as i32), QUEUE_MAX as i32);
    if delta > 0 {
        if !workshop_ok(w, p, kind) {
            return;
        }
        let q = &mut w.arks[i].queue;
        if let Some(e) = q.iter_mut().find(|e| e.0 == kind) {
            e.1 = (e.1 + delta as u16).min(QUEUE_MAX);
        } else if q.len() < 16 {
            q.push((kind, delta as u16));
        }
        return;
    }
    let Some(k) = w.arks[i].queue.iter().position(|e| e.0 == kind) else { return };
    let n = w.arks[i].queue[k].1.saturating_sub((-delta) as u16);
    if n > 0 {
        w.arks[i].queue[k].1 = n;
        return;
    }
    w.arks[i].queue.remove(k);
    if k == 0 {
        drop_work(w, i, s, kind);
    }
}

/// L'unité en cours de l'atelier embarqué est abandonnée : remboursée.
fn drop_work(w: &mut World, i: usize, s: usize, kind: u16) {
    w.arks[i].prog = 0;
    let kit = std::mem::take(&mut w.arks[i].kit);
    if kit != 0 {
        let (p, x, y) = (w.units.owner[s], w.units.x[s], w.units.y[s]);
        crate::gabarits::refund(w, p, x, y, kit);
    }
    if std::mem::take(&mut w.arks[i].paid) {
        let (p, x, y) = (w.units.owner[s], w.units.x[s], w.units.y[s]);
        for &(it, n) in udef(kind).cost {
            crate::drones::refund(w, p, x, y, it, n as u32);
        }
    }
}

fn update_workshop(w: &mut World, i: usize, s: usize) {
    let Some(&(kind, _)) = w.arks[i].queue.first() else { return };
    let p = w.units.owner[s];
    let full = w.players[p as usize].unit_count >= UNIT_CAP;
    if !w.arks[i].paid {
        let (x, y) = (w.units.x[s], w.units.y[s]);
        if full || !w.tick.is_multiple_of(10) || !pay(w, p, x, y, udef(kind).cost) {
            return;
        }
        w.arks[i].paid = true;
        w.arks[i].prog = 0;
        w.arks[i].kit = crate::gabarits::begin(w, p, x, y, kind);
    }
    let need = (factory_ticks(kind) + crate::gabarits::ticks(w.arks[i].kit)) * 100;
    w.arks[i].prog = (w.arks[i].prog + w.players[p as usize].build_mult.max(0) as u32 * WORKSHOP_PCT / 100).min(need);
    if w.arks[i].prog < need || full {
        return;
    }
    w.arks[i].prog = 0;
    w.arks[i].paid = false;
    // l'unité sort sur le flanc de la remorque atelier (de l'Arche, tant qu'elle n'est pas attelée)
    let (cx, cy) = crate::convoi::car_pos(w, i, s, 0);
    let from = crate::convoi::car_unit(w, i, 0).unwrap_or(s);
    let a = w.units.facing[from].wrapping_add(16384);
    let r = radius(&w.units, from) + udef(kind).radius + TILE / 2;
    let x = cx + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32;
    let y = cy + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32;
    let (mx, my) = (w.map.w * TILE - 1, w.map.h * TILE - 1);
    let (fx, fy) = buildings::free_spot_near(w, x.clamp(0, mx), y.clamp(0, my), crate::units::pass_mask(udef(kind).layer));
    let id = w.spawn_unit(kind, p, fx, fy);
    w.units.facing[slot_of(id)] = w.units.facing[s];
    let kit = std::mem::take(&mut w.arks[i].kit);
    crate::gabarits::deliver(w, slot_of(id), kit);
    let q = &mut w.arks[i].queue;
    q[0].1 = q[0].1.saturating_sub(1);
    if q[0].1 == 0 {
        q.remove(0);
    }
}

/// Groupe électrogène : posé à côté de l'Arche au repos, rembarqué quand elle part (ou change de soutien).
fn update_dock(w: &mut World, i: usize, s: usize, left: bool) {
    let on = has(w.units.cold[s].mods, M_DYNAMO) && crate::convoi::in_service(w, s, SLOT_SUPPORT);
    let dock = w.arks[i].dock;
    if let Some(b) = w.building(dock) {
        if !on || left {
            buildings::remove_building(w, b, false);
            w.arks[i].dock = NONE;
        }
        return;
    }
    w.arks[i].dock = NONE;
    if !on || left || w.arks[i].rest < REST_DOCK || !w.arks[i].rest.is_multiple_of(20) {
        return;
    }
    let owner = w.units.owner[s];
    let (tx, ty) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
    // la case libre la plus proche, hors de l'emprise de l'Arche
    let mut best: Option<(i32, i32, i32)> = None;
    for dy in -4..=4i32 {
        for dx in -4..=4i32 {
            let d = dx * dx + dy * dy;
            if d < 5 || best.is_some_and(|b| b.0 <= d) {
                continue;
            }
            if buildings::can_place(w, owner, B_ARK_DOCK, tx + dx, ty + dy, 0) {
                best = Some((d, tx + dx, ty + dy));
            }
        }
    }
    let Some((_, bx, by)) = best else { return };
    if let Some(b) = buildings::place_building(w, owner, B_ARK_DOCK, bx, by, 0) {
        buildings::complete_building(w, b);
        w.arks[i].dock = w.building_ref(b);
    }
}

/// Bras réparateurs, cour de réparation : unités (et modules, si `modules`) du joueur `owner` à moins de `range` cases
/// du point, 1 % de points de vie par seconde (appelé une fois par seconde).
fn repair(w: &mut World, x: i32, y: i32, owner: u8, range: i32, modules: bool) {
    let r = range * TILE;
    let r2 = r as i64 * r as i64;
    let mut near: Vec<usize> = Vec::new();
    let units = &w.units;
    w.grid.coarse.query(x, y, r, |o| {
        if units.alive[o] && units.owner[o] == owner && units.hp[o] > 0 && dist2(x, y, units.x[o], units.y[o]) <= r2 {
            near.push(o);
        }
    });
    near.sort_unstable();
    near.dedup();
    for o in near {
        let max = w.max_hp(o);
        if w.units.hp[o] < max {
            w.units.hp[o] = (w.units.hp[o] + (max / 100).max(1)).min(max);
        }
    }
    if !modules {
        return;
    }
    let mut blds: Vec<usize> = Vec::new();
    w.grid.query_buildings(x, y, r, |b| blds.push(b));
    blds.sort_unstable();
    blds.dedup();
    for b in blds {
        let (cx, cy) = w.buildings[b].center();
        let bb = &mut w.buildings[b];
        let max = bb.def().hp;
        if bb.alive && bb.complete() && bb.owner == owner && bb.hp > 0 && bb.hp < max && dist2(x, y, cx, cy) <= r2 {
            bb.hp = (bb.hp + (max / 100).max(1)).min(max);
        }
    }
}

/// Éperon : unités au sol et bâtiments ennemis touchés par l'Arche en mouvement.
fn spur(w: &mut World, s: usize) {
    let (x, y, owner) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
    let team = w.team_of(owner);
    let r = radius(&w.units, s);
    let mut hits: Vec<usize> = Vec::new();
    let units = &w.units;
    w.grid.fine.query(x, y, r + 320, |o| {
        if o != s && units.alive[o] && units.cold[o].carried_by == NONE {
            let d = udef(units.kind[o]);
            let rr = r + d.radius + 32;
            if matches!(d.layer, Layer::Land | Layer::Hover) && dist2(x, y, units.x[o], units.y[o]) <= rr as i64 * rr as i64 {
                hits.push(o);
            }
        }
    });
    hits.sort_unstable();
    hits.dedup();
    w.shooter = w.unit_id(s);
    w.hit_from = (x, y);
    for o in hits {
        if w.team_of(w.units.owner[o]) != team {
            crate::combat::damage_unit(w, o, SPUR_DMG, owner);
        }
    }
    let mut blds: Vec<usize> = Vec::new();
    w.grid.query_buildings(x, y, r + 4 * TILE, |b| blds.push(b));
    blds.sort_unstable();
    blds.dedup();
    let reach = (r + TILE) as i64;
    for b in blds {
        let bb = &w.buildings[b];
        if !bb.alive || w.team_of(bb.owner) == team {
            continue;
        }
        let (bw, bh) = bb.size();
        let (nx, ny) = (x.clamp(bb.x * TILE, (bb.x + bw) * TILE), y.clamp(bb.y * TILE, (bb.y + bh) * TILE));
        if dist2(x, y, nx, ny) <= reach * reach {
            crate::combat::damage_building(w, b, SPUR_DMG, owner);
        }
    }
    w.shooter = NONE;
    w.hit_from = (i32::MIN, 0);
}

// ---------- hachage, interface ----------

pub fn hash_into(w: &World, h: &mut crate::ser::Hasher) {
    for a in &w.arks {
        h.add(a.unit as u64 | (a.out as u64) << 32 | (a.hold as u64) << 33 | (a.rest as u64) << 34);
        for t in &a.turrets {
            h.add(t.kind as u64 | (t.want as u64) << 4 | (t.state as u64) << 8 | (t.timer as u64) << 16 | (t.hp as u64) << 32);
        }
        for q in &a.queue {
            h.add(q.0 as u64 | (q.1 as u64) << 16);
        }
        h.add(a.prog as u64 | (a.paid as u64) << 32);
        h.add(a.boost_until as u64 | (a.dock as u64) << 32);
        if a.kit != 0 {
            h.add(a.kit as u64);
        }
        crate::convoi::hash_into(a, h);
    }
}

fn js(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Table des améliorations pour le client (le coût compte les relevés, comme un objet).
pub fn mods_json() -> String {
    let list: Vec<String> = MODS
        .iter()
        .enumerate()
        .map(|(i, d)| {
            let m = i as u8;
            // arme donnée (rang de l'arme remplacée, arme ; -1 : aucune) et radar, pour les cercles de portée
            let (slot, wi) = match m {
                M_BASTION_LONG => (0, W_BASTION_LONG as i32),
                _ => mod_weapon(d.host, m).map_or((0, -1), |(k, wi)| (k, wi as i32)),
            };
            let radar = match m {
                M_RADAR => ARK_RADAR,
                M_LAB_ANTENNA => LAB_RADAR,
                _ => d.radar as i32,
            };
            let mut cost: Vec<String> = d.cost.iter().map(|&(it, n)| format!("[{},{}]", it, n)).collect();
            if d.releves > 0 {
                cost.push(format!("[{},{}]", RELEVES, d.releves));
            }
            let host = if d.host == NO_KIND { -1 } else { d.host as i32 };
            format!(
                "{{\"key\":{},\"name\":{},\"desc\":{},\"icon\":{},\"host\":{},\"slot\":{},\"rank\":{},\"base\":{},\"tech\":{},\"cost\":[{}],\"time\":{},\"weapon\":[{},{}],\"radar\":{},\"vision\":{},\"quick\":{}}}",
                js(d.key), js(d.name), js(d.desc), js(d.icon), host, d.slot, d.rank, d.base, d.tech, cost.join(","), d.time, slot, wi, radar, d.vision, d.quick
            )
        })
        .collect();
    let slot = |s: &(&str, &str, &str)| format!("{{\"key\":{},\"name\":{},\"icon\":{}}}", js(s.0), js(s.1), js(s.2));
    let all = |v: &[(&str, &str, &str)]| v.iter().map(slot).collect::<Vec<String>>().join(",");
    let rs: Vec<String> = ARK_RADII.iter().map(|r| r.to_string()).collect();
    let tk: Vec<String> = TURRET_KINDS.iter().map(|k| k.to_string()).collect();
    format!(
        "\"mods\":[{}],\"arkSlots\":[{}],\"unitSlots\":[{}],\"moduleSlots\":[{}],\"oneSlot\":{},\"turretKinds\":[{}],\"arkRadii\":[{}]",
        list.join(","),
        all(&ARK_SLOTS),
        all(&UNIT_SLOTS),
        all(&MODULE_SLOTS),
        slot(&ONE_SLOT),
        tk.join(","),
        rs.join(",")
    )
}

/// Fiche des améliorations d'un porteur (JSON) : {host, mods : une par emplacement, job, left, total, reach :
/// disponible à portée (relevés compris), ark : état de l'Arche} ou null.
pub fn info(w: &World, h: Host) -> String {
    let kind = h.kind(w);
    if !host_has_mods(kind) {
        return "null".into();
    }
    let p = h.owner(w);
    let mods = h.mods(w);
    let n = slots(kind).len();
    let list: Vec<String> = (0..n as u8).map(|k| at(mods, k).to_string()).collect();
    let (job, left) = h.job(w);
    let (x, y) = h.pos(w);
    let mut reach = vec![0i64; NUM_ITEMS];
    for (_, st) in sources(w, p, x, y) {
        for (i, &k) in st.stash(w).iter().enumerate().take(NUM_ITEMS) {
            reach[i] += k as i64;
        }
    }
    for (i, v) in reach.iter_mut().enumerate() {
        *v += w.players.get(p as usize).map_or(0, |pl| pl.purse[i]) as i64;
    }
    let reach: Vec<String> = reach.iter().map(|v| v.to_string()).collect();
    let ark = match h {
        Host::U(s) if kind == U_ARK => ark_info(w, s),
        _ => "null".into(),
    };
    let total = if job != 0 { install_ticks(w, p, job) } else { 0 };
    // gabarits du joueur, équipement voulu de l'unité, équipement payé de l'unité en fabrication
    let (want, kit) = match h {
        Host::U(s) => (w.units.cold[s].want, 0),
        Host::B(b) => (0, w.buildings[b].kit),
    };
    format!(
        "{{\"host\":{},\"mods\":[{}],\"job\":{},\"left\":{},\"total\":{},\"reach\":[{}],\"ark\":{},\"kits\":{},\"want\":{},\"kit\":{}}}",
        kind,
        list.join(","),
        job,
        left,
        total,
        reach.join(","),
        ark,
        crate::gabarits::json(w, p),
        want,
        kit
    )
}

/// État de l'Arche `s` : tourelles [type, type voulu, état, ticks, PV ‰, déployée, unité], consignes, file de
/// l'atelier embarqué, surcharge (ticks restants, recharge), bouclier, groupe électrogène posé.
fn ark_info(w: &World, s: usize) -> String {
    let Some(i) = ark_of(w, s) else { return "null".into() };
    let a = &w.arks[i];
    let tur: Vec<String> = a
        .turrets
        .iter()
        .map(|t| {
            let u = w.unit(t.unit);
            let hp = u.map_or(t.hp as i64, |u| w.units.hp[u] as i64 * 1000 / w.max_hp(u).max(1) as i64);
            let up = u.is_some_and(|u| w.units.cold[u].deployed);
            format!("[{},{},{},{},{},{},{}]", t.kind, t.want, t.state, t.timer, hp, up as i32, u.map_or(-1, |u| w.unit_id(u) as i64))
        })
        .collect();
    let q: Vec<String> = a.queue.iter().map(|e| format!("[{},{}]", e.0, e.1)).collect();
    let need = a.queue.first().map_or(1, |e| (factory_ticks(e.0) + crate::gabarits::ticks(a.kit)) * 100).max(1);
    let (sr, sh) = unit_shield(w, s);
    format!(
        "{{\"turrets\":[{}],\"out\":{},\"hold\":{},\"queue\":[{}],\"prog\":{},\"paid\":{},\"boost\":{},\"boostReady\":{},\"shieldR\":{},\"shieldMax\":{},\"dock\":{},\"cap\":{},\"cars\":{},\"kit\":{}}}",
        tur.join(","),
        a.out,
        a.hold,
        q.join(","),
        a.prog as u64 * 1000 / need as u64,
        a.paid,
        a.boost_until.saturating_sub(w.tick),
        a.boost_ready.saturating_sub(w.tick),
        sr,
        sh,
        w.building(a.dock).is_some(),
        store_cap(w, s),
        crate::convoi::info(w, i),
        a.kit
    )
}
