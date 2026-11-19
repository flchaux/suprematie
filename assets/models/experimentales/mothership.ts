// mothership : Vaisseau-mère, soucoupe géante.
// Coque fine en gradins tournés : ventre d'acier à nervures lumineuses, réacteurs de sustentation et
// projecteur de rayon tracteur cerclé ; jante d'acier à liseré lumineux percée de huit baies de hangar
// (portes entrouvertes, feux ambre) ; glacis aux couleurs du joueur à nervures radiales, panneaux alternés,
// grilles de radiateurs et trappes ; pont circulaire à anneau lumineux et collecteur de cuivre portant six
// tourelles pivotantes à pans (« tourelle1 »…« tourelle6 »), deux plateformes d'appontage et quatre
// antennes ; gradin intérieur à hublots, coupole vitrée nervurée et flèche à émetteur tournant
// (« emetteur »). Pièces fines : grilles, boulons, antennes, freins de bouche, nervures du ventre.
import type { Model, Part } from "../types.ts";

const r3 = (v: number) => +v.toFixed(3);

/**
 * `n` copies d'une pièce réparties autour de l'axe vertical, au rayon `r` et à la hauteur `y`,
 * à partir de l'angle `off` (degrés ; 270 : vers l'avant, +z). L'axe x de la pièce est radial ;
 * `tilt` l'incline (négatif : l'extrémité extérieure descend).
 */
function autour(n: number, r: number, y: number, p: Part, off = 0, tilt = 0): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const t = off + (i * 360) / n;
    const a = (t * Math.PI) / 180;
    out.push({ ...p, pos: [r3(r * Math.cos(a)), y, r3(-r * Math.sin(a))], rot: [0, r3(t), tilt] });
  }
  return out;
}

/** Point au rayon `r`, angle `t` (degrés, même convention qu'`autour`). */
const pt = (r: number, t: number): [number, number] => [r3(r * Math.cos((t * Math.PI) / 180)), r3(-r * Math.sin((t * Math.PI) / 180))];

/** Contour en pans de la tête des tourelles (vue de dessus, nez vers +z après rotation). */
const TETE: [number, number][] = [[-0.17, -0.2], [0.17, -0.2], [0.21, 0.02], [0.13, 0.22], [-0.13, 0.22], [-0.21, 0.02]];

/** Tourelle pivotante du pont : socle tourné, tête à pans, toit d'équipe, deux tubes à frein de bouche. */
function tourelle(i: number, t: number): Part[] {
  const name = `tourelle${i}`;
  const [x, z] = pt(3.0, t);
  const p = (q: Part): Part => ({ ...q, parent: name });
  return [
    { shape: "lathe", sides: 12, pos: [x, 1.48, z], color: "steel", pivot: name, profile: [[0.27, -0.06], [0.27, -0.02], [0.22, 0.06], [0, 0.06]] },
    p({ shape: "extrude", profile: TETE, depth: 0.16, bevel: 0.025, pos: [x, 1.62, z], rot: [90, 0, 0], color: "light" }),
    p({ shape: "extrude", profile: TETE, depth: 0.03, pos: [x, 1.71, r3(z - 0.01)], rot: [90, 0, 0], scale: [0.75, 0.75, 1], color: "faction" }),
    p({ shape: "box", size: [0.03, 0.03, 0.26], pos: [r3(x + 0.2), 1.63, z], color: "glow", fine: true }),
    p({ shape: "box", size: [0.03, 0.03, 0.26], pos: [r3(x - 0.2), 1.63, z], color: "glow", fine: true }),
    p({ shape: "box", size: [0.26, 0.12, 0.1], pos: [x, 1.61, r3(z + 0.24)], color: "dark" }),
    p({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.42, pos: [r3(x + 0.07), 1.62, r3(z + 0.47)], rot: [90, 0, 0], color: "steel" }),
    p({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.42, pos: [r3(x - 0.07), 1.62, r3(z + 0.47)], rot: [90, 0, 0], color: "steel" }),
    p({ shape: "cylinder", sides: 8, radius: 0.05, height: 0.08, pos: [r3(x + 0.07), 1.62, r3(z + 0.68)], rot: [90, 0, 0], color: "dark", fine: true }),
    p({ shape: "cylinder", sides: 8, radius: 0.05, height: 0.08, pos: [r3(x - 0.07), 1.62, r3(z + 0.68)], rot: [90, 0, 0], color: "dark", fine: true }),
    p({ shape: "box", size: [0.05, 0.04, 0.05], pos: [r3(x - 0.1), 1.73, r3(z - 0.1)], color: "amber", fine: true }),
    p({ shape: "box", size: [0.12, 0.05, 0.1], pos: [r3(x + 0.06), 1.74, r3(z - 0.08)], color: "dark", fine: true }),
  ];
}

