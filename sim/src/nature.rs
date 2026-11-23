//! Faune : nids de mordeurs placés dans les zones disputées (autour des gisements de cristal et entre les
//! joueurs), comme les nids de Factorio. Chaque nid fait naître des bêtes jusqu'à un plafond qui grandit
//! avec son âge de façon logarithmique ; les bêtes naissent de plus en plus grosses avec le temps de jeu
//! (évolution). Les bâtiments des joueurs proches d'un nid (pollution) rendent une attaque de plus en plus
//! probable ; la horde ne part qu'une fois assez nombreuse (les 2/3 de son plafond), et toute ensemble.
//! Les nids mûrs essaiment lentement : quelques bêtes vont fonder un nid à côté, loin des joueurs.
//!
//! La faune est un joueur caché, le dernier de `World::players`, d'équipe NATURE_TEAM. Elle ne donne
//! aucun ordre par le réseau : ses bêtes reçoivent leurs ordres d'ici, à chaque tick, de façon déterministe.

use crate::buildings;
use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::map::P_LAND;
use crate::units::{clear_goal, clear_orders};
use crate::world::*;

/// Équipe de la faune (les équipes des joueurs vont de 0 à 7).
pub const NATURE_TEAM: u8 = 8;

/// Réglage du salon (dernier paramètre d'init) : aucune faune, paisible, normale, agressive.
pub const FAUNA_NONE: u8 = 0;
pub const FAUNA_PEACEFUL: u8 = 1;
pub const FAUNA_NORMAL: u8 = 2;
pub const FAUNA_AGGRESSIVE: u8 = 3;

/// Cadence de la logique d'un nid et d'une horde en marche (ticks), étalée selon l'indice.
const NEST_PERIOD: u32 = 20;
const RAID_PERIOD: u32 = 10;
/// Tentative d'attaque : une par nid toutes les 10 s.
const ATTACK_CHECK: u32 = 200;
/// Après une attaque, le nid se reconstitue au moins une minute avant d'en tenter une autre.
const ATTACK_COOLDOWN: u32 = 1200;
/// Rayon (cases) dans lequel les bâtiments d'un joueur inquiètent un nid (sa « pollution »).
pub const PRESSURE_R: i32 = 48;
/// Territoire d'un nid (cases) : un ennemi qui y entre est attaqué (faune normale ou agressive).
const TERRITORY_R: i32 = 14;
/// Une bête au combat fonce sur l'ennemi le plus proche dans ce rayon (cases).
const AGGRO_R: i32 = 9;
/// Une bête de la maison qui s'éloigne de plus de ce rayon (cases) de son nid y retourne.
const LEASH_R: i32 = 10;
/// Une alerte (nid ou bête touchés) dure 10 s.
const ALARM_TICKS: u32 = 200;
/// Les hordes se rassemblent au plus 8 s avant de partir.
const GATHER_TICKS: u32 = 160;
/// Une attaque dure au plus 6 min avant que les survivants rentrent.
const RAID_MAX_TICKS: u32 = 7200;
/// Bêtes au départ dans chaque nid.
const START_HORDE: usize = 3;
/// Bêtes envoyées fonder un nouveau nid.
const EXPANSION_PARTY: usize = 4;
/// Âge minimal d'un nid qui essaime (5 min).
const EXPANSION_MIN_AGE: u32 = 6000;
/// Distance (cases) entre un nid et son essaim, et entre deux nids.
const EXPANSION_MIN: i32 = 12;
const EXPANSION_MAX: i32 = 28;
const NEST_SPACING: i32 = 7;
/// Aucun nid ne naît à moins de ce rayon (cases) d'un bâtiment de joueur.
const EXPANSION_CLEAR_R: i32 = 32;
/// Points de vie rendus à un nid par seconde, hors alerte.
const NEST_REGEN: i32 = 20;
/// Rayon (cases) où un coup reçu alerte le nid ; une bête de sa horde touchée l'alerte jusqu'à CALL_R.
const ALARM_R: i32 = 24;
const CALL_R: i32 = 40;
/// Poursuite : la horde ne s'éloigne pas à plus de CHASE_R cases du nid pour défendre (au-delà de
/// CHASE_R + 4, elle rentre) ; un tireur plus lointain déclenche une contre-attaque.
const CHASE_R: i32 = 16;
/// Délai entre deux contre-attaques d'un même nid (ticks).
const COUNTER_COOLDOWN: u32 = 600;
/// Ponte d'urgence d'un nid frappé : délai entre deux salves (ticks).
const BURST_COOLDOWN: u32 = 300;
/// Charge : une bête qui fonce sur une unité à moins de CHARGE_R cases court 40 % plus vite.
const CHARGE_R: i32 = 12;

/// Équipes des joueurs (bits 0 à 7 des masques des grilles).
const PLAYERS_MASK: u16 = 0x00ff;

#[derive(Clone, Default)]
pub struct Nest {
    /// bâtiment (référence avec génération)
    pub b: u32,
    /// tick de fondation : l'âge fixe le plafond de la horde
    pub born: u32,
    /// ticks avant la prochaine naissance
    pub spawn: u32,
    /// bêtes restées au nid (identifiants)
    pub horde: Vec<u32>,
    /// alerte : jusqu'à ce tick, la horde défend le nid en fonçant vers (ax, ay)
    pub alarm: u32,
    pub ax: i32,
    pub ay: i32,
    /// prochaine tentative d'attaque (tick)
    pub next_try: u32,
    /// joueur qui a frappé en dernier (cible d'une contre-attaque)
    pub foe: u8,
    /// prochaine contre-attaque permise (tick)
    pub counter: u32,
    /// dernier coup reçu par le nid lui-même, et prochaine ponte d'urgence permise (ticks)
    pub struck: u32,
    pub burst: u32,
    /// espèce : 0 mordeurs (nid), 1 réplicateurs (ruche)
    pub species: u8,
    /// apprivoisement par une Reine de la Souche : joueur + 1 (0 : personne) et avancement (ticks)
    pub tamer: u8,
    pub tame: u16,
}
crate::ser_struct!(Nest { b, born, spawn, horde, alarm, ax, ay, next_try; since 2: foe, counter, struck, burst, species; since 5: tamer, tame });

/// Nid greffé : un nid de mordeurs apprivoisé par une Reine de la Souche. Il appartient au joueur et fait
/// naître pour lui des mordeurs, sans coût mais lentement (voir `update_den`).
#[derive(Clone, Default)]
pub struct Den {
    /// bâtiment (référence)
    pub b: u32,
    pub owner: u8,
    /// ticks avant la prochaine naissance
    pub spawn: u32,
    /// bêtes nées du nid (ou apprivoisées avec lui) encore en vie
    pub brood: Vec<u32>,
}
crate::ser_struct!(Den { b, owner, spawn, brood });

/// Apprivoisement : la Reine doit rester à moins de TAME_R cases du nid pendant TAME_TICKS (30 s).
pub const TAME_R: i32 = 6;
pub const TAME_TICKS: u16 = 600;
/// Nid greffé : une portée de DEN_LITTER œufs toutes les DEN_PERIOD × DEN_LITTER ticks (une bête par
/// 20 s), tant que moins de DEN_BROOD bêtes du nid sont en vie (œufs compris).
pub const DEN_PERIOD: u32 = 400;
pub const DEN_BROOD: usize = 6;
pub const DEN_LITTER: usize = 3;
/// Événement : un nid a été apprivoisé (joueur, x, y).
pub const EV_TAMED: i32 = 47;

/// Espèces de la faune.
pub const SPECIES_BEASTS: u8 = 0;
pub const SPECIES_REPLICATORS: u8 = 1;

/// Ruine des Anciens : garde un EPPZ jusqu'à ce qu'un joueur le capture en y stationnant seul.
#[derive(Clone, Default)]
pub struct Ruin {
    /// bâtiment (référence)
    pub b: u32,
    /// joueur qui capture (255 : personne) et avancement (ticks)
    pub holder: u8,
    pub progress: u16,
}
crate::ser_struct!(Ruin { b, holder, progress });

/// Capture d'un EPPZ : 10 s seul à moins de RUIN_R cases de la ruine.
pub const RUIN_CAPTURE: u16 = 200;
const RUIN_R: i32 = 4;

pub const RAID_GATHER: u8 = 0;
pub const RAID_ASSAULT: u8 = 1;
pub const RAID_RETURN: u8 = 2;
pub const RAID_EXPAND: u8 = 3;

/// Groupe de bêtes en route : attaque (rassemblement, assaut, retour) ou essaim qui fonde un nid.
#[derive(Clone, Default)]
pub struct Raid {
    pub units: Vec<u32>,
    pub state: u8,
    /// point visé (sous-unités) : bâtiment attaqué, point de rassemblement ou site du nouveau nid
    pub tx: i32,
    pub ty: i32,
    /// joueur attaqué
    pub target: u8,
    /// nid d'origine (référence de bâtiment)
    pub home: u32,
    /// tick du début de l'état courant, et du départ
    pub since: u32,
    pub started: u32,
    /// assaut : point d'arrivée de la horde, après le rassemblement
    pub gx: i32,
    pub gy: i32,
}
crate::ser_struct!(Raid { units, state, tx, ty, target, home, since, started, gx, gy });

