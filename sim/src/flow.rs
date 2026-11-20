//! Déplacement par champs de flux (flow fields), calculés par secteur de 16x16 cases et partagés
//! par toutes les unités qui vont au même endroit. Un graphe de régions (composantes connexes
//! par secteur) donne la distance de chaque région au but ; le champ fin d'un secteur n'est
//! calculé que lorsqu'une unité s'y trouve. Seuls les secteurs modifiés sont recalculés.

use crate::map::{Map, P_HOVER, P_LAND, P_NAVAL};
use crate::world::World;
use std::collections::{BTreeMap, BinaryHeap, VecDeque};

pub const SEC: i32 = 16;
pub const MAXREG: usize = 4;
pub const INF: u16 = u16::MAX;
pub const MASKS: [u8; 3] = [P_LAND, P_HOVER, P_NAVAL];
pub const NO_DIR: u8 = 255;
pub const AT_GOAL: u8 = 8;

pub struct Goal {
    pub refs: u32,
    pub dist: Vec<u16>,
    pub fields: BTreeMap<u32, Vec<u16>>,
}

pub struct Nav {
    pub sw: i32,
    pub sh: i32,
    pub region: [Vec<u8>; 3],
    pub nreg: [Vec<u8>; 3],
    pub adj: [Vec<Vec<u32>>; 3],
    pub goals: BTreeMap<u64, Goal>,
    pub dirty: Vec<u32>,
}

#[inline]
pub fn goal_key(class: u8, tile: usize) -> u64 {
    ((class as u64) << 32) | tile as u64 | (1u64 << 40)
}

impl Nav {
    pub fn new(map: &Map) -> Nav {
        let sw = (map.w + SEC - 1) / SEC;
        let sh = (map.h + SEC - 1) / SEC;
        let n = (map.w * map.h) as usize;
        let ns = (sw * sh) as usize;
        let mut nav = Nav {
            sw,
            sh,
            region: [vec![255; n], vec![255; n], vec![255; n]],
            nreg: [vec![0; ns], vec![0; ns], vec![0; ns]],
            adj: [vec![Vec::new(); ns * MAXREG], vec![Vec::new(); ns * MAXREG], vec![Vec::new(); ns * MAXREG]],
            goals: BTreeMap::new(),
            dirty: Vec::new(),
        };
        for c in 0..3 {
            for s in 0..ns as i32 {
                nav.label(map, c, s);
            }
            for s in 0..ns as i32 {
                nav.link_sector(map, c, s, true);
            }
        }
        nav
    }

