//! Organismes de la Souche, suite (voir docs/spec/races.md) : ce qui se passe au combat et sur le terreau.
//!
//! - Flaques d'acide (`Acid`) : laissées par les vessies qui éclatent, les sporanges, les cracheurs (mutation
//!   Acide) et les organismes morts (mutation Sang acide) ; elles rongent ce qui est ennemi et au sol.
//! - Fouisseur enterré (`buried`), nourrices, Reine enracinée (`rooted`).
//! - Épines (mutation Carapaces d'épines, ronces) : une part des morsures revient à l'agresseur.
//! - Caractères acquis (Mémoire du sang) : les dégâts subis par les organismes d'un joueur sont comptés par
//!   famille d'armes (`Player::scars`) ; la Matrice en fixe une résistance dans l'espèce (`Player::adapt`).
//! - Vitesse des unités au sol sur le terreau (Terreau collant, Racines creuses), d'après le terreau par case
//!   (`World::terreau`, tenu par soil.rs).

use crate::combat::{area_damage, damage_unit};
use crate::data::*;
use crate::fixed::{dist2, TILE};
use crate::souche::{net_at, ORGAN_PERIOD};
use crate::world::*;

/// Flaque d'acide : dégâts `dmg` à chaque ACID_PERIOD aux ennemis au sol de son disque, jusqu'au tick `until`.
#[derive(Clone, Copy, Default)]
pub struct Acid {
    pub x: i32,
    pub y: i32,
    pub r: i32,
    pub owner: u8,
    pub dmg: i32,
    pub until: u32,
}
crate::ser_struct!(Acid { x, y, r, owner, dmg, until });

/// Période des flaques, en ticks, et nombre de flaques au plus (les plus anciennes s'effacent).
pub const ACID_PERIOD: u32 = 10;
pub const MAX_ACID: usize = 200;
/// Événements : flaque [x, y, rayon, joueur | durée en ticks << 8] ; caractère acquis [joueur, famille,
/// nombre, 0] ; cocon qui s'ouvre [x, y, type de l'unité, joueur] ; épave digérée par une panse [x, y, case
/// x de la panse | case y << 16, joueur] ; passage d'un terrier [x, y, x de sortie, y de sortie].
pub const EV_ACID: i32 = 50;
pub const EV_ADAPTED: i32 = 51;
pub const EV_COCOON: i32 = 52;
pub const EV_DIGEST: i32 = 53;
pub const EV_BURROW: i32 = 54;

/// Armes de la Souche qui laissent une flaque.
const W_SPITTER: u8 = 64;
const W_SPORANGIUM: u8 = 82;

#[inline]
fn has(w: &World, p: u8, t: u8) -> bool {
    w.players.get(p as usize).is_some_and(|pl| pl.has_tech(t))
}

// ---------- Flaques d'acide ----------

/// Verse une flaque ; une flaque du même joueur au même endroit est ravivée au lieu d'être doublée.
pub fn spill(w: &mut World, owner: u8, x: i32, y: i32, r: i32, dmg: i32, ticks: u32) {
    let until = w.tick + ticks;
    let near = (r / 2) as i64;
    if let Some(a) = w.acid.iter_mut().find(|a| a.owner == owner && dist2(a.x, a.y, x, y) <= near * near) {
        a.until = a.until.max(until);
        a.dmg = a.dmg.max(dmg);
        a.r = a.r.max(r);
    } else {
        if w.acid.len() >= MAX_ACID {
            w.acid.remove(0);
        }
        w.acid.push(Acid { x, y, r, owner, dmg, until });
    }
    w.ev(EV_ACID, x, y, r, owner as i32 | (ticks as i32) << 8);
}

/// Impact d'une arme de la Souche : la flaque qu'elle laisse.
pub fn spill_from(w: &mut World, weapon: u8, owner: u8, x: i32, y: i32) {
    match weapon {
        W_SPITTER if has(w, owner, T_S_ACID) => spill(w, owner, x, y, 300, 6, 100),
        W_SPORANGIUM => spill(w, owner, x, y, 600, 14, 160),
        _ => {}
    }
}

fn update_acid(w: &mut World) {
    if w.acid.is_empty() || !w.tick.is_multiple_of(ACID_PERIOD) {
        return;
    }
    let tick = w.tick;
    w.acid.retain(|a| a.until > tick);
    w.hit_weapon = W_SPITTER;
    for k in 0..w.acid.len() {
        let a = w.acid[k];
        area_damage(w, a.x, a.y, a.r, a.dmg, a.owner, M_LAND, false);
    }
    w.hit_weapon = 255;
}

