//! Décodage et application des ordres des joueurs. Format : suite de [longueur, type, joueur, ...].
//! Un ordre ne porte que sur les unités et bâtiments du joueur qui l'envoie.

use crate::buildings;
use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::units::{clear_orders, pop_order};
use crate::world::*;

pub const O_MOVE: i32 = 1;
pub const O_ATTACK: i32 = 2;
pub const O_BUILD: i32 = 3;
pub const O_ASSIST: i32 = 4;
pub const O_RECLAIM: i32 = 5;
pub const O_STOP: i32 = 6;
pub const O_FACTORY_QUEUE: i32 = 7;
pub const O_FACTORY_REPEAT: i32 = 8;
pub const O_SET_RECIPE: i32 = 9;
pub const O_RESEARCH: i32 = 10;
pub const O_RALLY: i32 = 11;
pub const O_ATTACK_GROUND: i32 = 12;
pub const O_DEPLOY: i32 = 13;
pub const O_LOAD: i32 = 14;
pub const O_UNLOAD: i32 = 15;
pub const O_SPECIAL: i32 = 16;
pub const O_PATROL: i32 = 17;
pub const O_TOGGLE: i32 = 18;
pub const O_CANCEL: i32 = 19;
pub const O_SURRENDER: i32 = 20;
/// Part de la sortie de sa source prise par un bras : bâtiment, % (0 : automatique).
pub const O_SET_SHARE: i32 = 21;
/// File de recherche : ajoute une technologie (ou la retire si elle y est déjà) ; 0 vide la file.
pub const O_RESEARCH_QUEUE: i32 = 22;
/// améliorer un bâtiment (extracteur) d'un niveau : [réf. du bâtiment]
pub const O_UPGRADE: i32 = 40;
/// oublier les fantômes à reconstruire d'une zone : [x0, y0, x1, y1] (cases, bornes comprises)
pub const O_CANCEL_GHOSTS: i32 = 41;
/// filtres de sortie d'un dépôt amélioré : [réf., n, objet...] (n <= MAX_FILTERS)
pub const O_SET_FILTERS: i32 = 42;
/// rotation d'un bras : [réf., quarts de tour (1 à 3)]
pub const O_SET_TURN: i32 = 43;
/// objets par voyage au départ d'une gare ou d'un héliport : [réf., n] (0 : automatique)
pub const O_SET_LOT: i32 = 44;
/// Commandant : récupérer les objets d'un de nos tapis (référence du tapis), versés au stock commun.
pub const O_COLLECT: i32 = 23;
/// tourner d'un quart de tour (sens horaire) nos tapis, bras et tapis de contrôle : [n, réf…]
pub const O_ROTATE: i32 = 24;
/// annuler les constructions prévues (non commencées) qui couvrent la case [x, y] : bâtiments à
/// reconstruire (fantômes) et ordres de construction de nos unités dont le chantier n'est pas posé
pub const O_CANCEL_PLAN: i32 = 25;

struct Cur<'a> {
    a: &'a [i32],
    i: usize,
}
impl Cur<'_> {
    fn next(&mut self) -> i32 {
        let v = self.a.get(self.i).copied().unwrap_or(0);
        self.i += 1;
        v
    }
}

fn own_unit(w: &World, p: u8, id: i32) -> Option<usize> {
    let s = w.unit(id as u32)?;
    if w.units.owner[s] == p {
        Some(s)
    } else {
        None
    }
}
fn own_building(w: &World, p: u8, r: i32) -> Option<usize> {
    let b = w.building(r as u32)?;
    if w.buildings[b].owner == p {
        Some(b)
    } else {
        None
    }
}

pub(crate) fn give(w: &mut World, s: usize, queue: bool, o: Order) {
    if !queue {
        clear_orders(w, s);
    }
    if w.units.cold[s].orders.is_empty() {
        w.units.cold[s].best_dist = i32::MAX;
        w.units.cold[s].stuck = 0;
    }
    if w.units.cold[s].orders.len() < 64 {
        w.units.cold[s].orders.push(o);
    }
}

