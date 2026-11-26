//! Gabarits d'équipement des unités des Transhumants (voir docs/spec/races.md, « Gabarits »).
//!
//! - Un joueur enregistre jusqu'à trois gabarits par type d'unité : une amélioration au plus par emplacement (arme,
//!   châssis, équipement). Un gabarit est un `u32` : un octet par emplacement (indice dans MODS, 0 : rien).
//! - Gabarit de production : l'atelier (et l'atelier embarqué de l'Arche) sort ce type d'unité déjà équipé. Il paie
//!   l'équipement au début de la fabrication, dans les réserves à portée, relevés compris, et met la moitié du temps
//!   d'installation en plus. S'il ne peut pas tout payer, l'unité sort nue et s'équipe dès que possible.
//! - Équipement voulu (`UnitCold::want`) : une unité installe une à une, dès que les réserves à portée le permettent,
//!   les améliorations qui lui manquent. C'est ainsi qu'un groupe se rééquipe en un ordre. Installer ou annuler à la
//!   main l'oublie.

use crate::ameliorations::*;
use crate::data::*;
use crate::world::*;

/// Gabarits par type d'unité.
pub const KITS: usize = 3;

/// Gabarits d'un joueur pour un type d'unité ; `active` : celui de la production (1 à KITS ; 0 : aucun).
#[derive(Clone, Copy, Default, Debug, PartialEq)]
pub struct Kit {
    pub kind: u16,
    pub active: u8,
    pub sets: [u32; KITS],
}
crate::ser_struct!(Kit { kind, active, sets });

/// Gabarit réduit à ce qui peut s'installer sur ce type d'unité.
pub fn valid(kind: u16, set: u32) -> u32 {
    let mut v = 0;
    for k in 0..slots(kind).len().min(3) as u8 {
        let m = at(set as u64, k);
        if m != 0 && MODS.get(m as usize).is_some_and(|d| d.host == kind && d.slot == k && d.base == 0) {
            v |= (m as u32) << (8 * k as u32);
        }
    }
    v
}

/// Ce type d'unité a-t-il des gabarits ? (une unité de combat : trois emplacements)
pub fn has_kits(kind: u16) -> bool {
    (kind as usize) < UNITS.len() && host_has_mods(kind) && std::ptr::eq(slots(kind).as_ptr(), UNIT_SLOTS.as_ptr())
}

fn kits_of(w: &World, p: u8, kind: u16) -> Option<&Kit> {
    w.players.get(p as usize)?.kits.iter().find(|k| k.kind == kind)
}

fn kits_mut(w: &mut World, p: u8, kind: u16) -> Option<&mut Kit> {
    let kits = &mut w.players.get_mut(p as usize)?.kits;
    // rangés par type croissant
    let i = match kits.binary_search_by_key(&kind, |k| k.kind) {
        Ok(i) => i,
        Err(i) => {
            kits.insert(i, Kit { kind, ..Kit::default() });
            i
        }
    };
    kits.get_mut(i)
}

/// Ordre : enregistrer le gabarit `k` (0 à KITS - 1) d'un type d'unité.
pub fn record(w: &mut World, p: u8, kind: i32, k: i32, set: u32) {
    if !(0..UNITS.len() as i32).contains(&kind) || !has_kits(kind as u16) || !(0..KITS as i32).contains(&k) {
        return;
    }
    let set = valid(kind as u16, set);
    if let Some(kit) = kits_mut(w, p, kind as u16) {
        kit.sets[k as usize] = set;
        if set == 0 && kit.active == k as u8 + 1 {
            kit.active = 0;
        }
    }
}

/// Ordre : gabarit de production d'un type d'unité (1 à KITS ; 0 : aucun).
pub fn activate(w: &mut World, p: u8, kind: i32, k: i32) {
    if !(0..UNITS.len() as i32).contains(&kind) || !has_kits(kind as u16) || !(0..=KITS as i32).contains(&k) {
        return;
    }
    if let Some(kit) = kits_mut(w, p, kind as u16) {
        kit.active = k as u8;
    }
}

/// Équipement de production d'un type d'unité : son gabarit, limité aux recherches acquises (0 : aucun).
pub fn active(w: &World, p: u8, kind: u16) -> u32 {
    let Some(kit) = kits_of(w, p, kind).filter(|k| k.active > 0) else { return 0 };
    let set = kit.sets.get(kit.active as usize - 1).copied().unwrap_or(0);
    let mut v = 0;
    for k in 0..3u8 {
        let m = at(set as u64, k);
        if m != 0 && w.players[p as usize].has_tech(MODS[m as usize].tech) {
            v |= (m as u32) << (8 * k as u32);
        }
    }
    v
}

