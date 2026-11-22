//! Données du jeu : objets, recettes, bâtiments, unités, armes, recherches.
//! Les valeurs d'équilibrage sont provisoires (fixées pendant l'équilibrage).

use crate::fixed::TILE;

// ---------- Objets ----------
pub const IRON_ORE: u8 = 1;
pub const COPPER_ORE: u8 = 2;
pub const SILICON: u8 = 3;
pub const HYDROCARBON: u8 = 4;
pub const CRYSTAL: u8 = 5;
/// Geyser : « gisement » de vapeur (pas un objet), où seule une centrale géothermique se pose.
pub const GEYSER: u8 = 250;
pub const IRON_PLATE: u8 = 6;
pub const COPPER_PLATE: u8 = 7;
pub const STEEL: u8 = 8;
pub const WAFER: u8 = 9;
pub const GEAR: u8 = 10;
pub const CABLE: u8 = 11;
pub const CIRCUIT: u8 = 12;
pub const ENGINE: u8 = 13;
pub const AMMO: u8 = 14;
pub const PROCESSOR: u8 = 15;
pub const FUEL: u8 = 16;
pub const COMPOSITE: u8 = 17;
pub const REFINED_CRYSTAL: u8 = 18;
pub const ENERGY_CELL: u8 = 19;
pub const ARM_PART: u8 = 20;
pub const PACK1: u8 = 21;
/// Souche : sève et sels (réserve de chaque réseau de racines, voir souche.rs), ADN (recherche).
pub const SEVE: u8 = 27;
pub const SELS: u8 = 28;
pub const ADN: u8 = 29;
/// Transhumants : relevés (recherche par l'exploration, voir transhumants.rs).
pub const RELEVES: u8 = 30;
pub const NUM_ITEMS: usize = 31;
/// Nombre d'objets des sauvegardes d'avant les races (format 2 et moins) : les tableaux d'objets
/// sauvegardés n'avaient que ces cases (voir ser.rs).
pub const NUM_ITEMS_V2: usize = 27;

pub struct ItemDef {
    pub key: &'static str,
    pub name: &'static str,
    pub color: u32,
}

pub const ITEMS: [ItemDef; NUM_ITEMS] = [
    ItemDef { key: "none", name: "Rien", color: 0x000000 },
    ItemDef { key: "iron_ore", name: "Minerai de fer", color: 0x6b7a8f },
    ItemDef { key: "copper_ore", name: "Minerai de cuivre", color: 0xc0703a },
    ItemDef { key: "silicon", name: "Silicium", color: 0xd8d0b8 },
    ItemDef { key: "hydrocarbon", name: "Hydrocarbure", color: 0x2a2230 },
    ItemDef { key: "crystal", name: "Cristal", color: 0x66e0ff },
    ItemDef { key: "iron_plate", name: "Plaque de fer", color: 0xa8b4c4 },
    ItemDef { key: "copper_plate", name: "Plaque de cuivre", color: 0xe08a50 },
    ItemDef { key: "steel", name: "Acier", color: 0xdfe6ee },
    ItemDef { key: "wafer", name: "Plaquette de silicium", color: 0x7d7fa8 },
    ItemDef { key: "gear", name: "Engrenage", color: 0x8c96a3 },
    ItemDef { key: "cable", name: "Câble", color: 0xd9822b },
    ItemDef { key: "circuit", name: "Circuit", color: 0x3fa34d },
    ItemDef { key: "engine", name: "Moteur", color: 0x5a6470 },
    ItemDef { key: "ammo", name: "Munitions", color: 0xc9a227 },
    ItemDef { key: "processor", name: "Processeur", color: 0x2f6fd6 },
    ItemDef { key: "fuel", name: "Carburant", color: 0xe0c040 },
    ItemDef { key: "composite", name: "Composite", color: 0x4a4a58 },
    ItemDef { key: "refined_crystal", name: "Cristal raffiné", color: 0x9ff2ff },
    ItemDef { key: "energy_cell", name: "Cellule d'énergie", color: 0x7cf0a0 },
    ItemDef { key: "arm_part", name: "Bras (pièce)", color: 0xe6c84a },
    ItemDef { key: "pack1", name: "Données mécaniques", color: 0xd04040 },
    ItemDef { key: "pack2", name: "Données électroniques", color: 0x40b040 },
    ItemDef { key: "pack3", name: "Données militaires", color: 0x5a5a5a },
    ItemDef { key: "pack4", name: "Données avancées", color: 0x4060e0 },
    ItemDef { key: "pack5", name: "Données cristallines", color: 0x50e0e0 },
    ItemDef { key: "pack6", name: "Données orbitales", color: 0xf0f0f0 },
    ItemDef { key: "seve", name: "Sève", color: 0x7fc24a },
    ItemDef { key: "sels", name: "Sels", color: 0xd9d2c0 },
    ItemDef { key: "adn", name: "ADN", color: 0xc35bd6 },
    ItemDef { key: "releves", name: "Relevés", color: 0xe8b84a },
];

// ---------- Races ----------
/// Races jouables (voir docs/spec/races.md). Chaque bâtiment, unité et recherche appartient à une race ;
/// un joueur ne pose, ne produit et ne recherche que ceux de la sienne.
pub const RACE_INDUS: u8 = 0;
pub const RACE_SOUCHE: u8 = 1;
pub const RACE_TRANSH: u8 = 2;
pub const NUM_RACES: usize = 3;

pub struct RaceDef {
    pub key: &'static str,
    pub name: &'static str,
    pub desc: &'static str,
}

pub const RACES: [RaceDef; NUM_RACES] = [
    RaceDef { key: "industriels", name: "Industriels", desc: "Tapis, bras, fonderies et assembleurs, électricité par zones, laboratoires et lots de recherche." },
    RaceDef { key: "souche", name: "Souche", desc: "Base vivante : un réseau de racines met en commun sève et sels, les organes poussent seuls, la race évolue en digérant les cadavres." },
    RaceDef { key: "transhumants", name: "Transhumants", desc: "Industrie montée sur des chenillards qui se déploient pour produire et se replient pour partir ; recherche par l'exploration ; butin : un quart de ce qu'ils détruisent." },
];

// ---------- Recettes ----------
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Crafter {
    Furnace = 0,
    Assembler = 1,
    Refinery = 2,
    Chemical = 3,
}

pub struct RecipeDef {
    pub key: &'static str,
    pub crafter: Crafter,
    pub inputs: &'static [(u8, u8)],
    pub output: (u8, u8),
    pub time: u16, // ticks à vitesse 100
    pub tech: u8,
}

macro_rules! r {
    ($k:expr, $c:ident, [$($i:expr),*], $o:expr, $t:expr, $tech:expr) => {
        RecipeDef { key: $k, crafter: Crafter::$c, inputs: &[$($i),*], output: $o, time: $t, tech: $tech }
    };
}

/// Recherches qui débloquent des recettes (voir RECIPES)
pub const T_AUTOMATION: u8 = 1;
pub const T_ELECTRONICS: u8 = 4;
pub const T_CHEMISTRY: u8 = 9;

/// Recettes : celles de base (plaques, acier, engrenages, câbles, circuits, munitions, lots 1) sont
/// connues d'emblée ; les autres sont débloquées par une recherche (test : recipes_follow_the_tech_tree).
/// Carburant et composites restent libres : leur machine (raffinerie, usine chimique) est déjà verrouillée.
pub const RECIPES: [RecipeDef; 21] = [
    r!("iron_plate", Furnace, [(IRON_ORE, 1)], (IRON_PLATE, 1), 40, 0),
    r!("copper_plate", Furnace, [(COPPER_ORE, 1)], (COPPER_PLATE, 1), 40, 0),
    r!("steel", Furnace, [(IRON_PLATE, 5)], (STEEL, 1), 160, 0),
    r!("wafer", Furnace, [(SILICON, 1)], (WAFER, 1), 60, T_ELECTRONICS),
    r!("gear", Assembler, [(IRON_PLATE, 2)], (GEAR, 1), 20, 0),
    r!("cable", Assembler, [(COPPER_PLATE, 1)], (CABLE, 2), 10, 0),
    r!("circuit", Assembler, [(IRON_PLATE, 1), (CABLE, 3)], (CIRCUIT, 1), 20, 0),
    r!("engine", Assembler, [(STEEL, 1), (GEAR, 2)], (ENGINE, 1), 100, T_ELECTRONICS),
    r!("ammo", Assembler, [(STEEL, 1), (COPPER_PLATE, 2)], (AMMO, 2), 60, 0),
    r!("processor", Assembler, [(CIRCUIT, 2), (WAFER, 1)], (PROCESSOR, 1), 120, T_ELECTRONICS),
    r!("arm_part", Assembler, [(CIRCUIT, 1), (GEAR, 1), (IRON_PLATE, 1)], (ARM_PART, 1), 20, T_AUTOMATION),
    r!("pack1", Assembler, [(GEAR, 1), (COPPER_PLATE, 1)], (PACK1, 1), 100, 0),
    r!("pack2", Assembler, [(CIRCUIT, 1), (ARM_PART, 1)], (PACK1 + 1, 1), 120, T_AUTOMATION),
    r!("pack3", Assembler, [(AMMO, 1), (STEEL, 1)], (PACK1 + 2, 1), 200, T_ELECTRONICS),
    r!("pack4", Assembler, [(PROCESSOR, 1), (COMPOSITE, 1)], (PACK1 + 3, 2), 280, T_CHEMISTRY),
    r!("pack5", Assembler, [(REFINED_CRYSTAL, 1), (PROCESSOR, 1)], (PACK1 + 4, 2), 280, T_CRYSTAL_REFINING),
    r!("pack6", Assembler, [(ENERGY_CELL, 1), (COMPOSITE, 1), (PROCESSOR, 1)], (PACK1 + 5, 3), 420, T_CRYSTAL_REFINING),
    r!("fuel", Refinery, [(HYDROCARBON, 2)], (FUEL, 1), 40, 0),
    r!("refined_crystal", Refinery, [(CRYSTAL, 2)], (REFINED_CRYSTAL, 1), 100, T_CRYSTAL_REFINING),
    r!("composite", Chemical, [(FUEL, 2), (STEEL, 1)], (COMPOSITE, 1), 120, 0),
    r!("energy_cell", Assembler, [(REFINED_CRYSTAL, 1), (PROCESSOR, 2)], (ENERGY_CELL, 1), 200, T_CRYSTAL_REFINING),
];
pub const RECIPE_NONE: u8 = 255;

/// Recette de fonderie qui fond la ressource brute `raw` (minerai de fer, de cuivre, silicium) : la
/// seule recette de fonderie dont l'unique ingrédient est cette ressource. Sert à la récolte du
/// commandant (fonderie intégrée). Hydrocarbure et cristal n'en ont pas (raffinerie).
pub fn smelt_recipe(raw: u8) -> Option<usize> {
    if raw == 0 || raw > CRYSTAL {
        return None;
    }
    RECIPES.iter().position(|r| r.crafter == Crafter::Furnace && r.inputs.len() == 1 && r.inputs[0].0 == raw)
}

/// Stock d'un dépôt : plafond de chaque objet, par niveau (l'entrepôt d'équipe a celui du niveau 1).
pub const DEPOT_CAP: [i32; 2] = [600, 2000];
/// Ressources de départ, dans le dépôt posé à côté du générateur principal.
pub const START_ITEMS: &[(u8, u16)] = &[(IRON_PLATE, 300), (COPPER_PLATE, 150), (STEEL, 20), (GEAR, 40), (CIRCUIT, 20)];
/// Drones de ravitaillement (voir drones.rs) : objets par voyage, vitesse (sous-unités par tick).
pub const DRONE_CAP: u16 = 10;
pub const DRONE_SPEED: i32 = 16 * 256 / 20;
/// Usines d'unités : drones et rayon de ravitaillement (cases).
pub const FACTORY_DRONES: u8 = 4;
pub const FACTORY_SUPPLY: i32 = 30;
/// Générateurs à combustible : drones (rayon : NEAR_SUPPLY).
pub const GENERATOR_DRONES: u8 = 1;
/// Rayon (cases) des paiements immédiats, du collecteur de surplus et de l'affichage « à portée ».
pub const NEAR_SUPPLY: i32 = 30;
/// Amélioration d'un dépôt (plus haut, plus grand) : coût, recherche, durée (secondes).
pub const DEPOT_UPGRADE_COST: &[(u8, u16)] = &[(STEEL, 20), (GEAR, 10), (CIRCUIT, 6)];
pub const DEPOT_UPGRADE_TECH: u8 = T_AUTOMATION;
pub const DEPOT_UPGRADE_TIME: u16 = 20;
/// Objets filtrés au plus en sortie d'un dépôt amélioré.
pub const MAX_FILTERS: usize = 4;

/// Niveaux d'un extracteur (amélioration sur place) : vitesse et consommation en % du niveau 0,
/// coût de passage à ce niveau et recherche requise.
pub struct ExtractorLevel {
    pub speed: u32,
    pub power: i32,
    pub cost: &'static [(u8, u16)],
    pub tech: u8,
    /// durée de l'amélioration vers ce niveau (secondes) : le bâtiment ne travaille pas pendant ce temps
    pub time: u16,
}
pub const EXTRACTOR_LEVELS: [ExtractorLevel; 3] = [
    ExtractorLevel { speed: 100, power: 100, cost: &[], tech: 0, time: 0 },
    ExtractorLevel { speed: 160, power: 140, cost: &[(STEEL, 10), (GEAR, 8), (CIRCUIT, 4)], tech: T_AUTOMATION, time: 20 },
    ExtractorLevel { speed: 230, power: 190, cost: &[(STEEL, 20), (ENGINE, 4), (PROCESSOR, 2)], tech: T_ELECTRONICS, time: 30 },
];

