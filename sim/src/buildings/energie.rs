//! Énergie : combustible et générateurs, zones électriques (`rebuild_power`), tick du réseau
//! (`power_tick`), consommation d'un bâtiment (`use_power`), production d'un générateur (géothermie comprise).

use super::*;

// ---------- Réseau électrique ----------

/// Énergie que donne cet objet au générateur `kind` (0 : il ne le brûle pas). Le réacteur à cristal brûle
/// des cellules d'énergie, les autres de l'hydrocarbure ou du carburant.
pub fn fuel_energy(kind: u16, item: u8) -> i32 {
    if bdef(kind).class != BClass::Power || crate::buildings::fuelless(kind) {
        return 0;
    }
    match (kind == B_CRYSTAL_REACTOR, item) {
        (true, ENERGY_CELL) => FUEL_CELL,
        (false, HYDROCARBON) => FUEL_HYDROCARBON,
        (false, FUEL) => FUEL_REFINED,
        _ => 0,
    }
}

/// Objet combustible (hydrocarbure, carburant, cellule d'énergie) : le tapis ou le bras qui le
/// transporte est alimenté par lui et ne s'arrête pas, même hors zone électrique.
#[inline]
pub fn is_fuel(item: u8) -> bool {
    matches!(item, HYDROCARBON | FUEL | ENERGY_CELL)
}

/// Le générateur reçoit du combustible : son alerte est levée quand il est de nouveau bien rempli
/// (et ne sera pas redonnée tant qu'il ne retombe pas à sec).
pub(super) fn refueled(bb: &mut Building) {
    if bb.fuel_alert == 2 {
        bb.fuel_alert = 1;
    }
    if bb.fuel >= fuel_tank(bb.kind) / 2 {
        bb.fuel_alert = 0;
    }
}

/// Réservoir d'un générateur (kW × ticks).
pub fn fuel_tank(kind: u16) -> i32 {
    FUEL_TANK_UNITS * if kind == B_CRYSTAL_REACTOR { FUEL_CELL / 4 } else { FUEL_HYDROCARBON }
}

/// Le bâtiment a-t-il besoin d'électricité ? (un extracteur sur un gisement d'hydrocarbure n'en a pas)
#[inline]
pub fn needs_power(bb: &Building) -> bool {
    bb.def().power_use > 0 && !(bb.def().class == BClass::Extractor && bb.recipe == HYDROCARBON)
}

/// Générateur : un dépôt collé l'alimente depuis son stock (1 unité de combustible par
/// seconde au plus, quand le réservoir a la place), puis il partage son combustible avec les générateurs
/// collés (`share_fuel`) ; il dort le reste du temps.
pub(super) fn tick_generator(w: &mut World, b: usize) {
    w.buildings[b].wake = w.tick + DEPOT_FEED_PERIOD;
    feed_generator_from_depot(w, b);
    let mut twins = [0usize; MAX_TWINS];
    let n = twins_into(w, b, &mut twins);
    if n > 0 {
        share_fuel(w, b, &twins[..n]);
    }
}

pub(super) fn feed_generator_from_depot(w: &mut World, b: usize) {
    let kind = w.buildings[b].kind;
    let depots = touching_depots(w, b);
    if depots.is_empty() {
        return;
    }
    for it in [HYDROCARBON, FUEL, ENERGY_CELL] {
        let e = fuel_energy(kind, it);
        if e <= 0 || w.buildings[b].fuel + e > fuel_tank(kind) {
            continue;
        }
        // le premier dépôt collé (plus petit indice) qui en a
        if let Some(&d) = depots.iter().find(|&&d| crate::drones::has(&w.buildings[d].stash, it) > 0) {
            crate::drones::take(&mut w.buildings[d].stash, it, 1);
            if w.buildings[b].fuel <= 0 {
                w.power_dirty = true;
            }
            w.buildings[b].fuel += e;
            refueled(&mut w.buildings[b]);
            break;
        }
    }
}

/// Puissance que le générateur `b` fournit en ce moment (kW) : sa part de la charge de sa zone.
pub fn gen_output(w: &World, b: usize) -> i32 {
    let bb = &w.buildings[b];
    let Some(n) = w.nets.get(bb.net as usize) else { return 0 };
    if bb.net == 0 || (bb.fuel <= 0 && !crate::buildings::fuelless(bb.kind)) || n.prod <= 0 {
        return 0;
    }
    (gen_prod(w, bb) as i64 * (n.demand.min(n.prod)) as i64 / n.prod as i64) as i32
}

