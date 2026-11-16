//! Grilles spatiales : une unité ne cherche ses voisins et ses cibles que dans les cases proches.
//! Reconstruites à chaque tick par tri par comptage (ordre des identifiants préservé).

use crate::fixed::TILE;
use crate::world::Units;

pub const FINE: i32 = 4 * TILE; // 4 cases
pub const COARSE: i32 = 16 * TILE; // 16 cases
pub const BCELL: i32 = 8; // grille des bâtiments, en cases

pub struct Grid {
    pub cell: i32,
    pub cw: i32,
    pub ch: i32,
    pub start: Vec<u32>,
    pub items: Vec<u32>,
    /// Équipes présentes dans chaque case (un bit par équipe).
    pub teams: Vec<u8>,
    cells_tmp: Vec<u32>,
    fill_tmp: Vec<u32>,
}

impl Grid {
    pub fn new(w_sub: i32, h_sub: i32, cell: i32) -> Grid {
        let cw = (w_sub + cell - 1) / cell;
        let ch = (h_sub + cell - 1) / cell;
        Grid { cell, cw, ch, start: vec![0; (cw * ch + 1) as usize], items: Vec::new(), teams: vec![0; (cw * ch) as usize], cells_tmp: Vec::new(), fill_tmp: Vec::new() }
    }
    #[inline]
    pub fn cell_of(&self, x: i32, y: i32) -> usize {
        let cx = (x / self.cell).clamp(0, self.cw - 1);
        let cy = (y / self.cell).clamp(0, self.ch - 1);
        (cy * self.cw + cx) as usize
    }
    pub fn rebuild(&mut self, units: &Units, filter: impl Fn(usize) -> bool, team_bit: impl Fn(usize) -> u8) {
        let n = (self.cw * self.ch) as usize;
        for v in self.start.iter_mut() {
            *v = 0;
        }
        for v in self.teams.iter_mut() {
            *v = 0;
        }
        let mut cells = std::mem::take(&mut self.cells_tmp);
        cells.clear();
        for s in 0..units.alive.len() {
            if units.alive[s] && filter(s) {
                let c = self.cell_of(units.x[s], units.y[s]);
                cells.push(c as u32);
                self.start[c + 1] += 1;
                self.teams[c] |= team_bit(s);
            } else {
                cells.push(u32::MAX);
            }
        }
        for i in 0..n {
            self.start[i + 1] += self.start[i];
        }
        self.items.clear();
        self.items.resize(self.start[n] as usize, 0);
        let mut fill = std::mem::take(&mut self.fill_tmp);
        fill.clear();
        fill.extend_from_slice(&self.start[..n]);
        for (s, &c) in cells.iter().enumerate() {
            if c != u32::MAX {
                let f = &mut fill[c as usize];
                self.items[*f as usize] = s as u32;
                *f += 1;
            }
        }
        self.cells_tmp = cells;
        self.fill_tmp = fill;
    }
    /// Comme `query`, mais seulement dans les cases où une équipe de `mask` est présente.
    #[inline]
    pub fn query_teams(&self, x: i32, y: i32, r: i32, mask: u8, mut f: impl FnMut(usize)) {
        let x0 = ((x - r) / self.cell).clamp(0, self.cw - 1);
        let x1 = ((x + r) / self.cell).clamp(0, self.cw - 1);
        let y0 = ((y - r) / self.cell).clamp(0, self.ch - 1);
        let y1 = ((y + r) / self.cell).clamp(0, self.ch - 1);
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                let c = (cy * self.cw + cx) as usize;
                if self.teams[c] & mask == 0 {
                    continue;
                }
                for i in self.start[c]..self.start[c + 1] {
                    f(self.items[i as usize] as usize);
                }
            }
        }
    }
    /// Parcourt les unités des cases qui recouvrent le carré (x±r, y±r).
    #[inline]
    pub fn query(&self, x: i32, y: i32, r: i32, mut f: impl FnMut(usize)) {
        let x0 = ((x - r) / self.cell).clamp(0, self.cw - 1);
        let x1 = ((x + r) / self.cell).clamp(0, self.cw - 1);
        let y0 = ((y - r) / self.cell).clamp(0, self.ch - 1);
        let y1 = ((y + r) / self.cell).clamp(0, self.ch - 1);
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                let c = (cy * self.cw + cx) as usize;
                for i in self.start[c]..self.start[c + 1] {
                    f(self.items[i as usize] as usize);
                }
            }
        }
    }
}

