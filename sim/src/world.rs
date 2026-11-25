//! État de la partie et boucle de simulation.

use crate::belts::Belts;
use crate::data::*;
use crate::fixed::{dist2, Trig, TILE};
use crate::flow::Nav;
use crate::map::Map;
use crate::rng::Rng;
use crate::ser::{Hasher, Ser};

pub const BUILD_FULL: u32 = 1 << 16;
pub const SLOT_BITS: u32 = 20;
pub const SLOT_MASK: u32 = (1 << SLOT_BITS) - 1;
pub const REF_BUILDING: u32 = 1 << 30;
pub const REF_WRECK: u32 = 1 << 29;
pub const REF_MASK: u32 = (1 << 29) - 1;
pub const NONE: u32 = u32::MAX;
pub const MAX_PLAYERS: usize = 8;
pub const UNIT_CAP: u32 = 1000;

#[inline]
pub fn slot_of(id: u32) -> usize {
    (id & SLOT_MASK) as usize
}

// ---------- Joueurs ----------
#[derive(Clone)]
pub struct Player {
    pub team: u8,
    pub alive: bool,
    pub is_bot: bool,
    pub res_mult: i32,
    pub build_mult: i32,
    /// bourse du joueur : seulement les monnaies de race, qui ne sont pas des objets physiques (ADN de la
    /// Souche, relevés des Transhumants). Dans les sauvegardes de version < 4, c'était la réserve commune :
    /// le reste y est converti en dépôt au chargement (save::convert_reserve).
    pub purse: [i32; NUM_ITEMS],
    pub researched: u64,
    pub research: u8,
    /** recherches en attente, lancées dans l'ordre quand la recherche en cours se termine */
    pub research_queue: Vec<u8>,
    pub tech_progress: Vec<u16>,
    pub commander: u32,
    pub produced: [u32; NUM_ITEMS],
    pub consumed: [u32; NUM_ITEMS],
    pub unit_count: u32,
    pub power_prod: i32,
    pub power_use: i32,
    pub kills: u32,
    pub losses: u32,
    /// ancien plafond de la réserve (sauvegardes de version < 4), sans usage
    pub old_stock_cap: i32,
    /// fragments d'énergie en réserve (gagnés en détruisant des nids ; ils permettent le surcadençage)
    pub shards: u32,
    /// EPPZ en réserve (capturés dans les ruines des Anciens, posés dans un socle)
    pub eppz: u32,
    /// race (voir data::RACES)
    pub race: u8,
    /// recherches acquises d'indice 64 à 127 (les 64 premières sont dans `researched`)
    pub researched2: u64,
    /// Souche : dégâts subis par ses organismes, par famille d'armes, et familles auxquelles l'espèce est
    /// devenue résistante (un bit par famille ; voir essaim.rs, « Caractères acquis »)
    pub scars: [u32; crate::essaim::FAMILIES],
    pub adapt: u8,
    /// Transhumants : gabarits d'équipement, par type d'unité croissant (voir gabarits.rs)
    pub kits: Vec<crate::gabarits::Kit>,
}
crate::ser_struct!(Player { team, alive, is_bot, res_mult, build_mult, purse, researched, research, research_queue, tech_progress, commander, produced, consumed, unit_count, power_prod, power_use, kills, losses, old_stock_cap; since 2: shards, eppz; since 3: race, researched2; since 7: scars, adapt; since 11: kits });

impl Player {
    /// Lance la première recherche de la file dont les prérequis sont acquis (les entrées déjà
    /// acquises sont retirées) ; ne fait rien si une recherche est en cours.
    pub fn start_queued(&mut self) {
        let (lo, hi) = (self.researched, self.researched2);
        let has = |t: u8| t == 0 || if t < 64 { lo & (1u64 << t) != 0 } else { hi & (1u64 << (t - 64)) != 0 };
        let mut q = std::mem::take(&mut self.research_queue);
        q.retain(|&t| !has(t));
        if self.research == 0 {
            if let Some(k) = q.iter().position(|&t| crate::races::prereq_ok(t, has)) {
                self.research = q.remove(k);
            }
        }
        self.research_queue = q;
    }

    #[inline]
    pub fn has_tech(&self, t: u8) -> bool {
        t == 0 || if t < 64 { self.researched & (1u64 << t) != 0 } else { t < 128 && self.researched2 & (1u64 << (t - 64)) != 0 }
    }

    /// Marque la recherche `t` comme acquise (et la recherche des Industriels qu'elle donne aussi).
    pub fn set_tech(&mut self, t: u8) {
        if t < 64 {
            self.researched |= 1u64 << t;
        } else if t < 128 {
            self.researched2 |= 1u64 << (t - 64);
        }
        let also = TECHS.get(t as usize).map_or(0, |d| d.also);
        if also != 0 && also != t {
            self.set_tech(also);
        }
    }
}

// ---------- Ordres des unités ----------
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Order {
    /// déplacement vers (x, y) ; (gx, gy) : but du groupe (champ de flux partagé). `pace` : allure d'un
    /// déplacement en formation, en seizièmes de sous-unité par tick (0 : pas de formation, pleine vitesse ;
    /// voir formation::paces). `wait` : ticks d'attente encore permis à sa place pour le reste du
    /// groupe (voir formation::hold)
    Move { x: i32, y: i32, gx: i32, gy: i32, attack: bool, pace: u16, wait: u16 },
    Patrol { x: i32, y: i32, ox: i32, oy: i32 },
    Attack { target: u32 },
    AttackGround { x: i32, y: i32 },
    Build { kind: u16, x: i32, y: i32, dir: u8, bid: u32 },
    Assist { target: u32 },
    Reclaim { target: u32 },
    Load { target: u32 },
    Unload { x: i32, y: i32 },
    Teleport { x: i32, y: i32 },
    Jump { beacon: u32 },
    Enter { target: u32 },
    /// se tourner vers l'angle `a` (16 bits) : fin d'un déplacement en formation orientée
    Face { a: i32 },
    /// commandant : se poster près d'un de nos tapis et en retirer les objets qui passent sur cette
    /// case, mis dans sa soute (ses drones les rapportent à un dépôt)
    Collect { target: u32 },
    /// commandant : récolter le gisement de la case (x, y) (cases) et fondre le minerai dans sa
    /// fonderie intégrée ; le produit fondu va dans sa soute (voir units::HARVEST_*)
    Harvest { x: i32, y: i32 },
    /// chenillard des Transhumants : rouler jusqu'au point (x, y) (sous-unités) et s'y déployer (clic droit
    /// d'un chenillard foreuse sur un gisement ; voir transhumants::deploy_at)
    /// `dir` : sens du module choisi par le joueur + 1 (0 : sens automatique)
    DeployAt { x: i32, y: i32, dir: u8 },
    /// commandant ou ingénieur : se poster près d'un de nos extracteurs ou fabricants et ramasser ce qui
    /// attend dans sa sortie, mis dans sa soute (voir units::PICKUP_RANGE)
    Pickup { target: u32 },
    /// commandant ou ingénieur : porter l'objet `item` de sa soute (0 : tout ce qu'elle contient) au dépôt
    /// le plus proche qui a de la place (voir drones::deliver_target)
    Deliver { item: u8 },
    /// Reine de la Souche : apprivoiser un nid de mordeurs sauvage (référence du nid ; voir souche::tame)
    Tame { target: u32 },
    /// organisme de la Souche : se sacrifier dans une graine-mère en croissance (voir souche::sacrifice)
    Sacrifice { target: u32 },
    /// chariot de convoi des Transhumants : navette entre sa soute et le module `site` ; `feed` : de la soute
    /// vers le fabricant (ingrédients de sa recette), sinon du module vers la soute (ce qui sort)
    Haul { site: u32, feed: bool },
    /// transport volant : navette sans fin entre A (embarquement des unités de combat qui y attendent) et B
    /// (débarquement ; voir units::ferry_step)
    Ferry { ax: i32, ay: i32, bx: i32, by: i32 },
}

