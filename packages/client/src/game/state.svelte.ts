// État partagé entre le contrôleur de partie et l'interface Svelte (rafraîchi quelques fois par seconde).
import type { GameData, LobbyState } from "@supreme/shared";

export interface SelUnitGroup { kind: number; count: number; ids: number[] }
export interface Message { id: number; text: string; kind: "info" | "alert" | "chat" | "good"; time: number }

export const ui = $state({
  screen: "connect" as "connect" | "lobby" | "loading" | "game",
  name: "",
  slot: -1,
  connected: false,
  error: "",
  lobby: null as LobbyState | null,
  data: null as GameData | null,
  names: [] as string[],
  me: -1,
  tick: 0,
  // joueur local
  stock: [] as number[],
  produced: [] as number[],
  consumed: [] as number[],
  powerProd: 0,
  powerUse: 0,
  unitCount: 0,
  research: 0,
  researchProgress: 0,
  researchedLo: 0,
  researchedHi: 0,
  players: [] as { name: string; alive: boolean; team: number; units: number; kills: number; losses: number; bot: boolean; power: number }[],
  // sélection
  selUnits: [] as SelUnitGroup[],
  selBuilding: null as null | { ref: number; kind: number; owner: number },
  buildingInfo: null as null | Record<string, unknown>,
  canBuild: false,
  mode: "" as string,
  buildKind: -1,
  buildDir: 1,
  // divers
  messages: [] as Message[],
  waiting: [] as string[],
  gameOver: null as null | { winner: number; replay: string; won: boolean },
  fps: 0,
  simMs: 0,
  backend: "",
  showResearch: false,
  showStats: false,
  showHelp: false,
  chatOpen: false,
  volume: 0.5,
  replay: false,
  replaySpeed: 1,
  spectator: false,
  ping: 0,
});

let msgId = 0;
export function pushMessage(text: string, kind: Message["kind"] = "info"): void {
  ui.messages = [...ui.messages.slice(-6), { id: ++msgId, text, kind, time: performance.now() }];
}

export function hasTechUI(t: number): boolean {
  if (t === 0) return true;
  return t < 32 ? ((ui.researchedLo >>> t) & 1) === 1 : ((ui.researchedHi >>> (t - 32)) & 1) === 1;
}
