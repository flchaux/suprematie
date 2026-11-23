// Barres de progression des chantiers et des améliorations : logique pure (décodage de l'image, taille
// selon le zoom), testée sous Node (`test/siteBars.test.ts`). Le dessin (un seul maillage instancié) est
// dans `entities/markers.ts` (`pushSiteBar`).
import { BUILD_FULL } from "@supreme/shared";

/** Barre d'un bâtiment : avancement (0 à 1), part saine et part perdue (dégâts) de l'avancement. */
export interface SiteBar {
  /** avancement du chantier ou de l'amélioration, 0 à 1 */
  progress: number;
  /** part de l'avancement couverte par les points de vie (cyan) */
  done: number;
  /** part de l'avancement perdue en dégâts (rouge) : progress - done */
  lost: number;
  /** amélioration en cours d'un bâtiment terminé (barre ambrée), sinon chantier */
  upgrade: boolean;
}

/**
 * Barre d'un bâtiment de l'image, d'après ses mots (`BUILDING_WORDS` à partir de `o`) : mot 3 les points
 * de vie, mot 4 l'avancement du chantier (sur `BUILD_FULL`), mot 7 l'avancement d'une amélioration (en
 * millièmes ; pour un tapis, c'est sa ligne). Null pour un bâtiment terminé sans amélioration en cours.
 * La simulation fait monter les points de vie avec l'avancement : des points de vie sous l'avancement sont
 * des dégâts subis par le chantier.
 */
export function siteBarOf(buf: Int32Array, o: number, maxHp: number, belt: boolean): SiteBar | null {
  const build = buf[o + 4];
  if (build < BUILD_FULL) {
    const progress = Math.max(0, Math.min(1, build / BUILD_FULL));
    const hp = Math.max(0, Math.min(1, buf[o + 3] / Math.max(1, maxHp)));
    const done = Math.min(progress, hp);
    return { progress, done, lost: progress - done, upgrade: false };
  }
  const upg = belt ? 0 : buf[o + 7];
  if (upg <= 0) return null;
  const progress = Math.min(1, upg / 1000);
  return { progress, done: progress, lost: 0, upgrade: true };
}

/** Épaisseur minimale d'une barre à l'écran, en pixels, et longueur minimale d'une barre de bâtiment. */
export const BAR_MIN_PX = 4;
export const BAR_MIN_LEN_PX = 12;

/**
 * Taille d'une barre (en cases du monde) au-dessus d'un bâtiment de `w` × `h` cases, quand une case du
 * monde vaut `1 / pxWorld` pixels à l'écran. De près, la barre garde sa taille dans le monde ; de loin, elle
 * garde au moins `BAR_MIN_PX` pixels d'épaisseur et, pour un bâtiment, `BAR_MIN_LEN_PX` de long. Une petite
 * pièce (tapis, rail, bras, mur, racine) garde sa barre dans sa case, pour que les barres d'une file restent
 * séparées : elle ne s'allonge pas et s'épaissit au plus jusqu'à 70 % de la case.
 * `lift` : hauteur au-dessus du sol du bâtiment (une petite pièce est basse).
 */
export function siteBarSize(w: number, h: number, small: boolean, pxWorld: number): { width: number; thick: number; lift: number } {
  if (small) {
    return { width: 0.86, thick: Math.min(0.7 * h, Math.max(0.2, BAR_MIN_PX * pxWorld)), lift: 0.9 };
  }
  const width = Math.max(w * 0.8, BAR_MIN_LEN_PX * pxWorld);
  return { width, thick: Math.max(0.3, BAR_MIN_PX * pxWorld), lift: 2.2 };
}

/** Une case du monde vue à `distance` par une caméra d'angle vertical `fovDeg`, sur `heightPx` pixels. */
export function worldPerPixel(distance: number, fovDeg: number, heightPx: number): number {
  return (2 * distance * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, heightPx);
}

/** La barre d'un bâtiment centré en (cx, cz) est-elle dans la zone vue [x0, z0, x1, z1] (en cases) ? */
export function barInView(cx: number, cz: number, view: readonly [number, number, number, number], margin = 2): boolean {
  return cx >= view[0] - margin && cx <= view[2] + margin && cz >= view[1] - margin && cz <= view[3] + margin;
}

/** Couveuse de la Souche : portées en train de couver et limite de son niveau (mot 5 : niveau, bits 24-25 ; portées, bits 26-29). */
export function broodOf(buf: Int32Array, o: number, levels: readonly { litters: number }[]): { n: number; max: number } {
  const w = buf[o + 5];
  return { n: (w >>> 26) & 15, max: levels[(w >>> 24) & 3]?.litters ?? levels[0]?.litters ?? 0 };
}

/** Pastilles par rangée, au-dessus d'une couveuse. */
export const PIPS_PER_ROW = 6;

/**
 * Pastilles d'une couveuse : pas (cases) et côté d'une pastille, nombre de rangées. Elles gardent au moins quelques
 * pixels de loin, et ne dépassent pas la couveuse (3 cases) de plus d'un cinquième.
 */
export function pipLayout(max: number, pxWorld: number): { step: number; size: number; rows: number } {
  const step = Math.min(0.6, Math.max(0.42, 7 * pxWorld));
  return { step, size: step * 0.74, rows: Math.ceil(max / PIPS_PER_ROW) };
}

/**
 * Nid de mordeurs qu'une Reine de la Souche apprivoise (mot 5 : joueur + 1, 0 s'il n'y en a pas ; mot 6 :
 * avancement en millièmes). Null pour un autre bâtiment ou un nid tranquille.
 */
export function tameOf(buf: Int32Array, o: number, nest: boolean): { tamer: number; progress: number } | null {
  if (!nest || buf[o + 5] <= 0) return null;
  return { tamer: buf[o + 5] - 1, progress: Math.max(0, Math.min(1, buf[o + 6] / 1000)) };
}
