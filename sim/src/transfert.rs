//! Réseau de transfert des Transhumants (voir docs/spec/races.md) : les bâtiments terminés d'un même joueur
//! transhumant qui se touchent par un côté (même partiellement, pas seulement par un coin) forment un réseau ;
//! tous comptent, poteaux relais et bastion compris, même ceux qui ne produisent ni ne consomment rien (ils
//! servent de chemin). Un objet produit ou stocké dans le réseau va à n'importe quel destinataire du même réseau,
//! comme si les deux étaient collés (transfert direct, jumelles, soute, générateur).
//!
//! - Les réseaux (composantes connexes) sont dérivés : recalculés seulement quand un bâtiment transhumant apparaît
//!   ou disparaît (déploiement, repli, poteau planté, destruction : `mark`), jamais sauvegardés (recalculés au
//!   chargement). Bâtiments par indice croissant ; aucune table de hachage.
//! - Distance dans le réseau : nombre de bâtiments traversés (sauts d'un bâtiment à un voisin collé). À égalité de
//!   priorité, le destinataire le plus proche passe d'abord, puis le plus petit indice (`linked`).
//! - Tant qu'un changement n'a pas été pris en compte (`dirty`), les fonctions retombent sur les voisins collés.

use crate::data::*;
use crate::world::*;

/// Réseaux de transfert des Transhumants (dérivés, jamais sauvegardés).
#[derive(Default)]
pub struct TNets {
    /// à recalculer (un bâtiment transhumant est apparu ou a disparu ; vrai à la création et au chargement)
    pub dirty: bool,
    /// réseau de chaque bâtiment (indice de `members`), NONE : aucun
    pub of: Vec<u32>,
    /// rang de chaque bâtiment dans les membres de son réseau
    pub at: Vec<u32>,
    /// membres de chaque réseau, par indice croissant
    pub members: Vec<Vec<u32>>,
    /// sauts entre deux membres de chaque réseau (n × n, rang × n + rang)
    pub hops: Vec<Vec<u16>>,
}

/// Un bâtiment transhumant apparaît ou disparaît : les réseaux sont à recalculer.
#[inline]
pub fn mark(w: &mut World, kind: u16) {
    if bdef(kind).race == RACE_TRANSH {
        w.tnets.dirty = true;
    }
}

/// Bâtiment qui fait partie d'un réseau de transfert : transhumant, vivant, terminé.
#[inline]
fn member(bb: &Building) -> bool {
    bb.alive && bb.complete() && bb.def().race == RACE_TRANSH
}

/// Recalcule les réseaux s'ils sont à refaire.
pub fn ensure(w: &mut World) {
    if w.tnets.dirty {
        rebuild(w);
    }
}

/// Voisins de `b` dans un réseau : bâtiments transhumants terminés du même joueur collés à une de ses faces, par
/// indice croissant, sans doublon.
fn touching(w: &World, b: usize, out: &mut Vec<u32>) {
    out.clear();
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let mut probe = |x: i32, y: i32| {
        if !w.map.inside(x, y) {
            return;
        }
        let o = w.map.occ[w.map.idx(x, y)];
        if o == 0 || (o - 1) as usize == b {
            return;
        }
        let c = (o - 1) as usize;
        let cb = &w.buildings[c];
        if member(cb) && cb.owner == bb.owner {
            out.push(c as u32);
        }
    };
    for x in bb.x..bb.x + bw {
        probe(x, bb.y - 1);
        probe(x, bb.y + bh);
    }
    for y in bb.y..bb.y + bh {
        probe(bb.x - 1, y);
        probe(bb.x + bw, y);
    }
    out.sort_unstable();
    out.dedup();
}

