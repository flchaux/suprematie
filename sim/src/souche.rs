//! La Souche : base vivante (voir docs/spec/races.md).
//!
//! - Réseau de racines : les racines et les organes qui ont une zone (graine-mère) sont des « poteaux »
//!   du calcul des zones électriques (`buildings::rebuild_power`). Deux poteaux de la Souche sont reliés
//!   quand leurs zones (le terreau) se touchent. Chaque réseau garde sa réserve de sève et de sels
//!   (`Net::seve`, `Net::sels`, plafond `Net::store`) ; quand un réseau se coupe, sa réserve est partagée
//!   entre les morceaux au prorata de leurs bâtiments (`split_pools`).
//! - Terreau : la zone d'un poteau. Les organes ne se posent que sur le terreau de leur joueur (sauf la
//!   graine-mère), et les organismes s'y régénèrent.
//! - Croissance : un organe posé par un semeur pousse seul en tirant la sève et les sels de son réseau
//!   (`grow`), une fois et demie plus lentement qu'un chantier d'ingénieur de puissance 10.
//! - Production : graine-mère, frondaisons (qui se font de l'ombre) et racines-puits sur les gisements
//!   remplissent leur réseau (`tick_organ`). Les couveuses prennent le coût des unités dans leur réseau.
//! - Recherche : la Matrice consomme de l'ADN (palier de la recherche par unité de recherche). L'ADN vient
//!   de la digestion des cadavres tombés sur le terreau (`digest`) et, à défaut, de la sève (20 pour 1).

use crate::buildings::{self, supply_of};
use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;

/// Réserve d'un réseau sans organe de stockage, et ce qu'ajoutent la graine-mère et le bulbe.
pub const STORE_BASE: i32 = 300;
pub const STORE_HEART: i32 = 600;
pub const STORE_BULB: i32 = 1000;
/// Graines-mères au plus par joueur (vivantes ou en croissance).
pub const MAX_HEARTS: usize = 3;
/// Réserve de départ du premier réseau.
pub const START_SEVE: i32 = 400;
pub const START_SELS: i32 = 150;
/// Période des organes (production, régénération), en ticks.
pub const ORGAN_PERIOD: u32 = 20;
/// Période de la croissance d'un organe, en ticks.
pub const GROW_PERIOD: u32 = 10;
/// Sève pour un ADN quand la Matrice n'en a pas, et période de cette conversion (ticks).
pub const ADN_SEVE: i32 = 20;
pub const ADN_PERIOD: u32 = 40;

#[inline]
pub fn is_souche(w: &World, p: u8) -> bool {
    w.players.get(p as usize).is_some_and(|pl| pl.race == RACE_SOUCHE)
}

#[inline]
fn has(w: &World, p: u8, t: u8) -> bool {
    w.players.get(p as usize).is_some_and(|pl| pl.has_tech(t))
}

/// Réserve qu'apporte un organe terminé à son réseau.
pub fn store_of(kind: u16) -> i32 {
    match kind {
        B_SEED_HEART => STORE_HEART,
        B_BULB => STORE_BULB,
        _ => 0,
    }
}

/// Départ : la Reine (déjà posée), une graine-mère toute poussée et un semeur.
pub fn place_start(w: &mut World, p: usize) {
    let (sx, sy) = w.map.starts[p];
    for &(dx, dy) in &[crate::map::MAIN_GEN_SPOT, (-5, -1), (-1, 3), (-1, -5), (3, 3), (-5, -5), (3, -5), (-5, 3)] {
        if let Some(b) = buildings::place_building(w, p as u8, B_SEED_HEART, sx + dx, sy + dy, 0) {
            buildings::complete_building(w, b);
            break;
        }
    }
    let (x, y) = crate::races::start_spot(w, p, 3, 0, crate::units::pass_mask(Layer::Land));
    w.spawn_unit(U_SOWER, p as u8, x, y);
}

