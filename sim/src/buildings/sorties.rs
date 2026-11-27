//! Sorties d'un bâtiment et bras : bras qui s'y servent (`takers_of`), sorties (bras, tapis de sortie,
//! voisins collés : `outlets_of`), tour de rôle entre elles (`next_outlet`, `share_turn`), pose des
//! produits sans bras (`push_out`), tick des bras (`tick_inserter`).

use super::*;

/// Rotation d'un bras en quarts de tour (1, 2 ou 3 ; 2 par défaut).
#[inline]
pub fn arm_turn(bb: &Building) -> u8 {
    if (1..=3).contains(&bb.turn) {
        bb.turn
    } else {
        2
    }
}

/// Case de prise et case de dépose d'un bras (à `reach` cases). Il dépose devant lui ; il prend derrière
/// (demi-tour), à sa droite (quart de tour) ou à sa gauche (trois quarts de tour).
pub fn arm_ends(bb: &Building) -> ((i32, i32), (i32, i32)) {
    let (dx, dy) = DIRS[(bb.dir & 3) as usize];
    let (px, py) = DIRS[((bb.dir + arm_turn(bb)) & 3) as usize];
    let r = bb.def().reach.max(1) as i32;
    ((bb.x + px * r, bb.y + py * r), (bb.x + dx * r, bb.y + dy * r))
}

/// Portée maximale des bras (cases) : pourtour à examiner autour d'un bâtiment pour trouver ses bras.
pub(super) const ARM_REACH_MAX: i32 = 2;

/// Bras qui se servent au bâtiment `sb` (leur case de prise est dans son emprise), par indice croissant.
pub fn takers_of(w: &World, sb: usize) -> Vec<usize> {
    let bb = &w.buildings[sb];
    let (bw, bh) = bb.size();
    let inside = |x: i32, y: i32| x >= bb.x && x < bb.x + bw && y >= bb.y && y < bb.y + bh;
    let mut v = Vec::new();
    let r = ARM_REACH_MAX;
    for ty in bb.y - r..bb.y + bh + r {
        for tx in bb.x - r..bb.x + bw + r {
            if inside(tx, ty) || !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let c = (o - 1) as usize;
            let cb = &w.buildings[c];
            if !cb.alive || cb.def().class != BClass::Inserter || !cb.complete() {
                continue;
            }
            let ((sx, sy), _) = arm_ends(cb);
            if inside(sx, sy) {
                v.push(c);
            }
        }
    }
    v.sort_unstable();
    v
}

/// Bâtiments qui reçoivent directement les produits d'un voisin collé (transfert direct, sans bras).
fn direct_receiver(c: BClass) -> bool {
    matches!(c, BClass::Depot | BClass::Warehouse | BClass::Station | BClass::CargoPad | BClass::Crafter | BClass::Lab | BClass::Factory | BClass::Silo | BClass::AntiMissile | BClass::Power)
}

/// Bâtiments qui donnent directement leurs produits à un voisin collé.
fn direct_giver(c: BClass) -> bool {
    matches!(c, BClass::Crafter | BClass::Extractor)
}

/// La case (x, y) touche-t-elle une face du rectangle (bx, by, bw, bh) (case voisine d'un bord, hors coins) ?
pub(super) fn on_face(bx: i32, by: i32, bw: i32, bh: i32, x: i32, y: i32) -> bool {
    ((x == bx - 1 || x == bx + bw) && y >= by && y < by + bh) || ((y == by - 1 || y == by + bh) && x >= bx && x < bx + bw)
}

/// Le voisin collé `c` peut-il recevoir directement l'objet `it` de `sb` ? Même propriétaire, et un
/// fabricant ne reçoit d'un autre fabricant que les ingrédients de sa recette en cours (pas de
/// changement de recette par simple contact : deux fonderies de fer côte à côte restent de fer).
fn direct_ok(w: &World, sb: usize, c: usize, it: u8) -> bool {
    let (sbb, cb) = (&w.buildings[sb], &w.buildings[c]);
    if cb.owner != sbb.owner || !accepts(w, c, it) {
        return false;
    }
    if cb.def().class == BClass::Crafter && sbb.def().class == BClass::Crafter {
        return cb.recipe != RECIPE_NONE && RECIPES[cb.recipe as usize].inputs.iter().any(|x| x.0 == it);
    }
    true
}

