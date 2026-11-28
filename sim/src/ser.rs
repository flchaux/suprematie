//! Sérialisation binaire compacte de l'état (snapshot/restore) et hachage.

pub struct W {
    pub buf: Vec<u8>,
    /// version du format écrit (voir save.rs) : les champs ajoutés après elle ne sont pas écrits (tests
    /// des anciennes sauvegardes)
    pub version: u32,
}
pub struct R<'a> {
    pub buf: &'a [u8],
    pub pos: usize,
    /// version du format lu (voir save.rs) : les champs ajoutés depuis prennent leur valeur par défaut
    pub version: u32,
}

impl W {
    pub fn new() -> W {
        W { buf: Vec::with_capacity(1 << 20), version: crate::save::VERSION }
    }
    #[inline]
    pub fn u8(&mut self, v: u8) {
        self.buf.push(v);
    }
    /// Entier variable (LEB128) pour rester compact.
    #[inline]
    pub fn var(&mut self, mut v: u64) {
        loop {
            let b = (v & 0x7f) as u8;
            v >>= 7;
            if v == 0 {
                self.buf.push(b);
                break;
            }
            self.buf.push(b | 0x80);
        }
    }
    #[inline]
    pub fn svar(&mut self, v: i64) {
        self.var(((v << 1) ^ (v >> 63)) as u64);
    }
}

