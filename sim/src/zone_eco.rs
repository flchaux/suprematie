//! Économie d'une zone électrique, pour la barre des ressources (règles : docs/spec/rendu.md, « Barre des
//! ressources par zone »). Export à la demande, en lecture seule : rien ici ne touche l'état de la partie.
//!
//! - Zone d'un point : celle du premier poteau vivant (plus petit indice) du joueur dont la zone d'alimentation
//!   couvre la case, comme le rattachement des bâtiments (`rebuild_power`). Sinon, un générateur à sec qui
//!   couvre la case : sa zone éteinte. Souche : le réseau de racines dont le terreau couvre la case.
//! - Stock : dépôts du joueur rattachés à la zone (emprise touchée par la zone ; un dépôt qu'aucune zone ne
//!   touche compte dans la plus proche, voir `depot_zone`) et soutes de ses unités qui s'y trouvent (celle du commandant est un dépôt : son plafond compte) ; plus sa bourse (ADN, relevés), qui n'a pas de lieu. Souche : réserve du réseau.
//! - Production et consommation maximales : toutes les machines terminées de la zone à pleine vitesse
//!   (énergie à 100 %, cadence, pureté, niveau, usure des gisements), sans pénurie ni sortie bloquée.
//!   Les chantiers ne comptent pas. Débits en centièmes d'objet par minute.

use crate::buildings::{clock_of, crafter_speed, fuelless, max_supply, power_prod_of, purity_of, supply_of, RECIPE_SCALE};
use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;

const N: usize = NUM_ITEMS;
/// Ticks par minute.
const MIN: u64 = 1200;

/// Zone suivie : aucune, réseau vivant, générateur à sec (zone éteinte), réseau de racines (Souche).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Zone {
    None,
    Live(u16),
    Dry(usize),
    Roots(u16),
}

/// Générateur à combustible vide : il ne forme pas de zone (`rebuild_power`).
fn dry(bb: &Building) -> bool {
    bb.def().class == BClass::Power && bb.fuel <= 0 && !fuelless(bb.kind)
}

/// La zone d'alimentation du poteau `pb` touche-t-elle l'emprise (x, y, bw, bh) ? Même test que `rebuild_power`.
fn covers(pb: &Building, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    let (pw, ph) = pb.size();
    let sp = supply_of(pb);
    x < pb.x + pw + sp && x + bw > pb.x - sp && y < pb.y + ph + sp && y + bh > pb.y - sp
}

/// Premier poteau (plus petit indice) du joueur qui couvre l'emprise et vérifie `ok`.
fn first_pole(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32, ok: impl Fn(&Building) -> bool) -> Option<usize> {
    let r = (max_supply() + bw.max(bh) + 1) * TILE;
    let (cx, cy) = (x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2);
    let mut best = usize::MAX;
    w.grid.query_buildings(cx, cy, r, |p| {
        if p >= best {
            return;
        }
        let pb = &w.buildings[p];
        if pb.alive && pb.owner == owner && pb.complete() && supply_of(pb) > 0 && ok(pb) && covers(pb, x, y, bw, bh) {
            best = p;
        }
    });
    (best != usize::MAX).then_some(best)
}

/// Réseau vivant (0 : aucun) qui alimente une emprise : celui du premier poteau vivant qui la couvre.
fn live_net(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32) -> u16 {
    let live = |pb: &Building| !dry(pb) && pb.net != 0 && w.nets.get(pb.net as usize).is_some_and(|n| !n.unlimited);
    first_pole(w, owner, x, y, bw, bh, live).map_or(0, |p| w.buildings[p].net)
}

/// Zone d'une emprise du joueur. `net` : réseau déjà connu du bâtiment (bâtiment électrique), sinon recherché.
fn zone_of(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32, net: Option<u16>) -> Zone {
    let n = match net {
        Some(n) if w.nets.get(n as usize).is_some_and(|z| !z.unlimited) => n,
        Some(_) => 0,
        None => live_net(w, owner, x, y, bw, bh),
    };
    if n != 0 {
        return Zone::Live(n);
    }
    match first_pole(w, owner, x, y, bw, bh, dry) {
        Some(g) => Zone::Dry(g),
        None => Zone::None,
    }
}

