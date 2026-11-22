// Animation des œufs de la Souche (voir sim/src/ponte.rs, assets/models/souche-oeufs.ts).
//
// Purement visuelle, calculée à partir du temps qu'il reste avant l'éclosion (que la simulation donne à
// la place de l'angle de tourelle) et du temps de la simulation (tout se fige en pause, et suit la
// vitesse d'un replay) : l'œuf respire, s'agite de plus en plus fort pendant ses quatre
// dernières secondes, puis ses lèvres s'ouvrent pendant les 0,8 dernière seconde. À l'éclosion, sa coque
// vide reste un instant : les lèvres s'affaissent, le cœur s'éteint, elle rentre dans le sol ; l'organisme
// en sort en grandissant.

/** Ticks avant l'éclosion à partir desquels l'œuf s'agite, puis s'ouvre. */
export const EGG_STIR_TICKS = 80;
export const EGG_OPEN_TICKS = 16;
/** Avancement des pivots « dep|… » de l'œuf : 1 fermé, 0,4 ouvert (l'organisme sort), 0 fané. */
export const EGG_CLOSED = 1;
export const EGG_OPEN = 0.4;
/** Valeur du temps restant d'un œuf qui n'éclora pas (œuf vide de la vitrine des modèles). */
export const EGG_NEVER = 0xffff;
/** Durée de vie de la coque vide et de la sortie de l'organisme (secondes de simulation). */
export const HUSK_LIFE = 1.9;
export const BIRTH_TIME = 0.45;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export interface EggPose {
  /** avancement des pivots des lèvres (EGG_CLOSED à EGG_OPEN) */
  dep: number;
  /** inclinaison (radians) autour d'un axe horizontal d'angle `axis` */
  tilt: number;
  axis: number;
  /** échelle (respiration) et sursaut (en hauteurs d'œuf) */
  scale: number;
  lift: number;
}

/**
 * Pose d'un œuf à `left` ticks de son éclosion (fraction comprise). `t` : temps en secondes ; `seed` :
 * déphasage propre à l'œuf, pour que ceux d'une portée ne bougent pas ensemble.
 */
export function eggPose(left: number, t: number, seed: number): EggPose {
  if (left >= EGG_NEVER) return { dep: EGG_CLOSED, tilt: 0, axis: 0, scale: 1 + 0.02 * Math.sin(t * 1.6 + seed), lift: 0 };
  const stir = clamp01(1 - left / EGG_STIR_TICKS);
  const open = clamp01(1 - left / EGG_OPEN_TICKS);
  // respiration : lente, puis plus ample et plus rapide à l'approche de l'éclosion
  const scale = 1 + (0.02 + 0.035 * stir) * Math.sin(t * (1.6 + 6 * stir) + seed);
  // secousses par à-coups (deux fréquences qui battent), de plus en plus fortes ; elles cessent quand l'œuf s'ouvre
  const shake = stir * stir * (1 - open);
  const beat = Math.sin(t * 14 + seed * 3);
  const tilt = shake * 0.32 * beat * (0.55 + 0.45 * Math.sin(t * 3.1 + seed));
  return { dep: EGG_CLOSED - (EGG_CLOSED - EGG_OPEN) * open, tilt, axis: seed + t * 0.9, scale, lift: shake * 0.05 * Math.abs(beat) };
}

/**
 * Coque vide, `age` secondes après l'éclosion : `dep` (les lèvres s'affaissent, de EGG_OPEN à 0), `sink`
 * (part de sa hauteur rentrée dans le sol), `scale`.
 */
export function huskPose(age: number): { dep: number; sink: number; scale: number } {
  const wilt = clamp01(age / 0.7);
  const s = clamp01((age - 0.6) / (HUSK_LIFE - 0.6));
  return { dep: EGG_OPEN * (1 - wilt), sink: s * s, scale: 1 - 0.3 * s };
}

/** Échelle d'un organisme `age` (0 à 1) après sa sortie de l'œuf : il grandit, dépasse un peu sa taille, s'y pose. */
export function birthScale(age: number): number {
  const u = clamp01(age) - 1;
  const c = 1.70158;
  return 0.3 + 0.7 * (1 + (c + 1) * u * u * u + c * u * u);
}
