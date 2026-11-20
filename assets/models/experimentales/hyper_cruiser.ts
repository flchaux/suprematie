// hyper_cruiser : croiseur hyperespace. Long fuseau à proue effilée en plaques triangulaires superposées
// (quille sombre, pont clair, rampe dorsale, éperon d'acier), coque à flancs en pans, conduites de cuivre,
// hublots et filets lumineux, nervures, grilles d'évents ; passerelle profilée à verrière, radôme et
// antennes, radar tournant ; deux tourelles laser à pans pivotantes superposées (fûts à bagues), deux
// tourelles antiaériennes à dôme sur les nacelles ; hangar ventral ; pylônes en flèche profilés portant
// deux grandes nacelles motrices tournées et annelées (lèvre d'entrée d'air, cône, dérive d'équipe, tuyère
// évasée à cône central) et trois tuyères centrales. Pièces fines : lames des grilles, antennes, rivets,
// bagues des fûts, feux.
import type { ColorName, Model, Part } from "../types.ts";

const r = (v: number): number => +v.toFixed(3);

/** Plaque triangulaire symétrique : pointe à `avant`, arrière plat de demi-largeur `hw` à `arriere`. */
function plaque(avant: number, arriere: number, hw: number, y: number, ep: number, color: ColorName): Part {
  return { shape: "wedge", size: [ep, hw, r(avant - arriere)], pos: [r(hw / 2), y, r((avant + arriere) / 2)], rot: [0, 0, -90], color, mirror: true };
}

/** Filet le long du bord droit d'une telle plaque (en retrait `d`), entre z0 et z1. */
function filet(avant: number, arriere: number, hw: number, d: number, z0: number, z1: number, y: number, h: number, color: ColorName, fine = false): Part {
  const k = hw / (avant - arriere);
  const ang = Math.atan(k);
  const zc = (z0 + z1) / 2;
  const p: Part = { shape: "box", size: [0.03, h, r((z1 - z0) / Math.cos(ang))], pos: [r(k * (avant - zc) - d), y, r(zc)], rot: [0, r((-ang * 180) / Math.PI), 0], color, mirror: true };
  return fine ? { ...p, fine } : p;
}

/**
 * Tuyère tournée pointant vers -z (base en z) : carénage à bague, lèvre évasée, paroi intérieure,
 * disque lumineux et cône central.
 */
function tuyere(x: number, y: number, z: number, rad: number, mirror = false): Part[] {
  const m = mirror ? { mirror: true } : {};
  const pr = (a: number, h: number): [number, number] => [r(rad * a), h];
  return [
    { shape: "lathe", sides: 12, pos: [x, y, z], rot: [-90, 0, 0], color: "steel", ...m,
      profile: [pr(1.12, 0), pr(1.22, 0.08), pr(1.1, 0.18), pr(1.12, 0.44), pr(1.2, 0.5), pr(0.9, 0.52)] },
    { shape: "cylinder", sides: 12, radius: r(rad * 0.9), height: 0.03, pos: [x, y, r(z - 0.31)], rot: [90, 0, 0], color: "glow", ...m },
    { shape: "lathe", sides: 12, pos: [x, y, r(z - 0.3)], rot: [-90, 0, 0], color: "dark", ...m, profile: [pr(0.4, 0), pr(0.36, 0.18), pr(0.2, 0.32 + rad * 0.2), [0, r(0.22 + rad * 0.6)]] },
  ];
}

/** Contour (vue de dessus) de la casemate des tourelles laser. */
const CASEMATE: [number, number][] = [[-0.25, -0.3], [0.25, -0.3], [0.28, 0.08], [0.16, 0.27], [-0.16, 0.27], [-0.28, 0.08]];