impl Order {
    pub fn code(&self) -> u8 {
        match self {
            Order::Move { attack: false, .. } => 1,
            Order::Move { attack: true, .. } => 2,
            Order::Patrol { .. } => 3,
            Order::Attack { .. } => 4,
            Order::AttackGround { .. } => 5,
            Order::Build { .. } => 6,
            Order::Assist { .. } => 7,
            Order::Reclaim { .. } => 8,
            Order::Load { .. } => 9,
            Order::Unload { .. } => 10,
            Order::Teleport { .. } => 11,
            Order::Jump { .. } => 12,
            Order::Enter { .. } => 13,
            Order::Face { .. } => 14,
            Order::Collect { .. } => 15,
            Order::Harvest { .. } => 16,
            // 17 : sans sens (sauvegardes du 22 novembre 2026), 20 : avec le sens
            Order::DeployAt { .. } => 20,
            Order::Pickup { .. } => 18,
            Order::Deliver { .. } => 19,
            Order::Tame { .. } => 21,
            Order::Haul { .. } => 22,
            Order::Ferry { .. } => 23,
            Order::Sacrifice { .. } => 24,
        }
    }
}

impl Ser for Order {
    fn ser(&self, w: &mut crate::ser::W) {
        w.u8(self.code());
        match *self {
            Order::Move { x, y, gx, gy, pace, wait, .. } => {
                x.ser(w);
                y.ser(w);
                gx.ser(w);
                gy.ser(w);
                if w.version >= 10 {
                    pace.ser(w);
                    wait.ser(w);
                } else {
                    0u32.ser(w);
                }
            }
            Order::Ferry { ax, ay, bx, by } => {
                ax.ser(w);
                ay.ser(w);
                bx.ser(w);
                by.ser(w);
            }
            Order::Patrol { x, y, ox, oy } => {
                x.ser(w);
                y.ser(w);
                ox.ser(w);
                oy.ser(w);
            }
            Order::Attack { target } | Order::Assist { target } | Order::Reclaim { target } | Order::Load { target } | Order::Enter { target } | Order::Collect { target } | Order::Pickup { target } | Order::Tame { target } | Order::Sacrifice { target } => target.ser(w),
            Order::Deliver { item } => item.ser(w),
            Order::Haul { site, feed } => {
                site.ser(w);
                (feed as u8).ser(w);
            }
            Order::Jump { beacon } => beacon.ser(w),
            Order::DeployAt { x, y, dir } => {
                x.ser(w);
                y.ser(w);
                dir.ser(w);
            }
            Order::Face { a } => a.ser(w),
            Order::AttackGround { x, y } | Order::Unload { x, y } | Order::Teleport { x, y } | Order::Harvest { x, y } => {
                x.ser(w);
                y.ser(w);
            }
            Order::Build { kind, x, y, dir, bid } => {
                kind.ser(w);
                x.ser(w);
                y.ser(w);
                dir.ser(w);
                bid.ser(w);
            }
        }
    }
    fn de(r: &mut crate::ser::R) -> Self {
        let c = r.u8();
        let i = |r: &mut crate::ser::R| i32::de(r);
        let u = |r: &mut crate::ser::R| u32::de(r);
        match c {
            1 | 2 => {
                let (x, y, gx, gy) = (i(r), i(r), i(r), i(r));
                // formation : rien avant la version 2, tick d'arrivée prévu jusqu'à la 9 (le groupe reste en
                // formation, chacun à sa vitesse)
                let (pace, wait) = match r.version {
                    0 | 1 => (0, 0),
                    2..=9 => (if u(r) != 0 { u16::MAX } else { 0 }, 0),
                    _ => (u16::de(r), u16::de(r)),
                };
                Order::Move { x, y, gx, gy, attack: c == 2, pace, wait }
            }
            3 => Order::Patrol { x: i(r), y: i(r), ox: i(r), oy: i(r) },
            4 => Order::Attack { target: u(r) },
            5 => Order::AttackGround { x: i(r), y: i(r) },
            6 => Order::Build { kind: u16::de(r), x: i(r), y: i(r), dir: u8::de(r), bid: u(r) },
            7 => Order::Assist { target: u(r) },
            8 => Order::Reclaim { target: u(r) },
            9 => Order::Load { target: u(r) },
            10 => Order::Unload { x: i(r), y: i(r) },
            11 => Order::Teleport { x: i(r), y: i(r) },
            12 => Order::Jump { beacon: u(r) },
            14 => Order::Face { a: i(r) },
            15 => Order::Collect { target: u(r) },
            16 => Order::Harvest { x: i(r), y: i(r) },
            17 => Order::DeployAt { x: i(r), y: i(r), dir: 0 },
            18 => Order::Pickup { target: u(r) },
            19 => Order::Deliver { item: u8::de(r) },
            20 => Order::DeployAt { x: i(r), y: i(r), dir: u8::de(r) },
            21 => Order::Tame { target: u(r) },
            22 => Order::Haul { site: u(r), feed: u8::de(r) != 0 },
            23 => Order::Ferry { ax: i(r), ay: i(r), bx: i(r), by: i(r) },
            24 => Order::Sacrifice { target: u(r) },
            _ => Order::Enter { target: u(r) },
        }
    }
}

