//! Tests de la Souche, suite : organes qui agissent (rhizome, ronce, terrier, panse, sporange, cocon,
//! frayère), racines étrangleuses, terreau collant, Reine enracinée, organismes (vessie, fouisseur,
//! nourrice, dard, dévoreurs), flaques d'acide, caractères acquis, mutations.

use crate::buildings::{complete_building, place_building, rebuild_power, remove_building};
use crate::combat::{damage_building, damage_unit};
use crate::data::*;
use crate::fixed::TILE;
use crate::orders::{O_ADAPT, O_DEPLOY, O_FACTORY_QUEUE, O_MOVE, O_RESEARCH, O_RESEARCH_QUEUE, O_SPECIAL};
use crate::world::*;
use crate::{essaim, souche};

/// Partie Souche (joueur 0) contre Industriels (joueur 1), sans faune, brouillard désactivé.
fn game() -> World {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 0, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    w.place_start_buildings();
    w
}

fn order(w: &mut World, p: i32, cmd: i32, args: &[i32]) {
    let mut o = vec![0, cmd, p];
    o.extend_from_slice(args);
    o[0] = o.len() as i32 - 1;
    w.step(&o);
}

fn steps(w: &mut World, n: u32) {
    for _ in 0..n {
        w.step(&[]);
    }
}

/// Graine-mère du joueur 0, sur un terrain plat et dégagé de `r` cases tout autour ; renvoie (indice, x, y).
fn base(w: &mut World, r: i32) -> (usize, i32, i32) {
    let heart = (0..w.buildings.len()).find(|&b| w.buildings[b].alive && w.buildings[b].kind == B_SEED_HEART).unwrap();
    let (hx, hy) = (w.buildings[heart].x, w.buildings[heart].y);
    let (x0, y0, x1, y1) = (hx - r, hy - r, hx + r + 3, hy + r + 3);
    w.map.spots.retain(|s| !(s.x >= x0 - 2 && s.x <= x1 && s.y >= y0 - 2 && s.y <= y1));
    for y in y0..y1 {
        for x in x0..x1 {
            let i = w.map.idx(x, y);
            w.map.height[i] = 150;
            w.map.cliff[i] = 0;
            w.map.deposit[i] = 0;
            if w.map.occ[i] == 0 {
                w.map.update_pass(x, y);
            }
        }
    }
    w.wear.resize(w.map.spots.len(), 0);
    (heart, hx, hy)
}

/// Pose et termine un bâtiment, réseaux recalculés.
fn put(w: &mut World, owner: u8, kind: u16, x: i32, y: i32) -> usize {
    let b = place_building(w, owner, kind, x, y, 0).unwrap_or_else(|| panic!("{} en ({x}, {y})", bdef(kind).key));
    complete_building(w, b);
    rebuild_power(w);
    b
}

/// File de racines poussées, de (x0, y) vers l'est ou l'ouest (`step` = ±1), `n` cases.
fn roots(w: &mut World, x0: i32, y: i32, step: i32, n: i32) -> Vec<usize> {
    (0..n).map(|k| put(w, 0, B_ROOT, x0 + step * k, y)).collect()
}

fn tech(w: &mut World, t: u8) {
    w.players[0].set_tech(t);
}

