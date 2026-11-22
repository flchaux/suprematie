// Atelier (« t_workshop », 3 × 3) et chenillard atelier (« ch_workshop ») : même gréement (voir
// nomades/foreuse.ts pour l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`,
// celles de l'unité, qui portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, voute, arceau, chariotNomade } from "./commun.ts";
import type { C } from "./commun.ts";

/** Charnière de la rampe (bord avant du plateau, à droite de la cabine), largeur, longueur et pente. */
const RX = 0.34;
const RY = 0.62;
const RZ = 1.6;
const RW = 1.1;
const RL = 0.85;
const PENTE = 45;

/**
 * Coque de la tente-hangar télescopique : voûte de toile (axe z) de demi-largeur rx, de hauteur ry et de longueur l
 * centrée en z, posée sur le plateau, bande d'équipe pleine (sa partie cachée est dans la toile) et arceaux d'acier
 * aux deux bouts (pièces fines).
 */
function coque(z: number, rx: number, ry: number, l: number, color: C, g: Partial<Part>): Part[] {
  const y = 0.575;
  return [
    { shape: "extrude", profile: voute(rx, ry, 7), depth: l, pos: [0, y, z], color, ...g },
    { shape: "extrude", profile: voute(q(rx + 0.03), q(ry + 0.03), 7), depth: 0.13, pos: [0, y, q(z + 0.06)], color: "faction", ...g },
    ...[1, -1].map((s): Part => ({ shape: "extrude", profile: arceau(q(rx + 0.012), q(ry + 0.012), 0.03, 7), depth: 0.035, pos: [0, y, q(z + (s * (l - 0.035)) / 2)], color: "metal", fine: true, ...g })),
  ];
}

/**
 * Atelier : grand chariot à chenilles (châssis de 3,3) portant une tente-hangar télescopique de toile sur arceaux
 * (trois coques emboîtées, bandes d'équipe, gueule sombre à l'avant), une rampe d'acier rayée qui descend jusqu'au
 * sol à l'avant droit (les unités sortent par là), une cheminée sur le toit et, à l'abri de la tente, un tour et des
 * caisses sanglées. Avec `chariot` (chenillard atelier), chaque pièce mobile porte son animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,7 : la rampe, rabattue à plat sur l'avant du plateau, bascule par-dessus sa charnière jusqu'au sol ;
 * - 0,66 → 0,9 : les deux coques avant de la tente, rentrées dans la coque arrière, coulissent vers l'avant ;
 * - 0,86 → 1 : la cheminée, couchée sur le toit, se dresse.
 */
