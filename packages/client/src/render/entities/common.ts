// Rendu des entités : ce que les modules de ce dossier ont en commun. Constantes, objets temporaires et
// état d'une image (`FrameCtx`), que `Entities.update` (../entities.ts) transmet d'une passe de dessin
// à la suivante.
import * as THREE from "three/webgpu";
import type { Frame } from "@supreme/shared";
import type { Effects } from "../effects.ts";

export const TILE = 256;
export const ANG = (Math.PI * 2) / 65536;
/** Reine qui apprivoise un nid (Order::Tame), distance à laquelle son charme se voit (territoire du nid, en cases), rayon du cercle de spores */
export const ORDER_TAME = 21;
export const TAME_SHOW = 14.5;
export const TAME_RING = 2.9;

// Objets temporaires : un seul exemplaire de chacun pour tout le rendu des entités, réutilisé d'un appel à
// l'autre. Certains appels comptent sur la valeur qu'un autre y a laissée : la lueur d'un projectile
// (`glow`) prend l'orientation que sa passe a mise dans `tmpQ`, la teinte d'un bâtiment est souvent `tmpC`
// lui-même, et l'orientation de la caméra est `tmpQ` quand il n'y a pas de caméra. Ne pas en créer de
// copie dans un module ; avant de s'en servir dans une fonction appelée au milieu d'un calcul, vérifier
// que ce calcul ne compte pas sur ce qu'elle écrase.
export const tmpM = new THREE.Matrix4();
export const tmpM2 = new THREE.Matrix4();
export const tmpM3 = new THREE.Matrix4();
export const tmpQ = new THREE.Quaternion();
export const tmpQ2 = new THREE.Quaternion();
export const tmpQ3 = new THREE.Quaternion();
/** rotation d'un modèle (avant : +z) vers la direction `dir` de la simulation (0 est, 1 sud, 2 ouest, 3 nord) */
export const dirQuat = (q: THREE.Quaternion, dir: number): THREE.Quaternion => q.setFromAxisAngle(UP, Math.PI / 2 - (dir * Math.PI) / 2);
export const tmpV2 = new THREE.Vector3();
export const tmpV = new THREE.Vector3();
export const tmpS = new THREE.Vector3();
export const tmpC = new THREE.Color();
export const tmpE = new THREE.Euler();

export const UP = new THREE.Vector3(0, 1, 0);
export const ZAXIS = new THREE.Vector3(0, 0, 1);

/**
 * État d'une image, transmis d'une passe de dessin à la suivante par `Entities.update` : les paramètres
 * de l'image, ce que `update` en tire une fois pour toutes (visibilité, équipes, temps, zone vue), et les
 * nombres d'instances que les passes remplissent tour à tour. Chaque passe reprend ce dont elle a besoin
 * en variables locales et rend les compteurs en sortant.
 */
export interface FrameCtx {
  f: Frame;
  buf: Int32Array;
  /** interpolation entre le tick précédent et le tick courant (0 à 1) */
  alpha: number;
  me: number;
  myTeam: number;
  selected: Set<number>;
  strategic: boolean;
  iconScale: number;
  dt: number;
  spectator: boolean;
  viewRect: [number, number, number, number];
  /** la case du monde (x, z) est-elle vue par l'équipe (bit du brouillard : 1 vue, 2 radar, 8 explorée) ? */
  seen: (x: number, z: number, bit: number) => boolean;
  teamOf: (p: number) => number;
  /** améliorations des Transhumants installées sur une unité ou un bâtiment (par clé) */
  modOf: (ref: number) => (key: string) => boolean;
  /** indice de couleur d'un propriétaire : 0 à 7 pour les joueurs, 8 pour la faune */
  cslot: (p: number) => number;
  /** horloge du navigateur (ms) */
  now: number;
  /** temps de la simulation à l'image affichée (s) */
  simT: number;
  /** orientation de la caméra (panneaux tournés vers elle) */
  camQ: THREE.Quaternion;
  vx0: number;
  vz0: number;
  vx1: number;
  vz1: number;
  fx: Effects;
  /** ticks écoulés depuis l'image précédente (éclairs de départ des projectiles) */
  tickDelta: number;
  // nombres d'instances : icônes de diagnostic, insignes de vétérance, cercles de sélection, barres de vie,
  // barres de chantier, barres de niveau, piliers, anneaux lumineux des ascenseurs
  nd: number;
  nr: number;
  rings: number;
  bars: number;
  siteBars: number;
  npip: number;
  nsup: number;
  nlift: number;
  // porte de transit et anneaux de transport : horizons, gerbes, anneaux, colonnes de lumière ; portes ouvertes
  nvortex: number;
  nkawoosh: number;
  nring: number;
  nbeam: number;
  gates: { x: number; z: number }[];
}
