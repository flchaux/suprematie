//! Dépôts et drones de construction (règles : docs/spec/economie.md, « Dépôts et drones de construction »).
//!
//! - Il n'y a pas de réserve commune : chaque dépôt (et chaque entrepôt d'équipe) garde ses objets dans
//!   `Building::stash` (NUM_ITEMS cases), plafonnés par objet (`store_cap`).
//! - Constructeurs : le commandant et les ingénieurs (soute `UnitCold::hold`, dont la construction se
//!   paie), les usines d'unités (réserve d'avance de l'usine). Chacun a des drones et un rayon de
//!   ravitaillement. Les générateurs à combustible ont aussi un drone, pour leur réservoir.
//! - Drones (`Carrier`, genre `DRONE`) : un aller-retour constructeur → dépôt → constructeur, en vol
//!   direct. Ils n'existent que pendant le voyage. Les départs se décident toutes les `PLAN_PERIOD` ticks
//!   (`plan`), les vols avancent à chaque tick (`update_drone`).

use crate::data::*;
use crate::fixed::{dist, dist2, TILE};
use crate::logistics::Carrier;
use crate::world::*;

/// Genre de véhicule (`Carrier::kind`) des drones de ravitaillement.
pub const DRONE: u8 = 3;
/// Les départs de drones se décident une fois toutes ces ticks.
pub const PLAN_PERIOD: u32 = 10;
/// Avance de travail (ticks) que les drones d'un constructeur vont chercher pour le chantier en cours.
const AHEAD_TICKS: u64 = 200;
/// Ordres de la file pris en compte pour les besoins d'un constructeur.
const MAX_QUEUE: usize = 64;
const N: usize = NUM_ITEMS;

// ---------- stocks ----------

/// Dépôt ou entrepôt d'équipe (bâtiment qui garde un stock où les drones puisent).
#[inline]
pub fn is_store(bb: &Building) -> bool {
    matches!(bb.def().class, BClass::Depot | BClass::Warehouse)
}

/// Plafond du stock, par objet.
pub fn store_cap(bb: &Building) -> u16 {
    match bb.def().class {
        BClass::Depot => DEPOT_CAP[(bb.level as usize).min(DEPOT_CAP.len() - 1)] as u16,
        BClass::Warehouse => DEPOT_CAP[DEPOT_CAP.len() - 1] as u16,
        _ => 0,
    }
}

#[inline]
pub fn has(v: &[u16], it: u8) -> u16 {
    v.get(it as usize).copied().unwrap_or(0)
}

/// Ajoute `n` objets à un stock (soute, dépôt), sans plafond.
pub fn put(v: &mut Vec<u16>, it: u8, n: u16) {
    if n == 0 || it as usize >= N {
        return;
    }
    if v.len() < N {
        v.resize(N, 0);
    }
    v[it as usize] = v[it as usize].saturating_add(n);
}

/// Retire au plus `n` objets ; renvoie ce qui a été retiré.
pub fn take(v: &mut [u16], it: u8, n: u16) -> u16 {
    let k = has(v, it).min(n);
    if k > 0 {
        v[it as usize] -= k;
    }
    k
}

/// Place libre pour `it` dans le stock `bb` (0 : plein, ou pas un stock terminé).
pub fn store_room(bb: &Building, it: u8) -> u16 {
    if !bb.alive || !bb.complete() || !is_store(bb) {
        return 0;
    }
    store_cap(bb).saturating_sub(has(&bb.stash, it))
}

/// Le joueur `p` peut-il puiser dans le stock `b` ? Ses propres dépôts, les entrepôts de son équipe.
pub fn usable(w: &World, p: u8, b: usize) -> bool {
    let bb = &w.buildings[b];
    bb.alive
        && bb.complete()
        && match bb.def().class {
            BClass::Depot => bb.owner == p,
            BClass::Warehouse => w.team_of(bb.owner) == w.team_of(p),
            _ => false,
        }
}

/// Empreinte d'un stock (hachage de l'état).
pub fn fold(v: &[u16]) -> u64 {
    v.iter().enumerate().fold(0u64, |a, (i, &n)| a.wrapping_mul(0x9E37_79B9).wrapping_add(n as u64 | (i as u64) << 16))
}

/// Total des objets d'un stock.
pub fn total(v: &[u16]) -> u32 {
    v.iter().map(|&n| n as u32).sum()
}

// ---------- liste des stocks (dérivée, par indice croissant) ----------

