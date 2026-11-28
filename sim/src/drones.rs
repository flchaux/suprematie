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
        BClass::Depot if crate::ameliorations::fit(bb) == crate::ameliorations::M_HOLD_BIG => 1500,
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

/// Plafond par objet de la soute d'un commandant (elle compte comme un dépôt).
pub const COMMANDER_CAP: u16 = DEPOT_CAP[0] as u16;

/// La soute de l'unité `s` est-elle un stock (commandant à soute : robot de commandement, arche) ?
#[inline]
pub fn unit_is_store(w: &World, s: usize) -> bool {
    let d = udef(w.units.kind[s]);
    d.commander && d.hold > 0
}

/// Commandant du joueur `p`, si sa soute est un stock.
pub fn commander_store(w: &World, p: u8) -> Option<usize> {
    let s = w.unit(w.players.get(p as usize)?.commander)?;
    (w.units.alive[s] && unit_is_store(w, s)).then_some(s)
}

/// Soutes de commandant du joueur `p` qui sont des stocks : celle de son commandant, puis celles de ses autres
/// Arches (Transhumants : plusieurs Arches), par case d'unité croissante.
pub fn commander_stores(w: &World, p: u8) -> Vec<usize> {
    let first = commander_store(w, p);
    let mut v: Vec<usize> = first.into_iter().collect();
    for a in &w.arks {
        if let Some(s) = w.unit(a.unit) {
            if Some(s) != first && w.units.owner[s] == p && unit_is_store(w, s) {
                v.push(s);
            }
        }
    }
    v
}

/// Un stock : dépôt ou entrepôt d'équipe (`B`, indice de bâtiment), ou soute d'un commandant (`U`, case
/// d'unité).
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Store {
    B(usize),
    U(usize),
}

impl Store {
    pub fn stash(self, w: &World) -> &[u16] {
        match self {
            Store::B(b) => &w.buildings[b].stash,
            Store::U(s) => &w.units.cold[s].hold,
        }
    }
    pub fn stash_mut(self, w: &mut World) -> &mut Vec<u16> {
        match self {
            Store::B(b) => &mut w.buildings[b].stash,
            Store::U(s) => &mut w.units.cold[s].hold,
        }
    }
    pub fn has(self, w: &World, it: u8) -> u16 {
        has(self.stash(w), it)
    }
    pub fn put(self, w: &mut World, it: u8, n: u16) {
        put(self.stash_mut(w), it, n)
    }
    pub fn take(self, w: &mut World, it: u8, n: u16) -> u16 {
        take(self.stash_mut(w), it, n)
    }
    /// Place libre pour `it` (plafond par objet).
    pub fn room(self, w: &World, it: u8) -> u16 {
        match self {
            Store::B(b) => store_room(&w.buildings[b], it),
            Store::U(s) => crate::ameliorations::store_cap(w, s).saturating_sub(has(&w.units.cold[s].hold, it)),
        }
    }
    pub fn pos(self, w: &World) -> (i32, i32) {
        match self {
            Store::B(b) => w.buildings[b].center(),
            Store::U(s) => (w.units.x[s], w.units.y[s]),
        }
    }
    /// Référence durable (celle des bâtiments ou identifiant d'unité), pour `Carrier::b`.
    pub fn id(self, w: &World) -> u32 {
        match self {
            Store::B(b) => w.building_ref(b),
            Store::U(s) => w.unit_id(s),
        }
    }
    /// Stock désigné par une référence durable, s'il existe encore.
    pub fn resolve(w: &World, id: u32) -> Option<Store> {
        if let Some(b) = w.building(id) {
            return Some(Store::B(b));
        }
        w.unit(id).filter(|&s| w.units.alive[s] && unit_is_store(w, s)).map(Store::U)
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

/// Relais logistique.
#[inline]
pub fn is_relay(bb: &Building) -> bool {
    bb.def().class == BClass::Relay
}

/// Un dépôt, un entrepôt ou un relais vient d'être terminé : il entre dans `World::stores` (ou
/// `World::relays`).
pub fn store_added(w: &mut World, b: usize) {
    let list = if is_store(&w.buildings[b]) {
        &mut w.stores
    } else if is_relay(&w.buildings[b]) {
        &mut w.relays
    } else {
        return;
    };
    if let Err(p) = list.binary_search(&(b as u32)) {
        list.insert(p, b as u32);
    }
}

/// Un bâtiment disparaît : il quitte `World::stores` (ou `World::relays`).
pub fn store_removed(w: &mut World, b: usize) {
    if let Ok(p) = w.stores.binary_search(&(b as u32)) {
        w.stores.remove(p);
    }
    if let Ok(p) = w.relays.binary_search(&(b as u32)) {
        w.relays.remove(p);
    }
}

/// Reconstruit `World::stores` et `World::relays` (après une restauration).
pub fn rebuild_stores(w: &mut World) {
    let done = |w: &World, b: usize| w.buildings[b].alive && w.buildings[b].complete();
    w.stores = (0..w.buildings.len()).filter(|&b| done(w, b) && is_store(&w.buildings[b])).map(|b| b as u32).collect();
    w.relays = (0..w.buildings.len()).filter(|&b| done(w, b) && is_relay(&w.buildings[b])).map(|b| b as u32).collect();
}

/// Stocks utilisables par `p` à moins de `r` (sous-unités) de (x, y), du plus proche au plus loin, puis
/// bâtiments par indice croissant avant la soute de son commandant : (distance², stock).
pub fn stores_near(w: &World, p: u8, x: i32, y: i32, r: i32) -> Vec<(i64, Store)> {
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
            v.push((d, Store::B(b)));
        }
    }
    for s in commander_stores(w, p) {
        let d = dist2(x, y, w.units.x[s], w.units.y[s]);
        if d <= r2 {
            v.push((d, Store::U(s)));
        }
    }
    v.sort_unstable();
    v
}

