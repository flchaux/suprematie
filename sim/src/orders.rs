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
/// sorties d'un répartiteur : [réf., mode] (0 : les trois, 1 : gauche et avant, 2 : droite et avant)
pub const O_SET_SPLIT: i32 = 45;
/// vider une gare ou un héliport : [réf.] ; « à envoyer » et « reçus » sont remboursés (dépôt le plus proche)
pub const O_EMPTY_STASH: i32 = 46;
/// cadence d'une machine : [réf., cadence %] (10 à 250, par pas de 10 ; au-dessus de 100 %, des fragments)
pub const O_SET_CLOCK: i32 = 47;
/// Commandant : récupérer les objets d'un de nos tapis (référence du tapis), mis dans sa soute.
pub const O_COLLECT: i32 = 23;
/// tourner d'un quart de tour (sens horaire) nos tapis, bras et tapis de contrôle : [n, réf…]
pub const O_ROTATE: i32 = 24;
/// annuler les constructions prévues (non commencées) qui couvrent la case [x, y] : bâtiments à
/// reconstruire (fantômes) et ordres de construction de nos unités dont le chantier n'est pas posé
pub const O_CANCEL_PLAN: i32 = 25;
/// commandant : récolter un gisement et fondre le minerai (fonderie intégrée) : [drapeaux, x, y (cases), n, unités…]
pub const O_HARVEST: i32 = 26;
/// Replier des modules des Transhumants : [n, réf. de bâtiment…] (voir transhumants::fold).
pub const O_PACK: i32 = 48;
/// Chenillards : rouler jusqu'au point et s'y déployer : [drapeaux, x, y (sous-unités), n, unités…] ; drapeaux :
/// bit 0 en file, bits 2-4 sens du module + 1 (0 : sens automatique) ; le point est le centre du module.
pub const O_DEPLOY_AT: i32 = 49;
/// Commandant ou ingénieur : ramasser ce qui sort d'un de nos extracteurs ou fabricants, dans sa soute :
/// [drapeaux (1 : en file), réf. du bâtiment, n, unités…].
pub const O_PICKUP: i32 = 50;
/// Commandant ou ingénieur : porter un objet de sa soute (0 : tout) au dépôt le plus proche qui a de la
/// place : [drapeaux (1 : en file), objet, n, unités…].
pub const O_DELIVER: i32 = 51;
/// Reine de la Souche : apprivoiser un nid de mordeurs sauvage : [drapeaux (1 : en file), réf. du nid, n, unités…]
/// (voir souche::tame).
pub const O_TAME: i32 = 52;
/// Générateur nomade des Transhumants : planter un poteau relais : [réf. du générateur, x, y (cases, case du
/// poteau)] (voir transhumants::plant_pole).
pub const O_PLANT_POLE: i32 = 53;
/// Soute des Transhumants : atteler un chariot de convoi (coût pris dans son stock) : [réf. de la soute]
/// (voir transhumants::hitch).
pub const O_HITCH: i32 = 54;
/// Chariots de convoi : navette entre leur soute et un module : [drapeaux (bit 0 en file, bit 1 livrer : de la
/// soute vers le fabricant), réf. du module, n, unités…] (voir transhumants::haul_step).
pub const O_HAUL: i32 = 55;
/// Mettre en pause (1) ou relancer (0) des bâtiments de production : [pause, n, réf. de bâtiment…]
/// (extracteurs, fabricants, usines d'unités terminés ; voir buildings::paused).
pub const O_SET_PAUSE: i32 = 56;
/// Souche : fixer dans l'espèce la résistance à une famille d'armes (Mémoire du sang) : [famille]
/// (voir essaim::adapt).
pub const O_ADAPT: i32 = 57;
/// navette de transport : [drapeaux (bit 0 en file), ax, ay, bx, by (sous-unités), n, unités…] : les transports
/// volants de la liste font des allers-retours entre A (embarquement) et B (débarquement)
pub const O_FERRY: i32 = 58;
/// Transhumants : installer une amélioration : [amélioration, n, réf. d'unité ou de module…] (voir
/// ameliorations::install ; payée tout de suite, porteur par porteur, dans l'ordre de la liste).
pub const O_MOD_INSTALL: i32 = 60;
/// Annuler une installation en cours (remboursée) : [n, réf. d'unité ou de module…].
pub const O_MOD_CANCEL: i32 = 61;
/// Tourelles de l'Arche : [action, n, Arches…] (0 replier, 1 déployer, 2 consigne « suivre », 3 « tenir »).
pub const O_ARK_TURRETS: i32 = 62;
/// Type voulu d'une tourelle de l'Arche : [Arche, tourelle (-1 : toutes), type].
pub const O_ARK_TURRET_TYPE: i32 = 63;
/// Surcharge de l'Arche : [n, Arches…].
pub const O_ARK_BOOST: i32 = 64;
/// File de l'atelier embarqué de l'Arche : [Arche, type d'unité, +n ou -n].
pub const O_ARK_QUEUE: i32 = 65;

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