// ---------- Unités (tableaux par propriété) ----------
#[derive(Default)]
pub struct Units {
    pub alive: Vec<bool>,
    pub gen: Vec<u8>,
    pub kind: Vec<u16>,
    pub owner: Vec<u8>,
    pub x: Vec<i32>,
    pub y: Vec<i32>,
    pub px: Vec<i32>,
    pub py: Vec<i32>,
    pub facing: Vec<u16>,
    pub hp: Vec<i32>,
    pub cold: Vec<UnitCold>,
    pub free: Vec<u32>,
}

#[derive(Clone, Default)]
pub struct UnitCold {
    pub orders: Vec<Order>,
    pub turret: u16,
    pub cooldown: [u16; 2],
    pub wtarget: [u32; 2],
    pub stun: u16,
    pub shield: i32,
    pub shield_down: u16,
    pub goal: u64,
    pub stuck: u16,
    pub best_dist: i32,
    pub carried_by: u32,
    pub cargo: Vec<u32>,
    pub deployed: bool,
    pub timer: u16,
    pub parent: u32,
    pub children: u16,
    pub work: u32,
    pub flags: u8,
    pub salvo_left: [u8; 2],
    pub ready_tick: u32,
    pub noprog: u16,
    /// expérience : points de vie ennemis détruits, niveau de vétérance (0 à 5)
    pub xp: u32,
    pub lvl: u8,
    /// dernière unité qui l'a touché (crédit de la destruction)
    pub last_hit: u32,
    /// commando furtif : ticks pendant lesquels il reste visible après avoir tiré (0 : camouflé)
    pub reveal: u16,
    /// sortie d'une porte de transit : ticks pendant lesquels l'unité ne peut pas y rentrer à nouveau
    pub warp: u16,
    /// chenillard des Transhumants : 0 au repos, PACK_DEPLOYING pendant le déploiement, PACK_FOLDING
    /// pendant le repli ; `timer` compte les ticks (voir transhumants.rs)
    pub pack: u8,
    /// chenillard : recette du module replié (RECIPE_NONE : aucune) et combustible de son générateur
    pub pack_recipe: u8,
    pub pack_fuel: i32,
    /// constructeur : soute, objets apportés par ses drones (vide, ou NUM_ITEMS cases ; voir drones.rs) ;
    /// chenillard de soute des Transhumants : le stock de son dépôt replié
    pub hold: Vec<u16>,
    /// constructeur : dépôt où charger d'abord sa soute avant d'aller construire (NONE : aucun)
    pub supply_at: u32,
    /// bête d'un nid qu'une Reine de la Souche apprivoise : joueur + 1 qu'elle n'attaque pas (0 : aucun ;
    /// voir nature::taming)
    pub calm: u8,
    /// Transhumants : améliorations installées (un octet par emplacement), celle en cours d'installation (0 :
    /// aucune) et ses ticks restants (voir ameliorations.rs)
    pub mods: u64,
    pub mod_job: u8,
    pub mod_left: u16,
    /// équipement voulu, un octet par emplacement (0 : rien ; voir gabarits.rs)
    pub want: u32,
    /// chenillard des Transhumants : ce que son module replié garde en plus. Soute : navette de chacun de ses chariots
    /// (module, livraison) ; atelier : sa file (type, nombre ; NONE : en boucle)
    pub aboard: Vec<(u32, u32)>,
}
crate::ser_struct!(UnitCold { orders, turret, cooldown, wtarget, stun, shield, shield_down, goal, stuck, best_dist, carried_by, cargo, deployed, timer, parent, children, work, flags, salvo_left, ready_tick, noprog, xp, lvl, last_hit, reveal; since 2: warp; since 3: pack, pack_recipe, pack_fuel; since 4: hold, supply_at; since 5: calm; since 8: mods, mod_job, mod_left; since 11: want; since 12: aboard });

/// Niveau de vétérance maximal ; chaque niveau : +10 % de points de vie, +5 % de dégâts.
pub const MAX_LVL: u8 = 5;
/// Débris : au plus ce nombre, et pas plus vieux que cette durée (ticks).
pub const MAX_WRECKS: usize = 300;
pub const WRECK_LIFE: u32 = 6000;
crate::ser_struct!(Units { alive, gen, kind, owner, x, y, px, py, facing, hp, cold, free });

pub const UF_FIRING: u8 = 1;
pub const UF_WORKING: u8 = 2;
pub const UF_CHARGING: u8 = 4;

