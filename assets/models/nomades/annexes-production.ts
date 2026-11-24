// Annexes de la foreuse, de la fonderie, de l'assembleur et de la raffinerie nomades (voir annexes.ts).
import type { Part, Vec3 } from "../types.ts";
import { q, decal, decalCoude } from "./commun.ts";
import { annexe, fines, verinsRapides } from "./annexes.ts";

const rad = (a: number) => (a * Math.PI) / 180;

// ——— Foreuse ———

/**
 * Foreuse : second mât à tête jaune et mouton à droite du premier (« drill_fast »), cloche sur le trou, cyclone et bac de
 * récupération à l'arrière gauche (« drill_clean ») ; vérins (« drill_quick ») ou râtelier de tubes de sonde debout à
 * gauche, treuil sur le flanc (« drill_deep »). Les mâts se couchent vers l'avant sur le chenillard, comme celui de la
 * foreuse.
 */
export function annexesForeuse(chariot: boolean): Part[] {
  const leve = "r:x,90:0.5:0.85";
  // second mât de percussion : charnière, montants, tête, mouton, vérin pneumatique de cuivre
  const fast = annexe(chariot, "drill_fast");
  const H: Vec3 = [0.66, 0.7, -1.15];
  const zm = -1.25;
  const out: Part[] = [
    ...fast.fixe([{ shape: "box", size: [0.24, 0.14, 0.2], pos: [H[0], 0.62, H[2]], color: "steel" }]),
    ...fast.mobile("mat2", leve, [
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.24, pos: H, rot: [0, 0, 90], color: "steel", fine: true },
      ...[-0.095, 0.095].map((dx): Part => ({ shape: "box", size: [0.06, 1.65, 0.1], pos: [q(H[0] + dx), 1.525, zm], color: "steel" })),
      ...[0.95, 2.0].map((y): Part => ({ shape: "box", size: [0.3, 0.07, 0.07], pos: [H[0], y, zm], color: "dark" })),
      { shape: "bevel", size: [0.38, 0.2, 0.36], pos: [H[0], 2.4, -1.28], bevel: 0.03, color: "hazard" },
      { shape: "bevel", size: [0.3, 0.5, 0.32], pos: [H[0], 1.62, -1.37], bevel: 0.04, color: "dark" },
      { shape: "box", size: [0.32, 0.12, 0.34], pos: [H[0], 1.72, -1.37], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.5, pos: [H[0], 2.08, -1.36], color: "copper" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.12, pos: [H[0], 1.36, -1.37], color: "steel", fine: true },
      { shape: "sphere", radius: 0.05, pos: [H[0], 2.54, -1.28], color: "amber" },
    ]),
  ];
  const trepan: Part[] = [
    { shape: "cylinder", sides: 6, radius: 0.06, height: 1.2, pos: [H[0], 0.8, -1.37], color: "steel" },
    { shape: "cone", sides: 6, radius: 0.13, height: 0.3, pos: [H[0], 0.12, -1.37], rot: [180, 0, 0], color: "dark" },
    { shape: "box", size: [0.26, 0.06, 0.06], pos: [H[0], 0.3, -1.37], color: "steel", fine: true },
  ];
  out.push(...(chariot ? fast.mobile("trepan", `${leve}|t:0,0.72,0:0.85:1`, trepan, H) : fast.tourne("foret_trepan", "", trepan, [H[0], 0, -1.37])));

  // forage propre : cloche de captage, gaine, cyclone sur son bac
  const clean = annexe(chariot, "drill_clean");
  const tz = -1.57;
  out.push(
    ...clean.fixe([{ shape: "box", size: [1.1, 0.07, 0.1], pos: [-0.1, 0.42, -1.3], color: "rust" }]),
    ...clean.mobile("cloche", "r:x,90:0.85:1", [
      { shape: "lathe", sides: 12, pos: [0.3, 0, tz], color: "steel", profile: [[0.35, 0.01], [0.35, 0.1], [0.21, 0.32], [0.13, 0.36]] },
      { shape: "torus", radius: 0.33, tube: 0.03, sides: 10, pos: [0.3, 0.1, tz], color: "faction" },
    ], [0.3, 0.4, -1.25]),
    ...clean.mobile("bac", "t:0,0.25,0:0.85:1", [
      { shape: "bevel", size: [0.6, 0.4, 0.5], pos: [-0.42, 0.25, -1.56], bevel: 0.04, color: "rust" },
      { shape: "box", size: [0.5, 0.05, 0.4], pos: [-0.42, 0.45, -1.56], color: chariot ? "black" : "ore" },
      { shape: "box", size: [0.62, 0.07, 0.52], pos: [-0.42, 0.33, -1.56], color: "hazard" },
      { shape: "lathe", sides: 10, pos: [-0.42, 0.46, -1.56], color: "steel", profile: [[0.06, 0], [0.24, 0.42], [0.24, 0.84], [0.1, 1.0], [0, 1.0]] },
      { shape: "cylinder", sides: 10, radius: 0.25, height: 0.12, pos: [-0.42, 1.14, -1.56], color: "faction" },
      { shape: "tube", radius: 0.08, sides: 6, path: [[0.08, 0.34, -1.56], [0.02, 1.2, -1.56], [-0.22, 1.2, -1.56]], bend: 0.16, color: "copper" },
      ...[-0.18, 0.18].map((dx): Part => ({ shape: "box", size: [0.05, 0.5, 0.05], pos: [q(-0.42 + dx), 0.7, -1.4], color: "dark", fine: true })),
    ]),
    ...verinsRapides(chariot, "drill_quick", { x: 0.97 }),
  );

  // sonde profonde : râtelier de tubes debout à gauche du mât, treuil sur le flanc gauche
  const deep = annexe(chariot, "drill_deep");
  const D: Vec3 = [-0.84, 0.7, -1.15];
  const tubes: Part[] = [];
  for (const z of [-1.22, -1.36]) for (const x of [-0.98, -0.84, -0.7]) {
    const cuivre = (x === -0.84) === (z === -1.22);
    tubes.push({ shape: "cylinder", sides: 6, radius: 0.058, height: 1.85, pos: [x, 1.66, z], color: cuivre ? "copper" : "steel" });
  }
  out.push(
    ...deep.fixe([
      { shape: "box", size: [0.34, 0.2, 0.18], pos: [-0.82, 0.57, -1.15], color: "rust" },
      // treuil : châssis, tambour de câble, joues
      { shape: "box", size: [0.36, 0.1, 0.36], pos: [-0.84, 0.56, 0.8], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.3, pos: [-0.86, 0.76, 0.8], rot: [0, 0, 90], color: "copper" },
      ...[-0.72, -1.0].map((x): Part => ({ shape: "cylinder", sides: 8, radius: 0.2, height: 0.04, pos: [x, 0.76, 0.8], rot: [0, 0, 90], color: "dark" })),
    ]),
    ...deep.mobile("ratelier", leve, [
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.4, pos: D, rot: [0, 0, 90], color: "steel", fine: true },
      { shape: "box", size: [0.46, 0.1, 0.36], pos: [-0.84, 0.7, -1.3], color: "dark" },
      ...tubes,
      { shape: "box", size: [0.5, 0.1, 0.34], pos: [-0.84, 1.3, -1.29], color: "rust" },
      { shape: "box", size: [0.54, 0.12, 0.38], pos: [-0.84, 2.16, -1.29], color: "hazard" },
    ]),
  );
  if (!chariot) out.push(...deep.fixe([{ shape: "tube", radius: 0.012, sides: 3, path: [[-0.86, 0.9, 0.8], [-0.84, 2.25, -1.2], [0.1, 2.85, -1.25]], bend: 0.02, color: "black", fine: true }]));
  return out;
}

