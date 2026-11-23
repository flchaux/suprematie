//! Ponte de la Souche (voir docs/spec/races.md).
//!
//! Les couveuses ne font pas naître leurs organismes un par un. Une entrée de file est une **portée**
//! (`UnitDef::litter`, 3 à 6 selon l'espèce) : la couveuse la pond presque aussitôt (`data::LAY_TICKS`), sans
//! rien payer, tous ses œufs d'un coup devant elle (`lay`), tant qu'elle n'en couve pas déjà autant que son niveau le
//! permet (`data::BROOD_LEVELS` : 3, 6, puis 12). Une portée occupe sa place jusqu'à son dernier œuf (`litters`).
//!
//! Un œuf est une unité (`U_EGG_S`, `U_EGG_M`, `U_EGG_L` selon la taille de l'espèce) : immobile, sans
//! arme, il ne reçoit pas d'ordre, et l'ennemi peut le détruire comme n'importe quelle unité. C'est lui qui
//! paie : il puise le prix de son organisme dans le réseau de son terreau (à défaut, celui de sa couveuse), petit
//! à petit, à mesure qu'il avance vers l'éclosion (`tick_egg`) ; sans sève ou sans sels, il attend. Durée :
//! 10 s plus 2 s par seconde de fabrication (`incubation`), plus vite avec Fécondité ou une Reine enracinée.
//! À l'éclosion, l'œuf disparaît sans mort ni cadavre et l'organisme prend sa place (`hatch`), blessé dans la même
//! proportion que l'œuf.
//!
//! Un nid greffé (nid de mordeurs apprivoisé, `nature::Den`) pond de la même façon, une portée de
//! `nature::DEN_LITTER` œufs de mordeurs devant lui ; ils n'ont pas de prix, leurs œufs ne puisent rien.
//!
//! Rien de nouveau n'est sérialisé. Un œuf garde dans ses champs d'unité : l'espèce qu'il porte
//! (`UnitCold::work` = type + 1), son avancement (`xp`, centièmes de tick), la durée de l'incubation (`timer`,
//! ticks), l'attente avant de réessayer de puiser (`stuck`), sa couveuse (`parent`), sa portée (`pack_fuel` : tick de
//! la ponte) et l'ordre de ralliement (`orders`), dont l'organisme hérite. `ready_tick` vaut `DRAWS` ; un œuf d'une sauvegarde plus ancienne, déjà
//! payé, y garde son tick d'éclosion.

use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::map::P_LAND;
use crate::world::*;

/// Incubation de base d'un œuf, en ticks (10 s), et par seconde de fabrication de l'organisme (2 s).
pub const INCUBATION: u32 = 200;
pub const INCUBATION_PER_SEC: u32 = 40;
/// `UnitCold::ready_tick` d'un œuf qui paie son éclosion à mesure (les œufs plus anciens ont un tick d'éclosion).
pub const DRAWS: u32 = u32::MAX;
/// Attente (ticks) d'un œuf qui n'a pas trouvé de quoi puiser.
const RETRY: u16 = 10;
/// Événement : un œuf a éclos (x, y, type de l'œuf | type de l'organisme << 8, joueur | orientation << 8).
pub const EV_HATCH: i32 = 48;
/// Temps restant affiché d'un œuf qui n'éclora pas (voir `hatch_left`).
pub const EGG_NEVER: u32 = 0xffff;
/// Part minimale des points de vie de l'organisme né d'un œuf blessé (‰).
const HATCH_MIN_HP: i64 = 250;

#[inline]
pub fn is_egg(kind: u16) -> bool {
    matches!(kind, U_EGG_S | U_EGG_M | U_EGG_L)
}

/// Œuf (type d'unité) d'une espèce, d'après sa taille.
pub fn egg_of(kind: u16) -> u16 {
    match udef(kind).radius {
        r if r <= 100 => U_EGG_S,
        r if r <= 170 => U_EGG_M,
        _ => U_EGG_L,
    }
}

/// Durée de l'incubation d'un organisme (ticks, à vitesse normale).
pub fn incubation(kind: u16) -> u32 {
    INCUBATION + INCUBATION_PER_SEC * udef(kind).build as u32
}

/// Vitesse d'incubation (%) d'un œuf du joueur dans le réseau `net` : Fécondité, Reine enracinée.
fn egg_speed(w: &World, owner: u8, net: u16) -> u32 {
    let mut v = crate::souche::brood_speed(w, owner);
    if net != 0 && crate::essaim::royal_net(w, owner) == net {
        v = v * crate::essaim::Q_BROOD / 100;
    }
    v.max(1)
}

