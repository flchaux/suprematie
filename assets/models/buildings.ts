// Descriptions des bâtiments. Clé = clé du bâtiment dans les données du jeu (sim/src/data.rs).
// Le modèle est redimensionné pour couvrir son emprise au sol (w x h cases) ; +z = avant (sortie).
// Style (comme les unités refaites) : volumes à arêtes chanfreinées (bevel), blindage clair et acier,
// couleur d'équipe sur le dessus (toits, bandeaux), filets cyan (glow) et voyants ambre.
import type { Model, Part, Vec3 } from "./types.ts";

/** Socle chanfreiné de w x d cases (dessus à y = 0.25), sans dépasser de l'emprise. 88 triangles. */
function socle(w: number, d = w): Part[] {
  return [
    { shape: "bevel", size: [w, 0.16, d], pos: [0, 0.08, 0], bevel: 0.06, color: "dark" },
    { shape: "bevel", size: [w - 0.16, 0.1, d - 0.16], pos: [0, 0.2, 0], bevel: 0.04, color: "metal" },
  ];
}

/**
 * Contour d'une voûte en demi-ellipse (largeur 2 x rx, hauteur ry) posée sur y = 0, à extruder : pleine
 * si `ep` = 0, sinon arc d'épaisseur `ep` (nervure).
 */
function arc(rx: number, ry: number, ep: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  if (ep <= 0) return out;
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * Math.PI;
    out.push([Math.cos(a) * (rx - ep), Math.sin(a) * (ry - ep)]);
  }
  return out;
}

/** Filets lumineux sur le chant du socle : avant et côtés (48 triangles), ou avant seul (24). */
function filets(w: number, d = w, cotes = true): Part[] {
  const l = Math.min(w, d) * 0.28;
  const out: Part[] = [{ shape: "box", size: [l, 0.04, 0.03], pos: [w * 0.27, 0.09, d / 2 - 0.016], color: "glow", mirror: true }];
  if (cotes) out.push({ shape: "box", size: [0.03, 0.04, l], pos: [w / 2 - 0.016, 0.09, -d * 0.2], color: "glow", mirror: true });
  return out;
}

/** Tapis roulant étroit (0,62 case, au plus 100 triangles) : surface plate, rebords clairs, flèche de sens. */
function tapis(surface: Part["color"], fleche: Part["color"], filet: Part["color"], lf: number): Model {
  return {
    parts: [
      { shape: "box", size: [0.62, 0.06, 1], pos: [0, 0.03, 0], color: "dark" },
      { shape: "box", size: [0.5, 0.03, 0.98], pos: [0, 0.075, 0], color: surface },
      { shape: "box", size: [0.06, 0.12, 1], pos: [0.28, 0.06, 0], color: "light", mirror: true },
      { shape: "box", size: [0.03, 0.02, lf], pos: [0.28, 0.13, 0], color: filet, mirror: true },
      { shape: "wedge", size: [0.03, 0.2, 0.26], pos: [0.1, 0.1, 0.02], color: fleche, rot: [0, 0, -90], mirror: true },
    ],
  };
}

/**
 * Tapis droit rejoint par le côté (jonction en T) : le rebord s'ouvre du côté de l'arrivée (-x pour
 * `g`, +x pour `d`, les deux), et une languette de tapis bordée prolonge la surface jusqu'au bord de la
 * case, à la rencontre du tapis qui arrive.
 */
function tapisJonction(surface: Part["color"], fleche: Part["color"], filet: Part["color"], lf: number, cotes: (-1 | 1)[]): Model {
  const parts: Part[] = [
    { shape: "box", size: [0.62, 0.06, 1], pos: [0, 0.03, 0], color: "dark" },
    { shape: "box", size: [0.5, 0.03, 0.98], pos: [0, 0.075, 0], color: surface },
    { shape: "wedge", size: [0.03, 0.2, 0.26], pos: [0.1, 0.1, 0.02], color: fleche, rot: [0, 0, -90], mirror: true },
  ];
  for (const sx of [-1, 1] as const) {
    if (!cotes.includes(sx)) {
      parts.push(
        { shape: "box", size: [0.06, 0.12, 1], pos: [sx * 0.28, 0.06, 0], color: "light" },
        { shape: "box", size: [0.03, 0.02, lf], pos: [sx * 0.28, 0.13, 0], color: filet },
      );
      continue;
    }
    // rebord coupé : deux montants de part et d'autre de l'ouverture
    parts.push(
      { shape: "box", size: [0.06, 0.12, 0.19], pos: [sx * 0.28, 0.06, 0.405], color: "light" },
      { shape: "box", size: [0.06, 0.12, 0.19], pos: [sx * 0.28, 0.06, -0.405], color: "light" },
      // languette : socle, surface et rebords dans le prolongement du tapis qui arrive
      { shape: "box", size: [0.2, 0.06, 0.62], pos: [sx * 0.405, 0.03, 0], color: "dark" },
      { shape: "box", size: [0.26, 0.03, 0.5], pos: [sx * 0.375, 0.075, 0], color: surface },
      { shape: "box", size: [0.25, 0.12, 0.06], pos: [sx * 0.375, 0.06, 0.28], color: "light" },
      { shape: "box", size: [0.25, 0.12, 0.06], pos: [sx * 0.375, 0.06, -0.28], color: "light" },
      { shape: "box", size: [0.2, 0.02, 0.03], pos: [sx * 0.39, 0.13, 0.28], color: filet },
      { shape: "box", size: [0.2, 0.02, 0.03], pos: [sx * 0.39, 0.13, -0.28], color: filet },
    );
  }
  return { parts };
}

/**
 * Tapis en virage : quart de cercle de rayon 1/2 case centré sur le coin d'entrée, en 6 segments.
 * Les objets entrent par le côté (côté gauche du modèle si `side` = -1, droit si +1) et sortent vers +z,
 * comme sur un tapis droit. Tapis étroit (0,62 case) bordé de rebords intérieur et extérieur.
 */
function tapisVirage(surface: Part["color"], fleche: Part["color"], filet: Part["color"], side: -1 | 1): Model {
  const parts: Part[] = [];
  const n = 6;
  const cx = side * 0.5; // coin (centre du quart de cercle), côté entrée, bord de sortie
  const cz = 0.5;
  const r = (k: number) => Math.round(k * 1000) / 1000;
  for (let i = 0; i < n; i++) {
    // angle depuis le coin : de l'entrée (vers -z) à la sortie (vers le côté opposé à l'entrée)
    const phi = (-90 + ((i + 0.5) * 90) / n) * (Math.PI / 180);
    const ux = -side * Math.cos(phi);
    const uz = Math.sin(phi);
    // tangente (sens de marche) : rotation autour de y qui aligne +z sur la tangente
    const yaw = Math.round((Math.atan2(-side * -Math.sin(phi), Math.cos(phi)) * 180) / Math.PI);
    const at = (rad: number, y: number): [number, number, number] => [r(cx + ux * rad), y, r(cz + uz * rad)];
    parts.push(
      { shape: "box", size: [0.62, 0.06, 0.24], pos: at(0.5, 0.03), rot: [0, yaw, 0], color: "dark" },
      { shape: "box", size: [0.5, 0.03, 0.21], pos: at(0.5, 0.075), rot: [0, yaw, 0], color: i === 2 || i === 3 ? fleche : surface },
      { shape: "box", size: [0.06, 0.12, 0.23], pos: at(0.78, 0.06), rot: [0, yaw, 0], color: "light" },
      { shape: "box", size: [0.03, 0.02, 0.17], pos: at(0.78, 0.13), rot: [0, yaw, 0], color: filet },
      { shape: "box", size: [0.06, 0.12, 0.07], pos: at(0.22, 0.06), rot: [0, yaw, 0], color: "light" },
    );
  }
  return { parts };
}

/** Caisson commun des assembleurs (3 x 3) : coins blindés clairs, cadre supérieur aux couleurs de l'équipe. */
function assembleur(): Part[] {
  return [
    ...socle(3),
    ...filets(3),
    { shape: "bevel", size: [2.7,0.72,2.7], pos: [0,0.6,0], color: "dark" },
    { shape: "bevel", size: [0.62,0.92,0.62], pos: [1.1,0.7,1.1], color: "light", mirror: true },
    { shape: "bevel", size: [0.62,0.92,0.62], pos: [1.1,0.7,-1.1], color: "light", mirror: true },
    { shape: "bevel", size: [1.0,0.42,0.1], pos: [0,0.52,1.35], bevel: 0.03, color: "black" },
    { shape: "box", size: [0.9,0.04,0.03], pos: [0,0.83,1.36], color: "glow" },
    { shape: "box", size: [0.1,0.06,0.03], pos: [0.62,0.5,1.36], color: "amber", mirror: true },
    { shape: "box", size: [0.04,0.36,1.0], pos: [1.35,0.6,0], color: "metal", mirror: true },
    { shape: "box", size: [0.03,0.04,0.8], pos: [1.37,0.86,0], color: "glow", mirror: true },
    { shape: "bevel", size: [2.4,0.16,0.4], pos: [0,1.04,1.05], color: "faction" },
    { shape: "bevel", size: [2.4,0.16,0.4], pos: [0,1.04,-1.05], color: "faction" },
    { shape: "bevel", size: [0.4,0.16,1.7], pos: [1.05,1.04,0], color: "faction", mirror: true },
    { shape: "box", size: [1.8,0.04,1.8], pos: [0,0.97,0], color: "metal" },
  ];
}

/**
 * Bras robotisé posé dans le caisson ; avec `pivot`, c'est le bras animé « bras ».
 * `yaw` : direction du bras en degrés (0 = vers l'avant, +z ; 90 = vers +x), `reach` : longueur relative,
 * `lift` : surélévation du socle (posé sur un pilier d'angle).
 */
function brasRobot(x: number, z: number, pivot: boolean, o: { yaw?: number; reach?: number; lift?: number } = {}): Part[] {
  const p = pivot ? { parent: "bras" } : {};
  const yaw = ((o.yaw ?? 0) * Math.PI) / 180;
  const k = o.reach ?? 1;
  const dy = o.lift ?? 0;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  // point à la distance d le long du bras
  const at = (d: number, y: number): Vec3 => [x + d * k * sy, y + dy, z + d * k * cy];
  // inclinaison du bras (-10° autour de son axe transversal) puis lacet, exprimés dans l'ordre XYZ du générateur
  const t = (-10 * Math.PI) / 180;
  const st = Math.sin(t);
  const ct = Math.cos(t);
  const deg = 180 / Math.PI;
  const armRot: Vec3 = [Math.atan2(st, cy * ct) * deg, Math.asin(sy * ct) * deg, Math.atan2(-sy * st, cy) * deg];
  const r = (o.yaw ?? 0) % 360;
  return [
    { shape: "cylinder", sides: 8, radius: 0.2, height: 0.3, pos: at(0, 1.12), color: "metal" },
    { shape: "bevel", size: [0.3,0.26,0.3], pos: at(0, 1.38), rot: [0,r,0], color: "light", ...(pivot ? { pivot: "bras" } : {}) },
    { shape: "bevel", size: [0.16,0.16,0.8 * k], pos: at(0.35, 1.5), rot: armRot, color: "light", ...p },
    { shape: "box", size: [0.12,0.36,0.12], pos: at(0.72, 1.32), rot: [0,r,0], color: "metal", ...p },
    { shape: "box", size: [0.3,0.08,0.16], pos: at(0.72, 1.12), rot: [0,r,0], color: "dark", ...p },
    { shape: "box", size: [0.05,0.05,0.03], pos: at(0.18, 1.5), rot: [0,r,0], color: "amber", ...p },
  ];
}

/**
 * Turbine couchée du générateur (axe avant-arrière, hélice vers +z) posée sur le socle, à l'échelle `k`
 * (1 : turbine du générateur de base). 236 triangles.
 */
function turbine(x: number, z: number, k: number): Part[] {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const y = r(0.25 + 0.7 * k);
  const at = (dz: number): Vec3 => [x, y, r(z + dz * k)];
  const pale = (angle: number): Part => ({ shape: "box", size: [r(0.78 * k), r(0.09 * k), 0.02], pos: at(0.63), rot: [0, 0, angle], color: "metal" });
  return [
    { shape: "bevel", size: [r(1.0 * k), r(0.3 * k), r(1.3 * k)], pos: [x, r(0.25 + 0.15 * k), z], color: "light" },
    { shape: "cylinder", sides: 8, radius: r(0.5 * k), height: r(1.2 * k), pos: at(0), rot: [90, 0, 0], color: "light" },
    { shape: "cylinder", sides: 8, radius: r(0.53 * k), height: r(0.4 * k), pos: at(-0.2), rot: [90, 0, 0], color: "faction" },
    { shape: "cylinder", sides: 8, radius: r(0.54 * k), height: r(0.08 * k), pos: at(0.1), rot: [90, 0, 0], color: "dark" },
    { shape: "cylinder", sides: 8, radius: r(0.43 * k), height: r(0.04 * k), pos: at(0.6), rot: [90, 0, 0], color: "black" },
    pale(20),
    pale(80),
    pale(140),
    { shape: "cylinder", sides: 8, radius: r(0.09 * k), height: r(0.08 * k), pos: at(0.65), rot: [90, 0, 0], color: "amber" },
  ];
}

/**
 * Bobine du générateur : noyau sombre de hauteur `h` posé sur le socle, `n` anneaux lumineux espacés de 0,2
 * à partir de y = 0,55, coiffe (avec pastille sombre, par défaut si elle est aux couleurs du camp).
 */
function bobine(x: number, z: number, rayon: number, h: number, n: number, coiffe: Part["color"], pastille = coiffe === "faction"): Part[] {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const out: Part[] = [{ shape: "cylinder", sides: 8, radius: rayon, height: h, pos: [x, r(0.3 + h / 2), z], color: "dark" }];
  for (let i = 0; i < n; i++) out.push({ shape: "cylinder", sides: 8, radius: r(rayon + 0.03), height: 0.07, pos: [x, r(0.55 + 0.2 * i), z], color: "glow" });
  out.push({ shape: "cylinder", sides: 8, radius: r(rayon + 0.06), height: 0.14, pos: [x, r(0.35 + h), z], color: coiffe });
  if (pastille) out.push({ shape: "cylinder", sides: 8, radius: r((rayon * 2) / 3), height: 0.06, pos: [x, r(0.44 + h), z], color: "dark" });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lot A (production et logistique) : fonctions d'aide des extracteurs, fonderies, assembleurs,
// dépôts, bras et répartiteurs (préfixe lotA).
// ---------------------------------------------------------------------------------------------

/** Lot A : arrondi au millième des positions calculées. */
const lotAr = (v: number): number => Math.round(v * 1000) / 1000;

/** Lot A : rangée de `n` pièces fines identiques réparties de `a` à `b` (lames de grille, nervures, boulons). */
function lotARang(n: number, part: Omit<Part, "pos">, a: Vec3, b: Vec3): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ ...part, pos: [lotAr(a[0] + (b[0] - a[0]) * t), lotAr(a[1] + (b[1] - a[1]) * t), lotAr(a[2] + (b[2] - a[2]) * t)], fine: true });
  }
  return out;
}

/** Lot A : contour d'un carré de côté `c` aux coins coupés de `k` (à extruder : dalles, socles octogonaux). */
function lotACarre(c: number, k: number): [number, number][] {
  const h = c / 2;
  return [[-h + k, -h], [h - k, -h], [h, -h + k], [h, h - k], [h - k, h], [-h + k, h], [-h, h - k], [-h, -h + k]];
}

/** Lot A : contour d'une porte en arc (largeur `w`, montants droits de `hs`, arc de flèche `f`), base à y = 0. */
function lotAArche(w: number, hs: number, f: number, n = 6): [number, number][] {
  const out: [number, number][] = [[w / 2, 0], [w / 2, hs]];
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI;
    out.push([lotAr((Math.cos(a) * w) / 2), lotAr(hs + Math.sin(a) * f)]);
  }
  out.push([-w / 2, hs], [-w / 2, 0]);
  return out;
}

/**
 * Lot A : rotation (degrés, ordre XYZ du générateur) d'une pièce allongée selon +z, inclinée de `pitch`
 * (positif : l'avant descend) puis tournée de `yaw` autour de y (0 : vers +z, 90 : vers +x).
 */
function lotARot(yaw: number, pitch: number): Vec3 {
  const d = Math.PI / 180;
  const sy = Math.sin(yaw * d);
  const cy = Math.cos(yaw * d);
  const st = Math.sin(pitch * d);
  const ct = Math.cos(pitch * d);
  const q = (v: number) => Math.round((v / d) * 100) / 100;
  return [q(Math.atan2(st, cy * ct)), q(Math.asin(sy * ct)), q(Math.atan2(-sy * st, cy))];
}

/**
 * Lot A : bras robotisé articulé des assembleurs, posé sur le caisson en (x, z) ; avec `pivot`, c'est le
 * bras animé « bras » (origine du pivot en (x, 1,38 + lift, z), comme le bras d'origine). Tourelle d'acier,
 * épaule, bras et avant-bras coudés, poignet et pince ; vérin, durite et voyant en pièces fines.
 */
function lotABras(x: number, z: number, pivot: boolean, o: { yaw?: number; reach?: number; lift?: number } = {}): Part[] {
  const p = pivot ? { parent: "bras" } : {};
  const yaw = o.yaw ?? 0;
  const k = o.reach ?? 1;
  const dy = o.lift ?? 0;
  const sy = Math.sin((yaw * Math.PI) / 180);
  const cy = Math.cos((yaw * Math.PI) / 180);
  const at = (d: number, y: number, t = 0): Vec3 => [lotAr(x + d * k * sy + t * cy), lotAr(y + dy), lotAr(z + d * k * cy - t * sy)];
  // épaule (y 1,44) -> coude (d 0,42, y 1,6) -> poignet (d 0,8, y 1,48)
  const up = (Math.atan2(0.16, 0.42 * k) * 180) / Math.PI;
  const down = (Math.atan2(0.12, 0.38 * k) * 180) / Math.PI;
  return [
    { shape: "lathe", sides: 12, pos: at(0, 0.97), color: "steel", profile: [[0, 0], [0.22, 0], [0.22, 0.05], [0.18, 0.09], [0.16, 0.26], [0, 0.26]] },
    { shape: "torus", radius: 0.19, tube: 0.02, sides: 12, pos: at(0, 1.05), color: "hazard", fine: true },
    { shape: "bevel", size: [0.3, 0.22, 0.32], pos: at(0, 1.38), rot: [0, yaw, 0], color: "light", ...(pivot ? { pivot: "bras" } : {}) },
    { shape: "cylinder", sides: 10, radius: 0.08, height: 0.36, pos: at(0, 1.44), rot: [0, yaw, 90], color: "dark", ...p },
    { shape: "bevel", size: [0.13, 0.13, lotAr(Math.hypot(0.42 * k, 0.16) + 0.06)], pos: at(0.21, 1.52), rot: lotARot(yaw, -up), color: "faction", ...p },
    { shape: "cylinder", sides: 10, radius: 0.07, height: 0.2, pos: at(0.42, 1.6), rot: [0, yaw, 90], color: "steel", ...p },
    { shape: "bevel", size: [0.1, 0.1, lotAr(Math.hypot(0.38 * k, 0.12) + 0.04)], pos: at(0.61, 1.54), rot: lotARot(yaw, down), color: "light", ...p },
    { shape: "cylinder", sides: 8, radius: 0.04, height: 0.22, pos: at(0.8, 1.38), color: "steel", ...p },
    { shape: "box", size: [0.26, 0.06, 0.12], pos: at(0.8, 1.25), rot: [0, yaw, 0], color: "dark", ...p },
    { shape: "box", size: [0.03, 0.12, 0.07], pos: at(0.8, 1.17, 0.1), rot: [0, yaw, 0], color: "steel", fine: true, ...p },
    { shape: "box", size: [0.03, 0.12, 0.07], pos: at(0.8, 1.17, -0.1), rot: [0, yaw, 0], color: "steel", fine: true, ...p },
    { shape: "tube", radius: 0.018, sides: 5, path: [at(0.04, 1.4, 0.09), at(0.3, 1.58, 0.09)], color: "steel", fine: true, ...p },
    { shape: "tube", radius: 0.02, sides: 5, path: [at(0, 1.5, -0.1), at(0.2, 1.64, -0.09), at(0.42, 1.66, -0.1)], bend: 0.08, color: "copper", fine: true, ...p },
    { shape: "box", size: [0.05, 0.04, 0.03], pos: at(0.12, 1.58, 0), rot: lotARot(yaw, -up), color: "amber", ...p },
  ];
}

/** Lot A : hélice (tracé de tube) autour de l'axe y en (x, z), de y0 à y1, rayon r0 -> r1, `tours` tours. */
function lotAHelice(x: number, z: number, y0: number, y1: number, r0: number, r1: number, tours: number, n: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * tours * 2 * Math.PI;
    const r = r0 + (r1 - r0) * t;
    out.push([lotAr(x + Math.cos(a) * r), lotAr(y0 + (y1 - y0) * t), lotAr(z + Math.sin(a) * r)]);
  }
  return out;
}

/**
 * Lot A : extracteur (2 x 2), niveaux 1 à 3. Base : puits à lèvre de minerai, foret hélicoïdal (pivot
 * « foret »), tête motrice, tour de forage effilée à blindages clairs et coiffe d'équipe, cuve claire et
 * réservoir à bande de minerai, conduite vers la trémie de sortie, flèches de sortie ambre à l'avant.
 * Niveau 2 : anneau lumineux au puits, bandes de danger, troisième cuve, rehausse de la tour à balise.
 * Niveau 3 : derrick à treillis lumineux, couronne d'équipe et antenne, bobines autour du foret, second foret.
 */
