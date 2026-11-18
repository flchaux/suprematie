// mothership : Vaisseau-mère, soucoupe géante (3748 triangles).
// Coque fine en gradins à 24 facettes : ventre conique sombre à rayon tracteur et nervures lumineuses,
// jante métallique cerclée de lumière percée de huit baies de hangar (feux ambre entre elles),
// glacis aux couleurs du joueur à nervures radiales et panneaux alternés, pont circulaire à anneau
// lumineux portant six tourelles pivotantes (« tourelle1 »…« tourelle6 ») et quatre antennes,
// gradin intérieur à hublots, coupole vitrée nervurée et flèche à émetteur tournant (« emetteur »).
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

/** Tourelle pivotante du pont : socle, tête blindée, deux tubes vers l'avant (+z). */
function tourelle(i: number, t: number): Part[] {
  const name = `tourelle${i}`;
  const a = (t * Math.PI) / 180;
  const x = r3(3.0 * Math.cos(a));
  const z = r3(-3.0 * Math.sin(a));
  return [
    { shape: "cylinder", sides: 8, radius: 0.24, radiusTop: 0.2, height: 0.12, pos: [x, 1.48, z], color: "metal", pivot: name },
    { shape: "bevel", size: [0.32, 0.16, 0.38], pos: [x, 1.6, z], color: "dark", parent: name },
    { shape: "box", size: [0.045, 0.045, 0.42], pos: [r3(x + 0.07), 1.62, r3(z + 0.34)], color: "metal", parent: name },
    { shape: "box", size: [0.045, 0.045, 0.42], pos: [r3(x - 0.07), 1.62, r3(z + 0.34)], color: "metal", parent: name },
    { shape: "box", size: [0.18, 0.03, 0.04], pos: [x, 1.69, r3(z - 0.1)], color: "glow", parent: name },
  ];
}

/** Antenne du pont (entre deux tourelles) : mât, traverse, feu ambre. */
function antenne(t: number): Part[] {
  return [
    ...autour(1, 2.95, 1.7, { shape: "cylinder", sides: 4, radius: 0.03, height: 0.6, color: "light" }, t),
    ...autour(1, 2.95, 1.86, { shape: "box", size: [0.04, 0.03, 0.3], color: "metal" }, t),
    ...autour(1, 2.95, 2.02, { shape: "sphere", radius: 0.06, color: "amber" }, t),
  ];
}