fn unit(w: &mut World, kind: u16, owner: u8, tx: i32, ty: i32) -> usize {
    let id = w.spawn_unit(kind, owner, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    slot_of(id)
}

fn fill(w: &mut World, b: usize, seve: i32, sels: i32) {
    let n = w.buildings[b].net as usize;
    w.nets[n].seve = seve;
    w.nets[n].sels = sels;
}

fn seve(w: &World, b: usize) -> i32 {
    w.nets[w.buildings[b].net as usize].seve
}

// ---------- Recherche ----------

/// Les mutations s'excluent deux à deux : celle qui suit demande l'une OU l'autre, pas les deux.
#[test]
fn one_of_two_exclusive_mutations_is_enough_for_the_next() {
    let mut w = game();
    order(&mut w, 0, O_RESEARCH, &[T_S_ACID as i32]);
    assert_eq!(w.players[0].research, 0, "aucune mutation du palier 2");
    tech(&mut w, T_S_SCALES);
    order(&mut w, 0, O_RESEARCH, &[T_S_ACID as i32]);
    assert_eq!(w.players[0].research, T_S_ACID, "Écailles suffit pour Acide");
    // en file : Racines profondes après Acide (en cours), puis Sang acide
    order(&mut w, 0, O_RESEARCH_QUEUE, &[T_S_DEEP_ROOTS as i32]);
    order(&mut w, 0, O_RESEARCH_QUEUE, &[T_S_ACID_BLOOD as i32]);
    order(&mut w, 0, O_RESEARCH_QUEUE, &[T_S_SPINES as i32]);
    assert_eq!(w.players[0].research_queue, vec![T_S_DEEP_ROOTS, T_S_ACID_BLOOD], "Carapaces d'épines est exclue");
    // la file enchaîne
    w.players[0].set_tech(T_S_ACID);
    w.players[0].research = 0;
    w.players[0].start_queued();
    assert_eq!(w.players[0].research, T_S_DEEP_ROOTS);
    // toutes les recherches de la Souche sont atteignables
    let mut have: Vec<u8> = vec![];
    loop {
        let more: Vec<u8> = (1..TECHS.len() as u8)
            .filter(|&t| TECHS[t as usize].race == RACE_SOUCHE && !have.contains(&t) && (TECHS[t as usize].excl == 0 || !have.contains(&TECHS[t as usize].excl)) && crate::races::prereq_ok(t, |q| have.contains(&q)))
            .take(1)
            .collect();
        if more.is_empty() {
            break;
        }
        have.extend(more);
    }
    let all = TECHS.iter().filter(|t| t.race == RACE_SOUCHE).count();
    assert_eq!(have.len(), all - MUTATIONS.len() / 2, "tout l'arbre, moins une mutation de chaque paire");
}

#[test]
fn souche_supply_is_bounded() {
    let m = BUILDINGS.iter().filter(|d| d.race == RACE_SOUCHE).map(|d| d.supply).max().unwrap();
    assert_eq!(m, souche::MAX_SUPPLY);
    for &t in &MUTATIONS {
        let d = &TECHS[t as usize];
        assert!(d.excl != 0 && TECHS[d.excl as usize].excl == t, "{} : choix exclusif réciproque", d.key);
    }
}

// ---------- Organes ----------

#[test]
fn rhizome_is_a_big_pole_linked_by_contact() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 24);
    tech(&mut w, T_S_BRAMBLES);
    assert!(place_building(&mut w, 0, B_RHIZOME, hx + 5, hy, 0).is_none(), "sans contact : refusé");
    let rz = put(&mut w, 0, B_RHIZOME, hx + 3, hy);
    assert_eq!(w.buildings[rz].net, w.buildings[heart].net);
    // son terreau porte loin : un organe à six cases de lui
    let lv = put(&mut w, 0, B_LEAVES, hx + 11, hy);
    assert_eq!(w.buildings[lv].net, w.buildings[heart].net);
    // une racine s'y accroche, pas en diagonale
    assert!(place_building(&mut w, 0, B_ROOT, hx + 5, hy + 2, 0).is_none(), "coin seulement");
    let r = put(&mut w, 0, B_ROOT, hx + 5, hy + 1);
    assert_eq!(w.buildings[r].net, w.buildings[heart].net);
}

#[test]
fn bramble_tears_what_bites_it_and_regrows() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 12);
    tech(&mut w, T_S_BRAMBLES);
    let b = put(&mut w, 0, B_BRAMBLE, hx + 4, hy);
    let foe = unit(&mut w, U_BEAST_M, 1, hx + 5, hy);
    let hp = w.units.hp[foe];
    w.shooter = w.unit_id(foe);
    w.hit_weapon = 56;
    damage_building(&mut w, b, 90, 1);
    assert_eq!(w.units.hp[foe], hp - 30, "un tiers de la morsure revient");
    // un tir ne revient pas
    w.hit_weapon = 4;
    damage_building(&mut w, b, 90, 1);
    assert_eq!(w.units.hp[foe], hp - 30);
    w.shooter = NONE;
    w.hit_weapon = 255;
    w.units.hp[foe] = 0;
    w.dead_units.push(foe as u32);
    let before = w.buildings[b].hp;
    steps(&mut w, 200);
    assert!(w.buildings[b].hp > before, "la ronce repousse");
}

#[test]
fn every_organ_regenerates() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 12);
    let thorn = put(&mut w, 0, B_THORN, hx + 3, hy);
    let brood = put(&mut w, 0, B_BROOD, hx - 4, hy);
    for b in [thorn, brood] {
        w.buildings[b].hp /= 2;
    }
    let h = [w.buildings[thorn].hp, w.buildings[brood].hp];
    steps(&mut w, 100);
    assert!(w.buildings[thorn].hp > h[0] && w.buildings[brood].hp > h[1], "épine et couveuse guérissent dans leur réseau");
}

