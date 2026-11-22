// Menu de partie (Échap) : ce qu'Échap annule d'abord, et les entrées du menu selon le rôle du joueur.

/** Ce qui est ouvert ou en cours quand on appuie sur Échap. */
export interface EscapeState {
  menuOpen: boolean;
  buildStep: boolean;
  mode: boolean;
  panel: boolean;
  selection: boolean;
}

/** Ce qu'Échap fait : refermer le menu, annuler le menu de construction ou l'outil en cours, fermer les
 * panneaux, désélectionner ; le menu ne s'ouvre que s'il n'y a plus rien à annuler. */
export type EscapeAction = "closeMenu" | "buildStep" | "mode" | "panels" | "deselect" | "openMenu";

export function escapeAction(s: EscapeState): EscapeAction {
  if (s.menuOpen) return "closeMenu";
  if (s.buildStep) return "buildStep";
  if (s.mode) return "mode";
  if (s.panel) return "panels";
  if (s.selection) return "deselect";
  return "openMenu";
}

/** Rôle du joueur dans la partie affichée. */
export interface MenuRole {
  /** partie solo (un seul humain) */
  solo: boolean;
  /** hôte de la partie (le joueur seul d'une partie solo l'est aussi) */
  host: boolean;
  spectator: boolean;
  replay: boolean;
  /** partie terminée */
  ended: boolean;
}

export type MenuId = "resume" | "save" | "load" | "options" | "quit";

export interface MenuItem {
  id: MenuId;
  label: string;
  enabled: boolean;
  /** raison d'une entrée grisée, ou précision */
  hint: string;
  /** demande une confirmation (second clic) : la partie s'arrête pour tous */
  confirm: boolean;
}

/** Le menu met-il la partie en pause à son ouverture ? En solo, pour l'hôte, ou dans un replay. */
export function menuPauses(r: MenuRole): boolean {
  if (r.ended) return false;
  return r.replay || (!r.spectator && (r.solo || r.host));
}

export function menuItems(r: MenuRole): MenuItem[] {
  const player = !r.spectator && !r.replay;
  const host = player && r.host;
  const many = !r.solo;
  return [
    { id: "resume", label: "Reprendre", enabled: true, hint: "", confirm: false },
    {
      id: "save",
      label: "Sauvegarder",
      enabled: player && !r.ended,
      hint: !player ? "Réservé aux joueurs" : r.ended ? "La partie est terminée" : "L'hôte pourra la reprendre depuis le salon",
      confirm: false,
    },
    {
      id: "load",
      label: "Charger une partie",
      enabled: host,
      hint: !host ? "Réservé à l'hôte, depuis le salon" : many ? "Arrête la partie pour tous (sauvegarde automatique), puis ouvre les sauvegardes du salon" : "Sauvegarde automatique, puis retour au salon pour choisir une sauvegarde",
      confirm: true,
    },
    { id: "options", label: "Options", enabled: true, hint: "Sons, graphismes, raccourcis clavier", confirm: false },
    {
      id: "quit",
      label: r.replay ? "Quitter le replay" : "Quitter vers le salon",
      enabled: r.replay || host || r.ended,
      hint: r.replay ? "" : r.ended ? "" : !host ? "Seul l'hôte peut arrêter la partie" : many ? "Arrête la partie pour tous ; elle est sauvegardée automatiquement" : "La partie est sauvegardée automatiquement",
      confirm: !r.replay && !r.ended,
    },
  ];
}