/// Sorties d'un bâtiment, par indice croissant, en un seul parcours du pourtour :
/// - les bras qui s'y servent ;
/// - pour un bâtiment de fabrication, les tapis qui partent de ses faces (trappes) ;
/// - pour un fabricant ou un extracteur, les bâtiments collés à une face qui reçoivent des objets
///   (transfert direct).
///
/// Elles reçoivent ses produits à tour de rôle, selon leur part (voir `next_outlet`).
pub fn outlets_of(w: &World, sb: usize) -> Vec<usize> {
    let bb = &w.buildings[sb];
    let (bw, bh) = bb.size();
    let belts_too = bb.def().class == BClass::Crafter;
    let direct = direct_giver(bb.def().class);
    let inside = |x: i32, y: i32| x >= bb.x && x < bb.x + bw && y >= bb.y && y < bb.y + bh;
    let mut v = Vec::new();
    let r = ARM_REACH_MAX;
    for ty in bb.y - r..bb.y + bh + r {
        for tx in bb.x - r..bb.x + bw + r {
            if inside(tx, ty) || !w.map.inside(tx, ty) {
                continue;
            }
            let o = w.map.occ[w.map.idx(tx, ty)];
            if o == 0 {
                continue;
            }
            let c = (o - 1) as usize;
            let cb = &w.buildings[c];
            if !cb.alive || !cb.complete() {
                continue;
            }
            match cb.def().class {
                BClass::Inserter => {
                    let ((sx, sy), _) = arm_ends(cb);
                    if inside(sx, sy) {
                        v.push(c);
                    }
                }
                BClass::Belt if belts_too => {
                    // tapis contre une face (pas un coin), tourné vers l'extérieur
                    let face = if tx == bb.x - 1 && ty >= bb.y && ty < bb.y + bh {
                        2
                    } else if tx == bb.x + bw && ty >= bb.y && ty < bb.y + bh {
                        0
                    } else if ty == bb.y - 1 && tx >= bb.x && tx < bb.x + bw {
                        3
                    } else if ty == bb.y + bh && tx >= bb.x && tx < bb.x + bw {
                        1
                    } else {
                        255
                    };
                    if face != 255 && belts::takes_from_face(w, c, face) {
                        v.push(c);
                    }
                }
                cl if direct && c != sb && direct_receiver(cl) && cb.owner == bb.owner && on_face(bb.x, bb.y, bw, bh, tx, ty) => v.push(c),
                _ => {}
            }
        }
    }
    // Transhumants : tout le réseau de transfert reçoit, comme s'il était collé ; du plus proche au plus loin
    if direct && crate::transfert::members(w, sb).len() > 1 {
        for &c in crate::transfert::members(w, sb) {
            let c = c as usize;
            if c != sb && direct_receiver(w.buildings[c].def().class) {
                v.push(c);
            }
        }
        v.sort_unstable();
        v.dedup();
        crate::transfert::sort_by_hops(w, sb, &mut v);
        return v;
    }
    v.sort_unstable();
    v.dedup();
    v
}

/// Le bâtiment `b` a-t-il une sortie sans bras : tapis de sortie (fabricant) ou voisin collé qui reçoit
/// des objets ? Test rapide (cases des faces seulement) avant le calcul complet des sorties.
fn has_direct_outlet(w: &World, b: usize) -> bool {
    let bb = &w.buildings[b];
    let class = bb.def().class;
    if !direct_giver(class) {
        return false;
    }
    let (bw, bh) = bb.size();
    let probe = |x: i32, y: i32, d: u8| -> bool {
        if !w.map.inside(x, y) {
            return false;
        }
        let o = w.map.occ[w.map.idx(x, y)];
        if o == 0 || (o - 1) as usize == b {
            return false;
        }
        let tb = &w.buildings[(o - 1) as usize];
        if !tb.alive || !tb.complete() {
            return false;
        }
        let tc = tb.def().class;
        (tc == BClass::Belt && class == BClass::Crafter && belts::takes_from_face(w, (o - 1) as usize, d)) || (direct_receiver(tc) && tb.owner == bb.owner)
    };
    (bb.x..bb.x + bw).any(|x| probe(x, bb.y - 1, 3) || probe(x, bb.y + bh, 1))
        || (bb.y..bb.y + bh).any(|y| probe(bb.x - 1, y, 2) || probe(bb.x + bw, y, 0))
        // Transhumants : un destinataire n'importe où dans le réseau de transfert
        || crate::transfert::members(w, b).iter().any(|&c| c as usize != b && direct_receiver(w.buildings[c as usize].def().class))
}

