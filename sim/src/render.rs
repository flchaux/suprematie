//! Tampon de rendu (ce qui est visible), données pour les bots et pour l'interface.

use crate::belts::DIRS;
use crate::data::*;
use crate::fixed::TILE;
use crate::world::*;

pub const HEADER: usize = 16;
/// ... + plafond de la réserve (dernier mot)
pub const PLAYER_WORDS: usize = 13 + 4 * NUM_ITEMS + 9;
pub const CARRIER_WORDS: usize = 5;
pub const UNIT_WORDS: usize = 9;
pub const BUILDING_WORDS: usize = 8;

fn player_block(w: &World, out: &mut Vec<i32>) {
    for (i, p) in w.players.iter().enumerate() {
        let prog = if p.research != 0 { p.tech_progress[p.research as usize] as i32 } else { 0 };
        out.extend_from_slice(&[
            p.alive as i32,
            p.team as i32,
            p.researched as u32 as i32,
            (p.researched >> 32) as u32 as i32,
            p.research as i32,
            prog,
            p.power_prod,
            p.power_use,
            p.unit_count as i32,
            p.commander as i32,
            p.kills as i32,
            p.losses as i32,
            p.is_bot as i32,
        ]);
        out.extend(p.stock.iter().copied());
        out.extend(p.produced.iter().map(|&x| x as i32));
        out.extend(p.consumed.iter().map(|&x| x as i32));
        // stock commun de l'équipe (entrepôts)
        match w.team_stock.get(p.team as usize) {
            Some(ts) => out.extend(ts.iter().copied()),
            None => out.extend(std::iter::repeat_n(0, NUM_ITEMS)),
        }
        out.push(p.stock_cap);
        out.push(p.shards as i32);
        out.push(p.eppz as i32);
        // races : race, recherches 64 à 127, réserves des réseaux de la Souche (sève, sels, plafond)
        out.push(p.race as i32);
        out.push(p.researched2 as u32 as i32);
        out.push((p.researched2 >> 32) as u32 as i32);
        let (sv, sl, st) = if p.race == crate::data::RACE_SOUCHE { crate::souche::totals(w, i as u8) } else { (0, 0, 0) };
        out.extend_from_slice(&[sv, sl, st]);
    }
}

fn unit_words(w: &World, s: usize, out: &mut Vec<i32>) {
    let c = &w.units.cold[s];
    let mut flags = c.flags as i32 & 7;
    if c.stun > 0 {
        flags |= 8;
    }
    // déployé ; chenillard des Transhumants en train de se déployer ou de se replier
    if c.deployed || c.pack != 0 {
        flags |= 16;
    }
    if c.shield > 0 && c.shield_down == 0 {
        flags |= 32;
    }
    if c.orders.is_empty() {
        flags |= 64;
    }
    if !c.cargo.is_empty() {
        flags |= 128;
    }
    // bit 27 du mot : camouflé (commando) ; bit 28 : absent des radars ennemis (furtif, brouillé)
    let stealth = (crate::combat::cloaked(w, s) as i32) << 27 | (crate::combat::radar_stealth(w, s) as i32) << 28;
    let aux = match c.orders.first() {
        Some(o) => {
            let (tx, ty) = match *o {
                Order::Move { x, y, .. } | Order::Patrol { x, y, .. } | Order::AttackGround { x, y } | Order::Unload { x, y } | Order::Teleport { x, y } => (x, y),
                Order::Build { kind, x, y, dir, .. } => {
                    let (bw, bh) = crate::buildings::dims(kind, dir);
                    (x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2)
                }
                Order::Attack { target } | Order::Assist { target } | Order::Reclaim { target } | Order::Load { target } | Order::Enter { target } | Order::Collect { target } | Order::Jump { beacon: target } => {
                    w.ref_pos(target).unwrap_or((w.units.x[s], w.units.y[s]))
                }
                Order::Face { .. } => (w.units.x[s], w.units.y[s]),
                Order::Harvest { x, y } => (x * TILE + TILE / 2, y * TILE + TILE / 2),
            };
            ((tx / TILE) & 0xfff) | (((ty / TILE) & 0xfff) << 12) | ((o.code() as i32) << 24)
        }
        None => 0,
    };
    out.extend_from_slice(&[
        w.unit_id(s) as i32,
        w.units.kind[s] as i32 | (w.units.owner[s] as i32) << 8 | flags << 16 | (c.lvl as i32) << 24 | stealth,
        w.units.x[s],
        w.units.y[s],
        w.units.px[s],
        w.units.py[s],
        w.units.facing[s] as i32 | (c.turret as i32) << 16,
        w.units.hp[s],
        aux,
    ]);
}