/** Antenne du pont (entre deux tourelles) : socle, mât, traverse, feu ambre ; `parabole` : petite parabole. */
function antenne(t: number, parabole: boolean): Part[] {
  const [x, z] = pt(2.95, t);
  const out: Part[] = [
    { shape: "cylinder", sides: 6, radius: 0.1, radiusTop: 0.07, height: 0.08, pos: [x, 1.47, z], color: "dark" },
    { shape: "tube", radius: 0.025, sides: 5, path: [[x, 1.5, z], [x, 2.05, z]], color: "light", fine: true },
    ...autour(1, 2.95, 1.86, { shape: "box", size: [0.04, 0.03, 0.3], color: "metal", fine: true }, t),
    { shape: "sphere", radius: 0.055, pos: [x, 2.07, z], color: "amber", fine: true },
  ];
  if (parabole) {
    out.push({ shape: "lathe", sides: 12, pos: [x, 1.72, z], rot: [-40, 0, 0], color: "light", fine: true, profile: [[0, 0], [0.12, 0.03], [0.2, 0.09], [0.19, 0.1], [0, 0.04]] });
  }
  return out;
}

/** Baie de hangar dans la jante (angle `t`) : niche sombre, fond lumineux, deux portes entrouvertes. */
function baie(t: number): Part[] {
  return [
    ...autour(1, 4.4, 0.97, { shape: "box", size: [0.16, 0.22, 0.95], color: "dark" }, t),
    ...autour(1, 4.43, 0.97, { shape: "box", size: [0.06, 0.12, 0.7], color: "glow" }, t),
    ...autour(1, 4.47, 1.05, { shape: "box", size: [0.05, 0.05, 0.98], color: "light", fine: true }, t, -25),
    ...autour(1, 4.47, 0.89, { shape: "box", size: [0.05, 0.05, 0.98], color: "light", fine: true }, t, 25),
  ];
}

/** Grille de radiateur sur le glacis (angle `t`) : cadre sombre et quatre lames (fines). */
function grille(t: number): Part[] {
  const out: Part[] = [...autour(1, 3.7, 1.27, { shape: "box", size: [0.5, 0.04, 0.42], color: "dark" }, t, -16.5)];
  for (const d of [-0.15, -0.05, 0.05, 0.15]) {
    const a = ((t + d * 15) * Math.PI) / 180;
    out.push({ shape: "box", size: [0.42, 0.03, 0.04], pos: [r3(3.7 * Math.cos(a)), 1.3, r3(-3.7 * Math.sin(a))], rot: [0, r3(t + d * 15), -16.5], color: "steel", fine: true });
  }
  return out;
}

/** Plateforme d'appontage du pont (angle `t`) : disque de danger, aire sombre, balises lumineuses. */
function appontage(t: number): Part[] {
  const [x, z] = pt(3.0, t);
  return [
    { shape: "cylinder", sides: 12, radius: 0.34, height: 0.04, pos: [x, 1.45, z], color: "hazard" },
    { shape: "cylinder", sides: 12, radius: 0.26, height: 0.05, pos: [x, 1.46, z], color: "dark" },
    { shape: "box", size: [0.22, 0.01, 0.04], pos: [x, 1.49, z], color: "light", fine: true },
    { shape: "box", size: [0.04, 0.01, 0.22], pos: [x, 1.49, z], color: "light", fine: true },
    ...[45, 135, 225, 315].map((a): Part => {
      const [dx, dz] = pt(0.3, a);
      return { shape: "box", size: [0.04, 0.04, 0.04], pos: [r3(x + dx), 1.48, r3(z + dz)], color: "glow", fine: true };
    }),
  ];
}

