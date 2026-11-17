//! Carte : relief, eau, gisements, positions de départ. Générée à partir d'une graine.

use crate::data::*;
use crate::rng::{hash3, Rng};

pub const P_LAND: u8 = 1;
pub const P_HOVER: u8 = 2;
pub const P_NAVAL: u8 = 4;

#[derive(Clone, Copy, Default)]
pub struct Spot {
    pub kind: u8,
    pub x: i32,
    pub y: i32,
}
crate::ser_struct!(Spot { kind, x, y });

/// Hauteur unique de la terre : la carte est plate (les tapis et les bâtiments sont tous de niveau).
pub const FLAT_LAND: u8 = 150;

pub struct Map {
    pub w: i32,
    pub h: i32,
    pub water_level: u8,
    pub height: Vec<u8>,
    pub deposit: Vec<u8>,
    pub cliff: Vec<u8>,
    pub spots: Vec<Spot>,
    pub starts: Vec<(i32, i32)>,
    /// Occupation par les bâtiments : 0 ou indice du bâtiment + 1.
    pub occ: Vec<u32>,
    /// Passabilité (P_LAND | P_HOVER | P_NAVAL), dérivée.
    pub pass: Vec<u8>,
}

fn smooth(t: i64) -> i64 {
    // t en Q16, smoothstep
    (t * t * (3 * 65536 - 2 * t)) >> 32
}

fn value_noise(x: i32, y: i32, scale: i32, seed: u32) -> i64 {
    let gx = x.div_euclid(scale);
    let gy = y.div_euclid(scale);
    let fx = (x.rem_euclid(scale) as i64) * 65536 / scale as i64;
    let fy = (y.rem_euclid(scale) as i64) * 65536 / scale as i64;
    let v = |a: i32, b: i32| (hash3(a, b, seed) >> 16) as i64; // 0..65535
    let sx = smooth(fx);
    let sy = smooth(fy);
    let a = v(gx, gy) + (((v(gx + 1, gy) - v(gx, gy)) * sx) >> 16);
    let b = v(gx, gy + 1) + (((v(gx + 1, gy + 1) - v(gx, gy + 1)) * sx) >> 16);
    a + (((b - a) * sy) >> 16)
}

impl Map {
    #[inline]
    pub fn idx(&self, x: i32, y: i32) -> usize {
        (y * self.w + x) as usize
    }
    #[inline]
    pub fn inside(&self, x: i32, y: i32) -> bool {
        x >= 0 && y >= 0 && x < self.w && y < self.h
    }
    #[inline]
    pub fn is_water(&self, x: i32, y: i32) -> bool {
        self.height[self.idx(x, y)] < self.water_level
    }
    #[inline]
    pub fn passable(&self, x: i32, y: i32, mask: u8) -> bool {
        self.inside(x, y) && self.pass[self.idx(x, y)] & mask != 0
    }