#[test]
fn burrows_carry_organisms_across_one_network() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 40);
    tech(&mut w, T_S_ROOTWAYS);
    let line = roots(&mut w, hx + 3, hy + 1, 1, 24);
    let a = put(&mut w, 0, B_BURROW, hx - 3, hy + 1);
    let b = put(&mut w, 0, B_BURROW, hx + 24, hy + 3);
    let (ra, rb) = (w.building_ref(a) as i32, w.building_ref(b) as i32);
    assert_eq!(w.buildings[a].net, w.buildings[b].net, "même réseau");
    order(&mut w, 0, O_SPECIAL, &[ra, 0, 0, rb]);
    steps(&mut w, 10);
    assert!(w.buildings[a].working && w.buildings[b].working, "l'un mène à l'autre, et retour");
    // un rongeur envoyé sur le terrier ressort à l'autre bout ; un rongeur qui ne fait que passer reste
    let g = unit(&mut w, U_GNAWER, 0, hx - 6, hy + 1);
    let id = w.unit_id(g) as i32;
    let (cx, cy) = w.buildings[a].center();
    order(&mut w, 0, O_MOVE, &[0, cx, cy, 1, id, cx, cy]);
    steps(&mut w, 100);
    assert!((w.units.x[g] / TILE - (hx + 24)).abs() < 8, "sorti par l'autre terrier : case {}", w.units.x[g] / TILE);
    let t = unit(&mut w, U_GNAWER, 0, hx - 2, hy - 6);
    let id = w.unit_id(t) as i32;
    order(&mut w, 0, O_MOVE, &[0, (hx - 2) * TILE, (hy + 10) * TILE, 1, id, (hx - 2) * TILE, (hy + 10) * TILE]);
    steps(&mut w, 120);
    assert!(w.units.x[t] / TILE < hx + 5, "il a marché sur le terrier sans y entrer");
    // une carapace passe, le Béhémoth non
    assert!(souche::burrow_fits(U_SHELL) && !souche::burrow_fits(U_BEHEMOTH) && !souche::burrow_fits(U_LIGHT_TANK));
    // câble coupé : deux réseaux, le passage se ferme
    remove_building(&mut w, line[12], false);
    steps(&mut w, 20);
    assert!(!w.buildings[a].working && !w.buildings[b].working, "réseau coupé, passage fermé");
}

#[test]
fn maw_digests_wrecks() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 16);
    let m = put(&mut w, 0, B_MAW, hx + 3, hy);
    let (cx, cy) = w.buildings[m].center();
    w.spawn_wreck(cx + 8 * TILE, cy, &[(STEEL, 60), (IRON_PLATE, 40)], 2, 0, 0);
    w.spawn_wreck(cx + 14 * TILE, cy, &[(STEEL, 60)], 2, 0, 0);
    fill(&mut w, heart, 0, 0);
    let adn = w.players[0].purse[ADN as usize];
    steps(&mut w, 200);
    let alive = w.wrecks.iter().filter(|k| k.alive).count();
    assert_eq!(alive, 1, "l'épave à portée est digérée, l'autre reste");
    assert!(w.players[0].purse[ADN as usize] > adn, "un ADN");
    // 30 d'acier et 20 de fer : 100 sève, 15 sels au moins (en plus de la graine-mère)
    let n = w.buildings[heart].net as usize;
    assert!(w.nets[n].seve >= 100 && w.nets[n].sels >= 10, "sève {} sels {}", w.nets[n].seve, w.nets[n].sels);
}

#[test]
fn sporangium_pays_sap_and_leaves_acid() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 60);
    tech(&mut w, T_S_SPORANGIA);
    put(&mut w, 0, B_SPORANGIUM, hx + 3, hy);
    let foe = unit(&mut w, U_ROACH, 1, hx + 45, hy);
    w.units.cold[foe].stun = 2000;
    fill(&mut w, heart, 0, 0);
    let hp = w.units.hp[foe];
    // sans sève : pas de tir (la graine-mère en donne un peu, pas assez en 3 s)
    steps(&mut w, 60);
    assert_eq!(w.units.hp[foe], hp);
    fill(&mut w, heart, 200, 0);
    steps(&mut w, 160);
    assert!(w.units.hp[foe] < hp, "le mortier porte à 45 cases");
    assert!(!w.acid.is_empty(), "flaque d'acide à l'impact");
    assert!(seve(&w, heart) < 200, "chaque tir coûte de la sève");
    // la flaque ronge ce qui reste dedans, puis s'efface
    let after = w.units.hp[foe];
    let a = w.acid[0];
    w.units.x[foe] = a.x;
    w.units.y[foe] = a.y;
    steps(&mut w, 40);
    assert!(w.units.hp[foe] < after);
    let kinds: Vec<usize> = (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].kind == B_SPORANGIUM).collect();
    for b in kinds {
        remove_building(&mut w, b, false);
    }
    steps(&mut w, 400);
    assert!(w.acid.is_empty(), "les flaques s'effacent");
}

#[test]
fn cocoon_ripens_and_releases_a_behemoth() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 14);
    tech(&mut w, T_S_BEHEMOTH);
    let c = put(&mut w, 0, B_COCOON, hx + 4, hy);
    steps(&mut w, 300);
    assert!(w.buildings[c].alive, "il mûrit encore");
    steps(&mut w, 200);
    assert!(!w.buildings[c].alive, "il s'est ouvert");
    let b = (0..w.units.alive.len()).find(|&s| w.units.alive[s] && w.units.kind[s] == U_BEHEMOTH).expect("Béhémoth");
    assert_eq!(w.units.owner[b], 0);
    // aucune couveuse ne le pond
    assert!(udef(U_BEHEMOTH).factory == FactoryKind::None);
}

