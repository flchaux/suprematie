// Assembleur nomade (« t_assembler ») et chenillard assembleur (« ch_assembler ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, voute, chariotNomade } from "./commun.ts";

/** Plateau tournant du bras (avant droit, sur le plateau du chariot). */
export const TOURELLE: Vec3 = [0.32, 0.575, 0.55];
/** Axe de l'épaule (axe x), longueurs du bras et de l'avant-bras, et leurs angles déployés (degrés, depuis +z vers +y). */
const EPAULE: Vec3 = [0.32, 0.84, 0.55];
const L_BRAS = 0.75;
const L_AVANT = 0.55;
const A_BRAS = 100;
const A_AVANT = -30;
/** Repli : l'épaule couche le bras vers l'arrière, le coude rabat l'avant-bras sur le bras. */
const R_EPAULE = -80;
const R_COUDE = 40;
/** Établi sous bâche (arrière) : demi-largeur, avant, arrière, hauteur de l'avant-toit. */
const EX = 0.6;
const EZ0 = -0.32;
const EZ1 = -1.12;
const EY = 1.25;

const rad = (a: number) => (a * Math.PI) / 180;

/**
 * Assembleur nomade : chariot à chenilles (cabine à l'avant gauche), bras articulé sur plateau tournant (épaule,
 * bras d'équipe, coude, avant-bras d'acier, pince) à l'avant droit, établi de bois sous une bâche à arceaux à
 * l'arrière (panneau d'outils, étau, armoire), dont les trois panneaux de toile se relèvent en auvents, bac de
 * pièces. Avec `chariot` (chenillard assembleur), les pièces mobiles portent leur animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,72 : le bras, couché vers l'arrière sur le chariot, se relève (épaule, -80° autour de x) ;
 * - 0,6 → 0,8 : les panneaux latéraux de la bâche, tombés le long de l'établi, se relèvent en auvents ;
 * - 0,72 → 0,88 : l'avant-bras, rabattu sur le bras, se déplie (coude) ;
 * - 0,75 → 0,95 : le panneau avant se relève en auvent au-dessus de l'établi.
 * Sans `chariot`, tout le bras (plateau tournant compris) est le pivot « bras », qui tourne au travail.
 */