/// Couveuse de l'œuf, si elle vit encore.
fn mother(w: &World, s: usize) -> Option<usize> {
    w.building(w.units.cold[s].parent).filter(|&b| w.buildings[b].owner == w.units.owner[s])
}

/// Réseau où puise l'œuf : celui de son terreau, à défaut celui de sa couveuse.
fn egg_net(w: &World, s: usize) -> u16 {
    let n = crate::souche::net_at(w, w.units.owner[s], w.units.x[s] / TILE, w.units.y[s] / TILE);
    if n != 0 {
        n
    } else {
        mother(w, s).map_or(0, |b| w.buildings[b].net)
    }
}

/// Portées qu'une couveuse peut couver en même temps, à son niveau.
pub fn max_litters(bb: &Building) -> usize {
    BROOD_LEVELS[(bb.level as usize).min(BROOD_LEVELS.len() - 1)].litters as usize
}

/// Une portée en train de couver : sa couveuse, le tick de sa ponte, l'espèce, les œufs qui restent, le plus long temps
/// avant l'éclosion (ticks), la durée de l'incubation, et un de ses œufs attend-il de quoi puiser.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Litter {
    pub mother: u32,
    pub laid: i32,
    pub kind: u16,
    pub eggs: u16,
    pub left: u32,
    pub total: u32,
    pub wait: bool,
}

/// Portées en train de couver, par couveuse (référence) puis par ponte ; `only` : celles de cette couveuse seulement.
/// Les œufs d'une sauvegarde plus ancienne (sans tick de ponte) sont regroupés par espèce et par taille de portée.
pub fn litters(w: &World, only: Option<u32>) -> Vec<Litter> {
    let mut out: Vec<Litter> = Vec::new();
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || !is_egg(w.units.kind[s]) {
            continue;
        }
        let c = &w.units.cold[s];
        if c.parent == NONE || only.is_some_and(|r| r != c.parent) {
            continue;
        }
        let Some(kind) = content(w, s) else { continue };
        let (left, wait) = (hatch_left(w, s), c.ready_tick == DRAWS && c.stuck > 0);
        match out.iter_mut().find(|l| l.mother == c.parent && l.laid == c.pack_fuel && l.kind == kind && (l.laid != 0 || l.eggs < batch(kind))) {
            Some(l) => {
                l.eggs += 1;
                l.left = l.left.max(left);
                l.wait |= wait;
            }
            None => out.push(Litter { mother: c.parent, laid: c.pack_fuel, kind, eggs: 1, left, total: c.timer as u32, wait }),
        }
    }
    out.sort_by_key(|l| (l.mother, l.laid, l.kind));
    out
}

/// Nombre de portées en train de couver, par couveuse (référence croissante), pour l'affichage.
pub fn litter_counts(w: &World) -> Vec<(u32, u32)> {
    let mut keys: Vec<(u32, i32, u16)> = Vec::new();
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && is_egg(w.units.kind[s]) && w.units.cold[s].parent != NONE {
            if let Some(kind) = content(w, s) {
                keys.push((w.units.cold[s].parent, w.units.cold[s].pack_fuel, kind));
            }
        }
    }
    keys.sort_unstable();
    let mut out: Vec<(u32, u32)> = Vec::new();
    let mut k = 0;
    while k < keys.len() {
        let n = keys[k..].iter().take_while(|&&x| x == keys[k]).count();
        // œufs d'une ancienne sauvegarde (sans tick de ponte) : autant de portées qu'il en faut pour les contenir
        let l = if keys[k].1 != 0 { 1 } else { n.div_ceil(batch(keys[k].2).max(1) as usize) as u32 };
        match out.last_mut().filter(|o| o.0 == keys[k].0) {
            Some(o) => o.1 += l,
            None => out.push((keys[k].0, l)),
        }
        k += n;
    }
    out
}

/// La couveuse peut-elle pondre une portée de plus ?
pub fn has_room(w: &World, b: usize) -> bool {
    litters(w, Some(w.building_ref(b))).len() < max_litters(&w.buildings[b])
}

