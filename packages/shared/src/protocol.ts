// Messages échangés entre le client et le relais (JSON sur WebSocket).

export interface LobbyPlayer {
  slot: number;
  name: string;
  bot: boolean;
  personality?: string;
  aix?: number; // multiplicateur AIx en %, 100 = normal
  level?: string; // difficulté de l'IA : "facile" | "normal" | "difficile"
  team: number;
  connected: boolean;
  host: boolean;
  /** partie chargée : nom du joueur qui occupait cette place dans la sauvegarde */
  savedName?: string;
}

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
  players: { name: string; bot: boolean; team: number; personality?: string; aix?: number; level?: string }[];
}

export interface LobbyState {
  players: LobbyPlayer[];
  mapSize: number; // 512 ou 1024
  water: boolean;
  seed: number;
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
  | { t: "lobby"; action: "addBot" | "removeSlot" | "setTeam" | "setMap" | "start" | "setBot" | "loadSave" | "unloadSave" | "deleteSave" | "claimSlot"; slot?: number; team?: number; mapSize?: number; water?: boolean; seed?: number; personality?: string; aix?: number; level?: string; id?: string }
  | { t: "save" }
  | { t: "cmd"; tick: number; cmd: number[] }
  | { t: "ack"; tick: number; hash?: number }
  | { t: "chat"; text: string }
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
  | { t: "error"; message: string };

export const ORDER_DELAY = 3; // ticks
export const TICK_MS = 50;
export const HASH_EVERY = 20;

/** Paramètres d'init de la simulation à partir du lobby. */
export function simParams(lobby: LobbyState): number[] {
  const p = [lobby.seed | 0, lobby.mapSize, lobby.water ? 1 : 0, lobby.players.length];
  for (const pl of lobby.players) {
    // IA facile : économie (extraction, construction) à 80 % en plus de ses décisions plus lentes
    const m = pl.bot ? Math.round((pl.aix ?? 100) * (pl.level === "facile" ? 0.8 : 1)) : 100;
    p.push(pl.team, pl.bot ? 1 : 0, m, m);
  }
  return p;
}
