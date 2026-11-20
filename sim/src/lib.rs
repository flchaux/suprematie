//! Simulation déterministe du STR, compilée en WebAssembly.
//! Interface : init, step, render_buffer, snapshot, restore (+ fonctions d'aide pour l'interface et les bots).
//! Les échanges passent par un tampon d'entrée (`in_buf`) et un tampon de sortie (`out_ptr`/`out_len`).

pub mod belts;
pub mod buildings;
pub mod combat;
pub mod data;
pub mod fixed;
pub mod flow;
pub mod grid;
pub mod logistics;
pub mod map;
pub mod nature;
pub mod orders;
pub mod render;
pub mod rng;
pub mod save;
pub mod ser;
pub mod twins;
pub mod units;
pub mod world;

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
mod nature_tests;
#[cfg(test)]
mod twin_preview_tests;
pub mod stress;