    /// Génère la carte (plate : voir FLAT_LAND).
    pub fn generate(seed: u32, size: i32, water: bool, nplayers: usize) -> Map {
        let w = size;
        let h = size;
        let n = (w * h) as usize;
        let mut rng = Rng::new(seed as u64 ^ 0x5eed_0000_1234);
        // Le relief (bruit) ne sert qu'à dessiner les côtes : seuil de l'eau pendant la génération,
        // puis la carte est rendue plate (voir plus bas).
        let water_level: u8 = if water { 72 } else { 0 };
        let mut height = vec![0u8; n];
        let sc = size / 512; // 1 ou 2
        let mut hraw = vec![0i64; n];
        for y in 0..h {
            for x in 0..w {
                let mut v = 0i64;
                v += value_noise(x, y, 160 * sc, seed) * 8;
                v += value_noise(x, y, 64 * sc, seed ^ 0x1111) * 4;
                v += value_noise(x, y, 24 * sc, seed ^ 0x2222) * 2;
                v += value_noise(x, y, 9, seed ^ 0x3333);
                hraw[(y * w + x) as usize] = v; // 0..15*65535
            }
        }
        for i in 0..n {
            // 0..255 avec un peu de contraste
            let v = hraw[i] * 256 / (15 * 65536);
            let v = (v - 128) * 3 / 2 + 120;
            height[i] = v.clamp(0, 255) as u8;
        }
        // Positions de départ sur un anneau
        let mut starts = Vec::new();
        let trig = crate::fixed::Trig::new();
        let np = nplayers.clamp(1, 8) as i32;
        let rot = rng.below(65536) as i32;
        let radius = w * 37 / 100;
        for i in 0..np {
            let a = (rot + i * 65536 / np) as u16;
            let x = w / 2 + (trig.cos(a) as i64 * radius as i64 / 16384) as i32;
            let y = h / 2 + (trig.sin(a) as i64 * radius as i64 / 16384) as i32;
            starts.push((x.clamp(24, w - 24), y.clamp(24, h - 24)));
        }
        let land_min = water_level as i32 + 14;
        // Aplanir autour des départs
        for &(sx, sy) in &starts {
            let mut sum = 0i64;
            let mut cnt = 0i64;
            for dy in -6..=6 {
                for dx in -6..=6 {
                    sum += height[((sy + dy) * w + sx + dx) as usize] as i64;
                    cnt += 1;
                }
            }
            let target = ((sum / cnt) as i32).max(land_min).min(200);
            flatten(&mut height, w, h, sx, sy, 22, 34, target);
        }
        let mut deposit = vec![0u8; n];
        let mut spots: Vec<Spot> = Vec::new();
        let place = |spots: &mut Vec<Spot>, height: &mut Vec<u8>, deposit: &mut Vec<u8>, kind: u8, x: i32, y: i32| -> bool {
            if x < 4 || y < 4 || x >= w - 6 || y >= h - 6 {
                return false;
            }
            for s in spots.iter() {
                if (s.x - x).abs() < 7 && (s.y - y).abs() < 7 {
                    return false;
                }
            }
            let i = (y * w + x) as usize;
            if (height[i] as i32) < land_min {
                return false;
            }
            let t = height[i] as i32;
            flatten(height, w, h, x + 1, y + 1, 3, 5, t);
            for dy in 0..2 {
                for dx in 0..2 {
                    deposit[((y + dy) * w + x + dx) as usize] = kind;
                }
            }
            spots.push(Spot { kind, x, y });
            true
        };
        // Gisements autour de chaque départ
        let base_kinds = [IRON_ORE, IRON_ORE, IRON_ORE, COPPER_ORE, COPPER_ORE, SILICON, HYDROCARBON, IRON_ORE, COPPER_ORE];
        for &(sx, sy) in &starts {
            for (k, &kind) in base_kinds.iter().enumerate() {
                for _try in 0..60 {
                    let a = rng.below(65536) as u16;
                    let r = 9 + rng.range(0, 10 + (k as i32) * 2);
                    let x = sx + (trig.cos(a) as i64 * r as i64 / 16384) as i32;
                    let y = sy + (trig.sin(a) as i64 * r as i64 / 16384) as i32;
                    if place(&mut spots, &mut height, &mut deposit, kind, x, y) {
                        break;
                    }
                }
            }
        }
        // Gisements répartis sur la carte
        let extra = (w * h / 2600) as u32;
        let mut placed = 0;
        let mut tries = 0;
        while placed < extra && tries < extra * 30 {
            tries += 1;
            let x = rng.range(8, w - 10);
            let y = rng.range(8, h - 10);
            let far = starts.iter().all(|&(sx, sy)| (sx - x).abs() + (sy - y).abs() > 40);
            if !far {
                continue;
            }
            let kind = match rng.below(10) {
                0..=3 => IRON_ORE,
                4..=6 => COPPER_ORE,
                7 => SILICON,
                _ => HYDROCARBON,
            };
            if place(&mut spots, &mut height, &mut deposit, kind, x, y) {
                placed += 1;
            }
        }
        // Cristal : rare, en zone disputée (centre et entre les joueurs)
        let mut cpts = vec![(w / 2, h / 2)];
        for i in 0..starts.len() {
            let (ax, ay) = starts[i];
            let (bx, by) = starts[(i + 1) % starts.len()];
            cpts.push(((ax + bx + w) / 3, (ay + by + h) / 3));
        }
        for &(cx, cy) in &cpts {
            for _try in 0..80 {
                let x = cx + rng.range(-20, 20);
                let y = cy + rng.range(-20, 20);
                if place(&mut spots, &mut height, &mut deposit, CRYSTAL, x, y) {
                    break;
                }
            }
        }
        // Carte plate : toute la terre à la même hauteur, l'eau à deux profondeurs (haut-fond près des
        // côtes, eau profonde au large). Les écarts restent sous le seuil des falaises : pas de falaise,
        // les aéroglisseurs passent de la terre à l'eau, les tapis et les bâtiments sont tous de niveau.
        let final_level: u8 = if water { FLAT_LAND - 4 } else { 0 };
        for hv in height.iter_mut() {
            let depth = water_level as i32 - *hv as i32;
            *hv = if !water || depth <= 0 {
                FLAT_LAND
            } else if depth > 6 {
                final_level - 4
            } else {
                final_level - 1
            };
        }
        let water_level = final_level;
        let mut m = Map { w, h, water_level, height, deposit, cliff: vec![0; n], spots, starts, occ: vec![0; n], pass: vec![0; n] };
        m.compute_cliffs();
        for y in 0..h {
            for x in 0..w {
                m.update_pass(x, y);
            }
        }
        m
    }

