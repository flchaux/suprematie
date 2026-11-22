// Bastion (« t_bastion ») et chenillard bastion (« ch_bastion ») : même gréement (voir nomades/foreuse.ts pour
// l'exemple complet). Les pièces sont décrites dans la pose déployée ; avec `chariot`, celles de l'unité, qui
// portent leurs animations de déploiement (pivots « dep|… »).
import type { Part, Vec3 } from "../types.ts";
import { q, coffre, chariotNomade } from "./commun.ts";

type Axe = "x" | "y" | "z";
function tourne(a: Axe, deg: number, v: Vec3): Vec3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [x, y, z] = v;
  if (a === "x") return [x, y * c - z * s, y * s + z * c];
  if (a === "y") return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}
/** Décalage (repère déployé) qui, après les rotations du pivot (dans l'ordre du nom), donne le décalage `d`. */
function decal(rs: [Axe, number][], d: Vec3): string {
  let v = d;
  for (const [a, g] of rs) v = tourne(a, -g, v);
  return v.map(q).join(",");
}

/** Hauteur de la couronne de la tourelle (pose déployée), de l'axe des tourillons, et course de la colonne. */
const TY = 1.07;
const AY = 1.3;
const LEVE = 0.3;
/** Pointage du fût en position de route (sous l'horizontale, vers l'arrière). */
const ROUTE = 10;

/** Contour à pans de la tourelle (x, z), à extruder verticalement. */
const PANS: [number, number][] = [[-0.46, -0.58], [0.46, -0.58], [0.54, -0.1], [0.4, 0.42], [-0.4, 0.42], [-0.54, -0.1]];

/**
 * Bastion : chariot à chenilles portant une tourelle lourde à pans sur une colonne télescopique (couronne fixe
 * sur le plateau), canon cinétique à long fût cerclé de bobines de cuivre, frein de bouche, caisse de munitions,
 * tourelleau ; jupes de blindage rouille le long du plateau, verrou de route à l'arrière, caisses. Avec `chariot`
 * (chenillard bastion), tourelle et canon sont en position de route (tourelle basse, tournée vers l'arrière, fût
 * posé sur le verrou), et chaque pièce mobile porte son animation de déploiement :
 * - 0,08 → 0,48 : stabilisateurs (châssis commun) ;
 * - 0,5 → 0,62 : la colonne lève la tourelle (le fût quitte le verrou) ;
 * - 0,62 → 0,74 : le fût se relève à l'horizontale ;
 * - 0,74 → 1 : la tourelle pivote de 180° et pointe le canon vers l'avant.
 * Sans `chariot`, la tourelle et le canon forment le pivot « tourelle » (origine sur l'axe de rotation), qui vise.
 */