// ——— Fonderie ———

/**
 * Fonderie : grosse soufflerie à hélice au-dessus de l'ancienne, conduit de cuivre et couronne de tuyères autour du
 * creuset (« furnace_fast »), second creuset et sa cheminée sur le flanc gauche, chenal de fonte (« furnace_yield ») ;
 * vérins (« furnace_quick ») ou ailettes de cuivre autour de la cheminée, qui rentrent avec elle (« furnace_lean »).
 */
export function annexesFonderie(chariot: boolean): Part[] {
  const fast = annexe(chariot, "furnace_fast");
  const S: Vec3 = [0.5, 1.26, -0.85];
  const descend = "t:0,-0.14,0:0.6:0.8";
  const out: Part[] = [
    ...fast.fixe([
      ...[[0.68, -0.62], [0.68, -1.0], [0.24, -1.06]].map(([x, z]): Part => ({ shape: "box", size: [0.07, 0.6, 0.07], pos: [x, 0.87, z], color: "rust" })),
      { shape: "torus", radius: 0.42, tube: 0.055, sides: 10, pos: [0.1, 0.72, 0], color: "copper" },
    ]),
    ...fast.mobile("volute", descend, [
      { shape: "cylinder", sides: 12, radius: 0.33, height: 0.24, pos: S, color: "dark" },
      { shape: "torus", radius: 0.31, tube: 0.045, sides: 10, pos: [S[0], q(S[1] + 0.12), S[2]], color: "faction" },
      { shape: "box", size: [0.26, 0.2, 0.34], pos: [0.74, 1.26, -0.72], color: "dark" },
      { shape: "tube", radius: 0.085, sides: 6, path: [[0.78, 1.26, -0.58], [0.82, 1.26, -0.06], [0.82, 0.74, 0.1], [0.48, 0.74, 0.16]], bend: 0.2, color: "copper" },
      { shape: "cylinder", sides: 8, radius: 0.115, height: 0.06, pos: [0.79, 1.26, -0.5], rot: [90, 0, 0], color: "steel", fine: true },
    ]),
    ...fast.tourne("rotor_volute", descend, [
      ...[0, 60, 120].map((d): Part => ({ shape: "box", size: [0.56, 0.03, 0.1], pos: [S[0], 1.4, S[2]], rot: [0, d, 0], color: "steel" })),
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.08, pos: [S[0], 1.42, S[2]], color: "copper" },
    ], [S[0], 1.4, S[2]]),
  ];

  // second creuset : console, creuset cerclé, bain de fonte, cheminée, chenal depuis le premier
  const recup = annexe(chariot, "furnace_yield");
  const [kx, kz] = [-0.84, -0.18];
  const glisse = "t:0.12,0,0:0.5:0.65";
  out.push(
    ...recup.mobile("creuset2", glisse, [
      { shape: "box", size: [0.62, 0.08, 0.6], pos: [-0.86, 0.66, kz], color: "rust" },
      { shape: "lathe", sides: 12, pos: [kx, 0.7, kz], color: "dark", profile: [[0, 0], [0.22, 0.06], [0.27, 0.48], [0.22, 0.48], [0.22, 0.42], [0, 0.42]] },
      { shape: "cylinder", sides: 12, radius: 0.265, height: 0.1, pos: [kx, 0.92, kz], color: "faction" },
      { shape: "box", size: [0.1, 0.36, 0.12], pos: [kx, 0.84, q(kz + 0.28)], color: "rust" },
      { shape: "box", size: [0.1, 0.36, 0.12], pos: [kx, 0.84, q(kz - 0.28)], color: "rust" },
      // cheminée à chapeau, hotte
      { shape: "cylinder", sides: 8, radius: 0.08, height: 1.0, pos: [-1.06, 1.2, -0.4], color: "dark" },
      { shape: "cone", sides: 6, radius: 0.15, height: 0.1, pos: [-1.06, 1.76, -0.4], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.07, pos: [-1.06, 1.4, -0.4], color: "copper" },
    ]),
    ...recup.mobile("bain2", `${glisse}|t:0,-0.08,0:0.75:0.85`, [{ shape: "cylinder", sides: 12, radius: 0.22, height: 0.03, pos: [kx, 1.15, kz], color: "amber" }]),
    ...recup.mobile("chenal", "r:z,74:0.85:1", [
      { shape: "box", size: [0.5, 0.06, 0.18], pos: [-0.42, 1.29, -0.1], rot: [0, 0, 16], color: "dark" },
      { shape: "box", size: [0.5, 0.03, 0.09], pos: [-0.42, 1.315, -0.1], rot: [0, 0, 16], color: "amber" },
    ], [-0.64, 1.22, -0.1]),
    ...verinsRapides(chariot, "furnace_quick"),
  );

  // récupérateur de chaleur : ailettes de cuivre empilées autour de la cheminée (elles coulissent avec elle)
  const lean = annexe(chariot, "furnace_lean");
  const [hx, hz] = [-0.4, -0.78];
  out.push(
    ...lean.mobile("ailettes", "t:0,-0.65,0:0.6:0.8", [
      ...[1.38, 1.49, 1.6, 1.71, 1.82].map((y): Part => ({ shape: "cylinder", sides: 10, radius: 0.31, height: 0.045, pos: [hx, y, hz], color: "copper" })),
      { shape: "cylinder", sides: 10, radius: 0.2, height: 0.06, pos: [hx, 1.29, hz], color: "steel", fine: true },
      ...[0.24, -0.24].map((dx): Part => ({ shape: "cylinder", sides: 5, radius: 0.035, height: 0.62, pos: [q(hx + dx), 1.6, hz], color: "steel", fine: true })),
    ]),
  );
  // tuyau de retour vers le creuset (fonderie déployée)
  if (!chariot) out.push(...lean.fixe([{ shape: "tube", radius: 0.05, sides: 6, path: [[-0.22, 1.3, -0.72], [-0.12, 1.2, -0.6], [-0.12, 0.8, -0.5], [-0.02, 0.8, -0.3]], bend: 0.1, color: "copper" }]));
  return out;
}