/** Tourelle laser jumelée pivotante : affût tourné, casemate à pans, toit d'équipe, deux fûts à bagues. */
function tourelleLaser(name: string, y: number, z: number): Part[] {
  const p = (q: Part): Part => ({ ...q, parent: name });
  return [
    { shape: "lathe", sides: 16, pos: [0, r(y + 0.04), z], color: "steel", pivot: name, profile: [[0.3, -0.04], [0.3, 0.0], [0.26, 0.04], [0, 0.04]] },
    p({ shape: "extrude", profile: CASEMATE, depth: 0.2, bevel: 0.03, pos: [0, r(y + 0.18), r(z - 0.03)], rot: [90, 0, 0], color: "light" }),
    p({ shape: "extrude", profile: CASEMATE, depth: 0.04, pos: [0, r(y + 0.29), r(z - 0.06)], rot: [90, 0, 0], scale: [0.7, 0.7, 1], color: "faction" }),
    p({ shape: "box", size: [0.3, 0.03, 0.03], pos: [0, r(y + 0.22), r(z + 0.25)], color: "glow" }),
    p({ shape: "box", size: [0.08, 0.05, 0.12], pos: [-0.1, r(y + 0.32), r(z - 0.18)], color: "dark", fine: true }),
    p({ shape: "lathe", sides: 6, pos: [0.11, r(y + 0.18), r(z + 0.2)], rot: [90, 0, 0], color: "steel", mirror: true,
      profile: [[0.065, 0], [0.065, 0.12], [0.04, 0.15], [0.04, 0.62], [0, 0.66]] }),
    ...[0.38, 0.5].map((dz) => p({ shape: "cylinder", sides: 8, radius: 0.055, height: 0.035, pos: [0.11, r(y + 0.18), r(z + dz)], rot: [90, 0, 0], color: "dark", mirror: true, fine: true })),
    p({ shape: "cylinder", sides: 6, radius: 0.035, height: 0.06, pos: [0.11, r(y + 0.18), r(z + 0.85)], rot: [90, 0, 0], color: "glow", mirror: true }),
  ];
}

/** Tourelle antiaérienne pivotante : affût, dôme tourné, deux tubes fins. */
function tourelleAA(name: string, x: number, y: number, z: number): Part[] {
  const p = (q: Part): Part => ({ ...q, parent: name });
  return [
    { shape: "cylinder", sides: 12, radius: 0.18, height: 0.07, pos: [x, r(y + 0.035), z], color: "steel", pivot: name },
    p({ shape: "lathe", sides: 12, pos: [x, r(y + 0.07), z], color: "light", profile: [[0.15, 0], [0.145, 0.06], [0.11, 0.12], [0.05, 0.15], [0, 0.155]] }),
    p({ shape: "cylinder", sides: 6, radius: 0.018, height: 0.36, pos: [r(x + 0.06), r(y + 0.13), r(z + 0.2)], rot: [90, 0, 0], color: "steel" }),
    p({ shape: "cylinder", sides: 6, radius: 0.018, height: 0.36, pos: [r(x - 0.06), r(y + 0.13), r(z + 0.2)], rot: [90, 0, 0], color: "steel" }),
    p({ shape: "box", size: [0.12, 0.025, 0.03], pos: [x, r(y + 0.2), r(z + 0.05)], color: "glow" }),
  ];
}

// nacelles motrices (côté droit, copie miroir) : axe en x = NX, y = NY
const NX = 2.25;
const NY = 1.0;
const nac = (p: Part): Part => ({ ...p, mirror: true });

/** Contour (côté, x = z, y = hauteur) de la passerelle : avant incliné, toit plat. */
const TOUR: [number, number][] = [[-2.8, 1.58], [-1.85, 1.58], [-1.76, 1.82], [-1.92, 2.03], [-2.76, 2.03], [-2.82, 1.92]];