    fn label(&mut self, map: &Map, c: usize, s: i32) {
        let (sx, sy) = ((s % self.sw) * SEC, (s / self.sw) * SEC);
        let mask = MASKS[c];
        let x1 = (sx + SEC).min(map.w);
        let y1 = (sy + SEC).min(map.h);
        for y in sy..y1 {
            for x in sx..x1 {
                self.region[c][(y * map.w + x) as usize] = 255;
            }
        }
        let mut count = 0u8;
        let mut stack: Vec<(i32, i32)> = Vec::new();
        for y in sy..y1 {
            for x in sx..x1 {
                let i = (y * map.w + x) as usize;
                if self.region[c][i] != 255 || map.pass[i] & mask == 0 {
                    continue;
                }
                let lab = count.min(MAXREG as u8 - 1);
                count = count.saturating_add(1);
                self.region[c][i] = lab;
                stack.push((x, y));
                while let Some((cx, cy)) = stack.pop() {
                    for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                        let (nx, ny) = (cx + dx, cy + dy);
                        if nx < sx || ny < sy || nx >= x1 || ny >= y1 {
                            continue;
                        }
                        let j = (ny * map.w + nx) as usize;
                        if self.region[c][j] == 255 && map.pass[j] & mask != 0 {
                            self.region[c][j] = lab;
                            stack.push((nx, ny));
                        }
                    }
                }
            }
        }
        self.nreg[c][s as usize] = count.min(MAXREG as u8);
    }

    #[inline]
    fn node_at(&self, map: &Map, c: usize, x: i32, y: i32) -> Option<u32> {
        let r = self.region[c][(y * map.w + x) as usize];
        if r == 255 {
            return None;
        }
        let s = (y / SEC) * self.sw + x / SEC;
        Some(s as u32 * MAXREG as u32 + r as u32)
    }

    fn add_edge(&mut self, c: usize, a: u32, b: u32) {
        for (p, q) in [(a, b), (b, a)] {
            let v = &mut self.adj[c][p as usize];
            if let Err(i) = v.binary_search(&q) {
                v.insert(i, q);
            }
        }
    }

    /// (Re)crée les liens du secteur avec ses voisins. `initial` : seulement bords droit et bas.
    fn link_sector(&mut self, map: &Map, c: usize, s: i32, initial: bool) {
        let (sx, sy) = ((s % self.sw) * SEC, (s / self.sw) * SEC);
        let x1 = (sx + SEC).min(map.w);
        let y1 = (sy + SEC).min(map.h);
        let mut pairs: Vec<((i32, i32), (i32, i32))> = Vec::new();
        // bord droit et bas
        if x1 < map.w {
            for y in sy..y1 {
                pairs.push(((x1 - 1, y), (x1, y)));
            }
        }
        if y1 < map.h {
            for x in sx..x1 {
                pairs.push(((x, y1 - 1), (x, y1)));
            }
        }
        if !initial {
            if sx > 0 {
                for y in sy..y1 {
                    pairs.push(((sx, y), (sx - 1, y)));
                }
            }
            if sy > 0 {
                for x in sx..x1 {
                    pairs.push(((x, sy), (x, sy - 1)));
                }
            }
        }
        for ((ax, ay), (bx, by)) in pairs {
            if let (Some(a), Some(b)) = (self.node_at(map, c, ax, ay), self.node_at(map, c, bx, by)) {
                self.add_edge(c, a, b);
            }
        }
    }

    /// Recalcule un secteur après la pose ou la destruction d'un bâtiment.
    pub fn refresh_sector(&mut self, map: &Map, s: i32) {
        for c in 0..3 {
            // retirer les liens des nœuds de s
            for r in 0..MAXREG {
                let node = s as u32 * MAXREG as u32 + r as u32;
                let old = std::mem::take(&mut self.adj[c][node as usize]);
                for o in old {
                    let v = &mut self.adj[c][o as usize];
                    if let Ok(i) = v.binary_search(&node) {
                        v.remove(i);
                    }
                }
            }
            self.label(map, c, s);
            self.link_sector(map, c, s, false);
        }
    }

    fn bfs(&self, map: &Map, c: usize, tile: usize) -> Vec<u16> {
        let mut dist = vec![INF; self.adj[c].len()];
        let x = tile as i32 % map.w;
        let y = tile as i32 / map.w;
        let Some(start) = self.node_at(map, c, x, y) else {
            return dist;
        };
        let mut q = VecDeque::new();
        dist[start as usize] = 0;
        q.push_back(start);
        while let Some(n) = q.pop_front() {
            let d = dist[n as usize];
            for &m in &self.adj[c][n as usize] {
                if dist[m as usize] == INF {
                    dist[m as usize] = d + 1;
                    q.push_back(m);
                }
            }
        }
        dist
    }
}

/// Inscrit une unité sur un but ; renvoie la clé.
pub fn acquire_goal(w: &mut World, class: u8, x: i32, y: i32) -> u64 {
    let tx = x.clamp(0, w.map.w - 1);
    let ty = y.clamp(0, w.map.h - 1);
    let tile = passable_near(&w.map, class as usize, tx, ty);
    let key = goal_key(class, tile);
    if let Some(g) = w.nav.goals.get_mut(&key) {
        g.refs += 1;
        return key;
    }
    let dist = w.nav.bfs(&w.map, class as usize, tile);
    w.nav.goals.insert(key, Goal { refs: 1, dist, fields: BTreeMap::new() });
    key
}

