// hyper_cruiser : croiseur hyperespace. Long fuseau à proue effilée en plaques triangulaires superposées
// (quille sombre, pont clair, rampe dorsale), flancs à pans inclinés, hublots et filets lumineux, nervures,
// passerelle à radôme, antennes et radar tournant, deux tourelles laser pivotantes superposées, deux
// tourelles antiaériennes sur les nacelles, hangar ventral, pylônes en flèche portant deux grandes
// nacelles motrices annelées (entrée d'air à cône, dérive, tuyère évasée à cône central) et trois
// tuyères centrales. 3900 triangles.
import type { ColorName, Model, Part } from "../types.ts";

const r = (v: number): number => +v.toFixed(3);

/** Plaque triangulaire symétrique : pointe à `avant`, arrière plat de demi-largeur `hw` à `arriere`. */
function plaque(avant: number, arriere: number, hw: number, y: number, ep: number, color: ColorName): Part {
  return { shape: "wedge", size: [ep, hw, r(avant - arriere)], pos: [r(hw / 2), y, r((avant + arriere) / 2)], rot: [0, 0, -90], color, mirror: true };
}

/** Filet le long du bord droit d'une telle plaque (en retrait `d`), entre z0 et z1. */
function filet(avant: number, arriere: number, hw: number, d: number, z0: number, z1: number, y: number, h: number, color: ColorName): Part {
  const k = hw / (avant - arriere);
  const ang = Math.atan(k);
  const zc = (z0 + z1) / 2;
  return { shape: "box", size: [0.03, h, r((z1 - z0) / Math.cos(ang))], pos: [r(k * (avant - zc) - d), y, r(zc)], rot: [0, r((-ang * 180) / Math.PI), 0], color, mirror: true };
}

/** Tuyère pointant vers -z : carénage évasé, anneau, bague, flamme et cône central. */
function tuyere(x: number, y: number, z: number, rad: number, mirror = false): Part[] {
  const m = mirror ? { mirror: true } : {};
  const s = rad > 0.3 ? 8 : 6;
  return [
    { shape: "cylinder", sides: s, radius: r(rad * 1.12), radiusTop: rad, height: 0.5, pos: [x, y, r(z - 0.25)], rot: [90, 0, 0], color: "metal", ...m },
    { shape: "cylinder", sides: s, radius: r(rad * 1.22), height: 0.08, pos: [x, y, r(z - 0.1)], rot: [90, 0, 0], color: "dark", ...m },
    { shape: "cylinder", sides: s, radius: r(rad * 1.18), height: 0.06, pos: [x, y, r(z - 0.48)], rot: [90, 0, 0], color: "dark", ...m },
    { shape: "cylinder", sides: s, radius: r(rad * 0.92), height: 0.04, pos: [x, y, r(z - 0.5)], rot: [90, 0, 0], color: "glow", ...m },
    { shape: "cone", sides: s, radius: r(rad * 0.38), height: r(rad * 0.6), pos: [x, y, r(z - 0.52 - rad * 0.3)], rot: [-90, 0, 0], color: "dark", ...m },
  ];
}

/** Tourelle laser jumelée pivotante (affût, casemate, deux tubes à émetteur lumineux). */
function tourelleLaser(name: string, y: number, z: number): Part[] {
  return [
    { shape: "cylinder", sides: 8, radius: 0.28, height: 0.08, pos: [0, r(y + 0.04), z], color: "metal", pivot: name },
    { shape: "bevel", size: [0.5, 0.2, 0.56], pos: [0, r(y + 0.18), r(z - 0.03)], color: "light", parent: name },
    { shape: "bevel", size: [0.3, 0.06, 0.34], pos: [0, r(y + 0.3), r(z - 0.08)], color: "faction", parent: name },
    { shape: "box", size: [0.3, 0.03, 0.03], pos: [0, r(y + 0.22), r(z + 0.25)], color: "glow", parent: name },
    { shape: "cylinder", sides: 6, radius: 0.04, height: 0.62, pos: [0.11, r(y + 0.18), r(z + 0.52)], rot: [90, 0, 0], color: "dark", mirror: true, parent: name },
    { shape: "cylinder", sides: 6, radius: 0.06, height: 0.1, pos: [0.11, r(y + 0.18), r(z + 0.6)], rot: [90, 0, 0], color: "metal", mirror: true, parent: name },
    { shape: "cylinder", sides: 6, radius: 0.035, height: 0.06, pos: [0.11, r(y + 0.18), r(z + 0.85)], rot: [90, 0, 0], color: "glow", mirror: true, parent: name },
  ];
}

