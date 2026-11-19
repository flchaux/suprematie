//! Tapis roulants. Une ligne est une suite de tapis ; ses objets sont stockés comme une suite
//! d'écarts depuis l'extrémité avant. Faire avancer une ligne modifie en général un seul nombre.
//! Un objet sur un tapis n'est jamais une entité.

use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;
use std::collections::VecDeque;

pub const ITEM_GAP: i32 = 64; // espacement minimal : 1/4 de case

#[derive(Clone, Default)]
pub struct Line {
    pub alive: bool,
    pub tiles: Vec<u32>,
    /// (objet, écart) de l'avant vers l'arrière. L'écart du premier est sa distance à l'extrémité avant.
    pub items: VecDeque<(u8, i32)>,
    pub speed: i32,
    /// Indice du premier objet qui peut avancer (les précédents sont tassés).
    pub moving: u32,
    /// Case (indice de carte) dans laquelle la ligne débouche, ou -1.
    pub out_pos: i32,
    /// Niveau de cette case (un tapis surélevé ne livre qu'à un tapis de son niveau ou d'un niveau voisin).
    pub out_floor: u8,
    /// toutes ses cases sont dans une zone électrique alimentée (sinon la file est arrêtée)
    pub powered: bool,
}
crate::ser_struct!(Line { alive, tiles, items, speed, moving, out_pos, out_floor, powered });

/// Une file de tapis tourne-t-elle ? Il faut que chacune de ses cases soit dans une zone électrique
/// alimentée à au moins 50 %.
pub fn line_powered(w: &World, tiles: &[u32]) -> bool {
    tiles.iter().all(|&t| {
        let n = w.buildings[t as usize].net as usize;
        n != 0 && w.nets.get(n).is_some_and(|x| x.sat >= 512)
    })
}

#[derive(Default)]
pub struct Belts {
    pub lines: Vec<Line>,
    pub free: Vec<u32>,
}
crate::ser_struct!(Belts { lines, free });

pub const DIRS: [(i32, i32); 4] = [(1, 0), (0, 1), (-1, 0), (0, -1)];

impl Line {
    #[inline]
    pub fn len(&self) -> i32 {
        self.tiles.len() as i32 * TILE
    }
    /// Distance depuis l'avant du centre de la case d'indice `idx` (0 = arrière).
    #[inline]
    pub fn tile_center(&self, idx: usize) -> i32 {
        (self.tiles.len() as i32 - 1 - idx as i32) * TILE + TILE / 2
    }
    /// Insère un objet à la distance `p` de l'avant, si la place le permet.
    /// Place libre en `p` (écart minimal avec les objets voisins) : indice d'insertion et position de
    /// l'objet précédent, sinon None.
    fn slot_at(&self, p: i32) -> Option<(usize, i32)> {
        if p < 0 || p > self.len() - ITEM_GAP / 2 {
            return None;
        }
        let mut pos = 0;
        let mut k = 0usize;
        // trouver le premier objet situé au-delà de p
        while k < self.items.len() {
            let np = pos + self.items[k].1;
            if np > p {
                break;
            }
            pos = np;
            k += 1;
        }
        // pos = position de l'objet k-1 (ou 0 si k == 0)
        if k > 0 && p - pos < ITEM_GAP {
            return None;
        }
        if k < self.items.len() && pos + self.items[k].1 - p < ITEM_GAP {
            return None;
        }
        Some((k, pos))
    }
    /// Un objet peut-il être posé en `p` ?
    pub fn room_at(&self, p: i32) -> bool {
        self.slot_at(p).is_some()
    }
    pub fn insert_at(&mut self, item: u8, p: i32) -> bool {
        let Some((k, pos)) = self.slot_at(p) else { return false };
        if k < self.items.len() {
            let next = pos + self.items[k].1;
            self.items[k].1 = next - p;
        }
        self.items.insert(k, (item, p - pos));
        if (k as u32) < self.moving {
            self.moving = k as u32;
        }
        true
    }
    /// Retire le premier objet accepté par `want` dont la position est dans [a, b).
    pub fn take_in(&mut self, a: i32, b: i32, want: &dyn Fn(u8) -> bool) -> u8 {
        let mut pos = 0;
        for k in 0..self.items.len() {
            pos += self.items[k].1;
            if pos >= b {
                break;
            }
            if pos >= a && want(self.items[k].0) {
                let (it, g) = self.items.remove(k).unwrap_or((0, 0));
                if k < self.items.len() {
                    self.items[k].1 += g;
                }
                if (k as u32) < self.moving {
                    self.moving = k as u32;
                }
                return it;
            }
        }
        0
    }
    /// Vrai si un objet accepté se trouve dans [a, b).
    pub fn has_in(&self, a: i32, b: i32, want: &dyn Fn(u8) -> bool) -> bool {
        let mut pos = 0;
        for &(it, g) in &self.items {
            pos += g;
            if pos >= b {
                return false;
            }
            if pos >= a && want(it) {
                return true;
            }
        }
        false
    }
}