/// Niveaux d'une fonderie (amélioration sur place, comme l'extracteur) : vitesse et consommation en %
/// du modèle de base, coût de passage, recherche et durée. Ils suivent ceux de l'extracteur : une
/// fonderie améliorée suit le minerai d'un extracteur du même niveau.
pub const FURNACE_LEVELS: [ExtractorLevel; 3] = [
    ExtractorLevel { speed: 100, power: 100, cost: &[], tech: 0, time: 0 },
    ExtractorLevel { speed: 160, power: 140, cost: &[(STEEL, 8), (GEAR, 6), (CIRCUIT, 4)], tech: T_AUTOMATION, time: 20 },
    ExtractorLevel { speed: 230, power: 190, cost: &[(STEEL, 16), (ENGINE, 3), (PROCESSOR, 2)], tech: T_ELECTRONICS, time: 30 },
];

/// Niveaux d'un générateur (amélioration sur place) : production (kW), coût de passage à ce niveau,
/// recherche requise et durée (secondes, sans production pendant ce temps).
pub struct GeneratorLevel {
    pub prod: i32,
    pub cost: &'static [(u8, u16)],
    pub tech: u8,
    pub time: u16,
}
pub const GENERATOR_LEVELS: [GeneratorLevel; 3] = [
    GeneratorLevel { prod: 400, cost: &[], tech: 0, time: 0 },
    GeneratorLevel { prod: 650, cost: &[(STEEL, 8), (GEAR, 6), (CIRCUIT, 4)], tech: T_AUTOMATION, time: 15 },
    GeneratorLevel { prod: 1000, cost: &[(STEEL, 16), (ENGINE, 3), (CIRCUIT, 6)], tech: T_ELECTRONICS, time: 25 },
];

/// Niveaux du générateur principal (amélioration sur place) : rayon de sa zone (`supply`, cases autour
/// de l'emprise) et portée de liaison (`connect`), coût de passage, recherche et durée (secondes). La
/// production ne change pas (1 500 kW) et, contrairement aux autres générateurs, il reste en service
/// pendant le chantier : c'est le cœur de la base. Niveau 1 : zone et liaison +50 % (18 → 27, 30 → 45).
/// Coût élevé, presque deux fois le générateur principal lui-même (≈ 475 plaques de fer et 60 de
/// cuivre une fois tout fondu et assemblé) : un investissement de milieu de partie, au même palier
/// (électronique) que le niveau 3 des générateurs, qui ouvre l'accès aux gisements de l'anneau
/// (voir map::RING_KINDS) sans relais.
pub struct MainGeneratorLevel {
    pub supply: i32,
    pub connect: i32,
    pub cost: &'static [(u8, u16)],
    pub tech: u8,
    pub time: u16,
}
pub const MAIN_GENERATOR_LEVELS: [MainGeneratorLevel; 2] = [
    MainGeneratorLevel { supply: 18, connect: 30, cost: &[], tech: 0, time: 0 },
    MainGeneratorLevel { supply: 27, connect: 45, cost: &[(STEEL, 60), (ENGINE, 15), (CIRCUIT, 40)], tech: T_ELECTRONICS, time: 60 },
];

/// Améliorations des assembleurs sur place : (type actuel, type visé, durée en secondes). Le coût et la
/// recherche sont ceux du bâtiment visé ; la recette, le stock et la production en cours sont gardés.
pub const ASSEMBLER_UPGRADES: [(u16, u16, u16); 2] = [(B_ASSEMBLER1, B_ASSEMBLER1 + 1, 20), (B_ASSEMBLER1 + 1, B_ASSEMBLER1 + 2, 30)];

// ---------- Armes ----------
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Proj {
    Bullet = 0,
    Shell = 1,
    Missile = 2,
    Bomb = 3,
    Torpedo = 4,
    Beam = 5,
    Plasma = 6,
    Ion = 7,
    Laser = 8,
    /// trait d'énergie rouge ou vert (armes inspirées des blasters)
    Blaster = 9,
    /// souffle de feu (rayon prolongé orange)
    Fire = 10,
    /// canon de rail : projectile cinétique très rapide, trait bleu-blanc
    Rail = 11,
    /// morsure des bêtes de la faune (corps-à-corps, instantanée, sans trait)
    Bite = 12,
    /// crachat acide d'un nid de la faune (boule verte en cloche)
    Spit = 13,
}

pub const M_LAND: u8 = 1;
pub const M_NAVAL: u8 = 2;
pub const M_SUB: u8 = 4;
pub const M_AIR: u8 = 8;
pub const M_SURF: u8 = M_LAND | M_NAVAL;

pub struct WeaponDef {
    pub dmg: i32,
    pub range: i32, // en cases
    pub min_range: i32,
    pub cooldown: u16,
    pub proj: Proj,
    pub speed: i32, // cases par seconde (0 = instantané)
    pub aoe: i32,   // en 1/256 de case
    pub mask: u8,
    pub stun: u16,
    pub salvo: u8,
    pub prefer_buildings: bool,
    /// rayon prolongé : durée en ticks (0 : tir ordinaire). Les dégâts `dmg` sont infligés à chaque tick
    /// tant que la source et la cible restent à portée.
    pub sustain: u16,
    /// dispersion de la salve (1/256 de case) : chaque projectile tombe au hasard dans ce rayon autour du
    /// point visé, même le premier (0 : salve groupée)
    pub spread: i32,
}

macro_rules! w {
    ($dmg:expr, $range:expr, $cd:expr, $proj:ident, $speed:expr, $aoe:expr, $mask:expr) => {
        WeaponDef { dmg: $dmg, range: $range, min_range: 0, cooldown: $cd, proj: Proj::$proj, speed: $speed, aoe: $aoe, mask: $mask, stun: 0, salvo: 1, prefer_buildings: false, sustain: 0, spread: 0 }
    };
    ($dmg:expr, $range:expr, $cd:expr, $proj:ident, $speed:expr, $aoe:expr, $mask:expr, $($f:ident : $v:expr),*) => {
        WeaponDef { $($f: $v,)* ..w!($dmg, $range, $cd, $proj, $speed, $aoe, $mask) }
    };
}

pub const WEAPONS: [WeaponDef; 75] = [
    w!(90, 22, 20, Bullet, 40, 0, M_SURF),                              // 0 canon du commandant
    w!(220, 26, 20, Plasma, 40, 256, M_SURF),                           // 1 canon renforcé
    w!(14, 14, 20, Blaster, 35, 0, M_SURF),                             // 2 robot de ligne
    w!(7, 11, 10, Blaster, 35, 0, M_SURF),                              // 3 moto
    w!(45, 18, 30, Bullet, 35, 0, M_SURF),                              // 4 char léger
    w!(70, 34, 80, Shell, 14, 384, M_SURF, min_range: 6),               // 5 artillerie
    w!(22, 28, 10, Bullet, 50, 200, M_AIR),                             // 6 flak
    w!(28, 20, 16, Blaster, 40, 0, M_SURF, salvo: 2),                   // 7 marcheur d'assaut
    w!(90, 22, 40, Plasma, 35, 128, M_SURF),                            // 8 char glisseur
    w!(260, 60, 200, Missile, 14, 384, M_SURF, prefer_buildings: true), // 9 missiles tactiques
    w!(10, 24, 120, Ion, 30, 640, M_SURF, stun: 60),                    // 10 canon à ions
    w!(22, 30, 100, Missile, 18, 64, M_SURF | M_AIR, salvo: 6),         // 11 essaim de drones
    w!(130, 26, 50, Blaster, 35, 256, M_SURF, salvo: 2),                // 12 marcheur de siège
    w!(170, 22, 30, Plasma, 35, 256, M_SURF),                           // 13 robot de choc
    w!(650, 90, 160, Shell, 18, 900, M_SURF, min_range: 12),            // 14 artillerie lourde
    w!(26, 12, 8, Blaster, 60, 0, M_AIR),                               // 15 intercepteur
    w!(45, 10, 20, Plasma, 40, 0, M_SURF),                              // 16 planeur
    w!(32, 14, 14, Blaster, 40, 0, M_SURF, salvo: 2),                   // 17 canonnière
    w!(420, 3, 100, Bomb, 8, 768, M_SURF),                              // 18 bombes
    w!(85, 16, 16, Missile, 40, 0, M_AIR),                              // 19 chasseur de supériorité
    w!(3200, 3, 200, Bomb, 8, 1280, M_SURF, prefer_buildings: true),    // 20 bombe stratégique
    w!(45, 26, 30, Bullet, 35, 128, M_SURF),                            // 21 frégate
    w!(15, 20, 12, Bullet, 50, 0, M_AIR),                               // 22 frégate AA
    w!(220, 20, 80, Torpedo, 12, 0, M_NAVAL | M_SUB),                   // 23 torpilles
    w!(160, 34, 50, Bullet, 35, 256, M_SURF, salvo: 2),                 // 24 destroyer
    w!(320, 90, 160, Missile, 16, 512, M_SURF, prefer_buildings: true), // 25 croiseur missiles
    w!(40, 34, 8, Missile, 40, 0, M_AIR),                               // 26 croiseur AA
    w!(45, 32, 80, Laser, 0, 128, M_SURF, sustain: 60),                 // 27 laser araignée (3 s)
    w!(45, 28, 66, Laser, 0, 128, M_SURF, sustain: 50),                 // 28 laser colosse (2,5 s)
    w!(180, 30, 40, Plasma, 35, 384, M_SURF, salvo: 2),                 // 29 forteresse
    w!(160, 4, 20, Bomb, 8, 640, M_SURF),                               // 30 vaisseau-mère
    w!(280, 40, 30, Laser, 60, 384, M_SURF, salvo: 2),                  // 31 croiseur hyperespace
    w!(50, 30, 10, Bullet, 60, 0, M_AIR),                               // 32 croiseur hyperespace AA
    w!(30, 22, 20, Bullet, 40, 0, M_SURF),                              // 33 tourelle légère
    w!(45, 34, 12, Bullet, 60, 256, M_AIR),                             // 34 tourelle AA
    w!(150, 30, 40, Plasma, 40, 128, M_SURF),                           // 35 tourelle lourde
    w!(450, 150, 140, Shell, 20, 768, M_SURF, min_range: 15),           // 36 artillerie fixe
    w!(6000, 0, 1200, Beam, 0, 1536, M_SURF),                           // 37 canon orbital
    w!(35, 26, 10, Bullet, 50, 0, M_AIR),                               // 38 araignée AA
    w!(260, 26, 30, Bullet, 40, 256, M_SURF, salvo: 2),                 // 39 canons-mandibules de la blatte
    w!(30, 24, 8, Bullet, 60, 0, M_AIR),                                // 40 mitrailleuses AA de la blatte
    w!(40, 16, 70, Fire, 0, 512, M_SURF, sustain: 50),                  // 41 souffle de feu du dragon (2,5 s)
    w!(120, 28, 30, Plasma, 30, 256, M_SURF | M_AIR),                   // 42 perle d'énergie du dragon
    w!(140, 44, 24, Blaster, 50, 192, M_SURF, salvo: 4),                // 43 batteries du cuirassé stellaire
    w!(40, 32, 6, Blaster, 70, 0, M_AIR, salvo: 2),                     // 44 défense AA du cuirassé stellaire
    w!(80, 22, 24, Bullet, 40, 0, M_SURF),                              // 45 canon du Gardien
    w!(45, 34, 240, Missile, 16, 256, M_SURF, salvo: 16, spread: 900, min_range: 6), // 46 roquettes à saturation
    w!(18, 12, 14, Blaster, 40, 0, M_SURF),                             // 47 fusil du commando
    w!(450, 2, 300, Plasma, 20, 160, M_LAND, prefer_buildings: true),   // 48 charge du commando
    w!(240, 40, 50, Plasma, 40, 256, M_SURF),                           // 49 tourelle mobile déployée
    w!(1600, 3, 300, Bomb, 8, 640, M_SURF),                             // 50 bombe du bombardier furtif
    w!(10, 3, 300, Ion, 8, 1280, M_SURF, stun: 120),                    // 51 impulsion électromagnétique
    w!(20, 18, 10, Bullet, 50, 0, M_AIR),                               // 52 tourelle AA du transport lourd
    w!(35, 28, 8, Bullet, 60, 0, M_AIR),                                // 53 défense AA du porte-avions
    w!(700, 75, 120, Rail, 120, 192, M_SURF, min_range: 8),             // 54 canons de rail du cuirassé
    // faune (voir nature.rs) : morsures au corps-à-corps, contre ce qui est au sol
    w!(12, 1, 15, Bite, 0, 0, M_LAND),                                  // 55 petit mordeur
    w!(40, 2, 18, Bite, 0, 0, M_LAND),                                  // 56 mordeur
    w!(140, 2, 24, Bite, 0, 0, M_LAND),                                 // 57 grand mordeur
    // crachat du nid : contre ce qui vole ou flotte, que les morsures n'atteignent pas
    w!(55, 26, 25, Spit, 18, 96, M_AIR | M_NAVAL),                      // 58 nid de mordeurs
    w!(30, 16, 12, Blaster, 45, 0, M_SURF, salvo: 2),                   // 59 droïde roulant (déployé)
    // réplicateurs : mâchoires de blocs, contre ce qui est au sol (bâtiments surtout)
    w!(26, 1, 14, Bite, 0, 0, M_LAND, prefer_buildings: true),          // 60 réplicateur
    // disrupteur : seule arme qui défait les réplicateurs (dégâts divisés par 5 contre le reste)
    w!(90, 16, 20, Ion, 30, 64, M_SURF),                                // 61 disrupteur
    // ----- Souche (voir souche.rs) : morsures et crachats -----
    w!(120, 18, 30, Spit, 18, 128, M_SURF | M_AIR),                     // 62 crachat de la Reine
    w!(22, 1, 14, Bite, 0, 0, M_LAND),                                  // 63 rongeur
    w!(60, 26, 50, Spit, 16, 320, M_SURF, min_range: 4),                // 64 cracheur (acide en cloche)
    w!(120, 2, 24, Bite, 0, 0, M_LAND),                                 // 65 carapace
    w!(8, 7, 80, Spit, 30, 0, M_LAND, stun: 50),                        // 66 liane : enlace et immobilise
    w!(40, 22, 18, Spit, 30, 0, M_SURF | M_AIR),                        // 67 épine (défense)
    w!(90, 4, 60, Spit, 10, 512, M_SURF),                               // 68 planeur à membranes (spores)
    // ----- Transhumants (voir transhumants.rs) : canons cinétiques -----
    w!(120, 24, 20, Bullet, 40, 128, M_SURF),                           // 69 canon de l'Arche
    w!(9, 12, 10, Bullet, 40, 0, M_SURF),                               // 70 pisteur
    w!(50, 20, 28, Bullet, 40, 0, M_SURF),                              // 71 cavalier
    w!(90, 40, 90, Shell, 14, 384, M_SURF, min_range: 8),               // 72 canon tracté
    w!(300, 2, 40, Bite, 0, 0, M_LAND, prefer_buildings: true),         // 73 bélier : éperonne
    w!(160, 30, 36, Bullet, 40, 128, M_SURF),                           // 74 bastion déployé
];
pub const W_CMD_UP: u8 = 1;

