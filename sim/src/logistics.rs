//! Logistique et entraide entre joueurs d'une même équipe.
//!
//! - Entrepôt d'équipe : un dépôt commun à l'équipe (son stock dans `stash`, voir drones.rs) ; les
//!   drones de chaque membre de l'équipe peuvent y puiser. Un objet choisi peut en ressortir
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
        BClass::Warehouse => item != 0 && crate::drones::store_room(bb, item) > 0,
        BClass::Station | BClass::CargoPad => bb.stash.len() >= 2 * N && stash_total(bb, false) < buffer_of(bb),
        _ => false,
    }
}

pub fn insert(w: &mut World, b: usize, item: u8) {
    match w.buildings[b].def().class {
        BClass::Warehouse => crate::drones::put(&mut w.buildings[b].stash, item, 1),
        BClass::Station | BClass::CargoPad if w.buildings[b].stash.len() >= 2 * N => {
            w.buildings[b].stash[item as usize] += 1;
        }
        _ => {}
    }
}

/// Un bras prend un objet : entrepôt (l'objet choisi, s'il est en stock) ou gare (objets reçus).
pub fn take(w: &mut World, b: usize, want: &[bool; NUM_ITEMS]) -> u8 {
    match w.buildings[b].def().class {
        BClass::Warehouse => {
            let it = w.buildings[b].recipe;
            if it == 0 || it as usize >= N || !want[it as usize] {
                return 0;
            }
            if crate::drones::take(&mut w.buildings[b].stash, it, 1) > 0 {
                it
            } else {
                0
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
    // les gares et héliports n'ont pas besoin d'électricité : un train livre toujours, même à une zone en panne
    w.buildings[b].working = true;
}

// ---------- ordres ----------

/// Ordre « vider » : tout le contenu d'une gare ou d'un héliport (« à envoyer » et « reçus ») est
/// remboursé à son propriétaire (dépôt le plus proche, sans plafond, voir drones::refund). Le chargement
/// des véhicules en route n'est pas touché.
pub fn empty_stash(w: &mut World, b: usize) {
    if carrier_kind(w.buildings[b].def().class).is_none() || w.buildings[b].stash.len() < 2 * N {
        return;
    }
    let owner = w.buildings[b].owner;
    for k in 0..2 * N {
        let n = std::mem::take(&mut w.buildings[b].stash[k]);
        crate::drones::refund_at(w, owner, b, (k % N) as u8, n as u32);
    }
    // des bras attendaient peut-être de la place pour déposer
    w.buildings[b].wake = 0;
    crate::buildings::wake_watchers(w, b);
}

/// Ordre « relier » : la gare `b` (du joueur `p`) reçoit un véhicule qui fera la navette vers `target`
/// (gare ou héliport de même type, du joueur ou d'un allié). Relier une gare à elle-même retire ses
/// véhicules. Le véhicule est payé par les dépôts proches de la gare (voir drones::pay_near).
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
    let (x, y) = w.buildings[b].center();
    if !crate::drones::pay_near(w, p, x, y, def.cost) {
        return;
    }
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

/// Rail (terminé ou non) d'une équipe en (x, y).
fn rail_at(w: &World, x: i32, y: i32, team: u8) -> bool {
    if !w.map.inside(x, y) {
        return false;
    }
    let o = w.map.occ[w.map.idx(x, y)];
    if o == 0 {
        return false;
    }
    let bb = &w.buildings[(o - 1) as usize];
    bb.def().class == BClass::Rail && w.team_of(bb.owner) == team
}

/// Forme d'un rail, déduite des rails voisins de la même équipe (terminés ou en chantier) : 0 droit
/// (orienté par sa direction), 1 + c pour un virage qui relie les côtés c et (c + 1) % 4 (directions de
/// DIRS) quand le rail a exactement deux voisins, sur deux côtés perpendiculaires. Sert au dessin : un
/// train suit toujours son trajet, et tourne en quart de cercle dans toute case où il change de direction.
pub fn rail_shape(w: &World, b: usize) -> u8 {
    let bb = &w.buildings[b];
    let team = w.team_of(bb.owner);
    let mut mask = 0u8;
    for (d, (dx, dy)) in crate::belts::DIRS.iter().enumerate() {
        if rail_at(w, bb.x + dx, bb.y + dy, team) {
            mask |= 1 << d;
        }
    }
    match mask {
        0b0011 => 1,
        0b0110 => 2,
        0b1100 => 3,
        0b1001 => 4,
        _ => 0,
    }
}

/// Position et cap d'un train à l'avancement `pos` le long de son trajet. Chaque case se parcourt d'un bord
/// à l'autre (entrée, sortie) ; une case où le trajet change de direction se parcourt en quart de cercle de
/// rayon 1/2 case autour du coin entre l'entrée et la sortie (comme un objet dans un virage de tapis).
/// L'avancement 0 est au centre de la première case, la fin du trajet au centre de la dernière.
pub(crate) fn train_pose(w: &World, path: &[u32], pos: i32) -> (i32, i32, Option<u16>) {
    let n = path.len();
    let mw = w.map.w;
    let cell = |i: usize| (path[i] as i32 % mw, path[i] as i32 / mw);
    let step = |a: usize, b: usize| {
        let ((ax, ay), (bx, by)) = (cell(a), cell(b));
        ((bx - ax).signum(), (by - ay).signum())
    };
    if n < 2 {
        return (tile_center(w, path[0]).0, tile_center(w, path[0]).1, None);
    }
    let p = (pos + TILE / 2).clamp(TILE / 2, (n as i32 - 1) * TILE + TILE / 2);
    let k = ((p / TILE) as usize).min(n - 1);
    let o = p - k as i32 * TILE;
    // sens d'arrivée dans la case (du précédent vers elle) et sens de sortie (d'elle vers le suivant)
    let din = if k > 0 { step(k - 1, k) } else { step(0, 1) };
    let dout = if k + 1 < n { step(k, k + 1) } else { din };
    let (cx, cy) = tile_center(w, path[k]);
    if din == dout || din.0 * dout.0 + din.1 * dout.1 != 0 {
        // tout droit : de l'entrée (centre - din / 2) vers la sortie
        let (x, y) = (cx - din.0 * TILE / 2 + din.0 * o, cy - din.1 * TILE / 2 + din.1 * o);
        return (x, y, Some(w.trig.atan2(din.1 as i64, din.0 as i64)));
    }
    // virage : côté d'entrée s = -din ; coin K = centre + (s + dout) / 2 ; angle t de 0 (entrée) à 90° (sortie)
    let s = (-din.0, -din.1);
    let r = TILE / 2;
    let (kx, ky) = (cx + (s.0 + dout.0) * r, cy + (s.1 + dout.1) * r);
    let t = (o.clamp(0, TILE) * 16384 / TILE) as u16;
    let (c, sn) = (w.trig.cos(t), w.trig.sin(t));
    let x = kx - (dout.0 * c + s.0 * sn) * r / 16384;
    let y = ky - (dout.1 * c + s.1 * sn) * r / 16384;
    // tangente : dout sin t - s cos t
    let (tx, ty) = (dout.0 * sn - s.0 * c, dout.1 * sn - s.1 * c);
    (x, y, Some(w.trig.atan2(ty as i64, tx as i64)))
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

/// Objets par voyage au départ de la gare `b` pour ce type de véhicule : le réglage de la gare (borné
/// par la capacité), ou 0 en automatique.
pub fn lot_of(b: &Building, kind: u8) -> u16 {
    b.lot.min(CARRIERS[kind as usize].capacity)
}

/// Chargement depuis « à envoyer », par objet dans l'ordre des identifiants, jusqu'à la capacité du
/// véhicule ou au nombre d'objets par voyage réglé sur la gare.
fn load(w: &mut World, ci: usize, b: usize) {
    if w.buildings[b].stash.len() < 2 * N {
        return;
    }
    let kind = w.carriers[ci].kind;
    let lot = lot_of(&w.buildings[b], kind);
    let cap = if lot > 0 { lot } else { CARRIERS[kind as usize].capacity };
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
        if w.carriers[ci].kind == 2 {
            update_robot(w, ci);
            continue;
        }
        if w.carriers[ci].kind == crate::drones::DRONE {
            crate::drones::update_drone(w, ci);
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
            // départ avec un voyage complet (automatique : dès qu'il y a quelque chose), ou à vide s'il y
            // a de quoi faire un voyage complet à l'autre bout
            let kind = w.carriers[ci].kind;
            let need = |b: &Building| lot_of(b, kind).max(1) as u32;
            let load = w.carriers[ci].load as u32;
            let go = load >= need(&w.buildings[here]) || (load == 0 && stash_total(&w.buildings[there], false) >= need(&w.buildings[there]));
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
            let (x, y, ang) = train_pose(w, &w.carriers[ci].path, pos);
            let c = &mut w.carriers[ci];
            c.x = x;
            c.y = y;
            if let Some(a) = ang {
                c.angle = a;
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

// ---------- portail de don ----------

/// Portail de don : les unités d'un allié (même équipe, autre joueur) qui se trouvent sur le portail
/// passent au propriétaire du portail. Pas de menu : on y envoie ses troupes comme ailleurs.
pub fn tick_portal(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + 10;
    let (owner, bx, by) = (w.buildings[b].owner, w.buildings[b].x, w.buildings[b].y);
    let (bw, bh) = w.buildings[b].size();
    let team = w.team_of(owner);
    let (cx, cy) = w.buildings[b].center();
    let (x0, y0, x1, y1) = (bx * TILE, by * TILE, (bx + bw) * TILE, (by + bh) * TILE);
    let mut found: Vec<usize> = Vec::new();
    {
        let u = &w.units;
        let players = &w.players;
        w.grid.fine.query(cx, cy, 2 * TILE, |s| {
            if !u.alive[s] || u.owner[s] == owner || u.kind[s] == U_COMMANDER || u.cold[s].carried_by != NONE {
                return;
            }
            if players[u.owner[s] as usize].team != team {
                return;
            }
            if u.x[s] >= x0 && u.x[s] < x1 && u.y[s] >= y0 && u.y[s] < y1 {
                found.push(s);
            }
        });
    }
    found.sort_unstable();
    for s in found {
        if w.players[owner as usize].unit_count >= UNIT_CAP {
            break;
        }
        let from = w.units.owner[s];
        crate::units::clear_orders(w, s);
        // les passagers d'un transport changent aussi de camp
        let cargo = w.units.cold[s].cargo.clone();
        for id in std::iter::once(w.unit_id(s)).chain(cargo) {
            if let Some(u) = w.unit(id) {
                let prev = w.units.owner[u] as usize;
                w.players[prev].unit_count = w.players[prev].unit_count.saturating_sub(1);
                w.units.owner[u] = owner;
                w.players[owner as usize].unit_count += 1;
                w.units.cold[u].parent = NONE;
            }
        }
        let (x, y) = (w.units.x[s], w.units.y[s]);
        w.ev(EV_GIFT, x, y, from as i32, owner as i32);
    }
}

// ---------- robots logistiques ----------

/// Objet qui manque à un bâtiment (et la quantité voulue), si un robot de la base en (px, py) peut
/// l'apporter (dépôts à portée de la base).
fn need_of(w: &World, b: usize, px: i32, py: i32) -> Option<(u8, u16)> {
    let bb = &w.buildings[b];
    let want: Vec<(u8, u16)> = match bb.def().class {
        BClass::Crafter if bb.recipe != RECIPE_NONE => RECIPES[bb.recipe as usize].inputs.iter().enumerate().map(|(j, &(it, n))| (it, (n as u16 * 2).saturating_sub(bb.inv[j]))).collect(),
        BClass::Factory => match bb.queue.first() {
            Some(&(k, _)) => udef(k).cost.iter().map(|&(it, n)| (it, n.saturating_sub(crate::buildings::factory_has(bb, it)))).collect(),
            None => Vec::new(),
        },
        BClass::Lab => {
            let t = w.players[bb.owner as usize].research;
            let tier = if t != 0 { TECHS[t as usize].tier as usize } else { 0 };
            (0..tier.min(6)).map(|k| (PACK1 + k as u8, 2u16.saturating_sub(bb.inv[k]))).collect()
        }
        BClass::Silo => MISSILE_COST.iter().enumerate().map(|(j, &(it, n))| (it, n.saturating_sub(bb.inv[j]))).collect(),
        BClass::AntiMissile => INTERCEPTOR_COST.iter().enumerate().map(|(j, &(it, n))| (it, n.saturating_sub(bb.inv[j]))).collect(),
        _ => Vec::new(),
    };
    let owner = bb.owner;
    want.into_iter().find(|&(it, n)| n > 0 && crate::buildings::accepts(w, b, it) && crate::drones::near_amount(w, owner, px, py, ROBOPORT_RANGE * TILE, it) > 0)
}

/// Sortie bloquée d'un fabricant ou d'un extracteur (que les robots de la base en (px, py) évacuent vers
/// un dépôt). Seulement si un dépôt à portée de la base a de la place pour cet objet.
fn blocked_output(w: &World, b: usize, px: i32, py: i32) -> bool {
    let bb = &w.buildings[b];
    let (blocked, it) = match bb.def().class {
        BClass::Crafter if bb.recipe != RECIPE_NONE => {
            let r = &RECIPES[bb.recipe as usize];
            let on = r.output.1 as u16;
            (bb.out + on > (on * 3).max(4), r.output.0)
        }
        BClass::Extractor => (bb.out >= 5, bb.recipe),
        _ => (false, 0),
    };
    blocked && crate::drones::store_with_room(w, bb.owner, px, py, ROBOPORT_RANGE * TILE, it).is_some()
}

/// Base de robots : énergie à chaque tick, distribution des tâches toutes les 20 ticks.
pub fn tick_roboport(w: &mut World, b: usize) {
    let need = w.buildings[b].def().power_use;
    let s = crate::buildings::use_power(w, b, need);
    w.buildings[b].working = s >= 512;
    if !w.buildings[b].working || !(w.tick + b as u32).is_multiple_of(20) {
        return;
    }
    let me = w.building_ref(b);
    let owner = w.buildings[b].owner;
    let (cx, cy) = w.buildings[b].center();
    // les robots viennent avec la base
    let n = w.carriers.iter().filter(|c| c.alive && c.kind == 2 && c.a == me).count();
    for _ in n..ROBOTS_PER_PORT {
        let c = Carrier { alive: true, kind: 2, owner, a: me, b: me, state: 0, ready: true, x: cx, y: cy, ..Carrier::default() };
        if let Some(slot) = w.carriers.iter().position(|c| !c.alive) {
            w.carriers[slot] = c;
        } else {
            w.carriers.push(c);
        }
    }
    let mut idle: Vec<usize> = (0..w.carriers.len()).filter(|&i| {
        let c = &w.carriers[i];
        c.alive && c.kind == 2 && c.a == me && c.state == 0 && c.timer == 0
    }).collect();
    if idle.is_empty() {
        return;
    }
    let mut busy: Vec<u32> = w.carriers.iter().filter(|c| c.alive && c.kind == 2 && c.state == 1).map(|c| c.b).collect();
    busy.sort_unstable();
    let r = ROBOPORT_RANGE * TILE;
    let mut cands: Vec<usize> = Vec::new();
    w.grid.query_buildings(cx, cy, r, |o| cands.push(o));
    cands.sort_unstable();
    cands.dedup();
    let cap = CARRIERS[2].capacity;
    idle.reverse();
    for o in cands {
        if idle.is_empty() {
            break;
        }
        let ob = &w.buildings[o];
        if !ob.alive || ob.owner != owner || !ob.complete() || o == b {
            continue;
        }
        let (ox, oy) = ob.center();
        if crate::fixed::dist2(cx, cy, ox, oy) > (r as i64) * (r as i64) {
            continue;
        }
        let oref = w.building_ref(o);
        if busy.binary_search(&oref).is_ok() {
            continue;
        }
        let job = if let Some((it, n)) = need_of(w, o, cx, cy) {
            let k = crate::drones::take_near(w, owner, cx, cy, r, it, n.min(cap));
            if k == 0 {
                continue;
            }
            Some((it, k))
        } else if blocked_output(w, o, cx, cy) {
            None
        } else {
            continue;
        };
        let ci = idle.pop().unwrap_or(usize::MAX);
        if ci == usize::MAX {
            break;
        }
        let c = &mut w.carriers[ci];
        if let Some((it, k)) = job {
            c.cargo[it as usize] += k;
            c.load += k;
        }
        c.b = oref;
        c.from = (cx, cy);
        c.to = (ox, oy);
        c.pos = 0;
        c.len = crate::fixed::dist(cx, cy, ox, oy);
        c.state = 1;
        if let Err(p) = busy.binary_search(&oref) {
            busy.insert(p, oref);
        }
    }
}

/// Vol d'un robot : livraison (ou ramassage d'une sortie bloquée), puis retour à sa base.
fn update_robot(w: &mut World, ci: usize) {
    let Some(port) = w.building(w.carriers[ci].a) else {
        w.carriers[ci].alive = false;
        return;
    };
    let owner = w.carriers[ci].owner;
    let (px, py) = w.buildings[port].center();
    match w.carriers[ci].state {
        0 => {
            let c = &mut w.carriers[ci];
            c.timer = c.timer.saturating_sub(1);
            // retour avec des objets (ramassés, ou non livrés) : au dépôt le plus proche de la base qui
            // a de la place, sinon remboursés (dépôt le plus proche, sans plafond)
            if c.load > 0 {
                let cargo = c.cargo;
                c.cargo = [0; NUM_ITEMS];
                c.load = 0;
                for (i, &n) in cargo.iter().enumerate() {
                    if n == 0 {
                        continue;
                    }
                    match crate::drones::store_with_room(w, owner, px, py, ROBOPORT_RANGE * TILE, i as u8) {
                        Some(d) => {
                            let k = n.min(crate::drones::store_room(&w.buildings[d], i as u8));
                            crate::drones::put(&mut w.buildings[d].stash, i as u8, k);
                            crate::drones::refund(w, owner, px, py, i as u8, (n - k) as u32);
                        }
                        None => crate::drones::refund(w, owner, px, py, i as u8, n as u32),
                    }
                }
            }
            let (x, y) = w.buildings[port].center();
            let c = &mut w.carriers[ci];
            c.x = x;
            c.y = y;
        }
        _ => {
            let to_target = w.carriers[ci].state == 1;
            let speed = CARRIERS[2].speed;
            let c = &mut w.carriers[ci];
            c.pos = (c.pos + speed).min(c.len);
            let (fx, fy) = c.from;
            let (tx, ty) = c.to;
            let l = c.len.max(1) as i64;
            c.x = fx + ((tx - fx) as i64 * c.pos as i64 / l) as i32;
            c.y = fy + ((ty - fy) as i64 * c.pos as i64 / l) as i32;
            let arrived = c.pos >= c.len;
            let ang = w.trig.atan2((ty - fy) as i64, (tx - fx) as i64);
            w.carriers[ci].angle = ang;
            if !arrived {
                return;
            }
            if to_target {
                if let Some(t) = w.building(w.carriers[ci].b) {
                    if w.carriers[ci].load > 0 {
                        // livraison : ce que le bâtiment accepte
                        for i in 1..NUM_ITEMS {
                            while w.carriers[ci].cargo[i] > 0 && crate::buildings::accepts(w, t, i as u8) {
                                crate::buildings::insert_item(w, t, i as u8);
                                w.carriers[ci].cargo[i] -= 1;
                                w.carriers[ci].load -= 1;
                            }
                        }
                    } else if blocked_output(w, t, px, py) {
                        // ramassage d'une sortie bloquée
                        let it = match w.buildings[t].def().class {
                            BClass::Crafter => RECIPES[w.buildings[t].recipe as usize].output.0,
                            _ => w.buildings[t].recipe,
                        };
                        // pas plus que la place du dépôt qui les recevra (le reste attend dans le bâtiment)
                        let room = crate::drones::store_with_room(w, owner, px, py, ROBOPORT_RANGE * TILE, it).map_or(0, |d| crate::drones::store_room(&w.buildings[d], it));
                        let k = w.buildings[t].out.min(CARRIERS[2].capacity).min(room);
                        w.buildings[t].out -= k;
                        w.carriers[ci].cargo[it as usize] += k;
                        w.carriers[ci].load += k;
                    }
                    w.buildings[t].wake = 0;
                    crate::buildings::wake_watchers(w, t);
                }
                let (px, py) = w.buildings[port].center();
                let c = &mut w.carriers[ci];
                c.from = (c.x, c.y);
                c.to = (px, py);
                c.pos = 0;
                c.len = crate::fixed::dist(c.x, c.y, px, py);
                c.state = 3;
            } else {
                let c = &mut w.carriers[ci];
                c.state = 0;
                c.timer = CARRIERS[2].dock;
            }
        }
    }
}

// ---------- Anneaux de transport ----------

/// Portée des anneaux (cases) : moyenne ; au-delà, il faut une porte de transit.
pub const RINGS_RANGE: u32 = 60;
/// Montée des anneaux avant l'échange (ticks).
pub const RINGS_TIME: u32 = 30;
/// Rayon (sous-unités) de ce que les anneaux emportent.
const RINGS_R: i32 = 2 * TILE + TILE / 2;

/// Fin de la montée des anneaux de `b` : ses unités terrestres et celles de la plateforme reliée (au
/// plus 12 de chaque côté, au propriétaire) échangent leur place, en gardant leur position relative.
pub fn rings_exchange(w: &mut World, b: usize) {
    let Some(t) = w.building(w.buildings[b].link) else {
        w.buildings[b].link = NONE;
        return;
    };
    w.buildings[b].link = NONE;
    w.buildings[b].cooldown = 400;
    let p = w.buildings[b].owner;
    let (ax, ay) = w.buildings[b].center();
    let (bx, by) = w.buildings[t].center();
    let pick = |w: &World, cx: i32, cy: i32| -> Vec<usize> {
        let mut out = Vec::new();
        for s in 0..w.units.alive.len() {
            if out.len() >= 12 {
                break;
            }
            if !w.units.alive[s] || w.units.owner[s] != p || w.units.cold[s].carried_by != NONE {
                continue;
            }
            let d = udef(w.units.kind[s]);
            if !matches!(d.layer, Layer::Land | Layer::Hover) || d.tier == 6 {
                continue;
            }
            if crate::fixed::dist2(w.units.x[s], w.units.y[s], cx, cy) <= (RINGS_R as i64).pow(2) {
                out.push(s);
            }
        }
        out
    };
    let here = pick(w, ax, ay);
    let there = pick(w, bx, by);
    for (list, (fx, fy), (tx, ty)) in [(here, (ax, ay), (bx, by)), (there, (bx, by), (ax, ay))] {
        for s in list {
            let (ox, oy) = (w.units.x[s] - fx, w.units.y[s] - fy);
            let m = crate::units::pass_mask(udef(w.units.kind[s]).layer);
            let (nx, ny) = crate::buildings::free_spot_near(w, tx + ox, ty + oy, m);
            w.ev(EV_TELEPORT, w.units.x[s], w.units.y[s], nx, ny);
            w.units.x[s] = nx;
            w.units.y[s] = ny;
            w.units.px[s] = nx;
            w.units.py[s] = ny;
            crate::units::clear_orders(w, s);
        }
    }
}