/// Avancement d'une amélioration en cours, en millièmes (1 à 1000 ; 0 : aucune).
fn upgrade_permille(bb: &Building) -> i32 {
    match (bb.upgrade, crate::buildings::upgrade_spec(bb)) {
        (0, _) | (_, None) => 0,
        (u, Some((_, _, total))) => (1 + (u as u64 - 1) * 999 / total.max(1) as u64) as i32,
    }
}

fn building_words(w: &World, b: usize, out: &mut Vec<i32>) {
    let bb = &w.buildings[b];
    let def = bb.def();
    let mut flags = 0;
    if bb.working {
        flags |= 1;
    }
    let net_ok = bb.net != 0 && w.nets.get(bb.net as usize).is_some_and(|n| n.sat >= 512);
    if crate::buildings::needs_power(bb) && !net_ok {
        flags |= 2;
    }
    if bb.stalled {
        flags |= 4;
    }
    if bb.enabled {
        flags |= 8;
    }
    if bb.stun > 0 {
        flags |= 16;
    }
    // diagnostics pour l'interface : 32 entrée manquante, 64 sortie bloquée, 128 énergie insuffisante
    if bb.complete() {
        match def.class {
            BClass::Crafter if bb.recipe != RECIPE_NONE && !bb.working => {
                let rec = &RECIPES[bb.recipe as usize];
                let on = rec.output.1 as u16;
                let has = rec.inputs.iter().enumerate().all(|(j, x)| bb.inv[j] >= x.1 as u16);
                if bb.out + on > (on * 3).max(4) {
                    flags |= 64;
                } else if !has {
                    flags |= 32;
                }
            }
            BClass::Extractor if bb.out >= 5 => flags |= 64,
            BClass::Lab if !bb.working && w.players.get(bb.owner as usize).is_some_and(|p| p.research != 0) => flags |= 32,
            BClass::Factory if !bb.working && !bb.queue.is_empty() => flags |= 32,
            BClass::Power if bb.fuel <= 0 && !crate::buildings::fuelless(bb.kind) => flags |= 32,
            _ => {}
        }
        if crate::buildings::needs_power(bb) && net_ok && w.nets.get(bb.net as usize).is_some_and(|n| n.sat < 900) {
            flags |= 128;
        }
    }
    let (aux1, aux2) = match def.class {
        BClass::Crafter => {
            let pr = if bb.recipe != RECIPE_NONE && bb.working {
                (bb.progress as u64 * 1000 / (RECIPES[bb.recipe as usize].time as u64 * crate::buildings::RECIPE_SCALE as u64).max(1)) as i32
            } else {
                0
            };
            // recette (bits 0-7), produits en attente (8-23), niveau d'une fonderie (24-25)
            (bb.recipe as i32 | (bb.out as i32 & 0xffff) << 8 | (bb.level as i32) << 24, pr)
        }
        BClass::Factory => {
            let front = bb.queue.first().map(|q| q.0 as i32 + 1).unwrap_or(0);
            let total: i32 = bb.queue.iter().map(|q| q.1 as i32).sum();
            let pr = if let Some(&(k, _)) = bb.queue.first() {
                if bb.working {
                    (bb.progress as u64 * 1000 / (udef(k).build as u64 * 20 * crate::buildings::RECIPE_SCALE as u64).max(1)) as i32
                } else {
                    0
                }
            } else {
                0
            };
            (front | total << 8, pr)
        }
        BClass::Turret => (bb.turret as i32, 0),
        // bras : main, phase, minuterie ; rotation (quarts de tour) dans aux2
        BClass::Inserter => (bb.hand as i32 | (bb.phase as i32) << 8 | (bb.timer as i32) << 16, crate::buildings::arm_turn(bb) as i32),
        BClass::Lab => (bb.tech as i32, (bb.progress / 1024) as i32),
        BClass::Silo | BClass::AntiMissile => (bb.ammo as i32, (bb.progress / 1024) as i32),
        BClass::Orbital => ((bb.charge as u64 * 1000 / (60 * 20 * 1024)) as i32, 0),
        BClass::Shield => (bb.shield, bb.shield_down as i32),
        BClass::Gate => (bb.link as i32, bb.charge as i32),
        // anneaux de transport : montée (ticks restants), recharge
        BClass::Transfer => (bb.charge as i32, bb.cooldown as i32),
        // générateur : niveau (bits 24-25), production actuelle (kW)
        BClass::Power => ((bb.level as i32) << 24, crate::buildings::gen_prod(w, bb)),
        BClass::Extractor => (bb.recipe as i32 | (bb.out as i32 & 0xffff) << 8 | (bb.level as i32) << 24, (bb.progress / 1024) as i32),
        // dépôt : trois premiers objets filtrés (bits 0-23), niveau (bits 24-25) ; quatrième filtre dans aux2
        BClass::Depot => {
            let f = |k: usize| bb.filters.get(k).copied().unwrap_or(0) as i32;
            (f(0) | f(1) << 8 | f(2) << 16 | (bb.level as i32) << 24, f(3))
        }
        // tapis : forme (bits 0-1), montée ou descente (bit 2) vers le niveau des bits 3-4
        BClass::Belt if bb.complete() => {
            let ramp = crate::belts::ramp_to(w, b).map(|f| 4 | (f as i32) << 3).unwrap_or(0);
            (crate::belts::belt_shape(w, b) as i32 | ramp, 0)
        }
        // rail : forme (0 droit, 1 + c virage entre les côtés c et c + 1), d'après les rails voisins
        BClass::Rail => (crate::logistics::rail_shape(w, b) as i32, 0),
        // répartiteur : ses sorties, comme un niveau (modèles splitter_n2 et splitter_n3)
        BClass::Router if bb.kind == B_SPLITTER => ((bb.split as i32) << 24, 0),
        _ => (0, 0),
    };
    out.extend_from_slice(&[
        w.building_ref(b) as i32,
        bb.kind as i32 | (bb.owner as i32) << 8 | (bb.dir as i32) << 16 | flags << 20 | (bb.floor as i32 & 3) << 28,
        bb.x | bb.y << 16,
        bb.hp,
        bb.build as i32,
        aux1,
        aux2,
        // tapis : sa ligne ; autres bâtiments : avancement d'une amélioration en cours (1 à 1000, 0 : aucune)
        if def.class == BClass::Belt { bb.line as i32 } else { upgrade_permille(bb) },
    ]);
}