// ---------- Recherches ----------
pub struct TechDef {
    pub key: &'static str,
    pub name: &'static str,
    pub tier: u8,
    pub count: u16,
    pub time: u16, // secondes par unité de recherche
    pub prereq: &'static [u8],
    pub desc: &'static str,
    /// race qui peut la rechercher
    pub race: u8,
    /// choix exclusif (Souche) : recherche qu'elle interdit, et qui l'interdit (0 : aucune)
    pub excl: u8,
    /// recherche des Industriels acquise en même temps (recettes partagées ; 0 : aucune)
    pub also: u8,
}

macro_rules! t {
    ($k:expr, $n:expr, $tier:expr, $c:expr, $time:expr, [$($p:expr),*], $d:expr) => {
        TechDef { key: $k, name: $n, tier: $tier, count: $c, time: $time, prereq: &[$($p),*], desc: $d, race: RACE_INDUS, excl: 0, also: 0 }
    };
    ($k:expr, $n:expr, $tier:expr, $c:expr, $time:expr, [$($p:expr),*], $d:expr, $($f:ident : $v:expr),*) => {
        TechDef { $($f: $v,)* ..t!($k, $n, $tier, $c, $time, [$($p),*], $d) }
    };
}

pub const T_CRYSTAL_REFINING: u8 = 20;
pub const T_CMD_SHIELD: u8 = 24;
pub const T_CMD_CANNON: u8 = 34;
pub const T_CMD_TELEPORT: u8 = 35;
pub const T_LOGISTICS3: u8 = 31;

pub const TECHS: [TechDef; 64] = [
    t!("none", "Base", 0, 0, 0, [], ""),
    t!("automation", "Automatisation", 1, 10, 5, [], "Bras long, rail et gare, répartiteur, collecteur de surplus ; améliorations : extracteur, générateur et dépôt"),
    t!("land_prod", "Production terrestre", 1, 15, 5, [], "Usine terrestre, drone ingénieur, robot de ligne, moto-glisseur, char léger"),
    t!("light_defense", "Défense légère", 1, 10, 5, [], "Tourelle légère, mur, radar"),
    t!("electronics", "Électronique", 2, 20, 8, [1], "Usine aérienne, avion éclaireur, intercepteur, planeur d'attaque, transport, héliport de fret ; extracteur et générateur niveau 3, zone du générateur principal +50 %"),
    t!("hydrocarbons", "Hydrocarbures", 2, 20, 8, [1], "Raffinerie, centrale à hydrocarbure"),
    t!("mobile_artillery", "Artillerie mobile", 2, 20, 8, [2], "Artillerie mobile, DCA mobile, sonde de détection"),
    t!("aa_turret", "Tourelle antiaérienne", 2, 15, 8, [3], "Tourelle antiaérienne"),
    t!("logistics2", "Logistique rapide", 3, 30, 10, [4], "Tapis rapide, assembleur rapide, trieur, débordement"),
    t!("chemistry", "Chimie", 3, 30, 10, [5], "Usine chimique (composites)"),
    t!("engineer3", "Ingénierie avancée", 3, 25, 10, [4], "Drone ingénieur avancé"),
    t!("naval", "Marine", 3, 30, 10, [4], "Usine navale, frégate, sous-marin"),
    t!("assault", "Assaut", 3, 35, 10, [6], "Marcheur d'assaut, char glisseur, lance-missiles mobile, Gardien, lance-roquettes à saturation"),
    t!("heavy_air", "Aviation lourde", 3, 35, 10, [4], "Canonnière, bombardier, transport lourd"),
    t!("heavy_turret", "Tourelle lourde", 3, 25, 10, [3], "Tourelle lourde, tourelle mobile déployable"),
    t!("shields", "Boucliers", 4, 40, 12, [9], "Générateur de bouclier mobile et fixe"),
    t!("ions", "Canons à ions", 4, 40, 12, [12], "Canon à ions mobile"),
    t!("drones", "Drones guidés", 4, 40, 12, [12], "Lanceur de drones guidés"),
    t!("siege_walker", "Marcheur de siège", 4, 50, 12, [12], "Marcheur de siège"),
    t!("transfer", "Anneaux de transfert", 4, 40, 12, [9], "Plateforme de transfert"),
    t!("crystal_refining", "Raffinage du cristal", 4, 40, 12, [9], "Cristal raffiné, cellules d'énergie, lots 5 et 6"),
    t!("superiority", "Supériorité aérienne", 4, 40, 12, [13], "Chasseur de supériorité"),
    t!("destroyer", "Destroyer", 4, 40, 12, [11], "Destroyer"),
    t!("fixed_artillery", "Artillerie fixe", 4, 45, 12, [14], "Artillerie fixe"),
    t!("cmd_shield", "Bouclier du commandant", 4, 30, 12, [15], "Bouclier personnel du robot de commandement"),
    t!("shock", "Robots de choc", 5, 60, 15, [18], "Robot de choc"),
    t!("heavy_artillery", "Artillerie lourde", 5, 60, 15, [6, 20], "Artillerie lourde mobile"),
    t!("gate", "Porte de transit", 5, 60, 15, [19, 20], "Porte de transit"),
    t!("area_shield", "Bouclier de zone", 5, 60, 15, [15, 20], "Bouclier de zone"),
    t!("strategic", "Missile stratégique", 5, 70, 15, [20], "Silo de missile stratégique, défense antimissile"),
    t!("crystal_reactor", "Réacteur à cristal", 5, 60, 15, [20], "Réacteur à cristal"),
    t!("logistics3", "Logistique avancée", 5, 50, 15, [8, 20], "Tapis express, assembleur avancé, drone ingénieur suprême"),
    t!("strat_bomber", "Bombardier stratégique", 5, 60, 15, [21], "Bombardier stratégique"),
    t!("missile_cruiser", "Croiseur lance-missiles", 5, 60, 15, [22], "Croiseur lance-missiles"),
    t!("cmd_cannon", "Canon renforcé", 5, 40, 15, [24], "Canon renforcé du robot de commandement"),
    t!("cmd_teleport", "Téléportation par faisceau", 5, 50, 15, [24], "Le robot de commandement se téléporte"),
    t!("experimental", "Portique expérimental", 6, 80, 15, [30], "Portique expérimental"),
    t!("spider", "Araignée de siège", 6, 60, 15, [36], "Araignée de siège"),
    t!("colossus", "Colosse", 6, 60, 15, [36], "Colosse"),
    t!("fortress", "Forteresse marchante", 6, 70, 15, [36], "Forteresse marchante"),
    t!("mothership", "Vaisseau-mère", 6, 70, 15, [36], "Vaisseau-mère"),
    t!("hyper_cruiser", "Croiseur hyperespace", 6, 70, 15, [36], "Croiseur hyperespace, balise d'hyperespace"),
    t!("orbital", "Canon orbital", 6, 90, 15, [36], "Canon orbital"),
    t!("roach", "Char Blatte", 6, 60, 15, [36], "Char Blatte"),
    t!("dragon", "Gros Chinois", 6, 70, 15, [36], "Gros Chinois, dragon robot volant"),
    t!("star_cruiser", "Cuirassé stellaire", 6, 90, 15, [36], "Cuirassé stellaire"),
    t!("electronic_warfare", "Guerre électronique", 4, 45, 12, [12, 13], "Commando furtif, brouilleur mobile, bombardier furtif, avion de guerre électronique"),
    t!("heavy_navy", "Marine lourde", 5, 60, 15, [22], "Porte-avions, cuirassé à canons de rail"),
    // ----- Souche : chaque unité de recherche coûte `palier` ADN (voir souche.rs) -----
    t!("s_spitters", "Cracheurs", 1, 10, 6, [], "Cracheur : artillerie acide", race: RACE_SOUCHE),
    t!("s_shells", "Carapaces", 2, 15, 8, [48], "Carapace : char vivant", race: RACE_SOUCHE),
    t!("s_vines", "Lianes", 2, 15, 8, [48], "Liane : enlace et immobilise les unités au sol", race: RACE_SOUCHE),
    t!("s_membranes", "Membranes", 3, 20, 10, [49], "Planeur à membranes : bombes de spores", race: RACE_SOUCHE),
    t!("s_scales", "Écailles", 2, 15, 8, [], "Mutation : +30 % de points de vie pour tous les organismes. Exclut Sève vive.", race: RACE_SOUCHE, excl: 53),
    t!("s_quick_sap", "Sève vive", 2, 15, 8, [], "Mutation : régénération doublée sur le terreau, et 1 % par seconde hors du terreau. Exclut Écailles.", race: RACE_SOUCHE, excl: 52),
    t!("s_acid", "Acide", 3, 20, 10, [52, 53], "Mutation : +25 % de dégâts pour tous les organismes. Exclut Fécondité.", race: RACE_SOUCHE, excl: 55),
    t!("s_fertility", "Fécondité", 3, 20, 10, [52, 53], "Mutation : couveuses et croissance des organes 50 % plus rapides. Exclut Acide.", race: RACE_SOUCHE, excl: 54),
    t!("s_deep_roots", "Racines profondes", 4, 25, 12, [54, 55], "Mutation : points de vie des organes doublés. Exclut Grandes frondaisons.", race: RACE_SOUCHE, excl: 57),
    t!("s_big_leaves", "Grandes frondaisons", 4, 25, 12, [54, 55], "Mutation : frondaisons et racines-puits +50 %. Exclut Racines profondes.", race: RACE_SOUCHE, excl: 56),
    // ----- Transhumants : chaque unité de recherche coûte 3 × palier relevés (voir transhumants.rs) -----
    t!("t_heavy_shop", "Atelier lourd", 1, 10, 6, [], "Canon tracté, bélier", race: RACE_TRANSH),
    t!("t_refining", "Raffinage nomade", 1, 10, 6, [], "Chenillard raffinerie (carburant)", race: RACE_TRANSH),
    t!("t_electronics", "Électronique nomade", 2, 20, 8, [], "Plaquettes, moteurs, processeurs", race: RACE_TRANSH, also: T_ELECTRONICS),
    t!("t_bastion", "Bastion", 2, 15, 8, [58], "Chenillard bastion : tourelle lourde une fois déployé", race: RACE_TRANSH),
    t!("t_armor", "Blindage", 3, 25, 10, [60], "Chenillards et Arche : +50 % de points de vie", race: RACE_TRANSH),
    t!("t_crystal", "Cristal nomade", 4, 30, 12, [60], "Cristal raffiné, cellules d'énergie", race: RACE_TRANSH, also: T_CRYSTAL_REFINING),
];
/// Recherches de la Souche et des Transhumants (indices dans TECHS).
pub const T_S_SPITTERS: u8 = 48;
pub const T_S_SHELLS: u8 = 49;
pub const T_S_VINES: u8 = 50;
pub const T_S_MEMBRANES: u8 = 51;
pub const T_S_SCALES: u8 = 52;
pub const T_S_QUICK_SAP: u8 = 53;
pub const T_S_ACID: u8 = 54;
pub const T_S_FERTILITY: u8 = 55;
pub const T_S_DEEP_ROOTS: u8 = 56;
pub const T_S_BIG_LEAVES: u8 = 57;
pub const T_T_HEAVY_SHOP: u8 = 58;
pub const T_T_REFINING: u8 = 59;
pub const T_T_ELECTRONICS: u8 = 60;
pub const T_T_BASTION: u8 = 61;
pub const T_T_ARMOR: u8 = 62;
pub const T_T_CRYSTAL: u8 = 63;
pub const T_ELECTRONIC_WARFARE: u8 = 46;
pub const T_HEAVY_NAVY: u8 = 47;