/// Unité du joueur `p` qui peut recevoir un ordre (un œuf de la Souche n'en reçoit pas, ni une tourelle
/// d'Arche : l'Arche la dirige).
fn own_unit(w: &World, p: u8, id: i32) -> Option<usize> {
    let s = w.unit(id as u32)?;
    if w.units.owner[s] == p && !crate::ponte::is_egg(w.units.kind[s]) && !crate::ameliorations::is_turret(w.units.kind[s]) {
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

/// Recherches acquises du joueur, sur 128 bits.
fn researched_bits(pl: &crate::world::Player) -> u128 {
    pl.researched as u128 | (pl.researched2 as u128) << 64
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
        // la faune ne reçoit pas d'ordres par le réseau (voir nature.rs)
        if p < 0 || p as usize >= w.players.len() || !w.players[p as usize].alive || w.players[p as usize].team == crate::nature::NATURE_TEAM {
            continue;
        }
        apply_one(w, p as u8, cmd[0], Cur { a: cmd, i: 2 });
    }
}

fn units_list(c: &mut Cur) -> Vec<i32> {
    let n = c.next().clamp(0, 2000) as usize;
    (0..n).map(|_| c.next()).collect()
}

/// Marge (ticks) ajoutée à la durée prévue d'un déplacement en formation : demi-tour sur place au départ.
const FORMATION_TURN_TICKS: u32 = 20;

/// Allure d'un déplacement en formation orientée (comme Supreme Commander) : le groupe avance à la
/// vitesse de son unité la plus lente et arrive ensemble. Durée prévue : la plus longue distance à
/// parcourir (depuis la position actuelle, ou la fin du déplacement en file) divisée par la vitesse
/// de la plus lente, plus une marge pour tourner ; chaque unité règle ensuite son allure pour finir à
/// ce moment (units::formation_pace). Chaque famille (terrestre, navale, aérienne : voir
/// formation::family) règle son allure sur sa plus lente, et les avions à voilure fixe gardent leur
/// vitesse. `turn` : marge ajoutée (ticks) pour tourner.
/// Renvoie le champ `eta` de chaque ordre (`ETA_PENDING` | durée, 0 : pas d'allure imposée).
fn formation_etas(w: &World, list: &[(usize, i32, i32)], queue: bool, turn: u32) -> Vec<u32> {
    use crate::formation::family;
    use crate::units::fixed_wing;
    let mut out = vec![0; list.len()];
    for fam in 0..3 {
        let members: Vec<usize> = (0..list.len()).filter(|&k| family(w.units.kind[list[k].0]) == fam && !fixed_wing(w.units.kind[list[k].0])).collect();
        if members.len() < 2 {
            continue;
        }
        let vmin = members.iter().map(|&k| crate::ameliorations::speed(w, list[k].0)).min().unwrap_or(1).max(1);
        let mut far = 0i32;
        for &k in &members {
            let (s, tx, ty) = list[k];
            // départ : fin du dernier déplacement en file, sinon la position actuelle
            let last = if queue {
                w.units.cold[s].orders.iter().rev().find_map(|o| if let Order::Move { x, y, .. } = *o { Some((x, y)) } else { None })
            } else {
                None
            };
            let (sx, sy) = last.unwrap_or((w.units.x[s], w.units.y[s]));
            far = far.max(crate::fixed::dist(sx, sy, tx, ty));
        }
        let dur = (far / vmin) as u32 + turn;
        for &k in &members {
            out[k] = ETA_PENDING | dur.min(ETA_PENDING - 1);
        }
    }
    out
}

/// Blocs d'une formation calculée par la simulation (voir formation.rs), un par famille d'unités : membres
/// (par indice croissant) et plan, places bornées à la carte.
fn formation_blocks(w: &World, mut list: Vec<usize>, gx: i32, gy: i32, face: Option<u16>, queue: bool) -> Vec<(Vec<usize>, crate::formation::Plan)> {
    use crate::formation::{family, plan};
    list.sort_unstable();
    list.dedup();
    let (mx, my) = (w.map.w * TILE - 1, w.map.h * TILE - 1);
    let mut out = vec![];
    for fam in 0..3 {
        let members: Vec<usize> = list.iter().copied().filter(|&s| family(w.units.kind[s]) == fam).collect();
        if members.is_empty() {
            continue;
        }
        let mut p = plan(w, &members, gx, gy, face, queue);
        for t in p.slots.iter_mut() {
            *t = (t.0.clamp(0, mx), t.1.clamp(0, my));
        }
        out.push((members, p));
    }
    out
}

/// Aperçu d'une formation pour le client (rien n'est changé) : par unité, id, x, y (sous-unités). Mêmes
/// places que l'ordre correspondant.
pub fn formation_preview(w: &World, p: u8, gx: i32, gy: i32, angle: i32, queue: bool, ids: &[i32]) -> Vec<i32> {
    let list: Vec<usize> = ids.iter().take(2000).filter_map(|&id| own_unit(w, p, id)).collect();
    let (gx, gy) = (gx.clamp(0, w.map.w * TILE - 1), gy.clamp(0, w.map.h * TILE - 1));
    let mut out = vec![];
    for (members, plan) in formation_blocks(w, list, gx, gy, Some(angle as u16), queue) {
        for (&s, &(x, y)) in members.iter().zip(&plan.slots) {
            out.extend_from_slice(&[w.unit_id(s) as i32, x, y]);
        }
    }
    out
}

/// Formation calculée par la simulation (drapeau 8 de `O_MOVE`) : orientée (`face`, clic droit glissé) ou
/// en file (Maj + clic droit). Chaque famille d'unités forme son propre bloc ; le groupe avance à la
/// vitesse de sa plus lente.
fn planned_formation(w: &mut World, list: Vec<usize>, gx: i32, gy: i32, face: Option<u16>, queue: bool, attack: bool) {
    let blocks = formation_blocks(w, list, gx, gy, face, queue);
    for (members, plan) in blocks {
        for &s in &members {
            if !queue {
                clear_orders(w, s);
            } else if plan.cont {
                crate::formation::drop_tail_face(w, s);
            }
        }
        let placed: Vec<(usize, i32, i32)> = members.iter().zip(&plan.slots).map(|(&s, &(x, y))| (s, x, y)).collect();
        // prolonger une formation : le groupe passe le point sans s'arrêter, demi-marge pour tourner
        let etas = formation_etas(w, &placed, true, if plan.cont { FORMATION_TURN_TICKS / 2 } else { FORMATION_TURN_TICKS });
        for (k, &(s, tx, ty)) in placed.iter().enumerate() {
            give(w, s, true, Order::Move { x: tx, y: ty, gx, gy, attack, eta: etas[k] });
            give(w, s, true, Order::Face { a: plan.angle as i32 });
        }
    }
}

fn apply_one(w: &mut World, p: u8, t: i32, mut c: Cur) {
    match t {
        O_MOVE => {
            let flags = c.next();
            let (gx, gy) = (c.next(), c.next());
            // drapeau 4 : formation orientée, chaque unité se tourne vers cet angle à l'arrivée (drapeau 8 :
            // places calculées par la simulation, sinon données par l'ordre)
            let face = if flags & 4 != 0 { Some(c.next() & 0xffff) } else { None };
            let n = c.next().clamp(0, 2000);
            let mx = w.map.w * TILE - 1;
            let my = w.map.h * TILE - 1;
            let mut list: Vec<(usize, i32, i32)> = Vec::new();
            for _ in 0..n {
                let (id, tx, ty) = (c.next(), c.next(), c.next());
                if let Some(s) = own_unit(w, p, id) {
                    list.push((s, tx.clamp(0, mx), ty.clamp(0, my)));
                }
            }
            let queue = flags & 1 != 0;
            if flags & crate::formation::FLAG_PLANNED != 0 {
                let list = list.iter().map(|e| e.0).collect();
                planned_formation(w, list, gx.clamp(0, mx), gy.clamp(0, my), face.map(|a| a as u16), queue, flags & 2 != 0);
                return;
            }
            let etas = if face.is_some() { formation_etas(w, &list, queue, FORMATION_TURN_TICKS) } else { vec![0; list.len()] };
            for (k, &(s, tx, ty)) in list.iter().enumerate() {
                let o = Order::Move { x: tx, y: ty, gx: gx.clamp(0, mx), gy: gy.clamp(0, my), attack: flags & 2 != 0, eta: etas[k] };
                give(w, s, queue, o);
                if let Some(a) = face {
                    give(w, s, true, Order::Face { a });
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
            if kind < 0 || kind as usize >= BUILDINGS.len() || !w.players[p as usize].has_tech(bdef(kind as u16).tech) || !crate::races::building_ok(w, p, kind as u16) {
                return;
            }
            // Transhumants : les modules viennent des chenillards et les poteaux des générateurs, jamais d'un chantier
            if bdef(kind as u16).race == crate::data::RACE_TRANSH {
                return;
            }
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if udef(w.units.kind[s]).build_power > 0 {
                        // bits 0-1 : direction ; 2 : remplacement des tapis (buildings::DIR_REPLACE) ;
                        // 3-4 : niveau d'un tapis ; 5-6 : sorties d'un répartiteur (Building::split)
                        give(w, s, q, Order::Build { kind: kind as u16, x, y, dir: (dir & 127) as u8, bid: 0 });
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
            if bb.def().class != BClass::Factory || ud.factory != bb.def().factory || !w.players[p as usize].has_tech(ud.tech) || !crate::races::unit_ok(w, p, kind as u16) {
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
                // unité (ou portée) en cours abandonnée : ses composants reviennent dans la réserve de l'usine
                if let Some(k) = front_before {
                    for &(it, n) in udef(k).cost {
                        let n = n * batch(k);
                        crate::buildings::factory_put(&mut w.buildings[b], it, n);
                        let c = &mut w.players[p as usize].consumed[it as usize];
                        *c = c.saturating_sub(n as u32);
                    }
                }
            }
            // ce qui dépasse l'avance voulue par la nouvelle file est remboursé
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
                if w.buildings[b].def().class == BClass::Depot {
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
            // rembourser le contenu (dépôt le plus proche)
            if bb.recipe != RECIPE_NONE {
                let rec = &RECIPES[bb.recipe as usize];
                let inv = bb.inv;
                let out = bb.out;
                for (j, &(it, _)) in rec.inputs.iter().enumerate() {
                    crate::drones::refund_at(w, p, b, it, inv[j] as u32);
                }
                crate::drones::refund_at(w, p, b, rec.output.0, out as u32);
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
            if t == 0 {
                w.players[p as usize].research = 0;
                w.players[p as usize].research_queue.clear();
                return;
            }
            if pl.has_tech(t as u8) || !crate::races::prereq_ok(t as u8, |q| pl.has_tech(q)) || !crate::races::tech_ok(w, p, t as u8) {
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
                let mut avail = researched_bits(pl) | if pl.research != 0 { 1u128 << pl.research } else { 0 };
                let mut keep = Vec::new();
                for &q in &pl.research_queue {
                    if crate::races::prereq_ok(q, |r| avail & (1u128 << r) != 0) {
                        avail |= 1u128 << q;
                        keep.push(q);
                    }
                }
                pl.research_queue = keep;
                return;
            }
            if pl.has_tech(t) || pl.research == t || pl.research_queue.len() >= 16 {
                return;
            }
            // race, choix exclusif de la Souche
            if !crate::races::tech_ok(w, p, t) {
                return;
            }
            let pl = &mut w.players[p as usize];
            // prérequis acquis, en cours ou plus tôt dans la file
            let avail = researched_bits(pl) | if pl.research != 0 { 1u128 << pl.research } else { 0 } | pl.research_queue.iter().fold(0u128, |a, &q| a | 1u128 << q);
            if !crate::races::prereq_ok(t, |r| avail & (1u128 << r) != 0) {
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
                    if udef(k).deploys != NO_KIND {
                        // chenillard des Transhumants : il devient son module (voir transhumants.rs)
                        crate::transhumants::start_deploy(w, s);
                    } else if k == U_QUEEN {
                        // Reine de la Souche : elle s'enracine ou se déracine (voir essaim.rs)
                        crate::essaim::toggle_root(w, s);
                    } else if k == U_SONDE || crate::combat::needs_deploy(k) {
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
        O_FERRY => {
            let q = c.next() & 1 != 0;
            let (mx, my) = (w.map.w * TILE - 1, w.map.h * TILE - 1);
            let (ax, ay) = (c.next().clamp(0, mx), c.next().clamp(0, my));
            let (bx, by) = (c.next().clamp(0, mx), c.next().clamp(0, my));
            let ok = crate::units::ferry_ok(w, ax, ay, bx, by);
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    let d = udef(w.units.kind[s]);
                    if ok && d.carry > 0 && d.layer == Layer::Air {
                        give(w, s, q, Order::Ferry { ax, ay, bx, by });
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
        O_PICKUP => {
            let q = c.next() & 1 != 0;
            let target = c.next() as u32;
            let ok = w.building(target).is_some_and(|b| crate::units::pickup_ok(w, p, b));
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if ok && udef(w.units.kind[s]).hold > 0 {
                        give(w, s, q, Order::Pickup { target });
                    }
                }
            }
        }
        O_DELIVER => {
            let q = c.next() & 1 != 0;
            let item = c.next();
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if (0..crate::data::NUM_ITEMS as i32).contains(&item) && udef(w.units.kind[s]).hold > 0 {
                        give(w, s, q, Order::Deliver { item: item as u8 });
                    }
                }
            }
        }
        O_DEPLOY_AT => {
            let flags = c.next();
            let q = flags & 1 != 0;
            let dir = ((flags >> 2) & 7).min(4) as u8;
            let (x, y) = (c.next().clamp(0, w.map.w * TILE - 1), c.next().clamp(0, w.map.h * TILE - 1));
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if udef(w.units.kind[s]).deploys != NO_KIND && w.units.cold[s].pack != crate::transhumants::PACK_FOLDING {
                        // un déploiement en cours s'arrête : le chenillard repart vers le point
                        w.units.cold[s].pack = 0;
                        give(w, s, q, Order::DeployAt { x, y, dir });
                    }
                }
            }
        }
        O_ADAPT => {
            let f = c.next();
            if f >= 0 {
                crate::essaim::adapt(w, p, f as usize);
            }
        }
        O_TAME => {
            let q = c.next() & 1 != 0;
            let target = c.next() as u32;
            let ok = crate::souche::tameable(w, p, target);
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if ok && w.units.kind[s] == crate::data::U_QUEEN {
                        give(w, s, q, Order::Tame { target });
                    }
                }
            }
        }
        O_HITCH => {
            if let Some(b) = own_building(w, p, c.next()) {
                crate::transhumants::hitch(w, b);
            }
        }
        O_HAUL => {
            let flags = c.next();
            let (q, feed) = (flags & 1 != 0, flags & 2 != 0);
            let site = c.next() as u32;
            let ok = w.building(site).is_some_and(|b| crate::transhumants::haul_ok(w, p, b, feed));
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if ok && w.units.kind[s] == U_T_CART {
                        give(w, s, q, Order::Haul { site, feed });
                    }
                }
            }
        }
        O_PLANT_POLE => {
            let (r, x, y) = (c.next(), c.next(), c.next());
            if let Some(b) = own_building(w, p, r) {
                crate::transhumants::plant_pole(w, b, x, y);
            }
        }
        O_PACK => {
            let n = c.next().clamp(0, 256);
            for _ in 0..n {
                let r = c.next();
                if let Some(b) = own_building(w, p, r) {
                    crate::transhumants::fold(w, b);
                }
            }
        }
        O_MOD_INSTALL => {
            let m = c.next();
            for id in units_list(&mut c) {
                if let (Some(h), 1..=255) = (crate::ameliorations::Host::resolve(w, p, id as u32), m) {
                    crate::ameliorations::install(w, h, m as u8);
                }
            }
        }
        O_MOD_CANCEL => {
            for id in units_list(&mut c) {
                if let Some(h) = crate::ameliorations::Host::resolve(w, p, id as u32) {
                    crate::ameliorations::cancel(w, h);
                }
            }
        }
        O_ARK_TURRETS => {
            let a = c.next();
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    crate::ameliorations::order_turrets(w, s, a);
                }
            }
        }
        O_ARK_TURRET_TYPE => {
            let (id, k, kind) = (c.next(), c.next(), c.next());
            if let Some(s) = own_unit(w, p, id) {
                crate::ameliorations::set_turret_type(w, s, k, kind);
            }
        }
        O_ARK_BOOST => {
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    crate::ameliorations::boost(w, s);
                }
            }
        }
        O_ARK_QUEUE => {
            let (id, kind, n) = (c.next(), c.next(), c.next());
            if let Some(s) = own_unit(w, p, id) {
                crate::ameliorations::workshop_queue(w, s, kind, n);
            }
        }
        O_HARVEST => {
            let q = c.next() & 1 != 0;
            let (x, y) = (c.next(), c.next());
            let ok = crate::units::harvest_recipe(w, p, x, y).is_some();
            for id in units_list(&mut c) {
                if let Some(s) = own_unit(w, p, id) {
                    if ok && w.units.kind[s] == crate::data::U_COMMANDER {
                        give(w, s, q, Order::Harvest { x, y });
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
        O_SET_CLOCK => {
            let r = c.next();
            let v = c.next().clamp(0, 1000) as u32;
            if let Some(b) = own_building(w, p, r) {
                buildings::set_clock(w, b, v);
            }
        }
        O_SET_SPLIT => {
            let r = c.next();
            let m = c.next();
            if let Some(b) = own_building(w, p, r) {
                if w.buildings[b].kind == B_SPLITTER && (0..=2).contains(&m) {
                    w.buildings[b].split = m as u8;
                    w.buildings[b].hand = 0;
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
        O_EMPTY_STASH => {
            if let Some(b) = own_building(w, p, c.next()) {
                crate::logistics::empty_stash(w, b);
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
        O_SET_PAUSE => {
            let on = c.next() != 0;
            let n = c.next().clamp(0, 4096);
            for _ in 0..n {
                if let Some(b) = own_building(w, p, c.next()) {
                    if buildings::pausable(&w.buildings[b]) && w.buildings[b].enabled == on && (!on || w.buildings[b].complete()) {
                        w.buildings[b].enabled = !on;
                        w.buildings[b].wake = 0;
                        if !on {
                            // reprise : ses fournisseurs (bras endormis) réessaient
                            buildings::wake_watchers(w, b);
                        }
                    }
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
                        crate::drones::refund_at(w, p, b, it, paid[k] as u32);
                    }
                    if w.buildings[b].kind == B_EPPZ_SOCKET {
                        w.players[p as usize].eppz += 1;
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
            // anneaux de transport : portée moyenne (RINGS_RANGE cases) ; les anneaux montent sur les deux
            // plateformes, puis ce qui est dessus s'échange (voir logistics::rings_exchange)
            let Some(t) = w.building(target) else { return };
            let ok = w.buildings[t].owner == p && w.buildings[t].def().class == BClass::Transfer && w.buildings[t].complete() && t != b;
            if !ok || w.buildings[b].cooldown > 0 || !w.buildings[b].working || w.buildings[b].charge > 0 || w.buildings[t].charge > 0 {
                return;
            }
            let (cx, cy) = w.buildings[b].center();
            let (tx, ty) = w.buildings[t].center();
            if dist2(cx, cy, tx, ty) > (crate::logistics::RINGS_RANGE as i64 * TILE as i64).pow(2) {
                return;
            }
            let rt = w.building_ref(t);
            w.buildings[b].charge = crate::logistics::RINGS_TIME;
            w.buildings[b].link = rt;
            w.buildings[t].charge = crate::logistics::RINGS_TIME;
            w.buildings[t].link = NONE;
        }
        BClass::Gate => {
            let Some(t) = w.building(target) else { return };
            if t == b || w.buildings[t].owner != p || w.buildings[t].def().class != BClass::Gate {
                return;
            }
            // terriers de la Souche : chacun a sa sortie (pas forcément par paires)
            if w.buildings[b].kind == B_BURROW || w.buildings[t].kind == B_BURROW {
                if w.buildings[b].kind == B_BURROW {
                    crate::souche::link_burrow(w, b, t);
                }
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
