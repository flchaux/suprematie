// Œufs de la Souche (voir sim/src/ponte.rs et docs/spec/races.md, Ponte).
//
// Un œuf est modélisé fermé : une coupe basse (le corps, qui reste au sol) et quatre lèvres pointues qui
// se rejoignent au sommet. Chaque lèvre est une pièce mobile « dep|r:… » articulée sur la collerette ; le
// jeu la rabat vers l'extérieur à l'éclosion (render/entities.ts). Avancement de ces pivots : 1 fermé,
// 0,4 ouvert en tulipe (l'organisme sort), 0 lèvres affaissées et cœur éteint (la coque vide se fane).
//
// Même allure que les œufs décoratifs de la couveuse (souche.ts) : coque sombre, sève vert acide. Le cœur
// lumineux (sève) ne se voit, œuf fermé, que par les fentes entre les lèvres. La couleur du
// joueur est sur la collerette et la nervure de chaque lèvre.
import type { ColorName, Model, Part, Vec3 } from "./types.ts";

const D = Math.PI / 180;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** Point sur un cercle horizontal : angle `a` en degrés (0 : vers +z, 90 : vers +x). */
const pol = (r: number, a: number, y: number): Vec3 => [r3(r * Math.sin(a * D)), r3(y), r3(r * Math.cos(a * D))];

/** Rotation (degrés, ordre XYZ) qui couche l'axe +y d'un cône vers l'angle `a`, incliné de `tilt` sur la verticale. */
function vers(a: number, tilt: number): Vec3 {
  const [dx, dy, dz] = [Math.sin(a * D) * Math.sin(tilt * D), Math.cos(tilt * D), Math.cos(a * D) * Math.sin(tilt * D)];
  return [r3(Math.atan2(dz, dy) / D), 0, r3(-Math.asin(dx) / D)];
}

/** Hauteur de la collerette (charnière des lèvres) et rayon de l'œuf à cette hauteur. */
const COL_Y = 0.44;
const COL_R = 0.375;
/** Profil de l'œuf fermé (rayon, hauteur) : la coupe, de la base à la collerette, puis les lèvres jusqu'à la pointe. */
const COUPE: [number, number][] = [[0, 0], [0.2, 0.03], [0.33, 0.16], [0.38, 0.33], [COL_R, COL_Y]];
const LEVRE: [number, number][] = [[COL_R, COL_Y], [0.335, 0.63], [0.18, 0.89], [0, 1]];
/** Face intérieure d'une paroi : le même profil rentré de `e`, parcouru de haut en bas (faces tournées vers l'axe). */
const dedans = (p: [number, number][], e: number, dy: number): [number, number][] => p.map(([r, y]): [number, number] => [r3(Math.max(0, r - e)), r3(y + dy)]).reverse();

/** Ouverture d'une lèvre (degrés) : en tulipe pour laisser sortir l'organisme, puis affaissée. */
const OUVRE = 72;
const FANE = 34;
/** Largeur d'une lèvre (degrés) : les fentes laissent voir le cœur. */
const ARC = 84;

/**
 * Lèvre centrée sur l'angle `a` (0 : vers +z). Sa première pièce, la charnière, donne l'origine du
 * pivot : la lèvre tourne autour d'elle, vers l'extérieur.
 */
function levre(i: number, a: number, coque: ColorName): Part[] {
  // axe de la charnière (tangent à la collerette) et sens qui rabat la lèvre vers l'extérieur
  const [axe, sens] = ([["x", 1], ["z", -1], ["x", -1], ["z", 1]] as const)[i];
  const nom = `dep|r:${axe},${sens * OUVRE}:0.4:1|r:${axe},${sens * FANE}:0:0.4#levre${i}`;
  const rot: Vec3 = [0, a - ARC / 2, 0];
  return [
    { shape: "box", size: [0.07, 0.07, 0.07], pos: pol(COL_R, a, COL_Y), rot: [0, a, 0], color: "dry", pivot: nom },
    { shape: "lathe", profile: LEVRE, arc: ARC, sides: 6, rot, color: coque, parent: nom },
    { shape: "lathe", profile: dedans(LEVRE, 0.035, -0.015), arc: ARC, sides: 6, rot, color: "rust", parent: nom },
    // nervure à la couleur du joueur, du bas de la lèvre vers la pointe
    { shape: "tube", radius: 0.026, sides: 4, path: LEVRE.slice(0, 3).map(([r, y]) => pol(r + 0.012, a, y + 0.01)), bend: 0, color: "faction", parent: nom },
    // bord luisant : la fente entre deux lèvres
    { shape: "tube", radius: 0.017, sides: 3, path: LEVRE.map(([r, y]) => pol(Math.max(0.02, r - 0.012), a - ARC / 2 - 1, y)), bend: 0, color: "acid", parent: nom, fine: true },
  ];
}

/** Radicelle qui ancre l'œuf au sol. */
const radicelle = (a: number): Part => ({ shape: "tube", radius: 0.032, sides: 4, path: [pol(0.2, a, 0.07), pol(0.36, a + 12, 0.035), pol(0.44, a + 4, -0.03)], bend: 0, color: "wood", fine: true });

/**
 * Œuf. `coque` : couleur de la coque ; `bosses` : pustules sur la coupe (œuf moyen) ; `epines` : épines
 * d'os autour de la collerette (gros œuf cuirassé).
 */
function oeuf(coque: ColorName, bosses: number, epines: number): Model {
  const parts: Part[] = [
    // coupe : paroi et intérieur de chair
    { shape: "lathe", profile: COUPE, sides: 12, color: coque },
    { shape: "lathe", profile: dedans(COUPE, 0.03, 0.02), sides: 12, color: "rust" },
    // collerette à la couleur du joueur
    { shape: "torus", radius: COL_R + 0.008, tube: 0.03, sides: 12, pos: [0, COL_Y, 0], color: "faction" },
    // cœur lumineux : la sève qui nourrit l'organisme ; à l'éclosion elle se retire aussitôt au fond de la
    // coque, là d'où sort l'organisme
    { shape: "sphere", radius: 0.25, detail: 0, smooth: true, pos: [0, 0.36, 0], scale: [1, 1.12, 1], color: "acid", pivot: "dep|t:0,-0.62,0:0.3:0.4#coeur" },
    radicelle(20),
    radicelle(140),
    radicelle(260),
  ];
  for (let k = 0; k < bosses; k++) {
    const a = 30 + (k * 360) / bosses;
    parts.push({ shape: "sphere", radius: 0.05, pos: pol(0.345, a, 0.2 + (k % 2) * 0.1), color: "dry", fine: true });
  }
  for (let k = 0; k < epines; k++) {
    const a = 22.5 + (k * 360) / epines;
    // épine couchée vers l'extérieur et un peu relevée
    parts.push({ shape: "cone", radius: 0.045, height: 0.17, sides: 4, pos: pol(COL_R + 0.05, a, COL_Y - 0.03), rot: vers(a, 70), color: "dry" });
  }
  for (let i = 0; i < 4; i++) parts.push(...levre(i, i * 90, coque));
  return { parts };
}

export const SOUCHE_EGG_MODELS: Record<string, Model> = {
  egg_s: oeuf("leaf_dark", 0, 0),
  egg_m: oeuf("leaf_dark", 6, 0),
  egg_l: oeuf("wood", 0, 8),
};