/// Poids des sorties (millièmes de %) : les parts réglées des bras, puis le reste à égalité entre les
/// sorties en automatique (bras sans réglage et tapis).
pub fn share_weights(w: &World, takers: &[usize]) -> Vec<u64> {
    let explicit: u64 = takers.iter().map(|&c| w.buildings[c].share as u64).sum();
    let autos = takers.iter().filter(|&&c| w.buildings[c].share == 0).count() as u64;
    let rest = 100_000u64.saturating_sub(explicit * 1000);
    takers
        .iter()
        .map(|&c| {
            let s = w.buildings[c].share as u64;
            if s > 0 {
                s * 1000
            } else {
                (rest / autos.max(1)).max(1)
            }
        })
        .collect()
}

const SHARE_STRIDE: u64 = 1 << 32;

/// Stock où un bras choisit parmi plusieurs objets (dépôt, entrepôt d'équipe, gare, héliport), par
/// opposition au fabricant et à l'extracteur, qui n'ont qu'un produit.
fn is_stock(c: BClass) -> bool {
    matches!(c, BClass::Depot | BClass::Warehouse | BClass::Station | BClass::CargoPad)
}

/// Le stock `sb` a-t-il en sortie un objet que `want` accepte ? Même choix que `take_output`, sans rien
/// prendre : les objets en sortie d'un dépôt (filtrés, ou tout son stock), l'objet choisi d'un entrepôt,
/// les objets reçus d'une gare.
fn offers(w: &World, sb: usize, want: &dyn Fn(u8) -> bool) -> bool {
    let bb = &w.buildings[sb];
    match bb.def().class {
        BClass::Warehouse | BClass::Station | BClass::CargoPad => crate::logistics::offers(w, sb, want),
        BClass::Depot if bb.filters.is_empty() => (1..NUM_ITEMS as u8).any(|it| crate::drones::has(&bb.stash, it) > 0 && want(it)),
        BClass::Depot => bb.filters.iter().any(|&it| it != 0 && crate::drones::has(&bb.stash, it) > 0 && want(it)),
        _ => false,
    }
}

/// Le bras `c` est-il prêt à prendre à sa source `sb` (main vide, au repos, cible qui accepte l'objet ;
/// sans courant, seulement du combustible) ? `it` : le produit de la source, 0 si elle n'en a pas
/// d'unique. Autour d'un stock (`is_stock`), le bras n'est prêt que si le stock a en sortie un objet que
/// sa cible accepte : sinon il ne prendrait pas son tour et bloquerait les autres bras du stock.
fn taker_ready(w: &World, sb: usize, c: usize, it: u8) -> bool {
    let cb = &w.buildings[c];
    if cb.phase != 0 || cb.hand != 0 {
        return false;
    }
    let (_, (tx, ty)) = arm_ends(cb);
    if !w.map.inside(tx, ty) {
        return false;
    }
    let o = w.map.occ[w.map.idx(tx, ty)];
    if o == 0 {
        return false;
    }
    let t = (o - 1) as usize;
    if !w.buildings[t].complete() {
        return false;
    }
    let belt = w.buildings[t].def().class == BClass::Belt;
    let powered = arm_powered(w, c);
    let takes = |i: u8| (powered || is_fuel(i)) && (belt || accepts(w, t, i));
    if it != 0 {
        takes(it)
    } else if is_stock(w.buildings[sb].def().class) {
        offers(w, sb, &takes)
    } else {
        // fabricant ou extracteur sans produit pour l'instant : le bras garde son tour, et ceux qui
        // attendent derrière lui reviennent le réveiller (voir `share_turn`)
        powered
    }
}