/// Après le premier calcul des réseaux : la réserve de départ dans le réseau de la graine-mère.
pub fn endow_start(w: &mut World) {
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if bb.alive && bb.kind == B_SEED_HEART && is_souche(w, bb.owner) && bb.net != 0 {
            let n = &mut w.nets[bb.net as usize];
            if n.seve == 0 && n.sels == 0 {
                n.seve = START_SEVE.min(n.store);
                n.sels = START_SELS.min(n.store);
            }
        }
    }
}

/// Deux poteaux de la Souche sont reliés quand leurs zones (terreau) se touchent.
pub fn zones_touch(a: &Building, b: &Building) -> bool {
    let (aw, ah) = a.size();
    let (bw, bh) = b.size();
    let (sa, sb) = (supply_of(a), supply_of(b));
    a.x - sa <= b.x + bw + sb && b.x - sb <= a.x + aw + sa && a.y - sa <= b.y + bh + sb && b.y - sb <= a.y + ah + sa
}

/// Réseau de la Souche (du joueur `owner`) dont le terreau couvre la case (tx, ty), ou 0.
pub fn net_at(w: &World, owner: u8, tx: i32, ty: i32) -> u16 {
    let r = (crate::buildings::max_supply() + 4) * TILE;
    let mut best = usize::MAX;
    w.grid.query_buildings(tx * TILE + TILE / 2, ty * TILE + TILE / 2, r, |p| {
        if p >= best {
            return;
        }
        let pb = &w.buildings[p];
        if !pb.alive || pb.owner != owner || !pb.complete() || pb.def().race != RACE_SOUCHE || pb.def().supply == 0 || pb.net == 0 {
            return;
        }
        let (pw, ph) = pb.size();
        let sp = supply_of(pb);
        if tx >= pb.x - sp && tx < pb.x + pw + sp && ty >= pb.y - sp && ty < pb.y + ph + sp {
            best = p;
        }
    });
    if best == usize::MAX {
        0
    } else {
        w.buildings[best].net
    }
}

/// Un poteau de la Souche (racine ou graine-mère) du joueur couvre-t-il une case de l'emprise ? Un
/// poteau encore en croissance compte : une file de racines se plante d'un coup, chacune sur le terreau
/// à venir de la précédente, et pousse quand celle-ci a poussé (son réseau la nourrit alors).
pub fn on_terreau(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    let r = (crate::buildings::max_supply() + bw.max(bh) + 2) * TILE;
    let mut ok = false;
    w.grid.query_buildings(x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2, r, |p| {
        if ok {
            return;
        }
        let pb = &w.buildings[p];
        if !pb.alive || pb.owner != owner || pb.def().race != RACE_SOUCHE || pb.def().supply == 0 {
            return;
        }
        let (pw, ph) = pb.size();
        let sp = supply_of(pb);
        if x < pb.x + pw + sp && x + bw > pb.x - sp && y < pb.y + ph + sp && y + bh > pb.y - sp {
            ok = true;
        }
    });
    ok
}

/// Règles de pose propres à la Souche : terreau (sauf graine-mère), nombre de graines-mères.
pub fn can_place(w: &World, owner: u8, kind: u16, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    if kind == B_SEED_HEART {
        let n = w.buildings.iter().filter(|b| b.alive && b.owner == owner && b.kind == B_SEED_HEART).count();
        return n < MAX_HEARTS;
    }
    // les racines (petites) se posent sur le terreau comme le reste : le réseau grandit de proche en proche
    on_terreau(w, owner, x, y, bw, bh)
}

/// Réserves des réseaux avant un nouveau calcul : (sève, sels) par ancien réseau, et le nombre de
/// bâtiments de la Souche encore vivants de chaque ancien réseau.
pub struct OldPools {
    pub net_of: Vec<u16>,
    pub pools: Vec<(i32, i32)>,
    pub count: Vec<u32>,
}