#[derive(Clone, Default)]
pub struct Nature {
    /// réglage (FAUNA_…) ; 0 : pas de faune
    pub level: u8,
    /// indice du joueur caché de la faune
    pub owner: u8,
    pub nests: Vec<Nest>,
    pub raids: Vec<Raid>,
    /// prochaine expansion (tick)
    pub next_expand: u32,
    /// plafond du nombre de nids et du nombre de bêtes
    pub max_nests: u32,
    pub max_beasts: u32,
    /// ruines des Anciens (EPPZ)
    pub ruins: Vec<Ruin>,
    /// bâtiments abattus par un réplicateur : un réplicateur naît sur place (x, y, réplicateur auteur)
    pub breed: Vec<Breed>,
    /// nids greffés (apprivoisés par la Souche)
    pub dens: Vec<Den>,
}

/// Réplicateur à faire naître (bâtiment dévoré) : position et réplicateur auteur.
#[derive(Clone, Default)]
pub struct Breed {
    pub x: i32,
    pub y: i32,
    pub author: u32,
}
crate::ser_struct!(Breed { x, y, author });
crate::ser_struct!(Nature { level, owner, nests, raids, next_expand, max_nests, max_beasts; since 2: ruins, breed; since 5: dens });

impl Nature {
    pub fn new(level: u8, owner: u8, map_w: i32) -> Nature {
        Nature { level, owner, max_beasts: (map_w * 3 / 2) as u32, ..Nature::default() }
    }
    #[inline]
    pub fn active(&self) -> bool {
        self.level != FAUNA_NONE
    }
}

/// Joueur caché de la faune (toujours le dernier de la liste).
pub fn nature_player() -> Player {
    Player {
        team: NATURE_TEAM,
        alive: true,
        is_bot: false,
        res_mult: 100,
        build_mult: 100,
        purse: [0; NUM_ITEMS],
        researched: 1,
        research: 0,
        research_queue: Vec::new(),
        tech_progress: vec![0; TECHS.len()],
        commander: NONE,
        produced: [0; NUM_ITEMS],
        consumed: [0; NUM_ITEMS],
        unit_count: 0,
        power_prod: 0,
        power_use: 0,
        kills: 0,
        losses: 0,
        old_stock_cap: 0,
        shards: 0,
        eppz: 0,
        race: 0,
        researched2: 0,
        scars: [0; crate::essaim::FAMILIES],
        adapt: 0,
    }
}

// ---------- Croissance ----------

/// log2(x / 256) en 1/256, pour x >= 256 (approximation linéaire de la mantisse, en entiers).
fn log2_q8(x: u64) -> u64 {
    let x = x.max(256);
    let k = 63 - x.leading_zeros() as u64 - 8;
    let m = x >> k; // dans [256, 512)
    k * 256 + (m - 256)
}

/// Plafond de la horde d'un nid selon son âge (ticks) : 5 bêtes à la fondation, puis
/// 5 + 7 × log2(1 + âge / 4 min) : 12 à 4 min, 19 à 12 min, 26 à 28 min, 33 à 1 h, 40 à 2 h.
/// La croissance ralentit sans cesse : un nid ne devient jamais invincible.
pub fn horde_max(age: u32, level: u8) -> usize {
    let l = log2_q8(256 + age as u64 * 256 / 4800);
    let m = 5 + 7 * l / 256;
    let m = if level == FAUNA_AGGRESSIVE { m * 13 / 10 } else { m };
    m.min(60) as usize
}

/// La horde attaque quand elle atteint les 2/3 de son plafond (arrondi au-dessus, au moins 3 bêtes).
pub fn attack_size(max: usize) -> usize {
    (max * 2).div_ceil(3).max(3)
}

/// Évolution de la faune (‰) selon le temps de jeu : 280 × log2(1 + t / 10 min), soit 280 à 10 min,
/// 560 à 30 min, 840 à 70 min, 1000 vers 2 h (agressive : le temps compte 1,5 fois).
pub fn evolution(tick: u32, level: u8) -> u32 {
    let t = if level == FAUNA_AGGRESSIVE { tick as u64 * 3 / 2 } else { tick as u64 };
    ((280 * log2_q8(256 + t * 256 / 12000)) / 256).min(1000) as u32
}

/// Ticks entre deux naissances dans un nid.
fn spawn_interval(level: u8) -> u32 {
    match level {
        FAUNA_PEACEFUL => 300,
        FAUNA_AGGRESSIVE => 120,
        _ => 200,
    }
}

/// Intervalle entre deux expansions (ticks) : de 7 à 12 min (agressive : de 4 à 7, paisible : de 10 à 15).
fn expand_interval(w: &mut World) -> u32 {
    let (lo, hi) = match w.nature.level {
        FAUNA_PEACEFUL => (12000, 18000),
        FAUNA_AGGRESSIVE => (4800, 8400),
        _ => (8400, 14400),
    };
    w.rng.range(lo, hi) as u32
}

/// Bête qui naît maintenant : de plus en plus de mordeurs et de grands mordeurs avec l'évolution.
fn beast_kind(w: &mut World) -> u16 {
    let e = evolution(w.tick, w.nature.level) as i32;
    let large = ((e - 550).max(0) * 4 / 5) as u32;
    let medium = e.min(500) as u32;
    let r = w.rng.below(1000);
    if r < large {
        U_BEAST_L
    } else if r < large + medium {
        U_BEAST_M
    } else {
        U_BEAST_S
    }
}

/// Probabilité (‰) qu'un nid attaque à une tentative, selon la pression des bâtiments voisins
/// (somme des poids de 4 à 16 : un bâtiment au bord du rayon pèse 4, un bâtiment collé au nid 16).
/// Un bâtiment seul à mi-distance : 1 % toutes les 10 s ; dix : 10 % ; quarante : 40 %.
pub fn attack_chance(pressure: u32, level: u8) -> u32 {
    let k = if level == FAUNA_AGGRESSIVE { 2 } else { 1 };
    (pressure * k).min(500)
}

// ---------- Outils ----------

/// Bête vivante (identifiant avec génération).
#[inline]
fn beast(w: &World, id: u32) -> Option<usize> {
    w.unit(id).filter(|&s| w.units.hp[s] > 0)
}

fn nest_center(w: &World, n: &Nest) -> Option<(i32, i32)> {
    w.building(n.b).map(|b| w.buildings[b].center())
}

/// Remplace les ordres de la bête.
fn command(w: &mut World, s: usize, o: Order) {
    clear_orders(w, s);
    w.units.cold[s].orders.push(o);
}

/// Ajoute un ordre en tête (la bête reprend ensuite l'ordre en cours).
fn push_front(w: &mut World, s: usize, o: Order) {
    clear_goal(w, s);
    let c = &mut w.units.cold[s];
    c.orders.insert(0, o);
    c.stuck = 0;
    c.noprog = 0;
    c.best_dist = i32::MAX;
}

fn move_to(x: i32, y: i32, attack: bool) -> Order {
    Order::Move { x, y, gx: x, gy: y, attack, eta: 0 }
}

/// Point (sous-unités) dans un rayon de `r` cases autour de (x, y), au hasard.
fn jitter(w: &mut World, x: i32, y: i32, r: i32) -> (i32, i32) {
    let mx = w.map.w * TILE - TILE;
    let my = w.map.h * TILE - TILE;
    ((x + w.rng.range(-r * TILE, r * TILE)).clamp(TILE, mx), (y + w.rng.range(-r * TILE, r * TILE)).clamp(TILE, my))
}

/// Unité de joueur qu'une bête peut mordre : au sol (pas en vol ni sur l'eau).
fn biteable_unit(w: &World, o: usize) -> bool {
    if !w.units.alive[o] || w.units.cold[o].carried_by != NONE || w.units.hp[o] <= 0 {
        return false;
    }
    match udef(w.units.kind[o]).layer {
        Layer::Land => true,
        Layer::Hover => {
            let (tx, ty) = (w.units.x[o] / TILE, w.units.y[o] / TILE);
            w.map.inside(tx, ty) && !w.map.is_water(tx, ty)
        }
        _ => false,
    }
}

/// Distance² de (x, y) au rectangle d'un bâtiment.
fn building_d2(bb: &Building, x: i32, y: i32) -> i64 {
    let (bw, bh) = bb.size();
    let nx = x.clamp(bb.x * TILE, (bb.x + bw) * TILE);
    let ny = y.clamp(bb.y * TILE, (bb.y + bh) * TILE);
    dist2(x, y, nx, ny)
}