/// Case franchissable la plus proche de (x, y) pour la classe de déplacement (anneaux de 1 à 12 cases).
/// Un but sur une case occupée (centre d'un bâtiment visé, rocher, eau pour un véhicule terrestre)
/// n'aurait aucune région : sans distances, les unités iraient en ligne droite et buteraient sur le
/// premier obstacle (une rive, une falaise).
fn passable_near(map: &Map, class: usize, x: i32, y: i32) -> usize {
    let mask = MASKS[class];
    let at = |x: i32, y: i32| (y * map.w + x) as usize;
    if map.pass[at(x, y)] & mask != 0 {
        return at(x, y);
    }
    for r in 1..=12i32 {
        let mut best: Option<(i32, usize)> = None;
        for dy in -r..=r {
            for dx in -r..=r {
                if dx.abs().max(dy.abs()) != r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || map.pass[at(nx, ny)] & mask == 0 {
                    continue;
                }
                // à égalité d'anneau, la plus proche (puis la première dans l'ordre de parcours)
                let d = dx * dx + dy * dy;
                if best.is_none_or(|(bd, _)| d < bd) {
                    best = Some((d, at(nx, ny)));
                }
            }
        }
        if let Some((_, t)) = best {
            return t;
        }
    }
    at(x, y)
}

pub fn release_goal(w: &mut World, key: u64) {
    if key == 0 {
        return;
    }
    let remove = if let Some(g) = w.nav.goals.get_mut(&key) {
        g.refs = g.refs.saturating_sub(1);
        g.refs == 0
    } else {
        false
    };
    if remove {
        w.nav.goals.remove(&key);
    }
}

pub fn mark_dirty(w: &mut World, x: i32, y: i32, bw: i32, bh: i32) {
    for sy in (y / SEC)..=((y + bh - 1) / SEC) {
        for sx in (x / SEC)..=((x + bw - 1) / SEC) {
            let s = (sy * w.nav.sw + sx) as u32;
            w.nav.dirty.push(s);
        }
    }
}

pub fn process_dirty(w: &mut World) {
    if w.nav.dirty.is_empty() {
        return;
    }
    let mut d = std::mem::take(&mut w.nav.dirty);
    d.sort_unstable();
    d.dedup();
    for &s in &d {
        w.nav.refresh_sector(&w.map, s as i32);
    }
    let sw = w.nav.sw;
    let sh = w.nav.sh;
    let keys: Vec<u64> = w.nav.goals.keys().copied().collect();
    for key in keys {
        let class = ((key >> 32) & 0xff) as usize;
        let tile = (key & 0xffff_ffff) as usize;
        let nd = w.nav.bfs(&w.map, class, tile);
        let g = w.nav.goals.get_mut(&key).expect("but présent");
        let mut drop: Vec<u32> = Vec::new();
        for &s in &d {
            drop.push(s);
        }
        for s in 0..(sw * sh) as usize {
            let base = s * MAXREG;
            if g.dist[base..base + MAXREG] != nd[base..base + MAXREG] {
                drop.push(s as u32);
            }
        }
        let mut drop2: Vec<u32> = Vec::new();
        for &s in &drop {
            let (x, y) = (s as i32 % sw, s as i32 / sw);
            drop2.push(s);
            for (dx, dy) in [(1, 0), (-1, 0), (0, 1), (0, -1)] {
                let (nx, ny) = (x + dx, y + dy);
                if nx >= 0 && ny >= 0 && nx < sw && ny < sh {
                    drop2.push((ny * sw + nx) as u32);
                }
            }
        }
        for s in drop2 {
            g.fields.remove(&s);
        }
        g.dist = nd;
    }
}

const DIR8: [(i32, i32, u32); 8] = [(1, 0, 10), (1, 1, 14), (0, 1, 10), (-1, 1, 14), (-1, 0, 10), (-1, -1, 14), (0, -1, 10), (1, -1, 14)];

/// Distance octile (pas droit 10, pas diagonal 14) entre deux cases.
#[inline]
fn octile(ax: i32, ay: i32, bx: i32, by: i32) -> u32 {
    let dx = (ax - bx).unsigned_abs();
    let dy = (ay - by).unsigned_abs();
    10 * dx.max(dy) + 4 * dx.min(dy)
}