/// Relève les réserves avant `rebuild_power` (rien s'il n'y a pas de joueur de la Souche).
pub fn old_pools(w: &World) -> Option<OldPools> {
    if !w.players.iter().any(|p| p.race == RACE_SOUCHE) {
        return None;
    }
    let pools: Vec<(i32, i32)> = w.nets.iter().map(|n| (n.seve, n.sels)).collect();
    let mut count = vec![0u32; w.nets.len()];
    let mut net_of = vec![0u16; w.buildings.len()];
    for (i, b) in w.buildings.iter().enumerate() {
        if b.alive && b.def().race == RACE_SOUCHE && (b.net as usize) < count.len() && b.net != 0 {
            net_of[i] = b.net;
            count[b.net as usize] += 1;
        }
    }
    Some(OldPools { net_of, pools, count })
}

/// Après `rebuild_power` : chaque bâtiment de la Souche apporte à son nouveau réseau sa part de la
/// réserve de l'ancien (le reste de la division va au premier bâtiment de l'ancien réseau) ; plafonds
/// des nouveaux réseaux d'après leurs organes de stockage.
pub fn split_pools(w: &mut World, old: OldPools) {
    for n in w.nets.iter_mut() {
        n.store = 0;
    }
    let mut first_seen = vec![false; old.pools.len()];
    for b in 0..w.buildings.len().min(old.net_of.len()) {
        let o = old.net_of[b] as usize;
        let bb = &w.buildings[b];
        if !bb.alive || bb.def().race != RACE_SOUCHE {
            continue;
        }
        let k = bb.net as usize;
        if k != 0 && k < w.nets.len() && bb.complete() {
            let st = store_of(bb.kind);
            w.nets[k].store += st;
        }
        if o == 0 || o >= old.pools.len() || old.count[o] == 0 {
            continue;
        }
        let c = old.count[o] as i32;
        let (sv, sl) = old.pools[o];
        let (mut gs, mut gl) = (sv / c, sl / c);
        if !first_seen[o] {
            first_seen[o] = true;
            gs += sv % c;
            gl += sl % c;
        }
        if k != 0 && k < w.nets.len() {
            w.nets[k].seve += gs;
            w.nets[k].sels += gl;
        }
    }
    // bâtiments de la Souche posés depuis (sans ancien réseau) : leur réserve aussi
    for b in old.net_of.len()..w.buildings.len() {
        let bb = &w.buildings[b];
        let k = bb.net as usize;
        if bb.alive && bb.complete() && bb.def().race == RACE_SOUCHE && k != 0 && k < w.nets.len() {
            let st = store_of(bb.kind);
            w.nets[k].store += st;
        }
    }
    for k in 1..w.nets.len() {
        let souche = is_souche(w, w.nets[k].owner);
        let n = &mut w.nets[k];
        if souche {
            n.store += STORE_BASE;
            n.seve = n.seve.min(n.store);
            n.sels = n.sels.min(n.store);
        }
    }
}

/// Réseaux de la Souche d'un joueur : réserve totale (sève, sels) et plafond total.
pub fn totals(w: &World, p: u8) -> (i32, i32, i32) {
    let mut t = (0, 0, 0);
    for n in w.nets.iter().skip(1) {
        if n.owner == p && !n.unlimited {
            t.0 += n.seve;
            t.1 += n.sels;
            t.2 += n.store;
        }
    }
    t
}

/// Ajoute de la sève ou des sels à un réseau, dans la limite de son plafond.
fn add_pool(w: &mut World, net: u16, seve: i32, sels: i32) {
    if let Some(n) = w.nets.get_mut(net as usize) {
        if net != 0 {
            n.seve = (n.seve + seve).min(n.store.max(n.seve));
            n.sels = (n.sels + sels).min(n.store.max(n.sels));
        }
    }
}

/// Prend `n` d'un objet (sève ou sels) dans un réseau ; faux s'il n'y en a pas assez.
fn take_pool(w: &mut World, net: u16, item: u8, n: i32) -> bool {
    if net == 0 {
        return n <= 0;
    }
    let Some(nn) = w.nets.get_mut(net as usize) else { return false };
    let slot = match item {
        SEVE => &mut nn.seve,
        SELS => &mut nn.sels,
        _ => return n <= 0,
    };
    if *slot < n {
        return false;
    }
    *slot -= n;
    true
}