/// Un dépôt ou un entrepôt vient d'être terminé : il entre dans `World::stores`.
pub fn store_added(w: &mut World, b: usize) {
    if is_store(&w.buildings[b]) {
        if let Err(p) = w.stores.binary_search(&(b as u32)) {
            w.stores.insert(p, b as u32);
        }
    }
}

/// Un bâtiment disparaît : il quitte `World::stores`.
pub fn store_removed(w: &mut World, b: usize) {
    if let Ok(p) = w.stores.binary_search(&(b as u32)) {
        w.stores.remove(p);
    }
}

/// Reconstruit `World::stores` (après une restauration).
pub fn rebuild_stores(w: &mut World) {
    w.stores = (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].complete() && is_store(&w.buildings[b])).map(|b| b as u32).collect();
}

/// Stocks utilisables par `p` à moins de `r` (sous-unités) de (x, y), du plus proche au plus loin, puis par
/// indice croissant : (distance², indice).
pub fn stores_near(w: &World, p: u8, x: i32, y: i32, r: i32) -> Vec<(i64, usize)> {
    let r2 = r as i64 * r as i64;
    let mut v = Vec::new();
    for &b in &w.stores {
        let b = b as usize;
        if !usable(w, p, b) {
            continue;
        }
        let (cx, cy) = w.buildings[b].center();
        let d = dist2(x, y, cx, cy);
        if d <= r2 {
            v.push((d, b));
        }
    }
    v.sort_unstable();
    v
}

/// Quantité de `it` dans les stocks utilisables par `p` à moins de `r` (sous-unités) de (x, y).
pub fn near_amount(w: &World, p: u8, x: i32, y: i32, r: i32, it: u8) -> u32 {
    stores_near(w, p, x, y, r).iter().map(|&(_, b)| has(&w.buildings[b].stash, it) as u32).sum()
}

/// Prend au plus `n` objets `it` dans les stocks utilisables à moins de `r` de (x, y), le plus proche
/// d'abord ; renvoie ce qui a été pris.
pub fn take_near(w: &mut World, p: u8, x: i32, y: i32, r: i32, it: u8, n: u16) -> u16 {
    let mut got = 0;
    for (_, b) in stores_near(w, p, x, y, r) {
        if got >= n {
            break;
        }
        got += take(&mut w.buildings[b].stash, it, n - got);
    }
    got
}

/// Paiement immédiat (sans chantier) : le coût est pris dans les stocks utilisables à moins de
/// NEAR_SUPPLY cases de (x, y), le plus proche d'abord. Faux, sans rien prendre, s'ils ne couvrent pas tout.
pub fn pay_near(w: &mut World, p: u8, x: i32, y: i32, cost: &[(u8, u16)]) -> bool {
    let r = NEAR_SUPPLY * TILE;
    let near = stores_near(w, p, x, y, r);
    if !cost.iter().all(|&(it, n)| near.iter().map(|&(_, b)| has(&w.buildings[b].stash, it) as u32).sum::<u32>() >= n as u32) {
        return false;
    }
    for &(it, n) in cost {
        let mut left = n;
        for &(_, b) in &near {
            left -= take(&mut w.buildings[b].stash, it, left);
        }
        w.players[p as usize].consumed[it as usize] += n as u32;
    }
    true
}

/// Stock utilisable par `p` le plus proche de (x, y), à moins de `r`, qui a de la place pour `it`.
pub fn store_with_room(w: &World, p: u8, x: i32, y: i32, r: i32, it: u8) -> Option<usize> {
    stores_near(w, p, x, y, r).into_iter().map(|(_, b)| b).find(|&b| store_room(&w.buildings[b], it) > 0)
}

/// Remboursement, sans plafond : au dépôt du joueur le plus proche de (x, y) ; à défaut, à l'entrepôt
/// de son équipe le plus proche ; perdu s'il n'a ni l'un ni l'autre.
pub fn refund(w: &mut World, p: u8, x: i32, y: i32, it: u8, n: u32) {
    if n == 0 || it == 0 || it as usize >= N || p as usize >= w.players.len() {
        return;
    }
    let near = stores_near(w, p, x, y, i32::MAX);
    let pick = near.iter().find(|&&(_, b)| w.buildings[b].def().class == BClass::Depot).or(near.first()).map(|&(_, b)| b);
    if let Some(b) = pick {
        put(&mut w.buildings[b].stash, it, n.min(u16::MAX as u32) as u16);
    }
}