/// Tampon de rendu pour la zone (en cases) [x0, x1] x [y0, y1].
/// detail : 0 = vue stratégique (pas de tapis ni d'objets), 1 = bâtiments, 2 = tout.
pub fn render(w: &World, x0: i32, y0: i32, x1: i32, y1: i32, detail: i32, player: i32, with_vis: bool) -> Vec<i32> {
    let mut out = vec![0i32; HEADER];
    out[0] = 1;
    out[1] = w.tick as i32;
    out[2] = w.players.len() as i32;
    player_block(w, &mut out);
    // unités : toutes (pour la minicarte et les icônes), sauf les unités ennemies furtives que
    // l'équipe du joueur ne repère pas (commando camouflé, unité brouillée ou furtive vue au seul radar)
    let viewer_team = if player >= 0 && (player as usize) < w.players.len() { Some(w.players[player as usize].team) } else { None };
    let mut nu = 0;
    for s in 0..w.units.alive.len() {
        if w.units.alive[s] && w.units.cold[s].carried_by == NONE {
            if let Some(t) = viewer_team {
                let stealthy = crate::combat::cloaked(w, s) || crate::combat::radar_stealth(w, s);
                if stealthy && w.team_of(w.units.owner[s]) != t && !crate::combat::unit_seen(w, t, s) {
                    continue;
                }
            }
            unit_words(w, s, &mut out);
            nu += 1;
        }
    }
    out[3] = nu;
    // bâtiments dans la zone
    let mut nb = 0;
    let (mx0, my0, mx1, my1) = (x0 - 8, y0 - 8, x1 + 8, y1 + 8);
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if !bb.alive || bb.x < mx0 || bb.y < my0 || bb.x > mx1 || bb.y > my1 {
            continue;
        }
        let small = matches!(bb.def().class, BClass::Belt | BClass::Inserter | BClass::Pylon | BClass::Wall);
        if detail == 0 && small {
            continue;
        }
        building_words(w, b, &mut out);
        nb += 1;
    }
    out[4] = nb;
    // objets sur les tapis
    let mut ni = 0;
    if detail >= 2 {
        for l in &w.belts.lines {
            if !l.alive || l.items.is_empty() {
                continue;
            }
            let n = l.tiles.len() as i32;
            let mut pos = 0;
            for &(it, g) in &l.items {
                pos += g;
                let kf = (pos / TILE).min(n - 1);
                let idx = (n - 1 - kf) as usize;
                let off = pos - kf * TILE;
                let bb = &w.buildings[l.tiles[idx] as usize];
                if bb.x < x0 || bb.y < y0 || bb.x > x1 || bb.y > y1 {
                    continue;
                }
                let (dx, dy) = DIRS[bb.dir as usize];
                let shape = crate::belts::belt_shape(w, l.tiles[idx] as usize);
                let (cx, cy) = if shape == 0 {
                    (bb.x * TILE + TILE / 2 + dx * (TILE / 2 - off), bb.y * TILE + TILE / 2 + dy * (TILE / 2 - off))
                } else {
                    // virage : quart de cercle de rayon 1/2 case autour du coin entre l'entrée latérale
                    // et la sortie ; angle de 0 (entrée) à 90° (sortie) selon l'avancement dans la case
                    let sd = if shape == 1 { (bb.dir as usize + 1) % 4 } else { (bb.dir as usize + 3) % 4 };
                    let (sx, sy) = DIRS[sd];
                    let kx = bb.x * TILE + TILE / 2 + (sx + dx) * TILE / 2;
                    let ky = bb.y * TILE + TILE / 2 + (sy + dy) * TILE / 2;
                    let a = ((TILE - off.clamp(0, TILE)) * 16384 / TILE) as u16;
                    let (c, s) = (w.trig.cos(a), w.trig.sin(a));
                    let r = TILE / 2;
                    (kx - (dx * c + sx * s) * r / 16384, ky - (dy * c + sy * s) * r / 16384)
                };
                // élévation (1/256 de niveau) : niveau du tapis, interpolé sur une case d'ascenseur
                let mut elev = bb.floor as i32 * 256;
                if let Some(g) = crate::belts::ramp_to(w, l.tiles[idx] as usize) {
                    elev += (g as i32 - bb.floor as i32) * 256 * (TILE - off.clamp(0, TILE)) / TILE;
                }
                out.extend_from_slice(&[cx, cy, it as i32 | elev << 8]);
                ni += 1;
            }
        }
    }
    out[5] = ni;
    // projectiles
    let mut np = 0;
    for p in &w.projectiles {
        if p.special == 255 {
            continue;
        }
        out.extend_from_slice(&[p.x0, p.y0, p.tx, p.ty, p.t as i32 | (p.total as i32) << 16, p.weapon as i32 | (p.owner as i32) << 8 | (p.special as i32) << 16]);
        np += 1;
    }
    out[6] = np;
    // événements
    out[7] = (w.events.len() / 5) as i32;
    out.extend_from_slice(&w.events);
    // épaves dans la zone
    let mut nw = 0;
    for wk in &w.wrecks {
        if wk.alive && wk.x / TILE >= mx0 && wk.x / TILE <= mx1 && wk.y / TILE >= my0 && wk.y / TILE <= my1 {
            out.extend_from_slice(&[wk.x, wk.y, wk.size as i32 | (wk.iron + wk.steel) << 8, wk.model as i32 | (wk.rot as i32) << 16]);
            nw += 1;
        }
    }
    out[8] = nw;
    out[9] = w.buildings_version as i32;
    out[10] = w.winner;
    // boucliers
    let mut ns = 0;
    for &(x, y, r, team, rf) in &w.shields {
        let pct = if let Some(u) = w.unit(rf) {
            let d = udef(w.units.kind[u]);
            w.units.cold[u].shield * 100 / d.shield_hp.max(1)
        } else if let Some(b) = w.building(rf) {
            w.buildings[b].shield * 100 / w.buildings[b].def().shield_hp.max(1)
        } else {
            0
        };
        out.extend_from_slice(&[x, y, r, team as i32 | pct << 8]);
        ns += 1;
    }
    out[13] = ns;
    // trains et drones de fret dans la zone
    let mut nc = 0;
    for (ci, c) in w.carriers.iter().enumerate() {
        if !c.alive || c.x / TILE < mx0 || c.x / TILE > mx1 || c.y / TILE < my0 || c.y / TILE > my1 {
            continue;
        }
        // robots posés dans leur base : invisibles
        if c.kind == 2 && c.state & 1 == 0 {
            continue;
        }
        let moving = (c.state & 1) as i32;
        out.extend_from_slice(&[ci as i32, c.x, c.y, c.kind as i32 | (c.owner as i32) << 8 | moving << 16 | ((c.load > 0) as i32) << 17, c.angle as i32]);
        nc += 1;
    }
    out[14] = nc;
    // vision de l'équipe du joueur
    out[12] = w.vis_w;
    if with_vis && player >= 0 && (player as usize) < w.players.len() {
        let team = w.players[player as usize].team as usize;
        let v = &w.vis[team];
        out[11] = 1;
        for ch in v.chunks(4) {
            let mut word = 0u32;
            for (k, &b) in ch.iter().enumerate() {
                word |= (b as u32) << (k * 8);
            }
            out.push(word as i32);
        }
    } else if with_vis && player < 0 {
        // spectateur : tout est visible
        out[11] = 1;
        for _ in 0..(w.vis_w * w.vis_w / 4) {
            out.push(0x0b0b_0b0b);
        }
    }
    out
}