    fn compute_cliffs(&mut self) {
        let (w, h) = (self.w, self.h);
        for y in 0..h {
            for x in 0..w {
                let c = self.height[self.idx(x, y)] as i32;
                let mut mx = 0;
                for (dx, dy) in [(1, 0), (0, 1), (-1, 0), (0, -1)] {
                    let (nx, ny) = (x + dx, y + dy);
                    if self.inside(nx, ny) {
                        mx = mx.max((self.height[self.idx(nx, ny)] as i32 - c).abs());
                    }
                }
                let i = self.idx(x, y);
                self.cliff[i] = (mx > 7) as u8;
                if x == 0 || y == 0 || x == w - 1 || y == h - 1 {
                    self.cliff[i] = 1;
                }
            }
        }
    }

    /// Recalcule la passabilité d'une case. `blocking` : la case est occupée par un bâtiment bloquant.
    pub fn update_pass_with(&mut self, x: i32, y: i32, blocking: bool) {
        let i = self.idx(x, y);
        let water = self.height[i] < self.water_level;
        let deep = (self.height[i] as i32) < self.water_level as i32 - 2;
        let cliff = self.cliff[i] != 0;
        let mut p = 0;
        if !blocking {
            if !water && !cliff {
                p |= P_LAND | P_HOVER;
            }
            if water {
                p |= P_HOVER;
                if deep || !cliff {
                    p |= P_NAVAL;
                }
            }
        }
        self.pass[i] = p;
    }
    pub fn update_pass(&mut self, x: i32, y: i32) {
        self.update_pass_with(x, y, false);
    }

}

fn flatten(height: &mut [u8], w: i32, h: i32, cx: i32, cy: i32, r_in: i32, r_out: i32, target: i32) {
    for dy in -r_out..=r_out {
        for dx in -r_out..=r_out {
            let (x, y) = (cx + dx, cy + dy);
            if x < 0 || y < 0 || x >= w || y >= h {
                continue;
            }
            let d = crate::fixed::isqrt((dx * dx + dy * dy) as u64) as i32;
            if d > r_out {
                continue;
            }
            let i = (y * w + x) as usize;
            let cur = height[i] as i32;
            let v = if d <= r_in { target } else { cur + (target - cur) * (r_out - d) / (r_out - r_in) };
            height[i] = v.clamp(0, 255) as u8;
        }
    }
}
