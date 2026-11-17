// Raccourcis clavier côté interface : la table (keymap.ts) et l'état réactif qui l'accompagne
// (menu de construction au clavier, écran de personnalisation).
import { Keymap, detectLayout, type Storage } from "./keymap.ts";

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export const keymap = new Keymap(detectLayout(null, typeof navigator !== "undefined" ? navigator.language : ""));
keymap.load(storage());

export const kb = $state({
  /** Change à chaque modification des touches ou de la disposition : les libellés en dépendent. */
  version: 0,
  showKeys: false,
  /** L'écran « Raccourcis » attend une touche : le jeu ignore le clavier. */
  capturing: false,
  /** Menu de construction au clavier : choix de la catégorie, puis du bâtiment. */
  buildStep: "" as "" | "cat" | "item",
  buildCat: 0,
});

export function keysChanged(): void {
  kb.version++;
}

/** Première touche d'une action (pastilles des boutons), réactive. */
export function keyOf(id: string): string {
  void kb.version;
  return keymap.short(id);
}
/** Toutes les touches d'une action, réactif. */
export function keysOf(id: string): string {
  void kb.version;
  return keymap.describe(id);
}

export function saveKeys(): void {
  keymap.save(storage());
  keysChanged();
}

/** Disposition réelle du clavier quand le navigateur la donne (Chrome, Edge). */
export async function initLayout(): Promise<void> {
  try {
    const kbd = (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
    const map = await kbd?.getLayoutMap?.();
    if (map && map.size) {
      keymap.setLayout(detectLayout(map));
      keysChanged();
    }
  } catch {
    // API absente ou refusée : disposition devinée, puis apprise à l'usage
  }
}
