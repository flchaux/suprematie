//! Table des améliorations des Transhumants : emplacements, effets, coûts (voir ameliorations.rs). L'indice d'une
//! amélioration est sauvegardé : toute nouvelle amélioration va à la fin.

use crate::data::*;

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
/// Emplacements d'une unité de combat.
pub const SLOT_FRAME: u8 = 1;
pub const SLOT_KIT: u8 = 2;
pub const UNIT_SLOTS: [(&str, &str, &str); 3] = [("arm", "Arme", "mod_gun"), ("frame", "Châssis", "mod_engine"), ("kit", "Équipement", "mod_fit")];
/// Emplacements d'un module (et de son chenillard).
pub const SLOT_SPEC: u8 = 1;
pub const MODULE_SLOTS: [(&str, &str, &str); 2] = [("yield", "Rendement", "mod_fast"), ("spec", "Spécialité", "mod_fit")];
/// Troisième emplacement du générateur nomade (et de son chenillard) : lignes (poteaux relais en plus).
pub const SLOT_LINES: u8 = 2;
pub const GEN_SLOTS: [(&str, &str, &str); 3] = [MODULE_SLOTS[0], MODULE_SLOTS[1], ("lines", "Lignes", "energy")];
/// Emplacement unique d'un chariot de convoi.
pub const ONE_SLOT: (&str, &str, &str) = ("fit", "Aménagement", "mod_fit");

/// Emplacements du chariot bouclier : émetteur (rayon, ou bulle réfléchissante), accumulateurs (points), régénérateurs (recharge).
pub const SHIELD_SLOTS: [(&str, &str, &str); 3] = [("emitter", "Émetteur", "mod_shield"), ("cells", "Accumulateurs", "mod_cells"), ("regen", "Régénérateurs", "mod_fast")];