/// Données pour les bots : toutes les unités et tous les bâtiments (hors tapis).
pub fn bot_dump(w: &World) -> Vec<i32> {
    let mut out = vec![0i32; 8];
    out[0] = w.tick as i32;
    out[1] = w.players.len() as i32;
    player_block(w, &mut out);
    let mut nu = 0;
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] {
            continue;
        }
        let c = &w.units.cold[s];
        out.extend_from_slice(&[
            w.unit_id(s) as i32,
            w.units.kind[s] as i32 | (w.units.owner[s] as i32) << 8,
            w.units.x[s],
            w.units.y[s],
            w.units.hp[s],
            c.orders.first().map(|o| o.code() as i32).unwrap_or(0),
            c.orders.len() as i32,
            (c.carried_by != NONE) as i32 | (c.cargo.len() as i32) << 8,
        ]);
        nu += 1;
    }
    out[2] = nu;
    let mut nb = 0;
    for b in 0..w.buildings.len() {
        let bb = &w.buildings[b];
        if !bb.alive || bb.def().class == BClass::Belt {
            continue;
        }
        let qlen: i32 = bb.queue.iter().map(|q| q.1 as i32).sum();
        out.extend_from_slice(&[
            w.building_ref(b) as i32,
            bb.kind as i32 | (bb.owner as i32) << 8 | (bb.dir as i32) << 16,
            bb.x,
            bb.y,
            bb.hp,
            bb.build as i32,
            bb.working as i32 | (bb.stalled as i32) << 1 | ((bb.net == 0) as i32) << 2 | (bb.ammo as i32) << 8 | ((bb.charge >= 60 * 20 * 1024) as i32) << 3,
            // file (bits 0-15), recette (16-23), niveau (24-27), amélioration en cours (28)
            qlen.min(0xffff) | (bb.recipe as i32) << 16 | (bb.level as i32 & 15) << 24 | ((bb.upgrade > 0) as i32) << 28,
        ]);
        nb += 1;
    }
    out[3] = nb;
    let mut nw = 0;
    for (i, wk) in w.wrecks.iter().enumerate() {
        if wk.alive {
            out.extend_from_slice(&[w.wreck_ref(i) as i32, wk.x, wk.y, wk.iron + wk.steel]);
            nw += 1;
        }
    }
    out[4] = nw;
    out[5] = w.winner;
    out
}