/// Champ fin d'un secteur : pour chaque case, la direction à suivre (octet bas) et le masque des
/// directions qui sont toutes sur un plus court chemin (octet haut, voir `flow_cell`).
///
/// Les sorties du secteur sont les cases du bord voisines (en 8 directions) d'une région plus
/// proche du but dans le graphe des régions. Chacune reçoit comme coût le pas de sortie plus la
/// distance octile de la case voisine au but : l'unité quitte son secteur du côté du but, et pas
/// par le bord le plus proche (avec un coût uniforme sur tout le bord, une unité au bord droit
/// d'un secteur envoyée loin à gauche et un peu plus bas partait d'abord en diagonale vers la droite).
fn compute_field(nav: &Nav, map: &Map, class: usize, goal_tile: usize, dist: &[u16], s: i32) -> Vec<u16> {
    // le secteur et l'anneau d'une case qui l'entoure, en coordonnées locales (1..=ww, 1..=hh pour le secteur)
    const L: i32 = SEC + 2;
    const N: usize = (L * L) as usize;
    let (sx, sy) = ((s % nav.sw) * SEC, (s / nav.sw) * SEC);
    let mask = MASKS[class];
    let ww = (sx + SEC).min(map.w) - sx;
    let hh = (sy + SEC).min(map.h) - sy;
    let gx = goal_tile as i32 % map.w;
    let gy = goal_tile as i32 / map.w;
    // passabilité et distance de région (graphe des régions) de chaque case locale
    let mut pass = [false; N];
    let mut nd = [INF; N];
    for ly in 0..=hh + 1 {
        for lx in 0..=ww + 1 {
            let (x, y) = (sx + lx - 1, sy + ly - 1);
            if x < 0 || y < 0 || x >= map.w || y >= map.h {
                continue;
            }
            let i = (y * map.w + x) as usize;
            if map.pass[i] & mask == 0 {
                continue;
            }
            let k = (ly * L + lx) as usize;
            pass[k] = true;
            let r = nav.region[class][i];
            if r != 255 {
                nd[k] = dist[((y / SEC) * nav.sw + x / SEC) as usize * MAXREG + r as usize];
            }
        }
    }
    let inside = |lx: i32, ly: i32| lx >= 1 && lx <= ww && ly >= 1 && ly <= hh;
    // un pas en diagonale exige les deux cases orthogonales libres (pas de coin coupé)
    let step_ok = |k: i32, dx: i32, dy: i32| pass[(k + dy * L + dx) as usize] && (dx == 0 || dy == 0 || (pass[(k + dx) as usize] && pass[(k + dy * L) as usize]));
    // valeur du voisin de la case locale (lx, ly) dans la direction d : son coût dans le secteur, ou,
    // hors secteur, sa distance octile au but s'il appartient à une région plus proche du but
    let neighbor = |cost: &[u32; N], lx: i32, ly: i32, d: usize| -> Option<u32> {
        let (dx, dy, _) = DIR8[d];
        let k = ly * L + lx;
        if !step_ok(k, dx, dy) {
            return None;
        }
        let nk = (k + dy * L + dx) as usize;
        if inside(lx + dx, ly + dy) {
            let c = cost[nk];
            return (c != u32::MAX).then_some(c);
        }
        (nd[nk] < nd[k as usize]).then(|| octile(sx + lx - 1 + dx, sy + ly - 1 + dy, gx, gy))
    };
    let mut cost = [u32::MAX; N];
    let mut seed_dir = [NO_DIR; N];
    let mut heap: BinaryHeap<std::cmp::Reverse<(u32, u32)>> = BinaryHeap::new();
    let (glx, gly) = (gx - sx + 1, gy - sy + 1);
    if inside(glx, gly) && map.pass[goal_tile] & mask != 0 {
        let k = (gly * L + glx) as usize;
        cost[k] = 0;
        seed_dir[k] = AT_GOAL;
        heap.push(std::cmp::Reverse((0, k as u32)));
    }
    // sorties : cases du bord voisines d'une région plus proche du but, au coût du pas de sortie
    // plus la distance octile de la case voisine au but
    for ly in 1..=hh {
        for lx in 1..=ww {
            let k = (ly * L + lx) as usize;
            if !(lx == 1 || ly == 1 || lx == ww || ly == hh) || !pass[k] || seed_dir[k] == AT_GOAL {
                continue;
            }
            for (d, &(dx, dy, step)) in DIR8.iter().enumerate() {
                if inside(lx + dx, ly + dy) {
                    continue;
                }
                if let Some(h) = neighbor(&cost, lx, ly, d) {
                    if h + step < cost[k] {
                        cost[k] = h + step;
                        seed_dir[k] = d as u8;
                    }
                }
            }
            if seed_dir[k] != NO_DIR {
                heap.push(std::cmp::Reverse((cost[k], k as u32)));
            }
        }
    }
    while let Some(std::cmp::Reverse((c, k))) = heap.pop() {
        if c > cost[k as usize] {
            continue;
        }
        let (lx, ly) = (k as i32 % L, k as i32 / L);
        for &(dx, dy, step) in DIR8.iter() {
            if !inside(lx + dx, ly + dy) || !step_ok(k as i32, dx, dy) {
                continue;
            }
            let nk = (k as i32 + dy * L + dx) as usize;
            let nc = c + step;
            if nc < cost[nk] {
                cost[nk] = nc;
                heap.push(std::cmp::Reverse((nc, nk as u32)));
            }
        }
    }
    // direction : vers le voisin de plus faible valeur ; masque : les pas qui restent sur un plus court chemin
    let mut out = vec![NO_DIR as u16; (SEC * SEC) as usize];
    for ly in 1..=hh {
        for lx in 1..=ww {
            let k = (ly * L + lx) as usize;
            let o = ((ly - 1) * SEC + lx - 1) as usize;
            if cost[k] == u32::MAX {
                continue;
            }
            if seed_dir[k] == AT_GOAL {
                out[o] = AT_GOAL as u16;
                continue;
            }
            let mut best = u32::MAX;
            let mut bd = NO_DIR;
            let mut fan = 0u16;
            for (d, &(_, _, step)) in DIR8.iter().enumerate() {
                let Some(c) = neighbor(&cost, lx, ly, d) else { continue };
                if c + step == cost[k] {
                    fan |= 1 << d;
                }
                if c < best {
                    best = c;
                    bd = d as u8;
                }
            }
            out[o] = bd as u16 | fan << 8;
        }
    }
    out
}

