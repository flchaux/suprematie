//! snapshot() / restore() : sérialisation compacte de tout l'état. Les données dérivées
//! (carte, occupation, grilles, champs de flux) sont reconstruites à la restauration.

use crate::belts::Belts;
use crate::buildings::dims;
use crate::flow::Nav;
use crate::rng::Rng;
use crate::ser::{Ser, R, W};
use crate::world::*;

/// Sauvegardes de la version 1 du format (sans numéro de version), jusqu'au 21 novembre 2026.
const MAGIC_V1: u32 = 0x5355_5052; // "SUPR"
/// Sauvegardes versionnées : "SUP2", puis le numéro de version du format.
const MAGIC: u32 = 0x5355_5032; // "SUP2"
/// Version actuelle du format. À augmenter quand on ajoute des champs sauvegardés, en les déclarant
/// « since N » dans ser_struct! : les sauvegardes plus anciennes restent lisibles.
/// - 2 : allure des déplacements en formation, cadence / fragments / pureté des bâtiments, fragments
///   et EPPZ des joueurs, sortie de porte des unités, état des nids (riposte, ponte d'urgence, espèce),
///   ruines et naissances de réplicateurs.
/// - 3 : races (race du joueur, recherches au-delà de 64, objets de la Souche et des Transhumants,
///   réserves des réseaux de racines, chenillards repliés, usure des gisements).
/// - 4 : plus de réserve commune (stock de chaque dépôt, soute et dépôt de chargement des constructeurs,
///   drones) ; le stock commun des équipes n'est plus écrit. Une sauvegarde plus ancienne est convertie
///   à la lecture (`convert_reserve`) ; la réserve du joueur ne garde que les monnaies de race (`purse`).
/// - 5 : apprivoisement par la Souche (Reine qui apprivoise un nid, nids greffés, bêtes calmées).
/// - 6 : relais logistiques (relais propriétaire d'un drone de ravitaillement, `Carrier::relay`).
/// - 7 : Souche, suite (caractères acquis des joueurs, flaques d'acide).
pub const VERSION: u32 = 7;

pub fn snapshot(w: &World) -> Vec<u8> {
    write(w, VERSION, &[])
}

/// Écrit l'état au format `version` (VERSION en jeu ; plus ancien pour tester la lecture des anciennes
/// sauvegardes, avec le stock commun des équipes des versions < 4).
pub fn write(w: &World, version: u32, team_stock: &[[i32; crate::data::NUM_ITEMS]]) -> Vec<u8> {
    let mut o = W::new();
    o.version = version;
    MAGIC.ser(&mut o);
    version.ser(&mut o);
    w.params.ser(&mut o);
    w.tick.ser(&mut o);
    w.rng.state.ser(&mut o);
    w.players.ser(&mut o);
    w.units.ser(&mut o);
    w.buildings.ser(&mut o);
    w.bfree.ser(&mut o);
    w.active.ser(&mut o);
    w.belts.ser(&mut o);
    w.projectiles.ser(&mut o);
    w.wrecks.ser(&mut o);
    w.wfree.ser(&mut o);
    w.nets.ser(&mut o);
    w.power_dirty.ser(&mut o);
    w.infinite_grid.ser(&mut o);
    w.winner.ser(&mut o);
    w.vis.ser(&mut o);
    if version < 4 {
        let mut ts = team_stock.to_vec();
        ts.resize(8, [0; crate::data::NUM_ITEMS]);
        ts.ser(&mut o);
    }
    w.carriers.ser(&mut o);
    w.ghosts.ser(&mut o);
    w.nature.ser(&mut o);
    if version >= 3 {
        w.wear.ser(&mut o);
    }
    if version >= 7 {
        w.acid.ser(&mut o);
    }
    o.buf
}

pub fn restore(bytes: &[u8]) -> Option<World> {
    let mut r = R::new(bytes);
    match u32::de(&mut r) {
        // « SUPR » sans numéro : la version 1 (jusqu'au 21 novembre 2026), ou la disposition de la
        // version 2 écrite avant l'en-tête versionné ; on garde celle qui lit exactement tout le fichier
        MAGIC_V1 => {
            let start = r.pos;
            for v in [2, 1] {
                let mut r = R::new(bytes);
                r.pos = start;
                r.version = v;
                if let Some((w, team_stock)) = read_world(&mut r) {
                    if r.pos == bytes.len() {
                        let mut w = rebuild(w);
                        convert_reserve(&mut w, &team_stock);
                        return Some(w);
                    }
                }
            }
            None
        }
        MAGIC => {
            r.version = u32::de(&mut r);
            if r.version == 0 || r.version > VERSION {
                return None;
            }
            let (w, team_stock) = read_world(&mut r)?;
            let mut w = rebuild(w);
            if r.version < 4 {
                convert_reserve(&mut w, &team_stock);
            }
            Some(w)
        }
        _ => None,
    }
}

/// Lit l'état sauvegardé (sans les données dérivées) au format `r.version`, et le stock commun des
/// équipes des versions < 4 (vide ensuite).
fn read_world(r: &mut R) -> Option<(World, Vec<[i32; crate::data::NUM_ITEMS]>)> {
    let params: Vec<i32> = Ser::de(r);
    if params.len() < 4 {
        return None;
    }
    let mut w = World::new(&params);
    w.tick = Ser::de(r);
    w.rng = Rng { state: Ser::de(r) };
    w.players = Ser::de(r);
    w.units = Ser::de(r);
    w.buildings = Ser::de(r);
    w.bfree = Ser::de(r);
    w.active = Ser::de(r);
    w.belts = <Belts as Ser>::de(r);
    w.projectiles = Ser::de(r);
    w.wrecks = Ser::de(r);
    w.wfree = Ser::de(r);
    w.nets = Ser::de(r);
    w.power_dirty = Ser::de(r);
    w.infinite_grid = Ser::de(r);
    w.winner = Ser::de(r);
    w.vis = Ser::de(r);
    let team_stock = if r.version < 4 { Ser::de(r) } else { Vec::new() };
    w.carriers = Ser::de(r);
    w.ghosts = Ser::de(r);
    w.nature = Ser::de(r);
    if r.version >= 3 {
        w.wear = Ser::de(r);
    }
    if r.version >= 7 {
        w.acid = Ser::de(r);
    }
    // sauvegarde d'avant l'ajout de recherches : leur avancement part de zéro
    for p in w.players.iter_mut() {
        p.tech_progress.resize(crate::data::TECHS.len().max(p.tech_progress.len()), 0);
    }
    Some((w, team_stock))
}