/// Rayon de la zone électrique d'un bâtiment (cases autour de son emprise ; 0 : pas un poteau). Le
/// générateur principal amélioré a une zone plus grande (MAIN_GENERATOR_LEVELS).
pub fn supply_of(bb: &Building) -> i32 {
    if bb.kind == B_MAIN_GENERATOR {
        MAIN_GENERATOR_LEVELS[(bb.level as usize).min(MAIN_GENERATOR_LEVELS.len() - 1)].supply
    } else if crate::ameliorations::fit(bb) == crate::ameliorations::M_GEN_LEAN {
        bb.def().supply + 3
    } else {
        bb.def().supply
    }
}

/// Portée de liaison entre zones (cases, de centre à centre ; la plus petite des deux compte).
pub fn connect_of(bb: &Building) -> i32 {
    if bb.kind == B_MAIN_GENERATOR {
        MAIN_GENERATOR_LEVELS[(bb.level as usize).min(MAIN_GENERATOR_LEVELS.len() - 1)].connect
    } else {
        bb.def().connect
    }
}

/// Plus grand rayon de zone possible, niveaux compris (rayon de recherche des poteaux).
pub fn max_supply() -> i32 {
    let lv = MAIN_GENERATOR_LEVELS.iter().map(|l| l.supply).max().unwrap_or(0);
    BUILDINGS.iter().map(|d| d.supply).max().unwrap_or(0).max(lv)
}