// ---------- Bâtiments ----------
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum BClass {
    Extractor,
    Belt,
    Inserter,
    Crafter,
    Lab,
    Depot,
    Power,
    Pylon,
    Factory,
    Radar,
    Wall,
    Turret,
    Shield,
    Transfer,
    Gate,
    Silo,
    AntiMissile,
    Beacon,
    Orbital,
    /// Entrepôt d'équipe : dépôt commun à l'équipe (drones de chacun) ; peut ressortir un objet choisi.
    Warehouse,
    /// Rail (voie ferrée) : relie les gares.
    Rail,
    /// Gare : chargement et déchargement des trains (grande capacité, sur rails).
    Station,
    /// Héliport de fret : drones de transport (rapides, petite capacité, en ligne droite).
    CargoPad,
    /// Tapis de contrôle : répartiteur, trieur, débordement (selon le type).
    Router,
    /// Portail de don : les unités d'un allié qui le traversent passent à son propriétaire.
    Portal,
    /// Base de robots logistiques : alimente les fabricants voisins depuis les dépôts proches, évacue les sorties bloquées.
    Roboport,
    /// Nid de la faune (voir nature.rs) : fait naître des bêtes ; jamais posé par un joueur.
    Nest,
    /// Ruine des Anciens : garde un EPPZ, qu'un joueur capture en y stationnant (voir nature.rs).
    Ruin,
    /// Organe de la Souche : produit ou garde la sève et les sels de son réseau (voir souche.rs).
    Organ,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum FactoryKind {
    None = 0,
    Land = 1,
    Air = 2,
    Naval = 3,
    Exp = 4,
}

pub struct BuildingDef {
    pub key: &'static str,
    pub name: &'static str,
    pub size: (u8, u8),
    pub hp: i32,
    pub power_use: i32,
    pub power_prod: i32,
    pub cost: &'static [(u8, u16)],
    pub build: u16, // secondes de travail pour une puissance de construction 10
    pub tech: u8,
    pub class: BClass,
    pub speed: i32, // vitesse de fabrication (%), vitesse de tapis
    pub crafter: Crafter,
    pub factory: FactoryKind,
    pub weapon: i8,
    pub supply: i32,  // rayon d'alimentation (cases), 0 = pas un pylône
    pub connect: i32, // portée de connexion entre pylônes
    pub radar: i32,
    pub vision: i32,
    pub shield_r: i32,
    pub shield_hp: i32,
    pub deposit: u8, // gisement requis (0 = aucun, 255 = n'importe lequel)
    pub water: bool,
    pub passable: bool,
    /// bras : distance (cases) de la case de prise et de la case de dépose
    pub reach: u8,
    /// tapis collecteur de surplus : les objets à l'arrêt sur sa case partent au dépôt le plus proche
    pub collect: bool,
    /// race qui le pose (voir RACES)
    pub race: u8,
}

const BD: BuildingDef = BuildingDef {
    key: "",
    name: "",
    size: (1, 1),
    hp: 100,
    power_use: 0,
    power_prod: 0,
    cost: &[],
    build: 1,
    tech: 0,
    class: BClass::Wall,
    speed: 100,
    crafter: Crafter::Assembler,
    factory: FactoryKind::None,
    weapon: -1,
    supply: 0,
    connect: 0,
    radar: 0,
    vision: 8,
    shield_r: 0,
    shield_hp: 0,
    deposit: 0,
    water: false,
    passable: false,
    reach: 1,
    collect: false,
    race: RACE_INDUS,
};

pub const B_EXTRACTOR: u16 = 0;
pub const B_BELT1: u16 = 1;
pub const B_BELT2: u16 = 2;
pub const B_BELT3: u16 = 3;
pub const B_INSERTER: u16 = 4;
pub const B_FURNACE: u16 = 5;
pub const B_ASSEMBLER1: u16 = 6;
pub const B_REFINERY: u16 = 9;
pub const B_CHEMICAL: u16 = 10;
pub const B_LAB: u16 = 11;
pub const B_DEPOT: u16 = 12;
pub const B_GENERATOR: u16 = 13;
pub const B_PYLON: u16 = 14;
pub const B_HYDRO: u16 = 15;
pub const B_LAND_FACTORY: u16 = 16;
pub const B_AIR_FACTORY: u16 = 17;
pub const B_NAVAL_FACTORY: u16 = 18;
pub const B_GANTRY: u16 = 19;
pub const B_RADAR: u16 = 20;
pub const B_WALL: u16 = 21;
pub const B_LIGHT_TURRET: u16 = 22;
pub const B_AA_TURRET: u16 = 23;
pub const B_HEAVY_TURRET: u16 = 24;
pub const B_FIXED_ARTILLERY: u16 = 25;
pub const B_SHIELD_GEN: u16 = 26;
pub const B_TRANSFER: u16 = 27;
pub const B_GATE: u16 = 28;
pub const B_AREA_SHIELD: u16 = 29;
pub const B_CRYSTAL_REACTOR: u16 = 30;
pub const B_SILO: u16 = 31;
pub const B_ANTIMISSILE: u16 = 32;
pub const B_BEACON: u16 = 33;
pub const B_ORBITAL: u16 = 34;
pub const B_WAREHOUSE: u16 = 35;
pub const B_RAIL: u16 = 36;
pub const B_STATION: u16 = 37;
pub const B_CARGO_PAD: u16 = 38;
pub const B_SPLITTER: u16 = 39;
pub const B_SORTER: u16 = 40;
pub const B_OVERFLOW: u16 = 41;
pub const B_PORTAL: u16 = 42;
pub const B_ROBOPORT: u16 = 43;
pub const B_LONG_INSERTER: u16 = 44;
pub const B_COLLECTOR: u16 = 45;

/// Énergie d'une unité de combustible, en kW × ticks (1 s = 20 ticks) : un hydrocarbure fait tourner un
/// générateur de 1 500 kW pendant 1 s ; un extracteur de base (0,67 objet/s) alimente environ 1 000 kW.
pub const FUEL_HYDROCARBON: i32 = 30_000;
/// carburant raffiné (2 hydrocarbures) : 5 fois l'hydrocarbure
pub const FUEL_REFINED: i32 = 150_000;
/// cellule d'énergie (réacteur à cristal) : 4 min d'un réacteur de 12 MW à pleine charge… divisées par 12
pub const FUEL_CELL: i32 = 4_800_000;
/// Réservoir d'un générateur : 20 unités de son combustible principal.
pub const FUEL_TANK_UNITS: i32 = 20;
/// Combustible du générateur principal au départ (unités d'hydrocarbure).
pub const START_FUEL_UNITS: i32 = 20;

pub const B_MAIN_GENERATOR: u16 = 46;
/// Nid de la faune (voir nature.rs).
pub const B_NEST: u16 = 47;
/// Centrale géothermique : sur un geyser, sans combustible, production qui ondule.
pub const B_GEOTHERMAL: u16 = 48;
/// Ruche des réplicateurs (un nid de la faune, voir nature.rs).
pub const B_HIVE: u16 = 49;
/// Ruine des Anciens, qui garde un EPPZ.
pub const B_RUIN: u16 = 50;
/// Socle à EPPZ : énorme production d'énergie, sans combustible, pour qui a capturé un EPPZ.
pub const B_EPPZ_SOCKET: u16 = 51;
// Souche (voir souche.rs)
pub const B_SEED_HEART: u16 = 52;
pub const B_ROOT: u16 = 53;
pub const B_LEAVES: u16 = 54;
pub const B_TAPROOT: u16 = 55;
pub const B_BULB: u16 = 56;
pub const B_BROOD: u16 = 57;
pub const B_MATRIX: u16 = 58;
pub const B_THORN: u16 = 59;
pub const B_BLOOM: u16 = 60;
// Transhumants : modules déployés des chenillards (voir transhumants.rs)
pub const B_T_DRILL: u16 = 61;
pub const B_T_FURNACE: u16 = 62;
pub const B_T_ASSEMBLER: u16 = 63;
pub const B_T_REFINERY: u16 = 64;
pub const B_T_GENERATOR: u16 = 65;
pub const B_T_HOLD: u16 = 66;
pub const B_T_LAB: u16 = 67;
pub const B_T_WORKSHOP: u16 = 68;
pub const B_T_BASTION: u16 = 69;
/// poteau relais planté par un générateur nomade (voir transhumants::plant_pole)
pub const B_T_POLE: u16 = 70;

pub const BUILDINGS: [BuildingDef; 71] = [
    BuildingDef { key: "extractor", name: "Extracteur", size: (2, 2), hp: 400, power_use: 90, cost: &[(IRON_PLATE, 10), (COPPER_PLATE, 5)], build: 4, class: BClass::Extractor, deposit: 255, ..BD },
    BuildingDef { key: "belt1", name: "Tapis roulant", hp: 60, cost: &[(IRON_PLATE, 1)], build: 1, power_use: 1, class: BClass::Belt, speed: 24, passable: true, vision: 0, ..BD },
    BuildingDef { key: "belt2", name: "Tapis rapide", hp: 80, cost: &[(IRON_PLATE, 1), (GEAR, 1)], build: 1, tech: 8, power_use: 2, class: BClass::Belt, speed: 48, passable: true, vision: 0, ..BD },
    BuildingDef { key: "belt3", name: "Tapis express", hp: 100, cost: &[(STEEL, 1), (GEAR, 1)], build: 1, tech: T_LOGISTICS3, power_use: 3, class: BClass::Belt, speed: 72, passable: true, vision: 0, ..BD },
    BuildingDef { key: "inserter", name: "Bras", hp: 80, power_use: 15, cost: &[(IRON_PLATE, 2), (COPPER_PLATE, 1)], build: 1, class: BClass::Inserter, passable: true, vision: 0, ..BD },
    BuildingDef { key: "furnace", name: "Fonderie", size: (2, 2), hp: 350, power_use: 90, cost: &[(IRON_PLATE, 8), (COPPER_PLATE, 2)], build: 3, class: BClass::Crafter, crafter: Crafter::Furnace, ..BD },
    BuildingDef { key: "assembler1", name: "Assembleur", size: (2, 2), hp: 400, power_use: 75, cost: &[(IRON_PLATE, 10), (COPPER_PLATE, 6)], build: 4, class: BClass::Crafter, speed: 75, ..BD },
    BuildingDef { key: "assembler2", name: "Assembleur rapide", size: (2, 2), hp: 600, power_use: 150, cost: &[(STEEL, 6), (GEAR, 5), (CIRCUIT, 3)], build: 6, tech: 8, class: BClass::Crafter, speed: 125, ..BD },
    BuildingDef { key: "assembler3", name: "Assembleur avancé", size: (2, 2), hp: 800, power_use: 250, cost: &[(STEEL, 8), (PROCESSOR, 3), (COMPOSITE, 2)], build: 8, tech: T_LOGISTICS3, class: BClass::Crafter, speed: 200, ..BD },
    BuildingDef { key: "refinery", name: "Raffinerie", size: (2, 2), hp: 600, power_use: 200, cost: &[(STEEL, 8), (GEAR, 5), (CIRCUIT, 4)], build: 8, tech: 5, class: BClass::Crafter, crafter: Crafter::Refinery, ..BD },
    BuildingDef { key: "chemical", name: "Usine chimique", size: (2, 2), hp: 600, power_use: 200, cost: &[(STEEL, 8), (GEAR, 6), (CIRCUIT, 5)], build: 8, tech: 9, class: BClass::Crafter, crafter: Crafter::Chemical, ..BD },
    BuildingDef { key: "lab", name: "Laboratoire", size: (2, 2), hp: 400, power_use: 60, cost: &[(IRON_PLATE, 10), (COPPER_PLATE, 10)], build: 4, class: BClass::Lab, ..BD },
    BuildingDef { key: "depot", name: "Dépôt", size: (2, 2), hp: 500, cost: &[(IRON_PLATE, 8)], build: 2, class: BClass::Depot, ..BD },
    BuildingDef { key: "generator", name: "Générateur", size: (2, 2), hp: 500, power_prod: 400, cost: &[(IRON_PLATE, 10), (COPPER_PLATE, 8)], build: 4, class: BClass::Power, supply: 8, connect: 20, ..BD },
    BuildingDef { key: "pylon", name: "Relais", hp: 150, cost: &[(IRON_PLATE, 2), (COPPER_PLATE, 2)], build: 1, class: BClass::Pylon, supply: 7, connect: 22, vision: 0, ..BD },
    BuildingDef { key: "hydro_plant", name: "Centrale à hydrocarbure", size: (2, 2), hp: 1200, power_prod: 2500, cost: &[(STEEL, 10), (GEAR, 8), (CIRCUIT, 5)], build: 10, tech: 5, class: BClass::Power, supply: 10, connect: 22, ..BD },
    BuildingDef { key: "land_factory", name: "Usine terrestre", size: (3, 3), hp: 4000, power_use: 400, cost: &[(IRON_PLATE, 30), (GEAR, 10), (COPPER_PLATE, 10)], build: 15, tech: 2, class: BClass::Factory, factory: FactoryKind::Land, vision: 12, ..BD },
    BuildingDef { key: "air_factory", name: "Usine aérienne", size: (3, 3), hp: 4000, power_use: 500, cost: &[(STEEL, 20), (CIRCUIT, 15), (GEAR, 10)], build: 20, tech: 4, class: BClass::Factory, factory: FactoryKind::Air, vision: 12, ..BD },
    BuildingDef { key: "naval_factory", name: "Usine navale", size: (3, 3), hp: 5000, power_use: 500, cost: &[(STEEL, 30), (CIRCUIT, 15), (ENGINE, 5)], build: 20, tech: 11, class: BClass::Factory, factory: FactoryKind::Naval, water: true, vision: 14, ..BD },
    BuildingDef { key: "gantry", name: "Portique expérimental", size: (5, 5), hp: 15000, power_use: 1500, cost: &[(STEEL, 100), (PROCESSOR, 40), (COMPOSITE, 40)], build: 60, tech: 36, class: BClass::Factory, factory: FactoryKind::Exp, vision: 14, ..BD },
    BuildingDef { key: "radar", name: "Radar", size: (2, 2), hp: 300, power_use: 100, cost: &[(IRON_PLATE, 10), (CIRCUIT, 5)], build: 4, tech: 3, class: BClass::Radar, radar: 70, vision: 10, ..BD },
    BuildingDef { key: "wall", name: "Mur", hp: 1500, cost: &[(IRON_PLATE, 3)], build: 1, tech: 3, class: BClass::Wall, vision: 0, ..BD },
    BuildingDef { key: "light_turret", name: "Tourelle légère", size: (2, 2), hp: 1500, cost: &[(IRON_PLATE, 12), (GEAR, 4), (CIRCUIT, 2)], build: 5, tech: 3, class: BClass::Turret, weapon: 33, vision: 24, ..BD },
    BuildingDef { key: "aa_turret", name: "Tourelle antiaérienne", size: (2, 2), hp: 1400, cost: &[(STEEL, 8), (CIRCUIT, 4)], build: 6, tech: 7, class: BClass::Turret, weapon: 34, vision: 34, ..BD },
    BuildingDef { key: "heavy_turret", name: "Tourelle lourde", size: (2, 2), hp: 5000, cost: &[(STEEL, 20), (AMMO, 10), (CIRCUIT, 5)], build: 10, tech: 14, class: BClass::Turret, weapon: 35, vision: 30, ..BD },
    BuildingDef { key: "fixed_artillery", name: "Artillerie fixe", size: (2, 2), hp: 4000, power_use: 100, cost: &[(STEEL, 40), (AMMO, 20), (PROCESSOR, 10)], build: 20, tech: 23, class: BClass::Turret, weapon: 36, vision: 20, ..BD },
    BuildingDef { key: "shield_gen", name: "Générateur de bouclier", size: (2, 2), hp: 1500, power_use: 400, cost: &[(STEEL, 15), (PROCESSOR, 8)], build: 10, tech: 15, class: BClass::Shield, shield_r: 14, shield_hp: 8000, ..BD },
    BuildingDef { key: "transfer", name: "Anneaux de transport", size: (2, 2), hp: 2000, power_use: 300, cost: &[(STEEL, 20), (PROCESSOR, 10)], build: 15, tech: 19, class: BClass::Transfer, passable: true, ..BD },
    BuildingDef { key: "gate", name: "Porte de transit", size: (3, 3), hp: 6000, power_use: 200, cost: &[(STEEL, 40), (PROCESSOR, 20), (REFINED_CRYSTAL, 20)], build: 30, tech: 27, class: BClass::Gate, passable: true, ..BD },
    BuildingDef { key: "area_shield", name: "Bouclier de zone", size: (2, 2), hp: 4000, power_use: 2000, cost: &[(COMPOSITE, 40), (PROCESSOR, 30), (REFINED_CRYSTAL, 20)], build: 40, tech: 28, class: BClass::Shield, shield_r: 30, shield_hp: 30000, ..BD },
    BuildingDef { key: "crystal_reactor", name: "Réacteur à cristal", size: (3, 3), hp: 5000, power_prod: 12000, cost: &[(COMPOSITE, 30), (PROCESSOR, 20), (REFINED_CRYSTAL, 30)], build: 40, tech: 30, class: BClass::Power, supply: 14, connect: 30, ..BD },
    BuildingDef { key: "missile_silo", name: "Silo de missile stratégique", size: (2, 2), hp: 4000, power_use: 500, cost: &[(STEEL, 40), (PROCESSOR, 20), (COMPOSITE, 20)], build: 40, tech: 29, class: BClass::Silo, ..BD },
    BuildingDef { key: "antimissile", name: "Défense antimissile", size: (2, 2), hp: 2500, power_use: 200, cost: &[(STEEL, 20), (PROCESSOR, 15)], build: 20, tech: 29, class: BClass::AntiMissile, ..BD },
    BuildingDef { key: "beacon", name: "Balise d'hyperespace", size: (2, 2), hp: 1500, power_use: 100, cost: &[(STEEL, 10), (PROCESSOR, 10), (ENERGY_CELL, 5)], build: 10, tech: 41, class: BClass::Beacon, ..BD },
    BuildingDef { key: "orbital", name: "Canon orbital", size: (3, 3), hp: 12000, power_use: 3000, cost: &[(STEEL, 100), (ENERGY_CELL, 40), (COMPOSITE, 50)], build: 90, tech: 42, class: BClass::Orbital, ..BD },
    // logistique et entraide (voir logistics.rs)
    BuildingDef { key: "warehouse", name: "Entrepôt d'équipe", size: (2, 2), hp: 1500, cost: &[(IRON_PLATE, 30), (COPPER_PLATE, 10)], build: 6, class: BClass::Warehouse, ..BD },
    BuildingDef { key: "rail", name: "Rail", size: (1, 1), hp: 150, cost: &[(IRON_PLATE, 3)], build: 1, tech: 1, class: BClass::Rail, passable: true, ..BD },
    BuildingDef { key: "station", name: "Gare", size: (2, 2), hp: 2500, cost: &[(IRON_PLATE, 40), (GEAR, 10), (CIRCUIT, 5)], build: 10, tech: 1, class: BClass::Station, ..BD },
    BuildingDef { key: "cargo_pad", name: "Héliport de fret", size: (2, 2), hp: 1500, cost: &[(STEEL, 15), (CIRCUIT, 10)], build: 10, tech: 4, class: BClass::CargoPad, ..BD },
    // tapis de contrôle (entrée par l'arrière ; sorties : avant, gauche, droite)
    BuildingDef { key: "splitter", name: "Répartiteur", size: (1, 1), hp: 120, cost: &[(IRON_PLATE, 6), (GEAR, 4), (CIRCUIT, 2)], build: 2, tech: 1, class: BClass::Router, passable: true, ..BD },
    BuildingDef { key: "sorter", name: "Trieur", size: (1, 1), hp: 120, cost: &[(IRON_PLATE, 6), (GEAR, 4), (CIRCUIT, 4)], build: 2, tech: 8, class: BClass::Router, passable: true, ..BD },
    BuildingDef { key: "overflow", name: "Débordement", size: (1, 1), hp: 120, cost: &[(IRON_PLATE, 6), (GEAR, 4), (CIRCUIT, 2)], build: 2, tech: 8, class: BClass::Router, passable: true, ..BD },
    BuildingDef { key: "gift_portal", name: "Portail de don", size: (2, 2), hp: 2000, cost: &[(IRON_PLATE, 40), (COPPER_PLATE, 20), (CIRCUIT, 10)], build: 8, class: BClass::Portal, passable: true, ..BD },
    BuildingDef { key: "roboport", name: "Base de robots logistiques", size: (2, 2), hp: 3000, power_use: 800, cost: &[(STEEL, 40), (PROCESSOR, 10), (COMPOSITE, 10)], build: 20, tech: 31, class: BClass::Roboport, ..BD },    // bras long : prend et pose à 2 cases, par-dessus la case intermédiaire (un tapis, par exemple)
    BuildingDef { key: "long_inserter", name: "Bras long", hp: 100, power_use: 20, cost: &[(IRON_PLATE, 3), (GEAR, 1), (COPPER_PLATE, 2)], build: 1, tech: 1, class: BClass::Inserter, passable: true, vision: 0, reach: 2, ..BD },
    // tapis surmonté d'un portique : il se pose sur un tapis (qu'il remplace) et met le surplus en réserve
    BuildingDef { key: "collector", name: "Collecteur de surplus", hp: 150, cost: &[(IRON_PLATE, 8), (GEAR, 4), (CIRCUIT, 2)], build: 3, tech: T_AUTOMATION, power_use: 3, class: BClass::Belt, speed: 72, passable: true, vision: 0, collect: true, ..BD }, // vitesse express : ne ralentit aucune file
    // générateur principal : posé au départ (et reconstructible), grande zone ; brûle de l'hydrocarbure
    BuildingDef { key: "main_generator", name: "Générateur principal", size: (3, 3), hp: 3000, power_prod: 1500, cost: &[(STEEL, 40), (GEAR, 20), (CIRCUIT, 20)], build: 30, tech: 0, class: BClass::Power, supply: 18, connect: 30, ..BD },
    // nid de la faune : posé par la carte ou par une expansion, jamais par un joueur (voir can_place)
    BuildingDef { key: "nest", name: "Nid de mordeurs", size: (3, 3), hp: 3000, class: BClass::Nest, weapon: 58, vision: 0, ..BD },
    // centrale géothermique : posée sur un geyser, elle produit sans combustible (voir geo_output)
    BuildingDef { key: "geothermal", name: "Centrale géothermique", size: (3, 3), hp: 2500, power_prod: 1600, cost: &[(STEEL, 15), (GEAR, 10), (CIRCUIT, 8)], build: 12, tech: 5, class: BClass::Power, supply: 10, connect: 22, deposit: GEYSER, ..BD },
    // réplicateurs : ruche (un nid de la faune, insensible comme ses réplicateurs)
    BuildingDef { key: "replicator_hive", name: "Ruche de réplicateurs", size: (3, 3), hp: 4000, class: BClass::Nest, vision: 0, ..BD },
    // ruine des Anciens : posée par la carte (faune active), indestructible ; son EPPZ se capture
    BuildingDef { key: "ancient_ruin", name: "Ruine des Anciens", size: (3, 3), hp: 1_000_000, class: BClass::Ruin, vision: 0, ..BD },
    // socle à EPPZ : demande un EPPZ capturé (Player::eppz), produit sans combustible
    BuildingDef { key: "eppz_socket", name: "Socle à EPPZ", size: (2, 2), hp: 3000, power_prod: 25000, cost: &[(STEEL, 20), (CIRCUIT, 10)], build: 15, class: BClass::Power, supply: 14, connect: 30, ..BD },
    // ----- Souche : organes, posés sur le terreau d'un réseau de racines, qui poussent seuls -----
    BuildingDef { key: "seed_heart", name: "Graine-mère", size: (3, 3), hp: 4000, build: 90, class: BClass::Organ, supply: 6, connect: 8, vision: 14, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "root", name: "Racine", hp: 150, cost: &[(SEVE, 4)], build: 2, class: BClass::Pylon, supply: 3, connect: 5, passable: true, vision: 0, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "leaves", name: "Frondaison", size: (2, 2), hp: 300, cost: &[(SEVE, 40), (SELS, 10)], build: 8, class: BClass::Organ, vision: 6, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "taproot", name: "Racine-puits", size: (2, 2), hp: 600, cost: &[(SEVE, 60)], build: 10, class: BClass::Organ, deposit: 255, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "bulb", name: "Bulbe", size: (2, 2), hp: 800, cost: &[(SEVE, 50), (SELS, 20)], build: 8, class: BClass::Organ, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "brood", name: "Couveuse", size: (3, 3), hp: 3000, cost: &[(SEVE, 150), (SELS, 50)], build: 20, class: BClass::Factory, factory: FactoryKind::Land, vision: 12, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "matrix", name: "Matrice", size: (2, 2), hp: 600, cost: &[(SEVE, 100), (SELS, 40)], build: 12, class: BClass::Lab, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "thorn", name: "Épine", size: (2, 2), hp: 1400, cost: &[(SEVE, 80), (SELS, 30)], build: 8, class: BClass::Turret, weapon: 67, vision: 24, race: RACE_SOUCHE, ..BD },
    BuildingDef { key: "bloom", name: "Floraison", size: (2, 2), hp: 300, cost: &[(SEVE, 40), (SELS, 20)], build: 6, class: BClass::Radar, radar: 55, vision: 14, race: RACE_SOUCHE, ..BD },
    // ----- Transhumants : modules déployés des chenillards ; ils ne se construisent pas (voir transhumants.rs) -----
    BuildingDef { key: "t_drill", name: "Foreuse nomade", size: (2, 2), hp: 600, power_use: 120, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 6), (GEAR, 6)], build: 10, class: BClass::Extractor, deposit: 255, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_furnace", name: "Fonderie nomade", size: (2, 2), hp: 500, power_use: 90, cost: &[(IRON_PLATE, 12), (COPPER_PLATE, 4), (GEAR, 4)], build: 8, class: BClass::Crafter, crafter: Crafter::Furnace, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_assembler", name: "Assembleur nomade", size: (2, 2), hp: 600, power_use: 100, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 8), (GEAR, 6)], build: 10, class: BClass::Crafter, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_refinery", name: "Raffinerie nomade", size: (2, 2), hp: 800, power_use: 200, cost: &[(STEEL, 10), (GEAR, 8), (CIRCUIT, 4)], build: 14, class: BClass::Crafter, crafter: Crafter::Refinery, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_generator", name: "Générateur nomade", size: (2, 2), hp: 900, power_prod: 600, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 10), (GEAR, 6)], build: 10, class: BClass::Power, supply: 9, connect: 22, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_hold", name: "Soute", size: (2, 2), hp: 1200, cost: &[(IRON_PLATE, 16), (GEAR, 4)], build: 8, class: BClass::Depot, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_lab", name: "Laboratoire nomade", size: (2, 2), hp: 600, power_use: 60, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 14), (GEAR, 4)], build: 10, class: BClass::Lab, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_workshop", name: "Atelier", size: (3, 3), hp: 5000, power_use: 400, cost: &[(IRON_PLATE, 40), (GEAR, 16), (COPPER_PLATE, 12)], build: 24, class: BClass::Factory, factory: FactoryKind::Land, vision: 12, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_bastion", name: "Bastion", size: (2, 2), hp: 4000, cost: &[(STEEL, 24), (AMMO, 10), (CIRCUIT, 6)], build: 16, class: BClass::Turret, weapon: 74, vision: 30, race: RACE_TRANSH, ..BD },
    BuildingDef { key: "t_pole", name: "Poteau nomade", hp: 200, cost: &[], build: 1, class: BClass::Pylon, supply: 6, connect: 13, vision: 0, race: RACE_TRANSH, ..BD },
];

