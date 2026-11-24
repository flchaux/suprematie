// Annexes du générateur, de la soute, du laboratoire, de l'atelier et du bastion (voir annexes.ts).
import type { Part, Vec3 } from "../types.ts";
import { q, incl, coffre, decal, decalCoude } from "./commun.ts";
import type { C } from "./commun.ts";
import { annexe, fines, verinsRapides } from "./annexes.ts";
import { LEVE, TY } from "./bastion.ts";

// ——— Générateur ———

/**
 * Générateur : seconde turbine couchée sur le flanc droit, à haute cheminée d'échappement (« gen_big »), ou turbine
 * carénée à plat et régulateur à boules (« gen_lean »), qui tournent au travail ; deux grands réservoirs debout sur le
 * flanc gauche (« gen_tank ») ou tourets de câble et poteaux rangés (« gen_poles »).
 */
export function annexesGenerateur(chariot: boolean): Part[] {
  const big = annexe(chariot, "gen_big");
  const X = 1.0;
  const Y = 0.99;
  const sort = "t:-0.14,0,0:0.5:0.65";
  const long = (z0: number, profile: [number, number][], color: C, sides = 10): Part => ({ shape: "lathe", sides, pos: [X, Y, z0], rot: [90, 0, 0], color, profile });
  const out: Part[] = [
    ...big.mobile("turbine2", sort, [
      ...[0.32, -0.32].map((z): Part => ({ shape: "box", size: [0.4, 0.14, 0.12], pos: [0.88, 0.69, z], color: "rust" })),
      long(-0.6, [[0, 0], [0.16, 0], [0.18, 0.2], [0.27, 0.38], [0.27, 0.98], [0.24, 1.14]], "steel"),
      { shape: "torus", radius: 0.235, tube: 0.05, sides: 10, pos: [X, Y, 0.54], rot: [90, 0, 0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.04, pos: [X, Y, 0.5], rot: [90, 0, 0], color: "black" },
      { shape: "cone", sides: 6, radius: 0.1, height: 0.18, pos: [X, Y, 0.58], rot: [90, 0, 0], color: "steel" },
      { shape: "cylinder", sides: 10, radius: 0.285, height: 0.18, pos: [X, Y, 0.16], rot: [90, 0, 0], color: "copper" },
      // coude d'échappement
      { shape: "tube", radius: 0.13, sides: 6, path: [[X, Y, -0.55], [X, Y, -0.8], [X, 1.34, -0.8]], bend: 0.14, color: "dark" },
    ]),
    ...big.mobile("cheminee2", `r:x,90:0.65:0.82|${sort}`, [
      { shape: "lathe", sides: 7, pos: [X, 1.34, -0.8], color: "rust", profile: [[0.12, 0], [0.12, 0.62], [0.16, 0.7], [0, 0.7]] },
      { shape: "cylinder", sides: 7, radius: 0.145, height: 0.1, pos: [X, 1.7, -0.8], color: "hazard", fine: true },
    ], [X, 1.34, -0.8]),
  ];
  if (!chariot) out.push(...big.fixe([{ shape: "tube", radius: 0.035, sides: 3, path: [[X, 1.24, -0.12], [0.75, 1.36, -0.06], [0.3, 1.0, -0.06]], bend: 0.1, color: "black", fine: true }]));

  // turbine carénée : couronne, pales et régulateur (ils tournent), armoire de régulation
  const lean = annexe(chariot, "gen_lean");
  const G: Vec3 = [1.0, 0.94, -0.02];
  out.push(
    ...lean.fixe([
      { shape: "box", size: [0.3, 0.08, 0.34], pos: [0.78, 0.63, 0.6], color: "rust" },
      { shape: "bevel", size: [0.3, 0.46, 0.36], pos: [0.86, 0.9, 0.62], bevel: 0.04, color: "steel" },
      { shape: "box", size: [0.31, 0.08, 0.37], pos: [0.86, 1.02, 0.62], color: "faction" },
      { shape: "sphere", radius: 0.07, pos: [0.86, 1.19, 0.62], color: "acid" },
    ]),
    ...lean.mobile("carene", sort, [
      { shape: "box", size: [0.44, 0.1, 0.14], pos: [0.84, 0.73, G[2]], color: "rust" },
      { shape: "lathe", sides: 12, pos: G, color: "light", profile: [[0.25, -0.16], [0.3, -0.16], [0.33, 0], [0.3, 0.18], [0.25, 0.18], [0.25, -0.16]] },
      { shape: "torus", radius: 0.29, tube: 0.04, sides: 12, pos: [G[0], q(G[1] + 0.18), G[2]], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.26, height: 0.03, pos: [G[0], q(G[1] - 0.12), G[2]], color: "black", fine: true },
    ]),
    ...lean.tourne("rotor_carene", `${sort}|t:0,-0.36,0:0.7:0.85`, [
      ...[0, 60, 120].map((d): Part => ({ shape: "box", size: [0.48, 0.04, 0.1], pos: [G[0], q(G[1] + 0.12), G[2]], rot: [0, d, 0], color: "copper" })),
      { shape: "cylinder", sides: 6, radius: 0.04, height: 0.5, pos: [G[0], q(G[1] + 0.36), G[2]], color: "steel" },
      { shape: "box", size: [0.42, 0.04, 0.05], pos: [G[0], q(G[1] + 0.56), G[2]], color: "dark" },
      ...[0.2, -0.2].map((d): Part => ({ shape: "sphere", radius: 0.085, pos: [q(G[0] + d), q(G[1] + 0.48), G[2]], color: "copper" })),
    ], G),
  );

  // grands réservoirs : deux cuves debout, calottes d'acier, bandes d'équipe, tuyau de liaison
  const tank = annexe(chariot, "gen_tank");
  const rx = -0.94;
  out.push(
    ...tank.fixe([
      { shape: "box", size: [0.52, 0.08, 1.12], pos: [-0.92, 0.6, 0.0], color: "rust" },
      ...[-0.28, 0.28].flatMap((z): Part[] => [
        { shape: "lathe", sides: 12, pos: [rx, 0.62, z], color: "dry", profile: [[0.25, 0.02], [0.25, 0.92], [0.15, 1.05], [0, 1.08]] },
        { shape: "cylinder", sides: 10, radius: 0.265, height: 0.14, pos: [rx, 1.28, z], color: "faction" },
        { shape: "cylinder", sides: 10, radius: 0.265, height: 0.05, pos: [rx, 0.86, z], color: "dark", fine: true },
        { shape: "cylinder", sides: 6, radius: 0.07, height: 0.1, pos: [rx, 1.73, z], color: "red" },
      ]),
      { shape: "tube", radius: 0.04, sides: 4, path: [[rx, 1.76, -0.28], [rx, 1.86, -0.28], [rx, 1.86, 0.28], [rx, 1.76, 0.28]], bend: 0.08, color: "copper" },
      { shape: "box", size: [0.06, 1.0, 0.06], pos: [-0.72, 1.1, 0.0], color: "steel", fine: true },
    ]),
  );

  // câbles longs : deux gros tourets sur berceau, faisceau de poteaux au-dessus
  const poles = annexe(chariot, "gen_poles");
  out.push(
    ...poles.fixe([
      { shape: "box", size: [0.56, 0.08, 1.2], pos: [-0.9, 0.6, 0.0], color: "rust" },
      ...[-0.29, 0.29].flatMap((z): Part[] => [
        { shape: "cylinder", sides: 8, radius: 0.19, height: 0.26, pos: [-0.99, 0.9, z], rot: [0, 0, 90], color: z < 0 ? "black" : "copper" },
        ...[-0.84, -1.14].map((x): Part => ({ shape: "cylinder", sides: 8, radius: 0.27, height: 0.05, pos: [x, 0.9, z], rot: [0, 0, 90], color: "wood" })),
      ]),
      // râtelier des poteaux, du côté du châssis
      ...[-0.56, 0.56].flatMap((z): Part[] => [
        { shape: "box", size: [0.06, 0.86, 0.07], pos: [-0.78, 1.0, z], color: "hazard" },
        { shape: "box", size: [0.3, 0.06, 0.08], pos: [-0.68, 1.12, z], color: "dark", fine: true },
      ]),
      ...[[-0.71, 1.2], [-0.6, 1.2], [-0.71, 1.31], [-0.6, 1.31], [-0.655, 1.41]].map(([x, y], k): Part => ({ shape: "cylinder", sides: 5, radius: 0.055, height: 1.7, pos: [x, y, -0.1], rot: [90, 0, 0], color: k % 2 ? "rust" : "wood" })),
      ...[[-0.71, 1.31], [-0.6, 1.31]].map(([x, y]): Part => ({ shape: "box", size: [0.12, 0.12, 0.1], pos: [x, y, 0.78], color: "light", fine: true })),
      { shape: "box", size: [0.28, 0.36, 0.06], pos: [-0.655, 1.3, 0.1], color: "faction" },
    ]),
  );
  return out;
}

// ——— Soute ———

/**
 * Soute : hausses de conteneur télescopiques des deux côtés et conteneur gerbé à gauche (« hold_big »), ou plaques sur
 * les conteneurs et parapets évasés (« hold_armor ») ; potence à palan tournée vers le quai droit (« hold_crane »),
 * repliée au-dessus du chargement sur le chenillard, ou vérins (« hold_quick »).
 */
export function annexesSoute(chariot: boolean): Part[] {
  const big = annexe(chariot, "hold_big");
  const hausse = (x: number, y: number, z: number, w: number, h: number, l: number, color: C): Part[] => [
    { shape: "box", size: [w, h, l], pos: [x, y, z], color },
    ...[-0.36, 0, 0.36].map((k): Part => ({ shape: "box", size: [q(w + 0.03), q(h - 0.06), 0.05], pos: [x, y, q(z + k * l)], color: "dark" })),
    { shape: "box", size: [q(w + 0.02), 0.06, q(l + 0.02)], pos: [x, q(y + h / 2), z], color: "steel" },
  ];
  const out: Part[] = [
    ...big.fixe([
      // conteneur gerbé sur l'avant du premier
      { shape: "box", size: [0.54, 0.38, 0.72], pos: [-0.33, 1.325, 0.09], color: "faction" },
      ...[-0.16, 0.09, 0.34].map((z): Part => ({ shape: "box", size: [0.56, 0.32, 0.03], pos: [-0.33, 1.325, z], color: "dark", fine: true })),
      { shape: "box", size: [0.46, 0.32, 0.02], pos: [-0.33, 1.325, 0.455], color: "dark" },
    ]),
    ...big.mobile("hausse_g", "t:0,-0.37,0:0.64:0.8", [
      ...hausse(-0.33, 1.71, -0.72, 0.6, 0.38, 0.86, "rust"),
      { shape: "box", size: [0.5, 0.3, 0.02], pos: [-0.33, 1.7, -0.285], color: "hazard" },
    ]),
    ...big.mobile("hausse_d", "t:0,-0.4,0:0.64:0.8", [
      ...hausse(0.34, 1.28, -0.3, 0.63, 0.42, 0.96, "metal"),
      { shape: "box", size: [0.5, 0.3, 0.02], pos: [0.34, 1.27, 0.185], color: "faction" },
    ]),
  ];

  // soute blindée : plaques de flanc et de toit, parapets évasés, plaque de proue
  const armor = annexe(chariot, "hold_armor");
  out.push(
    ...armor.fixe([
      ...[-0.68, 0.12].map((z): Part => ({ shape: "box", size: [0.05, 0.5, 0.74], pos: [-0.645, 0.87, z], color: "metal" })),
      { shape: "box", size: [0.05, 0.46, 0.94], pos: [0.655, 0.84, -0.3], color: "metal" },
      // parapets évasés
      { shape: "box", size: [0.07, 0.36, 1.48], pos: [-0.7, 1.26, -0.26], rot: [0, 0, 22], color: "rust" },
      { shape: "box", size: [0.08, 0.07, 1.5], pos: [-0.77, 1.43, -0.26], rot: [0, 0, 22], color: "hazard" },
      { shape: "box", size: [0.07, 0.34, 0.98], pos: [0.72, 1.2, -0.3], rot: [0, 0, -22], color: "rust" },
      { shape: "box", size: [0.08, 0.07, 1.0], pos: [0.78, 1.36, -0.3], rot: [0, 0, -22], color: "hazard" },
      // toits de plaques
      { shape: "bevel", size: [0.64, 0.12, 0.82], pos: [-0.33, 1.58, -0.76], bevel: 0.04, color: "metal" },
      { shape: "box", size: [0.3, 0.06, 0.5], pos: [-0.33, 1.66, -0.76], color: "faction" },
      { shape: "box", size: [0.58, 0.08, 0.74], pos: [-0.33, 1.17, 0.1], color: "metal" },
      { shape: "box", size: [0.62, 0.08, 0.96], pos: [0.34, 1.11, -0.3], color: "metal" },
      { shape: "box", size: [0.2, 0.06, 0.7], pos: [0.34, 1.17, -0.3], color: "rust" },
      // proue et arrière
      { shape: "box", size: [0.6, 0.56, 0.07], pos: [0.34, 0.84, 1.17], rot: [-14, 0, 0], color: "rust" },
      { shape: "box", size: [0.62, 0.07, 0.08], pos: [0.34, 1.1, 1.1], rot: [-14, 0, 0], color: "hazard" },
      { shape: "box", size: [0.62, 0.92, 0.06], pos: [-0.33, 1.03, -1.19], color: "rust" },
      ...fines([[-0.645, -0.68], [-0.645, 0.12], [0.655, -0.3]].flatMap(([x, z]): Part[] => [-0.3, 0, 0.3].map((d): Part => ({ shape: "box", size: [0.07, 0.07, 0.07], pos: [x, 0.98, q(z + d)], color: "dark" })))),
    ]),
  );

  // palan : mât à l'avant, entre les conteneurs ; flèche à contrepoids vers le quai droit, chariot et crochet
  const crane = annexe(chariot, "hold_crane");
  const pz = 0.57;
  const M: Vec3 = [0, 2.12, pz];
  const leve = "t:0,-0.42,0:0.5:0.62";
  out.push(
    ...crane.fixe([
      { shape: "box", size: [0.16, 1.05, 0.16], pos: [0, 1.1, pz], color: "hazard" },
      { shape: "box", size: [0.22, 0.08, 0.22], pos: [0, 0.61, pz], color: "dark" },
    ]),
    ...crane.mobile("mat_palan", leve, [{ shape: "box", size: [0.11, 1.0, 0.11], pos: [0, 1.6, pz], color: "steel" }]),
    ...crane.mobile("potence", `r:y,90:0.62:0.74|${leve}`, [
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.14, pos: M, color: "dark" },
      { shape: "box", size: [1.58, 0.15, 0.13], pos: [0.34, 2.2, pz], color: "faction" },
      { shape: "box", size: [0.22, 0.24, 0.26], pos: [-0.38, 2.18, pz], color: "dark" },
      { shape: "tube", radius: 0.03, sides: 4, path: [[0.06, 1.8, pz], [0.56, 2.14, pz]], color: "steel" },
      { shape: "box", size: [0.24, 0.14, 0.2], pos: [0.86, 2.1, pz], color: "copper" },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.3, pos: [0.86, 2.32, pz], rot: [90, 0, 0], color: "dark" },
    ], M),
    ...crane.mobile("crochet", "r:y,90:0.62:0.74|t:0,0.04,0:0.5:0.62", [
      { shape: "cylinder", sides: 4, radius: 0.016, height: chariot ? 0.4 : 0.7, pos: [0.86, chariot ? 1.85 : 1.7, pz], color: "black" },
      { shape: "box", size: [0.13, 0.14, 0.13], pos: [0.86, chariot ? 1.6 : 1.55, pz], color: "hazard" },
    ], [0, 2.12, pz]),
    ...(chariot ? [] : crane.fixe(coffre([0.86, 1.22, pz], [0.34, 0.28, 0.34], "wood"))),
    ...verinsRapides(chariot, "hold_quick"),
  );
  return out;
}

