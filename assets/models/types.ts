// Format des descriptions de modèles (kit de formes simples). Voir docs/SPEC.md, section Modèles 3D.
// Repère du modèle : +x à droite, +y en haut, +z vers l'avant. L'échelle est libre :
// le jeu redimensionne chaque modèle pour qu'il occupe la taille de l'unité ou du bâtiment.

export type Vec3 = [number, number, number];

export type ColorName = "faction" | "metal" | "dark" | "light" | "glow" | "amber" | "hazard" | "glass" | "red" | "black" | "ore";
// glow (cyan) et amber (voyants) sont lumineux : ils nourrissent le halo du rendu.

export interface Part {
  /** Forme de base. */
  shape?: "box" | "bevel" | "cylinder" | "cone" | "wedge" | "sphere";
  /** Ou un sous-ensemble réutilisable du kit (voir kit.ts). */
  use?: string;
  size?: Vec3; // box, bevel, wedge
  /** bevel : largeur du chanfrein de toutes les arêtes (défaut : 18 % de la plus petite dimension) */
  bevel?: number;
  /** sphere : finesse (0 : 20 faces, 1 : 80 faces) */
  detail?: number;
  radius?: number; // cylinder (bas), cone, sphere
  radiusTop?: number; // cylinder (haut), par défaut = radius
  height?: number; // cylinder, cone
  sides?: number; // cylinder, cone : 5, 6 ou 8 (défaut 6)
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
}
