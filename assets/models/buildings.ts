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

/** Extracteur de base (niveau 1) ; les niveaux améliorés lui ajoutent des pièces. */
const EXTRACTEUR_BASE: Part[] = [
      ...socle(2),
      ...filets(2),
      // sens de sortie : une flèche ambre devant chacune des deux cases de la face avant (le minerai sort
      // par là), faite de deux demi-pointes comme celle des tapis
      { shape: "box", size: [0.62, 0.08, 0.36], pos: [0.5, 0.29, 0.8], color: "dark", mirror: true },
      { shape: "wedge", size: [0.04, 0.26, 0.32], pos: [0.63, 0.355, 0.8], color: "amber", rot: [0, 0, -90], mirror: true },
      { shape: "wedge", size: [0.04, 0.26, 0.32], pos: [-0.37, 0.355, 0.8], color: "amber", rot: [0, 0, -90], mirror: true },
      // puits : cratère sombre, anneau lumineux
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.04, pos: [0,0.26,0.3], color: "ore" },
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.04, pos: [0,0.28,0.3], color: "dark" },
      // foret (tourne en continu) : cône vers le bas et filets d'hélice
      { shape: "cone", sides: 8, radius: 0.3, height: 0.88, pos: [0,0.74,0.3], rot: [180,0,0], color: "metal", pivot: "foret" },
      { shape: "box", size: [0.56,0.06,0.08], pos: [0,0.95,0.3], rot: [0,0,12], color: "dark", parent: "foret" },
      { shape: "box", size: [0.08,0.06,0.42], pos: [0,0.72,0.3], rot: [12,0,0], color: "dark", parent: "foret" },
      { shape: "box", size: [0.3,0.06,0.07], pos: [0,0.5,0.3], rot: [0,0,-12], color: "dark", parent: "foret" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.14, pos: [0,1.25,0.3], color: "dark" },
      { shape: "bevel", size: [0.44,0.28,0.44], pos: [0,1.42,0.12], color: "light" },
      // tour de forage
      { shape: "bevel", size: [0.62,1.8,0.5], pos: [0,1.15,-0.4], color: "dark" },
      { shape: "bevel", size: [0.18,1.1,0.46], pos: [0.38,1.3,-0.38], color: "light", mirror: true },
      { shape: "box", size: [0.3,0.5,0.03], pos: [0,1.8,-0.14], color: "ore" },
      { shape: "bevel", size: [0.68,0.22,0.56], pos: [0,2.12,-0.4], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.3, pos: [0,2.35,-0.45], color: "metal" },
      { shape: "box", size: [0.08,0.05,0.03], pos: [0.2,2.12,-0.11], color: "amber", mirror: true },
      // cuve gauche : bandes sombres, voyant ambre
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.8, pos: [-0.66,0.65,-0.1], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.29, height: 0.14, pos: [-0.66,0.55,-0.1], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.12, pos: [-0.66,1.1,-0.1], color: "faction" },
      { shape: "sphere", radius: 0.16, pos: [-0.66,1.2,-0.1], color: "ore" },
      // cuve droite : dôme et filet cyan
      { shape: "cylinder", sides: 8, radius: 0.25, height: 0.55, pos: [0.66,0.52,-0.5], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.12, pos: [0.66,0.62,-0.5], color: "ore" },
      { shape: "sphere", radius: 0.25, pos: [0.66,0.8,-0.5], color: "metal" },
      // conduite vers l'avant
      { shape: "box", size: [0.12,0.12,0.8], pos: [0.66,0.36,0.1], color: "dark" },
      { shape: "bevel", size: [0.3,0.22,0.3], pos: [0.66,0.36,0.62], color: "metal" },
    ];

/** Ajouts du niveau 2 (repris en partie par le niveau 3). */
const EXTRACTEUR_N2: Part[] = [
  // anneau lumineux au puits, bande de danger sur la tour
  { shape: "cylinder", sides: 8, radius: 0.56, height: 0.03, pos: [0,0.255,0.3], color: "glow" },
  { shape: "box", size: [0.66,0.1,0.54], pos: [0,0.85,-0.4], color: "hazard" },
  { shape: "box", size: [0.66,0.1,0.54], pos: [0,1.55,-0.4], color: "hazard" },
  // troisième cuve à l'avant gauche
  { shape: "cylinder", sides: 8, radius: 0.2, height: 0.5, pos: [-0.66,0.45,0.58], color: "light" },
  { shape: "cylinder", sides: 8, radius: 0.22, height: 0.06, pos: [-0.66,0.72,0.58], color: "glow" },
  { shape: "box", size: [0.1,0.1,0.4], pos: [-0.66,0.3,0.25], color: "dark" },
  // rehausse de la tour, coiffe aux couleurs du camp, balise ambre
  { shape: "bevel", size: [0.5,0.7,0.42], pos: [0,2.58,-0.4], color: "metal" },
  { shape: "box", size: [0.04,0.5,0.03], pos: [0.18,2.58,-0.18], color: "glow", mirror: true },
  { shape: "bevel", size: [0.6,0.16,0.5], pos: [0,3.0,-0.4], color: "faction" },
  { shape: "sphere", radius: 0.1, pos: [0,3.16,-0.4], color: "amber" },
];

