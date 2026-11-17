// Réglages graphiques choisis par le joueur (enregistrés dans le navigateur).
export interface GfxSettings {
  shadows: boolean;
  bloom: boolean;
  /** 1 : effets complets, 0.4 : réduits */
  effects: number;
  /** textures des unités et des bâtiments */
  textures: boolean;
}
export const DEFAULT_GFX: GfxSettings = { shadows: true, bloom: true, effects: 1, textures: true };
