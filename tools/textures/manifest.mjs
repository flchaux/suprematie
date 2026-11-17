// Matières des modèles 3D : une texture répétable par catégorie de couleur des pièces
// (assets/models/types.ts, ColorName). L'ordre est celui des couches du tableau de textures.

/** Style commun : texture de détail en gris neutre (la couleur vient de la pièce ou du joueur). */
export const STYLE =
  "Seamless tileable texture for a sci-fi real-time strategy game, flat orthographic top-down view of a surface, " +
  "perfectly even diffuse lighting, no perspective, no vanishing point, no cast shadows, no vignette, no text, no logos, " +
  "neutral desaturated grey tones, crisp hard-surface detail, the pattern repeats seamlessly on all four edges.";

export const MATERIALS = [
  { key: "armor", colors: ["faction", "light"], desc: "light grey painted armor plating made of a few large rectangular panels with thin recessed seams, small bolts at panel corners, subtle scratches and light wear." },
  { key: "metal", colors: ["metal", "red"], desc: "medium grey machined industrial metal with smaller interlocking plates, rows of rivets, narrow vent slots and a faint brushed finish." },
  { key: "dark", colors: ["dark", "black"], desc: "dark grey mechanical surface with ventilation grilles, cooling fins, cable conduits and small technical greebles." },
  { key: "hazard", colors: ["hazard"], desc: "diagonal hazard stripes, alternating light grey and near-black bands of equal width, painted on worn metal with chipped edges." },
  { key: "glass", colors: ["glass"], desc: "dark tinted glass panels separated by a thin metal frame grid, with faint diagonal reflection streaks." },
];