/// Satisfaction électrique minimale (sur 1024) pour qu'un bras travaille.
const ARM_MIN_SAT: i32 = 256;

/// Le bras `c` a-t-il assez de courant pour travailler (même seuil que `tick_inserter`) ?
fn arm_powered(w: &World, c: usize) -> bool {
    let n = w.buildings[c].net as usize;
    n != 0 && n < w.nets.len() && w.nets[n].sat >= ARM_MIN_SAT
}

/// La sortie `c` de `sb` (bras, tapis ou voisin collé) peut-elle recevoir l'objet `it` maintenant (0 : un
/// objet en sortie de `sb`, quel qu'il soit) ? Un bras sans courant ne compte pas, sauf pour du
/// combustible : il ne prendrait jamais son tour et bloquerait les autres sorties.
pub(super) fn outlet_ready(w: &World, sb: usize, c: usize, it: u8) -> bool {
    match w.buildings[c].def().class {
        BClass::Belt => belts::belt_has_room(w, c),
        BClass::Inserter => taker_ready(w, sb, c, it),
        _ => direct_ok(w, sb, c, it),
    }
}

/**
 * Tour de rôle (ordonnancement à pas pondérés) entre les sorties de `sb` (bras et tapis) : parmi
 * celles qui sont prêtes (et `me`, qui l'est), celle dont le compteur est le plus bas reçoit l'objet ;
 * son compteur avance de STRIDE / poids. Une sortie restée inactive repart du temps virtuel de la
 * source (pas de crédit accumulé). Autour d'un stock (dépôt, entrepôt, gare), un bras n'est prêt que
 * s'il a quelque chose à y prendre (`taker_ready`) : celui dont la cible ne veut rien du stock laisse
 * passer les autres.
 * Renvoie la sortie choisie et son pas (0 : sortie unique).
 */
fn next_outlet(w: &World, sb: usize, outs: &[usize], me: Option<usize>) -> Option<(usize, u64)> {
    let it = output_of(&w.buildings[sb]);
    if outs.len() <= 1 {
        return outs.first().filter(|&&c| Some(c) == me || outlet_ready(w, sb, c, it)).map(|&c| (c, 0));
    }
    let weights = share_weights(w, outs);
    let v = w.buildings[sb].vpass;
    let mut best: Option<(usize, u64, u64)> = None;
    for (i, &c) in outs.iter().enumerate() {
        // le compteur d'abord : une sortie qui ne passerait pas devant n'a pas à être examinée
        let k = w.buildings[c].pass.max(v);
        if best.is_some_and(|(_, bk, _)| k >= bk) {
            continue;
        }
        if Some(c) == me || outlet_ready(w, sb, c, it) {
            best = Some((c, k, SHARE_STRIDE / weights[i]));
        }
    }
    best.map(|(c, _, st)| (c, st))
}

/// La sortie `c` de `sb` vient de recevoir un objet : son compteur avance de `stride`.
fn advance_outlet(w: &mut World, sb: usize, c: usize, stride: u64) {
    if stride == 0 {
        return;
    }
    let v = w.buildings[sb].vpass;
    let start = w.buildings[c].pass.max(v);
    w.buildings[c].pass = start + stride;
    w.buildings[sb].vpass = start;
}

/**
 * Tour du bras `me` sur sa source `sb` : renvoie son pas s'il peut prendre, sinon None après avoir
 * réveillé la sortie prioritaire (un autre bras, ou la source elle-même si c'est un de ses tapis ou
 * un voisin collé : c'est elle qui les sert).
 */
fn share_turn(w: &mut World, me: usize, sb: usize) -> Option<u64> {
    let outs = outlets_of(w, sb);
    if outs.len() <= 1 {
        return Some(0);
    }
    match next_outlet(w, sb, &outs, Some(me)) {
        Some((c, st)) if c == me => Some(st),
        Some((c, _)) => {
            let target = if w.buildings[c].def().class == BClass::Inserter { c } else { sb };
            w.buildings[target].wake = 0;
            None
        }
        None => Some(0),
    }
}