// ---------- Bâtiments ----------
#[derive(Clone, Default)]
pub struct Building {
    pub alive: bool,
    pub gen: u8,
    pub kind: u16,
    pub owner: u8,
    pub dir: u8,
    pub x: i32,
    pub y: i32,
    pub hp: i32,
    pub build: u32,
    pub paid: [u16; 4],
    pub net: u16,
    pub wake: u32,
    pub recipe: u8,
    pub inv: [u16; 6],
    pub out: u16,
    pub progress: u32,
    pub working: bool,
    pub hand: u8,
    pub phase: u8,
    pub timer: u16,
    pub line: u32,
    pub line_idx: u16,
    pub queue: Vec<(u16, u16)>,
    pub repeat: bool,
    pub rally: (i32, i32),
    pub cooldown: u16,
    pub target: u32,
    pub turret: u16,
    pub shield: i32,
    pub shield_down: u16,
    pub link: u32,
    pub charge: u32,
    pub ammo: u16,
    pub stun: u16,
    pub enabled: bool,
    pub watchers: Vec<u32>,
    pub stalled: bool,
    pub tech: u8,
    /// gare / héliport : objets à envoyer [0..NUM_ITEMS] puis objets reçus [NUM_ITEMS..2*NUM_ITEMS]
    pub stash: Vec<u16>,
    /// bras : part de la sortie de sa source qu'il prend, en % (0 : automatique, partage du reste)
    pub share: u8,
    /// bras : rotation de la prise à la dépose, en quarts de tour (1 : prend à droite, 2 : derrière,
    /// 3 : à gauche ; 0 vaut 2, le demi-tour habituel)
    pub turn: u8,
    /// répartiteur : sorties (0 : gauche, avant et droite ; 1 : gauche et avant ; 2 : droite et avant)
    pub split: u8,
    /// pureté du gisement sous le bâtiment (% ; 0 : normale), relevée à la pose
    pub purity: u8,
    /// cadence (% : 10 à 250 ; 0 : 100 %) et fragments d'énergie installés (un par tranche de 50 % au-dessus de 100 %)
    pub clock: u8,
    pub shards: u8,
    /// gare, héliport : objets par voyage des véhicules qui en partent (0 : automatique, ils partent
    /// dès qu'ils ont quelque chose ; sinon ils chargent au plus ce nombre et l'attendent avant de partir) ;
    /// racine, rhizome de la Souche : supplément de coût (%) fixé à la pose (voir souche::far_pct)
    pub lot: u16,
    /// générateur : combustible en réserve, en kW × ticks (voir FUEL_HYDROCARBON)
    pub fuel: i32,
    /// générateur : alerte déjà donnée (0 aucune, 1 moins d'une minute, 2 à sec)
    pub fuel_alert: u8,
    /// bras : compteur de tour de rôle (ordonnancement à pas pondérés)
    pub pass: u64,
    /// source servie par plusieurs bras : temps virtuel du dernier service
    pub vpass: u64,
    /// niveau d'amélioration (extracteur : voir EXTRACTOR_LEVELS)
    pub level: u8,
    /// étage d'un tapis (0 : sol ; 1 et 2 : surélevé, voir map::FLOORS)
    pub floor: u8,
    /// amélioration en cours (extracteur, assembleur) : ticks écoulés + 1 (0 : aucune), voir buildings::upgrade
    pub upgrade: u32,
    /// dépôt amélioré : objets remis en sortie (tapis qui partent de ses faces, bras), à tour de rôle
    pub filters: Vec<u8>,
    /// débit de la dernière minute : objets (ou unités, cycles de recherche) comptés par tranche de
    /// FLOW_SLICE ticks, tranche `t` dans la case `t % FLOW_SLICES` ; voir buildings::flow_add
    pub flow: [u16; FLOW_SLICES],
    /// dernière tranche comptée dans `flow`
    pub flow_at: u32,
    /// module des Transhumants : améliorations, installation en cours (comme `UnitCold::mods`), et cycles comptés
    /// pour les améliorations de rendement (voir ameliorations.rs)
    pub mods: u64,
    pub mod_job: u8,
    pub mod_left: u16,
    pub mod_n: u8,
    /// atelier des Transhumants : équipement déjà payé de l'unité en cours (voir gabarits.rs)
    pub kit: u32,
}
crate::ser_struct!(Building {
    alive, gen, kind, owner, dir, x, y, hp, build, paid, net, wake, recipe, inv, out, progress, working, hand, phase, timer, line, line_idx,
    queue, repeat, rally, cooldown, target, turret, shield, shield_down, link, charge, ammo, stun, enabled, watchers, stalled, tech, stash,
    share, pass, vpass, level, floor, upgrade, filters, flow, flow_at, turn, lot, fuel, fuel_alert, split; since 2: clock, shards, purity; since 8: mods, mod_job, mod_left, mod_n; since 11: kit
});

impl Building {
    #[inline]
    pub fn def(&self) -> &'static BuildingDef {
        bdef(self.kind)
    }
    #[inline]
    pub fn complete(&self) -> bool {
        self.build >= BUILD_FULL
    }
    /// Dimensions tenant compte de l'orientation.
    #[inline]
    pub fn size(&self) -> (i32, i32) {
        let (w, h) = self.def().size;
        if self.dir & 1 == 1 {
            (h as i32, w as i32)
        } else {
            (w as i32, h as i32)
        }
    }
    /// Centre en sous-unités.
    #[inline]
    pub fn center(&self) -> (i32, i32) {
        let (w, h) = self.size();
        (self.x * TILE + w * TILE / 2, self.y * TILE + h * TILE / 2)
    }
}

// ---------- Projectiles et épaves ----------
/// Bâtiment détruit à reconstruire : type, position, direction (bits de niveau compris), recette, et
/// l'ingénieur qui s'en charge (NONE : personne).
#[derive(Clone, Copy, Default)]
pub struct Ghost {
    pub owner: u8,
    pub kind: u16,
    pub x: i32,
    pub y: i32,
    pub dir: u8,
    pub recipe: u8,
    pub taken: u32,
}
crate::ser_struct!(Ghost { owner, kind, x, y, dir, recipe, taken });

#[derive(Clone, Copy, Default)]
pub struct Projectile {
    pub weapon: u8,
    pub owner: u8,
    pub x0: i32,
    pub y0: i32,
    pub tx: i32,
    pub ty: i32,
    pub target: u32,
    pub t: u16,
    pub total: u16,
    pub dmg: i32,
    pub aoe: i32,
    pub special: u8, // 0 normal, 1 missile stratégique, 2 frappe orbitale, 3 rayon prolongé (combat::SPECIAL_BEAM)
    /// unité qui a tiré (NONE : bâtiment ou arme spéciale)
    pub src: u32,
}
crate::ser_struct!(Projectile { weapon, owner, x0, y0, tx, ty, target, t, total, dmg, aoe, special, src });

#[derive(Clone, Copy, Default)]
pub struct Wreck {
    pub alive: bool,
    pub gen: u8,
    pub x: i32,
    pub y: i32,
    pub iron: i32,
    pub steel: i32,
    pub size: u8,
    /// tick de création (ou du dernier ajout) : les débris disparaissent avec le temps
    pub born: u32,
    /// modèle détruit (rendu de l'épave) : 0 inconnu, 1 + type d'unité, ou WRECK_BUILDING | type de bâtiment
    pub model: u16,
    /// orientation du modèle (angle 16 bits)
    pub rot: u16,
}
crate::ser_struct!(Wreck { alive, gen, x, y, iron, steel, size, born, model, rot });

/// Épave d'un bâtiment (sinon d'une unité) dans `Wreck::model`.
pub const WRECK_BUILDING: u16 = 0x8000;

#[derive(Clone, Default)]
pub struct Net {
    /// puissance des générateurs qui ont du combustible (kW)
    pub prod: i32,
    pub demand: i32,
    pub demand_next: i32,
    pub sat: i32, // 0..1024
    pub owner: u8,
    /// générateurs de la zone, par indice croissant
    pub gens: Vec<u32>,
    /// puissance installée (tous générateurs terminés, avec ou sans combustible)
    pub cap: i32,
    /// réseau illimité de World::infinite_grid (tests et démos)
    pub unlimited: bool,
    /// consommation permanente des tapis de la zone (kW)
    pub belt_demand: i32,
    /// Souche : réserve du réseau de racines (sève, sels) et son plafond (voir souche.rs)
    pub seve: i32,
    pub sels: i32,
    pub store: i32,
}
crate::ser_struct!(Net { prod, demand, demand_next, sat, owner, gens, cap, unlimited, belt_demand; since 3: seve, sels, store });