#[test]
fn spawnery_bears_morays_on_water() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 16);
    tech(&mut w, T_S_TIDES);
    let lvl = w.map.water_level;
    // un lac à l'est de la graine-mère (au ras de son terreau)
    for y in hy - 10..hy + 13 {
        for x in hx + 4..hx + 19 {
            let i = w.map.idx(x, y);
            w.map.height[i] = lvl.saturating_sub(5);
            w.map.update_pass(x, y);
        }
    }
    if w.map.height[w.map.idx(hx + 5, hy)] >= w.map.water_level {
        return; // carte sans eau possible
    }
    assert!(place_building(&mut w, 0, B_SPAWNERY, hx - 5, hy, 0).is_none(), "jamais sur terre");
    let f = put(&mut w, 0, B_SPAWNERY, hx + 4, hy);
    let r = w.building_ref(f) as i32;
    fill(&mut w, heart, 600, 300);
    order(&mut w, 0, O_FACTORY_QUEUE, &[r, U_MORAY as i32, 1]);
    steps(&mut w, 400);
    let m = (0..w.units.alive.len()).find(|&s| w.units.alive[s] && w.units.kind[s] == U_MORAY).expect("murène née");
    let (x, y) = (w.units.x[m] / TILE, w.units.y[m] / TILE);
    assert!(w.map.is_water(x, y), "elle nage");
    assert!(udef(U_MORAY).litter == 0, "née toute formée, sans œuf");
}

// ---------- Racines ----------

#[test]
fn strangling_roots_gnaw_enemy_buildings() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 20);
    let q = w.unit(w.players[0].commander).unwrap();
    w.units.cold[q].stun = 5000; // la Reine ne s'en mêle pas
    let wall = place_building(&mut w, 1, B_FURNACE, hx + 6, hy + 1, 0).expect("fonderie ennemie");
    complete_building(&mut w, wall);
    roots(&mut w, hx + 3, hy + 1, 1, 3);
    steps(&mut w, 100);
    let full = w.buildings[wall].hp;
    assert_eq!(full, bdef(B_FURNACE).hp, "sans la mutation, rien");
    tech(&mut w, T_S_STRANGLE);
    fill(&mut w, heart, 0, 0);
    let made = w.players[0].produced[SEVE as usize];
    steps(&mut w, 200);
    assert!(w.buildings[wall].hp <= full - 4 * souche::STRANGLE_MIN, "étranglée : {}", w.buildings[wall].hp);
    // dix secondes : dix sève de la graine-mère, et celle prise à la fonderie
    assert!(w.players[0].produced[SEVE as usize] - made >= 10 + 4 * souche::STRANGLE_SEVE as u32);
}

#[test]
fn sticky_terreau_slows_enemies_and_hollow_roots_speed_organisms() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 30);
    roots(&mut w, hx + 3, hy + 1, 1, 20);
    let foe = unit(&mut w, U_LIGHT_TANK, 1, hx + 12, hy + 2);
    let org = unit(&mut w, U_GNAWER, 0, hx + 12, hy);
    let away = unit(&mut w, U_LIGHT_TANK, 1, hx - 15, hy + 20);
    essaim::refresh_terreau(&mut w);
    assert!(w.terreau.is_empty(), "personne ne le lit : pas calculé");
    tech(&mut w, T_S_STICKY);
    tech(&mut w, T_S_ROOTWAYS);
    essaim::refresh_terreau(&mut w);
    assert_eq!(essaim::speed(&w, foe, 100), 65);
    assert_eq!(essaim::speed(&w, org, 100), 120);
    assert_eq!(essaim::speed(&w, away, 100), 100, "hors du terreau");
    // une racine détruite : le terreau se retire au tick suivant
    let cut: Vec<usize> = (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].kind == B_ROOT).collect();
    for b in cut {
        remove_building(&mut w, b, false);
    }
    essaim::refresh_terreau(&mut w);
    assert_eq!(essaim::speed(&w, foe, 100), 100);
}

// ---------- Reine enracinée ----------