function lotAExtracteur(n: 1 | 2 | 3): Part[] {
  const p: Part[] = [
    ...socle(2),
    ...filets(2),
    // sortie : flèches ambre devant les deux cases de la face avant (le minerai sort par là)
    { shape: "box", size: [0.62, 0.08, 0.36], pos: [0.5, 0.29, 0.8], color: "dark", mirror: true },
    { shape: "wedge", size: [0.04, 0.26, 0.32], pos: [0.63, 0.355, 0.8], color: "amber", rot: [0, 0, -90], mirror: true },
    { shape: "wedge", size: [0.04, 0.26, 0.32], pos: [-0.37, 0.355, 0.8], color: "amber", rot: [0, 0, -90], mirror: true },
    // puits : lèvre de minerai (teintée selon la ressource), fond sombre, éclats de minerai
    { shape: "lathe", sides: 12, pos: [0, 0.25, 0.3], color: "ore", profile: [[0.34, 0], [0.52, 0], [0.52, 0.03], [0.46, 0.07], [0.39, 0.07], [0.34, 0.04]] },
    { shape: "cylinder", sides: 12, radius: 0.36, height: 0.03, pos: [0, 0.265, 0.3], color: "black" },
    { shape: "box", size: [0.09, 0.06, 0.07], pos: [0.36, 0.3, 0.62], rot: [12, 30, 8], color: "ore", fine: true },
    { shape: "box", size: [0.07, 0.05, 0.08], pos: [-0.42, 0.29, 0.5], rot: [-8, 50, 10], color: "ore", fine: true },
    // foret (tourne en continu) : mèche d'acier et filet d'hélice sombre
    { shape: "lathe", sides: 12, pos: [0, 0.74, 0.3], color: "steel", pivot: "foret", profile: [[0, -0.46], [0.07, -0.34], [0.15, -0.12], [0.21, 0.12], [0.25, 0.34], [0.26, 0.46], [0, 0.46]] },
    { shape: "tube", radius: 0.028, sides: 4, path: lotAHelice(0, 0.3, 0.38, 1.12, 0.08, 0.27, 1.75, 7), bend: 0.03, color: "dark", parent: "foret", fine: true },
    { shape: "box", size: [0.5, 0.05, 0.07], pos: [0, 0.95, 0.3], rot: [0, 0, 12], color: "dark", parent: "foret" },
    { shape: "box", size: [0.07, 0.05, 0.36], pos: [0, 0.68, 0.3], rot: [12, 0, 0], color: "dark", parent: "foret" },
    // tête motrice : collier d'acier, carter clair, tambour de cuivre
    { shape: "cylinder", sides: 12, radius: 0.3, height: 0.14, bevel: 0.03, pos: [0, 1.27, 0.3], color: "dark" },
    { shape: "torus", radius: 0.3, tube: 0.025, sides: 12, pos: [0, 1.2, 0.3], color: "hazard", fine: true },
    { shape: "bevel", size: [0.46, 0.26, 0.46], pos: [0, 1.46, 0.14], color: "light" },
    { shape: "cylinder", sides: 12, radius: 0.1, height: 0.32, pos: [0, 1.66, 0.16], rot: [0, 0, 90], color: "copper" },
    { shape: "cylinder", sides: 8, radius: 0.12, height: 0.04, pos: [0.17, 1.66, 0.16], rot: [0, 0, 90], color: "dark", mirror: true, fine: true },
    ...lotARang(3, { shape: "box", size: [0.3, 0.02, 0.03], color: "black" }, [0, 1.6, 0.38], [0, 1.4, 0.38]),
    // tour de forage effilée : fût sombre, blindages clairs, hublot de minerai, coiffe d'équipe, voyants
    { shape: "extrude", profile: [[-0.33, 0], [0.33, 0], [0.3, 1.5], [0.27, 1.76], [-0.27, 1.76], [-0.3, 1.5]], depth: 0.5, bevel: 0.03, pos: [0, 0.25, -0.4], color: "dark" },
    { shape: "bevel", size: [0.16, 1.1, 0.46], pos: [0.38, 1.3, -0.38], rot: [0, 0, -1.2], color: "light", mirror: true },
    ...lotARang(4, { shape: "cylinder", sides: 6, radius: 0.022, height: 0.02, rot: [0, 0, 90], color: "steel" }, [0.465, 0.85, -0.2], [0.465, 1.75, -0.2]),
    { shape: "box", size: [0.36, 0.56, 0.04], pos: [0, 1.8, -0.15], color: "dark" },
    { shape: "box", size: [0.3, 0.5, 0.03], pos: [0, 1.8, -0.135], color: "ore" },
    { shape: "box", size: [0.3, 0.025, 0.02], pos: [0, 1.8, -0.12], color: "dark", fine: true },
    { shape: "bevel", size: [0.68, 0.22, 0.56], pos: [0, 2.12, -0.4], color: "faction" },
    { shape: "box", size: [0.08, 0.05, 0.03], pos: [0.2, 2.12, -0.11], color: "amber", mirror: true },
    { use: "echelle", pos: [0, 0.25, -0.67], rot: [0, 180, 0], scale: [1, 1.75, 1] },
    // cuve gauche : cuve claire, bandeau d'équipe, trappe de minerai, échelle
    { use: "cuve", pos: [-0.66, 0.25, -0.1], scale: [0.54, 0.86, 0.54] },
    { shape: "cylinder", sides: 12, radius: 0.285, height: 0.12, pos: [-0.66, 0.92, -0.1], color: "faction" },
    { shape: "lathe", sides: 12, pos: [-0.66, 1.08, -0.1], color: "ore", profile: [[0, 0], [0.14, 0], [0.14, 0.05], [0.1, 0.13], [0.05, 0.16], [0, 0.17]] },
    { shape: "box", size: [0.08, 0.05, 0.03], pos: [-0.66, 0.7, 0.18], color: "amber" },
    // réservoir droit : fût clair à bande de minerai et dôme d'acier, cerclages
    { shape: "lathe", sides: 12, pos: [0.66, 0.25, -0.5], color: "light", profile: [[0, 0], [0.27, 0], [0.27, 0.05], [0.25, 0.07], [0.25, 0.5], [0, 0.5]] },
    { shape: "cylinder", sides: 12, radius: 0.265, height: 0.1, pos: [0.66, 0.62, -0.5], color: "ore" },
    { shape: "lathe", sides: 12, pos: [0.66, 0.75, -0.5], color: "steel", profile: [[0, 0], [0.255, 0], [0.24, 0.08], [0.18, 0.17], [0.09, 0.22], [0, 0.23]] },
    { shape: "torus", radius: 0.255, tube: 0.018, sides: 12, pos: [0.66, 0.42, -0.5], color: "metal", fine: true },
    // conduite vers la trémie de sortie (avant droit), brides ; câble de cuivre vers la tête
    { shape: "tube", radius: 0.06, path: [[0.66, 0.5, -0.24], [0.66, 0.4, -0.15], [0.66, 0.4, 0.5]], bend: 0.1, color: "metal" },
    { shape: "torus", radius: 0.07, tube: 0.02, sides: 10, pos: [0.66, 0.4, 0.1], rot: [90, 0, 0], color: "steel", fine: true },
    { shape: "box", size: [0.3, 0.22, 0.3], pos: [0.66, 0.36, 0.62], color: "metal" },
    { shape: "box", size: [0.2, 0.02, 0.2], pos: [0.66, 0.475, 0.62], color: "black" },
    { shape: "tube", radius: 0.025, sides: 5, path: [[-0.2, 1.1, -0.14], [-0.2, 1.4, -0.05], [-0.12, 1.55, 0.0]], bend: 0.08, color: "copper", fine: true },
  ];
  if (n === 1) {
    // évent sur la coiffe
    p.push(
      { shape: "lathe", sides: 12, pos: [0, 2.23, -0.45], color: "steel", profile: [[0, 0], [0.15, 0], [0.15, 0.04], [0.11, 0.07], [0.11, 0.22], [0.14, 0.24], [0.14, 0.27], [0.09, 0.27], [0.09, 0.21], [0, 0.21]] },
      ...lotARang(3, { shape: "box", size: [0.03, 0.02, 0.42], color: "black" }, [-0.24, 2.235, -0.4], [-0.16, 2.235, -0.4]),
    );
    return p;
  }
  // niveau 2 et plus : anneau lumineux au puits, bandes de danger sur la tour
  p.push(
    { shape: "torus", radius: 0.55, tube: 0.025, sides: 12, pos: [0, 0.27, 0.3], color: "glow" },
    { shape: "box", size: [0.68, 0.1, 0.54], pos: [0, 0.85, -0.4], color: "hazard" },
    { shape: "box", size: [0.64, 0.1, 0.54], pos: [0, 1.55, -0.4], color: "hazard" },
  );
  if (n === 2) {
    p.push(
      // troisième cuve à l'avant gauche, couronne lumineuse, conduite
      { use: "cuve", pos: [-0.66, 0.25, 0.58], scale: [0.4, 0.5, 0.4] },
      { shape: "torus", radius: 0.2, tube: 0.025, sides: 12, pos: [-0.66, 0.66, 0.58], color: "glow" },
      { shape: "tube", radius: 0.045, path: [[-0.66, 0.36, 0.38], [-0.66, 0.36, 0.06], [-0.66, 0.45, -0.1]], bend: 0.08, color: "copper" },
      // rehausse de la tour : fût d'acier à ouïes, filets cyan, coiffe d'équipe, balise ambre, rambarde
      { shape: "bevel", size: [0.5, 0.7, 0.42], pos: [0, 2.58, -0.4], color: "metal" },
      { shape: "box", size: [0.04, 0.5, 0.03], pos: [0.18, 2.58, -0.18], color: "glow", mirror: true },
      ...lotARang(4, { shape: "box", size: [0.02, 0.03, 0.3], color: "black" }, [0.255, 2.38, -0.4], [0.255, 2.74, -0.4]),
      ...lotARang(4, { shape: "box", size: [0.02, 0.03, 0.3], color: "black" }, [-0.255, 2.38, -0.4], [-0.255, 2.74, -0.4]),
      { shape: "bevel", size: [0.6, 0.16, 0.5], pos: [0, 3.0, -0.4], color: "faction" },
      { shape: "lathe", sides: 12, pos: [0, 3.08, -0.4], color: "amber", profile: [[0, 0], [0.07, 0], [0.1, 0.04], [0.1, 0.1], [0.06, 0.16], [0, 0.17]] },
      { use: "garde_corps", pos: [0, 2.23, -0.12], scale: [0.62, 0.8, 1] },
      { use: "garde_corps", pos: [0.33, 2.23, -0.4], rot: [0, 90, 0], scale: [0.5, 0.8, 1], mirror: true },
    );
    return p;
  }
  p.push(
    // derrick : quatre montants à filet cyan, entretoises et croisillons, couronne d'équipe, antenne
    ...[[-0.44, -0.12], [0.44, -0.12], [-0.44, -0.68], [0.44, -0.68]].flatMap(([x, z]): Part[] => [
      { shape: "box", size: [0.08, 3.0, 0.08], pos: [x, 1.75, z], color: "metal" },
      ...(z > -0.5 ? [{ shape: "box", size: [0.03, 2.4, 0.03], pos: [lotAr(x + Math.sign(x) * 0.05), 1.8, z], color: "glow" } as Part] : []),
    ]),
    ...[1.7, 2.5].flatMap((y): Part[] => [
      { shape: "box", size: [0.92, 0.06, 0.06], pos: [0, y, -0.12], color: "dark" },
      { shape: "box", size: [0.92, 0.06, 0.06], pos: [0, y, -0.68], color: "dark" },
      { shape: "box", size: [0.06, 0.06, 0.6], pos: [0.44, y, -0.4], color: "dark", mirror: true },
    ]),
    ...[[0.5, 1.7], [1.7, 2.5]].flatMap(([y0, y1]): Part[] => [
      { shape: "tube", radius: 0.018, sides: 4, path: [[-0.44, y0, -0.68], [0.44, y1, -0.68]], color: "steel", fine: true },
      { shape: "tube", radius: 0.018, sides: 4, path: [[0.44, y0, -0.68], [-0.44, y1, -0.68]], color: "steel", fine: true },
      { shape: "tube", radius: 0.018, sides: 4, path: [[0.44, y0, -0.12], [0.44, y1, -0.68]], color: "steel", fine: true },
      { shape: "tube", radius: 0.018, sides: 4, path: [[-0.44, y0, -0.68], [-0.44, y1, -0.12]], color: "steel", fine: true },
    ]),
    { shape: "box", size: [0.06, 1.0, 0.06], pos: [0.22, 2.1, -0.12], rot: [0, 0, 28], color: "metal", mirror: true },
    { shape: "lathe", sides: 12, pos: [0, 3.18, -0.4], color: "faction", profile: [[0, 0], [0.46, 0], [0.5, 0.04], [0.5, 0.18], [0.44, 0.22], [0, 0.22]] },
    { shape: "torus", radius: 0.51, tube: 0.03, sides: 12, pos: [0, 3.22, -0.4], color: "glow" },
    { shape: "cone", sides: 8, radius: 0.3, height: 0.4, pos: [0, 3.6, -0.4], color: "light" },
    { shape: "cylinder", sides: 5, radius: 0.025, height: 0.6, pos: [0, 4.05, -0.4], color: "metal" },
    { shape: "torus", radius: 0.08, tube: 0.012, sides: 8, pos: [0, 4.0, -0.4], color: "steel", fine: true },
    { shape: "sphere", radius: 0.08, pos: [0, 4.38, -0.4], color: "amber" },
    // bobines d'énergie autour du foret : deux anneaux lumineux sur montants, spires de cuivre
    { shape: "torus", radius: 0.4, tube: 0.025, sides: 12, pos: [0, 0.62, 0.3], color: "glow" },
    { shape: "torus", radius: 0.4, tube: 0.025, sides: 12, pos: [0, 0.98, 0.3], color: "glow" },
    { shape: "box", size: [0.06, 0.5, 0.06], pos: [0.42, 0.8, 0.3], color: "metal", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.05, height: 0.3, pos: [0.42, 0.8, 0.3], color: "copper", mirror: true, fine: true },
    // second foret (tourne aussi) à l'avant gauche, sous une tête d'équipe
    { shape: "cylinder", sides: 12, radius: 0.2, height: 0.08, pos: [-0.62, 0.32, 0.62], color: "dark" },
    { shape: "cylinder", sides: 12, radius: 0.22, height: 0.02, pos: [-0.62, 0.37, 0.62], color: "glow" },
    { shape: "cone", sides: 6, radius: 0.15, height: 0.5, pos: [-0.62, 0.6, 0.62], rot: [180, 0, 0], color: "steel", pivot: "foret2" },
    { shape: "box", size: [0.3, 0.05, 0.05], pos: [-0.62, 0.7, 0.62], rot: [0, 0, 12], color: "dark", parent: "foret2" },
    { shape: "box", size: [0.05, 0.05, 0.24], pos: [-0.62, 0.55, 0.62], rot: [12, 0, 0], color: "dark", parent: "foret2" },
    { shape: "cylinder", sides: 12, radius: 0.16, height: 0.12, bevel: 0.02, pos: [-0.62, 0.92, 0.62], color: "faction" },
    { shape: "box", size: [0.05, 0.3, 0.05], pos: [-0.62, 0.71, 0.47], color: "metal", fine: true },
    { shape: "tube", radius: 0.03, sides: 6, path: [[-0.62, 0.98, 0.62], [-0.62, 1.05, 0.4], [-0.3, 1.05, 0.25]], bend: 0.08, color: "copper", fine: true },
  );
  return p;
}

/** Lot A : contour du bras (socle à pans coupés) des bras logistiques. */
const LOTA_SOCLE_BRAS = lotACarre(0.28, 0.06);

/**
 * Lot A : répartiteurs (1 x 1) — plateau d'acier, caisson à pans coupés (couleur `dessus`), rails latéraux
 * clairs, fente d'entrée à l'arrière ; `fleches` : couleur des flèches avant, gauche, droite (null : éteinte,
 * remplacée par un cache sombre ; false : absente). Moyeu, boulons et filets en pièces fines.
 */
function lotARepartiteur(dessus: Part["color"], fleches: (Part["color"] | null | false)[], petites = false): Part[] {
  const s: Vec3 = petites ? [0.16, 0.05, 0.18] : [0.22, 0.06, 0.25];
  const p: Part[] = [
    { shape: "box", size: [0.95, 0.12, 0.95], pos: [0, 0.06, 0], color: "metal" },
    { shape: "extrude", profile: lotACarre(0.72, 0.12), depth: 0.2, pos: [0, 0.2, 0], rot: [90, 0, 0], color: dessus },
    { shape: "box", size: [0.08, 0.18, 0.95], pos: [0.47, 0.1, 0], color: "light", mirror: true },
    { shape: "box", size: [0.4, 0.02, 0.12], pos: [0, 0.305, -0.28], color: "black" },
    // pièces fines : moyeu, boulons des coins, filets des rails, lèvre de la fente
    { shape: "cylinder", sides: 6, radius: 0.07, height: 0.03, pos: [0, 0.31, 0], color: "steel", fine: true },
    { shape: "box", size: [0.045, 0.02, 0.045], pos: [0.25, 0.305, 0.25], color: "steel", mirror: true, fine: true },
    { shape: "box", size: [0.045, 0.02, 0.045], pos: [0.25, 0.305, -0.25], color: "steel", mirror: true, fine: true },
    { shape: "box", size: [0.03, 0.02, 0.6], pos: [0.47, 0.2, 0], color: "glow", mirror: true, fine: true },
    { shape: "box", size: [0.44, 0.03, 0.03], pos: [0, 0.31, -0.35], color: "hazard", fine: true },
  ];
  const rots: Vec3[] = [[0, 0, 0], [0, -90, 0], [0, 90, 0]];
  const poss: Vec3[] = [[0, 0.33, 0.3], [-0.3, 0.33, 0], [0.3, 0.33, 0]];
  fleches.forEach((c, i) => {
    if (c === false) return;
    if (c) p.push({ shape: "wedge", size: i === 0 ? [0.22, 0.06, 0.25] : s, pos: poss[i], rot: rots[i], color: c });
    else p.push({ shape: "box", size: [0.06, 0.05, 0.24], pos: [poss[i][0], 0.32, poss[i][2]], color: "dark" });
  });
  return p;
}

/** Lot A : cheminée tournée (embase d'acier, fût sombre, lèvre évasée, braise au sommet) posée en (x, y, z). */
function lotACheminee(x: number, y: number, z: number, h: number, r: number, feu: Part["color"]): Part[] {
  return [
    { shape: "lathe", sides: 12, pos: [x, y, z], color: "steel", profile: [[0, 0], [lotAr(r + 0.07), 0], [lotAr(r + 0.07), 0.08], [lotAr(r + 0.02), 0.13], [0, 0.13]] },
    { shape: "lathe", sides: 12, pos: [x, lotAr(y + 0.12), z], color: "dark", profile: [[lotAr(r), 0], [lotAr(r * 0.82), lotAr(h - 0.1)], [lotAr(r * 1.08), lotAr(h - 0.04)], [lotAr(r * 1.08), h], [lotAr(r * 0.7), h], [lotAr(r * 0.7), lotAr(h - 0.03)], [0, lotAr(h - 0.03)]] },
    { shape: "cylinder", sides: 12, radius: lotAr(r * 0.72), height: 0.02, pos: [x, lotAr(y + 0.12 + h - 0.035), z], color: feu },
    { shape: "torus", radius: lotAr(r * 0.93), tube: 0.018, sides: 12, pos: [x, lotAr(y + 0.12 + h * 0.4), z], color: "metal", fine: true },
  ];
}

/**
 * Lot A : fonderie (2 x 2), niveaux 1 à 3. Four de briques sombre aux parois droites près du bord (trappes),
 * plinthe de béton, piliers d'angle clairs, gueule en arc à braise ambre et grille, toit d'équipe au centre
 * dégagé (icône de la recette), cheminée tournée. Niveau 2 : échangeurs ambrés sur les flancs, seconde
 * cheminée, soufflerie (pivot « rotor »). Niveau 3 : four à induction rehaussé, ailettes, bobines de cuivre
 * à cœur cyan aux coins du toit, haute cheminée.
 */