// Événements pour le rendu (non hachés, non sérialisés)
pub const EV_BEAM: i32 = 2;
pub const EV_EXPLOSION: i32 = 3;
pub const EV_UNIT_DIED: i32 = 4;
pub const EV_BUILDING_DIED: i32 = 5;
pub const EV_BUILT: i32 = 6;
pub const EV_RESEARCH: i32 = 7;
pub const EV_NUKE: i32 = 8;
pub const EV_ELIMINATED: i32 = 9;
pub const EV_UNIT_CREATED: i32 = 10;
pub const EV_SHIELD_HIT: i32 = 11;
pub const EV_TELEPORT: i32 = 12;
pub const EV_FIRE: i32 = 13;
pub const EV_INTERCEPT: i32 = 14;
pub const EV_ORBITAL: i32 = 15;
pub const EV_GAME_OVER: i32 = 16;
/// montée en grade d'une unité : x, y, niveau, joueur
pub const EV_PROMOTED: i32 = 17;
/// unité donnée à un allié par un portail : x, y, ancien propriétaire, nouveau propriétaire
pub const EV_GIFT: i32 = 18;
/// Attaque subie : joueur visé, x, y, 1 si c'est son commandant (au plus un toutes les 2 s par joueur et par type).
pub const EV_ATTACKED: i32 = 19;
/// Usine à l'arrêt faute de composants depuis 10 s : joueur, x, y (centre), premier composant manquant.
pub const EV_FACTORY_STARVED: i32 = 20;
/// générateur : moins d'une minute de combustible à la charge actuelle [joueur, x, y, type]
pub const EV_FUEL_LOW: i32 = 41;
/// générateur à sec : sa zone s'éteint [joueur, x, y, type]
pub const EV_FUEL_DRY: i32 = 42;
/// nid détruit : le joueur a gagné des fragments d'énergie (a : joueur, e : nombre)
pub const EV_SHARDS: i32 = 43;
/// EPPZ capturé dans une ruine des Anciens (a : joueur, b, c : position)
pub const EV_EPPZ: i32 = 44;

/// Débit des bâtiments : une minute découpée en tranches de 10 s.
pub const FLOW_SLICE: u32 = 200;
pub const FLOW_SLICES: usize = 6;

pub struct World {
    pub params: Vec<i32>,
    pub tick: u32,
    pub rng: Rng,
    pub map: Map,
    pub trig: Trig,
    pub players: Vec<Player>,
    pub units: Units,
    pub buildings: Vec<Building>,
    pub bfree: Vec<u32>,
    /// Bâtiments qui ont une logique par tick, triés par indice.
    pub active: Vec<u32>,
    pub belts: Belts,
    pub projectiles: Vec<Projectile>,
    pub wrecks: Vec<Wreck>,
    pub wfree: Vec<u32>,
    pub nets: Vec<Net>,
    pub power_dirty: bool,
    /// réseau partout (tests et démos seulement, jamais dans une vraie partie) : un bâtiment hors de toute
    /// zone est quand même alimenté, sans limite
    pub infinite_grid: bool,
    pub nav: Nav,
    pub winner: i32,
    // ---- dérivé (reconstruit) ----
    pub grid: crate::grid::Grids,
    pub vis: Vec<Vec<u8>>,
    pub vis_w: i32,
    pub shields: Vec<(i32, i32, i32, u8, u32)>,
    pub events: Vec<i32>,
    pub dead_units: Vec<u32>,
    pub dead_buildings: Vec<u32>,
    pub buildings_version: u32,
    pub n_teams: u8,
    /// dépôts et entrepôts d'équipe terminés, par indice croissant (dérivé, voir drones::store_added)
    pub stores: Vec<u32>,
    /// relais logistiques terminés, par indice croissant (dérivé, voir drones::store_added)
    pub relays: Vec<u32>,
    /// trains et drones de fret
    pub carriers: Vec<crate::logistics::Carrier>,
    /// bâtiments détruits à reconstruire (fantômes) : les ingénieurs inactifs s'en chargent
    pub ghosts: Vec<Ghost>,
    /// unité qui tire (pendant la résolution d'un tir ou d'un impact), pour créditer la destruction
    pub shooter: u32,
    /// origine du tir en cours de résolution (blindage frontal du Gardien) ; i32::MIN : inconnue
    pub hit_from: (i32, i32),
    /// arme du tir en cours de résolution (réplicateurs : seules certaines armes les blessent) ; 255 : inconnue
    pub hit_weapon: u8,
    /// prochain tick où un événement « attaque subie » peut être émis, par joueur et par type
    /// (sortie pour l'interface seulement : ni hachée ni sauvegardée)
    pub attack_ev: Vec<u32>,
    /// faune : nids, hordes, expansion (voir nature.rs) ; son joueur caché est le dernier de `players`
    pub nature: crate::nature::Nature,
    /// brouillard de guerre (réglage du salon, tiré de `params`) ; sans lui, chaque équipe voit toute la
    /// carte, et toute unité, même furtive ou immergée, est ciblable sans repérage
    pub fog: bool,
    /// Transhumants : usure de chaque gisement (‰, indice de `map.spots`) par leurs foreuses
    pub wear: Vec<u16>,
    /// Souche : flaques d'acide, de la plus ancienne à la plus récente (voir essaim.rs)
    pub acid: Vec<crate::essaim::Acid>,
    /// Souche : sol mangé (0, ou joueur + 1 ; vide tant que rien n'est mangé) et nombre de cases mangées
    /// (voir soil.rs)
    pub soil: Vec<u8>,
    pub soil_n: u32,
    /// Souche : terreau par case, un bit par joueur : zones des poteaux et sol mangé (dérivé, voir soil::ensure)
    pub terreau: Vec<u8>,
    /// Souche : organes qui mangent l'herbe dont le périmètre couvre chaque case (dérivé, voir soil::ensure)
    pub eaters: Vec<u16>,
    /// Souche : réseau que nourrit la Reine enracinée de chaque joueur (dérivé, refait à chaque tick)
    pub royal: Vec<u16>,
    /// Transhumants : état de chaque Arche (tourelles, atelier embarqué…), par case d'unité croissante
    pub arks: Vec<crate::ameliorations::Ark>,
}

