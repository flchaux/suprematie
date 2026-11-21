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
    /// pureté (% du rendement normal : 50, 100, 200) ; 0 : normale (gisement posé à la main)
    pub purity: u8,
}
crate::ser_struct!(Spot { kind, x, y, purity });

/// Pureté d'un gisement, en % du rendement normal : impur, normal, pur.
pub const PURITY_IMPURE: u8 = 50;
pub const PURITY_NORMAL: u8 = 100;
pub const PURITY_PURE: u8 = 200;

/// Pureté des gisements répartis sur la carte, selon la distance `d` (cases) au départ le plus proche
/// et un tirage fixé par la position : plutôt impurs près des bases, purs en zone disputée. Les gisements
/// de départ et le cristal restent normaux.
pub fn spot_purity(seed: u32, map_w: i32, x: i32, y: i32, d: i32) -> u8 {
    let r = hash3(x, y, seed ^ 0x5075_7269) % 100;
    // (impurs, normaux) en % ; le reste est pur
    let (imp, norm) = if d < map_w * 18 / 100 {
        (50, 45)
    } else if d >= map_w * 25 / 100 {
        (10, 60)
    } else {
        (25, 60)
    };
    if r < imp {
        PURITY_IMPURE
    } else if r < imp + norm {
        PURITY_NORMAL
    } else {
        PURITY_PURE
    }
}

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
    /// Occupation des étages au-dessus du sol (tapis surélevés) : étage 1 puis étage 2, même codage.
    /// Le sol (occ) reste seul à compter pour la passabilité, les bras, les trappes et la construction.
    pub occ_up: Vec<u32>,
    /// Passabilité (P_LAND | P_HOVER | P_NAVAL), dérivée.
    pub pass: Vec<u8>,
}

/// Nombre de niveaux de tapis : le sol et deux étages.
pub const FLOORS: u8 = 3;