/// Fiche d'une couveuse (JSON) : portées au plus, et celles qui couvent ([espèce, œufs, ticks avant l'éclosion, durée,
/// en attente de sève ou de sels]), la plus proche d'éclore d'abord.
pub fn brood_info(w: &World, b: usize) -> String {
    if !w.buildings[b].complete() {
        return String::new();
    }
    let mut v = litters(w, Some(w.building_ref(b)));
    v.sort_by_key(|l| (l.left, l.laid));
    let list: Vec<String> = v.iter().map(|l| format!("[{},{},{},{},{}]", l.kind, l.eggs, l.left, l.total, l.wait as u8)).collect();
    format!(",\"brood\":{{\"max\":{},\"litters\":[{}]}}", max_litters(&w.buildings[b]), list.join(","))
}

/// Couveuse d'une sauvegarde plus ancienne : ce qu'elle avait pris pour une portée retourne au réseau.
pub fn give_back(w: &mut World, b: usize) {
    if w.buildings[b].stash.iter().all(|&n| n == 0) {
        return;
    }
    let stash = std::mem::take(&mut w.buildings[b].stash);
    let net = w.buildings[b].net;
    for (it, n) in stash.into_iter().enumerate() {
        crate::souche::refund(w, net, it as u8, n as i32);
    }
}

/// Espèce portée par l'œuf `s`, s'il en porte une.
pub fn content(w: &World, s: usize) -> Option<u16> {
    let k = w.units.cold[s].work;
    (is_egg(w.units.kind[s]) && k >= 1 && (k as usize) <= UNITS.len()).then(|| (k - 1) as u16)
}

/// Ticks avant l'éclosion de l'œuf `s`, à son rythme normal (EGG_NEVER s'il ne porte rien : il n'éclora pas).
pub fn hatch_left(w: &World, s: usize) -> u32 {
    if content(w, s).is_none() {
        return EGG_NEVER;
    }
    let c = &w.units.cold[s];
    if c.ready_tick != DRAWS {
        return c.ready_tick.saturating_sub(w.tick).min(EGG_NEVER - 1);
    }
    let left = (c.timer as u32 * 100).saturating_sub(c.xp);
    left.div_ceil(crate::souche::brood_speed(w, w.units.owner[s]).max(1)).min(EGG_NEVER - 1)
}

/// Œuf qui paie son éclosion : le réseau où il puise, son espèce et la durée de son incubation (ticks, à la vitesse
/// de son joueur).
pub fn egg_load(w: &World, s: usize) -> Option<(u16, u16, u32)> {
    let k = content(w, s)?;
    if w.units.cold[s].ready_tick != DRAWS {
        return None;
    }
    Some((egg_net(w, s), k, w.units.cold[s].timer as u32 * 100 / crate::souche::brood_speed(w, w.units.owner[s]).max(1)))
}

/// Fiche d'un œuf (JSON) : espèce, ticks avant l'éclosion, durée, ce qu'il a déjà puisé de son prix, en attente.
pub fn info(w: &World, s: usize) -> String {
    let Some(k) = content(w, s) else { return "null".into() };
    let c = &w.units.cold[s];
    let draws = c.ready_tick == DRAWS;
    let paid: Vec<String> = udef(k).cost.iter().map(|&(it, n)| format!("[{},{},{}]", it, if draws { drawn(n, c.xp, c.timer) } else { n as u32 }, n)).collect();
    format!("{{\"kind\":{},\"left\":{},\"total\":{},\"paid\":[{}],\"wait\":{}}}", k, hatch_left(w, s), c.timer, paid.join(","), draws && c.stuck > 0)
}

/// Sens de la sortie d'un bâtiment (vecteur unité).
fn out_dir(dir: u8) -> (i32, i32) {
    match dir & 3 {
        0 => (1, 0),
        1 => (0, 1),
        2 => (-1, 0),
        _ => (0, -1),
    }
}

/// Distance entre deux cases voisines d'un pavage hexagonal de coordonnées axiales (q, r).
fn hex_ring(q: i32, r: i32) -> i32 {
    (q.abs() + r.abs() + (q + r).abs()) / 2
}

