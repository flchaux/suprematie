// Chariot bouclier (t_shield_cart) : petit chenillard qui porte un projecteur de bulle (sim/src/bouclier.rs). Deux
// chenilles courtes, châssis bas, cabine fermée à l'avant gauche, caisson du générateur au milieu, mât émetteur à
// anneaux de cuivre et globe cyan au-dessus, condensateurs couchés à l'arrière.
// Améliorations visibles (pivots « si: ») :
// - émetteur : élargi (mât plus haut, trois anneaux), à grand champ (quatre anneaux, trois ailettes), de couronne
//   (six ailettes, gros globe) ; ou bulle réfléchissante (panneaux miroirs inclinés autour du globe) ;
// - accumulateurs : deux condensateurs de plus, puis une rangée de quatre, puis un râtelier de cellules d'énergie ;
// - régénérateurs : un radiateur à ailettes sur le flanc droit, puis deux et des tuyaux de refroidissement en cuivre.
// Variantes (pièces de récupération, voir variantes.ts) : 1 pare-buffle, bidons, tôle rouillée ; 2 roue de rechange,
// bâche roulée sur la cabine, antenne ; 3 maillons de rechange, portière claire, phare, caisse.
// Repère : +x à droite, +y en haut, +z vers l'avant.
import type { Part, Vec3 } from "../types.ts";
import { q, chenille, coffre } from "./commun.ts";
import { bidon, fouet, maillons, pareBuffle, phare, tole, variante } from "./variantes.ts";

/** Pied du mât émetteur, sur le caisson du générateur. */
const MAT: Vec3 = [0.12, 0.8, -0.12];

/** Pièces d'un pivot fixe. */
const fixe = (pivot: string, parts: Part[]): Part[] => parts.map((p) => ({ ...p, pivot }));

/** Mât émetteur : embase, fût de hauteur `h`, `n` anneaux de cuivre, globe cyan ; `k` : taille. */
function emetteur(h: number, n: number, k: number): Part[] {
  const [x, y, z] = MAT;
  const p: Part[] = [
    { shape: "cylinder", sides: 8, radius: q(0.18 * k), radiusTop: q(0.11 * k), height: 0.1, pos: [x, q(y + 0.05), z], color: "steel" },
    { shape: "cylinder", sides: 8, radius: q(0.055 * k), height: h, pos: [x, q(y + h / 2), z], color: "dark" },
    { shape: "sphere", radius: q(0.16 * k), detail: 1, pos: [x, q(y + h + 0.1 * k), z], color: "glow" },
  ];
  for (let i = 0; i < n; i++) {
    const t = 0.35 + (0.55 * i) / Math.max(1, n - 1);
    p.push({ shape: "torus", radius: q((0.22 - 0.03 * i) * k), tube: q(0.035 * k), sides: 12, pos: [x, q(y + h * t), z], color: "copper" });
  }
  return p;
}

/** Ailettes de champ autour du globe : `n` lames d'acier relevées, à `r` du mât, à la hauteur `y`. */
function ailettes(n: number, r: number, y: number, l: number): Part[] {
  const [x, , z] = MAT;
  return Array.from({ length: n }, (_, i): Part => {
    const a = (i * 360) / n;
    const rad = (a * Math.PI) / 180;
    return { shape: "box", size: [0.03, l, 0.12], pos: [q(x + Math.sin(rad) * r), y, q(z + Math.cos(rad) * r)], rot: [0, a, -25], color: "steel" };
  });
}

/** Condensateur couché le long de x : corps, bagues, borne. */
function condensateur(pos: Vec3, l: number, color: Part["color"] = "steel"): Part[] {
  const [x, y, z] = pos;
  return [
    { shape: "cylinder", sides: 10, radius: 0.09, height: l, pos, rot: [0, 0, 90], color },
    ...[-0.35, 0.35].map((t): Part => ({ shape: "cylinder", sides: 10, radius: 0.1, height: 0.03, pos: [q(x + t * l), y, z], rot: [0, 0, 90], color: "dark", fine: true })),
    { shape: "cylinder", sides: 6, radius: 0.025, height: 0.06, pos: [x, q(y + 0.11), z], color: "copper", fine: true },
  ];
}