impl Map {
    /// Rendement (en %) du gisement qui touche le rectangle (x, y, bw, bh) : sa pureté ; 100 s'il n'y en
    /// a pas (ou gisement posé à la main, sans pureté). Parcourt les gisements : à la pose, pas à chaque tick.
    pub fn purity_under(&self, x: i32, y: i32, bw: i32, bh: i32) -> u32 {
        self.spots
            .iter()
            .find(|s| s.x < x + bw && s.x + 2 > x && s.y < y + bh && s.y + 2 > y)
            .map_or(PURITY_NORMAL as u32, |s| if s.purity == 0 { PURITY_NORMAL as u32 } else { s.purity as u32 })
    }
    /// Occupant (indice + 1, ou 0) de la case `i` au niveau `floor` (0 : sol).
    #[inline]
    pub fn occ_floor(&self, i: usize, floor: u8) -> u32 {
        if floor == 0 {
            self.occ[i]
        } else {
            self.occ_up[(floor as usize - 1) * self.occ.len() + i]
        }
    }
    #[inline]
    pub fn set_occ_floor(&mut self, i: usize, floor: u8, v: u32) {
        if floor == 0 {
            self.occ[i] = v;
        } else {
            let n = self.occ.len();
            self.occ_up[(floor as usize - 1) * n + i] = v;
        }
    }
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
            spots.push(Spot { kind, x, y, purity: 0 });
            true
        };
        // Gisements autour de chaque départ
        // un hydrocarbure tout près (combustible du générateur principal), un second plus loin
        let base_kinds = [IRON_ORE, HYDROCARBON, IRON_ORE, IRON_ORE, COPPER_ORE, COPPER_ORE, SILICON, HYDROCARBON, IRON_ORE, COPPER_ORE];
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
        let base_spots = spots.len();
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
        let ring_start = spots.len();
        // Anneau du générateur principal amélioré : des gisements entre sa zone de départ et sa zone
        // améliorée, les mêmes à chaque départ. Générateur à graine séparé, placés après tous les
        // autres : les gisements d'avant (départs, carte, cristal) ne changent pas.
        let mut ring_rng = Rng::new(seed as u64 ^ 0x0a11_ea05_7a27);
        let (s0, s1) = (MAIN_GENERATOR_LEVELS[0].supply, MAIN_GENERATOR_LEVELS[MAIN_GENERATOR_LEVELS.len() - 1].supply);
        for &(sx, sy) in &starts {
            let (gx, gy) = (sx + MAIN_GEN_SPOT.0, sy + MAIN_GEN_SPOT.1);
            // l'anneau est de la terre, comme le départ (au même niveau) : la côte recule un peu
            let target = height[(sy * w + sx) as usize] as i32;
            flatten(&mut height, w, h, gx + 1, gy + 1, s1 + 5, s1 + 13, target);
            let rot = ring_rng.below(65536) as i32;
            let nk = RING_KINDS.len() as i32;
            for (k, &kind) in RING_KINDS.iter().enumerate() {
                // un secteur par gisement, pour les répartir tout autour ; puis n'importe où dans l'anneau
                for t in 0..300 {
                    let a = if t < 100 { rot + k as i32 * 65536 / nk + ring_rng.range(-65536 / (nk * 3), 65536 / (nk * 3)) } else { ring_rng.below(65536) as i32 };
                    let r = ring_rng.range(s0 + 3, s1 + 10);
                    let x = gx + 1 + (trig.cos(a as u16) as i64 * r as i64 / 16384) as i32;
                    let y = gy + 1 + (trig.sin(a as u16) as i64 * r as i64 / 16384) as i32;
                    if in_main_ring(gx, gy, x, y) && place(&mut spots, &mut height, &mut deposit, kind, x, y) {
                        break;
                    }
                }
            }
        }
        let ring_end = spots.len();
        // Geysers : en zone disputée, près des points de cristal et loin des départs
        let geyser_pts: Vec<(i32, i32)> = cpts.iter().map(|&(cx, cy)| (cx + rng.range(-30, 30), cy + rng.range(-30, 30))).collect();
        let extra_geysers = (w * h / 65536) as usize;
        let mut gpts = geyser_pts;
        for _ in 0..extra_geysers {
            gpts.push((rng.range(12, w - 14), rng.range(12, h - 14)));
        }
        for &(gx, gy) in &gpts {
            for _try in 0..40 {
                let x = gx + rng.range(-12, 12);
                let y = gy + rng.range(-12, 12);
                let far = starts.iter().all(|&(sx, sy)| (sx - x).abs() + (sy - y).abs() > w * 18 / 100);
                if far && place(&mut spots, &mut height, &mut deposit, GEYSER, x, y) {
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
        // pureté : normale pour les gisements de départ, ceux de l'anneau et le cristal, tirée pour les autres
        for (k, sp) in spots.iter_mut().enumerate() {
            // anneau du générateur principal : les mêmes gisements, normaux, à chaque départ
            sp.purity = if k < base_spots || (ring_start..ring_end).contains(&k) || sp.kind == CRYSTAL {
                PURITY_NORMAL
            } else {
                let d = starts.iter().map(|&(sx, sy)| crate::fixed::isqrt((((sx - sp.x) as i64).pow(2) + ((sy - sp.y) as i64).pow(2)) as u64) as i32).min().unwrap_or(i32::MAX);
                spot_purity(seed, w, sp.x, sp.y, d)
            };
        }
        let mut m = Map { w, h, water_level, height, deposit, cliff: vec![0; n], spots, starts, occ: vec![0; n], occ_up: vec![0; n * (FLOORS as usize - 1)], pass: vec![0; n] };
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

/// Emprise du générateur principal posé au départ (première place essayée, voir
/// World::place_start_buildings), relative à la position de départ.
pub const MAIN_GEN_SPOT: (i32, i32) = (3, -1);
/// Taille du générateur principal (cases).
const MAIN_GEN_SIZE: i32 = 3;
/// Gisements ajoutés autour de chaque départ, dans l'anneau que couvre seulement la zone du générateur
/// principal amélioré (MAIN_GENERATOR_LEVELS) : de quoi rentabiliser l'amélioration.
pub const RING_KINDS: [u8; 6] = [IRON_ORE, COPPER_ORE, SILICON, HYDROCARBON, IRON_ORE, COPPER_ORE];

/// Un gisement (2 × 2, coin `x`, `y`) est dans l'anneau du générateur principal d'emprise `gx`, `gy` :
/// entièrement dans sa zone améliorée, sans toucher sa zone de départ (même règle que
/// buildings::rebuild_power : l'emprise touche le carré de la zone).
pub fn in_main_ring(gx: i32, gy: i32, x: i32, y: i32) -> bool {
    let touches = |s: i32| x < gx + MAIN_GEN_SIZE + s && x + 2 > gx - s && y < gy + MAIN_GEN_SIZE + s && y + 2 > gy - s;
    let inside = |s: i32| x >= gx - s && x + 2 <= gx + MAIN_GEN_SIZE + s && y >= gy - s && y + 2 <= gy + MAIN_GEN_SIZE + s;
    let (s0, s1) = (MAIN_GENERATOR_LEVELS[0].supply, MAIN_GENERATOR_LEVELS[MAIN_GENERATOR_LEVELS.len() - 1].supply);
    !touches(s0) && inside(s1)
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