/// Zone de la case (tx, ty) pour le joueur `p`.
pub fn zone_at(w: &World, p: u8, tx: i32, ty: i32) -> Zone {
    if w.players.get(p as usize).is_some_and(|pl| pl.race == RACE_SOUCHE) {
        return match crate::souche::net_at(w, p, tx, ty) {
            0 => Zone::None,
            n => Zone::Roots(n),
        };
    }
    zone_of(w, p, tx, ty, 1, 1, None)
}

/// Le bâtiment a-t-il un réseau électrique propre (`Building::net` tenu par `rebuild_power`) ?
fn wired(bb: &Building) -> bool {
    let d = bb.def();
    d.power_use != 0 || d.power_prod != 0 || d.supply != 0
}

/// Le bâtiment `b` est-il dans la zone `z` ?
fn in_zone(w: &World, b: usize, z: Zone) -> bool {
    let bb = &w.buildings[b];
    if let Zone::Roots(n) = z {
        return bb.net == n;
    }
    let (bw, bh) = bb.size();
    // bâtiment électrique : son réseau est connu ; une zone éteinte ne concerne que ceux qui n'en ont pas
    match (z, wired(bb)) {
        (Zone::Live(n), true) => bb.net == n,
        (Zone::Dry(_), true) if bb.net != 0 && w.nets.get(bb.net as usize).is_some_and(|z| !z.unlimited) => false,
        _ => zone_of(w, bb.owner, bb.x, bb.y, bw, bh, wired(bb).then_some(bb.net)) == z,
    }
}

/// Zone d'un dépôt du joueur : celle qui touche son emprise, sinon celle du poteau le plus proche (écart en
/// cases entre l'emprise et la zone d'alimentation du poteau ; à égalité, le plus petit indice). Un dépôt ne
/// prend pas d'énergie : posé à côté de sa base mais hors de portée des poteaux, il en fait quand même partie,
/// et chaque dépôt compte ainsi dans une seule zone. `poles` : poteaux du joueur, par indice croissant.
fn depot_zone(w: &World, b: usize, poles: &[usize]) -> Zone {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let z = zone_of(w, bb.owner, bb.x, bb.y, bw, bh, None);
    if z != Zone::None {
        return z;
    }
    let mut best: Option<(i32, usize)> = None;
    for &p in poles {
        let pb = &w.buildings[p];
        let (pw, ph) = pb.size();
        let sp = supply_of(pb);
        let gx = (pb.x - sp - (bb.x + bw)).max(bb.x - (pb.x + pw + sp)).max(0);
        let gy = (pb.y - sp - (bb.y + bh)).max(bb.y - (pb.y + ph + sp)).max(0);
        let d = gx.max(gy);
        if best.is_none_or(|(bd, _)| d < bd) {
            best = Some((d, p));
        }
    }
    let Some((_, p)) = best else { return Zone::None };
    // zone du poteau lui-même : il est dans la sienne (vivante, ou éteinte s'il est à sec)
    let pb = &w.buildings[p];
    let (pw, ph) = pb.size();
    zone_of(w, pb.owner, pb.x, pb.y, pw, ph, None)
}

