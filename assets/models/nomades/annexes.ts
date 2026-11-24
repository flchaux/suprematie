// Annexes des modules des Transhumants : une construction visible par amélioration (rendement, spécialité), sur le
// module déployé comme sur son chenillard. Ce fichier : les outils et les vérins rapides, communs à tous les modules ;
// les annexes de chaque module sont dans annexes-production.ts et annexes-service.ts.
//
// Règles : une annexe est décrite dans sa pose déployée (comme les gréements, voir foreuse.ts) ; ses pivots portent la
// condition « si:clé#… », donc elle ne compte ni dans la taille du modèle ni dans l'occlusion. Elle reste dans
// l'emprise du bâtiment (les modules se collent par leurs faces) et ne croise aucune annexe de l'autre emplacement.
import type { Part, Vec3 } from "../types.ts";
import { q } from "./commun.ts";

/** Pivots des annexes d'une amélioration (`cle`), sur le chenillard (`chariot`) ou sur le bâtiment. */
export interface Annexe {
  /** Pièces qui ne bougent pas. */
  fixe(parts: Part[]): Part[];
  /**
   * Pièces rangées sur le chenillard, qui suivent le déploiement (`etapes` : voir parseDep du générateur) ; fixes sur
   * le bâtiment. `origine` : point autour duquel tournent les étapes de rotation.
   */
  mobile(nom: string, etapes: string, parts: Part[], origine?: Vec3): Part[];
  /** Pièces qui tournent autour de `origine` quand le bâtiment travaille (ou visent, sur un bastion) ; sur le
   * chenillard, elles suivent `etapes` (aucune : elles ne bougent pas). */
  tourne(nom: string, etapes: string, parts: Part[], origine: Vec3): Part[];
}

export function annexe(chariot: boolean, cle: string): Annexe {
  // la première pièce d'un pivot porte son origine : une ancre minuscule, quand la place de la pièce ne convient pas
  const pose = (pivot: string, parts: Part[], origine?: Vec3): Part[] => {
    const ancre: Part[] = origine ? [{ shape: "box", size: [0.008, 0.008, 0.008], pos: origine, color: "dark" }] : [];
    return [...ancre, ...parts].map((p) => ({ ...p, pivot }));
  };
  const fixe = (parts: Part[]) => pose(`si:${cle}#fixe`, parts);
  const mobile = (nom: string, etapes: string, parts: Part[], origine?: Vec3) => (chariot ? pose(`si:${cle}#dep|${etapes}#${nom}`, parts, origine) : fixe(parts));
  const tourne = (nom: string, etapes: string, parts: Part[], origine: Vec3) => {
    if (!chariot) return pose(`si:${cle}#${nom}`, parts, origine);
    return etapes ? mobile(nom, etapes, parts, origine) : fixe(parts);
  };
  return { fixe, mobile, tourne };
}

/** Les mêmes pièces, retirées au loin. */
export const fines = (parts: Part[]): Part[] => parts.map((p) => ({ ...p, fine: true }));

/**
 * Vérins rapides (forme commune à tous les modules) : aux quatre coins, un gros vérin jaune à boule d'accumulateur
 * rouge, articulé en haut d'un montant, dont la tige d'acier écarte un patin au sol. Sur le chenillard, les vérins
 * pendent à la verticale le long des montants, tiges rentrées ; ils s'écartent (0,08 → 0,3), puis les tiges sortent
 * (0,3 → 0,48), avec les stabilisateurs. `x`, `zs` : place des montants (au-dessus des garde-boue).
 */
export function verinsRapides(chariot: boolean, cle: string, o: { x?: number; zs?: [number, number] } = {}): Part[] {
  const a = annexe(chariot, cle);
  const x0 = o.x ?? 0.82;
  const zs = o.zs ?? [1.16, -1.16];
  const y0 = 1.02;
  const ecart = 0.38;
  const chute = y0 - 0.05;
  const long = Math.hypot(ecart, chute);
  const ux = ecart / long;
  const uy = -chute / long;
  const incline = (Math.atan2(ecart, chute) * 180) / Math.PI;
  const rentre = 0.48;
  const out: Part[] = [];
  for (const s of [1, -1]) {
    // place le long du vérin, depuis son articulation (origine des pivots : première pièce, posée là)
    const at = (d: number): Vec3 => [q(s * ux * d), q(uy * d), 0];
    const pied = (z: number): Vec3 => [q(s * x0), y0, z];
    const tourne = `r:z,${q(-s * incline)}:0.08:0.3`;
    const cote = s > 0 ? "d" : "g";
    out.push(
      ...a.fixe(zs.map((z): Part => ({ shape: "box", size: [0.08, q(y0 - 0.46), 0.2], pos: [q(s * (x0 - 0.13)), q(y0 / 2 + 0.23), z], color: "rust" }))),
      ...a.mobile(`verin_${cote}`, tourne, zs.flatMap((z): Part[] => [
        { shape: "tube", radius: 0.12, sides: 8, pos: pied(z), path: [at(-0.02), at(0.55)], color: "hazard" },
        { shape: "sphere", radius: 0.12, pos: [q(s * (x0 - ux * 0.1)), q(y0 - uy * 0.1), z], color: "red" },
      ])),
      ...a.mobile(`tige_${cote}`, `${tourne}|t:${q(-s * ux * rentre)},${q(-uy * rentre)},0:0.3:0.48`, zs.flatMap((z): Part[] => [
        { shape: "tube", radius: 0.065, sides: 6, pos: pied(z), path: [at(0.45), at(long)], color: "steel" },
        { shape: "cylinder", sides: 6, radius: 0.14, radiusTop: 0.09, height: 0.08, pos: [q(s * (x0 + ecart)), 0.04, z], color: "dark" },
      ])),
    );
  }
  return out;
}