fn pool_of(w: &World, net: u16, item: u8) -> i32 {
    match (w.nets.get(net as usize), item) {
        (Some(n), SEVE) if net != 0 => n.seve,
        (Some(n), SELS) if net != 0 => n.sels,
        _ => 0,
    }
}

/// Croissance d'un organe en chantier (appelée par `update_buildings`, toutes les GROW_PERIOD ticks) : il
/// tire le coût de son réseau au fur et à mesure ; sans réserve, il attend.
pub fn grow(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + GROW_PERIOD;
    let (kind, owner) = (w.buildings[b].kind, w.buildings[b].owner);
    let def = bdef(kind);
    let mut speed = 2; // tiers : croissance 1,5 fois plus lente qu'un chantier de puissance 10
    if has(w, owner, T_S_FERTILITY) {
        speed = 3;
    }
    let work = def.build.max(1) as u64 * 20 * 3;
    let delta = ((GROW_PERIOD as u64 * speed * BUILD_FULL as u64 * w.players[owner as usize].build_mult.max(1) as u64 / 100) / work).max(1) as u32;
    let bb = &w.buildings[b];
    let p2 = (bb.build + delta).min(BUILD_FULL);
    let net = bb.net;
    let mut need = [0i32; 4];
    for (k, &(it, n)) in def.cost.iter().enumerate() {
        let total = (n as u64 * p2 as u64).div_ceil(BUILD_FULL as u64) as i32;
        need[k] = total - bb.paid[k] as i32;
        if pool_of(w, net, it) < need[k] {
            w.buildings[b].stalled = true;
            return;
        }
    }
    for (k, &(it, _)) in def.cost.iter().enumerate() {
        take_pool(w, net, it, need[k]);
        w.players[owner as usize].consumed[it as usize] += need[k] as u32;
        w.buildings[b].paid[k] += need[k] as u16;
    }
    let bb = &mut w.buildings[b];
    bb.stalled = false;
    bb.build = p2;
    bb.hp = (bb.hp + (def.hp as i64 * delta as i64 / BUILD_FULL as i64) as i32).min(def.hp);
    if p2 >= BUILD_FULL {
        buildings::complete_building(w, b);
    }
}

/// Nombre de frondaisons du même joueur à moins de 4 cases (ombre).
fn shade(w: &World, b: usize) -> i32 {
    let bb = &w.buildings[b];
    let (cx, cy) = bb.center();
    let owner = bb.owner;
    let mut n = 0;
    w.grid.query_buildings(cx, cy, 6 * TILE, |o| {
        if o == b {
            return;
        }
        let ob = &w.buildings[o];
        if ob.alive && ob.owner == owner && ob.kind == B_LEAVES && ob.complete() {
            let (ox, oy) = ob.center();
            if crate::fixed::dist2(cx, cy, ox, oy) <= (4 * TILE + TILE) as i64 * (4 * TILE + TILE) as i64 {
                n += 1;
            }
        }
    });
    n
}

/// Production par seconde d'un organe (sève, sels), en centièmes.
pub fn organ_rate(w: &World, b: usize) -> (i32, i32) {
    let bb = &w.buildings[b];
    let big = if has(w, bb.owner, T_S_BIG_LEAVES) { 150 } else { 100 };
    match bb.kind {
        B_SEED_HEART => (100, 0),
        B_LEAVES => {
            let f = (100 - 25 * shade(w, b)).max(25);
            (f * big / 100, 0)
        }
        B_TAPROOT => {
            let pur = crate::buildings::purity_of(bb) as i32;
            let (s, l) = match bb.recipe {
                HYDROCARBON => (300, 0),
                IRON_ORE | COPPER_ORE | SILICON => (0, 100),
                CRYSTAL => (0, 200),
                _ => (0, 0),
            };
            (s * pur / 100 * big / 100, l * pur / 100 * big / 100)
        }
        _ => (0, 0),
    }
}