export const hyper_cruiser: Model = {
  parts: [
    // ----- fuseau central : quille, coque à flancs en pans, pont, rampe dorsale -----
    { shape: "extrude", profile: [[-0.45, 0.27], [0.45, 0.27], [0.55, 0.42], [0.55, 0.57], [-0.55, 0.57], [-0.55, 0.42]], depth: 4.6, pos: [0, 0, -1.0], color: "metal" },
    { shape: "extrude", profile: [[-0.66, 0.5], [0.66, 0.5], [0.86, 0.72], [0.86, 1.04], [0.76, 1.2], [-0.76, 1.2], [-0.86, 1.04], [-0.86, 0.72]], depth: 5.6, bevel: 0.03, pos: [0, 0, -0.9], color: "dark" },
    { shape: "extrude", profile: [[-0.75, 1.18], [0.75, 1.18], [0.75, 1.4], [0.62, 1.48], [-0.62, 1.48], [-0.75, 1.4]], depth: 5.0, bevel: 0.03, pos: [0, 0, -1.05], color: "light" },
    { shape: "extrude", profile: [[-0.45, 1.47], [0.45, 1.47], [0.4, 1.6], [-0.4, 1.6]], depth: 4.4, bevel: 0.02, pos: [0, 0, -1.1], color: "faction" },
    // pans inclinés des flancs
    { shape: "wedge", size: [4.4, 0.28, 0.24], pos: [0.92, 1.28, -1.05], rot: [0, 90, 0], color: "light", mirror: true },
    { shape: "wedge", size: [4.0, 0.2, 0.2], pos: [0.62, 0.5, -1.0], rot: [180, 90, 0], color: "dark", mirror: true },

    // ----- proue effilée : plaques triangulaires superposées, éperon -----
    plaque(5.1, 1.8, 0.85, 0.8, 0.5, "dark"),
    plaque(4.1, 1.8, 0.56, 0.45, 0.24, "metal"),
    plaque(4.7, 1.5, 0.75, 1.17, 0.26, "light"),
    plaque(3.6, 1.5, 0.5, 1.32, 0.06, "faction"),
    { shape: "wedge", size: [0.76, 0.3, 2.0], pos: [0, 1.48, 2.45], color: "light" },
    { shape: "wedge", size: [0.3, 0.12, 1.4], pos: [0, 1.66, 1.6], color: "steel" },
    filet(5.1, 1.8, 0.85, -0.005, 2.0, 4.6, 0.8, 0.04, "glow"),
    filet(4.7, 1.5, 0.75, 0.08, 1.7, 4.0, 1.305, 0.02, "dark"),
    filet(4.7, 1.5, 0.75, 0.22, 1.7, 3.6, 1.305, 0.02, "dark", true),
    // plaques de blindage rapportées et rivets sur la proue
    { shape: "box", size: [0.34, 0.04, 0.7], pos: [0.36, 1.32, 2.15], rot: [0, -12, 0], color: "steel", mirror: true },
    ...[2.7, 3.1, 3.5].map((z): Part => ({ shape: "cylinder", sides: 6, radius: 0.025, height: 0.02, pos: [r(0.3 - (z - 2.7) * 0.1), 1.31, z], color: "dark", mirror: true, fine: true })),
    // éperon d'acier et capteur de pointe
    { shape: "lathe", sides: 10, pos: [0, 0.9, 4.45], rot: [90, 0, 0], color: "steel", profile: [[0.1, 0], [0.09, 0.2], [0.05, 0.45], [0.025, 0.6], [0.02, 0.78], [0, 0.8]] },
    { shape: "box", size: [0.07, 0.07, 0.07], pos: [0, 0.9, 5.27], color: "amber" },
    { shape: "box", size: [0.07, 0.05, 0.07], pos: [0.45, 0.8, 3.5], color: "amber", mirror: true },

    // ----- hublots, conduites de cuivre, nervures, tranchées -----
    ...[[-3.3, -2.3], [-2.0, -1.0], [-0.7, 0.3], [0.6, 1.6]].map(([a, b]): Part => ({
      shape: "box", size: [0.03, 0.04, r(b - a)], pos: [0.87, 0.98, r((a + b) / 2)], color: "glow", mirror: true,
    })),
    { shape: "tube", radius: 0.035, sides: 6, path: [[0.8, 0.62, 1.7], [0.89, 0.72, 1.5], [0.89, 0.72, -3.2], [0.8, 0.62, -3.4]], bend: 0.12, color: "copper", mirror: true },
    { shape: "tube", radius: 0.025, sides: 6, path: [[0.89, 0.82, 1.2], [0.89, 0.82, -3.1]], color: "steel", mirror: true, fine: true },
    ...[-3.0, -2.15, -1.3, -0.45, 0.4, 1.25].map((z): Part => ({ shape: "box", size: [0.05, 0.16, 0.06], pos: [0.9, 0.77, z], color: "dark", mirror: true, fine: true })),
    ...[-3.1, -2.4, -1.7, -1.0, -0.3, 0.4, 1.1].map((z, i): Part => ({
      shape: "box", size: [0.12, 0.05, 0.05], pos: [0.56, 1.5, z], color: "dark", mirror: true, ...(i % 2 ? { fine: true } : {}),
    })),
    { shape: "box", size: [0.05, 0.03, 4.4], pos: [0.3, 1.62, -1.1], color: "dark", mirror: true },
    { shape: "box", size: [0.04, 0.035, 4.0], pos: [0, 1.62, -1.1], color: "glow" },
    // grilles d'évents sur le pont arrière (lames fines)
    { shape: "box", size: [0.3, 0.04, 0.9], pos: [0.53, 1.5, -3.0], color: "black", mirror: true },
    ...[-3.36, -3.24, -3.12, -3.0, -2.88, -2.76, -2.64].map((z): Part => ({ shape: "box", size: [0.28, 0.03, 0.04], pos: [0.53, 1.525, z], color: "steel", mirror: true, fine: true })),
    // silos de missiles le long de la rampe dorsale : trappes sombres à liseré de danger
    ...[-0.25, -0.55, -1.55, -1.85, -2.15].map((z): Part => ({ shape: "box", size: [0.16, 0.02, 0.2], pos: [0.2, 1.61, z], color: "black", mirror: true, fine: true })),
    ...[-0.4, -1.7, -2.0].map((z): Part => ({ shape: "box", size: [0.3, 0.015, 0.02], pos: [0.2, 1.61, z], color: "hazard", mirror: true, fine: true })),
    // trappes d'équipe et voyants sur le pont avant
    { shape: "box", size: [0.3, 0.04, 0.5], pos: [0.48, 1.49, 0.4], color: "faction", mirror: true },
    { shape: "box", size: [0.05, 0.03, 0.05], pos: [0.48, 1.52, 0.69], color: "amber", mirror: true, fine: true },

    // ----- hangar ventral -----
    { shape: "box", size: [0.6, 0.05, 1.5], pos: [0, 0.25, -1.2], color: "glow" },
    { shape: "box", size: [0.1, 0.08, 1.7], pos: [0.36, 0.25, -1.2], color: "dark", mirror: true },
    ...[-1.75, -1.4, -1.05, -0.7].map((z): Part => ({ shape: "box", size: [0.62, 0.06, 0.04], pos: [0, 0.245, z], color: "dark", fine: true })),
    { shape: "box", size: [0.06, 0.05, 0.06], pos: [0.36, 0.24, -0.3], color: "amber", mirror: true },

    // ----- passerelle profilée, verrière, radôme, antennes -----
    { shape: "extrude", profile: TOUR, depth: 0.75, bevel: 0.03, rot: [0, -90, 0], color: "light" },
    { shape: "extrude", profile: [[-2.55, 2.01], [-1.88, 2.01], [-1.76, 2.15], [-1.86, 2.29], [-2.55, 2.29]], depth: 1.2, bevel: 0.03, rot: [0, -90, 0], color: "steel" },
    { shape: "box", size: [1.0, 0.07, 0.03], pos: [0, 2.2, -1.8], rot: [-50, 0, 0], color: "glass" },
    { shape: "box", size: [0.6, 0.1, 0.03], pos: [0, 1.9, -1.84], rot: [22, 0, 0], color: "glass" },
    { shape: "box", size: [0.03, 0.05, 0.4], pos: [0.61, 2.17, -2.2], color: "glow", mirror: true },
    { shape: "bevel", size: [0.8, 0.07, 0.5], pos: [0, 2.32, -2.25], color: "faction" },
    { shape: "box", size: [0.06, 0.05, 0.06], pos: [0.56, 2.08, -1.86], color: "amber", mirror: true },
    { shape: "cylinder", sides: 6, radius: 0.05, height: 0.2, pos: [0.42, 2.42, -2.4], color: "steel" },
    { shape: "lathe", sides: 12, pos: [0.42, 2.48, -2.4], color: "light", profile: [[0.18, 0], [0.18, 0.06], [0.15, 0.16], [0.08, 0.24], [0, 0.26]] },
    { shape: "cylinder", sides: 12, radius: 0.19, height: 0.025, pos: [0.42, 2.5, -2.4], color: "glow" },
    { shape: "tube", radius: 0.018, sides: 4, path: [[-0.35, 2.33, -2.45], [-0.35, 2.9, -2.45]], color: "light", fine: true },
    { shape: "box", size: [0.2, 0.015, 0.015], pos: [-0.35, 2.75, -2.45], color: "light", fine: true },
    { shape: "box", size: [0.05, 0.05, 0.05], pos: [-0.35, 2.92, -2.45], color: "amber", fine: true },
    { shape: "tube", radius: 0.014, sides: 4, path: [[-0.5, 2.33, -2.25], [-0.5, 2.69, -2.25]], color: "light", fine: true },
    // radar tournant
    { shape: "cylinder", sides: 6, radius: 0.05, height: 0.14, pos: [0, 2.42, -2.5], color: "steel", pivot: "radar" },
    { shape: "extrude", profile: [[-0.22, -0.05], [0.22, -0.05], [0.2, 0.05], [-0.2, 0.05]], depth: 0.035, pos: [0, 2.52, -2.5], rot: [-12, 0, 0], color: "dark", parent: "radar" },
    { shape: "box", size: [0.34, 0.035, 0.04], pos: [0, 2.52, -2.48], color: "glow", parent: "radar" },

    // ----- tourelles laser (la seconde surélevée sur une barbette) -----
    ...tourelleLaser("tourelle_1", 1.63, 0.55),
    { shape: "lathe", sides: 16, pos: [0, 1.6, -1.05], color: "metal", profile: [[0.3, 0], [0.3, 0.16], [0.26, 0.21], [0, 0.21]] },
    ...tourelleLaser("tourelle_2", 1.81, -1.05),

    // ----- tuyères centrales -----
    { shape: "extrude", profile: [[-0.8, 0.46], [0.8, 0.46], [0.8, 1.15], [0.6, 1.3], [-0.6, 1.3], [-0.8, 1.15]], depth: 0.3, bevel: 0.03, pos: [0, 0, -3.62], color: "dark" },
    ...tuyere(0, 0.98, -3.55, 0.3),
    ...tuyere(0.5, 0.68, -3.55, 0.2, true),

    // ----- pylônes en flèche profilés -----
    { shape: "extrude", profile: [[0.75, -2.75], [1.95, -2.75], [1.95, -0.35], [0.75, 0.25]], depth: 0.22, bevel: 0.03, pos: [0, 0.95, 0], rot: [90, 0, 0], color: "dark", mirror: true },
    { shape: "box", size: [0.26, 0.05, 2.0], pos: [1.12, 1.07, -1.6], color: "faction", mirror: true },
    { shape: "box", size: [0.26, 0.05, 2.0], pos: [1.6, 1.07, -1.6], color: "faction", mirror: true },
    ...[-2.5, -1.9, -1.3].map((z): Part => ({ shape: "box", size: [1.1, 0.06, 0.06], pos: [1.35, 1.07, z], color: "steel", mirror: true })),
    { shape: "tube", radius: 0.03, sides: 6, path: [[0.9, 1.1, -0.7], [1.36, 1.1, -0.7], [1.36, 1.1, -2.6], [1.8, 1.1, -2.7]], bend: 0.1, color: "copper", mirror: true, fine: true },
    { shape: "box", size: [0.9, 0.03, 0.03], pos: [1.35, 1.1, -1.0], color: "glow", mirror: true },
    { shape: "box", size: [0.04, 0.05, 1.6], pos: [1.35, 0.83, -1.6], color: "glow", mirror: true },
    { shape: "box", size: [0.06, 0.05, 0.06], pos: [1.75, 1.12, -2.65], color: "amber", mirror: true },

    // ----- nacelles motrices : fût tourné, lèvre d'entrée d'air, cône, anneaux -----
    nac({ shape: "lathe", sides: 16, pos: [NX, NY, 0], rot: [90, 0, 0], color: "light",
      profile: [[0.42, -3.1], [0.45, -3.02], [0.45, -0.1], [0.42, 0.12], [0.39, 0.28], [0.36, 0.33], [0.31, 0.3], [0.3, 0.2]] }),
    nac({ shape: "lathe", sides: 16, pos: [NX, NY, 0], rot: [90, 0, 0], color: "steel", profile: [[0.3, 0.2], [0.24, 0.27], [0.12, 0.5], [0.03, 0.7], [0, 0.72]] }),
    nac({ shape: "cylinder", sides: 16, radius: 0.345, height: 0.03, pos: [NX, NY, 0.315], rot: [90, 0, 0], color: "glow" }),
    ...[-0.35, -1.2, -2.05, -2.85].map((z) => nac({ shape: "cylinder", sides: 12, radius: 0.48, height: 0.12, pos: [NX, NY, z], rot: [90, 0, 0], color: "dark" })),
    ...[-0.35, -1.2, -2.05, -2.85].map((z) => nac({ shape: "torus", radius: 0.48, tube: 0.012, sides: 16, pos: [NX, NY, r(z + 0.06)], rot: [90, 0, 0], color: "steel", fine: true })),
    nac({ shape: "box", size: [0.03, 0.05, 0.7], pos: [r(NX + 0.46), NY, -0.78], color: "glow" }),
    nac({ shape: "box", size: [0.03, 0.05, 0.7], pos: [r(NX + 0.46), NY, -1.63], color: "glow" }),
    nac({ shape: "box", size: [0.03, 0.05, 0.6], pos: [r(NX + 0.46), NY, -2.45], color: "glow" }),
    nac({ shape: "box", size: [0.36, 0.07, 0.7], pos: [NX, r(NY + 0.44), -1.62], color: "faction" }),
    nac({ shape: "box", size: [0.36, 0.07, 0.6], pos: [NX, r(NY + 0.44), -2.45], color: "faction" }),
    nac({ shape: "box", size: [0.3, 0.06, 0.7], pos: [NX, r(NY - 0.44), -1.6], color: "metal" }),
    ...[-1.82, -1.62, -1.42].map((z) => nac({ shape: "box", size: [0.3, 0.02, 0.04], pos: [NX, r(NY + 0.48), z], color: "black", fine: true })),
    // dérive profilée et feu
    nac({ shape: "extrude", profile: [[-3.3, 1.42], [-2.3, 1.42], [-2.95, 1.92], [-3.32, 1.92]], depth: 0.06, bevel: 0.015, pos: [NX, 0, 0], rot: [0, -90, 0], color: "faction" }),
    nac({ shape: "box", size: [0.02, 0.04, 0.45], pos: [NX, 1.64, -2.88], rot: [-38, 0, 0], color: "glow", fine: true }),
    nac({ shape: "box", size: [0.06, 0.06, 0.06], pos: [NX, r(NY + 0.95), -3.28], color: "amber" }),
    nac({ shape: "box", size: [0.06, 0.05, 0.06], pos: [r(NX + 0.47), NY, 0.15], color: "amber" }),
    // tuyère de nacelle
    ...tuyere(NX, NY, -3.1, 0.42, true),
    // tourelles antiaériennes sur les nacelles
    ...tourelleAA("tourelle_aa_d", NX, r(NY + 0.44), -0.8),
    ...tourelleAA("tourelle_aa_g", -NX, r(NY + 0.44), -0.8),
  ],
};