function lotAFonderie(n: 1 | 2 | 3): Part[] {
  const h = n === 3 ? 1.36 : 1.2; // hauteur du four
  const yc = lotAr(0.25 + h / 2);
  const top = lotAr(0.25 + h); // dessus du four
  const roof = lotAr(top + 0.07); // milieu du toit
  const mw = n === 1 ? 0.98 : 1.04; // largeur de la gueule
  const p: Part[] = [
    ...socle(2),
    ...filets(2, 2, n === 3),
    { shape: "bevel", size: [1.86, 0.12, 1.8], pos: [0, 0.31, -0.06], bevel: 0.03, color: "concrete" },
    { shape: "bevel", size: [1.76, h, 1.66], pos: [0, yc, -0.07], bevel: 0.05, color: "dark" },
    // assises de briques (lignes fines) et bandeaux d'acier sur les flancs et l'arrière
    { shape: "box", size: [1.79, 0.05, 1.5], pos: [0, lotAr(0.25 + h * 0.36), -0.07], color: "metal" },
    { shape: "box", size: [1.5, 0.05, 1.69], pos: [0, lotAr(0.25 + h * 0.36), -0.07], color: "metal" },
    ...lotARang(3, { shape: "box", size: [1.775, 0.012, 1.3], color: "black" }, [0, lotAr(0.25 + h * 0.55), -0.12], [0, lotAr(0.25 + h * 0.85), -0.12]),
    // piliers d'angle clairs (blindage), voyants
    { shape: "bevel", size: [0.34, lotAr(h - 0.14), 0.34], pos: [0.74, lotAr(yc - 0.06), 0.6], color: "light", mirror: true },
    { shape: "bevel", size: [0.34, lotAr(h - 0.14), 0.34], pos: [0.74, lotAr(yc - 0.06), -0.74], color: "light", mirror: true },
    { shape: "box", size: [0.08, 0.05, 0.03], pos: [0.74, lotAr(top - 0.1), 0.775], color: n === 3 ? "glow" : "amber", mirror: true },
    ...lotARang(3, { shape: "box", size: [0.35, 0.03, 0.02], color: "hazard" }, [0.74, 0.4, 0.775], [0.74, 0.56, 0.775]),
    ...lotARang(3, { shape: "box", size: [0.35, 0.03, 0.02], color: "hazard" }, [-0.74, 0.4, 0.775], [-0.74, 0.56, 0.775]),
    // gueule du four : arc clair, foyer noir, braise ambre, grille d'acier, seuil de danger, linteau
    { shape: "extrude", profile: lotAArche(mw, 0.5, 0.26), depth: 0.1, pos: [0, 0.31, 0.8], color: "light" },
    { shape: "extrude", profile: lotAArche(lotAr(mw - 0.18), 0.44, 0.2), depth: 0.1, pos: [0, 0.33, 0.81], color: "black" },
    { shape: "extrude", profile: lotAArche(lotAr(mw - 0.3), 0.38, 0.14), depth: 0.02, pos: [0, 0.35, 0.86], color: n === 3 ? "amber" : "amber" },
    ...lotARang(5, { shape: "box", size: [0.025, 0.46, 0.025], color: "steel" }, [-0.26, 0.6, 0.875], [0.26, 0.6, 0.875]),
    { shape: "box", size: [lotAr(mw - 0.1), 0.04, 0.14], pos: [0, 0.33, 0.9], color: "hazard" },
    { shape: "bevel", size: [lotAr(mw + 0.08), 0.16, 0.22], pos: [0, lotAr(top - 0.05), 0.76], color: "light" },
    { shape: "box", size: [0.04, 0.04, 0.9], pos: [0.885, lotAr(top - 0.22), -0.12], color: "glow", mirror: true },
    // regards de flanc (braise derrière un hublot)
    { shape: "cylinder", sides: 10, radius: 0.08, height: 0.04, pos: [0.885, 0.5, -0.06], rot: [0, 0, 90], color: "steel", mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.05, height: 0.02, pos: [0.9, 0.5, -0.06], rot: [0, 0, 90], color: n === 3 ? "glow" : "amber", mirror: true },
    // toit aux couleurs de l'équipe (centre dégagé pour l'icône de la recette), rebord d'acier
    { shape: "bevel", size: [1.56, 0.14, 1.44], pos: [0, roof, -0.08], color: "faction" },
    { shape: "box", size: [1.6, 0.03, 0.03], pos: [0, lotAr(roof + 0.075), 0.645], color: "metal", fine: true },
    { shape: "box", size: [0.03, 0.03, 1.44], pos: [0.785, lotAr(roof + 0.075), -0.08], color: "metal", mirror: true, fine: true },
  ];
  const yt = lotAr(roof + 0.07); // dessus du toit
  if (n === 1) {
    p.push(
      // ouïe d'aération à l'avant gauche, tuyau de cuivre vers la cheminée
      { shape: "bevel", size: [0.3, 0.1, 0.26], pos: [-0.56, lotAr(yt + 0.05), 0.48], color: "metal" },
      ...lotARang(4, { shape: "box", size: [0.24, 0.02, 0.025], color: "black" }, [-0.56, lotAr(yt + 0.105), 0.39], [-0.56, lotAr(yt + 0.105), 0.57]),
      ...lotACheminee(0.54, yt, -0.56, 0.5, 0.17, "amber"),
      { shape: "box", size: [0.07, 0.05, 0.03], pos: [0.54, lotAr(yt + 0.3), -0.395], color: "amber" },
      { shape: "tube", radius: 0.03, sides: 6, path: [[0.36, lotAr(yt + 0.04), -0.56], [0.0, lotAr(yt + 0.04), -0.66], [-0.5, lotAr(yt + 0.04), -0.66], [-0.56, lotAr(yt + 0.04), 0.3]], bend: 0.1, color: "copper", fine: true },
    );
    return p;
  }
  if (n === 2) {
    p.push(
      // échangeurs de chaleur sur les flancs : caisson d'acier, ailettes ambrées, tuyaux de cuivre
      { shape: "bevel", size: [0.12, 0.7, 0.9], pos: [0.91, 0.8, -0.1], color: "metal", mirror: true },
      ...[0.22, -0.02, -0.26, -0.42].map((z, i): Part => ({ shape: "box", size: [0.03, 0.5, 0.04], pos: [0.975, 0.8, z], color: "amber", mirror: true, ...(i === 3 ? { fine: true } : {}) })),
      { shape: "tube", radius: 0.035, sides: 6, path: [[0.91, 1.15, 0.2], [0.91, 1.42, 0.2], [0.8, 1.55, 0.2]], bend: 0.08, color: "copper", mirror: true, fine: true },
      { shape: "box", size: [1.2, 0.03, 0.03], pos: [0, lotAr(yt + 0.01), 0.6], color: "amber" },
      // deux cheminées aux coins arrière
      ...lotACheminee(0.54, yt, -0.56, 0.62, 0.15, "amber"),
      ...lotACheminee(-0.54, yt, -0.56, 0.62, 0.15, "amber"),
      // soufflerie à l'avant gauche du toit : virole, rotor à pales (pivot « rotor »)
      { shape: "lathe", sides: 16, pos: [-0.5, 1.59, 0.42], color: "metal", profile: [[0.16, 0], [0.22, 0], [0.22, 0.13], [0.19, 0.15], [0.16, 0.15]] },
      { shape: "cylinder", sides: 12, radius: 0.16, height: 0.02, pos: [-0.5, 1.64, 0.42], color: "black" },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.05, pos: [-0.5, 1.72, 0.42], color: "dark", pivot: "rotor" },
      ...[0, 120, 240].map((a): Part => ({ shape: "box", size: [0.3, 0.012, 0.06], pos: [-0.5, 1.71, 0.42], rot: [10, a, 0], color: "steel", parent: "rotor" })),
    );
    return p;
  }
  p.push(
    // ailettes de refroidissement sur les flancs
    ...[0.3, 0.06, -0.18, -0.42].map((z): Part => ({ shape: "box", size: [0.1, 0.9, 0.06], pos: [0.9, 0.86, z], color: "steel", mirror: true })),
    { shape: "box", size: [0.04, 0.04, 0.86], pos: [0.93, 1.33, -0.06], color: "glow", mirror: true },
    { shape: "box", size: [0.86, 0.04, 0.07], pos: [0, 0.45, 0.9], color: "glow" },
    // bobines d'induction aux trois coins libres : embase, cœur cyan, spires de cuivre, coiffe
    ...([[-0.56, 0.44], [0.56, 0.44], [-0.56, -0.62]] as const).flatMap(([x, z]): Part[] => [
      { shape: "lathe", sides: 12, pos: [x, yt, z], color: "steel", profile: [[0, 0], [0.17, 0], [0.17, 0.05], [0.12, 0.08], [0, 0.08]] },
      { shape: "cylinder", sides: 12, radius: 0.09, height: 0.36, pos: [x, lotAr(yt + 0.24), z], color: "glow" },
      { shape: "torus", radius: 0.12, tube: 0.03, sides: 12, pos: [x, lotAr(yt + 0.15), z], color: "copper" },
      { shape: "torus", radius: 0.12, tube: 0.03, sides: 12, pos: [x, lotAr(yt + 0.24), z], color: "copper" },
      { shape: "torus", radius: 0.12, tube: 0.03, sides: 12, pos: [x, lotAr(yt + 0.33), z], color: "copper", fine: true },
      { shape: "cylinder", sides: 12, radius: 0.13, height: 0.05, bevel: 0.015, pos: [x, lotAr(yt + 0.43), z], color: "dark" },
    ]),
    { shape: "tube", radius: 0.025, sides: 5, path: [[-0.56, lotAr(yt + 0.03), 0.26], [-0.56, lotAr(yt + 0.03), -0.44]], color: "copper", fine: true },
    { shape: "tube", radius: 0.025, sides: 5, path: [[-0.38, lotAr(yt + 0.03), 0.44], [0.38, lotAr(yt + 0.03), 0.44]], color: "copper", fine: true },
    // haute cheminée dans le coin arrière droit
    ...lotACheminee(0.6, yt, -0.62, 0.8, 0.14, "glow"),
  );
  return p;
}

/**
 * Lot A : caisson commun des assembleurs (3 x 3) : parois droites près du bord (trappes), plinthe de béton,
 * piliers d'angle clairs cerclés de danger et coiffés d'un voyant (couleur `voyant`), cadre supérieur d'équipe,
 * sas d'entrée à rouleaux à l'avant, grilles d'aération sur les flancs et l'arrière, plateau de travail au
 * centre (dégagé pour l'icône de la recette).
 */
function lotACaisson(voyant: Part["color"]): Part[] {
  return [
    ...socle(3),
    ...filets(3),
    { shape: "bevel", size: [2.86, 0.1, 2.86], pos: [0, 0.3, 0], bevel: 0.03, color: "concrete" },
    { shape: "bevel", size: [2.78, 0.72, 2.78], pos: [0, 0.6, 0], bevel: 0.06, color: "dark" },
    // piliers d'angle
    { shape: "bevel", size: [0.62, 0.92, 0.62], pos: [1.1, 0.7, 1.1], color: "light", mirror: true },
    { shape: "bevel", size: [0.62, 0.92, 0.62], pos: [1.1, 0.7, -1.1], color: "light", mirror: true },
    { shape: "box", size: [0.64, 0.07, 0.64], pos: [1.1, 0.48, 1.1], color: "hazard", mirror: true },
    { shape: "box", size: [0.64, 0.07, 0.64], pos: [1.1, 0.48, -1.1], color: "hazard", mirror: true },
    { shape: "box", size: [0.4, 0.02, 0.4], pos: [-1.1, 1.165, -1.1], color: "steel", fine: true },
    { shape: "cylinder", sides: 10, radius: 0.07, height: 0.06, pos: [1.1, 1.19, 1.1], color: voyant, mirror: true },
    { shape: "cylinder", sides: 10, radius: 0.07, height: 0.06, pos: [1.1, 1.19, -1.1], color: voyant },
    // sas d'entrée avant : cadre clair, ouverture noire à rouleaux, filet cyan, voyants ambre
    { shape: "box", size: [1.16, 0.52, 0.04], pos: [0, 0.53, 1.4], color: "light" },
    { shape: "box", size: [0.96, 0.4, 0.04], pos: [0, 0.51, 1.41], color: "black" },
    ...lotARang(3, { shape: "cylinder", sides: 6, radius: 0.025, height: 0.92, rot: [0, 0, 90], color: "steel" }, [0, 0.36, 1.42], [0, 0.6, 1.42]),
    { shape: "box", size: [0.9, 0.04, 0.03], pos: [0, 0.83, 1.4], color: "glow" },
    { shape: "box", size: [0.1, 0.06, 0.03], pos: [0.66, 0.5, 1.4], color: "amber", mirror: true },
    // grilles d'aération : flancs (filet cyan au-dessus) et arrière
    { shape: "box", size: [0.04, 0.4, 1.2], pos: [1.39, 0.6, 0], color: "metal", mirror: true },
    ...lotARang(5, { shape: "box", size: [0.02, 0.03, 1.1], color: "black", mirror: true }, [1.41, 0.46, 0], [1.41, 0.74, 0]),
    { shape: "box", size: [0.03, 0.04, 0.8], pos: [1.4, 0.86, 0], color: "glow", mirror: true },
    { shape: "box", size: [1.2, 0.4, 0.04], pos: [0, 0.6, -1.39], color: "metal" },
    ...lotARang(5, { shape: "box", size: [1.1, 0.03, 0.02], color: "black" }, [0, 0.46, -1.41], [0, 0.74, -1.41]),
    // cadre supérieur d'équipe, plateau de travail à glissières
    { shape: "bevel", size: [2.4, 0.16, 0.4], pos: [0, 1.04, 1.05], color: "faction" },
    { shape: "bevel", size: [2.4, 0.16, 0.4], pos: [0, 1.04, -1.05], color: "faction" },
    { shape: "bevel", size: [0.4, 0.16, 1.7], pos: [1.05, 1.04, 0], color: "faction", mirror: true },
    { shape: "box", size: [1.8, 0.04, 1.8], pos: [0, 0.97, 0], color: "metal" },
    { shape: "box", size: [1.7, 0.025, 0.04], pos: [0, 1.0, 0.45], color: "steel", fine: true },
    { shape: "box", size: [1.7, 0.025, 0.04], pos: [0, 1.0, -0.45], color: "steel", fine: true },
    { shape: "box", size: [0.03, 0.02, 1.6], pos: [0.86, 1.125, 0], color: "glow", mirror: true, fine: true },
  ];
}

/**
 * Lot A : dépôt (2 x 2), niveaux 1 et 2. Conteneur blindé sombre aux parois droites près du bord (trappes),
 * tôle nervurée (pièces fines), rideau à lames à l'avant, blindages clairs aux coins, toit d'équipe à trappe
 * et anneaux de levage. Niveau 2 : étage de stockage à hublots, deux goulottes de sortie filtrée, toit plat
 * cerclé d'une rambarde (les objets filtrés s'y affichent).
 */
function lotADepot(n: 1 | 2): Part[] {
  const p: Part[] = [
    ...socle(2),
    ...filets(2),
    { shape: "bevel", size: [1.86, 0.08, 1.8], pos: [0, 0.29, -0.06], bevel: 0.025, color: "concrete" },
    { shape: "bevel", size: [1.82, 0.95, 1.7], pos: [0, 0.72, -0.07], color: "dark" },
    // tôle nervurée des flancs et de l'arrière
    ...lotARang(6, { shape: "box", size: [0.03, 0.62, 0.035], color: "metal", mirror: true }, [0.915, 0.62, -0.62], [0.915, 0.62, 0.42]),
    ...lotARang(6, { shape: "box", size: [0.035, 0.62, 0.03], color: "metal" }, [-0.55, 0.62, -0.925], [0.55, 0.62, -0.925]),
    // rideau à lames, cadre, filet cyan, voyants
    { shape: "bevel", size: [1.12, 0.84, 0.08], pos: [0, 0.68, 0.79], bevel: 0.025, color: "light" },
    { shape: "box", size: [0.96, 0.7, 0.04], pos: [0, 0.64, 0.83], color: "black" },
    ...lotARang(5, { shape: "box", size: [0.92, 0.035, 0.03], color: "dark" }, [0, 0.38, 0.86], [0, 0.9, 0.86]),
    { shape: "box", size: [0.06, 0.66, 0.05], pos: [0.5, 0.64, 0.84], color: "steel", mirror: true },
    { shape: "box", size: [1.0, 0.04, 0.03], pos: [0, 1.09, 0.78], color: "glow" },
    { shape: "box", size: [0.9, 0.035, 0.1], pos: [0, 0.33, 0.9], color: "hazard" },
    // blindage clair aux coins supérieurs, panneaux latéraux à filet cyan
    { shape: "bevel", size: [0.4, 0.5, 0.4], pos: [0.73, 1.0, 0.62], color: "light", mirror: true },
    { shape: "bevel", size: [0.4, 0.5, 0.4], pos: [0.73, 1.0, -0.74], color: "light", mirror: true },
    { shape: "box", size: [0.04, 0.3, 0.7], pos: [0.92, 0.95, -0.07], color: "metal", mirror: true },
    { shape: "box", size: [0.03, 0.04, 0.6], pos: [0.94, 1.0, -0.07], color: "glow", mirror: true },
  ];
  if (n === 1) {
    p.push(
      { shape: "box", size: [0.08, 0.06, 0.03], pos: [0.62, 0.4, 0.8], color: "amber", mirror: true },
      // toit d'équipe, trappe claire, anneaux de levage, évent
      { shape: "bevel", size: [1.16, 0.14, 1.36], pos: [0, 1.26, -0.07], color: "faction" },
      { shape: "bevel", size: [0.56, 0.12, 0.38], pos: [0, 1.38, -0.07], color: "light" },
      { shape: "box", size: [0.3, 0.06, 0.4], pos: [0, 1.45, -0.07], color: "dark" },
      ...lotARang(3, { shape: "box", size: [0.26, 0.015, 0.03], color: "black" }, [0, 1.485, -0.2], [0, 1.485, 0.06]),
      { shape: "torus", radius: 0.05, tube: 0.014, sides: 8, pos: [0.4, 1.36, 0.45], rot: [90, 0, 0], color: "steel", mirror: true, fine: true },
      { shape: "torus", radius: 0.05, tube: 0.014, sides: 8, pos: [0.4, 1.36, -0.59], rot: [90, 0, 0], color: "steel", mirror: true, fine: true },
    );
    return p;
  }
  p.push(
    // goulottes de sortie filtrée de part et d'autre du rideau
    { shape: "extrude", profile: [[-0.12, 0], [0.12, 0], [0.12, 0.42], [0.06, 0.5], [-0.12, 0.5]], depth: 0.24, pos: [0.71, 0.3, 0.81], rot: [0, -90, 0], color: "light", mirror: true },
    { shape: "box", size: [0.16, 0.05, 0.04], pos: [0.71, 0.42, 0.94], color: "amber", mirror: true },
    { shape: "box", size: [0.16, 0.05, 0.04], pos: [0.71, 0.66, 0.94], color: "glow", mirror: true },
    // ceinture entre les deux étages
    { shape: "bevel", size: [1.9, 0.14, 1.78], pos: [0, 1.24, -0.07], color: "metal" },
    { shape: "box", size: [1.6, 0.05, 0.03], pos: [0, 1.24, 0.825], color: "amber" },
    // étage de stockage, hublots lumineux, nervures, blindages
    { shape: "bevel", size: [1.72, 0.86, 1.6], pos: [0, 1.74, -0.07], color: "dark" },
    { shape: "bevel", size: [0.36, 0.6, 0.36], pos: [0.74, 1.72, 0.6], color: "light", mirror: true },
    { shape: "bevel", size: [0.36, 0.6, 0.36], pos: [0.74, 1.72, -0.74], color: "light", mirror: true },
    ...[-0.26, 0.26].flatMap((x): Part[] => [
      { shape: "cylinder", sides: 12, radius: 0.13, height: 0.04, pos: [x, 1.78, 0.73], rot: [90, 0, 0], color: "steel" },
      { shape: "cylinder", sides: 12, radius: 0.1, height: 0.03, pos: [x, 1.78, 0.745], rot: [90, 0, 0], color: "glow" },
    ]),
    { shape: "box", size: [0.04, 0.6, 1.1], pos: [0.87, 1.74, -0.07], color: "metal", mirror: true },
    { shape: "box", size: [0.03, 0.04, 0.9], pos: [0.89, 1.98, -0.07], color: "glow", mirror: true },
    ...lotARang(4, { shape: "box", size: [0.02, 0.4, 0.03], color: "dark", mirror: true }, [0.89, 1.68, -0.47], [0.89, 1.68, 0.33]),
    // toit plat d'équipe et rambarde (montants ambre)
    { shape: "bevel", size: [1.78, 0.12, 1.62], pos: [0, 2.23, -0.07], color: "faction" },
    { shape: "box", size: [1.7, 0.1, 0.04], pos: [0, 2.36, 0.7], color: "metal" },
    { shape: "box", size: [1.7, 0.1, 0.04], pos: [0, 2.36, -0.84], color: "metal" },
    { shape: "box", size: [0.04, 0.1, 1.5], pos: [0.85, 2.36, -0.07], color: "metal", mirror: true },
    { shape: "box", size: [0.12, 0.22, 0.12], pos: [0.78, 2.4, 0.64], color: "amber", mirror: true },
    { shape: "box", size: [0.1, 0.18, 0.1], pos: [0.79, 2.38, -0.78], color: "metal", mirror: true, fine: true },
  );
  return p;
}

