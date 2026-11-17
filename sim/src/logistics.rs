//! Logistique et entraide entre joueurs d'une même équipe.
//!
//! - Entrepôt d'équipe : les objets qui y entrent (bras, tapis) vont dans le stock commun de l'équipe,
//!   utilisable par chacun pour construire (après son propre stock). Un objet choisi peut en ressortir
//!   physiquement (bras qui prend dans l'entrepôt) : un allié peut ainsi alimenter vos chaînes.
//! - Gares et héliports de fret : deux tampons (à envoyer, reçus). Un véhicule fait la navette entre
//!   deux gares (ou deux héliports), éventuellement chez un allié : à chaque arrêt il décharge dans
//!   « reçus » puis charge depuis « à envoyer ». Trains : sur les rails de l'équipe, grande capacité.
//!   Drones : en ligne droite, rapides, petite capacité.

use crate::data::*;
use crate::fixed::{dist, TILE};
use crate::world::*;

#[derive(Clone, Default)]
pub struct Carrier {
    pub alive: bool,
    /// 0 = train, 1 = drone (indice dans CARRIERS)
    pub kind: u8,
    pub owner: u8,
    /// gare (ou héliport) de départ et d'arrivée (références de bâtiment)
    pub a: u32,
    pub b: u32,
    /// 0 à quai en A, 1 en route vers B, 2 à quai en B, 3 en route vers A
    pub state: u8,
    pub timer: u16,
    /// trains : cases de rail du trajet en cours (indices de carte)
    pub path: Vec<u32>,
    /// avancement le long du trajet (sous-unités)
    pub pos: i32,
    /// longueur du trajet (drones : distance en ligne droite)
    pub len: i32,
    pub x: i32,
    pub y: i32,
    /// départ et arrivée du vol en cours (drones)
    pub from: (i32, i32),
    pub to: (i32, i32),
    pub angle: u16,
    pub cargo: [u16; NUM_ITEMS],
    pub load: u16,
    /// à quai : la cargaison a été livrée, le chargement peut commencer
    pub ready: bool,
}
crate::ser_struct!(Carrier { alive, kind, owner, a, b, state, timer, path, pos, len, x, y, from, to, angle, cargo, load, ready });

const N: usize = NUM_ITEMS;

#[inline]
pub fn carrier_kind(class: BClass) -> Option<u8> {
    match class {
        BClass::Station => Some(0),
        BClass::CargoPad => Some(1),
        _ => None,
    }
}

/// Total des objets « à envoyer » (0) ou « reçus » (1) d'une gare.
pub fn stash_total(b: &Building, recv: bool) -> u32 {
    if b.stash.len() < 2 * N {
        return 0;
    }
    let o = if recv { N } else { 0 };
    b.stash[o..o + N].iter().map(|&x| x as u32).sum()
}

fn buffer_of(b: &Building) -> u32 {
    carrier_kind(b.def().class).map(|k| CARRIERS[k as usize].buffer as u32).unwrap_or(0)
}

// ---------- échanges avec les bras et les tapis ----------

/// Entrepôt, gare, héliport : acceptent-ils cet objet ?
pub fn accepts(w: &World, b: usize, item: u8) -> bool {
    let bb = &w.buildings[b];
    match bb.def().class {
        BClass::Warehouse => item != 0,
        BClass::Station | BClass::CargoPad => bb.stash.len() >= 2 * N && stash_total(bb, false) < buffer_of(bb),
        _ => false,
    }
}

pub fn insert(w: &mut World, b: usize, item: u8) {
    match w.buildings[b].def().class {
        BClass::Warehouse => {
            let team = w.team_of(w.buildings[b].owner) as usize;
            if let Some(ts) = w.team_stock.get_mut(team) {
                ts[item as usize] += 1;
            }
        }
        BClass::Station | BClass::CargoPad if w.buildings[b].stash.len() >= 2 * N => {
            w.buildings[b].stash[item as usize] += 1;
        }
        _ => {}
    }
}

