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
pub const VERSION: u32 = 3;

pub fn snapshot(w: &World) -> Vec<u8> {
    let mut o = W::new();
    MAGIC.ser(&mut o);
    VERSION.ser(&mut o);
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
    w.team_stock.ser(&mut o);
    w.carriers.ser(&mut o);
    w.ghosts.ser(&mut o);
    w.nature.ser(&mut o);
    w.wear.ser(&mut o);
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
                if let Some(w) = read_world(&mut r) {
                    if r.pos == bytes.len() {
                        return Some(rebuild(w));
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
            read_world(&mut r).map(rebuild)
        }
        _ => None,
    }
}

/// Lit l'état sauvegardé (sans les données dérivées) au format `r.version`.
fn read_world(r: &mut R) -> Option<World> {
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
    w.team_stock = Ser::de(r);
    w.carriers = Ser::de(r);
    w.ghosts = Ser::de(r);
    w.nature = Ser::de(r);
    if r.version >= 3 {
        w.wear = Ser::de(r);
    }
    Some(w)
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
    w
}