fn list(set: u32) -> impl Iterator<Item = u8> {
    (0..3u8).map(move |k| at(set as u64, k)).filter(|&m| m != 0)
}

/// Composants d'un gabarit, additionnés, et relevés.
fn cost(set: u32) -> (Vec<(u8, u16)>, i32) {
    let mut v: Vec<(u8, u16)> = Vec::new();
    let mut rel = 0;
    for m in list(set) {
        let d = &MODS[m as usize];
        rel += d.releves as i32;
        for &(it, n) in d.cost {
            match v.iter_mut().find(|c| c.0 == it) {
                Some(c) => c.1 += n,
                None => v.push((it, n)),
            }
        }
    }
    (v, rel)
}

/// Temps de fabrication en plus (ticks) : la moitié des temps d'installation.
pub fn ticks(set: u32) -> u32 {
    list(set).map(|m| MODS[m as usize].time as u32 * 10).sum()
}

/// Début de fabrication d'une unité au point (x, y) : paie son équipement ; renvoie ce qui est payé (0 : rien).
pub fn begin(w: &mut World, p: u8, x: i32, y: i32, kind: u16) -> u32 {
    let set = active(w, p, kind);
    if set == 0 {
        return 0;
    }
    let (c, rel) = cost(set);
    if w.players[p as usize].purse[RELEVES as usize] < rel || !pay(w, p, x, y, &c) {
        return 0;
    }
    w.players[p as usize].purse[RELEVES as usize] -= rel;
    w.players[p as usize].consumed[RELEVES as usize] += rel as u32;
    set
}

/// Fabrication abandonnée : l'équipement payé est rendu.
pub fn refund(w: &mut World, p: u8, x: i32, y: i32, set: u32) {
    let (c, rel) = cost(set);
    for (it, n) in c {
        crate::drones::refund(w, p, x, y, it, n as u32);
    }
    w.players[p as usize].purse[RELEVES as usize] += rel;
}

/// L'unité `s` sort de l'atelier avec l'équipement `paid` ; ce qui manque à son gabarit s'installera ensuite.
pub fn deliver(w: &mut World, s: usize, paid: u32) {
    let (p, kind) = (w.units.owner[s], w.units.kind[s]);
    if paid != 0 {
        w.units.cold[s].mods = paid as u64;
        applied(w, Host::U(s));
    }
    let want = active(w, p, kind);
    w.units.cold[s].want = if want == paid { 0 } else { want };
}

/// Ordre : les unités de la liste veulent cet équipement (un emplacement à 0 reste comme il est).
pub fn apply(w: &mut World, s: usize, set: u32) {
    let kind = w.units.kind[s];
    if has_kits(kind) {
        w.units.cold[s].want = valid(kind, set);
        tick(w, s);
    }
}

/// L'amélioration de cet emplacement n'est plus voulue (installée ou annulée à la main).
pub fn forget(w: &mut World, s: usize, slot: u8) {
    if slot < 3 {
        w.units.cold[s].want &= !(0xffu32 << (8 * slot as u32));
    }
}

/// De temps en temps, unité qui veut un équipement : installe le prochain qu'elle peut payer.
pub fn tick(w: &mut World, s: usize) {
    if w.units.cold[s].mod_job != 0 {
        return;
    }
    for k in 0..3u8 {
        let m = at(w.units.cold[s].want as u64, k);
        if m == 0 {
            continue;
        }
        match blocked(w, Host::U(s), m) {
            // déjà installée, ou jamais possible
            1 | 3 | 4 => forget(w, s, k),
            0 if install(w, Host::U(s), m) => return,
            _ => {}
        }
    }
}

/// Gabarits d'un joueur (JSON) : [type d'unité, gabarit de production, gabarits…].
pub fn json(w: &World, p: u8) -> String {
    let v: Vec<String> = w.players.get(p as usize).map_or(Vec::new(), |pl| pl.kits.iter().map(|k| format!("[{},{},{},{},{}]", k.kind, k.active, k.sets[0], k.sets[1], k.sets[2])).collect());
    format!("[{}]", v.join(","))
}