/// Quantité de `it` dans les stocks utilisables par `p` à moins de `r` (sous-unités) de (x, y).
pub fn near_amount(w: &World, p: u8, x: i32, y: i32, r: i32, it: u8) -> u32 {
    stores_near(w, p, x, y, r).iter().map(|&(_, st)| st.has(w, it) as u32).sum()
}

/// Prend au plus `n` objets `it` dans les stocks utilisables à moins de `r` de (x, y), le plus proche
/// d'abord ; renvoie ce qui a été pris.
pub fn take_near(w: &mut World, p: u8, x: i32, y: i32, r: i32, it: u8, n: u16) -> u16 {
    let mut got = 0;
    for (_, st) in stores_near(w, p, x, y, r) {
        if got >= n {
            break;
        }
        got += st.take(w, it, n - got);
    }
    got
}

/// Paiement immédiat (sans chantier) : le coût est pris dans les stocks utilisables à moins de
/// NEAR_SUPPLY cases de (x, y) et dans ceux du réseau des relais qui couvrent (x, y), le plus proche
/// d'abord. Faux, sans rien prendre, s'ils ne couvrent pas tout.
pub fn pay_near(w: &mut World, p: u8, x: i32, y: i32, cost: &[(u8, u16)]) -> bool {
    let near = supply_stores(w, p, x, y, NEAR_SUPPLY * TILE, RELAY_RANGE * TILE);
    if !cost.iter().all(|&(it, n)| near.iter().map(|&(_, st)| st.has(w, it) as u32).sum::<u32>() >= n as u32) {
        return false;
    }
    for &(it, n) in cost {
        let mut left = n;
        for &(_, st) in &near {
            left -= st.take(w, it, left);
        }
        w.players[p as usize].consumed[it as usize] += n as u32;
    }
    true
}

// ---------- relais logistiques ----------
//
// Un relais a une zone de RELAY_RANGE cases (entre centres). Deux relais du même joueur à moins de
// RELAY_LINK cases l'un de l'autre sont reliés. Le réseau d'un point : les relais dont la zone couvre ce
// point, et ceux qui leur sont reliés de proche en proche ; ses stocks : les stocks utilisables dans la zone
// d'un de ces relais (dépôts, entrepôts d'équipe, soute du commandant). Les drones des relais qui couvrent
// une destination (chantier par le constructeur qui le bâtit, usine, générateur) y portent ce qui lui
// manque depuis les stocks du réseau, en vol direct.

/// Le joueur `p` a-t-il un relais terminé ?
pub fn has_relay(w: &World, p: u8) -> bool {
    w.relays.iter().any(|&b| w.buildings[b as usize].owner == p)
}

/// Relais du joueur `p` reliés au point (x, y) : ceux à moins de `reach` (sous-unités) du point, puis, de
/// proche en proche, ceux à moins de RELAY_LINK cases d'un relais retenu. Indices de bâtiments, croissants.
pub fn net_relays(w: &World, p: u8, x: i32, y: i32, reach: i32) -> Vec<usize> {
    let mine: Vec<(usize, i32, i32)> = w
        .relays
        .iter()
        .map(|&b| b as usize)
        .filter(|&b| w.buildings[b].owner == p && w.buildings[b].alive)
        .map(|b| {
            let (cx, cy) = w.buildings[b].center();
            (b, cx, cy)
        })
        .collect();
    if mine.is_empty() || reach <= 0 {
        return Vec::new();
    }
    let r2 = reach as i64 * reach as i64;
    let l2 = (RELAY_LINK * TILE) as i64 * (RELAY_LINK * TILE) as i64;
    let mut on = vec![false; mine.len()];
    let mut stack = Vec::new();
    for (k, &(_, cx, cy)) in mine.iter().enumerate() {
        if dist2(x, y, cx, cy) <= r2 {
            on[k] = true;
            stack.push(k);
        }
    }
    while let Some(k) = stack.pop() {
        let (_, ax, ay) = mine[k];
        for (j, &(_, bx, by)) in mine.iter().enumerate() {
            if !on[j] && dist2(ax, ay, bx, by) <= l2 {
                on[j] = true;
                stack.push(j);
            }
        }
    }
    mine.iter().zip(on).filter(|e| e.1).map(|e| e.0 .0).collect()
}