/// Rayon d'action d'une base de robots (cases) et nombre de robots par base.
pub const ROBOPORT_RANGE: i32 = 25;
pub const ROBOTS_PER_PORT: usize = 8;

/// Véhicules de transport : 0 = train (rails, grande capacité), 1 = drone de fret (vol direct, rapide).
pub struct CarrierDef {
    pub capacity: u16,
    /// vitesse en sous-unités par tick
    pub speed: i32,
    /// durée d'un arrêt (chargement / déchargement), en ticks
    pub dock: u16,
    /// tampon d'une gare / d'un héliport (objets à envoyer, objets reçus : chacun)
    pub buffer: u16,
    pub cost: &'static [(u8, u16)],
    /// véhicules au plus par gare / héliport de départ
    pub max_per_station: usize,
}
pub const CARRIERS: [CarrierDef; 3] = [
    CarrierDef { capacity: 400, speed: 8 * 256 / 20, dock: 60, buffer: 1600, cost: &[(IRON_PLATE, 40), (GEAR, 20), (STEEL, 10)], max_per_station: 4 },
    CarrierDef { capacity: 25, speed: 24 * 256 / 20, dock: 20, buffer: 200, cost: &[(STEEL, 6), (CIRCUIT, 8)], max_per_station: 6 },
    // robot logistique (fourni avec sa base)
    CarrierDef { capacity: 5, speed: 14 * 256 / 20, dock: 6, buffer: 0, cost: &[], max_per_station: ROBOTS_PER_PORT },
];