/// Direction d'un tapis à la case (x, y) au niveau `floor`, s'il y en a un (complet).
fn belt_at(w: &World, x: i32, y: i32, floor: u8) -> Option<(usize, u8)> {
    if !w.map.inside(x, y) || floor >= crate::map::FLOORS {
        return None;
    }
    let o = w.map.occ_floor(w.map.idx(x, y), floor);
    if o == 0 {
        return None;
    }
    let b = &w.buildings[(o - 1) as usize];
    if b.def().class == BClass::Belt && b.complete() {
        Some(((o - 1) as usize, b.dir))
    } else {
        None
    }
}

/// Tapis suivant (celui dans lequel débouche ce tapis) :
/// - au même niveau, dans le même sens : tout droit ;
/// - sinon au niveau voisin, dans le même sens (ascenseur : montée ou descente automatique) ; il
///   l'emporte sur un tapis du même niveau qui croise la case (passage par-dessus un tapis) ;
/// - sinon le tapis du même niveau qui croise (alimentation par le côté), s'il n'est pas en sens opposé.
pub fn next_belt(w: &World, b: usize) -> Option<usize> {
    let bb = &w.buildings[b];
    let (dx, dy) = DIRS[bb.dir as usize];
    let (x, y) = (bb.x + dx, bb.y + dy);
    let same = belt_at(w, x, y, bb.floor);
    if let Some((nb, nd)) = same {
        if nd == bb.dir {
            return Some(nb);
        }
    }
    for g in [bb.floor + 1, bb.floor.wrapping_sub(1)] {
        if let Some((nb, nd)) = belt_at(w, x, y, g) {
            // ascenseur : seulement tout droit
            if nd == bb.dir {
                return Some(nb);
            }
        }
    }
    match same {
        Some((nb, nd)) if (nd + 2) % 4 != bb.dir => Some(nb),
        _ => None,
    }
}

/// Tapis d'un autre niveau, juste derrière et dans le même sens, qui monte ou descend vers `b`
/// (aucun tapis de son propre niveau ne le prolonge tout droit sur la case de `b` ; un tapis qui y
/// croise ne compte pas : on passe par-dessus).
fn elevator_pred(w: &World, b: usize) -> Option<usize> {
    let bb = &w.buildings[b];
    let (bx, by) = DIRS[(bb.dir as usize + 2) % 4];
    for g in [bb.floor + 1, bb.floor.wrapping_sub(1)] {
        if let Some((pb, pd)) = belt_at(w, bb.x + bx, bb.y + by, g) {
            if pd == bb.dir && belt_at(w, bb.x, bb.y, g).is_none_or(|(_, d)| d != pd) {
                return Some(pb);
            }
        }
    }
    None
}

/// Niveau visé par un tapis qui monte ou descend (sa case suivante est à un autre niveau), sinon None.
pub fn ramp_to(w: &World, b: usize) -> Option<u8> {
    let nb = next_belt(w, b)?;
    let f = w.buildings[nb].floor;
    if f != w.buildings[b].floor {
        Some(f)
    } else {
        None
    }
}

