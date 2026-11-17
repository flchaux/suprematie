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
    pub fields: BTreeMap<u32, Vec<u8>>,
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

fn compute_field(nav: &Nav, map: &Map, class: usize, goal_tile: usize, dist: &[u16], s: i32) -> Vec<u8> {
    let (sx, sy) = ((s % nav.sw) * SEC, (s / nav.sw) * SEC);
    let mask = MASKS[class];
    let x1 = (sx + SEC).min(map.w);
    let y1 = (sy + SEC).min(map.h);
    let loc = |x: i32, y: i32| ((y - sy) * SEC + (x - sx)) as usize;
    let mut cost = vec![u32::MAX; (SEC * SEC) as usize];
    let mut seed_dir = vec![NO_DIR; (SEC * SEC) as usize];
    let mut heap: BinaryHeap<std::cmp::Reverse<(u32, u32)>> = BinaryHeap::new();
    let gx = goal_tile as i32 % map.w;
    let gy = goal_tile as i32 / map.w;
    let node_d = |x: i32, y: i32| -> u16 {
        let r = nav.region[class][(y * map.w + x) as usize];
        if r == 255 {
            return INF;
        }
        let ss = (y / SEC) * nav.sw + x / SEC;
        dist[ss as usize * MAXREG + r as usize]
    };
    if gx >= sx && gx < x1 && gy >= sy && gy < y1 && map.pass[goal_tile] & mask != 0 {
        let l = loc(gx, gy);
        cost[l] = 0;
        seed_dir[l] = AT_GOAL;
        heap.push(std::cmp::Reverse((0, l as u32)));
    }
    for y in sy..y1 {
        for x in sx..x1 {
            let on_border = x == sx || y == sy || x == x1 - 1 || y == y1 - 1;
            if !on_border || map.pass[(y * map.w + x) as usize] & mask == 0 {
                continue;
            }
            let db = node_d(x, y);
            for (d, &(dx, dy, _)) in DIR8.iter().enumerate().step_by(2) {
                let (nx, ny) = (x + dx, y + dy);
                if nx >= sx && nx < x1 && ny >= sy && ny < y1 {
                    continue;
                }
                if nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || map.pass[(ny * map.w + nx) as usize] & mask == 0 {
                    continue;
                }
                let dn = node_d(nx, ny);
                if dn < db {
                    let c = dn as u32 * 160 + 10;
                    let l = loc(x, y);
                    if c < cost[l] {
                        cost[l] = c;
                        seed_dir[l] = d as u8;
                        heap.push(std::cmp::Reverse((c, l as u32)));
                    }
                }
            }
        }
    }
    while let Some(std::cmp::Reverse((c, l))) = heap.pop() {
        if c > cost[l as usize] {
            continue;
        }
        let x = sx + (l as i32 % SEC);
        let y = sy + (l as i32 / SEC);
        for &(dx, dy, step) in DIR8.iter() {
            let (nx, ny) = (x + dx, y + dy);
            if nx < sx || ny < sy || nx >= x1 || ny >= y1 {
                continue;
            }
            if map.pass[(ny * map.w + nx) as usize] & mask == 0 {
                continue;
            }
            if dx != 0 && dy != 0 && (map.pass[(y * map.w + nx) as usize] & mask == 0 || map.pass[(ny * map.w + x) as usize] & mask == 0) {
                continue;
            }
            let nl = loc(nx, ny);
            let nc = c + step;
            if nc < cost[nl] {
                cost[nl] = nc;
                heap.push(std::cmp::Reverse((nc, nl as u32)));
            }
        }
    }
    // directions : vers le voisin le moins coûteux
    let mut out = vec![NO_DIR; (SEC * SEC) as usize];
    for y in sy..y1 {
        for x in sx..x1 {
            let l = loc(x, y);
            if cost[l] == u32::MAX {
                continue;
            }
            if seed_dir[l] == AT_GOAL {
                out[l] = AT_GOAL;
                continue;
            }
            let mut best = cost[l];
            let mut bd = seed_dir[l];
            for (d, &(dx, dy, _)) in DIR8.iter().enumerate() {
                let (nx, ny) = (x + dx, y + dy);
                if nx < sx || ny < sy || nx >= x1 || ny >= y1 {
                    continue;
                }
                if dx != 0 && dy != 0 && (map.pass[(y * map.w + nx) as usize] & mask == 0 || map.pass[(ny * map.w + x) as usize] & mask == 0) {
                    continue;
                }
                let c = cost[loc(nx, ny)];
                if c < best {
                    best = c;
                    bd = d as u8;
                }
            }
            out[l] = bd;
        }
    }
    out
}

/// Direction (0..7, AT_GOAL ou NO_DIR) du champ du but `key` à la case (x, y).
pub fn flow_dir(w: &mut World, key: u64, x: i32, y: i32) -> u8 {
    if !w.map.inside(x, y) {
        return NO_DIR;
    }
    let s = ((y / SEC) * w.nav.sw + x / SEC) as u32;
    let class = ((key >> 32) & 0xff) as usize;
    let tile = (key & 0xffff_ffff) as usize;
    let nav = &mut w.nav;
    let Some(g) = nav.goals.get(&key) else { return NO_DIR };
    if !g.fields.contains_key(&s) {
        let f = compute_field(nav, &w.map, class, tile, &g.dist, s as i32);
        if let Some(g) = nav.goals.get_mut(&key) {
            g.fields.insert(s, f);
        }
    }
    let g = &nav.goals[&key];
    let f = &g.fields[&s];
    let (sx, sy) = ((s as i32 % nav.sw) * SEC, (s as i32 / nav.sw) * SEC);
    f[((y - sy) * SEC + (x - sx)) as usize]
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