export const BUILDING_MODELS: Record<string, Model> = {
  // extractor : tour de forage centrale, foret hélicoïdal au sol, deux cuves (828 triangles)
  extractor: { parts: EXTRACTEUR_BASE },
  // extractor_n2 (1092 triangles) : niveau 2, tour rehaussée et cerclée de bandes de danger, balise, anneau lumineux au
  // puits, troisième cuve à l'avant gauche
  extractor_n2: {
    parts: [
      ...EXTRACTEUR_BASE,
      ...EXTRACTEUR_N2,
    ],
  },
  // extractor_n3 (1520 triangles) : niveau 3, derrick à treillis lumineux autour de la tour, couronne aux couleurs du camp,
  // bobines d'énergie autour du foret, second foret à l'avant gauche
  extractor_n3: {
    parts: [
      ...EXTRACTEUR_BASE,
      ...EXTRACTEUR_N2.filter((p) => p.pos?.[1] === undefined || p.pos[1] < 2.4),
      // derrick : quatre montants à filet cyan, entretoises, couronne et antenne
      ...[[-0.44, -0.12], [0.44, -0.12], [-0.44, -0.68], [0.44, -0.68]].flatMap(([x, z]): Part[] => [
        { shape: "box", size: [0.08,3.0,0.08], pos: [x,1.75,z], color: "metal" },
        { shape: "box", size: [0.03,2.4,0.03], pos: [x + Math.sign(x) * 0.05,1.8,z], color: "glow" },
      ]),
      ...[0.9, 1.7, 2.5].flatMap((y): Part[] => [
        { shape: "box", size: [0.92,0.06,0.06], pos: [0,y,-0.12], color: "dark" },
        { shape: "box", size: [0.92,0.06,0.06], pos: [0,y,-0.68], color: "dark" },
        { shape: "box", size: [0.06,0.06,0.6], pos: [0.44,y,-0.4], color: "dark", mirror: true },
      ]),
      { shape: "box", size: [0.06,1.0,0.06], pos: [0.22,2.1,-0.12], rot: [0,0,28], color: "metal", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.2, pos: [0,3.3,-0.4], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.52, height: 0.05, pos: [0,3.22,-0.4], color: "glow" },
      { shape: "cone", sides: 8, radius: 0.3, height: 0.4, pos: [0,3.6,-0.4], color: "light" },
      { shape: "cylinder", sides: 5, radius: 0.025, height: 0.6, pos: [0,4.05,-0.4], color: "metal" },
      { shape: "sphere", radius: 0.08, pos: [0,4.38,-0.4], color: "amber" },
      // bobines d'énergie autour du foret
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.03, pos: [0,0.62,0.3], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.03, pos: [0,0.98,0.3], color: "glow" },
      { shape: "box", size: [0.06,0.5,0.06], pos: [0.42,0.8,0.3], color: "metal", mirror: true },
      // second foret (tourne aussi) à l'avant gauche
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.08, pos: [-0.62,0.32,0.62], color: "dark" },
      { shape: "cone", sides: 6, radius: 0.15, height: 0.5, pos: [-0.62,0.6,0.62], rot: [180,0,0], color: "metal", pivot: "foret2" },
      { shape: "box", size: [0.3,0.05,0.05], pos: [-0.62,0.7,0.62], rot: [0,0,12], color: "dark", parent: "foret2" },
      { shape: "cylinder", sides: 8, radius: 0.16, height: 0.12, pos: [-0.62,0.92,0.62], color: "faction" },
    ],
  },
  // belt1 : rebords clairs, flèche sombre, voyants ambre (96 triangles)
  belt1: tapis("metal", "dark", "amber", 0.3),
  // collector : collecteur de surplus, tapis surmonté d'un portique et d'une trémie qui aspire le surplus
  collector: {
    parts: [
      ...tapis("metal", "dark", "amber", 0.3).parts,
      // quatre pieds courts de part et d'autre du tapis
      { shape: "box", size: [0.07, 0.42, 0.07], pos: [0.37, 0.21, 0.28], color: "dark", mirror: true },
      { shape: "box", size: [0.07, 0.42, 0.07], pos: [0.37, 0.21, -0.28], color: "dark", mirror: true },
      // capot au-dessus du tapis, bouche d'aspiration ambrée dessous, filets sur les flancs
      { shape: "bevel", size: [0.84, 0.24, 0.7], pos: [0, 0.54, 0], color: "light" },
      { shape: "box", size: [0.56, 0.02, 0.5], pos: [0, 0.415, 0], color: "amber" },
      { shape: "bevel", size: [0.6, 0.07, 0.46], pos: [0, 0.69, 0], color: "faction" },
      { shape: "box", size: [0.02, 0.05, 0.5], pos: [0.425, 0.55, 0], color: "glow", mirror: true },
      // trémie de réserve sur le capot
      { shape: "cylinder", sides: 6, radius: 0.13, radiusTop: 0.17, height: 0.2, pos: [0.12, 0.82, -0.08], color: "metal" },
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
  // inserter : petit socle rond à liseré cyan, colonne fine, bras long et pince (84 triangles)
  inserter: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.24, height: 0.08, pos: [0,0.04,0], color: "dark" },
      { shape: "box", size: [0.34,0.02,0.34], pos: [0,0.09,-0.04], color: "glow" },
      { shape: "box", size: [0.28,0.12,0.28], pos: [0,0.16,-0.04], color: "faction" },
      { shape: "box", size: [0.1,0.26,0.1], pos: [0,0.34,-0.04], color: "metal" },
      { shape: "box", size: [0.06,0.06,0.66], pos: [0,0.48,0.2], color: "light", pivot: "bras" },
      { shape: "box", size: [0.16,0.07,0.07], pos: [0,0.44,0.53], color: "dark", parent: "bras" },
    ],
  },
  // long_inserter : bras long (prise et dépose à 2 cases) ; liseré ambre, colonne haute pour passer
  // par-dessus un tapis, moyeu au centre (pivot) et flèche de 1,6 case terminée par une pince (≈ 130 triangles)
  long_inserter: {
    parts: [
      { shape: "cylinder", sides: 6, radius: 0.26, height: 0.08, pos: [0,0.04,0], color: "dark" },
      { shape: "box", size: [0.36,0.02,0.36], pos: [0,0.09,0], color: "amber" },
      { shape: "box", size: [0.28,0.12,0.28], pos: [0,0.16,0], color: "faction" },
      { shape: "box", size: [0.1,0.42,0.1], pos: [0,0.43,0], color: "metal" },
      { shape: "box", size: [0.18,0.1,0.18], pos: [0,0.66,0], color: "light", pivot: "bras" },
      { shape: "box", size: [0.06,0.06,1.6], pos: [0,0.7,0.72], color: "light", parent: "bras" },
      { shape: "box", size: [0.03,0.02,1.2], pos: [0,0.74,0.62], color: "amber", parent: "bras" },
      { shape: "box", size: [0.06,0.06,0.36], pos: [0,0.7,-0.24], color: "dark", parent: "bras" },
      { shape: "box", size: [0.05,0.2,0.05], pos: [0,0.6,1.5], color: "metal", parent: "bras" },
      { shape: "box", size: [0.18,0.07,0.08], pos: [0,0.48,1.5], color: "dark", parent: "bras" },
    ],
  },
  // furnace : bloc sombre à coins blindés, gueule de feu ambre, cheminée rougeoyante (708 triangles)
  furnace: {
    parts: [
      ...socle(2),
      ...filets(2, 2, false),
      { shape: "bevel", size: [1.66,1.2,1.56], pos: [0,0.85,-0.06], color: "dark" },
      { shape: "bevel", size: [0.36,1.04,0.36], pos: [0.7,0.78,0.62], color: "light", mirror: true },
      { shape: "bevel", size: [0.36,1.04,0.36], pos: [0.7,0.78,-0.66], color: "light", mirror: true },
      { shape: "box", size: [0.08,0.05,0.03], pos: [0.7,1.12,0.81], color: "amber", mirror: true },
      // gueule du four
      { shape: "bevel", size: [0.98,0.74,0.12], pos: [0,0.74,0.74], bevel: 0.04, color: "black" },
      { shape: "box", size: [0.8,0.54,0.06], pos: [0,0.7,0.79], color: "amber" },
      { shape: "bevel", size: [1.06,0.16,0.22], pos: [0,1.17,0.72], color: "light" },
      { shape: "box", size: [0.04,0.04,0.9], pos: [0.85,1.3,-0.1], color: "glow", mirror: true },
      // toit aux couleurs de l'équipe (centre dégagé pour l'icône de la recette)
      { shape: "bevel", size: [1.5,0.14,1.4], pos: [0,1.52,-0.08], color: "faction" },
      { shape: "bevel", size: [0.26,0.1,0.22], pos: [-0.58,1.63,0.5], color: "metal" },
      // cheminée courte, dans le coin arrière droit
      { shape: "cylinder", sides: 8, radius: 0.24, height: 0.18, pos: [0.54,1.67,-0.56], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.18, height: 0.42, pos: [0.54,1.94,-0.56], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.08, pos: [0.54,2.17,-0.56], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.02, pos: [0.54,2.22,-0.56], color: "amber" },
      { shape: "box", size: [0.07,0.05,0.03], pos: [0.54,1.92,-0.37], color: "amber" },
    ],
  },
  // assembler1 : caisson à coins clairs, couvercle ouvert à l'arrière, bras robotisé sur le pilier arrière
  // gauche, tourné en diagonale : le centre du toit reste dégagé pour l'icône de la recette (940 triangles)
  assembler1: {
    parts: [
      ...assembleur(),
      ...brasRobot(-1.1, -1.1, true, { yaw: 45, reach: 0.85, lift: 0.19 }),
      { shape: "bevel", size: [1.7,0.08,0.9], pos: [0.1,1.47,-1.1], rot: [70,0,0], color: "light" },
      { shape: "box", size: [1.2,0.03,0.05], pos: [0.1,1.75,-1.12], rot: [70,0,0], color: "glow" },
      { shape: "bevel", size: [0.42,0.24,0.36], pos: [1.1,1.28,1.08], color: "metal" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.1,1.3,1.27], color: "amber" },
    ],
  },
  // assembler2 : plateau vitré à croix lumineuse, deux bras de part et d'autre (1064 triangles)
  assembler2: {
    parts: [
      ...assembleur(),
      { shape: "bevel", size: [1.2,0.1,1.2], pos: [0,1.02,0.1], bevel: 0.04, color: "black" },
      { shape: "box", size: [1.0,0.04,1.0], pos: [0,1.08,0.1], color: "glass" },
      { shape: "box", size: [1.0,0.03,0.06], pos: [0,1.1,0.1], color: "glow" },
      { shape: "box", size: [0.06,0.03,1.0], pos: [0,1.1,0.1], color: "glow" },
      ...brasRobot(0.82, -0.45, true),
      ...brasRobot(-0.82, -0.45, false),
    ],
  },
  // assembler3 : disque holographique à cubes lumineux, écran à l'arrière, bras (984 triangles)
  assembler3: {
    parts: [
      ...assembleur(),
      { shape: "cylinder", sides: 8, radius: 0.62, height: 0.1, pos: [0,1.02,0.2], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.04, pos: [0,1.08,0.2], color: "glow" },
      { shape: "box", size: [0.18,0.18,0.18], pos: [0.1,1.25,0.2], rot: [0,30,0], color: "glow" },
      { shape: "box", size: [0.14,0.14,0.14], pos: [-0.16,1.2,0.3], rot: [0,15,0], color: "glow" },
      { shape: "box", size: [0.12,0.12,0.12], pos: [-0.02,1.42,0.12], rot: [20,40,0], color: "glow" },
      { shape: "bevel", size: [1.3,0.7,0.1], pos: [0.1,1.45,-0.85], bevel: 0.03, color: "dark" },
      { shape: "box", size: [1.14,0.56,0.03], pos: [0.1,1.45,-0.79], color: "glow" },
      ...brasRobot(-0.85, -0.3, true),
    ],
  },
  // refinery : colonnes de distillation à dômes, cuve couchée, conduites, pupitre (792 triangles)
  refinery: {
    parts: [
      ...socle(3),
      ...filets(3),
      // grande colonne
      { shape: "cylinder", sides: 8, radius: 0.42, height: 2.0, pos: [-0.62,1.25,-0.62], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.3, pos: [-0.62,0.6,-0.62], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.34, pos: [-0.62,1.85,-0.62], color: "faction" },
      { shape: "sphere", radius: 0.42, detail: 1, pos: [-0.62,2.25,-0.62], scale: [1,0.7,1], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.13, height: 0.16, pos: [-0.62,2.6,-0.62], color: "metal" },
      { shape: "box", size: [0.05,0.9,0.03], pos: [-0.62,1.25,-0.19], color: "glow" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [-0.62,2.15,-0.22], color: "amber" },
      // colonne claire
      { shape: "cylinder", sides: 8, radius: 0.32, height: 1.5, pos: [0.55,1.0,-0.75], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.34, height: 0.28, pos: [0.55,1.25,-0.75], color: "dark" },
      { shape: "box", size: [0.04,0.24,0.03], pos: [0.55,1.25,-0.41], color: "glow" },
      { shape: "sphere", radius: 0.32, pos: [0.55,1.75,-0.75], scale: [1,0.7,1], color: "faction" },
      { shape: "sphere", radius: 0.08, pos: [0.55,2.0,-0.75], color: "amber" },
      // petite colonne
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.7, pos: [0.15,0.6,0.15], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 0.12, pos: [0.15,0.97,0.15], color: "dark" },
      { shape: "sphere", radius: 0.07, pos: [0.15,1.07,0.15], color: "amber" },
      // cuve couchée
      { shape: "cylinder", sides: 8, radius: 0.33, height: 1.1, pos: [-0.75,0.6,0.62], rot: [0,0,90], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.35, height: 0.12, pos: [-0.45,0.6,0.62], rot: [0,0,90], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.05, pos: [-1.31,0.6,0.62], rot: [0,0,90], color: "glow" },
      { shape: "box", size: [0.5,0.2,0.4], pos: [-0.75,0.3,0.62], color: "dark" },
      // conduites
      { shape: "box", size: [0.12,0.12,1.1], pos: [0.15,0.42,-0.4], color: "metal" },
      { shape: "box", size: [1.1,0.12,0.12], pos: [-0.05,1.45,-0.7], color: "metal" },
      { shape: "box", size: [0.12,0.12,0.9], pos: [1.05,0.4,0.0], color: "dark" },
      { shape: "box", size: [0.9,0.12,0.12], pos: [0.6,0.4,-0.4], color: "dark" },
      // pupitre de commande
      { shape: "bevel", size: [0.9,0.3,0.6], pos: [0.55,0.4,0.85], color: "light" },
      { shape: "box", size: [0.4,0.03,0.3], pos: [0.45,0.56,0.85], color: "dark" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [0.85,0.42,1.16], color: "amber" },
    ],
  },
  // chemical : deux cuves ouvertes au liquide lumineux, réservoir à dôme, cheminées (896 triangles)
  chemical: {
    parts: [
      ...socle(3),
      ...filets(3),
      // bloc arrière aux couleurs de l'équipe, deux cheminées
      { shape: "bevel", size: [1.2,0.6,0.7], pos: [-0.5,0.55,-0.85], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.17, height: 1.4, pos: [-0.75,1.4,-0.85], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.19, height: 0.12, pos: [-0.75,1.6,-0.85], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.2, pos: [-0.75,2.18,-0.85], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.15, height: 1.1, pos: [-0.3,1.25,-0.9], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.09, height: 0.2, pos: [-0.3,1.88,-0.9], color: "dark" },
      // réservoir sombre
      { shape: "cylinder", sides: 8, radius: 0.32, height: 1.0, pos: [-1.08,0.75,-0.25], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.34, height: 0.06, pos: [-1.08,1.0,-0.25], color: "glow" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [-1.08,0.6,0.07], color: "amber" },
      // réservoir clair à dôme
      { shape: "cylinder", sides: 8, radius: 0.45, height: 0.6, pos: [-0.5,0.55,0.3], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.47, height: 0.1, pos: [-0.5,0.45,0.3], color: "dark" },
      { shape: "sphere", radius: 0.45, detail: 1, pos: [-0.5,0.85,0.3], scale: [1,0.7,1], color: "light" },
      // fiole vitrée
      { shape: "cylinder", sides: 8, radius: 0.15, height: 0.4, pos: [-0.85,0.45,0.95], color: "glass" },
      { shape: "cylinder", sides: 8, radius: 0.1, height: 0.3, pos: [-0.85,0.45,0.95], color: "glow" },
      // cuves ouvertes
      { shape: "cylinder", sides: 8, radius: 0.5, height: 0.6, pos: [0.55,0.55,0.55], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.52, height: 0.08, pos: [0.55,0.86,0.55], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.42, height: 0.04, pos: [0.55,0.91,0.55], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.51, height: 0.05, pos: [0.55,0.5,0.55], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.46, height: 0.55, pos: [0.75,0.55,-0.6], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.48, height: 0.08, pos: [0.75,0.84,-0.6], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.38, height: 0.04, pos: [0.75,0.89,-0.6], color: "glow" },
      // conduites
      { shape: "box", size: [0.12,0.12,0.7], pos: [0.1,0.4,-0.05], color: "light" },
      { shape: "box", size: [1.5,0.12,0.12], pos: [-0.25,0.35,1.2], color: "metal" },
      { shape: "box", size: [0.12,0.4,0.12], pos: [0.1,0.55,-0.4], color: "metal" },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.1,0.4,1.21], color: "amber" },
    ],
  },
  // lab : caisson carré (ses parois portent les trappes), dôme vitré sur anneau clair, liseré cyan, pupitre holographique
  lab: {
    parts: [
      ...socle(3),
      ...filets(3),
      // caisson : parois droites jusqu'au bord de l'emprise, coins chanfreinés clairs, liseré haut
      { shape: "bevel", size: [2.84,0.6,2.84], pos: [0,0.55,0], bevel: 0.08, color: "dark" },
      { shape: "bevel", size: [0.36,0.66,0.36], pos: [1.26,0.56,1.26], bevel: 0.06, color: "light", mirror: true },
      { shape: "bevel", size: [0.36,0.66,0.36], pos: [1.26,0.56,-1.26], bevel: 0.06, color: "light", mirror: true },
      { shape: "box", size: [2.3,0.04,0.03], pos: [0,0.8,1.43], color: "glow" },
      { shape: "box", size: [0.03,0.04,2.3], pos: [1.43,0.8,0], color: "glow", mirror: true },
      { shape: "box", size: [2.3,0.04,0.03], pos: [0,0.8,-1.43], color: "glow" },
      // anneau posé sur le caisson
      { shape: "cylinder", sides: 8, radius: 1.3, radiusTop: 1.2, height: 0.3, pos: [0,1.0,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 1.32, height: 0.06, pos: [0,0.88,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 1.21, height: 0.08, pos: [0,1.16,0], color: "faction" },
      // dôme vitré et ses nervures
      { shape: "sphere", radius: 1.0, detail: 1, pos: [0,1.18,0], scale: [1,0.72,1], color: "glass" },
      { shape: "cylinder", sides: 8, radius: 0.93, height: 0.05, pos: [0,1.46,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.66, height: 0.05, pos: [0,1.73,0], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.32, height: 0.1, pos: [0,1.94,0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.2, height: 0.04, pos: [0,2.0,0], color: "glow" },
      // pupitre holographique, sur un coin du caisson
      { shape: "cylinder", sides: 8, radius: 0.24, height: 0.36, pos: [1.1,1.03,-1.1], color: "light" },
      { shape: "cylinder", sides: 8, radius: 0.27, height: 0.07, pos: [1.1,1.24,-1.1], color: "dark" },
      { shape: "cone", sides: 8, radius: 0.28, height: 0.5, pos: [1.1,1.53,-1.1], rot: [180,0,0], color: "glow" },
    ],
  },
  // depot : conteneur blindé sombre, rideau à lames à l'avant, coins clairs, toit d'équipe (620 triangles)
  depot: {
    parts: [
      ...socle(2),
      ...filets(2),
      { shape: "bevel", size: [1.76,0.95,1.6], pos: [0,0.72,-0.05], color: "dark" },
      // rideau à lames
      { shape: "bevel", size: [1.04,0.78,0.1], pos: [0,0.66,0.77], bevel: 0.03, color: "black" },
      { shape: "box", size: [0.92,0.04,0.04], pos: [0,0.42,0.82], color: "dark" },
      { shape: "box", size: [0.92,0.04,0.04], pos: [0,0.58,0.82], color: "dark" },
      { shape: "box", size: [0.92,0.04,0.04], pos: [0,0.74,0.82], color: "dark" },
      { shape: "box", size: [1.0,0.04,0.03], pos: [0,1.09,0.77], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.62,0.4,0.77], color: "amber", mirror: true },
      // blindage clair aux coins supérieurs
      { shape: "bevel", size: [0.4,0.5,0.4], pos: [0.7,1.0,0.6], color: "light", mirror: true },
      { shape: "bevel", size: [0.4,0.5,0.4], pos: [0.7,1.0,-0.66], color: "light", mirror: true },
      { shape: "box", size: [0.04,0.36,0.7], pos: [0.88,0.62,-0.05], color: "metal", mirror: true },
      { shape: "box", size: [0.03,0.04,0.6], pos: [0.9,0.86,-0.05], color: "glow", mirror: true },
      // toit et poignée de levage
      { shape: "bevel", size: [1.1,0.14,1.3], pos: [0,1.26,-0.05], color: "faction" },
      { shape: "bevel", size: [0.56,0.14,0.34], pos: [0,1.38,-0.05], color: "light" },
      { shape: "box", size: [0.3,0.08,0.36], pos: [0,1.45,-0.05], color: "dark" },
    ],
  },
  // depot_n2 : dépôt amélioré, rehaussé d'un étage de stockage à hublots, deux goulottes de sortie filtrée à
  // l'avant, toit plat cerclé d'une rambarde où s'affichent les objets filtrés
  depot_n2: {
    parts: [
      ...socle(2),
      ...filets(2),
      { shape: "bevel", size: [1.76,0.95,1.6], pos: [0,0.72,-0.05], color: "dark" },
      // rideau à lames
      { shape: "bevel", size: [1.04,0.78,0.1], pos: [0,0.66,0.77], bevel: 0.03, color: "black" },
      { shape: "box", size: [0.92,0.04,0.04], pos: [0,0.42,0.82], color: "dark" },
      { shape: "box", size: [0.92,0.04,0.04], pos: [0,0.58,0.82], color: "dark" },
      { shape: "box", size: [0.92,0.04,0.04], pos: [0,0.74,0.82], color: "dark" },
      { shape: "box", size: [1.0,0.04,0.03], pos: [0,1.09,0.77], color: "glow" },
      // goulottes de sortie filtrée de part et d'autre du rideau
      { shape: "bevel", size: [0.24,0.5,0.22], pos: [0.7,0.55,0.8], color: "light", mirror: true },
      { shape: "box", size: [0.16,0.05,0.04], pos: [0.7,0.42,0.92], color: "amber", mirror: true },
      { shape: "box", size: [0.16,0.05,0.04], pos: [0.7,0.7,0.92], color: "glow", mirror: true },
      // ceinture entre les deux étages
      { shape: "bevel", size: [1.86,0.14,1.7], pos: [0,1.24,-0.05], color: "metal" },
      { shape: "box", size: [1.6,0.05,0.03], pos: [0,1.24,0.81], color: "amber" },
      // étage de stockage, hublots lumineux et nervures
      { shape: "bevel", size: [1.66,0.86,1.5], pos: [0,1.74,-0.05], color: "dark" },
      { shape: "bevel", size: [0.36,0.6,0.36], pos: [0.74,1.72,0.62], color: "light", mirror: true },
      { shape: "bevel", size: [0.36,0.6,0.36], pos: [0.74,1.72,-0.72], color: "light", mirror: true },
      { shape: "box", size: [0.26,0.18,0.03], pos: [-0.26,1.8,0.71], color: "glow" },
      { shape: "box", size: [0.26,0.18,0.03], pos: [0.26,1.8,0.71], color: "glow" },
      { shape: "box", size: [0.04,0.6,1.1], pos: [0.84,1.74,-0.05], color: "metal", mirror: true },
      { shape: "box", size: [0.03,0.04,0.9], pos: [0.86,1.98,-0.05], color: "glow", mirror: true },
      // toit plat d'équipe et rambarde
      { shape: "bevel", size: [1.74,0.12,1.58], pos: [0,2.23,-0.05], color: "faction" },
      { shape: "box", size: [1.7,0.1,0.04], pos: [0,2.36,0.72], color: "metal" },
      { shape: "box", size: [1.7,0.1,0.04], pos: [0,2.36,-0.82], color: "metal" },
      { shape: "box", size: [0.04,0.1,1.5], pos: [0.85,2.36,-0.05], color: "metal", mirror: true },
      { shape: "box", size: [0.12,0.22,0.12], pos: [0.78,2.4,0.66], color: "amber", mirror: true },
    ],
  },
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
  // land_factory : hangar à toit voûté, grande porte éclairée à l'avant, modules latéraux, cheminée (1020 triangles)
  land_factory: {
    parts: [
      ...socle(5),
      ...filets(5),
      // hall
      { shape: "bevel", size: [3.8,1.1,3.6], pos: [0,0.8,-0.35], color: "dark" },
      { shape: "box", size: [0.04,0.06,3.0], pos: [1.92,1.0,-0.4], color: "glow", mirror: true },
      { shape: "box", size: [0.14,0.14,2.6], pos: [-1.98,0.5,-0.6], color: "metal" },
      // toit voûté : faîte clair, pans aux couleurs de l'équipe
      { shape: "bevel", size: [1.8,0.75,3.0], pos: [0,1.7,0], color: "dark" },
      { shape: "bevel", size: [1.5,0.22,3.1], pos: [0,2.15,0], color: "light" },
      { shape: "bevel", size: [1.25,0.22,3.1], pos: [1.24,1.735,0], rot: [0,0,-38], color: "faction", mirror: true },
      { shape: "box", size: [0.06,0.03,2.8], pos: [0,2.27,0], color: "glow" },
      // portail avant
      { shape: "bevel", size: [2.7,2.0,0.4], pos: [0,1.25,1.55], color: "light" },
      { shape: "bevel", size: [2.0,1.45,0.1], pos: [0,0.98,1.76], bevel: 0.04, color: "black" },
      { shape: "box", size: [1.8,0.05,0.03], pos: [0,1.62,1.82], color: "glow" },
      { shape: "box", size: [0.05,1.3,0.03], pos: [0.88,0.95,1.82], color: "glow", mirror: true },
      { shape: "box", size: [0.1,0.06,0.03], pos: [1.15,1.9,1.76], color: "amber", mirror: true },
      { shape: "box", size: [2.0,0.03,0.6], pos: [0,0.265,2.1], color: "hazard" },
      // module avant gauche
      { shape: "bevel", size: [0.75,1.1,1.5], pos: [-2.0,0.8,1.3], color: "light" },
      { shape: "bevel", size: [0.6,0.12,1.3], pos: [-2.0,1.4,1.3], color: "faction" },
      { shape: "box", size: [0.03,0.05,1.1], pos: [-2.38,0.9,1.3], color: "glow" },
      { shape: "box", size: [0.4,0.5,0.04], pos: [-2.0,0.6,2.06], color: "dark" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [-1.75,0.95,2.06], color: "amber" },
      // module avant droit
      { shape: "bevel", size: [0.75,0.9,1.7], pos: [2.0,0.7,1.1], color: "dark" },
      { shape: "bevel", size: [0.7,0.3,1.0], pos: [2.0,1.3,1.2], color: "light" },
      { shape: "box", size: [0.03,0.05,1.3], pos: [2.38,0.75,1.1], color: "glow" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [2.0,1.0,1.96], color: "amber" },
      // machinerie arrière, cheminée, antenne
      { shape: "bevel", size: [1.2,0.5,0.6], pos: [1.0,1.6,-1.85], color: "metal" },
      { shape: "box", size: [0.08,0.06,0.03], pos: [1.0,1.65,-1.54], color: "amber" },
      { shape: "bevel", size: [1.0,0.3,0.6], pos: [-0.4,1.5,-1.85], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.22, height: 1.2, pos: [-1.5,1.95,-1.85], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.24, height: 0.05, pos: [-1.5,2.2,-1.85], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.26, height: 0.1, pos: [-1.5,2.55,-1.85], color: "metal" },
      { shape: "box", size: [0.04,0.8,0.04], pos: [1.5,2.25,-1.85], color: "dark" },
      { shape: "box", size: [0.07,0.07,0.07], pos: [1.5,2.66,-1.85], color: "amber" },
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
  // goulotte : petit tapis incliné entre la sortie d'un extracteur et le tapis voisin (étiré par le jeu)
  goulotte: {
    parts: [
      { shape: "box", size: [0.5, 0.05, 1], pos: [0, 0.025, 0], color: "dark" },
      { shape: "box", size: [0.38, 0.02, 0.98], pos: [0, 0.06, 0], color: "metal" },
      { shape: "box", size: [0.05, 0.1, 1], pos: [0.225, 0.05, 0], color: "light", mirror: true },
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
  // transfer : plateforme ronde praticable, couronne de segments, anneaux lumineux, trois bornes vitrées (892 triangles)
  transfer: {
    parts: [
      { shape: "cylinder", sides: 8, radius: 1.5, height: 0.15, pos: [0,0.075,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 1.05, height: 0.12, pos: [0,0.2,0], color: "metal" },
      { shape: "cylinder", sides: 8, radius: 0.92, height: 0.03, pos: [0,0.27,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.76, height: 0.03, pos: [0,0.28,0], color: "dark" },
      { shape: "cylinder", sides: 8, radius: 0.6, height: 0.03, pos: [0,0.29,0], color: "glow" },
      { shape: "cylinder", sides: 8, radius: 0.3, height: 0.03, pos: [0,0.3,0], color: "glass" },
      // couronne : segments clairs et segments aux couleurs de l'équipe
      { shape: "bevel", size: [0.9,0.2,0.36], pos: [0,0.25,1.25], color: "light" },
      { shape: "bevel", size: [0.9,0.2,0.36], pos: [0,0.25,-1.25], color: "light" },
      { shape: "bevel", size: [0.9,0.2,0.36], pos: [1.25,0.25,0], rot: [0,90,0], color: "light", mirror: true },
      { shape: "bevel", size: [0.9,0.2,0.36], pos: [0.884,0.25,0.884], rot: [0,45,0], color: "faction", mirror: true },
      { shape: "bevel", size: [0.9,0.2,0.36], pos: [0.884,0.25,-0.884], rot: [0,135,0], color: "faction", mirror: true },
      { shape: "box", size: [0.12,0.05,0.03], pos: [0.25,0.25,1.44], color: "amber", mirror: true },
      { shape: "box", size: [0.03,0.04,0.5], pos: [1.44,0.25,0], color: "glow", mirror: true },
      // bornes vitrées à l'arrière
      { shape: "bevel", size: [0.32,0.9,0.22], pos: [0,0.65,-1.32], color: "dark" },
      { shape: "bevel", size: [0.32,0.9,0.22], pos: [1.143,0.65,-0.66], rot: [0,120,0], color: "dark", mirror: true },
      { shape: "box", size: [0.18,0.5,0.03], pos: [0,0.7,-1.2], color: "glass" },
      { shape: "box", size: [0.18,0.5,0.03], pos: [1.039,0.7,-0.6], rot: [0,120,0], color: "glass", mirror: true },
      { shape: "bevel", size: [0.34,0.08,0.24], pos: [0,1.13,-1.32], color: "faction" },
      { shape: "bevel", size: [0.34,0.08,0.24], pos: [1.143,1.13,-0.66], rot: [0,120,0], color: "faction", mirror: true },
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
  // warehouse : entrepôt d'équipe (3 x 3) — hall à toit d'équipe, rideau à lames, deux silos clairs (688 triangles)
  warehouse: {
    parts: [
      ...socle(3),
      ...filets(3),
      { shape: "bevel", size: [2.6,1.1,1.6], pos: [0,0.8,-0.55], color: "dark" },
      { shape: "bevel", size: [0.4,1.0,0.4], pos: [1.12,0.75,0.08], color: "light", mirror: true },
      { shape: "wedge", size: [2.7,0.5,1.7], pos: [0,1.6,-0.55], color: "faction" },
      { shape: "box", size: [2.2,0.04,0.03], pos: [0,1.28,0.26], color: "glow" },
      { shape: "bevel", size: [1.1,0.8,0.1], pos: [0,0.66,0.27], bevel: 0.03, color: "black" },
      { shape: "box", size: [1.0,0.04,0.04], pos: [0,0.45,0.32], color: "dark" },
      { shape: "box", size: [1.0,0.04,0.04], pos: [0,0.65,0.32], color: "dark" },
      { shape: "box", size: [1.0,0.04,0.04], pos: [0,0.85,0.32], color: "dark" },
      { shape: "box", size: [1.1,0.1,0.1], pos: [0,1.1,0.3], color: "hazard" },
      // silos
      { shape: "cylinder", sides: 8, radius: 0.38, height: 1.5, pos: [0.9,1.0,0.85], color: "light", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.12, pos: [0.9,0.6,0.85], color: "dark", mirror: true },
      { shape: "cylinder", sides: 8, radius: 0.4, height: 0.05, pos: [0.9,1.3,0.85], color: "glow", mirror: true },
      { shape: "cone", sides: 8, radius: 0.4, height: 0.35, pos: [0.9,1.93,0.85], color: "faction", mirror: true },
      { shape: "box", size: [0.08,0.06,0.03], pos: [0.9,0.85,1.24], color: "amber", mirror: true },
      // caisses
      { shape: "bevel", size: [0.45,0.3,0.45], pos: [0,0.4,0.95], color: "metal" },
      { shape: "box", size: [0.3,0.06,0.3], pos: [0,0.58,0.95], color: "hazard" },
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
  splitter: {
    parts: [
      { shape: "box", size: [0.95,0.12,0.95], pos: [0,0.06,0], color: "metal" },
      { shape: "box", size: [0.7,0.2,0.7], pos: [0,0.2,0], color: "faction" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [0,0.33,0.3], color: "glow" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [-0.3,0.33,0], rot: [0,-90,0], color: "glow" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [0.3,0.33,0], rot: [0,90,0], color: "glow" },
      { shape: "box", size: [0.08,0.18,0.95], pos: [0.47,0.1,0], color: "light", mirror: true },
    ],
  },
  // splitter_n2 : répartiteur réglé « gauche et avant » (flèche de droite éteinte)
  splitter_n2: {
    parts: [
      { shape: "box", size: [0.95,0.12,0.95], pos: [0,0.06,0], color: "metal" },
      { shape: "box", size: [0.7,0.2,0.7], pos: [0,0.2,0], color: "faction" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [0,0.33,0.3], color: "glow" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [-0.3,0.33,0], rot: [0,-90,0], color: "glow" },
      { shape: "box", size: [0.06,0.05,0.24], pos: [0.3,0.32,0], color: "dark" },
      { shape: "box", size: [0.08,0.18,0.95], pos: [0.47,0.1,0], color: "light", mirror: true },
    ],
  },
  // splitter_n3 : répartiteur réglé « droite et avant » (flèche de gauche éteinte)
  splitter_n3: {
    parts: [
      { shape: "box", size: [0.95,0.12,0.95], pos: [0,0.06,0], color: "metal" },
      { shape: "box", size: [0.7,0.2,0.7], pos: [0,0.2,0], color: "faction" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [0,0.33,0.3], color: "glow" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [0.3,0.33,0], rot: [0,90,0], color: "glow" },
      { shape: "box", size: [0.06,0.05,0.24], pos: [-0.3,0.32,0], color: "dark" },
      { shape: "box", size: [0.08,0.18,0.95], pos: [0.47,0.1,0], color: "light", mirror: true },
    ],
  },
  // sorter : trieur (1 x 1) — entrée à l'arrière (-z), sorties : avant (+z), gauche (-x), droite (+x)
  sorter: {
    parts: [
      { shape: "box", size: [0.95,0.12,0.95], pos: [0,0.06,0], color: "metal" },
      { shape: "box", size: [0.7,0.2,0.7], pos: [0,0.2,0], color: "hazard" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [0,0.33,0.3], color: "glow" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [-0.3,0.33,0], rot: [0,-90,0], color: "glow" },
      { shape: "box", size: [0.25,0.1,0.25], pos: [0,0.36,-0.15], color: "glass" },
      { shape: "box", size: [0.08,0.18,0.95], pos: [0.47,0.1,0], color: "light", mirror: true },
    ],
  },
  // overflow : débordement (1 x 1) — entrée à l'arrière (-z), sorties : avant (+z), gauche (-x), droite (+x)
  overflow: {
    parts: [
      { shape: "box", size: [0.95,0.12,0.95], pos: [0,0.06,0], color: "metal" },
      { shape: "box", size: [0.7,0.2,0.7], pos: [0,0.2,0], color: "dark" },
      { shape: "wedge", size: [0.22,0.06,0.25], pos: [0,0.33,0.3], color: "glow" },
      { shape: "wedge", size: [0.16,0.05,0.18], pos: [-0.3,0.33,0], rot: [0,-90,0], color: "light" },
      { shape: "wedge", size: [0.16,0.05,0.18], pos: [0.3,0.33,0], rot: [0,90,0], color: "light" },
      { shape: "box", size: [0.08,0.18,0.95], pos: [0.47,0.1,0], color: "light", mirror: true },
    ],
  },
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
  // roboport : base de robots logistiques (3 x 3) — tour, aire d'appontage, antenne
  roboport: {
    parts: [
      { use: "socle", pos: [0,0,0], scale: [3,1,3] },
      { shape: "box", size: [2.4,1.2,2.4], pos: [0,0.85,0], color: "metal" },
      { shape: "box", size: [2.7,0.15,2.7], pos: [0,1.5,0], color: "faction" },
      { shape: "cylinder", sides: 8, radius: 0.8, height: 0.08, pos: [0,1.6,0], color: "dark" },
      { shape: "box", size: [0.12,0.03,0.9], pos: [0,1.66,0], color: "hazard" },
      { shape: "box", size: [0.9,0.03,0.12], pos: [0,1.66,0], color: "hazard" },
      { shape: "box", size: [0.15,0.15,0.15], pos: [1.2,1.62,1.2], color: "glow", mirror: true },
      { shape: "box", size: [0.15,0.15,0.15], pos: [1.2,1.62,-1.2], color: "glow", mirror: true },
      { shape: "cylinder", sides: 6, radius: 0.06, height: 1.2, pos: [-1.0,2.2,-1.0], color: "light" },
      { shape: "sphere", radius: 0.14, pos: [-1.0,2.85,-1.0], color: "glow" },
    ],
  },
};