/// Emplacements d'un porteur (type d'unité ; pour un module : son chenillard).
pub fn slots(host: u16) -> &'static [(&'static str, &'static str, &'static str)] {
    if host == U_ARK {
        &ARK_SLOTS
    } else if host == U_T_CART {
        std::slice::from_ref(&ONE_SLOT)
    } else if host == U_SHIELD_CART {
        &SHIELD_SLOTS
    } else if host == U_CH_GENERATOR {
        &GEN_SLOTS
    } else if udef(host).deploys != NO_KIND {
        &MODULE_SLOTS
    } else {
        &UNIT_SLOTS
    }
}

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
    // effets d'une unité, additionnés d'un emplacement à l'autre (l'Arche a ses propres règles) :
    /// vitesse (%), dégâts subis en moins (%), points de vie regagnés par seconde (‰)
    pub speed: i16,
    pub armor: i16,
    pub regen: u16,
    /// radar, vision (cases ; 0 : ceux de l'unité), bouclier (rayon en cases, points)
    pub radar: i16,
    pub vision: i16,
    pub shield: (i32, i32),
    /// camouflée à l'arrêt (voir ameliorations::hidden), butin (% de plus), déploiement et repli deux fois plus rapides
    pub cloak: bool,
    pub loot: u16,
    pub quick: bool,
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
/// Radar (cases) de l'Arche.
pub const ARK_RADAR: i32 = 70;
/// Radar (cases) du laboratoire nomade à antenne.
pub const LAB_RADAR: i32 = 40;
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
// unités, suite : arme, châssis, équipement
pub const M_TRACKER_GUN: u8 = 56;
pub const M_TRACKER_ROCKET: u8 = 57;
pub const M_TRACKER_PLATE: u8 = 58;
pub const M_TRACKER_NET: u8 = 59;
pub const M_TRACKER_SCOPE: u8 = 60;
pub const M_RIDER_LONG: u8 = 61;
pub const M_RIDER_FLAME: u8 = 62;
pub const M_RIDER_ENGINE: u8 = 63;
pub const M_RIDER_REPAIR: u8 = 64;
pub const M_RIDER_LOOT: u8 = 65;
pub const M_HARROW_MISSILE: u8 = 66;
pub const M_HARROW_PLATE: u8 = 67;
pub const M_HARROW_ENGINE: u8 = 68;
pub const M_HARROW_RADAR: u8 = 69;
pub const M_HARROW_SHIELD: u8 = 70;
pub const M_GUN_FAST: u8 = 71;
pub const M_GUN_PLATE: u8 = 72;
pub const M_GUN_ENGINE: u8 = 73;
pub const M_GUN_NET: u8 = 74;
pub const M_GUN_SPOTTER: u8 = 75;
pub const M_RAM_SAW: u8 = 76;
pub const M_RAM_FLAME: u8 = 77;
pub const M_RAM_ENGINE: u8 = 78;
pub const M_RAM_REPAIR: u8 = 79;
pub const M_RAM_SHIELD: u8 = 80;
// modules, suite : spécialité
pub const M_DRILL_QUICK: u8 = 81;
pub const M_DRILL_DEEP: u8 = 82;
pub const M_FURNACE_QUICK: u8 = 83;
pub const M_FURNACE_LEAN: u8 = 84;
pub const M_ASM_LEAN: u8 = 85;
pub const M_ASM_ARMOR: u8 = 86;
pub const M_REF_LEAN: u8 = 87;
pub const M_REF_ARMOR: u8 = 88;
pub const M_GEN_TANK: u8 = 89;
/// (indice des anciens « Câbles longs », de la spécialité : voir ameliorations::convert_gen_poles)
pub const M_GEN_LINES1: u8 = 90;
pub const M_HOLD_CRANE: u8 = 91;
pub const M_HOLD_QUICK: u8 = 92;
pub const M_LAB_ANTENNA: u8 = 93;
pub const M_LAB_QUICK: u8 = 94;
pub const M_SHOP_REPAIR: u8 = 95;
pub const M_SHOP_QUICK: u8 = 96;
pub const M_BASTION_FLAK: u8 = 97;
pub const M_BASTION_ARMOR: u8 = 98;
// robots : Mâtin et Berger (voir troupeau.rs)
pub const M_MASTIFF_CRUSHER: u8 = 99;
pub const M_MASTIFF_GUN: u8 = 100;
pub const M_MASTIFF_GRAPPLE: u8 = 101;
pub const M_MASTIFF_LEAP: u8 = 102;
pub const M_MASTIFF_PLATE: u8 = 103;
pub const M_MASTIFF_SLAT: u8 = 104;
pub const M_MASTIFF_SENSORS: u8 = 105;
pub const M_MASTIFF_SHOCK: u8 = 106;
pub const M_MASTIFF_NANITES: u8 = 107;
pub const M_SHEPHERD_ARC: u8 = 108;
pub const M_SHEPHERD_MORTAR: u8 = 109;
pub const M_SHEPHERD_PLASMA: u8 = 110;
pub const M_SHEPHERD_LEGS: u8 = 111;
pub const M_SHEPHERD_PLATE: u8 = 112;
pub const M_SHEPHERD_REACTIVE: u8 = 113;
pub const M_SHEPHERD_RELAY: u8 = 114;
pub const M_SHEPHERD_BAY: u8 = 115;
pub const M_SHEPHERD_SHIELD: u8 = 116;
// chariot bouclier (voir bouclier.rs) : émetteur, accumulateurs, régénérateurs
pub const M_SC_WIDE1: u8 = 117;
pub const M_SC_WIDE2: u8 = 118;
pub const M_SC_WIDE3: u8 = 119;
pub const M_SC_MIRROR: u8 = 120;
pub const M_SC_CELLS1: u8 = 121;
pub const M_SC_CELLS2: u8 = 122;
pub const M_SC_CELLS3: u8 = 123;
pub const M_SC_REGEN1: u8 = 124;
pub const M_SC_REGEN2: u8 = 125;
// générateur nomade : lignes, second palier
pub const M_GEN_LINES2: u8 = 126;

/// Valeurs communes à toutes les améliorations (premier palier, sans recherche).
const MD: ModDef = ModDef {
    key: "none",
    name: "Rien",
    desc: "",
    icon: "",
    host: NO_KIND,
    slot: 0,
    rank: 1,
    base: 0,
    tech: 0,
    cost: &[],
    releves: 0,
    time: 0,
    speed: 0,
    armor: 0,
    regen: 0,
    radar: 0,
    vision: 0,
    shield: (0, 0),
    cloak: false,
    loot: 0,
    quick: false,
};

