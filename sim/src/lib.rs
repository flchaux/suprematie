//! Simulation déterministe du STR, compilée en WebAssembly.
//! Interface : init, step, render_buffer, snapshot, restore (+ fonctions d'aide pour l'interface et les bots).
//! Les échanges passent par un tampon d'entrée (`in_buf`) et un tampon de sortie (`out_ptr`/`out_len`).

pub mod ameliorations;
pub mod belts;
pub mod bouclier;
pub mod buildings;
pub mod chariots;
pub mod combat;
pub mod convoi;
pub mod data;
pub mod drones;
pub mod essaim;
pub mod fixed;
pub mod flow;
pub mod formation;
pub mod gabarits;
pub mod grid;
pub mod logistics;
pub mod map;
pub mod nature;
pub mod orders;
pub mod ponte;
pub mod races;
pub mod render;
pub mod rng;
pub mod save;
pub mod ser;
pub mod soil;
pub mod souche;
pub mod transfert;
pub mod transhumants;
pub mod troupeau;
pub mod twins;
pub mod units;
pub mod world;
pub mod zone_eco;

use std::cell::RefCell;
use world::World;

thread_local! {
    static WORLD: RefCell<Option<World>> = const { RefCell::new(None) };
    static INBUF: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn read_i32s(n_words: u32) -> Vec<i32> {
    INBUF.with(|b| {
        let b = b.borrow();
        let n = (n_words as usize).min(b.len() / 4);
        (0..n).map(|i| i32::from_le_bytes([b[i * 4], b[i * 4 + 1], b[i * 4 + 2], b[i * 4 + 3]])).collect()
    })
}

fn set_out_i32(v: &[i32]) -> *const u8 {
    OUT.with(|o| {
        let mut o = o.borrow_mut();
        o.clear();
        o.reserve(v.len() * 4);
        for x in v {
            o.extend_from_slice(&x.to_le_bytes());
        }
        o.as_ptr()
    })
}

fn set_out_bytes(v: Vec<u8>) -> *const u8 {
    OUT.with(|o| {
        *o.borrow_mut() = v;
        o.borrow().as_ptr()
    })
}

fn with_world<R>(f: impl FnOnce(&mut World) -> R, default: R) -> R {
    WORLD.with(|w| match w.borrow_mut().as_mut() {
        Some(w) => f(w),
        None => default,
    })
}

/// Réserve le tampon d'entrée de `n` octets et renvoie son adresse.
#[no_mangle]
pub extern "C" fn in_buf(n: u32) -> *mut u8 {
    INBUF.with(|b| {
        let mut b = b.borrow_mut();
        b.resize(n as usize, 0);
        b.as_mut_ptr()
    })
}

#[no_mangle]
pub extern "C" fn out_len() -> u32 {
    OUT.with(|o| o.borrow().len() as u32)
}

/// Crée une partie. Paramètres (i32) dans le tampon d'entrée : [graine, taille, eau, nb joueurs, (équipe, bot, mult. ressources, mult. construction)…]
#[no_mangle]
pub extern "C" fn init(n_words: u32) -> u32 {
    let p = read_i32s(n_words);
    let mut w = World::new(&p);
    w.place_start_buildings();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Applique les ordres du tick (i32 dans le tampon d'entrée), avance d'un tick, renvoie le hash d'état.
#[no_mangle]
pub extern "C" fn step(n_words: u32) -> u32 {
    let o = read_i32s(n_words);
    with_world(|w| w.step(&o), 0)
}

#[no_mangle]
pub extern "C" fn render_buffer(x0: i32, y0: i32, x1: i32, y1: i32, detail: i32, player: i32, with_vis: i32) -> *const u8 {
    let v = with_world(|w| render::render(w, x0, y0, x1, y1, detail, player, with_vis != 0), Vec::new());
    set_out_i32(&v)
}

#[no_mangle]
pub extern "C" fn snapshot() -> *const u8 {
    let v = with_world(|w| save::snapshot(w), Vec::new());
    set_out_bytes(v)
}

/// Recharge un état sérialisé (octets dans le tampon d'entrée). Renvoie le hash, ou 0 en cas d'échec.
#[no_mangle]
pub extern "C" fn restore(n_bytes: u32) -> u32 {
    let bytes = INBUF.with(|b| b.borrow()[..(n_bytes as usize).min(b.borrow().len())].to_vec());
    match save::restore(&bytes) {
        Some(w) => {
            let h = w.hash();
            WORLD.with(|x| *x.borrow_mut() = Some(w));
            h
        }
        None => 0,
    }
}

/// Files d'ordres des unités dont les identifiants (u32) sont dans le tampon d'entrée.
#[no_mangle]
pub extern "C" fn unit_orders(n_bytes: u32) -> *const u8 {
    let ids: Vec<u32> = INBUF.with(|b| {
        let b = b.borrow();
        let n = (n_bytes as usize).min(b.len()) / 4;
        (0..n).map(|i| u32::from_le_bytes([b[i * 4], b[i * 4 + 1], b[i * 4 + 2], b[i * 4 + 3]])).collect()
    });
    let v = with_world(|w| render::unit_orders(w, &ids), Vec::new());
    set_out_i32(&v)
}

/// File de recherche d'un joueur (technologies dans l'ordre).
#[no_mangle]
pub extern "C" fn research_queue(player: i32) -> *const u8 {
    let v = with_world(|w| w.players.get(player as usize).map(|p| p.research_queue.iter().map(|&t| t as i32).collect()).unwrap_or_default(), Vec::new());
    set_out_i32(&v)
}

/// Constructions prévues d'un joueur (ordres de construction pas encore commencés).
#[no_mangle]
pub extern "C" fn planned_builds(player: i32) -> *const u8 {
    let v = with_world(|w| render::planned_builds(w, player), Vec::new());
    set_out_i32(&v)
}

#[no_mangle]
pub extern "C" fn data_json() -> *const u8 {
    set_out_bytes(data::data_json().into_bytes())
}

#[no_mangle]
pub extern "C" fn map_info() -> *const u8 {
    let v = with_world(|w| render::map_info(w), Vec::new());
    set_out_i32(&v)
}

#[no_mangle]
pub extern "C" fn map_heights() -> *const u8 {
    let v = with_world(|w| w.map.height.clone(), Vec::new());
    set_out_bytes(v)
}

#[no_mangle]
pub extern "C" fn bot_dump() -> *const u8 {
    let v = with_world(|w| render::bot_dump(w), Vec::new());
    set_out_i32(&v)
}

#[no_mangle]
pub extern "C" fn info_building(r: u32) -> *const u8 {
    let s = with_world(|w| render::info_building(w, r), "null".into());
    set_out_bytes(s.into_bytes())
}

/// Zones électriques de l'équipe d'un joueur (JSON, voir render::power_zones).
#[no_mangle]
pub extern "C" fn power_zones(player: i32) -> *const u8 {
    let s = with_world(|w| render::power_zones(w, player), "null".into());
    set_out_bytes(s.into_bytes())
}

/// Économie de la zone au centre de l'écran (JSON, voir zone_eco::zone_economy).
#[no_mangle]
pub extern "C" fn zone_economy(player: i32, tx: i32, ty: i32) -> *const u8 {
    let s = with_world(|w| zone_eco::zone_economy(w, player, tx, ty), "null".into());
    set_out_bytes(s.into_bytes())
}

/// Chemin de tapis du tapis `r` (double clic) : références des tapis, voir belts::belt_path.
#[no_mangle]
pub extern "C" fn belt_path(r: u32) -> *const u8 {
    let v = with_world(|w| w.building(r).map(|b| belts::belt_path(w, b).into_iter().map(|t| w.building_ref(t) as i32).collect()).unwrap_or_default(), Vec::new());
    set_out_i32(&v)
}

#[no_mangle]
pub extern "C" fn info_unit(id: u32) -> *const u8 {
    let s = with_world(|w| render::info_unit(w, id), "null".into());
    set_out_bytes(s.into_bytes())
}

#[no_mangle]
pub extern "C" fn can_place(owner: i32, kind: i32, x: i32, y: i32, dir: i32) -> i32 {
    with_world(|w| buildings::can_place(w, owner as u8, kind as u16, x, y, dir as u8) as i32, 0)
}

/// Aperçu de pose des machines jumelles. Tampon d'entrée (i32) : [joueur, type, puis (x, y, dir)…] ;
/// renvoie, par emplacement, les cases de bord collées à une future jumelle (voir twins::twin_preview).
#[no_mangle]
pub extern "C" fn twin_preview(n_words: u32) -> *const u8 {
    let a = read_i32s(n_words);
    let v = with_world(
        |w| {
            if a.len() < 2 || a[0] < 0 || a[1] < 0 {
                return Vec::new();
            }
            let cells: Vec<(i32, i32, u8)> = a[2..].chunks_exact(3).map(|c| (c[0], c[1], c[2] as u8)).collect();
            twins::twin_preview(w, a[0] as u8, a[1] as u16, &cells)
        },
        Vec::new(),
    );
    set_out_i32(&v)
}

/// Aperçu d'une formation orientée (voir orders::formation_preview). Tampon d'entrée (i32) : [joueur, x, y
/// (sous-unités, but), angle (16 bits), en file (0 ou 1), puis identifiants…] ; renvoie id, x, y par unité.
#[no_mangle]
pub extern "C" fn formation_preview(n_words: u32) -> *const u8 {
    let a = read_i32s(n_words);
    let v = with_world(
        |w| {
            if a.len() < 5 || a[0] < 0 {
                return Vec::new();
            }
            orders::formation_preview(w, a[0] as u8, a[1], a[2], a[3], a[4] != 0, &a[5..])
        },
        Vec::new(),
    );
    set_out_i32(&v)
}

/// Disponible pour payer en un point (voir render::reach_stock). Tampon d'entrée (i32) : [joueur, x, y
/// (cases, centre), rayon (cases), puis identifiants des constructeurs dont la soute compte…] ; renvoie la
/// quantité par objet.
#[no_mangle]
pub extern "C" fn reach_stock(n_words: u32) -> *const u8 {
    let a = read_i32s(n_words);
    let v = with_world(
        |w| {
            if a.len() < 4 || a[0] < 0 {
                return Vec::new();
            }
            let ids: Vec<u32> = a[4..].iter().map(|&v| v as u32).collect();
            let t = crate::fixed::TILE;
            render::reach_stock(w, a[0] as u8, a[1] * t + t / 2, a[2] * t + t / 2, a[3].max(0) * t, &ids)
        },
        Vec::new(),
    );
    set_out_i32(&v)
}

/// Aperçu de pose d'une file (voir buildings::can_place_line). Tampon d'entrée (i32) : [joueur, type, puis
/// (x, y, dir)…] ; renvoie 1 ou 0 par emplacement.
#[no_mangle]
pub extern "C" fn can_place_line(n_words: u32) -> *const u8 {
    let a = read_i32s(n_words);
    let v = with_world(
        |w| {
            if a.len() < 2 || a[0] < 0 || a[1] < 0 || a[1] as usize >= data::BUILDINGS.len() || a[0] as usize >= w.players.len() {
                return Vec::new();
            }
            let cells: Vec<(i32, i32, u8)> = a[2..].chunks_exact(3).map(|c| (c[0], c[1], c[2] as u8)).collect();
            buildings::can_place_line(w, a[0] as u8, a[1] as u16, &cells).into_iter().map(|b| b as i32).collect()
        },
        Vec::new(),
    );
    set_out_i32(&v)
}

/// Sol mangé par la Souche pour un joueur (voir soil::layer) : suites [longueur << 8 | joueur + 1].
#[no_mangle]
pub extern "C" fn soil_layer(player: i32) -> *const u8 {
    let v = with_world(|w| soil::layer(w, player), Vec::new());
    set_out_i32(&v)
}

/// Aperçu de pose d'une frondaison ou d'une racine-puits (voir soil::preview).
#[no_mangle]
pub extern "C" fn soil_preview(player: i32, kind: i32, x: i32, y: i32) -> *const u8 {
    let v = with_world(|w| if kind < 0 || !(0..8).contains(&player) { Vec::new() } else { soil::preview(w, player as u8, kind as u16, x, y) }, Vec::new());
    set_out_i32(&v)
}

/// Coût d'une file posée d'un coup (voir souche::line_cost). Tampon d'entrée (i32) : [joueur, type, puis
/// (x, y, dir)…] ; renvoie [supplément le plus fort (%), cases d'herbe, sève tirée, puis objet, total, pour chaque objet].
#[no_mangle]
pub extern "C" fn line_cost(n_words: u32) -> *const u8 {
    let a = read_i32s(n_words);
    let v = with_world(
        |w| {
            if a.len() < 2 || a[0] < 0 || a[1] < 0 || a[1] as usize >= data::BUILDINGS.len() || a[0] as usize >= w.players.len() {
                return Vec::new();
            }
            let cells: Vec<(i32, i32, u8)> = a[2..].chunks_exact(3).map(|c| (c[0], c[1], c[2] as u8)).collect();
            souche::line_cost(w, a[0] as u8, a[1] as u16, &cells)
        },
        Vec::new(),
    );
    set_out_i32(&v)
}

/// Bâtiment sur une case : kind+1 | propriétaire<<8 | direction<<16 | (complet)<<20, ou 0.
#[no_mangle]
pub extern "C" fn tile_info(x: i32, y: i32) -> i32 {
    with_world(
        |w| {
            if !w.map.inside(x, y) {
                return -1;
            }
            let o = w.map.occ[w.map.idx(x, y)];
            if o == 0 {
                return 0;
            }
            let b = &w.buildings[(o - 1) as usize];
            (b.kind as i32 + 1) | (b.owner as i32) << 8 | (b.dir as i32) << 16 | (b.complete() as i32) << 20
        },
        -1,
    )
}

/// Référence du bâtiment sur une case, ou 0.
#[no_mangle]
pub extern "C" fn building_at(x: i32, y: i32) -> u32 {
    with_world(
        |w| {
            if !w.map.inside(x, y) {
                return 0;
            }
            let o = w.map.occ[w.map.idx(x, y)];
            if o == 0 {
                0
            } else {
                w.building_ref((o - 1) as usize)
            }
        },
        0,
    )
}

/// Passabilité d'une case (bits P_LAND, P_HOVER, P_NAVAL).
#[no_mangle]
pub extern "C" fn tile_pass(x: i32, y: i32) -> i32 {
    with_world(|w| if w.map.inside(x, y) { w.map.pass[w.map.idx(x, y)] as i32 } else { 0 }, 0)
}

#[no_mangle]
pub extern "C" fn current_tick() -> u32 {
    with_world(|w| w.tick, 0)
}

#[no_mangle]
pub extern "C" fn state_hash() -> u32 {
    with_world(|w| w.hash(), 0)
}

/// Épave la plus proche du point (sous-unités), à moins de 2 cases, ou 0.
#[no_mangle]
pub extern "C" fn wreck_at(x: i32, y: i32) -> u32 {
    with_world(
        |w| {
            let mut best = 0u32;
            let mut bd = (2 * fixed::TILE as i64).pow(2);
            for (i, wk) in w.wrecks.iter().enumerate() {
                if wk.alive {
                    let d = fixed::dist2(wk.x, wk.y, x, y);
                    if d < bd {
                        bd = d;
                        best = w.wreck_ref(i);
                    }
                }
            }
            best
        },
        0,
    )
}

/// Banc de performance : remplace la partie par la partie de référence synthétique
/// (8 joueurs, 8 000 unités, ~40 000 bâtiments et tapis). Hors jeu en réseau.
#[no_mangle]
pub extern "C" fn bench_reference() -> u32 {
    let w = stress::reference_world_quiet();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Scène de démonstration de la logistique (remplace le monde courant).
#[no_mangle]
pub extern "C" fn logistics_demo() -> u32 {
    let w = stress::logistics_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Galerie des projectiles (remplace le monde courant).
#[no_mangle]
pub extern "C" fn projectiles_demo() -> u32 {
    let w = stress::projectiles_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Vitrine des modèles : un exemplaire de chaque bâtiment et de chaque unité (remplace le monde courant).
#[no_mangle]
pub extern "C" fn showcase_demo() -> u32 {
    let w = stress::showcase_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des anneaux, de la porte et des droïdes (remplace le monde courant).
#[no_mangle]
pub extern "C" fn anciens_demo() -> u32 {
    let w = stress::anciens_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des Transhumants : soute, chariots de convoi en navette, générateur et poteaux (remplace le monde courant).
#[no_mangle]
pub extern "C" fn arche_demo() -> u32 {
    let w = stress::arche_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des robots des Transhumants (remplace le monde courant).
#[no_mangle]
pub extern "C" fn robots_demo() -> u32 {
    let w = stress::robots_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des Transhumants qui traversent un bras de mer (remplace le monde courant).
#[no_mangle]
pub extern "C" fn gue_demo() -> u32 {
    let w = stress::gue_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

#[no_mangle]
pub extern "C" fn nomades_demo() -> u32 {
    let w = stress::nomades_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des chantiers : chantiers figés à tous les avancements (remplace le monde courant).
#[no_mangle]
pub extern "C" fn chantiers_demo() -> u32 {
    let w = stress::chantiers_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des relais logistiques : chaîne de relais qui ravitaille un chantier et une usine éloignés.
#[no_mangle]
pub extern "C" fn relais_demo() -> u32 {
    let w = stress::relais_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des ascenseurs de tapis : files qui changent de niveau (remplace le monde courant).
#[no_mangle]
pub extern "C" fn lifts_demo() -> u32 {
    let w = stress::lifts_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo de la ponte de la Souche : couveuses qui pondent en boucle (remplace le monde courant).
#[no_mangle]
pub extern "C" fn ponte_demo() -> u32 {
    let w = stress::ponte_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo de la Souche, suite : nouveaux organes et organismes (remplace le monde courant).
#[no_mangle]
pub extern "C" fn essaim_demo() -> u32 {
    let w = stress::essaim_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo de l'apprivoisement d'un nid par la Reine de la Souche (remplace le monde courant).
#[no_mangle]
pub extern "C" fn taming_demo() -> u32 {
    let w = stress::taming_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Démo des déplacements en formation orientée (remplace le monde courant).
#[no_mangle]
pub extern "C" fn formation_demo() -> u32 {
    let w = stress::formation_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Scène de démonstration des armes (remplace le monde courant).
#[no_mangle]
pub extern "C" fn weapons_demo() -> u32 {
    let w = stress::weapons_demo();
    let h = w.hash();
    WORLD.with(|x| *x.borrow_mut() = Some(w));
    h
}

/// Équipe gagnante (-1 : partie en cours, -2 : aucune).
#[no_mangle]
pub extern "C" fn game_winner() -> i32 {
    with_world(|w| w.winner, -1)
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod logistics_tests;
#[cfg(test)]
mod features_tests;
#[cfg(test)]
mod formation_tests;
#[cfg(test)]
mod nature_tests;
#[cfg(test)]
mod twin_preview_tests;
#[cfg(test)]
mod twins_tests;
#[cfg(test)]
mod harvest_tests;
#[cfg(test)]
mod production_tests;
#[cfg(test)]
mod anciens_tests;
#[cfg(test)]
mod main_gen_tests;
#[cfg(test)]
mod drones_tests;
#[cfg(test)]
mod relays_tests;
#[cfg(test)]
mod separation_tests;
#[cfg(test)]
mod pickup_tests;
#[cfg(test)]
mod races_tests;
#[cfg(test)]
mod essaim_tests;
#[cfg(test)]
mod soil_tests;
#[cfg(test)]
mod ponte_tests;
#[cfg(test)]
mod zone_eco_tests;
#[cfg(test)]
mod pause_tests;
#[cfg(test)]
mod sorties_tests;
pub mod stress;
#[cfg(test)]
mod ameliorations_tests;
#[cfg(test)]
mod equipement_tests;
#[cfg(test)]
mod transhumants_tests;
#[cfg(test)]
mod transfert_tests;
#[cfg(test)]
mod chariots_tests;
#[cfg(test)]
mod troupeau_tests;
#[cfg(test)]
mod bouclier_tests;
#[cfg(test)]
mod convoi_tests;
