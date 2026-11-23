//! La Souche : base vivante (voir docs/spec/races.md).
//!
//! - Réseau de racines : les racines et les organes qui ont une zone (graine-mère) sont des « poteaux »
//!   du calcul des zones électriques (`buildings::rebuild_power`). Deux poteaux de la Souche sont reliés
//!   quand leurs emprises se touchent par un côté (`linked`). Chaque réseau garde sa réserve de sève et de sels
//!   (`Net::seve`, `Net::sels`, plafond `Net::store`) ; quand un réseau se coupe, sa réserve est partagée
//!   entre les morceaux au prorata de leurs bâtiments (`split_pools`).
//! - Terreau : la zone d'un poteau. Les organes ne se posent que sur le terreau de leur joueur (sauf la
//!   graine-mère), et les organismes s'y régénèrent.
//! - Graine-mère : elle ne pousse que des organismes qui s'y sacrifient (`sacrifice`, 10 000 sève).
//! - Croissance : les autres organes posés par un semeur poussent seuls en tirant la sève et les sels de son réseau
//!   (`grow`), une fois et demie plus lentement qu'un chantier d'ingénieur de puissance 10.
//! - Production : graine-mère, frondaisons, racines-puits sur les gisements et racines (l'herbe qu'elles mangent,
//!   voir soil.rs) remplissent leur réseau (`tick_organ`, `tick_root`). Les œufs y puisent leur prix (ponte.rs).
//! - Organes qui agissent : panse (digère les épaves), terrier (passage souterrain d'un bout à l'autre du
//!   réseau), sporange (chaque tir coûte de la sève), ronce (mur vivant), cocon (il en sort un Béhémoth),
//!   racines étrangleuses. Organismes, flaques d'acide, Reine enracinée : essaim.rs.
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
/// Plus grande zone (cases) d'un poteau de la Souche (rayon de recherche ; test : souche_supply_is_bounded).
pub const MAX_SUPPLY: i32 = 7;
/// Période des organes (production, régénération), en ticks.
pub const ORGAN_PERIOD: u32 = 20;
/// Racines et rhizomes : supplément de coût (%) par case qui les sépare de la graine-mère la plus proche.
pub const FAR_PCT: i32 = 2;
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

/// Deux poteaux de la Souche (racines, graines-mères) sont reliés quand leurs emprises se touchent par
/// un côté (pas seulement par un coin) : une file de racines est un câble continu, qu'une racine
/// coupée sépare en deux.
pub fn linked(a: &Building, b: &Building) -> bool {
    let (aw, ah) = a.size();
    let (bw, bh) = b.size();
    let over_x = a.x < b.x + bw && b.x < a.x + aw;
    let over_y = a.y < b.y + bh && b.y < a.y + ah;
    let touch_x = a.x + aw == b.x || b.x + bw == a.x;
    let touch_y = a.y + ah == b.y || b.y + bh == a.y;
    (over_x && touch_y) || (over_y && touch_x)
}

/// Réseau de la Souche (du joueur `owner`) dont le terreau couvre la case (tx, ty), ou 0.
pub fn net_at(w: &World, owner: u8, tx: i32, ty: i32) -> u16 {
    let r = (MAX_SUPPLY + 4) * TILE;
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
        // herbe mangée, hors des zones : le réseau du poteau le plus proche
        crate::soil::net_at(w, owner, tx, ty)
    } else {
        w.buildings[best].net
    }
}

/// Un poteau de la Souche (racine ou graine-mère) du joueur couvre-t-il une case de l'emprise ? Un
/// poteau encore en croissance compte : une file de racines se plante d'un coup, chacune sur le terreau
/// à venir de la précédente, et pousse quand celle-ci a poussé (son réseau la nourrit alors).
pub fn on_terreau(w: &World, owner: u8, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    let r = (MAX_SUPPLY + bw.max(bh) + 4) * TILE;
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
    // herbe mangée, à portée d'un poteau
    ok || crate::soil::can_place(w, owner, x, y, bw, bh)
}