/// Sauvegarde de version < 4 : la réserve de chaque joueur (sauf les monnaies de race, ADN et relevés,
/// qui restent dans sa bourse) devient un dépôt rempli, posé au plus près de son générateur principal (ou
/// de son point de départ) ; le stock commun d'une équipe va dans son premier entrepôt d'équipe, sinon
/// dans le dépôt converti de son premier joueur (perdu s'il n'y en a aucun).
fn convert_reserve(w: &mut World, team_stock: &[[i32; crate::data::NUM_ITEMS]]) {
    use crate::data::*;
    let mut converted: Vec<Option<usize>> = vec![None; w.players.len()];
    for p in 0..w.map.starts.len().min(w.players.len()) {
        let mut items = [0i32; NUM_ITEMS];
        for (it, n) in w.players[p].purse.iter_mut().enumerate() {
            if !crate::races::is_currency(it as u8) {
                items[it] = std::mem::take(n);
            }
        }
        w.players[p].old_stock_cap = 0;
        if !w.players[p].alive || !items.iter().any(|&n| n > 0) {
            continue;
        }
        match w.players[p].race {
            // Transhumants : dans leur soute (déployée, sinon à bord de son chenillard, sinon de l'Arche)
            RACE_TRANSH => {
                let soute = w.stores.iter().map(|&b| b as usize).find(|&b| w.buildings[b].owner as usize == p && w.buildings[b].def().class == BClass::Depot);
                if let Some(b) = soute {
                    for (it, &n) in items.iter().enumerate() {
                        crate::drones::put(&mut w.buildings[b].stash, it as u8, n.clamp(0, u16::MAX as i32) as u16);
                    }
                    converted[p] = Some(b);
                } else {
                    let unit = (0..w.units.alive.len()).find(|&s| w.units.alive[s] && w.units.owner[s] as usize == p && w.units.kind[s] == U_CH_HOLD);
                    let unit = unit.or_else(|| w.unit(w.players[p].commander));
                    if let Some(s) = unit {
                        for (it, &n) in items.iter().enumerate() {
                            crate::drones::put(&mut w.units.cold[s].hold, it as u8, n.clamp(0, u16::MAX as i32) as u16);
                        }
                    }
                }
            }
            // la Souche n'a pas de réserve d'objets (sève et sels sont dans ses réseaux)
            RACE_SOUCHE => {}
            _ => converted[p] = crate::drones::place_filled_depot(w, p as u8, &items),
        }
    }
    for (t, items) in team_stock.iter().enumerate() {
        if !items.iter().any(|&n| n > 0) {
            continue;
        }
        let wh = w.stores.iter().map(|&b| b as usize).find(|&b| w.buildings[b].def().class == BClass::Warehouse && w.team_of(w.buildings[b].owner) as usize == t);
        let dest = wh.or_else(|| (0..w.players.len()).filter(|&p| w.players[p].team as usize == t).find_map(|p| converted[p]));
        if let Some(b) = dest {
            for (it, &n) in items.iter().enumerate() {
                crate::drones::put(&mut w.buildings[b].stash, it as u8, n.clamp(0, u16::MAX as i32) as u16);
            }
        }
    }
}

/// Reconstruit les données dérivées d'un état lu : occupation, passabilité, grilles, navigation.
fn rebuild(mut w: World) -> World {
    w.events.clear();
    // reconstruire l'occupation, la passabilité, la grille des bâtiments
    for i in 0..w.map.occ.len() {
        w.map.occ[i] = 0;
    }
    for v in w.map.occ_up.iter_mut() {
        *v = 0;
    }
    for y in 0..w.map.h {
        for x in 0..w.map.w {
            w.map.update_pass(x, y);
        }
    }
    w.grid = crate::grid::Grids::new(w.map.w, w.map.h);
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if !bb.alive {
            continue;
        }
        let (bw, bh) = dims(bb.kind, bb.dir);
        let passable = bb.def().passable;
        let (x, y) = (bb.x, bb.y);
        let cls = bb.def().class;
        if bb.floor > 0 {
            // tapis surélevé : seule l'occupation de son niveau
            let (i, f) = (w.map.idx(x, y), bb.floor);
            w.map.set_occ_floor(i, f, b as u32 + 1);
            continue;
        }
        for ty in y..y + bh {
            for tx in x..x + bw {
                let i = w.map.idx(tx, ty);
                w.map.occ[i] = b as u32 + 1;
                if !passable {
                    w.map.update_pass_with(tx, ty, true);
                }
            }
        }
        if !matches!(cls, crate::data::BClass::Belt | crate::data::BClass::Inserter) {
            let team = w.team_of(w.buildings[b].owner);
            w.grid.add_building(b as u32, x, y, bw, bh, team);
        }
    }
    w.nav = Nav::new(&w.map);
    crate::flow::rebuild_goal_refs(&mut w);
    crate::drones::rebuild_stores(&mut w);
    w
}
