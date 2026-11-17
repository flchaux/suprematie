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

/**
 * Style des textures du sol : en COULEUR (contrairement aux modèles), vues de haut, petits détails
 * réguliers (une texture couvre environ 8 cases du jeu, une unité fait environ une case).
 */
export const GROUND_STYLE =
  "Seamless tileable ground texture for a top-down real-time strategy game, photographed straight down from about 20 meters, " +
  "flat orthographic view, perfectly even overcast lighting, no perspective, no horizon, no cast shadows, no vignette, no text, " +
  "small fine-grained natural detail evenly distributed over the whole image, no single large feature, no paths, no objects, " +
  "muted natural colors with low contrast, the pattern repeats seamlessly on all four edges.";

/**
 * Textures du sol, dans l'ordre des couches du shader (render/ground.ts) : les cinq premières se
 * suivent par altitude (fond marin, sable, herbe, herbe sèche, neige), la roche vient des pentes.
 * `mean` : couleur moyenne visée (0..1, linéaire : la palette de l'ancien terrain), `contrast` : écart
 * type visé de la luminance (en sRGB).
 */
export const GROUND = [
  { key: "seabed", mean: [0.36, 0.35, 0.28], contrast: 0.05, desc: "wet muddy lake bottom with small rounded pebbles, silt and a few dark algae patches, olive brown." },
  { key: "sand", mean: [0.69, 0.63, 0.46], contrast: 0.04, desc: "fine beige beach sand with subtle wind ripples, scattered tiny pebbles and a few small shell fragments." },
  { key: "grass", mean: [0.27, 0.4, 0.19], contrast: 0.045, desc: "short dense meadow grass seen from above, varied green tones with tiny clover leaves, a few small darker tufts and specks of soil." },
  { key: "dry", mean: [0.45, 0.42, 0.32], contrast: 0.05, desc: "dry steppe: sparse yellowed dry grass tufts over cracked dusty brown earth with small stones." },
  { key: "snow", mean: [0.8, 0.81, 0.85], contrast: 0.035, desc: "wind-packed snow with soft drifts, a few tiny ice crystals and very faint blue shading, with rare small grey rocks poking through." },
  { key: "rock", mean: [0.37, 0.35, 0.33], contrast: 0.06, desc: "rough grey granite rock face with natural cracks, small ledges, lichen specks and gravel, slightly warm grey." },
];
