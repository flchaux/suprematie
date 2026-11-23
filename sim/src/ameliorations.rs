//! Améliorations des Transhumants (voir docs/spec/races.md, « Améliorations »).
//!
//! - Une amélioration (`MODS`) s'installe sur une unité ou un module précis, depuis sa fiche (ordre
//!   `O_MOD_INSTALL`) : l'Arche a cinq emplacements (`ARK_SLOTS`), un chenillard (et son module déployé) ou une
//!   unité de combat en a un. Un emplacement ne garde qu'une amélioration : les branches s'excluent. Un palier
//!   demande le palier précédent et le remplace.
//! - Coût payé tout de suite : composants pris dans les réserves à portée (soute de l'Arche, dépôts et soutes,
//!   chenillards soutes repliés), relevés dans la bourse du joueur. L'ordre `O_MOD_CANCEL` annule et rembourse
//!   tout. Une amélioration remplacée par une autre branche rend la moitié de ses composants.
//! - État : `UnitCold::mods` et `Building::mods`, un octet par emplacement (indice dans MODS, 0 : rien) ;
//!   `mod_job` (amélioration en cours d'installation) et `mod_left` (ticks restants). Ils suivent le module à
//!   son repli et à son déploiement.
//! - Arche : tourelles déployables, atelier embarqué, surcharge, groupe électrogène (`Ark`, un par Arche, dans
//!   `World::arks`).

use crate::buildings;
use crate::data::*;
use crate::drones::Store;
use crate::fixed::{dist, dist2, TILE};
use crate::world::*;

// ---------- emplacements ----------
pub const SLOT_ARM: u8 = 0;
pub const SLOT_HULL: u8 = 1;
pub const SLOT_DECK: u8 = 2;
pub const SLOT_DRIVE: u8 = 3;
pub const SLOT_SUPPORT: u8 = 4;
/// Emplacements de l'Arche : (clé, nom, icône de l'interface).
pub const ARK_SLOTS: [(&str, &str, &str); 5] = [
    ("arm", "Armement", "mod_gun"),
    ("hull", "Coque", "mod_plate"),
    ("deck", "Pont", "mod_turret"),
    ("drive", "Mobilité", "mod_engine"),
    ("support", "Soutien", "mod_repair"),
];
/// Emplacement unique des autres unités et des modules.
pub const ONE_SLOT: (&str, &str, &str) = ("fit", "Aménagement", "mod_fit");

pub struct ModDef {
    pub key: &'static str,
    pub name: &'static str,
    /// effet chiffré, montré dans l'infobulle
    pub desc: &'static str,
    /// icône de l'interface (Icon.svelte)
    pub icon: &'static str,
    /// unité qui la porte (pour un module : son chenillard)
    pub host: u16,
    pub slot: u8,
    /// palier dans sa branche (1 : le premier)
    pub rank: u8,
    /// palier précédent, exigé et remplacé (0 : aucun)
    pub base: u8,
    pub tech: u8,
    pub cost: &'static [(u8, u16)],
    pub releves: u16,
    /// durée de l'installation (s)
    pub time: u16,
}