/// Ennemi le plus proche de (x, y) dans `r` cases : unité au sol ou bâtiment d'un joueur. `walls` :
/// les murs et les relais comptent aussi (bête bloquée qui ronge l'obstacle) ; sinon ils sont ignorés.
/// `calm` : joueur + 1 dont rien ne compte (nid qu'une Reine apprivoise ; 0 : aucun).
fn nearest_enemy(w: &World, x: i32, y: i32, r: i32, walls: bool, calm: u8) -> u32 {
    let rr = r * TILE;
    let r2 = (rr as i64) * (rr as i64);
    let mut best = (i64::MAX, NONE);
    w.grid.coarse.query_teams(x, y, rr, PLAYERS_MASK, |o| {
        if w.team_of(w.units.owner[o]) == NATURE_TEAM || !biteable_unit(w, o) || w.units.owner[o].wrapping_add(1) == calm {
            return;
        }
        let d = dist2(x, y, w.units.x[o], w.units.y[o]);
        if d <= r2 && (d, o as u32) < (best.0, best.1) {
            best = (d, o as u32);
        }
    });
    let unit_best = if best.1 != NONE { Some((best.0, w.unit_id(best.1 as usize))) } else { None };
    let mut bbest = (i64::MAX, u32::MAX);
    w.grid.query_buildings_teams(x, y, rr + 2 * TILE, PLAYERS_MASK, |b| {
        let bb = &w.buildings[b];
        if !bb.alive || bb.hp <= 0 || bb.def().water || w.team_of(bb.owner) == NATURE_TEAM || bb.owner.wrapping_add(1) == calm {
            return;
        }
        if !walls && matches!(bb.def().class, BClass::Wall | BClass::Pylon) {
            return;
        }
        let d = building_d2(bb, x, y);
        if d <= r2 && (d, b as u32) < bbest {
            bbest = (d, b as u32);
        }
    });
    match (unit_best, bbest.1 != u32::MAX) {
        (Some((du, id)), true) => {
            if du <= bbest.0 {
                id
            } else {
                w.building_ref(bbest.1 as usize)
            }
        }
        (Some((_, id)), false) => id,
        (None, true) => w.building_ref(bbest.1 as usize),
        (None, false) => NONE,
    }
}

/// Bête au combat : elle mord ce qu'elle a à portée, sinon fonce sur l'ennemi le plus proche dans `r`
/// cases ; bloquée (contre un mur, dans une foule), elle mord l'obstacle le plus proche. Vrai si elle
/// est occupée à se battre.
fn fight(w: &mut World, s: usize, r: i32) -> bool {
    if w.units.cold[s].wtarget[0] != NONE {
        return true;
    }
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let calm = w.units.cold[s].calm;
    let first = w.units.cold[s].orders.first().copied();
    if let Some(Order::Attack { target }) = first {
        if w.ref_pos(target).is_some() {
            if w.units.cold[s].noprog > 60 {
                let t = nearest_enemy(w, x, y, 3, true, calm);
                if t != NONE && t != target {
                    push_front(w, s, Order::Attack { target: t });
                }
            }
            return true;
        }
    }
    let t = nearest_enemy(w, x, y, r, false, calm);
    if t != NONE {
        push_front(w, s, Order::Attack { target: t });
        return true;
    }
    if matches!(first, Some(Order::Move { .. })) && w.units.cold[s].stuck > 30 {
        let t = nearest_enemy(w, x, y, 3, true, calm);
        if t != NONE {
            push_front(w, s, Order::Attack { target: t });
            return true;
        }
    }
    false
}

// ---------- Placement ----------

/// Distance minimale (cases) entre un nid et une position de départ.
fn min_start_dist(w: &World) -> i32 {
    w.map.w * 60 / 512
}

fn far_from_starts(w: &World, tx: i32, ty: i32) -> bool {
    let d = min_start_dist(w);
    w.map.starts.iter().all(|&(sx, sy)| ((sx - tx) as i64).pow(2) + ((sy - ty) as i64).pow(2) >= (d as i64).pow(2))
}

fn near_nest(w: &World, cx: i32, cy: i32, r_tiles: i32) -> bool {
    let r = (r_tiles * TILE) as i64;
    w.nature.nests.iter().any(|n| nest_center(w, n).is_some_and(|(x, y)| dist2(x, y, cx, cy) <= r * r))
}

fn player_building_near(w: &World, cx: i32, cy: i32, r_tiles: i32) -> bool {
    let rr = r_tiles * TILE;
    let r2 = (rr as i64) * (rr as i64);
    let mut found = false;
    w.grid.query_buildings_teams(cx, cy, rr, PLAYERS_MASK, |b| {
        let bb = &w.buildings[b];
        if !found && bb.alive && w.team_of(bb.owner) != NATURE_TEAM && building_d2(bb, cx, cy) <= r2 {
            found = true;
        }
    });
    found
}

/// Pose un nid (case en haut à gauche) et l'inscrit ; renvoie son indice dans `nature.nests`.
pub(crate) fn found_nest(w: &mut World, x: i32, y: i32) -> Option<usize> {
    found_colony(w, x, y, SPECIES_BEASTS)
}

/// Fonde un nid (mordeurs) ou une ruche (réplicateurs) en (x, y).
pub(crate) fn found_colony(w: &mut World, x: i32, y: i32, species: u8) -> Option<usize> {
    let owner = w.nature.owner;
    let kind = if species == SPECIES_REPLICATORS { B_HIVE } else { B_NEST };
    let b = buildings::place_building(w, owner, kind, x, y, 0)?;
    buildings::complete_building(w, b);
    let r = w.building_ref(b);
    let spawn = w.rng.range(1, spawn_interval(w.nature.level) as i32) as u32;
    let tick = w.tick;
    w.nature.nests.push(Nest { b: r, born: tick, spawn, next_try: tick + ATTACK_CHECK, species, ..Nest::default() });
    Some(w.nature.nests.len() - 1)
}

/// Bête que fait naître la colonie `i` : un réplicateur dans une ruche, sinon selon l'évolution.
fn colony_kind(w: &mut World, i: usize) -> u16 {
    if w.nature.nests[i].species == SPECIES_REPLICATORS {
        U_REPLICATOR
    } else {
        beast_kind(w)
    }
}

/// Arme qui blesse les réplicateurs : projectile cinétique (balle, obus, canon de rail).
pub fn kinetic(weapon: u8) -> bool {
    (weapon as usize) < WEAPONS.len() && matches!(WEAPONS[weapon as usize].proj, Proj::Bullet | Proj::Shell | Proj::Rail)
}

/// Dégâts reçus par un réplicateur (ou sa ruche) ou infligés par un disrupteur : seuls les armes à feu,
/// les obus (et le canon de rail) et le disrupteur blessent les réplicateurs ; les armes à énergie,
/// missiles, bombes et lances-flammes ne leur font rien. Le disrupteur ne fait qu'un cinquième de ses
/// dégâts au reste.
pub fn replicator_damage(w: &World, replicator: bool, dmg: i32) -> i32 {
    if dmg <= 0 {
        return dmg;
    }
    let disruptor = w.unit(w.shooter).is_some_and(|s| w.units.kind[s] == U_DISRUPTOR);
    match (replicator, disruptor) {
        (true, false) if !kinetic(w.hit_weapon) => 0,
        (false, true) => (dmg / 5).max(1),
        _ => dmg,
    }
}

/// Un bâtiment de joueur vient d'être abattu en (x, y) : si c'est l'œuvre d'un réplicateur, un autre
/// réplicateur naîtra sur place (les réplicateurs se multiplient en dévorant le métal).
pub fn building_killed(w: &mut World, x: i32, y: i32) {
    if !w.nature.active() {
        return;
    }
    if let Some(s) = w.unit(w.shooter) {
        if w.units.kind[s] == U_REPLICATOR && w.nature.breed.len() < 64 {
            let id = w.shooter;
            w.nature.breed.push(Breed { x, y, author: id });
        }
    }
}

/// Fait naître une bête au bord du nid `i`.
pub(crate) fn spawn_beast(w: &mut World, i: usize, kind: u16) -> bool {
    let Some((cx, cy)) = nest_center(w, &w.nature.nests[i]) else { return false };
    let a = w.rng.below(65536) as u16;
    let r = 2 * TILE + TILE / 2;
    let x = cx + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32;
    let y = cy + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32;
    let (x, y) = buildings::free_spot_near(w, x, y, P_LAND);
    let owner = w.nature.owner;
    let id = w.spawn_unit(kind, owner, x, y);
    if let Some(s) = w.unit(id) {
        w.units.facing[s] = a;
    }
    w.nature.nests[i].horde.push(id);
    true
}

/**
 * Nids de départ, dans les zones disputées seulement : autour de chaque gisement de cristal et au milieu
 * de chaque paire de départs voisins, jamais près d'une position de départ. Chaque colonie compte 2 ou 3
 * nids, avec quelques bêtes chacun. Appelé une fois, à la création d'une vraie partie.
 */