/// Missile stratégique : composants livrés au silo par des bras.
pub const MISSILE_COST: &[(u8, u16)] = &[(COMPOSITE, 20), (PROCESSOR, 20), (REFINED_CRYSTAL, 10)];
pub const INTERCEPTOR_COST: &[(u8, u16)] = &[(PROCESSOR, 5), (COMPOSITE, 5)];

// ---------- Unités ----------
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Layer {
    Land = 0,
    Hover = 1,
    Naval = 2,
    Sub = 3,
    Air = 4,
}

pub struct UnitDef {
    pub key: &'static str,
    pub name: &'static str,
    pub layer: Layer,
    pub hp: i32,
    pub speed: i32, // dixièmes de case par seconde
    pub radius: i32, // 1/256 de case
    pub weapons: &'static [u8],
    pub vision: i32,
    pub radar: i32,
    pub cost: &'static [(u8, u16)],
    pub build: u16, // secondes
    pub tech: u8,
    pub factory: FactoryKind,
    pub build_power: i32,
    pub carry: u8,
    /// constructeur : drones de ravitaillement, rayon de ravitaillement (cases), soute (objets)
    pub drones: u8,
    pub supply: i32,
    pub hold: u16,
    pub shield_r: i32,
    pub shield_hp: i32,
    pub tier: u8,
    pub altitude: i32, // en 1/256 de case, pour le rendu
    /// race qui la produit (voir RACES)
    pub race: u8,
    /// unité de commandement : unique, sa destruction élimine le joueur
    pub commander: bool,
    /// organisme vivant (Souche) : famille d'armure « vivant » (voir combat::family_mult)
    pub bio: bool,
    /// chenillard des Transhumants : bâtiment qu'il devient une fois déployé (NO_KIND : aucun)
    pub deploys: u16,
    /// organisme de la Souche : taille de la portée pondue par la couveuse pour une entrée de file
    /// (0 : unité fabriquée une par une ; voir ponte.rs)
    pub litter: u8,
}

const UD: UnitDef = UnitDef {
    key: "",
    name: "",
    layer: Layer::Land,
    hp: 100,
    speed: 30,
    radius: 128,
    weapons: &[],
    vision: 20,
    radar: 0,
    cost: &[],
    build: 5,
    tech: 0,
    factory: FactoryKind::Land,
    build_power: 0,
    carry: 0,
    drones: 0,
    supply: 0,
    hold: 0,
    shield_r: 0,
    shield_hp: 0,
    tier: 1,
    altitude: 0,
    race: RACE_INDUS,
    commander: false,
    bio: false,
    deploys: NO_KIND,
    litter: 0,
};
/// Pas de type (bâtiment ou unité).
pub const NO_KIND: u16 = u16::MAX;

pub const U_COMMANDER: u16 = 0;
pub const U_ENG1: u16 = 1;
pub const U_LINE_ROBOT: u16 = 4;
pub const U_LIGHT_TANK: u16 = 6;
pub const U_ARTILLERY: u16 = 7;
pub const U_SONDE: u16 = 9;
pub const U_ASSAULT_WALKER: u16 = 10;
pub const U_SIEGE_WALKER: u16 = 16;
pub const U_HEAVY_ARTY: u16 = 18;
pub const U_GLIDER: u16 = 21;
pub const U_TRANSPORT: u16 = 22;
pub const U_SUB: u16 = 28;
pub const U_SPIDER: u16 = 31;
pub const U_COLOSSUS: u16 = 32;
pub const U_FORTRESS: u16 = 33;
pub const U_MOTHERSHIP: u16 = 34;
pub const U_HYPER: u16 = 35;
pub const U_ROACH: u16 = 36;
pub const U_DRAGON: u16 = 37;
pub const U_STAR_CRUISER: u16 = 38;
pub const U_INTERCEPTOR: u16 = 20;
pub const U_GUARDIAN: u16 = 39;
pub const U_ROCKET_BATTERY: u16 = 40;
pub const U_COMMANDO: u16 = 41;
pub const U_JAMMER: u16 = 42;
pub const U_DEPLOY_TURRET: u16 = 43;
pub const U_STEALTH_BOMBER: u16 = 44;
pub const U_EW_PLANE: u16 = 45;
pub const U_HEAVY_TRANSPORT: u16 = 46;
pub const U_CARRIER: u16 = 47;
pub const U_RAILGUN_SHIP: u16 = 48;
/// Bêtes de la faune (voir nature.rs), de la plus petite à la plus grande.
pub const U_BEAST_S: u16 = 49;
pub const U_BEAST_M: u16 = 50;
pub const U_BEAST_L: u16 = 51;
pub const U_ROLL_DROID: u16 = 52;
pub const U_REPLICATOR: u16 = 53;
pub const U_DISRUPTOR: u16 = 54;
// Souche
pub const U_QUEEN: u16 = 55;
pub const U_SOWER: u16 = 56;
pub const U_GNAWER: u16 = 57;
pub const U_SPITTER: u16 = 58;
pub const U_SHELL: u16 = 59;
pub const U_VINE: u16 = 60;
pub const U_MEMBRANE: u16 = 61;
// Transhumants
pub const U_ARK: u16 = 62;
pub const U_CH_DRILL: u16 = 63;
pub const U_CH_FURNACE: u16 = 64;
pub const U_CH_ASSEMBLER: u16 = 65;
pub const U_CH_REFINERY: u16 = 66;
pub const U_CH_GENERATOR: u16 = 67;
pub const U_CH_HOLD: u16 = 68;
pub const U_CH_LAB: u16 = 69;
pub const U_CH_WORKSHOP: u16 = 70;
pub const U_CH_BASTION: u16 = 71;
pub const U_TRACKER: u16 = 72;
pub const U_RIDER: u16 = 73;
pub const U_HARROW: u16 = 74;
pub const U_TOWED_GUN: u16 = 75;
pub const U_RAM: u16 = 76;
// œufs de la Souche (petit, moyen, gros : voir ponte.rs)
pub const U_EGG_S: u16 = 77;
pub const U_EGG_M: u16 = 78;
pub const U_EGG_L: u16 = 79;
/// rayon (cases) de la bulle du brouilleur : les unités alliées dedans n'apparaissent pas au radar ennemi
pub const JAM_RADIUS: i32 = 12;
/// intercepteurs embarqués au plus par porte-avions
pub const CARRIER_WING: u16 = 6;