/// Remboursement au plus près du bâtiment `b`.
pub fn refund_at(w: &mut World, p: u8, b: usize, it: u8, n: u32) {
    let (x, y) = w.buildings[b].center();
    refund(w, p, x, y, it, n);
}

/// Pose un dépôt terminé rempli de `items` pour le joueur `p`, au plus près de son générateur principal
/// (sinon de son point de départ) : ressources de départ, conversion des anciennes sauvegardes.
pub fn place_filled_depot(w: &mut World, p: u8, items: &[i32; N]) -> Option<usize> {
    let gen = (0..w.buildings.len()).find(|&b| {
        let bb = &w.buildings[b];
        bb.alive && bb.owner == p && bb.kind == B_MAIN_GENERATOR
    });
    let (ox, oy) = match gen {
        Some(g) => {
            let (cx, cy) = w.buildings[g].center();
            (cx / TILE, cy / TILE)
        }
        None => *w.map.starts.get(p as usize)?,
    };
    // anneaux de plus en plus larges autour du point, dans un ordre fixe
    let (dw, dh) = crate::buildings::dims(B_DEPOT, 0);
    for r in 2..40 {
        for k in 0..8 * r {
            let (dx, dy) = ring(r, k);
            let (x, y) = (ox + dx - dw / 2, oy + dy - dh / 2);
            if let Some(b) = crate::buildings::place_building(w, p, B_DEPOT, x, y, 0) {
                crate::buildings::complete_building(w, b);
                for (it, &n) in items.iter().enumerate() {
                    put(&mut w.buildings[b].stash, it as u8, n.clamp(0, u16::MAX as i32) as u16);
                }
                return Some(b);
            }
        }
    }
    None
}

/// k-ième case (0 ≤ k < 8r) de l'anneau carré de rayon r, en partant du coin haut gauche.
fn ring(r: i32, k: i32) -> (i32, i32) {
    let s = 2 * r;
    match k / s {
        0 => (-r + k, -r),
        1 => (r, -r + (k - s)),
        2 => (r - (k - 2 * s), r),
        _ => (-r, r - (k - 3 * s)),
    }
}

// ---------- constructeurs ----------

/// Place de la soute pour ce qui y entre par récolte, recyclage ou ramassage.
pub fn hold_room(w: &World, s: usize) -> u32 {
    (udef(w.units.kind[s]).hold as u32).saturating_sub(total(&w.units.cold[s].hold))
}

/// Événement : un constructeur n'a trouvé aucun dépôt où livrer un objet de sa soute
/// (joueur, x, y, objet ; voir l'ordre Deliver).
pub const EV_NO_DEPOT: i32 = 46;

/// Livraison au dépôt (ordre Deliver) du constructeur `s` : objet à livrer et stock visé. Pour un objet
/// donné, le stock utilisable le plus proche (à vol d'oiseau, sans limite de distance) qui a de la place
/// pour lui ; pour `item` 0 (toute la soute), le plus proche qui a de la place pour au moins un des objets
/// de la soute, et le premier de ces objets. Rien si la soute n'en a pas, ou si aucun stock n'a de place.
pub fn deliver_target(w: &World, s: usize, item: u8) -> Option<(u8, usize)> {
    let hold = &w.units.cold[s].hold;
    if item as usize >= N || (item != 0 && has(hold, item) == 0) {
        return None;
    }
    let near = stores_near(w, w.units.owner[s], w.units.x[s], w.units.y[s], i32::MAX);
    near.into_iter().find_map(|(_, b)| {
        let bb = &w.buildings[b];
        if item != 0 {
            return (store_room(bb, item) > 0).then_some((item, b));
        }
        (1..N).find(|&it| has(hold, it as u8) > 0 && store_room(bb, it as u8) > 0).map(|it| (it as u8, b))
    })
}

/// Les drones du constructeur `s` peuvent-ils vider sa soute ? Un objet de la soute a de la place dans un
/// stock utilisable à son rayon de ravitaillement.
pub fn can_unload_near(w: &World, s: usize) -> bool {
    let d = udef(w.units.kind[s]);
    if d.drones == 0 {
        return false;
    }
    let hold = &w.units.cold[s].hold;
    let near = stores_near(w, w.units.owner[s], w.units.x[s], w.units.y[s], d.supply * TILE);
    near.iter().any(|&(_, b)| (1..N).any(|it| has(hold, it as u8) > 0 && store_room(&w.buildings[b], it as u8) > 0))
}