/// Règles de pose propres à la Souche : terreau (sauf graine-mère), nombre de graines-mères.
pub fn can_place(w: &World, owner: u8, kind: u16, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    if kind == B_SEED_HEART {
        let n = w.buildings.iter().filter(|b| b.alive && b.owner == owner && b.kind == B_SEED_HEART).count();
        return n < MAX_HEARTS;
    }
    // une racine (ou un rhizome) se pose collée par un côté à une racine, un rhizome ou une graine-mère du
    // joueur (même en croissance) : le câble part toujours d'une graine-mère, jamais de réseau isolé
    if bdef(kind).supply > 0 {
        return touches_network(w, owner, kind, x, y, bw, bh);
    }
    on_terreau(w, owner, x, y, bw, bh)
}

/// L'emprise (x, y, bw, bh) d'un poteau `kind` touche par un côté un poteau de la Souche du joueur.
pub fn touches_network(w: &World, owner: u8, kind: u16, x: i32, y: i32, bw: i32, bh: i32) -> bool {
    let probe = Building { x, y, kind, ..Building::default() };
    let r = (bw.max(bh) + 4) * TILE;
    let mut ok = false;
    w.grid.query_buildings(x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2, r, |p| {
        if ok {
            return;
        }
        let pb = &w.buildings[p];
        if pb.alive && pb.owner == owner && pb.def().race == RACE_SOUCHE && pb.def().supply > 0 && linked(&probe, pb) {
            ok = true;
        }
    });
    ok
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

/// Verse de la sève et des sels dans un réseau, comptés dans la production du joueur.
pub fn feed(w: &mut World, owner: u8, net: u16, seve: i32, sels: i32) {
    if net == 0 {
        return;
    }
    add_pool(w, net, seve, sels);
    let p = &mut w.players[owner as usize];
    p.produced[SEVE as usize] += seve as u32;
    p.produced[SELS as usize] += sels as u32;
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

/// Prend plusieurs objets d'un coup dans un réseau, comptés dans la consommation du joueur ; faux (et rien de pris)
/// s'il en manque un. Réseau illimité (démos) : toujours vrai.
pub fn take_all(w: &mut World, owner: u8, net: u16, dues: &[(u8, i32)]) -> bool {
    let free = w.nets.get(net as usize).is_some_and(|n| n.unlimited);
    if !free && !dues.iter().all(|&(it, n)| n <= 0 || pool_of(w, net, it) >= n) {
        return false;
    }
    for &(it, n) in dues {
        if n > 0 {
            take_pool(w, net, it, n);
            w.players[owner as usize].consumed[it as usize] += n as u32;
        }
    }
    true
}

/// Graine-mère en croissance du joueur sous le point (x, y) (sous-unités), comme cible de sacrifice.
pub fn heart_under(w: &World, owner: u8, x: i32, y: i32) -> Option<u32> {
    let (tx, ty) = (x / TILE, y / TILE);
    if !w.map.inside(tx, ty) {
        return None;
    }
    let o = w.map.occ[w.map.idx(tx, ty)];
    let b = (o as usize).checked_sub(1)?;
    hungry_heart(w, b, owner).then(|| w.building_ref(b))
}

fn pool_of(w: &World, net: u16, item: u8) -> i32 {
    match (w.nets.get(net as usize), item) {
        (Some(n), SEVE) if net != 0 => n.seve,
        (Some(n), SELS) if net != 0 => n.sels,
        _ => 0,
    }
}

/// Racine ou rhizome : son coût monte avec la distance (voir `far_pct`).
#[inline]
pub fn is_far_priced(kind: u16) -> bool {
    let d = bdef(kind);
    d.race == RACE_SOUCHE && d.supply > 0 && kind != B_SEED_HEART
}

/// Emprises (x, y, largeur, hauteur) des graines-mères poussées du joueur ; à défaut, de celles qui poussent.
pub fn hearts(w: &World, owner: u8) -> Vec<(i32, i32, i32, i32)> {
    let of = |done: bool| -> Vec<(i32, i32, i32, i32)> {
        w.buildings
            .iter()
            .filter(|b| b.alive && b.owner == owner && b.kind == B_SEED_HEART && b.complete() == done)
            .map(|b| {
                let (bw, bh) = b.size();
                (b.x, b.y, bw, bh)
            })
            .collect()
    };
    let grown = of(true);
    if grown.is_empty() {
        of(false)
    } else {
        grown
    }
}

/// Cases de l'emprise (x, y, bw, bh) à la plus proche des graines-mères `hearts`, comptées comme un câble
/// (à l'horizontale puis à la verticale ; 1 : collée). 0 sans graine-mère.
pub fn heart_dist(hearts: &[(i32, i32, i32, i32)], x: i32, y: i32, bw: i32, bh: i32) -> i32 {
    hearts
        .iter()
        .map(|&(hx, hy, hw, hh)| {
            let gap = |a: i32, al: i32, b: i32, bl: i32| (b - (a + al - 1)).max(a - (b + bl - 1)).max(0);
            gap(x, bw, hx, hw) + gap(y, bh, hy, hh)
        })
        .min()
        .unwrap_or(0)
}

/// Supplément de coût (%) d'un bâtiment `kind` posé là : FAR_PCT par case de distance pour une racine ou un
/// rhizome, 0 pour le reste. Fixé à la pose (`Building::lot`).
pub fn far_pct(hearts: &[(i32, i32, i32, i32)], kind: u16, x: i32, y: i32, dir: u8) -> u16 {
    if !is_far_priced(kind) {
        return 0;
    }
    let (bw, bh) = buildings::dims(kind, dir);
    (heart_dist(hearts, x, y, bw, bh) * FAR_PCT).clamp(0, 1000) as u16
}

/// Quantité `n` d'un objet du coût, avec le supplément `pct` (%), au plus proche.
#[inline]
pub fn far_cost(n: u16, pct: u16) -> u16 {
    ((n as u32 * (100 + pct as u32) + 50) / 100) as u16
}

/// Supplément de coût (%) fixé à la pose d'un bâtiment (0 : aucun).
#[inline]
pub fn far_of(bb: &Building) -> u16 {
    if is_far_priced(bb.kind) {
        bb.lot
    } else {
        0
    }
}

/// Coût d'une file posée d'un coup (aperçu) : [supplément le plus fort (%), cases d'herbe qu'elle mangera et sève
/// qu'elle en tirera (racines, voir soil::line_yield), puis objet, total, pour chaque objet du coût].
pub fn line_cost(w: &World, owner: u8, kind: u16, cells: &[(i32, i32, u8)]) -> Vec<i32> {
    let hearts = hearts(w, owner);
    let pcts: Vec<u16> = cells.iter().map(|&(x, y, d)| far_pct(&hearts, kind, x, y, d)).collect();
    let (grass, seve) = if kind == B_ROOT { crate::soil::line_yield(w, owner, cells) } else { (0, 0) };
    let mut out = vec![pcts.iter().copied().max().unwrap_or(0) as i32, grass, seve];
    for &(it, n) in bdef(kind).cost {
        out.push(it as i32);
        out.push(pcts.iter().map(|&p| far_cost(n, p) as i32).sum());
    }
    out
}

/// Croissance d'un organe en chantier (appelée par `update_buildings`, toutes les GROW_PERIOD ticks) : il
/// tire le coût de son réseau au fur et à mesure ; sans réserve, il attend.
pub fn grow(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + GROW_PERIOD;
    let (kind, owner) = (w.buildings[b].kind, w.buildings[b].owner);
    // une graine-mère ne pousse que des organismes qui s'y sacrifient
    if kind == B_SEED_HEART {
        return;
    }
    let def = bdef(kind);
    let mut speed = 2; // tiers : croissance 1,5 fois plus lente qu'un chantier de puissance 10
    if has(w, owner, T_S_FERTILITY) {
        speed = 3;
    }
    // Reine enracinée : les organes de son réseau poussent plus vite
    let royal = if w.buildings[b].net != 0 && crate::essaim::royal_net(w, owner) == w.buildings[b].net { crate::essaim::Q_GROW as u64 } else { 100 };
    let work = def.build.max(1) as u64 * 20 * 3;
    let delta = ((GROW_PERIOD as u64 * speed * BUILD_FULL as u64 * w.players[owner as usize].build_mult.max(1) as u64 / 100 * royal / 100) / work).max(1) as u32;
    let bb = &w.buildings[b];
    let p2 = (bb.build + delta).min(BUILD_FULL);
    let net = bb.net;
    let far = far_of(bb);
    let mut need = [0i32; 4];
    for (k, &(it, n)) in def.cost.iter().enumerate() {
        let total = (far_cost(n, far) as u64 * p2 as u64).div_ceil(BUILD_FULL as u64) as i32;
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
    bb.hp = (bb.hp + crate::buildings::site_hp_gain(def.hp, bb.build, p2)).min(def.hp);
    bb.build = p2;
    if p2 >= BUILD_FULL {
        buildings::complete_building(w, b);
    }
}

/// Production par seconde d'un organe (sève, sels), en centièmes. Celle d'une frondaison, d'une racine-puits ou d'une
/// racine vient de l'herbe qu'elle mange (distance, concurrence, épuisement ; voir soil.rs).
pub fn organ_rate(w: &World, b: usize) -> (i32, i32) {
    let (s, l) = full_rate(w, b);
    let bb = &w.buildings[b];
    if !crate::soil::eats(bb.kind) {
        return (s, l);
    }
    // rendement tenu par soil::graze
    let k = bb.timer as i32;
    ((s * k + 500) / 1000, (l * k + 500) / 1000)
}

/// Production nominale d'un organe.
pub fn full_rate(w: &World, b: usize) -> (i32, i32) {
    let bb = &w.buildings[b];
    rate_of(w, bb.owner, bb.kind, bb.recipe, if bb.kind == B_TAPROOT { crate::buildings::purity_of(bb) as i32 } else { 100 })
}

/// Production nominale d'un organe que le joueur poserait là.
pub fn full_rate_at(w: &World, owner: u8, kind: u16, x: i32, y: i32) -> (i32, i32) {
    let (mut item, mut pur) = (0, 100);
    if kind == B_TAPROOT {
        let (bw, bh) = buildings::dims(kind, 0);
        item = crate::map::deposit_under(&w.map, x, y, bw, bh);
        pur = w.map.purity_under(x, y, bw, bh) as i32;
    }
    rate_of(w, owner, kind, item, pur)
}

/// Production nominale d'un type d'organe du joueur ; racine-puits : son gisement et sa pureté (%).
fn rate_of(w: &World, owner: u8, kind: u16, item: u8, pur: i32) -> (i32, i32) {
    let big = if has(w, owner, T_S_BIG_LEAVES) { 150 } else { 100 };
    match kind {
        B_SEED_HEART => (100, 0),
        B_LEAVES => (big, 0),
        // une case toutes les ROOT_NOMINAL ticks
        B_ROOT => (crate::soil::ROOT_SEVE * 100 * 20 / crate::soil::ROOT_NOMINAL as i32, 0),
        B_TAPROOT => {
            let (s, l) = match item {
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
    let kind = w.buildings[b].kind;
    match kind {
        // (leur production vient de l'herbe qu'elles mangent, elle y est comptée)
        B_LEAVES | B_TAPROOT => {
            crate::soil::graze(w, b, ORGAN_PERIOD);
            regen_building(w, b);
            return;
        }
        B_MAW => tick_maw(w, b),
        B_COCOON if tick_cocoon(w, b) => return,
        _ => {}
    }
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

/// Racine, rhizome ou ronce poussés (toutes les 2 s) : régénération ; les racines mangent l'herbe toute proche
/// (soil::graze) et étranglent ce qu'elles touchent (mutation Racines étrangleuses).
pub fn tick_root(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + 2 * ORGAN_PERIOD;
    regen_building(w, b);
    if w.buildings[b].kind == B_ROOT {
        crate::soil::graze(w, b, 2 * ORGAN_PERIOD);
    }
    if w.buildings[b].def().class == BClass::Pylon && has(w, w.buildings[b].owner, T_S_STRANGLE) {
        strangle(w, b);
    }
}

/// Régénération des organes qui ont leur propre tick (couveuse, matrice, épine, floraison, terrier…),
/// toutes les ORGAN_PERIOD ticks ; les organes simples et les racines se régénèrent dans leur tick.
pub fn regen_organs(w: &mut World) {
    if !w.tick.is_multiple_of(ORGAN_PERIOD) || !w.players.iter().any(|p| p.race == RACE_SOUCHE) {
        return;
    }
    for i in 0..w.active.len() {
        let b = w.active[i] as usize;
        let bb = &w.buildings[b];
        if bb.alive && bb.complete() && bb.def().race == RACE_SOUCHE && !matches!(bb.def().class, BClass::Organ | BClass::Pylon | BClass::Wall) {
            regen_building(w, b);
        }
    }
}

/// Racines étrangleuses : dégâts d'un passage (% des points de vie du bâtiment étranglé, au moins
/// STRANGLE_MIN) et sève prise par bâtiment étranglé.
pub const STRANGLE_PCT: i32 = 1;
pub const STRANGLE_MIN: i32 = 12;
pub const STRANGLE_SEVE: i32 = 2;

/// Une racine étrangle les bâtiments ennemis collés à ses côtés.
fn strangle(w: &mut World, b: usize) {
    let (x, y, owner, net) = (w.buildings[b].x, w.buildings[b].y, w.buildings[b].owner, w.buildings[b].net);
    if net == 0 {
        return;
    }
    let team = w.team_of(owner);
    let (bw, bh) = w.buildings[b].size();
    let mut prey: Vec<usize> = Vec::new();
    let mut look = |tx: i32, ty: i32| {
        if !w.map.inside(tx, ty) {
            return;
        }
        let o = w.map.occ[w.map.idx(tx, ty)];
        if o != 0 {
            let t = (o - 1) as usize;
            let tb = &w.buildings[t];
            if tb.alive && w.team_of(tb.owner) != team && tb.kind != B_RUIN {
                prey.push(t);
            }
        }
    };
    for k in 0..bw {
        look(x + k, y - 1);
        look(x + k, y + bh);
    }
    for k in 0..bh {
        look(x - 1, y + k);
        look(x + bw, y + k);
    }
    prey.sort_unstable();
    prey.dedup();
    for t in prey {
        let dmg = (w.buildings[t].def().hp * STRANGLE_PCT / 100).max(STRANGLE_MIN);
        let (cx, cy) = w.buildings[t].center();
        w.hit_weapon = W_GNAW;
        crate::combat::damage_building(w, t, dmg, owner);
        w.hit_weapon = 255;
        w.ev(EV_FIRE, W_GNAW as i32, cx, cy, owner as i32);
        feed(w, owner, net, STRANGLE_SEVE, 0);
    }
}

/// Morsure du rongeur : arme comptée pour une racine qui étrangle.
const W_GNAW: u8 = 63;

// ---------- Graine-mère : sacrifices ----------

/// Sève à sacrifier pour qu'une graine-mère ait poussé.
pub const HEART_SEVE: u32 = 10_000;
/// Événement : un organisme se sacrifie dans une graine-mère [x, y, type, joueur].
pub const EV_SACRIFICE: i32 = 60;

/// Graine-mère du joueur, encore en croissance.
pub fn hungry_heart(w: &World, b: usize, p: u8) -> bool {
    let bb = &w.buildings[b];
    bb.alive && bb.owner == p && bb.kind == B_SEED_HEART && !bb.complete()
}

/// Sève que rapporte un organisme sacrifié : son prix en sève (0 : il ne se sacrifie pas).
pub fn sacrifice_value(kind: u16) -> u32 {
    let d = udef(kind);
    if d.race != RACE_SOUCHE || !d.bio || d.commander || crate::ponte::is_egg(kind) {
        return 0;
    }
    d.cost.iter().find(|c| c.0 == SEVE).map_or(0, |c| c.1 as u32)
}

/// Sève déjà reçue par une graine-mère en croissance.
pub fn heart_fed(bb: &Building) -> u32 {
    // une graine-mère plantée avant cette règle garde son avancement
    bb.charge.max((bb.build as u64 * HEART_SEVE as u64 / BUILD_FULL as u64) as u32)
}

/// L'organisme `s` se dissout dans la graine-mère `b`, qui pousse de son prix en sève.
pub fn sacrifice(w: &mut World, s: usize, b: usize) {
    let kind = w.units.kind[s];
    let owner = w.units.owner[s];
    let value = sacrifice_value(kind);
    let (x, y) = (w.units.x[s], w.units.y[s]);
    crate::units::clear_orders(w, s);
    w.units.alive[s] = false;
    w.units.free.push(s as u32);
    let pl = &mut w.players[owner as usize];
    pl.unit_count = pl.unit_count.saturating_sub(1);
    w.ev(EV_SACRIFICE, x, y, kind as i32, owner as i32);
    let bb = &mut w.buildings[b];
    let fed = (heart_fed(bb) + value).min(HEART_SEVE);
    bb.charge = fed;
    let p2 = (fed as u64 * BUILD_FULL as u64 / HEART_SEVE as u64) as u32;
    bb.hp = (bb.hp + crate::buildings::site_hp_gain(bb.def().hp, bb.build, p2)).min(bb.def().hp);
    bb.build = p2;
    if fed >= HEART_SEVE {
        bb.charge = 0;
        buildings::complete_building(w, b);
    }
}

// ---------- Panse ----------

/// Panse : portée (cases), matière d'épave digérée par passage (une fois par seconde).
pub const MAW_RANGE: i32 = 12;
pub const MAW_BITE: i32 = 12;

/// Panse : ses vrilles digèrent l'épave la plus proche. Une unité de matière donne 2 sève, l'acier donne
/// aussi 1 sel pour 2 ; l'épave finie laisse un ADN.
fn tick_maw(w: &mut World, b: usize) {
    let (cx, cy) = w.buildings[b].center();
    let (owner, net) = (w.buildings[b].owner, w.buildings[b].net);
    let r2 = ((MAW_RANGE * TILE) as i64).pow(2);
    let mut best: Option<(i64, usize)> = None;
    if net != 0 {
        for (k, wk) in w.wrecks.iter().enumerate() {
            let d = crate::fixed::dist2(cx, cy, wk.x, wk.y);
            if wk.alive && d <= r2 && best.is_none_or(|(bd, _)| d < bd) {
                best = Some((d, k));
            }
        }
    }
    w.buildings[b].working = best.is_some();
    let Some((_, k)) = best else { return };
    let wk = &mut w.wrecks[k];
    let steel = wk.steel.min(MAW_BITE);
    let iron = wk.iron.min(MAW_BITE - steel);
    wk.steel -= steel;
    wk.iron -= iron;
    let (x, y, done) = (wk.x, wk.y, wk.steel + wk.iron <= 0);
    if done {
        wk.alive = false;
        w.wfree.push(k as u32);
        w.players[owner as usize].purse[ADN as usize] += 1;
        w.players[owner as usize].produced[ADN as usize] += 1;
    }
    feed(w, owner, net, 2 * (steel + iron), steel / 2);
    let (bx, by) = (w.buildings[b].x, w.buildings[b].y);
    w.ev(crate::essaim::EV_DIGEST, x, y, bx | by << 16, owner as i32);
}

// ---------- Cocon ----------

/// Cocon poussé : maturation avant de s'ouvrir, en ticks (20 s).
pub const COCOON_TICKS: u32 = 400;

/// Cocon : il mûrit (`charge`), puis s'ouvre : le Béhémoth prend sa place. Vrai quand il s'est ouvert.
fn tick_cocoon(w: &mut World, b: usize) -> bool {
    let owner = w.buildings[b].owner;
    let bb = &mut w.buildings[b];
    bb.working = true;
    bb.charge = (bb.charge + ORGAN_PERIOD).min(COCOON_TICKS);
    // mûr, il attend une place sous la limite d'unités
    if bb.charge < COCOON_TICKS || w.players[owner as usize].unit_count >= UNIT_CAP {
        return false;
    }
    let (cx, cy) = w.buildings[b].center();
    let facing = (w.buildings[b].dir as u16 & 3).wrapping_mul(16384);
    buildings::remove_building(w, b, false);
    let id = w.spawn_unit(U_BEHEMOTH, owner, cx, cy);
    w.units.facing[slot_of(id)] = facing;
    w.ev(crate::essaim::EV_COCOON, cx, cy, U_BEHEMOTH as i32, owner as i32 | (facing as i32) << 8);
    true
}

// ---------- Terrier ----------

/// Rayon (1/256 de case) des plus gros organismes qui passent par un terrier.
pub const BURROW_MAX_RADIUS: i32 = 300;

/// Terrier : ouvert quand sa sortie est un autre terrier poussé du même joueur, sur le même réseau.
pub fn tick_burrow(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + 5;
    let bb = &w.buildings[b];
    let open = bb.net != 0 && w.building(bb.link).is_some_and(|t| t != b && w.buildings[t].kind == B_BURROW && w.buildings[t].owner == bb.owner && w.buildings[t].complete() && w.buildings[t].net == bb.net);
    let bb = &mut w.buildings[b];
    bb.working = open;
    bb.charge = if open { 100 } else { 0 };
}

/// Choix de la sortie d'un terrier (ordre O_SPECIAL) ; la sortie y revient si elle n'en a pas encore.
pub fn link_burrow(w: &mut World, b: usize, t: usize) {
    if b == t || w.buildings[t].kind != B_BURROW || w.buildings[t].owner != w.buildings[b].owner {
        return;
    }
    w.buildings[b].link = w.building_ref(t);
    w.buildings[b].wake = 0;
    if w.building(w.buildings[t].link).is_none_or(|x| w.buildings[x].kind != B_BURROW) {
        w.buildings[t].link = w.building_ref(b);
        w.buildings[t].wake = 0;
    }
}

/// L'unité passe-t-elle par un terrier (organisme ou bête apprivoisée, au sol, pas trop gros) ?
pub fn burrow_fits(kind: u16) -> bool {
    let d = udef(kind);
    (d.bio || is_beast(kind)) && matches!(d.layer, Layer::Land | Layer::Hover) && d.radius <= BURROW_MAX_RADIUS
}

// ---------- Sporange ----------

/// Sève d'un tir de sporange.
pub const SHOT_SEVE: i32 = 15;

/// Tir d'une tourelle de la Souche : le sporange paie sa sève (faux : le réseau n'en a pas assez).
pub fn pay_shot(w: &mut World, b: usize) -> bool {
    if w.buildings[b].kind != B_SPORANGIUM {
        return true;
    }
    let (net, owner) = (w.buildings[b].net, w.buildings[b].owner as usize);
    if net == 0 || !take_pool(w, net, SEVE, SHOT_SEVE) {
        return w.nets.get(net as usize).is_some_and(|n| n.unlimited);
    }
    w.players[owner].consumed[SEVE as usize] += SHOT_SEVE as u32;
    true
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

// ---------- Apprivoisement de la faune ----------

/// Nids greffés au plus : un, plus un par mutation acquise (stade d'évolution).
pub fn den_limit(w: &World, p: u8) -> usize {
    let Some(pl) = w.players.get(p as usize) else { return 0 };
    1 + MUTATIONS.iter().filter(|&&t| pl.has_tech(t)).count()
}

/// Le joueur peut-il greffer un nid de plus ?
pub fn den_room(w: &World, p: u8) -> bool {
    is_souche(w, p) && crate::nature::dens_of(w, p) < den_limit(w, p)
}

/// Ordre « Apprivoiser » : un joueur de la Souche, un nid de mordeurs sauvage (pas une ruche).
pub fn tameable(w: &World, p: u8, target: u32) -> bool {
    is_souche(w, p) && crate::nature::wild_nest(w, target).is_some()
}

/// Reine qui apprivoise un nid : elle s'en approche à moins de TAME_R − 1 cases et s'y tient (l'avancement
/// est compté par le nid, voir nature::taming) ; l'ordre tombe quand le nid n'est plus sauvage.
pub fn tame_step(w: &mut World, s: usize, target: u32) {
    let Some(b) = w.building(target).filter(|_| crate::nature::wild_nest(w, target).is_some()) else {
        crate::units::pop_order(w, s);
        return;
    };
    let (cx, cy) = w.buildings[b].center();
    let stop = (crate::nature::TAME_R - 1) * TILE;
    if crate::fixed::dist2(w.units.x[s], w.units.y[s], cx, cy) > (stop as i64).pow(2) {
        crate::units::steer(w, s, cx, cy, cx, cy, stop - TILE);
    } else {
        crate::units::clear_goal(w, s);
    }
}

/// Bête de la faune (mordeurs), apprivoisable.
#[inline]
pub fn is_beast(kind: u16) -> bool {
    matches!(kind, U_BEAST_S | U_BEAST_M | U_BEAST_L)
}

/// Graine-mère en croissance : sève reçue et à recevoir (JSON).
fn heart_info(bb: &Building) -> String {
    if bb.kind == B_SEED_HEART && !bb.complete() {
        format!(",\"heart\":{{\"fed\":{},\"need\":{}}}", heart_fed(bb), HEART_SEVE)
    } else {
        String::new()
    }
}

/// Fiche d'un bâtiment de la Souche : réserve de son réseau (JSON, champs ajoutés à la fiche).
pub fn info(w: &World, b: usize) -> String {
    let bb = &w.buildings[b];
    let n = w.nets.get(bb.net as usize).filter(|_| bb.net != 0);
    let (s, l, st) = n.map_or((0, 0, 0), |n| (n.seve, n.sels, n.store));
    let (rs, rl) = if bb.complete() { organ_rate(w, b) } else { (0, 0) };
    let adapt = match bb.kind {
        B_MATRIX => crate::essaim::adapt_info(w, bb.owner),
        B_BROOD => crate::ponte::brood_info(w, b),
        _ => String::new(),
    };
    // cocon : ticks avant l'ouverture (-1 : pas un cocon, ou encore en croissance)
    let hatch = if bb.kind == B_COCOON && bb.complete() { COCOON_TICKS.saturating_sub(bb.charge) as i32 } else { -1 };
    format!(",\"souche\":{{\"net\":{},\"seve\":{},\"sels\":{},\"store\":{},\"rateSeve\":{},\"rateSels\":{},\"hatch\":{},\"far\":{}{}{}}}{}", bb.net, s, l, st, rs, rl, hatch, far_of(bb), crate::soil::info(w, b), heart_info(bb), adapt)
}