// ——— Assembleur ———

/**
 * Assembleur : second bras sur le flanc gauche et convoyeur qui sort à l'avant droit (« asm_fast »), chevalet de
 * gabarits sur le flanc gauche (« asm_thrift ») ; volant d'inertie à plat et coffret vert sur le flanc droit
 * (« asm_lean ») ou caisson de plaques sur la bâche, le fond et les flancs (« asm_armor »).
 */
export function annexesAssembleur(chariot: boolean): Part[] {
  const fast = annexe(chariot, "asm_fast");
  // second bras : plateau tournant (origine), épaule, coude, pince ; replié comme le premier
  const B: Vec3 = [-0.86, 0.7, 0.2];
  const E: Vec3 = [-0.86, 0.94, 0.2];
  const L1 = 0.64;
  const L2 = 0.48;
  const e: Vec3 = [0, q(L1 * Math.sin(rad(100))), q(L1 * Math.cos(rad(100)))];
  const w: Vec3 = [0, q(e[1] - L2 * Math.sin(rad(30))), q(e[2] + L2 * Math.cos(rad(30)))];
  const socle: Part[] = [
    { shape: "cylinder", sides: 10, radius: 0.19, height: 0.08, pos: [B[0], 0.72, B[2]], color: "steel" },
    { shape: "box", size: [0.16, 0.24, 0.2], pos: [-0.78, 0.86, B[2]], color: "dark" },
  ];
  const bras: Part[] = [
    { shape: "tube", radius: 0.085, sides: 4, pos: E, path: [[-0.06, 0, 0], [-0.06, e[1], e[2]]], color: "hazard" },
    { shape: "cylinder", sides: 6, radius: 0.08, height: 0.26, pos: E, rot: [0, 0, 90], color: "steel" },
    { shape: "cylinder", sides: 6, radius: 0.07, height: 0.24, pos: [E[0], q(E[1] + e[1]), q(E[2] + e[2])], rot: [0, 0, 90], color: "steel", fine: true },
  ];
  const P: Vec3 = [q(E[0] + 0.08), q(E[1] + w[1]), q(E[2] + w[2])];
  const avant: Part[] = [
    { shape: "tube", radius: 0.06, sides: 4, pos: E, path: [[0.08, e[1], e[2]], [0.08, w[1], w[2]]], color: "steel" },
    { shape: "box", size: [0.15, 0.13, 0.13], pos: P, color: "dark" },
    ...[0.05, -0.05].map((d): Part => ({ shape: "box", size: [0.03, 0.17, 0.05], pos: [q(P[0] + d), q(P[1] - 0.13), P[2]], color: "steel", fine: true })),
    { shape: "sphere", radius: 0.05, pos: [P[0], q(P[1] + 0.09), P[2]], color: "amber" },
  ];
  const out: Part[] = [...fast.fixe([{ shape: "box", size: [0.42, 0.1, 0.4], pos: [-0.84, 0.63, 0.2], color: "rust" }])];
  if (chariot) {
    out.push(
      ...fast.fixe(socle),
      ...fast.mobile("bras2", "r:x,-80:0.5:0.72", bras, E),
      ...fast.mobile("avant2", `r:x,-80:0.5:0.72|r:x,40:0.72:0.88|t:${decalCoude("x", 40, e)}:0.72:0.88`, avant, E),
    );
  } else out.push(...fast.tourne("bras2", "", [...socle, ...bras, ...avant], B));
  // convoyeur : section de plateau, puis section relevée sur le chenillard, inclinée vers la droite une fois posée
  const K: Vec3 = [0.68, 0.68, 1.06];
  const pente = 22;
  const at = (d: number, h: number): Vec3 => [q(K[0] + d * Math.cos(rad(pente)) + h * Math.sin(rad(pente))), q(K[1] - d * Math.sin(rad(pente)) + h * Math.cos(rad(pente))), K[2]];
  out.push(
    ...fast.fixe([
      { shape: "box", size: [0.62, 0.08, 0.26], pos: [0.36, 0.66, K[2]], color: "black" },
      ...[0.14, -0.14].map((d): Part => ({ shape: "box", size: [0.64, 0.14, 0.03], pos: [0.36, 0.66, q(K[2] + d)], color: "hazard" })),
      { shape: "box", size: [0.15, 0.12, 0.15], pos: [0.24, 0.76, K[2]], color: "copper" },
      { shape: "box", size: [0.15, 0.12, 0.15], pos: [0.5, 0.76, K[2]], color: "steel" },
    ]),
    ...fast.mobile("convoyeur", `r:z,${90 + pente}:0.5:0.7`, [
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.32, pos: K, rot: [90, 0, 0], color: "steel" },
      { shape: "box", size: [0.62, 0.06, 0.26], pos: at(0.33, 0), rot: [0, 0, -pente], color: "black" },
      ...[0.14, -0.14].map((d): Part => ({ shape: "box", size: [0.64, 0.12, 0.03], pos: [at(0.33, 0)[0], at(0.33, 0)[1], q(K[2] + d)], rot: [0, 0, -pente], color: "hazard" })),
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.3, pos: at(0.64, 0), rot: [90, 0, 0], color: "steel", fine: true },
    ]),
  );
  if (!chariot) out.push(...fast.fixe([{ shape: "box", size: [0.15, 0.12, 0.15], pos: at(0.3, 0.09), rot: [0, 0, -pente], color: "copper" }, { shape: "box", size: [0.08, 0.36, 0.22], pos: [1.2, 0.2, K[2]], color: "rust" }]));

  // gabarits économes : chevalet à deux pans sur le flanc gauche (refermé comme un livre sur le chenillard), gabarits
  // de formes et de couleurs différentes accrochés dessus
  const thrift = annexe(chariot, "asm_thrift");
  const gx = -0.84;
  const gy = 1.74;
  const pan = 38; // écart d'un pan avec la verticale (degrés)
  const oct: [number, number][] = [[-0.16, -0.07], [-0.07, -0.16], [0.07, -0.16], [0.16, -0.07], [0.16, 0.07], [0.07, 0.16], [-0.07, 0.16], [-0.16, 0.07]];
  const tri: [number, number][] = [[-0.18, -0.16], [0.18, -0.16], [0, 0.18]];
  const equerre: [number, number][] = [[-0.17, -0.17], [0.17, -0.17], [0.17, -0.03], [-0.03, -0.03], [-0.03, 0.17], [-0.17, 0.17]];
  const te: [number, number][] = [[-0.06, -0.17], [0.06, -0.17], [0.06, 0.03], [0.17, 0.03], [0.17, 0.17], [-0.17, 0.17], [-0.17, 0.03], [-0.06, 0.03]];
  out.push(
    ...thrift.fixe([
      { shape: "box", size: [0.46, 0.08, 1.06], pos: [-0.8, 0.63, 0.2], color: "rust" },
      ...[-0.28, 0.68].map((z): Part => ({ shape: "box", size: [0.1, 0.8, 0.08], pos: [gx, 1.05, z], color: "dark" })),
    ]),
    ...thrift.mobile("faite", "t:0,-0.25,0:0.5:0.65", [
      { shape: "box", size: [0.14, 0.12, 1.1], pos: [gx, gy, 0.2], color: "faction" },
      ...[-0.28, 0.68].map((z): Part => ({ shape: "box", size: [0.07, 0.6, 0.06], pos: [gx, 1.42, z], color: "steel" })),
    ]),
  );
  for (const s of [1, -1]) {
    // place sur le pan : `d` depuis le faîte vers le bas, `h` devant le pan
    const sur = (d: number, h: number): [number, number] => [q(gx + s * (d * Math.sin(rad(pan)) + h * Math.cos(rad(pan)))), q(gy - d * Math.cos(rad(pan)) + h * Math.sin(rad(pan)))];
    const [x0, y0] = sur(0.35, 0.03);
    const [x1, y1] = sur(0.36, 0.08);
    const gabarit = (z: number, profile: [number, number][], color: Part["color"]): Part => ({
      shape: "extrude", profile, depth: 0.06, pos: [x1, y1, z], rot: [-90, s * (90 - pan), s * 90], color,
    });
    out.push(...thrift.mobile(s > 0 ? "pan_gab_d" : "pan_gab_g", `r:z,${-s * pan}:0.65:0.85|t:${decal([["z", -s * pan]], [0, -0.25, 0])}:0.5:0.65`, [
      { shape: "box", size: [0.04, 0.62, 1.0], pos: [x0, y0, 0.2], rot: [0, 0, s * pan], color: "wood" },
      gabarit(-0.13, s > 0 ? te : oct, s > 0 ? "steel" : "red"),
      gabarit(0.2, s > 0 ? oct : tri, s > 0 ? "red" : "hazard"),
      gabarit(0.53, s > 0 ? equerre : te, s > 0 ? "hazard" : "light"),
    ], [gx, gy, 0.2]));
  }

  // établis sobres : volant d'inertie à plat (couché contre le flanc sur le chenillard), coffret à lanterne verte
  const lean = annexe(chariot, "asm_lean");
  const V: Vec3 = [0.98, 0.9, 0.0];
  out.push(
    ...lean.fixe([
      { shape: "box", size: [0.4, 0.08, 0.16], pos: [0.82, 0.72, V[2]], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.07, height: 0.12, pos: [V[0], 0.79, V[2]], color: "dark" },
      { shape: "box", size: [0.3, 0.08, 0.36], pos: [0.78, 0.63, 0.56], color: "rust" },
      { shape: "bevel", size: [0.3, 0.5, 0.38], pos: [0.86, 0.92, 0.56], bevel: 0.04, color: "steel" },
      { shape: "box", size: [0.31, 0.08, 0.39], pos: [0.86, 1.06, 0.56], color: "faction" },
      { shape: "box", size: [0.02, 0.16, 0.22], pos: [1.015, 0.88, 0.56], color: "glow", fine: true },
      { shape: "sphere", radius: 0.07, pos: [0.86, 1.22, 0.56], color: "acid" },
    ]),
    ...lean.tourne("rotor_volant", "r:z,90:0.55:0.7", [
      { shape: "torus", radius: 0.28, tube: 0.065, sides: 14, pos: V, color: "steel" },
      ...[0, 60, 120].map((d): Part => ({ shape: "box", size: [0.54, 0.05, 0.07], pos: V, rot: [0, d, 0], color: "rust" })),
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.16, pos: V, color: "copper" },
      { shape: "box", size: [0.1, 0.1, 0.1], pos: [q(V[0] + 0.28), V[1], V[2]], color: "faction" },
    ], V),
  );

  // caisson blindé : toit de plaques sur la bâche, fond, flancs, visière de la cabine
  const armor = annexe(chariot, "asm_armor");
  out.push(
    ...armor.fixe([
      ...[1, -1].map((s): Part => ({ shape: "box", size: [0.66, 0.07, 0.9], pos: [q(s * 0.34), 1.47, -0.72], rot: [0, 0, -s * 15], color: "rust" })),
      { shape: "box", size: [0.2, 0.08, 0.96], pos: [0, 1.57, -0.72], color: "steel" },
      ...[-1.0, -0.72, -0.44].map((z): Part => ({ shape: "box", size: [0.07, 0.03, 0.14], pos: [0.34, 1.52, z], rot: [0, 0, -15], color: "dark", mirror: true, fine: true })),
      { shape: "box", size: [1.4, 0.7, 0.07], pos: [0, 0.96, -1.2], color: "metal" },
      { shape: "box", size: [1.42, 0.08, 0.08], pos: [0, 1.28, -1.2], color: "hazard" },
      // flancs arrière (sous les auvents) et flanc avant droit
      { shape: "box", size: [0.07, 0.4, 0.56], pos: [0.88, 0.92, -0.84], rot: [0, 0, -8], color: "rust", mirror: true },
      ...[0.2, 0.66].map((z): Part => ({ shape: "box", size: [0.08, 0.48, 0.42], pos: [0.84, 0.94, z], rot: [0, 0, 12], color: "metal" })),
      { shape: "box", size: [0.1, 0.08, 0.92], pos: [0.8, 1.2, 0.43], color: "hazard" },
      // cabine : plaque de toit, visière
      { shape: "box", size: [0.66, 0.06, 0.56], pos: [-0.33, 1.14, 0.9], color: "rust" },
      { shape: "box", size: [0.66, 0.12, 0.05], pos: [-0.33, 1.06, 1.2], rot: [-30, 0, 0], color: "metal" },
    ]),
  );
  return out;
}