/// Places d'une portée de `n` œufs de rayon `r` autour du point (cx, cy), en nid d'abeilles serré : le
/// centre, puis l'anneau qui l'entoure (un œuf sur deux d'abord, pour qu'une petite portée reste
/// ramassée), puis les anneaux suivants. `d` : sens de la sortie (les œufs ne reculent pas de plus d'un
/// rang vers le bâtiment). Une place est prise si elle n'est pas au sol, ou si un œuf y est déjà.
fn clutch_spots(w: &World, cx: i32, cy: i32, d: (i32, i32), r: i32, n: usize) -> Vec<(i32, i32)> {
    const RING1: [(i32, i32); 6] = [(1, 0), (-1, 1), (0, -1), (0, 1), (-1, 0), (1, -1)];
    let sp = 2 * r + 20;
    let l = (-d.1, d.0);
    let mut cells: Vec<(i32, i32)> = vec![(0, 0)];
    cells.extend_from_slice(&RING1);
    for k in 2..=4 {
        for q in -k..=k {
            for rr in -k..=k {
                if hex_ring(q, rr) == k {
                    cells.push((q, rr));
                }
            }
        }
    }
    let mut out: Vec<(i32, i32)> = Vec::with_capacity(n);
    for (q, rr) in cells {
        if out.len() >= n {
            break;
        }
        // côté (le long de la façade) et avancée (vers la sortie)
        let side = sp * (2 * q + rr) / 2;
        let fwd = sp * rr * 887 / 1024;
        if fwd < -(sp + 16) {
            continue;
        }
        let (x, y) = (cx + l.0 * side + d.0 * fwd, cy + l.1 * side + d.1 * fwd);
        if x < 0 || y < 0 || !w.map.passable(x / TILE, y / TILE, P_LAND) {
            continue;
        }
        let clear = |ox: i32, oy: i32, or: i32| dist2(x, y, ox, oy) >= ((r + or) as i64).pow(2);
        if !out.iter().all(|&(ox, oy)| clear(ox, oy, r)) {
            continue;
        }
        let mut free = true;
        w.grid.fine.query(x, y, r + 200, |o| {
            if w.units.alive[o] && is_egg(w.units.kind[o]) && !clear(w.units.x[o], w.units.y[o], udef(w.units.kind[o]).radius) {
                free = false;
            }
        });
        if free {
            out.push((x, y));
        }
    }
    // plus de place devant (façade murée, rive) : le reste sur la case libre la plus proche
    let mut k = 0i32;
    while out.len() < n {
        let (fx, fy) = crate::buildings::free_spot_near(w, cx, cy, P_LAND);
        out.push((fx + (k % 3 - 1) * 70, fy + ((k / 3) % 3 - 1) * 70));
        k += 1;
    }
    out
}

/// Pond un œuf de l'espèce `kind` en (x, y) pour `owner` ; `parent` : sa couveuse (NONE : aucune). À l'éclosion
/// l'organisme ira en `rally` (se sacrifier, si c'est une graine-mère en croissance), ou restera sur place s'il
/// n'y en a pas.
pub fn lay_egg(w: &mut World, owner: u8, kind: u16, x: i32, y: i32, rally: Option<(i32, i32)>, parent: u32) -> u32 {
    let facing = w.rng.below(65536) as u16;
    let id = w.spawn_unit(egg_of(kind), owner, x, y);
    let s = slot_of(id);
    w.units.facing[s] = facing;
    let order = rally.map(|(rx, ry)| match crate::souche::heart_under(w, owner, rx, ry) {
        Some(target) if crate::souche::sacrifice_value(kind) > 0 => Order::Sacrifice { target },
        _ => Order::Move { x: rx, y: ry, gx: rx, gy: ry, attack: false, eta: 0 },
    });
    let tick = w.tick;
    let c = &mut w.units.cold[s];
    c.work = kind as u32 + 1;
    c.ready_tick = DRAWS;
    c.xp = 0;
    c.timer = incubation(kind).min(u16::MAX as u32) as u16;
    c.parent = parent;
    // la portée, reconnue à son tick de ponte (jamais 0)
    c.pack_fuel = tick as i32 + 1;
    c.orders.extend(order);
    id
}

/// Pond une portée de `n` œufs de l'espèce `kind` autour de (cx, cy), vers `d` (voir `clutch_spots`).
#[allow(clippy::too_many_arguments)]
pub fn lay_clutch(w: &mut World, owner: u8, kind: u16, n: usize, cx: i32, cy: i32, d: (i32, i32), rally: Option<(i32, i32)>, parent: u32) -> Vec<u32> {
    let r = udef(egg_of(kind)).radius;
    clutch_spots(w, cx, cy, d, r, n).into_iter().map(|(x, y)| lay_egg(w, owner, kind, x, y, rally, parent)).collect()
}

/// La couveuse `b` pond la portée de l'espèce `kind` devant sa sortie.
pub fn lay(w: &mut World, b: usize, kind: u16) {
    let rally = w.buildings[b].rally;
    lay_from(w, b, kind, batch(kind) as usize, Some(rally));
}