/// `md!(porteur, emplacement, clé, nom, icône, recherche, durée, relevés, [coût], effet)`, puis, pour un palier, son rang
/// et le palier précédent, ou après un « ; » les effets portés par la table (`speed: 40`…)
macro_rules! md {
    ($host:expr, $slot:expr, $key:expr, $name:expr, $icon:expr, $tech:expr, $time:expr, $rel:expr, [$($c:expr),*], $desc:expr; $($f:ident: $v:expr),+) => {
        ModDef { $($f: $v,)+ ..md!($host, $slot, $key, $name, $icon, $tech, $time, $rel, [$($c),*], $desc) }
    };
    ($host:expr, $slot:expr, $key:expr, $name:expr, $icon:expr, $tech:expr, $time:expr, $rel:expr, [$($c:expr),*], $desc:expr) => {
        ModDef { key: $key, name: $name, desc: $desc, icon: $icon, host: $host, slot: $slot, tech: $tech, cost: &[$($c),*], releves: $rel, time: $time, ..MD }
    };
    ($host:expr, $slot:expr, $key:expr, $name:expr, $icon:expr, $tech:expr, $time:expr, $rel:expr, [$($c:expr),*], $desc:expr, $rank:expr, $base:expr) => {
        ModDef { rank: $rank, base: $base, ..md!($host, $slot, $key, $name, $icon, $tech, $time, $rel, [$($c),*], $desc) }
    };
}