/// Vessie qui éclate (elle s'est jetée sur sa cible, ou on l'a tuée) : dégâts de zone et flaque.
pub fn burst(w: &mut World, owner: u8, x: i32, y: i32) {
    let wd = &WEAPONS[W_BURST as usize];
    let dmg = wd.dmg * crate::souche::dmg_mult(w, owner, U_BURSTER) / 100;
    w.hit_weapon = W_BURST;
    area_damage(w, x, y, wd.aoe, dmg, owner, wd.mask, false);
    w.hit_weapon = 255;
    spill(w, owner, x, y, 420, 8, 120);
}

/// Mort d'un organisme au sol (appelée par `combat::kill_unit`) : éclatement d'une vessie, sang acide.
pub fn on_death(w: &mut World, kind: u16, owner: u8, x: i32, y: i32) {
    let d = udef(kind);
    if d.race != RACE_SOUCHE || d.layer == Layer::Air || crate::ponte::is_egg(kind) {
        return;
    }
    if kind == U_BURSTER {
        burst(w, owner, x, y);
    } else if has(w, owner, T_S_ACID_BLOOD) {
        // la flaque grandit avec l'organisme
        spill(w, owner, x, y, d.radius + 160, (5 + d.hp / 300).min(30), 120);
    }
}

// ---------- Fouisseur, dévoreurs, épines ----------

/// Fouisseur enterré : invisible sauf de près ou sous détection, il surgit sur ce qui passe à sa portée.
#[inline]
pub fn buried(w: &World, s: usize) -> bool {
    w.units.kind[s] == U_BURROWER && w.units.cold[s].deployed
}

/// Fouisseur à l'arrêt depuis 3 s, sans ordre ni cible : il s'enterre.
pub fn burrow_step(w: &mut World, s: usize) {
    let still = w.units.px[s] == w.units.x[s] && w.units.py[s] == w.units.y[s];
    let c = &mut w.units.cold[s];
    if c.deployed {
        return;
    }
    if still && c.orders.is_empty() && c.wtarget[0] == NONE {
        c.timer += 1;
        if c.timer >= 60 {
            c.deployed = true;
            c.timer = 0;
        }
    } else {
        c.timer = 0;
    }
}

/// Léviathan et Béhémoth : ce qu'ils tuent les nourrit (un quart des points de vie de la victime).
pub fn devour(w: &mut World, killer: usize, victim_hp: i32) {
    if matches!(w.units.kind[killer], U_LEVIATHAN | U_BEHEMOTH) {
        let max = w.max_hp(killer);
        w.units.hp[killer] = (w.units.hp[killer] + victim_hp / 4).min(max);
    }
}

/// Épines : un tiers du coup d'une morsure revient à celui qui l'a portée (`owner` : joueur mordu).
pub fn thorns(w: &mut World, dmg: i32, owner: u8) {
    if dmg < 3 || !WEAPONS.get(w.hit_weapon as usize).is_some_and(|d| d.proj == Proj::Bite) {
        return;
    }
    let Some(k) = w.unit(w.shooter) else { return };
    if w.team_of(w.units.owner[k]) == w.team_of(owner) {
        return;
    }
    let (shooter, weapon) = (w.shooter, w.hit_weapon);
    w.shooter = NONE;
    w.hit_weapon = 255;
    damage_unit(w, k, dmg / 3, owner);
    w.shooter = shooter;
    w.hit_weapon = weapon;
}

/// Les organismes de ce joueur ont-ils des épines ?
pub fn spiny(w: &World, owner: u8) -> bool {
    has(w, owner, T_S_SPINES)
}

// ---------- Caractères acquis ----------

/// Familles d'armes : cinétique, explosif, énergie, feu, organique.
pub const FAMILIES: usize = 5;
/// Dégâts d'une famille à avoir subis pour que la Matrice puisse la fixer, résistances au plus, coût en ADN
/// de la première (multiplié par 2 puis 3 pour les suivantes), résistance (%).
pub const ADAPT_MIN: u32 = 3000;
pub const ADAPT_MAX: u32 = 3;
pub const ADAPT_COST: i32 = 25;
pub const ADAPT_PCT: i32 = 20;

pub fn family(weapon: u8) -> Option<usize> {
    Some(match WEAPONS.get(weapon as usize)?.proj {
        Proj::Bullet | Proj::Rail => 0,
        Proj::Shell | Proj::Missile | Proj::Bomb | Proj::Torpedo => 1,
        Proj::Beam | Proj::Plasma | Proj::Ion | Proj::Laser | Proj::Blaster => 2,
        Proj::Fire => 3,
        Proj::Bite | Proj::Spit => 4,
    })
}