/// Prédécesseur principal : le tapis derrière s'il pointe vers celui-ci, sinon l'unique tapis latéral (virage).
fn main_pred(w: &World, b: usize) -> Option<usize> {
    let bb = &w.buildings[b];
    let d = bb.dir as usize;
    let f = bb.floor;
    let (bx, by) = DIRS[(d + 2) % 4];
    if let Some((pb, pd)) = belt_at(w, bb.x + bx, bb.y + by, f) {
        if pd as usize == d {
            return Some(pb);
        }
    }
    if let Some(p) = elevator_pred(w, b) {
        return Some(p);
    }
    let mut side = None;
    let mut count = 0;
    for sd in [(d + 1) % 4, (d + 3) % 4] {
        let (sx, sy) = DIRS[sd];
        if let Some((pb, pd)) = belt_at(w, bb.x + sx, bb.y + sy, f) {
            // le tapis latéral doit pointer vers nous (et ne pas passer au-dessus par un ascenseur)
            if (pd as usize + 2) % 4 == sd && next_belt(w, pb) == Some(b) {
                side = Some(pb);
                count += 1;
            }
        }
    }
    if count == 1 {
        // pas de tapis derrière qui pointe vers nous
        if let Some((_, pd)) = belt_at(w, bb.x + bx, bb.y + by, f) {
            if pd as usize == d {
                return None;
            }
        }
        side
    } else {
        None
    }
}

/// Forme d'un tapis, déduite des tapis voisins (même règle que la continuité des lignes) :
/// 0 droit, 1 virage alimenté par le côté (dir + 1) % 4, 2 virage alimenté par le côté (dir + 3) % 4.
/// Un virage : aucun tapis derrière ne pointe vers celui-ci, et un seul tapis latéral y débouche.
pub fn belt_shape(w: &World, b: usize) -> u8 {
    let bb = &w.buildings[b];
    let d = bb.dir as usize;
    let f = bb.floor;
    let (bx, by) = DIRS[(d + 2) % 4];
    if let Some((_, pd)) = belt_at(w, bb.x + bx, bb.y + by, f) {
        if pd as usize == d {
            return 0;
        }
    }
    // arrivée par un ascenseur : droit
    if elevator_pred(w, b).is_some() {
        return 0;
    }
    let mut shape = 0;
    let mut count = 0;
    for (k, sd) in [(1u8, (d + 1) % 4), (2u8, (d + 3) % 4)] {
        let (sx, sy) = DIRS[sd];
        if let Some((pb, pd)) = belt_at(w, bb.x + sx, bb.y + sy, f) {
            if (pd as usize + 2) % 4 == sd && next_belt(w, pb) == Some(b) {
                shape = k;
                count += 1;
            }
        }
    }
    if count == 1 {
        return shape;
    }
    if count == 0 {
        return building_fed_shape(w, b);
    }
    0
}

/// Bâtiment au sol en (x, y) qui dépose ses produits sur les tapis de ses faces (fabricant, dépôt amélioré).
fn feeder_at(w: &World, x: i32, y: i32) -> bool {
    if !w.map.inside(x, y) {
        return false;
    }
    let o = w.map.occ[w.map.idx(x, y)];
    o != 0 && crate::buildings::feeds_belts(&w.buildings[(o - 1) as usize])
}

/// Virage alimenté par un bâtiment : un tapis au sol sans tapis qui l'alimente, posé le long de la face
/// d'un bâtiment qui dépose sur ses tapis (et pas devant une face qui le fait partir tout droit), reçoit
/// ses produits par le côté. 0 : droit ; 1 ou 2 : comme belt_shape.
fn building_fed_shape(w: &World, b: usize) -> u8 {
    let bb = &w.buildings[b];
    if bb.floor != 0 {
        return 0;
    }
    let d = bb.dir as usize;
    let (bx, by) = DIRS[(d + 2) % 4];
    if feeder_at(w, bb.x + bx, bb.y + by) {
        return 0;
    }
    let mut shape = 0;
    let mut count = 0;
    for (k, sd) in [(1u8, (d + 1) % 4), (2u8, (d + 3) % 4)] {
        let (sx, sy) = DIRS[sd];
        if feeder_at(w, bb.x + sx, bb.y + sy) {
            shape = k;
            count += 1;
        }
    }
    if count == 1 {
        shape
    } else {
        0
    }
}