/// Case (x, y) du champ du but `key` : direction (0..7, AT_GOAL ou NO_DIR) et masque des
/// directions optimales (bit d : un pas dans la direction d reste sur un plus court chemin).
pub fn flow_cell(w: &mut World, key: u64, x: i32, y: i32) -> (u8, u8) {
    if !w.map.inside(x, y) {
        return (NO_DIR, 0);
    }
    let s = ((y / SEC) * w.nav.sw + x / SEC) as u32;
    let class = ((key >> 32) & 0xff) as usize;
    let tile = (key & 0xffff_ffff) as usize;
    let nav = &mut w.nav;
    let Some(g) = nav.goals.get(&key) else { return (NO_DIR, 0) };
    if !g.fields.contains_key(&s) {
        let f = compute_field(nav, &w.map, class, tile, &g.dist, s as i32);
        if let Some(g) = nav.goals.get_mut(&key) {
            g.fields.insert(s, f);
        }
    }
    let g = &nav.goals[&key];
    let f = &g.fields[&s];
    let (sx, sy) = ((s as i32 % nav.sw) * SEC, (s as i32 / nav.sw) * SEC);
    let v = f[((y - sy) * SEC + (x - sx)) as usize];
    (v as u8, (v >> 8) as u8)
}

/// Direction (0..7, AT_GOAL ou NO_DIR) du champ du but `key` à la case (x, y).
pub fn flow_dir(w: &mut World, key: u64, x: i32, y: i32) -> u8 {
    flow_cell(w, key, x, y).0
}

/// Vrai si le but est atteignable depuis (x, y).
pub fn reachable(w: &World, key: u64, x: i32, y: i32) -> bool {
    let class = ((key >> 32) & 0xff) as usize;
    let Some(g) = w.nav.goals.get(&key) else { return false };
    if !w.map.inside(x, y) {
        return false;
    }
    let r = w.nav.region[class][(y * w.map.w + x) as usize];
    if r == 255 {
        return false;
    }
    let s = (y / SEC) * w.nav.sw + x / SEC;
    g.dist[s as usize * MAXREG + r as usize] != INF
}

/// Après restauration : recompte les références des buts à partir des unités.
pub fn rebuild_goal_refs(w: &mut World) {
    w.nav.goals.clear();
    let keys: Vec<u64> = (0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.cold[s].goal != 0).map(|s| w.units.cold[s].goal).collect();
    for key in keys {
        if let Some(g) = w.nav.goals.get_mut(&key) {
            g.refs += 1;
        } else {
            let class = ((key >> 32) & 0xff) as usize;
            let tile = (key & 0xffff_ffff) as usize;
            let dist = w.nav.bfs(&w.map, class, tile);
            w.nav.goals.insert(key, Goal { refs: 1, dist, fields: BTreeMap::new() });
        }
    }
}