fn js_list<T: std::fmt::Display>(v: impl Iterator<Item = T>) -> String {
    let s: Vec<String> = v.map(|x| x.to_string()).collect();
    format!("[{}]", s.join(","))
}

/// Détails d'un bâtiment pour le panneau de l'interface (JSON).
pub fn info_building(w: &World, r: u32) -> String {
    let Some(b) = w.building(r) else { return "null".into() };
    let bb = &w.buildings[b];
    let sat = w.nets.get(bb.net as usize).map(|n| n.sat).unwrap_or(0);
    let q = js_list(bb.queue.iter().map(|q| format!("[{},{}]", q.0, q.1)));
    // logistique : tampons de gare (à envoyer, reçus), véhicules au départ de ce bâtiment ou y arrivant
    let me = w.building_ref(b);
    let carriers = js_list(w.carriers.iter().filter(|c| c.alive && (c.a == me || c.b == me)).map(|c| {
        let other = if c.a == me { c.b } else { c.a };
        format!("{{\"kind\":{},\"owner\":{},\"state\":{},\"load\":{},\"out\":{},\"other\":{}}}", c.kind, c.owner, c.state, c.load, (c.a == me) as i32, other as i32)
    }));
    let stash = if bb.stash.is_empty() { "[]".to_string() } else { js_list(bb.stash.iter()) };
    // bras : part réglée, part effective (millièmes) et nombre de bras sur la même source
    let (share_eff, takers) = if bb.def().class == crate::data::BClass::Inserter { crate::buildings::share_info(w, b) } else { (1000, 1) };
    // extracteur : débit (dixièmes d'objet par minute) au niveau d'énergie actuel et à pleine puissance
    let (extract_now, extract_max) = if bb.def().class == crate::data::BClass::Extractor {
        let mult = w.players[bb.owner as usize].res_mult.max(0) as u64;
        let per = |s: u64| (1200 * 10 * s * mult / (30 * crate::buildings::RECIPE_SCALE as u64)) as i32;
        // niveau d'amélioration : même multiplicateur que tick_extractor
        let lvl = crate::data::EXTRACTOR_LEVELS[(bb.level as usize).min(crate::data::EXTRACTOR_LEVELS.len() - 1)].speed as u64;
        let purity = crate::buildings::purity_of(bb) as i32;
        let per = |s: u64| per(s) * lvl as i32 / 100 * purity / 100;
        (per(sat.clamp(0, 1024) as u64), per(1024))
    } else {
        (0, 0)
    };
    // usine : dépôts collés qui l'alimentent depuis la réserve
    let depots = if bb.def().class == crate::data::BClass::Factory { crate::buildings::touching_depots(w, b) } else { 0 };
    // machines jumelles (collées, même produit ; générateurs aux mêmes combustibles) qui partagent ingrédients et produits
    let twins = if bb.complete() && matches!(bb.def().class, BClass::Crafter | BClass::Factory | BClass::Lab | BClass::Power) { crate::buildings::twins_of(w, b).len() } else { 0 };
    // nid de la faune : horde, plafond, seuil d'attaque, âge, évolution, pression, chance d'attaque (voir nature::nest_info)
    let nest = if bb.def().class == BClass::Nest { js_list(crate::nature::nest_info(w, b).iter()) } else { "null".to_string() };
    // tapis : ce qui circule sur cette case et sur toute sa file
    let belt = match crate::belts::belt_contents(w, b) {
        Some(c) => format!(
            "{{\"tile\":{},\"line\":{},\"tiles\":{},\"cap\":{},\"jam\":{},\"powered\":{}}}",
            js_list(c.tile.iter()),
            js_list(c.line.iter().map(|(it, n)| format!("[{},{}]", it, n))),
            c.tiles,
            c.tiles * crate::belts::TILE_SLOTS,
            c.jam,
            c.powered
        ),
        None => "null".to_string(),
    };
    format!(
        "{{\"belt\":{},\"nest\":{},\"kind\":{},\"owner\":{},\"hp\":{},\"build\":{},\"recipe\":{},\"inv\":{},\"out\":{},\"queue\":{},\"repeat\":{},\"net\":{},\"sat\":{},\"working\":{},\"link\":{},\"ammo\":{},\"charge\":{},\"enabled\":{},\"shield\":{},\"cooldown\":{},\"tech\":{},\"progress\":{},\"stalled\":{},\"paid\":{},\"stash\":{},\"carriers\":{},\"share\":{},\"shareEff\":{},\"takers\":{},\"extractNow\":{},\"extractMax\":{},\"level\":{},\"upgrade\":{},\"filters\":{},\"depots\":{},\"flow\":{},\"flowMax\":{},\"turn\":{},\"lot\":{},\"fuel\":{},\"fuelTank\":{},\"genOut\":{},\"twins\":{},\"split\":{},\"clock\":{},\"shards\":{},\"clockable\":{},\"clockPower\":{},\"purity\":{},\"ruin\":{}{}}}",
        belt, nest, bb.kind, bb.owner, bb.hp, bb.build, bb.recipe, js_list(bb.inv.iter()), bb.out, q, bb.repeat, bb.net, sat, bb.working, bb.link as i32, bb.ammo, bb.charge, bb.enabled, bb.shield, bb.cooldown, bb.tech, bb.progress, bb.stalled, js_list(bb.paid.iter()), stash, carriers, bb.share, share_eff, takers, extract_now, extract_max, bb.level, upgrade_permille(bb), js_list(bb.filters.iter()), depots, crate::buildings::flow_per_min(bb, w.tick), crate::buildings::flow_max(w, b), crate::buildings::arm_turn(bb), bb.lot, bb.fuel, crate::buildings::fuel_tank(bb.kind), crate::buildings::gen_output(w, b), twins, bb.split, crate::buildings::clock_of(bb), bb.shards, crate::buildings::clockable(bb), crate::buildings::clock_power(bb), if bb.def().deposit != 0 { crate::buildings::purity_of(bb) } else { 0 }, crate::nature::ruin_info(w, b), race_info(w, b)
    )
}

