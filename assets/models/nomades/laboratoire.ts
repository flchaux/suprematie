// Laboratoire nomade (« t_lab ») et chenillard laboratoire (« ch_lab ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »). À écrire.
import type { Part } from "../types.ts";
import { chariotNomade } from "./commun.ts";

export function laboratoireNomade(chariot: boolean): Part[] {
  return [...chariotNomade(chariot)];
}