/// Débits maximaux d'une machine terminée : ajoute à `prod` et `cons` (centièmes par minute).
fn machine_rates(w: &World, b: usize, prod: &mut [u64; N], cons: &mut [u64; N]) {
    let bb = &w.buildings[b];
    let owner = bb.owner as usize;
    let pl = &w.players[owner];
    // un cycle de `ticks` ticks qui consomme ou produit `n` objets : n × 100 × 1200 / ticks centièmes par minute
    let per_cycle = |n: u64, ticks: u64| n * 100 * MIN / ticks.max(1);
    // pendant une amélioration, la machine ne travaille pas (le générateur principal reste en service)
    if bb.upgrade > 0 && bb.kind != B_MAIN_GENERATOR {
        return;
    }
    match bb.def().class {
        // un cycle : time × RECIPE_SCALE de progrès, vitesse × 1024 par tick, recommencé de zéro
        BClass::Crafter if bb.recipe != RECIPE_NONE => {
            let r = &RECIPES[bb.recipe as usize];
            let gain = crafter_speed(bb) as u64 * 1024;
            if gain == 0 {
                return;
            }
            let ticks = (r.time as u64 * RECIPE_SCALE as u64).div_ceil(gain);
            for &(it, n) in r.inputs {
                cons[it as usize] += per_cycle(n as u64, ticks);
            }
            prod[r.output.0 as usize] += per_cycle(r.output.1 as u64, ticks);
        }
        // un objet : 30 × RECIPE_SCALE de progrès ; le reste est gardé (débit exact). Mêmes calculs que tick_extractor.
        BClass::Extractor if (bb.recipe as usize) < N => {
            let lvl = &EXTRACTOR_LEVELS[(bb.level as usize).min(EXTRACTOR_LEVELS.len() - 1)];
            let gain = 1024 * pl.res_mult.max(0) as u32 * lvl.speed / 100 * purity_of(bb) / 100 * clock_of(bb) / 100;
            let gain = if bb.kind == B_T_DRILL { gain as u64 * crate::transhumants::drill_speed(w, b) as u64 / 1000 } else { gain as u64 };
            prod[bb.recipe as usize] += gain * 100 * MIN / (30 * RECIPE_SCALE as u64);
        }
        // une unité : build × 20 × RECIPE_SCALE de progrès, 1024 × build_mult par tick ; ses composants
        BClass::Factory => {
            let Some(&(kind, _)) = bb.queue.first() else { return };
            let mut mult = pl.build_mult.max(0) as u64;
            if bb.def().race == RACE_SOUCHE {
                mult = mult * crate::souche::brood_speed(w, owner as u8) as u64 / 100;
            }
            if mult == 0 {
                return;
            }
            let d = udef(kind);
            let ticks = (factory_ticks(kind) as u64 * RECIPE_SCALE as u64).div_ceil(1024 * mult);
            for &(it, n) in d.cost {
                cons[it as usize] += per_cycle(n as u64 * batch(kind) as u64, ticks);
            }
        }
        // une unité de recherche : time secondes ; lots (Industriels), ADN (Souche), relevés (Transhumants)
        BClass::Lab => {
            let t = pl.research;
            if t == 0 {
                return;
            }
            let tech = &TECHS[t as usize];
            let ticks = tech.time as u64 * 20;
            match pl.race {
                RACE_SOUCHE => cons[ADN as usize] += per_cycle(tech.tier.max(1) as u64, ticks),
                RACE_TRANSH => cons[RELEVES as usize] += per_cycle((crate::transhumants::RELEVES_PER_TIER * tech.tier.max(1) as i32) as u64, ticks),
                _ => {
                    for k in 0..tech.tier as usize {
                        cons[PACK1 as usize + k] += per_cycle(1, ticks);
                    }
                }
            }
        }
        // générateur à pleine charge : il brûle sa puissance (power_tick : power_prod_of × charge / capacité)
        BClass::Power if !fuelless(bb.kind) => {
            let it = if bb.kind == B_CRYSTAL_REACTOR { ENERGY_CELL } else { HYDROCARBON };
            let e = crate::buildings::fuel_energy(bb.kind, it).max(1) as u64;
            cons[it as usize] += power_prod_of(bb).max(0) as u64 * 100 * MIN / e;
        }
        // organe de la Souche : centièmes par seconde (tick_organ)
        BClass::Organ => {
            let (s, l) = crate::souche::organ_rate(w, b);
            prod[SEVE as usize] += s.max(0) as u64 * 60;
            prod[SELS as usize] += l.max(0) as u64 * 60;
        }
        _ => {}
    }
}