/// Zones électriques des joueurs de l'équipe de `player` (vue électrique, mini-carte, pose) :
/// `nets` : [id, joueur, production, demande, puissance installée, satisfaction, combustible total,
/// autonomie en s (-1 : rien ne brûle)] ; `poles` : [x, y, largeur, hauteur, portée d'alimentation,
/// réseau (0 : aucun), genre (0 relais, 1 générateur), combustible en millièmes du réservoir (-1 : relais),
/// joueur, référence, type de bâtiment, portée de liaison]. Portée et liaison suivent le niveau (générateur
/// principal amélioré). Un générateur à sec garde sa portée mais n'a pas de réseau.
pub fn power_zones(w: &World, player: i32) -> String {
    let team = if player >= 0 && (player as usize) < w.players.len() { Some(w.players[player as usize].team) } else { None };
    let mine = |o: u8| team.is_none_or(|t| w.team_of(o) == t);
    let mut nets = Vec::new();
    for (i, n) in w.nets.iter().enumerate().skip(1) {
        if n.unlimited || !mine(n.owner) {
            continue;
        }
        let fuel: i64 = n.gens.iter().map(|&g| w.buildings[g as usize].fuel.max(0) as i64).sum();
        let burn = n.demand.min(n.prod) as i64;
        let autonomy = if burn > 0 { fuel / burn / 20 } else { -1 };
        nets.push(format!("[{},{},{},{},{},{},{},{}]", i, n.owner, n.prod, n.demand, n.cap, n.sat, fuel, autonomy));
    }
    let mut poles = Vec::new();
    for (b, bb) in w.buildings.iter().enumerate() {
        if !bb.alive || !bb.complete() || !mine(bb.owner) {
            continue;
        }
        let def = bb.def();
        let supply = crate::buildings::supply_of(bb);
        if supply == 0 {
            continue;
        }
        let (bw, bh) = bb.size();
        let gen = def.class == BClass::Power;
        let fuel = if crate::buildings::fuelless(bb.kind) { 1000 } else if gen { (bb.fuel.max(0) as i64 * 1000 / crate::buildings::fuel_tank(bb.kind).max(1) as i64) as i32 } else { -1 };
        // un générateur à sec ne forme pas de zone (son réseau éventuel est celui d'un relais voisin)
        let net = if gen && bb.fuel <= 0 && !crate::buildings::fuelless(bb.kind) { 0 } else { bb.net };
        let net = if w.nets.get(net as usize).is_some_and(|n| n.unlimited) { 0 } else { net };
        // rayon et portée de liaison selon le niveau (générateur principal amélioré)
        poles.push(format!("[{},{},{},{},{},{},{},{},{},{},{},{}]", bb.x, bb.y, bw, bh, supply, net, gen as i32, fuel, bb.owner, w.building_ref(b), bb.kind, crate::buildings::connect_of(bb)));
    }
    format!("{{\"nets\":[{}],\"poles\":[{}]}}", nets.join(","), poles.join(","))
}