/// Coup reçu par un organisme : compté dans sa famille, réduit si l'espèce y est devenue résistante.
pub fn adapt_damage(w: &mut World, owner: u8, attacker: u8, dmg: i32) -> i32 {
    let Some(f) = family(w.hit_weapon) else { return dmg };
    let hostile = w.team_of(attacker) != w.team_of(owner);
    let Some(p) = w.players.get_mut(owner as usize) else { return dmg };
    if p.race != RACE_SOUCHE {
        return dmg;
    }
    if hostile && dmg > 0 {
        p.scars[f] = p.scars[f].saturating_add(dmg as u32);
    }
    if p.adapt & (1 << f) != 0 {
        dmg * (100 - ADAPT_PCT) / 100
    } else {
        dmg
    }
}

/// Coût en ADN de la prochaine résistance.
pub fn adapt_cost(p: &Player) -> i32 {
    ADAPT_COST * (p.adapt.count_ones() as i32 + 1)
}

/// Le joueur peut-il fixer cette famille (recherche, dégâts subis, place, ADN, une Matrice poussée) ?
pub fn can_adapt(w: &World, p: u8, f: usize) -> bool {
    let Some(pl) = w.players.get(p as usize) else { return false };
    pl.race == RACE_SOUCHE
        && pl.has_tech(T_S_MEMORY)
        && f < FAMILIES
        && pl.adapt & (1 << f) == 0
        && pl.adapt.count_ones() < ADAPT_MAX
        && pl.scars[f] >= ADAPT_MIN
        && pl.purse[ADN as usize] >= adapt_cost(pl)
        && w.buildings.iter().any(|b| b.alive && b.owner == p && b.kind == B_MATRIX && b.complete())
}

/// Ordre O_ADAPT : fixe la résistance.
pub fn adapt(w: &mut World, p: u8, f: usize) {
    if !can_adapt(w, p, f) {
        return;
    }
    let cost = adapt_cost(&w.players[p as usize]);
    let pl = &mut w.players[p as usize];
    pl.purse[ADN as usize] -= cost;
    pl.consumed[ADN as usize] += cost as u32;
    pl.adapt |= 1 << f;
    let n = pl.adapt.count_ones() as i32;
    w.ev(EV_ADAPTED, p as i32, f as i32, n, 0);
}

/// Fiche d'une Matrice : caractères acquis (JSON).
pub fn adapt_info(w: &World, p: u8) -> String {
    let Some(pl) = w.players.get(p as usize) else { return String::new() };
    format!(
        ",\"adapt\":{{\"known\":{},\"bits\":{},\"scars\":[{},{},{},{},{}],\"min\":{},\"max\":{},\"cost\":{},\"pct\":{}}}",
        pl.has_tech(T_S_MEMORY), pl.adapt, pl.scars[0], pl.scars[1], pl.scars[2], pl.scars[3], pl.scars[4], ADAPT_MIN, ADAPT_MAX, adapt_cost(pl), ADAPT_PCT
    )
}

// ---------- Reine enracinée ----------

/// `UnitCold::pack` d'une Reine qui s'enracine, qui se déracine ; durée de chacun (ticks).
pub const Q_ROOTING: u8 = 3;
pub const Q_UPROOTING: u8 = 4;
pub const Q_TIME: u32 = 60;
/// Sève par seconde qu'une Reine enracinée donne à son réseau ; dégâts qu'elle subit (%) ; dégâts qu'elle
/// fait (%) ; pousse des organes et ponte des couveuses de son réseau (%).
pub const Q_SEVE: i32 = 5;
pub const Q_ARMOR: i32 = 60;
pub const Q_DMG: i32 = 150;
pub const Q_GROW: u32 = 150;
pub const Q_BROOD: u32 = 125;

#[inline]
pub fn rooted(w: &World, s: usize) -> bool {
    w.units.kind[s] == U_QUEEN && w.units.cold[s].deployed
}

/// Réseau sur lequel la Reine `s` se tient (0 : hors de son terreau).
pub fn soil(w: &World, s: usize) -> u16 {
    net_at(w, w.units.owner[s], w.units.x[s] / TILE, w.units.y[s] / TILE)
}

/// Ordre « Enraciner » : s'enracine (sur son terreau) ou se déracine, immobile pendant Q_TIME.
pub fn toggle_root(w: &mut World, s: usize) {
    if w.units.cold[s].pack != 0 {
        return;
    }
    let up = w.units.cold[s].deployed;
    if !up && soil(w, s) == 0 {
        let (x, y, o) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
        w.ev(crate::transhumants::EV_DEPLOY_FAILED, o as i32, x, y, U_QUEEN as i32);
        return;
    }
    crate::units::clear_orders(w, s);
    uproot(w, s, up);
}

/// Lance l'enracinement, ou le déracinement (`up`).
pub fn uproot(w: &mut World, s: usize, up: bool) {
    let c = &mut w.units.cold[s];
    c.pack = if up { Q_UPROOTING } else { Q_ROOTING };
    c.ready_tick = w.tick + Q_TIME;
}