/// Le tapis `t` reçoit-il les produits du bâtiment dont il touche la face `face` (direction vers
/// l'extérieur) ? Oui s'il en part tout droit, ou s'il fait un virage alimenté par ce côté.
pub fn takes_from_face(w: &World, t: usize, face: u8) -> bool {
    let tb = &w.buildings[t];
    if tb.dir == face {
        return true;
    }
    if tb.dir == (face + 2) & 3 {
        return false;
    }
    let sd = match building_fed_shape(w, t) {
        1 => (tb.dir + 1) & 3,
        2 => (tb.dir + 3) & 3,
        _ => return false,
    };
    // le côté qui alimente le virage regarde le bâtiment
    sd == (face + 2) & 3 && main_pred(w, t).is_none()
}

/// Reconstruit les lignes autour des cases modifiées en conservant les objets.
pub fn rebuild_around(w: &mut World, changed: &[(i32, i32)]) {
    let mut lines_hit: Vec<u32> = Vec::new();
    let mut tiles: Vec<u32> = Vec::new();
    for &(cx, cy) in changed {
        for dy in -2..=2 {
            for dx in -2..=2 {
                let (x, y) = (cx + dx, cy + dy);
                if !w.map.inside(x, y) {
                    continue;
                }
                for floor in 0..crate::map::FLOORS {
                    let o = w.map.occ_floor(w.map.idx(x, y), floor);
                    if o == 0 {
                        continue;
                    }
                    let b = &w.buildings[(o - 1) as usize];
                    if b.def().class != BClass::Belt {
                        continue;
                    }
                    if b.line != NONE {
                        lines_hit.push(b.line);
                    } else if b.complete() {
                        tiles.push(o - 1);
                    }
                }
            }
        }
    }
    lines_hit.sort_unstable();
    lines_hit.dedup();
    // Dissoudre les lignes touchées en notant la position des objets
    let mut saved: Vec<(u32, i32, u8)> = Vec::new(); // (tapis, distance depuis l'avant de sa case, objet)
    for &li in &lines_hit {
        let line = std::mem::take(&mut w.belts.lines[li as usize]);
        let n = line.tiles.len() as i32;
        let mut pos = 0;
        for &(it, g) in &line.items {
            pos += g;
            let kf = (pos / TILE).min(n - 1);
            let idx = (n - 1 - kf) as usize;
            let off = pos - kf * TILE;
            saved.push((line.tiles[idx], off, it));
        }
        for &t in &line.tiles {
            let b = &mut w.buildings[t as usize];
            if b.alive && b.def().class == BClass::Belt && b.line == li {
                b.line = NONE;
                if b.complete() {
                    tiles.push(t);
                }
            }
        }
        w.belts.free.push(li);
    }
    tiles.sort_unstable();
    tiles.dedup();
    // Construire les nouvelles lignes
    let in_set = |t: usize, tiles: &Vec<u32>| tiles.binary_search(&(t as u32)).is_ok();
    let mut visited = vec![false; tiles.len()];
    let pos_of = |t: usize, tiles: &Vec<u32>| tiles.binary_search(&(t as u32)).ok();
    let mut new_lines: Vec<u32> = Vec::new();
    for pass in 0..2 {
        for i in 0..tiles.len() {
            if visited[i] {
                continue;
            }
            let t = tiles[i] as usize;
            let speed = w.buildings[t].def().speed;
            if pass == 0 {
                // départ seulement si aucun prédécesseur principal dans l'ensemble de même vitesse
                if let Some(p) = main_pred(w, t) {
                    if in_set(p, &tiles) && w.buildings[p].def().speed == speed {
                        continue;
                    }
                }
            }
            let mut chain = vec![t as u32];
            visited[i] = true;
            let mut cur = t;
            while let Some(nx) = next_belt(w, cur) {
                let Some(pi) = pos_of(nx, &tiles) else { break };
                if visited[pi] || main_pred(w, nx) != Some(cur) || w.buildings[nx].def().speed != speed {
                    break;
                }
                visited[pi] = true;
                chain.push(nx as u32);
                cur = nx;
            }
            let last_i = *chain.last().unwrap_or(&0) as usize;
            let last = &w.buildings[last_i];
            let (dx, dy) = DIRS[last.dir as usize];
            let (ox, oy) = (last.x + dx, last.y + dy);
            let out_pos = if w.map.inside(ox, oy) { w.map.idx(ox, oy) as i32 } else { -1 };
            // sortie : le tapis suivant (éventuellement par un ascenseur), sinon le même niveau
            let out_floor = next_belt(w, last_i).map(|nb| w.buildings[nb].floor).unwrap_or(last.floor);
            let li = if let Some(f) = w.belts.free.pop() {
                f
            } else {
                w.belts.lines.push(Line::default());
                (w.belts.lines.len() - 1) as u32
            };
            for (k, &tb) in chain.iter().enumerate() {
                let b = &mut w.buildings[tb as usize];
                b.line = li;
                b.line_idx = k as u16;
            }
            let powered = line_powered(w, &chain);
            w.belts.lines[li as usize] = Line { alive: true, tiles: chain, items: VecDeque::new(), speed, moving: 0, out_pos, out_floor, powered };
            new_lines.push(li);
        }
    }
    // Replacer les objets
    let mut per_line: Vec<(u32, i32, u8)> = Vec::new();
    for (t, off, it) in saved {
        let b = &w.buildings[t as usize];
        if !b.alive || b.line == NONE {
            continue;
        }
        let l = &w.belts.lines[b.line as usize];
        let n = l.tiles.len() as i32;
        let p = (n - 1 - b.line_idx as i32) * TILE + off;
        per_line.push((b.line, p, it));
    }
    per_line.sort_unstable_by_key(|a| (a.0, a.1));
    let mut last_line = NONE;
    let mut last_pos = 0;
    for (li, p, it) in per_line {
        let l = &mut w.belts.lines[li as usize];
        if li != last_line {
            last_line = li;
            last_pos = 0;
            if l.items.is_empty() {
                l.items.push_back((it, p));
                last_pos = p;
                continue;
            }
        }
        let p = p.max(last_pos + ITEM_GAP);
        if p <= l.len() - ITEM_GAP / 2 {
            l.items.push_back((it, p - last_pos));
            last_pos = p;
        }
    }
    for li in new_lines {
        w.belts.lines[li as usize].moving = 0;
    }
}