/// Part effective d'un bras dans la sortie de sa source (millièmes) et nombre de sorties de cette source
/// (bras, tapis et voisins collés).
pub fn share_info(w: &World, b: usize) -> (u64, usize) {
    let ((sx, sy), _) = arm_ends(&w.buildings[b]);
    if !w.map.inside(sx, sy) {
        return (1000, 1);
    }
    let o = w.map.occ[w.map.idx(sx, sy)];
    if o == 0 || w.buildings[(o - 1) as usize].def().class == BClass::Belt {
        return (1000, 1);
    }
    let takers = outlets_of(w, (o - 1) as usize);
    let Some(mi) = takers.iter().position(|&c| c == b) else { return (1000, 1) };
    let weights = share_weights(w, &takers);
    let total: u64 = weights.iter().sum();
    (weights[mi] * 1000 / total.max(1), takers.len())
}

/// Tapis qui partent d'une face du bâtiment `b` (case voisine d'un bord, tapis tourné vers l'extérieur) :
/// les « trappes de sortie ». Par ordre de case (déterministe).
/// Bâtiment qui dépose ses produits sur les tapis de ses faces (fabricant, dépôt, gare et héliport pour
/// leurs objets reçus).
pub fn feeds_belts(bb: &Building) -> bool {
    bb.alive && bb.complete() && matches!(bb.def().class, BClass::Crafter | BClass::Depot | BClass::Station | BClass::CargoPad)
}

pub fn out_belts(w: &World, b: usize) -> Vec<usize> {
    let bb = &w.buildings[b];
    let (bw, bh) = bb.size();
    let mut v = Vec::new();
    // (case voisine, direction vers l'extérieur) pour chaque case de bord
    let mut probe = |x: i32, y: i32, d: u8| {
        if !w.map.inside(x, y) {
            return;
        }
        let o = w.map.occ[w.map.idx(x, y)];
        if o == 0 {
            return;
        }
        let t = (o - 1) as usize;
        let tb = &w.buildings[t];
        if tb.alive && tb.complete() && tb.def().class == BClass::Belt && belts::takes_from_face(w, t, d) {
            v.push(t);
        }
    };
    for x in bb.x..bb.x + bw {
        probe(x, bb.y - 1, 3);
        probe(x, bb.y + bh, 1);
    }
    for y in bb.y..bb.y + bh {
        probe(bb.x - 1, y, 2);
        probe(bb.x + bw, y, 0);
    }
    v
}

/// Sert la sortie dont c'est le tour quand c'est un tapis de sortie (pose du produit) ou un voisin collé
/// (transfert direct) ; si c'est le tour d'un bras, le réveille. Renvoie vrai si le bâtiment a au moins
/// une sortie sans bras.
pub(super) fn push_out(w: &mut World, b: usize) -> bool {
    let it = output_of(&w.buildings[b]);
    // test rapide d'abord (faces seulement) : la plupart des bâtiments n'ont que des bras
    if it == 0 || !has_direct_outlet(w, b) {
        return false;
    }
    let outs = outlets_of(w, b);
    match next_outlet(w, b, &outs, None) {
        Some((c, st)) if w.buildings[c].def().class == BClass::Belt => {
            if belts::put_on_belt(w, c, it) {
                advance_outlet(w, b, c, st);
                w.buildings[b].out -= 1;
                wake_watchers(w, b);
            }
        }
        Some((c, _)) if w.buildings[c].def().class == BClass::Inserter => w.buildings[c].wake = 0,
        Some((c, st)) => {
            // voisin collé : next_outlet ne le choisit que s'il accepte l'objet (direct_ok)
            insert_item(w, c, it);
            wake_watchers(w, c);
            advance_outlet(w, b, c, st);
            w.buildings[b].out -= 1;
            wake_watchers(w, b);
        }
        None => {}
    }
    true
}

// ---------- Bras ----------
pub(super) const SWING: u16 = 6;