/** Radiateur à ailettes sur le flanc droit, centré en z. */
function radiateur(z: number): Part[] {
  return [
    { shape: "box", size: [0.06, 0.24, 0.42], pos: [0.5, 0.62, z], color: "dark" },
    ...[-0.15, -0.075, 0, 0.075, 0.15].map((dz): Part => ({ shape: "box", size: [0.1, 0.26, 0.02], pos: [0.55, 0.62, q(z + dz)], color: "steel", fine: true })),
  ];
}

export function chariotBouclier(): Part[] {
  return [
    ...chenille(0.5, 1.6, 0.34, 0.24, 0, 0, 0.3, true),
    // châssis, plancher, bandes d'équipe
    { shape: "bevel", size: [0.76, 0.18, 1.5], pos: [0, 0.34, 0], bevel: 0.03, color: "dark" },
    { shape: "box", size: [1.04, 0.04, 1.4], pos: [0, 0.45, -0.02], color: "metal" },
    { shape: "box", size: [0.025, 0.14, 1.0], pos: [0.63, 0.28, 0], color: "faction", mirror: true },
    { shape: "box", size: [0.26, 0.035, 0.18], pos: [0.5, 0.37, 0.72], color: "rust", mirror: true },
    // cabine fermée à l'avant gauche : caisse, fente vitrée, toit d'équipe
    { shape: "bevel", size: [0.4, 0.32, 0.36], pos: [-0.27, 0.63, 0.5], bevel: 0.03, color: "metal" },
    { shape: "box", size: [0.32, 0.07, 0.02], pos: [-0.27, 0.7, 0.685], color: "glass" },
    { shape: "box", size: [0.42, 0.03, 0.38], pos: [-0.27, 0.805, 0.5], color: "faction" },
    { shape: "box", size: [0.09, 0.05, 0.03], pos: [0.3, 0.42, 0.76], color: "amber", mirror: true },
    // caisson du générateur : grilles, bande de danger, câbles vers le mât
    { shape: "bevel", size: [0.66, 0.32, 0.62], pos: [0.12, 0.63, -0.12], bevel: 0.04, color: "rust" },
    ...[-0.32, 0.56].map((x): Part => ({ shape: "box", size: [0.02, 0.18, 0.4], pos: [x, 0.63, -0.12], color: "black", fine: true })),
    { shape: "box", size: [0.68, 0.04, 0.05], pos: [0.12, 0.5, 0.2], color: "hazard", fine: true },
    { shape: "tube", radius: 0.02, sides: 5, path: [[-0.12, 0.79, 0.05], [-0.05, 0.86, -0.02], [0.06, 0.86, -0.08]], color: "copper", fine: true },
    // condensateurs d'origine, couchés à l'arrière
    ...condensateur([0, 0.58, -0.56], 0.8),
    // émetteur d'origine (remplacé par un émetteur amélioré ou par la bulle réfléchissante)
    ...fixe("sauf:sc_wide1+sc_wide2+sc_wide3+sc_mirror#fixe_emetteur", emetteur(0.55, 2, 1)),
    ...fixe("si:sc_wide1#fixe_em1", emetteur(0.75, 3, 1.1)),
    ...fixe("si:sc_wide2#fixe_em2", [...emetteur(0.85, 4, 1.2), ...ailettes(3, 0.3, 1.55, 0.36)]),
    ...fixe("si:sc_wide3#fixe_em3", [
      ...emetteur(0.95, 4, 1.35),
      ...ailettes(6, 0.36, 1.66, 0.46),
      { shape: "torus", radius: 0.42, tube: 0.03, sides: 16, pos: [MAT[0], 1.5, MAT[2]], color: "copper" },
    ]),
    // bulle réfléchissante : mât court, globe entouré de panneaux miroirs inclinés
    ...fixe("si:sc_mirror#fixe_miroir", [
      ...emetteur(0.6, 2, 1.1),
      ...Array.from({ length: 6 }, (_, i): Part => {
        const a = i * 60;
        const rad = (a * Math.PI) / 180;
        return { shape: "box", size: [0.2, 0.26, 0.02], pos: [q(MAT[0] + Math.sin(rad) * 0.3), 1.5, q(MAT[2] + Math.cos(rad) * 0.3)], rot: [-30, a, 0], color: "glass" };
      }),
      { shape: "torus", radius: 0.3, tube: 0.02, sides: 12, pos: [MAT[0], 1.38, MAT[2]], color: "steel", fine: true },
    ]),
    // accumulateurs
    ...fixe("si:sc_cells1#fixe_acc1", [...condensateur([-0.22, 0.8, -0.56], 0.36), ...condensateur([0.22, 0.8, -0.56], 0.36)]),
    ...fixe("si:sc_cells2#fixe_acc2", [
      ...condensateur([0, 0.58, -0.36], 0.8, "copper"),
      ...condensateur([-0.22, 0.8, -0.56], 0.36),
      ...condensateur([0.22, 0.8, -0.56], 0.36),
      { shape: "box", size: [0.7, 0.03, 0.05], pos: [0, 0.92, -0.56], color: "copper", fine: true },
    ]),
    ...fixe("si:sc_cells3#fixe_acc3", [
      { shape: "box", size: [0.84, 0.05, 0.36], pos: [0, 0.7, -0.6], color: "steel" },
      ...[-0.3, -0.1, 0.1, 0.3].flatMap((x): Part[] => [
        { shape: "box", size: [0.14, 0.28, 0.14], pos: [x, 0.87, -0.6], color: "dark" },
        { shape: "box", size: [0.1, 0.04, 0.1], pos: [x, 1.02, -0.6], color: "glow" },
      ]),
    ]),
    // régénérateurs
    ...fixe("si:sc_regen1#fixe_reg1", radiateur(-0.12)),
    ...fixe("si:sc_regen2#fixe_reg2", [
      ...radiateur(0.1),
      ...radiateur(-0.36),
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.5, 0.78, 0.1], [0.42, 0.86, -0.12], [0.5, 0.78, -0.36]], bend: 0.05, color: "copper" },
      { shape: "tube", radius: 0.025, sides: 5, path: [[0.46, 0.5, 0.3], [0.46, 0.5, -0.56]], color: "copper" },
    ]),
    // variantes : pièces dépareillées
    ...variante(1, [
      ...pareBuffle(0.5, 0.22, 0.6, 0.86, 0.03),
      ...bidon([-0.36, 0.56, -0.86], 1.1),
      ...bidon([-0.22, 0.56, -0.86], 1.1, "rust"),
      ...tole([0.47, 0.62, -0.12], [0.03, 0.26, 0.5], "rust", [0, 0, 4]),
    ]),
    ...variante(2, [
      { use: "roue_d", pos: [-0.6, 0.62, -0.2], rot: [0, 0, 90], scale: [0.12, 0.34, 0.34] },
      { shape: "cylinder", sides: 8, radius: 0.06, height: 0.4, pos: [-0.27, 0.87, 0.48], rot: [0, 0, 90], color: "dry" },
      ...fouet([-0.42, 0.82, 0.36], 0.8),
    ]),
    ...variante(3, [
      ...maillons([0, 0.42, 0.79], 0.5, 0.22, [90, 0, 0]),
      ...tole([-0.475, 0.62, 0.5], [0.03, 0.24, 0.28], "light"),
      ...phare([-0.18, 0.86, 0.6], 1.1),
      ...coffre([0.32, 0.56, 0.42], [0.26, 0.18, 0.22], "wood"),
    ]),
  ];
}