#[test]
fn rooted_queen_feeds_resists_and_uproots_to_walk() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 20);
    let q = w.unit(w.players[0].commander).unwrap();
    let id = w.unit_id(q) as i32;
    // hors du terreau : refusé
    w.units.x[q] = (hx - 15) * TILE;
    w.units.y[q] = (hy - 15) * TILE;
    order(&mut w, 0, O_DEPLOY, &[1, id]);
    steps(&mut w, 100);
    assert!(!essaim::rooted(&w, q) && w.units.cold[q].pack == 0);
    // sur son terreau : 3 s plus tard, elle est enracinée
    w.units.x[q] = (hx - 1) * TILE;
    w.units.y[q] = (hy + 1) * TILE;
    order(&mut w, 0, O_DEPLOY, &[1, id]);
    assert!(!essaim::rooted(&w, q));
    steps(&mut w, essaim::Q_TIME + 2);
    assert!(essaim::rooted(&w, q));
    assert_eq!(essaim::queen_net(&w, 0), w.buildings[heart].net);
    // la barre des ressources la compte : 5 sève par seconde de plus que la graine-mère
    let eco = crate::zone_eco::zone_economy(&w, 0, hx, hy);
    assert!(eco.contains("36000"), "360 sève par minute : {eco}");
    // elle nourrit le réseau
    fill(&mut w, heart, 0, 0);
    steps(&mut w, 100);
    assert!(seve(&w, heart) >= 5 * (essaim::Q_SEVE + 1) - 3, "sève : {}", seve(&w, heart));
    // elle encaisse 40 % de moins
    let hp = w.units.hp[q];
    damage_unit(&mut w, q, 1000, 1);
    assert_eq!(hp - w.units.hp[q], 600);
    // les organes poussent plus vite
    fill(&mut w, heart, 500, 100);
    let a = place_building(&mut w, 0, B_LEAVES, hx + 3, hy, 0).unwrap();
    steps(&mut w, 100);
    let fast = w.buildings[a].build;
    // un ordre de marche la déracine d'abord (3 s)
    order(&mut w, 0, O_MOVE, &[0, (hx - 12) * TILE, (hy + 1) * TILE, 1, id, (hx - 12) * TILE, (hy + 1) * TILE]);
    let x = w.units.x[q];
    steps(&mut w, 30);
    assert_eq!(w.units.x[q], x, "encore prise dans le sol");
    steps(&mut w, 100);
    assert!(!essaim::rooted(&w, q) && w.units.x[q] < x, "elle marche");
    let b = place_building(&mut w, 0, B_LEAVES, hx + 3, hy - 2, 0).unwrap();
    steps(&mut w, 100);
    assert!(fast > w.buildings[b].build * 13 / 10, "pousse : {fast} contre {}", w.buildings[b].build);
}

// ---------- Organismes ----------

#[test]
fn burster_explodes_on_its_prey_and_leaves_acid() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 40);
    let foe = unit(&mut w, U_LIGHT_TANK, 1, hx + 25, hy);
    let near = unit(&mut w, U_LIGHT_TANK, 1, hx + 25, hy + 1);
    let friend = unit(&mut w, U_GNAWER, 0, hx + 24, hy + 1);
    for s in [foe, near, friend] {
        w.units.cold[s].stun = 1000;
    }
    let b = unit(&mut w, U_BURSTER, 0, hx + 19, hy);
    let id = w.unit_id(b);
    let t = w.unit_id(foe) as i32;
    order(&mut w, 0, crate::orders::O_ATTACK, &[0, t, 1, id as i32]);
    let mut k = 0;
    while w.unit(id).is_some() && k < 200 {
        w.step(&[]);
        k += 1;
    }
    assert!(w.unit(id).is_none(), "elle a éclaté");
    let full = udef(U_LIGHT_TANK).hp;
    assert!(w.units.hp[foe] <= full - 170 && w.units.hp[near] <= full - 170, "zone : {} {}", w.units.hp[foe], w.units.hp[near]);
    assert_eq!(w.units.hp[friend], udef(U_GNAWER).hp, "les siens sont épargnés");
    assert_eq!(w.acid.len(), 1);
    // tuée à distance, elle éclate aussi
    let b2 = unit(&mut w, U_BURSTER, 0, hx + 24, hy);
    let hp = w.units.hp[foe];
    damage_unit(&mut w, b2, 1000, 1);
    w.step(&[]);
    assert!(w.units.hp[foe] <= hp - 170);
    // les deux flaques au même endroit n'en font qu'une
    assert_eq!(w.acid.len(), 1);
}

#[test]
fn burrower_hides_and_strikes_first() {
    let mut w = World::new(&[4242, 512, 0, 2, 0, 0, 100, 100, 1, 0, 100, 100, 0, 1, RACE_SOUCHE as i32, RACE_INDUS as i32]);
    w.place_start_buildings();
    let (_, hx, hy) = base(&mut w, 40);
    let b = unit(&mut w, U_BURROWER, 0, hx + 30, hy);
    steps(&mut w, 70);
    assert!(essaim::buried(&w, b) && crate::combat::cloaked(&w, b), "enterré après 3 s");
    // l'ennemi qui regarde de loin ne le voit pas
    let scout = unit(&mut w, U_LIGHT_TANK, 1, hx + 30, hy + 12);
    w.units.cold[scout].stun = 5000;
    steps(&mut w, 20);
    assert!(!crate::combat::unit_seen(&w, 1, b), "invisible à 12 cases");
    // un char lui passe dessus : il surgit, premier coup triple
    let prey = unit(&mut w, U_LIGHT_TANK, 1, hx + 31, hy);
    w.units.cold[prey].stun = 5000;
    let full = w.units.hp[prey];
    let mut k = 0;
    while w.units.hp[prey] == full && k < 40 {
        w.step(&[]);
        k += 1;
    }
    assert_eq!(full - w.units.hp[prey], 180, "60 × 3");
    assert!(!essaim::buried(&w, b));
    steps(&mut w, 20);
    assert_eq!(full - w.units.hp[prey], 240, "puis des coups ordinaires");
    // un ordre de marche le déterre
    let c = unit(&mut w, U_BURROWER, 0, hx + 20, hy - 10);
    steps(&mut w, 70);
    assert!(essaim::buried(&w, c));
    let id = w.unit_id(c) as i32;
    order(&mut w, 0, O_MOVE, &[0, (hx + 10) * TILE, (hy - 10) * TILE, 1, id, (hx + 10) * TILE, (hy - 10) * TILE]);
    steps(&mut w, 2);
    assert!(!essaim::buried(&w, c));
}

