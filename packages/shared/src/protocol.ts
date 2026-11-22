// Messages échangés entre le client et le relais (JSON sur WebSocket).

export interface LobbyPlayer {
  slot: number;
  name: string;
  bot: boolean;
  personality?: string;
  aix?: number; // multiplicateur AIx en %, 100 = normal
  level?: string; // difficulté de l'IA : "facile" | "normal" | "difficile"
  team: number;
  /** race (0 Industriels, 1 Souche, 2 Transhumants ; voir data.races) ; les bots jouent les Industriels */
  race?: number;
  connected: boolean;
  host: boolean;
  /** partie chargée : nom du joueur qui occupait cette place dans la sauvegarde */
  savedName?: string;
}

/** Faune (nids de mordeurs, voir sim/src/nature.rs) : absente, paisible, normale ou agressive. */
export type Fauna = "none" | "peaceful" | "normal" | "aggressive";
export const FAUNA_LEVELS: Fauna[] = ["none", "peaceful", "normal", "aggressive"];
export const FAUNA_NAMES: Record<Fauna, string> = { none: "Aucune", peaceful: "Paisible", normal: "Normale", aggressive: "Agressive" };

/** Résumé d'une sauvegarde (liste du salon). */
export interface SaveMeta {
  id: string;
  name: string;
  savedAt: string; // date ISO
  tick: number;
  auto: boolean;
  mapSize: number;
  water: boolean;
  seed: number;
  fauna?: Fauna;
  /** brouillard de guerre ; absent (sauvegardes d'avant le réglage) : activé */
  fog?: boolean;
  players: { name: string; bot: boolean; team: number; personality?: string; aix?: number; level?: string; race?: number }[];
}

export interface LobbyState {
  players: LobbyPlayer[];
  mapSize: number; // 512 ou 1024
  water: boolean;
  seed: number;
  /** faune : nids de bêtes qui attaquent les joueurs qui s'étendent trop près */
  fauna: Fauna;
  /** brouillard de guerre (activé par défaut) ; désactivé, chacun voit toute la carte en permanence */
  fog: boolean;
  running: boolean;
  tick: number;
  /** sauvegarde chargée dans le salon : la composition et les paramètres en viennent (non modifiables) */
  save: SaveMeta | null;
}

export interface GameStart {
  params: number[]; // paramètres d'init de la simulation
  names: string[];
  you: number; // numéro du joueur local (-1 = spectateur)
  startTick: number;
}

/** Relevé statistique d'un joueur (voir packages/server/src/stats.ts). */
export interface PlayerStats {
  alive: boolean;
  /** unités (toutes, commandant compris) */
  units: number;
  /** unités de combat (ni commandant ni ingénieurs) */
  army: number;
  /** valeur des unités de combat en matière (minerai = 1) */
  armyValue: number;
  /** minerai extrait depuis le début de la partie */
  ore: number;
  /** énergie produite et consommée au moment du relevé (kW) */
  powerProd: number;
  powerUse: number;
  /** technologies recherchées */
  research: number;
  /** bâtiments terminés (hors tapis et bras) */
  buildings: number;
  kills: number;
  losses: number;
}

/** Relevé de tous les joueurs à un tick ; null = joueur d'une autre équipe, caché pendant la partie. */
export interface StatSample {
  tick: number;
  players: (PlayerStats | null)[];
}

export type ClientMsg =
  | { t: "hello"; name: string; token: string; key: string }
  | { t: "lobby"; action: "addBot" | "removeSlot" | "setTeam" | "setMap" | "start" | "setBot" | "loadSave" | "unloadSave" | "deleteSave" | "claimSlot" | "setRace"; slot?: number; team?: number; race?: number; mapSize?: number; water?: boolean; seed?: number; fauna?: Fauna; fog?: boolean; personality?: string; aix?: number; level?: string; id?: string }
  | { t: "save" }
  | { t: "cmd"; tick: number; cmd: number[] }
  | { t: "ack"; tick: number; hash?: number }
  | { t: "chat"; text: string }
  | { t: "speed"; speed: number } // 0 : pause (solo ou hôte) ; sinon reprise ou vitesse (solo)
  | { t: "quit" } // hôte : arrête la partie (sauvegarde automatique) et ramène tout le monde au salon
  | { t: "ping"; time: number };