export function atelierNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const p: Part[] = [
    ...chariotNomade(chariot, { l: 3.3, w: 1.5 }),
    // ——— tente-hangar : coque arrière fixe, deux coques qui en sortent vers l'avant ———
    ...coque(-1.11, 0.9, 1.05, 0.9, "dry", {}),
    ...coque(-0.26, 0.84, 0.99, 0.86, "wood", dep("t:0,0,-0.85:0.66:0.84", "coque2")),
  ];
  const c3 = dep("t:0,0,-1.68:0.66:0.9", "coque3");
  p.push(
    ...coque(0.54, 0.78, 0.93, 0.8, "dry", c3),
    // gueule sombre, bande d'équipe au-dessus, feux de gabarit
    { shape: "extrude", profile: voute(0.6, 0.74, 6), depth: 0.02, pos: [0, 0.575, 0.945], color: "black", ...c3 },
    { shape: "box", size: [0.9, 0.06, 0.015], pos: [0, 1.39, 0.947], color: "faction", fine: true, ...c3 },
    { shape: "box", size: [0.08, 0.06, 0.02], pos: [0.66, 1.0, 0.95], color: "amber", fine: true, ...c3 },
    { shape: "box", size: [0.08, 0.06, 0.02], pos: [-0.66, 1.0, 0.95], color: "amber", fine: true, ...c3 },
  );
  // ——— sous la tente : tour, caisses sanglées, bouteilles (visibles sur le chariot replié) ———
  p.push(
    { shape: "box", size: [0.5, 0.34, 0.7], pos: [-0.38, 0.745, -0.2], color: "dark", fine: true },
    { shape: "cylinder", sides: 8, radius: 0.09, height: 0.5, pos: [-0.38, 1.0, -0.2], rot: [90, 0, 0], color: "steel", fine: true },
    { shape: "box", size: [0.16, 0.14, 0.14], pos: [-0.38, 0.99, 0.12], color: "faction", fine: true },
    ...coffre([0.42, 0.71, -0.3], [0.5, 0.27, 0.5], "wood"),
    ...coffre([0.36, 0.71, 0.35], [0.42, 0.27, 0.4], "rust").map((c): Part => ({ ...c, fine: true })),
    ...[-0.62, -0.46].map((x): Part => ({ shape: "cylinder", sides: 8, radius: 0.065, height: 0.48, pos: [x, 0.815, 0.38], color: "copper", fine: true })),
  );
  // ——— rampe : charnière au bord avant du plateau ; sur le chariot, rabattue à plat vers l'arrière ———
  const lip: Part = { shape: "box", size: [RW, 0.05, 0.08], pos: [RX, 0.575, 1.575], color: "steel", fine: true };
  const a = (PENTE * Math.PI) / 180;
  const dir: Vec3 = [0, -Math.sin(a), Math.cos(a)];
  const nrm: Vec3 = [0, Math.cos(a), Math.sin(a)];
  const at = (d: number, h: number): Vec3 => [RX, q(RY + dir[1] * d + nrm[1] * h), q(RZ + dir[2] * d + nrm[2] * h)];
  const r = dep(`r:x,${-(180 + PENTE)}:0.5:0.7`, "rampe");
  p.push(
    lip,
    { shape: "box", size: [RW, 0.05, 0.05], pos: [RX, RY, RZ], color: "steel", ...r },
    { shape: "box", size: [RW, 0.05, RL], pos: at(RL / 2, 0), rot: [PENTE, 0, 0], color: "metal", ...r },
    ...[0.16, 0.34, 0.52, 0.7].map((d): Part => ({ shape: "box", size: [q(RW - 0.08), 0.012, 0.06], pos: at(d, 0.031), rot: [PENTE, 0, 0], color: "hazard", fine: true, ...r })),
    ...[1, -1].map((s): Part => ({ shape: "box", size: [0.06, 0.07, 0.62], pos: [q(RX + s * (RW / 2 - 0.05)), at(0.36, -0.06)[1], at(0.36, -0.06)[2]], rot: [PENTE, 0, 0], color: "rust", fine: true, ...r })),
    { shape: "box", size: [RW, 0.02, 0.08], pos: at(q(RL - 0.04), 0.03), rot: [PENTE, 0, 0], color: "faction", fine: true, ...r },
  );
  // ——— cheminée sur le toit (arrière gauche) : couchée vers l'avant sur le chariot ———
  const CX = -0.5;
  const CZ = -1.3;
  const CY = 1.54;
  const ch = dep("r:x,90:0.86:1", "cheminee");
  p.push(
    { shape: "box", size: [0.16, 0.14, 0.16], pos: [CX, 1.47, CZ], color: "dark" },
    { shape: "box", size: [0.18, 0.06, 0.06], pos: [CX, CY, CZ], color: "steel", ...ch },
    { shape: "lathe", sides: 8, pos: [CX, CY, CZ], color: "dark", profile: [[0.085, 0], [0.07, 0.08], [0.07, 0.74], [0.09, 0.8], [0, 0.8]], ...ch },
    { shape: "cylinder", sides: 6, radius: 0.12, radiusTop: 0.02, height: 0.06, pos: [CX, q(CY + 0.86), CZ], color: "rust", fine: true, ...ch },
  );
  return p;
}