#[test]
fn nurse_heals_far_from_home() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 40);
    let a = unit(&mut w, U_SHELL, 0, hx + 30, hy);
    let b = unit(&mut w, U_SHELL, 0, hx + 30, hy + 12);
    unit(&mut w, U_NURSE, 0, hx + 32, hy);
    for s in [a, b] {
        w.units.hp[s] = 1000;
    }
    steps(&mut w, 100);
    assert!(w.units.hp[a] >= 1000 + 4 * 44, "près de la nourrice : {}", w.units.hp[a]);
    assert_eq!(w.units.hp[b], 1000, "loin d'elle, hors du terreau : rien");
}

#[test]
fn dart_only_shoots_the_sky_and_devourers_feed() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 40);
    let d = unit(&mut w, U_DART, 0, hx + 30, hy);
    let tank = unit(&mut w, U_LIGHT_TANK, 1, hx + 34, hy);
    w.units.cold[tank].stun = 1000;
    let plane = unit(&mut w, U_TRANSPORT, 1, hx + 36, hy);
    steps(&mut w, 60);
    assert!(w.units.hp[plane] < udef(U_TRANSPORT).hp, "il vise le ciel");
    assert_eq!(w.units.hp[tank], udef(U_LIGHT_TANK).hp);
    w.units.hp[d] = 0;
    w.dead_units.push(d as u32);
    // le Béhémoth guérit de ce qu'il tue, et ses griffes balaient la zone
    let b = unit(&mut w, U_BEHEMOTH, 0, hx + 34, hy + 8);
    let x = unit(&mut w, U_LIGHT_TANK, 1, hx + 34, hy + 12);
    let y = unit(&mut w, U_LIGHT_TANK, 1, hx + 35, hy + 12);
    for s in [x, y] {
        w.units.cold[s].stun = 1000;
    }
    w.units.hp[b] = 20_000;
    steps(&mut w, 60);
    assert!(!w.units.alive[x] && !w.units.alive[y], "balayés d'un coup");
    assert!(w.units.hp[b] >= 20_000 + udef(U_LIGHT_TANK).hp / 4, "nourri : {}", w.units.hp[b]);
}

// ---------- Mutations et caractères acquis ----------

#[test]
fn acid_blood_and_spines() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 40);
    tech(&mut w, T_S_ACID_BLOOD);
    let g = unit(&mut w, U_SHELL, 0, hx + 30, hy);
    damage_unit(&mut w, g, 100_000, 1);
    w.step(&[]);
    assert_eq!(w.acid.len(), 1, "sang acide");
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 40);
    tech(&mut w, T_S_SPINES);
    let g = unit(&mut w, U_SHELL, 0, hx + 30, hy);
    let foe = unit(&mut w, U_BEAST_L, 1, hx + 32, hy);
    let hp = w.units.hp[foe];
    w.shooter = w.unit_id(foe);
    w.hit_weapon = 57;
    damage_unit(&mut w, g, 120, 1);
    w.shooter = NONE;
    w.hit_weapon = 255;
    assert_eq!(hp - w.units.hp[foe], 40, "épines : un tiers");
}

#[test]
fn the_species_learns_from_its_wounds() {
    let mut w = game();
    let (_, hx, hy) = base(&mut w, 20);
    put(&mut w, 0, B_MATRIX, hx + 3, hy);
    w.players[0].purse[ADN as usize] = 200;
    let s = unit(&mut w, U_SHELL, 0, hx + 12, hy);
    let hit = |w: &mut World, weapon: u8, dmg: i32| {
        w.units.hp[s] = 2200;
        w.hit_weapon = weapon;
        damage_unit(w, s, dmg, 1);
        w.hit_weapon = 255;
        2200 - w.units.hp[s]
    };
    // deux coups de canon (famille cinétique), un d'artillerie (explosif)
    assert_eq!(hit(&mut w, 4, 1600), 1600);
    assert_eq!(hit(&mut w, 4, 1600), 1600);
    assert_eq!(hit(&mut w, 5, 500), 500);
    order(&mut w, 0, O_ADAPT, &[0]);
    assert_eq!(w.players[0].adapt, 0, "Mémoire du sang pas encore acquise");
    tech(&mut w, T_S_MEMORY);
    order(&mut w, 0, O_ADAPT, &[1]);
    assert_eq!(w.players[0].adapt, 0, "pas assez blessée par les explosifs");
    order(&mut w, 0, O_ADAPT, &[0]);
    assert_eq!(w.players[0].adapt, 1);
    assert_eq!(w.players[0].purse[ADN as usize], 200 - essaim::ADAPT_COST);
    assert_eq!(hit(&mut w, 4, 1000), 800, "20 % de moins");
    assert_eq!(hit(&mut w, 5, 1000), 1000);
    // trois familles au plus, de plus en plus chères
    w.players[0].scars = [9999; essaim::FAMILIES];
    for f in [1, 2, 3] {
        order(&mut w, 0, O_ADAPT, &[f]);
    }
    assert_eq!(w.players[0].adapt.count_ones(), essaim::ADAPT_MAX);
    assert_eq!(w.players[0].purse[ADN as usize], 200 - essaim::ADAPT_COST * 6);
}

