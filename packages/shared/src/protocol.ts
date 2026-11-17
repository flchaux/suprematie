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
}

export interface LobbyState {
  players: LobbyPlayer[];
  mapSize: number; // 512 ou 1024
  water: boolean;
  seed: number;
  running: boolean;
  tick: number;
}

export interface GameStart {
  params: number[]; // paramètres d'init de la simulation
  names: string[];
  you: number; // numéro du joueur local (-1 = spectateur)
  startTick: number;
}

export type ClientMsg =
  | { t: "hello"; name: string; token: string; key: string }
  | { t: "lobby"; action: "addBot" | "removeSlot" | "setTeam" | "setMap" | "start" | "setBot"; slot?: number; team?: number; mapSize?: number; water?: boolean; seed?: number; personality?: string; aix?: number; level?: string }
  | { t: "cmd"; tick: number; cmd: number[] }
  | { t: "ack"; tick: number; hash?: number }
  | { t: "chat"; text: string }
  | { t: "ping"; time: number };

export type ServerMsg =
  | { t: "welcome"; token: string; slot: number; lobby: LobbyState }
  | { t: "lobby"; lobby: LobbyState }
  | { t: "start"; start: GameStart }
  | { t: "snapshot"; tick: number; data: string; start: GameStart } // état complet en base64
  | { t: "tick"; tick: number; orders: number[] }
  | { t: "wait"; who: string[] }
  | { t: "chat"; from: string; text: string }
  | { t: "desync"; tick: number }
  | { t: "end"; winner: number; replay: string }
  | { t: "pong"; time: number }
  | { t: "error"; message: string };

export const ORDER_DELAY = 3; // ticks
export const TICK_MS = 50;
export const HASH_EVERY = 20;

/** Paramètres d'init de la simulation à partir du lobby. */
export function simParams(lobby: LobbyState): number[] {
  const p = [lobby.seed | 0, lobby.mapSize, lobby.water ? 1 : 0, lobby.players.length];
  for (const pl of lobby.players) {
    const m = pl.bot ? pl.aix ?? 100 : 100;
    p.push(pl.team, pl.bot ? 1 : 0, m, m);
  }
  return p;
}