export function bastionNomade(chariot: boolean): Part[] {
  const dep = (steps: string, nom: string): Partial<Part> => (chariot ? { pivot: `dep|${steps}#${nom}` } : {});
  const p: Part[] = [
    ...chariotNomade(chariot),
    // couronne fixe sur le plateau
    { shape: "cylinder", sides: 10, radius: 0.44, height: 0.2, pos: [0, 0.675, 0], color: "dark" },
    // jupes de blindage rouille le long du plateau (bande d'équipe), glacis à l'avant droit
    { shape: "box", size: [0.05, 0.26, 1.7], pos: [0.68, 0.7, -0.25], rot: [0, 0, -15], color: "rust", mirror: true },
    { shape: "box", size: [0.055, 0.05, 1.5], pos: [0.71, 0.8, -0.25], rot: [0, 0, -15], color: "faction", mirror: true, fine: true },
    { shape: "box", size: [0.6, 0.24, 0.05], pos: [0.36, 0.69, 1.08], rot: [-20, 0, 0], color: "rust" },
    // caisses de munitions sanglées à l'arrière
    ...[...coffre([0.46, 0.68, -0.98], [0.3, 0.2, 0.36], "wood"), ...coffre([-0.46, 0.68, -0.98], [0.3, 0.2, 0.36], "rust")].map((c): Part => ({ ...c, fine: true })),
  ];
  // verrou de route : chevalet sous le fût couché (arrière)
  const vz = -0.965;
  const vy = q(AY - LEVE - Math.tan((ROUTE * Math.PI) / 180) * -vz - 0.075);
  p.push(
    ...[1, -1].map((s): Part => ({ shape: "tube", radius: 0.022, sides: 4, path: [[q(s * 0.2), 0.575, vz], [q(s * 0.08), q(vy - 0.02), vz]], color: "rust", fine: true })),
    { shape: "box", size: [0.24, 0.04, 0.08], pos: [0, q(vy - 0.02), vz], color: "hazard" },
    ...[1, -1].map((s): Part => ({ shape: "box", size: [0.03, 0.1, 0.06], pos: [q(s * 0.1), q(vy + 0.03), vz], color: "dark", fine: true })),
  );
  // colonne télescopique (fixe dans le bâtiment) : rentrée dans la couronne et le châssis sur le chariot
  p.push({ shape: "cylinder", sides: 10, radius: 0.36, height: 0.44, pos: [0, 0.805, 0], color: "steel", ...dep(`t:0,${-LEVE},0:0.5:0.62`, "colonne") });
  // ——— tourelle (pivot « tourelle » du bâtiment, origine sur son axe : la couronne d'abord) ———
  const tour = chariot ? dep(`r:y,180:0.74:1|t:0,${-LEVE},0:0.5:0.62`, "tourelle") : { pivot: "tourelle" };
  p.push(
    { shape: "cylinder", sides: 12, radius: 0.52, height: 0.1, pos: [0, TY, 0], color: "steel", ...tour },
    { shape: "extrude", profile: PANS, depth: 0.4, bevel: 0.04, pos: [0, 1.32, 0], rot: [90, 0, 0], color: "metal", ...tour },
    { shape: "extrude", profile: PANS, depth: 0.03, pos: [0, 1.535, -0.04], rot: [90, 0, 0], scale: [0.8, 0.8, 1], color: "faction", ...tour },
    { shape: "box", size: [0.05, 0.22, 0.75], pos: [0.57, 1.28, -0.12], rot: [0, 0, -10], color: "rust", mirror: true, fine: true, ...tour },
    // caisse de munitions arrière (côté gauche : elle passe à droite de la cabine en position de route)
    { shape: "box", size: [0.36, 0.26, 0.24], pos: [-0.17, 1.3, -0.7], color: "wood", ...tour },
    { shape: "box", size: [0.37, 0.27, 0.035], pos: [-0.17, 1.3, -0.7], color: "black", fine: true, ...tour },
    // tourelleau à épiscope, antenne
    { shape: "cylinder", sides: 6, radius: 0.12, height: 0.12, pos: [-0.2, 1.6, -0.18], color: "dark", ...tour },
    { shape: "box", size: [0.12, 0.035, 0.02], pos: [-0.2, 1.62, -0.06], color: "amber", fine: true, ...tour },
    { shape: "tube", radius: 0.01, sides: 4, path: [[0.3, 1.53, -0.42], [0.3, 2.0, -0.46]], color: "steel", fine: true, ...tour },
    { shape: "sphere", radius: 0.025, pos: [0.3, 2.01, -0.46], color: "amber", fine: true, ...tour },
  );
  // ——— canon cinétique : tourillons sur l'axe de la tourelle (en route, le fût pointe sous l'horizontale) ———
  // m = Ry(180) · Rx(ROUTE) · décalage : le décalage, dans le repère déployé, redonne la levée verticale
  const canon = chariot
    ? dep(`r:y,180:0.74:1|r:x,${ROUTE}:0.62:0.74|t:${decal([["y", 180], ["x", ROUTE]], [0, -LEVE, 0])}:0.5:0.62`, "canon")
    : { pivot: "tourelle" };
  const A: Vec3 = [0, AY, 0];
  const z = (d: number): Vec3 => [0, AY, d];
  if (chariot) p.push({ shape: "box", size: [0.03, 0.03, 0.03], pos: A, color: "dark", ...canon });
  p.push(
    { shape: "box", size: [0.36, 0.28, 0.16], pos: z(0.48), color: "steel", ...canon },
    { shape: "cylinder", sides: 10, radius: 0.11, height: 0.35, pos: z(0.72), rot: [90, 0, 0], color: "dark", ...canon },
    { shape: "cylinder", sides: 10, radius: 0.07, radiusTop: 0.06, height: 0.9, pos: z(1.0), rot: [90, 0, 0], color: "steel", ...canon },
    ...[1.1, 1.22, 1.34].map((d): Part => ({ shape: "torus", radius: 0.075, tube: 0.018, sides: 8, pos: z(d), rot: [90, 0, 0], color: "copper", fine: true, ...canon })),
    { shape: "cylinder", sides: 6, radius: 0.095, height: 0.12, pos: z(1.45), rot: [90, 0, 0], color: "dark", ...canon },
    { shape: "box", size: [0.24, 0.05, 0.08], pos: z(1.45), color: "faction", fine: true, ...canon },
  );
  return p;
}