/// Champs de fiche propres à une race : réserve du réseau (Souche), chenillard et usure (Transhumants).
fn race_info(w: &World, b: usize) -> String {
    match w.buildings[b].def().race {
        crate::data::RACE_SOUCHE => crate::souche::info(w, b),
        crate::data::RACE_TRANSH => crate::transhumants::info(w, b),
        _ => String::new(),
    }
}

pub fn info_unit(w: &World, id: u32) -> String {
    let Some(s) = w.unit(id) else { return "null".into() };
    let c = &w.units.cold[s];
    format!(
        "{{\"kind\":{},\"owner\":{},\"hp\":{},\"shield\":{},\"orders\":{},\"cargo\":{},\"deployed\":{},\"ready\":{},\"children\":{},\"xp\":{},\"lvl\":{},\"maxHp\":{},\"cloaked\":{},\"radarStealth\":{},\"harvest\":{},\"pack\":{},\"packLeft\":{}}}",
        w.units.kind[s],
        w.units.owner[s],
        w.units.hp[s],
        c.shield,
        js_list(c.orders.iter().map(|o| o.code())),
        js_list(c.cargo.iter()),
        c.deployed,
        c.ready_tick.saturating_sub(w.tick),
        c.children,
        c.xp,
        c.lvl,
        w.max_hp(s),
        crate::combat::cloaked(w, s),
        crate::combat::radar_stealth(w, s),
        harvest_info(w, s),
        c.pack,
        if c.pack != 0 { c.ready_tick.saturating_sub(w.tick) } else { 0 }
    )
}

