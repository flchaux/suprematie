// État partagé entre le contrôleur de partie et l'interface Svelte (rafraîchi quelques fois par seconde).
import type { GameData, LobbyState, ModInfo, StatSample, ZoneEconomy } from "@supreme/shared";
import { DEFAULT_GFX, type GfxSettings } from "../render/gfx.ts";

export interface SelUnitGroup { kind: number; count: number; ids: number[]; /** vétérance la plus haute du groupe */ lvl?: number }
export interface Message { id: number; text: string; kind: "info" | "alert" | "chat" | "good"; time: number }

/** Récolte du commandant en cours (sim : render::harvest_info) : ressource brute, produit fondu, case du
 * gisement, état (0 en route, 1 récolte, 2 combat, 3 soute pleine), avancement du cycle (‰), durée d'un cycle (ticks). */
export interface HarvestInfo { raw: number; out: number; x: number; y: number; state: number; progress: number; cycle: number }
/** Ramassage de la sortie d'un bâtiment (sim : render::pickup_info) : bâtiment, objet de sa sortie (0 : rien),
 * en attente, centre (cases), état (0 en route, 1 posté, 2 soute pleine vidée par les drones, 3 soute pleine que rien ne vide). */
export interface PickupInfo { kind: number; item: number; out: number; x: number; y: number; state: number }
/** Livraison de la soute (sim : render::deliver_info) : objet (0 : tout), dépôt visé (cases ; -1 : aucun). */
export interface DeliverInfo { item: number; x: number; y: number }

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
  /**
   * Disponible pour payer une construction (couleur des coûts du menu de construction et du fantôme) :
   * stocks à portée du lieu (fantôme sous le curseur, sinon constructeur choisi, sinon centre de l'écran),
   * réseau des relais logistiques qui le couvrent et soute des constructeurs choisis ; null tant qu'inconnu.
   */
  buildReach: null as number[] | null,
  /** Souche : racines ou rhizomes en cours de tracé : nombre posable, coût total [objet, quantité], supplément le plus fort (%) */
  lineCost: null as null | { n: number; cost: [number, number][]; pct: number },
  /** lieu de `buildReach` : « cursor » (fantôme), « builder » (constructeur choisi), « view » (centre de l'écran) */
  buildReachAt: "view" as "cursor" | "builder" | "view",
  /** stock commun de l'équipe (entrepôts d'équipe) */
  teamStock: [] as number[],
  /** capacité totale de vos dépôts, par objet */
  stockCap: 0,
  /** fragments d'énergie en réserve (surcadençage) */
  shards: 0,
  /** EPPZ en réserve (ruines des Anciens) */
  eppz: 0,
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
  researched2Lo: 0,
  researched2Hi: 0,
  /** race du joueur local (0 Industriels, 1 Souche, 2 Transhumants) */
  race: 0,
  /** Souche : réserve totale de ses réseaux de racines (sève, sels) et plafond total */
  seve: 0,
  sels: 0,
  store: 0,
  players: [] as { name: string; alive: boolean; team: number; units: number; kills: number; losses: number; bot: boolean; power: number }[],
  // sélection
  selUnits: [] as SelUnitGroup[],
  selBuilding: null as null | { ref: number; kind: number; owner: number },
  /** tous les bâtiments sélectionnés (plusieurs : seule la démolition est possible) */
  /** bâtiments sélectionnés ; `paused` : en pause (bâtiment de production), `built` : chantier terminé */
  selBuildings: [] as { ref: number; kind: number; owner: number; paused?: boolean; built?: boolean }[],
  /** unités sélectionnées appartenant à un autre joueur : fiche de statistiques, sans ordres */
  selForeign: -1,
  /** gisement sélectionné (clic sur un gisement libre ou exploité) */
  selDeposit: null as null | { kind: number; x: number; y: number; purity: number },
  /** construction prévue sélectionnée (fantôme : ordre non commencé ou bâtiment à reconstruire) */
  selPlan: null as null | { kind: number; x: number; y: number; dir: number },
  /** points de vie de l'unité sélectionnée (sélection d'une seule unité étrangère) */
  unitInfo: null as null | { hp: number; maxHp: number; lvl: number; cloaked?: boolean; radarStealth?: boolean; harvest?: HarvestInfo | null; pickup?: PickupInfo | null; deliver?: DeliverInfo | null; /** chenillard : 1 déploiement, 2 repli ; ticks restants */ pack?: number; packLeft?: number; /** Reine de la Souche : sur son terreau, enracinée */ soil?: boolean; deployed?: boolean; /** apprivoisement d'un nid (‰ ; -1 : aucun) */ tame?: number; /** œuf de la Souche : espèce portée, ticks avant l'éclosion, durée de l'incubation */ egg?: { kind: number; left: number; total: number } | null; shield?: number; /** Transhumants : améliorations */ mods?: ModInfo | null },
  buildingInfo: null as null | Record<string, unknown>,
  /** Transhumants : améliorations du premier des porteurs sélectionnés (plusieurs unités ou modules du même type) */
  groupMods: null as null | { info: ModInfo; refs: number[] },
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
  /** répartiteur à poser : sorties (0 : les trois, 1 : gauche et avant, 2 : droite et avant) */
  buildSplit: 0,
  /** vue électrique (touche maintenue) */
  powerView: false,
  /** réseaux électriques de l'équipe (légende de la vue électrique) */
  /** économie de la zone électrique au centre de l'écran (barre des ressources ; null : pas encore reçue) ;
   * `color` : couleur de la zone dans la vue électrique ; `at` : case demandée */
  zone: null as (ZoneEconomy & { color: number; at: [number, number] }) | null,
  powerNets: [] as { id: number; color: number; prod: number; demand: number; cap: number; sat: number; autonomy: number; dead: boolean; roots?: boolean }[],
  chatOpen: false,
  volume: 0.5,
  music: 0.35,
  /** annonces vocales */
  voice: true,
  replay: false,
  replaySpeed: 1,
  spectator: false,
  /** brouillard de guerre de la partie en cours (réglage du salon, lu dans les paramètres de la simulation) */
  fog: true,
  ping: 0,
  /** vitesse de jeu (multiplicateur, partie solo seulement) ; 0 : partie en pause (solo ou hôte) */
  speed: 1,
  /** vitesse reprise à la fin de la pause */
  resumeSpeed: 1,
  /** joueur qui a mis la partie en pause */
  pausedBy: "",
  /** menu de partie (Échap) ouvert */
  menuOpen: false,
  /** dernière sauvegarde annoncée par le serveur (nom, heure locale) */
  lastSaved: null as { name: string; at: number } | null,
  /** retour au salon pour charger une sauvegarde : le salon ouvre la liste des sauvegardes */
  lobbySaves: false,
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
  const w = t < 32 ? ui.researchedLo : t < 64 ? ui.researchedHi : t < 96 ? ui.researched2Lo : ui.researched2Hi;
  return ((w >>> (t % 32)) & 1) === 1;
}