// ---------- Sauvegarde ----------

#[test]
fn the_new_state_survives_save_and_restore() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 30);
    for t in [T_S_STICKY, T_S_ROOTWAYS, T_S_MEMORY, T_S_ACID, T_S_SPORANGIA] {
        tech(&mut w, t);
    }
    w.players[0].scars = [10, 20, 30, 40, 50];
    w.players[0].adapt = 5;
    let q = w.unit(w.players[0].commander).unwrap();
    w.units.x[q] = (hx - 1) * TILE;
    w.units.y[q] = (hy + 1) * TILE;
    let id = w.unit_id(q) as i32;
    // racines en croissance (le terreau change pendant la suite), unités qui marchent dessus
    for k in 0..10 {
        place_building(&mut w, 0, B_ROOT, hx + 3 + k, hy + 1, 0).expect("racine");
    }
    let foe = unit(&mut w, U_LIGHT_TANK, 1, hx + 20, hy + 2);
    let fid = w.unit_id(foe) as i32;
    order(&mut w, 0, O_DEPLOY, &[1, id]);
    order(&mut w, 1, O_MOVE, &[0, (hx + 4) * TILE, (hy + 2) * TILE, 1, fid, (hx + 4) * TILE, (hy + 2) * TILE]);
    unit(&mut w, U_BURROWER, 0, hx + 12, hy + 6);
    unit(&mut w, U_NURSE, 0, hx + 14, hy + 6);
    essaim::spill(&mut w, 0, (hx + 8) * TILE, (hy + 2) * TILE, 400, 8, 400);
    fill(&mut w, heart, 400, 100);
    for k in 0..40 {
        steps(&mut w, 3);
        // la copie relue à n'importe quel tick suit exactement l'original
        let mut r = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
        assert_eq!(r.players[0].scars, w.players[0].scars);
        assert_eq!(r.players[0].adapt, 5);
        assert_eq!(r.acid.len(), w.acid.len());
        let mut c = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
        for _ in 0..7 {
            assert_eq!(r.step(&[]), c.step(&[]), "passage {k}");
        }
        if k == 10 {
            // et l'original continue comme sa copie
            let mut copy = crate::save::restore(&crate::save::snapshot(&w)).unwrap();
            let mut orig = w;
            for t in 0..200 {
                assert_eq!(copy.step(&[]), orig.step(&[]), "tick {t}");
            }
            w = orig;
        }
    }
}

/// La démo (?demo=essaim) pose tout ce qu'elle montre, et vit 30 s sans erreur.
#[test]
fn essaim_demo_shows_every_new_organ_and_organism() {
    let mut w = crate::stress::essaim_demo();
    for k in [B_BRAMBLE, B_RHIZOME, B_BURROW, B_MAW, B_SPORANGIUM, B_SPAWNERY, B_COCOON] {
        assert!(w.buildings.iter().any(|b| b.alive && b.owner == 0 && b.kind == k), "{}", bdef(k).key);
    }
    for k in U_BURSTER..=U_BEHEMOTH {
        assert!((0..w.units.alive.len()).any(|s| w.units.alive[s] && w.units.kind[s] == k), "{}", udef(k).key);
    }
    steps(&mut w, 600);
    let q = w.unit(w.players[0].commander).expect("Reine");
    assert!(essaim::rooted(&w, q), "Reine enracinée");
    let burrows: Vec<usize> = (0..w.buildings.len()).filter(|&b| w.buildings[b].alive && w.buildings[b].kind == B_BURROW).collect();
    assert!(burrows.iter().all(|&b| w.buildings[b].working), "terriers reliés");
    assert!(w.wrecks.iter().any(|k| k.alive), "la panse n'a pas fini ses épaves");
    assert!((0..w.units.alive.len()).filter(|&s| w.units.alive[s] && w.units.kind[s] == U_BEHEMOTH).count() >= 2, "le cocon s'est ouvert");
}

// ---------- Coût des racines ----------

