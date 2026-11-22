// Atelier (« t_workshop », 3 × 3) et chenillard atelier (« ch_workshop ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »). À écrire.
import type { Part } from "../types.ts";
import { chariotNomade } from "./commun.ts";

export function atelierNomade(chariot: boolean): Part[] {
  return [...chariotNomade(chariot, { l: 3.3, w: 1.5 })];
}