export const mothership: Model = {
  parts: [
    // ventre : cône sombre, moyeu, rayon tracteur, nervures lumineuses
    { shape: "cylinder", sides: 24, radius: 2.0, radiusTop: 4.3, height: 0.5, pos: [0, 0.6, 0], color: "dark" },
    { shape: "cylinder", sides: 24, radius: 1.45, radiusTop: 2.0, height: 0.2, pos: [0, 0.25, 0], color: "metal" },
    { shape: "cylinder", sides: 24, radius: 1.15, height: 0.06, pos: [0, 0.13, 0], color: "glow" },
    { shape: "cylinder", sides: 12, radius: 0.55, height: 0.08, pos: [0, 0.1, 0], color: "dark" },
    ...autour(8, 3.15, 0.58, { shape: "box", size: [2.1, 0.05, 0.06], color: "glow" }, 22.5, 12.3),
    // jante : bande métallique, liseré lumineux, baies de hangar, feux ambre
    { shape: "cylinder", sides: 24, radius: 4.42, height: 0.2, pos: [0, 0.95, 0], color: "metal" },
    { shape: "cylinder", sides: 24, radius: 4.46, height: 0.05, pos: [0, 0.9, 0], color: "glow" },
    ...autour(8, 4.42, 0.97, { shape: "box", size: [0.14, 0.24, 0.95], color: "dark" }, 270),
    ...autour(8, 4.47, 0.97, { shape: "box", size: [0.06, 0.15, 0.75], color: "glow" }, 270),
    ...autour(8, 4.3, 1.07, { shape: "box", size: [0.12, 0.07, 0.12], color: "amber" }, 292.5),
    // glacis : coque aux couleurs du joueur, nervures radiales, panneaux alternés
    { shape: "cylinder", sides: 24, radius: 4.38, radiusTop: 3.3, height: 0.32, pos: [0, 1.21, 0], color: "faction" },
    ...autour(16, 3.84, 1.245, { shape: "box", size: [1.2, 0.07, 0.1], color: "metal" }, 0, -16.5),
    ...autour(8, 3.86, 1.232, { shape: "box", size: [0.85, 0.04, 0.95], color: "light" }, 11.25, -16.5),
    ...autour(8, 3.86, 1.232, { shape: "box", size: [0.85, 0.04, 0.95], color: "dark" }, 33.75, -16.5),
    ...autour(8, 4.12, 1.17, { shape: "box", size: [0.12, 0.05, 0.3], color: "glow" }, 33.75, -16.5),
    // pont : disque clair, anneau lumineux, tourelles et antennes
    { shape: "cylinder", sides: 24, radius: 3.3, height: 0.06, pos: [0, 1.4, 0], color: "light" },
    { shape: "cylinder", sides: 24, radius: 2.7, height: 0.04, pos: [0, 1.44, 0], color: "glow" },
    { shape: "cylinder", sides: 24, radius: 2.56, height: 0.06, pos: [0, 1.46, 0], color: "dark" },
    ...tourelle(1, 0),
    ...tourelle(2, 60),
    ...tourelle(3, 120),
    ...tourelle(4, 180),
    ...tourelle(5, 240),
    ...tourelle(6, 300),
    ...antenne(30),
    ...antenne(150),
    ...antenne(210),
    ...antenne(330),
    // gradin intérieur : nervures et hublots
    { shape: "cylinder", sides: 24, radius: 2.4, radiusTop: 1.85, height: 0.4, pos: [0, 1.69, 0], color: "faction" },
    ...autour(12, 2.13, 1.71, { shape: "box", size: [0.68, 0.06, 0.08], color: "metal" }, 15, -36),
    ...autour(12, 2.16, 1.69, { shape: "box", size: [0.2, 0.05, 0.26], color: "amber" }, 0, -36),
    // pont supérieur, anneau lumineux, collerette et coupole vitrée nervurée
    { shape: "cylinder", sides: 24, radius: 1.85, height: 0.06, pos: [0, 1.92, 0], color: "metal" },
    { shape: "cylinder", sides: 24, radius: 1.72, height: 0.05, pos: [0, 1.96, 0], color: "glow" },
    { shape: "cylinder", sides: 24, radius: 1.55, radiusTop: 1.48, height: 0.14, pos: [0, 2.02, 0], color: "dark" },
    { shape: "sphere", radius: 1, detail: 1, pos: [0, 2.05, 0], scale: [1.45, 0.72, 1.45], color: "glass" },
    ...autour(6, 1.26, 2.33, { shape: "box", size: [0.72, 0.06, 0.07], color: "light" }, 0, -51),
    ...autour(6, 0.72, 2.7, { shape: "box", size: [0.68, 0.06, 0.07], color: "light" }, 0, -18),
    // flèche et émetteur tournant
    { shape: "cylinder", sides: 10, radius: 0.28, radiusTop: 0.16, height: 0.22, pos: [0, 2.83, 0], color: "metal" },
    { shape: "cylinder", sides: 10, radius: 0.13, height: 0.1, pos: [0, 2.98, 0], color: "dark", pivot: "emetteur" },
    ...autour(3, 0.4, 2.98, { shape: "box", size: [0.62, 0.04, 0.07], color: "metal", parent: "emetteur" }, 90),
    ...autour(3, 0.74, 2.98, { shape: "sphere", radius: 0.07, color: "glow", parent: "emetteur" }, 90),
    { shape: "cylinder", sides: 4, radius: 0.025, height: 0.55, pos: [0, 3.3, 0], color: "light", parent: "emetteur" },
    { shape: "sphere", radius: 0.07, pos: [0, 3.6, 0], color: "amber", parent: "emetteur" },
  ],
};