/// Organe terminé (toutes les ORGAN_PERIOD ticks) : production dans son réseau, régénération.
pub fn tick_organ(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + ORGAN_PERIOD;
    let (s, l) = organ_rate(w, b);
    if s > 0 || l > 0 {
        // centièmes par seconde : le reste est gardé dans `progress`
        let bb = &mut w.buildings[b];
        bb.progress += (s as u32) | ((l as u32) << 16);
        let (ps, pl) = (bb.progress & 0xffff, bb.progress >> 16);
        let (gs, gl) = (ps / 100, pl / 100);
        bb.progress = (ps % 100) | ((pl % 100) << 16);
        bb.working = bb.net != 0;
        let (net, owner) = (bb.net, bb.owner as usize);
        if net != 0 {
            add_pool(w, net, gs as i32, gl as i32);
            w.players[owner].produced[SEVE as usize] += gs;
            w.players[owner].produced[SELS as usize] += gl;
        }
    }
    regen_building(w, b);
}

/// Racine terminée : elle se régénère seulement (toutes les 2 s).
pub fn tick_root(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + 2 * ORGAN_PERIOD;
    regen_building(w, b);
}

fn regen_building(w: &mut World, b: usize) {
    let bb = &mut w.buildings[b];
    let max = bb.def().hp;
    if bb.hp < max && bb.net != 0 {
        bb.hp = (bb.hp + (max / 50).max(1)).min(max);
    }
}

/// Couveuse : prend dans son réseau le coût de la portée en tête de file (voir ponte.rs), d'un coup,
/// quand le réseau a tout ce qui manque.
pub fn feed_factory(w: &mut World, b: usize) {
    let Some(&(kind, _)) = w.buildings[b].queue.first() else { return };
    let net = w.buildings[b].net;
    let cost = udef(kind).cost;
    let litter = batch(kind) as i32;
    let missing: Vec<(u8, i32)> = cost.iter().map(|&(it, n)| (it, n as i32 * litter - buildings::factory_has(&w.buildings[b], it) as i32)).filter(|m| m.1 > 0).collect();
    if missing.is_empty() || !missing.iter().all(|&(it, n)| pool_of(w, net, it) >= n) {
        return;
    }
    for (it, n) in missing {
        take_pool(w, net, it, n);
        buildings::factory_put(&mut w.buildings[b], it, n as u16);
    }
}

/// Rend de la sève ou des sels à un réseau (contenu d'une couveuse dont la file change).
pub fn refund(w: &mut World, net: u16, item: u8, n: i32) {
    match item {
        SEVE => add_pool(w, net, n, 0),
        SELS => add_pool(w, net, 0, n),
        _ => {}
    }
}

/// Recherche de la Souche dans une Matrice : une unité de recherche coûte `palier` ADN. Renvoie vrai si
/// la Matrice peut lancer l'unité (ADN payé) ; sinon elle digère de la sève en ADN et attend.
pub fn lab_start(w: &mut World, b: usize, t: u8) -> bool {
    let owner = w.buildings[b].owner as usize;
    let need = TECHS[t as usize].tier.max(1) as i32;
    if w.players[owner].purse[ADN as usize] >= need {
        w.players[owner].purse[ADN as usize] -= need;
        w.players[owner].consumed[ADN as usize] += need as u32;
        return true;
    }
    let net = w.buildings[b].net;
    if take_pool(w, net, SEVE, ADN_SEVE) {
        w.players[owner].purse[ADN as usize] += 1;
        w.players[owner].produced[ADN as usize] += 1;
        w.players[owner].consumed[SEVE as usize] += ADN_SEVE as u32;
    }
    w.buildings[b].wake = w.tick + ADN_PERIOD;
    false
}