/// Racines et rhizomes : 2 % de plus par case de distance à la graine-mère poussée la plus proche, fixé à
/// la pose ; le réseau paie ce prix, l'annulation le rend.
#[test]
fn far_roots_cost_more() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 60);
    let q = w.unit(w.players[0].commander).unwrap();
    w.units.cold[q].stun = 60_000;
    let line = roots(&mut w, hx + 3, hy + 1, 1, 50);
    assert_eq!(w.buildings[line[0]].lot, 2, "collée : une case");
    assert_eq!(w.buildings[line[9]].lot, 20, "dix cases : +20 %");
    assert_eq!(w.buildings[line[49]].lot, 100, "cinquante cases : le double");
    // distance comptée comme un câble : à l'horizontale puis à la verticale
    let h = souche::hearts(&w, 0);
    assert_eq!(souche::heart_dist(&h, hx + 12, hy + 12, 1, 1), 20);
    assert_eq!(souche::heart_dist(&h, hx - 3, hy, 2, 2), 2, "emprise contre emprise");
    // ce que paie le réseau : la case suivante (51 cases, +102 %) coûte 8 sève au lieu de 4
    fill(&mut w, heart, 500, 100);
    let before = w.players[0].consumed[SEVE as usize];
    let far = place_building(&mut w, 0, B_ROOT, hx + 53, hy + 1, 0).expect("racine au bout");
    rebuild_power(&mut w);
    steps(&mut w, 200);
    assert!(w.buildings[far].complete());
    assert_eq!(w.players[0].consumed[SEVE as usize] - before, 8);
    assert_eq!(w.buildings[far].paid[0], 8);
    // aperçu d'une file : le total et le supplément le plus fort
    let cells: Vec<(i32, i32, u8)> = (0..3).map(|k| (hx + 3 + k, hy + 1, 0)).collect();
    assert_eq!(souche::line_cost(&w, 0, B_ROOT, &cells), vec![6, SEVE as i32, 12]);
    let cells: Vec<(i32, i32, u8)> = (0..3).map(|k| (hx + 54 + k, hy + 1, 0)).collect();
    assert_eq!(souche::line_cost(&w, 0, B_ROOT, &cells), vec![108, SEVE as i32, 24]);
    // les autres organes gardent leur prix
    assert_eq!(souche::far_pct(&h, B_LEAVES, hx + 40, hy, 0), 0);
    assert_eq!(souche::far_pct(&h, B_RHIZOME, hx + 12, hy, 0), 20);
    // une seconde graine-mère poussée près du bout : les racines suivantes repartent de leur prix de base,
    // celles déjà posées gardent le leur
    let h2 = put(&mut w, 0, B_SEED_HEART, hx + 54, hy + 4);
    assert!(w.buildings[h2].complete());
    let near = place_building(&mut w, 0, B_ROOT, hx + 54, hy + 1, 0).expect("racine près de la seconde");
    assert_eq!(w.buildings[near].lot, 6);
    assert_eq!(w.buildings[line[49]].lot, 100);
    // relue d'une sauvegarde, elle garde son prix
    let r = crate::save::restore(&crate::save::snapshot(&w)).expect("relue");
    assert_eq!(r.buildings[line[49]].lot, 100);
}

/// Un organe annulé en pleine croissance, ou démonté, rend sa sève à son réseau.
#[test]
fn cancelled_and_dismantled_organs_give_their_sap_back() {
    let mut w = game();
    let (heart, hx, hy) = base(&mut w, 12);
    fill(&mut w, heart, 400, 200);
    let b = place_building(&mut w, 0, B_BROOD, hx + 4, hy, 0).expect("couveuse");
    steps(&mut w, 150);
    assert!(w.buildings[b].paid[0] > 20 && !w.buildings[b].complete());
    let paid = w.buildings[b].paid[0] as i32;
    let before = seve(&w, heart);
    let r = w.building_ref(b) as i32;
    order(&mut w, 0, crate::orders::O_CANCEL, &[r]);
    assert!(!w.buildings[b].alive);
    assert!(seve(&w, heart) >= before + paid, "{} + {paid} → {}", before, seve(&w, heart));
    // démonté par un semeur : le réseau récupère tout, rien ne reste dans la soute du semeur
    let l = put(&mut w, 0, B_LEAVES, hx + 3, hy);
    w.buildings[l].paid = [40, 10, 0, 0];
    let s = unit(&mut w, U_SOWER, 0, hx + 5, hy + 3);
    let (sid, r) = (w.unit_id(s) as i32, w.building_ref(l) as i32);
    fill(&mut w, heart, 100, 0);
    order(&mut w, 0, crate::orders::O_RECLAIM, &[0, r, 1, sid]);
    steps(&mut w, 200);
    assert!(!w.buildings[l].alive, "démontée");
    assert!(seve(&w, heart) >= 140, "sève rendue : {}", seve(&w, heart));
    assert!(w.units.cold[s].hold.iter().all(|&n| n == 0));
}