pub(super) fn tick_inserter(w: &mut World, b: usize) {
    let ((sx, sy), (tx, ty)) = arm_ends(&w.buildings[b]);
    if !w.map.inside(sx, sy) || !w.map.inside(tx, ty) {
        w.buildings[b].wake = w.tick + SLEEP;
        return;
    }
    let s = use_power(w, b, w.buildings[b].def().power_use);
    // sans courant, le bras ne manipule que du combustible (le combustible qu'il porte l'alimente)
    let fuel_only = s < ARM_MIN_SAT;
    if fuel_only {
        let bb = &w.buildings[b];
        if matches!(bb.phase, 1 | 2) && !is_fuel(bb.hand) {
            w.buildings[b].wake = w.tick + 10;
            return;
        }
    }
    let to = w.map.occ[w.map.idx(tx, ty)];
    let so = w.map.occ[w.map.idx(sx, sy)];
    match w.buildings[b].phase {
        0 => {
            if to == 0 || so == 0 {
                w.buildings[b].wake = w.tick + 20;
                return;
            }
            let (t, sb) = ((to - 1) as usize, (so - 1) as usize);
            if !w.buildings[t].complete() || !w.buildings[sb].complete() {
                w.buildings[b].wake = w.tick + 20;
                return;
            }
            let mut want = [false; NUM_ITEMS];
            let tclass = w.buildings[t].def().class;
            let mut any = false;
            for (it, slot) in want.iter_mut().enumerate().skip(1) {
                *slot = (tclass == BClass::Belt || accepts(w, t, it as u8)) && (!fuel_only || is_fuel(it as u8));
                any |= *slot;
            }
            if !any && fuel_only {
                // sans courant et rien à brûler à prendre : on réessaie bientôt (le courant peut revenir)
                w.buildings[b].wake = w.tick + 10;
                return;
            }
            if !any {
                watch(w, t, b);
                w.buildings[b].wake = w.tick + SLEEP;
                return;
            }
            let mut stride = 0;
            let got = if w.buildings[sb].def().class == BClass::Belt {
                belts::take_from_belt(w, sb, &|i| want[i as usize])
            } else {
                // plusieurs bras sur la même source : ils se servent à tour de rôle, selon leur part
                match share_turn(w, b, sb) {
                    Some(st) => stride = st,
                    None => {
                        watch(w, sb, b);
                        w.buildings[b].wake = w.tick + 4;
                        return;
                    }
                }
                take_output(w, sb, &want)
            };
            if got != 0 {
                advance_outlet(w, sb, b, stride);
            }
            if got == 0 {
                if w.buildings[sb].def().class == BClass::Belt {
                    w.buildings[b].wake = w.tick + 3;
                } else {
                    watch(w, sb, b);
                    w.buildings[b].wake = w.tick + SLEEP;
                }
                return;
            }
            if w.buildings[sb].def().class != BClass::Belt {
                wake_watchers(w, sb);
            }
            let bb = &mut w.buildings[b];
            bb.hand = got;
            bb.phase = 1;
            bb.timer = SWING;
            bb.working = true;
        }
        1 => {
            let bb = &mut w.buildings[b];
            bb.timer = bb.timer.saturating_sub(1);
            if bb.timer == 0 {
                bb.phase = 2;
            }
        }
        2 => {
            let item = w.buildings[b].hand;
            if push_to(w, tx, ty, item, w.buildings[b].dir) {
                let tick = w.tick;
                let bb = &mut w.buildings[b];
                flow_add(bb, tick, 1);
                bb.hand = 0;
                bb.phase = 3;
                bb.timer = SWING;
            } else if to != 0 && w.buildings[(to - 1) as usize].def().class != BClass::Belt {
                watch(w, (to - 1) as usize, b);
                w.buildings[b].wake = w.tick + SLEEP;
            } else {
                w.buildings[b].wake = w.tick + 3;
            }
        }
        _ => {
            let bb = &mut w.buildings[b];
            bb.timer = bb.timer.saturating_sub(1);
            if bb.timer == 0 {
                bb.phase = 0;
                bb.working = false;
            }
        }
    }
}
