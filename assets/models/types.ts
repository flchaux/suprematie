// Format des descriptions de modèles (kit de formes simples). Voir docs/SPEC.md, section Modèles 3D.
// Repère du modèle : +x à droite, +y en haut, +z vers l'avant. L'échelle est libre :
// le jeu redimensionne chaque modèle pour qu'il occupe la taille de l'unité ou du bâtiment.

export type Vec3 = [number, number, number];

export type ColorName =
  | "faction" | "metal" | "dark" | "light" | "glow" | "amber" | "hazard" | "glass" | "red" | "black" | "ore"
  // couleurs naturelles des décorations du sol (decor.ts)
  | "leaf" | "leaf_dark" | "wood" | "dry" | "rock" | "snow" | "ice" | "crystal" | "flower" | "rust"
  // matières supplémentaires : cuivre (tuyauteries, bobines), acier clair poli, caoutchouc (pneus, chenilles, joints), béton (socles, bunkers)
  | "copper" | "steel" | "rubber" | "concrete"
  // sève luminescente de la Souche (vert acide)
  | "acid";
// glow (cyan), amber (voyants) et acid (sève de la Souche) sont lumineux : ils nourrissent le halo du rendu ;
// crystal a un léger éclat propre.

export interface Part {
  /** Forme de base. */
  shape?: "box" | "bevel" | "cylinder" | "cone" | "wedge" | "sphere" | "lathe" | "extrude" | "tube" | "torus";
  /** Ou un sous-ensemble réutilisable du kit (voir kit.ts). */
  use?: string;
  size?: Vec3; // box, bevel, wedge
  /**
   * bevel : largeur du chanfrein de toutes les arêtes (défaut : 18 % de la plus petite dimension).
   * cylinder et extrude : chanfrein des arêtes des deux faces (défaut : aucun).
   */
  bevel?: number;
  /**
   * lathe : profil (rayon, hauteur) de bas en haut, tourné autour de l'axe y (cuves, réservoirs, tuyères, dômes).
   * extrude : contour (x, y) fermé, dans le plan xy, extrudé sur `depth` le long de z (poutres en I, flancs, carénages).
   */
  profile?: [number, number][];
  /** extrude : épaisseur le long de z (centrée sur l'origine) */
  depth?: number;
  /** tube : points du tracé (tuyaux, câbles, garde-corps), coudes arrondis de rayon `bend` (défaut : 2 x radius) */
  path?: Vec3[];
  bend?: number;
  /** torus : anneau horizontal (axe y) de rayon `radius`, tube de rayon `tube` (brides, jantes, bagues) */
  tube?: number;
  /** lathe et torus : angle balayé en degrés (défaut 360) */
  arc?: number;
  /**
   * Ombrage lissé (les facettes de moins de 40° se fondent) : par défaut pour lathe, tube, torus et
   * les cylindres de 10 côtés ou plus. false garde les facettes.
   */
  smooth?: boolean;
  /**
   * Pièce de détail fin (boulons, rambardes, échelles, petits tuyaux) : retirée quand la caméra est
   * loin (niveau de détail réduit). Hérité par les pièces d'un sous-ensemble `use`.
   */
  fine?: boolean;
  /** sphere : finesse (0 : 20 faces, 1 : 80 faces) */
  detail?: number;
  radius?: number; // cylinder (bas), cone, sphere, tube, torus
  radiusTop?: number; // cylinder (haut), par défaut = radius
  height?: number; // cylinder, cone
  sides?: number; // cylinder, cone : 5, 6 ou 8 (défaut 6) ; 3 ou 4 pour les brins fins des décorations ; lathe, torus : 16 ; tube : 8
  pos?: Vec3;
  rot?: Vec3; // degrés, ordre XYZ
  scale?: number | Vec3; // pour `use`
  color?: ColorName;
  mirror?: boolean; // ajoute la copie symétrique en x
  pivot?: string; // pièce mobile : le jeu la fait tourner autour de sa position
  parent?: string; // pièce portée par une pièce mobile
}

export interface Model {
  parts: Part[];
  /** Taille au sol voulue en proportion (facultatif). */
  footprint?: number;
  /**
   * Jeu de matières du modèle. Absent : matières des machines (blindage, métal, grilles…). « souche » :
   * matières vivantes (chitine, écorce, chair, os) à la place, pour les mêmes couleurs de pièce (table
   * SKIN_LAYER du générateur). Les couleurs et la teinte du joueur ne changent pas.
   */
  skin?: "souche";
}