pub fn apply_orders(w: &mut World, data: &[i32]) {
    let mut i = 0;
    while i < data.len() {
        let len = data[i].max(0) as usize;
        let end = (i + 1 + len).min(data.len());
        let cmd = &data[i + 1..end];
        i = end;
        if cmd.len() < 2 {
            continue;
        }
        let p = cmd[1];
        if p < 0 || p as usize >= w.players.len() || !w.players[p as usize].alive {
            continue;
        }
        apply_one(w, p as u8, cmd[0], Cur { a: cmd, i: 2 });
    }
}

fn units_list(c: &mut Cur) -> Vec<i32> {
    let n = c.next().clamp(0, 2000) as usize;
    (0..n).map(|_| c.next()).collect()
}

fn apply_one(w: &mut World, p: u8, t: i32, mut c: Cur) {
    match t {
        O_MOVE => {
            let flags = c.next();
            let (gx, gy) = (c.next(), c.next());
            // drapeau 4 : formation orientée, chaque unité se tourne vers cet angle à l'arrivée
            let face = if flags & 4 != 0 { Some(c.next() & 0xffff) } else { None };
            let n = c.next().clamp(0, 2000);
            for _ in 0..n {
                let (id, tx, ty) = (c.next(), c.next(), c.next());
                if let Some(s) = own_unit(w, p, id) {
                    let mx = w.map.w * TILE - 1;
                    let my = w.map.h * TILE - 1;
                    let o = Order::Move { x: tx.clamp(0, mx), y: ty.clamp(0, my), gx: gx.clamp(0, mx), gy: gy.clamp(0, my), attack: flags & 2 != 0 };
                    give(w, s, flags & 1 != 0, o);
                    if let Some(a) = face {
                        give(w, s, true, Order::Face { a });
                    }
                }
            }
        }
        O_ATTACK | O_ASSIST | O_RECLAIM => {
            let q = c.next() & 1 != 0;
            let target = c.next() as u32;
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    let o = match t {
                        O_ATTACK => Order::Attack { target },
                        O_ASSIST => Order::Assist { target },
                        _ => Order::Reclaim { target },
                    };
                    give(w, s, q, o);
                }
            }
        }
        O_BUILD => {
            let q = c.next() & 1 != 0;
            let (kind, x, y, dir) = (c.next(), c.next(), c.next(), c.next());
            if kind < 0 || kind as usize >= BUILDINGS.len() || !w.players[p as usize].has_tech(bdef(kind as u16).tech) {
                return;
            }
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if udef(w.units.kind[s]).build_power > 0 {
                        // bit 4 : pose avec remplacement des tapis (voir buildings::DIR_REPLACE)
                        // bits 0-1 : direction ; 2 : remplacement ; 3-4 : niveau d'un tapis
                        give(w, s, q, Order::Build { kind: kind as u16, x, y, dir: (dir & 31) as u8, bid: 0 });
                    }
                }
            }
        }
        O_STOP => {
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    clear_orders(w, s);
                    w.units.cold[s].wtarget = [NONE; 2];
                }
            }
        }
        O_FACTORY_QUEUE => {
            let (b, kind, delta) = (c.next(), c.next(), c.next());
            let Some(b) = own_building(w, p, b) else { return };
            if kind < 0 || kind as usize >= UNITS.len() {
                return;
            }
            let ud = udef(kind as u16);
            let bb = &w.buildings[b];
            if bb.def().class != BClass::Factory || ud.factory != bb.def().factory || !w.players[p as usize].has_tech(ud.tech) {
                return;
            }
            let front_before = bb.queue.first().map(|q| q.0);
            let bb = &mut w.buildings[b];
            if delta > 0 {
                if let Some(last) = bb.queue.last_mut() {
                    if last.0 == kind as u16 {
                        last.1 = last.1.saturating_add(delta.min(500) as u16);
                    } else if bb.queue.len() < 16 {
                        bb.queue.push((kind as u16, delta.min(500) as u16));
                    }
                } else {
                    bb.queue.push((kind as u16, delta.min(500) as u16));
                }
            } else if delta < 0 {
                let mut rem = (-delta) as u16;
                for k in (0..bb.queue.len()).rev() {
                    if bb.queue[k].0 == kind as u16 && rem > 0 {
                        let r = rem.min(bb.queue[k].1);
                        bb.queue[k].1 -= r;
                        rem -= r;
                    }
                }
                bb.queue.retain(|q| q.1 > 0);
            }
            let front_after = bb.queue.first().map(|q| q.0);
            if front_before != front_after && bb.working {
                bb.working = false;
                bb.progress = 0;
                // unité en cours abandonnée : ses composants reviennent dans la réserve de l'usine
                if let Some(k) = front_before {
                    for &(it, n) in udef(k).cost {
                        crate::buildings::factory_put(&mut w.buildings[b], it, n);
                        let c = &mut w.players[p as usize].consumed[it as usize];
                        *c = c.saturating_sub(n as u32);
                    }
                }
            }
            // ce qui dépasse l'avance voulue par la nouvelle file retourne au stock
            crate::buildings::factory_trim(w, b);
            w.buildings[b].wake = 0;
        }
        O_FACTORY_REPEAT => {
            let (b, f) = (c.next(), c.next());
            if let Some(b) = own_building(w, p, b) {
                w.buildings[b].repeat = f != 0;
            }
        }
        O_SET_FILTERS => {
            let b = c.next();
            let n = c.next().clamp(0, MAX_FILTERS as i32);
            let mut items = Vec::new();
            for _ in 0..n {
                let it = c.next();
                if it > 0 && (it as usize) < NUM_ITEMS && !items.contains(&(it as u8)) {
                    items.push(it as u8);
                }
            }
            if let Some(b) = own_building(w, p, b) {
                if w.buildings[b].def().class == BClass::Depot && w.buildings[b].level > 0 {
                    w.buildings[b].filters = items;
                    w.buildings[b].wake = 0;
                }
            }
        }
        O_CANCEL_GHOSTS => {
            let (x0, y0, x1, y1) = (c.next(), c.next(), c.next(), c.next());
            let me = p;
            w.ghosts.retain(|g| g.owner != me || g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1);
        }
        O_UPGRADE => {
            let b = c.next();
            if let Some(b) = own_building(w, p, b) {
                crate::buildings::upgrade(w, b);
            }
        }
        O_SET_RECIPE => {
            let (b, r) = (c.next(), c.next());
            let Some(b) = own_building(w, p, b) else { return };
            let bb = &w.buildings[b];
            // entrepôt d'équipe : choix de l'objet qui en ressort (0 ou RECIPE_NONE : aucun)
            if bb.def().class == BClass::Warehouse || bb.kind == B_SORTER {
                if r == RECIPE_NONE as i32 || (0..NUM_ITEMS as i32).contains(&r) {
                    w.buildings[b].recipe = if r == RECIPE_NONE as i32 { 0 } else { r as u8 };
                    crate::buildings::wake_watchers(w, b);
                }
                return;
            }
            if bb.def().class != BClass::Crafter {
                return;
            }
            let ok = r == RECIPE_NONE as i32 || (r >= 0 && (r as usize) < RECIPES.len() && RECIPES[r as usize].crafter == bb.def().crafter && w.players[p as usize].has_tech(RECIPES[r as usize].tech));
            if !ok || bb.recipe as i32 == r {
                return;
            }
            // rendre le contenu au stock
            if bb.recipe != RECIPE_NONE {
                let rec = &RECIPES[bb.recipe as usize];
                let inv = bb.inv;
                let out = bb.out;
                for (j, &(it, _)) in rec.inputs.iter().enumerate() {
                    w.players[p as usize].stock[it as usize] += inv[j] as i32;
                }
                w.players[p as usize].stock[rec.output.0 as usize] += out as i32;
            }
            let bb = &mut w.buildings[b];
            bb.recipe = r as u8;
            bb.repeat = r != RECIPE_NONE as i32; // verrou de recette
            bb.inv = [0; 6];
            bb.out = 0;
            bb.working = false;
            bb.progress = 0;
            bb.wake = 0;
            let ws = std::mem::take(&mut bb.watchers);
            for x in ws {
                w.buildings[x as usize].wake = 0;
            }
        }
        O_RESEARCH => {
            let t = c.next();
            if t < 0 || t as usize >= TECHS.len() {
                return;
            }
            let pl = &w.players[p as usize];
            let td = &TECHS[t as usize];
            if t == 0 {
                w.players[p as usize].research = 0;
                w.players[p as usize].research_queue.clear();
                return;
            }
            if pl.has_tech(t as u8) || !td.prereq.iter().all(|&q| pl.has_tech(q)) {
                return;
            }
            let pl = &mut w.players[p as usize];
            pl.research = t as u8;
            pl.research_queue.retain(|&q| q != t as u8);
        }
        O_RESEARCH_QUEUE => {
            let t = c.next();
            if t < 0 || t as usize >= TECHS.len() {
                return;
            }
            let pl = &mut w.players[p as usize];
            if t == 0 {
                pl.research_queue.clear();
                return;
            }
            let t = t as u8;
            if let Some(k) = pl.research_queue.iter().position(|&q| q == t) {
                // déjà en file : retirée, avec les recherches qui en dépendaient plus loin dans la file
                pl.research_queue.remove(k);
                let mut avail = pl.researched | if pl.research != 0 { 1u64 << pl.research } else { 0 };
                let mut keep = Vec::new();
                for &q in &pl.research_queue {
                    if TECHS[q as usize].prereq.iter().all(|&r| avail & (1u64 << r) != 0) {
                        avail |= 1u64 << q;
                        keep.push(q);
                    }
                }
                pl.research_queue = keep;
                return;
            }
            if pl.has_tech(t) || pl.research == t || pl.research_queue.len() >= 16 {
                return;
            }
            // prérequis acquis, en cours ou plus tôt dans la file
            let avail = pl.researched | if pl.research != 0 { 1u64 << pl.research } else { 0 } | pl.research_queue.iter().fold(0u64, |a, &q| a | 1u64 << q);
            if !TECHS[t as usize].prereq.iter().all(|&r| avail & (1u64 << r) != 0) {
                return;
            }
            pl.research_queue.push(t);
            pl.start_queued();
        }
        O_RALLY => {
            let (b, x, y) = (c.next(), c.next(), c.next());
            if let Some(b) = own_building(w, p, b) {
                w.buildings[b].rally = (x.clamp(0, w.map.w * TILE - 1), y.clamp(0, w.map.h * TILE - 1));
            }
        }
        O_ATTACK_GROUND | O_PATROL => {
            let q = c.next() & 1 != 0;
            let (x, y) = (c.next(), c.next());
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    let o = if t == O_PATROL {
                        let (ox, oy) = (w.units.x[s], w.units.y[s]);
                        Order::Patrol { x, y, ox, oy }
                    } else {
                        Order::AttackGround { x, y }
                    };
                    give(w, s, q, o);
                }
            }
        }
        O_DEPLOY => {
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    let k = w.units.kind[s];
                    if k == U_SONDE || crate::combat::needs_deploy(k) {
                        clear_orders(w, s);
                        let cd = &mut w.units.cold[s];
                        cd.deployed = !cd.deployed;
                    }
                }
            }
        }
        O_LOAD => {
            let carrier = c.next();
            let Some(cs) = own_unit(w, p, carrier) else { return };
            let air = udef(w.units.kind[cs]).layer == Layer::Air;
            let cid = w.unit_id(cs);
            let list = units_list(&mut c);
            if air {
                clear_orders(w, cs);
            }
            for id in list {
                if let Some(s) = own_unit(w, p, id) {
                    if s == cs {
                        continue;
                    }
                    if air {
                        give(w, cs, true, Order::Load { target: id as u32 });
                        clear_orders(w, s);
                    } else {
                        give(w, s, false, Order::Enter { target: cid });
                    }
                }
            }
        }
        O_UNLOAD => {
            let q = c.next() & 1 != 0;
            let (x, y) = (c.next(), c.next());
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if udef(w.units.kind[s]).carry > 0 {
                        give(w, s, q, Order::Unload { x, y });
                    }
                }
            }
        }
        O_SPECIAL => special(w, p, c.next() as u32, c.next(), c.next(), c.next() as u32),
        O_COLLECT => {
            let q = c.next() & 1 != 0;
            let target = c.next() as u32;
            let ok = w.building(target).is_some_and(|b| {
                let bb = &w.buildings[b];
                bb.owner == p && bb.def().class == crate::data::BClass::Belt && bb.complete()
            });
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if ok && w.units.kind[s] == crate::data::U_COMMANDER {
                        give(w, s, q, Order::Collect { target });
                    }
                }
            }
        }
        O_CANCEL_PLAN => cancel_plan(w, p, c.next(), c.next()),
        O_ROTATE => {
            let n = c.next().clamp(0, 256);
            for _ in 0..n {
                if let Some(b) = own_building(w, p, c.next()) {
                    buildings::rotate(w, b);
                }
            }
        }
        O_SET_SHARE => {
            let r = c.next();
            let v = c.next().clamp(0, 100) as u8;
            if let Some(b) = own_building(w, p, r) {
                if w.buildings[b].def().class == crate::data::BClass::Inserter {
                    w.buildings[b].share = v;
                    w.buildings[b].wake = 0;
                }
            }
        }
        O_SET_LOT => {
            let r = c.next();
            let n = c.next().clamp(0, 10_000) as u16;
            if let Some(b) = own_building(w, p, r) {
                if let Some(kind) = crate::logistics::carrier_kind(w.buildings[b].def().class) {
                    if kind < 2 {
                        w.buildings[b].lot = n.min(CARRIERS[kind as usize].capacity);
                    }
                }
            }
        }
        O_SET_TURN => {
            let r = c.next();
            let k = c.next();
            if let Some(b) = own_building(w, p, r) {
                if w.buildings[b].def().class == crate::data::BClass::Inserter && (1..=3).contains(&k) {
                    w.buildings[b].turn = k as u8;
                    w.buildings[b].wake = 0;
                }
            }
        }
        O_TOGGLE => {
            if let Some(b) = own_building(w, p, c.next()) {
                let bb = &mut w.buildings[b];
                bb.enabled = !bb.enabled;
                bb.wake = 0;
            }
        }
        O_CANCEL => {
            if let Some(b) = own_building(w, p, c.next()) {
                if !w.buildings[b].complete() {
                    let def = w.buildings[b].def();
                    let paid = w.buildings[b].paid;
                    for (k, &(it, _)) in def.cost.iter().enumerate() {
                        w.players[p as usize].stock[it as usize] += paid[k] as i32;
                    }
                    buildings::remove_building(w, b, false);
                }
            }
        }
        O_SURRENDER => {
            let c = w.players[p as usize].commander;
            if let Some(s) = w.unit(c) {
                w.units.hp[s] = 0;
                w.dead_units.push(s as u32);
            } else {
                crate::combat::eliminate(w, p);
            }
        }
        _ => {}
    }
}