/// Puissance de construction effective d'une unité.
fn build_power(w: &World, s: usize) -> u64 {
    udef(w.units.kind[s]).build_power as u64 * w.players[w.units.owner[s] as usize].build_mult as u64 / 100
}

/// Chantier en tête de file d'un constructeur : avance voulue par objet.
struct Head {
    ahead: [u32; N],
}

/// Reste à payer d'un chantier (bâtiment `kind`, déjà construit à `build`, payé `paid`) dans `rem`, et
/// ce qu'en consomment les prochaines `AHEAD_TICKS` ticks de travail à la puissance `bp` dans `ahead`.
fn remaining(kind: u16, build: u32, paid: &[u16; 4], bp: u64, rem: &mut [u32; N], ahead: &mut [u32; N]) {
    let def = bdef(kind);
    let work = def.build as u64 * 20 * 10;
    let delta = (bp * BUILD_FULL as u64 / work.max(1)).max(1);
    let until = (build as u64 + delta * AHEAD_TICKS).min(BUILD_FULL as u64);
    for (k, &(it, n)) in def.cost.iter().enumerate() {
        let rest = (n as u32).saturating_sub(paid[k] as u32);
        rem[it as usize] += rest;
        let by = (n as u64 * until).div_ceil(BUILD_FULL as u64) as u32;
        ahead[it as usize] += by.saturating_sub(paid[k] as u32).min(rest);
    }
}

/// Besoins d'un constructeur de rayon `r` : reste à payer de tous les chantiers de sa file (ordres de
/// construction et d'assistance), ce que leurs environs ne contiennent pas (à emporter : manque, chantier
/// par chantier, des stocks utilisables à moins de `r` moins la portée de construction du chantier), et
/// chantier en tête de file.
fn queue_need(w: &World, s: usize, r: i32) -> ([u32; N], [u32; N], Option<Head>) {
    let mut need = [0u32; N];
    let mut deficit = [0u32; N];
    let mut head = None;
    let owner = w.units.owner[s];
    let bp = build_power(w, s);
    // stocks à portée du dernier chantier examiné (une file de tapis : des chantiers voisins)
    let mut last: Option<(i32, i32, Vec<(i64, usize)>)> = None;
    for (i, o) in w.units.cold[s].orders.iter().take(MAX_QUEUE).enumerate() {
        let mut rem = [0u32; N];
        let mut ahead = [0u32; N];
        let site = match *o {
            Order::Build { kind, x, y, dir, bid } => match w.building(bid) {
                Some(b) if !w.buildings[b].complete() => {
                    let bb = &w.buildings[b];
                    remaining(bb.kind, bb.build, &bb.paid, bp, &mut rem, &mut ahead);
                    let (cx, cy) = bb.center();
                    Some((cx, cy, crate::units::build_range(bb.kind, bb.dir)))
                }
                Some(_) => None,
                None if bid == 0 || bid == NONE => {
                    remaining(kind, 0, &[0; 4], bp, &mut rem, &mut ahead);
                    let (bw, bh) = crate::buildings::dims(kind, dir);
                    Some((x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2, crate::units::build_range(kind, dir)))
                }
                None => None,
            },
            Order::Assist { target } => match w.building(target) {
                Some(b) if !w.buildings[b].complete() && w.team_of(w.buildings[b].owner) == w.team_of(owner) => {
                    let bb = &w.buildings[b];
                    remaining(bb.kind, bb.build, &bb.paid, bp, &mut rem, &mut ahead);
                    let (cx, cy) = bb.center();
                    Some((cx, cy, crate::units::build_range(bb.kind, bb.dir)))
                }
                _ => None,
            },
            _ => None,
        };
        let Some((cx, cy, range)) = site else { continue };
        // le constructeur bâtit jusqu'à sa portée de construction du chantier : seuls comptent les stocks
        // qui resteront à son rayon de ravitaillement où qu'il se tienne
        let reuse = matches!(&last, Some((lx, ly, _)) if (lx - cx).abs() <= 4 * TILE && (ly - cy).abs() <= 4 * TILE);
        if !reuse {
            last = Some((cx, cy, stores_near(w, owner, cx, cy, (r - range - TILE).max(TILE))));
        }
        let near = last.as_ref().map(|l| &l.2[..]).unwrap_or(&[]);
        for it in 1..N {
            if rem[it] > 0 {
                need[it] += rem[it];
                let avail: u32 = near.iter().map(|&(_, b)| has(&w.buildings[b].stash, it as u8) as u32).sum();
                deficit[it] += rem[it].saturating_sub(avail);
            }
        }
        if i == 0 {
            head = Some(Head { ahead });
        }
    }
    (need, deficit, head)
}