// ——— Laboratoire ———

/**
 * Laboratoire : baie de calcul à lames lumineuses, télescopique, sur l'avant droit (« lab_fast »), ou coffres de
 * carnets et station météo à anémomètre (« lab_field ») ; grande antenne courbe qui tourne sur le toit, couchée à plat
 * sur le chenillard (« lab_antenna »), ou vérins (« lab_quick »).
 */
export function annexesLaboratoire(chariot: boolean): Part[] {
  const fast = annexe(chariot, "lab_fast");
  const [bx, bz] = [0.36, 0.9];
  const out: Part[] = [
    ...fast.fixe([
      { shape: "box", size: [0.6, 0.48, 0.46], pos: [bx, 0.815, bz], color: "dark" },
      ...[0.7, 0.82, 0.94].map((y): Part => ({ shape: "box", size: [0.5, 0.04, 0.02], pos: [bx, y, q(bz + 0.235)], color: "glow" })),
      ...[0.7, 0.82, 0.94].map((y): Part => ({ shape: "box", size: [0.02, 0.04, 0.36], pos: [q(bx + 0.305), y, bz], color: "glow", fine: true })),
      { shape: "box", size: [0.62, 0.05, 0.48], pos: [bx, 1.05, bz], color: "faction" },
      { shape: "tube", radius: 0.035, sides: 5, path: [[0.1, 0.66, 0.7], [0.02, 0.66, 0.4], [0.02, 0.66, -0.2]], bend: 0.1, color: "black", fine: true },
    ]),
    ...fast.mobile("baie", "t:0,-0.46,0:0.6:0.8", [
      { shape: "box", size: [0.52, 0.56, 0.4], pos: [bx, 1.32, bz], color: "metal" },
      ...[-0.18, 0, 0.18].map((d): Part => ({ shape: "box", size: [0.1, 0.42, 0.02], pos: [q(bx + d), 1.32, q(bz + 0.205)], color: "glow" })),
      ...[0.205, -0.205].map((d): Part => ({ shape: "box", size: [0.1, 0.42, 0.02], pos: [q(bx + 0.02), 1.32, q(bz + d)], color: "glow", fine: true })),
      ...[-0.11, 0.11].map((d): Part => ({ shape: "box", size: [0.02, 0.42, 0.12], pos: [q(bx + 0.265), 1.32, q(bz + d)], color: "glow" })),
      ...[-0.11, 0.11].map((d): Part => ({ shape: "box", size: [0.02, 0.42, 0.12], pos: [q(bx - 0.265), 1.32, q(bz + d)], color: "glow" })),
      // dessus : lame lumineuse, radiateurs de cuivre
      { shape: "box", size: [0.56, 0.05, 0.44], pos: [bx, 1.61, bz], color: "dark" },
      { shape: "box", size: [0.12, 0.03, 0.36], pos: [bx, 1.645, bz], color: "glow" },
      ...[-0.18, 0.18].map((d): Part => ({ shape: "box", size: [0.12, 0.1, 0.34], pos: [q(bx + d), 1.67, bz], color: "copper" })),
    ]),
  ];

  // carnets de terrain : coffres et carnets, abri météo à persiennes, mât à anémomètre
  const field = annexe(chariot, "lab_field");
  const A: Vec3 = [0.08, 2.0, 1.04];
  const mat = "t:0,-0.6,0:0.6:0.8";
  out.push(
    ...field.fixe([
      ...coffre([0.22, 0.7, 0.92], [0.4, 0.25, 0.36], "wood"),
      ...coffre([0.22, 0.94, 0.92], [0.36, 0.22, 0.32], "rust"),
      { shape: "box", size: [0.14, 0.1, 0.2], pos: [0.14, 1.1, 0.92], color: "red" },
      { shape: "box", size: [0.14, 0.14, 0.2], pos: [0.3, 1.12, 0.92], rot: [0, 12, 0], color: "light" },
      { shape: "box", size: [0.18, 0.05, 0.24], pos: [0.22, 1.21, 0.92], rot: [0, -15, 0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.7, pos: [A[0], 0.92, A[2]], color: "dark" },
    ]),
    // abri météo (boîte blanche sur pieds)
    ...field.mobile("abri", "t:0,-0.45,0:0.6:0.8", [
      ...[0.1, -0.1].flatMap((dx): Part[] => [0.1, -0.1].map((dz): Part => ({ shape: "box", size: [0.04, 0.62, 0.04], pos: [q(0.54 + dx), 0.9, q(0.88 + dz)], color: "wood" }))),
      { shape: "box", size: [0.3, 0.34, 0.3], pos: [0.54, 1.36, 0.88], color: "light" },
      ...[1.26, 1.36, 1.46].map((y): Part => ({ shape: "box", size: [0.31, 0.025, 0.31], pos: [0.54, y, 0.88], color: "dark", fine: true })),
      { shape: "box", size: [0.4, 0.06, 0.4], pos: [0.54, 1.56, 0.88], rot: [8, 0, 0], color: "snow" },
    ]),
    ...field.mobile("mat_meteo", mat, [
      { shape: "cylinder", sides: 5, radius: 0.035, height: 1.1, pos: [A[0], 1.46, A[2]], color: "steel" },
      { shape: "box", size: [0.03, 0.14, 0.4], pos: [A[0], 1.72, q(A[2] - 0.06)], color: "faction" },
    ]),
    ...field.tourne("radar_anemo", mat, [
      ...[0, 60, 120].map((d): Part => ({ shape: "box", size: [0.5, 0.03, 0.03], pos: A, rot: [0, d, 0], color: "dark" })),
      ...[0, 120, 240].map((d): Part => ({ shape: "sphere", radius: 0.075, pos: [q(A[0] + 0.25 * Math.cos((d * Math.PI) / 180)), A[1], q(A[2] + 0.25 * Math.sin((d * Math.PI) / 180))], color: "red" })),
    ], A),
  );

  // grande antenne : mât sur le toit de l'abri, réflecteur courbe à cornet ; couchée vers l'arrière sur le chenillard
  const ant = annexe(chariot, "lab_antenna");
  const T: Vec3 = [0, 2.3, -0.7];
  const monte = "t:0,-0.86,0:0.6:0.8";
  const reflecteur: Part[] = [
    { shape: "cylinder", sides: 8, radius: 0.13, height: 0.12, pos: T, color: "dark" },
    ...[-2, -1, 0, 1, 2].map((k): Part => ({ shape: "box", size: [0.28, 0.56, 0.05], pos: [q(k * 0.262), 2.66, q(-0.76 + k * k * 0.052)], rot: [0, -k * 13, 0], color: k % 2 ? "steel" : "light" })),
    ...[2.4, 2.92].flatMap((y): Part[] => [
      { shape: "box", size: [0.82, 0.06, 0.08], pos: [0, y, -0.77], color: "faction" },
      { shape: "box", size: [0.3, 0.06, 0.08], pos: [0.5, y, -0.6], rot: [0, -26, 0], color: "faction", mirror: true },
    ]),
    { shape: "box", size: [0.06, 0.06, 0.5], pos: [0, 2.46, -0.5], rot: [-16, 0, 0], color: "dark" },
    { shape: "box", size: [0.14, 0.12, 0.12], pos: [0, 2.56, -0.26], color: "copper", fine: true },
    { shape: "sphere", radius: 0.05, pos: [0, 3.0, -0.77], color: "amber" },
  ];
  out.push(
    ...ant.fixe([{ shape: "cylinder", sides: 8, radius: 0.2, radiusTop: 0.13, height: 0.16, pos: [0, 1.36, -0.7], color: "rust" }]),
    ...ant.mobile("mat_antenne", monte, [
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.95, pos: [0, 1.78, -0.7], color: "steel" },
      { shape: "cylinder", sides: 6, radius: 0.11, height: 0.08, pos: [0, 2.2, -0.7], color: "dark" },
    ]),
    ...ant.tourne("radar_antenne", `r:x,-90:0.8:0.95|t:${decal([["x", -90]], [0, -0.86, 0])}:0.6:0.8`, reflecteur, T),
    ...verinsRapides(chariot, "lab_quick"),
  );
  return out;
}