/// Un bras prend un objet : entrepôt (l'objet choisi, s'il est en stock commun) ou gare (objets reçus).
pub fn take(w: &mut World, b: usize, want: &[bool; NUM_ITEMS]) -> u8 {
    match w.buildings[b].def().class {
        BClass::Warehouse => {
            let it = w.buildings[b].recipe;
            if it == 0 || it as usize >= N || !want[it as usize] {
                return 0;
            }
            let team = w.team_of(w.buildings[b].owner) as usize;
            match w.team_stock.get_mut(team) {
                Some(ts) if ts[it as usize] > 0 => {
                    ts[it as usize] -= 1;
                    it
                }
                _ => 0,
            }
        }
        BClass::Station | BClass::CargoPad => {
            let bb = &mut w.buildings[b];
            if bb.stash.len() < 2 * N {
                return 0;
            }
            for (i, &ok) in want.iter().enumerate().skip(1) {
                if ok && bb.stash[N + i] > 0 {
                    bb.stash[N + i] -= 1;
                    return i as u8;
                }
            }
            0
        }
        _ => 0,
    }
}

/// Tick d'une gare ou d'un héliport : consommation d'énergie (sans énergie, pas de chargement).
pub fn tick_station(w: &mut World, b: usize) {
    if w.buildings[b].stash.len() < 2 * N {
        w.buildings[b].stash = vec![0; 2 * N];
    }
    let need = w.buildings[b].def().power_use;
    let s = crate::buildings::use_power(w, b, need);
    w.buildings[b].working = s >= 512;
}

// ---------- ordres ----------

/// Ordre « relier » : la gare `b` (du joueur `p`) reçoit un véhicule qui fera la navette vers `target`
/// (gare ou héliport de même type, du joueur ou d'un allié). Relier une gare à elle-même retire ses
/// véhicules. Le véhicule est payé sur le stock du joueur (puis le stock commun de l'équipe).
pub fn link(w: &mut World, p: u8, b: usize, target: u32) {
    let Some(kind) = carrier_kind(w.buildings[b].def().class) else { return };
    let Some(t) = w.building(target) else { return };
    let src = w.building_ref(b);
    if t == b {
        for c in w.carriers.iter_mut() {
            if c.alive && c.a == src {
                c.alive = false;
            }
        }
        return;
    }
    let tb = &w.buildings[t];
    if tb.def().class != w.buildings[b].def().class || !tb.complete() || w.team_of(tb.owner) != w.team_of(p) {
        return;
    }
    let def = &CARRIERS[kind as usize];
    let n = w.carriers.iter().filter(|c| c.alive && c.a == src).count();
    if n >= def.max_per_station {
        return;
    }
    if !def.cost.iter().all(|&(it, k)| w.avail(p as usize, it) >= k as i32) {
        return;
    }
    for &(it, k) in def.cost {
        w.pay(p as usize, it, k as i32);
        w.players[p as usize].consumed[it as usize] += k as u32;
    }
    let (x, y) = w.buildings[b].center();
    let c = Carrier { alive: true, kind, owner: p, a: src, b: target, state: 0, timer: def.dock, ready: true, x, y, ..Carrier::default() };
    // une place libérée est réutilisée (ordre stable)
    if let Some(slot) = w.carriers.iter().position(|c| !c.alive) {
        w.carriers[slot] = c;
    } else {
        w.carriers.push(c);
    }
}

// ---------- déplacements ----------

/// Cases de rail utilisables par une équipe.
fn is_rail(w: &World, i: usize, team: u8) -> bool {
    let o = w.map.occ[i];
    if o == 0 {
        return false;
    }
    let bb = &w.buildings[(o - 1) as usize];
    bb.def().class == BClass::Rail && bb.complete() && w.team_of(bb.owner) == team
}

