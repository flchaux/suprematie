// Interface d'un bot. Le bot lit l'état de la copie de référence et renvoie des ordres,
// qui passent par le relais comme ceux d'un humain (délai de 3 ticks, enregistrés dans le replay).
import type { Sim, GameData, BotView, Cmd } from "@supreme/shared";

export interface MapInfo {
  w: number;
  h: number;
  waterLevel: number;
  starts: [number, number][];
  spots: { kind: number; x: number; y: number }[];
  heights: Uint8Array;
}

export interface BotContext {
  slot: number;
  personality: string; // "adaptive" | "rush" | "turtle" | "tech"
  aix: number; // multiplicateur AIx en % (100 = pas de triche)
  level?: string; // "facile" | "normal" | "difficile" (défaut : normal)
  sim: Sim; // copie de référence (lecture seule : can_place, tile_info, etc.)
  data: GameData;
  map: MapInfo;
}

export interface Bot {
  /** Appelé tous les 10 ticks. Renvoie les ordres à envoyer. */
  think(view: BotView): Cmd[];
  /** État interne sérialisé (sauvegarde de partie). */
  save?(): Uint8Array;
  /** Reprend un état sauvegardé (bot fraîchement créé avec le même contexte). */
  load?(state: Uint8Array): void;
}