pub fn place_initial_nests(w: &mut World) {
    if !w.nature.active() {
        return;
    }
    let mut pts: Vec<(i32, i32)> = w.map.spots.iter().filter(|s| s.kind == CRYSTAL).map(|s| (s.x + 1, s.y + 1)).collect();
    let starts = w.map.starts.clone();
    if starts.len() >= 2 {
        for i in 0..starts.len() {
            let (ax, ay) = starts[i];
            let (bx, by) = starts[(i + 1) % starts.len()];
            pts.push(((ax + bx) / 2, (ay + by) / 2));
        }
    }
    // une seule colonie par zone
    let mut colonies: Vec<(i32, i32)> = Vec::new();
    for p in pts {
        if far_from_starts(w, p.0, p.1) && colonies.iter().all(|c| (c.0 - p.0).pow(2) + (c.1 - p.1).pow(2) >= 24 * 24) {
            colonies.push(p);
        }
    }
    for &(px, py) in &colonies {
        let want = 2 + w.rng.below(2) as usize;
        let mut placed = 0;
        for _try in 0..60 {
            if placed >= want {
                break;
            }
            let a = w.rng.below(65536) as u16;
            let r = w.rng.range(6, 14);
            let tx = px + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32;
            let ty = py + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32;
            if !far_from_starts(w, tx, ty) || near_nest(w, tx * TILE, ty * TILE, NEST_SPACING) {
                continue;
            }
            if let Some(i) = found_nest(w, tx - 1, ty - 1) {
                for _ in 0..START_HORDE {
                    spawn_beast(w, i, U_BEAST_S);
                }
                placed += 1;
            }
        }
    }
    let n = w.nature.nests.len() as u32;
    w.nature.max_nests = (n * 3).clamp(8, (w.map.w / 8) as u32);
    w.nature.next_expand = expand_interval(w);
    place_hives_and_ruins(w, &colonies);
}

/// Ruches de réplicateurs (une, deux en faune agressive) au centre de la carte ou entre deux départs,
/// loin des nids ; ruines des Anciens (une pour deux joueurs, au moins une) près des colonies de mordeurs,
/// qui les gardent.
fn place_hives_and_ruins(w: &mut World, colonies: &[(i32, i32)]) {
    let np = w.map.starts.len();
    let mut cands = vec![(w.map.w / 2, w.map.h / 2)];
    let starts = w.map.starts.clone();
    for i in 0..starts.len() {
        let (ax, ay) = starts[i];
        let (bx, by) = starts[(i + 1) % starts.len()];
        cands.push(((ax + bx + w.map.w / 2) / 3, (ay + by + w.map.h / 2) / 3));
    }
    let hives = if w.nature.level == FAUNA_AGGRESSIVE { 2 } else { 1 };
    let mut placed = 0;
    for &(px, py) in &cands {
        if placed >= hives {
            break;
        }
        for _try in 0..40 {
            let tx = px + w.rng.range(-12, 12);
            let ty = py + w.rng.range(-12, 12);
            if !far_from_starts(w, tx, ty) || near_nest(w, tx * TILE, ty * TILE, 16) {
                continue;
            }
            if let Some(i) = found_colony(w, tx - 1, ty - 1, SPECIES_REPLICATORS) {
                for _ in 0..START_HORDE {
                    spawn_beast(w, i, U_REPLICATOR);
                }
                placed += 1;
                break;
            }
        }
    }
    let ruins = (np / 2).max(1);
    let owner = w.nature.owner;
    for &(px, py) in colonies.iter().take(ruins) {
        for _try in 0..40 {
            let a = w.rng.below(65536) as u16;
            let r = w.rng.range(4, 9);
            let tx = px + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32;
            let ty = py + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32;
            if !far_from_starts(w, tx, ty) {
                continue;
            }
            if let Some(b) = buildings::place_building(w, owner, B_RUIN, tx - 1, ty - 1, 0) {
                buildings::complete_building(w, b);
                w.buildings[b].working = true;
                let rf = w.building_ref(b);
                w.nature.ruins.push(Ruin { b: rf, holder: 255, progress: 0 });
                break;
            }
        }
    }
}

/// Fiche d'une ruine des Anciens : [EPPZ encore là (0/1), joueur qui capture (-1 : personne), avancement ‰] ;
/// « null » pour un autre bâtiment.
pub fn ruin_info(w: &World, b: usize) -> String {
    let r = w.building_ref(b);
    match w.nature.ruins.iter().find(|x| x.b == r) {
        Some(x) => format!("[{},{},{}]", w.buildings[b].working as i32, if x.holder == 255 { -1 } else { x.holder as i32 }, x.progress as u32 * 1000 / RUIN_CAPTURE as u32),
        None => "null".to_string(),
    }
}

/// Ruines : un seul joueur (ses unités terrestres) à moins de RUIN_R cases pendant 10 s capture l'EPPZ.
fn update_ruins(w: &mut World) {
    let rr = ((RUIN_R * TILE) as i64).pow(2);
    for k in 0..w.nature.ruins.len() {
        let Some(b) = w.building(w.nature.ruins[k].b) else { continue };
        if !w.buildings[b].working {
            continue;
        }
        let (cx, cy) = w.buildings[b].center();
        let mut who: Option<u8> = None;
        let mut contested = false;
        let mut found: Vec<usize> = Vec::new();
        w.grid.fine.query(cx, cy, RUIN_R * TILE, |o| found.push(o));
        found.sort_unstable();
        for o in found {
            if !w.units.alive[o] || w.units.cold[o].carried_by != NONE || dist2(cx, cy, w.units.x[o], w.units.y[o]) > rr {
                continue;
            }
            let p = w.units.owner[o];
            if w.team_of(p) == NATURE_TEAM || !matches!(udef(w.units.kind[o]).layer, Layer::Land | Layer::Hover) {
                continue;
            }
            match who {
                None => who = Some(p),
                Some(q) if w.team_of(q) != w.team_of(p) => contested = true,
                _ => {}
            }
        }
        let r = &mut w.nature.ruins[k];
        match who {
            Some(p) if !contested => {
                if r.holder != p {
                    r.holder = p;
                    r.progress = 0;
                }
                r.progress += NEST_PERIOD as u16;
                if r.progress >= RUIN_CAPTURE {
                    w.buildings[b].working = false;
                    w.players[p as usize].eppz += 1;
                    w.ev(EV_EPPZ, p as i32, cx, cy, 0);
                }
            }
            Some(_) => {}
            None => {
                r.holder = 255;
                r.progress = 0;
            }
        }
    }
}

/// Réplicateurs nés d'un bâtiment dévoré : ils rejoignent l'attaque de leur auteur, sinon la ruche la plus proche.
fn breed(w: &mut World) {
    let list = std::mem::take(&mut w.nature.breed);
    for Breed { x, y, author } in list {
        if w.players[w.nature.owner as usize].unit_count >= w.nature.max_beasts {
            break;
        }
        let (fx, fy) = buildings::free_spot_near(w, x, y, P_LAND);
        let id = w.spawn_unit(U_REPLICATOR, w.nature.owner, fx, fy);
        if let Some(k) = w.nature.raids.iter().position(|r| r.units.contains(&author)) {
            w.nature.raids[k].units.push(id);
        } else if let Some(j) = w.nature.nests.iter().enumerate().filter(|(_, n)| n.species == SPECIES_REPLICATORS).filter_map(|(j, n)| nest_center(w, n).map(|(cx, cy)| (dist2(cx, cy, fx, fy), j))).min().map(|(_, j)| j) {
            w.nature.nests[j].horde.push(id);
        }
    }
}

// ---------- Alerte ----------

/// Une bête ou un nid de la faune touché en (x, y) : les nids proches (24 cases) défendent, en fonçant
/// vers le tireur (w.hit_from) s'il est connu.
pub fn on_hit(w: &mut World, x: i32, y: i32, victim: u32, attacker: u8) {
    if !w.nature.active() {
        return;
    }
    let (ax, ay) = if w.hit_from.0 != i32::MIN { w.hit_from } else { (x, y) };
    let zone = ((ALARM_R * TILE) as i64).pow(2);
    let call = ((CALL_R * TILE) as i64).pow(2);
    let until = w.tick + ALARM_TICKS;
    let tick = w.tick;
    for i in 0..w.nature.nests.len() {
        let Some((cx, cy)) = nest_center(w, &w.nature.nests[i]) else { continue };
        let d = dist2(cx, cy, x, y);
        let n = &mut w.nature.nests[i];
        // le joueur qui apprivoise ce nid frappe le nid ou sa horde : l'apprivoisement repart de zéro
        if n.tamer != 0 && n.tamer == attacker.wrapping_add(1) && (n.b == victim || n.horde.contains(&victim)) {
            n.tamer = 0;
            n.tame = 0;
        }
        // près du nid, ou une bête de sa horde attirée plus loin : le nid riposte
        if d <= zone || (d <= call && n.horde.contains(&victim)) {
            n.alarm = until;
            n.ax = ax;
            n.ay = ay;
            n.foe = attacker;
        }
        if n.b == victim {
            n.struck = tick;
        }
    }
}

/// Dégâts subis par un nid : il durcit avec l'évolution (de 20 % à 60 % de dégâts en moins).
pub fn nest_damage(w: &World, dmg: i32) -> i32 {
    if dmg <= 0 {
        return dmg;
    }
    let resist = 200 + evolution(w.tick, w.nature.level) as i64 * 2 / 5;
    ((dmg as i64 * (1000 - resist) / 1000) as i32).max(1)
}