pub fn rebuild_power(w: &mut World) {
    w.power_dirty = false;
    // Souche : réserves des réseaux de racines, partagées entre les nouveaux réseaux (voir souche.rs)
    let pools = crate::souche::old_pools(w);
    let np = w.players.len();
    w.nets.clear();
    w.nets.push(Net::default());
    let mut pole_net: Vec<u16> = vec![0; w.buildings.len()];
    let max_supply = max_supply();
    for owner in 0..np as u8 {
        let poles: Vec<usize> = (0..w.buildings.len())
            .filter(|&i| {
                let b = &w.buildings[i];
                // un générateur sans combustible ne forme plus de zone et ne relie plus ses voisins
                b.alive && b.owner == owner && b.complete() && b.def().supply > 0 && !(b.def().class == BClass::Power && b.fuel <= 0 && !crate::buildings::fuelless(b.kind))
            })
            .collect();
        // union-find
        let mut parent: Vec<usize> = (0..poles.len()).collect();
        fn find(p: &mut [usize], i: usize) -> usize {
            let mut r = i;
            while p[r] != r {
                r = p[r];
            }
            let mut c = i;
            while p[c] != r {
                let n = p[c];
                p[c] = r;
                c = n;
            }
            r
        }
        // Souche : deux poteaux (racines, graines-mères) sont reliés quand ils se touchent par un côté,
        // comme les cases d'un tapis ; recherche locale par la grille (un réseau compte des milliers de racines)
        let souche = w.players[owner as usize].race == RACE_SOUCHE;
        if souche {
            let mut pole_idx: Vec<u32> = vec![0; w.buildings.len()];
            for (i, &pb) in poles.iter().enumerate() {
                pole_idx[pb] = i as u32 + 1;
            }
            for i in 0..poles.len() {
                let a = &w.buildings[poles[i]];
                let (cx, cy) = a.center();
                let (aw, ah) = a.size();
                let mut near: Vec<usize> = Vec::new();
                w.grid.query_buildings(cx, cy, (aw.max(ah) + 3) * TILE, |p| {
                    let j = pole_idx[p] as usize;
                    if j > i + 1 && crate::souche::linked(&w.buildings[poles[i]], &w.buildings[p]) {
                        near.push(j - 1);
                    }
                });
                for j in near {
                    let (ra, rb) = (find(&mut parent, i), find(&mut parent, j));
                    if ra != rb {
                        let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
                        parent[hi] = lo;
                    }
                }
            }
        }
        for i in 0..poles.len() {
            if souche {
                break;
            }
            let (ax, ay) = w.buildings[poles[i]].center();
            let ca = connect_of(&w.buildings[poles[i]]);
            for j in (i + 1)..poles.len() {
                let (bx, by) = w.buildings[poles[j]].center();
                let r = ca.min(connect_of(&w.buildings[poles[j]])) * TILE;
                if crate::fixed::dist2(ax, ay, bx, by) <= (r as i64) * (r as i64) {
                    let (ra, rb) = (find(&mut parent, i), find(&mut parent, j));
                    if ra != rb {
                        let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
                        parent[hi] = lo;
                    }
                }
            }
        }
        // réseau partout (tests, démos) : un réseau illimité pour ce qui n'est dans aucune zone
        let fallback = if w.infinite_grid {
            w.nets.push(Net { sat: 1024, owner, unlimited: true, ..Net::default() });
            (w.nets.len() - 1) as u16
        } else {
            0
        };
        let mut root_net: Vec<u16> = vec![0; poles.len()];
        for i in 0..poles.len() {
            let r = find(&mut parent, i);
            if root_net[r] == 0 {
                w.nets.push(Net { sat: 1024, owner, ..Net::default() });
                root_net[r] = (w.nets.len() - 1) as u16;
            }
            root_net[i] = root_net[r];
        }
        // chaque bâtiment électrique rejoint le réseau du premier poteau (indice le plus bas) dont la zone
        // d'alimentation touche son emprise ; recherche locale par la grille des bâtiments
        for (i, &pb) in poles.iter().enumerate() {
            pole_net[pb] = root_net[i];
        }
        for bi in 0..w.buildings.len() {
            let b = &w.buildings[bi];
            if !b.alive || b.owner != owner {
                continue;
            }
            let def = b.def();
            // les organes de la Souche rejoignent le réseau de leur terreau, même sans électricité
            if def.power_use == 0 && def.power_prod == 0 && def.supply == 0 && def.race != RACE_SOUCHE {
                w.buildings[bi].net = 0;
                continue;
            }
            let (bw, bh) = b.size();
            let (bx, by) = (b.x, b.y);
            let (cx, cy) = b.center();
            let r = (max_supply + bw.max(bh) + 1) * TILE;
            let mut best = usize::MAX;
            w.grid.query_buildings(cx, cy, r, |p| {
                if p >= best || pole_net[p] == 0 {
                    return;
                }
                let pb = &w.buildings[p];
                let (pw, ph) = pb.size();
                let sp = supply_of(pb);
                if bx < pb.x + pw + sp && bx + bw > pb.x - sp && by < pb.y + ph + sp && by + bh > pb.y - sp {
                    best = p;
                }
            });
            // une racine de la Souche garde son propre réseau (reliée par contact, pas par le terreau qui la couvre)
            let net = if souche && pole_net[bi] != 0 {
                pole_net[bi]
            } else if best != usize::MAX {
                pole_net[best]
            } else if let Some(p) = (souche && def.race == RACE_SOUCHE).then(|| crate::soil::pole_for(w, owner, bx, by, bw, bh, |p| pole_net[p] != 0)).flatten() {
                // organe sur l'herbe mangée : le réseau du poteau le plus proche
                pole_net[p]
            } else {
                fallback
            };
            if b.complete() && def.power_prod > 0 && net != 0 && net != fallback {
                // les générateurs de la zone : leur production dépend de leur combustible (power_tick)
                let cap = gen_prod(w, b);
                let n = &mut w.nets[net as usize];
                n.gens.push(bi as u32);
                n.cap += cap;
            }
            w.buildings[bi].net = net;
            if net != 0 {
                w.buildings[bi].wake = 0;
                // les tapis consomment en permanence (ils n'ont pas de tick propre)
                if def.class == BClass::Belt && w.buildings[bi].complete() {
                    w.nets[net as usize].belt_demand += def.power_use;
                }
            }
        }
        for &pb in &poles {
            pole_net[pb] = 0;
        }
    }
    if let Some(old) = pools {
        crate::souche::split_pools(w, old);
    }
}