impl World {
    /// params : [graine, taille, eau, nb joueurs, puis par joueur : équipe, bot, mult. ressources %, mult. construction %,
    /// puis la faune (0 aucune, 1 paisible, 2 normale, 3 agressive ; absente : aucune),
    /// puis le brouillard de guerre (0 désactivé, 1 activé ; absent : activé)]
    pub fn new(params: &[i32]) -> World {
        let seed = params.first().copied().unwrap_or(1) as u32;
        let size = if params.get(1).copied().unwrap_or(512) >= 1024 { 1024 } else { 512 };
        let water = params.get(2).copied().unwrap_or(0) != 0;
        let np = (params.get(3).copied().unwrap_or(2).clamp(1, MAX_PLAYERS as i32)) as usize;
        let map = Map::generate(seed, size, water, np);
        let mut players = Vec::new();
        let mut n_teams = 0u8;
        for i in 0..np {
            let b = 4 + i * 4;
            let team = params.get(b).copied().unwrap_or(i as i32).clamp(0, 7) as u8;
            n_teams = n_teams.max(team + 1);
            players.push(Player {
                team,
                alive: true,
                is_bot: params.get(b + 1).copied().unwrap_or(0) != 0,
                res_mult: params.get(b + 2).copied().unwrap_or(100).clamp(50, 500),
                build_mult: params.get(b + 3).copied().unwrap_or(100).clamp(50, 500),
                purse: [0; NUM_ITEMS],
                researched: 1,
                research: 0,
                research_queue: Vec::new(),
                tech_progress: vec![0; TECHS.len()],
                commander: NONE,
                produced: [0; NUM_ITEMS],
                consumed: [0; NUM_ITEMS],
                unit_count: 0,
                power_prod: 0,
                power_use: 0,
                kills: 0,
                losses: 0,
                old_stock_cap: 0,
                shards: 0,
                eppz: 0,
                race: 0,
                researched2: 0,
                scars: [0; crate::essaim::FAMILIES],
                adapt: 0,
                kits: Vec::new(),
            });
        }
        // faune : un joueur caché de plus, après les vrais joueurs
        let fauna = params.get(4 + np * 4).copied().unwrap_or(0).clamp(0, 3) as u8;
        let nature = crate::nature::Nature::new(fauna, np as u8, map.w);
        if nature.active() {
            players.push(crate::nature::nature_player());
        }
        // brouillard de guerre : après la faune ; absent (anciennes sauvegardes) : activé
        let fog = params.get(5 + np * 4).copied().unwrap_or(1) != 0;
        // races : une par joueur, après le brouillard ; absentes (anciennes parties) : Industriels
        for (i, pl) in players.iter_mut().enumerate().take(np) {
            pl.race = params.get(6 + np * 4 + i).copied().unwrap_or(0).clamp(0, NUM_RACES as i32 - 1) as u8;
            crate::races::start_stock(pl);
        }
        let vis_w = map.w / 4;
        let nav = Nav::new(&map);
        let mut w = World {
            params: params.to_vec(),
            tick: 0,
            rng: Rng::new(seed as u64),
            trig: Trig::new(),
            grid: crate::grid::Grids::new(map.w, map.h),
            map,
            players,
            units: Units::default(),
            buildings: Vec::new(),
            bfree: Vec::new(),
            active: Vec::new(),
            belts: Belts::default(),
            projectiles: Vec::new(),
            wrecks: Vec::new(),
            wfree: Vec::new(),
            nets: vec![Net::default()],
            power_dirty: true,
            infinite_grid: false,
            nav,
            winner: -1,
            vis: vec![vec![0u8; (vis_w * vis_w) as usize]; n_teams as usize],
            vis_w,
            shields: Vec::new(),
            events: Vec::new(),
            dead_units: Vec::new(),
            dead_buildings: Vec::new(),
            buildings_version: 0,
            n_teams,
            stores: Vec::new(),
            relays: Vec::new(),
            carriers: Vec::new(),
            ghosts: Vec::new(),
            shooter: NONE,
            hit_from: (i32::MIN, 0),
            hit_weapon: 255,
            attack_ev: Vec::new(),
            nature,
            fog,
            wear: Vec::new(),
            acid: Vec::new(),
            soil: Vec::new(),
            soil_n: 0,
            terreau: Vec::new(),
            eaters: Vec::new(),
            royal: Vec::new(),
            arks: Vec::new(),
        };
        w.wear = vec![0; w.map.spots.len()];
        for p in 0..np {
            let (sx, sy) = w.map.starts[p];
            let kind = crate::races::commander_kind(w.players[p].race);
            let id = w.spawn_unit(kind, p as u8, sx * TILE + TILE / 2, sy * TILE + TILE / 2);
            w.players[p].commander = id;
        }
        w.update_vis_all();
        w
    }

    /// Bâtiments de départ d'une vraie partie : le générateur principal de chaque joueur, près de son
    /// commandant, avec un peu de combustible, et les nids de la faune (les tests partent d'un monde vide).
    pub fn place_start_buildings(&mut self) {
        for p in 0..self.map.starts.len() {
            if crate::races::place_start(self, p) {
                continue;
            }
            let (sx, sy) = self.map.starts[p];
            // première place : celle que la carte prévoit (anneau de gisements, voir map::MAIN_GEN_SPOT)
            for &(dx, dy) in &[crate::map::MAIN_GEN_SPOT, (-5, -1), (-1, 3), (-1, -5), (3, 3), (-5, -5), (3, -5), (-5, 3)] {
                if let Some(b) = crate::buildings::place_building(self, p as u8, B_MAIN_GENERATOR, sx + dx, sy + dy, 0) {
                    crate::buildings::complete_building(self, b);
                    self.buildings[b].fuel = START_FUEL_UNITS * FUEL_HYDROCARBON;
                    break;
                }
            }
            // ressources de départ : dans la soute du commandant (elle compte comme un dépôt), pas de dépôt
            if let Some(s) = crate::drones::commander_store(self, p as u8) {
                for &(it, n) in START_ITEMS {
                    crate::drones::put(&mut self.units.cold[s].hold, it, n);
                }
            }
        }
        crate::buildings::rebuild_power(self);
        crate::souche::endow_start(self);
        crate::nature::place_initial_nests(self);
    }

    pub fn team_of(&self, p: u8) -> u8 {
        self.players.get(p as usize).map(|x| x.team).unwrap_or(255)
    }

    /// Signale une attaque subie par `owner` (au plus un événement toutes les 2 s par joueur et par type).
    pub fn note_attacked(&mut self, owner: u8, attacker: u8, x: i32, y: i32, commander: bool) {
        let np = self.players.len();
        if attacker as usize >= np || owner as usize >= np || self.team_of(attacker) == self.team_of(owner) {
            return;
        }
        if self.attack_ev.len() < np * 2 {
            self.attack_ev.resize(np * 2, 0);
        }
        let k = owner as usize * 2 + commander as usize;
        if self.tick < self.attack_ev[k] {
            return;
        }
        self.attack_ev[k] = self.tick + 40;
        self.ev(EV_ATTACKED, owner as i32, x, y, commander as i32);
    }

    pub fn ev(&mut self, a: i32, b: i32, c: i32, d: i32, e: i32) {
        if self.events.len() < 20000 {
            self.events.extend_from_slice(&[a, b, c, d, e]);
        }
    }

