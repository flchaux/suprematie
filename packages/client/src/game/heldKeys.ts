// Touches maintenues (défilement de la caméra) : ce qui peut couper le clavier, et rien d'autre.
//
// Le défilement au clavier ne dépend que de deux choses : le focus est-il dans un champ de saisie
// (le clavier lui appartient), et l'écran « Raccourcis » attend-il une touche. Un panneau ou une boîte
// de discussion restée ouverte sans le focus ne le bloque pas : sinon, après un clic sur la carte, la
// caméra ne répond plus au clavier alors que rien ne l'indique.
//
// Les modificateurs (Ctrl, Alt…) sont recalés sur l'état que donne chaque événement : un relâchement
// perdu (raccourci du navigateur qui prend le focus, AltGr, bascule de fenêtre) ne doit pas laisser
// Ctrl « enfoncé », ce qui couperait le défilement indéfiniment.
// Ce module ne dépend ni de Svelte ni du DOM, pour être testé seul.

import type { Keymap } from "./keymap.ts";

/** Élément qui a le focus, réduit à ce qu'on en lit. */
export interface FocusLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

/** Champ de saisie : le clavier lui appartient (discussion, pseudo, liste déroulante…). */
export function isTextField(el: FocusLike | null | undefined): boolean {
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  return !["checkbox", "radio", "range", "button", "submit", "color"].includes(el.type ?? "text");
}

/** État des modificateurs porté par un événement clavier ou souris. */
export interface ModifierState {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODS: [keyof ModifierState, string[]][] = [
  ["ctrlKey", ["ControlLeft", "ControlRight"]],
  ["altKey", ["AltLeft", "AltRight"]],
  ["shiftKey", ["ShiftLeft", "ShiftRight"]],
  ["metaKey", ["MetaLeft", "MetaRight", "OSLeft", "OSRight"]],
];

/** Retire les modificateurs que l'événement dit relâchés (leur relâchement a pu être perdu). */
export function syncModifiers(keys: Set<string>, e: ModifierState): void {
  for (const [flag, codes] of MODS) if (!e[flag]) for (const c of codes) keys.delete(c);
}

/** Le clavier peut-il faire défiler la caméra ? */
export function keyboardPanAllowed(s: { focus: FocusLike | null | undefined; capturing: boolean }): boolean {
  return !s.capturing && !isTextField(s.focus);
}

/** Direction du défilement au clavier (dx, dz entre -1 et 1). */
export function keyboardPan(keys: ReadonlySet<string>, km: Pick<Keymap, "held">, s: { focus: FocusLike | null | undefined; capturing: boolean }): [number, number] {
  if (!keyboardPanAllowed(s)) return [0, 0];
  // pas de défilement pendant un raccourci avec Ctrl ou Alt (Ctrl+S…)
  if (keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("AltLeft") || keys.has("AltRight")) return [0, 0];
  let dx = 0;
  let dz = 0;
  if (km.held("panLeft", keys)) dx -= 1;
  if (km.held("panRight", keys)) dx += 1;
  if (km.held("panUp", keys)) dz -= 1;
  if (km.held("panDown", keys)) dz += 1;
  return [dx, dz];
}