fn special(w: &mut World, p: u8, src: u32, x: i32, y: i32, target: u32) {
    let mx = w.map.w * TILE - 1;
    let my = w.map.h * TILE - 1;
    let (x, y) = (x.clamp(0, mx), y.clamp(0, my));
    if let Some(s) = w.unit(src) {
        if w.units.owner[s] != p {
            return;
        }
        let k = w.units.kind[s];
        if k == U_HYPER {
            if w.building(target).is_some_and(|b| w.buildings[b].def().class == BClass::Beacon && w.buildings[b].owner == p) {
                clear_orders(w, s);
                w.units.cold[s].orders.push(Order::Jump { beacon: target });
            }
        } else if k == U_COMMANDER {
            clear_orders(w, s);
            w.units.cold[s].orders.push(Order::Teleport { x, y });
        }
        return;
    }
    let Some(b) = w.building(src) else { return };
    if w.buildings[b].owner != p || !w.buildings[b].complete() {
        return;
    }
    match w.buildings[b].def().class {
        BClass::Station | BClass::CargoPad => crate::logistics::link(w, p, b, target),
        BClass::Silo => {
            if w.buildings[b].ammo == 0 {
                return;
            }
            w.buildings[b].ammo -= 1;
            let (cx, cy) = w.buildings[b].center();
            let d = crate::fixed::dist(cx, cy, x, y);
            let total = (d / 102).clamp(200, 1200) as u16;
            w.projectiles.push(Projectile { weapon: 0, owner: p, x0: cx, y0: cy, tx: x, ty: y, target: NONE, t: 0, total, dmg: 20000, aoe: 25 * TILE, special: 1, src: NONE });
            w.ev(EV_NUKE, p as i32, x, y, total as i32);
        }
        BClass::Orbital => {
            if w.buildings[b].charge < 60 * 20 * 1024 {
                return;
            }
            w.buildings[b].charge = 0;
            w.projectiles.push(Projectile { weapon: 37, owner: p, x0: x, y0: y, tx: x, ty: y, target: NONE, t: 0, total: 40, dmg: 6000, aoe: 6 * TILE, special: 2, src: NONE });
            w.ev(EV_ORBITAL, p as i32, x, y, 40);
        }
        BClass::Transfer => {
            let Some(t) = w.building(target) else { return };
            let ok = w.buildings[t].owner == p && w.buildings[t].def().class == BClass::Transfer && w.buildings[t].complete() && t != b;
            if !ok || w.buildings[b].cooldown > 0 || !w.buildings[b].working {
                return;
            }
            let (cx, cy) = w.buildings[b].center();
            let (tx, ty) = w.buildings[t].center();
            if dist2(cx, cy, tx, ty) > (120 * TILE as i64).pow(2) {
                return;
            }
            let mut moved = 0;
            for s in 0..w.units.alive.len() {
                if moved >= 12 {
                    break;
                }
                if !w.units.alive[s] || w.units.owner[s] != p || w.units.cold[s].carried_by != NONE {
                    continue;
                }
                let l = udef(w.units.kind[s]).layer;
                if !matches!(l, Layer::Land | Layer::Hover) || udef(w.units.kind[s]).tier == 6 {
                    continue;
                }
                if dist2(w.units.x[s], w.units.y[s], cx, cy) <= (4 * TILE as i64).pow(2) {
                    let ox = w.units.x[s] - cx;
                    let oy = w.units.y[s] - cy;
                    let m = crate::units::pass_mask(l);
                    let (fx, fy) = buildings::free_spot_near(w, tx + ox, ty + oy, m);
                    w.ev(EV_TELEPORT, w.units.x[s], w.units.y[s], fx, fy);
                    w.units.x[s] = fx;
                    w.units.y[s] = fy;
                    w.units.px[s] = fx;
                    w.units.py[s] = fy;
                    clear_orders(w, s);
                    moved += 1;
                }
            }
            w.buildings[b].cooldown = 400;
        }
        BClass::Gate => {
            let Some(t) = w.building(target) else { return };
            if t == b || w.buildings[t].owner != p || w.buildings[t].def().class != BClass::Gate {
                return;
            }
            for g in [b, t] {
                let old = w.buildings[g].link;
                if let Some(o) = w.building(old) {
                    w.buildings[o].link = NONE;
                }
            }
            let rb = w.building_ref(b);
            let rt = w.building_ref(t);
            w.buildings[b].link = rt;
            w.buildings[t].link = rb;
            w.buildings[b].enabled = true;
            w.buildings[t].enabled = true;
        }
        _ => {}
    }
    let _ = pop_order;
}

/// Ordre CANCEL_PLAN : retire les constructions prévues du joueur `p` qui couvrent la case (tx, ty).
fn cancel_plan(w: &mut World, p: u8, tx: i32, ty: i32) {
    let covers = |kind: u16, x: i32, y: i32, dir: u8| {
        let (bw, bh) = buildings::dims(kind, dir & 3);
        tx >= x && tx < x + bw && ty >= y && ty < y + bh
    };
    w.ghosts.retain(|g| g.owner != p || !covers(g.kind, g.x, g.y, g.dir));
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.owner[s] != p {
            continue;
        }
        // de la fin vers le début : les indices restent valides ; l'ordre en cours passe par pop_order
        let mut i = w.units.cold[s].orders.len();
        while i > 0 {
            i -= 1;
            let Order::Build { kind, x, y, dir, bid } = w.units.cold[s].orders[i] else { continue };
            if w.building(bid).is_some() || !covers(kind, x, y, dir) {
                continue;
            }
            if i == 0 {
                pop_order(w, s);
            } else {
                w.units.cold[s].orders.remove(i);
            }
        }
    }
}