/// Reine qui s'enracine ou se déracine : immobile et sans arme. Renvoie vrai tant que cela dure.
pub fn tick_queen(w: &mut World, s: usize) -> bool {
    let c = &mut w.units.cold[s];
    if w.tick < c.ready_tick {
        return true;
    }
    c.deployed = c.pack == Q_ROOTING;
    c.pack = 0;
    false
}

/// Réseau que nourrit la Reine enracinée du joueur (0 : aucun).
pub fn queen_net(w: &World, p: u8) -> u16 {
    let Some(s) = w.players.get(p as usize).and_then(|pl| w.unit(pl.commander)) else { return 0 };
    if rooted(w, s) {
        soil(w, s)
    } else {
        0
    }
}

// ---------- Vitesse sur le terreau ----------

/// Vitesse d'une unité au sol selon le terreau sous elle : collant pour les ennemis (Terreau collant),
/// porteur pour les organismes de son joueur (Racines creuses).
pub fn speed(w: &World, s: usize, speed: i32) -> i32 {
    if w.terreau.is_empty() {
        return speed;
    }
    let d = udef(w.units.kind[s]);
    if !matches!(d.layer, Layer::Land | Layer::Hover) {
        return speed;
    }
    let (tx, ty) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
    if !w.map.inside(tx, ty) {
        return speed;
    }
    let m = w.terreau[w.map.idx(tx, ty)];
    if m == 0 {
        return speed;
    }
    let o = w.units.owner[s];
    let team = w.team_of(o);
    for p in 0..w.players.len().min(8) as u8 {
        if m & (1 << p) != 0 && w.team_of(p) != team && has(w, p, T_S_STICKY) {
            return (speed * 65 / 100).max(1);
        }
    }
    if o < 8 && m & (1 << o) != 0 && (d.bio || crate::souche::is_beast(w.units.kind[s])) && has(w, o, T_S_ROOTWAYS) {
        return speed * 6 / 5;
    }
    speed
}

// ---------- Tick ----------

/// Rayon (cases) autour d'une nourrice où les organismes guérissent comme sur le terreau.
pub const NURSE_R: i32 = 5;

/// Organismes à portée d'une nourrice de leur joueur (par unité).
fn nursed(w: &World) -> Vec<bool> {
    let mut out = Vec::new();
    for s in 0..w.units.alive.len() {
        if w.units.kind[s] != U_NURSE || !w.units.alive[s] || w.units.cold[s].carried_by != NONE {
            continue;
        }
        if out.is_empty() {
            out = vec![false; w.units.alive.len()];
        }
        let (x, y, o) = (w.units.x[s], w.units.y[s], w.units.owner[s]);
        let r = NURSE_R * TILE;
        let units = &w.units;
        w.grid.fine.query(x, y, r, |t| {
            if units.alive[t] && units.owner[t] == o && dist2(x, y, units.x[t], units.y[t]) <= (r as i64).pow(2) {
                out[t] = true;
            }
        });
    }
    out
}

/// Organismes de la Souche, une fois par tick : flaques ; toutes les ORGAN_PERIOD ticks, guérison (terreau,
/// nourrice, sous terre) et Reine enracinée.
pub fn update_units(w: &mut World) {
    update_acid(w);
    if !w.tick.is_multiple_of(ORGAN_PERIOD) || !w.players.iter().any(|p| p.race == RACE_SOUCHE) {
        return;
    }
    let nursed = nursed(w);
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.cold[s].carried_by != NONE {
            continue;
        }
        let owner = w.units.owner[s];
        // organismes, et bêtes apprivoisées (nids greffés)
        let kind = w.units.kind[s];
        if !(udef(kind).bio || crate::souche::is_beast(kind)) || !crate::souche::is_souche(w, owner) {
            continue;
        }
        let root = rooted(w, s);
        if root {
            let net = soil(w, s);
            crate::souche::feed(w, owner, net, Q_SEVE, 0);
        }
        let max = w.max_hp(s);
        if w.units.hp[s] >= max || w.units.hp[s] <= 0 {
            continue;
        }
        let quick = has(w, owner, T_S_QUICK_SAP);
        let (x, y) = (w.units.x[s] / TILE, w.units.y[s] / TILE);
        let home = nursed.get(s).copied().unwrap_or(false) || buried(w, s) || net_at(w, owner, x, y) != 0;
        let mut pct = match (home, quick) {
            (true, true) => 4,
            (true, false) => 2,
            (false, true) => 1,
            (false, false) => 0,
        };
        if root {
            pct *= 2;
        }
        if pct > 0 {
            w.units.hp[s] = (w.units.hp[s] + (max * pct / 100).max(1)).min(max);
        }
    }
}