/// Les améliorations ; l'indice est sauvegardé : toute nouvelle amélioration va à la fin.
#[rustfmt::skip]
pub const MODS: [ModDef; 127] = [
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
    md!(U_T_CART, 0, "cart_fast", "Attelage léger", "mod_engine", T_T_FITTINGS, 8, 2, [(IRON_PLATE, 6), (GEAR, 4)], "Vitesse +60 %."; speed: 60),
    md!(U_TRACKER, SLOT_KIT, "tracker_radar", "Mât radar", "mod_radar", T_T_GEAR, 10, 4, [(COPPER_PLATE, 8), (CIRCUIT, 3)], "Radar de 45 cases."; radar: 45),
    md!(U_TRACKER, SLOT_FRAME, "tracker_turbo", "Turbo", "mod_engine", T_T_GEAR, 10, 4, [(GEAR, 4), (IRON_PLATE, 6)], "Vitesse +40 %."; speed: 40),
    md!(U_RIDER, 0, "rider_twin", "Canons jumelés", "mod_gun", T_T_GEAR, 12, 4, [(STEEL, 3), (GEAR, 2)], "Cadence de tir +55 %."),
    md!(U_RIDER, SLOT_FRAME, "rider_plate", "Blindage d'appoint", "mod_plate", T_T_GEAR, 12, 4, [(STEEL, 4)], "Dégâts subis −30 %."; armor: 30),
    md!(U_HARROW, 0, "harrow_long", "Viseur longue portée", "mod_flak", T_T_GEAR, 12, 4, [(CIRCUIT, 4), (GEAR, 2)], "Portée 38 cases au lieu de 28."),
    md!(U_HARROW, 0, "harrow_mixed", "Affût mixte", "mod_gun", T_T_GEAR, 12, 4, [(STEEL, 3), (AMMO, 2)], "Tire aussi au sol ; portée 24 cases au lieu de 28, dégâts −20 %."),
    md!(U_TOWED_GUN, 0, "gun_long", "Tube allongé", "mod_gun", T_T_GEAR, 15, 6, [(STEEL, 5), (GEAR, 2)], "Portée 54 cases au lieu de 40."),
    md!(U_TOWED_GUN, 0, "gun_cluster", "Obus à grappe", "mod_rockets", T_T_GEAR, 15, 6, [(STEEL, 3), (AMMO, 4)], "Trois obus dispersés de 72 dégâts en zone au lieu d'un de 144."),
    md!(U_RAM, SLOT_FRAME, "ram_plate", "Proue blindée", "mod_plate", T_T_GEAR, 15, 6, [(STEEL, 8)], "Dégâts subis −35 %."; armor: 35),
    md!(U_RAM, SLOT_KIT, "ram_hook", "Grappins", "mod_loot", T_T_GEAR, 15, 6, [(STEEL, 4), (GEAR, 4)], "Butin doublé sur ce qu'il détruit, vitesse +20 %."; speed: 20, loot: 100),
    // ----- unités, suite -----
    md!(U_TRACKER, SLOT_ARM, "tracker_gun", "Mitrailleuse lourde", "mod_gun", T_T_GEAR, 10, 4, [(STEEL, 2), (GEAR, 2)], "Dégâts doublés, portée 14 cases au lieu de 12."),
    md!(U_TRACKER, SLOT_ARM, "tracker_rocket", "Nacelles de roquettes", "mod_rockets", T_T_GEAR, 12, 4, [(STEEL, 3), (AMMO, 2)], "Remplace la mitrailleuse : 4 roquettes toutes les 2,5 s, portée 22 cases."),
    md!(U_TRACKER, SLOT_FRAME, "tracker_plate", "Caisse blindée", "mod_plate", T_T_GEAR, 10, 4, [(STEEL, 3)], "Dégâts subis −35 %, vitesse −10 %."; armor: 35, speed: -10),
    md!(U_TRACKER, SLOT_KIT, "tracker_net", "Filet de camouflage", "mod_jammer", T_T_RECON, 10, 4, [(COPPER_PLATE, 6), (CIRCUIT, 2)], "Invisible après 3 s à l'arrêt, tant qu'il ne tire pas."; cloak: true),
    md!(U_TRACKER, SLOT_KIT, "tracker_scope", "Optique longue portée", "mod_radar", T_T_GEAR, 10, 4, [(COPPER_PLATE, 6), (GEAR, 2)], "Vision de 55 cases au lieu de 40."; vision: 55),
    md!(U_RIDER, SLOT_ARM, "rider_long", "Canon long", "mod_gun", T_T_GEAR, 12, 4, [(STEEL, 4), (GEAR, 1)], "Portée 28 cases au lieu de 20, dégâts 112 au lieu de 80, cadence −29 %."),
    md!(U_RIDER, SLOT_ARM, "rider_flame", "Lance-flammes", "mod_flame", T_T_GEAR, 12, 4, [(IRON_PLATE, 12), (COPPER_PLATE, 6)], "Remplace le canon : 177 dégâts/s en zone, portée 8 cases, +50 % contre le vivant."),
    md!(U_RIDER, SLOT_FRAME, "rider_engine", "Moteur surcompressé", "mod_engine", T_T_GEAR, 12, 4, [(GEAR, 4), (IRON_PLATE, 6)], "Vitesse +35 %."; speed: 35),
    md!(U_RIDER, SLOT_KIT, "rider_repair", "Bras de réparation", "mod_repair", T_T_GEAR, 10, 4, [(GEAR, 2), (CIRCUIT, 2)], "Regagne 1 % de ses points de vie par seconde."; regen: 10),
    md!(U_RIDER, SLOT_KIT, "rider_loot", "Caissons de récupération", "mod_loot", T_T_GEAR, 10, 4, [(GEAR, 3)], "Butin +50 % sur ce qu'il détruit."; loot: 50),
    md!(U_HARROW, SLOT_ARM, "harrow_missile", "Missiles", "mod_rockets", T_T_GEAR, 12, 4, [(STEEL, 3), (CIRCUIT, 3)], "Salve de 4 missiles toutes les 2,2 s, portée 34 cases au lieu de 28."),
    md!(U_HARROW, SLOT_FRAME, "harrow_plate", "Blindage d'appoint", "mod_plate", T_T_GEAR, 12, 4, [(STEEL, 4)], "Dégâts subis −30 %."; armor: 30),
    md!(U_HARROW, SLOT_FRAME, "harrow_engine", "Moteur surcompressé", "mod_engine", T_T_GEAR, 12, 4, [(GEAR, 4), (IRON_PLATE, 6)], "Vitesse +35 %."; speed: 35),
    md!(U_HARROW, SLOT_KIT, "harrow_radar", "Radar de veille", "mod_radar", T_T_GEAR, 10, 4, [(COPPER_PLATE, 8), (CIRCUIT, 3)], "Radar de 40 cases."; radar: 40),
    md!(U_HARROW, SLOT_KIT, "harrow_shield", "Bulle légère", "mod_shield", T_T_BUBBLE, 15, 6, [(STEEL, 4), (CIRCUIT, 6)], "Bulle de 4 cases, 400 points."; shield: (4, 400)),
    md!(U_TOWED_GUN, SLOT_ARM, "gun_fast", "Chargeur", "mod_fast", T_T_GEAR, 15, 6, [(GEAR, 6), (AMMO, 2)], "Cadence +60 %, dégâts 128 au lieu de 144."),
    md!(U_TOWED_GUN, SLOT_FRAME, "gun_plate", "Bouclier d'affût", "mod_plate", T_T_GEAR, 12, 4, [(STEEL, 5)], "Dégâts subis −35 %."; armor: 35),
    md!(U_TOWED_GUN, SLOT_FRAME, "gun_engine", "Tracteur lourd", "mod_engine", T_T_GEAR, 12, 4, [(GEAR, 5), (IRON_PLATE, 8)], "Vitesse +40 %, mise en batterie deux fois plus rapide."; speed: 40, quick: true),
    md!(U_TOWED_GUN, SLOT_KIT, "gun_net", "Filet de camouflage", "mod_jammer", T_T_RECON, 10, 4, [(COPPER_PLATE, 6), (CIRCUIT, 2)], "Invisible après 3 s à l'arrêt, tant qu'il ne tire pas."; cloak: true),
    md!(U_TOWED_GUN, SLOT_KIT, "gun_spotter", "Observateur", "mod_radar", T_T_GEAR, 10, 4, [(COPPER_PLATE, 8), (CIRCUIT, 3)], "Vision de 34 cases, radar de 45 cases."; vision: 34, radar: 45),
    md!(U_RAM, SLOT_ARM, "ram_saw", "Scies", "mod_spur", T_T_GEAR, 15, 6, [(STEEL, 6), (GEAR, 4)], "Éperonnage : 672 dégâts au lieu de 480."),
    md!(U_RAM, SLOT_ARM, "ram_flame", "Lance-flammes de proue", "mod_flame", T_T_GEAR, 15, 6, [(IRON_PLATE, 16), (COPPER_PLATE, 8)], "S'ajoute à l'éperon : 177 dégâts/s en zone, portée 7 cases."),
    md!(U_RAM, SLOT_FRAME, "ram_engine", "Moteur surcompressé", "mod_engine", T_T_GEAR, 15, 6, [(GEAR, 6), (IRON_PLATE, 10)], "Vitesse +30 %."; speed: 30),
    md!(U_RAM, SLOT_KIT, "ram_repair", "Bras de réparation", "mod_repair", T_T_GEAR, 12, 6, [(GEAR, 4), (CIRCUIT, 3)], "Regagne 1 % de ses points de vie par seconde."; regen: 10),
    md!(U_RAM, SLOT_KIT, "ram_shield", "Bulle d'assaut", "mod_shield", T_T_BUBBLE, 18, 8, [(STEEL, 6), (CIRCUIT, 8)], "Bulle de 4 cases, 800 points."; shield: (4, 800)),
    // ----- modules, suite : spécialité -----
    md!(U_CH_DRILL, SLOT_SPEC, "drill_quick", "Vérins rapides", "deploy", T_T_FITTINGS2, 20, 8, [(GEAR, 8), (IRON_PLATE, 10)], "Se déploie et se replie deux fois plus vite."; quick: true),
    md!(U_CH_DRILL, SLOT_SPEC, "drill_deep", "Sonde profonde", "mod_yield", T_T_FITTINGS2, 20, 8, [(STEEL, 8), (CIRCUIT, 3)], "Ne perd jamais plus de 30 % de débit, même sur un gisement usé."),
    md!(U_CH_FURNACE, SLOT_SPEC, "furnace_quick", "Vérins rapides", "deploy", T_T_FITTINGS2, 20, 8, [(GEAR, 8), (IRON_PLATE, 10)], "Se déploie et se replie deux fois plus vite."; quick: true),
    md!(U_CH_FURNACE, SLOT_SPEC, "furnace_lean", "Récupérateur de chaleur", "mod_lean", T_T_FITTINGS2, 20, 8, [(COPPER_PLATE, 16), (CIRCUIT, 3)], "Énergie −50 %."),
    md!(U_CH_ASSEMBLER, SLOT_SPEC, "asm_lean", "Établis sobres", "mod_lean", T_T_FITTINGS2, 20, 8, [(COPPER_PLATE, 16), (CIRCUIT, 3)], "Énergie −50 %."),
    md!(U_CH_ASSEMBLER, SLOT_SPEC, "asm_armor", "Caisson blindé", "mod_plate", T_T_FITTINGS2, 20, 8, [(STEEL, 16)], "Dégâts subis −50 %, déployé ou replié."; armor: 50),
    md!(U_CH_REFINERY, SLOT_SPEC, "ref_lean", "Échangeurs", "mod_lean", T_T_FITTINGS2, 25, 10, [(COPPER_PLATE, 20), (CIRCUIT, 4)], "Énergie −50 %."),
    md!(U_CH_REFINERY, SLOT_SPEC, "ref_armor", "Cuves blindées", "mod_plate", T_T_FITTINGS2, 25, 10, [(STEEL, 18)], "Dégâts subis −50 %, déployée ou repliée."; armor: 50),
    md!(U_CH_GENERATOR, SLOT_SPEC, "gen_tank", "Grands réservoirs", "mod_hold", T_T_FITTINGS2, 20, 8, [(IRON_PLATE, 24), (STEEL, 4)], "Réservoir de combustible triplé."),
    md!(U_CH_GENERATOR, SLOT_LINES, "gen_lines1", "Lignes I", "energy", T_T_FITTINGS, 20, 6, [(COPPER_PLATE, 20), (CIRCUIT, 2)], "Plante 6 poteaux relais au lieu de 3."),
    md!(U_CH_HOLD, SLOT_SPEC, "hold_crane", "Palan", "mod_fast", T_T_FITTINGS2, 25, 10, [(GEAR, 10), (STEEL, 6)], "Alimente les fabricants collés deux fois plus vite."),
    md!(U_CH_HOLD, SLOT_SPEC, "hold_quick", "Vérins rapides", "deploy", T_T_FITTINGS2, 25, 8, [(GEAR, 8), (IRON_PLATE, 10)], "Se déploie et se replie deux fois plus vite."; quick: true),
    md!(U_CH_LAB, SLOT_SPEC, "lab_antenna", "Antenne", "mod_radar", T_T_FITTINGS2, 25, 10, [(COPPER_PLATE, 20), (CIRCUIT, 6)], "Radar de 40 cases, déployé."),
    md!(U_CH_LAB, SLOT_SPEC, "lab_quick", "Vérins rapides", "deploy", T_T_FITTINGS2, 25, 8, [(GEAR, 8), (IRON_PLATE, 10)], "Se déploie et se replie deux fois plus vite."; quick: true),
    md!(U_CH_WORKSHOP, SLOT_SPEC, "shop_repair", "Cour de réparation", "mod_repair", T_T_FITTINGS2, 35, 12, [(STEEL, 12), (GEAR, 12)], "Déployé : +1 % de points de vie par seconde aux unités à 8 cases."),
    md!(U_CH_WORKSHOP, SLOT_SPEC, "shop_quick", "Vérins rapides", "deploy", T_T_FITTINGS2, 30, 10, [(GEAR, 14), (IRON_PLATE, 20)], "Se déploie et se replie deux fois plus vite."; quick: true),
    md!(U_CH_BASTION, SLOT_SPEC, "bastion_flak", "Affût antiaérien", "mod_flak", T_T_FITTINGS2, 30, 15, [(STEEL, 12), (CIRCUIT, 8)], "Tire aussi sur les avions."),
    md!(U_CH_BASTION, SLOT_SPEC, "bastion_armor", "Talus", "mod_plate", T_T_FITTINGS2, 30, 12, [(STEEL, 24)], "Dégâts subis −35 %, déployé ou replié."; armor: 35),
    // ----- Mâtin -----
    md!(U_MASTIFF, SLOT_ARM, "mastiff_crusher", "Mâchoires hydrauliques", "mod_jaw", T_T_GEAR, 12, 5, [(STEEL, 5), (GEAR, 3)], "Morsure : 256 dégâts au lieu de 144, un peu plus lente ; vise d'abord les bâtiments."),
    md!(U_MASTIFF, SLOT_ARM, "mastiff_gun", "Tourelle dorsale", "mod_gun", T_T_GEAR, 12, 5, [(STEEL, 4), (GEAR, 2), (AMMO, 2)], "S'ajoute aux mâchoires : 107 dégâts/s, portée 20 cases."),
    md!(U_MASTIFF, SLOT_ARM, "mastiff_grapple", "Grappin magnétique", "mod_hook", T_T_GEAR, 14, 6, [(STEEL, 4), (GEAR, 5)], "S'ajoute aux mâchoires : accroche à 14 cases et tire à lui une proie légère ; une proie lourde l'attire à elle."),
    md!(U_MASTIFF, SLOT_FRAME, "mastiff_leap", "Vérins de bond", "mod_piston", T_T_GEAR, 12, 5, [(STEEL, 3), (GEAR, 6)], "Vitesse +25 % ; bondit deux fois plus vite sur sa proie à moins de 8 cases."; speed: 25),
    md!(U_MASTIFF, SLOT_FRAME, "mastiff_plate", "Blindage lourd", "mod_plate", T_T_GEAR, 12, 5, [(STEEL, 8)], "Dégâts subis −35 %, vitesse −10 %."; armor: 35, speed: -10),
    md!(U_MASTIFF, SLOT_FRAME, "mastiff_slat", "Blindage-cage", "mod_reactive", T_T_GEAR, 12, 5, [(COPPER_PLATE, 12), (GEAR, 2)], "Dégâts des obus, missiles et bombes −60 %."),
    md!(U_MASTIFF, SLOT_KIT, "mastiff_sensors", "Capteurs multispectraux", "mod_radar", T_T_GEAR, 10, 4, [(COPPER_PLATE, 8), (CIRCUIT, 3)], "Radar de 30 cases ; repère à 14 cases ce qui est camouflé ou enterré."; radar: 30),
    md!(U_MASTIFF, SLOT_KIT, "mastiff_shock", "Coque électrifiée", "mod_shock", T_T_GEAR, 10, 4, [(STEEL, 4)], "Renvoie à l'agresseur la moitié des coups reçus au corps à corps."),
    md!(U_MASTIFF, SLOT_KIT, "mastiff_nanites", "Nanoréparateurs", "mod_repair", T_T_GEAR, 12, 6, [(COPPER_PLATE, 6), (CIRCUIT, 4)], "Lui et vos unités à moins de 5 cases regagnent 1 % de leurs points de vie par seconde."),
    // ----- Berger -----
    md!(U_SHEPHERD, SLOT_ARM, "shepherd_arc", "Arc paralysant", "mod_arc", T_T_GEAR, 40, 25, [(STEEL, 30), (CIRCUIT, 30), (COPPER_PLATE, 40)], "Remplace la décharge : 1 600 dégâts en zone, et paralyse 1,5 s ce qu'elle touche, géants exceptés."),
    md!(U_SHEPHERD, SLOT_ARM, "shepherd_mortar", "Mortier lourd", "mod_mortar", T_T_GEAR, 45, 30, [(STEEL, 50), (GEAR, 30), (AMMO, 20)], "S'ajoute à la décharge : obus de 1 040 dégâts en zone toutes les 4,75 s, portée 50 cases, pas à moins de 10."),
    md!(U_SHEPHERD, SLOT_ARM, "shepherd_plasma", "Lance-plasma", "mod_flame", T_T_GEAR, 45, 30, [(STEEL, 30), (COPPER_PLATE, 40), (PROCESSOR, 8)], "S'ajoute à la décharge : jet de 3 s, 1 060 dégâts/s, portée 26 cases, +50 % contre le vivant."),
    md!(U_SHEPHERD, SLOT_FRAME, "shepherd_legs", "Jambes télescopiques", "mod_legs", T_T_GEAR, 40, 25, [(STEEL, 40), (GEAR, 40)], "Vitesse +45 %, vision 48 cases au lieu de 36."; speed: 45, vision: 48),
    md!(U_SHEPHERD, SLOT_FRAME, "shepherd_plate", "Blindage lourd", "mod_plate", T_T_GEAR, 40, 25, [(IRON_PLATE, 120), (STEEL, 40)], "Dégâts subis −35 %, vitesse −10 %."; armor: 35, speed: -10),
    md!(U_SHEPHERD, SLOT_FRAME, "shepherd_reactive", "Blindage réactif", "mod_reactive", T_T_GEAR, 35, 20, [(STEEL, 40), (AMMO, 20)], "Dégâts des obus, missiles et bombes −60 %."),
    md!(U_SHEPHERD, SLOT_KIT, "shepherd_relay", "Relais de commandement", "mod_relay", T_T_GEAR, 30, 20, [(COPPER_PLATE, 60), (CIRCUIT, 20)], "Vos unités à moins de 18 cases vont 30 % plus vite, au lieu de 15 % à 12 cases."),
    md!(U_SHEPHERD, SLOT_KIT, "shepherd_bay", "Baie d'assemblage", "mod_workshop", T_T_GEAR, 45, 30, [(STEEL, 40), (GEAR, 30), (CIRCUIT, 20)], "Assemble un Mâtin toutes les 30 s, payé dans les réserves à 30 cases ; quatre à la fois au plus."),
    md!(U_SHEPHERD, SLOT_KIT, "shepherd_shield", "Projecteur de bouclier", "mod_shield", T_T_BUBBLE, 45, 35, [(STEEL, 30), (CIRCUIT, 40), (WAFER, 12)], "Bulle de 8 cases, 5 000 points. Brisée, elle revient après 10 s."; shield: (8, 5000)),
    // ----- chariot bouclier (bulle d'origine : 6 cases, 3 000 points, pleine en 30 s, revient 10 s après sa rupture) -----
    md!(U_SHIELD_CART, 0, "sc_wide1", "Émetteur élargi", "mod_shield", T_T_SHIELD_CART, 20, 6, [(COPPER_PLATE, 20), (CIRCUIT, 6)], "Bulle de 8 cases au lieu de 6."),
    md!(U_SHIELD_CART, 0, "sc_wide2", "Émetteur à grand champ", "mod_shield", T_T_BUBBLE2, 35, 15, [(STEEL, 8), (PROCESSOR, 4)], "Bulle de 10 cases.", 2, M_SC_WIDE1),
    md!(U_SHIELD_CART, 0, "sc_wide3", "Émetteur de couronne", "mod_shield", T_T_CROWN, 50, 30, [(STEEL, 12), (PROCESSOR, 8), (ENERGY_CELL, 2)], "Bulle de 12 cases.", 3, M_SC_WIDE2),
    md!(U_SHIELD_CART, 0, "sc_mirror", "Bulle réfléchissante", "mod_mirror", T_T_BUBBLE2, 30, 12, [(STEEL, 8), (CIRCUIT, 10)], "Renvoie au tireur 30 % des coups que la bulle arrête ; le rayon reste de 6 cases."),
    md!(U_SHIELD_CART, 1, "sc_cells1", "Accumulateurs", "mod_cells", T_T_SHIELD_CART, 20, 6, [(COPPER_PLATE, 16), (CIRCUIT, 6)], "Bulle de 5 000 points au lieu de 3 000."),
    md!(U_SHIELD_CART, 1, "sc_cells2", "Accumulateurs lourds", "mod_cells", T_T_BUBBLE2, 35, 15, [(STEEL, 10), (WAFER, 6)], "Bulle de 8 000 points.", 2, M_SC_CELLS1),
    md!(U_SHIELD_CART, 1, "sc_cells3", "Batterie de cellules", "mod_cells", T_T_CROWN, 50, 30, [(STEEL, 10), (ENERGY_CELL, 4)], "Bulle de 12 000 points.", 3, M_SC_CELLS2),
    md!(U_SHIELD_CART, 2, "sc_regen1", "Régénérateurs", "mod_fast", T_T_SHIELD_CART, 20, 6, [(COPPER_PLATE, 12), (GEAR, 6)], "Pleine en 18 s au lieu de 30 ; brisée, revient après 6 s au lieu de 10."),
    md!(U_SHIELD_CART, 2, "sc_regen2", "Régénérateurs rapides", "mod_fast", T_T_BUBBLE2, 35, 15, [(STEEL, 8), (PROCESSOR, 4)], "Pleine en 10 s ; brisée, revient après 3 s.", 2, M_SC_REGEN1),
    // ----- générateur nomade : lignes (palier I : indice 90, plus haut) -----
    md!(U_CH_GENERATOR, SLOT_LINES, "gen_lines2", "Lignes II", "energy", T_T_FITTINGS2, 30, 12, [(COPPER_PLATE, 40), (CIRCUIT, 6)], "Plante 12 poteaux relais.", 2, M_GEN_LINES1),
];