    // ---------- Unités ----------
    pub fn spawn_unit(&mut self, kind: u16, owner: u8, x: i32, y: i32) -> u32 {
        let def = udef(kind);
        let u = &mut self.units;
        let slot = if let Some(s) = u.free.pop() {
            s as usize
        } else {
            u.alive.push(false);
            u.gen.push(0);
            u.kind.push(0);
            u.owner.push(0);
            u.x.push(0);
            u.y.push(0);
            u.px.push(0);
            u.py.push(0);
            u.facing.push(0);
            u.hp.push(0);
            u.cold.push(UnitCold::default());
            u.alive.len() - 1
        };
        u.alive[slot] = true;
        u.gen[slot] = u.gen[slot].wrapping_add(1);
        u.kind[slot] = kind;
        u.owner[slot] = owner;
        u.x[slot] = x;
        u.y[slot] = y;
        u.px[slot] = x;
        u.py[slot] = y;
        u.facing[slot] = 16384;
        u.hp[slot] = def.hp;
        u.cold[slot] = UnitCold { wtarget: [NONE; 2], carried_by: NONE, parent: NONE, last_hit: NONE, supply_at: NONE, shield: def.shield_hp, best_dist: i32::MAX, ..UnitCold::default() };
        if kind == U_COMMANDER {
            // le bouclier personnel vient de la recherche
            u.cold[slot].shield = 0;
        }
        u.cold[slot].pack_recipe = RECIPE_NONE;
        let m = self.race_hp_mult(owner, kind);
        if m != 1000 {
            self.units.hp[slot] = (def.hp as i64 * m as i64 / 1000) as i32;
        }
        if kind == U_ARK {
            crate::ameliorations::ark_added(self, slot);
        }
        self.players[owner as usize].unit_count += 1;
        let id = slot as u32 | ((self.units.gen[slot] as u32) << SLOT_BITS);
        self.ev(EV_UNIT_CREATED, owner as i32, kind as i32, x, y);
        id
    }

    /// Indice d'une unité vivante correspondant à l'identifiant (avec génération).
    #[inline]
    pub fn unit(&self, id: u32) -> Option<usize> {
        if id & (REF_BUILDING | REF_WRECK) != 0 || id == NONE {
            return None;
        }
        let s = slot_of(id);
        if s < self.units.alive.len() && self.units.alive[s] && self.units.gen[s] as u32 == (id >> SLOT_BITS) & 0xff {
            Some(s)
        } else {
            None
        }
    }
    #[inline]
    pub fn unit_id(&self, s: usize) -> u32 {
        s as u32 | ((self.units.gen[s] as u32) << SLOT_BITS)
    }
    #[inline]
    pub fn building(&self, r: u32) -> Option<usize> {
        if r & REF_BUILDING == 0 || r == NONE {
            return None;
        }
        let s = slot_of(r & REF_MASK);
        if s < self.buildings.len() && self.buildings[s].alive && self.buildings[s].gen as u32 == ((r & REF_MASK) >> SLOT_BITS) & 0xff {
            Some(s)
        } else {
            None
        }
    }
    #[inline]
    pub fn building_ref(&self, s: usize) -> u32 {
        REF_BUILDING | s as u32 | ((self.buildings[s].gen as u32) << SLOT_BITS)
    }
    #[inline]
    pub fn wreck(&self, r: u32) -> Option<usize> {
        if r & REF_WRECK == 0 || r & REF_BUILDING != 0 || r == NONE {
            return None;
        }
        let s = slot_of(r & REF_MASK);
        if s < self.wrecks.len() && self.wrecks[s].alive && self.wrecks[s].gen as u32 == ((r & REF_MASK) >> SLOT_BITS) & 0xff {
            Some(s)
        } else {
            None
        }
    }
    #[inline]
    pub fn wreck_ref(&self, s: usize) -> u32 {
        REF_WRECK | s as u32 | ((self.wrecks[s].gen as u32) << SLOT_BITS)
    }

    /// Position d'une cible (unité, bâtiment ou épave).
    pub fn ref_pos(&self, r: u32) -> Option<(i32, i32)> {
        if let Some(s) = self.unit(r) {
            return Some((self.units.x[s], self.units.y[s]));
        }
        if let Some(b) = self.building(r) {
            return Some(self.buildings[b].center());
        }
        if let Some(wk) = self.wreck(r) {
            return Some((self.wrecks[wk].x, self.wrecks[wk].y));
        }
        None
    }

    /// Points de vie maximum d'une unité (vétérance comprise).
    #[inline]
    pub fn max_hp(&self, s: usize) -> i32 {
        let base = udef(self.units.kind[s]).hp * (100 + 10 * self.units.cold[s].lvl as i32) / 100;
        let m = self.race_hp_mult(self.units.owner[s], self.units.kind[s]);
        if m == 1000 {
            base
        } else {
            (base as i64 * m as i64 / 1000) as i32
        }
    }

    /// Points de vie (‰) selon la race et ses recherches (mutations de la Souche, blindage des Transhumants).
    pub fn race_hp_mult(&self, owner: u8, kind: u16) -> i32 {
        match self.players.get(owner as usize).map_or(0, |p| p.race) {
            RACE_SOUCHE => crate::souche::hp_mult(self, owner, kind),
            RACE_TRANSH => crate::transhumants::hp_mult(self, owner, kind),
            _ => 1000,
        }
    }

    pub fn spawn_wreck(&mut self, x: i32, y: i32, cost: &[(u8, u16)], size: u8, model: u16, rot: u16) {
        let (iron, steel) = wreck_value(cost);
        if iron + steel <= 0 {
            return;
        }
        // un débris tout proche absorbe le nouveau (moins de débris sur un champ de bataille)
        let near = (2 * TILE) as i64;
        if let Some(k) = self.wrecks.iter().position(|wk| wk.alive && dist2(wk.x, wk.y, x, y) <= near * near) {
            let wk = &mut self.wrecks[k];
            wk.iron += iron;
            wk.steel += steel;
            // le plus gros débris donne sa forme à l'épave
            if size > wk.size || wk.model == 0 {
                wk.model = model;
                wk.rot = rot;
            }
            wk.size = wk.size.max(size).saturating_add(if wk.size < 6 { 1 } else { 0 });
            wk.born = self.tick;
            return;
        }
        // trop de débris : le plus ancien disparaît
        let alive = self.wrecks.iter().filter(|wk| wk.alive).count();
        if alive >= MAX_WRECKS {
            if let Some(k) = (0..self.wrecks.len()).filter(|&k| self.wrecks[k].alive).min_by_key(|&k| (self.wrecks[k].born, k)) {
                self.wrecks[k].alive = false;
                self.wfree.push(k as u32);
            }
        }
        let w = Wreck { alive: true, gen: 0, x, y, iron, steel, size, born: self.tick, model, rot };
        if let Some(s) = self.wfree.pop() {
            let g = self.wrecks[s as usize].gen.wrapping_add(1);
            self.wrecks[s as usize] = Wreck { gen: g, ..w };
        } else {
            self.wrecks.push(w);
        }
    }