// ---------- améliorations (indices dans MODS) ----------
// Arche : armement
pub const M_W_SIEGE: u8 = 1;
pub const M_W_FLAME: u8 = 2;
pub const M_W_ROCKETS: u8 = 3;
pub const M_W_RAIL: u8 = 4;
pub const M_W_FLAK: u8 = 5;
// Arche : coque
pub const M_PLATE1: u8 = 6;
pub const M_PLATE2: u8 = 7;
pub const M_REACTIVE: u8 = 8;
pub const M_SHIELD1: u8 = 9;
pub const M_SHIELD2: u8 = 10;
pub const M_SHIELD3: u8 = 11;
// Arche : pont
pub const M_TURRETS1: u8 = 12;
pub const M_TURRETS2: u8 = 13;
pub const M_TURRETS3: u8 = 14;
pub const M_WORKSHOP: u8 = 15;
pub const M_HOLDS: u8 = 16;
// Arche : mobilité
pub const M_ENGINE1: u8 = 17;
pub const M_ENGINE2: u8 = 18;
pub const M_SPUR: u8 = 19;
pub const M_BOOST: u8 = 20;
// Arche : soutien
pub const M_REPAIR: u8 = 21;
pub const M_RADAR: u8 = 22;
pub const M_JAMMER: u8 = 23;
pub const M_DYNAMO: u8 = 24;
pub const M_LOOT: u8 = 25;
// modules
pub const M_DRILL_FAST: u8 = 26;
pub const M_DRILL_CLEAN: u8 = 27;
pub const M_FURNACE_FAST: u8 = 28;
pub const M_FURNACE_YIELD: u8 = 29;
pub const M_ASM_FAST: u8 = 30;
pub const M_ASM_THRIFT: u8 = 31;
pub const M_REF_FAST: u8 = 32;
pub const M_REF_CRACK: u8 = 33;
pub const M_GEN_BIG: u8 = 34;
pub const M_GEN_LEAN: u8 = 35;
pub const M_HOLD_BIG: u8 = 36;
pub const M_HOLD_ARMOR: u8 = 37;
pub const M_LAB_FAST: u8 = 38;
pub const M_LAB_FIELD: u8 = 39;
pub const M_SHOP_FAST: u8 = 40;
pub const M_SHOP_VETS: u8 = 41;
/// Radar (cases) de l'Arche et du pisteur aménagés.
pub const ARK_RADAR: i32 = 70;
pub const TRACKER_RADAR: i32 = 45;
pub const M_BASTION_LONG: u8 = 42;
pub const M_BASTION_SHIELD: u8 = 43;
// unités
pub const M_CART_BIG: u8 = 44;
pub const M_CART_FAST: u8 = 45;
pub const M_TRACKER_RADAR: u8 = 46;
pub const M_TRACKER_TURBO: u8 = 47;
pub const M_RIDER_TWIN: u8 = 48;
pub const M_RIDER_PLATE: u8 = 49;
pub const M_HARROW_LONG: u8 = 50;
pub const M_HARROW_MIXED: u8 = 51;
pub const M_GUN_LONG: u8 = 52;
pub const M_GUN_CLUSTER: u8 = 53;
pub const M_RAM_PLATE: u8 = 54;
pub const M_RAM_HOOK: u8 = 55;

/// Valeurs communes à toutes les améliorations (premier palier, sans recherche).
const MD: ModDef = ModDef { key: "none", name: "Rien", desc: "", icon: "", host: NO_KIND, slot: 0, rank: 1, base: 0, tech: 0, cost: &[], releves: 0, time: 0 };

/// `md!(porteur, emplacement, clé, nom, icône, recherche, durée, relevés, [coût], effet)`
macro_rules! md {
    ($host:expr, $slot:expr, $key:expr, $name:expr, $icon:expr, $tech:expr, $time:expr, $rel:expr, [$($c:expr),*], $desc:expr) => {
        ModDef { key: $key, name: $name, desc: $desc, icon: $icon, host: $host, slot: $slot, tech: $tech, cost: &[$($c),*], releves: $rel, time: $time, ..MD }
    };
    ($host:expr, $slot:expr, $key:expr, $name:expr, $icon:expr, $tech:expr, $time:expr, $rel:expr, [$($c:expr),*], $desc:expr, $rank:expr, $base:expr) => {
        ModDef { rank: $rank, base: $base, ..md!($host, $slot, $key, $name, $icon, $tech, $time, $rel, [$($c),*], $desc) }
    };
}