export type ServerMsg =
  | { t: "welcome"; token: string; slot: number; lobby: LobbyState }
  | { t: "lobby"; lobby: LobbyState }
  | { t: "start"; start: GameStart }
  | { t: "snapshot"; tick: number; data: string; start: GameStart; stats?: StatSample[] } // état complet en base64, historique des relevés
  | { t: "tick"; tick: number; orders: number[] }
  | { t: "wait"; who: string[] }
  | { t: "chat"; from: string; text: string }
  | { t: "desync"; tick: number }
  | { t: "stats"; sample: StatSample } // relevé périodique (toutes les 600 ticks)
  | { t: "end"; winner: number; replay: string; stats?: StatSample[] } // historique complet, tous les joueurs
  | { t: "saved"; name: string; by: string; auto: boolean }
  | { t: "pong"; time: number }
  | { t: "speed"; speed: number; by: string; resume?: number } // vitesse de jeu ; 0 : pause (`resume` : vitesse de reprise)
  | { t: "quit"; by: string } // partie arrêtée par l'hôte : retour au salon
  | { t: "error"; message: string };

export const ORDER_DELAY = 3; // ticks
export const TICK_MS = 50;
/** Vitesses de jeu possibles (multiplicateur du rythme des ticks) ; réglables seulement en solo (un seul joueur humain).
 * La pause est la vitesse 0, hors de cette liste : en solo, ou par l'hôte d'une partie à plusieurs. */
export const GAME_SPEEDS = [0.5, 1, 1.5, 2, 3, 4];
export const HASH_EVERY = 20;

/** Paramètres d'init de la simulation à partir du lobby. */
export function simParams(lobby: LobbyState): number[] {
  const p = [lobby.seed | 0, lobby.mapSize, lobby.water ? 1 : 0, lobby.players.length];
  for (const pl of lobby.players) {
    // IA facile : économie (extraction, construction) à 80 % en plus de ses décisions plus lentes
    const m = pl.bot ? Math.round((pl.aix ?? 100) * (pl.level === "facile" ? 0.8 : 1)) : 100;
    p.push(pl.team, pl.bot ? 1 : 0, m, m);
  }
  // faune : dernier paramètre (0 aucune … 3 agressive)
  p.push(Math.max(0, FAUNA_LEVELS.indexOf(lobby.fauna ?? "none")));
  // brouillard de guerre : après la faune (1 activé, 0 désactivé ; absent : activé)
  p.push(lobby.fog === false ? 0 : 1);
  // races : une par joueur, après le brouillard (absentes : Industriels) ; les bots jouent les Industriels
  for (const pl of lobby.players) p.push(pl.bot ? 0 : (pl.race ?? 0));
  return p;
}

/** Nombre de races jouables (voir sim/src/data.rs, RACES). */
export const RACE_COUNT = 3;
/** Noms des races, dans l'ordre de la simulation. */
export const RACE_NAMES = ["Industriels", "Souche", "Transhumants"];

/** Race de chaque joueur d'une partie, lue dans ses paramètres d'init (absente : Industriels), comme la simulation. */
export function racesFromParams(params: number[]): number[] {
  const np = params[3] ?? 0;
  return Array.from({ length: np }, (_, i) => params[6 + np * 4 + i] ?? 0);
}

/** Brouillard de guerre d'une partie, lu dans ses paramètres d'init (absent : activé), comme la simulation. */
export function fogFromParams(params: number[]): boolean {
  const np = params[3] ?? 0;
  return (params[5 + np * 4] ?? 1) !== 0;
}