/// Fait avancer toutes les lignes.
pub fn update_belts(w: &mut World) {
    let n = w.belts.lines.len();
    for li in 0..n {
        if !w.belts.lines[li].alive {
            continue;
        }
        // alimentation de la file, revue tous les 10 ticks (une file sur dix à chaque tick)
        if (li as u32 + w.tick).is_multiple_of(10) {
            let p = line_powered(w, &w.belts.lines[li].tiles);
            w.belts.lines[li].powered = p;
        }
        if w.belts.lines[li].items.is_empty() || !w.belts.lines[li].powered {
            continue;
        }
        // l'objet de tête est arrivé au bout : tenter de le faire sortir
        let (front_item, front_gap) = w.belts.lines[li].items[0];
        if front_gap == 0 {
            let out = w.belts.lines[li].out_pos;
            let floor = w.belts.lines[li].out_floor;
            if out >= 0 && output_item(w, li as u32, out as usize, floor, front_item) {
                let l = &mut w.belts.lines[li];
                l.items.pop_front();
                l.moving = 0;
            }
        }
        let l = &mut w.belts.lines[li];
        let mut k = l.moving as usize;
        while k < l.items.len() {
            let min = if k == 0 { 0 } else { ITEM_GAP };
            if l.items[k].1 > min {
                let d = l.speed.min(l.items[k].1 - min);
                l.items[k].1 -= d;
                break;
            }
            k += 1;
        }
        l.moving = k as u32;
    }
}