// ---------- départs des drones ----------

/// Chargements en vol : (constructeur, objet, quantité, en route vers lui).
type Flights = Vec<(u32, u8, u16, bool)>;

fn flights(w: &World) -> Flights {
    let mut v: Flights = w
        .carriers
        .iter()
        .filter(|c| c.alive && c.kind == DRONE)
        .map(|c| {
            let it = (1..N).find(|&i| c.cargo[i] > 0).unwrap_or(0) as u8;
            // vers le constructeur : au retour, ou à l'aller d'une prise (chargement réservé au dépôt)
            (c.a, it, c.load, c.state == 3 || !c.ready)
        })
        .collect();
    v.sort_unstable();
    v
}

/// Drones en vol d'un constructeur, et ce qu'ils lui apportent.
fn home_flights(fl: &Flights, home: u32) -> (usize, [u32; N]) {
    let a = fl.partition_point(|f| f.0 < home);
    let mut incoming = [0u32; N];
    let mut n = 0;
    for f in fl[a..].iter().take_while(|f| f.0 == home) {
        n += 1;
        if f.3 {
            incoming[f.1 as usize] += f.2 as u32;
        }
    }
    (n, incoming)
}

/// Lance un drone de `home` (en (x, y)) vers le stock `b`, avec `k` objets `it` : réservés au dépôt (prise,
/// `ready` faux) ou pris dans la soute (vidage, `ready` vrai).
fn launch(w: &mut World, owner: u8, home: u32, x: i32, y: i32, b: usize, it: u8, k: u16, ready: bool) {
    let mut c = Carrier { alive: true, kind: DRONE, owner, a: home, b: w.building_ref(b), state: 1, x, y, ready, load: k, ..Carrier::default() };
    c.cargo[it as usize] = k;
    c.to = w.buildings[b].center();
    c.from = (x, y);
    c.angle = w.trig.atan2((c.to.1 - y) as i64, (c.to.0 - x) as i64);
    if let Some(slot) = w.carriers.iter().position(|c| !c.alive) {
        w.carriers[slot] = c;
    } else {
        w.carriers.push(c);
    }
}

/// Envoie les drones libres chercher `want` dans les stocks `near` (du plus proche au plus loin) ; `free` :
/// drones libres, décompté.
fn fetch(w: &mut World, owner: u8, home: u32, x: i32, y: i32, near: &[(i64, usize)], want: &mut [u32; N], free: &mut usize) {
    for it in 1..N {
        for &(_, b) in near {
            while *free > 0 && want[it] > 0 {
                let k = has(&w.buildings[b].stash, it as u8).min(DRONE_CAP).min(want[it].min(u16::MAX as u32) as u16);
                if k == 0 {
                    break;
                }
                take(&mut w.buildings[b].stash, it as u8, k);
                launch(w, owner, home, x, y, b, it as u8, k, false);
                want[it] -= k as u32;
                *free -= 1;
            }
        }
    }
}

/// Départs des drones : une fois toutes les PLAN_PERIOD ticks, constructeurs par identifiant croissant
/// (unités, puis usines).
pub fn plan(w: &mut World) {
    if w.tick % PLAN_PERIOD != 3 {
        return;
    }
    let fl = flights(w);
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || udef(w.units.kind[s]).drones == 0 {
            continue;
        }
        plan_unit(w, s, &fl);
    }
    for i in 0..w.active.len() {
        let b = w.active[i] as usize;
        let bb = &w.buildings[b];
        if !bb.alive || !bb.complete() {
            continue;
        }
        match bb.def().class {
            BClass::Factory if !bb.queue.is_empty() => plan_factory(w, b, &fl),
            BClass::Power if !crate::buildings::fuelless(bb.kind) && bb.fuel * 2 <= crate::buildings::fuel_tank(bb.kind) => plan_generator(w, b, &fl),
            _ => {}
        }
    }
}