/// Un tick du réseau : seuls les générateurs qui ont du combustible produisent ; ils brûlent leur part
/// de la charge (au prorata de leur puissance), donc d'autant plus vite que la zone consomme.
pub fn power_tick(w: &mut World) {
    for p in w.players.iter_mut() {
        p.power_prod = 0;
        p.power_use = 0;
    }
    for ni in 1..w.nets.len() {
        let belts = w.nets[ni].belt_demand;
        w.nets[ni].demand_next += belts;
        if w.nets[ni].unlimited {
            let n = &mut w.nets[ni];
            n.demand = n.demand_next;
            n.demand_next = 0;
            n.prod = n.demand;
            n.sat = 1024;
            continue;
        }
        let gens = std::mem::take(&mut w.nets[ni].gens);
        let mut cap = 0i64;
        for &g in &gens {
            let bb = &w.buildings[g as usize];
            if bb.alive && (bb.fuel > 0 || crate::buildings::fuelless(bb.kind)) {
                cap += gen_prod(w, bb) as i64;
            }
        }
        let demand = w.nets[ni].demand_next as i64;
        if cap > 0 && demand > 0 {
            let used = demand.min(cap);
            for &g in &gens {
                let bb = &mut w.buildings[g as usize];
                // la géothermie ne brûle rien
                if bb.alive && bb.fuel > 0 && !crate::buildings::fuelless(bb.kind) {
                    // turbine sobre des Transhumants : moitié moins
                    let lean = crate::ameliorations::fit(bb) == crate::ameliorations::M_GEN_LEAN;
                    let burn = (power_prod_of(bb) as i64 * used / cap / if lean { 2 } else { 1 }).max(1) as i32;
                    bb.fuel = (bb.fuel - burn).max(0);
                    let (owner, kind) = (bb.owner as i32, bb.kind as i32);
                    let (cx, cy) = bb.center();
                    if bb.fuel == 0 {
                        // à sec : sa zone disparaît
                        w.power_dirty = true;
                        if bb.fuel_alert < 2 {
                            bb.fuel_alert = 2;
                            w.ev(EV_FUEL_DRY, owner, cx, cy, kind);
                        }
                    } else if bb.fuel_alert == 0 && (bb.fuel as i64) < burn as i64 * 1200 {
                        // moins d'une minute à cette charge
                        bb.fuel_alert = 1;
                        w.ev(EV_FUEL_LOW, owner, cx, cy, kind);
                    }
                }
            }
        }
        let n = &mut w.nets[ni];
        n.gens = gens;
        n.prod = cap as i32;
        n.demand = demand as i32;
        n.demand_next = 0;
        n.sat = if demand <= 0 { 1024 } else { ((cap * 1024 / demand) as i32).min(1024) };
        let (prod, dem, owner) = (n.prod, n.demand, n.owner as usize);
        if let Some(p) = w.players.get_mut(owner) {
            p.power_prod += prod;
            p.power_use += dem;
        }
    }
}

/// Consomme l'énergie du bâtiment pour ce tick et renvoie la satisfaction (0..1024).
#[inline]
pub fn use_power(w: &mut World, b: usize, amount: i32) -> i32 {
    let n = w.buildings[b].net as usize;
    if n == 0 || n >= w.nets.len() {
        return 0;
    }
    w.nets[n].demand_next += amount;
    w.nets[n].sat
}

/// Production d'un générateur en ce moment (kW) : sa puissance nominale, ou, pour une centrale
/// géothermique, celle de son geyser.
pub fn gen_prod(w: &World, bb: &Building) -> i32 {
    let p = if bb.kind == B_GEOTHERMAL { geo_output(w, bb) } else { power_prod_of(bb) };
    // cadence : un générateur surcadencé produit (et brûle) d'autant plus
    (p as i64 * clock_of(bb) as i64 / 100) as i32
}

/// Générateur sans combustible : centrale géothermique, socle à EPPZ.
#[inline]
pub fn fuelless(kind: u16) -> bool {
    matches!(kind, B_GEOTHERMAL | B_EPPZ_SOCKET | B_ARK_DOCK)
}

/// Période (ticks) de l'ondulation d'un geyser : une minute.
pub const GEO_PERIOD: u32 = 1200;

/// Centrale géothermique : puissance nominale × pureté du geyser, qui ondule de 50 % à 150 % sur une
/// minute (moyenne 100 %), chaque geyser avec son propre décalage.
pub fn geo_output(w: &World, bb: &Building) -> i32 {
    if !bb.complete() || bb.upgrade > 0 {
        return 0;
    }
    let base = bb.def().power_prod as i64 * purity_of(bb) as i64 / 100;
    let t = (w.tick + crate::rng::hash3(bb.x, bb.y, 0x6e0) % GEO_PERIOD) % GEO_PERIOD;
    let half = GEO_PERIOD / 2;
    let tri = if t < half { t } else { GEO_PERIOD - t } as i64;
    (base * (500 + tri * 1000 / half as i64) / 1000) as i32
}

/// Production électrique d'un bâtiment terminé (kW) : niveau d'un générateur amélioré, rien pendant une
/// amélioration, sauf pour le générateur principal qui reste en service pendant son chantier.
pub fn power_prod_of(bb: &Building) -> i32 {
    if bb.upgrade > 0 && bb.kind != B_MAIN_GENERATOR {
        0
    } else if bb.kind == B_GENERATOR {
        GENERATOR_LEVELS[(bb.level as usize).min(GENERATOR_LEVELS.len() - 1)].prod
    } else if crate::ameliorations::fit(bb) == crate::ameliorations::M_GEN_BIG {
        1000
    } else {
        bb.def().power_prod
    }
}