/// Les améliorations ; l'indice est sauvegardé : toute nouvelle amélioration va à la fin.
#[rustfmt::skip]
pub const MODS: [ModDef; 56] = [
    MD,
    // ----- Arche : armement (remplace le canon d'origine : 120 dégâts par seconde à 24 cases) -----
    md!(U_ARK, SLOT_ARM, "ark_w_siege", "Canon lourd", "mod_gun", T_T_ARMORY, 40, 20, [(STEEL, 24), (GEAR, 12), (AMMO, 6)], "Remplace le canon : 164 dégâts/s en zone, portée 42 cases, pas à moins de 5."),
    md!(U_ARK, SLOT_ARM, "ark_w_flame", "Lance-flammes", "mod_flame", 0, 25, 10, [(IRON_PLATE, 40), (COPPER_PLATE, 20), (GEAR, 8)], "Remplace le canon : 187 dégâts/s en zone, portée 13 cases, +50 % contre le vivant."),
    md!(U_ARK, SLOT_ARM, "ark_w_rockets", "Batterie de roquettes", "mod_rockets", T_T_ARMORY, 40, 20, [(STEEL, 20), (GEAR, 10), (CIRCUIT, 8)], "Remplace le canon : 12 roquettes dispersées toutes les 6 s, portée 36 cases, pas à moins de 6."),
    md!(U_ARK, SLOT_ARM, "ark_w_rail", "Canon à rail", "mod_rail", T_T_RAIL, 70, 80, [(STEEL, 40), (PROCESSOR, 12), (ENERGY_CELL, 4)], "Remplace le canon : 180 dégâts/s sur une cible, portée 52 cases."),
    md!(U_ARK, SLOT_ARM, "ark_w_flak", "Batterie antiaérienne", "mod_flak", T_T_ARMORY, 40, 20, [(STEEL, 16), (GEAR, 12), (CIRCUIT, 10)], "S'ajoute au canon : 120 dégâts/s en zone contre l'air, portée 40 cases."),
    // ----- Arche : coque -----
    md!(U_ARK, SLOT_HULL, "ark_plate1", "Blindage", "mod_plate", 0, 30, 10, [(IRON_PLATE, 60), (STEEL, 10)], "Dégâts subis −15 %, vitesse −5 %."),
    md!(U_ARK, SLOT_HULL, "ark_plate2", "Blindage lourd", "mod_plate", T_T_BUBBLE, 50, 40, [(STEEL, 50), (GEAR, 10)], "Dégâts subis −30 %, vitesse −10 %.", 2, M_PLATE1),
    md!(U_ARK, SLOT_HULL, "ark_reactive", "Blindage réactif", "mod_reactive", T_T_BUBBLE, 45, 30, [(STEEL, 30), (AMMO, 16), (CIRCUIT, 6)], "Dégâts des obus, missiles, bombes et flammes −50 %."),
    md!(U_ARK, SLOT_HULL, "ark_shield1", "Bouclier de convoi", "mod_shield", T_T_BUBBLE, 45, 30, [(STEEL, 20), (CIRCUIT, 20), (COPPER_PLATE, 30)], "Bulle de 6 cases, 2 500 points. Brisée, elle revient après 10 s."),
    md!(U_ARK, SLOT_HULL, "ark_shield2", "Bouclier renforcé", "mod_shield", T_T_BUBBLE2, 60, 60, [(STEEL, 30), (PROCESSOR, 10), (WAFER, 10)], "Bulle de 8 cases, 5 000 points.", 2, M_SHIELD1),
    md!(U_ARK, SLOT_HULL, "ark_shield3", "Grande bulle", "mod_shield", T_T_CROWN, 90, 120, [(STEEL, 40), (PROCESSOR, 20), (ENERGY_CELL, 4)], "Bulle de 11 cases, 9 000 points.", 3, M_SHIELD2),
    // ----- Arche : pont -----
    md!(U_ARK, SLOT_DECK, "ark_turrets1", "Tourelle déployable", "mod_turret", 0, 25, 10, [(IRON_PLATE, 40), (GEAR, 12)], "1 tourelle à poser : mitrailleuse, antiaérienne ou mortier. Se reconstruit en 30 s."),
    md!(U_ARK, SLOT_DECK, "ark_turrets2", "Trio de tourelles", "mod_turret", T_T_MOUNTS, 45, 40, [(STEEL, 20), (GEAR, 20), (CIRCUIT, 8)], "3 tourelles déployables, en triangle autour de l'Arche.", 2, M_TURRETS1),
    md!(U_ARK, SLOT_DECK, "ark_turrets3", "Couronne de tourelles", "mod_turret", T_T_CROWN, 90, 120, [(STEEL, 60), (ENGINE, 9), (CIRCUIT, 30)], "9 tourelles déployables, en couronne autour de l'Arche.", 3, M_TURRETS2),
    md!(U_ARK, SLOT_DECK, "ark_workshop", "Atelier embarqué", "mod_workshop", T_T_ONBOARD, 50, 30, [(STEEL, 20), (GEAR, 20), (CIRCUIT, 10)], "L'Arche produit en roulant, sans énergie, à 60 % de la vitesse d'un atelier."),
    md!(U_ARK, SLOT_DECK, "ark_holds", "Soutes de pont", "mod_hold", T_T_ONBOARD, 30, 15, [(IRON_PLATE, 60), (STEEL, 10)], "Soute de l'Arche : 2 000 de chaque objet au lieu de 600."),
    // ----- Arche : mobilité -----
    md!(U_ARK, SLOT_DRIVE, "ark_engine1", "Moteurs", "mod_engine", 0, 25, 10, [(IRON_PLATE, 30), (GEAR, 14)], "Vitesse +25 %."),
    md!(U_ARK, SLOT_DRIVE, "ark_engine2", "Moteurs jumelés", "mod_engine", T_T_DRIVE, 45, 40, [(STEEL, 20), (ENGINE, 6)], "Vitesse +60 %.", 2, M_ENGINE1),
    md!(U_ARK, SLOT_DRIVE, "ark_spur", "Éperon", "mod_spur", T_T_DRIVE, 40, 25, [(STEEL, 36), (GEAR, 8)], "En roulant, écrase ce qu'elle touche au sol : 600 dégâts/s."),
    md!(U_ARK, SLOT_DRIVE, "ark_boost", "Surcharge", "mod_boost", T_T_DRIVE, 40, 30, [(STEEL, 16), (ENGINE, 4), (CIRCUIT, 10)], "Capacité : pendant 12 s, vitesse +60 % et cadence de tir +50 % ; recharge 90 s."),
    // ----- Arche : soutien -----
    md!(U_ARK, SLOT_SUPPORT, "ark_repair", "Bras réparateurs", "mod_repair", 0, 30, 10, [(IRON_PLATE, 30), (GEAR, 10), (CIRCUIT, 6)], "+1 % de points de vie par seconde à l'Arche, aux unités et modules à 10 cases."),
    md!(U_ARK, SLOT_SUPPORT, "ark_radar", "Radar de crête", "mod_radar", T_T_RECON, 35, 30, [(COPPER_PLATE, 40), (CIRCUIT, 16)], "Radar de 70 cases, vision 40 cases au lieu de 30."),
    md!(U_ARK, SLOT_SUPPORT, "ark_jammer", "Brouilleur", "mod_jammer", T_T_RECON, 40, 30, [(STEEL, 16), (CIRCUIT, 20), (WAFER, 6)], "Cache du radar ennemi l'Arche et les alliés à 16 cases."),
    md!(U_ARK, SLOT_SUPPORT, "ark_dynamo", "Groupe électrogène", "mod_dynamo", T_T_ONBOARD, 35, 20, [(STEEL, 16), (GEAR, 12), (COPPER_PLATE, 40)], "À l'arrêt, pose un groupe de 500 kW sans combustible (zone de 8 cases)."),
    md!(U_ARK, SLOT_SUPPORT, "ark_loot", "Grues de pillage", "mod_loot", T_T_RECON, 35, 30, [(STEEL, 16), (GEAR, 16)], "Butin de 40 % au lieu de 25 %."),
    // ----- modules (gardées au repli et au déploiement) -----
    md!(U_CH_DRILL, 0, "drill_fast", "Foret à percussion", "mod_fast", T_T_FITTINGS, 20, 6, [(STEEL, 6), (GEAR, 6)], "Extraction +60 %, énergie +50 %, mais use le gisement deux fois plus vite."),
    md!(U_CH_DRILL, 0, "drill_clean", "Forage propre", "mod_lean", T_T_FITTINGS, 20, 6, [(IRON_PLATE, 16), (CIRCUIT, 3)], "N'use pas le gisement ; extraction −10 %."),
    md!(U_CH_FURNACE, 0, "furnace_fast", "Soufflerie", "mod_fast", T_T_FITTINGS, 20, 6, [(STEEL, 5), (GEAR, 5)], "Vitesse +60 %, énergie +60 %."),
    md!(U_CH_FURNACE, 0, "furnace_yield", "Four à récupération", "mod_yield", T_T_FITTINGS, 20, 6, [(IRON_PLATE, 16), (CIRCUIT, 4)], "Un produit de plus toutes les 4 fontes (rendement +25 %)."),
    md!(U_CH_ASSEMBLER, 0, "asm_fast", "Chaîne rapide", "mod_fast", T_T_FITTINGS, 20, 8, [(STEEL, 6), (GEAR, 8)], "Vitesse +50 %, énergie +50 %."),
    md!(U_CH_ASSEMBLER, 0, "asm_thrift", "Gabarits économes", "mod_yield", T_T_FITTINGS, 20, 8, [(IRON_PLATE, 20), (CIRCUIT, 4)], "Un cycle sur 5 ne consomme pas d'ingrédients."),
    md!(U_CH_REFINERY, 0, "ref_fast", "Colonne sous pression", "mod_fast", T_T_FITTINGS2, 25, 10, [(STEEL, 10), (CIRCUIT, 4)], "Vitesse +60 %, énergie +60 %."),
    md!(U_CH_REFINERY, 0, "ref_crack", "Craquage", "mod_yield", T_T_FITTINGS2, 25, 10, [(STEEL, 8), (GEAR, 8)], "Un produit de plus tous les 4 cycles (rendement +25 %)."),
    md!(U_CH_GENERATOR, 0, "gen_big", "Grosse turbine", "mod_fast", T_T_FITTINGS, 25, 8, [(STEEL, 8), (GEAR, 8)], "Production 1 000 kW au lieu de 600."),
    md!(U_CH_GENERATOR, 0, "gen_lean", "Turbine sobre", "mod_lean", T_T_FITTINGS, 25, 8, [(IRON_PLATE, 20), (CIRCUIT, 5)], "Brûle moitié moins de combustible ; zone électrique +3 cases."),
    md!(U_CH_HOLD, 0, "hold_big", "Soute profonde", "mod_hold", T_T_FITTINGS2, 25, 10, [(IRON_PLATE, 40), (STEEL, 8)], "1 500 de chaque objet au lieu de 600."),
    md!(U_CH_HOLD, 0, "hold_armor", "Soute blindée", "mod_plate", T_T_FITTINGS2, 25, 10, [(STEEL, 24)], "Dégâts subis −50 %, déployée ou repliée."),
    md!(U_CH_LAB, 0, "lab_fast", "Calculateur", "mod_fast", T_T_FITTINGS2, 25, 10, [(CIRCUIT, 12), (COPPER_PLATE, 20)], "Recherche +50 %, énergie +50 %."),
    md!(U_CH_LAB, 0, "lab_field", "Carnets de terrain", "mod_radar", T_T_FITTINGS2, 25, 10, [(CIRCUIT, 6), (GEAR, 8)], "2 relevés par palier au lieu de 3 ; sans relevés, en tire un par seconde."),
    md!(U_CH_WORKSHOP, 0, "shop_fast", "Double portique", "mod_fast", T_T_FITTINGS2, 35, 15, [(STEEL, 20), (GEAR, 20)], "Fabrication des unités +50 %, énergie +50 %."),
    md!(U_CH_WORKSHOP, 0, "shop_vets", "Cour de rodage", "mod_vet", T_T_FITTINGS2, 35, 15, [(STEEL, 16), (AMMO, 10)], "Ses unités sortent vétéranes (+10 % de points de vie, +5 % de dégâts)."),
    md!(U_CH_BASTION, 0, "bastion_long", "Canon long", "mod_gun", T_T_FITTINGS2, 30, 15, [(STEEL, 20), (CIRCUIT, 6)], "Portée 44 cases au lieu de 30, dégâts 170 au lieu de 160."),
    md!(U_CH_BASTION, 0, "bastion_shield", "Bastion à bouclier", "mod_shield", T_T_FITTINGS2, 30, 15, [(STEEL, 12), (CIRCUIT, 16)], "Bulle de 6 cases, 1 500 points, une fois déployé."),
    // ----- unités -----
    md!(U_T_CART, 0, "cart_big", "Remorque", "mod_hold", T_T_FITTINGS, 8, 2, [(IRON_PLATE, 10), (GEAR, 2)], "Cale de 40 objets au lieu de 20."),
    md!(U_T_CART, 0, "cart_fast", "Attelage léger", "mod_engine", T_T_FITTINGS, 8, 2, [(IRON_PLATE, 6), (GEAR, 4)], "Vitesse +60 %."),
    md!(U_TRACKER, 0, "tracker_radar", "Mât radar", "mod_radar", T_T_GEAR, 10, 4, [(COPPER_PLATE, 8), (CIRCUIT, 3)], "Radar de 45 cases."),
    md!(U_TRACKER, 0, "tracker_turbo", "Turbo", "mod_engine", T_T_GEAR, 10, 4, [(GEAR, 4), (IRON_PLATE, 6)], "Vitesse +40 %."),
    md!(U_RIDER, 0, "rider_twin", "Canons jumelés", "mod_gun", T_T_GEAR, 12, 4, [(STEEL, 3), (GEAR, 2)], "Cadence de tir +55 %."),
    md!(U_RIDER, 0, "rider_plate", "Blindage d'appoint", "mod_plate", T_T_GEAR, 12, 4, [(STEEL, 4)], "Dégâts subis −30 %."),
    md!(U_HARROW, 0, "harrow_long", "Viseur longue portée", "mod_flak", T_T_GEAR, 12, 4, [(CIRCUIT, 4), (GEAR, 2)], "Portée 38 cases au lieu de 28."),
    md!(U_HARROW, 0, "harrow_mixed", "Affût mixte", "mod_gun", T_T_GEAR, 12, 4, [(STEEL, 3), (AMMO, 2)], "Tire aussi au sol ; portée 24 cases au lieu de 28, dégâts −20 %."),
    md!(U_TOWED_GUN, 0, "gun_long", "Tube allongé", "mod_gun", T_T_GEAR, 15, 6, [(STEEL, 5), (GEAR, 2)], "Portée 54 cases au lieu de 40."),
    md!(U_TOWED_GUN, 0, "gun_cluster", "Obus à grappe", "mod_rockets", T_T_GEAR, 15, 6, [(STEEL, 3), (AMMO, 4)], "Trois obus dispersés de 45 dégâts en zone au lieu d'un de 90."),
    md!(U_RAM, 0, "ram_plate", "Proue blindée", "mod_plate", T_T_GEAR, 15, 6, [(STEEL, 8)], "Dégâts subis −35 %."),
    md!(U_RAM, 0, "ram_hook", "Grappins", "mod_loot", T_T_GEAR, 15, 6, [(STEEL, 4), (GEAR, 4)], "Butin doublé sur ce qu'il détruit, vitesse +20 %."),
];

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