/// Recalcule toutes les composantes connexes et les sauts entre leurs membres.
pub fn rebuild(w: &mut World) {
    let n = w.buildings.len();
    let mut of = vec![NONE; n];
    let mut at = vec![NONE; n];
    let mut members: Vec<Vec<u32>> = Vec::new();
    let mut hops: Vec<Vec<u16>> = Vec::new();
    let mut adj: Vec<Vec<u32>> = vec![Vec::new(); n];
    let mut tmp = Vec::new();
    let any = w.players.iter().any(|p| p.race == RACE_TRANSH);
    if any {
        for (b, a) in adj.iter_mut().enumerate() {
            if member(&w.buildings[b]) {
                touching(w, b, &mut tmp);
                a.extend_from_slice(&tmp);
            }
        }
        // composantes, depuis le plus petit indice non visité
        for b in 0..n {
            if of[b] != NONE || !member(&w.buildings[b]) {
                continue;
            }
            let id = members.len() as u32;
            let mut comp = vec![b as u32];
            of[b] = id;
            let mut k = 0;
            while k < comp.len() {
                let c = comp[k] as usize;
                k += 1;
                for &o in &adj[c] {
                    if of[o as usize] == NONE {
                        of[o as usize] = id;
                        comp.push(o);
                    }
                }
            }
            comp.sort_unstable();
            for (r, &c) in comp.iter().enumerate() {
                at[c as usize] = r as u32;
            }
            // sauts : un parcours en largeur depuis chaque membre
            let m = comp.len();
            let mut h = vec![u16::MAX; m * m];
            let mut queue: Vec<u32> = Vec::with_capacity(m);
            for r in 0..m {
                let row = &mut h[r * m..(r + 1) * m];
                row[r] = 0;
                queue.clear();
                queue.push(comp[r]);
                let mut q = 0;
                while q < queue.len() {
                    let c = queue[q] as usize;
                    q += 1;
                    let d = row[at[c] as usize];
                    for &o in &adj[c] {
                        let ro = at[o as usize] as usize;
                        if row[ro] == u16::MAX {
                            row[ro] = d.saturating_add(1);
                            queue.push(o);
                        }
                    }
                }
            }
            members.push(comp);
            hops.push(h);
        }
    }
    // les producteurs endormis faute de destinataire se réveillent : leur réseau a pu changer
    for comp in &members {
        for &b in comp {
            let bb = &mut w.buildings[b as usize];
            if matches!(bb.def().class, BClass::Extractor | BClass::Crafter) && !crate::buildings::paused(bb) {
                bb.wake = bb.wake.min(w.tick);
            }
        }
    }
    w.tnets = TNets { dirty: false, of, at, members, hops };
}

/// Réseau du bâtiment `b` (indice de `TNets::members`), s'il est connu.
#[inline]
pub fn net_of(w: &World, b: usize) -> Option<usize> {
    if w.tnets.dirty {
        return None;
    }
    let id = *w.tnets.of.get(b)?;
    (id != NONE && w.buildings[b].alive).then_some(id as usize)
}

/// Membres du réseau de `b` (lui compris), par indice croissant ; vide s'il n'est pas dans un réseau connu.
#[inline]
pub fn members(w: &World, b: usize) -> &[u32] {
    net_of(w, b).map_or(&[], |id| &w.tnets.members[id])
}

/// Nombre de bâtiments du réseau de `b` (1 : seul ; 0 : pas dans un réseau, ou pas encore calculé).
pub fn size(w: &World, b: usize) -> usize {
    net_of(w, b).map_or(0, |id| w.tnets.members[id].len())
}

/// Bâtiments traversés de `a` à `b` (1 : collés) ; u16::MAX s'ils ne sont pas dans le même réseau.
pub fn hops(w: &World, a: usize, b: usize) -> u16 {
    match (net_of(w, a), net_of(w, b)) {
        (Some(x), Some(y)) if x == y => {
            let m = w.tnets.members[x].len();
            w.tnets.hops[x][w.tnets.at[a] as usize * m + w.tnets.at[b] as usize]
        }
        _ => u16::MAX,
    }
}

/// Deux bâtiments du même réseau de transfert ?
#[inline]
pub fn same_net(w: &World, a: usize, b: usize) -> bool {
    matches!((net_of(w, a), net_of(w, b)), (Some(x), Some(y)) if x == y)
}

/// Bâtiments reliés à `b` (son réseau, sans lui), du plus proche (bâtiments traversés) au plus loin, puis par
/// indice croissant. Réseau pas encore calculé : ses voisins collés (`transhumants::glued`).
pub fn linked(w: &World, b: usize) -> Vec<usize> {
    let Some(id) = net_of(w, b) else {
        return if member(&w.buildings[b]) { crate::transhumants::glued(w, b) } else { Vec::new() };
    };
    let mem = &w.tnets.members[id];
    if mem.len() <= 1 {
        return Vec::new();
    }
    let m = mem.len();
    let row = &w.tnets.hops[id][w.tnets.at[b] as usize * m..(w.tnets.at[b] as usize + 1) * m];
    let mut v: Vec<(u16, usize)> = mem.iter().enumerate().filter(|&(_, &c)| c as usize != b).map(|(r, &c)| (row[r], c as usize)).collect();
    v.sort_unstable();
    v.into_iter().map(|(_, c)| c).collect()
}

/// Range `v` (bâtiments) du plus proche de `b` dans son réseau au plus loin, puis par indice croissant ; ce qui
/// n'est pas dans le réseau de `b` (bras, voisins d'une autre race) compte comme collé.
pub fn sort_by_hops(w: &World, b: usize, v: &mut [usize]) {
    if net_of(w, b).is_none() {
        v.sort_unstable();
        return;
    }
    v.sort_unstable_by_key(|&c| {
        let h = hops(w, b, c);
        (if h == u16::MAX { 1 } else { h }, c)
    });
}