pub const UNITS: [UnitDef; 80] = [
    UnitDef { key: "commander", name: "Robot de commandement", hp: 12000, speed: 22, radius: 180, weapons: &[0], vision: 26, factory: FactoryKind::None, build_power: 20, drones: 4, supply: 30, hold: 100, tier: 0, commander: true, ..UD },
    UnitDef { key: "eng1", name: "Drone ingénieur", layer: Layer::Hover, hp: 300, speed: 40, radius: 100, cost: &[(IRON_PLATE, 6), (GEAR, 2), (CIRCUIT, 2)], build: 6, tech: 2, build_power: 10, drones: 2, supply: 25, hold: 40, altitude: 160, ..UD },
    UnitDef { key: "eng3", name: "Drone ingénieur avancé", layer: Layer::Hover, hp: 700, speed: 45, radius: 110, cost: &[(STEEL, 5), (CIRCUIT, 4), (ENGINE, 2)], build: 10, tech: 10, build_power: 25, drones: 3, supply: 35, hold: 80, tier: 3, altitude: 170, ..UD },
    UnitDef { key: "eng5", name: "Drone ingénieur suprême", layer: Layer::Hover, hp: 1400, speed: 50, radius: 120, cost: &[(STEEL, 8), (PROCESSOR, 4), (ENGINE, 4)], build: 14, tech: T_LOGISTICS3, build_power: 50, drones: 4, supply: 45, hold: 160, tier: 5, altitude: 180, ..UD },
    UnitDef { key: "line_robot", name: "Robot de ligne", hp: 200, speed: 26, radius: 80, weapons: &[2], cost: &[(IRON_PLATE, 4), (GEAR, 1)], build: 3, tech: 2, ..UD },
    UnitDef { key: "moto", name: "Moto-glisseur", hp: 120, speed: 60, radius: 90, weapons: &[3], vision: 30, cost: &[(IRON_PLATE, 5), (GEAR, 2)], build: 3, tech: 2, altitude: 40, ..UD },
    UnitDef { key: "light_tank", name: "Char léger", hp: 550, speed: 30, radius: 130, weapons: &[4], cost: &[(STEEL, 3), (GEAR, 3), (CIRCUIT, 2)], build: 6, tech: 2, ..UD },
    UnitDef { key: "artillery", name: "Artillerie mobile", hp: 300, speed: 22, radius: 130, weapons: &[5], cost: &[(STEEL, 4), (GEAR, 3), (CIRCUIT, 3), (AMMO, 2)], build: 8, tech: 6, tier: 2, ..UD },
    UnitDef { key: "mobile_aa", name: "Défense antiaérienne mobile", hp: 350, speed: 28, radius: 130, weapons: &[6], cost: &[(STEEL, 3), (GEAR, 3), (CIRCUIT, 3), (AMMO, 2)], build: 7, tech: 6, tier: 2, ..UD },
    UnitDef { key: "sonde", name: "Sonde de détection", hp: 150, speed: 35, radius: 100, vision: 24, radar: 60, cost: &[(STEEL, 2), (CIRCUIT, 6)], build: 6, tech: 6, tier: 2, ..UD },
    UnitDef { key: "assault_walker", name: "Marcheur d'assaut", hp: 900, speed: 36, radius: 150, weapons: &[7], cost: &[(STEEL, 6), (ENGINE, 2), (AMMO, 4), (CIRCUIT, 3)], build: 10, tech: 12, tier: 3, ..UD },
    UnitDef { key: "hover_tank", name: "Char glisseur", layer: Layer::Hover, hp: 1800, speed: 32, radius: 170, weapons: &[8], cost: &[(STEEL, 8), (ENGINE, 3), (AMMO, 4), (FUEL, 4)], build: 14, tech: 12, tier: 3, altitude: 50, ..UD },
    UnitDef { key: "missile_launcher", name: "Lance-missiles mobile", hp: 400, speed: 25, radius: 140, weapons: &[9], cost: &[(STEEL, 6), (ENGINE, 2), (CIRCUIT, 6), (FUEL, 4)], build: 12, tech: 12, tier: 3, ..UD },
    UnitDef { key: "mobile_shield", name: "Générateur de bouclier mobile", hp: 400, speed: 28, radius: 140, cost: &[(STEEL, 6), (PROCESSOR, 4), (ENGINE, 2)], build: 14, tech: 15, shield_r: 8, shield_hp: 3000, tier: 4, ..UD },
    UnitDef { key: "ion_cannon", name: "Canon à ions mobile", hp: 700, speed: 28, radius: 150, weapons: &[10], cost: &[(STEEL, 8), (PROCESSOR, 4), (ENGINE, 3)], build: 15, tech: 16, tier: 4, ..UD },
    UnitDef { key: "drone_launcher", name: "Lanceur de drones guidés", hp: 800, speed: 26, radius: 150, weapons: &[11], cost: &[(STEEL, 8), (PROCESSOR, 5), (AMMO, 6)], build: 16, tech: 17, tier: 4, ..UD },
    UnitDef { key: "siege_walker", name: "Marcheur de siège", hp: 6000, speed: 20, radius: 320, weapons: &[12], carry: 8, cost: &[(STEEL, 30), (ENGINE, 10), (COMPOSITE, 10), (PROCESSOR, 5)], build: 35, tech: 18, tier: 4, ..UD },
    UnitDef { key: "shock_robot", name: "Robot de choc", hp: 3500, speed: 26, radius: 200, weapons: &[13], cost: &[(STEEL, 20), (COMPOSITE, 10), (PROCESSOR, 8), (REFINED_CRYSTAL, 4)], build: 25, tech: 25, tier: 5, ..UD },
    UnitDef { key: "heavy_artillery", name: "Artillerie lourde mobile", hp: 1200, speed: 16, radius: 220, weapons: &[14], cost: &[(STEEL, 25), (COMPOSITE, 10), (PROCESSOR, 6), (AMMO, 10)], build: 30, tech: 26, tier: 5, ..UD },
    UnitDef { key: "scout_plane", name: "Avion éclaireur", layer: Layer::Air, hp: 150, speed: 160, radius: 120, vision: 40, cost: &[(IRON_PLATE, 6), (GEAR, 3)], build: 5, tech: 4, factory: FactoryKind::Air, tier: 2, altitude: 2560, ..UD },
    UnitDef { key: "interceptor", name: "Intercepteur", layer: Layer::Air, hp: 400, speed: 140, radius: 130, weapons: &[15], cost: &[(STEEL, 4), (CIRCUIT, 4), (FUEL, 4)], build: 8, tech: 4, factory: FactoryKind::Air, tier: 2, altitude: 2816, ..UD },
    UnitDef { key: "glider", name: "Planeur d'attaque", layer: Layer::Air, hp: 350, speed: 120, radius: 130, weapons: &[16], cost: &[(STEEL, 4), (CIRCUIT, 4), (FUEL, 4), (AMMO, 2)], build: 8, tech: 4, factory: FactoryKind::Air, tier: 2, altitude: 1792, ..UD },
    UnitDef { key: "transport", name: "Transport", layer: Layer::Air, hp: 1200, speed: 100, radius: 220, carry: 10, cost: &[(STEEL, 10), (ENGINE, 4), (FUEL, 6)], build: 14, tech: 4, factory: FactoryKind::Air, tier: 2, altitude: 2048, ..UD },
    UnitDef { key: "gunship", name: "Canonnière", layer: Layer::Air, hp: 1600, speed: 50, radius: 220, weapons: &[17], cost: &[(STEEL, 10), (ENGINE, 4), (AMMO, 6), (FUEL, 6)], build: 16, tech: 13, factory: FactoryKind::Air, tier: 3, altitude: 1536, ..UD },
    UnitDef { key: "bomber", name: "Bombardier", layer: Layer::Air, hp: 1000, speed: 110, radius: 220, weapons: &[18], cost: &[(STEEL, 10), (ENGINE, 4), (AMMO, 10), (FUEL, 8)], build: 16, tech: 13, factory: FactoryKind::Air, tier: 3, altitude: 2560, ..UD },
    UnitDef { key: "asf", name: "Chasseur de supériorité", layer: Layer::Air, hp: 1400, speed: 160, radius: 170, weapons: &[19], cost: &[(STEEL, 10), (PROCESSOR, 4), (FUEL, 10), (COMPOSITE, 4)], build: 18, tech: 21, factory: FactoryKind::Air, tier: 4, altitude: 3072, ..UD },
    UnitDef { key: "strat_bomber", name: "Bombardier stratégique", layer: Layer::Air, hp: 4000, speed: 100, radius: 300, weapons: &[20], cost: &[(STEEL, 30), (PROCESSOR, 10), (COMPOSITE, 15), (FUEL, 20)], build: 40, tech: 32, factory: FactoryKind::Air, tier: 5, altitude: 3328, ..UD },
    UnitDef { key: "frigate", name: "Frégate", layer: Layer::Naval, hp: 2000, speed: 40, radius: 300, weapons: &[21, 22], vision: 28, cost: &[(STEEL, 20), (ENGINE, 5), (AMMO, 8)], build: 18, tech: 11, factory: FactoryKind::Naval, tier: 3, ..UD },
    UnitDef { key: "submarine", name: "Sous-marin", layer: Layer::Sub, hp: 1500, speed: 40, radius: 260, weapons: &[23], cost: &[(STEEL, 20), (ENGINE, 6), (CIRCUIT, 8)], build: 18, tech: 11, factory: FactoryKind::Naval, tier: 3, altitude: -200, ..UD },
    UnitDef { key: "destroyer", name: "Destroyer", layer: Layer::Naval, hp: 6000, speed: 35, radius: 420, weapons: &[24, 23], vision: 34, radar: 40, cost: &[(STEEL, 45), (ENGINE, 10), (AMMO, 15), (PROCESSOR, 4)], build: 35, tech: 22, factory: FactoryKind::Naval, tier: 4, ..UD },
    UnitDef { key: "missile_cruiser", name: "Croiseur lance-missiles", layer: Layer::Naval, hp: 7000, speed: 30, radius: 440, weapons: &[25, 26], vision: 34, radar: 60, cost: &[(STEEL, 50), (PROCESSOR, 15), (COMPOSITE, 20), (ENGINE, 10)], build: 45, tech: 33, factory: FactoryKind::Naval, tier: 5, ..UD },
    UnitDef { key: "spider", name: "Araignée de siège", hp: 40000, speed: 20, radius: 700, weapons: &[27, 38], vision: 36, cost: &[(STEEL, 200), (PROCESSOR, 80), (COMPOSITE, 100), (ENERGY_CELL, 40)], build: 120, tech: 37, factory: FactoryKind::Exp, tier: 6, ..UD },
    UnitDef { key: "colossus", name: "Colosse", hp: 50000, speed: 22, radius: 600, weapons: &[28], vision: 34, cost: &[(STEEL, 250), (PROCESSOR, 80), (COMPOSITE, 120), (ENERGY_CELL, 40)], build: 120, tech: 38, factory: FactoryKind::Exp, tier: 6, ..UD },
    UnitDef { key: "fortress", name: "Forteresse marchante", hp: 60000, speed: 16, radius: 900, weapons: &[29], vision: 36, cost: &[(STEEL, 300), (PROCESSOR, 100), (COMPOSITE, 150), (ENERGY_CELL, 50)], build: 150, tech: 39, factory: FactoryKind::Exp, shield_r: 14, shield_hp: 15000, tier: 6, ..UD },
    UnitDef { key: "mothership", name: "Vaisseau-mère", layer: Layer::Air, hp: 45000, speed: 40, radius: 1000, weapons: &[30], vision: 40, cost: &[(STEEL, 250), (PROCESSOR, 100), (COMPOSITE, 120), (ENERGY_CELL, 60)], build: 150, tech: 40, factory: FactoryKind::Exp, tier: 6, altitude: 4096, ..UD },
    UnitDef { key: "hyper_cruiser", name: "Croiseur hyperespace", layer: Layer::Air, hp: 35000, speed: 60, radius: 800, weapons: &[31, 32], vision: 40, radar: 50, cost: &[(STEEL, 250), (PROCESSOR, 90), (COMPOSITE, 100), (ENERGY_CELL, 50)], build: 140, tech: 41, factory: FactoryKind::Exp, tier: 6, altitude: 3584, ..UD },
    UnitDef { key: "roach", name: "Char Blatte", hp: 55000, speed: 26, radius: 720, weapons: &[39, 40], vision: 34, cost: &[(STEEL, 260), (PROCESSOR, 70), (COMPOSITE, 130), (ENERGY_CELL, 40)], build: 120, tech: 43, factory: FactoryKind::Exp, tier: 6, ..UD },
    UnitDef { key: "dragon", name: "Gros Chinois", layer: Layer::Air, hp: 42000, speed: 45, radius: 820, weapons: &[41, 42], vision: 38, cost: &[(STEEL, 220), (PROCESSOR, 90), (COMPOSITE, 110), (ENERGY_CELL, 60)], build: 140, tech: 44, factory: FactoryKind::Exp, tier: 6, altitude: 1536, ..UD },
    UnitDef { key: "star_cruiser", name: "Cuirassé stellaire", layer: Layer::Air, hp: 80000, speed: 22, radius: 1300, weapons: &[43, 44], vision: 44, radar: 60, cost: &[(STEEL, 400), (PROCESSOR, 150), (COMPOSITE, 200), (ENERGY_CELL, 80)], build: 200, tech: 45, factory: FactoryKind::Exp, tier: 6, altitude: 4352, ..UD },
    // ----- unités de ligne et de soutien (guerre électronique, marine lourde) -----
    UnitDef { key: "guardian", name: "Gardien", hp: 1500, speed: 28, radius: 150, weapons: &[45], cost: &[(STEEL, 7), (GEAR, 4), (CIRCUIT, 3), (AMMO, 2)], build: 9, tech: 12, tier: 3, ..UD },
    UnitDef { key: "rocket_battery", name: "Lance-roquettes à saturation", hp: 450, speed: 26, radius: 150, weapons: &[46], cost: &[(STEEL, 6), (CIRCUIT, 4), (FUEL, 4), (AMMO, 6)], build: 11, tech: 12, tier: 3, ..UD },
    UnitDef { key: "commando", name: "Commando furtif", hp: 380, speed: 36, radius: 90, weapons: &[47, 48], vision: 22, cost: &[(STEEL, 3), (PROCESSOR, 2), (CIRCUIT, 4)], build: 8, tech: T_ELECTRONIC_WARFARE, tier: 4, ..UD },
    UnitDef { key: "jammer", name: "Brouilleur mobile", hp: 500, speed: 30, radius: 130, cost: &[(STEEL, 4), (PROCESSOR, 3), (CIRCUIT, 6)], build: 10, tech: T_ELECTRONIC_WARFARE, tier: 4, ..UD },
    UnitDef { key: "deploy_turret", name: "Tourelle mobile déployable", hp: 2200, speed: 18, radius: 180, weapons: &[49], cost: &[(STEEL, 14), (ENGINE, 3), (AMMO, 6), (CIRCUIT, 4)], build: 16, tech: 14, tier: 4, ..UD },
    UnitDef { key: "stealth_bomber", name: "Bombardier furtif", layer: Layer::Air, hp: 1400, speed: 120, radius: 230, weapons: &[50], cost: &[(STEEL, 14), (PROCESSOR, 4), (COMPOSITE, 6), (FUEL, 10)], build: 24, tech: T_ELECTRONIC_WARFARE, factory: FactoryKind::Air, tier: 4, altitude: 2816, ..UD },
    UnitDef { key: "ew_plane", name: "Avion de guerre électronique", layer: Layer::Air, hp: 900, speed: 110, radius: 220, weapons: &[51], radar: 40, cost: &[(STEEL, 8), (PROCESSOR, 6), (FUEL, 8)], build: 18, tech: T_ELECTRONIC_WARFARE, factory: FactoryKind::Air, tier: 4, altitude: 2560, ..UD },
    UnitDef { key: "heavy_transport", name: "Transport lourd", layer: Layer::Air, hp: 4000, speed: 80, radius: 330, weapons: &[52], carry: 16, cost: &[(STEEL, 24), (ENGINE, 8), (COMPOSITE, 6), (FUEL, 12)], build: 26, tech: 13, factory: FactoryKind::Air, tier: 4, altitude: 2304, ..UD },
    UnitDef { key: "carrier", name: "Porte-avions", layer: Layer::Naval, hp: 9000, speed: 28, radius: 520, weapons: &[53], vision: 34, radar: 50, cost: &[(STEEL, 70), (ENGINE, 14), (PROCESSOR, 8), (FUEL, 20)], build: 50, tech: T_HEAVY_NAVY, factory: FactoryKind::Naval, tier: 5, ..UD },
    UnitDef { key: "railgun_ship", name: "Cuirassé à canons de rail", layer: Layer::Naval, hp: 9500, speed: 26, radius: 500, weapons: &[54, 26], vision: 34, radar: 40, cost: &[(STEEL, 70), (COMPOSITE, 25), (PROCESSOR, 12), (ENGINE, 12)], build: 55, tech: T_HEAVY_NAVY, factory: FactoryKind::Naval, tier: 5, ..UD },
    // faune (voir nature.rs) : elle naît dans les nids, aucune usine ne la produit, elle ne laisse pas d'épave
    UnitDef { key: "beast_s", name: "Petit mordeur", hp: 120, speed: 46, radius: 90, weapons: &[55], vision: 16, factory: FactoryKind::None, tier: 1, ..UD },
    UnitDef { key: "beast_m", name: "Mordeur", hp: 450, speed: 40, radius: 150, weapons: &[56], vision: 18, factory: FactoryKind::None, tier: 2, ..UD },
    UnitDef { key: "beast_l", name: "Grand mordeur", hp: 1600, speed: 34, radius: 230, weapons: &[57], vision: 20, factory: FactoryKind::None, tier: 3, ..UD },
    // droïde roulant : roule en boule (sans tirer), se déploie à l'arrêt en tourelle à bouclier
    UnitDef { key: "roll_droid", name: "Droïde roulant", hp: 650, speed: 72, radius: 110, weapons: &[59], cost: &[(STEEL, 5), (CIRCUIT, 4), (ENGINE, 1)], build: 9, tech: 12, shield_r: 2, shield_hp: 900, tier: 3, ..UD },
    // réplicateur : faune mécanique, insensible à toute arme sauf celle du disrupteur (voir combat.rs)
    UnitDef { key: "replicator", name: "Réplicateur", hp: 300, speed: 44, radius: 100, weapons: &[60], vision: 16, factory: FactoryKind::None, tier: 2, ..UD },
    UnitDef { key: "disruptor", name: "Disrupteur", hp: 450, speed: 32, radius: 120, weapons: &[61], cost: &[(IRON_PLATE, 8), (GEAR, 2), (CIRCUIT, 3)], build: 6, tech: 2, tier: 1, ..UD },
    // ----- Souche : organismes vivants, nés dans les couveuses (voir souche.rs) -----
    UnitDef { key: "queen", name: "Reine", hp: 10000, speed: 18, radius: 220, weapons: &[62], vision: 26, factory: FactoryKind::None, build_power: 15, tier: 0, commander: true, bio: true, race: RACE_SOUCHE, ..UD },
    UnitDef { key: "sower", name: "Semeur", hp: 250, speed: 34, radius: 90, cost: &[(SEVE, 30), (SELS, 5)], build: 6, build_power: 10, bio: true, race: RACE_SOUCHE, litter: 3, ..UD },
    UnitDef { key: "gnawer", name: "Rongeur", hp: 260, speed: 44, radius: 90, weapons: &[63], vision: 18, cost: &[(SEVE, 25), (SELS, 4)], build: 4, bio: true, race: RACE_SOUCHE, litter: 6, ..UD },
    UnitDef { key: "spitter", name: "Cracheur", hp: 320, speed: 26, radius: 130, weapons: &[64], vision: 22, cost: &[(SEVE, 50), (SELS, 20)], build: 8, tech: T_S_SPITTERS, tier: 2, bio: true, race: RACE_SOUCHE, litter: 4, ..UD },
    UnitDef { key: "shell", name: "Carapace", hp: 2200, speed: 26, radius: 200, weapons: &[65], cost: &[(SEVE, 120), (SELS, 40)], build: 14, tech: T_S_SHELLS, tier: 3, bio: true, race: RACE_SOUCHE, litter: 3, ..UD },
    UnitDef { key: "vine", name: "Liane", hp: 450, speed: 30, radius: 120, weapons: &[66], cost: &[(SEVE, 60), (SELS, 15)], build: 8, tech: T_S_VINES, tier: 2, bio: true, race: RACE_SOUCHE, litter: 4, ..UD },
    UnitDef { key: "membrane", name: "Planeur à membranes", layer: Layer::Air, hp: 400, speed: 110, radius: 160, weapons: &[68], vision: 26, cost: &[(SEVE, 70), (SELS, 25)], build: 10, tech: T_S_MEMBRANES, tier: 3, altitude: 1792, bio: true, race: RACE_SOUCHE, litter: 3, ..UD },
    // ----- Transhumants : l'Arche, les chenillards (modules repliés) et l'armée (voir transhumants.rs) -----
    UnitDef { key: "ark", name: "Arche", hp: 16000, speed: 16, radius: 360, weapons: &[69, 6], vision: 30, factory: FactoryKind::None, build_power: 20, drones: 4, supply: 30, hold: 100, tier: 0, commander: true, race: RACE_TRANSH, ..UD },
    UnitDef { key: "ch_drill", name: "Chariot foreuse", hp: 1200, speed: 20, radius: 209, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 6), (GEAR, 6)], build: 10, race: RACE_TRANSH, deploys: B_T_DRILL, ..UD },
    UnitDef { key: "ch_furnace", name: "Chenillard fonderie", hp: 1000, speed: 20, radius: 209, cost: &[(IRON_PLATE, 12), (COPPER_PLATE, 4), (GEAR, 4)], build: 8, race: RACE_TRANSH, deploys: B_T_FURNACE, ..UD },
    UnitDef { key: "ch_assembler", name: "Chenillard assembleur", hp: 1200, speed: 20, radius: 209, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 8), (GEAR, 6)], build: 10, race: RACE_TRANSH, deploys: B_T_ASSEMBLER, ..UD },
    UnitDef { key: "ch_refinery", name: "Chenillard raffinerie", hp: 1400, speed: 20, radius: 209, cost: &[(STEEL, 10), (GEAR, 8), (CIRCUIT, 4)], build: 14, tech: T_T_REFINING, race: RACE_TRANSH, deploys: B_T_REFINERY, ..UD },
    UnitDef { key: "ch_generator", name: "Chenillard générateur", hp: 1400, speed: 20, radius: 209, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 10), (GEAR, 6)], build: 10, race: RACE_TRANSH, deploys: B_T_GENERATOR, ..UD },
    UnitDef { key: "ch_hold", name: "Chenillard soute", hp: 2000, speed: 20, radius: 209, cost: &[(IRON_PLATE, 16), (GEAR, 4)], build: 8, race: RACE_TRANSH, deploys: B_T_HOLD, ..UD },
    UnitDef { key: "ch_lab", name: "Chenillard laboratoire", hp: 1000, speed: 20, radius: 209, cost: &[(IRON_PLATE, 14), (COPPER_PLATE, 14), (GEAR, 4)], build: 10, race: RACE_TRANSH, deploys: B_T_LAB, ..UD },
    UnitDef { key: "ch_workshop", name: "Chenillard atelier", hp: 6000, speed: 16, radius: 314, cost: &[(IRON_PLATE, 40), (GEAR, 16), (COPPER_PLATE, 12)], build: 24, race: RACE_TRANSH, deploys: B_T_WORKSHOP, ..UD },
    UnitDef { key: "ch_bastion", name: "Chenillard bastion", hp: 3000, speed: 18, radius: 209, cost: &[(STEEL, 24), (AMMO, 10), (CIRCUIT, 6)], build: 16, tech: T_T_BASTION, tier: 2, race: RACE_TRANSH, deploys: B_T_BASTION, ..UD },
    UnitDef { key: "tracker", name: "Pisteur", hp: 220, speed: 70, radius: 100, weapons: &[70], vision: 40, cost: &[(IRON_PLATE, 5), (GEAR, 2)], build: 3, race: RACE_TRANSH, ..UD },
    UnitDef { key: "rider", name: "Cavalier", hp: 800, speed: 40, radius: 140, weapons: &[71], cost: &[(STEEL, 4), (GEAR, 3), (CIRCUIT, 2)], build: 7, race: RACE_TRANSH, ..UD },
    UnitDef { key: "harrow", name: "Herse", hp: 400, speed: 32, radius: 130, weapons: &[6], cost: &[(STEEL, 3), (GEAR, 3), (CIRCUIT, 2), (AMMO, 2)], build: 7, race: RACE_TRANSH, ..UD },
    UnitDef { key: "towed_gun", name: "Canon tracté", hp: 420, speed: 24, radius: 150, weapons: &[72], cost: &[(STEEL, 5), (GEAR, 3), (AMMO, 3)], build: 9, tech: T_T_HEAVY_SHOP, tier: 2, race: RACE_TRANSH, ..UD },
    UnitDef { key: "ram", name: "Bélier", hp: 2800, speed: 28, radius: 200, weapons: &[73], cost: &[(STEEL, 10), (GEAR, 6), (CIRCUIT, 2)], build: 12, tech: T_T_HEAVY_SHOP, tier: 2, race: RACE_TRANSH, ..UD },
    // ----- Souche : œufs pondus par les couveuses (voir ponte.rs). Immobiles, sans arme, ils éclosent
    // en l'organisme qu'ils portent ; l'œuf d'une espèce est choisi d'après sa taille (ponte::egg_of) -----
    UnitDef { key: "egg_s", name: "Œuf", hp: 100, speed: 0, radius: 60, vision: 3, factory: FactoryKind::None, tier: 0, bio: true, race: RACE_SOUCHE, ..UD },
    UnitDef { key: "egg_m", name: "Œuf", hp: 180, speed: 0, radius: 85, vision: 3, factory: FactoryKind::None, tier: 0, bio: true, race: RACE_SOUCHE, ..UD },
    UnitDef { key: "egg_l", name: "Gros œuf", hp: 600, speed: 0, radius: 140, vision: 3, factory: FactoryKind::None, tier: 0, bio: true, race: RACE_SOUCHE, ..UD },
];