pub struct Grids {
    pub fine: Grid,
    pub coarse: Grid,
    /// Bâtiments (hors tapis, bras, pylônes, murs) par case de 8x8 cases.
    pub bcw: i32,
    pub bcells: Vec<Vec<u32>>,
    /// Bit d'équipe de chaque bâtiment de `bcells` (même ordre).
    pub bteams: Vec<Vec<u8>>,
    /// Équipes présentes par case de la grille des bâtiments.
    pub bmask: Vec<u8>,
}

impl Grids {
    pub fn new(w: i32, h: i32) -> Grids {
        let bcw = (w + BCELL - 1) / BCELL;
        let bch = (h + BCELL - 1) / BCELL;
        Grids {
            fine: Grid::new(w * TILE, h * TILE, FINE),
            coarse: Grid::new(w * TILE, h * TILE, COARSE),
            bcw,
            bcells: vec![Vec::new(); (bcw * bch) as usize],
            bteams: vec![Vec::new(); (bcw * bch) as usize],
            bmask: vec![0; (bcw * bch) as usize],
        }
    }
    pub fn rebuild_units(&mut self, units: &Units, team_of_owner: &[u8]) {
        let carried = |s: usize| units.cold[s].carried_by == u32::MAX;
        let bit = |s: usize| 1u8 << (team_of_owner.get(units.owner[s] as usize).copied().unwrap_or(0) & 7);
        self.fine.rebuild(units, carried, bit);
        self.coarse.rebuild(units, carried, bit);
    }
    pub fn add_building(&mut self, slot: u32, x: i32, y: i32, w: i32, h: i32, team: u8) {
        let bch = self.bcells.len() as i32 / self.bcw;
        let bit = 1u8 << (team & 7);
        for cy in (y / BCELL)..=((y + h - 1) / BCELL).min(bch - 1) {
            for cx in (x / BCELL)..=((x + w - 1) / BCELL).min(self.bcw - 1) {
                let c = (cy * self.bcw + cx) as usize;
                let v = &mut self.bcells[c];
                if let Err(p) = v.binary_search(&slot) {
                    v.insert(p, slot);
                    self.bteams[c].insert(p, bit);
                    self.bmask[c] |= bit;
                }
            }
        }
    }
    pub fn remove_building(&mut self, slot: u32, x: i32, y: i32, w: i32, h: i32) {
        let bch = self.bcells.len() as i32 / self.bcw;
        for cy in (y / BCELL)..=((y + h - 1) / BCELL).min(bch - 1) {
            for cx in (x / BCELL)..=((x + w - 1) / BCELL).min(self.bcw - 1) {
                let c = (cy * self.bcw + cx) as usize;
                let v = &mut self.bcells[c];
                if let Ok(p) = v.binary_search(&slot) {
                    v.remove(p);
                    self.bteams[c].remove(p);
                    self.bmask[c] = self.bteams[c].iter().fold(0, |a, &b| a | b);
                }
            }
        }
    }
    /// Comme `query_buildings`, seulement dans les cases où une équipe de `mask` est présente.
    pub fn query_buildings_teams(&self, x: i32, y: i32, r: i32, mask: u8, mut f: impl FnMut(usize)) {
        let bch = self.bcells.len() as i32 / self.bcw;
        let c = BCELL * TILE;
        let x0 = ((x - r) / c).clamp(0, self.bcw - 1);
        let x1 = ((x + r) / c).clamp(0, self.bcw - 1);
        let y0 = ((y - r) / c).clamp(0, bch - 1);
        let y1 = ((y + r) / c).clamp(0, bch - 1);
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                let k = (cy * self.bcw + cx) as usize;
                if self.bmask[k] & mask == 0 {
                    continue;
                }
                for (i, &b) in self.bcells[k].iter().enumerate() {
                    if self.bteams[k][i] & mask != 0 {
                        f(b as usize);
                    }
                }
            }
        }
    }
    /// Bâtiments dont une case de 8x8 recouvre le carré (en sous-unités). Peut renvoyer des doublons.
    pub fn query_buildings(&self, x: i32, y: i32, r: i32, mut f: impl FnMut(usize)) {
        let bch = self.bcells.len() as i32 / self.bcw;
        let c = BCELL * TILE;
        let x0 = ((x - r) / c).clamp(0, self.bcw - 1);
        let x1 = ((x + r) / c).clamp(0, self.bcw - 1);
        let y0 = ((y - r) / c).clamp(0, bch - 1);
        let y1 = ((y + r) / c).clamp(0, bch - 1);
        for cy in y0..=y1 {
            for cx in x0..=x1 {
                for &b in &self.bcells[(cy * self.bcw + cx) as usize] {
                    f(b as usize);
                }
            }
        }
    }
}