/** Réacteur de sustentation sous le ventre (angle `t`) : tuyère tournée et disque lumineux. */
function sustentation(t: number): Part[] {
  const [x, z] = pt(2.7, t);
  return [
    { shape: "lathe", sides: 12, pos: [x, 0, z], color: "dark", fine: true, profile: [[0.16, 0.35], [0.22, 0.42], [0.26, 0.5], [0.2, 0.52]] },
    { shape: "cylinder", sides: 12, radius: 0.16, height: 0.02, pos: [x, 0.36, z], color: "glow", fine: true },
  ];
}

export const mothership: Model = {
  parts: [
    // ----- ventre : coque d'acier, projecteur de rayon tracteur, nervures lumineuses -----
    { shape: "lathe", sides: 24, color: "steel", profile: [[0.62, 0.12], [1.2, 0.16], [2.05, 0.34], [4.4, 0.86]] },
    { shape: "lathe", sides: 16, color: "dark", profile: [[0, 0.06], [0.5, 0.06], [0.62, 0.12], [0.62, 0.16]] },
    { shape: "cylinder", sides: 16, radius: 0.42, height: 0.03, pos: [0, 0.055, 0], color: "glow" },
    { shape: "lathe", sides: 24, color: "glow", profile: [[1.05, 0.15], [1.12, 0.12], [1.19, 0.17]] },
    { shape: "torus", radius: 0.55, tube: 0.03, sides: 16, pos: [0, 0.1, 0], color: "steel", fine: true },
    ...autour(8, 3.15, 0.58, { shape: "box", size: [2.1, 0.05, 0.06], color: "glow", fine: true }, 22.5, 12.3),
    ...autour(8, 2.6, 0.45, { shape: "box", size: [2.6, 0.06, 0.1], color: "dark", fine: true }, 0, 12.3),
    ...[0, 60, 120, 180, 240, 300].flatMap((t) => sustentation(t)),
    // ----- jante : bande d'acier, liseré lumineux, baies de hangar, feux ambre -----
    { shape: "lathe", sides: 32, color: "steel", profile: [[4.38, 0.84], [4.46, 0.86], [4.47, 0.9]] },
    { shape: "cylinder", sides: 32, radius: 4.49, height: 0.05, pos: [0, 0.925, 0], color: "glow" },
    { shape: "lathe", sides: 32, color: "steel", profile: [[4.47, 0.95], [4.5, 0.97], [4.5, 1.02], [4.45, 1.07], [4.38, 1.08]] },
    ...[270, 315, 0, 45, 90, 135, 180, 225].flatMap((t) => baie(t)),
    ...autour(8, 4.32, 1.1, { shape: "box", size: [0.12, 0.07, 0.12], color: "amber" }, 292.5),
    ...autour(16, 4.47, 0.965, { shape: "box", size: [0.04, 0.05, 0.05], color: "dark", fine: true }, 11.25),
    // ----- glacis : coque d'équipe, nervures radiales, panneaux alternés, grilles et trappes -----
    { shape: "lathe", sides: 32, color: "faction", profile: [[4.4, 1.08], [4.34, 1.11], [3.9, 1.24], [3.32, 1.36], [3.3, 1.4]] },
    ...autour(16, 3.84, 1.245, { shape: "box", size: [1.2, 0.07, 0.1], color: "steel" }, 0, -16.5),
    ...autour(8, 3.86, 1.232, { shape: "box", size: [0.85, 0.04, 0.95], color: "light" }, 11.25, -16.5),
    ...autour(4, 3.86, 1.232, { shape: "box", size: [0.85, 0.04, 0.95], color: "dark" }, 33.75, -16.5),
    ...autour(8, 4.12, 1.17, { shape: "box", size: [0.12, 0.05, 0.3], color: "glow" }, 33.75, -16.5),
    ...[123.75, 213.75, 303.75, 33.75].flatMap((t) => grille(t)),
    ...autour(8, 3.62, 1.285, { shape: "box", size: [0.26, 0.03, 0.26], color: "hazard", fine: true }, 11.25, -16.5),
    // ----- pont : disque clair, anneau lumineux, collecteur de cuivre, tourelles, appontage, antennes -----
    { shape: "lathe", sides: 32, color: "light", profile: [[3.3, 1.38], [3.3, 1.43], [2.6, 1.43], [2.56, 1.47], [2.44, 1.47]] },
    { shape: "cylinder", sides: 32, radius: 2.74, height: 0.03, pos: [0, 1.44, 0], color: "glow" },
    { shape: "lathe", sides: 32, color: "copper", profile: [[2.44, 1.47], [2.48, 1.52], [2.52, 1.47]] },
    ...autour(12, 2.48, 1.5, { shape: "box", size: [0.1, 0.06, 0.08], color: "steel", fine: true }, 15),
    ...tourelle(1, 0),
    ...tourelle(2, 60),
    ...tourelle(3, 120),
    ...tourelle(4, 180),
    ...tourelle(5, 240),
    ...tourelle(6, 300),
    ...appontage(90),
    ...appontage(270),
    ...antenne(30, true),
    ...antenne(150, false),
    ...antenne(210, true),
    ...antenne(330, false),
    // ----- gradin intérieur : nervures et hublots -----
    { shape: "lathe", sides: 24, color: "faction", profile: [[2.44, 1.47], [2.4, 1.52], [1.88, 1.88], [1.86, 1.92]] },
    ...autour(12, 2.13, 1.71, { shape: "box", size: [0.68, 0.06, 0.08], color: "steel", fine: true }, 15, -36),
    ...autour(12, 2.16, 1.69, { shape: "box", size: [0.2, 0.05, 0.26], color: "amber" }, 0, -36),
    // ----- pont supérieur, anneau lumineux, collerette et coupole vitrée nervurée -----
    { shape: "lathe", sides: 24, color: "metal", profile: [[1.86, 1.92], [1.86, 1.95], [1.58, 1.95]] },
    { shape: "cylinder", sides: 24, radius: 1.76, height: 0.03, pos: [0, 1.96, 0], color: "glow" },
    { shape: "lathe", sides: 24, color: "steel", profile: [[1.58, 1.95], [1.56, 2.05], [1.46, 2.1]] },
    { shape: "lathe", sides: 24, color: "glass", profile: [[1.46, 2.08], [1.38, 2.34], [1.1, 2.56], [0.6, 2.72], [0, 2.77]] },
    ...autour(6, 1.26, 2.36, { shape: "box", size: [0.74, 0.06, 0.07], color: "light" }, 0, -51),
    ...autour(6, 0.72, 2.72, { shape: "box", size: [0.7, 0.06, 0.07], color: "light" }, 0, -18),
    // ----- flèche et émetteur tournant -----
    { shape: "lathe", sides: 16, color: "steel", profile: [[0.34, 2.72], [0.3, 2.8], [0.2, 2.88], [0.16, 2.93], [0.12, 2.94]] },
    { shape: "torus", radius: 0.3, tube: 0.025, sides: 16, pos: [0, 2.79, 0], color: "glow" },
    { shape: "cylinder", sides: 10, radius: 0.13, height: 0.1, pos: [0, 2.98, 0], color: "dark", pivot: "emetteur" },
    ...autour(3, 0.4, 2.98, { shape: "box", size: [0.62, 0.05, 0.08], color: "steel", parent: "emetteur" }, 90),
    ...autour(3, 0.74, 2.98, { shape: "sphere", radius: 0.075, color: "glow", parent: "emetteur" }, 90),
    { shape: "cylinder", sides: 10, radius: 0.09, radiusTop: 0.05, height: 0.12, pos: [0, 3.08, 0], color: "steel", parent: "emetteur" },
    { shape: "tube", radius: 0.025, sides: 5, path: [[0, 3.1, 0], [0, 3.56, 0]], color: "light", parent: "emetteur", fine: true },
    { shape: "torus", radius: 0.1, tube: 0.015, sides: 12, pos: [0, 3.35, 0], color: "glow", parent: "emetteur", fine: true },
    { shape: "sphere", radius: 0.07, pos: [0, 3.6, 0], color: "amber", parent: "emetteur" },
  ],
};