/// Fait sortir un objet de l'extrémité d'une ligne vers la case `pos` au niveau `floor` (au-dessus du
/// sol, seuls des tapis peuvent le recevoir).
fn output_item(w: &mut World, li: u32, pos: usize, floor: u8, item: u8) -> bool {
    let o = w.map.occ_floor(pos, floor);
    if o == 0 {
        return false;
    }
    let bi = (o - 1) as usize;
    let b = &w.buildings[bi];
    if !b.complete() {
        return false;
    }
    match b.def().class {
        BClass::Belt => {
            let tl = b.line;
            if tl == NONE {
                return false;
            }
            let idx = b.line_idx as usize;
            let tline = &mut w.belts.lines[tl as usize];
            // entrée par l'arrière de la première case : au tout début de la ligne
            let p = if idx == 0 { tline.len() - ITEM_GAP / 2 } else { tline.tile_center(idx) };
            tline.insert_at(item, p)
        }
        BClass::Depot => {
            let owner = b.owner as usize;
            if w.stock_room(owner, item) == 0 {
                return false;
            }
            w.players[owner].stock[item as usize] += 1;
            true
        }
        _ => {
            // tapis de contrôle : seulement par son arrière (la ligne avance dans sa direction)
            if let Some(&last) = w.belts.lines[li as usize].tiles.last() {
                if !crate::buildings::router_entry_ok(b, w.buildings[last as usize].dir) {
                    return false;
                }
            }
            if crate::buildings::accepts(w, bi, item) {
                crate::buildings::insert_item(w, bi, item);
                true
            } else {
                false
            }
        }
    }
}

/// Pose un objet sur la case de tapis `b` (au centre).
pub fn put_on_belt(w: &mut World, b: usize, item: u8) -> bool {
    let bb = &w.buildings[b];
    if bb.line == NONE {
        return false;
    }
    let idx = bb.line_idx as usize;
    let l = &mut w.belts.lines[bb.line as usize];
    let p = l.tile_center(idx);
    l.insert_at(item, p)
}

/// Un objet peut-il être posé sur la case de tapis `b` (au centre) ?
pub fn belt_has_room(w: &World, b: usize) -> bool {
    let bb = &w.buildings[b];
    if bb.line == NONE {
        return false;
    }
    let l = &w.belts.lines[bb.line as usize];
    l.room_at(l.tile_center(bb.line_idx as usize))
}

/// Prend sur la case de tapis `b` un objet accepté par `want`.
pub fn take_from_belt(w: &mut World, b: usize, want: &dyn Fn(u8) -> bool) -> u8 {
    let bb = &w.buildings[b];
    if bb.line == NONE {
        return 0;
    }
    let idx = bb.line_idx as usize;
    let l = &mut w.belts.lines[bb.line as usize];
    let n = l.tiles.len() as i32;
    let a = (n - 1 - idx as i32) * TILE;
    l.take_in(a, a + TILE, want)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn line_insert_take() {
        let mut l = Line { alive: true, tiles: vec![0, 1, 2, 3], items: VecDeque::new(), speed: 24, moving: 0, out_pos: -1, out_floor: 0, powered: true };
        assert!(l.insert_at(IRON_ORE, 128));
        assert!(!l.insert_at(IRON_ORE, 150));
        assert!(l.insert_at(COPPER_ORE, 400));
        assert!(l.insert_at(IRON_ORE, 300));
        assert_eq!(l.items.len(), 3);
        let it = l.take_in(256, 512, &|i| i == COPPER_ORE);
        assert_eq!(it, COPPER_ORE);
        assert_eq!(l.items.len(), 2);
        let total: i32 = l.items.iter().map(|x| x.1).sum();
        assert_eq!(total, 300);
    }
}