/// Stocks du réseau des relais `rel` : stocks utilisables par `p` à moins de RELAY_RANGE cases d'un de ces
/// relais, (distance² à (x, y), stock), du plus proche de (x, y) au plus loin.
pub fn net_stores(w: &World, p: u8, rel: &[usize], x: i32, y: i32) -> Vec<(i64, Store)> {
    let mut v = Vec::new();
    if rel.is_empty() {
        return v;
    }
    let rr = (RELAY_RANGE * TILE) as i64 * (RELAY_RANGE * TILE) as i64;
    let covered = |sx: i32, sy: i32| {
        rel.iter().any(|&r| {
            let (cx, cy) = w.buildings[r].center();
            dist2(sx, sy, cx, cy) <= rr
        })
    };
    for &b in &w.stores {
        let b = b as usize;
        if !usable(w, p, b) {
            continue;
        }
        let (cx, cy) = w.buildings[b].center();
        if covered(cx, cy) {
            v.push((dist2(x, y, cx, cy), Store::B(b)));
        }
    }
    for s in commander_stores(w, p) {
        let (ux, uy) = (w.units.x[s], w.units.y[s]);
        if covered(ux, uy) {
            v.push((dist2(x, y, ux, uy), Store::U(s)));
        }
    }
    v.sort_unstable();
    v
}

/// Stocks qui ravitaillent le point (x, y) : ceux à moins de `r` (sous-unités), et ceux du réseau des
/// relais à moins de `relay_reach` du point ; sans doublon, du plus proche au plus loin (puis bâtiments par
/// indice croissant avant la soute du commandant).
pub fn supply_stores(w: &World, p: u8, x: i32, y: i32, r: i32, relay_reach: i32) -> Vec<(i64, Store)> {
    let mut v = stores_near(w, p, x, y, r);
    if relay_reach > 0 && has_relay(w, p) {
        let rel = net_relays(w, p, x, y, relay_reach);
        if !rel.is_empty() {
            v.extend(net_stores(w, p, &rel, x, y));
            v.sort_unstable();
            v.dedup();
        }
    }
    v
}

/// Drones de relais en vol, par relais : (référence du relais, nombre), par référence croissante.
type RelayBusy = Vec<(u32, u8)>;

fn relay_busy(w: &World) -> RelayBusy {
    let mut v: RelayBusy = Vec::new();
    if w.relays.is_empty() {
        return v;
    }
    let mut refs: Vec<u32> = w.carriers.iter().filter(|c| c.alive && c.kind == DRONE && c.relay != 0).map(|c| c.relay).collect();
    refs.sort_unstable();
    for r in refs {
        match v.last_mut() {
            Some(e) if e.0 == r => e.1 = e.1.saturating_add(1),
            _ => v.push((r, 1)),
        }
    }
    v
}

/// Aide des relais pour une destination en (x, y) : relais du réseau dont la zone la couvre et qui ont des
/// drones libres (le plus proche d'abord : distance², bâtiment, référence, drones libres), et stocks du réseau
/// (sans `skip`).
struct RelayHelp {
    seeds: Vec<(i64, usize, u32, u8)>,
    stores: Vec<(i64, Store)>,
}

fn relay_help(w: &World, p: u8, x: i32, y: i32, skip: Option<Store>, busy: &RelayBusy) -> Option<RelayHelp> {
    let reach = RELAY_RANGE * TILE;
    let rel = net_relays(w, p, x, y, reach);
    let r2 = reach as i64 * reach as i64;
    let mut seeds: Vec<(i64, usize, u32, u8)> = rel
        .iter()
        .filter_map(|&b| {
            let (cx, cy) = w.buildings[b].center();
            let d = dist2(x, y, cx, cy);
            let rf = w.building_ref(b);
            let used = busy.binary_search_by_key(&rf, |e| e.0).map_or(0, |k| busy[k].1);
            let free = RELAY_DRONES.saturating_sub(used);
            (d <= r2 && free > 0).then_some((d, b, rf, free))
        })
        .collect();
    if seeds.is_empty() {
        return None;
    }
    seeds.sort_unstable();
    let mut stores = net_stores(w, p, &rel, x, y);
    stores.retain(|&(_, st)| Some(st) != skip);
    (!stores.is_empty()).then_some(RelayHelp { seeds, stores })
}

/// Envoie les drones libres des relais de `h` chercher `n` objets `it` dans les stocks du réseau, pour la
/// destination `home` ; `n` est décompté.
fn relay_fetch_item(w: &mut World, h: &mut RelayHelp, busy: &mut RelayBusy, owner: u8, home: u32, it: u8, n: &mut u32) {
    for si in 0..h.stores.len() {
        let st = h.stores[si].1;
        while *n > 0 {
            let Some(k) = h.seeds.iter().position(|e| e.3 > 0) else { return };
            let q = st.has(w, it).min(DRONE_CAP).min((*n).min(u16::MAX as u32) as u16);
            if q == 0 {
                break;
            }
            st.take(w, it, q);
            let (_, rb, rf, _) = h.seeds[k];
            let (rx, ry) = w.buildings[rb].center();
            launch(w, owner, home, rx, ry, st, it, q, false, rf);
            h.seeds[k].3 -= 1;
            match busy.binary_search_by_key(&rf, |e| e.0) {
                Ok(j) => busy[j].1 += 1,
                Err(j) => busy.insert(j, (rf, 1)),
            }
            *n -= q as u32;
        }
    }
}

/// Stock utilisable par `p` le plus proche de (x, y), à moins de `r`, qui a de la place pour `it`.
pub fn store_with_room(w: &World, p: u8, x: i32, y: i32, r: i32, it: u8) -> Option<Store> {
    stores_near(w, p, x, y, r).into_iter().map(|(_, st)| st).find(|&st| st.room(w, it) > 0)
}