/// Vitesse d'une bête : elle charge (40 % plus vite) l'unité qu'elle attaque quand elle est à moins de
/// CHARGE_R cases, pour rattraper ce qui tire en reculant.
pub fn charge_speed(w: &World, s: usize, speed: i32) -> i32 {
    if !matches!(w.units.kind[s], U_BEAST_S | U_BEAST_M | U_BEAST_L) {
        return speed;
    }
    if let Some(Order::Attack { target }) = w.units.cold[s].orders.first() {
        if let Some(t) = w.unit(*target) {
            if dist2(w.units.x[s], w.units.y[s], w.units.x[t], w.units.y[t]) <= ((CHARGE_R * TILE) as i64).pow(2) {
                return speed * 7 / 5;
            }
        }
    }
    speed
}

// ---------- Tick ----------

pub fn update(w: &mut World) {
    if !w.nature.active() {
        return;
    }
    if !w.nature.breed.is_empty() {
        breed(w);
    }
    if w.tick.is_multiple_of(NEST_PERIOD) && !w.nature.ruins.is_empty() {
        update_ruins(w);
    }
    let mut i = 0;
    while i < w.nature.nests.len() {
        if (w.tick + i as u32).is_multiple_of(NEST_PERIOD) {
            match update_nest(w, i) {
                NestFate::Lives => {}
                NestFate::Destroyed => {
                    remove_nest(w, i);
                    continue;
                }
                // apprivoisé : déjà retiré de la liste (il est devenu un nid greffé)
                NestFate::Tamed => continue,
            }
        }
        i += 1;
    }
    let mut k = 0;
    while k < w.nature.dens.len() {
        if (w.tick + k as u32).is_multiple_of(NEST_PERIOD) && !update_den(w, k) {
            w.nature.dens.remove(k);
            continue;
        }
        k += 1;
    }
    let mut k = 0;
    while k < w.nature.raids.len() {
        if (w.tick + k as u32).is_multiple_of(RAID_PERIOD) && !update_raid(w, k) {
            w.nature.raids.remove(k);
            continue;
        }
        k += 1;
    }
    if w.tick >= w.nature.next_expand {
        w.nature.next_expand = w.tick + expand_interval(w);
        try_expand(w);
    }
}

/// Nid détruit : le joueur qui l'a frappé en dernier gagne des fragments d'énergie (1 à 3 selon
/// l'évolution) ; sa horde rejoint le nid le plus proche (40 cases), ou reste sur place, sans maître.
fn remove_nest(w: &mut World, i: usize) {
    let n = w.nature.nests.remove(i);
    let foe = n.foe as usize;
    if n.struck != 0 && foe < w.players.len() && w.players[foe].team != NATURE_TEAM && w.players[foe].alive {
        let k = 1 + evolution(w.tick, w.nature.level) / 400;
        w.players[foe].shards += k;
        w.ev(EV_SHARDS, foe as i32, 0, 0, k as i32);
    }
    let horde: Vec<u32> = n.horde.into_iter().filter(|&id| beast(w, id).is_some()).collect();
    let Some(&first) = horde.first() else { return };
    let Some(s) = w.unit(first) else { return };
    let (x, y) = (w.units.x[s], w.units.y[s]);
    if let Some(j) = nearest_nest(w, x, y, 40) {
        w.nature.nests[j].horde.extend(horde);
    }
}

fn nearest_nest(w: &World, x: i32, y: i32, r_tiles: i32) -> Option<usize> {
    let mut best = (((r_tiles * TILE) as i64).pow(2) + 1, usize::MAX);
    for (j, n) in w.nature.nests.iter().enumerate() {
        if let Some((cx, cy)) = nest_center(w, n) {
            let d = dist2(cx, cy, x, y);
            if d < best.0 {
                best = (d, j);
            }
        }
    }
    (best.1 != usize::MAX).then_some(best.1)
}

/// Sort d'un nid après une seconde de sa vie.
enum NestFate {
    Lives,
    Destroyed,
    Tamed,
}

/// Une seconde de la vie d'un nid.
fn update_nest(w: &mut World, i: usize) -> NestFate {
    let Some(b) = w.building(w.nature.nests[i].b) else { return NestFate::Destroyed };
    let (cx, cy) = w.buildings[b].center();
    let level = w.nature.level;
    let horde: Vec<u32> = std::mem::take(&mut w.nature.nests[i].horde).into_iter().filter(|&id| beast(w, id).is_some()).collect();
    w.nature.nests[i].horde = horde;
    if taming(w, i, cx, cy) {
        return NestFate::Tamed;
    }
    let n = &w.nature.nests[i];
    let age = w.tick.saturating_sub(n.born);
    let max = horde_max(age, level);
    let alarmed = w.tick < n.alarm;
    // le nid se referme peu à peu hors alerte
    if !alarmed {
        let full = bdef(B_NEST).hp;
        let bb = &mut w.buildings[b];
        bb.hp = (bb.hp + NEST_REGEN).min(full);
    }
    // naissances
    let n = &mut w.nature.nests[i];
    n.spawn = n.spawn.saturating_sub(NEST_PERIOD);
    if n.spawn == 0 {
        n.spawn = spawn_interval(level);
        let room = w.players[w.nature.owner as usize].unit_count < w.nature.max_beasts;
        // une ruche pond deux fois moins vite qu'un nid
        if w.nature.nests[i].species == SPECIES_REPLICATORS {
            w.nature.nests[i].spawn *= 2;
        }
        if w.nature.nests[i].horde.len() < max && room {
            let kind = colony_kind(w, i);
            spawn_beast(w, i, kind);
        }
    }
    // nid frappé : ponte d'urgence, quelques défenseurs d'un coup (au plus une fois et demie le plafond)
    let n = &w.nature.nests[i];
    if n.struck != 0 && w.tick.saturating_sub(n.struck) < NEST_PERIOD * 2 && w.tick >= n.burst {
        w.nature.nests[i].burst = w.tick + BURST_COOLDOWN;
        let k = 2 + evolution(w.tick, level) as usize / 250;
        for _ in 0..k {
            let room = w.players[w.nature.owner as usize].unit_count < w.nature.max_beasts;
            if w.nature.nests[i].horde.len() >= max + max / 2 || !room {
                break;
            }
            let kind = colony_kind(w, i);
            spawn_beast(w, i, kind);
        }
    }
    defend(w, i, cx, cy, alarmed);
    // attaque : horde assez grande, et un joueur qui s'est trop développé près du nid
    if level >= FAUNA_NORMAL && w.tick >= w.nature.nests[i].next_try {
        w.nature.nests[i].next_try = w.tick + ATTACK_CHECK;
        let n = &w.nature.nests[i];
        if n.horde.len() >= attack_size(max) && !alarmed && n.tamer == 0 {
            consider_attack(w, i, cx, cy);
        }
    }
    NestFate::Lives
}

// ---------- Apprivoisement (Souche) ----------

/// Propriétaire d'une unité ou d'un bâtiment (référence), s'il existe.
fn owner_of(w: &World, r: u32) -> Option<u8> {
    if r == NONE {
        return None;
    }
    if let Some(u) = w.unit(r) {
        return Some(w.units.owner[u]);
    }
    w.building(r).map(|b| w.buildings[b].owner)
}

/// Nid de mordeurs sauvage (pas une ruche) de référence `r` : son indice dans `nature.nests`.
pub fn wild_nest(w: &World, r: u32) -> Option<usize> {
    w.building(r)?;
    w.nature.nests.iter().position(|n| n.b == r && n.species == SPECIES_BEASTS)
}

/// Apprivoisement en cours du nid `b`, pour l'affichage : (joueur + 1, avancement ‰) ; (0, 0) : aucun.
pub fn tame_state(w: &World, b: usize) -> (u8, i32) {
    let r = w.building_ref(b);
    w.nature.nests.iter().find(|n| n.b == r).map_or((0, 0), |n| (n.tamer, n.tame as i32 * 1000 / TAME_TICKS as i32))
}

/// Avancement (‰) du nid que la Reine `s` apprivoise (0 : pas encore assez près) ; -1 : elle n'en apprivoise pas.
pub fn queen_tame(w: &World, s: usize) -> i32 {
    let Some(&Order::Tame { target }) = w.units.cold[s].orders.first() else { return -1 };
    let Some(b) = w.building(target) else { return -1 };
    let (tamer, t) = tame_state(w, b);
    if tamer == w.units.owner[s] + 1 { t } else { 0 }
}

/// Le nid `b` est-il en train d'être apprivoisé par un joueur de l'équipe `team` ?
pub fn tamed_by_team(w: &World, b: usize, team: u8) -> bool {
    let r = w.building_ref(b);
    w.nature.nests.iter().any(|n| n.b == r && n.tamer != 0 && w.team_of(n.tamer - 1) == team)
}

/// Nids greffés du joueur.
pub fn dens_of(w: &World, p: u8) -> usize {
    w.nature.dens.iter().filter(|d| d.owner == p).count()
}

