// Couleur des coûts (vert ou rouge) : ce qui est disponible à portée du lieu concerné, dans son réseau
// logistique (dépôts et entrepôts à portée, dépôts reliés par les relais logistiques, soute du commandant ou
// des constructeurs choisis), et non le stock de tout le joueur. Les quantités viennent de la simulation
// (requête `reachStock`, fiche d'un bâtiment : `reach`) ; voir docs/spec/rendu.md, Couleur des coûts.

/** L'objet `it` manque-t-il pour payer `n` ? `have` null : disponible inconnu, rien ne manque. */
export function costShort(have: readonly number[] | null | undefined, it: number, n: number): boolean {
  return !!have && (have[it] ?? 0) < n;
}

/** Le disponible couvre-t-il tout le coût (`times` fois) ? `have` null : inconnu, on le suppose. */
export function canPay(have: readonly number[] | null | undefined, cost: readonly (readonly [number, number])[], times = 1): boolean {
  return !have || cost.every(([it, n]) => (have[it] ?? 0) >= n * times);
}

/**
 * File de constructions posées d'un coup (même coût chacune) : pour chaque emplacement posable, vrai si le
 * disponible ne couvre plus le coût cumulé jusqu'à lui (il sera ambre).
 */
export function shortCells(have: readonly number[] | null, cost: readonly (readonly [number, number])[], ok: readonly boolean[]): boolean[] {
  let k = 0;
  return ok.map((o) => {
    if (!have || !o) return false;
    k++;
    return !canPay(have, cost, k);
  });
}