/// Récolte du commandant (ordre Harvest en tête de file) : {raw, out, x, y, state, progress (‰), cycle (ticks)}
/// ou null. `state` : 0 en route, 1 récolte, 2 combat, 3 réserve pleine (units::HV_*).
fn harvest_info(w: &World, s: usize) -> String {
    let c = &w.units.cold[s];
    let Some(&Order::Harvest { x, y }) = c.orders.first() else { return "null".into() };
    let Some(r) = crate::units::harvest_recipe(w, w.units.owner[s], x, y) else { return "null".into() };
    let need = crate::units::harvest_cycle(r) * 100;
    let mult = w.players[w.units.owner[s] as usize].res_mult.max(1) as u32;
    format!(
        "{{\"raw\":{},\"out\":{},\"x\":{},\"y\":{},\"state\":{},\"progress\":{},\"cycle\":{}}}",
        RECIPES[r].inputs[0].0,
        RECIPES[r].output.0,
        x,
        y,
        c.timer,
        c.work as u64 * 1000 / need.max(1) as u64,
        need / mult
    )
}

pub fn map_info(w: &World) -> Vec<i32> {
    let m = &w.map;
    let mut out = vec![m.w, m.h, m.water_level as i32, m.starts.len() as i32];
    for &(x, y) in &m.starts {
        out.push(x);
        out.push(y);
    }
    out.push(m.spots.len() as i32);
    for s in &m.spots {
        out.extend_from_slice(&[s.kind as i32, s.x, s.y]);
    }
    // pureté de chaque gisement (% du rendement normal), dans le même ordre
    for s in &m.spots {
        out.push(if s.purity == 0 { 100 } else { s.purity as i32 });
    }
    out
}

/// Position visée par un ordre (sous-unités), si elle existe encore.
fn order_point(w: &World, o: &Order) -> Option<(i32, i32)> {
    match *o {
        Order::Move { x, y, .. } | Order::Patrol { x, y, .. } | Order::AttackGround { x, y } | Order::Unload { x, y } | Order::Teleport { x, y } => Some((x, y)),
        Order::Build { kind, x, y, dir, .. } => {
            let (bw, bh) = crate::buildings::dims(kind, dir);
            Some((x * TILE + bw * TILE / 2, y * TILE + bh * TILE / 2))
        }
        Order::Attack { target } | Order::Assist { target } | Order::Reclaim { target } | Order::Load { target } | Order::Enter { target } | Order::Collect { target } => w.ref_pos(target),
        Order::Jump { beacon } => w.ref_pos(beacon),
        Order::Face { .. } => None,
        Order::Harvest { x, y } => Some((x * TILE + TILE / 2, y * TILE + TILE / 2)),
    }
}

/// Files d'ordres des unités demandées (affichage avec Maj) :
/// pour chaque unité vivante : identifiant, x, y, nombre d'ordres n, puis n fois (code, x, y).
pub fn unit_orders(w: &World, ids: &[u32]) -> Vec<i32> {
    let mut out = Vec::new();
    for &id in ids.iter().take(400) {
        let Some(s) = w.unit(id) else { continue };
        let pts: Vec<(u8, i32, i32)> = w.units.cold[s].orders.iter().filter_map(|o| order_point(w, o).map(|(x, y)| (o.code(), x, y))).take(32).collect();
        out.extend_from_slice(&[id as i32, w.units.x[s], w.units.y[s], pts.len() as i32]);
        for (c, x, y) in pts {
            out.extend_from_slice(&[c as i32, x, y]);
        }
    }
    out
}

/// Constructions prévues d'un joueur : ordres de construction pas encore commencés (pas de chantier
/// posé), sans doublon. Par bâtiment : type, x, y (cases), direction.
pub fn planned_builds(w: &World, player: i32) -> Vec<i32> {
    let mut list: Vec<(u16, i32, i32, u8)> = Vec::new();
    for s in 0..w.units.alive.len() {
        if !w.units.alive[s] || w.units.owner[s] as i32 != player {
            continue;
        }
        for o in &w.units.cold[s].orders {
            if let Order::Build { kind, x, y, dir, bid } = *o {
                if w.building(bid).is_none() {
                    list.push((kind, x, y, dir & 3));
                }
            }
        }
    }
    // bâtiments détruits à reconstruire
    for g in &w.ghosts {
        if g.owner as i32 == player {
            list.push((g.kind, g.x, g.y, g.dir & 3));
        }
    }
    list.sort_unstable();
    list.dedup();
    list.truncate(2000);
    let mut out = Vec::with_capacity(list.len() * 4);
    for (k, x, y, d) in list {
        out.extend_from_slice(&[k as i32, x, y, d as i32]);
    }
    out
}