/// Apprivoisement d'un nid sauvage (chaque seconde) : la première Reine de la Souche (par indice) qui a
/// l'ordre de l'apprivoiser et entre dans son territoire (TERRITORY_R cases) le calme (sa horde épargne ce
/// joueur) ; à moins de TAME_R cases, l'apprivoisement avance, et au bout de TAME_TICKS le nid est à elle.
/// Sans Reine (partie, morte, autre ordre), tout retombe à zéro. Vrai si le nid vient d'être apprivoisé
/// (il est alors retiré de `nature.nests`).
fn taming(w: &mut World, i: usize, cx: i32, cy: i32) -> bool {
    if w.nature.nests[i].species != SPECIES_BEASTS {
        return false;
    }
    let r = w.nature.nests[i].b;
    let near = ((TAME_R * TILE) as i64).pow(2);
    let zone = ((TERRITORY_R * TILE) as i64).pow(2);
    let mut found: Vec<usize> = Vec::new();
    w.grid.fine.query(cx, cy, TERRITORY_R * TILE, |o| found.push(o));
    found.sort_unstable();
    found.dedup();
    let mut who: Option<(u8, bool)> = None;
    for o in found {
        if !w.units.alive[o] || w.units.hp[o] <= 0 || w.units.kind[o] != U_QUEEN {
            continue;
        }
        let d = dist2(cx, cy, w.units.x[o], w.units.y[o]);
        let p = w.units.owner[o];
        if d <= zone && matches!(w.units.cold[o].orders.first(), Some(&Order::Tame { target }) if target == r) && crate::souche::den_room(w, p) {
            who = Some((p, d <= near));
            break;
        }
    }
    let n = &mut w.nature.nests[i];
    match who {
        Some((p, close)) => {
            if n.tamer != p + 1 {
                n.tamer = p + 1;
                n.tame = 0;
            }
            if close {
                n.tame += NEST_PERIOD as u16;
                if n.tame >= TAME_TICKS {
                    tame_nest(w, i, p, cx, cy);
                    return true;
                }
            }
        }
        None => {
            n.tamer = 0;
            n.tame = 0;
        }
    }
    false
}

/// Le nid `i` passe au joueur `p` : il devient un nid greffé, et sa horde le suit.
fn tame_nest(w: &mut World, i: usize, p: u8, cx: i32, cy: i32) {
    let n = w.nature.nests.remove(i);
    let Some(b) = w.building(n.b) else { return };
    let (x, y) = (w.buildings[b].x, w.buildings[b].y);
    let (bw, bh) = w.buildings[b].size();
    w.grid.remove_building(b as u32, x, y, bw, bh);
    w.buildings[b].owner = p;
    w.buildings[b].target = NONE;
    // pas de ralliement tant que le joueur n'en donne pas : les bêtes restent au nid
    w.buildings[b].rally = (0, 0);
    let team = w.team_of(p);
    w.grid.add_building(b as u32, x, y, bw, bh, team);
    w.buildings_version = w.buildings_version.wrapping_add(1);
    let mut brood = Vec::new();
    for id in n.horde {
        if let Some(s) = beast(w, id) {
            if adopt(w, s, p) {
                brood.push(id);
            }
        }
    }
    w.nature.dens.push(Den { b: n.b, owner: p, spawn: DEN_PERIOD, brood });
    w.ev(EV_TAMED, p as i32, cx, cy, 0);
}

/// Une bête de la faune passe au joueur `p` (dans la limite de ses unités) : elle oublie ses ordres.
fn adopt(w: &mut World, s: usize, p: u8) -> bool {
    if w.players[p as usize].unit_count >= UNIT_CAP {
        return false;
    }
    let old = w.units.owner[s] as usize;
    clear_orders(w, s);
    let c = &mut w.units.cold[s];
    c.wtarget = [NONE; 2];
    c.calm = 0;
    w.units.owner[s] = p;
    w.players[old].unit_count = w.players[old].unit_count.saturating_sub(1);
    w.players[p as usize].unit_count += 1;
    true
}

/// Une seconde d'un nid greffé. Faux s'il a été détruit (ou a changé de maître).
fn update_den(w: &mut World, k: usize) -> bool {
    let Some(b) = w.building(w.nature.dens[k].b) else { return false };
    let owner = w.nature.dens[k].owner;
    if w.buildings[b].owner != owner || !w.players[owner as usize].alive {
        return false;
    }
    let brood: Vec<u32> = std::mem::take(&mut w.nature.dens[k].brood).into_iter().filter(|&id| w.unit(id).is_some_and(|s| w.units.hp[s] > 0 && w.units.owner[s] == owner)).collect();
    w.nature.dens[k].brood = brood;
    let full = bdef(B_NEST).hp;
    let bb = &mut w.buildings[b];
    bb.hp = (bb.hp + NEST_REGEN).min(full);
    let d = &mut w.nature.dens[k];
    d.spawn = d.spawn.saturating_sub(NEST_PERIOD);
    if d.spawn > 0 {
        return true;
    }
    // pas de place (bêtes du nid en vie, limite d'unités) : nouvel essai dans 20 s
    d.spawn = DEN_PERIOD;
    if d.brood.len() >= DEN_BROOD || w.players[owner as usize].unit_count + DEN_LITTER as u32 > UNIT_CAP {
        return true;
    }
    // comme une couveuse, le nid pond une portée d'œufs devant lui (voir ponte.rs) ; les mordeurs qui en
    // sortent restent au nid tant que le joueur ne lui donne pas de point de ralliement
    w.nature.dens[k].spawn = DEN_PERIOD * DEN_LITTER as u32;
    let kind = beast_kind(w);
    let rally = Some(w.buildings[b].rally).filter(|&(rx, ry)| rx > 0 || ry > 0);
    let eggs = crate::ponte::lay_from(w, b, kind, DEN_LITTER, rally);
    w.nature.dens[k].brood.extend(eggs);
    true
}

/// Un œuf a éclos : dans la portée d'un nid greffé, la bête qui en sort prend sa place.
pub fn egg_hatched(w: &mut World, egg: u32, born: u32) {
    for d in w.nature.dens.iter_mut() {
        if let Some(slot) = d.brood.iter_mut().find(|id| **id == egg) {
            *slot = born;
            return;
        }
    }
}

/// Défense du territoire et vie au nid : en alerte (ou quand un ennemi entre dans le territoire, sauf
/// faune paisible), la horde fonce ; sinon les bêtes qui se sont éloignées rentrent, et quelques-unes
/// rôdent autour du nid.
fn defend(w: &mut World, i: usize, cx: i32, cy: i32, alarmed: bool) {
    let level = w.nature.level;
    // nid qu'une Reine apprivoise : sa horde est calmée envers ce joueur (ni intrus, ni cible), et lâche
    // ce qu'elle lui faisait
    let calm = w.nature.nests[i].tamer;
    let intruder = if level >= FAUNA_NORMAL { nearest_enemy(w, cx, cy, TERRITORY_R, false, calm) } else { NONE };
    let horde = w.nature.nests[i].horde.clone();
    for &id in &horde {
        let Some(s) = beast(w, id) else { continue };
        if w.units.cold[s].calm != calm {
            w.units.cold[s].calm = calm;
        }
        if calm != 0 {
            let on_tamer = match w.units.cold[s].orders.first() {
                Some(&Order::Attack { target }) => owner_of(w, target).is_some_and(|o| o.wrapping_add(1) == calm),
                _ => false,
            };
            if on_tamer || w.units.cold[s].wtarget.iter().any(|&t| owner_of(w, t).is_some_and(|o| o.wrapping_add(1) == calm)) {
                w.units.cold[s].wtarget = [NONE; 2];
                let (x, y) = jitter(w, cx, cy, 3);
                command(w, s, move_to(x, y, false));
            }
        }
    }
    if alarmed || intruder != NONE {
        let (ax, ay) = (w.nature.nests[i].ax, w.nature.nests[i].ay);
        // tireur hors de portée de poursuite (artillerie, tir de loin) : contre-attaque en règle
        let far = intruder == NONE && dist2(cx, cy, ax, ay) > ((CHASE_R * TILE) as i64).pow(2);
        if far && counter_attack(w, i, cx, cy) {
            return;
        }
        // on ne se laisse pas attirer loin du nid (vers une ligne de tourelles)
        let chase = (((CHASE_R + 4) * TILE) as i64).pow(2);
        for &id in &horde {
            let Some(s) = beast(w, id) else { continue };
            if dist2(w.units.x[s], w.units.y[s], cx, cy) > chase {
                let (x, y) = jitter(w, cx, cy, 4);
                command(w, s, move_to(x, y, false));
                continue;
            }
            if fight(w, s, AGGRO_R) {
                continue;
            }
            if intruder != NONE {
                command(w, s, Order::Attack { target: intruder });
            } else if !far && !matches!(w.units.cold[s].orders.first(), Some(Order::Move { attack: true, .. })) {
                let (x, y) = jitter(w, ax, ay, 2);
                command(w, s, move_to(x, y, true));
            }
        }
        return;
    }
    let leash = ((LEASH_R * TILE) as i64).pow(2);
    // une bête qui a poursuivi un intrus trop loin abandonne la poursuite une fois l'alerte passée
    let recall = ((2 * LEASH_R * TILE) as i64).pow(2);
    for &id in &horde {
        let Some(s) = beast(w, id) else { continue };
        let d2 = dist2(w.units.x[s], w.units.y[s], cx, cy);
        let c = &w.units.cold[s];
        let chasing = matches!(c.orders.first(), Some(Order::Attack { .. }) | Some(Order::Move { attack: true, .. }));
        if chasing && d2 > recall {
            let (x, y) = jitter(w, cx, cy, 4);
            command(w, s, move_to(x, y, false));
            continue;
        }
        if !c.orders.is_empty() || c.wtarget[0] != NONE {
            continue;
        }
        if d2 > leash {
            let (x, y) = jitter(w, cx, cy, 4);
            command(w, s, move_to(x, y, false));
        }
    }
    // rôdeurs : une bête au repos fait quelques pas autour du nid, de temps en temps
    if !horde.is_empty() && w.rng.below(4) == 0 {
        let id = horde[w.rng.below(horde.len() as u32) as usize];
        if let Some(s) = beast(w, id) {
            if w.units.cold[s].orders.is_empty() && w.units.cold[s].wtarget[0] == NONE {
                let (x, y) = jitter(w, cx, cy, 5);
                command(w, s, move_to(x, y, false));
            }
        }
    }
}

