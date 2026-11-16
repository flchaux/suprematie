//! Le seul générateur aléatoire de la simulation (xorshift64*), initialisé par la graine de la partie.
//! Son état fait partie de l'état de la partie (sérialisé et haché).

#[derive(Clone)]
pub struct Rng {
    pub state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Rng {
        let mut r = Rng { state: seed ^ 0x9E37_79B9_7F4A_7C15 };
        if r.state == 0 {
            r.state = 1;
        }
        for _ in 0..4 {
            r.next_u64();
        }
        r
    }
    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }
    /// Entier dans [0, n).
    #[inline]
    pub fn below(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        ((self.next_u32() as u64 * n as u64) >> 32) as u32
    }
    /// Entier dans [lo, hi].
    #[inline]
    pub fn range(&mut self, lo: i32, hi: i32) -> i32 {
        if hi <= lo {
            return lo;
        }
        lo + self.below((hi - lo + 1) as u32) as i32
    }
}

/// Hachage entier sans état, utilisé pour le bruit de la carte.
#[inline]
pub fn hash3(a: i32, b: i32, seed: u32) -> u32 {
    let mut h = (a as u32).wrapping_mul(0x8DA6_B343) ^ (b as u32).wrapping_mul(0xD816_3841) ^ seed.wrapping_mul(0xCB1A_B31F);
    h ^= h >> 15;
    h = h.wrapping_mul(0x2C1B_3C6D);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297A_2D39);
    h ^= h >> 15;
    h
}