/// Générateur à moitié vide : son drone va chercher du combustible dans les dépôts à moins de
/// NEAR_SUPPLY cases, de quoi remplir son réservoir.
fn plan_generator(w: &mut World, b: usize, fl: &Flights) {
    let home = w.building_ref(b);
    let (busy, incoming) = home_flights(fl, home);
    let mut free = (GENERATOR_DRONES as usize).saturating_sub(busy);
    if free == 0 {
        return;
    }
    let (kind, owner) = (w.buildings[b].kind, w.buildings[b].owner);
    let (x, y) = w.buildings[b].center();
    let mut room = crate::buildings::fuel_tank(kind) - w.buildings[b].fuel;
    for (it, &n) in incoming.iter().enumerate() {
        room -= n as i32 * crate::buildings::fuel_energy(kind, it as u8);
    }
    let near = stores_near(w, owner, x, y, NEAR_SUPPLY * TILE);
    let mut want = [0u32; N];
    for it in [HYDROCARBON, FUEL, ENERGY_CELL] {
        let e = crate::buildings::fuel_energy(kind, it);
        if e > 0 && room >= e && near.iter().any(|&(_, d)| has(&w.buildings[d].stash, it) > 0) {
            want[it as usize] = (room / e) as u32;
            break;
        }
    }
    fetch(w, owner, home, x, y, &near, &mut want, &mut free);
}

/// Commandant ou ingénieur : chargement avant les chantiers dont les environs n'ont pas les matériaux,
/// prises pour le chantier en cours, vidage de ce qui ne sert pas.
fn plan_unit(w: &mut World, s: usize, fl: &Flights) {
    let def = udef(w.units.kind[s]);
    let owner = w.units.owner[s];
    let home = w.unit_id(s);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let r = def.supply * TILE;
    let (busy, incoming) = home_flights(fl, home);
    let (need, deficit, head) = queue_need(w, s, r);
    let hold = w.units.cold[s].hold.clone();
    let have = |it: usize| has(&hold, it as u8) as u32 + incoming[it];
    let inside = w.units.cold[s].carried_by != NONE;
    // chantiers dont les environs n'ont pas tout : emporter d'abord ce qui manque, depuis le dépôt le plus
    // proche qui en a (à portée : on s'arrête le temps que les drones partent le chercher)
    let mut supply_at = NONE;
    if !inside && head.is_some() {
        let missing: Vec<u8> = (1..N).filter(|&it| deficit[it] > have(it)).map(|it| it as u8).collect();
        if !missing.is_empty() {
            let all = stores_near(w, owner, x, y, i32::MAX);
            if let Some(&(_, b)) = all.iter().find(|&&(_, b)| missing.iter().any(|&it| has(&w.buildings[b].stash, it) > 0)) {
                supply_at = w.building_ref(b);
            }
        }
    }
    w.units.cold[s].supply_at = supply_at;
    if inside {
        return;
    }
    let mut free = (def.drones as usize).saturating_sub(busy);
    if free == 0 {
        return;
    }
    let near = stores_near(w, owner, x, y, r);
    if near.is_empty() {
        return;
    }
    // prises : l'avance du chantier en cours, et pendant un chargement tout ce qui manque aux environs des
    // chantiers de la file
    let mut want = [0u32; N];
    for it in 1..N {
        let ahead = head.as_ref().map_or(0, |h| h.ahead[it]);
        let target = if supply_at != NONE { ahead.max(deficit[it]) } else { ahead };
        want[it] = target.saturating_sub(have(it));
    }
    fetch(w, owner, home, x, y, &near, &mut want, &mut free);
    // vidage : ce dont la file n'a pas besoin repart au dépôt le plus proche qui a de la place
    for it in 1..N {
        let mut extra = (has(&w.units.cold[s].hold, it as u8) as u32).saturating_sub(need[it]);
        for &(_, b) in &near {
            while free > 0 && extra > 0 {
                let k = store_room(&w.buildings[b], it as u8).min(DRONE_CAP).min(extra.min(u16::MAX as u32) as u16);
                if k == 0 {
                    break;
                }
                take(&mut w.units.cold[s].hold, it as u8, k);
                launch(w, owner, home, x, y, b, it as u8, k, true);
                extra -= k as u32;
                free -= 1;
            }
        }
    }
}