// ——— Raffinerie ———

/**
 * Raffinerie : haute colonne sous pression à deux étages au flanc droit (« ref_fast ») ou tour de craquage à anneaux
 * de cuivre et cœur ambre (« ref_crack »), couchées vers l'avant sur le chenillard comme les colonnes ; deux
 * échangeurs de cuivre superposés au flanc gauche (« ref_lean ») ou gaines de plaques autour de la cuve et des
 * colonnes (« ref_armor »).
 */
export function annexesRaffinerie(chariot: boolean): Part[] {
  const leve = "r:x,90:0.5:0.82";
  const fast = annexe(chariot, "ref_fast");
  const cx = 0.9;
  const cz = -0.83;
  const H: Vec3 = [cx, 0.75, -0.63];
  const out: Part[] = [
    ...fast.fixe([{ shape: "box", size: [0.44, 0.16, 0.44], pos: [q(cx - 0.02), 0.65, cz], color: "rust" }]),
    ...fast.mobile("colonne3", leve, [
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.36, pos: H, rot: [0, 0, 90], color: "steel", fine: true },
      { shape: "lathe", sides: 12, pos: [cx, 0.75, cz], color: "steel", profile: [[0, 0], [0.2, 0], [0.2, 1.2], [0.13, 1.28]] },
      ...[0.95, 1.25, 1.85].map((y): Part => ({ shape: "cylinder", sides: 8, radius: 0.245, height: 0.07, pos: [cx, y, cz], color: "copper" })),
      { shape: "cylinder", sides: 12, radius: 0.212, height: 0.18, pos: [cx, 1.55, cz], color: "faction" },
    ]),
    ...fast.mobile("colonne4", `${leve}|t:0,-0.75,0:0.82:0.96`, [
      { shape: "lathe", sides: 10, pos: [cx, 1.55, cz], color: "metal", profile: [[0, 0], [0.13, 0], [0.13, 1.35], [0.05, 1.5], [0, 1.5]] },
      { shape: "cylinder", sides: 10, radius: 0.14, height: 0.12, pos: [cx, 2.6, cz], color: "hazard" },
      { shape: "cylinder", sides: 8, radius: 0.175, height: 0.06, pos: [cx, 2.25, cz], color: "copper" },
      { shape: "sphere", radius: 0.07, pos: [cx, 3.1, cz], color: "red" },
    ], H),
  ];

  // tour de craquage : foyer, fût, anneaux de cuivre, tranches ambre, évent
  const crack = annexe(chariot, "ref_crack");
  const tx = 0.96;
  const tz = -0.86;
  out.push(
    ...crack.fixe([
      { shape: "box", size: [0.5, 0.16, 0.5], pos: [q(tx - 0.06), 0.65, tz], color: "rust" },
      { shape: "box", size: [0.3, 0.07, 0.02], pos: [q(tx - 0.06), 0.66, q(tz + 0.255)], color: "amber" },
    ]),
    ...crack.mobile("craquage", leve, [
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.36, pos: [tx, 0.75, -0.63], rot: [0, 0, 90], color: "steel", fine: true },
      { shape: "lathe", sides: 8, pos: [tx, 0.74, tz], color: "dark", profile: [[0.2, 0], [0.14, 0.14], [0.14, 1.35], [0.2, 1.46], [0.08, 1.6], [0.08, 1.8], [0, 1.8]] },
      ...[1.05, 1.38, 1.71, 2.04].map((y): Part => ({ shape: "torus", radius: 0.215, tube: 0.055, sides: 9, pos: [tx, y, tz], color: "copper" })),
      ...[1.215, 1.545, 1.875].map((y): Part => ({ shape: "cylinder", sides: 6, radius: 0.155, height: 0.1, pos: [tx, y, tz], color: "amber" })),
      { shape: "box", size: [0.06, 1.3, 0.06], pos: [q(tx - 0.2), 1.42, q(tz + 0.16)], color: "steel" },
    ]),
  );

  // échangeurs : deux faisceaux de cuivre superposés sur berceaux, brides sombres, coude
  const lean = annexe(chariot, "ref_lean");
  const ex = -0.92;
  const faisceau = (y: number): Part[] => [
    { shape: "cylinder", sides: 10, radius: 0.15, height: 1.2, pos: [ex, y, -0.34], rot: [90, 0, 0], color: "copper" },
    ...[-0.94, -0.34, 0.26].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.185, height: 0.05, pos: [ex, y, z], rot: [90, 0, 0], color: "dark", ...(z === -0.34 ? { fine: true } : {}) })),
  ];
  out.push(
    ...lean.fixe([
      ...faisceau(0.84),
      ...faisceau(1.2),
      ...[-0.72, 0.06].map((z): Part => ({ shape: "box", size: [0.34, 0.62, 0.08], pos: [-0.84, 0.88, z], color: "rust" })),
      { shape: "tube", radius: 0.07, sides: 5, path: [[ex, 0.84, 0.28], [ex, 0.84, 0.46], [ex, 1.2, 0.46], [ex, 1.2, 0.28]], bend: 0.14, color: "copper", fine: true },
      { shape: "tube", radius: 0.05, sides: 4, path: [[ex, 1.3, -0.7], [ex, 1.46, -0.7], [-0.55, 1.46, -0.7], [-0.46, 1.1, -0.7]], bend: 0.12, color: "copper", fine: true },
      { shape: "box", size: [0.06, 0.06, 1.26], pos: [ex, 1.37, -0.34], color: "faction" },
    ]),
  );

  // cuves gainées : plaques autour de la cuve couchée et viroles boulonnées autour des colonnes
  const armor = annexe(chariot, "ref_armor");
  out.push(
    ...armor.fixe([
      { shape: "box", size: [0.07, 0.46, 1.3], pos: [-0.73, 0.82, -0.45], color: "rust" },
      { shape: "box", size: [0.07, 0.4, 1.3], pos: [-0.63, 1.12, -0.45], rot: [0, 0, -42], color: "metal" },
      ...[-0.95, -0.45, 0.05].map((z): Part => ({ shape: "box", size: [0.09, 0.42, 0.08], pos: [-0.64, 1.13, z], rot: [0, 0, -42], color: "hazard" })),
      { shape: "box", size: [0.52, 0.54, 0.06], pos: [-0.42, 0.88, -1.14], color: "rust" },
      { shape: "box", size: [0.5, 0.5, 0.05], pos: [-0.42, 0.86, 0.23], color: "metal" },
      { shape: "box", size: [0.74, 0.36, 0.07], pos: [0.33, 0.74, 1.16], rot: [-18, 0, 0], color: "rust" },
      { shape: "box", size: [0.74, 0.07, 0.08], pos: [0.33, 0.9, 1.11], rot: [-18, 0, 0], color: "hazard" },
    ]),
    ...armor.mobile("gaines", leve, [
      { shape: "cylinder", sides: 8, radius: 0.25, height: 0.84, pos: [0.42, 1.2, -0.82], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.265, height: 0.08, pos: [0.42, 1.58, -0.82], color: "hazard" },
      { shape: "cylinder", sides: 8, radius: 0.24, height: 0.34, pos: [0.42, 2.12, -0.82], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.44, pos: [0.06, 0.99, -0.78], color: "rust" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.26, pos: [0.06, 1.8, -0.78], color: "metal" },
      ...fines([1.0, 1.35].flatMap((y): Part[] => [0.45, -0.45, 1.35].map((t): Part => ({ shape: "box", size: [0.06, 0.06, 0.06], pos: [q(0.42 + 0.24 * Math.sin(t)), y, q(-0.82 + 0.24 * Math.cos(t))], rot: [0, (t * 180) / Math.PI, 0], color: "dark" })))),
    ], [0.25, 0.75, -0.63]),
  );
  return out;
}