/// Vitesse d'une unité en sous-unités par tick.
#[inline]
pub fn unit_speed(kind: u16) -> i32 {
    UNITS[kind as usize].speed * TILE / 200
}

/// Unités qu'une entrée de file d'usine fait naître : la portée d'un organisme de la Souche, sinon une.
#[inline]
pub fn batch(kind: u16) -> u16 {
    UNITS[kind as usize].litter.max(1) as u16
}

/// Durée d'une entrée de file d'usine, en ticks à puissance nominale : le temps de fabrication de
/// l'unité, ou la gestation d'une portée (la moitié du temps cumulé de ses organismes).
#[inline]
pub fn factory_ticks(kind: u16) -> u32 {
    let d = &UNITS[kind as usize];
    if d.litter > 0 {
        d.build as u32 * 10 * d.litter as u32
    } else {
        d.build as u32 * 20
    }
}

#[inline]
pub fn bdef(kind: u16) -> &'static BuildingDef {
    &BUILDINGS[kind as usize]
}
#[inline]
pub fn udef(kind: u16) -> &'static UnitDef {
    &UNITS[kind as usize]
}

/// Valeur de recyclage d'une épave : moitié du coût ramené en plaques de fer et acier.
pub fn wreck_value(cost: &[(u8, u16)]) -> (i32, i32) {
    let mut iron = 0i32;
    let mut steel = 0i32;
    for &(it, n) in cost {
        let n = n as i32;
        match it {
            STEEL | ENGINE | AMMO | COMPOSITE => steel += n,
            _ => iron += n,
        }
    }
    ((iron / 2).max(1), steel / 2)
}

// ---------- Export JSON pour le client ----------
fn js(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            _ => o.push(c),
        }
    }
    o.push('"');
    o
}
fn cost_js(c: &[(u8, u16)]) -> String {
    let v: Vec<String> = c.iter().map(|(i, n)| format!("[{},{}]", i, n)).collect();
    format!("[{}]", v.join(","))
}

pub fn data_json() -> String {
    let mut s = String::from("{\"items\":[");
    for (i, it) in ITEMS.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!("{{\"key\":{},\"name\":{},\"color\":{}}}", js(it.key), js(it.name), it.color));
    }
    s.push_str("],\"races\":[");
    for (i, r) in RACES.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!("{{\"key\":{},\"name\":{},\"desc\":{}}}", js(r.key), js(r.name), js(r.desc)));
    }
    s.push_str("],\"recipes\":[");
    for (i, r) in RECIPES.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        let ins: Vec<String> = r.inputs.iter().map(|(a, b)| format!("[{},{}]", a, b)).collect();
        s.push_str(&format!(
            "{{\"key\":{},\"crafter\":{},\"inputs\":[{}],\"output\":[{},{}],\"time\":{},\"tech\":{}}}",
            js(r.key), r.crafter as u8, ins.join(","), r.output.0, r.output.1, r.time, r.tech
        ));
    }
    s.push_str("],\"weapons\":[");
    for (i, w) in WEAPONS.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!(
            "{{\"dmg\":{},\"range\":{},\"cooldown\":{},\"proj\":{},\"aoe\":{},\"mask\":{},\"salvo\":{},\"sustain\":{}}}",
            w.dmg, w.range, w.cooldown, w.proj as u8, w.aoe, w.mask, w.salvo, w.sustain
        ));
    }
    s.push_str("],\"techs\":[");
    for (i, t) in TECHS.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        let p: Vec<String> = t.prereq.iter().map(|x| x.to_string()).collect();
        s.push_str(&format!(
            "{{\"key\":{},\"name\":{},\"tier\":{},\"count\":{},\"time\":{},\"prereq\":[{}],\"desc\":{},\"race\":{},\"excl\":{}}}",
            js(t.key), js(t.name), t.tier, t.count, t.time, p.join(","), js(t.desc), t.race, t.excl
        ));
    }
    s.push_str("],\"buildings\":[");
    for (i, b) in BUILDINGS.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!(
            "{{\"key\":{},\"name\":{},\"w\":{},\"h\":{},\"hp\":{},\"powerUse\":{},\"powerProd\":{},\"cost\":{},\"build\":{},\"tech\":{},\"cls\":{},\"speed\":{},\"crafter\":{},\"factory\":{},\"weapon\":{},\"supply\":{},\"connect\":{},\"radar\":{},\"shieldR\":{},\"deposit\":{},\"water\":{},\"passable\":{},\"reach\":{},\"collect\":{},\"race\":{}}}",
            js(b.key), js(b.name), b.size.0, b.size.1, b.hp, b.power_use, b.power_prod, cost_js(b.cost), b.build, b.tech,
            b.class as u8, b.speed, b.crafter as u8, b.factory as u8, b.weapon, b.supply, b.connect, b.radar, b.shield_r, b.deposit, b.water, b.passable, b.reach, b.collect, b.race
        ));
    }
    s.push_str("],\"units\":[");
    for (i, u) in UNITS.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        let ws: Vec<String> = u.weapons.iter().map(|x| x.to_string()).collect();
        s.push_str(&format!(
            "{{\"key\":{},\"name\":{},\"layer\":{},\"hp\":{},\"speed\":{},\"radius\":{},\"weapons\":[{}],\"vision\":{},\"radar\":{},\"cost\":{},\"build\":{},\"tech\":{},\"factory\":{},\"buildPower\":{},\"carry\":{},\"drones\":{},\"supply\":{},\"hold\":{},\"shieldR\":{},\"tier\":{},\"altitude\":{},\"race\":{},\"commander\":{},\"bio\":{},\"deploys\":{},\"litter\":{},\"egg\":{}}}",
            js(u.key), js(u.name), u.layer as u8, u.hp, u.speed, u.radius, ws.join(","), u.vision, u.radar, cost_js(u.cost), u.build, u.tech,
            u.factory as u8, u.build_power, u.carry, u.drones, u.supply, u.hold, u.shield_r, u.tier, u.altitude, u.race, u.commander, u.bio, if u.deploys == NO_KIND { -1 } else { u.deploys as i32 }, u.litter, matches!(i as u16, U_EGG_S | U_EGG_M | U_EGG_L)
        ));
    }
    let carriers: Vec<String> = CARRIERS.iter().map(|c| format!("{{\"capacity\":{},\"speed\":{},\"buffer\":{},\"cost\":{}}}", c.capacity, c.speed, c.buffer, cost_js(c.cost))).collect();
    let levels: Vec<String> = EXTRACTOR_LEVELS.iter().map(|l| format!("{{\"speed\":{},\"power\":{},\"cost\":{},\"tech\":{},\"time\":{}}}", l.speed, l.power, cost_js(l.cost), l.tech, l.time)).collect();
    let furn: Vec<String> = FURNACE_LEVELS.iter().map(|l| format!("{{\"speed\":{},\"power\":{},\"cost\":{},\"tech\":{},\"time\":{}}}", l.speed, l.power, cost_js(l.cost), l.tech, l.time)).collect();
    let gens: Vec<String> = GENERATOR_LEVELS.iter().map(|l| format!("{{\"prod\":{},\"cost\":{},\"tech\":{},\"time\":{}}}", l.prod, cost_js(l.cost), l.tech, l.time)).collect();
    let mains: Vec<String> = MAIN_GENERATOR_LEVELS.iter().map(|l| format!("{{\"supply\":{},\"connect\":{},\"cost\":{},\"tech\":{},\"time\":{}}}", l.supply, l.connect, cost_js(l.cost), l.tech, l.time)).collect();
    let asm: Vec<String> = ASSEMBLER_UPGRADES.iter().map(|u| format!("[{},{},{}]", u.0, u.1, u.2)).collect();
    s.push_str(&format!(
        "],\"missileCost\":{},\"interceptorCost\":{},\"carriers\":[{}],\"extractorLevels\":[{}],\"furnaceLevels\":[{}],\"generatorLevels\":[{}],\"mainGeneratorLevels\":[{}],\"assemblerUpgrades\":[{}],\"depot\":{{\"cap\":[{},{}],\"upgradeCost\":{},\"upgradeTech\":{},\"upgradeTime\":{},\"maxFilters\":{},\"droneCap\":{},\"droneSpeed\":{},\"factoryDrones\":{},\"factorySupply\":{},\"near\":{}}},\"fuel\":{{\"hydrocarbon\":{},\"refined\":{},\"cell\":{},\"tankUnits\":{}}}}}",
        cost_js(MISSILE_COST),
        cost_js(INTERCEPTOR_COST),
        carriers.join(","),
        levels.join(","),
        furn.join(","),
        gens.join(","),
        mains.join(","),
        asm.join(","),
        DEPOT_CAP[0],
        DEPOT_CAP[1],
        cost_js(DEPOT_UPGRADE_COST),
        DEPOT_UPGRADE_TECH,
        DEPOT_UPGRADE_TIME,
        MAX_FILTERS,
        DRONE_CAP,
        DRONE_SPEED,
        FACTORY_DRONES,
        FACTORY_SUPPLY,
        NEAR_SUPPLY,
        FUEL_HYDROCARBON,
        FUEL_REFINED,
        FUEL_CELL,
        FUEL_TANK_UNITS
    ));
    s
}
