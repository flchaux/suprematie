//! Mathématiques en entiers : trigonométrie par tables, racine carrée entière.
//! Aucune virgule flottante : tout est calculé à l'identique sur toutes les machines.

/// Une case de carte vaut 256 sous-unités.
pub const TILE: i32 = 256;
/// Un tour complet = 65536 unités d'angle.
pub const ANGLE_FULL: i32 = 65536;
/// Échelle des sinus/cosinus (Q14).
pub const TRIG_ONE: i32 = 16384;

const QUARTER: usize = 1024;

pub struct Trig {
    /// sin pour un quart de tour, QUARTER+1 entrées, Q14.
    sin_q: Vec<i32>,
    /// atan(k/1024) pour k=0..=1024, en unités d'angle.
    atan_t: Vec<i32>,
}

/// sin(x) en Q30 pour x en Q30 radians dans [0, pi/2], série de Taylor en i128.
fn sin_q30(x: i64) -> i64 {
    let one: i128 = 1 << 30;
    let x = x as i128;
    let x2 = x * x / one;
    let mut term = x;
    let mut sum = x;
    let mut n: i128 = 1;
    for _ in 0..10 {
        term = -term * x2 / one / ((n + 1) * (n + 2));
        sum += term;
        n += 2;
    }
    sum as i64
}

impl Trig {
    pub fn new() -> Trig {
        // pi/2 en Q30
        const HALF_PI_Q30: i64 = 1_686_629_713;
        let mut sin_q = Vec::with_capacity(QUARTER + 1);
        for i in 0..=QUARTER as i64 {
            let x = HALF_PI_Q30 * i / QUARTER as i64;
            let s = sin_q30(x);
            sin_q.push(((s + (1 << 15)) >> 16) as i32);
        }
        let mut t = Trig { sin_q, atan_t: Vec::new() };
        // atan par recherche dichotomique dans [0, 8192] (huitième de tour)
        let mut atan_t = Vec::with_capacity(1025);
        for k in 0..=1024i64 {
            let (mut lo, mut hi) = (0i32, 8192i32);
            while lo < hi {
                let mid = (lo + hi) / 2;
                // tan(mid) >= k/1024 <=> sin*1024 >= k*cos
                if (t.sin(mid as u16) as i64) * 1024 >= k * (t.cos(mid as u16) as i64) {
                    hi = mid;
                } else {
                    lo = mid + 1;
                }
            }
            atan_t.push(lo);
        }
        t.atan_t = atan_t;
        t
    }

    #[inline]
    pub fn sin(&self, a: u16) -> i32 {
        let a = a as usize;
        let q = a >> 14; // quadrant
        let r = a & 0x3fff; // 0..16383
        let idx = r >> 4; // 0..1023
        let frac = (r & 15) as i32;
        let lookup = |i: usize| -> i32 {
            let v0 = self.sin_q[i];
            let v1 = self.sin_q[i + 1];
            v0 + (v1 - v0) * frac / 16
        };
        match q {
            0 => lookup(idx),
            1 => {
                let i = QUARTER - idx - 1;
                let v1 = self.sin_q[i];
                let v0 = self.sin_q[i + 1];
                v0 + (v1 - v0) * frac / 16
            }
            2 => -lookup(idx),
            _ => {
                let i = QUARTER - idx - 1;
                let v1 = self.sin_q[i];
                let v0 = self.sin_q[i + 1];
                -(v0 + (v1 - v0) * frac / 16)
            }
        }
    }

    #[inline]
    pub fn cos(&self, a: u16) -> i32 {
        self.sin(a.wrapping_add(16384))
    }

    /// Angle (0..65535) du vecteur (x, y). Angle 0 = +x, 16384 = +y.
    pub fn atan2(&self, y: i64, x: i64) -> u16 {
        if x == 0 && y == 0 {
            return 0;
        }
        let ax = x.abs();
        let ay = y.abs();
        let (num, den, swap) = if ay <= ax { (ay, ax, false) } else { (ax, ay, true) };
        let k = ((num * 1024 + den / 2) / den) as usize;
        let mut a = self.atan_t[k.min(1024)];
        if swap {
            a = 16384 - a;
        }
        let a = match (x >= 0, y >= 0) {
            (true, true) => a,
            (false, true) => 32768 - a,
            (false, false) => 32768 + a,
            (true, false) => 65536 - a,
        };
        (a & 0xffff) as u16
    }
}

/// Racine carrée entière (partie entière).
pub fn isqrt(v: u64) -> u64 {
    if v < 2 {
        return v;
    }
    let mut x = v;
    let mut y = x.div_ceil(2);
    // point de départ plus proche
    let bits = 64 - v.leading_zeros();
    let start = 1u64 << bits.div_ceil(2);
    if start < x {
        x = start;
        y = (x + v / x) / 2;
    }
    while y < x {
        x = y;
        y = (x + v / x) / 2;
    }
    x
}

#[inline]
pub fn dist2(ax: i32, ay: i32, bx: i32, by: i32) -> i64 {
    let dx = (ax - bx) as i64;
    let dy = (ay - by) as i64;
    dx * dx + dy * dy
}

#[inline]
pub fn dist(ax: i32, ay: i32, bx: i32, by: i32) -> i32 {
    isqrt(dist2(ax, ay, bx, by) as u64) as i32
}

/// Différence signée entre deux angles, dans [-32768, 32767].
#[inline]
pub fn angle_diff(a: u16, b: u16) -> i32 {
    (a.wrapping_sub(b)) as i16 as i32
}

/// Tourne l'angle `cur` vers `target` d'au plus `rate`.
#[inline]
pub fn turn_towards(cur: u16, target: u16, rate: i32) -> u16 {
    let d = angle_diff(target, cur);
    if d.abs() <= rate {
        target
    } else if d > 0 {
        cur.wrapping_add(rate as u16)
    } else {
        cur.wrapping_sub(rate as u16)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trig_basics() {
        let t = Trig::new();
        assert_eq!(t.sin(0), 0);
        assert!((t.sin(16384) - TRIG_ONE).abs() <= 1);
        assert!((t.cos(0) - TRIG_ONE).abs() <= 1);
        assert!((t.sin(32768)).abs() <= 1);
        assert!((t.sin(49152) + TRIG_ONE).abs() <= 1);
        // sin(30°) = 0.5
        assert!((t.sin((65536 / 12) as u16) - 8192).abs() <= 2);
        assert_eq!(t.atan2(0, 10), 0);
        assert!((t.atan2(10, 0) as i32 - 16384).abs() <= 2);
        assert!((t.atan2(10, 10) as i32 - 8192).abs() <= 2);
        assert!((t.atan2(-10, -10) as i32 - 40960).abs() <= 2);
        assert!((t.atan2(-10, 10) as i32 - 57344).abs() <= 2);
    }
    #[test]
    fn sqrt() {
        for v in [0u64, 1, 2, 3, 4, 15, 16, 17, 1 << 40, 999_999_999_999] {
            let r = isqrt(v);
            assert!(r * r <= v && (r + 1) * (r + 1) > v, "{v}");
        }
    }
}
