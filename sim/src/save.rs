//! snapshot() / restore() : sérialisation compacte de tout l'état. Les données dérivées
//! (carte, occupation, grilles, champs de flux) sont reconstruites à la restauration.

use crate::belts::Belts;
use crate::buildings::dims;
use crate::flow::Nav;
use crate::rng::Rng;
use crate::ser::{Ser, R, W};
use crate::world::*;

const MAGIC: u32 = 0x5355_5052; // "SUPR"

pub fn snapshot(w: &World) -> Vec<u8> {
    let mut o = W::new();
    MAGIC.ser(&mut o);
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
    o.buf
}

pub fn restore(bytes: &[u8]) -> Option<World> {
    let mut r = R::new(bytes);
    if u32::de(&mut r) != MAGIC {
        return None;
    }
    let params: Vec<i32> = Ser::de(&mut r);
    let mut w = World::new(&params);
    w.tick = Ser::de(&mut r);
    w.rng = Rng { state: Ser::de(&mut r) };
    w.players = Ser::de(&mut r);
    w.units = Ser::de(&mut r);
    w.buildings = Ser::de(&mut r);
    w.bfree = Ser::de(&mut r);
    w.active = Ser::de(&mut r);
    w.belts = <Belts as Ser>::de(&mut r);
    w.projectiles = Ser::de(&mut r);
    w.wrecks = Ser::de(&mut r);
    w.wfree = Ser::de(&mut r);
    w.nets = Ser::de(&mut r);
    w.power_dirty = Ser::de(&mut r);
    w.infinite_grid = Ser::de(&mut r);
    w.winner = Ser::de(&mut r);
    w.vis = Ser::de(&mut r);
    w.team_stock = Ser::de(&mut r);
    w.carriers = Ser::de(&mut r);
    w.ghosts = Ser::de(&mut r);
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
    Some(w)
}
