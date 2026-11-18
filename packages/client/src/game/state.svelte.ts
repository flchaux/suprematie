// État partagé entre le contrôleur de partie et l'interface Svelte (rafraîchi quelques fois par seconde).
import type { GameData, LobbyState, StatSample } from "@supreme/shared";
import { DEFAULT_GFX, type GfxSettings } from "../render/gfx.ts";

export interface SelUnitGroup { kind: number; count: number; ids: number[]; /** vétérance la plus haute du groupe */ lvl?: number }
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
  /** stock commun de l'équipe (entrepôts d'équipe) */
  teamStock: [] as number[],
  /** plafond de la réserve, par objet (dépôts) */
  stockCap: 0,
  produced: [] as number[],
  consumed: [] as number[],
  powerProd: 0,
  powerUse: 0,
  unitCount: 0,
  research: 0,
  /** recherches en file (dans l'ordre) */
  researchQueue: [] as number[],
  researchProgress: 0,
  researchedLo: 0,
  researchedHi: 0,
  players: [] as { name: string; alive: boolean; team: number; units: number; kills: number; losses: number; bot: boolean; power: number }[],
  // sélection
  selUnits: [] as SelUnitGroup[],
  selBuilding: null as null | { ref: number; kind: number; owner: number },
  /** unités sélectionnées appartenant à un autre joueur : fiche de statistiques, sans ordres */
  selForeign: -1,
  /** gisement sélectionné (clic sur un gisement libre ou exploité) */
  selDeposit: null as null | { kind: number; x: number; y: number },
  /** construction prévue sélectionnée (fantôme : ordre non commencé ou bâtiment à reconstruire) */
  selPlan: null as null | { kind: number; x: number; y: number; dir: number },
  /** points de vie de l'unité sélectionnée (sélection d'une seule unité étrangère) */
  unitInfo: null as null | { hp: number; maxHp: number; lvl: number },
  buildingInfo: null as null | Record<string, unknown>,
  canBuild: false,
  mode: "" as string,
  buildKind: -1,
  buildDir: 1,
  // divers
  messages: [] as Message[],
  waiting: [] as string[],
  gameOver: null as null | { winner: number; replay: string; won: boolean },
  /** partie terminée (reste vrai après « Continuer à regarder ») : toutes les statistiques sont visibles */
  ended: false,
  /** relevés statistiques du serveur (toutes les 30 s) ; null = joueur caché (autre équipe) */
  stats: [] as StatSample[],
  fps: 0,
  simMs: 0,
  backend: "",
  showResearch: false,
  showStats: false,
  showHelp: false,
  /** écran des recettes débloquées */
  showRecipes: false,
  /** niveau des tapis à poser (0 : sol ; 1 et 2 : étages), choisi à la molette */
  buildFloor: 0,
  /** vue logistique affichée (touche maintenue) */
  logisticsView: false,
  chatOpen: false,
  volume: 0.5,
  music: 0.35,
  /** annonces vocales */
  voice: true,
  replay: false,
  replaySpeed: 1,
  spectator: false,
  ping: 0,
  gfx: loadGfx(),
  showGfx: false,
  showPerf: false,
  perf: { drawCalls: 0, triangles: 0, particles: 0, decor: 0, cpuMs: 0, shadowSize: 0, frameMs: 0 },
});

function loadGfx(): GfxSettings {
  try {
    return { ...DEFAULT_GFX, ...(JSON.parse(localStorage.getItem("supreme.gfx") ?? "{}") as Partial<GfxSettings>) };
  } catch {
    return { ...DEFAULT_GFX };
  }
}

let msgId = 0;
export function pushMessage(text: string, kind: Message["kind"] = "info"): void {
  ui.messages = [...ui.messages.slice(-6), { id: ++msgId, text, kind, time: performance.now() }];
}

export function hasTechUI(t: number): boolean {
  if (t === 0) return true;
  return t < 32 ? ((ui.researchedLo >>> t) & 1) === 1 : ((ui.researchedHi >>> (t - 32)) & 1) === 1;
}
