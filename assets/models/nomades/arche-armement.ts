// Armement de l'Arche : gaillard d'avant, un tronçon sur son propre train de chenilles qui porte l'arme en grand
// (pont de z = 2,42 à z = 3,66, y = 0,97). Le canon d'origine disparaît (CANON), sauf avec la batterie antiaérienne.
import type { Part, Vec3 } from "../types.ts";
import { q, incl, fut, coffre } from "./commun.ts";
import { ARMES, caisse, groupe, train } from "./arche-commun.ts";

/** Axe de la tourelle du gaillard. */
const Z = 3.02;

/** Caisse commune du gaillard : tronçon, plage avant, phares et crochets. */
function gaillard(): Part[] {
  return [
    ...train(ARMES, "gaillard", 1.24, 3.0),
    ...groupe(`si:${ARMES}#fixe_gaillard`, [
      ...caisse(1, 2.2, 3.66),
      { shape: "box", size: [1.9, 0.07, 0.07], pos: [0, 0.99, 3.64], color: "hazard" },
      { shape: "box", size: [0.16, 0.08, 0.04], pos: [0.56, 0.76, 3.72], color: "amber", mirror: true },
      { shape: "box", size: [0.1, 0.34, 0.06], pos: [0.28, 0.6, 3.72], color: "rust", mirror: true, fine: true },
    ]),
  ];
}

/** Couronne et sellette d'une pièce du gaillard, au ras du pont. */
function couronne(r: number): Part[] {
  return [
    { shape: "cylinder", sides: 12, radius: r, height: 0.14, pos: [0, 1.04, Z], color: "steel" },
    { shape: "cylinder", sides: 8, radius: q(r * 0.86), height: 0.12, pos: [0, 1.16, Z], color: "dark" },
  ];
}

/** Canon lourd : flasques d'affût massives, long fût à frein de bouche, râteliers d'obus, béquilles de proue. */
function siege(): Part[] {
  const fixe: Part[] = [];
  for (let k = 0; k < 3; k++) {
    const z = q(2.7 + k * 0.28);
    fixe.push(
      { shape: "cylinder", sides: 5, radius: 0.125, height: 0.3, pos: [0.82, 1.09, z], rot: [0, 0, 90], color: "copper", mirror: true },
      { shape: "cone", sides: 5, radius: 0.125, height: 0.24, pos: [1.09, 1.09, z], rot: [0, 0, -90], color: "red", mirror: true },
    );
  }
  fixe.push(
    { shape: "box", size: [0.06, 0.2, 1.06], pos: [1.12, 1.0, 3.04], color: "dark", mirror: true },
    // béquilles de recul relevées aux coins de la plage avant
    { shape: "box", size: [0.2, 0.56, 0.16], pos: [0.94, 1.2, 3.56], rot: [-24, 0, 0], color: "hazard", mirror: true },
    { shape: "box", size: [0.4, 0.08, 0.3], pos: [0.94, 1.46, 3.44], rot: [-24, 0, 0], color: "dark", mirror: true },
  );
  return [
    ...groupe("si:ark_w_siege#fixe_siege", fixe),
    ...groupe("si:ark_w_siege#tourelle", [
      ...couronne(0.62),
      { shape: "box", size: [1.12, 0.12, 1.2], pos: [0, 1.26, q(Z - 0.06)], color: "metal" },
      { shape: "extrude", profile: [[-0.62, 0], [0.5, 0], [0.34, 0.6], [-0.04, 0.72], [-0.62, 0.34]], depth: 0.2, bevel: 0.04, pos: [0.44, 1.3, Z], rot: [0, -90, 0], color: "metal", mirror: true },
      { shape: "box", size: [0.22, 0.05, 0.62], pos: [0.44, 1.85, q(Z - 0.33)], rot: [-33, 0, 0], color: "faction", mirror: true },
      { shape: "bevel", size: [0.62, 0.52, 0.72], pos: [0, 1.62, q(Z - 0.34)], bevel: 0.06, color: "dark" },
      { shape: "box", size: [0.5, 0.04, 0.52], pos: [0, 1.89, q(Z - 0.34)], color: "faction" },
      incl([0, 1.68, q(Z - 0.14)], 10, 0, 0, { shape: "lathe", sides: 10, rot: [90, 0, 0], color: "steel", profile: fut(0.18, 2.6) }),
      incl([0, 1.68, q(Z - 0.14)], 10, 2.44, 0, { shape: "bevel", size: [0.62, 0.42, 0.32], bevel: 0.06, color: "dark" }),
      incl([0, 1.68, q(Z - 0.14)], 10, 1.95, 0, { shape: "cylinder", sides: 8, radius: 0.23, height: 0.14, rot: [90, 0, 0], color: "hazard" }),
      incl([0.2, 1.68, q(Z - 0.14)], 10, 0.65, 0.24, { shape: "cylinder", sides: 8, radius: 0.075, height: 1.1, rot: [90, 0, 0], color: "rust", mirror: true }),
      // bouclier fendu, chargeur
      { shape: "box", size: [0.5, 0.78, 0.14], pos: [0.5, 1.58, q(Z + 0.52)], rot: [-34, 0, 0], color: "dry", mirror: true },
      { shape: "box", size: [0.5, 0.16, 0.16], pos: [0.5, 1.8, q(Z + 0.38)], rot: [-34, 0, 0], color: "faction", mirror: true },
      ...coffre([0, 1.36, q(Z - 0.86)], [0.7, 0.28, 0.36], "wood"),
    ]),
  ];
}