impl<'a> R<'a> {
    pub fn new(buf: &'a [u8]) -> R<'a> {
        R { buf, pos: 0, version: crate::save::VERSION }
    }
    #[inline]
    pub fn u8(&mut self) -> u8 {
        let v = self.buf.get(self.pos).copied().unwrap_or(0);
        self.pos += 1;
        v
    }
    #[inline]
    pub fn var(&mut self) -> u64 {
        let mut v = 0u64;
        let mut shift = 0;
        loop {
            let b = self.u8();
            v |= ((b & 0x7f) as u64) << shift;
            if b & 0x80 == 0 || shift > 63 {
                break;
            }
            shift += 7;
        }
        v
    }
    #[inline]
    pub fn svar(&mut self) -> i64 {
        let u = self.var();
        ((u >> 1) as i64) ^ -((u & 1) as i64)
    }
}

pub trait Ser: Sized {
    fn ser(&self, w: &mut W);
    fn de(r: &mut R) -> Self;
}

macro_rules! ser_uint {
    ($($t:ty),*) => {$(
        impl Ser for $t {
            #[inline] fn ser(&self, w: &mut W) { w.var(*self as u64) }
            #[inline] fn de(r: &mut R) -> Self { r.var() as $t }
        }
    )*};
}
macro_rules! ser_int {
    ($($t:ty),*) => {$(
        impl Ser for $t {
            #[inline] fn ser(&self, w: &mut W) { w.svar(*self as i64) }
            #[inline] fn de(r: &mut R) -> Self { r.svar() as $t }
        }
    )*};
}
ser_uint!(u8, u16, u32, u64);
ser_int!(i8, i16, i32, i64);

impl Ser for bool {
    fn ser(&self, w: &mut W) {
        w.u8(*self as u8)
    }
    fn de(r: &mut R) -> Self {
        r.u8() != 0
    }
}

impl<T: Ser> Ser for Vec<T> {
    fn ser(&self, w: &mut W) {
        w.var(self.len() as u64);
        for x in self {
            x.ser(w);
        }
    }
    fn de(r: &mut R) -> Self {
        // longueur bornée par ce qui reste à lire (une lecture au mauvais format ne s'emballe pas)
        let n = (r.var() as usize).min(r.buf.len().saturating_sub(r.pos));
        let mut v = Vec::with_capacity(n.min(1 << 24));
        for _ in 0..n {
            v.push(T::de(r));
        }
        v
    }
}

impl<T: Ser> Ser for Option<T> {
    fn ser(&self, w: &mut W) {
        match self {
            None => w.u8(0),
            Some(x) => {
                w.u8(1);
                x.ser(w)
            }
        }
    }
    fn de(r: &mut R) -> Self {
        if r.u8() == 0 {
            None
        } else {
            Some(T::de(r))
        }
    }
}

impl<T: Ser + Copy + Default, const N: usize> Ser for [T; N] {
    fn ser(&self, w: &mut W) {
        // écriture d'un format d'avant les races (tests des anciennes sauvegardes) : objets d'alors
        let n = if N == crate::data::NUM_ITEMS { crate::data::items_in(w.version) } else { N };
        for x in self.iter().take(n) {
            x.ser(w);
        }
    }
    fn de(r: &mut R) -> Self {
        let mut a = [T::default(); N];
        // tableaux d'objets (stocks, compteurs) : les sauvegardes d'avant les races (format 2 et
        // moins) et d'avant l'eau (format 13 et moins) en avaient moins ; les objets ajoutés depuis valent zéro
        let n = if N == crate::data::NUM_ITEMS { crate::data::items_in(r.version) } else { N };
        for x in a.iter_mut().take(n) {
            *x = T::de(r);
        }
        a
    }
}

impl<A: Ser, B: Ser> Ser for (A, B) {
    fn ser(&self, w: &mut W) {
        self.0.ser(w);
        self.1.ser(w);
    }
    fn de(r: &mut R) -> Self {
        let a = A::de(r);
        (a, B::de(r))
    }
}

impl<K: Ser + Ord, V: Ser> Ser for std::collections::BTreeMap<K, V> {
    fn ser(&self, w: &mut W) {
        w.var(self.len() as u64);
        for (k, v) in self {
            k.ser(w);
            v.ser(w);
        }
    }
    fn de(r: &mut R) -> Self {
        let n = r.var() as usize;
        let mut m = std::collections::BTreeMap::new();
        for _ in 0..n {
            let k = K::de(r);
            m.insert(k, V::de(r));
        }
        m
    }
}

impl<T: Ser> Ser for std::collections::VecDeque<T> {
    fn ser(&self, w: &mut W) {
        w.var(self.len() as u64);
        for x in self {
            x.ser(w);
        }
    }
    fn de(r: &mut R) -> Self {
        let n = (r.var() as usize).min(r.buf.len().saturating_sub(r.pos));
        let mut v = std::collections::VecDeque::with_capacity(n.min(1 << 20));
        for _ in 0..n {
            v.push_back(T::de(r));
        }
        v
    }
}

/// Déclare la sérialisation d'une structure champ par champ.
#[macro_export]
macro_rules! ser_struct {
    ($t:ident { $($f:ident),* $(,)? }) => {
        impl $crate::ser::Ser for $t {
            fn ser(&self, w: &mut $crate::ser::W) { $( $crate::ser::Ser::ser(&self.$f, w); )* }
            fn de(r: &mut $crate::ser::R) -> Self { $t { $( $f: $crate::ser::Ser::de(r), )* } }
        }
    };
    // champs ajoutés à la version `v` du format : absents des sauvegardes plus anciennes (valeur par
    // défaut) ; plusieurs groupes « since N » se suivent, par version croissante
    ($t:ident { $($f:ident),* $(; since $v:literal : $($n:ident),*)+ $(,)? }) => {
        impl $crate::ser::Ser for $t {
            fn ser(&self, w: &mut $crate::ser::W) { $( $crate::ser::Ser::ser(&self.$f, w); )* $( $( if w.version >= $v { $crate::ser::Ser::ser(&self.$n, w); } )* )+ }
            fn de(r: &mut $crate::ser::R) -> Self {
                $t { $( $f: $crate::ser::Ser::de(r), )* $( $( $n: if r.version >= $v { $crate::ser::Ser::de(r) } else { Default::default() }, )* )+ }
            }
        }
    };
    // champs ajoutés à deux versions successives du format
    ($t:ident { $($f:ident),* ; since $v:literal : $($n:ident),* ; since $v2:literal : $($m:ident),* $(,)? }) => {
        impl $crate::ser::Ser for $t {
            fn ser(&self, w: &mut $crate::ser::W) { $( $crate::ser::Ser::ser(&self.$f, w); )* $( $crate::ser::Ser::ser(&self.$n, w); )* $( $crate::ser::Ser::ser(&self.$m, w); )* }
            fn de(r: &mut $crate::ser::R) -> Self {
                $t {
                    $( $f: $crate::ser::Ser::de(r), )*
                    $( $n: if r.version >= $v { $crate::ser::Ser::de(r) } else { Default::default() }, )*
                    $( $m: if r.version >= $v2 { $crate::ser::Ser::de(r) } else { Default::default() }, )*
                }
            }
        }
    };
}

/// Hachage rapide 64 bits pour comparer les états.
pub struct Hasher {
    pub h: u64,
}
impl Hasher {
    pub fn new() -> Hasher {
        Hasher { h: 0xcbf2_9ce4_8422_2325 }
    }
    #[inline]
    pub fn add(&mut self, v: u64) {
        self.h = (self.h ^ v).wrapping_mul(0x0000_0100_0000_01B3).rotate_left(23) ^ (v >> 7);
    }
    #[inline]
    pub fn add_i32(&mut self, v: i32) {
        self.add(v as u32 as u64);
    }
    pub fn finish32(&self) -> u32 {
        let h = self.h ^ (self.h >> 29);
        let h = h.wrapping_mul(0xBF58_476D_1CE4_E5B9);
        ((h >> 32) ^ h) as u32
    }
}