/// Usine d'unités : ses drones vont chercher les composants de sa file (réserve d'avance de 2 unités).
fn plan_factory(w: &mut World, b: usize, fl: &Flights) {
    let home = w.building_ref(b);
    let (busy, incoming) = home_flights(fl, home);
    let mut free = (FACTORY_DRONES as usize).saturating_sub(busy);
    if free == 0 {
        return;
    }
    let mut want = [0u32; N];
    let mut any = false;
    for (it, wt) in want.iter_mut().enumerate().skip(1) {
        *wt = (crate::buildings::factory_room(&w.buildings[b], it as u8) as u32).saturating_sub(incoming[it]);
        any |= *wt > 0;
    }
    if !any {
        return;
    }
    let owner = w.buildings[b].owner;
    let (x, y) = w.buildings[b].center();
    let near = stores_near(w, owner, x, y, FACTORY_SUPPLY * TILE);
    fetch(w, owner, home, x, y, &near, &mut want, &mut free);
}

// ---------- vol ----------

/// Position actuelle du constructeur `home` (unité ou bâtiment), s'il existe encore.
fn home_pos(w: &World, home: u32) -> Option<(i32, i32)> {
    if let Some(s) = w.unit(home) {
        return Some((w.units.x[s], w.units.y[s]));
    }
    w.building(home).map(|b| w.buildings[b].center())
}

/// Avance le drone vers (tx, ty) ; vrai s'il est arrivé.
fn fly(w: &mut World, ci: usize, tx: i32, ty: i32) -> bool {
    let (x, y) = (w.carriers[ci].x, w.carriers[ci].y);
    let d = dist(x, y, tx, ty);
    let c = &mut w.carriers[ci];
    c.to = (tx, ty);
    if d <= DRONE_SPEED {
        c.x = tx;
        c.y = ty;
        return true;
    }
    c.x = x + ((tx - x) as i64 * DRONE_SPEED as i64 / d as i64) as i32;
    c.y = y + ((ty - y) as i64 * DRONE_SPEED as i64 / d as i64) as i32;
    let a = w.trig.atan2((ty - y) as i64, (tx - x) as i64);
    w.carriers[ci].angle = a;
    false
}

/// Dépose le chargement du drone dans le stock `b` (sans plafond si `all`) ; il garde ce qui ne rentre pas.
fn unload_into(w: &mut World, ci: usize, b: usize, all: bool) {
    for it in 1..N {
        let n = w.carriers[ci].cargo[it];
        if n == 0 {
            continue;
        }
        let k = if all { n } else { n.min(store_room(&w.buildings[b], it as u8)) };
        put(&mut w.buildings[b].stash, it as u8, k);
        w.carriers[ci].cargo[it] -= k;
        w.carriers[ci].load -= k;
    }
}

/// Vol d'un drone de ravitaillement. État 1 : vers le dépôt (prise ou vidage) ; 3 : retour au constructeur.
pub fn update_drone(w: &mut World, ci: usize) {
    let home = home_pos(w, w.carriers[ci].a);
    let store = w.building(w.carriers[ci].b);
    if w.carriers[ci].state == 1 {
        let Some(b) = store else {
            // dépôt détruit : une prise réservée disparaît avec lui ; un vidage revient au constructeur
            let c = &mut w.carriers[ci];
            if !c.ready {
                c.cargo = [0; N];
                c.load = 0;
            }
            c.state = 3;
            if home.is_none() {
                c.alive = false;
            }
            return;
        };
        let (tx, ty) = w.buildings[b].center();
        if !fly(w, ci, tx, ty) {
            return;
        }
        if home.is_none() {
            // constructeur disparu : le chargement reste au dépôt
            unload_into(w, ci, b, true);
            w.carriers[ci].alive = false;
            return;
        }
        if w.carriers[ci].ready {
            unload_into(w, ci, b, false);
        }
        let c = &mut w.carriers[ci];
        c.ready = c.load > 0;
        c.state = 3;
        return;
    }
    let Some((hx, hy)) = home else {
        // constructeur disparu pendant le retour : le chargement repart à son dépôt
        let c = &mut w.carriers[ci];
        if c.load > 0 && store.is_some() {
            c.state = 1;
            c.ready = true;
        } else {
            c.alive = false;
        }
        return;
    };
    if !fly(w, ci, hx, hy) {
        return;
    }
    // arrivé : le chargement entre dans la soute ou dans la réserve de l'usine
    let cargo = w.carriers[ci].cargo;
    let home = w.carriers[ci].a;
    w.carriers[ci].alive = false;
    if let Some(s) = w.unit(home) {
        for (it, &n) in cargo.iter().enumerate() {
            put(&mut w.units.cold[s].hold, it as u8, n);
        }
    } else if let Some(f) = w.building(home) {
        // usine : réserve d'avance ; générateur : réservoir
        for (it, &n) in cargo.iter().enumerate() {
            for _ in 0..n {
                crate::buildings::insert_item(w, f, it as u8);
            }
        }
        crate::buildings::wake_watchers(w, f);
    }
}