/// Digestion : un cadavre (unité de palier `tier`, ou bâtiment) tombé sur le terreau d'un joueur de la
/// Souche nourrit son réseau ; un ennemi (ou une bête de la faune) lui donne aussi de l'ADN.
pub fn digest(w: &mut World, x: i32, y: i32, victim_owner: u8, tier: u8) {
    if !w.players.iter().any(|p| p.race == RACE_SOUCHE) {
        return;
    }
    let (tx, ty) = (x / TILE, y / TILE);
    for p in 0..w.players.len() {
        if w.players[p].race != RACE_SOUCHE || !w.players[p].alive {
            continue;
        }
        let net = net_at(w, p as u8, tx, ty);
        if net == 0 {
            continue;
        }
        let k = tier as i32 + 1;
        add_pool(w, net, 10 * k, 3 * k);
        if w.team_of(victim_owner) != w.team_of(p as u8) {
            w.players[p].purse[ADN as usize] += k;
            w.players[p].produced[ADN as usize] += k as u32;
        }
        return;
    }
}

/// Organismes de la Souche : régénération sur le terreau (toutes les ORGAN_PERIOD ticks).
pub fn update_units(w: &mut World) {
    if !w.tick.is_multiple_of(ORGAN_PERIOD) || !w.players.iter().any(|p| p.race == RACE_SOUCHE) {
        return;
    }
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.cold[s].carried_by != NONE {
            continue;
        }
        let owner = w.units.owner[s];
        if !udef(w.units.kind[s]).bio || !is_souche(w, owner) {
            continue;
        }
        let max = w.max_hp(s);
        if w.units.hp[s] >= max || w.units.hp[s] <= 0 {
            continue;
        }
        let quick = has(w, owner, T_S_QUICK_SAP);
        let (x, y) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
        let pct = if net_at(w, owner, x, y) != 0 {
            if quick {
                4
            } else {
                2
            }
        } else if quick {
            1
        } else {
            0
        };
        if pct > 0 {
            w.units.hp[s] = (w.units.hp[s] + (max * pct / 100).max(1)).min(max);
        }
    }
}

/// Points de vie (‰) des organismes selon les mutations.
pub fn hp_mult(w: &World, owner: u8, kind: u16) -> i32 {
    if udef(kind).bio && has(w, owner, T_S_SCALES) {
        1300
    } else {
        1000
    }
}

/// Dégâts (%) des organismes selon les mutations.
pub fn dmg_mult(w: &World, owner: u8, kind: u16) -> i32 {
    if udef(kind).bio && has(w, owner, T_S_ACID) {
        125
    } else {
        100
    }
}

/// Dégâts subis par un bâtiment de la Souche (racines profondes : 40 % de moins).
pub fn building_damage(w: &World, b: usize, dmg: i32) -> i32 {
    let bb = &w.buildings[b];
    if bb.def().race == RACE_SOUCHE && has(w, bb.owner, T_S_DEEP_ROOTS) {
        dmg * 60 / 100
    } else {
        dmg
    }
}

/// Vitesse de ponte des couveuses (%).
pub fn brood_speed(w: &World, owner: u8) -> u32 {
    if has(w, owner, T_S_FERTILITY) {
        150
    } else {
        100
    }
}

/// Fiche d'un bâtiment de la Souche : réserve de son réseau (JSON, champs ajoutés à la fiche).
pub fn info(w: &World, b: usize) -> String {
    let bb = &w.buildings[b];
    let n = w.nets.get(bb.net as usize).filter(|_| bb.net != 0);
    let (s, l, st) = n.map_or((0, 0, 0), |n| (n.seve, n.sels, n.store));
    let (rs, rl) = if bb.complete() { organ_rate(w, b) } else { (0, 0) };
    format!(",\"souche\":{{\"net\":{},\"seve\":{},\"sels\":{},\"store\":{},\"rateSeve\":{},\"rateSels\":{}}}", bb.net, s, l, st, rs, rl)
}