export const BUILDING_MODELS: Record<string, Model> = {
  // extractor : tour de forage effilée à coiffe d'équipe, foret hélicoïdal tournant au-dessus d'un puits à lèvre de
  // minerai, tête motrice à tambour de cuivre, cuve claire et réservoir à bande de minerai, trémie de sortie
  extractor: { parts: lotAExtracteur(1) },
  // extractor_n2 : niveau 2, tour rehaussée d'un fût à ouïes et cerclée de bandes de danger, balise, rambarde,
  // anneau lumineux au puits, troisième cuve à l'avant gauche
  extractor_n2: { parts: lotAExtracteur(2) },
  // extractor_n3 : niveau 3, derrick à treillis lumineux autour de la tour, couronne d'équipe et antenne,
  // bobines d'énergie autour du foret, second foret à l'avant gauche
  extractor_n3: { parts: lotAExtracteur(3) },
  // belt1 : rebords clairs, flèche sombre, voyants ambre (96 triangles)
  belt1: tapis("metal", "dark", "amber", 0.3),
  // collector : collecteur de surplus, tapis surmonté d'un portique et d'une trémie qui aspire le surplus ;
  // capot profilé clair, bouche ambrée, toit d'équipe, trémie tournée et sa gaine de cuivre
  collector: {
    parts: [
      ...tapis("metal", "dark", "amber", 0.3).parts,
      // quatre pieds courts de part et d'autre du tapis, platines et goussets
      { shape: "box", size: [0.07, 0.42, 0.07], pos: [0.37, 0.21, 0.28], color: "steel", mirror: true },
      { shape: "box", size: [0.07, 0.42, 0.07], pos: [0.37, 0.21, -0.28], color: "steel", mirror: true },
      { shape: "box", size: [0.12, 0.02, 0.12], pos: [0.37, 0.01, 0.28], color: "dark", mirror: true, fine: true },
      { shape: "box", size: [0.12, 0.02, 0.12], pos: [0.37, 0.01, -0.28], color: "dark", mirror: true, fine: true },
      { shape: "box", size: [0.075, 0.06, 0.075], pos: [0.37, 0.15, 0.28], color: "hazard", mirror: true, fine: true },
      { shape: "box", size: [0.075, 0.06, 0.075], pos: [0.37, 0.15, -0.28], color: "hazard", mirror: true, fine: true },
      // capot profilé au-dessus du tapis, bouche d'aspiration ambrée dessous, filets sur les flancs
      { shape: "extrude", profile: [[-0.42, 0.42], [0.42, 0.42], [0.42, 0.57], [0.32, 0.66], [-0.32, 0.66], [-0.42, 0.57]], depth: 0.7, bevel: 0.015, color: "light" },
      { shape: "box", size: [0.56, 0.02, 0.5], pos: [0, 0.415, 0], color: "amber" },
      { shape: "bevel", size: [0.6, 0.07, 0.46], pos: [0, 0.69, 0], color: "faction" },
      { shape: "box", size: [0.02, 0.05, 0.5], pos: [0.425, 0.53, 0], color: "glow", mirror: true },
      ...lotARang(3, { shape: "box", size: [0.56, 0.015, 0.012], color: "black" }, [0, 0.47, 0.356], [0, 0.59, 0.356]),
      // trémie de réserve sur le capot, gaine de cuivre, voyant
      { shape: "lathe", sides: 12, pos: [0.12, 0.72, -0.08], color: "metal", profile: [[0, 0], [0.1, 0], [0.1, 0.05], [0.16, 0.17], [0.17, 0.2], [0.14, 0.2], [0, 0.1]] },
      { shape: "torus", radius: 0.12, tube: 0.012, sides: 10, pos: [0.12, 0.83, -0.08], color: "dark", fine: true },
      { shape: "tube", radius: 0.025, sides: 5, path: [[-0.06, 0.82, -0.08], [-0.2, 0.82, -0.08], [-0.24, 0.75, 0.05]], bend: 0.06, color: "copper", fine: true },
      { shape: "box", size: [0.1, 0.04, 0.03], pos: [-0.2, 0.75, 0.24], color: "amber" },
    ],
  },
  // belt1_virage_g / _d : virage (objets entrant par la gauche / la droite du sens de marche)
  belt1_virage_g: tapisVirage("metal", "dark", "amber", -1),
  belt1_virage_d: tapisVirage("metal", "dark", "amber", 1),
  // belt1_jonction_g / _d / _gd : tapis droit rejoint par le côté gauche (-x), droit (+x) ou les deux
  belt1_jonction_g: tapisJonction("metal", "dark", "amber", 0.3, [-1]),
  belt1_jonction_d: tapisJonction("metal", "dark", "amber", 0.3, [1]),
  belt1_jonction_gd: tapisJonction("metal", "dark", "amber", 0.3, [-1, 1]),
  // belt2 : tapis sombre, flèche jaune, filets cyan (96 triangles)
  belt2: tapis("dark", "hazard", "glow", 0.4),
  // belt2_virage_g / _d : virage (objets entrant par la gauche / la droite du sens de marche)
  belt2_virage_g: tapisVirage("dark", "hazard", "glow", -1),
  belt2_virage_d: tapisVirage("dark", "hazard", "glow", 1),
  // belt2_jonction_g / _d / _gd : tapis droit rejoint par le côté gauche (-x), droit (+x) ou les deux
  belt2_jonction_g: tapisJonction("dark", "hazard", "glow", 0.4, [-1]),
  belt2_jonction_d: tapisJonction("dark", "hazard", "glow", 0.4, [1]),
  belt2_jonction_gd: tapisJonction("dark", "hazard", "glow", 0.4, [-1, 1]),
  // belt3 : tapis sombre, flèche et longs filets cyan (96 triangles)
  belt3: tapis("dark", "glow", "glow", 0.8),
  // belt3_virage_g / _d : virage (objets entrant par la gauche / la droite du sens de marche)
  belt3_virage_g: tapisVirage("dark", "glow", "glow", -1),
  belt3_virage_d: tapisVirage("dark", "glow", "glow", 1),
  // belt3_jonction_g / _d / _gd : tapis droit rejoint par le côté gauche (-x), droit (+x) ou les deux
  belt3_jonction_g: tapisJonction("dark", "glow", "glow", 0.8, [-1]),
  belt3_jonction_d: tapisJonction("dark", "glow", "glow", 0.8, [1]),
  belt3_jonction_gd: tapisJonction("dark", "glow", "glow", 0.8, [-1, 1]),
  // inserter : petit socle rond à liseré cyan, embase d'équipe à pans coupés, colonne d'acier, bras (pivot) à
  // rotule et pince à deux doigts ; rotule, doigts et voyant en pièces fines
  inserter: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.24, height: 0.08, pos: [0, 0.04, 0], color: "dark" },
      { shape: "box", size: [0.34, 0.02, 0.34], pos: [0, 0.09, -0.04], color: "glow" },
      { shape: "extrude", profile: LOTA_SOCLE_BRAS, depth: 0.12, pos: [0, 0.16, -0.04], rot: [90, 0, 0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.26, pos: [0, 0.34, -0.04], color: "steel" },
      { shape: "box", size: [0.04, 0.03, 0.02], pos: [0, 0.18, 0.105], color: "amber", fine: true },
      { shape: "box", size: [0.06, 0.06, 0.66], pos: [0, 0.48, 0.2], color: "light", pivot: "bras" },
      { shape: "cylinder", sides: 6, radius: 0.05, height: 0.12, pos: [0, 0.48, -0.04], rot: [0, 0, 90], color: "steel", parent: "bras", fine: true },
      { shape: "box", size: [0.03, 0.025, 0.5], pos: [0, 0.52, 0.22], color: "hazard", parent: "bras", fine: true },
      { shape: "box", size: [0.16, 0.07, 0.07], pos: [0, 0.44, 0.53], color: "dark", parent: "bras" },
      { shape: "box", size: [0.03, 0.08, 0.05], pos: [0.065, 0.37, 0.53], color: "steel", parent: "bras", mirror: true, fine: true },
    ],
  },
  // long_inserter : bras long (prise et dépose à 2 cases) ; liseré ambre, colonne haute pour passer par-dessus un
  // tapis, moyeu au centre (pivot) et flèche de 1,6 case à membrure de treillis, contrepoids et pince à doigts
  long_inserter: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.26, height: 0.08, pos: [0, 0.04, 0], color: "dark" },
      { shape: "box", size: [0.36, 0.02, 0.36], pos: [0, 0.09, 0], color: "amber" },
      { shape: "extrude", profile: LOTA_SOCLE_BRAS, depth: 0.12, pos: [0, 0.16, 0], rot: [90, 0, 0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.055, height: 0.42, pos: [0, 0.43, 0], color: "steel" },
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.05, pos: [0, 0.3, 0], color: "metal", fine: true },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.1, pos: [0, 0.66, 0], color: "light", pivot: "bras" },
      { shape: "box", size: [0.06, 0.06, 1.6], pos: [0, 0.7, 0.72], color: "light", parent: "bras" },
      { shape: "box", size: [0.03, 0.02, 1.2], pos: [0, 0.74, 0.62], color: "amber", parent: "bras" },
      { shape: "box", size: [0.06, 0.06, 0.3], pos: [0, 0.7, -0.2], color: "dark", parent: "bras" },
      { shape: "box", size: [0.14, 0.1, 0.12], pos: [0, 0.7, -0.36], color: "dark", parent: "bras" },
      // membrure inférieure en treillis (fine)
      { shape: "box", size: [0.025, 0.025, 1.25], pos: [0, 0.62, 0.78], color: "steel", parent: "bras", fine: true },
      ...[0.25, 0.65, 1.05].map((z): Part => ({ shape: "box", size: [0.02, 0.11, 0.02], pos: [0, 0.66, z], rot: [40, 0, 0], color: "steel", parent: "bras", fine: true })),
      { shape: "box", size: [0.05, 0.2, 0.05], pos: [0, 0.6, 1.5], color: "metal", parent: "bras" },
      { shape: "box", size: [0.18, 0.07, 0.08], pos: [0, 0.48, 1.5], color: "dark", parent: "bras" },
      { shape: "box", size: [0.03, 0.08, 0.05], pos: [0.07, 0.41, 1.5], color: "steel", parent: "bras", mirror: true, fine: true },
    ],
  },
  // furnace : four de briques sombre à piliers d'angle clairs, gueule en arc à braise ambre et grille, toit
  // d'équipe (centre dégagé pour l'icône de la recette), cheminée tournée rougeoyante
  furnace: { parts: lotAFonderie(1) },
  // furnace_n2 : fonderie améliorée (automatisation) : échangeurs de chaleur ambrés sur les flancs, seconde
  // cheminée et soufflerie sur le toit
  furnace_n2: { parts: lotAFonderie(2) },
  // furnace_n3 : fonderie à induction (électronique) : four rehaussé, ailettes de refroidissement, bobines de
  // cuivre à cœur cyan aux coins du toit, haute cheminée
  furnace_n3: { parts: lotAFonderie(3) },

  // assembler1 : caisson à coins clairs, couvercle ouvert à l'arrière sur charnière et vérins, bras robotisé
  // articulé sur le pilier arrière gauche, tourné en diagonale (le centre du toit reste dégagé pour l'icône de
  // la recette), armoire de commande à écran sur le pilier avant droit
  assembler1: {
    parts: [
      ...lotACaisson("amber"),
      ...lotABras(-1.1, -1.1, true, { yaw: 45, reach: 0.85, lift: 0.19 }),
      { shape: "cylinder", sides: 12, radius: 0.05, height: 1.6, pos: [0.1, 1.09, -0.98], rot: [0, 0, 90], color: "steel" },
      { shape: "bevel", size: [1.7, 0.08, 0.9], pos: [0.1, 1.47, -1.1], rot: [70, 0, 0], color: "light" },
      { shape: "box", size: [1.2, 0.03, 0.05], pos: [0.1, 1.75, -1.12], rot: [70, 0, 0], color: "glow" },
      { shape: "box", size: [0.05, 0.03, 0.8], pos: [-0.45, 1.47, -1.13], rot: [70, 0, 0], color: "metal", mirror: true, fine: true },
      { shape: "tube", radius: 0.02, sides: 5, path: [[0.75, 1.1, -0.82], [0.75, 1.55, -1.08]], color: "steel", fine: true },
      { shape: "tube", radius: 0.02, sides: 5, path: [[-0.55, 1.1, -0.82], [-0.55, 1.55, -1.08]], color: "steel", fine: true },
      { shape: "bevel", size: [0.42, 0.26, 0.36], pos: [1.1, 1.29, 1.08], color: "light" },
      { shape: "box", size: [0.32, 0.14, 0.02], pos: [1.1, 1.33, 1.265], rot: [-12, 0, 0], color: "glow" },
      { shape: "box", size: [0.1, 0.05, 0.03], pos: [1.1, 1.2, 1.27], color: "amber" },
      { shape: "box", size: [0.3, 0.02, 0.24], pos: [1.1, 1.43, 1.06], color: "dark", fine: true },
      { shape: "tube", radius: 0.012, sides: 4, path: [[1.24, 1.42, 0.98], [1.24, 1.75, 0.98]], color: "dark", fine: true },
      { shape: "sphere", radius: 0.03, pos: [1.24, 1.76, 0.98], color: "amber", fine: true },
    ],
  },
  // assembler2 : plateau vitré à croix lumineuse dans un cadre noir, deux bras articulés de part et d'autre,
  // voyants ambre sur les piliers, bacs de pièces sur le cadre avant
  assembler2: {
    parts: [
      ...lotACaisson("amber"),
      { shape: "bevel", size: [1.2, 0.1, 1.2], pos: [0, 1.02, 0.1], bevel: 0.04, color: "black" },
      { shape: "box", size: [1.0, 0.04, 1.0], pos: [0, 1.08, 0.1], color: "glass" },
      { shape: "box", size: [1.0, 0.03, 0.06], pos: [0, 1.1, 0.1], color: "glow" },
      { shape: "box", size: [0.06, 0.03, 1.0], pos: [0, 1.1, 0.1], color: "glow" },
      ...lotARang(4, { shape: "box", size: [0.03, 0.025, 1.1], color: "steel" }, [-0.42, 1.085, 0.1], [0.42, 1.085, 0.1]).filter((_, i) => i === 0 || i === 3),
      ...lotABras(0.82, -0.45, true),
      ...lotABras(-0.82, -0.45, false),
      { shape: "bevel", size: [0.34, 0.12, 0.24], pos: [0.5, 1.17, 1.05], bevel: 0.02, color: "light", mirror: true },
      { shape: "box", size: [0.28, 0.02, 0.18], pos: [0.5, 1.23, 1.05], color: "copper", mirror: true, fine: true },
    ],
  },
  // assembler3 : disque holographique à cubes lumineux sur couronne cyan, émetteurs, écran à l'arrière sur
  // pieds d'acier, bras articulé, voyants cyan sur les piliers
  assembler3: {
    parts: [
      ...lotACaisson("glow"),
      { shape: "lathe", sides: 16, pos: [0, 0.97, 0.2], color: "dark", profile: [[0, 0], [0.62, 0], [0.62, 0.07], [0.56, 0.1], [0, 0.1]] },
      { shape: "torus", radius: 0.5, tube: 0.025, sides: 16, pos: [0, 1.08, 0.2], color: "glow" },
      { shape: "cylinder", sides: 12, radius: 0.36, height: 0.02, pos: [0, 1.075, 0.2], color: "glass" },
      ...[0, 120, 240].map((a): Part => ({ shape: "cone", sides: 6, radius: 0.05, height: 0.12, pos: [lotAr(Math.sin((a * Math.PI) / 180) * 0.56), 1.14, lotAr(0.2 + Math.cos((a * Math.PI) / 180) * 0.56)], color: "steel", fine: true })),
      { shape: "box", size: [0.18, 0.18, 0.18], pos: [0.1, 1.25, 0.2], rot: [0, 30, 0], color: "glow" },
      { shape: "box", size: [0.14, 0.14, 0.14], pos: [-0.16, 1.2, 0.3], rot: [0, 15, 0], color: "glow" },
      { shape: "box", size: [0.12, 0.12, 0.12], pos: [-0.02, 1.42, 0.12], rot: [20, 40, 0], color: "glow" },
      { shape: "bevel", size: [1.3, 0.7, 0.1], pos: [0.1, 1.45, -0.85], bevel: 0.03, color: "dark" },
      { shape: "box", size: [1.14, 0.56, 0.03], pos: [0.1, 1.45, -0.79], color: "glow" },
      ...lotARang(3, { shape: "box", size: [1.0, 0.02, 0.01], color: "faction" }, [0.1, 1.3, -0.774], [0.1, 1.6, -0.774]),
      { shape: "box", size: [1.1, 0.46, 0.03], pos: [0.1, 1.42, -0.915], color: "steel", fine: true },
      ...lotABras(-0.85, -0.3, true),
    ],
  },
  // refinery : colonne de distillation à plateformes, colonne claire à dôme, ballon couché sur berceaux de béton,
  // tuyauteries coudées en cuivre à brides, pupitre ; pièces fines : rambardes, échelles, vannes, cerclages
  refinery: {
    parts: [
      ...socle(3),
      ...filets(3),
      // dalles de béton sous les colonnes
      { shape: "bevel", size: [1.25,0.08,1.25], pos: [-0.62,0.29,-0.62], bevel: 0.03, color: "concrete" },
      { shape: "bevel", size: [0.9,0.08,0.9], pos: [0.55,0.29,-0.75], bevel: 0.03, color: "concrete" },
      // grande colonne : jupe, fût, bandeau d'équipe, dôme, évent
      { shape: "lathe", sides: 16, pos: [-0.62,0,-0.62], color: "faction", profile: [[0,0.33],[0.42,0.33],[0.42,2.05],[0.38,2.22],[0.27,2.36],[0.12,2.42],[0.12,2.56],[0.15,2.58],[0.15,2.64],[0,2.64]] },
      { shape: "cylinder", sides: 16, radius: 0.5, radiusTop: 0.46, height: 0.24, bevel: 0.03, pos: [-0.62,0.45,-0.62], color: "dark" },
      { shape: "cylinder", sides: 16, radius: 0.44, height: 0.3, bevel: 0.02, pos: [-0.62,1.85,-0.62], color: "dark" },
      { shape: "torus", radius: 0.43, tube: 0.025, sides: 16, pos: [-0.62,0.95,-0.62], color: "metal" },
      { shape: "torus", radius: 0.43, tube: 0.025, sides: 16, pos: [-0.62,1.35,-0.62], color: "metal", fine: true },
      { shape: "box", size: [0.05,0.9,0.03], pos: [-0.62,1.25,-0.2], color: "glow" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [-0.62,2.12,-0.24], color: "amber" },
      // plateforme circulaire et sa rambarde, échelle
      { shape: "lathe", sides: 16, pos: [-0.62,0,-0.62], color: "metal", profile: [[0.42,1.56],[0.64,1.56],[0.64,1.61],[0.42,1.61]] },
      { shape: "torus", radius: 0.63, tube: 0.015, sides: 16, pos: [-0.62,1.8,-0.62], color: "hazard", fine: true },
      ...[0, 90, 180, 270].map((a): Part => ({ shape: "box", size: [0.025,0.2,0.025], pos: [-0.62 + 0.62 * Math.sin((a * Math.PI) / 180),1.7,-0.62 + 0.62 * Math.cos((a * Math.PI) / 180)], color: "light", fine: true })),
      { use: "echelle", pos: [-0.62,0.56,-0.17], scale: [1,1.0,1], rot: [0,0,0] },
      // colonne claire (sous-ensemble cuve), bandeau d'équipe et feu
      { use: "cuve", pos: [0.55,0.33,-0.75], scale: [0.66,1.6,0.66] },
      { shape: "cylinder", sides: 16, radius: 0.34, height: 0.22, bevel: 0.015, pos: [0.55,1.2,-0.75], color: "faction" },
      { shape: "box", size: [0.04,0.24,0.03], pos: [0.55,0.8,-0.41], color: "glow" },
      { shape: "sphere", radius: 0.07, pos: [0.55,1.95,-0.75], color: "amber" },
      { use: "echelle", pos: [0.21,0.33,-0.75], rot: [0,-90,0], scale: [1,1.3,1] },
      // petite colonne
      { use: "cuve", pos: [0.15,0.25,0.15], scale: [0.42,0.8,0.42] },
      { shape: "sphere", radius: 0.06, pos: [0.15,1.08,0.15], color: "amber" },
      // rack de tuyauteries à l'arrière : deux portiques, trois conduites parallèles
      { shape: "box", size: [0.06,0.95,0.06], pos: [-0.05,0.75,-1.3], color: "dark" },
      { shape: "box", size: [0.06,0.95,0.06], pos: [-0.05,0.75,-0.95], color: "dark", fine: true },
      { shape: "box", size: [0.06,0.06,0.45], pos: [-0.05,1.2,-1.12], color: "dark" },
      { shape: "tube", radius: 0.04, path: [[-0.6,1.27,-1.25],[0.55,1.27,-1.25]], color: "copper" },
      { shape: "tube", radius: 0.04, path: [[-0.6,1.27,-1.12],[0.55,1.27,-1.12]], color: "metal" },
      { shape: "tube", radius: 0.04, path: [[-0.6,1.27,-0.99],[0.55,1.27,-0.99]], color: "steel", fine: true },
      // ballon couché sur deux berceaux de béton
      { shape: "lathe", sides: 16, pos: [-0.72,0.66,0.62], rot: [0,0,90], color: "light", profile: [[0,-0.68],[0.14,-0.66],[0.26,-0.6],[0.33,-0.48],[0.33,0.48],[0.26,0.6],[0.14,0.66],[0,0.68]] },
      { shape: "cylinder", sides: 16, radius: 0.345, height: 0.14, pos: [-0.5,0.66,0.62], rot: [0,0,90], color: "faction" },
      { shape: "torus", radius: 0.335, tube: 0.02, sides: 16, pos: [-1.0,0.66,0.62], rot: [0,0,90], color: "metal", fine: true },
      { shape: "extrude", profile: [[-0.3,0],[0.3,0],[0.3,0.3],[0.2,0.3],[0.12,0.2],[-0.12,0.2],[-0.2,0.3],[-0.3,0.3]], depth: 0.14, bevel: 0.02, pos: [-1.05,0.25,0.62], rot: [0,90,0], color: "concrete" },
      { shape: "extrude", profile: [[-0.3,0],[0.3,0],[0.3,0.3],[0.2,0.3],[0.12,0.2],[-0.12,0.2],[-0.2,0.3],[-0.3,0.3]], depth: 0.14, bevel: 0.02, pos: [-0.4,0.25,0.62], rot: [0,90,0], color: "concrete" },
      { shape: "cylinder", sides: 12, radius: 0.24, height: 0.04, pos: [-1.41,0.66,0.62], rot: [0,0,90], color: "glow" },
      // tuyauteries coudées en cuivre, brides et vannes
      { shape: "tube", radius: 0.055, path: [[-0.2,0.75,-0.62],[0.15,0.75,-0.62],[0.15,0.75,-0.1],[0.15,0.95,0.15]], bend: 0.12, color: "copper" },
      { shape: "tube", radius: 0.055, path: [[-0.62,1.45,-0.2],[-0.62,1.45,0.0],[0.0,1.45,0.0],[0.25,1.45,-0.75]], bend: 0.15, color: "copper" },
      { shape: "tube", radius: 0.05, path: [[-0.72,1.0,0.62],[-0.72,1.25,0.62],[-0.72,1.25,0.0],[-0.62,1.25,-0.2]], bend: 0.12, color: "metal" },
      { shape: "tube", radius: 0.05, path: [[0.89,0.9,-0.75],[1.1,0.9,-0.75],[1.1,0.45,-0.75],[1.1,0.45,0.3],[0.6,0.45,0.6]], bend: 0.15, color: "metal" },
      { shape: "torus", radius: 0.07, tube: 0.02, sides: 10, pos: [0.15,0.75,-0.35], rot: [90,0,0], color: "steel", fine: true },
      { shape: "torus", radius: 0.07, tube: 0.02, sides: 10, pos: [-0.3,1.45,0.0], rot: [0,0,90], color: "steel", fine: true },
      { shape: "torus", radius: 0.065, tube: 0.02, sides: 10, pos: [1.1,0.45,-0.2], rot: [90,0,0], color: "steel", fine: true },
      { use: "vanne", pos: [0.15,0.8,-0.5] },
      { use: "vanne", pos: [1.1,0.5,0.05] },
      // pupitre de commande à écran
      { shape: "bevel", size: [0.9,0.3,0.6], pos: [0.55,0.4,0.85], color: "light" },
      { shape: "bevel", size: [0.7,0.22,0.08], pos: [0.55,0.62,0.7], rot: [-25,0,0], bevel: 0.02, color: "dark" },
      { shape: "box", size: [0.6,0.15,0.02], pos: [0.55,0.63,0.745], rot: [-25,0,0], color: "glow" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.85,0.42,1.16], color: "amber" },
    ],
  },
  // chemical : usine chimique — muret de rétention en béton au bord de l'emprise (trappes), bloc arrière d'équipe
  // à ouïes et deux cheminées, réservoir d'acier à anneau lumineux, réservoir clair à dôme et rambarde, fiole
  // vitrée, deux cuves ouvertes au liquide lumineux brassé par un agitateur, tuyauteries de cuivre à brides
  chemical: {
    parts: [
      ...socle(3),
      ...filets(3),
      // muret de rétention
      { shape: "box", size: [2.9, 0.22, 0.08], pos: [0, 0.36, 1.41], color: "concrete" },
      { shape: "box", size: [2.9, 0.22, 0.08], pos: [0, 0.36, -1.41], color: "concrete" },
      { shape: "box", size: [0.08, 0.22, 2.74], pos: [1.41, 0.36, 0], color: "concrete", mirror: true },
      { shape: "box", size: [0.6, 0.03, 0.09], pos: [0.9, 0.47, 1.41], color: "hazard", fine: true },
      // bloc arrière aux couleurs de l'équipe, ouïes, deux cheminées
      { shape: "bevel", size: [1.2, 0.6, 0.7], pos: [-0.5, 0.55, -0.95], color: "faction" },
      ...lotARang(4, { shape: "box", size: [0.8, 0.025, 0.02], color: "black" }, [-0.5, 0.44, -0.595], [-0.5, 0.68, -0.595]),
      { shape: "lathe", sides: 12, pos: [-0.75, 0.85, -0.95], color: "light", profile: [[0, 0], [0.2, 0], [0.17, 0.1], [0.15, 1.3], [0.18, 1.35], [0.18, 1.43], [0, 1.43]] },
      { shape: "cylinder", sides: 12, radius: 0.175, height: 0.12, pos: [-0.75, 1.6, -0.95], color: "dark" },
      { shape: "cylinder", sides: 12, radius: 0.13, height: 0.02, pos: [-0.75, 2.28, -0.95], color: "black" },
      { shape: "lathe", sides: 12, pos: [-0.3, 0.85, -1.0], color: "light", profile: [[0, 0], [0.16, 0], [0.13, 0.1], [0.12, 0.92], [0.15, 0.97], [0.15, 1.03], [0, 1.03]] },
      { shape: "cylinder", sides: 12, radius: 0.1, height: 0.02, pos: [-0.3, 1.88, -1.0], color: "black" },
      { shape: "torus", radius: 0.125, tube: 0.02, sides: 12, pos: [-0.3, 1.4, -1.0], color: "dark", fine: true },
      { use: "echelle", pos: [-0.75, 0.87, -0.78], scale: [0.8, 1.1, 1], rot: [0, 180, 0] },
      // réservoir d'acier à anneau lumineux, voyant
      { shape: "lathe", sides: 16, pos: [-1.08, 0.25, -0.25], color: "steel", profile: [[0, 0], [0.34, 0], [0.34, 0.06], [0.32, 0.08], [0.32, 0.95], [0.26, 1.03], [0.12, 1.07], [0, 1.08]] },
      { shape: "torus", radius: 0.33, tube: 0.03, sides: 12, pos: [-1.08, 1.0, -0.25], color: "glow" },
      { shape: "torus", radius: 0.325, tube: 0.02, sides: 16, pos: [-1.08, 0.55, -0.25], color: "dark", fine: true },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [-1.08, 0.6, 0.08], color: "amber" },
      // réservoir clair à dôme : bandeau d'équipe, rambarde et trou d'homme sur le dôme
      { shape: "lathe", sides: 16, pos: [-0.5, 0.25, 0.3], color: "light", profile: [[0, 0], [0.47, 0], [0.47, 0.08], [0.45, 0.1], [0.45, 0.6], [0.42, 0.72], [0.33, 0.83], [0.18, 0.9], [0, 0.92]] },
      { shape: "cylinder", sides: 16, radius: 0.46, height: 0.1, pos: [-0.5, 0.45, 0.3], color: "faction" },
      { shape: "torus", radius: 0.38, tube: 0.012, sides: 16, pos: [-0.5, 1.03, 0.3], color: "hazard", fine: true },
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "box", size: [0.02, 0.17, 0.02], pos: [lotAr(-0.5 + Math.sin((a * Math.PI) / 180) * 0.38), 0.95, lotAr(0.3 + Math.cos((a * Math.PI) / 180) * 0.38)], color: "light", fine: true })),
      { shape: "cylinder", sides: 10, radius: 0.09, height: 0.06, pos: [-0.5, 1.18, 0.3], color: "steel" },
      // fiole vitrée à liquide lumineux
      { shape: "lathe", sides: 12, pos: [-0.85, 0.25, 0.95], color: "glow", profile: [[0, 0], [0.12, 0], [0.18, 0.08], [0.19, 0.18], [0.14, 0.3], [0.07, 0.36], [0, 0.36]] },
      { shape: "lathe", sides: 12, pos: [-0.85, 0.6, 0.95], color: "glass", profile: [[0.075, 0], [0.075, 0.15], [0.095, 0.17], [0, 0.17]] },
      { shape: "torus", radius: 0.19, tube: 0.015, sides: 12, pos: [-0.85, 0.43, 0.95], color: "steel", fine: true },
      // cuves ouvertes : fût d'acier, lèvre, liquide lumineux, anneau au pied, agitateur sur passerelle
      ...([[0.55, 0.55, 0.5, 0.62], [0.75, -0.6, 0.46, 0.57]] as const).flatMap(([x, z, r, h]): Part[] => [
        { shape: "lathe", sides: 16, pos: [x, 0.25, z], color: "steel", profile: [[0, 0], [lotAr(r + 0.02), 0], [lotAr(r + 0.02), 0.06], [r, 0.08], [r, h], [lotAr(r - 0.05), h], [lotAr(r - 0.05), lotAr(h - 0.08)], [0, lotAr(h - 0.08)]] },
        { shape: "torus", radius: lotAr(r - 0.02), tube: 0.035, sides: 12, pos: [x, lotAr(0.25 + h), z], color: "metal" },
        { shape: "cylinder", sides: 16, radius: lotAr(r - 0.045), height: 0.02, pos: [x, lotAr(0.25 + h - 0.07), z], color: "glow" },
        { shape: "cylinder", sides: 16, radius: lotAr(r + 0.015), height: 0.04, pos: [x, 0.36, z], color: "glow" },
        { shape: "box", size: [lotAr(2 * r + 0.06), 0.05, 0.1], pos: [x, lotAr(0.25 + h + 0.05), z], color: "dark" },
        { shape: "cylinder", sides: 10, radius: 0.08, height: 0.14, pos: [x, lotAr(0.25 + h + 0.14), z], color: "faction" },
        { shape: "cylinder", sides: 6, radius: 0.02, height: 0.36, pos: [x, lotAr(0.25 + h - 0.12), z], color: "steel", fine: true },
      ]),
      // tuyauteries de cuivre à brides, vannes
      { shape: "tube", radius: 0.05, path: [[-0.62, 0.42, 0.3], [0.05, 0.42, 0.3], [0.05, 0.42, 0.0], [0.45, 0.42, -0.45]], bend: 0.12, color: "copper" },
      { shape: "tube", radius: 0.05, path: [[-1.08, 0.75, 0.05], [-1.08, 0.75, 0.3], [-0.97, 0.75, 0.3]], bend: 0.1, color: "copper" },
      { shape: "tube", radius: 0.045, path: [[-0.4, 0.4, 1.2], [0.55, 0.4, 1.2], [0.55, 0.4, 1.0]], bend: 0.1, color: "metal" },
      { shape: "tube", radius: 0.04, path: [[0.1, 0.55, -0.62], [0.1, 0.9, -0.62], [0.1, 0.9, -0.9], [-0.1, 0.75, -0.9]], bend: 0.1, color: "metal" },
      { shape: "torus", radius: 0.065, tube: 0.02, sides: 10, pos: [-0.25, 0.42, 0.3], rot: [0, 0, 90], color: "steel", fine: true },
      { shape: "torus", radius: 0.06, tube: 0.02, sides: 10, pos: [0.2, 0.4, 1.2], rot: [0, 0, 90], color: "steel", fine: true },
      { use: "vanne", pos: [0.05, 0.45, 0.15] },
      { use: "vanne", pos: [-0.1, 0.43, 1.2] },
      { shape: "box", size: [0.1, 0.06, 0.03], pos: [1.1, 0.4, 1.36], color: "amber" },
    ],
  },
  // lab : caisson carré (ses parois portent les trappes) à grilles fines, coins clairs, liseré cyan ; anneau
  // tourné clair et bandeau d'équipe, dôme vitré à nervures sur un cœur lumineux, lanterne d'équipe ;
  // pupitre holographique et râtelier d'éprouvettes sur deux coins du caisson
  lab: {
    parts: [
      ...socle(3),
      ...filets(3),
      // caisson : parois droites jusqu'au bord de l'emprise, coins chanfreinés clairs, liseré haut, grilles
      { shape: "bevel", size: [2.84, 0.6, 2.84], pos: [0, 0.55, 0], bevel: 0.08, color: "dark" },
      { shape: "bevel", size: [0.36, 0.66, 0.36], pos: [1.26, 0.56, 1.26], bevel: 0.06, color: "light", mirror: true },
      { shape: "bevel", size: [0.36, 0.66, 0.36], pos: [1.26, 0.56, -1.26], bevel: 0.06, color: "light", mirror: true },
      { shape: "box", size: [2.3, 0.04, 0.03], pos: [0, 0.8, 1.43], color: "glow" },
      { shape: "box", size: [0.03, 0.04, 2.3], pos: [1.43, 0.8, 0], color: "glow", mirror: true },
      { shape: "box", size: [2.3, 0.04, 0.03], pos: [0, 0.8, -1.43], color: "glow" },
      { shape: "box", size: [2.0, 0.03, 0.02], pos: [0, 0.34, 1.425], color: "hazard", fine: true },
      ...lotARang(4, { shape: "box", size: [0.02, 0.025, 1.6], color: "black", mirror: true }, [1.425, 0.45, 0], [1.425, 0.66, 0]),
      ...lotARang(4, { shape: "box", size: [1.6, 0.025, 0.02], color: "black" }, [0, 0.45, -1.425], [0, 0.66, -1.425]),
      // anneau tourné posé sur le caisson, liseré lumineux, bandeau d'équipe
      { shape: "lathe", sides: 16, pos: [0, 0.85, 0], color: "light", profile: [[0.9, 0], [1.3, 0], [1.3, 0.04], [1.24, 0.24], [1.2, 0.3], [0.9, 0.3]] },
      { shape: "torus", radius: 1.3, tube: 0.03, sides: 16, pos: [0, 0.88, 0], color: "glow" },
      { shape: "lathe", sides: 16, pos: [0, 1.12, 0], color: "faction", profile: [[0.95, 0], [1.22, 0], [1.22, 0.08], [0.95, 0.08]] },
      // dôme vitré, nervures, cœur lumineux sur colonne d'acier
      { shape: "lathe", sides: 16, pos: [0, 1.18, 0], color: "glass", profile: [[1.0, 0], [0.97, 0.17], [0.87, 0.36], [0.71, 0.5], [0.5, 0.62], [0.26, 0.69], [0, 0.72]] },
      ...[0, 45, 90, 135].map((a): Part => ({ shape: "extrude", profile: arc(1.02, 0.74, 0.04, 8), depth: 0.05, pos: [0, 1.17, 0], rot: [0, a, 0], color: "light" })),
      { shape: "torus", radius: 0.93, tube: 0.025, sides: 16, pos: [0, 1.46, 0], color: "light" },
      { shape: "torus", radius: 0.68, tube: 0.025, sides: 16, pos: [0, 1.7, 0], color: "light", fine: true },
      { shape: "cylinder", sides: 10, radius: 0.08, height: 0.3, pos: [0, 1.3, 0], color: "steel", fine: true },
      { shape: "sphere", radius: 0.2, detail: 1, pos: [0, 1.52, 0], color: "glow" },
      { shape: "lathe", sides: 12, pos: [0, 1.88, 0], color: "faction", profile: [[0, 0], [0.34, 0], [0.34, 0.06], [0.26, 0.11], [0, 0.11]] },
      { shape: "cylinder", sides: 12, radius: 0.18, height: 0.04, pos: [0, 2.0, 0], color: "glow" },
      // pupitre holographique sur le coin arrière droit
      { shape: "lathe", sides: 12, pos: [1.1, 0.85, -1.1], color: "light", profile: [[0, 0], [0.25, 0], [0.25, 0.05], [0.18, 0.1], [0.18, 0.32], [0.27, 0.36], [0.27, 0.43], [0, 0.43]] },
      { shape: "torus", radius: 0.24, tube: 0.015, sides: 12, pos: [1.1, 1.27, -1.1], color: "glow" },
      { shape: "cone", sides: 8, radius: 0.28, height: 0.5, pos: [1.1, 1.53, -1.1], rot: [180, 0, 0], color: "glow" },
      // râtelier d'éprouvettes lumineuses sur le coin avant gauche
      { shape: "bevel", size: [0.44, 0.12, 0.26], pos: [-1.12, 0.92, 1.12], rot: [0, -45, 0], bevel: 0.02, color: "light" },
      ...lotARang(4, { shape: "cylinder", sides: 6, radius: 0.03, height: 0.16, color: "glow" }, [-1.233, 1.04, 1.007], [-1.007, 1.04, 1.233]),
    ],
  },
  // depot : conteneur blindé sombre à tôle nervurée, rideau à lames à l'avant, coins clairs, toit d'équipe à
  // trappe et anneaux de levage
  depot: { parts: lotADepot(1) },
  // depot_n2 : dépôt amélioré, rehaussé d'un étage de stockage à hublots, deux goulottes de sortie filtrée à
  // l'avant, toit plat cerclé d'une rambarde où s'affichent les objets filtrés
  depot_n2: { parts: lotADepot(2) },
  // generator : turbine couchée à hélice, deux bobines à anneaux lumineux (720 triangles)
  generator: {
    parts: [
      ...socle(2),
      ...filets(2),
      // turbine (axe avant-arrière)
      ...turbine(-0.38, 0.05, 1),
      // bobines
      ...bobine(0.55, -0.45, 0.3, 0.9, 3, "faction"),
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.7, pos: [0.6,0.65,0.4], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.07, pos: [0.6,0.55,0.4], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.07, pos: [0.6,0.75,0.4], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.32, height: 0.12, pos: [0.6,1.04,0.4], color: "light" },
      // liaison et voyants
      { shape: "box", size: [0.4,0.14,0.14], pos: [0.1,0.95,-0.35], color: "metal" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.1,0.42,0.71], color: "amber" },
    ],
  },
  // generator_n2 (1128 triangles) : niveau 2, turbine agrandie à anneau lumineux d'entrée d'air, ailettes de
  // refroidissement autour du carter et radiateur sur le dessus, trois bobines en rang (dont une haute à quatre
  // anneaux), câbles épais
  generator_n2: {
    parts: [
      ...socle(2),
      ...filets(2),
      // turbine agrandie
      ...turbine(-0.33, 0, 1.08),
      { shape: "cylinder", sides: 8, radius: 0.565, height: 0.04, pos: [-0.33,1.006,0.6], rot: [90,0,0], color: "glow" },
      ...[0.27, 0.41].map((z): Part => ({ shape: "cylinder", sides: 8, radius: 0.58, height: 0.04, pos: [-0.33,1.006,z], rot: [90,0,0], color: "dark" })),
      // radiateur à ailettes sur le carter
      { shape: "box", size: [0.5,0.2,0.62], pos: [-0.33,1.5,-0.22], color: "dark" },
      ...[-0.18, -0.06, 0.06, 0.18].map((dx): Part => ({ shape: "box", size: [0.05,0.14,0.56], pos: [-0.33 + dx,1.64,-0.22], color: "metal" })),
      // bobines en rang sur la droite
      ...bobine(0.6, -0.58, 0.27, 1.1, 4, "faction"),
      ...bobine(0.62, 0.04, 0.25, 0.85, 3, "faction", false),
      ...bobine(0.62, 0.63, 0.23, 0.6, 2, "light"),
      // câbles épais de la turbine aux bobines, colliers
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.42, pos: [0.15,1.42,-0.5], rot: [0,0,90], color: "black" },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 0.34, pos: [0.22,1.18,0.04], rot: [0,0,90], color: "black" },
      { shape: "box", size: [0.06,0.16,0.16], pos: [0.2,1.42,-0.5], color: "amber" },
      { shape: "box", size: [0.06,0.16,0.16], pos: [0.24,1.18,0.04], color: "amber" },
      // voyants
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.1,0.42,0.71], color: "amber" },
    ],
  },
  // generator_n3 (1436 triangles) : niveau 3, réacteur compact à turbine double sous un carénage à évents lumineux,
  // tour de refroidissement, haute bobine à cinq anneaux et cheminée à l'arrière, plaque de base cerclée d'un rebord
  // blindé à bande de danger
  generator_n3: {
    parts: [
      ...socle(2),
      ...filets(2),
      // plaque renforcée : rebord blindé, bande de danger à l'avant, coins boulonnés
      { shape: "box", size: [0.1,0.08,1.84], pos: [0.9,0.29,0], color: "metal", mirror: true },
      { shape: "box", size: [1.84,0.08,0.1], pos: [0,0.29,-0.9], color: "metal" },
      { shape: "box", size: [1.5,0.06,0.1], pos: [0,0.28,0.9], color: "hazard" },
      { shape: "box", size: [0.2,0.14,0.2], pos: [0.88,0.32,0.88], color: "light", mirror: true },
      { shape: "box", size: [0.2,0.14,0.2], pos: [0.88,0.32,-0.88], color: "light", mirror: true },
      // turbine double, anneaux lumineux d'entrée d'air
      ...turbine(-0.45, 0.3, 0.78),
      ...turbine(0.45, 0.3, 0.78),
      { shape: "cylinder", sides: 8, radius: 0.43, height: 0.04, pos: [0.45,0.796,0.73], rot: [90,0,0], color: "glow", mirror: true },
      // carénage
      { shape: "bevel", size: [1.82,0.5,0.56], pos: [0,1.0,0.04], color: "dark" },
      { shape: "box", size: [1.6,0.1,0.46], pos: [0,1.28,0.04], color: "faction" },
      { shape: "box", size: [0.5,0.05,0.03], pos: [0,1.1,0.33], color: "glow" },
      { shape: "box", size: [0.5,0.05,0.03], pos: [0,0.96,0.33], color: "glow" },
      // grille d'évent lumineuse sur le carénage
      ...[-0.1, 0.04, 0.18].map((z): Part => ({ shape: "box", size: [1.2,0.04,0.06], pos: [0,1.35,z], color: "glow" })),
      // tour de refroidissement
      { shape: "cylinder", sides: 8, radius: 0.35, radiusTop: 0.26, height: 0.85, pos: [-0.52,0.675,-0.56], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.05, pos: [-0.52,1.03,-0.56], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.29, height: 0.14, pos: [-0.52,1.15,-0.56], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.26, radiusTop: 0.32, height: 0.55, pos: [-0.52,1.495,-0.56], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.02, pos: [-0.52,1.77,-0.56], color: "black" },
      { shape: "sphere", radius: 0.27, pos: [-0.52,1.87,-0.56], scale: [1,0.45,1], color: "light" },
      // haute bobine à cinq anneaux
      ...bobine(0.55, -0.56, 0.26, 1.3, 5, "faction", false),
      { shape: "sphere", radius: 0.1, pos: [0.55,1.76,-0.56], color: "glow" },
      // cheminée
      { shape: "cylinder", sides: 6, radius: 0.1, height: 2.1, pos: [0.03,1.3,-0.75], color: "dark" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 0.2, pos: [0.03,1.9,-0.75], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 0.05, pos: [0.03,2.1,-0.75], color: "glow" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 0.05, pos: [0.03,1.6,-0.75], color: "glow" },
      { shape: "cylinder", sides: 6, radius: 0.08, height: 0.02, pos: [0.03,2.35,-0.75], color: "black" },
    ],
  },
  // pylon : mât effilé sur pied d'équipe, traverse et isolateurs lumineux (126 triangles)
  // main_generator : générateur de départ (3 × 3) — grande turbine, cuve d'hydrocarbure à jauge ambre, deux
  // cheminées, et un haut mât émetteur à anneaux lumineux (sa grande zone d'alimentation)
  main_generator: {
    parts: [
      ...socle(3),
      ...filets(3),
      // halle de la turbine, côté gauche
      { shape: "bevel", size: [1.3,0.9,2.2], pos: [-0.65,0.7,0.1], color: "dark" },
      { shape: "bevel", size: [1.1,0.16,2.0], pos: [-0.65,1.2,0.1], color: "faction" },
      ...turbine(-0.65, 0.55, 1.15),
      { shape: "box", size: [0.03,0.06,1.8], pos: [-1.31,0.6,0.1], color: "glow" },
      // cuve d'hydrocarbure à l'arrière droite, jauge ambre
      { shape: "cylinder", sides: 8, radius: 0.42, height: 0.9, pos: [0.85,0.7,-0.8], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.08, pos: [0.85,0.5,-0.8], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.08, pos: [0.85,0.95,-0.8], color: "dark" },
      { shape: "box", size: [0.06,0.6,0.03], pos: [0.85,0.72,-0.37], color: "amber" },
      { shape: "sphere", radius: 0.3, pos: [0.85,1.18,-0.8], color: "metal" },
      // deux cheminées
      { shape: "cylinder", sides: 8, radius: 0.13, height: 1.5, pos: [-1.1,1.6,-0.95], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.16, height: 0.12, pos: [-1.1,2.36,-0.95], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.11, height: 1.2, pos: [-0.75,1.45,-0.95], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 0.12, pos: [-0.75,2.06,-0.95], color: "dark" },
      // mât émetteur au centre droit, anneaux lumineux, coiffe aux couleurs du camp
      { shape: "bevel", size: [0.7,0.4,0.7], pos: [0.75,0.45,0.55], color: "light" },
      { shape: "cylinder", sides: 6, radius: 0.12, height: 2.2, pos: [0.75,1.7,0.55], color: "metal", radiusTop: 0.06 },
      { shape: "cylinder", sides: 8, radius: 0.34, height: 0.05, pos: [0.75,1.3,0.55], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.26, height: 0.05, pos: [0.75,1.85,0.55], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.18, height: 0.05, pos: [0.75,2.35,0.55], color: "glow" },
      { shape: "cone", sides: 6, radius: 0.14, height: 0.3, pos: [0.75,2.95,0.55], color: "faction" },
      { shape: "sphere", radius: 0.08, pos: [0.75,3.14,0.55], color: "amber" },
      // conduite cuve → turbine, voyants
      { shape: "box", size: [1.2,0.12,0.12], pos: [0.2,0.5,-0.8], color: "dark" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.3,0.4,1.49], color: "amber", mirror: true },
    ],
  },
  pylon: {
    parts: [
      { shape: "box", size: [0.6,0.12,0.6], pos: [0,0.06,0], color: "dark" },
      { shape: "box", size: [0.32,0.26,0.32], pos: [0,0.25,0], color: "faction" },
      { shape: "cylinder", sides: 6, radius: 0.14, height: 1.5, pos: [0,1.0,0], color: "metal", radiusTop: 0.05 },
      { shape: "box", size: [0.74,0.07,0.08], pos: [0,1.4,0], color: "light" },
      { shape: "box", size: [0.08,0.16,0.08], pos: [0.32,1.29,0], color: "glow", mirror: true },
      { shape: "box", size: [0.42,0.06,0.06], pos: [0,1.12,0], color: "light" },
      { shape: "cone", sides: 5, radius: 0.08, height: 0.22, pos: [0,1.85,0], color: "faction" },
      { shape: "sphere", radius: 0.07, pos: [0,1.98,0], color: "amber" },
    ],
  },
  // hydro_plant : deux tours de refroidissement fumantes, cheminée, conduites, petit dôme (924 triangles)
  hydro_plant: {
    parts: [
      ...socle(3),
      ...filets(3),
      // tour de refroidissement arrière gauche
      { shape: "cylinder", sides: 8, radius: 0.55, radiusTop: 0.42, height: 0.8, pos: [-0.3,0.65,-0.6], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.47, height: 0.16, pos: [-0.3,1.1,-0.6], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.48, height: 0.05, pos: [-0.3,0.9,-0.6], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.42, radiusTop: 0.48, height: 0.5, pos: [-0.3,1.43,-0.6], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.02, pos: [-0.3,1.68,-0.6], color: "black" },
      { shape: "sphere", radius: 0.32, pos: [-0.3,1.78,-0.6], scale: [1,0.45,1], color: "light" },
      // tour de refroidissement droite
      { shape: "cylinder", sides: 8, radius: 0.6, radiusTop: 0.46, height: 0.7, pos: [0.72,0.6,-0.3], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.16, pos: [0.72,1.02,-0.3], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.51, height: 0.05, pos: [0.72,0.82,-0.3], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.46, radiusTop: 0.52, height: 0.45, pos: [0.72,1.32,-0.3], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.44, height: 0.02, pos: [0.72,1.55,-0.3], color: "black" },
      { shape: "sphere", radius: 0.36, pos: [0.72,1.65,-0.3], scale: [1,0.45,1], color: "light" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.72,1.02,0.2], color: "amber" },
      // cheminée
      { shape: "cylinder", sides: 8, radius: 0.18, height: 1.3, pos: [-1.08,0.9,-1.0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.05, pos: [-1.08,1.3,-1.0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.1, pos: [-1.08,1.58,-1.0], color: "metal" },
      // conduites à bagues
      { shape: "cylinder", sides: 8, radius: 0.14, height: 1.4, pos: [-0.6,0.42,0.45], rot: [0,0,90], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 1.4, pos: [-0.6,0.42,0.8], rot: [0,0,90], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 1.4, pos: [-0.6,0.42,1.15], rot: [0,0,90], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.17, height: 0.25, pos: [-0.45,0.42,0.45], rot: [0,0,90], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.17, height: 0.25, pos: [-0.85,0.42,0.8], rot: [0,0,90], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.17, height: 0.25, pos: [-0.45,0.42,1.15], rot: [0,0,90], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.16, height: 0.04, pos: [-1.05,0.42,0.8], rot: [0,0,90], color: "glow" },
      // petit dôme avant droit
      { shape: "cylinder", sides: 8, radius: 0.33, height: 0.25, pos: [0.85,0.37,0.8], color: "dark" },
      { shape: "sphere", radius: 0.32, pos: [0.85,0.5,0.8], scale: [1,0.75,1], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.34, height: 0.05, pos: [0.85,0.52,0.8], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.85,0.36,1.13], color: "amber" },
    ],
  },
  // land_factory : hangar à voûte d'équipe sur arcs clairs et verrière, grand portail à rideau métallique,
  // parvis de béton, module de ventilation à hélice, cuve et conduites, cheminée évasée ; pièces fines :
  // pilastres, lames du rideau, échelle, garde-corps, antenne
  land_factory: {
    parts: [
      ...socle(5),
      ...filets(5),
      // parvis de béton et rampe de sortie
      { shape: "bevel", size: [2.6,0.06,0.95], pos: [0,0.28,2.0], bevel: 0.02, color: "concrete" },
      { shape: "box", size: [2.0,0.03,0.5], pos: [0,0.32,2.05], color: "hazard" },
      // hall : murs sombres, pilastres clairs, filets
      { shape: "bevel", size: [3.8,1.0,3.5], pos: [0,0.75,-0.3], color: "dark" },
      ...[-1.6, -0.75, 0.1, 0.95].map((z): Part => ({ shape: "box", size: [0.1,0.95,0.14], pos: [1.92,0.75,z], color: "light", mirror: true, fine: true })),
      { shape: "box", size: [0.04,0.05,3.0], pos: [1.92,1.12,-0.35], color: "glow", mirror: true },
      // voûte d'équipe, quatre arcs clairs, verrière lumineuse au faîte
      { shape: "extrude", profile: arc(1.85, 0.95, 0, 9), depth: 3.3, pos: [0,1.24,-0.35], color: "faction" },
      ...[-1.85, -0.85, 0.15, 1.15].map((z): Part => ({ shape: "extrude", profile: arc(1.92, 1.02, 0.12, 9), depth: 0.12, pos: [0,1.24,z], color: "light" })),
      { shape: "bevel", size: [0.5,0.06,3.1], pos: [0,2.19,-0.35], bevel: 0.02, color: "glass" },
      { shape: "box", size: [0.04,0.03,3.0], pos: [0,2.23,-0.35], color: "glow" },
      // portail : piliers, linteau à bandeau d'équipe, rideau métallique à lames, filets
      { shape: "bevel", size: [0.4,1.95,0.55], pos: [1.2,1.2,1.5], color: "light", mirror: true },
      { shape: "bevel", size: [2.8,0.42,0.6], pos: [0,2.05,1.5], color: "light" },
      { shape: "bevel", size: [2.4,0.14,0.08], pos: [0,2.07,1.82], bevel: 0.02, color: "faction" },
      { shape: "box", size: [2.0,1.55,0.06], pos: [0,1.02,1.58], color: "black" },
      ...[0.45, 0.7, 0.95, 1.2, 1.45].map((y): Part => ({ shape: "box", size: [1.96,0.04,0.04], pos: [0,y,1.62], color: "metal", fine: true })),
      { shape: "box", size: [1.9,0.05,0.03], pos: [0,1.72,1.66], color: "glow" },
      { shape: "box", size: [0.04,1.4,0.03], pos: [0.97,1.0,1.66], color: "glow", mirror: true },
      { shape: "cylinder", sides: 10, radius: 0.07, height: 0.08, pos: [1.2,2.3,1.5], color: "amber", mirror: true },
      // module gauche : ventilation à hélice (pivot), grille
      { shape: "bevel", size: [0.8,1.0,1.6], pos: [-2.05,0.75,1.0], color: "light" },
      { shape: "bevel", size: [0.66,0.1,1.4], pos: [-2.05,1.3,1.0], color: "faction" },
      { shape: "lathe", sides: 16, pos: [-2.05,1.3,1.0], color: "dark", profile: [[0.24,0],[0.3,0],[0.3,0.16],[0.26,0.16],[0.26,0.04],[0.24,0.04]] },
      { shape: "cylinder", sides: 10, radius: 0.06, height: 0.12, pos: [-2.05,1.4,1.0], color: "metal", pivot: "rotor_v" },
      ...[0, 120, 240].map((a): Part => ({ shape: "box", size: [0.42,0.015,0.08], pos: [-2.05,1.42,1.0], rot: [12,a,0], color: "steel", parent: "rotor_v" })),
      ...[0.55, 0.75, 0.95].map((y): Part => ({ shape: "box", size: [0.03,0.05,0.9], pos: [-2.46,y,1.0], color: "black", fine: true })),
      { shape: "box", size: [0.03,0.05,1.2], pos: [-2.46,1.12,1.0], color: "glow" },
      // module droit : cuve, conduite coudée vers le hall
      { shape: "bevel", size: [0.8,0.7,1.7], pos: [2.05,0.6,1.0], color: "dark" },
      { use: "cuve", pos: [2.05,0.95,1.25], scale: [0.6,0.9,0.6] },
      { shape: "cylinder", sides: 16, radius: 0.31, height: 0.12, pos: [2.05,1.35,1.25], color: "faction" },
      { shape: "tube", radius: 0.05, path: [[2.05,1.2,0.9],[2.05,1.2,0.5],[1.9,1.2,0.3]], bend: 0.12, color: "copper" },
      { shape: "torus", radius: 0.065, tube: 0.018, sides: 10, pos: [2.05,1.2,0.65], rot: [90,0,0], color: "steel", fine: true },
      { shape: "box", size: [0.08,0.06,0.03], pos: [2.05,0.75,1.86], color: "amber" },
      // arrière : machinerie, cheminée évasée, échelle, antenne
      { shape: "bevel", size: [1.3,0.55,0.6], pos: [0.95,1.55,-1.85], color: "metal" },
      ...[0.55, 0.95, 1.35].map((x): Part => ({ shape: "box", size: [0.25,0.04,0.5], pos: [x,1.84,-1.85], color: "dark", fine: true })),
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.95,1.6,-1.54], color: "amber" },
      { shape: "lathe", sides: 16, pos: [-1.45,1.2,-1.75], color: "dark", profile: [[0,0],[0.26,0],[0.26,0.1],[0.2,0.16],[0.2,1.25],[0.27,1.42],[0.27,1.5],[0.22,1.5],[0.22,1.44],[0,1.44]] },
      { shape: "cylinder", sides: 16, radius: 0.215, height: 0.08, pos: [-1.45,2.05,-1.75], color: "glow" },
      { shape: "torus", radius: 0.21, tube: 0.02, sides: 12, pos: [-1.45,1.75,-1.75], color: "metal", fine: true },
      { use: "echelle", pos: [-1.45,1.25,-1.54], scale: [0.8,1.1,1] },
      { use: "garde_corps", pos: [0.95,1.83,-2.12], scale: [1.3,1,1] },
      { shape: "tube", radius: 0.015, sides: 4, path: [[1.5,1.8,-1.85],[1.5,2.65,-1.85]], color: "dark", fine: true },
      { shape: "sphere", radius: 0.045, pos: [1.5,2.68,-1.85], color: "amber" },
    ],
  },
  // air_factory : piste et avion à l'avant gauche, hangar, tour de contrôle à parabole (1104 triangles)
  air_factory: {
    parts: [
      ...socle(5),
      ...filets(5),
      // piste
      { shape: "bevel", size: [2.3,0.1,4.7], pos: [-1.0,0.3,0], bevel: 0.04, color: "dark" },
      { shape: "box", size: [0.04,0.03,4.3], pos: [-2.0,0.36,0], color: "glow" },
      { shape: "box", size: [0.04,0.03,4.3], pos: [0.0,0.36,0], color: "glow" },
      { shape: "box", size: [0.12,0.02,0.4], pos: [-1.0,0.36,2.0], color: "light" },
      { shape: "box", size: [0.12,0.02,0.4], pos: [-1.0,0.36,-1.3], color: "light" },
      { shape: "wedge", size: [1.8,0.5,0.4], pos: [-1.0,0.6,-2.0], color: "metal" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [-1.6,0.5,-1.79], color: "amber" },
      // avion (ailes aux couleurs de l'équipe)
      { shape: "bevel", size: [0.38,0.28,1.7], pos: [-1.0,0.62,0.2], color: "light" },
      { shape: "cone", sides: 6, radius: 0.17, height: 0.55, pos: [-1.0,0.62,1.32], rot: [90,0,0], color: "light" },
      { shape: "bevel", size: [0.22,0.14,0.45], pos: [-1.0,0.8,0.75], color: "glass" },
      { shape: "bevel", size: [0.85,0.05,0.42], pos: [-0.55,0.58,0.0], rot: [0,25,0], color: "faction" },
      { shape: "bevel", size: [0.85,0.05,0.42], pos: [-1.45,0.58,0.0], rot: [0,-25,0], color: "faction" },
      { shape: "bevel", size: [0.9,0.04,0.25], pos: [-1.0,0.64,-0.55], color: "light" },
      { shape: "box", size: [0.04,0.3,0.3], pos: [-0.9,0.85,-0.55], rot: [0,0,-15], color: "light" },
      { shape: "box", size: [0.04,0.3,0.3], pos: [-1.1,0.85,-0.55], rot: [0,0,15], color: "light" },
      { shape: "box", size: [0.24,0.14,0.04], pos: [-1.0,0.62,-0.66], color: "glow" },
      { shape: "box", size: [0.05,0.2,0.05], pos: [-1.0,0.42,0.9], color: "dark" },
      // hangar
      { shape: "bevel", size: [2.0,0.95,2.1], pos: [1.3,0.72,0.95], color: "dark" },
      { shape: "bevel", size: [1.8,0.14,1.9], pos: [1.3,1.24,0.95], color: "faction" },
      { shape: "bevel", size: [1.3,0.7,0.1], pos: [1.3,0.6,2.02], bevel: 0.03, color: "black" },
      { shape: "box", size: [1.3,0.04,0.03], pos: [1.3,1.0,2.03], color: "glow" },
      { shape: "box", size: [0.03,0.05,1.6], pos: [2.31,0.85,0.95], color: "glow" },
      { shape: "bevel", size: [0.45,0.5,0.45], pos: [2.05,1.0,1.8], color: "light" },
      { shape: "bevel", size: [0.45,0.5,0.45], pos: [0.55,1.0,1.8], color: "light" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [2.05,0.8,2.04], color: "amber" },
      // tour de contrôle
      { shape: "bevel", size: [1.5,0.4,1.5], pos: [1.4,0.45,-1.4], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 1.8, pos: [1.4,1.5,-1.4], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.52, height: 0.06, pos: [1.4,1.1,-1.4], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.52, height: 0.06, pos: [1.4,1.7,-1.4], color: "glow" },
      { shape: "box", size: [0.2,1.3,0.06], pos: [1.4,1.45,-0.9], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.7, radiusTop: 0.6, height: 0.4, pos: [1.4,2.6,-1.4], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.71, height: 0.14, pos: [1.4,2.6,-1.4], color: "glass" },
      { shape: "cylinder", sides: 8, radius: 0.62, height: 0.1, pos: [1.4,2.85,-1.4], color: "faction" },
      { shape: "box", size: [0.05,0.3,0.05], pos: [1.25,3.0,-1.45], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.08, radiusTop: 0.35, height: 0.12, pos: [1.25,3.15,-1.45], rot: [30,0,0], color: "light" },
      { shape: "box", size: [0.03,0.6,0.03], pos: [1.75,3.2,-1.6], color: "dark" },
      { shape: "box", size: [0.06,0.06,0.06], pos: [1.75,3.5,-1.6], color: "amber" },
    ],
  },
  // naval_factory : cale sèche en U sur l'eau, quais à bandeaux d'équipe, deux grues, coque en chantier (1088 triangles)
  naval_factory: {
    parts: [
      ...socle(5),
      ...filets(5),
      // bassin et coque en chantier
      { shape: "box", size: [2.9,0.04,3.9], pos: [0,0.27,0.45], color: "glass" },
      { shape: "bevel", size: [0.8,0.3,1.8], pos: [0,0.42,0.5], color: "metal" },
      { shape: "wedge", size: [0.8,0.3,0.5], pos: [0,0.42,1.65], color: "metal" },
      { shape: "bevel", size: [0.4,0.25,0.5], pos: [0,0.68,0.2], color: "light" },
      // quais latéraux
      { shape: "bevel", size: [0.95,0.85,4.8], pos: [1.95,0.67,0], color: "dark", mirror: true },
      { shape: "bevel", size: [0.85,0.14,4.6], pos: [1.95,1.14,0], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.06,4.0], pos: [1.46,0.9,0.2], color: "glow", mirror: true },
      { shape: "box", size: [0.03,0.06,0.1], pos: [1.46,0.6,1.2], color: "amber", mirror: true },
      { shape: "bevel", size: [0.9,0.3,0.7], pos: [1.95,1.3,1.9], color: "light", mirror: true },
      { shape: "box", size: [0.95,0.25,0.04], pos: [1.95,0.6,2.41], color: "hazard", mirror: true },
      // fond du bassin, poste de commande
      { shape: "bevel", size: [3.0,0.85,0.95], pos: [0,0.67,-1.95], color: "dark" },
      { shape: "bevel", size: [2.8,0.14,0.85], pos: [0,1.14,-1.95], color: "light" },
      { shape: "bevel", size: [1.2,0.5,0.6], pos: [0,1.45,-2.0], color: "metal" },
      { shape: "box", size: [0.8,0.12,0.03], pos: [0,1.5,-1.69], color: "glow" },
      // grues
      { shape: "bevel", size: [0.35,1.1,0.35], pos: [1.95,1.75,-0.8], color: "light", mirror: true },
      { shape: "bevel", size: [1.5,0.2,0.26], pos: [1.4,2.35,-0.8], color: "dark", mirror: true },
      { shape: "box", size: [1.2,0.03,0.03], pos: [1.4,2.35,-0.66], color: "glow", mirror: true },
      { shape: "bevel", size: [0.4,0.3,0.4], pos: [2.15,2.35,-0.8], color: "metal", mirror: true },
      { shape: "box", size: [0.03,0.6,0.03], pos: [0.8,1.95,-0.8], color: "dark", mirror: true },
      { shape: "box", size: [0.16,0.12,0.16], pos: [0.8,1.6,-0.8], color: "hazard", mirror: true },
      { shape: "box", size: [0.06,0.06,0.03], pos: [1.95,2.0,-0.62], color: "amber", mirror: true },
    ],
  },
  // gantry : portique géant sur quatre pieds, poutres d'équipe, chariot mobile (bras), aire de montage (1488 triangles)
  gantry: {
    parts: [
      ...socle(7),
      ...filets(7),
      // aire de montage
      { shape: "bevel", size: [4.2,0.12,4.6], pos: [0,0.31,0.3], bevel: 0.05, color: "dark" },
      { shape: "box", size: [3.6,0.03,0.06], pos: [0,0.38,2.3], color: "glow" },
      { shape: "box", size: [3.6,0.03,0.06], pos: [0,0.38,-1.7], color: "glow" },
      { shape: "box", size: [0.06,0.03,4.0], pos: [1.8,0.38,0.3], color: "glow", mirror: true },
      { shape: "box", size: [3.0,0.02,0.4], pos: [0,0.27,2.95], color: "hazard" },
      // pieds
      { shape: "bevel", size: [0.95,0.4,1.1], pos: [3.0,0.45,2.7], color: "metal", mirror: true },
      { shape: "bevel", size: [0.95,0.4,1.1], pos: [3.0,0.45,-2.7], color: "metal", mirror: true },
      { shape: "bevel", size: [0.7,3.1,0.7], pos: [3.0,1.8,2.7], color: "dark", mirror: true },
      { shape: "bevel", size: [0.7,3.1,0.7], pos: [3.0,1.8,-2.7], color: "dark", mirror: true },
      { shape: "bevel", size: [0.78,1.0,0.78], pos: [3.0,1.4,2.7], color: "light", mirror: true },
      { shape: "bevel", size: [0.78,1.0,0.78], pos: [3.0,1.4,-2.7], color: "light", mirror: true },
      { shape: "box", size: [0.04,1.3,0.04], pos: [2.64,2.5,2.7], color: "glow", mirror: true },
      { shape: "box", size: [0.04,1.3,0.04], pos: [2.64,2.5,-2.7], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.08,0.03], pos: [3.0,0.5,3.26], color: "amber", mirror: true },
      // machines latérales
      { shape: "bevel", size: [0.8,0.8,1.8], pos: [3.0,0.65,0], color: "light", mirror: true },
      { shape: "bevel", size: [0.6,0.12,1.4], pos: [3.0,1.1,0], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.05,1.4], pos: [3.41,0.8,0], color: "glow", mirror: true },
      // poutres
      { shape: "bevel", size: [0.75,0.6,6.3], pos: [3.0,3.6,0], color: "faction", mirror: true },
      { shape: "box", size: [0.03,0.06,5.2], pos: [2.61,3.6,0], color: "glow", mirror: true },
      { shape: "bevel", size: [5.3,0.5,0.6], pos: [0,3.6,2.7], color: "metal" },
      { shape: "bevel", size: [5.3,0.5,0.6], pos: [0,3.6,-2.7], color: "metal" },
      { shape: "box", size: [4.4,0.05,0.03], pos: [0,3.6,3.01], color: "glow" },
      // cabine de commande
      { shape: "bevel", size: [0.8,0.55,0.7], pos: [-3.0,2.6,1.9], color: "light" },
      { shape: "box", size: [0.6,0.22,0.03], pos: [-3.0,2.65,2.26], color: "glass" },
      // portique mobile (bras) : poutre, chariot, câble et crochet
      { shape: "bevel", size: [5.0,0.4,0.6], pos: [0,3.05,-0.3], color: "light", pivot: "bras" },
      { shape: "box", size: [4.2,0.04,0.03], pos: [0,3.05,0.01], color: "glow", parent: "bras" },
      { shape: "bevel", size: [0.8,0.55,0.8], pos: [0,2.6,-0.3], color: "dark", parent: "bras" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.2,2.65,0.11], color: "amber", mirror: true, parent: "bras" },
      { shape: "box", size: [0.08,1.0,0.08], pos: [0,1.85,-0.3], color: "metal", parent: "bras" },
      { shape: "bevel", size: [0.5,0.24,0.4], pos: [0,1.25,-0.3], color: "hazard", parent: "bras" },
    ],
  },
  // radar : grande parabole inclinée tournante (pivot radar), socle à anneau cyan, antennes (584 triangles)
  radar: {
    parts: [
      ...socle(2),
      ...filets(2),
      { shape: "bevel", size: [1.3,0.32,1.3], pos: [0,0.4,0], color: "light" },
      { shape: "bevel", size: [1.0,0.1,1.0], pos: [0,0.6,0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.42, height: 0.3, pos: [0,0.8,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.44, height: 0.05, pos: [0,0.72,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.14, height: 0.5, pos: [0,1.15,0], color: "metal" },
      // parabole (tourne en continu)
      { shape: "cylinder", sides: 8, radius: 0.28, radiusTop: 0.78, height: 0.24, pos: [0,1.62,0], rot: [40,0,0], color: "light", pivot: "radar" },
      { shape: "cylinder", sides: 8, radius: 0.6, height: 0.02, pos: [0,1.72,0.084], rot: [40,0,0], color: "metal", parent: "radar" },
      { shape: "box", size: [0.5,0.24,0.24], pos: [0,1.42,-0.05], color: "dark", parent: "radar" },
      { shape: "cylinder", sides: 8, radius: 0.05, height: 0.6, pos: [0,1.94,0.27], rot: [40,0,0], color: "dark", parent: "radar" },
      { shape: "cylinder", sides: 8, radius: 0.08, height: 0.06, pos: [0,1.89,0.23], rot: [40,0,0], color: "glow", parent: "radar" },
      { shape: "sphere", radius: 0.07, pos: [0,2.14,0.44], color: "glow", parent: "radar" },
      // antennes et boîtier
      { shape: "box", size: [0.03,0.45,0.03], pos: [0.72,0.48,-0.62], color: "dark" },
      { shape: "box", size: [0.05,0.08,0.05], pos: [0.72,0.72,-0.62], color: "amber" },
      { shape: "box", size: [0.03,0.32,0.03], pos: [0.82,0.42,-0.48], color: "dark" },
      { shape: "box", size: [0.05,0.08,0.05], pos: [0.82,0.6,-0.48], color: "amber" },
      { shape: "bevel", size: [0.36,0.24,0.3], pos: [-0.7,0.38,0.68], color: "dark" },
      { shape: "box", size: [0.2,0.04,0.03], pos: [-0.7,0.42,0.84], color: "glow" },
    ],
  },
  // wall : bloc sombre à toit d'équipe, deux créneaux clairs, filet cyan et voyants (108 triangles)
  wall: {
    // poteau fin au centre de la case ; le jeu ajoute un pan (wall_seg) vers chaque mur voisin du même camp
    parts: [
      { shape: "bevel", size: [0.5,0.12,0.5], pos: [0,0.06,0], color: "dark" },
      { shape: "bevel", size: [0.36,0.98,0.36], pos: [0,0.55,0], color: "dark" },
      { shape: "bevel", size: [0.42,0.1,0.42], pos: [0,1.06,0], color: "faction" },
      { shape: "box", size: [0.03,0.5,0.03], pos: [0.13,0.6,0.185], color: "glow", mirror: true },
    ],
  },
  // goulotte : petit tapis incliné entre la sortie d'un extracteur et le tapis voisin (étiré par le jeu) ;
  // auge claire à rebords, fond sombre, rouleaux fins, filets ambre
  goulotte: {
    parts: [
      { shape: "extrude", profile: [[-0.25, 0], [0.25, 0], [0.25, 0.1], [0.2, 0.1], [0.185, 0.04], [-0.185, 0.04], [-0.2, 0.1], [-0.25, 0.1]], depth: 1, color: "light" },
      { shape: "box", size: [0.37, 0.02, 0.98], pos: [0, 0.05, 0], color: "dark" },
      ...lotARang(5, { shape: "box", size: [0.36, 0.015, 0.05], color: "steel" }, [0, 0.065, -0.4], [0, 0.065, 0.4]),
      { shape: "box", size: [0.025, 0.02, 0.5], pos: [0.225, 0.11, 0], color: "amber", mirror: true },
    ],
  },
  // wall_seg : pan de mur fin, du centre de la case vers le bord +x (tourné vers chaque voisin)
  wall_seg: {
    parts: [
      { shape: "box", size: [0.5,0.1,0.32], pos: [0.25,0.05,0], color: "dark" },
      { shape: "box", size: [0.5,0.78,0.2], pos: [0.25,0.48,0], color: "light" },
      { shape: "box", size: [0.5,0.07,0.24], pos: [0.25,0.9,0], color: "faction" },
      { shape: "box", size: [0.5,0.04,0.02], pos: [0.25,0.62,0.105], color: "dark" },
      { shape: "box", size: [0.5,0.04,0.02], pos: [0.25,0.62,-0.105], color: "dark" },
    ],
  },
  // light_turret : socle rond à segments clairs et anneau cyan, tourelle à deux paires de canons (772 triangles)
  light_turret: {
    parts: [
      ...socle(2),
      { shape: "cylinder", sides: 8, radius: 0.9, height: 0.25, pos: [0,0.37,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.92, height: 0.05, pos: [0,0.42,0], color: "glow" },
      { shape: "bevel", size: [0.5,0.2,0.24], pos: [0,0.45,0.72], color: "light" },
      { shape: "bevel", size: [0.5,0.2,0.24], pos: [0,0.45,-0.72], color: "light" },
      { shape: "bevel", size: [0.24,0.2,0.5], pos: [0.72,0.45,0], color: "light", mirror: true },
      { shape: "box", size: [0.08,0.05,0.03], pos: [0.5,0.42,0.6], rot: [0,45,0], color: "amber", mirror: true },
      // tourelle
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.2, pos: [0,0.6,0], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [0.62,0.42,0.8], pos: [0,0.92,-0.12], color: "light", parent: "tourelle" },
      { shape: "bevel", size: [0.5,0.1,0.6], pos: [0,1.16,-0.16], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.16,0.12,0.03], pos: [0,0.95,0.29], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.2,1.04,0.29], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.26,0.36,0.6], pos: [0.42,0.9,0.05], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.4], pos: [0.56,0.98,0.05], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.065, height: 0.6, pos: [0.42,0.98,0.6], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.065, height: 0.6, pos: [0.42,0.82,0.6], rot: [90,0,0], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.2,0.32,0.08], pos: [0.42,0.9,0.86], color: "metal", mirror: true, parent: "tourelle" },
    ],
  },
  // aa_turret : base octogonale blindée, tourelle claire à deux nacelles de canons dressés (752 triangles)
  aa_turret: {
    parts: [
      ...socle(2),
      { shape: "cylinder", sides: 8, radius: 0.85, height: 0.25, pos: [0,0.37,0], rot: [0,22.5,0], color: "dark" },
      { shape: "bevel", size: [0.4,0.2,0.3], pos: [0.55,0.45,0.55], rot: [0,45,0], color: "light", mirror: true },
      { shape: "bevel", size: [0.4,0.2,0.3], pos: [0.55,0.45,-0.55], rot: [0,-45,0], color: "light", mirror: true },
      { shape: "box", size: [0.3,0.04,0.03], pos: [0.5,0.4,0.68], rot: [0,45,0], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.05,0.03], pos: [0,0.42,0.79], color: "amber" },
      // tourelle
      { shape: "cylinder", sides: 8, radius: 0.55, height: 0.2, pos: [0,0.6,0], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [0.7,0.55,0.7], pos: [0,0.97,-0.05], color: "light", parent: "tourelle" },
      { shape: "bevel", size: [0.5,0.1,0.5], pos: [0,1.27,-0.08], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.36,0.06,0.03], pos: [0,1.04,0.31], color: "glow", parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.22,0.86,0.31], color: "amber", mirror: true, parent: "tourelle" },
      // nacelles et canons dressés à 45°
      { shape: "bevel", size: [0.3,0.45,0.6], pos: [0.5,1.0,0], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.35], pos: [0.66,1.08,0], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.055, height: 0.8, pos: [0.43,1.38,0.38], rot: [45,0,0], color: "metal", mirror: true, parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.055, height: 0.8, pos: [0.57,1.38,0.38], rot: [45,0,0], color: "metal", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.26,0.12,0.12], pos: [0.5,1.62,0.62], rot: [45,0,0], color: "dark", mirror: true, parent: "tourelle" },
    ],
  },
  // heavy_turret : base trapue à plaques claires, grosse tourelle à canon unique épais (752 triangles)
  heavy_turret: {
    parts: [
      ...socle(2),
      { shape: "bevel", size: [1.7,0.3,1.7], pos: [0,0.4,0], color: "dark" },
      { shape: "bevel", size: [0.55,0.24,0.3], pos: [0.55,0.5,0.7], color: "light", mirror: true },
      { shape: "bevel", size: [0.3,0.24,0.55], pos: [0.7,0.5,-0.45], color: "light", mirror: true },
      { shape: "box", size: [0.1,0.05,0.03], pos: [0.55,0.42,0.86], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.04,0.4], pos: [0.86,0.42,0.1], color: "glow", mirror: true },
      // tourelle
      { shape: "cylinder", sides: 8, radius: 0.68, height: 0.2, pos: [0,0.65,0], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [1.0,0.55,1.0], pos: [0,1.0,-0.33], color: "light", parent: "tourelle" },
      { shape: "bevel", size: [0.2,0.45,0.8], pos: [0.56,0.97,-0.33], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.8,0.12,0.8], pos: [0,1.31,-0.36], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.04,0.25,0.03], pos: [0.32,1.0,0.18], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.56,1.1,0.08], color: "amber", mirror: true, parent: "tourelle" },
      // canon
      { shape: "bevel", size: [0.46,0.42,0.3], pos: [0,0.98,0.26], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.62, pos: [0,0.98,0.6], rot: [90,0,0], color: "metal", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.04, pos: [0,0.98,0.5], rot: [90,0,0], color: "glow", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.17, height: 0.14, pos: [0,0.98,0.9], rot: [90,0,0], color: "dark", parent: "tourelle" },
    ],
  },
  // fixed_artillery : long tube relevé à 20° sur tourelle claire, base à coins blindés (844 triangles)
  fixed_artillery: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "bevel", size: [2.4,0.4,2.4], pos: [0,0.45,0], color: "metal" },
      { shape: "bevel", size: [0.6,0.5,0.6], pos: [1.0,0.6,1.0], color: "light", mirror: true },
      { shape: "bevel", size: [0.6,0.5,0.6], pos: [1.0,0.6,-1.0], color: "light", mirror: true },
      { shape: "box", size: [0.12,0.06,0.03], pos: [1.0,0.6,1.31], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.05,0.8], pos: [1.21,0.5,0], color: "glow", mirror: true },
      { shape: "cylinder", sides: 8, radius: 1.0, height: 0.25, pos: [0,0.77,0], color: "dark" },
      // tourelle
      { shape: "cylinder", sides: 8, radius: 0.9, height: 0.25, pos: [0,0.95,0], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [1.2,0.75,1.4], pos: [0,1.4,-0.35], color: "light", parent: "tourelle" },
      { shape: "bevel", size: [0.2,0.6,1.2], pos: [0.68,1.35,-0.35], color: "dark", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [1.0,0.12,1.1], pos: [0,1.82,-0.4], color: "faction", parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.8], pos: [0.79,1.45,-0.35], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.4,1.2,0.36], color: "amber", mirror: true, parent: "tourelle" },
      // tube relevé à 20°
      { shape: "bevel", size: [0.5,0.45,0.35], pos: [0,1.42,0.3], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.16, height: 0.4, pos: [0,1.518,0.488], rot: [70,0,0], color: "dark", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 1.2, pos: [0,1.655,0.864], rot: [70,0,0], color: "metal", parent: "tourelle" },
      { shape: "box", size: [0.03,0.04,0.8], pos: [0,1.74,0.78], rot: [-20,0,0], color: "glow", parent: "tourelle" },
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.16, pos: [0,1.826,1.334], rot: [70,0,0], color: "dark", parent: "tourelle" },
    ],
  },
  // shield_gen : générateur étagé à émetteur tournant, anneau lumineux au sol (664 triangles)
  shield_gen: {
    parts: [
      ...socle(2),
      { shape: "cylinder", sides: 8, radius: 0.95, height: 0.04, pos: [0,0.26,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.86, height: 0.06, pos: [0,0.28,0], color: "dark" },
      { shape: "bevel", size: [1.3,0.4,1.3], pos: [0,0.48,0], color: "dark" },
      { shape: "bevel", size: [0.5,0.34,0.24], pos: [0,0.56,0.62], color: "light" },
      { shape: "bevel", size: [0.5,0.34,0.24], pos: [0,0.56,-0.62], color: "light" },
      { shape: "bevel", size: [0.24,0.34,0.5], pos: [0.62,0.56,0], color: "light", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.45,0.45,0.66], color: "amber", mirror: true },
      { shape: "bevel", size: [0.9,0.35,0.9], pos: [0,0.83,0], color: "light" },
      { shape: "bevel", size: [0.7,0.1,0.7], pos: [0,1.03,0], color: "faction" },
      { shape: "box", size: [0.5,0.05,0.03], pos: [0,0.85,0.46], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.2, pos: [0,1.15,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.32, height: 0.04, pos: [0,1.24,0], color: "glow" },
      // émetteur (tourne)
      { shape: "sphere", radius: 0.24, detail: 1, pos: [0,1.42,0], color: "glow", pivot: "emetteur" },
      { shape: "box", size: [0.7,0.05,0.08], pos: [0,1.42,0], color: "light", parent: "emetteur" },
      { shape: "box", size: [0.08,0.05,0.7], pos: [0,1.42,0], color: "light", parent: "emetteur" },
    ],
  },
  // transfer : plateforme ronde praticable (octogone chanfreiné), marche tournée d'acier, anneaux lumineux et
  // lentille vitrée au centre, couronne de segments clairs et d'équipe à boulons, trois bornes à pupitre vitré
  // incliné, écran cyan et câble vers le centre
  transfer: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 1.5, height: 0.15, bevel: 0.03, pos: [0, 0.075, 0], color: "dark" },
      { shape: "lathe", sides: 16, pos: [0, 0.14, 0], color: "metal", profile: [[0, 0], [1.08, 0], [1.08, 0.07], [1.03, 0.12], [0, 0.12]] },
      { shape: "cylinder", sides: 16, radius: 0.92, height: 0.03, pos: [0, 0.265, 0], color: "glow" },
      { shape: "cylinder", sides: 16, radius: 0.76, height: 0.03, pos: [0, 0.275, 0], color: "dark" },
      { shape: "cylinder", sides: 16, radius: 0.6, height: 0.03, pos: [0, 0.285, 0], color: "glow" },
      ...[0, 45, 90, 135].map((a): Part => ({ shape: "box", size: [1.1, 0.012, 0.03], pos: [0, 0.296, 0], rot: [0, a, 0], color: "metal", fine: true })),
      { shape: "lathe", sides: 16, pos: [0, 0.28, 0], color: "glass", profile: [[0, 0], [0.3, 0], [0.3, 0.03], [0.2, 0.06], [0, 0.075]] },
      { shape: "cylinder", sides: 12, radius: 0.1, height: 0.02, pos: [0, 0.35, 0], color: "glow" },
      // couronne : segments clairs et segments aux couleurs de l'équipe, boulons
      { shape: "bevel", size: [0.9, 0.2, 0.36], pos: [0, 0.25, 1.25], color: "light" },
      { shape: "bevel", size: [0.9, 0.2, 0.36], pos: [0, 0.25, -1.25], color: "light" },
      { shape: "bevel", size: [0.9, 0.2, 0.36], pos: [1.25, 0.25, 0], rot: [0, 90, 0], color: "light", mirror: true },
      { shape: "bevel", size: [0.9, 0.2, 0.36], pos: [0.884, 0.25, 0.884], rot: [0, 45, 0], color: "faction", mirror: true },
      { shape: "bevel", size: [0.9, 0.2, 0.36], pos: [0.884, 0.25, -0.884], rot: [0, 135, 0], color: "faction", mirror: true },
      ...[0, 90, 180, 270].flatMap((a): Part[] => [-0.3, 0.3].map((t): Part => {
        const r = (a * Math.PI) / 180;
        return { shape: "cylinder", sides: 6, radius: 0.03, height: 0.03, pos: [lotAr(Math.sin(r) * 1.25 + Math.cos(r) * t), 0.36, lotAr(Math.cos(r) * 1.25 - Math.sin(r) * t)], color: "steel", fine: true };
      })),
      { shape: "box", size: [0.12, 0.05, 0.03], pos: [0.25, 0.25, 1.44], color: "amber", mirror: true },
      { shape: "box", size: [0.03, 0.04, 0.5], pos: [1.44, 0.25, 0], color: "glow", mirror: true },
      // bornes à l'arrière : fût sombre à dessus incliné vers le centre, pupitre vitré, écran cyan, coiffe d'équipe
      ...([[0, -1.32, 0], [1.143, -0.66, -60], [-1.143, -0.66, 60]] as const).flatMap(([x, z, a]): Part[] => {
        const r = (a * Math.PI) / 180;
        // avant de la borne (vers le centre) : (sin a, cos a)
        const at = (d: number, y: number): Vec3 => [lotAr(x + Math.sin(r) * d), y, lotAr(z + Math.cos(r) * d)];
        return [
          { shape: "extrude", profile: [[-0.16, 0], [0.16, 0], [0.16, 0.7], [-0.12, 0.92], [-0.16, 0.9]], depth: 0.32, pos: at(0, 0.2), rot: [0, a - 90, 0], color: "dark" },
          { shape: "box", size: [0.24, 0.015, 0.3], pos: at(0.02, 1.02), rot: lotARot(a, 38), color: "glass" },
          { shape: "box", size: [0.2, 0.3, 0.02], pos: at(0.165, 0.55), rot: [0, a, 0], color: "glow" },
          { shape: "bevel", size: [0.36, 0.06, 0.1], pos: at(-0.13, 1.12), rot: [0, a, 0], color: "faction" },
          { shape: "tube", radius: 0.02, sides: 5, path: [at(0.17, 0.3), at(0.5, 0.3)], color: "copper", fine: true },
        ];
      }),
    ],
  },
  // gate : grand anneau vertical à segments, portail lumineux concentrique, pieds blindés (864 triangles)
  gate: {
    parts: [
      { shape: "bevel", size: [3.6,0.2,1.4], pos: [0,0.1,0], bevel: 0.06, color: "dark" },
      { shape: "bevel", size: [2.6,0.12,1.8], pos: [0,0.26,0], bevel: 0.04, color: "metal" },
      { shape: "box", size: [1.2,0.03,0.2], pos: [0,0.33,0.75], color: "hazard" },
      { shape: "box", size: [0.03,0.04,0.8], pos: [1.79,0.1,0], color: "glow", mirror: true },
      // pieds latéraux
      { shape: "bevel", size: [0.7,0.6,1.3], pos: [1.45,0.45,0], color: "dark", mirror: true },
      { shape: "bevel", size: [0.5,0.4,0.9], pos: [1.45,0.9,0], color: "light", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.45,0.5,0.66], color: "amber", mirror: true },
      // anneau
      { shape: "bevel", size: [0.45,1.15,0.6], pos: [1.5,2.1,0], color: "faction", mirror: true },
      { shape: "bevel", size: [0.45,1.15,0.6], pos: [1.061,3.161,0], rot: [0,0,45], color: "dark", mirror: true },
      { shape: "bevel", size: [0.45,1.15,0.6], pos: [0,3.6,0], rot: [0,0,90], color: "faction" },
      { shape: "bevel", size: [0.45,1.15,0.6], pos: [1.061,1.039,0], rot: [0,0,-45], color: "dark", mirror: true },
      { shape: "bevel", size: [0.45,1.15,0.6], pos: [0,0.6,0], rot: [0,0,90], color: "dark" },
      { shape: "bevel", size: [0.9,0.3,0.7], pos: [0,3.85,0], color: "light" },
      { shape: "box", size: [0.06,0.12,0.03], pos: [1.5,2.1,0.31], color: "amber", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.13,3.23,0.31], rot: [0,0,45], color: "amber", mirror: true },
      // portail lumineux
      { shape: "cylinder", sides: 8, radius: 1.3, height: 0.06, pos: [0,2.1,0], rot: [90,0,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.95, height: 0.08, pos: [0,2.1,0], rot: [90,22.5,0], color: "glass" },
      { shape: "cylinder", sides: 8, radius: 0.6, height: 0.1, pos: [0,2.1,0], rot: [90,0,0], color: "glow" },
    ],
  },
  // area_shield : colonne d'émission à coupe lumineuse (emetteur), deux pylônes à anneaux, base étagée (1108 triangles)
  area_shield: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "bevel", size: [2.4,0.35,2.4], pos: [0,0.42,0], color: "dark" },
      { shape: "bevel", size: [2.0,0.1,2.0], pos: [0,0.64,0], color: "faction" },
      { shape: "bevel", size: [0.8,0.3,0.4], pos: [0,0.5,1.12], color: "light" },
      { shape: "bevel", size: [0.4,0.3,0.8], pos: [1.12,0.5,0.3], color: "light", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.3,0.5,1.33], color: "amber", mirror: true },
      // colonne centrale et noyau lumineux
      { shape: "bevel", size: [0.9,1.2,0.9], pos: [0,1.25,0], color: "dark" },
      { shape: "bevel", size: [0.2,1.0,0.7], pos: [0.5,1.2,0], color: "light", mirror: true },
      { shape: "bevel", size: [0.5,0.64,0.08], pos: [0,1.2,0.46], bevel: 0.03, color: "black" },
      { shape: "box", size: [0.36,0.5,0.03], pos: [0,1.2,0.5], color: "glow" },
      // coupe émettrice
      { shape: "cylinder", sides: 8, radius: 0.35, radiusTop: 0.85, height: 0.4, pos: [0,2.05,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.72, height: 0.02, pos: [0,2.26,0], color: "glow" },
      { shape: "sphere", radius: 0.3, detail: 1, pos: [0,2.45,0], color: "glow", pivot: "emetteur" },
      { shape: "box", size: [0.9,0.05,0.08], pos: [0,2.45,0], color: "dark", parent: "emetteur" },
      // pylônes à anneaux
      { shape: "cylinder", sides: 8, radius: 0.25, height: 1.3, pos: [1.0,1.05,-0.6], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.06, pos: [1.0,0.95,-0.6], color: "glow", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.06, pos: [1.0,1.15,-0.6], color: "glow", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.06, pos: [1.0,1.35,-0.6], color: "glow", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.28, height: 0.12, pos: [1.0,1.76,-0.6], color: "light", mirror: true },
      { shape: "box", size: [0.04,0.2,0.04], pos: [1.0,1.92,-0.6], color: "metal", mirror: true },
      { shape: "sphere", radius: 0.07, pos: [1.0,2.05,-0.6], color: "amber", mirror: true },
    ],
  },
  // crystal_reactor : cristal cyan géant (cristal) dans une couronne de segments clairs et sombres (1082 triangles)
  crystal_reactor: {
    parts: [
      ...socle(4),
      ...filets(4),
      { shape: "cylinder", sides: 8, radius: 1.9, height: 0.3, pos: [0,0.4,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 1.92, height: 0.05, pos: [0,0.45,0], color: "glow" },
      // couronne : segments clairs (dessus d'équipe) et segments sombres
      { shape: "bevel", size: [1.0,0.8,0.5], pos: [0,0.95,1.5], color: "light" },
      { shape: "bevel", size: [1.0,0.8,0.5], pos: [0,0.95,-1.5], color: "light" },
      { shape: "bevel", size: [1.0,0.8,0.5], pos: [1.5,0.95,0], rot: [0,90,0], color: "light", mirror: true },
      { shape: "bevel", size: [0.9,0.12,0.45], pos: [0,1.41,1.5], color: "faction" },
      { shape: "bevel", size: [0.9,0.12,0.45], pos: [0,1.41,-1.5], color: "faction" },
      { shape: "bevel", size: [0.9,0.12,0.45], pos: [1.5,1.41,0], rot: [0,90,0], color: "faction", mirror: true },
      { shape: "box", size: [0.6,0.05,0.03], pos: [0,1.1,1.24], color: "glow" },
      { shape: "box", size: [0.03,0.05,0.6], pos: [1.24,1.1,0], color: "glow", mirror: true },
      { shape: "bevel", size: [0.8,0.6,0.5], pos: [1.06,0.85,1.06], rot: [0,45,0], color: "dark", mirror: true },
      { shape: "bevel", size: [0.8,0.6,0.5], pos: [1.06,0.85,-1.06], rot: [0,135,0], color: "dark", mirror: true },
      { shape: "box", size: [0.12,0.06,0.03], pos: [1.24,0.9,1.24], rot: [0,45,0], color: "amber", mirror: true },
      // cœur et griffes
      { shape: "cylinder", sides: 8, radius: 1.0, height: 0.5, pos: [0,0.8,0], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.85, height: 0.06, pos: [0,1.06,0], color: "glow" },
      { shape: "bevel", size: [0.2,0.9,0.3], pos: [0.75,1.45,0], rot: [0,0,20], color: "light", mirror: true },
      { shape: "bevel", size: [0.3,0.9,0.2], pos: [0,1.45,0.75], rot: [-20,0,0], color: "light" },
      { shape: "bevel", size: [0.3,0.9,0.2], pos: [0,1.45,-0.75], rot: [20,0,0], color: "light" },
      // cristal (tourne)
      { shape: "cone", sides: 6, radius: 0.62, height: 1.8, pos: [0,2.3,0], color: "glow", pivot: "cristal" },
      { shape: "cone", sides: 6, radius: 0.62, height: 0.7, pos: [0,1.05,0], rot: [180,0,0], color: "glow", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.25, height: 1.1, pos: [0.42,1.85,0.15], rot: [0,0,-25], color: "glow", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.22, height: 0.9, pos: [-0.4,1.75,-0.2], rot: [10,0,25], color: "glow", parent: "cristal" },
      { shape: "cone", sides: 5, radius: 0.2, height: 0.8, pos: [0.05,1.7,0.45], rot: [25,0,0], color: "glow", parent: "cristal" },
    ],
  },
  // missile_silo : ogive dressée dans un puits, quatre portes blindées ouvertes, anneau cyan (900 triangles)
  missile_silo: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "cylinder", sides: 8, radius: 1.4, height: 0.4, pos: [0,0.45,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 1.42, height: 0.06, pos: [0,0.4,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.72, height: 0.04, pos: [0,0.66,0], color: "black" },
      // missile
      { shape: "cylinder", sides: 8, radius: 0.32, height: 0.9, pos: [0,1.1,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.34, height: 0.1, pos: [0,1.2,0], color: "red" },
      { shape: "cone", sides: 8, radius: 0.32, height: 0.75, pos: [0,1.92,0], color: "light" },
      // portes ouvertes (dessus aux couleurs de l'équipe)
      { shape: "bevel", size: [0.9,1.1,0.22], pos: [0,1.1,0.95], rot: [20,0,0], color: "light" },
      { shape: "bevel", size: [0.9,1.1,0.22], pos: [0,1.1,-0.95], rot: [-20,0,0], color: "light" },
      { shape: "bevel", size: [0.22,1.1,0.9], pos: [0.95,1.1,0], rot: [0,0,-20], color: "light", mirror: true },
      { shape: "bevel", size: [0.92,0.1,0.26], pos: [0,1.62,1.14], rot: [20,0,0], color: "faction" },
      { shape: "bevel", size: [0.92,0.1,0.26], pos: [0,1.62,-1.14], rot: [-20,0,0], color: "faction" },
      { shape: "bevel", size: [0.26,0.1,0.92], pos: [1.14,1.62,0], rot: [0,0,-20], color: "faction", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0,0.95,1.08], rot: [20,0,0], color: "amber" },
      { shape: "box", size: [0.03,0.06,0.1], pos: [1.08,0.95,0], rot: [0,0,-20], color: "amber", mirror: true },
      // blocs d'angle
      { shape: "bevel", size: [0.5,0.55,0.5], pos: [0.98,0.7,0.98], rot: [0,45,0], color: "metal", mirror: true },
      { shape: "bevel", size: [0.5,0.55,0.5], pos: [0.98,0.7,-0.98], rot: [0,45,0], color: "metal", mirror: true },
      { shape: "box", size: [0.25,0.04,0.03], pos: [1.15,0.8,1.15], rot: [0,45,0], color: "glow", mirror: true },
    ],
  },
  // antimissile : quatre tubes de lancement verticaux sur affût tournant, base à nacelles (784 triangles)
  antimissile: {
    parts: [
      ...socle(2),
      ...filets(2, 2, false),
      { shape: "bevel", size: [1.6,0.3,1.4], pos: [0,0.4,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.4, pos: [0.75,0.55,0.35], rot: [90,0,0], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.03, pos: [0.75,0.55,0.56], rot: [90,0,0], color: "amber", mirror: true },
      // affût tournant
      { shape: "cylinder", sides: 8, radius: 0.55, height: 0.2, pos: [0,0.65,0], color: "metal", pivot: "tourelle" },
      { shape: "bevel", size: [1.0,0.25,0.9], pos: [0,0.85,0], color: "dark", parent: "tourelle" },
      { shape: "bevel", size: [0.36,1.3,0.36], pos: [0.21,1.6,0.2], color: "light", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.36,1.3,0.36], pos: [0.21,1.6,-0.2], color: "light", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.32,0.1,0.32], pos: [0.21,2.28,0.2], color: "faction", mirror: true, parent: "tourelle" },
      { shape: "bevel", size: [0.32,0.1,0.32], pos: [0.21,2.28,-0.2], color: "faction", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.05,0.8,0.03], pos: [0.21,1.55,0.39], color: "glow", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.21,2.1,0.39], color: "amber", mirror: true, parent: "tourelle" },
      { shape: "box", size: [0.05,1.1,0.05], pos: [0.4,1.55,0.4], color: "dark", mirror: true, parent: "tourelle" },
    ],
  },
  // beacon : socle étagé à ailettes claires, colonne sombre, grand disque lumineux et faisceau (feu) (788 triangles)
  beacon: {
    parts: [
      ...socle(2),
      { shape: "cylinder", sides: 8, radius: 0.9, height: 0.2, pos: [0,0.35,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.77, height: 0.04, pos: [0,0.47,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.75, height: 0.2, pos: [0,0.55,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.55, height: 0.2, pos: [0,0.75,0], color: "dark" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.35,0.35,0.85], color: "amber", mirror: true },
      // ailettes
      { shape: "bevel", size: [0.14,0.8,0.35], pos: [0.6,1.0,0], rot: [0,0,15], color: "light", mirror: true },
      { shape: "bevel", size: [0.35,0.8,0.14], pos: [0,1.0,0.6], rot: [-15,0,0], color: "light" },
      { shape: "bevel", size: [0.35,0.8,0.14], pos: [0,1.0,-0.6], rot: [15,0,0], color: "light" },
      // colonne
      { shape: "cylinder", sides: 8, radius: 0.26, radiusTop: 0.2, height: 1.4, pos: [0,1.45,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.15, pos: [0,1.2,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.25, height: 0.22, pos: [0,1.9,0], color: "faction" },
      { shape: "box", size: [0.04,0.6,0.03], pos: [0,1.5,0.24], color: "glow" },
      { shape: "box", size: [0.06,0.05,0.03], pos: [0.12,1.6,0.21], color: "amber", mirror: true },
      // disque lumineux et faisceau (tourne)
      { shape: "cylinder", sides: 8, radius: 0.32, height: 0.1, pos: [0,2.2,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.66, height: 0.03, pos: [0,2.3,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.03, pos: [0,2.32,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.33, height: 0.03, pos: [0,2.34,0], color: "glow" },
      { shape: "sphere", radius: 0.16, detail: 1, pos: [0,2.45,0], color: "glow", pivot: "feu" },
      { shape: "cylinder", sides: 8, radius: 0.04, radiusTop: 0.01, height: 0.7, pos: [0,2.85,0], color: "glow", parent: "feu" },
    ],
  },
  // orbital : canon géant incliné sur tourelle tournante (canon), base à coins clairs, antennes (1240 triangles)
  orbital: {
    parts: [
      ...socle(5),
      ...filets(5),
      { shape: "cylinder", sides: 8, radius: 2.0, height: 0.35, pos: [0,0.42,0], color: "metal" },
      { shape: "bevel", size: [0.9,0.8,0.9], pos: [1.9,0.65,1.9], color: "light", mirror: true },
      { shape: "bevel", size: [0.9,0.8,0.9], pos: [1.9,0.65,-1.9], color: "light", mirror: true },
      { shape: "bevel", size: [0.7,0.12,0.7], pos: [1.9,1.1,1.9], color: "faction", mirror: true },
      { shape: "sphere", radius: 0.3, pos: [1.9,1.1,-1.9], scale: [1,0.6,1], color: "dark", mirror: true },
      { shape: "box", size: [0.5,0.05,0.03], pos: [1.9,0.75,2.36], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.9,0.5,2.36], color: "amber", mirror: true },
      { shape: "cylinder", sides: 8, radius: 1.65, height: 0.08, pos: [0,0.62,0], color: "dark" },
      { shape: "bevel", size: [0.6,0.5,1.1], pos: [1.95,0.6,0], color: "dark", mirror: true },
      { shape: "box", size: [0.03,0.05,0.8], pos: [2.26,0.65,0], color: "glow", mirror: true },
      { shape: "bevel", size: [1.1,0.4,0.5], pos: [0,0.55,-2.05], color: "light" },
      { shape: "cone", sides: 5, radius: 0.08, height: 0.9, pos: [0.9,0.7,-2.1], color: "dark" },
      { shape: "cone", sides: 5, radius: 0.06, height: 0.6, pos: [1.15,0.55,-2.15], color: "dark" },
      // tourelle (pivot canon)
      { shape: "cylinder", sides: 8, radius: 1.3, height: 0.3, pos: [0,0.75,0], color: "dark", pivot: "canon" },
      { shape: "cylinder", sides: 8, radius: 1.32, height: 0.05, pos: [0,0.82,0], color: "glow", parent: "canon" },
      { shape: "bevel", size: [1.4,1.1,1.5], pos: [0,1.45,-0.35], color: "faction", parent: "canon" },
      { shape: "bevel", size: [0.3,0.9,1.3], pos: [0.78,1.4,-0.35], color: "light", mirror: true, parent: "canon" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.4,1.7,0.41], color: "amber", mirror: true, parent: "canon" },
      // fût incliné de 20° vers l'avant
      { shape: "cylinder", sides: 8, radius: 0.5, radiusTop: 0.34, height: 3.4, pos: [0,3.4,0.38], rot: [20,0,0], color: "light", parent: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.47, height: 0.1, pos: [0,2.74,0.142], rot: [20,0,0], color: "glow", parent: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.3, pos: [0,3.304,0.347], rot: [20,0,0], color: "dark", parent: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.41, height: 0.1, pos: [0,3.868,0.552], rot: [20,0,0], color: "glow", parent: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.42, radiusTop: 0.38, height: 0.35, pos: [0,4.9,0.929], rot: [20,0,0], color: "dark", parent: "canon" },
      { shape: "cylinder", sides: 8, radius: 0.25, height: 0.04, pos: [0,5.08,0.994], rot: [20,0,0], color: "glow", parent: "canon" },
      { shape: "box", size: [0.05,2.2,0.04], pos: [0,3.44,0.854], rot: [20,0,0], color: "glow", parent: "canon" },
      { shape: "bevel", size: [0.14,1.8,0.5], pos: [0.42,2.928,0.21], rot: [20,0,0], color: "dark", mirror: true, parent: "canon" },
    ],
  },
  // warehouse : entrepôt d'équipe (3 x 3) — hall aux parois droites près du bord (trappes), toit à deux pans
  // d'équipe et lanterneau vitré, rideau à lames sur quai de béton, deux silos clairs à toit conique, échelles,
  // caisses cerclées de danger
  warehouse: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "bevel", size: [2.86, 0.08, 1.85], pos: [0, 0.29, -0.55], bevel: 0.025, color: "concrete" },
      { shape: "bevel", size: [2.8, 1.1, 1.74], pos: [0, 0.8, -0.58], color: "dark" },
      ...lotARang(7, { shape: "box", size: [0.035, 0.9, 0.03], color: "metal" }, [-1.2, 0.75, -1.46], [1.2, 0.75, -1.46]),
      ...lotARang(5, { shape: "box", size: [0.03, 0.9, 0.035], color: "metal", mirror: true }, [1.41, 0.75, -1.3], [1.41, 0.75, 0.1]),
      { shape: "bevel", size: [0.4, 1.0, 0.4], pos: [1.12, 0.75, 0.1], color: "light", mirror: true },
      // toit à deux pans, lanterneau vitré au faîte, filet cyan
      { shape: "extrude", profile: [[-0.92, 0], [0.92, 0], [0.92, 0.08], [0, 0.46], [-0.92, 0.08]], depth: 2.9, pos: [0, 1.35, -0.58], rot: [0, 90, 0], color: "faction" },
      { shape: "box", size: [2.5, 0.08, 0.24], pos: [0, 1.79, -0.58], color: "glass" },
      { shape: "box", size: [2.4, 0.03, 0.03], pos: [0, 1.84, -0.58], color: "glow" },
      ...lotARang(6, { shape: "box", size: [0.03, 0.04, 1.0], color: "metal" }, [-1.25, 1.6, -0.58], [1.25, 1.6, -0.58]),
      { shape: "box", size: [2.2, 0.04, 0.03], pos: [0, 1.28, 0.31], color: "glow" },
      // rideau à lames sur quai de béton, bandeau de danger
      { shape: "bevel", size: [1.3, 0.12, 0.4], pos: [0, 0.31, 0.5], bevel: 0.03, color: "concrete" },
      { shape: "bevel", size: [1.1, 0.8, 0.1], pos: [0, 0.76, 0.3], bevel: 0.03, color: "black" },
      ...lotARang(4, { shape: "box", size: [1.0, 0.035, 0.035], color: "dark" }, [0, 0.5, 0.35], [0, 0.98, 0.35]),
      { shape: "box", size: [1.1, 0.1, 0.1], pos: [0, 1.2, 0.3], color: "hazard" },
      { shape: "box", size: [1.0, 0.025, 0.04], pos: [0, 0.375, 0.67], color: "hazard", fine: true },
      // silos : fût clair cerclé, anneau cyan, toit conique d'équipe, échelle, voyant
      ...[0.9, -0.9].flatMap((x): Part[] => [
        { shape: "lathe", sides: 16, pos: [x, 0.25, 0.85], color: "light", profile: [[0, 0], [0.4, 0], [0.4, 0.12], [0.38, 0.14], [0.38, 1.47], [0, 1.47]] },
        { shape: "torus", radius: 0.385, tube: 0.04, sides: 16, pos: [x, 1.3, 0.85], color: "glow" },
        { shape: "torus", radius: 0.385, tube: 0.018, sides: 16, pos: [x, 0.75, 0.85], color: "metal", fine: true },
        { shape: "torus", radius: 0.385, tube: 0.018, sides: 16, pos: [x, 1.05, 0.85], color: "metal", fine: true },
        { shape: "lathe", sides: 16, pos: [x, 1.72, 0.85], color: "faction", profile: [[0, 0], [0.42, 0], [0.42, 0.04], [0.12, 0.33], [0.06, 0.37], [0, 0.37]] },
        { shape: "cylinder", sides: 10, radius: 0.05, height: 0.06, pos: [x, 2.1, 0.85], color: "steel", fine: true },
        { use: "echelle", pos: [lotAr(x * 1.47), 0.25, 0.85], rot: [0, x > 0 ? 90 : -90, 0], scale: [1, 1.45, 1] },
        { shape: "box", size: [0.08, 0.06, 0.03], pos: [x, 0.85, 1.24], color: "amber" },
      ]),
      { shape: "tube", radius: 0.045, path: [[0.9, 1.55, 0.5], [0.9, 1.55, 0.35], [0.62, 1.47, 0.2]], bend: 0.1, color: "copper", mirror: true },
      // caisses cerclées de danger
      { shape: "bevel", size: [0.45, 0.3, 0.45], pos: [0, 0.4, 1.0], color: "metal" },
      { shape: "box", size: [0.3, 0.06, 0.3], pos: [0, 0.58, 1.0], color: "hazard" },
      { shape: "box", size: [0.47, 0.04, 0.06], pos: [0, 0.4, 1.0], color: "hazard", fine: true },
      { shape: "bevel", size: [0.26, 0.2, 0.26], pos: [0.3, 0.35, 1.28], rot: [0, 20, 0], color: "light", fine: true },
    ],
  },
  // rail (1 x 1) : traverses et deux rails dans l'axe (+z) (60 triangles)
  rail: {
    parts: [
      { shape: "box", size: [0.9,0.05,0.98], pos: [0,0.025,0], color: "dark" },
      { shape: "box", size: [0.8,0.07,0.16], pos: [0,0.08,0.3], color: "metal" },
      { shape: "box", size: [0.8,0.07,0.16], pos: [0,0.08,-0.3], color: "metal" },
      { shape: "box", size: [0.07,0.09,1], pos: [0.22,0.15,0], color: "light", mirror: true },
    ],
  },
  // station : gare (3 x 3) — quai clair, auvent d'équipe sur poteaux, bâtiment et conteneurs (600 triangles)
  station: {
    parts: [
      ...socle(3),
      { shape: "bevel", size: [2.8,0.35,1.2], pos: [0,0.35,0.7], color: "light" },
      { shape: "box", size: [2.8,0.06,0.15], pos: [0,0.55,1.28], color: "hazard" },
      { shape: "box", size: [2.4,0.04,0.03], pos: [0,0.38,1.31], color: "glow" },
      { shape: "bevel", size: [0.14,1.4,0.14], pos: [1.25,1.1,0.3], color: "metal", mirror: true },
      { shape: "bevel", size: [0.14,1.4,0.14], pos: [1.25,1.1,1.15], color: "metal", mirror: true },
      { shape: "wedge", size: [2.9,0.25,1.2], pos: [0,1.9,0.72], color: "faction" },
      { shape: "box", size: [2.6,0.04,0.03], pos: [0,1.76,1.3], color: "glow" },
      // bâtiment et conteneurs
      { shape: "bevel", size: [2.2,1.0,1.0], pos: [0,0.75,-0.75], color: "dark" },
      { shape: "bevel", size: [0.36,0.9,0.36], pos: [0.95,0.75,-0.4], color: "light", mirror: true },
      { shape: "bevel", size: [0.7,0.55,0.55], pos: [-0.6,1.52,-0.8], color: "hazard" },
      { shape: "bevel", size: [0.7,0.55,0.55], pos: [0.4,1.52,-0.8], color: "faction" },
      { shape: "box", size: [0.3,0.15,0.04], pos: [0.45,0.95,-0.24], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [-0.45,0.95,-0.24], color: "amber" },
    ],
  },
  // cargo_pad : héliport de fret (3 x 3) — aire marquée à anneau cyan, balises, petite tour vitrée (536 triangles)
  cargo_pad: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "cylinder", sides: 8, radius: 1.25, height: 0.12, pos: [0,0.3,0.1], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 1.12, height: 0.02, pos: [0,0.37,0.1], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 1.02, height: 0.03, pos: [0,0.375,0.1], color: "dark" },
      { shape: "box", size: [0.15,0.04,1.1], pos: [-0.35,0.4,0.1], color: "light" },
      { shape: "box", size: [0.15,0.04,1.1], pos: [0.35,0.4,0.1], color: "light" },
      { shape: "box", size: [0.7,0.04,0.15], pos: [0,0.4,0.1], color: "light" },
      { shape: "box", size: [0.14,0.14,0.14], pos: [1.1,0.42,1.1], color: "glow", mirror: true },
      { shape: "box", size: [0.14,0.14,0.14], pos: [1.1,0.42,-0.9], color: "glow", mirror: true },
      // tour
      { shape: "bevel", size: [0.5,1.3,0.5], pos: [1.1,0.85,-1.15], color: "metal" },
      { shape: "bevel", size: [0.62,0.3,0.62], pos: [1.1,1.6,-1.15], color: "glass" },
      { shape: "bevel", size: [0.56,0.1,0.56], pos: [1.1,1.8,-1.15], color: "faction" },
      { shape: "box", size: [0.03,0.4,0.03], pos: [1.25,2.05,-1.25], color: "dark" },
      { shape: "box", size: [0.06,0.06,0.06], pos: [1.25,2.27,-1.25], color: "amber" },
      // réservoir de carburant
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.7, pos: [-1.0,0.47,-1.15], rot: [0,0,90], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.21, height: 0.06, pos: [-1.0,0.47,-1.15], rot: [0,0,90], color: "faction" },
    ],
  },
  // splitter : répartiteur (1 x 1) — entrée à l'arrière (-z), sorties : avant (+z), gauche (-x), droite (+x)
  splitter: { parts: lotARepartiteur("faction", ["glow", "glow", "glow"]) },
  // splitter_n2 : répartiteur réglé « gauche et avant » (flèche de droite éteinte)
  splitter_n2: { parts: lotARepartiteur("faction", ["glow", "glow", null]) },
  // splitter_n3 : répartiteur réglé « droite et avant » (flèche de gauche éteinte)
  splitter_n3: { parts: lotARepartiteur("faction", ["glow", null, "glow"]) },
  // sorter : trieur (1 x 1) — entrée à l'arrière (-z), sorties : avant (+z), gauche (-x), droite (+x) ;
  // caisson de danger, fenêtre de filtre vitrée sur cadre sombre
  sorter: {
    parts: [
      ...lotARepartiteur("hazard", ["glow", "glow", false]),
      { shape: "box", size: [0.29, 0.03, 0.29], pos: [0, 0.315, -0.15], color: "dark", fine: true },
      { shape: "box", size: [0.25, 0.1, 0.25], pos: [0, 0.36, -0.15], color: "glass" },
    ],
  },
  // overflow : débordement (1 x 1) — entrée à l'arrière (-z), sorties : avant (+z), gauche (-x), droite (+x)
  overflow: { parts: lotARepartiteur("dark", ["glow", "light", "light"], true) },
  // gift_portal : portail de don (3 x 3) — arche lumineuse au-dessus d'une plateforme
  gift_portal: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "cylinder", sides: 8, radius: 1.2, height: 0.1, pos: [0,0.3,0], color: "glass" },
      { shape: "cylinder", sides: 8, radius: 0.35, height: 0.04, pos: [0,0.37,0], color: "glow" },
      { shape: "box", size: [0.3,2.3,0.4], pos: [1.25,1.35,0], color: "faction", mirror: true },
      { shape: "box", size: [2.8,0.3,0.4], pos: [0,2.55,0], color: "faction" },
      { shape: "box", size: [2.2,0.1,0.15], pos: [0,2.3,0], color: "glow" },
      { shape: "box", size: [0.12,1.9,0.12], pos: [1.08,1.3,0], color: "glow", mirror: true },
      { shape: "box", size: [0.5,0.5,0.5], pos: [1.25,2.9,0], color: "light", mirror: true },
    ],
  },
  // roboport : base de robots logistiques (3 x 3) — tour d'acier à quatre baies de recharge lumineuses, pont
  // d'équipe, aire d'appontage tournée à croix de danger et anneau cyan, drone posé, balises d'angle, mât
  // d'antenne à parabole et feu cyan
  roboport: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "bevel", size: [2.4, 1.2, 2.4], pos: [0, 0.85, 0], color: "metal" },
      // baies de recharge sur les quatre faces : alcôve noire, cadre lumineux, plaque d'équipe
      ...[0, 90, 180, 270].flatMap((a): Part[] => {
        const r = (a * Math.PI) / 180;
        const at = (d: number, y: number, t = 0): Vec3 => [lotAr(Math.sin(r) * d + Math.cos(r) * t), y, lotAr(Math.cos(r) * d - Math.sin(r) * t)];
        return [
          { shape: "box", size: [0.9, 0.6, 0.04], pos: at(1.2, 0.8), rot: [0, a, 0], color: "black" },
          { shape: "box", size: [1.0, 0.04, 0.05], pos: at(1.2, 1.12), rot: [0, a, 0], color: "glow" },
          { shape: "box", size: [0.04, 0.64, 0.05], pos: at(1.2, 0.8, 0.5), rot: [0, a, 0], color: "light" },
          { shape: "box", size: [0.04, 0.64, 0.05], pos: at(1.2, 0.8, -0.5), rot: [0, a, 0], color: "light" },
          { shape: "box", size: [0.5, 0.05, 0.1], pos: at(1.2, 0.52), rot: [0, a, 0], color: "steel" },
          { shape: "box", size: [0.26, 0.04, 0.02], pos: at(1.215, 0.92), rot: [0, a, 0], color: "amber", fine: true },
        ];
      }),
      // pont d'équipe, aire d'appontage
      { shape: "bevel", size: [2.7, 0.15, 2.7], pos: [0, 1.5, 0], color: "faction" },
      { shape: "lathe", sides: 16, pos: [0, 1.575, 0], color: "dark", profile: [[0, 0], [0.86, 0], [0.86, 0.04], [0.8, 0.07], [0, 0.07]] },
      { shape: "torus", radius: 0.82, tube: 0.025, sides: 16, pos: [0, 1.645, 0], color: "glow" },
      { shape: "box", size: [0.12, 0.03, 0.9], pos: [0, 1.66, 0], color: "hazard" },
      { shape: "box", size: [0.9, 0.03, 0.12], pos: [0, 1.66, 0], color: "hazard" },
      // drone posé : coque claire, quatre rotors (fins), patins
      { shape: "lathe", sides: 10, pos: [0.42, 1.66, 0.42], color: "light", profile: [[0, 0], [0.12, 0], [0.16, 0.05], [0.12, 0.11], [0, 0.13]] },
      { shape: "box", size: [0.5, 0.025, 0.04], pos: [0.42, 1.74, 0.42], rot: [0, 45, 0], color: "dark" },
      { shape: "box", size: [0.5, 0.025, 0.04], pos: [0.42, 1.74, 0.42], rot: [0, -45, 0], color: "dark" },
      ...[45, 135, 225, 315].map((a): Part => ({ shape: "cylinder", sides: 10, radius: 0.08, height: 0.01, pos: [lotAr(0.42 + Math.sin((a * Math.PI) / 180) * 0.24), 1.765, lotAr(0.42 + Math.cos((a * Math.PI) / 180) * 0.24)], color: "steel", fine: true })),
      { shape: "sphere", radius: 0.035, pos: [0.42, 1.8, 0.42], color: "glow", fine: true },
      // balises d'angle : socle d'acier, lanterne cyan
      ...[[1.2, 1.2], [1.2, -1.2], [-1.2, 1.2]].flatMap(([x, z]): Part[] => [
        { shape: "cylinder", sides: 10, radius: 0.1, height: 0.06, pos: [x, 1.6, z], color: "steel" },
        { shape: "cylinder", sides: 8, radius: 0.07, height: 0.12, pos: [x, 1.69, z], color: "glow" },
        { shape: "cylinder", sides: 8, radius: 0.08, height: 0.02, pos: [x, 1.76, z], color: "dark", fine: true },
      ]),
      // mât d'antenne à l'angle arrière gauche : fût effilé, haubans, parabole, feu cyan
      { shape: "cylinder", sides: 10, radius: 0.13, height: 0.08, pos: [-1.0, 1.615, -1.0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.06, radiusTop: 0.035, height: 1.2, pos: [-1.0, 2.2, -1.0], color: "light" },
      { shape: "torus", radius: 0.06, tube: 0.015, sides: 8, pos: [-1.0, 2.2, -1.0], color: "steel", fine: true },
      { shape: "tube", radius: 0.01, sides: 4, path: [[-1.0, 2.5, -1.0], [-1.2, 1.6, -0.8]], color: "steel", fine: true },
      { shape: "tube", radius: 0.01, sides: 4, path: [[-1.0, 2.5, -1.0], [-0.75, 1.6, -1.15]], color: "steel", fine: true },
      { shape: "lathe", sides: 12, pos: [-0.92, 2.35, -0.92], rot: [-50, 45, 0], color: "light", profile: [[0, 0], [0.12, 0.02], [0.2, 0.06], [0.22, 0.08], [0, 0.03]] },
      { shape: "sphere", radius: 0.14, pos: [-1.0, 2.83, -1.0], color: "glow" },
    ],
  },
};