/** Lance-flammes : trois grands réservoirs rouges en U, tourelle haute à deux buses, plage noircie. */
function flammes(): Part[] {
  const reservoir: [number, number][] = [[0, -0.56], [0.18, -0.54], [0.29, -0.42], [0.29, 0.42], [0.18, 0.54], [0, 0.56]];
  return [
    ...groupe("si:ark_w_flame#fixe_flammes", [
      { shape: "lathe", sides: 10, profile: reservoir, pos: [0.8, 1.3, 3.04], rot: [90, 0, 0], color: "red", mirror: true },
      ...[-0.3, 0.3].map((d): Part => ({ shape: "cylinder", sides: 8, radius: 0.31, height: 0.07, pos: [0.8, 1.3, q(3.04 + d)], rot: [90, 0, 0], color: "black", mirror: true })),
      { shape: "box", size: [0.46, 0.14, 0.9], pos: [0.8, 1.02, 3.04], color: "dark", mirror: true },
      { shape: "lathe", sides: 8, profile: reservoir.map(([r, y]): [number, number] => [q(r * 0.72), q(y * 0.8)]), pos: [0, 1.2, 2.6], rot: [0, 0, 90], color: "red" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.08, pos: [0, 1.2, 2.6], rot: [0, 0, 90], color: "hazard" },
      { shape: "tube", radius: 0.05, sides: 5, path: [[0.8, 1.3, 3.6], [0.72, 1.28, 3.7], [0.24, 1.12, 3.5]], bend: 0, color: "copper", mirror: true },
      { shape: "tube", radius: 0.045, sides: 5, path: [[0.8, 1.56, 2.86], [0.36, 1.34, 2.62]], color: "copper", mirror: true, fine: true },
      { shape: "box", size: [1.0, 0.02, 0.5], pos: [0, 0.98, 3.4], color: "black" },
      { shape: "cylinder", sides: 10, radius: 0.36, height: 0.36, pos: [0, 1.14, 3.2], color: "dark" },
    ]),
    ...groupe("si:ark_w_flame#tourelle", [
      { shape: "cylinder", sides: 12, radius: 0.42, height: 0.12, pos: [0, 1.36, 3.2], color: "steel" },
      { shape: "bevel", size: [0.62, 0.4, 0.72], pos: [0, 1.64, 3.16], bevel: 0.06, color: "metal" },
      { shape: "box", size: [0.4, 0.03, 0.5], pos: [0, 1.85, 3.12], color: "faction" },
      { shape: "box", size: [0.8, 0.5, 0.06], pos: [0, 1.66, 3.54], rot: [-14, 0, 0], color: "dry" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.8, pos: [0.18, 1.62, 3.82], rot: [90, 0, 0], color: "steel", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.13, radiusTop: 0.2, height: 0.3, pos: [0.18, 1.62, 4.3], rot: [90, 0, 0], color: "black", mirror: true },
      { shape: "sphere", radius: 0.09, pos: [0.18, 1.62, 4.42], color: "amber", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.5, pos: [0.42, 1.6, 3.1], rot: [90, 0, 0], color: "red", mirror: true },
    ]),
  ];
}