export function assembleurNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const bras: Partial<Part> = chariot ? {} : { pivot: "bras" };
  const [tx, ty, tz] = TOURELLE;
  const [sx, sy, sz] = EPAULE;
  const p: Part[] = [
    ...chariotNomade(chariot),
    // bac de pièces sanglé (gauche, derrière la cabine), plateau de pièces, tôles
    ...coffre([-0.38, 0.69, 0.3], [0.44, 0.22, 0.4], "rust"),
    { shape: "box", size: [0.38, 0.03, 0.34], pos: [-0.38, 0.81, 0.3], color: "steel", fine: true },
    { shape: "box", size: [0.3, 0.06, 0.2], pos: [-0.36, 0.61, -0.12], color: "metal", fine: true },
  ];

  // ——— établi sous bâche : poteaux, toit de toile à arceaux, faîte d'équipe, panneau d'outils, établi ———
  p.push(
    ...[EZ0, EZ1].flatMap((z): Part[] => [EX, -EX].map((x): Part => ({ shape: "box", size: [0.05, q(EY - 0.575), 0.05], pos: [x, q((EY + 0.575) / 2), z], color: "wood", ...(z === EZ1 ? { fine: true } : {}) }))),
    { shape: "extrude", profile: voute(0.64, 0.2, 6), depth: q(EZ0 - EZ1 + 0.06), pos: [0, EY, q((EZ0 + EZ1) / 2)], color: "dry" },
    { shape: "box", size: [0.1, 0.02, q(EZ0 - EZ1 + 0.08)], pos: [0, q(EY + 0.2), q((EZ0 + EZ1) / 2)], color: "faction" },
    { shape: "extrude", profile: voute(0.655, 0.215, 6), depth: 0.035, pos: [0, EY, q(EZ0 - 0.01)], color: "metal", fine: true },
    // panneau d'outils (fond), outils accrochés
    { shape: "box", size: [q(2 * EX), q(EY - 0.6), 0.03], pos: [0, q((EY + 0.6) / 2), q(EZ1 + 0.01)], color: "metal" },
    ...[-0.4, -0.15, 0.1, 0.35].map((x): Part => ({ shape: "box", size: [0.03, 0.18, 0.02], pos: [x, 1.08, q(EZ1 + 0.035)], color: "steel", fine: true })),
    // établi : armoire sombre, plateau de bois, étau, pièces
    { shape: "box", size: [1.0, 0.24, 0.3], pos: [0, 0.7, -0.82], color: "dark" },
    { shape: "box", size: [1.08, 0.05, 0.4], pos: [0, 0.845, -0.8], color: "wood" },
    { shape: "box", size: [0.14, 0.1, 0.1], pos: [0.3, 0.92, -0.72], color: "steel", fine: true },
    { shape: "box", size: [0.2, 0.06, 0.14], pos: [-0.2, 0.9, -0.82], color: "rust", fine: true },
    { shape: "cylinder", sides: 8, radius: 0.05, height: 0.12, pos: [-0.42, 0.93, -0.75], color: "copper", fine: true },
  );
  // panneaux de toile : tombés le long de l'établi sur le chariot, relevés en auvents (pente de 10°) ensuite
  const LP = 0.5; // largeur des panneaux latéraux
  for (const s of [1, -1]) {
    const c: Vec3 = [q(s * (EX + 0.02 + (LP / 2) * Math.cos(rad(10)))), q(EY - (LP / 2) * Math.sin(rad(10))), q((EZ0 + EZ1) / 2)];
    const pan = dep(`r:z,${-s * 80}:0.6:0.8`, s > 0 ? "pan_d" : "pan_g");
    p.push(
      // charnière (origine du pivot), toile, bande d'équipe au bord
      { shape: "box", size: [0.04, 0.04, q(EZ0 - EZ1)], pos: [q(s * (EX + 0.02)), EY, c[2]], color: "metal", ...pan },
      { shape: "box", size: [LP, 0.02, q(EZ0 - EZ1)], pos: c, rot: [0, 0, -s * 10], color: "dry", ...pan },
      { shape: "box", size: [0.08, 0.025, q(EZ0 - EZ1 + 0.01)], pos: [q(s * (EX + 0.02 + (LP - 0.06) * Math.cos(rad(10)))), q(EY - (LP - 0.06) * Math.sin(rad(10))), c[2]], rot: [0, 0, -s * 10], color: "faction", fine: true, ...pan },
    );
  }
  const LA = 0.4; // profondeur de l'auvent avant
  const av = dep("r:x,80:0.75:0.95", "auvent");
  p.push(
    { shape: "box", size: [q(2 * EX + 0.04), 0.04, 0.04], pos: [0, EY, q(EZ0 + 0.02)], color: "metal", ...av },
    { shape: "box", size: [q(2 * EX + 0.04), 0.02, LA], pos: [0, q(EY - (LA / 2) * Math.sin(rad(10))), q(EZ0 + 0.02 + (LA / 2) * Math.cos(rad(10)))], rot: [10, 0, 0], color: "rust", ...av },
    { shape: "box", size: [q(2 * EX + 0.05), 0.025, 0.08], pos: [0, q(EY - (LA - 0.06) * Math.sin(rad(10))), q(EZ0 + 0.02 + (LA - 0.06) * Math.cos(rad(10)))], rot: [10, 0, 0], color: "faction", ...av },
  );

  // ——— bras articulé : plateau tournant, socle de l'épaule (fixes sur le chariot) ———
  p.push(
    { shape: "cylinder", sides: 12, radius: 0.22, height: 0.08, pos: [tx, q(ty + 0.04), tz], color: "steel", ...bras },
    { shape: "box", size: [0.18, 0.2, 0.26], pos: [0.27, q(ty + 0.18), sz], color: "dark", ...bras },
    { shape: "box", size: [0.04, 0.05, 0.2], pos: [q(tx + 0.17), q(ty + 0.1), tz], color: "hazard", fine: true, ...bras },
  );
  // bras (épaule en EPAULE) : décrits par rapport à l'épaule, qui est l'origine des pivots
  const e: Vec3 = [0, q(L_BRAS * Math.sin(rad(A_BRAS))), q(L_BRAS * Math.cos(rad(A_BRAS)))];
  const w: Vec3 = [0, q(e[1] + L_AVANT * Math.sin(rad(A_AVANT))), q(e[2] + L_AVANT * Math.cos(rad(A_AVANT)))];
  const ep = dep(`r:x,${R_EPAULE}:0.5:0.72`, "epaule");
  const b1 = chariot ? ep : bras;
  p.push(
    { shape: "tube", radius: 0.08, sides: 4, pos: EPAULE, path: [[-0.05, 0, 0], [-0.05, e[1], e[2]]], color: "faction", ...b1 },
    { shape: "cylinder", sides: 8, radius: 0.07, height: 0.3, pos: [q(sx - 0.02), sy, sz], rot: [0, 0, 90], color: "steel", fine: true, ...b1 },
    { shape: "cylinder", sides: 8, radius: 0.06, height: 0.24, pos: [q(sx + 0.02), q(sy + e[1]), q(sz + e[2])], rot: [0, 0, 90], color: "steel", ...b1 },
    { shape: "tube", radius: 0.014, sides: 4, pos: EPAULE, path: [[0.04, -0.02, 0.06], [0.04, q(e[1] - 0.06), q(e[2] + 0.06)]], color: "copper", fine: true, ...b1 },
  );
  // avant-bras : coude rabattu (rotation autour du coude, rendue autour de l'épaule plus un décalage)
  const c = Math.cos(rad(R_COUDE));
  const s = Math.sin(rad(R_COUDE));
  // décalage t = R⁻¹·e − e (R : rotation du coude autour de x)
  const dy = q(e[1] * c + e[2] * s - e[1]);
  const dz = q(-e[1] * s + e[2] * c - e[2]);
  const ab = dep(`r:x,${R_EPAULE}:0.5:0.72|r:x,${R_COUDE}:0.72:0.88|t:0,${dy},${dz}:0.72:0.88`, "avant_bras");
  const b2 = chariot ? ab : bras;
  const W: Vec3 = [q(sx + 0.1), q(sy + w[1]), q(sz + w[2])];
  p.push(
    { shape: "tube", radius: 0.055, sides: 4, pos: EPAULE, path: [[0.1, e[1], e[2]], [0.1, w[1], w[2]]], color: "steel", ...b2 },
    { shape: "box", size: [0.13, 0.12, 0.12], pos: W, rot: [A_AVANT, 0, 0], color: "dark", ...b2 },
    { shape: "box", size: [0.025, 0.16, 0.04], pos: [q(W[0] + 0.045), q(W[1] - 0.12), W[2]], color: "steel", fine: true, ...b2 },
    { shape: "box", size: [0.025, 0.16, 0.04], pos: [q(W[0] - 0.045), q(W[1] - 0.12), W[2]], color: "steel", fine: true, ...b2 },
    { shape: "box", size: [0.05, 0.03, 0.02], pos: [W[0], q(W[1] + 0.03), q(W[2] + 0.055)], color: "amber", fine: true, ...b2 },
  );
  return p;
}