/** Tourelle antiaérienne pivotante : affût, dôme, deux tubes fins. */
function tourelleAA(name: string, x: number, y: number, z: number): Part[] {
  return [
    { shape: "cylinder", sides: 6, radius: 0.17, height: 0.07, pos: [x, r(y + 0.035), z], color: "metal", pivot: name },
    { shape: "sphere", radius: 0.14, pos: [x, r(y + 0.1), z], color: "light", parent: name },
    { shape: "box", size: [0.03, 0.03, 0.36], pos: [r(x + 0.06), r(y + 0.13), r(z + 0.2)], color: "dark", parent: name },
    { shape: "box", size: [0.03, 0.03, 0.36], pos: [r(x - 0.06), r(y + 0.13), r(z + 0.2)], color: "dark", parent: name },
    { shape: "box", size: [0.12, 0.025, 0.03], pos: [x, r(y + 0.2), r(z + 0.05)], color: "glow", parent: name },
  ];
}

// nacelles motrices (côté droit, copie miroir) : axe en x = NX, y = NY
const NX = 2.25;
const NY = 1.0;
const nac = (p: Part): Part => ({ ...p, mirror: true });

export const hyper_cruiser: Model = {
  parts: [
    // ----- fuseau central -----
    { shape: "bevel", size: [1.7, 0.7, 5.6], pos: [0, 0.85, -0.9], color: "dark" },
    { shape: "bevel", size: [1.1, 0.3, 4.6], pos: [0, 0.42, -1.0], color: "metal" },
    { shape: "bevel", size: [1.5, 0.3, 5.0], pos: [0, 1.33, -1.05], color: "light" },
    { shape: "bevel", size: [0.9, 0.16, 4.4], pos: [0, 1.55, -1.1], color: "faction" },
    // pans inclinés des flancs
    { shape: "wedge", size: [4.4, 0.28, 0.24], pos: [0.92, 1.28, -1.05], rot: [0, 90, 0], color: "light", mirror: true },
    { shape: "wedge", size: [4.0, 0.2, 0.2], pos: [0.62, 0.5, -1.0], rot: [180, 90, 0], color: "dark", mirror: true },

    // ----- proue effilée : plaques triangulaires superposées -----
    plaque(5.1, 1.8, 0.85, 0.8, 0.5, "dark"),
    plaque(4.1, 1.8, 0.56, 0.45, 0.24, "metal"),
    plaque(4.7, 1.5, 0.75, 1.17, 0.26, "light"),
    plaque(3.6, 1.5, 0.5, 1.32, 0.06, "faction"),
    { shape: "wedge", size: [0.76, 0.3, 2.0], pos: [0, 1.48, 2.45], color: "light" },
    { shape: "wedge", size: [0.3, 0.12, 1.4], pos: [0, 1.66, 1.6], color: "metal" },
    filet(5.1, 1.8, 0.85, -0.005, 2.0, 4.6, 0.8, 0.04, "glow"),
    filet(4.7, 1.5, 0.75, 0.08, 1.7, 4.0, 1.305, 0.02, "dark"),
    // pointe : capteur et feu
    { shape: "cylinder", sides: 5, radius: 0.03, height: 0.4, pos: [0, 0.9, 5.05], rot: [90, 0, 0], color: "light" },
    { shape: "box", size: [0.07, 0.07, 0.07], pos: [0, 0.9, 5.27], color: "amber" },
    { shape: "box", size: [0.07, 0.05, 0.07], pos: [0.45, 0.8, 3.5], color: "amber", mirror: true },

    // ----- hublots, nervures, tranchées -----
    ...[[-3.3, -2.3], [-2.0, -1.0], [-0.7, 0.3], [0.6, 1.6]].map(([a, b]): Part => ({
      shape: "box", size: [0.03, 0.04, r(b - a)], pos: [0.86, 0.98, r((a + b) / 2)], color: "glow", mirror: true,
    })),
    { shape: "box", size: [0.03, 0.03, 4.2], pos: [0.86, 0.7, -1.0], color: "dark", mirror: true },
    ...[-3.1, -2.4, -1.7, -1.0, -0.3, 0.4, 1.1].map((z): Part => ({
      shape: "box", size: [0.12, 0.05, 0.05], pos: [0.62, 1.5, z], color: "dark", mirror: true,
    })),
    { shape: "box", size: [0.05, 0.03, 4.4], pos: [0.3, 1.64, -1.1], color: "dark", mirror: true },
    { shape: "box", size: [0.04, 0.035, 4.0], pos: [0, 1.64, -1.1], color: "glow" },
    { shape: "box", size: [0.3, 0.04, 0.9], pos: [0.55, 1.5, -3.0], color: "metal", mirror: true },

    // ----- hangar ventral -----
    { shape: "box", size: [0.6, 0.05, 1.5], pos: [0, 0.25, -1.2], color: "glow" },
    { shape: "box", size: [0.1, 0.08, 1.7], pos: [0.36, 0.25, -1.2], color: "dark", mirror: true },
    { shape: "box", size: [0.06, 0.05, 0.06], pos: [0.36, 0.24, -0.3], color: "amber", mirror: true },

    // ----- passerelle et tour -----
    { shape: "bevel", size: [0.75, 0.42, 1.0], pos: [0, 1.82, -2.3], color: "light" },
    { shape: "bevel", size: [1.2, 0.28, 0.7], pos: [0, 2.15, -2.2], color: "metal" },
    { shape: "box", size: [1.0, 0.05, 0.03], pos: [0, 2.17, -1.84], color: "glow" },
    { shape: "box", size: [0.03, 0.05, 0.4], pos: [0.6, 2.17, -2.2], color: "glow", mirror: true },
    { shape: "bevel", size: [0.8, 0.07, 0.5], pos: [0, 2.32, -2.25], color: "faction" },
    { shape: "box", size: [0.06, 0.05, 0.06], pos: [0.56, 2.08, -1.86], color: "amber", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.05, height: 0.2, pos: [0.42, 2.42, -2.4], color: "metal" },
    { shape: "sphere", radius: 0.17, detail: 1, pos: [0.42, 2.58, -2.4], color: "metal" },
    { shape: "cylinder", sides: 8, radius: 0.18, height: 0.025, pos: [0.42, 2.58, -2.4], color: "glow" },
    { shape: "cylinder", sides: 5, radius: 0.018, height: 0.6, pos: [-0.35, 2.6, -2.45], color: "light" },
    { shape: "box", size: [0.2, 0.015, 0.015], pos: [-0.35, 2.75, -2.45], color: "light" },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [-0.35, 2.92, -2.45], color: "amber" },
    { shape: "cylinder", sides: 5, radius: 0.014, height: 0.38, pos: [-0.5, 2.5, -2.25], color: "light" },
    { shape: "cylinder", sides: 6, radius: 0.05, height: 0.14, pos: [0, 2.42, -2.5], color: "metal", pivot: "radar" },
    { shape: "box", size: [0.4, 0.1, 0.035], pos: [0, 2.52, -2.5], color: "dark", parent: "radar" },
    { shape: "box", size: [0.34, 0.035, 0.04], pos: [0, 2.52, -2.48], color: "glow", parent: "radar" },

    // ----- tourelles laser (la seconde surélevée sur une barbette) -----
    ...tourelleLaser("tourelle_1", 1.63, 0.55),
    { shape: "bevel", size: [0.5, 0.18, 0.5], pos: [0, 1.72, -1.05], color: "metal" },
    ...tourelleLaser("tourelle_2", 1.81, -1.05),

    // ----- tuyères centrales -----
    { shape: "bevel", size: [1.6, 0.85, 0.3], pos: [0, 0.88, -3.62], color: "dark" },
    ...tuyere(0, 0.98, -3.55, 0.3),
    ...tuyere(0.5, 0.68, -3.55, 0.2, true),

    // ----- pylônes en flèche -----
    { shape: "bevel", size: [1.3, 0.22, 2.4], pos: [1.35, 0.95, -1.55], color: "dark", mirror: true },
    { shape: "box", size: [0.26, 0.05, 2.0], pos: [1.12, 1.07, -1.6], color: "faction", mirror: true },
    { shape: "box", size: [0.26, 0.05, 2.0], pos: [1.6, 1.07, -1.6], color: "faction", mirror: true },
    ...[-2.5, -1.9, -1.3].map((z): Part => ({ shape: "box", size: [1.1, 0.06, 0.06], pos: [1.35, 1.07, z], color: "dark", mirror: true })),
    { shape: "wedge", size: [0.2, 1.1, 1.0], pos: [1.3, 0.95, -0.15], rot: [0, 0, -90], color: "dark", mirror: true },
    { shape: "box", size: [0.9, 0.03, 0.03], pos: [1.35, 1.12, -1.0], color: "glow", mirror: true },
    { shape: "box", size: [0.04, 0.05, 1.6], pos: [1.35, 0.83, -1.6], color: "glow", mirror: true },
    { shape: "box", size: [0.06, 0.05, 0.06], pos: [1.75, 1.12, -2.65], color: "amber", mirror: true },

    // ----- nacelles motrices -----
    nac({ shape: "cylinder", sides: 8, radius: 0.45, height: 3.0, pos: [NX, NY, -1.6], rot: [90, 0, 0], color: "light" }),
    nac({ shape: "cylinder", sides: 8, radius: 0.45, radiusTop: 0.37, height: 0.4, pos: [NX, NY, 0.1], rot: [90, 0, 0], color: "dark" }),
    nac({ shape: "cylinder", sides: 8, radius: 0.33, height: 0.03, pos: [NX, NY, 0.3], rot: [90, 0, 0], color: "glow" }),
    nac({ shape: "cone", sides: 8, radius: 0.24, height: 0.45, pos: [NX, NY, 0.5], rot: [90, 0, 0], color: "metal" }),
    ...[-0.35, -1.2, -2.05, -2.85].map((z) => nac({ shape: "cylinder", sides: 8, radius: 0.48, height: 0.12, pos: [NX, NY, z], rot: [90, 0, 0], color: "dark" })),
    nac({ shape: "box", size: [0.03, 0.05, 0.7], pos: [r(NX + 0.46), NY, -0.78], color: "glow" }),
    nac({ shape: "box", size: [0.03, 0.05, 0.7], pos: [r(NX + 0.46), NY, -1.63], color: "glow" }),
    nac({ shape: "box", size: [0.03, 0.05, 0.6], pos: [r(NX + 0.46), NY, -2.45], color: "glow" }),
    nac({ shape: "bevel", size: [0.36, 0.07, 0.7], pos: [NX, r(NY + 0.44), -1.62], color: "faction" }),
    nac({ shape: "bevel", size: [0.36, 0.07, 0.6], pos: [NX, r(NY + 0.44), -2.45], color: "faction" }),
    nac({ shape: "bevel", size: [0.3, 0.06, 0.7], pos: [NX, r(NY - 0.44), -1.6], color: "metal" }),
    // dérive et feu
    nac({ shape: "wedge", size: [0.06, 0.5, 1.1], pos: [NX, r(NY + 0.68), -2.75], color: "faction" }),
    nac({ shape: "box", size: [0.06, 0.06, 0.06], pos: [NX, r(NY + 0.95), -3.28], color: "amber" }),
    nac({ shape: "box", size: [0.06, 0.05, 0.06], pos: [r(NX + 0.47), NY, 0.15], color: "amber" }),
    // tuyère de nacelle
    ...tuyere(NX, NY, -3.1, 0.42, true),
    // tourelles antiaériennes sur les nacelles
    ...tourelleAA("tourelle_aa_d", NX, r(NY + 0.44), -0.8),
    ...tourelleAA("tourelle_aa_g", -NX, r(NY + 0.44), -0.8),
  ],
};