// ——— Atelier ———

/**
 * Atelier : double portique à pont roulant au-dessus de la tente et du parvis, télescopique (« shop_fast »), ou cour de
 * rodage sur le flanc droit, piste balisée et cible (« shop_vets »), relevée contre la caisse sur le chenillard ;
 * cour de réparation sur le flanc gauche, deux bras et un tapis à croix verte (« shop_repair »), ou vérins
 * (« shop_quick »).
 */
export function annexesAtelier(chariot: boolean): Part[] {
  const fast = annexe(chariot, "shop_fast");
  const pieds = [0.95, -0.36];
  const haut = "t:0,-0.76,0:0.5:0.66";
  const out: Part[] = [
    ...fast.mobile("pieds", "t:0,0.28,0:0.3:0.48", pieds.flatMap((z): Part[] => [
      { shape: "box", size: [0.17, 1.02, 0.17], pos: [1.21, 0.55, z], color: "dark", mirror: true },
      { shape: "box", size: [0.26, 0.09, 0.36], pos: [1.25, 0.045, z], color: "rust", mirror: true },
    ])),
    ...fast.mobile("portique", haut, [
      ...pieds.flatMap((z): Part[] => [
        { shape: "box", size: [0.12, 1.16, 0.12], pos: [1.21, 1.5, z], color: "hazard", mirror: true },
        { shape: "box", size: [2.6, 0.17, 0.17], pos: [0, 2.1, z], color: "rust" },
        { shape: "box", size: [0.08, 0.4, 0.1], pos: [1.02, 1.95, z], rot: [0, 0, -45], color: "rust", mirror: true, fine: true },
      ]),
      { shape: "box", size: [0.12, 0.12, 1.66], pos: [1.12, 2.24, 0.3], color: "steel", mirror: true },
      // pont roulant, chariot, treuil
      { shape: "box", size: [2.36, 0.16, 0.26], pos: [0, 2.36, 0.62], color: "faction" },
      { shape: "box", size: [0.4, 0.24, 0.4], pos: [0.3, 2.5, 0.62], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.11, height: 0.34, pos: [0.3, 2.64, 0.62], rot: [0, 0, 90], color: "copper" },
      { shape: "sphere", radius: 0.06, pos: [1.21, 2.24, 0.95], color: "amber", mirror: true },
    ]),
  ];
  // moteur pendu au crochet (atelier déployé)
  if (!chariot) {
    out.push(...fast.fixe([
      { shape: "box", size: [0.03, 0.5, 0.03], pos: [0.3, 2.08, 0.8], color: "black" },
      { shape: "box", size: [0.14, 0.12, 0.14], pos: [0.3, 1.84, 0.8], color: "hazard" },
      { shape: "bevel", size: [0.34, 0.22, 0.3], pos: [0.3, 1.66, 0.8], bevel: 0.04, color: "metal" },
    ]));
  }

  // cour de rodage : piste balisée, pneus, cônes et bosse ; cible ronde sur pieds
  const vets = annexe(chariot, "shop_vets");
  const C0: Vec3 = [1.26, 0.04, 0];
  const px = 1.66;
  out.push(
    ...vets.mobile("piste", "r:z,90:0.5:0.7|t:0.32,0,0:0.3:0.48", [
      { shape: "box", size: [0.8, 0.05, 2.1], pos: [px, 0.04, 0], color: "dry" },
      ...[1.29, 2.03].map((x): Part => ({ shape: "box", size: [0.07, 0.07, 2.1], pos: [x, 0.05, 0], color: "hazard" })),
      ...[-0.5, 0.05, 0.6].flatMap((z): Part[] => [26, -26].map((r): Part => ({ shape: "box", size: [0.3, 0.06, 0.08], pos: [q(px - Math.sign(r) * 0.13), 0.045, z], rot: [0, r, 0], color: "light" }))),
      ...[0.9, 0.3, -0.25].map((z): Part => ({ shape: "cone", sides: 6, radius: 0.1, height: 0.3, pos: [1.92, 0.2, z], color: "red", fine: true })),
      ...[0.86, 0.32].map((z): Part => ({ shape: "torus", radius: 0.13, tube: 0.06, sides: 8, pos: [1.56, 0.11, z], color: "rubber", ...(z < 0.5 ? { fine: true } : {}) })),
      { shape: "wedge", size: [0.5, 0.16, 0.3], pos: [1.68, 0.14, -0.3], color: "rust" },
    ], C0),
    ...vets.mobile("cible", "r:y,-90:0.66:0.8|t:0,0.3,0:0.3:0.48", [
      ...[0.2, 0.56].map((d): Part => ({ shape: "box", size: [0.07, 0.8, 0.07], pos: [q(1.38 + d), 0.4, -0.98], color: "wood" })),
      ...([[0.4, "light", 0.06], [0.3, "red", 0.09], [0.2, "light", 0.12], [0.1, "red", 0.15]] as [number, C, number][]).map(([r, color, h]): Part => ({ shape: "cylinder", sides: r > 0.25 ? 10 : 8, radius: r, height: h, pos: [1.76, 0.82, -0.94], rot: [90, 0, 0], color })),
      { shape: "box", size: [0.04, 0.5, 0.04], pos: [1.42, 1.15, -0.98], color: "steel" },
      { shape: "box", size: [0.02, 0.2, 0.34], pos: [1.42, 1.32, -0.82], color: "faction" },
    ], [1.38, 0, -0.98]),
  );

  // cour de réparation : tapis à croix verte, deux bras articulés sur colonne, outil lumineux
  const repair = annexe(chariot, "shop_repair");
  const sx = -1.28;
  const E: Vec3 = [-0.2, 0.8, 0];
  const bras = (z: number, i: number): Part[] => {
    const S: Vec3 = [sx, 1.06, z];
    const tend: [number, number][] = [[0.5, 0.65], [0.65, 0.85]];
    const r1 = `r:z,-14:${tend[0].join(":")}`;
    const r2 = `r:z,62:${tend[1].join(":")}`;
    return [
      ...repair.fixe([
        { shape: "box", size: [0.26, 0.12, 0.3], pos: [-1.14, 0.52, z], color: "rust" },
        { shape: "box", size: [0.22, 0.56, 0.24], pos: [sx, 0.76, z], color: "dark" },
      ]),
      ...repair.mobile(`bras${i}`, r1, [
        { shape: "cylinder", sides: 8, radius: 0.12, height: 0.3, pos: S, rot: [90, 0, 0], color: "steel" },
        { shape: "tube", radius: 0.1, sides: 4, pos: S, path: [[0, 0, 0], E], color: "hazard" },
        { shape: "cylinder", sides: 8, radius: 0.1, height: 0.26, pos: [q(S[0] + E[0]), q(S[1] + E[1]), z], rot: [90, 0, 0], color: "steel", fine: true },
      ]),
      ...repair.mobile(`avant${i}`, `${r1}|${r2}|t:${decalCoude("z", 62, E)}:${tend[1].join(":")}`, [
        { shape: "tube", radius: 0.075, sides: 4, pos: S, path: [E, [-0.72, 0.32, 0]], color: "steel" },
        { shape: "box", size: [0.16, 0.16, 0.2], pos: [q(S[0] - 0.74), q(S[1] + 0.27), z], color: "dark" },
        { shape: "cone", sides: 6, radius: 0.06, height: 0.16, pos: [q(S[0] - 0.76), q(S[1] + 0.12), z], rot: [180, 0, 0], color: "copper", fine: true },
        { shape: "sphere", radius: 0.06, pos: [q(S[0] - 0.76), q(S[1] + 0.04), z], color: "glow" },
      ], S),
    ];
  };
  out.push(
    ...bras(0.36, 0),
    ...bras(-0.92, 1),
    ...repair.mobile("tapis", "r:z,-90:0.5:0.7|t:-0.32,0,0:0.3:0.48", [
      { shape: "box", size: [0.62, 0.06, 1.9], pos: [-1.74, 0.04, -0.1], color: "concrete" },
      ...[0.82, -1.02].map((z): Part => ({ shape: "box", size: [0.62, 0.07, 0.08], pos: [-1.74, 0.045, z], color: "hazard" })),
      { shape: "box", size: [0.46, 0.08, 0.16], pos: [-1.74, 0.045, -0.28], color: "acid" },
      { shape: "box", size: [0.16, 0.08, 0.46], pos: [-1.74, 0.045, -0.28], color: "acid" },
    ], [-1.43, 0.04, 0]),
    ...verinsRapides(chariot, "shop_quick", { x: 1.07, zs: [1.56, -1.56] }),
  );
  return out;
}