/// Pression des bâtiments de chaque joueur autour du nid : somme des poids (4 au bord du rayon, 16 au
/// contact). Tapis, bras, murs et relais ne comptent pas. Renvoie aussi, par joueur, son bâtiment le
/// plus proche du nid.
fn pressure(w: &World, cx: i32, cy: i32) -> Vec<(u32, u32, i64)> {
    let np = w.players.len();
    let mut out: Vec<(u32, u32, i64)> = vec![(0, NONE, i64::MAX); np];
    let rr = PRESSURE_R * TILE;
    let mut found: Vec<usize> = Vec::new();
    w.grid.query_buildings_teams(cx, cy, rr, PLAYERS_MASK, |b| found.push(b));
    found.sort_unstable();
    found.dedup();
    for b in found {
        let bb = &w.buildings[b];
        if !bb.alive || w.team_of(bb.owner) == NATURE_TEAM || matches!(bb.def().class, BClass::Wall | BClass::Pylon) {
            continue;
        }
        let (bx, by) = bb.center();
        let d2 = dist2(cx, cy, bx, by);
        if d2 > (rr as i64) * (rr as i64) {
            continue;
        }
        let d = crate::fixed::isqrt(d2 as u64) as i64;
        let wgt = 4 + (12 * (rr as i64 - d) / rr as i64) as u32;
        let o = &mut out[bb.owner as usize];
        o.0 += wgt;
        if d2 < o.2 {
            o.2 = d2;
            o.1 = w.building_ref(b);
        }
    }
    out
}

/// Tentative d'attaque d'un nid dont la horde est prête.
/// Contre-attaque contre un tireur lointain (artillerie, navire, tir à longue portée) : la horde du nid,
/// et celles des nids voisins prêtes, partent en attaque vers le point de tir. Faux si le nid ne peut pas
/// (délai, horde trop maigre) : la horde reste alors défendre le nid.
fn counter_attack(w: &mut World, i: usize, cx: i32, cy: i32) -> bool {
    let n = &w.nature.nests[i];
    if w.tick < n.counter || n.horde.len() < 3 {
        return false;
    }
    let (ax, ay, foe) = (n.ax, n.ay, n.foe);
    w.nature.nests[i].counter = w.tick + COUNTER_COOLDOWN;
    launch_raid(w, i, cx, cy, ax, ay, foe);
    true
}

fn consider_attack(w: &mut World, i: usize, cx: i32, cy: i32) {
    let p = pressure(w, cx, cy);
    let total: u32 = p.iter().map(|x| x.0).sum();
    if total == 0 {
        return;
    }
    let chance = attack_chance(total, w.nature.level);
    if w.rng.below(1000) >= chance {
        return;
    }
    // le joueur le plus développé près du nid ; son bâtiment le plus proche du nid
    let mut victim = 0usize;
    for (k, x) in p.iter().enumerate() {
        if x.0 > p[victim].0 {
            victim = k;
        }
    }
    let target = p[victim].1;
    let Some((tx, ty)) = w.ref_pos(target) else { return };
    launch_raid(w, i, cx, cy, tx, ty, victim as u8);
}

/// Lance l'attaque du nid `i` (et des nids voisins dont la horde est prête) vers (tx, ty).
fn launch_raid(w: &mut World, i: usize, cx: i32, cy: i32, tx: i32, ty: i32, victim: u8) {
    let near = ((16 * TILE) as i64).pow(2);
    let tick = w.tick;
    let mut units: Vec<u32> = Vec::new();
    for j in 0..w.nature.nests.len() {
        let Some((x, y)) = nest_center(w, &w.nature.nests[j]) else { continue };
        let n = &w.nature.nests[j];
        let ready = n.horde.len() >= attack_size(horde_max(tick.saturating_sub(n.born), w.nature.level));
        if j == i || (dist2(x, y, cx, cy) <= near && ready && tick >= n.alarm) {
            let n = &mut w.nature.nests[j];
            units.append(&mut n.horde);
            n.next_try = tick + ATTACK_COOLDOWN;
        }
    }
    // rassemblement à quelques cases du nid, du côté de la cible
    let d = crate::fixed::dist(cx, cy, tx, ty).max(1);
    let gx = cx + ((tx - cx) as i64 * (5 * TILE) as i64 / d as i64) as i32;
    let gy = cy + ((ty - cy) as i64 * (5 * TILE) as i64 / d as i64) as i32;
    for &id in &units {
        if let Some(s) = beast(w, id) {
            let (x, y) = jitter(w, gx, gy, 2);
            command(w, s, move_to(x, y, true));
        }
    }
    let home = w.nature.nests[i].b;
    w.nature.raids.push(Raid { units, state: RAID_GATHER, tx, ty, target: victim, home, since: tick, started: tick, gx, gy });
}

/// Quelques bêtes d'un nid mûr partent fonder un nid à côté, loin des joueurs.
fn try_expand(w: &mut World) {
    if w.nature.nests.len() as u32 >= w.nature.max_nests {
        return;
    }
    let tick = w.tick;
    let cands: Vec<usize> = (0..w.nature.nests.len())
        .filter(|&j| {
            let n = &w.nature.nests[j];
            tick.saturating_sub(n.born) >= EXPANSION_MIN_AGE && n.horde.len() >= EXPANSION_PARTY && tick >= n.alarm
        })
        .collect();
    if cands.is_empty() {
        return;
    }
    let i = cands[w.rng.below(cands.len() as u32) as usize];
    let Some((cx, cy)) = nest_center(w, &w.nature.nests[i]) else { return };
    let owner = w.nature.owner;
    for _try in 0..24 {
        let a = w.rng.below(65536) as u16;
        let r = w.rng.range(EXPANSION_MIN, EXPANSION_MAX) * TILE;
        let sx = cx + (w.trig.cos(a) as i64 * r as i64 / 16384) as i32;
        let sy = cy + (w.trig.sin(a) as i64 * r as i64 / 16384) as i32;
        let (tx, ty) = (sx / TILE - 1, sy / TILE - 1);
        if !buildings::can_place(w, owner, B_NEST, tx, ty, 0)
            || !far_from_starts(w, tx + 1, ty + 1)
            || near_nest(w, sx, sy, NEST_SPACING)
            || player_building_near(w, sx, sy, EXPANSION_CLEAR_R)
            || w.nature.raids.iter().any(|r| r.state == RAID_EXPAND && dist2(r.tx, r.ty, sx, sy) <= ((NEST_SPACING * TILE) as i64).pow(2))
        {
            continue;
        }
        let horde = &mut w.nature.nests[i].horde;
        let party: Vec<u32> = horde.drain(..EXPANSION_PARTY).collect();
        let (gx, gy) = (tx * TILE + 3 * TILE / 2, ty * TILE + 3 * TILE / 2);
        for &id in &party {
            if let Some(s) = beast(w, id) {
                let (x, y) = jitter(w, gx, gy, 2);
                command(w, s, move_to(x, y, false));
            }
        }
        let home = w.nature.nests[i].b;
        w.nature.raids.push(Raid { units: party, state: RAID_EXPAND, tx: gx, ty: gy, target: 0, home, since: tick, started: tick, gx, gy });
        return;
    }
}