/** Batterie de roquettes : deux casemates de sable relevées, douze gros tubes à tête rouge. */
function roquettes(): Part[] {
  const p: Part[] = [
    ...couronne(0.58),
    { shape: "bevel", size: [0.3, 0.5, 0.8], pos: [0, 1.4, q(Z - 0.04)], bevel: 0.05, color: "metal" },
    { shape: "box", size: [0.12, 0.1, 0.06], pos: [0, 1.6, q(Z + 0.38)], color: "amber" },
    { shape: "cylinder", sides: 6, radius: 0.09, height: 1.5, pos: [0, 1.5, q(Z - 0.1)], rot: [0, 0, 90], color: "steel" },
  ];
  const base: Vec3 = [0.54, 1.66, q(Z - 0.04)];
  const E = 36;
  p.push(
    incl(base, E, 0, 0, { shape: "bevel", size: [0.84, 0.62, 1.04], bevel: 0.05, color: "dry", mirror: true }),
    incl(base, E, 0.46, 0, { shape: "box", size: [0.88, 0.66, 0.08], color: "hazard", mirror: true }),
    incl(base, E, 0.5, 0, { shape: "box", size: [0.8, 0.58, 0.04], color: "black", mirror: true }),
    incl(base, E, -0.06, 0.315, { shape: "box", size: [0.86, 0.03, 0.2], color: "faction", mirror: true }),
    incl(base, E, -0.36, 0.315, { shape: "box", size: [0.5, 0.03, 0.18], color: "rust", mirror: true }),
    incl(base, E, -0.54, 0, { shape: "box", size: [0.7, 0.46, 0.06], color: "black", mirror: true }),
  );
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++) {
      const b: Vec3 = [q(base[0] - 0.26 + i * 0.26), base[1], base[2]];
      const h = q(-0.14 + j * 0.28);
      p.push(incl(b, E, 0.6, h, { shape: "cone", sides: 6, radius: 0.105, height: 0.22, rot: [90, 0, 0], color: "red", mirror: true }));
    }
  return [
    ...groupe("si:ark_w_rockets#fixe_rampes", [
      // déflecteur de souffle, caisses de roquettes
      { shape: "box", size: [1.9, 0.42, 0.06], pos: [0, 1.14, 2.5], rot: [-24, 0, 0], color: "black" },
      ...coffre([0.84, 1.07, 3.44], [0.34, 0.2, 0.4], "wood"),
      ...coffre([-0.84, 1.07, 3.44], [0.34, 0.2, 0.4], "wood"),
    ]),
    ...groupe("si:ark_w_rockets#tourelle", p),
  ];
}

/** Canon à rail : deux rails de près de trois unités, fil lumineux, bobines de cuivre, bancs de condensateurs. */
function rail(): Part[] {
  const bancs: Part[] = [{ shape: "box", size: [0.42, 0.12, 1.1], pos: [0.82, 1.03, 3.02], color: "dark", mirror: true }];
  for (const z of [2.66, 3.02, 3.38]) {
    bancs.push(
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.46, pos: [0.82, 1.3, z], color: "copper", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.11, height: 0.05, pos: [0.82, 1.55, z], color: "glow", mirror: true },
    );
  }
  bancs.push({ shape: "tube", radius: 0.04, sides: 5, path: [[0.66, 1.1, 2.66], [0.34, 1.06, 2.78]], color: "black", mirror: true, fine: true });
  const fin = q(Z + 2.5);
  return [
    ...groupe("si:ark_w_rail#fixe_bancs", bancs),
    ...groupe("si:ark_w_rail#tourelle", [
      ...couronne(0.52),
      { shape: "bevel", size: [0.86, 0.5, 1.1], pos: [0, 1.43, q(Z - 0.08)], bevel: 0.06, color: "dark" },
      { shape: "bevel", size: [0.78, 0.5, 0.5], pos: [0, 1.8, q(Z - 0.46)], bevel: 0.06, color: "metal" },
      { shape: "box", size: [0.6, 0.03, 0.36], pos: [0, 2.06, q(Z - 0.46)], color: "faction" },
      { shape: "box", size: [0.1, 0.26, 2.7], pos: [0.18, 1.82, q(fin - 1.35)], color: "steel", mirror: true },
      { shape: "box", size: [0.16, 0.1, 2.6], pos: [0, 1.86, q(fin - 1.35)], color: "glow" },
      ...[0.34, 0.8, 1.26, 1.72, 2.18].map((d, k): Part => ({ shape: "box", size: [q(0.66 - k * 0.04), q(0.44 - k * 0.02), 0.16], pos: [0, 1.8, q(Z - 0.1 + d)], color: "copper" })),
      { shape: "box", size: [0.12, 0.34, 0.2], pos: [0.19, 1.82, q(fin - 0.06)], color: "faction", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.6, pos: [0.5, 1.52, q(Z - 0.1)], rot: [90, 0, 0], color: "copper", mirror: true },
      { shape: "box", size: [0.05, 0.14, 0.36], pos: [0.4, 1.84, q(Z - 0.46)], color: "glow", mirror: true },
    ]),
  ];
}

