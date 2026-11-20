// Couleur d'un propriétaire d'unité ou de bâtiment : celle du joueur, ou le brun de la faune.
import { NATURE_COLOR, NATURE_TEAM } from "@supreme/shared";
import { PLAYER_COLORS } from "../models/generator.ts";

/** Couleur d'un propriétaire : celle du joueur, ou celle de la faune (joueur caché d'équipe NATURE_TEAM). */
export function ownerColor(owner: number, players?: readonly { team: number }[]): number {
  return players?.[owner]?.team === NATURE_TEAM ? NATURE_COLOR : PLAYER_COLORS[owner % 8];
}

export const ownerHex = (owner: number, players?: readonly { team: number }[]): string => "#" + ownerColor(owner, players).toString(16).padStart(6, "0");