// ---------- affichage ----------

/// Objets du chantier (ou de l'unité en tête de file d'une usine) qui manquent encore, avec la quantité
/// disponible à portée (stocks utilisables à moins de NEAR_SUPPLY cases) : [objet, manque, à portée].
pub fn site_missing(w: &World, b: usize) -> Vec<(u8, u32, u32)> {
    let bb = &w.buildings[b];
    let (x, y) = bb.center();
    let r = NEAR_SUPPLY * TILE;
    let mut out = Vec::new();
    if !bb.complete() {
        for (k, &(it, n)) in bb.def().cost.iter().enumerate() {
            let miss = (n as u32).saturating_sub(bb.paid[k] as u32);
            if miss > 0 {
                out.push((it, miss, near_amount(w, bb.owner, x, y, r, it)));
            }
        }
    } else if bb.def().class == BClass::Factory {
        if let Some(&(k, _)) = bb.queue.first() {
            for &(it, n) in udef(k).cost {
                let miss = (n as u32).saturating_sub(crate::buildings::factory_has(bb, it) as u32);
                if miss > 0 {
                    out.push((it, miss, near_amount(w, bb.owner, x, y, FACTORY_SUPPLY * TILE, it)));
                }
            }
        }
    }
    out
}

/// Ce qui est disponible à portée d'un constructeur : total par objet des stocks utilisables à moins de
/// son rayon.
pub fn in_reach(w: &World, p: u8, x: i32, y: i32, r: i32) -> [u32; N] {
    let mut v = [0u32; N];
    for (_, b) in stores_near(w, p, x, y, r) {
        for (i, &n) in w.buildings[b].stash.iter().enumerate().take(N) {
            v[i] += n as u32;
        }
    }
    v
}

// ---------- aides pour les tests ----------

#[cfg(test)]
impl World {
    /// Tests : quantité de `it` dans les dépôts et les soutes du joueur `p`.
    pub fn stock(&self, p: usize, it: u8) -> i32 {
        let mut n = 0;
        for &b in &self.stores {
            let bb = &self.buildings[b as usize];
            if bb.owner as usize == p && bb.def().class == BClass::Depot {
                n += has(&bb.stash, it) as i32;
            }
        }
        for s in 0..self.units.alive.len() {
            if self.units.alive[s] && self.units.owner[s] as usize == p {
                n += has(&self.units.cold[s].hold, it) as i32;
            }
        }
        n
    }

    /// Tests : fixe à `n` la quantité de `it` du joueur `p` : tout dans son premier dépôt (posé près de son
    /// commandant s'il n'en a pas), rien ailleurs.
    pub fn set_stock(&mut self, p: usize, it: u8, n: i32) {
        let b = self.test_depot(p);
        for i in 0..self.stores.len() {
            let d = self.stores[i] as usize;
            if self.buildings[d].owner as usize == p && self.buildings[d].stash.len() > it as usize {
                self.buildings[d].stash[it as usize] = 0;
            }
        }
        for s in 0..self.units.alive.len() {
            if self.units.owner[s] as usize == p && self.units.cold[s].hold.len() > it as usize {
                self.units.cold[s].hold[it as usize] = 0;
            }
        }
        put(&mut self.buildings[b].stash, it, n.clamp(0, u16::MAX as i32) as u16);
    }

    /// Tests : premier dépôt du joueur `p` ; posé (terminé) près de son commandant s'il n'en a pas.
    pub fn test_depot(&mut self, p: usize) -> usize {
        if let Some(&b) = self.stores.iter().find(|&&b| self.buildings[b as usize].owner as usize == p && self.buildings[b as usize].def().class == BClass::Depot) {
            return b as usize;
        }
        let (ox, oy) = match self.unit(self.players[p].commander) {
            Some(s) => (self.units.x[s] / TILE, self.units.y[s] / TILE),
            None => self.map.starts[p.min(self.map.starts.len() - 1)],
        };
        for r in 2..60 {
            for k in 0..8 * r {
                let (dx, dy) = ring(r, k);
                if let Some(b) = crate::buildings::place_building(self, p as u8, B_DEPOT, ox + dx, oy + dy, 0) {
                    crate::buildings::complete_building(self, b);
                    return b;
                }
            }
        }
        panic!("aucune place pour le dépôt de test");
    }
}
