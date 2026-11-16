//! Grilles spatiales : une unité ne cherche ses voisins et ses cibles que dans les cases proches.
//! Reconstruites à chaque tick par tri par comptage (ordre des identifiants préservé).

use crate::fixed::TILE;
use crate::world::Units;

pub const FINE: i32 = 2 * TILE; // 2 cases
pub const COARSE: i32 = 16 * TILE; // 16 cases
pub const BCELL: i32 = 8; // grille des bâtiments, en cases

pub struct Grid {
    pub cell: i32,
    pub cw: i32,
    pub ch: i32,
    pub start: Vec<u32>,
    pub items: Vec<u32>,
}

impl Grid {
    pub fn new(w_sub: i32, h_sub: i32, cell: i32) -> Grid {
        let cw = (w_sub + cell - 1) / cell;
        let ch = (h_sub + cell - 1) / cell;
        Grid { cell, cw, ch, start: vec![0; (cw * ch + 1) as usize], items: Vec::new() }
    }
    #[inline]
    pub fn cell_of(&self, x: i32, y: i32) -> usize {
        let cx = (x / self.cell).clamp(0, self.cw - 1);
        let cy = (y / self.cell).clamp(0, self.ch - 1);
        (cy * self.cw + cx) as usize
    }
    pub fn rebuild(&mut self, units: &Units, filter: impl Fn(usize) -> bool) {
        let n = (self.cw * self.ch) as usize;
        for v in self.start.iter_mut() {
            *v = 0;
        }
        let mut cells: Vec<u32> = Vec::with_capacity(units.alive.len());
        for s in 0..units.alive.len() {
            if units.alive[s] && filter(s) {
                let c = self.cell_of(units.x[s], units.y[s]);
                cells.push(c as u32);
                self.start[c + 1] += 1;
            } else {
                cells.push(u32::MAX);
            }
        }
        for i in 0..n {
            self.start[i + 1] += self.start[i];
        }
        self.items.clear();
        self.items.resize(self.start[n] as usize, 0);
        let mut fill: Vec<u32> = self.start[..n].to_vec();
        for (s, &c) in cells.iter().enumerate() {
            if c != u32::MAX {
                let f = &mut fill[c as usize];
                self.items[*f as usize] = s as u32;
                *f += 1;
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
        }
    }
    pub fn rebuild_units(&mut self, units: &Units) {
        let carried = |s: usize| units.cold[s].carried_by == u32::MAX;
        self.fine.rebuild(units, carried);
        self.coarse.rebuild(units, carried);
    }
    pub fn add_building(&mut self, slot: u32, x: i32, y: i32, w: i32, h: i32) {
        let bch = self.bcells.len() as i32 / self.bcw;
        for cy in (y / BCELL)..=((y + h - 1) / BCELL).min(bch - 1) {
            for cx in (x / BCELL)..=((x + w - 1) / BCELL).min(self.bcw - 1) {
                let v = &mut self.bcells[(cy * self.bcw + cx) as usize];
                if let Err(p) = v.binary_search(&slot) {
                    v.insert(p, slot);
                }
            }
        }
    }
    pub fn remove_building(&mut self, slot: u32, x: i32, y: i32, w: i32, h: i32) {
        let bch = self.bcells.len() as i32 / self.bcw;
        for cy in (y / BCELL)..=((y + h - 1) / BCELL).min(bch - 1) {
            for cx in (x / BCELL)..=((x + w - 1) / BCELL).min(self.bcw - 1) {
                let v = &mut self.bcells[(cy * self.bcw + cx) as usize];
                if let Ok(p) = v.binary_search(&slot) {
                    v.remove(p);
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