/** Batterie antiaérienne : deux nacelles quadritubes de part et d'autre du canon ; à la poupe, veille radar et munitions. */
function flak(): Part[] {
  const nacelle = (s: 1 | -1): Part[] => {
    const x = q(s * 0.66);
    const z = 3.16;
    const p: Part[] = [
      { shape: "cylinder", sides: 10, radius: 0.36, height: 0.12, pos: [x, 1.2, z], color: "steel" },
      { shape: "bevel", size: [0.4, 0.44, 0.7], pos: [x, 1.46, q(z - 0.06)], bevel: 0.07, color: "metal" },
      { shape: "box", size: [0.3, 0.03, 0.5], pos: [x, 1.69, q(z - 0.08)], color: "faction" },
      { shape: "box", size: [0.1, 0.1, 0.06], pos: [x, 1.56, q(z + 0.3)], color: "amber" },
      incl([q(x + 0.28), 1.52, z], 30, 0, 0.07, { shape: "box", size: [0.2, 0.34, 0.56], color: "rust" }),
      incl([q(x - 0.28), 1.52, z], 30, 0, 0.07, { shape: "box", size: [0.2, 0.34, 0.56], color: "rust" }),
    ];
    for (const dx of [-0.28, 0.28])
      for (const h of [0, 0.15]) {
        p.push(incl([q(x + dx), 1.52, z], 30, 0.8, h, { shape: "cylinder", sides: 6, radius: 0.06, height: 1.2, rot: [90, 0, 0], color: "steel" }));
        if (h) p.push(incl([q(x + dx), 1.52, z], 30, 1.4, 0.075, { shape: "box", size: [0.18, 0.32, 0.16], color: "dark" }));
      }
    return groupe(`si:ark_w_flak#tourelle_aa_${s > 0 ? "d" : "g"}`, p);
  };
  return [
    ...groupe("si:ark_w_flak#fixe_flak", [
      { shape: "cylinder", sides: 10, radius: 0.42, height: 0.2, pos: [0.66, 1.06, 3.16], color: "dark", mirror: true },
      { shape: "box", size: [0.96, 0.05, 0.96], pos: [0.62, 0.985, 3.16], color: "dark", mirror: true },
      { shape: "box", size: [0.3, 0.2, 0.5], pos: [0, 1.07, 3.2], color: "rust" },
      ...coffre([0.84, 1.07, 2.62], [0.36, 0.2, 0.3], "wood"),
      ...coffre([-0.84, 1.07, 2.62], [0.36, 0.2, 0.3], "red"),
      // parc à munitions à la place de la tourelle arrière d'origine
      { shape: "cylinder", sides: 10, radius: 0.36, height: 0.1, pos: [0, 1.02, -2.02], color: "steel" },
      ...coffre([0.36, 1.1, -2.04], [0.3, 0.24, 0.42], "wood"),
      ...coffre([-0.36, 1.1, -2.04], [0.3, 0.24, 0.42], "red"),
      { shape: "cylinder", sides: 8, radius: 0.12, radiusTop: 0.08, height: 0.66, pos: [0, 1.4, -2.02], color: "dark" },
    ]),
    ...nacelle(1),
    ...nacelle(-1),
    ...groupe("si:ark_w_flak#radar_flak", [
      { shape: "cylinder", sides: 8, radius: 0.12, height: 0.14, pos: [0, 1.78, -2.02], color: "steel" },
      { shape: "box", size: [1.0, 0.42, 0.06], pos: [0, 2.02, -2.0], rot: [-24, 0, 0], color: "light" },
      { shape: "box", size: [1.02, 0.07, 0.09], pos: [0, 2.2, -2.08], rot: [-24, 0, 0], color: "faction" },
      { shape: "box", size: [0.06, 0.06, 0.4], pos: [0, 1.94, -1.78], color: "steel", fine: true },
    ]),
  ];
}

export function armement(): Part[] {
  return [...gaillard(), ...siege(), ...flammes(), ...roquettes(), ...rail(), ...flak()];
}
