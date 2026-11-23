// Réglages graphiques choisis par le joueur (enregistrés dans le navigateur).
export interface GfxSettings {
  shadows: boolean;
  bloom: boolean;
  /** 1 : effets complets, 0.4 : réduits */
  effects: number;
  /** textures des unités et des bâtiments */
  textures: boolean;
  /** textures du sol mélangées (sinon couleurs simples) */
  ground: boolean;
  /** petites décorations du sol (herbes, rochers, arbres…) */
  decor: boolean;
  /** boucliers détaillés (alvéoles, bord lumineux, ondulation) ; sinon simple bulle */
  shieldFx: boolean;
  /** cercles de portée de la sélection (tir, zone morte, radar) */
  ranges: boolean;
}
export const DEFAULT_GFX: GfxSettings = { shadows: true, bloom: true, effects: 1, textures: true, ground: true, decor: true, shieldFx: true, ranges: true };