/// Remboursement, sans plafond : au dépôt du joueur (ou à la soute de son commandant) le plus proche de
/// (x, y) ; à défaut, à l'entrepôt de son équipe le plus proche ; perdu s'il n'a ni l'un ni l'autre.
pub fn refund(w: &mut World, p: u8, x: i32, y: i32, it: u8, n: u32) {
    if n == 0 || it == 0 || it as usize >= N || p as usize >= w.players.len() {
        return;
    }
    let near = stores_near(w, p, x, y, i32::MAX);
    let own = |st: &Store| match *st {
        Store::B(b) => w.buildings[b].def().class == BClass::Depot,
        Store::U(_) => true,
    };
    let pick = near.iter().find(|(_, st)| own(st)).or(near.first()).map(|&(_, st)| st);
    if let Some(st) = pick {
        st.put(w, it, n.min(u16::MAX as u32) as u16);
    }
}

/// Remboursement au plus près du bâtiment `b`.
pub fn refund_at(w: &mut World, p: u8, b: usize, it: u8, n: u32) {
    // organe de la Souche : sa sève et ses sels retournent à son réseau
    if w.buildings[b].def().race == RACE_SOUCHE {
        let net = w.buildings[b].net;
        crate::souche::refund(w, net, it, n as i32);
        return;
    }
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
/// Soute d'un commandant (un dépôt) : plafond par objet ; d'un ingénieur : plafond total.
pub fn hold_room(w: &World, s: usize, it: u8) -> u32 {
    if unit_is_store(w, s) {
        return Store::U(s).room(w, it) as u32;
    }
    (udef(w.units.kind[s]).hold as u32).saturating_sub(total(&w.units.cold[s].hold))
}

/// Événement : un constructeur n'a trouvé aucun dépôt où livrer un objet de sa soute
/// (joueur, x, y, objet ; voir l'ordre Deliver).
pub const EV_NO_DEPOT: i32 = 46;

/// Livraison au dépôt (ordre Deliver) du constructeur `s` : objet à livrer et stock visé. Pour un objet
/// donné, le stock utilisable le plus proche (à vol d'oiseau, sans limite de distance ; jamais sa propre
/// soute) qui a de la place pour lui ; pour `item` 0 (toute la soute), le plus proche qui a de la place
/// pour au moins un des objets de la soute, et le premier de ces objets. Rien si la soute n'en a pas, ou
/// si aucun stock n'a de place.
pub fn deliver_target(w: &World, s: usize, item: u8) -> Option<(u8, Store)> {
    let hold = &w.units.cold[s].hold;
    if item as usize >= N || (item != 0 && has(hold, item) == 0) {
        return None;
    }
    let near = stores_near(w, w.units.owner[s], w.units.x[s], w.units.y[s], i32::MAX);
    near.into_iter().filter(|&(_, st)| st != Store::U(s)).find_map(|(_, st)| {
        if item != 0 {
            return (st.room(w, item) > 0).then_some((item, st));
        }
        (1..N).find(|&it| has(hold, it as u8) > 0 && st.room(w, it as u8) > 0).map(|it| (it as u8, st))
    })
}

/// Les drones du constructeur `s` videront-ils sa soute ? Ingénieur (la soute du commandant est un dépôt,
/// jamais vidée) dont un objet de la soute a de la place dans un stock utilisable, à toute distance.
pub fn will_unload(w: &World, s: usize) -> bool {
    if unit_is_store(w, s) || udef(w.units.kind[s]).drones == 0 {
        return false;
    }
    deliver_target(w, s, 0).is_some()
}

/// Reste à payer d'un chantier (bâtiment `kind`, payé `paid`), ajouté à `seq` (objet, quantité).
fn remaining(kind: u16, paid: &[u16; 4], seq: &mut Vec<(u8, u32)>) {
    for (k, &(it, n)) in bdef(kind).cost.iter().enumerate() {
        let rest = (n as u32).saturating_sub(paid[k] as u32);
        if rest > 0 {
            seq.push((it, rest));
        }
    }
}

/// Besoins d'un constructeur de rayon `r`, pour toute sa file (ordres de construction et d'assistance) :
/// - `need` : reste à payer de tous ses chantiers ;
/// - `deficit` : ce que leurs environs ne contiennent pas (à emporter : manque, chantier par chantier, des
///   stocks utilisables à moins de `r` moins la portée de construction du chantier) ;
/// - `seq` : les restes à payer (objet, quantité), chantier par chantier dans l'ordre de la file.
struct Needs {
    need: [u32; N],
    deficit: [u32; N],
    seq: Vec<(u8, u32)>,
}

fn queue_need(w: &World, s: usize, r: i32) -> Needs {
    let mut nd = Needs { need: [0; N], deficit: [0; N], seq: Vec::new() };
    let owner = w.units.owner[s];
    // stocks à portée du dernier chantier examiné (une file de tapis : des chantiers voisins)
    let mut last: Option<(i32, i32, Vec<(i64, Store)>)> = None;
    for o in w.units.cold[s].orders.iter().take(MAX_QUEUE) {
        let start = nd.seq.len();
        let site = match *o {
            Order::Build { kind, x, y, dir, bid } => match w.building(bid) {
                Some(b) if !w.buildings[b].complete() => {
                    let bb = &w.buildings[b];
                    remaining(bb.kind, &bb.paid, &mut nd.seq);
                    let (cx, cy) = bb.center();
                    Some((cx, cy, crate::units::build_range(bb.kind, bb.dir)))
                }
                Some(_) => None,
                None if bid == 0 || bid == NONE => {
                    remaining(kind, &[0; 4], &mut nd.seq);
                    let (bw, bh) = crate::buildings::dims(kind, dir);
                    Some((x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2, crate::units::build_range(kind, dir)))
                }
                None => None,
            },
            Order::Assist { target } => match w.building(target) {
                Some(b) if !w.buildings[b].complete() && w.team_of(w.buildings[b].owner) == w.team_of(owner) => {
                    let bb = &w.buildings[b];
                    remaining(bb.kind, &bb.paid, &mut nd.seq);
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
            // relais : seuls ceux dont la zone couvrira le constructeur où qu'il se tienne
            let mut near = supply_stores(w, owner, cx, cy, (r - range - TILE).max(TILE), RELAY_RANGE * TILE - range - TILE);
            // la soute du commandant compte comme un dépôt, mais pas pour lui-même (elle est déjà « sur lui »)
            near.retain(|&(_, st)| st != Store::U(s));
            last = Some((cx, cy, near));
        }
        let near = last.as_ref().map(|l| &l.2[..]).unwrap_or(&[]);
        for &(it, rest) in &nd.seq[start..] {
            nd.need[it as usize] += rest;
            let avail: u32 = near.iter().map(|&(_, st)| st.has(w, it) as u32).sum();
            nd.deficit[it as usize] += rest.saturating_sub(avail);
        }
    }
    nd
}

// ---------- départs des drones ----------

/// Chargements en vol : (constructeur, objet, quantité, en route vers lui, indice du drone, drone du
/// constructeur lui-même plutôt que d'un relais).
type Flights = Vec<(u32, u8, u16, bool, usize, bool)>;

fn flights(w: &World) -> Flights {
    let mut v: Flights = w
        .carriers
        .iter()
        .enumerate()
        .filter(|(_, c)| c.alive && c.kind == DRONE && c.state != RELAY_BACK)
        .map(|(ci, c)| {
            let it = (1..N).find(|&i| c.cargo[i] > 0).unwrap_or(0) as u8;
            // vers le constructeur : au retour, ou à l'aller d'une prise (chargement réservé au dépôt)
            (c.a, it, c.load, c.state == 3 || !c.ready, ci, c.relay == 0)
        })
        .collect();
    v.sort_unstable();
    v
}

/// Drones en vol d'un constructeur (les siens), et ce que tous les drones lui apportent (relais compris).
fn home_flights(fl: &Flights, home: u32) -> (usize, [u32; N]) {
    let a = fl.partition_point(|f| f.0 < home);
    let mut incoming = [0u32; N];
    let mut n = 0;
    for f in fl[a..].iter().take_while(|f| f.0 == home) {
        n += f.5 as usize;
        if f.3 {
            incoming[f.1 as usize] += f.2 as u32;
        }
    }
    (n, incoming)
}

/// Lance un drone de `home` (ou du relais `relay`, parti de (x, y)) vers le stock `b`, avec `k` objets
/// `it` : réservés au dépôt (prise, `ready` faux) ou pris dans la soute (vidage, `ready` vrai).
#[allow(clippy::too_many_arguments)]
fn launch(w: &mut World, owner: u8, home: u32, x: i32, y: i32, st: Store, it: u8, k: u16, ready: bool, relay: u32) {
    let mut c = Carrier { alive: true, kind: DRONE, owner, a: home, b: st.id(w), state: 1, x, y, ready, load: k, relay, ..Carrier::default() };
    c.cargo[it as usize] = k;
    c.to = st.pos(w);
    c.from = (x, y);
    c.angle = w.trig.atan2((c.to.1 - y) as i64, (c.to.0 - x) as i64);
    if let Some(slot) = w.carriers.iter().position(|c| !c.alive) {
        w.carriers[slot] = c;
    } else {
        w.carriers.push(c);
    }
}

/// Envoie les drones libres chercher `n` objets `it` dans les stocks `near` (du plus proche au plus
/// loin) ; `n` et `free` (drones libres) sont décomptés.
#[allow(clippy::too_many_arguments)]
fn fetch_item(w: &mut World, owner: u8, home: u32, x: i32, y: i32, near: &[(i64, Store)], it: u8, n: &mut u32, free: &mut usize) {
    for &(_, st) in near {
        while *free > 0 && *n > 0 {
            let k = st.has(w, it).min(DRONE_CAP).min((*n).min(u16::MAX as u32) as u16);
            if k == 0 {
                break;
            }
            st.take(w, it, k);
            launch(w, owner, home, x, y, st, it, k, false, 0);
            *n -= k as u32;
            *free -= 1;
        }
    }
}

/// Envoie les drones libres chercher `want` dans les stocks `near` ; `free` : drones libres, décompté.
fn fetch(w: &mut World, owner: u8, home: u32, x: i32, y: i32, near: &[(i64, Store)], want: &mut [u32; N], free: &mut usize) {
    for (it, n) in want.iter_mut().enumerate().skip(1) {
        fetch_item(w, owner, home, x, y, near, it as u8, n, free);
    }
}

/// Départs des drones : une fois toutes les PLAN_PERIOD ticks, constructeurs par identifiant croissant
/// (unités, puis usines).
pub fn plan(w: &mut World) {
    if w.tick % PLAN_PERIOD != 3 {
        return;
    }
    let fl = flights(w);
    let mut rb = relay_busy(w);
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || udef(w.units.kind[s]).drones == 0 {
            continue;
        }
        plan_unit(w, s, &fl, &mut rb);
    }
    for i in 0..w.active.len() {
        let b = w.active[i] as usize;
        let bb = &w.buildings[b];
        if !bb.alive || !bb.complete() {
            continue;
        }
        // les Transhumants n'ont pas de drones : tout passe par contact (réseau de transfert) ou par les chariots
        if bb.def().race == RACE_TRANSH {
            continue;
        }
        match bb.def().class {
            BClass::Factory if !bb.queue.is_empty() && !crate::buildings::paused(bb) => plan_factory(w, b, &fl, &mut rb),
            BClass::Power if !crate::buildings::fuelless(bb.kind) && bb.fuel * 2 <= crate::buildings::tank_of(bb) => plan_generator(w, b, &fl, &mut rb),
            _ => {}
        }
    }
}

/// Générateur à moitié vide : son drone va chercher du combustible dans les dépôts à moins de
/// NEAR_SUPPLY cases, de quoi remplir son réservoir ; les relais qui le couvrent apportent le reste.
fn plan_generator(w: &mut World, b: usize, fl: &Flights, rb: &mut RelayBusy) {
    let home = w.building_ref(b);
    let (busy, incoming) = home_flights(fl, home);
    let mut free = (GENERATOR_DRONES as usize).saturating_sub(busy);
    let relays = has_relay(w, w.buildings[b].owner);
    if free == 0 && !relays {
        return;
    }
    let (kind, owner) = (w.buildings[b].kind, w.buildings[b].owner);
    let (x, y) = w.buildings[b].center();
    let mut room = crate::buildings::tank_of(&w.buildings[b]) - w.buildings[b].fuel;
    for (it, &n) in incoming.iter().enumerate() {
        room -= n as i32 * crate::buildings::fuel_energy(kind, it as u8);
    }
    let near = stores_near(w, owner, x, y, NEAR_SUPPLY * TILE);
    let all = if relays { supply_stores(w, owner, x, y, NEAR_SUPPLY * TILE, RELAY_RANGE * TILE) } else { Vec::new() };
    let mut want = [0u32; N];
    for it in [HYDROCARBON, FUEL, ENERGY_CELL] {
        let e = crate::buildings::fuel_energy(kind, it);
        if e > 0 && room >= e && near.iter().chain(all.iter()).any(|&(_, st)| st.has(w, it) > 0) {
            want[it as usize] = (room / e) as u32;
            break;
        }
    }
    fetch(w, owner, home, x, y, &near, &mut want, &mut free);
    if relays {
        relay_fetch(w, owner, home, x, y, None, rb, &mut want);
    }
}

/// Les drones des relais qui couvrent (x, y) vont chercher `want` dans les stocks du réseau (sans `skip`)
/// pour la destination `home` ; `want` est décompté.
#[allow(clippy::too_many_arguments)]
fn relay_fetch(w: &mut World, owner: u8, home: u32, x: i32, y: i32, skip: Option<Store>, rb: &mut RelayBusy, want: &mut [u32; N]) {
    if want.iter().all(|&n| n == 0) {
        return;
    }
    let Some(mut h) = relay_help(w, owner, x, y, skip, rb) else { return };
    for (it, n) in want.iter_mut().enumerate().skip(1) {
        if *n > 0 {
            relay_fetch_item(w, &mut h, rb, owner, home, it as u8, n);
        }
    }
}

/// Commandant ou ingénieur : chargement avant les chantiers dont les environs n'ont pas les matériaux,
/// prises pour tous les chantiers de la file, rapatriement de ce qui ne sert plus.
fn plan_unit(w: &mut World, s: usize, fl: &Flights, rb: &mut RelayBusy) {
    let def = udef(w.units.kind[s]);
    let owner = w.units.owner[s];
    let home = w.unit_id(s);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    let r = def.supply * TILE;
    let Needs { need, deficit, seq } = queue_need(w, s, r);
    // la soute d'un commandant est un dépôt : il n'y puise pas avec ses drones et ne la vide pas
    let me = Store::U(s);
    let is_store = unit_is_store(w, s);
    // prises en route vers leur dépôt dont la file n'a plus besoin (ordre annulé) : le chargement réservé
    // reste au dépôt, le drone revient à vide
    let a = fl.partition_point(|f| f.0 < home);
    let mine = &fl[a..fl[a..].iter().position(|f| f.0 != home).map_or(fl.len(), |k| a + k)];
    // ses propres drones (ceux des relais qui le ravitaillent ne comptent pas)
    let busy = mine.iter().filter(|f| f.5).count();
    let mut incoming = [0u32; N];
    for f in mine.iter().filter(|f| f.3) {
        incoming[f.1 as usize] += f.2 as u32;
    }
    for &(_, it, _, _, ci, _) in mine.iter().rev() {
        let it = it as usize;
        let c = &w.carriers[ci];
        let surplus = (has(&w.units.cold[s].hold, it as u8) as u32 + incoming[it]).saturating_sub(need[it]);
        if c.state != 1 || c.ready || surplus == 0 {
            continue;
        }
        let k = (c.load as u32).min(surplus) as u16;
        if let Some(st) = Store::resolve(w, c.b) {
            st.put(w, it as u8, k);
        }
        let c = &mut w.carriers[ci];
        c.cargo[it] -= k;
        c.load -= k;
        incoming[it] -= k as u32;
        if c.load == 0 {
            c.state = 3;
            c.ready = false;
        }
    }
    let have = |w: &World, it: usize| has(&w.units.cold[s].hold, it as u8) as u32 + incoming[it];
    let inside = w.units.cold[s].carried_by != NONE;
    // chantiers dont les environs n'ont pas tout : emporter d'abord ce qui manque, depuis le dépôt le plus
    // proche qui en a (à portée : on s'arrête le temps que les drones partent le chercher)
    let mut supply_at = NONE;
    if !inside && !seq.is_empty() {
        let missing: Vec<u8> = (1..N).filter(|&it| deficit[it] > have(w, it)).map(|it| it as u8).collect();
        if !missing.is_empty() {
            let all = stores_near(w, owner, x, y, i32::MAX);
            if let Some(&(_, st)) = all.iter().find(|&&(_, st)| st != me && missing.iter().any(|&it| st.has(w, it) > 0)) {
                supply_at = st.id(w);
            }
        }
    }
    w.units.cold[s].supply_at = supply_at;
    if inside {
        return;
    }
    // un drone qui revient à vide d'une prise annulée reste occupé jusqu'à son retour
    let mut free = (def.drones as usize).saturating_sub(busy);
    // relais : leurs drones apportent ce que les siens ne peuvent pas prendre (stocks hors de son rayon,
    // ou drones tous partis) ; aide calculée au premier besoin
    let relays = has_relay(w, owner) && !seq.is_empty();
    if free == 0 && !relays {
        return;
    }
    // prises : pendant un chargement d'abord ce qui manque aux environs des chantiers, puis tout le reste à
    // payer de la file, chantier par chantier dans l'ordre de la file
    let mut near = stores_near(w, owner, x, y, r);
    near.retain(|&(_, st)| st != me);
    if !near.is_empty() || relays {
        let mut got = [0u32; N];
        for (it, g) in got.iter_mut().enumerate() {
            *g = have(w, it);
        }
        let mut help: Option<Option<RelayHelp>> = None;
        let mut go = |w: &mut World, it: usize, target: u32, free: &mut usize| {
            if target > got[it] {
                let mut n = target - got[it];
                let before = n;
                fetch_item(w, owner, home, x, y, &near, it as u8, &mut n, free);
                if n > 0 && relays {
                    let h = help.get_or_insert_with(|| relay_help(w, owner, x, y, Some(me), rb));
                    if let Some(h) = h {
                        relay_fetch_item(w, h, rb, owner, home, it as u8, &mut n);
                    }
                }
                got[it] += before - n;
            }
        };
        if supply_at != NONE {
            for (it, &d) in deficit.iter().enumerate().skip(1) {
                go(w, it, d, &mut free);
            }
        }
        let mut cum = [0u32; N];
        for &(it, n) in &seq {
            if free == 0 && !relays {
                break;
            }
            cum[it as usize] += n;
            go(w, it as usize, cum[it as usize], &mut free);
        }
    }
    // rapatriement : ce dont la file n'a pas besoin (ordre annulé, récolte, recyclage...) repart au dépôt
    // utilisable le plus proche qui a de la place, à toute distance
    let extra: Vec<(usize, u32)> = (1..N).map(|it| (it, (has(&w.units.cold[s].hold, it as u8) as u32).saturating_sub(need[it]))).filter(|e| e.1 > 0).collect();
    if is_store || free == 0 || extra.is_empty() {
        return;
    }
    let back = stores_near(w, owner, x, y, i32::MAX);
    for (it, mut extra) in extra {
        for &(_, st) in &back {
            while free > 0 && extra > 0 {
                let k = st.room(w, it as u8).min(DRONE_CAP).min(extra.min(u16::MAX as u32) as u16);
                if k == 0 {
                    break;
                }
                take(&mut w.units.cold[s].hold, it as u8, k);
                launch(w, owner, home, x, y, st, it as u8, k, true, 0);
                extra -= k as u32;
                free -= 1;
            }
        }
    }
}

/// Usine d'unités : ses drones vont chercher les composants de sa file (réserve d'avance de 2 unités), dans les
/// stocks à FACTORY_SUPPLY cases (pas chez les Transhumants : voir `plan`) ;
/// les relais qui la couvrent apportent ce qui manque encore.
fn plan_factory(w: &mut World, b: usize, fl: &Flights, rb: &mut RelayBusy) {
    let home = w.building_ref(b);
    let (busy, incoming) = home_flights(fl, home);
    let mut free = (FACTORY_DRONES as usize).saturating_sub(busy);
    let relays = has_relay(w, w.buildings[b].owner);
    if free == 0 && !relays {
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
    if relays {
        relay_fetch(w, owner, home, x, y, None, rb, &mut want);
    }
}

// ---------- vol ----------

/// Position actuelle du constructeur `home` (unité ou bâtiment), s'il existe encore.
fn home_pos(w: &World, home: u32) -> Option<(i32, i32)> {
    if let Some(s) = w.unit(home) {
        return Some((w.units.x[s], w.units.y[s]));
    }
    w.building(home).map(|b| w.buildings[b].center())
}

/// Avance le drone vers (tx, ty) ; vrai s'il est arrivé. Les drones des relais vont plus vite.
fn fly(w: &mut World, ci: usize, tx: i32, ty: i32) -> bool {
    let (x, y) = (w.carriers[ci].x, w.carriers[ci].y);
    let d = dist(x, y, tx, ty);
    let c = &mut w.carriers[ci];
    let speed = if c.relay != 0 { RELAY_DRONE_SPEED } else { DRONE_SPEED };
    c.to = (tx, ty);
    if d <= speed {
        c.x = tx;
        c.y = ty;
        return true;
    }
    c.x = x + ((tx - x) as i64 * speed as i64 / d as i64) as i32;
    c.y = y + ((ty - y) as i64 * speed as i64 / d as i64) as i32;
    let a = w.trig.atan2((ty - y) as i64, (tx - x) as i64);
    w.carriers[ci].angle = a;
    false
}

/// Dépose le chargement du drone dans le stock `b` (sans plafond si `all`) ; il garde ce qui ne rentre pas.
fn unload_into(w: &mut World, ci: usize, st: Store, all: bool) {
    for it in 1..N {
        let n = w.carriers[ci].cargo[it];
        if n == 0 {
            continue;
        }
        let k = if all { n } else { n.min(st.room(w, it as u8)) };
        st.put(w, it as u8, k);
        w.carriers[ci].cargo[it] -= k;
        w.carriers[ci].load -= k;
    }
}

/// État d'un drone de relais qui a livré : retour à son relais, où il se range.
pub const RELAY_BACK: u8 = 5;

/// Vol d'un drone de ravitaillement. État 1 : vers le dépôt (prise ou vidage) ; 3 : vers le constructeur
/// (retour, ou livraison d'un drone de relais) ; RELAY_BACK : drone de relais qui rentre à son relais.
pub fn update_drone(w: &mut World, ci: usize) {
    if w.carriers[ci].state == RELAY_BACK {
        match w.building(w.carriers[ci].relay) {
            Some(r) => {
                let (rx, ry) = w.buildings[r].center();
                if fly(w, ci, rx, ry) {
                    w.carriers[ci].alive = false;
                }
            }
            None => w.carriers[ci].alive = false,
        }
        return;
    }
    let home = home_pos(w, w.carriers[ci].a);
    let store = Store::resolve(w, w.carriers[ci].b);
    if w.carriers[ci].state == 1 {
        let Some(st) = store else {
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
        let (tx, ty) = st.pos(w);
        if !fly(w, ci, tx, ty) {
            return;
        }
        if home.is_none() {
            // constructeur disparu : le chargement reste au dépôt
            unload_into(w, ci, st, true);
            w.carriers[ci].alive = false;
            return;
        }
        if w.carriers[ci].ready {
            unload_into(w, ci, st, false);
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
    // arrivé : le chargement entre dans la soute ou dans la réserve de l'usine ; un drone de relais rentre
    // ensuite à son relais
    let cargo = w.carriers[ci].cargo;
    let home = w.carriers[ci].a;
    let c = &mut w.carriers[ci];
    c.cargo = [0; N];
    c.load = 0;
    c.ready = false;
    if c.relay != 0 {
        c.state = RELAY_BACK;
    } else {
        c.alive = false;
    }
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
/// disponible à portée (stocks utilisables à moins de NEAR_SUPPLY cases, et ceux du réseau des relais qui
/// le couvrent) : [objet, manque, à portée].
pub fn site_missing(w: &World, b: usize) -> Vec<(u8, u32, u32)> {
    let bb = &w.buildings[b];
    let (x, y) = bb.center();
    let r = NEAR_SUPPLY * TILE;
    let mut out = Vec::new();
    if !bb.complete() {
        let far = crate::souche::far_of(bb);
        for (k, &(it, n)) in bb.def().cost.iter().enumerate() {
            let miss = (crate::souche::far_cost(n, far) as u32).saturating_sub(bb.paid[k] as u32);
            if miss > 0 {
                out.push((it, miss, reach_amount(w, bb.owner, x, y, r, it)));
            }
        }
    } else if bb.def().class == BClass::Factory {
        // (couveuse : ses œufs paient, il ne lui manque rien)
        if let Some(&(k, _)) = bb.queue.first().filter(|q| udef(q.0).litter == 0) {
            for &(it, n) in udef(k).cost {
                let miss = (n as u32 * batch(k) as u32).saturating_sub(crate::buildings::factory_has(bb, it) as u32);
                if miss > 0 {
                    out.push((it, miss, reach_amount(w, bb.owner, x, y, FACTORY_SUPPLY * TILE, it)));
                }
            }
        }
    }
    out
}

/// Quantité de `it` à portée de (x, y) : stocks à moins de `r` et réseau des relais qui couvrent le point.
pub fn reach_amount(w: &World, p: u8, x: i32, y: i32, r: i32, it: u8) -> u32 {
    supply_stores(w, p, x, y, r, RELAY_RANGE * TILE).iter().map(|&(_, st)| st.has(w, it) as u32).sum()
}

/// Ce qui est disponible à portée d'un point (d'un constructeur, d'un chantier, d'une usine) : total par
/// objet des stocks utilisables à moins de `r` et de ceux du réseau des relais qui couvrent le point (sans
/// compter `skip`, la propre soute d'un commandant).
pub fn in_reach(w: &World, p: u8, x: i32, y: i32, r: i32, skip: Option<Store>) -> [u32; N] {
    let mut v = [0u32; N];
    for (_, st) in supply_stores(w, p, x, y, r, RELAY_RANGE * TILE) {
        if Some(st) == skip {
            continue;
        }
        for (i, &n) in st.stash(w).iter().enumerate().take(N) {
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