// ——— Bastion ———

/** Canon long : place de son axe (au-dessus du toit de la tourelle, à côté du tourelleau) et hausse (degrés). */
const LONG: Vec3 = [0.08, 1.8, 0];
const HAUSSE = 4;

/**
 * Bastion : canon long à gros frein de bouche sur le toit de la tourelle, à la place du canon d'origine
 * (« bastion_long »), ou émetteur de bouclier à anneaux, sur le toit aussi (« bastion_shield ») ; un fût antiaérien sur
 * chaque joue de la tourelle (« bastion_flak ») ou talus de plaques et de gabions autour du chariot (« bastion_armor »).
 * Les pièces de la tourelle suivent ses mouvements (voir bastionNomade).
 */
export function annexesBastion(chariot: boolean): Part[] {
  const tour = `r:y,180:0.74:1|t:0,${-LEVE},0:0.5:0.62`;
  // canon long, sur le toit de la tourelle : berceau, culasse à l'arrière, récupérateurs, bobines, frein de bouche ; un
  // masque aveugle ferme l'embrasure. Sur le chenillard, le fût rentre dans son berceau
  const long = annexe(chariot, "bastion_long");
  const axe: Vec3 = [0, TY, 0];
  const a = (HAUSSE * Math.PI) / 180;
  const at = (d: number, h: number, p: Part, x = 0): Part => incl([q(LONG[0] + x), LONG[1], LONG[2]], HAUSSE, d, h, p);
  const out: Part[] = [
    ...long.tourne("tourelle", tour, [
      { shape: "box", size: [0.5, 0.32, 0.12], pos: [0, 1.31, 0.45], color: "rust" },
      { shape: "box", size: [0.24, 0.18, 0.9], pos: [LONG[0], 1.62, -0.02], color: "dark" },
      at(-0.5, 0, { shape: "bevel", size: [0.32, 0.32, 0.46], bevel: 0.06, color: "metal" }),
      at(-0.5, 0.17, { shape: "box", size: [0.2, 0.04, 0.34], color: "faction" }),
      at(0.08, 0, { shape: "cylinder", sides: 10, radius: 0.16, height: 0.8, rot: [90, 0, 0], color: "dark" }),
      at(0.2, 0.16, { shape: "cylinder", sides: 6, radius: 0.055, height: 0.9, rot: [90, 0, 0], color: "hazard" }, 0.11),
      at(0.2, 0.16, { shape: "cylinder", sides: 6, radius: 0.055, height: 0.9, rot: [90, 0, 0], color: "hazard" }, -0.11),
    ], axe),
    ...long.tourne("tourelle", `${tour}|t:0,${q(-Math.sin(a) * 0.5)},${q(-Math.cos(a) * 0.5)}:0.5:0.74`, [
      at(0.92, 0, { shape: "cylinder", sides: 10, radius: 0.105, radiusTop: 0.09, height: 1.2, rot: [90, 0, 0], color: "steel" }),
      ...[0.66, 0.88, 1.1].map((d) => at(d, 0, { shape: "torus", radius: 0.115, tube: 0.035, sides: 8, rot: [90, 0, 0], color: "copper", ...(d > 0.8 && d < 1 ? { fine: true } : {}) })),
      // frein de bouche à deux chambres, bande d'équipe
      at(1.48, 0, { shape: "cylinder", sides: 8, radius: 0.16, height: 0.28, rot: [90, 0, 0], color: "dark" }),
      ...[1.42, 1.56].map((d) => at(d, 0, { shape: "box", size: [0.46, 0.16, 0.06], color: "steel" })),
      at(1.3, 0, { shape: "cylinder", sides: 6, radius: 0.13, height: 0.07, rot: [90, 0, 0], color: "faction" }),
    ], axe),
  ];

  // émetteur : socle, fût, trois anneaux de cuivre emboîtés en route, globe lumineux
  const shield = annexe(chariot, "bastion_shield");
  const X = 0.06;
  const Z = -0.16;
  const tele = (d: number) => (chariot ? `${tour}|t:0,${-d},0:0.5:0.74` : tour);
  out.push(
    ...shield.tourne("tourelle", tour, [
      { shape: "cylinder", sides: 8, radius: 0.24, radiusTop: 0.16, height: 0.18, pos: [X, 1.62, Z], color: "dark" },
      { shape: "torus", radius: 0.36, tube: 0.055, sides: 12, pos: [X, 1.82, Z], color: "copper" },
      { shape: "box", size: [0.72, 0.05, 0.06], pos: [X, 1.8, Z], color: "steel" },
      { shape: "box", size: [0.06, 0.05, 0.72], pos: [X, 1.8, Z], color: "steel" },
    ], axe),
    ...shield.tourne("tourelle", tele(0.24), [
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.5, pos: [X, 1.9, Z], color: "steel" },
      { shape: "torus", radius: 0.29, tube: 0.05, sides: 12, pos: [X, 2.08, Z], color: "copper" },
      { shape: "box", size: [0.56, 0.04, 0.05], pos: [X, 2.08, Z], color: "steel" },
    ], axe),
    ...shield.tourne("tourelle", tele(0.48), [
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.5, pos: [X, 2.2, Z], color: "dark" },
      { shape: "torus", radius: 0.22, tube: 0.045, sides: 10, pos: [X, 2.34, Z], color: "copper" },
      { shape: "sphere", radius: 0.17, detail: 1, pos: [X, 2.58, Z], color: "glow" },
    ], axe),
  );

  // affût antiaérien : une nacelle et un fût relevé sur chaque joue ; fûts couchés en route
  const flak = annexe(chariot, "bastion_flak");
  const N: Vec3 = [0.72, 1.42, 0];
  const tir = (d: number, p: Part): Part => incl(N, 56, d, 0, { ...p, rot: [90, 0, 0], mirror: true });
  out.push(
    ...flak.tourne("tourelle", tour, [
      { shape: "bevel", size: [0.24, 0.36, 0.54], pos: [0.71, 1.42, -0.04], bevel: 0.05, color: "metal", mirror: true },
      { shape: "box", size: [0.25, 0.08, 0.4], pos: [0.71, 1.58, -0.08], color: "faction", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.2, pos: [0.7, 1.36, -0.36], rot: [0, 0, 90], color: "copper", mirror: true, fine: true },
    ], axe),
    ...flak.tourne("tourelle", `r:y,180:0.74:1|r:x,56:0.62:0.74|t:${decal([["y", 180], ["x", 56]], [0, -LEVE, 0])}:0.5:0.62`, [
      tir(0.3, { shape: "cylinder", sides: 8, radius: 0.1, height: 0.34, color: "dark" }),
      tir(0.72, { shape: "cylinder", sides: 6, radius: 0.06, height: 0.9, color: "steel" }),
      tir(1.1, { shape: "cylinder", sides: 8, radius: 0.1, height: 0.18, color: "dark" }),
      tir(0.56, { shape: "cylinder", sides: 8, radius: 0.085, height: 0.08, color: "hazard", fine: true }),
    ], chariot ? [0, N[1], 0] : axe),
  );

  // talus : plaques inclinées le long des chenilles (pendues à la verticale en route), gabions devant et derrière
  const armor = annexe(chariot, "bastion_armor");
  const pente = 36;
  const sin = Math.sin((pente * Math.PI) / 180);
  const cos = Math.cos((pente * Math.PI) / 180);
  for (const s of [1, -1]) {
    const T: Vec3 = [q(s * 0.9), 0.74, 0];
    const pl = (d: number, z: number, size: Vec3, color: C, fine = false): Part => ({ shape: "box", size, pos: [q(T[0] + s * sin * d), q(T[1] - cos * d), z], rot: [0, 0, s * pente], color, ...(fine ? { fine } : {}) });
    out.push(...armor.mobile(s > 0 ? "talus_d" : "talus_g", `r:z,${-s * pente}:0.3:0.48|t:${decal([["z", -s * pente]], [0, 0.16, 0])}:0.3:0.48`, [
      { shape: "box", size: [0.07, 0.07, 1.3], pos: T, color: "steel" },
      ...[-0.41, 0, 0.41].map((z) => pl(0.43, z, [0.08, 0.84, 0.38], z ? "rust" : "metal")),
      pl(0.14, 0, [0.1, 0.08, 1.3], "hazard"),
      pl(0.79, 0, [0.1, 0.1, 1.3], "dark"),
    ]));
  }
  const gabion = (x: number, z: number, y = 0): Part[] => [
    { shape: "box", size: [0.38, 0.36, 0.3], pos: [x, q(y + 0.18), z], color: "dry" },
    { shape: "box", size: [0.3, 0.06, 0.22], pos: [x, q(y + 0.36), z], color: "rock", fine: true },
  ];
  out.push(...armor.mobile("gabions", "t:0,0.16,0:0.3:0.48", [
    ...[-0.62, -0.21, 0.2, 0.61].flatMap((x) => [...gabion(x, 1.4), ...gabion(x, -1.4)]),
    ...gabion(0.42, 1.4, 0.38),
    ...gabion(-0.62, -1.4, 0.38),
    { shape: "box", size: [1.7, 0.06, 0.06], pos: [0, 0.2, 1.24], color: "hazard", fine: true },
  ]));
  return out;
}