/// Le bâtiment `b` (couveuse, nid greffé) pond `n` œufs de l'espèce `kind` devant sa sortie ; renvoie
/// leurs identifiants.
pub fn lay_from(w: &mut World, b: usize, kind: u16, n: usize, rally: Option<(i32, i32)>) -> Vec<u32> {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let (cx, cy) = bb.center();
    let d = out_dir(bb.dir);
    let half = if d.0 != 0 { bw } else { bh } * TILE / 2;
    let r = udef(egg_of(kind)).radius;
    // centre de la portée : un rang d'œufs entre lui et la façade
    let ahead = half + 3 * r + 44;
    let owner = bb.owner;
    let parent = w.building_ref(b);
    lay_clutch(w, owner, kind, n, cx + d.0 * ahead, cy + d.1 * ahead, d, rally, parent)
}

/// Quantité puisée d'un objet de prix `n` à l'avancement `xp` (centièmes de tick) d'une incubation de `timer` ticks.
fn drawn(n: u16, xp: u32, timer: u16) -> u32 {
    (n as u64 * xp as u64).div_ceil(timer.max(1) as u64 * 100).min(n as u64) as u32
}

/// Un tick d'un œuf (appelé par `units::update_units` à la place des ordres et des armes) : il avance et puise ce
/// qu'il doit dans son réseau ; payé en entier, il éclot. Un œuf qui ne porte rien (vitrine des modèles) reste un
/// œuf.
pub fn tick_egg(w: &mut World, s: usize) {
    let Some(kind) = content(w, s) else { return };
    let c = &mut w.units.cold[s];
    if c.ready_tick != DRAWS {
        if w.tick >= c.ready_tick {
            hatch(w, s);
        }
        return;
    }
    if c.stuck > 0 {
        c.stuck -= 1;
        if c.stuck > 0 {
            return;
        }
    }
    let owner = w.units.owner[s];
    let (xp, timer) = (w.units.cold[s].xp, w.units.cold[s].timer);
    let near = mother(w, s).map_or(0, |b| w.buildings[b].net);
    let p2 = (xp + egg_speed(w, owner, near)).min(timer as u32 * 100);
    let cost = udef(kind).cost;
    let need = |k: usize| drawn(cost[k].1, p2, timer) - drawn(cost[k].1, xp, timer);
    if (0..cost.len()).any(|k| need(k) > 0) {
        let net = egg_net(w, s);
        let dues: Vec<(u8, i32)> = (0..cost.len()).map(|k| (cost[k].0, need(k) as i32)).collect();
        if !crate::souche::take_all(w, owner, net, &dues) {
            w.units.cold[s].stuck = RETRY;
            return;
        }
    }
    w.units.cold[s].xp = p2;
    if p2 >= timer as u32 * 100 {
        hatch(w, s);
    }
}

/// Éclosion : l'œuf disparaît sans mort ni cadavre, l'organisme qu'il portait prend sa place, avec
/// son orientation, ses ordres et la même part de points de vie.
pub fn hatch(w: &mut World, s: usize) {
    let egg = w.units.kind[s];
    let old = w.unit_id(s);
    let kind = content(w, s);
    let owner = w.units.owner[s];
    let (x, y, facing) = (w.units.x[s], w.units.y[s], w.units.facing[s]);
    let (hp, max) = (w.units.hp[s].max(0) as i64, w.max_hp(s).max(1) as i64);
    let orders = std::mem::take(&mut w.units.cold[s].orders);
    w.units.alive[s] = false;
    w.units.free.push(s as u32);
    let pl = &mut w.players[owner as usize];
    pl.unit_count = pl.unit_count.saturating_sub(1);
    let Some(kind) = kind else { return };
    let id = w.spawn_unit(kind, owner, x, y);
    let n = slot_of(id);
    w.units.facing[n] = facing;
    w.units.cold[n].orders = orders;
    let full = w.units.hp[n] as i64;
    w.units.hp[n] = (full * (hp * 1000 / max).clamp(HATCH_MIN_HP, 1000) / 1000).max(1) as i32;
    w.ev(EV_HATCH, x, y, egg as i32 | (kind as i32) << 8, owner as i32 | (facing as i32) << 8);
    // nid greffé : la bête née de l'œuf reste comptée dans sa portée
    crate::nature::egg_hatched(w, old, id);
}