/// Un pas d'une horde en route. Faux quand elle n'existe plus (tous morts, rentrés ou installés).
fn update_raid(w: &mut World, k: usize) -> bool {
    let units: Vec<u32> = std::mem::take(&mut w.nature.raids[k].units).into_iter().filter(|&id| beast(w, id).is_some()).collect();
    if units.is_empty() {
        return false;
    }
    w.nature.raids[k].units = units.clone();
    let r = w.nature.raids[k].clone();
    let tick = w.tick;
    match r.state {
        RAID_GATHER => {
            let near = ((7 * TILE) as i64).pow(2);
            let all_in = units.iter().all(|&id| beast(w, id).is_some_and(|s| dist2(w.units.x[s], w.units.y[s], r.gx, r.gy) <= near));
            for &id in &units {
                if let Some(s) = beast(w, id) {
                    fight(w, s, AGGRO_R);
                }
            }
            if all_in || tick >= r.since + GATHER_TICKS {
                for &id in &units {
                    if let Some(s) = beast(w, id) {
                        if w.units.cold[s].wtarget[0] == NONE {
                            let (x, y) = jitter(w, r.tx, r.ty, 2);
                            command(w, s, Order::Move { x, y, gx: r.tx, gy: r.ty, attack: true, eta: 0 });
                        }
                    }
                }
                let rr = &mut w.nature.raids[k];
                rr.state = RAID_ASSAULT;
                rr.since = tick;
            }
            true
        }
        RAID_ASSAULT => {
            let mut busy = false;
            for &id in &units {
                let Some(s) = beast(w, id) else { continue };
                if fight(w, s, AGGRO_R) || !w.units.cold[s].orders.is_empty() {
                    busy = true;
                }
            }
            if busy && tick < r.started + RAID_MAX_TICKS {
                return true;
            }
            // cible détruite et plus rien autour : le bâtiment suivant de la victime, sinon retour
            let next = if tick < r.started + RAID_MAX_TICKS { next_target(w, r.tx, r.ty) } else { None };
            match next {
                Some((tx, ty)) => {
                    for &id in &units {
                        if let Some(s) = beast(w, id) {
                            let (x, y) = jitter(w, tx, ty, 2);
                            command(w, s, Order::Move { x, y, gx: tx, gy: ty, attack: true, eta: 0 });
                        }
                    }
                    let rr = &mut w.nature.raids[k];
                    rr.tx = tx;
                    rr.ty = ty;
                }
                None => go_home(w, k, &units),
            }
            true
        }
        RAID_RETURN => {
            let Some(j) = home_nest(w, &r) else {
                // plus aucun nid : les survivants restent là, sans maître
                return false;
            };
            let Some((cx, cy)) = nest_center(w, &w.nature.nests[j]) else { return false };
            let near = ((LEASH_R * TILE) as i64).pow(2);
            let mut left: Vec<u32> = Vec::new();
            for &id in &units {
                let Some(s) = beast(w, id) else { continue };
                if dist2(w.units.x[s], w.units.y[s], cx, cy) <= near {
                    w.nature.nests[j].horde.push(id);
                    continue;
                }
                left.push(id);
                if w.units.cold[s].orders.is_empty() && w.units.cold[s].wtarget[0] == NONE {
                    let (x, y) = jitter(w, cx, cy, 4);
                    command(w, s, move_to(x, y, false));
                }
            }
            w.nature.raids[k].units = left.clone();
            !left.is_empty()
        }
        _ => {
            // essaim : arrivé (ou après 40 s), il fonde le nid sur place
            let near = ((3 * TILE) as i64).pow(2);
            let arrived = units.iter().any(|&id| beast(w, id).is_some_and(|s| dist2(w.units.x[s], w.units.y[s], r.tx, r.ty) <= near))
                && units.iter().all(|&id| beast(w, id).is_some_and(|s| w.units.cold[s].orders.is_empty()));
            if !arrived && tick < r.since + 800 {
                return true;
            }
            let (x, y) = (r.tx / TILE - 1, r.ty / TILE - 1);
            let ok = w.nature.nests.len() < w.nature.max_nests as usize && !player_building_near(w, r.tx, r.ty, EXPANSION_CLEAR_R / 2);
            let species = if units.first().and_then(|&id| beast(w, id)).is_some_and(|s| w.units.kind[s] == U_REPLICATOR) { SPECIES_REPLICATORS } else { SPECIES_BEASTS };
            if ok && buildings::can_place(w, w.nature.owner, if species == SPECIES_REPLICATORS { B_HIVE } else { B_NEST }, x, y, 0) {
                if let Some(j) = found_colony(w, x, y, species) {
                    w.nature.nests[j].horde = units;
                    return false;
                }
            }
            go_home(w, k, &units);
            true
        }
    }
}

/// Nid où rentre une horde : le sien, sinon le plus proche.
fn home_nest(w: &World, r: &Raid) -> Option<usize> {
    if let Some(j) = w.nature.nests.iter().position(|n| n.b == r.home && w.building(n.b).is_some()) {
        return Some(j);
    }
    let first = r.units.iter().find_map(|&id| beast(w, id))?;
    nearest_nest(w, w.units.x[first], w.units.y[first], 10_000)
}

fn go_home(w: &mut World, k: usize, units: &[u32]) {
    let r = w.nature.raids[k].clone();
    if let Some(j) = home_nest(w, &r) {
        if let Some((cx, cy)) = nest_center(w, &w.nature.nests[j]) {
            for &id in units {
                if let Some(s) = beast(w, id) {
                    let (x, y) = jitter(w, cx, cy, 4);
                    command(w, s, move_to(x, y, false));
                }
            }
            w.nature.raids[k].home = w.nature.nests[j].b;
        }
    }
    let rr = &mut w.nature.raids[k];
    rr.state = RAID_RETURN;
    rr.since = w.tick;
}

/// Prochain bâtiment de joueur à détruire près du point d'arrivée de la horde (24 cases).
fn next_target(w: &World, x: i32, y: i32) -> Option<(i32, i32)> {
    let t = nearest_enemy(w, x, y, 24, false, 0);
    w.ref_pos(t)
}

// ---------- Contrôle ----------

/// Mot d'état de la faune pour le hash.
pub fn hash_into(w: &World, h: &mut crate::ser::Hasher) {
    let n = &w.nature;
    if !n.active() {
        return;
    }
    h.add(n.nests.len() as u64 | (n.raids.len() as u64) << 16 | (n.next_expand as u64) << 32);
    for nest in &n.nests {
        h.add(nest.b as u64 | (nest.horde.len() as u64) << 32 | (nest.spawn as u64) << 40);
        h.add(nest.next_try as u64 | (nest.alarm as u64) << 32);
        h.add(nest.counter as u64 | (nest.burst as u64) << 32);
        h.add(nest.struck as u64 | (nest.foe as u64) << 32 | (nest.species as u64) << 40);
        // apprivoisement : seulement s'il a lieu (l'empreinte d'une partie sans Souche ne change pas)
        if nest.tamer != 0 {
            h.add(nest.tamer as u64 | (nest.tame as u64) << 8);
        }
    }
    for d in &n.dens {
        h.add(d.b as u64 | (d.owner as u64) << 32 | (d.brood.len() as u64) << 40);
        h.add(d.spawn as u64);
    }
    for r in &n.ruins {
        h.add(r.b as u64 | (r.holder as u64) << 32 | (r.progress as u64) << 40);
    }
    h.add(n.breed.len() as u64);
    for r in &n.raids {
        h.add(r.units.len() as u64 | (r.state as u64) << 16 | (r.since as u64) << 24);
        h.add_i32(r.tx);
        h.add_i32(r.ty);
    }
}

/// Renseignements sur un nid pour l'interface : [bêtes au nid, plafond, seuil d'attaque, âge (s),
/// évolution ‰, pression totale des bâtiments voisins, chance d'attaque ‰ à chaque tentative, joueur qui
/// l'apprivoise (-1 : personne), avancement de l'apprivoisement ‰].
pub fn nest_info(w: &World, b: usize) -> Vec<i32> {
    let r = w.building_ref(b);
    // nid greffé (Souche) : [-1, bêtes en vie, plafond, secondes avant la prochaine naissance, nids greffés, limite]
    if let Some(d) = w.nature.dens.iter().find(|d| d.b == r) {
        let alive = d.brood.iter().filter(|&&id| w.unit(id).is_some()).count();
        return vec![-1, alive as i32, DEN_BROOD as i32, d.spawn.div_ceil(20) as i32, dens_of(w, d.owner) as i32, crate::souche::den_limit(w, d.owner) as i32];
    }
    let Some(n) = w.nature.nests.iter().find(|n| n.b == r) else { return Vec::new() };
    let age = w.tick.saturating_sub(n.born);
    let max = horde_max(age, w.nature.level);
    let (cx, cy) = w.buildings[b].center();
    let p: u32 = pressure(w, cx, cy).iter().map(|x| x.0).sum();
    let chance = if w.nature.level >= FAUNA_NORMAL { attack_chance(p, w.nature.level) } else { 0 };
    let home = n.horde.iter().filter(|&&id| beast(w, id).is_some()).count();
    // apprivoisement (Souche) : joueur (-1 : personne) et avancement ‰
    let tamer = n.tamer as i32 - 1;
    let tame = n.tame as i32 * 1000 / TAME_TICKS as i32;
    vec![home as i32, max as i32, attack_size(max) as i32, (age / 20) as i32, evolution(w.tick, w.nature.level) as i32, p as i32, chance as i32, tamer, tame]
}