    // ---------- Pas de simulation ----------
    /// Débris trop anciens : disparus.
    fn expire_wrecks(&mut self) {
        for k in 0..self.wrecks.len() {
            let wk = &self.wrecks[k];
            if wk.alive && self.tick.saturating_sub(wk.born) > WRECK_LIFE {
                self.wrecks[k].alive = false;
                self.wfree.push(k as u32);
            }
        }
    }

    pub fn step(&mut self, orders: &[i32]) -> u32 {
        if self.tick % 20 == 7 && !self.ghosts.is_empty() {
            crate::buildings::rebuild_ghosts(self);
        }
        self.events.clear();
        if self.tick.is_multiple_of(100) {
            self.expire_wrecks();
        }
        crate::orders::apply_orders(self, orders);
        if self.power_dirty && self.tick.is_multiple_of(5) {
            crate::buildings::rebuild_power(self);
        }
        crate::buildings::power_tick(self);
        let teams: Vec<u8> = self.players.iter().map(|p| p.team).collect();
        self.grid.rebuild_units(&self.units, &teams);
        crate::combat::collect_shields(self);
        crate::soil::ensure(self);
        crate::essaim::refresh_royal(self);
        crate::buildings::update_buildings(self);
        crate::drones::plan(self);
        crate::belts::update_belts(self);
        crate::nature::update(self);
        crate::units::update_units(self);
        crate::essaim::update_units(self);
        crate::souche::regen_organs(self);
        crate::transhumants::update(self);
        crate::ameliorations::update(self);
        crate::combat::update_projectiles(self);
        crate::logistics::update_carriers(self);
        crate::combat::cleanup_dead(self);
        crate::flow::process_dirty(self);
        if self.tick.is_multiple_of(10) {
            self.update_vis_all();
        }
        self.tick += 1;
        self.hash()
    }

    pub fn update_vis_all(&mut self) {
        crate::combat::update_visibility(self);
    }

    pub fn hash(&self) -> u32 {
        let mut h = Hasher::new();
        h.add(self.tick as u64);
        h.add(self.rng.state);
        let u = &self.units;
        for s in 0..u.alive.len() {
            if u.alive[s] {
                h.add(s as u64);
                h.add_i32(u.x[s]);
                h.add_i32(u.y[s]);
                h.add_i32(u.hp[s]);
                h.add(u.kind[s] as u64 | (u.owner[s] as u64) << 16 | (u.facing[s] as u64) << 24);
                h.add(u.cold[s].orders.len() as u64);
                if let Some(Order::Harvest { .. }) = u.cold[s].orders.first() {
                    // récolte du commandant : avancement du cycle en cours
                    h.add(u.cold[s].work as u64);
                }
                // soute d'un constructeur
                if !u.cold[s].hold.is_empty() {
                    h.add(crate::drones::fold(&u.cold[s].hold) | (u.cold[s].supply_at as u64) << 40);
                }
                // améliorations des Transhumants
                if u.cold[s].mods != 0 || u.cold[s].mod_job != 0 {
                    h.add(u.cold[s].mods);
                    h.add(u.cold[s].mod_job as u64 | (u.cold[s].mod_left as u64) << 8);
                }
                if u.cold[s].want != 0 {
                    h.add(u.cold[s].want as u64);
                }
                // chenillard : navettes ou file à bord
                for &(a, b) in &u.cold[s].aboard {
                    h.add(a as u64 | (b as u64) << 32);
                }
            }
        }
        for (i, b) in self.buildings.iter().enumerate() {
            if b.alive {
                h.add(i as u64);
                h.add_i32(b.hp);
                h.add(b.build as u64 | (b.kind as u64) << 32);
                h.add(b.progress as u64 | (b.out as u64) << 32);
                // bâtiment coupé ou en pause (`enabled` faux ; vrai : rien d'ajouté, hash inchangé)
                h.add(b.hand as u64 | (b.timer as u64) << 8 | (!b.enabled as u64) << 24);
                // niveau et amélioration en cours (zone du générateur principal, vitesses, production)
                h.add(b.level as u64 | (b.upgrade as u64) << 8);
                // stock d'un dépôt ou d'un entrepôt, réserve d'une usine, tampons d'une gare
                if !b.stash.is_empty() {
                    h.add(crate::drones::fold(&b.stash));
                }
                if b.mods != 0 || b.mod_job != 0 {
                    h.add(b.mods);
                    h.add(b.mod_job as u64 | (b.mod_left as u64) << 8 | (b.mod_n as u64) << 24);
                }
                if b.kit != 0 {
                    h.add(b.kit as u64);
                }
            }
        }
        h.add(self.ghosts.len() as u64);
        for g in &self.ghosts {
            h.add(g.kind as u64 | (g.owner as u64) << 16 | (g.dir as u64) << 24 | (g.taken as u64) << 32);
            h.add_i32(g.x | g.y << 16);
        }
        for l in &self.belts.lines {
            if l.alive {
                h.add(l.items.len() as u64);
                if let Some(&(it, g)) = l.items.front() {
                    h.add(it as u64 | (g as u64) << 8);
                }
            }
        }
        for p in &self.players {
            h.add(p.researched);
            if p.researched2 != 0 {
                h.add(p.researched2);
            }
            // caractères acquis de la Souche (hash inchangé sans eux)
            if p.adapt != 0 {
                h.add(p.adapt as u64);
            }
            h.add(p.research as u64 | (p.tech_progress.iter().map(|&x| x as u64).sum::<u64>() << 8));
            for &q in &p.research_queue {
                h.add(q as u64);
            }
        }
        if self.soil_n != 0 {
            h.add(self.soil_n as u64);
        }
        for a in &self.acid {
            h.add_i32(a.x);
            h.add_i32(a.y);
            h.add(a.until as u64 | (a.dmg as u64) << 32);
        }
        for pr in &self.projectiles {
            h.add_i32(pr.tx);
            h.add_i32(pr.ty);
            h.add(pr.t as u64);
        }
        for wk in &self.wrecks {
            if wk.alive {
                h.add_i32(wk.iron + wk.steel * 7);
            }
        }
        for c in &self.carriers {
            h.add(c.alive as u64 | (c.state as u64) << 8 | (c.load as u64) << 16);
            h.add_i32(c.x);
            h.add_i32(c.y);
        }
        crate::nature::hash_into(self, &mut h);
        crate::ameliorations::hash_into(self, &mut h);
        h.finish32()
    }
}