/// Cases de rail qui touchent le bâtiment (quais).
fn docks(w: &World, b: usize, team: u8) -> Vec<u32> {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let mut out = Vec::new();
    let mut add = |x: i32, y: i32| {
        if w.map.inside(x, y) {
            let i = w.map.idx(x, y);
            if is_rail(w, i, team) {
                out.push(i as u32);
            }
        }
    };
    for x in bb.x..bb.x + bw {
        add(x, bb.y - 1);
        add(x, bb.y + bh);
    }
    for y in bb.y..bb.y + bh {
        add(bb.x - 1, y);
        add(bb.x + bw, y);
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// Plus court trajet sur les rails de l'équipe, d'une des cases `from` à une des cases `to` (largeur d'abord).
fn rail_path(w: &World, from: &[u32], to: &[u32], team: u8) -> Option<Vec<u32>> {
    if from.is_empty() || to.is_empty() {
        return None;
    }
    let n = (w.map.w * w.map.h) as usize;
    let mut parent = vec![u32::MAX; n];
    let mut goal = vec![false; 0];
    goal.resize(n, false);
    for &t in to {
        goal[t as usize] = true;
    }
    let mut queue = std::collections::VecDeque::new();
    for &f in from {
        if parent[f as usize] == u32::MAX {
            parent[f as usize] = f;
            queue.push_back(f);
        }
    }
    let mw = w.map.w;
    while let Some(c) = queue.pop_front() {
        if goal[c as usize] {
            let mut path = vec![c];
            let mut k = c;
            while parent[k as usize] != k {
                k = parent[k as usize];
                path.push(k);
            }
            path.reverse();
            return Some(path);
        }
        let (x, y) = (c as i32 % mw, c as i32 / mw);
        for (dx, dy) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
            let (nx, ny) = (x + dx, y + dy);
            if !w.map.inside(nx, ny) {
                continue;
            }
            let ni = w.map.idx(nx, ny);
            if parent[ni] == u32::MAX && is_rail(w, ni, team) {
                parent[ni] = c;
                queue.push_back(ni as u32);
            }
        }
    }
    None
}

#[inline]
fn tile_center(w: &World, i: u32) -> (i32, i32) {
    let mw = w.map.w;
    ((i as i32 % mw) * TILE + TILE / 2, (i as i32 / mw) * TILE + TILE / 2)
}

/// Prépare le trajet vers l'autre extrémité. Faux si aucun trajet n'existe (on réessaiera).
fn depart(w: &mut World, ci: usize, from_b: usize, to_b: usize) -> bool {
    let c = &w.carriers[ci];
    if c.kind == 0 {
        let team = w.team_of(c.owner);
        // depuis la case de rail où se trouve le train s'il est sur la voie, sinon depuis les quais
        let start = if let Some(&last) = c.path.last() { if is_rail(w, last as usize, team) { vec![last] } else { docks(w, from_b, team) } } else { docks(w, from_b, team) };
        let Some(path) = rail_path(w, &start, &docks(w, to_b, team), team) else { return false };
        let len = (path.len() as i32 - 1).max(0) * TILE;
        let c = &mut w.carriers[ci];
        c.path = path;
        c.pos = 0;
        c.len = len;
    } else {
        let a = w.buildings[from_b].center();
        let b = w.buildings[to_b].center();
        let c = &mut w.carriers[ci];
        c.from = a;
        c.to = b;
        c.pos = 0;
        c.len = dist(a.0, a.1, b.0, b.1);
    }
    true
}

/// Déchargement dans « reçus ». Vrai quand la cargaison est entièrement livrée.
fn unload(w: &mut World, ci: usize, b: usize) -> bool {
    if w.buildings[b].stash.len() < 2 * N {
        return false;
    }
    let mut room = buffer_of(&w.buildings[b]).saturating_sub(stash_total(&w.buildings[b], true)) as u16;
    let mut moved = false;
    for i in 1..N {
        let k = w.carriers[ci].cargo[i].min(room);
        if k > 0 {
            w.carriers[ci].cargo[i] -= k;
            w.carriers[ci].load -= k;
            w.buildings[b].stash[N + i] += k;
            room -= k;
            moved = true;
        }
    }
    if moved {
        crate::buildings::wake_watchers(w, b);
    }
    w.carriers[ci].load == 0
}

/// Chargement depuis « à envoyer », par objet dans l'ordre des identifiants.
fn load(w: &mut World, ci: usize, b: usize) {
    if w.buildings[b].stash.len() < 2 * N {
        return;
    }
    let cap = CARRIERS[w.carriers[ci].kind as usize].capacity;
    let mut moved = false;
    for i in 1..N {
        let free = cap.saturating_sub(w.carriers[ci].load);
        if free == 0 {
            break;
        }
        let k = w.buildings[b].stash[i].min(free);
        if k > 0 {
            w.buildings[b].stash[i] -= k;
            w.carriers[ci].cargo[i] += k;
            w.carriers[ci].load += k;
            moved = true;
        }
    }
    if moved {
        crate::buildings::wake_watchers(w, b);
    }
}

/// Mise à jour de tous les véhicules (après les bâtiments).
pub fn update_carriers(w: &mut World) {
    for ci in 0..w.carriers.len() {
        if !w.carriers[ci].alive {
            continue;
        }
        let (ra, rb) = (w.carriers[ci].a, w.carriers[ci].b);
        let (Some(a), Some(b)) = (w.building(ra), w.building(rb)) else {
            // une extrémité détruite : le véhicule et sa cargaison sont perdus
            w.carriers[ci].alive = false;
            continue;
        };
        let def = &CARRIERS[w.carriers[ci].kind as usize];
        let state = w.carriers[ci].state;
        if state == 0 || state == 2 {
            let here = if state == 0 { a } else { b };
            let there = if state == 0 { b } else { a };
            // arrêt : temps de manœuvre (seulement si la gare est alimentée)
            if w.carriers[ci].timer > 0 {
                if w.buildings[here].working {
                    w.carriers[ci].timer -= 1;
                }
                continue;
            }
            if w.tick % 20 != ci as u32 % 20 || !w.buildings[here].working {
                continue;
            }
            // livrer d'abord toute la cargaison (si « reçus » est plein, on attend), puis charger
            if !w.carriers[ci].ready {
                if !unload(w, ci, here) {
                    continue;
                }
                w.carriers[ci].ready = true;
            }
            load(w, ci, here);
            // départ s'il y a quelque chose à livrer, ou à prendre à l'autre bout
            let go = w.carriers[ci].load > 0 || stash_total(&w.buildings[there], false) > 0;
            if go && depart(w, ci, here, there) {
                let c = &mut w.carriers[ci];
                c.state += 1;
                c.ready = false;
            }
            continue;
        }
        // en route
        let to_b = state == 1;
        let (from_b, dest) = if to_b { (a, b) } else { (b, a) };
        let kind = w.carriers[ci].kind;
        let team = w.team_of(w.carriers[ci].owner);
        {
            let c = &mut w.carriers[ci];
            c.pos = (c.pos + def.speed).min(c.len);
        }
        if kind == 0 {
            let (pos, plen) = (w.carriers[ci].pos, w.carriers[ci].path.len());
            if plen == 0 {
                let c = &mut w.carriers[ci];
                c.state = if to_b { 2 } else { 0 };
                c.timer = def.dock;
                continue;
            }
            let k = (pos / TILE) as usize;
            let f = pos % TILE;
            let p0 = w.carriers[ci].path[k.min(plen - 1)];
            let p1 = w.carriers[ci].path[(k + 1).min(plen - 1)];
            // voie coupée : on s'arrête sur la case actuelle et on cherche un autre trajet
            if !is_rail(w, p0 as usize, team) || !is_rail(w, p1 as usize, team) {
                {
                    let c = &mut w.carriers[ci];
                    c.path.truncate(k + 1);
                    c.pos = k as i32 * TILE;
                    c.len = c.pos;
                }
                if w.tick % 40 == ci as u32 % 40 {
                    let _ = depart(w, ci, from_b, dest);
                }
                continue;
            }
            let (x0, y0) = tile_center(w, p0);
            let (x1, y1) = tile_center(w, p1);
            let ang = w.trig.atan2((y1 - y0) as i64, (x1 - x0) as i64);
            let c = &mut w.carriers[ci];
            c.x = x0 + (x1 - x0) * f / TILE;
            c.y = y0 + (y1 - y0) * f / TILE;
            if x1 != x0 || y1 != y0 {
                c.angle = ang;
            }
        } else {
            let (fx, fy) = w.carriers[ci].from;
            let (tx, ty) = w.carriers[ci].to;
            let ang = w.trig.atan2((ty - fy) as i64, (tx - fx) as i64);
            let c = &mut w.carriers[ci];
            let l = c.len.max(1) as i64;
            c.x = fx + ((tx - fx) as i64 * c.pos as i64 / l) as i32;
            c.y = fy + ((ty - fy) as i64 * c.pos as i64 / l) as i32;
            c.angle = ang;
        }
        let c = &mut w.carriers[ci];
        if c.pos >= c.len {
            c.state = if to_b { 2 } else { 0 };
            c.timer = def.dock;
        }
    }
    // les places libres en fin de liste sont retirées (la liste reste courte)
    while w.carriers.last().is_some_and(|c| !c.alive) {
        w.carriers.pop();
    }
}