// ---------- effets sur les unités ----------

/// Armes de l'unité `s`, améliorations comprises (au plus deux), et leur nombre.
#[inline]
pub fn weapons_of(w: &World, s: usize) -> ([u8; 2], usize) {
    let def = udef(w.units.kind[s]);
    let n = def.weapons.len().min(2);
    let mut v = [0u8; 2];
    v[..n].copy_from_slice(&def.weapons[..n]);
    let mods = w.units.cold[s].mods;
    if mods != 0 {
        if let Some((k, wi)) = mod_weapon(w.units.kind[s], at(mods, 0)) {
            v[k] = wi;
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
        U_T_CART if has(mods, M_CART_FAST) => 160,
        U_TRACKER if has(mods, M_TRACKER_TURBO) => 140,
        U_RAM if has(mods, M_RAM_HOOK) => 120,
        _ => 100,
    };
    base * pct / 100
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
        U_RIDER if has(mods, M_RIDER_PLATE) => 70,
        U_RAM if has(mods, M_RAM_PLATE) => 65,
        _ => 100,
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
    let d = udef(w.units.kind[s]);
    (d.shield_r, d.shield_hp)
}

/// Rayon du radar de l'unité `s` (cases).
#[inline]
pub fn unit_radar(w: &World, s: usize) -> i32 {
    let mods = w.units.cold[s].mods;
    if mods != 0 {
        if w.units.kind[s] == U_ARK && has(mods, M_RADAR) {
            return ARK_RADAR;
        }
        if w.units.kind[s] == U_TRACKER && has(mods, M_TRACKER_RADAR) {
            return TRACKER_RADAR;
        }
    }
    udef(w.units.kind[s]).radar
}

/// Rayon de vision de l'unité `s` (cases).
#[inline]
pub fn unit_vision(w: &World, s: usize) -> i32 {
    let v = udef(w.units.kind[s]).vision;
    if w.units.kind[s] == U_ARK && has(w.units.cold[s].mods, M_RADAR) {
        v.max(40)
    } else {
        v
    }
}

/// Rayon (cases) de la bulle de brouillage de l'unité `s` (0 : aucune).
#[inline]
pub fn unit_jam(w: &World, s: usize) -> i32 {
    match w.units.kind[s] {
        U_JAMMER => JAM_RADIUS,
        U_ARK if has(w.units.cold[s].mods, M_JAMMER) => 16,
        _ => 0,
    }
}

/// Plafond par objet de la soute d'un commandant (elle compte comme un dépôt).
pub fn store_cap(w: &World, s: usize) -> u16 {
    if w.units.kind[s] == U_ARK && has(w.units.cold[s].mods, M_HOLDS) {
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

/// Butin (% du coût) du joueur `p` : LOOT_PCT, 40 % avec les grues de pillage de son Arche ; doublé pour un
/// bélier à grappins (`killer` : unité qui pille).
pub fn loot_pct(w: &World, p: u8, killer: usize) -> u32 {
    let ark = w.arks.iter().any(|a| w.unit(a.unit).is_some_and(|s| w.units.owner[s] == p && has(w.units.cold[s].mods, M_LOOT)));
    let base = if ark { 40 } else { crate::transhumants::LOOT_PCT };
    if w.units.kind[killer] == U_RAM && has(w.units.cold[killer].mods, M_RAM_HOOK) {
        base * 2
    } else {
        base
    }
}

/// Surcharge de l'Arche `s` en cours ?
pub fn boosted(w: &World, s: usize) -> bool {
    let id = w.unit_id(s);
    w.arks.iter().any(|a| a.unit == id && w.tick < a.boost_until)
}

// ---------- effets sur les modules ----------

/// Amélioration du module (0 : aucune).
#[inline]
pub fn fit(bb: &Building) -> u8 {
    bb.mods as u8
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
    match fit(bb) {
        M_FURNACE_FAST | M_REF_FAST => 160,
        M_DRILL_FAST | M_ASM_FAST | M_LAB_FAST | M_SHOP_FAST => 150,
        _ => 100,
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

/// Dégâts subis par un module (soute blindée).
#[inline]
pub fn building_armor(bb: &Building, dmg: i32) -> i32 {
    if fit(bb) == M_HOLD_ARMOR {
        dmg / 2
    } else {
        dmg
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

/// Arme d'un bâtiment (canon long du bastion).
#[inline]
pub fn building_weapon(bb: &Building) -> i8 {
    if fit(bb) == M_BASTION_LONG {
        W_BASTION_LONG as i8
    } else {
        bb.def().weapon
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
fn pay(w: &mut World, p: u8, x: i32, y: i32, cost: &[(u8, u16)]) -> bool {
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
            if w.units.kind[s] == U_ARK {
                // le bouclier démarre au quart de ses points, ou s'éteint avec son émetteur
                let max = unit_shield(w, s).1;
                let c = &mut w.units.cold[s];
                c.shield = if max == 0 { 0 } else { c.shield.clamp(max / 4, max) };
                c.shield_down = 0;
            }
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
/// Bras réparateurs : rayon (cases).
const REPAIR_RANGE: i32 = 10;
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
}
crate::ser_struct!(Ark { unit, out, hold, ax, ay, rest, turrets, queue, prog, paid, boost_until, boost_ready, dock });

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
    update_turrets(w, i, s, left);
    update_dock(w, i, s, left);
    if mods == 0 || carried {
        return;
    }
    if at(mods, SLOT_DECK) == M_WORKSHOP && w.units.cold[s].stun == 0 {
        update_workshop(w, i, s);
    }
    if has(mods, M_REPAIR) && w.tick.is_multiple_of(20) {
        repair(w, s);
    }
    if has(mods, M_SPUR) && moving {
        spur(w, s);
    }
}

/// Poste de la tourelle `k` sur `n` autour de l'Arche `s` : en couronne, la première vers l'avant.
fn post(w: &World, s: usize, k: usize, n: usize) -> (i32, i32) {
    let r = TILE
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
    let (ax, ay, ar) = (w.units.x[s], w.units.y[s], udef(U_ARK).radius);
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
        match t.state {
            TU_ABOARD => {
                if t.hp < 1000 && w.tick.is_multiple_of(20) {
                    t.hp = (t.hp + TURRET_HEAL).min(1000);
                }
                let a = &w.arks[i];
                let ready = a.out && a.rest >= REST_TURRETS && !carried && t.hp >= TURRET_FIT;
                if t.want != t.kind {
                    t.state = TU_CONVERT;
                    t.timer = TURRET_CONVERT;
                } else if ready && !launched && w.players[owner as usize].unit_count < UNIT_CAP {
                    launched = true;
                    let (px, py) = post(w, s, k, n);
                    let d = dist(ax, ay, px, py).max(1);
                    let (ox, oy) = (ax + (px - ax) * ar.min(d) / d, ay + (py - ay) * ar.min(d) / d);
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
                        let near = dist(w.units.x[u], w.units.y[u], ax, ay) <= ar + TILE * 3 / 2;
                        if near || t.timer >= RETURN_MAX {
                            t.hp = embark(w, u);
                            t.unit = NONE;
                            t.state = TU_ABOARD;
                            t.timer = 0;
                        } else if idle || w.tick.is_multiple_of(10) {
                            crate::units::clear_orders(w, u);
                            w.units.cold[u].orders.push(Order::Move { x: ax, y: ay, gx: ax, gy: ay, attack: false, pace: 0, wait: 0 });
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
                } else if !rebuilding && !carried && w.tick.is_multiple_of(10) && pay(w, owner, ax, ay, udef(TURRET_KINDS[t.kind as usize % 3]).cost) {
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
    }
    let need = factory_ticks(kind) * 100;
    w.arks[i].prog = (w.arks[i].prog + w.players[p as usize].build_mult.max(0) as u32 * WORKSHOP_PCT / 100).min(need);
    if w.arks[i].prog < need || full {
        return;
    }
    w.arks[i].prog = 0;
    w.arks[i].paid = false;
    // l'unité sort à l'arrière de l'Arche
    let a = w.units.facing[s].wrapping_add(32768);
    let r = udef(U_ARK).radius + udef(kind).radius + TILE / 2;
    let x = w.units.x[s] + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32;
    let y = w.units.y[s] + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32;
    let (mx, my) = (w.map.w * TILE - 1, w.map.h * TILE - 1);
    let (fx, fy) = buildings::free_spot_near(w, x.clamp(0, mx), y.clamp(0, my), crate::units::pass_mask(udef(kind).layer));
    let id = w.spawn_unit(kind, p, fx, fy);
    w.units.facing[slot_of(id)] = w.units.facing[s];
    let q = &mut w.arks[i].queue;
    q[0].1 = q[0].1.saturating_sub(1);
    if q[0].1 == 0 {
        q.remove(0);
    }
}

/// Groupe électrogène : posé à côté de l'Arche au repos, rembarqué quand elle part (ou change de soutien).
fn update_dock(w: &mut World, i: usize, s: usize, left: bool) {
    let on = has(w.units.cold[s].mods, M_DYNAMO);
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

/// Bras réparateurs : unités et modules du joueur à moins de REPAIR_RANGE cases, 1 % par seconde.
fn repair(w: &mut World, s: usize) {
    let (x, y, owner) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
    let r = REPAIR_RANGE * TILE;
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
    let r = udef(U_ARK).radius;
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
            let (slot, wi) = if m == M_BASTION_LONG { (0, W_BASTION_LONG as i32) } else { mod_weapon(d.host, m).map_or((0, -1), |(k, wi)| (k, wi as i32)) };
            let radar = match m {
                M_RADAR => ARK_RADAR,
                M_TRACKER_RADAR => TRACKER_RADAR,
                _ => 0,
            };
            let mut cost: Vec<String> = d.cost.iter().map(|&(it, n)| format!("[{},{}]", it, n)).collect();
            if d.releves > 0 {
                cost.push(format!("[{},{}]", RELEVES, d.releves));
            }
            let host = if d.host == NO_KIND { -1 } else { d.host as i32 };
            format!(
                "{{\"key\":{},\"name\":{},\"desc\":{},\"icon\":{},\"host\":{},\"slot\":{},\"rank\":{},\"base\":{},\"tech\":{},\"cost\":[{}],\"time\":{},\"weapon\":[{},{}],\"radar\":{}}}",
                js(d.key), js(d.name), js(d.desc), js(d.icon), host, d.slot, d.rank, d.base, d.tech, cost.join(","), d.time, slot, wi, radar
            )
        })
        .collect();
    let slot = |s: &(&str, &str, &str)| format!("{{\"key\":{},\"name\":{},\"icon\":{}}}", js(s.0), js(s.1), js(s.2));
    let slots: Vec<String> = ARK_SLOTS.iter().map(slot).collect();
    let tk: Vec<String> = TURRET_KINDS.iter().map(|k| k.to_string()).collect();
    format!("\"mods\":[{}],\"arkSlots\":[{}],\"oneSlot\":{},\"turretKinds\":[{}]", list.join(","), slots.join(","), slot(&ONE_SLOT), tk.join(","))
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
    let n = if kind == U_ARK { ARK_SLOTS.len() } else { 1 };
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
    format!("{{\"host\":{},\"mods\":[{}],\"job\":{},\"left\":{},\"total\":{},\"reach\":[{}],\"ark\":{}}}", kind, list.join(","), job, left, total, reach.join(","), ark)
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
    let need = a.queue.first().map_or(1, |e| factory_ticks(e.0) * 100).max(1);
    let (sr, sh) = unit_shield(w, s);
    format!(
        "{{\"turrets\":[{}],\"out\":{},\"hold\":{},\"queue\":[{}],\"prog\":{},\"paid\":{},\"boost\":{},\"boostReady\":{},\"shieldR\":{},\"shieldMax\":{},\"dock\":{},\"cap\":{}}}",
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
        store_cap(w, s)
    )
}