/// Économie de la zone au centre de l'écran (case tx, ty) pour le joueur `p` (JSON) :
/// `zone` : 0 aucune, 1 réseau vivant, 2 zone éteinte (générateur à sec), 3 réseau de racines ;
/// `net` : réseau (1, 3) ; `gen` : référence du générateur à sec (2) ; `stock` : objets par type ; `cap` :
/// plafond total des dépôts de la zone, soute du commandant comprise s'il y est (Souche : de la réserve) ; `prod`, `cons` : débits maximaux en
/// centièmes par minute ; `machines` : machines comptées ; `power` : énergie de la zone [production, demande,
/// puissance installée (kW), satisfaction (0..1024), autonomie en s (-1 : rien ne brûle)].
pub fn zone_economy(w: &World, p: i32, tx: i32, ty: i32) -> String {
    let Some(pl) = (p >= 0).then(|| w.players.get(p as usize)).flatten() else { return "null".into() };
    let p = p as u8;
    let z = zone_at(w, p, tx, ty);
    let (code, net, gen) = match z {
        Zone::None => return "{\"zone\":0}".into(),
        Zone::Live(n) => (1, n as i32, 0u32),
        Zone::Dry(g) => (2, 0, w.building_ref(g)),
        Zone::Roots(n) => (3, n as i32, 0),
    };
    let mut stock = [0i64; N];
    let mut cap = 0i64;
    let mut prod = [0u64; N];
    let mut cons = [0u64; N];
    let mut machines = 0;
    // bourse du joueur (ADN, relevés) : elle n'a pas de lieu
    for (i, &n) in pl.purse.iter().enumerate().take(N) {
        stock[i] += n.max(0) as i64;
    }
    if let Zone::Roots(n) = z {
        let net = &w.nets[n as usize];
        stock[SEVE as usize] += net.seve.max(0) as i64;
        stock[SELS as usize] += net.sels.max(0) as i64;
        cap = net.store as i64;
    } else {
        // dépôts du joueur dans la zone, ou les plus proches d'elle (les entrepôts d'équipe n'en font pas partie)
        let poles: Vec<usize> = (0..w.buildings.len())
            .filter(|&b| {
                let bb = &w.buildings[b];
                bb.alive && bb.owner == p && bb.complete() && supply_of(bb) > 0 && zone_of(w, p, bb.x, bb.y, bb.size().0, bb.size().1, None) != Zone::None
            })
            .collect();
        for &b in &w.stores {
            let b = b as usize;
            let bb = &w.buildings[b];
            if bb.alive && bb.complete() && bb.owner == p && bb.def().class == BClass::Depot && depot_zone(w, b, &poles) == z {
                cap += crate::drones::store_cap(bb) as i64;
                for (i, &n) in bb.stash.iter().enumerate().take(N) {
                    stock[i] += n as i64;
                }
            }
        }
        // soutes des unités du joueur (commandant, ingénieurs) qui se trouvent dans la zone ; celle du
        // commandant est un dépôt mobile (plafond COMMANDER_CAP)
        let store = crate::drones::commander_store(w, p);
        for s in 0..w.units.alive.len() {
            let h = &w.units.cold[s].hold;
            if !w.units.alive[s] || w.units.owner[s] != p || (h.iter().all(|&n| n == 0) && store != Some(s)) {
                continue;
            }
            if zone_of(w, p, w.units.x[s].div_euclid(TILE), w.units.y[s].div_euclid(TILE), 1, 1, None) == z {
                if store == Some(s) {
                    cap += crate::drones::COMMANDER_CAP as i64;
                }
                for (i, &n) in h.iter().enumerate().take(N) {
                    stock[i] += n as i64;
                }
            }
        }
    }
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if !bb.alive || bb.owner != p || !bb.complete() {
            continue;
        }
        if !matches!(bb.def().class, BClass::Crafter | BClass::Extractor | BClass::Factory | BClass::Lab | BClass::Power | BClass::Organ) {
            continue;
        }
        if in_zone(w, b, z) {
            machines += 1;
            machine_rates(w, b, &mut prod, &mut cons);
        }
    }
    // énergie de la zone : production, demande, puissance installée (kW), satisfaction (0..1024), autonomie (s, -1 :
    // rien ne brûle) ; mêmes valeurs que power_zones. Zone éteinte : rien, sauf la puissance du générateur à sec.
    let power = match z {
        Zone::Live(n) => {
            let n = &w.nets[n as usize];
            let fuel: i64 = n.gens.iter().map(|&g| w.buildings[g as usize].fuel.max(0) as i64).sum();
            let burn = n.demand.min(n.prod) as i64;
            [n.prod as i64, n.demand as i64, n.cap as i64, n.sat as i64, if burn > 0 { fuel / burn / 20 } else { -1 }]
        }
        Zone::Dry(g) => [0, 0, crate::buildings::gen_prod(w, &w.buildings[g]) as i64, 0, -1],
        _ => [0, 0, 0, 1024, -1],
    };
    let list = |v: &mut dyn Iterator<Item = String>| v.collect::<Vec<_>>().join(",");
    format!(
        "{{\"zone\":{},\"net\":{},\"gen\":{},\"stock\":[{}],\"cap\":{},\"prod\":[{}],\"cons\":[{}],\"machines\":{},\"power\":[{}]}}",
        code,
        net,
        gen,
        list(&mut stock.iter().map(|x| x.to_string())),
        cap,
        list(&mut prod.iter().map(|x| x.to_string())),
        list(&mut cons.iter().map(|x| x.to_string())),
        machines,
        list(&mut power.iter().map(|x| x.to_string()))
    )
}
